import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  EMOTES,
  EventBus,
  GLIDERS,
  PICKAXES,
  POIS,
  RARITY_ORDER,
  SKINS,
  WEAPONS,
  WORLD_HALF,
} from '../../core';
import type {
  AmmoType,
  BiomeType,
  BuildPieceType,
  HUDState,
  MaterialType,
  MatchSummary,
  WeaponId,
} from '../../types';
import {
  BOSS_POI_LABELS,
  computeCareerLevelProgress,
  computeFallbackStormDistance,
  computeLevelFromXp,
  computeMatchXpBreakdown,
  formatBiomeLabel,
  formatCompassTicks,
  formatCountdown,
  formatSafeZoneDistance,
  formatSurvivalTime,
  FullMapOverlay,
  getAmmoIconSvg,
  getBearingDeg,
  getBuildIconSvg,
  getContextualHudHints,
  getCrownSvg,
  getHeadingFromYaw,
  getKillStreakCallout,
  getMaterialIconSvg,
  getRarityMeta,
  getShortestAngleDiffDeg,
  getSkullSvg,
  getStormEyeSvg,
  getTotalXpForLevel,
  getWeaponSvg,
  loadCareerStats,
  loadStoredLobbyConfig,
  loadStoredSettings,
  mapNormToWorld,
  MAX_CAREER_LEVEL,
  normalizeDegrees,
  recordMatchCareerStats,
  resetCareerStats,
  UIManager,
  worldToMapNorm,
  xpForLevelStep,
} from '../index';

