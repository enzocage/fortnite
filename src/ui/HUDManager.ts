import { EMOTES, WEAPONS, WORLD_SIZE } from '../core';
import type {
  BuildPieceType,
  DamageNumberEvent,
  EmoteId,
  GameSettings,
  HUDState,
  HitmarkerFeedback,
  ItemInstance,
  KillFeedEntry,
  MaterialType,
} from '../types';
import {
  formatCompassTicks,
  formatCountdown,
  getBearingDeg,
  getRarityMeta,
  worldToMapNorm,
} from './UIHelpers';
import {
  getBuildIconSvg,
  getMaterialIconSvg,
  getSkullSvg,
  getStormEyeSvg,
  getWeaponSvg,
} from './WeaponIcons';

export interface HUDCallbacks {
  onEmoteSelect: (emoteId: EmoteId) => void;
  onEditTileToggle: (tileIndex: number) => void;
  onEditConfirm: () => void;
  onEditReset: () => void;
  onRequestPointerLock?: () => void;
}

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
  { type: 'ramp', key: 'C' },
  { type: 'roof', key: 'V' },
];

const MATERIALS: MaterialType[] = ['wood', 'brick', 'metal'];

export class HUDManager {
  private readonly root: HTMLElement;
  private callbacks: HUDCallbacks;
  private settings: GameSettings;

  private containerEl: HTMLDivElement;
  private stormVignetteEl: HTMLDivElement;
  private fpsBadgeEl: HTMLDivElement;

  // Compass
  private compassTapeEl: HTMLDivElement;
  private compassReadoutEl: HTMLDivElement;
  private phaseHintEl: HTMLDivElement;
  private phaseHintTextEl: HTMLSpanElement;

  // Minimap & telemetry
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D | null;
  private terrainMapCanvas: HTMLCanvasElement | null = null;
  private stormPillEl: HTMLDivElement;
  private stormTextEl: HTMLSpanElement;
  private aliveTextEl: HTMLSpanElement;
  private elimsTextEl: HTMLSpanElement;

  // Kill feed
  private killFeedEl: HTMLDivElement;
  private killFeedItems: ActiveKillFeedItem[] = [];

  // Bottom center
  private interactEl: HTMLDivElement;
  private interactKeyEl: HTMLSpanElement;
  private interactLabelEl: HTMLSpanElement;
  private channelEl: HTMLDivElement;
  private channelLabelEl: HTMLSpanElement;
  private channelPctEl: HTMLSpanElement;
  private channelFillEl: HTMLDivElement;
  private staminaWrapEl: HTMLDivElement;
  private staminaFillEl: HTMLDivElement;
  private shieldFillEl: HTMLDivElement;
  private shieldTextEl: HTMLSpanElement;
  private healthFillEl: HTMLDivElement;
  private healthTextEl: HTMLSpanElement;

  // Bottom right
  private matEls = new Map<
    MaterialType,
    { root: HTMLDivElement; count: HTMLSpanElement }
  >();
  private buildEls = new Map<BuildPieceType, HTMLDivElement>();
  private ammoWrapEl: HTMLDivElement;
  private ammoMainEl: HTMLDivElement;
  private ammoResEl: HTMLDivElement;
  private slotEls: HTMLDivElement[] = [];

  // Center overlays
  private crosshairEl: HTMLDivElement;
  private scopeEl: HTMLDivElement;
  private hitmarkerEl: HTMLDivElement;
  private damageArcWrapEl: HTMLDivElement;
  private damageNumsEl: HTMLDivElement;
  private activeDamageNums: ActiveDamageNum[] = [];
  private editOverlayEl: HTMLDivElement;
  private editTileEls: HTMLButtonElement[] = [];
  private emoteBackdropEl: HTMLDivElement;
  private pointerPromptEl: HTMLDivElement;

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
    this.settings = { ...settings };
    this.callbacks = callbacks;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'fdr-hud fdr-hidden';

