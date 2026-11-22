import { EventBus } from '../core';
import type { BannerMessage, GameSettings, MatchSummary } from '../types';
import {
  computeCareerLevelProgress,
  recordMatchCareerStats,
} from './CareerProfile';
import {
  cloneSettings,
  deriveMatchHighlightBadges,
  formatSurvivalTime,
  getAugmentMeta,
  getGameModeMeta,
} from './UIHelpers';
import {
  getAugmentIconSvg,
  getBountyTargetSvg,
  getCrownSvg,
  getSkullSvg,
} from './WeaponIcons';

export interface MatchOverlayCallbacks {
  onResume: () => void;
  onPlayAgain: () => void;
  onReturnLobby: () => void;
  onSettingsChange: (settings: GameSettings) => void;
}

export class MatchOverlay {
  private readonly root: HTMLElement;
  private readonly eventBus: EventBus;
  private callbacks: MatchOverlayCallbacks;
  private settings: GameSettings;

  private bannerLayerEl: HTMLDivElement;
  private poiLayerEl: HTMLDivElement;
  private pauseBackdropEl: HTMLDivElement;
  private pauseCardEl: HTMLDivElement;
  private summaryBackdropEl: HTMLDivElement;
  private summaryCardEl: HTMLDivElement;

  private pauseOpen = false;
  private summaryOpen = false;
  private activeBannerTimers = new Set<ReturnType<typeof setTimeout>>();
  private poiTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    root: HTMLElement,
    eventBus: EventBus,
    settings: GameSettings,
    callbacks: MatchOverlayCallbacks,
  ) {
    this.root = root;
    this.eventBus = eventBus;
    this.settings = cloneSettings(settings);
    this.callbacks = callbacks;

    this.bannerLayerEl = document.createElement('div');
    this.bannerLayerEl.className = 'fdr-banner-layer';

    this.poiLayerEl = document.createElement('div');
    this.poiLayerEl.className = 'fdr-poi-layer';

    this.pauseBackdropEl = document.createElement('div');
    this.pauseBackdropEl.className = 'fdr-modal-backdrop fdr-hidden';
    this.pauseCardEl = document.createElement('div');
    this.pauseCardEl.className = 'fdr-modal-card';
    this.pauseBackdropEl.appendChild(this.pauseCardEl);

    this.summaryBackdropEl = document.createElement('div');
    this.summaryBackdropEl.className = 'fdr-modal-backdrop fdr-hidden';
    this.summaryCardEl = document.createElement('div');
    this.summaryCardEl.className = 'fdr-modal-card fdr-summary-card';
    this.summaryBackdropEl.appendChild(this.summaryCardEl);

    this.root.append(
      this.bannerLayerEl,
      this.poiLayerEl,
      this.pauseBackdropEl,
      this.summaryBackdropEl,
    );
  }

  setCallbacks(callbacks: MatchOverlayCallbacks): void {
    this.callbacks = callbacks;
  }

  setSettings(settings: GameSettings): void {
    this.settings = cloneSettings(settings);
    if (this.pauseOpen) {
      this.renderPauseMenu();
    }
  }

  isPauseOpen(): boolean {
    return this.pauseOpen;
  }

  isSummaryOpen(): boolean {
    return this.summaryOpen;
  }

  showBanner(banner: BannerMessage): void {
    const toast = document.createElement('div');
    toast.className = `fdr-banner-toast ${banner.tone}`;
    toast.dataset.bannerId = banner.id;

    const inner = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'fdr-banner-title';
    title.textContent = banner.title;
    inner.appendChild(title);

    if (banner.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'fdr-banner-sub';
      sub.textContent = banner.subtitle;
      inner.appendChild(sub);
    }

    toast.appendChild(inner);
    this.bannerLayerEl.appendChild(toast);

    while (this.bannerLayerEl.children.length > 3) {
      this.bannerLayerEl.firstElementChild?.remove();
    }

    const duration = Math.max(800, banner.durationMs || 3000);
    const timer = setTimeout(() => {
      this.activeBannerTimers.delete(timer);
      toast.remove();
    }, duration);
    this.activeBannerTimers.add(timer);
  }

  showBountyToast(ev: {
    title: string;
    targetName: string;
    tone: 'start' | 'complete' | 'expired';
  }): void {
    const toast = document.createElement('div');
    toast.className = `fdr-bounty-toast tone-${ev.tone}`;
    toast.dataset.bountyTone = ev.tone;

    const icon = document.createElement('span');
    icon.className = 'fdr-bounty-toast-icon';
    icon.innerHTML = getBountyTargetSvg();

    const textCol = document.createElement('div');
    textCol.className = 'fdr-bounty-toast-text';

    const titleEl = document.createElement('div');
    titleEl.className = 'fdr-banner-title';
    titleEl.textContent = ev.title;

    const targetEl = document.createElement('div');
    targetEl.className = 'fdr-banner-sub';
    targetEl.textContent =
      ev.tone === 'complete'
        ? `ELIMINATED TARGET: ${ev.targetName}`
        : ev.tone === 'expired'
          ? `CONTRACT EXPIRED: ${ev.targetName}`
          : `HUNT TARGET: ${ev.targetName}`;

    textCol.append(titleEl, targetEl);
    toast.append(icon, textCol);
    this.bannerLayerEl.appendChild(toast);

    while (this.bannerLayerEl.children.length > 3) {
      this.bannerLayerEl.firstElementChild?.remove();
    }

    const timer = setTimeout(() => {
      this.activeBannerTimers.delete(timer);
      toast.remove();
    }, 3400);
    this.activeBannerTimers.add(timer);
  }

  showPoiDiscover(poiName: string, subtitle: string): void {
    this.clearPoiDiscover();

    const toast = document.createElement('div');
    toast.className = 'fdr-poi-toast';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'fdr-poi-eyebrow';
    eyebrow.textContent = 'LOCATION DISCOVERED';

    const title = document.createElement('div');
    title.className = 'fdr-poi-name';
    title.textContent = poiName;

    const rule = document.createElement('div');
    rule.className = 'fdr-poi-rule';

    const sub = document.createElement('div');
    sub.className = 'fdr-poi-sub';
    sub.textContent = subtitle;

    toast.append(eyebrow, title, rule);
    if (subtitle) {
      toast.appendChild(sub);
    }
    this.poiLayerEl.appendChild(toast);

    this.poiTimer = setTimeout(() => {
      this.poiTimer = null;
      toast.remove();
    }, 3200);
  }

  clearPoiDiscover(): void {
    if (this.poiTimer !== null) {
      clearTimeout(this.poiTimer);
      this.poiTimer = null;
    }
    this.poiLayerEl.innerHTML = '';
  }

  clearBanners(): void {
    for (const timer of this.activeBannerTimers) {
      clearTimeout(timer);
    }
    this.activeBannerTimers.clear();
    this.bannerLayerEl.innerHTML = '';
    this.clearPoiDiscover();
  }

  setPauseMenuOpen(open: boolean): boolean {
    this.pauseOpen = open;
    if (open) {
      this.renderPauseMenu();
    }
    this.pauseBackdropEl.classList.toggle('fdr-hidden', !open);
    return this.pauseOpen;
  }

  togglePauseMenu(force?: boolean): boolean {
    const next = typeof force === 'boolean' ? force : !this.pauseOpen;
    return this.setPauseMenuOpen(next);
  }

  showMatchSummary(summary: MatchSummary): void {
    this.setPauseMenuOpen(false);
    this.summaryOpen = true;
    this.renderMatchSummary(summary);
    this.summaryBackdropEl.classList.remove('fdr-hidden');
  }

  hideMatchSummary(): void {
    this.summaryOpen = false;
    this.summaryBackdropEl.classList.add('fdr-hidden');
  }

  private playClick(): void {
    this.eventBus.emit('sound:play', { id: 'ui_click' });
  }

  private renderPauseMenu(): void {
    this.pauseCardEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'fdr-modal-header';
    header.innerHTML = `<div class="fdr-victory-title" style="font-size:32px;color:#22d3ee;text-shadow:0 3px 0 #075985">MATCH PAUSED</div>`;

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
      row.style.gridTemplateColumns = '150px 1fr 56px';
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
        this.callbacks.onSettingsChange(cloneSettings(this.settings));
      });

      row.append(lbl, input, valEl);
      list.appendChild(row);
    };

    addSlider(
      'SENSITIVITY',
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
      'FOV',
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

    const actions = document.createElement('div');
    actions.className = 'fdr-modal-actions';
    actions.style.marginTop = '18px';

    const resumeBtn = document.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.className = 'fdr-btn fdr-btn-gold';
    resumeBtn.innerHTML = '<span>RESUME MATCH</span>';
    resumeBtn.addEventListener('click', () => {
      this.playClick();
      this.setPauseMenuOpen(false);
      this.callbacks.onResume();
    });

    const playAgainBtn = document.createElement('button');
    playAgainBtn.type = 'button';
    playAgainBtn.className = 'fdr-btn fdr-btn-cyan';
    playAgainBtn.innerHTML = '<span>PLAY AGAIN</span>';
    playAgainBtn.addEventListener('click', () => {
      this.playClick();
      this.setPauseMenuOpen(false);
      this.callbacks.onPlayAgain();
    });

    const lobbyBtn = document.createElement('button');
    lobbyBtn.type = 'button';
    lobbyBtn.className = 'fdr-btn fdr-btn-dark';
    lobbyBtn.innerHTML = '<span>RETURN TO LOBBY</span>';
    lobbyBtn.addEventListener('click', () => {
      this.playClick();
      this.setPauseMenuOpen(false);
      this.callbacks.onReturnLobby();
    });

    actions.append(resumeBtn, playAgainBtn, lobbyBtn);
    this.pauseCardEl.append(header, list, actions);
  }

  private renderMatchSummary(summary: MatchSummary): void {
    this.summaryCardEl.innerHTML = '';
    const isCrownedVictory = Boolean(summary.crownedVictory);
    this.summaryCardEl.classList.toggle(
      'crowned-victory',
      Boolean(summary.victory && isCrownedVictory),
    );

    const header = document.createElement('div');
    header.className = 'fdr-modal-header';

    const iconWrap = document.createElement('span');
    iconWrap.style.width = '48px';
    iconWrap.style.height = '48px';
    iconWrap.style.display = 'inline-flex';
    iconWrap.innerHTML = summary.victory ? getCrownSvg() : getSkullSvg();

    const title = document.createElement('div');
    title.className = summary.victory ? 'fdr-victory-title' : 'fdr-elim-title';
    const rumbleScore = summary.teamRumbleScore;
    title.textContent = rumbleScore
      ? summary.victory
        ? 'TEAM RUMBLE VICTORY!'
        : 'TEAM RUMBLE DEFEAT'
      : summary.victory
        ? '#1 VICTORY ROYALE!'
        : 'ELIMINATED';

    header.append(iconWrap, title);

    const crownedBannerEl = isCrownedVictory
      ? document.createElement('div')
      : null;
    if (crownedBannerEl) {
      crownedBannerEl.className = 'fdr-crowned-victory-banner';
      crownedBannerEl.innerHTML = `
        <span class="fdr-crowned-banner-icon">${getCrownSvg()}</span>
        <span>CROWNED VICTORY ROYALE!</span>
        <span class="fdr-crowned-banner-icon">${getCrownSvg()}</span>
      `;
    }

    const modeMeta = getGameModeMeta(summary.gameMode);
    const modeRow = document.createElement('div');
    modeRow.className = 'fdr-summary-mode-row';
    const modeBadge = document.createElement('span');
    modeBadge.className = `fdr-summary-mode-badge mode-${modeMeta.id}`;
    modeBadge.textContent = `${modeMeta.name} • ${modeMeta.badge}`;
    modeRow.appendChild(modeBadge);

    if (rumbleScore) {
      const blue = Math.max(0, Math.round(rumbleScore.blue));
      const red = Math.max(0, Math.round(rumbleScore.red));
      const rumblePill = document.createElement('span');
      rumblePill.className = `fdr-rumble-score-pill${summary.victory ? ' victory' : ' defeat'}`;
      rumblePill.innerHTML = `<span class="blue">BLUE ${blue}</span><span class="sep"> - </span><span class="red">${red} RED</span>`;
      modeRow.appendChild(rumblePill);
    }

    const sub = document.createElement('div');
    sub.className = 'fdr-summary-sub';
    if (rumbleScore) {
      const blue = Math.max(0, Math.round(rumbleScore.blue));
      const red = Math.max(0, Math.round(rumbleScore.red));
      const target = Math.max(1, Math.round(rumbleScore.target));
      sub.textContent = summary.victory
        ? `BLUE TEAM WON ${blue} - ${red} (FIRST TO ${target})`
        : `RED TEAM WON ${red} - ${blue} (FIRST TO ${target})`;
    } else if (summary.victory) {
      sub.textContent = `LAST SURVIVOR OUT OF ${summary.totalPlayers} PLAYERS`;
    } else if (summary.eliminatedBy) {
      sub.textContent = `PLACED #${summary.placement} / ${summary.totalPlayers} • ELIMINATED BY ${summary.eliminatedBy}`;
    } else {
      sub.textContent = `PLACED #${summary.placement} / ${summary.totalPlayers}`;
    }

    const accPct =
      summary.accuracy > 1
        ? Math.round(summary.accuracy)
        : summary.shotsFired > 0
          ? Math.round((summary.shotsHit / summary.shotsFired) * 100)
          : Math.round(summary.accuracy * 100);

    const statsGrid = document.createElement('div');
    statsGrid.className = 'fdr-stats-grid';
    const poisCaptured = Math.max(0, Math.floor(summary.poisCaptured ?? 0));
    const goldEarned = Math.max(0, Math.round(summary.goldEarned ?? 0));
    const medallionsCount = Array.isArray(summary.medallionsHeld)
      ? summary.medallionsHeld.length
      : 0;
    const revivesCount = Math.max(0, Math.floor(summary.revives ?? 0));
    const statItems: Array<{
      k: string;
      v: string;
      highlight?: boolean;
      wide?: boolean;
    }> = [
      {
        k: 'PLACEMENT',
        v: `#${summary.placement} / ${summary.totalPlayers}`,
        highlight: summary.victory,
      },
      { k: 'ELIMINATIONS', v: String(summary.kills), highlight: true },
      { k: 'DAMAGE DEALT', v: String(Math.round(summary.damageDealt)) },
      {
        k: 'ACCURACY',
        v: `${accPct}% (${summary.shotsHit}/${summary.shotsFired})`,
      },
      { k: 'HEADSHOTS', v: String(summary.headshots) },
      { k: 'STRUCTURES BUILT', v: String(summary.structuresBuilt) },
      { k: 'CHESTS OPENED', v: String(summary.chestsOpened) },
      {
        k: 'SURVIVAL TIME',
        v: formatSurvivalTime(summary.survivalTimeSec),
      },
      {
        k: 'POIS CAPTURED',
        v: String(poisCaptured),
        highlight: poisCaptured > 0,
      },
      {
        k: 'GOLD EARNED',
        v: String(goldEarned),
        highlight: goldEarned > 0,
      },
      {
        k: 'MEDALLIONS',
        v: String(medallionsCount),
        highlight: medallionsCount > 0,
      },
      {
        k: 'REVIVES',
        v: String(revivesCount),
        highlight: revivesCount > 0,
      },
    ];

    const arcChainHits =
      typeof summary.arcChainHits === 'number' &&
      Number.isFinite(summary.arcChainHits)
        ? Math.max(0, Math.round(summary.arcChainHits))
        : 0;
    if (arcChainHits > 0) {
      statItems.push({
        k: 'ARC CHAIN HITS',
        v: String(arcChainHits),
        highlight: true,
      });
    }

    const runeMonolithsAttuned =
      typeof summary.runeMonolithsAttuned === 'number' &&
      Number.isFinite(summary.runeMonolithsAttuned)
        ? Math.max(0, Math.round(summary.runeMonolithsAttuned))
        : 0;
    if (runeMonolithsAttuned > 0) {
      statItems.push({
        k: 'RUNES ATTUNED',
        v: String(runeMonolithsAttuned),
        highlight: true,
      });
    }

    const choppaFlightSec =
      typeof summary.choppaFlightSec === 'number' &&
      Number.isFinite(summary.choppaFlightSec)
        ? Math.max(0, Math.round(summary.choppaFlightSec))
        : 0;
    if (choppaFlightSec > 0) {
      statItems.push({
        k: 'CHOPPA FLIGHT',
        v: `${choppaFlightSec}s`,
        highlight: true,
      });
    }

    for (const item of statItems) {
      const box = document.createElement('div');
      box.className = `fdr-stat-box${item.highlight ? ' highlight' : ''}${item.wide ? ' fdr-stat-box-wide' : ''}`;
      box.innerHTML = `
        <div class="fdr-stat-k">${item.k}</div>
        <div class="fdr-stat-v">${item.v}</div>
      `;
      statsGrid.appendChild(box);
    }

    const highlightBadges = deriveMatchHighlightBadges(summary);
    const highlightsRow =
      highlightBadges.length > 0 ? document.createElement('div') : null;
    if (highlightsRow) {
      highlightsRow.className = 'fdr-highlights-row';
      for (const badge of highlightBadges) {
        const pill = document.createElement('span');
        pill.className = `fdr-highlight-badge tone-${badge.tone}`;
        pill.dataset.highlight = badge.label;
        pill.textContent = badge.label;
        highlightsRow.appendChild(pill);
      }
    }

    const activeAugments = Array.isArray(summary.activeAugments)
      ? summary.activeAugments
      : [];
    const augmentsRow = document.createElement('div');
    augmentsRow.className = 'fdr-summary-augments';
    if (activeAugments.length > 0) {
      const augTitle = document.createElement('div');
      augTitle.className = 'fdr-summary-augments-title';
      augTitle.textContent = 'REALITY AUGMENTS';
      const augList = document.createElement('div');
      augList.className = 'fdr-summary-augments-list';
      for (const augId of activeAugments) {
        const def = getAugmentMeta(augId);
        const badgeEl = document.createElement('div');
        badgeEl.className = 'fdr-summary-augment-badge';
        badgeEl.dataset.augmentId = def.id;
        badgeEl.style.borderColor = def.accentColor;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'fdr-summary-augment-icon';
        iconSpan.innerHTML = getAugmentIconSvg(def.id);

        const txtCol = document.createElement('div');
        txtCol.className = 'fdr-summary-augment-text';
        const tag = document.createElement('span');
        tag.className = 'fdr-summary-augment-tag';
        tag.style.color = def.accentColor;
        tag.textContent = def.badge;
        const name = document.createElement('span');
        name.className = 'fdr-summary-augment-name';
        name.textContent = def.name;
        txtCol.append(tag, name);

        badgeEl.append(iconSpan, txtCol);
        augList.appendChild(badgeEl);
      }
      augmentsRow.append(augTitle, augList);
    }

    const career = recordMatchCareerStats(summary);
    const xpInfo = career.lastMatchXp;
    const progress = computeCareerLevelProgress(career.xp);

    const xpPanel = document.createElement('div');
    xpPanel.className = 'fdr-xp-breakdown-card';

    const xpHead = document.createElement('div');
    xpHead.className = 'fdr-xp-breakdown-head';
    const levelLabel = xpInfo?.leveledUp
      ? `<span class="fdr-levelup-badge">LEVEL UP! LVL ${xpInfo.previousLevel} → ${career.level}</span>`
      : `<span class="fdr-xp-level-chip">CAREER LVL ${career.level}</span>`;
    xpHead.innerHTML = `
      <div class="fdr-xp-title-group">
        <span>MATCH XP EARNED</span>
        ${levelLabel}
      </div>
      <div class="fdr-xp-total">+${xpInfo?.totalXp ?? 0} XP</div>
    `;

    const xpRows = document.createElement('div');
    xpRows.className = 'fdr-xp-chips';
    const breakdownChips: Array<{ label: string; val: number; gold?: boolean }> = [
      { label: 'SURVIVAL', val: xpInfo?.survivalXp ?? 0 },
      { label: 'ELIMS', val: xpInfo?.elimXp ?? 0 },
      { label: 'DAMAGE', val: xpInfo?.damageXp ?? 0 },
      { label: 'PLACEMENT', val: xpInfo?.placementXp ?? 0 },
    ];
    if ((xpInfo?.victoryBonusXp ?? 0) > 0) {
      breakdownChips.push({
        label: 'VICTORY BONUS',
        val: xpInfo?.victoryBonusXp ?? 0,
        gold: true,
      });
    }
    for (const chip of breakdownChips) {
      const el = document.createElement('div');
      el.className = `fdr-xp-chip${chip.gold ? ' gold' : ''}`;
      el.innerHTML = `<span>${chip.label}</span><b>+${chip.val}</b>`;
      xpRows.appendChild(el);
    }

    const questsCompleted = Math.max(
      0,
      Math.floor(summary.questsCompleted ?? 0),
    );
    const questBonusXp = xpInfo?.bonusXp ?? Math.max(0, Math.round(summary.bonusXp ?? 0));
    const questRow = document.createElement('div');
    questRow.className = 'fdr-summary-quest-row';
    questRow.innerHTML = `
      <span class="fdr-summary-quest-done">QUESTS COMPLETED: <b>${questsCompleted} / ${Math.max(3, questsCompleted)}</b></span>
      <span class="fdr-summary-quest-bonus">BONUS XP: <b>+${questBonusXp} XP</b></span>
    `;

    const barWrap = document.createElement('div');
    barWrap.className = 'fdr-summary-xp-bar-wrap';
    const barMeta = document.createElement('div');
    barMeta.className = 'fdr-summary-xp-meta';
    barMeta.innerHTML = `
      <span>CAREER: ${career.wins} WINS • ${career.elims} ELIMS</span>
      <span>${progress.isMaxLevel ? `MAX LEVEL (${career.xp} XP)` : `${progress.xpIntoLevel} / ${progress.xpRequiredForNext} XP TO LVL ${career.level + 1}`}</span>
    `;
    const barTrack = document.createElement('div');
    barTrack.className = 'fdr-career-xp-track';
    const barFill = document.createElement('div');
    barFill.className = 'fdr-career-xp-fill';
    barFill.style.width = `${Math.round(progress.progressRatio * 100)}%`;
    barTrack.appendChild(barFill);
    barWrap.append(barMeta, barTrack);

    xpPanel.append(xpHead, xpRows, questRow, barWrap);

    const actions = document.createElement('div');
    actions.className = 'fdr-modal-actions';

    const playAgainBtn = document.createElement('button');
    playAgainBtn.type = 'button';
    playAgainBtn.className = 'fdr-btn fdr-btn-gold';
    playAgainBtn.innerHTML = '<span>PLAY AGAIN</span>';
    playAgainBtn.addEventListener('click', () => {
      this.playClick();
      this.hideMatchSummary();
      this.callbacks.onPlayAgain();
    });

    const lobbyBtn = document.createElement('button');
    lobbyBtn.type = 'button';
    lobbyBtn.className = 'fdr-btn fdr-btn-cyan';
    lobbyBtn.innerHTML = '<span>RETURN TO LOBBY</span>';
    lobbyBtn.addEventListener('click', () => {
      this.playClick();
      this.hideMatchSummary();
      this.callbacks.onReturnLobby();
    });

    actions.append(playAgainBtn, lobbyBtn);
    this.summaryCardEl.append(header);
    if (crownedBannerEl) {
      this.summaryCardEl.append(crownedBannerEl);
    }
    this.summaryCardEl.append(modeRow, sub, statsGrid);
    if (highlightsRow) {
      this.summaryCardEl.append(highlightsRow);
    }
    if (activeAugments.length > 0) {
      this.summaryCardEl.append(augmentsRow);
    }
    this.summaryCardEl.append(xpPanel, actions);
  }

  dispose(): void {
    this.clearBanners();
    this.bannerLayerEl.remove();
    this.poiLayerEl.remove();
    this.pauseBackdropEl.remove();
    this.summaryBackdropEl.remove();
  }
}
