import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type {
  AnimState,
  BiomeType,
  CharacterRenderState,
  EmoteId,
  WeaponId,
} from '../../types';
import {
  EMOTES,
  EventBus,
  GLIDERS,
  PICKAXES,
  SKINS,
  WEAPONS,
} from '../../core';
import {
  CharacterAnimator,
  CharacterRig,
  VFXManager,
  createBlueprintModel,
  createWeaponModel,
  disposeObject3D,
  getBiomeDustColors,
  hasMuzzleOffset,
  isRangedWeapon,
  isThrowableWeapon,
} from '../index';

function makeRenderState(overrides: Partial<CharacterRenderState> = {}): CharacterRenderState {
  return {
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    animState: 'idle',
    weaponId: 'ar',
    isAiming: false,
    isFiring: false,
    isBuilding: false,
    emoteId: null,
    moveSpeed: 0,
    grounded: true,
    health: 100,
    shield: 50,
    recoilKick: 0,
    harvestSwingTimer: 0,
    ...overrides,
  };
}

function countMeshes(obj: THREE.Object3D): number {
  let count = 0;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) count++;
  });
  return count;
}

function assertFiniteBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  expect(Number.isFinite(box.min.x)).toBe(true);
  expect(Number.isFinite(box.min.y)).toBe(true);
  expect(Number.isFinite(box.min.z)).toBe(true);
  expect(Number.isFinite(box.max.x)).toBe(true);
  expect(Number.isFinite(box.max.y)).toBe(true);
  expect(Number.isFinite(box.max.z)).toBe(true);
  expect(box.max.x - box.min.x).toBeGreaterThan(0.03);
  expect(box.max.y - box.min.y).toBeGreaterThan(0.03);
  expect(box.max.z - box.min.z).toBeGreaterThan(0.03);
  return box;
}

describe('WeaponModels', () => {
  it('builds distinct stylized 3D models for all 19 WeaponIds with muzzleOffsets on ranged & throwables', () => {
    const allIds = Object.keys(WEAPONS) as WeaponId[];
    expect(allIds).toHaveLength(19);

    const seenNames = new Set<string>();

    for (const id of allIds) {
      const grp = createWeaponModel(id);
      expect(grp).toBeInstanceOf(THREE.Group);
      expect(countMeshes(grp)).toBeGreaterThan(0);
      expect(seenNames.has(grp.name)).toBe(false);
      seenNames.add(grp.name);

      grp.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          expect(child.castShadow).toBe(true);
        }
      });

      if (isRangedWeapon(id) || isThrowableWeapon(id)) {
        expect(hasMuzzleOffset(id)).toBe(true);
        const offset = grp.userData.muzzleOffset;
        expect(offset).toBeInstanceOf(THREE.Vector3);
        expect(Number.isFinite(offset.x)).toBe(true);
        expect(Number.isFinite(offset.y)).toBe(true);
        expect(offset.z).toBeGreaterThan(0.15);
      } else {
        expect(hasMuzzleOffset(id)).toBe(false);
      }

      assertFiniteBox(grp);
      disposeObject3D(grp);
    }

    // Verify new high-detail models have rich multi-part mesh counts
    const heavySg = createWeaponModel('heavy_shotgun');
    expect(heavySg.name).toBe('weapon_heavy_shotgun');
    expect(countMeshes(heavySg)).toBeGreaterThanOrEqual(12);
    disposeObject3D(heavySg);

    const mythicPulse = createWeaponModel('mythic_blade_rifle');
    expect(mythicPulse.name).toBe('weapon_mythic_blade_rifle');
    expect(countMeshes(mythicPulse)).toBeGreaterThanOrEqual(14);
    disposeObject3D(mythicPulse);

    const shockwave = createWeaponModel('shockwave_grenade');
    expect(shockwave.name).toBe('weapon_shockwave_grenade');
    expect(countMeshes(shockwave)).toBeGreaterThanOrEqual(6);
    disposeObject3D(shockwave);

    const frag = createWeaponModel('frag_grenade');
    expect(frag.name).toBe('weapon_frag_grenade');
    expect(countMeshes(frag)).toBeGreaterThanOrEqual(8);
    disposeObject3D(frag);

    const chug = createWeaponModel('chug_splash');
    expect(chug.name).toBe('weapon_chug_splash');
    expect(countMeshes(chug)).toBeGreaterThanOrEqual(18);
    disposeObject3D(chug);
  });

  it('builds all 6 pickaxes (including plasma_katana & magma_axe) and blueprint model', () => {
    expect(PICKAXES).toHaveLength(6);
    const meshCountsById = new Map<string, number>();

    for (const pickaxe of PICKAXES) {
      const model = createWeaponModel('pickaxe', pickaxe);
      expect(model.name).toBe(`weapon_pickaxe_${pickaxe.style}`);
      const meshes = countMeshes(model);
      expect(meshes).toBeGreaterThanOrEqual(4);
      meshCountsById.set(pickaxe.id, meshes);
      assertFiniteBox(model);
      disposeObject3D(model);
    }

    // Ensure plasma_katana and magma_axe have bespoke geometry distinct from neon_edge / storm_breaker
    expect(meshCountsById.get('plasma_katana')).not.toBe(meshCountsById.get('neon_edge'));
    expect(meshCountsById.get('magma_axe')).not.toBe(meshCountsById.get('storm_breaker'));

    const blueprint = createBlueprintModel();
    expect(blueprint.name).toBe('weapon_blueprint');
    expect(countMeshes(blueprint)).toBeGreaterThanOrEqual(6);
    disposeObject3D(blueprint);
  });
});

