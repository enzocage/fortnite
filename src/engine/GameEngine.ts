import * as THREE from 'three';
import {
  BUS_HEIGHT,
  DEFAULT_KEYBINDS,
  EMOTES,
  EventBus,
  GLIDERS,
  PICKAXES,
  POIS,
  SKINS,
  WEAPONS,
  WORLD_SIZE,
  clamp,
  dist2D,
  dist3D,
  lerp,
} from '../core';
import type {
  AmmoType,
  AugmentId,
  BuildPieceType,
  CharacterRenderState,
  DamageEvent,
  EmoteId,
  GameModeId,
  GamePhase,
  GameSettings,
  GraphicsQuality,
  HUDState,
  KillFeedEntry,
  LobbyConfig,
  MaterialType,
  MatchSummary,
  MinimapBlip,
  Vec3Like,
  VehicleKind,
  VisualSoundCue,
  WeaponId,
  WeatherKind,
} from '../types';
import {
  EnvironmentDetail,
  EnvironmentFX,
  PropsAndLoot,
  StormSystem,
  TerrainSystem,
  VehicleSystem,
  WorldBuilder,
  WorldInteractables,
  type WorldBuildResult,
} from '../world';
import {
  CharacterAnimator,
  CharacterRig,
  VFXManager,
} from '../character';
import {
  AugmentManager,
  BuildingSystem,
  CollisionSystem,
  PlayerController,
  QuestTracker,
  WeaponSystem,
  type CombatActor,
} from '../gameplay';
import {
  BotManager,
  type BotEntity,
  type BotRenderState,
  type BotWorldContext,
} from '../ai';
import { AudioEngine } from '../audio';
import { loadCareerStats, recordMatchCareerStats, UIManager } from '../ui';

interface ActiveBotVisual {
  id: string;
  rig: CharacterRig;
  skinId: string;
  pickaxeId: string;
  gliderId: string;
}

export interface FortdropDebugAPI {
  getState(): Record<string, unknown>;
  forceStartMatch(): void;
  jumpFromBus(): boolean;
  teleportPlayer(x: number, y: number, z: number): void;
  giveLoadout(): void;
  enterBuildMode(piece?: BuildPieceType): void;
  placeBuild(): boolean;
  enterEditMode(): boolean;
  toggleEditTile(idx: number): boolean;
  confirmEdit(): boolean;
  triggerEmote(id?: EmoteId): void;
  toggleMap(force?: boolean): boolean;
  setWaypoint(x: number, z: number): void;
  spawnNearbyBot(distance?: number): boolean;
  triggerVictory(): void;
  getStats(): MatchSummary | null;
  teleportToPOI(poiId: string): boolean;
  getWorldStats(): Record<string, unknown>;
  spawnLlamaNearby(distance?: number): boolean;
  triggerShockwave(): boolean;
  giveMythicLoadout(): void;
  spawnVehicleNearby(kind?: VehicleKind, distance?: number): boolean;
  setWeather(kind?: WeatherKind): WeatherKind;
  giveWave2Loadout(): void;
  forceAugmentOffer(): [AugmentId, AugmentId] | null;
}

declare global {
  interface Window {
    __GAME__?: FortdropDebugAPI;
  }
}

export class GameEngine {
  private readonly canvasContainer: HTMLElement;
  private readonly uiRoot: HTMLElement;
  private readonly eventBus = new EventBus();

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private fog: THREE.Fog;
  private shadowMapSize = 2048;

  private terrain: TerrainSystem;
  private worldBuilder: WorldBuilder;
  private worldBuildResult: WorldBuildResult;
  private worldInteractables: WorldInteractables;
  private vehicleSystem: VehicleSystem;
  private environmentDetail: EnvironmentDetail;
  private currentDetailQuality: GraphicsQuality = 'high';
  private environmentFX: EnvironmentFX;
  private propsAndLoot: PropsAndLoot;
  private stormSystem: StormSystem;

  private collision: CollisionSystem;
  private buildingSystem: BuildingSystem;
  private weaponSystem: WeaponSystem;
  private vfxManager: VFXManager;
  private audioEngine: AudioEngine;
  private uiManager: UIManager;
  private playerController: PlayerController;
  private botManager: BotManager;
  private questTracker: QuestTracker;
  private augmentManager: AugmentManager;

  private playerRig: CharacterRig;
  private characterAnimator = new CharacterAnimator();
  private botVisuals = new Map<string, ActiveBotVisual>();

  private lobbyPedestal: THREE.Group;
  private lobbyPos: Vec3Like;
  private lobbyCharacterYaw = 0.25;
  private lobbyDragging = false;
  private lobbyDragLastX = 0;
  private lobbyEmoteTimer = 0;
  private lobbyActiveEmote: EmoteId | null = null;
  private lobbyMusicStarted = false;

  private waypointBeam: THREE.Group;
  private waypointRing: THREE.Mesh;
  private mapWaypoint: { x: number; z: number } | null = null;

  private lobbyConfig: LobbyConfig;
  private settings: GameSettings;
  private gameMode: GameModeId = 'solo';
  private phase: GamePhase = 'lobby';
  private paused = false;
  private matchSeed = 4201;
  private matchElapsed = 0;
  private survivalTimeSec = 0;
  private totalPlayers = 26;
  private stormTickAccum = 0;
  private nextSupplyDropTime = 45;
  private playerGliderFactor = 0;
  private victoryTimer = 0;
  private victoryPendingSummary = false;
  private matchSummaryShown = false;
  private lastMatchSummary: MatchSummary | null = null;
  private lastPlayerDamageEvent: DamageEvent | null = null;
  private lastPlayerDamageAt = 0;
  private lastStormDamageAt = 0;
  private activeEmoteMusic: EmoteId | null = null;
  private discoveredPois = new Set<string>();
  private intenseCombatMusicActive = false;
  private lightningFlash = 0;
  private spectateBotIndex = 0;
  private spectatorSummaryOpen = false;
  private prevChestsOpened = 0;
  private prevVehicleDistPos: Vec3Like | null = null;
  private vehicleDistAccum = 0;
  private recentVisualNoises: Array<{
    id: string;
    x: number;
    z: number;
    time: number;
    kind: 'footstep' | 'gunfire';
  }> = [];

  private busStart: Vec3Like = { x: -340, y: BUS_HEIGHT, z: -200 };
  private busEnd: Vec3Like = { x: 340, y: BUS_HEIGHT, z: 200 };
  private busPos: Vec3Like = { x: -340, y: BUS_HEIGHT, z: -200 };
  private busYaw = 0;
  private busDuration = 22;
  private busProgress = 0;

  private audioBlips: MinimapBlip[] = [];
  private blipSeq = 1;
  private killFeedSeq = 1;

  private rafId: number | null = null;
  private lastFrameTime = 0;
  private totalElapsed = 0;
  private fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private disposed = false;

  private projVec = new THREE.Vector3();
  private unsubscribers: Array<() => void> = [];

  private onResizeBound = () => this.handleResize();
  private onKeyDownBound = (e: KeyboardEvent) => this.handleGlobalKeyDown(e);
  private onFirstGestureBound = () => this.handleFirstGesture();
  private onLobbyPointerDownBound = (e: PointerEvent) => this.handleLobbyPointerDown(e);
  private onLobbyPointerMoveBound = (e: PointerEvent) => this.handleLobbyPointerMove(e);
  private onLobbyPointerUpBound = () => {
    this.lobbyDragging = false;
  };

  constructor(canvasContainer: HTMLElement, uiRoot: HTMLElement) {
    this.canvasContainer = canvasContainer;
    this.uiRoot = uiRoot;

    // 1. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.canvasContainer.appendChild(this.renderer.domElement);

    // 2. Scene, Camera, Lighting, Fog
    this.scene = new THREE.Scene();
    this.fog = new THREE.Fog(0x96d7ff, 220, 740);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      80,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.15,
      1900,
    );

    this.hemiLight = new THREE.HemisphereLight(0xa5e4ff, 0x5c8a47, 1.18);
    this.scene.add(this.hemiLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.58);
    fillLight.position.set(-90, 75, 130);
    this.scene.add(fillLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5dc, 1.6);
    this.sunLight.position.set(110, 145, -130);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 380;
    this.sunLight.shadow.camera.left = -90;
    this.sunLight.shadow.camera.right = 90;
    this.sunLight.shadow.camera.top = 90;
    this.sunLight.shadow.camera.bottom = -90;
    this.sunLight.shadow.bias = -0.00045;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 3. Register Damage Number 3D -> 2D Screen Projection BEFORE UIManager subscribes
    this.unsubscribers.push(
      this.eventBus.on('ui:damage_number', (ev) => {
        this.projectDamageNumberToScreen(ev);
      }),
    );

    // 4. World, Environment, Props, Storm
    this.terrain = new TerrainSystem(4201);
    this.worldBuilder = new WorldBuilder();
    this.worldBuildResult = this.worldBuilder.build(this.terrain, 'high');
    this.terrain.setBuildingFootprints(this.worldBuildResult.buildingFootprints);

    this.scene.add(this.terrain.getMesh());
    this.scene.add(this.worldBuildResult.group);

    this.environmentFX = new EnvironmentFX(4201, this.eventBus);
    this.scene.add(this.environmentFX.getGroup());

    this.worldInteractables = new WorldInteractables(this.terrain, this.eventBus);
    this.scene.add(this.worldInteractables.getGroup());

    this.vehicleSystem = new VehicleSystem(this.terrain, this.eventBus, 4201);
    this.vehicleSystem.setStaticColliders([
      ...this.worldBuildResult.colliders,
      ...this.worldInteractables.getVaultColliders(),
      ...this.worldInteractables.getUpgradeBenchColliders(),
    ]);
    this.scene.add(this.vehicleSystem.getGroup());

    this.propsAndLoot = new PropsAndLoot(this.terrain, this.eventBus, 4201);
    this.propsAndLoot.populate(
      this.worldBuildResult.chestSpots,
      this.worldBuildResult.floorLootSpots,
      this.worldBuildResult.colliders,
    );
    this.scene.add(this.propsAndLoot.getGroup());

    this.stormSystem = new StormSystem(4201);
    this.scene.add(this.stormSystem.getMesh());

    // 5. Waypoint Beam + Lobby Pedestal
    const { group: wpGroup, ring: wpRing } = this.createWaypointBeam();
    this.waypointBeam = wpGroup;
    this.waypointRing = wpRing;
    this.waypointBeam.visible = false;
    this.scene.add(this.waypointBeam);

    this.lobbyPos = this.findLobbyPedestalSpot();
    this.lobbyPedestal = this.createLobbyPedestal();
    this.lobbyPedestal.position.set(this.lobbyPos.x, this.lobbyPos.y, this.lobbyPos.z);
    this.scene.add(this.lobbyPedestal);

    // 6. UI Manager (loads persisted config & settings)
    this.questTracker = new QuestTracker(this.eventBus);
    this.augmentManager = new AugmentManager(this.eventBus);
    this.uiManager = new UIManager(this.uiRoot, this.eventBus, {
      onStartMatch: (cfg) => this.startMatch(cfg),
      onCosmeticChange: (cosmetics) => this.applyCosmetics(cosmetics),
      onSettingsChange: (s) => this.applySettings(s),
      onEmoteSelect: (emoteId) => this.triggerInGameEmote(emoteId),
      onWaypointChange: (wp) => this.setWaypoint(wp),
      onResume: () => this.setPaused(false),
      onPlayAgain: () => this.startMatch(this.uiManager.getLobbyConfig()),
      onReturnLobby: () => this.enterLobby(),
      onEditTileToggle: (idx) => this.buildingSystem.toggleEditTile(idx),
      onEditConfirm: () => this.buildingSystem.confirmEdit(),
      onEditReset: () => this.buildingSystem.resetEditTiles(),
      onPreviewEmote: (emoteId) => this.previewLobbyEmote(emoteId),
      onSpectateNext: () => this.cycleSpectateTarget(1),
      onSpectateMatchSummary: () => this.toggleSpectatorSummary(),
      onAugmentSelect: (idx) => this.playerController.selectAugmentChoice(idx),
    });
    this.uiManager.setTerrainMapCanvas(this.terrain.getMapTextureCanvas());
    this.uiManager.setWorldTraversal(
      this.worldInteractables.getLaunchPads(),
      this.worldInteractables.getZiplines(),
    );
    this.uiManager.setWorldVehicles(this.vehicleSystem.getVehicles());
    this.uiManager.setWorldVaults(this.worldInteractables.getVaults());
    this.uiManager.setWorldStations(
      this.worldInteractables.getUpgradeBenches(),
      this.worldInteractables.getCampfires(),
    );
    this.uiManager.setWorldRiftsAndFlags(
      this.worldInteractables.getRifts(),
      this.worldInteractables.getCapturePoints(),
    );

    this.lobbyConfig = this.uiManager.getLobbyConfig();
    this.gameMode = this.lobbyConfig.gameMode ?? 'solo';
    this.settings = this.uiManager.getSettings();

    this.currentDetailQuality = this.settings.graphicsQuality;
    this.environmentDetail = new EnvironmentDetail(
      this.terrain,
      this.worldBuildResult.colliders,
      this.currentDetailQuality,
      4201,
    );
    this.scene.add(this.environmentDetail.getGroup());

