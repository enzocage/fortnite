import * as THREE from 'three';
import type {
  BuildPiece,
  BuildPieceType,
  BuildPreviewState,
  DamageEvent,
  EditModeState,
  EditResult,
  EditVariant,
  MaterialType,
  TeamId,
  TerrainQuery,
  PlacedC4Entity,
  TrapEntity,
  TrapKind,
  TurretEntity,
  Vec3Like,
  WallDir,
} from '../types';
import {
  BOUNCER_IMPULSE_FWD,
  BOUNCER_IMPULSE_Y,
  BUILD_COST,
  EventBus,
  GRID_XZ,
  GRID_Y,
  MATERIAL_STATS,
  MAX_ACTIVE_C4_PER_PLAYER,
  SPIKE_TRAP_DAMAGE,
  TURRET_DAMAGE,
  TURRET_DURATION_SEC,
  TURRET_FIRE_RATE,
  TURRET_MAX_HP,
  TURRET_RANGE,
  canonicalizeWall,
  clamp,
  dist3D,
  getPieceKey,
  worldToGrid,
} from '../core';
import { ROOF_HEIGHT, getRampHeightAtLocal, getRoofHeightAtLocal } from './CollisionSystem';
import type { CombatActor } from './GameplayTypes';

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

interface TrapVisual {
  trap: TrapEntity;
  group: THREE.Group;
  spikesGroup?: THREE.Group;
  ledMat?: THREE.MeshStandardMaterial;
  padCoreMat?: THREE.MeshStandardMaterial;
  pulseRing?: THREE.Mesh;
  spikeExtend: number;
}

interface TurretVisual {
  turret: TurretEntity;
  group: THREE.Group;
  headGroup: THREE.Group;
  barrelsGroup: THREE.Group;
  ledMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  hitFlashTimer: number;
  recoilTimer: number;
  muzzleFlashTimer: number;
  muzzleFlashMesh: THREE.Mesh;
}

interface C4Visual {
  entity: PlacedC4Entity;
  group: THREE.Group;
  ledMat: THREE.MeshBasicMaterial;
  blinkPhase: number;
}

export class BuildingSystem {
  private scene: THREE.Scene;
  private terrain: TerrainQuery;
  private eventBus: EventBus;

  private rootGroup = new THREE.Group();
  private trapGroup = new THREE.Group();
  private turretGroup = new THREE.Group();
  private c4Group = new THREE.Group();
  private previewGroup = new THREE.Group();
  private editGridGroup = new THREE.Group();

  private piecesById = new Map<string, BuildPiece>();
  private piecesByKey = new Map<string, BuildPiece>();
  private visualsById = new Map<string, PieceVisual>();
  private piecesArray: BuildPiece[] = [];
  private nextPieceSeq = 1;

  private traps: TrapEntity[] = [];
  private trapsById = new Map<string, TrapEntity>();
  private trapVisuals = new Map<string, TrapVisual>();
  private bouncerActorCooldowns = new Map<string, Map<string, number>>();
  private nextTrapSeq = 1;
  private trapDmgSeq = 1;
  private trapAnimElapsed = 0;
  private trapSharedGeos: THREE.BufferGeometry[] = [];
  private trapSharedMats: THREE.Material[] = [];
  private trapPlateMat: THREE.MeshStandardMaterial | null = null;
  private trapTrimMat: THREE.MeshStandardMaterial | null = null;
  private trapSpikeMat: THREE.MeshStandardMaterial | null = null;
  private trapSpikeGeo: THREE.BufferGeometry | null = null;
  private trapBouncerRingGeo: THREE.BufferGeometry | null = null;

  private turrets: TurretEntity[] = [];
  private turretsById = new Map<string, TurretEntity>();
  private turretVisuals = new Map<string, TurretVisual>();
  private nextTurretSeq = 1;
  private turretDmgSeq = 1;
  private turretAnimElapsed = 0;
  private turretSharedGeos: THREE.BufferGeometry[] = [];
  private turretSharedMats: THREE.Material[] = [];
  private turretBaseGeo: THREE.BufferGeometry | null = null;
  private turretLegGeo: THREE.BufferGeometry | null = null;
  private turretColumnGeo: THREE.BufferGeometry | null = null;
  private turretBarrelGeo: THREE.BufferGeometry | null = null;
  private turretRingGeo: THREE.BufferGeometry | null = null;
  private turretMuzzleGeo: THREE.BufferGeometry | null = null;
  private turretDarkMetalMat: THREE.MeshStandardMaterial | null = null;
  private turretTrimMetalMat: THREE.MeshStandardMaterial | null = null;
  private turretFlashMat: THREE.MeshBasicMaterial | null = null;

  private placedC4s: PlacedC4Entity[] = [];
  private c4Visuals = new Map<string, C4Visual>();
  private nextC4Seq = 1;
  private c4DmgSeq = 1;
  private c4AnimElapsed = 0;
  private c4SharedGeos: THREE.BufferGeometry[] = [];
  private c4SharedMats: THREE.Material[] = [];
  private c4PackMat: THREE.MeshStandardMaterial | null = null;
  private c4StrapMat: THREE.MeshStandardMaterial | null = null;
  private c4AntennaMat: THREE.MeshStandardMaterial | null = null;
  private c4BodyGeo: THREE.BufferGeometry | null = null;
  private c4LedGeo: THREE.BufferGeometry | null = null;

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
    this.trapGroup.name = 'BuildingTrapRoot';
    this.turretGroup.name = 'BuildingTurretRoot';
    this.c4Group.name = 'BuildingC4Root';
    this.previewGroup.name = 'BuildingPreview';
    this.editGridGroup.name = 'BuildingEditGrid';
    this.previewGroup.visible = false;
    this.editGridGroup.visible = false;

    this.scene.add(this.rootGroup);
    this.scene.add(this.trapGroup);
    this.scene.add(this.turretGroup);
    this.scene.add(this.c4Group);
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

