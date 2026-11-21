import { clamp, DEFAULT_SETTINGS, dist3D, EventBus, mulberry32 } from '../core';
import type {
  BiomeType,
  ChestEntity,
  GameSettings,
  MusicTrackId,
  SoundEventId,
  SoundEventPayload,
  Vec3Like,
  VehicleKind,
  WeatherKind,
} from '../types';
import { MusicSequencer } from './MusicSequencer';
import { type LoopHandle, SoundSynthesizer } from './SoundSynthesizer';

export const MAX_POLYPHONY = 24;
export const MAX_CHEST_LOOPS = 3;
export const CHEST_HUM_RADIUS = 26;

export interface BusGains {
  master: number;
  sfx: number;
  music: number;
}

export interface AudioEngineOptions {
  contextFactory?: () => AudioContext | null;
  autoBindGestureUnlock?: boolean;
}

export interface BiomeAmbienceProfile {
  noiseFilterType: BiquadFilterType;
  noiseFilterFreq: number;
  noiseFilterQ: number;
  noiseGain: number;
  droneFreq: number;
  droneHarmonicFreq: number;
  droneWave: OscillatorType;
  droneGain: number;
  stormFilterFreq: number;
  stormFilterQ: number;
  stormOverlayGain: number;
}

export interface BiomeAmbienceState {
  biome: BiomeType | null;
  inStorm: boolean;
  weather: WeatherKind;
  active: boolean;
}

export interface VehicleEngineState {
  active: boolean;
  speedKmh: number;
  isBoosting: boolean;
  kind: VehicleKind;
}

export interface WindRushState {
  active: boolean;
  filterHz: number;
  gain: number;
}

export const BIOME_AMBIENCE_PROFILES: Record<
  BiomeType,
  Omit<BiomeAmbienceProfile, 'stormOverlayGain' | 'stormFilterFreq' | 'stormFilterQ'>
> = {
  ocean: {
    noiseFilterType: 'lowpass',
    noiseFilterFreq: 420,
    noiseFilterQ: 0.7,
    noiseGain: 0.044,
    droneFreq: 55,
    droneHarmonicFreq: 82.5,
    droneWave: 'sine',
    droneGain: 0.016,
  },
  beach: {
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 580,
    noiseFilterQ: 0.8,
    noiseGain: 0.036,
    droneFreq: 65.41,
    droneHarmonicFreq: 98,
    droneWave: 'sine',
    droneGain: 0.01,
  },
  grassland: {
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 460,
    noiseFilterQ: 0.7,
    noiseGain: 0.022,
    droneFreq: 110,
    droneHarmonicFreq: 165,
    droneWave: 'sine',
    droneGain: 0.006,
  },
  forest: {
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 920,
    noiseFilterQ: 1.1,
    noiseGain: 0.028,
    droneFreq: 98,
    droneHarmonicFreq: 146.83,
    droneWave: 'triangle',
    droneGain: 0.008,
  },
  highland: {
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 680,
    noiseFilterQ: 1.6,
    noiseGain: 0.034,
    droneFreq: 130.81,
    droneHarmonicFreq: 196,
    droneWave: 'sine',
    droneGain: 0.01,
  },
  urban: {
    noiseFilterType: 'lowpass',
    noiseFilterFreq: 280,
    noiseFilterQ: 0.9,
    noiseGain: 0.024,
    droneFreq: 60,
    droneHarmonicFreq: 120,
    droneWave: 'triangle',
    droneGain: 0.014,
  },
  snow: {
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 1250,
    noiseFilterQ: 2.8,
    noiseGain: 0.038,
    droneFreq: 196,
    droneHarmonicFreq: 293.66,
    droneWave: 'sine',
    droneGain: 0.014,
  },
  desert: {
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 840,
    noiseFilterQ: 1.9,
    noiseGain: 0.032,
    droneFreq: 87.31,
    droneHarmonicFreq: 130.81,
    droneWave: 'triangle',
    droneGain: 0.01,
  },
  volcanic: {
    noiseFilterType: 'lowpass',
    noiseFilterFreq: 220,
    noiseFilterQ: 1.4,
    noiseGain: 0.046,
    droneFreq: 48,
    droneHarmonicFreq: 72,
    droneWave: 'sawtooth',
    droneGain: 0.028,
  },
  cyber: {
    noiseFilterType: 'bandpass',
    noiseFilterFreq: 540,
    noiseFilterQ: 1.8,
    noiseGain: 0.02,
    droneFreq: 110,
    droneHarmonicFreq: 165,
    droneWave: 'sawtooth',
    droneGain: 0.024,
  },
};

export function getBiomeAmbienceProfile(
  biome: BiomeType,
  inStorm: boolean,
  weather: WeatherKind = 'clear',
): BiomeAmbienceProfile {
  const base = BIOME_AMBIENCE_PROFILES[biome] ?? BIOME_AMBIENCE_PROFILES.grassland;

  let noiseFilterType = base.noiseFilterType;
  let noiseFilterFreq = base.noiseFilterFreq;
  let noiseFilterQ = base.noiseFilterQ;
  let noiseGain = base.noiseGain;
  let stormFilterFreq = 340;
  let stormFilterQ = 2.2;
  let stormOverlayGain = 0.0001;

  switch (weather) {
    case 'golden_hour':
      noiseFilterFreq = Math.max(80, base.noiseFilterFreq * 0.94);
      noiseGain = clamp(base.noiseGain * 0.92, 0.0001, 0.08);
      break;
    case 'overcast':
      noiseFilterFreq = Math.max(120, base.noiseFilterFreq * 1.08);
      noiseFilterQ = Math.max(0.6, base.noiseFilterQ * 0.95);
      noiseGain = clamp(base.noiseGain * 1.12 + 0.004, 0.0001, 0.08);
      stormFilterFreq = 310;
      stormFilterQ = 1.9;
      break;
    case 'rain':
      noiseFilterType = 'bandpass';
      noiseFilterFreq = Math.max(1350, base.noiseFilterFreq * 1.45);
      noiseFilterQ = 0.85;
      noiseGain = clamp(base.noiseGain * 1.45 + 0.022, 0.0001, 0.095);
      stormFilterFreq = 420;
      stormFilterQ = 1.8;
      stormOverlayGain = 0.012;
      break;
    case 'storm_front':
      noiseFilterType = 'bandpass';
      noiseFilterFreq = Math.max(1750, base.noiseFilterFreq * 1.75);
      noiseFilterQ = 1.15;
      noiseGain = clamp(base.noiseGain * 1.65 + 0.032, 0.0001, 0.11);
      stormFilterFreq = 500;
      stormFilterQ = 2.6;
      stormOverlayGain = 0.028;
      break;
    case 'clear':
    default:
      break;
  }

  if (inStorm) {
    if (weather === 'rain' || weather === 'storm_front') {
      noiseFilterFreq = Math.max(1200, noiseFilterFreq * 0.92);
      noiseFilterQ = Math.max(0.8, noiseFilterQ + 0.45);
      noiseGain = clamp(noiseGain * 1.12 + 0.008, 0.0001, 0.12);
      stormFilterFreq = weather === 'storm_front' ? 560 : 460;
      stormFilterQ = 2.8;
      stormOverlayGain = weather === 'storm_front' ? 0.056 : 0.048;
    } else {
      noiseFilterFreq = Math.max(120, noiseFilterFreq * 0.85);
      noiseFilterQ = Math.max(0.7, noiseFilterQ + 0.6);
      noiseGain = clamp(noiseGain * 1.15 + 0.015, 0.0001, 0.08);
      stormFilterFreq = 360;
      stormFilterQ = 2.4;
      stormOverlayGain = 0.042;
    }
  }

  return {
    ...base,
    noiseFilterType,
    noiseFilterFreq,
    noiseFilterQ,
    noiseGain,
    stormFilterFreq,
    stormFilterQ,
    stormOverlayGain,
  };
}

