import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type {
  AnimState,
  BiomeType,
  CharacterRenderState,
  EmoteId,
  Rarity,
  WeaponId,
} from '../../types';
import {
  CONTRAILS,
  EMOTES,
  EventBus,
  GLIDERS,
  PICKAXES,
  RARITY_COLORS,
  SKINS,
  WEAPONS,
  WEAPON_WRAPS,
} from '../../core';
import {
  CharacterAnimator,
  CharacterRig,
  VFXManager,
  applyWeaponWrap,
  createBlueprintModel,
  createWeaponModel,
  createWeaponWrapTexture,
  disposeObject3D,
  getBiomeDustColors,
  getWeaponWrapMaterial,
  getWeaponWrapTexture,
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
  it('builds distinct stylized 3D models for all 23 WeaponIds with muzzleOffsets on ranged & throwables', () => {
    const allIds = Object.keys(WEAPONS) as WeaponId[];
    expect(allIds).toHaveLength(23);

    const seenNames = new Set<string>();

    for (const id of allIds) {
      const grp = createWeaponModel(id);
      expect(grp).toBeInstanceOf(THREE.Group);
      expect(countMeshes(grp)).toBeGreaterThan(0);
      expect(grp.name).not.toContain('stub');
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

    // Verify high-detail models have rich multi-part mesh counts
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

    const grappler = createWeaponModel('grappler');
    expect(grappler.name).toBe('weapon_grappler');
    expect(countMeshes(grappler)).toBeGreaterThanOrEqual(16);
    expect(hasMuzzleOffset('grappler')).toBe(true);
    expect((grappler.userData.muzzleOffset as THREE.Vector3).z).toBeGreaterThan(0.35);
    disposeObject3D(grappler);

    const shieldBubble = createWeaponModel('shield_bubble');
    expect(shieldBubble.name).toBe('weapon_shield_bubble');
    expect(countMeshes(shieldBubble)).toBeGreaterThanOrEqual(14);
    expect(hasMuzzleOffset('shield_bubble')).toBe(true);
    expect((shieldBubble.userData.muzzleOffset as THREE.Vector3).z).toBeGreaterThan(0.15);
    disposeObject3D(shieldBubble);
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

    let allBodyCastShadows = true;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name !== 'ground_contact_shadow' && !child.castShadow) {
        allBodyCastShadows = false;
      }
    });
    expect(allBodyCastShadows).toBe(true);

    const shadowDisc = root.getObjectByName('ground_contact_shadow') as THREE.Mesh;
    expect(shadowDisc).toBeInstanceOf(THREE.Mesh);
    expect(shadowDisc.castShadow).toBe(false);

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

  it('adds, animates, toggles, and disposes golden Boss Crown aura cleanly', () => {
    const rig = new CharacterRig(SKINS[4], PICKAXES[4], GLIDERS[4]);
    expect(rig.isBossAuraEnabled()).toBe(false);
    expect(rig.getGroup().getObjectByName('boss_crown_aura')).toBeUndefined();

    // Enabling adds glowing crown ring + vertical beacon above boss
    rig.setBossAura(true, 0.25);
    expect(rig.isBossAuraEnabled()).toBe(true);
    const aura = rig.getGroup().getObjectByName('boss_crown_aura') as THREE.Group;
    expect(aura).toBeDefined();
    expect(aura.visible).toBe(true);
    expect(countMeshes(aura)).toBeGreaterThanOrEqual(9);

    const crownRing = aura.getObjectByName('boss_crown_ring') as THREE.Group;
    expect(crownRing).toBeDefined();
    const rotA = crownRing.rotation.y;
    const yA = aura.position.y;

    const bossBox = assertFiniteBox(rig.getGroup());
    expect(bossBox.max.y - bossBox.min.y).toBeGreaterThan(2.5);

    // Updating elapsed animates crown spin & floating bob
    rig.setBossAura(true, 1.35);
    expect(crownRing.rotation.y).not.toBeCloseTo(rotA, 3);
    expect(aura.position.y).not.toBeCloseTo(yA, 3);

    // Disabling hides aura and restores standard ~1.85m bounds
    rig.setBossAura(false);
    expect(rig.isBossAuraEnabled()).toBe(false);
    expect(aura.visible).toBe(false);
    const normalBox = assertFiniteBox(rig.getGroup());
    expect(normalBox.max.y - normalBox.min.y).toBeLessThan(1.98);

    // Re-enabling then disposing tears down without throwing
    rig.setBossAura(true, 2.0);
    rig.dispose();
    expect(rig.getGroup().getObjectByName('boss_crown_aura')).toBeUndefined();
  });
});

