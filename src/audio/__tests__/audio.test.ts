import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, EventBus } from '../../core';
import type { BiomeType, ChestEntity, MusicTrackId, SoundEventId, WeatherKind } from '../../types';
import {
  AudioEngine,
  BIOME_AMBIENCE_PROFILES,
  CHEST_HUM_RADIUS,
  computeBusGains,
  getBiomeAmbienceProfile,
  getMaxHearDistance,
  getSoundPriority,
  MAX_CHEST_LOOPS,
  MAX_POLYPHONY,
  MUSIC_PATTERNS,
  MusicSequencer,
  SoundSynthesizer,
} from '../index';

const SOUND_EVENT_MAP: Record<SoundEventId, true> = {
  shot_ar: true,
  shot_burst_ar: true,
  shot_pump: true,
  shot_tac: true,
  shot_smg: true,
  shot_sniper: true,
  shot_pistol: true,
  shot_rocket: true,
  shot_heavy_shotgun: true,
  shot_mythic_rifle: true,
  explosion: true,
  reload: true,
  dryfire: true,
  pickaxe_swing: true,
  hit_wood: true,
  hit_brick: true,
  hit_metal: true,
  weakpoint_crit: true,
  build_wood: true,
  build_brick: true,
  build_metal: true,
  build_repair: true,
  edit_select: true,
  edit_confirm: true,
  structure_break: true,
  hitmarker: true,
  shield_hit: true,
  shield_break: true,
  headshot_dink: true,
  elimination: true,
  kill_streak: true,
  chest_open: true,
  loot_pickup: true,
  bus_horn: true,
  glider_deploy: true,
  launch_pad: true,
  zipline_attach: true,
  zipline_loop: true,
  slide_loop: true,
  mantle_climb: true,
  shockwave_blast: true,
  grenade_bounce: true,
  splash_heal: true,
  fall_damage: true,
  lava_burn: true,
  poi_discover: true,
  heal_start: true,
  heal_finish: true,
  storm_warning: true,
  storm_tick: true,
  footstep: true,
  footstep_wood: true,
  footstep_stone: true,
  footstep_metal: true,
  footstep_snow: true,
  footstep_water: true,
  footstep_sand: true,
  jump: true,
  land: true,
  ui_click: true,
  ui_hover: true,
  ui_play: true,
  victory_fanfare: true,
  vehicle_boost: true,
  vehicle_horn: true,
  vehicle_crash: true,
  grappler_fire: true,
  grappler_reel: true,
  shield_bubble_deploy: true,
  vault_unlock: true,
  weather_thunder: true,
  bounty_alert: true,
  upgrade_weapon: true,
  campfire_ignite: true,
  campfire_heal: true,
  slurp_barrel_break: true,
  quest_complete: true,
  overshield_recharge: true,
};

const ALL_SOUND_EVENT_IDS = Object.keys(SOUND_EVENT_MAP) as SoundEventId[];

const MUSIC_TRACK_MAP: Record<MusicTrackId, true> = {
  none: true,
  lobby: true,
  bus: true,
  emote_1: true,
  emote_2: true,
  emote_3: true,
  emote_4: true,
  emote_5: true,
  emote_6: true,
  combat_intense: true,
  victory: true,
};

const ALL_MUSIC_TRACK_IDS = Object.keys(MUSIC_TRACK_MAP) as MusicTrackId[];

const BIOME_MAP: Record<BiomeType, true> = {
  ocean: true,
  beach: true,
  grassland: true,
  forest: true,
  highland: true,
  urban: true,
  snow: true,
  desert: true,
  volcanic: true,
  cyber: true,
};

const ALL_BIOMES = Object.keys(BIOME_MAP) as BiomeType[];

const WEATHER_KIND_MAP: Record<WeatherKind, true> = {
  clear: true,
  golden_hour: true,
  overcast: true,
  rain: true,
  storm_front: true,
};

const ALL_WEATHER_KINDS = Object.keys(WEATHER_KIND_MAP) as WeatherKind[];

class MockAudioParam {
  value: number;
  events: Array<{ kind: string; value: number; time: number }> = [];

  constructor(initial = 0) {
    this.value = initial;
  }

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'set', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'linear', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    if (value <= 0) {
      throw new Error('exponentialRampToValueAtTime target must be positive');
    }
    this.value = value;
    this.events.push({ kind: 'exp', value, time });
    return this;
  }

  setTargetAtTime(target: number, startTime: number, _timeConstant: number): this {
    if (target <= 0) {
      throw new Error('setTargetAtTime target must be positive');
    }
    this.value = target;
    this.events.push({ kind: 'target', value: target, time: startTime });
    return this;
  }

  cancelScheduledValues(_time: number): this {
    return this;
  }
}

class MockAudioNode {
  connections: AudioNode[] = [];
  disconnected = false;

  connect(dest: AudioNode): AudioNode {
    this.connections.push(dest);
    return dest;
  }

  disconnect(): void {
    this.disconnected = true;
    this.connections = [];
  }
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1);
}

class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine';
  frequency = new MockAudioParam(440);
  detune = new MockAudioParam(0);
  started = false;
  stopped = false;
  startTime = 0;
  stopTime = 0;

  start(when = 0): void {
    this.started = true;
    this.startTime = when;
  }

  stop(when = 0): void {
    this.stopped = true;
    this.stopTime = when;
  }
}

class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private channels: Float32Array[];

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

class MockBufferSourceNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
  playbackRate = new MockAudioParam(1);
  loop = false;
  started = false;
  stopped = false;

  start(_when = 0, _offset = 0, _duration?: number): void {
    this.started = true;
  }

  stop(_when = 0): void {
    this.stopped = true;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new MockAudioParam(350);
  Q = new MockAudioParam(1);
}

class MockConvolverNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
}

class MockWaveShaperNode extends MockAudioNode {
  curve: Float32Array | null = null;
}

class MockPannerNode extends MockAudioNode {
  panningModel: PanningModelType = 'HRTF';
  distanceModel: DistanceModelType = 'inverse';
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  positionX = new MockAudioParam(0);
  positionY = new MockAudioParam(0);
  positionZ = new MockAudioParam(0);
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam(-24);
  knee = new MockAudioParam(30);
  ratio = new MockAudioParam(12);
  attack = new MockAudioParam(0.003);
  release = new MockAudioParam(0.25);
}

