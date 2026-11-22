import type {
  AmmoType,
  AugmentId,
  BuildPiece,
  BuildPieceType,
  CampfireEntity,
  CapturePointEntity,
  DamageEvent,
  DroppedCrownEntity,
  DroppedMedallionEntity,
  EditModeState,
  ExplosiveBarrelEntity,
  ForecastTowerEntity,
  GameModeId,
  GamePhase,
  GrindRailEntity,
  HarvestableProp,
  ChestEntity,
  LaunchPadEntity,
  LootDrop,
  LootIslandState,
  LootLlamaEntity,
  MaterialType,
  MedallionId,
  ModBenchEntity,
  NpcSpecialistEntity,
  Rarity,
  RebootVanEntity,
  RiftEntity,
  SlurpBarrelEntity,
  SlurpTankerEntity,
  StealthBushEntity,
  SupplyDroneEntity,
  SupplyDrop,
  ItemInstance,
  TeamId,
  TrapKind,
  UpgradeBenchEntity,
  VaultEntity,
  Vec3Like,
  VehicleEntity,
  VehicleKind,
  VendingMachineEntity,
  WeaponBunkerEntity,
  WeaponId,
  WeaponModId,
  ZiplineEntity,
} from '../types';

export interface VehicleBridge {
  getVehicles(): VehicleEntity[];
  enterVehicle(id: string, driverId: string): boolean;
  exitVehicle(id: string, driverId: string): Vec3Like | null;
  driveVehicle(
    id: string,
    throttle: number,
    steer: number,
    boost: boolean,
    dt: number,
  ): void;
  damageVehicle(id: string, dmg: number, hitPos: Vec3Like): boolean;
}

export interface VaultBridge {
  getVaults(): VaultEntity[];
  unlockVault(id: string): { unlocked: boolean; lootPos?: Vec3Like };
}

export interface WorldStationBridge {
  getUpgradeBenches(): UpgradeBenchEntity[];
  getCampfires(): CampfireEntity[];
  igniteCampfire(id: string): boolean;
  getActiveCampfireHealAt(x: number, y: number, z: number): number;
  getSlurpBarrels(): SlurpBarrelEntity[];
  damageSlurpBarrel(
    id: string,
    dmg: number,
  ): { destroyed: boolean; shieldAmount: number; position: Vec3Like } | null;
}

export interface WorldRiftCaptureBridge {
  getRifts(): RiftEntity[];
  triggerRift(id: string): { skyPos: Vec3Like } | null;
  getCapturePoints(): CapturePointEntity[];
  advanceCapturePoint(
    id: string,
    actorId: string,
    actorName: string,
    dt: number,
  ): {
    capturedNow: boolean;
    progress: number;
    lootPos?: Vec3Like;
    poiName: string;
  };
  getExplosiveBarrels(): ExplosiveBarrelEntity[];
  damageExplosiveBarrel(
    id: string,
    dmg: number,
  ): {
    exploded: boolean;
    position: Vec3Like;
    blastRadius: number;
    blastDamage: number;
  } | null;
}

export interface WorldEconomyBridge {
  getVendingMachines(): VendingMachineEntity[];
  purchaseFromVendingMachine(
    id: string,
  ): { item: ItemInstance; priceGold: number; position: Vec3Like } | null;
  getNpcSpecialists(): NpcSpecialistEntity[];
  hireNpcSpecialist(id: string, playerId: string): NpcSpecialistEntity | null;
  getLootIslandState(): LootIslandState;
  advanceLootIslandCapture(
    dt: number,
  ): { capturedNow: boolean; lootPos?: Vec3Like };
}

export interface WorldChapterBridge {
  getWeaponBunkers(): WeaponBunkerEntity[];
  lootWeaponBunker(id: string): {
    weaponId: WeaponId;
    rarity: Rarity;
    gold: number;
    shieldRestore: number;
  } | null;
  getSlurpTankers(): SlurpTankerEntity[];
  damageSlurpTanker(
    id: string,
    dmg: number,
  ): {
    exploded: boolean;
    x: number;
    y: number;
    z: number;
    radius: number;
    healAmount: number;
  } | null;
  getDroppedMedallions(): DroppedMedallionEntity[];
  collectNearbyMedallion(
    x: number,
    z: number,
    maxDist: number,
  ): DroppedMedallionEntity | { medallionId: MedallionId } | MedallionId | null;
  getDroppedCrowns(): DroppedCrownEntity[];
  collectNearbyCrown(
    x: number,
    z: number,
    maxDist: number,
  ): DroppedCrownEntity | boolean | null;
  spawnDroppedMedallion?(
    medallionId: MedallionId,
    x: number,
    y: number,
    z: number,
  ): void;
  spawnDroppedCrown?(x: number, y: number, z: number): void;
}

export interface DownedPartnerInfo {
  id?: string;
  name?: string;
  position: Vec3Like;
  bleedOutHp?: number;
}

