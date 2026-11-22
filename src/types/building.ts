import type { MaterialType, TrapKind, Vec3Like } from './common';

export type BuildPieceType = 'wall' | 'floor' | 'ramp' | 'roof';

export type WallDir = 'N' | 'W';

export type EditVariant =
  | 'full'
  | 'door'
  | 'window'
  | 'double_window'
  | 'arch'
  | 'half_wall'
  | 'corner'
  | 'hatch'
  | 'half_floor'
  | 'ramp_edit'
  | 'half_ramp';

export interface BuildPiece {
  id: string;
  key: string;
  type: BuildPieceType;
  material: MaterialType;
  gx: number;
  gy: number;
  gz: number;
  dir: WallDir;
  rotation: 0 | 1 | 2 | 3;
  hp: number;
  maxHp: number;
  targetMaxHp: number;
  buildProgress: number;
  ownerId: string;
  /** 9-bit mask (bits 0..8) representing removed tiles in the 3x3 edit grid */
  editMask: number;
  editVariant: EditVariant;
  createdAt: number;
}

export interface BuildPreviewState {
  valid: boolean;
  reason: 'ok' | 'no_mats' | 'blocked' | 'out_of_range';
  type: BuildPieceType;
  material: MaterialType;
  gx: number;
  gy: number;
  gz: number;
  dir: WallDir;
  rotation: 0 | 1 | 2 | 3;
  worldPos: Vec3Like;
  cost: number;
}

export interface EditModeState {
  active: boolean;
  pieceId: string | null;
  pieceType: BuildPieceType | null;
  selectedTiles: boolean[];
  hoveredTile: number;
  valid: boolean;
}

export interface EditResult {
  success: boolean;
  pieceId: string;
  editMask: number;
  variant: EditVariant;
}

export interface TrapEntity {
  id: string;
  kind: TrapKind;
  ownerId: string;
  squadId?: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  armed: boolean;
  armTimer: number;
  cooldownSec: number;
  hp: number;
  maxHp: number;
}
