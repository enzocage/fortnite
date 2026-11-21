import { RARITY_COLORS, WORLD_HALF, WORLD_SIZE } from '../core';
import type { Rarity } from '../types';

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
}

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
