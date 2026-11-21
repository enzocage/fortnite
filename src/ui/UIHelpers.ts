import { RARITY_COLORS, WORLD_HALF, WORLD_SIZE } from '../core';
import type { BiomeType, HUDState, Rarity, StormState } from '../types';

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

/**
 * Computes active contextual action hints for repair/slide/zipline states.
 */
export function getContextualHudHints(
  state: Pick<HUDState, 'canRepairBuild' | 'isSliding' | 'isZiplining'>,
): ContextualHintItem[] {
  const hints: ContextualHintItem[] = [];
  if (state.canRepairBuild) {
    hints.push({
      id: 'repair',
      key: 'F',
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
