import * as THREE from 'three';
import { EventBus, POIS } from '../core';
import type {
  CampfireEntity,
  ColliderBox,
  LaunchPadEntity,
  SlurpBarrelEntity,
  TerrainQuery,
  UpgradeBenchEntity,
  VaultEntity,
  Vec3Like,
  ZiplineEntity,
} from '../types';

interface PadVisual {
  data: LaunchPadEntity;
  spinner: THREE.Object3D;
  pulseRing: THREE.Mesh;
  baseY: number;
}

interface ZiplineOrb {
  mesh: THREE.Mesh;
  zipline: ZiplineEntity;
  t: number;
}

interface VaultVisual {
  data: VaultEntity;
  lootPos: Vec3Like;
  doorPivot: THREE.Group;
  wheelGroup: THREE.Group;
  keypadRing: THREE.Mesh;
  keypadMat: THREE.MeshStandardMaterial;
  interiorGlow: THREE.Mesh;
  openProgress: number;
  wallColliders: ColliderBox[];
  doorCollider: ColliderBox;
}

export interface UnlockVaultResult {
  unlocked: boolean;
  lootPos?: Vec3Like;
}

export interface SlurpBarrelDamageResult {
  destroyed: boolean;
  shieldAmount: number;
  position: Vec3Like;
}

interface UpgradeBenchVisual {
  data: UpgradeBenchEntity;
  group: THREE.Group;
  reticleGroup: THREE.Group;
  holoRing: THREE.Mesh;
  baseReticleY: number;
  collider: ColliderBox;
}

interface CampfireVisual {
  data: CampfireEntity;
  group: THREE.Group;
  emberMesh: THREE.Mesh;
  emberUnlitMat: THREE.Material;
  emberLitMat: THREE.Material;
  flameGroup: THREE.Group;
  flames: THREE.Mesh[];
  sparks: THREE.Mesh[];
}

interface SlurpBarrelVisual {
  data: SlurpBarrelEntity;
  group: THREE.Group;
  bodyGroup: THREE.Group;
  collider: ColliderBox;
  hitAnim: number;
}

export class WorldInteractables {
  private group = new THREE.Group();
  private eventBus?: EventBus;
  private launchPads: LaunchPadEntity[] = [];
  private ziplines: ZiplineEntity[] = [];
  private vaults: VaultEntity[] = [];
  private vaultsMap = new Map<string, VaultVisual>();
  private upgradeBenches: UpgradeBenchEntity[] = [];
  private upgradeBenchVisuals: UpgradeBenchVisual[] = [];
  private campfires: CampfireEntity[] = [];
  private campfiresMap = new Map<string, CampfireVisual>();
  private slurpBarrels: SlurpBarrelEntity[] = [];
  private slurpBarrelsMap = new Map<string, SlurpBarrelVisual>();
  private padVisuals: PadVisual[] = [];
  private ziplineOrbs: ZiplineOrb[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(terrain: TerrainQuery, eventBus?: EventBus) {
    this.group.name = 'WorldInteractables';
    this.eventBus = eventBus;
    this.buildLaunchPads(terrain);
    this.buildZiplines(terrain);
    this.buildVaults(terrain);
    this.buildUpgradeBenches(terrain);
    this.buildCampfires(terrain);
    this.buildSlurpBarrels(terrain);
  }

  private addGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private addMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private buildLaunchPads(terrain: TerrainQuery): void {
    const skyline = POIS.find((p) => p.id === 'skyline_spire')!;
    const scorched = POIS.find((p) => p.id === 'scorched_caldera')!;
    const frostpeak = POIS.find((p) => p.id === 'frostpeak_citadel')!;
    const metro = POIS.find((p) => p.id === 'metro_towers')!;
    const crystal = POIS.find((p) => p.id === 'crystal_basin')!;
    const oasis = POIS.find((p) => p.id === 'sunken_oasis')!;
    const crater = POIS.find((p) => p.id === 'crater_depot')!;

    const padSpecs: Array<{
      id: string;
      kind: 'launch_pad' | 'geyser';
      x: number;
      z: number;
      yOverride?: number;
      boostVy: number;
      boostForward: number;
    }> = [
      { id: 'pad_sky_1', kind: 'launch_pad', x: skyline.x + 8, z: skyline.z + 10, boostVy: 34, boostForward: 8 },
      { id: 'pad_sky_2', kind: 'launch_pad', x: skyline.x - 8, z: skyline.z + 10, boostVy: 34, boostForward: 8 },
      { id: 'pad_sky_top', kind: 'launch_pad', x: skyline.x, z: skyline.z + 10, yOverride: 44.16, boostVy: 26, boostForward: 24 },
      { id: 'geyser_volc_1', kind: 'geyser', x: scorched.x - 16, z: scorched.z - 6, boostVy: 30, boostForward: 14 },
      { id: 'geyser_volc_2', kind: 'geyser', x: scorched.x + 3, z: scorched.z + 6, boostVy: 30, boostForward: 14 },
      { id: 'pad_frost', kind: 'launch_pad', x: frostpeak.x + 12, z: frostpeak.z + 23, boostVy: 28, boostForward: 20 },
      {
        id: 'pad_metro_heli',
        kind: 'launch_pad',
        x: metro.x + 20.5,
        z: metro.z - 18.5,
        yOverride: terrain.getHeightAt(metro.x + 18, metro.z - 16) + 0.22 + 5 * 3.2 + 0.14,
        boostVy: 27,
        boostForward: 22,
      },
      { id: 'pad_crystal', kind: 'launch_pad', x: crystal.x, z: crystal.z + 11, boostVy: 27, boostForward: 18 },
      { id: 'pad_oasis', kind: 'launch_pad', x: oasis.x + 12, z: oasis.z + 4, boostVy: 27, boostForward: 18 },
      { id: 'pad_crater', kind: 'launch_pad', x: crater.x + 6, z: crater.z + 4, boostVy: 27, boostForward: 18 },
    ];

    const rimMat = this.addMat(new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.7 }));
    const padCoreMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    const padRingMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#67e8f9',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const geyserRockMat = this.addMat(new THREE.MeshStandardMaterial({ color: '#2b2429', roughness: 0.9 }));
    const geyserGlowMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#fb923c',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const rimGeo = this.addGeo(new THREE.CylinderGeometry(1.75, 2.0, 0.22, 8));
    const coreGeo = this.addGeo(new THREE.CylinderGeometry(1.32, 1.32, 0.26, 8));
    const ringGeo = this.addGeo(new THREE.RingGeometry(1.0, 1.45, 24));
    ringGeo.rotateX(-Math.PI * 0.5);
    const geyserConeGeo = this.addGeo(new THREE.CylinderGeometry(1.1, 2.1, 0.75, 10));
    const geyserPlumeGeo = this.addGeo(new THREE.CylinderGeometry(0.45, 0.95, 3.6, 12, 1, true));

