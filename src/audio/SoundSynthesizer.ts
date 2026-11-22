import { clamp, mulberry32 } from '../core';
import type { SoundEventId } from '../types';

export interface PlaySoundOptions {
  volume?: number;
  pitch?: number;
}

export interface LoopHandle {
  stop: () => void;
}

interface ToneOpts {
  type?: OscillatorType;
  freqStart: number;
  freqEnd?: number;
  duration: number;
  gain: number;
  attack?: number;
  detune?: number;
  filterType?: BiquadFilterType;
  filterFreqStart?: number;
  filterFreqEnd?: number;
  filterQ?: number;
  wet?: number;
}

interface NoiseOpts {
  buffer?: 'white' | 'pink';
  duration: number;
  gain: number;
  attack?: number;
  filterType?: BiquadFilterType;
  filterFreqStart?: number;
  filterFreqEnd?: number;
  filterQ?: number;
  playbackRate?: number;
  distort?: boolean;
  wet?: number;
}

const WEAKPOINT_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16] as const;
const WEAKPOINT_COMBO_WINDOW_SEC = 1.8;

/**
 * 100% procedural Web Audio API sound synthesizer for all 102 Fortnite-style SFX
 * and spatial chest hum loops.
 */
export class SoundSynthesizer {
  private readonly ctx: AudioContext;
  private readonly destination: AudioNode;
  private readonly whiteNoise: AudioBuffer | null;
  private readonly pinkNoise: AudioBuffer | null;
  private readonly reverbSend: GainNode | null;
  private readonly convolver: ConvolverNode | null;
  private readonly softClipCurve: Float32Array<ArrayBuffer> | null;
  private readonly rand: () => number;

  private weakpointCombo = 0;
  private lastWeakpointTime = -1;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
    this.rand = mulberry32(0x50a9d1);

    this.whiteNoise = this.buildNoiseBuffer(2.0, false);
    this.pinkNoise = this.buildNoiseBuffer(2.0, true);
    this.softClipCurve = this.buildSaturationCurve(256, 3.2);

