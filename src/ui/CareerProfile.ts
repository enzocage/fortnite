import { MAX_GOLD_BARS, STARTING_GOLD_BARS } from '../core';
import type { MatchSummary } from '../types';

export const MAX_CAREER_LEVEL = 100;
const CAREER_STORAGE_KEY = 'fortdrop_career_v1';

export interface CareerRankInfo {
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'UNREAL';
  color: string;
  badge: string;
}

export interface CareerLevelProgress {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpRequiredForNext: number;
  progressRatio: number;
  isMaxLevel: boolean;
}

export interface MatchXpBreakdown {
  survivalXp: number;
  elimXp: number;
  damageXp: number;
  placementXp: number;
  victoryBonusXp: number;
  bonusXp: number;
  totalXp: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface CareerStats {
  xp: number;
  level: number;
  wins: number;
  elims: number;
  matchesPlayed: number;
  damageDealt: number;
  bestPlacement: number | null;
  goldBars: number;
  hasVictoryCrown: boolean;
  crownWins: number;
  totalRevives: number;
  lastMatchXp?: MatchXpBreakdown;
}

let memoryFallbackCareer: CareerStats | null = null;

function clampGoldBars(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return STARTING_GOLD_BARS;
  }
  return Math.max(0, Math.min(MAX_GOLD_BARS, Math.round(value)));
}

function createDefaultCareerStats(): CareerStats {
  return {
    xp: 0,
    level: 1,
    wins: 0,
    elims: 0,
    matchesPlayed: 0,
    damageDealt: 0,
    bestPlacement: null,
    goldBars: STARTING_GOLD_BARS,
    hasVictoryCrown: false,
    crownWins: 0,
    totalRevives: 0,
  };
}

function isValidStorage(candidate: unknown): candidate is Storage {
  return Boolean(
    candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as Storage).getItem === 'function' &&
      typeof (candidate as Storage).setItem === 'function',
  );
}

function getSafeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && isValidStorage(window.localStorage)) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined') {
      // Inspect descriptor first so Node's native localStorage getter does not emit a warning
      const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      if (desc && 'value' in desc && isValidStorage(desc.value)) {
        return desc.value;
      }
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return null;
}

/**
 * XP required to advance from `level` to `level + 1` (for levels 1..99).
 */
export function xpForLevelStep(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_CAREER_LEVEL - 1, Math.floor(level)));
  return 450 + clamped * 50;
}

/**
 * Cumulative XP threshold needed to reach `level` (Level 1 = 0 XP).
 */
export function getTotalXpForLevel(level: number): number {
  const target = Math.max(1, Math.min(MAX_CAREER_LEVEL, Math.floor(level)));
  let total = 0;
  for (let lv = 1; lv < target; lv++) {
    total += xpForLevelStep(lv);
  }
  return total;
}

/**
 * Computes career level (1..100) from cumulative total XP.
 */
export function computeLevelFromXp(xp: number): number {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 1;
  let threshold = 0;
  while (level < MAX_CAREER_LEVEL) {
    const step = xpForLevelStep(level);
    if (safeXp < threshold + step) {
      break;
    }
    threshold += step;
    level++;
  }
  return level;
}

/**
 * Computes detailed XP progress within the current career level.
 */
export function computeCareerLevelProgress(xp: number): CareerLevelProgress {
  const totalXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const level = computeLevelFromXp(totalXp);
  const isMaxLevel = level >= MAX_CAREER_LEVEL;
  if (isMaxLevel) {
    return {
      level: MAX_CAREER_LEVEL,
      totalXp,
      xpIntoLevel: 0,
      xpRequiredForNext: 0,
      progressRatio: 1,
      isMaxLevel: true,
    };
  }
  const levelStartXp = getTotalXpForLevel(level);
  const xpRequiredForNext = xpForLevelStep(level);
  const xpIntoLevel = Math.max(0, totalXp - levelStartXp);
  const progressRatio = Math.max(0, Math.min(1, xpIntoLevel / xpRequiredForNext));
  return {
    level,
    totalXp,
    xpIntoLevel,
    xpRequiredForNext,
    progressRatio,
    isMaxLevel: false,
  };
}

/**
 * Computes deterministic match XP breakdown from a MatchSummary.
 */
