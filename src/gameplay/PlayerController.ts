import * as THREE from 'three';
import type {
  AnimState,
  AugmentId,
  BuildPiece,
  BuildPieceType,
  BuildPreviewState,
  CharacterRenderState,
  DamageEvent,
  EmoteId,
  FlareBeaconEntity,
  GameModeId,
  GamePhase,
  GameSettings,
  GrindRailEntity,
  ItemInstance,
  KeybindMap,
  LootIslandState,
  MaterialType,
  MedallionId,
  NpcSpecialistEntity,
  Rarity,
  RiftEntity,
  SoundEventId,
  TerrainQuery,
  TrapEntity,
  TrapKind,
  TurretEntity,
  Vec3Like,
  VendingMachineEntity,
  WeaponId,
  WeaponModId,
  ZiplineEntity,
} from '../types';
import {
  BUILD_COST,
  DBNO_BLEED_DPS,
  DBNO_MAX_HP,
  DEFAULT_KEYBINDS,
  EventBus,
  FISHING_CAST_SEC,
  GLIDER_FORCE_HEIGHT,
  GRID_XZ,
  GRID_Y,
  GRIND_RAIL_SPEED,
  HAMMER_BOUNCE_IMPULSE_FWD,
  HAMMER_BOUNCE_IMPULSE_Y,
  JETPACK_BURN_RATE,
  JETPACK_MAX_FUEL,
  JETPACK_RECHARGE_RATE,
  JETPACK_THRUST_ACCEL,
  LOW_GRAVITY_DURATION_SEC,
  LOW_GRAVITY_SCALE,
  MAX_GOLD_BARS,
  MEDALLIONS,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  RARITY_ORDER,
  REBOOT_DURATION_SEC,
  REVIVE_DURATION_SEC,
  SHIELD_MUSHROOM_AMOUNT,
  STARTING_GOLD_BARS,
  THERMAL_FLOPPER_DURATION_SEC,
  UPGRADE_COSTS,
  WATER_LEVEL,
  WEAPONS,
  WEAPON_MODS,
  WEAPON_MOD_COST_GOLD,
  clamp,
  damp,
  dist2D,
  dist3D,
  lerp,
  lerpAngle,
  normalizeAngle,
} from '../core';
import { VOLCANO_CENTER_X, VOLCANO_CENTER_Z } from '../world';
import { AugmentManager } from './AugmentManager';
import type { BuildingSystem } from './BuildingSystem';
import type { CollisionSystem } from './CollisionSystem';
import type {
  ChugHealReport,
  CombatActor,
  DuoRebootBridge,
  DuoReviveBridge,
  FireWeaponResult,
  FishingCastResult,
  NearbyGrindRailMatch,
  PlayerHudSnapshot,
  PlayerInteractPrompt,
  PlayerMatchStats,
  PlayerVehicleSnapshot,
  PropsInteractionBridge,
  SupplyDroneDamageResult,
  VaultBridge,
  VehicleBridge,
  WorldChapterBridge,
  WorldEconomyBridge,
  WorldFrontierBridge,
  WorldOverdriveBridge,
  WorldOverlordBridge,
  WorldRiftCaptureBridge,
  WorldSkyforgeBridge,
  WorldStationBridge,
  WorldTideBridge,
  WorldTraversalBridge,
} from './GameplayTypes';
import { InventorySystem, getItemMagCapacity } from './InventorySystem';
import { getWeaponModEffects, type WeaponSystem } from './WeaponSystem';

const BUILD_CYCLE: BuildPieceType[] = ['wall', 'floor', 'ramp', 'roof'];
const MAT_CYCLE: MaterialType[] = ['wood', 'brick', 'metal'];
const CROWN_GLINT_INTERVAL_SEC = 10.0;
const WEAPON_MOD_ORDER: readonly WeaponModId[] = [
  'red_dot',
  'suppressor',
  'drum_mag',
  'foregrip',
];
const STEALTH_FIRE_BREAK_SEC = 1.25;

export class PlayerController {
  private camera: THREE.PerspectiveCamera;
  private terrain: TerrainQuery;
  private collision: CollisionSystem;
  private building: BuildingSystem;
  private weapons: WeaponSystem;
  private propsBridge: PropsInteractionBridge;
  private traversalBridge: WorldTraversalBridge | null = null;
  private vehicleBridge: VehicleBridge | null = null;
  private vaultBridge: VaultBridge | null = null;
  private stationBridge: WorldStationBridge | null = null;
  private riftCaptureBridge: WorldRiftCaptureBridge | null = null;
  private economyBridge: WorldEconomyBridge | null = null;
  private chapterBridge: WorldChapterBridge | null = null;
  private overdriveBridge: WorldOverdriveBridge | null = null;
  private frontierBridge: WorldFrontierBridge | null = null;
  private skyforgeBridge: WorldSkyforgeBridge | null = null;
  private tideBridge: WorldTideBridge | null = null;
  private overlordBridge: WorldOverlordBridge | null = null;
  private duoReviveBridge: DuoReviveBridge | null = null;
  private duoRebootBridge: DuoRebootBridge | null = null;
  private augmentManager: AugmentManager;
  private onVaultUnlocked: ((lootPos: Vec3Like, poiId: string) => void) | null = null;
  private onWeaponUpgraded: ((item: ItemInstance, cost: number) => void) | null = null;
  private onCampfireLit: ((campfireId: string) => void) | null = null;
  private onPoiCaptured: ((poiName: string, lootPos?: Vec3Like) => void) | null = null;
  private onNpcHired: ((npc: NpcSpecialistEntity) => void) | null = null;
  private onLootIslandCaptured: ((lootPos?: Vec3Like) => void) | null = null;
  private onDroneDestroyed: ((res: SupplyDroneDamageResult) => void) | null = null;
  private onTrainChestHacked: ((lootPos: Vec3Like) => void) | null = null;
  private onFlareBurst: ((beacon: FlareBeaconEntity) => void) | null = null;
  private onBoarEliminated:
    | ((pos: Vec3Like, attackerId: string) => void)
    | null = null;
  private onFishingReward: ((result: FishingCastResult) => void) | null = null;
  private onTurretDeployed: ((turret: TurretEntity) => void) | null = null;
  private onChugHeal: ((report: ChugHealReport) => void) | null = null;
  private eventBus: EventBus;
  private settings: GameSettings;

  private goldBars = STARTING_GOLD_BARS;
  private kineticDashCharges = WEAPONS.kinetic_blade.dashCharges ?? 3;
  private kineticDashRechargeTimer = 0;
  private hammerCharges = WEAPONS.shockwave_hammer.hammerMaxCharges ?? 4;
  private hammerRechargeTimer = 0;
  private flareBeacons: Array<{
    id?: string;
    x: number;
    y?: number;
    z: number;
    radius: number;
    remainingSec: number;
    ownerId?: string;
  }> = [];
  private flareScanMarkedCount = 0;
  private lootIslandTickTimer = 0;
  private lootIslandUpdraftCooldown = 0;

  private medallions: MedallionId[] = [];
  private victoryCrown = false;
  private crownGlintTimer = CROWN_GLINT_INTERVAL_SEC;
  private isDrawingBow = false;
  private bowDrawElapsed = 0;
  private bowCharge = 0;
  private isChargingRailgun = false;
  private railgunChargeElapsed = 0;
  private railgunCharge = 0;
  private minigunSpinTimer = 0;
  private minigunHeat = 0;
  private minigunOverheated = false;
  private minigunOverheatTimer = 0;
  private traps: Record<TrapKind, number> = { spike_trap: 0, bouncer_pad: 0 };
  private activeTrapKind: TrapKind = 'spike_trap';
  private activeGrindRail: {
    rail: GrindRailEntity;
    t: number;
    dir: 1 | -1;
    railLength: number;
    isClosed: boolean;
  } | null = null;
  private grindRailCooldown = 0;
  private grindSparkTimer = 0;
  private isRebootingPartner = false;
  private rebootTimer = 0;
  private rebootTickSoundTimer = 0;
  private activeRebootVanId: string | null = null;
  private isKnocked = false;
  private bleedOutHp = 0;
  private isRevivingPartner = false;
  private reviveTimer = 0;
  private reviveTickSoundTimer = 0;
  private reviveLabel: string | null = null;
  private incomingReviveProgress: number | null = null;
  private incomingReviveLabel: string | null = null;
  private bunkerItemSeq = 0;
  private isStealthed = false;
  private currentBushId: string | null = null;
  private stealthBreakTimer = 0;
  private hasStormForecast = false;
  private jetpackFuel = JETPACK_MAX_FUEL;
  private isJetpackThrusting = false;
  private jetpackDryLock = false;
  private jetpackVfxTimer = 0;
  private lowGravityTimer = 0;
  private isHackingTrainChest = false;
  private trainHackProgress: number | null = null;
  private thermalVisionTimer = 0;
  private isFishing = false;
  private fishingTimer = 0;
  private fishingProgress: number | null = null;
  private activeFishingHoleId: string | null = null;
  private chugRegenTimers = new Map<string, number>();

  private gameMode: GameModeId = 'solo';
  private overshield = 0;
  private maxOvershield = 0;
  private lastDamageTime = -Infinity;
  private overshieldRecharging = false;
  private nearCampfireHealing = false;
  private campfireHealVfxTimer = 0;
  private playingElapsedSec = 0;
  private riftCooldown = 0;
  private captureStatus: {
    poiName: string;
    progress: number;
    captured: boolean;
    contested?: boolean;
  } | null = null;
  private captureCelebrationTimer = 0;
  private flagTickTimer = 0;
  private tacticalPing: {
    x: number;
    y: number;
    z: number;
    label: string;
    kind: 'move' | 'danger' | 'loot';
  } | null = null;
  private tacticalPingTimer = 0;
  private lastOverdriveApplied: {
    id: string;
    baseVx: number;
    baseVz: number;
    vx: number;
    vz: number;
  } | null = null;

  private activeZipline: { zip: ZiplineEntity; t: number; dir: 1 | -1 } | null = null;
  private ziplineCooldown = 0;
  private launchPadCooldown = 0;
  private activeVehicleId: string | null = null;
  private vehicleCooldown = 0;
  private vaultKeys = 0;

  private inventory = new InventorySystem();

  private phase: GamePhase = 'lobby';
  private playerName = 'Player';
  private position: Vec3Like = { x: 0, y: 20, z: 0 };
  private velocity: Vec3Like = { x: 0, y: 0, z: 0 };
  private yaw = Math.PI; // Facing North (-Z) initially
  private pitch = -0.1;
  private characterYaw = Math.PI;
  private grounded = true;

  private health = 100;
  private maxHealth = 100;
  private shield = 0;
  private maxShield = 100;
  private stamina = 100;
  private staminaRegenDelay = 0;

  private isSprinting = false;
  private isCrouching = false;
  private isSliding = false;
  private slideTimer = 0;
  private slideDir: { x: number; z: number } = { x: 0, z: -1 };
  private slideSpeed = 0;
  private slideDustTimer = 0;
  private slideSoundTimer = 0;
  private isMantling = false;
  private mantleTimer = 0;
  private mantleDuration = 0.28;
  private mantleStartPos: Vec3Like = { x: 0, y: 0, z: 0 };
  private mantleEndPos: Vec3Like = { x: 0, y: 0, z: 0 };
  private isSwimming = false;
  private fallPeakY = 0;
  private wasAirborne = false;
  private fallImmune = false;
  private lavaCooldown = 0;
  private ziplineSoundTimer = 0;
  private leanAngle = 0;
  private prevYaw = Math.PI;
  private isAiming = false;
  private isScoped = false;
  private isFiring = false;
  private isBuildMode = false;
  private activeBuildType: BuildPieceType = 'wall';
  private activeMaterial: MaterialType = 'wood';
  private buildRotation: 0 | 1 | 2 | 3 = 0;
  private lastBuildPreview: BuildPreviewState | null = null;

  private activeEmote: EmoteId | null = null;
  private selectedEmote: EmoteId = 'victory_groove';
  private isEmoting = false;

  private bloom = 0;
  private fireCooldown = 0;
  private buildCooldown = 0;
  private recoilKick = 0;
  private harvestSwingTimer = 0;
  private footstepTimer = 0;

  private reloadTimer = 0;
  private reloadDuration = 0;
  private reloadSlotIndex = -1;

  private healTimer = 0;
  private healDuration = 0;
  private healLabel: string | null = null;
  private slurpHotRemaining = 0;
  private slurpHotRate = 2.0;

  private currentFov: number;
  private moveSpeed = 0;
  private muzzleWorldPos: Vec3Like | null = null;
  private kills = 0;
  private killStreak = 0;
  private siphonFlashAt = 0;
  private pendingSiphonFromEvents = 0;
  private eliminatedTargetIds = new Set<string>();
  private canRepairBuild = false;
  private cameraShakeTimer = 0;
  private cameraShakeDuration = 0;
  private cameraShakeIntensity = 0;
  private elapsedTime = 0;
  private stats: PlayerMatchStats = {
    damageDealt: 0,
    shotsFired: 0,
    shotsHit: 0,
    headshots: 0,
    structuresBuilt: 0,
    chestsOpened: 0,
    poisCaptured: 0,
    goldEarned: 0,
    knocks: 0,
    revives: 0,
    reboots: 0,
    dronesShotDown: 0,
    trapsPlaced: 0,
    modsInstalled: 0,
    bunkersDeployed: 0,
    empHits: 0,
    trainChestsHacked: 0,
    hopCrystalsUsed: 0,
    flameDamage: 0,
    hammerSlams: 0,
    flaresFired: 0,
    boarsHunted: 0,
    mushroomsEaten: 0,
    turretsDeployed: 0,
    fishCaught: 0,
    chugHeals: 0,
  };

  private interactPrompt: PlayerInteractPrompt | null = null;
  private hitmarker: PlayerHudSnapshot['hitmarker'] = null;
  private damageDirection: PlayerHudSnapshot['damageDirection'] = null;

  private keysDown = new Set<string>();
  private leftMouseDown = false;
  private rightMouseDown = false;
  private isMouseDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private pointerLocked = false;
  private lastDraggedEditTile = -1;
  private lastBusPos: Vec3Like = { x: 0, y: 175, z: 0 };

  private boundDom: HTMLElement | null = null;
  private listenersAttached = false;
  private unsubHitmarker: (() => void) | null = null;
  private unsubDamage: (() => void) | null = null;
  private unsubCameraShake: (() => void) | null = null;

  private onKeyDownBound = (e: KeyboardEvent) => this.handleKeyDown(e);
  private onKeyUpBound = (e: KeyboardEvent) => this.handleKeyUp(e);
  private onMouseDownBound = (e: MouseEvent) => this.handleMouseDown(e);
  private onMouseUpBound = (e: MouseEvent) => this.handleMouseUp(e);
  private onMouseMoveBound = (e: MouseEvent) => this.handleMouseMove(e);
  private onWheelBound = (e: WheelEvent) => this.handleWheel(e);
  private onContextMenuBound = (e: MouseEvent) => e.preventDefault();
  private onPointerLockChangeBound = () => this.handlePointerLockChange();
  private onBlurBound = () => this.clearHeldInputs();

  constructor(
    camera: THREE.PerspectiveCamera,
    terrain: TerrainQuery,
    collision: CollisionSystem,
    building: BuildingSystem,
    weapons: WeaponSystem,
    propsBridge: PropsInteractionBridge,
    eventBus: EventBus,
    settings: GameSettings,
    options?: {
      vehicleBridge?: VehicleBridge | null;
      vaultBridge?: VaultBridge | null;
      stationBridge?: WorldStationBridge | null;
      riftCaptureBridge?: WorldRiftCaptureBridge | null;
      economyBridge?: WorldEconomyBridge | null;
      chapterBridge?: WorldChapterBridge | null;
      overdriveBridge?: WorldOverdriveBridge | null;
      frontierBridge?: WorldFrontierBridge | null;
      skyforgeBridge?: WorldSkyforgeBridge | null;
      tideBridge?: WorldTideBridge | null;
      overlordBridge?: WorldOverlordBridge | null;
      duoReviveBridge?: DuoReviveBridge | null;
      duoRebootBridge?: DuoRebootBridge | null;
      augmentManager?: AugmentManager | null;
      gameMode?: GameModeId;
      onVaultUnlocked?: ((lootPos: Vec3Like, poiId: string) => void) | null;
      onWeaponUpgraded?: ((item: ItemInstance, cost: number) => void) | null;
      onCampfireLit?: ((campfireId: string) => void) | null;
      onPoiCaptured?: ((poiName: string, lootPos?: Vec3Like) => void) | null;
      onNpcHired?: ((npc: NpcSpecialistEntity) => void) | null;
      onLootIslandCaptured?: ((lootPos?: Vec3Like) => void) | null;
      onDroneDestroyed?: ((res: SupplyDroneDamageResult) => void) | null;
      onTrainChestHacked?: ((lootPos: Vec3Like) => void) | null;
      onFlareBurst?: ((beacon: FlareBeaconEntity) => void) | null;
      onBoarEliminated?: ((pos: Vec3Like, attackerId: string) => void) | null;
      onFishingReward?: ((result: FishingCastResult) => void) | null;
      onTurretDeployed?: ((turret: TurretEntity) => void) | null;
      onChugHeal?: ((report: ChugHealReport) => void) | null;
    },
  ) {
    this.camera = camera;
    this.terrain = terrain;
    this.collision = collision;
    this.building = building;
    this.weapons = weapons;
    this.propsBridge = propsBridge;
    this.eventBus = eventBus;
    this.augmentManager = options?.augmentManager ?? new AugmentManager(eventBus);
    this.settings = {
      ...settings,
      keybinds: settings.keybinds ? { ...settings.keybinds } : undefined,
    };
    this.currentFov = settings.fov;

    if (options?.vehicleBridge !== undefined) {
      this.setVehicleBridge(options.vehicleBridge);
    }
    if (options?.vaultBridge !== undefined) {
      this.setVaultBridge(options.vaultBridge);
    }
    if (options?.stationBridge !== undefined) {
      this.setStationBridge(options.stationBridge);
    }
    if (options?.riftCaptureBridge !== undefined) {
      this.setRiftCaptureBridge(options.riftCaptureBridge);
    }
    if (options?.economyBridge !== undefined) {
      this.setEconomyBridge(options.economyBridge);
    }
    if (options?.chapterBridge !== undefined) {
      this.setChapterBridge(options.chapterBridge);
    }
    if (options?.overdriveBridge !== undefined) {
      this.setOverdriveBridge(options.overdriveBridge);
    }
    if (options?.frontierBridge !== undefined) {
      this.setFrontierBridge(options.frontierBridge);
    }
    if (options?.skyforgeBridge !== undefined) {
      this.setSkyforgeBridge(options.skyforgeBridge);
    }
    if (options?.tideBridge !== undefined) {
      this.setTideBridge(options.tideBridge);
    }
    if (options?.overlordBridge !== undefined) {
      this.setOverlordBridge(options.overlordBridge);
    }
    if (options?.duoReviveBridge !== undefined) {
      this.setDuoReviveBridge(options.duoReviveBridge);
    }
    if (options?.duoRebootBridge !== undefined) {
      this.setDuoRebootBridge(options.duoRebootBridge);
    }
    if (options?.gameMode !== undefined) {
      this.setGameMode(options.gameMode);
    }
    if (options?.onVaultUnlocked !== undefined) {
      this.setVaultUnlockHandler(options.onVaultUnlocked);
    }
    if (options?.onWeaponUpgraded !== undefined) {
      this.setOnWeaponUpgraded(options.onWeaponUpgraded);
    }
    if (options?.onCampfireLit !== undefined) {
      this.setOnCampfireLit(options.onCampfireLit);
    }
    if (options?.onPoiCaptured !== undefined) {
      this.setOnPoiCaptured(options.onPoiCaptured);
    }
    if (options?.onNpcHired !== undefined) {
      this.setOnNpcHired(options.onNpcHired);
    }
    if (options?.onLootIslandCaptured !== undefined) {
      this.setOnLootIslandCaptured(options.onLootIslandCaptured);
    }
    if (options?.onDroneDestroyed !== undefined) {
      this.setOnDroneDestroyed(options.onDroneDestroyed);
    }
    if (options?.onTrainChestHacked !== undefined) {
      this.setOnTrainChestHacked(options.onTrainChestHacked);
    }
    if (options?.onFlareBurst !== undefined) {
      this.setOnFlareBurst(options.onFlareBurst);
    }
    if (options?.onBoarEliminated !== undefined) {
      this.setOnBoarEliminated(options.onBoarEliminated);
    }
    if (options?.onFishingReward !== undefined) {
      this.setOnFishingReward(options.onFishingReward);
    }
    if (options?.onTurretDeployed !== undefined) {
      this.setOnTurretDeployed(options.onTurretDeployed);
    }
    if (options?.onChugHeal !== undefined) {
      this.setOnChugHeal(options.onChugHeal);
    }

    this.weapons.setPlayerTideObserver({
      onFlareBurst: (beacon) => {
        this.addFlareBeacon(beacon);
        this.onFlareBurst?.(beacon);
      },
      onBoarEliminated: (pos, attackerId) => {
        if (attackerId === 'player') {
          this.stats.boarsHunted = (this.stats.boarsHunted ?? 0) + 1;
        }
        this.onBoarEliminated?.(pos, attackerId);
      },
    });
    this.weapons.setPlayerOverlordObserver({
      onTurretDeployed: (turret) => {
        this.stats.turretsDeployed = (this.stats.turretsDeployed ?? 0) + 1;
        this.onTurretDeployed?.(turret);
      },
      onChugHeal: (report) => {
        if (report.actorsHealed > 0) {
          this.stats.chugHeals = (this.stats.chugHeals ?? 0) + report.actorsHealed;
        }
        this.onChugHeal?.(report);
      },
    });

    this.unsubHitmarker = this.eventBus.on('combat:hitmarker', (ev) => {
      if (ev.attackerId === 'player') {
        this.hitmarker = {
          timestamp: Date.now(),
          isHeadshot: ev.isHeadshot,
          isShield: ev.isShield,
          isElimination: ev.isElimination,
        };
      }
    });

    this.unsubDamage = this.eventBus.on('combat:damage', (ev) => {
      if (ev.attackerId === 'player' && ev.targetId !== 'player') {
        if (
          ev.weaponId === 'kinetic_blade' ||
          ev.weaponId === 'shockwave_hammer' ||
          ev.weaponId === 'flare_gun'
        ) {
          this.stats.damageDealt += ev.damage;
        }
        if (ev.isElimination && this.isAlive()) {
          if (!this.eliminatedTargetIds.has(ev.targetId)) {
            this.eliminatedTargetIds.add(ev.targetId);
            this.pendingSiphonFromEvents += 1;
            this.grantEliminationSiphon();
          }
        }
      }
    });

    this.unsubCameraShake = this.eventBus.on('vfx:camera_shake', (ev) => {
      if (ev.intensity > 0 && ev.duration > 0) {
        if (this.cameraShakeTimer <= 0 || ev.intensity >= this.cameraShakeIntensity) {
          this.cameraShakeIntensity = ev.intensity;
          this.cameraShakeDuration = ev.duration;
          this.cameraShakeTimer = ev.duration;
        } else {
          this.cameraShakeTimer = Math.max(this.cameraShakeTimer, ev.duration);
        }
      }
    });
  }

  setSettings(settings: GameSettings): void {
    this.settings = {
      ...settings,
      keybinds: settings.keybinds ? { ...settings.keybinds } : undefined,
    };
  }

  setTraversalBridge(bridge: WorldTraversalBridge): void {
    this.traversalBridge = bridge;
  }

  setVehicleBridge(bridge: VehicleBridge | null): void {
    const prev = this.vehicleBridge;
    this.vehicleBridge = bridge;
    if (bridge !== null) {
      this.weapons.setVehicleBridge(bridge);
    } else if (this.weapons.getVehicleBridge() === prev) {
      this.weapons.setVehicleBridge(null);
    }
  }

  setVaultBridge(bridge: VaultBridge | null): void {
    this.vaultBridge = bridge;
  }

  setStationBridge(bridge: WorldStationBridge | null): void {
    const prev = this.stationBridge;
    this.stationBridge = bridge;
    if (bridge !== null) {
      this.weapons.setStationBridge(bridge);
    } else if (this.weapons.getStationBridge() === prev) {
      this.weapons.setStationBridge(null);
    }
  }

  setRiftCaptureBridge(bridge: WorldRiftCaptureBridge | null): void {
    const prev = this.riftCaptureBridge;
    this.riftCaptureBridge = bridge;
    if (bridge !== null) {
      this.weapons.setRiftCaptureBridge(bridge);
    } else if (this.weapons.getRiftCaptureBridge() === prev) {
      this.weapons.setRiftCaptureBridge(null);
    }
  }

  setChapterBridge(bridge: WorldChapterBridge | null): void {
    const prev = this.chapterBridge;
    this.chapterBridge = bridge;
    if (bridge !== null) {
      this.weapons.setChapterBridge(bridge);
    } else if (this.weapons.getChapterBridge() === prev) {
      this.weapons.setChapterBridge(null);
    }
  }

  getChapterBridge(): WorldChapterBridge | null {
    return this.chapterBridge;
  }

  setOverdriveBridge(bridge: WorldOverdriveBridge | null): void {
    const prev = this.overdriveBridge;
    this.overdriveBridge = bridge;
    if (bridge !== null) {
      this.weapons.setOverdriveBridge(bridge);
    } else if (this.weapons.getOverdriveBridge() === prev) {
      this.weapons.setOverdriveBridge(null);
    }
  }

  getOverdriveBridge(): WorldOverdriveBridge | null {
    return this.overdriveBridge;
  }

  setFrontierBridge(bridge: WorldFrontierBridge | null): void {
    this.frontierBridge = bridge;
    if (!bridge) {
      this.isStealthed = false;
      this.currentBushId = null;
    }
  }

  getFrontierBridge(): WorldFrontierBridge | null {
    return this.frontierBridge;
  }

  setSkyforgeBridge(bridge: WorldSkyforgeBridge | null): void {
    this.skyforgeBridge = bridge;
    if (!bridge) {
      this.cancelTrainChestHack();
    }
  }

  getSkyforgeBridge(): WorldSkyforgeBridge | null {
    return this.skyforgeBridge;
  }

  setOnTrainChestHacked(cb: ((lootPos: Vec3Like) => void) | null): void {
    this.onTrainChestHacked = cb;
  }

  setTideBridge(bridge: WorldTideBridge | null): void {
    const prev = this.tideBridge;
    this.tideBridge = bridge;
    if (bridge !== null) {
      this.weapons.setTideBridge(bridge);
    } else if (this.weapons.getTideBridge() === prev) {
      this.weapons.setTideBridge(null);
    }
  }

  getTideBridge(): WorldTideBridge | null {
    return this.tideBridge;
  }

  setOnFlareBurst(cb: ((beacon: FlareBeaconEntity) => void) | null): void {
    this.onFlareBurst = cb;
  }

  setOnBoarEliminated(
    cb: ((pos: Vec3Like, attackerId: string) => void) | null,
  ): void {
    this.onBoarEliminated = cb;
  }

  setOverlordBridge(bridge: WorldOverlordBridge | null): void {
    this.overlordBridge = bridge;
    if (!bridge) {
      this.cancelFishingChannel();
    }
  }

  getOverlordBridge(): WorldOverlordBridge | null {
    return this.overlordBridge;
  }

  setOnFishingReward(cb: ((result: FishingCastResult) => void) | null): void {
    this.onFishingReward = cb;
  }

  setOnTurretDeployed(cb: ((turret: TurretEntity) => void) | null): void {
    this.onTurretDeployed = cb;
  }

  setOnChugHeal(cb: ((report: ChugHealReport) => void) | null): void {
    this.onChugHeal = cb;
  }

  setThermalVisionTimer(sec: number): void {
    if (!Number.isFinite(sec)) return;
    this.thermalVisionTimer = Math.max(0, sec);
  }

