import type {
  BuildPiece,
  ColliderBox,
  HarvestableProp,
  MaterialType,
  TerrainQuery,
  Vec3Like,
} from '../types';
import {
  GRID_XZ,
  GRID_Y,
  STEP_HEIGHT,
  clamp,
  worldToGrid,
} from '../core';
import type { MovementResult, RaycastOptions, RaycastResult } from './GameplayTypes';

export const ROOF_HEIGHT = GRID_Y * 0.75;
const WALL_HALF_THICK = 0.11;
const FLOOR_THICKNESS = 0.18;
const RAMP_SLAB_CLEARANCE = 0.22;
const SPATIAL_CELL_SIZE = 16;

interface SimpleBox {
  id: string;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  material?: MaterialType;
}

/**
 * Computes the height above `gy * GRID_Y` on a sloped ramp in cell-local coordinates `localX, localZ in [0, GRID_XZ]`.
 * Rotation convention matches canonicalizeWall: 0=North(-Z), 1=East(+X), 2=South(+Z), 3=West(-X).
 */
export function getRampHeightAtLocal(
  localX: number,
  localZ: number,
  rotation: 0 | 1 | 2 | 3,
): number {
  const u = clamp(localX / GRID_XZ, 0, 1);
  const v = clamp(localZ / GRID_XZ, 0, 1);
  let t: number;
  switch (rotation) {
    case 0:
      t = 1 - v;
      break;
    case 1:
      t = u;
      break;
    case 2:
      t = v;
      break;
    case 3:
      t = 1 - u;
      break;
  }
  return t * GRID_Y;
}

/**
 * Computes the height above `gy * GRID_Y` on a 4-sided pyramid roof in cell-local coordinates `localX, localZ in [0, GRID_XZ]`.
 */
export function getRoofHeightAtLocal(localX: number, localZ: number): number {
  const u = clamp(localX / GRID_XZ, 0, 1);
  const v = clamp(localZ / GRID_XZ, 0, 1);
  const du = Math.abs(u - 0.5) * 2;
  const dv = Math.abs(v - 0.5) * 2;
  const edgeFactor = du > dv ? du : dv;
  return ROOF_HEIGHT * (1 - edgeFactor);
}

function isTileSolid(editMask: number, row: number, col: number): boolean {
  const bit = row * 3 + col;
  return (editMask & (1 << bit)) === 0;
}

function toUnrotatedRampUV(
  localX: number,
  localZ: number,
  rotation: 0 | 1 | 2 | 3,
): { ux: number; uz: number } {
  const half = GRID_XZ * 0.5;
  const cx = localX - half;
  const cz = localZ - half;
  switch (rotation) {
    case 0:
      return { ux: cx + half, uz: cz + half };
    case 1:
      return { ux: cz + half, uz: -cx + half };
    case 2:
      return { ux: -cx + half, uz: -cz + half };
    case 3:
      return { ux: -cz + half, uz: cx + half };
  }
}