class MockAudioListener {
  positionX = new MockAudioParam(0);
  positionY = new MockAudioParam(0);
  positionZ = new MockAudioParam(0);
  forwardX = new MockAudioParam(0);
  forwardY = new MockAudioParam(0);
  forwardZ = new MockAudioParam(-1);
  upX = new MockAudioParam(0);
  upY = new MockAudioParam(1);
  upZ = new MockAudioParam(0);
}

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: AudioContextState = 'running';
  destination = new MockAudioNode() as unknown as AudioDestinationNode;
  listener = new MockAudioListener() as unknown as AudioListener;

  oscillators: MockOscillatorNode[] = [];
  bufferSources: MockBufferSourceNode[] = [];
  gains: MockGainNode[] = [];
  filters: MockBiquadFilterNode[] = [];
  convolvers: MockConvolverNode[] = [];
  panners: MockPannerNode[] = [];
  waveShapers: MockWaveShaperNode[] = [];
  compressors: MockDynamicsCompressorNode[] = [];

  createGain(): GainNode {
    const node = new MockGainNode();
    this.gains.push(node);
    return node as unknown as GainNode;
  }

  createOscillator(): OscillatorNode {
    const node = new MockOscillatorNode();
    this.oscillators.push(node);
    return node as unknown as OscillatorNode;
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    return new MockAudioBuffer(channels, length, sampleRate) as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new MockBufferSourceNode();
    this.bufferSources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    const node = new MockBiquadFilterNode();
    this.filters.push(node);
    return node as unknown as BiquadFilterNode;
  }

  createConvolver(): ConvolverNode {
    const node = new MockConvolverNode();
    this.convolvers.push(node);
    return node as unknown as ConvolverNode;
  }

  createWaveShaper(): WaveShaperNode {
    const node = new MockWaveShaperNode();
    this.waveShapers.push(node);
    return node as unknown as WaveShaperNode;
  }

  createPanner(): PannerNode {
    const node = new MockPannerNode();
    this.panners.push(node);
    return node as unknown as PannerNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    const node = new MockDynamicsCompressorNode();
    this.compressors.push(node);
    return node as unknown as DynamicsCompressorNode;
  }

  async resume(): Promise<void> {
    if (this.state === 'suspended') {
      this.state = 'running';
    }
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

describe('computeBusGains', () => {
  it('returns exact clamped [0, 1] values for valid settings', () => {
    expect(
      computeBusGains({
        masterVolume: 0.8,
        sfxVolume: 0.85,
        musicVolume: 0.55,
      }),
    ).toEqual({
      master: 0.8,
      sfx: 0.85,
      music: 0.55,
    });
  });

  it('clamps out-of-range and non-finite volumes safely', () => {
    expect(
      computeBusGains({
        masterVolume: 2.5,
        sfxVolume: -0.4,
        musicVolume: Number.NaN,
      }),
    ).toEqual({
      master: 1,
      sfx: 0,
      music: 0,
    });

    expect(
      computeBusGains({
        masterVolume: Number.POSITIVE_INFINITY,
        sfxVolume: Number.NEGATIVE_INFINITY,
        musicVolume: 1,
      }),
    ).toEqual({
      master: 0,
      sfx: 0,
      music: 1,
    });
  });
});

describe('SoundSynthesizer', () => {
  it('synthesizes all 78 SoundEventIds with valid Web Audio nodes and positive durations', () => {
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const synth = new SoundSynthesizer(ctx, dest);

    expect(mockCtx.convolvers.length).toBe(1);
    expect(ALL_SOUND_EVENT_IDS.length).toBe(78);

    for (const id of ALL_SOUND_EVENT_IDS) {
      const oscBefore = mockCtx.oscillators.length;
      const srcBefore = mockCtx.bufferSources.length;

      const duration = synth.play(id, dest, { volume: 0.9, pitch: 1.0 });

      expect(duration).toBeGreaterThan(0);
      expect(Number.isFinite(duration)).toBe(true);
      const createdSources =
        mockCtx.oscillators.length - oscBefore + (mockCtx.bufferSources.length - srcBefore);
      expect(createdSources).toBeGreaterThan(0);
    }

    synth.dispose();
  });

  it('creates bespoke multi-layered Wave 2 SFX with safe positive ramps across pitch/volume bounds', () => {
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const synth = new SoundSynthesizer(ctx, dest);

    const wave2Ids: SoundEventId[] = [
      'vehicle_boost',
      'vehicle_horn',
      'vehicle_crash',
      'grappler_fire',
      'grappler_reel',
      'shield_bubble_deploy',
      'vault_unlock',
      'weather_thunder',
      'bounty_alert',
    ];

    const durations: Partial<Record<SoundEventId, number>> = {};
    for (const id of wave2Ids) {
      const oscBefore = mockCtx.oscillators.length;
      const srcBefore = mockCtx.bufferSources.length;
      const dur = synth.play(id, dest, { volume: 1.0, pitch: 1.0 });
      durations[id] = dur;

      // Each bespoke Wave 2 synth layers >= 2 oscillators and/or noise buffers (never a 1-tone stub)
      const oscCreated = mockCtx.oscillators.length - oscBefore;
      const srcCreated = mockCtx.bufferSources.length - srcBefore;
      expect(oscCreated).toBeGreaterThanOrEqual(2);
      expect(oscCreated + srcCreated).toBeGreaterThanOrEqual(3);

      // Extreme pitch/volume bounds must never throw on exponentialRampToValueAtTime
      expect(() => synth.play(id, dest, { volume: 0.05, pitch: 0.25 })).not.toThrow();
      expect(() => synth.play(id, dest, { volume: 2.0, pitch: 4.0 })).not.toThrow();
    }

    expect(durations.weather_thunder).toBeGreaterThan(1.2);
    expect(durations.vault_unlock).toBeGreaterThan(0.7);
    expect(durations.shield_bubble_deploy).toBeGreaterThan(0.5);
    expect(durations.vehicle_boost).toBeGreaterThan(0.5);
    expect(durations.bounty_alert).toBeGreaterThan(0.4);
    expect(durations.vehicle_horn).toBeGreaterThan(0.35);
    expect(durations.grappler_reel).toBeGreaterThan(0.3);
    expect(durations.vehicle_crash).toBeGreaterThan(0.28);
    expect(durations.grappler_fire).toBeGreaterThan(0.14);

    // Every scheduled exponential ramp across all Wave 2 synths stayed strictly > 0
    for (const g of mockCtx.gains) {
      for (const ev of g.gain.events) {
        if (ev.kind === 'exp') {
          expect(ev.value).toBeGreaterThan(0);
        }
      }
    }

    synth.dispose();
  });

  it('creates bespoke multi-layered Wave 3 SFX with strictly positive ramps across pitch/volume bounds', () => {
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const synth = new SoundSynthesizer(ctx, dest);

    const wave3Ids: SoundEventId[] = [
      'upgrade_weapon',
      'campfire_ignite',
      'campfire_heal',
      'slurp_barrel_break',
      'quest_complete',
      'overshield_recharge',
    ];

    const durations: Partial<Record<SoundEventId, number>> = {};
    for (const id of wave3Ids) {
      const oscBefore = mockCtx.oscillators.length;
      const srcBefore = mockCtx.bufferSources.length;
      const gainBefore = mockCtx.gains.length;
      const dur = synth.play(id, dest, { volume: 1.0, pitch: 1.0 });
      durations[id] = dur;

      const oscCreated = mockCtx.oscillators.length - oscBefore;
      const srcCreated = mockCtx.bufferSources.length - srcBefore;
      const gainsCreated = mockCtx.gains.length - gainBefore;

      expect(oscCreated).toBeGreaterThanOrEqual(3);
      expect(oscCreated + srcCreated).toBeGreaterThanOrEqual(5);
      expect(gainsCreated).toBeGreaterThanOrEqual(4);

      if (id === 'overshield_recharge') {
        // Verify FM modulator gain connects directly into carrier oscillator frequency AudioParam
        const newOscs = mockCtx.oscillators.slice(oscBefore);
        const newGains = mockCtx.gains.slice(gainBefore);
        const fmWired = newGains.some((g) =>
          newOscs.some((o) => g.connections.includes(o.frequency as unknown as AudioNode)),
        );
        expect(fmWired).toBe(true);
      }

      // Extreme pitch/volume bounds must never throw on exponentialRampToValueAtTime
      expect(() => synth.play(id, dest, { volume: 0.05, pitch: 0.25 })).not.toThrow();
      expect(() => synth.play(id, dest, { volume: 2.0, pitch: 4.0 })).not.toThrow();
    }

    expect(durations.quest_complete).toBeGreaterThan(0.75);
    expect(durations.upgrade_weapon).toBeGreaterThan(0.55);
    expect(durations.campfire_ignite).toBeGreaterThan(0.45);
    expect(durations.overshield_recharge).toBeGreaterThan(0.45);
    expect(durations.slurp_barrel_break).toBeGreaterThan(0.4);
    expect(durations.campfire_heal).toBeGreaterThan(0.35);

    // Every scheduled exponential ramp across gains, oscillators, and filters stayed strictly > 0
    for (const g of mockCtx.gains) {
      for (const ev of g.gain.events) {
        if (ev.kind === 'exp') expect(ev.value).toBeGreaterThan(0);
      }
    }
    for (const o of mockCtx.oscillators) {
      for (const ev of o.frequency.events) {
        if (ev.kind === 'exp') expect(ev.value).toBeGreaterThan(0);
      }
    }
    for (const f of mockCtx.filters) {
      for (const ev of f.frequency.events) {
        if (ev.kind === 'exp') expect(ev.value).toBeGreaterThan(0);
      }
    }

    // Minimal Node mock without optional filter/convolver/waveshaper/buffer must still succeed
    const minimalCtx = {
      currentTime: 0,
      sampleRate: 44100,
      state: 'running',
      destination: new MockAudioNode(),
      createGain: () => new MockGainNode(),
      createOscillator: () => new MockOscillatorNode(),
      close: async () => {},
    } as unknown as AudioContext;
    const minDest = minimalCtx.createGain();
    const minSynth = new SoundSynthesizer(minimalCtx, minDest);
    for (const id of wave3Ids) {
      expect(() => minSynth.play(id, minDest, { volume: 0.9, pitch: 1.1 })).not.toThrow();
    }
    minSynth.dispose();
    synth.dispose();
  });

  it('layers gunfire sub-thump & bolt tails cleanly across pitch/volume bounds', () => {
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const synth = new SoundSynthesizer(ctx, dest);

    const gunfireIds: SoundEventId[] = [
      'shot_ar',
      'shot_burst_ar',
      'shot_pump',
      'shot_tac',
      'shot_sniper',
      'shot_heavy_shotgun',
      'shot_mythic_rifle',
    ];

    for (const id of gunfireIds) {
      const oscBefore = mockCtx.oscillators.length;
      const srcBefore = mockCtx.bufferSources.length;
      const durLow = synth.play(id, dest, { volume: 0.05, pitch: 0.5 });
      const durHigh = synth.play(id, dest, { volume: 1.5, pitch: 1.4 });
      expect(durLow).toBeGreaterThan(0);
      expect(durHigh).toBeGreaterThan(0);
      // Multi-layered gunfire must create multiple oscillator + noise voices per shot
      expect(mockCtx.oscillators.length - oscBefore).toBeGreaterThanOrEqual(4);
      expect(mockCtx.bufferSources.length - srcBefore).toBeGreaterThanOrEqual(2);
    }

    synth.dispose();
  });

  it('creates distinct synthesis profiles for surface footsteps and bespoke Wave 1 events', () => {
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const synth = new SoundSynthesizer(ctx, dest);

    const surfaceSteps: SoundEventId[] = [
      'footstep_wood',
      'footstep_stone',
      'footstep_metal',
      'footstep_snow',
      'footstep_water',
      'footstep_sand',
    ];

    const durations: Record<string, number> = {};
    for (const step of surfaceSteps) {
      const oscBefore = mockCtx.oscillators.length;
      const srcBefore = mockCtx.bufferSources.length;
      durations[step] = synth.play(step, dest);
      expect(mockCtx.oscillators.length - oscBefore).toBeGreaterThanOrEqual(1);
      expect(mockCtx.bufferSources.length - srcBefore).toBeGreaterThanOrEqual(1);
    }
    expect(durations.footstep_water).toBeGreaterThan(durations.footstep_stone);
    expect(durations.footstep_metal).toBeGreaterThan(durations.footstep_wood);

    // Metal footstep produces resonant metallic overtones >= 400Hz
    const metalStart = mockCtx.oscillators.findIndex(
      (o) => o.frequency.events[0]?.value >= 400,
    );
    expect(metalStart).toBeGreaterThanOrEqual(0);

    // Bespoke Wave 1 events
    expect(synth.play('shockwave_blast', dest)).toBeGreaterThan(0.4);
    expect(synth.play('poi_discover', dest)).toBeGreaterThan(0.8);
    expect(synth.play('kill_streak', dest)).toBeGreaterThan(0.4);
    expect(synth.play('splash_heal', dest)).toBeGreaterThan(0.25);

    synth.dispose();
  });

  it('scales weakpoint_crit pitch upwards on consecutive hits within combo window', () => {
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const synth = new SoundSynthesizer(ctx, dest);

    const firstFreqs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = mockCtx.oscillators.length;
      synth.play('weakpoint_crit', dest);
      firstFreqs.push(mockCtx.oscillators[before].frequency.events[0].value);
      expect(synth.getWeakpointCombo()).toBe(i);
      mockCtx.currentTime += 0.4;
    }

    expect(firstFreqs[1]).toBeGreaterThan(firstFreqs[0]);
    expect(firstFreqs[2]).toBeGreaterThan(firstFreqs[1]);
    expect(firstFreqs[3]).toBeGreaterThan(firstFreqs[2]);

    // Advancing past combo window resets combo back to 0
    mockCtx.currentTime += 3.0;
    const beforeReset = mockCtx.oscillators.length;
    synth.play('weakpoint_crit', dest);
    expect(synth.getWeakpointCombo()).toBe(0);
    expect(mockCtx.oscillators[beforeReset].frequency.events[0].value).toBeCloseTo(
      firstFreqs[0],
      3,
    );
  });

  it('creates and idempotently stops a chest hum loop', () => {
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const synth = new SoundSynthesizer(ctx, dest);

    const handle = synth.createChestHumLoop(dest);
    expect(mockCtx.oscillators.length).toBe(4);
    expect(mockCtx.oscillators.every((o) => o.started)).toBe(true);

    handle.stop();
    handle.stop(); // idempotent
    expect(mockCtx.oscillators.every((o) => o.stopped)).toBe(true);
  });
});

