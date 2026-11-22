import * as THREE from 'three';
import { ISLAND_RADIUS, POIS, mulberry32 } from '../core';
import type {
  ColliderBox,
  GraphicsQuality,
  TerrainQuery,
} from '../types';

interface BirdEntry {
  mesh: THREE.Mesh;
  centerX: number;
  centerZ: number;
  baseY: number;
  radius: number;
  speed: number;
  phase: number;
}

export class EnvironmentDetail {
  private group = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private windShaders: THREE.ShaderMaterial[] = [];
  private windTimeUniform = { value: 0 };
  private windStrengthUniform = { value: 1.0 };
  private accumulatedTime = 0;
  private birds: BirdEntry[] = [];
  private birdGeo: THREE.BufferGeometry | null = null;
  private instancedMeshes: THREE.InstancedMesh[] = [];

  constructor(
    terrain: TerrainQuery,
    colliders: ColliderBox[],
    quality: GraphicsQuality = 'high',
    seed = 4201,
  ) {
    this.group.name = 'EnvironmentDetail';
    this.populate(terrain, colliders, quality, seed);
  }

  private getScaleForQuality(quality: GraphicsQuality): number {
    if (quality === 'low') return 0.35;
    if (quality === 'medium') return 0.65;
    return 1.0;
  }

  private isInsideGroundCollider(
    x: number,
    z: number,
    zones: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
  ): boolean {
    for (let i = 0; i < zones.length; i++) {
      const b = zones[i];
      if (x >= b.minX - 0.8 && x <= b.maxX + 0.8 && z >= b.minZ - 0.8 && z <= b.maxZ + 0.8) {
        return true;
      }
    }
    return false;
  }

