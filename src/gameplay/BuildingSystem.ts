import * as THREE from 'three';
import type {
  BuildPiece,
  BuildPieceType,
  BuildPreviewState,
  EditModeState,
  EditResult,
  EditVariant,
  MaterialType,
  TerrainQuery,
  Vec3Like,
  WallDir,
} from '../types';
import {
  BUILD_COST,
  EventBus,
  GRID_XZ,
  GRID_Y,
  MATERIAL_STATS,
  clamp,
  getPieceKey,
  worldToGrid,
} from '../core';
import { ROOF_HEIGHT, getRampHeightAtLocal, getRoofHeightAtLocal } from './CollisionSystem';

const WALL_THICK = 0.22;
const FLOOR_THICK = 0.18;
const RAMP_THICK = 0.18;

const TRIM_COLORS: Record<MaterialType, number> = {
  wood: 0x875326,
  brick: 0x8a4232,
  metal: 0x4b596b,
};

function areRemainingTilesConnected(remainingMask: number): boolean {
  if (remainingMask === 0) return false;
  let firstBit = -1;
  let count = 0;
  for (let i = 0; i < 9; i++) {
    if ((remainingMask & (1 << i)) !== 0) {
      if (firstBit === -1) firstBit = i;
      count++;
    }
  }
  if (count <= 1) return count === 1;

  const visited = new Set<number>([firstBit]);
  const queue: number[] = [firstBit];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const r = Math.floor(cur / 3);
    const c = cur % 3;
    const neighbors = [
      r > 0 ? (r - 1) * 3 + c : -1,
      r < 2 ? (r + 1) * 3 + c : -1,
      c > 0 ? r * 3 + (c - 1) : -1,
      c < 2 ? r * 3 + (c + 1) : -1,
    ];
    for (let i = 0; i < 4; i++) {
      const nb = neighbors[i];
      if (nb !== -1 && !visited.has(nb) && (remainingMask & (1 << nb)) !== 0) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }

  return visited.size === count;
}

function isTileRemoved(editMask: number, idx: number): boolean {
  return (editMask & (1 << idx)) !== 0;
}

export function classifyEditMask(
  type: BuildPieceType,
  editMask: number,
): { valid: boolean; variant: EditVariant } {
  const mask = editMask & 0b111111111;
  if (mask === 0) {
    return { valid: true, variant: 'full' };
  }

  const remaining = (~mask) & 0b111111111;
  if (!areRemainingTilesConnected(remaining)) {
    return { valid: false, variant: 'full' };
  }

  let removedCount = 0;
  for (let i = 0; i < 9; i++) {
    if ((mask & (1 << i)) !== 0) removedCount++;
  }

  if (type === 'wall') {
    // At least one bottom tile (6, 7, 8) must remain anchored
    if ((remaining & 0b111000000) === 0) {
      return { valid: false, variant: 'full' };
    }

    const r0Removed = isTileRemoved(mask, 0) && isTileRemoved(mask, 1) && isTileRemoved(mask, 2);
    const r1Removed = isTileRemoved(mask, 3) && isTileRemoved(mask, 4) && isTileRemoved(mask, 5);

    if (r0Removed && (r1Removed || removedCount === 3)) {
      return { valid: true, variant: 'half_wall' };
    }

    const col0Removed = isTileRemoved(mask, 0) && isTileRemoved(mask, 3) && isTileRemoved(mask, 6);
    const col2Removed = isTileRemoved(mask, 2) && isTileRemoved(mask, 5) && isTileRemoved(mask, 8);
    if (col0Removed || col2Removed) {
      if (removedCount >= 3 && !isTileRemoved(mask, 1) && !isTileRemoved(mask, 4) && !isTileRemoved(mask, 7)) {
        return { valid: true, variant: 'half_wall' };
      }
      if (r0Removed) {
        return { valid: true, variant: 'corner' };
      }
      return { valid: true, variant: 'half_wall' };
    }

    // Check door openings (2 vertical tiles in mid+bot rows with top tile solid above)
    const centerDoor = isTileRemoved(mask, 4) && isTileRemoved(mask, 7) && !isTileRemoved(mask, 1);
    const leftDoor = isTileRemoved(mask, 3) && isTileRemoved(mask, 6) && !isTileRemoved(mask, 0);
    const rightDoor = isTileRemoved(mask, 5) && isTileRemoved(mask, 8) && !isTileRemoved(mask, 2);
    if (
      (centerDoor && !isTileRemoved(mask, 6) && !isTileRemoved(mask, 8)) ||
      (leftDoor && !isTileRemoved(mask, 7)) ||
      (rightDoor && !isTileRemoved(mask, 7))
    ) {
      return { valid: true, variant: 'door' };
    }

    // Arch: multi-tile bottom opening
    if (isTileRemoved(mask, 6) || isTileRemoved(mask, 7) || isTileRemoved(mask, 8)) {
      return { valid: true, variant: 'arch' };
    }

    // Corner triangles
    if (
      (isTileRemoved(mask, 0) && isTileRemoved(mask, 1) && isTileRemoved(mask, 3)) ||
      (isTileRemoved(mask, 1) && isTileRemoved(mask, 2) && isTileRemoved(mask, 5))
    ) {
      return { valid: true, variant: 'corner' };
    }

    // Windows
    if (mask === ((1 << 3) | (1 << 5))) {
      return { valid: true, variant: 'double_window' };
    }
    if (
      (isTileRemoved(mask, 3) && isTileRemoved(mask, 5)) ||
      (removedCount >= 2 && isTileRemoved(mask, 3) && isTileRemoved(mask, 4) && isTileRemoved(mask, 5))
    ) {
      return { valid: true, variant: 'double_window' };
    }
    if (isTileRemoved(mask, 3) || isTileRemoved(mask, 4) || isTileRemoved(mask, 5)) {
      return { valid: true, variant: 'window' };
    }

    return { valid: true, variant: 'corner' };
  }

  if (type === 'floor') {
    if (
      isTileRemoved(mask, 4) ||
      (removedCount <= 2 && !rRowOrColRemoved(mask))
    ) {
      return { valid: true, variant: 'hatch' };
    }
    if (
      (isTileRemoved(mask, 0) && isTileRemoved(mask, 1) && isTileRemoved(mask, 3) && removedCount <= 4) ||
      (isTileRemoved(mask, 1) && isTileRemoved(mask, 2) && isTileRemoved(mask, 5) && removedCount <= 4) ||
      (isTileRemoved(mask, 3) && isTileRemoved(mask, 6) && isTileRemoved(mask, 7) && removedCount <= 4) ||
      (isTileRemoved(mask, 5) && isTileRemoved(mask, 7) && isTileRemoved(mask, 8) && removedCount <= 4)
    ) {
      return { valid: true, variant: 'corner' };
    }
    return { valid: true, variant: 'half_floor' };
  }

  if (type === 'roof') {
    if (isTileRemoved(mask, 4) || removedCount <= 2) {
      return { valid: true, variant: 'hatch' };
    }
    if (rRowOrColRemoved(mask)) {
      return { valid: true, variant: 'ramp_edit' };
    }
    return { valid: true, variant: 'corner' };
  }

  // Ramp
  if (
    (isTileRemoved(mask, 0) && isTileRemoved(mask, 3) && isTileRemoved(mask, 6)) ||
    (isTileRemoved(mask, 2) && isTileRemoved(mask, 5) && isTileRemoved(mask, 8))
  ) {
    return { valid: true, variant: 'half_ramp' };
  }
  return { valid: true, variant: 'ramp_edit' };
}

