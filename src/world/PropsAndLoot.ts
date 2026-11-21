import * as THREE from 'three';
import {
  EventBus,
  ISLAND_RADIUS,
  POIS,
  RARITY_COLORS,
  WEAPONS,
  dist3D,
  mulberry32,
} from '../core';
import type {
  AmmoType,
  ChestEntity,
  ColliderBox,
  HarvestableProp,
  ItemInstance,
  LootDrop,
  MaterialType,
  PropKind,
  Rarity,
  SupplyDrop,
  TerrainQuery,
  Vec3Like,
  WeaponId,
} from '../types';
import { TextureFactory } from './TextureFactory';
import type { ChestSpot, FloorLootSpot } from './WorldBuilder';

export interface DamagePropResult {
  hit: boolean;
  destroyed: boolean;
  isCrit: boolean;
  matType: MaterialType;
  yieldAmount: number;
  weakpointPos?: Vec3Like;
}

export interface LootPayload {
  item?: ItemInstance;
  ammo?: { type: AmmoType; amount: number };
  materials?: { type: MaterialType; amount: number };
}

interface PropEntry {
  data: HarvestableProp;
  mesh: THREE.Group;
  collider: ColliderBox;
}

interface ChestEntry {
  data: ChestEntity;
  group: THREE.Group;
  lidPivot: THREE.Group;
  auraMesh: THREE.Mesh;
}

interface LootEntry {
  data: LootDrop;
  group: THREE.Group;
  itemSpinMesh: THREE.Object3D;
  pillarMesh: THREE.Mesh;
}

interface SupplyEntry {
  data: SupplyDrop;
  group: THREE.Group;
  chuteGroup: THREE.Group;
  beaconMesh: THREE.Mesh;
}

const WEAPON_LOOT_POOL_FLOOR: WeaponId[] = [
  'ar',
  'burst_ar',
  'pump_shotgun',
  'tac_shotgun',
  'smg',
  'pistol',
  'sniper',
];

const WEAPON_LOOT_POOL_CHEST: WeaponId[] = [
  'ar',
  'burst_ar',
  'pump_shotgun',
  'tac_shotgun',
  'smg',
  'sniper',
  'rocket_launcher',
  'pistol',
];

const SUPPLY_DROP_WEAPONS: WeaponId[] = [
  'ar',
  'pump_shotgun',
  'sniper',
  'rocket_launcher',
  'burst_ar',
];

const CONSUMABLE_POOL: Array<{ id: WeaponId; stack: number; weight: number }> = [
  { id: 'mini_shield', stack: 2, weight: 32 },
  { id: 'bandages', stack: 5, weight: 30 },
  { id: 'shield_potion', stack: 1, weight: 16 },
  { id: 'medkit', stack: 1, weight: 14 },
  { id: 'slurp_juice', stack: 1, weight: 8 },
];

const AMMO_CHEST_AMOUNTS: Record<AmmoType, number> = {
  light: 36,
  medium: 30,
  shells: 10,
  heavy: 6,
  rockets: 2,
};

export class PropsAndLoot {
  private terrain: TerrainQuery;
  private eventBus: EventBus;
  private seed: number;
  private rand: () => number;

  private group = new THREE.Group();
  private propsMap = new Map<string, PropEntry>();
  private propsList: HarvestableProp[] = [];
  private chestsMap = new Map<string, ChestEntry>();
  private chestsList: ChestEntity[] = [];
  private lootMap = new Map<string, LootEntry>();
  private lootList: LootDrop[] = [];
  private supplyMap = new Map<string, SupplyEntry>();
  private supplyList: SupplyDrop[] = [];

