import type {
  AmmoType,
  AnimState,
  BotAIState,
  BotPersonality,
  BuildPiece,
  BuildPieceType,
  CampfireEntity,
  CapturePointEntity,
  CharacterRenderState,
  ChestEntity,
  EmoteId,
  ExplosiveBarrelEntity,
  HarvestableProp,
  ItemInstance,
  LaunchPadEntity,
  LootDrop,
  MaterialType,
  Rarity,
  RiftEntity,
  SlurpBarrelEntity,
  StormState,
  TerrainQuery,
  Vec3Like,
  VehicleEntity,
  WallDir,
  WeaponId,
} from '../types';
import type { EventBus } from '../core';

export interface BotInventory {
  /** Slot 0 is pickaxe; slots 1..5 hold weapons and consumables. */
  items: (ItemInstance | null)[];
  activeSlot: number;
  ammo: Record<AmmoType, number>;
  materials: Record<MaterialType, number>;
}

export interface BotCombatTarget {
  id: string;
  name: string;
  position: Vec3Like;
  eyePos: Vec3Like;
  hp: number;
  shield: number;
  alive: boolean;
  isPlayer?: boolean;
  radius?: number;
  height?: number;
  velocity?: Vec3Like;
  inVehicle?: boolean;
}

export interface ShieldBubbleZone {
  position: Vec3Like;
  radius: number;
}

export interface BountyTargetSummary {
  targetName: string;
  distance: number;
  timeRemaining: number;
  rewardLabel: string;
}

export interface BountyReward {
  targetId: string;
  targetName: string;
  shield: number;
  materials: number;
  xp: number;
  rewardLabel: string;
  timestamp: number;
}

export interface BossEliminationRecord {
  bossId: string;
  bossName: string;
  poiId: string;
  position: Vec3Like;
  timestamp: number;
}

export interface BotRenderState extends CharacterRenderState {
  id: string;
  name: string;
  state: BotAIState;
  alive: boolean;
  skinId: string;
  pickaxeId: string;
  gliderId: string;
  gliderOpen: boolean;
  gliderFactor: number;
  isCrouching: boolean;
  isHiddenInBus: boolean;
  isBoss?: boolean;
  bossPoiId?: string;
}

export interface NamedBossSpec {
  id: string;
  name: string;
  poiId: string;
  skinId: string;
  pickaxeId: string;
  gliderId: string;
  personality: BotPersonality;
  offsetX: number;
  offsetZ: number;
  patrolRadius: number;
}

export interface BotEntity {
  id: string;
  name: string;
  skinId: string;
  pickaxeId: string;
  gliderId: string;
  personality: BotPersonality;
  state: BotAIState;

  position: Vec3Like;
  velocity: Vec3Like;
  yaw: number;
  pitch: number;
  grounded: boolean;
  isCrouching: boolean;
  isSprinting: boolean;
  moveSpeed: number;
  radius: number;
  height: number;

  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  alive: boolean;
  kills: number;
  damageDealt: number;

  animState: AnimState;
  isAiming: boolean;
  isFiring: boolean;
  isBuilding: boolean;
  emoteId: EmoteId | null;
  recoilKick: number;
  harvestSwingTimer: number;
  gliderOpen: boolean;
  gliderFactor: number;

  inventory: BotInventory;

  // Drop & Navigation state
  targetPoiId: string | null;
  dropJumpTime: number;
  dropTarget: Vec3Like;
  moveTarget: Vec3Like | null;
  patrolAngle: number;

  // Combat & Perception state
  targetEnemyId: string | null;
  lastKnownEnemyPos: Vec3Like | null;
  enemyLostTimer: number;
  lastHeardNoisePos: Vec3Like | null;
  lastHeardNoiseTime: number;
  lastDamageTime: number;
  lastDamagerId: string | null;
  lastAttackerName: string | null;
  lastDamageWeaponId: WeaponId | null;
  lastDamageRarity: Rarity | null;
  lastDamageHeadshot: boolean;
  reactionTimer: number;

  // Weapon / Action timers
  fireCooldown: number;
  burstQueue: number;
  burstTimer: number;
  reloadTimer: number;
  reloadSlot: number;
  healTimer: number;
  healSlot: number;
  buildCooldown: number;
  buildAnimTimer: number;
  harvestCooldown: number;