describe('UIHelpers', () => {
  it('normalizes degrees cleanly into [0, 360)', () => {
    expect(normalizeDegrees(0)).toBe(0);
    expect(normalizeDegrees(-0)).toBe(0);
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(450)).toBe(90);
    expect(normalizeDegrees(Number.NaN)).toBe(0);
  });

  it('converts Three.js camera yaw to compass heading (0=N, 90=E, 180=S, 270=W)', () => {
    expect(getHeadingFromYaw(0)).toBeCloseTo(0, 6);
    expect(getHeadingFromYaw(-Math.PI / 2)).toBeCloseTo(90, 6);
    expect(getHeadingFromYaw(Math.PI)).toBeCloseTo(180, 6);
    expect(getHeadingFromYaw(-Math.PI)).toBeCloseTo(180, 6);
    expect(getHeadingFromYaw(Math.PI / 2)).toBeCloseTo(270, 6);
    expect(getHeadingFromYaw(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('computes shortest signed angle diff in [-180, 180)', () => {
    expect(getShortestAngleDiffDeg(10, 350)).toBe(20);
    expect(getShortestAngleDiffDeg(350, 10)).toBe(-20);
    expect(getShortestAngleDiffDeg(90, 0)).toBe(90);
    expect(getShortestAngleDiffDeg(0, 180)).toBe(-180);
  });

  it('computes compass bearing from world coordinates (-Z=N, +X=E)', () => {
    expect(getBearingDeg(0, 0, 0, -100)).toBeCloseTo(0, 5);
    expect(getBearingDeg(0, 0, 100, 0)).toBeCloseTo(90, 5);
    expect(getBearingDeg(0, 0, 0, 100)).toBeCloseTo(180, 5);
    expect(getBearingDeg(0, 0, -100, 0)).toBeCloseTo(270, 5);
    expect(getBearingDeg(10, 20, 10, 20)).toBe(0);
  });

  it('formats compass ticks symmetrically and wraps cleanly around North', () => {
    const northTicks = formatCompassTicks(0, 120, 15);
    expect(northTicks.length).toBe(9);
    const center = northTicks.find((t) => t.degree === 0);
    expect(center).toBeDefined();
    expect(center?.label).toBe('N');
    expect(center?.isCardinal).toBe(true);
    expect(center?.normX).toBeCloseTo(0.5, 6);

    const wrapTicks = formatCompassTicks(355, 120, 15);
    const northNearWrap = wrapTicks.find((t) => t.degree === 0);
    expect(northNearWrap).toBeDefined();
    expect(northNearWrap?.offsetDeg).toBeCloseTo(5, 6);
    expect(northNearWrap?.normX).toBeCloseTo(0.5 + 5 / 120, 6);

    const nw = northTicks.find((t) => t.degree === 315);
    expect(nw?.label).toBe('NW');
    expect(nw?.isOrdinal).toBe(true);

    for (let i = 1; i < wrapTicks.length; i++) {
      expect(wrapTicks[i].offsetDeg).toBeGreaterThan(
        wrapTicks[i - 1].offsetDeg,
      );
      expect(wrapTicks[i].normX).toBeGreaterThanOrEqual(0);
      expect(wrapTicks[i].normX).toBeLessThanOrEqual(1);
    }
  });

  it('maps world coordinates to normalized map coordinates and back accurately', () => {
    expect(worldToMapNorm(0, 0)).toEqual({ nx: 0.5, nz: 0.5 });
    expect(worldToMapNorm(-WORLD_HALF, -WORLD_HALF)).toEqual({ nx: 0, nz: 0 });
    expect(worldToMapNorm(WORLD_HALF, WORLD_HALF)).toEqual({ nx: 1, nz: 1 });

    for (const poi of POIS) {
      const norm = worldToMapNorm(poi.x, poi.z);
      expect(norm.nx).toBeGreaterThanOrEqual(0);
      expect(norm.nx).toBeLessThanOrEqual(1);
      expect(norm.nz).toBeGreaterThanOrEqual(0);
      expect(norm.nz).toBeLessThanOrEqual(1);

      const back = mapNormToWorld(norm.nx, norm.nz);
      expect(back.x).toBeCloseTo(poi.x, 6);
      expect(back.z).toBeCloseTo(poi.z, 6);
    }
  });

  it('formats survival times and storm countdowns cleanly', () => {
    expect(formatSurvivalTime(0)).toBe('00:00');
    expect(formatSurvivalTime(-12)).toBe('00:00');
    expect(formatSurvivalTime(5)).toBe('00:05');
    expect(formatSurvivalTime(65.9)).toBe('01:05');
    expect(formatSurvivalTime(754)).toBe('12:34');

    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(34.2)).toBe('0:35');
    expect(formatCountdown(75)).toBe('1:15');
  });

  it('provides rarity metadata for all 6 tiers including mythic shimmer', () => {
    expect(RARITY_ORDER).toContain('mythic');
    for (const rarity of RARITY_ORDER) {
      const meta = getRarityMeta(rarity);
      expect(meta.rarity).toBe(rarity);
      expect(meta.label).toBe(rarity.toUpperCase());
      expect(meta.accent).toMatch(/^#/);
    }

    const mythic = getRarityMeta('mythic');
    expect(mythic.label).toBe('MYTHIC');
    expect(mythic.accent).toBe('#ffdf40');
    expect(mythic.border).toBe('#fef9c3');
    expect(mythic.shimmer).toContain('linear-gradient');
  });

  it('computes kill-streak callouts, safe-zone distance, biome labels, and contextual hints', () => {
    expect(getKillStreakCallout(0)).toBeNull();
    expect(getKillStreakCallout(1)).toBeNull();
    expect(getKillStreakCallout(2)).toEqual({
      streak: 2,
      tier: 'DOUBLE',
      label: 'DOUBLE ELIM!',
    });
    expect(getKillStreakCallout(3)).toEqual({
      streak: 3,
      tier: 'TRIPLE',
      label: 'TRIPLE ELIM!',
    });
    expect(getKillStreakCallout(4)).toEqual({
      streak: 4,
      tier: 'RAMPAGE',
      label: 'RAMPAGE!',
    });
    expect(getKillStreakCallout(6)?.label).toBe('RAMPAGE x6!');

    expect(formatSafeZoneDistance(0, false)).toEqual({
      text: 'IN SAFE',
      isOutside: false,
    });
    expect(formatSafeZoneDistance(64.4, true)).toEqual({
      text: 'SAFE 64M',
      isOutside: true,
    });
    expect(formatSafeZoneDistance(undefined, true)).toEqual({
      text: 'OUTSIDE ZONE',
      isOutside: true,
    });

    const fallbackDist = computeFallbackStormDistance(150, 0, {
      currentCenterX: 0,
      currentCenterZ: 0,
      currentRadius: 200,
      nextCenterX: 0,
      nextCenterZ: 0,
      nextRadius: 100,
    });
    expect(fallbackDist).toBeCloseTo(50, 5);

    const biomes: BiomeType[] = [
      'ocean',
      'beach',
      'grassland',
      'forest',
      'highland',
      'urban',
      'snow',
      'desert',
      'volcanic',
      'cyber',
    ];
    for (const b of biomes) {
      expect(formatBiomeLabel(b).length).toBeGreaterThan(2);
    }

    const hints = getContextualHudHints({
      canRepairBuild: true,
      isSliding: true,
      isZiplining: true,
    });
    expect(hints.map((h) => h.id)).toEqual(['repair', 'slide', 'zipline']);
    expect(hints[0].key).toBe('F');

    for (const poiId of Object.keys(BOSS_POI_LABELS)) {
      expect(POIS.some((p) => p.id === poiId)).toBe(true);
    }
  });
});

describe('WeaponIcons & SVG assets', () => {
  it('returns valid distinct <svg> markup for all 19 WeaponIds without placeholders', () => {
    const weaponIds = Object.keys(WEAPONS) as WeaponId[];
    expect(weaponIds.length).toBe(19);

    const seen = new Set<string>();
    for (const id of weaponIds) {
      const svg = getWeaponSvg(id);
      expect(typeof svg).toBe('string');
      expect(svg.trim().startsWith('<svg')).toBe(true);
      expect(svg.includes('</svg>')).toBe(true);
      expect(seen.has(svg)).toBe(false);
      seen.add(svg);
    }

    // Verify all 5 Wave-1 icons have rich multi-element custom artwork
    const upgraded: WeaponId[] = [
      'heavy_shotgun',
      'mythic_blade_rifle',
      'shockwave_grenade',
      'frag_grenade',
      'chug_splash',
    ];
    for (const id of upgraded) {
      const svg = getWeaponSvg(id);
      const shapeCount = (svg.match(/<(path|rect|circle|ellipse|polygon)/g) ?? [])
        .length;
      expect(shapeCount).toBeGreaterThanOrEqual(5);
    }
  });

  it('returns valid <svg> markup for build pieces, materials, ammo, and HUD emblems', () => {
    const builds: BuildPieceType[] = ['wall', 'floor', 'ramp', 'roof'];
    for (const b of builds) {
      const svg = getBuildIconSvg(b);
      expect(svg.trim().startsWith('<svg')).toBe(true);
      expect(svg.includes('</svg>')).toBe(true);
    }

    const mats: MaterialType[] = ['wood', 'brick', 'metal'];
    for (const m of mats) {
      const svg = getMaterialIconSvg(m);
      expect(svg.trim().startsWith('<svg')).toBe(true);
      expect(svg.includes('</svg>')).toBe(true);
    }

    const ammos: AmmoType[] = ['light', 'medium', 'shells', 'heavy', 'rockets'];
    for (const a of ammos) {
      const svg = getAmmoIconSvg(a);
      expect(svg.trim().startsWith('<svg')).toBe(true);
      expect(svg.includes('</svg>')).toBe(true);
    }

    for (const emblem of [getSkullSvg(), getStormEyeSvg(), getCrownSvg()]) {
      expect(emblem.trim().startsWith('<svg')).toBe(true);
      expect(emblem.includes('</svg>')).toBe(true);
    }
  });
});

describe('Storage & CareerProfile progression', () => {
  const prevStorageDesc = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );

  beforeEach(() => {
    resetCareerStats();
  });

  afterEach(() => {
    resetCareerStats();
    if (prevStorageDesc) {
      Object.defineProperty(globalThis, 'localStorage', prevStorageDesc);
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });

  it('loads default settings, lobby config, and career stats safely in Node without localStorage', () => {
    const settings = loadStoredSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);

    const lobby = loadStoredLobbyConfig();
    expect(lobby.botCount).toBeGreaterThan(0);
    expect(lobby.playerName.length).toBeGreaterThan(0);

    const career = loadCareerStats();
    expect(career.xp).toBe(0);
    expect(career.level).toBe(1);
    expect(career.wins).toBe(0);
    expect(career.elims).toBe(0);
  });

  it('computes career XP leveling accurately across levels 1..100', () => {
    expect(xpForLevelStep(1)).toBe(500);
    expect(getTotalXpForLevel(1)).toBe(0);
    expect(getTotalXpForLevel(2)).toBe(500);
    expect(computeLevelFromXp(0)).toBe(1);
    expect(computeLevelFromXp(499)).toBe(1);
    expect(computeLevelFromXp(500)).toBe(2);
    expect(computeLevelFromXp(999_999_999)).toBe(MAX_CAREER_LEVEL);

    const mid = computeCareerLevelProgress(750);
    expect(mid.level).toBe(2);
    expect(mid.xpIntoLevel).toBe(250);
    expect(mid.xpRequiredForNext).toBe(550);
    expect(mid.progressRatio).toBeCloseTo(250 / 550, 5);
    expect(mid.isMaxLevel).toBe(false);

    const maxProg = computeCareerLevelProgress(999_999_999);
    expect(maxProg.level).toBe(100);
    expect(maxProg.isMaxLevel).toBe(true);
    expect(maxProg.progressRatio).toBe(1);
  });

  it('records match career stats and accumulates XP, wins, and elims (both Node fallback and localStorage)', () => {
    const winSummary: MatchSummary = {
      victory: true,
      placement: 1,
      totalPlayers: 30,
      kills: 6,
      damageDealt: 1200,
      shotsFired: 80,
      shotsHit: 40,
      accuracy: 50,
      headshots: 3,
      structuresBuilt: 18,
      chestsOpened: 5,
      survivalTimeSec: 240,
    };

    const bd = computeMatchXpBreakdown(winSummary, 0);
    expect(bd.victoryBonusXp).toBe(500);
    expect(bd.elimXp).toBe(750);
    expect(bd.totalXp).toBe(
      bd.survivalXp +
        bd.elimXp +
        bd.damageXp +
        bd.placementXp +
        bd.victoryBonusXp,
    );
    expect(bd.leveledUp).toBe(true);

    const afterFirst = recordMatchCareerStats(winSummary);
    expect(afterFirst.xp).toBe(bd.totalXp);
    expect(afterFirst.level).toBeGreaterThan(1);
    expect(afterFirst.wins).toBe(1);
    expect(afterFirst.elims).toBe(6);
    expect(afterFirst.bestPlacement).toBe(1);

    const afterSecond = recordMatchCareerStats({
      ...winSummary,
      victory: false,
      placement: 5,
      kills: 3,
    });
    expect(afterSecond.xp).toBeGreaterThan(afterFirst.xp);
    expect(afterSecond.wins).toBe(1);
    expect(afterSecond.elims).toBe(9);
    expect(afterSecond.matchesPlayed).toBe(2);

    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });

    const lossSummary: MatchSummary = {
      ...winSummary,
      victory: false,
      placement: 8,
      kills: 2,
      damageDealt: 400,
      survivalTimeSec: 120,
    };
    const afterStorageMatch = recordMatchCareerStats(lossSummary);
    expect(afterStorageMatch.wins).toBe(0);
    expect(afterStorageMatch.elims).toBe(2);
    expect(store.size).toBe(1);

    const reloaded = loadCareerStats();
    expect(reloaded.xp).toBe(afterStorageMatch.xp);
    expect(reloaded.level).toBe(afterStorageMatch.level);
    expect(reloaded.elims).toBe(2);
  });
});

