import { EMOTES, WEAPONS, WORLD_SIZE } from '../core';
import type {
  AugmentId,
  BuildPieceType,
  DamageNumberEvent,
  EmoteId,
  GameSettings,
  HUDState,
  HitmarkerFeedback,
  ItemInstance,
  KillFeedEntry,
  MatchQuest,
  MaterialType,
} from '../types';
import {
  angleRadToDeg,
  cloneSettings,
  computeCaptureProgressPct,
  computeFallbackStormDistance,
  computeOvershieldPct,
  computeQuestProgressPct,
  formatBiomeLabel,
  formatCompassTicks,
  formatCountdown,
  formatKeyCodeLabel,
  formatModeBadgeLabel,
  formatSafeZoneDistance,
  formatTacticalPingLabel,
  formatVehicleKindLabel,
  formatWeatherLabel,
  getAugmentMeta,
  getBearingDeg,
  getContextualHudHints,
  getKillStreakCallout,
  getRarityMeta,
  normalizeBoostChargePct,
  resolveCrosshairColor,
  resolveCrosshairStyle,
  resolveKeybinds,
  selectVisibleVisualSoundCues,
  worldToMapNorm,
} from './UIHelpers';
import {
  getAllyRoleSvg,
  getAugmentIconSvg,
  getBountyTargetSvg,
  getBuildIconSvg,
  getCampfireIconSvg,
  getCaptureFlagIconSvg,
  getCrownSvg,
  getGoldBarSvg,
  getLootIslandIconSvg,
  getMaterialIconSvg,
  getOvershieldBoltSvg,
  getSkullSvg,
  getStormEyeSvg,
  getTacticalPingIconSvg,
  getVaultKeySvg,
  getVehicleIconSvg,
  getVisualAudioIconSvg,
  getWeaponSvg,
  getWeatherIconSvg,
} from './WeaponIcons';

export interface HUDCallbacks {
  onEmoteSelect: (emoteId: EmoteId) => void;
  onEditTileToggle: (tileIndex: number) => void;
  onEditConfirm: () => void;
  onEditReset: () => void;
  onRequestPointerLock?: () => void;
  onSpectateNext?: () => void;
  onSpectateMatchSummary?: () => void;
  onAugmentSelect?: (choiceIndex: 0 | 1) => void;
}

export type HUDManagerCallbacks = HUDCallbacks;

interface ActiveDamageNum {
  id: string;
  el: HTMLDivElement;
  createdAt: number;
  baseX: number;
  baseY: number;
}

interface ActiveKillFeedItem {
  entry: KillFeedEntry;
  el: HTMLDivElement;
  expiresAt: number;
}

const BUILD_PIECES: Array<{ type: BuildPieceType; key: string }> = [
  { type: 'wall', key: 'Z' },
  { type: 'floor', key: 'X' },
  { type: 'ramp', key: 'V' },
  { type: 'roof', key: 'F' },
];

const MATERIALS: MaterialType[] = ['wood', 'brick', 'metal'];

export class HUDManager {
  private readonly root: HTMLElement;
  private callbacks: HUDCallbacks;
  private settings: GameSettings;

  private containerEl: HTMLDivElement;
  private stormVignetteEl: HTMLDivElement;
  private speedLinesEl: HTMLDivElement;
  private lowHealthVignetteEl: HTMLDivElement;
  private fpsBadgeEl: HTMLDivElement;
  private killStreakEl: HTMLDivElement;
  private vaultKeyBadgeEl: HTMLDivElement;
  private vaultKeyTextEl: HTMLSpanElement;
  private bountyCardEl: HTMLDivElement;
  private bountyTimerEl: HTMLSpanElement;
  private bountyTargetEl: HTMLDivElement;
  private bountyDistEl: HTMLSpanElement;
  private bountyRewardEl: HTMLSpanElement;
  private allyCardEl: HTMLDivElement;
  private allyRoleIconEl: HTMLSpanElement;
  private allyNameEl: HTMLSpanElement;
  private allyRolePillEl: HTMLSpanElement;
  private allyDistEl: HTMLSpanElement;
  private allyShieldFillEl: HTMLDivElement;
  private allyHpFillEl: HTMLDivElement;
  private allyStatsEl: HTMLDivElement;
  private questsPanelEl: HTMLDivElement;
  private questsCountEl: HTMLSpanElement;
  private questsListEl: HTMLDivElement;
  private questToastLayerEl: HTMLDivElement;
  private activeQuestToastTimers = new Set<ReturnType<typeof setTimeout>>();
  private activeAugmentsEl: HTMLDivElement;
  private augmentPickerEl: HTMLDivElement;
  private augmentChoiceEls: Array<{
    btn: HTMLButtonElement;
    icon: HTMLSpanElement;
    badge: HTMLSpanElement;
    name: HTMLDivElement;
    sub: HTMLDivElement;
  }> = [];

  // Compass & Boss Bar
  private compassTapeEl: HTMLDivElement;
  private compassReadoutEl: HTMLDivElement;
  private bossBarEl: HTMLDivElement;
  private bossNameEl: HTMLSpanElement;
  private bossStatsEl: HTMLSpanElement;
  private bossDistEl: HTMLSpanElement;
  private bossShieldFillEl: HTMLDivElement;
  private bossHpFillEl: HTMLDivElement;
  private phaseHintEl: HTMLDivElement;
  private phaseHintTextEl: HTMLSpanElement;
  private lootIslandChipEl: HTMLDivElement;
  private lootIslandTextEl: HTMLSpanElement;

  // Minimap & telemetry
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D | null;
  private terrainMapCanvas: HTMLCanvasElement | null = null;
  private mapKeyTagEl: HTMLDivElement;
  private stormPillEl: HTMLDivElement;
  private stormTextEl: HTMLSpanElement;
  private stormDistEl: HTMLDivElement;
  private modeChipEl: HTMLDivElement;
  private locationChipEl: HTMLDivElement;
  private weatherPillEl: HTMLDivElement;
  private weatherIconEl: HTMLSpanElement;
  private weatherTextEl: HTMLSpanElement;
  private aliveTextEl: HTMLSpanElement;
  private elimsTextEl: HTMLSpanElement;

  // Kill feed
  private killFeedEl: HTMLDivElement;
  private killFeedItems: ActiveKillFeedItem[] = [];

  // Bottom center & Vehicle Dashboard & Spectator Bar
  private contextHintsEl: HTMLDivElement;
  private siphonBadgeEl: HTMLDivElement;
  private captureBarEl: HTMLDivElement;
  private captureIconEl: HTMLSpanElement;
  private captureLabelEl: HTMLSpanElement;
  private captureContestedEl: HTMLSpanElement;
  private captureFillEl: HTMLDivElement;
  private interactEl: HTMLDivElement;
  private interactKeyEl: HTMLSpanElement;
  private interactLabelEl: HTMLSpanElement;
  private channelEl: HTMLDivElement;
  private channelLabelEl: HTMLSpanElement;
  private channelPctEl: HTMLSpanElement;
  private channelFillEl: HTMLDivElement;
  private vehicleDashEl: HTMLDivElement;
  private vehicleIconEl: HTMLSpanElement;
  private vehicleTitleEl: HTMLSpanElement;
  private vehicleSpeedEl: HTMLSpanElement;
  private vehicleHpTextEl: HTMLSpanElement;
  private vehicleBoostFillEl: HTMLDivElement;
  private vehicleHpFillEl: HTMLDivElement;
  private vehicleHintEl: HTMLDivElement;
  private campfirePillEl: HTMLDivElement;
  private vitalsStackEl: HTMLDivElement;
  private staminaWrapEl: HTMLDivElement;
  private staminaFillEl: HTMLDivElement;
  private overshieldBarEl: HTMLDivElement;
  private overshieldFillEl: HTMLDivElement;
  private overshieldTextEl: HTMLSpanElement;
  private shieldFillEl: HTMLDivElement;
  private shieldTextEl: HTMLSpanElement;
  private healthFillEl: HTMLDivElement;
  private healthTextEl: HTMLSpanElement;
  private spectatorBarEl: HTMLDivElement;
  private specTargetNameEl: HTMLSpanElement;
  private specShieldFillEl: HTMLDivElement;
  private specShieldTextEl: HTMLSpanElement;
  private specHpFillEl: HTMLDivElement;
  private specHpTextEl: HTMLSpanElement;
  private specElimsEl: HTMLSpanElement;
  private specAliveEl: HTMLSpanElement;

  // Bottom right
  private goldPillEl: HTMLDivElement;
  private goldCountEl: HTMLSpanElement;
  private matEls = new Map<
    MaterialType,
    { root: HTMLDivElement; count: HTMLSpanElement }
  >();
  private buildEls = new Map<BuildPieceType, HTMLDivElement>();
  private buildKeyEls = new Map<BuildPieceType, HTMLSpanElement>();
  private ammoWrapEl: HTMLDivElement;
  private ammoMainEl: HTMLDivElement;
  private ammoResEl: HTMLDivElement;
  private grapplerBadgeEl: HTMLDivElement;
  private grapplerCountEl: HTMLSpanElement;
  private kineticBadgeEl: HTMLDivElement;
  private kineticPipEls: HTMLSpanElement[] = [];
  private slotEls: HTMLDivElement[] = [];

  // Center overlays
  private visualAudioRingEl: HTMLDivElement;
  private tacticalPingEl: HTMLDivElement;
  private tacticalPingIconEl: HTMLSpanElement;
  private tacticalPingLabelEl: HTMLSpanElement;
  private tacticalPingDistEl: HTMLSpanElement;
  private crosshairEl: HTMLDivElement;
  private scopeEl: HTMLDivElement;
  private hitmarkerEl: HTMLDivElement;
  private damageArcWrapEl: HTMLDivElement;
  private damageNumsEl: HTMLDivElement;
  private activeDamageNums: ActiveDamageNum[] = [];
  private editOverlayEl: HTMLDivElement;
  private editConfirmBtn: HTMLButtonElement;
  private editTileEls: HTMLButtonElement[] = [];
  private emoteBackdropEl: HTMLDivElement;
  private pointerPromptEl: HTMLDivElement;
  private pointerSubEl: HTMLDivElement;

  // State caches for diffed DOM updates
  private visible = false;
  private emoteWheelOpen = false;
  private suppressPointerPrompt = false;
  private isDraggingEdit = false;
  private draggedEditTiles = new Set<number>();

  private lastCompassKey = '';
  private lastPhaseHintKey = '';
  private lastFpsDraw = 0;
  private lastFpsVal = -1;
  private lastMinimapDraw = 0;
  private lastStormKey = '';
  private lastAlive = -1;
  private lastKills = -1;
  private lastShield = -1;
  private lastMaxShield = -1;
  private lastOvershield = -1;
  private lastMaxOvershield = -1;
  private lastHealth = -1;
  private lastMaxHealth = -1;
  private lastStamina = -1;
  private lastInteractKey = '';
  private lastChannelKey = '';
  private lastMatKey = '';
  private lastBuildKey = '';
  private lastAmmoKey = '';
  private lastSlotKeys: string[] = ['', '', '', '', '', ''];
  private lastSpreadGap = -1;
  private lastScoped: boolean | null = null;
  private lastBuildCrosshair: boolean | null = null;
  private lastHitmarkerTs = 0;
  private hitmarkerHideAt = 0;
  private lastDamageDirTs = 0;
  private damageArcHideAt = 0;
  private lastEditKey = '';
  private lastPointerPromptVisible: boolean | null = null;
  private lastInStorm: boolean | null = null;
  private lastSpeedLines: boolean | null = null;
  private lastLowHealthPulse = -1;
  private lastKillStreak = 0;
  private lastStormDistKey = '';
  private lastLocationKey = '';
  private lastContextHintKey = '';
  private lastSiphonFlashAt = 0;
  private lastSiphonBusMs = 0;
  private siphonHideAt = 0;
  private lastVehicleKey = '';
  private lastBossKey = '';
  private lastBountyKey = '';
  private lastVaultKeyCount = -1;
  private lastWeatherKey = '';
  private lastGrapplerKey = '';
  private lastSpectatingKey = '';
  private lastModeChipKey = '';
  private lastNearCampfire = false;
  private lastQuestsKey = '';
  private lastVisualAudioKey = '';
  private lastActiveAugmentsKey = '';
  private lastPendingAugmentsKey = '';
  private lastCaptureKey = '';
  private captureCelebrateUntil = 0;
  private captureCelebratePoi = '';
  private celebratedCapturePois = new Set<string>();
  private lastTacticalPingVis: boolean | null = null;
  private lastTacticalPingKey = '';
  private lastGoldBars = -1;
  private lastKineticKey = '';
  private lastAllyKey = '';
  private lastLootIslandKey = '';

  private pointerUpHandler = () => {
    this.isDraggingEdit = false;
    this.draggedEditTiles.clear();
  };

