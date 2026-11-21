import type { Rarity, Vec3Like } from './common';
import type { MusicTrackId } from './audio';
import type { WeaponId } from './weapons';

export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'crouch_idle'
  | 'crouch_walk'
  | 'jump'
  | 'fall'
  | 'skydive'
  | 'glide'
  | 'harvest'
  | 'reload'
  | 'heal'
  | 'build'
  | 'emote';

export type EmoteId =
  | 'victory_groove'
  | 'floss_wave'
  | 'take_w_hop'
  | 'robot_boogie';

export type HeadgearStyle =
  | 'none'
  | 'cap'
  | 'visor'
  | 'hood'
  | 'crown'
  | 'bandana'
  | 'helmet'
  | 'beanie';

export type BackblingStyle = 'pack' | 'cape' | 'wings' | 'shield' | 'none';

export interface SkinDef {
  id: string;
  name: string;
  rarity: Rarity;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  skinTone: string;
  hairColor: string;
  headgear: HeadgearStyle;
  backblingStyle: BackblingStyle;
}

export interface PickaxeDef {
  id: string;
  name: string;
  rarity: Rarity;
  handleColor: string;
  headColor: string;
  accentColor: string;
  style: 'classic' | 'cyber' | 'hammer' | 'scythe';
}

export interface GliderDef {
  id: string;
  name: string;
  rarity: Rarity;
  primaryColor: string;
  accentColor: string;
  style: 'wing' | 'umbrella' | 'hover' | 'jet';
}

export interface EmoteDef {
  id: EmoteId;
  name: string;
  rarity: Rarity;
  bpm: number;
  musicId: MusicTrackId;
}

export interface CharacterRenderState {
  position: Vec3Like;
  yaw: number;
  pitch: number;
  animState: AnimState;
  weaponId: WeaponId;
  isAiming: boolean;
  isFiring: boolean;
  isBuilding: boolean;
  emoteId: EmoteId | null;
  moveSpeed: number;
  grounded: boolean;
  health: number;
  shield: number;
  recoilKick: number;
  harvestSwingTimer: number;
}
