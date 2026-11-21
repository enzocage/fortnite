import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBINDS,
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
  VaultEntity,
  VehicleEntity,
  WeaponId,
  WeatherKind,
} from '../../types';
import {
  BOSS_POI_LABELS,
  cloneSettings,
  computeCareerLevelProgress,
  computeFallbackStormDistance,
  computeLevelFromXp,
  computeMatchXpBreakdown,
  formatBiomeLabel,
  formatCompassTicks,
  formatCountdown,
  formatKeyCodeLabel,
  formatSafeZoneDistance,
  formatSurvivalTime,
  formatVehicleKindLabel,
  formatWeatherLabel,
  FullMapOverlay,
  getAmmoIconSvg,
  getBearingDeg,
  getBountyTargetSvg,
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
  getVaultKeySvg,
  getVaultLockSvg,
  getVehicleIconSvg,
  getWeaponSvg,
  getWeatherIconSvg,
  KEYBIND_ACTION_DEFS,
  loadCareerStats,
  loadStoredLobbyConfig,
  loadStoredSettings,
  mapNormToWorld,
  MAX_CAREER_LEVEL,
  normalizeBoostChargePct,
  normalizeDegrees,
  recordMatchCareerStats,
  resetCareerStats,
  resolveKeybinds,
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

    // Wave-2 helpers: keybinds, weather, vehicles, boost normalization
    expect(formatKeyCodeLabel('KeyZ')).toBe('Z');
    expect(formatKeyCodeLabel('Digit4')).toBe('4');
    expect(formatKeyCodeLabel('ShiftLeft')).toBe('L-SHIFT');
    expect(formatKeyCodeLabel('ControlLeft')).toBe('CTRL');
    expect(formatKeyCodeLabel('Space')).toBe('SPACE');

    const resolved = resolveKeybinds({ buildWall: 'KeyQ', repair: 'KeyR' });
    expect(resolved.buildWall).toBe('KeyQ');
    expect(resolved.repair).toBe('KeyR');
    expect(resolved.interact).toBe(DEFAULT_KEYBINDS.interact);

    const customHints = getContextualHudHints(
      { canRepairBuild: true, isSliding: false, isZiplining: false },
      { repair: 'KeyT' },
    );
    expect(customHints[0].key).toBe('T');

    const cloned = cloneSettings(DEFAULT_SETTINGS);
    cloned.keybinds!.map = 'Tab';
    expect(DEFAULT_KEYBINDS.map).toBe('KeyM');

    const weathers: WeatherKind[] = [
      'clear',
      'golden_hour',
      'overcast',
      'rain',
      'storm_front',
    ];
    for (const w of weathers) {
      expect(formatWeatherLabel(w).length).toBeGreaterThan(2);
    }
    expect(formatVehicleKindLabel('hover_atv')).toBe('HOVER ATV');
    expect(formatVehicleKindLabel('cyber_bike')).toBe('CYBER BIKE');
    expect(normalizeBoostChargePct(0.65)).toBeCloseTo(65, 5);
    expect(normalizeBoostChargePct(1)).toBeCloseTo(100, 5);
    expect(normalizeBoostChargePct(82)).toBeCloseTo(82, 5);
    expect(normalizeBoostChargePct(-0.5)).toBe(0);
  });
});