describe('CharacterRig', () => {
  it('constructs a ~1.85m sculpted humanoid with feet at y=0 and all 21 joints', () => {
    const rig = new CharacterRig();
    const root = rig.getGroup();
    root.updateMatrixWorld(true);

    const requiredJoints: Array<keyof typeof rig.joints> = [
      'root',
      'hips',
      'spine',
      'chest',
      'neck',
      'head',
      'leftShoulder',
      'leftElbow',
      'leftHand',
      'rightShoulder',
      'rightElbow',
      'rightHand',
      'weaponSocket',
      'leftHip',
      'leftKnee',
      'leftFoot',
      'rightHip',
      'rightKnee',
      'rightFoot',
      'backblingSocket',
      'gliderSocket',
    ];

    for (const key of requiredJoints) {
      expect(rig.joints[key]).toBeInstanceOf(THREE.Group);
    }

    const box = assertFiniteBox(root);
    const height = box.max.y - box.min.y;
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(height).toBeGreaterThan(1.75);
    expect(height).toBeLessThan(1.98);

    let allCastShadows = true;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.castShadow) {
        allCastShadows = false;
      }
    });
    expect(allCastShadows).toBe(true);

    rig.dispose();
  });

  it('supports swapping all skins, all 6 pickaxes, and all 6 gliders cleanly with valid bounds', () => {
    expect(SKINS.length).toBeGreaterThanOrEqual(10);
    expect(PICKAXES).toHaveLength(6);
    expect(GLIDERS).toHaveLength(6);

    const rig = new CharacterRig(SKINS[0], PICKAXES[0], GLIDERS[0]);

    for (const skin of SKINS) {
      rig.setSkin(skin);
      expect(rig.getSkin().id).toBe(skin.id);
      expect(rig.getBackblingStyle()).toBe(skin.backblingStyle);
      if (skin.backblingStyle === 'none') {
        expect(countMeshes(rig.joints.backblingSocket)).toBe(0);
      } else {
        expect(countMeshes(rig.joints.backblingSocket)).toBeGreaterThan(0);
      }

      rig.animateBackbling(8.5, 0.4, false, false);
      const box = assertFiniteBox(rig.getGroup());
      const height = box.max.y - box.min.y;
      expect(box.min.y).toBeCloseTo(0, 1);
      expect(height).toBeGreaterThan(1.75);
      expect(height).toBeLessThan(1.98);
    }

    rig.equipWeapon('pickaxe');
    for (const pickaxe of PICKAXES) {
      rig.setPickaxe(pickaxe);
      expect(rig.getPickaxe().id).toBe(pickaxe.id);
      expect(countMeshes(rig.joints.weaponSocket)).toBeGreaterThan(0);
    }

    rig.setGliderOpen(true, 1);
    expect(rig.joints.gliderSocket.visible).toBe(true);
    for (const glider of GLIDERS) {
      rig.setGlider(glider);
      expect(rig.getGlider().id).toBe(glider.id);
      expect(countMeshes(rig.joints.gliderSocket)).toBeGreaterThan(0);
      assertFiniteBox(rig.joints.gliderSocket);
    }

    rig.setGliderOpen(false);
    expect(rig.joints.gliderSocket.visible).toBe(false);

    // Custom skin with backblingStyle: 'none' leaves backblingSocket empty
    rig.setSkin({ ...SKINS[0], id: 'custom_none', backblingStyle: 'none' });
    expect(rig.getBackblingStyle()).toBe('none');
    expect(countMeshes(rig.joints.backblingSocket)).toBe(0);
    rig.animateBackbling(5, 1.0, false, false);

    rig.setVisible(false);
    expect(rig.getGroup().visible).toBe(false);
    rig.setVisible(true);
    expect(rig.getGroup().visible).toBe(true);

    rig.dispose();
  });

  it('computes world muzzle position accurately across yaw, throwables, and build mode', () => {
    const rig = new CharacterRig();
    rig.equipWeapon('mythic_blade_rifle', false);
    rig.getGroup().position.set(10, 5, -3);
    rig.getGroup().rotation.y = 0;

    const out = new THREE.Vector3();
    const muzzleForward = rig.getMuzzleWorldPosition(out);
    expect(muzzleForward).toBe(out);
    expect(muzzleForward.z).toBeGreaterThan(-3 + 0.3);
    expect(muzzleForward.y).toBeGreaterThan(5.5);

    // Rotate yaw = +PI/2: local +Z turns toward +X
    rig.getGroup().rotation.y = Math.PI / 2;
    const muzzleEast = rig.getMuzzleWorldPosition(new THREE.Vector3());
    expect(muzzleEast.x).toBeGreaterThan(10 + 0.3);

    // Throwable weapon also computes finite muzzle position
    rig.equipWeapon('shockwave_grenade', false);
    const throwPos = rig.getMuzzleWorldPosition(new THREE.Vector3());
    expect(Number.isFinite(throwPos.x)).toBe(true);
    expect(throwPos.x).toBeGreaterThan(10);

    // Build mode switches to blueprint and returns weaponSocket world pos
    rig.equipWeapon('ar', true);
    expect(rig.isBuildMode()).toBe(true);
    const buildPos = rig.getMuzzleWorldPosition(new THREE.Vector3());
    expect(Number.isFinite(buildPos.x)).toBe(true);
    expect(buildPos.distanceTo(muzzleEast)).toBeGreaterThan(0.2);

    rig.dispose();
  });
});

