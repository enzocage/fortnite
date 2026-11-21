import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, POIS, RARITY_ORDER, WEAPONS, WORLD_HALF } from '../../core';
import type { AmmoType, BuildPieceType, MaterialType, WeaponId } from '../../types';
import {
  formatCompassTicks,
  formatCountdown,
  formatSurvivalTime,
  getAmmoIconSvg,
  getBearingDeg,
  getBuildIconSvg,
  getCrownSvg,
  getHeadingFromYaw,
  getMaterialIconSvg,
  getRarityMeta,
  getShortestAngleDiffDeg,
  getSkullSvg,
  getStormEyeSvg,
  getWeaponSvg,
  loadStoredLobbyConfig,
  loadStoredSettings,
  mapNormToWorld,
  normalizeDegrees,
  worldToMapNorm,
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
      expect(wrapTicks[i].offsetDeg).toBeGreaterThan(wrapTicks[i - 1].offsetDeg);
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

  it('provides rarity metadata for all 5 tiers', () => {
    for (const rarity of RARITY_ORDER) {
      const meta = getRarityMeta(rarity);
      expect(meta.rarity).toBe(rarity);
      expect(meta.label).toBe(rarity.toUpperCase());
      expect(meta.accent).toMatch(/^#/);
    }
  });
});

describe('WeaponIcons & SVG assets', () => {
  it('returns valid distinct <svg> markup for all 14 WeaponIds', () => {
    const weaponIds = Object.keys(WEAPONS) as WeaponId[];
    expect(weaponIds).toHaveLength(14);

    const seen = new Set<string>();
    for (const id of weaponIds) {
      const svg = getWeaponSvg(id);
      expect(typeof svg).toBe('string');
      expect(svg.trim().startsWith('<svg')).toBe(true);
      expect(svg.includes('</svg>')).toBe(true);
      expect(seen.has(svg)).toBe(false);
      seen.add(svg);
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

describe('Storage safe defaults in Node environment', () => {
  it('loads default settings and lobby config safely without browser globals', () => {
    const settings = loadStoredSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);

    const lobby = loadStoredLobbyConfig();
    expect(lobby.botCount).toBeGreaterThan(0);
    expect(lobby.playerName.length).toBeGreaterThan(0);
  });
});
