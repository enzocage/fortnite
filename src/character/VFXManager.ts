import * as THREE from 'three';
import type { AmmoType, BiomeType, BuildPieceType, MaterialType, Vec3Like, WeaponId } from '../types';
import { EventBus, MATERIAL_STATS, WEAPONS, clamp } from '../core';

type ImpactMaterial =
  | 'wood'
  | 'brick'
  | 'metal'
  | 'dirt'
  | 'shield'
  | 'flesh'
  | 'shield_break';

export function getBiomeDustColors(biome: BiomeType): [string, string] {
  switch (biome) {
    case 'ocean':
      return ['#bae6fd', '#38bdf8'];
    case 'beach':
      return ['#fde68a', '#f59e0b'];
    case 'grassland':
      return ['#a16207', '#84cc16'];
    case 'forest':
      return ['#78350f', '#4d7c0f'];
    case 'highland':
      return ['#94a3b8', '#78716c'];
    case 'urban':
      return ['#cbd5e1', '#64748b'];
    case 'snow':
      return ['#f8fafc', '#bae6fd'];
    case 'desert':
      return ['#ea580c', '#fbbf24'];
    case 'volcanic':
      return ['#57534e', '#f97316'];
    case 'cyber':
      return ['#22d3ee', '#a855f7'];
  }
}

interface TracerSlot {
  active: boolean;
  age: number;
  duration: number;
  width: number;
  length: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface MuzzleSlot {
  active: boolean;
  age: number;
  duration: number;
  baseScale: number;
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
}

interface CasingSlot {
  active: boolean;
  age: number;
  duration: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface BurstSlot {
  active: boolean;
  age: number;
  duration: number;
  gravity: number;
  drag: number;
  useRing: boolean;
  ringStartScale: number;
  ringEndScale: number;
  group: THREE.Group;
  ringMesh: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  particles: BurstParticle[];
}

interface ShieldShard {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  baseScale: number;
}

interface ShieldBreakSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  innerRingMesh: THREE.Mesh;
  innerRingMat: THREE.MeshBasicMaterial;
  flashMesh: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
  shards: ShieldShard[];
}

interface ExplosionEmber {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface ExplosionSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  outerMesh: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  smokeMesh: THREE.Mesh;
  smokeMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  embers: ExplosionEmber[];
}

interface ShockwaveSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  violetRingMesh: THREE.Mesh;
  violetRingMat: THREE.MeshBasicMaterial;
  cyanRingMesh: THREE.Mesh;
  cyanRingMat: THREE.MeshBasicMaterial;
  tiltRingMesh: THREE.Mesh;
  tiltRingMat: THREE.MeshBasicMaterial;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
}

interface SplashSparkle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface SplashHealSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  sparkles: SplashSparkle[];
}

interface SlideDustPuff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface SlideDustSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  puffs: SlideDustPuff[];
}

interface EliminationVoxel {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spinSpeed: number;
  delay: number;
  baseScale: number;
}

interface EliminationSlot {
  active: boolean;
  age: number;
  duration: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  group: THREE.Group;
  droneGroup: THREE.Group;
  rotors: THREE.Mesh[];
  beamMesh: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  voxels: EliminationVoxel[];
}

interface WeakpointSlot {
  active: boolean;
  propId: string;
  age: number;
  group: THREE.Group;
  spinnerGroup: THREE.Group;
}

const TRACER_POOL_SIZE = 48;
const MUZZLE_POOL_SIZE = 24;
const CASING_POOL_SIZE = 40;
const BURST_POOL_SIZE = 40;
const BURST_PARTICLE_COUNT = 12;
const SHIELD_BREAK_POOL_SIZE = 8;
const SHIELD_BREAK_SHARD_COUNT = 18;
const EXPLOSION_POOL_SIZE = 12;
const EXPLOSION_EMBER_COUNT = 10;
const SHOCKWAVE_POOL_SIZE = 8;
const SPLASH_HEAL_POOL_SIZE = 10;
const SPLASH_SPARKLE_COUNT = 16;
const SLIDE_DUST_POOL_SIZE = 24;
const SLIDE_DUST_PARTICLE_COUNT = 8;
const ELIMINATION_POOL_SIZE = 10;
const ELIMINATION_VOXEL_COUNT = 18;
const WEAKPOINT_POOL_SIZE = 8;

/**
 * Pooled 3D VFX manager subscribed to EventBus vfx:* channels.
 * Avoids runtime geometry/material allocations and cleanly recycles/disposes all resources.
 */
export class VFXManager {
  private readonly scene: THREE.Scene;
  private readonly eventBus: EventBus;
  private readonly root: THREE.Group;
  private readonly unsubs: Array<() => void> = [];

  private readonly sharedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  private readonly unitBoxGeo: THREE.BoxGeometry;
  private readonly unitCylinderGeo: THREE.CylinderGeometry;
  private readonly unitConeGeo: THREE.ConeGeometry;
  private readonly unitSphereGeo: THREE.SphereGeometry;
  private readonly unitRingGeo: THREE.RingGeometry;
  private readonly unitCircleGeo: THREE.CircleGeometry;
  private readonly unitCrystalGeo: THREE.OctahedronGeometry;
  private readonly unitPlaneGeo: THREE.PlaneGeometry;
  private readonly casingGeo: THREE.CylinderGeometry;
  private readonly droneBodyGeo: THREE.BoxGeometry;
  private readonly droneRotorGeo: THREE.TorusGeometry;
  private readonly beamCylGeo: THREE.CylinderGeometry;

  private readonly tracers: TracerSlot[] = [];
  private readonly muzzles: MuzzleSlot[] = [];
  private readonly casings: CasingSlot[] = [];
  private readonly bursts: BurstSlot[] = [];
  private readonly shieldBreaks: ShieldBreakSlot[] = [];
  private readonly explosions: ExplosionSlot[] = [];
  private readonly shockwaves: ShockwaveSlot[] = [];
  private readonly splashHeals: SplashHealSlot[] = [];
  private readonly slideDusts: SlideDustSlot[] = [];
  private readonly eliminations: EliminationSlot[] = [];
  private readonly weakpoints: WeakpointSlot[] = [];

  private tracerCursor = 0;
  private muzzleCursor = 0;
  private casingCursor = 0;
  private burstCursor = 0;
  private shieldBreakCursor = 0;
  private explosionCursor = 0;
  private shockwaveCursor = 0;
  private splashHealCursor = 0;
  private slideDustCursor = 0;
  private eliminationCursor = 0;
  private rngSeed = 918273;
  private disposed = false;

