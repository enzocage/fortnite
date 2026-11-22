import type { AugmentId, GameModeId, Vec3Like } from '../types';
import { AUGMENTS, EventBus, mulberry32 } from '../core';

export const AUGMENT_INTERVAL_DEFAULT = 55;
export const AUGMENT_INTERVAL_BLITZ = 30;
export const MAX_ACTIVE_AUGMENTS = 3;

function hashMode(mode: GameModeId): number {
  switch (mode) {
    case 'zero_build':
      return 3041;
    case 'blitz':
      return 6089;
    case 'duos':
      return 9127;
    case 'solo':
    default:
      return 73;
  }
}

export class AugmentManager {
  private eventBus: EventBus;
  private rng: () => number = mulberry32(4201);
  private mode: GameModeId = 'solo';
  private intervalSec = AUGMENT_INTERVAL_DEFAULT;

  private activeAugments: AugmentId[] = [];
  private pendingChoices: [AugmentId, AugmentId] | null = null;

  private timer = 0;
  private lastElapsed = 0;
  private lastOfferElapsed = 0;
  private nextElapsedUnlock = AUGMENT_INTERVAL_DEFAULT;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.reset(4201, 'solo');
  }

  reset(seed = 4201, mode: GameModeId = 'solo'): void {
    const combinedSeed = ((seed >>> 0) ^ hashMode(mode) ^ 0x517cc1b7) >>> 0;
    this.rng = mulberry32(combinedSeed);
    this.mode = mode;
    this.intervalSec =
      mode === 'blitz' ? AUGMENT_INTERVAL_BLITZ : AUGMENT_INTERVAL_DEFAULT;

    this.activeAugments = [];
    this.pendingChoices = null;
    this.timer = 0;
    this.lastElapsed = 0;
    this.lastOfferElapsed = 0;
    this.nextElapsedUnlock = this.intervalSec;
  }

  getIntervalSec(): number {
    return this.intervalSec;
  }

  getMode(): GameModeId {
    return this.mode;
  }

  update(dt: number, elapsedPlayingSec?: number): void {
    if (elapsedPlayingSec !== undefined && Number.isFinite(elapsedPlayingSec)) {
      this.lastElapsed = Math.max(0, elapsedPlayingSec);
    }

    if (this.activeAugments.length >= MAX_ACTIVE_AUGMENTS) return;
    if (this.pendingChoices !== null) return;

    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.timer += safeDt;

    const reachedDt = this.timer >= this.intervalSec - 1e-6;
    const reachedElapsed =
      elapsedPlayingSec !== undefined &&
      Number.isFinite(elapsedPlayingSec) &&
      elapsedPlayingSec >= this.nextElapsedUnlock - 1e-6;

    if (reachedDt || reachedElapsed) {
      this.offerNextPair();
    }
  }

  forceOffer(): [AugmentId, AugmentId] | null {
    if (this.activeAugments.length >= MAX_ACTIVE_AUGMENTS) return null;
    if (this.pendingChoices !== null) {
      return [this.pendingChoices[0], this.pendingChoices[1]];
    }
    return this.offerNextPair();
  }

  private offerNextPair(): [AugmentId, AugmentId] | null {
    if (this.activeAugments.length >= MAX_ACTIVE_AUGMENTS) return null;

    const pool: AugmentId[] = [];
    for (let i = 0; i < AUGMENTS.length; i++) {
      const id = AUGMENTS[i].id;
      if (!this.activeAugments.includes(id)) {
        pool.push(id);
      }
    }
    if (pool.length < 2) return null;

    const i0 = Math.floor(this.rng() * pool.length);
    const first = pool[i0];
    pool.splice(i0, 1);
    const i1 = Math.floor(this.rng() * pool.length);
    const second = pool[i1];

    this.pendingChoices = [first, second];
    this.timer = 0;
    this.lastOfferElapsed = this.lastElapsed;
    this.eventBus.emit('sound:play', { id: 'augment_ready' });
    return [first, second];
  }

  selectChoice(index: 0 | 1, position?: Vec3Like): AugmentId | null {
    if (!this.pendingChoices) return null;
    if (this.activeAugments.length >= MAX_ACTIVE_AUGMENTS) return null;
    if (index !== 0 && index !== 1) return null;

    const chosen = this.pendingChoices[index];
    this.pendingChoices = null;

    if (!this.activeAugments.includes(chosen)) {
      this.activeAugments.push(chosen);
    }

    this.timer = 0;
    this.nextElapsedUnlock =
      Math.max(this.lastElapsed, this.lastOfferElapsed) + this.intervalSec;

    this.eventBus.emit('sound:play', { id: 'augment_select' });
    if (position) {
      const def = AUGMENTS.find((a) => a.id === chosen);
      this.eventBus.emit('vfx:augment_activate', {
        position: { ...position },
        color: def?.accentColor ?? '#38bdf8',
      });
    }

    return chosen;
  }

  getActiveAugments(): AugmentId[] {
    return [...this.activeAugments];
  }

  hasAugment(id: AugmentId): boolean {
    return this.activeAugments.includes(id);
  }

  getPendingChoices(): [AugmentId, AugmentId] | null {
    return this.pendingChoices
      ? [this.pendingChoices[0], this.pendingChoices[1]]
      : null;
  }
}
