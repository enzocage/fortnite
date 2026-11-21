import type {
  BannerMessage,
  BiomeType,
  BuildPieceType,
  DamageEvent,
  DamageNumberEvent,
  KillFeedEntry,
  MaterialType,
  MusicTrackId,
  SoundEventPayload,
  Vec3Like,
  WeaponId,
} from '../types';

export interface GameEventMap {
  'sound:play': SoundEventPayload;
  'music:set': { track: MusicTrackId };
  'vfx:tracer': {
    from: Vec3Like;
    to: Vec3Like;
    color?: number;
    width?: number;
  };
  'vfx:impact': {
    position: Vec3Like;
    normal: Vec3Like;
    material: 'wood' | 'brick' | 'metal' | 'dirt' | 'shield' | 'flesh' | 'shield_break';
  };
  'vfx:muzzle': {
    position: Vec3Like;
    direction: Vec3Like;
    weaponId: WeaponId;
  };
  'vfx:explosion': {
    position: Vec3Like;
    radius: number;
  };
  'vfx:elimination': {
    position: Vec3Like;
    skinColor?: string;
  };
  'vfx:build_pop': {
    position: Vec3Like;
    material: MaterialType;
    pieceType: BuildPieceType;
  };
  'vfx:chest_open': {
    position: Vec3Like;
  };
  'vfx:weakpoint': {
    propId: string;
    position: Vec3Like;
    normal: Vec3Like;
    active: boolean;
  };
  'vfx:shockwave': {
    position: Vec3Like;
    radius: number;
  };
  'vfx:splash_heal': {
    position: Vec3Like;
    radius: number;
  };
  'vfx:slide_dust': {
    position: Vec3Like;
    biome: BiomeType;
  };
  'vfx:camera_shake': {
    intensity: number;
    duration: number;
  };
  'combat:siphon': {
    amount: number;
    healthAdded: number;
    shieldAdded: number;
  };
  'ui:poi_discover': {
    poiName: string;
    subtitle: string;
  };
  'combat:damage': DamageEvent;
  'combat:hitmarker': {
    attackerId: string;
    isHeadshot: boolean;
    isShield: boolean;
    isElimination: boolean;
  };
  'combat:killfeed': KillFeedEntry;
  'ui:banner': BannerMessage;
  'ui:damage_number': DamageNumberEvent;
  'audio:noise': {
    position: Vec3Like;
    kind: 'gunfire' | 'build' | 'footstep' | 'chest';
    sourceId: string;
    radius: number;
  };
}

export type EventHandler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof GameEventMap, Set<EventHandler<never>>>();

  on<K extends keyof GameEventMap>(
    event: K,
    handler: EventHandler<GameEventMap[K]>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as EventHandler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEventMap>(
    event: K,
    handler: EventHandler<GameEventMap[K]>,
  ): void {
    this.listeners.get(event)?.delete(handler as EventHandler<never>);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as EventHandler<GameEventMap[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
