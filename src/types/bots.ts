import type { Rarity, Vec3Like } from './common';
import type { WeaponId } from './weapons';

export type BotPersonality = 'rusher' | 'builder' | 'sniper' | 'looter';

export type BotAIState =
  | 'bus'
  | 'skydiving'
  | 'gliding'
  | 'looting'
  | 'harvesting'
  | 'rotating'
  | 'combat'
  | 'healing'
  | 'eliminated';

export interface KillFeedEntry {
  id: string;
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weaponId: WeaponId;
  rarity: Rarity;
  isHeadshot: boolean;
  isStorm: boolean;
  distance: number;
  timestamp: number;
  involvesPlayer: boolean;
}

export interface BotSummary {
  id: string;
  name: string;
  state: BotAIState;
  personality: BotPersonality;
  skinId: string;
  hp: number;
  shield: number;
  alive: boolean;
  kills: number;
  position: Vec3Like;
}
