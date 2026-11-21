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

export type VehicleKind = 'hover_atv' | 'cyber_bike';

export interface VehicleEntity {
  id: string;
  kind: VehicleKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  vx: number;
  vy: number;
  vz: number;
  hp: number;
  maxHp: number;
  boostCharge: number;
  isBoosting: boolean;
  driverId: string | null;
  destroyed: boolean;
}

export type WeatherKind = 'clear' | 'golden_hour' | 'overcast' | 'rain' | 'storm_front';

export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
  sunElevation: number;
  windX: number;
  windZ: number;
}

export interface VaultEntity {
  id: string;
  poiId: string;
  bossName: string;
  x: number;
  y: number;
  z: number;
  unlocked: boolean;
  opened: boolean;
}

export interface UpgradeBenchEntity {
  id: string;
  poiId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export interface CampfireEntity {
  id: string;
  poiId: string;
  x: number;
  y: number;
  z: number;
  lit: boolean;
  remainingSec: number;
  maxDurationSec: number;
  healPerSec: number;
  radius: number;
}

export interface SlurpBarrelEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  shieldAmount: number;
  destroyed: boolean;
}

export interface RiftEntity {
  id: string;
  poiId: string;
  x: number;
  y: number;
  z: number;
  active: boolean;
  openRemainingSec: number;
  cooldownSec: number;
}

export interface CapturePointEntity {
  id: string;
  poiId: string;
  poiName: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  progress: number;
  captured: boolean;
  ownerId: string | null;
  ownerName: string | null;
}

export interface ExplosiveBarrelEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  blastRadius: number;
  blastDamage: number;
  exploded: boolean;
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
