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
  LootLlamaEntity,
  MaterialType,
  PropKind,
  Rarity,
  SupplyDrop,
  TerrainQuery,
  Vec3Like,
  WeaponId,
} from '../types';
import { VOLCANO_CENTER_X, VOLCANO_CENTER_Z } from './TerrainSystem';
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

interface LlamaEntry {
  data: LootLlamaEntity;
  group: THREE.Group;
  bodyMesh: THREE.Group;
  auraMesh: THREE.Mesh;
  collider: ColliderBox;
  hitWobble: number;
}

const WEAPON_LOOT_POOL_FLOOR: WeaponId[] = [
  'ar',
  'burst_ar',
  'tactical_dmr',
  'pump_shotgun',
  'tac_shotgun',
  'heavy_shotgun',
  'smg',
  'pistol',
  'sniper',
  'grappler',
  'kinetic_blade',
];

const WEAPON_LOOT_POOL_CHEST: WeaponId[] = [
  'ar',
  'burst_ar',
  'tactical_dmr',
  'pump_shotgun',
  'tac_shotgun',
  'heavy_shotgun',
  'smg',
  'sniper',
  'rocket_launcher',
  'pistol',
  'grappler',
  'kinetic_blade',
];

const SUPPLY_DROP_WEAPONS: WeaponId[] = [
  'ar',
  'tactical_dmr',
  'pump_shotgun',
  'heavy_shotgun',
  'sniper',
  'rocket_launcher',
  'burst_ar',
  'grappler',
  'kinetic_blade',
];

const CONSUMABLE_POOL: Array<{ id: WeaponId; stack: number; weight: number }> = [
  { id: 'mini_shield', stack: 2, weight: 22 },
  { id: 'bandages', stack: 5, weight: 18 },
  { id: 'shield_potion', stack: 1, weight: 12 },
  { id: 'medkit', stack: 1, weight: 10 },
  { id: 'slurp_juice', stack: 1, weight: 6 },
  { id: 'chug_splash', stack: 2, weight: 10 },
  { id: 'frag_grenade', stack: 3, weight: 9 },
  { id: 'shockwave_grenade', stack: 2, weight: 8 },
  { id: 'shield_bubble', stack: 1, weight: 9 },
];