describe('CharacterAnimator', () => {
  it('animates all 19 AnimStates and all 6 EmoteIds without NaN transforms or invalid bounding boxes', () => {
    const animator = new CharacterAnimator();
    const rig = new CharacterRig();

    const states: AnimState[] = [
      'idle',
      'walk',
      'run',
      'sprint',
      'crouch_idle',
      'crouch_walk',
      'jump',
      'fall',
      'slide',
      'mantle',
      'swim',
      'zipline',
      'skydive',
      'glide',
      'harvest',
      'reload',
      'heal',
      'build',
      'emote',
    ];
    expect(states).toHaveLength(19);
    expect(EMOTES).toHaveLength(6);

    for (const animState of states) {
      const emoteIds: Array<EmoteId | null> =
        animState === 'emote' ? EMOTES.map((e) => e.id) : [null];
      for (const emoteId of emoteIds) {
        const renderState = makeRenderState({
          animState,
          emoteId,
          weaponId:
            animState === 'harvest'
              ? 'pickaxe'
              : animState === 'heal'
                ? 'shield_potion'
                : 'mythic_blade_rifle',
          isBuilding: animState === 'build',
          moveSpeed:
            animState.includes('walk') ||
            animState === 'run' ||
            animState === 'sprint' ||
            animState === 'slide' ||
            animState === 'swim'
              ? 6.5
              : 0,
          grounded:
            animState !== 'jump' &&
            animState !== 'fall' &&
            animState !== 'skydive' &&
            animState !== 'glide' &&
            animState !== 'zipline',
          harvestSwingTimer: animState === 'harvest' ? 0.25 : 0,
          leanAngle: animState === 'sprint' || animState === 'slide' ? 0.25 : 0,
          velocityY: animState === 'jump' ? 6.5 : animState === 'fall' ? -9.0 : 0,
        });

        for (let step = 0; step < 6; step++) {
          animator.update(rig, renderState, 0.03);
        }

        for (const joint of Object.values(rig.joints)) {
          expect(Number.isFinite(joint.position.x)).toBe(true);
          expect(Number.isFinite(joint.position.y)).toBe(true);
          expect(Number.isFinite(joint.position.z)).toBe(true);
          expect(Number.isFinite(joint.rotation.x)).toBe(true);
          expect(Number.isFinite(joint.rotation.y)).toBe(true);
          expect(Number.isFinite(joint.rotation.z)).toBe(true);
        }

        assertFiniteBox(rig.getGroup());
      }
    }

    rig.dispose();
  });

  it('animates slide, mantle, swim, zipline, banking leanAngle, and new dances electro_shuffle & star_salute', () => {
    const animator = new CharacterAnimator();
    const rig = new CharacterRig(SKINS[4], PICKAXES[4], GLIDERS[4]);

    // Slide: low crouched knee-drag leaning back + trailing arm
    animator.update(rig, makeRenderState({ animState: 'slide', moveSpeed: 10 }), 0);
    expect(rig.joints.hips.position.y).toBeLessThan(0.5);
    expect(rig.joints.hips.rotation.x).toBeLessThan(-0.2);
    expect(rig.joints.leftShoulder.rotation.x).toBeGreaterThan(0.2);
    expect(rig.joints.rightKnee.rotation.x).toBeGreaterThan(1.0);

    // Mantle: arms reaching/vaulting overhead
    animator.update(rig, makeRenderState({ animState: 'mantle', grounded: false }), 0);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-1.8);
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.8);

    // Swim: prone crawl stroke + kick changing across ticks
    animator.update(rig, makeRenderState({ animState: 'swim', moveSpeed: 4.5, grounded: false }), 0);
    const swimLeftStart = rig.joints.leftShoulder.rotation.x;
    expect(rig.joints.hips.rotation.x).toBeGreaterThan(1.0);
    expect(rig.joints.head.rotation.x).toBeLessThan(-0.5);
    for (let i = 0; i < 8; i++) {
      animator.update(rig, makeRenderState({ animState: 'swim', moveSpeed: 4.5, grounded: false }), 0.04);
    }
    expect(Math.abs(rig.joints.leftShoulder.rotation.x - swimLeftStart)).toBeGreaterThan(0.3);

    // Zipline: one-hand overhead grip + dangling knees
    animator.update(rig, makeRenderState({ animState: 'zipline', grounded: false }), 0);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-2.3);
    expect(rig.joints.leftKnee.rotation.x).toBeGreaterThan(0.2);
    expect(rig.joints.rightKnee.rotation.x).toBeGreaterThan(0.2);

    // Banking leanAngle rolls hips & spine cleanly in signed direction
    animator.update(rig, makeRenderState({ animState: 'run', moveSpeed: 6.5, leanAngle: 0.35 }), 0);
    const rightBankHipsZ = rig.joints.hips.rotation.z;
    animator.update(rig, makeRenderState({ animState: 'run', moveSpeed: 6.5, leanAngle: -0.35 }), 0);
    const leftBankHipsZ = rig.joints.hips.rotation.z;
    expect(rightBankHipsZ).toBeGreaterThan(0.1);
    expect(leftBankHipsZ).toBeLessThan(-0.1);

    // Electro Shuffle & Star Salute full-body emotes
    animator.update(rig, makeRenderState({ animState: 'emote', emoteId: 'electro_shuffle' }), 0);
    const shuffleA = rig.joints.hips.position.x + rig.joints.leftHip.rotation.x;
    for (let i = 0; i < 10; i++) {
      animator.update(rig, makeRenderState({ animState: 'emote', emoteId: 'electro_shuffle' }), 0.03);
    }
    const shuffleB = rig.joints.hips.position.x + rig.joints.leftHip.rotation.x;
    expect(Math.abs(shuffleB - shuffleA)).toBeGreaterThan(0.15);

    animator.update(rig, makeRenderState({ animState: 'emote', emoteId: 'star_salute' }), 0);
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.2);
    for (let i = 0; i < 12; i++) {
      animator.update(rig, makeRenderState({ animState: 'emote', emoteId: 'star_salute' }), 0.05);
    }
    assertFiniteBox(rig.getGroup());

    // Boolean traversal flags + new weapons (heavy_shotgun, shockwave_grenade) aiming
    animator.update(rig, makeRenderState({ animState: 'run', isSliding: true }), 0);
    expect(rig.joints.hips.position.y).toBeLessThan(0.5);

    animator.update(rig, makeRenderState({ animState: 'idle', isSwimming: true }), 0);
    expect(rig.joints.hips.rotation.x).toBeGreaterThan(1.0);

    animator.update(rig, makeRenderState({ animState: 'fall', isZiplining: true }), 0);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-2.3);

    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'heavy_shotgun', isAiming: true }),
      0,
    );
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.8);

    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'shockwave_grenade', isAiming: true }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.5);

    rig.dispose();
  });

  it('lowers hips on crouch, tilts body on skydive, opens glider on glide, and aims pitch/recoil', () => {
    const animator = new CharacterAnimator();
    const rig = new CharacterRig();

    // Idle baseline
    for (let i = 0; i < 20; i++) {
      animator.update(rig, makeRenderState({ animState: 'idle', pitch: 0 }), 0.05);
    }
    const idleHipsY = rig.joints.hips.position.y;
    const muzzleLevel = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;

    // Aim UP (pitch > 0) vs Aim DOWN (pitch < 0)
    for (let i = 0; i < 25; i++) {
      animator.update(rig, makeRenderState({ animState: 'idle', isAiming: true, pitch: 0.6 }), 0.05);
    }
    const muzzleAimUp = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;

    for (let i = 0; i < 25; i++) {
      animator.update(rig, makeRenderState({ animState: 'idle', isAiming: true, pitch: -0.6 }), 0.05);
    }
    const muzzleAimDown = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;

    expect(muzzleAimUp).toBeGreaterThan(muzzleLevel);
    expect(muzzleLevel).toBeGreaterThan(muzzleAimDown);

    // Recoil kick lifts muzzle above level aim
    for (let i = 0; i < 25; i++) {
      animator.update(
        rig,
        makeRenderState({ animState: 'idle', isAiming: true, pitch: 0, recoilKick: 0.9 }),
        0.05,
      );
    }
    const muzzleRecoil = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;
    expect(muzzleRecoil).toBeGreaterThan(muzzleLevel);

    // Crouch lowers hips
    for (let i = 0; i < 25; i++) {
      animator.update(rig, makeRenderState({ animState: 'crouch_idle' }), 0.05);
    }
    expect(rig.joints.hips.position.y).toBeLessThan(idleHipsY - 0.2);

    // Skydive pitches horizontal
    for (let i = 0; i < 25; i++) {
      animator.update(rig, makeRenderState({ animState: 'skydive' }), 0.05);
    }
    expect(rig.joints.hips.rotation.x).toBeGreaterThan(0.9);
    expect(rig.isGliderOpen()).toBe(false);

    // Glide opens glider and raises arms
    for (let i = 0; i < 25; i++) {
      animator.update(rig, makeRenderState({ animState: 'glide' }), 0.05);
    }
    expect(rig.isGliderOpen()).toBe(true);
    expect(rig.joints.gliderSocket.visible).toBe(true);
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.8);

    // Leaving glide closes glider
    for (let i = 0; i < 30; i++) {
      animator.update(rig, makeRenderState({ animState: 'idle' }), 0.05);
    }
    expect(rig.isGliderOpen()).toBe(false);
    expect(rig.joints.gliderSocket.visible).toBe(false);

    rig.dispose();
  });

  it('isolates state across multiple rigs animated by one CharacterAnimator', () => {
    const animator = new CharacterAnimator();
    const rigA = new CharacterRig();
    const rigB = new CharacterRig();

    for (let i = 0; i < 20; i++) {
      animator.update(rigA, makeRenderState({ position: { x: 5, y: 0, z: 0 }, animState: 'crouch_idle' }), 0.05);
      animator.update(rigB, makeRenderState({ position: { x: -5, y: 0, z: 0 }, animState: 'idle' }), 0.05);
    }

    expect(rigA.getGroup().position.x).toBe(5);
    expect(rigB.getGroup().position.x).toBe(-5);
    expect(rigA.joints.hips.position.y).toBeLessThan(0.65);
    expect(rigB.joints.hips.position.y).toBeGreaterThan(0.85);

    rigA.dispose();
    rigB.dispose();
  });

  it('animates harvest swing across timer phases and hover glider surfing stance', () => {
    const animator = new CharacterAnimator();
    const hoverGlider = GLIDERS.find((g) => g.style === 'hover') ?? GLIDERS[2];
    const rig = new CharacterRig(SKINS[0], PICKAXES[0], hoverGlider);

    animator.update(
      rig,
      makeRenderState({ animState: 'harvest', weaponId: 'pickaxe', harvestSwingTimer: 0.02 }),
      0,
    );
    const startShoulderRx = rig.joints.rightShoulder.rotation.x;

    animator.update(
      rig,
      makeRenderState({ animState: 'harvest', weaponId: 'pickaxe', harvestSwingTimer: 0.22 }),
      0,
    );
    const midShoulderRx = rig.joints.rightShoulder.rotation.x;
    expect(Math.abs(midShoulderRx - startShoulderRx)).toBeGreaterThan(0.5);

    for (let i = 0; i < 20; i++) {
      animator.update(rig, makeRenderState({ animState: 'glide' }), 0.05);
    }
    expect(rig.isGliderOpen()).toBe(true);
    expect(rig.joints.hips.rotation.y).toBeGreaterThan(0.2);

    rig.dispose();
  });
});

