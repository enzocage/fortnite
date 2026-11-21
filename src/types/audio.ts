import type { Vec3Like } from './common';

export type SoundEventId =
  | 'shot_ar'
  | 'shot_burst_ar'
  | 'shot_pump'
  | 'shot_tac'
  | 'shot_smg'
  | 'shot_sniper'
  | 'shot_pistol'
  | 'shot_rocket'
  | 'explosion'
  | 'reload'
  | 'dryfire'
  | 'pickaxe_swing'
  | 'hit_wood'
  | 'hit_brick'
  | 'hit_metal'
  | 'weakpoint_crit'
  | 'build_wood'
  | 'build_brick'
  | 'build_metal'
  | 'edit_select'
  | 'edit_confirm'
  | 'structure_break'
  | 'hitmarker'
  | 'shield_hit'
  | 'shield_break'
  | 'headshot_dink'
  | 'elimination'
  | 'chest_open'
  | 'loot_pickup'
  | 'bus_horn'
  | 'glider_deploy'
  | 'heal_start'
  | 'heal_finish'
  | 'storm_warning'
  | 'storm_tick'
  | 'footstep'
  | 'jump'
  | 'land'
  | 'ui_click'
  | 'ui_hover'
  | 'ui_play'
  | 'victory_fanfare';

export type MusicTrackId =
  | 'none'
  | 'lobby'
  | 'bus'
  | 'emote_1'
  | 'emote_2'
  | 'emote_3'
  | 'emote_4'
  | 'victory';

export interface SoundEventPayload {
  id: SoundEventId;
  position?: Vec3Like;
  volume?: number;
  pitch?: number;
  spatial?: boolean;
}