    // Storm vignette
    this.stormVignetteEl = document.createElement('div');
    this.stormVignetteEl.className = 'fdr-storm-vignette';

    // FPS Badge
    this.fpsBadgeEl = document.createElement('div');
    this.fpsBadgeEl.className = 'fdr-fps-badge fdr-hidden';
    this.fpsBadgeEl.textContent = '60 FPS';

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

    // Phase hint
    this.phaseHintEl = document.createElement('div');
    this.phaseHintEl.className = 'fdr-phase-hint fdr-hidden';
    this.phaseHintTextEl = document.createElement('span');
    this.phaseHintEl.appendChild(this.phaseHintTextEl);

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
    const mapKeyTag = document.createElement('div');
    mapKeyTag.className = 'fdr-minimap-mapkey';
    mapKeyTag.textContent = 'M • MAP';
    minimapFrame.append(this.minimapCanvas, mapKeyTag);

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
    minimapCluster.append(minimapFrame, teleRow);

    // Bottom-Left Kill Feed
    this.killFeedEl = document.createElement('div');
    this.killFeedEl.className = 'fdr-killfeed';

    // Bottom-Center Vitals
    const bottomCenter = document.createElement('div');
    bottomCenter.className = 'fdr-bottom-center';

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

    const vitalsStack = document.createElement('div');
    vitalsStack.className = 'fdr-vitals-stack';

    this.staminaWrapEl = document.createElement('div');
    this.staminaWrapEl.className = 'fdr-stamina-wrap fdr-hidden';
    this.staminaFillEl = document.createElement('div');
    this.staminaFillEl.className = 'fdr-stamina-fill';
    this.staminaWrapEl.appendChild(this.staminaFillEl);

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

    vitalsStack.append(this.staminaWrapEl, shieldBar, healthBar);
    bottomCenter.append(this.interactEl, this.channelEl, vitalsStack);

    // Bottom-Right Build & Hotbar
    const bottomRight = document.createElement('div');
    bottomRight.className = 'fdr-bottom-right';