interface ActiveVoice {
  id: SoundEventId;
  startedAt: number;
  expiresAt: number;
  priority: number;
  panner: PannerNode | null;
}

interface ActiveChestLoop {
  handle: LoopHandle;
  panner: PannerNode | null;
}

interface BiomeAmbienceRig {
  masterGain: GainNode;
  noiseSource: AudioBufferSourceNode | null;
  noiseFilter: BiquadFilterNode | null;
  noiseGain: GainNode | null;
  droneOscA: OscillatorNode;
  droneOscB: OscillatorNode;
  droneFilter: BiquadFilterNode | null;
  droneGain: GainNode;
  stormOsc: OscillatorNode;
  stormFilter: BiquadFilterNode | null;
  stormGain: GainNode;
}

interface VehicleEngineRig {
  masterGain: GainNode;
  humFilter: BiquadFilterNode | null;
  humGain: GainNode;
  whineGain: GainNode;
  boostGain: GainNode;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  boostOsc: OscillatorNode;
}

interface WindRushRig {
  masterGain: GainNode;
  bandpassFilter: BiquadFilterNode | null;
  noiseSource: AudioBufferSourceNode;
}

/**
 * Pure gain calculation for the Master, SFX, and Music buses.
 * Clamps all inputs safely to [0, 1] and treats non-finite values as 0.
 */
export function computeBusGains(
  settings: Pick<GameSettings, 'masterVolume' | 'sfxVolume' | 'musicVolume'>,
): BusGains {
  const sanitize = (v: number): number => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);
  return {
    master: sanitize(settings.masterVolume),
    sfx: sanitize(settings.sfxVolume),
    music: sanitize(settings.musicVolume),
  };
}

export function getSoundPriority(id: SoundEventId): number {
  switch (id) {
    case 'victory_fanfare':
    case 'elimination':
    case 'kill_streak':
    case 'headshot_dink':
    case 'shield_break':
    case 'explosion':
    case 'shockwave_blast':
    case 'shot_sniper':
    case 'shot_pump':
    case 'shot_heavy_shotgun':
    case 'shot_mythic_rifle':
    case 'ui_play':
    case 'chest_open':
    case 'poi_discover':
    case 'launch_pad':
    case 'fall_damage':
    case 'vehicle_crash':
    case 'shield_bubble_deploy':
    case 'vault_unlock':
    case 'weather_thunder':
    case 'bounty_alert':
    case 'quest_complete':
    case 'rift_teleport':
    case 'augment_ready':
    case 'flag_captured':
    case 'barrel_explode':
      return 3;
    case 'footstep':
    case 'footstep_wood':
    case 'footstep_stone':
    case 'footstep_metal':
    case 'footstep_snow':
    case 'footstep_water':
    case 'footstep_sand':
    case 'ui_hover':
      return 0;
    case 'pickaxe_swing':
    case 'hit_wood':
    case 'hit_brick':
    case 'hit_metal':
    case 'loot_pickup':
    case 'dryfire':
    case 'jump':
    case 'land':
    case 'ui_click':
    case 'slide_loop':
    case 'mantle_climb':
    case 'zipline_loop':
    case 'grappler_reel':
    case 'campfire_heal':
    case 'flag_tick':
      return 1;
    case 'augment_select':
    case 'tactical_ping':
    default:
      return 2;
  }
}

export function getMaxHearDistance(id: SoundEventId): number {
  switch (id) {
    case 'campfire_heal':
      return 35;
    case 'footstep':
    case 'footstep_wood':
    case 'footstep_stone':
    case 'footstep_metal':
    case 'footstep_snow':
    case 'footstep_water':
    case 'footstep_sand':
    case 'jump':
    case 'land':
    case 'slide_loop':
    case 'mantle_climb':
      return 55;
    case 'flag_tick':
      return 60;
    case 'overshield_recharge':
      return 65;
    case 'augment_ready':
    case 'augment_select':
      return 80;
    case 'pickaxe_swing':
    case 'hit_wood':
    case 'hit_brick':
    case 'hit_metal':
    case 'reload':
    case 'dryfire':
    case 'loot_pickup':
    case 'build_repair':
    case 'grenade_bounce':
    case 'zipline_attach':
    case 'zipline_loop':
      return 85;
    case 'upgrade_weapon':
    case 'campfire_ignite':
      return 90;
    case 'slurp_barrel_break':
      return 100;
    case 'grappler_reel':
      return 110;
    case 'grappler_fire':
      return 130;
    case 'shield_bubble_deploy':
      return 140;
    case 'tactical_ping':
      return 150;
    case 'vehicle_horn':
      return 180;
    case 'vehicle_boost':
      return 190;
    case 'vehicle_crash':
    case 'vault_unlock':
    case 'flag_captured':
      return 220;
    case 'shot_sniper':
    case 'shot_rocket':
    case 'explosion':
    case 'shockwave_blast':
    case 'bus_horn':
    case 'launch_pad':
    case 'rift_teleport':
    case 'barrel_explode':
      return 240;
    case 'weather_thunder':
      return 350;
    default:
      return 175;
  }
}

/**
 * Central procedural Web Audio engine managing Master/SFX/Music buses,
 * EventBus subscriptions, 3D spatialization, chest hum proximity loops,
 * polyphony capping, and safe headless Node execution.
 */
export class AudioEngine {
  private readonly eventBus: EventBus;
  private readonly contextFactory?: () => AudioContext | null;
  private readonly musicSequencer: MusicSequencer;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly activeVoices: ActiveVoice[] = [];
  private readonly chestLoops = new Map<string, ActiveChestLoop>();

  private settings: GameSettings;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private synthesizer: SoundSynthesizer | null = null;

  private listenerPos: Vec3Like = { x: 0, y: 0, z: 0 };
  private unlocked = false;
  private paused = false;
  private disposed = false;
  private gestureListenersBound = false;
  private gestureHandler: (() => void) | null = null;

  private ambienceRig: BiomeAmbienceRig | null = null;
  private ambienceActive = false;
  private appliedBiome: BiomeType | null = null;
  private appliedInStorm = false;
  private appliedWeather: WeatherKind = 'clear';
  private desiredBiome: BiomeType | null = null;
  private desiredInStorm = false;
  private desiredWeather: WeatherKind = 'clear';