describe('CharacterAnimator', () => {
  it('animates all 20 AnimStates (including drive) and all 6 EmoteIds without NaN transforms or invalid bounding boxes', () => {
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
      'drive',
      'skydive',
      'glide',
      'harvest',
      'reload',
      'heal',
      'build',
      'emote',
    ];
    expect(states).toHaveLength(20);
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
            animState === 'swim' ||
            animState === 'drive'
              ? 6.5
              : 0,
          grounded:
            animState !== 'jump' &&
            animState !== 'fall' &&
            animState !== 'skydive' &&
            animState !== 'glide' &&
            animState !== 'zipline',
          harvestSwingTimer: animState === 'harvest' ? 0.25 : 0,
          leanAngle:
            animState === 'sprint' || animState === 'slide' || animState === 'drive' ? 0.25 : 0,
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

    // Wave-2 weapons: shield_bubble throw wind-up & grappler pistol aim
    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'shield_bubble', isAiming: true }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.5);

    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'grappler', isAiming: true }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.9);

    rig.dispose();
  });

  it('animates vehicle drive seated pose with handlebar grip, banking lean, and syncs isBoss aura', () => {
    const animator = new CharacterAnimator();
    const rig = new CharacterRig();

    // Seated drive pose: lowered hips, bent hips & knees, hands reaching forward to handlebars, forward lean
    animator.update(
      rig,
      makeRenderState({ animState: 'drive', moveSpeed: 18, leanAngle: 0 }),
      0,
    );
    expect(rig.joints.hips.position.y).toBeLessThan(0.72);
    expect(rig.joints.leftHip.rotation.x).toBeLessThan(-1.0);
    expect(rig.joints.rightHip.rotation.x).toBeLessThan(-1.0);
    expect(rig.joints.leftKnee.rotation.x).toBeGreaterThan(1.2);
    expect(rig.joints.rightKnee.rotation.x).toBeGreaterThan(1.2);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.9);
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.9);
    expect(rig.joints.spine.rotation.x).toBeGreaterThan(0.2);

    // Banking left/right while driving rolls hips and tilts handlebars cleanly
    animator.update(
      rig,
      makeRenderState({ animState: 'drive', moveSpeed: 20, leanAngle: 0.4 }),
      0,
    );
    const driveRightBank = rig.joints.hips.rotation.z;
    const driveRightHeadZ = rig.joints.head.rotation.z;
    animator.update(
      rig,
      makeRenderState({ animState: 'drive', moveSpeed: 20, leanAngle: -0.4 }),
      0,
    );
    const driveLeftBank = rig.joints.hips.rotation.z;
    expect(driveRightBank).toBeGreaterThan(0.15);
    expect(driveLeftBank).toBeLessThan(-0.15);
    expect(driveRightHeadZ).toBeLessThan(-0.08);

    // CharacterRenderState.isBoss automatically activates and animates Boss Crown Aura
    animator.update(
      rig,
      makeRenderState({ animState: 'idle', isBoss: true }),
      0.05,
    );
    expect(rig.isBossAuraEnabled()).toBe(true);
    const crownRing = rig.getGroup().getObjectByName('boss_crown_ring') as THREE.Group;
    expect(crownRing).toBeDefined();
    const rotStart = crownRing.rotation.y;

    for (let i = 0; i < 6; i++) {
      animator.update(rig, makeRenderState({ animState: 'run', isBoss: true }), 0.05);
    }
    expect(crownRing.rotation.y).toBeGreaterThan(rotStart);

    // Clearing isBoss disables aura cleanly
    animator.update(rig, makeRenderState({ animState: 'idle', isBoss: false }), 0.05);
    expect(rig.isBossAuraEnabled()).toBe(false);

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

  it('handles Wave-2 VFX channels (grapple_line, shield_bubble, vehicle_boost) and updateThrowArc cleanly', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. Grapple line
    bus.emit('vfx:grapple_line', {
      from: { x: 0, y: 1.4, z: 0 },
      to: { x: 12, y: 8.5, z: 16 },
      duration: 0.4,
    });
    expect(vfx.getActiveGrappleLineCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(1);

    // 2. Shield bubble dome
    bus.emit('vfx:shield_bubble', {
      id: 'sb_1',
      position: { x: 4, y: 0.2, z: -6 },
      radius: 5.2,
      duration: 0.8,
    });
    // Re-emitting same id updates existing bubble rather than duplicating
    bus.emit('vfx:shield_bubble', {
      id: 'sb_1',
      position: { x: 4, y: 0.2, z: -6 },
      radius: 5.2,
      duration: 0.8,
    });
    expect(vfx.getActiveShieldBubbleCount()).toBe(1);

    // 3. Vehicle twin boost exhaust sparks
    bus.emit('vfx:vehicle_boost', {
      position: { x: -3, y: 0.7, z: 2 },
      direction: { x: 0, y: 0, z: -1 },
    });
    expect(vfx.getActiveVehicleBoostCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(3);

    // Step forward past grapple_line (0.4s) & vehicle_boost (0.28s) while shield_bubble (0.8s) stays pulsing
    for (let i = 0; i < 10; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveGrappleLineCount()).toBe(0);
    expect(vfx.getActiveVehicleBoostCount()).toBe(0);
    expect(vfx.getActiveShieldBubbleCount()).toBe(1);

    // Step forward past shield_bubble expiration
    for (let i = 0; i < 10; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveShieldBubbleCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // 4. Throwable trajectory arc preview + landing ring
    expect(vfx.isThrowArcVisible()).toBe(false);
    expect(vfx.getThrowArcPointCount()).toBe(0);

    const arcPoints = [
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 2.8, z: 3 },
      { x: 0, y: 3.1, z: 6 },
      { x: 0, y: 2.3, z: 9 },
      { x: 0, y: 0.1, z: 12 },
    ];
    vfx.updateThrowArc(arcPoints);
    expect(vfx.isThrowArcVisible()).toBe(true);
    expect(vfx.getThrowArcPointCount()).toBe(arcPoints.length);

    const arcGroup = scene.getObjectByName('vfx_throw_arc');
    expect(arcGroup).toBeDefined();
    expect(arcGroup?.visible).toBe(true);
    vfx.update(0.05);

    // Degenerate / null inputs hide throw arc cleanly
    vfx.updateThrowArc([{ x: 0, y: 0, z: 0 }]);
    expect(vfx.isThrowArcVisible()).toBe(false);
    expect(vfx.getThrowArcPointCount()).toBe(0);

    vfx.updateThrowArc(arcPoints);
    expect(vfx.isThrowArcVisible()).toBe(true);
    vfx.updateThrowArc(null);
    expect(vfx.isThrowArcVisible()).toBe(false);
    expect(vfx.getThrowArcPointCount()).toBe(0);

    // Edge cases: zero-length grapple / zero direction boost / NaN arc points do not produce NaN transforms
    bus.emit('vfx:grapple_line', {
      from: { x: 1, y: 1, z: 1 },
      to: { x: 1, y: 1, z: 1 },
      duration: 0,
    });
    bus.emit('vfx:vehicle_boost', {
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: 0 },
    });
    vfx.updateThrowArc([
      { x: Number.NaN, y: 1, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 2, y: 0, z: 4 },
    ]);
    expect(vfx.isThrowArcVisible()).toBe(true);
    expect(vfx.getThrowArcPointCount()).toBe(2);

    vfx.update(0.03);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
    });

    // Clear resets active arc and pools
    vfx.clear();
    expect(vfx.isThrowArcVisible()).toBe(false);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Dispose unsubscribes Wave-2 channels cleanly
    vfx.dispose();
    bus.emit('vfx:grapple_line', {
      from: { x: 0, y: 1, z: 0 },
      to: { x: 5, y: 3, z: 5 },
      duration: 0.4,
    });
    bus.emit('vfx:shield_bubble', {
      id: 'sb_after',
      position: { x: 0, y: 0, z: 0 },
      radius: 5,
      duration: 5,
    });
    bus.emit('vfx:vehicle_boost', {
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
    });
    vfx.updateThrowArc(arcPoints);
    expect(vfx.getActiveEffectCount()).toBe(0);
    expect(vfx.isThrowArcVisible()).toBe(false);
  });

  it('spawns, updates, clears, and disposes Wave-3 VFX (weapon_upgrade, slurp_burst, campfire_heal) and caps impact decals at <= 40', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. Weapon Upgrade holographic ring + rising spark bursts across rarities
    const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    for (const rarity of rarities) {
      bus.emit('vfx:weapon_upgrade', {
        position: { x: 2, y: 0.5, z: 3 },
        rarity,
      });
    }
    expect(vfx.getActiveWeaponUpgradeCount()).toBe(6);

    // 2. Slurp Barrel Burst (cyan dome + upward droplets)
    bus.emit('vfx:slurp_burst', {
      position: { x: -4, y: 0.2, z: 5 },
      radius: 4.5,
    });
    expect(vfx.getActiveSlurpBurstCount()).toBe(1);

    // 3. Campfire Heal rising warm green/amber ember motes
    bus.emit('vfx:campfire_heal', {
      position: { x: 6, y: 0, z: -2 },
    });
    expect(vfx.getActiveCampfireHealCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(8);

    // Verify rarity color tint applied cleanly to upgrade VFX
    expect(RARITY_COLORS.mythic).toBeDefined();

    // Advance past transient Wave-3 effect lifetimes (~1.3s)
    for (let i = 0; i < 28; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveWeaponUpgradeCount()).toBe(0);
    expect(vfx.getActiveSlurpBurstCount()).toBe(0);
    expect(vfx.getActiveCampfireHealCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // 4. Pooled Surface Bullet Impact Decals (wood, brick, metal, dirt)
    // Shield, flesh, and shield_break should NOT spawn surface decals
    bus.emit('vfx:impact', {
      position: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      material: 'shield',
    });
    bus.emit('vfx:impact', {
      position: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      material: 'flesh',
    });
    bus.emit('vfx:impact', {
      position: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      material: 'shield_break',
    });
    expect(vfx.getActiveImpactDecalCount()).toBe(0);

    // Spawn decals on surface materials with wall & floor normals
    const surfaceMats = ['wood', 'brick', 'metal', 'dirt'] as const;
    bus.emit('vfx:impact', {
      position: { x: 1, y: 2, z: 3 },
      normal: { x: 1, y: 0, z: 0 },
      material: 'wood',
    });
    expect(vfx.getActiveImpactDecalCount()).toBe(1);

    const decal0 = scene.getObjectByName('vfx_impact_decal_0') as THREE.Mesh;
    expect(decal0).toBeInstanceOf(THREE.Mesh);
    expect(decal0.visible).toBe(true);
    const decalMat0 = decal0.material as THREE.MeshBasicMaterial;
    expect(decalMat0.polygonOffset).toBe(true);
    expect(decalMat0.depthWrite).toBe(false);
    const initialOpacity = decalMat0.opacity;

    // Oriented cleanly to wall normal (+X -> world normal of CircleGeometry(+Z) points along +X)
    const localNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(decal0.quaternion);
    expect(localNormal.x).toBeCloseTo(1, 3);
    expect(Math.abs(localNormal.y)).toBeLessThan(1e-3);
    expect(Math.abs(localNormal.z)).toBeLessThan(1e-3);

    // Halfway through 12s fade (6.0s), decal is still active and smoothly faded
    for (let i = 0; i < 60; i++) {
      vfx.update(0.1);
    }
    expect(vfx.getActiveImpactDecalCount()).toBe(1);
    expect(decalMat0.opacity).toBeLessThan(initialOpacity);
    expect(decalMat0.opacity).toBeGreaterThan(0.1);

    // Past 12s, decal fades out and returns to pool
    for (let i = 0; i < 65; i++) {
      vfx.update(0.1);
    }
    expect(vfx.getActiveImpactDecalCount()).toBe(0);
    expect(decal0.visible).toBe(false);

    // Flood 65 surface impacts -> pool strictly capped at <= 40
    for (let i = 0; i < 65; i++) {
      bus.emit('vfx:impact', {
        position: { x: i * 0.2, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        material: surfaceMats[i % surfaceMats.length],
      });
    }
    expect(vfx.getActiveImpactDecalCount()).toBeLessThanOrEqual(40);
    expect(vfx.getActiveImpactDecalCount()).toBe(40);

    // clear() resets decals and Wave-3 transient effects
    bus.emit('vfx:weapon_upgrade', { position: { x: 0, y: 1, z: 0 }, rarity: 'legendary' });
    bus.emit('vfx:slurp_burst', { position: { x: 1, y: 0, z: 1 }, radius: 4 });
    bus.emit('vfx:campfire_heal', { position: { x: 2, y: 0, z: 2 } });
    vfx.clear();
    expect(vfx.getActiveImpactDecalCount()).toBe(0);
    expect(vfx.getActiveWeaponUpgradeCount()).toBe(0);
    expect(vfx.getActiveSlurpBurstCount()).toBe(0);
    expect(vfx.getActiveCampfireHealCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() unsubscribes Wave-3 EventBus channels cleanly
    vfx.dispose();
    bus.emit('vfx:weapon_upgrade', { position: { x: 0, y: 1, z: 0 }, rarity: 'epic' });
    bus.emit('vfx:slurp_burst', { position: { x: 0, y: 0, z: 0 }, radius: 4 });
    bus.emit('vfx:campfire_heal', { position: { x: 0, y: 0, z: 0 } });
    bus.emit('vfx:impact', {
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      material: 'metal',
    });
    expect(vfx.getActiveEffectCount()).toBe(0);
    expect(vfx.getActiveImpactDecalCount()).toBe(0);
  });
});

describe('Wave-3 Weapon Wraps, Ground Contact Shadow & Armor Rim Polish', () => {
  it('supports all 6 WEAPON_WRAPS patterns with cached materials/textures, selective gun wrapping, and Node-safe 2D canvas drawing', () => {
    expect(WEAPON_WRAPS).toHaveLength(6);

    const gunIds: WeaponId[] = [
      'ar',
      'burst_ar',
      'tactical_dmr',
      'pump_shotgun',
      'tac_shotgun',
      'heavy_shotgun',
      'smg',
      'sniper',
      'pistol',
      'rocket_launcher',
      'mythic_blade_rifle',
      'grappler',
    ];

    for (const wrap of WEAPON_WRAPS) {
      const texA = getWeaponWrapTexture(wrap.id);
      const texB = createWeaponWrapTexture(wrap.id);
      const matA = getWeaponWrapMaterial(wrap.id);
      const matB = getWeaponWrapMaterial(wrap.id);

      expect(texA).toBeInstanceOf(THREE.CanvasTexture);
      expect(texB).toBe(texA);
      expect(matA).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(matB).toBe(matA);
      expect(matA.map).toBe(texA);
      expect(matA.metalness).toBeCloseTo(wrap.metalness, 5);
      expect(matA.roughness).toBeCloseTo(wrap.roughness, 5);

      for (const gunId of gunIds) {
        const gun = createWeaponModel(gunId);
        let targetCount = 0;
        let nonTargetCount = 0;

        applyWeaponWrap(gun, wrap.id);
        gun.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          if (child.userData.wrapTarget === true) {
            targetCount++;
            expect(child.material).toBe(matA);
          } else {
            nonTargetCount++;
            expect(child.material).not.toBe(matA);
          }
        });

        expect(targetCount).toBeGreaterThanOrEqual(1);
        expect(nonTargetCount).toBeGreaterThanOrEqual(1);
        disposeObject3D(gun);
      }
    }

    // Unknown or undefined wrapId defaults cleanly to factory_matte
    const ar = createWeaponModel('ar');
    applyWeaponWrap(ar, undefined);
    const factoryMat = getWeaponWrapMaterial('factory_matte');
    let wrappedMatchesFactory = false;
    ar.traverse((c) => {
      if (c instanceof THREE.Mesh && c.userData.wrapTarget === true && c.material === factoryMat) {
        wrappedMatchesFactory = true;
      }
    });
    expect(wrappedMatchesFactory).toBe(true);

    applyWeaponWrap(ar, 'non_existent_wrap_id');
    expect(ar.userData.appliedWrapId).toBe('factory_matte');
    disposeObject3D(ar);

    // Mocked browser canvas environment: verifies zero fillText/ellipse calls and null-context resilience
    const forbiddenCalls: string[] = [];
    const allowedDraws = {
      fillRect: vi.fn(),
      arc: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillText: () => forbiddenCalls.push('fillText'),
      ellipse: () => forbiddenCalls.push('ellipse'),
    };

    const originalDocument = (globalThis as { document?: unknown }).document;
    try {
      (globalThis as { document?: unknown }).document = {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => allowedDraws,
        }),
      };

      for (const wrap of WEAPON_WRAPS) {
        const freshTex = createWeaponWrapTexture({ ...wrap, id: `mock_${wrap.id}` });
        expect(freshTex).toBeInstanceOf(THREE.CanvasTexture);
      }
      expect(forbiddenCalls).toEqual([]);
      expect(allowedDraws.fillRect).toHaveBeenCalled();
      expect(allowedDraws.arc).toHaveBeenCalled();

      // Null 2D context gracefully handled without throwing
      (globalThis as { document?: unknown }).document = {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => null,
        }),
      };
      const nullCtxTex = createWeaponWrapTexture({
        ...WEAPON_WRAPS[0],
        id: 'mock_null_ctx_wrap',
      });
      expect(nullCtxTex).toBeInstanceOf(THREE.CanvasTexture);
    } finally {
      if (originalDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = originalDocument;
      }
    }
  });

  it('tracks CharacterRig.setWeaponWrap across weapon swaps & updateFromState, fades Ground Contact Shadow Disc smoothly, and guards armor rim shaders', () => {
    const rig = new CharacterRig(SKINS[0], PICKAXES[0], GLIDERS[0]);
    const animator = new CharacterAnimator();

    // Weapon wrap changes & persists across weapon equips
    rig.equipWeapon('ar', false);
    for (const wrap of WEAPON_WRAPS) {
      rig.setWeaponWrap(wrap.id);
      expect(rig.getWeaponWrapId()).toBe(wrap.id);

      const expectedMat = getWeaponWrapMaterial(wrap.id);
      let appliedToReceiver = false;
      rig.joints.weaponSocket.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.wrapTarget === true) {
          expect(child.material).toBe(expectedMat);
          appliedToReceiver = true;
        }
      });
      expect(appliedToReceiver).toBe(true);
    }

    // Swapping to another gun automatically applies the active wrap
    rig.setWeaponWrap('magma_rift');
    rig.equipWeapon('sniper', false);
    const magmaMat = getWeaponWrapMaterial('magma_rift');
    let sniperWrapped = false;
    rig.joints.weaponSocket.traverse((child) => {
      if (child instanceof THREE.Mesh && child.visible && child.userData.wrapTarget === true) {
        // Note: check the active sniper group specifically
        let p: THREE.Object3D | null = child;
        while (p && p.parent !== rig.joints.weaponSocket) p = p.parent;
        if (p && p.visible) {
          expect(child.material).toBe(magmaMat);
          sniperWrapped = true;
        }
      }
    });
    expect(sniperWrapped).toBe(true);

    // updateFromState & CharacterAnimator.update respect state.weaponWrapId
    rig.updateFromState(makeRenderState({ weaponId: 'tac_shotgun', weaponWrapId: 'midas_gold' }));
    expect(rig.getWeaponWrapId()).toBe('midas_gold');
    animator.update(
      rig,
      makeRenderState({ weaponId: 'ar', weaponWrapId: 'neon_cyber', grounded: true }),
      0,
    );
    expect(rig.getWeaponWrapId()).toBe('neon_cyber');

    // Ground Contact Shadow Disc fades scale & opacity smoothly with airborne height
    const shadow = rig.getGroundShadowMesh()!;
    expect(shadow).toBeInstanceOf(THREE.Mesh);
    const shadowMat = shadow.material as THREE.MeshBasicMaterial;
    expect(shadowMat).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(shadowMat.depthWrite).toBe(false);
    expect(shadowMat.transparent).toBe(true);
    expect(shadowMat.map).toBeInstanceOf(THREE.CanvasTexture);

    rig.updateFromState(
      makeRenderState({ position: { x: 0, y: 10, z: 0 }, grounded: true }),
      10,
    );
    const groundedOpacity = shadowMat.opacity;
    const groundedScale = shadow.scale.x;
    expect(groundedOpacity).toBeGreaterThan(0.35);
    expect(groundedScale).toBeCloseTo(1, 3);
    expect(shadow.position.y).toBeCloseTo(0.025, 3);
    expect(shadow.visible).toBe(true);

    rig.updateFromState(
      makeRenderState({ position: { x: 0, y: 12.5, z: 0 }, grounded: false }),
      10,
    );
    const midAirOpacity = shadowMat.opacity;
    const midAirScale = shadow.scale.x;
    expect(midAirOpacity).toBeLessThan(groundedOpacity);
    expect(midAirOpacity).toBeGreaterThan(0.05);
    expect(midAirScale).toBeLessThan(groundedScale);
    expect(shadow.position.y).toBeCloseTo(-2.475, 2);

    rig.updateFromState(
      makeRenderState({ position: { x: 0, y: 20, z: 0 }, grounded: false }),
      10,
    );
    expect(shadowMat.opacity).toBeLessThan(0.02);
    expect(shadow.visible).toBe(false);

    // Landing restores contact shadow cleanly
    rig.updateFromState(
      makeRenderState({ position: { x: 0, y: 10, z: 0 }, grounded: true }),
      10,
    );
    expect(shadowMat.opacity).toBeCloseTo(groundedOpacity, 4);
    expect(shadow.scale.x).toBeCloseTo(1, 3);
    expect(shadow.visible).toBe(true);

    // Armor Rim / Fresnel onBeforeCompile shader safety across Three.js GLSL & mock envs
    let rimMatCount = 0;
    rig.getGroup().traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const mat = child.material;
        if (mat.userData.hasArmorRim) {
          rimMatCount++;
          const mockShader = {
            uniforms: {},
            vertexShader: THREE.ShaderLib.standard.vertexShader,
            fragmentShader: THREE.ShaderLib.standard.fragmentShader,
          };
          expect(() =>
            mat.onBeforeCompile(mockShader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer),
          ).not.toThrow();
          expect(mockShader.fragmentShader).toContain('uniform vec3 uRimColor;');
          expect(mockShader.fragmentShader).toContain('rimFresnel');
          expect(mockShader.fragmentShader).not.toContain('pow(');

          // Partial/null edge cases must never throw
          expect(() =>
            mat.onBeforeCompile(
              { uniforms: undefined, vertexShader: '', fragmentShader: '' } as unknown as THREE.WebGLProgramParametersWithUniforms,
              {} as THREE.WebGLRenderer,
            ),
          ).not.toThrow();
        }
      }
    });
    expect(rimMatCount).toBeGreaterThan(0);

    rig.dispose();
  });
});

