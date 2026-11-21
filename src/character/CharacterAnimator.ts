import type { EmoteId, WeaponId } from '../types';
import { clamp, damp } from '../core';
import type { CharacterRenderState } from '../types';
import type { CharacterRig } from './CharacterRig';

interface PoseTarget {
  hipsX: number;
  hipsY: number;
  hipsRx: number;
  hipsRy: number;
  hipsRz: number;
  spineRx: number;
  spineRy: number;
  spineRz: number;
  chestRx: number;
  chestRy: number;
  chestRz: number;
  headRx: number;
  headRy: number;
  headRz: number;
  lShRx: number;
  lShRy: number;
  lShRz: number;
  lElRx: number;
  lElRy: number;
  lHaRx: number;
  rShRx: number;
  rShRy: number;
  rShRz: number;
  rElRx: number;
  rElRy: number;
  rHaRx: number;
  lHiRx: number;
  lHiRy: number;
  lHiRz: number;
  lKnRx: number;
  lFoRx: number;
  rHiRx: number;
  rHiRy: number;
  rHiRz: number;
  rKnRx: number;
  rFoRx: number;
}

interface RigAnimData {
  time: number;
  gaitPhase: number;
  gliderFactor: number;
  target: PoseTarget;
}

const BASE_HIPS_Y = 0.9;
const CROUCH_HIPS_Y = 0.56;

function createEmptyPose(): PoseTarget {
  return {
    hipsX: 0,
    hipsY: BASE_HIPS_Y,
    hipsRx: 0,
    hipsRy: 0,
    hipsRz: 0,
    spineRx: 0,
    spineRy: 0,
    spineRz: 0,
    chestRx: 0,
    chestRy: 0,
    chestRz: 0,
    headRx: 0,
    headRy: 0,
    headRz: 0,
    lShRx: 0,
    lShRy: 0,
    lShRz: 0,
    lElRx: 0,
    lElRy: 0,
    lHaRx: 0,
    rShRx: 0,
    rShRy: 0,
    rShRz: 0,
    rElRx: 0,
    rElRy: 0,
    rHaRx: 0,
    lHiRx: 0,
    lHiRy: 0,
    lHiRz: 0,
    lKnRx: 0,
    lFoRx: 0,
    rHiRx: 0,
    rHiRy: 0,
    rHiRz: 0,
    rKnRx: 0,
    rFoRx: 0,
  };
}

function resetPose(p: PoseTarget): void {
  p.hipsX = 0;
  p.hipsY = BASE_HIPS_Y;
  p.hipsRx = 0;
  p.hipsRy = 0;
  p.hipsRz = 0;
  p.spineRx = 0;
  p.spineRy = 0;
  p.spineRz = 0;
  p.chestRx = 0;
  p.chestRy = 0;
  p.chestRz = 0;
  p.headRx = 0;
  p.headRy = 0;
  p.headRz = 0;
  p.lShRx = -0.15;
  p.lShRy = 0;
  p.lShRz = 0.1;
  p.lElRx = -0.25;
  p.lElRy = 0;
  p.lHaRx = 0;
  p.rShRx = -0.15;
  p.rShRy = 0;
  p.rShRz = -0.1;
  p.rElRx = -0.25;
  p.rElRy = 0;
  p.rHaRx = 0;
  p.lHiRx = 0;
  p.lHiRy = 0;
  p.lHiRz = 0.03;
  p.lKnRx = 0.06;
  p.lFoRx = -0.04;
  p.rHiRx = 0;
  p.rHiRy = 0;
  p.rHiRz = -0.03;
  p.rKnRx = 0.06;
  p.rFoRx = -0.04;
}

function isTwoHandedGun(weaponId: WeaponId): boolean {
  return (
    weaponId === 'ar' ||
    weaponId === 'burst_ar' ||
    weaponId === 'pump_shotgun' ||
    weaponId === 'tac_shotgun' ||
    weaponId === 'smg' ||
    weaponId === 'sniper' ||
    weaponId === 'rocket_launcher'
  );
}