  setFlareScanStatus(
    beacons: ReadonlyArray<{
      id?: string;
      x: number;
      y?: number;
      z: number;
      radius: number;
      remainingSec: number;
      ownerId?: string;
    }>,
    markedCount: number,
  ): void {
    const next: typeof this.flareBeacons = [];
    if (Array.isArray(beacons)) {
      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i];
        if (
          !b ||
          !Number.isFinite(b.x) ||
          !Number.isFinite(b.z) ||
          !Number.isFinite(b.radius) ||
          !Number.isFinite(b.remainingSec) ||
          b.remainingSec <= 0
        ) {
          continue;
        }
        next.push({
          ...(b.id !== undefined ? { id: b.id } : {}),
          x: b.x,
          ...(b.y !== undefined ? { y: b.y } : {}),
          z: b.z,
          radius: Math.max(1, b.radius),
          remainingSec: b.remainingSec,
          ...(b.ownerId !== undefined ? { ownerId: b.ownerId } : {}),
        });
      }
    }
    this.flareBeacons = next;
    if (Number.isFinite(markedCount)) {
      this.flareScanMarkedCount = Math.max(0, Math.round(markedCount));
    }
  }

  addFlareBeacon(
    beacon:
      | FlareBeaconEntity
      | {
          id?: string;
          x: number;
          y?: number;
          z: number;
          radius: number;
          remainingSec: number;
          ownerId?: string;
        },
    markedCount?: number,
  ): void {
    if (
      !beacon ||
      !Number.isFinite(beacon.x) ||
      !Number.isFinite(beacon.z) ||
      !Number.isFinite(beacon.radius) ||
      !Number.isFinite(beacon.remainingSec) ||
      beacon.remainingSec <= 0
    ) {
      return;
    }
    const entry = {
      ...(beacon.id !== undefined ? { id: beacon.id } : {}),
      x: beacon.x,
      ...(beacon.y !== undefined ? { y: beacon.y } : {}),
      z: beacon.z,
      radius: Math.max(1, beacon.radius),
      remainingSec: beacon.remainingSec,
      ...(beacon.ownerId !== undefined ? { ownerId: beacon.ownerId } : {}),
    };
    if (entry.id) {
      const idx = this.flareBeacons.findIndex((b) => b.id === entry.id);
      if (idx !== -1) {
        this.flareBeacons[idx] = entry;
      } else {
        this.flareBeacons.push(entry);
      }
    } else {
      this.flareBeacons.push(entry);
    }
    if (markedCount !== undefined && Number.isFinite(markedCount)) {
      this.flareScanMarkedCount = Math.max(0, Math.round(markedCount));
    }
  }

  getFlareBeacons(): Array<{ x: number; z: number; radius: number; remainingSec: number }> {
    return this.flareBeacons.map((b) => ({
      x: b.x,
      z: b.z,
      radius: b.radius,
      remainingSec: b.remainingSec,
    }));
  }

  setLowGravityTimer(sec: number): void {
    if (!Number.isFinite(sec)) return;
    this.lowGravityTimer = Math.max(0, sec);
  }

  setJetpackFuel(fuel: number): void {
    if (!Number.isFinite(fuel)) return;
    this.jetpackFuel = clamp(fuel, 0, JETPACK_MAX_FUEL);
    if (this.jetpackFuel > 0) {
      this.jetpackDryLock = false;
    }
  }

  private isModdableFirearm(
    item: ItemInstance | null,
    slotIndex: number,
  ): item is ItemInstance {
    if (slotIndex < 1 || slotIndex > 5 || !item) return false;
    if (item.weaponId === 'pickaxe') return false;
    const def = WEAPONS[item.weaponId];
    if (
      !def ||
      def.isConsumable ||
      def.isThrowable ||
      def.isGrappler ||
      def.isKineticBlade ||
      def.isShockwaveHammer ||
      def.isJetpack ||
      def.isChugCannon
    ) {
      return false;
    }
    return true;
  }

  private getNextInstallableMod(item: ItemInstance): WeaponModId | null {
    const def = WEAPONS[item.weaponId];
    const installed = item.mods ?? [];
    for (let i = 0; i < WEAPON_MOD_ORDER.length; i++) {
      const candidate = WEAPON_MOD_ORDER[i];
      if (installed.includes(candidate)) continue;
      if (candidate === 'drum_mag' && (def.isMinigun || def.magSize <= 0)) {
        continue;
      }
      return candidate;
    }
    return null;
  }

  /**
   * Equips the specified or next unequipped mod (`red_dot`, `suppressor`, `drum_mag`, `foregrip`)
   * onto the active firearm for `WEAPON_MOD_COST_GOLD` (75 Gold).
   */
  installWeaponMod(modId?: WeaponModId, effectPos?: Vec3Like): boolean {
    if (!this.isAlive() || this.isKnocked) return false;
    const slotIndex = this.inventory.getActiveSlotIndex();
    const item = this.inventory.getActiveItem();
    if (!this.isModdableFirearm(item, slotIndex)) return false;

    const def = WEAPONS[item.weaponId];
    const installed = item.mods ? [...item.mods] : [];
    let targetMod: WeaponModId | null = null;

    if (modId !== undefined) {
      if (!WEAPON_MOD_ORDER.includes(modId)) return false;
      if (installed.includes(modId)) return false;
      if (modId === 'drum_mag' && (def.isMinigun || def.magSize <= 0)) {
        return false;
      }
      targetMod = modId;
    } else {
      targetMod = this.getNextInstallableMod(item);
      if (!targetMod) return false;
    }

    if (this.goldBars < WEAPON_MOD_COST_GOLD) {
      this.eventBus.emit('sound:play', {
        id: 'dryfire',
        position: { ...this.position },
        spatial: true,
      });
      return false;
    }

    this.goldBars = clamp(this.goldBars - WEAPON_MOD_COST_GOLD, 0, MAX_GOLD_BARS);
    item.mods = [...installed, targetMod];

    if (targetMod === 'drum_mag' && def.magSize > 0 && !def.isMinigun) {
      item.magAmmo = getItemMagCapacity(item);
      if (this.reloadTimer > 0 && this.reloadSlotIndex === slotIndex) {
        this.reloadTimer = 0;
        this.reloadDuration = 0;
        this.reloadSlotIndex = -1;
      }
    }

    this.stats.modsInstalled = (this.stats.modsInstalled ?? 0) + 1;
    const vfxPos = effectPos
      ? { ...effectPos }
      : {
          x: this.position.x,
          y: this.position.y + 1.0,
          z: this.position.z,
        };
    this.eventBus.emit('vfx:weapon_mod', {
      position: vfxPos,
      modId: targetMod,
    });
    this.eventBus.emit('sound:play', {
      id: 'mod_install',
      position: vfxPos,
      spatial: true,
    });
    return true;
  }

  unlockStormForecast(unlocked = true): void {
    this.hasStormForecast = Boolean(unlocked);
  }

  hasStormForecastUnlocked(): boolean {
    return this.hasStormForecast;
  }

  /**
   * Respawns the player in Team Rumble with 100 HP, 50 Shield, skydiving at `dropPos`,
   * preserving their existing weapons, ammo, and materials.
   */
  respawnInTeamRumble(dropPos: Vec3Like): boolean {
    const safeX = Number.isFinite(dropPos.x) ? clamp(dropPos.x, -390, 390) : 0;
    const safeZ = Number.isFinite(dropPos.z) ? clamp(dropPos.z, -390, 390) : 0;
    const terrainY = this.terrain.getHeightAt(safeX, safeZ);
    const safeY = Number.isFinite(dropPos.y)
      ? dropPos.y
      : Math.max(terrainY + 55, 85);

    if (this.activeVehicleId) {
      this.exitActiveVehicle(false);
    }
    this.activeZipline = null;
    this.activeGrindRail = null;
    this.isBuildMode = false;
    this.building.setPreviewVisible(false);
    this.building.cancelEdit();
    this.lastBuildPreview = null;
    this.cancelActionsOnModeChange();
    this.cancelPartnerRevive();
    this.cancelPartnerReboot();
    this.cancelTrainChestHack();
    this.cancelFishingChannel();
    this.isJetpackThrusting = false;
    this.clearHeldInputs();
    this.weapons.clearActorBurn('player');

    this.health = 100;
    this.maxHealth = 100;
    this.shield = 50;
    this.maxShield = 100;
    this.overshield = 0;
    this.overshieldRecharging = false;
    this.isKnocked = false;
    this.bleedOutHp = 0;
    this.incomingReviveProgress = null;
    this.incomingReviveLabel = null;
    this.isStealthed = false;
    this.currentBushId = null;
    this.stealthBreakTimer = 0;
    this.slurpHotRemaining = 0;
    this.nearCampfireHealing = false;
    this.campfireHealVfxTimer = 0;
    this.killStreak = 0;
    this.minigunHeat = 0;
    this.minigunOverheated = false;
    this.minigunOverheatTimer = 0;
    this.jetpackFuel = JETPACK_MAX_FUEL;
    this.isJetpackThrusting = false;
    this.jetpackDryLock = false;
    this.jetpackVfxTimer = 0;
    this.lowGravityTimer = 0;
    this.thermalVisionTimer = 0;
    this.hammerCharges = WEAPONS.shockwave_hammer.hammerMaxCharges ?? 4;
    this.hammerRechargeTimer = 0;
    this.isSliding = false;
    this.isCrouching = false;
    this.isStealthed = false;
    this.isMantling = false;
    this.isSwimming = false;
    this.interactPrompt = null;

    this.phase = 'skydiving';
    this.position = { x: safeX, y: safeY, z: safeZ };
    this.velocity = {
      x: Math.sin(this.yaw) * 10,
      y: -10,
      z: Math.cos(this.yaw) * 10,
    };
    this.grounded = false;
    this.wasAirborne = true;
    this.fallPeakY = safeY;
    this.fallImmune = false;

    this.eventBus.emit('sound:play', {
      id: 'rumble_respawn',
      position: { ...this.position },
      spatial: false,
    });
    return true;
  }

  setDuoReviveBridge(bridge: DuoReviveBridge | null): void {
    this.duoReviveBridge = bridge;
  }

  getDuoReviveBridge(): DuoReviveBridge | null {
    return this.duoReviveBridge;
  }

  setDuoRebootBridge(bridge: DuoRebootBridge | null): void {
    this.duoRebootBridge = bridge;
  }

  getDuoRebootBridge(): DuoRebootBridge | null {
    return this.duoRebootBridge;
  }

  setOnDroneDestroyed(
    cb: ((res: SupplyDroneDamageResult) => void) | null,
  ): void {
    this.onDroneDestroyed = cb;
  }

  addTrap(kind: TrapKind, count = 1): number {
    const add = Math.max(0, Math.floor(count));
    this.traps[kind] = clamp((this.traps[kind] ?? 0) + add, 0, 99);
    return this.traps[kind];
  }

  getTraps(): Record<TrapKind, number> {
    return { ...this.traps };
  }

  setActiveTrapKind(kind: TrapKind): void {
    this.activeTrapKind = kind;
  }

  getActiveTrapKind(): TrapKind {
    return this.activeTrapKind;
  }

  cycleTrapKind(): TrapKind {
    this.activeTrapKind =
      this.activeTrapKind === 'spike_trap' ? 'bouncer_pad' : 'spike_trap';
    this.eventBus.emit('sound:play', { id: 'ui_click', volume: 0.35 });
    return this.activeTrapKind;
  }

  placeActiveTrap(): TrapEntity | null {
    if (
      this.phase !== 'playing' ||
      !this.isAlive() ||
      this.isKnocked ||
      this.activeVehicleId !== null ||
      this.activeGrindRail !== null ||
      this.activeZipline !== null
    ) {
      return null;
    }

    if ((this.traps[this.activeTrapKind] ?? 0) <= 0) {
      const alt: TrapKind =
        this.activeTrapKind === 'spike_trap' ? 'bouncer_pad' : 'spike_trap';
      if ((this.traps[alt] ?? 0) > 0) {
        this.activeTrapKind = alt;
      } else {
        this.eventBus.emit('sound:play', {
          id: 'dryfire',
          position: { ...this.position },
          spatial: true,
        });
        return null;
      }
    }

    const lookDir = this.getLookDirection();
    const horizLen = Math.hypot(lookDir.x, lookDir.z);
    const fx = horizLen > 0.05 ? lookDir.x / horizLen : Math.sin(this.yaw);
    const fz = horizLen > 0.05 ? lookDir.z / horizLen : Math.cos(this.yaw);

    let tx = 0;
    let ty = 0;
    let tz = 0;
    let snappedToFloor = false;

    const eye = this.getEyePosition();
    const buildHit = this.collision.raycastWorld(eye, lookDir, 4.8, {
      checkBuilds: true,
      checkProps: false,
    });
    if (buildHit.hit && buildHit.targetType === 'build' && buildHit.targetId) {
      const piece = this.building.getPieceById(buildHit.targetId);
      if (piece && piece.type === 'floor') {
        tx = (piece.gx + 0.5) * GRID_XZ;
        ty = piece.gy * GRID_Y + 0.02;
        tz = (piece.gz + 0.5) * GRID_XZ;
        snappedToFloor = true;
      }
    }

    if (!snappedToFloor) {
      const reach =
        lookDir.y < -0.35 ? clamp(1.8 / -lookDir.y, 0.5, 3.2) : 2.2;
      tx = clamp(this.position.x + fx * reach, -388, 388);
      tz = clamp(this.position.z + fz * reach, -388, 388);

      const gx = Math.floor(tx / GRID_XZ);
      const gz = Math.floor(tz / GRID_XZ);
      const pieces = this.building.getPieces();
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        if (
          p.type === 'floor' &&
          p.hp > 0 &&
          p.gx === gx &&
          p.gz === gz &&
          Math.abs(p.gy * GRID_Y - this.position.y) <= 2.2
        ) {
          tx = (gx + 0.5) * GRID_XZ;
          ty = p.gy * GRID_Y + 0.02;
          tz = (gz + 0.5) * GRID_XZ;
          snappedToFloor = true;
          break;
        }
      }

      if (!snappedToFloor) {
        ty = this.collision.getFloorHeightAt(tx, tz, this.position.y + 1.2, 1.5);
      }
    }

    const squadId =
      this.gameMode === 'duos'
        ? 'player_squad'
        : this.gameMode === 'team_rumble'
          ? 'team_blue'
          : undefined;
    const placed = this.building.placeTrap(
      this.activeTrapKind,
      'player',
      { x: tx, y: ty, z: tz },
      this.yaw,
      squadId,
    );
    if (!placed) return null;

    this.traps[this.activeTrapKind] = Math.max(
      0,
      this.traps[this.activeTrapKind] - 1,
    );
    this.stats.trapsPlaced = (this.stats.trapsPlaced ?? 0) + 1;
    this.eventBus.emit('sound:play', {
      id: 'build_metal',
      position: { x: tx, y: ty, z: tz },
      spatial: true,
    });
    return placed;
  }

  addMedallion(id: MedallionId): boolean {
    if (this.medallions.includes(id)) return false;
    this.medallions.push(id);
    this.eventBus.emit('sound:play', {
      id: 'medallion_pickup',
      position: { ...this.position },
      spatial: true,
    });
    return true;
  }

  getMedallions(): MedallionId[] {
    return [...this.medallions];
  }

  hasMedallion(id: MedallionId): boolean {
    return this.medallions.includes(id);
  }

  setVictoryCrown(active: boolean): void {
    const next = Boolean(active);
    const turnedOn = next && !this.victoryCrown;
    this.victoryCrown = next;
    if (turnedOn) {
      this.crownGlintTimer = CROWN_GLINT_INTERVAL_SEC;
    }
  }

  hasVictoryCrown(): boolean {
    return this.victoryCrown;
  }

  enterKnockedState(): boolean {
    if (this.phase === 'eliminated' || this.phase === 'lobby' || this.isKnocked) {
      return false;
    }
    if (this.activeVehicleId) {
      this.exitActiveVehicle(false);
    }
    this.activeZipline = null;
    this.activeGrindRail = null;
    this.isBuildMode = false;
    this.building.setPreviewVisible(false);
    this.building.cancelEdit();
    this.lastBuildPreview = null;
    this.cancelActionsOnModeChange();
    this.cancelPartnerRevive();
    this.cancelPartnerReboot();
    this.cancelTrainChestHack();
    this.cancelFishingChannel();
    this.isJetpackThrusting = false;
    this.isAiming = false;
    this.isScoped = false;
    this.isSprinting = false;
    this.isSliding = false;
    this.isCrouching = false;
    this.isStealthed = false;
    this.isMantling = false;
    this.isKnocked = true;
    this.bleedOutHp = DBNO_MAX_HP;
    this.overshield = 0;
    this.overshieldRecharging = false;
    this.shield = 0;
    this.health = Math.max(1, Math.min(this.health, 30));
    this.eventBus.emit('sound:play', {
      id: 'knocked_down',
      position: { ...this.position },
      spatial: true,
    });
    return true;
  }

  completeRevive(): boolean {
    if (!this.isKnocked || !this.isAlive()) return false;
    this.isKnocked = false;
    this.bleedOutHp = 0;
    this.incomingReviveProgress = null;
    this.incomingReviveLabel = null;
    this.health = 30;
    this.shield = 0;
    this.eventBus.emit('sound:play', {
      id: 'revive_complete',
      position: { ...this.position },
      spatial: true,
    });
    this.eventBus.emit('vfx:revive_beam', {
      position: { ...this.position },
      progress: 1,
    });
    return true;
  }

  isPlayerKnocked(): boolean {
    return this.isKnocked;
  }

  addKnock(): void {
    this.stats.knocks = (this.stats.knocks ?? 0) + 1;
  }

  setIncomingReviveProgress(progress: number | null, label?: string | null): void {
    this.incomingReviveProgress =
      progress === null ? null : clamp(progress, 0, 1);
    this.incomingReviveLabel =
      progress === null ? null : label ?? 'BEING REVIVED...';
  }

  setAugmentManager(mgr: AugmentManager | null): void {
    this.augmentManager = mgr ?? new AugmentManager(this.eventBus);
  }

  getAugmentManager(): AugmentManager {
    return this.augmentManager;
  }

  selectAugmentChoice(index: 0 | 1): AugmentId | null {
    return this.augmentManager.selectChoice(index, { ...this.position });
  }

  setVaultUnlockHandler(
    handler: ((lootPos: Vec3Like, poiId: string) => void) | null,
  ): void {
    this.onVaultUnlocked = handler;
  }

  setOnWeaponUpgraded(
    cb: ((item: ItemInstance, cost: number) => void) | null,
  ): void {
    this.onWeaponUpgraded = cb;
  }

  setOnCampfireLit(cb: ((campfireId: string) => void) | null): void {
    this.onCampfireLit = cb;
  }

  setOnPoiCaptured(
    cb: ((poiName: string, lootPos?: Vec3Like) => void) | null,
  ): void {
    this.onPoiCaptured = cb;
  }

  setEconomyBridge(bridge: WorldEconomyBridge | null): void {
    this.economyBridge = bridge;
  }

  setGoldBars(amount: number): void {
    if (!Number.isFinite(amount)) return;
    this.goldBars = clamp(Math.round(amount), 0, MAX_GOLD_BARS);
  }

  addGoldBars(delta: number, burstPos?: Vec3Like): number {
    if (!Number.isFinite(delta)) return this.goldBars;
    const intDelta = Math.round(delta);
    this.goldBars = clamp(this.goldBars + intDelta, 0, MAX_GOLD_BARS);
    if (intDelta > 0) {
      this.stats.goldEarned = (this.stats.goldEarned ?? 0) + intDelta;
      this.eventBus.emit('sound:play', {
        id: 'gold_pickup',
        ...(burstPos ? { position: { ...burstPos }, spatial: true } : {}),
      });
      if (burstPos) {
        this.eventBus.emit('vfx:gold_burst', {
          position: { ...burstPos },
          amount: intDelta,
        });
      }
    }
    return this.goldBars;
  }

  getGoldBars(): number {
    return this.goldBars;
  }

  setOnNpcHired(cb: ((npc: NpcSpecialistEntity) => void) | null): void {
    this.onNpcHired = cb;
  }

  setOnLootIslandCaptured(cb: ((lootPos?: Vec3Like) => void) | null): void {
    this.onLootIslandCaptured = cb;
  }

  placeTacticalPing(forcePos?: Vec3Like): {
    x: number;
    y: number;
    z: number;
    label: string;
    kind: 'move' | 'danger' | 'loot';
    distance: number;
  } | null {
    if (!this.isAlive() || (this.phase !== 'playing' && !forcePos)) {
      return null;
    }

    let pingPos: Vec3Like;
    let directEnemyHit = false;

    if (forcePos) {
      pingPos = { x: forcePos.x, y: forcePos.y, z: forcePos.z };
    } else {
      const eye = this.getEyePosition();
      const lookDir = this.getLookDirection();
      const props = this.propsBridge.getProps();
      const worldHit = this.collision.raycastWorld(eye, lookDir, 220, {
        checkBuilds: true,
        checkProps: true,
        props,
      });
      const maxCheckDist = worldHit.hit ? worldHit.distance : 220;

      // Check alive enemy actors along the aim ray
      const actors = this.weapons.getActors();
      let bestActorDist = maxCheckDist;
      let hitEnemyPos: Vec3Like | null = null;
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i];
        if (!actor.alive || actor.id === 'player') continue;
        const cy = actor.position.y + actor.height * 0.52;
        const r = Math.max(0.65, actor.radius * 1.6);
        const ox = eye.x - actor.position.x;
        const oy = eye.y - cy;
        const oz = eye.z - actor.position.z;
        const b = ox * lookDir.x + oy * lookDir.y + oz * lookDir.z;
        const c = ox * ox + oy * oy + oz * oz - r * r;
        const disc = b * b - c;
        if (disc >= 0) {
          const t = -b - Math.sqrt(disc);
          if (t >= 0 && t < bestActorDist) {
            bestActorDist = t;
            hitEnemyPos = {
              x: actor.position.x,
              y: actor.position.y + actor.height * 0.8,
              z: actor.position.z,
            };
          }
        }
      }

      if (hitEnemyPos) {
        pingPos = hitEnemyPos;
        directEnemyHit = true;
      } else if (worldHit.hit) {
        pingPos = { ...worldHit.point };
      } else {
        const ex = clamp(eye.x + lookDir.x * 220, -395, 395);
        const ez = clamp(eye.z + lookDir.z * 220, -395, 395);
        const ty = this.terrain.getHeightAt(ex, ez);
        pingPos = { x: ex, y: Math.max(eye.y + lookDir.y * 220, ty), z: ez };
      }
    }

    let kind: 'move' | 'danger' | 'loot' = 'move';
    let label = 'MOVE';

    if (directEnemyHit) {
      kind = 'danger';
      label = 'DANGER';
    } else {
      const actors = this.weapons.getActors();
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i];
        if (!actor.alive || actor.id === 'player') continue;
        const center = {
          x: actor.position.x,
          y: actor.position.y + actor.height * 0.5,
          z: actor.position.z,
        };
        if (
          dist3D(pingPos, actor.position) <= 5.5 ||
          dist3D(pingPos, center) <= 5.5
        ) {
          kind = 'danger';
          label = 'DANGER';
          break;
        }
      }
    }

    if (kind === 'move') {
      const vaults = this.vaultBridge?.getVaults() ?? [];
      for (let i = 0; i < vaults.length; i++) {
        const v = vaults[i];
        if (!v.unlocked && dist3D(pingPos, { x: v.x, y: v.y, z: v.z }) <= 5.5) {
          kind = 'loot';
          label = 'VAULT';
          break;
        }
      }
    }

    if (kind === 'move') {
      const chests = this.propsBridge.getChests();
      for (let i = 0; i < chests.length; i++) {
        const c = chests[i];
        if (!c.opened && dist3D(pingPos, { x: c.x, y: c.y, z: c.z }) <= 4.5) {
          kind = 'loot';
          label = 'CHEST';
          break;
        }
      }
    }

    if (kind === 'move') {
      const llamas = this.propsBridge.getLlamas?.() ?? [];
      for (let i = 0; i < llamas.length; i++) {
        const l = llamas[i];
        if (!l.opened && dist3D(pingPos, { x: l.x, y: l.y, z: l.z }) <= 4.5) {
          kind = 'loot';
          label = 'LLAMA';
          break;
        }
      }
    }

    if (kind === 'move') {
      const supplyDrops = this.propsBridge.getSupplyDrops();
      for (let i = 0; i < supplyDrops.length; i++) {
        const sd = supplyDrops[i];
        if (
          sd.state !== 'opened' &&
          dist3D(pingPos, { x: sd.x, y: sd.y, z: sd.z }) <= 5.0
        ) {
          kind = 'loot';
          label = 'SUPPLY DROP';
          break;
        }
      }
    }

    if (kind === 'move') {
      const drops = this.propsBridge.getLootDrops();
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (d.item && dist3D(pingPos, { x: d.x, y: d.y, z: d.z }) <= 3.5) {
          kind = 'loot';
          label = 'LOOT';
          break;
        }
      }
    }

    this.tacticalPing = {
      x: pingPos.x,
      y: pingPos.y,
      z: pingPos.z,
      kind,
      label,
    };
    this.tacticalPingTimer = 16.0;

    this.eventBus.emit('sound:play', {
      id: 'tactical_ping',
      position: { ...pingPos },
      spatial: false,
    });
    this.eventBus.emit('vfx:tactical_ping', {
      position: { ...pingPos },
      kind,
      label,
    });

    return {
      ...this.tacticalPing,
      distance: Math.round(dist3D(this.position, pingPos)),
    };
  }

  setGameMode(mode: GameModeId): void {
    const prevMode = this.gameMode;
    this.gameMode = mode;
    if (
      this.playingElapsedSec === 0 &&
      this.augmentManager.getActiveAugments().length === 0 &&
      !this.augmentManager.getPendingChoices()
    ) {
      this.augmentManager.reset(4201, mode);
    }
    if (mode === 'zero_build') {
      this.maxOvershield = 50;
      this.overshield = 50;
      this.lastDamageTime = -Infinity;
      this.overshieldRecharging = false;
      this.isBuildMode = false;
      this.lastBuildPreview = null;
      this.building.setPreviewVisible(false);
      this.building.cancelEdit();
    } else {
      this.maxOvershield = 0;
      this.overshield = 0;
      this.overshieldRecharging = false;
      if (mode === 'blitz' && this.inventory.getTotalMaterials() === 0) {
        this.inventory.addMaterial('wood', 150);
        this.inventory.addMaterial('brick', 100);
        this.inventory.addMaterial('metal', 100);
      } else if (prevMode === 'blitz' && mode === 'solo' && this.phase === 'bus') {
        const mats = this.inventory.getMaterials();
        if (mats.wood === 150 && mats.brick === 100 && mats.metal === 100) {
          this.inventory.spendMaterial('wood', 150);
          this.inventory.spendMaterial('brick', 100);
          this.inventory.spendMaterial('metal', 100);
        }
      }
    }
  }

  getGameMode(): GameModeId {
    return this.gameMode;
  }

  getOvershield(): number {
    return this.overshield;
  }

  getMaxOvershield(): number {
    return this.maxOvershield;
  }

  isNearCampfireHealing(): boolean {
    return this.nearCampfireHealing;
  }

  getInteractPrompt(): PlayerInteractPrompt | null {
    return this.interactPrompt;
  }

  addVaultKey(count = 1): number {
    const add = Math.max(0, Math.floor(count));
    this.vaultKeys += add;
    return this.vaultKeys;
  }

  getVaultKeys(): number {
    return this.vaultKeys;
  }

  getActiveVehicleId(): string | null {
    return this.activeVehicleId;
  }

  setPlayerName(name: string): void {
    this.playerName = name;
  }

  setSelectedEmote(emoteId: EmoteId): void {
    this.selectedEmote = emoteId;
  }

  setMuzzleWorldPosition(pos: Vec3Like): void {
    this.muzzleWorldPos = { x: pos.x, y: pos.y, z: pos.z };
  }

  getInventory(): InventorySystem {
    return this.inventory;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  setPhase(phase: GamePhase): void {
    this.phase = phase;
    if (phase !== 'playing') {
      if (this.activeVehicleId) {
        this.exitActiveVehicle(false);
      }
      this.activeZipline = null;
      this.activeGrindRail = null;
      this.isSliding = false;
      this.isMantling = false;
      this.isSwimming = false;
      this.isStealthed = false;
      this.currentBushId = null;
      this.nearCampfireHealing = false;
      this.campfireHealVfxTimer = 0;
      this.overshieldRecharging = false;
      this.captureStatus = null;
      this.captureCelebrationTimer = 0;
      this.flagTickTimer = 0;
      this.lootIslandTickTimer = 0;
      this.lootIslandUpdraftCooldown = 0;
      this.isDrawingBow = false;
      this.bowDrawElapsed = 0;
      this.bowCharge = 0;
      this.isChargingRailgun = false;
      this.railgunChargeElapsed = 0;
      this.railgunCharge = 0;
      this.minigunSpinTimer = 0;
      this.cancelPartnerRevive();
      this.cancelPartnerReboot();
      this.cancelTrainChestHack();
      this.cancelFishingChannel();
      this.isJetpackThrusting = false;
    }
    if (phase === 'victory' || phase === 'eliminated' || phase === 'lobby') {
      this.building.setPreviewVisible(false);
      this.building.cancelEdit();
      this.isBuildMode = false;
      this.clearHeldInputs();
    }
  }

  getPosition(): Vec3Like {
    return { ...this.position };
  }

  getEyePosition(): Vec3Like {
    const h =
      this.isCrouching || this.isSliding || this.isKnocked
        ? PLAYER_CROUCH_HEIGHT - 0.16
        : PLAYER_HEIGHT - 0.22;
    return {
      x: this.position.x,
      y: this.position.y + h,
      z: this.position.z,
    };
  }

  getYaw(): number {
    return this.yaw;
  }

  getPitch(): number {
    return this.pitch;
  }

  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.prevYaw = yaw;
    this.pitch = clamp(pitch, -1.28, 1.32);
  }

  getHealth(): number {
    return this.health;
  }

  getShield(): number {
    return this.shield;
  }

  getStamina(): number {
    return this.stamina;
  }

  isFallImmune(): boolean {
    return this.fallImmune;
  }

  isAlive(): boolean {
    return (
      (this.health > 0 || this.isKnocked) &&
      this.phase !== 'eliminated' &&
      this.phase !== 'lobby'
    );
  }

  getKills(): number {
    return this.kills;
  }

  getKillStreak(): number {
    return this.killStreak;
  }

  private grantEliminationSiphon(): void {
    this.killStreak += 1;
    const baseSiphon = this.augmentManager.hasAugment('siphon_master') ? 75 : 50;
    const medallionBonus = this.hasMedallion('medallion_siphon') ? 25 : 0;
    const siphonTotal = baseSiphon + medallionBonus;
    const healthNeeded = Math.max(0, this.maxHealth - this.health);
    const healthAdded = Math.min(siphonTotal, healthNeeded);
    this.health += healthAdded;
    const leftover = siphonTotal - healthAdded;
    const shieldNeeded = Math.max(0, this.maxShield - this.shield);
    const shieldAdded = Math.min(leftover, shieldNeeded);
    this.shield += shieldAdded;
    this.siphonFlashAt = Date.now();

    this.eventBus.emit('combat:siphon', {
      amount: healthAdded + shieldAdded,
      healthAdded,
      shieldAdded,
    });

    if (this.killStreak >= 2) {
      this.eventBus.emit('sound:play', { id: 'kill_streak' });
    }
  }

  addKill(): void {
    this.kills += 1;
    if (this.pendingSiphonFromEvents > 0) {
      this.pendingSiphonFromEvents -= 1;
    } else if (this.isAlive()) {
      this.grantEliminationSiphon();
    }
  }

  applySplashHeal(amount: number): void {
    if (!this.isAlive() || amount <= 0) return;
    const hpAdd = Math.min(amount, Math.max(0, this.maxHealth - this.health));
    this.health += hpAdd;
    const rem = amount - hpAdd;
    if (rem > 0) {
      this.shield = Math.min(this.maxShield, this.shield + rem);
    }
  }

  applyExternalImpulse(impulse: Vec3Like, grantFallImmunity = false): void {
    if (!this.isAlive() || this.phase === 'lobby' || this.phase === 'bus') return;
    if (this.activeZipline) {
      this.activeZipline = null;
      this.ziplineCooldown = 0.5;
    }
    if (this.activeGrindRail) {
      this.activeGrindRail = null;
      this.grindRailCooldown = 0.5;
    }
    this.cancelPartnerReboot();
    this.isMantling = false;
    this.isSliding = false;
    this.isCrouching = false;
    this.isEmoting = false;
    this.activeEmote = null;
    this.healTimer = 0;
    this.healLabel = null;
    this.grounded = false;
    this.wasAirborne = true;
    this.fallPeakY = this.position.y;
    if (grantFallImmunity) {
      this.fallImmune = true;
    }
    this.velocity.x += impulse.x;
    this.velocity.y = Math.max(this.velocity.y, 0) + impulse.y;
    this.velocity.z += impulse.z;
  }

  getStats(): PlayerMatchStats {
    return { ...this.stats };
  }

  getActiveBuildPreview(): BuildPreviewState | null {
    return this.lastBuildPreview;
  }

  getCombatActor(): CombatActor {
    const h =
      this.isCrouching || this.isSliding || this.isKnocked
        ? PLAYER_CROUCH_HEIGHT
        : PLAYER_HEIGHT;
    return {
      id: 'player',
      name: this.playerName,
      position: { ...this.position },
      eyePos: this.getEyePosition(),
      hp: this.health,
      shield: this.shield,
      overshield: this.overshield,
      maxHp: this.maxHealth,
      maxShield: this.maxShield,
      maxOvershield: this.maxOvershield,
      radius: PLAYER_RADIUS,
      height: h,
      alive: this.isAlive(),
      hasDemolisher: this.augmentManager.hasAugment('demolisher'),
      hasFirstAssault: this.augmentManager.hasAugment('first_assault'),
      hasCombatMedallion: this.hasMedallion('medallion_combat'),
      isKnocked: this.isKnocked,
      squadId:
        this.gameMode === 'duos'
          ? 'player_squad'
          : this.gameMode === 'team_rumble'
            ? 'team_blue'
            : undefined,
      teamId: this.gameMode === 'team_rumble' ? 'team_blue' : undefined,
      onDamage: (ev) => this.applyDamage(ev),
      onHeal: (hpAdded, shieldAdded) => {
        if (!this.isAlive() || this.isKnocked) return;
        if (hpAdded > 0) {
          this.health = Math.min(this.maxHealth, this.health + hpAdded);
        }
        if (shieldAdded > 0) {
          this.shield = Math.min(this.maxShield, this.shield + shieldAdded);
        }
      },
      onImpulse: (impulse, grantFallImmunity) =>
        this.applyExternalImpulse(impulse, grantFallImmunity),
      onFlameDamage: (damage) => {
        if (damage > 0) {
          this.stats.flameDamage = (this.stats.flameDamage ?? 0) + damage;
          this.stats.damageDealt += damage;
        }
      },
    };
  }

  resetForMatch(
    busStartPos: Vec3Like,
    playerName?: string,
    gameMode?: GameModeId,
    seed = 4201,
  ): void {
    if (playerName) this.playerName = playerName;
    if (gameMode !== undefined) this.gameMode = gameMode;
    this.augmentManager.reset(seed, this.gameMode);
    this.inventory.reset();
    this.building.cancelEdit();
    this.building.setPreviewVisible(false);
    this.clearHeldInputs();

    this.phase = 'bus';
    this.lastBusPos = { ...busStartPos };
    this.position = { ...busStartPos };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = Math.PI;
    this.prevYaw = Math.PI;
    this.pitch = -0.22;
    this.characterYaw = Math.PI;
    this.grounded = false;

    this.health = 100;
    this.maxHealth = 100;
    this.shield = 0;
    this.maxShield = 100;
    if (this.gameMode === 'zero_build') {
      this.maxOvershield = 50;
      this.overshield = 50;
    } else {
      this.maxOvershield = 0;
      this.overshield = 0;
    }
    this.lastDamageTime = -Infinity;
    this.overshieldRecharging = false;
    this.nearCampfireHealing = false;
    this.campfireHealVfxTimer = 0;
    if (this.gameMode === 'blitz') {
      this.inventory.addMaterial('wood', 150);
      this.inventory.addMaterial('brick', 100);
      this.inventory.addMaterial('metal', 100);
    }
    this.stamina = 100;
    this.staminaRegenDelay = 0;

    this.isSprinting = false;
    this.isCrouching = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideDir = { x: 0, z: -1 };
    this.slideSpeed = 0;
    this.slideDustTimer = 0;
    this.slideSoundTimer = 0;
    this.isMantling = false;
    this.mantleTimer = 0;
    this.isSwimming = false;
    this.fallPeakY = busStartPos.y;
    this.wasAirborne = false;
    this.fallImmune = false;
    this.lavaCooldown = 0;
    this.ziplineSoundTimer = 0;
    this.leanAngle = 0;
    this.isAiming = false;
    this.isScoped = false;
    this.isFiring = false;
    this.isBuildMode = false;
    this.activeBuildType = 'wall';
    this.activeMaterial = 'wood';
    this.buildRotation = 0;
    this.lastBuildPreview = null;

    this.isEmoting = false;
    this.activeEmote = null;
    this.bloom = 0;
    this.fireCooldown = 0;
    this.buildCooldown = 0;
    this.recoilKick = 0;
    this.harvestSwingTimer = 0;
    this.reloadTimer = 0;
    this.reloadDuration = 0;
    this.reloadSlotIndex = -1;
    this.healTimer = 0;
    this.healDuration = 0;
    this.healLabel = null;
    this.slurpHotRemaining = 0;
    this.activeZipline = null;
    this.ziplineCooldown = 0;
    this.launchPadCooldown = 0;
    this.activeVehicleId = null;
    this.vehicleCooldown = 0;
    this.vaultKeys = 0;

    this.kills = 0;
    this.killStreak = 0;
    this.siphonFlashAt = 0;
    this.pendingSiphonFromEvents = 0;
    this.eliminatedTargetIds.clear();
    this.canRepairBuild = false;
    this.cameraShakeTimer = 0;
    this.cameraShakeDuration = 0;
    this.cameraShakeIntensity = 0;
    this.elapsedTime = 0;
    this.playingElapsedSec = 0;
    this.riftCooldown = 0;
    this.captureStatus = null;
    this.captureCelebrationTimer = 0;
    this.flagTickTimer = 0;
    this.tacticalPing = null;
    this.tacticalPingTimer = 0;
    this.lastOverdriveApplied = null;
    this.goldBars = STARTING_GOLD_BARS;
    this.kineticDashCharges = WEAPONS.kinetic_blade.dashCharges ?? 3;
    this.kineticDashRechargeTimer = 0;
    this.hammerCharges = WEAPONS.shockwave_hammer.hammerMaxCharges ?? 4;
    this.hammerRechargeTimer = 0;
    this.flareBeacons = [];
    this.flareScanMarkedCount = 0;
    this.lootIslandTickTimer = 0;
    this.lootIslandUpdraftCooldown = 0;
    this.medallions = [];
    this.victoryCrown = false;
    this.crownGlintTimer = CROWN_GLINT_INTERVAL_SEC;
    this.isDrawingBow = false;
    this.bowDrawElapsed = 0;
    this.bowCharge = 0;
    this.isChargingRailgun = false;
    this.railgunChargeElapsed = 0;
    this.railgunCharge = 0;
    this.minigunSpinTimer = 0;
    this.minigunHeat = 0;
    this.minigunOverheated = false;
    this.minigunOverheatTimer = 0;
    this.traps = { spike_trap: 0, bouncer_pad: 0 };
    this.activeTrapKind = 'spike_trap';
    this.activeGrindRail = null;
    this.grindRailCooldown = 0;
    this.grindSparkTimer = 0;
    this.isRebootingPartner = false;
    this.rebootTimer = 0;
    this.rebootTickSoundTimer = 0;
    this.activeRebootVanId = null;
    this.isKnocked = false;
    this.bleedOutHp = 0;
    this.isRevivingPartner = false;
    this.reviveTimer = 0;
    this.reviveTickSoundTimer = 0;
    this.reviveLabel = null;
    this.incomingReviveProgress = null;
    this.incomingReviveLabel = null;
    this.isStealthed = false;
    this.currentBushId = null;
    this.stealthBreakTimer = 0;
    this.hasStormForecast = false;
    this.jetpackFuel = JETPACK_MAX_FUEL;
    this.isJetpackThrusting = false;
    this.jetpackDryLock = false;
    this.jetpackVfxTimer = 0;
    this.lowGravityTimer = 0;
    this.thermalVisionTimer = 0;
    this.cancelTrainChestHack();
    this.cancelFishingChannel();
    this.chugRegenTimers.clear();
    this.weapons.clearActorBurn('player');
    this.stats = {
      damageDealt: 0,
      shotsFired: 0,
      shotsHit: 0,
      headshots: 0,
      structuresBuilt: 0,
      chestsOpened: 0,
      poisCaptured: 0,
      goldEarned: 0,
      knocks: 0,
      revives: 0,
      reboots: 0,
      dronesShotDown: 0,
      trapsPlaced: 0,
      modsInstalled: 0,
      bunkersDeployed: 0,
      empHits: 0,
      trainChestsHacked: 0,
      hopCrystalsUsed: 0,
      flameDamage: 0,
      hammerSlams: 0,
      flaresFired: 0,
      boarsHunted: 0,
      mushroomsEaten: 0,
      turretsDeployed: 0,
      fishCaught: 0,
      chugHeals: 0,
    };
    this.interactPrompt = null;
    this.hitmarker = null;
    this.damageDirection = null;
    this.currentFov = this.settings.fov;
  }

  teleport(pos: Vec3Like): void {
    if (this.activeVehicleId) {
      this.exitActiveVehicle(false);
    }
    this.activeGrindRail = null;
    this.grindRailCooldown = 0;
    this.activeZipline = null;
    this.cancelPartnerReboot();
    this.position = { x: pos.x, y: pos.y, z: pos.z };
    this.velocity = { x: 0, y: 0, z: 0 };
    if (this.phase === 'bus' || this.phase === 'skydiving' || this.phase === 'gliding') {
      this.phase = 'playing';
    }
    const groundY = this.collision.getFloorHeightAt(pos.x, pos.z, pos.y);
    if (this.position.y < groundY) {
      this.position.y = groundY;
    }
    this.grounded = this.position.y <= groundY + 0.05;
    this.isSliding = false;
    this.isMantling = false;
    this.fallImmune = false;
    this.fallPeakY = this.position.y;
    this.wasAirborne = !this.grounded;
  }

  jumpFromBus(): boolean {
    if (this.phase !== 'bus') return false;
    this.phase = 'skydiving';
    this.position = {
      x: this.lastBusPos.x,
      y: this.lastBusPos.y - 4.0,
      z: this.lastBusPos.z,
    };
    this.velocity = {
      x: Math.sin(this.yaw) * 14,
      y: -12,
      z: Math.cos(this.yaw) * 14,
    };
    this.grounded = false;
    this.fallPeakY = this.position.y;
    this.wasAirborne = true;
    this.fallImmune = false;
    this.eventBus.emit('sound:play', { id: 'jump' });
    return true;
  }

  toggleBuildMode(force?: boolean): void {
    if (this.phase !== 'playing' || this.isKnocked) return;
    if (this.gameMode === 'zero_build') {
      this.isBuildMode = false;
      this.building.setPreviewVisible(false);
      this.building.cancelEdit();
      this.lastBuildPreview = null;
      return;
    }
    if (this.building.getEditState().active) {
      this.building.cancelEdit();
    }
    this.isBuildMode = force !== undefined ? force : !this.isBuildMode;
    this.cancelActionsOnModeChange();
    if (!this.isBuildMode) {
      this.building.setPreviewVisible(false);
      this.lastBuildPreview = null;
    }
    this.eventBus.emit('sound:play', { id: 'ui_click', volume: 0.4 });
  }

  selectBuildPiece(type: BuildPieceType): void {
    if (this.phase !== 'playing' || this.isKnocked) return;
    if (this.gameMode === 'zero_build') {
      this.isBuildMode = false;
      this.building.setPreviewVisible(false);
      this.building.cancelEdit();
      this.lastBuildPreview = null;
      return;
    }
    if (this.building.getEditState().active) {
      this.building.cancelEdit();
    }
    this.activeBuildType = type;
    this.isBuildMode = true;
    this.cancelActionsOnModeChange();
  }

  enterEditMode(): boolean {
    if (this.phase !== 'playing' || this.gameMode === 'zero_build' || this.isKnocked) {
      return false;
    }
    const editState = this.building.getEditState();
    if (editState.active) {
      this.building.confirmEdit();
      return true;
    }

    const eye = this.getEyePosition();
    const lookDir = this.getLookDirection();
    const hit = this.collision.raycastWorld(eye, lookDir, 5.8, {
      checkBuilds: true,
      checkProps: false,
    });
    if (hit.hit && hit.targetType === 'build' && hit.targetId) {
      const piece = this.building.getPieceById(hit.targetId);
      if (piece && piece.ownerId === 'player') {
        this.cancelActionsOnModeChange();
        this.building.setPreviewVisible(false);
        this.building.beginEdit(piece.id);
        return true;
      }
    }
    return false;
  }

  enterTestEmote(emoteId?: EmoteId): void {
    if (
      this.isKnocked ||
      (this.phase !== 'playing' && this.phase !== 'victory' && this.phase !== 'lobby')
    ) {
      return;
    }
    const target = emoteId ?? this.selectedEmote;
    if (this.isEmoting && !emoteId) {
      this.isEmoting = false;
      this.activeEmote = null;
      return;
    }
    this.isBuildMode = false;
    this.building.setPreviewVisible(false);
    this.cancelActionsOnModeChange();
    this.isEmoting = true;
    this.activeEmote = target;
  }

  applyDamage(ev: DamageEvent & { isStorm?: boolean }): void {
    if (!this.isAlive()) return;
    const isStorm = Boolean(ev.isStorm) || ev.attackerId === 'storm';

    if (isStorm) {
      const stormDmg =
        ev.hpDamage > 0 ? ev.hpDamage : Math.max(0, ev.damage);
      if (this.isKnocked) {
        this.bleedOutHp = Math.max(0, this.bleedOutHp - stormDmg);
        if (this.bleedOutHp <= 0) {
          this.handleEliminated();
        }
        return;
      }
      this.health = Math.max(0, this.health - stormDmg);
      if (this.health <= 0) {
        if (this.gameMode === 'duos' && this.duoReviveBridge?.isPartnerAlive?.()) {
          this.enterKnockedState();
        } else {
          this.handleEliminated();
        }
      }
      return;
    }

    this.lastDamageTime = this.elapsedTime;
    this.overshieldRecharging = false;

    const isEmp = ev.weaponId === 'emp_grenade';
    const totalDmg =
      ev.damage > 0
        ? ev.damage
        : Math.max(0, ev.shieldDamage) + Math.max(0, ev.hpDamage);

    if (this.isKnocked) {
      if (!isEmp) {
        this.bleedOutHp = Math.max(0, this.bleedOutHp - totalDmg);
      }
      const dx = ev.hitPoint.x - this.position.x;
      const dz = ev.hitPoint.z - this.position.z;
      const worldAngle = Math.atan2(dx, dz);
      this.damageDirection = {
        timestamp: Date.now(),
        angleRad: worldAngle - this.yaw,
      };
      if (this.bleedOutHp <= 0) {
        this.handleEliminated();
      }
      return;
    }

    if (this.overshield > 0) {
      const osDmg = Math.min(this.overshield, totalDmg);
      this.overshield = Math.max(0, this.overshield - osDmg);
      const rem = totalDmg - osDmg;
      if (rem > 0) {
        if (ev.attackerId === 'environment' || ev.attackerId === 'lava') {
          const sDmg = Math.min(this.shield, Math.max(0, ev.shieldDamage));
          const hDmg = isEmp ? 0 : Math.min(this.health, Math.max(0, rem - sDmg));
          this.shield = Math.max(0, this.shield - sDmg);
          this.health = Math.max(0, this.health - hDmg);
        } else {
          const sDmg = Math.min(this.shield, rem);
          const hDmg = isEmp ? 0 : Math.min(this.health, rem - sDmg);
          this.shield = Math.max(0, this.shield - sDmg);
          this.health = Math.max(0, this.health - hDmg);
        }
      }
    } else {
      let sDmg = ev.shieldDamage;
      let hDmg = isEmp ? 0 : ev.hpDamage;
      if (
        (sDmg === 0 && hDmg === 0 && ev.damage > 0) ||
        (ev.attackerId !== 'environment' &&
          ev.attackerId !== 'lava' &&
          this.shield > 0 &&
          sDmg === 0 &&
          ev.damage > 0)
      ) {
        sDmg = Math.min(this.shield, ev.damage);
        hDmg = isEmp ? 0 : Math.min(this.health, ev.damage - sDmg);
      }

      this.shield = Math.max(0, this.shield - sDmg);
      this.health = Math.max(0, this.health - hDmg);
    }

    // Directional indicator angle relative to player camera yaw
    const dx = ev.hitPoint.x - this.position.x;
    const dz = ev.hitPoint.z - this.position.z;
    const worldAngle = Math.atan2(dx, dz);
    this.damageDirection = {
      timestamp: Date.now(),
      angleRad: worldAngle - this.yaw,
    };

    if (this.health <= 0) {
      if (this.gameMode === 'duos' && this.duoReviveBridge?.isPartnerAlive?.()) {
        this.enterKnockedState();
      } else {
        this.handleEliminated();
      }
    }
  }

  applyStormDamage(amount: number): void {
    if (!this.isAlive() || amount <= 0) return;
    if (this.isKnocked) {
      this.bleedOutHp = Math.max(0, this.bleedOutHp - amount);
      if (this.bleedOutHp <= 0) {
        this.handleEliminated();
      }
      return;
    }
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      if (this.gameMode === 'duos' && this.duoReviveBridge?.isPartnerAlive?.()) {
        this.enterKnockedState();
      } else {
        this.handleEliminated();
      }
    }
  }

  private handleEliminated(): void {
    if (this.activeVehicleId) {
      this.exitActiveVehicle(false);
    }
    this.health = 0;
    this.overshield = 0;
    this.overshieldRecharging = false;
    this.nearCampfireHealing = false;
    this.campfireHealVfxTimer = 0;
    this.phase = 'eliminated';
    this.isBuildMode = false;
    this.isSliding = false;
    this.isMantling = false;
    this.isSwimming = false;
    this.isStealthed = false;
    this.currentBushId = null;
    this.stealthBreakTimer = 0;
    this.isKnocked = false;
    this.bleedOutHp = 0;
    this.isDrawingBow = false;
    this.bowDrawElapsed = 0;
    this.bowCharge = 0;
    this.isChargingRailgun = false;
    this.railgunChargeElapsed = 0;
    this.railgunCharge = 0;
    this.minigunSpinTimer = 0;
    this.cancelPartnerRevive();
    this.cancelPartnerReboot();
    this.cancelTrainChestHack();
    this.cancelFishingChannel();
    this.isJetpackThrusting = false;
    this.jetpackDryLock = false;
    this.lowGravityTimer = 0;
    this.thermalVisionTimer = 0;
    this.chugRegenTimers.clear();
    this.flareBeacons = [];
    this.flareScanMarkedCount = 0;
    this.weapons.clearActorBurn('player');
    this.incomingReviveProgress = null;
    this.incomingReviveLabel = null;
    this.activeZipline = null;
    this.activeGrindRail = null;
    this.killStreak = 0;
    this.building.setPreviewVisible(false);
    this.building.cancelEdit();
    this.clearHeldInputs();

    if (this.gameMode !== 'team_rumble') {
      if (this.chapterBridge) {
        for (let i = 0; i < this.medallions.length; i++) {
          this.chapterBridge.spawnDroppedMedallion?.(
            this.medallions[i],
            this.position.x + (i - 1) * 0.9,
            this.position.y + 0.1,
            this.position.z,
          );
        }
        if (this.victoryCrown) {
          this.chapterBridge.spawnDroppedCrown?.(
            this.position.x + 0.8,
            this.position.y + 0.1,
            this.position.z + 0.6,
          );
        }
      }
      this.medallions = [];
      this.victoryCrown = false;

      // Drop inventory items
      const dropped = this.inventory.dropAllLoot();
      for (let i = 0; i < dropped.items.length; i++) {
        const ang = (i / Math.max(1, dropped.items.length)) * Math.PI * 2;
        this.propsBridge.spawnLootDrop(
          { x: this.position.x, y: this.position.y + 0.8, z: this.position.z },
          { item: dropped.items[i] },
          { x: Math.cos(ang) * 2.5, y: 4.5, z: Math.sin(ang) * 2.5 },
        );
      }
      (Object.keys(dropped.materials) as MaterialType[]).forEach((mat) => {
        const amt = dropped.materials[mat];
        if (amt && amt > 0) {
          this.propsBridge.spawnLootDrop(
            { x: this.position.x, y: this.position.y + 0.8, z: this.position.z },
            { materials: { type: mat, amount: amt } },
            { x: (Math.random() - 0.5) * 3, y: 4.2, z: (Math.random() - 0.5) * 3 },
          );
        }
      });
    }

    this.eventBus.emit('vfx:elimination', {
      position: { ...this.position },
    });
    this.eventBus.emit('sound:play', {
      id: 'elimination',
      position: { ...this.position },
      spatial: true,
    });
  }

  attachInputListeners(domElement?: HTMLElement): void {
    if (this.listenersAttached) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    this.boundDom = domElement ?? document.body;
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    window.addEventListener('blur', this.onBlurBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);

    this.boundDom.addEventListener('mousedown', this.onMouseDownBound);
    this.boundDom.addEventListener('wheel', this.onWheelBound, { passive: true });
    this.boundDom.addEventListener('contextmenu', this.onContextMenuBound);
    this.listenersAttached = true;
  }

  detachInputListeners(): void {
    if (!this.listenersAttached) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('blur', this.onBlurBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);

    if (this.boundDom) {
      this.boundDom.removeEventListener('mousedown', this.onMouseDownBound);
      this.boundDom.removeEventListener('wheel', this.onWheelBound);
      this.boundDom.removeEventListener('contextmenu', this.onContextMenuBound);
    }
    this.boundDom = null;
    this.listenersAttached = false;
    this.clearHeldInputs();
  }

  dispose(): void {
    this.detachInputListeners();
    this.weapons.setPlayerTideObserver(null);
    this.weapons.setPlayerOverlordObserver(null);
    this.unsubHitmarker?.();
    this.unsubHitmarker = null;
    this.unsubDamage?.();
    this.unsubDamage = null;
    this.unsubCameraShake?.();
    this.unsubCameraShake = null;
  }

  pressKey(code: string): void {
    this.keysDown.add(code);
    this.handleKeyCodeDown(code);
  }

  releaseKey(code: string): void {
    this.keysDown.delete(code);
    if (code === this.getResolvedKeybinds().interact) {
      if (this.isRevivingPartner) this.cancelPartnerRevive();
      if (this.isRebootingPartner) this.cancelPartnerReboot();
      if (this.isHackingTrainChest) this.cancelTrainChestHack();
    }
  }

  setMouseButton(button: 0 | 1 | 2, down: boolean): void {
    if (button === 0) {
      if (down) {
        this.handlePrimaryButtonDown();
      } else {
        this.leftMouseDown = false;
        this.isFiring = false;
        this.lastDraggedEditTile = -1;
        if (this.isDrawingBow) {
          this.releaseBowShot();
        }
        if (this.isChargingRailgun) {
          this.releaseRailgunShot();
        }
      }
    } else if (button === 1) {
      if (down && this.phase === 'playing' && !this.isKnocked) {
        this.placeTacticalPing();
      }
    } else if (button === 2) {
      if (down) {
        this.handleSecondaryButtonDown();
      } else {
        this.rightMouseDown = false;
      }
    }
  }

  private clearHeldInputs(): void {
    this.keysDown.clear();
    this.leftMouseDown = false;
    this.rightMouseDown = false;
    this.isMouseDragging = false;
    this.isFiring = false;
    this.isAiming = false;
    this.isScoped = false;
    this.isDrawingBow = false;
    this.bowDrawElapsed = 0;
    this.bowCharge = 0;
    this.isChargingRailgun = false;
    this.railgunChargeElapsed = 0;
    this.railgunCharge = 0;
    this.minigunSpinTimer = 0;
    this.cancelPartnerRevive();
    this.cancelPartnerReboot();
    this.cancelTrainChestHack();
    this.cancelFishingChannel();
    this.isJetpackThrusting = false;
    this.lastDraggedEditTile = -1;
  }

  private handlePointerLockChange(): void {
    if (typeof document === 'undefined') return;
    this.pointerLocked =
      this.boundDom !== null && document.pointerLockElement === this.boundDom;
  }

  private handleMouseDown(e: MouseEvent): void {
    if (
      this.phase !== 'bus' &&
      this.phase !== 'skydiving' &&
      this.phase !== 'gliding' &&
      this.phase !== 'playing'
    ) {
      return;
    }

    if (this.boundDom && e.target !== this.boundDom && !this.pointerLocked) {
      return;
    }

    if (!this.pointerLocked && this.boundDom && typeof this.boundDom.requestPointerLock === 'function') {
      try {
        const res = this.boundDom.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {
        // Fallback drag-to-aim remains active
      }
    }

    if (e.button === 1) {
      e.preventDefault?.();
      if (this.phase === 'playing') {
        this.placeTacticalPing();
      }
      return;
    }

    this.isMouseDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    if (e.button === 0) {
      this.handlePrimaryButtonDown();
    } else if (e.button === 2) {
      this.handleSecondaryButtonDown();
    }
  }

  private handlePrimaryButtonDown(): void {
    this.leftMouseDown = true;
    if (this.isKnocked) return;
    if (this.isEmoting) {
      this.isEmoting = false;
      this.activeEmote = null;
    }

    if (this.phase === 'playing') {
      if (this.activeVehicleId !== null) {
        return;
      }
      const editState = this.building.getEditState();
      if (editState.active) {
        const hovered = this.building.getHoveredEditTileIndex(
          this.getEyePosition(),
          this.getLookDirection(),
        );
        if (hovered !== -1) {
          this.building.toggleEditTile(hovered);
          this.lastDraggedEditTile = hovered;
        }
      } else if (this.isBuildMode) {
        this.tryPlaceBuild();
      } else {
        this.tryUseActiveSlot(true);
      }
    }
  }

  private handleSecondaryButtonDown(): void {
    this.rightMouseDown = true;
    if (this.isKnocked) return;
    if (this.phase === 'playing') {
      if (this.building.getEditState().active) {
        this.building.resetEditTiles();
      } else if (this.isBuildMode) {
        this.cycleBuildMaterial();
      } else if (this.activeVehicleId === null) {
        const activeWeaponId = this.inventory.getActiveItem()?.weaponId;
        if (activeWeaponId === 'kinetic_blade') {
          this.tryKineticDash();
        } else if (activeWeaponId === 'shockwave_hammer') {
          this.tryHammerBounce();
        }
      }
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.leftMouseDown = false;
      this.isFiring = false;
      this.lastDraggedEditTile = -1;
      if (this.isDrawingBow) {
        this.releaseBowShot();
      }
      if (this.isChargingRailgun) {
        this.releaseRailgunShot();
      }
    } else if (e.button === 2) {
      this.rightMouseDown = false;
    }
    if (!this.leftMouseDown && !this.rightMouseDown) {
      this.isMouseDragging = false;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (
      this.phase !== 'bus' &&
      this.phase !== 'skydiving' &&
      this.phase !== 'gliding' &&
      this.phase !== 'playing'
    ) {
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.pointerLocked) {
      dx = e.movementX;
      dy = e.movementY;
    } else if (this.isMouseDragging) {
      dx = e.movementX !== 0 ? e.movementX : e.clientX - this.lastMouseX;
      dy = e.movementY !== 0 ? e.movementY : e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    } else {
      return;
    }

    const baseSens =
      0.0022 *
      this.settings.sensitivity *
      (this.isAiming ? this.settings.adsSensitivity : 1.0) *
      (this.isScoped ? 0.55 : 1.0);

    this.yaw -= dx * baseSens;
    const ySign = this.settings.invertY ? 1 : -1;
    this.pitch = clamp(this.pitch + dy * baseSens * ySign, -1.28, 1.32);
  }

  private handleWheel(e: WheelEvent): void {
    if (this.phase !== 'playing' || this.building.getEditState().active) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    if (this.isBuildMode) {
      const idx = BUILD_CYCLE.indexOf(this.activeBuildType);
      const next = (idx + dir + BUILD_CYCLE.length) % BUILD_CYCLE.length;
      this.activeBuildType = BUILD_CYCLE[next];
    } else {
      const nextSlot = (this.inventory.getActiveSlotIndex() + dir + 6) % 6;
      this.selectSlot(nextSlot);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.keysDown.add(e.code);
    if (e.repeat) return;
    this.handleKeyCodeDown(e.code);
  }

  private getResolvedKeybinds(): KeybindMap {
    const custom = this.settings.keybinds;
    if (!custom) return { ...DEFAULT_KEYBINDS };
    return {
      buildWall: custom.buildWall || DEFAULT_KEYBINDS.buildWall,
      buildFloor: custom.buildFloor || DEFAULT_KEYBINDS.buildFloor,
      buildRamp: custom.buildRamp || DEFAULT_KEYBINDS.buildRamp,
      buildRoof: custom.buildRoof || DEFAULT_KEYBINDS.buildRoof,
      edit: custom.edit || DEFAULT_KEYBINDS.edit,
      repair: custom.repair || DEFAULT_KEYBINDS.repair,
      interact: custom.interact || DEFAULT_KEYBINDS.interact,
      map: custom.map || DEFAULT_KEYBINDS.map,
      emote: custom.emote || DEFAULT_KEYBINDS.emote,
      crouchSlide: custom.crouchSlide || DEFAULT_KEYBINDS.crouchSlide,
    };
  }

  private formatKeyLabel(code: string): string {
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Space') return 'SPACE';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
    return code.toUpperCase();
  }

  private updateStealthBush(emitRustle: boolean): void {
    if (
      !this.frontierBridge ||
      this.phase !== 'playing' ||
      !this.isAlive() ||
      this.isKnocked ||
      this.activeVehicleId !== null ||
      this.activeGrindRail !== null ||
      this.activeZipline !== null
    ) {
      this.currentBushId = null;
      this.isStealthed = false;
      return;
    }

    const bush = this.frontierBridge.isInsideStealthBush(this.position);
    if (!bush) {
      this.currentBushId = null;
      this.isStealthed = false;
      return;
    }

    if (emitRustle && bush.id !== this.currentBushId) {
      this.currentBushId = bush.id;
      this.eventBus.emit('sound:play', {
        id: 'bush_rustle',
        position: { ...this.position },
        spatial: true,
      });
    } else if (this.currentBushId === null) {
      this.currentBushId = bush.id;
    }

    this.isStealthed =
      this.isCrouching && !this.isSliding && this.stealthBreakTimer <= 0;
  }

  private handleCrouchSlideKey(): void {
    if (this.isSliding) {
      this.isSliding = false;
      this.slideTimer = 0;
      this.isCrouching = true;
      this.updateStealthBush(true);
      return;
    }
    const sprintingNow =
      this.isSprinting ||
      ((this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight')) &&
        (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) &&
        !this.isAiming &&
        this.stamina > 1.5);
    if (sprintingNow && this.startSlide()) {
      this.updateStealthBush(true);
      return;
    }
    this.isCrouching = !this.isCrouching;
    if (this.isCrouching) this.isSprinting = false;
    this.updateStealthBush(true);
  }

  private handleKeyCodeDown(code: string): void {
    if (this.phase === 'bus') {
      if (code === 'Space') {
        this.jumpFromBus();
      }
      return;
    }

    if (this.phase === 'skydiving') {
      if (code === 'Space') {
        this.phase = 'gliding';
        this.eventBus.emit('sound:play', { id: 'glider_deploy' });
      }
      return;
    }

    if (this.phase === 'gliding') {
      if (code === 'Space') {
        const groundY = this.terrain.getHeightAt(this.position.x, this.position.z);
        if (this.position.y - groundY > GLIDER_FORCE_HEIGHT) {
          this.phase = 'skydiving';
        }
      }
      return;
    }

    if (this.phase !== 'playing' || this.isKnocked) return;

    if (code === 'Digit7') {
      this.selectAugmentChoice(0);
      return;
    }
    if (code === 'Digit8') {
      this.selectAugmentChoice(1);
      return;
    }
    if (code === 'KeyQ') {
      this.placeTacticalPing();
      return;
    }

    const kb = this.getResolvedKeybinds();

    if (this.activeVehicleId !== null) {
      if (code === kb.interact || code === 'Space') {
        this.exitActiveVehicle(true);
        return;
      }
      if (code === 'KeyH') {
        this.eventBus.emit('sound:play', {
          id: 'vehicle_horn',
          position: { ...this.position },
          spatial: true,
        });
      }
      return;
    }

    if (code === kb.repair && this.repairTargetedBuild()) {
      return;
    }
    if (code === kb.interact) {
      this.tryInteract();
      return;
    }
    if (code === kb.repair) {
      if (code === kb.buildRoof) {
        this.selectBuildPiece('roof');
      }
      return;
    }
    if (code === kb.buildWall) {
      this.selectBuildPiece('wall');
      return;
    }
    if (code === kb.buildFloor) {
      this.selectBuildPiece('floor');
      return;
    }
    if (code === kb.buildRamp) {
      this.selectBuildPiece('ramp');
      return;
    }
    if (code === kb.buildRoof) {
      this.selectBuildPiece('roof');
      return;
    }
    if (code === kb.edit) {
      this.enterEditMode();
      return;
    }
    if (code === kb.crouchSlide) {
      this.handleCrouchSlideKey();
      return;
    }

    switch (code) {
      case 'Digit1':
        this.selectSlot(0);
        break;
      case 'Digit2':
        this.selectSlot(1);
        break;
      case 'Digit3':
        this.selectSlot(2);
        break;
      case 'Digit4':
        this.selectSlot(3);
        break;
      case 'Digit5':
        this.selectSlot(4);
        break;
      case 'Digit6':
        this.selectSlot(5);
        break;
      case 'F1':
        this.selectBuildPiece('wall');
        break;
      case 'F2':
        this.selectBuildPiece('floor');
        break;
      case 'F3':
        this.selectBuildPiece('ramp');
        break;
      case 'F4':
        this.selectBuildPiece('roof');
        break;
      case 'KeyT':
        this.placeActiveTrap();
        break;
      case 'KeyR':
        if (this.isBuildMode) {
          this.buildRotation = ((this.buildRotation + 1) % 4) as 0 | 1 | 2 | 3;
          this.eventBus.emit('sound:play', { id: 'ui_click', volume: 0.35 });
        } else {
          this.startReload();
        }
        break;
      case 'ControlLeft':
        this.handleCrouchSlideKey();
        break;
      case 'KeyK':
        this.enterTestEmote();
        break;
      case 'Space':
        if (this.isEmoting) {
          this.isEmoting = false;
          this.activeEmote = null;
        }
        if (this.activeGrindRail) {
          this.detachGrindRail(true);
          break;
        }
        if (this.activeZipline) {
          this.detachZipline(true);
          break;
        }
        if (this.isSliding && (this.grounded || this.velocity.y > -3.5)) {
          this.isSliding = false;
          this.slideTimer = 0;
          this.isCrouching = false;
          const burstSpeed = Math.max(this.slideSpeed * 1.08, 12.5);
          const lowGJumpScale = this.lowGravityTimer > 0 ? 1.25 : 1.0;
          this.velocity.x = this.slideDir.x * burstSpeed;
          this.velocity.z = this.slideDir.z * burstSpeed;
          this.velocity.y = 9.0 * lowGJumpScale;
          this.grounded = false;
          this.wasAirborne = true;
          this.fallPeakY = this.position.y;
          if (this.lowGravityTimer > 0) {
            this.fallImmune = true;
            this.eventBus.emit('sound:play', {
              id: 'low_g_jump',
              position: this.position,
              spatial: true,
            });
          } else {
            this.eventBus.emit('sound:play', { id: 'jump', position: this.position, spatial: true });
          }
          break;
        }
        if (this.tryMantle()) {
          break;
        }
        if (this.grounded) {
          this.isCrouching = false;
          const isSprintingNow =
            this.isSprinting ||
            ((this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight')) &&
              (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) &&
              !this.isAiming &&
              this.stamina > 1.5);
          const augmentJumpScale =
            isSprintingNow && this.augmentManager.hasAugment('parkour_boost')
              ? 1.35
              : 1.0;
          const agilityJumpScale =
            isSprintingNow && this.hasMedallion('medallion_agility')
              ? 1.22
              : 1.0;
          const lowGJumpScale = this.lowGravityTimer > 0 ? 1.25 : 1.0;
          this.velocity.y = 8.4 * augmentJumpScale * agilityJumpScale * lowGJumpScale;
          this.grounded = false;
          this.wasAirborne = true;
          this.fallPeakY = this.position.y;
          if (this.lowGravityTimer > 0) {
            this.fallImmune = true;
            this.eventBus.emit('sound:play', {
              id: 'low_g_jump',
              position: this.position,
              spatial: true,
            });
          } else {
            this.eventBus.emit('sound:play', { id: 'jump', position: this.position, spatial: true });
          }
        } else if (
          !this.isSwimming &&
          !this.isMantling &&
          (this.inventory.findSlotByWeapon('jetpack') === -1 || this.jetpackFuel <= 0) &&
          this.augmentManager.hasAugment('aerialist')
        ) {
          const terrainY = this.terrain.getHeightAt(this.position.x, this.position.z);
          const floorY = this.collision.getFloorHeightAt(
            this.position.x,
            this.position.z,
            this.position.y + 0.5,
            0.2,
          );
          const alt = Math.min(this.position.y - terrainY, this.position.y - floorY);
          if (alt > 6.0) {
            this.isCrouching = false;
            this.isSliding = false;
            this.isBuildMode = false;
            this.building.setPreviewVisible(false);
            this.fallImmune = true;
            this.phase = 'gliding';
            this.eventBus.emit('sound:play', { id: 'glider_deploy' });
          }
        }
        break;
      case 'Escape':
        if (this.building.getEditState().active) {
          this.building.cancelEdit();
        } else if (this.isBuildMode) {
          this.toggleBuildMode(false);
        }
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code);
    if (e.code === this.getResolvedKeybinds().interact) {
      if (this.isRevivingPartner) this.cancelPartnerRevive();
      if (this.isRebootingPartner) this.cancelPartnerReboot();
      if (this.isHackingTrainChest) this.cancelTrainChestHack();
    }
  }

  private selectSlot(slotIndex: number): void {
    if (this.building.getEditState().active) {
      this.building.cancelEdit();
    }
    this.isBuildMode = false;
    this.building.setPreviewVisible(false);
    this.lastBuildPreview = null;
    this.cancelActionsOnModeChange();
    this.inventory.setActiveSlot(slotIndex);
  }

  private cancelActionsOnModeChange(): void {
    this.reloadTimer = 0;
    this.reloadDuration = 0;
    this.reloadSlotIndex = -1;
    this.healTimer = 0;
    this.healDuration = 0;
    this.healLabel = null;
    this.isEmoting = false;
    this.activeEmote = null;
    this.isFiring = false;
    this.isDrawingBow = false;
    this.bowDrawElapsed = 0;
    this.bowCharge = 0;
    this.isChargingRailgun = false;
    this.railgunChargeElapsed = 0;
    this.railgunCharge = 0;
    this.minigunSpinTimer = 0;
    this.cancelFishingChannel();
  }

  private cancelPartnerRevive(): void {
    this.isRevivingPartner = false;
    this.reviveTimer = 0;
    this.reviveTickSoundTimer = 0;
    this.reviveLabel = null;
  }

  private cancelPartnerReboot(): void {
    this.isRebootingPartner = false;
    this.rebootTimer = 0;
    this.rebootTickSoundTimer = 0;
    this.activeRebootVanId = null;
  }

  private cancelTrainChestHack(): void {
    this.isHackingTrainChest = false;
    this.trainHackProgress = null;
  }

  private cancelFishingChannel(): void {
    this.isFishing = false;
    this.fishingTimer = 0;
    this.fishingProgress = null;
    this.activeFishingHoleId = null;
  }

  private cycleBuildMaterial(): void {
    const idx = MAT_CYCLE.indexOf(this.activeMaterial);
    this.activeMaterial = MAT_CYCLE[(idx + 1) % MAT_CYCLE.length];
    this.eventBus.emit('sound:play', { id: 'ui_click', volume: 0.4 });
  }

  private getBuildMaterialOrFallback(): MaterialType {
    if (this.inventory.getMaterials()[this.activeMaterial] >= BUILD_COST) {
      return this.activeMaterial;
    }
    for (let i = 0; i < MAT_CYCLE.length; i++) {
      const m = MAT_CYCLE[i];
      if (this.inventory.getMaterials()[m] >= BUILD_COST) {
        this.activeMaterial = m;
        return m;
      }
    }
    return this.activeMaterial;
  }

  private tryPlaceBuild(): void {
    if (this.gameMode === 'zero_build' || this.buildCooldown > 0) return;
    const mat = this.getBuildMaterialOrFallback();
    const hasMats = this.inventory.getMaterials()[mat] >= BUILD_COST;
    const preview = this.building.computePreview(
      this.getEyePosition(),
      this.getLookDirection(),
      this.activeBuildType,
      mat,
      this.buildRotation,
      hasMats,
    );
    this.lastBuildPreview = preview;
    if (!preview.valid) return;
    if (!this.inventory.spendMaterial(mat, BUILD_COST)) return;

    const placed = this.building.placePieceFromPreview(preview, 'player');
    if (placed) {
      this.stats.structuresBuilt += 1;
      this.buildCooldown = 0.09;
    }
  }

  private buildWeaponFireExtras(item: ItemInstance) {
    return {
      tideBridge: this.tideBridge,
      weaponMods: item.mods ? [...item.mods] : undefined,
      actorTeamId:
        this.gameMode === 'team_rumble' ? ('team_blue' as const) : undefined,
      isAiming: this.isAiming,
      spreadPreAdjusted: true,
      actorYaw: this.yaw,
      onBunkerDeployed: (report: { pieces: BuildPiece[] }) => {
        if (report.pieces.length > 0) {
          this.stats.bunkersDeployed = (this.stats.bunkersDeployed ?? 0) + 1;
        }
      },
      onEmpHit: (report: {
        actorsHit: number;
        shieldStripped: number;
        trapsDisabled: number;
      }) => {
        const hits = report.actorsHit + report.trapsDisabled;
        if (hits > 0) {
          this.stats.empHits = (this.stats.empHits ?? 0) + hits;
        }
        if (report.shieldStripped > 0) {
          this.stats.damageDealt += report.shieldStripped;
        }
      },
    };
  }

  private startReload(): void {
    if (this.reloadTimer > 0 || this.isKnocked) return;
    const slot = this.inventory.getActiveSlotIndex();
    const item = this.inventory.getActiveItem();
    if (!item) return;
    const def = WEAPONS[item.weaponId];
    if (!def.ammoType || def.magSize <= 0 || def.reloadTime <= 0 || def.isMinigun) {
      return;
    }
    const magCap = getItemMagCapacity(item);
    if (item.magAmmo >= magCap) return;
    if (this.inventory.getAmmo(def.ammoType) <= 0) return;

    const reloadDur = this.weapons.getReloadTime(item, {
      hasLightFingers: this.augmentManager.hasAugment('light_fingers'),
      hasCombatMedallion: this.hasMedallion('medallion_combat'),
    });

    this.healTimer = 0;
    this.healLabel = null;
    this.isDrawingBow = false;
    this.bowDrawElapsed = 0;
    this.bowCharge = 0;
    this.isChargingRailgun = false;
    this.railgunChargeElapsed = 0;
    this.railgunCharge = 0;
    this.reloadSlotIndex = slot;
    this.reloadDuration = reloadDur;
    this.reloadTimer = reloadDur;
    this.eventBus.emit('sound:play', { id: 'reload' });
  }

  private recordWeaponFireResult(
    res: FireWeaponResult,
    item: ItemInstance,
    def: (typeof WEAPONS)[WeaponId],
  ): void {
    if (!res.fired) return;

    this.fireCooldown = 1 / def.fireRate;
    this.stealthBreakTimer = STEALTH_FIRE_BREAK_SEC;
    this.isStealthed = false;
    if (def.isShockwaveHammer || item.weaponId === 'shockwave_hammer') {
      this.stats.hammerSlams = (this.stats.hammerSlams ?? 0) + 1;
    } else if (def.isFlareGun || item.weaponId === 'flare_gun') {
      this.stats.flaresFired = (this.stats.flaresFired ?? 0) + 1;
    }

    if (
      item.weaponId !== 'pickaxe' &&
      !def.isKineticBlade &&
      !def.isShockwaveHammer &&
      !def.isGrappler &&
      !def.isThrowable &&
      !def.isJetpack &&
      !def.isChugCannon
    ) {
      this.stats.shotsFired += 1;
      if (res.shotsHit > 0) this.stats.shotsHit += 1;
      this.stats.headshots += res.headshots;
      this.stats.damageDealt += res.damageDealt;
      if (item.weaponId === 'plasma_flamethrower' && res.damageDealt > 0) {
        this.stats.flameDamage = (this.stats.flameDamage ?? 0) + res.damageDealt;
      }
    }

    if (res.destroyedDrones && res.destroyedDrones.length > 0) {
      for (let i = 0; i < res.destroyedDrones.length; i++) {
        this.stats.dronesShotDown = (this.stats.dronesShotDown ?? 0) + 1;
        this.onDroneDestroyed?.(res.destroyedDrones[i]);
      }
    }

    const modFx = getWeaponModEffects(item.mods);
    const bloomMult = res.bloomScale ?? modFx.bloomMult;
    const recoilMult = res.recoilScale ?? modFx.recoilMult;
    this.bloom = Math.min(def.bloomMax, this.bloom + def.bloomPerShot * bloomMult);
    this.pitch = clamp(this.pitch + def.recoilPitch * recoilMult, -1.28, 1.32);
    this.yaw += (Math.random() - 0.5) * 2 * def.recoilYaw * recoilMult;
    this.recoilKick = 1.0 * recoilMult;

    if (def.isMinigun || item.weaponId === 'minigun') {
      const heatPerShot = def.heatPerShot ?? 0.022;
      this.minigunHeat = clamp(this.minigunHeat + heatPerShot, 0, 1);
      if (this.minigunHeat >= 1 - 1e-6) {
        this.minigunHeat = 1.0;
        this.minigunOverheated = true;
        this.minigunOverheatTimer = def.overheatLockSec ?? 2.4;
        this.minigunSpinTimer = 0;
        this.isFiring = false;
        this.eventBus.emit('sound:play', {
          id: 'minigun_overheat',
          position: { ...this.position },
          spatial: true,
        });
      }
    } else if (
      def.magSize > 0 &&
      item.magAmmo <= 0 &&
      !def.isGrappler &&
      !def.isFlareGun &&
      !def.isChugCannon
    ) {
      this.startReload();
    }
  }

  private tryUseActiveSlot(isInitialPress: boolean): void {
    if (
      this.isKnocked ||
      this.isRevivingPartner ||
      this.isRebootingPartner ||
      this.isHackingTrainChest ||
      this.isFishing
    ) {
      return;
    }
    const item = this.inventory.getActiveItem();
    if (!item) return;
    const def = WEAPONS[item.weaponId];
    if (def.isJetpack || item.weaponId === 'jetpack') return;

    if (def.isConsumable) {
      if (!isInitialPress || this.healTimer > 0) return;
      const cap = def.healCap ?? 100;
      const canHealHp =
        (def.healTarget === 'hp' || def.healTarget === 'both') && this.health < cap;
      const canHealShield =
        (def.healTarget === 'shield' || def.healTarget === 'both') && this.shield < cap;
      if (!canHealHp && !canHealShield) return;

      this.reloadTimer = 0;
      this.healDuration = def.consumeTime ?? 2.0;
      this.healTimer = this.healDuration;
      this.healLabel = def.name;
      this.eventBus.emit('sound:play', { id: 'heal_start' });
      return;
    }

    if (this.fireCooldown > 0) return;

    if (def.isMinigun || item.weaponId === 'minigun') {
      if (this.minigunOverheated) {
        if (isInitialPress) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
        }
        this.isFiring = false;
        return;
      }
      if (this.inventory.getAmmo('light') <= 0) {
        if (isInitialPress) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
        }
        this.isFiring = false;
        return;
      }
      const spinUpSec = Math.max(0.01, def.spinUpSec ?? 0.45);
      if (this.minigunSpinTimer < spinUpSec - 1e-6) {
        this.isFiring = false;
        return;
      }
    } else {
      // Semi-auto / magazine check for guns (skip throwables which use stackCount)
      if (def.magSize > 0 && item.magAmmo <= 0) {
        if (isInitialPress) {
          this.eventBus.emit('sound:play', { id: 'dryfire' });
        }
        if (!def.isGrappler && !def.isFlareGun && !def.isChugCannon) {
          this.startReload();
        }
        return;
      }
      if (def.isThrowable && item.stackCount <= 0) {
        return;
      }
    }

    if (def.isBow || item.weaponId === 'boom_bow') {
      if (!this.isDrawingBow) {
        this.reloadTimer = 0;
        this.healTimer = 0;
        this.healLabel = null;
        this.isDrawingBow = true;
        this.bowDrawElapsed = 0;
        this.bowCharge = 0;
        this.isFiring = false;
        this.eventBus.emit('sound:play', {
          id: 'bow_draw',
          position: { ...this.position },
          spatial: true,
        });
      }
      return;
    }

    if (def.isRailgun || item.weaponId === 'railgun') {
      if (!this.isChargingRailgun) {
        this.reloadTimer = 0;
        this.healTimer = 0;
        this.healLabel = null;
        this.isChargingRailgun = true;
        this.railgunChargeElapsed = 0;
        this.railgunCharge = 0;
        this.isFiring = false;
        this.eventBus.emit('sound:play', {
          id: 'railgun_charge',
          position: { ...this.position },
          spatial: true,
        });
      }
      return;
    }

    // Cancel active reload/heal on firing
    this.reloadTimer = 0;
    this.healTimer = 0;
    this.healLabel = null;

    const spreadRad = this.computeCurrentSpread(item.weaponId);
    const eye = this.getEyePosition();
    const aimDir = this.computeCrosshairParallaxAimDir(eye);

    if (
      item.weaponId === 'pickaxe' ||
      def.isKineticBlade ||
      def.isShockwaveHammer
    ) {
      this.harvestSwingTimer = 0.35;
    }

    this.isFiring = true;
    const res = this.weapons.fireWeapon({
      actor: this.getCombatActor(),
      item,
      origin: eye,
      aimDir,
      muzzlePos: this.muzzleWorldPos ?? eye,
      spreadRad,
      isPlayer: true,
      vehicleBridge: this.vehicleBridge,
      stationBridge: this.stationBridge,
      riftCaptureBridge: this.riftCaptureBridge,
      chapterBridge: this.chapterBridge,
      overdriveBridge: this.overdriveBridge,
      hasDemolisher: this.augmentManager.hasAugment('demolisher'),
      hasFirstAssault: this.augmentManager.hasAugment('first_assault'),
      hasCombatMedallion: this.hasMedallion('medallion_combat'),
      ...this.buildWeaponFireExtras(item),
      onAmmoConsumed: () => {
        if (def.isMinigun || item.weaponId === 'minigun') {
          this.inventory.useAmmo('light', 1);
        } else if (def.magSize > 0 && item.magAmmo > 0) {
          item.magAmmo -= 1;
        } else if (def.isThrowable && item.stackCount > 0) {
          this.inventory.consumeActiveItem();
        }
      },
      onHarvest: (matType, amount) => {
        this.inventory.addMaterial(matType, amount);
      },
    });

    this.recordWeaponFireResult(res, item, def);
  }

  private releaseBowShot(): void {
    const charge = clamp(this.bowCharge, 0, 1);
    this.isDrawingBow = false;
    this.bowDrawElapsed = 0;
    this.bowCharge = 0;

    if (
      this.phase !== 'playing' ||
      !this.isAlive() ||
      this.isKnocked ||
      this.activeVehicleId !== null ||
      this.isBuildMode ||
      this.building.getEditState().active
    ) {
      return;
    }

    const item = this.inventory.getActiveItem();
    if (!item) return;
    const def = WEAPONS[item.weaponId];
    if (!def || (!def.isBow && item.weaponId !== 'boom_bow') || item.magAmmo <= 0) {
      return;
    }

    const spreadRad = this.computeCurrentSpread(item.weaponId) * (1 - 0.7 * charge);
    const eye = this.getEyePosition();
    const aimDir = this.computeCrosshairParallaxAimDir(eye);

    const res = this.weapons.fireWeapon({
      actor: this.getCombatActor(),
      item,
      origin: eye,
      aimDir,
      muzzlePos: this.muzzleWorldPos ?? eye,
      spreadRad,
      isPlayer: true,
      vehicleBridge: this.vehicleBridge,
      stationBridge: this.stationBridge,
      riftCaptureBridge: this.riftCaptureBridge,
      chapterBridge: this.chapterBridge,
      overdriveBridge: this.overdriveBridge,
      hasDemolisher: this.augmentManager.hasAugment('demolisher'),
      hasFirstAssault: this.augmentManager.hasAugment('first_assault'),
      hasCombatMedallion: this.hasMedallion('medallion_combat'),
      ...this.buildWeaponFireExtras(item),
      bowCharge: charge,
      onAmmoConsumed: () => {
        if (def.magSize > 0 && item.magAmmo > 0) {
          item.magAmmo -= 1;
        }
      },
    });

    this.recordWeaponFireResult(res, item, def);
  }

  private releaseRailgunShot(): void {
    const charge = clamp(this.railgunCharge, 0, 1);
    this.isChargingRailgun = false;
    this.railgunChargeElapsed = 0;
    this.railgunCharge = 0;
    if (charge < 0.45) return;
    this.fireRailgunShot();
  }

  private fireRailgunShot(): void {
    this.isChargingRailgun = false;
    this.railgunChargeElapsed = 0;
    this.railgunCharge = 0;

    if (
      this.phase !== 'playing' ||
      !this.isAlive() ||
      this.isKnocked ||
      this.activeVehicleId !== null ||
      this.isBuildMode ||
      this.building.getEditState().active
    ) {
      return;
    }

    const item = this.inventory.getActiveItem();
    if (!item) return;
    const def = WEAPONS[item.weaponId];
    if (!def || (!def.isRailgun && item.weaponId !== 'railgun') || item.magAmmo <= 0) {
      return;
    }

    const spreadRad = this.computeCurrentSpread(item.weaponId) * 0.5;
    const eye = this.getEyePosition();
    const aimDir = this.computeCrosshairParallaxAimDir(
      eye,
      Math.max(0, def.pierceBuildCount ?? 1),
    );

    this.isFiring = true;
    const res = this.weapons.fireWeapon({
      actor: this.getCombatActor(),
      item,
      origin: eye,
      aimDir,
      muzzlePos: this.muzzleWorldPos ?? eye,
      spreadRad,
      isPlayer: true,
      vehicleBridge: this.vehicleBridge,
      stationBridge: this.stationBridge,
      riftCaptureBridge: this.riftCaptureBridge,
      chapterBridge: this.chapterBridge,
      overdriveBridge: this.overdriveBridge,
      hasDemolisher: this.augmentManager.hasAugment('demolisher'),
      hasFirstAssault: this.augmentManager.hasAugment('first_assault'),
      hasCombatMedallion: this.hasMedallion('medallion_combat'),
      ...this.buildWeaponFireExtras(item),
      onAmmoConsumed: () => {
        if (def.magSize > 0 && item.magAmmo > 0) {
          item.magAmmo -= 1;
        }
      },
    });

    this.recordWeaponFireResult(res, item, def);
  }

  /**
   * Executes a Kinetic Blade RMB forward+up dash, consuming 1 dash charge and striking targets along the path.
   */
  private tryKineticDash(): boolean {
    if (
      this.phase !== 'playing' ||
      !this.isAlive() ||
      this.activeVehicleId !== null ||
      this.isBuildMode ||
      this.building.getEditState().active
    ) {
      return false;
    }
    const item = this.inventory.getActiveItem();
    if (!item || item.weaponId !== 'kinetic_blade') return false;

    this.isAiming = false;
    this.isScoped = false;

    if (this.kineticDashCharges <= 0) {
      this.eventBus.emit('sound:play', {
        id: 'dryfire',
        position: { ...this.position },
        spatial: true,
      });
      return false;
    }

    this.kineticDashCharges -= 1;
    this.stealthBreakTimer = STEALTH_FIRE_BREAK_SEC;
    this.isStealthed = false;
    if (this.activeZipline) {
      this.activeZipline = null;
      this.ziplineCooldown = 0.5;
    }
    if (this.activeGrindRail) {
      this.activeGrindRail = null;
      this.grindRailCooldown = 0.5;
    }
    this.cancelPartnerReboot();
    this.isMantling = false;
    this.isSliding = false;
    this.isCrouching = false;
    this.isEmoting = false;
    this.activeEmote = null;
    this.healTimer = 0;
    this.healLabel = null;
    this.reloadTimer = 0;

    const lookDir = this.getLookDirection();
    const horizLen = Math.hypot(lookDir.x, lookDir.z);
    const fwdX = horizLen > 1e-4 ? lookDir.x / horizLen : Math.sin(this.yaw);
    const fwdZ = horizLen > 1e-4 ? lookDir.z / horizLen : Math.cos(this.yaw);

    this.grounded = false;
    this.wasAirborne = true;
    this.fallPeakY = this.position.y;
    this.fallImmune = true;
    this.velocity.x = fwdX * 18;
    this.velocity.z = fwdZ * 18;
    this.velocity.y = Math.max(
      this.velocity.y,
      7.5 + Math.max(0, lookDir.y) * 5.0,
    );
    this.harvestSwingTimer = 0.35;

    const from: Vec3Like = {
      x: this.position.x,
      y: this.position.y + 1.0,
      z: this.position.z,
    };
    const rawDashDir = {
      x: fwdX,
      y: clamp(Math.max(0, lookDir.y) * 0.45 + 0.1, 0.05, 0.5),
      z: fwdZ,
    };
    const dLen = Math.hypot(rawDashDir.x, rawDashDir.y, rawDashDir.z) || 1;
    const dashDir = {
      x: rawDashDir.x / dLen,
      y: rawDashDir.y / dLen,
      z: rawDashDir.z / dLen,
    };
    const dashLen = 11.5;
    const terrainHit = this.collision.raycastWorld(from, dashDir, dashLen, {
      checkBuilds: false,
      checkProps: false,
    });
    const actualLen = terrainHit.hit ? Math.max(1.5, terrainHit.distance) : dashLen;
    const to: Vec3Like = {
      x: from.x + dashDir.x * actualLen,
      y: from.y + dashDir.y * actualLen,
      z: from.z + dashDir.z * actualLen,
    };

    this.weapons.executeKineticDash({
      actor: this.getCombatActor(),
      item,
      from,
      to,
      radius: 2.8,
      damage: 50,
      isPlayer: true,
      vehicleBridge: this.vehicleBridge,
      stationBridge: this.stationBridge,
      riftCaptureBridge: this.riftCaptureBridge,
      chapterBridge: this.chapterBridge,
      hasDemolisher: this.augmentManager.hasAugment('demolisher'),
      hasCombatMedallion: this.hasMedallion('medallion_combat'),
    });

    return true;
  }

  /**
   * Executes a Titan Shockwave Hammer RMB Kinetic Bounce Leap, consuming 1 charge.
   */
  private tryHammerBounce(): boolean {
    if (
      this.phase !== 'playing' ||
      !this.isAlive() ||
      this.isKnocked ||
      this.activeVehicleId !== null ||
      this.isBuildMode ||
      this.building.getEditState().active
    ) {
      return false;
    }
    const item = this.inventory.getActiveItem();
    if (!item || item.weaponId !== 'shockwave_hammer') return false;

    this.isAiming = false;
    this.isScoped = false;

    if (this.hammerCharges <= 0) {
      this.eventBus.emit('sound:play', {
        id: 'dryfire',
        position: { ...this.position },
        spatial: true,
      });
      return false;
    }

    this.hammerCharges -= 1;
    this.stealthBreakTimer = STEALTH_FIRE_BREAK_SEC;
    this.isStealthed = false;
    if (this.activeZipline) {
      this.activeZipline = null;
      this.ziplineCooldown = 0.5;
    }
    if (this.activeGrindRail) {
      this.activeGrindRail = null;
      this.grindRailCooldown = 0.5;
    }
    this.cancelPartnerRevive();
    this.cancelPartnerReboot();
    this.cancelTrainChestHack();
    this.isMantling = false;
    this.isSliding = false;
    this.isCrouching = false;
    this.isEmoting = false;
    this.activeEmote = null;
    this.healTimer = 0;
    this.healLabel = null;
    this.reloadTimer = 0;

    const lookDir = this.getLookDirection();
    const horizLen = Math.hypot(lookDir.x, lookDir.z);
    const fwdX = horizLen > 1e-4 ? lookDir.x / horizLen : Math.sin(this.yaw);
    const fwdZ = horizLen > 1e-4 ? lookDir.z / horizLen : Math.cos(this.yaw);

    this.grounded = false;
    this.wasAirborne = true;
    this.fallPeakY = this.position.y;
    this.fallImmune = true;
    this.velocity.x = fwdX * HAMMER_BOUNCE_IMPULSE_FWD;
    this.velocity.z = fwdZ * HAMMER_BOUNCE_IMPULSE_FWD;
    this.velocity.y = HAMMER_BOUNCE_IMPULSE_Y;
    this.harvestSwingTimer = 0.35;

    const bouncePos = { ...this.position };
    this.eventBus.emit('vfx:hammer_bounce', { position: bouncePos });
    this.eventBus.emit('sound:play', {
      id: 'hammer_bounce',
      position: bouncePos,
      spatial: true,
    });
    this.eventBus.emit('vfx:camera_shake', {
      intensity: 0.32,
      duration: 0.18,
    });
    return true;
  }

  private computeCrosshairParallaxAimDir(fireOrigin: Vec3Like, ignoreBuildCount = 0): Vec3Like {
    const camDir = this.getLookDirection();
    const camPos: Vec3Like = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
    };

    // If camera has not been synced to the current player position yet (e.g. headless test after teleport/setLook), aim directly along lookDir
    if (dist3D(camPos, fireOrigin) > 10) {
      return camDir;
    }

    const ignoreBuildIds: string[] = [];
    let hit = this.collision.raycastWorld(camPos, camDir, 240, {
      checkBuilds: true,
      checkProps: true,
      props: this.propsBridge.getProps(),
    });
    for (let i = 0; i < ignoreBuildCount; i++) {
      if (!hit.hit || hit.targetType !== 'build' || !hit.targetId) break;
      ignoreBuildIds.push(hit.targetId);
      hit = this.collision.raycastWorld(camPos, camDir, 240, {
        checkBuilds: true,
        checkProps: true,
        props: this.propsBridge.getProps(),
        ignoreBuildPieceIds: ignoreBuildIds,
      });
    }

    // Ensure aim point is reasonably ahead of player so wall hug doesn't skew shot sideways
    const minDist = 4.5;
    const targetDist = hit.hit ? Math.max(minDist, hit.distance) : 180;
    const aimPoint = {
      x: camPos.x + camDir.x * targetDist,
      y: camPos.y + camDir.y * targetDist,
      z: camPos.z + camDir.z * targetDist,
    };

    const dx = aimPoint.x - fireOrigin.x;
    const dy = aimPoint.y - fireOrigin.y;
    const dz = aimPoint.z - fireOrigin.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  private computeCurrentSpread(weaponId: WeaponId): number {
    const def = WEAPONS[weaponId];
    const activeItem = this.inventory.getActiveItem();
    const mods =
      activeItem && activeItem.weaponId === weaponId ? activeItem.mods : undefined;
    const modFx = getWeaponModEffects(mods);
    let spread = this.isAiming
      ? def.adsSpread * modFx.adsSpreadMult
      : def.baseSpread;
    if (this.isCrouching || this.isSliding) spread *= def.crouchSpreadMult;
    if (this.moveSpeed > 0.8) spread += def.moveSpreadAdd;
    spread += this.bloom;
    return Math.max(0, spread);
  }

  private findRepairableBuildPiece(): BuildPiece | null {
    if (this.phase !== 'playing' || this.building.getEditState().active) return null;
    const eye = this.getEyePosition();
    const lookDir = this.getLookDirection();
    const hit = this.collision.raycastWorld(eye, lookDir, 5.8, {
      checkBuilds: true,
      checkProps: false,
    });
    if (!hit.hit || hit.targetType !== 'build' || !hit.targetId) return null;
    const piece = this.building.getPieceById(hit.targetId);
    if (!piece || piece.ownerId !== 'player') return null;
    if (piece.hp <= 0 || piece.hp >= piece.maxHp - 0.5) return null;
    return piece;
  }

  repairTargetedBuild(): boolean {
    if (this.gameMode === 'zero_build') return false;
    const piece = this.findRepairableBuildPiece();
    if (!piece) return false;
    const avail = this.inventory.getMaterials()[piece.material] ?? 0;
    if (avail <= 0) return false;
    const res = this.building.repairPiece(piece.id, avail);
    if (!res.repaired) return false;
    this.inventory.spendMaterial(piece.material, res.cost);
    this.canRepairBuild = false;
    return true;
  }

  startSlide(): boolean {
    if (
      this.phase !== 'playing' ||
      this.isKnocked ||
      !this.grounded ||
      this.isSliding ||
      this.isMantling ||
      this.activeZipline ||
      this.isSwimming
    ) {
      return false;
    }
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    let dx: number;
    let dz: number;
    if (horizSpeed > 1.0) {
      dx = this.velocity.x / horizSpeed;
      dz = this.velocity.z / horizSpeed;
    } else {
      dx = Math.sin(this.yaw);
      dz = Math.cos(this.yaw);
    }
    this.isSliding = true;
    this.slideTimer = 0.9;
    this.isCrouching = false;
    this.isSprinting = false;
    this.isEmoting = false;
    this.activeEmote = null;
    this.slideDir = { x: dx, z: dz };
    this.slideSpeed = clamp(Math.max(13.8, horizSpeed * 1.45), 13.8, 18.5);
    this.velocity.x = dx * this.slideSpeed;
    this.velocity.z = dz * this.slideSpeed;
    this.slideDustTimer = 0;
    this.slideSoundTimer = 0;

    this.eventBus.emit('vfx:slide_dust', {
      position: { ...this.position },
      biome: this.terrain.getBiomeAt(this.position.x, this.position.z),
    });
    this.eventBus.emit('sound:play', {
      id: 'slide_loop',
      position: { ...this.position },
      volume: 0.55,
      spatial: true,
    });
    this.slideDustTimer = 0.08;
    this.slideSoundTimer = 0.28;
    return true;
  }

  tryMantle(): boolean {
    if (
      this.phase !== 'playing' ||
      this.isKnocked ||
      this.isMantling ||
      this.activeZipline ||
      this.isSwimming
    ) {
      return false;
    }
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const probeDists = [0.55, 0.78, 1.0, 1.2];

    for (let i = 0; i < probeDists.length; i++) {
      const dist = probeDists[i];
      const px = this.position.x + fwdX * dist;
      const pz = this.position.z + fwdZ * dist;
      const topY = this.collision.getFloorHeightAt(px, pz, this.position.y, 2.35);
      const deltaY = topY - this.position.y;
      if (deltaY < 1.1 || deltaY > 2.35) continue;

      const upPlayerClear = this.collision.raycastWorld(
        { x: this.position.x, y: this.position.y + 0.4, z: this.position.z },
        { x: 0, y: 1, z: 0 },
        deltaY + 0.45,
        { checkBuilds: true, checkProps: false },
      );
      if (upPlayerClear.hit) continue;

      const fwdClear = this.collision.raycastWorld(
        { x: this.position.x, y: topY + 0.45, z: this.position.z },
        { x: fwdX, y: 0, z: fwdZ },
        dist,
        { checkBuilds: true, checkProps: false },
      );
      if (fwdClear.hit) continue;

      const topHeadroom = this.collision.raycastWorld(
        { x: px, y: topY + 0.15, z: pz },
        { x: 0, y: 1, z: 0 },
        PLAYER_HEIGHT - 0.15,
        { checkBuilds: true, checkProps: false },
      );
      if (topHeadroom.hit) continue;

      this.isMantling = true;
      this.mantleTimer = 0;
      this.mantleDuration = 0.28;
      this.mantleStartPos = { ...this.position };
      this.mantleEndPos = { x: px, y: topY, z: pz };
      this.isCrouching = false;
      this.isSliding = false;
      this.isSprinting = false;
      this.velocity = { x: 0, y: 0, z: 0 };
      this.grounded = false;
      this.wasAirborne = false;
      this.fallPeakY = topY;
      this.eventBus.emit('sound:play', {
        id: 'mantle_climb',
        position: { ...this.position },
        spatial: true,
      });
      return true;
    }

    return false;
  }

  private getActiveVehicleEntity() {
    if (!this.activeVehicleId || !this.vehicleBridge) return null;
    const vehicles = this.vehicleBridge.getVehicles();
    for (let i = 0; i < vehicles.length; i++) {
      if (vehicles[i].id === this.activeVehicleId) {
        return vehicles[i];
      }
    }
    return null;
  }

  private exitActiveVehicle(withCooldown: boolean): boolean {
    if (!this.activeVehicleId) return false;
    const exitingVeh = this.getActiveVehicleEntity();
    if (
      exitingVeh &&
      this.lastOverdriveApplied &&
      this.lastOverdriveApplied.id === exitingVeh.id
    ) {
      exitingVeh.vx = this.lastOverdriveApplied.baseVx;
      exitingVeh.vz = this.lastOverdriveApplied.baseVz;
    }
    this.lastOverdriveApplied = null;
    const exitPos =
      this.vehicleBridge?.exitVehicle(this.activeVehicleId, 'player') ?? null;
    this.activeVehicleId = null;
    if (withCooldown) {
      this.vehicleCooldown = 0.35;
    }
    if (exitPos) {
      const groundY = this.collision.getFloorHeightAt(
        exitPos.x,
        exitPos.z,
        exitPos.y + 0.5,
      );
      this.position = {
        x: clamp(exitPos.x, -390, 390),
        y: Math.max(exitPos.y, groundY),
        z: clamp(exitPos.z, -390, 390),
      };
    }
    this.velocity = { x: 0, y: 0, z: 0 };
    this.moveSpeed = 0;
    this.grounded = true;
    this.wasAirborne = false;
    this.fallPeakY = this.position.y;
    return true;
  }

  private getWeaponUpgradeSpec(
    item: ItemInstance | null,
    slotIndex: number,
  ): {
    item: ItemInstance;
    cost: number;
    nextRarity: Rarity;
    shortName: string;
    magSize: number;
  } | null {
    if (slotIndex < 1 || slotIndex > 5 || !item) return null;
    if (item.weaponId === 'pickaxe') return null;
    const def = WEAPONS[item.weaponId];
    if (!def || def.isConsumable || def.isThrowable || def.isGrappler || def.isJetpack) {
      return null;
    }
    if (
      item.rarity !== 'common' &&
      item.rarity !== 'uncommon' &&
      item.rarity !== 'rare' &&
      item.rarity !== 'epic'
    ) {
      return null;
    }
    const cost = UPGRADE_COSTS[item.rarity];
    const nextRarity = RARITY_ORDER[RARITY_ORDER.indexOf(item.rarity) + 1];
    return {
      item,
      cost,
      nextRarity,
      shortName: def.shortName,
      magSize: getItemMagCapacity(item),
    };
  }

  private deductMaterialsProportionally(cost: number): boolean {
    const mats = this.inventory.getMaterials();
    const total = mats.wood + mats.brick + mats.metal;
    if (total < cost || cost <= 0) return total >= cost;

    const types: MaterialType[] = ['wood', 'brick', 'metal'];
    const shares: Record<MaterialType, number> = { wood: 0, brick: 0, metal: 0 };
    for (const m of types) {
      const avail = mats[m];
      if (avail > 0) {
        shares[m] = Math.min(avail, Math.floor((avail / total) * cost));
      }
    }

    let deficit = cost - (shares.wood + shares.brick + shares.metal);
    if (deficit > 0) {
      const order = [...types].sort((a, b) => {
        const fracA = (mats[a] / total) * cost - shares[a];
        const fracB = (mats[b] / total) * cost - shares[b];
        if (Math.abs(fracB - fracA) > 1e-9) return fracB - fracA;
        return mats[b] - shares[b] - (mats[a] - shares[a]);
      });
      for (const m of order) {
        if (deficit <= 0) break;
        const canTake = mats[m] - shares[m];
        if (canTake > 0) {
          const take = Math.min(canTake, deficit);
          shares[m] += take;
          deficit -= take;
        }
      }
    }

    for (const m of types) {
      if (shares[m] > 0) {
        this.inventory.spendMaterial(m, shares[m]);
      }
    }
    return true;
  }

  private findNearestInteractable(): {
    kind:
      | 'revive_partner'
      | 'reboot_van'
      | 'train_chest'
      | 'hop_crystal'
      | 'dropped_medallion'
      | 'dropped_crown'
      | 'weapon_bunker'
      | 'chest'
      | 'llama'
      | 'supply_drop'
      | 'loot_drop'
      | 'vault'
      | 'vehicle'
      | 'rift'
      | 'upgrade_bench'
      | 'campfire'
      | 'vending_machine'
      | 'npc_specialist'
      | 'mod_bench'
      | 'forecast_tower'
      | 'shield_mushroom'
      | 'fishing_hole'
      | 'sky_balloon';
    id: string;
    prompt: PlayerInteractPrompt;
  } | null {
    if (this.isKnocked) return null;
    const interactKey = this.formatKeyLabel(this.getResolvedKeybinds().interact);

    if (this.duoReviveBridge) {
      const downedPartner = this.duoReviveBridge.getPartnerDownedNearby(this.position);
      if (downedPartner) {
        const partnerName = downedPartner.name ?? 'PARTNER';
        return {
          kind: 'revive_partner',
          id: downedPartner.id ?? 'duo_partner',
          prompt: {
            label: `HOLD [${interactKey}] REVIVE ${partnerName}`,
            key: interactKey,
            rarity: 'rare',
          },
        };
      }
    }

    if (
      this.overdriveBridge &&
      this.duoRebootBridge &&
      this.duoRebootBridge.hasPartnerRebootCard()
    ) {
      const vans = this.overdriveBridge.getRebootVans();
      let bestVan: { van: (typeof vans)[number]; dist: number } | null = null;
      for (let i = 0; i < vans.length; i++) {
        const van = vans[i];
        const d = dist3D(this.position, { x: van.x, y: van.y, z: van.z });
        if (d <= 5.0 && (!bestVan || d < bestVan.dist)) {
          bestVan = { van, dist: d };
        }
      }
      if (bestVan && bestVan.van.available) {
        return {
          kind: 'reboot_van',
          id: bestVan.van.id,
          prompt: {
            label: `HOLD [${interactKey}] REBOOT PARTNER`,
            key: interactKey,
            rarity: 'rare',
          },
        };
      }
    }

    let bestDist = Infinity;
    let best: {
      kind:
        | 'revive_partner'
        | 'reboot_van'
        | 'train_chest'
        | 'hop_crystal'
        | 'dropped_medallion'
        | 'dropped_crown'
        | 'weapon_bunker'
        | 'chest'
        | 'llama'
        | 'supply_drop'
        | 'loot_drop'
        | 'vault'
        | 'vehicle'
        | 'rift'
        | 'upgrade_bench'
        | 'campfire'
        | 'vending_machine'
        | 'npc_specialist'
        | 'mod_bench'
        | 'forecast_tower'
        | 'shield_mushroom'
        | 'fishing_hole'
        | 'sky_balloon';
      id: string;
      prompt: PlayerInteractPrompt;
    } | null = null;

    if (this.chapterBridge) {
      const droppedMeds = this.chapterBridge.getDroppedMedallions();
      for (let i = 0; i < droppedMeds.length; i++) {
        const dm = droppedMeds[i];
        if (dm.collected || this.hasMedallion(dm.medallionId)) continue;
        const d = dist3D(this.position, { x: dm.x, y: dm.y, z: dm.z });
        if (d <= 3.0 && d < bestDist) {
          bestDist = d;
          const medName =
            MEDALLIONS.find((m) => m.id === dm.medallionId)?.name ?? dm.medallionId;
          best = {
            kind: 'dropped_medallion',
            id: dm.id,
            prompt: {
              label: `Equip ${medName}`,
              key: interactKey,
              rarity: 'mythic',
            },
          };
        }
      }

      if (!this.victoryCrown) {
        const droppedCrowns = this.chapterBridge.getDroppedCrowns();
        for (let i = 0; i < droppedCrowns.length; i++) {
          const dc = droppedCrowns[i];
          if (dc.collected) continue;
          const d = dist3D(this.position, { x: dc.x, y: dc.y, z: dc.z });
          if (d <= 3.0 && d < bestDist) {
            bestDist = d;
            best = {
              kind: 'dropped_crown',
              id: dc.id,
              prompt: {
                label: 'Claim Victory Crown',
                key: interactKey,
                rarity: 'mythic',
              },
            };
          }
        }
      }

      const bunkers = this.chapterBridge.getWeaponBunkers();
      for (let i = 0; i < bunkers.length; i++) {
        const wb = bunkers[i];
        if (wb.looted) continue;
        const d = dist3D(this.position, { x: wb.x, y: wb.y, z: wb.z });
        if (d <= 4.5 && d < bestDist) {
          bestDist = d;
          best = {
            kind: 'weapon_bunker',
            id: wb.id,
            prompt: {
              label: wb.unlocked
                ? 'OPEN WEAPON BUNKER'
                : `WEAPON BUNKER LOCKED (STORM ${wb.unlockAtStormPhase})`,
              key: interactKey,
              rarity: wb.unlocked ? 'legendary' : 'epic',
            },
          };
        }
      }
    }

    const chests = this.propsBridge.getChests();
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i];
      if (c.opened) continue;
      const d = dist3D(this.position, { x: c.x, y: c.y, z: c.z });
      if (d <= 3.0 && d < bestDist) {
        bestDist = d;
        best = {
          kind: 'chest',
          id: c.id,
          prompt: { label: 'Open Chest', key: interactKey, rarity: 'rare' },
        };
      }
    }

    const llamas = this.propsBridge.getLlamas?.() ?? [];
    for (let i = 0; i < llamas.length; i++) {
      const l = llamas[i];
      if (l.opened) continue;
      const d = dist3D(this.position, { x: l.x, y: l.y, z: l.z });
      if (d <= 3.2 && d < bestDist) {
        bestDist = d;
        best = {
          kind: 'llama',
          id: l.id,
          prompt: { label: 'Open Loot Llama', key: interactKey, rarity: 'legendary' },
        };
      }
    }

    const sds = this.propsBridge.getSupplyDrops();
    for (let i = 0; i < sds.length; i++) {
      const sd = sds[i];
      if (sd.state !== 'landed') continue;
      const d = dist3D(this.position, { x: sd.x, y: sd.y, z: sd.z });
      if (d <= 3.4 && d < bestDist) {
        bestDist = d;
        best = {
          kind: 'supply_drop',
          id: sd.id,
          prompt: { label: 'Open Supply Drop', key: interactKey, rarity: 'legendary' },
        };
      }
    }

    const drops = this.propsBridge.getLootDrops();
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      const d = dist3D(this.position, { x: drop.x, y: drop.y, z: drop.z });
      if (d <= 2.8 && d < bestDist) {
        bestDist = d;
        let prompt: PlayerInteractPrompt = { label: 'Pick up', key: interactKey };
        if (drop.item) {
          const def = WEAPONS[drop.item.weaponId];
          prompt = {
            label: `Pick up ${def.name}`,
            key: interactKey,
            rarity: drop.item.rarity,
          };
        } else if (drop.materials) {
          prompt = {
            label: `+${drop.materials.amount} ${drop.materials.type.toUpperCase()}`,
            key: interactKey,
          };
        } else if (drop.ammo) {
          prompt = {
            label: `+${drop.ammo.amount} ${drop.ammo.type.toUpperCase()} Ammo`,
            key: interactKey,
          };
        }
        best = { kind: 'loot_drop', id: drop.id, prompt };
      }
    }

    const vaults = this.vaultBridge?.getVaults() ?? [];
    for (let i = 0; i < vaults.length; i++) {
      const vault = vaults[i];
      if (vault.unlocked) continue;
      const d = dist3D(this.position, { x: vault.x, y: vault.y, z: vault.z });
      if (d <= 4.2 && d < bestDist) {
        bestDist = d;
        best = {
          kind: 'vault',
          id: vault.id,
          prompt: {
            label:
              this.vaultKeys > 0
                ? 'Unlock Boss Vault'
                : 'Unlock Boss Vault (Need Key)',
            key: interactKey,
            rarity: this.vaultKeys > 0 ? 'mythic' : 'legendary',
          },
        };
      }
    }

    if (this.vehicleCooldown <= 0 && this.vehicleBridge) {
      const vehicles = this.vehicleBridge.getVehicles();
      for (let i = 0; i < vehicles.length; i++) {
        const veh = vehicles[i];
        if (veh.destroyed || veh.hp <= 0 || veh.driverId !== null) continue;
        const d = dist3D(this.position, { x: veh.x, y: veh.y, z: veh.z });
        if (d <= 3.8 && d < bestDist) {
          bestDist = d;
          best = {
            kind: 'vehicle',
            id: veh.id,
            prompt: {
              label:
                veh.kind === 'cyber_bike'
                  ? 'Drive Cyber Bike'
                  : veh.kind === 'speedboat'
                    ? 'Drive Speedboat'
                    : 'Drive Hover ATV',
              key: interactKey,
              rarity: 'rare',
            },
          };
        }
      }
    }

    if (this.riftCooldown <= 0 && this.riftCaptureBridge) {
      const rifts = this.riftCaptureBridge.getRifts();
      for (let i = 0; i < rifts.length; i++) {
        const rift = rifts[i];
        if (!rift.active) continue;
        const horiz = dist2D(this.position.x, this.position.z, rift.x, rift.z);
        const dy = Math.abs(this.position.y - rift.y);
        if (horiz <= 3.8 && dy <= 3.2) {
          const d = dist3D(this.position, { x: rift.x, y: rift.y, z: rift.z });
          if (d < bestDist) {
            bestDist = d;
            best = {
              kind: 'rift',
              id: rift.id,
              prompt: {
                label: 'ENTER SKY RIFT',
                key: interactKey,
                rarity: 'epic',
              },
            };
          }
        }
      }
    }

    if (this.skyforgeBridge) {
      const trainState = this.skyforgeBridge.getTrainState();
      if (
        (!trainState || (trainState.active && !trainState.chestHacked)) &&
        this.skyforgeBridge.isNearTrainChest(this.position)
      ) {
        const chestPos = trainState?.carPositions?.[1] ?? trainState;
        const d = chestPos
          ? Math.min(2.2, dist3D(this.position, chestPos))
          : 1.5;
        if (d < bestDist) {
          bestDist = d;
          best = {
            kind: 'train_chest',
            id: 'apex_train_chest',
            prompt: {
              label: `HOLD [${interactKey}] HACK TRAIN CHEST`,
              key: interactKey,
              rarity: 'mythic',
            },
          };
        }
      }

      const crater = this.skyforgeBridge.findNearbyHopCrystal(this.position);
      if (crater && crater.crystalAvailable) {
        const d = Math.min(
          2.4,
          dist3D(this.position, { x: crater.x, y: crater.y, z: crater.z }),
        );
        if (d < bestDist) {
          bestDist = d;
          best = {
            kind: 'hop_crystal',
            id: crater.id,
            prompt: {
              label: 'CONSUME HOP CRYSTAL (LOW-G)',
              key: interactKey,
              rarity: 'epic',
            },
          };
        }
      }
    }

    if (this.tideBridge) {
      const mushroom = this.tideBridge.findNearbyShieldMushroom(this.position);
      if (mushroom && mushroom.available) {
        const d = Math.min(
          2.4,
          dist3D(this.position, {
            x: mushroom.x,
            y: mushroom.y,
            z: mushroom.z,
          }),
        );
        if (d < bestDist) {
          bestDist = d;
          best = {
            kind: 'shield_mushroom',
            id: mushroom.id,
            prompt: {
              label: `EAT SHIELD MUSHROOM (+${SHIELD_MUSHROOM_AMOUNT} SHIELD)`,
              key: interactKey,
              rarity: 'uncommon',
            },
          };
        }
      }
    }

    if (this.overlordBridge) {
      const hole = this.overlordBridge.findNearbyFishingHole(this.position);
      if (hole && !hole.depleted && hole.castsRemaining > 0) {
        const d = Math.min(
          3.5,
          dist3D(this.position, { x: hole.x, y: hole.y, z: hole.z }),
        );
        if (d < bestDist) {
          bestDist = d;
          best = {
            kind: 'fishing_hole',
            id: hole.id,
            prompt: {
              label: `CAST FISHING LINE (${hole.castsRemaining} LEFT)`,
              key: interactKey,
              rarity: 'rare',
            },
          };
        }
      }

      const balloon = this.overlordBridge.findNearbySkyBalloon(this.position);
      if (balloon) {
        const d = Math.min(
          3.0,
          dist3D(this.position, {
            x: balloon.x,
            y: balloon.baseY,
            z: balloon.z,
          }),
        );
        if (d < bestDist) {
          bestDist = d;
          best = {
            kind: 'sky_balloon',
            id: balloon.id,
            prompt: {
              label: 'ASCEND SKY BALLOON',
              key: interactKey,
              rarity: 'epic',
            },
          };
        }
      }
    }

    if (best === null) {
      if (this.stationBridge) {
        const upgradeSpec = this.getWeaponUpgradeSpec(
          this.inventory.getActiveItem(),
          this.inventory.getActiveSlotIndex(),
        );
        if (upgradeSpec) {
          const benches = this.stationBridge.getUpgradeBenches();
          for (let i = 0; i < benches.length; i++) {
            const bench = benches[i];
            const d = dist3D(this.position, { x: bench.x, y: bench.y, z: bench.z });
            if (d <= 3.8 && d < bestDist) {
              bestDist = d;
              best = {
                kind: 'upgrade_bench',
                id: bench.id,
                prompt: {
                  label: `UPGRADE ${upgradeSpec.shortName} (${upgradeSpec.cost} MATS)`,
                  key: interactKey,
                  rarity: upgradeSpec.nextRarity,
                },
              };
            }
          }
        }

        const campfires = this.stationBridge.getCampfires();
        for (let i = 0; i < campfires.length; i++) {
          const cf = campfires[i];
          if (cf.lit || cf.remainingSec <= 0) continue;
          const d = dist3D(this.position, { x: cf.x, y: cf.y, z: cf.z });
          if (d <= 3.6 && d < bestDist) {
            bestDist = d;
            best = {
              kind: 'campfire',
              id: cf.id,
              prompt: {
                label: 'STOKE CAMPFIRE',
                key: interactKey,
              },
            };
          }
        }
      }

      if (this.economyBridge) {
        const machines: VendingMachineEntity[] =
          this.economyBridge.getVendingMachines();
        for (let i = 0; i < machines.length; i++) {
          const vm = machines[i];
          if (vm.stock <= 0) continue;
          const d = dist3D(this.position, { x: vm.x, y: vm.y, z: vm.z });
          if (d <= 3.8 && d < bestDist) {
            bestDist = d;
            const shortName =
              WEAPONS[vm.offerWeaponId]?.shortName ?? vm.offerWeaponId.toUpperCase();
            best = {
              kind: 'vending_machine',
              id: vm.id,
              prompt: {
                label: `BUY ${shortName} (${vm.priceGold} GOLD)`,
                key: interactKey,
                rarity: vm.offerRarity,
              },
            };
          }
        }

        const npcs: NpcSpecialistEntity[] = this.economyBridge.getNpcSpecialists();
        for (let i = 0; i < npcs.length; i++) {
          const npc = npcs[i];
          if (npc.hiredBy) continue;
          const d = dist3D(this.position, { x: npc.x, y: npc.y, z: npc.z });
          if (d <= 4.0 && d < bestDist) {
            bestDist = d;
            best = {
              kind: 'npc_specialist',
              id: npc.id,
              prompt: {
                label: `HIRE ${npc.name} • ${npc.role.toUpperCase()} (${npc.priceGold} GOLD)`,
                key: interactKey,
              },
            };
          }
        }
      }

      if (this.frontierBridge) {
        const activeItem = this.inventory.getActiveItem();
        const activeSlot = this.inventory.getActiveSlotIndex();
        if (this.isModdableFirearm(activeItem, activeSlot)) {
          const nextMod = this.getNextInstallableMod(activeItem);
          if (nextMod) {
            const modDef = WEAPON_MODS.find((m) => m.id === nextMod);
            const weaponShort =
              WEAPONS[activeItem.weaponId]?.shortName ??
              activeItem.weaponId.toUpperCase();
            const modLabel = modDef?.name.toUpperCase() ?? nextMod.toUpperCase();
            const modBenches = this.frontierBridge.getModBenches();
            for (let i = 0; i < modBenches.length; i++) {
              const mb = modBenches[i];
              const d = dist3D(this.position, { x: mb.x, y: mb.y, z: mb.z });
              if (d <= 3.8 && d < bestDist) {
                bestDist = d;
                best = {
                  kind: 'mod_bench',
                  id: mb.id,
                  prompt: {
                    label: `MOD ${weaponShort}: ${modLabel} (${WEAPON_MOD_COST_GOLD} GOLD)`,
                    key: interactKey,
                    rarity: 'rare',
                  },
                };
              }
            }
          }
        }

        const towers = this.frontierBridge.getForecastTowers();
        for (let i = 0; i < towers.length; i++) {
          const tower = towers[i];
          if (tower.scanned) continue;
          const d = dist3D(this.position, { x: tower.x, y: tower.y, z: tower.z });
          if (d <= 4.2 && d < bestDist) {
            bestDist = d;
            best = {
              kind: 'forecast_tower',
              id: tower.id,
              prompt: {
                label: 'SCAN FORECAST TOWER (+100 GOLD)',
                key: interactKey,
                rarity: 'epic',
              },
            };
          }
        }
      }
    }

    return best;
  }

  private tryInteract(): void {
    if (this.phase !== 'playing' || this.isKnocked) return;

    if (this.activeVehicleId !== null) {
      this.exitActiveVehicle(true);
      return;
    }

    if (this.activeGrindRail) {
      this.detachGrindRail(false);
      return;
    }

    if (this.activeZipline) {
      this.detachZipline(true);
      return;
    }

    const candidate = this.findNearestInteractable();
    if (candidate) {
      if (candidate.kind === 'reboot_van' && this.overdriveBridge && this.duoRebootBridge) {
        const van = this.overdriveBridge
          .getRebootVans()
          .find((v) => v.id === candidate.id);
        if (!van || !van.available || !this.duoRebootBridge.hasPartnerRebootCard()) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        if (!this.isRebootingPartner) {
          this.reloadTimer = 0;
          this.healTimer = 0;
          this.healLabel = null;
          this.isDrawingBow = false;
          this.bowDrawElapsed = 0;
          this.bowCharge = 0;
          this.isChargingRailgun = false;
          this.railgunChargeElapsed = 0;
          this.railgunCharge = 0;
          this.isRebootingPartner = true;
          this.rebootTimer = 0;
          this.rebootTickSoundTimer = 0.85;
          this.activeRebootVanId = van.id;
          const vanPos = { x: van.x, y: van.y, z: van.z };
          this.eventBus.emit('sound:play', {
            id: 'reboot_channel',
            position: vanPos,
            spatial: true,
          });
          this.eventBus.emit('vfx:reboot_beam', {
            position: vanPos,
            progress: 0,
          });
          this.eventBus.emit('audio:noise', {
            position: vanPos,
            kind: 'gunfire',
            sourceId: 'player',
            radius: 135,
          });
        }
        return;
      }

      if (candidate.kind === 'revive_partner' && this.duoReviveBridge) {
        const downedPartner = this.duoReviveBridge.getPartnerDownedNearby(this.position);
        if (downedPartner && !this.isRevivingPartner) {
          this.reloadTimer = 0;
          this.healTimer = 0;
          this.healLabel = null;
          this.isDrawingBow = false;
          this.bowDrawElapsed = 0;
          this.bowCharge = 0;
          this.isRevivingPartner = true;
          this.reviveTimer = 0;
          this.reviveTickSoundTimer = 0.5;
          this.reviveLabel = `REVIVING ${downedPartner.name ?? 'PARTNER'}`;
          this.eventBus.emit('sound:play', {
            id: 'revive_tick',
            position: { ...downedPartner.position },
            spatial: true,
          });
          this.eventBus.emit('vfx:revive_beam', {
            position: { ...downedPartner.position },
            progress: 0,
          });
        }
        return;
      }

      if (candidate.kind === 'dropped_medallion' && this.chapterBridge) {
        const dm = this.chapterBridge
          .getDroppedMedallions()
          .find((m) => m.id === candidate.id);
        const picked = this.chapterBridge.collectNearbyMedallion(
          dm ? dm.x : this.position.x,
          dm ? dm.z : this.position.z,
          3.2,
        );
        if (picked) {
          const medId = typeof picked === 'string' ? picked : picked.medallionId;
          this.addMedallion(medId);
          this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        }
        return;
      }

      if (candidate.kind === 'dropped_crown' && this.chapterBridge) {
        const dc = this.chapterBridge
          .getDroppedCrowns()
          .find((c) => c.id === candidate.id);
        const picked = this.chapterBridge.collectNearbyCrown(
          dc ? dc.x : this.position.x,
          dc ? dc.z : this.position.z,
          3.2,
        );
        if (picked) {
          this.claimDroppedCrown();
          this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        }
        return;
      }

      if (candidate.kind === 'weapon_bunker' && this.chapterBridge) {
        const bunker = this.chapterBridge
          .getWeaponBunkers()
          .find((b) => b.id === candidate.id);
        if (!bunker || !bunker.unlocked || bunker.looted) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        const loot = this.chapterBridge.lootWeaponBunker(bunker.id);
        if (!loot) return;
        const def = WEAPONS[loot.weaponId];
        const bunkerItem: ItemInstance = {
          uid: `bunker_${bunker.id}_${++this.bunkerItemSeq}`,
          weaponId: loot.weaponId,
          rarity: loot.rarity,
          magAmmo: def.magSize,
          stackCount: 1,
        };
        const addRes = this.inventory.addItem(bunkerItem);
        if (!addRes.added) {
          this.propsBridge.spawnLootDrop(
            { x: this.position.x, y: this.position.y + 0.8, z: this.position.z },
            { item: bunkerItem },
            { x: 0, y: 3.5, z: 0 },
          );
        } else {
          if (addRes.swappedOut) {
            const fwd = this.getLookDirection();
            this.propsBridge.spawnLootDrop(
              { x: this.position.x, y: this.position.y + 1.0, z: this.position.z },
              { item: addRes.swappedOut },
              { x: fwd.x * 2.5, y: 3.5, z: fwd.z * 2.5 },
            );
          }
          if (this.inventory.getActiveSlotIndex() === 0 && addRes.slotIndex >= 1) {
            this.inventory.setActiveSlot(addRes.slotIndex);
          }
        }
        if (def.ammoType) {
          this.inventory.addAmmo(
            def.ammoType,
            def.ammoType === 'heavy' ? 8 : Math.max(def.magSize, 30),
          );
        }
        if (loot.gold > 0) {
          this.addGoldBars(loot.gold, {
            x: bunker.x,
            y: bunker.y + 1.0,
            z: bunker.z,
          });
        }
        if (loot.shieldRestore > 0) {
          this.shield = Math.min(this.maxShield, this.shield + loot.shieldRestore);
        }
        this.stats.chestsOpened += 1;
        this.eventBus.emit('sound:play', {
          id: 'chest_open',
          position: { x: bunker.x, y: bunker.y, z: bunker.z },
          spatial: true,
        });
        this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        return;
      }

      if (candidate.kind === 'chest') {
        if (this.propsBridge.openChest(candidate.id)) {
          this.stats.chestsOpened += 1;
          const chest = this.propsBridge.getChests().find((c) => c.id === candidate.id);
          const pos = chest ? { x: chest.x, y: chest.y, z: chest.z } : this.position;
          this.eventBus.emit('sound:play', { id: 'chest_open', position: pos, spatial: true });
          this.eventBus.emit('vfx:chest_open', { position: pos });
          this.eventBus.emit('audio:noise', {
            position: pos,
            kind: 'chest',
            sourceId: 'player',
            radius: 26,
          });
        }
        return;
      }

      if (candidate.kind === 'llama') {
        if (this.propsBridge.openLlama?.(candidate.id)) {
          this.stats.chestsOpened += 1;
          const llama = (this.propsBridge.getLlamas?.() ?? []).find(
            (l) => l.id === candidate.id,
          );
          const pos = llama ? { x: llama.x, y: llama.y, z: llama.z } : this.position;
          this.eventBus.emit('sound:play', { id: 'chest_open', position: pos, spatial: true });
          this.eventBus.emit('vfx:chest_open', { position: pos });
        }
        return;
      }

      if (candidate.kind === 'supply_drop') {
        if (this.propsBridge.openSupplyDrop(candidate.id)) {
          this.stats.chestsOpened += 1;
          const sd = this.propsBridge.getSupplyDrops().find((s) => s.id === candidate.id);
          const pos = sd ? { x: sd.x, y: sd.y, z: sd.z } : this.position;
          this.eventBus.emit('sound:play', {
            id: 'chest_open',
            position: pos,
            spatial: true,
          });
          this.eventBus.emit('vfx:chest_open', { position: pos });
        }
        return;
      }

      if (candidate.kind === 'loot_drop') {
        this.pickupLootDropById(candidate.id);
        return;
      }

      if (candidate.kind === 'vault' && this.vaultBridge) {
        if (this.vaultKeys <= 0) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        const vault = this.vaultBridge.getVaults().find((v) => v.id === candidate.id);
        const unlockRes = this.vaultBridge.unlockVault(candidate.id);
        if (unlockRes.unlocked) {
          this.vaultKeys -= 1;
          const lootPos = unlockRes.lootPos ?? (vault ? { x: vault.x, y: vault.y, z: vault.z } : { ...this.position });
          this.eventBus.emit('sound:play', {
            id: 'vault_unlock',
            position: lootPos,
            spatial: true,
          });
          this.eventBus.emit('vfx:chest_open', { position: lootPos });
          this.onVaultUnlocked?.(lootPos, vault?.poiId ?? '');
        }
        return;
      }

      if (candidate.kind === 'vehicle' && this.vehicleBridge) {
        if (this.vehicleBridge.enterVehicle(candidate.id, 'player')) {
          const veh = this.vehicleBridge
            .getVehicles()
            .find((v) => v.id === candidate.id);
          this.activeVehicleId = candidate.id;
          this.isBuildMode = false;
          this.building.setPreviewVisible(false);
          this.building.cancelEdit();
          this.cancelActionsOnModeChange();
          this.isSliding = false;
          this.isCrouching = false;
          this.isMantling = false;
          this.isAiming = false;
          this.isScoped = false;
          if (veh) {
            this.position = { x: veh.x, y: veh.y + 0.15, z: veh.z };
            this.velocity = { x: veh.vx, y: veh.vy, z: veh.vz };
            this.characterYaw = veh.yaw;
          }
          this.grounded = true;
          this.wasAirborne = false;
          this.fallPeakY = this.position.y;
          this.eventBus.emit('sound:play', { id: 'ui_click', volume: 0.5 });
        }
        return;
      }

      if (candidate.kind === 'upgrade_bench' && this.stationBridge) {
        const activeSlot = this.inventory.getActiveSlotIndex();
        const spec = this.getWeaponUpgradeSpec(
          this.inventory.getActiveItem(),
          activeSlot,
        );
        if (!spec) {
          return;
        }
        if (!this.deductMaterialsProportionally(spec.cost)) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }

        spec.item.rarity = spec.nextRarity;
        if (spec.magSize > 0) {
          spec.item.magAmmo = spec.magSize;
        }
        if (this.reloadTimer > 0 && this.reloadSlotIndex === activeSlot) {
          this.reloadTimer = 0;
          this.reloadDuration = 0;
          this.reloadSlotIndex = -1;
        }

        const bench = this.stationBridge
          .getUpgradeBenches()
          .find((b) => b.id === candidate.id);
        const benchPos = bench
          ? { x: bench.x, y: bench.y + 1.0, z: bench.z }
          : { ...this.position };

        this.eventBus.emit('sound:play', {
          id: 'upgrade_weapon',
          position: benchPos,
          spatial: true,
        });
        this.eventBus.emit('vfx:weapon_upgrade', {
          position: benchPos,
          rarity: spec.nextRarity,
        });
        this.onWeaponUpgraded?.(spec.item, spec.cost);
        this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        return;
      }

      if (candidate.kind === 'rift') {
        this.triggerRiftById(candidate.id);
        return;
      }

      if (candidate.kind === 'campfire' && this.stationBridge) {
        if (this.stationBridge.igniteCampfire(candidate.id)) {
          const cf = this.stationBridge
            .getCampfires()
            .find((c) => c.id === candidate.id);
          const pos = cf
            ? { x: cf.x, y: cf.y + 0.4, z: cf.z }
            : { ...this.position };
          this.eventBus.emit('sound:play', {
            id: 'campfire_ignite',
            position: pos,
            spatial: true,
          });
          this.eventBus.emit('vfx:campfire_heal', { position: pos });
          this.onCampfireLit?.(candidate.id);
          this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        }
        return;
      }

      if (candidate.kind === 'vending_machine' && this.economyBridge) {
        const vm = this.economyBridge
          .getVendingMachines()
          .find((m) => m.id === candidate.id);
        if (!vm || vm.stock <= 0) return;
        if (this.goldBars < vm.priceGold) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        const purchase = this.economyBridge.purchaseFromVendingMachine(vm.id);
        if (!purchase) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        this.goldBars = clamp(this.goldBars - purchase.priceGold, 0, MAX_GOLD_BARS);
        const addRes = this.inventory.addItem(purchase.item);
        if (!addRes.added) {
          this.propsBridge.spawnLootDrop(
            { x: this.position.x, y: this.position.y + 0.8, z: this.position.z },
            { item: purchase.item },
            { x: 0, y: 3.5, z: 0 },
          );
        } else {
          if (addRes.swappedOut) {
            const fwd = this.getLookDirection();
            this.propsBridge.spawnLootDrop(
              { x: this.position.x, y: this.position.y + 1.0, z: this.position.z },
              { item: addRes.swappedOut },
              { x: fwd.x * 2.5, y: 3.5, z: fwd.z * 2.5 },
            );
          }
          if (this.inventory.getActiveSlotIndex() === 0 && addRes.slotIndex >= 1) {
            this.inventory.setActiveSlot(addRes.slotIndex);
          }
        }
        this.eventBus.emit('sound:play', {
          id: 'vending_buy',
          position: { ...purchase.position },
          spatial: true,
        });
        this.eventBus.emit('vfx:gold_burst', {
          position: { ...purchase.position },
          amount: purchase.priceGold,
        });
        this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        return;
      }

      if (candidate.kind === 'npc_specialist' && this.economyBridge) {
        const npc = this.economyBridge
          .getNpcSpecialists()
          .find((n) => n.id === candidate.id);
        if (!npc || npc.hiredBy) return;
        if (this.goldBars < npc.priceGold) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        const hired = this.economyBridge.hireNpcSpecialist(npc.id, 'player');
        if (!hired) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        this.goldBars = clamp(this.goldBars - hired.priceGold, 0, MAX_GOLD_BARS);
        const burstPos = { x: hired.x, y: hired.y + 1.0, z: hired.z };
        this.eventBus.emit('sound:play', {
          id: 'ally_hired',
          position: { x: hired.x, y: hired.y, z: hired.z },
          spatial: true,
        });
        this.eventBus.emit('vfx:gold_burst', {
          position: burstPos,
          amount: hired.priceGold,
        });
        this.onNpcHired?.(hired);
        this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        return;
      }

      if (candidate.kind === 'mod_bench' && this.frontierBridge) {
        const mb = this.frontierBridge
          .getModBenches()
          .find((b) => b.id === candidate.id);
        const benchPos = mb
          ? { x: mb.x, y: mb.y + 1.0, z: mb.z }
          : { ...this.position };
        this.installWeaponMod(undefined, benchPos);
        this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        return;
      }

      if (candidate.kind === 'forecast_tower' && this.frontierBridge) {
        const tower = this.frontierBridge
          .getForecastTowers()
          .find((t) => t.id === candidate.id);
        if (!tower || tower.scanned) return;
        const towerPos = { x: tower.x, y: tower.y + 1.2, z: tower.z };
        let emittedScanSfx = false;
        let emittedScanVfx = false;
        const unsubSfx = this.eventBus.on('sound:play', (ev) => {
          if (ev.id === 'forecast_scan') emittedScanSfx = true;
        });
        const unsubVfx = this.eventBus.on('vfx:forecast_pulse', () => {
          emittedScanVfx = true;
        });
        const scanned = this.frontierBridge.scanForecastTower(tower.id, 'player');
        unsubSfx();
        unsubVfx();
        if (!scanned) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        if (!emittedScanSfx) {
          this.eventBus.emit('sound:play', {
            id: 'forecast_scan',
            position: towerPos,
            spatial: true,
          });
        }
        if (!emittedScanVfx) {
          this.eventBus.emit('vfx:forecast_pulse', {
            position: towerPos,
          });
        }
        this.hasStormForecast = true;
        this.addGoldBars(100, towerPos);
        this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        return;
      }

      if (candidate.kind === 'train_chest' && this.skyforgeBridge) {
        const trainState = this.skyforgeBridge.getTrainState();
        if (
          (trainState && (!trainState.active || trainState.chestHacked)) ||
          !this.skyforgeBridge.isNearTrainChest(this.position)
        ) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        if (!this.isHackingTrainChest) {
          this.reloadTimer = 0;
          this.healTimer = 0;
          this.healLabel = null;
          this.isDrawingBow = false;
          this.bowDrawElapsed = 0;
          this.bowCharge = 0;
          this.isChargingRailgun = false;
          this.railgunChargeElapsed = 0;
          this.railgunCharge = 0;
          this.isHackingTrainChest = true;
          this.trainHackProgress = clamp(trainState?.chestHackProgress ?? 0, 0, 1);
        }
        return;
      }

      if (candidate.kind === 'hop_crystal' && this.skyforgeBridge) {
        let emittedConsumeSfx = false;
        let emittedAuraVfx = false;
        const unsubSfx = this.eventBus.on('sound:play', (ev) => {
          if (ev.id === 'hop_crystal_consume') emittedConsumeSfx = true;
        });
        const unsubVfx = this.eventBus.on('vfx:hop_crystal_aura', () => {
          emittedAuraVfx = true;
        });
        const consumed = this.skyforgeBridge.consumeHopCrystal(candidate.id);
        unsubSfx();
        unsubVfx();
        if (!consumed || !consumed.ok) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        this.lowGravityTimer = LOW_GRAVITY_DURATION_SEC;
        this.stats.hopCrystalsUsed = (this.stats.hopCrystalsUsed ?? 0) + 1;
        if (!emittedConsumeSfx) {
          this.eventBus.emit('sound:play', {
            id: 'hop_crystal_consume',
            position: { ...consumed.position },
            spatial: true,
          });
        }
        if (!emittedAuraVfx) {
          this.eventBus.emit('vfx:hop_crystal_aura', {
            position: { ...consumed.position },
          });
        }
        this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        return;
      }

      if (candidate.kind === 'shield_mushroom' && this.tideBridge) {
        const mushroom =
          this.tideBridge
            .getShieldMushrooms()
            .find((m) => m.id === candidate.id) ??
          this.tideBridge.findNearbyShieldMushroom(this.position);
        let emittedEatSfx = false;
        let emittedSplashVfx = false;
        const unsubSfx = this.eventBus.on('sound:play', (ev) => {
          if (ev.id === 'mushroom_eat') emittedEatSfx = true;
        });
        const unsubVfx = this.eventBus.on('vfx:splash_heal', () => {
          emittedSplashVfx = true;
        });
        const consumed = this.tideBridge.consumeShieldMushroom(candidate.id);
        unsubSfx();
        unsubVfx();
        if (!consumed) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        this.shield = Math.min(
          this.maxShield,
          this.shield + SHIELD_MUSHROOM_AMOUNT,
        );
        this.stats.mushroomsEaten = (this.stats.mushroomsEaten ?? 0) + 1;
        const fxPos: Vec3Like = mushroom
          ? { x: mushroom.x, y: mushroom.y + 0.3, z: mushroom.z }
          : { ...this.position };
        if (!emittedEatSfx) {
          this.eventBus.emit('sound:play', {
            id: 'mushroom_eat',
            position: fxPos,
            spatial: true,
          });
        }
        if (!emittedSplashVfx) {
          this.eventBus.emit('vfx:splash_heal', {
            position: fxPos,
            radius: 1.6,
          });
        }
        this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
        return;
      }

      if (candidate.kind === 'fishing_hole' && this.overlordBridge) {
        if (this.isFishing) return;
        const hole =
          this.overlordBridge
            .getFishingHoles()
            .find((h) => h.id === candidate.id) ??
          this.overlordBridge.findNearbyFishingHole(this.position);
        if (!hole || hole.depleted || hole.castsRemaining <= 0) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        this.reloadTimer = 0;
        this.healTimer = 0;
        this.healLabel = null;
        this.isDrawingBow = false;
        this.bowDrawElapsed = 0;
        this.bowCharge = 0;
        this.isChargingRailgun = false;
        this.railgunChargeElapsed = 0;
        this.railgunCharge = 0;
        this.isFishing = true;
        this.fishingTimer = 0;
        this.fishingProgress = 0;
        this.activeFishingHoleId = hole.id;
        this.eventBus.emit('sound:play', {
          id: 'fishing_cast',
          position: { x: hole.x, y: hole.y, z: hole.z },
          spatial: true,
        });
        return;
      }

      if (candidate.kind === 'sky_balloon' && this.overlordBridge) {
        const balloon =
          this.overlordBridge
            .getSkyBalloons()
            .find((b) => b.id === candidate.id) ??
          this.overlordBridge.findNearbySkyBalloon(this.position);
        if (!balloon) {
          this.eventBus.emit('sound:play', {
            id: 'dryfire',
            position: { ...this.position },
            spatial: true,
          });
          return;
        }
        if (this.activeVehicleId !== null) {
          this.exitActiveVehicle(false);
        }
        this.activeZipline = null;
        this.activeGrindRail = null;
        this.cancelPartnerRevive();
        this.cancelPartnerReboot();
        this.cancelTrainChestHack();
        this.cancelFishingChannel();
        this.isCrouching = false;
        this.isSliding = false;
        this.isMantling = false;
        this.isSwimming = false;
        this.isBuildMode = false;
        this.building.setPreviewVisible(false);
        this.building.cancelEdit();
        this.cancelActionsOnModeChange();

        const launchPos: Vec3Like = {
          x: balloon.x,
          y: balloon.baseY,
          z: balloon.z,
        };
        const fwdX = Math.sin(this.yaw);
        const fwdZ = Math.cos(this.yaw);
        this.position = { x: balloon.x, y: balloon.topY, z: balloon.z };
        this.velocity = {
          x: fwdX * 14,
          y: 10.5,
          z: fwdZ * 14,
        };
        this.grounded = false;
        this.wasAirborne = true;
        this.fallPeakY = balloon.topY;
        this.fallImmune = true;
        this.phase = 'gliding';
        this.interactPrompt = null;

        this.eventBus.emit('sound:play', {
          id: 'balloon_ascend',
          position: launchPos,
          spatial: true,
        });
        return;
      }
    }

    // Fallback: Attach to nearby Grind Rail or overhead Energy Zipline
    if (this.grindRailCooldown <= 0 && this.overdriveBridge) {
      const railMatch = this.overdriveBridge.findNearbyGrindRail(this.position, 2.8);
      if (railMatch) {
        this.attachGrindRail(railMatch);
        return;
      }
    }

    if (this.ziplineCooldown <= 0) {
      const nearestZip = this.findNearestZipline();
      if (nearestZip) {
        this.attachZipline(nearestZip.zip, nearestZip.t);
      }
    }
  }

  private pickupLootDropById(dropId: string): void {
    const drop = this.propsBridge.removeLootDrop(dropId);
    if (!drop) return;

    if (drop.ammo) {
      this.inventory.addAmmo(drop.ammo.type, drop.ammo.amount);
    }
    if (drop.materials) {
      this.inventory.addMaterial(drop.materials.type, drop.materials.amount);
    }
    if (drop.item) {
      const res = this.inventory.addItem(drop.item);
      if (!res.added) {
        // Re-spawn if inventory full and holding pickaxe
        this.propsBridge.spawnLootDrop(
          { x: drop.x, y: drop.y, z: drop.z },
          { item: drop.item },
        );
        return;
      }
      if (res.swappedOut) {
        const fwd = this.getLookDirection();
        this.propsBridge.spawnLootDrop(
          { x: this.position.x, y: this.position.y + 1.0, z: this.position.z },
          { item: res.swappedOut },
          { x: fwd.x * 2.5, y: 3.5, z: fwd.z * 2.5 },
        );
      }
      if (this.inventory.getActiveSlotIndex() === 0 && res.slotIndex >= 1) {
        this.inventory.setActiveSlot(res.slotIndex);
      }
    }

    this.eventBus.emit('sound:play', { id: 'loot_pickup' });
  }

  private claimDroppedCrown(): void {
    this.setVictoryCrown(true);
    const glintPos = {
      x: this.position.x,
      y: this.position.y + PLAYER_HEIGHT + 0.35,
      z: this.position.z,
    };
    this.eventBus.emit('sound:play', {
      id: 'crown_glint',
      position: glintPos,
      spatial: true,
    });
    this.eventBus.emit('vfx:crown_glint', { position: glintPos });
    this.crownGlintTimer = CROWN_GLINT_INTERVAL_SEC;
  }

  private updateAutoPickupAndPrompt(): void {
    if (this.phase !== 'playing' || this.isKnocked) {
      this.interactPrompt = null;
      if (this.isKnocked) {
        this.canRepairBuild = false;
      }
      return;
    }

    // Auto-pickup ammo & materials within 1.8m
    const drops = this.propsBridge.getLootDrops();
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      if (!drop.settled || drop.item) continue;
      if (
        dist2D(this.position.x, this.position.z, drop.x, drop.z) <= 1.85 &&
        Math.abs(this.position.y - drop.y) <= 2.0
      ) {
        this.pickupLootDropById(drop.id);
      }
    }

    // Walkover auto-pickup for Dropped Medallions & Dropped Victory Crowns
    if (this.chapterBridge && this.isAlive()) {
      const droppedMeds = this.chapterBridge.getDroppedMedallions();
      for (let i = 0; i < droppedMeds.length; i++) {
        const dm = droppedMeds[i];
        if (dm.collected || this.hasMedallion(dm.medallionId)) continue;
        if (
          dist2D(this.position.x, this.position.z, dm.x, dm.z) <= 2.0 &&
          Math.abs(this.position.y - dm.y) <= 2.2
        ) {
          const picked = this.chapterBridge.collectNearbyMedallion(
            this.position.x,
            this.position.z,
            2.2,
          );
          if (picked) {
            const medId = typeof picked === 'string' ? picked : picked.medallionId;
            this.addMedallion(medId);
          }
        }
      }

      if (!this.victoryCrown) {
        const droppedCrowns = this.chapterBridge.getDroppedCrowns();
        for (let i = 0; i < droppedCrowns.length; i++) {
          const dc = droppedCrowns[i];
          if (dc.collected) continue;
          if (
            dist2D(this.position.x, this.position.z, dc.x, dc.z) <= 2.0 &&
            Math.abs(this.position.y - dc.y) <= 2.2
          ) {
            const picked = this.chapterBridge.collectNearbyCrown(
              this.position.x,
              this.position.z,
              2.2,
            );
            if (picked) {
              this.claimDroppedCrown();
              break;
            }
          }
        }
      }
    }

    // Find nearest interact prompt
    const interactKey = this.formatKeyLabel(this.getResolvedKeybinds().interact);
    if (this.activeVehicleId !== null) {
      this.interactPrompt = { label: 'Exit Vehicle', key: interactKey, rarity: 'rare' };
      this.canRepairBuild = false;
      return;
    }

    if (this.activeGrindRail) {
      this.interactPrompt = { label: 'Jump Off Rail', key: 'SPACE', rarity: 'rare' };
      this.canRepairBuild = false;
      return;
    }

    if (this.activeZipline) {
      this.interactPrompt = { label: 'Drop Zipline', key: 'SPACE', rarity: 'rare' };
      return;
    }

    if (this.isRevivingPartner || this.isRebootingPartner || this.isHackingTrainChest) {
      this.interactPrompt = null;
      this.canRepairBuild = false;
      return;
    }

    const candidate = this.findNearestInteractable();
    let prompt: PlayerInteractPrompt | null = candidate ? candidate.prompt : null;

    if (
      !prompt &&
      this.grindRailCooldown <= 0 &&
      this.overdriveBridge?.findNearbyGrindRail(this.position, 2.8)
    ) {
      prompt = { label: 'Grind Rail', key: interactKey, rarity: 'epic' };
    } else if (!prompt && this.ziplineCooldown <= 0 && this.findNearestZipline()) {
      prompt = { label: 'Ride Zipline', key: interactKey, rarity: 'rare' };
    }

    this.interactPrompt = prompt;
    const repairTarget = this.findRepairableBuildPiece();
    this.canRepairBuild =
      repairTarget !== null && (this.inventory.getMaterials()[repairTarget.material] ?? 0) > 0;
  }

  private getLookDirection(): Vec3Like {
    const cosPitch = Math.cos(this.pitch);
    return {
      x: Math.sin(this.yaw) * cosPitch,
      y: Math.sin(this.pitch),
      z: Math.cos(this.yaw) * cosPitch,
    };
  }

  private getMoveAxes(): { forwardInput: number; rightInput: number } {
    const w = this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp') ? 1 : 0;
    const s = this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown') ? 1 : 0;
    const d = this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight') ? 1 : 0;
    const a = this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft') ? 1 : 0;
    return {
      forwardInput: w - s,
      rightInput: d - a,
    };
  }

  private triggerRiftById(riftId: string): boolean {
    if (!this.riftCaptureBridge || this.riftCooldown > 0) return false;
    const res = this.riftCaptureBridge.triggerRift(riftId);
    if (!res) return false;

    if (this.activeVehicleId !== null) {
      this.exitActiveVehicle(false);
    }
    this.activeZipline = null;
    this.activeGrindRail = null;
    this.cancelPartnerReboot();
    this.isCrouching = false;
    this.isSliding = false;
    this.isMantling = false;
    this.isSwimming = false;
    this.isBuildMode = false;
    this.building.setPreviewVisible(false);
    this.building.cancelEdit();
    this.cancelActionsOnModeChange();

    const fromPos = { ...this.position };
    this.position = { ...res.skyPos };
    this.velocity = {
      x: Math.sin(this.yaw) * 12,
      y: -8,
      z: Math.cos(this.yaw) * 12,
    };
    this.grounded = false;
    this.wasAirborne = true;
    this.fallPeakY = this.position.y;
    this.fallImmune = true;
    this.phase = 'skydiving';
    this.riftCooldown = 1.0;
    this.interactPrompt = null;
    this.captureStatus = null;
    this.captureCelebrationTimer = 0;

    this.eventBus.emit('sound:play', {
      id: 'rift_teleport',
      position: fromPos,
      spatial: true,
    });
    this.eventBus.emit('vfx:rift_tear', {
      position: fromPos,
      skyPosition: { ...res.skyPos },
    });
    return true;
  }

  private checkAutoSkyRifts(): boolean {
    if (
      !this.riftCaptureBridge ||
      this.riftCooldown > 0 ||
      this.activeZipline !== null ||
      this.activeGrindRail !== null ||
      this.activeVehicleId !== null
    ) {
      return false;
    }
    const rifts: RiftEntity[] = this.riftCaptureBridge.getRifts();
    for (let i = 0; i < rifts.length; i++) {
      const rift = rifts[i];
      if (!rift.active) continue;
      const horiz = dist2D(this.position.x, this.position.z, rift.x, rift.z);
      const dy = Math.abs(this.position.y - rift.y);
      if (horiz <= 2.2 && dy <= 2.8) {
        if (this.triggerRiftById(rift.id)) {
          return true;
        }
      }
    }
    return false;
  }

  private updateCapturePoints(dt: number): void {
    if (!this.riftCaptureBridge || !this.isAlive()) {
      this.captureStatus = null;
      this.flagTickTimer = 0;
      return;
    }
    const points = this.riftCaptureBridge.getCapturePoints();
    let activePoint: (typeof points)[number] | null = null;
    for (let i = 0; i < points.length; i++) {
      const cp = points[i];
      if (cp.captured) continue;
      const radius = cp.radius > 0 ? cp.radius : 6.5;
      const horiz = dist2D(this.position.x, this.position.z, cp.x, cp.z);
      const dy = Math.abs(this.position.y - cp.y);
      if (horiz <= radius && dy <= 4.5) {
        activePoint = cp;
        break;
      }
    }

    if (!activePoint) {
      this.flagTickTimer = 0;
      if (this.captureCelebrationTimer > 0) {
        this.captureCelebrationTimer -= dt;
        if (this.captureCelebrationTimer <= 0) {
          this.captureCelebrationTimer = 0;
          this.captureStatus = null;
        }
      } else {
        this.captureStatus = null;
      }
      return;
    }

    const r = activePoint.radius > 0 ? activePoint.radius : 6.5;
    let contested = false;
    const actors = this.weapons.getActors();
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      if (!actor.alive || actor.id === 'player') continue;
      if (
        dist2D(actor.position.x, actor.position.z, activePoint.x, activePoint.z) <= r &&
        Math.abs(actor.position.y - activePoint.y) <= 4.5
      ) {
        contested = true;
        break;
      }
    }

    const res = this.riftCaptureBridge.advanceCapturePoint(
      activePoint.id,
      'player',
      this.playerName,
      dt,
    );
    const capturedNow = res.capturedNow;
    this.captureStatus = {
      poiName: res.poiName,
      progress: res.progress,
      captured: capturedNow || activePoint.captured,
      contested,
    };

    if (capturedNow) {
      this.stats.poisCaptured = (this.stats.poisCaptured ?? 0) + 1;
      this.captureCelebrationTimer = 3.0;
      this.flagTickTimer = 0;
      const pos = { x: activePoint.x, y: activePoint.y, z: activePoint.z };
      this.eventBus.emit('sound:play', {
        id: 'flag_captured',
        position: pos,
        spatial: true,
      });
      this.eventBus.emit('vfx:flag_captured', {
        position: pos,
        poiName: res.poiName,
      });
      this.onPoiCaptured?.(res.poiName, res.lootPos);
    } else {
      this.flagTickTimer -= dt;
      if (this.flagTickTimer <= 0) {
        this.flagTickTimer = 1.2;
        this.eventBus.emit('sound:play', {
          id: 'flag_tick',
          position: { x: activePoint.x, y: activePoint.y, z: activePoint.z },
          spatial: true,
        });
      }
    }
  }

  private updateLootIsland(dt: number): void {
    if (!this.economyBridge || !this.isAlive()) {
      this.lootIslandTickTimer = 0;
      return;
    }
    const li: LootIslandState = this.economyBridge.getLootIslandState();
    if (!li.active) {
      this.lootIslandTickTimer = 0;
      return;
    }

    const horizDist = dist2D(this.position.x, this.position.z, li.x, li.z);

    // 1. Updraft geyser beneath the floating island
    if (
      this.lootIslandUpdraftCooldown <= 0 &&
      this.activeVehicleId === null &&
      this.grounded &&
      horizDist <= 4.5 &&
      this.position.y < li.y - 6
    ) {
      this.lootIslandUpdraftCooldown = 0.6;
      this.isCrouching = false;
      this.isSliding = false;
      this.isMantling = false;
      this.isBuildMode = false;
      this.building.setPreviewVisible(false);
      this.activeZipline = null;
      this.activeGrindRail = null;
      this.grounded = false;
      this.wasAirborne = true;
      this.fallImmune = true;
      this.fallPeakY = this.position.y;
      this.velocity.y = 25;
      this.eventBus.emit('sound:play', {
        id: 'launch_pad',
        position: { ...this.position },
        spatial: true,
      });
      return;
    }

    // 2. Capture shrine atop the floating island
    const captureRadius = (li.radius > 0 ? li.radius : 14) * 0.75;
    if (
      !li.captured &&
      horizDist <= captureRadius &&
      Math.abs(this.position.y - li.y) <= 3.5
    ) {
      const res = this.economyBridge.advanceLootIslandCapture(dt);
      const updated = this.economyBridge.getLootIslandState();
      this.captureStatus = {
        poiName: 'Loot Island',
        progress: updated.captureProgress,
        captured: res.capturedNow || updated.captured,
        contested: false,
      };
      if (res.capturedNow) {
        this.captureCelebrationTimer = 3.0;
        this.lootIslandTickTimer = 0;
        const flagPos = res.lootPos ?? { x: li.x, y: li.y, z: li.z };
        this.eventBus.emit('sound:play', {
          id: 'flag_captured',
          position: flagPos,
          spatial: true,
        });
        this.eventBus.emit('vfx:flag_captured', {
          position: flagPos,
          poiName: 'Loot Island',
        });
        this.onLootIslandCaptured?.(res.lootPos);
      } else {
        this.lootIslandTickTimer -= dt;
        if (this.lootIslandTickTimer <= 0) {
          this.lootIslandTickTimer = 1.2;
          this.eventBus.emit('sound:play', {
            id: 'flag_tick',
            position: { x: li.x, y: li.y, z: li.z },
            spatial: true,
          });
        }
      }
    } else {
      this.lootIslandTickTimer = 0;
    }
  }

  update(
    dt: number,
    elapsed: number,
    busPos?: Vec3Like,
    _busYaw?: number,
  ): void {
    const safeDt = clamp(dt, 0, 0.05);
    this.elapsedTime = elapsed > 0 ? elapsed : this.elapsedTime + safeDt;
    if (busPos) {
      this.lastBusPos = { ...busPos };
    }

    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - safeDt);
    if (this.buildCooldown > 0) this.buildCooldown = Math.max(0, this.buildCooldown - safeDt);
    if (this.ziplineCooldown > 0) this.ziplineCooldown = Math.max(0, this.ziplineCooldown - safeDt);
    if (this.grindRailCooldown > 0) {
      this.grindRailCooldown = Math.max(0, this.grindRailCooldown - safeDt);
    }
    if (this.launchPadCooldown > 0) {
      this.launchPadCooldown = Math.max(0, this.launchPadCooldown - safeDt);
    }
    if (this.vehicleCooldown > 0) this.vehicleCooldown = Math.max(0, this.vehicleCooldown - safeDt);
    if (this.riftCooldown > 0) this.riftCooldown = Math.max(0, this.riftCooldown - safeDt);
    if (this.lavaCooldown > 0) this.lavaCooldown = Math.max(0, this.lavaCooldown - safeDt);
    if (this.lootIslandUpdraftCooldown > 0) {
      this.lootIslandUpdraftCooldown = Math.max(
        0,
        this.lootIslandUpdraftCooldown - safeDt,
      );
    }
    if (this.tacticalPing && this.tacticalPingTimer > 0) {
      this.tacticalPingTimer = Math.max(0, this.tacticalPingTimer - safeDt);
      if (this.tacticalPingTimer <= 0) {
        this.tacticalPing = null;
      }
    }
    if (this.cameraShakeTimer > 0) {
      this.cameraShakeTimer = Math.max(0, this.cameraShakeTimer - safeDt);
    }
    if (this.recoilKick > 0) this.recoilKick = Math.max(0, this.recoilKick - safeDt * 6.5);
    if (this.harvestSwingTimer > 0) {
      this.harvestSwingTimer = Math.max(0, this.harvestSwingTimer - safeDt);
    }
    if (this.stealthBreakTimer > 0) {
      this.stealthBreakTimer = Math.max(0, this.stealthBreakTimer - safeDt);
    }
    if (this.phase !== 'playing') {
      this.isStealthed = false;
      this.currentBushId = null;
      this.isJetpackThrusting = false;
      this.thermalVisionTimer = 0;
    } else {
      if (this.lowGravityTimer > 0) {
        this.lowGravityTimer = Math.max(0, this.lowGravityTimer - safeDt);
      }
      if (this.thermalVisionTimer > 0) {
        this.thermalVisionTimer = Math.max(0, this.thermalVisionTimer - safeDt);
      }
    }

    const activeItem = this.inventory.getActiveItem();
    const activeDef = activeItem ? WEAPONS[activeItem.weaponId] : WEAPONS.pickaxe;
    if (!this.isFiring && this.bloom > 0) {
      this.bloom = Math.max(0, this.bloom - activeDef.bloomRecovery * safeDt);
    }

    if (this.phase === 'bus') {
      if (busPos) {
        this.position = { ...busPos };
      }
      this.moveSpeed = 0;
      this.leanAngle = damp(this.leanAngle, 0, 10, safeDt);
      this.prevYaw = this.yaw;
      this.updateCamera(safeDt);
      return;
    }

    if (this.phase === 'skydiving' || this.phase === 'gliding') {
      this.updateAerialMovement(safeDt);
      this.updateCamera(safeDt);
      return;
    }

    if (this.phase === 'playing') {
      if (this.isAlive()) {
        this.playingElapsedSec += safeDt;
        this.augmentManager.update(safeDt, this.playingElapsedSec);
        const maxDashCharges = WEAPONS.kinetic_blade.dashCharges ?? 3;
        const dashCooldownSec = WEAPONS.kinetic_blade.dashCooldownSec ?? 9;
        if (this.kineticDashCharges < maxDashCharges) {
          this.kineticDashRechargeTimer += safeDt;
          while (
            this.kineticDashRechargeTimer >= dashCooldownSec - 1e-6 &&
            this.kineticDashCharges < maxDashCharges
          ) {
            this.kineticDashCharges += 1;
            this.kineticDashRechargeTimer = Math.max(
              0,
              this.kineticDashRechargeTimer - dashCooldownSec,
            );
          }
          if (this.kineticDashCharges >= maxDashCharges) {
            this.kineticDashRechargeTimer = 0;
          }
        }
        const maxHammerCharges =
          WEAPONS.shockwave_hammer.hammerMaxCharges ?? 4;
        const hammerRegenSec =
          WEAPONS.shockwave_hammer.hammerChargeRegenSec ?? 12;
        if (this.hammerCharges < maxHammerCharges) {
          this.hammerRechargeTimer += safeDt;
          while (
            this.hammerRechargeTimer >= hammerRegenSec - 1e-6 &&
            this.hammerCharges < maxHammerCharges
          ) {
            this.hammerCharges += 1;
            this.hammerRechargeTimer = Math.max(
              0,
              this.hammerRechargeTimer - hammerRegenSec,
            );
          }
          if (this.hammerCharges >= maxHammerCharges) {
            this.hammerRechargeTimer = 0;
          }
        }
      }
      if (this.flareBeacons.length > 0) {
        for (let i = this.flareBeacons.length - 1; i >= 0; i--) {
          this.flareBeacons[i].remainingSec -= safeDt;
          if (this.flareBeacons[i].remainingSec <= 0) {
            this.flareBeacons.splice(i, 1);
          }
        }
        if (this.flareBeacons.length === 0) {
          this.flareScanMarkedCount = 0;
        }
      }
      if (this.isAlive() && !this.isKnocked) {
        const slots = this.inventory.getSlots();
        const chugMax = WEAPONS.chug_cannon.magSize > 0 ? WEAPONS.chug_cannon.magSize : 5;
        const chugRegenSec = WEAPONS.chug_cannon.chugRegenSec ?? 8;
        const activeChugUids = new Set<string>();
        for (let i = 1; i < slots.length; i++) {
          const slotItem = slots[i];
          if (!slotItem || slotItem.weaponId !== 'chug_cannon') continue;
          activeChugUids.add(slotItem.uid);
          if (slotItem.magAmmo < chugMax) {
            let timer = (this.chugRegenTimers.get(slotItem.uid) ?? 0) + safeDt;
            while (timer >= chugRegenSec - 1e-6 && slotItem.magAmmo < chugMax) {
              slotItem.magAmmo += 1;
              timer = Math.max(0, timer - chugRegenSec);
            }
            if (slotItem.magAmmo >= chugMax) {
              this.chugRegenTimers.delete(slotItem.uid);
            } else {
              this.chugRegenTimers.set(slotItem.uid, timer);
            }
          } else {
            this.chugRegenTimers.delete(slotItem.uid);
          }
        }
        for (const uid of this.chugRegenTimers.keys()) {
          if (!activeChugUids.has(uid)) {
            this.chugRegenTimers.delete(uid);
          }
        }
      }
      if (this.activeVehicleId !== null) {
        this.updateVehicleDriving(safeDt);
      } else if (this.isMantling) {
        this.updateMantle(safeDt);
      } else if (this.activeGrindRail) {
        this.updateGrindRailRide(safeDt);
      } else if (this.activeZipline) {
        this.updateZiplineRide(safeDt);
      } else {
        this.updateGroundMovement(safeDt);
      }
      if (this.checkAutoSkyRifts()) {
        this.updateStealthBush(true);
        this.updateCamera(safeDt);
        return;
      }
      this.checkVolcanicLavaHazard();
      this.updateCapturePoints(safeDt);
      this.updateLootIsland(safeDt);
      this.updateCombatAndTimers(safeDt);
      this.updateStealthBush(true);
      this.updateAutoPickupAndPrompt();
      this.updateCamera(safeDt);
      return;
    }

    // Lobby / Victory / Eliminated
    this.moveSpeed = 0;
    this.leanAngle = damp(this.leanAngle, 0, 10, safeDt);
    this.prevYaw = this.yaw;
    this.updateCamera(safeDt);
  }

  private updateVehicleDriving(dt: number): void {
    const veh = this.getActiveVehicleEntity();
    if (!veh || veh.destroyed || veh.hp <= 0 || veh.driverId !== 'player') {
      this.exitActiveVehicle(true);
      return;
    }

    if (
      this.lastOverdriveApplied &&
      this.lastOverdriveApplied.id === veh.id &&
      Math.abs(veh.vx - this.lastOverdriveApplied.vx) < 1e-4 &&
      Math.abs(veh.vz - this.lastOverdriveApplied.vz) < 1e-4
    ) {
      veh.vx = this.lastOverdriveApplied.baseVx;
      veh.vz = this.lastOverdriveApplied.baseVz;
    }

    const { forwardInput, rightInput } = this.getMoveAxes();
    const boost =
      this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');

    this.vehicleBridge!.driveVehicle(
      veh.id,
      forwardInput,
      rightInput,
      boost,
      dt,
    );

    const updated = this.getActiveVehicleEntity();
    if (
      !updated ||
      updated.destroyed ||
      updated.hp <= 0 ||
      updated.driverId !== 'player'
    ) {
      this.exitActiveVehicle(true);
      return;
    }

    if (this.augmentManager.hasAugment('mechanic_overdrive')) {
      if (updated.hp < updated.maxHp) {
        updated.hp = Math.min(updated.maxHp, updated.hp + 4.0 * dt);
      }
      const baseVx = updated.vx;
      const baseVz = updated.vz;
      updated.x = clamp(updated.x + baseVx * 0.25 * dt, -390, 390);
      updated.z = clamp(updated.z + baseVz * 0.25 * dt, -390, 390);
      updated.vx = baseVx * 1.25;
      updated.vz = baseVz * 1.25;
      this.lastOverdriveApplied = {
        id: updated.id,
        baseVx,
        baseVz,
        vx: updated.vx,
        vz: updated.vz,
      };
    } else {
      this.lastOverdriveApplied = null;
    }

    this.position = {
      x: clamp(updated.x, -390, 390),
      y: updated.y + 0.15,
      z: clamp(updated.z, -390, 390),
    };
    this.velocity = { x: updated.vx, y: updated.vy, z: updated.vz };
    this.moveSpeed = Math.hypot(updated.vx, updated.vz);
    this.grounded = true;
    this.isSprinting = false;
    this.isCrouching = false;
    this.isSliding = false;
    this.isAiming = false;
    this.isScoped = false;
    this.isFiring = false;
    this.wasAirborne = false;
    this.fallPeakY = this.position.y;
    this.characterYaw = updated.yaw;

    const targetLean = clamp(
      -rightInput * 0.28 + (updated.roll || 0),
      -0.38,
      0.38,
    );
    this.leanAngle = damp(this.leanAngle, targetLean, 10, dt);
    this.prevYaw = this.yaw;
  }

  private updateMantle(dt: number): void {
    this.mantleTimer += dt;
    const t = clamp(this.mantleTimer / this.mantleDuration, 0, 1);
    const yT = 1 - Math.pow(1 - t, 2.5);
    const xzT = t < 0.25 ? 0.15 * (t / 0.25) : 0.15 + 0.85 * ((t - 0.25) / 0.75);

    this.position.x = lerp(this.mantleStartPos.x, this.mantleEndPos.x, xzT);
    this.position.y = lerp(this.mantleStartPos.y, this.mantleEndPos.y, yT);
    this.position.z = lerp(this.mantleStartPos.z, this.mantleEndPos.z, xzT);
    this.moveSpeed = dist3D(this.mantleStartPos, this.mantleEndPos) / this.mantleDuration;
    this.leanAngle = damp(this.leanAngle, 0, 10, dt);
    this.prevYaw = this.yaw;

    if (t >= 1) {
      this.isMantling = false;
      this.mantleTimer = 0;
      this.position = { ...this.mantleEndPos };
      this.velocity = { x: 0, y: 0, z: 0 };
      this.grounded = true;
      this.wasAirborne = false;
      this.fallPeakY = this.position.y;
    }
  }

  private checkVolcanicLavaHazard(): void {
    if (this.phase !== 'playing' || !this.isAlive() || this.lavaCooldown > 0) return;
    const dist = dist2D(
      this.position.x,
      this.position.z,
      VOLCANO_CENTER_X,
      VOLCANO_CENTER_Z,
    );
    if (dist >= 11.8) return;
    const centerY = this.terrain.getHeightAt(VOLCANO_CENTER_X, VOLCANO_CENTER_Z);
    if (this.position.y <= centerY + 2.3) {
      this.lavaCooldown = 0.6;
      this.isSliding = false;
      this.isCrouching = false;
      this.isMantling = false;
      this.grounded = false;
      this.wasAirborne = true;
      this.velocity.y = 14;
      this.fallPeakY = this.position.y;

      this.applyDamage({
        targetId: 'player',
        attackerId: 'lava',
        attackerName: 'Molten Lava',
        weaponId: 'pickaxe',
        rarity: 'common',
        damage: 10,
        hpDamage: 10,
        shieldDamage: 0,
        isHeadshot: false,
        isElimination: this.health - 10 <= 0,
        hitPoint: { ...this.position },
        distance: 0,
      });
      this.eventBus.emit('sound:play', {
        id: 'lava_burn',
        position: { ...this.position },
        spatial: true,
      });
      this.eventBus.emit('vfx:camera_shake', {
        intensity: 0.45,
        duration: 0.25,
      });
    }
  }

  private updateAerialMovement(dt: number): void {
    const { forwardInput, rightInput } = this.getMoveAxes();
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const rightX = -Math.cos(this.yaw);
    const rightZ = Math.sin(this.yaw);

    let wishX = fwdX * forwardInput + rightX * rightInput;
    let wishZ = fwdZ * forwardInput + rightZ * rightInput;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1e-4) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    const isGliding = this.phase === 'gliding';
    const horizSpeed = isGliding ? 19.5 : 18.0;
    const targetVx = wishLen > 0 ? wishX * horizSpeed : isGliding ? fwdX * 8.0 : 0;
    const targetVz = wishLen > 0 ? wishZ * horizSpeed : isGliding ? fwdZ * 8.0 : 0;

    // Preserve strong launch-pad vertical/horizontal impulse until past apex
    if (isGliding && this.velocity.y > -2.5) {
      const boostHoriz = Math.max(horizSpeed, Math.hypot(this.velocity.x, this.velocity.z));
      this.velocity.x = wishLen > 0 ? damp(this.velocity.x, wishX * boostHoriz, 2.5, dt) : damp(this.velocity.x, this.velocity.x, 0.5, dt);
      this.velocity.z = wishLen > 0 ? damp(this.velocity.z, wishZ * boostHoriz, 2.5, dt) : damp(this.velocity.z, this.velocity.z, 0.5, dt);
      this.velocity.y -= 20.0 * dt;
    } else {
      this.velocity.x = damp(this.velocity.x, targetVx, 5.0, dt);
      this.velocity.z = damp(this.velocity.z, targetVz, 5.0, dt);

      const diveBoost = !isGliding && forwardInput > 0 && this.pitch < -0.25 ? 10.0 : 0;
      const targetVy = isGliding ? -6.2 : -(22.5 + diveBoost);
      this.velocity.y = damp(this.velocity.y, targetVy, 6.0, dt);
    }

    this.position.x = clamp(this.position.x + this.velocity.x * dt, -390, 390);
    this.position.z = clamp(this.position.z + this.velocity.z * dt, -390, 390);
    this.position.y += this.velocity.y * dt;

    this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.moveSpeed > 1.0) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.characterYaw = lerpAngle(this.characterYaw, targetYaw, 1 - Math.exp(-10 * dt));
    }

    const groundY = this.collision.getFloorHeightAt(
      this.position.x,
      this.position.z,
      this.position.y + 1.0,
      1.0,
    );
    const altitude = this.position.y - groundY;

    if (
      !this.isKnocked &&
      this.grindRailCooldown <= 0 &&
      this.overdriveBridge &&
      this.velocity.y <= 2.5
    ) {
      const railMatch = this.overdriveBridge.findNearbyGrindRail(this.position, 2.8);
      if (
        railMatch &&
        this.position.y >= railMatch.position.y - 1.5 &&
        this.position.y <= railMatch.position.y + 2.4
      ) {
        this.phase = 'playing';
        this.attachGrindRail(railMatch);
        return;
      }
    }

    if (this.phase === 'skydiving' && altitude <= GLIDER_FORCE_HEIGHT) {
      this.phase = 'gliding';
      this.eventBus.emit('sound:play', { id: 'glider_deploy' });
    }

    const yawRate = clamp(
      normalizeAngle(this.yaw - this.prevYaw) / Math.max(dt, 0.001),
      -8,
      8,
    );
    const targetLean = clamp(-rightInput * 0.24 + yawRate * 0.04, -0.35, 0.35);
    this.leanAngle = damp(this.leanAngle, targetLean, 8, dt);
    this.prevYaw = this.yaw;

    if (this.velocity.y <= 0 && this.position.y <= groundY + 0.12) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.grounded = true;
      this.wasAirborne = false;
      this.fallPeakY = groundY;
      this.fallImmune = false;
      this.phase = 'playing';
      this.eventBus.emit('sound:play', {
        id: 'land',
        position: { ...this.position },
        spatial: true,
      });
    }
  }

  private resolveFootstepSound(
    groundMaterial: MaterialType | 'grass' | 'stone',
  ): SoundEventId {
    if (
      this.isSwimming ||
      (groundMaterial === 'grass' && this.terrain.isWater(this.position.x, this.position.z))
    ) {
      return 'footstep_water';
    }
    if (groundMaterial === 'wood') return 'footstep_wood';
    if (groundMaterial === 'metal') return 'footstep_metal';
    if (groundMaterial === 'brick' || groundMaterial === 'stone') return 'footstep_stone';

    const biome = this.terrain.getBiomeAt(this.position.x, this.position.z);
    switch (biome) {
      case 'snow':
        return 'footstep_snow';
      case 'beach':
      case 'desert':
        return 'footstep_sand';
      case 'ocean':
        return 'footstep_water';
      case 'urban':
      case 'highland':
      case 'volcanic':
        return 'footstep_stone';
      case 'cyber':
        return 'footstep_metal';
      default:
        return 'footstep';
    }
  }

  private updateGroundMovement(dt: number): void {
    const { forwardInput, rightInput } = this.getMoveAxes();
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const rightX = -Math.cos(this.yaw);
    const rightZ = Math.sin(this.yaw);

    let wishX = fwdX * forwardInput + rightX * rightInput;
    let wishZ = fwdZ * forwardInput + rightZ * rightInput;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1e-4) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    const terrainH = this.terrain.getHeightAt(this.position.x, this.position.z);
    const inWater =
      this.terrain.isWater(this.position.x, this.position.z) &&
      terrainH < WATER_LEVEL - 0.5 &&
      this.position.y <= WATER_LEVEL + 0.15;

    if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0 || inWater) {
        this.isSliding = false;
        this.slideTimer = 0;
        if (!inWater) {
          this.isCrouching = true;
        }
      }
    }

    const wantsSprint =
      !this.isKnocked &&
      !this.isSliding &&
      !this.isDrawingBow &&
      !this.isChargingRailgun &&
      !this.isRevivingPartner &&
      !this.isRebootingPartner &&
      (this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight')) &&
      forwardInput > 0 &&
      !this.isAiming &&
      this.stamina > 1.5;

    if (wantsSprint && wishLen > 0.1) {
      this.isSprinting = true;
      this.isCrouching = false;
      this.stamina = Math.max(0, this.stamina - 18 * dt);
      this.staminaRegenDelay = 1.15;
    } else {
      this.isSprinting = false;
      if (this.staminaRegenDelay > 0) {
        this.staminaRegenDelay = Math.max(0, this.staminaRegenDelay - dt);
      } else {
        const staminaRegenRate =
          24 * (this.hasMedallion('medallion_agility') ? 1.25 : 1.0);
        this.stamina = Math.min(100, this.stamina + staminaRegenRate * dt);
      }
    }

    const activeItem = this.inventory.getActiveItem();
    const activeDef = activeItem ? WEAPONS[activeItem.weaponId] : WEAPONS.pickaxe;
    this.isAiming =
      !this.isKnocked &&
      this.rightMouseDown &&
      !this.isBuildMode &&
      !this.building.getEditState().active &&
      !activeDef.isConsumable &&
      !activeDef.isJetpack &&
      !activeDef.isShockwaveHammer &&
      activeItem?.weaponId !== 'pickaxe' &&
      activeItem?.weaponId !== 'kinetic_blade' &&
      activeItem?.weaponId !== 'shockwave_hammer' &&
      activeItem?.weaponId !== 'jetpack';
    this.isScoped = this.isAiming && activeItem?.weaponId === 'sniper';

    const hasJetpack = this.inventory.findSlotByWeapon('jetpack') !== -1;
    const jetpackSelected =
      !this.isBuildMode &&
      !this.building.getEditState().active &&
      activeItem?.weaponId === 'jetpack';
    const wantsJetpackInput =
      hasJetpack &&
      !this.isKnocked &&
      !this.isRevivingPartner &&
      !this.isRebootingPartner &&
      !this.isHackingTrainChest &&
      ((!this.grounded && this.keysDown.has('Space')) ||
        (jetpackSelected && this.leftMouseDown));

    if (!wantsJetpackInput || (this.grounded && !(jetpackSelected && this.leftMouseDown))) {
      this.jetpackDryLock = false;
    }

    const wasJetpackThrusting = this.isJetpackThrusting;
    this.isJetpackThrusting =
      wantsJetpackInput && !this.jetpackDryLock && this.jetpackFuel > 0;

    if (this.isJetpackThrusting) {
      const fullBurn = JETPACK_BURN_RATE * dt;
      const burnAmount = Math.min(this.jetpackFuel, fullBurn);
      const thrustFrac = fullBurn > 0 ? burnAmount / fullBurn : 0;
      this.jetpackFuel = Math.max(0, this.jetpackFuel - burnAmount);
      if (this.jetpackFuel <= 1e-6) {
        this.jetpackFuel = 0;
        this.jetpackDryLock = true;
      }
      this.velocity.y = Math.min(
        14.0,
        this.velocity.y + JETPACK_THRUST_ACCEL * dt * thrustFrac,
      );
      this.grounded = false;
      this.wasAirborne = true;
      this.fallImmune = true;
      this.fallPeakY = Math.max(this.fallPeakY, this.position.y);
      this.isCrouching = false;
      this.isSliding = false;
      this.healTimer = 0;
      this.healLabel = null;
      if (!wasJetpackThrusting) {
        this.eventBus.emit('sound:play', {
          id: 'jetpack_ignite',
          position: { ...this.position },
          spatial: true,
        });
        this.jetpackVfxTimer = 0;
      }
      this.jetpackVfxTimer -= dt;
      if (this.jetpackVfxTimer <= 0) {
        this.jetpackVfxTimer = 0.06;
        const sinYaw = Math.sin(this.characterYaw);
        const cosYaw = Math.cos(this.characterYaw);
        this.eventBus.emit('vfx:jetpack_flame', {
          position: {
            x: this.position.x - sinYaw * 0.28,
            y: this.position.y + 1.05,
            z: this.position.z - cosYaw * 0.28,
          },
          direction: {
            x: -sinYaw * 0.15,
            y: -1,
            z: -cosYaw * 0.15,
          },
          intensity: clamp(
            0.65 + (this.jetpackFuel / JETPACK_MAX_FUEL) * 0.35,
            0.5,
            1.0,
          ),
        });
      }
    } else {
      this.jetpackVfxTimer = 0;
      if (hasJetpack && this.jetpackFuel < JETPACK_MAX_FUEL) {
        this.jetpackFuel = Math.min(
          JETPACK_MAX_FUEL,
          this.jetpackFuel + JETPACK_RECHARGE_RATE * dt,
        );
      }
    }

    if (this.isSliding) {
      if (rightInput !== 0) {
        const steerAngle = -rightInput * 0.9 * dt;
        const cosS = Math.cos(steerAngle);
        const sinS = Math.sin(steerAngle);
        const sx = this.slideDir.x * cosS - this.slideDir.z * sinS;
        const sz = this.slideDir.x * sinS + this.slideDir.z * cosS;
        const sLen = Math.hypot(sx, sz) || 1;
        this.slideDir.x = sx / sLen;
        this.slideDir.z = sz / sLen;
      }
      const normal = this.terrain.getNormalAt(this.position.x, this.position.z);
      const downhillDot = this.slideDir.x * normal.x + this.slideDir.z * normal.z;
      if (downhillDot > 0.03) {
        this.slideSpeed = Math.min(20.0, this.slideSpeed + downhillDot * 20.0 * dt);
      } else if (downhillDot < -0.03) {
        this.slideSpeed = Math.max(3.5, this.slideSpeed + downhillDot * 16.0 * dt);
      } else {
        this.slideSpeed = damp(this.slideSpeed, 4.8, 2.2, dt);
      }
      this.velocity.x = this.slideDir.x * this.slideSpeed;
      this.velocity.z = this.slideDir.z * this.slideSpeed;
    } else {
      let targetSpeed = 6.6;
      if (this.isKnocked) {
        targetSpeed = 2.1;
      } else if (this.isCrouching) {
        targetSpeed = 3.6;
      } else if (this.isSprinting) {
        targetSpeed = 9.6 * (this.hasMedallion('medallion_agility') ? 1.15 : 1.0);
      } else if (
        this.isAiming ||
        this.healTimer > 0 ||
        this.isRevivingPartner ||
        this.isRebootingPartner
      ) {
        targetSpeed = 3.8;
      } else if (this.isDrawingBow || this.isChargingRailgun) {
        targetSpeed = 4.6;
      }
      if (inWater) targetSpeed *= 0.68;

      const targetVx = wishX * targetSpeed;
      const targetVz = wishZ * targetSpeed;
      const accel = this.grounded
        ? 16.0
        : this.isJetpackThrusting
          ? 6.5
          : this.fallImmune
            ? 1.2
            : 5.5;
      this.velocity.x = damp(this.velocity.x, targetVx, accel, dt);
      this.velocity.z = damp(this.velocity.z, targetVz, accel, dt);
    }

    const augmentGravScale =
      !this.grounded && this.augmentManager.hasAugment('parkour_boost')
        ? 0.84
        : 1.0;
    const lowGravScale = this.lowGravityTimer > 0 ? LOW_GRAVITY_SCALE : 1.0;
    const gravScale = augmentGravScale * lowGravScale;

    if (inWater && !this.isJetpackThrusting) {
      // Shallow swim buoyancy at water surface
      const swimY = WATER_LEVEL - 0.8;
      if (this.position.y < swimY) {
        this.velocity.y = damp(this.velocity.y, 4.0, 8.0, dt);
      } else {
        this.velocity.y -= 20.0 * gravScale * dt;
      }
    } else {
      this.velocity.y -= 22.0 * gravScale * dt;
    }

    const prevGrounded = this.grounded;
    const prevVy = this.velocity.y;
    const charHeight =
      this.isCrouching || this.isSliding || this.isKnocked
        ? PLAYER_CROUCH_HEIGHT
        : PLAYER_HEIGHT;

    const res = this.collision.resolveCharacterMovement(
      this.position,
      this.velocity,
      PLAYER_RADIUS,
      charHeight,
      dt,
    );

    this.position = res.position;
    this.velocity = res.velocity;

    let groundMaterial = res.groundMaterial;
    const trainSupport =
      this.skyforgeBridge?.getTrainPlatformSupport(this.position) ?? null;
    const supportedByTrain =
      trainSupport !== null &&
      !this.isJetpackThrusting &&
      this.velocity.y <= 0.01 &&
      this.position.y <= trainSupport.deckY + 0.45 &&
      this.position.y >= trainSupport.deckY - 0.85;
    if (supportedByTrain && trainSupport) {
      this.position.x = clamp(this.position.x + trainSupport.deltaX, -390, 390);
      this.position.z = clamp(this.position.z + trainSupport.deltaZ, -390, 390);
      this.position.y = trainSupport.deckY;
      this.velocity.y = 0;
      groundMaterial = 'metal';
    }

    const onStructure =
      (res.grounded || supportedByTrain) &&
      (groundMaterial === 'wood' ||
        groundMaterial === 'brick' ||
        groundMaterial === 'metal');
    this.isSwimming = inWater && !onStructure;
    this.grounded = res.grounded || supportedByTrain || this.isSwimming;

    // Keep inside island playable bounds
    this.position.x = clamp(this.position.x, -390, 390);
    this.position.z = clamp(this.position.z, -390, 390);

    // Airborne landing near a Neon Grind Rail auto-attaches with fall immunity
    if (
      !this.isKnocked &&
      this.grindRailCooldown <= 0 &&
      this.overdriveBridge &&
      prevVy < -1.0 &&
      (!this.grounded || (!prevGrounded && this.wasAirborne))
    ) {
      const railMatch = this.overdriveBridge.findNearbyGrindRail(this.position, 2.8);
      if (
        railMatch &&
        this.position.y >= railMatch.position.y - 0.85 &&
        this.position.y <= railMatch.position.y + 2.4
      ) {
        this.attachGrindRail(railMatch);
        return;
      }
    }

    // Track fall peak & resolve fall damage on landing
    if (!this.grounded) {
      if (!this.wasAirborne) {
        this.wasAirborne = true;
        this.fallPeakY = Math.max(this.fallPeakY, this.position.y);
      } else if (this.position.y > this.fallPeakY) {
        this.fallPeakY = this.position.y;
      }
    } else if (this.isSwimming) {
      this.wasAirborne = false;
      this.fallPeakY = this.position.y;
      this.fallImmune = false;
    } else {
      if (!prevGrounded && this.wasAirborne) {
        const fallDistance = this.fallPeakY - this.position.y;
        if (
          !this.fallImmune &&
          this.lowGravityTimer <= 0 &&
          fallDistance > 13 &&
          this.isAlive()
        ) {
          const fallDmg = clamp(Math.round((fallDistance - 13) * 5), 1, 100);
          this.applyDamage({
            targetId: 'player',
            attackerId: 'environment',
            attackerName: 'Fall Damage',
            weaponId: 'pickaxe',
            rarity: 'common',
            damage: fallDmg,
            hpDamage: fallDmg,
            shieldDamage: 0,
            isHeadshot: false,
            isElimination: this.health - fallDmg <= 0,
            hitPoint: { ...this.position },
            distance: fallDistance,
          });
          this.eventBus.emit('sound:play', {
            id: 'fall_damage',
            position: { ...this.position },
            spatial: true,
          });
          this.eventBus.emit('vfx:camera_shake', {
            intensity: clamp(fallDmg / 45, 0.25, 0.85),
            duration: 0.28,
          });
        }
      }
      this.wasAirborne = false;
      this.fallPeakY = this.position.y;
      this.fallImmune = false;
    }

    // Check Launch Pads & Volcanic Geysers
    if (!this.isKnocked && this.launchPadCooldown <= 0 && this.traversalBridge) {
      const pads = this.traversalBridge.getLaunchPads();
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        const d2 = dist2D(this.position.x, this.position.z, pad.x, pad.z);
        const dy = Math.abs(this.position.y - pad.y);
        if (d2 <= pad.radius && dy <= 2.3) {
          this.launchPadCooldown = 0.9;
          this.isCrouching = false;
          this.isSliding = false;
          this.isBuildMode = false;
          this.building.setPreviewVisible(false);
          this.activeZipline = null;
          this.grounded = false;
          this.wasAirborne = true;
          this.fallImmune = true;
          this.fallPeakY = this.position.y;
          this.phase = 'gliding';
          this.velocity.x = fwdX * pad.boostForward;
          this.velocity.y = pad.boostVy;
          this.velocity.z = fwdZ * pad.boostForward;
          this.eventBus.emit('sound:play', {
            id: 'launch_pad',
            position: { x: pad.x, y: pad.y, z: pad.z },
            spatial: true,
          });
          this.eventBus.emit('vfx:build_pop', {
            position: { x: pad.x, y: pad.y + 0.4, z: pad.z },
            material: 'metal',
            pieceType: 'floor',
          });
          return;
        }
      }
    }

    if (!prevGrounded && this.grounded && prevVy < -6.0 && !this.isSwimming) {
      this.eventBus.emit('sound:play', {
        id: 'land',
        position: { ...this.position },
        spatial: true,
      });
    }

    this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.isEmoting && (this.moveSpeed > 0.6 || !this.grounded)) {
      this.isEmoting = false;
      this.activeEmote = null;
    }

    // Slide dust VFX & audio loop
    if (this.isSliding && this.grounded) {
      this.slideDustTimer -= dt;
      if (this.slideDustTimer <= 0) {
        this.slideDustTimer = 0.08;
        this.eventBus.emit('vfx:slide_dust', {
          position: { ...this.position },
          biome: this.terrain.getBiomeAt(this.position.x, this.position.z),
        });
      }
      this.slideSoundTimer -= dt;
      if (this.slideSoundTimer <= 0) {
        this.slideSoundTimer = 0.28;
        this.eventBus.emit('sound:play', {
          id: 'slide_loop',
          position: { ...this.position },
          volume: 0.55,
          spatial: true,
        });
      }
    }

    // Footstep sound cadence with surface & biome mapping
    if (
      this.grounded &&
      !this.isKnocked &&
      this.moveSpeed > 1.3 &&
      !this.isCrouching &&
      !this.isSliding
    ) {
      this.footstepTimer -= dt * (this.isSprinting ? 1.45 : 1.0);
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.36;
        const footId = this.resolveFootstepSound(groundMaterial);
        this.eventBus.emit('sound:play', {
          id: footId,
          position: { ...this.position },
          volume: 0.45,
          spatial: true,
        });
        this.eventBus.emit('audio:noise', {
          position: { ...this.position },
          kind: 'footstep',
          sourceId: 'player',
          radius: 18,
        });
      }
    }

    // Banking lean angle during strafes and turns
    const yawRate = clamp(
      normalizeAngle(this.yaw - this.prevYaw) / Math.max(dt, 0.001),
      -8,
      8,
    );
    const moveFactor = clamp(this.moveSpeed / 8.0, 0, 1);
    const targetLean = clamp(
      (-rightInput * 0.16 + yawRate * 0.035) * (0.35 + 0.65 * moveFactor),
      -0.32,
      0.32,
    );
    this.leanAngle = damp(this.leanAngle, targetLean, 10, dt);
    this.prevYaw = this.yaw;

    // Character facing yaw: align to camera when aiming/firing/building, else smooth blend
    if (this.isAiming || this.isFiring || this.isBuildMode || this.moveSpeed < 0.4) {
      this.characterYaw = lerpAngle(this.characterYaw, this.yaw, 1 - Math.exp(-16 * dt));
    } else {
      const moveYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.characterYaw = lerpAngle(this.characterYaw, moveYaw, 1 - Math.exp(-10 * dt));
    }
  }

  private findNearestZipline(): { zip: ZiplineEntity; t: number } | null {
    if (!this.traversalBridge) return null;
    const ziplines = this.traversalBridge.getZiplines();
    let best: { zip: ZiplineEntity; t: number } | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < ziplines.length; i++) {
      const zip = ziplines[i];
      const dx = zip.end.x - zip.start.x;
      const dz = zip.end.z - zip.start.z;
      const lenSqXZ = dx * dx + dz * dz;
      if (lenSqXZ < 1e-4) continue;
      const t = clamp(
        ((this.position.x - zip.start.x) * dx + (this.position.z - zip.start.z) * dz) / lenSqXZ,
        0,
        1,
      );
      const cx = zip.start.x + dx * t;
      const cy = zip.start.y + (zip.end.y - zip.start.y) * t;
      const cz = zip.start.z + dz * t;

      const hx = Math.hypot(this.position.x - cx, this.position.z - cz);
      const vDelta = cy - this.position.y;
      if (hx <= 3.8 && vDelta >= -2.5 && vDelta <= 10.5) {
        const score = hx + Math.abs(vDelta) * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = { zip, t };
        }
      }
    }

    return best;
  }

  private attachZipline(zip: ZiplineEntity, t: number): void {
    const dx = zip.end.x - zip.start.x;
    const dz = zip.end.z - zip.start.z;
    const lenXZ = Math.max(1e-4, Math.hypot(dx, dz));
    const lookX = Math.sin(this.yaw);
    const lookZ = Math.cos(this.yaw);
    const dot = (lookX * dx + lookZ * dz) / lenXZ;

    let dir: 1 | -1 = dot >= 0 ? 1 : -1;
    if (t < 0.08) dir = 1;
    else if (t > 0.92) dir = -1;

    this.activeZipline = { zip, t, dir };
    this.isCrouching = false;
    this.isSliding = false;
    this.isMantling = false;
    this.healTimer = 0;
    this.reloadTimer = 0;
    this.grounded = false;
    this.wasAirborne = false;
    this.fallPeakY = this.position.y;
    this.ziplineSoundTimer = 0.35;
    this.eventBus.emit('sound:play', {
      id: 'zipline_attach',
      position: { ...this.position },
      spatial: true,
    });
  }

  private detachZipline(withJumpBoost: boolean): void {
    if (!this.activeZipline) return;
    const { zip, dir } = this.activeZipline;
    const dx = zip.end.x - zip.start.x;
    const dz = zip.end.z - zip.start.z;
    const lenXZ = Math.max(1e-4, Math.hypot(dx, dz));
    this.activeZipline = null;
    this.ziplineCooldown = 0.65;
    this.grounded = false;
    this.wasAirborne = true;
    this.fallPeakY = this.position.y;

    const fwdX = (dx / lenXZ) * dir;
    const fwdZ = (dz / lenXZ) * dir;
    this.velocity.x = fwdX * (withJumpBoost ? 9.5 : 8.5);
    this.velocity.z = fwdZ * (withJumpBoost ? 9.5 : 8.5);
    this.velocity.y = withJumpBoost ? 7.5 : 4.0;

    this.eventBus.emit('sound:play', {
      id: 'jump',
      position: { ...this.position },
      spatial: true,
    });
  }

  private updateZiplineRide(dt: number): void {
    const active = this.activeZipline;
    if (!active) return;

    const { zip, dir } = active;
    const dx = zip.end.x - zip.start.x;
    const dy = zip.end.y - zip.start.y;
    const dz = zip.end.z - zip.start.z;
    const segLen = Math.max(1.0, Math.hypot(dx, dy, dz));

    active.t += (dir * zip.speed * dt) / segLen;
    if (active.t >= 1.0 || active.t <= 0.0) {
      active.t = clamp(active.t, 0, 1);
      const ex = zip.start.x + dx * active.t;
      const ey = zip.start.y + dy * active.t;
      const ez = zip.start.z + dz * active.t;
      const groundY = this.terrain.getHeightAt(ex, ez);
      this.position = { x: ex, y: Math.max(groundY + 0.25, ey - 2.15), z: ez };
      this.detachZipline(false);
      return;
    }

    const cx = zip.start.x + dx * active.t;
    const cy = zip.start.y + dy * active.t;
    const cz = zip.start.z + dz * active.t;
    const groundY = this.terrain.getHeightAt(cx, cz);

    this.position = {
      x: clamp(cx, -390, 390),
      y: Math.max(groundY + 0.15, cy - 2.15),
      z: clamp(cz, -390, 390),
    };
    this.velocity = {
      x: (dx / segLen) * dir * zip.speed,
      y: (dy / segLen) * dir * zip.speed,
      z: (dz / segLen) * dir * zip.speed,
    };
    this.moveSpeed = zip.speed;
    this.grounded = false;
    this.isSprinting = false;
    this.fallPeakY = this.position.y;
    this.leanAngle = damp(this.leanAngle, 0, 10, dt);
    this.prevYaw = this.yaw;
    this.characterYaw = Math.atan2(dx * dir, dz * dir);

    this.ziplineSoundTimer -= dt;
    if (this.ziplineSoundTimer <= 0) {
      this.ziplineSoundTimer = 0.45;
      this.eventBus.emit('sound:play', {
        id: 'zipline_loop',
        position: { ...this.position },
        volume: 0.4,
        spatial: true,
      });
    }
  }

  private computeGrindRailInfo(rail: GrindRailEntity): {
    length: number;
    isClosed: boolean;
  } {
    if (this.overdriveBridge) {
      const steps = 32;
      const samples: Vec3Like[] = [];
      for (let i = 0; i < steps; i++) {
        const s = this.overdriveBridge.sampleGrindRailAt(rail.id, i / steps);
        if (!s) break;
        samples.push(s.position);
      }
      const endSample = this.overdriveBridge.sampleGrindRailAt(rail.id, 0.999);
      if (samples.length === steps && endSample) {
        let len = 0;
        for (let i = 0; i < steps - 1; i++) {
          len += dist3D(samples[i], samples[i + 1]);
        }
        len += dist3D(samples[steps - 1], endSample.position);
        const avgStep = len / steps;
        const closeDist = dist3D(endSample.position, samples[0]);
        const isClosed =
          rail.points.length >= 3 && closeDist <= Math.max(4.0, avgStep * 2.5);
        if (isClosed) {
          len += closeDist;
        }
        return { length: Math.max(4, len), isClosed };
      }
    }

    const pts = rail.points;
    if (!pts || pts.length < 2) return { length: 24, isClosed: true };
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      len += dist3D(pts[i], pts[i + 1]);
    }
    const closeDist = dist3D(pts[pts.length - 1], pts[0]);
    const isClosed = pts.length >= 3;
    if (isClosed) {
      len += closeDist;
    }
    return { length: Math.max(4, len), isClosed };
  }

  private attachGrindRail(match: NearbyGrindRailMatch): void {
    const tLen = Math.hypot(match.tangent.x, match.tangent.z) || 1;
    const lookX = Math.sin(this.yaw);
    const lookZ = Math.cos(this.yaw);
    const dot = (lookX * match.tangent.x + lookZ * match.tangent.z) / tLen;
    const dir: 1 | -1 = dot >= 0 ? 1 : -1;

    const info = this.computeGrindRailInfo(match.rail);
    this.activeGrindRail = {
      rail: match.rail,
      t: ((match.t % 1) + 1) % 1,
      dir,
      railLength: info.length,
      isClosed: info.isClosed,
    };
    this.activeZipline = null;
    this.isCrouching = false;
    this.isSliding = false;
    this.isMantling = false;
    this.isSprinting = false;
    this.isBuildMode = false;
    this.building.setPreviewVisible(false);
    this.building.cancelEdit();
    this.healTimer = 0;
    this.healLabel = null;
    this.grounded = false;
    this.wasAirborne = false;
    this.fallImmune = true;
    this.fallPeakY = match.position.y;
    this.position = { ...match.position };
    this.grindSparkTimer = 0.1;

    const speed = GRIND_RAIL_SPEED;
    const tanLen =
      Math.hypot(match.tangent.x, match.tangent.y, match.tangent.z) || 1;
    this.velocity = {
      x: (match.tangent.x / tanLen) * dir * speed,
      y: (match.tangent.y / tanLen) * dir * speed,
      z: (match.tangent.z / tanLen) * dir * speed,
    };
    this.moveSpeed = speed;

    this.eventBus.emit('sound:play', {
      id: 'grind_attach',
      position: { ...this.position },
      spatial: true,
    });
    this.eventBus.emit('vfx:rail_sparks', {
      position: { ...this.position },
      velocity: {
        x: this.velocity.x * 0.35,
        y: 1.8,
        z: this.velocity.z * 0.35,
      },
    });
  }

  private detachGrindRail(withJumpBoost: boolean): void {
    if (!this.activeGrindRail) return;
    const active = this.activeGrindRail;
    const sample = this.overdriveBridge?.sampleGrindRailAt(
      active.rail.id,
      active.t,
    );
    this.activeGrindRail = null;
    this.grindRailCooldown = 0.55;
    this.grounded = false;
    this.wasAirborne = true;
    this.fallImmune = true;
    this.fallPeakY = this.position.y;

    const tx = sample ? sample.tangent.x * active.dir : Math.sin(this.yaw);
    const tz = sample ? sample.tangent.z * active.dir : Math.cos(this.yaw);
    const hLen = Math.hypot(tx, tz) || 1;
    const horizSpeed = withJumpBoost
      ? GRIND_RAIL_SPEED * 0.72
      : GRIND_RAIL_SPEED * 0.55;
    this.velocity.x = (tx / hLen) * horizSpeed;
    this.velocity.z = (tz / hLen) * horizSpeed;
    this.velocity.y = withJumpBoost ? 9.2 : 4.0;

    this.eventBus.emit('sound:play', {
      id: 'jump',
      position: { ...this.position },
      spatial: true,
    });
  }

  private updateGrindRailRide(dt: number): void {
    const active = this.activeGrindRail;
    if (!active || !this.overdriveBridge) {
      this.activeGrindRail = null;
      return;
    }

    const speed = GRIND_RAIL_SPEED;
    active.t += (active.dir * speed * dt) / Math.max(1, active.railLength);

    if (active.isClosed) {
      active.t = ((active.t % 1) + 1) % 1;
    } else if (active.t >= 1 || active.t <= 0) {
      active.t = clamp(active.t, 0, 1);
      const endSample = this.overdriveBridge.sampleGrindRailAt(
        active.rail.id,
        active.t,
      );
      if (endSample) {
        this.position = { ...endSample.position };
      }
      this.detachGrindRail(false);
      return;
    }

    const sample = this.overdriveBridge.sampleGrindRailAt(
      active.rail.id,
      active.t,
    );
    if (!sample) {
      this.detachGrindRail(false);
      return;
    }

    const tanLen =
      Math.hypot(sample.tangent.x, sample.tangent.y, sample.tangent.z) || 1;
    const tx = (sample.tangent.x / tanLen) * active.dir;
    const ty = (sample.tangent.y / tanLen) * active.dir;
    const tz = (sample.tangent.z / tanLen) * active.dir;

    this.position = {
      x: clamp(sample.position.x, -390, 390),
      y: sample.position.y,
      z: clamp(sample.position.z, -390, 390),
    };
    this.velocity = {
      x: tx * speed,
      y: ty * speed,
      z: tz * speed,
    };
    this.moveSpeed = speed;
    this.grounded = false;
    this.isSprinting = false;
    this.fallImmune = true;
    this.fallPeakY = this.position.y;

    const activeItem = this.inventory.getActiveItem();
    const activeDef = activeItem ? WEAPONS[activeItem.weaponId] : WEAPONS.pickaxe;
    this.isAiming =
      !this.isKnocked &&
      this.rightMouseDown &&
      !this.isBuildMode &&
      !this.building.getEditState().active &&
      !activeDef.isConsumable &&
      !activeDef.isJetpack &&
      !activeDef.isShockwaveHammer &&
      activeItem?.weaponId !== 'pickaxe' &&
      activeItem?.weaponId !== 'kinetic_blade' &&
      activeItem?.weaponId !== 'shockwave_hammer' &&
      activeItem?.weaponId !== 'jetpack';
    this.isScoped = this.isAiming && activeItem?.weaponId === 'sniper';

    if (this.isAiming || this.isFiring) {
      this.characterYaw = lerpAngle(
        this.characterYaw,
        this.yaw,
        1 - Math.exp(-16 * dt),
      );
    } else {
      this.characterYaw = Math.atan2(tx, tz);
    }

    const yawRate = clamp(
      normalizeAngle(this.yaw - this.prevYaw) / Math.max(dt, 0.001),
      -8,
      8,
    );
    this.leanAngle = damp(this.leanAngle, clamp(yawRate * 0.04, -0.3, 0.3), 10, dt);
    this.prevYaw = this.yaw;

    this.grindSparkTimer -= dt;
    if (this.grindSparkTimer <= 0) {
      this.grindSparkTimer = 0.1;
      this.eventBus.emit('vfx:rail_sparks', {
        position: { ...this.position },
        velocity: {
          x: this.velocity.x * 0.35,
          y: 1.8,
          z: this.velocity.z * 0.35,
        },
      });
    }
  }

  private updateCombatAndTimers(dt: number): void {
    // DBNO bleed-out while knocked
    if (this.isKnocked && this.isAlive()) {
      this.bleedOutHp = Math.max(0, this.bleedOutHp - DBNO_BLEED_DPS * dt);
      if (this.bleedOutHp <= 0) {
        this.handleEliminated();
      }
      this.building.setPreviewVisible(false);
      this.lastBuildPreview = null;
      this.isFiring = false;
      this.isDrawingBow = false;
      this.bowDrawElapsed = 0;
      this.bowCharge = 0;
      this.isChargingRailgun = false;
      this.railgunChargeElapsed = 0;
      this.railgunCharge = 0;
      this.minigunSpinTimer = 0;
      this.cancelPartnerReboot();
      return;
    }

    // Overheat Minigun spin-up, overheat lock & cooling
    if (this.minigunOverheated) {
      const lockSec = Math.max(0.1, WEAPONS.minigun.overheatLockSec ?? 2.4);
      this.minigunOverheatTimer = Math.max(0, this.minigunOverheatTimer - dt);
      this.minigunHeat = clamp(this.minigunOverheatTimer / lockSec, 0, 1);
      if (this.minigunOverheatTimer <= 0) {
        this.minigunOverheated = false;
        this.minigunHeat = 0;
      }
    }

    const currActiveItem = this.inventory.getActiveItem();
    const currActiveDef = currActiveItem
      ? WEAPONS[currActiveItem.weaponId]
      : null;
    const isSpinningMinigun =
      !this.isBuildMode &&
      !this.building.getEditState().active &&
      !this.isRevivingPartner &&
      !this.isRebootingPartner &&
      this.activeVehicleId === null &&
      Boolean(currActiveDef?.isMinigun || currActiveItem?.weaponId === 'minigun') &&
      this.leftMouseDown &&
      !this.minigunOverheated &&
      this.inventory.getAmmo('light') > 0;

    if (isSpinningMinigun) {
      const spinUpSec = Math.max(0.01, currActiveDef?.spinUpSec ?? 0.45);
      this.minigunSpinTimer = Math.min(spinUpSec, this.minigunSpinTimer + dt);
    } else {
      this.minigunSpinTimer = Math.max(0, this.minigunSpinTimer - dt * 2.5);
      if (!this.minigunOverheated && this.minigunHeat > 0) {
        const coolRate = WEAPONS.minigun.coolRatePerSec ?? 0.34;
        this.minigunHeat = Math.max(0, this.minigunHeat - coolRate * dt);
      }
    }

    // Victory Crown periodic glint
    if (this.victoryCrown && this.isAlive() && !this.isKnocked) {
      this.crownGlintTimer -= dt;
      if (this.crownGlintTimer <= 0) {
        this.crownGlintTimer = CROWN_GLINT_INTERVAL_SEC;
        const glintPos = {
          x: this.position.x,
          y: this.position.y + PLAYER_HEIGHT + 0.35,
          z: this.position.z,
        };
        this.eventBus.emit('vfx:crown_glint', { position: glintPos });
        this.eventBus.emit('sound:play', {
          id: 'crown_glint',
          position: glintPos,
          spatial: true,
        });
      }
    }

    // Siphon Aspect Medallion: +2/s shield regen up to 50 when out of combat >= 4s
    if (
      this.hasMedallion('medallion_siphon') &&
      this.isAlive() &&
      !this.isKnocked &&
      this.shield < 50 &&
      this.elapsedTime - this.lastDamageTime >= 4.0
    ) {
      this.shield = Math.min(50, this.shield + 2.0 * dt);
    }

    // Slurp Juice HoT tick
    if (this.slurpHotRemaining > 0 && this.isAlive()) {
      const tick = Math.min(this.slurpHotRemaining, this.slurpHotRate * dt);
      this.slurpHotRemaining -= tick;
      if (this.health < this.maxHealth) {
        const hpHeal = Math.min(this.maxHealth - this.health, tick);
        this.health += hpHeal;
        const leftover = tick - hpHeal;
        if (leftover > 0) {
          this.shield = Math.min(this.maxShield, this.shield + leftover);
        }
      } else {
        this.shield = Math.min(this.maxShield, this.shield + tick);
      }
    }

    // Zero Build Overshield recharge after 6.5s without taking damage
    if (
      this.gameMode === 'zero_build' &&
      this.isAlive() &&
      this.overshield < this.maxOvershield
    ) {
      const timeSinceDamage = this.elapsedTime - this.lastDamageTime;
      if (timeSinceDamage >= 6.5) {
        if (!this.overshieldRecharging) {
          this.overshieldRecharging = true;
          this.eventBus.emit('sound:play', {
            id: 'overshield_recharge',
            position: { ...this.position },
            spatial: true,
          });
        }
        this.overshield = Math.min(this.maxOvershield, this.overshield + 12 * dt);
        if (this.overshield >= this.maxOvershield) {
          this.overshieldRecharging = false;
        }
      }
    } else {
      this.overshieldRecharging = false;
    }

    // Passive Cozy Campfire healing
    if (this.stationBridge && this.isAlive()) {
      const healPerSec = this.stationBridge.getActiveCampfireHealAt(
        this.position.x,
        this.position.y,
        this.position.z,
      );
      if (healPerSec > 0) {
        this.nearCampfireHealing = true;
        if (this.health < this.maxHealth) {
          this.health = Math.min(this.maxHealth, this.health + healPerSec * dt);
        }
        this.campfireHealVfxTimer -= dt;
        if (this.campfireHealVfxTimer <= 0) {
          this.campfireHealVfxTimer = 1.2;
          this.eventBus.emit('sound:play', {
            id: 'campfire_heal',
            position: { ...this.position },
            spatial: true,
          });
          this.eventBus.emit('vfx:campfire_heal', {
            position: {
              x: this.position.x,
              y: this.position.y + 0.35,
              z: this.position.z,
            },
          });
        }
      } else {
        this.nearCampfireHealing = false;
        this.campfireHealVfxTimer = 0;
      }
    } else {
      this.nearCampfireHealing = false;
      this.campfireHealVfxTimer = 0;
    }

    // Reload timer
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        if (this.reloadSlotIndex >= 1) {
          const reloadedItem = this.inventory.getSlot(this.reloadSlotIndex);
          const loaded = this.inventory.reloadSlot(this.reloadSlotIndex);
          if (reloadedItem && loaded > 0) {
            this.weapons.completeTwinMagReload(reloadedItem);
          }
        }
        this.reloadSlotIndex = -1;
      }
    }

    // Duos Partner Revive channel (hold [E] for REVIVE_DURATION_SEC)
    if (this.isRevivingPartner) {
      const interactCode = this.getResolvedKeybinds().interact;
      const partner = this.duoReviveBridge?.getPartnerDownedNearby(this.position) ?? null;
      if (
        !this.keysDown.has(interactCode) ||
        !this.isAlive() ||
        this.isKnocked ||
        this.activeVehicleId !== null ||
        this.activeZipline !== null ||
        this.isBuildMode ||
        this.isSliding ||
        this.isMantling ||
        !this.grounded ||
        this.moveSpeed > 2.0 ||
        !partner
      ) {
        this.cancelPartnerRevive();
      } else {
        this.reloadTimer = 0;
        this.healTimer = 0;
        this.healLabel = null;
        this.isDrawingBow = false;
        this.bowDrawElapsed = 0;
        this.bowCharge = 0;
        this.reviveTimer += dt;
        const progress = clamp(this.reviveTimer / REVIVE_DURATION_SEC, 0, 1);
        this.reviveLabel = `REVIVING ${partner.name ?? 'PARTNER'}`;
        this.eventBus.emit('vfx:revive_beam', {
          position: { ...partner.position },
          progress,
        });

        this.reviveTickSoundTimer -= dt;
        if (this.reviveTickSoundTimer <= 0 && this.reviveTimer < REVIVE_DURATION_SEC) {
          this.reviveTickSoundTimer = 0.5;
          this.eventBus.emit('sound:play', {
            id: 'revive_tick',
            position: { ...partner.position },
            spatial: true,
          });
        }

        if (this.reviveTimer >= REVIVE_DURATION_SEC - 1e-6) {
          const completed = this.duoReviveBridge?.completePartnerRevive();
          if (completed !== false) {
            this.stats.revives = (this.stats.revives ?? 0) + 1;
            this.eventBus.emit('sound:play', {
              id: 'revive_complete',
              position: { ...partner.position },
              spatial: true,
            });
            this.eventBus.emit('vfx:revive_beam', {
              position: { ...partner.position },
              progress: 1,
            });
          }
          this.cancelPartnerRevive();
        }
        this.building.setPreviewVisible(false);
        this.lastBuildPreview = null;
        this.isFiring = false;
        return;
      }
    }

    // Duos Reboot Van 5.0s channel (hold [E] for REBOOT_DURATION_SEC)
    if (this.isRebootingPartner) {
      const interactCode = this.getResolvedKeybinds().interact;
      const van =
        this.activeRebootVanId && this.overdriveBridge
          ? this.overdriveBridge
              .getRebootVans()
              .find((v) => v.id === this.activeRebootVanId) ?? null
          : null;
      const hasCard = Boolean(this.duoRebootBridge?.hasPartnerRebootCard());
      const inRange = van
        ? dist3D(this.position, { x: van.x, y: van.y, z: van.z }) <= 5.5
        : false;
      if (
        !this.keysDown.has(interactCode) ||
        !this.isAlive() ||
        this.isKnocked ||
        this.activeVehicleId !== null ||
        this.activeZipline !== null ||
        this.activeGrindRail !== null ||
        this.isBuildMode ||
        this.isSliding ||
        this.isMantling ||
        !this.grounded ||
        this.moveSpeed > 2.2 ||
        !van ||
        !van.available ||
        !hasCard ||
        !inRange
      ) {
        this.cancelPartnerReboot();
      } else {
        this.reloadTimer = 0;
        this.healTimer = 0;
        this.healLabel = null;
        this.isDrawingBow = false;
        this.bowDrawElapsed = 0;
        this.bowCharge = 0;
        this.isChargingRailgun = false;
        this.railgunChargeElapsed = 0;
        this.railgunCharge = 0;
        this.rebootTimer += dt;
        const progress = clamp(this.rebootTimer / REBOOT_DURATION_SEC, 0, 1);
        const vanPos = { x: van.x, y: van.y, z: van.z };
        this.eventBus.emit('vfx:reboot_beam', {
          position: vanPos,
          progress,
        });

        this.rebootTickSoundTimer -= dt;
        if (this.rebootTickSoundTimer <= 0 && this.rebootTimer < REBOOT_DURATION_SEC) {
          this.rebootTickSoundTimer = 0.85;
          this.eventBus.emit('sound:play', {
            id: 'reboot_channel',
            position: vanPos,
            spatial: true,
          });
          this.eventBus.emit('audio:noise', {
            position: vanPos,
            kind: 'gunfire',
            sourceId: 'player',
            radius: 135,
          });
        }

        if (this.rebootTimer >= REBOOT_DURATION_SEC - 1e-6) {
          const vanTriggered = this.overdriveBridge!.triggerRebootVan(van.id);
          if (vanTriggered) {
            const rebooted = this.duoRebootBridge!.rebootPartnerAt(vanPos);
            if (rebooted !== false && rebooted !== null) {
              this.stats.reboots = (this.stats.reboots ?? 0) + 1;
              this.eventBus.emit('sound:play', {
                id: 'reboot_complete',
                position: vanPos,
                spatial: true,
              });
              this.eventBus.emit('vfx:reboot_beam', {
                position: vanPos,
                progress: 1,
              });
            }
          }
          this.cancelPartnerReboot();
        }
        this.building.setPreviewVisible(false);
        this.lastBuildPreview = null;
        this.isFiring = false;
        return;
      }
    }

    // Apex Express Train Chest 3.0s hack channel (hold [E] near Train Chest)
    if (this.isHackingTrainChest) {
      const interactCode = this.getResolvedKeybinds().interact;
      const trainState = this.skyforgeBridge?.getTrainState() ?? null;
      const nearChest = Boolean(this.skyforgeBridge?.isNearTrainChest(this.position));
      if (
        !this.skyforgeBridge ||
        !this.keysDown.has(interactCode) ||
        !this.isAlive() ||
        this.isKnocked ||
        this.activeVehicleId !== null ||
        this.activeZipline !== null ||
        this.activeGrindRail !== null ||
        this.isBuildMode ||
        this.isSliding ||
        this.isMantling ||
        this.moveSpeed > 3.5 ||
        (trainState && (!trainState.active || trainState.chestHacked)) ||
        !nearChest
      ) {
        this.cancelTrainChestHack();
      } else {
        this.reloadTimer = 0;
        this.healTimer = 0;
        this.healLabel = null;
        this.isDrawingBow = false;
        this.bowDrawElapsed = 0;
        this.bowCharge = 0;
        this.isChargingRailgun = false;
        this.railgunChargeElapsed = 0;
        this.railgunCharge = 0;

        let emittedHackSfx = false;
        const unsubSfx = this.eventBus.on('sound:play', (ev) => {
          if (ev.id === 'train_hack_complete') emittedHackSfx = true;
        });
        const hackRes = this.skyforgeBridge.advanceTrainChestHack(dt, 'player');
        unsubSfx();

        if (!hackRes) {
          this.cancelTrainChestHack();
        } else {
          this.trainHackProgress = clamp(hackRes.progress, 0, 1);
          if (hackRes.completed) {
            this.addGoldBars(150, hackRes.lootPos);
            this.stats.trainChestsHacked = (this.stats.trainChestsHacked ?? 0) + 1;
            if (!emittedHackSfx) {
              this.eventBus.emit('sound:play', {
                id: 'train_hack_complete',
                position: { ...hackRes.lootPos },
                spatial: true,
              });
            }
            this.onTrainChestHacked?.(hackRes.lootPos);
            this.cancelTrainChestHack();
          }
          this.building.setPreviewVisible(false);
          this.lastBuildPreview = null;
          this.isFiring = false;
          return;
        }
      }
    }

    // Fishing Hole 1.8s cast channel
    if (this.isFishing) {
      const hole =
        this.activeFishingHoleId && this.overlordBridge
          ? this.overlordBridge
              .getFishingHoles()
              .find((h) => h.id === this.activeFishingHoleId) ?? null
          : null;
      const inRange = hole
        ? dist3D(this.position, { x: hole.x, y: hole.y, z: hole.z }) <= 7.5
        : false;
      if (
        !this.overlordBridge ||
        !this.isAlive() ||
        this.isKnocked ||
        this.activeVehicleId !== null ||
        this.activeZipline !== null ||
        this.activeGrindRail !== null ||
        this.isBuildMode ||
        this.isSliding ||
        this.isMantling ||
        this.moveSpeed > 2.2 ||
        !hole ||
        hole.depleted ||
        hole.castsRemaining <= 0 ||
        !inRange
      ) {
        this.cancelFishingChannel();
      } else {
        this.reloadTimer = 0;
        this.healTimer = 0;
        this.healLabel = null;
        this.isDrawingBow = false;
        this.bowDrawElapsed = 0;
        this.bowCharge = 0;
        this.isChargingRailgun = false;
        this.railgunChargeElapsed = 0;
        this.railgunCharge = 0;

        this.fishingTimer += dt;
        this.fishingProgress = clamp(this.fishingTimer / FISHING_CAST_SEC, 0, 1);

        if (this.fishingTimer >= FISHING_CAST_SEC - 1e-6) {
          const holeId = hole.id;
          let emittedCatchSfx = false;
          let emittedSplashVfx = false;
          const unsubSfx = this.eventBus.on('sound:play', (ev) => {
            if (ev.id === 'fishing_catch') emittedCatchSfx = true;
          });
          const unsubVfx = this.eventBus.on('vfx:fishing_splash', () => {
            emittedSplashVfx = true;
          });
          const castRes = this.overlordBridge.consumeFishingCast(holeId);
          unsubSfx();
          unsubVfx();

          this.cancelFishingChannel();

          if (castRes && castRes.ok) {
            this.stats.fishCaught = (this.stats.fishCaught ?? 0) + 1;
            const fxPos: Vec3Like = { ...castRes.position };
            if (!emittedSplashVfx) {
              this.eventBus.emit('vfx:fishing_splash', { position: fxPos });
            }
            if (!emittedCatchSfx) {
              this.eventBus.emit('sound:play', {
                id: 'fishing_catch',
                position: fxPos,
                spatial: true,
              });
            }
            if (castRes.reward === 'thermal_flopper') {
              this.applySplashHeal(40);
              this.thermalVisionTimer = THERMAL_FLOPPER_DURATION_SEC;
            } else if (castRes.reward === 'gold_cache') {
              this.addGoldBars(100, fxPos);
            }
            this.onFishingReward?.({
              ...castRes,
              position: { ...castRes.position },
            });
            this.interactPrompt = this.findNearestInteractable()?.prompt ?? null;
          }
        }

        this.building.setPreviewVisible(false);
        this.lastBuildPreview = null;
        this.isFiring = false;
        return;
      }
    }

    // Healing timer (cancelled if moving > 0.7 m/s or jumping)
    if (this.healTimer > 0) {
      if (this.moveSpeed > 0.75 || !this.grounded) {
        this.healTimer = 0;
        this.healDuration = 0;
        this.healLabel = null;
      } else {
        this.healTimer -= dt;
        if (this.healTimer <= 0) {
          this.finishConsumableUse();
        }
      }
    }

    if (this.activeVehicleId !== null) {
      this.building.setPreviewVisible(false);
      this.lastBuildPreview = null;
      this.isFiring = false;
      return;
    }

    const editState = this.building.getEditState();
    if (editState.active) {
      const hovered = this.building.getHoveredEditTileIndex(
        this.getEyePosition(),
        this.getLookDirection(),
      );
      this.building.setHoveredEditTile(hovered);
      if (this.leftMouseDown && hovered !== -1 && hovered !== this.lastDraggedEditTile) {
        this.building.toggleEditTile(hovered);
        this.lastDraggedEditTile = hovered;
      }
      return;
    }

    if (this.isBuildMode) {
      const mat = this.getBuildMaterialOrFallback();
      const hasMats = this.inventory.getMaterials()[mat] >= BUILD_COST;
      const preview = this.building.computePreview(
        this.getEyePosition(),
        this.getLookDirection(),
        this.activeBuildType,
        mat,
        this.buildRotation,
        hasMats,
      );
      this.lastBuildPreview = preview;
      this.building.setPreviewVisible(true, preview);

      if (this.leftMouseDown) {
        this.tryPlaceBuild();
      }
    } else {
      this.building.setPreviewVisible(false);
      this.lastBuildPreview = null;
      if (this.isDrawingBow) {
        const activeItem = this.inventory.getActiveItem();
        const activeDef = activeItem ? WEAPONS[activeItem.weaponId] : null;
        if (
          !activeItem ||
          !activeDef ||
          (!activeDef.isBow && activeItem.weaponId !== 'boom_bow') ||
          activeItem.magAmmo <= 0
        ) {
          this.isDrawingBow = false;
          this.bowDrawElapsed = 0;
          this.bowCharge = 0;
        } else if (this.leftMouseDown) {
          const maxChargeSec = Math.max(0.1, activeDef.bowMaxChargeSec ?? 0.9);
          this.bowDrawElapsed += dt;
          this.bowCharge = clamp(this.bowDrawElapsed / maxChargeSec, 0, 1);
        } else {
          this.releaseBowShot();
        }
      } else if (this.isChargingRailgun) {
        const activeItem = this.inventory.getActiveItem();
        const activeDef = activeItem ? WEAPONS[activeItem.weaponId] : null;
        if (
          !activeItem ||
          !activeDef ||
          (!activeDef.isRailgun && activeItem.weaponId !== 'railgun') ||
          activeItem.magAmmo <= 0
        ) {
          this.isChargingRailgun = false;
          this.railgunChargeElapsed = 0;
          this.railgunCharge = 0;
        } else if (this.leftMouseDown) {
          const chargeTimeSec = Math.max(0.1, activeDef.chargeTimeSec ?? 0.85);
          this.railgunChargeElapsed += dt;
          this.railgunCharge = clamp(
            this.railgunChargeElapsed / chargeTimeSec,
            0,
            1,
          );
          if (this.railgunCharge >= 1 - 1e-6) {
            this.fireRailgunShot();
          }
        } else {
          this.releaseRailgunShot();
        }
      } else if (this.leftMouseDown) {
        this.tryUseActiveSlot(false);
      } else {
        this.isFiring = false;
      }
    }
  }

  private finishConsumableUse(): void {
    this.healTimer = 0;
    this.healDuration = 0;
    this.healLabel = null;

    const item = this.inventory.getActiveItem();
    if (!item) return;
    const def = WEAPONS[item.weaponId];
    if (!def.isConsumable) return;

    const cap = def.healCap ?? 100;
    if (item.weaponId === 'slurp_juice') {
      const instant = 25;
      if (this.health < cap) {
        const addHp = Math.min(cap - this.health, instant);
        this.health += addHp;
        const rem = instant - addHp;
        if (rem > 0) this.shield = Math.min(cap, this.shield + rem);
      } else {
        this.shield = Math.min(cap, this.shield + instant);
      }
      this.slurpHotRemaining = Math.min(75, this.slurpHotRemaining + 50);
    } else if (def.healTarget === 'hp') {
      this.health = Math.min(cap, this.health + (def.healAmount ?? 0));
    } else if (def.healTarget === 'shield') {
      this.shield = Math.min(cap, this.shield + (def.healAmount ?? 0));
    }

    this.inventory.consumeActiveItem();
    this.eventBus.emit('sound:play', { id: 'heal_finish' });
  }

  private updateCamera(dt: number): void {
    const lookDir = this.getLookDirection();
    const rightVec = {
      x: -Math.cos(this.yaw),
      y: 0,
      z: Math.sin(this.yaw),
    };

    let targetFov = this.settings.fov;
    let pivot: Vec3Like;
    let backDist = 3.45;
    let rightOffset = 0.72;
    let upOffset = 0.36;

    if (this.phase === 'bus') {
      pivot = {
        x: this.position.x,
        y: this.position.y + 3.0,
        z: this.position.z,
      };
      backDist = 17.5;
      rightOffset = 0;
      upOffset = 4.0;
      targetFov = this.settings.fov + 4;
    } else if (this.phase === 'skydiving' || this.phase === 'gliding') {
      pivot = {
        x: this.position.x,
        y: this.position.y + 1.1,
        z: this.position.z,
      };
      backDist = 5.4;
      rightOffset = 0;
      upOffset = 0.9;
      targetFov = this.phase === 'skydiving' ? this.settings.fov + 8 : this.settings.fov + 2;
    } else if (this.activeVehicleId !== null) {
      const veh = this.getActiveVehicleEntity();
      pivot = {
        x: this.position.x,
        y: this.position.y + 1.25,
        z: this.position.z,
      };
      backDist = 5.8;
      rightOffset = 0;
      upOffset = 1.05;
      targetFov = this.settings.fov + (veh?.isBoosting ? 12 : 6);
    } else if (this.isEmoting) {
      pivot = {
        x: this.position.x,
        y: this.position.y + 1.2,
        z: this.position.z,
      };
      backDist = 4.2;
      rightOffset = 0;
      upOffset = 0.4;
    } else {
      const eyeH =
        this.isCrouching || this.isSliding || this.isKnocked ? 1.05 : 1.52;
      pivot = {
        x: this.position.x,
        y: this.position.y + eyeH,
        z: this.position.z,
      };
      const hasRedDot = Boolean(this.inventory.getActiveItem()?.mods?.includes('red_dot'));
      if (this.isScoped) {
        backDist = 0.45;
        rightOffset = 0.15;
        upOffset = 0.08;
        targetFov = hasRedDot ? 20 : 24;
      } else if (this.isAiming) {
        backDist = hasRedDot ? 1.65 : 1.95;
        rightOffset = 0.62;
        upOffset = 0.28;
        targetFov = hasRedDot ? 44 : 56;
      }
    }

    if (Math.abs(this.currentFov - targetFov) > 0.05) {
      this.currentFov = damp(this.currentFov, targetFov, 14.0, dt);
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    const desiredPos: Vec3Like = {
      x: pivot.x - lookDir.x * backDist + rightVec.x * rightOffset,
      y: pivot.y - lookDir.y * backDist + upOffset,
      z: pivot.z - lookDir.z * backDist + rightVec.z * rightOffset,
    };

    let finalPos = desiredPos;
    if (this.phase === 'playing' || this.phase === 'victory' || this.phase === 'eliminated') {
      const toCam = {
        x: desiredPos.x - pivot.x,
        y: desiredPos.y - pivot.y,
        z: desiredPos.z - pivot.z,
      };
      const dist = Math.hypot(toCam.x, toCam.y, toCam.z);
      if (dist > 0.2) {
        const hit = this.collision.raycastWorld(
          pivot,
          { x: toCam.x / dist, y: toCam.y / dist, z: toCam.z / dist },
          dist,
          { checkBuilds: true, checkProps: false },
        );
        if (hit.hit && hit.distance < dist) {
          const safeDist = Math.max(0.45, hit.distance - 0.22);
          const frac = safeDist / dist;
          finalPos = {
            x: pivot.x + toCam.x * frac,
            y: pivot.y + toCam.y * frac,
            z: pivot.z + toCam.z * frac,
          };
        }
      }
      const minCamY = this.terrain.getHeightAt(finalPos.x, finalPos.z) + 0.35;
      if (finalPos.y < minCamY) finalPos.y = minCamY;
    }

    if (this.cameraShakeTimer > 0 && this.cameraShakeDuration > 0) {
      const decay = clamp(this.cameraShakeTimer / this.cameraShakeDuration, 0, 1);
      const amp = this.cameraShakeIntensity * decay * 0.22;
      finalPos = {
        x: finalPos.x + (Math.random() - 0.5) * 2 * amp,
        y: finalPos.y + (Math.random() - 0.5) * 2 * amp,
        z: finalPos.z + (Math.random() - 0.5) * 2 * amp,
      };
      if (this.phase === 'playing' || this.phase === 'victory' || this.phase === 'eliminated') {
        const minCamY = this.terrain.getHeightAt(finalPos.x, finalPos.z) + 0.35;
        if (finalPos.y < minCamY) finalPos.y = minCamY;
      }
    }

    this.camera.position.set(finalPos.x, finalPos.y, finalPos.z);
    this.camera.lookAt(
      finalPos.x + lookDir.x * 40,
      finalPos.y + lookDir.y * 40,
      finalPos.z + lookDir.z * 40,
    );
  }

  getThrowableArc(): Vec3Like[] | null {
    if (
      this.phase !== 'playing' ||
      this.isBuildMode ||
      this.building.getEditState().active ||
      this.activeVehicleId !== null
    ) {
      return null;
    }
    const item = this.inventory.getActiveItem();
    if (!item || item.stackCount <= 0) return null;
    const def = WEAPONS[item.weaponId];
    if (!def || !def.isThrowable || def.projectileSpeed <= 0) return null;

    const origin = this.getEyePosition();
    const look = this.getLookDirection();
    const lookLen = Math.hypot(look.x, look.y, look.z) || 1;
    const aimDir = {
      x: look.x / lookLen,
      y: look.y / lookLen,
      z: look.z / lookLen,
    };
    let shotDir = aimDir;
    if (Math.abs(aimDir.y) < 0.72) {
      const sx = aimDir.x;
      const sy = aimDir.y + 0.15;
      const sz = aimDir.z;
      const sLen = Math.hypot(sx, sy, sz) || 1;
      shotDir = { x: sx / sLen, y: sy / sLen, z: sz / sLen };
    }

    let pos: Vec3Like = {
      x: origin.x + shotDir.x * 0.45,
      y: origin.y + shotDir.y * 0.45,
      z: origin.z + shotDir.z * 0.45,
    };
    const vx = shotDir.x * def.projectileSpeed;
    let vy = shotDir.y * def.projectileSpeed;
    const vz = shotDir.z * def.projectileSpeed;

    const points: Vec3Like[] = [{ ...pos }];
    const dtStep = 0.05;
    const maxSteps = 50;
    const props = this.propsBridge.getProps();

    for (let i = 0; i < maxSteps; i++) {
      vy -= def.projectileGravity * dtStep;
      const dx = vx * dtStep;
      const dy = vy * dtStep;
      const dz = vz * dtStep;
      const stepLen = Math.hypot(dx, dy, dz);
      if (stepLen <= 1e-6) break;

      const hit = this.collision.raycastWorld(
        pos,
        { x: dx / stepLen, y: dy / stepLen, z: dz / stepLen },
        stepLen,
        { checkBuilds: true, checkProps: true, props },
      );
      if (hit.hit) {
        points.push({ ...hit.point });
        break;
      }

      pos = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
      const terrainY = this.terrain.getHeightAt(pos.x, pos.z);
      if (pos.y <= terrainY) {
        points.push({ x: pos.x, y: terrainY, z: pos.z });
        break;
      }
      points.push({ ...pos });
    }

    return points;
  }

  getCharacterRenderState(): CharacterRenderState {
    const activeItem = this.inventory.getActiveItem();
    const weaponId: WeaponId = activeItem ? activeItem.weaponId : 'pickaxe';

    let animState: AnimState = 'idle';
    if (this.isKnocked) {
      animState = 'knocked';
    } else if (this.isRevivingPartner || this.isRebootingPartner) {
      animState = 'reviving';
    } else if (this.phase === 'skydiving') {
      animState = 'skydive';
    } else if (this.phase === 'gliding') {
      animState = 'glide';
    } else if (this.activeVehicleId !== null) {
      animState = 'drive';
    } else if (this.isEmoting) {
      animState = 'emote';
    } else if (this.isMantling) {
      animState = 'mantle';
    } else if (this.activeGrindRail !== null) {
      animState = 'grind';
    } else if (this.activeZipline !== null) {
      animState = 'zipline';
    } else if (this.harvestSwingTimer > 0) {
      animState = 'harvest';
    } else if (this.healTimer > 0) {
      animState = 'heal';
    } else if (this.reloadTimer > 0) {
      animState = 'reload';
    } else if (this.isBuildMode) {
      animState = 'build';
    } else if (this.isSliding) {
      animState = 'slide';
    } else if (this.isSwimming) {
      animState = 'swim';
    } else if (!this.grounded) {
      animState = this.velocity.y > 0.8 ? 'jump' : 'fall';
    } else if (this.isCrouching) {
      animState = this.moveSpeed > 0.4 ? 'crouch_walk' : 'crouch_idle';
    } else if (this.isSprinting && this.moveSpeed > 5.0) {
      animState = 'sprint';
    } else if (this.moveSpeed > 4.2) {
      animState = 'run';
    } else if (this.moveSpeed > 0.4) {
      animState = 'walk';
    }

    return {
      position: { ...this.position },
      yaw: this.characterYaw,
      pitch: this.pitch,
      animState,
      weaponId,
      isAiming: this.isAiming,
      isFiring: this.isFiring,
      isBuilding: this.isBuildMode,
      emoteId: this.isEmoting ? this.activeEmote : null,
      moveSpeed: this.moveSpeed,
      grounded: this.grounded,
      health: this.health,
      shield: this.shield,
      recoilKick: this.recoilKick,
      harvestSwingTimer: this.harvestSwingTimer,
      isSliding: this.isSliding,
      isZiplining: this.activeZipline !== null,
      isSwimming: this.isSwimming,
      velocityY: this.velocity.y,
      leanAngle: this.leanAngle,
      hasVictoryCrown: this.victoryCrown,
      medallionCount: this.medallions.length,
      isKnocked: this.isKnocked,
      isReviving: this.isRevivingPartner || this.isRebootingPartner,
      bowCharge: this.isDrawingBow ? clamp(this.bowCharge, 0, 1) : 0,
      isGrinding: this.activeGrindRail !== null,
      weaponCharge: this.isChargingRailgun ? clamp(this.railgunCharge, 0, 1) : 0,
      weaponHeat: weaponId === 'minigun' ? clamp(this.minigunHeat, 0, 1) : 0,
      weaponMods: activeItem?.mods ? [...activeItem.mods] : [],
      isStealthed: this.isStealthed,
      teamId: this.gameMode === 'team_rumble' ? 'team_blue' : undefined,
      hasJetpack: this.inventory.findSlotByWeapon('jetpack') !== -1,
      isJetpackThrusting: this.isJetpackThrusting,
      hasLowGravityBuff: this.lowGravityTimer > 0,
      isBurning: this.weapons.isActorBurning('player'),
    };
  }

  getHudSnapshot(): PlayerHudSnapshot {
    const activeItem = this.inventory.getActiveItem();
    const weaponId: WeaponId = activeItem ? activeItem.weaponId : 'pickaxe';
    const look = this.getLookDirection();
    const compassHeading =
      ((Math.atan2(look.x, -look.z) * 180) / Math.PI + 360) % 360;

    const groundY = this.terrain.getHeightAt(this.position.x, this.position.z);
    const altitude = this.position.y - groundY;

    const lowHealthPulse =
      this.phase === 'playing' && this.isAlive() && this.health <= 35
        ? clamp((35 - this.health) / 25, 0.25, 1.0) *
          (0.65 + 0.35 * Math.sin(this.elapsedTime * 7.0))
        : 0;
    const activeVeh = this.getActiveVehicleEntity();
    const vehicleSnap: PlayerVehicleSnapshot | null =
      activeVeh && !activeVeh.destroyed && activeVeh.hp > 0
        ? {
            kind: activeVeh.kind,
            speedKmh: Math.round(Math.hypot(activeVeh.vx, activeVeh.vz) * 3.6),
            hp: Math.ceil(activeVeh.hp),
            maxHp: activeVeh.maxHp,
            boostCharge: activeVeh.boostCharge,
            isBoosting: activeVeh.isBoosting,
          }
        : null;

    const showSpeedLines =
      this.phase === 'skydiving' ||
      this.isSliding ||
      this.activeZipline !== null ||
      this.activeGrindRail !== null ||
      this.moveSpeed > 11.5 ||
      Boolean(vehicleSnap?.isBoosting);

    const maxHammerCharges = WEAPONS.shockwave_hammer.hammerMaxCharges ?? 4;
    const hammerRegenSec = WEAPONS.shockwave_hammer.hammerChargeRegenSec ?? 12;

    const playerTeamId = this.gameMode === 'team_rumble' ? 'team_blue' : undefined;
    const playerSquadId =
      this.gameMode === 'duos'
        ? 'player_squad'
        : this.gameMode === 'team_rumble'
          ? 'team_blue'
          : undefined;
    const turrets = this.building.getTurrets();
    let maxPlayerTurretSec = 0;
    const deployedTurrets: Array<{ x: number; z: number; isFriendly: boolean }> = [];
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      if (!t.alive || t.hp <= 0 || t.remainingSec <= 0) continue;
      if (t.ownerId === 'player' && t.remainingSec > maxPlayerTurretSec) {
        maxPlayerTurretSec = t.remainingSec;
      }
      const isFriendly =
        t.ownerId === 'player' ||
        Boolean(
          playerSquadId &&
            (t.squadId === playerSquadId || t.teamId === playerSquadId),
        ) ||
        Boolean(
          playerTeamId && (t.teamId === playerTeamId || t.squadId === playerTeamId),
        );
      deployedTurrets.push({
        x: t.x,
        z: t.z,
        isFriendly,
      });
    }

    return {
      phase: this.phase,
      health: Math.ceil(this.health),
      maxHealth: this.maxHealth,
      shield: Math.ceil(this.shield),
      maxShield: this.maxShield,
      stamina: this.stamina,
      isSprinting: this.isSprinting,
      isCrouching: this.isCrouching,
      isAiming: this.isAiming,
      isScoped: this.isScoped,
      isBuildMode: this.isBuildMode,
      activeBuildType: this.activeBuildType,
      activeMaterial: this.activeMaterial,
      buildRotation: this.buildRotation,
      editMode: this.building.getEditState(),
      activeWeaponSpread: this.computeCurrentSpread(weaponId),
      interactPrompt: this.interactPrompt,
      reloadProgress:
        this.reloadTimer > 0 && this.reloadDuration > 0
          ? clamp(1 - this.reloadTimer / this.reloadDuration, 0, 1)
          : null,
      healProgress:
        this.healTimer > 0 && this.healDuration > 0
          ? clamp(1 - this.healTimer / this.healDuration, 0, 1)
          : null,
      healLabel: this.healLabel,
      kills: this.kills,
      playerPos: { ...this.position },
      playerYaw: this.yaw,
      compassHeading,
      pointerLocked: this.pointerLocked,
      canDeployGlider:
        this.phase === 'skydiving' ||
        (this.phase === 'gliding' && altitude > GLIDER_FORCE_HEIGHT) ||
        (this.phase === 'playing' &&
          !this.grounded &&
          !this.isSwimming &&
          !this.isMantling &&
          this.activeVehicleId === null &&
          this.activeZipline === null &&
          (this.inventory.findSlotByWeapon('jetpack') === -1 || this.jetpackFuel <= 0) &&
          this.augmentManager.hasAugment('aerialist') &&
          Math.min(
            altitude,
            this.position.y -
              this.collision.getFloorHeightAt(
                this.position.x,
                this.position.z,
                this.position.y + 0.5,
                0.2,
              ),
          ) > 6.0),
      canJumpBus: this.phase === 'bus',
      hitmarker: this.hitmarker,
      damageDirection: this.damageDirection,
      activeWeaponId: weaponId,
      isSliding: this.isSliding,
      isZiplining: this.activeZipline !== null,
      isSwimming: this.isSwimming,
      canRepairBuild: this.canRepairBuild,
      killStreak: this.killStreak,
      siphonFlashAt: this.siphonFlashAt,
      lowHealthPulse,
      showSpeedLines,
      leanAngle: this.leanAngle,
      vehicle: vehicleSnap,
      activeVaultKeys: this.vaultKeys,
      grapplerCharges: activeItem?.weaponId === 'grappler' ? activeItem.magAmmo : null,
      gameMode: this.gameMode,
      overshield: Math.ceil(this.overshield),
      maxOvershield: this.maxOvershield,
      nearCampfireHealing: this.nearCampfireHealing,
      activeAugments: this.augmentManager.getActiveAugments(),
      pendingAugmentChoices: this.augmentManager.getPendingChoices(),
      captureStatus: this.captureStatus ? { ...this.captureStatus } : null,
      tacticalPing: this.tacticalPing
        ? {
            x: this.tacticalPing.x,
            y: this.tacticalPing.y,
            z: this.tacticalPing.z,
            label: this.tacticalPing.label,
            kind: this.tacticalPing.kind,
            distance: Math.round(dist3D(this.position, this.tacticalPing)),
          }
        : null,
      goldBars: this.goldBars,
      kineticDashCharges:
        activeItem?.weaponId === 'kinetic_blade' ? this.kineticDashCharges : null,
      medallions: [...this.medallions],
      hasVictoryCrown: this.victoryCrown,
      bowCharge: this.isDrawingBow ? clamp(this.bowCharge, 0, 1) : null,
      isKnocked: this.isKnocked,
      bleedOutHp: this.isKnocked ? Math.max(0, this.bleedOutHp) : 0,
      reviveProgress: this.isRevivingPartner
        ? clamp(this.reviveTimer / REVIVE_DURATION_SEC, 0, 1)
        : this.isKnocked
          ? this.incomingReviveProgress
          : null,
      reviveLabel: this.isRevivingPartner
        ? this.reviveLabel
        : this.isKnocked
          ? this.incomingReviveLabel
          : null,
      isGrinding: this.activeGrindRail !== null,
      railgunCharge: this.isChargingRailgun ? clamp(this.railgunCharge, 0, 1) : null,
      minigunHeat:
        weaponId === 'minigun' &&
        (this.minigunHeat > 0 || this.minigunOverheated || this.minigunSpinTimer > 0)
          ? clamp(this.minigunHeat, 0, 1)
          : null,
      minigunOverheated: this.minigunOverheated,
      activeTrapKind: this.activeTrapKind,
      traps: { ...this.traps },
      hasPartnerRebootCard: Boolean(this.duoRebootBridge?.hasPartnerRebootCard()),
      rebootProgress: this.isRebootingPartner
        ? clamp(this.rebootTimer / REBOOT_DURATION_SEC, 0, 1)
        : null,
      isStealthed: this.isStealthed,
      hasStormForecast: this.hasStormForecast,
      activeWeaponMods: activeItem?.mods ? [...activeItem.mods] : [],
      jetpackFuel:
        this.inventory.findSlotByWeapon('jetpack') !== -1 ? this.jetpackFuel : null,
      isJetpackThrusting: this.isJetpackThrusting,
      lowGravityRemainingSec:
        this.lowGravityTimer > 0 ? this.lowGravityTimer : null,
      trainHackProgress:
        this.isHackingTrainChest && this.trainHackProgress !== null
          ? clamp(this.trainHackProgress, 0, 1)
          : null,
      hammerCharges:
        activeItem?.weaponId === 'shockwave_hammer'
          ? {
              charges: this.hammerCharges,
              maxCharges: maxHammerCharges,
              regenProgress:
                this.hammerCharges >= maxHammerCharges
                  ? 0
                  : clamp(this.hammerRechargeTimer / hammerRegenSec, 0, 1),
            }
          : null,
      flareScanMarkedCount: this.flareScanMarkedCount,
      flareBeacons: this.flareBeacons.map((b) => ({
        x: b.x,
        z: b.z,
        radius: b.radius,
        remainingSec: b.remainingSec,
      })),
      activeTurretRemainingSec:
        maxPlayerTurretSec > 0 ? maxPlayerTurretSec : null,
      thermalVisionRemainingSec:
        this.thermalVisionTimer > 0 ? this.thermalVisionTimer : null,
      fishingProgress:
        this.isFishing && this.fishingProgress !== null
          ? clamp(this.fishingProgress, 0, 1)
          : null,
      deployedTurrets,
    };
  }
}

export { GRID_XZ, GRID_Y };