  private staticColliders: ColliderBox[] = [];
  private buildingZones: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];

  private textures = new TextureFactory();
  private sharedMaterials = new Map<string, THREE.Material>();
  private sharedGeometries = new Map<string, THREE.BufferGeometry>();

  private uidCounter = 0;
  private dropCounter = 0;
  private supplyCounter = 0;

  constructor(terrain: TerrainQuery, eventBus: EventBus, seed = 4201) {
    this.terrain = terrain;
    this.eventBus = eventBus;
    this.seed = seed;
    this.rand = mulberry32(seed + 777);
    this.group.name = 'PropsAndLoot';
  }

  private getGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.sharedGeometries.get(key);
    if (!g) {
      g = factory();
      this.sharedGeometries.set(key, g);
    }
    return g;
  }

  private getMat(key: string, factory: () => THREE.Material): THREE.Material {
    let m = this.sharedMaterials.get(key);
    if (!m) {
      m = factory();
      this.sharedMaterials.set(key, m);
    }
    return m;
  }

  private nextItemUid(): string {
    return `item_${++this.uidCounter}`;
  }

  private isInsideBuildingZone(x: number, z: number, margin = 1.6): boolean {
    for (let i = 0; i < this.buildingZones.length; i++) {
      const b = this.buildingZones[i];
      if (
        x >= b.minX - margin &&
        x <= b.maxX + margin &&
        z >= b.minZ - margin &&
        z <= b.maxZ + margin
      ) {
        return true;
      }
    }
    return false;
  }

  private getSupportFloorY(x: number, z: number, belowY: number): number {
    let bestY = this.terrain.getHeightAt(x, z);
    for (let i = 0; i < this.staticColliders.length; i++) {
      const c = this.staticColliders[i];
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) {
        if (c.maxY <= belowY + 0.45 && c.maxY > bestY) {
          bestY = c.maxY;
        }
      }
    }
    return bestY;
  }

  populate(
    chestSpots: ChestSpot[],
    floorLootSpots: FloorLootSpot[],
    colliders: ColliderBox[],
  ): void {
    this.clearEntities();
    this.rand = mulberry32(this.seed + 777);
    this.staticColliders = colliders.slice();
    this.buildingZones = [];

    for (const c of colliders) {
      if (c.tag && c.tag.startsWith('building')) {
        this.buildingZones.push({
          minX: c.minX,
          maxX: c.maxX,
          minZ: c.minZ,
          maxZ: c.maxZ,
        });
      }
    }

    // 1. Spawn Chests (>= 55)
    const allChestSpots: ChestSpot[] = chestSpots.map((s) => ({ ...s }));
    let extraChestAttempts = 0;
    while (allChestSpots.length < 62 && extraChestAttempts < 1200) {
      extraChestAttempts++;
      const angle = this.rand() * Math.PI * 2;
      const dist = 25 + Math.sqrt(this.rand()) * (ISLAND_RADIUS - 42);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (this.terrain.isWater(x, z)) continue;
      if (this.isInsideBuildingZone(x, z, 2.5)) continue;
      const n = this.terrain.getNormalAt(x, z);
      if (n.y < 0.86) continue;
      if (allChestSpots.some((c) => Math.hypot(c.x - x, c.z - z) < 16)) continue;
      allChestSpots.push({
        x,
        y: this.terrain.getHeightAt(x, z),
        z,
        rotationY: this.rand() * Math.PI * 2,
      });
    }

    for (let i = 0; i < allChestSpots.length; i++) {
      this.createChest(`chest_${i}`, allChestSpots[i]);
    }

    // 2. Spawn Floor Loot (>= 100)
    const allFloorSpots: FloorLootSpot[] = floorLootSpots.map((s) => ({ ...s }));
    let extraFloorAttempts = 0;
    while (allFloorSpots.length < 118 && extraFloorAttempts < 1600) {
      extraFloorAttempts++;
      const angle = this.rand() * Math.PI * 2;
      const dist = 15 + Math.sqrt(this.rand()) * (ISLAND_RADIUS - 35);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (this.terrain.isWater(x, z)) continue;
      if (this.isInsideBuildingZone(x, z, 2.0)) continue;
      const n = this.terrain.getNormalAt(x, z);
      if (n.y < 0.85) continue;
      if (allFloorSpots.some((f) => Math.hypot(f.x - x, f.z - z) < 10)) continue;
      allFloorSpots.push({
        x,
        y: this.terrain.getHeightAt(x, z) + 0.05,
        z,
      });
    }

    for (let i = 0; i < allFloorSpots.length; i++) {
      const spot = allFloorSpots[i];
      const roll = this.rand();
      let payload: LootPayload;
      if (roll < 0.56) {
        const item = this.rollWeaponLoot(false);
        payload = { item };
        // Also drop a small matching ammo pack slightly offset for weapons
        const ammoType = WEAPONS[item.weaponId].ammoType;
        if (ammoType) {
          this.spawnLootDrop(
            { x: spot.x + 0.45, y: spot.y, z: spot.z + 0.3 },
            { ammo: { type: ammoType, amount: Math.max(4, Math.round(AMMO_CHEST_AMOUNTS[ammoType] * 0.5)) } },
          );
        }
      } else if (roll < 0.84) {
        payload = { item: this.rollConsumable() };
      } else {
        const mats: MaterialType[] = ['wood', 'brick', 'metal'];
        payload = {
          materials: {
            type: mats[Math.floor(this.rand() * mats.length)],
            amount: 30,
          },
        };
      }
      this.spawnLootDrop(spot, payload);
    }

    // 3. Spawn Harvestable Props (>= 260, aim ~290)
    const targetProps = 290;
    let attempts = 0;
    let propIdx = 0;

    // Guaranteed clustered vehicles & crates near POIs first
    for (const poi of POIS) {
      if (poi.id === 'crystal_basin') continue;
      const offsets = [
        [-28, 2],
        [28, -4],
        [2, 28],
        [-4, -28],
      ];
      for (const [ox, oz] of offsets) {
        const px = poi.x + ox + (this.rand() - 0.5) * 6;
        const pz = poi.z + oz + (this.rand() - 0.5) * 6;
        if (this.terrain.isWater(px, pz)) continue;
        if (this.isInsideBuildingZone(px, pz, 2.2)) continue;
        const kind: PropKind =
          poi.biome === 'urban'
            ? this.rand() < 0.7 ? 'car' : 'crate'
            : poi.biome === 'highland'
              ? this.rand() < 0.6 ? 'crate' : 'rock'
              : this.rand() < 0.5 ? 'fence' : 'car';
        this.createProp(`prop_${propIdx++}`, kind, px, pz);
      }
    }

    while (this.propsList.length < targetProps && attempts < 4500) {
      attempts++;
      const angle = this.rand() * Math.PI * 2;
      const dist = 10 + Math.sqrt(this.rand()) * (ISLAND_RADIUS - 22);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (this.terrain.isWater(x, z)) continue;
      const y = this.terrain.getHeightAt(x, z);
      if (y < 0.45) continue;
      if (this.isInsideBuildingZone(x, z, 2.2)) continue;
      const n = this.terrain.getNormalAt(x, z);
      if (n.y < 0.82) continue;

      if (allChestSpots.some((c) => Math.hypot(c.x - x, c.z - z) < 2.6)) continue;
      if (this.propsList.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;

      const biome = this.terrain.getBiomeAt(x, z);
      let kind: PropKind;
      const r = this.rand();
      if (biome === 'forest') {
        kind = r < 0.72 ? 'tree_pine' : r < 0.88 ? 'rock' : r < 0.95 ? 'tree_oak' : 'crate';
      } else if (biome === 'highland') {
        kind = r < 0.45 ? 'rock' : r < 0.75 ? 'tree_pine' : r < 0.9 ? 'crate' : 'car';
      } else if (biome === 'urban') {
        kind = r < 0.42 ? 'car' : r < 0.68 ? 'crate' : r < 0.85 ? 'tree_oak' : 'fence';
      } else if (biome === 'beach') {
        kind = r < 0.55 ? 'rock' : r < 0.85 ? 'tree_oak' : 'crate';
      } else {
        kind = r < 0.46 ? 'tree_oak' : r < 0.68 ? 'tree_pine' : r < 0.84 ? 'rock' : r < 0.93 ? 'fence' : 'car';
      }

      this.createProp(`prop_${propIdx++}`, kind, x, z);
    }
  }

  private createProp(id: string, kind: PropKind, x: number, z: number): void {
    const y = this.terrain.getHeightAt(x, z);
    const scale = 0.88 + this.rand() * 0.28;
    const rotY = this.rand() * Math.PI * 2;

    let material: MaterialType = 'wood';
    let maxHp = 150;
    let matYield = 30;
    let radius = 0.65;
    let height = 6.0;

    const visual = new THREE.Group();
    visual.position.set(x, y, z);
    visual.rotation.y = rotY;
    visual.scale.setScalar(scale);

    const barkMat = this.getMat('bark', () =>
      new THREE.MeshStandardMaterial({ map: this.textures.getBarkTexture(), roughness: 0.9 }),
    );
    const woodMat = this.getMat('wood', () =>
      new THREE.MeshStandardMaterial({ map: this.textures.getWoodTexture(), roughness: 0.85 }),
    );
    const rockMat = this.getMat('rock', () =>
      new THREE.MeshStandardMaterial({ map: this.textures.getRockTexture(), roughness: 0.92 }),
    );

    if (kind === 'tree_pine') {
      material = 'wood';
      maxHp = 160;
      matYield = 36;
      radius = 0.65 * scale;
      height = 7.4 * scale;

      const trunk = new THREE.Mesh(
        this.getGeo('pine_trunk', () => new THREE.CylinderGeometry(0.24, 0.42, 3.0, 8)),
        barkMat,
      );
      trunk.position.y = 1.5;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      visual.add(trunk);

      const leafMat = this.getMat('pine_leaf', () =>
        new THREE.MeshStandardMaterial({ color: '#1e6b34', roughness: 0.88 }),
      );
      const coneRadii = [2.2, 1.75, 1.25];
      const coneHeights = [2.6, 2.3, 2.0];
      const coneYs = [3.1, 4.6, 5.9];
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(
          this.getGeo(`pine_cone_${i}`, () => new THREE.ConeGeometry(coneRadii[i], coneHeights[i], 8)),
          leafMat,
        );
        cone.position.y = coneYs[i];
        cone.castShadow = true;
        cone.receiveShadow = true;
        visual.add(cone);
      }
    } else if (kind === 'tree_oak') {
      material = 'wood';
      maxHp = 150;
      matYield = 32;
      radius = 0.68 * scale;
      height = 6.0 * scale;

      const trunk = new THREE.Mesh(
        this.getGeo('oak_trunk', () => new THREE.CylinderGeometry(0.28, 0.46, 2.8, 8)),
        barkMat,
      );
      trunk.position.y = 1.4;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      visual.add(trunk);

      const oakMat = this.getMat('oak_leaf', () =>
        new THREE.MeshStandardMaterial({ color: '#38a83e', roughness: 0.85 }),
      );
      const canopyGeo = this.getGeo('oak_canopy', () => new THREE.DodecahedronGeometry(1.7, 1));
      const offsets: Array<[number, number, number, number]> = [
        [0, 4.2, 0, 1.15],
        [-1.0, 3.7, 0.6, 0.82],
        [1.05, 3.8, -0.5, 0.85],
        [0.2, 4.9, 0.3, 0.78],
      ];
      for (const [cx, cy, cz, cs] of offsets) {
        const puff = new THREE.Mesh(canopyGeo, oakMat);
        puff.position.set(cx, cy, cz);
        puff.scale.setScalar(cs);
        puff.castShadow = true;
        puff.receiveShadow = true;
        visual.add(puff);
      }
    } else if (kind === 'rock') {
      material = 'brick';
      maxHp = 200;
      matYield = 38;
      radius = 1.35 * scale;
      height = 2.1 * scale;

      const boulderGeo = this.getGeo('rock_geo', () => new THREE.DodecahedronGeometry(1.25, 0));
      const main = new THREE.Mesh(boulderGeo, rockMat);
      main.position.y = 0.95;
      main.scale.set(1.15, 0.85, 1.0);
      main.castShadow = true;
      main.receiveShadow = true;
      visual.add(main);

      const side = new THREE.Mesh(boulderGeo, rockMat);
      side.position.set(0.75, 0.55, 0.45);
      side.scale.set(0.65, 0.52, 0.6);
      side.castShadow = true;
      visual.add(side);
    } else if (kind === 'car') {
      material = 'metal';
      maxHp = 250;
      matYield = 44;
      radius = 1.45 * scale;
      height = 1.7 * scale;

      const carColors = ['#ef4444', '#3b82f6', '#facc15', '#10b981', '#f97316', '#e2e8f0'];
      const col = carColors[Math.floor(this.rand() * carColors.length)];
      const bodyMat = this.getMat(`car:${col}`, () =>
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.5 }),
      );
      const wheelMat = this.getMat('car_wheel', () =>
        new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 }),
      );
      const glassMat = this.getMat('car_glass', () =>
        new THREE.MeshStandardMaterial({ color: '#7dd3fc', roughness: 0.15, metalness: 0.4 }),
      );

      const chassis = new THREE.Mesh(
        this.getGeo('car_chassis', () => new THREE.BoxGeometry(2.0, 0.72, 4.1)),
        bodyMat,
      );
      chassis.position.y = 0.62;
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      visual.add(chassis);

      const cabin = new THREE.Mesh(
        this.getGeo('car_cabin', () => new THREE.BoxGeometry(1.75, 0.65, 2.0)),
        glassMat,
      );
      cabin.position.set(0, 1.25, -0.15);
      cabin.castShadow = true;
      visual.add(cabin);

      const wheelGeo = this.getGeo('car_wheel_geo', () => {
        const g = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
        g.rotateZ(Math.PI * 0.5);
        return g;
      });
      for (const wx of [-0.95, 0.95]) {
        for (const wz of [-1.25, 1.25]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.position.set(wx, 0.36, wz);
          visual.add(w);
        }
      }
    } else if (kind === 'crate') {
      material = 'wood';
      maxHp = 90;
      matYield = 22;
      radius = 0.78 * scale;
      height = 1.3 * scale;

      const crate = new THREE.Mesh(
        this.getGeo('crate_geo', () => new THREE.BoxGeometry(1.3, 1.3, 1.3)),
        woodMat,
      );
      crate.position.y = 0.65;
      crate.castShadow = true;
      crate.receiveShadow = true;
      visual.add(crate);
    } else {
      // fence
      material = 'wood';
      maxHp = 75;
      matYield = 14;
      radius = 0.9 * scale;
      height = 1.2 * scale;

      const fenceMat = this.getMat('fence_white', () =>
        new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.78 }),
      );
      const railGeo = this.getGeo('fence_rail', () => new THREE.BoxGeometry(2.4, 0.14, 0.1));
      const postGeo = this.getGeo('fence_post', () => new THREE.BoxGeometry(0.16, 1.15, 0.16));
      for (const ry of [0.4, 0.85]) {
        const rail = new THREE.Mesh(railGeo, fenceMat);
        rail.position.y = ry;
        rail.castShadow = true;
        visual.add(rail);
      }
      for (const px of [-1.0, 0, 1.0]) {
        const post = new THREE.Mesh(postGeo, fenceMat);
        post.position.set(px, 0.57, 0);
        post.castShadow = true;
        visual.add(post);
      }
    }

    this.group.add(visual);

    const colliderRadius = kind === 'car' ? 1.45 * scale : kind === 'rock' ? 1.25 * scale : radius;
    const collider: ColliderBox = {
      id: `prop_col_${id}`,
      minX: x - colliderRadius,
      minY: y,
      minZ: z - colliderRadius,
      maxX: x + colliderRadius,
      maxY: y + height,
      maxZ: z + colliderRadius,
      material,
      tag: `prop:${kind}`,
    };

    const wpAngle = rotY;
    const wpPos: Vec3Like = {
      x: x + Math.sin(wpAngle) * (radius + 0.08),
      y: y + Math.min(1.25, height * 0.55),
      z: z + Math.cos(wpAngle) * (radius + 0.08),
    };

    const data: HarvestableProp = {
      id,
      kind,
      material,
      x,
      y,
      z,
      rotationY: rotY,
      scale,
      hp: maxHp,
      maxHp,
      matYield,
      radius,
      height,
      destroyed: false,
      weakpointWorldPos: wpPos,
    };

    this.propsList.push(data);
    this.propsMap.set(id, { data, mesh: visual, collider });
  }

  private createChest(id: string, spot: ChestSpot): void {
    const chestMat = this.getMat('chest_mat', () =>
      new THREE.MeshStandardMaterial({
        map: this.textures.getChestTexture(),
        roughness: 0.35,
        metalness: 0.45,
        emissive: '#f59e0b',
        emissiveIntensity: 0.28,
      }),
    );
    const auraMat = this.getMat('chest_aura', () =>
      new THREE.MeshBasicMaterial({
        color: '#fde047',
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const group = new THREE.Group();
    group.position.set(spot.x, spot.y, spot.z);
    group.rotation.y = spot.rotationY;

    const base = new THREE.Mesh(
      this.getGeo('chest_base', () => new THREE.BoxGeometry(1.1, 0.56, 0.72)),
      chestMat,
    );
    base.position.y = 0.28;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.56, -0.36);
    const lid = new THREE.Mesh(
      this.getGeo('chest_lid', () => new THREE.BoxGeometry(1.14, 0.26, 0.76)),
      chestMat,
    );
    lid.position.set(0, 0.13, 0.36);
    lid.castShadow = true;
    lidPivot.add(lid);
    group.add(lidPivot);

    const auraMesh = new THREE.Mesh(
      this.getGeo('chest_aura_geo', () => new THREE.CylinderGeometry(0.7, 0.9, 1.5, 12, 1, true)),
      auraMat,
    );
    auraMesh.position.y = 0.75;
    group.add(auraMesh);

    this.group.add(group);

    const data: ChestEntity = {
      id,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      rotationY: spot.rotationY,
      opened: false,
      openProgress: 0,
    };

    this.chestsList.push(data);
    this.chestsMap.set(id, { data, group, lidPivot, auraMesh });
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  getProps(): HarvestableProp[] {
    return this.propsList;
  }

  getActivePropColliders(): ColliderBox[] {
    const out: ColliderBox[] = [];
    for (const p of this.propsList) {
      if (p.destroyed) continue;
      const entry = this.propsMap.get(p.id);
      if (entry) out.push(entry.collider);
    }
    return out;
  }

  getChests(): ChestEntity[] {
    return this.chestsList;
  }

  getLootDrops(): LootDrop[] {
    return this.lootList;
  }

  getSupplyDrops(): SupplyDrop[] {
    return this.supplyList;
  }

  damageProp(
    propId: string,
    amount: number,
    hitPoint: Vec3Like,
    isPickaxe: boolean,
  ): DamagePropResult {
    const entry = this.propsMap.get(propId);
    if (!entry || entry.data.destroyed) {
      return {
        hit: false,
        destroyed: false,
        isCrit: false,
        matType: 'wood',
        yieldAmount: 0,
      };
    }

    const prop = entry.data;
    const isCrit = Boolean(
      isPickaxe &&
        prop.weakpointWorldPos &&
        dist3D(hitPoint, prop.weakpointWorldPos) <= 0.85,
    );

    const effectiveDamage = isCrit ? amount * 2 : amount;
    const prevHp = prop.hp;
    prop.hp = Math.max(0, prop.hp - effectiveDamage);
    const destroyed = prop.hp <= 0;

    const damageRatio = Math.min(prevHp, effectiveDamage) / prop.maxHp;
    const yieldAmount = Math.max(
      1,
      Math.round(prop.matYield * damageRatio) + (isCrit ? 4 : 0),
    );

    const dx = hitPoint.x - prop.x;
    const dz = hitPoint.z - prop.z;
    const len = Math.hypot(dx, dz) || 1;
    const normal: Vec3Like = { x: dx / len, y: 0.15, z: dz / len };

    this.eventBus.emit('vfx:impact', {
      position: { ...hitPoint },
      normal,
      material: prop.material,
    });
    this.eventBus.emit('sound:play', {
      id:
        prop.material === 'wood'
          ? 'hit_wood'
          : prop.material === 'brick'
            ? 'hit_brick'
            : 'hit_metal',
      position: { ...hitPoint },
      spatial: true,
    });

    if (isCrit) {
      this.eventBus.emit('sound:play', {
        id: 'weakpoint_crit',
        position: { ...hitPoint },
        spatial: true,
      });
    }

    if (destroyed) {
      prop.destroyed = true;
      entry.mesh.visible = false;
      this.eventBus.emit('vfx:weakpoint', {
        propId,
        position: prop.weakpointWorldPos ?? { ...hitPoint },
        normal,
        active: false,
      });
      this.eventBus.emit('sound:play', {
        id: 'structure_break',
        position: { x: prop.x, y: prop.y + 1.0, z: prop.z },
        spatial: true,
      });
      return {
        hit: true,
        destroyed: true,
        isCrit,
        matType: prop.material,
        yieldAmount,
      };
    }

    if (isPickaxe) {
      const baseAngle = Math.atan2(dx, dz);
      const jitterAngle = baseAngle + (this.rand() - 0.5) * 1.1;
      const wpDist = prop.radius + 0.08;
      const newWp: Vec3Like = {
        x: prop.x + Math.sin(jitterAngle) * wpDist,
        y: prop.y + 0.75 + this.rand() * Math.min(1.0, prop.height * 0.4),
        z: prop.z + Math.cos(jitterAngle) * wpDist,
      };
      prop.weakpointWorldPos = newWp;
      this.eventBus.emit('vfx:weakpoint', {
        propId,
        position: newWp,
        normal: {
          x: Math.sin(jitterAngle),
          y: 0.1,
          z: Math.cos(jitterAngle),
        },
        active: true,
      });
    }

    return {
      hit: true,
      destroyed: false,
      isCrit,
      matType: prop.material,
      yieldAmount,
      weakpointPos: prop.weakpointWorldPos,
    };
  }

  openChest(chestId: string): boolean {
    const entry = this.chestsMap.get(chestId);
    if (!entry || entry.data.opened) return false;

    const chest = entry.data;
    chest.opened = true;

    const pos = { x: chest.x, y: chest.y + 0.55, z: chest.z };
    this.eventBus.emit('vfx:chest_open', { position: pos });
    this.eventBus.emit('sound:play', {
      id: 'chest_open',
      position: pos,
      spatial: true,
    });
    this.eventBus.emit('audio:noise', {
      position: pos,
      kind: 'chest',
      sourceId: chestId,
      radius: 26,
    });

    // Spawn Weapon + Matching Ammo + Consumable + Materials
    const weapon = this.rollWeaponLoot(true);
    const scatter = (idx: number): Vec3Like => {
      const a = chest.rotationY + (idx - 1.5) * 0.75 + (this.rand() - 0.5) * 0.25;
      const spd = 1.15 + this.rand() * 0.65;
      return {
        x: Math.sin(a) * spd,
        y: 3.4 + this.rand() * 0.8,
        z: Math.cos(a) * spd,
      };
    };

    this.spawnLootDrop(pos, { item: weapon }, scatter(0));

    const ammoType = WEAPONS[weapon.weaponId].ammoType;
    if (ammoType) {
      this.spawnLootDrop(
        pos,
        { ammo: { type: ammoType, amount: AMMO_CHEST_AMOUNTS[ammoType] } },
        scatter(1),
      );
    }

    this.spawnLootDrop(pos, { item: this.rollConsumable() }, scatter(2));

    const matPool: MaterialType[] = ['wood', 'brick', 'metal'];
    this.spawnLootDrop(
      pos,
      {
        materials: {
          type: matPool[Math.floor(this.rand() * matPool.length)],
          amount: 30,
        },
      },
      scatter(3),
    );

    return true;
  }

  private rollConsumable(): ItemInstance {
    let total = 0;
    for (const c of CONSUMABLE_POOL) total += c.weight;
    let r = this.rand() * total;
    let chosen = CONSUMABLE_POOL[0];
    for (const c of CONSUMABLE_POOL) {
      r -= c.weight;
      if (r <= 0) {
        chosen = c;
        break;
      }
    }
    const def = WEAPONS[chosen.id];
    return {
      uid: this.nextItemUid(),
      weaponId: chosen.id,
      rarity: def.allowedRarities[0],
      magAmmo: 0,
      stackCount: chosen.stack,
    };
  }

  rollWeaponLoot(fromChest = false): ItemInstance {
    const pool = fromChest ? WEAPON_LOOT_POOL_CHEST : WEAPON_LOOT_POOL_FLOOR;
    const weaponId = pool[Math.floor(this.rand() * pool.length)];
    const def = WEAPONS[weaponId];
    const allowed = def.allowedRarities;

    let rarity: Rarity = allowed[0];
    if (fromChest) {
      const chestEligible = allowed.filter((r) => r !== 'common');
      const source = chestEligible.length > 0 ? chestEligible : allowed;
      const roll = this.rand();
      if (roll > 0.88 && source.includes('legendary')) {
        rarity = 'legendary';
      } else if (roll > 0.65 && source.includes('epic')) {
        rarity = 'epic';
      } else if (roll > 0.35 && source.includes('rare')) {
        rarity = 'rare';
      } else {
        rarity = source[Math.floor(this.rand() * source.length)];
      }
    } else {
      const roll = this.rand();
      if (roll > 0.95 && allowed.includes('legendary')) {
        rarity = 'legendary';
      } else if (roll > 0.84 && allowed.includes('epic')) {
        rarity = 'epic';
      } else if (roll > 0.62 && allowed.includes('rare')) {
        rarity = 'rare';
      } else if (roll > 0.3 && allowed.includes('uncommon')) {
        rarity = 'uncommon';
      } else {
        rarity = allowed[0];
      }
    }

    return {
      uid: this.nextItemUid(),
      weaponId,
      rarity,
      magAmmo: def.magSize,
      stackCount: 1,
    };
  }

  spawnLootDrop(
    pos: Vec3Like,
    payload: LootPayload,
    scatterVel?: Vec3Like,
  ): LootDrop {
    const id = `drop_${++this.dropCounter}`;
    const hasVel = Boolean(
      scatterVel && (scatterVel.x !== 0 || scatterVel.y !== 0 || scatterVel.z !== 0),
    );

    const drop: LootDrop = {
      id,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      vx: scatterVel?.x ?? 0,
      vy: scatterVel?.y ?? 0,
      vz: scatterVel?.z ?? 0,
      item: payload.item ? { ...payload.item } : undefined,
      ammo: payload.ammo ? { ...payload.ammo } : undefined,
      materials: payload.materials ? { ...payload.materials } : undefined,
      settled: !hasVel,
      age: 0,
    };

    const colorHex = drop.item
      ? RARITY_COLORS[drop.item.rarity]
      : drop.ammo
        ? '#38bdf8'
        : '#fbbf24';

    const group = new THREE.Group();
    group.position.set(drop.x, drop.y, drop.z);

    // Light pillar
    const pillarMat = this.getMat(`pillar:${colorHex}`, () =>
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const pillarMesh = new THREE.Mesh(
      this.getGeo('loot_pillar', () => new THREE.CylinderGeometry(0.14, 0.26, 2.0, 10, 1, true)),
      pillarMat,
    );
    pillarMesh.position.y = 1.05;
    group.add(pillarMesh);

    // Rotating 3D item silhouette
    const itemMat = this.getMat(`loot_item:${colorHex}`, () =>
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.45,
      }),
    );

    let itemMesh: THREE.Object3D;
    if (drop.item) {
      const def = WEAPONS[drop.item.weaponId];
      if (def.isConsumable) {
        itemMesh = new THREE.Mesh(
          this.getGeo('loot_potion', () => new THREE.CylinderGeometry(0.18, 0.2, 0.42, 10)),
          itemMat,
        );
      } else {
        const gunGroup = new THREE.Group();
        const barrel = new THREE.Mesh(
          this.getGeo('loot_gun_barrel', () => new THREE.BoxGeometry(0.16, 0.18, 0.72)),
          itemMat,
        );
        const grip = new THREE.Mesh(
          this.getGeo('loot_gun_grip', () => new THREE.BoxGeometry(0.12, 0.22, 0.14)),
          itemMat,
        );
        grip.position.set(0, -0.14, 0.12);
        gunGroup.add(barrel, grip);
        itemMesh = gunGroup;
      }
    } else if (drop.ammo) {
      itemMesh = new THREE.Mesh(
        this.getGeo('loot_ammo', () => new THREE.BoxGeometry(0.32, 0.24, 0.22)),
        itemMat,
      );
    } else {
      itemMesh = new THREE.Mesh(
        this.getGeo('loot_mats', () => new THREE.BoxGeometry(0.38, 0.28, 0.38)),
        itemMat,
      );
    }

    itemMesh.position.y = 0.38;
    group.add(itemMesh);

    this.group.add(group);
    this.lootList.push(drop);
    this.lootMap.set(id, {
      data: drop,
      group,
      itemSpinMesh: itemMesh,
      pillarMesh,
    });

    return drop;
  }

  removeLootDrop(id: string): LootDrop | null {
    const entry = this.lootMap.get(id);
    if (!entry) return null;

    this.group.remove(entry.group);
    this.lootMap.delete(id);
    const idx = this.lootList.findIndex((d) => d.id === id);
    if (idx >= 0) this.lootList.splice(idx, 1);

    return entry.data;
  }

  spawnSupplyDrop(x: number, z: number): SupplyDrop {
    const id = `supply_${++this.supplyCounter}`;
    const targetY = this.terrain.getHeightAt(x, z);
    const startY = targetY + 110;

    const data: SupplyDrop = {
      id,
      x,
      y: startY,
      z,
      targetY,
      state: 'descending',
      hp: 500,
      maxHp: 500,
    };

    const crateMat = this.getMat('supply_crate', () =>
      new THREE.MeshStandardMaterial({
        map: this.textures.getSupplyDropTexture(),
        roughness: 0.45,
        metalness: 0.25,
      }),
    );
    const balloonMat = this.getMat('supply_balloon', () =>
      new THREE.MeshStandardMaterial({
        color: '#2563eb',
        roughness: 0.55,
      }),
    );
    const stripeMat = this.getMat('supply_stripe', () =>
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        roughness: 0.45,
      }),
    );
    const beaconMat = this.getMat('supply_beacon', () =>
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const group = new THREE.Group();
    group.position.set(x, startY, z);

    const crate = new THREE.Mesh(
      this.getGeo('supply_crate_geo', () => new THREE.BoxGeometry(1.6, 1.5, 1.6)),
      crateMat,
    );
    crate.position.y = 0.75;
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);

    const chuteGroup = new THREE.Group();
    const balloon = new THREE.Mesh(
      this.getGeo('supply_balloon_geo', () => new THREE.SphereGeometry(2.0, 14, 10)),
      balloonMat,
    );
    balloon.position.y = 4.6;
    balloon.scale.set(1.0, 1.15, 1.0);
    chuteGroup.add(balloon);

    const band = new THREE.Mesh(
      this.getGeo('supply_band_geo', () => new THREE.CylinderGeometry(2.03, 2.03, 0.45, 14)),
      stripeMat,
    );
    band.position.y = 4.6;
    chuteGroup.add(band);

    const cableGeo = this.getGeo('supply_cable', () => new THREE.CylinderGeometry(0.03, 0.03, 2.8, 6));
    for (const [cx, cz] of [
      [-0.65, -0.65],
      [0.65, -0.65],
      [-0.65, 0.65],
      [0.65, 0.65],
    ]) {
      const cable = new THREE.Mesh(cableGeo, stripeMat);
      cable.position.set(cx, 2.5, cz);
      chuteGroup.add(cable);
    }
    group.add(chuteGroup);

    const beaconMesh = new THREE.Mesh(
      this.getGeo('supply_beacon_geo', () => new THREE.CylinderGeometry(0.35, 0.55, 22, 10, 1, true)),
      beaconMat,
    );
    beaconMesh.position.y = 11;
    group.add(beaconMesh);

    this.group.add(group);
    this.supplyList.push(data);
    this.supplyMap.set(id, { data, group, chuteGroup, beaconMesh });
    return data;
  }

  openSupplyDrop(id: string): boolean {
    const entry = this.supplyMap.get(id);
    if (!entry || entry.data.state === 'opened') return false;

    const drop = entry.data;
    drop.state = 'opened';
    entry.chuteGroup.visible = false;
    entry.beaconMesh.visible = false;

    const pos = { x: drop.x, y: drop.y + 0.6, z: drop.z };
    this.eventBus.emit('vfx:chest_open', { position: pos });
    this.eventBus.emit('sound:play', { id: 'chest_open', position: pos, spatial: true });

    const weaponId = SUPPLY_DROP_WEAPONS[Math.floor(this.rand() * SUPPLY_DROP_WEAPONS.length)];
    const def = WEAPONS[weaponId];
    const highRarities = def.allowedRarities.filter((r) => r === 'epic' || r === 'legendary');
    const rarity: Rarity =
      highRarities.length > 0
        ? highRarities[Math.floor(this.rand() * highRarities.length)]
        : def.allowedRarities[def.allowedRarities.length - 1];

    const scatter = (idx: number): Vec3Like => {
      const a = (idx / 4) * Math.PI * 2 + this.rand() * 0.4;
      return { x: Math.sin(a) * 3.0, y: 4.8, z: Math.cos(a) * 3.0 };
    };

    this.spawnLootDrop(
      pos,
      {
        item: {
          uid: this.nextItemUid(),
          weaponId,
          rarity,
          magAmmo: def.magSize,
          stackCount: 1,
        },
      },
      scatter(0),
    );

    if (def.ammoType) {
      this.spawnLootDrop(
        pos,
        { ammo: { type: def.ammoType, amount: AMMO_CHEST_AMOUNTS[def.ammoType] * 2 } },
        scatter(1),
      );
    }

    this.spawnLootDrop(
      pos,
      {
        item: {
          uid: this.nextItemUid(),
          weaponId: this.rand() < 0.5 ? 'slurp_juice' : 'shield_potion',
          rarity: this.rand() < 0.5 ? 'epic' : 'rare',
          magAmmo: 0,
          stackCount: 1,
        },
      },
      scatter(2),
    );

    this.spawnLootDrop(
      pos,
      { materials: { type: 'metal', amount: 60 } },
      scatter(3),
    );

    return true;
  }

  update(dt: number, elapsed: number): void {
    // 1. Chest lid opening animation
    for (const entry of this.chestsMap.values()) {
      const c = entry.data;
      if (c.opened && c.openProgress < 1) {
        c.openProgress = Math.min(1, c.openProgress + dt * 3.5);
        entry.lidPivot.rotation.x = -c.openProgress * 1.65;
        if (c.openProgress >= 0.99) {
          entry.auraMesh.visible = false;
        }
      } else if (!c.opened) {
        entry.auraMesh.rotation.y = elapsed * 1.1;
      }
    }

    // 2. Loot drop scatter physics + bob/spin
    for (const entry of this.lootMap.values()) {
      const d = entry.data;
      d.age += dt;
      if (!d.settled) {
        d.vy -= 18 * dt;
        d.x += d.vx * dt;
        d.z += d.vz * dt;
        d.y += d.vy * dt;

        const floorY = this.getSupportFloorY(d.x, d.z, d.y + 0.5);
        if (d.y <= floorY) {
          d.y = floorY;
          d.vx = 0;
          d.vy = 0;
          d.vz = 0;
          d.settled = true;
        }
        entry.group.position.set(d.x, d.y, d.z);
      }

      entry.itemSpinMesh.rotation.y += dt * 1.85;
      entry.itemSpinMesh.position.y = 0.38 + Math.sin(elapsed * 2.8 + d.x) * 0.08;
    }

    // 3. Supply drops descending
    for (const entry of this.supplyMap.values()) {
      const s = entry.data;
      if (s.state === 'descending') {
        s.y -= 9.5 * dt;
        if (s.y <= s.targetY) {
          s.y = s.targetY;
          s.state = 'landed';
          entry.chuteGroup.visible = false;
          entry.group.rotation.z = 0;
        } else {
          entry.group.rotation.z = Math.sin(elapsed * 1.5 + s.x) * 0.06;
        }
        entry.group.position.set(s.x, s.y, s.z);
      }
    }
  }

  private clearEntities(): void {
    this.group.clear();
    this.propsMap.clear();
    this.propsList = [];
    this.chestsMap.clear();
    this.chestsList = [];
    this.lootMap.clear();
    this.lootList = [];
    this.supplyMap.clear();
    this.supplyList = [];
  }

  reset(
    chestSpots?: ChestSpot[],
    floorLootSpots?: FloorLootSpot[],
    colliders?: ColliderBox[],
  ): void {
    this.clearEntities();
    if (chestSpots && floorLootSpots && colliders) {
      this.populate(chestSpots, floorLootSpots, colliders);
    }
  }

  dispose(): void {
    this.clearEntities();
    for (const g of this.sharedGeometries.values()) g.dispose();
    this.sharedGeometries.clear();
    for (const m of this.sharedMaterials.values()) m.dispose();
    this.sharedMaterials.clear();
    this.textures.dispose();
  }
}
