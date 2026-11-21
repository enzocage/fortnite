import * as THREE from 'three';
import {
  ISLAND_RADIUS,
  POIS,
  WATER_LEVEL,
  WORLD_HALF,
  WORLD_SIZE,
  clamp,
  fbm2D,
  lerp,
  smoothstep,
} from '../core';
import type { BiomeType, POIDef, TerrainQuery, Vec3Like } from '../types';
import { TextureFactory } from './TextureFactory';

export interface BuildingFootprint {
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
}

interface RoadSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

const SEGMENTS = 160;
const STRIDE = SEGMENTS + 1;
const CELL_SIZE = WORLD_SIZE / SEGMENTS; // 5.0m

const CRYSTAL_BASIN = POIS.find((p) => p.id === 'crystal_basin')!;
const CRATER_DEPOT = POIS.find((p) => p.id === 'crater_depot')!;

// Crater pit offset inside Crater Depot so warehouses sit on flat western/northern yard
const CRATER_CENTER_X = CRATER_DEPOT.x + 22;
const CRATER_CENTER_Z = CRATER_DEPOT.z + 16;

// Road polyline segments connecting all 6 POIs cleanly on dry land
const ROAD_POLYLINES: Array<Array<[number, number]>> = [
  // Sunny Suburbs -> Metro Towers
  [
    [-165, -155],
    [-125, -110],
    [-105, -70],
    [-75, -40],
  ],
  // Metro Towers -> Crater Depot
  [
    [-75, -40],
    [-40, 30],
    [0, 90],
    [40, 125],
  ],
  // Crater Depot -> Market Row
  [
    [40, 125],
    [105, 95],
    [145, 65],
    [175, 35],
  ],
  // Market Row -> Whispering Pines
  [
    [175, 35],
    [182, -45],
    [176, -110],
    [165, -165],
  ],
  // Whispering Pines -> North Shore of Crystal Basin -> Sunny Suburbs
  [
    [165, -165],
    [100, -172],
    [35, -176],
    [-45, -172],
    [-110, -166],
    [-165, -155],
  ],
  // Metro Towers -> West/South Shore of Crystal Basin -> Market Row
  [
    [-75, -40],
    [-25, -62],
    [25, -52],
    [95, -25],
    [175, 35],
  ],
];

const ROAD_SEGMENTS: RoadSegment[] = [];
for (const line of ROAD_POLYLINES) {
  for (let i = 0; i < line.length - 1; i++) {
    ROAD_SEGMENTS.push({
      ax: line[i][0],
      az: line[i][1],
      bx: line[i + 1][0],
      bz: line[i + 1][1],
    });
  }
}

function distToSegment(px: number, pz: number, s: RoadSegment): number {
  const vx = s.bx - s.ax;
  const vz = s.bz - s.az;
  const wx = px - s.ax;
  const wz = pz - s.az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq <= 1e-6) return Math.hypot(wx, wz);
  const t = clamp((wx * vx + wz * vz) / lenSq, 0, 1);
  return Math.hypot(px - (s.ax + t * vx), pz - (s.az + t * vz));
}

export class TerrainSystem implements TerrainQuery {
  readonly seed: number;
  readonly segments = SEGMENTS;
  readonly cellSize = CELL_SIZE;

  private heights: Float32Array;
  private roadMasks: Float32Array;
  private mesh: THREE.Mesh | null = null;
  private detailTexture: THREE.CanvasTexture | null = null;
  private textureFactory: TextureFactory | null = null;
  private mapCanvas: HTMLCanvasElement | null = null;
  private buildingFootprints: BuildingFootprint[] = [];

  constructor(seed = 4201) {
    this.seed = seed;
    this.heights = new Float32Array(STRIDE * STRIDE);
    this.roadMasks = new Float32Array(STRIDE * STRIDE);
    this.generateHeightGrid();
  }