  // Tactical movement state
  strafeDir: -1 | 1;
  strafeTimer: number;
  jumpCooldown: number;
  crouchToggleTimer: number;
  stateTimer: number;
  thinkCooldown: number;
  scanCooldown: number;

  // World interaction targets
  harvestTargetId: string | null;
  lootTargetId: string | null;
  chestTargetId: string | null;
  ignoredTargetId: string | null;
  ignoredTargetUntil: number;
  stuckTimer: number;
  lastStuckCheckPos: Vec3Like;

  /** Deterministic PRNG state for per-bot variation */
  rngState: number;

  // Boss & Wave 1/2/3/4 tactical/traversal state
  isBoss?: boolean;
  bossPoiId?: string;
  bossHomePos?: Vec3Like;
  throwCooldown?: number;
  retreatTimer?: number;
  launchPadCooldown?: number;
  launchPadTargetId?: string | null;
  lastBuildTime?: number;
  shieldBubbleCooldown?: number;
  recentDamageTaken?: number;
  recentDamageWindowStart?: number;
  eliminatedByPlayer?: boolean;
  overshield?: number;
  maxOvershield?: number;
  campfireTargetId?: string | null;
  riftCooldown?: number;
  riftTargetId?: string | null;
  captureTargetId?: string | null;
}

export interface BotWorldContext {
  terrain: TerrainQuery;
  storm: StormState;
  getChests(): ChestEntity[];
  openChest(chestId: string): boolean;
  getLootDrops(): LootDrop[];
  pickupLootDrop(dropId: string): LootDrop | null;
  getProps(): HarvestableProp[];
  damageProp(
    propId: string,
    amount: number,
    hitPoint: Vec3Like,
  ): {
    hit: boolean;
    destroyed: boolean;
    isCrit?: boolean;
    matType: MaterialType;
    yieldAmount: number;
  };
  resolveMovement(
    pos: Vec3Like,
    vel: Vec3Like,
    radius: number,
    height: number,
    dt: number,
  ): {
    position: Vec3Like;
    velocity: Vec3Like;
    grounded: boolean;
    groundMaterial?: MaterialType | 'grass' | 'stone';
  };
  hasLineOfSight(from: Vec3Like, to: Vec3Like): boolean;
  placeBuildPiece(
    ownerId: string,
    type: BuildPieceType,
    material: MaterialType,
    gx: number,
    gy: number,
    gz: number,
    dir: WallDir,
    rotation: 0 | 1 | 2 | 3,
  ): boolean | BuildPiece | null;
  fireWeapon(
    bot: BotEntity,
    item: ItemInstance,
    origin: Vec3Like,
    aimDir: Vec3Like,
    spreadRad: number,
  ): {
    fired: boolean;
    shotsHit?: number;
    headshots?: number;
    damageDealt?: number;
  } | void;
  getCombatTargets(): BotCombatTarget[];
  getLaunchPads?: () => LaunchPadEntity[];
  getBuildPieces?: () => BuildPiece[];
  getActiveShieldBubbles?: () => Array<{ position: Vec3Like; radius: number }>;
  getVehicles?: () => VehicleEntity[];
  getSlurpBarrels?: () => SlurpBarrelEntity[];
  damageSlurpBarrel?: (
    id: string,
    dmg: number,
  ) => { destroyed: boolean; shieldAmount: number; position: Vec3Like } | null;
  getCampfires?: () => CampfireEntity[];
  igniteCampfire?: (id: string) => boolean;
  getRifts?: () => RiftEntity[];
  triggerRift?: (id: string) => { skyPos: Vec3Like } | null;
  getCapturePoints?: () => CapturePointEntity[];
  advanceCapturePoint?: (
    id: string,
    actorId: string,
    actorName: string,
    dt: number,
  ) => { capturedNow: boolean; progress: number; lootPos?: Vec3Like; poiName: string };
  getExplosiveBarrels?: () => ExplosiveBarrelEntity[];
  damageExplosiveBarrel?: (
    id: string,
    dmg: number,
  ) => { exploded: boolean; position: Vec3Like; blastRadius: number; blastDamage: number } | null;
  dropBotLoot(bot: BotEntity): void;
  eventBus: EventBus;
}
