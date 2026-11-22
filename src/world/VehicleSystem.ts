import * as THREE from 'three';
import {
  EventBus,
  WATER_LEVEL,
  WORLD_HALF,
  clamp,
  damp,
  mulberry32,
  normalizeAngle,
} from '../core';
import type {
  ColliderBox,
  TerrainQuery,
  Vec3Like,
  VehicleEntity,
  VehicleKind,
} from '../types';
import { VOLCANO_CENTER_X, VOLCANO_CENTER_Z } from './TerrainSystem';

interface VehicleSpec {
  maxHp: number;
  hoverHeight: number;
  maxSpeed: number;
  boostSpeed: number;
  reverseSpeed: number;
  accel: number;
  boostAccel: number;
  brakeDecel: number;
  turnRate: number;
  maxBankRoll: number;
  halfW: number;
  halfL: number;
  height: number;
}

const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  hover_atv: {
    maxHp: 400,
    hoverHeight: 0.78,
    maxSpeed: 23,
    boostSpeed: 34,
    reverseSpeed: 11,
    accel: 26,
    boostAccel: 46,
    brakeDecel: 34,
    turnRate: 2.35,
    maxBankRoll: 0.18,
    halfW: 1.25,
    halfL: 1.75,
    height: 1.55,
  },
  cyber_bike: {
    maxHp: 260,
    hoverHeight: 0.68,
    maxSpeed: 28,
    boostSpeed: 41,
    reverseSpeed: 12,
    accel: 32,
    boostAccel: 56,
    brakeDecel: 38,
    turnRate: 3.0,
    maxBankRoll: 0.36,
    halfW: 0.85,
    halfL: 1.65,
    height: 1.4,
  },
  speedboat: {
    maxHp: 450,
    hoverHeight: 0.12,
    maxSpeed: 29,
    boostSpeed: 42,
    reverseSpeed: 12,
    accel: 30,
    boostAccel: 52,
    brakeDecel: 32,
    turnRate: 2.5,
    maxBankRoll: 0.28,
    halfW: 1.28,
    halfL: 2.35,
    height: 1.45,
  },
};

interface DefaultVehicleSpawn {
  kind: VehicleKind;
  x: number;
  z: number;
  yaw: number;
  accentHex: string;
}

const DEFAULT_VEHICLE_SPAWNS: readonly DefaultVehicleSpawn[] = [
  // 4 Hover ATVs near POIs & roads
  { kind: 'hover_atv', x: -75, z: -10, yaw: Math.PI, accentHex: '#2563eb' }, // Metro Towers South Road
  { kind: 'hover_atv', x: -134, z: -155, yaw: -Math.PI * 0.5, accentHex: '#f97316' }, // Sunny Suburbs East Road
  { kind: 'hover_atv', x: 134, z: -168, yaw: Math.PI * 0.5, accentHex: '#10b981' }, // Whispering Pines West Road
  { kind: 'hover_atv', x: -196, z: -22, yaw: -Math.PI * 0.5, accentHex: '#eab308' }, // Sunken Oasis East Road
  // 4 Cyber Bikes near POIs & roads
  { kind: 'cyber_bike', x: 173, z: 35, yaw: Math.PI * 0.5, accentHex: '#22d3ee' }, // Market Row Plaza
  { kind: 'cyber_bike', x: 46, z: 118, yaw: 0, accentHex: '#ec4899' }, // Crater Depot Yard
  { kind: 'cyber_bike', x: 134, z: 163, yaw: Math.PI * 0.5, accentHex: '#38bdf8' }, // Skyline Spire Approach
  { kind: 'cyber_bike', x: -142, z: 134, yaw: Math.PI * 0.45, accentHex: '#facc15' }, // Scorched Caldera Road
  // 4 Speedboats moored at Crystal Basin lake, Central River, and scenic coastal coves
  { kind: 'speedboat', x: 58, z: -102, yaw: -Math.PI * 0.65, accentHex: '#0ea5e9' }, // Crystal Basin Lake
  { kind: 'speedboat', x: 103, z: 52, yaw: 0.05, accentHex: '#06b6d4' }, // Central River
  { kind: 'speedboat', x: 240, z: 240, yaw: -Math.PI * 0.75, accentHex: '#22d3ee' }, // Southeast Coastal Cove
  { kind: 'speedboat', x: -195, z: -279, yaw: Math.PI * 0.25, accentHex: '#38bdf8' }, // Northwest Coastal Cove
];

const VOLCANO_LAVA_RADIUS = 11.8;
const SPEEDBOAT_DRY_TERRAIN_SPEED_SCALE = 0.78;

interface VehicleEntry {
  data: VehicleEntity;
  group: THREE.Group;
  bodyPivot: THREE.Group;
  hoverPads: THREE.Mesh[];
  thrusterFlames: THREE.Mesh[];
  headlightMat: THREE.MeshStandardMaterial;
  hoverPadMat: THREE.MeshStandardMaterial;
  collider: ColliderBox;
  drivenThisFrame: boolean;
  boostVfxCooldown: number;
  boostSfxCooldown: number;
  wakeVfxCooldown: number;
  wakeSfxCooldown: number;
  bobPhase: number;
  lastSteer: number;
}

/**
 * Manages deterministic 3D driveable vehicles (`hover_atv`, `cyber_bike`, and amphibious `speedboat`)
 * with terrain-conforming hover/buoyancy physics, water wake emission, lava thermal boost,
 * and boost VFX emission.
 */
export class VehicleSystem {
  private terrain: TerrainQuery;
  private eventBus?: EventBus;
  private seed: number;

  private group = new THREE.Group();
  private vehiclesList: VehicleEntity[] = [];
  private vehiclesMap = new Map<string, VehicleEntry>();
  private staticColliders: ColliderBox[] = [];

  private sharedGeometries = new Map<string, THREE.BufferGeometry>();
  private sharedMaterials = new Map<string, THREE.Material>();
  private instanceMaterials: THREE.Material[] = [];

  private spawnCounter = 0;

  constructor(terrain: TerrainQuery, eventBus?: EventBus, seed = 4201) {
    this.terrain = terrain;
    this.eventBus = eventBus;
    this.seed = seed;
    this.group.name = 'VehicleSystem';
    this.spawnDefaultVehicles();
  }