function isConsumable(weaponId: WeaponId): boolean {
  return (
    weaponId === 'mini_shield' ||
    weaponId === 'shield_potion' ||
    weaponId === 'bandages' ||
    weaponId === 'medkit' ||
    weaponId === 'slurp_juice'
  );
}

/**
 * Procedural skeletal animator for CharacterRig.
 * Supports all 15 AnimStates, all 4 EmoteId dances, aiming pitch, and recoil kick.
 */
export class CharacterAnimator {
  private readonly rigStates = new WeakMap<CharacterRig, RigAnimData>();

  public update(rig: CharacterRig, state: CharacterRenderState, dt: number): void {
    const safeDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    let data = this.rigStates.get(rig);
    if (!data) {
      data = {
        time: 0,
        gaitPhase: 0,
        gliderFactor: 0,
        target: createEmptyPose(),
      };
      this.rigStates.set(rig, data);
    }

    data.time += safeDt;

    // Sync transform, weapon/blueprint, and glider state
    const root = rig.getGroup();
    root.position.set(state.position.x, state.position.y, state.position.z);
    root.rotation.y = state.yaw;

    rig.equipWeapon(state.weaponId, state.isBuilding);

    const shouldGlideOpen = state.animState === 'glide';
    if (shouldGlideOpen) {
      data.gliderFactor = safeDt > 0 ? damp(Math.max(data.gliderFactor, 0.25), 1, 14, safeDt) : 1;
      rig.setGliderOpen(true, data.gliderFactor);
    } else {
      data.gliderFactor = safeDt > 0 ? damp(data.gliderFactor, 0, 18, safeDt) : 0;
      if (data.gliderFactor <= 0.03) {
        data.gliderFactor = 0;
        rig.setGliderOpen(false, 0);
      } else {
        rig.setGliderOpen(true, data.gliderFactor);
      }
    }

    const p = data.target;
    resetPose(p);

    const t = data.time;
    const anim = state.animState;

    // 1. Base locomotion / full-body action pose
    switch (anim) {
      case 'idle':
        this.applyIdlePose(p, t);
        break;
      case 'walk':
        this.applyGaitPose(p, data, safeDt, state.moveSpeed > 0.1 ? state.moveSpeed : 3.2, 6.4, 0.48, 0.58, 0.05, 0.028, false);
        break;
      case 'run':
        this.applyGaitPose(p, data, safeDt, state.moveSpeed > 0.1 ? state.moveSpeed : 6.2, 9.6, 0.78, 0.96, 0.14, 0.052, false);
        break;
      case 'sprint':
        this.applyGaitPose(p, data, safeDt, state.moveSpeed > 0.1 ? state.moveSpeed : 8.5, 12.6, 1.02, 1.18, 0.28, 0.072, true);
        break;
      case 'crouch_idle':
        this.applyCrouchIdlePose(p, t);
        break;
      case 'crouch_walk':
        this.applyCrouchWalkPose(p, data, safeDt, state.moveSpeed > 0.1 ? state.moveSpeed : 2.6);
        break;
      case 'jump':
        this.applyJumpPose(p, t);
        break;
      case 'fall':
        this.applyFallPose(p, t);
        break;
      case 'skydive':
        this.applySkydivePose(p, t);
        break;
      case 'glide':
        this.applyGlidePose(p, t, rig.getGlider().style === 'hover');
        break;
      case 'harvest':
        if (state.moveSpeed > 0.5) {
          this.applyGaitPose(p, data, safeDt, state.moveSpeed, 8.8, 0.65, 0.8, 0.1, 0.04, false);
        } else {
          this.applyIdlePose(p, t);
        }
        this.applyHarvestPose(p, t, state.harvestSwingTimer);
        break;
      case 'reload':
        if (state.moveSpeed > 0.5) {
          this.applyGaitPose(p, data, safeDt, state.moveSpeed, 8.4, 0.6, 0.72, 0.08, 0.035, false);
        } else {
          this.applyIdlePose(p, t);
        }
        this.applyReloadPose(p, t);
        break;
      case 'heal':
        this.applyCrouchIdlePose(p, t);
        p.hipsY = 0.78;
        p.lHiRx = -0.35;
        p.lKnRx = 0.58;
        p.lFoRx = -0.22;
        p.rHiRx = -0.35;
        p.rKnRx = 0.58;
        p.rFoRx = -0.22;
        this.applyHealPose(p, t, state.weaponId);
        break;
      case 'build':
        if (state.moveSpeed > 0.5) {
          this.applyGaitPose(p, data, safeDt, state.moveSpeed, 9.2, 0.68, 0.85, 0.1, 0.04, false);
        } else {
          this.applyIdlePose(p, t);
        }
        this.applyBuildPose(p, t);
        break;
      case 'emote':
        this.applyEmotePose(p, t, state.emoteId ?? 'victory_groove');
        break;
    }

    // 2. Upper-body weapon readiness, aiming pitch & recoil kick
    const suppressWeaponAim =
      anim === 'skydive' ||
      anim === 'glide' ||
      anim === 'emote' ||
      anim === 'harvest' ||
      anim === 'reload' ||
      anim === 'heal' ||
      anim === 'build';

    if (!suppressWeaponAim) {
      if (state.isBuilding) {
        this.applyBuildPose(p, t);
      } else {
        this.applyUpperBodyWeaponAim(p, state, t);
      }
    }

    // 3. Smoothly damp joints toward target pose (instant snap on dt === 0 for deterministic single-step tests)
    const blendLambda = anim === 'emote' || anim === 'harvest' ? 22 : 16;
    this.applyPoseToJoints(rig, p, blendLambda, safeDt);
  }

