import type {
  AmmoType,
  BuildPieceType,
  DamageEvent,
  EditModeState,
  GamePhase,
  HarvestableProp,
  ChestEntity,
  LaunchPadEntity,
  LootDrop,
  LootLlamaEntity,
  SupplyDrop,
  ItemInstance,
  MaterialType,
  Rarity,
  VaultEntity,
  Vec3Like,
  VehicleEntity,
  VehicleKind,
  WeaponId,
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
  maxHp?: number;
  maxShield?: number;
  velocity?: Vec3Like;
  fallImmune?: boolean;
  radius: number;
  height: number;
  alive: boolean;
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
  onAmmoConsumed?: () => void;
  onHarvest?: (matType: MaterialType, amount: number, isCrit: boolean) => void;
}

export interface FireWeaponResult {
  fired: boolean;
  shotsHit: number;
  headshots: number;
  damageDealt: number;
  burstRemaining?: number;
  harvested?: {
    matType: MaterialType;
    amount: number;
    isCrit: boolean;
  };
}

export interface PlayerMatchStats {
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  structuresBuilt: number;
  chestsOpened: number;
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
}
