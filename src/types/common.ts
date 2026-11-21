export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

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

export type GameModeId = 'solo' | 'zero_build' | 'blitz';

export type AugmentId =
  | 'parkour_boost'
  | 'light_fingers'
  | 'siphon_master'
  | 'aerialist'
  | 'storm_mark'
  | 'demolisher'
  | 'first_assault'
  | 'mechanic_overdrive';

export interface AugmentDef {
  id: AugmentId;
  name: string;
  subtitle: string;
  badge: string;
  accentColor: string;
}

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type CrosshairColor = '#ffffff' | '#22d3ee' | '#34eb5e' | '#f472b6' | '#ffd000';

export type CrosshairStyle = 'dynamic' | 'dot' | 'classic';

export type SpecialistRole = 'scout' | 'medic' | 'heavy';

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

export interface KeybindMap {
  buildWall: string;
  buildFloor: string;
  buildRamp: string;
  buildRoof: string;
  edit: string;
  repair: string;
  interact: string;
  map: string;
  emote: string;
  crouchSlide: string;
}

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
  visualAudio?: boolean;
  crosshairColor?: CrosshairColor;
  crosshairStyle?: CrosshairStyle;
  keybinds?: Partial<KeybindMap>;
}