class MockClassList {
  private set = new Set<string>();
  constructor(private readonly owner: MockElement) {}

  syncFromString(cls: string): void {
    this.set = new Set(cls.split(/\s+/).filter(Boolean));
  }

  add(...tokens: string[]): void {
    for (const t of tokens) {
      if (t) this.set.add(t);
    }
    this.owner._syncClassName();
  }

  remove(...tokens: string[]): void {
    for (const t of tokens) {
      this.set.delete(t);
    }
    this.owner._syncClassName();
  }

  toggle(token: string, force?: boolean): boolean {
    const next = typeof force === 'boolean' ? force : !this.set.has(token);
    if (next) this.set.add(token);
    else this.set.delete(token);
    this.owner._syncClassName();
    return next;
  }

  contains(token: string): boolean {
    return this.set.has(token);
  }

  toString(): string {
    return Array.from(this.set).join(' ');
  }
}

class MockElement {
  tagName: string;
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  style: Record<string, string> & { setProperty: (k: string, v: string) => void };
  dataset: Record<string, string> = {};
  classList: MockClassList;
  type = '';
  value = '';
  min = '';
  max = '';
  step = '';
  maxLength = 0;
  width = 0;
  height = 0;
  private _className = '';
  private _textContent = '';
  private _innerHTML = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
    this.classList = new MockClassList(this);
    const styleObj: Record<string, string> = {};
    this.style = Object.assign(styleObj, {
      setProperty: (k: string, v: string) => {
        styleObj[k] = v;
      },
    }) as Record<string, string> & { setProperty: (k: string, v: string) => void };
  }

  get className(): string {
    return this._className;
  }

  set className(val: string) {
    this._className = val;
    this.classList.syncFromString(val);
  }

  _syncClassName(): void {
    this._className = this.classList.toString();
  }

  get textContent(): string {
    if (this.children.length === 0) return this._textContent;
    return (
      this._textContent +
      this.children.map((c) => c.textContent).join('')
    );
  }

  set textContent(val: string) {
    this._textContent = val;
    this.children = [];
    this._innerHTML = val;
  }

  get innerHTML(): string {
    if (this.children.length === 0) return this._innerHTML;
    return (
      this._innerHTML + this.children.map((c) => c.innerHTML).join('')
    );
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    this.children = [];
    this._textContent = val.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  get offsetWidth(): number {
    return 100;
  }

  get firstElementChild(): MockElement | null {
    return this.children[0] ?? null;
  }

  append(...nodes: MockElement[]): void {
    for (const n of nodes) {
      this.appendChild(n);
    }
  }

  appendChild(node: MockElement): MockElement {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  remove(): void {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) {
      this.parentNode.children.splice(idx, 1);
    }
    this.parentNode = null;
  }

  addEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  click(): void {
    for (const fn of this.listeners.get('click') ?? []) {
      fn({ target: this, preventDefault: () => {} });
    }
  }

  getContext(): null {
    return null;
  }

  findByClass(cls: string): MockElement | null {
    if (this.classList.contains(cls)) return this;
    for (const c of this.children) {
      const found = c.findByClass(cls);
      if (found) return found;
    }
    return null;
  }

  findAllByClass(cls: string): MockElement[] {
    const out: MockElement[] = [];
    if (this.classList.contains(cls)) out.push(this);
    for (const c of this.children) {
      out.push(...c.findAllByClass(cls));
    }
    return out;
  }
}

