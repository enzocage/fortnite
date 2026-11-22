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
  WORLD_HALF,
  WORLD_SIZE,
} from '../core';
import type {
  AugmentDef,
  AugmentId,
  BiomeType,
  ContrailDef,
  CrosshairColor,
  CrosshairStyle,
  DroppedCrownEntity,
  DroppedMedallionEntity,
  GameModeId,
  GameSettings,
  GrindRailEntity,
  HUDState,
  KeybindMap,
  MatchQuest,
  MatchSummary,
  MedallionDef,
  MedallionId,
  Rarity,
  RebootVanEntity,
  SlurpTankerEntity,
  StormState,
  SupplyDroneEntity,
  VehicleKind,
  VisualSoundCue,
  WeaponBunkerEntity,
  WeatherKind,
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
  return kind === 'cyber_bike' ? 'CYBER BIKE' : 'HOVER ATV';
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
 * Returns HUD mode chip text ('ZERO BUILD' | 'BLITZ' | 'DUOS'), or '' for default 'solo'.
 */
export function formatModeBadgeLabel(modeId?: GameModeId): string {
  if (!modeId || modeId === 'solo') return '';
  if (modeId === 'zero_build') return 'ZERO BUILD';
  if (modeId === 'blitz') return 'BLITZ';
  if (modeId === 'duos') return 'DUOS';
  return String(modeId).toUpperCase();
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
    label.includes('MEDALLION')
  ) {
    return 'gold';
  }
  if (label.includes('TRAP') || label.includes('MEDIC') || label.includes('SURVIVOR')) {
    return 'emerald';
  }
  if (label.includes('SHARP') || label.includes('ELIM') || label.includes('SLAYER')) {
    return 'crimson';
  }
  return 'cyan';
}

/**
 * Combines explicit `summary.highlights` with auto-derived Match Highlight badges
 * (e.g. CROWNED, REBOOT HERO, DRONE HUNTER, TRAP MASTER, SHARPSHOOTER, BUILDER PRO).
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
  if ((summary.reboots ?? 0) >= 1) {
    pushBadge('REBOOT HERO', 'cyan');
  }
  if ((summary.dronesShotDown ?? 0) >= 1) {
    pushBadge('DRONE HUNTER', 'cyan');
  }
  if ((summary.trapsPlaced ?? 0) >= 1) {
    pushBadge('TRAP MASTER', 'emerald');
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
