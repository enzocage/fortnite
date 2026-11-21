import {
  DEFAULT_KEYBINDS,
  DEFAULT_SETTINGS,
  EMOTES,
  EventBus,
  GLIDERS,
  PICKAXES,
  SKINS,
} from '../core';
import type {
  Difficulty,
  EmoteId,
  GameSettings,
  GraphicsQuality,
  KeybindMap,
  LobbyConfig,
} from '../types';
import { computeCareerLevelProgress, loadCareerStats } from './CareerProfile';
import {
  cloneSettings,
  formatKeyCodeLabel,
  getRarityMeta,
  KEYBIND_ACTION_DEFS,
  resolveKeybinds,
} from './UIHelpers';
import { getCrownSvg, getWeaponSvg } from './WeaponIcons';

export type LobbyTabId = 'play' | 'locker' | 'controls' | 'settings';

const SETTINGS_STORAGE_KEY = 'fortdrop_settings_v1';
const LOBBY_STORAGE_KEY = 'fortdrop_lobby_v1';

const DEFAULT_LOBBY_CONFIG: LobbyConfig = {
  playerName: 'FORTDROPPER',
  difficulty: 'standard',
  botCount: 29,
  skinId: SKINS[0]?.id ?? 'sky_striker',
  pickaxeId: PICKAXES[0]?.id ?? 'default_ax',
  gliderId: GLIDERS[0]?.id ?? 'aero_wing',
  selectedEmote: EMOTES[0]?.id ?? 'victory_groove',
};

function getSafeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return null;
}

export function loadStoredSettings(): GameSettings {
  const storage = getSafeStorage();
  if (!storage) return cloneSettings(DEFAULT_SETTINGS);
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return cloneSettings(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return cloneSettings({
      ...DEFAULT_SETTINGS,
      ...parsed,
      keybinds: {
        ...DEFAULT_KEYBINDS,
        ...(parsed.keybinds ?? {}),
      },
    });
  } catch {
    return cloneSettings(DEFAULT_SETTINGS);
  }
}

export function saveStoredSettings(settings: GameSettings): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadStoredLobbyConfig(): LobbyConfig {
  const storage = getSafeStorage();
  if (!storage) return { ...DEFAULT_LOBBY_CONFIG };
  try {
    const raw = storage.getItem(LOBBY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOBBY_CONFIG };
    const parsed = JSON.parse(raw) as Partial<LobbyConfig>;
    return {
      ...DEFAULT_LOBBY_CONFIG,
      ...parsed,
      botCount:
        typeof parsed.botCount === 'number' && Number.isFinite(parsed.botCount)
          ? Math.max(1, Math.min(99, Math.round(parsed.botCount)))
          : DEFAULT_LOBBY_CONFIG.botCount,
    };
  } catch {
    return { ...DEFAULT_LOBBY_CONFIG };
  }
}

