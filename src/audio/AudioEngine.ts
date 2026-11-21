import { clamp, DEFAULT_SETTINGS, dist3D, EventBus } from '../core';
import type {
  ChestEntity,
  GameSettings,
  MusicTrackId,
  SoundEventId,
  SoundEventPayload,
  Vec3Like,
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

function getSoundPriority(id: SoundEventId): number {
  switch (id) {
    case 'victory_fanfare':
    case 'elimination':
    case 'headshot_dink':
    case 'shield_break':
    case 'explosion':
    case 'shot_sniper':
    case 'shot_pump':
    case 'ui_play':
    case 'chest_open':
      return 3;
    case 'footstep':
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
      return 1;
    default:
      return 2;
  }
}

function getMaxHearDistance(id: SoundEventId): number {
  switch (id) {
    case 'footstep':
    case 'jump':
    case 'land':
      return 55;
    case 'pickaxe_swing':
    case 'hit_wood':
    case 'hit_brick':
    case 'hit_metal':
    case 'reload':
    case 'dryfire':
    case 'loot_pickup':
      return 85;
    case 'shot_sniper':
    case 'shot_rocket':
    case 'explosion':
    case 'bus_horn':
      return 240;
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
  private disposed = false;
  private gestureListenersBound = false;
  private gestureHandler: (() => void) | null = null;

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

  getActiveVoiceCount(): number {
    if (this.ctx) {
      this.pruneVoices(this.ctx.currentTime);
    }
    return this.activeVoices.length + this.chestLoops.size;
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

  private pruneVoices(now: number): void {
    for (let i = this.activeVoices.length - 1; i >= 0; i--) {
      if (now >= this.activeVoices[i].expiresAt) {
        this.safeDisconnect(this.activeVoices[i].panner);
        this.activeVoices.splice(i, 1);
      }
    }
  }

  private ensurePolyphonyRoom(incomingPriority: number): boolean {
    if (this.activeVoices.length + this.chestLoops.size < MAX_POLYPHONY) {
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