export interface DuoReviveBridge {
  getPartnerDownedNearby(pos: Vec3Like): DownedPartnerInfo | null;
  completePartnerRevive(): boolean | void;
  isPartnerAlive?(): boolean;
}

export interface GrindRailSample {
  position: Vec3Like;
  tangent: Vec3Like;
}

export interface NearbyGrindRailMatch {
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

export interface WorldOverdriveBridge {
  getGrindRails(): GrindRailEntity[];
  findNearbyGrindRail(pos: Vec3Like, maxDist?: number): NearbyGrindRailMatch | null;
  sampleGrindRailAt(id: string, t: number): GrindRailSample | null;
  getRebootVans(): RebootVanEntity[];
  triggerRebootVan(id: string): boolean;
  getSupplyDrones(): SupplyDroneEntity[];
  damageSupplyDrone(id: string, dmg: number): SupplyDroneDamageResult | null;
}

export interface DuoRebootBridge {
  hasPartnerRebootCard(): boolean;
  rebootPartnerAt(pos: Vec3Like): unknown;
}

export interface WorldFrontierBridge {
  getModBenches(): ModBenchEntity[];
  getForecastTowers(): ForecastTowerEntity[];
  scanForecastTower(id: string, actorId: string): boolean;
  getStealthBushes(): StealthBushEntity[];
  isInsideStealthBush(pos: Vec3Like): StealthBushEntity | null;
}

export interface EmpDetonationReport {
  attackerId: string;
  isPlayer: boolean;
  position: Vec3Like;
  actorsHit: number;
  shieldStripped: number;
  trapsDisabled: number;
}

export interface BunkerDeploymentReport {
  ownerId: string;
  isPlayer: boolean;
  origin: Vec3Like;
  pieces: BuildPiece[];
}

export interface ShieldBubbleState {
  id: string;
  position: Vec3Like;
  radius: number;
  remaining: number;
}

export interface PlayerVehicleSnapshot {
  kind: VehicleKind;
  speedKmh: number;
  hp: number;
  maxHp: number;
  boostCharge: number;
  isBoosting: boolean;
}

export interface WorldTraversalBridge {
  getLaunchPads(): LaunchPadEntity[];
  getZiplines(): ZiplineEntity[];
}

export interface PropsInteractionBridge {
  getProps(): HarvestableProp[];
  getChests(): ChestEntity[];
  getLootDrops(): LootDrop[];
  getSupplyDrops(): SupplyDrop[];
  damageProp(
    propId: string,
    amount: number,
    hitPoint: Vec3Like,
    isPickaxe: boolean,
  ): {
    hit: boolean;
    destroyed: boolean;
    isCrit: boolean;
    matType: MaterialType;
    yieldAmount: number;
    weakpointPos?: Vec3Like;
  };
  openChest(chestId: string): boolean;
  openSupplyDrop(id: string): boolean;
  removeLootDrop(id: string): LootDrop | null;
  spawnLootDrop(
    pos: Vec3Like,
    payload: {
      item?: ItemInstance;
      ammo?: { type: AmmoType; amount: number };
      materials?: { type: MaterialType; amount: number };
    },
    scatterVel?: Vec3Like,
  ): LootDrop;
  getLlamas?(): LootLlamaEntity[];
  damageLlama?(id: string, dmg: number, hitPos: Vec3Like): boolean;
  openLlama?(id: string): boolean;
}

export interface CombatActor {
  id: string;
  name: string;
  position: Vec3Like;
  eyePos: Vec3Like;
  hp: number;
  shield: number;
  overshield?: number;
  maxHp?: number;
  maxShield?: number;
  maxOvershield?: number;
  velocity?: Vec3Like;
  fallImmune?: boolean;
  radius: number;
  height: number;
  alive: boolean;
  hasDemolisher?: boolean;
  hasFirstAssault?: boolean;
  hasCombatMedallion?: boolean;
  isKnocked?: boolean;
  squadId?: string;
  teamId?: TeamId;
  onDamage?: (ev: DamageEvent) => void;
  onHeal?: (hpAdded: number, shieldAdded: number) => void;
  onImpulse?: (impulse: Vec3Like, grantFallImmunity: boolean) => void;
}

export interface RaycastOptions {
  ignoreBoxes?: string[];
  checkBuilds?: boolean;
  checkProps?: boolean;
  props?: HarvestableProp[];
  ignoreBuildPieceIds?: string[];
}

export interface RaycastResult {
  hit: boolean;
  distance: number;
  point: Vec3Like;
  normal: Vec3Like;
  targetType: 'terrain' | 'static' | 'prop' | 'build' | 'none';
  targetId?: string;
  material?: MaterialType;
}

export interface MovementResult {
  position: Vec3Like;
  velocity: Vec3Like;
  grounded: boolean;
  groundMaterial: MaterialType | 'grass' | 'stone';
}

export interface FireWeaponParams {
  actor: CombatActor;
  item: ItemInstance;
  origin: Vec3Like;
  aimDir: Vec3Like;
  muzzlePos?: Vec3Like;
  spreadRad: number;
  isPlayer: boolean;
  vehicleBridge?: VehicleBridge | null;
  stationBridge?: WorldStationBridge | null;
  riftCaptureBridge?: WorldRiftCaptureBridge | null;
  chapterBridge?: WorldChapterBridge | null;
  overdriveBridge?: WorldOverdriveBridge | null;
  hasDemolisher?: boolean;
  hasFirstAssault?: boolean;
  hasCombatMedallion?: boolean;
  bowCharge?: number;
  weaponMods?: WeaponModId[];
  actorTeamId?: TeamId;
  isAiming?: boolean;
  spreadPreAdjusted?: boolean;
  actorYaw?: number;
  onAmmoConsumed?: () => void;
  onHarvest?: (matType: MaterialType, amount: number, isCrit: boolean) => void;
  onDroneDestroyed?: (res: SupplyDroneDamageResult) => void;
  onBunkerDeployed?: (report: BunkerDeploymentReport) => void;
  onEmpHit?: (report: EmpDetonationReport) => void;
}

export interface FireWeaponResult {
  fired: boolean;
  shotsHit: number;
  headshots: number;
  damageDealt: number;
  burstRemaining?: number;
  bloomScale?: number;
  recoilScale?: number;
  harvested?: {
    matType: MaterialType;
    amount: number;
    isCrit: boolean;
  };
  destroyedDrones?: SupplyDroneDamageResult[];
}

export interface PlayerMatchStats {
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  structuresBuilt: number;
  chestsOpened: number;
  questsCompleted?: number;
  poisCaptured?: number;
  goldEarned?: number;
  knocks?: number;
  revives?: number;
  reboots?: number;
  dronesShotDown?: number;
  trapsPlaced?: number;
  modsInstalled?: number;
  bunkersDeployed?: number;
  empHits?: number;
}

export interface PlayerInteractPrompt {
  label: string;
  key: string;
  rarity?: Rarity;
}

export interface PlayerHudSnapshot {
  phase: GamePhase;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  stamina: number;
  isSprinting: boolean;
  isCrouching: boolean;
  isAiming: boolean;
  isScoped: boolean;
  isBuildMode: boolean;
  activeBuildType: BuildPieceType;
  activeMaterial: MaterialType;
  buildRotation: 0 | 1 | 2 | 3;
  editMode: EditModeState;
  activeWeaponSpread: number;
  interactPrompt: PlayerInteractPrompt | null;
  reloadProgress: number | null;
  healProgress: number | null;
  healLabel: string | null;
  kills: number;
  playerPos: Vec3Like;
  playerYaw: number;
  compassHeading: number;
  pointerLocked: boolean;
  canDeployGlider: boolean;
  canJumpBus: boolean;
  hitmarker: {
    timestamp: number;
    isHeadshot: boolean;
    isShield: boolean;
    isElimination: boolean;
  } | null;
  damageDirection: {
    timestamp: number;
    angleRad: number;
  } | null;
  activeWeaponId: WeaponId;
  isSliding: boolean;
  isZiplining: boolean;
  isSwimming: boolean;
  canRepairBuild: boolean;
  killStreak: number;
  siphonFlashAt: number;
  lowHealthPulse: number;
  showSpeedLines: boolean;
  leanAngle: number;
  vehicle: PlayerVehicleSnapshot | null;
  activeVaultKeys: number;
  grapplerCharges: number | null;
  gameMode: GameModeId;
  overshield: number;
  maxOvershield: number;
  nearCampfireHealing: boolean;
  activeAugments: AugmentId[];
  pendingAugmentChoices: [AugmentId, AugmentId] | null;
  captureStatus: {
    poiName: string;
    progress: number;
    captured: boolean;
    contested?: boolean;
  } | null;
  tacticalPing: {
    x: number;
    y: number;
    z: number;
    label: string;
    kind: 'move' | 'danger' | 'loot';
    distance: number;
  } | null;
  goldBars: number;
  kineticDashCharges: number | null;
  medallions: MedallionId[];
  hasVictoryCrown: boolean;
  bowCharge: number | null;
  isKnocked: boolean;
  bleedOutHp: number;
  reviveProgress: number | null;
  reviveLabel: string | null;
  isGrinding: boolean;
  railgunCharge: number | null;
  minigunHeat: number | null;
  minigunOverheated: boolean;
  activeTrapKind: TrapKind;
  traps: Record<TrapKind, number>;
  hasPartnerRebootCard: boolean;
  rebootProgress: number | null;
  isStealthed?: boolean;
  hasStormForecast?: boolean;
  activeWeaponMods?: WeaponModId[];
}