function rRowOrColRemoved(mask: number): boolean {
  const r0 = isTileRemoved(mask, 0) && isTileRemoved(mask, 1) && isTileRemoved(mask, 2);
  const r2 = isTileRemoved(mask, 6) && isTileRemoved(mask, 7) && isTileRemoved(mask, 8);
  const c0 = isTileRemoved(mask, 0) && isTileRemoved(mask, 3) && isTileRemoved(mask, 6);
  const c2 = isTileRemoved(mask, 2) && isTileRemoved(mask, 5) && isTileRemoved(mask, 8);
  return r0 || r2 || c0 || c2;
}

interface PieceVisual {
  piece: BuildPiece;
  group: THREE.Group;
  mainMat: THREE.MeshStandardMaterial;
  trimMat: THREE.MeshStandardMaterial;
  customGeos: THREE.BufferGeometry[];
  baseColorHex: number;
  trimColorHex: number;
  hitFlashTimer: number;
  popAge: number;
}

export class BuildingSystem {
  private scene: THREE.Scene;
  private terrain: TerrainQuery;
  private eventBus: EventBus;

  private rootGroup = new THREE.Group();
  private previewGroup = new THREE.Group();
  private editGridGroup = new THREE.Group();

  private piecesById = new Map<string, BuildPiece>();
  private piecesByKey = new Map<string, BuildPiece>();
  private visualsById = new Map<string, PieceVisual>();
  private piecesArray: BuildPiece[] = [];
  private nextPieceSeq = 1;

  private unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  private previewTileGeo = new THREE.PlaneGeometry(1, 1);
  private previewMeshMatValid: THREE.MeshBasicMaterial;
  private previewMeshMatInvalid: THREE.MeshBasicMaterial;
  private previewWireMatValid: THREE.MeshBasicMaterial;
  private previewWireMatInvalid: THREE.MeshBasicMaterial;

  private previewMesh: THREE.Mesh | null = null;
  private previewWire: THREE.Mesh | null = null;
  private previewCustomGeos: THREE.BufferGeometry[] = [];
  private lastPreviewSignature = '';

  private editTileMeshes: THREE.Mesh[] = [];
  private editTileMats: THREE.MeshBasicMaterial[] = [];
  private editState: EditModeState = {
    active: false,
    pieceId: null,
    pieceType: null,
    selectedTiles: new Array(9).fill(false),
    hoveredTile: -1,
    valid: true,
  };
  private editGridWorldCenter = new THREE.Vector3();
  private editGridNormal = new THREE.Vector3(0, 0, 1);
  private editGridRight = new THREE.Vector3(1, 0, 0);
  private editGridUp = new THREE.Vector3(0, 1, 0);
  private editGridWidth = GRID_XZ;
  private editGridHeight = GRID_Y;

  constructor(scene: THREE.Scene, terrain: TerrainQuery, eventBus: EventBus) {
    this.scene = scene;
    this.terrain = terrain;
    this.eventBus = eventBus;

    this.rootGroup.name = 'BuildingSystemRoot';
    this.previewGroup.name = 'BuildingPreview';
    this.editGridGroup.name = 'BuildingEditGrid';
    this.previewGroup.visible = false;
    this.editGridGroup.visible = false;

    this.scene.add(this.rootGroup);
    this.scene.add(this.previewGroup);
    this.scene.add(this.editGridGroup);

    this.previewMeshMatValid = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.previewMeshMatInvalid = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.previewWireMatValid = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      wireframe: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.previewWireMatInvalid = new THREE.MeshBasicMaterial({
      color: 0xfca5a5,
      wireframe: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    this.initEditGridMeshes();
  }

  private initEditGridMeshes(): void {
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.previewTileGeo, mat);
      this.editTileMats.push(mat);
      this.editTileMeshes.push(mesh);
      this.editGridGroup.add(mesh);
    }
  }