    // 7. Audio Engine
    this.audioEngine = new AudioEngine(this.eventBus, this.settings);

    // 8. Collision, Building, Weapons, Player, VFX
    this.collision = new CollisionSystem(this.terrain);
    this.collision.setStaticColliders(this.worldBuildResult.colliders);
    this.collision.setPropColliders([
      ...this.propsAndLoot.getActivePropColliders(),
      ...this.propsAndLoot.getActiveLlamaColliders(),
      ...this.worldInteractables.getVaultColliders(),
      ...this.worldInteractables.getUpgradeBenchColliders(),
      ...this.worldInteractables.getSlurpBarrelColliders(),
      ...this.worldInteractables.getExplosiveBarrelColliders(),
      ...this.vehicleSystem.getActiveVehicleColliders(),
    ]);

    this.buildingSystem = new BuildingSystem(this.scene, this.terrain, this.eventBus);
    this.collision.setBuildPiecesProvider(() => this.buildingSystem.getPieces());

    this.weaponSystem = new WeaponSystem(
      this.collision,
      this.buildingSystem,
      this.propsAndLoot,
      this.eventBus,
    );
    this.weaponSystem.setVehicleBridge(this.vehicleSystem);
    this.weaponSystem.setStationBridge(this.worldInteractables);
    this.weaponSystem.setRiftCaptureBridge(this.worldInteractables);
    this.weaponSystem.setOnSlurpBarrelBroken((actorId) => {
      if (actorId === 'player') {
        this.questTracker.record('slurp_break', 1);
      }
    });
    this.vfxManager = new VFXManager(this.scene, this.eventBus);

    this.playerController = new PlayerController(
      this.camera,
      this.terrain,
      this.collision,
      this.buildingSystem,
      this.weaponSystem,
      this.propsAndLoot,
      this.eventBus,
      this.settings,
    );
    this.playerController.attachInputListeners(this.renderer.domElement);
    this.playerController.setTraversalBridge(this.worldInteractables);
    this.playerController.setVehicleBridge(this.vehicleSystem);
    this.playerController.setVaultBridge(this.worldInteractables);
    this.playerController.setStationBridge(this.worldInteractables);
    this.playerController.setRiftCaptureBridge(this.worldInteractables);
    this.playerController.setAugmentManager(this.augmentManager);
    this.playerController.setOnWeaponUpgraded(() => {
      this.questTracker.record('weapon_upgrade', 1);
    });
    this.playerController.setOnCampfireLit(() => {
      this.questTracker.record('campfire_ignite', 1);
    });
    this.playerController.setOnPoiCaptured((poiName, lootPos) => {
      this.handlePoiCaptured(poiName, lootPos);
    });
    this.playerController.setVaultUnlockHandler((lootPos, _poiId) =>
      this.spawnVaultLootBurst(lootPos),
    );

    // 9. Player Character Rig
    this.playerRig = this.createCharacterRigFromConfig(this.lobbyConfig);
    this.playerRig.setWeaponWrap(this.lobbyConfig.weaponWrapId ?? 'factory_matte');
    this.playerRig.setContrail(this.lobbyConfig.contrailId ?? 'wind_stream');
    this.scene.add(this.playerRig.getGroup());

    // 10. AI Bot Manager
    this.botManager = new BotManager(
      this.createBotWorldContext(),
      this.lobbyConfig.difficulty,
      9001,
    );
    this.botManager.setOnBossEliminatedByPlayer((rec) => {
      this.playerController.addVaultKey(1);
      this.eventBus.emit('ui:banner', {
        id: `vault_key_${Date.now()}`,
        title: 'VAULT KEY ACQUIRED!',
        subtitle: `OPEN ${rec.bossName.toUpperCase()}'S BOSS VAULT`,
        tone: 'victory',
        durationMs: 3800,
      });
    });

    // Register all combat actors (Player + Alive Bots)
    this.weaponSystem.registerActorsProvider(() => this.gatherCombatActors());

    // 11. EventBus Match Events & Quality Settings
    this.bindMatchEvents();
    this.applySettings(this.settings);
    this.bindDOMEvents();
    this.exposeDebugAPI();