describe('VFXManager', () => {
  it('spawns, animates, pools, clears, and disposes all 11 VFX EventBus channels + brass casings', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    expect(scene.getObjectByName('vfx_root')).toBeDefined();

    bus.emit('vfx:tracer', {
      from: { x: 0, y: 1.4, z: 0 },
      to: { x: 0, y: 1.4, z: 30 },
    });
    // Muzzle for AR spawns both muzzle flash (1) and spinning brass casing (1)
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.6 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'ar',
    });
    expect(vfx.getActiveCasingCount()).toBe(1);

    const impactMats = ['wood', 'brick', 'metal', 'dirt', 'shield', 'flesh', 'shield_break'] as const;
    for (const material of impactMats) {
      bus.emit('vfx:impact', {
        position: { x: 2, y: 1, z: 5 },
        normal: { x: 0, y: 1, z: 0 },
        material,
      });
    }
    expect(vfx.getActiveShieldBreakCount()).toBe(1);

    bus.emit('vfx:explosion', { position: { x: -4, y: 0.5, z: 8 }, radius: 6.2 });
    bus.emit('vfx:elimination', { position: { x: 3, y: 0, z: -4 }, skinColor: '#2563eb' });
    bus.emit('vfx:build_pop', {
      position: { x: 4, y: 1.6, z: 4 },
      material: 'wood',
      pieceType: 'wall',
    });
    bus.emit('vfx:chest_open', { position: { x: -2, y: 0, z: -2 } });
    bus.emit('vfx:shockwave', { position: { x: 1, y: 0.2, z: -3 }, radius: 9.5 });
    bus.emit('vfx:splash_heal', { position: { x: -3, y: 0.1, z: 2 }, radius: 5.5 });
    bus.emit('vfx:slide_dust', { position: { x: 0, y: 0, z: 0 }, biome: 'desert' });
    bus.emit('vfx:weakpoint', {
      propId: 'tree_1',
      position: { x: 1, y: 1.2, z: 1 },
      normal: { x: 0, y: 0, z: 1 },
      active: true,
    });

    expect(vfx.getActiveShockwaveCount()).toBe(1);
    expect(vfx.getActiveSplashHealCount()).toBe(1);
    expect(vfx.getActiveSlideDustCount()).toBe(1);
    // 1 tracer + 1 muzzle + 1 casing + 6 bursts + 1 shield_break + 1 explosion + 1 elimination + 1 build_pop + 1 chest_open + 1 shockwave + 1 splash_heal + 1 slide_dust = 17
    expect(vfx.getActiveEffectCount()).toBe(17);
    expect(vfx.getActiveWeakpointCount()).toBe(1);

    // Step forward until all timed effects expire back to pool
    for (let i = 0; i < 45; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveEffectCount()).toBe(0);
    expect(vfx.getActiveCasingCount()).toBe(0);
    expect(vfx.getActiveShockwaveCount()).toBe(0);
    expect(vfx.getActiveSplashHealCount()).toBe(0);
    expect(vfx.getActiveSlideDustCount()).toBe(0);
    expect(vfx.getActiveShieldBreakCount()).toBe(0);
    expect(vfx.getActiveWeakpointCount()).toBe(1);

    // Deactivate weakpoint
    bus.emit('vfx:weakpoint', {
      propId: 'tree_1',
      position: { x: 1, y: 1.2, z: 1 },
      normal: { x: 0, y: 0, z: 1 },
      active: false,
    });
    expect(vfx.getActiveWeakpointCount()).toBe(0);

    // Spawn again & test clear()
    bus.emit('vfx:shockwave', { position: { x: 0, y: 0, z: 0 }, radius: 8 });
    bus.emit('vfx:splash_heal', { position: { x: 0, y: 0, z: 0 }, radius: 5 });
    bus.emit('vfx:slide_dust', { position: { x: 0, y: 0, z: 0 }, biome: 'snow' });
    bus.emit('vfx:weakpoint', {
      propId: 'rock_1',
      position: { x: 0, y: 1, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      active: true,
    });
    expect(vfx.getActiveEffectCount()).toBe(3);
    expect(vfx.getActiveWeakpointCount()).toBe(1);

    vfx.clear();
    expect(vfx.getActiveEffectCount()).toBe(0);
    expect(vfx.getActiveWeakpointCount()).toBe(0);

    // Dispose removes from scene and unsubscribes EventBus
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:tracer', { from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 10 } });
    bus.emit('vfx:shockwave', { position: { x: 0, y: 0, z: 0 }, radius: 6 });
    expect(vfx.getActiveEffectCount()).toBe(0);
  });

  it('ejects casings only for bullet/shell weapons and supports all 10 slide dust biomes', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // Rocket launcher & pickaxe do NOT eject casings
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.5, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'rocket_launcher',
    });
    expect(vfx.getActiveCasingCount()).toBe(0);

    // Bullet and shell weapons DO eject spinning casings
    const casingWeapons: WeaponId[] = [
      'ar',
      'burst_ar',
      'mythic_blade_rifle',
      'smg',
      'pistol',
      'sniper',
      'pump_shotgun',
      'tac_shotgun',
      'heavy_shotgun',
    ];
    for (const weaponId of casingWeapons) {
      bus.emit('vfx:muzzle', {
        position: { x: 0, y: 1.5, z: 0 },
        direction: { x: 0, y: 0, z: 1 },
        weaponId,
      });
    }
    expect(vfx.getActiveCasingCount()).toBe(casingWeapons.length);

    // Biome slide dust across all 10 biomes
    const biomes: BiomeType[] = [
      'ocean',
      'beach',
      'grassland',
      'forest',
      'highland',
      'urban',
      'snow',
      'desert',
      'volcanic',
      'cyber',
    ];
    for (const biome of biomes) {
      const [c1, c2] = getBiomeDustColors(biome);
      expect(c1).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c2).toMatch(/^#[0-9a-f]{6}$/i);
      bus.emit('vfx:slide_dust', { position: { x: 0, y: 0, z: 0 }, biome });
    }
    expect(vfx.getActiveSlideDustCount()).toBe(biomes.length);

    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.rotation.x)).toBe(true);
    });

    vfx.dispose();
  });

  it('handles zero-length directions, normals, and zero/negative radii safely without NaN transforms', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    bus.emit('vfx:tracer', { from: { x: 1, y: 1, z: 1 }, to: { x: 1, y: 1, z: 1 } });
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1, z: 0 },
      direction: { x: 0, y: 0, z: 0 },
      weaponId: 'heavy_shotgun',
    });
    bus.emit('vfx:impact', {
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 0 },
      material: 'shield_break',
    });
    bus.emit('vfx:shockwave', { position: { x: 0, y: 0, z: 0 }, radius: 0 });
    bus.emit('vfx:splash_heal', { position: { x: 0, y: 0, z: 0 }, radius: -2 });
    bus.emit('vfx:weakpoint', {
      propId: 'zero_norm',
      position: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: 0 },
      active: true,
    });

    vfx.update(0.02);

    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    vfx.dispose();
  });
});