  computePreview(
    eyePos: Vec3Like,
    lookDir: Vec3Like,
    type: BuildPieceType,
    material: MaterialType,
    rotation: 0 | 1 | 2 | 3,
    hasMats: boolean,
  ): BuildPreviewState {
    const dirLen = Math.hypot(lookDir.x, lookDir.y, lookDir.z) || 1;
    const dx = lookDir.x / dirLen;
    const dy = lookDir.y / dirLen;
    const dz = lookDir.z / dirLen;

    const horizLen = Math.hypot(dx, dz);
    const fx = horizLen > 0.05 ? dx / horizLen : 0;
    const fz = horizLen > 0.05 ? dz / horizLen : -1;

    let gx = 0;
    let gy = 0;
    let gz = 0;
    let dir: WallDir = 'N';
    let worldPos: Vec3Like;

    if (type === 'wall') {
      const reach = dy < -0.35 ? clamp(1.8 / -dy, 1.8, 3.8) : 3.5;
      const px = eyePos.x + dx * reach;
      const pz = eyePos.z + dz * reach;

      if (Math.abs(fx) > Math.abs(fz)) {
        dir = 'W';
        gx = Math.round(px / GRID_XZ);
        gz = Math.floor(pz / GRID_XZ);
      } else {
        dir = 'N';
        gx = Math.floor(px / GRID_XZ);
        gz = Math.round(pz / GRID_XZ);
      }

      const cx = dir === 'N' ? (gx + 0.5) * GRID_XZ : gx * GRID_XZ;
      const cz = dir === 'N' ? gz * GRID_XZ : (gz + 0.5) * GRID_XZ;
      const groundY = this.terrain.getHeightAt(cx, cz);
      const targetY = Math.max(eyePos.y + dy * reach, groundY + 0.25);
      gy = Math.floor(targetY / GRID_Y);

      worldPos = {
        x: cx,
        y: (gy + 0.5) * GRID_Y,
        z: cz,
      };
    } else {
      const reach = dy < -0.3 ? clamp(1.7 / -dy, 1.0, 4.4) : 3.9;
      const px = eyePos.x + dx * reach;
      const pz = eyePos.z + dz * reach;
      gx = Math.floor(px / GRID_XZ);
      gz = Math.floor(pz / GRID_XZ);

      const cx = (gx + 0.5) * GRID_XZ;
      const cz = (gz + 0.5) * GRID_XZ;
      const groundY = this.terrain.getHeightAt(cx, cz);
      const targetY = Math.max(eyePos.y + dy * reach, groundY + 0.05);
      gy = Math.floor(targetY / GRID_Y);

      worldPos = {
        x: cx,
        y: type === 'floor' ? gy * GRID_Y : (gy + 0.5) * GRID_Y,
        z: cz,
      };
    }

    const key = getPieceKey(type, gx, gy, gz, dir);
    const existing = this.piecesByKey.get(key);
    const sampleGroundY = this.terrain.getHeightAt(worldPos.x, worldPos.z);

    let valid = true;
    let reason: BuildPreviewState['reason'] = 'ok';
    if (existing) {
      valid = false;
      reason = 'blocked';
    } else if ((gy + 1) * GRID_Y < sampleGroundY - 0.5) {
      valid = false;
      reason = 'blocked';
    } else if (!hasMats) {
      valid = false;
      reason = 'no_mats';
    }

    return {
      valid,
      reason,
      type,
      material,
      gx,
      gy,
      gz,
      dir,
      rotation,
      worldPos,
      cost: BUILD_COST,
    };
  }

  setPreviewVisible(visible: boolean, preview?: BuildPreviewState): void {
    this.previewGroup.visible = visible && Boolean(preview);
    if (!visible || !preview) return;

    const sig = `${preview.type}_${preview.rotation}_${preview.dir}`;
    if (sig !== this.lastPreviewSignature) {
      this.rebuildPreviewMesh(preview.type, preview.dir, preview.rotation);
      this.lastPreviewSignature = sig;
    }

    this.previewGroup.position.set(
      preview.gx * GRID_XZ,
      preview.gy * GRID_Y,
      preview.gz * GRID_XZ,
    );

    if (this.previewMesh) {
      this.previewMesh.material = preview.valid
        ? this.previewMeshMatValid
        : this.previewMeshMatInvalid;
    }
    if (this.previewWire) {
      this.previewWire.material = preview.valid
        ? this.previewWireMatValid
        : this.previewWireMatInvalid;
    }
  }

  private rebuildPreviewMesh(
    type: BuildPieceType,
    dir: WallDir,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    if (this.previewMesh) {
      this.previewGroup.remove(this.previewMesh);
      this.previewMesh = null;
    }
    if (this.previewWire) {
      this.previewGroup.remove(this.previewWire);
      this.previewWire = null;
    }
    for (let i = 0; i < this.previewCustomGeos.length; i++) {
      this.previewCustomGeos[i].dispose();
    }
    this.previewCustomGeos = [];

    let geo: THREE.BufferGeometry;
    if (type === 'wall') {
      geo = new THREE.BoxGeometry(
        dir === 'N' ? GRID_XZ : WALL_THICK,
        GRID_Y,
        dir === 'N' ? WALL_THICK : GRID_XZ,
      );
      geo.translate(
        dir === 'N' ? GRID_XZ * 0.5 : 0,
        GRID_Y * 0.5,
        dir === 'N' ? 0 : GRID_XZ * 0.5,
      );
    } else if (type === 'floor') {
      geo = new THREE.BoxGeometry(GRID_XZ, FLOOR_THICK, GRID_XZ);
      geo.translate(GRID_XZ * 0.5, -FLOOR_THICK * 0.5, GRID_XZ * 0.5);
    } else if (type === 'ramp') {
      geo = this.createRampBufferGeometry(0, rotation);
    } else {
      geo = this.createRoofBufferGeometry(0);
    }

    this.previewCustomGeos.push(geo);
    this.previewMesh = new THREE.Mesh(geo, this.previewMeshMatValid);
    this.previewWire = new THREE.Mesh(geo, this.previewWireMatValid);
    this.previewGroup.add(this.previewMesh);
    this.previewGroup.add(this.previewWire);
  }

  placePieceFromPreview(preview: BuildPreviewState, ownerId: string): BuildPiece | null {
    if (!preview.valid) return null;
    return this.placePieceForEntity(
      ownerId,
      preview.type,
      preview.material,
      preview.gx,
      preview.gy,
      preview.gz,
      preview.dir,
      preview.rotation,
    );
  }