describe('WeaponIcons & SVG assets', () => {
  it('returns valid distinct <svg> markup for all 21 WeaponIds without placeholders', () => {
    const weaponIds = Object.keys(WEAPONS) as WeaponId[];
    expect(weaponIds.length).toBe(21);

    const seen = new Set<string>();
    for (const id of weaponIds) {
      const svg = getWeaponSvg(id);
      expect(typeof svg).toBe('string');
      expect(svg.trim().startsWith('<svg')).toBe(true);
      expect(svg.includes('</svg>')).toBe(true);
      expect(seen.has(svg)).toBe(false);
      seen.add(svg);
    }

    // Verify all 5 Wave-1 + 2 Wave-2 icons have rich multi-element custom artwork
    const upgraded: WeaponId[] = [
      'heavy_shotgun',
      'mythic_blade_rifle',
      'shockwave_grenade',
      'frag_grenade',
      'chug_splash',
      'grappler',
      'shield_bubble',
    ];
    for (const id of upgraded) {
      const svg = getWeaponSvg(id);
      const shapeCount = (svg.match(/<(path|rect|circle|ellipse|polygon)/g) ?? [])
        .length;
      expect(shapeCount).toBeGreaterThanOrEqual(5);
    }
  });

  it('returns valid <svg> markup for build pieces, materials, ammo, and Wave-1/Wave-2 HUD emblems', () => {
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

    for (const emblem of [
      getSkullSvg(),
      getStormEyeSvg(),
      getCrownSvg(),
      getVaultKeySvg(),
      getVaultLockSvg(false),
      getVaultLockSvg(true),
      getBountyTargetSvg(),
      getVehicleIconSvg('hover_atv'),
      getVehicleIconSvg('cyber_bike'),
      getWeatherIconSvg('clear'),
      getWeatherIconSvg('golden_hour'),
      getWeatherIconSvg('overcast'),
      getWeatherIconSvg('rain'),
      getWeatherIconSvg('storm_front'),
    ]) {
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
    expect(legend?.textContent).toContain('VEHICLE');
    expect(legend?.textContent).toContain('BOSS VAULT');

    fullMap.dispose();
    ui.dispose();
  });

  it('renders Wave 2 HUD elements (Vehicle, Boss Bar, Bounty Card & Toast, Vault Keys, Weather, Grappler, Spectator Bar)', () => {
    const root = new MockElement('div');
    const bus = new EventBus();
    let spectateNextCalls = 0;
    let spectateSummaryCalls = 0;

    const ui = new UIManager(root as unknown as HTMLElement, bus, {
      onSpectateNext: () => {
        spectateNextCalls++;
      },
      onSpectateMatchSummary: () => {
        spectateSummaryCalls++;
      },
    });
    ui.setPhase('playing');

    ui.updateHUD(
      makeBaseHUDState({
        currentBiome: 'volcanic',
        currentPoiName: 'SCORCHED CALDERA',
        weather: 'storm_front',
        activeVaultKeys: 2,
        grapplerCharges: 7,
        vehicle: {
          kind: 'cyber_bike',
          speedKmh: 88,
          hp: 320,
          maxHp: 400,
          boostCharge: 0.75,
          isBoosting: true,
        },
        nearbyBoss: {
          name: 'Obsidian Titan',
          hp: 120,
          maxHp: 150,
          shield: 90,
          maxShield: 150,
          distance: 28,
        },
        activeBounty: {
          targetName: 'NEON_VIPER',
          distance: 95,
          timeRemaining: 12,
          rewardLabel: '+150 GOLD',
        },
      }),
    );

    // Location chip shows full name without truncation
    const locChip = root.findByClass('location');
    expect(locChip?.textContent).toBe('SCORCHED CALDERA • VOLCANIC RIFT');

    // Weather pill
    const weatherPill = root.findByClass('weather');
    expect(weatherPill?.classList.contains('fdr-hidden')).toBe(false);
    expect(weatherPill?.classList.contains('weather-storm_front')).toBe(true);
    expect(weatherPill?.textContent).toContain('STORM FRONT');

    // Vault Key Badge
    const vaultBadge = root.findByClass('fdr-vault-key-badge');
    expect(vaultBadge?.classList.contains('fdr-hidden')).toBe(false);
    expect(vaultBadge?.textContent).toContain('2 VAULT KEYS');

    // Grappler Charges Badge
    const grapplerBadge = root.findByClass('fdr-grappler-badge');
    expect(grapplerBadge?.classList.contains('fdr-hidden')).toBe(false);
    expect(grapplerBadge?.textContent).toContain('7 CHARGES');

    // Vehicle Dashboard
    const vehDash = root.findByClass('fdr-vehicle-dash');
    expect(vehDash?.classList.contains('fdr-hidden')).toBe(false);
    expect(vehDash?.textContent).toContain('CYBER BIKE');
    expect(vehDash?.textContent).toContain('88 KM/H');
    expect(vehDash?.textContent).toContain('320 / 400');
    expect(vehDash?.textContent).toContain('[E] EXIT');

    // Boss Encounter Healthbar
    const bossBar = root.findByClass('fdr-boss-bar');
    expect(bossBar?.classList.contains('fdr-hidden')).toBe(false);
    expect(bossBar?.textContent).toContain('OBSIDIAN TITAN');
    expect(bossBar?.textContent).toContain('HP 120/150');
    expect(bossBar?.textContent).toContain('SHD 90/150');
    expect(bossBar?.textContent).toContain('28M');
    const bossShieldFill = bossBar?.findByClass('fdr-boss-fill');
    expect(bossShieldFill?.style.width).toBe('60.0%');

    // Active Bounty Card
    const bountyCard = root.findByClass('fdr-bounty-card');
    expect(bountyCard?.classList.contains('fdr-hidden')).toBe(false);
    expect(bountyCard?.classList.contains('urgent')).toBe(true);
    expect(bountyCard?.textContent).toContain('NEON_VIPER');
    expect(bountyCard?.textContent).toContain('95M');
    expect(bountyCard?.textContent).toContain('0:12');
    expect(bountyCard?.textContent).toContain('+150 GOLD');

    // Bounty EventBus toast
    bus.emit('ui:bounty', {
      title: 'BOUNTY CONTRACT',
      targetName: 'NEON_VIPER',
      tone: 'start',
    });
    const bountyToast = root.findByClass('fdr-bounty-toast');
    expect(bountyToast?.dataset.bountyTone).toBe('start');
    expect(bountyToast?.textContent).toContain('BOUNTY CONTRACT');
    expect(bountyToast?.textContent).toContain('NEON_VIPER');

    // Live Spectator Bar + Interactive Buttons
    ui.setPhase('eliminated');
    ui.updateHUD(
      makeBaseHUDState({
        phase: 'eliminated',
        vehicle: null,
        nearbyBoss: null,
        activeBounty: null,
        activeVaultKeys: 0,
        grapplerCharges: null,
        spectating: {
          targetName: 'CYBER_ACE',
          targetHp: 74,
          targetShield: 45,
          targetKills: 6,
          aliveCount: 4,
        },
      }),
    );

    const specBar = root.findByClass('fdr-spectator-bar');
    expect(specBar?.classList.contains('fdr-hidden')).toBe(false);
    expect(specBar?.textContent).toContain('CYBER_ACE');
    expect(specBar?.textContent).toContain('74 / 100');
    expect(specBar?.textContent).toContain('45 / 100');
    expect(specBar?.textContent).toContain('6 ELIMS');
    expect(specBar?.textContent).toContain('4 ALIVE');
    expect(root.findByClass('fdr-vitals-stack')?.classList.contains('fdr-hidden')).toBe(
      true,
    );
    expect(vehDash?.classList.contains('fdr-hidden')).toBe(true);
    expect(bossBar?.classList.contains('fdr-hidden')).toBe(true);

    const nextBtn = specBar?.findByClass('next');
    const summaryBtn = specBar?.findByClass('summary');
    nextBtn?.click();
    summaryBtn?.click();
    expect(spectateNextCalls).toBe(1);
    expect(spectateSummaryCalls).toBe(1);

    ui.dispose();
  });

  it('draws vehicles and vaults on FullMapOverlay when forwarded from UIManager', () => {
    const drawCalls: Array<{ op: string; args: unknown[] }> = [];
    const mockCtx = {
      clearRect: (...args: unknown[]) => drawCalls.push({ op: 'clearRect', args }),
      rect: () => {},
      fillRect: (...args: unknown[]) => drawCalls.push({ op: 'fillRect', args }),
      strokeRect: (...args: unknown[]) => drawCalls.push({ op: 'strokeRect', args }),
      drawImage: (...args: unknown[]) => drawCalls.push({ op: 'drawImage', args }),
      beginPath: () => drawCalls.push({ op: 'beginPath', args: [] }),
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: (...args: unknown[]) => drawCalls.push({ op: 'arc', args }),
      fill: () => drawCalls.push({ op: 'fill', args: [] }),
      stroke: () => drawCalls.push({ op: 'stroke', args: [] }),
      save: () => {},
      restore: () => {},
      translate: (...args: unknown[]) => drawCalls.push({ op: 'translate', args }),
      rotate: (...args: unknown[]) => drawCalls.push({ op: 'rotate', args }),
      setLineDash: () => {},
      fillText: (...args: unknown[]) => drawCalls.push({ op: 'fillText', args }),
      strokeText: (...args: unknown[]) => drawCalls.push({ op: 'strokeText', args }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
    };

    (globalThis as Record<string, unknown>).document = {
      createElement: (tag: string) => {
        const el = new MockElement(tag);
        if (tag.toLowerCase() === 'canvas') {
          (el as unknown as { getContext: () => unknown }).getContext = () => mockCtx;
        }
        return el;
      },
    };

    const root = new MockElement('div');
    const bus = new EventBus();
    const ui = new UIManager(root as unknown as HTMLElement, bus);
    ui.setPhase('playing');

    const vehicles: VehicleEntity[] = [
      {
        id: 'v1',
        kind: 'hover_atv',
        x: 100,
        y: 10,
        z: 50,
        yaw: 0,
        pitch: 0,
        roll: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        hp: 400,
        maxHp: 400,
        boostCharge: 1,
        isBoosting: false,
        driverId: null,
        destroyed: false,
      },
      {
        id: 'v2',
        kind: 'cyber_bike',
        x: -120,
        y: 10,
        z: -80,
        yaw: 0,
        pitch: 0,
        roll: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        hp: 0,
        maxHp: 300,
        boostCharge: 0,
        isBoosting: false,
        driverId: null,
        destroyed: true,
      },
    ];
    const vaults: VaultEntity[] = [
      {
        id: 'vault-1',
        poiId: 'scorched_caldera',
        bossName: 'Obsidian Titan',
        x: -175,
        y: 20,
        z: 125,
        unlocked: false,
        opened: false,
      },
      {
        id: 'vault-2',
        poiId: 'frostpeak_citadel',
        bossName: 'Glacier Monarch',
        x: -10,
        y: 36,
        z: -245,
        unlocked: true,
        opened: true,
      },
    ];

    // Forward through UIManager directly -> opens FullMapOverlay and renders canvas
    ui.setWorldVehicles(vehicles);
    ui.setWorldVaults(vaults);
    ui.toggleFullMap(true);
    drawCalls.length = 0;
    ui.updateHUD(makeBaseHUDState());

    const v1Norm = worldToMapNorm(100, 50);
    const vault1Norm = worldToMapNorm(-175, 125);
    const v2Norm = worldToMapNorm(-120, -80);

    const translatedToV1 = drawCalls.some(
      (c) =>
        c.op === 'translate' &&
        Math.abs((c.args[0] as number) - v1Norm.nx * 640) < 0.5 &&
        Math.abs((c.args[1] as number) - v1Norm.nz * 640) < 0.5,
    );
    const translatedToVault1 = drawCalls.some(
      (c) =>
        c.op === 'translate' &&
        Math.abs((c.args[0] as number) - vault1Norm.nx * 640) < 0.5 &&
        Math.abs((c.args[1] as number) - vault1Norm.nz * 640) < 0.5,
    );
    const translatedToDestroyedV2 = drawCalls.some(
      (c) =>
        c.op === 'translate' &&
        Math.abs((c.args[0] as number) - v2Norm.nx * 640) < 0.5 &&
        Math.abs((c.args[1] as number) - v2Norm.nz * 640) < 0.5,
    );

    expect(translatedToV1).toBe(true);
    expect(translatedToVault1).toBe(true);
    expect(translatedToDestroyedV2).toBe(false);

    ui.dispose();
  });

  it('supports Settings Keybind Remapping, persistence via onSettingsChange, HUD label sync, and RESET KEYBINDS', () => {
    const prevWindow = (globalThis as Record<string, unknown>).window;
    const store = new Map<string, string>();
    const windowListeners = new Map<string, Array<(e: unknown) => void>>();

    (globalThis as Record<string, unknown>).window = {
      innerWidth: 1280,
      innerHeight: 720,
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        const arr = windowListeners.get(type) ?? [];
        arr.push(fn);
        windowListeners.set(type, arr);
      },
      removeEventListener: (type: string, fn: (e: unknown) => void) => {
        const arr = windowListeners.get(type);
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      },
    };

    try {
      const root = new MockElement('div');
      const bus = new EventBus();
      const changes: Array<ReturnType<UIManager['getSettings']>> = [];
      const ui = new UIManager(root as unknown as HTMLElement, bus, {
        onSettingsChange: (s) => changes.push(s),
      });

      // Switch to SETTINGS tab
      const navTabs = root.findAllByClass('fdr-nav-tab');
      navTabs[3].click();

      const keybindBtns = root.findAllByClass('fdr-keybind-btn');
      expect(keybindBtns.length).toBe(KEYBIND_ACTION_DEFS.length);

      const wallBtn = keybindBtns.find(
        (b) => b.dataset.keybindAction === 'buildWall',
      );
      expect(wallBtn?.textContent).toBe('Z');

      // Click to enter listening state
      wallBtn?.click();
      const wallBtnListening = root
        .findAllByClass('fdr-keybind-btn')
        .find((b) => b.dataset.keybindAction === 'buildWall');
      expect(wallBtnListening?.classList.contains('listening')).toBe(true);
      expect(wallBtnListening?.textContent).toBe('PRESS A KEY...');

      // Dispatch keydown 'KeyU'
      for (const fn of [...(windowListeners.get('keydown') ?? [])]) {
        fn({
          code: 'KeyU',
          key: 'u',
          preventDefault: () => {},
          stopPropagation: () => {},
        });
      }

      expect(changes.length).toBeGreaterThanOrEqual(1);
      expect(changes[changes.length - 1].keybinds?.buildWall).toBe('KeyU');
      expect(ui.getSettings().keybinds?.buildWall).toBe('KeyU');

      // Remap interact -> KeyH and verify Escape cancels listening cleanly
      const interactBtn = root
        .findAllByClass('fdr-keybind-btn')
        .find((b) => b.dataset.keybindAction === 'interact');
      interactBtn?.click();
      for (const fn of [...(windowListeners.get('keydown') ?? [])]) {
        fn({
          code: 'Escape',
          key: 'Escape',
          preventDefault: () => {},
          stopPropagation: () => {},
        });
      }
      expect(ui.getSettings().keybinds?.interact).toBe(DEFAULT_KEYBINDS.interact);

      const interactBtn2 = root
        .findAllByClass('fdr-keybind-btn')
        .find((b) => b.dataset.keybindAction === 'interact');
      interactBtn2?.click();
      for (const fn of [...(windowListeners.get('keydown') ?? [])]) {
        fn({
          code: 'KeyJ',
          key: 'j',
          preventDefault: () => {},
          stopPropagation: () => {},
        });
      }
      expect(ui.getSettings().keybinds?.interact).toBe('KeyJ');

      // Remapped button updates and storage persists
      const wallBtnUpdated = root
        .findAllByClass('fdr-keybind-btn')
        .find((b) => b.dataset.keybindAction === 'buildWall');
      expect(wallBtnUpdated?.textContent).toBe('U');
      expect(loadStoredSettings().keybinds?.buildWall).toBe('KeyU');

      // HUD reflects remapped buildWall & interact keys
      ui.setPhase('playing');
      ui.updateHUD(
        makeBaseHUDState({
          vehicle: {
            kind: 'hover_atv',
            speedKmh: 45,
            hp: 400,
            maxHp: 400,
            boostCharge: 1,
            isBoosting: false,
          },
        }),
      );
      const buildKeys = root.findAllByClass('fdr-build-key');
      expect(buildKeys[0]?.textContent).toBe('U');
      expect(root.findByClass('fdr-vehicle-hint')?.textContent).toContain(
        '[J] EXIT',
      );

      // Return to lobby -> Reset keybinds restores defaults
      ui.setPhase('lobby');
      const resetKbBtn = root.findByClass('fdr-keybind-reset-btn');
      expect(resetKbBtn).not.toBeNull();
      resetKbBtn?.click();

      expect(ui.getSettings().keybinds?.buildWall).toBe(
        DEFAULT_KEYBINDS.buildWall,
      );
      expect(buildKeys[0]?.textContent).toBe('Z');

      ui.dispose();
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
    }
  });
});