    const buildMatsBar = document.createElement('div');
    buildMatsBar.className = 'fdr-build-mats-bar';

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
      tile.innerHTML = `<span class="fdr-build-key">${bp.key}</span>${getBuildIconSvg(bp.type)}`;
      buildTiles.appendChild(tile);
      this.buildEls.set(bp.type, tile);
    }

    buildMatsBar.append(matsStrip, buildTiles);

    const hotbarWrap = document.createElement('div');
    hotbarWrap.className = 'fdr-hotbar-wrap';

    this.ammoWrapEl = document.createElement('div');
    this.ammoWrapEl.className = 'fdr-active-ammo fdr-hidden';
    this.ammoMainEl = document.createElement('div');
    this.ammoMainEl.className = 'fdr-ammo-main';
    this.ammoResEl = document.createElement('div');
    this.ammoResEl.className = 'fdr-ammo-res';
    this.ammoWrapEl.append(this.ammoMainEl, this.ammoResEl);

    const hotbarSlots = document.createElement('div');
    hotbarSlots.className = 'fdr-hotbar-slots';
    for (let i = 0; i < 6; i++) {
      const card = document.createElement('div');
      card.className = 'fdr-slot-card';
      card.innerHTML = `<span class="fdr-slot-key">${i + 1}</span>`;
      hotbarSlots.appendChild(card);
      this.slotEls.push(card);
    }

    hotbarWrap.append(this.ammoWrapEl, hotbarSlots);
    bottomRight.append(buildMatsBar, hotbarWrap);

    // Center Tactical Overlays
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
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'fdr-edit-btn confirm';
    confirmBtn.textContent = 'CONFIRM [G]';
    confirmBtn.addEventListener('click', () => this.callbacks.onEditConfirm());
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'fdr-edit-btn';
    resetBtn.textContent = 'RESET [RMB]';
    resetBtn.addEventListener('click', () => this.callbacks.onEditReset());
    editActions.append(confirmBtn, resetBtn);
    this.editOverlayEl.append(editHead, editGrid, editActions);

    // Radial Emote Wheel
    this.emoteBackdropEl = document.createElement('div');
    this.emoteBackdropEl.className = 'fdr-emote-wheel-backdrop fdr-hidden';
    const wheel = document.createElement('div');
    wheel.className = 'fdr-emote-wheel';
    for (const emote of EMOTES) {
      const meta = getRarityMeta(emote.rarity);
      const slice = document.createElement('button');
      slice.type = 'button';
      slice.className = `fdr-emote-slice rarity-${emote.rarity}`;
      slice.innerHTML = `
        <span style="font-size:11px;font-weight:800;opacity:0.9">${meta.label}</span>
        <span style="font-size:17px;font-weight:800">${emote.name}</span>
        <span style="font-size:11px;opacity:0.85">${emote.bpm} BPM</span>
      `;
      slice.addEventListener('click', () => {
        this.setEmoteWheelOpen(false);
        this.callbacks.onEmoteSelect(emote.id);
      });
      wheel.appendChild(slice);
    }
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
    this.pointerPromptEl.innerHTML = `
      <div class="fdr-pointer-title">CLICK SCREEN TO AIM &amp; PLAY</div>
      <div class="fdr-pointer-sub">ESC / P: PAUSE • M: TACTICAL MAP • B: EMOTES</div>
    `;

    this.containerEl.append(
      this.stormVignetteEl,
      this.fpsBadgeEl,
      compassWrap,
      this.phaseHintEl,
      minimapCluster,
      this.killFeedEl,
      bottomCenter,
      bottomRight,
      this.crosshairEl,
      this.scopeEl,
      this.hitmarkerEl,
      this.damageArcWrapEl,
      this.damageNumsEl,
      this.editOverlayEl,
      this.emoteBackdropEl,
      this.pointerPromptEl,
    );

    this.root.appendChild(this.containerEl);

    if (typeof window !== 'undefined') {
      window.addEventListener('mouseup', this.pointerUpHandler);
    }
  }

  setCallbacks(callbacks: HUDCallbacks): void {
    this.callbacks = callbacks;
  }

  setSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    if (!this.settings.showFps) {
      this.fpsBadgeEl.classList.add('fdr-hidden');
    }
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
    this.updateFps(state.fps, now);
    this.updateCompass(state);
    this.updatePhaseHint(state);
    this.updateTelemetry(state);
    this.updateVitals(state);
    this.updateInteractAndChannel(state);
    this.updateMaterialsAndBuilds(state);
    this.updateHotbar(state);
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
  }

  private updateVitals(state: HUDState): void {
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
      if (wDef.isConsumable) {
        countBadge = `<span class="fdr-slot-count">x${item.stackCount}</span>`;
      } else if (wDef.magSize > 0) {
        countBadge = `<span class="fdr-slot-count">${item.magAmmo}</span>`;
      }

      card.innerHTML = `
        <span class="fdr-slot-key">${i + 1}</span>
        <div class="fdr-slot-svg">${getWeaponSvg(item.weaponId)}</div>
        ${countBadge}
      `;
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
      this.emoteWheelOpen;
    this.crosshairEl.classList.toggle('fdr-hidden', hideCrosshair);

    if (this.lastBuildCrosshair !== state.isBuildMode) {
      this.lastBuildCrosshair = state.isBuildMode;
      this.crosshairEl.classList.toggle('build', state.isBuildMode);
    }

    const rawGap = Math.round(
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
      !state.pointerLocked &&
      (state.phase === 'bus' ||
        state.phase === 'skydiving' ||
        state.phase === 'gliding' ||
        state.phase === 'playing');
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('mouseup', this.pointerUpHandler);
    }
    this.containerEl.remove();
  }
}
