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

interface Segment2D {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

const SEGMENTS = 240;
const STRIDE = SEGMENTS + 1;
const CELL_SIZE = WORLD_SIZE / SEGMENTS; // ~3.333m

const CRYSTAL_BASIN = POIS.find((p) => p.id === 'crystal_basin')!;
const CRATER_DEPOT = POIS.find((p) => p.id === 'crater_depot')!;
const FROSTPEAK = POIS.find((p) => p.id === 'frostpeak_citadel')!;
const SCORCHED = POIS.find((p) => p.id === 'scorched_caldera')!;
const SUNKEN_OASIS = POIS.find((p) => p.id === 'sunken_oasis')!;
const SKYLINE = POIS.find((p) => p.id === 'skyline_spire')!;
const WHISPERING = POIS.find((p) => p.id === 'whispering_pines')!;

// Crater pit offset inside Crater Depot so warehouses sit on flat western/northern yard
const CRATER_CENTER_X = CRATER_DEPOT.x + 22;
const CRATER_CENTER_Z = CRATER_DEPOT.z + 16;

// Volcanic magma caldera pit offset inside Scorched Caldera (keeps POI center exact plateauY)
export const VOLCANO_CENTER_X = SCORCHED.x - 19;
export const VOLCANO_CENTER_Z = SCORCHED.z + 17;

// Sculpted winding River Gorge draining Crystal Basin to the Southern Ocean
export const RIVER_POLYLINE: Array<[number, number]> = [
  [44, -74],
  [70, -40],
  [92, -6],
  [102, 34],
  [104, 88],
  [98, 158],
  [94, 240],
  [90, 348],
];

const RIVER_SEGMENTS: Segment2D[] = [];
for (let i = 0; i < RIVER_POLYLINE.length - 1; i++) {
  RIVER_SEGMENTS.push({
    ax: RIVER_POLYLINE[i][0],
    az: RIVER_POLYLINE[i][1],
    bx: RIVER_POLYLINE[i + 1][0],
    bz: RIVER_POLYLINE[i + 1][1],
  });
}

// Road polyline segments connecting all 10 POIs cleanly across the island
const ROAD_POLYLINES: Array<Array<[number, number]>> = [
  // Sunny Suburbs -> Metro Towers
  [
    [-165, -155],
    [-125, -110],
    [-105, -70],
    [-75, -40],
  ],
  // Sunny Suburbs -> Frostpeak Citadel
  [
    [-165, -155],
    [-112, -206],
    [-60, -234],
    [-10, -245],
  ],
  // Frostpeak Citadel -> Whispering Pines
  [
    [-10, -245],
    [60, -226],
    [118, -196],
    [165, -165],
  ],
  // Sunny Suburbs -> Sunken Oasis -> Scorched Caldera
  [
    [-165, -155],
    [-202, -88],
    [-225, -15],
    [-208, 60],
    [-175, 125],
  ],
  // Sunken Oasis -> Metro Towers
  [
    [-225, -15],
    [-152, -28],
    [-75, -40],
  ],
  // Scorched Caldera -> Crater Depot
  [
    [-175, 125],
    [-102, 142],
    [-30, 138],
    [40, 125],
  ],
  // Metro Towers -> Crater Depot
  [
    [-75, -40],
    [-40, 30],
    [0, 90],
    [40, 125],
  ],
  // Crater Depot -> Southern River Bridge -> Skyline Spire
  [
    [40, 125],
    [76, 152],
    [118, 160],
    [160, 165],
  ],
  // Skyline Spire -> Market Row
  [
    [160, 165],
    [172, 102],
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
  // Metro Towers -> Crystal Basin South -> Northern River Bridge -> Market Row
  [
    [-75, -40],
    [-22, -56],
    [34, -44],
    [94, 8],
    [140, 24],
    [175, 35],
  ],
];

const ROAD_SEGMENTS: Segment2D[] = [];
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

function distToSegment(px: number, pz: number, s: Segment2D): number {
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
  private bumpTexture: THREE.CanvasTexture | null = null;
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
    return 1 - smoothstep(3.4, 6.0, minDist);
  }

  private distToRiver(x: number, z: number): number {
    let minDist = Infinity;
    for (let i = 0; i < RIVER_SEGMENTS.length; i++) {
      const d = distToSegment(x, z, RIVER_SEGMENTS[i]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  private computeCoastRadius(x: number, z: number): number {
    const r = Math.hypot(x, z);
    if (r < 1e-4) return ISLAND_RADIUS;
    const nx = x / r;
    const nz = z / r;
    const n = fbm2D(nx * 2.1, nz * 2.1, 3, 2.0, 0.5, this.seed + 7);
    return ISLAND_RADIUS - 3 + clamp(n * 15, -14, 10);
  }

  private computeRawHeight(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const coastRadius = this.computeCoastRadius(x, z);
    const shoreDist = coastRadius - r;

    // Multi-octave rolling interior + alpine/volcanic macro elevation
    const macroNoise = fbm2D(x * 0.0042, z * 0.0042, 4, 2.05, 0.5, this.seed + 13);
    const ridgeNoise = 1 - Math.abs(fbm2D(x * 0.0075, z * 0.0075, 3, 2.0, 0.5, this.seed + 37));
    const detailNoise = fbm2D(x * 0.022, z * 0.022, 2, 2.0, 0.5, this.seed + 71) * 1.45;

    // Scenic regional terrain massing: Frostpeak mountain in North, Pine ridge in NE, Volcano uplift in SW
    const frostDist = Math.hypot(x - FROSTPEAK.x, z - FROSTPEAK.z);
    const frostPeakMass = (1 - smoothstep(40, 128, frostDist)) * 25.0;

    const volcDist = Math.hypot(x - SCORCHED.x, z - SCORCHED.z);
    const volcMass = (1 - smoothstep(45, 112, volcDist)) * 9.5;

    const neBoost = smoothstep(-60, 200, x) * smoothstep(60, -200, z) * 5.8;

    let interiorH =
      11.0 +
      macroNoise * 7.2 +
      (ridgeNoise - 0.5) * 4.8 +
      detailNoise +
      neBoost +
      frostPeakMass +
      volcMass;
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

    // Apply all 10 POI plateau shapes cleanly
    const riverDist = this.distToRiver(x, z);
    for (const poi of POIS) {
      const dx = x - poi.x;
      const dz = z - poi.z;
      const d = Math.hypot(dx, dz);

      if (poi.id === 'crystal_basin') {
        if (d < 84) {
          let basinH: number;
          if (d <= 18) {
            basinH = 2.5;
          } else if (d < 26) {
            basinH = lerp(2.5, -1.8, smoothstep(18, 26, d));
          } else if (d <= 44) {
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

      const flatR = poi.radius * 0.7;
      const outerR = poi.radius * 1.18;
      if (d <= flatR) {
        h = poi.plateauY;
      } else if (d < outerR) {
        const t = smoothstep(flatR, outerR, d);
        h = lerp(poi.plateauY, h, t);
      }
    }

    // Carve River Gorge AFTER POI plateau skirts so the channel stays unbroken to the ocean
    if (riverDist < 12.5) {
      if (riverDist <= 4.6) {
        h = Math.min(h, -1.6 + Math.sin(x * 0.25 + z * 0.2) * 0.12);
      } else {
        const bankT = smoothstep(4.6, 12.5, riverDist);
        h = lerp(-1.6, h, bankT);
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

    // Active Volcanic Caldera Pit inside Scorched Caldera
    const calDist = Math.hypot(x - VOLCANO_CENTER_X, z - VOLCANO_CENTER_Z);
    if (calDist < 19.5) {
      if (calDist <= 10.5) {
        const cup = smoothstep(0, 10.5, calDist);
        h = lerp(SCORCHED.plateauY - 5.2, SCORCHED.plateauY - 3.8, cup);
      } else if (calDist <= 14.5) {
        const wall = smoothstep(10.5, 14.5, calDist);
        h = lerp(SCORCHED.plateauY - 3.8, SCORCHED.plateauY + 4.8, wall);
      } else {
        const rimOut = smoothstep(14.5, 19.5, calDist);
        h = lerp(SCORCHED.plateauY + 4.8, h, rimOut);
      }
    }

    // Shallow oasis lagoon basin inside Sunken Oasis SE yard
    const oasisPoolDist = Math.hypot(x - (SUNKEN_OASIS.x + 20), z - (SUNKEN_OASIS.z + 18));
    if (oasisPoolDist < 13.5) {
      const oasisFloorY = SUNKEN_OASIS.plateauY - 2.1;
      if (oasisPoolDist <= 7.5) {
        h = oasisFloorY;
      } else {
        h = lerp(oasisFloorY, h, smoothstep(7.5, 13.5, oasisPoolDist));
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
    const h = this.getHeightAt(x, z);
    if (h <= WATER_LEVEL) return true;
    const oasisDist = Math.hypot(x - (SUNKEN_OASIS.x + 20), z - (SUNKEN_OASIS.z + 18));
    return oasisDist < 10.5 && h < SUNKEN_OASIS.plateauY - 1.3;
  }

  getBiomeAt(x: number, z: number): BiomeType {
    const h = this.getHeightAt(x, z);
    const r = Math.hypot(x, z);

    if (h <= WATER_LEVEL) {
      const basinDist = Math.hypot(x - CRYSTAL_BASIN.x, z - CRYSTAL_BASIN.z);
      if (basinDist < CRYSTAL_BASIN.radius) return 'grassland';
      if (r < ISLAND_RADIUS - 12) return 'grassland';
      return 'ocean';
    }

    if (h < 2.4 && r > ISLAND_RADIUS - 65) {
      return 'beach';
    }

    // Check explicit POI radii first
    for (const poi of POIS) {
      if (Math.hypot(x - poi.x, z - poi.z) <= poi.radius) {
        return poi.biome;
      }
    }

    // Extended smooth organic regional biome zones
    if (Math.hypot((x - FROSTPEAK.x) * 0.92, z - FROSTPEAK.z) < 105) {
      return 'snow';
    }
    if (Math.hypot(x - SCORCHED.x, z - SCORCHED.z) < 95) {
      return 'volcanic';
    }
    if (Math.hypot(x - SUNKEN_OASIS.x, (z - SUNKEN_OASIS.z) * 0.9) < 92) {
      return 'desert';
    }
    if (Math.hypot(x - SKYLINE.x, z - SKYLINE.z) < 80) {
      return 'cyber';
    }
    if (Math.hypot((x - WHISPERING.x) * 0.85, (z - WHISPERING.z) * 0.95) < 126) {
      return 'forest';
    }

    if (h >= 16.0) {
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
    const patch = fbm2D(x * 0.028, z * 0.028, 2, 2.0, 0.5, this.seed + 199);

    if (h < -0.25) {
      if (basinDist < 62 || r < ISLAND_RADIUS - 15) {
        outColor.set('#2894a8');
      } else {
        const depthT = clamp((-h - 0.25) / 5.5, 0, 1);
        outColor.set('#2588a6').lerp(new THREE.Color('#134670'), depthT);
      }
      return;
    }

    const isOuterShore = r > ISLAND_RADIUS - 58 && h < 3.4;
    const isBasinShore = basinDist < 58 && basinDist > 16 && h < 1.3;
    const riverDist = this.distToRiver(x, z);
    const isRiverBank = riverDist < 8.8 && h < 2.2 && r < ISLAND_RADIUS - 12;

    if (isOuterShore || isBasinShore || isRiverBank) {
      const sandEdge = isOuterShore
        ? smoothstep(2.0, 3.4, h)
        : isRiverBank
          ? smoothstep(5.5, 8.8, riverDist)
          : smoothstep(0.4, 1.3, h);
      const sandCol = new THREE.Color('#f2d48c');
      const grassCol = new THREE.Color('#47c74a');
      outColor.copy(sandCol).lerp(grassCol, sandEdge);
    } else {
      const biome = this.getBiomeAt(x, z);
      switch (biome) {
        case 'snow':
          outColor.set(patch > 0.05 ? '#f8fafc' : '#e0f2fe');
          break;
        case 'volcanic':
          outColor.set(patch > 0.1 ? '#3b2b33' : '#261e24');
          break;
        case 'desert':
          outColor.set(patch > 0 ? '#e39053' : '#cf763e');
          break;
        case 'cyber':
          outColor.set(patch > 0 ? '#2d4c5c' : '#1f3645');
          break;
        case 'forest':
          outColor.set(patch > 0 ? '#2b823f' : '#246f36');
          break;
        case 'highland':
          outColor.set(patch > 0.1 ? '#7c8568' : '#647858');
          break;
        case 'urban':
          outColor.set('#626d7a');
          break;
        default:
          outColor.set(patch > 0.05 ? '#52cf50' : '#3fb848');
          break;
      }

      // Steep cliff strata exposure
      if (slopeY < 0.86) {
        const cliffT = smoothstep(0.86, 0.66, slopeY);
        const cliffColor =
          biome === 'snow'
            ? '#64748b'
            : biome === 'desert'
              ? '#9a4322'
              : biome === 'volcanic'
                ? '#18141c'
                : '#776e67';
        outColor.lerp(new THREE.Color(cliffColor), cliffT);
      }
    }

    // Crater Depot meteor scorch
    const craterDist = Math.hypot(x - CRATER_CENTER_X, z - CRATER_CENTER_Z);
    if (craterDist < 13) {
      const scorch = 1 - smoothstep(4, 13, craterDist);
      outColor.lerp(new THREE.Color('#493e4f'), scorch * 0.78);
    }

    // Scorched Caldera hot magma glow around lava pit center
    const calDist = Math.hypot(x - VOLCANO_CENTER_X, z - VOLCANO_CENTER_Z);
    if (calDist < 15.5) {
      const glow = 1 - smoothstep(7, 15.5, calDist);
      outColor.lerp(new THREE.Color('#ea580c'), glow * 0.65);
    }

    // Road asphalt blend on dry terrain
    if (road > 0.05 && h > 0.4) {
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

        uvs[idx * 2] = (ix / SEGMENTS) * 56;
        uvs[idx * 2 + 1] = (iz / SEGMENTS) * 56;

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
    this.bumpTexture = this.textureFactory.getBumpTexture('terrain');

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.detailTexture,
      bumpMap: this.bumpTexture,
      bumpScale: 0.24,
      roughness: 0.9,
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

    const size = 1024;
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
          const distCenter = Math.hypot(wx, wz);
          const basinDist = Math.hypot(wx - CRYSTAL_BASIN.x, wz - CRYSTAL_BASIN.z);
          if (basinDist < CRYSTAL_BASIN.radius || distCenter < ISLAND_RADIUS - 15) {
            r = 44;
            g = 196;
            b = 224;
          } else {
            const shallow = smoothstep(-3.8, 0, h);
            r = Math.round(lerp(15, 42, shallow));
            g = Math.round(lerp(76, 178, shallow));
            b = Math.round(lerp(136, 209, shallow));
          }
          if (h > -0.25) {
            r = Math.round(lerp(r, 215, 0.5));
            g = Math.round(lerp(g, 245, 0.5));
            b = Math.round(lerp(b, 250, 0.5));
          }
        } else {
          const n = this.getNormalAt(wx, wz);
          const hillShade = clamp(
            0.78 + (n.x * sunX + n.y * sunY + n.z * sunZ) * 0.36,
            0.58,
            1.16,
          );
          const distCenter = Math.hypot(wx, wz);
          const basinDist = Math.hypot(wx - CRYSTAL_BASIN.x, wz - CRYSTAL_BASIN.z);
          const road = this.getRoadMaskAt(wx, wz);
          const calDist = Math.hypot(wx - VOLCANO_CENTER_X, wz - VOLCANO_CENTER_Z);

          if (calDist < 10.2) {
            r = 249;
            g = 115;
            b = 22;
          } else if (
            (distCenter > ISLAND_RADIUS - 55 && h < 3.0) ||
            (basinDist < 57 && basinDist > 16 && h < 1.1)
          ) {
            r = 240;
            g = 212;
            b = 140;
          } else {
            const biome = this.getBiomeAt(wx, wz);
            switch (biome) {
              case 'snow':
                r = 232;
                g = 244;
                b = 252;
                break;
              case 'volcanic':
                r = 68;
                g = 52;
                b = 58;
                break;
              case 'desert':
                r = 224;
                g = 142;
                b = 84;
                break;
              case 'cyber':
                r = 48;
                g = 86;
                b = 104;
                break;
              case 'forest':
                r = 46;
                g = 136;
                b = 64;
                break;
              case 'highland':
                r = 122;
                g = 132;
                b = 104;
                break;
              case 'urban':
                r = 104;
                g = 114;
                b = 126;
                break;
              default:
                r = 82;
                g = 201;
                b = 80;
                break;
            }
          }

          if (road > 0.28 && calDist >= 10.2) {
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

    const footprintsToDraw: BuildingFootprint[] =
      this.buildingFootprints.length > 0
        ? this.buildingFootprints
        : POIS.map((p) => ({ x: p.x, z: p.z, w: 12, d: 12, color: '#94a3b8' }));

    for (const fp of footprintsToDraw) {
      const cx = ((fp.x + WORLD_HALF) / WORLD_SIZE) * size;
      const cz = ((fp.z + WORLD_HALF) / WORLD_SIZE) * size;
      const pw = Math.max(3, (fp.w / WORLD_SIZE) * size);
      const pd = Math.max(3, (fp.d / WORLD_SIZE) * size);
      ctx.fillStyle = fp.color;
      ctx.fillRect(cx - pw * 0.5, cz - pd * 0.5, pw, pd);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.lineWidth = 1.2;
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
    this.bumpTexture = null;
    this.mapCanvas = null;
  }
}