export function saveStoredLobbyConfig(config: LobbyConfig): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.setItem(LOBBY_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export interface LobbyScreenCallbacks {
  onStartMatch: (config: LobbyConfig) => void;
  onCosmeticChange: (
    cosmetics: Pick<LobbyConfig, 'skinId' | 'pickaxeId' | 'gliderId' | 'selectedEmote'>,
  ) => void;
  onSettingsChange: (settings: GameSettings) => void;
  onPreviewEmote: (emoteId: EmoteId) => void;
}

export class LobbyScreen {
  private readonly root: HTMLElement;
  private readonly eventBus: EventBus;
  private callbacks: LobbyScreenCallbacks;

  private activeTab: LobbyTabId = 'play';
  private config: LobbyConfig;
  private settings: GameSettings;

  private containerEl: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private tabButtons = new Map<LobbyTabId, HTMLButtonElement>();
  private badgeTextEl: HTMLSpanElement;
  private careerLevelEl: HTMLSpanElement;
  private careerMetaEl: HTMLSpanElement;
  private careerXpTextEl: HTMLSpanElement;
  private careerXpFillEl: HTMLDivElement;

  private listeningKeybindAction: keyof KeybindMap | null = null;
  private keybindListener: ((e: KeyboardEvent) => void) | null = null;
  private keybindListenerTarget: {
    addEventListener: (
      type: string,
      fn: (e: KeyboardEvent) => void,
      capture?: boolean,
    ) => void;
    removeEventListener: (
      type: string,
      fn: (e: KeyboardEvent) => void,
      capture?: boolean,
    ) => void;
  } | null = null;

  constructor(
    root: HTMLElement,
    eventBus: EventBus,
    callbacks: LobbyScreenCallbacks,
  ) {
    this.root = root;
    this.eventBus = eventBus;
    this.callbacks = callbacks;
    this.config = loadStoredLobbyConfig();
    this.settings = loadStoredSettings();

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'fdr-lobby';

    const topBar = document.createElement('div');
    topBar.className = 'fdr-lobby-topbar';

    const brand = document.createElement('div');
    brand.className = 'fdr-brand';
    brand.innerHTML = `
      <div class="fdr-brand-inner">
        <span class="fdr-brand-title">FORTDROP ROYALE</span>
        <span class="fdr-brand-tag">BATTLE ISLAND</span>
      </div>
    `;

    const navTabs = document.createElement('div');
    navTabs.className = 'fdr-nav-tabs';
    const tabs: Array<{ id: LobbyTabId; label: string }> = [
      { id: 'play', label: 'PLAY' },
      { id: 'locker', label: 'LOCKER' },
      { id: 'controls', label: 'CONTROLS' },
      { id: 'settings', label: 'SETTINGS' },
    ];
    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fdr-nav-tab${tab.id === this.activeTab ? ' active' : ''}`;
      btn.innerHTML = `<span>${tab.label}</span>`;
      btn.addEventListener('click', () => {
        this.playClick();
        this.setTab(tab.id);
      });
      this.tabButtons.set(tab.id, btn);
      navTabs.appendChild(btn);
    }

    const rightGroup = document.createElement('div');
    rightGroup.className = 'fdr-lobby-right';

    const careerBox = document.createElement('div');
    careerBox.className = 'fdr-career-pill';
    this.careerLevelEl = document.createElement('span');
    this.careerLevelEl.className = 'fdr-career-level-tag';
    this.careerLevelEl.textContent = 'LVL 1';

    const careerProgressCol = document.createElement('div');
    careerProgressCol.className = 'fdr-career-progress-col';

    const careerTopRow = document.createElement('div');
    careerTopRow.className = 'fdr-career-top-row';
    this.careerMetaEl = document.createElement('span');
    this.careerMetaEl.textContent = '0W • 0 ELIMS';
    this.careerXpTextEl = document.createElement('span');
    this.careerXpTextEl.className = 'fdr-career-xp-label';
    this.careerXpTextEl.textContent = '0 / 500 XP';
    careerTopRow.append(this.careerMetaEl, this.careerXpTextEl);

    const careerTrack = document.createElement('div');
    careerTrack.className = 'fdr-career-xp-track';
    this.careerXpFillEl = document.createElement('div');
    this.careerXpFillEl.className = 'fdr-career-xp-fill';
    careerTrack.appendChild(this.careerXpFillEl);

    careerProgressCol.append(careerTopRow, careerTrack);
    careerBox.append(this.careerLevelEl, careerProgressCol);

    const badge = document.createElement('div');
    badge.className = 'fdr-lobby-badge';
    const crownSpan = document.createElement('span');
    crownSpan.style.width = '18px';
    crownSpan.style.height = '18px';
    crownSpan.style.display = 'inline-flex';
    crownSpan.innerHTML = getCrownSvg();
    this.badgeTextEl = document.createElement('span');
    badge.append(crownSpan, this.badgeTextEl);

    rightGroup.append(careerBox, badge);
    topBar.append(brand, navTabs, rightGroup);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'fdr-lobby-content';

    this.containerEl.append(topBar, this.contentEl);
    this.root.appendChild(this.containerEl);

    this.updateBadge();
    this.refreshCareerStats();
    this.renderTab();
  }

  setCallbacks(callbacks: LobbyScreenCallbacks): void {
    this.callbacks = callbacks;
  }

  setVisible(visible: boolean): void {
    this.containerEl.classList.toggle('fdr-hidden', !visible);
    if (visible) {
      this.refreshCareerStats();
    }
  }

  refreshCareerStats(): void {
    const stats = loadCareerStats();
    const prog = computeCareerLevelProgress(stats.xp);
    this.careerLevelEl.textContent = `LVL ${stats.level}`;
    this.careerMetaEl.textContent = `${stats.wins}W • ${stats.elims} ELIMS`;
    this.careerXpTextEl.textContent = prog.isMaxLevel
      ? `MAX • ${stats.xp} XP`
      : `${prog.xpIntoLevel} / ${prog.xpRequiredForNext} XP`;
    this.careerXpFillEl.style.width = `${Math.round(prog.progressRatio * 100)}%`;
  }

  getConfig(): LobbyConfig {
    return { ...this.config };
  }

  getSettings(): GameSettings {
    return cloneSettings(this.settings);
  }

  syncSettings(next: GameSettings): void {
    this.settings = cloneSettings(next);
    saveStoredSettings(this.settings);
    if (this.activeTab === 'settings' || this.activeTab === 'controls') {
      this.renderTab();
    }
  }

  private setTab(tab: LobbyTabId): void {
    if (this.activeTab === tab) return;
    this.stopListeningKeybind(false);
    this.activeTab = tab;
    for (const [id, btn] of this.tabButtons) {
      btn.classList.toggle('active', id === tab);
    }
    this.renderTab();
  }

  private getKeyEventTarget() {
    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function' &&
      typeof window.removeEventListener === 'function'
    ) {
      return window as unknown as {
        addEventListener: (
          type: string,
          fn: (e: KeyboardEvent) => void,
          capture?: boolean,
        ) => void;
        removeEventListener: (
          type: string,
          fn: (e: KeyboardEvent) => void,
          capture?: boolean,
        ) => void;
      };
    }
    if (
      typeof document !== 'undefined' &&
      typeof (document as unknown as EventTarget).addEventListener === 'function' &&
      typeof (document as unknown as EventTarget).removeEventListener === 'function'
    ) {
      return document as unknown as {
        addEventListener: (
          type: string,
          fn: (e: KeyboardEvent) => void,
          capture?: boolean,
        ) => void;
        removeEventListener: (
          type: string,
          fn: (e: KeyboardEvent) => void,
          capture?: boolean,
        ) => void;
      };
    }
    return null;
  }

  private stopListeningKeybind(rerender = false): void {
    if (this.keybindListener && this.keybindListenerTarget) {
      this.keybindListenerTarget.removeEventListener(
        'keydown',
        this.keybindListener,
        true,
      );
    }
    this.keybindListener = null;
    this.keybindListenerTarget = null;
    const hadAction = this.listeningKeybindAction !== null;
    this.listeningKeybindAction = null;
    if (rerender && hadAction && this.activeTab === 'settings') {
      this.renderTab();
    }
  }

  private startListeningKeybind(action: keyof KeybindMap): void {
    this.stopListeningKeybind(false);
    this.listeningKeybindAction = action;
    const target = this.getKeyEventTarget();
    if (target) {
      const handler = (e: KeyboardEvent) => {
        if (this.listeningKeybindAction !== action) return;
        e.preventDefault?.();
        e.stopPropagation?.();
        if (e.code === 'Escape' || e.key === 'Escape') {
          this.stopListeningKeybind(true);
          return;
        }
        const rawCode =
          typeof e.code === 'string' && e.code.trim().length > 0
            ? e.code.trim()
            : typeof e.key === 'string' && e.key.trim().length > 0
              ? e.key.trim().length === 1
                ? `Key${e.key.trim().toUpperCase()}`
                : e.key.trim()
              : '';
        if (!rawCode) return;

        const nextKeybinds: KeybindMap = {
          ...resolveKeybinds(this.settings.keybinds),
          [action]: rawCode,
        };
        this.settings = cloneSettings({
          ...this.settings,
          keybinds: nextKeybinds,
        });
        saveStoredSettings(this.settings);
        this.stopListeningKeybind(false);
        this.callbacks.onSettingsChange(cloneSettings(this.settings));
        if (this.activeTab === 'settings') {
          this.renderTab();
        }
      };
      this.keybindListener = handler;
      this.keybindListenerTarget = target;
      target.addEventListener('keydown', handler, true);
    }
    if (this.activeTab === 'settings') {
      this.renderTab();
    }
  }

  private updateBadge(): void {
    this.badgeTextEl.textContent = `${this.config.playerName} • ${this.config.botCount + 1}P`;
  }

  private playClick(): void {
    this.eventBus.emit('sound:play', { id: 'ui_click' });
  }

  private emitCosmetics(): void {
    saveStoredLobbyConfig(this.config);
    this.callbacks.onCosmeticChange({
      skinId: this.config.skinId,
      pickaxeId: this.config.pickaxeId,
      gliderId: this.config.gliderId,
      selectedEmote: this.config.selectedEmote,
    });
  }

  private renderTab(): void {
    this.contentEl.innerHTML = '';
    switch (this.activeTab) {
      case 'play':
        this.renderPlayTab();
        break;
      case 'locker':
        this.renderLockerTab();
        break;
      case 'controls':
        this.renderControlsTab();
        break;
      case 'settings':
        this.renderSettingsTab();
        break;
    }
  }

  private renderPlayTab(): void {
    const leftCol = document.createElement('div');
    leftCol.className = 'fdr-lobby-left';

    // Match Setup Card
    const setupCard = document.createElement('div');
    setupCard.className = 'fdr-glass-card';

    const head = document.createElement('div');
    head.className = 'fdr-section-head';
    head.innerHTML = `<span>SQUAD &amp; MATCH SETUP</span><span style="color:#ffd000">SOLO</span>`;

    const nameLabel = document.createElement('label');
    nameLabel.className = 'fdr-field-label';
    nameLabel.textContent = 'PLAYER CALLSIGN';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 18;
    nameInput.className = 'fdr-text-input';
    nameInput.value = this.config.playerName;
    nameInput.addEventListener('input', () => {
      const cleaned = nameInput.value.trim().slice(0, 18);
      this.config.playerName = cleaned || 'FORTDROPPER';
      saveStoredLobbyConfig(this.config);
      this.updateBadge();
    });

    const diffLabel = document.createElement('div');
    diffLabel.className = 'fdr-field-label';
    diffLabel.style.marginTop = '12px';
    diffLabel.textContent = 'BOT DIFFICULTY';

    const diffGroup = document.createElement('div');
    diffGroup.className = 'fdr-pill-group';
    const diffs: Array<{ id: Difficulty; label: string }> = [
      { id: 'casual', label: 'CASUAL' },
      { id: 'standard', label: 'STANDARD' },
      { id: 'sweaty', label: 'SWEATY' },
    ];
    for (const d of diffs) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `fdr-pill${this.config.difficulty === d.id ? ' active' : ''}`;
      pill.innerHTML = `<span>${d.label}</span>`;
      pill.addEventListener('click', () => {
        this.playClick();
        this.config.difficulty = d.id;
        saveStoredLobbyConfig(this.config);
        this.renderTab();
      });
      diffGroup.appendChild(pill);
    }

    const botLabel = document.createElement('div');
    botLabel.className = 'fdr-field-label';
    botLabel.style.marginTop = '12px';
    botLabel.style.display = 'flex';
    botLabel.style.justifyContent = 'space-between';

    const botLabelTitle = document.createElement('span');
    botLabelTitle.textContent = 'OPPONENT BOTS';
    const botLabelCount = document.createElement('span');
    botLabelCount.style.color = '#ffd000';
    botLabelCount.textContent = `${this.config.botCount} BOTS (${this.config.botCount + 1} TOTAL)`;
    botLabel.append(botLabelTitle, botLabelCount);

    const botSlider = document.createElement('input');
    botSlider.type = 'range';
    botSlider.min = '5';
    botSlider.max = '99';
    botSlider.step = '1';
    botSlider.value = String(this.config.botCount);
    botSlider.className = 'fdr-range';

    const botPresets = document.createElement('div');
    botPresets.className = 'fdr-pill-group';
    botPresets.style.marginTop = '6px';
    const presetCounts = [15, 29, 49, 75, 99];
    const presetButtons: HTMLButtonElement[] = [];

    const syncBotUI = (val: number) => {
      this.config.botCount = val;
      botLabelCount.textContent = `${val} BOTS (${val + 1} TOTAL)`;
      modeSub.textContent = `SOLO • ${val + 1} PLAYERS • 6 STORM PHASES`;
      this.updateBadge();
      presetButtons.forEach((btn, i) => {
        btn.classList.toggle('active', presetCounts[i] === val);
      });
      saveStoredLobbyConfig(this.config);
    };

    botSlider.addEventListener('input', () => {
      syncBotUI(Number(botSlider.value));
    });

    for (const count of presetCounts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fdr-pill${this.config.botCount === count ? ' active' : ''}`;
      btn.style.minWidth = '42px';
      btn.innerHTML = `<span>${count}</span>`;
      btn.addEventListener('click', () => {
        this.playClick();
        botSlider.value = String(count);
        syncBotUI(count);
      });
      presetButtons.push(btn);
      botPresets.appendChild(btn);
    }

    setupCard.append(
      head,
      nameLabel,
      nameInput,
      diffLabel,
      diffGroup,
      botLabel,
      botSlider,
      botPresets,
    );

    // Active Loadout + Dance Preview Card
    const loadoutCard = document.createElement('div');
    loadoutCard.className = 'fdr-glass-card';

    const skinName =
      SKINS.find((s) => s.id === this.config.skinId)?.name ?? 'Sky Striker';
    const pickaxeName =
      PICKAXES.find((p) => p.id === this.config.pickaxeId)?.name ??
      'Tactical Wedge';
    const gliderName =
      GLIDERS.find((g) => g.id === this.config.gliderId)?.name ?? 'Aero Wing';
    const emoteName =
      EMOTES.find((e) => e.id === this.config.selectedEmote)?.name ??
      'Victory Groove';

    const loadoutHead = document.createElement('div');
    loadoutHead.className = 'fdr-section-head';
    loadoutHead.innerHTML = `<span>ACTIVE LOADOUT</span><span style="color:#ffd000">READY</span>`;

    const loadoutMini = document.createElement('div');
    loadoutMini.className = 'fdr-loadout-mini';
    loadoutMini.innerHTML = `
      <div class="fdr-loadout-chip">OUTFIT<b>${skinName}</b></div>
      <div class="fdr-loadout-chip">PICKAXE<b>${pickaxeName}</b></div>
      <div class="fdr-loadout-chip">GLIDER<b>${gliderName}</b></div>
      <div class="fdr-loadout-chip">EMOTE<b>${emoteName}</b></div>
    `;

    const danceBtn = document.createElement('button');
    danceBtn.type = 'button';
    danceBtn.className = 'fdr-btn fdr-btn-cyan';
    danceBtn.style.width = '100%';
    danceBtn.style.marginTop = '10px';
    danceBtn.innerHTML = `<span>DANCE PREVIEW (${emoteName})</span>`;
    danceBtn.addEventListener('click', () => {
      this.playClick();
      this.callbacks.onPreviewEmote(this.config.selectedEmote);
    });

    loadoutCard.append(loadoutHead, loadoutMini, danceBtn);
    leftCol.append(setupCard, loadoutCard);

    // Right-Bottom Giant PLAY Dock
    const playDock = document.createElement('div');
    playDock.className = 'fdr-play-dock';

    const modeCard = document.createElement('div');
    modeCard.className = 'fdr-mode-card';
    const modeTitle = document.createElement('div');
    modeTitle.className = 'fdr-mode-title';
    modeTitle.textContent = 'BATTLE ROYALE — ZERO TO HERO';
    const modeSub = document.createElement('div');
    modeSub.className = 'fdr-mode-sub';
    modeSub.textContent = `SOLO • ${this.config.botCount + 1} PLAYERS • 6 STORM PHASES`;
    modeCard.append(modeTitle, modeSub);

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'fdr-play-btn';
    playBtn.innerHTML = '<span>PLAY!</span>';
    playBtn.addEventListener('click', () => {
      this.eventBus.emit('sound:play', { id: 'ui_play' });
      this.callbacks.onStartMatch(this.getConfig());
    });

    playDock.append(modeCard, playBtn);

    this.contentEl.append(leftCol, playDock);
  }

  private renderLockerTab(): void {
    const panel = document.createElement('div');
    panel.className = 'fdr-wide-panel';

    // Skins
    panel.appendChild(
      this.makeSectionHeader(`OUTFITS (${SKINS.length})`, 'LIVE 3D PREVIEW'),
    );
    const skinsGrid = document.createElement('div');
    skinsGrid.className = 'fdr-locker-grid';
    for (const skin of SKINS) {
      const selected = this.config.skinId === skin.id;
      const meta = getRarityMeta(skin.rarity);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `fdr-cosmetic-card rarity-${skin.rarity}${selected ? ' selected' : ''}`;
      card.innerHTML = `
        ${selected ? '<span class="fdr-equipped-tag">EQUIPPED</span>' : ''}
        <div class="fdr-swatch-bar">
          <span class="fdr-swatch-dot" style="background:${skin.primaryColor}"></span>
          <span class="fdr-swatch-dot" style="background:${skin.secondaryColor}"></span>
          <span class="fdr-swatch-dot" style="background:${skin.accentColor}"></span>
        </div>
        <div>
          <div class="fdr-card-rarity">${meta.label}</div>
          <div class="fdr-card-name">${skin.name}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        this.playClick();
        this.config.skinId = skin.id;
        this.emitCosmetics();
        this.renderTab();
      });
      skinsGrid.appendChild(card);
    }
    panel.appendChild(skinsGrid);

    // Pickaxes
    panel.appendChild(
      this.makeSectionHeader(
        `HARVESTING TOOLS (${PICKAXES.length})`,
        'STYLE & COLOR',
      ),
    );
    const pickGrid = document.createElement('div');
    pickGrid.className = 'fdr-locker-grid';
    for (const pick of PICKAXES) {
      const selected = this.config.pickaxeId === pick.id;
      const meta = getRarityMeta(pick.rarity);
      const crownTag =
        pick.rarity === 'mythic' && !selected
          ? `<span class="fdr-card-crown">${getCrownSvg()}</span>`
          : '';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `fdr-cosmetic-card rarity-${pick.rarity}${selected ? ' selected' : ''}`;
      card.innerHTML = `
        ${selected ? '<span class="fdr-equipped-tag">EQUIPPED</span>' : crownTag}
        <div class="fdr-swatch-bar">
          <span style="width:28px;height:28px;display:inline-flex">${getWeaponSvg('pickaxe')}</span>
          <span class="fdr-swatch-dot" style="background:${pick.headColor}"></span>
          <span class="fdr-swatch-dot" style="background:${pick.accentColor}"></span>
        </div>
        <div>
          <div class="fdr-card-rarity">${meta.label} • ${pick.style}</div>
          <div class="fdr-card-name">${pick.name}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        this.playClick();
        this.config.pickaxeId = pick.id;
        this.emitCosmetics();
        this.renderTab();
      });
      pickGrid.appendChild(card);
    }
    panel.appendChild(pickGrid);

    // Gliders
    panel.appendChild(
      this.makeSectionHeader(`GLIDERS (${GLIDERS.length})`, 'SKYDROP GEAR'),
    );
    const gliderGrid = document.createElement('div');
    gliderGrid.className = 'fdr-locker-grid';
    for (const glider of GLIDERS) {
      const selected = this.config.gliderId === glider.id;
      const meta = getRarityMeta(glider.rarity);
      const crownTag =
        glider.rarity === 'mythic' && !selected
          ? `<span class="fdr-card-crown">${getCrownSvg()}</span>`
          : '';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `fdr-cosmetic-card rarity-${glider.rarity}${selected ? ' selected' : ''}`;
      card.innerHTML = `
        ${selected ? '<span class="fdr-equipped-tag">EQUIPPED</span>' : crownTag}
        <div class="fdr-swatch-bar">
          <span class="fdr-swatch-dot" style="background:${glider.primaryColor}"></span>
          <span class="fdr-swatch-dot" style="background:${glider.accentColor}"></span>
        </div>
        <div>
          <div class="fdr-card-rarity">${meta.label} • ${glider.style}</div>
          <div class="fdr-card-name">${glider.name}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        this.playClick();
        this.config.gliderId = glider.id;
        this.emitCosmetics();
        this.renderTab();
      });
      gliderGrid.appendChild(card);
    }
    panel.appendChild(gliderGrid);

    // Emotes
    panel.appendChild(
      this.makeSectionHeader(
        `EMOTES (${EMOTES.length})`,
        'CLICK TO EQUIP & DANCE',
      ),
    );
    const emoteGrid = document.createElement('div');
    emoteGrid.className = 'fdr-locker-grid';
    for (const emote of EMOTES) {
      const selected = this.config.selectedEmote === emote.id;
      const meta = getRarityMeta(emote.rarity);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `fdr-cosmetic-card rarity-${emote.rarity}${selected ? ' selected' : ''}`;
      card.innerHTML = `
        ${selected ? '<span class="fdr-equipped-tag">EQUIPPED</span>' : ''}
        <div class="fdr-card-rarity">${meta.label} • ${emote.bpm} BPM</div>
        <div class="fdr-card-name">${emote.name}</div>
      `;
      card.addEventListener('click', () => {
        this.playClick();
        this.config.selectedEmote = emote.id;
        this.emitCosmetics();
        this.callbacks.onPreviewEmote(emote.id);
        this.renderTab();
      });
      emoteGrid.appendChild(card);
    }
    panel.appendChild(emoteGrid);

    this.contentEl.appendChild(panel);
  }

  private makeSectionHeader(left: string, right: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'fdr-locker-group-title';
    el.innerHTML = `<span>${left}</span><span style="font-size:13px;color:#38bdf8">${right}</span>`;
    return el;
  }

  private renderControlsTab(): void {
    const kb = resolveKeybinds(this.settings.keybinds);
    const panel = document.createElement('div');
    panel.className = 'fdr-wide-panel';
    panel.innerHTML = `
      <div class="fdr-locker-group-title" style="margin-top:0">
        <span>BATTLE CONTROLS CHEAT SHEET</span>
        <span style="font-size:13px;color:#38bdf8">PC KEYBOARD + MOUSE</span>
      </div>
      <div class="fdr-controls-grid">
        <div class="fdr-controls-box">
          <h4>MOVEMENT &amp; VEHICLES</h4>
          <div class="fdr-key-row"><span>Move / Drive Vehicle</span><span class="fdr-keycap">W A S D</span></div>
          <div class="fdr-key-row"><span>Jump / Mantle / Glider</span><span class="fdr-keycap">SPACE</span></div>
          <div class="fdr-key-row"><span>Sprint / Vehicle Boost</span><span class="fdr-keycap">SHIFT</span></div>
          <div class="fdr-key-row"><span>Crouch / Sprint-to-Slide</span><span class="fdr-keycap">${formatKeyCodeLabel(kb.crouchSlide)} / CTRL</span></div>
          <div class="fdr-key-row"><span>Vehicle Horn</span><span class="fdr-keycap">H</span></div>
        </div>
        <div class="fdr-controls-box">
          <h4>COMBAT &amp; LOOTING</h4>
          <div class="fdr-key-row"><span>Fire / Throw / Grappler / Pickaxe</span><span class="fdr-keycap">LEFT CLICK</span></div>
          <div class="fdr-key-row"><span>Aim Down Sights / Scope</span><span class="fdr-keycap">RIGHT CLICK</span></div>
          <div class="fdr-key-row"><span>Reload Weapon</span><span class="fdr-keycap">R</span></div>
          <div class="fdr-key-row"><span>Interact / Vehicle / Vault</span><span class="fdr-keycap">${formatKeyCodeLabel(kb.interact)}</span></div>
          <div class="fdr-key-row"><span>Inventory Slots (Pickaxe + 5)</span><span class="fdr-keycap">1 - 6 / WHEEL</span></div>
        </div>
        <div class="fdr-controls-box">
          <h4>BUILDING &amp; EDITING</h4>
          <div class="fdr-key-row"><span>Toggle Build Mode</span><span class="fdr-keycap">Q</span></div>
          <div class="fdr-key-row"><span>Wall / Floor / Ramp / Roof</span><span class="fdr-keycap">${formatKeyCodeLabel(kb.buildWall)} / ${formatKeyCodeLabel(kb.buildFloor)} / ${formatKeyCodeLabel(kb.buildRamp)} / ${formatKeyCodeLabel(kb.buildRoof)}</span></div>
          <div class="fdr-key-row"><span>Repair Damaged Structure</span><span class="fdr-keycap">${formatKeyCodeLabel(kb.repair)}</span></div>
          <div class="fdr-key-row"><span>Switch Material (Wood/Brick/Metal)</span><span class="fdr-keycap">RIGHT CLICK</span></div>
          <div class="fdr-key-row"><span>Rotate Piece / Edit Structure</span><span class="fdr-keycap">R / ${formatKeyCodeLabel(kb.edit)}</span></div>
        </div>
        <div class="fdr-controls-box">
          <h4>TACTICAL &amp; SOCIAL</h4>
          <div class="fdr-key-row"><span>Full Tactical Island Map</span><span class="fdr-keycap">${formatKeyCodeLabel(kb.map)}</span></div>
          <div class="fdr-key-row"><span>Set / Clear Map Waypoint</span><span class="fdr-keycap">LMB / RMB</span></div>
          <div class="fdr-key-row"><span>Emote Dance Wheel</span><span class="fdr-keycap">${formatKeyCodeLabel(kb.emote)}</span></div>
          <div class="fdr-key-row"><span>Spectate Next / Match Summary</span><span class="fdr-keycap">TAB / ESC</span></div>
        </div>
      </div>
    `;
    this.contentEl.appendChild(panel);
  }

  private renderSettingsTab(): void {
    const panel = document.createElement('div');
    panel.className = 'fdr-wide-panel';

    const header = document.createElement('div');
    header.className = 'fdr-locker-group-title';
    header.style.marginTop = '0';
    header.innerHTML = `<span>GAME SETTINGS</span><span style="font-size:13px;color:#34eb5e">AUTO-SAVED</span>`;

    const list = document.createElement('div');
    list.className = 'fdr-settings-list';

    const addSlider = (
      label: string,
      min: number,
      max: number,
      step: number,
      value: number,
      format: (v: number) => string,
      onChange: (v: number) => void,
    ) => {
      const row = document.createElement('div');
      row.className = 'fdr-setting-row';
      const lbl = document.createElement('div');
      lbl.className = 'fdr-setting-label';
      lbl.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'fdr-range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      const valEl = document.createElement('div');
      valEl.className = 'fdr-setting-val';
      valEl.textContent = format(value);

      input.addEventListener('input', () => {
        const num = Number(input.value);
        valEl.textContent = format(num);
        onChange(num);
        saveStoredSettings(this.settings);
        this.callbacks.onSettingsChange(cloneSettings(this.settings));
      });

      row.append(lbl, input, valEl);
      list.appendChild(row);
    };

    addSlider(
      'LOOK SENSITIVITY',
      0.2,
      3.0,
      0.05,
      this.settings.sensitivity,
      (v) => v.toFixed(2),
      (v) => {
        this.settings.sensitivity = v;
      },
    );
    addSlider(
      'ADS SENSITIVITY',
      0.2,
      2.0,
      0.05,
      this.settings.adsSensitivity,
      (v) => v.toFixed(2),
      (v) => {
        this.settings.adsSensitivity = v;
      },
    );
    addSlider(
      'FIELD OF VIEW (FOV)',
      60,
      110,
      1,
      this.settings.fov,
      (v) => `${Math.round(v)}°`,
      (v) => {
        this.settings.fov = v;
      },
    );
    addSlider(
      'MASTER VOLUME',
      0,
      1,
      0.05,
      this.settings.masterVolume,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        this.settings.masterVolume = v;
      },
    );
    addSlider(
      'SFX VOLUME',
      0,
      1,
      0.05,
      this.settings.sfxVolume,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        this.settings.sfxVolume = v;
      },
    );
    addSlider(
      'MUSIC VOLUME',
      0,
      1,
      0.05,
      this.settings.musicVolume,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        this.settings.musicVolume = v;
      },
    );

    // Graphics Quality Pills
    const gfxRow = document.createElement('div');
    gfxRow.className = 'fdr-setting-row';
    const gfxLabel = document.createElement('div');
    gfxLabel.className = 'fdr-setting-label';
    gfxLabel.textContent = 'GRAPHICS QUALITY';
    const gfxGroup = document.createElement('div');
    gfxGroup.className = 'fdr-pill-group';
    const qualities: GraphicsQuality[] = ['low', 'medium', 'high'];
    for (const q of qualities) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fdr-pill${this.settings.graphicsQuality === q ? ' active' : ''}`;
      btn.innerHTML = `<span>${q.toUpperCase()}</span>`;
      btn.addEventListener('click', () => {
        this.playClick();
        this.settings.graphicsQuality = q;
        saveStoredSettings(this.settings);
        this.callbacks.onSettingsChange(cloneSettings(this.settings));
        this.renderTab();
      });
      gfxGroup.appendChild(btn);
    }
    const gfxVal = document.createElement('div');
    gfxVal.className = 'fdr-setting-val';
    gfxVal.textContent = this.settings.graphicsQuality.toUpperCase();
    gfxRow.append(gfxLabel, gfxGroup, gfxVal);
    list.appendChild(gfxRow);

    // Boolean Toggles
    const addToggle = (
      label: string,
      current: boolean,
      onToggle: (next: boolean) => void,
    ) => {
      const row = document.createElement('div');
      row.className = 'fdr-setting-row';
      const lbl = document.createElement('div');
      lbl.className = 'fdr-setting-label';
      lbl.textContent = label;
      const btnWrap = document.createElement('div');
      btnWrap.className = 'fdr-pill-group';
      const onBtn = document.createElement('button');
      onBtn.type = 'button';
      onBtn.className = `fdr-pill${current ? ' active' : ''}`;
      onBtn.innerHTML = '<span>ON</span>';
      const offBtn = document.createElement('button');
      offBtn.type = 'button';
      offBtn.className = `fdr-pill${!current ? ' active' : ''}`;
      offBtn.innerHTML = '<span>OFF</span>';

      onBtn.addEventListener('click', () => {
        this.playClick();
        onToggle(true);
        saveStoredSettings(this.settings);
        this.callbacks.onSettingsChange(cloneSettings(this.settings));
        this.renderTab();
      });
      offBtn.addEventListener('click', () => {
        this.playClick();
        onToggle(false);
        saveStoredSettings(this.settings);
        this.callbacks.onSettingsChange(cloneSettings(this.settings));
        this.renderTab();
      });

      btnWrap.append(onBtn, offBtn);
      const valEl = document.createElement('div');
      valEl.className = 'fdr-setting-val';
      valEl.textContent = current ? 'ON' : 'OFF';
      row.append(lbl, btnWrap, valEl);
      list.appendChild(row);
    };

    addToggle('SHOW FPS COUNTER', this.settings.showFps, (next) => {
      this.settings.showFps = next;
    });
    addToggle('INVERT Y-AXIS', this.settings.invertY, (next) => {
      this.settings.invertY = next;
    });

    // Keybind Controls Section
    const keybindsSection = document.createElement('div');
    keybindsSection.className = 'fdr-keybinds-section';

    const kbHead = document.createElement('div');
    kbHead.className = 'fdr-keybinds-head';
    const kbTitleGroup = document.createElement('div');
    kbTitleGroup.innerHTML = `
      <div class="fdr-keybinds-title">KEYBIND CONTROLS</div>
      <div class="fdr-keybinds-sub">CLICK ANY BINDING THEN PRESS A NEW KEY (ESC TO CANCEL)</div>
    `;

    const resetKeybindsBtn = document.createElement('button');
    resetKeybindsBtn.type = 'button';
    resetKeybindsBtn.className = 'fdr-btn fdr-btn-dark fdr-keybind-reset-btn';
    resetKeybindsBtn.innerHTML = '<span>RESET KEYBINDS</span>';
    resetKeybindsBtn.addEventListener('click', () => {
      this.playClick();
      this.stopListeningKeybind(false);
      this.settings = cloneSettings({
        ...this.settings,
        keybinds: { ...DEFAULT_KEYBINDS },
      });
      saveStoredSettings(this.settings);
      this.callbacks.onSettingsChange(cloneSettings(this.settings));
      this.renderTab();
    });

    kbHead.append(kbTitleGroup, resetKeybindsBtn);

    const kbGrid = document.createElement('div');
    kbGrid.className = 'fdr-keybinds-grid';
    const activeKeybinds = resolveKeybinds(this.settings.keybinds);

    for (const def of KEYBIND_ACTION_DEFS) {
      const row = document.createElement('div');
      row.className = 'fdr-keybind-row';

      const lbl = document.createElement('span');
      lbl.className = 'fdr-keybind-label';
      lbl.textContent = def.label;

      const isListening = this.listeningKeybindAction === def.key;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fdr-keybind-btn${isListening ? ' listening' : ''}`;
      btn.dataset.keybindAction = def.key;
      btn.textContent = isListening
        ? 'PRESS A KEY...'
        : formatKeyCodeLabel(activeKeybinds[def.key]);

      btn.addEventListener('click', () => {
        this.playClick();
        if (this.listeningKeybindAction === def.key) {
          this.stopListeningKeybind(true);
        } else {
          this.startListeningKeybind(def.key);
        }
      });

      row.append(lbl, btn);
      kbGrid.appendChild(row);
    }

    keybindsSection.append(kbHead, kbGrid);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'fdr-btn fdr-btn-dark';
    resetBtn.style.marginTop = '12px';
    resetBtn.innerHTML = '<span>RESET TO DEFAULTS</span>';
    resetBtn.addEventListener('click', () => {
      this.playClick();
      this.stopListeningKeybind(false);
      this.settings = cloneSettings(DEFAULT_SETTINGS);
      saveStoredSettings(this.settings);
      this.callbacks.onSettingsChange(cloneSettings(this.settings));
      this.renderTab();
    });

    panel.append(header, list, keybindsSection, resetBtn);
    this.contentEl.appendChild(panel);
  }

  dispose(): void {
    this.stopListeningKeybind(false);
    this.containerEl.remove();
  }
}