  constructor(
    root: HTMLElement,
    settings: GameSettings,
    callbacks: HUDCallbacks,
  ) {
    this.root = root;
    this.settings = cloneSettings(settings);
    this.callbacks = callbacks;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'fdr-hud fdr-hidden';

    // Storm vignette, speed lines, low-health heartbeat
    this.stormVignetteEl = document.createElement('div');
    this.stormVignetteEl.className = 'fdr-storm-vignette';

    this.speedLinesEl = document.createElement('div');
    this.speedLinesEl.className = 'fdr-speed-lines';

    this.lowHealthVignetteEl = document.createElement('div');
    this.lowHealthVignetteEl.className = 'fdr-low-health-vignette';

    // Top-Left Stack: FPS, Kill-Streak, Vault Key Badge, Active Bounty Card
    const topLeftStack = document.createElement('div');
    topLeftStack.className = 'fdr-top-left-stack';

    this.fpsBadgeEl = document.createElement('div');
    this.fpsBadgeEl.className = 'fdr-fps-badge fdr-hidden';
    this.fpsBadgeEl.textContent = '60 FPS';

    this.killStreakEl = document.createElement('div');
    this.killStreakEl.className = 'fdr-killstreak-badge fdr-hidden';

    this.vaultKeyBadgeEl = document.createElement('div');
    this.vaultKeyBadgeEl.className = 'fdr-vault-key-badge fdr-hidden';
    const vaultKeyIcon = document.createElement('span');
    vaultKeyIcon.className = 'fdr-vault-key-icon';
    vaultKeyIcon.innerHTML = getVaultKeySvg();
    this.vaultKeyTextEl = document.createElement('span');
    this.vaultKeyTextEl.textContent = '1 VAULT KEY';
    this.vaultKeyBadgeEl.append(vaultKeyIcon, this.vaultKeyTextEl);

    this.bountyCardEl = document.createElement('div');
    this.bountyCardEl.className = 'fdr-bounty-card fdr-hidden';
    const bountyHead = document.createElement('div');
    bountyHead.className = 'fdr-bounty-head';
    const bountyIcon = document.createElement('span');
    bountyIcon.className = 'fdr-bounty-icon';
    bountyIcon.innerHTML = getBountyTargetSvg();
    const bountyEyebrow = document.createElement('span');
    bountyEyebrow.textContent = 'BOUNTY TARGET';
    this.bountyTimerEl = document.createElement('span');
    this.bountyTimerEl.className = 'fdr-bounty-timer';
    bountyHead.append(bountyIcon, bountyEyebrow, this.bountyTimerEl);
    this.bountyTargetEl = document.createElement('div');
    this.bountyTargetEl.className = 'fdr-bounty-target';
    const bountyMeta = document.createElement('div');
    bountyMeta.className = 'fdr-bounty-meta';
    this.bountyDistEl = document.createElement('span');
    this.bountyDistEl.className = 'fdr-bounty-dist';
    this.bountyRewardEl = document.createElement('span');
    this.bountyRewardEl.className = 'fdr-bounty-reward';
    bountyMeta.append(this.bountyDistEl, this.bountyRewardEl);
    this.bountyCardEl.append(bountyHead, this.bountyTargetEl, bountyMeta);

    this.allyCardEl = document.createElement('div');
    this.allyCardEl.className = 'fdr-ally-card fdr-hidden';
    const allyHead = document.createElement('div');
    allyHead.className = 'fdr-ally-head';
    this.allyRoleIconEl = document.createElement('span');
    this.allyRoleIconEl.className = 'fdr-ally-role-icon';
    this.allyNameEl = document.createElement('span');
    this.allyNameEl.className = 'fdr-ally-name';
    this.allyRolePillEl = document.createElement('span');
    this.allyRolePillEl.className = 'fdr-ally-role-pill';
    this.allyDistEl = document.createElement('span');
    this.allyDistEl.className = 'fdr-ally-dist';
    allyHead.append(
      this.allyRoleIconEl,
      this.allyNameEl,
      this.allyRolePillEl,
      this.allyDistEl,
    );
    const allyBars = document.createElement('div');
    allyBars.className = 'fdr-ally-bars';
    const allyShieldTrack = document.createElement('div');
    allyShieldTrack.className = 'fdr-ally-track shield';
    this.allyShieldFillEl = document.createElement('div');
    this.allyShieldFillEl.className = 'fdr-ally-fill shield';
    allyShieldTrack.appendChild(this.allyShieldFillEl);
    const allyHpTrack = document.createElement('div');
    allyHpTrack.className = 'fdr-ally-track hp';
    this.allyHpFillEl = document.createElement('div');
    this.allyHpFillEl.className = 'fdr-ally-fill hp';
    allyHpTrack.appendChild(this.allyHpFillEl);
    allyBars.append(allyShieldTrack, allyHpTrack);
    this.allyStatsEl = document.createElement('div');
    this.allyStatsEl.className = 'fdr-ally-stats';
    this.allyCardEl.append(allyHead, allyBars, this.allyStatsEl);

    this.questsPanelEl = document.createElement('div');
    this.questsPanelEl.className = 'fdr-quests-panel fdr-hidden';
    const questsHead = document.createElement('div');
    questsHead.className = 'fdr-quests-head';
    const questsTitle = document.createElement('span');
    questsTitle.textContent = 'MATCH QUESTS';
    this.questsCountEl = document.createElement('span');
    this.questsCountEl.className = 'fdr-quests-count';
    this.questsCountEl.textContent = '0 / 3';
    questsHead.append(questsTitle, this.questsCountEl);
    this.questsListEl = document.createElement('div');
    this.questsListEl.className = 'fdr-quests-list';
    this.questsPanelEl.append(questsHead, this.questsListEl);

    this.activeAugmentsEl = document.createElement('div');
    this.activeAugmentsEl.className = 'fdr-augments-strip fdr-hidden';

    topLeftStack.append(
      this.fpsBadgeEl,
      this.killStreakEl,
      this.vaultKeyBadgeEl,
      this.bountyCardEl,
      this.allyCardEl,
      this.questsPanelEl,
      this.activeAugmentsEl,
    );

    // Compass
    const compassWrap = document.createElement('div');
    compassWrap.className = 'fdr-compass-wrap';
    const centerMark = document.createElement('div');
    centerMark.className = 'fdr-compass-center-mark';
    this.compassTapeEl = document.createElement('div');
    this.compassTapeEl.className = 'fdr-compass-tape';
    this.compassReadoutEl = document.createElement('div');
    this.compassReadoutEl.className = 'fdr-compass-readout';
    this.compassReadoutEl.textContent = '0°';
    compassWrap.append(centerMark, this.compassTapeEl, this.compassReadoutEl);

    // Boss Encounter Healthbar (top-center below compass)
    this.bossBarEl = document.createElement('div');
    this.bossBarEl.className = 'fdr-boss-bar fdr-hidden';
    const bossHead = document.createElement('div');
    bossHead.className = 'fdr-boss-head';
    const bossTitleGroup = document.createElement('div');
    bossTitleGroup.className = 'fdr-boss-title-group';
    const bossCrown = document.createElement('span');
    bossCrown.className = 'fdr-boss-crown';
    bossCrown.innerHTML = getCrownSvg();
    this.bossNameEl = document.createElement('span');
    this.bossNameEl.className = 'fdr-boss-name';
    bossTitleGroup.append(bossCrown, this.bossNameEl);
    const bossRightGroup = document.createElement('div');
    bossRightGroup.className = 'fdr-boss-right-group';
    this.bossStatsEl = document.createElement('span');
    this.bossStatsEl.className = 'fdr-boss-stats';
    this.bossDistEl = document.createElement('span');
    this.bossDistEl.className = 'fdr-boss-dist';
    bossRightGroup.append(this.bossStatsEl, this.bossDistEl);
    bossHead.append(bossTitleGroup, bossRightGroup);

    const bossBars = document.createElement('div');
    bossBars.className = 'fdr-boss-bars';
    const bossShieldTrack = document.createElement('div');
    bossShieldTrack.className = 'fdr-boss-track shield';
    this.bossShieldFillEl = document.createElement('div');
    this.bossShieldFillEl.className = 'fdr-boss-fill shield';
    bossShieldTrack.appendChild(this.bossShieldFillEl);
    const bossHpTrack = document.createElement('div');
    bossHpTrack.className = 'fdr-boss-track hp';
    this.bossHpFillEl = document.createElement('div');
    this.bossHpFillEl.className = 'fdr-boss-fill hp';
    bossHpTrack.appendChild(this.bossHpFillEl);
    bossBars.append(bossShieldTrack, bossHpTrack);
    this.bossBarEl.append(bossHead, bossBars);

    // Phase hint
    this.phaseHintEl = document.createElement('div');
    this.phaseHintEl.className = 'fdr-phase-hint fdr-hidden';
    this.phaseHintTextEl = document.createElement('span');
    this.phaseHintEl.appendChild(this.phaseHintTextEl);

    // Loot Island Active Chip
    this.lootIslandChipEl = document.createElement('div');
    this.lootIslandChipEl.className = 'fdr-loot-island-chip fdr-hidden';
    const lootIslandIcon = document.createElement('span');
    lootIslandIcon.className = 'fdr-loot-island-icon';
    lootIslandIcon.innerHTML = getLootIslandIconSvg();
    this.lootIslandTextEl = document.createElement('span');
    this.lootIslandTextEl.className = 'fdr-loot-island-text';
    this.lootIslandTextEl.textContent = 'LOOT ISLAND • 0M';
    this.lootIslandChipEl.append(lootIslandIcon, this.lootIslandTextEl);

    const topCenterStack = document.createElement('div');
    topCenterStack.className = 'fdr-top-center-stack';
    topCenterStack.append(
      this.phaseHintEl,
      this.lootIslandChipEl,
      this.bossBarEl,
    );

    // Top-Right Minimap Cluster
    const minimapCluster = document.createElement('div');
    minimapCluster.className = 'fdr-minimap-cluster';

    const minimapFrame = document.createElement('div');
    minimapFrame.className = 'fdr-minimap-frame';
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = 220;
    this.minimapCanvas.height = 220;
    this.minimapCanvas.className = 'fdr-minimap-canvas';
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.mapKeyTagEl = document.createElement('div');
    this.mapKeyTagEl.className = 'fdr-minimap-mapkey';
    this.mapKeyTagEl.textContent = 'M • MAP';
    minimapFrame.append(this.minimapCanvas, this.mapKeyTagEl);

    const teleRow = document.createElement('div');
    teleRow.className = 'fdr-telemetry-row';

    this.stormPillEl = document.createElement('div');
    this.stormPillEl.className = 'fdr-tele-pill storm';
    const stormIcon = document.createElement('span');
    stormIcon.style.display = 'inline-flex';
    stormIcon.innerHTML = getStormEyeSvg();
    this.stormTextEl = document.createElement('span');
    this.stormTextEl.textContent = 'P1 0:35';
    this.stormPillEl.append(stormIcon, this.stormTextEl);

    const alivePill = document.createElement('div');
    alivePill.className = 'fdr-tele-pill alive';
    this.aliveTextEl = document.createElement('span');
    this.aliveTextEl.textContent = 'ALIVE 30';
    alivePill.append(this.aliveTextEl);

    const elimsPill = document.createElement('div');
    elimsPill.className = 'fdr-tele-pill elims';
    const skullIcon = document.createElement('span');
    skullIcon.style.display = 'inline-flex';
    skullIcon.innerHTML = getSkullSvg();
    this.elimsTextEl = document.createElement('span');
    this.elimsTextEl.textContent = '0';
    elimsPill.append(skullIcon, this.elimsTextEl);

    teleRow.append(this.stormPillEl, alivePill, elimsPill);

    const zoneMetaRow = document.createElement('div');
    zoneMetaRow.className = 'fdr-zone-meta-row';

    this.modeChipEl = document.createElement('div');
    this.modeChipEl.className = 'fdr-zone-pill mode fdr-hidden';

    this.stormDistEl = document.createElement('div');
    this.stormDistEl.className = 'fdr-zone-pill safe-dist';
    this.stormDistEl.textContent = 'IN SAFE';

    this.locationChipEl = document.createElement('div');
    this.locationChipEl.className = 'fdr-zone-pill location fdr-hidden';

    this.weatherPillEl = document.createElement('div');
    this.weatherPillEl.className = 'fdr-zone-pill weather fdr-hidden';
    this.weatherIconEl = document.createElement('span');
    this.weatherIconEl.className = 'fdr-weather-icon';
    this.weatherTextEl = document.createElement('span');
    this.weatherPillEl.append(this.weatherIconEl, this.weatherTextEl);

    zoneMetaRow.append(
      this.modeChipEl,
      this.stormDistEl,
      this.locationChipEl,
      this.weatherPillEl,
    );
    minimapCluster.append(minimapFrame, teleRow, zoneMetaRow);

    // Reality Augment Picker (middle-right below minimap cluster, above hotbar/materials)
    this.augmentPickerEl = document.createElement('div');
    this.augmentPickerEl.className = 'fdr-augment-picker fdr-hidden';
    const pickerHead = document.createElement('div');
    pickerHead.className = 'fdr-augment-picker-head';
    const pickerTitle = document.createElement('span');
    pickerTitle.className = 'fdr-augment-picker-title';
    pickerTitle.textContent = 'AUGMENT READY';
    const pickerHint = document.createElement('span');
    pickerHint.className = 'fdr-augment-picker-hint';
    pickerHint.textContent = 'CHOOSE [7] OR [8]';
    pickerHead.append(pickerTitle, pickerHint);
    this.augmentPickerEl.appendChild(pickerHead);

    for (const choiceIdx of [0, 1] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fdr-augment-choice';
      btn.dataset.choiceIndex = String(choiceIdx);

      const topRow = document.createElement('div');
      topRow.className = 'fdr-augment-choice-top';

      const keycap = document.createElement('span');
      keycap.className = 'fdr-keycap fdr-augment-key';
      keycap.textContent = choiceIdx === 0 ? '[7]' : '[8]';

      const icon = document.createElement('span');
      icon.className = 'fdr-augment-icon';

      const badge = document.createElement('span');
      badge.className = 'fdr-augment-badge';

      topRow.append(keycap, icon, badge);

      const name = document.createElement('div');
      name.className = 'fdr-augment-name';

      const sub = document.createElement('div');
      sub.className = 'fdr-augment-sub';

      btn.append(topRow, name, sub);
      btn.addEventListener('click', (e) => {
        e.stopPropagation?.();
        this.callbacks.onAugmentSelect?.(choiceIdx);
      });

      this.augmentChoiceEls.push({ btn, icon, badge, name, sub });
      this.augmentPickerEl.appendChild(btn);
    }

    // Bottom-Left Kill Feed
    this.killFeedEl = document.createElement('div');
    this.killFeedEl.className = 'fdr-killfeed';

    // Bottom-Center Vitals
    const bottomCenter = document.createElement('div');
    bottomCenter.className = 'fdr-bottom-center';

    this.contextHintsEl = document.createElement('div');
    this.contextHintsEl.className = 'fdr-context-hints fdr-hidden';

    this.siphonBadgeEl = document.createElement('div');
    this.siphonBadgeEl.className = 'fdr-siphon-badge fdr-hidden';
    this.siphonBadgeEl.textContent = '+50 SIPHON';

    this.captureBarEl = document.createElement('div');
    this.captureBarEl.className = 'fdr-capture-bar fdr-hidden';
    const capTop = document.createElement('div');
    capTop.className = 'fdr-capture-top';
    this.captureIconEl = document.createElement('span');
    this.captureIconEl.className = 'fdr-capture-icon';
    this.captureIconEl.innerHTML = getCaptureFlagIconSvg(false);
    this.captureLabelEl = document.createElement('span');
    this.captureLabelEl.className = 'fdr-capture-label';
    this.captureContestedEl = document.createElement('span');
    this.captureContestedEl.className = 'fdr-capture-contested fdr-hidden';
    this.captureContestedEl.textContent = 'CONTESTED';
    capTop.append(this.captureIconEl, this.captureLabelEl, this.captureContestedEl);
    const capTrack = document.createElement('div');
    capTrack.className = 'fdr-capture-track';
    this.captureFillEl = document.createElement('div');
    this.captureFillEl.className = 'fdr-capture-fill';
    capTrack.appendChild(this.captureFillEl);
    this.captureBarEl.append(capTop, capTrack);

    this.interactEl = document.createElement('div');
    this.interactEl.className = 'fdr-interact-prompt fdr-hidden';
    this.interactKeyEl = document.createElement('span');
    this.interactKeyEl.className = 'fdr-keycap';
    this.interactLabelEl = document.createElement('span');
    this.interactEl.append(this.interactKeyEl, this.interactLabelEl);

    this.channelEl = document.createElement('div');
    this.channelEl.className = 'fdr-channel-bar fdr-hidden';
    const chTop = document.createElement('div');
    chTop.className = 'fdr-channel-label';
    this.channelLabelEl = document.createElement('span');
    this.channelPctEl = document.createElement('span');
    chTop.append(this.channelLabelEl, this.channelPctEl);
    const chTrack = document.createElement('div');
    chTrack.className = 'fdr-channel-track';
    this.channelFillEl = document.createElement('div');
    this.channelFillEl.className = 'fdr-channel-fill';
    chTrack.appendChild(this.channelFillEl);
    this.channelEl.append(chTop, chTrack);

    // Vehicle Dashboard (above vitals when driving)
    this.vehicleDashEl = document.createElement('div');
    this.vehicleDashEl.className = 'fdr-vehicle-dash fdr-hidden';
    const vehHead = document.createElement('div');
    vehHead.className = 'fdr-vehicle-head';
    const vehLeft = document.createElement('div');
    vehLeft.className = 'fdr-vehicle-title-group';
    this.vehicleIconEl = document.createElement('span');
    this.vehicleIconEl.className = 'fdr-vehicle-icon';
    this.vehicleIconEl.innerHTML = getVehicleIconSvg('hover_atv');
    this.vehicleTitleEl = document.createElement('span');
    this.vehicleTitleEl.className = 'fdr-vehicle-title';
    this.vehicleTitleEl.textContent = 'HOVER ATV';
    vehLeft.append(this.vehicleIconEl, this.vehicleTitleEl);
    const vehRight = document.createElement('div');
    vehRight.className = 'fdr-vehicle-readouts';
    this.vehicleSpeedEl = document.createElement('span');
    this.vehicleSpeedEl.className = 'fdr-vehicle-speed';
    this.vehicleSpeedEl.textContent = '0 KM/H';
    this.vehicleHpTextEl = document.createElement('span');
    this.vehicleHpTextEl.className = 'fdr-vehicle-hp-text';
    this.vehicleHpTextEl.textContent = '400 / 400';
    vehRight.append(this.vehicleSpeedEl, this.vehicleHpTextEl);
    vehHead.append(vehLeft, vehRight);

    const vehBars = document.createElement('div');
    vehBars.className = 'fdr-vehicle-bars';
    const boostRow = document.createElement('div');
    boostRow.className = 'fdr-vehicle-bar-row';
    const boostLbl = document.createElement('span');
    boostLbl.className = 'fdr-vehicle-bar-lbl';
    boostLbl.textContent = 'BOOST';
    const boostTrack = document.createElement('div');
    boostTrack.className = 'fdr-vehicle-track';
    this.vehicleBoostFillEl = document.createElement('div');
    this.vehicleBoostFillEl.className = 'fdr-vehicle-fill boost';
    boostTrack.appendChild(this.vehicleBoostFillEl);
    boostRow.append(boostLbl, boostTrack);

    const vHpRow = document.createElement('div');
    vHpRow.className = 'fdr-vehicle-bar-row';
    const vHpLbl = document.createElement('span');
    vHpLbl.className = 'fdr-vehicle-bar-lbl';
    vHpLbl.textContent = 'HULL';
    const vHpTrack = document.createElement('div');
    vHpTrack.className = 'fdr-vehicle-track';
    this.vehicleHpFillEl = document.createElement('div');
    this.vehicleHpFillEl.className = 'fdr-vehicle-fill hp';
    vHpTrack.appendChild(this.vehicleHpFillEl);
    vHpRow.append(vHpLbl, vHpTrack);
    vehBars.append(boostRow, vHpRow);

    this.vehicleHintEl = document.createElement('div');
    this.vehicleHintEl.className = 'fdr-vehicle-hint';
    this.vehicleHintEl.textContent = '[E] EXIT • [SHIFT] BOOST • [H] HORN';
    this.vehicleDashEl.append(vehHead, vehBars, this.vehicleHintEl);

    this.campfirePillEl = document.createElement('div');
    this.campfirePillEl.className = 'fdr-campfire-pill fdr-hidden';
    const campfireIcon = document.createElement('span');
    campfireIcon.className = 'fdr-campfire-pill-icon';
    campfireIcon.innerHTML = getCampfireIconSvg(true);
    const campfireLabel = document.createElement('span');
    campfireLabel.textContent = '+3 HP/S CAMPFIRE';
    this.campfirePillEl.append(campfireIcon, campfireLabel);

    this.vitalsStackEl = document.createElement('div');
    this.vitalsStackEl.className = 'fdr-vitals-stack';

    this.staminaWrapEl = document.createElement('div');
    this.staminaWrapEl.className = 'fdr-stamina-wrap fdr-hidden';
    this.staminaFillEl = document.createElement('div');
    this.staminaFillEl.className = 'fdr-stamina-fill';
    this.staminaWrapEl.appendChild(this.staminaFillEl);

    this.overshieldBarEl = document.createElement('div');
    this.overshieldBarEl.className = 'fdr-vital-bar overshield fdr-hidden';
    this.overshieldFillEl = document.createElement('div');
    this.overshieldFillEl.className = 'fdr-vital-fill overshield';
    const osTxt = document.createElement('div');
    osTxt.className = 'fdr-vital-text';
    const osTagWrap = document.createElement('span');
    osTagWrap.className = 'fdr-os-tag';
    const osIcon = document.createElement('span');
    osIcon.className = 'fdr-os-icon';
    osIcon.innerHTML = getOvershieldBoltSvg();
    const osLabel = document.createElement('span');
    osLabel.textContent = 'OVERSHIELD';
    osTagWrap.append(osIcon, osLabel);
    this.overshieldTextEl = document.createElement('span');
    this.overshieldTextEl.textContent = '50 / 50';
    osTxt.append(osTagWrap, this.overshieldTextEl);
    this.overshieldBarEl.append(this.overshieldFillEl, osTxt);

    const shieldBar = document.createElement('div');
    shieldBar.className = 'fdr-vital-bar';
    this.shieldFillEl = document.createElement('div');
    this.shieldFillEl.className = 'fdr-vital-fill shield';
    const shieldTxt = document.createElement('div');
    shieldTxt.className = 'fdr-vital-text';
    const shieldTag = document.createElement('span');
    shieldTag.textContent = 'SHIELD';
    this.shieldTextEl = document.createElement('span');
    this.shieldTextEl.textContent = '0 / 100';
    shieldTxt.append(shieldTag, this.shieldTextEl);
    shieldBar.append(this.shieldFillEl, shieldTxt);

    const healthBar = document.createElement('div');
    healthBar.className = 'fdr-vital-bar';
    this.healthFillEl = document.createElement('div');
    this.healthFillEl.className = 'fdr-vital-fill health';
    const healthTxt = document.createElement('div');
    healthTxt.className = 'fdr-vital-text';
    const healthTag = document.createElement('span');
    healthTag.textContent = '+ HEALTH';
    this.healthTextEl = document.createElement('span');
    this.healthTextEl.textContent = '100 / 100';
    healthTxt.append(healthTag, this.healthTextEl);
    healthBar.append(this.healthFillEl, healthTxt);

    this.vitalsStackEl.append(
      this.staminaWrapEl,
      this.overshieldBarEl,
      shieldBar,
      healthBar,
    );
    bottomCenter.append(
      this.contextHintsEl,
      this.siphonBadgeEl,
      this.captureBarEl,
      this.interactEl,
      this.channelEl,
      this.vehicleDashEl,
      this.campfirePillEl,
      this.vitalsStackEl,
    );

    // Live Spectator Bar
    this.spectatorBarEl = document.createElement('div');
    this.spectatorBarEl.className = 'fdr-spectator-bar fdr-hidden';
    const specTop = document.createElement('div');
    specTop.className = 'fdr-spec-top';
    const specLeft = document.createElement('div');
    specLeft.className = 'fdr-spec-identity';
    const specTag = document.createElement('span');
    specTag.className = 'fdr-spec-tag';
    specTag.textContent = 'SPECTATING';
    this.specTargetNameEl = document.createElement('span');
    this.specTargetNameEl.className = 'fdr-spec-name';
    specLeft.append(specTag, this.specTargetNameEl);

    const specMeta = document.createElement('div');
    specMeta.className = 'fdr-spec-meta';
    this.specElimsEl = document.createElement('span');
    this.specElimsEl.className = 'fdr-spec-stat elims';
    this.specAliveEl = document.createElement('span');
    this.specAliveEl.className = 'fdr-spec-stat alive';
    specMeta.append(this.specElimsEl, this.specAliveEl);
    specTop.append(specLeft, specMeta);

    const specBars = document.createElement('div');
    specBars.className = 'fdr-spec-bars';
    const specShieldWrap = document.createElement('div');
    specShieldWrap.className = 'fdr-spec-bar';
    this.specShieldFillEl = document.createElement('div');
    this.specShieldFillEl.className = 'fdr-vital-fill shield';
    const specShieldLbl = document.createElement('div');
    specShieldLbl.className = 'fdr-spec-bar-txt';
    const specShieldTag = document.createElement('span');
    specShieldTag.textContent = 'SHIELD';
    this.specShieldTextEl = document.createElement('span');
    specShieldLbl.append(specShieldTag, this.specShieldTextEl);
    specShieldWrap.append(this.specShieldFillEl, specShieldLbl);

    const specHpWrap = document.createElement('div');
    specHpWrap.className = 'fdr-spec-bar';
    this.specHpFillEl = document.createElement('div');
    this.specHpFillEl.className = 'fdr-vital-fill health';
    const specHpLbl = document.createElement('div');
    specHpLbl.className = 'fdr-spec-bar-txt';
    const specHpTag = document.createElement('span');
    specHpTag.textContent = 'HEALTH';
    this.specHpTextEl = document.createElement('span');
    specHpLbl.append(specHpTag, this.specHpTextEl);
    specHpWrap.append(this.specHpFillEl, specHpLbl);
    specBars.append(specShieldWrap, specHpWrap);

    const specActions = document.createElement('div');
    specActions.className = 'fdr-spec-actions';
    const specNextBtn = document.createElement('button');
    specNextBtn.type = 'button';
    specNextBtn.className = 'fdr-spec-btn next';
    specNextBtn.textContent = '[TAB] NEXT PLAYER';
    specNextBtn.addEventListener('click', () => {
      this.callbacks.onSpectateNext?.();
    });
    const specSummaryBtn = document.createElement('button');
    specSummaryBtn.type = 'button';
    specSummaryBtn.className = 'fdr-spec-btn summary';
    specSummaryBtn.textContent = '[ESC] MATCH SUMMARY';
    specSummaryBtn.addEventListener('click', () => {
      this.callbacks.onSpectateMatchSummary?.();
    });
    specActions.append(specNextBtn, specSummaryBtn);
    this.spectatorBarEl.append(specTop, specBars, specActions);

    // Bottom-Right Build & Hotbar
    const bottomRight = document.createElement('div');
    bottomRight.className = 'fdr-bottom-right';

    const buildMatsBar = document.createElement('div');
    buildMatsBar.className = 'fdr-build-mats-bar';

    this.goldPillEl = document.createElement('div');
    this.goldPillEl.className = 'fdr-gold-pill';
    const goldIcon = document.createElement('span');
    goldIcon.className = 'fdr-gold-pill-icon';
    goldIcon.innerHTML = getGoldBarSvg();
    this.goldCountEl = document.createElement('span');
    this.goldCountEl.className = 'fdr-gold-pill-val';
    this.goldCountEl.textContent = '0';
    this.goldPillEl.append(goldIcon, this.goldCountEl);

    const matsStrip = document.createElement('div');
    matsStrip.className = 'fdr-mats-strip';
    for (const mat of MATERIALS) {
      const chip = document.createElement('div');
      chip.className = 'fdr-mat-chip';
      const iconSpan = document.createElement('span');
      iconSpan.style.display = 'inline-flex';
      iconSpan.innerHTML = getMaterialIconSvg(mat);
      const countSpan = document.createElement('span');
      countSpan.textContent = '0';
      chip.append(iconSpan, countSpan);
      matsStrip.appendChild(chip);
      this.matEls.set(mat, { root: chip, count: countSpan });
    }

    const buildTiles = document.createElement('div');
    buildTiles.className = 'fdr-build-tiles';
    for (const bp of BUILD_PIECES) {
      const tile = document.createElement('div');
      tile.className = 'fdr-build-tile';
      const keySpan = document.createElement('span');
      keySpan.className = 'fdr-build-key';
      keySpan.textContent = bp.key;
      const svgWrap = document.createElement('span');
      svgWrap.style.display = 'inline-flex';
      svgWrap.innerHTML = getBuildIconSvg(bp.type);
      tile.append(keySpan, svgWrap);
      buildTiles.appendChild(tile);
      this.buildEls.set(bp.type, tile);
      this.buildKeyEls.set(bp.type, keySpan);
    }

    buildMatsBar.append(this.goldPillEl, matsStrip, buildTiles);

    const hotbarWrap = document.createElement('div');
    hotbarWrap.className = 'fdr-hotbar-wrap';

    this.ammoWrapEl = document.createElement('div');
    this.ammoWrapEl.className = 'fdr-active-ammo fdr-hidden';
    this.ammoMainEl = document.createElement('div');
    this.ammoMainEl.className = 'fdr-ammo-main';
    this.ammoResEl = document.createElement('div');
    this.ammoResEl.className = 'fdr-ammo-res';
    this.ammoWrapEl.append(this.ammoMainEl, this.ammoResEl);

    this.grapplerBadgeEl = document.createElement('div');
    this.grapplerBadgeEl.className = 'fdr-grappler-badge fdr-hidden';
    const grapplerIcon = document.createElement('span');
    grapplerIcon.className = 'fdr-grappler-icon';
    grapplerIcon.innerHTML = getWeaponSvg('grappler');
    const grapplerMeta = document.createElement('div');
    grapplerMeta.className = 'fdr-grappler-meta';
    const grapplerTitle = document.createElement('span');
    grapplerTitle.className = 'fdr-grappler-title';
    grapplerTitle.textContent = 'GRAPPLER';
    this.grapplerCountEl = document.createElement('span');
    this.grapplerCountEl.className = 'fdr-grappler-count';
    this.grapplerCountEl.textContent = '10 CHARGES';
    grapplerMeta.append(grapplerTitle, this.grapplerCountEl);
    this.grapplerBadgeEl.append(grapplerIcon, grapplerMeta);

    this.kineticBadgeEl = document.createElement('div');
    this.kineticBadgeEl.className = 'fdr-kinetic-badge fdr-hidden';
    const kineticIcon = document.createElement('span');
    kineticIcon.className = 'fdr-kinetic-icon';
    kineticIcon.innerHTML = getWeaponSvg('kinetic_blade');
    const kineticMeta = document.createElement('div');
    kineticMeta.className = 'fdr-kinetic-meta';
    const kineticTitle = document.createElement('span');
    kineticTitle.className = 'fdr-kinetic-title';
    kineticTitle.textContent = 'KINETIC DASH';
    const kineticPipsWrap = document.createElement('div');
    kineticPipsWrap.className = 'fdr-kinetic-pips';
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement('span');
      pip.className = 'fdr-kinetic-pip';
      pip.textContent = '⚡';
      this.kineticPipEls.push(pip);
      kineticPipsWrap.appendChild(pip);
    }
    kineticMeta.append(kineticTitle, kineticPipsWrap);
    this.kineticBadgeEl.append(kineticIcon, kineticMeta);

