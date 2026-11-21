import type { BuildPieceType, Vec3Like, WallDir } from '../types';
import { GRID_XZ, GRID_Y } from './Config';

export function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function lerpAngle(a: number, b: number, t: number): number {
  const diff = normalizeAngle(b - a);
  return a + diff * t;
}

export function dist2D(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.hypot(dx, dz);
}

export function dist3D(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise2D(x: number, z: number, seed = 1337): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const v00 = hash2D(ix, iz, seed);
  const v10 = hash2D(ix + 1, iz, seed);
  const v01 = hash2D(ix, iz + 1, seed);
  const v11 = hash2D(ix + 1, iz + 1, seed);

  const a = lerp(v00, v10, ux);
  const b = lerp(v01, v11, ux);
  return lerp(a, b, uz) * 2 - 1;
}

export function fbm2D(
  x: number,
  z: number,
  octaves = 4,
  lacunarity = 2.0,
  gain = 0.5,
  seed = 1337,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, z * freq, seed + i * 97);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function worldToGrid(x: number, y: number, z: number): {
  gx: number;
  gy: number;
  gz: number;
} {
  return {
    gx: Math.floor(x / GRID_XZ),
    gy: Math.floor(y / GRID_Y),
    gz: Math.floor(z / GRID_XZ),
  };
}

/**
 * Canonicalizes a wall placed on one of the 4 cell faces (0=North(-Z), 1=East(+X), 2=South(+Z), 3=West(-X))
 * into unique N or W edge coordinates so opposing cell edges never overlap.
 */
export function canonicalizeWall(
  gx: number,
  gy: number,
  gz: number,
  face: 0 | 1 | 2 | 3,
): { gx: number; gy: number; gz: number; dir: WallDir } {
  switch (face) {
    case 0:
      return { gx, gy, gz, dir: 'N' };
    case 1:
      return { gx: gx + 1, gy, gz, dir: 'W' };
    case 2:
      return { gx, gy, gz: gz + 1, dir: 'N' };
    case 3:
      return { gx, gy, gz, dir: 'W' };
  }
}

export function getCanonicalWallKey(
  gx: number,
  gy: number,
  gz: number,
  dir: WallDir,
): string {
  return `wall:${gx},${gy},${gz}:${dir}`;
}

export function getPieceKey(
  type: BuildPieceType,
  gx: number,
  gy: number,
  gz: number,
  dir: WallDir = 'N',
): string {
  if (type === 'wall') {
    return getCanonicalWallKey(gx, gy, gz, dir);
  }
  return `${type}:${gx},${gy},${gz}`;
}