const THROWABLE_POOL: Array<{ id: WeaponId; stack: number }> = [
  { id: 'chug_splash', stack: 2 },
  { id: 'frag_grenade', stack: 3 },
  { id: 'shockwave_grenade', stack: 2 },
  { id: 'shield_bubble', stack: 1 },
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
  private llamasMap = new Map<string, LlamaEntry>();
  private llamasList: LootLlamaEntity[] = [];

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
      if (c.tag && c.tag.startsWith('building') && !c.tag.startsWith('building_sky_island')) {
        this.buildingZones.push({
          minX: c.minX,
          maxX: c.maxX,
          minZ: c.minZ,
          maxZ: c.maxZ,
        });
      }
    }

    // 1. Spawn Chests (>= 85)
    const allChestSpots: ChestSpot[] = chestSpots.map((s) => ({ ...s }));
    let extraChestAttempts = 0;
    while (allChestSpots.length < 88 && extraChestAttempts < 1800) {
      extraChestAttempts++;
      const angle = this.rand() * Math.PI * 2;
      const dist = 25 + Math.sqrt(this.rand()) * (ISLAND_RADIUS - 42);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (this.terrain.isWater(x, z)) continue;
      if (this.isInsideBuildingZone(x, z, 2.5)) continue;
      const n = this.terrain.getNormalAt(x, z);
      if (n.y < 0.85) continue;
      if (allChestSpots.some((c) => Math.hypot(c.x - x, c.z - z) < 15)) continue;
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

    // 2. Spawn Floor Loot (>= 160)
    const allFloorSpots: FloorLootSpot[] = floorLootSpots.map((s) => ({ ...s }));
    let extraFloorAttempts = 0;
    while (allFloorSpots.length < 165 && extraFloorAttempts < 2400) {
      extraFloorAttempts++;
      const angle = this.rand() * Math.PI * 2;
      const dist = 15 + Math.sqrt(this.rand()) * (ISLAND_RADIUS - 35);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (this.terrain.isWater(x, z)) continue;
      if (this.isInsideBuildingZone(x, z, 2.0)) continue;
      const n = this.terrain.getNormalAt(x, z);
      if (n.y < 0.84) continue;
      if (allFloorSpots.some((f) => Math.hypot(f.x - x, f.z - z) < 9.5)) continue;
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

    // 3. Spawn Harvestable Props (>= 460 across ALL 13 PropKinds!)
    const targetProps = 470;
    let attempts = 0;
    let propIdx = 0;

    // Guaranteed clustered vehicles, containers, crystals & biome anchors near POIs first
    for (const poi of POIS) {
      if (poi.id === 'crystal_basin') continue;
      const offsets = [
        [-28, 2],
        [28, -4],
        [2, 28],
        [-4, -28],
      ];
      for (const [ox, oz] of offsets) {
        const px = poi.x + ox + (this.rand() - 0.5) * 5;
        const pz = poi.z + oz + (this.rand() - 0.5) * 5;
        if (this.terrain.isWater(px, pz)) continue;
        if (this.isInsideBuildingZone(px, pz, 2.5)) continue;
        let kind: PropKind;
        if (poi.biome === 'urban') {
          kind = this.rand() < 0.55 ? 'car' : this.rand() < 0.65 ? 'shipping_container' : 'crate';
        } else if (poi.biome === 'highland') {
          kind = this.rand() < 0.45 ? 'shipping_container' : this.rand() < 0.65 ? 'crate' : 'rock';
        } else if (poi.biome === 'snow') {
          kind = this.rand() < 0.6 ? 'tree_snow_pine' : 'rock';
        } else if (poi.biome === 'desert') {
          kind = this.rand() < 0.55 ? 'cactus' : 'tree_palm';
        } else if (poi.biome === 'volcanic') {
          kind = this.rand() < 0.6 ? 'obsidian_crystal' : 'rock';
        } else if (poi.biome === 'cyber') {
          kind = this.rand() < 0.65 ? 'cyber_pylon' : 'shipping_container';
        } else if (poi.biome === 'forest') {
          kind = this.rand() < 0.55 ? 'tree_redwood' : 'tree_pine';
        } else {
          kind = this.rand() < 0.5 ? 'fence' : 'car';
        }
        this.createProp(`prop_${propIdx++}`, kind, px, pz);
      }
    }

    // Guarantee at least one of every single PropKind on valid terrain
    const guaranteedKinds: Array<{ kind: PropKind; x: number; z: number }> = [
      { kind: 'tree_redwood', x: 145, z: -135 },
      { kind: 'tree_snow_pine', x: -35, z: -215 },
      { kind: 'tree_palm', x: -205, z: 5 },
      { kind: 'cactus', x: -245, z: -38 },
      { kind: 'obsidian_crystal', x: -195, z: 105 },
      { kind: 'cyber_pylon', x: 142, z: 145 },
      { kind: 'shipping_container', x: 16, z: 135 },
    ];
    for (const g of guaranteedKinds) {
      if (!this.terrain.isWater(g.x, g.z) && !this.isInsideBuildingZone(g.x, g.z, 2.2)) {
        this.createProp(`prop_${propIdx++}`, g.kind, g.x, g.z);
      }
    }

    while (this.propsList.length < targetProps && attempts < 7000) {
      attempts++;
      const angle = this.rand() * Math.PI * 2;
      const dist = 10 + Math.sqrt(this.rand()) * (ISLAND_RADIUS - 20);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (this.terrain.isWater(x, z)) continue;
      const y = this.terrain.getHeightAt(x, z);
      if (y < 0.45) continue;
      if (this.isInsideBuildingZone(x, z, 2.2)) continue;
      const n = this.terrain.getNormalAt(x, z);
      if (n.y < 0.78) continue;

      if (allChestSpots.some((c) => Math.hypot(c.x - x, c.z - z) < 2.5)) continue;
      if (this.propsList.some((p) => Math.hypot(p.x - x, p.z - z) < 4.0)) continue;

      const biome = this.terrain.getBiomeAt(x, z);
      let kind: PropKind;
      const r = this.rand();
      if (biome === 'snow') {
        kind = r < 0.65 ? 'tree_snow_pine' : r < 0.88 ? 'rock' : 'crate';
      } else if (biome === 'desert') {
        kind = r < 0.48 ? 'cactus' : r < 0.78 ? 'tree_palm' : r < 0.92 ? 'rock' : 'crate';
      } else if (biome === 'volcanic') {
        kind = r < 0.56 ? 'obsidian_crystal' : r < 0.88 ? 'rock' : 'crate';
      } else if (biome === 'cyber') {
        kind = r < 0.5 ? 'cyber_pylon' : r < 0.74 ? 'shipping_container' : r < 0.9 ? 'car' : 'crate';
      } else if (biome === 'forest') {
        kind = r < 0.48 ? 'tree_pine' : r < 0.78 ? 'tree_redwood' : r < 0.9 ? 'rock' : r < 0.96 ? 'tree_oak' : 'crate';
      } else if (biome === 'highland') {
        kind = r < 0.42 ? 'rock' : r < 0.68 ? 'tree_pine' : r < 0.85 ? 'shipping_container' : r < 0.94 ? 'crate' : 'car';
      } else if (biome === 'urban') {
        kind = r < 0.4 ? 'car' : r < 0.62 ? 'shipping_container' : r < 0.78 ? 'crate' : r < 0.9 ? 'tree_oak' : 'fence';
      } else if (biome === 'beach') {
        kind = r < 0.48 ? 'tree_palm' : r < 0.82 ? 'rock' : 'crate';
      } else {
        kind = r < 0.44 ? 'tree_oak' : r < 0.68 ? 'tree_pine' : r < 0.82 ? 'rock' : r < 0.91 ? 'fence' : 'car';
      }

      this.createProp(`prop_${propIdx++}`, kind, x, z);
    }

    // 4. Spawn 3 Deterministic Supply Loot Llamas across distinct dry open areas
    this.spawnDeterministicLlamas(allChestSpots);
  }

  private spawnDeterministicLlamas(allChestSpots: ChestSpot[]): void {
    const llamaRand = mulberry32(this.seed + 31337);
    const targetLlamas = 3;
    const minSpacing = [95, 55, 25];

    for (const minDist of minSpacing) {
      let attempts = 0;
      while (this.llamasList.length < targetLlamas && attempts < 1400) {
        attempts++;
        const angle = llamaRand() * Math.PI * 2;
        const dist = 35 + Math.sqrt(llamaRand()) * (ISLAND_RADIUS - 55);
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        if (this.terrain.isWater(x, z)) continue;
        const y = this.terrain.getHeightAt(x, z);
        if (y < 0.8) continue;
        const n = this.terrain.getNormalAt(x, z);
        if (n.y < 0.85) continue;
        if (this.isInsideBuildingZone(x, z, 3.0)) continue;
        if (Math.hypot(x - VOLCANO_CENTER_X, z - VOLCANO_CENTER_Z) < 18) continue;
        if (allChestSpots.some((c) => Math.hypot(c.x - x, c.z - z) < 4.5)) continue;
        if (this.propsList.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
        if (this.llamasList.some((l) => Math.hypot(l.x - x, l.z - z) < minDist)) continue;

        this.createLlama(`llama_${this.llamasList.length}`, x, z, llamaRand() * Math.PI * 2);
      }
      if (this.llamasList.length >= targetLlamas) break;
    }
  }

  private createLlama(id: string, x: number, z: number, rotY: number): void {
    const y = this.terrain.getHeightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    group.name = `LootLlama_${id}`;

    const bodyMesh = new THREE.Group();
    group.add(bodyMesh);

    const purpleMat = this.getMat('llama_purple', () =>
      new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.72 }),
    );
    const lavenderMat = this.getMat('llama_lavender', () =>
      new THREE.MeshStandardMaterial({ color: '#a855f7', roughness: 0.7 }),
    );
    const pinkMat = this.getMat('llama_pink', () =>
      new THREE.MeshStandardMaterial({ color: '#ec4899', roughness: 0.6 }),
    );
    const cyanMat = this.getMat('llama_cyan', () =>
      new THREE.MeshStandardMaterial({ color: '#22d3ee', roughness: 0.55 }),
    );
    const blueLegMat = this.getMat('llama_blue', () =>
      new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.7 }),
    );
    const goldMat = this.getMat('llama_gold', () =>
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#ca8a04',
        emissiveIntensity: 0.3,
        roughness: 0.35,
        metalness: 0.5,
      }),
    );
    const snoutMat = this.getMat('llama_snout', () =>
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.8 }),
    );
    const eyeMat = this.getMat('llama_eye', () =>
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4 }),
    );
    const auraMat = this.getMat('llama_aura', () =>
      new THREE.MeshBasicMaterial({
        color: '#c084fc',
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    // 4 blocky piñata legs
    const legGeo = this.getGeo('llama_leg', () => new THREE.BoxGeometry(0.18, 0.56, 0.18));
    for (const [lx, lz] of [
      [-0.22, -0.34],
      [0.22, -0.34],
      [-0.22, 0.34],
      [0.22, 0.34],
    ]) {
      const leg = new THREE.Mesh(legGeo, blueLegMat);
      leg.position.set(lx, 0.28, lz);
      leg.castShadow = true;
      bodyMesh.add(leg);
    }

    // Torso + colorful striped saddle blanket + side loot saddlebags
    const torso = new THREE.Mesh(
      this.getGeo('llama_torso', () => new THREE.BoxGeometry(0.68, 0.62, 1.08)),
      purpleMat,
    );
    torso.position.set(0, 0.84, 0);
    torso.castShadow = true;
    torso.receiveShadow = true;
    bodyMesh.add(torso);

    const blanketPink = new THREE.Mesh(
      this.getGeo('llama_blanket_pink', () => new THREE.BoxGeometry(0.74, 0.36, 0.58)),
      pinkMat,
    );
    blanketPink.position.set(0, 0.98, -0.04);
    bodyMesh.add(blanketPink);

    const blanketCyan = new THREE.Mesh(
      this.getGeo('llama_blanket_cyan', () => new THREE.BoxGeometry(0.76, 0.14, 0.42)),
      cyanMat,
    );
    blanketCyan.position.set(0, 1.08, -0.04);
    bodyMesh.add(blanketCyan);

    const bagGeo = this.getGeo('llama_bag', () => new THREE.BoxGeometry(0.16, 0.32, 0.4));
    const trimGeo = this.getGeo('llama_bag_trim', () => new THREE.BoxGeometry(0.18, 0.08, 0.42));
    for (const sx of [-0.41, 0.41]) {
      const bag = new THREE.Mesh(bagGeo, cyanMat);
      bag.position.set(sx, 0.84, -0.05);
      bag.castShadow = true;
      const trim = new THREE.Mesh(trimGeo, goldMat);
      trim.position.set(sx, 0.96, -0.05);
      bodyMesh.add(bag, trim);
    }

    // Tail
    const tail = new THREE.Mesh(
      this.getGeo('llama_tail', () => new THREE.BoxGeometry(0.18, 0.24, 0.22)),
      pinkMat,
    );
    tail.position.set(0, 1.02, -0.62);
    bodyMesh.add(tail);

    // Tall neck, lavender head, cream snout, eyes, and tall ears
    const neck = new THREE.Mesh(
      this.getGeo('llama_neck', () => new THREE.BoxGeometry(0.34, 0.72, 0.34)),
      lavenderMat,
    );
    neck.position.set(0, 1.42, 0.38);
    neck.castShadow = true;
    bodyMesh.add(neck);

    const head = new THREE.Mesh(
      this.getGeo('llama_head', () => new THREE.BoxGeometry(0.42, 0.38, 0.46)),
      lavenderMat,
    );
    head.position.set(0, 1.84, 0.46);
    head.castShadow = true;
    bodyMesh.add(head);

    const snout = new THREE.Mesh(
      this.getGeo('llama_snout', () => new THREE.BoxGeometry(0.32, 0.24, 0.28)),
      snoutMat,
    );
    snout.position.set(0, 1.78, 0.74);
    bodyMesh.add(snout);

    const eyeGeo = this.getGeo('llama_eye', () => new THREE.BoxGeometry(0.07, 0.08, 0.06));
    for (const ex of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex, 1.88, 0.64);
      bodyMesh.add(eye);
    }

    const earGeo = this.getGeo('llama_ear', () => new THREE.BoxGeometry(0.11, 0.34, 0.12));
    for (const ex of [-0.14, 0.14]) {
      const ear = new THREE.Mesh(earGeo, pinkMat);
      ear.position.set(ex, 2.16, 0.38);
      ear.rotation.z = ex < 0 ? 0.18 : -0.18;
      bodyMesh.add(ear);
    }

    const auraMesh = new THREE.Mesh(
      this.getGeo('llama_aura_geo', () => new THREE.CylinderGeometry(0.85, 1.05, 2.4, 12, 1, true)),
      auraMat,
    );
    auraMesh.position.y = 1.2;
    group.add(auraMesh);

    this.group.add(group);

    const data: LootLlamaEntity = {
      id,
      x,
      y,
      z,
      rotationY: rotY,
      hp: 200,
      maxHp: 200,
      opened: false,
    };

    const collider: ColliderBox = {
      id: `llama_col_${id}`,
      minX: x - 0.75,
      minY: y,
      minZ: z - 0.75,
      maxX: x + 0.75,
      maxY: y + 2.25,
      maxZ: z + 0.75,
      material: 'wood',
      tag: `llama:${id}`,
    };

    this.llamasList.push(data);
    this.llamasMap.set(id, {
      data,
      group,
      bodyMesh,
      auraMesh,
      collider,
      hitWobble: 0,
    });
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
      new THREE.MeshStandardMaterial({
        map: this.textures.getBarkTexture(),
        bumpMap: this.textures.getBumpTexture('bark'),
        bumpScale: 0.12,
        roughness: 0.9,
      }),
    );
    const woodMat = this.getMat('wood', () =>
      new THREE.MeshStandardMaterial({
        map: this.textures.getWoodTexture(),
        bumpMap: this.textures.getBumpTexture('wood'),
        bumpScale: 0.09,
        roughness: 0.85,
      }),
    );
    const rockMat = this.getMat('rock', () =>
      new THREE.MeshStandardMaterial({
        map: this.textures.getRockTexture(),
        bumpMap: this.textures.getBumpTexture('rock'),
        bumpScale: 0.14,
        roughness: 0.92,
      }),
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
    } else if (kind === 'tree_redwood') {
      material = 'wood';
      maxHp = 260;
      matYield = 58;
      radius = 0.95 * scale;
      height = 11.2 * scale;

      const trunk = new THREE.Mesh(
        this.getGeo('redwood_trunk', () => new THREE.CylinderGeometry(0.45, 0.72, 5.2, 8)),
        barkMat,
      );
      trunk.position.y = 2.6;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      visual.add(trunk);

      const leafMat = this.getMat('redwood_leaf', () =>
        new THREE.MeshStandardMaterial({ color: '#155e2c', roughness: 0.86 }),
      );
      for (const [cy, cr, ch, idx] of [
        [5.2, 3.0, 3.6, 0],
        [7.4, 2.3, 3.2, 1],
        [9.4, 1.5, 2.8, 2],
      ]) {
        const cone = new THREE.Mesh(
          this.getGeo(`redwood_cone_${idx}`, () => new THREE.ConeGeometry(cr, ch, 8)),
          leafMat,
        );
        cone.position.y = cy;
        cone.castShadow = true;
        cone.receiveShadow = true;
        visual.add(cone);
      }
    } else if (kind === 'tree_snow_pine') {
      material = 'wood';
      maxHp = 165;
      matYield = 38;
      radius = 0.65 * scale;
      height = 7.6 * scale;

      const trunk = new THREE.Mesh(
        this.getGeo('pine_trunk', () => new THREE.CylinderGeometry(0.24, 0.42, 3.0, 8)),
        barkMat,
      );
      trunk.position.y = 1.5;
      trunk.castShadow = true;
      visual.add(trunk);

      const snowLeafMat = this.getMat('snow_leaf', () =>
        new THREE.MeshStandardMaterial({ color: '#1e4e46', roughness: 0.85 }),
      );
      const snowCapMat = this.getMat('snow_cap', () =>
        new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.8 }),
      );
      for (let i = 0; i < 3; i++) {
        const cr = [2.2, 1.75, 1.25][i];
        const ch = [2.6, 2.3, 2.0][i];
        const cy = [3.1, 4.6, 5.9][i];
        const cone = new THREE.Mesh(
          this.getGeo(`pine_cone_${i}`, () => new THREE.ConeGeometry(cr, ch, 8)),
          snowLeafMat,
        );
        cone.position.y = cy;
        cone.castShadow = true;
        visual.add(cone);

        const cap = new THREE.Mesh(
          this.getGeo(`snow_cap_${i}`, () => new THREE.ConeGeometry(cr * 0.72, ch * 0.46, 8)),
          snowCapMat,
        );
        cap.position.y = cy + ch * 0.28;
        visual.add(cap);
      }
    } else if (kind === 'tree_palm') {
      material = 'wood';
      maxHp = 120;
      matYield = 28;
      radius = 0.55 * scale;
      height = 6.2 * scale;

      const palmBark = this.getMat('palm_bark', () =>
        new THREE.MeshStandardMaterial({ color: '#9a6b42', roughness: 0.9 }),
      );
      const palmLeaf = this.getMat('palm_leaf', () =>
        new THREE.MeshStandardMaterial({ color: '#4ade80', roughness: 0.78 }),
      );
      for (let seg = 0; seg < 4; seg++) {
        const piece = new THREE.Mesh(
          this.getGeo('palm_seg', () => new THREE.CylinderGeometry(0.18, 0.24, 1.35, 7)),
          palmBark,
        );
        piece.position.set(seg * 0.12, 0.65 + seg * 1.25, 0);
        piece.rotation.z = -0.09;
        piece.castShadow = true;
        visual.add(piece);
      }
      const frondGeo = this.getGeo('palm_frond', () => new THREE.BoxGeometry(2.1, 0.14, 0.55));
      for (let f = 0; f < 5; f++) {
        const a = (f / 5) * Math.PI * 2;
        const frond = new THREE.Mesh(frondGeo, palmLeaf);
        frond.position.set(0.42 + Math.cos(a) * 1.1, 5.3, Math.sin(a) * 1.1);
        frond.rotation.y = -a;
        frond.rotation.z = -0.32;
        frond.castShadow = true;
        visual.add(frond);
      }
    } else if (kind === 'cactus') {
      material = 'wood';
      maxHp = 95;
      matYield = 20;
      radius = 0.55 * scale;
      height = 3.2 * scale;

      const cactusMat = this.getMat('cactus_mat', () =>
        new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.8 }),
      );
      const body = new THREE.Mesh(
        this.getGeo('cactus_body', () => new THREE.CylinderGeometry(0.26, 0.3, 2.9, 8)),
        cactusMat,
      );
      body.position.y = 1.45;
      body.castShadow = true;
      visual.add(body);

      const armGeo = this.getGeo('cactus_arm', () => new THREE.CylinderGeometry(0.17, 0.19, 1.1, 7));
      const armL = new THREE.Mesh(armGeo, cactusMat);
      armL.position.set(0.45, 1.85, 0);
      armL.rotation.z = -0.35;
      const armR = new THREE.Mesh(armGeo, cactusMat);
      armR.position.set(-0.42, 1.55, 0);
      armR.rotation.z = 0.35;
      visual.add(armL, armR);
    } else if (kind === 'obsidian_crystal') {
      material = 'brick';
      maxHp = 220;
      matYield = 45;
      radius = 0.95 * scale;
      height = 3.4 * scale;

      const obsMat = this.getMat('obsidian_mat', () =>
        new THREE.MeshStandardMaterial({
          color: '#1f1726',
          emissive: '#f97316',
          emissiveIntensity: 0.38,
          roughness: 0.35,
          metalness: 0.3,
        }),
      );
      const shardGeo = this.getGeo('obsidian_geo', () => new THREE.ConeGeometry(0.55, 3.1, 5));
      const main = new THREE.Mesh(shardGeo, obsMat);
      main.position.y = 1.5;
      main.rotation.z = 0.12;
      main.castShadow = true;
      const side = new THREE.Mesh(shardGeo, obsMat);
      side.position.set(0.45, 0.95, 0.3);
      side.scale.set(0.65, 0.65, 0.65);
      side.rotation.set(0.25, 0, -0.32);
      visual.add(main, side);
    } else if (kind === 'cyber_pylon') {
      material = 'metal';
      maxHp = 200;
      matYield = 42;
      radius = 0.72 * scale;
      height = 3.6 * scale;

      const frameMat = this.getMat('cyber_frame', () =>
        new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.35, metalness: 0.7 }),
      );
      const glowMat = this.getMat('cyber_glow', () =>
        new THREE.MeshStandardMaterial({
          color: '#22d3ee',
          emissive: '#06b6d4',
          emissiveIntensity: 1.2,
          roughness: 0.2,
        }),
      );
      const base = new THREE.Mesh(
        this.getGeo('cyber_base', () => new THREE.BoxGeometry(1.1, 3.2, 1.1)),
        frameMat,
      );
      base.position.y = 1.6;
      base.castShadow = true;
      const core = new THREE.Mesh(
        this.getGeo('cyber_core', () => new THREE.OctahedronGeometry(0.48, 0)),
        glowMat,
      );
      core.position.y = 3.65;
      visual.add(base, core);
    } else if (kind === 'shipping_container') {
      material = 'metal';
      maxHp = 320;
      matYield = 64;
      radius = 1.85 * scale;
      height = 2.6 * scale;

      const contColors = ['#dc2626', '#2563eb', '#eab308', '#059669'];
      const col = contColors[Math.floor(this.rand() * contColors.length)];
      const contMat = this.getMat(`container:${col}`, () =>
        new THREE.MeshStandardMaterial({
          map: this.textures.getCorrugatedTexture(col),
          bumpMap: this.textures.getBumpTexture('metal'),
          bumpScale: 0.1,
          roughness: 0.55,
          metalness: 0.35,
        }),
      );
      const box = new THREE.Mesh(
        this.getGeo('container_geo', () => new THREE.BoxGeometry(2.5, 2.6, 5.2)),
        contMat,
      );
      box.position.y = 1.3;
      box.castShadow = true;
      box.receiveShadow = true;
      visual.add(box);
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
        bumpMap: this.textures.getBumpTexture('metal'),
        bumpScale: 0.08,
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

  getLlamas(): LootLlamaEntity[] {
    return this.llamasList;
  }

  spawnLlamaAt(x: number, z: number, rotationY = 0): LootLlamaEntity {
    const id = `llama_custom_${this.llamasList.length}`;
    this.createLlama(id, x, z, rotationY);
    return this.llamasList[this.llamasList.length - 1];
  }

  getActiveLlamaColliders(): ColliderBox[] {
    const out: ColliderBox[] = [];
    for (const l of this.llamasList) {
      if (l.opened) continue;
      const entry = this.llamasMap.get(l.id);
      if (entry) out.push(entry.collider);
    }
    return out;
  }

  damageLlama(id: string, dmg: number, hitPos: Vec3Like): boolean {
    const entry = this.llamasMap.get(id);
    if (!entry || entry.data.opened || entry.data.hp <= 0) {
      return false;
    }

    const llama = entry.data;
    const damage = Math.max(0, dmg);
    llama.hp = Math.max(0, llama.hp - damage);
    entry.hitWobble = 0.28;

    const dx = hitPos.x - llama.x;
    const dz = hitPos.z - llama.z;
    const len = Math.hypot(dx, dz) || 1;
    this.eventBus.emit('vfx:impact', {
      position: { ...hitPos },
      normal: { x: dx / len, y: 0.2, z: dz / len },
      material: 'wood',
    });
    this.eventBus.emit('sound:play', {
      id: 'hit_wood',
      position: { ...hitPos },
      spatial: true,
    });

    if (llama.hp <= 0) {
      this.burstLlama(entry);
      return true;
    }

    return false;
  }

  openLlama(id: string): boolean {
    const entry = this.llamasMap.get(id);
    if (!entry || entry.data.opened) return false;
    this.burstLlama(entry);
    return true;
  }

  private burstLlama(entry: LlamaEntry): void {
    const llama = entry.data;
    if (llama.opened) return;

    llama.opened = true;
    llama.hp = 0;
    entry.group.visible = false;

    const pos = { x: llama.x, y: llama.y + 0.85, z: llama.z };
    this.eventBus.emit('vfx:chest_open', { position: pos });
    this.eventBus.emit('sound:play', {
      id: 'chest_open',
      position: pos,
      spatial: true,
    });
    this.eventBus.emit('audio:noise', {
      position: pos,
      kind: 'chest',
      sourceId: llama.id,
      radius: 30,
    });

    const totalDrops = 10;
    let dropIdx = 0;
    const scatter = (): Vec3Like => {
      const a = llama.rotationY + (dropIdx++ / totalDrops) * Math.PI * 2 + (this.rand() - 0.5) * 0.25;
      const spd = 2.0 + this.rand() * 1.3;
      return {
        x: Math.sin(a) * spd,
        y: 3.8 + this.rand() * 1.2,
        z: Math.cos(a) * spd,
      };
    };

    // Wood + Brick + Metal burst
    for (const matType of ['wood', 'brick', 'metal'] as MaterialType[]) {
      this.spawnLootDrop(pos, { materials: { type: matType, amount: 150 } }, scatter());
    }

    // All 5 Ammo types burst
    const llamaAmmo: Array<[AmmoType, number]> = [
      ['light', 45],
      ['medium', 40],
      ['shells', 14],
      ['heavy', 8],
      ['rockets', 2],
    ];
    for (const [ammoType, amount] of llamaAmmo) {
      this.spawnLootDrop(pos, { ammo: { type: ammoType, amount } }, scatter());
    }

    // Tactical throwable burst: chug_splash + shockwave_grenade
    this.spawnLootDrop(
      pos,
      {
        item: {
          uid: this.nextItemUid(),
          weaponId: 'chug_splash',
          rarity: WEAPONS.chug_splash.allowedRarities[0],
          magAmmo: 0,
          stackCount: 2,
        },
      },
      scatter(),
    );
    this.spawnLootDrop(
      pos,
      {
        item: {
          uid: this.nextItemUid(),
          weaponId: 'shockwave_grenade',
          rarity: WEAPONS.shockwave_grenade.allowedRarities[0],
          magAmmo: 0,
          stackCount: 2,
        },
      },
      scatter(),
    );
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

    const utilItem = this.rollConsumable();
    this.spawnLootDrop(pos, { item: utilItem }, scatter(2));

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

    if (!WEAPONS[utilItem.weaponId].isThrowable && this.rand() < 0.35) {
      const tPick = THROWABLE_POOL[Math.floor(this.rand() * THROWABLE_POOL.length)];
      const tDef = WEAPONS[tPick.id];
      this.spawnLootDrop(
        pos,
        {
          item: {
            uid: this.nextItemUid(),
            weaponId: tPick.id,
            rarity: tDef.allowedRarities[Math.floor(this.rand() * tDef.allowedRarities.length)],
            magAmmo: 0,
            stackCount: tPick.stack,
          },
        },
        scatter(4),
      );
    }

    return true;
  }

  rollConsumable(): ItemInstance {
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
    const rarity = def.allowedRarities[Math.floor(this.rand() * def.allowedRarities.length)];
    return {
      uid: this.nextItemUid(),
      weaponId: chosen.id,
      rarity,
      magAmmo: 0,
      stackCount: chosen.stack,
    };
  }

  rollWeaponLoot(fromChest = false): ItemInstance {
    const pool = fromChest ? WEAPON_LOOT_POOL_CHEST : WEAPON_LOOT_POOL_FLOOR;
    const weaponId = pool[Math.floor(this.rand() * pool.length)];
    const def = WEAPONS[weaponId];
    const nonMythic = def.allowedRarities.filter((r) => r !== 'mythic');
    const allowed = nonMythic.length > 0 ? nonMythic : def.allowedRarities;

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
      } else if (def.isGrappler) {
        const grapGroup = new THREE.Group();
        const body = new THREE.Mesh(
          this.getGeo('loot_grapple_body', () => new THREE.BoxGeometry(0.16, 0.2, 0.56)),
          itemMat,
        );
        const claw = new THREE.Mesh(
          this.getGeo('loot_grapple_claw', () => new THREE.ConeGeometry(0.14, 0.24, 6)),
          itemMat,
        );
        claw.rotation.x = Math.PI * 0.5;
        claw.position.z = 0.36;
        grapGroup.add(body, claw);
        itemMesh = grapGroup;
      } else if (def.isKineticBlade) {
        const bladeGroup = new THREE.Group();
        const edge = new THREE.Mesh(
          this.getGeo('loot_blade_edge', () => new THREE.BoxGeometry(0.06, 0.1, 0.92)),
          itemMat,
        );
        edge.position.z = 0.08;
        const guard = new THREE.Mesh(
          this.getGeo('loot_blade_guard', () => new THREE.BoxGeometry(0.24, 0.16, 0.06)),
          itemMat,
        );
        guard.position.z = -0.34;
        const hilt = new THREE.Mesh(
          this.getGeo('loot_blade_hilt', () => new THREE.BoxGeometry(0.08, 0.09, 0.24)),
          itemMat,
        );
        hilt.position.z = -0.48;
        bladeGroup.add(edge, guard, hilt);
        itemMesh = bladeGroup;
      } else if (def.isThrowable) {
        itemMesh = new THREE.Mesh(
          this.getGeo('loot_throwable', () => new THREE.DodecahedronGeometry(0.22, 0)),
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
    const highRarities = def.allowedRarities.filter(
      (r) => r === 'epic' || r === 'legendary' || r === 'mythic',
    );
    const rarity: Rarity =
      highRarities.length > 0
        ? highRarities[Math.floor(this.rand() * highRarities.length)]
        : def.allowedRarities[def.allowedRarities.length - 1];

    const scatter = (idx: number): Vec3Like => {
      const a = (idx / 5) * Math.PI * 2 + this.rand() * 0.35;
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

    const healId: WeaponId = this.rand() < 0.5 ? 'slurp_juice' : 'shield_potion';
    const healDef = WEAPONS[healId];
    this.spawnLootDrop(
      pos,
      {
        item: {
          uid: this.nextItemUid(),
          weaponId: healId,
          rarity: healDef.allowedRarities[0],
          magAmmo: 0,
          stackCount: 1,
        },
      },
      scatter(2),
    );

    const utilityRoll = this.rand();
    const utilWeaponId: WeaponId =
      utilityRoll < 0.6
        ? 'shield_bubble'
        : utilityRoll < 0.85
          ? 'shockwave_grenade'
          : 'chug_splash';
    const utilDef = WEAPONS[utilWeaponId];
    this.spawnLootDrop(
      pos,
      {
        item: {
          uid: this.nextItemUid(),
          weaponId: utilWeaponId,
          rarity:
            utilDef.allowedRarities[
              Math.floor(this.rand() * utilDef.allowedRarities.length)
            ],
          magAmmo: utilDef.magSize,
          stackCount: utilWeaponId === 'shield_bubble' ? 1 : 2,
        },
      },
      scatter(3),
    );

    this.spawnLootDrop(
      pos,
      { materials: { type: 'metal', amount: 60 } },
      scatter(4),
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

    // 4. Loot llamas subtle idle bob, aura rotation & hit wobble
    for (const entry of this.llamasMap.values()) {
      if (entry.data.opened) continue;
      entry.auraMesh.rotation.y = elapsed * 0.95;
      if (entry.hitWobble > 0) {
        entry.hitWobble = Math.max(0, entry.hitWobble - dt);
        const s = entry.hitWobble * 0.45;
        entry.bodyMesh.rotation.z = Math.sin(elapsed * 42) * s;
      } else {
        entry.bodyMesh.rotation.z = 0;
      }
      entry.bodyMesh.position.y = Math.sin(elapsed * 2.2 + entry.data.x) * 0.04;
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
    this.llamasMap.clear();
    this.llamasList = [];
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
