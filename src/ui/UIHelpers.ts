import {
  AUGMENTS,
  CONTRAILS,
  CROSSHAIR_COLORS,
  CROSSHAIR_STYLES,
  DEFAULT_KEYBINDS,
  DEFAULT_SETTINGS,
  GAME_MODES,
  MEDALLIONS,
  RARITY_COLORS,
  WEAPON_MODS,
  WORLD_HALF,
  WORLD_SIZE,
} from '../core';
import type {
  ApexTrainState,
  AugmentDef,
  AugmentId,
  BiomeType,
  ContrailDef,
  CrosshairColor,
  CrosshairStyle,
  DroppedCrownEntity,
  DroppedMedallionEntity,
  FishingHoleEntity,
  ForecastTowerEntity,
  FutureStormRing,
  GameModeId,
  GameSettings,
  GrindRailEntity,
  HUDState,
  KeybindMap,
  MatchQuest,
  MatchSummary,
  MedallionDef,
  MedallionId,
  MeteorCraterEntity,
  ModBenchEntity,
  Rarity,
  RebootVanEntity,
  ShieldMushroomEntity,
  SkyBalloonEntity,
  SlurpTankerEntity,
  StormState,
  SupplyDroneEntity,
  VehicleEntity,
  VehicleKind,
  VisualSoundCue,
  WeaponBunkerEntity,
  WeaponModDef,
  WeaponModId,
  WeatherKind,
  WildBoarEntity,
} from '../types';

export interface CompassTick {
  degree: number;
  label: string;
  offsetDeg: number;
  normX: number;
  isCardinal: boolean;
  isOrdinal: boolean;
}

export interface RarityVisualMeta {
  rarity: Rarity;
  label: string;
  accent: string;
  bgTop: string;
  bgBottom: string;
  border: string;
  glow: string;
  shimmer?: string;
}

export interface KillStreakCallout {
  streak: number;
  tier: 'DOUBLE' | 'TRIPLE' | 'RAMPAGE';
  label: string;
}

export interface ContextualHintItem {
  id: 'repair' | 'slide' | 'zipline';
  key: string;
  label: string;
  tone: 'emerald' | 'cyan' | 'gold';
}

export const BOSS_POI_LABELS: Readonly<Record<string, string>> = {
  frostpeak_citadel: 'GLACIER MONARCH',
  scorched_caldera: 'OBSIDIAN TITAN',
  skyline_spire: 'SKYLINE WARDEN',
};

export const COMPASS_CARDINALS: Readonly<Record<number, string>> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

const RARITY_VISUALS: Record<Rarity, RarityVisualMeta> = {
  common: {
    rarity: 'common',
    label: 'COMMON',
    accent: RARITY_COLORS.common,
    bgTop: '#7f8ea3',
    bgBottom: '#3e4a5c',
    border: '#cbd5e1',
    glow: 'rgba(184, 194, 204, 0.38)',
  },
  uncommon: {
    rarity: 'uncommon',
    label: 'UNCOMMON',
    accent: RARITY_COLORS.uncommon,
    bgTop: '#36d94b',
    bgBottom: '#156c29',
    border: '#86efac',
    glow: 'rgba(56, 217, 75, 0.45)',
  },
  rare: {
    rarity: 'rare',
    label: 'RARE',
    accent: RARITY_COLORS.rare,
    bgTop: '#24a5ff',
    bgBottom: '#1749b8',
    border: '#7dd3fc',
    glow: 'rgba(38, 166, 255, 0.48)',
  },
  epic: {
    rarity: 'epic',
    label: 'EPIC',
    accent: RARITY_COLORS.epic,
    bgTop: '#b44cff',
    bgBottom: '#5e1eb5',
    border: '#e9a8ff',
    glow: 'rgba(180, 76, 255, 0.52)',
  },
  legendary: {
    rarity: 'legendary',
    label: 'LEGENDARY',
    accent: RARITY_COLORS.legendary,
    bgTop: '#ffb319',
    bgBottom: '#b44507',
    border: '#fde047',
    glow: 'rgba(255, 170, 29, 0.58)',
  },
  mythic: {
    rarity: 'mythic',
    label: 'MYTHIC',
    accent: RARITY_COLORS.mythic,
    bgTop: '#fff3a1',
    bgBottom: '#b45309',
    border: '#fef9c3',
    glow: 'rgba(255, 223, 64, 0.78)',
    shimmer:
      'linear-gradient(135deg, #b45309 0%, #f59e0b 25%, #fff3a1 50%, #ffdf40 75%, #92400e 100%)',
  },
};

export function getRarityMeta(rarity: Rarity): RarityVisualMeta {
  return RARITY_VISUALS[rarity] ?? RARITY_VISUALS.common;
}

/**
 * Normalizes any degree value into [0, 360) without negative zero.
 */
export function normalizeDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped === 0 ? 0 : wrapped;
}

/**
 * Converts a Three.js yaw (radians, 0 = looking toward -Z North, negative = turning right/East)
 * into compass heading degrees in [0, 360) where 0=N, 90=E, 180=S, 270=W.
 */
export function getHeadingFromYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return 0;
  return normalizeDegrees((-yaw * 180) / Math.PI);
}

/**
 * Returns shortest signed degree difference (target - source) in [-180, 180).
 */
export function getShortestAngleDiffDeg(targetDeg: number, sourceDeg: number): number {
  const diff = normalizeDegrees(targetDeg - sourceDeg);
  return diff >= 180 ? diff - 360 : diff;
}

/**
 * Computes compass heading degrees [0, 360) from world point A to world point B
 * where -Z is North (0°), +X is East (90°), +Z is South (180°), -X is West (270°).
 */
export function getBearingDeg(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  if (dx === 0 && dz === 0) return 0;
  const rad = Math.atan2(dx, -dz);
  return normalizeDegrees((rad * 180) / Math.PI);
}

/**
 * Generates visible compass tape ticks around `headingDeg` for a horizontal tape spanning `spanDeg`.
 */
export function formatCompassTicks(
  headingDeg: number,
  spanDeg = 120,
  stepDeg = 15,
): CompassTick[] {
  const safeStep = stepDeg > 0 ? stepDeg : 15;
  const safeSpan = spanDeg > 0 ? spanDeg : 120;
  const halfSpan = safeSpan / 2;
  const normHeading = normalizeDegrees(headingDeg);
  const ticks: CompassTick[] = [];

  for (let deg = 0; deg < 360; deg += safeStep) {
    const roundedDeg = Math.round(deg * 1000) / 1000;
    const offsetDeg = getShortestAngleDiffDeg(roundedDeg, normHeading);
    if (Math.abs(offsetDeg) <= halfSpan + 1e-6) {
      const cardinalLabel = COMPASS_CARDINALS[roundedDeg];
      const isCardinal =
        roundedDeg === 0 ||
        roundedDeg === 90 ||
        roundedDeg === 180 ||
        roundedDeg === 270;
      const isOrdinal =
        roundedDeg === 45 ||
        roundedDeg === 135 ||
        roundedDeg === 225 ||
        roundedDeg === 315;
      ticks.push({
        degree: roundedDeg,
        label: cardinalLabel ?? String(Math.round(roundedDeg)),
        offsetDeg,
        normX: 0.5 + offsetDeg / safeSpan,
        isCardinal,
        isOrdinal,
      });
    }
  }

  ticks.sort((a, b) => a.offsetDeg - b.offsetDeg);
  return ticks;
}

/**
 * Maps world X/Z coordinates ([-WORLD_HALF, +WORLD_HALF]) to normalized [0, 1] top-down map space.
 * (-Z = North = top nz=0, +X = East = right nx=1)
 */
export function worldToMapNorm(
  x: number,
  z: number,
): { nx: number; nz: number } {
  return {
    nx: (x + WORLD_HALF) / WORLD_SIZE,
    nz: (z + WORLD_HALF) / WORLD_SIZE,
  };
}

/**
 * Inverse of worldToMapNorm: maps normalized map space [0, 1] back to world X/Z meters.
 */
export function mapNormToWorld(
  nx: number,
  nz: number,
): { x: number; z: number } {
  return {
    x: nx * WORLD_SIZE - WORLD_HALF,
    z: nz * WORLD_SIZE - WORLD_HALF,
  };
}

/**
 * Formats match survival duration as zero-padded MM:SS (e.g., 65 -> "01:05").
 */
