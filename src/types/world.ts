import type { AmmoType, BiomeType, MaterialType, Vec3Like } from './common';
import type { ItemInstance } from './weapons';

export interface POIDef {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  radius: number;
  plateauY: number;
  biome: BiomeType;
}

export type PropKind =
  | 'tree_pine'
  | 'tree_oak'
  | 'tree_redwood'
  | 'tree_snow_pine'
  | 'tree_palm'
  | 'cactus'
  | 'rock'
  | 'obsidian_crystal'
  | 'cyber_pylon'
  | 'car'
  | 'shipping_container'
  | 'crate'
  | 'fence';

export interface LaunchPadEntity {
  id: string;
  kind: 'launch_pad' | 'geyser';
  x: number;
  y: number;
  z: number;
  radius: number;
  boostVy: number;
  boostForward: number;
}

export interface ZiplineEntity {
  id: string;
  start: Vec3Like;
  end: Vec3Like;
  speed: number;
}

export interface HarvestableProp {
  id: string;
  kind: PropKind;
  material: MaterialType;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  hp: number;
  maxHp: number;
  matYield: number;
  radius: number;
  height: number;
  destroyed: boolean;
  weakpointWorldPos?: Vec3Like;
}

export interface ChestEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  opened: boolean;
  openProgress: number;
}

export interface LootDrop {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  item?: ItemInstance;
  ammo?: { type: AmmoType; amount: number };
  materials?: { type: MaterialType; amount: number };
  settled: boolean;
  age: number;
}

export interface LootLlamaEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  hp: number;
  maxHp: number;
  opened: boolean;
}

export interface SupplyDrop {
  id: string;
  x: number;
  y: number;
  z: number;
  targetY: number;
  state: 'descending' | 'landed' | 'opened';
  hp: number;
  maxHp: number;
}

export interface StormState {
  phase: number;
  totalPhases: number;
  currentCenterX: number;
  currentCenterZ: number;
  currentRadius: number;
  nextCenterX: number;
  nextCenterZ: number;
  nextRadius: number;
  isShrinking: boolean;
  phaseTimeRemaining: number;
  phaseDuration: number;
  dps: number;
}

export interface ColliderBox {
  id: string;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  material?: MaterialType;
  tag?: string;
}

export interface TerrainQuery {
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): Vec3Like;
  isWater(x: number, z: number): boolean;
  getBiomeAt(x: number, z: number): BiomeType;
  getPOIs(): POIDef[];
  getMapTextureCanvas(): HTMLCanvasElement;
}