  private computeRoadFactor(x: number, z: number): number {
    let minDist = Infinity;
    for (let i = 0; i < ROAD_SEGMENTS.length; i++) {
      const d = distToSegment(x, z, ROAD_SEGMENTS[i]);
      if (d < minDist) minDist = d;
    }
    // Core asphalt 3.6m half-width, shoulder fade out to 6.2m
    return 1 - smoothstep(3.4, 6.2, minDist);
  }

  private computeCoastRadius(x: number, z: number): number {
    const r = Math.hypot(x, z);
    if (r < 1e-4) return ISLAND_RADIUS;
    const nx = x / r;
    const nz = z / r;
    const n = fbm2D(nx * 2.1, nz * 2.1, 3, 2.0, 0.5, this.seed + 7);
    // Keep outer coastline in [318, 342] so edge POIs sit safely on land while r > 345 is ocean
    return ISLAND_RADIUS - 3 + clamp(n * 15, -14, 10);
  }

  private computeRawHeight(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const coastRadius = this.computeCoastRadius(x, z);
    const shoreDist = coastRadius - r;

    // Rolling interior elevation
    const macroNoise = fbm2D(x * 0.0042, z * 0.0042, 4, 2.05, 0.5, this.seed + 13);
    const ridgeNoise = 1 - Math.abs(fbm2D(x * 0.0075, z * 0.0075, 3, 2.0, 0.5, this.seed + 37));
    const detailNoise = fbm2D(x * 0.018, z * 0.018, 2, 2.0, 0.5, this.seed + 71) * 1.4;

    // NE forest elevation boost, gentle central valley
    const neBoost = smoothstep(-60, 200, x) * smoothstep(60, -200, z) * 5.5;
    let interiorH = 11.5 + macroNoise * 7.5 + (ridgeNoise - 0.5) * 4.5 + detailNoise + neBoost;
    interiorH = Math.max(4.5, interiorH);

    // Coastal beach and ocean shelf shaping
    let h: number;
    if (shoreDist <= -26) {
      h = -6.5 + detailNoise * 0.25;
    } else if (shoreDist < 0) {
      const t = smoothstep(-26, 0, shoreDist);
      h = lerp(-6.5, WATER_LEVEL, t);
    } else if (shoreDist < 22) {
      const t = smoothstep(0, 22, shoreDist);
      h = lerp(WATER_LEVEL, Math.min(interiorH, 4.2), t);
    } else {
      const t = smoothstep(22, 60, shoreDist);
      h = lerp(Math.min(interiorH, 4.2), interiorH, t);
    }

    // Apply POI plateau shaping
    for (const poi of POIS) {
      const dx = x - poi.x;
      const dz = z - poi.z;
      const d = Math.hypot(dx, dz);

      if (poi.id === 'crystal_basin') {
        if (d < 84) {
          let basinH: number;
          if (d <= 18) {
            // Central elevated island r <= 18 at y = 2.5
            basinH = 2.5;
          } else if (d < 26) {
            basinH = lerp(2.5, -1.8, smoothstep(18, 26, d));
          } else if (d <= 44) {
            // Scenic sunken lake y ~ -1.8
            basinH = -1.8 + Math.sin(x * 0.15) * Math.cos(z * 0.15) * 0.08;
          } else if (d < 58) {
            basinH = lerp(-1.8, 2.2, smoothstep(44, 58, d));
          } else {
            const edgeBlend = smoothstep(58, 84, d);
            basinH = lerp(2.2, h, edgeBlend);
          }
          h = basinH;
        }
        continue;
      }

      const flatR = poi.radius * 0.68;
      const outerR = poi.radius * 1.15;
      if (d <= flatR) {
        h = poi.plateauY;
      } else if (d < outerR) {
        const t = smoothstep(flatR, outerR, d);
        h = lerp(poi.plateauY, h, t);
      }
    }

    // Meteorite Crater inside Crater Depot
    const craterDist = Math.hypot(x - CRATER_CENTER_X, z - CRATER_CENTER_Z);
    if (craterDist < 15.5) {
      if (craterDist <= 6.5) {
        const cup = smoothstep(0, 6.5, craterDist);
        h = lerp(CRATER_DEPOT.plateauY - 3.6, CRATER_DEPOT.plateauY - 2.2, cup);
      } else if (craterDist <= 11.5) {
        const wall = smoothstep(6.5, 11.5, craterDist);
        h = lerp(CRATER_DEPOT.plateauY - 2.2, CRATER_DEPOT.plateauY + 1.15, wall);
      } else {
        const rimOut = smoothstep(11.5, 15.5, craterDist);
        h = lerp(CRATER_DEPOT.plateauY + 1.15, h, rimOut);
      }
    }

    return h;
  }