function hashCell(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export class CollisionSystem {
  private terrain: TerrainQuery;
  private staticColliders: ColliderBox[] = [];
  private propColliders: ColliderBox[] = [];
  private staticGrid = new Map<string, ColliderBox[]>();
  private propGrid = new Map<string, ColliderBox[]>();
  private buildPiecesProvider: (() => BuildPiece[]) | null = null;
  private buildGrid = new Map<string, BuildPiece[]>();
  private lastBuildSig = '';

  constructor(terrain: TerrainQuery) {
    this.terrain = terrain;
  }

  setStaticColliders(boxes: ColliderBox[]): void {
    this.staticColliders = boxes;
    this.staticGrid = this.buildSpatialGrid(boxes);
  }

  setPropColliders(boxes: ColliderBox[]): void {
    this.propColliders = boxes;
    this.propGrid = this.buildSpatialGrid(boxes);
  }

  setBuildPiecesProvider(fn: () => BuildPiece[]): void {
    this.buildPiecesProvider = fn;
    this.lastBuildSig = '';
  }

  private buildSpatialGrid(boxes: ColliderBox[]): Map<string, ColliderBox[]> {
    const grid = new Map<string, ColliderBox[]>();
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const minCx = Math.floor(b.minX / SPATIAL_CELL_SIZE);
      const maxCx = Math.floor(b.maxX / SPATIAL_CELL_SIZE);
      const minCz = Math.floor(b.minZ / SPATIAL_CELL_SIZE);
      const maxCz = Math.floor(b.maxZ / SPATIAL_CELL_SIZE);
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = hashCell(cx, cz);
          let arr = grid.get(key);
          if (!arr) {
            arr = [];
            grid.set(key, arr);
          }
          arr.push(b);
        }
      }
    }
    return grid;
  }

  private queryGridBoxes(
    x: number,
    z: number,
    pad: number,
    out: ColliderBox[],
    seen: Set<string>,
  ): void {
    const minCx = Math.floor((x - pad) / SPATIAL_CELL_SIZE);
    const maxCx = Math.floor((x + pad) / SPATIAL_CELL_SIZE);
    const minCz = Math.floor((z - pad) / SPATIAL_CELL_SIZE);
    const maxCz = Math.floor((z + pad) / SPATIAL_CELL_SIZE);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = hashCell(cx, cz);
        const sArr = this.staticGrid.get(key);
        if (sArr) {
          for (let i = 0; i < sArr.length; i++) {
            const b = sArr[i];
            if (!seen.has(b.id)) {
              seen.add(b.id);
              out.push(b);
            }
          }
        }
        const pArr = this.propGrid.get(key);
        if (pArr) {
          for (let i = 0; i < pArr.length; i++) {
            const b = pArr[i];
            if (!seen.has(b.id)) {
              seen.add(b.id);
              out.push(b);
            }
          }
        }
      }
    }
  }

  private getBuildPieces(): BuildPiece[] {
    if (!this.buildPiecesProvider) return [];
    const pieces = this.buildPiecesProvider();
    const lastId = pieces.length > 0 ? pieces[pieces.length - 1].id : '';
    const sig = `${pieces.length}:${lastId}`;
    if (sig !== this.lastBuildSig) {
      this.lastBuildSig = sig;
      this.buildGrid.clear();
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        const minX = p.gx * GRID_XZ - WALL_HALF_THICK;
        const maxX = (p.gx + 1) * GRID_XZ + WALL_HALF_THICK;
        const minZ = p.gz * GRID_XZ - WALL_HALF_THICK;
        const maxZ = (p.gz + 1) * GRID_XZ + WALL_HALF_THICK;
        const minCx = Math.floor(minX / SPATIAL_CELL_SIZE);
        const maxCx = Math.floor(maxX / SPATIAL_CELL_SIZE);
        const minCz = Math.floor(minZ / SPATIAL_CELL_SIZE);
        const maxCz = Math.floor(maxZ / SPATIAL_CELL_SIZE);
        for (let cx = minCx; cx <= maxCx; cx++) {
          for (let cz = minCz; cz <= maxCz; cz++) {
            const key = hashCell(cx, cz);
            let arr = this.buildGrid.get(key);
            if (!arr) {
              arr = [];
              this.buildGrid.set(key, arr);
            }
            arr.push(p);
          }
        }
      }
    }
    return pieces;
  }

  private queryNearbyBuildPieces(x: number, z: number, pad: number): BuildPiece[] {
    const pieces = this.getBuildPieces();
    if (pieces.length === 0) return [];
    if (pieces.length <= 24) return pieces;

    const minCx = Math.floor((x - pad) / SPATIAL_CELL_SIZE);
    const maxCx = Math.floor((x + pad) / SPATIAL_CELL_SIZE);
    const minCz = Math.floor((z - pad) / SPATIAL_CELL_SIZE);
    const maxCz = Math.floor((z + pad) / SPATIAL_CELL_SIZE);
    const result: BuildPiece[] = [];
    const seen = new Set<string>();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const arr = this.buildGrid.get(hashCell(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          if (!seen.has(p.id)) {
            seen.add(p.id);
            result.push(p);
          }
        }
      }
    }
    return result;
  }

  private collectBuildAABBs(pieces: BuildPiece[], out: SimpleBox[]): void {
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.hp <= 0) continue;
      const baseX = p.gx * GRID_XZ;
      const baseY = p.gy * GRID_Y;
      const baseZ = p.gz * GRID_XZ;

      if (p.type === 'wall') {
        if (p.editMask === 0) {
          if (p.dir === 'N') {
            out.push({
              id: p.id,
              minX: baseX,
              maxX: baseX + GRID_XZ,
              minY: baseY,
              maxY: baseY + GRID_Y,
              minZ: baseZ - WALL_HALF_THICK,
              maxZ: baseZ + WALL_HALF_THICK,
              material: p.material,
            });
          } else {
            out.push({
              id: p.id,
              minX: baseX - WALL_HALF_THICK,
              maxX: baseX + WALL_HALF_THICK,
              minY: baseY,
              maxY: baseY + GRID_Y,
              minZ: baseZ,
              maxZ: baseZ + GRID_XZ,
              material: p.material,
            });
          }
        } else {
          const tileXZ = GRID_XZ / 3;
          const tileY = GRID_Y / 3;
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              if (!isTileSolid(p.editMask, row, col)) continue;
              const yMin = baseY + (2 - row) * tileY;
              const yMax = baseY + (3 - row) * tileY;
              if (p.dir === 'N') {
                out.push({
                  id: `${p.id}_${row}_${col}`,
                  minX: baseX + col * tileXZ,
                  maxX: baseX + (col + 1) * tileXZ,
                  minY: yMin,
                  maxY: yMax,
                  minZ: baseZ - WALL_HALF_THICK,
                  maxZ: baseZ + WALL_HALF_THICK,
                  material: p.material,
                });
              } else {
                out.push({
                  id: `${p.id}_${row}_${col}`,
                  minX: baseX - WALL_HALF_THICK,
                  maxX: baseX + WALL_HALF_THICK,
                  minY: yMin,
                  maxY: yMax,
                  minZ: baseZ + col * tileXZ,
                  maxZ: baseZ + (col + 1) * tileXZ,
                  material: p.material,
                });
              }
            }
          }
        }
      } else if (p.type === 'floor') {
        if (p.editMask === 0) {
          out.push({
            id: p.id,
            minX: baseX,
            maxX: baseX + GRID_XZ,
            minY: baseY - FLOOR_THICKNESS,
            maxY: baseY,
            minZ: baseZ,
            maxZ: baseZ + GRID_XZ,
            material: p.material,
          });
        } else {
          const tileXZ = GRID_XZ / 3;
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              if (!isTileSolid(p.editMask, row, col)) continue;
              out.push({
                id: `${p.id}_${row}_${col}`,
                minX: baseX + col * tileXZ,
                maxX: baseX + (col + 1) * tileXZ,
                minY: baseY - FLOOR_THICKNESS,
                maxY: baseY,
                minZ: baseZ + row * tileXZ,
                maxZ: baseZ + (row + 1) * tileXZ,
                material: p.material,
              });
            }
          }
        }
      }
    }
  }

  private sampleBuildSlopeAt(
    piece: BuildPiece,
    x: number,
    z: number,
  ): number | null {
    if (piece.hp <= 0) return null;
    const baseX = piece.gx * GRID_XZ;
    const baseZ = piece.gz * GRID_XZ;
    const localX = x - baseX;
    const localZ = z - baseZ;
    if (localX < 0 || localX > GRID_XZ || localZ < 0 || localZ > GRID_XZ) {
      return null;
    }

    const baseY = piece.gy * GRID_Y;
    if (piece.type === 'ramp') {
      if (piece.editMask !== 0) {
        const { ux, uz } = toUnrotatedRampUV(localX, localZ, piece.rotation);
        const col = clamp(Math.floor(ux / (GRID_XZ / 3)), 0, 2);
        const row = clamp(Math.floor(uz / (GRID_XZ / 3)), 0, 2);
        if (!isTileSolid(piece.editMask, row, col)) return null;
      }
      return baseY + getRampHeightAtLocal(localX, localZ, piece.rotation);
    }

    if (piece.type === 'roof') {
      if (piece.editMask !== 0) {
        const col = clamp(Math.floor(localX / (GRID_XZ / 3)), 0, 2);
        const row = clamp(Math.floor(localZ / (GRID_XZ / 3)), 0, 2);
        if (!isTileSolid(piece.editMask, row, col)) return null;
      }
      return baseY + getRoofHeightAtLocal(localX, localZ);
    }

    return null;
  }

  getFloorHeightAt(
    x: number,
    z: number,
    currentFootY: number,
    maxStepUp = STEP_HEIGHT,
  ): number {
    return this.sampleSupportHeight(x, z, currentFootY, maxStepUp, null).height;
  }

  private sampleSupportHeight(
    x: number,
    z: number,
    currentFootY: number,
    maxStepUp: number,
    nearbyColliders: ColliderBox[] | null,
    nearbyPieces?: BuildPiece[],
  ): { height: number; material: MaterialType | 'grass' | 'stone' } {
    let bestY = this.terrain.getHeightAt(x, z);
    let bestMat: MaterialType | 'grass' | 'stone' =
      this.terrain.getBiomeAt(x, z) === 'highland' ? 'stone' : 'grass';

    let boxes = nearbyColliders;
    if (!boxes) {
      boxes = [];
      const seen = new Set<string>();
      this.queryGridBoxes(x, z, 1.0, boxes, seen);
    }

    const maxAllowedY = currentFootY + maxStepUp;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        if (b.maxY <= maxAllowedY && b.maxY > bestY) {
          bestY = b.maxY;
          bestMat = b.material ?? 'stone';
        }
      }
    }

    const pieces = nearbyPieces ?? this.queryNearbyBuildPieces(x, z, GRID_XZ);
    const buildBoxes: SimpleBox[] = [];
    this.collectBuildAABBs(pieces, buildBoxes);

    for (let i = 0; i < buildBoxes.length; i++) {
      const b = buildBoxes[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        if (b.maxY <= maxAllowedY && b.maxY >= bestY) {
          bestY = b.maxY;
          bestMat = b.material ?? 'wood';
        }
      }
    }

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.type !== 'ramp' && p.type !== 'roof') continue;
      const slopeY = this.sampleBuildSlopeAt(p, x, z);
      if (slopeY !== null && slopeY <= maxAllowedY && slopeY > bestY) {
        bestY = slopeY;
        bestMat = p.material;
      }
    }

    return { height: bestY, material: bestMat };
  }

  private sampleFootprintSupport(
    x: number,
    z: number,
    radius: number,
    currentFootY: number,
    maxStepUp: number,
    nearbyColliders: ColliderBox[],
    nearbyPieces: BuildPiece[],
  ): { height: number; material: MaterialType | 'grass' | 'stone' } {
    const center = this.sampleSupportHeight(
      x,
      z,
      currentFootY,
      maxStepUp,
      nearbyColliders,
      nearbyPieces,
    );
    let bestY = center.height;
    let bestMat = center.material;

    const rim = radius * 0.65;
    const offsets = [
      [rim, 0],
      [-rim, 0],
      [0, rim],
      [0, -rim],
    ];

    const maxAllowedY = currentFootY + maxStepUp;
    const buildBoxes: SimpleBox[] = [];
    this.collectBuildAABBs(nearbyPieces, buildBoxes);

    for (let k = 0; k < 4; k++) {
      const sx = x + offsets[k][0];
      const sz = z + offsets[k][1];

      for (let i = 0; i < nearbyColliders.length; i++) {
        const b = nearbyColliders[i];
        if (sx >= b.minX && sx <= b.maxX && sz >= b.minZ && sz <= b.maxZ) {
          if (b.maxY <= maxAllowedY && b.maxY > bestY) {
            bestY = b.maxY;
            bestMat = b.material ?? 'stone';
          }
        }
      }

      for (let i = 0; i < buildBoxes.length; i++) {
        const b = buildBoxes[i];
        if (sx >= b.minX && sx <= b.maxX && sz >= b.minZ && sz <= b.maxZ) {
          if (b.maxY <= maxAllowedY && b.maxY >= bestY) {
            bestY = b.maxY;
            bestMat = b.material ?? 'wood';
          }
        }
      }

      // Check terrain height at rim only slightly if standing on steep cliff edge
      const ty = this.terrain.getHeightAt(sx, sz);
      if (ty <= maxAllowedY && ty > bestY) {
        bestY = ty;
        bestMat = this.terrain.getBiomeAt(sx, sz) === 'highland' ? 'stone' : 'grass';
      }
    }

    return { height: bestY, material: bestMat };
  }

  private hasHeadroomAt(
    x: number,
    footY: number,
    z: number,
    radius: number,
    height: number,
    boxes: SimpleBox[],
  ): boolean {
    const minY = footY + 0.05;
    const maxY = footY + height - 0.02;
    const r = radius * 0.9;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.maxY <= minY || b.minY >= maxY) continue;
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) {
        return false;
      }
    }
    return true;
  }

  resolveCharacterMovement(
    pos: Vec3Like,
    vel: Vec3Like,
    radius: number,
    height: number,
    dt: number,
  ): MovementResult {
    const totalDt = clamp(dt, 0, 0.1);
    let px = pos.x;
    let py = pos.y;
    let pz = pos.z;
    let vx = vel.x;
    let vy = vel.y;
    let vz = vel.z;

    if (totalDt <= 0) {
      const sup = this.sampleSupportHeight(px, pz, py, STEP_HEIGHT, null);
      return {
        position: { x: px, y: py, z: pz },
        velocity: { x: vx, y: vy, z: vz },
        grounded: py <= sup.height + 0.03,
        groundMaterial: sup.material,
      };
    }

    const steps = Math.max(1, Math.ceil(totalDt / 0.02));
    const subDt = totalDt / steps;

    const nearbyColliders: ColliderBox[] = [];
    const seen = new Set<string>();
    this.queryGridBoxes(px, pz, Math.hypot(vx, vz) * totalDt + radius + 3.0, nearbyColliders, seen);

    const nearbyPieces = this.queryNearbyBuildPieces(
      px,
      pz,
      Math.hypot(vx, vz) * totalDt + GRID_XZ + radius + 2.0,
    );

    const allBoxes: SimpleBox[] = [];
    for (let i = 0; i < nearbyColliders.length; i++) {
      const b = nearbyColliders[i];
      allBoxes.push(b);
    }
    this.collectBuildAABBs(nearbyPieces, allBoxes);

    let grounded = false;
    let groundMaterial: MaterialType | 'grass' | 'stone' = 'grass';

    for (let s = 0; s < steps; s++) {
      const prevSupport = this.sampleFootprintSupport(
        px,
        pz,
        radius,
        py,
        STEP_HEIGHT,
        nearbyColliders,
        nearbyPieces,
      );
      const wasGrounded = py <= prevSupport.height + 0.05 && vy <= 0.1;

      const prevY = py;
      px += vx * subDt;
      pz += vz * subDt;

      let steppedUpY = py;

      // 2 iterations of XZ cylinder vs AABB push-out with STEP_HEIGHT support
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < allBoxes.length; i++) {
          const b = allBoxes[i];
          if (b.maxY <= steppedUpY + 0.03 || b.minY >= steppedUpY + height - 0.03) {
            continue;
          }

          const cx = clamp(px, b.minX, b.maxX);
          const cz = clamp(pz, b.minZ, b.maxZ);
          const dx = px - cx;
          const dz = pz - cz;
          const distSq = dx * dx + dz * dz;

          if (distSq >= radius * radius) continue;

          // Check if step-up is possible
          if (b.maxY <= steppedUpY + STEP_HEIGHT) {
            if (this.hasHeadroomAt(px, b.maxY, pz, radius, height, allBoxes)) {
              if (b.maxY > steppedUpY) {
                steppedUpY = b.maxY;
              }
              continue;
            }
          }

          // Push out in XZ
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const nz = dz / dist;
            const push = radius - dist;
            px += nx * push;
            pz += nz * push;
            const vn = vx * nx + vz * nz;
            if (vn < 0) {
              vx -= vn * nx;
              vz -= vn * nz;
            }
          } else {
            // Center is inside box: push out toward nearest face
            const left = Math.abs(px - b.minX);
            const right = Math.abs(b.maxX - px);
            const front = Math.abs(pz - b.minZ);
            const back = Math.abs(b.maxZ - pz);
            const minPen = Math.min(left, right, front, back);
            if (minPen === left) {
              px = b.minX - radius;
              if (vx > 0) vx = 0;
            } else if (minPen === right) {
              px = b.maxX + radius;
              if (vx < 0) vx = 0;
            } else if (minPen === front) {
              pz = b.minZ - radius;
              if (vz > 0) vz = 0;
            } else {
              pz = b.maxZ + radius;
              if (vz < 0) vz = 0;
            }
          }
        }

        // Handle sloped ramp / roof underside & side wall blocking
        for (let i = 0; i < nearbyPieces.length; i++) {
          const p = nearbyPieces[i];
          if (p.hp <= 0 || (p.type !== 'ramp' && p.type !== 'roof')) continue;
          const baseX = p.gx * GRID_XZ;
          const baseZ = p.gz * GRID_XZ;
          if (
            px + radius <= baseX ||
            px - radius >= baseX + GRID_XZ ||
            pz + radius <= baseZ ||
            pz - radius >= baseZ + GRID_XZ
          ) {
            continue;
          }

          const clampedX = clamp(px, baseX + 0.001, baseX + GRID_XZ - 0.001);
          const clampedZ = clamp(pz, baseZ + 0.001, baseZ + GRID_XZ - 0.001);
          const slopeY = this.sampleBuildSlopeAt(p, clampedX, clampedZ);
          if (slopeY === null) continue;

          // If player is below the ramp/roof and doesn't have standing clearance underneath
          if (
            steppedUpY < slopeY - STEP_HEIGHT - 0.04 &&
            steppedUpY + height > slopeY - RAMP_SLAB_CLEARANCE
          ) {
            // Push away from the ramp/roof cell or toward high side
            const dxMin = Math.abs(px - baseX);
            const dxMax = Math.abs(baseX + GRID_XZ - px);
            const dzMin = Math.abs(pz - baseZ);
            const dzMax = Math.abs(baseZ + GRID_XZ - pz);

            // Push toward nearest outside edge
            const minEdge = Math.min(dxMin, dxMax, dzMin, dzMax);
            if (minEdge === dxMin) {
              px = baseX - radius;
              if (vx > 0) vx = 0;
            } else if (minEdge === dxMax) {
              px = baseX + GRID_XZ + radius;
              if (vx < 0) vx = 0;
            } else if (minEdge === dzMin) {
              pz = baseZ - radius;
              if (vz > 0) vz = 0;
            } else {
              pz = baseZ + GRID_XZ + radius;
              if (vz < 0) vz = 0;
            }
          }
        }
      }

      if (steppedUpY > py) {
        py = steppedUpY;
      }

      // Vertical movement
      let nextY = py + vy * subDt;

      // Ceiling collision when moving upward
      if (vy > 0) {
        for (let i = 0; i < allBoxes.length; i++) {
          const b = allBoxes[i];
          const cx = clamp(px, b.minX, b.maxX);
          const cz = clamp(pz, b.minZ, b.maxZ);
          const dx = px - cx;
          const dz = pz - cz;
          if (dx * dx + dz * dz >= radius * radius * 0.85) continue;
          if (b.minY >= prevY + height - 0.12 && b.minY <= nextY + height) {
            nextY = Math.min(nextY, b.minY - height);
            vy = 0;
          }
        }
        // Check ramp/roof ceiling underside
        for (let i = 0; i < nearbyPieces.length; i++) {
          const p = nearbyPieces[i];
          if (p.hp <= 0 || (p.type !== 'ramp' && p.type !== 'roof')) continue;
          const slopeY = this.sampleBuildSlopeAt(p, px, pz);
          if (slopeY === null) continue;
          const underY = slopeY - RAMP_SLAB_CLEARANCE;
          if (underY >= prevY + height - 0.15 && underY <= nextY + height) {
            nextY = Math.min(nextY, underY - height);
            vy = 0;
          }
        }
      }

      const support = this.sampleFootprintSupport(
        px,
        pz,
        radius,
        py,
        STEP_HEIGHT,
        nearbyColliders,
        nearbyPieces,
      );

      if (vy <= 0 && nextY <= support.height + 0.02) {
        nextY = support.height;
        vy = 0;
        grounded = true;
        groundMaterial = support.material;
      } else if (
        wasGrounded &&
        vy <= 0 &&
        support.height >= nextY - 0.32 &&
        support.height <= py + STEP_HEIGHT
      ) {
        // Snap smoothly when walking down slopes or stairs
        nextY = support.height;
        vy = 0;
        grounded = true;
        groundMaterial = support.material;
      } else {
        grounded = false;
        groundMaterial = support.material;
      }

      py = nextY;
    }

    return {
      position: { x: px, y: py, z: pz },
      velocity: { x: vx, y: vy, z: vz },
      grounded,
      groundMaterial,
    };
  }

  raycastWorld(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
    options?: RaycastOptions,
  ): RaycastResult {
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-8 || maxDist <= 0) {
      return {
        hit: false,
        distance: maxDist,
        point: {
          x: origin.x,
          y: origin.y,
          z: origin.z,
        },
        normal: { x: 0, y: 1, z: 0 },
        targetType: 'none',
      };
    }

    const dx = dir.x / len;
    const dy = dir.y / len;
    const dz = dir.z / len;

    const ignoreSet =
      options?.ignoreBoxes && options.ignoreBoxes.length > 0
        ? new Set(options.ignoreBoxes)
        : null;
    const ignoreBuildSet =
      options?.ignoreBuildPieceIds && options.ignoreBuildPieceIds.length > 0
        ? new Set(options.ignoreBuildPieceIds)
        : null;

    let bestDist = maxDist;
    let bestHit = false;
    let bestNx = 0;
    let bestNy = 1;
    let bestNz = 0;
    let bestType: RaycastResult['targetType'] = 'none';
    let bestId: string | undefined;
    let bestMaterial: MaterialType | undefined;

    const invDx = Math.abs(dx) > 1e-9 ? 1 / dx : 1e9;
    const invDy = Math.abs(dy) > 1e-9 ? 1 / dy : 1e9;
    const invDz = Math.abs(dz) > 1e-9 ? 1 / dz : 1e9;

    const testAABB = (
      minX: number,
      minY: number,
      minZ: number,
      maxX: number,
      maxY: number,
      maxZ: number,
      targetType: 'static' | 'prop' | 'build',
      id: string,
      material?: MaterialType,
    ) => {
      const tx1 = (minX - origin.x) * invDx;
      const tx2 = (maxX - origin.x) * invDx;
      let tmin = Math.min(tx1, tx2);
      let tmax = Math.max(tx1, tx2);
      let nx = tx1 < tx2 ? -1 : 1;
      let ny = 0;
      let nz = 0;

      const ty1 = (minY - origin.y) * invDy;
      const ty2 = (maxY - origin.y) * invDy;
      const tyMin = Math.min(ty1, ty2);
      const tyMax = Math.max(ty1, ty2);
      if (tyMin > tmin) {
        tmin = tyMin;
        nx = 0;
        ny = ty1 < ty2 ? -1 : 1;
        nz = 0;
      }
      tmax = Math.min(tmax, tyMax);

      const tz1 = (minZ - origin.z) * invDz;
      const tz2 = (maxZ - origin.z) * invDz;
      const tzMin = Math.min(tz1, tz2);
      const tzMax = Math.max(tz1, tz2);
      if (tzMin > tmin) {
        tmin = tzMin;
        nx = 0;
        ny = 0;
        nz = tz1 < tz2 ? -1 : 1;
      }
      tmax = Math.min(tmax, tzMax);

      if (tmax >= Math.max(0, tmin) && tmin >= 0 && tmin < bestDist) {
        bestDist = tmin;
        bestHit = true;
        bestNx = nx;
        bestNy = ny;
        bestNz = nz;
        bestType = targetType;
        bestId = id;
        bestMaterial = material;
      }
    };

    const testTriangle = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      cx: number,
      cy: number,
      cz: number,
      id: string,
      material: MaterialType,
    ) => {
      const e1x = bx - ax;
      const e1y = by - ay;
      const e1z = bz - az;
      const e2x = cx - ax;
      const e2y = cy - ay;
      const e2z = cz - az;

      // pvec = dir x e2
      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;

      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-7) return;
      const invDet = 1 / det;

      const tx = origin.x - ax;
      const ty = origin.y - ay;
      const tz = origin.z - az;

      const u = (tx * px + ty * py + tz * pz) * invDet;
      if (u < 0 || u > 1) return;

      // qvec = tvec x e1
      const qx = ty * e1z - tz * e1y;
      const qy = tz * e1x - tx * e1z;
      const qz = tx * e1y - ty * e1x;

      const v = (dx * qx + dy * qy + dz * qz) * invDet;
      if (v < 0 || u + v > 1) return;

      const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
      if (t >= 0 && t < bestDist) {
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;
        if (nx * dx + ny * dy + nz * dz > 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        bestDist = t;
        bestHit = true;
        bestNx = nx;
        bestNy = ny;
        bestNz = nz;
        bestType = 'build';
        bestId = id;
        bestMaterial = material;
      }
    };

    // 1. Static colliders
    for (let i = 0; i < this.staticColliders.length; i++) {
      const b = this.staticColliders[i];
      if (ignoreSet && ignoreSet.has(b.id)) continue;
      testAABB(
        b.minX,
        b.minY,
        b.minZ,
        b.maxX,
        b.maxY,
        b.maxZ,
        'static',
        b.id,
        b.material,
      );
    }

    // 2. Props
    if (options?.checkProps !== false) {
      if (options?.props) {
        const props = options.props;
        for (let i = 0; i < props.length; i++) {
          const prop = props[i];
          if (prop.destroyed) continue;
          if (ignoreSet && ignoreSet.has(prop.id)) continue;
          const r = Math.max(0.25, prop.radius);
          testAABB(
            prop.x - r,
            prop.y,
            prop.z - r,
            prop.x + r,
            prop.y + prop.height,
            prop.z + r,
            'prop',
            prop.id,
            prop.material,
          );
        }
      } else {
        for (let i = 0; i < this.propColliders.length; i++) {
          const b = this.propColliders[i];
          if (ignoreSet && ignoreSet.has(b.id)) continue;
          testAABB(
            b.minX,
            b.minY,
            b.minZ,
            b.maxX,
            b.maxY,
            b.maxZ,
            'prop',
            b.id,
            b.material,
          );
        }
      }
    }

    // 3. BuildPieces
    if (options?.checkBuilds !== false) {
      const pieces = this.getBuildPieces();
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        if (p.hp <= 0) continue;
        if (ignoreBuildSet && ignoreBuildSet.has(p.id)) continue;

        const baseX = p.gx * GRID_XZ;
        const baseY = p.gy * GRID_Y;
        const baseZ = p.gz * GRID_XZ;

        if (p.type === 'wall' || p.type === 'floor') {
          const singlePieceBoxes: SimpleBox[] = [];
          this.collectBuildAABBs([p], singlePieceBoxes);
          for (let j = 0; j < singlePieceBoxes.length; j++) {
            const b = singlePieceBoxes[j];
            testAABB(
              b.minX,
              b.minY,
              b.minZ,
              b.maxX,
              b.maxY,
              b.maxZ,
              'build',
              p.id,
              p.material,
            );
          }
        } else if (p.type === 'ramp') {
          if (p.editMask === 0) {
            const h00 = baseY + getRampHeightAtLocal(0, 0, p.rotation);
            const h10 = baseY + getRampHeightAtLocal(GRID_XZ, 0, p.rotation);
            const h01 = baseY + getRampHeightAtLocal(0, GRID_XZ, p.rotation);
            const h11 = baseY + getRampHeightAtLocal(GRID_XZ, GRID_XZ, p.rotation);
            testTriangle(
              baseX,
              h00,
              baseZ,
              baseX + GRID_XZ,
              h10,
              baseZ,
              baseX + GRID_XZ,
              h11,
              baseZ + GRID_XZ,
              p.id,
              p.material,
            );
            testTriangle(
              baseX,
              h00,
              baseZ,
              baseX + GRID_XZ,
              h11,
              baseZ + GRID_XZ,
              baseX,
              h01,
              baseZ + GRID_XZ,
              p.id,
              p.material,
            );
          } else {
            const tile = GRID_XZ / 3;
            for (let row = 0; row < 3; row++) {
              for (let col = 0; col < 3; col++) {
                const lx = (col + 0.5) * tile;
                const lz = (row + 0.5) * tile;
                const { ux, uz } = toUnrotatedRampUV(lx, lz, p.rotation);
                const uCol = clamp(Math.floor(ux / tile), 0, 2);
                const uRow = clamp(Math.floor(uz / tile), 0, 2);
                if (!isTileSolid(p.editMask, uRow, uCol)) continue;
                const x0 = col * tile;
                const x1 = (col + 1) * tile;
                const z0 = row * tile;
                const z1 = (row + 1) * tile;
                const h00 = baseY + getRampHeightAtLocal(x0, z0, p.rotation);
                const h10 = baseY + getRampHeightAtLocal(x1, z0, p.rotation);
                const h01 = baseY + getRampHeightAtLocal(x0, z1, p.rotation);
                const h11 = baseY + getRampHeightAtLocal(x1, z1, p.rotation);
                testTriangle(
                  baseX + x0,
                  h00,
                  baseZ + z0,
                  baseX + x1,
                  h10,
                  baseZ + z0,
                  baseX + x1,
                  h11,
                  baseZ + z1,
                  p.id,
                  p.material,
                );
                testTriangle(
                  baseX + x0,
                  h00,
                  baseZ + z0,
                  baseX + x1,
                  h11,
                  baseZ + z1,
                  baseX + x0,
                  h01,
                  baseZ + z1,
                  p.id,
                  p.material,
                );
              }
            }
          }
        } else if (p.type === 'roof') {
          if (p.editMask === 0) {
            const ax = baseX + GRID_XZ * 0.5;
            const ay = baseY + ROOF_HEIGHT;
            const az = baseZ + GRID_XZ * 0.5;
            const x0 = baseX;
            const x1 = baseX + GRID_XZ;
            const z0 = baseZ;
            const z1 = baseZ + GRID_XZ;
            testTriangle(x0, baseY, z0, x1, baseY, z0, ax, ay, az, p.id, p.material);
            testTriangle(x1, baseY, z0, x1, baseY, z1, ax, ay, az, p.id, p.material);
            testTriangle(x1, baseY, z1, x0, baseY, z1, ax, ay, az, p.id, p.material);
            testTriangle(x0, baseY, z1, x0, baseY, z0, ax, ay, az, p.id, p.material);
          } else {
            const tile = GRID_XZ / 3;
            for (let row = 0; row < 3; row++) {
              for (let col = 0; col < 3; col++) {
                if (!isTileSolid(p.editMask, row, col)) continue;
                const x0 = col * tile;
                const x1 = (col + 1) * tile;
                const z0 = row * tile;
                const z1 = (row + 1) * tile;
                const cx = (x0 + x1) * 0.5;
                const cz = (z0 + z1) * 0.5;
                const h00 = baseY + getRoofHeightAtLocal(x0, z0);
                const h10 = baseY + getRoofHeightAtLocal(x1, z0);
                const h01 = baseY + getRoofHeightAtLocal(x0, z1);
                const h11 = baseY + getRoofHeightAtLocal(x1, z1);
                const hc = baseY + getRoofHeightAtLocal(cx, cz);
                testTriangle(
                  baseX + x0,
                  h00,
                  baseZ + z0,
                  baseX + x1,
                  h10,
                  baseZ + z0,
                  baseX + cx,
                  hc,
                  baseZ + cz,
                  p.id,
                  p.material,
                );
                testTriangle(
                  baseX + x1,
                  h10,
                  baseZ + z0,
                  baseX + x1,
                  h11,
                  baseZ + z1,
                  baseX + cx,
                  hc,
                  baseZ + cz,
                  p.id,
                  p.material,
                );
                testTriangle(
                  baseX + x1,
                  h11,
                  baseZ + z1,
                  baseX + x0,
                  h01,
                  baseZ + z1,
                  baseX + cx,
                  hc,
                  baseZ + cz,
                  p.id,
                  p.material,
                );
                testTriangle(
                  baseX + x0,
                  h01,
                  baseZ + z1,
                  baseX + x0,
                  h00,
                  baseZ + z0,
                  baseX + cx,
                  hc,
                  baseZ + cz,
                  p.id,
                  p.material,
                );
              }
            }
          }
        }
      }
    }

    // 4. Terrain raymarch up to bestDist
    const marchStep = 1.25;
    let prevT = 0;
    let prevDiff = origin.y - this.terrain.getHeightAt(origin.x, origin.z);
    if (prevDiff <= 0) {
      // Starting slightly below terrain surface: only hit if moving downward or leave clear
      if (dy < 0 && bestDist > 0.05) {
        const n = this.terrain.getNormalAt(origin.x, origin.z);
        return {
          hit: true,
          distance: 0,
          point: { x: origin.x, y: origin.y, z: origin.z },
          normal: n,
          targetType: 'terrain',
        };
      }
    } else {
      for (let t = marchStep; t <= bestDist + marchStep; t += marchStep) {
        const clampedT = Math.min(t, bestDist);
        const rx = origin.x + dx * clampedT;
        const ry = origin.y + dy * clampedT;
        const rz = origin.z + dz * clampedT;
        const h = this.terrain.getHeightAt(rx, rz);
        const diff = ry - h;
        if (diff <= 0) {
          let lo = prevT;
          let hi = clampedT;
          for (let iter = 0; iter < 8; iter++) {
            const mid = (lo + hi) * 0.5;
            const mx = origin.x + dx * mid;
            const my = origin.y + dy * mid;
            const mz = origin.z + dz * mid;
            if (my <= this.terrain.getHeightAt(mx, mz)) {
              hi = mid;
            } else {
              lo = mid;
            }
          }
          const hitT = hi;
          if (hitT < bestDist) {
            const hx = origin.x + dx * hitT;
            const hy = origin.y + dy * hitT;
            const hz = origin.z + dz * hitT;
            const n = this.terrain.getNormalAt(hx, hz);
            bestDist = hitT;
            bestHit = true;
            bestNx = n.x;
            bestNy = n.y;
            bestNz = n.z;
            bestType = 'terrain';
            bestId = undefined;
            bestMaterial = undefined;
          }
          break;
        }
        prevT = clampedT;
        if (clampedT >= bestDist) break;
      }
    }

    if (!bestHit) {
      return {
        hit: false,
        distance: maxDist,
        point: {
          x: origin.x + dx * maxDist,
          y: origin.y + dy * maxDist,
          z: origin.z + dz * maxDist,
        },
        normal: { x: 0, y: 1, z: 0 },
        targetType: 'none',
      };
    }

    return {
      hit: true,
      distance: bestDist,
      point: {
        x: origin.x + dx * bestDist,
        y: origin.y + dy * bestDist,
        z: origin.z + dz * bestDist,
      },
      normal: { x: bestNx, y: bestNy, z: bestNz },
      targetType: bestType,
      targetId: bestId,
      material: bestMaterial,
    };
  }
}

export { worldToGrid };