function makeBaseHUDState(overrides: Partial<HUDState> = {}): HUDState {
  return {
    phase: 'playing',
    health: 100,
    maxHealth: 100,
    shield: 50,
    maxShield: 100,
    stamina: 100,
    isSprinting: false,
    isCrouching: false,
    isAiming: false,
    isScoped: false,
    isBuildMode: false,
    activeBuildType: 'wall',
    activeMaterial: 'wood',
    buildRotation: 0,
    editMode: {
      active: false,
      pieceId: null,
      pieceType: null,
      selectedTiles: Array(9).fill(false),
      hoveredTile: -1,
      valid: true,
    },
    slots: [
      { uid: 'p', weaponId: 'pickaxe', rarity: 'common', magAmmo: 0, stackCount: 1 },
      { uid: 'm', weaponId: 'mythic_blade_rifle', rarity: 'mythic', magAmmo: 32, stackCount: 1 },
      { uid: 's', weaponId: 'chug_splash', rarity: 'rare', magAmmo: 0, stackCount: 4 },
      null,
      null,
      null,
    ],
    activeSlot: 1,
    ammo: { light: 0, medium: 120, shells: 16, heavy: 0, rockets: 0 },
    materials: { wood: 150, brick: 80, metal: 40 },
    activeWeaponSpread: 0.015,
    interactPrompt: null,
    reloadProgress: null,
    healProgress: null,
    healLabel: null,
    aliveCount: 24,
    totalPlayers: 30,
    kills: 3,
    stormState: {
      phase: 1,
      totalPhases: 6,
      currentCenterX: 0,
      currentCenterZ: 0,
      currentRadius: 230,
      nextCenterX: 0,
      nextCenterZ: 0,
      nextRadius: 150,
      isShrinking: false,
      phaseTimeRemaining: 28,
      phaseDuration: 35,
      dps: 1,
    },
    busProgress: 1,
    busStart: { x: -300, y: 175, z: -300 },
    busEnd: { x: 300, y: 175, z: 300 },
    busPos: { x: 0, y: 175, z: 0 },
    playerPos: { x: 0, y: 10, z: 0 },
    playerYaw: 0,
    mapWaypoint: null,
    compassHeading: 0,
    fps: 60,
    pointerLocked: true,
    canDeployGlider: false,
    canJumpBus: false,
    hitmarker: null,
    damageDirection: null,
    audioBlips: [],
    inStorm: false,
    ...overrides,
  };
}