  private vehicleEngineRig: VehicleEngineRig | null = null;
  private vehicleEngineActive = false;
  private vehicleEngineSpeedKmh = 0;
  private vehicleEngineBoosting = false;
  private vehicleEngineKind: VehicleKind = 'hover_atv';

  private windRushRig: WindRushRig | null = null;
  private windRushActive = false;
  private windRushSpeedMs = 0;
  private windRushFilterHz = 0;
  private windRushGain = 0;

  constructor(
    eventBus: EventBus,
    settings: GameSettings = DEFAULT_SETTINGS,
    options?: AudioEngineOptions,
  ) {
    this.eventBus = eventBus;
    this.settings = { ...settings };
    this.contextFactory = options?.contextFactory;
    this.musicSequencer = new MusicSequencer();

    this.unsubscribers.push(
      this.eventBus.on('sound:play', (payload) => {
        this.playSound(payload);
      }),
      this.eventBus.on('music:set', (payload) => {
        this.setMusic(payload.track);
      }),
    );

    if (options?.autoBindGestureUnlock !== false) {
      this.bindGestureUnlock();
    }
  }

  /**
   * Initializes (lazily) and resumes the AudioContext after a user gesture.
   * Safe to call in environments without Web Audio (e.g., Node tests).
   */
  async unlock(): Promise<void> {
    if (this.disposed) return;
    this.unlocked = true;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        await ctx.resume();
      } catch {
        // Ignore browser autoplay rejection before valid user gesture
      }
    }

    if (ctx.state !== 'suspended') {
      this.unbindGestureUnlock();
      if (this.desiredBiome !== null) {
        this.updateBiomeAmbience(this.desiredBiome, this.desiredInStorm, this.desiredWeather);
      }
    }
  }

  isReady(): boolean {
    return !this.disposed && this.ctx !== null && this.ctx.state !== 'closed';
  }

  updateSettings(
    settings: Pick<GameSettings, 'masterVolume' | 'sfxVolume' | 'musicVolume'> | GameSettings,
  ): void {
    this.settings = {
      ...this.settings,
      ...settings,
    };
    this.applyBusGains();
    if (this.isSfxMuted()) {
      this.teardownVehicleEngine();
      this.teardownWindRush();
    }
  }

  setPaused(paused: boolean): void {
    if (this.disposed) return;
    this.paused = Boolean(paused);
    if (this.paused) {
      this.teardownVehicleEngine();
      this.teardownWindRush();
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  getSettings(): GameSettings {
    return { ...this.settings };
  }

  setMusic(track: MusicTrackId): void {
    if (this.disposed) return;
    if (!this.ctx && (this.unlocked || typeof window === 'undefined')) {
      this.ensureContext();
    }
    this.musicSequencer.setTrack(track);
  }

  getCurrentMusic(): MusicTrackId {
    return this.musicSequencer.getCurrentTrack();
  }

  updateListener(
    pos: Vec3Like,
    forward: Vec3Like,
    up: Vec3Like = { x: 0, y: 1, z: 0 },
  ): void {
    this.listenerPos = { x: pos.x, y: pos.y, z: pos.z };
    if (!this.ctx || !this.ctx.listener || this.disposed) return;

    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;

    const fLen = Math.hypot(forward.x, forward.y, forward.z);
    const fx = fLen > 1e-5 ? forward.x / fLen : 0;
    const fy = fLen > 1e-5 ? forward.y / fLen : 0;
    const fz = fLen > 1e-5 ? forward.z / fLen : -1;

    const uLen = Math.hypot(up.x, up.y, up.z);
    const ux = uLen > 1e-5 ? up.x / uLen : 0;
    const uy = uLen > 1e-5 ? up.y / uLen : 1;
    const uz = uLen > 1e-5 ? up.z / uLen : 0;

    if (listener.positionX) {
      this.setParam(listener.positionX, pos.x, now);
      this.setParam(listener.positionY, pos.y, now);
      this.setParam(listener.positionZ, pos.z, now);
    } else if (typeof listener.setPosition === 'function') {
      listener.setPosition(pos.x, pos.y, pos.z);
    }

    if (listener.forwardX) {
      this.setParam(listener.forwardX, fx, now);
      this.setParam(listener.forwardY, fy, now);
      this.setParam(listener.forwardZ, fz, now);
      this.setParam(listener.upX, ux, now);
      this.setParam(listener.upY, uy, now);
      this.setParam(listener.upZ, uz, now);
    } else if (typeof listener.setOrientation === 'function') {
      listener.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  playSound(payload: SoundEventPayload): boolean {
    if (this.disposed) return false;

    if (!this.ctx) {
      if (this.unlocked || typeof window === 'undefined') {
        this.ensureContext();
      } else {
        return false;
      }
    }

    if (!this.ctx || !this.synthesizer || !this.sfxGain) {
      return false;
    }

    if (this.ctx.state === 'closed') {
      return false;
    }

    if (this.ctx.state === 'suspended') {
      if (!this.unlocked) {
        return false;
      }
      if (typeof this.ctx.resume === 'function') {
        try {
          const res = this.ctx.resume();
          if (res && typeof res.catch === 'function') {
            res.catch(() => {});
          }
        } catch {
          // Ignore resume errors
        }
      }
    }

    const now = this.ctx.currentTime;
    this.pruneVoices(now);

    const isSpatial = payload.position !== undefined && payload.spatial !== false;
    let distanceAtten = 1.0;

    if (isSpatial && payload.position) {
      const dist = dist3D(this.listenerPos, payload.position);
      const maxDist = getMaxHearDistance(payload.id);
      if (dist > maxDist) {
        return false;
      }
      if (typeof this.ctx.createPanner !== 'function') {
        distanceAtten = clamp(1 - dist / maxDist, 0.05, 1.0);
      }
    }

    const priority = getSoundPriority(payload.id);
    if (!this.ensurePolyphonyRoom(priority)) {
      return false;
    }

    let panner: PannerNode | null = null;
    let targetNode: AudioNode = this.sfxGain;

    if (isSpatial && payload.position && typeof this.ctx.createPanner === 'function') {
      panner = this.createSpatialPanner(payload.position, 8, getMaxHearDistance(payload.id), 1.15);
      if (panner) {
        panner.connect(this.sfxGain);
        targetNode = panner;
      }
    }

    const volume = (payload.volume ?? 1.0) * distanceAtten;
    const duration = this.synthesizer.play(payload.id, targetNode, {
      volume,
      pitch: payload.pitch,
    });

    this.activeVoices.push({
      id: payload.id,
      startedAt: now,
      expiresAt: now + Math.max(0.03, duration),
      priority,
      panner,
    });

    return true;
  }

  /**
   * Maintains spatial golden hum loops for the closest unopened chests in proximity.
   */
  updateChestLoops(
    playerPos: Vec3Like,
    chests: ReadonlyArray<Pick<ChestEntity, 'id' | 'x' | 'y' | 'z' | 'opened'>>,
  ): void {
    if (this.disposed) return;

    const candidates: Array<{ chest: Pick<ChestEntity, 'id' | 'x' | 'y' | 'z' | 'opened'>; dist: number }> = [];
    for (const chest of chests) {
      if (chest.opened) continue;
      const dist = dist3D(playerPos, chest);
      if (dist <= CHEST_HUM_RADIUS) {
        candidates.push({ chest, dist });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const closest = candidates.slice(0, MAX_CHEST_LOOPS);
    const desiredIds = new Set(closest.map((c) => c.chest.id));

    for (const [id, active] of this.chestLoops.entries()) {
      if (!desiredIds.has(id)) {
        active.handle.stop();
        this.safeDisconnect(active.panner);
        this.chestLoops.delete(id);
      }
    }

    if (
      !this.ctx ||
      !this.synthesizer ||
      !this.sfxGain ||
      this.ctx.state === 'closed' ||
      (!this.unlocked && this.ctx.state === 'suspended')
    ) {
      return;
    }

    this.pruneVoices(this.ctx.currentTime);

    for (const { chest } of closest) {
      const existing = this.chestLoops.get(chest.id);
      if (existing) {
        if (existing.panner) {
          this.setPannerPosition(existing.panner, chest);
        }
        continue;
      }

      if (!this.ensurePolyphonyRoom(1)) {
        break;
      }

      const panner =
        typeof this.ctx.createPanner === 'function'
          ? this.createSpatialPanner(chest, 2.5, CHEST_HUM_RADIUS, 1.6)
          : null;
      const target: AudioNode = panner ?? this.sfxGain;
      if (panner) {
        panner.connect(this.sfxGain);
      }

      const handle = this.synthesizer.createChestHumLoop(target);
      this.chestLoops.set(chest.id, { handle, panner });
    }
  }

  /**
   * Updates the subtle procedural ambient bed (wind/ocean/lava/cyber/rain/storm)
   * for the player's current biome, storm state, and weather. Safe no-op when headless/mocked.
   */
  updateBiomeAmbience(biome: BiomeType, inStorm: boolean, weather: WeatherKind = 'clear'): void {
    if (this.disposed) return;

    this.desiredBiome = biome;
    this.desiredInStorm = inStorm;
    this.desiredWeather = weather;

    if (
      this.ambienceActive &&
      this.appliedBiome === biome &&
      this.appliedInStorm === inStorm &&
      this.appliedWeather === weather
    ) {
      return;
    }

    if (!this.ctx && (this.unlocked || typeof window === 'undefined')) {
      this.ensureContext();
    }

    if (
      !this.ctx ||
      !this.sfxGain ||
      this.ctx.state === 'closed' ||
      (!this.unlocked && this.ctx.state === 'suspended')
    ) {
      return;
    }

    this.pruneVoices(this.ctx.currentTime);

    if (!this.ambienceActive && !this.ensurePolyphonyRoom(2)) {
      return;
    }

    if (!this.ambienceRig) {
      this.ambienceRig = this.createBiomeAmbienceRig(this.ctx, this.sfxGain);
      if (!this.ambienceRig) {
        return;
      }
    }

    this.ambienceActive = true;
    this.appliedBiome = biome;
    this.appliedInStorm = inStorm;
    this.appliedWeather = weather;

    const profile = getBiomeAmbienceProfile(biome, inStorm, weather);
    this.applyBiomeAmbienceProfile(this.ctx, this.ambienceRig, profile);
  }

  getBiomeAmbienceState(): BiomeAmbienceState {
    return {
      biome: this.appliedBiome ?? this.desiredBiome,
      inStorm: this.ambienceActive ? this.appliedInStorm : this.desiredInStorm,
      weather: this.ambienceActive ? this.appliedWeather : this.desiredWeather,
      active: this.ambienceActive,
    };
  }

  /**
   * Maintains a continuous pitch-mapped dual-oscillator + bandpass hover vehicle
   * engine synthesizer loop with cyber_bike harmonic whine and boost sub-layer.
   * Cleanly ramps down and releases nodes when inactive, paused, muted, or disposed.
   */
  updateVehicleEngine(
    active: boolean,
    speedKmh: number,
    isBoosting: boolean,
    kind: VehicleKind = 'hover_atv',
  ): void {
    if (this.disposed) return;

    const cleanSpeed = Number.isFinite(speedKmh) ? clamp(speedKmh, 0, 220) : 0;
    const cleanBoosting = Boolean(isBoosting);
    const cleanKind: VehicleKind = kind === 'cyber_bike' ? 'cyber_bike' : 'hover_atv';

    if (!active || this.paused || this.isSfxMuted()) {
      this.teardownVehicleEngine();
      return;
    }

    if (!this.ctx && (this.unlocked || typeof window === 'undefined')) {
      this.ensureContext();
    }

    if (
      !this.ctx ||
      !this.sfxGain ||
      this.ctx.state === 'closed' ||
      (!this.unlocked && this.ctx.state === 'suspended')
    ) {
      this.teardownVehicleEngine();
      return;
    }

    if (
      this.vehicleEngineActive &&
      this.vehicleEngineRig &&
      Math.abs(this.vehicleEngineSpeedKmh - cleanSpeed) < 0.05 &&
      this.vehicleEngineBoosting === cleanBoosting &&
      this.vehicleEngineKind === cleanKind
    ) {
      return;
    }

    this.pruneVoices(this.ctx.currentTime);

    if (!this.vehicleEngineActive && !this.ensurePolyphonyRoom(2)) {
      return;
    }

    if (!this.vehicleEngineRig) {
      this.vehicleEngineRig = this.createVehicleEngineRig(this.ctx, this.sfxGain);
      if (!this.vehicleEngineRig) {
        return;
      }
    }

    this.vehicleEngineActive = true;
    this.vehicleEngineSpeedKmh = cleanSpeed;
    this.vehicleEngineBoosting = cleanBoosting;
    this.vehicleEngineKind = cleanKind;

    this.applyVehicleEngineParams(
      this.ctx,
      this.vehicleEngineRig,
      cleanSpeed,
      cleanBoosting,
      cleanKind,
    );
  }

  getVehicleEngineState(): VehicleEngineState {
    return {
      active: this.vehicleEngineActive,
      speedKmh: this.vehicleEngineSpeedKmh,
      isBoosting: this.vehicleEngineBoosting,
      kind: this.vehicleEngineKind,
    };
  }

  /**
   * Maintains a continuous speed-mapped skydiving/freefall wind rush synthesizer loop
   * using filtered pink/white noise modulated across ~280Hz..1600Hz.
   * Cleanly ramps down and stops/disconnects nodes when inactive, paused, muted, or disposed.
   */
  updateWindRush(active: boolean, speedMs: number): void {
    if (this.disposed) return;

    const cleanSpeed = Number.isFinite(speedMs) ? clamp(speedMs, 0, 60) : 0;

    if (!active || this.paused || this.isSfxMuted()) {
      this.teardownWindRush();
      return;
    }

    if (!this.ctx && (this.unlocked || typeof window === 'undefined')) {
      this.ensureContext();
    }

    if (
      !this.ctx ||
      !this.sfxGain ||
      this.ctx.state === 'closed' ||
      (!this.unlocked && this.ctx.state === 'suspended')
    ) {
      this.teardownWindRush();
      return;
    }

    if (
      this.windRushActive &&
      this.windRushRig &&
      Math.abs(this.windRushSpeedMs - cleanSpeed) < 0.05
    ) {
      return;
    }

    this.pruneVoices(this.ctx.currentTime);

    if (!this.windRushActive && !this.ensurePolyphonyRoom(2)) {
      return;
    }

    if (!this.windRushRig) {
      this.windRushRig = this.createWindRushRig(this.ctx, this.sfxGain);
      if (!this.windRushRig) {
        return;
      }
    }

    this.windRushActive = true;
    this.windRushSpeedMs = cleanSpeed;
    this.applyWindRushParams(this.ctx, this.windRushRig, cleanSpeed);
  }

  getWindRushState(): WindRushState {
    return {
      active: this.windRushActive,
      filterHz: this.windRushFilterHz,
      gain: this.windRushGain,
    };
  }

  getActiveVoiceCount(): number {
    if (this.ctx) {
      this.pruneVoices(this.ctx.currentTime);
    }
    return this.activeVoices.length + this.getReservedVoiceCount();
  }

  getActiveChestLoopCount(): number {
    return this.chestLoops.size;
  }

  getMaxPolyphony(): number {
    return MAX_POLYPHONY;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.unbindGestureUnlock();

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;

    this.teardownWindRush();
    this.teardownVehicleEngine();
    this.teardownBiomeAmbience();

    for (const active of this.chestLoops.values()) {
      active.handle.stop();
      this.safeDisconnect(active.panner);
    }
    this.chestLoops.clear();

    for (const voice of this.activeVoices) {
      this.safeDisconnect(voice.panner);
    }
    this.activeVoices.length = 0;

    this.musicSequencer.dispose();
    this.synthesizer?.dispose();
    this.synthesizer = null;

    this.safeDisconnect(this.sfxGain);
    this.safeDisconnect(this.musicGain);
    this.safeDisconnect(this.masterGain);
    this.safeDisconnect(this.limiter);

    if (this.ctx && this.ctx.state !== 'closed' && typeof this.ctx.close === 'function') {
      try {
        const result = this.ctx.close();
        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
      } catch {
        // Ignore teardown close errors
      }
    }

    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.limiter = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;

    const ctx = this.createAudioContext();
    if (!ctx) return null;

    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain = ctx.createGain();

    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);

    if (typeof ctx.createDynamicsCompressor === 'function') {
      try {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold?.setValueAtTime(-6, ctx.currentTime);
        comp.knee?.setValueAtTime(12, ctx.currentTime);
        comp.ratio?.setValueAtTime(8, ctx.currentTime);
        comp.attack?.setValueAtTime(0.003, ctx.currentTime);
        comp.release?.setValueAtTime(0.15, ctx.currentTime);
        this.masterGain.connect(comp);
        comp.connect(ctx.destination);
        this.limiter = comp;
      } catch {
        this.masterGain.connect(ctx.destination);
      }
    } else {
      this.masterGain.connect(ctx.destination);
    }

    this.applyBusGains();
    this.synthesizer = new SoundSynthesizer(ctx, this.sfxGain);
    this.musicSequencer.attachContext(ctx, this.musicGain);

    return ctx;
  }

  private createAudioContext(): AudioContext | null {
    if (this.contextFactory) {
      try {
        return this.contextFactory();
      } catch {
        return null;
      }
    }

    const g = globalThis as {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    };
    const AudioCtx = g.AudioContext ?? g.webkitAudioContext;
    if (typeof AudioCtx !== 'function') {
      return null;
    }

    try {
      return new AudioCtx();
    } catch {
      return null;
    }
  }

  private applyBusGains(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const gains = computeBusGains(this.settings);
    const now = this.ctx.currentTime;
    this.setParam(this.masterGain.gain, gains.master, now);
    this.setParam(this.sfxGain.gain, gains.sfx, now);
    this.setParam(this.musicGain.gain, gains.music, now);
  }

  private setParam(param: AudioParam | undefined, value: number, time: number): void {
    if (!param) return;
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(value, time);
    } else {
      param.value = value;
    }
  }

  private rampParam(
    param: AudioParam | undefined,
    value: number,
    time: number,
    duration = 0.25,
  ): void {
    if (!param) return;
    if (typeof param.linearRampToValueAtTime === 'function') {
      if (typeof param.cancelScheduledValues === 'function') {
        param.cancelScheduledValues(time);
      }
      if (typeof param.setValueAtTime === 'function') {
        param.setValueAtTime(Number.isFinite(param.value) ? param.value : value, time);
      }
      param.linearRampToValueAtTime(value, time + duration);
    } else {
      this.setParam(param, value, time);
    }
  }

  private isSfxMuted(): boolean {
    const gains = computeBusGains(this.settings);
    return gains.master <= 0.0001 || gains.sfx <= 0.0001;
  }

  private smoothParam(
    param: AudioParam | undefined,
    value: number,
    time: number,
    timeConstant = 0.055,
    fallbackDuration = 0.08,
  ): void {
    if (!param) return;
    const safeValue = Number.isFinite(value) ? Math.max(0.0001, value) : 0.0001;
    if (typeof param.setTargetAtTime === 'function') {
      try {
        if (typeof param.cancelScheduledValues === 'function') {
          param.cancelScheduledValues(time);
        }
        param.setTargetAtTime(safeValue, time, timeConstant);
        return;
      } catch {
        // Fall back to linear ramp if mock rejects setTargetAtTime
      }
    }
    this.rampParam(param, safeValue, time, fallbackDuration);
  }

  private getReservedVoiceCount(): number {
    return (
      this.chestLoops.size +
      (this.ambienceActive ? 1 : 0) +
      (this.vehicleEngineActive ? 1 : 0) +
      (this.windRushActive ? 1 : 0)
    );
  }

  private pruneVoices(now: number): void {
    for (let i = this.activeVoices.length - 1; i >= 0; i--) {
      if (now >= this.activeVoices[i].expiresAt) {
        this.safeDisconnect(this.activeVoices[i].panner);
        this.activeVoices.splice(i, 1);
      }
    }
  }

  private ensurePolyphonyRoom(incomingPriority: number): boolean {
    if (this.activeVoices.length + this.getReservedVoiceCount() < MAX_POLYPHONY) {
      return true;
    }
    if (this.activeVoices.length === 0) {
      return false;
    }

    // Find lowest-priority (and oldest among ties) active SFX voice to evict
    let victimIdx = 0;
    for (let i = 1; i < this.activeVoices.length; i++) {
      const candidate = this.activeVoices[i];
      const victim = this.activeVoices[victimIdx];
      if (
        candidate.priority < victim.priority ||
        (candidate.priority === victim.priority && candidate.startedAt < victim.startedAt)
      ) {
        victimIdx = i;
      }
    }

    const victim = this.activeVoices[victimIdx];
    if (incomingPriority === 0 && victim.priority > 0) {
      return false;
    }

    this.safeDisconnect(victim.panner);
    this.activeVoices.splice(victimIdx, 1);
    return true;
  }

  private createBiomeAmbienceRig(
    ctx: AudioContext,
    destination: AudioNode,
  ): BiomeAmbienceRig | null {
    if (typeof ctx.createGain !== 'function' || typeof ctx.createOscillator !== 'function') {
      return null;
    }

    let masterGain: GainNode | null = null;
    let noiseSource: AudioBufferSourceNode | null = null;
    let noiseFilter: BiquadFilterNode | null = null;
    let noiseGain: GainNode | null = null;
    let droneOscA: OscillatorNode | null = null;
    let droneOscB: OscillatorNode | null = null;
    let droneFilter: BiquadFilterNode | null = null;
    let droneGain: GainNode | null = null;
    let stormOsc: OscillatorNode | null = null;
    let stormFilter: BiquadFilterNode | null = null;
    let stormGain: GainNode | null = null;

    try {
      const now = ctx.currentTime;
      masterGain = ctx.createGain();
      this.setParam(masterGain.gain, 1.0, now);
      masterGain.connect(destination);

      // Filtered pink noise bed (wind / surf / thermal hiss)
      const noiseBuf = this.buildAmbienceNoiseBuffer(ctx);
      if (noiseBuf && typeof ctx.createBufferSource === 'function') {
        noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuf;
        noiseSource.loop = true;
        noiseGain = ctx.createGain();
        this.setParam(noiseGain.gain, 0.0001, now);
        noiseFilter = this.safeCreateFilter(ctx);
        if (noiseFilter) {
          noiseFilter.type = 'bandpass';
          this.setParam(noiseFilter.frequency, 500, now);
          this.setParam(noiseFilter.Q, 1.0, now);
          noiseSource.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
        } else {
          noiseSource.connect(noiseGain);
        }
        noiseGain.connect(masterGain);
        noiseSource.start(now);
      }

      // Subtle tonal harmonic drone (lava / cyber / ocean / snow aura)
      droneOscA = ctx.createOscillator();
      droneOscB = ctx.createOscillator();
      droneOscA.type = 'sine';
      droneOscB.type = 'sine';
      this.setParam(droneOscA.frequency, 110, now);
      this.setParam(droneOscB.frequency, 165, now);
      droneOscB.detune?.setValueAtTime(5, now);

      droneGain = ctx.createGain();
      this.setParam(droneGain.gain, 0.0001, now);
      droneFilter = this.safeCreateFilter(ctx);
      if (droneFilter) {
        droneFilter.type = 'lowpass';
        this.setParam(droneFilter.frequency, 420, now);
        this.setParam(droneFilter.Q, 0.8, now);
        droneOscA.connect(droneFilter);
        droneOscB.connect(droneFilter);
        droneFilter.connect(droneGain);
      } else {
        droneOscA.connect(droneGain);
        droneOscB.connect(droneGain);
      }
      droneGain.connect(masterGain);
      droneOscA.start(now);
      droneOscB.start(now);

      // Storm overlay howl/buzz (muted at 0.0001 outside storm)
      stormOsc = ctx.createOscillator();
      stormOsc.type = 'sawtooth';
      this.setParam(stormOsc.frequency, 82, now);
      stormGain = ctx.createGain();
      this.setParam(stormGain.gain, 0.0001, now);
      stormFilter = this.safeCreateFilter(ctx);
      if (stormFilter) {
        stormFilter.type = 'bandpass';
        this.setParam(stormFilter.frequency, 340, now);
        this.setParam(stormFilter.Q, 2.2, now);
        stormOsc.connect(stormFilter);
        stormFilter.connect(stormGain);
      } else {
        stormOsc.connect(stormGain);
      }
      stormGain.connect(masterGain);
      stormOsc.start(now);

      return {
        masterGain,
        noiseSource,
        noiseFilter,
        noiseGain,
        droneOscA,
        droneOscB,
        droneFilter,
        droneGain,
        stormOsc,
        stormFilter,
        stormGain,
      };
    } catch {
      this.safeDisconnect(noiseSource);
      this.safeDisconnect(noiseFilter);
      this.safeDisconnect(noiseGain);
      this.safeDisconnect(droneOscA);
      this.safeDisconnect(droneOscB);
      this.safeDisconnect(droneFilter);
      this.safeDisconnect(droneGain);
      this.safeDisconnect(stormOsc);
      this.safeDisconnect(stormFilter);
      this.safeDisconnect(stormGain);
      this.safeDisconnect(masterGain);
      return null;
    }
  }

  private applyBiomeAmbienceProfile(
    ctx: AudioContext,
    rig: BiomeAmbienceRig,
    profile: BiomeAmbienceProfile,
  ): void {
    const now = ctx.currentTime;
    try {
      if (rig.noiseFilter) {
        rig.noiseFilter.type = profile.noiseFilterType;
        this.rampParam(rig.noiseFilter.frequency, Math.max(25, profile.noiseFilterFreq), now, 0.35);
        this.rampParam(rig.noiseFilter.Q, Math.max(0.1, profile.noiseFilterQ), now, 0.35);
      }
      if (rig.noiseGain) {
        this.rampParam(rig.noiseGain.gain, Math.max(0.0001, profile.noiseGain), now, 0.35);
      }

      rig.droneOscA.type = profile.droneWave;
      rig.droneOscB.type = profile.droneWave === 'sawtooth' ? 'triangle' : profile.droneWave;
      this.rampParam(rig.droneOscA.frequency, Math.max(20, profile.droneFreq), now, 0.4);
      this.rampParam(rig.droneOscB.frequency, Math.max(20, profile.droneHarmonicFreq), now, 0.4);
      this.rampParam(rig.droneGain.gain, Math.max(0.0001, profile.droneGain), now, 0.4);
      if (rig.stormFilter) {
        this.rampParam(rig.stormFilter.frequency, Math.max(25, profile.stormFilterFreq), now, 0.35);
        this.rampParam(rig.stormFilter.Q, Math.max(0.1, profile.stormFilterQ), now, 0.35);
      }
      this.rampParam(rig.stormGain.gain, Math.max(0.0001, profile.stormOverlayGain), now, 0.3);
    } catch {
      // Gracefully tolerate incomplete AudioNode mocks
    }
  }

  private teardownBiomeAmbience(): void {
    const rig = this.ambienceRig;
    this.ambienceRig = null;
    this.ambienceActive = false;
    this.appliedBiome = null;
    this.appliedInStorm = false;
    this.appliedWeather = 'clear';
    this.desiredBiome = null;
    this.desiredInStorm = false;
    this.desiredWeather = 'clear';

    if (!rig) return;

    const stopAt = this.ctx ? this.ctx.currentTime + 0.03 : 0;
    for (const src of [rig.noiseSource, rig.droneOscA, rig.droneOscB, rig.stormOsc]) {
      if (!src) continue;
      try {
        src.stop(stopAt);
      } catch {
        // Ignore stop errors during teardown
      }
      this.safeDisconnect(src);
    }
    this.safeDisconnect(rig.noiseFilter);
    this.safeDisconnect(rig.noiseGain);
    this.safeDisconnect(rig.droneFilter);
    this.safeDisconnect(rig.droneGain);
    this.safeDisconnect(rig.stormFilter);
    this.safeDisconnect(rig.stormGain);
    this.safeDisconnect(rig.masterGain);
  }

  private createVehicleEngineRig(
    ctx: AudioContext,
    destination: AudioNode,
  ): VehicleEngineRig | null {
    if (typeof ctx.createGain !== 'function' || typeof ctx.createOscillator !== 'function') {
      return null;
    }

    let masterGain: GainNode | null = null;
    let humFilter: BiquadFilterNode | null = null;
    let humGain: GainNode | null = null;
    let whineGain: GainNode | null = null;
    let boostGain: GainNode | null = null;
    let oscA: OscillatorNode | null = null;
    let oscB: OscillatorNode | null = null;
    let boostOsc: OscillatorNode | null = null;

    try {
      const now = ctx.currentTime;
      masterGain = ctx.createGain();
      this.setParam(masterGain.gain, 0.0001, now);
      masterGain.connect(destination);

      humFilter = this.safeCreateFilter(ctx);
      if (humFilter) {
        humFilter.type = 'bandpass';
        this.setParam(humFilter.frequency, 180, now);
        this.setParam(humFilter.Q, 1.5, now);
        humFilter.connect(masterGain);
      }
      const humTarget: AudioNode = humFilter ?? masterGain;

      humGain = ctx.createGain();
      this.setParam(humGain.gain, 0.0001, now);
      humGain.connect(humTarget);

      whineGain = ctx.createGain();
      this.setParam(whineGain.gain, 0.0001, now);
      whineGain.connect(humTarget);

      boostGain = ctx.createGain();
      this.setParam(boostGain.gain, 0.0001, now);
      boostGain.connect(masterGain);

      oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      this.setParam(oscA.frequency, 78, now);
      oscA.connect(humGain);
      oscA.start(now);

      oscB = ctx.createOscillator();
      oscB.type = 'triangle';
      this.setParam(oscB.frequency, 117, now);
      oscB.detune?.setValueAtTime(5, now);
      oscB.connect(whineGain);
      oscB.start(now);

      boostOsc = ctx.createOscillator();
      boostOsc.type = 'sine';
      this.setParam(boostOsc.frequency, 39, now);
      boostOsc.connect(boostGain);
      boostOsc.start(now);

      return {
        masterGain,
        humFilter,
        humGain,
        whineGain,
        boostGain,
        oscA,
        oscB,
        boostOsc,
      };
    } catch {
      this.safeDisconnect(oscA);
      this.safeDisconnect(oscB);
      this.safeDisconnect(boostOsc);
      this.safeDisconnect(humGain);
      this.safeDisconnect(whineGain);
      this.safeDisconnect(boostGain);
      this.safeDisconnect(humFilter);
      this.safeDisconnect(masterGain);
      return null;
    }
  }

  private applyVehicleEngineParams(
    ctx: AudioContext,
    rig: VehicleEngineRig,
    speedKmh: number,
    isBoosting: boolean,
    kind: VehicleKind,
  ): void {
    const now = ctx.currentTime;
    const speedNorm = clamp(speedKmh / 145, 0, 1);
    const boostLiftHz = isBoosting ? 16 : 0;
    const kindLiftHz = kind === 'cyber_bike' ? 6 : 0;
    const baseFreq = clamp(78 + speedNorm * 110 + boostLiftHz + kindLiftHz, 78, 210);
    const harmonicFreq = Math.max(40, kind === 'cyber_bike' ? baseFreq * 3.1 : baseFreq * 1.5);
    const boostFreq = Math.max(24, baseFreq * 0.5);
    const filterFreq = Math.max(60, kind === 'cyber_bike' ? baseFreq * 2.8 : baseFreq * 1.95);
    const filterQ = kind === 'cyber_bike' ? 2.1 : 1.4;

    const humLevel = Math.max(0.0001, 0.045 + speedNorm * 0.032);
    const whineLevel = Math.max(
      0.0001,
      kind === 'cyber_bike'
        ? 0.052 + speedNorm * 0.038 + (isBoosting ? 0.015 : 0)
        : 0.022 + speedNorm * 0.018,
    );
    const boostLevel = Math.max(0.0001, isBoosting ? 0.095 + speedNorm * 0.035 : 0.0001);
    const masterLevel = Math.max(0.0001, 0.08 + speedNorm * 0.05 + (isBoosting ? 0.025 : 0));

    try {
      this.smoothParam(rig.oscA.frequency, baseFreq, now, 0.055, 0.08);
      this.smoothParam(rig.oscB.frequency, harmonicFreq, now, 0.055, 0.08);
      this.smoothParam(rig.boostOsc.frequency, boostFreq, now, 0.055, 0.08);

      if (rig.humFilter) {
        this.smoothParam(rig.humFilter.frequency, filterFreq, now, 0.06, 0.08);
        this.smoothParam(rig.humFilter.Q, filterQ, now, 0.06, 0.08);
      }

      this.smoothParam(rig.humGain.gain, humLevel, now, 0.06, 0.08);
      this.smoothParam(rig.whineGain.gain, whineLevel, now, 0.06, 0.08);
      this.smoothParam(rig.boostGain.gain, boostLevel, now, 0.05, 0.07);
      this.smoothParam(rig.masterGain.gain, masterLevel, now, 0.06, 0.08);
    } catch {
      // Gracefully tolerate incomplete AudioNode mocks
    }
  }

  private teardownVehicleEngine(): void {
    const rig = this.vehicleEngineRig;
    this.vehicleEngineRig = null;
    this.vehicleEngineActive = false;
    this.vehicleEngineSpeedKmh = 0;
    this.vehicleEngineBoosting = false;
    this.vehicleEngineKind = 'hover_atv';

    if (!rig) return;

    const now = this.ctx ? this.ctx.currentTime : 0;
    const stopAt = now + 0.05;
    try {
      this.rampParam(rig.masterGain.gain, 0.0001, now, 0.04);
      this.rampParam(rig.humGain.gain, 0.0001, now, 0.04);
      this.rampParam(rig.whineGain.gain, 0.0001, now, 0.04);
      this.rampParam(rig.boostGain.gain, 0.0001, now, 0.04);
    } catch {
      // Ignore ramp errors during teardown
    }

    for (const osc of [rig.oscA, rig.oscB, rig.boostOsc]) {
      try {
        osc.stop(stopAt);
      } catch {
        // Ignore stop errors during teardown
      }
      this.safeDisconnect(osc);
    }

    this.safeDisconnect(rig.humFilter);
    this.safeDisconnect(rig.humGain);
    this.safeDisconnect(rig.whineGain);
    this.safeDisconnect(rig.boostGain);
    this.safeDisconnect(rig.masterGain);
  }

  private createWindRushRig(
    ctx: AudioContext,
    destination: AudioNode,
  ): WindRushRig | null {
    if (typeof ctx.createGain !== 'function' || typeof ctx.createBufferSource !== 'function') {
      return null;
    }

    const noiseBuf = this.buildWindNoiseBuffer(ctx);
    if (!noiseBuf) {
      return null;
    }

    let masterGain: GainNode | null = null;
    let bandpassFilter: BiquadFilterNode | null = null;
    let noiseSource: AudioBufferSourceNode | null = null;

    try {
      const now = ctx.currentTime;
      masterGain = ctx.createGain();
      this.setParam(masterGain.gain, 0.0001, now);
      masterGain.connect(destination);

      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuf;
      noiseSource.loop = true;

      bandpassFilter = this.safeCreateFilter(ctx);
      if (bandpassFilter) {
        bandpassFilter.type = 'bandpass';
        this.setParam(bandpassFilter.frequency, 280, now);
        this.setParam(bandpassFilter.Q, 1.1, now);
        noiseSource.connect(bandpassFilter);
        bandpassFilter.connect(masterGain);
      } else {
        noiseSource.connect(masterGain);
      }

      noiseSource.start(now);

      return {
        masterGain,
        bandpassFilter,
        noiseSource,
      };
    } catch {
      this.safeDisconnect(noiseSource);
      this.safeDisconnect(bandpassFilter);
      this.safeDisconnect(masterGain);
      return null;
    }
  }

  private applyWindRushParams(
    ctx: AudioContext,
    rig: WindRushRig,
    speedMs: number,
  ): void {
    const now = ctx.currentTime;
    const speedNorm = clamp(speedMs / 60, 0, 1);
    const filterHz = clamp(280 + speedNorm * 1320, 280, 1600);
    const filterQ = 1.1 + speedNorm * 0.7;
    const gain = clamp(0.016 + Math.pow(speedNorm, 1.1) * 0.164, 0.0001, 0.2);

    this.windRushFilterHz = filterHz;
    this.windRushGain = gain;

    try {
      if (rig.bandpassFilter) {
        this.smoothParam(rig.bandpassFilter.frequency, filterHz, now, 0.06, 0.08);
        this.smoothParam(rig.bandpassFilter.Q, filterQ, now, 0.06, 0.08);
      }
      this.smoothParam(rig.masterGain.gain, gain, now, 0.06, 0.08);
    } catch {
      // Gracefully tolerate incomplete AudioNode mocks
    }
  }

  private teardownWindRush(): void {
    const rig = this.windRushRig;
    this.windRushRig = null;
    this.windRushActive = false;
    this.windRushSpeedMs = 0;
    this.windRushFilterHz = 0;
    this.windRushGain = 0;

    if (!rig) return;

    const now = this.ctx ? this.ctx.currentTime : 0;
    const stopAt = now + 0.05;
    try {
      this.rampParam(rig.masterGain.gain, 0.0001, now, 0.04);
    } catch {
      // Ignore ramp errors during teardown
    }

    try {
      rig.noiseSource.stop(stopAt);
    } catch {
      // Ignore stop errors during teardown
    }

    this.safeDisconnect(rig.noiseSource);
    this.safeDisconnect(rig.bandpassFilter);
    this.safeDisconnect(rig.masterGain);
  }

  private buildWindNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (typeof ctx.createBuffer !== 'function') return null;
    try {
      const rate = ctx.sampleRate || 44100;
      const len = Math.max(256, Math.floor(rate * 1.5));
      const buf = ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      const rand = mulberry32(0xc7f193);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = rand() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.95 * b2 + w * 0.048;
        // Blend warm pink rush with crisp white air hiss
        data[i] = clamp((b0 + b1 + b2 + w * 0.24) * 0.28, -1, 1);
      }
      // Crossfade loop seam to eliminate wrap clicks
      const fadeLen = Math.min(256, Math.floor(len / 8));
      for (let i = 0; i < fadeLen; i++) {
        const alpha = i / fadeLen;
        data[i] = data[i] * alpha + data[len - fadeLen + i] * (1 - alpha);
      }
      return buf;
    } catch {
      return null;
    }
  }

  private safeCreateFilter(ctx: AudioContext): BiquadFilterNode | null {
    if (typeof ctx.createBiquadFilter !== 'function') return null;
    try {
      return ctx.createBiquadFilter();
    } catch {
      return null;
    }
  }

  private buildAmbienceNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (typeof ctx.createBuffer !== 'function') return null;
    try {
      const rate = ctx.sampleRate || 44100;
      const len = Math.max(256, Math.floor(rate * 1.5));
      const buf = ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      const rand = mulberry32(0xa4b1e2);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = rand() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.95 * b2 + w * 0.048;
        data[i] = clamp((b0 + b1 + b2 + w * 0.12) * 0.25, -1, 1);
      }
      return buf;
    } catch {
      return null;
    }
  }

  private createSpatialPanner(
    pos: Vec3Like,
    refDistance: number,
    maxDistance: number,
    rolloffFactor: number,
  ): PannerNode | null {
    if (!this.ctx || typeof this.ctx.createPanner !== 'function') return null;
    try {
      const panner = this.ctx.createPanner();
      try {
        panner.panningModel = 'HRTF';
      } catch {
        panner.panningModel = 'equalpower';
      }
      panner.distanceModel = 'inverse';
      panner.refDistance = refDistance;
      panner.maxDistance = maxDistance;
      panner.rolloffFactor = rolloffFactor;
      this.setPannerPosition(panner, pos);
      return panner;
    } catch {
      return null;
    }
  }

  private setPannerPosition(panner: PannerNode, pos: Vec3Like): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (panner.positionX) {
      this.setParam(panner.positionX, pos.x, now);
      this.setParam(panner.positionY, pos.y, now);
      this.setParam(panner.positionZ, pos.z, now);
    } else if (typeof panner.setPosition === 'function') {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  private safeDisconnect(node: AudioNode | null | undefined): void {
    if (!node) return;
    try {
      node.disconnect();
    } catch {
      // Ignore errors from already-disconnected nodes
    }
  }

  private bindGestureUnlock(): void {
    if (
      this.gestureListenersBound ||
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function'
    ) {
      return;
    }

    this.gestureListenersBound = true;
    this.gestureHandler = () => {
      void this.unlock();
    };

    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', this.gestureHandler, opts);
    window.addEventListener('keydown', this.gestureHandler, opts);
    window.addEventListener('touchstart', this.gestureHandler, opts);
    window.addEventListener('click', this.gestureHandler, opts);
  }

  private unbindGestureUnlock(): void {
    if (
      !this.gestureListenersBound ||
      !this.gestureHandler ||
      typeof window === 'undefined' ||
      typeof window.removeEventListener !== 'function'
    ) {
      return;
    }

    const opts: EventListenerOptions = { capture: true };
    window.removeEventListener('pointerdown', this.gestureHandler, opts);
    window.removeEventListener('keydown', this.gestureHandler, opts);
    window.removeEventListener('touchstart', this.gestureHandler, opts);
    window.removeEventListener('click', this.gestureHandler, opts);
    this.gestureListenersBound = false;
    this.gestureHandler = null;
  }
}
