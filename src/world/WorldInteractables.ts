import * as THREE from 'three';
import { EventBus, POIS } from '../core';
import type {
  ColliderBox,
  LaunchPadEntity,
  TerrainQuery,
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

export class WorldInteractables {
  private group = new THREE.Group();
  private eventBus?: EventBus;
  private launchPads: LaunchPadEntity[] = [];
  private ziplines: ZiplineEntity[] = [];
  private vaults: VaultEntity[] = [];
  private vaultsMap = new Map<string, VaultVisual>();
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
  }
}
