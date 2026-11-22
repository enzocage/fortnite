import * as THREE from 'three';
import {
  EventBus,
  GRIND_RAIL_SPEED,
  MEDALLIONS,
  POIS,
  RARITY_COLORS,
  REBOOT_VAN_COOLDOWN_SEC,
  WEAPON_MOD_COST_GOLD,
  WEAPONS,
} from '../core';
import type {
  CampfireEntity,
  CapturePointEntity,
  ColliderBox,
  DroppedCrownEntity,
  DroppedMedallionEntity,
  ExplosiveBarrelEntity,
  ForecastTowerEntity,
  GrindRailEntity,
  ItemInstance,
  LaunchPadEntity,
  LootIslandState,
  MedallionId,
  ModBenchEntity,
  NpcSpecialistEntity,
  Rarity,
  RebootVanEntity,
  RiftEntity,
  SlurpBarrelEntity,
  SlurpTankerEntity,
  SpecialistRole,
  StealthBushEntity,
  SupplyDroneEntity,
  TerrainQuery,
  TrapKind,
  UpgradeBenchEntity,
  VaultEntity,
  Vec3Like,
  VendingMachineEntity,
  WeaponBunkerEntity,
  WeaponId,
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

export interface RiftTriggerResult {
  skyPos: Vec3Like;
}

export interface CapturePointAdvanceResult {
  capturedNow: boolean;
  progress: number;
  lootPos?: Vec3Like;
  poiName: string;
}

export interface ExplosiveBarrelDamageResult {
  exploded: boolean;
  position: Vec3Like;
  blastRadius: number;
  blastDamage: number;
}

export interface VendingPurchaseResult {
  item: ItemInstance;
  priceGold: number;
  position: Vec3Like;
}

export interface LootIslandCaptureResult {
  capturedNow: boolean;
  lootPos?: Vec3Like;
}

export interface WeaponBunkerLootResult {
  weaponId: 'combat_smg' | 'boom_bow' | 'tactical_dmr';
  rarity: 'epic' | 'legendary';
  gold: number;
  shieldRestore: number;
}

export interface SlurpTankerDamageResult {
  exploded: boolean;
  x: number;
  y: number;
  z: number;
  radius: number;
  healAmount: number;
}

export interface Wave6ShowcaseResult {
  bunker: WeaponBunkerEntity;
  tanker: SlurpTankerEntity;
  medallion: DroppedMedallionEntity;
  crown: DroppedCrownEntity;
}

export interface GrindRailSampleResult {
  position: Vec3Like;
  tangent: Vec3Like;
}

export interface NearbyGrindRailResult {
  rail: GrindRailEntity;
  t: number;
  position: Vec3Like;
  tangent: Vec3Like;
}

export interface SupplyDroneDamageResult {
  destroyed: boolean;
  x: number;
  y: number;
  z: number;
  rarity: Rarity;
  weaponId: WeaponId;
  gold: number;
  trapKind: TrapKind;
}

export interface Wave7ShowcaseResult {
  rebootVan: RebootVanEntity;
  grindRail: GrindRailEntity;
  drones: SupplyDroneEntity[];
}

export interface Wave8ShowcaseResult {
  modBench: ModBenchEntity;
  forecastTower: ForecastTowerEntity;
  stealthBushes: StealthBushEntity[];
}

interface VendingMachineVisual {
  data: VendingMachineEntity;
  group: THREE.Group;
  screenMat: THREE.MeshStandardMaterial;
  haloMat: THREE.MeshStandardMaterial;
  emblemMat: THREE.MeshStandardMaterial;
  haloGroup: THREE.Group;
  emblemMesh: THREE.Object3D;
  stockPips: THREE.Mesh[];
  activeColorHex: string;
  activeEmissiveHex: string;
  baseHaloY: number;
  collider: ColliderBox;
}

interface NpcSpecialistVisual {
  data: NpcSpecialistEntity;
  group: THREE.Group;
  beaconGroup: THREE.Group;
  emblemGroup: THREE.Group;
  ringMesh: THREE.Mesh;
  baseEmblemY: number;
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

interface RiftVisual {
  data: RiftEntity;
  group: THREE.Group;
  portalGroup: THREE.Group;
  diamond: THREE.Group;
  shardsGroup: THREE.Group;
  haloGroup: THREE.Group;
  baseRing: THREE.Mesh;
  baseDiamondY: number;
}

interface CapturePointVisual {
  data: CapturePointEntity;
  group: THREE.Group;
  flagGroup: THREE.Group;
  bannerMesh: THREE.Mesh;
  trimMesh: THREE.Mesh;
  finialMesh: THREE.Mesh;
  outerRing: THREE.Mesh;
  innerRing: THREE.Mesh;
  uncapturedFlagMat: THREE.Material;
  capturedFlagMat: THREE.Material;
  uncapturedTrimMat: THREE.Material;
  capturedTrimMat: THREE.Material;
  uncapturedRingMat: THREE.Material;
  capturedRingMat: THREE.Material;
  flagMinY: number;
  flagMaxY: number;
  claimedThisFrame: boolean;
}

interface ExplosiveBarrelVisual {
  data: ExplosiveBarrelEntity;
  group: THREE.Group;
  bodyGroup: THREE.Group;
  collider: ColliderBox;
  hitAnim: number;
}

interface WeaponBunkerVisual {
  data: WeaponBunkerEntity;
  group: THREE.Group;
  blastDoor: THREE.Group;
  beaconOrb: THREE.Mesh;
  beaconHalo: THREE.Mesh;
  cacheGroup: THREE.Group;
  amberMat: THREE.Material;
  greenMat: THREE.Material;
  amberHaloMat: THREE.Material;
  greenHaloMat: THREE.Material;
  doorClosedY: number;
  doorOpenY: number;
  doorOpenProgress: number;
  wallColliders: ColliderBox[];
  doorCollider: ColliderBox;
  rewardWeaponId: 'combat_smg' | 'boom_bow' | 'tactical_dmr';
  rewardRarity: 'epic' | 'legendary';
  rewardGold: number;
  rewardShieldRestore: number;
  isQaShowcase?: boolean;
}

interface SlurpTankerVisual {
  data: SlurpTankerEntity;
  group: THREE.Group;
  bodyGroup: THREE.Group;
  intactTankGroup: THREE.Group;
  rupturedTankGroup: THREE.Group;
  collider: ColliderBox;
  hitAnim: number;
  isQaShowcase?: boolean;
}

interface DroppedPickupVisual<T> {
  data: T;
  group: THREE.Group;
  spinGroup: THREE.Group;
  ringMesh: THREE.Mesh;
  baseSpinY: number;
}

interface GrindRailSamplePoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

interface GrindRailRingEntry {
  mesh: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  length: number;
  speed: number;
  t: number;
}

interface GrindRailVisual {
  data: GrindRailEntity;
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  length: number;
  samples: GrindRailSamplePoint[];
  rings: GrindRailRingEntry[];
  isQaShowcase?: boolean;
}

interface RebootVanVisual {
  data: RebootVanEntity;
  group: THREE.Group;
  beaconGroup: THREE.Group;
  beamMesh: THREE.Mesh;
  holoGroup: THREE.Group;
  holoRing: THREE.Mesh;
  activeMat: THREE.MeshStandardMaterial;
  cooldownMat: THREE.MeshStandardMaterial;
  stripeMeshes: THREE.Mesh[];
  holoMeshes: THREE.Mesh[];
  baseHoloY: number;
  collider: ColliderBox;
  isQaShowcase?: boolean;
}

interface SupplyDroneVisual {
  data: SupplyDroneEntity;
  initialAngle: number;
  group: THREE.Group;
  bodyGroup: THREE.Group;
  rotors: THREE.Object3D[];
  coreGroup: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  rewardWeaponId: WeaponId;
  rewardGold: number;
  rewardTrapKind: TrapKind;
  hitAnim: number;
  isQaShowcase?: boolean;
}

interface ModBenchVisual {
  data: ModBenchEntity;
  group: THREE.Group;
  holoGroup: THREE.Group;
  holoRing: THREE.Mesh;
  baseHoloY: number;
  collider: ColliderBox;
  isQaShowcase?: boolean;
}

interface ForecastTowerVisual {
  data: ForecastTowerEntity;
  group: THREE.Group;
  dishPivot: THREE.Group;
  beaconOrb: THREE.Mesh;
  beaconRing: THREE.Mesh;
  beaconBeam: THREE.Mesh;
  screenMesh: THREE.Mesh;
  unscannedMat: THREE.MeshStandardMaterial;
  scannedMat: THREE.MeshStandardMaterial;
  unscannedBeamMat: THREE.MeshBasicMaterial;
  scannedBeamMat: THREE.MeshBasicMaterial;
  collider: ColliderBox;
  isQaShowcase?: boolean;
}

interface StealthBushVisual {
  data: StealthBushEntity;
  group: THREE.Group;
  foliageGroup: THREE.Group;
  rustleTimer: number;
  rustlePhase: number;
  isQaShowcase?: boolean;
}

const RIFT_SKY_OFFSET_Y = 92;
const RIFT_OPEN_WINDOW_SEC = 8;
const RIFT_COOLDOWN_SEC = 45;
const CAPTURE_DURATION_SEC = 12;
const CAPTURE_DECAY_SEC = 18;
const CAPTURE_RADIUS = 6.5;
const EXPLOSIVE_BARREL_HP = 35;
const EXPLOSIVE_BARREL_BLAST_RADIUS = 6.8;
const EXPLOSIVE_BARREL_BLAST_DAMAGE = 85;
const VENDING_DEFAULT_STOCK = 3;
const NPC_SPECIALIST_PRICE_GOLD = 200;
const LOOT_ISLAND_HEIGHT_OFFSET = 24;
const LOOT_ISLAND_RADIUS = 14;
const LOOT_ISLAND_DECK_HALF_EXTENT = 12.5;
const LOOT_ISLAND_DECK_THICKNESS = 0.6;
const LOOT_ISLAND_CAPTURE_DURATION_SEC = 10;
const WEAPON_BUNKER_UNLOCK_PHASE = 2;
const SLURP_TANKER_HP = 220;
const SLURP_TANKER_HEAL_RADIUS = 10;
const SLURP_TANKER_HEAL_AMOUNT = 60;
const SUPPLY_DRONE_HP = 75;
const GRIND_RAIL_SAMPLE_COUNT = 120;
const STEALTH_BUSH_RADIUS = 1.85;
const STEALTH_BUSH_RUSTLE_SEC = 0.55;
const MOD_BENCH_NEARBY_RADIUS = 3.8;
const FORECAST_TOWER_NEARBY_RADIUS = 4.2;
const BUNKER_LOOT_WEAPONS: readonly ('combat_smg' | 'boom_bow' | 'tactical_dmr')[] = [
  'combat_smg',
  'boom_bow',
  'tactical_dmr',
];

const _tmpRailPos = new THREE.Vector3();
const _tmpRailTan = new THREE.Vector3();
const _tmpForwardZ = new THREE.Vector3(0, 0, 1);

export class WorldInteractables {
  private group = new THREE.Group();
  private terrain: TerrainQuery;
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
  private rifts: RiftEntity[] = [];
  private riftsMap = new Map<string, RiftVisual>();
  private capturePoints: CapturePointEntity[] = [];
  private capturePointsMap = new Map<string, CapturePointVisual>();
  private explosiveBarrels: ExplosiveBarrelEntity[] = [];
  private explosiveBarrelsMap = new Map<string, ExplosiveBarrelVisual>();
  private vendingMachines: VendingMachineEntity[] = [];
  private vendingMachinesMap = new Map<string, VendingMachineVisual>();
  private vendingItemCounter = 0;
  private npcSpecialists: NpcSpecialistEntity[] = [];
  private npcSpecialistsMap = new Map<string, NpcSpecialistVisual>();
  private weaponBunkers: WeaponBunkerEntity[] = [];
  private weaponBunkersMap = new Map<string, WeaponBunkerVisual>();
  private slurpTankers: SlurpTankerEntity[] = [];
  private slurpTankersMap = new Map<string, SlurpTankerVisual>();
  private droppedMedallions: DroppedMedallionEntity[] = [];
  private droppedMedallionsMap = new Map<string, DroppedPickupVisual<DroppedMedallionEntity>>();
  private droppedMedallionCounter = 0;
  private droppedCrowns: DroppedCrownEntity[] = [];
  private droppedCrownsMap = new Map<string, DroppedPickupVisual<DroppedCrownEntity>>();
  private droppedCrownCounter = 0;
  private grindRails: GrindRailEntity[] = [];
  private grindRailsMap = new Map<string, GrindRailVisual>();
  private rebootVans: RebootVanEntity[] = [];
  private rebootVansMap = new Map<string, RebootVanVisual>();
  private supplyDrones: SupplyDroneEntity[] = [];
  private supplyDronesMap = new Map<string, SupplyDroneVisual>();
  private modBenches: ModBenchEntity[] = [];
  private modBenchesMap = new Map<string, ModBenchVisual>();
  private forecastTowers: ForecastTowerEntity[] = [];
  private forecastTowersMap = new Map<string, ForecastTowerVisual>();
  private stealthBushes: StealthBushEntity[] = [];
  private stealthBushesMap = new Map<string, StealthBushVisual>();
  private qaShowcaseGeos: THREE.BufferGeometry[] = [];
  private lootIslandState: LootIslandState = {
    active: false,
    spawnedAtSec: 0,
    x: 0,
    y: 0,
    z: 0,
    radius: LOOT_ISLAND_RADIUS,
    captured: false,
    captureProgress: 0,
  };
  private lootIslandGroup!: THREE.Group;
  private lootIslandFlagGroup!: THREE.Group;
  private lootIslandBannerMesh!: THREE.Mesh;
  private lootIslandTrimMesh!: THREE.Mesh;
  private lootIslandFinialMesh!: THREE.Mesh;
  private lootIslandOuterRing!: THREE.Mesh;
  private lootIslandInnerRing!: THREE.Mesh;
  private lootIslandUncapturedFlagMat!: THREE.Material;
  private lootIslandCapturedFlagMat!: THREE.Material;
  private lootIslandUncapturedTrimMat!: THREE.Material;
  private lootIslandCapturedTrimMat!: THREE.Material;
  private lootIslandUncapturedRingMat!: THREE.Material;
  private lootIslandCapturedRingMat!: THREE.Material;
  private lootIslandFlagMinY = 1.2;
  private lootIslandFlagMaxY = 5.8;
  private lootIslandGeyserGroup!: THREE.Group;
  private lootIslandGeyserCore!: THREE.Group;
  private lootIslandGeyserRings: THREE.Mesh[] = [];
  private padVisuals: PadVisual[] = [];
  private ziplineOrbs: ZiplineOrb[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private sharedGeos = new Map<string, THREE.BufferGeometry>();
  private sharedMats = new Map<string, THREE.Material>();

  constructor(terrain: TerrainQuery, eventBus?: EventBus) {
    this.group.name = 'WorldInteractables';
    this.terrain = terrain;
    this.eventBus = eventBus;
    this.buildLaunchPads(terrain);
    this.buildZiplines(terrain);
    this.buildVaults(terrain);
    this.buildUpgradeBenches(terrain);
    this.buildCampfires(terrain);
    this.buildSlurpBarrels(terrain);
    this.buildRifts(terrain);
    this.buildCapturePoints(terrain);
    this.buildExplosiveBarrels(terrain);
    this.buildVendingMachines(terrain);
    this.buildNpcSpecialists(terrain);
    this.buildWeaponBunkers(terrain);
    this.buildSlurpTankers(terrain);
    this.buildLootIsland();
    this.buildGrindRails(terrain);
    this.buildRebootVans(terrain);
    this.buildSupplyDrones(terrain);
    this.buildModBenches(terrain);
    this.buildForecastTowers(terrain);
    this.buildStealthBushes(terrain);
  }

  private addGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private addMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private getSharedGeo<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
    let g = this.sharedGeos.get(key) as T | undefined;
    if (!g) {
      g = factory();
      this.sharedGeos.set(key, g);
    }
    return g;
  }

  private getSharedMat<T extends THREE.Material>(key: string, factory: () => T): T {
    let m = this.sharedMats.get(key) as T | undefined;
    if (!m) {
      m = factory();
      this.sharedMats.set(key, m);
    }
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

  private buildRifts(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{ id: string; poiId: string; dx: number; dz: number }> = [
      { id: 'rift_frostpeak_citadel', poiId: 'frostpeak_citadel', dx: -28, dz: 6 },
      { id: 'rift_scorched_caldera', poiId: 'scorched_caldera', dx: -26, dz: -18 },
      { id: 'rift_sunken_oasis', poiId: 'sunken_oasis', dx: -28, dz: 10 },
      { id: 'rift_whispering_pines', poiId: 'whispering_pines', dx: 34, dz: 4 },
      { id: 'rift_skyline_spire', poiId: 'skyline_spire', dx: 26, dz: 16 },
    ];

    const diamondCoreMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#67e8f9',
        emissive: '#22d3ee',
        emissiveIntensity: 1.65,
        roughness: 0.14,
        metalness: 0.25,
      }),
    );
    const diamondAuraMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#a855f7',
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const shardCyanMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 1.45,
        roughness: 0.18,
        metalness: 0.35,
      }),
    );
    const shardVioletMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#c084fc',
        emissive: '#9333ea',
        emissiveIntensity: 1.45,
        roughness: 0.18,
        metalness: 0.35,
      }),
    );
    const haloCyanMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#67e8f9',
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const haloVioletMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#c084fc',
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const baseRingMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const diamondGeo = this.addGeo(new THREE.OctahedronGeometry(0.5, 0));
    const diamondAuraGeo = this.addGeo(new THREE.OctahedronGeometry(0.7, 0));
    const shardGeo = this.addGeo(new THREE.ConeGeometry(0.14, 0.92, 4));
    const haloGeo = this.addGeo(new THREE.TorusGeometry(1.18, 0.045, 8, 28));
    const moteGeo = this.addGeo(new THREE.OctahedronGeometry(0.11, 0));
    const baseRingGeo = this.addGeo(new THREE.RingGeometry(0.95, 1.45, 24));
    baseRingGeo.rotateX(-Math.PI * 0.5);

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;

      const x = poi.x + spec.dx;
      const z = poi.z + spec.dz;
      const y = terrain.getHeightAt(x, z);

      const data: RiftEntity = {
        id: spec.id,
        poiId: spec.poiId,
        x,
        y,
        z,
        active: true,
        openRemainingSec: 0,
        cooldownSec: 0,
      };
      this.rifts.push(data);

      const riftGroup = new THREE.Group();
      riftGroup.name = `SkyRift_${spec.id}`;
      riftGroup.position.set(x, y, z);

      const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
      baseRing.position.y = 0.06;
      riftGroup.add(baseRing);

      const portalGroup = new THREE.Group();

      // Vertical distortion diamond
      const diamond = new THREE.Group();
      const baseDiamondY = 1.65;
      diamond.position.set(0, baseDiamondY, 0);
      const coreMesh = new THREE.Mesh(diamondGeo, diamondCoreMat);
      coreMesh.scale.set(0.78, 1.95, 0.78);
      const auraMesh = new THREE.Mesh(diamondAuraGeo, diamondAuraMat);
      auraMesh.scale.set(0.92, 2.25, 0.92);
      diamond.add(coreMesh, auraMesh);
      portalGroup.add(diamond);

      // Glowing cracked cyan-violet spatial portal shards
      const shardsGroup = new THREE.Group();
      shardsGroup.position.set(0, baseDiamondY, 0);
      const shardCount = 6;
      for (let s = 0; s < shardCount; s++) {
        const ang = (s / shardCount) * Math.PI * 2;
        const rad = 0.88 + (s % 2) * 0.24;
        const shard = new THREE.Mesh(shardGeo, s % 2 === 0 ? shardCyanMat : shardVioletMat);
        shard.position.set(Math.cos(ang) * rad, ((s % 3) - 1) * 0.34, Math.sin(ang) * rad);
        shard.rotation.order = 'YXZ';
        shard.rotation.y = ang;
        shard.rotation.z = (s % 2 === 0 ? 1 : -1) * 0.38;
        shard.rotation.x = 0.18 * (s % 3 - 1);
        shardsGroup.add(shard);
      }
      portalGroup.add(shardsGroup);

      // Hovering orbiting energy halo
      const haloGroup = new THREE.Group();
      haloGroup.position.set(0, baseDiamondY, 0);
      const ring1 = new THREE.Mesh(haloGeo, haloCyanMat);
      ring1.rotation.x = Math.PI * 0.38;
      const ring2 = new THREE.Mesh(haloGeo, haloVioletMat);
      ring2.rotation.x = -Math.PI * 0.34;
      ring2.rotation.y = Math.PI * 0.25;
      haloGroup.add(ring1, ring2);

      for (let m = 0; m < 3; m++) {
        const mAng = (m / 3) * Math.PI * 2;
        const mote = new THREE.Mesh(moteGeo, m % 2 === 0 ? shardCyanMat : shardVioletMat);
        mote.position.set(Math.cos(mAng) * 1.18, 0, Math.sin(mAng) * 1.18);
        haloGroup.add(mote);
      }
      portalGroup.add(haloGroup);

      riftGroup.add(portalGroup);
      this.group.add(riftGroup);

      this.riftsMap.set(spec.id, {
        data,
        group: riftGroup,
        portalGroup,
        diamond,
        shardsGroup,
        haloGroup,
        baseRing,
        baseDiamondY,
      });
    }
  }

  private buildCapturePoints(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{ id: string; poiId: string; dx: number; dz: number }> = [
      { id: 'cp_metro_towers', poiId: 'metro_towers', dx: 0, dz: 12 },
      { id: 'cp_market_row', poiId: 'market_row', dx: 0, dz: 14 },
      { id: 'cp_crater_depot', poiId: 'crater_depot', dx: 14, dz: 2 },
      { id: 'cp_sunny_suburbs', poiId: 'sunny_suburbs', dx: 0, dz: 1 },
    ];

    const poleMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.3, metalness: 0.86 }),
    );
    const baseSteelMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.42, metalness: 0.78 }),
    );
    const uncapturedFlagMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 1.05,
        transparent: true,
        opacity: 0.84,
        roughness: 0.2,
        metalness: 0.25,
      }),
    );
    const capturedFlagMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#f59e0b',
        emissiveIntensity: 1.55,
        transparent: true,
        opacity: 0.94,
        roughness: 0.18,
        metalness: 0.35,
      }),
    );
    const uncapturedTrimMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#67e8f9',
        emissive: '#06b6d4',
        emissiveIntensity: 1.35,
        roughness: 0.2,
      }),
    );
    const capturedTrimMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 1.75,
        roughness: 0.15,
      }),
    );
    const uncapturedRingMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const capturedRingMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#facc15',
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const basePedestalGeo = this.addGeo(new THREE.CylinderGeometry(0.55, 0.72, 0.28, 12));
    const baseCollarGeo = this.addGeo(new THREE.CylinderGeometry(0.24, 0.34, 0.24, 12));
    const poleGeo = this.addGeo(new THREE.CylinderGeometry(0.08, 0.11, 7.2, 10));
    const finialGeo = this.addGeo(new THREE.OctahedronGeometry(0.24, 0));
    const crossbarGeo = this.addGeo(new THREE.BoxGeometry(1.9, 0.08, 0.08));
    const bannerGeo = this.addGeo(new THREE.BoxGeometry(1.85, 1.05, 0.05));
    const trimGeo = this.addGeo(new THREE.BoxGeometry(1.88, 0.14, 0.07));
    const outerRingGeo = this.addGeo(
      new THREE.RingGeometry(CAPTURE_RADIUS - 0.28, CAPTURE_RADIUS, 48),
    );
    outerRingGeo.rotateX(-Math.PI * 0.5);
    const innerRingGeo = this.addGeo(new THREE.RingGeometry(1.05, 1.35, 32));
    innerRingGeo.rotateX(-Math.PI * 0.5);

    const flagMinY = 1.2;
    const flagMaxY = 6.2;

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;

      const x = poi.x + spec.dx;
      const z = poi.z + spec.dz;
      const y = terrain.getHeightAt(x, z);

      const data: CapturePointEntity = {
        id: spec.id,
        poiId: spec.poiId,
        poiName: poi.name,
        x,
        y,
        z,
        radius: CAPTURE_RADIUS,
        progress: 0,
        captured: false,
        ownerId: null,
        ownerName: null,
      };
      this.capturePoints.push(data);

      const cpGroup = new THREE.Group();
      cpGroup.name = `CapturePoint_${spec.id}`;
      cpGroup.position.set(x, y, z);

      const pedestal = new THREE.Mesh(basePedestalGeo, baseSteelMat);
      pedestal.position.y = 0.14;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;

      const collar = new THREE.Mesh(baseCollarGeo, poleMat);
      collar.position.y = 0.4;
      collar.castShadow = true;

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 3.8;
      pole.castShadow = true;

      const finialMesh = new THREE.Mesh(finialGeo, uncapturedTrimMat);
      finialMesh.position.y = 7.55;

      const outerRing = new THREE.Mesh(outerRingGeo, uncapturedRingMat);
      outerRing.position.y = 0.05;

      const innerRing = new THREE.Mesh(innerRingGeo, uncapturedTrimMat);
      innerRing.position.y = 0.06;

      const flagGroup = new THREE.Group();
      flagGroup.position.set(0, flagMinY, 0);

      const crossbar = new THREE.Mesh(crossbarGeo, poleMat);
      crossbar.position.set(0.95, 0, 0);

      const bannerMesh = new THREE.Mesh(bannerGeo, uncapturedFlagMat);
      bannerMesh.position.set(0.95, -0.52, 0);

      const trimMesh = new THREE.Mesh(trimGeo, uncapturedTrimMat);
      trimMesh.position.set(0.95, -0.98, 0);

      flagGroup.add(crossbar, bannerMesh, trimMesh);
      cpGroup.add(pedestal, collar, pole, finialMesh, outerRing, innerRing, flagGroup);
      this.group.add(cpGroup);

      this.capturePointsMap.set(spec.id, {
        data,
        group: cpGroup,
        flagGroup,
        bannerMesh,
        trimMesh,
        finialMesh,
        outerRing,
        innerRing,
        uncapturedFlagMat,
        capturedFlagMat,
        uncapturedTrimMat,
        capturedTrimMat,
        uncapturedRingMat,
        capturedRingMat,
        flagMinY,
        flagMaxY,
        claimedThisFrame: false,
      });
    }
  }

  private buildExplosiveBarrels(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{ id: string; poiId?: string; dx: number; dz: number }> = [
      // Industrial / Container / Warehouse clusters (Crater Depot)
      { id: 'exp_crater_red_wh', poiId: 'crater_depot', dx: -10, dz: -12 },
      { id: 'exp_crater_blue_wh', poiId: 'crater_depot', dx: -10, dz: 16 },
      { id: 'exp_crater_gray_wh', poiId: 'crater_depot', dx: 18, dz: -22 },
      // River Suspension Bridges & Crystal Basin Bridge approaches
      { id: 'exp_bridge_n_west', dx: 75.5, dz: 11.2 },
      { id: 'exp_bridge_n_east', dx: 115.5, dz: 5.0 },
      { id: 'exp_bridge_s_west', dx: 78.0, dz: 159.0 },
      { id: 'exp_bridge_s_east', dx: 118.0, dz: 153.0 },
      { id: 'exp_bridge_crystal_w', poiId: 'crystal_basin', dx: -60, dz: -3 },
      // POI streets, alleys, labs, bunkers & docks
      { id: 'exp_market_gas', poiId: 'market_row', dx: 21, dz: 15 },
      { id: 'exp_market_mall', poiId: 'market_row', dx: 23, dz: -16 },
      { id: 'exp_metro_north', poiId: 'metro_towers', dx: 9, dz: -16 },
      { id: 'exp_metro_south', poiId: 'metro_towers', dx: 10, dz: 17 },
      { id: 'exp_suburbs_ne', poiId: 'sunny_suburbs', dx: 26, dz: -18 },
      { id: 'exp_frost_gate', poiId: 'frostpeak_citadel', dx: 5, dz: 21 },
      { id: 'exp_caldera_lab1', poiId: 'scorched_caldera', dx: 16, dz: -10 },
      { id: 'exp_caldera_lab2', poiId: 'scorched_caldera', dx: 4, dz: 18 },
      { id: 'exp_oasis_bazaar', poiId: 'sunken_oasis', dx: -14, dz: 18 },
      { id: 'exp_skyline_pavilion', poiId: 'skyline_spire', dx: -23, dz: -12 },
    ];

    const drumRedMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#dc2626',
        emissive: '#7f1d1d',
        emissiveIntensity: 0.28,
        roughness: 0.36,
        metalness: 0.45,
      }),
    );
    const cautionYellowMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#ca8a04',
        emissiveIntensity: 0.42,
        roughness: 0.38,
        metalness: 0.22,
      }),
    );
    const hazardDarkMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.38,
        metalness: 0.8,
      }),
    );
    const capOrangeMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#f97316',
        emissive: '#ea580c',
        emissiveIntensity: 0.65,
        roughness: 0.28,
        metalness: 0.4,
      }),
    );

    const drumGeo = this.addGeo(new THREE.CylinderGeometry(0.41, 0.41, 1.14, 16));
    const cautionGeo = this.addGeo(new THREE.CylinderGeometry(0.425, 0.425, 0.24, 16));
    const stripeBorderGeo = this.addGeo(new THREE.CylinderGeometry(0.422, 0.422, 0.05, 16));
    const rimGeo = this.addGeo(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 16));
    const lidGeo = this.addGeo(new THREE.CylinderGeometry(0.38, 0.41, 0.06, 16));
    const bungGeo = this.addGeo(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 10));

    for (const spec of specs) {
      let x = spec.dx;
      let z = spec.dz;
      if (spec.poiId) {
        const poi = poiMap.get(spec.poiId);
        if (!poi) continue;
        x = poi.x + spec.dx;
        z = poi.z + spec.dz;
      }
      const y = terrain.getHeightAt(x, z);

      const data: ExplosiveBarrelEntity = {
        id: spec.id,
        x,
        y,
        z,
        hp: EXPLOSIVE_BARREL_HP,
        maxHp: EXPLOSIVE_BARREL_HP,
        blastRadius: EXPLOSIVE_BARREL_BLAST_RADIUS,
        blastDamage: EXPLOSIVE_BARREL_BLAST_DAMAGE,
        exploded: false,
      };
      this.explosiveBarrels.push(data);

      const barrelGroup = new THREE.Group();
      barrelGroup.name = `ExplosiveBarrel_${spec.id}`;
      barrelGroup.position.set(x, y, z);

      const bodyGroup = new THREE.Group();

      const drum = new THREE.Mesh(drumGeo, drumRedMat);
      drum.position.y = 0.58;
      drum.castShadow = true;
      drum.receiveShadow = true;
      bodyGroup.add(drum);

      const cautionStripe = new THREE.Mesh(cautionGeo, cautionYellowMat);
      cautionStripe.position.y = 0.58;
      bodyGroup.add(cautionStripe);

      for (const sy of [0.44, 0.72]) {
        const border = new THREE.Mesh(stripeBorderGeo, hazardDarkMat);
        border.position.y = sy;
        bodyGroup.add(border);
      }

      for (const ry of [0.08, 1.08]) {
        const rim = new THREE.Mesh(rimGeo, hazardDarkMat);
        rim.position.y = ry;
        rim.castShadow = true;
        bodyGroup.add(rim);
      }

      const lid = new THREE.Mesh(lidGeo, drumRedMat);
      lid.position.y = 1.15;
      bodyGroup.add(lid);

      const bung = new THREE.Mesh(bungGeo, capOrangeMat);
      bung.position.set(0.14, 1.2, 0);
      bodyGroup.add(bung);

      barrelGroup.add(bodyGroup);
      this.group.add(barrelGroup);

      const collider: ColliderBox = {
        id: `${spec.id}_col`,
        minX: x - 0.52,
        minY: y,
        minZ: z - 0.52,
        maxX: x + 0.52,
        maxY: y + 1.25,
        maxZ: z + 0.52,
        material: 'metal',
        tag: `explosive_barrel:${spec.id}`,
      };

      this.explosiveBarrelsMap.set(spec.id, {
        data,
        group: barrelGroup,
        bodyGroup,
        collider,
        hitAnim: 0,
      });
    }
  }

  private buildVendingMachines(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      poiId: string;
      kind: 'mending' | 'weapon';
      dx: number;
      dz: number;
      rotationY: number;
      offerWeaponId: WeaponId;
      offerRarity: Rarity;
      priceGold: number;
    }> = [
      {
        id: 'vm_metro_towers',
        poiId: 'metro_towers',
        kind: 'mending',
        dx: 12,
        dz: 0,
        rotationY: -Math.PI * 0.5,
        offerWeaponId: 'medkit',
        offerRarity: 'uncommon',
        priceGold: 75,
      },
      {
        id: 'vm_sunny_suburbs',
        poiId: 'sunny_suburbs',
        kind: 'mending',
        dx: 0,
        dz: 22,
        rotationY: Math.PI,
        offerWeaponId: 'shield_potion',
        offerRarity: 'rare',
        priceGold: 90,
      },
      {
        id: 'vm_crater_depot',
        poiId: 'crater_depot',
        kind: 'mending',
        dx: 12,
        dz: -10,
        rotationY: 0,
        offerWeaponId: 'chug_splash',
        offerRarity: 'rare',
        priceGold: 100,
      },
      {
        id: 'vm_market_row',
        poiId: 'market_row',
        kind: 'weapon',
        dx: 6,
        dz: -2,
        rotationY: 0,
        offerWeaponId: 'tactical_dmr',
        offerRarity: 'epic',
        priceGold: 175,
      },
      {
        id: 'vm_skyline_spire',
        poiId: 'skyline_spire',
        kind: 'weapon',
        dx: 18,
        dz: 0,
        rotationY: -Math.PI * 0.5,
        offerWeaponId: 'kinetic_blade',
        offerRarity: 'epic',
        priceGold: 225,
      },
      {
        id: 'vm_frostpeak_citadel',
        poiId: 'frostpeak_citadel',
        kind: 'weapon',
        dx: 12,
        dz: -4,
        rotationY: -Math.PI * 0.5,
        offerWeaponId: 'heavy_shotgun',
        offerRarity: 'legendary',
        priceGold: 250,
      },
    ];

    const baseDarkMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.45, metalness: 0.78 }),
    );
    const mendingBodyMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#0e3a4c', roughness: 0.36, metalness: 0.62 }),
    );
    const weaponBodyMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.36, metalness: 0.72 }),
    );
    const screenBackingMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#020617', roughness: 0.2, metalness: 0.5 }),
    );
    const chuteMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.4, metalness: 0.8 }),
    );

    const baseGeo = this.addGeo(new THREE.BoxGeometry(1.56, 0.16, 1.06));
    const chassisGeo = this.addGeo(new THREE.BoxGeometry(1.44, 2.38, 0.92));
    const marqueeGeo = this.addGeo(new THREE.BoxGeometry(1.54, 0.32, 1.06));
    const railGeo = this.addGeo(new THREE.BoxGeometry(0.08, 2.26, 0.12));
    const frameGeo = this.addGeo(new THREE.BoxGeometry(1.14, 1.24, 0.06));
    const screenGeo = this.addGeo(new THREE.BoxGeometry(0.98, 1.06, 0.04));
    const chuteGeo = this.addGeo(new THREE.BoxGeometry(0.92, 0.36, 0.12));
    const pipGeo = this.addGeo(new THREE.BoxGeometry(0.16, 0.08, 0.06));
    const haloRingGeo = this.addGeo(new THREE.TorusGeometry(0.42, 0.045, 8, 24));
    haloRingGeo.rotateX(Math.PI * 0.42);
    const haloCoreGeo = this.addGeo(new THREE.OctahedronGeometry(0.2, 0));
    const frontEmblemCrossGeo = this.addGeo(new THREE.BoxGeometry(0.42, 0.14, 0.06));
    const frontEmblemWeaponGeo = this.addGeo(new THREE.OctahedronGeometry(0.22, 0));

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;

      const x = poi.x + spec.dx;
      const z = poi.z + spec.dz;
      const y = terrain.getHeightAt(x, z);

      const data: VendingMachineEntity = {
        id: spec.id,
        poiId: spec.poiId,
        kind: spec.kind,
        x,
        y,
        z,
        rotationY: spec.rotationY,
        offerWeaponId: spec.offerWeaponId,
        offerRarity: spec.offerRarity,
        priceGold: spec.priceGold,
        stock: VENDING_DEFAULT_STOCK,
      };
      this.vendingMachines.push(data);

      const isMending = spec.kind === 'mending';
      const activeColorHex = isMending ? '#22d3ee' : '#facc15';
      const activeEmissiveHex = isMending ? '#06b6d4' : '#f59e0b';

      const screenMat = this.addMat(
        new THREE.MeshStandardMaterial({
          color: activeColorHex,
          emissive: activeEmissiveHex,
          emissiveIntensity: 1.35,
          roughness: 0.16,
          metalness: 0.25,
          transparent: true,
          opacity: 0.9,
        }),
      );
      const haloMat = this.addMat(
        new THREE.MeshStandardMaterial({
          color: activeColorHex,
          emissive: activeEmissiveHex,
          emissiveIntensity: 1.65,
          roughness: 0.15,
          metalness: 0.35,
        }),
      );
      const emblemMat = this.addMat(
        new THREE.MeshStandardMaterial({
          color: isMending ? '#ecfeff' : '#fef08a',
          emissive: activeColorHex,
          emissiveIntensity: 1.45,
          roughness: 0.18,
          metalness: 0.3,
        }),
      );

      const vmGroup = new THREE.Group();
      vmGroup.name = `VendingMachine_${spec.id}`;
      vmGroup.position.set(x, y, z);
      vmGroup.rotation.y = spec.rotationY;

      const base = new THREE.Mesh(baseGeo, baseDarkMat);
      base.position.y = 0.08;
      base.castShadow = true;
      base.receiveShadow = true;
      vmGroup.add(base);

      const chassis = new THREE.Mesh(chassisGeo, isMending ? mendingBodyMat : weaponBodyMat);
      chassis.position.y = 1.35;
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      vmGroup.add(chassis);

      const marquee = new THREE.Mesh(marqueeGeo, baseDarkMat);
      marquee.position.set(0, 2.66, 0.05);
      marquee.rotation.x = 0.12;
      marquee.castShadow = true;
      vmGroup.add(marquee);

      for (const rx of [-0.74, 0.74]) {
        const rail = new THREE.Mesh(railGeo, haloMat);
        rail.position.set(rx, 1.36, 0.44);
        vmGroup.add(rail);
      }

      const frame = new THREE.Mesh(frameGeo, screenBackingMat);
      frame.position.set(0, 1.72, 0.45);
      vmGroup.add(frame);

      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.set(0, 1.72, 0.48);
      vmGroup.add(screen);

      let emblemMesh: THREE.Object3D;
      if (isMending) {
        const crossGroup = new THREE.Group();
        const barH = new THREE.Mesh(frontEmblemCrossGeo, emblemMat);
        const barV = new THREE.Mesh(frontEmblemCrossGeo, emblemMat);
        barV.rotation.z = Math.PI * 0.5;
        crossGroup.add(barH, barV);
        crossGroup.position.set(0, 1.74, 0.56);
        emblemMesh = crossGroup;
      } else {
        const diamond = new THREE.Mesh(frontEmblemWeaponGeo, emblemMat);
        diamond.position.set(0, 1.74, 0.56);
        emblemMesh = diamond;
      }
      vmGroup.add(emblemMesh);

      const chute = new THREE.Mesh(chuteGeo, chuteMat);
      chute.position.set(0, 0.52, 0.45);
      vmGroup.add(chute);

      const stockPips: THREE.Mesh[] = [];
      for (let p = 0; p < VENDING_DEFAULT_STOCK; p++) {
        const pip = new THREE.Mesh(pipGeo, haloMat);
        pip.position.set((p - 1) * 0.24, 1.0, 0.48);
        vmGroup.add(pip);
        stockPips.push(pip);
      }

      const baseHaloY = 3.22;
      const haloGroup = new THREE.Group();
      haloGroup.position.set(0, baseHaloY, 0);
      const haloRing = new THREE.Mesh(haloRingGeo, haloMat);
      const haloCore = new THREE.Mesh(haloCoreGeo, emblemMat);
      haloGroup.add(haloRing, haloCore);
      vmGroup.add(haloGroup);

      this.group.add(vmGroup);

      const cosR = Math.abs(Math.cos(spec.rotationY));
      const sinR = Math.abs(Math.sin(spec.rotationY));
      const halfX = 0.78 * cosR + 0.55 * sinR;
      const halfZ = 0.78 * sinR + 0.55 * cosR;
      const collider: ColliderBox = {
        id: `${spec.id}_col`,
        minX: x - halfX,
        minY: y,
        minZ: z - halfZ,
        maxX: x + halfX,
        maxY: y + 2.8,
        maxZ: z + halfZ,
        material: 'metal',
        tag: `vending_machine:${spec.id}`,
      };

      const visual: VendingMachineVisual = {
        data,
        group: vmGroup,
        screenMat,
        haloMat,
        emblemMat,
        haloGroup,
        emblemMesh,
        stockPips,
        activeColorHex,
        activeEmissiveHex,
        baseHaloY,
        collider,
      };
      this.syncVendingMachineVisual(visual);
      this.vendingMachinesMap.set(spec.id, visual);
    }
  }

  private buildNpcSpecialists(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      name: string;
      role: SpecialistRole;
      poiId: string;
      skinId: string;
      dx: number;
      dz: number;
    }> = [
      {
        id: 'npc_recon_nova',
        name: 'Recon Nova',
        role: 'scout',
        poiId: 'whispering_pines',
        skinId: 'neon_drift',
        dx: -2,
        dz: 8,
      },
      {
        id: 'npc_doc_remedy',
        name: 'Doc Remedy',
        role: 'medic',
        poiId: 'sunken_oasis',
        skinId: 'emerald_scout',
        dx: -2,
        dz: 6,
      },
      {
        id: 'npc_tank_bastion',
        name: 'Tank Bastion',
        role: 'heavy',
        poiId: 'frostpeak_citadel',
        skinId: 'arctic_apex',
        dx: -5,
        dz: 13,
      },
    ];

    const roleColors: Record<SpecialistRole, { color: string; emissive: string }> = {
      scout: { color: '#22d3ee', emissive: '#06b6d4' },
      medic: { color: '#34d399', emissive: '#10b981' },
      heavy: { color: '#fbbf24', emissive: '#f59e0b' },
    };

    const padSteelMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.8 }),
    );
    const kioskMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.35, metalness: 0.78 }),
    );

    const padGeo = this.addGeo(new THREE.CylinderGeometry(0.92, 1.08, 0.18, 8));
    const consolePostGeo = this.addGeo(new THREE.BoxGeometry(0.46, 1.15, 0.34));
    const consoleScreenGeo = this.addGeo(new THREE.BoxGeometry(0.36, 0.28, 0.05));
    const ringGeo = this.addGeo(new THREE.RingGeometry(0.92, 1.24, 24));
    ringGeo.rotateX(-Math.PI * 0.5);
    const beamGeo = this.addGeo(new THREE.CylinderGeometry(0.42, 0.72, 2.7, 14, 1, true));
    const torsoGeo = this.addGeo(new THREE.OctahedronGeometry(0.26, 0));
    const headGeo = this.addGeo(new THREE.SphereGeometry(0.15, 10, 8));
    const chevronRingGeo = this.addGeo(new THREE.TorusGeometry(0.44, 0.04, 8, 24));
    chevronRingGeo.rotateX(Math.PI * 0.38);

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;

      const x = poi.x + spec.dx;
      const z = poi.z + spec.dz;
      const y = terrain.getHeightAt(x, z);

      const data: NpcSpecialistEntity = {
        id: spec.id,
        name: spec.name,
        role: spec.role,
        poiId: spec.poiId,
        skinId: spec.skinId,
        x,
        y,
        z,
        priceGold: NPC_SPECIALIST_PRICE_GOLD,
        hiredBy: null,
      };
      this.npcSpecialists.push(data);

      const palette = roleColors[spec.role];
      const accentMat = this.addMat(
        new THREE.MeshStandardMaterial({
          color: palette.color,
          emissive: palette.emissive,
          emissiveIntensity: 1.55,
          roughness: 0.18,
          metalness: 0.3,
        }),
      );
      const beamMat = this.addMat(
        new THREE.MeshBasicMaterial({
          color: palette.color,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const ringMat = this.addMat(
        new THREE.MeshBasicMaterial({
          color: palette.color,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );

      const npcGroup = new THREE.Group();
      npcGroup.name = `NpcSpecialist_${spec.id}`;
      npcGroup.position.set(x, y, z);

      const pad = new THREE.Mesh(padGeo, padSteelMat);
      pad.position.y = 0.09;
      pad.castShadow = true;
      pad.receiveShadow = true;
      npcGroup.add(pad);

      const post = new THREE.Mesh(consolePostGeo, kioskMat);
      post.position.set(0, 0.58, -0.62);
      post.castShadow = true;
      npcGroup.add(post);

      const postScreen = new THREE.Mesh(consoleScreenGeo, accentMat);
      postScreen.position.set(0, 0.96, -0.43);
      postScreen.rotation.x = -0.35;
      npcGroup.add(postScreen);

      const beaconGroup = new THREE.Group();
      beaconGroup.name = `NpcBeacon_${spec.id}`;

      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.05;
      beaconGroup.add(ringMesh);

      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 1.52;
      beaconGroup.add(beam);

      const baseEmblemY = 1.68;
      const emblemGroup = new THREE.Group();
      emblemGroup.position.set(0, baseEmblemY, 0);

      const torso = new THREE.Mesh(torsoGeo, accentMat);
      torso.scale.set(0.95, 1.35, 0.75);
      const head = new THREE.Mesh(headGeo, accentMat);
      head.position.y = 0.48;
      const chevronRing = new THREE.Mesh(chevronRingGeo, accentMat);
      emblemGroup.add(torso, head, chevronRing);

      beaconGroup.add(emblemGroup);
      npcGroup.add(beaconGroup);
      this.group.add(npcGroup);

      this.npcSpecialistsMap.set(spec.id, {
        data,
        group: npcGroup,
        beaconGroup,
        emblemGroup,
        ringMesh,
        baseEmblemY,
      });
    }
  }

  private makeRotatedCollider(
    id: string,
    centerX: number,
    centerZ: number,
    localCx: number,
    localCz: number,
    localHalfW: number,
    localHalfD: number,
    minY: number,
    maxY: number,
    rotY: number,
    material: 'metal' | 'brick' | 'wood',
    tag: string,
  ): ColliderBox {
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const wx = centerX + localCx * cos + localCz * sin;
    const wz = centerZ - localCx * sin + localCz * cos;
    const halfX = localHalfW * Math.abs(cos) + localHalfD * Math.abs(sin);
    const halfZ = localHalfW * Math.abs(sin) + localHalfD * Math.abs(cos);
    return {
      id,
      minX: wx - halfX,
      minY,
      minZ: wz - halfZ,
      maxX: wx + halfX,
      maxY,
      maxZ: wz + halfZ,
      material,
      tag,
    };
  }

  private createWeaponBunkerEntry(spec: {
    id: string;
    poiId: string;
    x: number;
    z: number;
    rotationY: number;
    unlocked?: boolean;
    rewardIndex: number;
    isQaShowcase?: boolean;
  }): WeaponBunkerVisual {
    const y = this.terrain.getHeightAt(spec.x, spec.z);
    const unlocked = Boolean(spec.unlocked);
    const data: WeaponBunkerEntity = {
      id: spec.id,
      poiId: spec.poiId,
      x: spec.x,
      y,
      z: spec.z,
      rotationY: spec.rotationY,
      unlocked,
      looted: false,
      unlockAtStormPhase: WEAPON_BUNKER_UNLOCK_PHASE,
    };
    this.weaponBunkers.push(data);

    const concreteMat = this.getSharedMat('bunker_concrete', () =>
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.72, metalness: 0.35 }),
    );
    const armorSteelMat = this.getSharedMat('bunker_steel', () =>
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.38, metalness: 0.82 }),
    );
    const blastDoorMat = this.getSharedMat('bunker_door', () =>
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.32, metalness: 0.88 }),
    );
    const hazardStripeMat = this.getSharedMat('bunker_hazard', () =>
      new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#b45309',
        emissiveIntensity: 0.4,
        roughness: 0.35,
        metalness: 0.45,
      }),
    );
    const goldCacheMat = this.getSharedMat('bunker_cache_gold', () =>
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#eab308',
        emissiveIntensity: 0.9,
        roughness: 0.22,
        metalness: 0.78,
      }),
    );
    const cacheGlowMat = this.getSharedMat('bunker_cache_glow', () =>
      new THREE.MeshBasicMaterial({
        color: '#fef08a',
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const amberMat = this.getSharedMat('bunker_beacon_amber', () =>
      new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#d97706',
        emissiveIntensity: 1.55,
        roughness: 0.2,
        metalness: 0.3,
      }),
    );
    const greenMat = this.getSharedMat('bunker_beacon_green', () =>
      new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: '#16a34a',
        emissiveIntensity: 1.85,
        roughness: 0.18,
        metalness: 0.25,
      }),
    );
    const amberHaloMat = this.getSharedMat('bunker_halo_amber', () =>
      new THREE.MeshBasicMaterial({
        color: '#fbbf24',
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const greenHaloMat = this.getSharedMat('bunker_halo_green', () =>
      new THREE.MeshBasicMaterial({
        color: '#4ade80',
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const floorGeo = this.getSharedGeo('bunker_floor', () => new THREE.BoxGeometry(5.0, 0.22, 4.4));
    const sideWallGeo = this.getSharedGeo('bunker_side_wall', () => new THREE.BoxGeometry(0.68, 3.4, 4.4));
    const backWallGeo = this.getSharedGeo('bunker_back_wall', () => new THREE.BoxGeometry(5.0, 3.4, 0.68));
    const roofGeo = this.getSharedGeo('bunker_roof', () => new THREE.BoxGeometry(5.2, 0.44, 4.5));
    const archRibGeo = this.getSharedGeo('bunker_arch_rib', () => new THREE.BoxGeometry(5.5, 0.52, 0.54));
    const archButtressGeo = this.getSharedGeo('bunker_arch_buttress', () => new THREE.BoxGeometry(0.42, 3.85, 0.62));
    const doorGeo = this.getSharedGeo('bunker_door_slab', () => new THREE.BoxGeometry(3.2, 3.05, 0.32));
    const doorBarGeo = this.getSharedGeo('bunker_door_bar', () => new THREE.BoxGeometry(3.0, 0.22, 0.38));
    const doorLockGeo = this.getSharedGeo('bunker_door_lock', () => new THREE.CylinderGeometry(0.32, 0.32, 0.42, 12));
    doorLockGeo.rotateX(Math.PI * 0.5);
    const mastGeo = this.getSharedGeo('bunker_mast', () => new THREE.CylinderGeometry(0.1, 0.14, 0.65, 8));
    const beaconOrbGeo = this.getSharedGeo('bunker_beacon_orb', () => new THREE.SphereGeometry(0.28, 12, 10));
    const beaconHaloGeo = this.getSharedGeo('bunker_beacon_halo', () => new THREE.TorusGeometry(0.48, 0.055, 8, 20));
    beaconHaloGeo.rotateX(Math.PI * 0.5);
    const cacheBoxGeo = this.getSharedGeo('bunker_cache_box', () => new THREE.BoxGeometry(1.5, 0.62, 0.92));
    const cacheLidGeo = this.getSharedGeo('bunker_cache_lid', () => new THREE.BoxGeometry(1.56, 0.2, 0.98));
    const cacheAuraGeo = this.getSharedGeo('bunker_cache_aura', () => new THREE.CylinderGeometry(0.68, 0.96, 2.2, 12, 1, true));

    const bunkerGroup = new THREE.Group();
    bunkerGroup.name = `WeaponBunker_${spec.id}`;
    bunkerGroup.position.set(spec.x, y, spec.z);
    bunkerGroup.rotation.y = spec.rotationY;

    const floor = new THREE.Mesh(floorGeo, concreteMat);
    floor.position.set(0, 0.11, 0);
    floor.receiveShadow = true;
    bunkerGroup.add(floor);

    const leftWall = new THREE.Mesh(sideWallGeo, armorSteelMat);
    leftWall.position.set(-2.16, 1.7, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    bunkerGroup.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, armorSteelMat);
    rightWall.position.set(2.16, 1.7, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    bunkerGroup.add(rightWall);

    const backWall = new THREE.Mesh(backWallGeo, armorSteelMat);
    backWall.position.set(0, 1.7, -1.86);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    bunkerGroup.add(backWall);

    const roof = new THREE.Mesh(roofGeo, concreteMat);
    roof.position.set(0, 3.62, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    bunkerGroup.add(roof);

    // 3 Heavy Reinforced Bunker Arches
    for (const rz of [-1.45, 0.1, 1.75]) {
      const rib = new THREE.Mesh(archRibGeo, concreteMat);
      rib.position.set(0, 3.92, rz);
      rib.castShadow = true;
      bunkerGroup.add(rib);

      for (const sx of [-2.45, 2.45]) {
        const buttress = new THREE.Mesh(archButtressGeo, armorSteelMat);
        buttress.position.set(sx, 1.92, rz);
        buttress.castShadow = true;
        bunkerGroup.add(buttress);
      }
    }

    // Beacon mast & amber->green beacon light
    const mast = new THREE.Mesh(mastGeo, armorSteelMat);
    mast.position.set(0, 4.35, 1.75);
    bunkerGroup.add(mast);

    const beaconOrb = new THREE.Mesh(beaconOrbGeo, unlocked ? greenMat : amberMat);
    beaconOrb.position.set(0, 4.78, 1.75);
    bunkerGroup.add(beaconOrb);

    const beaconHalo = new THREE.Mesh(beaconHaloGeo, unlocked ? greenHaloMat : amberHaloMat);
    beaconHalo.position.set(0, 4.78, 1.75);
    bunkerGroup.add(beaconHalo);

    // Sliding Armored Blast Door (moves upward along front gantry when unlocked)
    const doorClosedY = 1.68;
    const doorOpenY = 4.55;
    const doorOpenProgress = unlocked ? 1 : 0;

    const blastDoor = new THREE.Group();
    blastDoor.name = `WeaponBunkerDoor_${spec.id}`;
    blastDoor.position.set(0, unlocked ? doorOpenY : doorClosedY, 1.76);

    const doorSlab = new THREE.Mesh(doorGeo, blastDoorMat);
    doorSlab.castShadow = true;
    doorSlab.receiveShadow = true;
    blastDoor.add(doorSlab);

    for (const by of [-0.75, 0.75]) {
      const bar = new THREE.Mesh(doorBarGeo, hazardStripeMat);
      bar.position.y = by;
      blastDoor.add(bar);
    }
    const lockHub = new THREE.Mesh(doorLockGeo, hazardStripeMat);
    blastDoor.add(lockHub);
    bunkerGroup.add(blastDoor);

    // Interior Weapon Cache visual
    const cacheGroup = new THREE.Group();
    cacheGroup.name = `WeaponBunkerCache_${spec.id}`;
    cacheGroup.position.set(0, 0.22, -0.78);

    const cacheBox = new THREE.Mesh(cacheBoxGeo, goldCacheMat);
    cacheBox.position.y = 0.31;
    cacheBox.castShadow = true;
    cacheGroup.add(cacheBox);

    const cacheLid = new THREE.Mesh(cacheLidGeo, armorSteelMat);
    cacheLid.position.y = 0.72;
    cacheGroup.add(cacheLid);

    const cacheAura = new THREE.Mesh(cacheAuraGeo, cacheGlowMat);
    cacheAura.position.y = 1.2;
    cacheGroup.add(cacheAura);
    bunkerGroup.add(cacheGroup);

    this.group.add(bunkerGroup);

    const wallColliders: ColliderBox[] = [
      this.makeRotatedCollider(`${spec.id}_wall_l`, spec.x, spec.z, -2.16, 0, 0.42, 2.25, y, y + 3.9, spec.rotationY, 'metal', `weapon_bunker_wall:${spec.id}`),
      this.makeRotatedCollider(`${spec.id}_wall_r`, spec.x, spec.z, 2.16, 0, 0.42, 2.25, y, y + 3.9, spec.rotationY, 'metal', `weapon_bunker_wall:${spec.id}`),
      this.makeRotatedCollider(`${spec.id}_wall_back`, spec.x, spec.z, 0, -1.86, 2.55, 0.4, y, y + 3.9, spec.rotationY, 'metal', `weapon_bunker_wall:${spec.id}`),
      this.makeRotatedCollider(`${spec.id}_roof`, spec.x, spec.z, 0, 0, 2.65, 2.3, y + 3.4, y + 4.1, spec.rotationY, 'metal', `weapon_bunker_roof:${spec.id}`),
    ];
    const doorCollider = this.makeRotatedCollider(
      `${spec.id}_door`,
      spec.x,
      spec.z,
      0,
      1.76,
      1.65,
      0.24,
      y + 0.15,
      y + 3.3,
      spec.rotationY,
      'metal',
      `weapon_bunker_door:${spec.id}`,
    );

    const weaponId = BUNKER_LOOT_WEAPONS[spec.rewardIndex % BUNKER_LOOT_WEAPONS.length];
    const rarity: 'epic' | 'legendary' = spec.rewardIndex % 2 === 0 ? 'legendary' : 'epic';
    const visual: WeaponBunkerVisual = {
      data,
      group: bunkerGroup,
      blastDoor,
      beaconOrb,
      beaconHalo,
      cacheGroup,
      amberMat,
      greenMat,
      amberHaloMat,
      greenHaloMat,
      doorClosedY,
      doorOpenY,
      doorOpenProgress,
      wallColliders,
      doorCollider,
      rewardWeaponId: weaponId,
      rewardRarity: rarity,
      rewardGold: 120 + (spec.rewardIndex % 3) * 30,
      rewardShieldRestore: 50,
      isQaShowcase: spec.isQaShowcase,
    };
    this.weaponBunkersMap.set(spec.id, visual);
    return visual;
  }

  private buildWeaponBunkers(_terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      poiId: string;
      dx: number;
      dz: number;
      rotationY: number;
    }> = [
      { id: 'bunker_metro_towers', poiId: 'metro_towers', dx: 0, dz: -35, rotationY: 0 },
      { id: 'bunker_sunny_suburbs', poiId: 'sunny_suburbs', dx: 36, dz: 8, rotationY: -Math.PI * 0.5 },
      { id: 'bunker_market_row', poiId: 'market_row', dx: 0, dz: -35, rotationY: 0 },
      { id: 'bunker_crater_depot', poiId: 'crater_depot', dx: -6, dz: -36, rotationY: 0 },
      { id: 'bunker_whispering_pines', poiId: 'whispering_pines', dx: 14, dz: 36, rotationY: Math.PI },
      { id: 'bunker_frostpeak_citadel', poiId: 'frostpeak_citadel', dx: 32, dz: -4, rotationY: -Math.PI * 0.5 },
      { id: 'bunker_scorched_caldera', poiId: 'scorched_caldera', dx: 30, dz: -24, rotationY: 0 },
      { id: 'bunker_sunken_oasis', poiId: 'sunken_oasis', dx: 16, dz: -32, rotationY: 0 },
    ];

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;
      this.createWeaponBunkerEntry({
        id: spec.id,
        poiId: spec.poiId,
        x: poi.x + spec.dx,
        z: poi.z + spec.dz,
        rotationY: spec.rotationY,
        rewardIndex: i,
      });
    }
  }

  private createSlurpTankerEntry(spec: {
    id: string;
    x: number;
    z: number;
    rotationY: number;
    isQaShowcase?: boolean;
  }): SlurpTankerVisual {
    const y = this.terrain.getHeightAt(spec.x, spec.z);
    const data: SlurpTankerEntity = {
      id: spec.id,
      x: spec.x,
      y,
      z: spec.z,
      rotationY: spec.rotationY,
      hp: SLURP_TANKER_HP,
      maxHp: SLURP_TANKER_HP,
      healRadius: SLURP_TANKER_HEAL_RADIUS,
      healAmount: SLURP_TANKER_HEAL_AMOUNT,
      destroyed: false,
    };
    this.slurpTankers.push(data);

    const chassisMat = this.getSharedMat('tanker_chassis', () =>
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.72 }),
    );
    const cabMat = this.getSharedMat('tanker_cab', () =>
      new THREE.MeshStandardMaterial({ color: '#0e7490', roughness: 0.35, metalness: 0.55 }),
    );
    const glassMat = this.getSharedMat('tanker_glass', () =>
      new THREE.MeshStandardMaterial({ color: '#7dd3fc', roughness: 0.15, metalness: 0.5 }),
    );
    const tireMat = this.getSharedMat('tanker_tire', () =>
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 }),
    );
    const tankCyanMat = this.getSharedMat('tanker_slurp', () =>
      new THREE.MeshStandardMaterial({
        color: '#06b6d4',
        emissive: '#0ea5e9',
        emissiveIntensity: 0.92,
        roughness: 0.15,
        metalness: 0.25,
      }),
    );
    const tankCoreGlowMat = this.getSharedMat('tanker_slurp_glow', () =>
      new THREE.MeshStandardMaterial({
        color: '#67e8f9',
        emissive: '#22d3ee',
        emissiveIntensity: 1.65,
        roughness: 0.12,
        metalness: 0.15,
      }),
    );
    const rupturedMat = this.getSharedMat('tanker_ruptured', () =>
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.78, metalness: 0.6 }),
    );
    const puddleMat = this.getSharedMat('tanker_puddle', () =>
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const chassisGeo = this.getSharedGeo('tanker_chassis_geo', () => new THREE.BoxGeometry(2.2, 0.34, 6.4));
    const cabGeo = this.getSharedGeo('tanker_cab_geo', () => new THREE.BoxGeometry(2.1, 1.55, 1.85));
    const windshieldGeo = this.getSharedGeo('tanker_windshield_geo', () => new THREE.BoxGeometry(1.88, 0.65, 0.1));
    const wheelGeo = this.getSharedGeo('tanker_wheel_geo', () => {
      const g = new THREE.CylinderGeometry(0.48, 0.48, 0.36, 12);
      g.rotateZ(Math.PI * 0.5);
      return g;
    });
    const tankCylGeo = this.getSharedGeo('tanker_cyl_geo', () => {
      const g = new THREE.CylinderGeometry(0.95, 0.95, 3.6, 16);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const domeGeo = this.getSharedGeo('tanker_dome_geo', () => new THREE.SphereGeometry(0.95, 14, 10));
    const ringGeo = this.getSharedGeo('tanker_ring_geo', () => new THREE.TorusGeometry(0.98, 0.06, 8, 20));
    const stripGeo = this.getSharedGeo('tanker_strip_geo', () => new THREE.BoxGeometry(0.14, 0.32, 3.3));
    const valveGeo = this.getSharedGeo('tanker_valve_geo', () => new THREE.CylinderGeometry(0.22, 0.28, 0.28, 10));
    const rupturedShellGeo = this.getSharedGeo('tanker_ruptured_geo', () => new THREE.BoxGeometry(1.6, 0.42, 3.4));
    const puddleGeo = this.getSharedGeo('tanker_puddle_geo', () => {
      const g = new THREE.CircleGeometry(2.6, 20);
      g.rotateX(-Math.PI * 0.5);
      return g;
    });

    const tankerGroup = new THREE.Group();
    tankerGroup.name = `SlurpTanker_${spec.id}`;
    tankerGroup.position.set(spec.x, y, spec.z);
    tankerGroup.rotation.y = spec.rotationY;

    const bodyGroup = new THREE.Group();

    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.set(0, 0.62, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    bodyGroup.add(chassis);

    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 1.48, 2.12);
    cab.castShadow = true;
    cab.receiveShadow = true;
    bodyGroup.add(cab);

    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0, 1.68, 3.04);
    bodyGroup.add(windshield);

    for (const wx of [-1.08, 1.08]) {
      for (const wz of [-2.25, -0.85, 2.05]) {
        const wheel = new THREE.Mesh(wheelGeo, tireMat);
        wheel.position.set(wx, 0.48, wz);
        wheel.castShadow = true;
        bodyGroup.add(wheel);
      }
    }

    // Intact pressurized glowing cyan tank
    const intactTankGroup = new THREE.Group();
    intactTankGroup.name = `SlurpTankerIntact_${spec.id}`;

    const tankBody = new THREE.Mesh(tankCylGeo, tankCyanMat);
    tankBody.position.set(0, 1.68, -0.95);
    tankBody.castShadow = true;
    tankBody.receiveShadow = true;
    intactTankGroup.add(tankBody);

    for (const dz of [-2.75, 0.85]) {
      const dome = new THREE.Mesh(domeGeo, tankCyanMat);
      dome.position.set(0, 1.68, dz);
      dome.scale.set(1, 1, 0.55);
      intactTankGroup.add(dome);
    }

    for (const rz of [-2.1, -0.95, 0.2]) {
      const ring = new THREE.Mesh(ringGeo, chassisMat);
      ring.position.set(0, 1.68, rz);
      intactTankGroup.add(ring);
    }

    for (const sx of [-0.94, 0.94]) {
      const strip = new THREE.Mesh(stripGeo, tankCoreGlowMat);
      strip.position.set(sx, 1.68, -0.95);
      intactTankGroup.add(strip);
    }

    const topValve = new THREE.Mesh(valveGeo, tankCoreGlowMat);
    topValve.position.set(0, 2.72, -0.95);
    intactTankGroup.add(topValve);

    bodyGroup.add(intactTankGroup);

    // Ruptured state (shown when hp <= 0)
    const rupturedTankGroup = new THREE.Group();
    rupturedTankGroup.name = `SlurpTankerRuptured_${spec.id}`;
    rupturedTankGroup.visible = false;

    const rupturedHull = new THREE.Mesh(rupturedShellGeo, rupturedMat);
    rupturedHull.position.set(0, 0.98, -0.95);
    rupturedHull.castShadow = true;
    rupturedTankGroup.add(rupturedHull);

    for (const rz of [-2.0, 0.1]) {
      const brokenRing = new THREE.Mesh(ringGeo, rupturedMat);
      brokenRing.position.set(0, 1.22, rz);
      brokenRing.scale.set(1, 0.5, 1);
      rupturedTankGroup.add(brokenRing);
    }

    const puddle = new THREE.Mesh(puddleGeo, puddleMat);
    puddle.position.set(0, 0.08, -0.8);
    rupturedTankGroup.add(puddle);

    bodyGroup.add(rupturedTankGroup);
    tankerGroup.add(bodyGroup);
    this.group.add(tankerGroup);

    const collider = this.makeRotatedCollider(
      `${spec.id}_col`,
      spec.x,
      spec.z,
      0,
      0,
      1.25,
      3.25,
      y,
      y + 2.85,
      spec.rotationY,
      'metal',
      `slurp_tanker:${spec.id}`,
    );

    const visual: SlurpTankerVisual = {
      data,
      group: tankerGroup,
      bodyGroup,
      intactTankGroup,
      rupturedTankGroup,
      collider,
      hitAnim: 0,
      isQaShowcase: spec.isQaShowcase,
    };
    this.slurpTankersMap.set(spec.id, visual);
    return visual;
  }

  private buildSlurpTankers(_terrain: TerrainQuery): void {
    const specs: Array<{ id: string; x: number; z: number; rotationY: number }> = [
      { id: 'tanker_suburbs_metro', x: -115, z: -90, rotationY: Math.atan2(20, 40) },
      { id: 'tanker_suburbs_frostpeak', x: -138, z: -181, rotationY: Math.atan2(53, -51) },
      { id: 'tanker_frostpeak_pines', x: 89, z: -211, rotationY: Math.atan2(58, 30) },
      { id: 'tanker_oasis_corridor', x: -213.5, z: -51.5, rotationY: Math.atan2(-23, 73) },
      { id: 'tanker_caldera_crater', x: -66, z: 140, rotationY: Math.atan2(72, -4) },
      { id: 'tanker_market_pines', x: 178.5, z: -5, rotationY: Math.atan2(7, -80) },
    ];

    for (const spec of specs) {
      this.createSlurpTankerEntry(spec);
    }
  }

  private buildLootIsland(): void {
    const rockMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.88, metalness: 0.1 }),
    );
    const grassDeckMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.78, metalness: 0.05 }),
    );
    const stoneTrimMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6, metalness: 0.45 }),
    );
    const crystalCyanMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 1.55,
        roughness: 0.16,
        metalness: 0.3,
      }),
    );
    const crystalPurpleMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#c084fc',
        emissive: '#9333ea',
        emissiveIntensity: 1.5,
        roughness: 0.18,
        metalness: 0.3,
      }),
    );
    const poleMat = this.addMat(
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.3, metalness: 0.86 }),
    );

    this.lootIslandUncapturedFlagMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#7c3aed',
        emissiveIntensity: 1.15,
        transparent: true,
        opacity: 0.88,
        roughness: 0.2,
      }),
    );
    this.lootIslandCapturedFlagMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#f59e0b',
        emissiveIntensity: 1.6,
        transparent: true,
        opacity: 0.95,
        roughness: 0.18,
      }),
    );
    this.lootIslandUncapturedTrimMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#c084fc',
        emissive: '#9333ea',
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    this.lootIslandCapturedTrimMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#fde047',
        emissive: '#f59e0b',
        emissiveIntensity: 1.75,
        roughness: 0.16,
      }),
    );
    this.lootIslandUncapturedRingMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.lootIslandCapturedRingMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#facc15',
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    // 1. Floating Rock-and-Crystal Island Group (centered at (x, y, z) where y = terrainHeight + 24)
    this.lootIslandGroup = new THREE.Group();
    this.lootIslandGroup.name = 'LootIsland';
    this.lootIslandGroup.visible = false;

    const deckSlabGeo = this.addGeo(
      new THREE.CylinderGeometry(
        LOOT_ISLAND_RADIUS - 0.3,
        LOOT_ISLAND_RADIUS - 0.9,
        LOOT_ISLAND_DECK_THICKNESS,
        16,
      ),
    );
    const grassTopGeo = this.addGeo(
      new THREE.CylinderGeometry(LOOT_ISLAND_RADIUS - 0.8, LOOT_ISLAND_RADIUS - 0.8, 0.08, 16),
    );
    const underSpireGeo = this.addGeo(new THREE.ConeGeometry(LOOT_ISLAND_RADIUS - 0.6, 8.6, 10));
    underSpireGeo.rotateX(Math.PI);
    const sideSpireGeo = this.addGeo(new THREE.ConeGeometry(4.2, 5.4, 7));
    sideSpireGeo.rotateX(Math.PI);
    const crystalSpireGeo = this.addGeo(new THREE.OctahedronGeometry(1.15, 0));
    const obeliskGeo = this.addGeo(new THREE.BoxGeometry(0.95, 2.4, 0.95));

    // Flat walkable top deck slab spanning [y - 0.6 .. y]
    const deckSlab = new THREE.Mesh(deckSlabGeo, rockMat);
    deckSlab.position.y = -LOOT_ISLAND_DECK_THICKNESS * 0.5;
    deckSlab.receiveShadow = true;
    deckSlab.castShadow = true;
    this.lootIslandGroup.add(deckSlab);

    const grassTop = new THREE.Mesh(grassTopGeo, grassDeckMat);
    grassTop.position.y = -0.02;
    grassTop.receiveShadow = true;
    this.lootIslandGroup.add(grassTop);

    const mainUnderSpire = new THREE.Mesh(underSpireGeo, rockMat);
    mainUnderSpire.position.y = -4.9;
    mainUnderSpire.castShadow = true;
    this.lootIslandGroup.add(mainUnderSpire);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const sideSpire = new THREE.Mesh(sideSpireGeo, rockMat);
      sideSpire.position.set(Math.cos(a) * 6.8, -3.2, Math.sin(a) * 6.8);
      this.lootIslandGroup.add(sideSpire);
    }

    // Glowing crystals jutting from underside and outer rim
    const bottomCrystal = new THREE.Mesh(crystalSpireGeo, crystalCyanMat);
    bottomCrystal.position.y = -9.6;
    bottomCrystal.scale.set(1.2, 1.9, 1.2);
    this.lootIslandGroup.add(bottomCrystal);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const crystal = new THREE.Mesh(
        crystalSpireGeo,
        i % 2 === 0 ? crystalCyanMat : crystalPurpleMat,
      );
      crystal.position.set(Math.cos(a) * 11.8, -1.35, Math.sin(a) * 11.8);
      crystal.rotation.set(Math.sin(a) * 0.4, a, Math.cos(a) * 0.4);
      crystal.scale.set(0.68, 1.45, 0.68);
      this.lootIslandGroup.add(crystal);
    }

    for (const [ox, oz] of [
      [-8.5, -8.5],
      [8.5, -8.5],
      [-8.5, 8.5],
      [8.5, 8.5],
    ]) {
      const obelisk = new THREE.Mesh(obeliskGeo, stoneTrimMat);
      obelisk.position.set(ox, 1.2, oz);
      obelisk.castShadow = true;
      this.lootIslandGroup.add(obelisk);
      const cap = new THREE.Mesh(crystalSpireGeo, crystalPurpleMat);
      cap.position.set(ox, 2.7, oz);
      cap.scale.set(0.45, 0.72, 0.45);
      this.lootIslandGroup.add(cap);
    }

    // Center Shrine Capture Pylon & Flag on top
    const shrinePedestalGeo = this.addGeo(new THREE.CylinderGeometry(1.15, 1.45, 0.28, 12));
    const shrineCollarGeo = this.addGeo(new THREE.CylinderGeometry(0.32, 0.44, 0.26, 12));
    const poleGeo = this.addGeo(new THREE.CylinderGeometry(0.09, 0.12, 6.8, 10));
    const finialGeo = this.addGeo(new THREE.OctahedronGeometry(0.28, 0));
    const crossbarGeo = this.addGeo(new THREE.BoxGeometry(1.9, 0.08, 0.08));
    const bannerGeo = this.addGeo(new THREE.BoxGeometry(1.85, 1.05, 0.05));
    const trimGeo = this.addGeo(new THREE.BoxGeometry(1.88, 0.14, 0.07));
    const outerRingGeo = this.addGeo(new THREE.RingGeometry(8.6, 9.1, 48));
    outerRingGeo.rotateX(-Math.PI * 0.5);
    const innerRingGeo = this.addGeo(new THREE.RingGeometry(1.3, 1.65, 32));
    innerRingGeo.rotateX(-Math.PI * 0.5);

    const pedestal = new THREE.Mesh(shrinePedestalGeo, stoneTrimMat);
    pedestal.position.y = 0.14;
    const collar = new THREE.Mesh(shrineCollarGeo, poleMat);
    collar.position.y = 0.4;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 3.6;
    this.lootIslandFinialMesh = new THREE.Mesh(finialGeo, this.lootIslandUncapturedTrimMat);
    this.lootIslandFinialMesh.position.y = 7.15;
    this.lootIslandOuterRing = new THREE.Mesh(outerRingGeo, this.lootIslandUncapturedRingMat);
    this.lootIslandOuterRing.position.y = 0.05;
    this.lootIslandInnerRing = new THREE.Mesh(innerRingGeo, this.lootIslandUncapturedTrimMat);
    this.lootIslandInnerRing.position.y = 0.06;

    this.lootIslandFlagGroup = new THREE.Group();
    this.lootIslandFlagGroup.position.set(0, this.lootIslandFlagMinY, 0);
    const crossbar = new THREE.Mesh(crossbarGeo, poleMat);
    crossbar.position.set(0.95, 0, 0);
    this.lootIslandBannerMesh = new THREE.Mesh(bannerGeo, this.lootIslandUncapturedFlagMat);
    this.lootIslandBannerMesh.position.set(0.95, -0.52, 0);
    this.lootIslandTrimMesh = new THREE.Mesh(trimGeo, this.lootIslandUncapturedTrimMat);
    this.lootIslandTrimMesh.position.set(0.95, -0.98, 0);
    this.lootIslandFlagGroup.add(crossbar, this.lootIslandBannerMesh, this.lootIslandTrimMesh);

    this.lootIslandGroup.add(
      pedestal,
      collar,
      pole,
      this.lootIslandFinialMesh,
      this.lootIslandOuterRing,
      this.lootIslandInnerRing,
      this.lootIslandFlagGroup,
    );
    this.group.add(this.lootIslandGroup);

    // 2. Ground Updraft Sky Rift Geyser directly beneath the island
    this.lootIslandGeyserGroup = new THREE.Group();
    this.lootIslandGeyserGroup.name = 'LootIslandRiftGeyser';
    this.lootIslandGeyserGroup.visible = false;

    const geyserRimGeo = this.addGeo(new THREE.CylinderGeometry(2.7, 3.6, 0.55, 14));
    const geyserDiscGeo = this.addGeo(new THREE.CircleGeometry(2.45, 24));
    geyserDiscGeo.rotateX(-Math.PI * 0.5);
    const geyserVortexGeo = this.addGeo(new THREE.CylinderGeometry(1.8, 3.1, 18.0, 16, 1, true));
    const geyserPulseRingGeo = this.addGeo(new THREE.TorusGeometry(2.3, 0.12, 8, 28));
    geyserPulseRingGeo.rotateX(Math.PI * 0.5);

    const geyserVortexMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#a855f7',
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const geyserDiscMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const geyserRim = new THREE.Mesh(geyserRimGeo, rockMat);
    geyserRim.position.y = 0.26;
    this.lootIslandGeyserGroup.add(geyserRim);

    const geyserDisc = new THREE.Mesh(geyserDiscGeo, geyserDiscMat);
    geyserDisc.position.y = 0.35;
    this.lootIslandGeyserGroup.add(geyserDisc);

    this.lootIslandGeyserCore = new THREE.Group();
    const vortex = new THREE.Mesh(geyserVortexGeo, geyserVortexMat);
    vortex.position.y = 9.2;
    this.lootIslandGeyserCore.add(vortex);

    for (let c = 0; c < 6; c++) {
      const ang = (c / 6) * Math.PI * 2;
      const shard = new THREE.Mesh(
        crystalSpireGeo,
        c % 2 === 0 ? crystalCyanMat : crystalPurpleMat,
      );
      shard.position.set(Math.cos(ang) * 2.9, 0.75, Math.sin(ang) * 2.9);
      shard.scale.set(0.4, 0.9, 0.4);
      shard.rotation.y = ang;
      this.lootIslandGeyserCore.add(shard);
    }
    this.lootIslandGeyserGroup.add(this.lootIslandGeyserCore);

    this.lootIslandGeyserRings = [];
    for (let r = 0; r < 3; r++) {
      const ring = new THREE.Mesh(
        geyserPulseRingGeo,
        r % 2 === 0 ? crystalCyanMat : crystalPurpleMat,
      );
      ring.position.y = 1.0 + r * 5.0;
      this.lootIslandGeyserGroup.add(ring);
      this.lootIslandGeyserRings.push(ring);
    }

    this.group.add(this.lootIslandGeyserGroup);
  }

  private syncVendingMachineVisual(vm: VendingMachineVisual): void {
    const soldOut = vm.data.stock <= 0;
    if (soldOut) {
      vm.screenMat.color.set('#334155');
      vm.screenMat.emissive.set('#0f172a');
      vm.screenMat.emissiveIntensity = 0.12;
      vm.haloMat.color.set('#475569');
      vm.haloMat.emissive.set('#1e293b');
      vm.haloMat.emissiveIntensity = 0.1;
      vm.emblemMat.emissiveIntensity = 0.14;
      vm.haloGroup.scale.setScalar(0.7);
    } else {
      vm.screenMat.color.set(vm.activeColorHex);
      vm.screenMat.emissive.set(vm.activeEmissiveHex);
      vm.screenMat.emissiveIntensity = 1.35;
      vm.haloMat.color.set(vm.activeColorHex);
      vm.haloMat.emissive.set(vm.activeEmissiveHex);
      vm.haloMat.emissiveIntensity = 1.65;
      vm.emblemMat.emissiveIntensity = 1.45;
      vm.haloGroup.scale.setScalar(1);
    }
    for (let i = 0; i < vm.stockPips.length; i++) {
      vm.stockPips[i].visible = i < vm.data.stock;
    }
  }

  private syncLootIslandVisual(): void {
    const t = Math.max(0, Math.min(1, this.lootIslandState.captureProgress));
    this.lootIslandFlagGroup.position.y =
      this.lootIslandFlagMinY + (this.lootIslandFlagMaxY - this.lootIslandFlagMinY) * t;
    const isCaptured = this.lootIslandState.captured;
    this.lootIslandBannerMesh.material = isCaptured
      ? this.lootIslandCapturedFlagMat
      : this.lootIslandUncapturedFlagMat;
    this.lootIslandTrimMesh.material = isCaptured
      ? this.lootIslandCapturedTrimMat
      : this.lootIslandUncapturedTrimMat;
    this.lootIslandFinialMesh.material = isCaptured
      ? this.lootIslandCapturedTrimMat
      : this.lootIslandUncapturedTrimMat;
    this.lootIslandInnerRing.material = isCaptured
      ? this.lootIslandCapturedTrimMat
      : this.lootIslandUncapturedTrimMat;
    this.lootIslandOuterRing.material = isCaptured
      ? this.lootIslandCapturedRingMat
      : this.lootIslandUncapturedRingMat;
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

  getRifts(): RiftEntity[] {
    return this.rifts;
  }

  triggerRift(id: string): RiftTriggerResult | null {
    const entry = this.riftsMap.get(id);
    if (!entry || !entry.data.active) {
      return null;
    }
    if (entry.data.openRemainingSec <= 0) {
      entry.data.openRemainingSec = RIFT_OPEN_WINDOW_SEC;
    }
    return {
      skyPos: {
        x: entry.data.x,
        y: entry.data.y + RIFT_SKY_OFFSET_Y,
        z: entry.data.z,
      },
    };
  }

  getCapturePoints(): CapturePointEntity[] {
    return this.capturePoints;
  }

  private syncCapturePointVisual(cp: CapturePointVisual): void {
    const t = Math.max(0, Math.min(1, cp.data.progress));
    cp.flagGroup.position.y = cp.flagMinY + (cp.flagMaxY - cp.flagMinY) * t;
    const isCaptured = cp.data.captured;
    cp.bannerMesh.material = isCaptured ? cp.capturedFlagMat : cp.uncapturedFlagMat;
    cp.trimMesh.material = isCaptured ? cp.capturedTrimMat : cp.uncapturedTrimMat;
    cp.finialMesh.material = isCaptured ? cp.capturedTrimMat : cp.uncapturedTrimMat;
    cp.innerRing.material = isCaptured ? cp.capturedTrimMat : cp.uncapturedTrimMat;
    cp.outerRing.material = isCaptured ? cp.capturedRingMat : cp.uncapturedRingMat;
  }

  advanceCapturePoint(
    id: string,
    actorId: string,
    actorName: string,
    dt: number,
  ): CapturePointAdvanceResult {
    const entry = this.capturePointsMap.get(id);
    if (!entry) {
      return { capturedNow: false, progress: 0, poiName: '' };
    }
    if (entry.data.captured) {
      return {
        capturedNow: false,
        progress: 1,
        poiName: entry.data.poiName,
      };
    }

    entry.claimedThisFrame = true;
    const safeDt = Math.max(0, dt);
    entry.data.progress = Math.min(1, entry.data.progress + safeDt / CAPTURE_DURATION_SEC);

    if (entry.data.progress >= 1 - 1e-7) {
      entry.data.progress = 1;
      entry.data.captured = true;
      entry.data.ownerId = actorId;
      entry.data.ownerName = actorName;
      this.syncCapturePointVisual(entry);
      return {
        capturedNow: true,
        progress: 1,
        lootPos: { x: entry.data.x, y: entry.data.y + 0.6, z: entry.data.z },
        poiName: entry.data.poiName,
      };
    }

    this.syncCapturePointVisual(entry);
    return {
      capturedNow: false,
      progress: entry.data.progress,
      poiName: entry.data.poiName,
    };
  }

  getExplosiveBarrels(): ExplosiveBarrelEntity[] {
    return this.explosiveBarrels;
  }

  damageExplosiveBarrel(id: string, dmg: number): ExplosiveBarrelDamageResult | null {
    const entry = this.explosiveBarrelsMap.get(id);
    if (!entry || entry.data.exploded) {
      return null;
    }
    const pos: Vec3Like = { x: entry.data.x, y: entry.data.y, z: entry.data.z };
    if (dmg <= 0) {
      return {
        exploded: false,
        position: pos,
        blastRadius: entry.data.blastRadius,
        blastDamage: entry.data.blastDamage,
      };
    }

    entry.data.hp = Math.max(0, entry.data.hp - dmg);
    if (entry.data.hp <= 0) {
      entry.data.hp = 0;
      entry.data.exploded = true;
      entry.group.visible = false;
      entry.hitAnim = 0;
      return {
        exploded: true,
        position: pos,
        blastRadius: entry.data.blastRadius,
        blastDamage: entry.data.blastDamage,
      };
    }

    entry.hitAnim = 1.0;
    return {
      exploded: false,
      position: pos,
      blastRadius: entry.data.blastRadius,
      blastDamage: entry.data.blastDamage,
    };
  }

  getExplosiveBarrelColliders(): ColliderBox[] {
    const out: ColliderBox[] = [];
    for (const entry of this.explosiveBarrelsMap.values()) {
      if (!entry.data.exploded) {
        out.push(entry.collider);
      }
    }
    return out;
  }

  getVendingMachines(): VendingMachineEntity[] {
    return this.vendingMachines;
  }

  purchaseFromVendingMachine(id: string): VendingPurchaseResult | null {
    const entry = this.vendingMachinesMap.get(id);
    if (!entry || entry.data.stock <= 0) {
      return null;
    }

    entry.data.stock -= 1;
    this.syncVendingMachineVisual(entry);

    const def = WEAPONS[entry.data.offerWeaponId];
    const item: ItemInstance = {
      uid: `vm_item_${++this.vendingItemCounter}_${entry.data.offerWeaponId}`,
      weaponId: entry.data.offerWeaponId,
      rarity: entry.data.offerRarity,
      magAmmo: def.magSize,
      stackCount: 1,
    };

    return {
      item,
      priceGold: entry.data.priceGold,
      position: { x: entry.data.x, y: entry.data.y, z: entry.data.z },
    };
  }

  getVendingMachineColliders(): ColliderBox[] {
    return Array.from(this.vendingMachinesMap.values(), (v) => v.collider);
  }

  getNpcSpecialists(): NpcSpecialistEntity[] {
    return this.npcSpecialists;
  }

  hireNpcSpecialist(id: string, playerId: string): NpcSpecialistEntity | null {
    if (!playerId) return null;
    const entry = this.npcSpecialistsMap.get(id);
    if (!entry || entry.data.hiredBy !== null) {
      return null;
    }

    entry.data.hiredBy = playerId;
    entry.beaconGroup.visible = false;
    entry.group.visible = false;
    return { ...entry.data };
  }

  spawnLootIsland(centerX: number, centerZ: number, elapsedSec: number): LootIslandState {
    const groundY = this.terrain.getHeightAt(centerX, centerZ);
    const islandY = groundY + LOOT_ISLAND_HEIGHT_OFFSET;

    this.lootIslandState = {
      active: true,
      spawnedAtSec: elapsedSec,
      x: centerX,
      y: islandY,
      z: centerZ,
      radius: LOOT_ISLAND_RADIUS,
      captured: false,
      captureProgress: 0,
    };

    this.lootIslandGroup.position.set(centerX, islandY, centerZ);
    this.lootIslandGroup.visible = true;
    this.lootIslandGeyserGroup.position.set(centerX, groundY, centerZ);
    this.lootIslandGeyserGroup.visible = true;
    this.syncLootIslandVisual();

    return { ...this.lootIslandState };
  }

  getLootIslandState(): LootIslandState {
    return { ...this.lootIslandState };
  }

  advanceLootIslandCapture(dt: number): LootIslandCaptureResult {
    if (!this.lootIslandState.active || this.lootIslandState.captured) {
      return { capturedNow: false };
    }

    const safeDt = Math.max(0, dt);
    this.lootIslandState.captureProgress = Math.min(
      1,
      this.lootIslandState.captureProgress + safeDt / LOOT_ISLAND_CAPTURE_DURATION_SEC,
    );

    if (this.lootIslandState.captureProgress >= 1 - 1e-7) {
      this.lootIslandState.captureProgress = 1;
      this.lootIslandState.captured = true;
      this.syncLootIslandVisual();
      return {
        capturedNow: true,
        lootPos: {
          x: this.lootIslandState.x,
          y: this.lootIslandState.y + 0.5,
          z: this.lootIslandState.z,
        },
      };
    }

    this.syncLootIslandVisual();
    return { capturedNow: false };
  }

  getLootIslandColliders(): ColliderBox[] {
    if (!this.lootIslandState.active) {
      return [];
    }
    return [
      {
        id: 'loot_island_deck',
        minX: this.lootIslandState.x - LOOT_ISLAND_DECK_HALF_EXTENT,
        minY: this.lootIslandState.y - LOOT_ISLAND_DECK_THICKNESS,
        minZ: this.lootIslandState.z - LOOT_ISLAND_DECK_HALF_EXTENT,
        maxX: this.lootIslandState.x + LOOT_ISLAND_DECK_HALF_EXTENT,
        maxY: this.lootIslandState.y,
        maxZ: this.lootIslandState.z + LOOT_ISLAND_DECK_HALF_EXTENT,
        material: 'brick',
        tag: 'loot_island_deck',
      },
    ];
  }

  getWeaponBunkers(): WeaponBunkerEntity[] {
    return this.weaponBunkers;
  }

  getWeaponBunkerColliders(): ColliderBox[] {
    const out: ColliderBox[] = [];
    for (const b of this.weaponBunkersMap.values()) {
      out.push(...b.wallColliders);
      if (!b.data.unlocked) {
        out.push(b.doorCollider);
      }
    }
    return out;
  }

  unlockBunkersForPhase(phase: number): WeaponBunkerEntity[] {
    const unlockedNow: WeaponBunkerEntity[] = [];
    for (const entry of this.weaponBunkersMap.values()) {
      if (!entry.data.unlocked && phase >= entry.data.unlockAtStormPhase) {
        entry.data.unlocked = true;
        entry.beaconOrb.material = entry.greenMat;
        entry.beaconHalo.material = entry.greenHaloMat;
        entry.doorOpenProgress = Math.max(entry.doorOpenProgress, 0.25);
        const eased = 1 - Math.pow(1 - entry.doorOpenProgress, 3);
        entry.blastDoor.position.y =
          entry.doorClosedY + (entry.doorOpenY - entry.doorClosedY) * eased;
        unlockedNow.push(entry.data);
      }
    }
    if (unlockedNow.length > 0) {
      this.eventBus?.emit('sound:play', {
        id: 'bunker_unlock',
        position: {
          x: unlockedNow[0].x,
          y: unlockedNow[0].y + 1.8,
          z: unlockedNow[0].z,
        },
        volume: 0.85,
        spatial: false,
      });
    }
    return unlockedNow;
  }

  lootWeaponBunker(id: string): WeaponBunkerLootResult | null {
    const entry = this.weaponBunkersMap.get(id);
    if (!entry || !entry.data.unlocked || entry.data.looted) {
      return null;
    }
    entry.data.looted = true;
    entry.cacheGroup.visible = false;
    this.eventBus?.emit('vfx:chest_open', {
      position: { x: entry.data.x, y: entry.data.y + 0.8, z: entry.data.z },
    });
    return {
      weaponId: entry.rewardWeaponId,
      rarity: entry.rewardRarity,
      gold: entry.rewardGold,
      shieldRestore: entry.rewardShieldRestore,
    };
  }

  getSlurpTankers(): SlurpTankerEntity[] {
    return this.slurpTankers;
  }

  getSlurpTankerColliders(): ColliderBox[] {
    const out: ColliderBox[] = [];
    for (const entry of this.slurpTankersMap.values()) {
      if (!entry.data.destroyed) {
        out.push(entry.collider);
      }
    }
    return out;
  }

  damageSlurpTanker(id: string, dmg: number): SlurpTankerDamageResult | null {
    const entry = this.slurpTankersMap.get(id);
    if (!entry || entry.data.destroyed) {
      return null;
    }
    const { x, y, z, healRadius, healAmount } = entry.data;
    if (dmg <= 0) {
      return {
        exploded: false,
        x,
        y,
        z,
        radius: healRadius,
        healAmount: 0,
      };
    }

    entry.data.hp = Math.max(0, entry.data.hp - dmg);
    if (entry.data.hp <= 0) {
      entry.data.hp = 0;
      entry.data.destroyed = true;
      entry.intactTankGroup.visible = false;
      entry.rupturedTankGroup.visible = true;
      entry.hitAnim = 0;

      const burstPos: Vec3Like = { x, y: y + 1.5, z };
      this.eventBus?.emit('vfx:slurp_tanker_burst', {
        position: burstPos,
        radius: healRadius,
      });
      this.eventBus?.emit('sound:play', {
        id: 'slurp_tanker_burst',
        position: burstPos,
        volume: 0.9,
        spatial: true,
      });

      return {
        exploded: true,
        x,
        y,
        z,
        radius: healRadius,
        healAmount,
      };
    }

    entry.hitAnim = 1.0;
    return {
      exploded: false,
      x,
      y,
      z,
      radius: healRadius,
      healAmount: 0,
    };
  }

  private createPickupPillarAndRing(colorHex: string): {
    pillar: THREE.Mesh;
    ring: THREE.Mesh;
  } {
    const pillarGeo = this.getSharedGeo('pickup_pillar_geo', () =>
      new THREE.CylinderGeometry(0.16, 0.34, 7.2, 12, 1, true),
    );
    const ringGeo = this.getSharedGeo('pickup_ring_geo', () => {
      const g = new THREE.RingGeometry(0.55, 0.85, 24);
      g.rotateX(-Math.PI * 0.5);
      return g;
    });
    const pillarMat = this.getSharedMat(`pickup_pillar_${colorHex}`, () =>
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const ringMat = this.getSharedMat(`pickup_ring_${colorHex}`, () =>
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 3.6;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.05;
    return { pillar, ring };
  }

  spawnDroppedMedallion(
    medallionId: MedallionId,
    x: number,
    y: number,
    z: number,
  ): DroppedMedallionEntity {
    const id = `medallion_drop_${++this.droppedMedallionCounter}`;
    const data: DroppedMedallionEntity = {
      id,
      medallionId,
      x,
      y,
      z,
      collected: false,
    };
    this.droppedMedallions.push(data);

    const def = MEDALLIONS.find((m) => m.id === medallionId);
    const accentColor = def?.accentColor ?? '#facc15';

    const goldMat = this.getSharedMat('pickup_gold_mat', () =>
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#d97706',
        emissiveIntensity: 0.75,
        roughness: 0.18,
        metalness: 0.88,
      }),
    );
    const gemMat = this.getSharedMat(`medallion_gem_${accentColor}`, () =>
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 1.5,
        roughness: 0.15,
        metalness: 0.3,
      }),
    );

    const discGeo = this.getSharedGeo('medallion_disc_geo', () => {
      const g = new THREE.CylinderGeometry(0.36, 0.36, 0.09, 16);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const rimGeo = this.getSharedGeo('medallion_rim_geo', () => new THREE.TorusGeometry(0.38, 0.055, 8, 20));
    const gemGeo = this.getSharedGeo('medallion_gem_geo', () => new THREE.OctahedronGeometry(0.18, 0));

    const pickupGroup = new THREE.Group();
    pickupGroup.name = `DroppedMedallion_${id}`;
    pickupGroup.position.set(x, y, z);

    const { pillar, ring } = this.createPickupPillarAndRing('#facc15');
    pickupGroup.add(pillar, ring);

    const baseSpinY = 0.85;
    const spinGroup = new THREE.Group();
    spinGroup.position.y = baseSpinY;
    const disc = new THREE.Mesh(discGeo, goldMat);
    const rim = new THREE.Mesh(rimGeo, goldMat);
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.scale.set(1, 1, 1.35);
    spinGroup.add(disc, rim, gem);
    pickupGroup.add(spinGroup);

    this.group.add(pickupGroup);
    this.droppedMedallionsMap.set(id, {
      data,
      group: pickupGroup,
      spinGroup,
      ringMesh: ring,
      baseSpinY,
    });
    return data;
  }

  collectNearbyMedallion(
    x: number,
    z: number,
    maxDist = 2.5,
  ): DroppedMedallionEntity | null {
    let best: DroppedPickupVisual<DroppedMedallionEntity> | null = null;
    let bestDist = maxDist;
    for (const entry of this.droppedMedallionsMap.values()) {
      if (entry.data.collected) continue;
      const d = Math.hypot(entry.data.x - x, entry.data.z - z);
      if (d <= bestDist) {
        bestDist = d;
        best = entry;
      }
    }
    if (!best) return null;
    best.data.collected = true;
    best.group.visible = false;
    return best.data;
  }

  getDroppedMedallions(): DroppedMedallionEntity[] {
    return this.droppedMedallions;
  }

  spawnDroppedCrown(x: number, y: number, z: number): DroppedCrownEntity {
    const id = `crown_drop_${++this.droppedCrownCounter}`;
    const data: DroppedCrownEntity = {
      id,
      x,
      y,
      z,
      collected: false,
    };
    this.droppedCrowns.push(data);

    const goldMat = this.getSharedMat('pickup_gold_mat', () =>
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#d97706',
        emissiveIntensity: 0.75,
        roughness: 0.18,
        metalness: 0.88,
      }),
    );
    const jewelMat = this.getSharedMat('crown_jewel_mat', () =>
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#fde047',
        emissiveIntensity: 1.75,
        roughness: 0.12,
        metalness: 0.35,
      }),
    );

    const bandGeo = this.getSharedGeo('crown_band_geo', () => new THREE.CylinderGeometry(0.34, 0.3, 0.18, 16, 1, true));
    const baseTorusGeo = this.getSharedGeo('crown_torus_geo', () => {
      const g = new THREE.TorusGeometry(0.32, 0.05, 8, 20);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const peakGeo = this.getSharedGeo('crown_peak_geo', () => new THREE.ConeGeometry(0.085, 0.28, 6));
    const jewelGeo = this.getSharedGeo('crown_jewel_geo', () => new THREE.OctahedronGeometry(0.11, 0));

    const pickupGroup = new THREE.Group();
    pickupGroup.name = `DroppedCrown_${id}`;
    pickupGroup.position.set(x, y, z);

    const { pillar, ring } = this.createPickupPillarAndRing('#fde047');
    pickupGroup.add(pillar, ring);

    const baseSpinY = 0.85;
    const spinGroup = new THREE.Group();
    spinGroup.position.y = baseSpinY;
    const band = new THREE.Mesh(bandGeo, goldMat);
    const baseTorus = new THREE.Mesh(baseTorusGeo, goldMat);
    baseTorus.position.y = -0.09;
    spinGroup.add(band, baseTorus);

    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      const peak = new THREE.Mesh(peakGeo, goldMat);
      peak.position.set(Math.cos(a) * 0.32, 0.2, Math.sin(a) * 0.32);
      spinGroup.add(peak);
    }
    const jewel = new THREE.Mesh(jewelGeo, jewelMat);
    jewel.position.y = 0.08;
    spinGroup.add(jewel);
    pickupGroup.add(spinGroup);

    this.group.add(pickupGroup);
    this.droppedCrownsMap.set(id, {
      data,
      group: pickupGroup,
      spinGroup,
      ringMesh: ring,
      baseSpinY,
    });
    return data;
  }

  collectNearbyCrown(x: number, z: number, maxDist = 2.5): DroppedCrownEntity | null {
    let best: DroppedPickupVisual<DroppedCrownEntity> | null = null;
    let bestDist = maxDist;
    for (const entry of this.droppedCrownsMap.values()) {
      if (entry.data.collected) continue;
      const d = Math.hypot(entry.data.x - x, entry.data.z - z);
      if (d <= bestDist) {
        bestDist = d;
        best = entry;
      }
    }
    if (!best) return null;
    best.data.collected = true;
    best.group.visible = false;
    return best.data;
  }

  getDroppedCrowns(): DroppedCrownEntity[] {
    return this.droppedCrowns;
  }

  private findDryGroundNear(centerPos: Vec3Like, dx: number, dz: number): { x: number; y: number; z: number } {
    const baseX = centerPos.x + dx;
    const baseZ = centerPos.z + dz;
    if (!this.terrain.isWater(baseX, baseZ)) {
      return { x: baseX, y: this.terrain.getHeightAt(baseX, baseZ), z: baseZ };
    }
    const radius = Math.max(3, Math.hypot(dx, dz));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tx = centerPos.x + Math.cos(a) * radius;
      const tz = centerPos.z + Math.sin(a) * radius;
      if (!this.terrain.isWater(tx, tz)) {
        return { x: tx, y: this.terrain.getHeightAt(tx, tz), z: tz };
      }
    }
    return { x: baseX, y: this.terrain.getHeightAt(baseX, baseZ), z: baseZ };
  }

  private wrapUnitInterval(t: number): number {
    let u = t % 1;
    if (u < 0) u += 1;
    if (u >= 1 || u === 0) u = 0;
    return u;
  }

  private createGrindRailEntry(spec: {
    id: string;
    poiId: string;
    points: Vec3Like[];
    color: string;
    speed: number;
    isQaShowcase?: boolean;
  }): GrindRailVisual {
    const curvePoints = spec.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(curvePoints, true, 'catmullrom', 0.5);
    const length = Math.max(1, curve.getLength());

    const data: GrindRailEntity = {
      id: spec.id,
      poiId: spec.poiId,
      points: spec.points.map((p) => ({ ...p })),
      color: spec.color,
      speed: spec.speed,
    };
    this.grindRails.push(data);

    const railGroup = new THREE.Group();
    railGroup.name = `GrindRail_${spec.id}`;

    const tubeSegs = spec.isQaShowcase ? 64 : 120;
    const tubeGeo = new THREE.TubeGeometry(curve, tubeSegs, 0.2, 8, true);
    if (spec.isQaShowcase) {
      this.qaShowcaseGeos.push(tubeGeo);
    } else {
      this.addGeo(tubeGeo);
    }

    const railMat = this.getSharedMat(`grind_rail_tube_${spec.color}`, () =>
      new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 1.45,
        roughness: 0.18,
        metalness: 0.45,
      }),
    );
    const bracketMat = this.getSharedMat(`grind_rail_bracket_${spec.color}`, () =>
      new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.55,
      }),
    );
    const pylonMat = this.getSharedMat('grind_rail_pylon', () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.8,
      }),
    );
    const ringMat = this.getSharedMat('grind_rail_energy_ring', () =>
      new THREE.MeshBasicMaterial({
        color: '#f8fafc',
        transparent: true,
        opacity: 0.92,
      }),
    );

    const tubeMesh = new THREE.Mesh(tubeGeo, railMat);
    tubeMesh.castShadow = true;
    railGroup.add(tubeMesh);

    const pylonCylGeo = this.getSharedGeo('grind_pylon_cyl', () =>
      new THREE.CylinderGeometry(0.14, 0.2, 1, 8),
    );
    const pylonBaseGeo = this.getSharedGeo('grind_pylon_base', () =>
      new THREE.CylinderGeometry(0.36, 0.44, 0.16, 10),
    );
    const bracketGeo = this.getSharedGeo('grind_pylon_bracket', () =>
      new THREE.TorusGeometry(0.24, 0.055, 6, 12),
    );
    const ringGeo = this.getSharedGeo('grind_energy_ring_geo', () =>
      new THREE.TorusGeometry(0.32, 0.055, 6, 16),
    );

    const pylonCount = spec.isQaShowcase ? 4 : 10;
    for (let i = 0; i < pylonCount; i++) {
      const u = i / pylonCount;
      const pt = curve.getPointAt(u);
      const tan = curve.getTangentAt(u).normalize();
      const groundY = this.terrain.getHeightAt(pt.x, pt.z);
      const height = Math.max(0.45, pt.y - groundY);

      const post = new THREE.Mesh(pylonCylGeo, pylonMat);
      post.scale.set(1, height, 1);
      post.position.set(pt.x, groundY + height * 0.5, pt.z);
      post.castShadow = true;
      railGroup.add(post);

      const base = new THREE.Mesh(pylonBaseGeo, pylonMat);
      base.position.set(pt.x, groundY + 0.08, pt.z);
      railGroup.add(base);

      const bracket = new THREE.Mesh(bracketGeo, bracketMat);
      bracket.position.set(pt.x, pt.y, pt.z);
      bracket.quaternion.setFromUnitVectors(_tmpForwardZ, tan);
      railGroup.add(bracket);
    }

    const rings: GrindRailRingEntry[] = [];
    const ringCount = spec.isQaShowcase ? 3 : 6;
    for (let j = 0; j < ringCount; j++) {
      const t = j / ringCount;
      const pt = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pt);
      ringMesh.quaternion.setFromUnitVectors(_tmpForwardZ, tan);
      railGroup.add(ringMesh);
      rings.push({
        mesh: ringMesh,
        curve,
        length,
        speed: spec.speed,
        t,
      });
    }

    const samples: GrindRailSamplePoint[] = [];
    for (let s = 0; s < GRIND_RAIL_SAMPLE_COUNT; s++) {
      const u = s / GRIND_RAIL_SAMPLE_COUNT;
      const p = curve.getPointAt(u);
      samples.push({ t: u, x: p.x, y: p.y, z: p.z });
    }

    this.group.add(railGroup);
    const visual: GrindRailVisual = {
      data,
      group: railGroup,
      curve,
      length,
      samples,
      rings,
      isQaShowcase: spec.isQaShowcase,
    };
    this.grindRailsMap.set(spec.id, visual);
    return visual;
  }

  private buildGrindRails(terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      poiId: string;
      color: string;
      offsets: Array<[number, number, number]>;
    }> = [
      {
        id: 'rail_metro_towers',
        poiId: 'metro_towers',
        color: '#22d3ee',
        offsets: [
          [0, 25, 2.3],
          [27, 24, 4.2],
          [32, 6, 7.2],
          [32, -10, 8.4],
          [28, -24, 6.5],
          [14, -25, 5.2],
          [-14, -25, 5.2],
          [-28, -24, 6.8],
          [-32, -8, 4.8],
          [-31, 14, 3.6],
          [-26, 26, 2.6],
        ],
      },
      {
        id: 'rail_skyline_spire',
        poiId: 'skyline_spire',
        color: '#a855f7',
        offsets: [
          [0, 24, 2.3],
          [18, 23, 4.2],
          [24, 6, 7.2],
          [25, -16, 8.4],
          [12, -24, 6.5],
          [-12, -24, 5.5],
          [-27, -20, 4.8],
          [-32, -8, 3.6],
          [-31, 12, 3.0],
          [-22, 22, 2.5],
        ],
      },
      {
        id: 'rail_market_row',
        poiId: 'market_row',
        color: '#ec4899',
        offsets: [
          [-6, 24, 2.3],
          [14, 24, 3.6],
          [29, 18, 6.4],
          [32, 2, 8.2],
          [30, -18, 7.0],
          [14, -26, 5.4],
          [-12, -26, 5.4],
          [-27, -20, 4.4],
          [-32, -4, 3.2],
          [-25, 21, 2.5],
        ],
      },
      {
        id: 'rail_frostpeak_citadel',
        poiId: 'frostpeak_citadel',
        color: '#38bdf8',
        offsets: [
          [-2, 23, 2.3],
          [18, 25, 4.2],
          [25, 12, 6.6],
          [25, -12, 7.8],
          [18, -25, 6.4],
          [0, -24, 5.2],
          [-19, -25, 6.2],
          [-24, -10, 5.0],
          [-24, 18, 3.4],
          [-16, 24, 2.6],
        ],
      },
    ];

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;
      const points: Vec3Like[] = spec.offsets.map(([dx, dz, h]) => {
        const px = poi.x + dx;
        const pz = poi.z + dz;
        return {
          x: px,
          y: terrain.getHeightAt(px, pz) + h,
          z: pz,
        };
      });
      this.createGrindRailEntry({
        id: spec.id,
        poiId: spec.poiId,
        points,
        color: spec.color,
        speed: GRIND_RAIL_SPEED,
      });
    }
  }

  getGrindRails(): GrindRailEntity[] {
    return this.grindRails;
  }

  sampleGrindRailAt(id: string, t: number): GrindRailSampleResult | null {
    if (!Number.isFinite(t)) return null;
    const entry = this.grindRailsMap.get(id);
    if (!entry) return null;
    const u = this.wrapUnitInterval(t);
    entry.curve.getPointAt(u, _tmpRailPos);
    entry.curve.getTangentAt(u, _tmpRailTan).normalize();
    return {
      position: { x: _tmpRailPos.x, y: _tmpRailPos.y, z: _tmpRailPos.z },
      tangent: { x: _tmpRailTan.x, y: _tmpRailTan.y, z: _tmpRailTan.z },
    };
  }

  findNearbyGrindRail(pos: Vec3Like, maxDist = 2.8): NearbyGrindRailResult | null {
    if (
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z) ||
      maxDist < 0
    ) {
      return null;
    }

    let bestEntry: GrindRailVisual | null = null;
    let bestT = 0;
    let bestDistSq = maxDist * maxDist;
    let bestX = 0;
    let bestY = 0;
    let bestZ = 0;

    const step = 1 / GRIND_RAIL_SAMPLE_COUNT;

    for (const entry of this.grindRailsMap.values()) {
      let coarseIdx = 0;
      let coarseMinSq = Infinity;
      const samples = entry.samples;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const dx = s.x - pos.x;
        const dy = s.y - pos.y;
        const dz = s.z - pos.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < coarseMinSq) {
          coarseMinSq = dSq;
          coarseIdx = i;
        }
      }

      let left = coarseIdx * step - step;
      let right = coarseIdx * step + step;
      for (let iter = 0; iter < 8; iter++) {
        const m1 = left + (right - left) / 3;
        const m2 = right - (right - left) / 3;
        entry.curve.getPointAt(this.wrapUnitInterval(m1), _tmpRailPos);
        const d1 =
          (_tmpRailPos.x - pos.x) ** 2 +
          (_tmpRailPos.y - pos.y) ** 2 +
          (_tmpRailPos.z - pos.z) ** 2;
        entry.curve.getPointAt(this.wrapUnitInterval(m2), _tmpRailPos);
        const d2 =
          (_tmpRailPos.x - pos.x) ** 2 +
          (_tmpRailPos.y - pos.y) ** 2 +
          (_tmpRailPos.z - pos.z) ** 2;
        if (d1 < d2) {
          right = m2;
        } else {
          left = m1;
        }
      }

      const candidateT = this.wrapUnitInterval((left + right) * 0.5);
      entry.curve.getPointAt(candidateT, _tmpRailPos);
      const dx = _tmpRailPos.x - pos.x;
      const dy = _tmpRailPos.y - pos.y;
      const dz = _tmpRailPos.z - pos.z;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        bestEntry = entry;
        bestT = candidateT;
        bestX = _tmpRailPos.x;
        bestY = _tmpRailPos.y;
        bestZ = _tmpRailPos.z;
      }
    }

    if (!bestEntry) return null;
    bestEntry.curve.getTangentAt(bestT, _tmpRailTan).normalize();
    return {
      rail: bestEntry.data,
      t: bestT,
      position: { x: bestX, y: bestY, z: bestZ },
      tangent: { x: _tmpRailTan.x, y: _tmpRailTan.y, z: _tmpRailTan.z },
    };
  }

  private syncRebootVanVisual(v: RebootVanVisual): void {
    if (v.data.available) {
      v.beamMesh.visible = true;
      for (const m of v.stripeMeshes) m.material = v.activeMat;
      for (const m of v.holoMeshes) m.material = v.activeMat;
      v.holoGroup.scale.setScalar(1.0);
    } else {
      v.beamMesh.visible = false;
      for (const m of v.stripeMeshes) m.material = v.cooldownMat;
      for (const m of v.holoMeshes) m.material = v.cooldownMat;
      v.holoGroup.scale.setScalar(0.72);
    }
  }

  private createRebootVanEntry(spec: {
    id: string;
    poiId: string;
    x: number;
    z: number;
    rotationY: number;
    isQaShowcase?: boolean;
  }): RebootVanVisual {
    const y = this.terrain.getHeightAt(spec.x, spec.z);
    const data: RebootVanEntity = {
      id: spec.id,
      poiId: spec.poiId,
      x: spec.x,
      y,
      z: spec.z,
      rotationY: spec.rotationY,
      cooldownRemainingSec: 0,
      available: true,
    };
    this.rebootVans.push(data);

    const chassisBlueMat = this.getSharedMat('reboot_van_body', () =>
      new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.34, metalness: 0.48 }),
    );
    const darkArmorMat = this.getSharedMat('reboot_van_dark', () =>
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.46, metalness: 0.72 }),
    );
    const tireMat = this.getSharedMat('reboot_van_tire', () =>
      new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.9 }),
    );
    const glassMat = this.getSharedMat('reboot_van_glass', () =>
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 0.42,
        roughness: 0.14,
        metalness: 0.55,
      }),
    );
    const activeMat = this.getSharedMat('reboot_van_holo_active', () =>
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0ea5e9',
        emissiveIntensity: 1.75,
        roughness: 0.16,
        metalness: 0.25,
      }),
    );
    const cooldownMat = this.getSharedMat('reboot_van_holo_cooldown', () =>
      new THREE.MeshStandardMaterial({
        color: '#475569',
        emissive: '#1e293b',
        emissiveIntensity: 0.25,
        roughness: 0.55,
        metalness: 0.6,
      }),
    );
    const beamMat = this.getSharedMat('reboot_van_beam', () =>
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const chassisGeo = this.getSharedGeo('reboot_van_chassis_geo', () => new THREE.BoxGeometry(2.15, 1.32, 3.8));
    const cabGeo = this.getSharedGeo('reboot_van_cab_geo', () => new THREE.BoxGeometry(2.02, 1.02, 1.35));
    const windshieldGeo = this.getSharedGeo('reboot_van_windshield_geo', () => new THREE.BoxGeometry(1.8, 0.52, 0.1));
    const bumperGeo = this.getSharedGeo('reboot_van_bumper_geo', () => new THREE.BoxGeometry(2.2, 0.26, 0.28));
    const wheelGeo = this.getSharedGeo('reboot_van_wheel_geo', () => {
      const g = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
      g.rotateZ(Math.PI * 0.5);
      return g;
    });
    const stripeGeo = this.getSharedGeo('reboot_van_stripe_geo', () => new THREE.BoxGeometry(0.08, 0.2, 3.4));
    const roofRackGeo = this.getSharedGeo('reboot_van_rack_geo', () => new THREE.BoxGeometry(1.65, 0.22, 2.2));
    const projectorBaseGeo = this.getSharedGeo('reboot_van_proj_geo', () => new THREE.CylinderGeometry(0.45, 0.55, 0.18, 12));
    const beamGeo = this.getSharedGeo('reboot_van_beam_geo', () => new THREE.CylinderGeometry(0.42, 0.65, 6.2, 14, 1, true));
    const holoRingGeo = this.getSharedGeo('reboot_van_holo_ring_geo', () => new THREE.TorusGeometry(0.56, 0.055, 8, 24));
    const holoCrossGeo = this.getSharedGeo('reboot_van_holo_cross_geo', () => new THREE.BoxGeometry(0.52, 0.15, 0.15));
    const holoDiamondGeo = this.getSharedGeo('reboot_van_holo_diamond_geo', () => new THREE.OctahedronGeometry(0.24, 0));

    const vanGroup = new THREE.Group();
    vanGroup.name = `RebootVan_${spec.id}`;
    vanGroup.position.set(spec.x, y, spec.z);
    vanGroup.rotation.y = spec.rotationY;

    const mainBody = new THREE.Mesh(chassisGeo, chassisBlueMat);
    mainBody.position.set(0, 1.05, -0.45);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    vanGroup.add(mainBody);

    const cab = new THREE.Mesh(cabGeo, chassisBlueMat);
    cab.position.set(0, 0.9, 1.82);
    cab.castShadow = true;
    cab.receiveShadow = true;
    vanGroup.add(cab);

    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0, 1.15, 2.48);
    windshield.rotation.x = -0.18;
    vanGroup.add(windshield);

    const frontBumper = new THREE.Mesh(bumperGeo, darkArmorMat);
    frontBumper.position.set(0, 0.42, 2.52);
    vanGroup.add(frontBumper);

    const rearBumper = new THREE.Mesh(bumperGeo, darkArmorMat);
    rearBumper.position.set(0, 0.42, -2.38);
    vanGroup.add(rearBumper);

    for (const wx of [-1.05, 1.05]) {
      for (const wz of [-1.62, 1.52]) {
        const wheel = new THREE.Mesh(wheelGeo, tireMat);
        wheel.position.set(wx, 0.42, wz);
        wheel.castShadow = true;
        vanGroup.add(wheel);
      }
    }

    const stripeMeshes: THREE.Mesh[] = [];
    for (const sx of [-1.09, 1.09]) {
      const stripe = new THREE.Mesh(stripeGeo, activeMat);
      stripe.position.set(sx, 1.05, -0.45);
      vanGroup.add(stripe);
      stripeMeshes.push(stripe);
    }

    const roofRack = new THREE.Mesh(roofRackGeo, darkArmorMat);
    roofRack.position.set(0, 1.82, -0.45);
    roofRack.castShadow = true;
    vanGroup.add(roofRack);

    const beaconGroup = new THREE.Group();
    beaconGroup.name = `RebootVanBeacon_${spec.id}`;
    beaconGroup.position.set(0, 1.94, -0.45);

    const projBase = new THREE.Mesh(projectorBaseGeo, darkArmorMat);
    projBase.position.y = 0.08;
    beaconGroup.add(projBase);

    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = 3.2;
    beaconGroup.add(beamMesh);

    const baseHoloY = 1.15;
    const holoGroup = new THREE.Group();
    holoGroup.position.y = baseHoloY;

    const holoRing = new THREE.Mesh(holoRingGeo, activeMat);
    holoRing.rotation.x = Math.PI * 0.35;
    const crossH = new THREE.Mesh(holoCrossGeo, activeMat);
    const crossV = new THREE.Mesh(holoCrossGeo, activeMat);
    crossV.rotation.z = Math.PI * 0.5;
    const diamond = new THREE.Mesh(holoDiamondGeo, activeMat);
    holoGroup.add(holoRing, crossH, crossV, diamond);
    beaconGroup.add(holoGroup);
    vanGroup.add(beaconGroup);

    this.group.add(vanGroup);

    const collider = this.makeRotatedCollider(
      `${spec.id}_col`,
      spec.x,
      spec.z,
      0,
      0,
      1.25,
      2.55,
      y,
      y + 2.4,
      spec.rotationY,
      'metal',
      `reboot_van:${spec.id}`,
    );

    const visual: RebootVanVisual = {
      data,
      group: vanGroup,
      beaconGroup,
      beamMesh,
      holoGroup,
      holoRing,
      activeMat,
      cooldownMat,
      stripeMeshes,
      holoMeshes: [holoRing, crossH, crossV, diamond],
      baseHoloY,
      collider,
      isQaShowcase: spec.isQaShowcase,
    };
    this.syncRebootVanVisual(visual);
    this.rebootVansMap.set(spec.id, visual);
    return visual;
  }

  private buildRebootVans(_terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      poiId: string;
      dx: number;
      dz: number;
      rotationY: number;
    }> = [
      { id: 'van_metro_towers', poiId: 'metro_towers', dx: -16, dz: 0, rotationY: Math.PI * 0.5 },
      { id: 'van_market_row', poiId: 'market_row', dx: 13, dz: 0, rotationY: Math.PI * 0.5 },
      { id: 'van_sunny_suburbs', poiId: 'sunny_suburbs', dx: 0, dz: -13, rotationY: 0 },
      { id: 'van_crater_depot', poiId: 'crater_depot', dx: 4, dz: 2, rotationY: 0 },
      { id: 'van_frostpeak_citadel', poiId: 'frostpeak_citadel', dx: -6, dz: 33, rotationY: Math.PI * 0.25 },
      { id: 'van_skyline_spire', poiId: 'skyline_spire', dx: 0, dz: 19, rotationY: Math.PI * 0.5 },
    ];

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;
      this.createRebootVanEntry({
        id: spec.id,
        poiId: spec.poiId,
        x: poi.x + spec.dx,
        z: poi.z + spec.dz,
        rotationY: spec.rotationY,
      });
    }
  }

  getRebootVans(): RebootVanEntity[] {
    return this.rebootVans;
  }

  getRebootVanColliders(): ColliderBox[] {
    return Array.from(this.rebootVansMap.values(), (v) => v.collider);
  }

  triggerRebootVan(id: string): boolean {
    const entry = this.rebootVansMap.get(id);
    if (!entry || !entry.data.available) {
      return false;
    }
    entry.data.available = false;
    entry.data.cooldownRemainingSec = REBOOT_VAN_COOLDOWN_SEC;
    this.syncRebootVanVisual(entry);
    return true;
  }

  private createSupplyDroneEntry(spec: {
    id: string;
    poiId: string;
    orbitCenterX: number;
    orbitCenterZ: number;
    heightOffset: number;
    orbitRadius: number;
    orbitAngle: number;
    orbitSpeed: number;
    rarity: Rarity;
    weaponId: WeaponId;
    gold: number;
    trapKind: TrapKind;
    isQaShowcase?: boolean;
  }): SupplyDroneVisual {
    const groundY = this.terrain.getHeightAt(spec.orbitCenterX, spec.orbitCenterZ);
    const baseY = groundY + spec.heightOffset;
    const x = spec.orbitCenterX + Math.cos(spec.orbitAngle) * spec.orbitRadius;
    const z = spec.orbitCenterZ + Math.sin(spec.orbitAngle) * spec.orbitRadius;

    const data: SupplyDroneEntity = {
      id: spec.id,
      poiId: spec.poiId,
      x,
      y: baseY,
      z,
      baseY,
      orbitCenterX: spec.orbitCenterX,
      orbitCenterZ: spec.orbitCenterZ,
      orbitRadius: spec.orbitRadius,
      orbitAngle: spec.orbitAngle,
      orbitSpeed: spec.orbitSpeed,
      hp: SUPPLY_DRONE_HP,
      maxHp: SUPPLY_DRONE_HP,
      rarity: spec.rarity,
      destroyed: false,
    };
    this.supplyDrones.push(data);

    const chassisMat = this.getSharedMat('drone_chassis_mat', () =>
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.35, metalness: 0.78 }),
    );
    const trimMat = this.getSharedMat('drone_trim_mat', () =>
      new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.28, metalness: 0.85 }),
    );
    const bladeMat = this.getSharedMat('drone_blade_mat', () =>
      new THREE.MeshBasicMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.78 }),
    );
    const rarityHex = RARITY_COLORS[spec.rarity];
    const coreMat = this.getSharedMat(`drone_core_${spec.rarity}`, () =>
      new THREE.MeshStandardMaterial({
        color: rarityHex,
        emissive: rarityHex,
        emissiveIntensity: 1.55,
        roughness: 0.16,
        metalness: 0.25,
      }),
    );

    const hullGeo = this.getSharedGeo('drone_hull_geo', () => new THREE.BoxGeometry(1.15, 0.38, 0.76));
    const armGeo = this.getSharedGeo('drone_arm_geo', () => new THREE.BoxGeometry(0.66, 0.08, 0.14));
    const cowlingGeo = this.getSharedGeo('drone_cowling_geo', () => {
      const g = new THREE.TorusGeometry(0.48, 0.055, 6, 16);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const rotorHubGeo = this.getSharedGeo('drone_hub_geo', () => new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8));
    const bladeGeo = this.getSharedGeo('drone_blade_geo', () => new THREE.BoxGeometry(0.92, 0.025, 0.11));
    const coreCrateGeo = this.getSharedGeo('drone_core_crate_geo', () => new THREE.BoxGeometry(0.62, 0.52, 0.62));
    const coreGemGeo = this.getSharedGeo('drone_core_gem_geo', () => new THREE.OctahedronGeometry(0.24, 0));

    const droneGroup = new THREE.Group();
    droneGroup.name = `SupplyDrone_${spec.id}`;
    droneGroup.position.set(x, baseY, z);
    droneGroup.rotation.y = -spec.orbitAngle;

    const bodyGroup = new THREE.Group();

    const hull = new THREE.Mesh(hullGeo, chassisMat);
    hull.castShadow = true;
    bodyGroup.add(hull);

    const rotors: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, trimMat);
      arm.position.set(side * 0.78, 0.08, 0);
      bodyGroup.add(arm);

      const cowling = new THREE.Mesh(cowlingGeo, trimMat);
      cowling.position.set(side * 1.08, 0.14, 0);
      bodyGroup.add(cowling);

      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(side * 1.08, 0.18, 0);
      const hub = new THREE.Mesh(rotorHubGeo, chassisMat);
      const bladeA = new THREE.Mesh(bladeGeo, bladeMat);
      const bladeB = new THREE.Mesh(bladeGeo, bladeMat);
      bladeB.rotation.y = Math.PI * 0.5;
      rotorGroup.add(hub, bladeA, bladeB);
      bodyGroup.add(rotorGroup);
      rotors.push(rotorGroup);
    }

    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, -0.48, 0);
    const coreCrate = new THREE.Mesh(coreCrateGeo, coreMat);
    const coreGem = new THREE.Mesh(coreGemGeo, coreMat);
    coreGem.position.y = -0.34;
    coreGroup.add(coreCrate, coreGem);
    bodyGroup.add(coreGroup);

    droneGroup.add(bodyGroup);
    this.group.add(droneGroup);

    const visual: SupplyDroneVisual = {
      data,
      initialAngle: spec.orbitAngle,
      group: droneGroup,
      bodyGroup,
      rotors,
      coreGroup,
      coreMat,
      rewardWeaponId: spec.weaponId,
      rewardGold: spec.gold,
      rewardTrapKind: spec.trapKind,
      hitAnim: 0,
      isQaShowcase: spec.isQaShowcase,
    };
    this.supplyDronesMap.set(spec.id, visual);
    return visual;
  }

  private buildSupplyDrones(_terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      poiId: string;
      dx: number;
      dz: number;
      heightOffset: number;
      orbitRadius: number;
      orbitAngle: number;
      orbitSpeed: number;
      rarity: Rarity;
      weaponId: WeaponId;
      gold: number;
      trapKind: TrapKind;
    }> = [
      { id: 'drone_metro_towers_1', poiId: 'metro_towers', dx: 0, dz: 0, heightOffset: 14.5, orbitRadius: 11, orbitAngle: 0.3, orbitSpeed: 0.42, rarity: 'epic', weaponId: 'railgun', gold: 75, trapKind: 'spike_trap' },
      { id: 'drone_metro_towers_2', poiId: 'metro_towers', dx: 0, dz: 0, heightOffset: 16.4, orbitRadius: 21, orbitAngle: 3.4, orbitSpeed: -0.34, rarity: 'legendary', weaponId: 'minigun', gold: 100, trapKind: 'bouncer_pad' },
      { id: 'drone_sunny_suburbs', poiId: 'sunny_suburbs', dx: 0, dz: 1, heightOffset: 13.5, orbitRadius: 12, orbitAngle: 1.1, orbitSpeed: 0.46, rarity: 'rare', weaponId: 'tactical_dmr', gold: 50, trapKind: 'spike_trap' },
      { id: 'drone_crystal_basin', poiId: 'crystal_basin', dx: 0, dz: 0, heightOffset: 15.0, orbitRadius: 14, orbitAngle: 2.0, orbitSpeed: -0.4, rarity: 'epic', weaponId: 'minigun', gold: 75, trapKind: 'bouncer_pad' },
      { id: 'drone_market_row_1', poiId: 'market_row', dx: 0, dz: 0, heightOffset: 13.0, orbitRadius: 12, orbitAngle: 0.8, orbitSpeed: 0.48, rarity: 'rare', weaponId: 'railgun', gold: 50, trapKind: 'bouncer_pad' },
      { id: 'drone_market_row_2', poiId: 'market_row', dx: 0, dz: 0, heightOffset: 16.0, orbitRadius: 20, orbitAngle: 4.1, orbitSpeed: -0.36, rarity: 'epic', weaponId: 'kinetic_blade', gold: 75, trapKind: 'spike_trap' },
      { id: 'drone_crater_depot', poiId: 'crater_depot', dx: -4, dz: -4, heightOffset: 14.0, orbitRadius: 10, orbitAngle: 1.7, orbitSpeed: 0.44, rarity: 'legendary', weaponId: 'railgun', gold: 100, trapKind: 'spike_trap' },
      { id: 'drone_whispering_pines', poiId: 'whispering_pines', dx: 0, dz: 0, heightOffset: 15.5, orbitRadius: 15, orbitAngle: 2.6, orbitSpeed: -0.38, rarity: 'rare', weaponId: 'heavy_shotgun', gold: 50, trapKind: 'bouncer_pad' },
      { id: 'drone_frostpeak_citadel', poiId: 'frostpeak_citadel', dx: 0, dz: 4, heightOffset: 16.2, orbitRadius: 13, orbitAngle: 0.5, orbitSpeed: 0.4, rarity: 'legendary', weaponId: 'minigun', gold: 100, trapKind: 'spike_trap' },
      { id: 'drone_scorched_caldera', poiId: 'scorched_caldera', dx: 10, dz: 0, heightOffset: 14.8, orbitRadius: 9, orbitAngle: 3.9, orbitSpeed: -0.45, rarity: 'epic', weaponId: 'boom_bow', gold: 75, trapKind: 'bouncer_pad' },
      { id: 'drone_sunken_oasis', poiId: 'sunken_oasis', dx: 6, dz: -4, heightOffset: 13.8, orbitRadius: 8, orbitAngle: 5.0, orbitSpeed: 0.43, rarity: 'rare', weaponId: 'combat_smg', gold: 50, trapKind: 'spike_trap' },
      { id: 'drone_skyline_spire', poiId: 'skyline_spire', dx: 0, dz: 0, heightOffset: 14.2, orbitRadius: 21, orbitAngle: 1.4, orbitSpeed: 0.47, rarity: 'epic', weaponId: 'railgun', gold: 75, trapKind: 'bouncer_pad' },
    ];

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;
      this.createSupplyDroneEntry({
        id: spec.id,
        poiId: spec.poiId,
        orbitCenterX: poi.x + spec.dx,
        orbitCenterZ: poi.z + spec.dz,
        heightOffset: spec.heightOffset,
        orbitRadius: spec.orbitRadius,
        orbitAngle: spec.orbitAngle,
        orbitSpeed: spec.orbitSpeed,
        rarity: spec.rarity,
        weaponId: spec.weaponId,
        gold: spec.gold,
        trapKind: spec.trapKind,
      });
    }
  }

  getSupplyDrones(): SupplyDroneEntity[] {
    return this.supplyDrones;
  }

  damageSupplyDrone(id: string, dmg: number): SupplyDroneDamageResult | null {
    const entry = this.supplyDronesMap.get(id);
    if (!entry || entry.data.destroyed) {
      return null;
    }

    const { x, y, z, rarity } = entry.data;
    if (dmg <= 0) {
      return {
        destroyed: false,
        x,
        y,
        z,
        rarity,
        weaponId: entry.rewardWeaponId,
        gold: 0,
        trapKind: entry.rewardTrapKind,
      };
    }

    entry.data.hp = Math.max(0, entry.data.hp - dmg);
    if (entry.data.hp <= 0) {
      entry.data.hp = 0;
      entry.data.destroyed = true;
      entry.group.visible = false;
      entry.hitAnim = 0;

      const pos: Vec3Like = { x, y, z };
      this.eventBus?.emit('vfx:drone_explode', {
        position: pos,
        rarity,
      });
      this.eventBus?.emit('sound:play', {
        id: 'drone_explode',
        position: pos,
        volume: 0.85,
        spatial: true,
      });

      return {
        destroyed: true,
        x,
        y,
        z,
        rarity,
        weaponId: entry.rewardWeaponId,
        gold: entry.rewardGold,
        trapKind: entry.rewardTrapKind,
      };
    }

    entry.hitAnim = 1.0;
    return {
      destroyed: false,
      x,
      y,
      z,
      rarity,
      weaponId: entry.rewardWeaponId,
      gold: 0,
      trapKind: entry.rewardTrapKind,
    };
  }

  private createModBenchEntry(spec: {
    id: string;
    poiId: string;
    x: number;
    z: number;
    rotationY: number;
    isQaShowcase?: boolean;
  }): ModBenchVisual {
    const y = this.terrain.getHeightAt(spec.x, spec.z);
    const data: ModBenchEntity = {
      id: spec.id,
      poiId: spec.poiId,
      x: spec.x,
      y,
      z: spec.z,
      rotationY: spec.rotationY,
      costGold: WEAPON_MOD_COST_GOLD,
    };
    this.modBenches.push(data);

    const chassisMat = this.getSharedMat('mod_bench_chassis', () =>
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.36, metalness: 0.82 }),
    );
    const alloyMat = this.getSharedMat('mod_bench_alloy', () =>
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.28, metalness: 0.86 }),
    );
    const trimMat = this.getSharedMat('mod_bench_trim', () =>
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.42, metalness: 0.72 }),
    );
    const cyanGlowMat = this.getSharedMat('mod_bench_cyan_glow', () =>
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 1.65,
        roughness: 0.16,
        metalness: 0.25,
      }),
    );
    const blueprintMat = this.getSharedMat('mod_bench_blueprint', () =>
      new THREE.MeshStandardMaterial({
        color: '#67e8f9',
        emissive: '#22d3ee',
        emissiveIntensity: 1.7,
        transparent: true,
        opacity: 0.88,
        roughness: 0.14,
        metalness: 0.2,
      }),
    );
    const holoConeMat = this.getSharedMat('mod_bench_holo_cone', () =>
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const basePlinthGeo = this.getSharedGeo('mod_bench_plinth', () => new THREE.BoxGeometry(2.26, 0.14, 1.18));
    const legGeo = this.getSharedGeo('mod_bench_leg', () => new THREE.BoxGeometry(0.16, 0.86, 0.18));
    const shelfGeo = this.getSharedGeo('mod_bench_shelf', () => new THREE.BoxGeometry(1.94, 0.12, 0.88));
    const topGeo = this.getSharedGeo('mod_bench_top', () => new THREE.BoxGeometry(2.3, 0.16, 1.16));
    const railGlowGeo = this.getSharedGeo('mod_bench_rail_glow', () => new THREE.BoxGeometry(2.32, 0.05, 0.06));
    const gantryPostGeo = this.getSharedGeo('mod_bench_gantry_post', () => new THREE.BoxGeometry(0.1, 0.68, 0.1));
    const screenFrameGeo = this.getSharedGeo('mod_bench_screen_frame', () => new THREE.BoxGeometry(1.62, 0.42, 0.08));
    const screenFaceGeo = this.getSharedGeo('mod_bench_screen_face', () => new THREE.BoxGeometry(1.48, 0.3, 0.03));
    const emitterPadGeo = this.getSharedGeo('mod_bench_emitter_pad', () => new THREE.CylinderGeometry(0.46, 0.54, 0.06, 16));
    const emitterCoreGeo = this.getSharedGeo('mod_bench_emitter_core', () => new THREE.CylinderGeometry(0.36, 0.36, 0.07, 16));
    const holoConeGeo = this.getSharedGeo('mod_bench_holo_cone', () => new THREE.CylinderGeometry(0.56, 0.34, 0.58, 16, 1, true));
    const holoRingGeo = this.getSharedGeo('mod_bench_holo_ring', () => {
      const g = new THREE.TorusGeometry(0.46, 0.026, 8, 28);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const bpReceiverGeo = this.getSharedGeo('mod_bp_receiver', () => new THREE.BoxGeometry(0.54, 0.14, 0.11));
    const bpBarrelGeo = this.getSharedGeo('mod_bp_barrel', () => {
      const g = new THREE.CylinderGeometry(0.032, 0.032, 0.52, 8);
      g.rotateZ(Math.PI * 0.5);
      return g;
    });
    const bpSuppressorGeo = this.getSharedGeo('mod_bp_suppressor', () => {
      const g = new THREE.CylinderGeometry(0.048, 0.048, 0.2, 8);
      g.rotateZ(Math.PI * 0.5);
      return g;
    });
    const bpOpticGeo = this.getSharedGeo('mod_bp_optic', () => new THREE.BoxGeometry(0.14, 0.085, 0.085));
    const bpDrumGeo = this.getSharedGeo('mod_bp_drum', () => {
      const g = new THREE.CylinderGeometry(0.085, 0.085, 0.11, 10);
      g.rotateX(Math.PI * 0.5);
      return g;
    });
    const bpGripGeo = this.getSharedGeo('mod_bp_grip', () => new THREE.BoxGeometry(0.065, 0.14, 0.07));

    const benchGroup = new THREE.Group();
    benchGroup.name = `ModBench_${spec.id}`;
    benchGroup.position.set(spec.x, y, spec.z);
    benchGroup.rotation.y = spec.rotationY;

    const plinth = new THREE.Mesh(basePlinthGeo, chassisMat);
    plinth.position.y = 0.07;
    plinth.receiveShadow = true;
    benchGroup.add(plinth);

    for (const lx of [-0.94, 0.94]) {
      for (const lz of [-0.42, 0.42]) {
        const leg = new THREE.Mesh(legGeo, trimMat);
        leg.position.set(lx, 0.5, lz);
        leg.castShadow = true;
        leg.receiveShadow = true;
        benchGroup.add(leg);
      }
    }

    const shelf = new THREE.Mesh(shelfGeo, alloyMat);
    shelf.position.set(0, 0.34, 0);
    shelf.receiveShadow = true;
    benchGroup.add(shelf);

    const tabletop = new THREE.Mesh(topGeo, chassisMat);
    tabletop.position.set(0, 0.95, 0);
    tabletop.castShadow = true;
    tabletop.receiveShadow = true;
    benchGroup.add(tabletop);

    for (const rz of [-0.57, 0.57]) {
      const railGlow = new THREE.Mesh(railGlowGeo, cyanGlowMat);
      railGlow.position.set(0, 0.96, rz);
      benchGroup.add(railGlow);
    }

    for (const gx of [-0.74, 0.74]) {
      const post = new THREE.Mesh(gantryPostGeo, alloyMat);
      post.position.set(gx, 1.32, -0.46);
      post.castShadow = true;
      benchGroup.add(post);
    }

    const screenFrame = new THREE.Mesh(screenFrameGeo, trimMat);
    screenFrame.position.set(0, 1.62, -0.46);
    screenFrame.rotation.x = 0.18;
    benchGroup.add(screenFrame);

    const screenFace = new THREE.Mesh(screenFaceGeo, cyanGlowMat);
    screenFace.position.set(0, 1.62, -0.415);
    screenFace.rotation.x = 0.18;
    benchGroup.add(screenFace);

    const emitterPad = new THREE.Mesh(emitterPadGeo, alloyMat);
    emitterPad.position.set(0, 1.05, 0.04);
    benchGroup.add(emitterPad);

    const emitterCore = new THREE.Mesh(emitterCoreGeo, cyanGlowMat);
    emitterCore.position.set(0, 1.06, 0.04);
    benchGroup.add(emitterCore);

    const holoCone = new THREE.Mesh(holoConeGeo, holoConeMat);
    holoCone.position.set(0, 1.36, 0.04);
    benchGroup.add(holoCone);

    const baseHoloY = 1.48;
    const holoGroup = new THREE.Group();
    holoGroup.position.set(0, baseHoloY, 0.04);

    const holoRing = new THREE.Mesh(holoRingGeo, cyanGlowMat);
    holoRing.position.y = -0.14;
    holoGroup.add(holoRing);

    const receiver = new THREE.Mesh(bpReceiverGeo, blueprintMat);
    const barrel = new THREE.Mesh(bpBarrelGeo, blueprintMat);
    barrel.position.set(0.38, 0.02, 0);
    const suppressor = new THREE.Mesh(bpSuppressorGeo, cyanGlowMat);
    suppressor.position.set(0.66, 0.02, 0);
    const optic = new THREE.Mesh(bpOpticGeo, cyanGlowMat);
    optic.position.set(-0.02, 0.11, 0);
    const drum = new THREE.Mesh(bpDrumGeo, cyanGlowMat);
    drum.position.set(0.05, -0.12, 0);
    const grip = new THREE.Mesh(bpGripGeo, blueprintMat);
    grip.position.set(0.24, -0.1, 0);
    grip.rotation.z = 0.25;
    const stock = new THREE.Mesh(bpGripGeo, blueprintMat);
    stock.position.set(-0.28, -0.02, 0);
    stock.rotation.z = -0.35;
    holoGroup.add(receiver, barrel, suppressor, optic, drum, grip, stock);
    benchGroup.add(holoGroup);

    this.group.add(benchGroup);

    const collider = this.makeRotatedCollider(
      `${spec.id}_col`,
      spec.x,
      spec.z,
      0,
      0,
      1.15,
      0.62,
      y,
      y + 1.55,
      spec.rotationY,
      'metal',
      `mod_bench:${spec.id}`,
    );

    const visual: ModBenchVisual = {
      data,
      group: benchGroup,
      holoGroup,
      holoRing,
      baseHoloY,
      collider,
      isQaShowcase: spec.isQaShowcase,
    };
    this.modBenchesMap.set(spec.id, visual);
    return visual;
  }

  private buildModBenches(_terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      poiId: string;
      dx: number;
      dz: number;
      rotationY: number;
    }> = [
      { id: 'mod_metro_towers', poiId: 'metro_towers', dx: -1, dz: -11, rotationY: 0 },
      { id: 'mod_market_row', poiId: 'market_row', dx: -2, dz: -9, rotationY: 0 },
      { id: 'mod_crater_depot', poiId: 'crater_depot', dx: 1, dz: -11, rotationY: 0 },
      { id: 'mod_whispering_pines', poiId: 'whispering_pines', dx: 10, dz: 2, rotationY: -Math.PI * 0.5 },
      { id: 'mod_scorched_caldera', poiId: 'scorched_caldera', dx: -4, dz: 0, rotationY: Math.PI * 0.5 },
      { id: 'mod_skyline_spire', poiId: 'skyline_spire', dx: 0, dz: -4, rotationY: 0 },
    ];

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;
      this.createModBenchEntry({
        id: spec.id,
        poiId: spec.poiId,
        x: poi.x + spec.dx,
        z: poi.z + spec.dz,
        rotationY: spec.rotationY,
      });
    }
  }

  getModBenches(): ModBenchEntity[] {
    return this.modBenches;
  }

  getModBenchColliders(): ColliderBox[] {
    return Array.from(this.modBenchesMap.values(), (v) => v.collider);
  }

  findNearbyModBench(
    pos: Vec3Like,
    radius = MOD_BENCH_NEARBY_RADIUS,
  ): ModBenchEntity | null {
    if (
      !pos ||
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z) ||
      !Number.isFinite(radius) ||
      radius < 0
    ) {
      return null;
    }
    let best: ModBenchEntity | null = null;
    let bestDist = radius;
    for (let i = 0; i < this.modBenches.length; i++) {
      const b = this.modBenches[i];
      const d = Math.hypot(b.x - pos.x, b.y - pos.y, b.z - pos.z);
      if (d <= bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  private syncForecastTowerVisual(entry: ForecastTowerVisual): void {
    const scanned = entry.data.scanned;
    const mat = scanned ? entry.scannedMat : entry.unscannedMat;
    const beamMat = scanned ? entry.scannedBeamMat : entry.unscannedBeamMat;
    entry.beaconOrb.material = mat;
    entry.beaconRing.material = mat;
    entry.screenMesh.material = mat;
    entry.beaconBeam.material = beamMat;
    entry.beaconRing.scale.setScalar(scanned ? 1.18 : 1.0);
  }

  private createForecastTowerEntry(spec: {
    id: string;
    poiId: string;
    x: number;
    z: number;
    rotationY: number;
    isQaShowcase?: boolean;
  }): ForecastTowerVisual {
    const y = this.terrain.getHeightAt(spec.x, spec.z);
    const data: ForecastTowerEntity = {
      id: spec.id,
      poiId: spec.poiId,
      x: spec.x,
      y,
      z: spec.z,
      rotationY: spec.rotationY,
      scanned: false,
      scannedBy: null,
    };
    this.forecastTowers.push(data);

    const concreteMat = this.getSharedMat('forecast_concrete', () =>
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.78, metalness: 0.25 }),
    );
    const steelMat = this.getSharedMat('forecast_steel', () =>
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.36, metalness: 0.82 }),
    );
    const dishMat = this.getSharedMat('forecast_dish', () =>
      new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.28,
        metalness: 0.65,
        side: THREE.DoubleSide,
      }),
    );
    const unscannedMat = this.getSharedMat('forecast_cyan', () =>
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 1.55,
        roughness: 0.16,
        metalness: 0.28,
      }),
    );
    const scannedMat = this.getSharedMat('forecast_emerald_cyan', () =>
      new THREE.MeshStandardMaterial({
        color: '#10b981',
        emissive: '#34d399',
        emissiveIntensity: 1.9,
        roughness: 0.14,
        metalness: 0.28,
      }),
    );
    const unscannedBeamMat = this.getSharedMat('forecast_beam_cyan', () =>
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const scannedBeamMat = this.getSharedMat('forecast_beam_emerald', () =>
      new THREE.MeshBasicMaterial({
        color: '#34d399',
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const padGeo = this.getSharedGeo('forecast_pad', () => new THREE.CylinderGeometry(1.38, 1.56, 0.22, 8));
    const tripodLegGeo = this.getSharedGeo('forecast_tripod_leg', () => new THREE.CylinderGeometry(0.08, 0.13, 4.95, 8));
    const coreColumnGeo = this.getSharedGeo('forecast_core_col', () => new THREE.CylinderGeometry(0.18, 0.24, 5.2, 10));
    const upperMastGeo = this.getSharedGeo('forecast_upper_mast', () => new THREE.CylinderGeometry(0.09, 0.14, 2.75, 10));
    const collarGeo = this.getSharedGeo('forecast_collar', () => new THREE.CylinderGeometry(0.38, 0.44, 0.34, 12));
    const consoleGeo = this.getSharedGeo('forecast_console', () => new THREE.BoxGeometry(0.68, 1.24, 0.44));
    const screenGeo = this.getSharedGeo('forecast_screen', () => new THREE.BoxGeometry(0.52, 0.38, 0.05));
    const dishBowlGeo = this.getSharedGeo('forecast_dish_bowl', () =>
      new THREE.SphereGeometry(0.86, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
    );
    const dishRimGeo = this.getSharedGeo('forecast_dish_rim', () => new THREE.TorusGeometry(0.84, 0.045, 8, 24));
    const feedHornGeo = this.getSharedGeo('forecast_feed_horn', () => new THREE.CylinderGeometry(0.04, 0.09, 0.72, 8));
    const beaconOrbGeo = this.getSharedGeo('forecast_beacon_orb', () => new THREE.SphereGeometry(0.24, 12, 10));
    const beaconRingGeo = this.getSharedGeo('forecast_beacon_ring', () => {
      const g = new THREE.TorusGeometry(0.54, 0.042, 8, 24);
      g.rotateX(Math.PI * 0.45);
      return g;
    });
    const beaconBeamGeo = this.getSharedGeo('forecast_beacon_beam', () =>
      new THREE.CylinderGeometry(0.2, 0.48, 8.5, 12, 1, true),
    );

    const towerGroup = new THREE.Group();
    towerGroup.name = `ForecastTower_${spec.id}`;
    towerGroup.position.set(spec.x, y, spec.z);
    towerGroup.rotation.y = spec.rotationY;

    const pad = new THREE.Mesh(padGeo, concreteMat);
    pad.position.y = 0.11;
    pad.receiveShadow = true;
    pad.castShadow = true;
    towerGroup.add(pad);

    // Tripod mast: 3 angled steel legs meeting at the central collar
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const legPivot = new THREE.Group();
      legPivot.rotation.y = ang;
      const leg = new THREE.Mesh(tripodLegGeo, steelMat);
      leg.position.set(0, 2.52, 0.56);
      leg.rotation.x = 0.22;
      leg.castShadow = true;
      legPivot.add(leg);
      towerGroup.add(legPivot);
    }

    const coreCol = new THREE.Mesh(coreColumnGeo, steelMat);
    coreCol.position.y = 2.7;
    coreCol.castShadow = true;
    towerGroup.add(coreCol);

    const collar = new THREE.Mesh(collarGeo, concreteMat);
    collar.position.y = 5.05;
    collar.castShadow = true;
    towerGroup.add(collar);

    const upperMast = new THREE.Mesh(upperMastGeo, steelMat);
    upperMast.position.y = 6.5;
    upperMast.castShadow = true;
    towerGroup.add(upperMast);

    // Interactive front scanner console
    const consoleBox = new THREE.Mesh(consoleGeo, steelMat);
    consoleBox.position.set(0, 0.72, 0.96);
    consoleBox.castShadow = true;
    towerGroup.add(consoleBox);

    const screenMesh = new THREE.Mesh(screenGeo, unscannedMat);
    screenMesh.position.set(0, 1.04, 1.18);
    screenMesh.rotation.x = -0.32;
    towerGroup.add(screenMesh);

    // Spinning parabolic radar dish assembly
    const dishPivot = new THREE.Group();
    dishPivot.name = `ForecastDish_${spec.id}`;
    dishPivot.position.set(0, 6.25, 0);

    const dishMount = new THREE.Group();
    dishMount.position.set(0, 0, 0.35);
    dishMount.rotation.x = Math.PI * 0.38;

    const dishBowl = new THREE.Mesh(dishBowlGeo, dishMat);
    dishBowl.position.y = -0.34;
    dishBowl.castShadow = true;
    dishMount.add(dishBowl);

    const dishRim = new THREE.Mesh(dishRimGeo, steelMat);
    dishRim.rotation.x = Math.PI * 0.5;
    dishRim.position.y = 0.25;
    dishMount.add(dishRim);

    const feedHorn = new THREE.Mesh(feedHornGeo, steelMat);
    feedHorn.position.y = 0.38;
    dishMount.add(feedHorn);

    const feedTip = new THREE.Mesh(beaconOrbGeo, unscannedMat);
    feedTip.scale.setScalar(0.45);
    feedTip.position.y = 0.74;
    dishMount.add(feedTip);

    dishPivot.add(dishMount);
    towerGroup.add(dishPivot);

    // Top scanner beacon orb + rotating ring + sky beam
    const beaconOrb = new THREE.Mesh(beaconOrbGeo, unscannedMat);
    beaconOrb.position.y = 7.95;
    towerGroup.add(beaconOrb);

    const beaconRing = new THREE.Mesh(beaconRingGeo, unscannedMat);
    beaconRing.position.y = 7.95;
    towerGroup.add(beaconRing);

    const beaconBeam = new THREE.Mesh(beaconBeamGeo, unscannedBeamMat);
    beaconBeam.position.y = 12.1;
    towerGroup.add(beaconBeam);

    this.group.add(towerGroup);

    const collider = this.makeRotatedCollider(
      `${spec.id}_col`,
      spec.x,
      spec.z,
      0,
      0,
      1.25,
      1.25,
      y,
      y + 5.2,
      spec.rotationY,
      'metal',
      `forecast_tower:${spec.id}`,
    );

    const visual: ForecastTowerVisual = {
      data,
      group: towerGroup,
      dishPivot,
      beaconOrb,
      beaconRing,
      beaconBeam,
      screenMesh,
      unscannedMat,
      scannedMat,
      unscannedBeamMat,
      scannedBeamMat,
      collider,
      isQaShowcase: spec.isQaShowcase,
    };
    this.syncForecastTowerVisual(visual);
    this.forecastTowersMap.set(spec.id, visual);
    return visual;
  }

  private buildForecastTowers(_terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const specs: Array<{
      id: string;
      poiId: string;
      dx: number;
      dz: number;
      rotationY: number;
    }> = [
      { id: 'forecast_sunny_suburbs', poiId: 'sunny_suburbs', dx: -32, dz: 0, rotationY: Math.PI * 0.5 },
      { id: 'forecast_whispering_pines', poiId: 'whispering_pines', dx: 0, dz: -32, rotationY: 0 },
      { id: 'forecast_sunken_oasis', poiId: 'sunken_oasis', dx: 4, dz: -28, rotationY: 0 },
      { id: 'forecast_crater_depot', poiId: 'crater_depot', dx: -32, dz: 2, rotationY: Math.PI * 0.5 },
    ];

    for (const spec of specs) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;
      this.createForecastTowerEntry({
        id: spec.id,
        poiId: spec.poiId,
        x: poi.x + spec.dx,
        z: poi.z + spec.dz,
        rotationY: spec.rotationY,
      });
    }
  }

  getForecastTowers(): ForecastTowerEntity[] {
    return this.forecastTowers;
  }

  getForecastTowerColliders(): ColliderBox[] {
    return Array.from(this.forecastTowersMap.values(), (v) => v.collider);
  }

  findNearbyForecastTower(
    pos: Vec3Like,
    radius = FORECAST_TOWER_NEARBY_RADIUS,
  ): ForecastTowerEntity | null {
    if (
      !pos ||
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z) ||
      !Number.isFinite(radius) ||
      radius < 0
    ) {
      return null;
    }
    let best: ForecastTowerEntity | null = null;
    let bestDist = radius;
    for (let i = 0; i < this.forecastTowers.length; i++) {
      const ft = this.forecastTowers[i];
      const d = Math.hypot(ft.x - pos.x, ft.y - pos.y, ft.z - pos.z);
      if (d <= bestDist) {
        bestDist = d;
        best = ft;
      }
    }
    return best;
  }

  scanForecastTower(id: string, actorId: string): boolean {
    if (!actorId) return false;
    const entry = this.forecastTowersMap.get(id);
    if (!entry || entry.data.scanned) {
      return false;
    }
    entry.data.scanned = true;
    entry.data.scannedBy = actorId;
    this.syncForecastTowerVisual(entry);

    const pulsePos: Vec3Like = {
      x: entry.data.x,
      y: entry.data.y + 1.5,
      z: entry.data.z,
    };
    this.eventBus?.emit('vfx:forecast_pulse', { position: pulsePos });
    this.eventBus?.emit('sound:play', {
      id: 'forecast_scan',
      position: pulsePos,
      volume: 0.9,
      spatial: true,
    });
    return true;
  }

  private createStealthBushEntry(spec: {
    id: string;
    x: number;
    z: number;
    rotY: number;
    isQaShowcase?: boolean;
  }): StealthBushVisual {
    const y = this.terrain.getHeightAt(spec.x, spec.z);
    const data: StealthBushEntity = {
      id: spec.id,
      x: spec.x,
      y,
      z: spec.z,
      radius: STEALTH_BUSH_RADIUS,
    };
    this.stealthBushes.push(data);

    const foliageDarkMat = this.getSharedMat('stealth_bush_dark', () =>
      new THREE.MeshStandardMaterial({ color: '#1b662c', roughness: 0.88, metalness: 0.02 }),
    );
    const foliageMidMat = this.getSharedMat('stealth_bush_mid', () =>
      new THREE.MeshStandardMaterial({ color: '#27873b', roughness: 0.84, metalness: 0.02 }),
    );
    const foliageLightMat = this.getSharedMat('stealth_bush_light', () =>
      new THREE.MeshStandardMaterial({ color: '#38a84a', roughness: 0.8, metalness: 0.02 }),
    );
    const stemMat = this.getSharedMat('stealth_bush_stem', () =>
      new THREE.MeshStandardMaterial({ color: '#5c3c22', roughness: 0.92 }),
    );

    const stemGeo = this.getSharedGeo('stealth_bush_stem_geo', () => new THREE.CylinderGeometry(0.14, 0.24, 0.52, 7));
    const lobeGeo = this.getSharedGeo('stealth_bush_lobe_geo', () => new THREE.DodecahedronGeometry(1.0, 1));

    const bushGroup = new THREE.Group();
    bushGroup.name = `StealthBush_${spec.id}`;
    bushGroup.position.set(spec.x, y, spec.z);
    bushGroup.rotation.y = spec.rotY;

    const foliageGroup = new THREE.Group();

    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.24;
    foliageGroup.add(stem);

    // Central high dome
    const centerLobe = new THREE.Mesh(lobeGeo, foliageDarkMat);
    centerLobe.position.set(0, 0.95, 0);
    centerLobe.scale.set(1.12, 0.96, 1.12);
    centerLobe.castShadow = true;
    centerLobe.receiveShadow = true;
    foliageGroup.add(centerLobe);

    // 6 overlapping perimeter foliage lobes (~1.85m bush radius)
    const skirtCount = 6;
    for (let i = 0; i < skirtCount; i++) {
      const a = (i / skirtCount) * Math.PI * 2 + 0.22;
      const dist = 0.86 + (i % 2) * 0.14;
      const lobe = new THREE.Mesh(lobeGeo, i % 2 === 0 ? foliageMidMat : foliageLightMat);
      lobe.position.set(Math.cos(a) * dist, 0.68 + (i % 3) * 0.08, Math.sin(a) * dist);
      const s = 0.78 + (i % 2) * 0.12;
      lobe.scale.set(s * 1.06, s * 0.88, s * 1.06);
      lobe.rotation.set((i % 3) * 0.2, a, 0.15);
      lobe.castShadow = true;
      lobe.receiveShadow = true;
      foliageGroup.add(lobe);
    }

    // 3 upper stylized crown tufts
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2 + 0.55;
      const tuft = new THREE.Mesh(lobeGeo, c === 0 ? foliageLightMat : foliageMidMat);
      tuft.position.set(Math.cos(a) * 0.44, 1.46 + c * 0.05, Math.sin(a) * 0.44);
      tuft.scale.set(0.68, 0.58, 0.68);
      tuft.castShadow = true;
      foliageGroup.add(tuft);
    }

    bushGroup.add(foliageGroup);
    this.group.add(bushGroup);

    const visual: StealthBushVisual = {
      data,
      group: bushGroup,
      foliageGroup,
      rustleTimer: 0,
      rustlePhase: (this.stealthBushes.length * 1.17) % (Math.PI * 2),
      isQaShowcase: spec.isQaShowcase,
    };
    this.stealthBushesMap.set(spec.id, visual);
    return visual;
  }

  private buildStealthBushes(_terrain: TerrainQuery): void {
    const poiMap = new Map(POIS.map((p) => [p.id, p]));
    const poiPerimeterOffsets: Array<{ id: string; poiId: string; dx: number; dz: number }> = [
      { id: 'bush_metro_w', poiId: 'metro_towers', dx: -42, dz: -6 },
      { id: 'bush_metro_se', poiId: 'metro_towers', dx: 38, dz: 28 },
      { id: 'bush_suburbs_sw', poiId: 'sunny_suburbs', dx: -38, dz: 24 },
      { id: 'bush_suburbs_ne', poiId: 'sunny_suburbs', dx: 32, dz: -36 },
      { id: 'bush_crystal_nw', poiId: 'crystal_basin', dx: -64, dz: -22 },
      { id: 'bush_crystal_se', poiId: 'crystal_basin', dx: 64, dz: 32 },
      { id: 'bush_market_nw', poiId: 'market_row', dx: -36, dz: -30 },
      { id: 'bush_market_se', poiId: 'market_row', dx: 38, dz: 28 },
      { id: 'bush_crater_sw', poiId: 'crater_depot', dx: -38, dz: 34 },
      { id: 'bush_crater_e', poiId: 'crater_depot', dx: 38, dz: -12 },
      { id: 'bush_pines_w', poiId: 'whispering_pines', dx: -42, dz: 18 },
      { id: 'bush_pines_ne', poiId: 'whispering_pines', dx: 36, dz: -34 },
      { id: 'bush_frost_sw', poiId: 'frostpeak_citadel', dx: -34, dz: 24 },
      { id: 'bush_frost_se', poiId: 'frostpeak_citadel', dx: 36, dz: 28 },
      { id: 'bush_caldera_w', poiId: 'scorched_caldera', dx: -42, dz: -14 },
      { id: 'bush_caldera_se', poiId: 'scorched_caldera', dx: 34, dz: 32 },
      { id: 'bush_oasis_ne', poiId: 'sunken_oasis', dx: 28, dz: -34 },
      { id: 'bush_oasis_nw', poiId: 'sunken_oasis', dx: -34, dz: -24 },
      { id: 'bush_skyline_sw', poiId: 'skyline_spire', dx: -38, dz: 24 },
      { id: 'bush_skyline_ne', poiId: 'skyline_spire', dx: 36, dz: -24 },
    ];

    const hillcrestSpots: Array<{ id: string; x: number; z: number }> = [
      { id: 'bush_hill_center', x: -15, z: -18 },
      { id: 'bush_hill_nw_ridge', x: -55, z: -135 },
      { id: 'bush_hill_ne_ridge', x: 42, z: -205 },
      { id: 'bush_hill_west', x: -130, z: 25 },
      { id: 'bush_hill_east', x: 135, z: -35 },
      { id: 'bush_hill_sw_ridge', x: -75, z: 85 },
      { id: 'bush_hill_south_meadow', x: 25, z: 45 },
      { id: 'bush_hill_south_bluff', x: 15, z: 225 },
    ];

    let idx = 0;
    for (const spec of poiPerimeterOffsets) {
      const poi = poiMap.get(spec.poiId);
      if (!poi) continue;
      this.createStealthBushEntry({
        id: spec.id,
        x: poi.x + spec.dx,
        z: poi.z + spec.dz,
        rotY: (idx++ * 0.93) % (Math.PI * 2),
      });
    }

    for (const spot of hillcrestSpots) {
      this.createStealthBushEntry({
        id: spot.id,
        x: spot.x,
        z: spot.z,
        rotY: (idx++ * 0.93) % (Math.PI * 2),
      });
    }
  }

  getStealthBushes(): StealthBushEntity[] {
    return this.stealthBushes;
  }

  isInsideStealthBush(pos: Vec3Like): StealthBushEntity | null {
    if (
      !pos ||
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z)
    ) {
      return null;
    }

    let best: StealthBushVisual | null = null;
    let bestDistSq = Infinity;
    for (const entry of this.stealthBushesMap.values()) {
      const b = entry.data;
      if (pos.y < b.y - 1.0 || pos.y > b.y + 2.8) {
        continue;
      }
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= b.radius * b.radius && dSq < bestDistSq) {
        bestDistSq = dSq;
        best = entry;
      }
    }

    if (!best) return null;
    best.rustleTimer = STEALTH_BUSH_RUSTLE_SEC;
    return best.data;
  }

  private removeQaShowcaseDynamicEntities(): void {
    const qaBunkerId = 'bunker_qa_showcase';
    const qaBunker = this.weaponBunkersMap.get(qaBunkerId);
    if (qaBunker) {
      this.group.remove(qaBunker.group);
      this.weaponBunkersMap.delete(qaBunkerId);
      const idx = this.weaponBunkers.findIndex((b) => b.id === qaBunkerId);
      if (idx >= 0) this.weaponBunkers.splice(idx, 1);
    }

    const qaTankerId = 'tanker_qa_showcase';
    const qaTanker = this.slurpTankersMap.get(qaTankerId);
    if (qaTanker) {
      this.group.remove(qaTanker.group);
      this.slurpTankersMap.delete(qaTankerId);
      const idx = this.slurpTankers.findIndex((t) => t.id === qaTankerId);
      if (idx >= 0) this.slurpTankers.splice(idx, 1);
    }

    const qaVanId = 'van_qa_showcase';
    const qaVan = this.rebootVansMap.get(qaVanId);
    if (qaVan) {
      this.group.remove(qaVan.group);
      this.rebootVansMap.delete(qaVanId);
      const idx = this.rebootVans.findIndex((v) => v.id === qaVanId);
      if (idx >= 0) this.rebootVans.splice(idx, 1);
    }

    const qaRailId = 'rail_qa_showcase';
    const qaRail = this.grindRailsMap.get(qaRailId);
    if (qaRail) {
      this.group.remove(qaRail.group);
      this.grindRailsMap.delete(qaRailId);
      const idx = this.grindRails.findIndex((r) => r.id === qaRailId);
      if (idx >= 0) this.grindRails.splice(idx, 1);
    }

    for (const qaDroneId of ['drone_qa_showcase_1', 'drone_qa_showcase_2']) {
      const qaDrone = this.supplyDronesMap.get(qaDroneId);
      if (qaDrone) {
        this.group.remove(qaDrone.group);
        this.supplyDronesMap.delete(qaDroneId);
        const idx = this.supplyDrones.findIndex((d) => d.id === qaDroneId);
        if (idx >= 0) this.supplyDrones.splice(idx, 1);
      }
    }

    const qaModBenchId = 'mod_bench_qa_showcase';
    const qaModBench = this.modBenchesMap.get(qaModBenchId);
    if (qaModBench) {
      this.group.remove(qaModBench.group);
      this.modBenchesMap.delete(qaModBenchId);
      const idx = this.modBenches.findIndex((m) => m.id === qaModBenchId);
      if (idx >= 0) this.modBenches.splice(idx, 1);
    }

    const qaForecastId = 'forecast_qa_showcase';
    const qaForecast = this.forecastTowersMap.get(qaForecastId);
    if (qaForecast) {
      this.group.remove(qaForecast.group);
      this.forecastTowersMap.delete(qaForecastId);
      const idx = this.forecastTowers.findIndex((f) => f.id === qaForecastId);
      if (idx >= 0) this.forecastTowers.splice(idx, 1);
    }

    for (const qaBushId of ['bush_qa_showcase_1', 'bush_qa_showcase_2']) {
      const qaBush = this.stealthBushesMap.get(qaBushId);
      if (qaBush) {
        this.group.remove(qaBush.group);
        this.stealthBushesMap.delete(qaBushId);
        const idx = this.stealthBushes.findIndex((b) => b.id === qaBushId);
        if (idx >= 0) this.stealthBushes.splice(idx, 1);
      }
    }

    for (const g of this.qaShowcaseGeos) g.dispose();
    this.qaShowcaseGeos = [];
  }

  qaPlaceWave6Showcase(centerPos: Vec3Like): Wave6ShowcaseResult {
    this.removeQaShowcaseDynamicEntities();

    const bSpot = this.findDryGroundNear(centerPos, 6.5, -3.5);
    const bunkerVisual = this.createWeaponBunkerEntry({
      id: 'bunker_qa_showcase',
      poiId: 'qa_showcase',
      x: bSpot.x,
      z: bSpot.z,
      rotationY: -Math.PI * 0.25,
      unlocked: true,
      rewardIndex: 0,
      isQaShowcase: true,
    });

    const tSpot = this.findDryGroundNear(centerPos, -6.5, -3.5);
    const tankerVisual = this.createSlurpTankerEntry({
      id: 'tanker_qa_showcase',
      x: tSpot.x,
      z: tSpot.z,
      rotationY: Math.PI * 0.25,
      isQaShowcase: true,
    });

    const mSpot = this.findDryGroundNear(centerPos, -2.5, 4.0);
    const medallion = this.spawnDroppedMedallion('medallion_combat', mSpot.x, mSpot.y, mSpot.z);

    const cSpot = this.findDryGroundNear(centerPos, 2.5, 4.0);
    const crown = this.spawnDroppedCrown(cSpot.x, cSpot.y, cSpot.z);

    return {
      bunker: bunkerVisual.data,
      tanker: tankerVisual.data,
      medallion,
      crown,
    };
  }

  qaPlaceWave7Showcase(centerPos: Vec3Like): Wave7ShowcaseResult {
    this.removeQaShowcaseDynamicEntities();

    const vanSpot = this.findDryGroundNear(centerPos, -5.5, 2.0);
    const vanVisual = this.createRebootVanEntry({
      id: 'van_qa_showcase',
      poiId: 'qa_showcase',
      x: vanSpot.x,
      z: vanSpot.z,
      rotationY: Math.PI * 0.25,
      isQaShowcase: true,
    });

    const railOrigin = this.findDryGroundNear(centerPos, 5.0, 2.0);
    const railOffsets: Array<[number, number, number]> = [
      [0, -4.5, 2.3],
      [4.5, -2.5, 3.2],
      [5.0, 2.5, 4.1],
      [1.0, 5.2, 3.5],
      [-4.0, 3.5, 2.6],
      [-4.5, -1.8, 2.2],
    ];
    const railPoints: Vec3Like[] = railOffsets.map(([dx, dz, h]) => {
      const px = railOrigin.x + dx;
      const pz = railOrigin.z + dz;
      return {
        x: px,
        y: this.terrain.getHeightAt(px, pz) + h,
        z: pz,
      };
    });
    const railVisual = this.createGrindRailEntry({
      id: 'rail_qa_showcase',
      poiId: 'qa_showcase',
      points: railPoints,
      color: '#22d3ee',
      speed: GRIND_RAIL_SPEED,
      isQaShowcase: true,
    });

    const droneSpot = this.findDryGroundNear(centerPos, 0, 2.5);
    const drone1 = this.createSupplyDroneEntry({
      id: 'drone_qa_showcase_1',
      poiId: 'qa_showcase',
      orbitCenterX: droneSpot.x,
      orbitCenterZ: droneSpot.z,
      heightOffset: 13.5,
      orbitRadius: 5.5,
      orbitAngle: 0.4,
      orbitSpeed: 0.55,
      rarity: 'epic',
      weaponId: 'railgun',
      gold: 75,
      trapKind: 'spike_trap',
      isQaShowcase: true,
    });
    const drone2 = this.createSupplyDroneEntry({
      id: 'drone_qa_showcase_2',
      poiId: 'qa_showcase',
      orbitCenterX: droneSpot.x,
      orbitCenterZ: droneSpot.z,
      heightOffset: 15.5,
      orbitRadius: 8.0,
      orbitAngle: 3.5,
      orbitSpeed: -0.48,
      rarity: 'legendary',
      weaponId: 'minigun',
      gold: 100,
      trapKind: 'bouncer_pad',
      isQaShowcase: true,
    });

    return {
      rebootVan: vanVisual.data,
      grindRail: railVisual.data,
      drones: [drone1.data, drone2.data],
    };
  }

  qaPlaceWave8Showcase(centerPos: Vec3Like): Wave8ShowcaseResult {
    this.removeQaShowcaseDynamicEntities();

    const benchSpot = this.findDryGroundNear(centerPos, -5.0, -3.5);
    const benchVisual = this.createModBenchEntry({
      id: 'mod_bench_qa_showcase',
      poiId: 'qa_showcase',
      x: benchSpot.x,
      z: benchSpot.z,
      rotationY: Math.PI * 0.2,
      isQaShowcase: true,
    });

    const towerSpot = this.findDryGroundNear(centerPos, 5.5, -4.5);
    const towerVisual = this.createForecastTowerEntry({
      id: 'forecast_qa_showcase',
      poiId: 'qa_showcase',
      x: towerSpot.x,
      z: towerSpot.z,
      rotationY: -Math.PI * 0.2,
      isQaShowcase: true,
    });

    const bushSpot1 = this.findDryGroundNear(centerPos, -3.5, 4.5);
    const bush1 = this.createStealthBushEntry({
      id: 'bush_qa_showcase_1',
      x: bushSpot1.x,
      z: bushSpot1.z,
      rotY: 0.4,
      isQaShowcase: true,
    });

    const bushSpot2 = this.findDryGroundNear(centerPos, 3.5, 4.5);
    const bush2 = this.createStealthBushEntry({
      id: 'bush_qa_showcase_2',
      x: bushSpot2.x,
      z: bushSpot2.z,
      rotY: 1.9,
      isQaShowcase: true,
    });

    return {
      modBench: benchVisual.data,
      forecastTower: towerVisual.data,
      stealthBushes: [bush1.data, bush2.data],
    };
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
      ...this.getExplosiveBarrelColliders(),
      ...this.getVendingMachineColliders(),
      ...this.getLootIslandColliders(),
      ...this.getWeaponBunkerColliders(),
      ...this.getSlurpTankerColliders(),
      ...this.getRebootVanColliders(),
      ...this.getModBenchColliders(),
      ...this.getForecastTowerColliders(),
    ];
  }

  reset(): void {
    this.removeQaShowcaseDynamicEntities();

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

    for (const r of this.riftsMap.values()) {
      r.data.active = true;
      r.data.openRemainingSec = 0;
      r.data.cooldownSec = 0;
      r.portalGroup.visible = true;
      r.shardsGroup.scale.set(1, 1, 1);
      r.diamond.position.y = r.baseDiamondY;
    }

    for (const cp of this.capturePointsMap.values()) {
      cp.data.progress = 0;
      cp.data.captured = false;
      cp.data.ownerId = null;
      cp.data.ownerName = null;
      cp.claimedThisFrame = false;
      cp.flagGroup.rotation.set(0, 0, 0);
      cp.innerRing.scale.set(1, 1, 1);
      this.syncCapturePointVisual(cp);
    }

    for (const eb of this.explosiveBarrelsMap.values()) {
      eb.data.hp = EXPLOSIVE_BARREL_HP;
      eb.data.maxHp = EXPLOSIVE_BARREL_HP;
      eb.data.exploded = false;
      eb.group.visible = true;
      eb.bodyGroup.scale.set(1, 1, 1);
      eb.bodyGroup.rotation.set(0, 0, 0);
      eb.hitAnim = 0;
    }

    for (const vm of this.vendingMachinesMap.values()) {
      vm.data.stock = VENDING_DEFAULT_STOCK;
      vm.haloGroup.position.y = vm.baseHaloY;
      vm.haloGroup.rotation.set(0, 0, 0);
      this.syncVendingMachineVisual(vm);
    }

    for (const npc of this.npcSpecialistsMap.values()) {
      npc.data.hiredBy = null;
      npc.beaconGroup.visible = true;
      npc.group.visible = true;
      npc.emblemGroup.position.y = npc.baseEmblemY;
      npc.emblemGroup.rotation.set(0, 0, 0);
    }

    for (const wb of this.weaponBunkersMap.values()) {
      wb.data.unlocked = false;
      wb.data.looted = false;
      wb.doorOpenProgress = 0;
      wb.blastDoor.position.y = wb.doorClosedY;
      wb.beaconOrb.material = wb.amberMat;
      wb.beaconHalo.material = wb.amberHaloMat;
      wb.cacheGroup.visible = true;
    }

    for (const st of this.slurpTankersMap.values()) {
      st.data.hp = SLURP_TANKER_HP;
      st.data.maxHp = SLURP_TANKER_HP;
      st.data.destroyed = false;
      st.intactTankGroup.visible = true;
      st.rupturedTankGroup.visible = false;
      st.bodyGroup.scale.set(1, 1, 1);
      st.bodyGroup.rotation.set(0, 0, 0);
      st.hitAnim = 0;
    }

    for (const rv of this.rebootVansMap.values()) {
      rv.data.available = true;
      rv.data.cooldownRemainingSec = 0;
      rv.holoGroup.position.y = rv.baseHoloY;
      rv.holoGroup.rotation.set(0, 0, 0);
      this.syncRebootVanVisual(rv);
    }

    for (const dr of this.supplyDronesMap.values()) {
      dr.data.hp = dr.data.maxHp;
      dr.data.destroyed = false;
      dr.data.orbitAngle = dr.initialAngle;
      dr.data.x = dr.data.orbitCenterX + Math.cos(dr.initialAngle) * dr.data.orbitRadius;
      dr.data.z = dr.data.orbitCenterZ + Math.sin(dr.initialAngle) * dr.data.orbitRadius;
      dr.data.y = dr.data.baseY;
      dr.hitAnim = 0;
      dr.group.visible = true;
      dr.group.position.set(dr.data.x, dr.data.y, dr.data.z);
      dr.group.rotation.set(0, -dr.initialAngle, 0);
      dr.bodyGroup.rotation.set(0, 0, 0);
      dr.bodyGroup.scale.set(1, 1, 1);
    }

    for (const dm of this.droppedMedallionsMap.values()) {
      this.group.remove(dm.group);
    }
    this.droppedMedallionsMap.clear();
    this.droppedMedallions = [];

    for (const dc of this.droppedCrownsMap.values()) {
      this.group.remove(dc.group);
    }
    this.droppedCrownsMap.clear();
    this.droppedCrowns = [];

    this.lootIslandState = {
      active: false,
      spawnedAtSec: 0,
      x: 0,
      y: 0,
      z: 0,
      radius: LOOT_ISLAND_RADIUS,
      captured: false,
      captureProgress: 0,
    };
    this.lootIslandGroup.visible = false;
    this.lootIslandGeyserGroup.visible = false;
    this.lootIslandFlagGroup.rotation.set(0, 0, 0);
    this.lootIslandInnerRing.scale.set(1, 1, 1);
    this.syncLootIslandVisual();

    for (const mb of this.modBenchesMap.values()) {
      mb.holoGroup.position.y = mb.baseHoloY;
      mb.holoGroup.rotation.set(0, 0, 0);
      mb.holoRing.rotation.set(0, 0, 0);
    }

    for (const ft of this.forecastTowersMap.values()) {
      ft.data.scanned = false;
      ft.data.scannedBy = null;
      ft.dishPivot.rotation.set(0, 0, 0);
      ft.beaconRing.rotation.set(0, 0, 0);
      this.syncForecastTowerVisual(ft);
    }

    for (const sb of this.stealthBushesMap.values()) {
      sb.rustleTimer = 0;
      sb.foliageGroup.rotation.set(0, 0, 0);
      sb.foliageGroup.scale.set(1, 1, 1);
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

  private stepBarrelHitWobble(
    entry: { bodyGroup: THREE.Group; hitAnim: number },
    safeDt: number,
  ): void {
    if (entry.hitAnim <= 0) return;
    entry.hitAnim = Math.max(0, entry.hitAnim - safeDt * 5.5);
    const wobble = Math.sin(entry.hitAnim * Math.PI * 3.0) * entry.hitAnim * 0.12;
    entry.bodyGroup.rotation.z = wobble;
    const squash = 1.0 - entry.hitAnim * 0.08;
    entry.bodyGroup.scale.set(1.0 + entry.hitAnim * 0.06, squash, 1.0 + entry.hitAnim * 0.06);
    if (entry.hitAnim === 0) {
      entry.bodyGroup.rotation.z = 0;
      entry.bodyGroup.scale.set(1, 1, 1);
    }
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

    // Update & animate 5 Shimmering Sky Rifts (8s open window -> 45s cooldown -> auto reopen)
    let riftIdx = 0;
    for (const r of this.riftsMap.values()) {
      if (r.data.active) {
        if (r.data.openRemainingSec > 0) {
          r.data.openRemainingSec = Math.max(0, r.data.openRemainingSec - safeDt);
          if (r.data.openRemainingSec <= 0) {
            r.data.openRemainingSec = 0;
            r.data.active = false;
            r.data.cooldownSec = RIFT_COOLDOWN_SEC;
          }
        }
      } else if (r.data.cooldownSec > 0) {
        r.data.cooldownSec = Math.max(0, r.data.cooldownSec - safeDt);
        if (r.data.cooldownSec <= 0) {
          r.data.cooldownSec = 0;
          r.data.active = true;
          r.data.openRemainingSec = 0;
        }
      }

      r.portalGroup.visible = r.data.active;
      r.baseRing.visible = r.data.active;
      if (r.data.active) {
        const isOpenWindow = r.data.openRemainingSec > 0;
        const spinMul = isOpenWindow ? 2.15 : 1.0;
        const t = elapsed + riftIdx * 0.85;
        r.diamond.position.y = r.baseDiamondY + Math.sin(t * 2.6) * 0.16;
        r.diamond.rotation.y = t * 1.9 * spinMul;
        r.shardsGroup.rotation.y = -t * 0.9 * spinMul;
        const pulseScale = 1.0 + Math.sin(t * (isOpenWindow ? 7.5 : 3.2)) * (isOpenWindow ? 0.12 : 0.05);
        r.shardsGroup.scale.set(pulseScale, pulseScale, pulseScale);
        r.haloGroup.rotation.y = t * 1.65 * spinMul;
        r.haloGroup.rotation.z = Math.sin(t * 1.3) * 0.25;
        const ringPulse = 1.0 + Math.sin(t * 3.4) * 0.08;
        r.baseRing.scale.set(ringPulse, ringPulse, ringPulse);
      }
      riftIdx++;
    }

    // Update & animate 4 Capture Points (smooth decay if not advanced this frame)
    let cpIdx = 0;
    for (const cp of this.capturePointsMap.values()) {
      if (!cp.data.captured) {
        if (cp.claimedThisFrame) {
          cp.claimedThisFrame = false;
        } else if (cp.data.progress > 0) {
          cp.data.progress = Math.max(0, cp.data.progress - safeDt / CAPTURE_DECAY_SEC);
        }
      } else {
        cp.claimedThisFrame = false;
      }

      this.syncCapturePointVisual(cp);
      const t = elapsed + cpIdx * 1.1;
      cp.flagGroup.rotation.y = Math.sin(t * 2.8) * 0.22;
      cp.finialMesh.rotation.y = t * 1.7;
      const ringPulse = 1.0 + Math.sin(t * 3.2) * 0.09;
      cp.innerRing.scale.set(ringPulse, ringPulse, ringPulse);
      cpIdx++;
    }

    // Decay hit wobble animation on damaged Slurp Barrels & Explosive Barrels
    for (const sb of this.slurpBarrelsMap.values()) {
      this.stepBarrelHitWobble(sb, safeDt);
    }
    for (const eb of this.explosiveBarrelsMap.values()) {
      this.stepBarrelHitWobble(eb, safeDt);
    }

    // Animate 6 Glowing Vending Machine halos & display emblems
    let vmIdx = 0;
    for (const vm of this.vendingMachinesMap.values()) {
      if (vm.data.stock > 0) {
        const t = elapsed + vmIdx * 0.7;
        vm.haloGroup.rotation.y = t * 1.9;
        vm.haloGroup.position.y = vm.baseHaloY + Math.sin(t * 2.5) * 0.08;
        vm.emblemMesh.rotation.y = t * 1.3;
      }
      vmIdx++;
    }

    // Animate unhired NPC Specialist holographic beacons
    let npcIdx = 0;
    for (const npc of this.npcSpecialistsMap.values()) {
      if (npc.data.hiredBy === null) {
        const t = elapsed + npcIdx * 1.1;
        npc.emblemGroup.rotation.y = t * 1.5;
        npc.emblemGroup.position.y = npc.baseEmblemY + Math.sin(t * 2.4) * 0.1;
        const ringPulse = 1.0 + Math.sin(t * 3.1) * 0.07;
        npc.ringMesh.scale.set(ringPulse, ringPulse, ringPulse);
      }
      npcIdx++;
    }

    // Animate Mid-Match Floating Loot Island shrine & Updraft Sky Rift Geyser
    if (this.lootIslandState.active) {
      this.lootIslandFlagGroup.rotation.y = Math.sin(elapsed * 2.8) * 0.22;
      this.lootIslandFinialMesh.rotation.y = elapsed * 1.8;
      const ringPulse = 1.0 + Math.sin(elapsed * 3.2) * 0.09;
      this.lootIslandInnerRing.scale.set(ringPulse, ringPulse, ringPulse);

      this.lootIslandGeyserCore.rotation.y = elapsed * 2.4;
      for (let i = 0; i < this.lootIslandGeyserRings.length; i++) {
        const ring = this.lootIslandGeyserRings[i];
        const phase = (elapsed * 0.75 + i / this.lootIslandGeyserRings.length) % 1;
        ring.position.y = 0.6 + phase * 17.5;
        const s = 1.1 - phase * 0.35;
        ring.scale.set(s, s, s);
      }
    }

    // Animate 8 Weapon Bunker sliding blast doors & beacons
    let bunkerIdx = 0;
    for (const wb of this.weaponBunkersMap.values()) {
      if (wb.data.unlocked && wb.doorOpenProgress < 1) {
        wb.doorOpenProgress = Math.min(1, wb.doorOpenProgress + safeDt * 1.1);
        const eased = 1 - Math.pow(1 - wb.doorOpenProgress, 3);
        wb.blastDoor.position.y = wb.doorClosedY + (wb.doorOpenY - wb.doorClosedY) * eased;
      }
      const bPulse = 1.0 + Math.sin(elapsed * 3.4 + bunkerIdx * 0.8) * 0.12;
      wb.beaconHalo.scale.set(bPulse, bPulse, bPulse);
      if (!wb.data.looted) {
        wb.cacheGroup.rotation.y = Math.sin(elapsed * 1.4 + bunkerIdx) * 0.08;
      }
      bunkerIdx++;
    }

    // Decay hit wobble on 6 Slurp Tanker trucks
    for (const st of this.slurpTankersMap.values()) {
      this.stepBarrelHitWobble(st, safeDt);
    }

    // Animate Neon Energy Grind Rail energy rings along splines
    for (const rail of this.grindRailsMap.values()) {
      for (let i = 0; i < rail.rings.length; i++) {
        const ring = rail.rings[i];
        ring.t = this.wrapUnitInterval(ring.t + safeDt * (ring.speed / ring.length));
        ring.curve.getPointAt(ring.t, _tmpRailPos);
        ring.curve.getTangentAt(ring.t, _tmpRailTan).normalize();
        ring.mesh.position.copy(_tmpRailPos);
        ring.mesh.quaternion.setFromUnitVectors(_tmpForwardZ, _tmpRailTan);
      }
    }

    // Spin Reboot Van holographic roof beacons & tick cooldowns
    let vanIdx = 0;
    for (const rv of this.rebootVansMap.values()) {
      if (!rv.data.available) {
        rv.data.cooldownRemainingSec = Math.max(0, rv.data.cooldownRemainingSec - safeDt);
        if (rv.data.cooldownRemainingSec <= 0) {
          rv.data.cooldownRemainingSec = 0;
          rv.data.available = true;
          this.syncRebootVanVisual(rv);
        }
      }
      const spinSpeed = rv.data.available ? 1.9 : 0.45;
      const t = elapsed + vanIdx * 0.8;
      rv.holoGroup.rotation.y += safeDt * spinSpeed;
      rv.holoRing.rotation.z = t * 1.25;
      rv.holoGroup.position.y = rv.baseHoloY + Math.sin(t * 2.6) * 0.1;
      vanIdx++;
    }

    // Orbit non-destroyed Flying Supply Drones, spin twin rotors & pulse undercarriage core
    let droneIdx = 0;
    for (const dr of this.supplyDronesMap.values()) {
      if (!dr.data.destroyed) {
        dr.data.orbitAngle =
          (dr.data.orbitAngle + dr.data.orbitSpeed * safeDt) % (Math.PI * 2);
        dr.data.x =
          dr.data.orbitCenterX + Math.cos(dr.data.orbitAngle) * dr.data.orbitRadius;
        dr.data.z =
          dr.data.orbitCenterZ + Math.sin(dr.data.orbitAngle) * dr.data.orbitRadius;
        dr.data.y = dr.data.baseY + Math.sin(elapsed * 2.1 + droneIdx * 0.75) * 0.42;

        dr.group.position.set(dr.data.x, dr.data.y, dr.data.z);
        dr.group.rotation.y = -dr.data.orbitAngle;

        for (let r = 0; r < dr.rotors.length; r++) {
          dr.rotors[r].rotation.y += safeDt * (r % 2 === 0 ? 24 : -24);
        }

        const pulse = 1.0 + Math.sin(elapsed * 4.2 + droneIdx * 0.9) * 0.1;
        dr.coreGroup.scale.set(pulse, pulse, pulse);
        dr.coreGroup.rotation.y = elapsed * 1.8 + droneIdx;
        this.stepBarrelHitWobble(dr, safeDt);
      }
      droneIdx++;
    }

    // Spin & hover dynamic Dropped Medallions and Dropped Crowns
    let pickupIdx = 0;
    for (const dm of this.droppedMedallionsMap.values()) {
      if (!dm.data.collected) {
        const t = elapsed + pickupIdx * 0.9;
        dm.spinGroup.rotation.y += safeDt * 2.4;
        dm.spinGroup.position.y = dm.baseSpinY + Math.sin(t * 2.8) * 0.1;
        const rScale = 1.0 + Math.sin(t * 3.5) * 0.1;
        dm.ringMesh.scale.set(rScale, rScale, rScale);
      }
      pickupIdx++;
    }
    for (const dc of this.droppedCrownsMap.values()) {
      if (!dc.data.collected) {
        const t = elapsed + pickupIdx * 0.9;
        dc.spinGroup.rotation.y += safeDt * 2.2;
        dc.spinGroup.position.y = dc.baseSpinY + Math.sin(t * 2.6) * 0.12;
        const rScale = 1.0 + Math.sin(t * 3.2) * 0.12;
        dc.ringMesh.scale.set(rScale, rScale, rScale);
      }
      pickupIdx++;
    }

    // Animate 6 Illuminated Weapon Mod Bench holographic blueprint silhouettes
    let modIdx = 0;
    for (const mb of this.modBenchesMap.values()) {
      const t = elapsed + modIdx * 0.7;
      mb.holoGroup.rotation.y = t * 1.45;
      mb.holoGroup.position.y = mb.baseHoloY + Math.sin(t * 2.5) * 0.07;
      mb.holoRing.rotation.z = t * 1.25;
      modIdx++;
    }

    // Spin 4 Forecast Tower parabolic radar dishes & scanner rings
    let towerIdx = 0;
    for (const ft of this.forecastTowersMap.values()) {
      const spinRate = ft.data.scanned ? 2.6 : 1.35;
      ft.dishPivot.rotation.y += safeDt * spinRate;
      ft.beaconRing.rotation.y = elapsed * (ft.data.scanned ? 2.4 : 1.4) + towerIdx;
      const pulse = (ft.data.scanned ? 1.18 : 1.0) + Math.sin(elapsed * 3.4 + towerIdx) * 0.08;
      ft.beaconRing.scale.set(pulse, pulse, pulse);
      towerIdx++;
    }

    // Animate touched Interactive Stealth Bush rustle pulses
    for (const bush of this.stealthBushesMap.values()) {
      if (bush.rustleTimer > 0) {
        bush.rustleTimer = Math.max(0, bush.rustleTimer - safeDt);
        if (bush.rustleTimer <= 0) {
          bush.foliageGroup.rotation.set(0, 0, 0);
          bush.foliageGroup.scale.set(1, 1, 1);
        } else {
          const env = bush.rustleTimer / STEALTH_BUSH_RUSTLE_SEC;
          const phase = bush.rustlePhase + (1 - env) * Math.PI * 5;
          bush.foliageGroup.rotation.z = Math.sin(phase) * env * 0.14;
          bush.foliageGroup.rotation.x = Math.cos(phase * 0.85) * env * 0.09;
          const puff = 1 + Math.abs(Math.sin(phase)) * env * 0.08;
          bush.foliageGroup.scale.set(puff, 1 - env * 0.04, puff);
        }
      }
    }
  }

  dispose(): void {
    this.group.clear();
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    for (const g of this.qaShowcaseGeos) g.dispose();
    this.qaShowcaseGeos = [];
    for (const m of this.materials) m.dispose();
    this.materials = [];
    for (const g of this.sharedGeos.values()) g.dispose();
    this.sharedGeos.clear();
    for (const m of this.sharedMats.values()) m.dispose();
    this.sharedMats.clear();
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
    this.rifts = [];
    this.riftsMap.clear();
    this.capturePoints = [];
    this.capturePointsMap.clear();
    this.explosiveBarrels = [];
    this.explosiveBarrelsMap.clear();
    this.vendingMachines = [];
    this.vendingMachinesMap.clear();
    this.npcSpecialists = [];
    this.npcSpecialistsMap.clear();
    this.weaponBunkers = [];
    this.weaponBunkersMap.clear();
    this.slurpTankers = [];
    this.slurpTankersMap.clear();
    this.droppedMedallions = [];
    this.droppedMedallionsMap.clear();
    this.droppedCrowns = [];
    this.droppedCrownsMap.clear();
    this.grindRails = [];
    this.grindRailsMap.clear();
    this.rebootVans = [];
    this.rebootVansMap.clear();
    this.supplyDrones = [];
    this.supplyDronesMap.clear();
    this.modBenches = [];
    this.modBenchesMap.clear();
    this.forecastTowers = [];
    this.forecastTowersMap.clear();
    this.stealthBushes = [];
    this.stealthBushesMap.clear();
    this.lootIslandGeyserRings = [];
    this.lootIslandState = {
      active: false,
      spawnedAtSec: 0,
      x: 0,
      y: 0,
      z: 0,
      radius: LOOT_ISLAND_RADIUS,
      captured: false,
      captureProgress: 0,
    };
  }
}