  private applyIdlePose(p: PoseTarget, t: number): void {
    const breath = Math.sin(t * 2.2);
    p.hipsY = BASE_HIPS_Y + breath * 0.008;
    p.chestRx = breath * 0.02;
    p.lHiRx = -0.06;
    p.lKnRx = 0.12;
    p.lFoRx = -0.06;
    p.rHiRx = 0.05;
    p.rKnRx = 0.10;
    p.rFoRx = -0.10;
    p.lHiRz = 0.05;
    p.rHiRz = -0.05;
  }

  private applyGaitPose(
    p: PoseTarget,
    data: RigAnimData,
    dt: number,
    speed: number,
    baseFreq: number,
    strideAmp: number,
    kneeAmp: number,
    forwardLean: number,
    bounceAmp: number,
    isSprint: boolean,
  ): void {
    const freqScale = clamp(speed / 5.5, 0.6, 1.55);
    data.gaitPhase += dt * baseFreq * freqScale;
    const ph = data.gaitPhase;

    const s = Math.sin(ph);
    const c = Math.cos(ph);

    p.hipsY = BASE_HIPS_Y + Math.abs(c) * bounceAmp - (isSprint ? 0.04 : 0.015);
    p.hipsRz = s * 0.045;
    p.hipsRy = -s * 0.08;
    p.spineRx = forwardLean;
    p.chestRy = s * 0.11;

    // Legs
    p.lHiRx = s * strideAmp;
    p.rHiRx = -s * strideAmp;
    p.lKnRx = clamp(0.15 + Math.max(0, -c) * kneeAmp + Math.max(0, -s) * 0.35, 0.08, 1.45);
    p.rKnRx = clamp(0.15 + Math.max(0, c) * kneeAmp + Math.max(0, s) * 0.35, 0.08, 1.45);
    p.lFoRx = -p.lHiRx * 0.25 - p.lKnRx * 0.3;
    p.rFoRx = -p.rHiRx * 0.25 - p.rKnRx * 0.3;

    // Counter-swinging arms (overridden by weapon grip unless sprinting)
    p.lShRx = -s * (isSprint ? 0.95 : 0.45);
    p.rShRx = s * (isSprint ? 0.95 : 0.45);
    p.lElRx = isSprint ? -1.15 : -0.45;
    p.rElRx = isSprint ? -1.15 : -0.45;
  }

  private applyCrouchIdlePose(p: PoseTarget, t: number): void {
    const breath = Math.sin(t * 2.5);
    p.hipsY = CROUCH_HIPS_Y + breath * 0.008;
    p.spineRx = 0.24;
    p.chestRx = 0.06 + breath * 0.015;
    p.lHiRx = -0.82;
    p.lKnRx = 1.28;
    p.lFoRx = -0.46;
    p.rHiRx = -0.70;
    p.rKnRx = 1.16;
    p.rFoRx = -0.46;
    p.lHiRz = 0.08;
    p.rHiRz = -0.08;
  }

