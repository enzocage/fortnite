import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, EventBus } from '../../core';
import type { ChestEntity, MusicTrackId, SoundEventId } from '../../types';
import {
  AudioEngine,
  CHEST_HUM_RADIUS,
  computeBusGains,
  MAX_CHEST_LOOPS,
  MAX_POLYPHONY,
  MUSIC_PATTERNS,
  MusicSequencer,
  SoundSynthesizer,
} from '../index';

const ALL_SOUND_EVENT_IDS: SoundEventId[] = [
  'shot_ar',
  'shot_burst_ar',
  'shot_pump',
  'shot_tac',
  'shot_smg',
  'shot_sniper',
  'shot_pistol',
  'shot_rocket',
  'explosion',
  'reload',
  'dryfire',
  'pickaxe_swing',
  'hit_wood',
  'hit_brick',
  'hit_metal',
  'weakpoint_crit',
  'build_wood',
  'build_brick',
  'build_metal',
  'edit_select',
  'edit_confirm',
  'structure_break',
  'hitmarker',
  'shield_hit',
  'shield_break',
  'headshot_dink',
  'elimination',
  'chest_open',
  'loot_pickup',
  'bus_horn',
  'glider_deploy',
  'heal_start',
  'heal_finish',
  'storm_warning',
  'storm_tick',
  'footstep',
  'jump',
  'land',
  'ui_click',
  'ui_hover',
  'ui_play',
  'victory_fanfare',
];

const ALL_MUSIC_TRACK_IDS: MusicTrackId[] = [
  'none',
  'lobby',
  'bus',
  'emote_1',
  'emote_2',
  'emote_3',
  'emote_4',
  'victory',
];

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
  started = false;

  start(_when = 0, _offset = 0, _duration?: number): void {
    this.started = true;
  }

  stop(_when = 0): void {
    // noop
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
  it('synthesizes all 42 SoundEventIds with valid Web Audio nodes and positive durations', () => {
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const synth = new SoundSynthesizer(ctx, dest);

    expect(mockCtx.convolvers.length).toBe(1);
    expect(ALL_SOUND_EVENT_IDS.length).toBe(42);

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

  it('covers all MusicTrackIds and cleanly schedules & disposes', () => {
    vi.useFakeTimers();
    const mockCtx = new MockAudioContext();
    const ctx = mockCtx as unknown as AudioContext;
    const dest = ctx.createGain();
    const seq = new MusicSequencer(ctx, dest);

    expect(seq.getCurrentTrack()).toBe('none');

    for (const track of ALL_MUSIC_TRACK_IDS) {
      seq.setTrack(track);
      expect(seq.getCurrentTrack()).toBe(track);

      if (track !== 'none') {
        expect(MUSIC_PATTERNS[track].bpm).toBeGreaterThan(0);
        expect(MUSIC_PATTERNS[track].steps).toBe(32);
        const before = mockCtx.oscillators.length + mockCtx.bufferSources.length;
        vi.advanceTimersByTime(100);
        const after = mockCtx.oscillators.length + mockCtx.bufferSources.length;
        expect(after).toBeGreaterThanOrEqual(before);
      }
    }

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
});