  private generateHeightGrid(): void {
    for (let iz = 0; iz < STRIDE; iz++) {
      const z = -WORLD_HALF + iz * CELL_SIZE;
      for (let ix = 0; ix < STRIDE; ix++) {
        const x = -WORLD_HALF + ix * CELL_SIZE;
        const idx = iz * STRIDE + ix;
        this.heights[idx] = this.computeRawHeight(x, z);
        this.roadMasks[idx] = this.computeRoadFactor(x, z);
      }
    }
  }

  getHeightAt(x: number, z: number): number {
    const cx = clamp(x, -WORLD_HALF, WORLD_HALF);
    const cz = clamp(z, -WORLD_HALF, WORLD_HALF);
    const gx = (cx + WORLD_HALF) / CELL_SIZE;
    const gz = (cz + WORLD_HALF) / CELL_SIZE;
    const ix = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(gx)));
    const iz = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(gz)));
    const u = gx - ix;
    const v = gz - iz;

    const i00 = iz * STRIDE + ix;
    const i10 = i00 + 1;
    const i01 = i00 + STRIDE;
    const i11 = i01 + 1;

    const h00 = this.heights[i00];
    const h10 = this.heights[i10];
    const h01 = this.heights[i01];
    const h11 = this.heights[i11];

    if (u + v <= 1) {
      return h00 * (1 - u - v) + h10 * u + h01 * v;
    }
    return h10 * (1 - v) + h01 * (1 - u) + h11 * (u + v - 1);
  }

  getNormalAt(x: number, z: number): Vec3Like {
    const cx = clamp(x, -WORLD_HALF, WORLD_HALF);
    const cz = clamp(z, -WORLD_HALF, WORLD_HALF);
    const gx = (cx + WORLD_HALF) / CELL_SIZE;
    const gz = (cz + WORLD_HALF) / CELL_SIZE;
    const ix = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(gx)));
    const iz = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(gz)));
    const u = gx - ix;
    const v = gz - iz;

    const i00 = iz * STRIDE + ix;
    const i10 = i00 + 1;
    const i01 = i00 + STRIDE;
    const i11 = i01 + 1;

    const h00 = this.heights[i00];
    const h10 = this.heights[i10];
    const h01 = this.heights[i01];
    const h11 = this.heights[i11];

    let nx: number;
    let nz: number;
    if (u + v <= 1) {
      nx = -(h10 - h00) / CELL_SIZE;
      nz = -(h01 - h00) / CELL_SIZE;
    } else {
      nx = -(h11 - h01) / CELL_SIZE;
      nz = -(h11 - h10) / CELL_SIZE;
    }

    const len = Math.hypot(nx, 1, nz);
    return {
      x: nx / len,
      y: 1 / len,
      z: nz / len,
    };
  }

  isWater(x: number, z: number): boolean {
    return this.getHeightAt(x, z) <= WATER_LEVEL;
  }

  getBiomeAt(x: number, z: number): BiomeType {
    const h = this.getHeightAt(x, z);
    const r = Math.hypot(x, z);

    if (h <= WATER_LEVEL) {
      const basinDist = Math.hypot(x - CRYSTAL_BASIN.x, z - CRYSTAL_BASIN.z);
      return basinDist < CRYSTAL_BASIN.radius ? 'grassland' : 'ocean';
    }

    if (h < 2.4 && r > ISLAND_RADIUS - 65) {
      return 'beach';
    }

    for (const poi of POIS) {
      if (Math.hypot(x - poi.x, z - poi.z) <= poi.radius) {
        return poi.biome;
      }
    }

    // Organic northeast pine forest biome surrounding Whispering Pines
    if (Math.hypot((x - 155) * 0.85, (z + 150) * 0.95) < 128) {
      return 'forest';
    }

    if (h >= 15.5) {
      return 'highland';
    }

    return 'grassland';
  }

  getPOIs(): POIDef[] {
    return POIS.map((p) => ({ ...p }));
  }

  setBuildingFootprints(footprints: BuildingFootprint[]): void {
    this.buildingFootprints = footprints.map((f) => ({ ...f }));
    this.mapCanvas = null;
  }

  private getRoadMaskAt(x: number, z: number): number {
    const cx = clamp(x, -WORLD_HALF, WORLD_HALF);
    const cz = clamp(z, -WORLD_HALF, WORLD_HALF);
    const gx = (cx + WORLD_HALF) / CELL_SIZE;
    const gz = (cz + WORLD_HALF) / CELL_SIZE;
    const ix = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(gx)));
    const iz = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(gz)));
    const u = gx - ix;
    const v = gz - iz;
    const i00 = iz * STRIDE + ix;
    const r00 = this.roadMasks[i00];
    const r10 = this.roadMasks[i00 + 1];
    const r01 = this.roadMasks[i00 + STRIDE];
    const r11 = this.roadMasks[i00 + STRIDE + 1];
    return lerp(lerp(r00, r10, u), lerp(r01, r11, u), v);
  }

  private computeSurfaceHexAndLinear(
    x: number,
    z: number,
    h: number,
    slopeY: number,
    road: number,
    outColor: THREE.Color,
  ): void {
    const r = Math.hypot(x, z);
    const basinDist = Math.hypot(x - CRYSTAL_BASIN.x, z - CRYSTAL_BASIN.z);
    const patch = fbm2D(x * 0.025, z * 0.025, 2, 2.0, 0.5, this.seed + 199);

    if (h < -0.25) {
      if (basinDist < 62) {
        outColor.set('#2894a8');
      } else {
        const depthT = clamp((-h - 0.25) / 5.5, 0, 1);
        outColor.set('#2588a6').lerp(new THREE.Color('#134670'), depthT);
      }
      return;
    }

    // Coastal beach or lake shoreline sand
    const isOuterShore = r > ISLAND_RADIUS - 58 && h < 3.4;
    const isBasinShore = basinDist < 58 && basinDist > 16 && h < 1.3;
    if (isOuterShore || isBasinShore) {
      const sandEdge = isOuterShore
        ? smoothstep(2.0, 3.4, h)
        : smoothstep(0.4, 1.3, h);
      const sandCol = new THREE.Color('#f2d48c');
      const grassCol = new THREE.Color('#47c74a');
      outColor.copy(sandCol).lerp(grassCol, sandEdge);
    } else {
      const biome = this.getBiomeAt(x, z);
      if (biome === 'forest') {
        outColor.set(patch > 0 ? '#2b823f' : '#246f36');
      } else if (biome === 'highland') {
        outColor.set(patch > 0.1 ? '#7c8568' : '#647858');
      } else if (biome === 'urban') {
        outColor.set('#626d7a');
      } else {
        outColor.set(patch > 0.05 ? '#52cf50' : '#3fb848');
      }

      // Steep slopes transition to stylized cliff grey-brown
      if (slopeY < 0.88) {
        const cliffT = smoothstep(0.88, 0.7, slopeY);
        outColor.lerp(new THREE.Color('#776e67'), cliffT);
      }
    }

    // Crater Depot crater dark scorch tint
    const craterDist = Math.hypot(x - CRATER_CENTER_X, z - CRATER_CENTER_Z);
    if (craterDist < 13) {
      const scorch = 1 - smoothstep(4, 13, craterDist);
      outColor.lerp(new THREE.Color('#493e4f'), scorch * 0.78);
    }

    // Road asphalt blend on dry terrain
    if (road > 0.05 && h > 0.35) {
      outColor.lerp(new THREE.Color('#3b414c'), road * 0.92);
    }
  }

  getMesh(): THREE.Mesh {
    if (this.mesh) return this.mesh;

    const vertexCount = STRIDE * STRIDE;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const colors = new Float32Array(vertexCount * 3);

    const tmpColor = new THREE.Color();

    for (let iz = 0; iz < STRIDE; iz++) {
      const z = -WORLD_HALF + iz * CELL_SIZE;
      for (let ix = 0; ix < STRIDE; ix++) {
        const x = -WORLD_HALF + ix * CELL_SIZE;
        const idx = iz * STRIDE + ix;
        const h = this.heights[idx];

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = h;
        positions[idx * 3 + 2] = z;

        uvs[idx * 2] = (ix / SEGMENTS) * 44;
        uvs[idx * 2 + 1] = (iz / SEGMENTS) * 44;

        const normal = this.getNormalAt(x, z);
        this.computeSurfaceHexAndLinear(
          x,
          z,
          h,
          normal.y,
          this.roadMasks[idx],
          tmpColor,
        );

        colors[idx * 3] = tmpColor.r;
        colors[idx * 3 + 1] = tmpColor.g;
        colors[idx * 3 + 2] = tmpColor.b;
      }
    }

    const indices: number[] = [];
    for (let iz = 0; iz < SEGMENTS; iz++) {
      for (let ix = 0; ix < SEGMENTS; ix++) {
        const i00 = iz * STRIDE + ix;
        const i10 = i00 + 1;
        const i01 = i00 + STRIDE;
        const i11 = i01 + 1;
        indices.push(i00, i01, i10, i10, i01, i11);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    this.textureFactory = new TextureFactory();
    this.detailTexture = this.textureFactory.getTerrainDetailTexture();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.detailTexture,
      roughness: 0.92,
      metalness: 0.02,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'IslandTerrain';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.mesh = mesh;
    return mesh;
  }

  getMapTextureCanvas(): HTMLCanvasElement {
    if (this.mapCanvas) return this.mapCanvas;

    const size = 512;
    if (typeof document === 'undefined') {
      return {
        width: size,
        height: size,
        getContext: () => null,
      } as unknown as HTMLCanvasElement;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.mapCanvas = canvas;
      return canvas;
    }

    const img = ctx.createImageData(size, size);
    const data = img.data;

    // Normalized NW sun direction for subtle relief hillshading
    const sunX = -0.6;
    const sunY = 0.68;
    const sunZ = -0.42;

    for (let py = 0; py < size; py++) {
      const wz = (py / (size - 1)) * WORLD_SIZE - WORLD_HALF;
      for (let px = 0; px < size; px++) {
        const wx = (px / (size - 1)) * WORLD_SIZE - WORLD_HALF;
        const h = this.getHeightAt(wx, wz);
        const offset = (py * size + px) * 4;

        let r: number;
        let g: number;
        let b: number;

        if (h <= WATER_LEVEL) {
          const basinDist = Math.hypot(wx - CRYSTAL_BASIN.x, wz - CRYSTAL_BASIN.z);
          if (basinDist < CRYSTAL_BASIN.radius) {
            r = 44;
            g = 196;
            b = 224;
          } else {
            const shallow = smoothstep(-3.8, 0, h);
            r = Math.round(lerp(15, 42, shallow));
            g = Math.round(lerp(76, 178, shallow));
            b = Math.round(lerp(136, 209, shallow));
          }
          // Crisp shoreline foam ring
          if (h > -0.25) {
            r = Math.round(lerp(r, 215, 0.5));
            g = Math.round(lerp(g, 245, 0.5));
            b = Math.round(lerp(b, 250, 0.5));
          }
        } else {
          const n = this.getNormalAt(wx, wz);
          const hillShade = clamp(
            0.78 + (n.x * sunX + n.y * sunY + n.z * sunZ) * 0.34,
            0.62,
            1.14,
          );
          const distCenter = Math.hypot(wx, wz);
          const basinDist = Math.hypot(wx - CRYSTAL_BASIN.x, wz - CRYSTAL_BASIN.z);
          const road = this.getRoadMaskAt(wx, wz);

          if ((distCenter > ISLAND_RADIUS - 55 && h < 3.0) || (basinDist < 57 && basinDist > 16 && h < 1.1)) {
            r = 240;
            g = 212;
            b = 140;
          } else {
            const biome = this.getBiomeAt(wx, wz);
            if (biome === 'forest') {
              r = 46;
              g = 136;
              b = 64;
            } else if (biome === 'highland') {
              r = 122;
              g = 132;
              b = 104;
            } else if (biome === 'urban') {
              r = 104;
              g = 114;
              b = 126;
            } else {
              r = 82;
              g = 201;
              b = 80;
            }
          }

          if (road > 0.28) {
            const rt = smoothstep(0.28, 0.72, road);
            r = Math.round(lerp(r, 64, rt));
            g = Math.round(lerp(g, 70, rt));
            b = Math.round(lerp(b, 80, rt));
          }

          r = clamp(Math.round(r * hillShade), 0, 255);
          g = clamp(Math.round(g * hillShade), 0, 255);
          b = clamp(Math.round(b * hillShade), 0, 255);
        }

        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    // Draw building footprints (real footprints if registered, or schematic POI silhouettes)
    const footprintsToDraw: BuildingFootprint[] =
      this.buildingFootprints.length > 0
        ? this.buildingFootprints
        : POIS.flatMap((p) => {
            if (p.id === 'crystal_basin') {
              return [{ x: p.x, z: p.z, w: 9, d: 9, color: '#0ea5e9' }];
            }
            const col =
              p.biome === 'urban'
                ? '#c25943'
                : p.biome === 'forest'
                  ? '#854d0e'
                  : p.biome === 'highland'
                    ? '#dc2626'
                    : '#7dd3fc';
            return [
              { x: p.x - 16, z: p.z - 16, w: 12, d: 10, color: col },
              { x: p.x + 16, z: p.z - 16, w: 12, d: 10, color: col },
              { x: p.x - 16, z: p.z + 16, w: 12, d: 10, color: col },
              { x: p.x + 16, z: p.z + 16, w: 11, d: 10, color: col },
            ];
          });

    for (const fp of footprintsToDraw) {
      const cx = ((fp.x + WORLD_HALF) / WORLD_SIZE) * size;
      const cz = ((fp.z + WORLD_HALF) / WORLD_SIZE) * size;
      const pw = Math.max(2, (fp.w / WORLD_SIZE) * size);
      const pd = Math.max(2, (fp.d / WORLD_SIZE) * size);
      ctx.fillStyle = fp.color;
      ctx.fillRect(cx - pw * 0.5, cz - pd * 0.5, pw, pd);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - pw * 0.5, cz - pd * 0.5, pw, pd);
    }

    this.mapCanvas = canvas;
    return canvas;
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (Array.isArray(this.mesh.material)) {
        for (const m of this.mesh.material) m.dispose();
      } else {
        this.mesh.material.dispose();
      }
      this.mesh = null;
    }
    this.textureFactory?.dispose();
    this.textureFactory = null;
    this.detailTexture = null;
    this.mapCanvas = null;
  }
}