export function formatSurvivalTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }
  const totalSec = Math.floor(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats compact HUD countdown timers as M:SS (e.g., 35 -> "0:35", 75 -> "1:15").
 */
export function formatCountdown(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }
  const totalSec = Math.ceil(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Returns animated Kill-Streak callout metadata when `killStreak >= 2`.
 */
export function getKillStreakCallout(
  killStreak: number,
): KillStreakCallout | null {
  if (!Number.isFinite(killStreak) || killStreak < 2) {
    return null;
  }
  const streak = Math.floor(killStreak);
  if (streak === 2) {
    return { streak, tier: 'DOUBLE', label: 'DOUBLE ELIM!' };
  }
  if (streak === 3) {
    return { streak, tier: 'TRIPLE', label: 'TRIPLE ELIM!' };
  }
  return {
    streak,
    tier: 'RAMPAGE',
    label: streak >= 5 ? `RAMPAGE x${streak}!` : 'RAMPAGE!',
  };
}

/**
 * Computes meters outside the active/next safe zone when `stormDistance` is omitted.
 */
export function computeFallbackStormDistance(
  playerX: number,
  playerZ: number,
  storm: Pick<
    StormState,
    | 'currentCenterX'
    | 'currentCenterZ'
    | 'currentRadius'
    | 'nextCenterX'
    | 'nextCenterZ'
    | 'nextRadius'
  >,
): number {
  const useNext = storm.nextRadius > 0;
  const cx = useNext ? storm.nextCenterX : storm.currentCenterX;
  const cz = useNext ? storm.nextCenterZ : storm.currentCenterZ;
  const radius = useNext ? storm.nextRadius : storm.currentRadius;
  return Math.max(0, Math.hypot(playerX - cx, playerZ - cz) - Math.max(0, radius));
}

/**
 * Formats safe-zone distance badge text and urgency flag near the storm pill.
 */
export function formatSafeZoneDistance(
  stormDistance?: number,
  inStorm?: boolean,
): { text: string; isOutside: boolean } {
  if (typeof stormDistance !== 'number' || !Number.isFinite(stormDistance)) {
    return {
      text: inStorm ? 'OUTSIDE ZONE' : 'SAFE ZONE',
      isOutside: Boolean(inStorm),
    };
  }
  if (stormDistance > 0.5) {
    return {
      text: `SAFE ${Math.round(stormDistance)}M`,
      isOutside: true,
    };
  }
  return {
    text: 'IN SAFE',
    isOutside: Boolean(inStorm),
  };
}

const BIOME_LABELS: Readonly<Record<BiomeType, string>> = {
  ocean: 'OPEN OCEAN',
  beach: 'COASTLINE',
  grassland: 'GRASSLANDS',
  forest: 'TIMBER WOODS',
  highland: 'HIGHLANDS',
  urban: 'METRO DISTRICT',
  snow: 'ALPINE PEAKS',
  desert: 'RED MESA',
  volcanic: 'VOLCANIC RIFT',
  cyber: 'CYBER SECTOR',
};

/**
 * Maps BiomeType enum values to concise uppercase HUD labels.
 */
export function formatBiomeLabel(biome?: BiomeType): string {
  if (!biome) return '';
  return BIOME_LABELS[biome] ?? String(biome).toUpperCase();
}

export interface KeybindActionDef {
  key: keyof KeybindMap;
  label: string;
  group: 'BUILDING' | 'MOVEMENT & COMBAT' | 'TACTICAL';
}

export const KEYBIND_ACTION_DEFS: ReadonlyArray<KeybindActionDef> = [
  { key: 'buildWall', label: 'BUILD WALL', group: 'BUILDING' },
  { key: 'buildFloor', label: 'BUILD FLOOR', group: 'BUILDING' },
  { key: 'buildRamp', label: 'BUILD RAMP', group: 'BUILDING' },
  { key: 'buildRoof', label: 'BUILD ROOF', group: 'BUILDING' },
  { key: 'edit', label: 'EDIT STRUCTURE', group: 'BUILDING' },
  { key: 'repair', label: 'REPAIR BUILD', group: 'BUILDING' },
  { key: 'interact', label: 'INTERACT / VEHICLE / VAULT', group: 'MOVEMENT & COMBAT' },
  { key: 'crouchSlide', label: 'CROUCH / SLIDE', group: 'MOVEMENT & COMBAT' },
  { key: 'map', label: 'TACTICAL MAP', group: 'TACTICAL' },
  { key: 'emote', label: 'EMOTE WHEEL', group: 'TACTICAL' },
];

const KEY_CODE_ALIASES: Readonly<Record<string, string>> = {
  Space: 'SPACE',
  ShiftLeft: 'L-SHIFT',
  ShiftRight: 'R-SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'R-CTRL',
  AltLeft: 'ALT',
  AltRight: 'R-ALT',
  Tab: 'TAB',
  CapsLock: 'CAPS',
  Escape: 'ESC',
  Enter: 'ENTER',
  Backspace: 'BKSP',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Mouse3: 'MB4',
  Mouse4: 'MB5',
};

/**
 * Merges partial user keybinds with DEFAULT_KEYBINDS cleanly.
 */
export function resolveKeybinds(keybinds?: Partial<KeybindMap>): KeybindMap {
  const merged: KeybindMap = { ...DEFAULT_KEYBINDS };
  if (!keybinds) return merged;
  for (const def of KEYBIND_ACTION_DEFS) {
    const val = keybinds[def.key];
    if (typeof val === 'string' && val.trim().length > 0) {
      merged[def.key] = val.trim();
    }
  }
  return merged;
}

export function resolveCrosshairColor(color?: string): CrosshairColor {
  return CROSSHAIR_COLORS.some((c) => c.id === color)
    ? (color as CrosshairColor)
    : (DEFAULT_SETTINGS.crosshairColor ?? '#ffffff');
}

export function resolveCrosshairStyle(style?: string): CrosshairStyle {
  return CROSSHAIR_STYLES.some((s) => s.id === style)
    ? (style as CrosshairStyle)
    : (DEFAULT_SETTINGS.crosshairStyle ?? 'dynamic');
}

/**
 * Deep-clones GameSettings including nested keybinds and crosshair settings.
 */
export function cloneSettings(settings: GameSettings): GameSettings {
  return {
    ...settings,
    visualAudio: settings.visualAudio !== false,
    crosshairColor: resolveCrosshairColor(settings.crosshairColor),
    crosshairStyle: resolveCrosshairStyle(settings.crosshairStyle),
    keybinds: resolveKeybinds(settings.keybinds),
  };
}

/**
 * Formats a KeyboardEvent.code (e.g., 'KeyZ', 'Digit4', 'ShiftLeft') into a crisp HUD keycap label.
 */
export function formatKeyCodeLabel(code: string): string {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return '?';
  if (KEY_CODE_ALIASES[trimmed]) {
    return KEY_CODE_ALIASES[trimmed];
  }
  const keyMatch = /^Key([A-Z])$/i.exec(trimmed);
  if (keyMatch) {
    return keyMatch[1].toUpperCase();
  }
  const digitMatch = /^Digit([0-9])$/i.exec(trimmed);
  if (digitMatch) {
    return digitMatch[1];
  }
  const numpadMatch = /^Numpad([0-9])$/i.exec(trimmed);
  if (numpadMatch) {
    return `NUM${numpadMatch[1]}`;
  }
  return trimmed.toUpperCase();
}

const WEATHER_LABELS: Readonly<Record<WeatherKind, string>> = {
  clear: 'CLEAR SKIES',
  golden_hour: 'GOLDEN HOUR',
  overcast: 'OVERCAST',
  rain: 'HEAVY RAIN',
  storm_front: 'STORM FRONT',
};

/**
 * Maps WeatherKind enum values to concise uppercase HUD labels.
 */
export function formatWeatherLabel(weather?: WeatherKind): string {
  if (!weather) return '';
  return WEATHER_LABELS[weather] ?? String(weather).toUpperCase();
}

/**
 * Maps VehicleKind enum values to display labels.
 */
export function formatVehicleKindLabel(kind: VehicleKind): string {
  if (kind === 'cyber_bike') return 'CYBER BIKE';
  if (kind === 'speedboat') return 'APEX SPEEDBOAT';
  return 'HOVER ATV';
}

/**
 * Normalizes vehicle boostCharge (either 0..1 fraction or 0..100 percent) into [0, 100].
 */
export function normalizeBoostChargePct(boostCharge: number): number {
  if (!Number.isFinite(boostCharge) || boostCharge <= 0) return 0;
  const pct = boostCharge <= 1.0001 ? boostCharge * 100 : boostCharge;
  return Math.max(0, Math.min(100, pct));
}

/**
 * Computes active contextual action hints for repair/slide/zipline states.
 */
export function getContextualHudHints(
  state: Pick<HUDState, 'canRepairBuild' | 'isSliding' | 'isZiplining'>,
  keybinds?: Partial<KeybindMap>,
): ContextualHintItem[] {
  const resolved = resolveKeybinds(keybinds);
  const hints: ContextualHintItem[] = [];
  if (state.canRepairBuild) {
    hints.push({
      id: 'repair',
      key: formatKeyCodeLabel(resolved.repair),
      label: 'REPAIR BUILD',
      tone: 'emerald',
    });
  }
  if (state.isSliding) {
    hints.push({
      id: 'slide',
      key: 'SPACE',
      label: 'SLIDE • JUMP BOOST',
      tone: 'cyan',
    });
  }
  if (state.isZiplining) {
    hints.push({
      id: 'zipline',
      key: 'SPACE',
      label: 'ZIPLINE • DETACH',
      tone: 'gold',
    });
  }
  return hints;
}

/**
 * Sanitizes a raw game mode string into a valid GameModeId ('solo' fallback).
 */
export function sanitizeGameMode(mode: unknown): GameModeId {
  if (typeof mode === 'string') {
    const matched = GAME_MODES.find((m) => m.id === mode);
    if (matched) return matched.id;
  }
  return 'solo';
}

/**
 * Returns GAME_MODES metadata entry for a GameModeId (defaulting to 'solo').
 */
export function getGameModeMeta(modeId?: GameModeId): {
  id: GameModeId;
  name: string;
  subtitle: string;
  badge: string;
} {
  const safeId = sanitizeGameMode(modeId);
  return GAME_MODES.find((m) => m.id === safeId) ?? GAME_MODES[0];
}

/**
 * Returns HUD mode chip text ('ZERO BUILD' | 'BLITZ' | 'DUOS' | 'TEAM RUMBLE'), or '' for default 'solo'.
 */
export function formatModeBadgeLabel(modeId?: GameModeId): string {
  if (!modeId || modeId === 'solo') return '';
  if (modeId === 'zero_build') return 'ZERO BUILD';
  if (modeId === 'blitz') return 'BLITZ';
  if (modeId === 'duos') return 'DUOS';
  if (modeId === 'team_rumble') return 'TEAM RUMBLE';
  return String(modeId).toUpperCase();
}

/**
 * Resolves WeaponModDef metadata for a WeaponModId (falls back to first mod).
 */
export function getWeaponModMeta(id: WeaponModId | string): WeaponModDef {
  return WEAPON_MODS.find((m) => m.id === id) ?? WEAPON_MODS[0];
}

/**
 * Computes clamped [0, 100] Overshield bar percentage.
 */
export function computeOvershieldPct(
  overshield?: number,
  maxOvershield?: number,
): number {
  if (
    typeof maxOvershield !== 'number' ||
    !Number.isFinite(maxOvershield) ||
    maxOvershield <= 0
  ) {
    return 0;
  }
  const cur =
    typeof overshield === 'number' && Number.isFinite(overshield)
      ? Math.max(0, overshield)
      : 0;
  return Math.max(0, Math.min(100, (cur / maxOvershield) * 100));
}

/**
 * Computes clamped [0, 100] MatchQuest progress bar percentage.
 */
export function computeQuestProgressPct(
  quest: Pick<MatchQuest, 'progress' | 'target' | 'completed'>,
): number {
  if (quest.completed) return 100;
  const target =
    typeof quest.target === 'number' && Number.isFinite(quest.target) && quest.target > 0
      ? quest.target
      : 1;
  const progress =
    typeof quest.progress === 'number' && Number.isFinite(quest.progress)
      ? Math.max(0, quest.progress)
      : 0;
  return Math.max(0, Math.min(100, (progress / target) * 100));
}

/**
 * Selects up to `maxCount` highest-intensity VisualSoundCue items in a deterministic copy.
 */
export function selectVisibleVisualSoundCues(
  cues?: VisualSoundCue[],
  maxCount = 8,
): VisualSoundCue[] {
  if (!Array.isArray(cues) || cues.length === 0 || maxCount <= 0) {
    return [];
  }
  const valid = cues.filter(
    (c) =>
      Boolean(c) &&
      typeof c.angleRad === 'number' &&
      Number.isFinite(c.angleRad),
  );
  valid.sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0));
  return valid.slice(0, maxCount);
}