  private applyCrouchWalkPose(p: PoseTarget, data: RigAnimData, dt: number, speed: number): void {
    const freqScale = clamp(speed / 2.6, 0.65, 1.45);
    data.gaitPhase += dt * 6.2 * freqScale;
    const ph = data.gaitPhase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);

    p.hipsY = CROUCH_HIPS_Y + Math.abs(c) * 0.024;
    p.hipsRy = -s * 0.06;
    p.spineRx = 0.28;
    p.chestRy = s * 0.08;
    p.lHiRx = -0.78 + s * 0.40;
    p.rHiRx = -0.78 - s * 0.40;
    p.lKnRx = clamp(1.18 - s * 0.28 + Math.max(0, -c) * 0.25, 0.65, 1.55);
    p.rKnRx = clamp(1.18 + s * 0.28 + Math.max(0, c) * 0.25, 0.65, 1.55);
    p.lFoRx = -0.42;
    p.rFoRx = -0.42;
  }

  private applyJumpPose(p: PoseTarget, t: number): void {
    const flutter = Math.sin(t * 6) * 0.04;
    p.hipsY = BASE_HIPS_Y + 0.05;
    p.spineRx = 0.08;
    p.lHiRx = -0.62 + flutter;
    p.lKnRx = 0.98;
    p.lFoRx = -0.25;
    p.rHiRx = 0.24 - flutter;
    p.rKnRx = 0.36;
    p.rFoRx = 0.12;
    p.lShRx = -0.45;
    p.lShRz = 0.32;
    p.lElRx = -0.65;
  }

  private applyFallPose(p: PoseTarget, t: number): void {
    const flutter = Math.sin(t * 9) * 0.06;
    p.hipsY = BASE_HIPS_Y + 0.02;
    p.spineRx = 0.14;
    p.lHiRx = -0.35 + flutter;
    p.lKnRx = 0.62;
    p.lFoRx = 0.15;
    p.rHiRx = 0.12 - flutter;
    p.rKnRx = 0.48;
    p.rFoRx = 0.18;
    p.lShRx = -0.55;
    p.lShRz = 0.48 + flutter * 0.5;
    p.lElRx = -0.45;
  }

  private applySkydivePose(p: PoseTarget, t: number): void {
    const wind = Math.sin(t * 11) * 0.07;
    p.hipsY = 1.02 + Math.sin(t * 4) * 0.03;
    p.hipsRx = 1.24; // Belly-down dive toward +Z
    p.hipsRz = Math.sin(t * 2.4) * 0.06;
    p.spineRx = 0.08;
    p.headRx = -0.82; // Look ahead toward ground/horizon

    // Swept-back diving arms
    p.lShRx = 0.45 + wind;
    p.lShRz = 0.88;
    p.lElRx = -0.35;
    p.rShRx = 0.45 - wind;
    p.rShRz = -0.88;
    p.rElRx = -0.35;

    // Slightly bent trailing legs
    p.lHiRx = 0.18 + wind * 0.8;
    p.lKnRx = 0.48;
    p.lFoRx = 0.35;
    p.rHiRx = 0.18 - wind * 0.8;
    p.rKnRx = 0.48;
    p.rFoRx = 0.35;
    p.lHiRz = 0.14;
    p.rHiRz = -0.14;
  }

  private applyGlidePose(p: PoseTarget, t: number, isHoverboard: boolean): void {
    const sway = Math.sin(t * 3.2);
    if (isHoverboard) {
      // Hoverboard surfing stance
      p.hipsY = 0.86 + sway * 0.025;
      p.hipsRy = 0.48;
      p.hipsRz = sway * 0.05;
      p.spineRx = 0.10;
      p.headRy = -0.42;
      p.lHiRx = -0.25;
      p.lKnRx = 0.48;
      p.lFoRx = -0.20;
      p.rHiRx = 0.18;
      p.rKnRx = 0.42;
      p.rFoRx = -0.20;
      p.lShRx = -0.35;
      p.lShRz = 0.72 + sway * 0.08;
      p.lElRx = -0.30;
      p.rShRx = -0.35;
      p.rShRz = -0.72 - sway * 0.08;
      p.rElRx = -0.30;
      return;
    }

    // Overhead glider hang pose
    p.hipsY = 0.88 + sway * 0.02;
    p.hipsRx = 0.14 + sway * 0.03;
    p.spineRx = 0.08;
    p.headRx = -0.15;

    p.lShRx = -2.55;
    p.lShRy = -0.18;
    p.lShRz = 0.18;
    p.lElRx = -0.32;

    p.rShRx = -2.55;
    p.rShRy = 0.18;
    p.rShRz = -0.18;
    p.rElRx = -0.32;

    p.lHiRx = 0.24 + sway * 0.08;
    p.lKnRx = 0.32;
    p.lFoRx = 0.22;
    p.rHiRx = 0.32 - sway * 0.08;
    p.rKnRx = 0.42;
    p.rFoRx = 0.22;
  }

  private applyHarvestPose(p: PoseTarget, t: number, swingTimer: number): void {
    // Use provided swingTimer (0..0.625s) or fall back to continuous swing rhythm
    const cycle = swingTimer > 0 ? (swingTimer % 0.625) / 0.625 : (t * 1.65) % 1;
    // Fast forward slash, smooth windup recovery
    const swing =
      cycle < 0.35
        ? -Math.cos((cycle / 0.35) * Math.PI) // -1 -> +1 slash
        : 1 - ((cycle - 0.35) / 0.65) * 2; // +1 -> -1 recovery

    p.chestRy = -swing * 0.42;
    p.spineRy = -swing * 0.18;
    p.chestRx = 0.08 + Math.max(0, swing) * 0.14;

    p.rShRx = -1.35 + swing * 0.88;
    p.rShRy = 0.22 + swing * 0.35;
    p.rShRz = -0.35 + swing * 0.55;
    p.rElRx = -0.45 - Math.max(0, -swing) * 0.45;
    p.rHaRx = swing * 0.25;

    // Left arm counter-balances
    p.lShRx = -0.45 - swing * 0.35;
    p.lShRz = 0.28;
    p.lElRx = -0.72;
  }

  private applyReloadPose(p: PoseTarget, t: number): void {
    const cycle = (t * 1.25) % 1;
    const insert = Math.sin(cycle * Math.PI);

    p.chestRy = 0.22;
    p.headRx = 0.14;

    // Right hand tilts gun inward across chest
    p.rShRx = -0.92;
    p.rShRy = 0.48;
    p.rShRz = -0.1;
    p.rElRx = -0.78;
    p.rElRy = 0.25;

    // Left hand drops to belt pouch then feeds mag up
    p.lShRx = -0.45 - insert * 0.68;
    p.lShRy = -0.42 - insert * 0.25;
    p.lShRz = 0.18;
    p.lElRx = -0.85 - insert * 0.35;
  }

  private applyHealPose(p: PoseTarget, t: number, weaponId: WeaponId): void {
    const bob = Math.sin(t * 5.2);
    const isWrap = weaponId === 'bandages' || weaponId === 'medkit';

    if (isWrap) {
      p.headRx = 0.24;
      p.chestRx = 0.12;
      p.rShRx = -0.95 + bob * 0.14;
      p.rShRy = 0.55;
      p.rElRx = -1.15 + bob * 0.18;
      p.lShRx = -0.95 - bob * 0.14;
      p.lShRy = -0.55;
      p.lElRx = -1.15 - bob * 0.18;
    } else {
      // Drinking shield / slurp potion!
      p.headRx = -0.25 + bob * 0.06;
      p.rShRx = -1.35 + bob * 0.08;
      p.rShRy = 0.42;
      p.rElRx = -1.38;
      p.rHaRx = -0.25;
      p.lShRx = -0.55;
      p.lShRy = -0.25;
      p.lElRx = -0.75;
    }
  }

  private applyBuildPose(p: PoseTarget, t: number): void {
    const tap = Math.sin(t * 14) * 0.08;
    p.chestRy = 0.12;
    // Right hand holds blueprint forward
    p.rShRx = -0.98;
    p.rShRy = 0.26;
    p.rShRz = -0.05;
    p.rElRx = -0.68 + tap;
    p.rHaRx = 0.1;

    // Left hand taps / sketches on blueprint
    p.lShRx = -0.95 + tap * 0.8;
    p.lShRy = -0.46;
    p.lShRz = 0.1;
    p.lElRx = -0.74 - tap;
  }

  private applyUpperBodyWeaponAim(p: PoseTarget, state: CharacterRenderState, t: number): void {
    const aimPitch = clamp(state.pitch, -1.35, 1.35);
    const recoil = clamp(state.recoilKick, 0, 1);
    const recoilTilt = recoil * 0.28;

    const isSprintingUnfocused = state.animState === 'sprint' && !state.isAiming && !state.isFiring;
    const weapon = state.weaponId;

    // Sprinting without aiming/firing: hold rifle diagonally across chest or pump arms with pickaxe/pistol
    if (isSprintingUnfocused) {
      if (isTwoHandedGun(weapon)) {
        p.rShRx = -0.78;
        p.rShRy = 0.58;
        p.rShRz = -0.15;
        p.rElRx = -0.92;
        p.lShRx = -0.82;
        p.lShRy = -0.68;
        p.lShRz = 0.1;
        p.lElRx = -0.98;
      } else if (weapon === 'pickaxe') {
        p.rShRx = -0.35 + Math.sin(t * 11) * 0.35;
        p.rElRx = -1.05;
      }
      return;
    }

    // Subtle chest & head pitch tracking when aiming or holding weapon
    const pitchInfluence = state.isAiming || state.isFiring ? 0.35 : 0.2;
    p.chestRx += -aimPitch * pitchInfluence - recoilTilt * 0.25;
    p.headRx += -aimPitch * 0.55;

    const torsoPitch = p.hipsRx + p.spineRx + p.chestRx;

    if (weapon === 'pickaxe') {
      if (state.isAiming || state.isFiring) {
        p.rElRx = -0.55;
        p.rShRx = -Math.PI / 2 - torsoPitch - aimPitch - p.rElRx;
        p.rShRy = 0.15;
        p.lShRx = -0.55;
        p.lElRx = -0.72;
      } else {
        // Low-ready pickaxe stance
        p.rShRx = -0.52;
        p.rShRy = 0.08;
        p.rShRz = -0.16;
        p.rElRx = -0.62;
        p.lShRx = Math.max(p.lShRx, -0.45);
      }
      return;
    }

    if (isConsumable(weapon)) {
      p.rShRx = -0.78;
      p.rShRy = 0.32;
      p.rElRx = -0.82;
      p.lShRx = -0.48;
      p.lShRy = -0.25;
      p.lElRx = -0.65;
      return;
    }

    if (weapon === 'pistol') {
      // Tactical one-handed or two-handed pistol readiness
      p.rElRx = state.isAiming ? -0.32 : -0.55;
      p.rHaRx = 0;
      p.rShRx = -Math.PI / 2 - torsoPitch - aimPitch - recoilTilt - p.rElRx - p.rHaRx;
      p.rShRy = state.isAiming ? 0.16 : 0.12;
      p.rShRz = -0.05;

      if (state.isAiming || state.isFiring) {
        p.lShRx = p.rShRx + 0.08;
        p.lShRy = -0.56;
        p.lShRz = 0.06;
        p.lElRx = -0.48;
      }
      return;
    }

    // Two-handed rifles, shotguns, SMG, sniper, rocket launcher:
    // Aim weapon forward (+Z) + pitch + recoil kick!
    p.rElRx = state.isAiming ? -0.38 : -0.48;
    p.rHaRx = 0;
    p.rShRx = -Math.PI / 2 - torsoPitch - aimPitch - recoilTilt - p.rElRx - p.rHaRx;
    p.rShRy = 0.14;
    p.rShRz = -0.04;

    // Left arm reaches across to cradle forend
    p.lElRx = state.isAiming ? -0.52 : -0.62;
    p.lShRx = -Math.PI / 2 - torsoPitch - aimPitch - recoilTilt * 0.8 - p.lElRx + 0.06;
    p.lShRy = -0.54;
    p.lShRz = 0.10;
  }

  private applyEmotePose(p: PoseTarget, t: number, emoteId: EmoteId): void {
    switch (emoteId) {
      case 'victory_groove': {
        // 122 BPM upbeat groove + claps + arm pumps
        const beat = t * ((122 / 60) * Math.PI);
        const s = Math.sin(beat);
        const bounce = Math.abs(Math.sin(beat));
        p.hipsY = BASE_HIPS_Y - 0.04 + bounce * 0.065;
        p.hipsRz = s * 0.14;
        p.hipsRy = s * 0.24;
        p.chestRy = -s * 0.18;
        p.headRz = -s * 0.12;
        p.headRx = -0.08 + bounce * 0.10;

        p.lShRx = -1.25 + Math.cos(beat * 2) * 0.35;
        p.lShRy = -0.45;
        p.lShRz = 0.45 + s * 0.25;
        p.lElRx = -1.15;

        p.rShRx = -1.25 - Math.cos(beat * 2) * 0.35;
        p.rShRy = 0.45;
        p.rShRz = -0.45 + s * 0.25;
        p.rElRx = -1.15;

        p.lHiRx = -0.18 + Math.max(0, s) * 0.35;
        p.lKnRx = 0.32 + Math.max(0, s) * 0.45;
        p.rHiRx = -0.18 + Math.max(0, -s) * 0.35;
        p.rKnRx = 0.32 + Math.max(0, -s) * 0.45;
        break;
      }
      case 'floss_wave': {
        // 128 BPM classic front/back crossing floss!
        const beat = t * ((128 / 60) * Math.PI);
        const swing = Math.sin(beat);
        const cross = Math.cos(beat * 0.5);
        p.hipsY = BASE_HIPS_Y - 0.02 + Math.abs(swing) * 0.02;
        p.hipsX = -swing * 0.09;
        p.hipsRz = swing * 0.22;
        p.chestRz = -swing * 0.16;
        p.headRz = swing * 0.10;

        // Straight sweeping arms passing front & back of torso
        p.lShRx = cross > 0 ? 0.65 * Math.abs(swing) : -0.82 * Math.abs(swing);
        p.lShRz = 0.25 - swing * 0.58;
        p.lElRx = -0.08;

        p.rShRx = cross > 0 ? -0.82 * Math.abs(swing) : 0.65 * Math.abs(swing);
        p.rShRz = -0.25 - swing * 0.58;
        p.rElRx = -0.08;

        p.lHiRz = 0.12 - swing * 0.08;
        p.rHiRz = -0.12 - swing * 0.08;
        p.lKnRx = 0.15;
        p.rKnRx = 0.15;
        break;
      }
      case 'take_w_hop': {
        // 132 BPM energetic alternating leg kick + overhead W salute
        const beat = t * ((132 / 60) * Math.PI);
        const s = Math.sin(beat);
        const hop = Math.abs(s);
        p.hipsY = BASE_HIPS_Y + hop * 0.09;
        p.hipsRz = s * 0.16;
        p.chestRz = -s * 0.14;
        p.headRz = s * 0.12;

        // Right arm triumphant overhead salute, left hand on hip
        p.rShRx = -2.38 + hop * 0.18;
        p.rShRz = -0.28;
        p.rElRx = -0.95;

        p.lShRx = -0.25;
        p.lShRz = 0.62;
        p.lElRx = -1.25;

        // Alternating high kick
        p.lHiRx = s > 0 ? -1.12 * s : 0.15;
        p.lKnRx = s > 0 ? 0.25 : 0.35;
        p.rHiRx = s < 0 ? 1.12 * s : 0.15;
        p.rKnRx = s < 0 ? 0.25 : 0.35;
        break;
      }
      case 'robot_boogie': {
        // 118 BPM snapped mechanical steps
        const step = Math.floor(t * (118 / 30)) % 4;
        p.hipsY = BASE_HIPS_Y - (step % 2 === 1 ? 0.05 : 0);
        p.chestRy = step === 0 ? 0.32 : step === 2 ? -0.32 : 0;
        p.headRy = step === 1 ? -0.42 : step === 3 ? 0.42 : 0;
        p.headRz = step === 0 ? 0.18 : step === 2 ? -0.18 : 0;

        p.lShRx = step === 0 || step === 1 ? -1.45 : -0.35;
        p.lShRz = step === 1 ? 0.85 : 0.22;
        p.lElRx = -1.45;

        p.rShRx = step === 2 || step === 3 ? -1.45 : -0.35;
        p.rShRz = step === 3 ? -0.85 : -0.22;
        p.rElRx = -1.45;

        p.lHiRx = step === 1 ? -0.32 : 0;
        p.lKnRx = step === 1 ? 0.52 : 0.10;
        p.rHiRx = step === 3 ? -0.32 : 0;
        p.rKnRx = step === 3 ? 0.52 : 0.10;
        break;
      }
    }
  }

  private applyPoseToJoints(
    rig: CharacterRig,
    p: PoseTarget,
    lambda: number,
    dt: number,
  ): void {
    const j = rig.joints;
    const blend = dt <= 0 ? 1 : 1 - Math.exp(-lambda * dt);
    const step = (cur: number, dst: number): number => cur + (dst - cur) * blend;

    j.hips.position.x = step(j.hips.position.x, p.hipsX);
    j.hips.position.y = step(j.hips.position.y, p.hipsY);
    j.hips.rotation.set(
      step(j.hips.rotation.x, p.hipsRx),
      step(j.hips.rotation.y, p.hipsRy),
      step(j.hips.rotation.z, p.hipsRz),
    );

    j.spine.rotation.set(
      step(j.spine.rotation.x, p.spineRx),
      step(j.spine.rotation.y, p.spineRy),
      step(j.spine.rotation.z, p.spineRz),
    );

    j.chest.rotation.set(
      step(j.chest.rotation.x, p.chestRx),
      step(j.chest.rotation.y, p.chestRy),
      step(j.chest.rotation.z, p.chestRz),
    );

    j.head.rotation.set(
      step(j.head.rotation.x, p.headRx),
      step(j.head.rotation.y, p.headRy),
      step(j.head.rotation.z, p.headRz),
    );

    j.leftShoulder.rotation.set(
      step(j.leftShoulder.rotation.x, p.lShRx),
      step(j.leftShoulder.rotation.y, p.lShRy),
      step(j.leftShoulder.rotation.z, p.lShRz),
    );
    j.leftElbow.rotation.set(
      step(j.leftElbow.rotation.x, p.lElRx),
      step(j.leftElbow.rotation.y, p.lElRy),
      0,
    );
    j.leftHand.rotation.x = step(j.leftHand.rotation.x, p.lHaRx);

    j.rightShoulder.rotation.set(
      step(j.rightShoulder.rotation.x, p.rShRx),
      step(j.rightShoulder.rotation.y, p.rShRy),
      step(j.rightShoulder.rotation.z, p.rShRz),
    );
    j.rightElbow.rotation.set(
      step(j.rightElbow.rotation.x, p.rElRx),
      step(j.rightElbow.rotation.y, p.rElRy),
      0,
    );
    j.rightHand.rotation.x = step(j.rightHand.rotation.x, p.rHaRx);

    j.leftHip.rotation.set(
      step(j.leftHip.rotation.x, p.lHiRx),
      step(j.leftHip.rotation.y, p.lHiRy),
      step(j.leftHip.rotation.z, p.lHiRz),
    );
    j.leftKnee.rotation.x = step(j.leftKnee.rotation.x, p.lKnRx);
    j.leftFoot.rotation.x = step(j.leftFoot.rotation.x, p.lFoRx);

    j.rightHip.rotation.set(
      step(j.rightHip.rotation.x, p.rHiRx),
      step(j.rightHip.rotation.y, p.rHiRy),
      step(j.rightHip.rotation.z, p.rHiRz),
    );
    j.rightKnee.rotation.x = step(j.rightKnee.rotation.x, p.rKnRx);
    j.rightFoot.rotation.x = step(j.rightFoot.rotation.x, p.rFoRx);
  }
}