    // 12. Start in Lobby (or jump directly to a POI in headless/URL QA mode)
    this.enterLobby();
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      const qaPoi = search.get('qaPoi');
      if (qaPoi && POIS.some((p) => p.id === qaPoi)) {
        const qaModeParam = search.get('qaMode');
        const qaMode: GameModeId | undefined =
          qaModeParam === 'zero_build' || qaModeParam === 'blitz' || qaModeParam === 'solo'
            ? qaModeParam
            : undefined;
        const qaWrap = search.get('qaWrap') ?? undefined;
        if (search.get('qaVisualAudio') === '1') {
          this.settings = { ...this.settings, visualAudio: true };
          this.uiManager.setSettings(this.settings);
          this.playerController.setSettings(this.settings);
        }
        const qaCfg: LobbyConfig = {
          ...this.uiManager.getLobbyConfig(),
          ...(qaMode ? { gameMode: qaMode } : {}),
          ...(qaWrap ? { weaponWrapId: qaWrap } : {}),
        };
        this.startMatch(qaCfg, true);
        this.discoveredPois.add(qaPoi);
        window.__GAME__?.teleportToPOI(qaPoi);
        if (qaPoi === 'skyline_spire' || search.has('qaWave2')) {
          window.__GAME__?.giveWave2Loadout();
        } else if (search.has('qaMythic')) {
          window.__GAME__?.giveMythicLoadout();
        } else {
          window.__GAME__?.giveLoadout();
        }
        if (search.has('qaLlama')) {
          window.__GAME__?.spawnLlamaNearby(7);
        }
        if (search.has('qaVehicle')) {
          window.__GAME__?.spawnVehicleNearby('hover_atv', 7);
        }
        if (search.get('qaVisualAudio') === '1') {
          window.__GAME__?.spawnNearbyBot(18);
          this.recentVisualNoises.push(
            {
              id: 'qa_footstep_right',
              x: this.playerController.getPosition().x + 8,
              z: this.playerController.getPosition().z + 3,
              time: this.matchElapsed,
              kind: 'footstep',
            },
            {
              id: 'qa_gunfire_left',
              x: this.playerController.getPosition().x - 14,
              z: this.playerController.getPosition().z - 6,
              time: this.matchElapsed,
              kind: 'gunfire',
            },
          );
        }
        if (search.get('qaCapture') === '1') {
          const cps = this.worldInteractables.getCapturePoints();
          const cp = cps.find((c) => c.poiId === qaPoi) ?? cps[0];
          if (cp) {
            const cx = cp.x + 1.5;
            const cz = cp.z + 1.5;
            const cy = this.terrain.getHeightAt(cx, cz) + 0.3;
            this.playerController.teleport({ x: cx, y: cy, z: cz });
          }
        } else if (search.get('qaRift') === '1') {
          const rifts = this.worldInteractables.getRifts();
          const r = rifts.find((rf) => rf.poiId === qaPoi && rf.active) ?? rifts.find((rf) => rf.active);
          if (r) {
            const rx = r.x + 3.1;
            const rz = r.z + 3.1;
            const ry = this.terrain.getHeightAt(rx, rz) + 0.3;
            this.playerController.teleport({ x: rx, y: ry, z: rz });
          }
        }
        if (search.get('qaAugment') === '1') {
          this.augmentManager.forceOffer();
        }
        if (search.get('qaPing') === '1') {
          const p = this.playerController.getPosition();
          const yaw = this.playerController.getYaw();
          const px = p.x + Math.sin(yaw) * 18;
          const pz = p.z + Math.cos(yaw) * 18;
          const py = this.terrain.getHeightAt(px, pz) + 0.2;
          this.playerController.placeTacticalPing({ x: px, y: py, z: pz });
        }
        const qaWeather = search.get('qaWeather') as WeatherKind | null;
        if (qaWeather) {
          this.environmentFX.setWeather(qaWeather);
        }
        this.pushHUDState(false);
      }
    }
    this.startLoop();
  }

  private createCharacterRigFromConfig(cfg: LobbyConfig): CharacterRig {
    const skin = SKINS.find((s) => s.id === cfg.skinId) ?? SKINS[0];
    const pickaxe = PICKAXES.find((p) => p.id === cfg.pickaxeId) ?? PICKAXES[0];
    const glider = GLIDERS.find((g) => g.id === cfg.gliderId) ?? GLIDERS[0];
    return new CharacterRig(skin, pickaxe, glider);
  }

  private findLobbyPedestalSpot(): Vec3Like {
    let x = -14;
    let z = 222;
    if (this.terrain.isWater(x, z)) {
      x = -18;
      z = 148;
    }
    const y = this.terrain.getHeightAt(x, z) + 0.42;
    return { x, y, z };
  }

  private createLobbyPedestal(): THREE.Group {
    const grp = new THREE.Group();
    grp.name = 'LobbyPedestal';

    const baseGeo = new THREE.CylinderGeometry(1.78, 2.22, 1.4, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.45,
      metalness: 0.55,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.7;
    base.receiveShadow = true;
    grp.add(base);

    const ringGeo = new THREE.TorusGeometry(1.72, 0.05, 10, 40);
    ringGeo.rotateX(Math.PI * 0.5);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.02;
    grp.add(ring);

    const discGeo = new THREE.CylinderGeometry(1.58, 1.58, 0.04, 32);
    const discMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      emissive: '#0284c7',
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.01;
    disc.receiveShadow = true;
    grp.add(disc);

    return grp;
  }

  private createWaypointBeam(): { group: THREE.Group; ring: THREE.Mesh } {
    const group = new THREE.Group();
    group.name = 'WaypointBeam';

    const beamGeo = new THREE.CylinderGeometry(0.32, 0.55, 240, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 120;
    group.add(beam);

    const ringGeo = new THREE.RingGeometry(1.2, 1.65, 24);
    ringGeo.rotateX(-Math.PI * 0.5);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#67e8f9',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.25;
    group.add(ring);

    return { group, ring };
  }

  private createBotWorldContext(): BotWorldContext {
    const self = this;
    return {
      terrain: this.terrain,
      get storm() {
        return self.stormSystem.getState();
      },
      getChests: () => this.propsAndLoot.getChests(),
      openChest: (chestId: string) => this.propsAndLoot.openChest(chestId),
      getLootDrops: () => this.propsAndLoot.getLootDrops(),
      pickupLootDrop: (dropId: string) => this.propsAndLoot.removeLootDrop(dropId),
      getProps: () => this.propsAndLoot.getProps(),
      damageProp: (propId: string, amount: number, hitPoint: Vec3Like) =>
        this.propsAndLoot.damageProp(propId, amount, hitPoint, true),
      resolveMovement: (pos, vel, radius, height, dt) =>
        this.collision.resolveCharacterMovement(pos, vel, radius, height, dt),
      hasLineOfSight: (from, to) => {
        const d = dist3D(from, to);
        if (d <= 0.15) return true;
        const dir = {
          x: (to.x - from.x) / d,
          y: (to.y - from.y) / d,
          z: (to.z - from.z) / d,
        };
        const hit = this.collision.raycastWorld(from, dir, d - 0.15, {
          checkBuilds: true,
          checkProps: true,
          props: this.propsAndLoot.getProps(),
        });
        return !hit.hit;
      },
      placeBuildPiece: (ownerId, type, material, gx, gy, gz, dir, rotation) =>
        this.buildingSystem.placePieceForEntity(
          ownerId,
          type,
          material,
          gx,
          gy,
          gz,
          dir,
          rotation,
        ),
      fireWeapon: (bot, item, origin, aimDir, spreadRad) => {
        const visual = this.botVisuals.get(bot.id);
        let muzzlePos = origin;
        if (visual && visual.rig.getGroup().visible) {
          const mv = visual.rig.getMuzzleWorldPosition();
          if (Number.isFinite(mv.x) && Number.isFinite(mv.y) && Number.isFinite(mv.z)) {
            muzzlePos = { x: mv.x, y: mv.y, z: mv.z };
          }
        }
        return this.weaponSystem.fireWeapon({
          actor: this.botToCombatActor(bot),
          item,
          origin,
          aimDir,
          muzzlePos,
          spreadRad,
          isPlayer: false,
          onAmmoConsumed: () => {
            if (item.magAmmo > 0) item.magAmmo -= 1;
          },
        });
      },
      getCombatTargets: () => {
        const targets = [];
        const pPhase = this.playerController.getPhase();
        if (
          this.playerController.isAlive() &&
          pPhase !== 'lobby' &&
          pPhase !== 'bus'
        ) {
          const pActor = this.playerController.getCombatActor();
          targets.push({
            id: pActor.id,
            name: pActor.name,
            position: pActor.position,
            eyePos: pActor.eyePos,
            hp: pActor.hp,
            shield: pActor.shield,
            alive: pActor.alive,
            isPlayer: true,
            radius: pActor.radius,
            height: pActor.height,
          });
        }
        for (const bot of this.botManager.getAliveBots()) {
          if (bot.state === 'bus') continue;
          targets.push({
            id: bot.id,
            name: bot.name,
            position: { ...bot.position },
            eyePos: {
              x: bot.position.x,
              y: bot.position.y + (bot.isCrouching ? 1.05 : 1.55),
              z: bot.position.z,
            },
            hp: bot.hp,
            shield: bot.shield,
            alive: bot.alive,
            isPlayer: false,
            radius: bot.radius,
            height: bot.height,
          });
        }
        return targets;
      },
      dropBotLoot: (bot) => this.dropBotLoot(bot),
      getLaunchPads: () => this.worldInteractables.getLaunchPads(),
      getBuildPieces: () => this.buildingSystem.getPieces(),
      getActiveShieldBubbles: () => this.weaponSystem.getActiveShieldBubbles(),
      getVehicles: () => this.vehicleSystem.getVehicles(),
      getSlurpBarrels: () => this.worldInteractables.getSlurpBarrels(),
      damageSlurpBarrel: (id, dmg) => this.worldInteractables.damageSlurpBarrel(id, dmg),
      getCampfires: () => this.worldInteractables.getCampfires(),
      igniteCampfire: (id) => this.worldInteractables.igniteCampfire(id),
      getRifts: () => this.worldInteractables.getRifts(),
      triggerRift: (id) => this.worldInteractables.triggerRift(id),
      getCapturePoints: () => this.worldInteractables.getCapturePoints(),
      advanceCapturePoint: (id, actorId, actorName, dt) =>
        this.worldInteractables.advanceCapturePoint(id, actorId, actorName, dt),
      getExplosiveBarrels: () => this.worldInteractables.getExplosiveBarrels(),
      damageExplosiveBarrel: (id, dmg) =>
        this.worldInteractables.damageExplosiveBarrel(id, dmg),
      eventBus: this.eventBus,
    };
  }

  private botToCombatActor(bot: BotEntity): CombatActor {
    return {
      id: bot.id,
      name: bot.name,
      position: { ...bot.position },
      eyePos: {
        x: bot.position.x,
        y: bot.position.y + (bot.isCrouching ? 1.05 : 1.55),
        z: bot.position.z,
      },
      hp: bot.hp,
      shield: bot.shield,
      maxHp: bot.maxHp,
      maxShield: bot.maxShield,
      velocity: { ...bot.velocity },
      radius: bot.radius,
      height: bot.height,
      alive: bot.alive,
      onDamage: (ev) => {
        this.botManager.onBotDamaged(bot.id, ev, this.matchElapsed);
      },
      onHeal: (hpAdded, shieldAdded) => {
        bot.hp = Math.min(bot.maxHp, bot.hp + hpAdded);
        bot.shield = Math.min(bot.maxShield, bot.shield + shieldAdded);
      },
      onImpulse: (imp) => {
        bot.velocity.x += imp.x;
        bot.velocity.y += imp.y;
        bot.velocity.z += imp.z;
        bot.grounded = false;
      },
    };
  }

  private gatherCombatActors(): CombatActor[] {
    const list: CombatActor[] = [];
    const pPhase = this.playerController.getPhase();
    if (
      this.playerController.isAlive() &&
      pPhase !== 'lobby' &&
      pPhase !== 'bus'
    ) {
      list.push(this.playerController.getCombatActor());
    }
    for (const bot of this.botManager.getAliveBots()) {
      if (bot.state === 'bus') continue;
      list.push(this.botToCombatActor(bot));
    }
    return list;
  }

  private dropBotLoot(bot: BotEntity): void {
    const items = bot.inventory.items.filter(
      (it, idx) => idx > 0 && it !== null,
    );
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const ang = (i / Math.max(1, items.length)) * Math.PI * 2;
      this.propsAndLoot.spawnLootDrop(
        { x: bot.position.x, y: bot.position.y + 0.8, z: bot.position.z },
        { item: { ...it } },
        { x: Math.cos(ang) * 2.4, y: 4.3, z: Math.sin(ang) * 2.4 },
      );
    }

    (Object.keys(bot.inventory.ammo) as AmmoType[]).forEach((ammoType) => {
      const amt = bot.inventory.ammo[ammoType];
      if (amt > 0) {
        this.propsAndLoot.spawnLootDrop(
          { x: bot.position.x, y: bot.position.y + 0.8, z: bot.position.z },
          { ammo: { type: ammoType, amount: amt } },
          { x: (Math.random() - 0.5) * 3, y: 3.8, z: (Math.random() - 0.5) * 3 },
        );
      }
    });

    (Object.keys(bot.inventory.materials) as MaterialType[]).forEach((mat) => {
      const amt = bot.inventory.materials[mat];
      if (amt > 0) {
        this.propsAndLoot.spawnLootDrop(
          { x: bot.position.x, y: bot.position.y + 0.8, z: bot.position.z },
          { materials: { type: mat, amount: Math.min(150, amt) } },
          { x: (Math.random() - 0.5) * 3, y: 3.8, z: (Math.random() - 0.5) * 3 },
        );
      }
    });
  }

  private bindMatchEvents(): void {
    this.unsubscribers.push(
      this.eventBus.on('combat:damage', (ev) => {
        if (ev.targetId === 'player') {
          this.lastPlayerDamageEvent = ev;
          this.lastPlayerDamageAt = this.matchElapsed;
        }
        if (ev.attackerId === 'player' && ev.targetId !== 'player') {
          this.questTracker.record('damage_dealt', Math.round(ev.damage));
          if (ev.isElimination) {
            this.questTracker.record('elimination', 1);
            this.playerController.addKill();
            const victim = this.botManager.getBotById(ev.targetId);
            this.eventBus.emit('ui:banner', {
              id: `elim_${Date.now()}`,
              title: `ELIMINATED ${victim?.name ?? 'OPPONENT'}`,
              subtitle: ev.isHeadshot
                ? `HEADSHOT • ${Math.round(ev.distance)}m`
                : `${WEAPONS[ev.weaponId].shortName} • ${Math.round(ev.distance)}m`,
              tone: 'elim',
              durationMs: 2600,
            });
          }
        } else if (
          ev.attackerId !== 'player' &&
          ev.isElimination &&
          ev.targetId !== 'player'
        ) {
          const killerBot = this.botManager.getBotById(ev.attackerId);
          if (killerBot) {
            killerBot.damageDealt += ev.damage;
          }
        }
      }),
      this.eventBus.on('audio:noise', (payload) => {
        if (payload.sourceId !== 'player' && (payload.kind === 'gunfire' || payload.kind === 'footstep')) {
          this.recentVisualNoises.push({
            id: `vn_${this.blipSeq++}`,
            x: payload.position.x,
            z: payload.position.z,
            time: this.matchElapsed,
            kind: payload.kind,
          });
          if (this.recentVisualNoises.length > 36) {
            this.recentVisualNoises.shift();
          }
        }
        if (payload.kind === 'gunfire' && payload.sourceId !== 'player') {
          this.audioBlips.push({
            id: `blip_${this.blipSeq++}`,
            x: payload.position.x,
            z: payload.position.z,
            kind: 'gunfire',
            age: 0,
            maxAge: 2.2,
          });
          if (this.audioBlips.length > 32) {
            this.audioBlips.shift();
          }
        }
      }),
      this.eventBus.on('vfx:lightning_flash', (ev) => {
        this.lightningFlash = Math.max(this.lightningFlash, ev.intensity);
      }),
    );
  }

  private bindDOMEvents(): void {
    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('pointerdown', this.onFirstGestureBound, { passive: true });
    window.addEventListener('keydown', this.onFirstGestureBound, { passive: true });

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onLobbyPointerDownBound);
    window.addEventListener('pointermove', this.onLobbyPointerMoveBound);
    window.addEventListener('pointerup', this.onLobbyPointerUpBound);
  }

  private handleFirstGesture(): void {
    this.audioEngine.unlock();
    if (this.phase === 'lobby' && !this.lobbyMusicStarted) {
      this.lobbyMusicStarted = true;
      this.eventBus.emit('music:set', { track: 'lobby' });
    }
  }

  private handleLobbyPointerDown(e: PointerEvent): void {
    if (this.phase !== 'lobby') return;
    this.lobbyDragging = true;
    this.lobbyDragLastX = e.clientX;
  }

  private handleLobbyPointerMove(e: PointerEvent): void {
    if (this.phase !== 'lobby' || !this.lobbyDragging) return;
    const dx = e.clientX - this.lobbyDragLastX;
    this.lobbyDragLastX = e.clientX;
    this.lobbyCharacterYaw += dx * 0.012;
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private handleGlobalKeyDown(e: KeyboardEvent): void {
    if (this.phase === 'lobby' || this.phase === 'victory') {
      return;
    }
    if (e.repeat) return;

    if (this.phase === 'eliminated') {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.cycleSpectateTarget(1);
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        this.toggleSpectatorSummary();
        return;
      }
      return;
    }

    const kb = { ...DEFAULT_KEYBINDS, ...this.settings.keybinds };

    if (e.code === kb.map || e.code === 'KeyM') {
      e.preventDefault();
      const opened = this.uiManager.toggleFullMap();
      if (opened) this.releasePointerLock();
      return;
    }

    if (e.code === kb.emote || e.code === 'KeyB') {
      e.preventDefault();
      const opened = this.uiManager.toggleEmoteWheel();
      if (opened) this.releasePointerLock();
      return;
    }

    if (e.code === 'KeyP') {
      e.preventDefault();
      const nextPaused = this.uiManager.togglePauseMenu();
      this.setPaused(nextPaused);
      if (nextPaused) this.releasePointerLock();
      return;
    }

    if (e.code === 'Escape') {
      // Allow PlayerController to cancel active Edit or Build mode cleanly first
      const snap = this.playerController.getHudSnapshot();
      if (snap.editMode.active || snap.isBuildMode) {
        return;
      }
      if (this.uiManager.isOverlayOpen()) {
        this.uiManager.toggleFullMap(false);
        this.uiManager.toggleEmoteWheel(false);
        this.uiManager.togglePauseMenu(false);
        this.setPaused(false);
        return;
      }
      const nextPaused = this.uiManager.togglePauseMenu(true);
      this.setPaused(nextPaused);
      if (nextPaused) this.releasePointerLock();
    }
  }

  private releasePointerLock(): void {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore
      }
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.audioEngine.setPaused(paused);
    if (paused) {
      this.audioEngine.updateVehicleEngine(false, 0, false);
      this.audioEngine.updateWindRush(false, 0);
    }
  }

  private applyCosmetics(
    cosmetics: Pick<LobbyConfig, 'skinId' | 'pickaxeId' | 'gliderId' | 'selectedEmote'> & {
      weaponWrapId?: string;
      contrailId?: string;
    },
  ): void {
    this.lobbyConfig = { ...this.lobbyConfig, ...cosmetics };
    const skin = SKINS.find((s) => s.id === cosmetics.skinId) ?? SKINS[0];
    const pickaxe = PICKAXES.find((p) => p.id === cosmetics.pickaxeId) ?? PICKAXES[0];
    const glider = GLIDERS.find((g) => g.id === cosmetics.gliderId) ?? GLIDERS[0];

    this.playerRig.setSkin(skin);
    this.playerRig.setPickaxe(pickaxe);
    this.playerRig.setGlider(glider);
    this.playerRig.setWeaponWrap(this.lobbyConfig.weaponWrapId ?? 'factory_matte');
    this.playerRig.setContrail(this.lobbyConfig.contrailId ?? 'wind_stream');
    this.playerController.setSelectedEmote(cosmetics.selectedEmote);
  }

  private applySettings(next: GameSettings): void {
    this.settings = { ...next };
    this.playerController.setSettings(this.settings);
    this.audioEngine.updateSettings(this.settings);

    const baseDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    let maxDpr = 2;
    let nextShadowSize = 2048;
    if (this.settings.graphicsQuality === 'low') {
      maxDpr = 1;
      nextShadowSize = 1024;
    } else if (this.settings.graphicsQuality === 'medium') {
      maxDpr = 1.5;
      nextShadowSize = 2048;
    }
    this.renderer.setPixelRatio(Math.min(baseDpr, maxDpr));

    if (nextShadowSize !== this.shadowMapSize) {
      this.shadowMapSize = nextShadowSize;
      this.sunLight.shadow.mapSize.set(nextShadowSize, nextShadowSize);
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
    }

    if (this.environmentDetail && next.graphicsQuality !== this.currentDetailQuality) {
      this.currentDetailQuality = next.graphicsQuality;
      this.scene.remove(this.environmentDetail.getGroup());
      this.environmentDetail.dispose();
      this.environmentDetail = new EnvironmentDetail(
        this.terrain,
        this.worldBuildResult.colliders,
        this.currentDetailQuality,
        4201,
      );
      this.scene.add(this.environmentDetail.getGroup());
    }

    if (this.phase === 'lobby') {
      this.camera.fov = 52;
      this.camera.updateProjectionMatrix();
    }
  }

  private previewLobbyEmote(emoteId: EmoteId): void {
    if (this.phase !== 'lobby') return;
    this.lobbyActiveEmote = emoteId;
    this.lobbyEmoteTimer = 5.5;
    const emote = EMOTES.find((e) => e.id === emoteId);
    if (emote) {
      this.eventBus.emit('music:set', { track: emote.musicId });
    }
  }

  private triggerInGameEmote(emoteId: EmoteId): void {
    this.playerController.enterTestEmote(emoteId);
    const emote = EMOTES.find((e) => e.id === emoteId);
    if (emote) {
      this.activeEmoteMusic = emote.musicId ? emoteId : null;
      this.eventBus.emit('music:set', { track: emote.musicId });
    }
  }

  private setWaypoint(wp: { x: number; z: number } | null): void {
    this.mapWaypoint = wp;
    if (wp) {
      const y = this.terrain.getHeightAt(wp.x, wp.z);
      this.waypointBeam.position.set(wp.x, y, wp.z);
      this.waypointBeam.visible = true;
    } else {
      this.waypointBeam.visible = false;
    }
  }

  private projectDamageNumberToScreen(ev: {
    worldPos: Vec3Like;
    screenX?: number;
    screenY?: number;
    visible?: boolean;
  }): void {
    this.projVec.set(ev.worldPos.x, ev.worldPos.y + 0.15, ev.worldPos.z);
    this.projVec.project(this.camera);
    const visible = this.projVec.z >= -1 && this.projVec.z <= 1;
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 720;
    ev.screenX = (this.projVec.x * 0.5 + 0.5) * w;
    ev.screenY = (-this.projVec.y * 0.5 + 0.5) * h;
    ev.visible = visible;
  }

  public enterLobby(): void {
    this.releasePointerLock();
    this.paused = false;
    this.audioEngine.setPaused(false);
    this.audioEngine.updateVehicleEngine(false, 0, false);
    this.audioEngine.updateWindRush(false, 0);
    this.phase = 'lobby';
    this.victoryPendingSummary = false;
    this.matchSummaryShown = false;
    this.activeEmoteMusic = null;
    this.discoveredPois.clear();
    this.intenseCombatMusicActive = false;
    this.lightningFlash = 0;
    this.spectateBotIndex = 0;
    this.spectatorSummaryOpen = false;
    this.prevChestsOpened = 0;
    this.prevVehicleDistPos = null;
    this.vehicleDistAccum = 0;
    this.recentVisualNoises = [];
    this.setWaypoint(null);

    this.buildingSystem.clearAll();
    this.weaponSystem.clear();
    this.vfxManager.clear();
    this.clearBotVisuals();
    this.botManager.reset();
    this.audioBlips = [];

    this.lobbyPedestal.visible = true;
    this.playerRig.setVisible(true);
    this.playerRig.setGliderOpen(false, 0);
    this.playerRig.equipWeapon('pickaxe', false);

    // Scenic Battle Bus cruising far in the lobby sky backdrop
    this.environmentFX.setBusTransform({ x: 35, y: 125, z: -90 }, 0.72, true);
    this.stormSystem.reset(4201);
    this.stormSystem.getMesh().visible = false;

    this.playerController.setPhase('lobby');
    this.uiManager.setPhase('lobby');
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();

    if (this.lobbyMusicStarted) {
      this.eventBus.emit('music:set', { track: 'lobby' });
    }
  }

  public startMatch(config: LobbyConfig, skipStartBanner = false): void {
    this.lobbyConfig = { ...config };
    this.gameMode = config.gameMode ?? 'solo';
    this.applyCosmetics(config);
    this.paused = false;
    this.audioEngine.setPaused(false);
    this.audioEngine.updateVehicleEngine(false, 0, false);
    this.audioEngine.updateWindRush(false, 0);
    this.lobbyActiveEmote = null;
    this.lobbyEmoteTimer = 0;
    this.activeEmoteMusic = null;

    this.matchSeed = (this.matchSeed + 137) >>> 0;
    this.matchElapsed = 0;
    this.survivalTimeSec = 0;
    this.stormTickAccum = 0;
    this.nextSupplyDropTime = this.gameMode === 'blitz' ? 28 : 45;
    this.playerGliderFactor = 0;
    this.victoryTimer = 0;
    this.victoryPendingSummary = false;
    this.matchSummaryShown = false;
    this.lastMatchSummary = null;
    this.lastPlayerDamageEvent = null;
    this.lastPlayerDamageAt = 0;
    this.lastStormDamageAt = 0;
    this.audioBlips = [];
    this.discoveredPois.clear();
    this.intenseCombatMusicActive = false;
    this.lightningFlash = 0;
    this.spectateBotIndex = 0;
    this.spectatorSummaryOpen = false;
    this.prevChestsOpened = 0;
    this.prevVehicleDistPos = null;
    this.vehicleDistAccum = 0;
    this.recentVisualNoises = [];
    this.setWaypoint(null);

    // Reset world entities & quests
    this.buildingSystem.clearAll();
    this.weaponSystem.clear();
    this.vfxManager.clear();
    this.worldInteractables.reset();
    this.vehicleSystem.reset();
    this.questTracker.reset(this.matchSeed, this.gameMode);
    this.uiManager.setWorldVehicles(this.vehicleSystem.getVehicles());
    this.uiManager.setWorldVaults(this.worldInteractables.getVaults());
    this.uiManager.setWorldStations(
      this.worldInteractables.getUpgradeBenches(),
      this.worldInteractables.getCampfires(),
    );
    this.uiManager.setWorldRiftsAndFlags(
      this.worldInteractables.getRifts(),
      this.worldInteractables.getCapturePoints(),
    );
    this.propsAndLoot.reset(
      this.worldBuildResult.chestSpots,
      this.worldBuildResult.floorLootSpots,
      this.worldBuildResult.colliders,
    );
    this.collision.setPropColliders([
      ...this.propsAndLoot.getActivePropColliders(),
      ...this.propsAndLoot.getActiveLlamaColliders(),
      ...this.worldInteractables.getVaultColliders(),
      ...this.worldInteractables.getUpgradeBenchColliders(),
      ...this.worldInteractables.getSlurpBarrelColliders(),
      ...this.worldInteractables.getExplosiveBarrelColliders(),
      ...this.vehicleSystem.getActiveVehicleColliders(),
    ]);

    this.stormSystem.reset(this.matchSeed, this.gameMode);
    this.stormSystem.getMesh().visible = true;

    this.lobbyPedestal.visible = false;

    // Randomize Battle Bus trajectory crossing near central POIs
    const angle = ((this.matchSeed % 360) * Math.PI) / 180;
    const crossDist = 375;
    const lateralOffset = (((this.matchSeed * 31) % 100) / 100 - 0.5) * 80;
    const perpX = -Math.sin(angle) * lateralOffset;
    const perpZ = Math.cos(angle) * lateralOffset;
    this.busStart = {
      x: -Math.cos(angle) * crossDist + perpX,
      y: BUS_HEIGHT,
      z: -Math.sin(angle) * crossDist + perpZ,
    };
    this.busEnd = {
      x: Math.cos(angle) * crossDist + perpX,
      y: BUS_HEIGHT,
      z: Math.sin(angle) * crossDist + perpZ,
    };
    this.busPos = { ...this.busStart };
    this.busYaw = Math.atan2(
      this.busEnd.x - this.busStart.x,
      this.busEnd.z - this.busStart.z,
    );
    this.busDuration = this.gameMode === 'blitz' ? 14 : 22;
    this.busProgress = 0;
    this.environmentFX.setBusTransform(this.busPos, this.busYaw, true);

    // Spawn AI bots
    this.clearBotVisuals();
    this.botManager.setDifficulty(config.difficulty);
    this.botManager.setGameMode(this.gameMode);
    this.botManager.spawnBots(config.botCount, this.busDuration);
    this.createBotVisuals();
    this.totalPlayers = config.botCount + 1;

    // Reset player controller & augments
    this.playerController.resetForMatch(this.busStart, config.playerName, this.gameMode);
    this.augmentManager.reset(this.matchSeed, this.gameMode);
    this.playerController.setSelectedEmote(config.selectedEmote);
    this.phase = 'bus';
    this.uiManager.setPhase('bus');

    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();

    this.audioEngine.unlock();
    this.eventBus.emit('sound:play', { id: 'bus_horn' });
    this.eventBus.emit('music:set', { track: 'bus' });
    if (!skipStartBanner) {
      this.eventBus.emit('ui:banner', {
        id: 'bus_drop',
        title: 'BATTLE BUS DEPLOYED',
        subtitle: 'PICK A LANDING SPOT & PRESS [SPACE] TO DROP',
        tone: 'info',
        durationMs: 3600,
      });
    }
  }

  private createBotVisuals(): void {
    for (const bot of this.botManager.getBots()) {
      const skin = SKINS.find((s) => s.id === bot.skinId) ?? SKINS[0];
      const pickaxe = PICKAXES.find((p) => p.id === bot.pickaxeId) ?? PICKAXES[0];
      const glider = GLIDERS.find((g) => g.id === bot.gliderId) ?? GLIDERS[0];
      const rig = new CharacterRig(skin, pickaxe, glider);
      rig.setVisible(false);
      this.scene.add(rig.getGroup());
      this.botVisuals.set(bot.id, {
        id: bot.id,
        rig,
        skinId: bot.skinId,
        pickaxeId: bot.pickaxeId,
        gliderId: bot.gliderId,
      });
    }
  }

  private clearBotVisuals(): void {
    for (const entry of this.botVisuals.values()) {
      this.scene.remove(entry.rig.getGroup());
      entry.rig.dispose();
    }
    this.botVisuals.clear();
  }

  private startLoop(): void {
    this.lastFrameTime = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;
      this.step(rawDt);
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private step(rawDt: number): void {
    this.totalElapsed += rawDt;

    // FPS tracking
    this.fpsAccum += rawDt;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.4) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    if (this.phase === 'lobby') {
      this.stepLobby(rawDt);
      return;
    }

    if (this.paused) {
      this.environmentFX.update(rawDt * 0.2, this.totalElapsed);
      return;
    }

    // Slow-motion polish during Victory celebration!
    const dt =
      this.phase === 'victory' && this.victoryPendingSummary
        ? rawDt * 0.45
        : rawDt;

    this.matchElapsed += dt;
    if (
      this.phase === 'bus' ||
      this.phase === 'skydiving' ||
      this.phase === 'gliding' ||
      this.phase === 'playing'
    ) {
      this.survivalTimeSec += rawDt;
    }

    // 1. Update Battle Bus flight
    if (this.busProgress < 1) {
      this.busProgress = clamp(this.matchElapsed / this.busDuration, 0, 1);
      this.busPos = {
        x: lerp(this.busStart.x, this.busEnd.x, this.busProgress),
        y: BUS_HEIGHT,
        z: lerp(this.busStart.z, this.busEnd.z, this.busProgress),
      };
      this.environmentFX.setBusTransform(this.busPos, this.busYaw, true);

      if (this.playerController.getPhase() === 'bus' && this.busProgress >= 0.94) {
        this.playerController.jumpFromBus();
      }
    } else {
      this.environmentFX.setBusTransform(this.busPos, this.busYaw, false);
    }

    // 2. Animated World, Vehicles, Interactables, Flora Detail, Props/Loot, Supply Drops
    this.worldBuilder.update(dt, this.totalElapsed);
    this.worldInteractables.update(dt, this.totalElapsed);
    this.vehicleSystem.update(dt, this.totalElapsed);
    this.environmentDetail.update(dt, this.totalElapsed);
    this.propsAndLoot.update(dt, this.totalElapsed);
    this.collision.setPropColliders([
      ...this.propsAndLoot.getActivePropColliders(),
      ...this.propsAndLoot.getActiveLlamaColliders(),
      ...this.worldInteractables.getVaultColliders(),
      ...this.worldInteractables.getUpgradeBenchColliders(),
      ...this.worldInteractables.getSlurpBarrelColliders(),
      ...this.worldInteractables.getExplosiveBarrelColliders(),
      ...this.vehicleSystem.getActiveVehicleColliders(),
    ]);
    this.uiManager.setWorldVehicles(this.vehicleSystem.getVehicles());
    this.uiManager.setWorldVaults(this.worldInteractables.getVaults());
    this.uiManager.setWorldStations(
      this.worldInteractables.getUpgradeBenches(),
      this.worldInteractables.getCampfires(),
    );
    this.uiManager.setWorldRiftsAndFlags(
      this.worldInteractables.getRifts(),
      this.worldInteractables.getCapturePoints(),
    );

    if (this.matchElapsed >= this.nextSupplyDropTime) {
      this.nextSupplyDropTime += 55;
      const st = this.stormSystem.getState();
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * Math.max(12, st.currentRadius * 0.55);
      const sx = st.currentCenterX + Math.cos(ang) * rad;
      const sz = st.currentCenterZ + Math.sin(ang) * rad;
      if (!this.terrain.isWater(sx, sz)) {
        this.propsAndLoot.spawnSupplyDrop(sx, sz);
        this.eventBus.emit('ui:banner', {
          id: `sd_${Date.now()}`,
          title: 'SUPPLY DROP INBOUND',
          subtitle: 'CHECK YOUR MINIMAP FOR THE BLUE BEACON',
          tone: 'info',
          durationMs: 3000,
        });
      }
    }

    // 3. Storm update + Player storm damage
    const stormRes = this.stormSystem.update(dt);
    if (stormRes.shrinkStarted) {
      this.eventBus.emit('sound:play', { id: 'storm_warning' });
      this.eventBus.emit('ui:banner', {
        id: `storm_shrink_${Date.now()}`,
        title: 'STORM EYE SHRINKING!',
        subtitle: 'MOVE INTO THE SAFE ZONE',
        tone: 'storm',
        durationMs: 3200,
      });
    } else if (stormRes.phaseChanged) {
      this.eventBus.emit('ui:banner', {
        id: `storm_phase_${Date.now()}`,
        title: `STORM PHASE ${this.stormSystem.getState().phase}`,
        subtitle: 'NEW SAFE ZONE MARKED ON MAP',
        tone: 'storm',
        durationMs: 2800,
      });
      if (this.augmentManager.hasAugment('storm_mark')) {
        const pPos = this.playerController.getPosition();
        let marked = 0;
        for (const bot of this.botManager.getAliveBots()) {
          if (bot.state === 'bus') continue;
          if (dist2D(pPos.x, pPos.z, bot.position.x, bot.position.z) <= 60) {
            this.audioBlips.push({
              id: `storm_mark_${this.blipSeq++}`,
              x: bot.position.x,
              z: bot.position.z,
              kind: 'bot',
              age: 0,
              maxAge: 6.5,
            });
            marked += 1;
          }
        }
        if (this.audioBlips.length > 48) {
          this.audioBlips.splice(0, this.audioBlips.length - 48);
        }
        this.eventBus.emit('ui:banner', {
          id: `storm_mark_${Date.now()}`,
          title: 'STORM FORECAST SCAN',
          subtitle: marked > 0 ? `${marked} OPPONENT(S) MARKED WITHIN 60M` : 'AREA CLEAR WITHIN 60M',
          tone: 'info',
          durationMs: 2600,
        });
      }
    }

    // 4. Player update + character rig sync
    const prevPlayerPhase = this.playerController.getPhase();
    this.playerController.update(dt, this.totalElapsed, this.busPos, this.busYaw);
    const currPlayerPhase = this.playerController.getPhase();

    if (prevPlayerPhase === 'bus' && currPlayerPhase !== 'bus') {
      // Stop bus music cleanly on drop
      this.eventBus.emit('music:set', { track: 'none' });
    }
    if (currPlayerPhase !== this.phase && this.phase !== 'victory' && this.phase !== 'eliminated') {
      this.phase = currPlayerPhase;
      this.uiManager.setPhase(this.phase);
    }

    const pRender = this.playerController.getCharacterRenderState();
    this.syncPlayerRig(pRender, dt);

    const windActive =
      currPlayerPhase !== 'bus' &&
      !this.paused &&
      (pRender.animState === 'skydive' || (!pRender.grounded && (pRender.velocityY ?? 0) < -9));
    const fallSpeed = Math.abs(pRender.velocityY ?? 0);
    this.audioEngine.updateWindRush(windActive, fallSpeed);

    // Track QuestTracker chest opening & hover vehicle travel distance + continuous engine audio
    const pStatsNow = this.playerController.getStats();
    if (pStatsNow.chestsOpened > this.prevChestsOpened) {
      this.questTracker.record('chest_open', pStatsNow.chestsOpened - this.prevChestsOpened);
      this.prevChestsOpened = pStatsNow.chestsOpened;
    }
    const pHudSnap = this.playerController.getHudSnapshot();
    const activeVeh = pHudSnap.vehicle;
    this.audioEngine.updateVehicleEngine(
      Boolean(activeVeh) && currPlayerPhase === 'playing' && !this.paused,
      activeVeh?.speedKmh ?? 0,
      Boolean(activeVeh?.isBoosting),
      activeVeh?.kind,
    );
    if (activeVeh && currPlayerPhase === 'playing') {
      if (this.prevVehicleDistPos) {
        this.vehicleDistAccum += dist2D(
          this.prevVehicleDistPos.x,
          this.prevVehicleDistPos.z,
          pRender.position.x,
          pRender.position.z,
        );
        const wholeMeters = Math.floor(this.vehicleDistAccum);
        if (wholeMeters >= 1) {
          this.vehicleDistAccum -= wholeMeters;
          this.questTracker.record('vehicle_distance', wholeMeters);
        }
      }
      this.prevVehicleDistPos = { ...pRender.position };
    } else {
      this.prevVehicleDistPos = null;
      this.vehicleDistAccum = 0;
    }
    const playerBiome = this.terrain.getBiomeAt(pRender.position.x, pRender.position.z);
    this.environmentFX.update(
      dt,
      this.totalElapsed,
      pRender.position,
      playerBiome,
    );

    // Player Storm DPS tick
    const inStorm =
      currPlayerPhase !== 'bus' &&
      currPlayerPhase !== 'victory' &&
      currPlayerPhase !== 'eliminated' &&
      this.stormSystem.isInStorm(pRender.position.x, pRender.position.z);

    this.audioEngine.updateBiomeAmbience(
      playerBiome,
      inStorm,
      this.environmentFX.getWeatherState().kind,
    );

    if (currPlayerPhase === 'playing' || currPlayerPhase === 'gliding') {
      for (let i = 0; i < POIS.length; i++) {
        const poi = POIS[i];
        if (
          !this.discoveredPois.has(poi.id) &&
          dist2D(pRender.position.x, pRender.position.z, poi.x, poi.z) <= poi.radius * 0.72
        ) {
          this.discoveredPois.add(poi.id);
          this.eventBus.emit('ui:poi_discover', {
            poiName: poi.name,
            subtitle: poi.subtitle,
          });
          this.eventBus.emit('sound:play', { id: 'poi_discover', volume: 0.7 });
          break;
        }
      }
    }

    const aliveCountNow =
      this.botManager.getAliveCount() + (this.playerController.isAlive() ? 1 : 0);
    if (
      currPlayerPhase === 'playing' &&
      !this.activeEmoteMusic &&
      !this.intenseCombatMusicActive &&
      (this.stormSystem.getState().phase >= 5 || (aliveCountNow <= 4 && this.totalPlayers > 4))
    ) {
      this.intenseCombatMusicActive = true;
      this.eventBus.emit('music:set', { track: 'combat_intense' });
    }

    if (inStorm && this.playerController.isAlive()) {
      this.stormTickAccum += dt;
      if (this.stormTickAccum >= 1.0) {
        this.stormTickAccum -= 1.0;
        this.lastStormDamageAt = this.matchElapsed;
        this.playerController.applyStormDamage(this.stormSystem.getState().dps);
        this.eventBus.emit('sound:play', { id: 'storm_tick', volume: 0.65 });
      }
    } else {
      this.stormTickAccum = 0;
    }

    // Stop emote music automatically if player moved/stopped emoting
    if (this.activeEmoteMusic && pRender.animState !== 'emote' && this.phase !== 'victory') {
      this.activeEmoteMusic = null;
      this.eventBus.emit('music:set', { track: 'none' });
    }

    // 5. AI Bots update + rigs + Dynamic Hunt Bounty
    this.botManager.update(dt, this.matchElapsed, this.busPos, pRender.position);
    this.botManager.applyStormDamage(dt);
    this.syncBotRigs(dt);

    const bountyRewards = this.botManager.consumeBountyRewards();
    for (const reward of bountyRewards) {
      if (this.playerController.isAlive()) {
        this.playerController.applySplashHeal(35);
        this.eventBus.emit('ui:banner', {
          id: `bounty_win_${Date.now()}`,
          title: 'BOUNTY CLAIMED!',
          subtitle: `${reward.targetName} ELIMINATED • +35 SHIELD`,
          tone: 'victory',
          durationMs: 3200,
        });
      }
    }
    if (
      currPlayerPhase === 'playing' &&
      this.matchElapsed >= 25 &&
      aliveCountNow > 3 &&
      !this.botManager.getBountyTarget(pRender.position, this.matchElapsed)
    ) {
      this.botManager.assignBounty(pRender.position, this.matchElapsed);
    }

    // 6. Weapons, Building, VFX + Throwable Trajectory Arc
    this.weaponSystem.update(dt);
    this.buildingSystem.update(dt, this.totalElapsed);
    this.vfxManager.updateThrowArc(
      currPlayerPhase === 'playing' ? this.playerController.getThrowableArc() : null,
    );
    this.vfxManager.update(dt);

    // 7. Spectator camera when eliminated & Audio 3D listener + Chest Hum Loops
    let cameraFocusPos = pRender.position;
    if (this.phase === 'eliminated') {
      const specBot = this.getSpectatedBot();
      if (specBot) {
        cameraFocusPos = specBot.position;
        this.playerRig.setVisible(false);
        const orbitYaw = specBot.yaw + Math.sin(this.totalElapsed * 0.25) * 0.25;
        const backDist = 6.2;
        this.camera.position.set(
          specBot.position.x - Math.sin(orbitYaw) * backDist,
          specBot.position.y + 3.0,
          specBot.position.z - Math.cos(orbitYaw) * backDist,
        );
        this.camera.lookAt(
          specBot.position.x,
          specBot.position.y + 1.45,
          specBot.position.z,
        );
      }
    }
    this.updateSpatialAudio(cameraFocusPos);

    // 8. Waypoint ring spin & Minimap Blips
    if (this.waypointBeam.visible) {
      this.waypointRing.rotation.z += dt * 1.8;
    }
    this.updateBlips(dt);

    // 9. Atmospheric Storm Fog + Weather Sky Lighting + Sun Shadow Tracking
    this.updateAtmosphereAndShadows(cameraFocusPos, inStorm, dt);

    // 10. Check Win / Elimination transitions
    this.checkMatchOutcome(rawDt);

    // 11. Sync HUD
    this.pushHUDState(inStorm);
  }

  private stepLobby(dt: number): void {
    this.worldBuilder.update(dt, this.totalElapsed);
    this.worldInteractables.update(dt, this.totalElapsed);
    this.environmentDetail.update(dt, this.totalElapsed);
    const lobbyBiome = this.terrain.getBiomeAt(this.lobbyPos.x, this.lobbyPos.z);
    this.environmentFX.update(
      dt,
      this.totalElapsed,
      this.lobbyPos,
      lobbyBiome,
    );
    this.audioEngine.updateBiomeAmbience(lobbyBiome, false);

    // Gentle Lobby Bus cruise bob
    this.environmentFX.setBusTransform(
      {
        x: 35 + Math.sin(this.totalElapsed * 0.25) * 16,
        y: 122 + Math.sin(this.totalElapsed * 0.6) * 1.5,
        z: -95 + Math.cos(this.totalElapsed * 0.25) * 12,
      },
      0.85,
      true,
    );

    if (this.lobbyEmoteTimer > 0) {
      this.lobbyEmoteTimer -= dt;
      if (this.lobbyEmoteTimer <= 0) {
        this.lobbyActiveEmote = null;
        if (this.lobbyMusicStarted) {
          this.eventBus.emit('music:set', { track: 'lobby' });
        }
      }
    }

    const lobbyState: CharacterRenderState = {
      position: { ...this.lobbyPos },
      yaw: this.lobbyCharacterYaw,
      pitch: 0,
      animState: this.lobbyActiveEmote ? 'emote' : 'idle',
      weaponId: 'pickaxe',
      weaponWrapId: this.lobbyConfig.weaponWrapId ?? 'factory_matte',
      contrailId: this.lobbyConfig.contrailId ?? 'wind_stream',
      isAiming: false,
      isFiring: false,
      isBuilding: false,
      emoteId: this.lobbyActiveEmote,
      moveSpeed: 0,
      grounded: true,
      health: 100,
      shield: 0,
      recoilKick: 0,
      harvestSwingTimer: 0,
    };

    this.playerRig.setVisible(true);
    this.playerRig.setGliderOpen(false, 0);
    this.playerRig.equipWeapon('pickaxe', false);
    this.playerRig.setWeaponWrap(this.lobbyConfig.weaponWrapId ?? 'factory_matte');
    this.characterAnimator.update(this.playerRig, lobbyState, dt);

    // Frame character cleanly in center with scenic island behind
    const camPos = {
      x: this.lobbyPos.x + 0.2,
      y: this.lobbyPos.y + 1.48,
      z: this.lobbyPos.z + 3.85,
    };
    this.camera.position.set(camPos.x, camPos.y, camPos.z);
    this.camera.lookAt(this.lobbyPos.x, this.lobbyPos.y + 1.05, this.lobbyPos.z - 4.0);

    this.updateAtmosphereAndShadows(this.lobbyPos, false, dt);
  }

  private syncPlayerRig(state: CharacterRenderState, dt: number): void {
    const visible = this.phase !== 'bus';
    this.playerRig.setVisible(visible);
    if (!visible) return;

    this.playerRig.equipWeapon(state.weaponId, state.isBuilding);
    this.playerRig.setWeaponWrap(state.weaponWrapId ?? this.lobbyConfig.weaponWrapId ?? 'factory_matte');
    this.playerRig.setContrail(state.contrailId ?? this.lobbyConfig.contrailId ?? 'wind_stream');
    const targetGlider = state.animState === 'glide' ? 1 : 0;
    this.playerGliderFactor = lerp(
      this.playerGliderFactor,
      targetGlider,
      1 - Math.exp(-10 * dt),
    );
    this.playerRig.setGliderOpen(
      this.playerGliderFactor > 0.02,
      this.playerGliderFactor,
    );
    const groundY = this.terrain.getHeightAt(state.position.x, state.position.z);
    const syncedState: CharacterRenderState = {
      ...state,
      weaponWrapId: state.weaponWrapId ?? this.lobbyConfig.weaponWrapId ?? 'factory_matte',
      contrailId: state.contrailId ?? this.lobbyConfig.contrailId ?? 'wind_stream',
    };
    this.playerRig.updateFromState(syncedState, groundY);
    this.characterAnimator.update(this.playerRig, syncedState, dt);

    const muzzle = this.playerRig.getMuzzleWorldPosition();
    this.playerController.setMuzzleWorldPosition({
      x: muzzle.x,
      y: muzzle.y,
      z: muzzle.z,
    });
  }

  private syncBotRigs(dt: number): void {
    const states: BotRenderState[] = this.botManager.getRenderStates();
    for (let i = 0; i < states.length; i++) {
      const bs = states[i];
      const visual = this.botVisuals.get(bs.id);
      if (!visual) continue;

      if (bs.isHiddenInBus || !bs.alive) {
        visual.rig.setVisible(false);
        continue;
      }

      visual.rig.setVisible(true);
      visual.rig.equipWeapon(bs.weaponId, bs.isBuilding);
      visual.rig.setGliderOpen(bs.gliderOpen, bs.gliderFactor);
      this.characterAnimator.update(visual.rig, bs, dt);
    }
  }

  private updateSpatialAudio(playerPos: Vec3Like): void {
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const camUp = this.camera.up;

    this.audioEngine.updateListener(
      {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      { x: camDir.x, y: camDir.y, z: camDir.z },
      { x: camUp.x, y: camUp.y, z: camUp.z },
    );
    this.audioEngine.updateChestLoops(playerPos, this.propsAndLoot.getChests());
  }

  private updateBlips(dt: number): void {
    for (let i = this.audioBlips.length - 1; i >= 0; i--) {
      this.audioBlips[i].age += dt;
      if (this.audioBlips[i].age >= this.audioBlips[i].maxAge) {
        this.audioBlips.splice(i, 1);
      }
    }
  }

  private updateAtmosphereAndShadows(
    focusPos: Vec3Like,
    inStorm: boolean,
    dt: number,
  ): void {
    const weather = this.environmentFX.getWeatherState().kind;
    let targetColorHex = 0x96d7ff;
    let targetNear = 220;
    let targetFar = 740;
    let hemiIntensity = 1.18;

    if (inStorm) {
      targetColorHex = 0x4b1d8c;
      targetNear = 25;
      targetFar = 165;
    } else if (weather === 'golden_hour') {
      targetColorHex = 0xf5c086;
      targetNear = 190;
      targetFar = 680;
    } else if (weather === 'overcast') {
      targetColorHex = 0x8ea4b8;
      targetNear = 155;
      targetFar = 580;
    } else if (weather === 'rain') {
      targetColorHex = 0x6c88a1;
      targetNear = 120;
      targetFar = 500;
      hemiIntensity = 0.98;
    } else if (weather === 'storm_front') {
      targetColorHex = 0x475c77;
      targetNear = 85;
      targetFar = 420;
      hemiIntensity = 0.88;
    }

    if (this.lightningFlash > 0.01) {
      hemiIntensity += this.lightningFlash * 1.35;
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.4);
    }
    this.hemiLight.intensity = hemiIntensity;

    const t = 1 - Math.exp(-5 * dt);

    const tmpCol = new THREE.Color(targetColorHex);
    this.fog.color.lerp(tmpCol, t);
    this.fog.near = lerp(this.fog.near, targetNear, t);
    this.fog.far = lerp(this.fog.far, targetFar, t);

    // 2. Snap DirectionalLight shadow frustum to texel increments to prevent shimmer
    const worldSpan = 180; // -90..90
    const texelSize = worldSpan / this.shadowMapSize;
    const snappedX = Math.round(focusPos.x / texelSize) * texelSize;
    const snappedZ = Math.round(focusPos.z / texelSize) * texelSize;
    const snappedY = Math.round(focusPos.y / texelSize) * texelSize;

    const sunDir = this.environmentFX.getSunDirection();
    this.sunLight.target.position.set(snappedX, snappedY, snappedZ);
    this.sunLight.position.set(
      snappedX + sunDir.x * 195,
      snappedY + Math.max(95, sunDir.y * 230),
      snappedZ + sunDir.z * 195,
    );
    this.sunLight.target.updateMatrixWorld();
  }

  private checkMatchOutcome(rawDt: number): void {
    const aliveBots = this.botManager.getAliveCount();
    const playerAlive = this.playerController.isAlive();

    if (!playerAlive && this.phase !== 'eliminated' && this.phase !== 'victory') {
      this.phase = 'eliminated';
      this.playerController.setPhase('eliminated');
      this.uiManager.setPhase('eliminated');
      this.releasePointerLock();

      const lastDmg = this.lastPlayerDamageEvent;
      const isStormDeath =
        this.lastStormDamageAt >= this.lastPlayerDamageAt &&
        this.lastStormDamageAt > 0;

      const kf: KillFeedEntry = {
        id: `kf_player_${this.killFeedSeq++}`,
        killerId: isStormDeath ? 'storm' : (lastDmg?.attackerId ?? 'storm'),
        killerName: isStormDeath ? 'The Storm' : (lastDmg?.attackerName ?? 'The Storm'),
        victimId: 'player',
        victimName: this.lobbyConfig.playerName,
        weaponId: lastDmg?.weaponId ?? 'pistol',
        rarity: lastDmg?.rarity ?? 'common',
        isHeadshot: isStormDeath ? false : (lastDmg?.isHeadshot ?? false),
        isStorm: isStormDeath,
        distance: isStormDeath ? 0 : lastDmg ? Math.round(lastDmg.distance) : 0,
        timestamp: this.matchElapsed,
        involvesPlayer: true,
      };
      this.eventBus.emit('combat:killfeed', kf);

      this.presentMatchSummary(
        false,
        aliveBots + 1,
        isStormDeath ? 'The Storm' : (lastDmg?.attackerName ?? 'The Storm'),
        aliveBots === 0,
      );
      if (aliveBots > 0) {
        this.spectateBotIndex = 0;
        this.spectatorSummaryOpen = false;
      }
      return;
    }

    if (
      playerAlive &&
      aliveBots === 0 &&
      this.totalPlayers > 1 &&
      this.phase !== 'victory' &&
      this.phase !== 'eliminated'
    ) {
      this.triggerVictoryFlow(false);
    }

    if (this.phase === 'victory' && this.victoryPendingSummary && !this.matchSummaryShown) {
      this.victoryTimer -= rawDt;
      if (this.victoryTimer <= 0) {
        this.victoryPendingSummary = false;
        this.presentMatchSummary(true, 1);
      }
    }
  }

  private triggerVictoryFlow(immediateSummary: boolean): void {
    this.phase = 'victory';
    this.playerController.setPhase('victory');
    this.playerController.enterTestEmote(this.lobbyConfig.selectedEmote);
    this.uiManager.setPhase('victory');
    this.releasePointerLock();

    this.eventBus.emit('sound:play', { id: 'victory_fanfare' });
    this.eventBus.emit('music:set', { track: 'victory' });
    this.eventBus.emit('ui:banner', {
      id: 'victory_banner',
      title: '#1 VICTORY ROYALE!',
      subtitle: `${this.playerController.getKills()} ELIMINATIONS`,
      tone: 'victory',
      durationMs: 4500,
    });

    if (immediateSummary) {
      this.victoryPendingSummary = false;
      this.presentMatchSummary(true, 1);
    } else {
      this.victoryPendingSummary = true;
      this.victoryTimer = 1.4;
    }
  }

  private presentMatchSummary(
    victory: boolean,
    placement: number,
    eliminatedBy?: string,
    openOverlay = true,
  ): void {
    if (this.matchSummaryShown) return;
    this.matchSummaryShown = true;

    const stats = this.playerController.getStats();
    const accuracy =
      stats.shotsFired > 0
        ? Math.round((stats.shotsHit / stats.shotsFired) * 100)
        : 0;

    const summary: MatchSummary = {
      victory,
      placement,
      totalPlayers: this.totalPlayers,
      kills: this.playerController.getKills(),
      damageDealt: Math.round(stats.damageDealt),
      shotsFired: stats.shotsFired,
      shotsHit: stats.shotsHit,
      accuracy,
      headshots: stats.headshots,
      structuresBuilt: stats.structuresBuilt,
      chestsOpened: stats.chestsOpened,
      survivalTimeSec: Math.round(this.survivalTimeSec),
      eliminatedBy,
      gameMode: this.gameMode,
      questsCompleted: this.questTracker.getCompletedCount(),
      bonusXp: this.questTracker.getCompletedBonusXp() + (stats.poisCaptured ?? 0) * 300,
      activeAugments: this.augmentManager.getActiveAugments(),
      poisCaptured: stats.poisCaptured ?? 0,
    };
    this.lastMatchSummary = summary;
    recordMatchCareerStats(summary);
    if (openOverlay) {
      this.spectatorSummaryOpen = true;
      this.uiManager.showMatchSummary(summary);
    }
  }

  private getSpectatedBot(): BotEntity | null {
    const alive = this.botManager.getAliveBots();
    if (alive.length === 0) return null;
    const idx = ((this.spectateBotIndex % alive.length) + alive.length) % alive.length;
    return alive[idx];
  }

  private cycleSpectateTarget(delta: number): void {
    if (this.phase !== 'eliminated') return;
    const alive = this.botManager.getAliveBots();
    if (alive.length === 0) return;
    this.spectateBotIndex = ((this.spectateBotIndex + delta) % alive.length + alive.length) % alive.length;
  }

  private toggleSpectatorSummary(): void {
    if (this.phase !== 'eliminated' || !this.lastMatchSummary) return;
    this.spectatorSummaryOpen = !this.spectatorSummaryOpen;
    if (this.spectatorSummaryOpen) {
      this.uiManager.showMatchSummary(this.lastMatchSummary);
    } else {
      this.uiManager.hideMatchSummary();
    }
  }

  private handlePoiCaptured(poiName: string, lootPos?: Vec3Like): void {
    this.eventBus.emit('ui:banner', {
      id: `poi_cap_${Date.now()}`,
      title: `${poiName.toUpperCase()} CAPTURED!`,
      subtitle: 'LEGENDARY LOOT DROP, RADAR SCAN & +300 BONUS XP',
      tone: 'victory',
      durationMs: 3600,
    });
    const pPos = this.playerController.getPosition();
    for (const bot of this.botManager.getAliveBots()) {
      if (bot.state === 'bus') continue;
      if (dist2D(pPos.x, pPos.z, bot.position.x, bot.position.z) <= 65) {
        this.audioBlips.push({
          id: `cap_scan_${this.blipSeq++}`,
          x: bot.position.x,
          z: bot.position.z,
          kind: 'bot',
          age: 0,
          maxAge: 5.5,
        });
      }
    }
    if (lootPos) {
      this.spawnFlagLootBurst(lootPos);
    }
  }

  private spawnFlagLootBurst(lootPos: Vec3Like): void {
    const flagRewards: Array<{ id: WeaponId; rarity: 'mythic' | 'legendary' | 'epic' | 'rare'; stack: number }> = [
      { id: 'heavy_shotgun', rarity: 'legendary', stack: 1 },
      { id: 'ar', rarity: 'legendary', stack: 1 },
      { id: 'shield_potion', rarity: 'rare', stack: 2 },
      { id: 'chug_splash', rarity: 'rare', stack: 2 },
    ];
    flagRewards.forEach((entry, idx) => {
      const a = (idx / flagRewards.length) * Math.PI * 2;
      const def = WEAPONS[entry.id];
      this.propsAndLoot.spawnLootDrop(
        { x: lootPos.x, y: lootPos.y + 0.6, z: lootPos.z },
        {
          item: {
            uid: `flag_drop_${Date.now()}_${idx}`,
            weaponId: entry.id,
            rarity: entry.rarity,
            magAmmo: def.magSize,
            stackCount: entry.stack,
          },
        },
        { x: Math.cos(a) * 2.1, y: 4.1, z: Math.sin(a) * 2.1 },
      );
    });
    for (const mat of ['wood', 'brick', 'metal'] as MaterialType[]) {
      this.propsAndLoot.spawnLootDrop(
        { x: lootPos.x, y: lootPos.y + 0.6, z: lootPos.z },
        { materials: { type: mat, amount: 100 } },
        { x: (Math.random() - 0.5) * 2.6, y: 3.8, z: (Math.random() - 0.5) * 2.6 },
      );
    }
  }

  private spawnVaultLootBurst(lootPos: Vec3Like): void {
    const weaponRewards: Array<{ id: WeaponId; rarity: 'mythic' | 'legendary' | 'epic' | 'rare'; stack: number }> = [
      { id: 'mythic_blade_rifle', rarity: 'mythic', stack: 1 },
      { id: 'grappler', rarity: 'mythic', stack: 1 },
      { id: 'heavy_shotgun', rarity: 'legendary', stack: 1 },
      { id: 'shield_bubble', rarity: 'epic', stack: 2 },
      { id: 'chug_splash', rarity: 'rare', stack: 3 },
    ];
    weaponRewards.forEach((entry, idx) => {
      const a = (idx / weaponRewards.length) * Math.PI * 2;
      const def = WEAPONS[entry.id];
      this.propsAndLoot.spawnLootDrop(
        { x: lootPos.x, y: lootPos.y + 0.6, z: lootPos.z },
        {
          item: {
            uid: `vault_drop_${Date.now()}_${idx}`,
            weaponId: entry.id,
            rarity: entry.rarity,
            magAmmo: def.magSize,
            stackCount: entry.stack,
          },
        },
        { x: Math.cos(a) * 2.5, y: 4.5, z: Math.sin(a) * 2.5 },
      );
    });
    for (const mat of ['wood', 'brick', 'metal'] as MaterialType[]) {
      this.propsAndLoot.spawnLootDrop(
        { x: lootPos.x, y: lootPos.y + 0.6, z: lootPos.z },
        { materials: { type: mat, amount: 150 } },
        { x: (Math.random() - 0.5) * 3.0, y: 4.0, z: (Math.random() - 0.5) * 3.0 },
      );
    }
  }

  private pushHUDState(inStorm: boolean): void {
    const snap = this.playerController.getHudSnapshot();
    const inv = this.playerController.getInventory();
    const aliveCount =
      this.botManager.getAliveCount() + (this.playerController.isAlive() ? 1 : 0);
    const stormSt = this.stormSystem.getState();
    const currentBiome = this.terrain.getBiomeAt(snap.playerPos.x, snap.playerPos.z);
    const currentPoi = POIS.find(
      (poi) => dist2D(snap.playerPos.x, snap.playerPos.z, poi.x, poi.z) <= poi.radius * 0.85,
    );
    const stormDistance = Math.round(
      Math.hypot(
        snap.playerPos.x - stormSt.currentCenterX,
        snap.playerPos.z - stormSt.currentCenterZ,
      ) - stormSt.currentRadius,
    );
    const career = loadCareerStats();
    const weather = this.environmentFX.getWeatherState().kind;
    const activeBounty =
      this.phase === 'playing'
        ? this.botManager.getBountyTarget(snap.playerPos, this.matchElapsed)
        : null;

    let nearbyBoss: HUDState['nearbyBoss'] = null;
    if (this.phase === 'playing' || this.phase === 'gliding') {
      let bestBossDist = 65;
      for (const bs of this.botManager.getBotSummaries()) {
        if (!bs.alive || !bs.isBoss) continue;
        const d = dist3D(snap.playerPos, bs.position);
        if (d < bestBossDist) {
          const full = this.botManager.getBotById(bs.id);
          if (full) {
            bestBossDist = d;
            nearbyBoss = {
              name: bs.name,
              hp: Math.ceil(full.hp),
              maxHp: full.maxHp,
              shield: Math.ceil(full.shield),
              maxShield: full.maxShield,
              distance: Math.round(d),
            };
          }
        }
      }
    }

    let spectating: HUDState['spectating'] = null;
    if (this.phase === 'eliminated' && !this.spectatorSummaryOpen) {
      const sb = this.getSpectatedBot();
      if (sb) {
        spectating = {
          targetName: sb.name,
          targetHp: Math.ceil(sb.hp),
          targetShield: Math.ceil(sb.shield),
          targetKills: sb.kills,
          aliveCount: this.botManager.getAliveCount(),
        };
      }
    }

    // Combine audio blips + landed/descending supply drops for radar
    const blips: MinimapBlip[] = [...this.audioBlips];
    for (const sd of this.propsAndLoot.getSupplyDrops()) {
      if (sd.state !== 'opened') {
        blips.push({
          id: sd.id,
          x: sd.x,
          z: sd.z,
          kind: 'supply_drop',
          age: 0,
          maxAge: 1,
        });
      }
    }

    const hudState: HUDState = {
      phase: snap.phase,
      health: snap.health,
      maxHealth: snap.maxHealth,
      shield: snap.shield,
      maxShield: snap.maxShield,
      stamina: snap.stamina,
      isSprinting: snap.isSprinting,
      isCrouching: snap.isCrouching,
      isAiming: snap.isAiming,
      isScoped: snap.isScoped,
      isBuildMode: snap.isBuildMode,
      activeBuildType: snap.activeBuildType,
      activeMaterial: snap.activeMaterial,
      buildRotation: snap.buildRotation,
      editMode: snap.editMode,
      slots: inv.getSlots(),
      activeSlot: inv.getActiveSlotIndex(),
      ammo: inv.getAllAmmo(),
      materials: inv.getMaterials(),
      activeWeaponSpread: snap.activeWeaponSpread,
      interactPrompt: snap.interactPrompt,
      reloadProgress: snap.reloadProgress,
      healProgress: snap.healProgress,
      healLabel: snap.healLabel,
      aliveCount,
      totalPlayers: this.totalPlayers,
      kills: snap.kills,
      stormState: this.stormSystem.getState(),
      busProgress: this.busProgress,
      busStart: this.busStart,
      busEnd: this.busEnd,
      busPos: this.busPos,
      playerPos: snap.playerPos,
      playerYaw: snap.playerYaw,
      mapWaypoint: this.mapWaypoint,
      compassHeading: snap.compassHeading,
      fps: this.fps,
      pointerLocked: snap.pointerLocked,
      canDeployGlider: snap.canDeployGlider,
      canJumpBus: snap.canJumpBus,
      hitmarker: snap.hitmarker,
      damageDirection: snap.damageDirection,
      audioBlips: blips,
      inStorm,
      isSliding: snap.isSliding,
      isZiplining: snap.isZiplining,
      isSwimming: snap.isSwimming,
      currentBiome,
      currentPoiName: currentPoi ? currentPoi.name : null,
      killStreak: snap.killStreak,
      siphonFlashAt: snap.siphonFlashAt,
      lowHealthPulse: snap.lowHealthPulse,
      stormDistance,
      canRepairBuild: snap.canRepairBuild,
      showSpeedLines: snap.showSpeedLines,
      careerXp: career.xp,
      careerLevel: career.level,
      vehicle: snap.vehicle,
      weather,
      spectating,
      nearbyBoss,
      activeBounty,
      activeVaultKeys: snap.activeVaultKeys,
      grapplerCharges: snap.grapplerCharges,
      gameMode: snap.gameMode ?? this.gameMode,
      overshield: snap.overshield ?? 0,
      maxOvershield: snap.maxOvershield ?? 0,
      activeQuests: this.questTracker.getQuests(),
      visualSoundCues: this.computeVisualSoundCues(snap.playerPos),
      nearCampfireHealing: snap.nearCampfireHealing ?? false,
      activeAugments: snap.activeAugments ?? this.augmentManager.getActiveAugments(),
      pendingAugmentChoices: snap.pendingAugmentChoices ?? this.augmentManager.getPendingChoices(),
      captureStatus: snap.captureStatus ?? null,
      tacticalPing: this.projectTacticalPing(snap.tacticalPing),
    };

    this.uiManager.updateHUD(hudState);
  }

  private projectTacticalPing(
    ping: ReturnType<PlayerController['getHudSnapshot']>['tacticalPing'],
  ): HUDState['tacticalPing'] {
    if (!ping) return null;
    this.projVec.set(ping.x, ping.y + 1.25, ping.z);
    this.projVec.project(this.camera);
    const visible = this.projVec.z >= -1 && this.projVec.z <= 1;
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 720;
    return {
      ...ping,
      screenX: (this.projVec.x * 0.5 + 0.5) * w,
      screenY: (-this.projVec.y * 0.5 + 0.5) * h,
      visible,
    };
  }

  private computeVisualSoundCues(playerPos: Vec3Like): VisualSoundCue[] {
    if (this.settings.visualAudio === false || this.phase === 'lobby' || this.phase === 'bus') {
      return [];
    }

    // Prune expired noise pulses
    for (let i = this.recentVisualNoises.length - 1; i >= 0; i--) {
      if (this.matchElapsed - this.recentVisualNoises[i].time > 1.4) {
        this.recentVisualNoises.splice(i, 1);
      }
    }

    const camForward = new THREE.Vector3();
    this.camera.getWorldDirection(camForward);
    let fx = camForward.x;
    let fz = camForward.z;
    const fLen = Math.hypot(fx, fz);
    if (fLen < 1e-4) {
      fx = 0;
      fz = -1;
    } else {
      fx /= fLen;
      fz /= fLen;
    }
    // Right vector in XZ plane: camForward x +Y_up = (-fz, fx)
    const rx = -fz;
    const rz = fx;

    const toRelativeAngle = (tx: number, tz: number): { dist: number; angleRad: number } => {
      const dx = tx - playerPos.x;
      const dz = tz - playerPos.z;
      const dist = Math.hypot(dx, dz);
      const rightDot = dx * rx + dz * rz;
      const forwardDot = dx * fx + dz * fz;
      return { dist, angleRad: Math.atan2(rightDot, forwardDot) };
    };

    const cues: VisualSoundCue[] = [];

    for (const vn of this.recentVisualNoises) {
      const { dist, angleRad } = toRelativeAngle(vn.x, vn.z);
      const maxR = vn.kind === 'gunfire' ? 45 : 26;
      if (dist >= 1.2 && dist <= maxR) {
        const ageFactor = Math.max(0.25, 1 - (this.matchElapsed - vn.time) / 1.4);
        cues.push({
          id: vn.id,
          angleRad,
          kind: vn.kind,
          intensity: Math.max(0.2, Math.min(1, (1 - dist / (maxR + 4)) * ageFactor)),
        });
      }
    }

    for (const bot of this.botManager.getAliveBots()) {
      if (bot.state === 'bus') continue;
      const { dist, angleRad } = toRelativeAngle(bot.position.x, bot.position.z);
      if (dist < 1 || dist > 45) continue;
      if (bot.isFiring) {
        cues.push({
          id: `vbot_gun_${bot.id}`,
          angleRad,
          kind: 'gunfire',
          intensity: Math.max(0.3, 1 - dist / 48),
        });
      } else if (bot.gliderOpen) {
        cues.push({
          id: `vbot_glide_${bot.id}`,
          angleRad,
          kind: 'glider',
          intensity: Math.max(0.25, 1 - dist / 48),
        });
      } else if (bot.grounded && bot.moveSpeed > 3.5 && dist <= 24) {
        cues.push({
          id: `vbot_step_${bot.id}`,
          angleRad,
          kind: 'footstep',
          intensity: Math.max(0.2, 1 - dist / 26),
        });
      }
    }

    for (const veh of this.vehicleSystem.getVehicles()) {
      if (veh.destroyed) continue;
      const speed = Math.hypot(veh.vx, veh.vz);
      if (!veh.driverId && speed < 2.2) continue;
      const { dist, angleRad } = toRelativeAngle(veh.x, veh.z);
      if (dist >= 2 && dist <= 42) {
        cues.push({
          id: `vveh_${veh.id}`,
          angleRad,
          kind: 'vehicle',
          intensity: Math.max(0.3, 1 - dist / 45),
        });
      }
    }

    for (const chest of this.propsAndLoot.getChests()) {
      if (chest.opened) continue;
      const { dist, angleRad } = toRelativeAngle(chest.x, chest.z);
      if (dist <= 16) {
        cues.push({
          id: `vchest_${chest.id}`,
          angleRad,
          kind: 'chest',
          intensity: Math.max(0.2, (1 - dist / 18) * 0.72),
        });
      }
    }

    return cues;
  }

  private exposeDebugAPI(): void {
    const engine = this;
    window.__GAME__ = {
      getState() {
        const snap = engine.playerController.getHudSnapshot();
        const inv = engine.playerController.getInventory();
        return {
          phase: engine.phase,
          playerPhase: snap.phase,
          playerPos: snap.playerPos,
          playerYaw: snap.playerYaw,
          health: snap.health,
          shield: snap.shield,
          kills: snap.kills,
          aliveCount:
            engine.botManager.getAliveCount() +
            (engine.playerController.isAlive() ? 1 : 0),
          botCount: engine.botManager.getBots().length,
          storm: engine.stormSystem.getState(),
          inventory: {
            activeSlot: inv.getActiveSlotIndex(),
            slots: inv.getSlots(),
            ammo: inv.getAllAmmo(),
            materials: inv.getMaterials(),
          },
          isBuildMode: snap.isBuildMode,
          activeBuildType: snap.activeBuildType,
          activeMaterial: snap.activeMaterial,
          buildCount: engine.buildingSystem.getPieces().length,
          editMode: snap.editMode,
          mapWaypoint: engine.mapWaypoint,
          stats: engine.playerController.getStats(),
          lobbyConfig: engine.lobbyConfig,
          pois: POIS.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z })),
        };
      },
      forceStartMatch() {
        engine.startMatch(engine.uiManager.getLobbyConfig());
      },
      jumpFromBus() {
        const ok = engine.playerController.jumpFromBus();
        engine.phase = engine.playerController.getPhase();
        engine.uiManager.setPhase(engine.phase);
        return ok;
      },
      teleportPlayer(x: number, y: number, z: number) {
        engine.playerController.teleport({ x, y, z });
        engine.phase = engine.playerController.getPhase();
        engine.uiManager.setPhase(engine.phase);
        engine.pushHUDState(
          engine.stormSystem.isInStorm(x, z),
        );
      },
      giveLoadout() {
        const inv = engine.playerController.getInventory();
        const loadout: Array<{ id: WeaponId; rarity: 'epic' | 'legendary' | 'rare' | 'uncommon'; stack: number }> = [
          { id: 'ar', rarity: 'legendary', stack: 1 },
          { id: 'pump_shotgun', rarity: 'epic', stack: 1 },
          { id: 'sniper', rarity: 'legendary', stack: 1 },
          { id: 'mini_shield', rarity: 'uncommon', stack: 4 },
          { id: 'medkit', rarity: 'uncommon', stack: 2 },
        ];
        loadout.forEach((entry, i) => {
          const def = WEAPONS[entry.id];
          inv.addItem({
            uid: `qa_${entry.id}_${i}`,
            weaponId: entry.id,
            rarity: entry.rarity,
            magAmmo: def.magSize,
            stackCount: entry.stack,
          });
        });
        inv.addAmmo('medium', 240);
        inv.addAmmo('shells', 48);
        inv.addAmmo('heavy', 25);
        inv.addAmmo('light', 180);
        inv.addMaterial('wood', 300);
        inv.addMaterial('brick', 250);
        inv.addMaterial('metal', 200);
        inv.setActiveSlot(1);
        engine.pushHUDState(false);
      },
      enterBuildMode(piece: BuildPieceType = 'wall') {
        engine.playerController.selectBuildPiece(piece);
        engine.pushHUDState(false);
      },
      placeBuild() {
        const snap = engine.playerController.getHudSnapshot();
        const inv = engine.playerController.getInventory();
        const mat = snap.activeMaterial;
        if (inv.getMaterials()[mat] < 10) inv.addMaterial(mat, 50);
        const p = engine.playerController.getPosition();
        const yaw = engine.playerController.getYaw();
        const preview = engine.buildingSystem.computePreview(
          { x: p.x, y: p.y + 1.5, z: p.z },
          { x: Math.sin(yaw), y: -0.1, z: Math.cos(yaw) },
          snap.activeBuildType,
          mat,
          snap.buildRotation,
          true,
        );
        if (!preview.valid) return false;
        inv.spendMaterial(mat, preview.cost);
        const placed = engine.buildingSystem.placePieceFromPreview(preview, 'player');
        engine.pushHUDState(false);
        return Boolean(placed);
      },
      enterEditMode() {
        if (engine.playerController.enterEditMode()) {
          engine.pushHUDState(false);
          return true;
        }
        // Fallback for QA: target closest friendly piece within 8m
        const pPos = engine.playerController.getPosition();
        const friendly = engine.buildingSystem
          .getPieces()
          .filter((p) => p.ownerId === 'player');
        if (friendly.length === 0) return false;
        let best = friendly[0];
        let bestD = Infinity;
        for (const f of friendly) {
          const d = dist2D(pPos.x, pPos.z, (f.gx + 0.5) * 4, (f.gz + 0.5) * 4);
          if (d < bestD) {
            bestD = d;
            best = f;
          }
        }
        engine.buildingSystem.beginEdit(best.id);
        engine.pushHUDState(false);
        return true;
      },
      toggleEditTile(idx: number) {
        engine.buildingSystem.toggleEditTile(idx);
        engine.pushHUDState(false);
        return true;
      },
      confirmEdit() {
        const res = engine.buildingSystem.confirmEdit();
        engine.pushHUDState(false);
        return res.success;
      },
      triggerEmote(id: EmoteId = 'victory_groove') {
        engine.triggerInGameEmote(id);
      },
      toggleMap(force?: boolean) {
        return engine.uiManager.toggleFullMap(force);
      },
      setWaypoint(x: number, z: number) {
        engine.setWaypoint({ x, z });
      },
      spawnNearbyBot(distance = 14) {
        const bots = engine.botManager.getAliveBots();
        if (bots.length === 0) return false;
        const bot = bots[0];
        const pPos = engine.playerController.getPosition();
        const yaw = engine.playerController.getYaw();
        const bx = pPos.x + Math.sin(yaw) * distance;
        const bz = pPos.z + Math.cos(yaw) * distance;
        const by = engine.terrain.getHeightAt(bx, bz);
        bot.position = { x: bx, y: by, z: bz };
        bot.velocity = { x: 0, y: 0, z: 0 };
        bot.grounded = true;
        bot.gliderOpen = false;
        bot.gliderFactor = 0;
        bot.state = 'combat';
        bot.inventory.items[1] = {
          uid: `qa_bot_gun`,
          weaponId: 'ar',
          rarity: 'rare',
          magAmmo: 30,
          stackCount: 1,
        };
        bot.inventory.activeSlot = 1;
        bot.inventory.materials.wood = 120;
        return true;
      },
      triggerVictory() {
        engine.triggerVictoryFlow(true);
      },
      getStats() {
        return engine.lastMatchSummary;
      },
      teleportToPOI(poiId: string) {
        const poi = POIS.find((p) => p.id === poiId);
        if (!poi) return false;
        let offsetX = 0;
        let offsetZ = 28;
        if (poi.id === 'crystal_basin') {
          offsetX = 8;
          offsetZ = 10;
        } else if (poi.id === 'skyline_spire') {
          offsetX = -4;
          offsetZ = 40;
        } else if (poi.id === 'scorched_caldera') {
          offsetX = -19;
          offsetZ = 31;
        } else if (poi.id === 'frostpeak_citadel') {
          offsetX = 2;
          offsetZ = 31;
        } else if (poi.id === 'sunken_oasis') {
          offsetX = 12;
          offsetZ = 33;
        }
        let x = poi.x + offsetX;
        let z = poi.z + offsetZ;
        if (engine.terrain.isWater(x, z)) {
          x = poi.x;
          z = poi.z;
        }
        const y = engine.terrain.getHeightAt(x, z) + 0.4;
        engine.playerController.teleport({ x, y, z });
        engine.phase = engine.playerController.getPhase();
        engine.uiManager.setPhase(engine.phase);
        engine.pushHUDState(engine.stormSystem.isInStorm(x, z));
        return true;
      },
      getWorldStats() {
        return {
          pois: POIS.length,
          colliders: engine.worldBuildResult.colliders.length,
          worldDrawGroups: engine.worldBuildResult.group.children.length,
          props: engine.propsAndLoot.getProps().length,
          chests: engine.propsAndLoot.getChests().length,
          lootDrops: engine.propsAndLoot.getLootDrops().length,
          launchPads: engine.worldInteractables.getLaunchPads().length,
          ziplines: engine.worldInteractables.getZiplines().length,
          instancedDetailMeshes: engine.environmentDetail.getInstancedMeshCount(),
          birds: engine.environmentDetail.getBirdCount(),
          llamas: engine.propsAndLoot.getLlamas().length,
          bosses: engine.botManager.getBotSummaries().filter((b) => b.isBoss).length,
          upgradeBenches: engine.worldInteractables.getUpgradeBenches().length,
          campfires: engine.worldInteractables.getCampfires().length,
          slurpBarrels: engine.worldInteractables.getSlurpBarrels().length,
          rifts: engine.worldInteractables.getRifts().length,
          capturePoints: engine.worldInteractables.getCapturePoints().length,
          explosiveBarrels: engine.worldInteractables.getExplosiveBarrels().length,
          vehicles: engine.vehicleSystem.getVehicles().length,
          vaults: engine.worldInteractables.getVaults().length,
          fps: Math.round(engine.fps),
        };
      },
      spawnLlamaNearby(distance = 6) {
        const p = engine.playerController.getPosition();
        const yaw = engine.playerController.getYaw();
        const lx = p.x + Math.sin(yaw) * distance;
        const lz = p.z + Math.cos(yaw) * distance;
        engine.propsAndLoot.spawnLlamaAt(lx, lz, yaw + Math.PI);
        engine.collision.setPropColliders([
          ...engine.propsAndLoot.getActivePropColliders(),
          ...engine.propsAndLoot.getActiveLlamaColliders(),
        ]);
        return true;
      },
      triggerShockwave() {
        const p = engine.playerController.getPosition();
        engine.eventBus.emit('vfx:shockwave', { position: { ...p }, radius: 9.5 });
        engine.eventBus.emit('sound:play', { id: 'shockwave_blast', position: p, spatial: true });
        engine.eventBus.emit('vfx:camera_shake', { intensity: 0.75, duration: 0.3 });
        engine.playerController.applyExternalImpulse({ x: 0, y: 18, z: 0 }, true);
        return true;
      },
      giveMythicLoadout() {
        const inv = engine.playerController.getInventory();
        const items: Array<{ id: WeaponId; rarity: 'mythic' | 'legendary' | 'epic' | 'rare'; stack: number }> = [
          { id: 'mythic_blade_rifle', rarity: 'mythic', stack: 1 },
          { id: 'heavy_shotgun', rarity: 'legendary', stack: 1 },
          { id: 'shockwave_grenade', rarity: 'epic', stack: 4 },
          { id: 'frag_grenade', rarity: 'rare', stack: 4 },
          { id: 'chug_splash', rarity: 'rare', stack: 4 },
        ];
        inv.reset();
        items.forEach((entry, i) => {
          const def = WEAPONS[entry.id];
          inv.addItem({
            uid: `qa_mythic_${entry.id}_${i}`,
            weaponId: entry.id,
            rarity: entry.rarity,
            magAmmo: def.magSize,
            stackCount: entry.stack,
          });
        });
        inv.addAmmo('medium', 240);
        inv.addAmmo('shells', 48);
        inv.addMaterial('wood', 500);
        inv.addMaterial('brick', 500);
        inv.addMaterial('metal', 500);
        inv.setActiveSlot(1);
        engine.pushHUDState(false);
      },
      spawnVehicleNearby(kind: VehicleKind = 'hover_atv', distance = 6.5) {
        const p = engine.playerController.getPosition();
        const yaw = engine.playerController.getYaw();
        const vx = p.x + Math.sin(yaw) * distance;
        const vz = p.z + Math.cos(yaw) * distance;
        engine.vehicleSystem.spawnVehicleAt(kind, vx, vz, yaw + Math.PI * 0.5);
        engine.uiManager.setWorldVehicles(engine.vehicleSystem.getVehicles());
        return true;
      },
      setWeather(kind?: WeatherKind) {
        engine.environmentFX.setWeather(kind);
        return engine.environmentFX.getWeatherState().kind;
      },
      giveWave2Loadout() {
        const inv = engine.playerController.getInventory();
        const items: Array<{ id: WeaponId; rarity: 'mythic' | 'legendary' | 'epic' | 'rare'; stack: number }> = [
          { id: 'mythic_blade_rifle', rarity: 'mythic', stack: 1 },
          { id: 'heavy_shotgun', rarity: 'legendary', stack: 1 },
          { id: 'grappler', rarity: 'epic', stack: 1 },
          { id: 'shield_bubble', rarity: 'epic', stack: 2 },
          { id: 'shockwave_grenade', rarity: 'epic', stack: 4 },
        ];
        inv.reset();
        items.forEach((entry, i) => {
          const def = WEAPONS[entry.id];
          inv.addItem({
            uid: `qa_w2_${entry.id}_${i}`,
            weaponId: entry.id,
            rarity: entry.rarity,
            magAmmo: def.magSize,
            stackCount: entry.stack,
          });
        });
        inv.addAmmo('medium', 240);
        inv.addAmmo('shells', 48);
        inv.addMaterial('wood', 500);
        inv.addMaterial('brick', 500);
        inv.addMaterial('metal', 500);
        inv.setActiveSlot(1);
        engine.pushHUDState(false);
      },
      forceAugmentOffer() {
        const offer = engine.augmentManager.forceOffer();
        engine.pushHUDState(false);
        return offer;
      },
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('pointerdown', this.onFirstGestureBound);
    window.removeEventListener('keydown', this.onFirstGestureBound);
    this.renderer.domElement.removeEventListener('pointerdown', this.onLobbyPointerDownBound);
    window.removeEventListener('pointermove', this.onLobbyPointerMoveBound);
    window.removeEventListener('pointerup', this.onLobbyPointerUpBound);

    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];

    this.playerController.dispose();
    this.botManager.dispose();
    this.clearBotVisuals();
    this.playerRig.dispose();
    this.buildingSystem.dispose();
    this.vfxManager.dispose();
    this.propsAndLoot.dispose();
    this.vehicleSystem.dispose();
    this.worldInteractables.dispose();
    this.environmentDetail.dispose();
    this.worldBuilder.dispose();
    this.environmentFX.dispose();
    this.stormSystem.dispose();
    this.terrain.dispose();
    this.audioEngine.updateVehicleEngine(false, 0, false);
    this.audioEngine.updateWindRush(false, 0);
    this.audioEngine.dispose();
    this.uiManager.dispose();

    this.renderer.dispose();
    this.renderer.domElement.remove();
    delete window.__GAME__;
  }
}