  private populate(
    terrain: TerrainQuery,
    colliders: ColliderBox[],
    quality: GraphicsQuality,
    seed: number,
  ): void {
    const rand = mulberry32(seed + 888);
    const mult = this.getScaleForQuality(quality);

    const zones: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
    for (const c of colliders) {
      if (c.tag && c.tag.startsWith('building') && !c.tag.startsWith('building_sky_island')) {
        zones.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ });
      }
    }

    const grassTargets = Math.round(1800 * mult);
    const flowerTargets = Math.round(560 * mult);
    const pebbleTargets = Math.round(450 * mult);
    const desertVolcTargets = Math.round(320 * mult);
    const cyberCrystalTargets = Math.round(220 * mult);

    const grassCoords: Array<{ x: number; y: number; z: number; scale: number; yaw: number; color: THREE.Color }> = [];
    const flowerCoords: Array<{ x: number; y: number; z: number; scale: number; yaw: number; color: THREE.Color }> = [];
    const pebbleCoords: Array<{ x: number; y: number; z: number; scale: number; yaw: number; color: THREE.Color }> = [];
    const exoticCoords: Array<{ x: number; y: number; z: number; scale: number; yaw: number; color: THREE.Color }> = [];
    const cyberCoords: Array<{ x: number; y: number; z: number; scale: number; yaw: number }> = [];

    const flowerPalette = [
      new THREE.Color('#facc15'),
      new THREE.Color('#f472b6'),
      new THREE.Color('#38bdf8'),
      new THREE.Color('#ffffff'),
    ];
    const grassLight = new THREE.Color('#65e35b');
    const grassForest = new THREE.Color('#2c8d3f');
    const pebbleCol = new THREE.Color('#94a3b8');
    const snowCol = new THREE.Color('#f1f5f9');
    const desertScrub = new THREE.Color('#9ca653');
    const volcShard = new THREE.Color('#2b2129');

    let attempts = 0;
    const totalAttempts = Math.round(12000 * mult);
    while (
      attempts < totalAttempts &&
      (grassCoords.length < grassTargets ||
        flowerCoords.length < flowerTargets ||
        pebbleCoords.length < pebbleTargets ||
        desertVolcTargets > exoticCoords.length ||
        cyberCrystalTargets > cyberCoords.length)
    ) {
      attempts++;
      const angle = rand() * Math.PI * 2;
      const dist = 6 + Math.sqrt(rand()) * (ISLAND_RADIUS - 18);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (terrain.isWater(x, z)) continue;

      const y = terrain.getHeightAt(x, z);
      if (y < 0.35) continue;
      if (this.isInsideGroundCollider(x, z, zones)) continue;

      const biome = terrain.getBiomeAt(x, z);
      const yaw = rand() * Math.PI * 2;

      if (biome === 'grassland' || biome === 'forest') {
        if (grassCoords.length < grassTargets) {
          grassCoords.push({
            x,
            y,
            z,
            scale: 0.75 + rand() * 0.65,
            yaw,
            color: biome === 'forest' ? grassForest : grassLight,
          });
        } else if (flowerCoords.length < flowerTargets && rand() < 0.45) {
          flowerCoords.push({
            x,
            y,
            z,
            scale: 0.75 + rand() * 0.55,
            yaw,
            color: flowerPalette[Math.floor(rand() * flowerPalette.length)],
          });
        }
      } else if (biome === 'snow' || biome === 'highland' || biome === 'beach') {
        if (pebbleCoords.length < pebbleTargets) {
          pebbleCoords.push({
            x,
            y,
            z,
            scale: 0.7 + rand() * 0.8,
            yaw,
            color: biome === 'snow' ? snowCol : pebbleCol,
          });
        }
      } else if (biome === 'desert' || biome === 'volcanic') {
        if (exoticCoords.length < desertVolcTargets) {
          exoticCoords.push({
            x,
            y,
            z,
            scale: 0.7 + rand() * 0.85,
            yaw,
            color: biome === 'desert' ? desertScrub : volcShard,
          });
        }
      } else if (biome === 'cyber') {
        if (cyberCoords.length < cyberCrystalTargets) {
          cyberCoords.push({ x, y, z, scale: 0.65 + rand() * 0.7, yaw });
        }
      }
    }

    // 1. GPU-Instanced Wind-Swaying Grass Tufts
    if (grassCoords.length > 0) {
      const bladeGeo = new THREE.ConeGeometry(0.085, 0.44, 3);
      bladeGeo.translate(0, 0.22, 0);
      this.geometries.push(bladeGeo);

      const grassMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.85,
        metalness: 0.02,
      });
      this.applyWindSway(grassMat, 1.0);
      this.materials.push(grassMat);

      const mesh = this.createInstanced(bladeGeo, grassMat, grassCoords);
      mesh.name = 'InstancedGrass';
      this.group.add(mesh);
    }

    // 2. GPU-Instanced Wildflowers
    if (flowerCoords.length > 0) {
      const flowerGeo = new THREE.DodecahedronGeometry(0.18, 0);
      flowerGeo.translate(0, 0.26, 0);
      this.geometries.push(flowerGeo);

      const flowerMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.65,
      });
      this.applyWindSway(flowerMat, 0.72);
      this.materials.push(flowerMat);

      const mesh = this.createInstanced(flowerGeo, flowerMat, flowerCoords);
      mesh.name = 'InstancedWildflowers';
      this.group.add(mesh);
    }

    // 3. GPU-Instanced Pebbles & Snow Drift Mounds
    if (pebbleCoords.length > 0) {
      const pebGeo = new THREE.DodecahedronGeometry(0.3, 0);
      pebGeo.scale(1.2, 0.6, 1.0);
      pebGeo.translate(0, 0.14, 0);
      this.geometries.push(pebGeo);

      const pebMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.9,
      });
      this.materials.push(pebMat);

      const mesh = this.createInstanced(pebGeo, pebMat, pebbleCoords);
      this.group.add(mesh);
    }

    // 4. GPU-Instanced Desert Scrub & Volcanic Shards
    if (exoticCoords.length > 0) {
      const exGeo = new THREE.DodecahedronGeometry(0.24, 0);
      exGeo.scale(1.3, 0.65, 1.15);
      exGeo.translate(0, 0.14, 0);
      this.geometries.push(exGeo);

      const exMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.8,
      });
      this.materials.push(exMat);

      const mesh = this.createInstanced(exGeo, exMat, exoticCoords);
      this.group.add(mesh);
    }

    // 5. GPU-Instanced Glowing Cyber Flora Crystals
    if (cyberCoords.length > 0) {
      const cybGeo = new THREE.OctahedronGeometry(0.24, 0);
      cybGeo.scale(0.8, 1.8, 0.8);
      cybGeo.translate(0, 0.4, 0);
      this.geometries.push(cybGeo);

      const cybMat = new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#0ea5e9',
        emissiveIntensity: 1.15,
        roughness: 0.25,
      });
      this.materials.push(cybMat);

      const dummy = new THREE.Object3D();
      const mesh = new THREE.InstancedMesh(cybGeo, cybMat, cyberCoords.length);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      for (let i = 0; i < cyberCoords.length; i++) {
        const pt = cyberCoords[i];
        dummy.position.set(pt.x, pt.y, pt.z);
        dummy.rotation.set(0, pt.yaw, 0);
        dummy.scale.setScalar(pt.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.instancedMeshes.push(mesh);
      this.group.add(mesh);
    }

    // 6. Circling Stylized Birds soaring over iconic biomes!
    this.buildBirds(terrain, quality, rand);
  }

  private createInstanced(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    items: Array<{ x: number; y: number; z: number; scale: number; yaw: number; color: THREE.Color }>,
  ): THREE.InstancedMesh {
    const dummy = new THREE.Object3D();
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.yaw, 0);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, item.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.instancedMeshes.push(mesh);
    return mesh;
  }

  private buildBirds(
    terrain: TerrainQuery,
    quality: GraphicsQuality,
    rand: () => number,
  ): void {
    const count = quality === 'low' ? 8 : quality === 'medium' ? 16 : 24;
    const birdGeo = new THREE.BufferGeometry();
    // Crisp low-poly chevron V-wing silhouette
    const verts = new Float32Array([
      0, 0, 0.35, -0.55, 0.14, -0.2, 0, 0.04, -0.1,
      0, 0, 0.35, 0, 0.04, -0.1, 0.55, 0.14, -0.2,
    ]);
    birdGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    birdGeo.computeVertexNormals();
    this.birdGeo = birdGeo;
    this.geometries.push(birdGeo);

    const birdMat = new THREE.MeshBasicMaterial({
      color: '#f8fafc',
      side: THREE.DoubleSide,
    });
    this.materials.push(birdMat);

    const anchorPois = POIS.filter((p) =>
      p.id === 'crystal_basin' || p.id === 'whispering_pines' || p.id === 'frostpeak_citadel' || p.id === 'sunken_oasis',
    );

    for (let i = 0; i < count; i++) {
      const poi = anchorPois[i % anchorPois.length];
      const baseH = terrain.getHeightAt(poi.x, poi.z) + 28 + rand() * 18;
      const mesh = new THREE.Mesh(birdGeo, birdMat);
      this.group.add(mesh);
      this.birds.push({
        mesh,
        centerX: poi.x + (rand() - 0.5) * 18,
        centerZ: poi.z + (rand() - 0.5) * 18,
        baseY: baseH,
        radius: 18 + rand() * 26,
        speed: (0.28 + rand() * 0.25) * (rand() < 0.5 ? 1 : -1),
        phase: rand() * Math.PI * 2,
      });
    }
  }

  private applyWindSway(mat: THREE.MeshStandardMaterial, amplitudeScale = 1.0): void {
    mat.userData.windUniforms = {
      uWindTime: this.windTimeUniform,
      uWindStrength: this.windStrengthUniform,
    };
    mat.customProgramCacheKey = () => `env_wind_${amplitudeScale}`;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = this.windTimeUniform;
      shader.uniforms.uWindStrength = this.windStrengthUniform;
      this.windShaders.push({ uniforms: shader.uniforms } as unknown as THREE.ShaderMaterial);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
           float swayPhase = instanceMatrix[3].x * 0.55 + instanceMatrix[3].z * 0.35;
           #else
           float swayPhase = 0.0;
           #endif
           float wAmp = (0.06 + clamp(uWindStrength, 0.0, 4.0) * 0.075) * ${amplitudeScale.toFixed(2)};
           float swayPrimary = sin(uWindTime * 2.4 + swayPhase) * wAmp;
           float swayGust = cos(uWindTime * 4.1 + swayPhase * 1.7) * (wAmp * 0.35);
           float hFactor = max(0.0, position.y);
           transformed.x += (swayPrimary + swayGust) * hFactor;
           transformed.z += (swayPrimary * 0.5 - swayGust * 0.6) * hFactor;`,
        );
    };
  }

  getInstancedMeshCount(): number {
    return this.instancedMeshes.length;
  }

  getBirdCount(): number {
    return this.birds.length;
  }

  getWindState(): { time: number; strength: number } {
    return {
      time: this.windTimeUniform.value,
      strength: this.windStrengthUniform.value,
    };
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  update(dt: number, elapsed?: number, windStrength = 1.0): void {
    const safeDt = Math.max(0, dt);
    if (elapsed !== undefined && Number.isFinite(elapsed)) {
      this.accumulatedTime = elapsed;
    } else {
      this.accumulatedTime += safeDt;
    }
    const safeElapsed = this.accumulatedTime;
    const clampedWind = Number.isFinite(windStrength)
      ? Math.max(0, Math.min(5, windStrength))
      : 1.0;

    this.windTimeUniform.value = safeElapsed;
    this.windStrengthUniform.value = clampedWind;

    for (let i = 0; i < this.windShaders.length; i++) {
      const uniforms = this.windShaders[i].uniforms;
      if (uniforms?.uWindTime) {
        uniforms.uWindTime.value = safeElapsed;
      }
      if (uniforms?.uWindStrength) {
        uniforms.uWindStrength.value = clampedWind;
      }
    }

    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const ang = b.phase + safeElapsed * b.speed;
      const x = b.centerX + Math.cos(ang) * b.radius;
      const z = b.centerZ + Math.sin(ang) * b.radius;
      const y = b.baseY + Math.sin(safeElapsed * 1.4 + b.phase) * 1.6;
      b.mesh.position.set(x, y, z);
      b.mesh.rotation.y = b.speed > 0 ? -ang : -ang + Math.PI;
      b.mesh.rotation.z = Math.sin(safeElapsed * 8.0 + b.phase) * 0.16;
    }
  }

  dispose(): void {
    this.group.clear();
    for (const im of this.instancedMeshes) im.dispose();
    this.instancedMeshes = [];
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.windShaders = [];
    this.windTimeUniform.value = 0;
    this.windStrengthUniform.value = 1.0;
    this.accumulatedTime = 0;
    this.birds = [];
    this.birdGeo = null;
  }
}