  placePieceForEntity(
    ownerId: string,
    type: BuildPieceType,
    material: MaterialType,
    gx: number,
    gy: number,
    gz: number,
    dir: WallDir,
    rotation: 0 | 1 | 2 | 3,
  ): BuildPiece | null {
    const key = getPieceKey(type, gx, gy, gz, dir);
    if (this.piecesByKey.has(key)) return null;

    const stats = MATERIAL_STATS[material];
    const id = `build_${this.nextPieceSeq++}`;
    const piece: BuildPiece = {
      id,
      key,
      type,
      material,
      gx,
      gy,
      gz,
      dir,
      rotation,
      hp: stats.startHp,
      maxHp: stats.startHp,
      targetMaxHp: stats.maxHp,
      buildProgress: 0,
      ownerId,
      editMask: 0,
      editVariant: 'full',
      createdAt: Date.now(),
    };

    this.piecesById.set(id, piece);
    this.piecesByKey.set(key, piece);
    this.piecesArray.push(piece);
    this.createPieceVisual(piece);

    const worldPos = this.getPieceWorldCenter(piece);
    const soundId =
      material === 'wood'
        ? 'build_wood'
        : material === 'brick'
          ? 'build_brick'
          : 'build_metal';

    this.eventBus.emit('sound:play', {
      id: soundId,
      position: worldPos,
      spatial: true,
    });
    this.eventBus.emit('vfx:build_pop', {
      position: worldPos,
      material,
      pieceType: type,
    });
    this.eventBus.emit('audio:noise', {
      position: worldPos,
      kind: 'build',
      sourceId: ownerId,
      radius: 36,
    });

    return piece;
  }

  private getPieceWorldCenter(piece: BuildPiece): Vec3Like {
    const baseX = piece.gx * GRID_XZ;
    const baseY = piece.gy * GRID_Y;
    const baseZ = piece.gz * GRID_XZ;
    if (piece.type === 'wall') {
      return {
        x: piece.dir === 'N' ? baseX + GRID_XZ * 0.5 : baseX,
        y: baseY + GRID_Y * 0.5,
        z: piece.dir === 'N' ? baseZ : baseZ + GRID_XZ * 0.5,
      };
    }
    if (piece.type === 'floor') {
      return {
        x: baseX + GRID_XZ * 0.5,
        y: baseY,
        z: baseZ + GRID_XZ * 0.5,
      };
    }
    return {
      x: baseX + GRID_XZ * 0.5,
      y: baseY + GRID_Y * 0.5,
      z: baseZ + GRID_XZ * 0.5,
    };
  }

  private createPieceVisual(piece: BuildPiece): void {
    const baseColorHex = new THREE.Color(MATERIAL_STATS[piece.material].color).getHex();
    const trimColorHex = TRIM_COLORS[piece.material];

    const mainMat = new THREE.MeshStandardMaterial({
      color: baseColorHex,
      roughness: piece.material === 'metal' ? 0.38 : piece.material === 'brick' ? 0.85 : 0.78,
      metalness: piece.material === 'metal' ? 0.62 : 0.05,
      transparent: true,
      opacity: 0.78,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColorHex,
      roughness: piece.material === 'metal' ? 0.45 : 0.88,
      metalness: piece.material === 'metal' ? 0.55 : 0.05,
      transparent: true,
      opacity: 0.85,
    });

    const group = new THREE.Group();
    group.position.set(piece.gx * GRID_XZ, piece.gy * GRID_Y, piece.gz * GRID_XZ);
    group.userData.buildPieceId = piece.id;

    const visual: PieceVisual = {
      piece,
      group,
      mainMat,
      trimMat,
      customGeos: [],
      baseColorHex,
      trimColorHex,
      hitFlashTimer: 0,
      popAge: 0,
    };

    this.populatePieceVisualMeshes(visual);
    this.rootGroup.add(group);
    this.visualsById.set(piece.id, visual);
  }

  private clearVisualGroupMeshes(visual: PieceVisual): void {
    while (visual.group.children.length > 0) {
      visual.group.remove(visual.group.children[0]);
    }
    for (let i = 0; i < visual.customGeos.length; i++) {
      visual.customGeos[i].dispose();
    }
    visual.customGeos = [];
  }