/**
 * Converts a finite angle in radians to degrees (0 fallback).
 */
export function angleRadToDeg(angleRad: number): number {
  if (!Number.isFinite(angleRad)) return 0;
  return (angleRad * 180) / Math.PI;
}

/**
 * Resolves AugmentDef metadata for an AugmentId (falls back to first augment).
 */
export function getAugmentMeta(id: AugmentId | string): AugmentDef {
  return AUGMENTS.find((a) => a.id === id) ?? AUGMENTS[0];
}

/**
 * Resolves MedallionDef metadata for a MedallionId (falls back to first medallion).
 */
export function getMedallionMeta(id: MedallionId | string): MedallionDef {
  return MEDALLIONS.find((m) => m.id === id) ?? MEDALLIONS[0];
}

/**
 * Resolves ContrailDef metadata for a contrail id (falls back to default contrail).
 */
export function getContrailMeta(id?: string): ContrailDef {
  return CONTRAILS.find((c) => c.id === id) ?? CONTRAILS[0];
}

/**
 * Computes clamped [0, 100] POI capture progress percentage.
 */
export function computeCaptureProgressPct(
  progress: number,
  captured?: boolean,
): number {
  if (captured) return 100;
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, progress * 100));
}

/**
 * Formats tactical 3D ping label and rounded distance string (e.g. "42M").
 */
export function formatTacticalPingLabel(ping: {
  label?: string;
  kind: 'move' | 'danger' | 'loot';
  distance: number;
}): { text: string; distanceText: string } {
  const fallback =
    ping.kind === 'danger' ? 'DANGER' : ping.kind === 'loot' ? 'LOOT' : 'MOVE';
  const cleaned = typeof ping.label === 'string' ? ping.label.trim().toUpperCase() : '';
  const safeDist =
    typeof ping.distance === 'number' && Number.isFinite(ping.distance)
      ? Math.max(0, Math.round(ping.distance))
      : 0;
  return {
    text: cleaned || fallback,
    distanceText: `${safeDist}M`,
  };
}

export interface WorldChapterOverlay {
  bunkers?: WeaponBunkerEntity[];
  tankers?: SlurpTankerEntity[];
  droppedMedallions?: DroppedMedallionEntity[];
  droppedCrowns?: DroppedCrownEntity[];
}

export interface ResolvedChapterOverlay {
  bunkers: WeaponBunkerEntity[];
  tankers: SlurpTankerEntity[];
  droppedMedallions: DroppedMedallionEntity[];
  droppedCrowns: DroppedCrownEntity[];
}

export function resolveChapterOverlayArgs(
  bunkersOrOverlay: WeaponBunkerEntity[] | WorldChapterOverlay,
  tankers: SlurpTankerEntity[] = [],
  droppedMedallions: DroppedMedallionEntity[] = [],
  droppedCrowns: DroppedCrownEntity[] = [],
): ResolvedChapterOverlay {
  if (Array.isArray(bunkersOrOverlay)) {
    return {
      bunkers: bunkersOrOverlay,
      tankers: Array.isArray(tankers) ? tankers : [],
      droppedMedallions: Array.isArray(droppedMedallions) ? droppedMedallions : [],
      droppedCrowns: Array.isArray(droppedCrowns) ? droppedCrowns : [],
    };
  }
  const ov = bunkersOrOverlay ?? {};
  return {
    bunkers: Array.isArray(ov.bunkers) ? ov.bunkers : [],
    tankers: Array.isArray(ov.tankers) ? ov.tankers : [],
    droppedMedallions: Array.isArray(ov.droppedMedallions) ? ov.droppedMedallions : [],
    droppedCrowns: Array.isArray(ov.droppedCrowns) ? ov.droppedCrowns : [],
  };
}