  // Reusable scratch math objects (zero allocations in update/handlers)
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, eventBus: EventBus) {
    this.scene = scene;
    this.eventBus = eventBus;

    this.root = new THREE.Group();
    this.root.name = 'vfx_root';
    this.scene.add(this.root);

    this.unitBoxGeo = this.trackGeo(new THREE.BoxGeometry(1, 1, 1));
    this.unitCylinderGeo = this.trackGeo(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    this.unitConeGeo = this.trackGeo(new THREE.ConeGeometry(0.5, 1, 8));
    this.unitSphereGeo = this.trackGeo(new THREE.SphereGeometry(0.5, 10, 8));
    this.unitRingGeo = this.trackGeo(new THREE.RingGeometry(0.65, 1.0, 20));
    this.unitCircleGeo = this.trackGeo(new THREE.CircleGeometry(0.5, 20));
    this.unitCrystalGeo = this.trackGeo(new THREE.OctahedronGeometry(0.5, 0));
    this.unitPlaneGeo = this.trackGeo(new THREE.PlaneGeometry(1, 1));
    this.casingGeo = this.trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.048, 8));
    this.droneBodyGeo = this.trackGeo(new THREE.BoxGeometry(0.52, 0.16, 0.42));
    this.droneRotorGeo = this.trackGeo(new THREE.TorusGeometry(0.14, 0.022, 6, 12));
    this.beamCylGeo = this.trackGeo(new THREE.CylinderGeometry(0.42, 0.68, 1, 12, 1, true));

    this.initPools();
    this.subscribeEvents();
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.sharedGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private nextRand(): number {
    this.rngSeed = (this.rngSeed * 1664525 + 1013904223) >>> 0;
    return this.rngSeed / 4294967296;
  }

  private initPools(): void {
    // 1. Tracers
    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
      const material = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffe066,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const mesh = new THREE.Mesh(this.unitCylinderGeo, material);
      mesh.visible = false;
      this.root.add(mesh);
      this.tracers.push({
        active: false,
        age: 0,
        duration: 0.1,
        width: 0.04,
        length: 1,
        mesh,
        material,
      });
    }

    // 2. Muzzle flashes
    for (let i = 0; i < MUZZLE_POOL_SIZE; i++) {
      const material = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffd166,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      const group = new THREE.Group();
      group.visible = false;

      const core = new THREE.Mesh(this.unitSphereGeo, material);
      core.scale.setScalar(0.24);
      group.add(core);

      for (let f = 0; f < 3; f++) {
        const fin = new THREE.Mesh(this.unitPlaneGeo, material);
        fin.scale.set(0.46, 0.16, 1);
        fin.rotation.z = (f * Math.PI) / 3;
        group.add(fin);
      }

      const spike = new THREE.Mesh(this.unitConeGeo, material);
      spike.rotation.x = Math.PI / 2;
      spike.position.z = 0.22;
      spike.scale.set(0.18, 0.45, 0.18);
      group.add(spike);

      this.root.add(group);
      this.muzzles.push({
        active: false,
        age: 0,
        duration: 0.065,
        baseScale: 1,
        group,
        material,
      });
    }

    // 3. Spinning Brass Bullet Casings / Shotgun Shells
    for (let i = 0; i < CASING_POOL_SIZE; i++) {
      const material = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          roughness: 0.25,
          metalness: 0.85,
          transparent: true,
          opacity: 1,
        }),
      );
      const mesh = new THREE.Mesh(this.casingGeo, material);
      mesh.visible = false;
      this.root.add(mesh);
      this.casings.push({
        active: false,
        age: 0,
        duration: 0.55,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        mesh,
        material,
      });
    }

    // 4. Impact / Build Pop / Chest Open Bursts
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const ringMaterial = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMaterial);
      group.add(ringMesh);

      const particles: BurstParticle[] = [];
      for (let p = 0; p < BURST_PARTICLE_COUNT; p++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1,
          }),
        );
        const geo = p % 2 === 0 ? this.unitBoxGeo : this.unitCrystalGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        particles.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.08,
        });
      }

      this.root.add(group);
      this.bursts.push({
        active: false,
        age: 0,
        duration: 0.4,
        gravity: 9.8,
        drag: 2.5,
        useRing: true,
        ringStartScale: 0.15,
        ringEndScale: 0.8,
        group,
        ringMesh,
        ringMaterial,
        particles,
      });
    }

    // 5. Enhanced Shield-Break Crystalline Shards
    for (let i = 0; i < SHIELD_BREAK_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const outerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerRingMesh = new THREE.Mesh(this.unitRingGeo, outerRingMat);
      group.add(outerRingMesh);

      const innerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const innerRingMesh = new THREE.Mesh(this.unitRingGeo, innerRingMat);
      innerRingMesh.rotation.x = Math.PI / 3;
      group.add(innerRingMesh);

      const flashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flashMesh = new THREE.Mesh(this.unitSphereGeo, flashMat);
      group.add(flashMesh);

      const shards: ShieldShard[] = [];
      for (let s = 0; s < SHIELD_BREAK_SHARD_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xe0f2fe : s % 2 === 0 ? 0x22d3ee : 0x38bdf8,
            transparent: true,
            opacity: 1,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        shards.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          rz: 0,
          baseScale: 0.14,
        });
      }

      this.root.add(group);
      this.shieldBreaks.push({
        active: false,
        age: 0,
        duration: 0.62,
        group,
        outerRingMesh,
        outerRingMat,
        innerRingMesh,
        innerRingMat,
        flashMesh,
        flashMat,
        shards,
      });
    }

    // 6. Rocket Explosions
    for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitSphereGeo, coreMat);
      group.add(coreMesh);

      const outerMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerMesh = new THREE.Mesh(this.unitSphereGeo, outerMat);
      group.add(outerMesh);

      const smokeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x475569,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      const smokeMesh = new THREE.Mesh(this.unitSphereGeo, smokeMat);
      group.add(smokeMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfb923c,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      group.add(ringMesh);

      const embers: ExplosionEmber[] = [];
      for (let e = 0; e < EXPLOSION_EMBER_COUNT; e++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: e % 2 === 0 ? 0xfbbf24 : 0xef4444,
            transparent: true,
            opacity: 1,
          }),
        );
        const mesh = new THREE.Mesh(this.unitBoxGeo, material);
        group.add(mesh);
        embers.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.25,
        });
      }

      this.root.add(group);
      this.explosions.push({
        active: false,
        age: 0,
        duration: 0.65,
        radius: 5,
        group,
        coreMesh,
        coreMat,
        outerMesh,
        outerMat,
        smokeMesh,
        smokeMat,
        ringMesh,
        ringMat,
        embers,
      });
    }

    // 7. Shockwave Rings + Vertical Distortion Dome
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const violetRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const violetRingMesh = new THREE.Mesh(this.unitRingGeo, violetRingMat);
      violetRingMesh.rotation.x = -Math.PI / 2;
      group.add(violetRingMesh);

      const cyanRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const cyanRingMesh = new THREE.Mesh(this.unitRingGeo, cyanRingMat);
      cyanRingMesh.rotation.x = -Math.PI / 2;
      cyanRingMesh.position.y = 0.08;
      group.add(cyanRingMesh);

      const tiltRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xc084fc,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const tiltRingMesh = new THREE.Mesh(this.unitRingGeo, tiltRingMat);
      tiltRingMesh.rotation.set(Math.PI / 4, 0, Math.PI / 6);
      group.add(tiltRingMesh);

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x8b5cf6,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

      this.root.add(group);
      this.shockwaves.push({
        active: false,
        age: 0,
        duration: 0.58,
        radius: 6,
        group,
        violetRingMesh,
        violetRingMat,
        cyanRingMesh,
        cyanRingMat,
        tiltRingMesh,
        tiltRingMat,
        domeMesh,
        domeMat,
      });
    }

    // 8. Chug Splash Heal Mist Dome + Rising Healing Sparkles
    for (let i = 0; i < SPLASH_HEAL_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x2dd4bf,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x5eead4,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      group.add(ringMesh);

      const sparkles: SplashSparkle[] = [];
      for (let s = 0; s < SPLASH_SPARKLE_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xecfeff : s % 2 === 0 ? 0x67e8f9 : 0x2dd4bf,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        const geo = s % 2 === 0 ? this.unitCrystalGeo : this.unitSphereGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        sparkles.push({
          mesh,
          material,
          angle: (s / SPLASH_SPARKLE_COUNT) * Math.PI * 2,
          radius: 0.3,
          speedY: 1.5,
          spin: 4,
          baseScale: 0.11,
        });
      }

      this.root.add(group);
      this.splashHeals.push({
        active: false,
        age: 0,
        duration: 0.85,
        radius: 4.5,
        group,
        domeMesh,
        domeMat,
        ringMesh,
        ringMat,
        sparkles,
      });
    }

    // 9. Biome-Colored Slide Dust Particles
    for (let i = 0; i < SLIDE_DUST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const puffs: SlideDustPuff[] = [];
      for (let p = 0; p < SLIDE_DUST_PARTICLE_COUNT; p++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0xd6d3d1,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
          }),
        );
        const mesh = new THREE.Mesh(this.unitSphereGeo, material);
        group.add(mesh);
        puffs.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.16,
        });
      }

      this.root.add(group);
      this.slideDusts.push({
        active: false,
        age: 0,
        duration: 0.42,
        group,
        puffs,
      });
    }

    // 10. Elimination Drone Beam-Out
    for (let i = 0; i < ELIMINATION_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const droneGroup = new THREE.Group();
      const hullMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: '#1e293b',
          roughness: 0.35,
          metalness: 0.7,
        }),
      );
      const eyeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#38bdf8',
        }),
      );
      const rotorMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#7dd3fc',
          transparent: true,
          opacity: 0.85,
        }),
      );

      const hull = new THREE.Mesh(this.droneBodyGeo, hullMat);
      droneGroup.add(hull);

      const eye = new THREE.Mesh(this.unitSphereGeo, eyeMat);
      eye.scale.setScalar(0.14);
      eye.position.set(0, -0.06, 0.20);
      droneGroup.add(eye);

      const rotors: THREE.Mesh[] = [];
      const offsets = [
        [0.26, 0.09, 0.2],
        [-0.26, 0.09, 0.2],
        [0.26, 0.09, -0.2],
        [-0.26, 0.09, -0.2],
      ];
      for (const [rx, ry, rz] of offsets) {
        const rotor = new THREE.Mesh(this.droneRotorGeo, rotorMat);
        rotor.rotation.x = Math.PI / 2;
        rotor.position.set(rx, ry, rz);
        droneGroup.add(rotor);
        rotors.push(rotor);
      }
      group.add(droneGroup);

      const beamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const beamMesh = new THREE.Mesh(this.beamCylGeo, beamMat);
      group.add(beamMesh);

      const voxels: EliminationVoxel[] = [];
      for (let v = 0; v < ELIMINATION_VOXEL_COUNT; v++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: v % 3 === 0 ? '#e0f2fe' : v % 2 === 0 ? '#38bdf8' : '#0284c7',
            transparent: true,
            opacity: 0.95,
          }),
        );
        const mesh = new THREE.Mesh(this.unitBoxGeo, material);
        group.add(mesh);
        voxels.push({
          mesh,
          material,
          angle: (v / ELIMINATION_VOXEL_COUNT) * Math.PI * 2,
          radius: 0.22 + (v % 4) * 0.09,
          speedY: 1.5 + (v % 3) * 0.45,
          spinSpeed: 3 + (v % 5),
          delay: (v % 6) * 0.07,
          baseScale: 0.10 + (v % 3) * 0.035,
        });
      }

      this.root.add(group);
      this.eliminations.push({
        active: false,
        age: 0,
        duration: 1.65,
        baseX: 0,
        baseY: 0,
        baseZ: 0,
        group,
        droneGroup,
        rotors,
        beamMesh,
        beamMat,
        voxels,
      });
    }

    // 11. Weakpoint Target Discs
    for (let i = 0; i < WEAKPOINT_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const outerMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const whiteMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#f8fafc',
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#ef4444',
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );

      const outerRing = new THREE.Mesh(this.unitRingGeo, outerMat);
      outerRing.scale.setScalar(0.32);
      group.add(outerRing);

      const midRing = new THREE.Mesh(this.unitRingGeo, whiteMat);
      midRing.scale.setScalar(0.20);
      midRing.position.z = 0.002;
      group.add(midRing);

      const bullseye = new THREE.Mesh(this.unitCircleGeo, coreMat);
      bullseye.scale.setScalar(0.18);
      bullseye.position.z = 0.004;
      group.add(bullseye);

      const spinnerGroup = new THREE.Group();
      spinnerGroup.position.z = 0.006;
      for (let t = 0; t < 4; t++) {
        const tick = new THREE.Mesh(this.unitBoxGeo, outerMat);
        const ang = (t * Math.PI) / 2;
        tick.position.set(Math.cos(ang) * 0.34, Math.sin(ang) * 0.34, 0);
        tick.rotation.z = ang;
        tick.scale.set(0.10, 0.025, 0.01);
        spinnerGroup.add(tick);
      }
      group.add(spinnerGroup);

      this.root.add(group);
      this.weakpoints.push({
        active: false,
        propId: '',
        age: 0,
        group,
        spinnerGroup,
      });
    }
  }

  private subscribeEvents(): void {
    this.unsubs.push(
      this.eventBus.on('vfx:tracer', (e) => this.spawnTracer(e.from, e.to, e.color, e.width)),
      this.eventBus.on('vfx:muzzle', (e) => this.spawnMuzzle(e.position, e.direction, e.weaponId)),
      this.eventBus.on('vfx:impact', (e) => this.spawnImpact(e.position, e.normal, e.material)),
      this.eventBus.on('vfx:explosion', (e) => this.spawnExplosion(e.position, e.radius)),
      this.eventBus.on('vfx:elimination', (e) => this.spawnElimination(e.position, e.skinColor)),
      this.eventBus.on('vfx:build_pop', (e) => this.spawnBuildPop(e.position, e.material, e.pieceType)),
      this.eventBus.on('vfx:chest_open', (e) => this.spawnChestOpen(e.position)),
      this.eventBus.on('vfx:weakpoint', (e) =>
        this.updateWeakpoint(e.propId, e.position, e.normal, e.active),
      ),
      this.eventBus.on('vfx:shockwave', (e) => this.spawnShockwave(e.position, e.radius)),
      this.eventBus.on('vfx:splash_heal', (e) => this.spawnSplashHeal(e.position, e.radius)),
      this.eventBus.on('vfx:slide_dust', (e) => this.spawnSlideDust(e.position, e.biome)),
    );
  }

  private orientToDirection(obj: THREE.Object3D, dir: Vec3Like, localForward: THREE.Vector3): void {
    this.tmpDir.set(dir.x, dir.y, dir.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.copy(localForward);
    } else {
      this.tmpDir.normalize();
    }
    this.tmpQuat.setFromUnitVectors(localForward, this.tmpDir);
    obj.quaternion.copy(this.tmpQuat);
  }

  private spawnTracer(from: Vec3Like, to: Vec3Like, color = 0xffe066, width = 0.036): void {
    if (this.disposed) return;

    const slot = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % TRACER_POOL_SIZE;

    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const len = this.tmpDir.length();
    if (len < 1e-4) return;

    this.tmpDir.divideScalar(len);
    this.tmpQuat.setFromUnitVectors(this.upAxis, this.tmpDir);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.11;
    slot.width = width;
    slot.length = len;

    slot.mesh.position.addVectors(this.tmpA, this.tmpB).multiplyScalar(0.5);
    slot.mesh.quaternion.copy(this.tmpQuat);
    slot.mesh.scale.set(width, len, width);
    slot.material.color.setHex(color);
    slot.material.opacity = 0.92;
    slot.mesh.visible = true;
  }

  private spawnMuzzle(position: Vec3Like, direction: Vec3Like, weaponId: WeaponId): void {
    if (this.disposed) return;

    const slot = this.muzzles[this.muzzleCursor];
    this.muzzleCursor = (this.muzzleCursor + 1) % MUZZLE_POOL_SIZE;

    let scale = 1.0;
    let color = 0xffd166;
    if (weaponId === 'rocket_launcher') {
      scale = 1.85;
      color = 0xf97316;
    } else if (weaponId === 'heavy_shotgun') {
      scale = 1.55;
      color = 0xf59e0b;
    } else if (weaponId === 'pump_shotgun' || weaponId === 'tac_shotgun') {
      scale = 1.45;
      color = 0xfbbf24;
    } else if (weaponId === 'sniper') {
      scale = 1.5;
      color = 0x93c5fd;
    } else if (weaponId === 'mythic_blade_rifle') {
      scale = 1.35;
      color = 0x22d3ee;
    } else if (weaponId === 'smg' || weaponId === 'pistol') {
      scale = 0.78;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.065;
    slot.baseScale = scale;

    slot.group.position.set(position.x, position.y, position.z);
    this.orientToDirection(slot.group, direction, this.zAxis);
    slot.group.rotateZ(this.nextRand() * Math.PI);
    slot.group.scale.setScalar(scale);
    slot.material.color.setHex(color);
    slot.material.opacity = 0.95;
    slot.group.visible = true;

    // Eject spinning brass casing or shotgun shell for bullet/shell firearms
    const ammoType = WEAPONS[weaponId]?.ammoType;
    if (
      ammoType === 'light' ||
      ammoType === 'medium' ||
      ammoType === 'heavy' ||
      ammoType === 'shells'
    ) {
      this.spawnCasing(position, direction, ammoType);
    }
  }

  private spawnCasing(position: Vec3Like, direction: Vec3Like, ammoType: AmmoType): void {
    const slot = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % CASING_POOL_SIZE;

    this.tmpDir.set(direction.x, direction.y, direction.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 0, 1);
    } else {
      this.tmpDir.normalize();
    }

    // Character's right side vector = normalize(cross(forward, up))
    this.tmpRight.crossVectors(this.tmpDir, this.upAxis);
    if (this.tmpRight.lengthSq() < 1e-6) {
      this.tmpRight.set(-1, 0, 0);
    } else {
      this.tmpRight.normalize();
    }

    const isShell = ammoType === 'shells';
    const isHeavy = ammoType === 'heavy';
    const isLight = ammoType === 'light';

    const scaleXZ = isShell ? 1.45 : isHeavy ? 1.4 : isLight ? 0.85 : 1.0;
    const scaleY = isShell ? 1.3 : isHeavy ? 1.65 : isLight ? 0.85 : 1.0;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.56;

    // Eject slightly back from muzzle at receiver port
    slot.mesh.position.set(
      position.x - this.tmpDir.x * 0.22 + this.tmpRight.x * 0.05,
      position.y - this.tmpDir.y * 0.22 + 0.02,
      position.z - this.tmpDir.z * 0.22 + this.tmpRight.z * 0.05,
    );
    slot.mesh.rotation.set(
      this.nextRand() * Math.PI,
      this.nextRand() * Math.PI,
      this.nextRand() * Math.PI,
    );
    slot.mesh.scale.set(scaleXZ, scaleY, scaleXZ);

    const outSpeed = 2.2 + this.nextRand() * 1.4;
    const upSpeed = 2.3 + this.nextRand() * 1.3;
    const backDrift = -0.35 + (this.nextRand() - 0.5) * 0.8;

    slot.vx = this.tmpRight.x * outSpeed + this.tmpDir.x * backDrift;
    slot.vy = upSpeed;
    slot.vz = this.tmpRight.z * outSpeed + this.tmpDir.z * backDrift;
    slot.rx = (this.nextRand() > 0.5 ? 1 : -1) * (18 + this.nextRand() * 14);
    slot.ry = (this.nextRand() > 0.5 ? 1 : -1) * (16 + this.nextRand() * 14);
    slot.rz = (this.nextRand() > 0.5 ? 1 : -1) * (20 + this.nextRand() * 14);

    slot.material.color.setHex(isShell ? 0xdc2626 : 0xfbbf24);
    slot.material.metalness = isShell ? 0.35 : 0.85;
    slot.material.roughness = isShell ? 0.45 : 0.22;
    slot.material.opacity = 1;
    slot.mesh.visible = true;
  }

  private spawnImpact(position: Vec3Like, normal: Vec3Like, material: ImpactMaterial): void {
    if (this.disposed) return;

    if (material === 'shield_break') {
      this.spawnShieldBreak(position, normal);
      return;
    }

    const slot = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % BURST_POOL_SIZE;

    this.tmpDir.set(normal.x, normal.y, normal.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 1, 0);
    } else {
      this.tmpDir.normalize();
    }

    let primaryColor = '#c88a4b';
    let secondaryColor = '#fde68a';
    let ringColor = '#e2e8f0';
    let particleCount = 8;
    let speedMin = 2.0;
    let speedMax = 4.8;
    let baseScale = 0.065;
    let ringEndScale = 0.45;
    let duration = 0.38;
    let gravity = 9.5;

    switch (material) {
      case 'wood':
        primaryColor = MATERIAL_STATS.wood.color;
        secondaryColor = '#78350f';
        ringColor = '#fde68a';
        break;
      case 'brick':
        primaryColor = MATERIAL_STATS.brick.color;
        secondaryColor = '#94a3b8';
        ringColor = '#cbd5e1';
        gravity = 12.0;
        break;
      case 'metal':
        primaryColor = '#fef08a';
        secondaryColor = '#f59e0b';
        ringColor = '#ffffff';
        particleCount = 10;
        speedMin = 3.5;
        speedMax = 7.5;
        baseScale = 0.05;
        duration = 0.30;
        break;
      case 'dirt':
        primaryColor = '#854d0e';
        secondaryColor = '#65a30d';
        ringColor = '#a16207';
        break;
      case 'flesh':
        primaryColor = '#ef4444';
        secondaryColor = '#fb923c';
        ringColor = '#fca5a5';
        duration = 0.32;
        break;
      case 'shield':
        primaryColor = '#38bdf8';
        secondaryColor = '#22d3ee';
        ringColor = '#7dd3fc';
        particleCount = 10;
        ringEndScale = 0.72;
        gravity = 3.0;
        duration = 0.38;
        break;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = duration;
    slot.gravity = gravity;
    slot.drag = 2.6;
    slot.useRing = true;
    slot.ringStartScale = 0.12;
    slot.ringEndScale = ringEndScale;

    slot.group.position.set(
      position.x + this.tmpDir.x * 0.02,
      position.y + this.tmpDir.y * 0.02,
      position.z + this.tmpDir.z * 0.02,
    );
    slot.group.visible = true;

    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.ringMesh.quaternion.copy(this.tmpQuat);
    slot.ringMesh.scale.setScalar(slot.ringStartScale);
    slot.ringMaterial.color.set(ringColor);
    slot.ringMaterial.opacity = 0.9;
    slot.ringMesh.visible = true;

    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const p = slot.particles[i];
      if (i >= particleCount) {
        p.mesh.visible = false;
        continue;
      }
      const speed = speedMin + this.nextRand() * (speedMax - speedMin);
      const sx = (this.nextRand() - 0.5) * 2;
      const sy = (this.nextRand() - 0.5) * 2;
      const sz = (this.nextRand() - 0.5) * 2;
      this.tmpA.set(
        this.tmpDir.x * 0.9 + sx * 0.85,
        this.tmpDir.y * 0.9 + sy * 0.85 + 0.25,
        this.tmpDir.z * 0.9 + sz * 0.85,
      );
      if (this.tmpA.lengthSq() < 1e-6) this.tmpA.set(0, 1, 0);
      this.tmpA.normalize().multiplyScalar(speed);

      p.vx = this.tmpA.x;
      p.vy = this.tmpA.y;
      p.vz = this.tmpA.z;
      p.rx = (this.nextRand() - 0.5) * 14;
      p.ry = (this.nextRand() - 0.5) * 14;
      p.baseScale = baseScale * (0.75 + this.nextRand() * 0.55);
      p.mesh.position.set(0, 0, 0);
      p.mesh.scale.setScalar(p.baseScale);
      p.material.color.set(i % 2 === 0 ? primaryColor : secondaryColor);
      p.material.opacity = 1;
      p.mesh.visible = true;
    }
  }

  private spawnShieldBreak(position: Vec3Like, normal: Vec3Like): void {
    const slot = this.shieldBreaks[this.shieldBreakCursor];
    this.shieldBreakCursor = (this.shieldBreakCursor + 1) % SHIELD_BREAK_POOL_SIZE;

    this.tmpDir.set(normal.x, normal.y, normal.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 1, 0);
    } else {
      this.tmpDir.normalize();
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.62;

    slot.group.position.set(
      position.x + this.tmpDir.x * 0.03,
      position.y + this.tmpDir.y * 0.03,
      position.z + this.tmpDir.z * 0.03,
    );
    slot.group.visible = true;

    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.outerRingMesh.quaternion.copy(this.tmpQuat);
    slot.outerRingMesh.scale.setScalar(0.2);
    slot.outerRingMat.opacity = 0.95;

    slot.innerRingMesh.rotation.set(Math.PI / 3, this.nextRand() * Math.PI, 0);
    slot.innerRingMesh.scale.setScalar(0.15);
    slot.innerRingMat.opacity = 0.9;

    slot.flashMesh.scale.setScalar(0.35);
    slot.flashMat.opacity = 0.85;

    for (let i = 0; i < SHIELD_BREAK_SHARD_COUNT; i++) {
      const sh = slot.shards[i];
      const ang = (i / SHIELD_BREAK_SHARD_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      const elev = (this.nextRand() - 0.15) * 1.4;
      const speed = 4.0 + this.nextRand() * 5.2;

      this.tmpA.set(
        Math.cos(ang) * 0.9 + this.tmpDir.x * 0.55,
        0.35 + elev + this.tmpDir.y * 0.45,
        Math.sin(ang) * 0.9 + this.tmpDir.z * 0.55,
      );
      if (this.tmpA.lengthSq() < 1e-6) this.tmpA.set(0, 1, 0);
      this.tmpA.normalize().multiplyScalar(speed);

      sh.vx = this.tmpA.x;
      sh.vy = this.tmpA.y;
      sh.vz = this.tmpA.z;
      sh.rx = (this.nextRand() - 0.5) * 18;
      sh.ry = (this.nextRand() - 0.5) * 18;
      sh.rz = (this.nextRand() - 0.5) * 18;
      sh.baseScale = 0.11 + this.nextRand() * 0.08;

      sh.mesh.position.set(0, 0, 0);
      sh.mesh.rotation.set(this.nextRand() * 3, this.nextRand() * 3, 0);
      sh.mesh.scale.set(sh.baseScale * 0.72, sh.baseScale * 2.15, sh.baseScale * 0.55);
      sh.material.opacity = 1;
      sh.mesh.visible = true;
    }
  }

  private spawnBuildPop(
    position: Vec3Like,
    material: MaterialType,
    pieceType: BuildPieceType,
  ): void {
    if (this.disposed) return;

    const slot = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % BURST_POOL_SIZE;

    const matColor = MATERIAL_STATS[material].color;
    const popScale = pieceType === 'wall' ? 1.55 : 1.75;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.42;
    slot.gravity = 3.5;
    slot.drag = 3.2;
    slot.useRing = true;
    slot.ringStartScale = 0.35;
    slot.ringEndScale = popScale;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.ringMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.ringMesh.scale.setScalar(slot.ringStartScale);
    slot.ringMaterial.color.set(matColor);
    slot.ringMaterial.opacity = 0.85;
    slot.ringMesh.visible = true;

    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const p = slot.particles[i];
      const ang = (i / BURST_PARTICLE_COUNT) * Math.PI * 2;
      const spd = 2.6 + this.nextRand() * 2.2;
      p.vx = Math.cos(ang) * spd;
      p.vy = 1.4 + this.nextRand() * 2.2;
      p.vz = Math.sin(ang) * spd;
      p.rx = 6;
      p.ry = 8;
      p.baseScale = 0.10;
      p.mesh.position.set(0, 0, 0);
      p.mesh.scale.setScalar(p.baseScale);
      p.material.color.set(i % 2 === 0 ? matColor : '#e0f2fe');
      p.material.opacity = 0.95;
      p.mesh.visible = true;
    }
  }

  private spawnChestOpen(position: Vec3Like): void {
    if (this.disposed) return;

    const slot = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % BURST_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.78;
    slot.gravity = -1.2;
    slot.drag = 1.8;
    slot.useRing = true;
    slot.ringStartScale = 0.25;
    slot.ringEndScale = 1.85;

    slot.group.position.set(position.x, position.y + 0.35, position.z);
    slot.group.visible = true;

    slot.ringMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.ringMesh.scale.setScalar(slot.ringStartScale);
    slot.ringMaterial.color.set('#fbbf24');
    slot.ringMaterial.opacity = 0.95;
    slot.ringMesh.visible = true;

    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const p = slot.particles[i];
      const ang = (i / BURST_PARTICLE_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      const spd = 1.1 + this.nextRand() * 1.9;
      p.vx = Math.cos(ang) * spd;
      p.vy = 2.4 + this.nextRand() * 2.4;
      p.vz = Math.sin(ang) * spd;
      p.rx = 7;
      p.ry = 9;
      p.baseScale = 0.11;
      p.mesh.position.set(0, 0, 0);
      p.mesh.scale.setScalar(p.baseScale);
      p.material.color.set(i % 3 === 0 ? '#ffffff' : i % 2 === 0 ? '#fde047' : '#fbbf24');
      p.material.opacity = 1;
      p.mesh.visible = true;
    }
  }

  private spawnExplosion(position: Vec3Like, radius: number): void {
    if (this.disposed) return;

    const slot = this.explosions[this.explosionCursor];
    this.explosionCursor = (this.explosionCursor + 1) % EXPLOSION_POOL_SIZE;

    const safeRadius = Math.max(1.5, Number.isFinite(radius) ? radius : 5);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.68;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.coreMesh.scale.setScalar(0.2 * safeRadius);
    slot.coreMat.opacity = 1;
    slot.outerMesh.scale.setScalar(0.35 * safeRadius);
    slot.outerMat.opacity = 0.85;
    slot.smokeMesh.scale.setScalar(0.25 * safeRadius);
    slot.smokeMat.opacity = 0.55;
    slot.ringMesh.scale.setScalar(0.3 * safeRadius);
    slot.ringMat.opacity = 0.9;

    for (let i = 0; i < EXPLOSION_EMBER_COUNT; i++) {
      const e = slot.embers[i];
      const ang = (i / EXPLOSION_EMBER_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const hSpd = safeRadius * (1.2 + this.nextRand() * 1.4);
      e.vx = Math.cos(ang) * hSpd;
      e.vy = safeRadius * (0.9 + this.nextRand() * 1.4);
      e.vz = Math.sin(ang) * hSpd;
      e.baseScale = Math.max(0.14, safeRadius * 0.055);
      e.mesh.position.set(0, 0.1, 0);
      e.mesh.rotation.set(0, 0, 0);
      e.mesh.scale.setScalar(e.baseScale);
      e.material.opacity = 1;
    }
  }

  private spawnShockwave(position: Vec3Like, radius: number): void {
    if (this.disposed) return;

    const slot = this.shockwaves[this.shockwaveCursor];
    this.shockwaveCursor = (this.shockwaveCursor + 1) % SHOCKWAVE_POOL_SIZE;

    const safeRadius = Math.max(1.8, Number.isFinite(radius) ? radius : 6);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.58;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.08, position.z);
    slot.group.visible = true;

    slot.violetRingMesh.scale.setScalar(0.3 * safeRadius);
    slot.violetRingMat.opacity = 0.95;

    slot.cyanRingMesh.scale.setScalar(0.22 * safeRadius);
    slot.cyanRingMat.opacity = 0.92;

    slot.tiltRingMesh.rotation.set(Math.PI / 4, this.nextRand() * Math.PI, Math.PI / 6);
    slot.tiltRingMesh.scale.setScalar(0.25 * safeRadius);
    slot.tiltRingMat.opacity = 0.8;

    slot.domeMesh.scale.set(0.35 * safeRadius, 0.5 * safeRadius, 0.35 * safeRadius);
    slot.domeMat.opacity = 0.48;
  }

  private spawnSplashHeal(position: Vec3Like, radius: number): void {
    if (this.disposed) return;

    const slot = this.splashHeals[this.splashHealCursor];
    this.splashHealCursor = (this.splashHealCursor + 1) % SPLASH_HEAL_POOL_SIZE;

    const safeRadius = Math.max(1.5, Number.isFinite(radius) ? radius : 4.5);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.85;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.06, position.z);
    slot.group.visible = true;

    slot.domeMesh.scale.set(0.35 * safeRadius, 0.30 * safeRadius, 0.35 * safeRadius);
    slot.domeMat.opacity = 0.45;
    slot.ringMesh.scale.setScalar(0.32 * safeRadius);
    slot.ringMat.opacity = 0.9;

    for (let i = 0; i < SPLASH_SPARKLE_COUNT; i++) {
      const sp = slot.sparkles[i];
      sp.angle = (i / SPLASH_SPARKLE_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      sp.radius = safeRadius * (0.14 + this.nextRand() * 0.38);
      sp.speedY = 1.6 + this.nextRand() * 1.9;
      sp.spin = (this.nextRand() > 0.5 ? 1 : -1) * (3 + this.nextRand() * 4);
      sp.baseScale = 0.09 + this.nextRand() * 0.06;

      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.1 + this.nextRand() * 0.35,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 1;
      sp.mesh.visible = true;
    }
  }

  private spawnSlideDust(position: Vec3Like, biome: BiomeType): void {
    if (this.disposed) return;

    const slot = this.slideDusts[this.slideDustCursor];
    this.slideDustCursor = (this.slideDustCursor + 1) % SLIDE_DUST_POOL_SIZE;

    const [primary, secondary] = getBiomeDustColors(biome);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.42;

    slot.group.position.set(position.x, position.y + 0.08, position.z);
    slot.group.visible = true;

    for (let i = 0; i < SLIDE_DUST_PARTICLE_COUNT; i++) {
      const p = slot.puffs[i];
      const ang = (i / SLIDE_DUST_PARTICLE_COUNT) * Math.PI * 2 + this.nextRand() * 0.5;
      const spd = 0.9 + this.nextRand() * 1.6;
      p.vx = Math.cos(ang) * spd;
      p.vy = 0.85 + this.nextRand() * 1.15;
      p.vz = Math.sin(ang) * spd;
      p.rx = (this.nextRand() - 0.5) * 6;
      p.ry = (this.nextRand() - 0.5) * 6;
      p.baseScale = 0.14 + this.nextRand() * 0.10;
      p.mesh.position.set((this.nextRand() - 0.5) * 0.25, 0.02, (this.nextRand() - 0.5) * 0.25);
      p.mesh.scale.setScalar(p.baseScale);
      p.material.color.set(i % 2 === 0 ? primary : secondary);
      p.material.opacity = 0.82;
      p.mesh.visible = true;
    }
  }

  private spawnElimination(position: Vec3Like, skinColor?: string): void {
    if (this.disposed) return;

    const slot = this.eliminations[this.eliminationCursor];
    this.eliminationCursor = (this.eliminationCursor + 1) % ELIMINATION_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.65;
    slot.baseX = position.x;
    slot.baseY = position.y;
    slot.baseZ = position.z;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.droneGroup.position.set(0, 3.6, 0);
    slot.beamMesh.position.set(0, 1.25, 0);
    slot.beamMesh.scale.set(0.1, 2.5, 0.1);
    slot.beamMat.opacity = 0.45;

    for (let i = 0; i < ELIMINATION_VOXEL_COUNT; i++) {
      const v = slot.voxels[i];
      v.mesh.position.set(
        Math.cos(v.angle) * v.radius,
        0.1 + (i % 5) * 0.18,
        Math.sin(v.angle) * v.radius,
      );
      v.mesh.scale.setScalar(v.baseScale);
      v.material.opacity = 0.95;
      if (skinColor && i % 5 === 0) {
        v.material.color.set(skinColor);
      } else {
        v.material.color.set(i % 3 === 0 ? '#e0f2fe' : i % 2 === 0 ? '#38bdf8' : '#0284c7');
      }
      v.mesh.visible = true;
    }
  }

  private updateWeakpoint(
    propId: string,
    position: Vec3Like,
    normal: Vec3Like,
    active: boolean,
  ): void {
    if (this.disposed) return;

    let slot = this.weakpoints.find((w) => w.active && w.propId === propId);

    if (!active) {
      if (slot) {
        slot.active = false;
        slot.propId = '';
        slot.group.visible = false;
      }
      return;
    }

    if (!slot) {
      slot = this.weakpoints.find((w) => !w.active) ?? this.weakpoints[0];
    }

    slot.active = true;
    slot.propId = propId;
    slot.age = 0;

    this.tmpDir.set(normal.x, normal.y, normal.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 0, 1);
    } else {
      this.tmpDir.normalize();
    }

    slot.group.position.set(
      position.x + this.tmpDir.x * 0.035,
      position.y + this.tmpDir.y * 0.035,
      position.z + this.tmpDir.z * 0.035,
    );
    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.group.quaternion.copy(this.tmpQuat);
    slot.group.scale.setScalar(1);
    slot.group.visible = true;
  }

  public update(dt: number): void {
    if (this.disposed) return;
    const safeDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    if (safeDt <= 0) return;

    // 1. Tracers
    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
      const s = this.tracers[i];
      if (!s.active) continue;
      s.age += safeDt;
      const t = s.age / s.duration;
      if (t >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      const w = s.width * (1 - 0.65 * t);
      s.mesh.scale.set(w, s.length, w);
      s.material.opacity = 0.92 * (1 - t);
    }

    // 2. Muzzles
    for (let i = 0; i < MUZZLE_POOL_SIZE; i++) {
      const m = this.muzzles[i];
      if (!m.active) continue;
      m.age += safeDt;
      const t = m.age / m.duration;
      if (t >= 1) {
        m.active = false;
        m.group.visible = false;
        continue;
      }
      const sc = m.baseScale * (1 - 0.55 * t);
      m.group.scale.setScalar(sc);
      m.material.opacity = 0.95 * (1 - t);
    }

    // 3. Spinning Bullet Casings
    for (let i = 0; i < CASING_POOL_SIZE; i++) {
      const c = this.casings[i];
      if (!c.active) continue;
      c.age += safeDt;
      const t = c.age / c.duration;
      if (t >= 1) {
        c.active = false;
        c.mesh.visible = false;
        continue;
      }
      c.vy -= 14.5 * safeDt;
      c.mesh.position.x += c.vx * safeDt;
      c.mesh.position.y += c.vy * safeDt;
      c.mesh.position.z += c.vz * safeDt;
      c.mesh.rotation.x += c.rx * safeDt;
      c.mesh.rotation.y += c.ry * safeDt;
      c.mesh.rotation.z += c.rz * safeDt;
      c.material.opacity = t > 0.7 ? clamp((1 - t) / 0.3, 0, 1) : 1;
    }

    // 4. Bursts (impacts, build pops, chest open)
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      const b = this.bursts[i];
      if (!b.active) continue;
      b.age += safeDt;
      const t = b.age / b.duration;
      if (t >= 1) {
        b.active = false;
        b.group.visible = false;
        continue;
      }

      if (b.useRing) {
        const ringT = Math.min(1, t * 1.45);
        const rs = b.ringStartScale + (b.ringEndScale - b.ringStartScale) * (1 - (1 - ringT) * (1 - ringT));
        b.ringMesh.scale.setScalar(rs);
        b.ringMaterial.opacity = 0.9 * (1 - ringT);
      }

      const dampFactor = Math.exp(-b.drag * safeDt);
      for (let p = 0; p < BURST_PARTICLE_COUNT; p++) {
        const pt = b.particles[p];
        if (!pt.mesh.visible) continue;
        pt.vy -= b.gravity * safeDt;
        pt.vx *= dampFactor;
        pt.vz *= dampFactor;
        pt.mesh.position.x += pt.vx * safeDt;
        pt.mesh.position.y += pt.vy * safeDt;
        pt.mesh.position.z += pt.vz * safeDt;
        pt.mesh.rotation.x += pt.rx * safeDt;
        pt.mesh.rotation.y += pt.ry * safeDt;
        pt.mesh.scale.setScalar(pt.baseScale * (1 - 0.7 * t));
        pt.material.opacity = 1 - t;
      }
    }

    // 5. Shield-Break Crystalline Shards
    for (let i = 0; i < SHIELD_BREAK_POOL_SIZE; i++) {
      const sb = this.shieldBreaks[i];
      if (!sb.active) continue;
      sb.age += safeDt;
      const t = sb.age / sb.duration;
      if (t >= 1) {
        sb.active = false;
        sb.group.visible = false;
        continue;
      }

      const expand = 1 - (1 - Math.min(1, t * 1.8)) * (1 - Math.min(1, t * 1.8));
      const fade = 1 - t;
      sb.outerRingMesh.scale.setScalar(0.2 + 1.55 * expand);
      sb.outerRingMat.opacity = 0.95 * fade;
      sb.innerRingMesh.scale.setScalar(0.15 + 1.15 * expand);
      sb.innerRingMat.opacity = 0.85 * fade;
      sb.flashMesh.scale.setScalar(0.35 + 0.9 * expand);
      sb.flashMat.opacity = Math.max(0, 0.85 * (1 - t * 2.2));

      const dampFactor = Math.exp(-2.2 * safeDt);
      for (let s = 0; s < SHIELD_BREAK_SHARD_COUNT; s++) {
        const sh = sb.shards[s];
        sh.vy -= 6.5 * safeDt;
        sh.vx *= dampFactor;
        sh.vz *= dampFactor;
        sh.mesh.position.x += sh.vx * safeDt;
        sh.mesh.position.y += sh.vy * safeDt;
        sh.mesh.position.z += sh.vz * safeDt;
        sh.mesh.rotation.x += sh.rx * safeDt;
        sh.mesh.rotation.y += sh.ry * safeDt;
        sh.mesh.rotation.z += sh.rz * safeDt;
        const sc = sh.baseScale * (1 - 0.55 * t);
        sh.mesh.scale.set(sc * 0.72, sc * 2.15, sc * 0.55);
        sh.material.opacity = fade;
      }
    }

    // 6. Explosions
    for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
      const ex = this.explosions[i];
      if (!ex.active) continue;
      ex.age += safeDt;
      const t = ex.age / ex.duration;
      if (t >= 1) {
        ex.active = false;
        ex.group.visible = false;
        continue;
      }

      const expand = 1 - (1 - Math.min(1, t * 2.8)) * (1 - Math.min(1, t * 2.8));
      const fade = 1 - t;
      ex.coreMesh.scale.setScalar(ex.radius * 0.72 * expand);
      ex.coreMat.opacity = Math.max(0, 1 - t * 1.45);
      ex.outerMesh.scale.setScalar(ex.radius * 1.35 * expand);
      ex.outerMat.opacity = 0.8 * fade;
      ex.smokeMesh.position.y = ex.radius * 0.35 * t;
      ex.smokeMesh.scale.setScalar(ex.radius * (0.65 + 0.9 * t));
      ex.smokeMat.opacity = 0.52 * fade;
      ex.ringMesh.scale.setScalar(ex.radius * (0.4 + 1.55 * t));
      ex.ringMat.opacity = 0.85 * fade;

      for (let j = 0; j < EXPLOSION_EMBER_COUNT; j++) {
        const em = ex.embers[j];
        em.vy -= 12 * safeDt;
        em.mesh.position.x += em.vx * safeDt;
        em.mesh.position.y += em.vy * safeDt;
        em.mesh.position.z += em.vz * safeDt;
        em.mesh.rotation.x += 8 * safeDt;
        em.mesh.rotation.y += 6 * safeDt;
        em.mesh.scale.setScalar(em.baseScale * fade);
        em.material.opacity = fade;
      }
    }

    // 7. Shockwaves (expanding neon violet/cyan rings + vertical distortion dome)
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      sw.age += safeDt;
      const t = sw.age / sw.duration;
      if (t >= 1) {
        sw.active = false;
        sw.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      sw.violetRingMesh.scale.setScalar(sw.radius * (0.25 + 1.35 * easeOut));
      sw.violetRingMat.opacity = 0.95 * fade;

      sw.cyanRingMesh.scale.setScalar(sw.radius * (0.18 + 1.15 * easeOut));
      sw.cyanRingMat.opacity = 0.92 * fade;

      sw.tiltRingMesh.rotation.y += 4.5 * safeDt;
      sw.tiltRingMesh.scale.setScalar(sw.radius * (0.2 + 1.1 * easeOut));
      sw.tiltRingMat.opacity = 0.78 * fade;

      const xzScale = sw.radius * (0.35 + 1.05 * easeOut);
      const yScale = sw.radius * (0.55 + 1.45 * easeOut);
      sw.domeMesh.scale.set(xzScale, yScale, xzScale);
      sw.domeMat.opacity = 0.48 * fade * fade;
    }

    // 8. Splash Heals (turquoise mist dome + rising sparkles)
    for (let i = 0; i < SPLASH_HEAL_POOL_SIZE; i++) {
      const sh = this.splashHeals[i];
      if (!sh.active) continue;
      sh.age += safeDt;
      const t = sh.age / sh.duration;
      if (t >= 1) {
        sh.active = false;
        sh.group.visible = false;
        continue;
      }

      const expand = 1 - Math.pow(1 - Math.min(1, t * 1.6), 2);
      const fade = 1 - t;
      const domeXZ = sh.radius * (0.35 + 0.65 * expand);
      const domeY = sh.radius * (0.3 + 0.55 * expand);
      sh.domeMesh.scale.set(domeXZ, domeY, domeXZ);
      sh.domeMat.opacity = 0.45 * fade;

      sh.ringMesh.scale.setScalar(sh.radius * (0.3 + 0.9 * expand));
      sh.ringMat.opacity = 0.88 * fade;

      for (let s = 0; s < SPLASH_SPARKLE_COUNT; s++) {
        const sp = sh.sparkles[s];
        const ang = sp.angle + sh.age * sp.spin * 0.4;
        const rad = sp.radius * (1 + 0.25 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += sp.spin * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.55 * t));
        sp.material.opacity = fade;
      }
    }

    // 9. Biome-Colored Slide Dust
    for (let i = 0; i < SLIDE_DUST_POOL_SIZE; i++) {
      const sd = this.slideDusts[i];
      if (!sd.active) continue;
      sd.age += safeDt;
      const t = sd.age / sd.duration;
      if (t >= 1) {
        sd.active = false;
        sd.group.visible = false;
        continue;
      }

      const dampFactor = Math.exp(-3.4 * safeDt);
      const puffCurve = 1 + 0.6 * Math.sin(t * Math.PI);
      const fade = 1 - t;
      for (let p = 0; p < SLIDE_DUST_PARTICLE_COUNT; p++) {
        const pt = sd.puffs[p];
        pt.vy -= 2.2 * safeDt;
        pt.vx *= dampFactor;
        pt.vz *= dampFactor;
        pt.mesh.position.x += pt.vx * safeDt;
        pt.mesh.position.y += pt.vy * safeDt;
        pt.mesh.position.z += pt.vz * safeDt;
        pt.mesh.rotation.x += pt.rx * safeDt;
        pt.mesh.rotation.y += pt.ry * safeDt;
        pt.mesh.scale.setScalar(pt.baseScale * puffCurve * (1 - 0.4 * t));
        pt.material.opacity = 0.82 * fade;
      }
    }

    // 10. Elimination Drone Beam-Out
    for (let i = 0; i < ELIMINATION_POOL_SIZE; i++) {
      const el = this.eliminations[i];
      if (!el.active) continue;
      el.age += safeDt;
      const t = el.age / el.duration;
      if (t >= 1) {
        el.active = false;
        el.group.visible = false;
        continue;
      }

      let droneY = 2.45;
      let beamWidth = 1.0;
      let beamAlpha = 0.42;

      if (t < 0.15) {
        const k = t / 0.15;
        droneY = 3.6 - 1.15 * k;
        beamWidth = k;
      } else if (t > 0.78) {
        const k = (t - 0.78) / 0.22;
        droneY = 2.45 + k * k * 4.5;
        beamWidth = 1 - k;
        beamAlpha = 0.42 * (1 - k);
      } else {
        droneY = 2.45 + Math.sin(el.age * 6) * 0.08;
        beamWidth = 1 + Math.sin(el.age * 14) * 0.08;
      }

      el.droneGroup.position.y = droneY;
      el.droneGroup.rotation.y += 1.4 * safeDt;
      for (let r = 0; r < el.rotors.length; r++) {
        el.rotors[r].rotation.z += 28 * safeDt;
      }

      const beamHeight = Math.max(0.2, droneY);
      el.beamMesh.position.y = beamHeight * 0.5;
      el.beamMesh.scale.set(beamWidth, beamHeight, beamWidth);
      el.beamMat.opacity = beamAlpha;

      for (let v = 0; v < ELIMINATION_VOXEL_COUNT; v++) {
        const vx = el.voxels[v];
        const vAge = Math.max(0, el.age - vx.delay);
        const rise = vAge * vx.speedY;
        const spin = vx.angle + vAge * vx.spinSpeed;
        const lifeFrac = clamp(rise / 2.4, 0, 1);
        const rad = vx.radius * (1 - lifeFrac * 0.55);

        vx.mesh.position.set(Math.cos(spin) * rad, 0.1 + rise, Math.sin(spin) * rad);
        vx.mesh.rotation.x += 4 * safeDt;
        vx.mesh.rotation.y += 5 * safeDt;
        vx.mesh.scale.setScalar(vx.baseScale * (1 - lifeFrac * 0.75));
        vx.material.opacity = (1 - lifeFrac) * (1 - Math.max(0, (t - 0.75) * 4));
      }
    }

    // 11. Active Weakpoint Targets
    for (let i = 0; i < WEAKPOINT_POOL_SIZE; i++) {
      const wp = this.weakpoints[i];
      if (!wp.active) continue;
      wp.age += safeDt;
      wp.spinnerGroup.rotation.z += 4.2 * safeDt;
      const pulse = 1 + 0.14 * Math.sin(wp.age * 9.5);
      wp.group.scale.setScalar(pulse);
    }
  }

  public getActiveEffectCount(): number {
    let count = 0;
    for (const s of this.tracers) if (s.active) count++;
    for (const s of this.muzzles) if (s.active) count++;
    for (const s of this.casings) if (s.active) count++;
    for (const s of this.bursts) if (s.active) count++;
    for (const s of this.shieldBreaks) if (s.active) count++;
    for (const s of this.explosions) if (s.active) count++;
    for (const s of this.shockwaves) if (s.active) count++;
    for (const s of this.splashHeals) if (s.active) count++;
    for (const s of this.slideDusts) if (s.active) count++;
    for (const s of this.eliminations) if (s.active) count++;
    return count;
  }

  public getActiveWeakpointCount(): number {
    let count = 0;
    for (const w of this.weakpoints) if (w.active) count++;
    return count;
  }

  public getActiveCasingCount(): number {
    let count = 0;
    for (const c of this.casings) if (c.active) count++;
    return count;
  }

  public getActiveShockwaveCount(): number {
    let count = 0;
    for (const sw of this.shockwaves) if (sw.active) count++;
    return count;
  }

  public getActiveSplashHealCount(): number {
    let count = 0;
    for (const sh of this.splashHeals) if (sh.active) count++;
    return count;
  }

  public getActiveSlideDustCount(): number {
    let count = 0;
    for (const sd of this.slideDusts) if (sd.active) count++;
    return count;
  }

  public getActiveShieldBreakCount(): number {
    let count = 0;
    for (const sb of this.shieldBreaks) if (sb.active) count++;
    return count;
  }

  public clear(): void {
    for (const s of this.tracers) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const m of this.muzzles) {
      m.active = false;
      m.group.visible = false;
    }
    for (const c of this.casings) {
      c.active = false;
      c.mesh.visible = false;
    }
    for (const b of this.bursts) {
      b.active = false;
      b.group.visible = false;
    }
    for (const sb of this.shieldBreaks) {
      sb.active = false;
      sb.group.visible = false;
    }
    for (const e of this.explosions) {
      e.active = false;
      e.group.visible = false;
    }
    for (const sw of this.shockwaves) {
      sw.active = false;
      sw.group.visible = false;
    }
    for (const sh of this.splashHeals) {
      sh.active = false;
      sh.group.visible = false;
    }
    for (const sd of this.slideDusts) {
      sd.active = false;
      sd.group.visible = false;
    }
    for (const el of this.eliminations) {
      el.active = false;
      el.group.visible = false;
    }
    for (const wp of this.weakpoints) {
      wp.active = false;
      wp.propId = '';
      wp.group.visible = false;
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;

    this.clear();

    for (const geo of this.sharedGeometries) {
      geo.dispose();
    }
    this.sharedGeometries.length = 0;

    for (const mat of this.ownedMaterials) {
      mat.dispose();
    }
    this.ownedMaterials.length = 0;

    this.scene.remove(this.root);
  }
}
