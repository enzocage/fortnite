export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type MaterialType = 'wood' | 'brick' | 'metal';

export type AmmoType = 'light' | 'medium' | 'shells' | 'heavy' | 'rockets';

export type GamePhase =
  | 'lobby'
  | 'bus'
  | 'skydiving'
  | 'gliding'
  | 'playing'
  | 'eliminated'
  | 'victory';

export type Difficulty = 'casual' | 'standard' | 'sweaty';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type BiomeType =
  | 'ocean'
  | 'beach'
  | 'grassland'
  | 'forest'
  | 'highland'
  | 'urban'
  | 'snow'
  | 'desert'
  | 'volcanic'
  | 'cyber';

export interface GameSettings {
  sensitivity: number;
  adsSensitivity: number;
  fov: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  graphicsQuality: GraphicsQuality;
  showFps: boolean;
  invertY: boolean;
}