    const hotbarSlots = document.createElement('div');
    hotbarSlots.className = 'fdr-hotbar-slots';
    for (let i = 0; i < 6; i++) {
      const card = document.createElement('div');
      card.className = 'fdr-slot-card';
      card.innerHTML = `<span class="fdr-slot-key">${i + 1}</span>`;
      hotbarSlots.appendChild(card);
      this.slotEls.push(card);
    }

    hotbarWrap.append(
      this.ammoWrapEl,
      this.grapplerBadgeEl,
      this.kineticBadgeEl,
      hotbarSlots,
    );
    bottomRight.append(buildMatsBar, hotbarWrap);

    // Center Tactical Overlays
    this.visualAudioRingEl = document.createElement('div');
    this.visualAudioRingEl.className = 'fdr-visual-audio-ring fdr-hidden';

    this.tacticalPingEl = document.createElement('div');
    this.tacticalPingEl.className = 'fdr-tactical-ping fdr-hidden';
    const pingDiamond = document.createElement('div');
    pingDiamond.className = 'fdr-ping-diamond';
    this.tacticalPingIconEl = document.createElement('span');
    this.tacticalPingIconEl.className = 'fdr-ping-diamond-icon';
    pingDiamond.appendChild(this.tacticalPingIconEl);
    const pingMeta = document.createElement('div');
    pingMeta.className = 'fdr-ping-meta';
    this.tacticalPingLabelEl = document.createElement('span');
    this.tacticalPingLabelEl.className = 'fdr-ping-label';
    this.tacticalPingDistEl = document.createElement('span');
    this.tacticalPingDistEl.className = 'fdr-ping-dist';
    pingMeta.append(this.tacticalPingLabelEl, this.tacticalPingDistEl);
    this.tacticalPingEl.append(pingDiamond, pingMeta);