  /**
   * Instantly spawns a fortified 1x1 metal tactical bunker (4 perimeter walls, central floor, internal ramp)
   * without consuming player materials.
   */
  deployPortABunker(origin: Vec3Like, ownerId: string, yaw: number): BuildPiece[] {
    if (
      !Number.isFinite(origin.x) ||
      !Number.isFinite(origin.y) ||
      !Number.isFinite(origin.z)
    ) {
      return [];
    }

    const gx = Math.floor(origin.x / GRID_XZ);
    const gz = Math.floor(origin.z / GRID_XZ);
    const cx = (gx + 0.5) * GRID_XZ;
    const cz = (gz + 0.5) * GRID_XZ;
    const groundY = this.terrain.getHeightAt(cx, cz);
    const baseTargetY = Math.max(origin.y, groundY);
    let gy = Math.floor((baseTargetY + 0.15) / GRID_Y);
    if ((gy + 1) * GRID_Y < groundY + 1.6) {
      gy += 1;
    }

    const safeYaw = Number.isFinite(yaw) ? yaw : 0;
    const fx = Math.sin(safeYaw);
    const fz = Math.cos(safeYaw);
    let rampRotation: 0 | 1 | 2 | 3 = 0;
    if (Math.abs(fz) >= Math.abs(fx)) {
      rampRotation = fz <= 0 ? 0 : 2;
    } else {
      rampRotation = fx >= 0 ? 1 : 3;
    }

    const spawned: BuildPiece[] = [];
    const fortify = (piece: BuildPiece | null) => {
      if (!piece) return;
      piece.buildProgress = 1;
      piece.maxHp = piece.targetMaxHp;
      piece.hp = piece.targetMaxHp;
      const visual = this.visualsById.get(piece.id);
      if (visual) {
        visual.mainMat.opacity = 1;
        visual.trimMat.opacity = 1;
      }
      spawned.push(piece);
    };

    fortify(this.placePieceForEntity(ownerId, 'floor', 'metal', gx, gy, gz, 'N', 0));
    fortify(this.placePieceForEntity(ownerId, 'ramp', 'metal', gx, gy, gz, 'N', rampRotation));
    for (let face = 0 as 0 | 1 | 2 | 3; face < 4; face = (face + 1) as 0 | 1 | 2 | 3) {
      const w = canonicalizeWall(gx, gy, gz, face);
      fortify(this.placePieceForEntity(ownerId, 'wall', 'metal', w.gx, w.gy, w.gz, w.dir, 0));
    }

    if (spawned.length > 0) {
      const center: Vec3Like = { x: cx, y: gy * GRID_Y, z: cz };
      this.eventBus.emit('vfx:bunker_deploy', { position: center });
      this.eventBus.emit('sound:play', {
        id: 'bunker_deploy',
        position: center,
        spatial: true,
      });
    }

    return spawned;
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

  private addOrientedBoxPart(
    group: THREE.Group,
    mat: THREE.Material,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    width: number,
    height: number,
  ): void {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const m = new THREE.Mesh(this.unitBoxGeo, mat);
    m.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    m.scale.set(width, height, len);
    m.lookAt(bx, by, bz);
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
      let hasTopRow = false;
      let hasBotRow = false;

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (isTileRemoved(p.editMask, row * 3 + col)) continue;
          if (row === 0) hasTopRow = true;
          if (row === 2) hasBotRow = true;
          const cy = (2 - row + 0.5) * tileH;
          const cOffset = (col + 0.5) * tileW;

          if (p.dir === 'N') {
            this.addBoxPart(g, visual.mainMat, cOffset, cy, 0, tileW - 0.02, tileH - 0.02, WALL_THICK);
            if (p.material === 'wood') {
              this.addBoxPart(g, visual.trimMat, cOffset, cy, 0, tileW - 0.04, 0.08, WALL_THICK + 0.03);
              this.addBoxPart(g, visual.trimMat, cOffset, cy + tileH * 0.27, 0, tileW - 0.06, 0.045, WALL_THICK + 0.02);
              this.addBoxPart(g, visual.trimMat, cOffset, cy - tileH * 0.27, 0, tileW - 0.06, 0.045, WALL_THICK + 0.02);
            } else if (p.material === 'brick') {
              this.addBoxPart(g, visual.trimMat, cOffset, cy - tileH * 0.28, 0, tileW * 0.85, 0.09, WALL_THICK + 0.03);
              this.addBoxPart(g, visual.trimMat, cOffset - tileW * 0.18, cy + tileH * 0.14, 0, tileW * 0.36, 0.11, WALL_THICK + 0.025);
              this.addBoxPart(g, visual.trimMat, cOffset + tileW * 0.2, cy + tileH * 0.3, 0, tileW * 0.32, 0.09, WALL_THICK + 0.025);
            } else {
              this.addBoxPart(g, visual.trimMat, cOffset, cy, 0, 0.1, tileH - 0.04, WALL_THICK + 0.03);
              this.addBoxPart(g, visual.trimMat, cOffset, cy, 0, tileW - 0.06, 0.08, WALL_THICK + 0.025);
              this.addBoxPart(g, visual.trimMat, cOffset - tileW * 0.3, cy + tileH * 0.3, 0, 0.06, 0.06, WALL_THICK + 0.05);
              this.addBoxPart(g, visual.trimMat, cOffset + tileW * 0.3, cy - tileH * 0.3, 0, 0.06, 0.06, WALL_THICK + 0.05);
            }
          } else {
            this.addBoxPart(g, visual.mainMat, 0, cy, cOffset, WALL_THICK, tileH - 0.02, tileW - 0.02);
            if (p.material === 'wood') {
              this.addBoxPart(g, visual.trimMat, 0, cy, cOffset, WALL_THICK + 0.03, 0.08, tileW - 0.04);
              this.addBoxPart(g, visual.trimMat, 0, cy + tileH * 0.27, cOffset, WALL_THICK + 0.02, 0.045, tileW - 0.06);
              this.addBoxPart(g, visual.trimMat, 0, cy - tileH * 0.27, cOffset, WALL_THICK + 0.02, 0.045, tileW - 0.06);
            } else if (p.material === 'brick') {
              this.addBoxPart(g, visual.trimMat, 0, cy - tileH * 0.28, cOffset, WALL_THICK + 0.03, 0.09, tileW * 0.85);
              this.addBoxPart(g, visual.trimMat, 0, cy + tileH * 0.14, cOffset - tileW * 0.18, WALL_THICK + 0.025, 0.11, tileW * 0.36);
              this.addBoxPart(g, visual.trimMat, 0, cy + tileH * 0.3, cOffset + tileW * 0.2, WALL_THICK + 0.025, 0.09, tileW * 0.32);
            } else {
              this.addBoxPart(g, visual.trimMat, 0, cy, cOffset, WALL_THICK + 0.03, tileH - 0.04, 0.1);
              this.addBoxPart(g, visual.trimMat, 0, cy, cOffset, WALL_THICK + 0.025, 0.08, tileW - 0.06);
              this.addBoxPart(g, visual.trimMat, 0, cy + tileH * 0.3, cOffset - tileW * 0.3, WALL_THICK + 0.05, 0.06, 0.06);
              this.addBoxPart(g, visual.trimMat, 0, cy - tileH * 0.3, cOffset + tileW * 0.3, WALL_THICK + 0.05, 0.06, 0.06);
            }
          }
        }
      }