describe('MusicSequencer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('covers all 11 MusicTrackIds (10+1) with full 32-step patterns and cleanly disposes', () => {
    vi.useFakeTimers();
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const seq = new MusicSequencer(ctx, dest);

    expect(ALL_MUSIC_TRACK_IDS.length).toBe(11);
    expect(seq.getCurrentTrack()).toBe('none');

    for (const track of ALL_MUSIC_TRACK_IDS) {
      const before = mockCtx.oscillators.length + mockCtx.bufferSources.length;
      seq.setTrack(track);
      expect(seq.getCurrentTrack()).toBe(track);

      if (track !== 'none') {
        const pattern = MUSIC_PATTERNS[track];
        expect(pattern.bpm).toBeGreaterThan(0);
        expect(pattern.steps).toBe(32);
        expect(pattern.bass.length).toBe(32);
        expect(pattern.lead.length).toBe(32);
        expect(pattern.kick.length).toBe(32);
        expect(pattern.snare.length).toBe(32);
        expect(pattern.hat.length).toBe(32);
        expect(pattern.chords.length).toBeGreaterThanOrEqual(4);
        expect(new Set(pattern.lead.filter((n): n is number => n !== null)).size).toBeGreaterThanOrEqual(
          3,
        );
        mockCtx.currentTime += 0.25;
        vi.advanceTimersByTime(50);
        const after = mockCtx.oscillators.length + mockCtx.bufferSources.length;
        expect(after).toBeGreaterThan(before);
      }
    }

    expect(MUSIC_PATTERNS.emote_5.bpm).toBe(126);
    expect(MUSIC_PATTERNS.emote_6.bpm).toBe(112);
    expect(MUSIC_PATTERNS.combat_intense.bpm).toBe(138);

    seq.setTrack('none');
    expect(seq.getCurrentTrack()).toBe('none');
    seq.dispose();
    expect(seq.getCurrentTrack()).toBe('none');
  });
});