    this.questToastLayerEl = document.createElement('div');
    this.questToastLayerEl.className = 'fdr-quest-toast-layer';

    this.crosshairEl = document.createElement('div');
    this.crosshairEl.className = 'fdr-crosshair';
    this.crosshairEl.innerHTML = `
      <div class="fdr-ch-dot"></div>
      <div class="fdr-ch-tick top"></div>
      <div class="fdr-ch-tick bottom"></div>
      <div class="fdr-ch-tick left"></div>
      <div class="fdr-ch-tick right"></div>
    `;

    this.scopeEl = document.createElement('div');
    this.scopeEl.className = 'fdr-sniper-scope fdr-hidden';
    this.scopeEl.innerHTML = `
      <div class="fdr-scope-h"></div>
      <div class="fdr-scope-v"></div>
      <div class="fdr-scope-ring"></div>
    `;

    this.hitmarkerEl = document.createElement('div');
    this.hitmarkerEl.className = 'fdr-hitmarker';
    this.hitmarkerEl.innerHTML = `
      <div class="fdr-hm-line tl"></div>
      <div class="fdr-hm-line tr"></div>
      <div class="fdr-hm-line bl"></div>
      <div class="fdr-hm-line br"></div>
    `;

    this.damageArcWrapEl = document.createElement('div');
    this.damageArcWrapEl.className = 'fdr-damage-arc-wrap';
    const arc = document.createElement('div');
    arc.className = 'fdr-damage-arc';
    this.damageArcWrapEl.appendChild(arc);

    this.damageNumsEl = document.createElement('div');
    this.damageNumsEl.className = 'fdr-damage-numbers';