describe('Wave-4 Skydiving Contrails & VFX Channels', () => {
  it('supports all 6 CONTRAILS on CharacterRig, animates in skydive/fast-fall, and hides cleanly when landed or gliding', () => {
    expect(CONTRAILS).toHaveLength(6);

    const rig = new CharacterRig(SKINS[0], PICKAXES[0], GLIDERS[0]);
    const animator = new CharacterAnimator();

    // Defaults to CONTRAILS[0].id ('wind_stream') and inactive initially
    expect(rig.getContrailId()).toBe(CONTRAILS[0].id);
    expect(rig.isContrailActive()).toBe(false);

    const limbNames = [
      'contrail_left_hand',
      'contrail_right_hand',
      'contrail_left_foot',
      'contrail_right_foot',
    ] as const;

    const getLimbStreams = () =>
      limbNames.map((name) => rig.getGroup().getObjectByName(name) as THREE.Group);

    const initialStreams = getLimbStreams();
    for (const grp of initialStreams) {
      expect(grp).toBeInstanceOf(THREE.Group);
      expect(grp.visible).toBe(false);
      expect(countMeshes(grp)).toBeGreaterThanOrEqual(8);
    }

    // Verify all 6 contrails via setContrail, state.contrailId, updateFromState, and CharacterAnimator.update
    for (const contrail of CONTRAILS) {
      rig.setContrail(contrail.id);
      expect(rig.getContrailId()).toBe(contrail.id);

      // Skydive via updateFromState activates streamers with matching primaryColor & secondaryColor
      rig.updateFromState(
        makeRenderState({
          position: { x: 0, y: 120, z: 0 },
          animState: 'skydive',
          grounded: false,
          velocityY: -22,
          contrailId: contrail.id,
        }),
        0,
      );
      expect(rig.getContrailId()).toBe(contrail.id);
      expect(rig.isContrailActive()).toBe(true);

      const expectedPrimary = new THREE.Color(contrail.primaryColor).getHex();
      const expectedSecondary = new THREE.Color(contrail.secondaryColor).getHex();
      let foundPrimary = false;
      let foundSecondary = false;
      for (const grp of getLimbStreams()) {
        expect(grp.visible).toBe(true);
        expect(grp.scale.x).toBeCloseTo(1, 3);
        grp.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
            const hex = child.material.color.getHex();
            if (hex === expectedPrimary) foundPrimary = true;
            if (hex === expectedSecondary) foundSecondary = true;
          }
        });
      }
      expect(foundPrimary).toBe(true);
      expect(foundSecondary).toBe(true);

      // CharacterAnimator.update advances contrail particles smoothly without NaN
      animator.update(
        rig,
        makeRenderState({
          position: { x: 0, y: 115, z: 0 },
          animState: 'skydive',
          grounded: false,
          velocityY: -24,
          contrailId: contrail.id,
        }),
        0.05,
      );
      const firstStream = getLimbStreams()[0];
      const snapshotPosY = firstStream.children.map((c) => c.position.y);

      for (let i = 0; i < 6; i++) {
        animator.update(
          rig,
          makeRenderState({
            position: { x: 0, y: 110 - i, z: 0 },
            animState: 'skydive',
            grounded: false,
            velocityY: -24,
            contrailId: contrail.id,
          }),
          0.05,
        );
      }
      const nextPosY = firstStream.children.map((c) => c.position.y);
      expect(nextPosY.some((y, idx) => Math.abs(y - snapshotPosY[idx]) > 0.01)).toBe(true);
      assertFiniteBox(rig.getGroup());

      // Grounded state via updateFromState hides contrails completely and maintains ~1.85m bounds
      rig.updateFromState(
        makeRenderState({
          position: { x: 0, y: 0, z: 0 },
          animState: 'idle',
          grounded: true,
          velocityY: 0,
          contrailId: contrail.id,
        }),
        0,
      );
      expect(rig.isContrailActive()).toBe(false);
      for (const grp of getLimbStreams()) {
        expect(grp.visible).toBe(false);
      }

      // Switching to glide hides contrails immediately even while glider opens
      animator.update(
        rig,
        makeRenderState({
          position: { x: 0, y: 40, z: 0 },
          animState: 'glide',
          grounded: false,
          velocityY: -5,
          contrailId: contrail.id,
        }),
        0.05,
      );
      expect(rig.isContrailActive()).toBe(false);
      for (const grp of getLimbStreams()) {
        expect(grp.visible).toBe(false);
      }

      // Returning to grounded idle via animator closes glider and keeps contrails hidden
      for (let i = 0; i < 30; i++) {
        animator.update(
          rig,
          makeRenderState({
            position: { x: 0, y: 0, z: 0 },
            animState: 'idle',
            weaponId: 'pickaxe',
            grounded: true,
            velocityY: 0,
            contrailId: contrail.id,
          }),
          0.05,
        );
      }
      expect(rig.isContrailActive()).toBe(false);
      expect(rig.isGliderOpen()).toBe(false);
      for (const grp of getLimbStreams()) {
        expect(grp.visible).toBe(false);
        expect(grp.scale.x).toBeCloseTo(0.001, 4);
      }
      const groundedBox = assertFiniteBox(rig.getGroup());
      expect(groundedBox.max.y - groundedBox.min.y).toBeLessThan(1.98);
    }

    // Fast ungrounded fall (velocityY < -8) triggers contrails even when animState === 'fall'
    animator.update(
      rig,
      makeRenderState({
        position: { x: 0, y: 60, z: 0 },
        animState: 'fall',
        grounded: false,
        velocityY: -12,
        contrailId: 'void_lightning',
      }),
      0.05,
    );
    expect(rig.getContrailId()).toBe('void_lightning');
    expect(rig.isContrailActive()).toBe(true);

    // Slow fall (velocityY >= -8) hides contrails
    animator.update(
      rig,
      makeRenderState({
        position: { x: 0, y: 55, z: 0 },
        animState: 'fall',
        grounded: false,
        velocityY: -4,
        contrailId: 'void_lightning',
      }),
      0.05,
    );
    expect(rig.isContrailActive()).toBe(false);

    // Unknown contrailId defaults cleanly to CONTRAILS[0].id
    rig.setContrail('non_existent_contrail');
    expect(rig.getContrailId()).toBe(CONTRAILS[0].id);

    // Direct updateContrail toggle works cleanly
    rig.updateContrail(true, 0.05, 1.25);
    expect(rig.isContrailActive()).toBe(true);
    rig.updateContrail(false, 0.05, 1.3);
    expect(rig.isContrailActive()).toBe(false);

    rig.dispose();
  });

  it('spawns, updates, expires, replaces, clears, and disposes all 4 Wave-4 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:rift_tear (ground + sky endpoints)
    bus.emit('vfx:rift_tear', {
      position: { x: 10, y: 2, z: -8 },
      skyPosition: { x: 10, y: 94, z: -8 },
    });
    expect(vfx.getActiveRiftTearCount()).toBe(1);

    // 2. vfx:flag_captured (tall golden beacon + fireworks sparks)
    bus.emit('vfx:flag_captured', {
      position: { x: -18, y: 1, z: 14 },
      poiName: 'metro_towers',
    });
    expect(vfx.getActiveFlagCaptureCount()).toBe(1);

    // 3. vfx:augment_activate (ascending holographic hex/ring aura tinted by color)
    bus.emit('vfx:augment_activate', {
      position: { x: 4, y: 0.5, z: 6 },
      color: '#a855f7',
    });
    expect(vfx.getActiveAugmentVfxCount()).toBe(1);

    // 4. vfx:tactical_ping (color-coded singleton replacing prior active ping cleanly)
    bus.emit('vfx:tactical_ping', {
      position: { x: 25, y: 0, z: -12 },
      kind: 'danger',
      label: 'Enemy',
    });
    expect(vfx.hasActiveTacticalPing()).toBe(true);
    expect(vfx.getActiveEffectCount()).toBe(4);

    const pingObj = scene.getObjectByName('vfx_tactical_ping') as THREE.Group;
    expect(pingObj).toBeInstanceOf(THREE.Group);
    expect(pingObj.visible).toBe(true);
    expect(pingObj.position.x).toBe(25);

    const getPingColorHex = (): number => {
      let hex = -1;
      pingObj.traverse((child) => {
        if (
          hex === -1 &&
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshBasicMaterial &&
          child.material.color.getHex() !== 0xffffff
        ) {
          hex = child.material.color.getHex();
        }
      });
      return hex;
    };
    expect(getPingColorHex()).toBe(new THREE.Color('#ef4444').getHex());

    // Emitting loot then move ping replaces prior ping cleanly (at most 1 active ping!)
    bus.emit('vfx:tactical_ping', {
      position: { x: -12, y: 3, z: 18 },
      kind: 'loot',
      label: 'Chest',
    });
    expect(vfx.hasActiveTacticalPing()).toBe(true);
    expect(vfx.getActiveEffectCount()).toBe(4);
    expect(pingObj.position.x).toBe(-12);
    expect(getPingColorHex()).toBe(new THREE.Color('#fbbf24').getHex());

    bus.emit('vfx:tactical_ping', {
      position: { x: 8, y: 1, z: 9 },
      kind: 'move',
      label: 'Rotate',
    });
    expect(vfx.hasActiveTacticalPing()).toBe(true);
    expect(vfx.getActiveEffectCount()).toBe(4);
    expect(pingObj.position.x).toBe(8);
    expect(getPingColorHex()).toBe(new THREE.Color('#22d3ee').getHex());

    // Step forward 2.5s -> transient rift_tear (1.35s), flag_captured (2.1s), augment_activate (1.15s) expire,
    // while tactical_ping (16s) remains active!
    for (let i = 0; i < 50; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveRiftTearCount()).toBe(0);
    expect(vfx.getActiveFlagCaptureCount()).toBe(0);
    expect(vfx.getActiveAugmentVfxCount()).toBe(0);
    expect(vfx.hasActiveTacticalPing()).toBe(true);
    expect(vfx.getActiveEffectCount()).toBe(1);

    // Step forward past 16s -> tactical_ping expires cleanly
    for (let i = 0; i < 280; i++) {
      vfx.update(0.05);
    }
    expect(vfx.hasActiveTacticalPing()).toBe(false);
    expect(pingObj.visible).toBe(false);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Edge cases: NaN coordinates & empty color never create NaN transforms
    bus.emit('vfx:rift_tear', {
      position: { x: Number.NaN, y: 0, z: 0 },
      skyPosition: { x: 0, y: 90, z: 0 },
    });
    bus.emit('vfx:augment_activate', {
      position: { x: 1, y: 1, z: 1 },
      color: '',
    });
    expect(vfx.getActiveRiftTearCount()).toBe(0);
    expect(vfx.getActiveAugmentVfxCount()).toBe(1);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });
    vfx.clear();
    expect(vfx.getActiveEffectCount()).toBe(0);

    // clear() resets all 4 Wave-4 VFX immediately
    bus.emit('vfx:rift_tear', {
      position: { x: 0, y: 0, z: 0 },
      skyPosition: { x: 0, y: 92, z: 0 },
    });
    bus.emit('vfx:flag_captured', { position: { x: 0, y: 0, z: 0 }, poiName: 'market_row' });
    bus.emit('vfx:augment_activate', { position: { x: 0, y: 0, z: 0 }, color: '#22d3ee' });
    bus.emit('vfx:tactical_ping', {
      position: { x: 5, y: 0, z: 5 },
      kind: 'danger',
      label: 'Danger',
    });
    expect(vfx.getActiveEffectCount()).toBe(4);

    vfx.clear();
    expect(vfx.getActiveRiftTearCount()).toBe(0);
    expect(vfx.getActiveFlagCaptureCount()).toBe(0);
    expect(vfx.getActiveAugmentVfxCount()).toBe(0);
    expect(vfx.hasActiveTacticalPing()).toBe(false);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all Wave-4 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:rift_tear', {
      position: { x: 0, y: 0, z: 0 },
      skyPosition: { x: 0, y: 92, z: 0 },
    });
    bus.emit('vfx:flag_captured', { position: { x: 0, y: 0, z: 0 }, poiName: 'sunny_suburbs' });
    bus.emit('vfx:augment_activate', { position: { x: 0, y: 0, z: 0 }, color: '#fbbf24' });
    bus.emit('vfx:tactical_ping', {
      position: { x: 0, y: 0, z: 0 },
      kind: 'move',
      label: 'Ping',
    });
    expect(vfx.getActiveRiftTearCount()).toBe(0);
    expect(vfx.getActiveFlagCaptureCount()).toBe(0);
    expect(vfx.getActiveAugmentVfxCount()).toBe(0);
    expect(vfx.hasActiveTacticalPing()).toBe(false);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});