    for (const spec of padSpecs) {
      const y = spec.yOverride ?? terrain.getHeightAt(spec.x, spec.z);
      const data: LaunchPadEntity = {
        id: spec.id,
        kind: spec.kind,
        x: spec.x,
        y,
        z: spec.z,
        radius: 2.1,
        boostVy: spec.boostVy,
        boostForward: spec.boostForward,
      };
      this.launchPads.push(data);

      const container = new THREE.Group();
      container.position.set(spec.x, y, spec.z);

      if (spec.kind === 'launch_pad') {
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.y = 0.11;
        const core = new THREE.Mesh(coreGeo, padCoreMat);
        core.position.y = 0.13;
        const ring = new THREE.Mesh(ringGeo, padRingMat);
        ring.position.y = 0.35;
        container.add(rim, core, ring);
        this.group.add(container);
        this.padVisuals.push({ data, spinner: core, pulseRing: ring, baseY: 0.35 });
      } else {
        const vent = new THREE.Mesh(geyserConeGeo, geyserRockMat);
        vent.position.y = 0.36;
        const plume = new THREE.Mesh(geyserPlumeGeo, geyserGlowMat);
        plume.position.y = 2.0;
        const ring = new THREE.Mesh(ringGeo, geyserGlowMat);
        ring.position.y = 0.85;
        container.add(vent, plume, ring);
        this.group.add(container);
        this.padVisuals.push({ data, spinner: plume, pulseRing: ring, baseY: 0.85 });
      }
    }
  }

  private buildZiplines(terrain: TerrainQuery): void {
    const pairs: Array<{ id: string; ax: number; az: number; bx: number; bz: number; hA: number; hB: number }> = [
      { id: 'zip_frost_suburbs', ax: -26, az: -216, bx: -146, bz: -162, hA: 7.5, hB: 7.5 },
      { id: 'zip_frost_pines', ax: 18, az: -222, bx: 142, bz: -175, hA: 7.5, hB: 7.5 },
      { id: 'zip_metro_crystal', ax: -48, az: -44, bx: 68, bz: -128, hA: 9.0, hB: 7.5 },
      { id: 'zip_market_skyline', ax: 168, az: 52, bx: 164, bz: 134, hA: 7.5, hB: 8.5 },
      { id: 'zip_crater_volcano', ax: 18, az: 126, bx: -148, bz: 124, hA: 8.0, hB: 8.0 },
      { id: 'zip_oasis_metro', ax: -198, az: -15, bx: -106, bz: -42, hA: 7.5, hB: 8.5 },
    ];

    const pylonMat = this.addMat(new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.65 }));
    const cableMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#0ea5e9',
        emissiveIntensity: 0.85,
        roughness: 0.25,
      }),
    );
    const orbMat = this.addMat(new THREE.MeshBasicMaterial({ color: '#fef08a' }));
    const orbGeo = this.addGeo(new THREE.SphereGeometry(0.32, 8, 6));
    const unitCyl = this.addGeo(new THREE.CylinderGeometry(0.18, 0.24, 1, 8));
    const cableCyl = this.addGeo(new THREE.CylinderGeometry(0.08, 0.08, 1, 6));

    const up = new THREE.Vector3(0, 1, 0);

    for (const p of pairs) {
      const groundA = terrain.getHeightAt(p.ax, p.az);
      const groundB = terrain.getHeightAt(p.bx, p.bz);
      const start: Vec3Like = { x: p.ax, y: groundA + p.hA, z: p.az };
      const end: Vec3Like = { x: p.bx, y: groundB + p.hB, z: p.bz };

      const zEntity: ZiplineEntity = {
        id: p.id,
        start,
        end,
        speed: 26.0,
      };
      this.ziplines.push(zEntity);

      for (const [gx, gy, gz, h] of [
        [p.ax, groundA, p.az, p.hA],
        [p.bx, groundB, p.bz, p.hB],
      ] as Array<[number, number, number, number]>) {
        const post = new THREE.Mesh(unitCyl, pylonMat);
        post.scale.set(1, h, 1);
        post.position.set(gx, gy + h * 0.5, gz);
        post.castShadow = true;
        this.group.add(post);

        const cap = new THREE.Mesh(orbGeo, cableMat);
        cap.position.set(gx, gy + h, gz);
        this.group.add(cap);
      }

      const vStart = new THREE.Vector3(start.x, start.y, start.z);
      const vEnd = new THREE.Vector3(end.x, end.y, end.z);
      const dir = new THREE.Vector3().subVectors(vEnd, vStart);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);

      const cable = new THREE.Mesh(cableCyl, cableMat);
      cable.position.copy(mid);
      cable.scale.set(1, len, 1);
      cable.quaternion.setFromUnitVectors(up, dir.normalize());
      this.group.add(cable);

      for (const offset of [0.15, 0.65]) {
        const orb = new THREE.Mesh(orbGeo, orbMat);
        this.group.add(orb);
        this.ziplineOrbs.push({ mesh: orb, zipline: zEntity, t: offset });
      }
    }
  }

  private buildVaults(terrain: TerrainQuery): void {
    const skyline = POIS.find((p) => p.id === 'skyline_spire')!;
    const scorched = POIS.find((p) => p.id === 'scorched_caldera')!;
    const frostpeak = POIS.find((p) => p.id === 'frostpeak_citadel')!;

    const vaultSpecs: Array<{
      id: string;
      poiId: string;
      bossName: string;
      x: number;
      z: number;
      yOverride?: number;
    }> = [
      {
        id: 'vault_skyline_spire',
        poiId: 'skyline_spire',
        bossName: 'Skyline Warden',
        x: skyline.x + 8,
        z: skyline.z - 9,
      },
      {
        id: 'vault_scorched_caldera',
        poiId: 'scorched_caldera',
        bossName: 'Obsidian Titan',
        x: scorched.x - 3,
        z: scorched.z - 11,
      },
      {
        id: 'vault_frostpeak_citadel',
        poiId: 'frostpeak_citadel',
        bossName: 'Glacier Monarch',
        x: frostpeak.x + 12,
        z: frostpeak.z + 8,
      },
    ];

    const bunkerSteelMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.45,
        metalness: 0.78,
      }),
    );
    const bunkerTrimMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.38,
        metalness: 0.82,
      }),
    );
    const doorSteelMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.32,
        metalness: 0.88,
      }),
    );
    const goldMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#b45309',
        emissiveIntensity: 0.48,
        roughness: 0.25,
        metalness: 0.85,
      }),
    );
    const interiorGlowMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#fde047',
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const floorGeo = this.addGeo(new THREE.BoxGeometry(4.8, 0.2, 4.2));
    const sideWallGeo = this.addGeo(new THREE.BoxGeometry(0.65, 3.4, 4.2));
    const backWallGeo = this.addGeo(new THREE.BoxGeometry(4.8, 3.4, 0.65));
    const roofGeo = this.addGeo(new THREE.BoxGeometry(5.2, 0.55, 4.5));
    const lintelTrimGeo = this.addGeo(new THREE.BoxGeometry(3.8, 0.22, 0.24));
    const doorSlabGeo = this.addGeo(new THREE.BoxGeometry(2.7, 3.0, 0.34));
    const hatchPlateGeo = this.addGeo(new THREE.CylinderGeometry(1.05, 1.05, 0.44, 16));
    hatchPlateGeo.rotateX(Math.PI * 0.5);
    const spokeGeo = this.addGeo(new THREE.BoxGeometry(1.5, 0.1, 0.14));
    const hubGeo = this.addGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.56, 12));
    hubGeo.rotateX(Math.PI * 0.5);
    const pedestalGeo = this.addGeo(new THREE.BoxGeometry(1.4, 0.42, 1.2));
    const auraGeo = this.addGeo(new THREE.CylinderGeometry(0.85, 1.15, 2.2, 14, 1, true));
    const keypadPostGeo = this.addGeo(new THREE.BoxGeometry(0.42, 1.25, 0.42));
    const keypadRingGeo = this.addGeo(new THREE.TorusGeometry(0.32, 0.06, 8, 24));

    for (const spec of vaultSpecs) {
      const y = spec.yOverride ?? terrain.getHeightAt(spec.x, spec.z);
      const data: VaultEntity = {
        id: spec.id,
        poiId: spec.poiId,
        bossName: spec.bossName,
        x: spec.x,
        y,
        z: spec.z,
        unlocked: false,
        opened: false,
      };
      this.vaults.push(data);

      const vaultGroup = new THREE.Group();
      vaultGroup.name = `BossVault_${spec.id}`;
      vaultGroup.position.set(spec.x, y, spec.z);

      // Steel Bunker Alcove (opening on +Z face)
      const floor = new THREE.Mesh(floorGeo, bunkerTrimMat);
      floor.position.set(0, 0.1, 0);
      floor.receiveShadow = true;

      const leftWall = new THREE.Mesh(sideWallGeo, bunkerSteelMat);
      leftWall.position.set(-2.075, 1.7, 0);
      leftWall.castShadow = true;
      leftWall.receiveShadow = true;

      const rightWall = new THREE.Mesh(sideWallGeo, bunkerSteelMat);
      rightWall.position.set(2.075, 1.7, 0);
      rightWall.castShadow = true;
      rightWall.receiveShadow = true;

      const backWall = new THREE.Mesh(backWallGeo, bunkerSteelMat);
      backWall.position.set(0, 1.7, -1.775);
      backWall.castShadow = true;
      backWall.receiveShadow = true;

      const roof = new THREE.Mesh(roofGeo, bunkerTrimMat);
      roof.position.set(0, 3.6, 0);
      roof.castShadow = true;
      roof.receiveShadow = true;

      const goldLintel = new THREE.Mesh(lintelTrimGeo, goldMat);
      goldLintel.position.set(0, 3.25, 2.12);

      // Interior golden vault pedestal & treasure aura
      const pedestal = new THREE.Mesh(pedestalGeo, goldMat);
      pedestal.position.set(0, 0.41, -0.85);
      const interiorGlow = new THREE.Mesh(auraGeo, interiorGlowMat);
      interiorGlow.position.set(0, 1.55, -0.85);

      vaultGroup.add(
        floor,
        leftWall,
        rightWall,
        backWall,
        roof,
        goldLintel,
        pedestal,
        interiorGlow,
      );

      // Hinged Armored Steel Vault Door (pivots from left jamb x=-1.35, z=+1.65)
      const doorPivot = new THREE.Group();
      doorPivot.position.set(-1.35, 1.65, 1.65);

      const doorSlab = new THREE.Mesh(doorSlabGeo, doorSteelMat);
      doorSlab.position.set(1.35, 0, 0);
      doorSlab.castShadow = true;
      doorSlab.receiveShadow = true;
      doorPivot.add(doorSlab);

      const hatchPlate = new THREE.Mesh(hatchPlateGeo, bunkerTrimMat);
      hatchPlate.position.set(1.35, 0, 0.08);
      doorPivot.add(hatchPlate);

      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(1.35, 0, 0.34);
      for (let s = 0; s < 3; s++) {
        const spoke = new THREE.Mesh(spokeGeo, goldMat);
        spoke.rotation.z = (s * Math.PI) / 3;
        wheelGroup.add(spoke);
      }
      const hub = new THREE.Mesh(hubGeo, goldMat);
      wheelGroup.add(hub);
      doorPivot.add(wheelGroup);
      vaultGroup.add(doorPivot);

      // Glowing Golden Keypad Ring mounted on right jamb pillar
      const keypadPost = new THREE.Mesh(keypadPostGeo, bunkerTrimMat);
      keypadPost.position.set(2.02, 0.625, 2.28);
      keypadPost.castShadow = true;
      vaultGroup.add(keypadPost);

      const keypadMat = this.addMat(
        new THREE.MeshStandardMaterial({
          color: '#facc15',
          emissive: '#f59e0b',
          emissiveIntensity: 1.55,
          roughness: 0.2,
          metalness: 0.5,
        }),
      );
      const keypadRing = new THREE.Mesh(keypadRingGeo, keypadMat);
      keypadRing.position.set(2.02, 1.48, 2.38);
      vaultGroup.add(keypadRing);

      this.group.add(vaultGroup);

      const wallColliders: ColliderBox[] = [
        {
          id: `${spec.id}_wall_l`,
          minX: spec.x - 2.4,
          minY: y,
          minZ: spec.z - 2.1,
          maxX: spec.x - 1.75,
          maxY: y + 3.8,
          maxZ: spec.z + 2.1,
          material: 'metal',
          tag: `vault_wall:${spec.id}`,
        },
        {
          id: `${spec.id}_wall_r`,
          minX: spec.x + 1.75,
          minY: y,
          minZ: spec.z - 2.1,
          maxX: spec.x + 2.4,
          maxY: y + 3.8,
          maxZ: spec.z + 2.1,
          material: 'metal',
          tag: `vault_wall:${spec.id}`,
        },
        {
          id: `${spec.id}_wall_back`,
          minX: spec.x - 2.4,
          minY: y,
          minZ: spec.z - 2.1,
          maxX: spec.x + 2.4,
          maxY: y + 3.8,
          maxZ: spec.z - 1.45,
          material: 'metal',
          tag: `vault_wall:${spec.id}`,
        },
        {
          id: `${spec.id}_roof`,
          minX: spec.x - 2.6,
          minY: y + 3.32,
          minZ: spec.z - 2.25,
          maxX: spec.x + 2.6,
          maxY: y + 3.88,
          maxZ: spec.z + 2.25,
          material: 'metal',
          tag: `vault_roof:${spec.id}`,
        },
      ];

      const doorCollider: ColliderBox = {
        id: `${spec.id}_door`,
        minX: spec.x - 1.45,
        minY: y + 0.15,
        minZ: spec.z + 1.45,
        maxX: spec.x + 1.45,
        maxY: y + 3.2,
        maxZ: spec.z + 1.85,
        material: 'metal',
        tag: `vault_door:${spec.id}`,
      };

      this.vaultsMap.set(spec.id, {
        data,
        lootPos: { x: spec.x, y: y + 0.65, z: spec.z - 0.85 },
        doorPivot,
        wheelGroup,
        keypadRing,
        keypadMat,
        interiorGlow,
        openProgress: 0,
        wallColliders,
        doorCollider,
      });
    }
  }

  private buildUpgradeBenches(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      poiId: string;
      dx: number;
      dz: number;
      rotationY: number;
    }> = [
      { id: 'bench_metro_towers', poiId: 'metro_towers', dx: -8, dz: 0, rotationY: Math.PI * 0.5 },
      { id: 'bench_market_row', poiId: 'market_row', dx: -10, dz: 2, rotationY: Math.PI * 0.5 },
      { id: 'bench_sunny_suburbs', poiId: 'sunny_suburbs', dx: -16, dz: 0, rotationY: Math.PI * 0.5 },
      { id: 'bench_crater_depot', poiId: 'crater_depot', dx: 20, dz: -8, rotationY: 0 },
      { id: 'bench_skyline_spire', poiId: 'skyline_spire', dx: -10, dz: 2, rotationY: Math.PI * 0.5 },
      { id: 'bench_frostpeak_citadel', poiId: 'frostpeak_citadel', dx: -9, dz: 10, rotationY: Math.PI * 0.5 },
    ];

    const steelDarkMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.42, metalness: 0.78 }),
    );
    const clampMetalMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.3, metalness: 0.88 }),
    );
    const goldAccentMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#b45309',
        emissiveIntensity: 0.45,
        roughness: 0.25,
        metalness: 0.82,
      }),
    );
    const holoCyanMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 1.5,
        roughness: 0.18,
        metalness: 0.3,
      }),
    );
    const holoWireMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#67e8f9',
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const legGeo = this.addGeo(new THREE.BoxGeometry(0.18, 0.88, 0.18));
    const lowerShelfGeo = this.addGeo(new THREE.BoxGeometry(1.9, 0.08, 0.84));
    const tableTopGeo = this.addGeo(new THREE.BoxGeometry(2.2, 0.16, 1.1));
    const clampBaseGeo = this.addGeo(new THREE.BoxGeometry(0.28, 0.24, 0.48));
    const clampJawGeo = this.addGeo(new THREE.BoxGeometry(0.16, 0.28, 0.24));
    const clampBoltGeo = this.addGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8));
    clampBoltGeo.rotateZ(Math.PI * 0.5);
    const gantryPostGeo = this.addGeo(new THREE.BoxGeometry(0.1, 0.62, 0.1));
    const gantryHeaderGeo = this.addGeo(new THREE.BoxGeometry(1.75, 0.18, 0.14));
    const gantryStripGeo = this.addGeo(new THREE.BoxGeometry(1.45, 0.06, 0.04));
    const padBaseGeo = this.addGeo(new THREE.CylinderGeometry(0.46, 0.52, 0.06, 16));
    const padCoreGeo = this.addGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 16));
    const holoBeamGeo = this.addGeo(new THREE.CylinderGeometry(0.48, 0.3, 0.52, 14, 1, true));
    const reticleRingGeo = this.addGeo(new THREE.TorusGeometry(0.36, 0.032, 8, 24));
    const reticleDiamondGeo = this.addGeo(new THREE.OctahedronGeometry(0.14, 0));
    const reticleBarGeo = this.addGeo(new THREE.BoxGeometry(0.68, 0.025, 0.025));

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;

      const x = poi.x + spec.dx;
      const z = poi.z + spec.dz;
      const y = terrain.getHeightAt(x, z);

      const data: UpgradeBenchEntity = {
        id: spec.id,
        poiId: spec.poiId,
        x,
        y,
        z,
        rotationY: spec.rotationY,
      };
      this.upgradeBenches.push(data);

      const benchGroup = new THREE.Group();
      benchGroup.name = `UpgradeBench_${spec.id}`;
      benchGroup.position.set(x, y, z);
      benchGroup.rotation.y = spec.rotationY;

      // 4 heavy corner legs + lower shelf + solid tabletop
      for (const lx of [-0.94, 0.94]) {
        for (const lz of [-0.4, 0.4]) {
          const leg = new THREE.Mesh(legGeo, steelDarkMat);
          leg.position.set(lx, 0.44, lz);
          leg.castShadow = true;
          leg.receiveShadow = true;
          benchGroup.add(leg);
        }
      }

      const lowerShelf = new THREE.Mesh(lowerShelfGeo, steelDarkMat);
      lowerShelf.position.set(0, 0.24, 0);
      lowerShelf.receiveShadow = true;
      benchGroup.add(lowerShelf);

      const tableTop = new THREE.Mesh(tableTopGeo, steelDarkMat);
      tableTop.position.set(0, 0.92, 0);
      tableTop.castShadow = true;
      tableTop.receiveShadow = true;
      benchGroup.add(tableTop);

      // Metallic side clamps (left & right vice assemblies with gold bolts)
      for (const side of [-1, 1]) {
        const clampBase = new THREE.Mesh(clampBaseGeo, clampMetalMat);
        clampBase.position.set(side * 0.86, 1.12, 0);
        clampBase.castShadow = true;
        benchGroup.add(clampBase);

        const clampJaw = new THREE.Mesh(clampJawGeo, clampMetalMat);
        clampJaw.position.set(side * 0.72, 1.16, 0);
        benchGroup.add(clampJaw);

        const clampBolt = new THREE.Mesh(clampBoltGeo, goldAccentMat);
        clampBolt.position.set(side * 0.96, 1.12, 0);
        benchGroup.add(clampBolt);
      }

      // Rear tool/holo header bar
      for (const gx of [-0.82, 0.82]) {
        const post = new THREE.Mesh(gantryPostGeo, clampMetalMat);
        post.position.set(gx, 1.31, -0.46);
        post.castShadow = true;
        benchGroup.add(post);
      }
      const header = new THREE.Mesh(gantryHeaderGeo, steelDarkMat);
      header.position.set(0, 1.66, -0.46);
      header.castShadow = true;
      benchGroup.add(header);

      const statusStrip = new THREE.Mesh(gantryStripGeo, goldAccentMat);
      statusStrip.position.set(0, 1.66, -0.38);
      benchGroup.add(statusStrip);

      // Holographic cyan/gold weapon projection pad
      const padBase = new THREE.Mesh(padBaseGeo, clampMetalMat);
      padBase.position.set(0, 1.01, 0.04);
      benchGroup.add(padBase);

      const padCore = new THREE.Mesh(padCoreGeo, holoCyanMat);
      padCore.position.set(0, 1.02, 0.04);
      benchGroup.add(padCore);

      const holoBeam = new THREE.Mesh(holoBeamGeo, holoWireMat);
      holoBeam.position.set(0, 1.31, 0.04);
      benchGroup.add(holoBeam);

      // Animated floating holographic reticle
      const reticleGroup = new THREE.Group();
      reticleGroup.position.set(0, 1.44, 0.04);

      const holoRing = new THREE.Mesh(reticleRingGeo, goldAccentMat);
      reticleGroup.add(holoRing);

      const diamond = new THREE.Mesh(reticleDiamondGeo, holoCyanMat);
      reticleGroup.add(diamond);

      const barH = new THREE.Mesh(reticleBarGeo, holoWireMat);
      const barV = new THREE.Mesh(reticleBarGeo, holoWireMat);
      barV.rotation.z = Math.PI * 0.5;
      reticleGroup.add(barH, barV);

      benchGroup.add(reticleGroup);
      this.group.add(benchGroup);

      const cosR = Math.abs(Math.cos(spec.rotationY));
      const sinR = Math.abs(Math.sin(spec.rotationY));
      const halfX = 1.1 * cosR + 0.55 * sinR;
      const halfZ = 1.1 * sinR + 0.55 * cosR;

      const collider: ColliderBox = {
        id: `${spec.id}_col`,
        minX: x - halfX,
        minY: y,
        minZ: z - halfZ,
        maxX: x + halfX,
        maxY: y + 1.45,
        maxZ: z + halfZ,
        material: 'metal',
        tag: `upgrade_bench:${spec.id}`,
      };

      this.upgradeBenchVisuals.push({
        data,
        group: benchGroup,
        reticleGroup,
        holoRing,
        baseReticleY: 1.44,
        collider,
      });
    }
  }

  private buildCampfires(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{ id: string; poiId: string; dx: number; dz: number }> = [
      { id: 'campfire_whispering_pines', poiId: 'whispering_pines', dx: 2, dz: -2 },
      { id: 'campfire_crystal_basin', poiId: 'crystal_basin', dx: 10, dz: -8 },
      { id: 'campfire_sunken_oasis', poiId: 'sunken_oasis', dx: -16, dz: 10 },
      { id: 'campfire_sunny_suburbs', poiId: 'sunny_suburbs', dx: 0, dz: -22 },
      { id: 'campfire_frostpeak_citadel', poiId: 'frostpeak_citadel', dx: -9, dz: 24 },
      { id: 'campfire_scorched_caldera', poiId: 'scorched_caldera', dx: 15, dz: 3 },
    ];

    const stoneMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.9, metalness: 0.06 }),
    );
    const darkStoneMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.92, metalness: 0.05 }),
    );
    const ashBedMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#1e1b18', roughness: 0.95, metalness: 0.02 }),
    );
    const charredLogMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.88, metalness: 0.04 }),
    );
    const emberUnlitMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#292524',
        emissive: '#7c2d12',
        emissiveIntensity: 0.08,
        roughness: 0.92,
      }),
    );
    const emberLitMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#ea580c',
        emissive: '#f97316',
        emissiveIntensity: 1.75,
        roughness: 0.45,
      }),
    );
    const flameOuterMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#ea580c',
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const flameMidMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#f59e0b',
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const flameCoreMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#fef08a',
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const stoneGeo = this.addGeo(new THREE.DodecahedronGeometry(0.19, 0));
    const ashGeo = this.addGeo(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 12));
    const emberGeo = this.addGeo(new THREE.CylinderGeometry(0.32, 0.42, 0.12, 10));
    const logGeo = this.addGeo(new THREE.CylinderGeometry(0.08, 0.1, 1.05, 8));
    const flameOuterGeo = this.addGeo(new THREE.ConeGeometry(0.36, 1.15, 7));
    const flameMidGeo = this.addGeo(new THREE.ConeGeometry(0.25, 0.88, 7));
    const flameCoreGeo = this.addGeo(new THREE.ConeGeometry(0.14, 0.58, 6));
    const sparkGeo = this.addGeo(new THREE.OctahedronGeometry(0.055, 0));

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;

      const x = poi.x + spec.dx;
      const z = poi.z + spec.dz;
      const y = terrain.getHeightAt(x, z);

      const data: CampfireEntity = {
        id: spec.id,
        poiId: spec.poiId,
        x,
        y,
        z,
        lit: false,
        remainingSec: 25,
        maxDurationSec: 25,
        healPerSec: 3,
        radius: 5.5,
      };
      this.campfires.push(data);

      const fireGroup = new THREE.Group();
      fireGroup.name = `Campfire_${spec.id}`;
      fireGroup.position.set(x, y, z);

      // Ash bed + dark ember core
      const ashBed = new THREE.Mesh(ashGeo, ashBedMat);
      ashBed.position.y = 0.03;
      ashBed.receiveShadow = true;
      fireGroup.add(ashBed);

      const emberMesh = new THREE.Mesh(emberGeo, emberUnlitMat);
      emberMesh.position.y = 0.08;
      fireGroup.add(emberMesh);

      // 10-stone fire ring
      const stoneCount = 10;
      for (let s = 0; s < stoneCount; s++) {
        const ang = (s / stoneCount) * Math.PI * 2;
        const stone = new THREE.Mesh(stoneGeo, s % 2 === 0 ? stoneMat : darkStoneMat);
        stone.position.set(Math.cos(ang) * 0.68, 0.12, Math.sin(ang) * 0.68);
        stone.scale.set(1.0 + (s % 3) * 0.14, 0.72, 0.95);
        stone.rotation.set(s * 0.3, ang, s * 0.2);
        stone.castShadow = true;
        stone.receiveShadow = true;
        fireGroup.add(stone);
      }

      // 4 crossed charred logs
      for (let l = 0; l < 4; l++) {
        const ang = (l / 4) * Math.PI * 2 + 0.35;
        const log = new THREE.Mesh(logGeo, charredLogMat);
        log.position.set(Math.cos(ang) * 0.14, 0.22, Math.sin(ang) * 0.14);
        log.rotation.order = 'YXZ';
        log.rotation.y = ang;
        log.rotation.z = 1.05;
        log.castShadow = true;
        fireGroup.add(log);
      }

      // Multi-layer flickering flame cones + rising spark motes (hidden until lit)
      const flameGroup = new THREE.Group();
      flameGroup.visible = false;

      const fOuter = new THREE.Mesh(flameOuterGeo, flameOuterMat);
      fOuter.position.y = 0.62;
      const fMid = new THREE.Mesh(flameMidGeo, flameMidMat);
      fMid.position.y = 0.52;
      const fCore = new THREE.Mesh(flameCoreGeo, flameCoreMat);
      fCore.position.y = 0.4;
      flameGroup.add(fOuter, fMid, fCore);

      const sparks: THREE.Mesh[] = [];
      for (let sp = 0; sp < 3; sp++) {
        const spark = new THREE.Mesh(sparkGeo, flameCoreMat);
        spark.position.set(0, 0.7 + sp * 0.28, 0);
        flameGroup.add(spark);
        sparks.push(spark);
      }

      fireGroup.add(flameGroup);
      this.group.add(fireGroup);

      this.campfiresMap.set(spec.id, {
        data,
        group: fireGroup,
        emberMesh,
        emberUnlitMat,
        emberLitMat,
        flameGroup,
        flames: [fOuter, fMid, fCore],
        sparks,
      });
    }
  }

  private buildSlurpBarrels(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const clusterSpecs: Array<{
      poiId: string;
      offsets: Array<[number, number]>;
    }> = [
      { poiId: 'metro_towers', offsets: [[6, -8], [7.6, -8], [6.8, -6.5]] },
      { poiId: 'sunny_suburbs', offsets: [[19, 3], [20.6, 3]] },
      { poiId: 'crystal_basin', offsets: [[9, 10], [10.6, 10]] },
      { poiId: 'market_row', offsets: [[-1, -15], [0.6, -15], [-0.2, -16.5]] },
      { poiId: 'crater_depot', offsets: [[24, -19], [25.6, -19], [24.8, -20.5]] },
      { poiId: 'whispering_pines', offsets: [[1, 16], [2.6, 16]] },
      { poiId: 'frostpeak_citadel', offsets: [[6, 24], [7.6, 24]] },
      { poiId: 'scorched_caldera', offsets: [[22, -14], [23.6, -14], [22.8, -15.5]] },
      { poiId: 'sunken_oasis', offsets: [[8, -6], [9.6, -6]] },
      { poiId: 'skyline_spire', offsets: [[8, 1], [9.6, 1]] },
    ];

    const slurpBodyMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#06b6d4',
        emissive: '#0ea5e9',
        emissiveIntensity: 0.72,
        roughness: 0.16,
        metalness: 0.25,
      }),
    );
    const slurpGlowMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#67e8f9',
        emissive: '#22d3ee',
        emissiveIntensity: 1.45,
        roughness: 0.12,
        metalness: 0.15,
      }),
    );
    const bandMetalMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.32,
        metalness: 0.85,
      }),
    );

    const barrelBodyGeo = this.addGeo(new THREE.CylinderGeometry(0.42, 0.42, 1.12, 16));
    const hoopGeo = this.addGeo(new THREE.CylinderGeometry(0.455, 0.455, 0.1, 16));
    const lidGeo = this.addGeo(new THREE.CylinderGeometry(0.38, 0.42, 0.08, 16));
    const valveGeo = this.addGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10));
    const gaugeGeo = this.addGeo(new THREE.BoxGeometry(0.14, 0.62, 0.08));

    let barrelIdx = 0;
    for (const cluster of clusterSpecs) {
      const poi = poiMap.get(cluster.poiId);
      if (!poi) continue;

      for (const [dx, dz] of cluster.offsets) {
        const id = `slurp_${cluster.poiId}_${++barrelIdx}`;
        const x = poi.x + dx;
        const z = poi.z + dz;
        const y = terrain.getHeightAt(x, z);

        const data: SlurpBarrelEntity = {
          id,
          x,
          y,
          z,
          hp: 40,
          maxHp: 40,
          shieldAmount: 15,
          destroyed: false,
        };
        this.slurpBarrels.push(data);

        const barrelGroup = new THREE.Group();
        barrelGroup.name = `SlurpBarrel_${id}`;
        barrelGroup.position.set(x, y, z);

        const bodyGroup = new THREE.Group();

        const tank = new THREE.Mesh(barrelBodyGeo, slurpBodyMat);
        tank.position.y = 0.58;
        tank.castShadow = true;
        tank.receiveShadow = true;
        bodyGroup.add(tank);

        // Top, middle, and bottom metallic bands
        for (const hy of [0.1, 0.58, 1.06]) {
          const hoop = new THREE.Mesh(hoopGeo, bandMetalMat);
          hoop.position.y = hy;
          hoop.castShadow = true;
          bodyGroup.add(hoop);
        }

        const lid = new THREE.Mesh(lidGeo, bandMetalMat);
        lid.position.y = 1.14;
        bodyGroup.add(lid);

        const valve = new THREE.Mesh(valveGeo, slurpGlowMat);
        valve.position.set(0.14, 1.2, 0);
        bodyGroup.add(valve);

        const gauge = new THREE.Mesh(gaugeGeo, slurpGlowMat);
        gauge.position.set(0, 0.58, 0.41);
        bodyGroup.add(gauge);

        barrelGroup.add(bodyGroup);
        this.group.add(barrelGroup);

        const collider: ColliderBox = {
          id: `${id}_col`,
          minX: x - 0.52,
          minY: y,
          minZ: z - 0.52,
          maxX: x + 0.52,
          maxY: y + 1.25,
          maxZ: z + 0.52,
          material: 'metal',
          tag: `slurp_barrel:${id}`,
        };

        this.slurpBarrelsMap.set(id, {
          data,
          group: barrelGroup,
          bodyGroup,
          collider,
          hitAnim: 0,
        });
      }
    }
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  getLaunchPads(): LaunchPadEntity[] {
    return this.launchPads;
  }

  getZiplines(): ZiplineEntity[] {
    return this.ziplines;
  }

  getVaults(): VaultEntity[] {
    return this.vaults;
  }

  getVaultColliders(): ColliderBox[] {
    const out: ColliderBox[] = [];
    for (const v of this.vaultsMap.values()) {
      out.push(...v.wallColliders);
      if (!v.data.unlocked) {
        out.push(v.doorCollider);
      }
    }
    return out;
  }

  getUpgradeBenches(): UpgradeBenchEntity[] {
    return this.upgradeBenches;
  }

  getNearestUpgradeBench(
    x: number,
    y: number,
    z: number,
    maxDist = Infinity,
  ): UpgradeBenchEntity | null {
    let best: UpgradeBenchEntity | null = null;
    let bestDist = maxDist;
    for (let i = 0; i < this.upgradeBenches.length; i++) {
      const b = this.upgradeBenches[i];
      const d = Math.hypot(b.x - x, b.y - y, b.z - z);
      if (d <= bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  getUpgradeBenchColliders(): ColliderBox[] {
    return this.upgradeBenchVisuals.map((v) => v.collider);
  }

  getCampfires(): CampfireEntity[] {
    return this.campfires;
  }

  igniteCampfire(id: string): boolean {
    const entry = this.campfiresMap.get(id);
    if (!entry || entry.data.lit || entry.data.remainingSec <= 0) {
      return false;
    }
    entry.data.lit = true;
    entry.flameGroup.visible = true;
    entry.emberMesh.material = entry.emberLitMat;
    return true;
  }

  getActiveCampfireHealAt(x: number, y: number, z: number): number {
    for (let i = 0; i < this.campfires.length; i++) {
      const c = this.campfires[i];
      if (!c.lit || c.remainingSec <= 0) continue;
      if (Math.hypot(x - c.x, y - c.y, z - c.z) <= c.radius) {
        return c.healPerSec;
      }
    }
    return 0;
  }

  getSlurpBarrels(): SlurpBarrelEntity[] {
    return this.slurpBarrels;
  }

  damageSlurpBarrel(id: string, dmg: number): SlurpBarrelDamageResult | null {
    const entry = this.slurpBarrelsMap.get(id);
    if (!entry || entry.data.destroyed) {
      return null;
    }
    const pos: Vec3Like = { x: entry.data.x, y: entry.data.y, z: entry.data.z };
    if (dmg <= 0) {
      return { destroyed: false, shieldAmount: 0, position: pos };
    }

    entry.data.hp = Math.max(0, entry.data.hp - dmg);
    if (entry.data.hp <= 0) {
      entry.data.hp = 0;
      entry.data.destroyed = true;
      entry.group.visible = false;
      entry.hitAnim = 0;
      return {
        destroyed: true,
        shieldAmount: entry.data.shieldAmount,
        position: pos,
      };
    }

    entry.hitAnim = 1.0;
    return {
      destroyed: false,
      shieldAmount: 0,
      position: pos,
    };
  }

  getSlurpBarrelColliders(): ColliderBox[] {
    const out: ColliderBox[] = [];
    for (const entry of this.slurpBarrelsMap.values()) {
      if (!entry.data.destroyed) {
        out.push(entry.collider);
      }
    }
    return out;
  }

  getStationColliders(): ColliderBox[] {
    return [
      ...this.getUpgradeBenchColliders(),
      ...this.getSlurpBarrelColliders(),
    ];
  }

  getColliders(): ColliderBox[] {
    return [
      ...this.getVaultColliders(),
      ...this.getUpgradeBenchColliders(),
      ...this.getSlurpBarrelColliders(),
    ];
  }

  reset(): void {
    for (const v of this.vaultsMap.values()) {
      v.data.unlocked = false;
      v.data.opened = false;
      v.openProgress = 0;
      v.doorPivot.rotation.y = 0;
      v.wheelGroup.rotation.z = 0;
      v.keypadMat.color.set('#facc15');
      v.keypadMat.emissive.set('#f59e0b');
      v.keypadMat.emissiveIntensity = 1.55;
    }

    for (const b of this.upgradeBenchVisuals) {
      b.group.visible = true;
      b.reticleGroup.position.y = b.baseReticleY;
      b.reticleGroup.rotation.set(0, 0, 0);
    }

    for (const cf of this.campfiresMap.values()) {
      cf.data.lit = false;
      cf.data.remainingSec = cf.data.maxDurationSec;
      cf.flameGroup.visible = false;
      cf.emberMesh.material = cf.emberUnlitMat;
    }

    for (const sb of this.slurpBarrelsMap.values()) {
      sb.data.hp = sb.data.maxHp;
      sb.data.destroyed = false;
      sb.group.visible = true;
      sb.bodyGroup.scale.set(1, 1, 1);
      sb.bodyGroup.rotation.set(0, 0, 0);
      sb.hitAnim = 0;
    }
  }

  unlockVault(vaultId: string): UnlockVaultResult {
    const entry = this.vaultsMap.get(vaultId);
    if (!entry || entry.data.unlocked) {
      return { unlocked: false };
    }

    entry.data.unlocked = true;
    entry.keypadMat.color.set('#22d3ee');
    entry.keypadMat.emissive.set('#06b6d4');
    entry.keypadMat.emissiveIntensity = 1.9;

    this.eventBus?.emit('sound:play', {
      id: 'vault_unlock',
      position: { x: entry.data.x, y: entry.data.y + 1.4, z: entry.data.z },
      spatial: true,
    });
    this.eventBus?.emit('vfx:chest_open', {
      position: { ...entry.lootPos },
    });

    return {
      unlocked: true,
      lootPos: { ...entry.lootPos },
    };
  }

  update(dt: number, elapsed: number): void {
    const safeDt = Math.max(0, dt);

    for (let i = 0; i < this.padVisuals.length; i++) {
      const pv = this.padVisuals[i];
      pv.spinner.rotation.y += safeDt * (pv.data.kind === 'launch_pad' ? 2.4 : 1.8);
      const phase = (elapsed * 1.4 + i * 0.31) % 1;
      pv.pulseRing.position.y = pv.baseY + phase * (pv.data.kind === 'launch_pad' ? 1.4 : 2.6);
      const scale = 1.0 + phase * 0.4;
      pv.pulseRing.scale.set(scale, scale, scale);
    }

    for (let i = 0; i < this.ziplineOrbs.length; i++) {
      const o = this.ziplineOrbs[i];
      o.t = (o.t + safeDt * 0.22) % 1;
      const s = o.zipline.start;
      const e = o.zipline.end;
      o.mesh.position.set(
        s.x + (e.x - s.x) * o.t,
        s.y + (e.y - s.y) * o.t,
        s.z + (e.z - s.z) * o.t,
      );
    }

    // Animate Boss Vaults (armored door swing + wheel spin + keypad pulse)
    let vaultIdx = 0;
    for (const v of this.vaultsMap.values()) {
      const pulse = 1.0 + Math.sin(elapsed * 3.8 + vaultIdx * 1.2) * 0.1;
      v.keypadRing.scale.set(pulse, pulse, pulse);
      v.interiorGlow.rotation.y = elapsed * 1.2;

      if (v.data.unlocked && v.openProgress < 1) {
        v.openProgress = Math.min(1, v.openProgress + safeDt * 0.95);
        const eased = 1 - Math.pow(1 - v.openProgress, 3);
        v.doorPivot.rotation.y = -eased * 1.95;
        v.wheelGroup.rotation.z = eased * Math.PI * 3.0;
        if (v.openProgress >= 0.999) {
          v.openProgress = 1;
          v.data.opened = true;
        }
      }
      vaultIdx++;
    }

    // Animate Upgrade Bench floating holographic reticles
    for (let i = 0; i < this.upgradeBenchVisuals.length; i++) {
      const b = this.upgradeBenchVisuals[i];
      b.reticleGroup.position.y = b.baseReticleY + Math.sin(elapsed * 2.6 + i * 0.9) * 0.08;
      b.reticleGroup.rotation.y = elapsed * 1.85 + i * 0.5;
      b.holoRing.rotation.z = elapsed * 1.15;
    }

    // Update & flicker lit Campfires; extinguish when remainingSec <= 0
    let cfIdx = 0;
    for (const cf of this.campfiresMap.values()) {
      if (cf.data.lit && cf.data.remainingSec > 0) {
        cf.data.remainingSec = Math.max(0, cf.data.remainingSec - safeDt);
        if (cf.data.remainingSec <= 0) {
          cf.data.remainingSec = 0;
          cf.data.lit = false;
          cf.flameGroup.visible = false;
          cf.emberMesh.material = cf.emberUnlitMat;
        } else {
          cf.flameGroup.visible = true;
          const phase = elapsed * 12.0 + cfIdx * 1.7;
          for (let f = 0; f < cf.flames.length; f++) {
            const flame = cf.flames[f];
            const flickerY = 0.86 + Math.sin(phase + f * 2.1) * 0.16 + Math.cos(phase * 1.37 + f) * 0.08;
            const flickerXZ = 0.92 + Math.cos(phase * 1.15 + f * 1.4) * 0.1;
            flame.scale.set(flickerXZ, Math.max(0.55, flickerY), flickerXZ);
            flame.rotation.y = elapsed * (2.2 + f * 0.9) * (f % 2 === 0 ? 1 : -1);
            flame.rotation.z = Math.sin(phase * 0.65 + f) * 0.08;
          }
          for (let sp = 0; sp < cf.sparks.length; sp++) {
            const spark = cf.sparks[sp];
            const cycle = (elapsed * 0.85 + sp * 0.33 + cfIdx * 0.21) % 1;
            const ang = elapsed * 2.4 + sp * 2.1;
            const rad = 0.12 + cycle * 0.22;
            spark.position.set(Math.cos(ang) * rad, 0.35 + cycle * 1.15, Math.sin(ang) * rad);
            const sScale = 1.0 - cycle * 0.65;
            spark.scale.set(sScale, sScale, sScale);
          }
        }
      } else if (cf.flameGroup.visible) {
        cf.flameGroup.visible = false;
      }
      cfIdx++;
    }

    // Decay hit wobble animation on damaged Slurp Barrels
    for (const sb of this.slurpBarrelsMap.values()) {
      if (sb.hitAnim > 0) {
        sb.hitAnim = Math.max(0, sb.hitAnim - safeDt * 5.5);
        const wobble = Math.sin(sb.hitAnim * Math.PI * 3.0) * sb.hitAnim * 0.12;
        sb.bodyGroup.rotation.z = wobble;
        const squash = 1.0 - sb.hitAnim * 0.08;
        sb.bodyGroup.scale.set(1.0 + sb.hitAnim * 0.06, squash, 1.0 + sb.hitAnim * 0.06);
        if (sb.hitAnim === 0) {
          sb.bodyGroup.rotation.z = 0;
          sb.bodyGroup.scale.set(1, 1, 1);
        }
      }
    }
  }

  dispose(): void {
    this.group.clear();
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.padVisuals = [];
    this.ziplineOrbs = [];
    this.launchPads = [];
    this.ziplines = [];
    this.vaults = [];
    this.vaultsMap.clear();
    this.upgradeBenches = [];
    this.upgradeBenchVisuals = [];
    this.campfires = [];
    this.campfiresMap.clear();
    this.slurpBarrels = [];
    this.slurpBarrelsMap.clear();
  }
}