    const reverb = this.buildReverbPipeline(destination);
    this.convolver = reverb.convolver;
    this.reverbSend = reverb.send;
  }

  getWeakpointCombo(): number {
    return this.weakpointCombo;
  }

  resetWeakpointCombo(): void {
    this.weakpointCombo = 0;
    this.lastWeakpointTime = -1;
  }

  /**
   * Synthesizes and plays a sound effect routed into `targetNode`.
   * Returns the approximate duration of the sound in seconds.
   */
  play(id: SoundEventId, targetNode: AudioNode, options?: PlaySoundOptions): number {
    const t = this.ctx.currentTime;
    const vol = clamp(
      options?.volume !== undefined && Number.isFinite(options.volume) ? options.volume : 1.0,
      0,
      2.0,
    );
    const pitch = clamp(
      options?.pitch !== undefined && Number.isFinite(options.pitch) ? options.pitch : 1.0,
      0.25,
      4.0,
    );

    if (vol <= 0.0001) {
      return 0.05;
    }

    switch (id) {
      case 'shot_ar':
        return this.playShotAR(t, targetNode, vol, pitch);
      case 'shot_burst_ar':
        return this.playShotBurstAR(t, targetNode, vol, pitch);
      case 'shot_pump':
        return this.playShotPump(t, targetNode, vol, pitch);
      case 'shot_tac':
        return this.playShotTac(t, targetNode, vol, pitch);
      case 'shot_smg':
        return this.playShotSMG(t, targetNode, vol, pitch);
      case 'shot_sniper':
        return this.playShotSniper(t, targetNode, vol, pitch);
      case 'shot_pistol':
        return this.playShotPistol(t, targetNode, vol, pitch);
      case 'shot_rocket':
        return this.playShotRocket(t, targetNode, vol, pitch);
      case 'explosion':
        return this.playExplosion(t, targetNode, vol, pitch);
      case 'reload':
        return this.playReload(t, targetNode, vol, pitch);
      case 'dryfire':
        return this.playDryfire(t, targetNode, vol, pitch);
      case 'pickaxe_swing':
        return this.playPickaxeSwing(t, targetNode, vol, pitch);
      case 'hit_wood':
        return this.playHitWood(t, targetNode, vol, pitch);
      case 'hit_brick':
        return this.playHitBrick(t, targetNode, vol, pitch);
      case 'hit_metal':
        return this.playHitMetal(t, targetNode, vol, pitch);
      case 'weakpoint_crit':
        return this.playWeakpointCrit(t, targetNode, vol, pitch);
      case 'build_wood':
        return this.playBuildWood(t, targetNode, vol, pitch);
      case 'build_brick':
        return this.playBuildBrick(t, targetNode, vol, pitch);
      case 'build_metal':
        return this.playBuildMetal(t, targetNode, vol, pitch);
      case 'edit_select':
        return this.playEditSelect(t, targetNode, vol, pitch);
      case 'edit_confirm':
        return this.playEditConfirm(t, targetNode, vol, pitch);
      case 'structure_break':
        return this.playStructureBreak(t, targetNode, vol, pitch);
      case 'hitmarker':
        return this.playHitmarker(t, targetNode, vol, pitch);
      case 'shield_hit':
        return this.playShieldHit(t, targetNode, vol, pitch);
      case 'shield_break':
        return this.playShieldBreak(t, targetNode, vol, pitch);
      case 'headshot_dink':
        return this.playHeadshotDink(t, targetNode, vol, pitch);
      case 'elimination':
        return this.playElimination(t, targetNode, vol, pitch);
      case 'chest_open':
        return this.playChestOpen(t, targetNode, vol, pitch);
      case 'loot_pickup':
        return this.playLootPickup(t, targetNode, vol, pitch);
      case 'bus_horn':
        return this.playBusHorn(t, targetNode, vol, pitch);
      case 'glider_deploy':
        return this.playGliderDeploy(t, targetNode, vol, pitch);
      case 'heal_start':
        return this.playHealStart(t, targetNode, vol, pitch);
      case 'heal_finish':
        return this.playHealFinish(t, targetNode, vol, pitch);
      case 'storm_warning':
        return this.playStormWarning(t, targetNode, vol, pitch);
      case 'storm_tick':
        return this.playStormTick(t, targetNode, vol, pitch);
      case 'footstep':
        return this.playFootstep(t, targetNode, vol, pitch);
      case 'jump':
        return this.playJump(t, targetNode, vol, pitch);
      case 'land':
        return this.playLand(t, targetNode, vol, pitch);
      case 'ui_click':
        return this.playUiClick(t, targetNode, vol, pitch);
      case 'ui_hover':
        return this.playUiHover(t, targetNode, vol, pitch);
      case 'ui_play':
        return this.playUiPlay(t, targetNode, vol, pitch);
      case 'victory_fanfare':
        return this.playVictoryFanfare(t, targetNode, vol, pitch);
      case 'launch_pad':
        return this.playLaunchPad(t, targetNode, vol, pitch);
      case 'vehicle_boost':
        return this.playVehicleBoost(t, targetNode, vol, pitch);
      case 'vehicle_horn':
        return this.playVehicleHorn(t, targetNode, vol, pitch);
      case 'vehicle_crash':
        return this.playVehicleCrash(t, targetNode, vol, pitch);
      case 'grappler_fire':
        return this.playGrapplerFire(t, targetNode, vol, pitch);
      case 'grappler_reel':
        return this.playGrapplerReel(t, targetNode, vol, pitch);
      case 'shield_bubble_deploy':
        return this.playShieldBubbleDeploy(t, targetNode, vol, pitch);
      case 'vault_unlock':
        return this.playVaultUnlock(t, targetNode, vol, pitch);
      case 'weather_thunder':
        return this.playWeatherThunder(t, targetNode, vol, pitch);
      case 'bounty_alert':
        return this.playBountyAlert(t, targetNode, vol, pitch);
      case 'upgrade_weapon':
        return this.playUpgradeWeapon(t, targetNode, vol, pitch);
      case 'campfire_ignite':
        return this.playCampfireIgnite(t, targetNode, vol, pitch);
      case 'campfire_heal':
        return this.playCampfireHeal(t, targetNode, vol, pitch);
      case 'slurp_barrel_break':
        return this.playSlurpBarrelBreak(t, targetNode, vol, pitch);
      case 'quest_complete':
        return this.playQuestComplete(t, targetNode, vol, pitch);
      case 'overshield_recharge':
        return this.playOvershieldRecharge(t, targetNode, vol, pitch);
      case 'rift_teleport':
        return this.playRiftTeleport(t, targetNode, vol, pitch);
      case 'augment_ready':
        return this.playAugmentReady(t, targetNode, vol, pitch);
      case 'augment_select':
        return this.playAugmentSelect(t, targetNode, vol, pitch);
      case 'flag_tick':
        return this.playFlagTick(t, targetNode, vol, pitch);
      case 'flag_captured':
        return this.playFlagCaptured(t, targetNode, vol, pitch);
      case 'tactical_ping':
        return this.playTacticalPing(t, targetNode, vol, pitch);
      case 'barrel_explode':
        return this.playBarrelExplode(t, targetNode, vol, pitch);
      case 'shot_dmr':
        return this.playShotDmr(t, targetNode, vol, pitch);
      case 'kinetic_slash':
        return this.playKineticSlash(t, targetNode, vol, pitch);
      case 'kinetic_dash':
        return this.playKineticDash(t, targetNode, vol, pitch);
      case 'gold_pickup':
        return this.playGoldPickup(t, targetNode, vol, pitch);
      case 'vending_buy':
        return this.playVendingBuy(t, targetNode, vol, pitch);
      case 'ally_hired':
        return this.playAllyHired(t, targetNode, vol, pitch);
      case 'loot_island_spawn':
        return this.playLootIslandSpawn(t, targetNode, vol, pitch);
      case 'shot_combat_smg':
        return this.playShotCombatSMG(t, targetNode, vol, pitch);
      case 'bow_draw':
        return this.playBowDraw(t, targetNode, vol, pitch);
      case 'bow_release':
        return this.playBowRelease(t, targetNode, vol, pitch);
      case 'knocked_down':
        return this.playKnockedDown(t, targetNode, vol, pitch);
      case 'revive_tick':
        return this.playReviveTick(t, targetNode, vol, pitch);
      case 'revive_complete':
        return this.playReviveComplete(t, targetNode, vol, pitch);
      case 'medallion_pickup':
        return this.playMedallionPickup(t, targetNode, vol, pitch);
      case 'crown_glint':
        return this.playCrownGlint(t, targetNode, vol, pitch);
      case 'bunker_unlock':
        return this.playBunkerUnlock(t, targetNode, vol, pitch);
      case 'slurp_tanker_burst':
        return this.playSlurpTankerBurst(t, targetNode, vol, pitch);
      case 'shot_heavy_shotgun':
        return this.playShotHeavyShotgun(t, targetNode, vol, pitch);
      case 'shot_mythic_rifle':
        return this.playShotMythicRifle(t, targetNode, vol, pitch);
      case 'build_repair':
        return this.playBuildRepair(t, targetNode, vol, pitch);
      case 'kill_streak':
        return this.playKillStreak(t, targetNode, vol, pitch);
      case 'zipline_attach':
        return this.playZiplineAttach(t, targetNode, vol, pitch);
      case 'zipline_loop':
        return this.playZiplineLoop(t, targetNode, vol, pitch);
      case 'slide_loop':
        return this.playSlideLoop(t, targetNode, vol, pitch);
      case 'mantle_climb':
        return this.playMantleClimb(t, targetNode, vol, pitch);
      case 'grenade_bounce':
        return this.playGrenadeBounce(t, targetNode, vol, pitch);
      case 'splash_heal':
        return this.playSplashHeal(t, targetNode, vol, pitch);
      case 'fall_damage':
        return this.playFallDamage(t, targetNode, vol, pitch);
      case 'lava_burn':
        return this.playLavaBurn(t, targetNode, vol, pitch);
      case 'poi_discover':
        return this.playPoiDiscover(t, targetNode, vol, pitch);
      case 'shockwave_blast':
        return this.playShockwaveBlast(t, targetNode, vol, pitch);
      case 'footstep_wood':
      case 'footstep_stone':
      case 'footstep_metal':
      case 'footstep_snow':
      case 'footstep_water':
      case 'footstep_sand':
        return this.playSurfaceFootstep(id, t, targetNode, vol, pitch);
      default: {
        const exhaustive: never = id;
        return exhaustive;
      }
    }
  }

  /**
   * Starts a continuous warm golden harmonic shimmer loop for an unopened chest.
   */
  createChestHumLoop(targetNode: AudioNode): LoopHandle {
    const now = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.065, now + 0.15);

    const filter = this.safeCreateFilter();
    if (filter) {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1150, now);
      filter.Q.setValueAtTime(1.2, now);
      filter.connect(master);
    }
    master.connect(targetNode);

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(220, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(329.63, now);

    const osc3 = this.ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(440, now);
    osc3.detune?.setValueAtTime(6, now);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(2.4, now);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.018, now);
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);

    const dest = filter ?? master;
    osc1.connect(dest);
    osc2.connect(dest);
    osc3.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    lfo.start(now);

    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        try {
          const stopAt = this.ctx.currentTime + 0.06;
          master.gain.cancelScheduledValues?.(this.ctx.currentTime);
          master.gain.setValueAtTime(Math.max(0.0001, master.gain.value || 0.05), this.ctx.currentTime);
          master.gain.linearRampToValueAtTime(0.0001, stopAt);
          osc1.stop(stopAt);
          osc2.stop(stopAt);
          osc3.stop(stopAt);
          lfo.stop(stopAt);
        } catch {
          // AudioContext may already be closed during teardown
        }
      },
    };
  }

  dispose(): void {
    try {
      this.convolver?.disconnect();
      this.reverbSend?.disconnect();
    } catch {
      // ignore disconnect errors during teardown
    }
  }

  // --- Weapon & Combat Recipes ---

  private playShotAR(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.04) * pitch;
    // Punchy chest sub-thump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 96 * jitter,
      freqEnd: 32 * jitter,
      duration: 0.085,
      gain: 0.34 * vol,
      wet: 0.1,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 175 * jitter,
      freqEnd: 48 * jitter,
      duration: 0.095,
      gain: 0.48 * vol,
      wet: 0.14,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.145,
      gain: 0.42 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1850 * jitter,
      filterFreqEnd: 650 * jitter,
      filterQ: 1.3,
      distort: true,
      wet: 0.2,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.022,
      gain: 0.25 * vol,
      filterType: 'highpass',
      filterFreqStart: 2600,
    });
    // Mechanical bolt-carrier return tail
    this.noise(target, t + 0.072, {
      buffer: 'white',
      duration: 0.028,
      gain: 0.12 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2900 * pitch,
      filterQ: 3.4,
    });
    this.tone(target, t + 0.074, {
      type: 'triangle',
      freqStart: 720 * pitch,
      freqEnd: 490 * pitch,
      duration: 0.024,
      gain: 0.07 * vol,
    });
    return 0.18;
  }

  private playShotBurstAR(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.03) * pitch;
    // Punchy sub-thump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 108 * jitter,
      freqEnd: 38 * jitter,
      duration: 0.068,
      gain: 0.28 * vol,
    });
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 215 * jitter,
      freqEnd: 68 * jitter,
      duration: 0.075,
      gain: 0.36 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1600,
      filterFreqEnd: 360,
      wet: 0.12,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.11,
      gain: 0.4 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2300 * jitter,
      filterFreqEnd: 950 * jitter,
      filterQ: 1.9,
      distort: true,
      wet: 0.18,
    });
    // Crisp burst bolt snap tail
    this.noise(target, t + 0.055, {
      buffer: 'white',
      duration: 0.022,
      gain: 0.11 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3100 * pitch,
      filterQ: 3.5,
    });
    return 0.14;
  }

  private playShotPump(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.03) * pitch;
    // Deep chest-rattling sub-thump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 84 * jitter,
      freqEnd: 26 * jitter,
      duration: 0.18,
      gain: 0.48 * vol,
      wet: 0.18,
    });
    // Heavy blast
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 140 * jitter,
      freqEnd: 34 * jitter,
      duration: 0.21,
      gain: 0.65 * vol,
      wet: 0.22,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.25,
      gain: 0.62 * vol,
      filterType: 'lowpass',
      filterFreqStart: 3400 * jitter,
      filterFreqEnd: 420,
      distort: true,
      wet: 0.26,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.045,
      gain: 0.35 * vol,
      filterType: 'highpass',
      filterFreqStart: 1900,
    });
    // Classic pump-action rack ("chk-chk")
    this.noise(target, t + 0.22, {
      buffer: 'white',
      duration: 0.055,
      gain: 0.18 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1950 * pitch,
      filterQ: 3.2,
    });
    this.tone(target, t + 0.22, {
      type: 'square',
      freqStart: 620 * pitch,
      freqEnd: 480 * pitch,
      duration: 0.04,
      gain: 0.08 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1400,
    });
    this.noise(target, t + 0.31, {
      buffer: 'white',
      duration: 0.06,
      gain: 0.21 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2550 * pitch,
      filterQ: 3.5,
    });
    this.tone(target, t + 0.315, {
      type: 'triangle',
      freqStart: 880 * pitch,
      freqEnd: 620 * pitch,
      duration: 0.035,
      gain: 0.09 * vol,
    });
    return 0.44;
  }

  private playShotTac(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.04) * pitch;
    // Tight sub-thump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 94 * jitter,
      freqEnd: 30 * jitter,
      duration: 0.13,
      gain: 0.38 * vol,
      wet: 0.14,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 155 * jitter,
      freqEnd: 44 * jitter,
      duration: 0.15,
      gain: 0.52 * vol,
      wet: 0.18,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.18,
      gain: 0.48 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1550 * jitter,
      filterFreqEnd: 480,
      filterQ: 1.0,
      distort: true,
      wet: 0.2,
    });
    // Fast auto-bolt cycle snap + latch return
    this.noise(target, t + 0.095, {
      buffer: 'white',
      duration: 0.04,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2700 * pitch,
      filterQ: 3.0,
    });
    this.tone(target, t + 0.105, {
      type: 'triangle',
      freqStart: 660 * pitch,
      freqEnd: 520 * pitch,
      duration: 0.032,
      gain: 0.08 * vol,
    });
    return 0.21;
  }

  private playShotSMG(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.05) * pitch;
    this.tone(target, t, {
      type: 'square',
      freqStart: 245 * jitter,
      freqEnd: 88 * jitter,
      duration: 0.055,
      gain: 0.28 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1800,
      filterFreqEnd: 500,
      wet: 0.1,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.075,
      gain: 0.34 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2450 * jitter,
      filterFreqEnd: 1150,
      filterQ: 1.7,
      wet: 0.14,
    });
    return 0.1;
  }

  private playShotSniper(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.02) * pitch;
    // Seismic sub-bass cannon punch
    this.tone(target, t, {
      type: 'sine',
      freqStart: 88 * jitter,
      freqEnd: 24 * jitter,
      duration: 0.36,
      gain: 0.5 * vol,
      wet: 0.26,
    });
    // Supersonic crack + deep cannon thump
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 155 * jitter,
      freqEnd: 28 * jitter,
      duration: 0.34,
      gain: 0.62 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1400,
      filterFreqEnd: 160,
      wet: 0.34,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.45,
      gain: 0.58 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3600 * jitter,
      filterFreqEnd: 520,
      filterQ: 1.1,
      distort: true,
      wet: 0.36,
    });
    // High-caliber metallic ping
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1120 * jitter,
      freqEnd: 680 * jitter,
      duration: 0.12,
      gain: 0.18 * vol,
    });
    // Bolt-action cycle + lock-in click
    this.noise(target, t + 0.36, {
      buffer: 'white',
      duration: 0.045,
      gain: 0.16 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2800 * pitch,
      filterQ: 4.0,
    });
    this.tone(target, t + 0.46, {
      type: 'triangle',
      freqStart: 780 * pitch,
      freqEnd: 1180 * pitch,
      duration: 0.07,
      gain: 0.11 * vol,
    });
    this.noise(target, t + 0.58, {
      buffer: 'white',
      duration: 0.04,
      gain: 0.17 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200 * pitch,
      filterQ: 3.6,
    });
    this.tone(target, t + 0.61, {
      type: 'square',
      freqStart: 540 * pitch,
      freqEnd: 390 * pitch,
      duration: 0.03,
      gain: 0.07 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1800,
    });
    return 0.72;
  }

  private playShotPistol(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.04) * pitch;
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 290 * jitter,
      freqEnd: 78 * jitter,
      duration: 0.072,
      gain: 0.4 * vol,
      wet: 0.14,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.095,
      gain: 0.35 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2250 * jitter,
      filterFreqEnd: 880,
      filterQ: 1.5,
      wet: 0.16,
    });
    return 0.12;
  }

  private playShotRocket(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Tube thwump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 115 * pitch,
      freqEnd: 40 * pitch,
      duration: 0.25,
      gain: 0.55 * vol,
      wet: 0.2,
    });
    // Propellant whoosh ignition
    this.noise(target, t + 0.02, {
      buffer: 'pink',
      duration: 0.46,
      gain: 0.48 * vol,
      attack: 0.03,
      filterType: 'bandpass',
      filterFreqStart: 380 * pitch,
      filterFreqEnd: 1450 * pitch,
      filterQ: 1.2,
      wet: 0.25,
    });
    return 0.5;
  }

  private playShotHeavyShotgun(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.03) * pitch;
    // Deep booming primary sub-chamber thump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 128 * jitter,
      freqEnd: 28 * jitter,
      duration: 0.24,
      gain: 0.68 * vol,
      wet: 0.24,
    });
    // Secondary heavy barrel resonance
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 210 * jitter,
      freqEnd: 58 * jitter,
      duration: 0.17,
      gain: 0.36 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1150,
      filterFreqEnd: 260,
      wet: 0.18,
    });
    // Thick distorted shotgun blast
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.27,
      gain: 0.6 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2800 * jitter,
      filterFreqEnd: 340,
      distort: true,
      wet: 0.26,
    });
    // Sharp transient muzzle crack
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.038,
      gain: 0.32 * vol,
      filterType: 'highpass',
      filterFreqStart: 2100,
    });
    // Double-chamber heavy action clack tail
    this.noise(target, t + 0.14, {
      buffer: 'white',
      duration: 0.04,
      gain: 0.16 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1750 * pitch,
      filterQ: 3.4,
    });
    this.tone(target, t + 0.14, {
      type: 'triangle',
      freqStart: 440 * pitch,
      freqEnd: 310 * pitch,
      duration: 0.045,
      gain: 0.11 * vol,
    });
    this.noise(target, t + 0.21, {
      buffer: 'white',
      duration: 0.045,
      gain: 0.18 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2350 * pitch,
      filterQ: 3.8,
    });
    return 0.36;
  }

  private playShotMythicRifle(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.025) * pitch;
    // Crisp kinetic sub punch
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 220 * jitter,
      freqEnd: 54 * jitter,
      duration: 0.085,
      gain: 0.45 * vol,
      wet: 0.15,
    });
    // Futuristic plasma transient sweep
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 1580 * jitter,
      freqEnd: 340 * jitter,
      duration: 0.095,
      gain: 0.26 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2400 * jitter,
      filterFreqEnd: 780 * jitter,
      filterQ: 2.2,
      wet: 0.22,
    });
    // High-energy blade shimmer harmonic
    this.tone(target, t, {
      type: 'sine',
      freqStart: 920 * jitter,
      freqEnd: 1320 * jitter,
      duration: 0.06,
      gain: 0.14 * vol,
      wet: 0.25,
    });
    // Tight punchy muzzle snap
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.13,
      gain: 0.38 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2600 * jitter,
      filterFreqEnd: 920 * jitter,
      filterQ: 1.5,
      distort: true,
      wet: 0.2,
    });
    // Precision energy rail cycle
    this.tone(target, t + 0.065, {
      type: 'sine',
      freqStart: 2100 * pitch,
      freqEnd: 1400 * pitch,
      duration: 0.028,
      gain: 0.09 * vol,
    });
    return 0.17;
  }

  private playExplosion(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Deep sub shockwave
    this.tone(target, t, {
      type: 'sine',
      freqStart: 92 * pitch,
      freqEnd: 22 * pitch,
      duration: 0.65,
      gain: 0.75 * vol,
      wet: 0.28,
    });
    // Roaring lowpass blast
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.92,
      gain: 0.72 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2200 * pitch,
      filterFreqEnd: 130,
      distort: true,
      wet: 0.38,
    });
    // Mid crackle debris
    this.noise(target, t + 0.03, {
      buffer: 'white',
      duration: 0.42,
      gain: 0.34 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1100 * pitch,
      filterFreqEnd: 320,
      filterQ: 1.1,
      wet: 0.22,
    });
    return 0.95;
  }

  private playReload(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Mag release click
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.04,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1500 * pitch,
      filterQ: 3.5,
    });
    // Mag insert thud
    this.tone(target, t + 0.14, {
      type: 'triangle',
      freqStart: 210 * pitch,
      freqEnd: 140 * pitch,
      duration: 0.06,
      gain: 0.22 * vol,
    });
    // Slide rack
    this.tone(target, t + 0.26, {
      type: 'square',
      freqStart: 780 * pitch,
      freqEnd: 1260 * pitch,
      duration: 0.055,
      gain: 0.12 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200,
    });
    this.noise(target, t + 0.26, {
      buffer: 'white',
      duration: 0.05,
      gain: 0.26 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2700 * pitch,
      filterQ: 3.0,
    });
    return 0.35;
  }

  private playDryfire(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.03,
      gain: 0.24 * vol,
      filterType: 'highpass',
      filterFreqStart: 2800 * pitch,
    });
    this.tone(target, t, {
      type: 'square',
      freqStart: 1120 * pitch,
      freqEnd: 740 * pitch,
      duration: 0.025,
      gain: 0.14 * vol,
    });
    return 0.05;
  }

  // --- Harvesting & Building ---

  private playPickaxeSwing(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.05) * pitch;
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.18,
      attack: 0.03,
      gain: 0.32 * vol,
      filterType: 'bandpass',
      filterFreqStart: 420 * jitter,
      filterFreqEnd: 1650 * jitter,
      filterQ: 1.8,
    });
    return 0.2;
  }

  private playHitWood(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.06) * pitch;
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 205 * jitter,
      freqEnd: 88 * jitter,
      duration: 0.11,
      gain: 0.45 * vol,
      wet: 0.08,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.09,
      gain: 0.32 * vol,
      filterType: 'bandpass',
      filterFreqStart: 640 * jitter,
      filterFreqEnd: 380,
      filterQ: 3.0,
    });
    return 0.14;
  }

  private playHitBrick(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.06) * pitch;
    this.tone(target, t, {
      type: 'sine',
      freqStart: 145 * jitter,
      freqEnd: 56 * jitter,
      duration: 0.1,
      gain: 0.42 * vol,
      wet: 0.1,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.11,
      gain: 0.34 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1320 * jitter,
      filterFreqEnd: 650,
      filterQ: 1.8,
    });
    // Small stone grit tap
    this.noise(target, t + 0.035, {
      buffer: 'white',
      duration: 0.045,
      gain: 0.18 * vol,
      filterType: 'highpass',
      filterFreqStart: 2100,
    });
    return 0.14;
  }

  private playHitMetal(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.04) * pitch;
    this.tone(target, t, {
      type: 'sine',
      freqStart: 540 * jitter,
      freqEnd: 525 * jitter,
      duration: 0.26,
      gain: 0.3 * vol,
      wet: 0.16,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 865 * jitter,
      freqEnd: 840 * jitter,
      duration: 0.22,
      gain: 0.22 * vol,
      wet: 0.16,
    });
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1410 * jitter,
      duration: 0.14,
      gain: 0.14 * vol,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.045,
      gain: 0.28 * vol,
      filterType: 'highpass',
      filterFreqStart: 2400,
    });
    return 0.28;
  }

  private playWeakpointCrit(t: number, target: AudioNode, vol: number, pitch: number): number {
    if (this.lastWeakpointTime >= 0 && t - this.lastWeakpointTime <= WEAKPOINT_COMBO_WINDOW_SEC) {
      this.weakpointCombo = Math.min(this.weakpointCombo + 1, WEAKPOINT_SEMITONES.length - 1);
    } else {
      this.weakpointCombo = 0;
    }
    this.lastWeakpointTime = t;

    const semitones = WEAKPOINT_SEMITONES[this.weakpointCombo];
    const comboMult = Math.pow(2, semitones / 12) * pitch;

    // Punchy crit impact + ascending crystal double-chime
    this.tone(target, t, {
      type: 'sine',
      freqStart: 660 * comboMult,
      freqEnd: 990 * comboMult,
      duration: 0.14,
      gain: 0.36 * vol,
      wet: 0.22,
    });
    this.tone(target, t + 0.035, {
      type: 'triangle',
      freqStart: 1320 * comboMult,
      freqEnd: 1760 * comboMult,
      duration: 0.18,
      gain: 0.26 * vol,
      wet: 0.24,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.035,
      gain: 0.22 * vol,
      filterType: 'highpass',
      filterFreqStart: 2800,
    });
    return 0.23;
  }

  private playBuildWood(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 245 * pitch,
      freqEnd: 115 * pitch,
      duration: 0.07,
      gain: 0.38 * vol,
    });
    this.tone(target, t + 0.045, {
      type: 'triangle',
      freqStart: 360 * pitch,
      freqEnd: 185 * pitch,
      duration: 0.065,
      gain: 0.32 * vol,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.09,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 850,
      filterQ: 2.2,
    });
    return 0.14;
  }

  private playBuildBrick(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 135 * pitch,
      freqEnd: 52 * pitch,
      duration: 0.12,
      gain: 0.44 * vol,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.14,
      gain: 0.3 * vol,
      filterType: 'bandpass',
      filterFreqStart: 920 * pitch,
      filterFreqEnd: 460,
      filterQ: 1.7,
    });
    this.tone(target, t + 0.055, {
      type: 'triangle',
      freqStart: 180 * pitch,
      freqEnd: 85 * pitch,
      duration: 0.075,
      gain: 0.28 * vol,
    });
    return 0.17;
  }

  private playBuildMetal(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 420 * pitch,
      freqEnd: 380 * pitch,
      duration: 0.18,
      gain: 0.28 * vol,
      wet: 0.14,
    });
    this.tone(target, t + 0.03, {
      type: 'sine',
      freqStart: 790 * pitch,
      freqEnd: 920 * pitch,
      duration: 0.14,
      gain: 0.22 * vol,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.06,
      gain: 0.24 * vol,
      filterType: 'highpass',
      filterFreqStart: 2200,
    });
    return 0.21;
  }

  private playEditSelect(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 880 * pitch,
      freqEnd: 1175 * pitch,
      duration: 0.055,
      gain: 0.22 * vol,
    });
    return 0.07;
  }

  private playEditConfirm(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 587.33 * pitch,
      freqEnd: 880 * pitch,
      duration: 0.09,
      gain: 0.28 * vol,
      wet: 0.12,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.075,
      gain: 0.2 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1600,
      filterFreqEnd: 3200,
      filterQ: 2.0,
    });
    return 0.14;
  }

  private playStructureBreak(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 165 * pitch,
      freqEnd: 38 * pitch,
      duration: 0.28,
      gain: 0.42 * vol,
      filterType: 'lowpass',
      filterFreqStart: 900,
      filterFreqEnd: 150,
      wet: 0.2,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.38,
      gain: 0.48 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2400 * pitch,
      filterFreqEnd: 340,
      wet: 0.22,
    });
    this.noise(target, t + 0.09, {
      buffer: 'white',
      duration: 0.18,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1450,
      filterQ: 1.8,
    });
    return 0.42;
  }

  // --- Combat Feedback ---

  private playHitmarker(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 2450 * pitch,
      freqEnd: 1180 * pitch,
      duration: 0.036,
      gain: 0.28 * vol,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.025,
      gain: 0.2 * vol,
      filterType: 'highpass',
      filterFreqStart: 3200,
    });
    return 0.05;
  }

  private playShieldHit(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 980 * pitch,
      freqEnd: 1480 * pitch,
      duration: 0.095,
      gain: 0.28 * vol,
      wet: 0.16,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 1560 * pitch,
      freqEnd: 1240 * pitch,
      duration: 0.08,
      gain: 0.18 * vol,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.06,
      gain: 0.18 * vol,
      filterType: 'highpass',
      filterFreqStart: 3600,
    });
    return 0.12;
  }

  private playShieldBreak(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Low punch + bright crystalline glass shatter
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 210 * pitch,
      freqEnd: 55 * pitch,
      duration: 0.14,
      gain: 0.42 * vol,
    });
    const shards = [2600, 1980, 1460, 1020];
    for (let i = 0; i < shards.length; i++) {
      this.tone(target, t + i * 0.032, {
        type: 'sine',
        freqStart: shards[i] * pitch,
        freqEnd: shards[i] * 0.85 * pitch,
        duration: 0.11,
        gain: 0.22 * vol,
        wet: 0.24,
      });
    }
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.24,
      gain: 0.4 * vol,
      filterType: 'highpass',
      filterFreqStart: 3400,
      wet: 0.28,
    });
    return 0.28;
  }

  private playHeadshotDink(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Crisp metallic dink + rewarding harmonic ping
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1760 * pitch,
      freqEnd: 1680 * pitch,
      duration: 0.2,
      gain: 0.36 * vol,
      wet: 0.22,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 2640 * pitch,
      freqEnd: 2420 * pitch,
      duration: 0.15,
      gain: 0.24 * vol,
      wet: 0.2,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.03,
      gain: 0.26 * vol,
      filterType: 'highpass',
      filterFreqStart: 3500,
    });
    return 0.22;
  }

  private playElimination(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Rising digitized chime + drone beam-out swoosh
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      this.tone(target, t + i * 0.055, {
        type: 'triangle',
        freqStart: notes[i] * pitch,
        duration: 0.18,
        gain: 0.24 * vol,
        wet: 0.28,
      });
    }
    this.noise(target, t + 0.06, {
      buffer: 'pink',
      duration: 0.32,
      attack: 0.04,
      gain: 0.22 * vol,
      filterType: 'bandpass',
      filterFreqStart: 600,
      filterFreqEnd: 2800,
      filterQ: 2.5,
      wet: 0.3,
    });
    return 0.45;
  }

  // --- Loot, World & Movement ---

  private playChestOpen(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Latch pop
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 240 * pitch,
      freqEnd: 130 * pitch,
      duration: 0.07,
      gain: 0.26 * vol,
    });
    // Iconic golden major-9th bell arpeggio
    const arp = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
    for (let i = 0; i < arp.length; i++) {
      this.tone(target, t + 0.03 + i * 0.055, {
        type: 'sine',
        freqStart: arp[i] * pitch,
        duration: 0.34,
        gain: 0.2 * vol,
        wet: 0.35,
      });
      this.tone(target, t + 0.03 + i * 0.055, {
        type: 'triangle',
        freqStart: arp[i] * 2 * pitch,
        duration: 0.18,
        gain: 0.07 * vol,
        wet: 0.35,
      });
    }
    return 0.72;
  }

  private playLootPickup(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 540 * pitch,
      freqEnd: 1020 * pitch,
      duration: 0.075,
      gain: 0.24 * vol,
    });
    return 0.09;
  }

  private playBusHorn(t: number, target: AudioNode, vol: number, pitch: number): number {
    const playBlast = (start: number, dur: number): void => {
      const chord = [185, 233.08, 277.18];
      for (const freq of chord) {
        this.tone(target, start, {
          type: 'sawtooth',
          freqStart: freq * pitch,
          freqEnd: freq * 0.99 * pitch,
          duration: dur,
          attack: 0.02,
          gain: 0.16 * vol,
          filterType: 'lowpass',
          filterFreqStart: 1050,
          filterFreqEnd: 780,
          wet: 0.3,
        });
      }
    };
    playBlast(t, 0.18);
    playBlast(t + 0.24, 0.56);
    return 0.85;
  }

  private playGliderDeploy(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 195 * pitch,
      freqEnd: 62 * pitch,
      duration: 0.14,
      gain: 0.36 * vol,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.36,
      attack: 0.025,
      gain: 0.42 * vol,
      filterType: 'bandpass',
      filterFreqStart: 320 * pitch,
      filterFreqEnd: 1650 * pitch,
      filterQ: 1.2,
      wet: 0.18,
    });
    return 0.38;
  }

  private playHealStart(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 330 * pitch,
      freqEnd: 580 * pitch,
      duration: 0.24,
      attack: 0.03,
      gain: 0.2 * vol,
      wet: 0.2,
    });
    this.noise(target, t + 0.03, {
      buffer: 'white',
      duration: 0.22,
      attack: 0.04,
      gain: 0.12 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200,
      filterFreqEnd: 3400,
      filterQ: 4.0,
    });
    return 0.28;
  }

  private playHealFinish(t: number, target: AudioNode, vol: number, pitch: number): number {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      this.tone(target, t + i * 0.06, {
        type: 'sine',
        freqStart: notes[i] * pitch,
        duration: 0.26,
        gain: 0.22 * vol,
        wet: 0.28,
      });
    }
    return 0.46;
  }

  private playStormWarning(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 440 * pitch,
      freqEnd: 311.13 * pitch,
      duration: 0.25,
      gain: 0.24 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1400,
      filterFreqEnd: 650,
      wet: 0.26,
    });
    this.tone(target, t + 0.27, {
      type: 'sawtooth',
      freqStart: 440 * pitch,
      freqEnd: 293.66 * pitch,
      duration: 0.28,
      gain: 0.24 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1400,
      filterFreqEnd: 600,
      wet: 0.26,
    });
    return 0.58;
  }

  private playStormTick(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 230 * pitch,
      freqEnd: 88 * pitch,
      duration: 0.13,
      gain: 0.26 * vol,
      filterType: 'bandpass',
      filterFreqStart: 950,
      filterQ: 2.0,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.09,
      gain: 0.22 * vol,
      filterType: 'highpass',
      filterFreqStart: 2800,
    });
    return 0.15;
  }

  private playFootstep(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.09) * pitch;
    this.tone(target, t, {
      type: 'sine',
      freqStart: 102 * jitter,
      freqEnd: 46 * jitter,
      duration: 0.065,
      gain: 0.18 * vol,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.055,
      gain: 0.14 * vol,
      filterType: 'lowpass',
      filterFreqStart: 620 * jitter,
    });
    return 0.08;
  }

  private playJump(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 155 * pitch,
      freqEnd: 300 * pitch,
      duration: 0.095,
      gain: 0.2 * vol,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.08,
      gain: 0.12 * vol,
      filterType: 'bandpass',
      filterFreqStart: 700,
      filterFreqEnd: 1400,
      filterQ: 1.5,
    });
    return 0.11;
  }

  private playLand(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 118 * pitch,
      freqEnd: 38 * pitch,
      duration: 0.12,
      gain: 0.32 * vol,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.11,
      gain: 0.24 * vol,
      filterType: 'lowpass',
      filterFreqStart: 520,
    });
    return 0.14;
  }

  // --- UI & Victory ---

  private playUiClick(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 780 * pitch,
      freqEnd: 430 * pitch,
      duration: 0.042,
      gain: 0.22 * vol,
    });
    return 0.05;
  }

  private playUiHover(t: number, target: AudioNode, vol: number, pitch: number): number {
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1180 * pitch,
      freqEnd: 1320 * pitch,
      duration: 0.025,
      gain: 0.1 * vol,
    });
    return 0.035;
  }

  private playUiPlay(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Punchy Fortnite-style "DROP IN" power chord slam
    this.tone(target, t, {
      type: 'sine',
      freqStart: 110 * pitch,
      freqEnd: 36 * pitch,
      duration: 0.28,
      gain: 0.45 * vol,
      wet: 0.22,
    });
    const chord = [261.63, 392.0, 523.25, 783.99];
    for (const freq of chord) {
      this.tone(target, t, {
        type: 'triangle',
        freqStart: freq * pitch,
        duration: 0.36,
        gain: 0.16 * vol,
        wet: 0.28,
      });
    }
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.12,
      gain: 0.18 * vol,
      filterType: 'highpass',
      filterFreqStart: 2400,
      wet: 0.22,
    });
    return 0.42;
  }

  private playVictoryFanfare(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Sub celebration boom
    this.tone(target, t, {
      type: 'sine',
      freqStart: 110 * pitch,
      freqEnd: 34 * pitch,
      duration: 0.42,
      gain: 0.5 * vol,
      wet: 0.25,
    });

    // Heroic rising fanfare: C5 - E5 - G5 - C6 (sustained)
    const fanfare: Array<{ offset: number; freq: number; dur: number }> = [
      { offset: 0.0, freq: 523.25, dur: 0.18 },
      { offset: 0.16, freq: 659.25, dur: 0.18 },
      { offset: 0.32, freq: 783.99, dur: 0.22 },
      { offset: 0.5, freq: 1046.5, dur: 0.95 },
    ];
    for (const n of fanfare) {
      this.tone(target, t + n.offset, {
        type: 'sawtooth',
        freqStart: n.freq * pitch,
        duration: n.dur,
        attack: 0.015,
        gain: 0.18 * vol,
        filterType: 'lowpass',
        filterFreqStart: 2600,
        filterFreqEnd: 1300,
        wet: 0.34,
      });
      this.tone(target, t + n.offset, {
        type: 'triangle',
        freqStart: n.freq * 0.5 * pitch,
        duration: n.dur,
        attack: 0.015,
        gain: 0.14 * vol,
        wet: 0.28,
      });
    }

    // Warm triumphant final pad chord at t + 0.5
    for (const freq of [261.63, 329.63, 392.0, 523.25]) {
      this.tone(target, t + 0.5, {
        type: 'triangle',
        freqStart: freq * pitch,
        duration: 1.05,
        attack: 0.04,
        gain: 0.11 * vol,
        wet: 0.36,
      });
    }

    // Sparkly celebration cymbal/chime sweep
    this.noise(target, t + 0.5, {
      buffer: 'white',
      duration: 0.65,
      gain: 0.16 * vol,
      filterType: 'highpass',
      filterFreqStart: 4200,
      wet: 0.35,
    });

    return 1.65;
  }

  // --- Wave 1 Bespoke SFX ---

  private playBuildRepair(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Double ratchet wrench clicks
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.025,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2400 * pitch,
      filterQ: 4.5,
    });
    this.tone(target, t, {
      type: 'square',
      freqStart: 680 * pitch,
      freqEnd: 540 * pitch,
      duration: 0.028,
      gain: 0.14 * vol,
    });
    this.noise(target, t + 0.06, {
      buffer: 'white',
      duration: 0.025,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2900 * pitch,
      filterQ: 4.5,
    });
    this.tone(target, t + 0.06, {
      type: 'square',
      freqStart: 820 * pitch,
      freqEnd: 680 * pitch,
      duration: 0.028,
      gain: 0.15 * vol,
    });
    // Solid hammer tighten + confirmation chime
    this.tone(target, t + 0.12, {
      type: 'triangle',
      freqStart: 340 * pitch,
      freqEnd: 140 * pitch,
      duration: 0.08,
      gain: 0.34 * vol,
      wet: 0.12,
    });
    this.tone(target, t + 0.12, {
      type: 'sine',
      freqStart: 740 * pitch,
      freqEnd: 987.77 * pitch,
      duration: 0.11,
      gain: 0.18 * vol,
      wet: 0.16,
    });
    return 0.24;
  }

  private playKillStreak(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Punchy low sub accent
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 180 * pitch,
      freqEnd: 65 * pitch,
      duration: 0.14,
      gain: 0.36 * vol,
      wet: 0.18,
    });
    // Rising multi-tone arcade brass stab
    const notes = [587.33, 739.99, 880.0, 1174.66];
    for (let i = 0; i < notes.length; i++) {
      const dur = i === notes.length - 1 ? 0.32 : 0.095;
      this.tone(target, t + i * 0.06, {
        type: 'sawtooth',
        freqStart: notes[i] * pitch,
        duration: dur,
        gain: 0.2 * vol,
        filterType: 'lowpass',
        filterFreqStart: 3200,
        filterFreqEnd: 1400,
        wet: 0.28,
      });
    }
    this.tone(target, t + 0.18, {
      type: 'sine',
      freqStart: 1760 * pitch,
      duration: 0.26,
      gain: 0.13 * vol,
      wet: 0.3,
    });
    this.noise(target, t + 0.18, {
      buffer: 'white',
      duration: 0.22,
      gain: 0.14 * vol,
      filterType: 'highpass',
      filterFreqStart: 4000,
      wet: 0.26,
    });
    return 0.54;
  }

  private playLaunchPad(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Kinetic spring bounce
    this.tone(target, t, {
      type: 'sine',
      freqStart: 115 * pitch,
      freqEnd: 320 * pitch,
      duration: 0.16,
      gain: 0.42 * vol,
      wet: 0.2,
    });
    // Upward kinetic fan turbine sweep
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 180 * pitch,
      freqEnd: 920 * pitch,
      duration: 0.38,
      gain: 0.22 * vol,
      filterType: 'bandpass',
      filterFreqStart: 400 * pitch,
      filterFreqEnd: 2400 * pitch,
      filterQ: 2.0,
      wet: 0.24,
    });
    // Air rush whoosh
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.44,
      attack: 0.02,
      gain: 0.46 * vol,
      filterType: 'bandpass',
      filterFreqStart: 280 * pitch,
      filterFreqEnd: 2600 * pitch,
      filterQ: 1.3,
      wet: 0.25,
    });
    this.tone(target, t + 0.05, {
      type: 'triangle',
      freqStart: 523.25 * pitch,
      freqEnd: 1046.5 * pitch,
      duration: 0.26,
      gain: 0.16 * vol,
      wet: 0.28,
    });
    return 0.46;
  }

  private playZiplineAttach(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Magnetic lock snap + metallic clack
    this.tone(target, t, {
      type: 'square',
      freqStart: 460 * pitch,
      freqEnd: 185 * pitch,
      duration: 0.045,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1200,
      filterQ: 2.5,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.035,
      gain: 0.3 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2900 * pitch,
      filterQ: 4.0,
    });
    this.tone(target, t + 0.025, {
      type: 'sine',
      freqStart: 580 * pitch,
      freqEnd: 1160 * pitch,
      duration: 0.09,
      gain: 0.2 * vol,
      wet: 0.18,
    });
    this.tone(target, t + 0.04, {
      type: 'triangle',
      freqStart: 260 * pitch,
      freqEnd: 120 * pitch,
      duration: 0.055,
      gain: 0.26 * vol,
    });
    return 0.13;
  }

  private playZiplineLoop(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Electric rail hum + high-speed trolley whirr
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 185 * pitch,
      freqEnd: 196 * pitch,
      duration: 0.26,
      attack: 0.02,
      gain: 0.16 * vol,
      filterType: 'bandpass',
      filterFreqStart: 520 * pitch,
      filterFreqEnd: 740 * pitch,
      filterQ: 2.8,
      wet: 0.14,
    });
    this.tone(target, t, {
      type: 'sine',
      freqStart: 370 * pitch,
      freqEnd: 392 * pitch,
      duration: 0.26,
      attack: 0.02,
      gain: 0.12 * vol,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.24,
      attack: 0.025,
      gain: 0.15 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200 * pitch,
      filterFreqEnd: 2800 * pitch,
      filterQ: 3.6,
    });
    return 0.27;
  }

  private playSlideLoop(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.05) * pitch;
    // Filtered gravel friction
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.32,
      attack: 0.025,
      gain: 0.28 * vol,
      filterType: 'bandpass',
      filterFreqStart: 950 * jitter,
      filterFreqEnd: 520 * jitter,
      filterQ: 1.4,
      wet: 0.08,
    });
    // Cloth/wind rush
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.28,
      attack: 0.03,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2100 * jitter,
      filterFreqEnd: 1250 * jitter,
      filterQ: 1.1,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 92 * jitter,
      freqEnd: 56 * jitter,
      duration: 0.18,
      attack: 0.02,
      gain: 0.12 * vol,
    });
    return 0.34;
  }

  private playMantleClimb(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Hand-ledge grab thud
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 165 * pitch,
      freqEnd: 72 * pitch,
      duration: 0.07,
      gain: 0.28 * vol,
    });
    // Leather glove friction
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.085,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 780 * pitch,
      filterFreqEnd: 420 * pitch,
      filterQ: 2.2,
    });
    // Upward cloth pull
    this.noise(target, t + 0.07, {
      buffer: 'pink',
      duration: 0.19,
      attack: 0.02,
      gain: 0.22 * vol,
      filterType: 'bandpass',
      filterFreqStart: 480 * pitch,
      filterFreqEnd: 1380 * pitch,
      filterQ: 1.3,
    });
    this.tone(target, t + 0.06, {
      type: 'sine',
      freqStart: 135 * pitch,
      freqEnd: 225 * pitch,
      duration: 0.14,
      gain: 0.14 * vol,
    });
    return 0.27;
  }

  private playShockwaveBlast(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Deep kinetic sub-drop warp
    this.tone(target, t, {
      type: 'sine',
      freqStart: 160 * pitch,
      freqEnd: 26 * pitch,
      duration: 0.48,
      gain: 0.68 * vol,
      wet: 0.32,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 520 * pitch,
      freqEnd: 65 * pitch,
      duration: 0.28,
      gain: 0.34 * vol,
      wet: 0.25,
    });
    // Rising harmonic warp sweep
    this.tone(target, t + 0.02, {
      type: 'sine',
      freqStart: 190 * pitch,
      freqEnd: 960 * pitch,
      duration: 0.38,
      attack: 0.015,
      gain: 0.26 * vol,
      wet: 0.35,
    });
    this.tone(target, t + 0.02, {
      type: 'triangle',
      freqStart: 285 * pitch,
      freqEnd: 1440 * pitch,
      duration: 0.34,
      attack: 0.015,
      gain: 0.16 * vol,
      wet: 0.3,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.42,
      gain: 0.44 * vol,
      filterType: 'bandpass',
      filterFreqStart: 350 * pitch,
      filterFreqEnd: 2600 * pitch,
      filterQ: 1.8,
      distort: true,
      wet: 0.3,
    });
    return 0.52;
  }

  private playGrenadeBounce(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.05) * pitch;
    // Metallic clink ring partials
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1480 * jitter,
      freqEnd: 1320 * jitter,
      duration: 0.085,
      gain: 0.24 * vol,
      wet: 0.18,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 2290 * jitter,
      freqEnd: 2120 * jitter,
      duration: 0.065,
      gain: 0.16 * vol,
      wet: 0.18,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.025,
      gain: 0.22 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3100 * jitter,
      filterFreqEnd: 1900 * jitter,
      filterQ: 3.5,
    });
    this.tone(target, t, {
      type: 'sine',
      freqStart: 240 * jitter,
      freqEnd: 105 * jitter,
      duration: 0.04,
      gain: 0.16 * vol,
    });
    return 0.1;
  }

  private playSplashHeal(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Fizzy watery burst
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.24,
      gain: 0.3 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1200 * pitch,
      filterFreqEnd: 3600 * pitch,
      filterQ: 1.6,
      wet: 0.26,
    });
    // Bubbly watery chime droplets
    const bubbles = [
      { offset: 0.0, start: 420, end: 880, dur: 0.08 },
      { offset: 0.045, start: 660, end: 1320, dur: 0.09 },
      { offset: 0.09, start: 880, end: 1760, dur: 0.11 },
    ];
    for (const b of bubbles) {
      this.tone(target, t + b.offset, {
        type: 'sine',
        freqStart: b.start * pitch,
        freqEnd: b.end * pitch,
        duration: b.dur,
        gain: 0.2 * vol,
        wet: 0.25,
      });
    }
    this.tone(target, t + 0.06, {
      type: 'triangle',
      freqStart: 1046.5 * pitch,
      duration: 0.22,
      gain: 0.14 * vol,
      wet: 0.3,
    });
    this.tone(target, t + 0.08, {
      type: 'triangle',
      freqStart: 1318.51 * pitch,
      duration: 0.22,
      gain: 0.12 * vol,
      wet: 0.3,
    });
    // Effervescent fizz sizzle
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.26,
      gain: 0.15 * vol,
      filterType: 'highpass',
      filterFreqStart: 4200,
      wet: 0.2,
    });
    return 0.34;
  }

  private playFallDamage(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Heavy body impact thud
    this.tone(target, t, {
      type: 'sine',
      freqStart: 110 * pitch,
      freqEnd: 26 * pitch,
      duration: 0.22,
      gain: 0.62 * vol,
      wet: 0.18,
    });
    // Sharp crunch crack
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.12,
      gain: 0.48 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1650 * pitch,
      filterFreqEnd: 520,
      filterQ: 1.4,
      distort: true,
    });
    this.noise(target, t + 0.025, {
      buffer: 'white',
      duration: 0.055,
      gain: 0.3 * vol,
      filterType: 'highpass',
      filterFreqStart: 2400,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.24,
      gain: 0.34 * vol,
      filterType: 'lowpass',
      filterFreqStart: 680,
      filterFreqEnd: 180,
    });
    return 0.28;
  }

  private playLavaBurn(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Sizzling hiss + thermal rumble
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.36,
      gain: 0.36 * vol,
      filterType: 'highpass',
      filterFreqStart: 2600 * pitch,
      filterFreqEnd: 1800 * pitch,
      wet: 0.18,
    });
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 125 * pitch,
      freqEnd: 62 * pitch,
      duration: 0.24,
      gain: 0.24 * vol,
      filterType: 'lowpass',
      filterFreqStart: 420,
      filterFreqEnd: 180,
    });
    // Staggered molten crackle pops
    const pops = [0.0, 0.055, 0.13, 0.21];
    for (let i = 0; i < pops.length; i++) {
      this.noise(target, t + pops[i], {
        buffer: 'white',
        duration: 0.04,
        gain: 0.24 * vol,
        filterType: 'bandpass',
        filterFreqStart: (3200 + i * 380) * pitch,
        filterQ: 3.0,
      });
    }
    return 0.38;
  }

  private playPoiDiscover(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Airy cinematic add9 chord swell
    const padFreqs = [
      { freq: 293.66, type: 'sine' as OscillatorType, attack: 0.14, gain: 0.15, dur: 0.95 },
      { freq: 440.0, type: 'triangle' as OscillatorType, attack: 0.16, gain: 0.13, dur: 0.95 },
      { freq: 659.25, type: 'sine' as OscillatorType, attack: 0.18, gain: 0.11, dur: 0.9 },
      { freq: 739.99, type: 'sine' as OscillatorType, attack: 0.22, gain: 0.1, dur: 0.85 },
    ];
    for (const p of padFreqs) {
      this.tone(target, t, {
        type: p.type,
        freqStart: p.freq * pitch,
        duration: p.dur,
        attack: p.attack,
        gain: p.gain * vol,
        wet: 0.42,
      });
    }
    // Airy wind shimmer swell
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.75,
      attack: 0.18,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 600 * pitch,
      filterFreqEnd: 1800 * pitch,
      filterQ: 1.5,
      wet: 0.38,
    });
    // Horizon bell shimmer
    this.tone(target, t + 0.18, {
      type: 'sine',
      freqStart: 1479.98 * pitch,
      duration: 0.45,
      attack: 0.03,
      gain: 0.09 * vol,
      wet: 0.42,
    });
    return 1.0;
  }

  // --- Wave 2 Bespoke SFX ---

  private playVehicleBoost(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Deep afterburner bass ignition punch
    this.tone(target, t, {
      type: 'sine',
      freqStart: 108 * pitch,
      freqEnd: 34 * pitch,
      duration: 0.24,
      gain: 0.46 * vol,
      wet: 0.2,
    });
    // Turbine jet core spool-up
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 135 * pitch,
      freqEnd: 590 * pitch,
      duration: 0.42,
      attack: 0.025,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 360 * pitch,
      filterFreqEnd: 2400 * pitch,
      filterQ: 2.2,
      wet: 0.22,
    });
    // High-RPM jet turbine whine harmonic
    this.tone(target, t + 0.03, {
      type: 'sine',
      freqStart: 640 * pitch,
      freqEnd: 1860 * pitch,
      duration: 0.4,
      attack: 0.04,
      gain: 0.14 * vol,
      wet: 0.24,
    });
    // Thruster exhaust bass whoosh
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.52,
      attack: 0.03,
      gain: 0.44 * vol,
      filterType: 'bandpass',
      filterFreqStart: 240 * pitch,
      filterFreqEnd: 1950 * pitch,
      filterQ: 1.4,
      distort: true,
      wet: 0.26,
    });
    return 0.55;
  }

  private playVehicleHorn(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Dual-tone futuristic hover horn (chirp + sustained harmonic honk)
    const playDualPulse = (start: number, dur: number): void => {
      const tones = [
        { freq: 466.16, type: 'sawtooth' as OscillatorType, gain: 0.18 },
        { freq: 622.25, type: 'sawtooth' as OscillatorType, gain: 0.17 },
        { freq: 932.33, type: 'sine' as OscillatorType, gain: 0.09 },
      ];
      for (const n of tones) {
        this.tone(target, start, {
          type: n.type,
          freqStart: n.freq * pitch,
          freqEnd: n.freq * 0.992 * pitch,
          duration: dur,
          attack: 0.012,
          gain: n.gain * vol,
          filterType: 'lowpass',
          filterFreqStart: 2400,
          filterFreqEnd: 1450,
          wet: 0.22,
        });
      }
    };
    playDualPulse(t, 0.11);
    playDualPulse(t + 0.145, 0.26);
    return 0.42;
  }

  private playVehicleCrash(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.04) * pitch;
    // Heavy chassis impact thud
    this.tone(target, t, {
      type: 'sine',
      freqStart: 118 * jitter,
      freqEnd: 28 * jitter,
      duration: 0.22,
      gain: 0.58 * vol,
      wet: 0.18,
    });
    // Distorted frame crunch
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 195 * jitter,
      freqEnd: 42 * jitter,
      duration: 0.2,
      gain: 0.36 * vol,
      filterType: 'lowpass',
      filterFreqStart: 980,
      filterFreqEnd: 170,
    });
    // Inharmonic metallic panel clang partials
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 415 * jitter,
      freqEnd: 335 * jitter,
      duration: 0.22,
      gain: 0.22 * vol,
      wet: 0.2,
    });
    this.tone(target, t, {
      type: 'sine',
      freqStart: 740 * jitter,
      freqEnd: 615 * jitter,
      duration: 0.16,
      gain: 0.15 * vol,
      wet: 0.18,
    });
    // Crunchy fender debris & scrape
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.24,
      gain: 0.46 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1480 * jitter,
      filterFreqEnd: 410,
      filterQ: 1.5,
      distort: true,
      wet: 0.2,
    });
    this.noise(target, t + 0.095, {
      buffer: 'white',
      duration: 0.08,
      gain: 0.2 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1950 * pitch,
      filterQ: 2.6,
    });
    return 0.34;
  }

  private playGrapplerFire(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Pneumatic chamber launch punch
    this.tone(target, t, {
      type: 'sine',
      freqStart: 215 * pitch,
      freqEnd: 52 * pitch,
      duration: 0.095,
      gain: 0.44 * vol,
      wet: 0.12,
    });
    // Mechanical claw latch snap
    this.tone(target, t, {
      type: 'square',
      freqStart: 1280 * pitch,
      freqEnd: 740 * pitch,
      duration: 0.032,
      gain: 0.15 * vol,
    });
    // Compressed pneumatic air burst
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.14,
      gain: 0.38 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3200 * pitch,
      filterFreqEnd: 1100 * pitch,
      filterQ: 1.8,
      wet: 0.16,
    });
    // Zipping steel cable launch twang
    this.tone(target, t + 0.015, {
      type: 'triangle',
      freqStart: 520 * pitch,
      freqEnd: 1360 * pitch,
      duration: 0.095,
      gain: 0.22 * vol,
      wet: 0.16,
    });
    return 0.18;
  }

  private playGrapplerReel(t: number, target: AudioNode, vol: number, pitch: number): number {
    // High-speed motorized winch spool whirr
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 245 * pitch,
      freqEnd: 790 * pitch,
      duration: 0.32,
      attack: 0.015,
      gain: 0.2 * vol,
      filterType: 'bandpass',
      filterFreqStart: 720 * pitch,
      filterFreqEnd: 2450 * pitch,
      filterQ: 2.2,
      wet: 0.16,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 490 * pitch,
      freqEnd: 1420 * pitch,
      duration: 0.3,
      attack: 0.015,
      gain: 0.16 * vol,
    });
    // Rapid gear-tooth ratchet clicks
    const ratchetOffsets = [0.0, 0.075, 0.15, 0.225];
    for (let i = 0; i < ratchetOffsets.length; i++) {
      this.tone(target, t + ratchetOffsets[i], {
        type: 'square',
        freqStart: (980 + i * 240) * pitch,
        freqEnd: (1180 + i * 260) * pitch,
        duration: 0.03,
        gain: 0.09 * vol,
        filterType: 'bandpass',
        filterFreqStart: 1900 * pitch,
        filterQ: 3.0,
      });
    }
    // Taut cable wind rush
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.32,
      attack: 0.02,
      gain: 0.18 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1850 * pitch,
      filterFreqEnd: 3400 * pitch,
      filterQ: 2.6,
    });
    return 0.35;
  }

  private playShieldBubbleDeploy(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Sci-fi resonant dome expansion hum
    this.tone(target, t, {
      type: 'sine',
      freqStart: 92 * pitch,
      freqEnd: 225 * pitch,
      duration: 0.45,
      attack: 0.02,
      gain: 0.34 * vol,
      wet: 0.3,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 138 * pitch,
      freqEnd: 337.5 * pitch,
      duration: 0.42,
      attack: 0.02,
      gain: 0.2 * vol,
      filterType: 'lowpass',
      filterFreqStart: 900,
      filterFreqEnd: 1850,
      wet: 0.28,
    });
    // Resonant plasma dome sweep
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.48,
      attack: 0.025,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 320 * pitch,
      filterFreqEnd: 1850 * pitch,
      filterQ: 3.2,
      wet: 0.32,
    });
    // Crystalline hex-grid sparkle chime
    const sparkles = [987.77, 1318.51, 1567.98, 1975.53];
    for (let i = 0; i < sparkles.length; i++) {
      this.tone(target, t + 0.06 + i * 0.055, {
        type: 'sine',
        freqStart: sparkles[i] * pitch,
        duration: 0.24,
        gain: 0.14 * vol,
        wet: 0.38,
      });
    }
    this.noise(target, t + 0.08, {
      buffer: 'white',
      duration: 0.26,
      gain: 0.1 * vol,
      filterType: 'highpass',
      filterFreqStart: 4200,
      wet: 0.3,
    });
    return 0.56;
  }

  private playVaultUnlock(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Motorized deadbolt servo grind
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 88 * pitch,
      freqEnd: 138 * pitch,
      duration: 0.24,
      attack: 0.02,
      gain: 0.26 * vol,
      filterType: 'lowpass',
      filterFreqStart: 440,
      filterFreqEnd: 680,
      wet: 0.16,
    });
    // Heavy steel bolt disengage clunk
    this.tone(target, t + 0.14, {
      type: 'sine',
      freqStart: 136 * pitch,
      freqEnd: 36 * pitch,
      duration: 0.16,
      gain: 0.45 * vol,
      wet: 0.2,
    });
    this.noise(target, t + 0.14, {
      buffer: 'white',
      duration: 0.07,
      gain: 0.28 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1650 * pitch,
      filterQ: 3.0,
    });
    // Secondary locking pin snap + pneumatic door seal release
    this.tone(target, t + 0.25, {
      type: 'square',
      freqStart: 740 * pitch,
      freqEnd: 520 * pitch,
      duration: 0.04,
      gain: 0.15 * vol,
    });
    this.noise(target, t + 0.28, {
      buffer: 'pink',
      duration: 0.3,
      attack: 0.02,
      gain: 0.2 * vol,
      filterType: 'bandpass',
      filterFreqStart: 820 * pitch,
      filterFreqEnd: 2100 * pitch,
      filterQ: 1.6,
      wet: 0.25,
    });
    // Radiant golden vault chord chime
    const goldenChord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    for (let i = 0; i < goldenChord.length; i++) {
      this.tone(target, t + 0.3 + i * 0.045, {
        type: 'sine',
        freqStart: goldenChord[i] * pitch,
        duration: 0.42,
        gain: 0.17 * vol,
        wet: 0.38,
      });
      this.tone(target, t + 0.3 + i * 0.045, {
        type: 'triangle',
        freqStart: goldenChord[i] * 1.5 * pitch,
        duration: 0.22,
        gain: 0.06 * vol,
        wet: 0.35,
      });
    }
    return 0.82;
  }

  private playWeatherThunder(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.04) * pitch;
    // Sharp lightning sky-crack transient
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.09,
      gain: 0.42 * vol,
      filterType: 'highpass',
      filterFreqStart: 1400 * jitter,
      distort: true,
      wet: 0.36,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 340 * jitter,
      freqEnd: 68 * jitter,
      duration: 0.075,
      gain: 0.3 * vol,
    });
    // Deep rolling sub-bass thunder wave
    this.tone(target, t, {
      type: 'sine',
      freqStart: 74 * jitter,
      freqEnd: 24 * jitter,
      duration: 1.25,
      attack: 0.025,
      gain: 0.56 * vol,
      wet: 0.35,
    });
    // Primary lowpass rolling thunder cloud body
    this.noise(target, t, {
      buffer: 'pink',
      duration: 1.45,
      attack: 0.03,
      gain: 0.52 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1120 * jitter,
      filterFreqEnd: 95,
      distort: true,
      wet: 0.42,
    });
    // Secondary delayed valley echo roll
    this.noise(target, t + 0.38, {
      buffer: 'pink',
      duration: 0.95,
      attack: 0.08,
      gain: 0.3 * vol,
      filterType: 'lowpass',
      filterFreqStart: 580 * jitter,
      filterFreqEnd: 80,
      wet: 0.45,
    });
    return 1.55;
  }

  private playBountyAlert(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Low dramatic tactical tension sting
    this.tone(target, t, {
      type: 'sine',
      freqStart: 110 * pitch,
      freqEnd: 55 * pitch,
      duration: 0.28,
      gain: 0.38 * vol,
      wet: 0.22,
    });
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 220 * pitch,
      freqEnd: 146.83 * pitch,
      duration: 0.24,
      gain: 0.22 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1200,
      filterFreqEnd: 420,
      wet: 0.24,
    });
    // Dual pulsing radar lock pings
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1318.51 * pitch,
      duration: 0.16,
      gain: 0.26 * vol,
      wet: 0.35,
    });
    this.tone(target, t + 0.22, {
      type: 'sine',
      freqStart: 1760.0 * pitch,
      duration: 0.24,
      gain: 0.24 * vol,
      wet: 0.38,
    });
    // Radar sweep shimmer
    this.noise(target, t + 0.02, {
      buffer: 'white',
      duration: 0.18,
      gain: 0.12 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2400 * pitch,
      filterFreqEnd: 1600 * pitch,
      filterQ: 4.5,
      wet: 0.22,
    });
    return 0.52;
  }

  // --- Wave 3 Bespoke SFX ---

  private playUpgradeWeapon(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Hydraulic clamp snap: pneumatic hiss + mechanical lock thud + latch click
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.085,
      gain: 0.28 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3200 * pitch,
      filterFreqEnd: 1100 * pitch,
      filterQ: 2.0,
      wet: 0.14,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 210 * pitch,
      freqEnd: 68 * pitch,
      duration: 0.075,
      gain: 0.36 * vol,
      wet: 0.12,
    });
    this.tone(target, t + 0.012, {
      type: 'square',
      freqStart: 1120 * pitch,
      freqEnd: 720 * pitch,
      duration: 0.028,
      gain: 0.13 * vol,
    });

    // Metallic wrench clank double-strike
    this.tone(target, t + 0.1, {
      type: 'triangle',
      freqStart: 540 * pitch,
      freqEnd: 465 * pitch,
      duration: 0.09,
      gain: 0.22 * vol,
      wet: 0.18,
    });
    this.tone(target, t + 0.1, {
      type: 'sine',
      freqStart: 1340 * pitch,
      freqEnd: 1180 * pitch,
      duration: 0.07,
      gain: 0.14 * vol,
      wet: 0.18,
    });
    this.noise(target, t + 0.1, {
      buffer: 'white',
      duration: 0.025,
      gain: 0.2 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2800 * pitch,
      filterQ: 3.5,
    });

    this.tone(target, t + 0.18, {
      type: 'triangle',
      freqStart: 680 * pitch,
      freqEnd: 510 * pitch,
      duration: 0.11,
      gain: 0.26 * vol,
      wet: 0.22,
    });
    this.tone(target, t + 0.18, {
      type: 'sine',
      freqStart: 1620 * pitch,
      freqEnd: 1390 * pitch,
      duration: 0.095,
      gain: 0.14 * vol,
      wet: 0.2,
    });

    // Rising epic fifth-chord shimmer
    this.tone(target, t + 0.24, {
      type: 'sawtooth',
      freqStart: 220 * pitch,
      freqEnd: 440 * pitch,
      duration: 0.32,
      attack: 0.03,
      gain: 0.14 * vol,
      filterType: 'lowpass',
      filterFreqStart: 900,
      filterFreqEnd: 2800,
      wet: 0.3,
    });
    const fifthChord = [523.25, 783.99, 1046.5, 1567.98];
    for (let i = 0; i < fifthChord.length; i++) {
      this.tone(target, t + 0.25 + i * 0.032, {
        type: 'sine',
        freqStart: fifthChord[i] * pitch,
        duration: 0.34,
        attack: 0.02,
        gain: 0.15 * vol,
        wet: 0.36,
      });
      this.tone(target, t + 0.25 + i * 0.032, {
        type: 'triangle',
        freqStart: fifthChord[i] * 1.5 * pitch,
        duration: 0.22,
        attack: 0.02,
        gain: 0.06 * vol,
        wet: 0.32,
      });
    }
    this.noise(target, t + 0.25, {
      buffer: 'white',
      duration: 0.24,
      gain: 0.1 * vol,
      filterType: 'highpass',
      filterFreqStart: 4400,
      wet: 0.3,
    });
    return 0.66;
  }

  private playCampfireIgnite(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Double flint spark strike transient
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.03,
      gain: 0.32 * vol,
      filterType: 'bandpass',
      filterFreqStart: 4200 * pitch,
      filterFreqEnd: 2600 * pitch,
      filterQ: 3.2,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 2650 * pitch,
      freqEnd: 1450 * pitch,
      duration: 0.032,
      gain: 0.18 * vol,
    });
    this.noise(target, t + 0.045, {
      buffer: 'white',
      duration: 0.028,
      gain: 0.26 * vol,
      filterType: 'highpass',
      filterFreqStart: 3600,
    });
    this.tone(target, t + 0.045, {
      type: 'sine',
      freqStart: 3100 * pitch,
      freqEnd: 1850 * pitch,
      duration: 0.025,
      gain: 0.14 * vol,
    });

    // Warm filtered whoosh ignite burst
    this.tone(target, t + 0.07, {
      type: 'sine',
      freqStart: 135 * pitch,
      freqEnd: 48 * pitch,
      duration: 0.22,
      attack: 0.012,
      gain: 0.4 * vol,
      wet: 0.18,
    });
    this.noise(target, t + 0.07, {
      buffer: 'pink',
      duration: 0.42,
      attack: 0.025,
      gain: 0.42 * vol,
      filterType: 'lowpass',
      filterFreqStart: 320 * pitch,
      filterFreqEnd: 1250 * pitch,
      wet: 0.24,
    });
    this.noise(target, t + 0.085, {
      buffer: 'pink',
      duration: 0.38,
      attack: 0.03,
      gain: 0.22 * vol,
      filterType: 'bandpass',
      filterFreqStart: 950 * pitch,
      filterFreqEnd: 480 * pitch,
      filterQ: 1.2,
      wet: 0.2,
    });

    // Kindling crackle snaps
    const crackles = [0.14, 0.23, 0.32];
    for (let i = 0; i < crackles.length; i++) {
      this.noise(target, t + crackles[i], {
        buffer: 'white',
        duration: 0.032,
        gain: 0.16 * vol,
        filterType: 'bandpass',
        filterFreqStart: (2400 + i * 320) * pitch,
        filterQ: 3.0,
      });
    }
    return 0.54;
  }

  private playCampfireHeal(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Soft crackling ember pops
    this.tone(target, t, {
      type: 'sine',
      freqStart: 210 * pitch,
      freqEnd: 115 * pitch,
      duration: 0.045,
      gain: 0.15 * vol,
      wet: 0.14,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.028,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2400 * pitch,
      filterQ: 3.4,
      wet: 0.15,
    });
    this.noise(target, t + 0.08, {
      buffer: 'pink',
      duration: 0.06,
      gain: 0.1 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1400 * pitch,
      filterFreqEnd: 860 * pitch,
      filterQ: 1.8,
    });

    // Warm major-third chime (F4 -> A4 + soft octave F5 glow)
    this.tone(target, t + 0.025, {
      type: 'sine',
      freqStart: 349.23 * pitch,
      duration: 0.28,
      attack: 0.015,
      gain: 0.18 * vol,
      wet: 0.28,
    });
    this.tone(target, t + 0.025, {
      type: 'triangle',
      freqStart: 349.23 * pitch,
      duration: 0.22,
      attack: 0.018,
      gain: 0.08 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1100,
    });
    this.tone(target, t + 0.085, {
      type: 'sine',
      freqStart: 440.0 * pitch,
      duration: 0.3,
      attack: 0.015,
      gain: 0.18 * vol,
      wet: 0.3,
    });
    this.tone(target, t + 0.13, {
      type: 'sine',
      freqStart: 698.46 * pitch,
      duration: 0.24,
      attack: 0.025,
      gain: 0.085 * vol,
      wet: 0.32,
    });
    return 0.42;
  }

  private playSlurpBarrelBreak(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Pressurized tank crack
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 175 * pitch,
      freqEnd: 52 * pitch,
      duration: 0.12,
      gain: 0.44 * vol,
      wet: 0.16,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.065,
      gain: 0.4 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1900 * pitch,
      filterFreqEnd: 750 * pitch,
      filterQ: 2.0,
      distort: true,
    });
    this.tone(target, t, {
      type: 'square',
      freqStart: 780 * pitch,
      freqEnd: 420 * pitch,
      duration: 0.045,
      gain: 0.12 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1600,
    });

    // Bubbly low-pass liquid splash
    this.noise(target, t + 0.02, {
      buffer: 'pink',
      duration: 0.32,
      attack: 0.01,
      gain: 0.36 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1850 * pitch,
      filterFreqEnd: 380 * pitch,
      filterQ: 1.8,
      wet: 0.24,
    });
    const bubbles = [
      { offset: 0.04, start: 480, end: 980, dur: 0.075 },
      { offset: 0.085, start: 620, end: 1280, dur: 0.085 },
      { offset: 0.135, start: 790, end: 1580, dur: 0.09 },
      { offset: 0.19, start: 920, end: 1820, dur: 0.095 },
    ];
    for (const b of bubbles) {
      this.tone(target, t + b.offset, {
        type: 'sine',
        freqStart: b.start * pitch,
        freqEnd: b.end * pitch,
        duration: b.dur,
        gain: 0.18 * vol,
        wet: 0.24,
      });
    }

    // Bright effervescent slurp fizz + chime accent
    this.noise(target, t + 0.04, {
      buffer: 'white',
      duration: 0.38,
      attack: 0.02,
      gain: 0.2 * vol,
      filterType: 'highpass',
      filterFreqStart: 3900,
      wet: 0.25,
    });
    this.tone(target, t + 0.11, {
      type: 'sine',
      freqStart: 1174.66 * pitch,
      duration: 0.24,
      gain: 0.13 * vol,
      wet: 0.3,
    });
    return 0.48;
  }

  private playQuestComplete(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Crisp tactile sub accent
    this.tone(target, t, {
      type: 'sine',
      freqStart: 164.81 * pitch,
      freqEnd: 82.41 * pitch,
      duration: 0.14,
      gain: 0.28 * vol,
      wet: 0.18,
    });

    // Triumphant 3-note heroic arpeggio chime (D5 -> F#5 -> D6) with clean sustain tail
    const arpeggio: Array<{ offset: number; freq: number; dur: number; gain: number }> = [
      { offset: 0.0, freq: 587.33, dur: 0.22, gain: 0.2 },
      { offset: 0.11, freq: 739.99, dur: 0.24, gain: 0.22 },
      { offset: 0.22, freq: 1174.66, dur: 0.58, gain: 0.24 },
    ];
    for (const note of arpeggio) {
      this.tone(target, t + note.offset, {
        type: 'sine',
        freqStart: note.freq * pitch,
        duration: note.dur,
        attack: 0.01,
        gain: note.gain * vol,
        wet: 0.36,
      });
      this.tone(target, t + note.offset, {
        type: 'triangle',
        freqStart: note.freq * 0.5 * pitch,
        duration: note.dur * 0.9,
        attack: 0.012,
        gain: note.gain * 0.55 * vol,
        wet: 0.28,
      });
    }

    // Sustained warm fifth bed & shimmer tail on final note
    this.tone(target, t + 0.22, {
      type: 'triangle',
      freqStart: 880.0 * pitch,
      duration: 0.54,
      attack: 0.025,
      gain: 0.12 * vol,
      wet: 0.36,
    });
    this.noise(target, t + 0.22, {
      buffer: 'white',
      duration: 0.36,
      gain: 0.09 * vol,
      filterType: 'highpass',
      filterFreqStart: 4600,
      wet: 0.35,
    });
    return 0.84;
  }

  private playOvershieldRecharge(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Futuristic rising FM electric sweep
    const fmDur = 0.46;
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    const carrierStart = Math.max(20, 240 * pitch);
    const carrierEnd = Math.max(20, 660 * pitch);
    carrier.frequency.setValueAtTime(carrierStart, t);
    carrier.frequency.exponentialRampToValueAtTime(carrierEnd, t + 0.44);

    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    const modStart = Math.max(20, 120 * pitch);
    const modEnd = Math.max(20, 330 * pitch);
    mod.frequency.setValueAtTime(modStart, t);
    mod.frequency.exponentialRampToValueAtTime(modEnd, t + 0.44);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(0.0001, t);
    modGain.gain.linearRampToValueAtTime(Math.max(0.5, 95 * pitch), t + 0.16);
    modGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 14 * pitch), t + 0.44);

    const fmEnv = this.ctx.createGain();
    const peakFmGain = Math.max(0.0002, 0.24 * vol);
    fmEnv.gain.setValueAtTime(0.0001, t);
    fmEnv.gain.linearRampToValueAtTime(peakFmGain, t + 0.14);
    fmEnv.gain.exponentialRampToValueAtTime(0.0001, t + fmDur);

    mod.connect(modGain);
    try {
      modGain.connect(carrier.frequency);
    } catch {
      // Ignore AudioParam connect errors on minimal mocks
    }

    const fmFilter = this.safeCreateFilter();
    if (fmFilter) {
      fmFilter.type = 'lowpass';
      fmFilter.frequency?.setValueAtTime?.(820, t);
      fmFilter.frequency?.exponentialRampToValueAtTime?.(3200, t + 0.44);
      carrier.connect(fmFilter);
      fmFilter.connect(fmEnv);
    } else {
      carrier.connect(fmEnv);
    }

    fmEnv.connect(target);
    this.routeWet(fmEnv, t, fmDur, 0.28);
    mod.start(t);
    carrier.start(t);
    mod.stop(t + fmDur + 0.015);
    carrier.stop(t + fmDur + 0.015);

    // Smooth triangle harmonic swell
    this.tone(target, t + 0.04, {
      type: 'triangle',
      freqStart: 360 * pitch,
      freqEnd: 990 * pitch,
      duration: 0.42,
      attack: 0.12,
      gain: 0.18 * vol,
      filterType: 'lowpass',
      filterFreqStart: 900,
      filterFreqEnd: 2800,
      wet: 0.28,
    });

    // High electric shimmer + crystalline lock chimes
    this.noise(target, t + 0.08, {
      buffer: 'white',
      duration: 0.38,
      attack: 0.06,
      gain: 0.13 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1600 * pitch,
      filterFreqEnd: 4200 * pitch,
      filterQ: 2.8,
      wet: 0.32,
    });
    this.tone(target, t + 0.18, {
      type: 'sine',
      freqStart: 1318.51 * pitch,
      duration: 0.26,
      attack: 0.015,
      gain: 0.12 * vol,
      wet: 0.34,
    });
    this.tone(target, t + 0.26, {
      type: 'sine',
      freqStart: 1760.0 * pitch,
      duration: 0.26,
      attack: 0.015,
      gain: 0.12 * vol,
      wet: 0.34,
    });
    return 0.54;
  }

  // --- Wave 4 Bespoke SFX ---

  private playRiftTeleport(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Dramatic dimensional tear noise sweep
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.46,
      attack: 0.01,
      gain: 0.44 * vol,
      filterType: 'bandpass',
      filterFreqStart: 220 * pitch,
      filterFreqEnd: 3400 * pitch,
      filterQ: 2.6,
      distort: true,
      wet: 0.34,
    });
    this.noise(target, t + 0.012, {
      buffer: 'white',
      duration: 0.24,
      attack: 0.008,
      gain: 0.26 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3600 * pitch,
      filterFreqEnd: 1350 * pitch,
      filterQ: 2.2,
      wet: 0.28,
    });

    // Deep dimensional gravity pull + glassy resonant pitch-drop warp
    this.tone(target, t, {
      type: 'sine',
      freqStart: 220 * pitch,
      freqEnd: 34 * pitch,
      duration: 0.46,
      gain: 0.46 * vol,
      wet: 0.28,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 1280 * pitch,
      freqEnd: 165 * pitch,
      duration: 0.36,
      gain: 0.26 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2400 * pitch,
      filterFreqEnd: 420 * pitch,
      filterQ: 3.4,
      wet: 0.36,
    });
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1920 * pitch,
      freqEnd: 248 * pitch,
      duration: 0.34,
      gain: 0.18 * vol,
      wet: 0.34,
    });

    // Re-entry sky snap + crystalline shimmer tail
    this.tone(target, t + 0.22, {
      type: 'sine',
      freqStart: 340 * pitch,
      freqEnd: 1180 * pitch,
      duration: 0.26,
      attack: 0.015,
      gain: 0.22 * vol,
      wet: 0.35,
    });
    const shimmers = [1046.5, 1318.51, 1567.98, 2093.0];
    for (let i = 0; i < shimmers.length; i++) {
      this.tone(target, t + 0.26 + i * 0.045, {
        type: 'sine',
        freqStart: shimmers[i] * pitch,
        duration: 0.38,
        attack: 0.015,
        gain: 0.11 * vol,
        wet: 0.44,
      });
    }
    this.noise(target, t + 0.26, {
      buffer: 'white',
      duration: 0.42,
      attack: 0.04,
      gain: 0.12 * vol,
      filterType: 'highpass',
      filterFreqStart: 4200,
      wet: 0.38,
    });
    return 0.78;
  }

  private playAugmentReady(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Hologram projection warm boot swell & scan hiss
    this.tone(target, t, {
      type: 'sine',
      freqStart: 146.83 * pitch,
      freqEnd: 220 * pitch,
      duration: 0.38,
      attack: 0.02,
      gain: 0.24 * vol,
      wet: 0.26,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.22,
      attack: 0.015,
      gain: 0.12 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1200 * pitch,
      filterFreqEnd: 3800 * pitch,
      filterQ: 3.6,
      wet: 0.28,
    });

    // Futuristic dual-oscillator hologram boot chime (D5 -> A5 -> D6)
    const bootNotes: Array<{ offset: number; freq: number; dur: number; detune: number }> = [
      { offset: 0.02, freq: 587.33, dur: 0.22, detune: 7 },
      { offset: 0.11, freq: 880.0, dur: 0.24, detune: -6 },
      { offset: 0.2, freq: 1174.66, dur: 0.38, detune: 8 },
    ];
    for (const note of bootNotes) {
      this.tone(target, t + note.offset, {
        type: 'sine',
        freqStart: note.freq * pitch,
        duration: note.dur,
        attack: 0.01,
        gain: 0.19 * vol,
        wet: 0.34,
      });
      this.tone(target, t + note.offset, {
        type: 'triangle',
        freqStart: note.freq * pitch,
        detune: note.detune,
        duration: note.dur * 0.92,
        attack: 0.012,
        gain: 0.11 * vol,
        filterType: 'lowpass',
        filterFreqStart: 2800,
        filterFreqEnd: 1500,
        wet: 0.3,
      });
    }

    // Holo harmonic shimmer bell
    this.tone(target, t + 0.22, {
      type: 'sine',
      freqStart: 1760.0 * pitch,
      duration: 0.34,
      attack: 0.02,
      gain: 0.09 * vol,
      wet: 0.38,
    });
    return 0.62;
  }

  private playAugmentSelect(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Crisp cyber lock-in transient & confirm sweep
    this.tone(target, t, {
      type: 'square',
      freqStart: 1240 * pitch,
      freqEnd: 620 * pitch,
      duration: 0.035,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200 * pitch,
      filterQ: 2.2,
    });
    this.tone(target, t, {
      type: 'sine',
      freqStart: 145 * pitch,
      freqEnd: 52 * pitch,
      duration: 0.14,
      gain: 0.36 * vol,
      wet: 0.16,
    });
    this.tone(target, t + 0.01, {
      type: 'sawtooth',
      freqStart: 320 * pitch,
      freqEnd: 1280 * pitch,
      duration: 0.16,
      gain: 0.18 * vol,
      filterType: 'bandpass',
      filterFreqStart: 700 * pitch,
      filterFreqEnd: 3400 * pitch,
      filterQ: 2.5,
      wet: 0.24,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.12,
      gain: 0.16 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200 * pitch,
      filterFreqEnd: 4600 * pitch,
      filterQ: 2.4,
      wet: 0.22,
    });

    // Bright power chord harmonic confirm
    const powerChord = [523.25, 783.99, 1046.5, 1318.51];
    for (const freq of powerChord) {
      this.tone(target, t + 0.085, {
        type: 'sine',
        freqStart: freq * pitch,
        duration: 0.42,
        attack: 0.01,
        gain: 0.14 * vol,
        wet: 0.34,
      });
      this.tone(target, t + 0.085, {
        type: 'triangle',
        freqStart: freq * 0.5 * pitch,
        duration: 0.36,
        attack: 0.012,
        gain: 0.08 * vol,
        wet: 0.3,
      });
    }
    this.noise(target, t + 0.1, {
      buffer: 'white',
      duration: 0.28,
      gain: 0.1 * vol,
      filterType: 'highpass',
      filterFreqStart: 4200,
      wet: 0.32,
    });
    return 0.56;
  }

  private playFlagTick(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Clean metallic ratchet notch tick (<0.12s)
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 920 * pitch,
      freqEnd: 580 * pitch,
      duration: 0.045,
      attack: 0.002,
      gain: 0.22 * vol,
      wet: 0.12,
    });
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1840 * pitch,
      freqEnd: 1620 * pitch,
      duration: 0.068,
      attack: 0.002,
      gain: 0.15 * vol,
      wet: 0.16,
    });
    this.tone(target, t, {
      type: 'square',
      freqStart: 1480 * pitch,
      freqEnd: 980 * pitch,
      duration: 0.022,
      attack: 0.001,
      gain: 0.09 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2400 * pitch,
      filterQ: 3.2,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.026,
      gain: 0.16 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3200 * pitch,
      filterQ: 3.8,
      wet: 0.1,
    });
    this.noise(target, t + 0.014, {
      buffer: 'white',
      duration: 0.022,
      gain: 0.1 * vol,
      filterType: 'highpass',
      filterFreqStart: 4200,
      wet: 0.12,
    });
    return 0.085;
  }

  private playFlagCaptured(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Heroic sub impact
    this.tone(target, t, {
      type: 'sine',
      freqStart: 120 * pitch,
      freqEnd: 38 * pitch,
      duration: 0.34,
      gain: 0.44 * vol,
      wet: 0.24,
    });

    // Triumphant brassy-synth heroic fanfare stab (G4 -> B4 -> D5 -> G5 chord stab)
    const leadStabs: Array<{ offset: number; freq: number; dur: number }> = [
      { offset: 0.0, freq: 392.0, dur: 0.12 },
      { offset: 0.11, freq: 493.88, dur: 0.12 },
      { offset: 0.22, freq: 587.33, dur: 0.14 },
    ];
    for (const stab of leadStabs) {
      this.tone(target, t + stab.offset, {
        type: 'sawtooth',
        freqStart: stab.freq * pitch,
        duration: stab.dur,
        attack: 0.01,
        gain: 0.16 * vol,
        filterType: 'lowpass',
        filterFreqStart: 2800,
        filterFreqEnd: 1300,
        wet: 0.28,
      });
      this.tone(target, t + stab.offset, {
        type: 'triangle',
        freqStart: stab.freq * 0.5 * pitch,
        duration: stab.dur,
        attack: 0.01,
        gain: 0.12 * vol,
        wet: 0.24,
      });
    }

    const victoryChord = [392.0, 587.33, 783.99, 987.77];
    for (const freq of victoryChord) {
      this.tone(target, t + 0.33, {
        type: 'sawtooth',
        freqStart: freq * pitch,
        duration: 0.58,
        attack: 0.015,
        gain: 0.13 * vol,
        filterType: 'lowpass',
        filterFreqStart: 3000,
        filterFreqEnd: 1200,
        wet: 0.34,
      });
      this.tone(target, t + 0.33, {
        type: 'triangle',
        freqStart: freq * 0.5 * pitch,
        duration: 0.56,
        attack: 0.015,
        gain: 0.1 * vol,
        wet: 0.3,
      });
    }

    // Firework launch fizz + sparkle tail
    this.noise(target, t + 0.34, {
      buffer: 'white',
      duration: 0.18,
      gain: 0.16 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1600 * pitch,
      filterFreqEnd: 4600 * pitch,
      filterQ: 2.4,
      wet: 0.3,
    });
    const sparkles = [1567.98, 2093.0, 2349.32, 3135.96];
    for (let i = 0; i < sparkles.length; i++) {
      this.tone(target, t + 0.48 + i * 0.065, {
        type: 'sine',
        freqStart: sparkles[i] * pitch,
        duration: 0.18,
        gain: 0.1 * vol,
        wet: 0.4,
      });
    }
    this.noise(target, t + 0.48, {
      buffer: 'white',
      duration: 0.46,
      gain: 0.14 * vol,
      filterType: 'highpass',
      filterFreqStart: 4500,
      wet: 0.38,
    });
    return 1.05;
  }

  private playTacticalPing(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Crisp holo cursor click transient
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.025,
      gain: 0.15 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3100 * pitch,
      filterQ: 3.4,
    });

    // Primary sonar/holo radar ping beep
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1567.98 * pitch,
      duration: 0.22,
      attack: 0.004,
      gain: 0.26 * vol,
      wet: 0.3,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 783.99 * pitch,
      duration: 0.18,
      attack: 0.004,
      gain: 0.12 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2200,
      wet: 0.24,
    });

    // Clean delay-style echo harmonic taps
    this.tone(target, t + 0.13, {
      type: 'sine',
      freqStart: 1567.98 * pitch,
      duration: 0.2,
      attack: 0.005,
      gain: 0.14 * vol,
      wet: 0.36,
    });
    this.tone(target, t + 0.13, {
      type: 'sine',
      freqStart: 2349.32 * pitch,
      duration: 0.16,
      attack: 0.005,
      gain: 0.06 * vol,
      wet: 0.38,
    });
    this.tone(target, t + 0.26, {
      type: 'sine',
      freqStart: 1567.98 * pitch,
      duration: 0.22,
      attack: 0.006,
      gain: 0.075 * vol,
      wet: 0.4,
    });
    return 0.5;
  }

  private playBarrelExplode(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Pressurized steel rupture punch & shrapnel clang
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 260 * pitch,
      freqEnd: 46 * pitch,
      duration: 0.16,
      gain: 0.56 * vol,
      wet: 0.18,
    });
    this.tone(target, t, {
      type: 'square',
      freqStart: 690 * pitch,
      freqEnd: 310 * pitch,
      duration: 0.09,
      gain: 0.18 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1450 * pitch,
      filterQ: 2.8,
      wet: 0.2,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.075,
      gain: 0.44 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2400 * pitch,
      filterFreqEnd: 920 * pitch,
      filterQ: 1.9,
      distort: true,
      wet: 0.22,
    });

    // Deep sub boom
    this.tone(target, t, {
      type: 'sine',
      freqStart: 102 * pitch,
      freqEnd: 22 * pitch,
      duration: 0.72,
      gain: 0.78 * vol,
      wet: 0.3,
    });

    // High-energy fire roar & swirling flame tail
    this.noise(target, t + 0.015, {
      buffer: 'pink',
      duration: 0.96,
      attack: 0.008,
      gain: 0.7 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2800 * pitch,
      filterFreqEnd: 165,
      distort: true,
      wet: 0.38,
    });
    this.noise(target, t + 0.03, {
      buffer: 'white',
      duration: 0.56,
      attack: 0.02,
      gain: 0.34 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1650 * pitch,
      filterFreqEnd: 420,
      filterQ: 1.0,
      wet: 0.26,
    });
    return 1.04;
  }

  // --- Wave 5 Bespoke SFX ---

  private playShotDmr(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.025) * pitch;
    // Crisp high-velocity sub-bass receiver punch
    this.tone(target, t, {
      type: 'sine',
      freqStart: 138 * jitter,
      freqEnd: 36 * jitter,
      duration: 0.11,
      gain: 0.42 * vol,
      wet: 0.14,
    });
    // Tight suppressed/thermal precision body thump
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 275 * jitter,
      freqEnd: 64 * jitter,
      duration: 0.095,
      gain: 0.36 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1950,
      filterFreqEnd: 420,
      wet: 0.18,
    });
    // Suppressed mechanical receiver snap
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 960 * jitter,
      freqEnd: 240 * jitter,
      duration: 0.052,
      gain: 0.22 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200 * jitter,
      filterFreqEnd: 780 * jitter,
      filterQ: 2.1,
      wet: 0.16,
    });
    // Tight supersonic suppressed air crack
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.15,
      gain: 0.38 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3400 * jitter,
      filterFreqEnd: 920,
      filterQ: 1.8,
      distort: true,
      wet: 0.24,
    });
    // High-velocity supersonic crack tail + precision bolt return click
    this.noise(target, t + 0.02, {
      buffer: 'white',
      duration: 0.18,
      gain: 0.19 * vol,
      filterType: 'highpass',
      filterFreqStart: 2600,
      filterFreqEnd: 1100,
      wet: 0.28,
    });
    this.tone(target, t + 0.085, {
      type: 'sine',
      freqStart: 1480 * pitch,
      freqEnd: 1020 * pitch,
      duration: 0.032,
      gain: 0.085 * vol,
    });
    return 0.26;
  }

  private playKineticSlash(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.04) * pitch;
    // Kinetic blade momentum swing body
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 170 * jitter,
      freqEnd: 78 * jitter,
      duration: 0.16,
      attack: 0.012,
      gain: 0.3 * vol,
      wet: 0.18,
    });
    // Razor-sharp cyber blade arc sweep
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 440 * jitter,
      freqEnd: 1960 * jitter,
      duration: 0.18,
      attack: 0.015,
      gain: 0.19 * vol,
      filterType: 'bandpass',
      filterFreqStart: 880 * jitter,
      filterFreqEnd: 3900 * jitter,
      filterQ: 3.0,
      wet: 0.28,
    });

    // FM resonant neon shimmer edge
    const fmDur = 0.22;
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    const carrierStart = Math.max(20, 1520 * jitter);
    const carrierEnd = Math.max(20, 2240 * jitter);
    carrier.frequency.setValueAtTime(carrierStart, t + 0.02);
    carrier.frequency.exponentialRampToValueAtTime(carrierEnd, t + 0.02 + fmDur);

    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    const modStart = Math.max(20, 410 * jitter);
    const modEnd = Math.max(20, 620 * jitter);
    mod.frequency.setValueAtTime(modStart, t + 0.02);
    mod.frequency.exponentialRampToValueAtTime(modEnd, t + 0.02 + fmDur);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(0.0001, t + 0.02);
    modGain.gain.linearRampToValueAtTime(Math.max(0.5, 160 * pitch), t + 0.06);
    modGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 18 * pitch), t + 0.02 + fmDur);

    const fmEnv = this.ctx.createGain();
    const peakFmGain = Math.max(0.0002, 0.16 * vol);
    fmEnv.gain.setValueAtTime(0.0001, t + 0.02);
    fmEnv.gain.linearRampToValueAtTime(peakFmGain, t + 0.055);
    fmEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + fmDur);

    mod.connect(modGain);
    try {
      modGain.connect(carrier.frequency);
    } catch {
      // Ignore AudioParam connect errors on minimal mocks
    }

    const fmFilter = this.safeCreateFilter();
    if (fmFilter) {
      fmFilter.type = 'bandpass';
      fmFilter.frequency?.setValueAtTime?.(Math.max(25, 2400 * jitter), t + 0.02);
      fmFilter.frequency?.exponentialRampToValueAtTime?.(
        Math.max(25, 4200 * jitter),
        t + 0.02 + fmDur,
      );
      fmFilter.Q?.setValueAtTime?.(2.4, t + 0.02);
      carrier.connect(fmFilter);
      fmFilter.connect(fmEnv);
    } else {
      carrier.connect(fmEnv);
    }

    fmEnv.connect(target);
    this.routeWet(fmEnv, t + 0.02, fmDur, 0.36);
    mod.start(t + 0.02);
    carrier.start(t + 0.02);
    mod.stop(t + 0.02 + fmDur + 0.015);
    carrier.stop(t + 0.02 + fmDur + 0.015);

    // High resonant neon katana harmonic tail
    this.tone(target, t + 0.035, {
      type: 'sine',
      freqStart: 2480 * jitter,
      freqEnd: 2120 * jitter,
      detune: 9,
      duration: 0.22,
      attack: 0.012,
      gain: 0.12 * vol,
      wet: 0.38,
    });
    // Air-cutting cyber katana whoosh + plasma air edge
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.22,
      attack: 0.016,
      gain: 0.36 * vol,
      filterType: 'bandpass',
      filterFreqStart: 750 * jitter,
      filterFreqEnd: 4800 * jitter,
      filterQ: 2.3,
      distort: true,
      wet: 0.28,
    });
    this.noise(target, t + 0.02, {
      buffer: 'pink',
      duration: 0.19,
      attack: 0.014,
      gain: 0.22 * vol,
      filterType: 'highpass',
      filterFreqStart: 2200 * jitter,
      filterFreqEnd: 5200 * jitter,
      wet: 0.3,
    });
    return 0.28;
  }

  private playKineticDash(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Energetic bass displacement thump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 185 * pitch,
      freqEnd: 28 * pitch,
      duration: 0.32,
      gain: 0.58 * vol,
      wet: 0.26,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 360 * pitch,
      freqEnd: 62 * pitch,
      duration: 0.18,
      gain: 0.32 * vol,
      wet: 0.2,
    });
    // Ascending sci-fi kinetic warp sweep
    this.tone(target, t + 0.015, {
      type: 'sawtooth',
      freqStart: 210 * pitch,
      freqEnd: 1420 * pitch,
      duration: 0.34,
      attack: 0.015,
      gain: 0.2 * vol,
      filterType: 'bandpass',
      filterFreqStart: 520 * pitch,
      filterFreqEnd: 3800 * pitch,
      filterQ: 2.5,
      wet: 0.32,
    });
    this.tone(target, t + 0.025, {
      type: 'sine',
      freqStart: 315 * pitch,
      freqEnd: 1860 * pitch,
      duration: 0.35,
      attack: 0.02,
      gain: 0.18 * vol,
      wet: 0.36,
    });
    // High neon slipstream shimmer tail
    this.tone(target, t + 0.14, {
      type: 'sine',
      freqStart: 1480 * pitch,
      freqEnd: 980 * pitch,
      duration: 0.24,
      attack: 0.02,
      gain: 0.11 * vol,
      wet: 0.4,
    });
    // Slipstream air displacement whoosh
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.38,
      attack: 0.012,
      gain: 0.38 * vol,
      filterType: 'bandpass',
      filterFreqStart: 320 * pitch,
      filterFreqEnd: 3200 * pitch,
      filterQ: 1.9,
      distort: true,
      wet: 0.3,
    });
    this.noise(target, t + 0.03, {
      buffer: 'white',
      duration: 0.34,
      attack: 0.02,
      gain: 0.22 * vol,
      filterType: 'highpass',
      filterFreqStart: 1900 * pitch,
      filterFreqEnd: 4600 * pitch,
      wet: 0.34,
    });
    return 0.46;
  }

  private playGoldPickup(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.03) * pitch;
    // First gold coin metallic clink (E6 + bright octave overtone)
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1318.51 * jitter,
      freqEnd: 1308 * jitter,
      duration: 0.14,
      attack: 0.002,
      gain: 0.22 * vol,
      wet: 0.22,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 2637.02 * jitter,
      duration: 0.09,
      attack: 0.002,
      gain: 0.14 * vol,
      wet: 0.24,
    });
    // Second twin-coin strike (A6 + crystalline harmonic)
    this.tone(target, t + 0.065, {
      type: 'sine',
      freqStart: 1760.0 * jitter,
      freqEnd: 1748 * jitter,
      duration: 0.18,
      attack: 0.002,
      gain: 0.24 * vol,
      wet: 0.28,
    });
    this.tone(target, t + 0.065, {
      type: 'triangle',
      freqStart: 3520.0 * jitter,
      duration: 0.12,
      attack: 0.002,
      gain: 0.13 * vol,
      wet: 0.28,
    });
    // Crystalline glint ping tail
    this.tone(target, t + 0.11, {
      type: 'sine',
      freqStart: 2637.02 * jitter,
      duration: 0.26,
      attack: 0.005,
      gain: 0.15 * vol,
      wet: 0.4,
    });
    // Tactile metallic coin impact transients
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.025,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 4200 * jitter,
      filterQ: 4.0,
      wet: 0.18,
    });
    this.noise(target, t + 0.065, {
      buffer: 'white',
      duration: 0.03,
      gain: 0.13 * vol,
      filterType: 'highpass',
      filterFreqStart: 5000,
      wet: 0.24,
    });
    return 0.4;
  }

  private playVendingBuy(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Cheerful electronic servo motor spin-up
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 180 * pitch,
      freqEnd: 390 * pitch,
      duration: 0.19,
      attack: 0.015,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 480 * pitch,
      filterFreqEnd: 1450 * pitch,
      filterQ: 2.2,
      wet: 0.16,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 360 * pitch,
      freqEnd: 540 * pitch,
      duration: 0.18,
      attack: 0.015,
      gain: 0.13 * vol,
      wet: 0.18,
    });
    this.noise(target, t + 0.01, {
      buffer: 'white',
      duration: 0.16,
      attack: 0.01,
      gain: 0.12 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1200 * pitch,
      filterFreqEnd: 2400 * pitch,
      filterQ: 2.6,
      wet: 0.16,
    });
    // Two-tone cheerful arcade purchase confirm chime (G5 -> C6)
    this.tone(target, t + 0.14, {
      type: 'sine',
      freqStart: 783.99 * pitch,
      duration: 0.14,
      attack: 0.004,
      gain: 0.21 * vol,
      wet: 0.26,
    });
    this.tone(target, t + 0.24, {
      type: 'sine',
      freqStart: 1046.5 * pitch,
      duration: 0.26,
      attack: 0.004,
      gain: 0.23 * vol,
      wet: 0.32,
    });
    this.tone(target, t + 0.24, {
      type: 'triangle',
      freqStart: 1567.98 * pitch,
      duration: 0.18,
      attack: 0.006,
      gain: 0.09 * vol,
      wet: 0.3,
    });
    // Dispenser chute drop thud & mechanical hatch clack
    this.tone(target, t + 0.31, {
      type: 'sine',
      freqStart: 160 * pitch,
      freqEnd: 58 * pitch,
      duration: 0.09,
      attack: 0.002,
      gain: 0.28 * vol,
      wet: 0.16,
    });
    this.noise(target, t + 0.31, {
      buffer: 'white',
      duration: 0.045,
      gain: 0.2 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2100 * pitch,
      filterFreqEnd: 950 * pitch,
      filterQ: 2.4,
      wet: 0.18,
    });
    return 0.54;
  }

  private playAllyHired(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Tactical squad radio squelch & double chirp
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.055,
      gain: 0.18 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2500 * pitch,
      filterQ: 3.4,
      wet: 0.15,
    });
    this.tone(target, t + 0.01, {
      type: 'sine',
      freqStart: 1380 * pitch,
      freqEnd: 1760 * pitch,
      duration: 0.045,
      attack: 0.002,
      gain: 0.16 * vol,
      wet: 0.2,
    });
    this.tone(target, t + 0.065, {
      type: 'sine',
      freqStart: 1760 * pitch,
      freqEnd: 2080 * pitch,
      duration: 0.045,
      attack: 0.002,
      gain: 0.15 * vol,
      wet: 0.2,
    });
    // Warm sub confirm thump
    this.tone(target, t + 0.12, {
      type: 'sine',
      freqStart: 130.81 * pitch,
      freqEnd: 65.41 * pitch,
      duration: 0.18,
      gain: 0.32 * vol,
      wet: 0.2,
    });
    // Warm major-triad squad-up synth fanfare (C5 -> E5 -> G5 -> C6)
    const fanfareNotes: Array<{ offset: number; freq: number; dur: number }> = [
      { offset: 0.12, freq: 523.25, dur: 0.24 },
      { offset: 0.19, freq: 659.25, dur: 0.26 },
      { offset: 0.26, freq: 783.99, dur: 0.32 },
      { offset: 0.33, freq: 1046.5, dur: 0.48 },
    ];
    for (const note of fanfareNotes) {
      this.tone(target, t + note.offset, {
        type: 'triangle',
        freqStart: note.freq * pitch,
        duration: note.dur,
        attack: 0.014,
        gain: 0.18 * vol,
        wet: 0.32,
      });
      this.tone(target, t + note.offset, {
        type: 'sawtooth',
        freqStart: note.freq * 0.5 * pitch,
        duration: note.dur * 0.9,
        attack: 0.016,
        gain: 0.1 * vol,
        filterType: 'lowpass',
        filterFreqStart: 2400,
        filterFreqEnd: 1100,
        wet: 0.34,
      });
    }
    // Radio sign-off shimmer air tail
    this.noise(target, t + 0.34, {
      buffer: 'white',
      duration: 0.26,
      attack: 0.02,
      gain: 0.1 * vol,
      filterType: 'highpass',
      filterFreqStart: 3800,
      wet: 0.34,
    });
    return 0.85;
  }

  private playLootIslandSpawn(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Thunderous sky rift sub boom
    this.tone(target, t, {
      type: 'sine',
      freqStart: 105 * pitch,
      freqEnd: 24 * pitch,
      duration: 0.88,
      gain: 0.72 * vol,
      wet: 0.36,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 210 * pitch,
      freqEnd: 44 * pitch,
      duration: 0.54,
      gain: 0.38 * vol,
      wet: 0.3,
    });
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.95,
      attack: 0.015,
      gain: 0.55 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2600 * pitch,
      filterFreqEnd: 180,
      distort: true,
      wet: 0.4,
    });
    this.noise(target, t + 0.02, {
      buffer: 'white',
      duration: 0.42,
      attack: 0.012,
      gain: 0.28 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3200 * pitch,
      filterFreqEnd: 780 * pitch,
      filterQ: 1.6,
      wet: 0.35,
    });

    // Ethereal rising harmonic spire swell (G4 - D5 - F#5 - B5 - D6)
    this.tone(target, t + 0.14, {
      type: 'sine',
      freqStart: 196 * pitch,
      freqEnd: 587.33 * pitch,
      duration: 0.62,
      attack: 0.06,
      gain: 0.22 * vol,
      wet: 0.42,
    });
    const spireChord = [392.0, 587.33, 739.99, 987.77, 1174.66];
    for (let i = 0; i < spireChord.length; i++) {
      this.tone(target, t + 0.22 + i * 0.055, {
        type: 'sine',
        freqStart: spireChord[i] * pitch,
        duration: 0.72,
        attack: 0.04,
        gain: 0.14 * vol,
        wet: 0.46,
      });
      this.tone(target, t + 0.22 + i * 0.055, {
        type: 'triangle',
        freqStart: spireChord[i] * pitch,
        detune: i % 2 === 0 ? 6 : -6,
        duration: 0.64,
        attack: 0.05,
        gain: 0.08 * vol,
        filterType: 'lowpass',
        filterFreqStart: 2800,
        filterFreqEnd: 1400,
        wet: 0.42,
      });
    }
    this.noise(target, t + 0.32, {
      buffer: 'white',
      duration: 0.78,
      attack: 0.08,
      gain: 0.13 * vol,
      filterType: 'highpass',
      filterFreqStart: 3600,
      wet: 0.45,
    });
    return 1.22;
  }

  // --- Wave 6 Bespoke SFX ---

  private playShotCombatSMG(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.04) * pitch;
    // Tight punchy chest sub-thump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 122 * jitter,
      freqEnd: 40 * jitter,
      duration: 0.065,
      gain: 0.34 * vol,
      wet: 0.1,
    });
    // Aggressive mid-punch body
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 310 * jitter,
      freqEnd: 92 * jitter,
      duration: 0.06,
      gain: 0.3 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2200,
      filterFreqEnd: 580,
      wet: 0.12,
    });
    // Crisp tactical transient snap
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 680 * jitter,
      freqEnd: 240 * jitter,
      duration: 0.032,
      gain: 0.2 * vol,
    });
    // Fast bolt-carrier snap tail
    this.tone(target, t + 0.048, {
      type: 'triangle',
      freqStart: 940 * pitch,
      freqEnd: 640 * pitch,
      duration: 0.022,
      gain: 0.09 * vol,
    });
    // High-pressure muzzle crack
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.085,
      gain: 0.38 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2900 * jitter,
      filterFreqEnd: 1150 * jitter,
      filterQ: 1.8,
      distort: true,
      wet: 0.16,
    });
    // Fast mechanical bolt cycle hiss
    this.noise(target, t + 0.046, {
      buffer: 'white',
      duration: 0.026,
      gain: 0.13 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3600 * pitch,
      filterQ: 3.2,
    });
    return 0.115;
  }

  private playBowDraw(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Carbon-fiber limb flex creak
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 96 * pitch,
      freqEnd: 168 * pitch,
      duration: 0.34,
      attack: 0.04,
      gain: 0.22 * vol,
      filterType: 'lowpass',
      filterFreqStart: 540,
      filterFreqEnd: 980,
      wet: 0.14,
    });
    // String tension harmonic resonance
    this.tone(target, t + 0.02, {
      type: 'sawtooth',
      freqStart: 180 * pitch,
      freqEnd: 410 * pitch,
      duration: 0.32,
      attack: 0.05,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 460 * pitch,
      filterFreqEnd: 1480 * pitch,
      filterQ: 2.8,
      wet: 0.18,
    });
    // Subtle compound pulley ratchet ticks
    const ticks = [
      { offset: 0.08, start: 920, end: 1140 },
      { offset: 0.18, start: 1080, end: 1320 },
    ];
    for (const tick of ticks) {
      this.tone(target, t + tick.offset, {
        type: 'square',
        freqStart: tick.start * pitch,
        freqEnd: tick.end * pitch,
        duration: 0.022,
        gain: 0.07 * vol,
        filterType: 'bandpass',
        filterFreqStart: 2100 * pitch,
        filterQ: 3.5,
      });
    }
    // Explosive arrow tip charge hum
    this.tone(target, t + 0.1, {
      type: 'sine',
      freqStart: 520 * pitch,
      freqEnd: 1040 * pitch,
      duration: 0.24,
      attack: 0.06,
      gain: 0.11 * vol,
      wet: 0.22,
    });
    // Taut bowstring friction draw
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.32,
      attack: 0.05,
      gain: 0.22 * vol,
      filterType: 'bandpass',
      filterFreqStart: 620 * pitch,
      filterFreqEnd: 1950 * pitch,
      filterQ: 2.2,
    });
    // Crisp arrow notch settle whisper
    this.noise(target, t + 0.22, {
      buffer: 'white',
      duration: 0.08,
      attack: 0.015,
      gain: 0.11 * vol,
      filterType: 'highpass',
      filterFreqStart: 3200,
    });
    return 0.38;
  }

  private playBowRelease(t: number, target: AudioNode, vol: number, pitch: number): number {
    const jitter = this.pitchJitter(0.03) * pitch;
    // Deep bowstring release thump
    this.tone(target, t, {
      type: 'sine',
      freqStart: 155 * jitter,
      freqEnd: 44 * jitter,
      duration: 0.12,
      gain: 0.42 * vol,
      wet: 0.16,
    });
    // Elastic bowstring twang
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 340 * jitter,
      freqEnd: 135 * jitter,
      duration: 0.22,
      gain: 0.34 * vol,
      filterType: 'bandpass',
      filterFreqStart: 680 * jitter,
      filterFreqEnd: 280 * jitter,
      filterQ: 2.6,
      wet: 0.22,
    });
    // Plucked metallic string overtone
    this.tone(target, t, {
      type: 'sawtooth',
      freqStart: 510 * jitter,
      freqEnd: 210 * jitter,
      duration: 0.16,
      gain: 0.18 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2100,
      filterFreqEnd: 620,
      wet: 0.2,
    });
    // Explosive-tipped arrow flight whistle
    this.tone(target, t + 0.015, {
      type: 'sine',
      freqStart: 1620 * jitter,
      freqEnd: 880 * jitter,
      duration: 0.24,
      attack: 0.01,
      gain: 0.14 * vol,
      wet: 0.28,
    });
    // Crisp bowstring snap transient
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.045,
      gain: 0.3 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2600 * jitter,
      filterFreqEnd: 1100,
      filterQ: 2.0,
      distort: true,
    });
    // Feathered fletching air zip
    this.noise(target, t + 0.015, {
      buffer: 'pink',
      duration: 0.24,
      gain: 0.32 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1400 * jitter,
      filterFreqEnd: 4200 * jitter,
      filterQ: 1.8,
      wet: 0.24,
    });
    return 0.3;
  }

  private playKnockedDown(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Heavy body-drop sub thud
    this.tone(target, t, {
      type: 'sine',
      freqStart: 112 * pitch,
      freqEnd: 28 * pitch,
      duration: 0.28,
      gain: 0.54 * vol,
      wet: 0.22,
    });
    // Urgent descending two-step DBNO distress horn + warning pulse
    const distressSteps = [
      { offset: 0.0, hornStart: 440, hornEnd: 293.66, chimeStart: 880, chimeEnd: 622.25, dur: 0.18 },
      { offset: 0.14, hornStart: 349.23, hornEnd: 220, chimeStart: 622.25, chimeEnd: 415.3, dur: 0.32 },
    ];
    for (const step of distressSteps) {
      this.tone(target, t + step.offset, {
        type: 'sawtooth',
        freqStart: step.hornStart * pitch,
        freqEnd: step.hornEnd * pitch,
        duration: step.dur,
        attack: 0.008,
        gain: 0.22 * vol,
        filterType: 'lowpass',
        filterFreqStart: 1800,
        filterFreqEnd: 480,
        wet: 0.28,
      });
      this.tone(target, t + step.offset, {
        type: 'triangle',
        freqStart: step.chimeStart * pitch,
        freqEnd: step.chimeEnd * pitch,
        duration: step.dur * 0.9,
        attack: 0.008,
        gain: 0.19 * vol,
        wet: 0.3,
      });
    }
    // Muffled tactical radio static drop & knee impact crunch
    this.noise(target, t, {
      buffer: 'pink',
      duration: 0.22,
      gain: 0.32 * vol,
      filterType: 'lowpass',
      filterFreqStart: 1400,
      filterFreqEnd: 240,
      distort: true,
      wet: 0.24,
    });
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.06,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1850 * pitch,
      filterFreqEnd: 650,
      filterQ: 1.6,
    });
    return 0.52;
  }

  private playReviveTick(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Soft warm heartbeat pulse
    this.tone(target, t, {
      type: 'sine',
      freqStart: 130 * pitch,
      freqEnd: 78 * pitch,
      duration: 0.075,
      attack: 0.008,
      gain: 0.22 * vol,
      wet: 0.16,
    });
    // Clean medical monitor harmonic ping
    this.tone(target, t + 0.012, {
      type: 'sine',
      freqStart: 783.99 * pitch,
      freqEnd: 880 * pitch,
      duration: 0.095,
      attack: 0.006,
      gain: 0.16 * vol,
      wet: 0.24,
    });
    this.tone(target, t + 0.012, {
      type: 'triangle',
      freqStart: 1174.66 * pitch,
      duration: 0.07,
      attack: 0.006,
      gain: 0.08 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2200,
      wet: 0.2,
    });
    // Subtle nanite air hiss transient
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.035,
      attack: 0.004,
      gain: 0.09 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2800 * pitch,
      filterQ: 3.0,
      wet: 0.18,
    });
    return 0.13;
  }

  private playReviveComplete(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Warm chest relief sub-bass swell
    this.tone(target, t, {
      type: 'sine',
      freqStart: 98 * pitch,
      freqEnd: 196 * pitch,
      duration: 0.28,
      attack: 0.015,
      gain: 0.34 * vol,
      wet: 0.22,
    });
    // Rising medical surge sweep
    this.tone(target, t + 0.02, {
      type: 'sawtooth',
      freqStart: 261.63 * pitch,
      freqEnd: 523.25 * pitch,
      duration: 0.34,
      attack: 0.02,
      gain: 0.14 * vol,
      filterType: 'lowpass',
      filterFreqStart: 900,
      filterFreqEnd: 2800,
      wet: 0.28,
    });
    // Uplifting major rescue arpeggio (C5 -> E5 -> G5 -> C6)
    this.playHarmonicProgression(
      target,
      t,
      pitch,
      vol,
      [
        { offset: 0.04, freq: 523.25, dur: 0.22, gain: 0.18 },
        { offset: 0.11, freq: 659.25, dur: 0.24, gain: 0.19 },
        { offset: 0.18, freq: 783.99, dur: 0.3, gain: 0.2 },
        { offset: 0.25, freq: 1046.5, dur: 0.46, gain: 0.23 },
      ],
      'sine',
      'triangle',
      0.5,
      0.36,
    );
    // Sparkling nanite relief breeze & high shimmer
    this.noise(target, t + 0.08, {
      buffer: 'white',
      duration: 0.42,
      attack: 0.04,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1600 * pitch,
      filterFreqEnd: 4800 * pitch,
      filterQ: 2.0,
      wet: 0.32,
    });
    this.noise(target, t + 0.22, {
      buffer: 'white',
      duration: 0.32,
      attack: 0.03,
      gain: 0.1 * vol,
      filterType: 'highpass',
      filterFreqStart: 4400,
      wet: 0.36,
    });
    return 0.78;
  }

  private playMedallionPickup(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Heavy mythic gold seal impact & bronze strike partials
    this.tone(target, t, {
      type: 'sine',
      freqStart: 110 * pitch,
      freqEnd: 42 * pitch,
      duration: 0.26,
      gain: 0.48 * vol,
      wet: 0.24,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 587.33 * pitch,
      freqEnd: 580 * pitch,
      duration: 0.22,
      attack: 0.002,
      gain: 0.22 * vol,
      wet: 0.24,
    });
    this.tone(target, t, {
      type: 'sine',
      freqStart: 1760.0 * pitch,
      freqEnd: 1745 * pitch,
      duration: 0.24,
      attack: 0.002,
      gain: 0.15 * vol,
      wet: 0.28,
    });

    // Majestic Boss Medallion brass/synth fanfare motif (D5 -> A5 -> D6 -> F#6)
    this.playHarmonicProgression(
      target,
      t,
      pitch,
      vol,
      [
        { offset: 0.05, freq: 587.33, dur: 0.18, gain: 0.15 },
        { offset: 0.13, freq: 880.0, dur: 0.2, gain: 0.16 },
        { offset: 0.21, freq: 1174.66, dur: 0.28, gain: 0.17 },
        { offset: 0.29, freq: 1479.98, dur: 0.56, gain: 0.2 },
      ],
      'sawtooth',
      'sine',
      0.5,
      0.34,
      2600,
    );

    // Golden mythic FM aura halo
    this.playFmAura(target, t + 0.18, 0.54, 587.33 * pitch, 1174.66 * pitch, 293.66 * pitch, 587.33 * pitch, 110 * pitch, 0.15 * vol, 1400, 3600, 0.36);

    // Metallic seal clink & stardust shimmer tail
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.04,
      gain: 0.24 * vol,
      filterType: 'bandpass',
      filterFreqStart: 3600 * pitch,
      filterQ: 3.2,
      wet: 0.2,
    });
    this.noise(target, t + 0.2, {
      buffer: 'white',
      duration: 0.48,
      attack: 0.04,
      gain: 0.14 * vol,
      filterType: 'highpass',
      filterFreqStart: 4200,
      wet: 0.38,
    });
    return 0.95;
  }

  private playCrownGlint(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Regal warm chime anchor
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 659.25 * pitch,
      duration: 0.32,
      attack: 0.008,
      gain: 0.16 * vol,
      wet: 0.3,
    });
    // Radiant golden crown glint cascade (E6 -> B6 -> E7 -> G#7)
    this.playHarmonicProgression(
      target,
      t,
      pitch,
      vol,
      [
        { offset: 0.02, freq: 1318.51, dur: 0.24, gain: 0.15 },
        { offset: 0.065, freq: 1975.53, dur: 0.26, gain: 0.14 },
        { offset: 0.11, freq: 2637.02, dur: 0.3, gain: 0.13 },
        { offset: 0.155, freq: 3322.44, dur: 0.34, gain: 0.11 },
      ],
      'sine',
      'triangle',
      0.5,
      0.38,
    );
    // Shimmering detuned diamond harmonic halo
    this.tone(target, t + 0.05, {
      type: 'sine',
      freqStart: 2637.02 * pitch,
      detune: 8,
      duration: 0.36,
      attack: 0.01,
      gain: 0.11 * vol,
      wet: 0.42,
    });
    // Crisp metallic jewel transient & high sparkle tail
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.025,
      gain: 0.12 * vol,
      filterType: 'bandpass',
      filterFreqStart: 5200 * pitch,
      filterQ: 4.0,
      wet: 0.26,
    });
    this.noise(target, t + 0.04, {
      buffer: 'white',
      duration: 0.34,
      attack: 0.02,
      gain: 0.11 * vol,
      filterType: 'highpass',
      filterFreqStart: 4800,
      wet: 0.4,
    });
    return 0.52;
  }

  private playBunkerUnlock(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Security authorization chirp
    this.tone(target, t, {
      type: 'square',
      freqStart: 880 * pitch,
      freqEnd: 1318.51 * pitch,
      duration: 0.065,
      gain: 0.14 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200 * pitch,
      filterQ: 2.5,
    });
    // Heavy hydraulic actuator grind
    this.tone(target, t + 0.06, {
      type: 'sawtooth',
      freqStart: 74 * pitch,
      freqEnd: 122 * pitch,
      duration: 0.32,
      attack: 0.02,
      gain: 0.28 * vol,
      filterType: 'lowpass',
      filterFreqStart: 380,
      filterFreqEnd: 720,
      wet: 0.2,
    });
    // Massive blast-door bolt disengage thud & latch rattle
    this.tone(target, t + 0.22, {
      type: 'sine',
      freqStart: 118 * pitch,
      freqEnd: 26 * pitch,
      duration: 0.34,
      gain: 0.6 * vol,
      wet: 0.26,
    });
    this.tone(target, t + 0.22, {
      type: 'triangle',
      freqStart: 420 * pitch,
      freqEnd: 260 * pitch,
      duration: 0.14,
      gain: 0.24 * vol,
      wet: 0.22,
    });
    // Underground armory power-up chord (A4 -> C#5 -> E5 -> A5)
    this.playHarmonicProgression(
      target,
      t,
      pitch,
      vol,
      [
        { offset: 0.36, freq: 440.0, dur: 0.44, gain: 0.14 },
        { offset: 0.41, freq: 554.37, dur: 0.42, gain: 0.13 },
        { offset: 0.46, freq: 659.25, dur: 0.42, gain: 0.13 },
        { offset: 0.51, freq: 880.0, dur: 0.42, gain: 0.15 },
      ],
      'sine',
      'triangle',
      0.65,
      0.36,
    );
    // Pressurized air-lock release hiss & steel lock clang
    this.noise(target, t + 0.08, {
      buffer: 'pink',
      duration: 0.42,
      attack: 0.02,
      gain: 0.34 * vol,
      filterType: 'bandpass',
      filterFreqStart: 780 * pitch,
      filterFreqEnd: 2600 * pitch,
      filterQ: 1.7,
      distort: true,
      wet: 0.28,
    });
    this.noise(target, t + 0.22, {
      buffer: 'white',
      duration: 0.08,
      gain: 0.32 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1850 * pitch,
      filterFreqEnd: 850,
      filterQ: 2.6,
    });
    return 0.94;
  }

  private playSlurpTankerBurst(t: number, target: AudioNode, vol: number, pitch: number): number {
    // Huge pressurized steel tank rupture sub-boom & hull clang
    this.tone(target, t, {
      type: 'sine',
      freqStart: 98 * pitch,
      freqEnd: 24 * pitch,
      duration: 0.48,
      gain: 0.66 * vol,
      wet: 0.28,
    });
    this.tone(target, t, {
      type: 'triangle',
      freqStart: 240 * pitch,
      freqEnd: 58 * pitch,
      duration: 0.18,
      gain: 0.44 * vol,
      wet: 0.2,
    });
    this.tone(target, t, {
      type: 'square',
      freqStart: 640 * pitch,
      freqEnd: 290 * pitch,
      duration: 0.09,
      gain: 0.16 * vol,
      filterType: 'bandpass',
      filterFreqStart: 1350 * pitch,
      filterQ: 2.4,
    });

    // Cascading effervescent slurp bubble barrage
    const bubbles = [
      { offset: 0.05, start: 380, end: 820, dur: 0.08 },
      { offset: 0.1, start: 510, end: 1080, dur: 0.085 },
      { offset: 0.15, start: 640, end: 1340, dur: 0.09 },
      { offset: 0.2, start: 780, end: 1620, dur: 0.095 },
      { offset: 0.26, start: 940, end: 1920, dur: 0.1 },
      { offset: 0.32, start: 1120, end: 2240, dur: 0.11 },
    ];
    for (const b of bubbles) {
      this.tone(target, t + b.offset, {
        type: 'sine',
        freqStart: b.start * pitch,
        freqEnd: b.end * pitch,
        duration: b.dur,
        gain: 0.16 * vol,
        wet: 0.26,
      });
    }

    // Radiant Slurp healing aura chord (D5 -> A5 -> D6 -> A6)
    this.playHarmonicProgression(
      target,
      t,
      pitch,
      vol,
      [
        { offset: 0.16, freq: 587.33, dur: 0.44, gain: 0.14 },
        { offset: 0.21, freq: 880.0, dur: 0.44, gain: 0.14 },
        { offset: 0.26, freq: 1174.66, dur: 0.46, gain: 0.14 },
        { offset: 0.31, freq: 1760.0, dur: 0.44, gain: 0.12 },
      ],
      'sine',
      'triangle',
      0.5,
      0.38,
    );

    // Pressurized metal burst crack, huge liquid splash rush & mist fizz
    this.noise(target, t, {
      buffer: 'white',
      duration: 0.09,
      gain: 0.48 * vol,
      filterType: 'bandpass',
      filterFreqStart: 2200 * pitch,
      filterFreqEnd: 760,
      filterQ: 1.8,
      distort: true,
    });
    this.noise(target, t + 0.03, {
      buffer: 'pink',
      duration: 0.58,
      attack: 0.015,
      gain: 0.48 * vol,
      filterType: 'lowpass',
      filterFreqStart: 2400 * pitch,
      filterFreqEnd: 320,
      wet: 0.34,
    });
    this.noise(target, t + 0.1, {
      buffer: 'white',
      duration: 0.56,
      attack: 0.03,
      gain: 0.24 * vol,
      filterType: 'highpass',
      filterFreqStart: 3600,
      wet: 0.32,
    });
    return 0.78;
  }

  private playHarmonicProgression(
    target: AudioNode,
    baseTime: number,
    pitch: number,
    vol: number,
    notes: ReadonlyArray<{ offset: number; freq: number; dur: number; gain: number }>,
    primaryWave: OscillatorType,
    harmonyWave: OscillatorType,
    harmonyRatio: number,
    wet: number,
    lowpassStart?: number,
  ): void {
    for (const note of notes) {
      this.tone(target, baseTime + note.offset, {
        type: primaryWave,
        freqStart: note.freq * pitch,
        duration: note.dur,
        attack: 0.01,
        gain: note.gain * vol,
        filterType: lowpassStart ? 'lowpass' : undefined,
        filterFreqStart: lowpassStart,
        filterFreqEnd: lowpassStart ? Math.max(200, lowpassStart * 0.5) : undefined,
        wet,
      });
      this.tone(target, baseTime + note.offset, {
        type: harmonyWave,
        freqStart: note.freq * harmonyRatio * pitch,
        duration: note.dur * 0.9,
        attack: 0.012,
        gain: note.gain * 0.55 * vol,
        wet: wet * 0.85,
      });
    }
  }

  private playFmAura(
    target: AudioNode,
    startTime: number,
    duration: number,
    carrierStart: number,
    carrierEnd: number,
    modStart: number,
    modEnd: number,
    modDepth: number,
    gain: number,
    filterStart: number,
    filterEnd: number,
    wet: number,
  ): void {
    const dur = Math.max(0.04, duration);
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(Math.max(20, carrierStart), startTime);
    carrier.frequency.exponentialRampToValueAtTime(Math.max(20, carrierEnd), startTime + dur);

    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(Math.max(20, modStart), startTime);
    mod.frequency.exponentialRampToValueAtTime(Math.max(20, modEnd), startTime + dur);

    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(0.0001, startTime);
    modGain.gain.linearRampToValueAtTime(Math.max(0.5, modDepth), startTime + dur * 0.25);
    modGain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    const fmEnv = this.ctx.createGain();
    fmEnv.gain.setValueAtTime(0.0001, startTime);
    fmEnv.gain.linearRampToValueAtTime(Math.max(0.0002, gain), startTime + Math.min(0.06, dur * 0.25));
    fmEnv.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    mod.connect(modGain);
    try {
      modGain.connect(carrier.frequency);
    } catch {
      // Ignore AudioParam connect errors on minimal mocks
    }

    const fmFilter = this.safeCreateFilter();
    if (fmFilter) {
      fmFilter.type = 'lowpass';
      fmFilter.frequency?.setValueAtTime?.(Math.max(25, filterStart), startTime);
      fmFilter.frequency?.exponentialRampToValueAtTime?.(Math.max(25, filterEnd), startTime + dur);
      carrier.connect(fmFilter);
      fmFilter.connect(fmEnv);
    } else {
      carrier.connect(fmEnv);
    }

    fmEnv.connect(target);
    this.routeWet(fmEnv, startTime, dur, wet);
    mod.start(startTime);
    carrier.start(startTime);
    mod.stop(startTime + dur + 0.015);
    carrier.stop(startTime + dur + 0.015);
  }

  private playSurfaceFootstep(
    surface:
      | 'footstep_wood'
      | 'footstep_stone'
      | 'footstep_metal'
      | 'footstep_snow'
      | 'footstep_water'
      | 'footstep_sand',
    t: number,
    target: AudioNode,
    vol: number,
    pitch: number,
  ): number {
    const jitter = this.pitchJitter(0.08) * pitch;
    switch (surface) {
      case 'footstep_wood':
        this.tone(target, t, {
          type: 'triangle',
          freqStart: 168 * jitter,
          freqEnd: 78 * jitter,
          duration: 0.075,
          gain: 0.23 * vol,
        });
        this.tone(target, t, {
          type: 'sine',
          freqStart: 285 * jitter,
          freqEnd: 165 * jitter,
          duration: 0.045,
          gain: 0.13 * vol,
        });
        this.noise(target, t, {
          buffer: 'pink',
          duration: 0.055,
          gain: 0.14 * vol,
          filterType: 'bandpass',
          filterFreqStart: 720 * jitter,
          filterFreqEnd: 380,
          filterQ: 2.6,
        });
        return 0.09;
      case 'footstep_stone':
        this.tone(target, t, {
          type: 'sine',
          freqStart: 128 * jitter,
          freqEnd: 52 * jitter,
          duration: 0.05,
          gain: 0.21 * vol,
        });
        this.noise(target, t, {
          buffer: 'white',
          duration: 0.042,
          gain: 0.2 * vol,
          filterType: 'bandpass',
          filterFreqStart: 1550 * jitter,
          filterFreqEnd: 820,
          filterQ: 2.0,
        });
        this.noise(target, t + 0.01, {
          buffer: 'white',
          duration: 0.025,
          gain: 0.09 * vol,
          filterType: 'highpass',
          filterFreqStart: 2800,
        });
        return 0.075;
      case 'footstep_metal':
        this.tone(target, t, {
          type: 'sine',
          freqStart: 480 * jitter,
          freqEnd: 445 * jitter,
          duration: 0.11,
          gain: 0.15 * vol,
          wet: 0.12,
        });
        this.tone(target, t, {
          type: 'triangle',
          freqStart: 910 * jitter,
          freqEnd: 860 * jitter,
          duration: 0.08,
          gain: 0.11 * vol,
          wet: 0.12,
        });
        this.tone(target, t, {
          type: 'sine',
          freqStart: 115 * jitter,
          freqEnd: 48 * jitter,
          duration: 0.05,
          gain: 0.18 * vol,
        });
        this.noise(target, t, {
          buffer: 'white',
          duration: 0.032,
          gain: 0.16 * vol,
          filterType: 'highpass',
          filterFreqStart: 2400,
        });
        return 0.12;
      case 'footstep_snow':
        this.noise(target, t, {
          buffer: 'pink',
          duration: 0.095,
          attack: 0.008,
          gain: 0.24 * vol,
          filterType: 'bandpass',
          filterFreqStart: 1850 * jitter,
          filterFreqEnd: 950 * jitter,
          filterQ: 1.5,
        });
        this.noise(target, t + 0.012, {
          buffer: 'white',
          duration: 0.07,
          gain: 0.16 * vol,
          filterType: 'highpass',
          filterFreqStart: 3400,
        });
        this.tone(target, t, {
          type: 'sine',
          freqStart: 82 * jitter,
          freqEnd: 42 * jitter,
          duration: 0.055,
          gain: 0.12 * vol,
        });
        return 0.11;
      case 'footstep_water':
        this.noise(target, t, {
          buffer: 'white',
          duration: 0.125,
          gain: 0.24 * vol,
          filterType: 'bandpass',
          filterFreqStart: 950 * jitter,
          filterFreqEnd: 2600 * jitter,
          filterQ: 1.4,
          wet: 0.18,
        });
        this.noise(target, t, {
          buffer: 'pink',
          duration: 0.1,
          gain: 0.18 * vol,
          filterType: 'lowpass',
          filterFreqStart: 1350 * jitter,
          filterFreqEnd: 580,
        });
        this.tone(target, t + 0.02, {
          type: 'sine',
          freqStart: 540 * jitter,
          freqEnd: 1080 * jitter,
          duration: 0.055,
          gain: 0.12 * vol,
          wet: 0.18,
        });
        return 0.14;
      case 'footstep_sand':
        this.noise(target, t, {
          buffer: 'pink',
          duration: 0.105,
          attack: 0.012,
          gain: 0.23 * vol,
          filterType: 'bandpass',
          filterFreqStart: 1200 * jitter,
          filterFreqEnd: 640 * jitter,
          filterQ: 0.9,
        });
        this.noise(target, t + 0.008, {
          buffer: 'white',
          duration: 0.085,
          attack: 0.01,
          gain: 0.14 * vol,
          filterType: 'bandpass',
          filterFreqStart: 2600 * jitter,
          filterFreqEnd: 1600,
          filterQ: 1.1,
        });
        this.tone(target, t, {
          type: 'sine',
          freqStart: 76 * jitter,
          freqEnd: 38 * jitter,
          duration: 0.055,
          gain: 0.11 * vol,
        });
        return 0.12;
    }
  }

  // --- Low-Level Synthesis Primitives ---

  private tone(target: AudioNode, startTime: number, opts: ToneOpts): void {
    const dur = Math.max(0.015, opts.duration);
    const attack = clamp(opts.attack ?? 0.004, 0.001, dur * 0.5);
    const peakGain = Math.max(0.0002, opts.gain);
    const freqStart = Math.max(20, opts.freqStart);
    const freqEnd = opts.freqEnd !== undefined ? Math.max(20, opts.freqEnd) : freqStart;

    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freqStart, startTime);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + dur);
    }
    if (opts.detune && osc.detune) {
      osc.detune.setValueAtTime?.(opts.detune, startTime);
    }

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    const tail = this.attachFilter(osc, startTime, dur, opts, 1200);

    tail.connect(env);
    env.connect(target);
    this.routeWet(env, startTime, dur, opts.wet);

    osc.start(startTime);
    osc.stop(startTime + dur + 0.015);
  }

  private noise(target: AudioNode, startTime: number, opts: NoiseOpts): void {
    const buffer = opts.buffer === 'pink' ? this.pinkNoise : this.whiteNoise;
    if (!buffer) return;

    const dur = Math.max(0.015, opts.duration);
    const attack = clamp(opts.attack ?? 0.002, 0.001, dur * 0.5);
    const peakGain = Math.max(0.0002, opts.gain);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (opts.playbackRate && src.playbackRate) {
      src.playbackRate.setValueAtTime?.(opts.playbackRate, startTime);
    }

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    let tail = this.attachFilter(src, startTime, dur, opts, 1000);

    if (opts.distort && this.softClipCurve && typeof this.ctx.createWaveShaper === 'function') {
      try {
        const shaper = this.ctx.createWaveShaper();
        shaper.curve = this.softClipCurve;
        tail.connect(shaper);
        tail = shaper;
      } catch {
        // Fallback without waveshaping on minimal mocks
      }
    }

    tail.connect(env);
    env.connect(target);
    this.routeWet(env, startTime, dur, opts.wet);

    const maxOffset = Math.max(0, buffer.duration - dur - 0.05);
    const offset = maxOffset > 0 ? this.rand() * maxOffset : 0;
    src.start(startTime, offset, dur + 0.015);
  }

  private attachFilter(
    tail: AudioNode,
    startTime: number,
    dur: number,
    opts: Pick<ToneOpts, 'filterType' | 'filterFreqStart' | 'filterFreqEnd' | 'filterQ'>,
    defaultFreq: number,
  ): AudioNode {
    if (!opts.filterType) return tail;
    const filter = this.safeCreateFilter();
    if (!filter) return tail;
    filter.type = opts.filterType;
    const fStart = Math.max(25, opts.filterFreqStart ?? defaultFreq);
    const fEnd = opts.filterFreqEnd !== undefined ? Math.max(25, opts.filterFreqEnd) : fStart;
    filter.frequency?.setValueAtTime?.(fStart, startTime);
    if (fEnd !== fStart) {
      filter.frequency?.exponentialRampToValueAtTime?.(fEnd, startTime + dur);
    }
    if (opts.filterQ !== undefined) {
      filter.Q?.setValueAtTime?.(opts.filterQ, startTime);
    }
    tail.connect(filter);
    return filter;
  }

  private routeWet(node: AudioNode, _startTime: number, _dur: number, wet?: number): void {
    if (!wet || wet <= 0 || !this.reverbSend) return;
    try {
      const tap = this.ctx.createGain();
      tap.gain.setValueAtTime(clamp(wet, 0, 1), this.ctx.currentTime);
      node.connect(tap);
      tap.connect(this.reverbSend);
    } catch {
      // ignore if reverb tap unsupported in mock
    }
  }

  private safeCreateFilter(): BiquadFilterNode | null {
    if (typeof this.ctx.createBiquadFilter !== 'function') return null;
    try {
      return this.ctx.createBiquadFilter();
    } catch {
      return null;
    }
  }

  private pitchJitter(amount: number): number {
    return 1 + (this.rand() * 2 - 1) * amount;
  }

  private buildNoiseBuffer(seconds: number, pink: boolean): AudioBuffer | null {
    if (typeof this.ctx.createBuffer !== 'function') return null;
    try {
      const sampleRate = this.ctx.sampleRate || 44100;
      const length = Math.max(256, Math.floor(sampleRate * seconds));
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      if (!pink) {
        for (let i = 0; i < length; i++) {
          data[i] = this.rand() * 2 - 1;
        }
      } else {
        // Paul Kellet's refined pink noise approximation
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        let b3 = 0;
        let b4 = 0;
        let b5 = 0;
        let b6 = 0;
        for (let i = 0; i < length; i++) {
          const white = this.rand() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          const val = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          b6 = white * 0.115926;
          data[i] = clamp(val * 0.14, -1, 1);
        }
      }
      return buffer;
    } catch {
      return null;
    }
  }

  private buildSaturationCurve(samples: number, drive: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = Math.tanh(x * drive);
    }
    return curve;
  }

  private buildReverbPipeline(destination: AudioNode): {
    convolver: ConvolverNode | null;
    send: GainNode | null;
  } {
    if (
      typeof this.ctx.createConvolver !== 'function' ||
      typeof this.ctx.createBuffer !== 'function'
    ) {
      return { convolver: null, send: null };
    }
    try {
      const sampleRate = this.ctx.sampleRate || 44100;
      const length = Math.max(512, Math.floor(sampleRate * 1.1));
      const impulse = this.ctx.createBuffer(2, length, sampleRate);

      for (let ch = 0; ch < 2; ch++) {
        const channel = impulse.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < length; i++) {
          const env = Math.pow(1 - i / length, 2.5);
          const raw = (this.rand() * 2 - 1) * env;
          // Gentle high-frequency damping across tail
          lp = lp * 0.45 + raw * 0.55;
          channel[i] = lp;
        }
      }

      const convolver = this.ctx.createConvolver();
      convolver.buffer = impulse;
      const send = this.ctx.createGain();
      send.gain.setValueAtTime(0.24, this.ctx.currentTime);
      send.connect(convolver);
      convolver.connect(destination);
      return { convolver, send };
    } catch {
      return { convolver: null, send: null };
    }
  }
}