describe('Wave-5 Tactical DMR, Kinetic Blade, Allied Aura & VFX Channels', () => {
  it('builds bespoke Tactical DMR (thermal optic + wraps) and Kinetic Blade (wrapDisabled + cyan/violet plasma)', () => {
    const dmr = createWeaponModel('tactical_dmr');
    expect(dmr.name).toBe('weapon_tactical_dmr');
    expect(countMeshes(dmr)).toBeGreaterThanOrEqual(16);
    expect(hasMuzzleOffset('tactical_dmr')).toBe(true);
    const dmrMuzzle = dmr.userData.muzzleOffset as THREE.Vector3;
    expect(dmrMuzzle.z).toBeGreaterThan(0.75);

    const cyanHex = new THREE.Color('#22d3ee').getHex();
    let hasCyanThermalLens = false;
    let dmrWrapTargets = 0;
    dmr.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) dmrWrapTargets++;
      if (
        child.material instanceof THREE.MeshStandardMaterial &&
        child.material.emissive.getHex() === cyanHex
      ) {
        hasCyanThermalLens = true;
      }
    });
    expect(hasCyanThermalLens).toBe(true);
    expect(dmrWrapTargets).toBeGreaterThanOrEqual(3);

    applyWeaponWrap(dmr, 'neon_pulse');
    const neonMat = getWeaponWrapMaterial('neon_pulse');
    let wrappedPanels = 0;
    let preservedCyanLens = false;
    dmr.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) {
        expect(child.material).toBe(neonMat);
        wrappedPanels++;
      } else {
        expect(child.material).not.toBe(neonMat);
        if (
          child.material instanceof THREE.MeshStandardMaterial &&
          child.material.emissive.getHex() === cyanHex
        ) {
          preservedCyanLens = true;
        }
      }
    });
    expect(wrappedPanels).toBe(dmrWrapTargets);
    expect(preservedCyanLens).toBe(true);
    disposeObject3D(dmr);

    const blade = createWeaponModel('kinetic_blade');
    expect(blade.name).toBe('weapon_kinetic_blade');
    expect(blade.userData.wrapDisabled).toBe(true);
    expect(countMeshes(blade)).toBeGreaterThanOrEqual(14);
    expect(hasMuzzleOffset('kinetic_blade')).toBe(false);

    const violetHex = new THREE.Color('#a855f7').getHex();
    let hasCyanPlasma = false;
    let hasVioletPlasma = false;
    blade.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        const em = child.material.emissive.getHex();
        if (em === cyanHex) hasCyanPlasma = true;
        if (em === violetHex) hasVioletPlasma = true;
      }
    });
    expect(hasCyanPlasma).toBe(true);
    expect(hasVioletPlasma).toBe(true);

    // Kinetic Blade keeps its iconic plasma glow even when wraps are applied
    applyWeaponWrap(blade, 'midas_gold');
    const goldMat = getWeaponWrapMaterial('midas_gold');
    blade.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        expect(child.material).not.toBe(goldMat);
      }
    });
    expect(blade.userData.appliedWrapId).toBeUndefined();
    disposeObject3D(blade);

    // CharacterRig & CharacterAnimator cleanly equip and pose both Wave-5 weapons
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();
    animator.update(
      rig,
      makeRenderState({ weaponId: 'tactical_dmr', animState: 'idle', isAiming: true }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('tactical_dmr');
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.4);

    animator.update(
      rig,
      makeRenderState({ weaponId: 'kinetic_blade', animState: 'run', isFiring: false }),
      0.05,
    );
    expect(rig.getEquippedWeaponId()).toBe('kinetic_blade');
    assertFiniteBox(rig.getGroup());
    rig.dispose();
  });

  it('adds, colors by SpecialistRole, animates, hides for hostiles/bosses, and disposes CharacterRig Ally Aura', () => {
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();

    expect(rig.isAllyAuraEnabled()).toBe(false);
    expect(rig.getGroup().getObjectByName('ally_tactical_aura')).toBeUndefined();

    // Enabling Scout Ally Aura builds hovering cyan diamond chevron + cyan role ring above head
    rig.setAllyAura(true, 'scout');
    expect(rig.isAllyAuraEnabled()).toBe(true);
    expect(rig.getAllyRole()).toBe('scout');
    const aura = rig.getGroup().getObjectByName('ally_tactical_aura') as THREE.Group;
    const chevron = rig.getGroup().getObjectByName('ally_tactical_chevron') as THREE.Group;
    const roleRing = rig.getGroup().getObjectByName('ally_role_ring') as THREE.Mesh;
    expect(aura).toBeInstanceOf(THREE.Group);
    expect(chevron).toBeInstanceOf(THREE.Group);
    expect(roleRing).toBeInstanceOf(THREE.Mesh);
    expect(aura.visible).toBe(true);
    expect(aura.position.y).toBeGreaterThan(1.85);
    expect((roleRing.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      new THREE.Color('#22d3ee').getHex(),
    );

    // Switching roles via updateFromState recolors role ring cleanly (medic -> green, heavy -> amber)
    rig.updateFromState(makeRenderState({ isAlly: true, allyRole: 'medic' }));
    expect(rig.isAllyAuraEnabled()).toBe(true);
    expect(rig.getAllyRole()).toBe('medic');
    expect((roleRing.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      new THREE.Color('#22c55e').getHex(),
    );

    rig.updateFromState(makeRenderState({ isAlly: true, allyRole: 'heavy' }));
    expect(rig.isAllyAuraEnabled()).toBe(true);
    expect(rig.getAllyRole()).toBe('heavy');
    expect((roleRing.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      new THREE.Color('#fbbf24').getHex(),
    );

    // CharacterAnimator animates the hovering chevron smoothly over time
    const rotStart = chevron.rotation.y;
    for (let i = 0; i < 6; i++) {
      animator.update(
        rig,
        makeRenderState({ animState: 'run', isAlly: true, allyRole: 'heavy' }),
        0.05,
      );
    }
    expect(chevron.rotation.y).toBeGreaterThan(rotStart);

    // Hostile or Boss state hides Ally Aura cleanly
    rig.updateFromState(makeRenderState({ isAlly: false }));
    expect(rig.isAllyAuraEnabled()).toBe(false);
    expect(aura.visible).toBe(false);

    animator.update(
      rig,
      makeRenderState({ isBoss: true, isAlly: true, allyRole: 'scout' }),
      0.05,
    );
    expect(rig.isBossAuraEnabled()).toBe(true);
    expect(rig.isAllyAuraEnabled()).toBe(false);
    expect(aura.visible).toBe(false);

    // Clearing isBoss restores Ally Aura cleanly when isAlly is true
    animator.update(
      rig,
      makeRenderState({ isBoss: false, isAlly: true, allyRole: 'medic' }),
      0.05,
    );
    expect(rig.isBossAuraEnabled()).toBe(false);
    expect(rig.isAllyAuraEnabled()).toBe(true);
    expect(aura.visible).toBe(true);

    rig.dispose();
    expect(rig.getGroup().getObjectByName('ally_tactical_aura')).toBeUndefined();
  });

  it('spawns, updates, expires, guards NaN, clears, and disposes all 3 Wave-5 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:kinetic_dash
    bus.emit('vfx:kinetic_dash', {
      from: { x: 0, y: 1, z: 0 },
      to: { x: 0, y: 2, z: 12 },
    });
    expect(vfx.getActiveKineticDashCount()).toBe(1);

    // 2. vfx:gold_burst
    bus.emit('vfx:gold_burst', {
      position: { x: 8, y: 0.5, z: -4 },
      amount: 120,
    });
    expect(vfx.getActiveGoldBurstCount()).toBe(1);

    // 3. vfx:loot_island_rift
    bus.emit('vfx:loot_island_rift', {
      position: { x: -20, y: 28, z: 15 },
    });
    expect(vfx.getActiveLootIslandVfxCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(3);

    // Step forward 0.3s -> all 3 remain active and transforms stay finite
    for (let i = 0; i < 6; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveKineticDashCount()).toBe(1);
    expect(vfx.getActiveGoldBurstCount()).toBe(1);
    expect(vfx.getActiveLootIslandVfxCount()).toBe(1);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // Step forward another 0.4s (total 0.7s) -> kinetic_dash (0.55s) expires, gold & rift stay active
    for (let i = 0; i < 8; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveKineticDashCount()).toBe(0);
    expect(vfx.getActiveGoldBurstCount()).toBe(1);
    expect(vfx.getActiveLootIslandVfxCount()).toBe(1);

    // Step forward another 0.5s (total 1.2s) -> gold_burst (1.05s) expires, loot_island_rift (2.4s) stays active
    for (let i = 0; i < 10; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveGoldBurstCount()).toBe(0);
    expect(vfx.getActiveLootIslandVfxCount()).toBe(1);

    // Step past 2.4s -> loot_island_rift expires cleanly
    for (let i = 0; i < 28; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveLootIslandVfxCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Edge cases: NaN coordinates & zero-length dash never produce NaN transforms
    bus.emit('vfx:kinetic_dash', {
      from: { x: Number.NaN, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 5 },
    });
    bus.emit('vfx:gold_burst', {
      position: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
      amount: 50,
    });
    bus.emit('vfx:loot_island_rift', {
      position: { x: 0, y: 0, z: Number.NaN },
    });
    expect(vfx.getActiveKineticDashCount()).toBe(0);
    expect(vfx.getActiveGoldBurstCount()).toBe(0);
    expect(vfx.getActiveLootIslandVfxCount()).toBe(0);

    bus.emit('vfx:kinetic_dash', {
      from: { x: 2, y: 1, z: 2 },
      to: { x: 2, y: 1, z: 2 },
    });
    expect(vfx.getActiveKineticDashCount()).toBe(1);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // clear() resets all 3 Wave-5 VFX immediately
    bus.emit('vfx:gold_burst', { position: { x: 0, y: 1, z: 0 }, amount: 40 });
    bus.emit('vfx:loot_island_rift', { position: { x: 0, y: 30, z: 0 } });
    expect(vfx.getActiveEffectCount()).toBe(3);
    vfx.clear();
    expect(vfx.getActiveKineticDashCount()).toBe(0);
    expect(vfx.getActiveGoldBurstCount()).toBe(0);
    expect(vfx.getActiveLootIslandVfxCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all Wave-5 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:kinetic_dash', { from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 8 } });
    bus.emit('vfx:gold_burst', { position: { x: 0, y: 0, z: 0 }, amount: 50 });
    bus.emit('vfx:loot_island_rift', { position: { x: 0, y: 20, z: 0 } });
    expect(vfx.getActiveKineticDashCount()).toBe(0);
    expect(vfx.getActiveGoldBurstCount()).toBe(0);
    expect(vfx.getActiveLootIslandVfxCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});