/**
 * Draws Wave-6 Chapter overlay items (Medallion Threat Circles, Weapon Bunkers,
 * Slurp Tankers, Dropped Medallions & Crowns) without fillText or ellipse.
 */
export function drawChapterMapOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  pxPerMeter: number,
  toPx: (wx: number, wz: number) => { x: number; y: number },
  overlay: ResolvedChapterOverlay,
  medallionCircles: HUDState['medallionCircles'],
  nowMs: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.005);

  // 1. Pulsing golden Medallion Threat Circles
  if (Array.isArray(medallionCircles) && medallionCircles.length > 0) {
    for (const circle of medallionCircles) {
      const cp = toPx(circle.x, circle.z);
      const baseRad = Math.max(8, circle.radius * pxPerMeter);
      if (
        cp.x + baseRad < -16 ||
        cp.x - baseRad > size + 16 ||
        cp.y + baseRad < -16 ||
        cp.y - baseRad > size + 16
      ) {
        continue;
      }
      const pulseRad = baseRad * (0.95 + pulse * 0.08);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, baseRad, 0, Math.PI * 2);
      ctx.fillStyle = circle.isPlayer
        ? `rgba(254, 240, 138, ${(0.1 + pulse * 0.08).toFixed(2)})`
        : `rgba(255, 208, 0, ${(0.12 + pulse * 0.1).toFixed(2)})`;
      ctx.fill();
      ctx.strokeStyle = circle.isPlayer ? '#fef08a' : '#ffd000';
      ctx.lineWidth = 2.0;
      ctx.stroke();

      ctx.setLineDash?.([6, 4]);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, pulseRad + 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 215, 0, ${(0.55 + pulse * 0.35).toFixed(2)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash?.([]);

      const pipCount = Math.max(1, Math.min(3, Math.round(circle.count || 1)));
      for (let i = 0; i < pipCount; i++) {
        const angle = -Math.PI / 2 + (i - (pipCount - 1) / 2) * 0.32;
        const px = cp.x + Math.cos(angle) * baseRad;
        const py = cp.y + Math.sin(angle) * baseRad;
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd000';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 2. Weapon Bunkers (amber locked / green unlocked / muted looted)
  for (const bunker of overlay.bunkers) {
    const bp = toPx(bunker.x, bunker.z);
    if (bp.x < -14 || bp.x > size + 14 || bp.y < -14 || bp.y > size + 14) {
      continue;
    }
    const isGreen = bunker.unlocked && !bunker.looted;
    const isLooted = bunker.looted;
    const accent = isLooted ? '#64748b' : isGreen ? '#34eb5e' : '#f59e0b';
    const bg = isLooted
      ? 'rgba(15, 23, 42, 0.78)'
      : isGreen
        ? 'rgba(20, 83, 45, 0.92)'
        : 'rgba(120, 53, 15, 0.92)';

    ctx.save();
    ctx.translate(bp.x, bp.y);
    ctx.beginPath();
    ctx.arc(0, 0, 7.6, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4.8, 3.8);
    ctx.lineTo(-3.2, -3.4);
    ctx.lineTo(3.2, -3.4);
    ctx.lineTo(4.8, 3.8);
    ctx.closePath();
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(-2.6, -1.0, 5.2, 4.4);
    ctx.beginPath();
    ctx.arc(0, -4.6, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
  }

  // 3. Intact Slurp Tankers (cyan/mint pressurized cylinder)
  for (const tanker of overlay.tankers) {
    if (tanker.destroyed) continue;
    const tp = toPx(tanker.x, tanker.z);
    if (tp.x < -14 || tp.x > size + 14 || tp.y < -14 || tp.y > size + 14) {
      continue;
    }
    ctx.save();
    ctx.translate(tp.x, tp.y);

    ctx.beginPath();
    ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 36, 56, 0.92)';
    ctx.fill();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(-4.6, -2.6, 7.6, 5.2);
    ctx.beginPath();
    ctx.arc(-4.6, 0, 2.6, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(3.0, 0, 2.6, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();
    ctx.fillStyle = '#a7f3d0';
    ctx.fillRect(-3.5, -1.1, 5.4, 1.8);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(3.2, -1.8, 2.4, 3.6);
    ctx.restore();
  }

  // 4. Dropped Medallions
  for (const med of overlay.droppedMedallions) {
    if (med.collected) continue;
    const mp = toPx(med.x, med.z);
    if (mp.x < -14 || mp.x > size + 14 || mp.y < -14 || mp.y > size + 14) {
      continue;
    }
    const meta = getMedallionMeta(med.medallionId);
    ctx.save();
    ctx.translate(mp.x, mp.y);

    ctx.beginPath();
    ctx.arc(0, 0, 7.5 + pulse * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 208, 0, 0.68)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 5.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd000';
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = meta.accentColor;
    ctx.fill();
    ctx.restore();
  }

  // 5. Dropped Victory Crowns
  for (const crown of overlay.droppedCrowns) {
    if (crown.collected) continue;
    const cp = toPx(crown.x, crown.z);
    if (cp.x < -14 || cp.x > size + 14 || cp.y < -14 || cp.y > size + 14) {
      continue;
    }
    ctx.save();
    ctx.translate(cp.x, cp.y);

    ctx.beginPath();
    ctx.arc(0, 0, 8.2 + pulse * 1.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.78)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120, 53, 15, 0.92)';
    ctx.fill();
    ctx.strokeStyle = '#ffd000';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4.4, 3.2);
    ctx.lineTo(-4.8, -2.8);
    ctx.lineTo(-2.0, 0.2);
    ctx.lineTo(0, -4.0);
    ctx.lineTo(2.0, 0.2);
    ctx.lineTo(4.8, -2.8);
    ctx.lineTo(4.4, 3.2);
    ctx.closePath();
    ctx.fillStyle = '#ffd000';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.0;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export interface WorldOverdriveOverlay {
  rails?: GrindRailEntity[];
  vans?: RebootVanEntity[];
  drones?: SupplyDroneEntity[];
}

export interface ResolvedOverdriveOverlay {
  rails: GrindRailEntity[];
  vans: RebootVanEntity[];
  drones: SupplyDroneEntity[];
}

export function resolveOverdriveOverlayArgs(
  railsOrOverlay: GrindRailEntity[] | WorldOverdriveOverlay = [],
  vans: RebootVanEntity[] = [],
  drones: SupplyDroneEntity[] = [],
): ResolvedOverdriveOverlay {
  if (Array.isArray(railsOrOverlay)) {
    return {
      rails: railsOrOverlay,
      vans: Array.isArray(vans) ? vans : [],
      drones: Array.isArray(drones) ? drones : [],
    };
  }
  const ov = railsOrOverlay ?? {};
  return {
    rails: Array.isArray(ov.rails) ? ov.rails : [],
    vans: Array.isArray(ov.vans) ? ov.vans : [],
    drones: Array.isArray(ov.drones) ? ov.drones : [],
  };
}

/**
 * Draws Wave-7 Overdrive overlay items (Neon Grind Rails, Glowing Reboot Vans,
 * and Active Flying Supply Drones) without fillText, strokeText, or ellipse.
 */
export function drawOverdriveMapOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  _pxPerMeter: number,
  toPx: (wx: number, wz: number) => { x: number; y: number },
  overlay: ResolvedOverdriveOverlay,
  nowMs: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.006);

  // 1. Neon Energy Grind Rail splines
  for (const rail of overlay.rails) {
    if (!Array.isArray(rail.points) || rail.points.length < 2) continue;
    const pxPts = rail.points.map((pt) => toPx(pt.x, pt.z));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pxPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (maxX < -24 || minX > size + 24 || maxY < -24 || minY > size + 24) {
      continue;
    }

    ctx.save();
    // Outer neon halo
    ctx.beginPath();
    ctx.moveTo(pxPts[0].x, pxPts[0].y);
    for (let i = 1; i < pxPts.length; i++) {
      ctx.lineTo(pxPts[i].x, pxPts[i].y);
    }
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.36)';
    ctx.lineWidth = 4.6;
    ctx.stroke();

    // Inner glowing rail core
    ctx.beginPath();
    ctx.moveTo(pxPts[0].x, pxPts[0].y);
    for (let i = 1; i < pxPts.length; i++) {
      ctx.lineTo(pxPts[i].x, pxPts[i].y);
    }
    ctx.strokeStyle = rail.color || '#22d3ee';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Endpoint pylons
    ctx.fillStyle = '#e0f2fe';
    for (const ep of [pxPts[0], pxPts[pxPts.length - 1]]) {
      ctx.beginPath();
      ctx.arc(ep.x, ep.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. Glowing Blue Reboot Vans
  for (const van of overlay.vans) {
    const vp = toPx(van.x, van.z);
    if (vp.x < -16 || vp.x > size + 16 || vp.y < -16 || vp.y > size + 16) {
      continue;
    }
    const ready = Boolean(van.available && (van.cooldownRemainingSec ?? 0) <= 0);
    ctx.save();
    ctx.translate(vp.x, vp.y);

    if (ready) {
      ctx.beginPath();
      ctx.arc(0, 0, 8.6 + pulse * 1.4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = ready ? 'rgba(8, 38, 76, 0.94)' : 'rgba(15, 23, 42, 0.82)';
    ctx.fill();
    ctx.strokeStyle = ready ? '#38bdf8' : '#64748b';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Van body & beacon
    ctx.fillStyle = ready ? '#38bdf8' : '#64748b';
    ctx.fillRect(-4.6, -1.8, 9.2, 4.6);
    ctx.fillStyle = ready ? '#e0f2fe' : '#94a3b8';
    ctx.fillRect(-2.0, -4.2, 4.0, 2.1);
    ctx.fillStyle = ready ? '#ffd000' : '#f59e0b';
    ctx.fillRect(-2.2, -0.3, 4.4, 1.5);
    ctx.restore();
  }

  // 3. Active Flying Supply Drones (skip destroyed)
  for (const drone of overlay.drones) {
    if (drone.destroyed) continue;
    const dp = toPx(drone.x, drone.z);
    if (dp.x < -16 || dp.x > size + 16 || dp.y < -16 || dp.y > size + 16) {
      continue;
    }
    const rMeta = getRarityMeta(drone.rarity);
    ctx.save();
    ctx.translate(dp.x, dp.y);

    ctx.beginPath();
    ctx.arc(0, 0, 7.8 + pulse * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = rMeta.border;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 20, 44, 0.9)';
    ctx.fill();
    ctx.strokeStyle = rMeta.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Crossed rotor arms
    ctx.beginPath();
    ctx.moveTo(-4.4, -4.4);
    ctx.lineTo(4.4, 4.4);
    ctx.moveTo(4.4, -4.4);
    ctx.lineTo(-4.4, 4.4);
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Central loot crate
    ctx.fillStyle = rMeta.accent;
    ctx.fillRect(-2.3, -2.3, 4.6, 4.6);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.0;
    ctx.strokeRect(-2.3, -2.3, 4.6, 4.6);
    ctx.restore();
  }
}

export interface MatchHighlightBadge {
  label: string;
  tone: 'gold' | 'cyan' | 'emerald' | 'crimson';
}

function classifyHighlightTone(
  label: string,
): MatchHighlightBadge['tone'] {
  if (
    label.includes('CROWN') ||
    label.includes('VICTORY') ||
    label.includes('MEDALLION') ||
    label.includes('HEIST') ||
    label.includes('TITAN') ||
    label.includes('SMASH')
  ) {
    return 'gold';
  }
  if (
    label.includes('TRAP') ||
    label.includes('MEDIC') ||
    label.includes('SURVIVOR') ||
    label.includes('ANGLER')
  ) {
    return 'emerald';
  }
  if (
    label.includes('SHARP') ||
    label.includes('ELIM') ||
    label.includes('SLAYER') ||
    label.includes('RECON')
  ) {
    return 'crimson';
  }
  return 'cyan';
}

/**
 * Combines explicit `summary.highlights` with auto-derived Match Highlight badges
 * (e.g. CROWNED, TRAIN HEIST, SKY RIDER, REBOOT HERO, DRONE HUNTER, TRAP MASTER, SHARPSHOOTER, BUILDER PRO).
 */
export function deriveMatchHighlightBadges(
  summary: MatchSummary,
  maxBadges = 8,
): MatchHighlightBadge[] {
  const badges: MatchHighlightBadge[] = [];
  const seen = new Set<string>();

  const pushBadge = (rawLabel: string, tone?: MatchHighlightBadge['tone']) => {
    const clean = rawLabel.trim().toUpperCase();
    if (!clean || seen.has(clean) || badges.length >= maxBadges) return;
    seen.add(clean);
    badges.push({
      label: clean,
      tone: tone ?? classifyHighlightTone(clean),
    });
  };

  if (Array.isArray(summary.highlights)) {
    for (const h of summary.highlights) {
      if (typeof h === 'string') {
        pushBadge(h);
      }
    }
  }

  const accPct =
    summary.accuracy > 1
      ? Math.round(summary.accuracy)
      : summary.shotsFired > 0
        ? Math.round((summary.shotsHit / summary.shotsFired) * 100)
        : Math.round(summary.accuracy * 100);

  if (summary.crownedVictory) {
    pushBadge('CROWNED', 'gold');
  }
  if ((summary.trainChestsHacked ?? 0) >= 1) {
    pushBadge('TRAIN HEIST', 'gold');
  }
  if ((summary.hopCrystalsUsed ?? 0) >= 1) {
    pushBadge('SKY RIDER', 'cyan');
  }
  if ((summary.hammerSlams ?? 0) >= 2) {
    pushBadge('TITAN SMASH', 'gold');
  }
  if ((summary.flaresFired ?? 0) >= 1) {
    pushBadge('RECON ACE', 'crimson');
  }
  if ((summary.turretsDeployed ?? 0) >= 1) {
    pushBadge('TURRET ENGINEER', 'cyan');
  }
  if ((summary.fishCaught ?? 0) >= 1) {
    pushBadge('MASTER ANGLER', 'emerald');
  }
  if ((summary.reboots ?? 0) >= 1) {
    pushBadge('REBOOT HERO', 'cyan');
  }
  if ((summary.dronesShotDown ?? 0) >= 1) {
    pushBadge('DRONE HUNTER', 'cyan');
  }
  if ((summary.trapsPlaced ?? 0) >= 1) {
    pushBadge('TRAP MASTER', 'emerald');
  }
  if ((summary.modsInstalled ?? 0) >= 1) {
    pushBadge('MODDED PRO', 'cyan');
  }
  if ((summary.empHits ?? 0) >= 1) {
    pushBadge('EMP BREAKER', 'cyan');
  }
  if (
    (summary.headshots ?? 0) >= 3 ||
    (accPct >= 50 && (summary.shotsFired ?? 0) >= 10)
  ) {
    pushBadge('SHARPSHOOTER', 'crimson');
  }
  if ((summary.structuresBuilt ?? 0) >= 10) {
    pushBadge('BUILDER PRO', 'cyan');
  }
  if ((summary.revives ?? 0) >= 1) {
    pushBadge('SQUAD MEDIC', 'emerald');
  }
  if ((summary.medallionsHeld?.length ?? 0) >= 1) {
    pushBadge('MEDALLION BEARER', 'gold');
  }
  if ((summary.kills ?? 0) >= 5) {
    pushBadge('ELIM LEADER', 'gold');
  }

  return badges;
}

export interface WorldFrontierOverlay {
  modBenches: ModBenchEntity[];
  forecastTowers: ForecastTowerEntity[];
}

export function resolveFrontierOverlayArgs(
  modBenchesOrOverlay: ModBenchEntity[] | Partial<WorldFrontierOverlay> = [],
  forecastTowers: ForecastTowerEntity[] = [],
): WorldFrontierOverlay {
  if (Array.isArray(modBenchesOrOverlay)) {
    return {
      modBenches: modBenchesOrOverlay,
      forecastTowers: Array.isArray(forecastTowers) ? forecastTowers : [],
    };
  }
  const ov = modBenchesOrOverlay ?? {};
  return {
    modBenches: Array.isArray(ov.modBenches) ? ov.modBenches : [],
    forecastTowers: Array.isArray(ov.forecastTowers) ? ov.forecastTowers : [],
  };
}

/**
 * Draws Wave-8 Frontier overlay items (dashed golden Future Storm Forecast Rings,
 * Weapon Mod Benches, Forecast Towers, and Team Rumble Blue Ally chevrons)
 * without fillText, strokeText, or ellipse.
 */
export function drawFrontierMapOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  pxPerMeter: number,
  toPx: (wx: number, wz: number) => { x: number; y: number },
  overlay: WorldFrontierOverlay,
  futureStormRings?: FutureStormRing[],
  blueAllies?: Array<{ x: number; z: number }>,
  nowMs = performance.now(),
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.006);

  // 1. Dashed golden Future Storm Forecast Rings
  if (Array.isArray(futureStormRings) && futureStormRings.length > 0) {
    for (let i = 0; i < futureStormRings.length; i++) {
      const ring = futureStormRings[i];
      if (!ring || !Number.isFinite(ring.radius) || ring.radius <= 0) continue;
      const rp = toPx(ring.centerX, ring.centerZ);
      const radPx = ring.radius * pxPerMeter;
      if (
        rp.x + radPx < -24 ||
        rp.x - radPx > size + 24 ||
        rp.y + radPx < -24 ||
        rp.y - radPx > size + 24
      ) {
        continue;
      }
      const alpha = Math.max(0.48, 0.9 - i * 0.18);
      ctx.save();
      ctx.setLineDash?.([6, 4]);
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, radPx, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 208, 0, 0.04)';
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 208, 0, ${alpha.toFixed(2)})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash?.([]);
      ctx.restore();
    }
  }

  // 2. Illuminated Weapon Mod Benches
  const benches = Array.isArray(overlay?.modBenches) ? overlay.modBenches : [];
  for (const bench of benches) {
    const bp = toPx(bench.x, bench.z);
    if (bp.x < -14 || bp.x > size + 14 || bp.y < -14 || bp.y > size + 14) {
      continue;
    }
    ctx.save();
    ctx.translate(bp.x, bp.y);

    ctx.beginPath();
    ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fill();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Workbench slab + legs + cyan weapon silhouette
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-4.6, 0.4, 9.2, 2.2);
    ctx.fillRect(-3.6, 2.6, 1.8, 2.0);
    ctx.fillRect(1.8, 2.6, 1.8, 2.0);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(-3.8, -2.5, 7.6, 1.9);
    ctx.beginPath();
    ctx.arc(0, -3.8, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#c084fc';
    ctx.fill();
    ctx.restore();
  }

  // 3. Weather Forecast Radar Towers
  const towers = Array.isArray(overlay?.forecastTowers) ? overlay.forecastTowers : [];
  for (const tower of towers) {
    const tp = toPx(tower.x, tower.z);
    if (tp.x < -16 || tp.x > size + 16 || tp.y < -16 || tp.y > size + 16) {
      continue;
    }
    const scanned = Boolean(tower.scanned);
    ctx.save();
    ctx.translate(tp.x, tp.y);

    ctx.beginPath();
    ctx.arc(0, 0, 8.4 + pulse * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = scanned
      ? 'rgba(52, 235, 94, 0.58)'
      : 'rgba(255, 208, 0, 0.65)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = scanned ? 'rgba(6, 78, 59, 0.92)' : 'rgba(8, 32, 68, 0.94)';
    ctx.fill();
    ctx.strokeStyle = scanned ? '#34eb5e' : '#ffd000';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Tripod mast + radar dish
    ctx.beginPath();
    ctx.moveTo(0, -3.2);
    ctx.lineTo(-3.4, 4.4);
    ctx.moveTo(0, -3.2);
    ctx.lineTo(3.4, 4.4);
    ctx.moveTo(0, -3.2);
    ctx.lineTo(0, 4.4);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -2.0, 3.0, Math.PI * 0.95, Math.PI * 1.95);
    ctx.strokeStyle = scanned ? '#34eb5e' : '#22d3ee';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  // 4. Team Rumble Blue Ally Chevrons
  if (Array.isArray(blueAllies) && blueAllies.length > 0) {
    for (const ally of blueAllies) {
      const ap = toPx(ally.x, ally.z);
      if (ap.x < -12 || ap.x > size + 12 || ap.y < -12 || ap.y > size + 12) {
        continue;
      }
      ctx.save();
      ctx.translate(ap.x, ap.y);

      ctx.beginPath();
      ctx.arc(0, 0, 5.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 64, 175, 0.78)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, -4.4);
      ctx.lineTo(3.8, 3.4);
      ctx.lineTo(0, 1.5);
      ctx.lineTo(-3.8, 3.4);
      ctx.closePath();
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

export interface WorldSkyforgeOverlay {
  train: ApexTrainState | null;
  craters: MeteorCraterEntity[];
}

export function resolveSkyforgeOverlayArgs(
  trainOrOverlay: ApexTrainState | null | Partial<WorldSkyforgeOverlay> = null,
  craters: MeteorCraterEntity[] = [],
): WorldSkyforgeOverlay {
  if (trainOrOverlay === null || trainOrOverlay === undefined) {
    return {
      train: null,
      craters: Array.isArray(craters) ? craters : [],
    };
  }
  if (
    typeof trainOrOverlay === 'object' &&
    ('train' in trainOrOverlay || 'craters' in trainOrOverlay) &&
    !('trackPoints' in trainOrOverlay) &&
    !('carPositions' in trainOrOverlay)
  ) {
    const ov = trainOrOverlay as Partial<WorldSkyforgeOverlay>;
    return {
      train: ov.train ?? null,
      craters: Array.isArray(ov.craters) ? ov.craters : [],
    };
  }
  return {
    train: trainOrOverlay as ApexTrainState,
    craters: Array.isArray(craters) ? craters : [],
  };
}

/**
 * Draws Wave-9 Skyforge overlay items (closed Apex Express railway loop,
 * live moving Apex Express Train carriage icon, and glowing violet Rift Meteor Craters)
 * without fillText, strokeText, or ellipse (Node test mock safe).
 */
export function drawSkyforgeMapOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  pxPerMeter: number,
  toPx: (wx: number, wz: number) => { x: number; y: number },
  overlay: WorldSkyforgeOverlay,
  trainPosFallback?: HUDState['trainPos'],
  nowMs = performance.now(),
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.006);
  const train = overlay?.train ?? null;

  // 1. Closed Apex Express Railway Loop
  if (train && Array.isArray(train.trackPoints) && train.trackPoints.length >= 2) {
    const pxPts = train.trackPoints.map((pt) => toPx(pt.x, pt.z));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pxPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (!(maxX < -24 || minX > size + 24 || maxY < -24 || minY > size + 24)) {
      const traceClosedTrack = () => {
        ctx.beginPath();
        ctx.moveTo(pxPts[0].x, pxPts[0].y);
        for (let i = 1; i < pxPts.length; i++) {
          ctx.lineTo(pxPts[i].x, pxPts[i].y);
        }
        ctx.closePath();
      };

      ctx.save();
      traceClosedTrack();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.58)';
      ctx.lineWidth = 4.8;
      ctx.stroke();

      traceClosedTrack();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.78)';
      ctx.lineWidth = 2.0;
      ctx.stroke();

      ctx.setLineDash?.([4, 6]);
      traceClosedTrack();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash?.([]);
      ctx.restore();
    }
  }

  // 2. Glowing Violet Rift Meteor Craters & Hop Crystals
  const craters = Array.isArray(overlay?.craters) ? overlay.craters : [];
  for (const crater of craters) {
    if (!crater || !Number.isFinite(crater.x) || !Number.isFinite(crater.z)) {
      continue;
    }
    const cp = toPx(crater.x, crater.z);
    const radPx = Math.max(7.2, Math.min(18, (crater.radius || 8) * pxPerMeter));
    if (
      cp.x + radPx < -16 ||
      cp.x - radPx > size + 16 ||
      cp.y + radPx < -16 ||
      cp.y - radPx > size + 16
    ) {
      continue;
    }
    const ready = Boolean(crater.crystalAvailable);
    ctx.save();
    ctx.translate(cp.x, cp.y);

    if (ready) {
      ctx.beginPath();
      ctx.arc(0, 0, radPx + 1.8 + pulse * 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.72)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, radPx, 0, Math.PI * 2);
    ctx.fillStyle = ready ? 'rgba(59, 7, 100, 0.88)' : 'rgba(30, 27, 46, 0.78)';
    ctx.fill();
    ctx.strokeStyle = ready ? '#c084fc' : '#64748b';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Central Hop Crystal shard diamond
    ctx.beginPath();
    ctx.moveTo(0, -4.8);
    ctx.lineTo(3.5, 0);
    ctx.lineTo(0, 4.8);
    ctx.lineTo(-3.5, 0);
    ctx.closePath();
    ctx.fillStyle = ready ? '#e879f9' : '#64748b';
    ctx.fill();
    ctx.strokeStyle = ready ? '#f5d0fe' : '#94a3b8';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    if (ready) {
      ctx.beginPath();
      ctx.arc(0, -1.2, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#fae8ff';
      ctx.fill();
    }

    ctx.restore();
  }

  // 3. Live Moving Apex Express Train Carriage Icon
  const useFallback =
    trainPosFallback &&
    Number.isFinite(trainPosFallback.x) &&
    Number.isFinite(trainPosFallback.z);
  const loco = useFallback
    ? trainPosFallback
    : train && train.active !== false && Number.isFinite(train.x) && Number.isFinite(train.z)
      ? train
      : null;

  if (loco) {
    // Trailing cargo cars when aligned with live locomotive position
    const carsAligned =
      train &&
      train.active !== false &&
      Array.isArray(train.carPositions) &&
      (!useFallback || Math.hypot(loco.x - train.x, loco.z - train.z) < 2.0);
    if (carsAligned && train.carPositions.length > 0) {
      for (const car of train.carPositions) {
        if (!car || !Number.isFinite(car.x) || !Number.isFinite(car.z)) continue;
        if (Math.hypot(car.x - loco.x, car.z - loco.z) < 1.5) continue;
        const carp = toPx(car.x, car.z);
        if (carp.x < -16 || carp.x > size + 16 || carp.y < -16 || carp.y > size + 16) {
          continue;
        }
        ctx.save();
        ctx.translate(carp.x, carp.y);
        if (Number.isFinite(car.yaw)) {
          ctx.rotate?.(-car.yaw);
        }
        ctx.fillStyle = '#334155';
        ctx.fillRect(-4.2, -2.5, 8.4, 5.0);
        ctx.fillStyle = loco.chestHacked ? '#38bdf8' : '#ffd000';
        ctx.fillRect(-2.4, -1.2, 4.8, 2.4);
        ctx.restore();
      }
    }

    const tp = toPx(loco.x, loco.z);
    if (!(tp.x < -18 || tp.x > size + 18 || tp.y < -18 || tp.y > size + 18)) {
      const hacked = Boolean(loco.chestHacked);
      ctx.save();
      ctx.translate(tp.x, tp.y);

      ctx.beginPath();
      ctx.arc(0, 0, 9.2 + pulse * 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = hacked
        ? 'rgba(34, 211, 238, 0.6)'
        : 'rgba(255, 208, 0, 0.78)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 8.0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fill();
      ctx.strokeStyle = hacked ? '#22d3ee' : '#ffd000';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      if (Number.isFinite(loco.yaw)) {
        ctx.rotate?.(-loco.yaw);
      }

      // Armored Locomotive Carriage Body + Cowcatcher + Headlamp
      ctx.fillStyle = '#475569';
      ctx.fillRect(-5.0, -3.0, 7.8, 6.0);
      ctx.beginPath();
      ctx.moveTo(2.8, -3.0);
      ctx.lineTo(5.6, 0);
      ctx.lineTo(2.8, 3.0);
      ctx.closePath();
      ctx.fillStyle = hacked ? '#38bdf8' : '#f59e0b';
      ctx.fill();

      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(-3.6, -1.2, 4.8, 2.4);

      ctx.beginPath();
      ctx.arc(4.6, 0, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#fef08a';
      ctx.fill();

      ctx.restore();
    }
  }
}

export interface WorldTideOverlay {
  boars: WildBoarEntity[];
  mushrooms: ShieldMushroomEntity[];
}

export function resolveTideOverlayArgs(
  boarsOrOverlay: WildBoarEntity[] | Partial<WorldTideOverlay> = [],
  mushrooms: ShieldMushroomEntity[] = [],
): WorldTideOverlay {
  if (Array.isArray(boarsOrOverlay)) {
    return {
      boars: boarsOrOverlay,
      mushrooms: Array.isArray(mushrooms) ? mushrooms : [],
    };
  }
  const ov = boarsOrOverlay ?? {};
  return {
    boars: Array.isArray(ov.boars) ? ov.boars : [],
    mushrooms: Array.isArray(ov.mushrooms) ? ov.mushrooms : [],
  };
}

/**
 * Draws a cyan hydro-boat chevron marker for an active Speedboat at pixel coordinates `(px, py)`
 * without fillText, strokeText, or ellipse (Node test mock safe).
 */
export function drawSpeedboatMapChevron(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  yaw = 0,
  occupied = false,
): void {
  ctx.save();
  ctx.translate(px, py);
  if (typeof yaw === 'number' && Number.isFinite(yaw)) {
    ctx.rotate?.(-yaw);
  }

  ctx.beginPath();
  ctx.arc(0, 0, 7.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 51, 68, 0.88)';
  ctx.fill();
  ctx.strokeStyle = occupied ? '#ffd000' : '#22d3ee';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -5.6);
  ctx.lineTo(4.6, 4.2);
  ctx.lineTo(0, 2.0);
  ctx.lineTo(-4.6, 4.2);
  ctx.closePath();
  ctx.fillStyle = occupied ? '#ffd000' : '#22d3ee';
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 1.1;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -0.6, 1.3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}

/**
 * Draws Wave-10 Tide & Recon overlay items (pulsing crimson Recon Flare Scan Rings,
 * available Shield Mushrooms, live Wild Boars, and optional Speedboat cyan hydro-boat chevrons)
 * without fillText, strokeText, or ellipse (Node test mock safe).
 */
export function drawTideMapOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  pxPerMeter: number,
  toPx: (wx: number, wz: number) => { x: number; y: number },
  overlay: WorldTideOverlay,
  flareBeacons?: HUDState['flareBeacons'],
  vehicles?: VehicleEntity[],
  nowMs = performance.now(),
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.007);
  const sweep = (nowMs * 0.0012) % 1;

  // 1. Pulsing Crimson Recon Flare Scan Rings
  if (Array.isArray(flareBeacons) && flareBeacons.length > 0) {
    for (const beacon of flareBeacons) {
      if (
        !beacon ||
        !Number.isFinite(beacon.x) ||
        !Number.isFinite(beacon.z) ||
        !Number.isFinite(beacon.radius) ||
        beacon.radius <= 0
      ) {
        continue;
      }
      if (
        typeof beacon.remainingSec === 'number' &&
        Number.isFinite(beacon.remainingSec) &&
        beacon.remainingSec <= 0
      ) {
        continue;
      }
      const fp = toPx(beacon.x, beacon.z);
      const baseRad = Math.max(10, beacon.radius * pxPerMeter);
      if (
        fp.x + baseRad < -18 ||
        fp.x - baseRad > size + 18 ||
        fp.y + baseRad < -18 ||
        fp.y - baseRad > size + 18
      ) {
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, baseRad, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${(0.09 + pulse * 0.08).toFixed(2)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(248, 113, 113, ${(0.68 + pulse * 0.28).toFixed(2)})`;
      ctx.lineWidth = 1.9;
      ctx.stroke();

      const waveRad = Math.max(4, baseRad * (0.28 + sweep * 0.72));
      ctx.setLineDash?.([5, 4]);
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, waveRad, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(252, 165, 165, ${(0.88 - sweep * 0.52).toFixed(2)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash?.([]);

      // Flare beacon core marker
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#fee2e2';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(fp.x, fp.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = '#fef08a';
      ctx.fill();
      ctx.restore();
    }
  }

  // 2. Available Shield Mushrooms (subtle cyan cap markers)
  const mushrooms = Array.isArray(overlay?.mushrooms) ? overlay.mushrooms : [];
  for (const mush of mushrooms) {
    if (!mush || !mush.available || !Number.isFinite(mush.x) || !Number.isFinite(mush.z)) {
      continue;
    }
    const mp = toPx(mush.x, mush.z);
    if (mp.x < -12 || mp.x > size + 12 || mp.y < -12 || mp.y > size + 12) {
      continue;
    }
    ctx.save();
    ctx.translate(mp.x, mp.y);

    ctx.beginPath();
    ctx.arc(0, 0, 4.0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 47, 73, 0.88)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0.2, 2.8, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = '#22d3ee';
    ctx.fill();

    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(-1.0, 0.2, 2.0, 2.0);
    ctx.restore();
  }

  // 3. Live Wild Boars
  const boars = Array.isArray(overlay?.boars) ? overlay.boars : [];
  for (const boar of boars) {
    if (!boar || !boar.alive || !Number.isFinite(boar.x) || !Number.isFinite(boar.z)) {
      continue;
    }
    const bp = toPx(boar.x, boar.z);
    if (bp.x < -14 || bp.x > size + 14 || bp.y < -14 || bp.y > size + 14) {
      continue;
    }
    const charging = boar.state === 'charge';
    ctx.save();
    ctx.translate(bp.x, bp.y);

    if (charging) {
      ctx.beginPath();
      ctx.arc(0, 0, 7.6 + pulse * 1.4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(67, 20, 7, 0.92)';
    ctx.fill();
    ctx.strokeStyle = charging ? '#ef4444' : '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Boar head & curved ivory tusks
    ctx.beginPath();
    ctx.moveTo(0, -3.4);
    ctx.lineTo(3.4, -0.5);
    ctx.lineTo(2.4, 3.2);
    ctx.lineTo(-2.4, 3.2);
    ctx.lineTo(-3.4, -0.5);
    ctx.closePath();
    ctx.fillStyle = '#ea580c';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-2.4, 1.4);
    ctx.lineTo(-4.6, -0.8);
    ctx.moveTo(2.4, 1.4);
    ctx.lineTo(4.6, -0.8);
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-1.2, -0.8, 0.9, 0, Math.PI * 2);
    ctx.arc(1.2, -0.8, 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.fill();

    ctx.restore();
  }

  // 4. Optional Speedboat Cyan Hydro-Boat Chevrons
  if (Array.isArray(vehicles) && vehicles.length > 0) {
    for (const vehicle of vehicles) {
      if (!vehicle || vehicle.destroyed || vehicle.kind !== 'speedboat') continue;
      if (!Number.isFinite(vehicle.x) || !Number.isFinite(vehicle.z)) continue;
      const vp = toPx(vehicle.x, vehicle.z);
      if (vp.x < -14 || vp.x > size + 14 || vp.y < -14 || vp.y > size + 14) {
        continue;
      }
      drawSpeedboatMapChevron(
        ctx,
        vp.x,
        vp.y,
        vehicle.yaw,
        vehicle.driverId !== null,
      );
    }
  }
}

export interface WorldOverlordOverlay {
  fishingHoles: FishingHoleEntity[];
  skyBalloons: SkyBalloonEntity[];
}

export function resolveOverlordOverlayArgs(
  fishingHolesOrOverlay: FishingHoleEntity[] | Partial<WorldOverlordOverlay> = [],
  skyBalloons: SkyBalloonEntity[] = [],
): WorldOverlordOverlay {
  if (Array.isArray(fishingHolesOrOverlay)) {
    return {
      fishingHoles: fishingHolesOrOverlay,
      skyBalloons: Array.isArray(skyBalloons) ? skyBalloons : [],
    };
  }
  const ov = fishingHolesOrOverlay ?? {};
  return {
    fishingHoles: Array.isArray(ov.fishingHoles) ? ov.fishingHoles : [],
    skyBalloons: Array.isArray(ov.skyBalloons) ? ov.skyBalloons : [],
  };
}

/**
 * Draws Wave-11 Overlord overlay items (active Sky Balloons, Fishing Holes,
 * and Deployed Auto-Turrets) without fillText, strokeText, or ellipse (Node test mock safe).
 */
export function drawOverlordMapOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  pxPerMeter: number,
  toPx: (wx: number, wz: number) => { x: number; y: number },
  overlay: WorldOverlordOverlay,
  deployedTurrets?: HUDState['deployedTurrets'],
  nowMs = performance.now(),
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.006);

  // 1. Active Fishing Holes (rippling cyan water spots)
  const holes = Array.isArray(overlay?.fishingHoles) ? overlay.fishingHoles : [];
  for (const hole of holes) {
    if (
      !hole ||
      hole.depleted ||
      (typeof hole.castsRemaining === 'number' && hole.castsRemaining <= 0) ||
      !Number.isFinite(hole.x) ||
      !Number.isFinite(hole.z)
    ) {
      continue;
    }
    const fp = toPx(hole.x, hole.z);
    if (fp.x < -14 || fp.x > size + 14 || fp.y < -14 || fp.y > size + 14) {
      continue;
    }
    ctx.save();
    ctx.translate(fp.x, fp.y);

    // Outer water ripple pulse ring
    ctx.beginPath();
    ctx.arc(0, 0, 7.4 + pulse * 1.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Inner water pool disc
    ctx.beginPath();
    ctx.arc(0, 0, 5.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 51, 68, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Inner dashed splash ripple + fish/bobber diamond
    ctx.setLineDash?.([2.4, 2.0]);
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 1.0;
    ctx.stroke();
    ctx.setLineDash?.([]);

    ctx.beginPath();
    ctx.moveTo(0, -2.2);
    ctx.lineTo(2.4, 0);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-2.4, 0);
    ctx.closePath();
    ctx.fillStyle = '#67e8f9';
    ctx.fill();

    ctx.restore();
  }

  // 2. Active Sky Balloons (amber/cyan aerial ascent markers)
  const balloons = Array.isArray(overlay?.skyBalloons) ? overlay.skyBalloons : [];
  for (const balloon of balloons) {
    if (!balloon || !Number.isFinite(balloon.x) || !Number.isFinite(balloon.z)) {
      continue;
    }
    const bp = toPx(balloon.x, balloon.z);
    if (bp.x < -16 || bp.x > size + 16 || bp.y < -16 || bp.y > size + 16) {
      continue;
    }
    ctx.save();
    ctx.translate(bp.x, bp.y);

    // Dashed ascent halo
    ctx.setLineDash?.([3.2, 2.6]);
    ctx.beginPath();
    ctx.arc(0, 0, 8.8 + pulse * 1.4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.setLineDash?.([]);

    // Backdrop disc
    ctx.beginPath();
    ctx.arc(0, 0, 7.0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Balloon canopy circle + cyan equator stripe + basket
    ctx.beginPath();
    ctx.arc(0, -0.9, 4.0, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(-3.6, -1.6, 7.2, 1.4);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-1.8, 3.2, 3.6, 2.0);

    ctx.restore();
  }

  // 3. Deployed Auto-Turrets (cyan friendly / crimson hostile + subtle detection perimeter)
  if (Array.isArray(deployedTurrets) && deployedTurrets.length > 0) {
    for (const turret of deployedTurrets) {
      if (!turret || !Number.isFinite(turret.x) || !Number.isFinite(turret.z)) {
        continue;
      }
      const tp = toPx(turret.x, turret.z);
      const rangeRad = Math.max(10, 34 * pxPerMeter);
      const pad = Math.max(18, rangeRad + 8);
      if (
        tp.x + pad < 0 ||
        tp.x - pad > size ||
        tp.y + pad < 0 ||
        tp.y - pad > size
      ) {
        continue;
      }
      const friendly = Boolean(turret.isFriendly);
      const accent = friendly ? '#22d3ee' : '#ef4444';
      const inner = friendly ? '#67e8f9' : '#fca5a5';
      const bg = friendly ? 'rgba(8, 51, 68, 0.94)' : 'rgba(69, 10, 10, 0.94)';

      ctx.save();
      ctx.translate(tp.x, tp.y);

      // Subtle dashed sentry range ring
      ctx.setLineDash?.([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, rangeRad, 0, Math.PI * 2);
      ctx.strokeStyle = friendly
        ? 'rgba(34, 211, 238, 0.36)'
        : 'rgba(239, 68, 68, 0.38)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash?.([]);

      // Pulsing turret lock halo
      ctx.beginPath();
      ctx.arc(0, 0, 7.2 + pulse * 1.4, 0, Math.PI * 2);
      ctx.strokeStyle = friendly
        ? 'rgba(34, 211, 238, 0.72)'
        : 'rgba(248, 113, 113, 0.76)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // Turret housing disc
      ctx.beginPath();
      ctx.arc(0, 0, 6.0, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Tripod struts & dual gun barrels
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-3.8, 3.8);
      ctx.moveTo(0, 0);
      ctx.lineTo(3.8, 3.8);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -4.4);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.fillRect(-3.0, -2.6, 6.0, 4.0);

      ctx.beginPath();
      ctx.arc(0, -0.6, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = inner;
      ctx.fill();

      ctx.restore();
    }
  }
}