describe('UI DOM integration (Wave 1 HUD, Lobby, MatchOverlay, FullMap)', () => {
  const prevDoc = (globalThis as Record<string, unknown>).document;

  beforeEach(() => {
    resetCareerStats();
    (globalThis as Record<string, unknown>).document = {
      createElement: (tag: string) => new MockElement(tag),
    };
  });

  afterEach(() => {
    resetCareerStats();
    if (prevDoc === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      (globalThis as Record<string, unknown>).document = prevDoc;
    }
  });

  it('renders Wave 1 HUD tactical overlays, telemetry, mythic crown, siphon, and POI toast', () => {
    const root = new MockElement('div');
    const bus = new EventBus();
    const ui = new UIManager(root as unknown as HTMLElement, bus);
    ui.setPhase('playing');

    ui.updateHUD(
      makeBaseHUDState({
        showSpeedLines: true,
        lowHealthPulse: 0.85,
        killStreak: 3,
        stormDistance: 92,
        inStorm: true,
        currentBiome: 'cyber',
        currentPoiName: 'SKYLINE SPIRE',
        canRepairBuild: true,
        isSliding: true,
        isZiplining: false,
        siphonFlashAt: Date.now() + 100,
      }),
    );

    const speedLines = root.findByClass('fdr-speed-lines');
    expect(speedLines?.classList.contains('active')).toBe(true);

    const lowHp = root.findByClass('fdr-low-health-vignette');
    expect(lowHp?.classList.contains('active')).toBe(true);
    expect(Number(lowHp?.style.opacity)).toBeGreaterThan(0.5);

    const ksBadge = root.findByClass('fdr-killstreak-badge');
    expect(ksBadge?.classList.contains('fdr-hidden')).toBe(false);
    expect(ksBadge?.textContent).toContain('TRIPLE');

    const safeDist = root.findByClass('safe-dist');
    expect(safeDist?.textContent).toBe('SAFE 92M');
    expect(safeDist?.classList.contains('outside')).toBe(true);

    const locChip = root.findByClass('location');
    expect(locChip?.textContent).toContain('SKYLINE SPIRE');
    expect(locChip?.textContent).toContain('CYBER SECTOR');

    const ctxHints = root.findByClass('fdr-context-hints');
    expect(ctxHints?.textContent).toContain('REPAIR BUILD');
    expect(ctxHints?.textContent).toContain('SLIDE');

    const siphon = root.findByClass('fdr-siphon-badge');
    expect(siphon?.classList.contains('fdr-hidden')).toBe(false);
    expect(siphon?.textContent).toContain('+50 SIPHON');

    bus.emit('combat:siphon', { amount: 50, healthAdded: 20, shieldAdded: 30 });
    expect(siphon?.textContent).toContain('+20 HP');

    const slots = root.findAllByClass('fdr-slot-card');
    expect(slots[1].classList.contains('rarity-mythic')).toBe(true);
    expect(slots[1].innerHTML).toContain('fdr-slot-crown');
    expect(slots[2].innerHTML).toContain('x4');

    bus.emit('ui:poi_discover', {
      poiName: 'FROSTPEAK CITADEL',
      subtitle: 'Alpine Castle Fortress',
    });
    const poiToast = root.findByClass('fdr-poi-toast');
    expect(poiToast?.textContent).toContain('FROSTPEAK CITADEL');
    expect(poiToast?.textContent).toContain('Alpine Castle Fortress');

    ui.dispose();
  });

  it('shows Career XP in Lobby header, Match XP breakdown on MatchOverlay, all Locker items, and Map Legend', () => {
    const root = new MockElement('div');
    const bus = new EventBus();
    const ui = new UIManager(root as unknown as HTMLElement, bus);

    // Switch to Locker tab and verify all skins (>= 10), 6 pickaxes, 6 gliders, 6 emotes render
    const navTabs = root.findAllByClass('fdr-nav-tab');
    expect(navTabs.length).toBe(4);
    navTabs[1].click(); // LOCKER

    const cosmeticCards = root.findAllByClass('fdr-cosmetic-card');
    expect(cosmeticCards.length).toBe(
      SKINS.length + PICKAXES.length + GLIDERS.length + EMOTES.length,
    );
    expect(SKINS.length).toBeGreaterThanOrEqual(10);
    expect(PICKAXES.length).toBe(6);
    expect(GLIDERS.length).toBe(6);
    expect(EMOTES.length).toBe(6);

    // Complete a match -> MatchOverlay renders Match XP Breakdown & updates Career
    ui.setPhase('victory');
    ui.showMatchSummary({
      victory: true,
      placement: 1,
      totalPlayers: 30,
      kills: 5,
      damageDealt: 950,
      shotsFired: 60,
      shotsHit: 32,
      accuracy: 53,
      headshots: 2,
      structuresBuilt: 12,
      chestsOpened: 4,
      survivalTimeSec: 180,
    });

    const xpCard = root.findByClass('fdr-xp-breakdown-card');
    expect(xpCard?.textContent).toContain('MATCH XP EARNED');
    expect(xpCard?.textContent).toContain('VICTORY BONUS');
    expect(xpCard?.textContent).toContain('+500');

    // Return to lobby -> Header Career bar updates dynamically
    ui.setPhase('lobby');
    const careerPill = root.findByClass('fdr-career-pill');
    expect(careerPill?.textContent).toContain('1W • 5 ELIMS');
    expect(careerPill?.textContent).not.toContain('LVL 10W');

    // FullMapOverlay Tactical Legend verification
    const mapRoot = new MockElement('div');
    const fullMap = new FullMapOverlay(mapRoot as unknown as HTMLElement, {
      onWaypointChange: () => {},
    });
    const legend = mapRoot.findByClass('fdr-map-legend');
    expect(legend?.textContent).toContain('LAUNCH PAD');
    expect(legend?.textContent).toContain('THERMAL GEYSER');
    expect(legend?.textContent).toContain('ENERGY ZIPLINE');
    expect(legend?.textContent).toContain('SAFE ZONE');
    expect(legend?.textContent).toContain('NAMED POI BOSS ZONE');

    fullMap.dispose();
    ui.dispose();
  });
});