export function computeMatchXpBreakdown(
  summary: MatchSummary,
  currentTotalXp = 0,
): MatchXpBreakdown {
  const survivalSec = Math.max(0, Number.isFinite(summary.survivalTimeSec) ? summary.survivalTimeSec : 0);
  const kills = Math.max(0, Number.isFinite(summary.kills) ? Math.floor(summary.kills) : 0);
  const damage = Math.max(0, Number.isFinite(summary.damageDealt) ? summary.damageDealt : 0);
  const totalPlayers = Math.max(2, Number.isFinite(summary.totalPlayers) ? Math.round(summary.totalPlayers) : 30);
  const placement = Math.max(1, Number.isFinite(summary.placement) ? Math.round(summary.placement) : totalPlayers);

  const survivalXp = Math.round(survivalSec * 1.5);
  const elimXp = kills * 125;
  const damageXp = Math.round(damage * 0.25);

  let placementXp: number;
  if (summary.victory || placement === 1) {
    placementXp = 350;
  } else if (placement <= 3) {
    placementXp = 220;
  } else if (placement <= 10) {
    placementXp = 120;
  } else {
    const ratio = 1 - Math.min(1, (placement - 1) / Math.max(1, totalPlayers - 1));
    placementXp = Math.max(25, Math.round(ratio * 100));
  }

  const victoryBonusXp = summary.victory ? 500 : 0;
  const bonusXp =
    typeof summary.bonusXp === 'number' && Number.isFinite(summary.bonusXp) && summary.bonusXp > 0
      ? Math.round(summary.bonusXp)
      : 0;
  const totalXp = survivalXp + elimXp + damageXp + placementXp + victoryBonusXp + bonusXp;

  const safePrevXp = Math.max(0, Number.isFinite(currentTotalXp) ? Math.floor(currentTotalXp) : 0);
  const previousLevel = computeLevelFromXp(safePrevXp);
  const newLevel = computeLevelFromXp(safePrevXp + totalXp);

  return {
    survivalXp,
    elimXp,
    damageXp,
    placementXp,
    victoryBonusXp,
    bonusXp,
    totalXp,
    previousLevel,
    newLevel,
    leveledUp: newLevel > previousLevel,
  };
}

function sanitizeCareerStats(raw: Partial<CareerStats> | null | undefined): CareerStats {
  const base = createDefaultCareerStats();
  if (!raw || typeof raw !== 'object') return base;
  const xp = typeof raw.xp === 'number' && Number.isFinite(raw.xp) && raw.xp > 0 ? Math.floor(raw.xp) : 0;
  const wins = typeof raw.wins === 'number' && Number.isFinite(raw.wins) && raw.wins > 0 ? Math.floor(raw.wins) : 0;
  const elims = typeof raw.elims === 'number' && Number.isFinite(raw.elims) && raw.elims > 0 ? Math.floor(raw.elims) : 0;
  const matchesPlayed =
    typeof raw.matchesPlayed === 'number' && Number.isFinite(raw.matchesPlayed) && raw.matchesPlayed > 0
      ? Math.floor(raw.matchesPlayed)
      : 0;
  const damageDealt =
    typeof raw.damageDealt === 'number' && Number.isFinite(raw.damageDealt) && raw.damageDealt > 0
      ? Math.floor(raw.damageDealt)
      : 0;
  const bestPlacement =
    typeof raw.bestPlacement === 'number' && Number.isFinite(raw.bestPlacement) && raw.bestPlacement >= 1
      ? Math.floor(raw.bestPlacement)
      : null;
  const goldBars = clampGoldBars(raw.goldBars);
  const hasVictoryCrown = raw.hasVictoryCrown === true;
  const crownWins =
    typeof raw.crownWins === 'number' && Number.isFinite(raw.crownWins) && raw.crownWins > 0
      ? Math.floor(raw.crownWins)
      : 0;
  const totalRevives =
    typeof raw.totalRevives === 'number' && Number.isFinite(raw.totalRevives) && raw.totalRevives > 0
      ? Math.floor(raw.totalRevives)
      : 0;

  return {
    xp,
    level: computeLevelFromXp(xp),
    wins,
    elims,
    matchesPlayed,
    damageDealt,
    bestPlacement,
    goldBars,
    hasVictoryCrown,
    crownWins,
    totalRevives,
    lastMatchXp: raw.lastMatchXp,
  };
}