  private addBoxPart(
    group: THREE.Group,
    mat: THREE.Material,
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
  ): void {
    const m = new THREE.Mesh(this.unitBoxGeo, mat);
    m.position.set(cx, cy, cz);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  private populatePieceVisualMeshes(visual: PieceVisual): void {
    this.clearVisualGroupMeshes(visual);
    const p = visual.piece;
    const g = visual.group;

    if (p.type === 'wall') {
      const tileW = GRID_XZ / 3;
      const tileH = GRID_Y / 3;

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (isTileRemoved(p.editMask, row * 3 + col)) continue;
          const cy = (2 - row + 0.5) * tileH;
          const cOffset = (col + 0.5) * tileW;

          if (p.dir === 'N') {
            this.addBoxPart(g, visual.mainMat, cOffset, cy, 0, tileW - 0.02, tileH - 0.02, WALL_THICK);
            // Stylized plank/brick/rib trim
            if (p.material === 'wood') {
              this.addBoxPart(g, visual.trimMat, cOffset, cy, 0, tileW - 0.04, 0.08, WALL_THICK + 0.03);
            } else if (p.material === 'brick') {
              this.addBoxPart(g, visual.trimMat, cOffset, cy - tileH * 0.28, 0, tileW * 0.85, 0.09, WALL_THICK + 0.03);
            } else {
              this.addBoxPart(g, visual.trimMat, cOffset, cy, 0, 0.1, tileH - 0.04, WALL_THICK + 0.03);
            }
          } else {
            this.addBoxPart(g, visual.mainMat, 0, cy, cOffset, WALL_THICK, tileH - 0.02, tileW - 0.02);
            if (p.material === 'wood') {
              this.addBoxPart(g, visual.trimMat, 0, cy, cOffset, WALL_THICK + 0.03, 0.08, tileW - 0.04);
            } else if (p.material === 'brick') {
              this.addBoxPart(g, visual.trimMat, 0, cy - tileH * 0.28, cOffset, WALL_THICK + 0.03, 0.09, tileW * 0.85);
            } else {
              this.addBoxPart(g, visual.trimMat, 0, cy, cOffset, WALL_THICK + 0.03, tileH - 0.04, 0.1);
            }
          }
        }
      }

      // Corner/top vertical framing beams if full or edited
      if (p.dir === 'N') {
        this.addBoxPart(g, visual.trimMat, 0.06, GRID_Y * 0.5, 0, 0.1, GRID_Y, WALL_THICK + 0.04);
        this.addBoxPart(g, visual.trimMat, GRID_XZ - 0.06, GRID_Y * 0.5, 0, 0.1, GRID_Y, WALL_THICK + 0.04);
      } else {
        this.addBoxPart(g, visual.trimMat, 0, GRID_Y * 0.5, 0.06, WALL_THICK + 0.04, GRID_Y, 0.1);
        this.addBoxPart(g, visual.trimMat, 0, GRID_Y * 0.5, GRID_XZ - 0.06, WALL_THICK + 0.04, GRID_Y, 0.1);
      }
    } else if (p.type === 'floor') {
      const tile = GRID_XZ / 3;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (isTileRemoved(p.editMask, row * 3 + col)) continue;
          const cx = (col + 0.5) * tile;
          const cz = (row + 0.5) * tile;
          this.addBoxPart(g, visual.mainMat, cx, -FLOOR_THICK * 0.5, cz, tile - 0.02, FLOOR_THICK, tile - 0.02);
          this.addBoxPart(g, visual.trimMat, cx, -FLOOR_THICK * 0.5, cz, tile - 0.06, FLOOR_THICK + 0.02, 0.1);
        }
      }
    } else if (p.type === 'ramp') {
      const geo = this.createRampBufferGeometry(p.editMask, p.rotation);
      visual.customGeos.push(geo);
      const mesh = new THREE.Mesh(geo, visual.mainMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);

      // Add subtle tread cleats along ramp center for readable silhouette
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const frac = (s + 0.5) / steps;
        const tLocal = frac * GRID_XZ;
        let lx = GRID_XZ * 0.5;
        let lz = GRID_XZ * 0.5;
        let sx = GRID_XZ * 0.84;
        let sz = 0.14;
        if (p.rotation === 0) {
          lz = GRID_XZ - tLocal;
        } else if (p.rotation === 1) {
          lx = tLocal;
          sx = 0.14;
          sz = GRID_XZ * 0.84;
        } else if (p.rotation === 2) {
          lz = tLocal;
        } else {
          lx = GRID_XZ - tLocal;
          sx = 0.14;
          sz = GRID_XZ * 0.84;
        }
        const col = clamp(Math.floor(lx / (GRID_XZ / 3)), 0, 2);
        const row = clamp(Math.floor(lz / (GRID_XZ / 3)), 0, 2);
        // Check unrotated tile match cleanly via center height
        const ly = getRampHeightAtLocal(lx, lz, p.rotation);
        if (p.editMask === 0 || !this.isRampWorldCellRemoved(p, row, col)) {
          this.addBoxPart(g, visual.trimMat, lx, ly - 0.02, lz, sx, 0.06, sz);
        }
      }
    } else if (p.type === 'roof') {
      const geo = this.createRoofBufferGeometry(p.editMask);
      visual.customGeos.push(geo);
      const mesh = new THREE.Mesh(geo, visual.mainMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);

      // Apex cap detail if center tile intact
      if (!isTileRemoved(p.editMask, 4)) {
        this.addBoxPart(
          g,
          visual.trimMat,
          GRID_XZ * 0.5,
          ROOF_HEIGHT - 0.03,
          GRID_XZ * 0.5,
          0.32,
          0.08,
          0.32,
        );
      }
    }
  }

  private isRampWorldCellRemoved(p: BuildPiece, row: number, col: number): boolean {
    const lx = (col + 0.5) * (GRID_XZ / 3);
    const lz = (row + 0.5) * (GRID_XZ / 3);
    const half = GRID_XZ * 0.5;
    const cx = lx - half;
    const cz = lz - half;
    let ux = lx;
    let uz = lz;
    if (p.rotation === 1) {
      ux = cz + half;
      uz = -cx + half;
    } else if (p.rotation === 2) {
      ux = -cx + half;
      uz = -cz + half;
    } else if (p.rotation === 3) {
      ux = -cz + half;
      uz = cx + half;
    }
    const uCol = clamp(Math.floor(ux / (GRID_XZ / 3)), 0, 2);
    const uRow = clamp(Math.floor(uz / (GRID_XZ / 3)), 0, 2);
    return isTileRemoved(p.editMask, uRow * 3 + uCol);
  }

  private createRampBufferGeometry(
    editMask: number,
    rotation: 0 | 1 | 2 | 3,
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const tile = GRID_XZ / 3;

    const pushTri = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      cx: number,
      cy: number,
      cz: number,
    ) => {
      positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    };

    const pushTileSlab = (x0: number, x1: number, z0: number, z1: number) => {
      const t00 = getRampHeightAtLocal(x0, z0, rotation);
      const t10 = getRampHeightAtLocal(x1, z0, rotation);
      const t01 = getRampHeightAtLocal(x0, z1, rotation);
      const t11 = getRampHeightAtLocal(x1, z1, rotation);

      const b00 = t00 - RAMP_THICK;
      const b10 = t10 - RAMP_THICK;
      const b01 = t01 - RAMP_THICK;
      const b11 = t11 - RAMP_THICK;

      // Top face
      pushTri(x0, t00, z0, x0, t01, z1, x1, t11, z1);
      pushTri(x0, t00, z0, x1, t11, z1, x1, t10, z0);
      // Bottom face
      pushTri(x0, b00, z0, x1, b11, z1, x0, b01, z1);
      pushTri(x0, b00, z0, x1, b10, z0, x1, b11, z1);
      // 4 sides
      pushTri(x0, t00, z0, x1, t10, z0, x1, b10, z0);
      pushTri(x0, t00, z0, x1, b10, z0, x0, b00, z0);

      pushTri(x1, t11, z1, x0, t01, z1, x0, b01, z1);
      pushTri(x1, t11, z1, x0, b01, z1, x1, b11, z1);

      pushTri(x0, t01, z1, x0, t00, z0, x0, b00, z0);
      pushTri(x0, t01, z1, x0, b00, z0, x0, b01, z1);

      pushTri(x1, t10, z0, x1, t11, z1, x1, b11, z1);
      pushTri(x1, t10, z0, x1, b11, z1, x1, b10, z0);
    };

    if (editMask === 0) {
      pushTileSlab(0, GRID_XZ, 0, GRID_XZ);
    } else {
      const dummyPiece: BuildPiece = {
        id: '',
        key: '',
        type: 'ramp',
        material: 'wood',
        gx: 0,
        gy: 0,
        gz: 0,
        dir: 'N',
        rotation,
        hp: 100,
        maxHp: 100,
        targetMaxHp: 100,
        buildProgress: 1,
        ownerId: '',
        editMask,
        editVariant: 'full',
        createdAt: 0,
      };
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (this.isRampWorldCellRemoved(dummyPiece, row, col)) continue;
          pushTileSlab(col * tile, (col + 1) * tile, row * tile, (row + 1) * tile);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private createRoofBufferGeometry(editMask: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const tile = GRID_XZ / 3;
    const thick = 0.14;

    const pushTri = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      cx: number,
      cy: number,
      cz: number,
    ) => {
      positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    };

    if (editMask === 0) {
      const ax = GRID_XZ * 0.5;
      const ay = ROOF_HEIGHT;
      const az = GRID_XZ * 0.5;
      // Top outer pyramid faces
      pushTri(0, 0, 0, ax, ay, az, GRID_XZ, 0, 0);
      pushTri(GRID_XZ, 0, 0, ax, ay, az, GRID_XZ, 0, GRID_XZ);
      pushTri(GRID_XZ, 0, GRID_XZ, ax, ay, az, 0, 0, GRID_XZ);
      pushTri(0, 0, GRID_XZ, ax, ay, az, 0, 0, 0);
      // Underside pyramid faces
      pushTri(0, -thick, 0, GRID_XZ, -thick, 0, ax, ay - thick, az);
      pushTri(GRID_XZ, -thick, 0, GRID_XZ, -thick, GRID_XZ, ax, ay - thick, az);
      pushTri(GRID_XZ, -thick, GRID_XZ, 0, -thick, GRID_XZ, ax, ay - thick, az);
      pushTri(0, -thick, GRID_XZ, 0, -thick, 0, ax, ay - thick, az);
    } else {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (isTileRemoved(editMask, row * 3 + col)) continue;
          const x0 = col * tile;
          const x1 = (col + 1) * tile;
          const z0 = row * tile;
          const z1 = (row + 1) * tile;
          const cx = (x0 + x1) * 0.5;
          const cz = (z0 + z1) * 0.5;

          const h00 = getRoofHeightAtLocal(x0, z0);
          const h10 = getRoofHeightAtLocal(x1, z0);
          const h01 = getRoofHeightAtLocal(x0, z1);
          const h11 = getRoofHeightAtLocal(x1, z1);
          const hc = getRoofHeightAtLocal(cx, cz);

          // Top 4 triangles
          pushTri(x0, h00, z0, cx, hc, cz, x1, h10, z0);
          pushTri(x1, h10, z0, cx, hc, cz, x1, h11, z1);
          pushTri(x1, h11, z1, cx, hc, cz, x0, h01, z1);
          pushTri(x0, h01, z1, cx, hc, cz, x0, h00, z0);

          // Bottom 4 triangles
          pushTri(x0, h00 - thick, z0, x1, h10 - thick, z0, cx, hc - thick, cz);
          pushTri(x1, h10 - thick, z0, x1, h11 - thick, z1, cx, hc - thick, cz);
          pushTri(x1, h11 - thick, z1, x0, h01 - thick, z1, cx, hc - thick, cz);
          pushTri(x0, h01 - thick, z1, x0, h00 - thick, z0, cx, hc - thick, cz);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }

  update(dt: number, elapsed: number): void {
    // Pulse preview opacity smoothly
    if (this.previewGroup.visible) {
      const pulse = 0.32 + Math.sin(elapsed * 5.0) * 0.08;
      this.previewMeshMatValid.opacity = pulse;
      this.previewMeshMatInvalid.opacity = pulse;
    }

    const tmpBase = new THREE.Color();
    const tmpTrim = new THREE.Color();
    const darkTarget = new THREE.Color(0x27201c);

    for (const visual of this.visualsById.values()) {
      const p = visual.piece;
      const stats = MATERIAL_STATS[p.material];

      // Progressive build-in HP & visual interpolation
      if (p.buildProgress < 1) {
        const prevProgress = p.buildProgress;
        p.buildProgress = clamp(p.buildProgress + dt / stats.buildTime, 0, 1);
        const deltaProg = p.buildProgress - prevProgress;
        const hpGain = (stats.maxHp - stats.startHp) * deltaProg;
        p.maxHp = stats.startHp + (stats.maxHp - stats.startHp) * p.buildProgress;
        p.hp = Math.min(p.targetMaxHp, p.hp + hpGain);
      }

      visual.popAge += dt;
      if (visual.hitFlashTimer > 0) {
        visual.hitFlashTimer = Math.max(0, visual.hitFlashTimer - dt);
      }

      // Pop-in spring scale animation
      if (visual.popAge < 0.16) {
        const t = visual.popAge / 0.16;
        const s = 0.72 + 0.28 * Math.sin(t * Math.PI * 0.65) * 1.15;
        visual.group.scale.set(1, Math.min(1.06, s), 1);
      } else {
        visual.group.scale.set(1, 1, 1);
      }

      const isBeingEdited = this.editState.active && this.editState.pieceId === p.id;
      const targetOpacity = isBeingEdited ? 0.35 : 0.78 + 0.22 * p.buildProgress;
      visual.mainMat.opacity = targetOpacity;
      visual.trimMat.opacity = isBeingEdited ? 0.35 : 0.85 + 0.15 * p.buildProgress;

      // Damage crack darkening
      const hpRatio = clamp(p.hp / p.targetMaxHp, 0, 1);
      const damageDarken = hpRatio < 0.85 ? (1 - hpRatio / 0.85) * 0.62 : 0;

      tmpBase.setHex(visual.baseColorHex).lerp(darkTarget, damageDarken);
      tmpTrim.setHex(visual.trimColorHex).lerp(darkTarget, damageDarken);

      if (visual.hitFlashTimer > 0) {
        tmpBase.lerp(new THREE.Color(0xffffff), 0.35);
      }

      visual.mainMat.color.copy(tmpBase);
      visual.trimMat.color.copy(tmpTrim);
    }
  }

  getPieces(): BuildPiece[] {
    return this.piecesArray;
  }

  getPieceById(id: string): BuildPiece | undefined {
    return this.piecesById.get(id);
  }

  getPieceAtKey(key: string): BuildPiece | undefined {
    return this.piecesByKey.get(key);
  }

  damagePiece(
    pieceId: string,
    damage: number,
  ): { destroyed: boolean; piece?: BuildPiece } {
    const piece = this.piecesById.get(pieceId);
    if (!piece) return { destroyed: false };

    piece.hp = Math.max(0, piece.hp - damage);
    const visual = this.visualsById.get(pieceId);
    if (visual) {
      visual.hitFlashTimer = 0.1;
    }

    const center = this.getPieceWorldCenter(piece);
    const hitSound =
      piece.material === 'wood'
        ? 'hit_wood'
        : piece.material === 'brick'
          ? 'hit_brick'
          : 'hit_metal';

    this.eventBus.emit('sound:play', {
      id: hitSound,
      position: center,
      spatial: true,
    });

    if (piece.hp <= 0) {
      if (this.editState.active && this.editState.pieceId === pieceId) {
        this.cancelEdit();
      }
      this.removePieceInternal(pieceId);
      this.eventBus.emit('sound:play', {
        id: 'structure_break',
        position: center,
        spatial: true,
      });
      this.eventBus.emit('vfx:build_pop', {
        position: center,
        material: piece.material,
        pieceType: piece.type,
      });
      return { destroyed: true, piece };
    }

    return { destroyed: false, piece };
  }

  private removePieceInternal(pieceId: string): void {
    const piece = this.piecesById.get(pieceId);
    if (!piece) return;

    this.piecesById.delete(pieceId);
    this.piecesByKey.delete(piece.key);
    const idx = this.piecesArray.indexOf(piece);
    if (idx !== -1) {
      this.piecesArray.splice(idx, 1);
    }

    const visual = this.visualsById.get(pieceId);
    if (visual) {
      this.clearVisualGroupMeshes(visual);
      visual.mainMat.dispose();
      visual.trimMat.dispose();
      this.rootGroup.remove(visual.group);
      this.visualsById.delete(pieceId);
    }
  }

  beginEdit(pieceId: string): EditModeState {
    const piece = this.piecesById.get(pieceId);
    if (!piece) {
      return this.getEditState();
    }

    const selectedTiles = new Array<boolean>(9);
    for (let i = 0; i < 9; i++) {
      selectedTiles[i] = isTileRemoved(piece.editMask, i);
    }

    const check = classifyEditMask(piece.type, piece.editMask);
    this.editState = {
      active: true,
      pieceId: piece.id,
      pieceType: piece.type,
      selectedTiles,
      hoveredTile: -1,
      valid: check.valid,
    };

    this.positionEditGridOverlay(piece);
    this.updateEditGridVisuals();
    this.editGridGroup.visible = true;
    this.eventBus.emit('sound:play', { id: 'edit_select' });

    return this.getEditState();
  }

  private positionEditGridOverlay(piece: BuildPiece): void {
    const baseX = piece.gx * GRID_XZ;
    const baseY = piece.gy * GRID_Y;
    const baseZ = piece.gz * GRID_XZ;

    if (piece.type === 'wall') {
      this.editGridWidth = GRID_XZ;
      this.editGridHeight = GRID_Y;
      this.editGridUp.set(0, 1, 0);
      if (piece.dir === 'N') {
        this.editGridWorldCenter.set(baseX + GRID_XZ * 0.5, baseY + GRID_Y * 0.5, baseZ);
        this.editGridRight.set(1, 0, 0);
        this.editGridNormal.set(0, 0, 1);
      } else {
        this.editGridWorldCenter.set(baseX, baseY + GRID_Y * 0.5, baseZ + GRID_XZ * 0.5);
        this.editGridRight.set(0, 0, 1);
        this.editGridNormal.set(1, 0, 0);
      }
    } else if (piece.type === 'floor' || piece.type === 'roof') {
      const yOffset = piece.type === 'floor' ? 0.08 : ROOF_HEIGHT * 0.45;
      this.editGridWidth = GRID_XZ;
      this.editGridHeight = GRID_XZ;
      this.editGridWorldCenter.set(baseX + GRID_XZ * 0.5, baseY + yOffset, baseZ + GRID_XZ * 0.5);
      this.editGridRight.set(1, 0, 0);
      this.editGridUp.set(0, 0, -1);
      this.editGridNormal.set(0, 1, 0);
    } else {
      // Ramp edit grid floats slanted or planar along cell center
      this.editGridWidth = GRID_XZ;
      this.editGridHeight = GRID_XZ;
      this.editGridWorldCenter.set(baseX + GRID_XZ * 0.5, baseY + GRID_Y * 0.5, baseZ + GRID_XZ * 0.5);
      this.editGridRight.set(1, 0, 0);
      this.editGridUp.set(0, 0, -1);
      this.editGridNormal.set(0, 1, 0);
    }

    const tileW = this.editGridWidth / 3;
    const tileH = this.editGridHeight / 3;

    const basis = new THREE.Matrix4().makeBasis(
      this.editGridRight,
      this.editGridUp,
      this.editGridNormal,
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const idx = row * 3 + col;
        const mesh = this.editTileMeshes[idx];
        const uOffset = (col - 1) * tileW;
        const vOffset = (1 - row) * tileH;

        mesh.position
          .copy(this.editGridWorldCenter)
          .addScaledVector(this.editGridRight, uOffset)
          .addScaledVector(this.editGridUp, vOffset);
        mesh.quaternion.copy(quat);
        mesh.scale.set(tileW * 0.9, tileH * 0.9, 1);
      }
    }
  }

  private getCurrentEditMask(): number {
    let mask = 0;
    for (let i = 0; i < 9; i++) {
      if (this.editState.selectedTiles[i]) {
        mask |= 1 << i;
      }
    }
    return mask;
  }

  private updateEditGridVisuals(): void {
    const valid = this.editState.valid;
    for (let i = 0; i < 9; i++) {
      const mat = this.editTileMats[i];
      const selected = this.editState.selectedTiles[i];
      const hovered = this.editState.hoveredTile === i;

      if (!valid) {
        mat.color.setHex(selected ? 0x991b1b : 0xef4444);
        mat.opacity = hovered ? 0.72 : 0.48;
      } else if (selected) {
        mat.color.setHex(hovered ? 0x64748b : 0x1e293b);
        mat.opacity = hovered ? 0.5 : 0.25;
      } else {
        mat.color.setHex(hovered ? 0x7dd3fc : 0x0ea5e9);
        mat.opacity = hovered ? 0.72 : 0.45;
      }
    }
  }

  toggleEditTile(tileIndex: number): EditModeState {
    if (!this.editState.active || tileIndex < 0 || tileIndex >= 9 || !this.editState.pieceType) {
      return this.getEditState();
    }

    this.editState.selectedTiles[tileIndex] = !this.editState.selectedTiles[tileIndex];
    const mask = this.getCurrentEditMask();
    this.editState.valid = classifyEditMask(this.editState.pieceType, mask).valid;
    this.updateEditGridVisuals();
    this.eventBus.emit('sound:play', { id: 'edit_select' });

    return this.getEditState();
  }

  resetEditTiles(): EditModeState {
    if (!this.editState.active) return this.getEditState();
    this.editState.selectedTiles.fill(false);
    this.editState.valid = true;
    this.updateEditGridVisuals();
    this.eventBus.emit('sound:play', { id: 'edit_select' });
    return this.getEditState();
  }

  setHoveredEditTile(tileIndex: number): void {
    if (this.editState.hoveredTile === tileIndex) return;
    this.editState.hoveredTile = tileIndex;
    if (this.editState.active) {
      this.updateEditGridVisuals();
    }
  }

  getHoveredEditTileIndex(eyePos: Vec3Like, lookDir: Vec3Like): number {
    if (!this.editState.active) return -1;

    const len = Math.hypot(lookDir.x, lookDir.y, lookDir.z);
    if (len < 1e-6) return -1;
    const dir = new THREE.Vector3(lookDir.x / len, lookDir.y / len, lookDir.z / len);
    const origin = new THREE.Vector3(eyePos.x, eyePos.y, eyePos.z);

    const denom = dir.dot(this.editGridNormal);
    if (Math.abs(denom) < 1e-4) return -1;

    const t = this.editGridWorldCenter.clone().sub(origin).dot(this.editGridNormal) / denom;
    if (t < 0 || t > 7.5) return -1;

    const hit = origin.addScaledVector(dir, t);
    const rel = hit.sub(this.editGridWorldCenter);
    const u = rel.dot(this.editGridRight);
    const v = rel.dot(this.editGridUp);

    const halfW = this.editGridWidth * 0.5;
    const halfH = this.editGridHeight * 0.5;
    if (u < -halfW || u > halfW || v < -halfH || v > halfH) return -1;

    const col = clamp(Math.floor(((u + halfW) / this.editGridWidth) * 3), 0, 2);
    const row = clamp(Math.floor(((halfH - v) / this.editGridHeight) * 3), 0, 2);
    return row * 3 + col;
  }

  confirmEdit(): EditResult {
    if (!this.editState.active || !this.editState.pieceId) {
      return { success: false, pieceId: '', editMask: 0, variant: 'full' };
    }

    const pieceId = this.editState.pieceId;
    const piece = this.piecesById.get(pieceId);
    if (!piece) {
      this.cancelEdit();
      return { success: false, pieceId, editMask: 0, variant: 'full' };
    }

    const mask = this.getCurrentEditMask();
    const res = classifyEditMask(piece.type, mask);
    if (!res.valid) {
      return { success: false, pieceId, editMask: piece.editMask, variant: piece.editVariant };
    }

    piece.editMask = mask;
    piece.editVariant = res.variant;

    const visual = this.visualsById.get(pieceId);
    if (visual) {
      this.populatePieceVisualMeshes(visual);
      visual.popAge = 0;
    }

    this.editState = {
      active: false,
      pieceId: null,
      pieceType: null,
      selectedTiles: new Array(9).fill(false),
      hoveredTile: -1,
      valid: true,
    };
    this.editGridGroup.visible = false;
    this.eventBus.emit('sound:play', {
      id: 'edit_confirm',
      position: this.getPieceWorldCenter(piece),
      spatial: true,
    });

    return {
      success: true,
      pieceId,
      editMask: mask,
      variant: res.variant,
    };
  }

  cancelEdit(): void {
    this.editState = {
      active: false,
      pieceId: null,
      pieceType: null,
      selectedTiles: new Array(9).fill(false),
      hoveredTile: -1,
      valid: true,
    };
    this.editGridGroup.visible = false;
  }

  getEditState(): EditModeState {
    return {
      active: this.editState.active,
      pieceId: this.editState.pieceId,
      pieceType: this.editState.pieceType,
      selectedTiles: [...this.editState.selectedTiles],
      hoveredTile: this.editState.hoveredTile,
      valid: this.editState.valid,
    };
  }

  clearAll(): void {
    this.cancelEdit();
    const ids = Array.from(this.piecesById.keys());
    for (let i = 0; i < ids.length; i++) {
      this.removePieceInternal(ids[i]);
    }
    this.piecesById.clear();
    this.piecesByKey.clear();
    this.piecesArray = [];
    this.setPreviewVisible(false);
  }

  dispose(): void {
    this.clearAll();
    this.unitBoxGeo.dispose();
    this.previewTileGeo.dispose();
    for (let i = 0; i < this.previewCustomGeos.length; i++) {
      this.previewCustomGeos[i].dispose();
    }
    this.previewCustomGeos = [];
    this.previewMeshMatValid.dispose();
    this.previewMeshMatInvalid.dispose();
    this.previewWireMatValid.dispose();
    this.previewWireMatInvalid.dispose();
    for (let i = 0; i < this.editTileMats.length; i++) {
      this.editTileMats[i].dispose();
    }
    this.scene.remove(this.rootGroup);
    this.scene.remove(this.previewGroup);
    this.scene.remove(this.editGridGroup);
  }
}

export { worldToGrid };