      // Corner/top/bottom structural framing beams & rivets
      if (p.dir === 'N') {
        this.addBoxPart(g, visual.trimMat, 0.06, GRID_Y * 0.5, 0, 0.11, GRID_Y, WALL_THICK + 0.04);
        this.addBoxPart(g, visual.trimMat, GRID_XZ - 0.06, GRID_Y * 0.5, 0, 0.11, GRID_Y, WALL_THICK + 0.04);
        if (hasTopRow) {
          this.addBoxPart(g, visual.trimMat, GRID_XZ * 0.5, GRID_Y - 0.06, 0, GRID_XZ, 0.12, WALL_THICK + 0.05);
        }
        if (hasBotRow) {
          this.addBoxPart(g, visual.trimMat, GRID_XZ * 0.5, 0.06, 0, GRID_XZ, 0.12, WALL_THICK + 0.05);
        }
        if (p.material === 'wood' && p.editMask === 0) {
          this.addOrientedBoxPart(g, visual.trimMat, 0.14, 0.14, 0, GRID_XZ - 0.14, GRID_Y - 0.14, 0, WALL_THICK + 0.03, 0.09);
        } else if (p.material === 'metal') {
          for (let r = 0; r < 4; r++) {
            const ry = 0.25 + r * ((GRID_Y - 0.5) / 3);
            this.addBoxPart(g, visual.trimMat, 0.07, ry, 0, 0.08, 0.08, WALL_THICK + 0.07);
            this.addBoxPart(g, visual.trimMat, GRID_XZ - 0.07, ry, 0, 0.08, 0.08, WALL_THICK + 0.07);
          }
        }
      } else {
        this.addBoxPart(g, visual.trimMat, 0, GRID_Y * 0.5, 0.06, WALL_THICK + 0.04, GRID_Y, 0.11);
        this.addBoxPart(g, visual.trimMat, 0, GRID_Y * 0.5, GRID_XZ - 0.06, WALL_THICK + 0.04, GRID_Y, 0.11);
        if (hasTopRow) {
          this.addBoxPart(g, visual.trimMat, 0, GRID_Y - 0.06, GRID_XZ * 0.5, WALL_THICK + 0.05, 0.12, GRID_XZ);
        }
        if (hasBotRow) {
          this.addBoxPart(g, visual.trimMat, 0, 0.06, GRID_XZ * 0.5, WALL_THICK + 0.05, 0.12, GRID_XZ);
        }
        if (p.material === 'wood' && p.editMask === 0) {
          this.addOrientedBoxPart(g, visual.trimMat, 0, 0.14, 0.14, 0, GRID_Y - 0.14, GRID_XZ - 0.14, WALL_THICK + 0.03, 0.09);
        } else if (p.material === 'metal') {
          for (let r = 0; r < 4; r++) {
            const ry = 0.25 + r * ((GRID_Y - 0.5) / 3);
            this.addBoxPart(g, visual.trimMat, 0, ry, 0.07, WALL_THICK + 0.07, 0.08, 0.08);
            this.addBoxPart(g, visual.trimMat, 0, ry, GRID_XZ - 0.07, WALL_THICK + 0.07, 0.08, 0.08);
          }
        }
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
          if (p.material === 'wood') {
            this.addBoxPart(g, visual.trimMat, cx, -FLOOR_THICK * 0.5, cz - tile * 0.28, tile - 0.06, FLOOR_THICK + 0.015, 0.06);
          } else if (p.material === 'brick') {
            this.addBoxPart(g, visual.trimMat, cx - tile * 0.22, -FLOOR_THICK * 0.5, cz + tile * 0.22, tile * 0.4, FLOOR_THICK + 0.02, tile * 0.4);
          } else {
            this.addBoxPart(g, visual.trimMat, cx - tile * 0.35, -FLOOR_THICK * 0.5, cz - tile * 0.35, 0.07, FLOOR_THICK + 0.04, 0.07);
            this.addBoxPart(g, visual.trimMat, cx + tile * 0.35, -FLOOR_THICK * 0.5, cz + tile * 0.35, 0.07, FLOOR_THICK + 0.04, 0.07);
          }
        }
      }
      if (p.editMask === 0) {
        this.addBoxPart(g, visual.trimMat, GRID_XZ * 0.5, -FLOOR_THICK * 0.5, 0.06, GRID_XZ, FLOOR_THICK + 0.03, 0.12);
        this.addBoxPart(g, visual.trimMat, GRID_XZ * 0.5, -FLOOR_THICK * 0.5, GRID_XZ - 0.06, GRID_XZ, FLOOR_THICK + 0.03, 0.12);
        this.addBoxPart(g, visual.trimMat, 0.06, -FLOOR_THICK * 0.5, GRID_XZ * 0.5, 0.12, FLOOR_THICK + 0.03, GRID_XZ);
        this.addBoxPart(g, visual.trimMat, GRID_XZ - 0.06, -FLOOR_THICK * 0.5, GRID_XZ * 0.5, 0.12, FLOOR_THICK + 0.03, GRID_XZ);
      }
    } else if (p.type === 'ramp') {
      const geo = this.createRampBufferGeometry(p.editMask, p.rotation);
      visual.customGeos.push(geo);
      const mesh = new THREE.Mesh(geo, visual.mainMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);

      // Sloped side stringer frame rails along intact edges
      if (p.editMask === 0) {
        if (p.rotation === 0 || p.rotation === 2) {
          const y0 = getRampHeightAtLocal(0.06, 0, p.rotation);
          const y1 = getRampHeightAtLocal(0.06, GRID_XZ, p.rotation);
          this.addOrientedBoxPart(g, visual.trimMat, 0.07, y0 - 0.03, 0, 0.07, y1 - 0.03, GRID_XZ, 0.13, 0.16);
          this.addOrientedBoxPart(g, visual.trimMat, GRID_XZ - 0.07, y0 - 0.03, 0, GRID_XZ - 0.07, y1 - 0.03, GRID_XZ, 0.13, 0.16);
        } else {
          const y0 = getRampHeightAtLocal(0, 0.06, p.rotation);
          const y1 = getRampHeightAtLocal(GRID_XZ, 0.06, p.rotation);
          this.addOrientedBoxPart(g, visual.trimMat, 0, y0 - 0.03, 0.07, GRID_XZ, y1 - 0.03, 0.07, 0.13, 0.16);
          this.addOrientedBoxPart(g, visual.trimMat, 0, y0 - 0.03, GRID_XZ - 0.07, GRID_XZ, y1 - 0.03, GRID_XZ - 0.07, 0.13, 0.16);
        }
      }

      // Add subtle tread cleats + corner rivets along ramp center for readable silhouette
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
        const ly = getRampHeightAtLocal(lx, lz, p.rotation);
        if (p.editMask === 0 || !this.isRampWorldCellRemoved(p, row, col)) {
          this.addBoxPart(g, visual.trimMat, lx, ly - 0.02, lz, sx, 0.06, sz);
          if (p.material === 'metal') {
            this.addBoxPart(g, visual.trimMat, lx - sx * 0.42, ly + 0.02, lz - sz * 0.42, 0.07, 0.05, 0.07);
          }
        }
      }
    } else if (p.type === 'roof') {
      const geo = this.createRoofBufferGeometry(p.editMask);
      visual.customGeos.push(geo);
      const mesh = new THREE.Mesh(geo, visual.mainMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);

      // Apex cap + hip ridge beams + eave fascia frame
      if (!isTileRemoved(p.editMask, 4)) {
        const ax = GRID_XZ * 0.5;
        const ay = ROOF_HEIGHT;
        const az = GRID_XZ * 0.5;
        this.addBoxPart(g, visual.trimMat, ax, ay - 0.03, az, 0.36, 0.09, 0.36);
        if (p.editMask === 0) {
          this.addOrientedBoxPart(g, visual.trimMat, 0.04, 0, 0.04, ax, ay, az, 0.1, 0.1);
          this.addOrientedBoxPart(g, visual.trimMat, GRID_XZ - 0.04, 0, 0.04, ax, ay, az, 0.1, 0.1);
          this.addOrientedBoxPart(g, visual.trimMat, GRID_XZ - 0.04, 0, GRID_XZ - 0.04, ax, ay, az, 0.1, 0.1);
          this.addOrientedBoxPart(g, visual.trimMat, 0.04, 0, GRID_XZ - 0.04, ax, ay, az, 0.1, 0.1);
          this.addBoxPart(g, visual.trimMat, GRID_XZ * 0.5, -0.04, 0.05, GRID_XZ, 0.09, 0.1);
          this.addBoxPart(g, visual.trimMat, GRID_XZ * 0.5, -0.04, GRID_XZ - 0.05, GRID_XZ, 0.09, 0.1);
          this.addBoxPart(g, visual.trimMat, 0.05, -0.04, GRID_XZ * 0.5, 0.1, 0.09, GRID_XZ);
          this.addBoxPart(g, visual.trimMat, GRID_XZ - 0.05, -0.04, GRID_XZ * 0.5, 0.1, 0.09, GRID_XZ);
        }
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

      // Subtle damage crack darkening relative to current build maxHp
      const hpRatio = clamp(p.hp / Math.max(1, p.maxHp), 0, 1);
      const damageDarken = hpRatio < 0.96 ? (1 - hpRatio / 0.96) * 0.62 : 0;

      tmpBase.setHex(visual.baseColorHex).lerp(darkTarget, damageDarken);
      tmpTrim.setHex(visual.trimColorHex).lerp(darkTarget, damageDarken);

      if (visual.hitFlashTimer > 0) {
        tmpBase.lerp(new THREE.Color(0xffffff), 0.35);
      }

      visual.mainMat.color.copy(tmpBase);
      visual.trimMat.color.copy(tmpTrim);
    }

    this.updateTraps(dt);
    this.updateTurretVisuals(dt, elapsed);
    this.updateC4Visuals(dt, elapsed);
  }

  private ensureTrapSharedAssets(): void {
    if (!this.trapPlateMat) {
      this.trapPlateMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.45,
        metalness: 0.72,
      });
      this.trapSharedMats.push(this.trapPlateMat);
    }
    if (!this.trapTrimMat) {
      this.trapTrimMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.35,
        metalness: 0.84,
      });
      this.trapSharedMats.push(this.trapTrimMat);
    }
    if (!this.trapSpikeMat) {
      this.trapSpikeMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.22,
        metalness: 0.9,
      });
      this.trapSharedMats.push(this.trapSpikeMat);
    }
    if (!this.trapSpikeGeo) {
      this.trapSpikeGeo = new THREE.ConeGeometry(0.08, 0.58, 6);
      this.trapSharedGeos.push(this.trapSpikeGeo);
    }
    if (!this.trapBouncerRingGeo) {
      this.trapBouncerRingGeo = new THREE.TorusGeometry(0.95, 0.055, 8, 24);
      this.trapBouncerRingGeo.rotateX(Math.PI * 0.5);
      this.trapSharedGeos.push(this.trapBouncerRingGeo);
    }
  }

  private createTrapVisual(trap: TrapEntity): void {
    this.ensureTrapSharedAssets();
    const group = new THREE.Group();
    group.name = `Trap_${trap.id}`;
    group.position.set(trap.x, trap.y, trap.z);
    group.rotation.y = trap.rotationY;

    const plateW = trap.kind === 'spike_trap' ? GRID_XZ * 0.86 : 2.9;
    const plateMat = this.trapPlateMat!;
    const trimMat = this.trapTrimMat!;

    const base = new THREE.Mesh(this.unitBoxGeo, plateMat);
    base.scale.set(plateW, 0.06, plateW);
    base.position.set(0, 0.03, 0);
    base.receiveShadow = true;
    group.add(base);

    const frameThick = 0.14;
    const edgeOffset = plateW * 0.5 - frameThick * 0.5;
    for (const s of [-1, 1]) {
      const barX = new THREE.Mesh(this.unitBoxGeo, trimMat);
      barX.scale.set(plateW, 0.1, frameThick);
      barX.position.set(0, 0.05, s * edgeOffset);
      group.add(barX);

      const barZ = new THREE.Mesh(this.unitBoxGeo, trimMat);
      barZ.scale.set(frameThick, 0.1, plateW);
      barZ.position.set(s * edgeOffset, 0.05, 0);
      group.add(barZ);
    }

    if (trap.kind === 'spike_trap') {
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 1.2,
        roughness: 0.3,
      });
      const ledStrip = new THREE.Mesh(this.unitBoxGeo, ledMat);
      ledStrip.scale.set(plateW * 0.5, 0.03, 0.12);
      ledStrip.position.set(0, 0.075, edgeOffset - 0.18);
      group.add(ledStrip);

      const spikesGroup = new THREE.Group();
      spikesGroup.position.y = -0.52;
      const gridOffsets = [-0.96, -0.32, 0.32, 0.96];
      for (let ix = 0; ix < gridOffsets.length; ix++) {
        for (let iz = 0; iz < gridOffsets.length; iz++) {
          const spike = new THREE.Mesh(this.trapSpikeGeo!, this.trapSpikeMat!);
          spike.position.set(gridOffsets[ix], 0.29, gridOffsets[iz]);
          spike.castShadow = true;
          spikesGroup.add(spike);
        }
      }
      group.add(spikesGroup);
      this.trapGroup.add(group);
      this.trapVisuals.set(trap.id, {
        trap,
        group,
        spikesGroup,
        ledMat,
        spikeExtend: 0,
      });
    } else {
      const padCoreMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 1.35,
        roughness: 0.2,
        metalness: 0.25,
      });
      const padCore = new THREE.Mesh(this.unitBoxGeo, padCoreMat);
      padCore.scale.set(2.15, 0.08, 2.15);
      padCore.position.set(0, 0.06, 0);
      group.add(padCore);

      const chevronL = new THREE.Mesh(this.unitBoxGeo, this.trapSpikeMat!);
      chevronL.scale.set(0.16, 0.04, 0.9);
      chevronL.position.set(-0.28, 0.11, 0.12);
      chevronL.rotation.y = 0.55;
      group.add(chevronL);

      const chevronR = new THREE.Mesh(this.unitBoxGeo, this.trapSpikeMat!);
      chevronR.scale.set(0.16, 0.04, 0.9);
      chevronR.position.set(0.28, 0.11, 0.12);
      chevronR.rotation.y = -0.55;
      group.add(chevronR);

      const pulseRing = new THREE.Mesh(this.trapBouncerRingGeo!, padCoreMat);
      pulseRing.position.set(0, 0.18, 0);
      group.add(pulseRing);

      this.trapGroup.add(group);
      this.trapVisuals.set(trap.id, {
        trap,
        group,
        padCoreMat,
        pulseRing,
        spikeExtend: 0,
      });
    }
  }

  placeTrap(
    kind: TrapKind,
    ownerId: string,
    pos: Vec3Like,
    yaw: number,
    squadId?: string,
  ): TrapEntity | null {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
      return null;
    }

    const id = `trap_${this.nextTrapSeq++}`;
    const trap: TrapEntity = {
      id,
      kind,
      ownerId,
      squadId,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      rotationY: Number.isFinite(yaw) ? yaw : 0,
      armed: true,
      armTimer: 0,
      cooldownSec: kind === 'spike_trap' ? 2.5 : 0.4,
      hp: 150,
      maxHp: 150,
    };

    this.traps.push(trap);
    this.trapsById.set(id, trap);
    this.createTrapVisual(trap);
    return trap;
  }

  getTraps(): TrapEntity[] {
    return [...this.traps];
  }

  /**
   * Disables traps within `radius` meters of `pos` for at least `durationSec` seconds.
   */
  disableTrapsInRadius(
    pos: Vec3Like,
    radius: number,
    durationSec: number,
    opts?: {
      excludeOwnerId?: string;
      excludeSquadId?: string;
      excludeTeamId?: TeamId;
    },
  ): number {
    if (
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z) ||
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(durationSec) ||
      durationSec <= 0
    ) {
      return 0;
    }

    let disabled = 0;
    for (let i = 0; i < this.traps.length; i++) {
      const trap = this.traps[i];
      if (trap.hp <= 0) continue;
      if (opts?.excludeOwnerId && trap.ownerId === opts.excludeOwnerId) continue;
      if (
        opts?.excludeSquadId &&
        trap.squadId &&
        trap.squadId === opts.excludeSquadId
      ) {
        continue;
      }
      if (
        opts?.excludeTeamId &&
        trap.squadId &&
        trap.squadId === opts.excludeTeamId
      ) {
        continue;
      }
      const d = dist3D(pos, { x: trap.x, y: trap.y, z: trap.z });
      if (d <= radius) {
        trap.armed = false;
        trap.armTimer = Math.max(trap.armTimer, durationSec);
        disabled += 1;
      }
    }
    return disabled;
  }

  updateTraps(dt: number): void {
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.trapAnimElapsed += safeDt;

    for (const [trapId, actorMap] of this.bouncerActorCooldowns.entries()) {
      for (const [actorId, remaining] of actorMap.entries()) {
        const next = remaining - safeDt;
        if (next <= 0) {
          actorMap.delete(actorId);
        } else {
          actorMap.set(actorId, next);
        }
      }
      if (actorMap.size === 0) {
        this.bouncerActorCooldowns.delete(trapId);
      }
    }

    for (let i = 0; i < this.traps.length; i++) {
      const trap = this.traps[i];
      if (!trap.armed) {
        trap.armTimer = Math.max(0, trap.armTimer - safeDt);
        if (trap.armTimer <= 0) {
          trap.armed = true;
          trap.armTimer = 0;
        }
      }

      const visual = this.trapVisuals.get(trap.id);
      if (!visual) continue;

      if (trap.kind === 'spike_trap') {
        if (visual.spikesGroup) {
          const targetExtend =
            !trap.armed &&
            trap.armTimer <= trap.cooldownSec &&
            trap.cooldownSec - trap.armTimer < 0.45
              ? 1
              : 0;
          const stepRate = targetExtend > visual.spikeExtend ? 18 : 6;
          visual.spikeExtend = clamp(
            visual.spikeExtend + (targetExtend - visual.spikeExtend) * Math.min(1, safeDt * stepRate),
            0,
            1,
          );
          visual.spikesGroup.position.y = -0.52 + visual.spikeExtend * 0.56;
        }
        if (visual.ledMat) {
          visual.ledMat.color.setHex(trap.armed ? 0xef4444 : 0x475569);
          visual.ledMat.emissive.setHex(trap.armed ? 0xdc2626 : 0x1e293b);
          visual.ledMat.emissiveIntensity = trap.armed ? 1.2 : 0.25;
        }
      } else {
        if (visual.padCoreMat) {
          visual.padCoreMat.emissiveIntensity = trap.armed ? 1.35 : 0.15;
        }
        if (visual.pulseRing) {
          if (trap.armed) {
            const phase = (this.trapAnimElapsed * 1.6 + i * 0.37) % 1;
            visual.pulseRing.position.y = 0.14 + phase * 0.62;
            const s = 0.85 + phase * 0.35;
            visual.pulseRing.scale.set(s, 1, s);
          } else {
            visual.pulseRing.position.y = 0.14;
            visual.pulseRing.scale.set(0.85, 1, 0.85);
          }
        }
      }
    }
  }

  checkTrapTriggers(actors: CombatActor[]): number {
    if (!actors || actors.length === 0 || this.traps.length === 0) return 0;

    let triggerCount = 0;
    const spikeHalfFootprint = GRID_XZ * 0.5;
    const bouncerTriggerRadius = 1.85;

    for (let i = 0; i < this.traps.length; i++) {
      const trap = this.traps[i];
      if (trap.hp <= 0) continue;

      if (trap.kind === 'spike_trap') {
        if (!trap.armed) continue;

        const victims: CombatActor[] = [];
        for (let a = 0; a < actors.length; a++) {
          const actor = actors[a];
          if (!actor.alive) continue;
          if (actor.id === trap.ownerId) continue;
          if (trap.squadId && actor.squadId && actor.squadId === trap.squadId) {
            continue;
          }

          if (
            Math.abs(actor.position.x - trap.x) <= spikeHalfFootprint &&
            Math.abs(actor.position.z - trap.z) <= spikeHalfFootprint &&
            actor.position.y >= trap.y - 0.6 &&
            actor.position.y <= trap.y + GRID_Y * 0.85
          ) {
            victims.push(actor);
          }
        }

        if (victims.length > 0) {
          trap.armed = false;
          trap.armTimer = trap.cooldownSec;
          const visual = this.trapVisuals.get(trap.id);
          if (visual) {
            visual.spikeExtend = 1.0;
            if (visual.spikesGroup) {
              visual.spikesGroup.position.y = 0.04;
            }
          }

          const trapPos = { x: trap.x, y: trap.y, z: trap.z };
          this.eventBus.emit('vfx:trap_trigger', {
            position: trapPos,
            kind: 'spike_trap',
          });
          this.eventBus.emit('sound:play', {
            id: 'trap_snap',
            position: trapPos,
            spatial: true,
          });

          for (let v = 0; v < victims.length; v++) {
            const victim = victims[v];
            const dmg = SPIKE_TRAP_DAMAGE;
            const overshieldBefore = Math.max(0, victim.overshield ?? 0);
            const overshieldDmg = Math.min(overshieldBefore, dmg);
            const afterOs = dmg - overshieldDmg;
            const shieldBefore = Math.max(0, victim.shield);
            const shieldDmg = Math.min(shieldBefore, afterOs);
            const remaining = afterOs - shieldDmg;
            const hpDmg = Math.min(Math.max(0, victim.hp), remaining);
            const isElimination = victim.hp - hpDmg <= 0;

            if (victim.overshield !== undefined) {
              victim.overshield = Math.max(0, victim.overshield - overshieldDmg);
            }
            victim.shield = Math.max(0, victim.shield - shieldDmg);
            victim.hp = Math.max(0, victim.hp - hpDmg);
            if (victim.hp <= 0) {
              victim.alive = false;
            }

            const ev: DamageEvent = {
              targetId: victim.id,
              attackerId: trap.ownerId,
              attackerName:
                trap.ownerId === 'player' ? 'Spike Trap' : 'Enemy Spike Trap',
              weaponId: 'pickaxe',
              rarity: 'rare',
              damage: dmg,
              hpDamage: hpDmg,
              shieldDamage: shieldDmg,
              isHeadshot: false,
              isElimination,
              hitPoint: {
                x: victim.position.x,
                y: victim.position.y + 0.45,
                z: victim.position.z,
              },
              distance: 0,
            };
            victim.onDamage?.(ev);
            this.eventBus.emit('combat:damage', ev);

            if (trap.ownerId === 'player' && victim.id !== 'player') {
              const hitShield = shieldDmg > 0 || overshieldDmg > 0;
              this.eventBus.emit('combat:hitmarker', {
                attackerId: 'player',
                isHeadshot: false,
                isShield: hitShield,
                isElimination,
              });
              this.eventBus.emit('ui:damage_number', {
                id: `trap_dmg_${this.trapDmgSeq++}`,
                worldPos: ev.hitPoint,
                amount: dmg,
                isShield: hitShield && hpDmg === 0,
                isHeadshot: false,
                timestamp: Date.now(),
              });
            }
          }

          triggerCount += 1;
        }
      } else if (trap.kind === 'bouncer_pad') {
        if (!trap.armed) continue;
        let actorMap = this.bouncerActorCooldowns.get(trap.id);
        const fwdX = Math.sin(trap.rotationY);
        const fwdZ = Math.cos(trap.rotationY);
        const trapPos = { x: trap.x, y: trap.y, z: trap.z };
        let launchedAny = false;

        for (let a = 0; a < actors.length; a++) {
          const actor = actors[a];
          if (!actor.alive) continue;
          if ((actorMap?.get(actor.id) ?? 0) > 0) continue;

          const horiz = Math.hypot(
            actor.position.x - trap.x,
            actor.position.z - trap.z,
          );
          if (
            horiz > bouncerTriggerRadius ||
            actor.position.y < trap.y - 0.6 ||
            actor.position.y > trap.y + 2.2
          ) {
            continue;
          }

          const impulse: Vec3Like = {
            x: fwdX * BOUNCER_IMPULSE_FWD,
            y: BOUNCER_IMPULSE_Y,
            z: fwdZ * BOUNCER_IMPULSE_FWD,
          };
          actor.fallImmune = true;
          if (actor.onImpulse) {
            actor.onImpulse(impulse, true);
          } else if (actor.velocity) {
            actor.velocity.x += impulse.x;
            actor.velocity.y = Math.max(actor.velocity.y, 0) + impulse.y;
            actor.velocity.z += impulse.z;
          }

          if (!actorMap) {
            actorMap = new Map<string, number>();
            this.bouncerActorCooldowns.set(trap.id, actorMap);
          }
          actorMap.set(actor.id, trap.cooldownSec);
          launchedAny = true;
          triggerCount += 1;
        }

        if (launchedAny) {
          this.eventBus.emit('vfx:trap_trigger', {
            position: trapPos,
            kind: 'bouncer_pad',
          });
          this.eventBus.emit('sound:play', {
            id: 'bouncer_launch',
            position: trapPos,
            spatial: true,
          });
        }
      }
    }

    return triggerCount;
  }

  private ensureTurretSharedAssets(): void {
    if (!this.turretBaseGeo) {
      this.turretBaseGeo = new THREE.CylinderGeometry(0.32, 0.44, 0.16, 8);
      this.turretSharedGeos.push(this.turretBaseGeo);
    }
    if (!this.turretLegGeo) {
      this.turretLegGeo = new THREE.BoxGeometry(0.11, 0.12, 0.62);
      this.turretSharedGeos.push(this.turretLegGeo);
    }
    if (!this.turretColumnGeo) {
      this.turretColumnGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.68, 8);
      this.turretSharedGeos.push(this.turretColumnGeo);
    }
    if (!this.turretBarrelGeo) {
      this.turretBarrelGeo = new THREE.CylinderGeometry(0.038, 0.044, 0.68, 8);
      this.turretBarrelGeo.rotateX(Math.PI * 0.5);
      this.turretSharedGeos.push(this.turretBarrelGeo);
    }
    if (!this.turretRingGeo) {
      this.turretRingGeo = new THREE.TorusGeometry(0.46, 0.036, 8, 24);
      this.turretRingGeo.rotateX(Math.PI * 0.5);
      this.turretSharedGeos.push(this.turretRingGeo);
    }
    if (!this.turretMuzzleGeo) {
      this.turretMuzzleGeo = new THREE.SphereGeometry(0.09, 8, 8);
      this.turretSharedGeos.push(this.turretMuzzleGeo);
    }
    if (!this.turretDarkMetalMat) {
      this.turretDarkMetalMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.36,
        metalness: 0.78,
      });
      this.turretSharedMats.push(this.turretDarkMetalMat);
    }
    if (!this.turretTrimMetalMat) {
      this.turretTrimMetalMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.28,
        metalness: 0.86,
      });
      this.turretSharedMats.push(this.turretTrimMetalMat);
    }
    if (!this.turretFlashMat) {
      this.turretFlashMat = new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.9,
      });
      this.turretSharedMats.push(this.turretFlashMat);
    }
  }

  private createTurretVisual(turret: TurretEntity): void {
    this.ensureTurretSharedAssets();
    const isFriendlyAccent = turret.ownerId === 'player';
    const ledHex = isFriendlyAccent ? 0x22d3ee : 0xf97316;

    const group = new THREE.Group();
    group.name = `AutoTurret_${turret.id}`;
    group.position.set(turret.x, turret.y, turret.z);

    const ledMat = new THREE.MeshStandardMaterial({
      color: ledHex,
      emissive: ledHex,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.32,
      metalness: 0.72,
    });

    const baseHub = new THREE.Mesh(this.turretBaseGeo!, this.turretDarkMetalMat!);
    baseHub.position.y = 0.08;
    baseHub.castShadow = true;
    baseHub.receiveShadow = true;
    group.add(baseHub);

    for (let k = 0; k < 3; k++) {
      const ang = (k * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(this.turretLegGeo!, this.turretTrimMetalMat!);
      leg.position.set(Math.sin(ang) * 0.42, 0.1, Math.cos(ang) * 0.42);
      leg.rotation.y = ang;
      leg.rotation.x = 0.24;
      leg.castShadow = true;
      group.add(leg);
    }

    const baseRing = new THREE.Mesh(this.turretRingGeo!, ledMat);
    baseRing.position.y = 0.06;
    group.add(baseRing);

    const column = new THREE.Mesh(this.turretColumnGeo!, this.turretDarkMetalMat!);
    column.position.y = 0.48;
    column.castShadow = true;
    group.add(column);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.88;
    headGroup.rotation.y = turret.yaw;

    const housing = new THREE.Mesh(this.unitBoxGeo, bodyMat);
    housing.scale.set(0.56, 0.34, 0.62);
    housing.castShadow = true;
    headGroup.add(housing);

    const visor = new THREE.Mesh(this.unitBoxGeo, ledMat);
    visor.scale.set(0.38, 0.09, 0.12);
    visor.position.set(0, 0.18, 0.2);
    headGroup.add(visor);

    const drum = new THREE.Mesh(this.unitBoxGeo, this.turretTrimMetalMat!);
    drum.scale.set(0.42, 0.2, 0.26);
    drum.position.set(0, -0.04, -0.34);
    headGroup.add(drum);

    const barrelsGroup = new THREE.Group();
    for (const side of [-0.14, 0.14]) {
      const barrel = new THREE.Mesh(this.turretBarrelGeo!, this.turretTrimMetalMat!);
      barrel.position.set(side, 0.01, 0.5);
      barrel.castShadow = true;
      barrelsGroup.add(barrel);

      const collar = new THREE.Mesh(this.unitBoxGeo, ledMat);
      collar.scale.set(0.08, 0.08, 0.08);
      collar.position.set(side, 0.01, 0.78);
      barrelsGroup.add(collar);
    }

    const muzzleFlashMesh = new THREE.Mesh(this.turretMuzzleGeo!, this.turretFlashMat!);
    muzzleFlashMesh.position.set(0, 0.01, 0.88);
    muzzleFlashMesh.visible = false;
    barrelsGroup.add(muzzleFlashMesh);

    headGroup.add(barrelsGroup);
    group.add(headGroup);

    this.turretGroup.add(group);
    this.turretVisuals.set(turret.id, {
      turret,
      group,
      headGroup,
      barrelsGroup,
      ledMat,
      bodyMat,
      hitFlashTimer: 0,
      recoilTimer: 0,
      muzzleFlashTimer: 0,
      muzzleFlashMesh,
    });
  }

  private removeTurretInternal(turretId: string): void {
    const turret = this.turretsById.get(turretId);
    if (turret) {
      this.turretsById.delete(turretId);
      const idx = this.turrets.indexOf(turret);
      if (idx !== -1) {
        this.turrets.splice(idx, 1);
      }
    }
    const visual = this.turretVisuals.get(turretId);
    if (visual) {
      this.turretGroup.remove(visual.group);
      visual.ledMat.dispose();
      visual.bodyMat.dispose();
      this.turretVisuals.delete(turretId);
    }
  }

  private updateTurretVisuals(dt: number, elapsed: number): void {
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.turretAnimElapsed = Number.isFinite(elapsed)
      ? elapsed
      : this.turretAnimElapsed + safeDt;

    for (const visual of this.turretVisuals.values()) {
      const t = visual.turret;
      visual.headGroup.rotation.y = t.yaw;

      if (visual.hitFlashTimer > 0) {
        visual.hitFlashTimer = Math.max(0, visual.hitFlashTimer - safeDt);
        visual.bodyMat.color.setHex(0xffffff);
      } else {
        visual.bodyMat.color.setHex(0x334155);
      }

      if (visual.recoilTimer > 0) {
        visual.recoilTimer = Math.max(0, visual.recoilTimer - safeDt);
        visual.barrelsGroup.position.z = -0.09 * (visual.recoilTimer / 0.09);
      } else {
        visual.barrelsGroup.position.z = 0;
      }

      if (visual.muzzleFlashTimer > 0) {
        visual.muzzleFlashTimer = Math.max(0, visual.muzzleFlashTimer - safeDt);
        visual.muzzleFlashMesh.visible = visual.muzzleFlashTimer > 0;
      } else {
        visual.muzzleFlashMesh.visible = false;
      }

      visual.ledMat.emissiveIntensity =
        1.25 + Math.sin(this.turretAnimElapsed * 5.2) * 0.35;
    }
  }

  private isFriendlyTurretActor(
    turret: TurretEntity,
    actor: CombatActor,
  ): boolean {
    if (actor.id === turret.ownerId) return true;
    if (
      turret.squadId &&
      (actor.squadId === turret.squadId || actor.teamId === turret.squadId)
    ) {
      return true;
    }
    if (
      turret.teamId &&
      (actor.teamId === turret.teamId || actor.squadId === turret.teamId)
    ) {
      return true;
    }
    return false;
  }

  deployAutoTurret(
    pos: Vec3Like,
    ownerId: string,
    squadId?: string,
    teamId?: TeamId,
  ): TurretEntity {
    const x = Number.isFinite(pos.x) ? pos.x : 0;
    const z = Number.isFinite(pos.z) ? pos.z : 0;
    const y = Number.isFinite(pos.y) ? pos.y : this.terrain.getHeightAt(x, z);

    const turret: TurretEntity = {
      id: `turret_${this.nextTurretSeq++}`,
      ownerId,
      ...(squadId !== undefined ? { squadId } : {}),
      ...(teamId !== undefined ? { teamId } : {}),
      x,
      y,
      z,
      yaw: 0,
      hp: TURRET_MAX_HP,
      maxHp: TURRET_MAX_HP,
      remainingSec: TURRET_DURATION_SEC,
      fireCooldown: 0,
      alive: true,
    };

    this.turrets.push(turret);
    this.turretsById.set(turret.id, turret);
    this.createTurretVisual(turret);

    const fxPos: Vec3Like = { x, y, z };
    this.eventBus.emit('vfx:turret_deploy', { position: fxPos });
    this.eventBus.emit('sound:play', {
      id: 'turret_deploy',
      position: fxPos,
      spatial: true,
    });

    return turret;
  }

  getTurrets(): TurretEntity[] {
    return [...this.turrets];
  }

  damageTurret(id: string, dmg: number): boolean {
    const turret = this.turretsById.get(id);
    if (
      !turret ||
      !turret.alive ||
      turret.hp <= 0 ||
      !Number.isFinite(dmg) ||
      dmg <= 0
    ) {
      return false;
    }

    turret.hp = Math.max(0, turret.hp - dmg);
    const pos: Vec3Like = { x: turret.x, y: turret.y + 0.65, z: turret.z };
    const visual = this.turretVisuals.get(id);
    if (visual) {
      visual.hitFlashTimer = 0.1;
    }

    this.eventBus.emit('sound:play', {
      id: 'hit_metal',
      position: pos,
      spatial: true,
    });

    if (turret.hp <= 0) {
      turret.hp = 0;
      turret.alive = false;
      this.removeTurretInternal(id);
      this.eventBus.emit('sound:play', {
        id: 'turret_destroy',
        position: pos,
        spatial: true,
      });
      return true;
    }

    return false;
  }

  updateTurrets(
    dt: number,
    actors: CombatActor[],
    hasLos?: (from: Vec3Like, to: Vec3Like) => boolean,
  ): void {
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    const fireInterval = 1 / Math.max(0.1, TURRET_FIRE_RATE);

    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const turret = this.turrets[i];
      if (!turret.alive || turret.hp <= 0) {
        turret.alive = false;
        this.removeTurretInternal(turret.id);
        continue;
      }

      turret.remainingSec -= safeDt;
      if (turret.remainingSec <= 0) {
        turret.remainingSec = 0;
        turret.alive = false;
        this.removeTurretInternal(turret.id);
        continue;
      }

      turret.fireCooldown = Math.max(0, turret.fireCooldown - safeDt);

      const turretBase: Vec3Like = { x: turret.x, y: turret.y, z: turret.z };
      const turretOrigin: Vec3Like = {
        x: turret.x,
        y: turret.y + 0.9,
        z: turret.z,
      };

      let bestActor: CombatActor | null = null;
      let bestPoint: Vec3Like | null = null;
      let bestDist = Infinity;

      for (let a = 0; a < actors.length; a++) {
        const actor = actors[a];
        if (!actor || !actor.alive || actor.isKnocked || actor.hp <= 0) continue;
        if (this.isFriendlyTurretActor(turret, actor)) continue;

        const targetPoint: Vec3Like = {
          x: actor.position.x,
          y: actor.position.y + actor.height * 0.55,
          z: actor.position.z,
        };
        const minDist = Math.min(
          dist3D(turretBase, actor.position),
          dist3D(turretOrigin, targetPoint),
        );
        if (minDist > TURRET_RANGE || minDist >= bestDist) continue;
        if (hasLos && !hasLos(turretOrigin, targetPoint)) continue;

        bestDist = minDist;
        bestActor = actor;
        bestPoint = targetPoint;
      }

      const visual = this.turretVisuals.get(turret.id);
      if (bestActor && bestPoint) {
        turret.yaw = Math.atan2(bestPoint.x - turret.x, bestPoint.z - turret.z);
        if (visual) {
          visual.headGroup.rotation.y = turret.yaw;
        }

        if (turret.fireCooldown <= 1e-6) {
          turret.fireCooldown = fireInterval;

          const dmg = TURRET_DAMAGE;
          const overshieldBefore = Math.max(0, bestActor.overshield ?? 0);
          const overshieldDmg = Math.min(overshieldBefore, dmg);
          const afterOs = dmg - overshieldDmg;
          const shieldBefore = Math.max(0, bestActor.shield);
          const shieldDmg = Math.min(shieldBefore, afterOs);
          const remaining = afterOs - shieldDmg;
          const hpDmg = Math.min(Math.max(0, bestActor.hp), remaining);
          const isElimination = bestActor.hp - hpDmg <= 0;

          if (bestActor.overshield !== undefined) {
            bestActor.overshield = Math.max(0, bestActor.overshield - overshieldDmg);
          }
          bestActor.shield = Math.max(0, bestActor.shield - shieldDmg);
          bestActor.hp = Math.max(0, bestActor.hp - hpDmg);
          if (bestActor.hp <= 0) {
            bestActor.alive = false;
          }

          const ev: DamageEvent = {
            targetId: bestActor.id,
            attackerId: turret.ownerId,
            attackerName:
              turret.ownerId === 'player' ? 'Auto-Turret' : 'Enemy Auto-Turret',
            weaponId: 'auto_turret',
            rarity: 'epic',
            damage: dmg,
            hpDamage: hpDmg,
            shieldDamage: shieldDmg,
            isHeadshot: false,
            isElimination,
            hitPoint: { ...bestPoint },
            distance: bestDist,
          };
          bestActor.onDamage?.(ev);
          this.eventBus.emit('combat:damage', ev);

          if (turret.ownerId === 'player' && bestActor.id !== 'player') {
            const hitShield = shieldDmg > 0 || overshieldDmg > 0;
            this.eventBus.emit('combat:hitmarker', {
              attackerId: 'player',
              isHeadshot: false,
              isShield: hitShield,
              isElimination,
            });
            this.eventBus.emit('ui:damage_number', {
              id: `turret_dmg_${this.turretDmgSeq++}`,
              worldPos: ev.hitPoint,
              amount: dmg,
              isShield: hitShield && hpDmg === 0,
              isHeadshot: false,
              timestamp: Date.now(),
            });
          }

          const barrelTip: Vec3Like = {
            x: turret.x + Math.sin(turret.yaw) * 0.68,
            y: turret.y + 0.9,
            z: turret.z + Math.cos(turret.yaw) * 0.68,
          };
          this.eventBus.emit('vfx:turret_laser', {
            from: barrelTip,
            to: { ...bestPoint },
          });
          this.eventBus.emit('sound:play', {
            id: 'turret_fire',
            position: barrelTip,
            spatial: true,
          });

          if (visual) {
            visual.recoilTimer = 0.09;
            visual.muzzleFlashTimer = 0.05;
            visual.muzzleFlashMesh.visible = true;
          }
        }
      } else if (safeDt > 0) {
        turret.yaw = (turret.yaw + safeDt * 0.65) % (Math.PI * 2);
        if (visual) {
          visual.headGroup.rotation.y = turret.yaw;
        }
      }
    }

    this.updateTurretVisuals(safeDt, this.turretAnimElapsed + safeDt);
    this.updateC4Visuals(safeDt, this.c4AnimElapsed + safeDt);
  }

  private ensureC4SharedAssets(): void {
    if (this.c4BodyGeo) return;

    this.c4BodyGeo = new THREE.BoxGeometry(0.28, 0.11, 0.34);
    this.c4LedGeo = new THREE.SphereGeometry(0.036, 8, 8);
    this.c4SharedGeos.push(this.c4BodyGeo, this.c4LedGeo);

    this.c4PackMat = new THREE.MeshStandardMaterial({
      color: 0x374151,
      roughness: 0.68,
      metalness: 0.25,
    });
    this.c4StrapMat = new THREE.MeshStandardMaterial({
      color: 0x4b5320,
      roughness: 0.85,
      metalness: 0.08,
    });
    this.c4AntennaMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.35,
      metalness: 0.72,
    });
    this.c4SharedMats.push(this.c4PackMat, this.c4StrapMat, this.c4AntennaMat);
  }

  private createC4Visual(entity: PlacedC4Entity): void {
    this.ensureC4SharedAssets();
    const group = new THREE.Group();
    group.name = `placed_c4_${entity.id}`;
    group.position.set(entity.x, entity.y + 0.06, entity.z);

    const body = new THREE.Mesh(this.c4BodyGeo!, this.c4PackMat!);
    body.castShadow = true;
    group.add(body);

    const strap = new THREE.Mesh(this.unitBoxGeo, this.c4StrapMat!);
    strap.scale.set(0.3, 0.125, 0.12);
    group.add(strap);

    const antenna = new THREE.Mesh(this.unitBoxGeo, this.c4AntennaMat!);
    antenna.scale.set(0.025, 0.14, 0.025);
    antenna.position.set(0.08, 0.09, -0.09);
    group.add(antenna);

    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const led = new THREE.Mesh(this.c4LedGeo!, ledMat);
    led.position.set(-0.05, 0.075, 0.06);
    group.add(led);

    this.c4Group.add(group);
    this.c4Visuals.set(entity.id, {
      entity,
      group,
      ledMat,
      blinkPhase: (this.nextC4Seq * 1.13) % (Math.PI * 2),
    });
  }

  private removeC4Internal(c4Id: string): void {
    const idx = this.placedC4s.findIndex((c) => c.id === c4Id);
    if (idx !== -1) {
      this.placedC4s[idx].alive = false;
      this.placedC4s.splice(idx, 1);
    }
    const visual = this.c4Visuals.get(c4Id);
    if (visual) {
      this.c4Group.remove(visual.group);
      visual.ledMat.dispose();
      this.c4Visuals.delete(c4Id);
    }
  }

  private updateC4Visuals(dt: number, elapsed: number): void {
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.c4AnimElapsed = Number.isFinite(elapsed)
      ? elapsed
      : this.c4AnimElapsed + safeDt;

    for (const cv of this.c4Visuals.values()) {
      const pulse = Math.sin(this.c4AnimElapsed * 9.0 + cv.blinkPhase);
      cv.ledMat.color.setHex(pulse > 0 ? 0xff2626 : 0x5c0a0a);
    }
  }

  private isActorFriendlyToC4(c4: PlacedC4Entity, actor: CombatActor): boolean {
    if (actor.id === c4.ownerId) return true;
    if (
      c4.squadId &&
      (actor.squadId === c4.squadId || actor.teamId === c4.squadId)
    ) {
      return true;
    }
    if (
      c4.teamId &&
      (actor.teamId === c4.teamId || actor.squadId === c4.teamId)
    ) {
      return true;
    }
    return false;
  }

  private distanceToPieceBounds(pos: Vec3Like, piece: BuildPiece): number {
    const bx = piece.gx * GRID_XZ;
    const by = piece.gy * GRID_Y;
    const bz = piece.gz * GRID_XZ;

    let minX = bx;
    let maxX = bx + GRID_XZ;
    let minY = by;
    let maxY = by + GRID_Y;
    let minZ = bz;
    let maxZ = bz + GRID_XZ;

    if (piece.type === 'wall') {
      if (piece.dir === 'N') {
        minZ = bz - 0.15;
        maxZ = bz + 0.15;
      } else {
        minX = bx - 0.15;
        maxX = bx + 0.15;
      }
    } else if (piece.type === 'floor') {
      minY = by - 0.15;
      maxY = by + 0.15;
    }

    const dx = pos.x < minX ? minX - pos.x : pos.x > maxX ? pos.x - maxX : 0;
    const dy = pos.y < minY ? minY - pos.y : pos.y > maxY ? pos.y - maxY : 0;
    const dz = pos.z < minZ ? minZ - pos.z : pos.z > maxZ ? pos.z - maxZ : 0;
    return Math.hypot(dx, dy, dz);
  }

  placeC4(
    pos: Vec3Like,
    ownerId: string,
    squadId?: string,
    teamId?: TeamId,
  ): PlacedC4Entity {
    const x = Number.isFinite(pos.x) ? pos.x : 0;
    const z = Number.isFinite(pos.z) ? pos.z : 0;
    const y = Number.isFinite(pos.y) ? pos.y : this.terrain.getHeightAt(x, z);

    const ownerC4s = this.placedC4s.filter(
      (c) => c.alive && c.ownerId === ownerId,
    );
    while (ownerC4s.length >= MAX_ACTIVE_C4_PER_PLAYER) {
      const oldest = ownerC4s.shift()!;
      this.removeC4Internal(oldest.id);
    }

    const entity: PlacedC4Entity = {
      id: `c4_${this.nextC4Seq++}`,
      ownerId,
      ...(squadId !== undefined ? { squadId } : {}),
      ...(teamId !== undefined ? { teamId } : {}),
      x,
      y,
      z,
      alive: true,
    };

    this.placedC4s.push(entity);
    this.createC4Visual(entity);

    this.eventBus.emit('sound:play', {
      id: 'c4_plant',
      position: { x, y, z },
      spatial: true,
    });

    return { ...entity };
  }

  getPlacedC4(ownerId?: string): PlacedC4Entity[] {
    if (ownerId !== undefined) {
      return this.placedC4s
        .filter((c) => c.alive && c.ownerId === ownerId)
        .map((c) => ({ ...c }));
    }
    return this.placedC4s.filter((c) => c.alive).map((c) => ({ ...c }));
  }

  detonateC4ForOwner(
    ownerId: string,
    actors: CombatActor[],
  ): { blasts: number; hits: number; buildsDestroyed: number } {
    const owned = this.placedC4s.filter(
      (c) => c.alive && c.ownerId === ownerId,
    );
    if (owned.length === 0) {
      return { blasts: 0, hits: 0, buildsDestroyed: 0 };
    }

    const C4_RADIUS = 5.5;
    const C4_ACTOR_DMG = 90;
    const C4_STRUCT_DMG = 320;

    let blasts = 0;
    let hits = 0;
    let buildsDestroyed = 0;

    for (let cIdx = 0; cIdx < owned.length; cIdx++) {
      const c4 = owned[cIdx];
      c4.alive = false;
      this.removeC4Internal(c4.id);
      blasts += 1;

      const blastPos: Vec3Like = { x: c4.x, y: c4.y, z: c4.z };
      this.eventBus.emit('vfx:c4_blast', {
        position: blastPos,
        radius: C4_RADIUS,
      });
      this.eventBus.emit('sound:play', {
        id: 'c4_detonate',
        position: blastPos,
        volume: 0.9,
        spatial: true,
      });

      const piecesSnapshot = [...this.piecesArray];
      for (let pIdx = 0; pIdx < piecesSnapshot.length; pIdx++) {
        const piece = piecesSnapshot[pIdx];
        if (!this.piecesById.has(piece.id)) continue;
        const center = this.getPieceWorldCenter(piece);
        if (
          this.distanceToPieceBounds(blastPos, piece) <= C4_RADIUS ||
          dist3D(blastPos, center) <= C4_RADIUS
        ) {
          const res = this.damagePiece(piece.id, C4_STRUCT_DMG);
          if (res.destroyed) {
            buildsDestroyed += 1;
          }
        }
      }

      const turretSnapshot = [...this.turrets];
      for (let tIdx = 0; tIdx < turretSnapshot.length; tIdx++) {
        const turret = turretSnapshot[tIdx];
        if (!turret.alive || turret.hp <= 0) continue;
        if (turret.ownerId === ownerId) continue;
        if (
          c4.squadId &&
          (turret.squadId === c4.squadId || turret.teamId === c4.squadId)
        ) {
          continue;
        }
        if (
          c4.teamId &&
          (turret.teamId === c4.teamId || turret.squadId === c4.teamId)
        ) {
          continue;
        }
        const td = dist3D(blastPos, { x: turret.x, y: turret.y + 0.5, z: turret.z });
        if (td <= C4_RADIUS) {
          this.damageTurret(turret.id, C4_STRUCT_DMG);
        }
      }

      for (let aIdx = 0; aIdx < actors.length; aIdx++) {
        const actor = actors[aIdx];
        if (!actor.alive || actor.hp <= 0) continue;
        if (this.isActorFriendlyToC4(c4, actor)) continue;

        const bodyCenter: Vec3Like = {
          x: actor.position.x,
          y: actor.position.y + 0.9,
          z: actor.position.z,
        };
        const d = Math.min(
          dist3D(blastPos, actor.position),
          dist3D(blastPos, bodyCenter),
        );
        if (d > C4_RADIUS) continue;

        const dmg = C4_ACTOR_DMG;
        const overshieldBefore = Math.max(0, actor.overshield ?? 0);
        const overshieldDmg = Math.min(overshieldBefore, dmg);
        const afterOs = dmg - overshieldDmg;
        const shieldBefore = Math.max(0, actor.shield);
        const shieldDmg = Math.min(shieldBefore, afterOs);
        const remaining = afterOs - shieldDmg;
        const hpDmg = Math.min(Math.max(0, actor.hp), remaining);
        const isElimination = actor.hp - hpDmg <= 0;

        if (actor.overshield !== undefined) {
          actor.overshield = Math.max(0, actor.overshield - overshieldDmg);
        }
        actor.shield = Math.max(0, actor.shield - shieldDmg);
        actor.hp = Math.max(0, actor.hp - hpDmg);
        if (actor.hp <= 0) {
          actor.alive = false;
        }

        const ev: DamageEvent = {
          targetId: actor.id,
          attackerId: ownerId,
          attackerName: ownerId === 'player' ? 'Player' : ownerId,
          weaponId: 'remote_c4',
          rarity: 'epic',
          damage: dmg,
          hpDamage: hpDmg,
          shieldDamage: shieldDmg,
          isHeadshot: false,
          isElimination,
          hitPoint: bodyCenter,
          distance: d,
        };
        actor.onDamage?.(ev);
        this.eventBus.emit('combat:damage', ev);
        hits += 1;

        if (ownerId === 'player' && actor.id !== 'player') {
          const hitShield = shieldDmg > 0 || overshieldDmg > 0;
          this.eventBus.emit('combat:hitmarker', {
            attackerId: 'player',
            isHeadshot: false,
            isShield: hitShield,
            isElimination,
          });
          this.eventBus.emit('ui:damage_number', {
            id: `c4_dmg_${this.c4DmgSeq++}`,
            worldPos: bodyCenter,
            amount: dmg,
            isShield: hitShield && hpDmg === 0,
            isHeadshot: false,
            timestamp: Date.now(),
          });
        }
      }
    }

    return { blasts, hits, buildsDestroyed };
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

  repairPiece(
    pieceId: string,
    availableMats?: number,
  ): { repaired: boolean; cost: number; hpRestored: number; piece?: BuildPiece } {
    const piece = this.piecesById.get(pieceId);
    if (!piece || piece.hp <= 0 || piece.hp >= piece.maxHp - 0.01) {
      return { repaired: false, cost: 0, hpRestored: 0, piece };
    }

    const missingHp = piece.maxHp - piece.hp;
    const fullCost = Math.max(
      1,
      Math.ceil((missingHp / Math.max(1, piece.targetMaxHp)) * BUILD_COST),
    );

    let cost = fullCost;
    let hpRestored = missingHp;

    if (availableMats !== undefined) {
      if (availableMats <= 0) {
        return { repaired: false, cost: 0, hpRestored: 0, piece };
      }
      if (availableMats < fullCost) {
        cost = availableMats;
        hpRestored = Math.max(1, Math.round(missingHp * (availableMats / fullCost)));
      }
    }

    piece.hp = Math.min(piece.maxHp, piece.hp + hpRestored);

    const visual = this.visualsById.get(pieceId);
    if (visual) {
      visual.hitFlashTimer = 0.12;
      visual.popAge = 0.05;
    }

    const center = this.getPieceWorldCenter(piece);
    this.eventBus.emit('sound:play', {
      id: 'build_repair',
      position: center,
      spatial: true,
    });
    this.eventBus.emit('vfx:build_pop', {
      position: center,
      material: piece.material,
      pieceType: piece.type,
    });

    return { repaired: true, cost, hpRestored, piece };
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

    for (const tv of this.trapVisuals.values()) {
      this.trapGroup.remove(tv.group);
      tv.ledMat?.dispose();
      tv.padCoreMat?.dispose();
    }
    this.trapGroup.clear();
    this.trapVisuals.clear();
    this.traps = [];
    this.trapsById.clear();
    this.bouncerActorCooldowns.clear();

    for (const tv of this.turretVisuals.values()) {
      this.turretGroup.remove(tv.group);
      tv.ledMat.dispose();
      tv.bodyMat.dispose();
    }
    this.turretGroup.clear();
    this.turretVisuals.clear();
    this.turrets = [];
    this.turretsById.clear();

    for (const c4 of this.placedC4s) {
      c4.alive = false;
    }
    for (const cv of this.c4Visuals.values()) {
      this.c4Group.remove(cv.group);
      cv.ledMat.dispose();
    }
    this.c4Group.clear();
    this.c4Visuals.clear();
    this.placedC4s = [];

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
    for (let i = 0; i < this.trapSharedGeos.length; i++) {
      this.trapSharedGeos[i].dispose();
    }
    this.trapSharedGeos = [];
    for (let i = 0; i < this.trapSharedMats.length; i++) {
      this.trapSharedMats[i].dispose();
    }
    this.trapSharedMats = [];
    this.trapPlateMat = null;
    this.trapTrimMat = null;
    this.trapSpikeMat = null;
    this.trapSpikeGeo = null;
    this.trapBouncerRingGeo = null;

    for (let i = 0; i < this.turretSharedGeos.length; i++) {
      this.turretSharedGeos[i].dispose();
    }
    this.turretSharedGeos = [];
    for (let i = 0; i < this.turretSharedMats.length; i++) {
      this.turretSharedMats[i].dispose();
    }
    this.turretSharedMats = [];
    this.turretBaseGeo = null;
    this.turretLegGeo = null;
    this.turretColumnGeo = null;
    this.turretBarrelGeo = null;
    this.turretRingGeo = null;
    this.turretMuzzleGeo = null;
    this.turretDarkMetalMat = null;
    this.turretTrimMetalMat = null;
    this.turretFlashMat = null;

    for (let i = 0; i < this.c4SharedGeos.length; i++) {
      this.c4SharedGeos[i].dispose();
    }
    this.c4SharedGeos = [];
    for (let i = 0; i < this.c4SharedMats.length; i++) {
      this.c4SharedMats[i].dispose();
    }
    this.c4SharedMats = [];
    this.c4PackMat = null;
    this.c4StrapMat = null;
    this.c4AntennaMat = null;
    this.c4BodyGeo = null;
    this.c4LedGeo = null;

    this.previewMeshMatValid.dispose();
    this.previewMeshMatInvalid.dispose();
    this.previewWireMatValid.dispose();
    this.previewWireMatInvalid.dispose();
    for (let i = 0; i < this.editTileMats.length; i++) {
      this.editTileMats[i].dispose();
    }
    this.scene.remove(this.rootGroup);
    this.scene.remove(this.trapGroup);
    this.scene.remove(this.turretGroup);
    this.scene.remove(this.c4Group);
    this.scene.remove(this.previewGroup);
    this.scene.remove(this.editGridGroup);
  }
}

export { worldToGrid };