function saveCareerStats(stats: CareerStats): void {
  const storage = getSafeStorage();
  if (!storage) {
    memoryFallbackCareer = { ...stats };
    return;
  }
  try {
    storage.setItem(CAREER_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    memoryFallbackCareer = { ...stats };
  }
}

/**
 * Loads persistent player career progression safely in both Browser and Node.
 */
export function loadCareerStats(): CareerStats {
  const storage = getSafeStorage();
  if (!storage) {
    return memoryFallbackCareer ? { ...memoryFallbackCareer } : createDefaultCareerStats();
  }
  try {
    const raw = storage.getItem(CAREER_STORAGE_KEY);
    if (!raw) return createDefaultCareerStats();
    const parsed = JSON.parse(raw) as Partial<CareerStats>;
    return sanitizeCareerStats(parsed);
  } catch {
    return createDefaultCareerStats();
  }
}

/**
 * Records a completed match into CareerStats, computes XP/level-up, and persists safely.
 */
export function recordMatchCareerStats(summary: MatchSummary): CareerStats {
  const prev = loadCareerStats();
  const breakdown = computeMatchXpBreakdown(summary, prev.xp);
  const nextXp = prev.xp + breakdown.totalXp;
  const nextLevel = computeLevelFromXp(nextXp);
  const safeKills = Math.max(0, Number.isFinite(summary.kills) ? Math.floor(summary.kills) : 0);
  const safeDamage = Math.max(0, Number.isFinite(summary.damageDealt) ? Math.round(summary.damageDealt) : 0);
  const safePlacement =
    typeof summary.placement === 'number' && Number.isFinite(summary.placement) && summary.placement >= 1
      ? Math.round(summary.placement)
      : null;

  const won = Boolean(summary.victory);
  const isCrownedWin =
    won &&
    (summary.crownedVictory === true ||
      (summary.crownedVictory === undefined && prev.hasVictoryCrown));
  const safeRevives =
    typeof summary.revives === 'number' && Number.isFinite(summary.revives) && summary.revives > 0
      ? Math.floor(summary.revives)
      : 0;

  const updated: CareerStats = {
    xp: nextXp,
    level: nextLevel,
    wins: prev.wins + (won ? 1 : 0),
    elims: prev.elims + safeKills,
    matchesPlayed: prev.matchesPlayed + 1,
    damageDealt: prev.damageDealt + safeDamage,
    bestPlacement:
      safePlacement === null
        ? prev.bestPlacement
        : prev.bestPlacement === null
          ? safePlacement
          : Math.min(prev.bestPlacement, safePlacement),
    goldBars: clampGoldBars(prev.goldBars),
    hasVictoryCrown: won,
    crownWins: prev.crownWins + (isCrownedWin ? 1 : 0),
    totalRevives: prev.totalRevives + safeRevives,
    lastMatchXp: {
      ...breakdown,
      newLevel: nextLevel,
      leveledUp: nextLevel > prev.level,
    },
  };

  saveCareerStats(updated);
  return updated;
}

/**
 * Updates active Victory Crown carry state cleanly.
 */
export function updateVictoryCrown(hasVictoryCrown: boolean): CareerStats {
  const prev = loadCareerStats();
  const updated: CareerStats = {
    ...prev,
    hasVictoryCrown: Boolean(hasVictoryCrown),
  };
  saveCareerStats(updated);
  return updated;
}

/**
 * Updates persisted Gold Bars vault balance clamped to [0, MAX_GOLD_BARS].
 */
export function updateGoldBars(nextGold: number): CareerStats {
  const prev = loadCareerStats();
  const clamped = Number.isFinite(nextGold)
    ? Math.max(0, Math.min(MAX_GOLD_BARS, Math.round(nextGold)))
    : clampGoldBars(prev.goldBars);
  const updated: CareerStats = {
    ...prev,
    goldBars: clamped,
  };
  saveCareerStats(updated);
  return updated;
}

/**
 * Computes competitive career rank tier from career level and total Victory Royales.
 */
export function computeCareerRank(level: number, wins: number): CareerRankInfo {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const safeWins = Number.isFinite(wins) ? Math.max(0, Math.floor(wins)) : 0;
  const score = safeLevel + safeWins * 4;

  if (score >= 70) {
    return { tier: 'UNREAL', color: '#f43f5e', badge: 'UNR' };
  }
  if (score >= 45) {
    return { tier: 'DIAMOND', color: '#60a5fa', badge: 'DIA' };
  }
  if (score >= 28) {
    return { tier: 'PLATINUM', color: '#22d3ee', badge: 'PLT' };
  }
  if (score >= 15) {
    return { tier: 'GOLD', color: '#ffd000', badge: 'GLD' };
  }
  if (score >= 6) {
    return { tier: 'SILVER', color: '#cbd5e1', badge: 'SLV' };
  }
  return { tier: 'BRONZE', color: '#cd7f32', badge: 'BRZ' };
}

/**
 * Clears stored career progression (useful for tests or profile resets).
 */
export function resetCareerStats(): void {
  memoryFallbackCareer = null;
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.removeItem(CAREER_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}