    // 3x3 Edit Mode Overlay
    this.editOverlayEl = document.createElement('div');
    this.editOverlayEl.className = 'fdr-edit-overlay fdr-hidden';
    const editHead = document.createElement('div');
    editHead.className = 'fdr-edit-header';
    editHead.textContent = 'EDIT STRUCTURE (CLICK OR DRAG TILES)';
    const editGrid = document.createElement('div');
    editGrid.className = 'fdr-edit-grid';
    for (let i = 0; i < 9; i++) {
      const tileBtn = document.createElement('button');
      tileBtn.type = 'button';
      tileBtn.className = 'fdr-edit-tile';
      tileBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.isDraggingEdit = true;
        this.draggedEditTiles.clear();
        this.draggedEditTiles.add(i);
        this.callbacks.onEditTileToggle(i);
      });
      tileBtn.addEventListener('mouseenter', () => {
        if (this.isDraggingEdit && !this.draggedEditTiles.has(i)) {
          this.draggedEditTiles.add(i);
          this.callbacks.onEditTileToggle(i);
        }
      });
      this.editTileEls.push(tileBtn);
      editGrid.appendChild(tileBtn);
    }
    const editActions = document.createElement('div');
    editActions.className = 'fdr-edit-actions';
    this.editConfirmBtn = document.createElement('button');
    this.editConfirmBtn.type = 'button';
    this.editConfirmBtn.className = 'fdr-edit-btn confirm';
    this.editConfirmBtn.textContent = 'CONFIRM [G]';
    this.editConfirmBtn.addEventListener('click', () => this.callbacks.onEditConfirm());
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'fdr-edit-btn';
    resetBtn.textContent = 'RESET [RMB]';
    resetBtn.addEventListener('click', () => this.callbacks.onEditReset());
    editActions.append(this.editConfirmBtn, resetBtn);
    this.editOverlayEl.append(editHead, editGrid, editActions);

    // Radial Emote Wheel (supports 6 radial slices cleanly around center)
    this.emoteBackdropEl = document.createElement('div');
    this.emoteBackdropEl.className = 'fdr-emote-wheel-backdrop fdr-hidden';
    const wheel = document.createElement('div');
    wheel.className = 'fdr-emote-wheel';
    const wheelCenter = 195;
    const wheelRadius = 128;
    const sliceW = 108;
    const sliceH = 62;
    EMOTES.forEach((emote, idx) => {
      const meta = getRarityMeta(emote.rarity);
      const angle = -Math.PI / 2 + (idx / Math.max(1, EMOTES.length)) * Math.PI * 2;
      const leftPx = wheelCenter + Math.cos(angle) * wheelRadius - sliceW / 2;
      const topPx = wheelCenter + Math.sin(angle) * wheelRadius - sliceH / 2;
      const slice = document.createElement('button');
      slice.type = 'button';
      slice.className = `fdr-emote-slice rarity-${emote.rarity}`;
      slice.style.left = `${leftPx.toFixed(1)}px`;
      slice.style.top = `${topPx.toFixed(1)}px`;
      slice.style.width = `${sliceW}px`;
      slice.style.height = `${sliceH}px`;
      slice.innerHTML = `
        <span style="font-size:10px;font-weight:800;opacity:0.9">${meta.label}</span>
        <span style="font-size:14px;font-weight:800;line-height:1.05">${emote.name}</span>
        <span style="font-size:10px;opacity:0.85">${emote.bpm} BPM</span>
      `;
      slice.addEventListener('click', () => {
        this.setEmoteWheelOpen(false);
        this.callbacks.onEmoteSelect(emote.id);
      });
      wheel.appendChild(slice);
    });
    const centerCancel = document.createElement('button');
    centerCancel.type = 'button';
    centerCancel.className = 'fdr-emote-center';
    centerCancel.textContent = 'CLOSE';
    centerCancel.addEventListener('click', () => {
      this.setEmoteWheelOpen(false);
    });
    wheel.appendChild(centerCancel);
    this.emoteBackdropEl.appendChild(wheel);
    this.emoteBackdropEl.addEventListener('click', (e) => {
      if (e.target === this.emoteBackdropEl) {
        this.setEmoteWheelOpen(false);
      }
    });

    // Pointer lock prompt
    this.pointerPromptEl = document.createElement('div');
    this.pointerPromptEl.className = 'fdr-pointer-prompt fdr-hidden';
    const ptrTitle = document.createElement('div');
    ptrTitle.className = 'fdr-pointer-title';
    ptrTitle.textContent = 'CLICK SCREEN TO AIM & PLAY';
    this.pointerSubEl = document.createElement('div');
    this.pointerSubEl.className = 'fdr-pointer-sub';
    this.pointerSubEl.textContent = 'ESC / P: PAUSE • M: TACTICAL MAP • B: EMOTES';
    this.pointerPromptEl.append(ptrTitle, this.pointerSubEl);

    this.containerEl.append(
      this.speedLinesEl,
      this.lowHealthVignetteEl,
      this.stormVignetteEl,
      topLeftStack,
      compassWrap,
      topCenterStack,
      minimapCluster,
      this.augmentPickerEl,
      this.killFeedEl,
      bottomCenter,
      this.spectatorBarEl,
      bottomRight,
      this.tacticalPingEl,
      this.crosshairEl,
      this.visualAudioRingEl,
      this.scopeEl,
      this.hitmarkerEl,
      this.damageArcWrapEl,
      this.damageNumsEl,
      this.questToastLayerEl,
      this.editOverlayEl,
      this.emoteBackdropEl,
      this.pointerPromptEl,
    );

    this.root.appendChild(this.containerEl);
    this.applySettingsKeybinds();
    this.applyCrosshairSettings();

    if (typeof window !== 'undefined') {
      window.addEventListener('mouseup', this.pointerUpHandler);
    }
  }

  setCallbacks(callbacks: HUDCallbacks): void {
    this.callbacks = callbacks;
  }

  setSettings(settings: GameSettings): void {
    this.settings = cloneSettings(settings);
    if (!this.settings.showFps) {
      this.fpsBadgeEl.classList.add('fdr-hidden');
    }
    this.lastVisualAudioKey = '__dirty__';
    if (this.settings.visualAudio === false) {
      this.visualAudioRingEl.classList.add('fdr-hidden');
      this.visualAudioRingEl.innerHTML = '';
    }
    this.applySettingsKeybinds();
    this.applyCrosshairSettings();
  }

  private applyCrosshairSettings(): void {
    const color = resolveCrosshairColor(this.settings.crosshairColor);
    const style = resolveCrosshairStyle(this.settings.crosshairStyle);
    this.crosshairEl.style.setProperty('--ch-color', color);
    this.crosshairEl.dataset.chStyle = style;
    this.crosshairEl.classList.remove(
      'style-dynamic',
      'style-dot',
      'style-classic',
    );
    this.crosshairEl.classList.add(`style-${style}`);
    this.lastSpreadGap = -1;
  }

  private applySettingsKeybinds(): void {
    const kb = resolveKeybinds(this.settings.keybinds);
    const mapKey = formatKeyCodeLabel(kb.map);
    const emoteKey = formatKeyCodeLabel(kb.emote);
    const editKey = formatKeyCodeLabel(kb.edit);
    const interactKey = formatKeyCodeLabel(kb.interact);

    this.mapKeyTagEl.textContent = `${mapKey} • MAP`;
    this.buildKeyEls.get('wall')!.textContent = formatKeyCodeLabel(kb.buildWall);
    this.buildKeyEls.get('floor')!.textContent = formatKeyCodeLabel(kb.buildFloor);
    this.buildKeyEls.get('ramp')!.textContent = formatKeyCodeLabel(kb.buildRamp);
    this.buildKeyEls.get('roof')!.textContent = formatKeyCodeLabel(kb.buildRoof);
    this.editConfirmBtn.textContent = `CONFIRM [${editKey}]`;
    this.pointerSubEl.textContent = `ESC / P: PAUSE • ${mapKey}: TACTICAL MAP • ${emoteKey}: EMOTES`;
    this.vehicleHintEl.textContent = `[${interactKey}] EXIT • [SHIFT] BOOST • [H] HORN`;

    this.lastContextHintKey = '';
    this.lastVehicleKey = '';
  }

  setTerrainMapCanvas(canvas: HTMLCanvasElement): void {
    this.terrainMapCanvas = canvas;
    this.lastMinimapDraw = 0;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.containerEl.classList.toggle('fdr-hidden', !visible);
    if (!visible) {
      this.setEmoteWheelOpen(false);
    }
  }

  clearTransient(): void {
    for (const item of this.killFeedItems) {
      item.el.remove();
    }
    this.killFeedItems = [];
    for (const dn of this.activeDamageNums) {
      dn.el.remove();
    }
    this.activeDamageNums = [];
    this.hitmarkerHideAt = 0;
    this.lastHitmarkerTs = 0;
    this.hitmarkerEl.classList.remove('active');
    this.damageArcHideAt = 0;
    this.lastDamageDirTs = 0;
    this.damageArcWrapEl.style.opacity = '0';
    this.siphonHideAt = 0;
    this.lastSiphonFlashAt = 0;
    this.lastSiphonBusMs = 0;
    this.siphonBadgeEl.classList.add('fdr-hidden');
    this.killStreakEl.classList.add('fdr-hidden');
    this.lastKillStreak = 0;
    this.speedLinesEl.classList.remove('active');
    this.lastSpeedLines = null;
    this.lowHealthVignetteEl.classList.remove('active');
    this.lowHealthVignetteEl.style.opacity = '0';
    this.lastLowHealthPulse = -1;
    this.contextHintsEl.classList.add('fdr-hidden');
    this.lastContextHintKey = '';
    this.vehicleDashEl.classList.add('fdr-hidden');
    this.lastVehicleKey = '';
    this.bossBarEl.classList.add('fdr-hidden');
    this.lastBossKey = '';
    this.bountyCardEl.classList.add('fdr-hidden');
    this.lastBountyKey = '';
    this.vaultKeyBadgeEl.classList.add('fdr-hidden');
    this.lastVaultKeyCount = -1;
    this.weatherPillEl.classList.add('fdr-hidden');
    this.lastWeatherKey = '';
    this.grapplerBadgeEl.classList.add('fdr-hidden');
    this.lastGrapplerKey = '';
    this.spectatorBarEl.classList.add('fdr-hidden');
    this.vitalsStackEl.classList.remove('fdr-hidden');
    this.lastSpectatingKey = '';
    this.overshieldBarEl.classList.add('fdr-hidden');
    this.lastOvershield = -1;
    this.lastMaxOvershield = -1;
    this.modeChipEl.classList.add('fdr-hidden');
    this.lastModeChipKey = '';
    this.campfirePillEl.classList.add('fdr-hidden');
    this.lastNearCampfire = false;
    this.questsPanelEl.classList.add('fdr-hidden');
    this.questsListEl.innerHTML = '';
    this.lastQuestsKey = '';
    this.visualAudioRingEl.classList.add('fdr-hidden');
    this.visualAudioRingEl.innerHTML = '';
    this.lastVisualAudioKey = '';
    this.activeAugmentsEl.classList.add('fdr-hidden');
    this.activeAugmentsEl.innerHTML = '';
    this.lastActiveAugmentsKey = '';
    this.augmentPickerEl.classList.add('fdr-hidden');
    this.lastPendingAugmentsKey = '';
    this.captureBarEl.classList.add('fdr-hidden');
    this.captureBarEl.classList.remove('captured', 'contested');
    this.lastCaptureKey = '';
    this.captureCelebrateUntil = 0;
    this.captureCelebratePoi = '';
    this.celebratedCapturePois.clear();
    this.tacticalPingEl.classList.add('fdr-hidden');
    this.lastTacticalPingVis = false;
    this.lastTacticalPingKey = '';
    this.lastGoldBars = -1;
    this.goldCountEl.textContent = '0';
    this.kineticBadgeEl.classList.add('fdr-hidden');
    this.lastKineticKey = '';
    this.allyCardEl.classList.add('fdr-hidden');
    this.lastAllyKey = '';
    this.lootIslandChipEl.classList.add('fdr-hidden');
    this.lastLootIslandKey = '';
    for (const timer of this.activeQuestToastTimers) {
      clearTimeout(timer);
    }
    this.activeQuestToastTimers.clear();
    this.questToastLayerEl.innerHTML = '';
  }

  showQuestCompleteToast(quest: MatchQuest): void {
    const toast = document.createElement('div');
    toast.className = 'fdr-quest-toast';
    toast.dataset.questId = quest.id;

    const badge = document.createElement('span');
    badge.className = 'fdr-quest-toast-badge';
    badge.textContent = '✓';

    const textCol = document.createElement('div');
    textCol.className = 'fdr-quest-toast-text';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'fdr-quest-toast-eyebrow';
    eyebrow.textContent = 'QUEST COMPLETE';

    const titleEl = document.createElement('div');
    titleEl.className = 'fdr-quest-toast-title';
    titleEl.textContent = quest.title;

    textCol.append(eyebrow, titleEl);

    const xpBadge = document.createElement('div');
    xpBadge.className = 'fdr-quest-toast-xp';
    xpBadge.textContent = `+${Math.max(0, Math.round(quest.xpReward))} XP`;

    toast.append(badge, textCol, xpBadge);
    this.questToastLayerEl.appendChild(toast);

    while (this.questToastLayerEl.children.length > 2) {
      this.questToastLayerEl.firstElementChild?.remove();
    }

    const timer = setTimeout(() => {
      this.activeQuestToastTimers.delete(timer);
      toast.remove();
    }, 3400);
    this.activeQuestToastTimers.add(timer);
  }

  triggerSiphonFlash(
    amount = 50,
    healthAdded = 0,
    shieldAdded = 0,
    fromBus = false,
  ): void {
    const now = performance.now();
    if (fromBus) {
      this.lastSiphonBusMs = now;
    }
    const safeAmt = Math.max(1, Math.round(Number.isFinite(amount) ? amount : 50));
    const parts: string[] = [];
    if (healthAdded > 0) parts.push(`+${Math.round(healthAdded)} HP`);
    if (shieldAdded > 0) parts.push(`+${Math.round(shieldAdded)} SHD`);
    const sub = parts.length > 0 ? ` (${parts.join(' ')})` : '';
    this.siphonBadgeEl.textContent = `+${safeAmt} SIPHON${sub}`;
    this.siphonBadgeEl.classList.remove('fdr-hidden', 'pop');
    // Force reflow when running in DOM to replay pop animation
    void this.siphonBadgeEl.offsetWidth;
    this.siphonBadgeEl.classList.add('pop');
    this.siphonHideAt = now + 1850;
  }

  setOverlaySuppressed(suppressed: boolean): void {
    this.suppressPointerPrompt = suppressed;
    if (suppressed) {
      this.pointerPromptEl.classList.add('fdr-hidden');
      this.lastPointerPromptVisible = false;
    }
  }

  isEmoteWheelOpen(): boolean {
    return this.emoteWheelOpen;
  }

  setEmoteWheelOpen(open: boolean): boolean {
    this.emoteWheelOpen = open;
    this.emoteBackdropEl.classList.toggle('fdr-hidden', !open);
    this.lastVisualAudioKey = '__dirty__';
    if (open) {
      this.visualAudioRingEl.classList.add('fdr-hidden');
    }
    return this.emoteWheelOpen;
  }

  toggleEmoteWheel(force?: boolean): boolean {
    const next = typeof force === 'boolean' ? force : !this.emoteWheelOpen;
    return this.setEmoteWheelOpen(next);
  }

  triggerHitmarker(fb: HitmarkerFeedback): void {
    this.lastHitmarkerTs = fb.timestamp || Date.now();
    this.hitmarkerHideAt = performance.now() + (fb.isElimination ? 320 : 210);
    this.hitmarkerEl.classList.remove('shield', 'headshot', 'elim');
    if (fb.isElimination) {
      this.hitmarkerEl.classList.add('elim');
    } else if (fb.isHeadshot) {
      this.hitmarkerEl.classList.add('headshot');
    } else if (fb.isShield) {
      this.hitmarkerEl.classList.add('shield');
    }
    this.hitmarkerEl.classList.add('active');
  }

  addKillFeed(entry: KillFeedEntry): void {
    const row = document.createElement('div');
    row.className = `fdr-kf-row${entry.involvesPlayer ? ' player-involved' : ''}`;

    const killerSpan = document.createElement('span');
    killerSpan.className = 'fdr-kf-name';
    killerSpan.style.color = entry.involvesPlayer ? '#ffd000' : '#f8fafc';
    killerSpan.textContent = entry.isStorm ? 'THE STORM' : entry.killerName;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'fdr-kf-icon';
    iconSpan.innerHTML = entry.isStorm
      ? getStormEyeSvg()
      : getWeaponSvg(entry.weaponId);

    row.append(killerSpan, iconSpan);

    if (entry.isHeadshot) {
      const hsSpan = document.createElement('span');
      hsSpan.className = 'fdr-kf-hs';
      hsSpan.textContent = 'HS';
      row.appendChild(hsSpan);
    }

    const victimSpan = document.createElement('span');
    victimSpan.className = 'fdr-kf-name';
    victimSpan.style.color = '#fca5a5';
    victimSpan.textContent = entry.victimName;
    row.appendChild(victimSpan);

    if (entry.distance > 0 && !entry.isStorm) {
      const distSpan = document.createElement('span');
      distSpan.className = 'fdr-kf-dist';
      distSpan.textContent = `${Math.round(entry.distance)}m`;
      row.appendChild(distSpan);
    }

    this.killFeedEl.appendChild(row);
    this.killFeedItems.push({
      entry,
      el: row,
      expiresAt: performance.now() + 7000,
    });

    while (this.killFeedItems.length > 5) {
      const oldest = this.killFeedItems.shift();
      oldest?.el.remove();
    }
  }

  addDamageNumber(event: DamageNumberEvent): void {
    if (event.visible === false) return;
    const x =
      typeof event.screenX === 'number'
        ? event.screenX
        : (typeof window !== 'undefined' ? window.innerWidth : 1280) * 0.5;
    const y =
      typeof event.screenY === 'number'
        ? event.screenY
        : (typeof window !== 'undefined' ? window.innerHeight : 720) * 0.48;

    const jitterX = (Math.random() - 0.5) * 18;
    const el = document.createElement('div');
    el.className = `fdr-dmg-num${event.isHeadshot ? ' headshot' : event.isShield ? ' shield' : ''}`;
    el.textContent = String(Math.round(event.amount));
    el.style.left = `${x + jitterX}px`;
    el.style.top = `${y}px`;
    this.damageNumsEl.appendChild(el);

    this.activeDamageNums.push({
      id: event.id,
      el,
      createdAt: performance.now(),
      baseX: x + jitterX,
      baseY: y,
    });

    while (this.activeDamageNums.length > 18) {
      const old = this.activeDamageNums.shift();
      old?.el.remove();
    }
  }

  update(state: HUDState): void {
    if (!this.visible) return;
    const now = performance.now();

    this.updateTransientAnimations(now);
    this.updateStormVignette(state.inStorm);
    this.updateTacticalOverlays(state, now);
    this.updateFps(state.fps, now);
    this.updateCompass(state);
    this.updatePhaseHint(state);
    this.updateTelemetry(state);
    this.updateVitals(state);
    this.updateInteractAndChannel(state);
    this.updateMaterialsAndBuilds(state);
    this.updateHotbar(state);
    this.updateWave2HUD(state);
    this.updateWave3HUD(state);
    this.updateWave4HUD(state, now);
    this.updateWave5HUD(state);
    this.updateCenterCombat(state, now);
    this.updateEditGrid(state);
    this.updatePointerPrompt(state);

    // Minimap redrawn at ~24Hz for smooth locked 60 FPS
    if (now - this.lastMinimapDraw >= 40) {
      this.lastMinimapDraw = now;
      this.drawMinimap(state);
    }
  }

  private updateTransientAnimations(now: number): void {
    // Prune kill feed
    while (
      this.killFeedItems.length > 0 &&
      this.killFeedItems[0].expiresAt <= now
    ) {
      const item = this.killFeedItems.shift();
      item?.el.remove();
    }

    // Animate damage numbers
    for (let i = this.activeDamageNums.length - 1; i >= 0; i--) {
      const dn = this.activeDamageNums[i];
      const age = now - dn.createdAt;
      const life = 850;
      if (age >= life) {
        dn.el.remove();
        this.activeDamageNums.splice(i, 1);
        continue;
      }
      const t = age / life;
      const offsetY = -44 * (1 - (1 - t) * (1 - t));
      const opacity = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      dn.el.style.transform = `translate(-50%, calc(-50% + ${offsetY.toFixed(1)}px)) scale(${(1.12 - t * 0.22).toFixed(2)})`;
      dn.el.style.opacity = opacity.toFixed(2);
    }

    // Hide expired hitmarker
    if (this.hitmarkerHideAt > 0 && now >= this.hitmarkerHideAt) {
      this.hitmarkerHideAt = 0;
      this.hitmarkerEl.classList.remove('active');
    }

    // Hide expired siphon badge
    if (this.siphonHideAt > 0 && now >= this.siphonHideAt) {
      this.siphonHideAt = 0;
      this.siphonBadgeEl.classList.add('fdr-hidden');
      this.siphonBadgeEl.classList.remove('pop');
    }

    // Fade directional damage arc
    if (this.damageArcHideAt > 0) {
      const rem = this.damageArcHideAt - now;
      if (rem <= 0) {
        this.damageArcHideAt = 0;
        this.damageArcWrapEl.style.opacity = '0';
      } else {
        this.damageArcWrapEl.style.opacity = Math.min(1, rem / 800).toFixed(2);
      }
    }
  }

  private updateStormVignette(inStorm: boolean): void {
    if (this.lastInStorm === inStorm) return;
    this.lastInStorm = inStorm;
    this.stormVignetteEl.classList.toggle('active', inStorm);
  }

  private updateTacticalOverlays(state: HUDState, now: number): void {
    const showSpeed = Boolean(state.showSpeedLines);
    if (this.lastSpeedLines !== showSpeed) {
      this.lastSpeedLines = showSpeed;
      this.speedLinesEl.classList.toggle('active', showSpeed);
    }

    const pulseRaw = state.lowHealthPulse ?? 0;
    const pulse =
      typeof pulseRaw === 'number' && Number.isFinite(pulseRaw)
        ? Math.max(0, Math.min(1, pulseRaw))
        : 0;
    const pulseRounded = Math.round(pulse * 100);
    if (pulseRounded !== this.lastLowHealthPulse) {
      this.lastLowHealthPulse = pulseRounded;
      if (pulse > 0) {
        this.lowHealthVignetteEl.classList.add('active');
        this.lowHealthVignetteEl.style.opacity = (0.35 + pulse * 0.65).toFixed(2);
      } else {
        this.lowHealthVignetteEl.classList.remove('active');
        this.lowHealthVignetteEl.style.opacity = '0';
      }
    }

    if (
      typeof state.siphonFlashAt === 'number' &&
      Number.isFinite(state.siphonFlashAt) &&
      state.siphonFlashAt > this.lastSiphonFlashAt
    ) {
      this.lastSiphonFlashAt = state.siphonFlashAt;
      if (now - this.lastSiphonBusMs > 150) {
        this.triggerSiphonFlash(50, 0, 0, false);
      }
    }

    const ks = Math.max(0, Math.floor(state.killStreak ?? 0));
    if (ks !== this.lastKillStreak) {
      this.lastKillStreak = ks;
      const callout = getKillStreakCallout(ks);
      if (!callout) {
        this.killStreakEl.classList.add('fdr-hidden');
      } else {
        this.killStreakEl.className = `fdr-killstreak-badge tier-${callout.tier.toLowerCase()}`;
        this.killStreakEl.innerHTML = `<span class="fdr-ks-count">${callout.streak}X</span><span class="fdr-ks-label">${callout.label}</span>`;
      }
    }

    const hints = getContextualHudHints(state, this.settings.keybinds);
    const hintKey = hints.map((h) => `${h.id}:${h.key}`).join(':');
    if (hintKey !== this.lastContextHintKey) {
      this.lastContextHintKey = hintKey;
      this.contextHintsEl.classList.toggle('fdr-hidden', hints.length === 0);
      this.contextHintsEl.innerHTML = hints
        .map(
          (h) =>
            `<div class="fdr-ctx-chip tone-${h.tone}"><span class="fdr-keycap">${h.key}</span><span>${h.label}</span></div>`,
        )
        .join('');
    }
  }

  private updateFps(fps: number, now: number): void {
    if (!this.settings.showFps) return;
    this.fpsBadgeEl.classList.remove('fdr-hidden');
    if (now - this.lastFpsDraw < 250) return;
    this.lastFpsDraw = now;
    const rounded = Math.round(fps);
    if (rounded !== this.lastFpsVal) {
      this.lastFpsVal = rounded;
      this.fpsBadgeEl.textContent = `${rounded} FPS`;
    }
  }

  private updateCompass(state: HUDState): void {
    const heading = Math.round(state.compassHeading * 2) / 2;
    const wpBearing = state.mapWaypoint
      ? Math.round(
          getBearingDeg(
            state.playerPos.x,
            state.playerPos.z,
            state.mapWaypoint.x,
            state.mapWaypoint.z,
          ),
        )
      : -1;
    const key = `${heading}:${wpBearing}`;
    if (key === this.lastCompassKey) return;
    this.lastCompassKey = key;

    const spanDeg = 120;
    const ticks = formatCompassTicks(heading, spanDeg, 15);
    let html = '';
    for (const tick of ticks) {
      const cls = tick.isCardinal
        ? 'fdr-compass-tick cardinal'
        : tick.isOrdinal
          ? 'fdr-compass-tick ordinal'
          : 'fdr-compass-tick';
      html += `<div class="${cls}" style="left:${(tick.normX * 100).toFixed(2)}%">${tick.label}</div>`;
    }

    if (wpBearing >= 0) {
      let diff = ((wpBearing - heading + 540) % 360) - 180;
      if (Math.abs(diff) <= spanDeg / 2) {
        const pct = (0.5 + diff / spanDeg) * 100;
        html += `<div class="fdr-compass-waypoint" style="left:${pct.toFixed(2)}%"></div>`;
      }
    }

    this.compassTapeEl.innerHTML = html;
    this.compassReadoutEl.textContent = `${Math.round(heading)}°`;
  }

  private updatePhaseHint(state: HUDState): void {
    let text = '';
    if (state.phase === 'bus' && state.canJumpBus) {
      text = 'PRESS [SPACE] TO JUMP FROM BATTLE BUS';
    } else if (state.phase === 'skydiving' && state.canDeployGlider) {
      text = 'PRESS [SPACE] TO DEPLOY GLIDER';
    } else if (state.phase === 'gliding') {
      text = 'GLIDING • STEER WITH WASD';
    }
    if (text === this.lastPhaseHintKey) return;
    this.lastPhaseHintKey = text;
    this.phaseHintEl.classList.toggle('fdr-hidden', !text);
    if (text) {
      this.phaseHintTextEl.textContent = text;
    }
  }

  private updateTelemetry(state: HUDState): void {
    const s = state.stormState;
    const stormStr = `${s.isShrinking ? 'SHRINK' : `P${s.phase}`} ${formatCountdown(s.phaseTimeRemaining)}`;
    const stormKey = `${stormStr}:${s.isShrinking || state.inStorm ? 1 : 0}`;
    if (stormKey !== this.lastStormKey) {
      this.lastStormKey = stormKey;
      this.stormTextEl.textContent = stormStr;
      this.stormPillEl.classList.toggle(
        'shrinking',
        s.isShrinking || state.inStorm,
      );
    }

    if (state.aliveCount !== this.lastAlive) {
      this.lastAlive = state.aliveCount;
      this.aliveTextEl.textContent = `ALIVE ${state.aliveCount}`;
    }

    if (state.kills !== this.lastKills) {
      this.lastKills = state.kills;
      this.elimsTextEl.textContent = String(state.kills);
    }

    const rawDist =
      typeof state.stormDistance === 'number' &&
      Number.isFinite(state.stormDistance)
        ? state.stormDistance
        : computeFallbackStormDistance(
            state.playerPos.x,
            state.playerPos.z,
            s,
          );
    const zoneInfo = formatSafeZoneDistance(rawDist, state.inStorm);
    const zoneKey = `${zoneInfo.text}:${zoneInfo.isOutside ? 1 : 0}`;
    if (zoneKey !== this.lastStormDistKey) {
      this.lastStormDistKey = zoneKey;
      this.stormDistEl.textContent = zoneInfo.text;
      this.stormDistEl.classList.toggle('outside', zoneInfo.isOutside);
    }

    const poiName = state.currentPoiName
      ? state.currentPoiName.trim().toUpperCase()
      : '';
    const biomeLabel = formatBiomeLabel(state.currentBiome);
    const locKey = `${poiName}:${biomeLabel}`;
    if (locKey !== this.lastLocationKey) {
      this.lastLocationKey = locKey;
      if (!poiName && !biomeLabel) {
        this.locationChipEl.classList.add('fdr-hidden');
      } else {
        this.locationChipEl.classList.remove('fdr-hidden');
        this.locationChipEl.classList.toggle('poi', Boolean(poiName));
        this.locationChipEl.textContent =
          poiName && biomeLabel
            ? `${poiName} • ${biomeLabel}`
            : poiName || biomeLabel;
      }
    }
  }

  private updateVitals(state: HUDState): void {
    const maxOs =
      typeof state.maxOvershield === 'number' &&
      Number.isFinite(state.maxOvershield) &&
      state.maxOvershield > 0
        ? Math.round(state.maxOvershield)
        : 0;
    const os =
      maxOs > 0
        ? Math.max(0, Math.min(maxOs, Math.round(state.overshield ?? 0)))
        : 0;
    if (os !== this.lastOvershield || maxOs !== this.lastMaxOvershield) {
      this.lastOvershield = os;
      this.lastMaxOvershield = maxOs;
      this.overshieldBarEl.classList.toggle('fdr-hidden', maxOs <= 0);
      if (maxOs > 0) {
        this.overshieldFillEl.style.width = `${computeOvershieldPct(os, maxOs).toFixed(1)}%`;
        this.overshieldTextEl.textContent = `${os} / ${maxOs}`;
      }
    }

    const shield = Math.max(0, Math.round(state.shield));
    const maxShield = Math.max(1, Math.round(state.maxShield));
    if (shield !== this.lastShield || maxShield !== this.lastMaxShield) {
      this.lastShield = shield;
      this.lastMaxShield = maxShield;
      this.shieldFillEl.style.width = `${Math.min(100, (shield / maxShield) * 100)}%`;
      this.shieldTextEl.textContent = `${shield} / ${maxShield}`;
    }

    const hp = Math.max(0, Math.round(state.health));
    const maxHp = Math.max(1, Math.round(state.maxHealth));
    if (hp !== this.lastHealth || maxHp !== this.lastMaxHealth) {
      this.lastHealth = hp;
      this.lastMaxHealth = maxHp;
      this.healthFillEl.style.width = `${Math.min(100, (hp / maxHp) * 100)}%`;
      this.healthFillEl.classList.toggle('low', hp <= 30);
      this.healthTextEl.textContent = `${hp} / ${maxHp}`;
    }

    const stamina = Math.max(0, Math.min(100, Math.round(state.stamina)));
    if (stamina !== this.lastStamina) {
      this.lastStamina = stamina;
      this.staminaWrapEl.classList.toggle(
        'fdr-hidden',
        stamina >= 99 && !state.isSprinting,
      );
      this.staminaFillEl.style.width = `${stamina}%`;
    }
  }

  private updateInteractAndChannel(state: HUDState): void {
    const ip = state.interactPrompt;
    const iKey = ip ? `${ip.key}:${ip.label}:${ip.rarity ?? ''}` : '';
    if (iKey !== this.lastInteractKey) {
      this.lastInteractKey = iKey;
      this.interactEl.classList.toggle('fdr-hidden', !ip);
      if (ip) {
        this.interactKeyEl.textContent = ip.key;
        this.interactLabelEl.textContent = ip.label;
        this.interactEl.style.borderColor = ip.rarity
          ? getRarityMeta(ip.rarity).border
          : '#22d3ee';
      }
    }

    let chLabel = '';
    let chProg: number | null = null;
    if (state.healProgress !== null) {
      chLabel = state.healLabel || 'HEALING';
      chProg = state.healProgress;
    } else if (state.reloadProgress !== null) {
      chLabel = 'RELOADING';
      chProg = state.reloadProgress;
    }

    const pct = chProg !== null ? Math.max(0, Math.min(100, Math.round(chProg * 100))) : -1;
    const cKey = `${chLabel}:${pct}`;
    if (cKey !== this.lastChannelKey) {
      this.lastChannelKey = cKey;
      this.channelEl.classList.toggle('fdr-hidden', chProg === null);
      if (chProg !== null) {
        this.channelLabelEl.textContent = chLabel;
        this.channelPctEl.textContent = `${pct}%`;
        this.channelFillEl.style.width = `${pct}%`;
      }
    }
  }

  private updateMaterialsAndBuilds(state: HUDState): void {
    const matKey = `${state.materials.wood}:${state.materials.brick}:${state.materials.metal}:${state.activeMaterial}:${state.isBuildMode ? 1 : 0}`;
    if (matKey !== this.lastMatKey) {
      this.lastMatKey = matKey;
      for (const mat of MATERIALS) {
        const entry = this.matEls.get(mat);
        if (!entry) continue;
        entry.count.textContent = String(Math.floor(state.materials[mat] ?? 0));
        entry.root.classList.toggle(
          'active',
          state.isBuildMode && state.activeMaterial === mat,
        );
      }
    }

    const buildKey = `${state.isBuildMode ? 1 : 0}:${state.activeBuildType}`;
    if (buildKey !== this.lastBuildKey) {
      this.lastBuildKey = buildKey;
      for (const bp of BUILD_PIECES) {
        const tile = this.buildEls.get(bp.type);
        tile?.classList.toggle(
          'active',
          state.isBuildMode && state.activeBuildType === bp.type,
        );
      }
    }
  }

  private updateHotbar(state: HUDState): void {
    const activeItem: ItemInstance | null = state.slots[state.activeSlot] ?? null;
    const def = activeItem ? WEAPONS[activeItem.weaponId] : null;
    let ammoKey = 'none';
    if (activeItem && def && def.ammoType && !state.isBuildMode) {
      const reserve = state.ammo[def.ammoType] ?? 0;
      ammoKey = `${activeItem.magAmmo}/${reserve}`;
    }
    if (ammoKey !== this.lastAmmoKey) {
      this.lastAmmoKey = ammoKey;
      if (ammoKey === 'none' || !activeItem || !def || !def.ammoType) {
        this.ammoWrapEl.classList.add('fdr-hidden');
      } else {
        this.ammoWrapEl.classList.remove('fdr-hidden');
        this.ammoMainEl.textContent = String(activeItem.magAmmo);
        this.ammoResEl.textContent = `/ ${state.ammo[def.ammoType] ?? 0}`;
      }
    }

    for (let i = 0; i < 6; i++) {
      const item = state.slots[i] ?? null;
      const isActive = !state.isBuildMode && state.activeSlot === i;
      const sig = item
        ? `${item.uid}:${item.weaponId}:${item.rarity}:${item.magAmmo}:${item.stackCount}:${isActive ? 1 : 0}`
        : `empty:${isActive ? 1 : 0}`;
      if (sig === this.lastSlotKeys[i]) continue;
      this.lastSlotKeys[i] = sig;

      const card = this.slotEls[i];
      card.className = `fdr-slot-card${item ? ` rarity-${item.rarity}` : ''}${isActive ? ' active' : ''}`;

      if (!item) {
        card.innerHTML = `<span class="fdr-slot-key">${i + 1}</span>`;
        continue;
      }

      const wDef = WEAPONS[item.weaponId];
      let countBadge = '';
      if (wDef.isConsumable || wDef.isThrowable) {
        countBadge = `<span class="fdr-slot-count">x${item.stackCount}</span>`;
      } else if (wDef.magSize > 0) {
        countBadge = `<span class="fdr-slot-count">${item.magAmmo}</span>`;
      }
      const crownBadge =
        item.rarity === 'mythic'
          ? `<span class="fdr-slot-crown" title="Mythic Boss Gear">${getCrownSvg()}</span>`
          : '';

      card.innerHTML = `
        <span class="fdr-slot-key">${i + 1}</span>
        ${crownBadge}
        <div class="fdr-slot-svg">${getWeaponSvg(item.weaponId)}</div>
        ${countBadge}
      `;
    }
  }

  private updateWave2HUD(state: HUDState): void {
    // 1. Vault Key Badge
    const vaultKeys = Math.max(0, Math.floor(state.activeVaultKeys ?? 0));
    if (vaultKeys !== this.lastVaultKeyCount) {
      this.lastVaultKeyCount = vaultKeys;
      this.vaultKeyBadgeEl.classList.toggle('fdr-hidden', vaultKeys <= 0);
      if (vaultKeys > 0) {
        this.vaultKeyTextEl.textContent =
          vaultKeys === 1 ? '1 VAULT KEY' : `${vaultKeys} VAULT KEYS`;
      }
    }

    // 2. Weather Pill
    const weather = state.weather;
    const weatherKey = weather ?? '';
    if (weatherKey !== this.lastWeatherKey) {
      this.lastWeatherKey = weatherKey;
      this.weatherPillEl.classList.toggle('fdr-hidden', !weather);
      if (weather) {
        this.weatherPillEl.className = `fdr-zone-pill weather weather-${weather}`;
        this.weatherIconEl.innerHTML = getWeatherIconSvg(weather);
        this.weatherTextEl.textContent = formatWeatherLabel(weather);
      }
    }

    // 3. Boss Encounter Healthbar (top-center below compass)
    const boss = state.nearbyBoss ?? null;
    const bossKey = boss
      ? `${boss.name}:${Math.round(boss.hp)}/${Math.round(boss.maxHp)}:${Math.round(boss.shield)}/${Math.round(boss.maxShield)}:${Math.round(boss.distance)}`
      : '';
    if (bossKey !== this.lastBossKey) {
      this.lastBossKey = bossKey;
      this.bossBarEl.classList.toggle('fdr-hidden', !boss);
      if (boss) {
        const hp = Math.max(0, Math.round(boss.hp));
        const maxHp = Math.max(1, Math.round(boss.maxHp));
        const shield = Math.max(0, Math.round(boss.shield));
        const maxShield = Math.max(0, Math.round(boss.maxShield));
        this.bossNameEl.textContent = boss.name.toUpperCase();
        this.bossStatsEl.textContent = `HP ${hp}/${maxHp} • SHD ${shield}/${maxShield}`;
        this.bossDistEl.textContent = `${Math.max(0, Math.round(boss.distance))}M`;
        this.bossHpFillEl.style.width = `${Math.min(100, (hp / maxHp) * 100).toFixed(1)}%`;
        this.bossShieldFillEl.style.width =
          maxShield > 0
            ? `${Math.min(100, (shield / maxShield) * 100).toFixed(1)}%`
            : '0%';
      }
    }

    // 4. Active Bounty Card
    const bounty = state.activeBounty ?? null;
    const bountySec = bounty ? Math.max(0, Math.ceil(bounty.timeRemaining)) : -1;
    const bountyKey = bounty
      ? `${bounty.targetName}:${Math.round(bounty.distance)}:${bountySec}:${bounty.rewardLabel}`
      : '';
    if (bountyKey !== this.lastBountyKey) {
      this.lastBountyKey = bountyKey;
      this.bountyCardEl.classList.toggle('fdr-hidden', !bounty);
      if (bounty) {
        this.bountyTargetEl.textContent = bounty.targetName;
        this.bountyDistEl.textContent = `${Math.max(0, Math.round(bounty.distance))}M`;
        this.bountyRewardEl.textContent = bounty.rewardLabel;
        this.bountyTimerEl.textContent = formatCountdown(bounty.timeRemaining);
        this.bountyCardEl.classList.toggle('urgent', bounty.timeRemaining <= 15);
      }
    }

    // 5. Vehicle Dashboard
    const veh = state.vehicle ?? null;
    const interactKey = formatKeyCodeLabel(
      resolveKeybinds(this.settings.keybinds).interact,
    );
    const vehKey = veh
      ? `${veh.kind}:${Math.round(veh.speedKmh)}:${Math.round(veh.hp)}/${Math.round(veh.maxHp)}:${Math.round(normalizeBoostChargePct(veh.boostCharge))}:${veh.isBoosting ? 1 : 0}:${interactKey}`
      : '';
    if (vehKey !== this.lastVehicleKey) {
      this.lastVehicleKey = vehKey;
      this.vehicleDashEl.classList.toggle('fdr-hidden', !veh);
      if (veh) {
        const hp = Math.max(0, Math.round(veh.hp));
        const maxHp = Math.max(1, Math.round(veh.maxHp));
        const hpPct = Math.min(100, (hp / maxHp) * 100);
        const boostPct = normalizeBoostChargePct(veh.boostCharge);
        this.vehicleIconEl.innerHTML = getVehicleIconSvg(veh.kind);
        this.vehicleTitleEl.textContent = formatVehicleKindLabel(veh.kind);
        this.vehicleSpeedEl.textContent = `${Math.max(0, Math.round(veh.speedKmh))} KM/H`;
        this.vehicleSpeedEl.classList.toggle('boosting', veh.isBoosting);
        this.vehicleHpTextEl.textContent = `${hp} / ${maxHp}`;
        this.vehicleBoostFillEl.style.width = `${boostPct.toFixed(1)}%`;
        this.vehicleBoostFillEl.classList.toggle('boosting', veh.isBoosting);
        this.vehicleHpFillEl.style.width = `${hpPct.toFixed(1)}%`;
        this.vehicleHpFillEl.classList.toggle('low', hpPct <= 30);
        this.vehicleHintEl.textContent = `[${interactKey}] EXIT • [SHIFT] BOOST • [H] HORN`;
      }
    }

    // 6. Grappler Charges Badge
    const grapplerVal =
      typeof state.grapplerCharges === 'number' &&
      Number.isFinite(state.grapplerCharges)
        ? Math.max(0, Math.round(state.grapplerCharges))
        : null;
    const grapplerKey = grapplerVal === null ? '' : String(grapplerVal);
    if (grapplerKey !== this.lastGrapplerKey) {
      this.lastGrapplerKey = grapplerKey;
      this.grapplerBadgeEl.classList.toggle('fdr-hidden', grapplerVal === null);
      if (grapplerVal !== null) {
        this.grapplerCountEl.textContent =
          grapplerVal === 1 ? '1 CHARGE' : `${grapplerVal} CHARGES`;
        this.grapplerBadgeEl.classList.toggle('empty', grapplerVal === 0);
      }
    }

    // 7. Live Spectator Bar
    const spec = state.spectating ?? null;
    const specKey = spec
      ? `${spec.targetName}:${Math.round(spec.targetHp)}:${Math.round(spec.targetShield)}:${Math.round(spec.targetKills)}:${Math.round(spec.aliveCount)}`
      : '';
    if (specKey !== this.lastSpectatingKey) {
      this.lastSpectatingKey = specKey;
      this.spectatorBarEl.classList.toggle('fdr-hidden', !spec);
      this.vitalsStackEl.classList.toggle('fdr-hidden', Boolean(spec));
      if (spec) {
        const hp = Math.max(0, Math.min(100, Math.round(spec.targetHp)));
        const shield = Math.max(0, Math.min(100, Math.round(spec.targetShield)));
        this.specTargetNameEl.textContent = spec.targetName;
        this.specShieldTextEl.textContent = `${shield} / 100`;
        this.specHpTextEl.textContent = `${hp} / 100`;
        this.specShieldFillEl.style.width = `${shield}%`;
        this.specHpFillEl.style.width = `${hp}%`;
        this.specElimsEl.textContent = `${Math.max(0, Math.round(spec.targetKills))} ELIMS`;
        this.specAliveEl.textContent = `${Math.max(0, Math.round(spec.aliveCount))} ALIVE`;
      }
    }
  }

  private updateWave3HUD(state: HUDState): void {
    // 1. Game Mode Chip (shown when not 'solo')
    const modeLabel = formatModeBadgeLabel(state.gameMode);
    const modeKey = `${state.gameMode ?? ''}:${modeLabel}`;
    if (modeKey !== this.lastModeChipKey) {
      this.lastModeChipKey = modeKey;
      this.modeChipEl.classList.toggle('fdr-hidden', !modeLabel);
      if (modeLabel) {
        this.modeChipEl.className = `fdr-zone-pill mode mode-${state.gameMode}`;
        this.modeChipEl.textContent = modeLabel;
      }
    }

    // 2. Cozy Campfire Healing Pill
    const nearCampfire = Boolean(state.nearCampfireHealing) && !state.spectating;
    if (nearCampfire !== this.lastNearCampfire) {
      this.lastNearCampfire = nearCampfire;
      this.campfirePillEl.classList.toggle('fdr-hidden', !nearCampfire);
    }

    // 3. Live Match Quests Tracker (upper-left stack below Bounty Card)
    const quests = Array.isArray(state.activeQuests)
      ? state.activeQuests.slice(0, 3)
      : [];
    const questsKey = quests
      .map(
        (q) =>
          `${q.id}:${q.title}:${Math.floor(q.progress)}/${q.target}:${q.completed ? 1 : 0}:${q.xpReward}`,
      )
      .join('|');
    if (questsKey !== this.lastQuestsKey) {
      this.lastQuestsKey = questsKey;
      this.questsPanelEl.classList.toggle('fdr-hidden', quests.length === 0);
      this.questsListEl.innerHTML = '';
      if (quests.length > 0) {
        const doneCount = quests.filter((q) => q.completed).length;
        this.questsCountEl.textContent = `${doneCount} / ${quests.length}`;
        for (const q of quests) {
          const pct = computeQuestProgressPct(q);
          const target = Math.max(1, Math.floor(q.target));
          const prog = Math.min(target, Math.max(0, Math.floor(q.progress)));

          const row = document.createElement('div');
          row.className = `fdr-quest-row${q.completed ? ' completed' : ''}`;
          row.dataset.questId = q.id;

          const top = document.createElement('div');
          top.className = 'fdr-quest-top';

          const check = document.createElement('span');
          check.className = 'fdr-quest-check';
          check.textContent = q.completed ? '✓' : '○';

          const title = document.createElement('span');
          title.className = 'fdr-quest-title';
          title.textContent = q.title;

          const progEl = document.createElement('span');
          progEl.className = 'fdr-quest-prog';
          progEl.textContent = q.completed
            ? `+${Math.max(0, Math.round(q.xpReward))} XP`
            : `${prog}/${target}`;

          top.append(check, title, progEl);

          const track = document.createElement('div');
          track.className = 'fdr-quest-track';
          const fill = document.createElement('div');
          fill.className = 'fdr-quest-fill';
          fill.style.width = `${pct.toFixed(1)}%`;
          track.appendChild(fill);

          row.append(top, track);
          this.questsListEl.appendChild(row);
        }
      }
    }

    // 4. 360° Visual Sound Effects Radial Ring (210px around center reticle)
    const visualAudioEnabled = this.settings.visualAudio !== false;
    const hideForContext =
      !visualAudioEnabled ||
      state.isScoped ||
      state.editMode.active ||
      state.phase === 'bus' ||
      Boolean(state.spectating) ||
      this.emoteWheelOpen;
    const visibleCues = hideForContext
      ? []
      : selectVisibleVisualSoundCues(state.visualSoundCues, 8);
    const cueKey = visibleCues
      .map(
        (c) =>
          `${c.id}:${c.kind}:${Math.round(angleRadToDeg(c.angleRad) * 2)}:${Math.round((c.intensity ?? 0) * 100)}`,
      )
      .join('|');
    if (cueKey !== this.lastVisualAudioKey) {
      this.lastVisualAudioKey = cueKey;
      this.visualAudioRingEl.classList.toggle(
        'fdr-hidden',
        visibleCues.length === 0,
      );
      this.visualAudioRingEl.innerHTML = '';
      for (const cue of visibleCues) {
        const deg = angleRadToDeg(cue.angleRad);
        const intensity = Math.max(
          0.15,
          Math.min(1, Number.isFinite(cue.intensity) ? cue.intensity : 0.7),
        );
        const opacity = (0.45 + intensity * 0.55).toFixed(2);
        const scale = (0.86 + intensity * 0.24).toFixed(2);

        const cueEl = document.createElement('div');
        cueEl.className = `fdr-vs-cue kind-${cue.kind}`;
        cueEl.dataset.cueKind = cue.kind;
        cueEl.dataset.cueId = cue.id;
        cueEl.style.transform = `rotate(${deg.toFixed(1)}deg)`;
        cueEl.style.opacity = opacity;

        const arcEl = document.createElement('div');
        arcEl.className = 'fdr-vs-cue-arc';

        const badgeEl = document.createElement('div');
        badgeEl.className = 'fdr-vs-cue-badge';
        badgeEl.style.transform = `translate(-50%, -50%) rotate(${(-deg).toFixed(1)}deg) scale(${scale})`;
        badgeEl.innerHTML = getVisualAudioIconSvg(cue.kind);

        cueEl.append(arcEl, badgeEl);
        this.visualAudioRingEl.appendChild(cueEl);
      }
    }
  }

  private updateWave4HUD(state: HUDState, now: number): void {
    // 1. Reality Augment Picker (middle-right card with clickable [7] / [8] buttons)
    const pending =
      !state.spectating &&
      Array.isArray(state.pendingAugmentChoices) &&
      state.pendingAugmentChoices.length === 2
        ? state.pendingAugmentChoices
        : null;
    const pendingKey = pending ? `${pending[0]}|${pending[1]}` : '';
    if (pendingKey !== this.lastPendingAugmentsKey) {
      this.lastPendingAugmentsKey = pendingKey;
      this.augmentPickerEl.classList.toggle('fdr-hidden', !pending);
      if (pending) {
        pending.forEach((augId: AugmentId, idx: number) => {
          const slot = this.augmentChoiceEls[idx];
          if (!slot) return;
          const def = getAugmentMeta(augId);
          slot.btn.dataset.augmentId = def.id;
          slot.btn.style.borderLeftColor = def.accentColor;
          slot.btn.style.setProperty('--aug-accent', def.accentColor);
          slot.icon.innerHTML = getAugmentIconSvg(def.id);
          slot.badge.textContent = def.badge;
          slot.badge.style.color = def.accentColor;
          slot.name.textContent = def.name;
          slot.sub.textContent = def.subtitle;
        });
      }
    }

    // 2. Active Augments Strip (3 max mini perk pills in top-left stack)
    const activeAugs =
      !state.spectating && Array.isArray(state.activeAugments)
        ? state.activeAugments.slice(0, 3)
        : [];
    const activeAugKey = activeAugs.join('|');
    if (activeAugKey !== this.lastActiveAugmentsKey) {
      this.lastActiveAugmentsKey = activeAugKey;
      this.activeAugmentsEl.classList.toggle(
        'fdr-hidden',
        activeAugs.length === 0,
      );
      this.activeAugmentsEl.innerHTML = '';
      for (const augId of activeAugs) {
        const def = getAugmentMeta(augId);
        const pill = document.createElement('div');
        pill.className = 'fdr-augment-pill';
        pill.dataset.augmentId = def.id;
        pill.style.borderColor = def.accentColor;

        const icon = document.createElement('span');
        icon.className = 'fdr-augment-pill-icon';
        icon.innerHTML = getAugmentIconSvg(def.id);

        const textWrap = document.createElement('div');
        textWrap.className = 'fdr-augment-pill-text';

        const badge = document.createElement('span');
        badge.className = 'fdr-augment-pill-badge';
        badge.style.color = def.accentColor;
        badge.textContent = def.badge;

        const name = document.createElement('span');
        name.className = 'fdr-augment-pill-name';
        name.textContent = def.name;

        textWrap.append(badge, name);
        pill.append(icon, textWrap);
        this.activeAugmentsEl.appendChild(pill);
      }
    }

    // 3. POI Capture Progress Bar (centered above [E] interact prompt)
    const cap = !state.spectating ? state.captureStatus ?? null : null;
    let showCap = false;
    let capText = '';
    let capPct = 0;
    let capCaptured = false;
    let capContested = false;

    if (cap) {
      const poiUpper = cap.poiName.trim().toUpperCase() || 'POI';
      if (!cap.captured) {
        this.celebratedCapturePois.delete(poiUpper);
        if (this.captureCelebratePoi === poiUpper) {
          this.captureCelebrateUntil = 0;
          this.captureCelebratePoi = '';
        }
        showCap = true;
        capPct = Math.round(computeCaptureProgressPct(cap.progress, false));
        capText = `CAPTURING ${poiUpper} • ${capPct}%`;
        capContested = Boolean(cap.contested);
      } else {
        if (!this.celebratedCapturePois.has(poiUpper)) {
          this.celebratedCapturePois.add(poiUpper);
          this.captureCelebratePoi = poiUpper;
          this.captureCelebrateUntil = now + 2400;
        }
        if (this.captureCelebratePoi === poiUpper && now < this.captureCelebrateUntil) {
          showCap = true;
          capPct = 100;
          capCaptured = true;
          capText = `${poiUpper} CAPTURED • 100%`;
        }
      }
    } else {
      this.captureCelebrateUntil = 0;
      this.captureCelebratePoi = '';
    }

    const capKey = showCap
      ? `${capText}:${capPct}:${capCaptured ? 1 : 0}:${capContested ? 1 : 0}`
      : '';
    if (capKey !== this.lastCaptureKey) {
      this.lastCaptureKey = capKey;
      this.captureBarEl.classList.toggle('fdr-hidden', !showCap);
      if (showCap) {
        this.captureBarEl.classList.toggle('captured', capCaptured);
        this.captureBarEl.classList.toggle('contested', capContested);
        this.captureContestedEl.classList.toggle('fdr-hidden', !capContested);
        this.captureIconEl.innerHTML = getCaptureFlagIconSvg(capCaptured);
        this.captureLabelEl.textContent = capText;
        this.captureFillEl.style.width = `${capPct}%`;
      } else {
        this.captureBarEl.classList.remove('captured', 'contested');
      }
    }

    // 4. 3D Tactical Ping Floating Marker
    const ping = !state.spectating ? state.tacticalPing ?? null : null;
    const showPing = Boolean(ping && ping.visible);
    if (!showPing || !ping) {
      if (this.lastTacticalPingVis !== false) {
        this.lastTacticalPingVis = false;
        this.tacticalPingEl.classList.add('fdr-hidden');
      }
    } else {
      if (this.lastTacticalPingVis !== true) {
        this.lastTacticalPingVis = true;
        this.tacticalPingEl.classList.remove('fdr-hidden');
      }
      const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const winH = typeof window !== 'undefined' ? window.innerHeight : 720;
      const sx =
        typeof ping.screenX === 'number' && Number.isFinite(ping.screenX)
          ? ping.screenX
          : winW * 0.5;
      const sy =
        typeof ping.screenY === 'number' && Number.isFinite(ping.screenY)
          ? ping.screenY
          : winH * 0.45;
      this.tacticalPingEl.style.left = `${sx.toFixed(1)}px`;
      this.tacticalPingEl.style.top = `${sy.toFixed(1)}px`;

      const fmt = formatTacticalPingLabel(ping);
      const pingKey = `${ping.kind}:${fmt.text}:${fmt.distanceText}`;
      if (pingKey !== this.lastTacticalPingKey) {
        this.lastTacticalPingKey = pingKey;
        this.tacticalPingEl.className = `fdr-tactical-ping kind-${ping.kind}`;
        this.tacticalPingEl.dataset.pingKind = ping.kind;
        this.tacticalPingIconEl.innerHTML = getTacticalPingIconSvg(ping.kind);
        this.tacticalPingLabelEl.textContent = fmt.text;
        this.tacticalPingDistEl.textContent = fmt.distanceText;
      }
    }
  }

  private updateWave5HUD(state: HUDState): void {
    // 1. Gold Bars Counter Pill (bottom-right near mats)
    const goldVal =
      typeof state.goldBars === 'number' && Number.isFinite(state.goldBars)
        ? Math.max(0, Math.round(state.goldBars))
        : 0;
    if (goldVal !== this.lastGoldBars) {
      this.lastGoldBars = goldVal;
      this.goldCountEl.textContent = String(goldVal);
    }

    // 2. Kinetic Blade Dash Charges (3 lightning pips)
    const kineticVal =
      !state.spectating &&
      typeof state.kineticDashCharges === 'number' &&
      Number.isFinite(state.kineticDashCharges)
        ? Math.max(0, Math.min(3, Math.round(state.kineticDashCharges)))
        : null;
    const kineticKey = kineticVal === null ? '' : String(kineticVal);
    if (kineticKey !== this.lastKineticKey) {
      this.lastKineticKey = kineticKey;
      this.kineticBadgeEl.classList.toggle('fdr-hidden', kineticVal === null);
      if (kineticVal !== null) {
        this.kineticBadgeEl.classList.toggle('empty', kineticVal === 0);
        this.kineticPipEls.forEach((pip, idx) => {
          pip.classList.toggle('active', idx < kineticVal);
          pip.classList.toggle('spent', idx >= kineticVal);
        });
      }
    }

    // 3. Allied Specialist Mini Card (top-left stack)
    const ally = !state.spectating ? state.hiredAlly ?? null : null;
    const allyKey = ally
      ? `${ally.name}:${ally.role}:${Math.round(ally.hp)}/${Math.round(ally.maxHp)}:${Math.round(ally.shield)}/${Math.round(ally.maxShield)}:${Math.round(ally.distance)}`
      : '';
    if (allyKey !== this.lastAllyKey) {
      this.lastAllyKey = allyKey;
      this.allyCardEl.classList.toggle('fdr-hidden', !ally);
      if (ally) {
        const hp = Math.max(0, Math.round(ally.hp));
        const maxHp = Math.max(1, Math.round(ally.maxHp));
        const shield = Math.max(0, Math.round(ally.shield));
        const maxShield = Math.max(0, Math.round(ally.maxShield));
        const dist = Math.max(0, Math.round(ally.distance));
        this.allyCardEl.className = `fdr-ally-card role-${ally.role}`;
        this.allyCardEl.dataset.allyRole = ally.role;
        this.allyRoleIconEl.innerHTML = getAllyRoleSvg(ally.role);
        this.allyNameEl.textContent = ally.name.toUpperCase();
        this.allyRolePillEl.textContent = ally.role.toUpperCase();
        this.allyDistEl.textContent = `${dist}M`;
        this.allyShieldFillEl.style.width =
          maxShield > 0
            ? `${Math.min(100, (shield / maxShield) * 100).toFixed(1)}%`
            : '0%';
        this.allyHpFillEl.style.width = `${Math.min(100, (hp / maxHp) * 100).toFixed(1)}%`;
        this.allyStatsEl.textContent = `HP ${hp}/${maxHp} • SHD ${shield}/${maxShield}`;
      }
    }

    // 4. Loot Island Active Status Chip
    const island = !state.spectating ? state.lootIsland ?? null : null;
    const showIsland = Boolean(island && island.active && !island.captured);
    const islandDist =
      showIsland && island
        ? Math.max(
            0,
            Math.round(Number.isFinite(island.distance) ? island.distance : 0),
          )
        : -1;
    const islandKey = showIsland ? String(islandDist) : '';
    if (islandKey !== this.lastLootIslandKey) {
      this.lastLootIslandKey = islandKey;
      this.lootIslandChipEl.classList.toggle('fdr-hidden', !showIsland);
      if (showIsland) {
        this.lootIslandTextEl.textContent = `LOOT ISLAND • ${islandDist}M`;
      }
    }
  }

  private updateCenterCombat(state: HUDState, now: number): void {
    if (this.lastScoped !== state.isScoped) {
      this.lastScoped = state.isScoped;
      this.scopeEl.classList.toggle('fdr-hidden', !state.isScoped);
    }

    const hideCrosshair =
      state.isScoped ||
      state.editMode.active ||
      state.phase === 'bus' ||
      Boolean(state.spectating) ||
      this.emoteWheelOpen;
    this.crosshairEl.classList.toggle('fdr-hidden', hideCrosshair);

    if (this.lastBuildCrosshair !== state.isBuildMode) {
      this.lastBuildCrosshair = state.isBuildMode;
      this.crosshairEl.classList.toggle('build', state.isBuildMode);
    }

    const chStyle = resolveCrosshairStyle(this.settings.crosshairStyle);
    const rawGap =
      chStyle === 'classic'
        ? 7
        : Math.round(
            Math.max(5, Math.min(44, 6 + state.activeWeaponSpread * 380)),
          );
    if (rawGap !== this.lastSpreadGap) {
      this.lastSpreadGap = rawGap;
      this.crosshairEl.style.setProperty('--ch-gap', `${rawGap}px`);
    }

    if (
      state.hitmarker &&
      state.hitmarker.timestamp > this.lastHitmarkerTs
    ) {
      this.triggerHitmarker(state.hitmarker);
    }

    if (
      state.damageDirection &&
      state.damageDirection.timestamp > this.lastDamageDirTs
    ) {
      this.lastDamageDirTs = state.damageDirection.timestamp;
      this.damageArcHideAt = now + 820;
      const deg = (state.damageDirection.angleRad * 180) / Math.PI;
      this.damageArcWrapEl.style.transform = `translate(-50%, -50%) rotate(${deg.toFixed(1)}deg)`;
      this.damageArcWrapEl.style.opacity = '1';
    }
  }

  private updateEditGrid(state: HUDState): void {
    const em = state.editMode;
    const key = em.active
      ? `1:${em.pieceId ?? ''}:${em.selectedTiles.map((b) => (b ? '1' : '0')).join('')}:${em.valid ? '1' : '0'}:${em.hoveredTile}`
      : '0';
    if (key === this.lastEditKey) return;
    this.lastEditKey = key;

    this.editOverlayEl.classList.toggle('fdr-hidden', !em.active);
    if (!em.active) return;

    for (let i = 0; i < 9; i++) {
      const tile = this.editTileEls[i];
      if (!tile) continue;
      tile.classList.toggle('selected', Boolean(em.selectedTiles[i]));
      tile.classList.toggle('invalid', !em.valid);
    }
  }

  private updatePointerPrompt(state: HUDState): void {
    const shouldShow =
      !this.suppressPointerPrompt &&
      !this.emoteWheelOpen &&
      !state.editMode.active &&
      !state.spectating &&
      !state.pointerLocked &&
      state.phase === 'playing';
    if (shouldShow === this.lastPointerPromptVisible) return;
    this.lastPointerPromptVisible = shouldShow;
    this.pointerPromptEl.classList.toggle('fdr-hidden', !shouldShow);
  }

  private drawMinimap(state: HUDState): void {
    const ctx = this.minimapCtx;
    if (!ctx) return;

    const size = this.minimapCanvas.width;
    const viewSpanMeters = 280; // Zoomed 280m x 280m window centered on player
    const pxPerMeter = size / viewSpanMeters;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0c3b6e';
    ctx.fillRect(0, 0, size, size);

    const worldToMini = (wx: number, wz: number) => ({
      x: size * 0.5 + (wx - state.playerPos.x) * pxPerMeter,
      y: size * 0.5 + (wz - state.playerPos.z) * pxPerMeter,
    });

    if (this.terrainMapCanvas) {
      const srcW = this.terrainMapCanvas.width;
      const srcH = this.terrainMapCanvas.height;
      const pNorm = worldToMapNorm(state.playerPos.x, state.playerPos.z);
      const halfNorm = (viewSpanMeters * 0.5) / WORLD_SIZE;
      const sx = (pNorm.nx - halfNorm) * srcW;
      const sy = (pNorm.nz - halfNorm) * srcH;
      const sw = halfNorm * 2 * srcW;
      const sh = halfNorm * 2 * srcH;
      const sx0 = Math.max(0, sx);
      const sy0 = Math.max(0, sy);
      const sx1 = Math.min(srcW, sx + sw);
      const sy1 = Math.min(srcH, sy + sh);
      if (sx1 > sx0 && sy1 > sy0 && sw > 0 && sh > 0) {
        const dx = ((sx0 - sx) / sw) * size;
        const dy = ((sy0 - sy) / sh) * size;
        const dw = ((sx1 - sx0) / sw) * size;
        const dh = ((sy1 - sy0) / sh) * size;
        ctx.drawImage(
          this.terrainMapCanvas,
          sx0,
          sy0,
          sx1 - sx0,
          sy1 - sy0,
          dx,
          dy,
          dw,
          dh,
        );
      }
    } else {
      // Fallback subtle radar grid if terrain canvas not yet passed
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let g = 0; g <= size; g += size / 4) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, g);
        ctx.lineTo(size, g);
        ctx.stroke();
      }
    }

    // Storm overlay outside current circle
    const storm = state.stormState;
    const sCenter = worldToMini(storm.currentCenterX, storm.currentCenterZ);
    const sRadPx = storm.currentRadius * pxPerMeter;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(sCenter.x, sCenter.y, Math.max(0, sRadPx), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(139, 36, 219, 0.42)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sCenter.x, sCenter.y, Math.max(0, sRadPx), 0, Math.PI * 2);
    ctx.strokeStyle = '#d946ef';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Next safe zone circle
    if (storm.nextRadius > 0) {
      const nCenter = worldToMini(storm.nextCenterX, storm.nextCenterZ);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(nCenter.x, nCenter.y, storm.nextRadius * pxPerMeter, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // Battle bus path while dropping
    if (state.phase === 'bus' || state.phase === 'skydiving') {
      const bStart = worldToMini(state.busStart.x, state.busStart.z);
      const bEnd = worldToMini(state.busEnd.x, state.busEnd.z);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(bStart.x, bStart.y);
      ctx.lineTo(bEnd.x, bEnd.y);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      const bPos = worldToMini(state.busPos.x, state.busPos.z);
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bPos.x, bPos.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Audio / Tactical blips
    for (const blip of state.audioBlips) {
      const p = worldToMini(blip.x, blip.z);
      if (p.x < -12 || p.x > size + 12 || p.y < -12 || p.y > size + 12) continue;
      const alpha = Math.max(0, 1 - blip.age / Math.max(0.01, blip.maxAge));
      if (blip.kind === 'gunfire') {
        ctx.strokeStyle = `rgba(249, 115, 22, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 + (1 - alpha) * 8, 0, Math.PI * 2);
        ctx.stroke();
      } else if (blip.kind === 'chest') {
        ctx.fillStyle = `rgba(255, 208, 0, ${alpha.toFixed(2)})`;
        ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
      } else if (blip.kind === 'supply_drop') {
        ctx.fillStyle = '#22d3ee';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
        ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
      } else {
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Map waypoint + dashed line
    if (state.mapWaypoint) {
      const wp = worldToMini(state.mapWaypoint.x, state.mapWaypoint.z);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.5);
      ctx.lineTo(wp.x, wp.y);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();

      const clampedX = Math.max(8, Math.min(size - 8, wp.x));
      const clampedY = Math.max(8, Math.min(size - 8, wp.y));
      ctx.save();
      ctx.translate(clampedX, clampedY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#22d3ee';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
    }

    // Player FOV cone + arrow
    const rad = (state.compassHeading * Math.PI) / 180;
    ctx.save();
    ctx.translate(size * 0.5, size * 0.5);
    ctx.rotate(rad);

    // FOV cone
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 34, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.36)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Directional chevron
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 6);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-6.5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ffd000';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  dispose(): void {
    for (const timer of this.activeQuestToastTimers) {
      clearTimeout(timer);
    }
    this.activeQuestToastTimers.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('mouseup', this.pointerUpHandler);
    }
    this.containerEl.remove();
  }
}