  private getGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geo = this.sharedGeometries.get(key);
    if (!geo) {
      geo = factory();
      this.sharedGeometries.set(key, geo);
    }
    return geo;
  }

  private getMat(key: string, factory: () => THREE.Material): THREE.Material {
    let mat = this.sharedMaterials.get(key);
    if (!mat) {
      mat = factory();
      this.sharedMaterials.set(key, mat);
    }
    return mat;
  }

  setStaticColliders(colliders: ColliderBox[]): void {
    this.staticColliders = colliders.slice();
  }

  private spawnDefaultVehicles(): void {
    const rng = mulberry32(this.seed + 909);
    for (let i = 0; i < DEFAULT_VEHICLE_SPAWNS.length; i++) {
      const def = DEFAULT_VEHICLE_SPAWNS[i];
      const jitterYaw = (rng() - 0.5) * 0.14;
      this.createVehicle(
        `vehicle_${this.spawnCounter++}`,
        def.kind,
        def.x,
        def.z,
        def.yaw + jitterYaw,
        def.accentHex,
      );
    }
  }

  private isInVolcanoLava(x: number, z: number): boolean {
    return Math.hypot(x - VOLCANO_CENTER_X, z - VOLCANO_CENTER_Z) <= VOLCANO_LAVA_RADIUS;
  }

  private getEffectiveSurfaceY(x: number, z: number): {
    surfaceY: number;
    onWater: boolean;
    onLava: boolean;
  } {
    const terrainY = this.terrain.getHeightAt(x, z);
    if (this.isInVolcanoLava(x, z)) {
      const calderaFloor = this.terrain.getHeightAt(VOLCANO_CENTER_X, VOLCANO_CENTER_Z) + 1.5;
      return {
        surfaceY: Math.max(terrainY, calderaFloor),
        onWater: false,
        onLava: true,
      };
    }
    const onWater = this.terrain.isWater(x, z);
    return {
      surfaceY: onWater ? Math.max(WATER_LEVEL, terrainY) : terrainY,
      onWater,
      onLava: false,
    };
  }

  private createVehicle(
    id: string,
    kind: VehicleKind,
    x: number,
    z: number,
    yaw: number,
    accentOverride?: string,
  ): VehicleEntity {
    const spec = VEHICLE_SPECS[kind];
    const cx = clamp(x, -WORLD_HALF + 8, WORLD_HALF - 8);
    const cz = clamp(z, -WORLD_HALF + 8, WORLD_HALF - 8);
    const { surfaceY, onWater } = this.getEffectiveSurfaceY(cx, cz);
    const y = surfaceY + spec.hoverHeight + (kind === 'speedboat' && !onWater ? 0.16 : 0);

    const normal = onWater ? { x: 0, y: 1, z: 0 } : this.terrain.getNormalAt(cx, cz);
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const leftX = Math.cos(yaw);
    const leftZ = -Math.sin(yaw);
    const pitch = Math.asin(clamp(normal.x * fwdX + normal.z * fwdZ, -0.55, 0.55));
    const roll = -Math.asin(clamp(normal.x * leftX + normal.z * leftZ, -0.5, 0.5));

    const data: VehicleEntity = {
      id,
      kind,
      x: cx,
      y,
      z: cz,
      yaw: normalizeAngle(yaw),
      pitch,
      roll,
      vx: 0,
      vy: 0,
      vz: 0,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      boostCharge: 1.0,
      isBoosting: false,
      driverId: null,
      destroyed: false,
    };

    const accentHex =
      accentOverride ??
      (kind === 'hover_atv' ? '#38bdf8' : kind === 'cyber_bike' ? '#ec4899' : '#0ea5e9');
    const visual = this.buildVehicleMesh(kind, accentHex);
    visual.group.name = `Vehicle_${id}`;
    visual.group.rotation.order = 'YXZ';

    this.group.add(visual.group);

    const collider: ColliderBox = {
      id: `vehicle_col_${id}`,
      minX: cx - spec.halfW,
      minY: y - 0.55,
      minZ: cz - spec.halfL,
      maxX: cx + spec.halfW,
      maxY: y + spec.height,
      maxZ: cz + spec.halfL,
      material: 'metal',
      tag: `vehicle:${id}`,
    };

    const entry: VehicleEntry = {
      data,
      group: visual.group,
      bodyPivot: visual.bodyPivot,
      hoverPads: visual.hoverPads,
      thrusterFlames: visual.thrusterFlames,
      headlightMat: visual.headlightMat,
      hoverPadMat: visual.hoverPadMat,
      collider,
      drivenThisFrame: false,
      boostVfxCooldown: 0,
      boostSfxCooldown: 0,
      wakeVfxCooldown: 0,
      wakeSfxCooldown: 0,
      bobPhase: (this.vehiclesList.length * 1.37) % (Math.PI * 2),
      lastSteer: 0,
    };

    this.syncVisualAndCollider(entry, 0);
    this.vehiclesList.push(data);
    this.vehiclesMap.set(id, entry);
    return data;
  }

  private buildVehicleMesh(
    kind: VehicleKind,
    accentHex: string,
  ): {
    group: THREE.Group;
    bodyPivot: THREE.Group;
    hoverPads: THREE.Mesh[];
    thrusterFlames: THREE.Mesh[];
    headlightMat: THREE.MeshStandardMaterial;
    hoverPadMat: THREE.MeshStandardMaterial;
  } {
    const group = new THREE.Group();
    const bodyPivot = new THREE.Group();
    group.add(bodyPivot);

    const darkFrameMat = this.getMat('veh_dark_frame', () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.42,
        metalness: 0.72,
      }),
    );
    const chromeMat = this.getMat('veh_chrome', () =>
      new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.28,
        metalness: 0.85,
      }),
    );
    const seatMat = this.getMat('veh_seat', () =>
      new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.85,
        metalness: 0.1,
      }),
    );
    const bodyMat = this.getMat(`veh_body:${accentHex}`, () =>
      new THREE.MeshStandardMaterial({
        color: accentHex,
        roughness: 0.34,
        metalness: 0.45,
      }),
    );
    const goldMat = this.getMat('veh_gold_trim', () =>
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#ca8a04',
        emissiveIntensity: 0.45,
        roughness: 0.3,
        metalness: 0.6,
      }),
    );
    const windMat = this.getMat('veh_windscreen', () =>
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.78,
        roughness: 0.15,
        metalness: 0.5,
      }),
    );
    const flameMat = this.getMat('veh_thruster_flame', () =>
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.9,
      }),
    );

    const headlightMat = new THREE.MeshStandardMaterial({
      color: '#fef9c3',
      emissive: '#e0f2fe',
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    const hoverPadMat = new THREE.MeshStandardMaterial({
      color: '#22d3ee',
      emissive: '#06b6d4',
      emissiveIntensity: 1.25,
      roughness: 0.2,
      metalness: 0.3,
    });
    this.instanceMaterials.push(headlightMat, hoverPadMat);

    const hoverPads: THREE.Mesh[] = [];
    const thrusterFlames: THREE.Mesh[] = [];

    if (kind === 'hover_atv') {
      // Rugged quad-hover chassis (+Z forward)
      const chassis = new THREE.Mesh(
        this.getGeo('atv_chassis', () => new THREE.BoxGeometry(1.45, 0.48, 2.75)),
        bodyMat,
      );
      chassis.position.set(0, 0.14, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      bodyPivot.add(chassis);

      // Sloped front nose hood
      const nose = new THREE.Mesh(
        this.getGeo('atv_nose', () => new THREE.BoxGeometry(1.28, 0.36, 0.9)),
        bodyMat,
      );
      nose.position.set(0, 0.26, 1.12);
      nose.rotation.x = 0.22;
      nose.castShadow = true;
      bodyPivot.add(nose);

      // Gold front bull-bar
      const bumper = new THREE.Mesh(
        this.getGeo('atv_bumper', () => new THREE.BoxGeometry(1.56, 0.22, 0.22)),
        goldMat,
      );
      bumper.position.set(0, 0.08, 1.56);
      bodyPivot.add(bumper);

      // Saddle seat & rear cargo rack
      const seat = new THREE.Mesh(
        this.getGeo('atv_seat', () => new THREE.BoxGeometry(0.68, 0.26, 1.05)),
        seatMat,
      );
      seat.position.set(0, 0.48, -0.22);
      bodyPivot.add(seat);

      const rollBar = new THREE.Mesh(
        this.getGeo('atv_rollbar', () => new THREE.BoxGeometry(1.18, 0.56, 0.16)),
        darkFrameMat,
      );
      rollBar.position.set(0, 0.65, -1.08);
      bodyPivot.add(rollBar);

      // Handlebars & steering column
      const stem = new THREE.Mesh(
        this.getGeo('atv_stem', () => new THREE.CylinderGeometry(0.06, 0.08, 0.52, 8)),
        chromeMat,
      );
      stem.position.set(0, 0.58, 0.62);
      stem.rotation.x = -0.25;
      bodyPivot.add(stem);

      const bar = new THREE.Mesh(
        this.getGeo('atv_hbar', () => new THREE.BoxGeometry(0.95, 0.08, 0.1)),
        chromeMat,
      );
      bar.position.set(0, 0.82, 0.54);
      bodyPivot.add(bar);

      // Dual Headlights
      const hlGeo = this.getGeo('atv_hl', () => new THREE.BoxGeometry(0.28, 0.16, 0.12));
      for (const hx of [-0.42, 0.42]) {
        const hl = new THREE.Mesh(hlGeo, headlightMat);
        hl.position.set(hx, 0.26, 1.52);
        bodyPivot.add(hl);
      }

      // 4 Outrigger Hover Pods + glowing cyan/gold hover pads
      const strutGeo = this.getGeo('atv_strut', () => new THREE.BoxGeometry(0.45, 0.14, 0.24));
      const podHousingGeo = this.getGeo(
        'atv_pod',
        () => new THREE.CylinderGeometry(0.46, 0.52, 0.22, 10),
      );
      const padGlowGeo = this.getGeo(
        'atv_pad_glow',
        () => new THREE.CylinderGeometry(0.38, 0.42, 0.1, 10),
      );
      const rimRingGeo = this.getGeo(
        'atv_pad_rim',
        () => new THREE.TorusGeometry(0.44, 0.05, 6, 12),
      );
      rimRingGeo.rotateX(Math.PI * 0.5);

      for (const [px, pz] of [
        [-0.96, 1.0],
        [0.96, 1.0],
        [-0.96, -1.0],
        [0.96, -1.0],
      ]) {
        const strut = new THREE.Mesh(strutGeo, darkFrameMat);
        strut.position.set(px * 0.72, 0.05, pz);
        bodyPivot.add(strut);

        const housing = new THREE.Mesh(podHousingGeo, darkFrameMat);
        housing.position.set(px, -0.06, pz);
        housing.castShadow = true;
        bodyPivot.add(housing);

        const rim = new THREE.Mesh(rimRingGeo, goldMat);
        rim.position.set(px, -0.14, pz);
        bodyPivot.add(rim);

        const pad = new THREE.Mesh(padGlowGeo, hoverPadMat);
        pad.position.set(px, -0.18, pz);
        bodyPivot.add(pad);
        hoverPads.push(pad);
      }

      // Rear twin jet thrusters + flames
      const nozzleGeo = this.getGeo(
        'atv_nozzle',
        () => new THREE.CylinderGeometry(0.16, 0.22, 0.36, 10),
      );
      nozzleGeo.rotateX(Math.PI * 0.5);
      const flameGeo = this.getGeo(
        'veh_flame_cone',
        () => new THREE.ConeGeometry(0.18, 1.25, 10),
      );
      flameGeo.rotateX(-Math.PI * 0.5);

      for (const nx of [-0.36, 0.36]) {
        const nozzle = new THREE.Mesh(nozzleGeo, darkFrameMat);
        nozzle.position.set(nx, 0.2, -1.46);
        bodyPivot.add(nozzle);

        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(nx, 0.2, -2.18);
        flame.visible = false;
        bodyPivot.add(flame);
        thrusterFlames.push(flame);
      }
    } else if (kind === 'cyber_bike') {
      // Sleek Futuristic Cyber Hover-Bike (+Z forward)
      const hull = new THREE.Mesh(
        this.getGeo('bike_hull', () => new THREE.BoxGeometry(0.68, 0.44, 2.55)),
        darkFrameMat,
      );
      hull.position.set(0, 0.16, 0);
      hull.castShadow = true;
      hull.receiveShadow = true;
      bodyPivot.add(hull);

      // Tapered aerodynamic cowl & side neon fins
      const cowl = new THREE.Mesh(
        this.getGeo('bike_cowl', () => new THREE.BoxGeometry(0.62, 0.36, 1.05)),
        bodyMat,
      );
      cowl.position.set(0, 0.34, 0.72);
      cowl.rotation.x = 0.28;
      cowl.castShadow = true;
      bodyPivot.add(cowl);

      const screen = new THREE.Mesh(
        this.getGeo('bike_wind', () => new THREE.BoxGeometry(0.48, 0.3, 0.52)),
        windMat,
      );
      screen.position.set(0, 0.58, 0.68);
      screen.rotation.x = -0.45;
      bodyPivot.add(screen);

      // Side neon wing fairings
      const wingGeo = this.getGeo('bike_wing', () => new THREE.BoxGeometry(0.14, 0.24, 1.8));
      for (const wx of [-0.4, 0.4]) {
        const wing = new THREE.Mesh(wingGeo, bodyMat);
        wing.position.set(wx, 0.22, -0.05);
        bodyPivot.add(wing);
      }

      // Rider seat & handlebars
      const seat = new THREE.Mesh(
        this.getGeo('bike_seat', () => new THREE.BoxGeometry(0.42, 0.18, 0.95)),
        seatMat,
      );
      seat.position.set(0, 0.44, -0.32);
      bodyPivot.add(seat);

      const bar = new THREE.Mesh(
        this.getGeo('bike_hbar', () => new THREE.BoxGeometry(0.86, 0.08, 0.1)),
        chromeMat,
      );
      bar.position.set(0, 0.68, 0.38);
      bodyPivot.add(bar);

      // Dual front laser headlights
      const hlGeo = this.getGeo('bike_hl', () => new THREE.BoxGeometry(0.14, 0.1, 0.12));
      for (const hx of [-0.2, 0.2]) {
        const hl = new THREE.Mesh(hlGeo, headlightMat);
        hl.position.set(hx, 0.28, 1.28);
        bodyPivot.add(hl);
      }

      // Front & rear inline hover-repulsor pads with gold rings
      const repulsorGeo = this.getGeo(
        'bike_repulsor',
        () => new THREE.CylinderGeometry(0.4, 0.46, 0.16, 12),
      );
      const padGlowGeo = this.getGeo(
        'bike_pad_glow',
        () => new THREE.CylinderGeometry(0.32, 0.36, 0.08, 12),
      );
      const rimRingGeo = this.getGeo(
        'bike_pad_rim',
        () => new THREE.TorusGeometry(0.4, 0.045, 6, 14),
      );
      rimRingGeo.rotateX(Math.PI * 0.5);

      for (const pz of [0.95, -0.92]) {
        const rep = new THREE.Mesh(repulsorGeo, darkFrameMat);
        rep.position.set(0, -0.08, pz);
        bodyPivot.add(rep);

        const rim = new THREE.Mesh(rimRingGeo, goldMat);
        rim.position.set(0, -0.14, pz);
        bodyPivot.add(rim);

        const pad = new THREE.Mesh(padGlowGeo, hoverPadMat);
        pad.position.set(0, -0.17, pz);
        bodyPivot.add(pad);
        hoverPads.push(pad);
      }

      // Central rear hyper-thruster + flame
      const nozzleGeo = this.getGeo(
        'bike_nozzle',
        () => new THREE.CylinderGeometry(0.18, 0.24, 0.42, 10),
      );
      nozzleGeo.rotateX(Math.PI * 0.5);
      const nozzle = new THREE.Mesh(nozzleGeo, darkFrameMat);
      nozzle.position.set(0, 0.24, -1.36);
      bodyPivot.add(nozzle);

      const flameGeo = this.getGeo(
        'veh_flame_cone',
        () => new THREE.ConeGeometry(0.18, 1.25, 10),
      );
      flameGeo.rotateX(-Math.PI * 0.5);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(0, 0.24, -2.06);
      flame.visible = false;
      bodyPivot.add(flame);
      thrusterFlames.push(flame);
    } else {
      this.createSpeedboatMesh(bodyPivot, hoverPads, thrusterFlames, {
        darkFrameMat,
        chromeMat,
        seatMat,
        bodyMat,
        goldMat,
        windMat,
        flameMat,
        headlightMat,
        hoverPadMat,
      });
    }

    return { group, bodyPivot, hoverPads, thrusterFlames, headlightMat, hoverPadMat };
  }

  private createSpeedboatMesh(
    bodyPivot: THREE.Group,
    hoverPads: THREE.Mesh[],
    thrusterFlames: THREE.Mesh[],
    mats: {
      darkFrameMat: THREE.Material;
      chromeMat: THREE.Material;
      seatMat: THREE.Material;
      bodyMat: THREE.Material;
      goldMat: THREE.Material;
      windMat: THREE.Material;
      flameMat: THREE.Material;
      headlightMat: THREE.MeshStandardMaterial;
      hoverPadMat: THREE.MeshStandardMaterial;
    },
  ): void {
    const {
      darkFrameMat,
      chromeMat,
      seatMat,
      bodyMat,
      goldMat,
      windMat,
      flameMat,
      headlightMat,
      hoverPadMat,
    } = mats;

    const hullWhiteMat = this.getMat('boat_white_hull', () =>
      new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.28,
        metalness: 0.25,
      }),
    );

    // Lower hydro-stepped V-hull keel (+Z forward)
    const keel = new THREE.Mesh(
      this.getGeo('boat_keel', () => new THREE.BoxGeometry(1.52, 0.24, 3.3)),
      darkFrameMat,
    );
    keel.position.set(0, 0.04, -0.2);
    keel.castShadow = true;
    keel.receiveShadow = true;
    bodyPivot.add(keel);

    // Main sculpted hull body & side gunwales
    const mainHull = new THREE.Mesh(
      this.getGeo('boat_main_hull', () => new THREE.BoxGeometry(1.88, 0.42, 2.85)),
      bodyMat,
    );
    mainHull.position.set(0, 0.24, -0.35);
    mainHull.castShadow = true;
    mainHull.receiveShadow = true;
    bodyPivot.add(mainHull);

    // Crisp white deck coaming & pointed tapered bow prow
    const foredeck = new THREE.Mesh(
      this.getGeo('boat_foredeck', () => new THREE.BoxGeometry(1.12, 0.34, 1.45)),
      hullWhiteMat,
    );
    foredeck.position.set(0, 0.3, 1.32);
    foredeck.rotation.x = -0.08;
    foredeck.castShadow = true;
    bodyPivot.add(foredeck);

    const prowTip = new THREE.Mesh(
      this.getGeo('boat_prow_tip', () => new THREE.BoxGeometry(0.56, 0.28, 0.72)),
      bodyMat,
    );
    prowTip.position.set(0, 0.31, 2.04);
    prowTip.rotation.y = Math.PI * 0.25;
    prowTip.castShadow = true;
    bodyPivot.add(prowTip);

    const bowChineGeo = this.getGeo('boat_bow_chine', () => new THREE.BoxGeometry(0.36, 0.36, 1.55));
    for (const side of [-1, 1]) {
      const chine = new THREE.Mesh(bowChineGeo, bodyMat);
      chine.position.set(side * 0.62, 0.27, 1.24);
      chine.rotation.y = -side * 0.34;
      chine.castShadow = true;
      bodyPivot.add(chine);
    }

    // Racing stripe & side hydro-trim rails
    const stripe = new THREE.Mesh(
      this.getGeo('boat_deck_stripe', () => new THREE.BoxGeometry(0.3, 0.06, 1.55)),
      goldMat,
    );
    stripe.position.set(0, 0.48, 1.26);
    stripe.rotation.x = -0.08;
    bodyPivot.add(stripe);

    const hydroRailGeo = this.getGeo('boat_hydro_rail', () => new THREE.BoxGeometry(0.1, 0.1, 2.35));
    for (const rx of [-0.95, 0.95]) {
      const rail = new THREE.Mesh(hydroRailGeo, hoverPadMat);
      rail.position.set(rx, 0.3, -0.35);
      bodyPivot.add(rail);
      hoverPads.push(rail);
    }

    // Recessed cockpit deck, twin sport seats, helm console & wrap-around windscreen
    const deckFloor = new THREE.Mesh(
      this.getGeo('boat_cockpit_floor', () => new THREE.BoxGeometry(1.42, 0.08, 1.68)),
      seatMat,
    );
    deckFloor.position.set(0, 0.44, -0.45);
    bodyPivot.add(deckFloor);

    const seatGeo = this.getGeo('boat_seat', () => new THREE.BoxGeometry(0.46, 0.34, 0.48));
    for (const sx of [-0.36, 0.36]) {
      const seat = new THREE.Mesh(seatGeo, seatMat);
      seat.position.set(sx, 0.6, -0.78);
      seat.castShadow = true;
      bodyPivot.add(seat);
    }

    const consoleBox = new THREE.Mesh(
      this.getGeo('boat_console', () => new THREE.BoxGeometry(0.76, 0.38, 0.46)),
      darkFrameMat,
    );
    consoleBox.position.set(0, 0.6, 0.24);
    bodyPivot.add(consoleBox);

    const wheelGeo = this.getGeo('boat_wheel', () => new THREE.TorusGeometry(0.15, 0.03, 6, 12));
    const wheel = new THREE.Mesh(wheelGeo, chromeMat);
    wheel.position.set(-0.28, 0.72, 0.02);
    wheel.rotation.x = -0.45;
    bodyPivot.add(wheel);

    const windscreen = new THREE.Mesh(
      this.getGeo('boat_windscreen', () => new THREE.BoxGeometry(1.48, 0.36, 0.1)),
      windMat,
    );
    windscreen.position.set(0, 0.76, 0.46);
    windscreen.rotation.x = -0.58;
    bodyPivot.add(windscreen);

    const sideWindGeo = this.getGeo('boat_side_wind', () => new THREE.BoxGeometry(0.08, 0.28, 0.64));
    for (const swx of [-0.72, 0.72]) {
      const sw = new THREE.Mesh(sideWindGeo, windMat);
      sw.position.set(swx, 0.7, 0.14);
      bodyPivot.add(sw);
    }

    // Dual front marine LED headlights
    const hlGeo = this.getGeo('boat_hl', () => new THREE.BoxGeometry(0.22, 0.11, 0.1));
    for (const hx of [-0.42, 0.42]) {
      const hl = new THREE.Mesh(hlGeo, headlightMat);
      hl.position.set(hx, 0.38, 1.88);
      bodyPivot.add(hl);
    }

    // Twin rear outboard cyan boost thrusters + glow rings + plumes
    const podGeo = this.getGeo('boat_thruster_pod', () => new THREE.BoxGeometry(0.36, 0.46, 0.56));
    const nozzleGeo = this.getGeo('boat_nozzle', () => {
      const g = new THREE.CylinderGeometry(0.14, 0.2, 0.32, 10);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const boostRingGeo = this.getGeo('boat_boost_ring', () => new THREE.TorusGeometry(0.19, 0.04, 6, 12));
    const flameGeo = this.getGeo('veh_flame_cone', () => {
      const g = new THREE.ConeGeometry(0.18, 1.25, 10);
      g.rotateX(-Math.PI * 0.5);
      return g;
    });

    for (const tx of [-0.46, 0.46]) {
      const pod = new THREE.Mesh(podGeo, darkFrameMat);
      pod.position.set(tx, 0.36, -1.86);
      pod.castShadow = true;
      bodyPivot.add(pod);

      const nozzle = new THREE.Mesh(nozzleGeo, chromeMat);
      nozzle.position.set(tx, 0.3, -2.14);
      bodyPivot.add(nozzle);

      const glowRing = new THREE.Mesh(boostRingGeo, hoverPadMat);
      glowRing.position.set(tx, 0.3, -2.26);
      bodyPivot.add(glowRing);
      hoverPads.push(glowRing);

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(tx, 0.3, -2.86);
      flame.visible = false;
      bodyPivot.add(flame);
      thrusterFlames.push(flame);
    }
  }

  private syncVisualAndCollider(entry: VehicleEntry, elapsed: number): void {
    const v = entry.data;
    const spec = VEHICLE_SPECS[v.kind];

    const speed = Math.hypot(v.vx, v.vz);
    const bob =
      Math.sin(elapsed * 3.2 + entry.bobPhase) * (v.kind === 'speedboat' ? 0.032 : 0.045);
    entry.group.position.set(v.x, v.y, v.z);
    entry.group.rotation.set(v.pitch, v.yaw, v.roll, 'YXZ');
    entry.bodyPivot.position.y = bob;
    entry.bodyPivot.rotation.x = v.kind === 'speedboat' ? -clamp(speed / 45, 0, 0.1) : 0;

    const absCos = Math.abs(Math.cos(v.yaw));
    const absSin = Math.abs(Math.sin(v.yaw));
    const ex = absCos * spec.halfW + absSin * spec.halfL;
    const ez = absSin * spec.halfW + absCos * spec.halfL;
    entry.collider.minX = v.x - ex;
    entry.collider.maxX = v.x + ex;
    entry.collider.minY = v.y - 0.55;
    entry.collider.maxY = v.y + spec.height;
    entry.collider.minZ = v.z - ez;
    entry.collider.maxZ = v.z + ez;

    const activeGlow = v.driverId !== null || speed > 1.0;
    entry.headlightMat.emissiveIntensity = v.driverId !== null ? 1.45 : 0.45;
    entry.hoverPadMat.emissiveIntensity = v.isBoosting
      ? 2.2
      : activeGlow
        ? 1.35 + Math.sin(elapsed * 8 + entry.bobPhase) * 0.2
        : 0.75;

    const flameActive = v.isBoosting || (v.driverId !== null && speed > 4.0);
    const flameScaleZ = v.isBoosting
      ? 1.55 + Math.sin(elapsed * 35) * 0.25
      : 0.65 + Math.sin(elapsed * 24) * 0.12;
    const flameScaleXY = v.isBoosting ? 1.18 : 0.72;
    for (let i = 0; i < entry.thrusterFlames.length; i++) {
      const f = entry.thrusterFlames[i];
      f.visible = flameActive;
      if (flameActive) {
        f.scale.set(flameScaleXY, flameScaleXY, flameScaleZ);
      }
    }
  }

  private resolveStaticCollisions(v: VehicleEntity, spec: VehicleSpec): void {
    if (this.staticColliders.length === 0) return;
    const r = Math.max(spec.halfW, spec.halfL * 0.78);
    const minVehicleY = v.y - 0.35;
    const maxVehicleY = v.y + spec.height;

    for (let i = 0; i < this.staticColliders.length; i++) {
      const c = this.staticColliders[i];
      if (c.maxY <= minVehicleY + 0.35 || c.minY >= maxVehicleY) continue;
      if (c.tag === 'building_floor' || c.tag === 'building_stair') continue;

      const closestX = clamp(v.x, c.minX, c.maxX);
      const closestZ = clamp(v.z, c.minZ, c.maxZ);
      const dx = v.x - closestX;
      const dz = v.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= r * r) continue;

      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const pen = r - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        v.x += nx * pen;
        v.z += nz * pen;
        const vn = v.vx * nx + v.vz * nz;
        if (vn < 0) {
          v.vx -= nx * vn * 1.15;
          v.vz -= nz * vn * 1.15;
        }
      } else {
        const pushLeft = v.x - c.minX;
        const pushRight = c.maxX - v.x;
        const pushFront = v.z - c.minZ;
        const pushBack = c.maxZ - v.z;
        const minPush = Math.min(pushLeft, pushRight, pushFront, pushBack);
        if (minPush === pushLeft) {
          v.x = c.minX - r;
          v.vx = Math.min(0, v.vx);
        } else if (minPush === pushRight) {
          v.x = c.maxX + r;
          v.vx = Math.max(0, v.vx);
        } else if (minPush === pushFront) {
          v.z = c.minZ - r;
          v.vz = Math.min(0, v.vz);
        } else {
          v.z = c.maxZ + r;
          v.vz = Math.max(0, v.vz);
        }
      }
    }
  }

  private stepVehiclePhysics(
    entry: VehicleEntry,
    throttle: number,
    steer: number,
    boost: boolean,
    dt: number,
    isDriven: boolean,
  ): void {
    const v = entry.data;
    const spec = VEHICLE_SPECS[v.kind];
    const subSteps = Math.max(1, Math.ceil(dt / 0.05));
    const stepDt = dt / subSteps;

    const cleanThrottle = clamp(throttle, -1, 1);
    const cleanSteer = clamp(steer, -1, 1);
    let lastOnWater = false;

    for (let s = 0; s < subSteps; s++) {
      const startSurface = this.getEffectiveSurfaceY(v.x, v.z);
      const speedScale =
        v.kind === 'speedboat' && !startSurface.onWater && !startSurface.onLava
          ? SPEEDBOAT_DRY_TERRAIN_SPEED_SCALE
          : 1.0;
      const effMaxSpeed = spec.maxSpeed * speedScale;
      const effBoostSpeed = spec.boostSpeed * speedScale;
      const effReverseSpeed = spec.reverseSpeed * speedScale;
      const effAccel = spec.accel * speedScale;
      const effBoostAccel = spec.boostAccel * speedScale;

      let fwdX = Math.sin(v.yaw);
      let fwdZ = Math.cos(v.yaw);
      const rightX = -Math.cos(v.yaw);
      const rightZ = Math.sin(v.yaw);

      let vFwd = v.vx * fwdX + v.vz * fwdZ;
      let vLat = v.vx * rightX + v.vz * rightZ;

      // Hover grip lateral slip damping
      vLat *= Math.exp(-7.5 * stepDt);

      // Steering
      if (isDriven && Math.abs(cleanSteer) > 1e-4) {
        const steerSign = vFwd < -1.5 ? -1 : 1;
        const speedFactor = 0.55 + 0.45 * clamp(Math.abs(vFwd) / 8, 0, 1);
        v.yaw = normalizeAngle(
          v.yaw - cleanSteer * spec.turnRate * speedFactor * steerSign * stepDt,
        );
        fwdX = Math.sin(v.yaw);
        fwdZ = Math.cos(v.yaw);
      }

      // Boost energy & forward thrust
      const canBoost = isDriven && boost && v.boostCharge > 0.02;
      v.isBoosting = canBoost;

      if (canBoost) {
        v.boostCharge = Math.max(0, v.boostCharge - stepDt * 0.36);
        const boostDrive = cleanThrottle >= -0.05 ? Math.max(cleanThrottle, 0.85) : cleanThrottle;
        if (boostDrive >= 0) {
          if (vFwd > effBoostSpeed) {
            vFwd = Math.max(effBoostSpeed, vFwd - spec.brakeDecel * 0.8 * stepDt);
          } else {
            vFwd = Math.min(effBoostSpeed, vFwd + effBoostAccel * boostDrive * stepDt);
          }
        } else {
          vFwd = Math.max(-effReverseSpeed, vFwd + effAccel * boostDrive * stepDt);
        }
      } else {
        v.boostCharge = Math.min(1, v.boostCharge + stepDt * 0.22);
        if (isDriven && Math.abs(cleanThrottle) > 1e-4) {
          if (cleanThrottle > 0) {
            if (vFwd < 0) {
              vFwd = Math.min(0, vFwd + spec.brakeDecel * stepDt);
            } else if (vFwd > effMaxSpeed) {
              vFwd = Math.max(effMaxSpeed, vFwd - spec.brakeDecel * 0.8 * stepDt);
            } else {
              vFwd = Math.min(effMaxSpeed, vFwd + effAccel * cleanThrottle * stepDt);
            }
          } else {
            if (vFwd > 0) {
              vFwd = Math.max(0, vFwd - spec.brakeDecel * stepDt);
            } else {
              vFwd = Math.max(-effReverseSpeed, vFwd + effAccel * cleanThrottle * stepDt);
            }
          }
        } else {
          // Coast drag
          vFwd *= Math.exp(-(isDriven ? 2.1 : 2.8) * stepDt);
          if (Math.abs(vFwd) < 0.04) vFwd = 0;
        }
      }

      const newRightX = -Math.cos(v.yaw);
      const newRightZ = Math.sin(v.yaw);
      v.vx = fwdX * vFwd + newRightX * vLat;
      v.vz = fwdZ * vFwd + newRightZ * vLat;

      v.x = clamp(v.x + v.vx * stepDt, -WORLD_HALF + 8, WORLD_HALF - 8);
      v.z = clamp(v.z + v.vz * stepDt, -WORLD_HALF + 8, WORLD_HALF - 8);
      this.resolveStaticCollisions(v, spec);

      // Terrain / Water / Volcanic Lava hover & speedboat buoyancy physics
      const { surfaceY, onWater, onLava } = this.getEffectiveSurfaceY(v.x, v.z);
      lastOnWater = onWater;
      let targetHoverY = surfaceY + spec.hoverHeight;

      if (onLava) {
        // Volcanic thermal updraft gives buoyancy lift + bonus boost energy
        targetHoverY += 0.65;
        v.boostCharge = Math.min(1, v.boostCharge + stepDt * 0.55);
        v.vy += 9.5 * stepDt;
      } else if (onWater) {
        // Hover vehicles skim slightly above water; speedboats sit cleanly at WATER_LEVEL + 0.12
        if (v.kind !== 'speedboat') {
          targetHoverY += 0.08;
        }
      } else if (v.kind === 'speedboat') {
        // Amphibious hull planing clearance on dry terrain
        targetHoverY += 0.16;
      }

      if (v.y > targetHoverY + 0.35) {
        v.vy -= 22.0 * stepDt;
        v.y += v.vy * stepDt;
      } else {
        const disp = targetHoverY - v.y;
        v.vy += (disp * 92.0 - v.vy * 13.5) * stepDt;
        v.y += v.vy * stepDt;
      }

      const minClearance = v.kind === 'speedboat' ? 0.04 : 0.18;
      if (v.y < surfaceY + minClearance) {
        v.y = surfaceY + minClearance;
        if (v.vy < 0) v.vy = 0;
      }

      // Terrain-conforming pitch & roll + banking turn lean
      const normal =
        onWater || onLava ? { x: 0, y: 1, z: 0 } : this.terrain.getNormalAt(v.x, v.z);
      const leftX = Math.cos(v.yaw);
      const leftZ = -Math.sin(v.yaw);
      const targetPitch = Math.asin(clamp(normal.x * fwdX + normal.z * fwdZ, -0.55, 0.55));
      const terrainRoll = -Math.asin(clamp(normal.x * leftX + normal.z * leftZ, -0.5, 0.5));
      const speed = Math.hypot(v.vx, v.vz);
      const bankRoll = isDriven
        ? cleanSteer * spec.maxBankRoll * clamp(speed / 10, 0.25, 1.0)
        : 0;

      v.pitch = damp(v.pitch, targetPitch, 10, stepDt);
      v.roll = damp(v.roll, terrainRoll + bankRoll, 10, stepDt);
    }

    // Boost & Speedboat Water Wake VFX/SFX emission (immediate on activation, rate-limited while held)
    if (entry.boostVfxCooldown > 0) entry.boostVfxCooldown = Math.max(0, entry.boostVfxCooldown - dt);
    if (entry.boostSfxCooldown > 0) entry.boostSfxCooldown = Math.max(0, entry.boostSfxCooldown - dt);
    if (entry.wakeVfxCooldown > 0) entry.wakeVfxCooldown = Math.max(0, entry.wakeVfxCooldown - dt);
    if (entry.wakeSfxCooldown > 0) entry.wakeSfxCooldown = Math.max(0, entry.wakeSfxCooldown - dt);

    if (v.isBoosting) {
      if (entry.boostVfxCooldown <= 0 && this.eventBus) {
        const fwdX = Math.sin(v.yaw);
        const fwdZ = Math.cos(v.yaw);
        this.eventBus.emit('vfx:vehicle_boost', {
          position: {
            x: v.x - fwdX * 1.6,
            y: v.y + 0.25,
            z: v.z - fwdZ * 1.6,
          },
          direction: { x: -fwdX, y: 0.05, z: -fwdZ },
        });
        entry.boostVfxCooldown = 0.09;
      }
      if (entry.boostSfxCooldown <= 0 && this.eventBus) {
        this.eventBus.emit('sound:play', {
          id: v.kind === 'speedboat' ? 'boat_boost' : 'vehicle_boost',
          position: { x: v.x, y: v.y, z: v.z },
          spatial: true,
        });
        entry.boostSfxCooldown = 0.45;
      }
    } else {
      entry.boostVfxCooldown = 0;
    }

    if (v.kind === 'speedboat' && lastOnWater) {
      const waterSpeed = Math.hypot(v.vx, v.vz);
      const activelyMoving =
        v.isBoosting || (isDriven && Math.abs(cleanThrottle) > 0.05) || waterSpeed > 2.0;
      if (activelyMoving) {
        if (entry.wakeVfxCooldown <= 0 && this.eventBus) {
          const fwdX = Math.sin(v.yaw);
          const fwdZ = Math.cos(v.yaw);
          this.eventBus.emit('vfx:water_wake', {
            position: {
              x: v.x - fwdX * 1.9,
              y: WATER_LEVEL + 0.05,
              z: v.z - fwdZ * 1.9,
            },
            yaw: v.yaw,
            speed: waterSpeed,
          });
          entry.wakeVfxCooldown = 0.09;
        }
        if (entry.wakeSfxCooldown <= 0 && this.eventBus) {
          this.eventBus.emit('sound:play', {
            id: 'water_splash_wake',
            position: { x: v.x, y: WATER_LEVEL + 0.2, z: v.z },
            volume: clamp(0.35 + waterSpeed / 45, 0.35, 0.85),
            spatial: true,
          });
          entry.wakeSfxCooldown = 0.38;
        }
      } else {
        entry.wakeVfxCooldown = 0;
      }
    } else {
      entry.wakeVfxCooldown = 0;
    }
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  getVehicles(): VehicleEntity[] {
    return this.vehiclesList;
  }

  getActiveVehicleColliders(): ColliderBox[] {
    const out: ColliderBox[] = [];
    for (let i = 0; i < this.vehiclesList.length; i++) {
      const v = this.vehiclesList[i];
      if (v.destroyed) continue;
      const entry = this.vehiclesMap.get(v.id);
      if (entry) out.push(entry.collider);
    }
    return out;
  }

  enterVehicle(vehicleId: string, driverId: string): boolean {
    const entry = this.vehiclesMap.get(vehicleId);
    if (!entry || entry.data.destroyed || entry.data.driverId !== null) {
      return false;
    }
    entry.data.driverId = driverId;
    return true;
  }

  exitVehicle(vehicleId: string, driverId: string): Vec3Like | null {
    const entry = this.vehiclesMap.get(vehicleId);
    if (!entry || entry.data.driverId !== driverId) {
      return null;
    }

    const v = entry.data;
    v.driverId = null;
    v.isBoosting = false;
    entry.boostVfxCooldown = 0;

    const fwdX = Math.sin(v.yaw);
    const fwdZ = Math.cos(v.yaw);
    const leftX = Math.cos(v.yaw);
    const leftZ = -Math.sin(v.yaw);

    const candidateOffsets: Array<[number, number]> = [
      [leftX * 2.25, leftZ * 2.25],
      [-leftX * 2.25, -leftZ * 2.25],
      [-fwdX * 2.45, -fwdZ * 2.45],
      [fwdX * 2.45, fwdZ * 2.45],
      [0, 0],
    ];

    let fallbackPos: Vec3Like | null = null;
    for (const [ox, oz] of candidateOffsets) {
      const cx = clamp(v.x + ox, -WORLD_HALF + 4, WORLD_HALF - 4);
      const cz = clamp(v.z + oz, -WORLD_HALF + 4, WORLD_HALF - 4);
      const gy = this.terrain.getHeightAt(cx, cz);
      const exitY =
        v.y > gy + 2.6 ? Math.max(gy, v.y - 0.55) : Math.max(WATER_LEVEL, gy);
      const pos: Vec3Like = { x: cx, y: exitY, z: cz };
      if (!fallbackPos) fallbackPos = pos;

      if (this.terrain.isWater(cx, cz) || this.isInVolcanoLava(cx, cz)) continue;

      let blocked = false;
      for (let i = 0; i < this.staticColliders.length; i++) {
        const c = this.staticColliders[i];
        if (c.maxY <= exitY + 0.1 || c.minY >= exitY + 1.8) continue;
        if (
          cx >= c.minX - 0.45 &&
          cx <= c.maxX + 0.45 &&
          cz >= c.minZ - 0.45 &&
          cz <= c.maxZ + 0.45
        ) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return pos;
    }

    return fallbackPos ?? { x: v.x + 2.2, y: Math.max(WATER_LEVEL, v.y), z: v.z };
  }

  driveVehicle(
    vehicleId: string,
    throttle: number,
    steer: number,
    boost: boolean,
    dt: number,
  ): void {
    const entry = this.vehiclesMap.get(vehicleId);
    if (!entry || entry.data.destroyed || dt <= 0) return;

    entry.drivenThisFrame = true;
    entry.lastSteer = steer;
    this.stepVehiclePhysics(entry, throttle, steer, boost, dt, true);
    this.syncVisualAndCollider(entry, 0);
  }

  damageVehicle(vehicleId: string, dmg: number, hitPos: Vec3Like): boolean {
    const entry = this.vehiclesMap.get(vehicleId);
    if (!entry || entry.data.destroyed) return false;

    const v = entry.data;
    const damage = Math.max(0, dmg);
    v.hp = Math.max(0, v.hp - damage);

    const dx = hitPos.x - v.x;
    const dz = hitPos.z - v.z;
    const len = Math.hypot(dx, dz) || 1;
    this.eventBus?.emit('vfx:impact', {
      position: { ...hitPos },
      normal: { x: dx / len, y: 0.25, z: dz / len },
      material: 'metal',
    });
    this.eventBus?.emit('sound:play', {
      id: 'hit_metal',
      position: { ...hitPos },
      spatial: true,
    });

    if (v.hp <= 0) {
      v.hp = 0;
      v.destroyed = true;
      v.driverId = null;
      v.isBoosting = false;
      v.vx = 0;
      v.vy = 0;
      v.vz = 0;
      entry.group.visible = false;

      const blastPos = { x: v.x, y: v.y + 0.6, z: v.z };
      this.eventBus?.emit('vfx:explosion', {
        position: blastPos,
        radius: 5.5,
      });
      this.eventBus?.emit('sound:play', {
        id: 'explosion',
        position: blastPos,
        spatial: true,
      });
      return true;
    }

    return false;
  }

  spawnVehicleAt(
    kind: VehicleKind,
    x: number,
    z: number,
    yaw = 0,
  ): VehicleEntity {
    const id = `vehicle_${this.spawnCounter++}`;
    return this.createVehicle(id, kind, x, z, yaw);
  }

  update(dt: number, elapsed: number): void {
    const safeDt = Math.max(0, dt);
    for (let i = 0; i < this.vehiclesList.length; i++) {
      const v = this.vehiclesList[i];
      if (v.destroyed) continue;
      const entry = this.vehiclesMap.get(v.id);
      if (!entry) continue;

      if (!entry.drivenThisFrame && safeDt > 0) {
        this.stepVehiclePhysics(entry, 0, 0, false, safeDt, false);
      }
      entry.drivenThisFrame = false;
      this.syncVisualAndCollider(entry, elapsed);
    }
  }

  reset(): void {
    this.group.clear();
    this.vehiclesList = [];
    this.vehiclesMap.clear();
    for (const m of this.instanceMaterials) m.dispose();
    this.instanceMaterials = [];
    this.spawnCounter = 0;
    this.spawnDefaultVehicles();
  }

  dispose(): void {
    this.group.clear();
    this.vehiclesList = [];
    this.vehiclesMap.clear();
    for (const g of this.sharedGeometries.values()) g.dispose();
    this.sharedGeometries.clear();
    for (const m of this.sharedMaterials.values()) m.dispose();
    this.sharedMaterials.clear();
    for (const m of this.instanceMaterials) m.dispose();
    this.instanceMaterials = [];
  }
}
