import type { AnimState, CharacterRenderState, EmoteId, WeaponId } from '../types';
import { clamp, damp } from '../core';
import { shouldActivateContrail, type CharacterRig } from './CharacterRig';

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
const SLIDE_HIPS_Y = 0.44;

function finiteOr(val: number | undefined, fallback = 0): number {
  return val !== undefined && Number.isFinite(val) ? val : fallback;
}

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
    weaponId === 'tactical_dmr' ||
    weaponId === 'pump_shotgun' ||
    weaponId === 'tac_shotgun' ||
    weaponId === 'heavy_shotgun' ||
    weaponId === 'smg' ||
    weaponId === 'combat_smg' ||
    weaponId === 'sniper' ||
    weaponId === 'boom_bow' ||
    weaponId === 'rocket_launcher' ||
    weaponId === 'mythic_blade_rifle'
  );
}

function isMeleeWeapon(weaponId: WeaponId): boolean {
  return weaponId === 'pickaxe' || weaponId === 'kinetic_blade';
}

function isThrowable(weaponId: WeaponId): boolean {
  return (
    weaponId === 'shockwave_grenade' ||
    weaponId === 'frag_grenade' ||
    weaponId === 'chug_splash' ||
    weaponId === 'shield_bubble'
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

function resolveAnimState(state: CharacterRenderState): AnimState {
  if (state.isKnocked) return 'knocked';
  if (state.isReviving) return 'reviving';
  const anim = state.animState;
  const isBaseLocomotion =
    anim === 'idle' ||
    anim === 'walk' ||
    anim === 'run' ||
    anim === 'sprint' ||
    anim === 'crouch_idle' ||
    anim === 'crouch_walk' ||
    anim === 'jump' ||
    anim === 'fall';

  if (isBaseLocomotion) {
    if (state.isZiplining) return 'zipline';
    if (state.isSliding) return 'slide';
    if (state.isSwimming) return 'swim';
  }
  return anim;
}

/**
 * Procedural skeletal animator for CharacterRig.
 * Supports all 20 AnimStates, all 6 EmoteId dances, banking lean, aiming pitch, and recoil kick.
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
    root.position.set(
      finiteOr(state.position.x),
      finiteOr(state.position.y),
      finiteOr(state.position.z),
    );
    root.rotation.y = finiteOr(state.yaw);

    rig.equipWeapon(state.weaponId, state.isBuilding);
    if (state.weaponWrapId !== undefined) {
      rig.setWeaponWrap(state.weaponWrapId);
    }
    if (state.contrailId !== undefined) {
      rig.setContrail(state.contrailId);
    }

    const anim = resolveAnimState(state);
    rig.updateGroundShadow(state.grounded, finiteOr(state.position.y), undefined, anim);
    const shouldGlideOpen = anim === 'glide';
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
    rig.updateContrail(shouldActivateContrail(state, anim), safeDt, data.time);

    const p = data.target;
    resetPose(p);

    const t = data.time;
    const speed = finiteOr(state.moveSpeed);
    const velY = clamp(finiteOr(state.velocityY), -25, 25);
    const lean = clamp(finiteOr(state.leanAngle), -0.45, 0.45);

    // 1. Base locomotion / full-body action pose
    switch (anim) {
      case 'idle':
        this.applyIdlePose(p, t);
        break;
      case 'walk':
        this.applyGaitPose(p, data, safeDt, speed > 0.1 ? speed : 3.2, 6.4, 0.48, 0.58, 0.05, 0.028, false);
        break;
      case 'run':
        this.applyGaitPose(p, data, safeDt, speed > 0.1 ? speed : 6.2, 9.6, 0.78, 0.96, 0.14, 0.052, false);
        break;
      case 'sprint':
        this.applyGaitPose(p, data, safeDt, speed > 0.1 ? speed : 8.5, 12.6, 1.02, 1.18, 0.28, 0.072, true);
        break;
      case 'crouch_idle':
        this.applyCrouchIdlePose(p, t);
        break;
      case 'crouch_walk':
        this.applyCrouchWalkPose(p, data, safeDt, speed > 0.1 ? speed : 2.6);
        break;
      case 'jump':
        this.applyJumpPose(p, t, velY);
        break;
      case 'fall':
        this.applyFallPose(p, t, velY);
        break;
      case 'slide':
        this.applySlidePose(p, t);
        break;
      case 'mantle':
        this.applyMantlePose(p, t);
        break;
      case 'swim':
        this.applySwimPose(p, t, speed);
        break;
      case 'zipline':
        this.applyZiplinePose(p, t);
        break;
      case 'drive':
        this.applyDrivePose(p, t, speed, lean);
        break;
      case 'skydive':
        this.applySkydivePose(p, t);
        break;
      case 'glide':
        this.applyGlidePose(p, t, rig.getGlider().style === 'hover');
        break;
      case 'harvest':
        if (speed > 0.5) {
          this.applyGaitPose(p, data, safeDt, speed, 8.8, 0.65, 0.8, 0.1, 0.04, false);
        } else {
          this.applyIdlePose(p, t);
        }
        this.applyHarvestPose(p, t, finiteOr(state.harvestSwingTimer));
        break;
      case 'reload':
        if (speed > 0.5) {
          this.applyGaitPose(p, data, safeDt, speed, 8.4, 0.6, 0.72, 0.08, 0.035, false);
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
        if (speed > 0.5) {
          this.applyGaitPose(p, data, safeDt, speed, 9.2, 0.68, 0.85, 0.1, 0.04, false);
        } else {
          this.applyIdlePose(p, t);
        }
        this.applyBuildPose(p, t);
        break;
      case 'emote':
        this.applyEmotePose(p, t, state.emoteId ?? 'victory_groove');
        break;
      case 'knocked':
        this.applyKnockedPose(p, data, safeDt, speed);
        break;
      case 'reviving':
        this.applyRevivingPose(p, t);
        break;
    }

    // 2. Banking lean roll (carving turns during sprint, slide, glide, drive, swim, etc.)
    if (
      lean !== 0 &&
      anim !== 'emote' &&
      anim !== 'heal' &&
      anim !== 'knocked' &&
      anim !== 'reviving'
    ) {
      p.hipsRz += lean * 0.55;
      p.spineRz += lean * 0.35;
      p.chestRz += lean * 0.20;
      p.headRz -= lean * 0.35;
    }

    // 3. Upper-body weapon readiness, aiming pitch & recoil kick
    const isSlideWithTrailingArm = anim === 'slide' && !state.isAiming && !state.isFiring;
    const isZiplineUnfocused = anim === 'zipline' && !state.isAiming && !state.isFiring;
    const suppressWeaponAim =
      anim === 'skydive' ||
      anim === 'glide' ||
      anim === 'drive' ||
      anim === 'emote' ||
      anim === 'harvest' ||
      anim === 'reload' ||
      anim === 'heal' ||
      anim === 'build' ||
      anim === 'mantle' ||
      anim === 'swim' ||
      anim === 'knocked' ||
      anim === 'reviving' ||
      isSlideWithTrailingArm ||
      isZiplineUnfocused;

    if (!suppressWeaponAim) {
      if (state.isBuilding) {
        this.applyBuildPose(p, t);
      } else {
        this.applyUpperBodyWeaponAim(p, state, anim, t);
      }
    }

    // 4. Articulated backbling motion (cape flutter, wing flaps, pack antenna sway)
    const isAirborne =
      !state.grounded ||
      anim === 'jump' ||
      anim === 'fall' ||
      anim === 'skydive' ||
      anim === 'glide' ||
      anim === 'zipline';
    rig.animateBackbling(speed, t, isAirborne, anim === 'slide');

    // 5. Smoothly damp joints toward target pose (instant snap on dt === 0 for deterministic single-step tests)
    const blendLambda =
      anim === 'emote' ||
      anim === 'harvest' ||
      anim === 'slide' ||
      anim === 'mantle' ||
      anim === 'drive' ||
      anim === 'knocked' ||
      anim === 'reviving'
        ? 22
        : 16;
    this.applyPoseToJoints(rig, p, blendLambda, safeDt);

    // 6. Sync Boss Crown Aura state & animation if provided or active
    if (state.isBoss !== undefined) {
      rig.setBossAura(Boolean(state.isBoss), data.time);
    } else if (rig.isBossAuraEnabled()) {
      rig.setBossAura(true, data.time);
    }

    // 7. Sync Duo Partner cyan-gold overhead chevron aura
    if (state.isDuoPartner !== undefined) {
      rig.setDuoPartnerAura(Boolean(state.isDuoPartner), data.time);
    } else if (rig.isDuoPartnerAuraEnabled()) {
      rig.setDuoPartnerAura(true, data.time);
    }

    // 8. Sync Allied Specialist Tactical Aura state & animation if provided or active (suppressed by Duo Partner aura)
    if (state.isAlly !== undefined) {
      rig.setAllyAura(Boolean(state.isAlly) && !state.isDuoPartner, state.allyRole, data.time);
    } else if (rig.isAllyAuraEnabled() && !rig.isDuoPartnerAuraEnabled()) {
      rig.setAllyAura(true, state.allyRole, data.time);
    }

    // 9. Sync Victory Crown Halo state & smooth bob animation
    if (state.hasVictoryCrown !== undefined) {
      rig.setVictoryCrown(Boolean(state.hasVictoryCrown), data.time);
    } else if (rig.hasVictoryCrown()) {
      rig.setVictoryCrown(true, data.time);
    }

    // 10. Sync Aspect Medallions orbital rotation around torso
    if (state.medallionCount !== undefined) {
      rig.setMedallionCount(state.medallionCount, data.time);
    } else if (rig.getMedallionCount() > 0) {
      rig.setMedallionCount(rig.getMedallionCount(), data.time);
    }
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

  private applyJumpPose(p: PoseTarget, t: number, velY: number): void {
    const flutter = Math.sin(t * 6) * 0.04;
    const tuck = clamp(velY * 0.02, -0.1, 0.16);
    p.hipsY = BASE_HIPS_Y + 0.05;
    p.spineRx = 0.08;
    p.lHiRx = -0.62 - tuck + flutter;
    p.lKnRx = 0.98 + tuck * 0.8;
    p.lFoRx = -0.25;
    p.rHiRx = 0.24 - flutter;
    p.rKnRx = 0.36;
    p.rFoRx = 0.12;
    p.lShRx = -0.45;
    p.lShRz = 0.32;
    p.lElRx = -0.65;
  }

  private applyFallPose(p: PoseTarget, t: number, velY: number): void {
    const flutter = Math.sin(t * 9) * 0.06;
    const dropFactor = clamp(-velY * 0.015, 0, 0.25);
    p.hipsY = BASE_HIPS_Y + 0.02;
    p.spineRx = 0.14;
    p.lHiRx = -0.35 + flutter;
    p.lKnRx = 0.62;
    p.lFoRx = 0.15;
    p.rHiRx = 0.12 - flutter;
    p.rKnRx = 0.48;
    p.rFoRx = 0.18;
    p.lShRx = -0.55 - dropFactor;
    p.lShRz = 0.48 + dropFactor * 0.6 + flutter * 0.5;
    p.lElRx = -0.45;
  }

  private applySlidePose(p: PoseTarget, t: number): void {
    const grit = Math.sin(t * 16) * 0.015;
    // Low crouched knee-drag leaning back with trailing left arm
    p.hipsY = SLIDE_HIPS_Y + grit;
    p.hipsRx = -0.38;
    p.hipsRy = -0.24;
    p.spineRx = -0.18;
    p.chestRx = -0.10;
    p.chestRy = 0.18;
    p.headRx = 0.42;
    p.headRy = 0.08;

    // Lead left leg extended forward along slide vector
    p.lHiRx = -1.24;
    p.lHiRz = 0.10;
    p.lKnRx = 0.34;
    p.lFoRx = 0.26;

    // Trailing right knee tucked & dragging behind
    p.rHiRx = 0.32;
    p.rHiRz = -0.14;
    p.rKnRx = 1.52;
    p.rFoRx = 0.45;

    // Trailing left arm skimming ground for balance
    p.lShRx = 0.58 + grit * 2;
    p.lShRy = -0.18;
    p.lShRz = 0.46;
    p.lElRx = -0.32;

    // Right arm carries weapon compactly across chest unless aiming
    p.rShRx = -0.42;
    p.rShRy = 0.35;
    p.rShRz = -0.16;
    p.rElRx = -0.82;
  }

  private applyMantlePose(p: PoseTarget, t: number): void {
    const climb = Math.sin(t * 8.5);
    const lift = 0.5 - 0.5 * Math.cos(t * 7.0);
    // Dynamic vaulting body pitching forward over ledge
    p.hipsY = BASE_HIPS_Y - 0.06 + lift * 0.14;
    p.hipsRx = 0.28;
    p.spineRx = 0.24;
    p.chestRx = 0.14;
    p.chestRy = climb * 0.14;
    p.headRx = -0.38;

    // Arms reaching high overhead & vaulting/pulling body up
    p.lShRx = -2.42 + climb * 0.26;
    p.lShRy = -0.12;
    p.lShRz = 0.24;
    p.lElRx = -0.58 - Math.max(0, -climb) * 0.48;

    p.rShRx = -2.42 - climb * 0.26;
    p.rShRy = 0.12;
    p.rShRz = -0.24;
    p.rElRx = -0.58 - Math.max(0, climb) * 0.48;

    // Legs driving upward to clear ledge
    p.lHiRx = -0.96 + climb * 0.32;
    p.lKnRx = 1.28;
    p.lFoRx = 0.18;
    p.rHiRx = -0.48 - climb * 0.32;
    p.rKnRx = 0.96;
    p.rFoRx = 0.22;
  }

  private applySwimPose(p: PoseTarget, t: number, speed: number): void {
    const pace = speed > 0.4 ? 7.2 : 4.2;
    const stroke = t * pace;
    const lArm = Math.sin(stroke);
    const rArm = Math.sin(stroke + Math.PI);
    const kick = Math.sin(t * (pace * 2.0));

    // Prone swimming attitude at water surface
    p.hipsY = 0.88 + Math.sin(t * 4.2) * 0.03;
    p.hipsRx = 1.30;
    p.hipsRz = lArm * 0.14;
    p.spineRx = 0.04;
    p.chestRy = lArm * 0.30;
    p.headRx = -0.92; // Chin raised above waterline looking ahead

    // Alternating freestyle crawl arm strokes
    p.lShRx = -1.25 - lArm * 1.42;
    p.lShRz = 0.32 + Math.max(0, lArm) * 0.38;
    p.lElRx = lArm > 0 ? -0.92 * lArm : -0.22;

    p.rShRx = -1.25 - rArm * 1.42;
    p.rShRz = -0.32 - Math.max(0, rArm) * 0.38;
    p.rElRx = rArm > 0 ? -0.92 * rArm : -0.22;

    // Rapid alternating flutter kick
    p.lHiRx = 0.16 + kick * 0.34;
    p.lKnRx = 0.30 + Math.max(0, -kick) * 0.36;
    p.lFoRx = 0.46;
    p.lHiRz = 0.10;

    p.rHiRx = 0.16 - kick * 0.34;
    p.rKnRx = 0.30 + Math.max(0, kick) * 0.36;
    p.rFoRx = 0.46;
    p.rHiRz = -0.10;
  }

  private applyZiplinePose(p: PoseTarget, t: number): void {
    const sway = Math.sin(t * 4.4);
    const legSwing = Math.sin(t * 5.2);

    p.hipsY = 0.82;
    p.hipsRx = 0.12 + sway * 0.04;
    p.hipsRz = sway * 0.04;
    p.spineRx = 0.04;
    p.chestRx = -0.05;
    p.chestRy = -0.12;
    p.headRx = -0.08;

    // One-hand overhead grip (left arm straight overhead gripping energy rail)
    p.lShRx = -2.85;
    p.lShRy = 0.04;
    p.lShRz = 0.08;
    p.lElRx = -0.12;
    p.lHaRx = -0.18;

    // Right arm swept outward for aerodynamic balance
    p.rShRx = -0.34;
    p.rShRy = 0.12;
    p.rShRz = -0.62 + sway * 0.12;
    p.rElRx = -0.65;

    // Dangling legs trailing in slipstream
    p.lHiRx = 0.24 + legSwing * 0.11;
    p.lKnRx = 0.42 + legSwing * 0.06;
    p.lFoRx = 0.28;
    p.rHiRx = 0.36 - legSwing * 0.11;
    p.rKnRx = 0.56 - legSwing * 0.06;
    p.rFoRx = 0.32;
  }

  private applyDrivePose(p: PoseTarget, t: number, speed: number, lean: number): void {
    const hoverHum = Math.sin(t * (speed > 1.5 ? 16 : 5)) * (speed > 1.5 ? 0.01 : 0.006);
    const speedTilt = clamp(speed / 24, 0, 1) * 0.12;
    const steerPull = lean * 0.18;

    // Seated hover-saddle posture leaning subtly forward over handlebars
    p.hipsY = 0.62 + hoverHum;
    p.hipsRx = -0.08;
    p.spineRx = 0.24 + speedTilt;
    p.chestRx = 0.14;
    p.chestRy = -lean * 0.16;
    p.headRx = -0.26 - speedTilt * 0.5;
    p.headRy = -lean * 0.22;

    // Both arms reaching forward gripping hover-handlebars
    p.lShRx = -1.12 + steerPull;
    p.lShRy = -0.16;
    p.lShRz = 0.18;
    p.lElRx = -0.46;
    p.lHaRx = 0.15;

    p.rShRx = -1.12 - steerPull;
    p.rShRy = 0.16;
    p.rShRz = -0.18;
    p.rElRx = -0.46;
    p.rHaRx = 0.15;

    // Bent hips & knees straddling hover-bike/ATV seat onto footrests
    p.lHiRx = -1.22;
    p.lHiRy = 0.08;
    p.lHiRz = 0.16;
    p.lKnRx = 1.42;
    p.lFoRx = -0.15;

    p.rHiRx = -1.22;
    p.rHiRy = -0.08;
    p.rHiRz = -0.16;
    p.rKnRx = 1.42;
    p.rFoRx = -0.15;
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
    const cycle = swingTimer > 0 ? (swingTimer % 0.625) / 0.625 : (t * 1.65) % 1;
    const swing =
      cycle < 0.35
        ? -Math.cos((cycle / 0.35) * Math.PI)
        : 1 - ((cycle - 0.35) / 0.65) * 2;

    p.chestRy = -swing * 0.42;
    p.spineRy = -swing * 0.18;
    p.chestRx = 0.08 + Math.max(0, swing) * 0.14;

    p.rShRx = -1.35 + swing * 0.88;
    p.rShRy = 0.22 + swing * 0.35;
    p.rShRz = -0.35 + swing * 0.55;
    p.rElRx = -0.45 - Math.max(0, -swing) * 0.45;
    p.rHaRx = swing * 0.25;

    p.lShRx = -0.45 - swing * 0.35;
    p.lShRz = 0.28;
    p.lElRx = -0.72;
  }

  private applyReloadPose(p: PoseTarget, t: number): void {
    const cycle = (t * 1.25) % 1;
    const insert = Math.sin(cycle * Math.PI);

    p.chestRy = 0.22;
    p.headRx = 0.14;

    p.rShRx = -0.92;
    p.rShRy = 0.48;
    p.rShRz = -0.1;
    p.rElRx = -0.78;
    p.rElRy = 0.25;

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
    p.rShRx = -0.98;
    p.rShRy = 0.26;
    p.rShRz = -0.05;
    p.rElRx = -0.68 + tap;
    p.rHaRx = 0.1;

    p.lShRx = -0.95 + tap * 0.8;
    p.lShRy = -0.46;
    p.lShRz = 0.1;
    p.lElRx = -0.74 - tap;
  }

  private applyKnockedPose(
    p: PoseTarget,
    data: RigAnimData,
    dt: number,
    speed: number,
  ): void {
    const isCrawling = speed > 0.1;
    if (isCrawling) {
      const pace = clamp(speed / 1.8, 0.7, 1.5);
      data.gaitPhase += dt * 4.8 * pace;
    }
    const crawl = isCrawling ? Math.sin(data.gaitPhase) : 0;
    const breath = Math.sin(data.time * 3.2) * 0.015;

    // Hands-and-knees DBNO crawl posture close to ground
    p.hipsY = 0.48 + breath + Math.abs(crawl) * 0.018;
    p.hipsRx = 1.15;
    p.hipsRz = crawl * 0.07;
    p.spineRx = 0.08;
    p.chestRx = 0.05;
    p.chestRy = crawl * 0.15;
    p.headRx = -0.92 + (isCrawling ? 0 : Math.sin(data.time * 2.4) * 0.05);
    p.headRy = isCrawling ? -crawl * 0.08 : Math.sin(data.time * 1.8) * 0.12;

    // Hands bracing & crawling forward
    p.lShRx = -1.38 + crawl * 0.30;
    p.lShRy = -0.08;
    p.lShRz = 0.12;
    p.lElRx = -0.22 - Math.max(0, crawl) * 0.28;
    p.lHaRx = 0.42;

    p.rShRx = -1.38 - crawl * 0.30;
    p.rShRy = 0.08;
    p.rShRz = -0.12;
    p.rElRx = -0.22 - Math.max(0, -crawl) * 0.28;
    p.rHaRx = 0.42;

    // Kneeling legs alternating crawl behind hips
    p.lHiRx = -1.04 - crawl * 0.26;
    p.lHiRz = 0.08;
    p.lKnRx = 1.38 + Math.max(0, -crawl) * 0.18;
    p.lFoRx = 0.32;

    p.rHiRx = -1.04 + crawl * 0.26;
    p.rHiRz = -0.08;
    p.rKnRx = 1.38 + Math.max(0, crawl) * 0.18;
    p.rFoRx = 0.32;
  }

  private applyRevivingPose(p: PoseTarget, t: number): void {
    const pulse = Math.sin(t * 5.0);
    const breath = Math.sin(t * 2.6);

    // Tactical kneeling healing stance leaning toward downed partner
    p.hipsY = CROUCH_HIPS_Y + breath * 0.01;
    p.hipsRx = 0.10;
    p.spineRx = 0.26;
    p.chestRx = 0.14 + pulse * 0.025;
    p.headRx = 0.22;

    // Half-kneeling leg base (left knee down, right foot planted)
    p.lHiRx = -0.16;
    p.lHiRz = 0.08;
    p.lKnRx = 1.48;
    p.lFoRx = 0.22;

    p.rHiRx = -1.10;
    p.rHiRz = -0.08;
    p.rKnRx = 1.28;
    p.rFoRx = -0.18;

    // Both arms extended forward channeling healing energy
    p.lShRx = -1.08 + pulse * 0.06;
    p.lShRy = -0.28;
    p.lShRz = 0.14;
    p.lElRx = -0.56 - pulse * 0.06;
    p.lHaRx = 0.15;

    p.rShRx = -1.08 - pulse * 0.06;
    p.rShRy = 0.28;
    p.rShRz = -0.14;
    p.rElRx = -0.56 + pulse * 0.06;
    p.rHaRx = 0.15;
  }

  private applyUpperBodyWeaponAim(
    p: PoseTarget,
    state: CharacterRenderState,
    anim: AnimState,
    t: number,
  ): void {
    const aimPitch = clamp(finiteOr(state.pitch), -1.35, 1.35);
    const recoil = clamp(finiteOr(state.recoilKick), 0, 1);
    const recoilTilt = recoil * 0.28;

    const isSprintingUnfocused = anim === 'sprint' && !state.isAiming && !state.isFiring;
    const weapon = state.weaponId;

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
      } else if (isMeleeWeapon(weapon)) {
        p.rShRx = -0.35 + Math.sin(t * 11) * 0.35;
        p.rElRx = -1.05;
      }
      return;
    }

    const pitchInfluence = state.isAiming || state.isFiring ? 0.35 : 0.2;
    p.chestRx += -aimPitch * pitchInfluence - recoilTilt * 0.25;
    p.headRx += -aimPitch * 0.55;

    const torsoPitch = p.hipsRx + p.spineRx + p.chestRx;
    const keepLeftGripOnZipline = anim === 'zipline';

    if (isMeleeWeapon(weapon)) {
      if (state.isAiming || state.isFiring) {
        p.rElRx = -0.55;
        p.rShRx = -Math.PI / 2 - torsoPitch - aimPitch - p.rElRx;
        p.rShRy = 0.15;
        if (!keepLeftGripOnZipline) {
          p.lShRx = -0.55;
          p.lElRx = -0.72;
        }
      } else {
        p.rShRx = -0.52;
        p.rShRy = 0.08;
        p.rShRz = -0.16;
        p.rElRx = -0.62;
        if (!keepLeftGripOnZipline) {
          p.lShRx = Math.max(p.lShRx, -0.45);
        }
      }
      return;
    }

    if (isConsumable(weapon)) {
      p.rShRx = -0.78;
      p.rShRy = 0.32;
      p.rElRx = -0.82;
      if (!keepLeftGripOnZipline) {
        p.lShRx = -0.48;
        p.lShRy = -0.25;
        p.lElRx = -0.65;
      }
      return;
    }

    if (isThrowable(weapon)) {
      if (state.isAiming || state.isFiring) {
        // Cocked-back overhand throw wind-up
        p.rShRx = -2.10 - aimPitch * 0.65 - recoilTilt * 0.6;
        p.rShRy = -0.15;
        p.rShRz = -0.22;
        p.rElRx = -0.78;
        if (!keepLeftGripOnZipline) {
          p.lShRx = -1.25 - aimPitch * 0.6;
          p.lShRy = -0.25;
          p.lShRz = 0.18;
          p.lElRx = -0.25;
        }
      } else {
        p.rShRx = -0.68;
        p.rShRy = 0.22;
        p.rShRz = -0.10;
        p.rElRx = -0.78;
      }
      return;
    }

    if (weapon === 'boom_bow') {
      const bowCharge = clamp(finiteOr(state.bowCharge), 0, 1);
      if (bowCharge > 0.01 || state.isAiming || state.isFiring) {
        p.chestRy += 0.18 + 0.36 * bowCharge;
        p.headRy -= 0.14 + 0.28 * bowCharge;
        p.rElRx = -0.22 - bowCharge * 0.08;
        p.rHaRx = 0;
        p.rShRx = -Math.PI / 2 - torsoPitch - aimPitch - recoilTilt - p.rElRx;
        p.rShRy = 0.08 + bowCharge * 0.18;
        p.rShRz = -0.04;

        if (!keepLeftGripOnZipline) {
          p.lShRx = -1.26 + bowCharge * 0.42 - aimPitch * 0.45;
          p.lShRy = -0.46 - bowCharge * 0.34;
          p.lShRz = 0.16 + bowCharge * 0.24;
          p.lElRx = -0.44 - bowCharge * 1.12;
        }
      } else {
        p.rShRx = -0.72;
        p.rShRy = 0.18;
        p.rShRz = -0.10;
        p.rElRx = -0.62;
        if (!keepLeftGripOnZipline) {
          p.lShRx = -0.58;
          p.lShRy = -0.32;
          p.lElRx = -0.68;
        }
      }
      return;
    }

    if (weapon === 'pistol' || weapon === 'grappler' || keepLeftGripOnZipline) {
      p.rElRx = state.isAiming ? -0.32 : -0.55;
      p.rHaRx = 0;
      p.rShRx = -Math.PI / 2 - torsoPitch - aimPitch - recoilTilt - p.rElRx - p.rHaRx;
      p.rShRy = state.isAiming ? 0.16 : 0.12;
      p.rShRz = -0.05;

      if (!keepLeftGripOnZipline && (state.isAiming || state.isFiring)) {
        p.lShRx = p.rShRx + 0.08;
        p.lShRy = -0.56;
        p.lShRz = 0.06;
        p.lElRx = -0.48;
      }
      return;
    }

    // Two-handed rifles, shotguns, SMG, sniper, rocket launcher:
    p.rElRx = state.isAiming ? -0.38 : -0.48;
    p.rHaRx = 0;
    p.rShRx = -Math.PI / 2 - torsoPitch - aimPitch - recoilTilt - p.rElRx - p.rHaRx;
    p.rShRy = 0.14;
    p.rShRz = -0.04;

    p.lElRx = state.isAiming ? -0.52 : -0.62;
    p.lShRx = -Math.PI / 2 - torsoPitch - aimPitch - recoilTilt * 0.8 - p.lElRx + 0.06;
    p.lShRy = -0.54;
    p.lShRz = 0.10;
  }

  private applyEmotePose(p: PoseTarget, t: number, emoteId: EmoteId): void {
    switch (emoteId) {
      case 'victory_groove': {
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
        const beat = t * ((128 / 60) * Math.PI);
        const swing = Math.sin(beat);
        const cross = Math.cos(beat * 0.5);
        p.hipsY = BASE_HIPS_Y - 0.02 + Math.abs(swing) * 0.02;
        p.hipsX = -swing * 0.09;
        p.hipsRz = swing * 0.22;
        p.chestRz = -swing * 0.16;
        p.headRz = swing * 0.10;

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
        const beat = t * ((132 / 60) * Math.PI);
        const s = Math.sin(beat);
        const hop = Math.abs(s);
        p.hipsY = BASE_HIPS_Y + hop * 0.09;
        p.hipsRz = s * 0.16;
        p.chestRz = -s * 0.14;
        p.headRz = s * 0.12;

        p.rShRx = -2.38 + hop * 0.18;
        p.rShRz = -0.28;
        p.rElRx = -0.95;

        p.lShRx = -0.25;
        p.lShRz = 0.62;
        p.lElRx = -1.25;

        p.lHiRx = s > 0 ? -1.12 * s : 0.15;
        p.lKnRx = s > 0 ? 0.25 : 0.35;
        p.rHiRx = s < 0 ? 1.12 * s : 0.15;
        p.rKnRx = s < 0 ? 0.25 : 0.35;
        break;
      }
      case 'robot_boogie': {
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
      case 'electro_shuffle': {
        // 126 BPM Melbourne-shuffle footwork + syncopated electro arm chops
        const beat = t * ((126 / 60) * Math.PI);
        const s = Math.sin(beat);
        const s2 = Math.sin(beat * 2);
        const hop = Math.abs(Math.cos(beat));

        p.hipsX = s * 0.14;
        p.hipsY = BASE_HIPS_Y - 0.05 + hop * 0.075;
        p.hipsRy = s * 0.24;
        p.hipsRz = -s * 0.11;
        p.chestRy = -s * 0.28;
        p.chestRx = 0.06;
        p.headRy = s * 0.14;
        p.headRx = s2 * 0.08;

        // Cutting-shapes alternating running-man + heel-flick steps
        p.lHiRx = s > 0 ? -0.78 * s : 0.42 * -s;
        p.lKnRx = 0.24 + Math.max(0, s) * 0.86;
        p.lFoRx = s * 0.26;
        p.lHiRz = 0.10 + Math.max(0, s) * 0.18;

        p.rHiRx = s < 0 ? 0.78 * s : 0.42 * s;
        p.rKnRx = 0.24 + Math.max(0, -s) * 0.86;
        p.rFoRx = -s * 0.26;
        p.rHiRz = -0.10 - Math.max(0, -s) * 0.18;

        // Sharp electro arm pumps & forearm crosses
        p.lShRx = -0.88 + s2 * 0.46;
        p.lShRy = -0.45 * s;
        p.lShRz = 0.44 + Math.abs(s) * 0.36;
        p.lElRx = -1.24 + s * 0.25;

        p.rShRx = -0.88 - s2 * 0.46;
        p.rShRy = 0.45 * s;
        p.rShRz = -0.44 - Math.abs(s) * 0.36;
        p.rElRx = -1.24 - s * 0.25;
        break;
      }
      case 'star_salute': {
        // 112 BPM heroic royal salute -> triumphant overhead star extension
        const beat = t * ((112 / 60) * Math.PI);
        const s = Math.sin(beat);
        const phrase = Math.sin(beat * 0.5);
        const saluteWeight = clamp(0.5 + 0.5 * phrase, 0, 1);

        p.hipsY = BASE_HIPS_Y + Math.abs(s) * 0.032;
        p.hipsRy = phrase * 0.16;
        p.chestRx = -0.10 + s * 0.05;
        p.chestRy = -phrase * 0.12;
        p.headRx = -0.08;
        p.headRy = phrase * 0.10;

        // Right arm sweeps between crisp forehead salute and high victorious star point
        p.rShRx = -1.82 * saluteWeight + -2.42 * (1 - saluteWeight);
        p.rShRy = 0.38 * saluteWeight + -0.12 * (1 - saluteWeight);
        p.rShRz = -0.46 * saluteWeight + -0.36 * (1 - saluteWeight);
        p.rElRx = -1.90 * saluteWeight + -0.24 * (1 - saluteWeight);
        p.rHaRx = 0.2 * saluteWeight;

        // Left arm rests proudly behind hip or balances outward
        p.lShRx = 0.18 * saluteWeight + -0.45 * (1 - saluteWeight);
        p.lShRz = 0.46 + (1 - saluteWeight) * 0.35;
        p.lElRx = -1.15 * saluteWeight + -0.35 * (1 - saluteWeight);

        // Grounded heroic wide stance with crisp alternating march pulse
        p.lHiRz = 0.12;
        p.rHiRz = -0.12;
        p.lHiRx = -Math.max(0, s) * 0.26;
        p.lKnRx = 0.12 + Math.max(0, s) * 0.40;
        p.rHiRx = -Math.max(0, -s) * 0.26;
        p.rKnRx = 0.12 + Math.max(0, -s) * 0.40;
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