describe('AudioEngine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('safely runs in Node without AudioContext or window', async () => {
    const bus = new EventBus();
    const engine = new AudioEngine(bus);

    expect(engine.isReady()).toBe(false);
    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(engine.isReady()).toBe(false);

    expect(engine.playSound({ id: 'shot_ar' })).toBe(false);
    bus.emit('sound:play', { id: 'victory_fanfare' });
    bus.emit('music:set', { track: 'lobby' });
    expect(engine.getCurrentMusic()).toBe('lobby');

    engine.updateListener({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 });
    engine.updateChestLoops({ x: 0, y: 0, z: 0 }, [
      { id: 'c1', x: 2, y: 0, z: 2, opened: false },
    ]);
    engine.updateSettings({
      ...DEFAULT_SETTINGS,
      masterVolume: 0.4,
      sfxVolume: 0.5,
      musicVolume: 0.2,
    });
    expect(engine.getSettings().masterVolume).toBe(0.4);
    expect(engine.getActiveVoiceCount()).toBe(0);

    engine.dispose();
  });

  it('survives AudioContext constructor errors and rejected resume()', async () => {
    const bus = new EventBus();
    const throwingEngine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => {
        throw new Error('blocked');
      },
    });
    await expect(throwingEngine.unlock()).resolves.toBeUndefined();
    expect(throwingEngine.isReady()).toBe(false);
    throwingEngine.dispose();

    const mockCtx = new MockAudioContext();
    mockCtx.state = 'suspended';
    mockCtx.resume = async () => {
      throw new Error('autoplay blocked');
    };
    const rejectingEngine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => mockCtx as unknown as AudioContext,
    });
    await expect(rejectingEngine.unlock()).resolves.toBeUndefined();
    rejectingEngine.dispose();
  });

  it('unlocks suspended AudioContext, routes buses, syncs listener, and cleans up on dispose', async () => {
    const mockCtx = new MockAudioContext();
    mockCtx.state = 'suspended';

    const bus = new EventBus();
    const engine = new AudioEngine(
      bus,
      { ...DEFAULT_SETTINGS, masterVolume: 0.7, sfxVolume: 0.9, musicVolume: 0.3 },
      { contextFactory: () => mockCtx as unknown as AudioContext },
    );

    // Suspended context should not fire SFX before unlock
    expect(engine.playSound({ id: 'ui_click' })).toBe(false);

    await engine.unlock();
    expect(mockCtx.state).toBe('running');
    expect(engine.isReady()).toBe(true);

    // Master, SFX, Music gains should reflect settings
    expect(mockCtx.gains[0].gain.value).toBeCloseTo(0.7);
    expect(mockCtx.gains[1].gain.value).toBeCloseTo(0.9);
    expect(mockCtx.gains[2].gain.value).toBeCloseTo(0.3);

    engine.updateSettings({
      ...DEFAULT_SETTINGS,
      masterVolume: 0.5,
      sfxVolume: 0.6,
      musicVolume: 0.8,
    });
    expect(mockCtx.gains[0].gain.value).toBeCloseTo(0.5);
    expect(mockCtx.gains[1].gain.value).toBeCloseTo(0.6);
    expect(mockCtx.gains[2].gain.value).toBeCloseTo(0.8);

    // Listener sync normalizes forward & up
    engine.updateListener({ x: 10, y: 5, z: -20 }, { x: 3, y: 0, z: 4 }, { x: 0, y: 2, z: 0 });
    expect(mockCtx.listener.positionX.value).toBe(10);
    expect(mockCtx.listener.positionY.value).toBe(5);
    expect(mockCtx.listener.positionZ.value).toBe(-20);
    expect(mockCtx.listener.forwardX.value).toBeCloseTo(0.6);
    expect(mockCtx.listener.forwardZ.value).toBeCloseTo(0.8);
    expect(mockCtx.listener.upY.value).toBeCloseTo(1);

    // Spatial sound creates PannerNode; far sound beyond range is culled
    const pannersBefore = mockCtx.panners.length;
    expect(
      engine.playSound({ id: 'shot_ar', position: { x: 15, y: 5, z: -20 }, spatial: true }),
    ).toBe(true);
    expect(mockCtx.panners.length).toBe(pannersBefore + 1);

    expect(
      engine.playSound({ id: 'footstep', position: { x: 400, y: 0, z: 400 }, spatial: true }),
    ).toBe(false);

    // EventBus wiring + dispose unsubscription
    bus.emit('music:set', { track: 'bus' });
    expect(engine.getCurrentMusic()).toBe('bus');

    engine.dispose();
    expect(mockCtx.state).toBe('closed');
    expect(engine.isReady()).toBe(false);

    bus.emit('sound:play', { id: 'shot_pump' });
    expect(engine.getActiveVoiceCount()).toBe(0);
  });

  it('enforces polyphony cap <= 24 and expires completed voices', async () => {
    const mockCtx = new MockAudioContext();
    const bus = new EventBus();
    const engine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => mockCtx as unknown as AudioContext,
    });
    await engine.unlock();

    expect(engine.getMaxPolyphony()).toBe(MAX_POLYPHONY);
    expect(MAX_POLYPHONY).toBe(24);

    // Fill with 24 high-priority sounds
    for (let i = 0; i < 30; i++) {
      engine.playSound({ id: 'shot_sniper' });
    }
    expect(engine.getActiveVoiceCount()).toBeLessThanOrEqual(24);
    expect(engine.getActiveVoiceCount()).toBe(24);

    // Low-priority footstep is dropped when 24 higher-priority voices are active
    expect(engine.playSound({ id: 'footstep' })).toBe(false);
    expect(engine.getActiveVoiceCount()).toBe(24);

    // Advance clock past sniper duration -> voices prune back to 0
    mockCtx.currentTime += 2.0;
    expect(engine.getActiveVoiceCount()).toBe(0);

    // Low-priority footsteps can fill, then get evicted by high-priority shot_pump
    for (let i = 0; i < 24; i++) {
      expect(engine.playSound({ id: 'footstep' })).toBe(true);
    }
    expect(engine.getActiveVoiceCount()).toBe(24);
    expect(engine.playSound({ id: 'shot_pump' })).toBe(true);
    expect(engine.getActiveVoiceCount()).toBe(24);

    engine.dispose();
  });

  it('manages up to 3 closest unopened chest hum loops within proximity', async () => {
    const mockCtx = new MockAudioContext();
    const bus = new EventBus();
    const engine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => mockCtx as unknown as AudioContext,
    });
    await engine.unlock();

    const chests: ChestEntity[] = [
      { id: 'c_opened', x: 1, y: 0, z: 0, rotationY: 0, opened: true, openProgress: 1 },
      { id: 'c_1', x: 3, y: 0, z: 0, rotationY: 0, opened: false, openProgress: 0 },
      { id: 'c_2', x: 6, y: 0, z: 0, rotationY: 0, opened: false, openProgress: 0 },
      { id: 'c_3', x: 10, y: 0, z: 0, rotationY: 0, opened: false, openProgress: 0 },
      { id: 'c_4', x: 15, y: 0, z: 0, rotationY: 0, opened: false, openProgress: 0 },
      {
        id: 'c_far',
        x: CHEST_HUM_RADIUS + 20,
        y: 0,
        z: 0,
        rotationY: 0,
        opened: false,
        openProgress: 0,
      },
    ];

    engine.updateChestLoops({ x: 0, y: 0, z: 0 }, chests);
    expect(engine.getActiveChestLoopCount()).toBe(MAX_CHEST_LOOPS);

    // Opening one active chest replaces it with c_4
    chests[1].opened = true;
    engine.updateChestLoops({ x: 0, y: 0, z: 0 }, chests);
    expect(engine.getActiveChestLoopCount()).toBe(3);

    // Moving far away stops all chest hum loops
    engine.updateChestLoops({ x: 300, y: 0, z: 300 }, chests);
    expect(engine.getActiveChestLoopCount()).toBe(0);

    engine.dispose();
  });

  it('manages updateBiomeAmbience across all 10 biomes and storm states safely', async () => {
    // 1. Headless no-AudioContext safety
    const bus = new EventBus();
    const headless = new AudioEngine(bus);
    for (const biome of ALL_BIOMES) {
      expect(() => headless.updateBiomeAmbience(biome, false)).not.toThrow();
      expect(() => headless.updateBiomeAmbience(biome, true)).not.toThrow();
      const profileCalm = getBiomeAmbienceProfile(biome, false);
      const profileStorm = getBiomeAmbienceProfile(biome, true);
      expect(BIOME_AMBIENCE_PROFILES[biome]).toBeDefined();
      expect(profileCalm.noiseFilterFreq).toBeGreaterThan(20);
      expect(profileStorm.stormOverlayGain).toBeGreaterThan(profileCalm.stormOverlayGain);
    }
    expect(headless.getActiveVoiceCount()).toBe(0);
    headless.dispose();

    // 2. Minimal mocked AudioContext missing optional createBiquadFilter / createBuffer
    const minimalCtx = {
      currentTime: 0,
      sampleRate: 44100,
      state: 'running',
      destination: new MockAudioNode(),
      createGain: () => new MockGainNode(),
      createOscillator: () => new MockOscillatorNode(),
      createBufferSource: () => new MockBufferSourceNode(),
      close: async () => {},
    } as unknown as AudioContext;
    const minimalEngine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => minimalCtx,
    });
    await minimalEngine.unlock();
    expect(() => minimalEngine.updateBiomeAmbience('volcanic', true)).not.toThrow();
    expect(minimalEngine.getBiomeAmbienceState()).toEqual({
      biome: 'volcanic',
      inStorm: true,
      weather: 'clear',
      active: true,
    });
    expect(minimalEngine.getActiveVoiceCount()).toBe(1);
    minimalEngine.dispose();
    expect(minimalEngine.getActiveVoiceCount()).toBe(0);

    // 3. Full MockAudioContext: verify node reuse (no 60Hz leaks), modulation, and polyphony cap
    const mockCtx = new MockAudioContext();
    const engine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => mockCtx as unknown as AudioContext,
    });
    await engine.unlock();

    engine.updateBiomeAmbience('ocean', false);
    const oscCountAfterStart = mockCtx.oscillators.length;
    const srcCountAfterStart = mockCtx.bufferSources.length;
    expect(oscCountAfterStart).toBe(3); // droneA + droneB + stormOsc
    expect(srcCountAfterStart).toBe(1); // looping noise bed
    expect(engine.getActiveVoiceCount()).toBe(1);

    // Calling repeatedly with same state must be a no-op with zero node allocation
    for (let i = 0; i < 120; i++) {
      engine.updateBiomeAmbience('ocean', false);
    }
    expect(mockCtx.oscillators.length).toBe(oscCountAfterStart);
    expect(mockCtx.bufferSources.length).toBe(srcCountAfterStart);

    // Switching across all 10 biomes and storm states updates existing nodes cleanly
    for (const biome of ALL_BIOMES) {
      engine.updateBiomeAmbience(biome, false);
      expect(engine.getBiomeAmbienceState()).toEqual({
        biome,
        inStorm: false,
        weather: 'clear',
        active: true,
      });
      engine.updateBiomeAmbience(biome, true);
      expect(engine.getBiomeAmbienceState()).toEqual({
        biome,
        inStorm: true,
        weather: 'clear',
        active: true,
      });
    }
    expect(mockCtx.oscillators.length).toBe(oscCountAfterStart);
    expect(mockCtx.bufferSources.length).toBe(srcCountAfterStart);

    // Storm gain reflects active storm state
    const stormGainNode = mockCtx.gains[mockCtx.gains.length - 1];
    expect(stormGainNode.gain.value).toBeCloseTo(
      getBiomeAmbienceProfile('cyber', true).stormOverlayGain,
      4,
    );
    engine.updateBiomeAmbience('grassland', false);
    expect(stormGainNode.gain.value).toBeCloseTo(
      getBiomeAmbienceProfile('grassland', false).stormOverlayGain,
      4,
    );

    // Polyphony remains strictly bounded <= MAX_POLYPHONY with active biome ambience
    for (let i = 0; i < 30; i++) {
      engine.playSound({ id: 'shot_mythic_rifle' });
    }
    expect(engine.getActiveVoiceCount()).toBeLessThanOrEqual(MAX_POLYPHONY);
    expect(engine.getActiveVoiceCount()).toBe(MAX_POLYPHONY);

    engine.dispose();
    expect(engine.getActiveVoiceCount()).toBe(0);
    expect(mockCtx.oscillators.every((o) => o.stopped)).toBe(true);
    expect(mockCtx.bufferSources[0].loop).toBe(true);
    expect(mockCtx.bufferSources[0].stopped).toBe(true);
  });

  it('modulates biome ambience smoothly across all WeatherKind states and applies Wave-2 priorities/distances', async () => {
    // 1. Headless weather safety + profile checks across all 5 WeatherKind states
    const bus = new EventBus();
    const headless = new AudioEngine(bus);
    for (const weather of ALL_WEATHER_KINDS) {
      expect(() => headless.updateBiomeAmbience('grassland', false, weather)).not.toThrow();
      expect(headless.getBiomeAmbienceState().weather).toBe(weather);

      const calm = getBiomeAmbienceProfile('grassland', false, 'clear');
      const weathered = getBiomeAmbienceProfile('grassland', false, weather);
      expect(weathered.noiseFilterFreq).toBeGreaterThan(20);
      expect(weathered.noiseGain).toBeGreaterThan(0);
      expect(weathered.stormFilterFreq).toBeGreaterThan(25);
      if (weather === 'rain' || weather === 'storm_front') {
        expect(weathered.noiseFilterFreq).toBeGreaterThan(calm.noiseFilterFreq);
        expect(weathered.noiseGain).toBeGreaterThan(calm.noiseGain);
        expect(weathered.stormOverlayGain).toBeGreaterThan(calm.stormOverlayGain);
        expect(weathered.stormFilterFreq).toBeGreaterThan(calm.stormFilterFreq);
      }
    }
    headless.dispose();

    // 2. Active AudioContext: verify deferred weather on unlock & smooth node modulation without extra nodes
    const mockCtx = new MockAudioContext();
    mockCtx.state = 'suspended';
    const engine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => mockCtx as unknown as AudioContext,
    });

    engine.updateBiomeAmbience('highland', false, 'rain');
    expect(engine.getBiomeAmbienceState()).toEqual({
      biome: 'highland',
      inStorm: false,
      weather: 'rain',
      active: false,
    });

    await engine.unlock();
    expect(engine.getBiomeAmbienceState()).toEqual({
      biome: 'highland',
      inStorm: false,
      weather: 'rain',
      active: true,
    });

    const oscCount = mockCtx.oscillators.length;
    const srcCount = mockCtx.bufferSources.length;
    expect(oscCount).toBe(3);
    expect(srcCount).toBe(1);

    // Filter & gain nodes modulate cleanly across all 5 WeatherKinds with zero leaks
    for (const weather of ALL_WEATHER_KINDS) {
      engine.updateBiomeAmbience('highland', false, weather);
      engine.updateBiomeAmbience('highland', false, weather);
      expect(engine.getBiomeAmbienceState().weather).toBe(weather);
    }

    engine.updateBiomeAmbience('highland', false, 'storm_front');
    const stormFrontProfile = getBiomeAmbienceProfile('highland', false, 'storm_front');
    // ambience rig noiseFilter is filters[0], stormFilter is filters[2]
    const noiseFilterNode = mockCtx.filters[0];
    const stormFilterNode = mockCtx.filters[2];
    const stormGainNode = mockCtx.gains[mockCtx.gains.length - 1];
    expect(noiseFilterNode.frequency.value).toBeCloseTo(stormFrontProfile.noiseFilterFreq, 2);
    expect(stormFilterNode.frequency.value).toBeCloseTo(stormFrontProfile.stormFilterFreq, 2);
    expect(stormGainNode.gain.value).toBeCloseTo(stormFrontProfile.stormOverlayGain, 4);

    // Transition back to clear reduces filter freq and overlay gain
    engine.updateBiomeAmbience('highland', false, 'clear');
    const clearProfile = getBiomeAmbienceProfile('highland', false, 'clear');
    expect(noiseFilterNode.frequency.value).toBeCloseTo(clearProfile.noiseFilterFreq, 2);
    expect(stormGainNode.gain.value).toBeCloseTo(clearProfile.stormOverlayGain, 4);
    expect(mockCtx.oscillators.length).toBe(oscCount);
    expect(mockCtx.bufferSources.length).toBe(srcCount);

    // Wave-2 spatial distance & priority verification
    expect(getSoundPriority('weather_thunder')).toBe(3);
    expect(getSoundPriority('vault_unlock')).toBe(3);
    expect(getSoundPriority('bounty_alert')).toBe(3);
    expect(getSoundPriority('vehicle_crash')).toBe(3);
    expect(getSoundPriority('shield_bubble_deploy')).toBe(3);
    expect(getSoundPriority('vehicle_boost')).toBe(2);
    expect(getSoundPriority('vehicle_horn')).toBe(2);
    expect(getSoundPriority('grappler_fire')).toBe(2);
    expect(getSoundPriority('grappler_reel')).toBe(1);

    expect(getMaxHearDistance('weather_thunder')).toBe(350);
    expect(getMaxHearDistance('vault_unlock')).toBe(220);
    expect(getMaxHearDistance('grappler_reel')).toBe(110);

    engine.updateListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    expect(engine.playSound({ id: 'weather_thunder', position: { x: 300, y: 0, z: 0 }, spatial: true })).toBe(true);
    expect(engine.playSound({ id: 'grappler_reel', position: { x: 150, y: 0, z: 0 }, spatial: true })).toBe(false);
    expect(engine.playSound({ id: 'vault_unlock', position: { x: 200, y: 0, z: 0 }, spatial: true })).toBe(true);

    // Polyphony stays <= MAX_POLYPHONY even under heavy Wave-2 SFX load
    for (let i = 0; i < 30; i++) {
      engine.playSound({ id: 'vehicle_boost' });
    }
    expect(engine.getActiveVoiceCount()).toBeLessThanOrEqual(MAX_POLYPHONY);

    engine.dispose();
  });

  it('starts, modulates across speed/boost/kind, and cleanly stops vehicle engine loop on inactive, pause, mute, and dispose', async () => {
    const bus = new EventBus();

    // 1. Headless safety (no AudioContext)
    const headless = new AudioEngine(bus);
    expect(() => headless.updateVehicleEngine(true, 80, false, 'hover_atv')).not.toThrow();
    expect(() => headless.updateVehicleEngine(true, Number.NaN, true, 'cyber_bike')).not.toThrow();
    expect(() => headless.setPaused(true)).not.toThrow();
    expect(headless.getVehicleEngineState().active).toBe(false);
    expect(headless.getActiveVoiceCount()).toBe(0);
    headless.dispose();

    // 2. Suspended or muted contexts do not spawn vehicle loop oscillators
    const suspendedCtx = new MockAudioContext();
    suspendedCtx.state = 'suspended';
    const suspendedEngine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => suspendedCtx as unknown as AudioContext,
    });
    suspendedEngine.updateVehicleEngine(true, 90, true, 'cyber_bike');
    expect(suspendedCtx.oscillators.length).toBe(0);
    expect(suspendedEngine.getVehicleEngineState().active).toBe(false);
    suspendedEngine.dispose();

    const mutedCtx = new MockAudioContext();
    const mutedEngine = new AudioEngine(
      bus,
      { ...DEFAULT_SETTINGS, sfxVolume: 0 },
      { contextFactory: () => mutedCtx as unknown as AudioContext },
    );
    await mutedEngine.unlock();
    mutedEngine.updateVehicleEngine(true, 90, true, 'hover_atv');
    expect(mutedCtx.oscillators.length).toBe(0);
    expect(mutedEngine.getVehicleEngineState().active).toBe(false);
    mutedEngine.dispose();

    // 3. Active AudioContext: lazy start, zero-leak reuse, speed/boost/kind modulation, clean stop
    const mockCtx = new MockAudioContext();
    const engine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => mockCtx as unknown as AudioContext,
    });
    await engine.unlock();

    // Inactive before first active=true call
    engine.updateVehicleEngine(false, 0, false);
    expect(mockCtx.oscillators.length).toBe(0);
    expect(engine.getVehicleEngineState().active).toBe(false);

    // Lazy start on active=true: dual hover oscs + boost sub-osc + bandpass filter
    const gainsBefore = mockCtx.gains.length;
    engine.updateVehicleEngine(true, 0, false, 'hover_atv');
    expect(engine.getVehicleEngineState()).toEqual({
      active: true,
      speedKmh: 0,
      isBoosting: false,
      kind: 'hover_atv',
    });
    expect(engine.getActiveVoiceCount()).toBe(1);
    expect(mockCtx.oscillators.length).toBe(3);
    expect(mockCtx.filters.length).toBe(1);
    expect(mockCtx.filters[0].type).toBe('bandpass');
    expect(mockCtx.oscillators.every((o) => o.started && !o.stopped)).toBe(true);

    const oscA = mockCtx.oscillators[0];
    const oscB = mockCtx.oscillators[1];
    const boostOsc = mockCtx.oscillators[2];
    const humFilter = mockCtx.filters[0];
    // Vehicle rig gains created in order: master(0), hum(1), whine(2), boost(3)
    const vehMasterGain = mockCtx.gains[gainsBefore];
    const vehWhineGain = mockCtx.gains[gainsBefore + 2];
    const vehBoostGain = mockCtx.gains[gainsBefore + 3];

    const idleFreqA = oscA.frequency.value;
    const idleFreqB = oscB.frequency.value;
    const idleFilterFreq = humFilter.frequency.value;
    expect(idleFreqA).toBeGreaterThanOrEqual(75);
    expect(idleFreqA).toBeLessThanOrEqual(90);
    expect(vehBoostGain.gain.value).toBeCloseTo(0.0001, 4);

    // Calling repeatedly with identical params allocates zero extra nodes
    for (let i = 0; i < 60; i++) {
      engine.updateVehicleEngine(true, 0, false, 'hover_atv');
    }
    expect(mockCtx.oscillators.length).toBe(3);

    // Speed modulation (0 -> 80 -> 135 km/h) increases frequency and filter cutoff smoothly
    engine.updateVehicleEngine(true, 80, false, 'hover_atv');
    const midFreqA = oscA.frequency.value;
    const midFreqB = oscB.frequency.value;
    const midFilterFreq = humFilter.frequency.value;
    expect(midFreqA).toBeGreaterThan(idleFreqA);
    expect(midFreqB).toBeGreaterThan(idleFreqB);
    expect(midFilterFreq).toBeGreaterThan(idleFilterFreq);
    expect(mockCtx.oscillators.length).toBe(3);

    engine.updateVehicleEngine(true, 135, false, 'hover_atv');
    const highFreqA = oscA.frequency.value;
    expect(highFreqA).toBeGreaterThan(midFreqA);
    expect(highFreqA).toBeLessThanOrEqual(210);

    // Boost modulation kicks pitch up and engages boost sub-layer gain
    const preBoostMaster = vehMasterGain.gain.value;
    engine.updateVehicleEngine(true, 80, true, 'hover_atv');
    expect(oscA.frequency.value).toBeGreaterThan(midFreqA);
    expect(boostOsc.frequency.value).toBeGreaterThan(20);
    expect(vehBoostGain.gain.value).toBeGreaterThan(0.05);
    expect(vehMasterGain.gain.value).toBeGreaterThan(preBoostMaster);

    // VehicleKind modulation: cyber_bike produces higher cyber-whine harmonic & filter frequency than hover_atv
    engine.updateVehicleEngine(true, 80, false, 'hover_atv');
    const atvHarmonicFreq = oscB.frequency.value;
    const atvWhineGain = vehWhineGain.gain.value;
    const atvFilterFreq = humFilter.frequency.value;

    engine.updateVehicleEngine(true, 80, false, 'cyber_bike');
    expect(oscB.frequency.value).toBeGreaterThan(atvHarmonicFreq * 1.5);
    expect(vehWhineGain.gain.value).toBeGreaterThan(atvWhineGain);
    expect(humFilter.frequency.value).toBeGreaterThan(atvFilterFreq);
    expect(mockCtx.oscillators.length).toBe(3);

    // Clean stop on active=false
    engine.updateVehicleEngine(false, 0, false, 'cyber_bike');
    expect(engine.getVehicleEngineState().active).toBe(false);
    expect(engine.getActiveVoiceCount()).toBe(0);
    expect(mockCtx.oscillators.every((o) => o.stopped)).toBe(true);
    expect(vehMasterGain.gain.value).toBeCloseTo(0.0001, 4);

    // Restarting after active=false works cleanly and setPaused(true) stops loop
    engine.updateVehicleEngine(true, 95, true, 'cyber_bike');
    expect(engine.getVehicleEngineState().active).toBe(true);
    expect(mockCtx.oscillators.length).toBe(6);
    const secondWaveOscs = mockCtx.oscillators.slice(3);
    expect(secondWaveOscs.every((o) => o.started && !o.stopped)).toBe(true);

    engine.setPaused(true);
    expect(engine.isPaused()).toBe(true);
    expect(engine.getVehicleEngineState().active).toBe(false);
    expect(engine.getActiveVoiceCount()).toBe(0);
    expect(secondWaveOscs.every((o) => o.stopped)).toBe(true);

    // Remains silent while paused, then resumes cleanly when unpaused
    engine.updateVehicleEngine(true, 100, false, 'hover_atv');
    expect(engine.getVehicleEngineState().active).toBe(false);
    expect(mockCtx.oscillators.length).toBe(6);

    engine.setPaused(false);
    engine.updateVehicleEngine(true, 100, false, 'hover_atv');
    expect(engine.getVehicleEngineState().active).toBe(true);
    expect(mockCtx.oscillators.length).toBe(9);
    const thirdWaveOscs = mockCtx.oscillators.slice(6);

    // Muting SFX or Master tears down active vehicle engine loop cleanly
    engine.updateSettings({ ...DEFAULT_SETTINGS, sfxVolume: 0 });
    expect(engine.getVehicleEngineState().active).toBe(false);
    expect(thirdWaveOscs.every((o) => o.stopped)).toBe(true);

    // Unmute, restart, and verify dispose() stops everything with zero zombie loops
    engine.updateSettings({ ...DEFAULT_SETTINGS, sfxVolume: 0.85 });
    engine.updateVehicleEngine(true, 110, true, 'cyber_bike');
    expect(engine.getVehicleEngineState().active).toBe(true);
    const fourthWaveOscs = mockCtx.oscillators.slice(9);
    expect(fourthWaveOscs.every((o) => o.started && !o.stopped)).toBe(true);

    engine.dispose();
    expect(engine.getVehicleEngineState().active).toBe(false);
    expect(engine.getActiveVoiceCount()).toBe(0);
    expect(mockCtx.oscillators.every((o) => o.stopped)).toBe(true);

    // Post-dispose calls are no-ops
    const countAfterDispose = mockCtx.oscillators.length;
    engine.updateVehicleEngine(true, 120, true, 'cyber_bike');
    expect(mockCtx.oscillators.length).toBe(countAfterDispose);

    // 4. Minimal AudioParam fallback without setTargetAtTime or createBiquadFilter
    class MinimalLinearParam {
      value = 0;
      setValueAtTime(v: number): this {
        this.value = v;
        return this;
      }
      linearRampToValueAtTime(v: number): this {
        this.value = v;
        return this;
      }
      cancelScheduledValues(): this {
        return this;
      }
    }
    const minOscs: Array<{ frequency: MinimalLinearParam; started: boolean; stopped: boolean; start: () => void; stop: () => void; connect: () => void; disconnect: () => void }> = [];
    const minCtx = {
      currentTime: 0,
      sampleRate: 44100,
      state: 'running',
      destination: new MockAudioNode(),
      createGain: () => ({ gain: new MinimalLinearParam(), connect: () => {}, disconnect: () => {} }),
      createOscillator: () => {
        const o = {
          type: 'sine',
          frequency: new MinimalLinearParam(),
          started: false,
          stopped: false,
          start() {
            this.started = true;
          },
          stop() {
            this.stopped = true;
          },
          connect() {},
          disconnect() {},
        };
        minOscs.push(o);
        return o;
      },
      close: async () => {},
    } as unknown as AudioContext;
    const fallbackEngine = new AudioEngine(bus, DEFAULT_SETTINGS, {
      contextFactory: () => minCtx,
    });
    await fallbackEngine.unlock();
    expect(() => fallbackEngine.updateVehicleEngine(true, 75, true, 'cyber_bike')).not.toThrow();
    expect(fallbackEngine.getVehicleEngineState().active).toBe(true);
    expect(minOscs.length).toBe(3);
    expect(minOscs[0].frequency.value).toBeGreaterThan(78);
    expect(() => fallbackEngine.updateVehicleEngine(false, 0, false)).not.toThrow();
    expect(minOscs.every((o) => o.stopped)).toBe(true);
    fallbackEngine.dispose();
  });
});
