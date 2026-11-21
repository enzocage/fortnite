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
  GameModeId,
  GamePhase,
  GameSettings,
  ItemInstance,
  KeybindMap,
  MaterialType,
  Rarity,
  RiftEntity,
  SoundEventId,
  TerrainQuery,
  Vec3Like,
  WeaponId,
  ZiplineEntity,
} from '../types';
import {
  BUILD_COST,
  DEFAULT_KEYBINDS,
  EventBus,
  GLIDER_FORCE_HEIGHT,
  GRID_XZ,
  GRID_Y,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  RARITY_ORDER,
  UPGRADE_COSTS,
  WATER_LEVEL,
  WEAPONS,
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
  CombatActor,
  PlayerHudSnapshot,
  PlayerInteractPrompt,
  PlayerMatchStats,
  PlayerVehicleSnapshot,
  PropsInteractionBridge,
  VaultBridge,
  VehicleBridge,
  WorldRiftCaptureBridge,
  WorldStationBridge,
  WorldTraversalBridge,
} from './GameplayTypes';
import { InventorySystem } from './InventorySystem';
import type { WeaponSystem } from './WeaponSystem';

const BUILD_CYCLE: BuildPieceType[] = ['wall', 'floor', 'ramp', 'roof'];
const MAT_CYCLE: MaterialType[] = ['wood', 'brick', 'metal'];

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
  private augmentManager: AugmentManager;
  private onVaultUnlocked: ((lootPos: Vec3Like, poiId: string) => void) | null = null;
  private onWeaponUpgraded: ((item: ItemInstance, cost: number) => void) | null = null;
  private onCampfireLit: ((campfireId: string) => void) | null = null;
  private onPoiCaptured: ((poiName: string, lootPos?: Vec3Like) => void) | null = null;
  private eventBus: EventBus;
  private settings: GameSettings;

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
      augmentManager?: AugmentManager | null;
      gameMode?: GameModeId;
      onVaultUnlocked?: ((lootPos: Vec3Like, poiId: string) => void) | null;
      onWeaponUpgraded?: ((item: ItemInstance, cost: number) => void) | null;
      onCampfireLit?: ((campfireId: string) => void) | null;
      onPoiCaptured?: ((poiName: string, lootPos?: Vec3Like) => void) | null;
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
      if (
        ev.attackerId === 'player' &&
        ev.targetId !== 'player' &&
        ev.isElimination &&
        this.isAlive()
      ) {
        if (!this.eliminatedTargetIds.has(ev.targetId)) {
          this.eliminatedTargetIds.add(ev.targetId);
          this.pendingSiphonFromEvents += 1;
          this.grantEliminationSiphon();
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
      this.isSliding = false;
      this.isMantling = false;
      this.isSwimming = false;
      this.nearCampfireHealing = false;
      this.campfireHealVfxTimer = 0;
      this.overshieldRecharging = false;
      this.captureStatus = null;
      this.captureCelebrationTimer = 0;
      this.flagTickTimer = 0;
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
      this.isCrouching || this.isSliding
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
    return this.health > 0 && this.phase !== 'eliminated' && this.phase !== 'lobby';
  }

  getKills(): number {
    return this.kills;
  }

  getKillStreak(): number {
    return this.killStreak;
  }

  private grantEliminationSiphon(): void {
    this.killStreak += 1;
    const siphonTotal = this.augmentManager.hasAugment('siphon_master') ? 75 : 50;
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
      this.isCrouching || this.isSliding ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
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
      onDamage: (ev) => this.applyDamage(ev),
      onHeal: (hpAdded, shieldAdded) => {
        if (!this.isAlive()) return;
        if (hpAdded > 0) {
          this.health = Math.min(this.maxHealth, this.health + hpAdded);
        }
        if (shieldAdded > 0) {
          this.shield = Math.min(this.maxShield, this.shield + shieldAdded);
        }
      },
      onImpulse: (impulse, grantFallImmunity) =>
        this.applyExternalImpulse(impulse, grantFallImmunity),
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
    this.stats = {
      damageDealt: 0,
      shotsFired: 0,
      shotsHit: 0,
      headshots: 0,
      structuresBuilt: 0,
      chestsOpened: 0,
      poisCaptured: 0,
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
    if (this.phase !== 'playing') return;
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
    if (this.phase !== 'playing') return;
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
    if (this.phase !== 'playing' || this.gameMode === 'zero_build') return false;
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
    if (this.phase !== 'playing' && this.phase !== 'victory' && this.phase !== 'lobby') {
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
      this.health = Math.max(0, this.health - stormDmg);
      if (this.health <= 0) {
        this.handleEliminated();
      }
      return;
    }

    this.lastDamageTime = this.elapsedTime;
    this.overshieldRecharging = false;

    const totalDmg =
      ev.damage > 0
        ? ev.damage
        : Math.max(0, ev.shieldDamage) + Math.max(0, ev.hpDamage);

    if (this.overshield > 0) {
      const osDmg = Math.min(this.overshield, totalDmg);
      this.overshield = Math.max(0, this.overshield - osDmg);
      const rem = totalDmg - osDmg;
      if (rem > 0) {
        if (ev.attackerId === 'environment' || ev.attackerId === 'lava') {
          const sDmg = Math.min(this.shield, Math.max(0, ev.shieldDamage));
          const hDmg = Math.min(this.health, Math.max(0, rem - sDmg));
          this.shield = Math.max(0, this.shield - sDmg);
          this.health = Math.max(0, this.health - hDmg);
        } else {
          const sDmg = Math.min(this.shield, rem);
          const hDmg = Math.min(this.health, rem - sDmg);
          this.shield = Math.max(0, this.shield - sDmg);
          this.health = Math.max(0, this.health - hDmg);
        }
      }
    } else {
      let sDmg = ev.shieldDamage;
      let hDmg = ev.hpDamage;
      if (
        (sDmg === 0 && hDmg === 0 && ev.damage > 0) ||
        (ev.attackerId !== 'environment' &&
          ev.attackerId !== 'lava' &&
          this.shield > 0 &&
          sDmg === 0 &&
          ev.damage > 0)
      ) {
        sDmg = Math.min(this.shield, ev.damage);
        hDmg = Math.min(this.health, ev.damage - sDmg);
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
      this.handleEliminated();
    }
  }

  applyStormDamage(amount: number): void {
    if (!this.isAlive() || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.handleEliminated();
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
    this.activeZipline = null;
    this.killStreak = 0;
    this.building.setPreviewVisible(false);
    this.building.cancelEdit();
    this.clearHeldInputs();

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
  }

  setMouseButton(button: 0 | 1 | 2, down: boolean): void {
    if (button === 0) {
      if (down) {
        this.handlePrimaryButtonDown();
      } else {
        this.leftMouseDown = false;
        this.isFiring = false;
        this.lastDraggedEditTile = -1;
      }
    } else if (button === 1) {
      if (down && this.phase === 'playing') {
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
    if (this.phase === 'playing') {
      if (this.building.getEditState().active) {
        this.building.resetEditTiles();
      } else if (this.isBuildMode) {
        this.cycleBuildMaterial();
      }
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.leftMouseDown = false;
      this.isFiring = false;
      this.lastDraggedEditTile = -1;
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

  private handleCrouchSlideKey(): void {
    if (this.isSliding) {
      this.isSliding = false;
      this.slideTimer = 0;
      this.isCrouching = true;
      return;
    }
    const sprintingNow =
      this.isSprinting ||
      ((this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight')) &&
        (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) &&
        !this.isAiming &&
        this.stamina > 1.5);
    if (sprintingNow && this.startSlide()) {
      return;
    }
    this.isCrouching = !this.isCrouching;
    if (this.isCrouching) this.isSprinting = false;
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

    if (this.phase !== 'playing') return;

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
      case 'KeyT':
      case 'F4':
        this.selectBuildPiece('roof');
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
        if (this.activeZipline) {
          this.detachZipline(true);
          break;
        }
        if (this.isSliding && (this.grounded || this.velocity.y > -3.5)) {
          this.isSliding = false;
          this.slideTimer = 0;
          this.isCrouching = false;
          const burstSpeed = Math.max(this.slideSpeed * 1.08, 12.5);
          this.velocity.x = this.slideDir.x * burstSpeed;
          this.velocity.z = this.slideDir.z * burstSpeed;
          this.velocity.y = 9.0;
          this.grounded = false;
          this.wasAirborne = true;
          this.fallPeakY = this.position.y;
          this.eventBus.emit('sound:play', { id: 'jump', position: this.position, spatial: true });
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
          const jumpScale =
            isSprintingNow && this.augmentManager.hasAugment('parkour_boost')
              ? 1.35
              : 1.0;
          this.velocity.y = 8.4 * jumpScale;
          this.grounded = false;
          this.wasAirborne = true;
          this.fallPeakY = this.position.y;
          this.eventBus.emit('sound:play', { id: 'jump', position: this.position, spatial: true });
        } else if (
          !this.isSwimming &&
          !this.isMantling &&
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

  private startReload(): void {
    if (this.reloadTimer > 0) return;
    const slot = this.inventory.getActiveSlotIndex();
    const item = this.inventory.getActiveItem();
    if (!item) return;
    const def = WEAPONS[item.weaponId];
    if (!def.ammoType || def.magSize <= 0) return;
    if (item.magAmmo >= def.magSize) return;
    if (this.inventory.getAmmo(def.ammoType) <= 0) return;

    const reloadScale = this.augmentManager.hasAugment('light_fingers') ? 0.7 : 1.0;
    const reloadDur = def.reloadTime * reloadScale;

    this.healTimer = 0;
    this.healLabel = null;
    this.reloadSlotIndex = slot;
    this.reloadDuration = reloadDur;
    this.reloadTimer = reloadDur;
    this.eventBus.emit('sound:play', { id: 'reload' });
  }

  private tryUseActiveSlot(isInitialPress: boolean): void {
    const item = this.inventory.getActiveItem();
    if (!item) return;
    const def = WEAPONS[item.weaponId];

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

    // Semi-auto / magazine check for guns (skip throwables which use stackCount)
    if (def.magSize > 0 && item.magAmmo <= 0) {
      if (isInitialPress) {
        this.eventBus.emit('sound:play', { id: 'dryfire' });
      }
      if (!def.isGrappler) {
        this.startReload();
      }
      return;
    }
    if (def.isThrowable && item.stackCount <= 0) {
      return;
    }

    // Cancel active reload/heal on firing
    this.reloadTimer = 0;
    this.healTimer = 0;
    this.healLabel = null;

    const spreadRad = this.computeCurrentSpread(item.weaponId);
    const eye = this.getEyePosition();
    const aimDir = this.computeCrosshairParallaxAimDir(eye);

    if (item.weaponId === 'pickaxe') {
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
      hasDemolisher: this.augmentManager.hasAugment('demolisher'),
      hasFirstAssault: this.augmentManager.hasAugment('first_assault'),
      onAmmoConsumed: () => {
        if (def.magSize > 0 && item.magAmmo > 0) {
          item.magAmmo -= 1;
        } else if (def.isThrowable && item.stackCount > 0) {
          this.inventory.consumeActiveItem();
        }
      },
      onHarvest: (matType, amount) => {
        this.inventory.addMaterial(matType, amount);
      },
    });

    if (res.fired) {
      this.fireCooldown = 1 / def.fireRate;
      if (item.weaponId !== 'pickaxe' && !def.isGrappler && !def.isThrowable) {
        this.stats.shotsFired += 1;
        if (res.shotsHit > 0) this.stats.shotsHit += 1;
        this.stats.headshots += res.headshots;
        this.stats.damageDealt += res.damageDealt;
      }

      this.bloom = Math.min(def.bloomMax, this.bloom + def.bloomPerShot);
      this.pitch = clamp(this.pitch + def.recoilPitch, -1.28, 1.32);
      this.yaw += (Math.random() - 0.5) * 2 * def.recoilYaw;
      this.recoilKick = 1.0;

      if (def.magSize > 0 && item.magAmmo <= 0 && !def.isGrappler) {
        this.startReload();
      }
    }
  }

  private computeCrosshairParallaxAimDir(fireOrigin: Vec3Like): Vec3Like {
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

    const hit = this.collision.raycastWorld(camPos, camDir, 240, {
      checkBuilds: true,
      checkProps: true,
      props: this.propsBridge.getProps(),
    });

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
    let spread = this.isAiming ? def.adsSpread : def.baseSpread;
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
    if (!def || def.isConsumable || def.isThrowable || def.isGrappler) {
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
      magSize: def.magSize,
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
      | 'chest'
      | 'llama'
      | 'supply_drop'
      | 'loot_drop'
      | 'vault'
      | 'vehicle'
      | 'rift'
      | 'upgrade_bench'
      | 'campfire';
    id: string;
    prompt: PlayerInteractPrompt;
  } | null {
    const interactKey = this.formatKeyLabel(this.getResolvedKeybinds().interact);
    let bestDist = Infinity;
    let best: {
      kind:
        | 'chest'
        | 'llama'
        | 'supply_drop'
        | 'loot_drop'
        | 'vault'
        | 'vehicle'
        | 'rift'
        | 'upgrade_bench'
        | 'campfire';
      id: string;
      prompt: PlayerInteractPrompt;
    } | null = null;

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
              label: veh.kind === 'cyber_bike' ? 'Drive Cyber Bike' : 'Drive Hover ATV',
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

    if (best === null && this.stationBridge) {
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

    return best;
  }

  private tryInteract(): void {
    if (this.phase !== 'playing') return;

    if (this.activeVehicleId !== null) {
      this.exitActiveVehicle(true);
      return;
    }

    if (this.activeZipline) {
      this.detachZipline(true);
      return;
    }

    const candidate = this.findNearestInteractable();
    if (candidate) {
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
    }

    // Fallback: Attach to nearby overhead Energy Zipline
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

  private updateAutoPickupAndPrompt(): void {
    if (this.phase !== 'playing') {
      this.interactPrompt = null;
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

    // Find nearest interact prompt
    const interactKey = this.formatKeyLabel(this.getResolvedKeybinds().interact);
    if (this.activeVehicleId !== null) {
      this.interactPrompt = { label: 'Exit Vehicle', key: interactKey, rarity: 'rare' };
      this.canRepairBuild = false;
      return;
    }

    if (this.activeZipline) {
      this.interactPrompt = { label: 'Drop Zipline', key: 'SPACE', rarity: 'rare' };
      return;
    }

    const candidate = this.findNearestInteractable();
    let prompt: PlayerInteractPrompt | null = candidate ? candidate.prompt : null;

    if (!prompt && this.ziplineCooldown <= 0 && this.findNearestZipline()) {
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
    if (this.launchPadCooldown > 0) {
      this.launchPadCooldown = Math.max(0, this.launchPadCooldown - safeDt);
    }
    if (this.vehicleCooldown > 0) this.vehicleCooldown = Math.max(0, this.vehicleCooldown - safeDt);
    if (this.riftCooldown > 0) this.riftCooldown = Math.max(0, this.riftCooldown - safeDt);
    if (this.lavaCooldown > 0) this.lavaCooldown = Math.max(0, this.lavaCooldown - safeDt);
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
      }
      if (this.activeVehicleId !== null) {
        this.updateVehicleDriving(safeDt);
      } else if (this.isMantling) {
        this.updateMantle(safeDt);
      } else if (this.activeZipline) {
        this.updateZiplineRide(safeDt);
      } else {
        this.updateGroundMovement(safeDt);
      }
      if (this.checkAutoSkyRifts()) {
        this.updateCamera(safeDt);
        return;
      }
      this.checkVolcanicLavaHazard();
      this.updateCapturePoints(safeDt);
      this.updateCombatAndTimers(safeDt);
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
      !this.isSliding &&
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
        this.stamina = Math.min(100, this.stamina + 24 * dt);
      }
    }

    const activeItem = this.inventory.getActiveItem();
    const activeDef = activeItem ? WEAPONS[activeItem.weaponId] : WEAPONS.pickaxe;
    this.isAiming =
      this.rightMouseDown &&
      !this.isBuildMode &&
      !this.building.getEditState().active &&
      !activeDef.isConsumable &&
      activeItem?.weaponId !== 'pickaxe';
    this.isScoped = this.isAiming && activeItem?.weaponId === 'sniper';

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
      if (this.isCrouching) targetSpeed = 3.6;
      else if (this.isSprinting) targetSpeed = 9.6;
      else if (this.isAiming || this.healTimer > 0) targetSpeed = 3.8;
      if (inWater) targetSpeed *= 0.68;

      const targetVx = wishX * targetSpeed;
      const targetVz = wishZ * targetSpeed;
      const accel = this.grounded ? 16.0 : this.fallImmune ? 1.2 : 5.5;
      this.velocity.x = damp(this.velocity.x, targetVx, accel, dt);
      this.velocity.z = damp(this.velocity.z, targetVz, accel, dt);
    }

    const gravScale =
      !this.grounded && this.augmentManager.hasAugment('parkour_boost')
        ? 0.84
        : 1.0;

    if (inWater) {
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
      this.isCrouching || this.isSliding ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;

    const res = this.collision.resolveCharacterMovement(
      this.position,
      this.velocity,
      PLAYER_RADIUS,
      charHeight,
      dt,
    );

    this.position = res.position;
    this.velocity = res.velocity;

    const onStructure =
      res.grounded &&
      (res.groundMaterial === 'wood' ||
        res.groundMaterial === 'brick' ||
        res.groundMaterial === 'metal');
    this.isSwimming = inWater && !onStructure;
    this.grounded = res.grounded || this.isSwimming;

    // Keep inside island playable bounds
    this.position.x = clamp(this.position.x, -390, 390);
    this.position.z = clamp(this.position.z, -390, 390);

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
        if (!this.fallImmune && fallDistance > 13 && this.isAlive()) {
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
    if (this.launchPadCooldown <= 0 && this.traversalBridge) {
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
    if (this.grounded && this.moveSpeed > 1.3 && !this.isCrouching && !this.isSliding) {
      this.footstepTimer -= dt * (this.isSprinting ? 1.45 : 1.0);
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.36;
        const footId = this.resolveFootstepSound(res.groundMaterial);
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

  private updateCombatAndTimers(dt: number): void {
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
          this.inventory.reloadSlot(this.reloadSlotIndex);
        }
        this.reloadSlotIndex = -1;
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
      if (this.leftMouseDown) {
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
      const eyeH = this.isCrouching || this.isSliding ? 1.05 : 1.52;
      pivot = {
        x: this.position.x,
        y: this.position.y + eyeH,
        z: this.position.z,
      };
      if (this.isScoped) {
        backDist = 0.45;
        rightOffset = 0.15;
        upOffset = 0.08;
        targetFov = 24;
      } else if (this.isAiming) {
        backDist = 1.95;
        rightOffset = 0.62;
        upOffset = 0.28;
        targetFov = 56;
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
    if (this.phase === 'skydiving') {
      animState = 'skydive';
    } else if (this.phase === 'gliding') {
      animState = 'glide';
    } else if (this.activeVehicleId !== null) {
      animState = 'drive';
    } else if (this.isEmoting) {
      animState = 'emote';
    } else if (this.isMantling) {
      animState = 'mantle';
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
      this.moveSpeed > 11.5 ||
      Boolean(vehicleSnap?.isBoosting);

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
    };
  }
}

export { GRID_XZ, GRID_Y };
