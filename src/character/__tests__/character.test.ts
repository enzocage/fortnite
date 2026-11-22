import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type {
  AnimState,
  BiomeType,
  CharacterRenderState,
  EmoteId,
  Rarity,
  WeaponId,
  WeaponModId,
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
  WEAPON_MODS,
  WEAPON_WRAPS,
} from '../../core';
import {
  CharacterAnimator,
  CharacterRig,
  VFXManager,
  applyWeaponModsToModel,
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
  resolveAnimState,
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
  it('builds distinct stylized 3D models for all 37 WeaponIds with muzzleOffsets on ranged & throwables', () => {
    const allIds = Object.keys(WEAPONS) as WeaponId[];
    expect(allIds).toHaveLength(37);

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
  it('animates all 23 AnimStates (including drive, knocked, reviving, and grind) and all 6 EmoteIds without NaN transforms or invalid bounding boxes', () => {
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
      'knocked',
      'reviving',
      'grind',
    ];
    expect(states).toHaveLength(23);
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
            animState === 'drive' ||
            animState === 'grind'
              ? 6.5
              : 0,
          grounded:
            animState !== 'jump' &&
            animState !== 'fall' &&
            animState !== 'skydive' &&
            animState !== 'glide' &&
            animState !== 'zipline' &&
            animState !== 'grind',
          harvestSwingTimer: animState === 'harvest' ? 0.25 : 0,
          leanAngle:
            animState === 'sprint' ||
            animState === 'slide' ||
            animState === 'drive' ||
            animState === 'grind'
              ? 0.25
              : 0,
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
      'combat_smg',
      'minigun',
      'sniper',
      'boom_bow',
      'railgun',
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

describe('Wave-6 Combat SMG, Boom Bow, Victory Crown, Medallions, Duo Aura, DBNO/Revive & VFX', () => {
  it('builds bespoke Combat SMG (twin taped mags, reflex optic, laser rail) and Boom Bow (compound limbs, bowstring, explosive tip) with casing rules', () => {
    const combatSmg = createWeaponModel('combat_smg');
    expect(combatSmg.name).toBe('weapon_combat_smg');
    expect(countMeshes(combatSmg)).toBeGreaterThanOrEqual(18);
    expect(isRangedWeapon('combat_smg')).toBe(true);
    expect(hasMuzzleOffset('combat_smg')).toBe(true);
    const smgMuzzle = combatSmg.userData.muzzleOffset as THREE.Vector3;
    expect(smgMuzzle.z).toBeGreaterThan(0.35);

    const cyanHex = new THREE.Color('#22d3ee').getHex();
    const redLaserHex = new THREE.Color('#ef4444').getHex();
    const tapeAmberHex = new THREE.Color('#fbbf24').getHex();
    let hasReflexOptic = false;
    let hasLaserEmitter = false;
    let hasMagTape = false;
    combatSmg.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.emissive.getHex() === cyanHex) hasReflexOptic = true;
        if (child.material.emissive.getHex() === redLaserHex) hasLaserEmitter = true;
        if (child.material.color.getHex() === tapeAmberHex) hasMagTape = true;
      }
    });
    expect(hasReflexOptic).toBe(true);
    expect(hasLaserEmitter).toBe(true);
    expect(hasMagTape).toBe(true);
    disposeObject3D(combatSmg);

    const boomBow = createWeaponModel('boom_bow');
    expect(boomBow.name).toBe('weapon_boom_bow');
    expect(countMeshes(boomBow)).toBeGreaterThanOrEqual(18);
    expect(isRangedWeapon('boom_bow')).toBe(true);
    expect(hasMuzzleOffset('boom_bow')).toBe(true);
    const bowMuzzle = boomBow.userData.muzzleOffset as THREE.Vector3;
    expect(bowMuzzle.z).toBeGreaterThan(0.4);

    const explosiveOrangeHex = new THREE.Color('#fb923c').getHex();
    const tipEmberHex = new THREE.Color('#fef08a').getHex();
    let hasExplosiveGlow = false;
    let hasTipEmber = false;
    boomBow.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.emissive.getHex() === explosiveOrangeHex) hasExplosiveGlow = true;
        if (child.material.emissive.getHex() === tipEmberHex) hasTipEmber = true;
      }
    });
    expect(hasExplosiveGlow).toBe(true);
    expect(hasTipEmber).toBe(true);
    disposeObject3D(boomBow);

    // Muzzle VFX ejects casings for combat_smg but NOT for boom_bow arrows
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.5 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'boom_bow',
    });
    expect(vfx.getActiveCasingCount()).toBe(0);
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.5 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'combat_smg',
    });
    expect(vfx.getActiveCasingCount()).toBe(1);
    vfx.dispose();
  });

  it('adds, animates, reads, syncs, and disposes Victory Crown halo, Medallion orbital rings (1..3), and cyan-gold Duo Partner aura', () => {
    const rig = new CharacterRig();
    expect(rig.hasVictoryCrown()).toBe(false);
    expect(rig.getMedallionCount()).toBe(0);
    expect(rig.isDuoPartnerAuraEnabled()).toBe(false);

    // 1. Victory Crown halo (5-peak golden crown floating above head)
    rig.setVictoryCrown(true, 0.2);
    expect(rig.hasVictoryCrown()).toBe(true);
    expect(rig.isVictoryCrownEnabled()).toBe(true);
    const crownAura = rig.getVictoryCrownGroup()!;
    expect(crownAura).toBeInstanceOf(THREE.Group);
    expect(crownAura.visible).toBe(true);
    expect(crownAura.position.y).toBeGreaterThan(1.85);
    const crownMesh = crownAura.getObjectByName('victory_crown_mesh') as THREE.Group;
    expect(crownMesh).toBeInstanceOf(THREE.Group);
    // Base band + rim torus + 5 peaks + 5 jewels + front gem = 13 meshes
    expect(countMeshes(crownMesh)).toBeGreaterThanOrEqual(12);
    const crownRotA = crownMesh.rotation.y;
    const crownYA = crownAura.position.y;
    rig.setVictoryCrown(true, 1.4);
    expect(crownMesh.rotation.y).not.toBeCloseTo(crownRotA, 3);
    expect(crownAura.position.y).not.toBeCloseTo(crownYA, 3);

    rig.setVictoryCrown(false);
    expect(rig.hasVictoryCrown()).toBe(false);
    expect(crownAura.visible).toBe(false);

    // 2. Aspect Medallion orbital rings (0..3 clamped cleanly)
    rig.setMedallionCount(-2);
    expect(rig.getMedallionCount()).toBe(0);
    rig.setMedallionCount(Number.NaN);
    expect(rig.getMedallionCount()).toBe(0);

    rig.setMedallionCount(2, 0.1);
    expect(rig.getMedallionCount()).toBe(2);
    const orbitGroup = rig.getMedallionOrbitGroup()!;
    expect(orbitGroup).toBeInstanceOf(THREE.Group);
    expect(orbitGroup.visible).toBe(true);
    const nodes = rig.getMedallionNodes();
    expect(nodes).toHaveLength(3);
    expect(nodes[0].visible).toBe(true);
    expect(nodes[1].visible).toBe(true);
    expect(nodes[2].visible).toBe(false);

    rig.setMedallionCount(5, 0.9);
    expect(rig.getMedallionCount()).toBe(3);
    expect(nodes.every((n) => n.visible)).toBe(true);
    const orbitRotA = orbitGroup.rotation.y;
    rig.setMedallionCount(3, 1.8);
    expect(orbitGroup.rotation.y).toBeGreaterThan(orbitRotA);

    rig.setMedallionCount(0);
    expect(rig.getMedallionCount()).toBe(0);
    expect(orbitGroup.visible).toBe(false);

    // 3. Duo Partner cyan-gold overhead chevron aura
    rig.setDuoPartnerAura(true, 0.2);
    expect(rig.isDuoPartnerAuraEnabled()).toBe(true);
    const duoAura = rig.getDuoPartnerAuraGroup()!;
    expect(duoAura).toBeInstanceOf(THREE.Group);
    expect(duoAura.visible).toBe(true);
    expect(duoAura.position.y).toBeGreaterThan(1.85);
    const duoChevron = duoAura.getObjectByName('duo_partner_chevron') as THREE.Group;
    expect(duoChevron).toBeInstanceOf(THREE.Group);

    const cyanHex = new THREE.Color('#22d3ee').getHex();
    const goldHex = new THREE.Color('#fbbf24').getHex();
    let hasCyan = false;
    let hasGold = false;
    duoChevron.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.color.getHex() === cyanHex) hasCyan = true;
        if (child.material.color.getHex() === goldHex) hasGold = true;
      }
    });
    expect(hasCyan).toBe(true);
    expect(hasGold).toBe(true);

    // Clearing via updateFromState & toggling via state fields
    rig.updateFromState(
      makeRenderState({
        hasVictoryCrown: true,
        medallionCount: 2,
        isDuoPartner: true,
      }),
    );
    expect(rig.hasVictoryCrown()).toBe(true);
    expect(rig.getMedallionCount()).toBe(2);
    expect(rig.isDuoPartnerAuraEnabled()).toBe(true);
    // Duo Partner chevron offsets cleanly above Victory Crown when both active
    expect(duoAura.position.y).toBeGreaterThan(crownAura.position.y);

    rig.updateFromState(
      makeRenderState({
        hasVictoryCrown: false,
        medallionCount: 0,
        isDuoPartner: false,
      }),
    );
    expect(rig.hasVictoryCrown()).toBe(false);
    expect(rig.getMedallionCount()).toBe(0);
    expect(rig.isDuoPartnerAuraEnabled()).toBe(false);

    // Dispose cleans up all Wave-6 attachments
    rig.dispose();
    expect(rig.getGroup().getObjectByName('victory_crown_aura')).toBeUndefined();
    expect(rig.getGroup().getObjectByName('medallion_orbit_group')).toBeUndefined();
    expect(rig.getGroup().getObjectByName('duo_partner_aura')).toBeUndefined();
  });

  it('animates knocked crawl, reviving kneeling stance, bowCharge draw pose, and smooth Crown/Medallion motion', () => {
    const animator = new CharacterAnimator();
    const rig = new CharacterRig();

    // 1. Knocked DBNO hands-and-knees crawl
    animator.update(
      rig,
      makeRenderState({ animState: 'knocked', moveSpeed: 1.5, grounded: true }),
      0,
    );
    expect(rig.joints.hips.position.y).toBeLessThan(0.6);
    expect(rig.joints.hips.rotation.x).toBeGreaterThan(0.9);
    expect(rig.joints.head.rotation.x).toBeLessThan(-0.5);
    expect(rig.joints.leftKnee.rotation.x).toBeGreaterThan(1.1);
    const crawlShoulderStart = rig.joints.leftShoulder.rotation.x;
    for (let i = 0; i < 8; i++) {
      animator.update(
        rig,
        makeRenderState({ isKnocked: true, animState: 'idle', moveSpeed: 2.0, grounded: true }),
        0.05,
      );
    }
    expect(Math.abs(rig.joints.leftShoulder.rotation.x - crawlShoulderStart)).toBeGreaterThan(0.1);
    assertFiniteBox(rig.getGroup());

    // 2. Reviving kneeling healing stance
    animator.update(
      rig,
      makeRenderState({ animState: 'reviving', grounded: true }),
      0,
    );
    expect(rig.joints.hips.position.y).toBeLessThan(0.7);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.8);
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.8);
    expect(rig.joints.leftKnee.rotation.x).toBeGreaterThan(1.1);
    const reviveArmA = rig.joints.leftShoulder.rotation.x;
    for (let i = 0; i < 6; i++) {
      animator.update(
        rig,
        makeRenderState({ isReviving: true, animState: 'idle', grounded: true }),
        0.05,
      );
    }
    expect(rig.joints.leftShoulder.rotation.x).not.toBeCloseTo(reviveArmA, 4);
    assertFiniteBox(rig.getGroup());

    // 3. Boom Bow draw pose scaled by bowCharge
    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'boom_bow', bowCharge: 0 }),
      0,
    );
    const relaxedLeftElbow = rig.joints.leftElbow.rotation.x;
    const relaxedChestRy = rig.joints.chest.rotation.y;

    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'boom_bow', bowCharge: 1.0 }),
      0,
    );
    expect(rig.joints.leftElbow.rotation.x).toBeLessThan(relaxedLeftElbow - 0.5);
    expect(rig.joints.chest.rotation.y).toBeGreaterThan(relaxedChestRy + 0.3);
    const bowMuzzle = rig.getMuzzleWorldPosition(new THREE.Vector3());
    expect(Number.isFinite(bowMuzzle.x)).toBe(true);
    expect(bowMuzzle.z).toBeGreaterThan(0.2);

    // 4. Smooth Crown bob, Medallion orbital rotation, and Duo Partner chevron motion
    animator.update(
      rig,
      makeRenderState({
        animState: 'idle',
        hasVictoryCrown: true,
        medallionCount: 3,
        isDuoPartner: true,
      }),
      0.05,
    );
    const crownAura = rig.getVictoryCrownGroup()!;
    const orbitGroup = rig.getMedallionOrbitGroup()!;
    const crownYStart = crownAura.position.y;
    const orbitRotStart = orbitGroup.rotation.y;

    for (let i = 0; i < 8; i++) {
      animator.update(
        rig,
        makeRenderState({
          animState: 'run',
          moveSpeed: 6.0,
          hasVictoryCrown: true,
          medallionCount: 3,
          isDuoPartner: true,
        }),
        0.05,
      );
    }
    expect(orbitGroup.rotation.y).toBeGreaterThan(orbitRotStart);
    expect(crownAura.position.y).not.toBeCloseTo(crownYStart, 3);

    rig.dispose();
  });

  it('spawns, updates, expires, guards NaN, clears, and disposes all 4 Wave-6 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:bow_explosion
    bus.emit('vfx:bow_explosion', { position: { x: 4, y: 1, z: -6 }, radius: 4.4 });
    expect(vfx.getActiveBowExplosionCount()).toBe(1);

    // 2. vfx:slurp_tanker_burst
    bus.emit('vfx:slurp_tanker_burst', { position: { x: -10, y: 0.5, z: 8 }, radius: 10 });
    expect(vfx.getActiveSlurpTankerBurstCount()).toBe(1);

    // 3. vfx:crown_glint
    bus.emit('vfx:crown_glint', { position: { x: 2, y: 0, z: 3 } });
    expect(vfx.getActiveCrownGlintCount()).toBe(1);

    // 4. vfx:revive_beam (re-emitting at same spot updates progress without duplicating)
    bus.emit('vfx:revive_beam', { position: { x: 0, y: 0, z: 0 }, progress: 0.25 });
    bus.emit('vfx:revive_beam', { position: { x: 0, y: 0, z: 0 }, progress: 0.75 });
    expect(vfx.getActiveReviveBeamCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(4);

    // Emitting a second revive beam at a distinct location allocates another slot
    bus.emit('vfx:revive_beam', { position: { x: 12, y: 0, z: 12 }, progress: 0.5 });
    expect(vfx.getActiveReviveBeamCount()).toBe(2);
    expect(vfx.getActiveEffectCount()).toBe(5);

    // Step 0.3s -> all remain active and transforms stay finite
    for (let i = 0; i < 6; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveReviveBeamCount()).toBe(2);
    expect(vfx.getActiveBowExplosionCount()).toBe(1);
    expect(vfx.getActiveCrownGlintCount()).toBe(1);
    expect(vfx.getActiveSlurpTankerBurstCount()).toBe(1);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // Step past 0.85s -> revive_beam (0.55s), bow_explosion (0.62s), crown_glint (0.78s) expire while slurp_tanker_burst (1.25s) stays active
    for (let i = 0; i < 12; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveReviveBeamCount()).toBe(0);
    expect(vfx.getActiveBowExplosionCount()).toBe(0);
    expect(vfx.getActiveCrownGlintCount()).toBe(0);
    expect(vfx.getActiveSlurpTankerBurstCount()).toBe(1);

    // Step past 1.25s -> all expired
    for (let i = 0; i < 10; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveSlurpTankerBurstCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Edge cases: NaN/Infinity positions & invalid radii/progress never produce NaN transforms
    bus.emit('vfx:bow_explosion', {
      position: { x: Number.NaN, y: 0, z: 0 },
      radius: 4.4,
    });
    bus.emit('vfx:slurp_tanker_burst', {
      position: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
      radius: 10,
    });
    bus.emit('vfx:crown_glint', {
      position: { x: 0, y: 0, z: Number.NaN },
    });
    bus.emit('vfx:revive_beam', {
      position: { x: Number.NEGATIVE_INFINITY, y: 0, z: 0 },
      progress: 0.5,
    });
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Negative / NaN radius or progress clamped safely
    bus.emit('vfx:bow_explosion', { position: { x: 1, y: 1, z: 1 }, radius: -5 });
    bus.emit('vfx:slurp_tanker_burst', { position: { x: 2, y: 0, z: 2 }, radius: Number.NaN });
    bus.emit('vfx:revive_beam', { position: { x: 3, y: 0, z: 3 }, progress: Number.NaN });
    expect(vfx.getActiveEffectCount()).toBe(3);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // clear() resets all 4 Wave-6 pools immediately
    bus.emit('vfx:crown_glint', { position: { x: 0, y: 0, z: 0 } });
    expect(vfx.getActiveEffectCount()).toBe(4);
    vfx.clear();
    expect(vfx.getActiveBowExplosionCount()).toBe(0);
    expect(vfx.getActiveSlurpTankerBurstCount()).toBe(0);
    expect(vfx.getActiveCrownGlintCount()).toBe(0);
    expect(vfx.getActiveReviveBeamCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all 4 Wave-6 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:bow_explosion', { position: { x: 0, y: 0, z: 0 }, radius: 4.4 });
    bus.emit('vfx:slurp_tanker_burst', { position: { x: 0, y: 0, z: 0 }, radius: 10 });
    bus.emit('vfx:crown_glint', { position: { x: 0, y: 0, z: 0 } });
    bus.emit('vfx:revive_beam', { position: { x: 0, y: 0, z: 0 }, progress: 0.8 });
    expect(vfx.getActiveBowExplosionCount()).toBe(0);
    expect(vfx.getActiveSlurpTankerBurstCount()).toBe(0);
    expect(vfx.getActiveCrownGlintCount()).toBe(0);
    expect(vfx.getActiveReviveBeamCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});

describe('Wave-7 Pulse Railgun, Overheat Minigun, Grind Pose & VFX Channels', () => {
  it('builds bespoke Pulse Railgun and Overheat Minigun models with wrapTarget panels and muzzleOffsets', () => {
    const railgun = createWeaponModel('railgun');
    expect(railgun.name).toBe('weapon_railgun');
    expect(isRangedWeapon('railgun')).toBe(true);
    expect(hasMuzzleOffset('railgun')).toBe(true);
    expect(countMeshes(railgun)).toBeGreaterThanOrEqual(20);
    const railMuzzle = railgun.userData.muzzleOffset as THREE.Vector3;
    expect(railMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(railMuzzle.z).toBeGreaterThan(0.75);

    const cyanHex = new THREE.Color('#22d3ee').getHex();
    const violetHex = new THREE.Color('#a855f7').getHex();
    let hasCyanCoil = false;
    let hasVioletCoil = false;
    let railWrapTargets = 0;
    railgun.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) railWrapTargets++;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.emissive.getHex() === cyanHex) hasCyanCoil = true;
        if (child.material.emissive.getHex() === violetHex) hasVioletCoil = true;
      }
    });
    expect(hasCyanCoil).toBe(true);
    expect(hasVioletCoil).toBe(true);
    expect(railWrapTargets).toBeGreaterThanOrEqual(3);

    applyWeaponWrap(railgun, 'neon_cyber');
    const neonMat = getWeaponWrapMaterial('neon_cyber');
    let railWrappedCount = 0;
    railgun.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) {
        expect(child.material).toBe(neonMat);
        railWrappedCount++;
      } else {
        expect(child.material).not.toBe(neonMat);
      }
    });
    expect(railWrappedCount).toBe(railWrapTargets);
    disposeObject3D(railgun);

    const minigun = createWeaponModel('minigun');
    expect(minigun.name).toBe('weapon_minigun');
    expect(isRangedWeapon('minigun')).toBe(true);
    expect(hasMuzzleOffset('minigun')).toBe(true);
    expect(countMeshes(minigun)).toBeGreaterThanOrEqual(24);
    const minigunMuzzle = minigun.userData.muzzleOffset as THREE.Vector3;
    expect(minigunMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(minigunMuzzle.z).toBeGreaterThan(0.7);

    const heatOrangeHex = new THREE.Color('#f97316').getHex();
    let hasHeatVent = false;
    let minigunWrapTargets = 0;
    minigun.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) minigunWrapTargets++;
      if (
        child.material instanceof THREE.MeshStandardMaterial &&
        child.material.emissive.getHex() === heatOrangeHex
      ) {
        hasHeatVent = true;
      }
    });
    expect(hasHeatVent).toBe(true);
    expect(minigunWrapTargets).toBeGreaterThanOrEqual(3);
    disposeObject3D(minigun);
  });

  it('animates grind snowboard balance stance via animState & isGrinding and holds minigun low-slung vs railgun shoulder brace', () => {
    const animator = new CharacterAnimator();
    const rig = new CharacterRig();

    expect(resolveAnimState(makeRenderState({ animState: 'fall', isGrinding: true }))).toBe('grind');
    expect(resolveAnimState(makeRenderState({ animState: 'idle', isGrinding: false }))).toBe('idle');

    // Grind balance pose: crouched hips, sideways surf stance, arms out wide, staggered knees
    animator.update(
      rig,
      makeRenderState({ animState: 'fall', isGrinding: true, moveSpeed: 16.5, grounded: false }),
      0,
    );
    expect(rig.joints.hips.position.y).toBeLessThan(0.75);
    expect(rig.joints.hips.rotation.y).toBeGreaterThan(0.3);
    expect(rig.joints.spine.rotation.x).toBeGreaterThan(0.15);
    expect(rig.joints.leftShoulder.rotation.z).toBeGreaterThan(0.7);
    expect(rig.joints.rightShoulder.rotation.z).toBeLessThan(-0.7);
    expect(rig.joints.leftKnee.rotation.x).toBeGreaterThan(0.7);
    expect(rig.joints.rightKnee.rotation.x).toBeGreaterThan(0.6);
    expect(Math.abs(rig.joints.leftHip.rotation.x - rig.joints.rightHip.rotation.x)).toBeGreaterThan(0.3);
    expect(rig.isContrailActive()).toBe(false);

    // Aiming while grinding still keeps crouched staggered-knee rail stance while aiming weapon
    animator.update(
      rig,
      makeRenderState({
        animState: 'grind',
        isGrinding: true,
        weaponId: 'railgun',
        isAiming: true,
        grounded: false,
      }),
      0,
    );
    expect(rig.joints.hips.position.y).toBeLessThan(0.75);
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.7);
    expect(rig.getEquippedWeaponId()).toBe('railgun');

    // Compare standard AR / Railgun shoulder hold vs Minigun heavy low-slung hip-hold
    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'railgun', isAiming: true, weaponCharge: 0.8 }),
      0,
    );
    const railgunShoulderRx = rig.joints.rightShoulder.rotation.x;
    const railgunHandWorldY = rig.joints.rightHand.getWorldPosition(new THREE.Vector3()).y;

    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'minigun', isFiring: true }),
      0,
    );
    const minigunShoulderRx = rig.joints.rightShoulder.rotation.x;
    const minigunElbowRx = rig.joints.rightElbow.rotation.x;
    const minigunHandWorldY = rig.joints.rightHand.getWorldPosition(new THREE.Vector3()).y;
    const minigunMuzzle = rig.getMuzzleWorldPosition(new THREE.Vector3());

    expect(minigunShoulderRx).toBeGreaterThan(-0.5);
    expect(minigunShoulderRx).toBeGreaterThan(railgunShoulderRx + 0.4);
    expect(minigunElbowRx).toBeLessThan(-0.9);
    expect(minigunHandWorldY).toBeLessThan(railgunHandWorldY - 0.08);
    expect(Number.isFinite(minigunMuzzle.x)).toBe(true);
    expect(minigunMuzzle.z).toBeGreaterThan(0.4);
    assertFiniteBox(rig.getGroup());

    rig.dispose();
  });

  it('excludes railgun from brass casings while keeping rapid minigun casings + distinct muzzle flash colors', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // Railgun emits plasma muzzle flash WITHOUT ejecting brass casing
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.6 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'railgun',
    });
    expect(vfx.getActiveCasingCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(1);

    const vfxRoot = scene.getObjectByName('vfx_root') as THREE.Group;
    const activeMuzzleColors: number[] = [];
    for (const child of vfxRoot.children) {
      if (child instanceof THREE.Group && child.visible) {
        child.traverse((m) => {
          if (m instanceof THREE.Mesh && m.material instanceof THREE.MeshBasicMaterial) {
            activeMuzzleColors.push(m.material.color.getHex());
          }
        });
      }
    }
    expect(activeMuzzleColors).toContain(0xa855f7);

    // Clear and fire rapid minigun burst -> ejects rapid brass casings + orange gatling flash
    vfx.clear();
    for (let i = 0; i < 6; i++) {
      bus.emit('vfx:muzzle', {
        position: { x: 0, y: 1.1, z: 0.6 },
        direction: { x: 0, y: 0, z: 1 },
        weaponId: 'minigun',
      });
    }
    expect(vfx.getActiveCasingCount()).toBe(6);

    const minigunMuzzleColors: number[] = [];
    for (const child of vfxRoot.children) {
      if (child instanceof THREE.Group && child.visible) {
        child.traverse((m) => {
          if (m instanceof THREE.Mesh && m.material instanceof THREE.MeshBasicMaterial) {
            minigunMuzzleColors.push(m.material.color.getHex());
          }
        });
      }
    }
    expect(minigunMuzzleColors).toContain(0xfb923c);

    vfx.dispose();
  });

  it('spawns, updates, expires, guards NaN/range, clears, and disposes all 5 Wave-7 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:railgun_beam (including pierced flag)
    bus.emit('vfx:railgun_beam', {
      from: { x: 0, y: 1.5, z: 0 },
      to: { x: 0, y: 1.5, z: 45 },
      pierced: true,
    });
    expect(vfx.getActiveRailgunBeamCount()).toBe(1);

    // 2. vfx:rail_sparks (with velocity and without velocity)
    bus.emit('vfx:rail_sparks', {
      position: { x: 4, y: 3.2, z: -2 },
      velocity: { x: 16.5, y: 0, z: 0 },
    });
    bus.emit('vfx:rail_sparks', {
      position: { x: 6, y: 3.2, z: -2 },
    });
    expect(vfx.getActiveRailSparksCount()).toBe(2);

    // 3. vfx:trap_trigger (spike_trap & bouncer_pad)
    bus.emit('vfx:trap_trigger', {
      position: { x: -4, y: 0.1, z: 4 },
      kind: 'spike_trap',
    });
    bus.emit('vfx:trap_trigger', {
      position: { x: -8, y: 0.1, z: 4 },
      kind: 'bouncer_pad',
    });
    expect(vfx.getActiveTrapTriggerCount()).toBe(2);

    // 4. vfx:drone_explode
    bus.emit('vfx:drone_explode', {
      position: { x: 12, y: 14, z: -10 },
      rarity: 'legendary',
    });
    expect(vfx.getActiveDroneExplodeCount()).toBe(1);

    // 5. vfx:reboot_beam (re-emitting near same van updates progress without duplicating)
    bus.emit('vfx:reboot_beam', {
      position: { x: -15, y: 0, z: -15 },
      progress: 0.3,
    });
    bus.emit('vfx:reboot_beam', {
      position: { x: -15, y: 0, z: -15 },
      progress: 0.85,
    });
    expect(vfx.getActiveRebootBeamCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(7);

    // Emitting a second reboot beam at a distinct van allocates another slot
    bus.emit('vfx:reboot_beam', {
      position: { x: 25, y: 0, z: 25 },
      progress: 0.5,
    });
    expect(vfx.getActiveRebootBeamCount()).toBe(2);
    expect(vfx.getActiveEffectCount()).toBe(8);

    // Advance 0.2s -> all 8 remain active and transforms stay finite
    for (let i = 0; i < 4; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveEffectCount()).toBe(8);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // Advance past 0.4s -> rail_sparks (0.34s) expired, others still active
    for (let i = 0; i < 4; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveRailSparksCount()).toBe(0);
    expect(vfx.getActiveRailgunBeamCount()).toBe(1);
    expect(vfx.getActiveTrapTriggerCount()).toBe(2);
    expect(vfx.getActiveDroneExplodeCount()).toBe(1);
    expect(vfx.getActiveRebootBeamCount()).toBe(2);

    // Advance past 0.85s -> all Wave-7 channels expired cleanly back to pool
    for (let i = 0; i < 10; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveRailgunBeamCount()).toBe(0);
    expect(vfx.getActiveRailSparksCount()).toBe(0);
    expect(vfx.getActiveTrapTriggerCount()).toBe(0);
    expect(vfx.getActiveDroneExplodeCount()).toBe(0);
    expect(vfx.getActiveRebootBeamCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // NaN / Infinity / zero-length / out-of-range guards
    bus.emit('vfx:railgun_beam', {
      from: { x: Number.NaN, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 10 },
    });
    bus.emit('vfx:railgun_beam', {
      from: { x: 2, y: 2, z: 2 },
      to: { x: 2, y: 2, z: 2 },
    });
    bus.emit('vfx:rail_sparks', {
      position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
    });
    bus.emit('vfx:trap_trigger', {
      position: { x: 0, y: Number.NaN, z: 0 },
      kind: 'spike_trap',
    });
    bus.emit('vfx:drone_explode', {
      position: { x: 0, y: 0, z: Number.NEGATIVE_INFINITY },
      rarity: 'epic',
    });
    bus.emit('vfx:reboot_beam', {
      position: { x: Number.NaN, y: 0, z: 0 },
      progress: 0.5,
    });
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Huge beam range & NaN velocity/progress clamped safely without NaN transforms
    bus.emit('vfx:railgun_beam', {
      from: { x: 0, y: 1, z: 0 },
      to: { x: 0, y: 1, z: 5000 },
    });
    bus.emit('vfx:rail_sparks', {
      position: { x: 1, y: 1, z: 1 },
      velocity: { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: 0 },
    });
    bus.emit('vfx:reboot_beam', {
      position: { x: 3, y: 0, z: 3 },
      progress: Number.NaN,
    });
    expect(vfx.getActiveRailgunBeamCount()).toBe(1);
    expect(vfx.getActiveRailSparksCount()).toBe(1);
    expect(vfx.getActiveRebootBeamCount()).toBe(1);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // clear() resets all 5 Wave-7 pools immediately
    bus.emit('vfx:trap_trigger', { position: { x: 0, y: 0, z: 0 }, kind: 'bouncer_pad' });
    bus.emit('vfx:drone_explode', { position: { x: 2, y: 8, z: 2 }, rarity: 'mythic' });
    expect(vfx.getActiveEffectCount()).toBe(5);
    vfx.clear();
    expect(vfx.getActiveRailgunBeamCount()).toBe(0);
    expect(vfx.getActiveRailSparksCount()).toBe(0);
    expect(vfx.getActiveTrapTriggerCount()).toBe(0);
    expect(vfx.getActiveDroneExplodeCount()).toBe(0);
    expect(vfx.getActiveRebootBeamCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all 5 Wave-7 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:railgun_beam', { from: { x: 0, y: 1, z: 0 }, to: { x: 0, y: 1, z: 25 } });
    bus.emit('vfx:rail_sparks', { position: { x: 0, y: 1, z: 0 } });
    bus.emit('vfx:trap_trigger', { position: { x: 0, y: 0, z: 0 }, kind: 'spike_trap' });
    bus.emit('vfx:drone_explode', { position: { x: 0, y: 10, z: 0 }, rarity: 'rare' });
    bus.emit('vfx:reboot_beam', { position: { x: 0, y: 0, z: 0 }, progress: 0.9 });
    expect(vfx.getActiveRailgunBeamCount()).toBe(0);
    expect(vfx.getActiveRailSparksCount()).toBe(0);
    expect(vfx.getActiveTrapTriggerCount()).toBe(0);
    expect(vfx.getActiveDroneExplodeCount()).toBe(0);
    expect(vfx.getActiveRebootBeamCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});

describe('Wave-8 Port-A-Bunker, EMP Grenade, Weapon Mods, Team Blue Chevron & VFX Channels', () => {
  it('builds bespoke Port-A-Bunker and EMP Grenade models with throwable poses and zero casing ejection', () => {
    const bunker = createWeaponModel('port_a_bunker');
    expect(bunker.name).toBe('weapon_port_a_bunker');
    expect(bunker.userData.wrapDisabled).toBe(true);
    expect(isThrowableWeapon('port_a_bunker')).toBe(true);
    expect(hasMuzzleOffset('port_a_bunker')).toBe(true);
    expect(countMeshes(bunker)).toBeGreaterThanOrEqual(10);
    const bunkerMuzzle = bunker.userData.muzzleOffset as THREE.Vector3;
    expect(bunkerMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(bunkerMuzzle.z).toBeGreaterThan(0.15);

    const blueHex = new THREE.Color('#2563eb').getHex();
    const silverHex = new THREE.Color('#cbd5e1').getHex();
    const cyanHex = new THREE.Color('#22d3ee').getHex();
    let hasBlue = false;
    let hasSilver = false;
    let hasCyanStripe = false;
    bunker.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.color.getHex() === blueHex) hasBlue = true;
        if (child.material.color.getHex() === silverHex) hasSilver = true;
        if (child.material.emissive.getHex() === cyanHex) hasCyanStripe = true;
      }
    });
    expect(hasBlue).toBe(true);
    expect(hasSilver).toBe(true);
    expect(hasCyanStripe).toBe(true);
    assertFiniteBox(bunker);
    disposeObject3D(bunker);

    const emp = createWeaponModel('emp_grenade');
    expect(emp.name).toBe('weapon_emp_grenade');
    expect(emp.userData.wrapDisabled).toBe(true);
    expect(isThrowableWeapon('emp_grenade')).toBe(true);
    expect(hasMuzzleOffset('emp_grenade')).toBe(true);
    expect(countMeshes(emp)).toBeGreaterThanOrEqual(10);
    const empMuzzle = emp.userData.muzzleOffset as THREE.Vector3;
    expect(empMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(empMuzzle.z).toBeGreaterThan(0.15);

    const copperHex = new THREE.Color('#d97706').getHex();
    let hasElectricCyanOrb = false;
    let hasCopperCoil = false;
    emp.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.emissive.getHex() === cyanHex) hasElectricCyanOrb = true;
        if (child.material.color.getHex() === copperHex) hasCopperCoil = true;
      }
    });
    expect(hasElectricCyanOrb).toBe(true);
    expect(hasCopperCoil).toBe(true);
    assertFiniteBox(emp);
    disposeObject3D(emp);

    // CharacterAnimator poses both as throwables and VFXManager skips brass casings
    const animator = new CharacterAnimator();
    const rig = new CharacterRig();
    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'port_a_bunker', isAiming: true }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('port_a_bunker');
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.5);

    animator.update(
      rig,
      makeRenderState({ animState: 'idle', weaponId: 'emp_grenade', isAiming: true }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('emp_grenade');
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.5);
    assertFiniteBox(rig.getGroup());
    rig.dispose();

    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.4 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'port_a_bunker',
    });
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.4 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'emp_grenade',
    });
    expect(vfx.getActiveCasingCount()).toBe(0);
    vfx.dispose();
  });

  it('attaches mod_red_dot, mod_suppressor, mod_drum_mag, and mod_foregrip idempotently via applyWeaponModsToModel and CharacterRig', () => {
    expect(WEAPON_MODS).toHaveLength(4);
    const allMods: WeaponModId[] = ['red_dot', 'suppressor', 'drum_mag', 'foregrip'];
    const ar = createWeaponModel('ar');
    const baseMeshCount = countMeshes(ar);

    // Attach all 4 distinct attachment sub-meshes
    applyWeaponModsToModel(ar, allMods);
    const moddedMeshCount = countMeshes(ar);
    expect(moddedMeshCount).toBeGreaterThan(baseMeshCount);

    for (const modId of allMods) {
      const modNode = ar.getObjectByName(`mod_${modId}`);
      expect(modNode).toBeDefined();
      expect(countMeshes(modNode!)).toBeGreaterThanOrEqual(2);
      assertFiniteBox(modNode!);
      modNode!.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          expect(child.castShadow).toBe(true);
          expect(child.userData.wrapTarget).toBe(false);
        }
      });
    }

    // Verify distinctive attachment properties (emissive optic dot, matte dark suppressor cylinder, twin drums, angled foregrip)
    const redDot = ar.getObjectByName('mod_red_dot')!;
    let hasRedReticle = false;
    redDot.traverse((c) => {
      if (
        c instanceof THREE.Mesh &&
        c.material instanceof THREE.MeshStandardMaterial &&
        c.material.emissive.getHex() === new THREE.Color('#ef4444').getHex()
      ) {
        hasRedReticle = true;
      }
    });
    expect(hasRedReticle).toBe(true);

    const suppressor = ar.getObjectByName('mod_suppressor')!;
    let suppressorCylinders = 0;
    suppressor.traverse((c) => {
      if (c instanceof THREE.Mesh && c.geometry instanceof THREE.CylinderGeometry) {
        suppressorCylinders++;
      }
    });
    expect(suppressorCylinders).toBeGreaterThanOrEqual(2);
    expect(suppressor.position.z).toBeGreaterThanOrEqual((ar.userData.muzzleOffset as THREE.Vector3).z);

    const drumMag = ar.getObjectByName('mod_drum_mag')!;
    let drumCylinders = 0;
    drumMag.traverse((c) => {
      if (c instanceof THREE.Mesh && c.geometry instanceof THREE.CylinderGeometry) {
        drumCylinders++;
      }
    });
    expect(drumCylinders).toBeGreaterThanOrEqual(4); // 2 outer drums + 2 faceplates

    const foregrip = ar.getObjectByName('mod_foregrip')!;
    expect(foregrip.position.z).toBeGreaterThan(0.15);

    // Re-calling with identical (even duplicated) mods is strictly idempotent
    applyWeaponModsToModel(ar, ['red_dot', 'suppressor', 'drum_mag', 'foregrip', 'red_dot']);
    expect(countMeshes(ar)).toBe(moddedMeshCount);

    // Wrap application preserves mod sub-mesh materials
    applyWeaponWrap(ar, 'midas_gold');
    const goldMat = getWeaponWrapMaterial('midas_gold');
    for (const modId of allMods) {
      ar.getObjectByName(`mod_${modId}`)!.traverse((c) => {
        if (c instanceof THREE.Mesh) expect(c.material).not.toBe(goldMat);
      });
    }

    // Changing mods removes stale mod children cleanly
    applyWeaponModsToModel(ar, ['suppressor']);
    expect(ar.getObjectByName('mod_suppressor')).toBeDefined();
    expect(ar.getObjectByName('mod_red_dot')).toBeUndefined();
    expect(ar.getObjectByName('mod_drum_mag')).toBeUndefined();
    expect(ar.getObjectByName('mod_foregrip')).toBeUndefined();

    // Clearing mods restores exact base mesh count
    applyWeaponModsToModel(ar, []);
    expect(countMeshes(ar)).toBe(baseMeshCount);
    expect(ar.getObjectByName('mod_suppressor')).toBeUndefined();
    disposeObject3D(ar);

    // CharacterRig & CharacterAnimator forward state.weaponMods to held firearms & clean up when switching
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();

    rig.updateFromState(makeRenderState({ weaponId: 'ar', weaponMods: ['red_dot', 'foregrip'] }));
    const activeAr = rig.getActiveWeaponGroup()!;
    expect(activeAr.name).toBe('weapon_ar');
    expect(activeAr.getObjectByName('mod_red_dot')).toBeDefined();
    expect(activeAr.getObjectByName('mod_foregrip')).toBeDefined();
    expect(activeAr.getObjectByName('mod_suppressor')).toBeUndefined();

    // Updating mods on same firearm removes stale mods and attaches new ones
    animator.update(
      rig,
      makeRenderState({ weaponId: 'ar', weaponMods: ['suppressor', 'drum_mag'] }),
      0.05,
    );
    expect(activeAr.getObjectByName('mod_red_dot')).toBeUndefined();
    expect(activeAr.getObjectByName('mod_foregrip')).toBeUndefined();
    expect(activeAr.getObjectByName('mod_suppressor')).toBeDefined();
    expect(activeAr.getObjectByName('mod_drum_mag')).toBeDefined();

    // Switching to an unmodded SMG does not inherit previous weapon's mods
    rig.updateFromState(makeRenderState({ weaponId: 'smg' }));
    const activeSmg = rig.getActiveWeaponGroup()!;
    expect(activeSmg.name).toBe('weapon_smg');
    expect(activeSmg.getObjectByName('mod_suppressor')).toBeUndefined();
    expect(activeSmg.getObjectByName('mod_drum_mag')).toBeUndefined();

    // Non-firearms (pickaxe / build blueprint) ignore firearm mods cleanly
    rig.updateFromState(makeRenderState({ weaponId: 'pickaxe', weaponMods: ['red_dot'] }));
    expect(rig.getActiveWeaponGroup()!.getObjectByName('mod_red_dot')).toBeUndefined();

    rig.dispose();
  });

  it('renders clean cyan friendly ally chevron for team_blue without cluttering team_red enemies', () => {
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();
    const cyanHex = new THREE.Color('#22d3ee').getHex();

    // team_red enemy starts clean with zero ally aura clutter
    rig.updateFromState(makeRenderState({ teamId: 'team_red' }));
    expect(rig.isAllyAuraEnabled()).toBe(false);
    expect(rig.getGroup().getObjectByName('ally_tactical_aura')).toBeUndefined();

    // team_blue ally displays hovering cyan ally chevron
    rig.updateFromState(makeRenderState({ teamId: 'team_blue' }));
    expect(rig.isAllyAuraEnabled()).toBe(true);
    const aura = rig.getGroup().getObjectByName('ally_tactical_aura') as THREE.Group;
    const chevron = rig.getGroup().getObjectByName('ally_tactical_chevron') as THREE.Group;
    const roleRing = rig.getGroup().getObjectByName('ally_role_ring') as THREE.Mesh;
    expect(aura).toBeInstanceOf(THREE.Group);
    expect(chevron).toBeInstanceOf(THREE.Group);
    expect(aura.visible).toBe(true);
    expect(aura.position.y).toBeGreaterThan(1.85);
    expect((roleRing.material as THREE.MeshStandardMaterial).color.getHex()).toBe(cyanHex);

    let hasCyanChevronMesh = false;
    chevron.traverse((c) => {
      if (
        c instanceof THREE.Mesh &&
        c.material instanceof THREE.MeshStandardMaterial &&
        c.material.color.getHex() === cyanHex
      ) {
        hasCyanChevronMesh = true;
      }
    });
    expect(hasCyanChevronMesh).toBe(true);

    // CharacterAnimator advances chevron animation for team_blue
    const rotStart = chevron.rotation.y;
    for (let i = 0; i < 6; i++) {
      animator.update(rig, makeRenderState({ animState: 'run', teamId: 'team_blue' }), 0.05);
    }
    expect(chevron.rotation.y).toBeGreaterThan(rotStart);

    // Switching to team_red enemy hides chevron cleanly
    animator.update(rig, makeRenderState({ animState: 'run', teamId: 'team_red' }), 0.05);
    expect(rig.isAllyAuraEnabled()).toBe(false);
    expect(aura.visible).toBe(false);

    rig.dispose();
  });

  it('spawns, updates, expires, guards NaN/range, clears, and disposes all 4 Wave-8 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:bunker_deploy
    bus.emit('vfx:bunker_deploy', { position: { x: 6, y: 0, z: -8 } });
    expect(vfx.getBunkerDeployEffectCount()).toBe(1);

    // 2. vfx:emp_blast
    bus.emit('vfx:emp_blast', { position: { x: -5, y: 0.4, z: 7 }, radius: 6.5 });
    expect(vfx.getEmpBlastEffectCount()).toBe(1);

    // 3. vfx:weapon_mod (test across mod types)
    bus.emit('vfx:weapon_mod', { position: { x: 2, y: 1.1, z: 3 }, modId: 'drum_mag' });
    expect(vfx.getWeaponModEffectCount()).toBe(1);

    // 4. vfx:forecast_pulse
    bus.emit('vfx:forecast_pulse', { position: { x: -12, y: 2.0, z: -15 } });
    expect(vfx.getForecastPulseEffectCount()).toBe(1);

    expect(vfx.getActiveEffectCount()).toBe(4);

    // Advance 0.3s -> all 4 remain active and transforms stay finite
    for (let i = 0; i < 6; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getBunkerDeployEffectCount()).toBe(1);
    expect(vfx.getEmpBlastEffectCount()).toBe(1);
    expect(vfx.getWeaponModEffectCount()).toBe(1);
    expect(vfx.getForecastPulseEffectCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(4);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // Advance past 0.85s -> bunker_deploy (0.78s), emp_blast (0.68s), weapon_mod (0.75s) expire while forecast_pulse (1.25s) stays active
    for (let i = 0; i < 11; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getBunkerDeployEffectCount()).toBe(0);
    expect(vfx.getEmpBlastEffectCount()).toBe(0);
    expect(vfx.getWeaponModEffectCount()).toBe(0);
    expect(vfx.getForecastPulseEffectCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(1);

    // Advance past 1.25s -> forecast_pulse expires cleanly
    for (let i = 0; i < 10; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getForecastPulseEffectCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Strict NaN / Infinity position guards
    bus.emit('vfx:bunker_deploy', { position: { x: Number.NaN, y: 0, z: 0 } });
    bus.emit('vfx:emp_blast', {
      position: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
      radius: 6.5,
    });
    bus.emit('vfx:weapon_mod', {
      position: { x: 0, y: 0, z: Number.NEGATIVE_INFINITY },
      modId: 'red_dot',
    });
    bus.emit('vfx:forecast_pulse', { position: { x: Number.NaN, y: 1, z: 1 } });
    expect(vfx.getBunkerDeployEffectCount()).toBe(0);
    expect(vfx.getEmpBlastEffectCount()).toBe(0);
    expect(vfx.getWeaponModEffectCount()).toBe(0);
    expect(vfx.getForecastPulseEffectCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Invalid EMP radius clamped cleanly without NaN transforms
    bus.emit('vfx:emp_blast', { position: { x: 1, y: 1, z: 1 }, radius: -10 });
    bus.emit('vfx:emp_blast', { position: { x: 2, y: 1, z: 2 }, radius: Number.NaN });
    expect(vfx.getEmpBlastEffectCount()).toBe(2);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // clear() resets all 4 Wave-8 pools immediately
    bus.emit('vfx:bunker_deploy', { position: { x: 0, y: 0, z: 0 } });
    bus.emit('vfx:weapon_mod', { position: { x: 0, y: 1, z: 0 }, modId: 'suppressor' });
    bus.emit('vfx:forecast_pulse', { position: { x: 4, y: 0, z: 4 } });
    expect(vfx.getActiveEffectCount()).toBe(5);
    vfx.clear();
    expect(vfx.getBunkerDeployEffectCount()).toBe(0);
    expect(vfx.getEmpBlastEffectCount()).toBe(0);
    expect(vfx.getWeaponModEffectCount()).toBe(0);
    expect(vfx.getForecastPulseEffectCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all 4 Wave-8 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:bunker_deploy', { position: { x: 0, y: 0, z: 0 } });
    bus.emit('vfx:emp_blast', { position: { x: 0, y: 0, z: 0 }, radius: 6.5 });
    bus.emit('vfx:weapon_mod', { position: { x: 0, y: 1, z: 0 }, modId: 'foregrip' });
    bus.emit('vfx:forecast_pulse', { position: { x: 0, y: 0, z: 0 } });
    expect(vfx.getBunkerDeployEffectCount()).toBe(0);
    expect(vfx.getEmpBlastEffectCount()).toBe(0);
    expect(vfx.getWeaponModEffectCount()).toBe(0);
    expect(vfx.getForecastPulseEffectCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});

describe('Wave-9 Skyforge Jetpack, Plasma Flamethrower, Low-G Boot Aura, Burning Embers & VFX Channels', () => {
  it("builds bespoke Skyforge Jetpack and Dragon's Breath Plasma Flamethrower models with muzzleOffset, wrap targets, and zero casing ejection", () => {
    const jetpack = createWeaponModel('jetpack');
    expect(jetpack.name).toBe('weapon_jetpack');
    expect(jetpack.userData.wrapDisabled).toBe(true);
    expect(isRangedWeapon('jetpack')).toBe(false);
    expect(isThrowableWeapon('jetpack')).toBe(false);
    expect(hasMuzzleOffset('jetpack')).toBe(false);
    expect(countMeshes(jetpack)).toBeGreaterThanOrEqual(12);
    assertFiniteBox(jetpack);
    disposeObject3D(jetpack);

    const flamer = createWeaponModel('plasma_flamethrower');
    expect(flamer.name).toBe('weapon_plasma_flamethrower');
    expect(isRangedWeapon('plasma_flamethrower')).toBe(true);
    expect(hasMuzzleOffset('plasma_flamethrower')).toBe(true);
    expect(countMeshes(flamer)).toBeGreaterThanOrEqual(18);
    const flamerMuzzle = flamer.userData.muzzleOffset as THREE.Vector3;
    expect(flamerMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(flamerMuzzle.z).toBeGreaterThan(0.5);

    const orangeHex = new THREE.Color('#f97316').getHex();
    const canisterRedHex = new THREE.Color('#dc2626').getHex();
    const cyanHex = new THREE.Color('#22d3ee').getHex();
    let hasPilotFlame = false;
    let hasCanister = false;
    let hasCyanPlasma = false;
    let wrapTargets = 0;

    flamer.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) wrapTargets++;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.color.getHex() === orangeHex) hasPilotFlame = true;
        if (child.material.color.getHex() === canisterRedHex) hasCanister = true;
        if (child.material.emissive.getHex() === cyanHex) hasCyanPlasma = true;
      }
    });
    expect(hasPilotFlame).toBe(true);
    expect(hasCanister).toBe(true);
    expect(hasCyanPlasma).toBe(true);
    expect(wrapTargets).toBeGreaterThanOrEqual(3);

    applyWeaponWrap(flamer, 'neon_cyber');
    const neonMat = getWeaponWrapMaterial('neon_cyber');
    let wrappedCount = 0;
    flamer.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) {
        expect(child.material).toBe(neonMat);
        wrappedCount++;
      } else {
        expect(child.material).not.toBe(neonMat);
      }
    });
    expect(wrappedCount).toBe(wrapTargets);
    assertFiniteBox(flamer);
    disposeObject3D(flamer);

    // Muzzle flash for plasma_flamethrower emits fiery orange flash WITHOUT brass casing ejection
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.35, z: 0.65 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'plasma_flamethrower',
    });
    expect(vfx.getActiveCasingCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(1);
    vfx.dispose();
  });

  it('toggles, animates, and disposes Back-Mounted 3D Skyforge Jetpack and thrust flame cones via CharacterRig and CharacterAnimator', () => {
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();

    expect(rig.hasJetpackEquipped()).toBe(false);
    expect(rig.isJetpackFlameVisible()).toBe(false);
    expect(rig.getJetpackBackGroup()).toBeNull();

    // Thrust flag without hasJetpack does not activate flames
    rig.updateFromState(makeRenderState({ hasJetpack: false, isJetpackThrusting: true }));
    expect(rig.hasJetpackEquipped()).toBe(false);
    expect(rig.isJetpackFlameVisible()).toBe(false);

    // Equipping jetpack attaches jetpack_back_group to chest torso back and hides flame cones while idle
    rig.updateFromState(makeRenderState({ hasJetpack: true, isJetpackThrusting: false }));
    expect(rig.hasJetpackEquipped()).toBe(true);
    expect(rig.isJetpackFlameVisible()).toBe(false);
    expect(rig.joints.backblingSocket.visible).toBe(false);

    const jetpackGrp = rig.joints.chest.getObjectByName('jetpack_back_group') as THREE.Group;
    expect(jetpackGrp).toBeInstanceOf(THREE.Group);
    expect(jetpackGrp.visible).toBe(true);
    expect(countMeshes(jetpackGrp)).toBeGreaterThanOrEqual(16);

    const flameGrp = jetpackGrp.getObjectByName('jetpack_flame_group') as THREE.Group;
    expect(flameGrp).toBeInstanceOf(THREE.Group);
    expect(flameGrp.visible).toBe(false);
    assertFiniteBox(rig.getGroup());

    // Activating thrust flares twin flame cones brightly and animates across CharacterAnimator ticks
    animator.update(
      rig,
      makeRenderState({
        animState: 'jump',
        grounded: false,
        velocityY: 6.2,
        hasJetpack: true,
        isJetpackThrusting: true,
        weaponId: 'plasma_flamethrower',
      }),
      0.03,
    );
    expect(rig.hasJetpackEquipped()).toBe(true);
    expect(rig.isJetpackFlameVisible()).toBe(true);
    expect(flameGrp.visible).toBe(true);

    const firstFlameMesh = flameGrp.children[0] as THREE.Mesh;
    const scaleA = firstFlameMesh.scale.y;
    animator.update(
      rig,
      makeRenderState({
        animState: 'jump',
        grounded: false,
        velocityY: 7.5,
        hasJetpack: true,
        isJetpackThrusting: true,
        weaponId: 'plasma_flamethrower',
      }),
      0.04,
    );
    const scaleB = firstFlameMesh.scale.y;
    expect(scaleB).not.toBeCloseTo(scaleA, 4);
    assertFiniteBox(rig.getGroup());

    // Unequipping jetpack hides pack & flames and restores backbling & standard bounds
    animator.update(
      rig,
      makeRenderState({ animState: 'idle', hasJetpack: false, isJetpackThrusting: false }),
      0,
    );
    expect(rig.hasJetpackEquipped()).toBe(false);
    expect(rig.isJetpackFlameVisible()).toBe(false);
    expect(jetpackGrp.visible).toBe(false);
    expect(flameGrp.visible).toBe(false);
    expect(rig.joints.backblingSocket.visible).toBe(true);
    const normalBox = assertFiniteBox(rig.getGroup());
    expect(normalBox.max.y - normalBox.min.y).toBeLessThan(1.98);

    rig.dispose();
    expect(rig.joints.chest.getObjectByName('jetpack_back_group')).toBeUndefined();
  });

  it('renders and animates Violet Low-Gravity Boot Aura and Burning Flame Ember tinting cleanly', () => {
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();

    expect(rig.hasLowGravityBuff()).toBe(false);
    expect(rig.isBurningActive()).toBe(false);

    // Measure baseline chest emissive intensity
    const chestVisual = rig.joints.chest.getObjectByName('chest_visual') as THREE.Group;
    const chestMesh = chestVisual.children[0] as THREE.Mesh;
    const chestMat = chestMesh.material as THREE.MeshStandardMaterial;
    const baseEmissiveIntensity = chestMat.emissiveIntensity;

    // Enable Low-Gravity Boot Aura + Burning Ember tinting via CharacterAnimator
    animator.update(
      rig,
      makeRenderState({
        animState: 'jump',
        grounded: false,
        hasLowGravityBuff: true,
        isBurning: true,
      }),
      0.04,
    );
    expect(rig.hasLowGravityBuff()).toBe(true);
    expect(rig.isBurningActive()).toBe(true);

    const bootAuras = rig.getLowGravityBootAuras();
    expect(bootAuras).toHaveLength(2);
    expect(bootAuras[0].visible).toBe(true);
    expect(bootAuras[1].visible).toBe(true);
    expect(countMeshes(bootAuras[0])).toBeGreaterThanOrEqual(6);

    const emberGrp = rig.getBurningEmberGroup();
    expect(emberGrp).toBeInstanceOf(THREE.Group);
    expect(emberGrp!.visible).toBe(true);
    expect(chestMat.emissiveIntensity).toBeGreaterThan(baseEmissiveIntensity + 0.15);

    const bootBox = assertFiniteBox(rig.getGroup());
    expect(bootBox.min.y).toBeCloseTo(0, 1);

    // Stepping animation moves low-G boot motes cleanly
    const moteBeforeY = bootAuras[0].children[2].position.y;
    animator.update(
      rig,
      makeRenderState({
        animState: 'jump',
        grounded: false,
        hasLowGravityBuff: true,
        isBurning: true,
      }),
      0.06,
    );
    expect(bootAuras[0].children[2].position.y).not.toBeCloseTo(moteBeforeY, 3);

    // Disabling both restores base emissives and hides boot & ember visuals cleanly
    animator.update(
      rig,
      makeRenderState({ animState: 'idle', hasLowGravityBuff: false, isBurning: false }),
      0.05,
    );
    expect(rig.hasLowGravityBuff()).toBe(false);
    expect(rig.isBurningActive()).toBe(false);
    expect(bootAuras[0].visible).toBe(false);
    expect(bootAuras[1].visible).toBe(false);
    expect(emberGrp!.visible).toBe(false);
    expect(chestMat.emissiveIntensity).toBeCloseTo(baseEmissiveIntensity, 4);

    rig.dispose();
    expect(rig.joints.leftFoot.getObjectByName('low_gravity_boot_aura_0')).toBeUndefined();
    expect(rig.joints.chest.getObjectByName('burning_ember_aura')).toBeUndefined();
  });

  it('spawns, updates, expires, guards NaN/range, clears, and disposes all 4 Wave-9 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:jetpack_flame
    bus.emit('vfx:jetpack_flame', {
      position: { x: 2, y: 4.5, z: -3 },
      direction: { x: 0, y: -1, z: 0 },
      intensity: 1.2,
    });
    expect(vfx.getActiveJetpackFlameCount()).toBe(1);

    // 2. vfx:flame_stream
    bus.emit('vfx:flame_stream', {
      origin: { x: 0, y: 1.4, z: 0.7 },
      direction: { x: 0, y: 0, z: 1 },
      range: 16,
    });
    expect(vfx.getActiveFlameStreamCount()).toBe(1);

    // 3. vfx:meteor_strike
    bus.emit('vfx:meteor_strike', {
      position: { x: -18, y: 0, z: 22 },
      radius: 12,
    });
    expect(vfx.getActiveMeteorStrikeCount()).toBe(1);

    // 4. vfx:hop_crystal_aura
    bus.emit('vfx:hop_crystal_aura', {
      position: { x: 5, y: 0, z: 5 },
    });
    expect(vfx.getActiveHopCrystalAuraCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(4);

    // Advance 0.20s -> meteor descending with trail, all 4 active and finite
    for (let i = 0; i < 4; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveEffectCount()).toBe(4);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // Advance past 0.30s -> jetpack_flame (0.26s) expires
    vfx.update(0.05);
    vfx.update(0.05);
    expect(vfx.getActiveJetpackFlameCount()).toBe(0);
    expect(vfx.getActiveFlameStreamCount()).toBe(1);
    expect(vfx.getActiveMeteorStrikeCount()).toBe(1);
    expect(vfx.getActiveHopCrystalAuraCount()).toBe(1);

    // Advance past 0.40s -> flame_stream (0.36s) expires; meteor_strike shock ring expanding
    vfx.update(0.05);
    vfx.update(0.05);
    expect(vfx.getActiveFlameStreamCount()).toBe(0);
    expect(vfx.getActiveMeteorStrikeCount()).toBe(1);
    expect(vfx.getActiveHopCrystalAuraCount()).toBe(1);

    // Advance past 1.00s -> hop_crystal_aura (0.95s) expires; meteor_strike still active
    for (let i = 0; i < 12; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveHopCrystalAuraCount()).toBe(0);
    expect(vfx.getActiveMeteorStrikeCount()).toBe(1);

    // Advance past 1.50s -> meteor_strike (1.45s) expires cleanly back to pool
    for (let i = 0; i < 10; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveMeteorStrikeCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Strict NaN / Infinity position guards
    bus.emit('vfx:jetpack_flame', {
      position: { x: Number.NaN, y: 1, z: 1 },
      direction: { x: 0, y: -1, z: 0 },
      intensity: 1,
    });
    bus.emit('vfx:flame_stream', {
      origin: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
      range: 14,
    });
    bus.emit('vfx:meteor_strike', {
      position: { x: 0, y: 0, z: Number.NEGATIVE_INFINITY },
      radius: 10,
    });
    bus.emit('vfx:hop_crystal_aura', {
      position: { x: Number.NaN, y: 0, z: 0 },
    });
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Zero-length directions & negative/NaN intensity/range/radius safely clamped without NaN transforms
    bus.emit('vfx:jetpack_flame', {
      position: { x: 1, y: 2, z: 3 },
      direction: { x: 0, y: 0, z: 0 },
      intensity: Number.NaN,
    });
    bus.emit('vfx:flame_stream', {
      origin: { x: 1, y: 1, z: 1 },
      direction: { x: 0, y: 0, z: 0 },
      range: -5,
    });
    bus.emit('vfx:meteor_strike', {
      position: { x: 4, y: 0, z: 4 },
      radius: -20,
    });
    expect(vfx.getActiveJetpackFlameCount()).toBe(1);
    expect(vfx.getActiveFlameStreamCount()).toBe(1);
    expect(vfx.getActiveMeteorStrikeCount()).toBe(1);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // clear() resets all 4 Wave-9 pools immediately
    bus.emit('vfx:hop_crystal_aura', { position: { x: 0, y: 0, z: 0 } });
    expect(vfx.getActiveEffectCount()).toBe(4);
    vfx.clear();
    expect(vfx.getActiveJetpackFlameCount()).toBe(0);
    expect(vfx.getActiveFlameStreamCount()).toBe(0);
    expect(vfx.getActiveMeteorStrikeCount()).toBe(0);
    expect(vfx.getActiveHopCrystalAuraCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all 4 Wave-9 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:jetpack_flame', {
      position: { x: 0, y: 2, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      intensity: 1,
    });
    bus.emit('vfx:flame_stream', {
      origin: { x: 0, y: 1, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
      range: 14,
    });
    bus.emit('vfx:meteor_strike', { position: { x: 0, y: 0, z: 0 }, radius: 10 });
    bus.emit('vfx:hop_crystal_aura', { position: { x: 0, y: 0, z: 0 } });
    expect(vfx.getActiveJetpackFlameCount()).toBe(0);
    expect(vfx.getActiveFlameStreamCount()).toBe(0);
    expect(vfx.getActiveMeteorStrikeCount()).toBe(0);
    expect(vfx.getActiveHopCrystalAuraCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});

describe('Wave-10 Titan Shockwave Hammer, Recon Flare Gun, Stances & VFX Channels', () => {
  it('builds bespoke Shockwave Hammer and Flare Gun models with muzzleOffset, wrap rules, and zero casing ejection', () => {
    const hammer = createWeaponModel('shockwave_hammer');
    expect(hammer.name).toBe('weapon_shockwave_hammer');
    expect(hammer.userData.wrapDisabled).toBe(true);
    expect(isRangedWeapon('shockwave_hammer')).toBe(false);
    expect(isThrowableWeapon('shockwave_hammer')).toBe(false);
    expect(hasMuzzleOffset('shockwave_hammer')).toBe(false);
    expect(countMeshes(hammer)).toBeGreaterThanOrEqual(20);

    const violetSteelHex = new THREE.Color('#4c1d95').getHex();
    const cyanHex = new THREE.Color('#22d3ee').getHex();
    let hasVioletSteel = false;
    let hasCyanCore = false;
    hammer.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.color.getHex() === violetSteelHex) hasVioletSteel = true;
        if (child.material.emissive.getHex() === cyanHex) hasCyanCore = true;
      }
    });
    expect(hasVioletSteel).toBe(true);
    expect(hasCyanCore).toBe(true);

    // Shockwave Hammer preserves its violet-steel & cyan plasma finishes when wraps are applied
    applyWeaponWrap(hammer, 'midas_gold');
    const goldMat = getWeaponWrapMaterial('midas_gold');
    hammer.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        expect(child.material).not.toBe(goldMat);
      }
    });
    expect(hammer.userData.appliedWrapId).toBeUndefined();
    assertFiniteBox(hammer);
    disposeObject3D(hammer);

    const flareGun = createWeaponModel('flare_gun');
    expect(flareGun.name).toBe('weapon_flare_gun');
    expect(isRangedWeapon('flare_gun')).toBe(true);
    expect(isThrowableWeapon('flare_gun')).toBe(false);
    expect(hasMuzzleOffset('flare_gun')).toBe(true);
    expect(countMeshes(flareGun)).toBeGreaterThanOrEqual(12);
    const flareMuzzle = flareGun.userData.muzzleOffset as THREE.Vector3;
    expect(flareMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(flareMuzzle.z).toBeGreaterThan(0.2);

    const signalOrangeHex = new THREE.Color('#f97316').getHex();
    const emberYellowHex = new THREE.Color('#fde047').getHex();
    let hasSignalOrange = false;
    let hasGlowingEmber = false;
    let flareWrapTargets = 0;
    flareGun.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) flareWrapTargets++;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.color.getHex() === signalOrangeHex) hasSignalOrange = true;
        if (
          child.material.emissive.getHex() === signalOrangeHex ||
          child.material.emissive.getHex() === emberYellowHex
        ) {
          hasGlowingEmber = true;
        }
      }
    });
    expect(hasSignalOrange).toBe(true);
    expect(hasGlowingEmber).toBe(true);
    expect(flareWrapTargets).toBeGreaterThanOrEqual(2);

    applyWeaponWrap(flareGun, 'neon_cyber');
    const neonMat = getWeaponWrapMaterial('neon_cyber');
    let wrappedCount = 0;
    flareGun.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) {
        expect(child.material).toBe(neonMat);
        wrappedCount++;
      } else {
        expect(child.material).not.toBe(neonMat);
      }
    });
    expect(wrappedCount).toBe(flareWrapTargets);
    assertFiniteBox(flareGun);
    disposeObject3D(flareGun);

    // Flare gun muzzle flash emits signal-orange flash WITHOUT brass casing ejection
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.4 },
      direction: { x: 0, y: 0.25, z: 0.96 },
      weaponId: 'flare_gun',
    });
    expect(vfx.getActiveCasingCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(1);
    vfx.dispose();
  });

  it('animates Shockwave Hammer two-handed carry/slam stances and Flare Gun pistol stance cleanly', () => {
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();

    // 1. Shockwave Hammer heavy two-handed carry stance (idle)
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'shockwave_hammer',
        animState: 'idle',
        isAiming: false,
        isFiring: false,
      }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('shockwave_hammer');
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.5);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.5);
    expect(rig.joints.rightElbow.rotation.x).toBeLessThan(-0.7);
    expect(rig.joints.leftElbow.rotation.x).toBeLessThan(-0.7);
    assertFiniteBox(rig.getGroup());

    // 2. Shockwave Hammer heavy two-handed sprint carry
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'shockwave_hammer',
        animState: 'sprint',
        moveSpeed: 8.5,
        isAiming: false,
        isFiring: false,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.5);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.5);
    assertFiniteBox(rig.getGroup());

    // 3. Shockwave Hammer heavy two-handed slam wind-up / firing swing
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'shockwave_hammer',
        animState: 'idle',
        isAiming: true,
        isFiring: false,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.2);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-1.2);

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'shockwave_hammer',
        animState: 'idle',
        isFiring: true,
      }),
      0,
    );
    const slamStartRight = rig.joints.rightShoulder.rotation.x;
    const slamStartLeft = rig.joints.leftShoulder.rotation.x;
    expect(slamStartRight).toBeLessThan(-1.2);
    expect(slamStartLeft).toBeLessThan(-1.2);

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'shockwave_hammer',
        animState: 'harvest',
        harvestSwingTimer: 0.3,
      }),
      0.08,
    );
    expect(rig.joints.rightShoulder.rotation.x).not.toBeCloseTo(slamStartRight, 2);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.4);
    assertFiniteBox(rig.getGroup());

    // 4. Flare Gun pistol stance (one-handed ready -> two-handed aimed support grip)
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'flare_gun',
        animState: 'idle',
        isAiming: false,
        isFiring: false,
      }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('flare_gun');
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.8);
    expect(rig.joints.leftShoulder.rotation.x).toBeGreaterThan(-0.5);

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'flare_gun',
        animState: 'idle',
        isAiming: true,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.9);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.8);
    expect(rig.joints.leftShoulder.rotation.y).toBeLessThan(-0.4);

    const muzzlePos = rig.getMuzzleWorldPosition();
    expect(Number.isFinite(muzzlePos.x)).toBe(true);
    expect(Number.isFinite(muzzlePos.y)).toBe(true);
    expect(Number.isFinite(muzzlePos.z)).toBe(true);
    expect(muzzlePos.z).toBeGreaterThan(0.25);

    rig.dispose();
  });

  it('spawns, updates, expires, guards NaN/range, clears, and disposes all 4 Wave-10 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:hammer_slam
    bus.emit('vfx:hammer_slam', {
      position: { x: 4, y: 0, z: -6 },
      radius: 5.5,
    });
    expect(vfx.getActiveHammerSlamCount()).toBe(1);

    // 2. vfx:hammer_bounce
    bus.emit('vfx:hammer_bounce', {
      position: { x: -3, y: 0.2, z: 5 },
    });
    expect(vfx.getActiveHammerBounceCount()).toBe(1);

    // 3. vfx:flare_trail
    bus.emit('vfx:flare_trail', {
      origin: { x: 0, y: 1.6, z: 0 },
      target: { x: 18, y: 24, z: -12 },
      radius: 75,
    });
    expect(vfx.getActiveFlareTrailCount()).toBe(1);

    // 4. vfx:water_wake
    bus.emit('vfx:water_wake', {
      position: { x: -20, y: 0, z: 30 },
      yaw: 0.75,
      speed: 22,
    });
    expect(vfx.getActiveWaterWakeCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(4);

    // Advance 0.30s -> all 4 remain active with finite transforms
    for (let i = 0; i < 6; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveHammerSlamCount()).toBe(1);
    expect(vfx.getActiveHammerBounceCount()).toBe(1);
    expect(vfx.getActiveFlareTrailCount()).toBe(1);
    expect(vfx.getActiveWaterWakeCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(4);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // Advance to 0.65s -> hammer_bounce (0.64s) expires
    for (let i = 0; i < 7; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveHammerBounceCount()).toBe(0);
    expect(vfx.getActiveWaterWakeCount()).toBe(1);
    expect(vfx.getActiveHammerSlamCount()).toBe(1);
    expect(vfx.getActiveFlareTrailCount()).toBe(1);

    // Advance to 0.75s -> water_wake (0.72s) expires
    vfx.update(0.05);
    vfx.update(0.05);
    expect(vfx.getActiveWaterWakeCount()).toBe(0);
    expect(vfx.getActiveHammerSlamCount()).toBe(1);
    expect(vfx.getActiveFlareTrailCount()).toBe(1);

    // Advance to 0.85s -> hammer_slam (0.78s) expires; flare_trail stays active
    vfx.update(0.05);
    vfx.update(0.05);
    expect(vfx.getActiveHammerSlamCount()).toBe(0);
    expect(vfx.getActiveFlareTrailCount()).toBe(1);

    // Advance past 1.20s -> flare_trail (1.15s) expires cleanly back to pool
    for (let i = 0; i < 7; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveFlareTrailCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Strict NaN / Infinity guards
    bus.emit('vfx:hammer_slam', {
      position: { x: Number.NaN, y: 0, z: 0 },
      radius: 5.5,
    });
    bus.emit('vfx:hammer_bounce', {
      position: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
    });
    bus.emit('vfx:flare_trail', {
      origin: { x: Number.NaN, y: 1, z: 0 },
      target: { x: 10, y: 10, z: 10 },
      radius: 75,
    });
    bus.emit('vfx:flare_trail', {
      origin: { x: 0, y: 1, z: 0 },
      target: { x: 10, y: 10, z: Number.NEGATIVE_INFINITY },
      radius: 75,
    });
    bus.emit('vfx:water_wake', {
      position: { x: 0, y: 0, z: Number.NaN },
      yaw: 0,
      speed: 12,
    });
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Zero-length flare origin==target & invalid radius/yaw/speed safely clamped without NaN transforms
    bus.emit('vfx:hammer_slam', {
      position: { x: 2, y: 0, z: 2 },
      radius: -15,
    });
    bus.emit('vfx:flare_trail', {
      origin: { x: 5, y: 10, z: 5 },
      target: { x: 5, y: 10, z: 5 },
      radius: Number.NaN,
    });
    bus.emit('vfx:water_wake', {
      position: { x: 8, y: 0, z: 8 },
      yaw: Number.NaN,
      speed: -10,
    });
    expect(vfx.getActiveHammerSlamCount()).toBe(1);
    expect(vfx.getActiveFlareTrailCount()).toBe(1);
    expect(vfx.getActiveWaterWakeCount()).toBe(1);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // clear() resets all 4 Wave-10 pools immediately
    bus.emit('vfx:hammer_bounce', { position: { x: 0, y: 0, z: 0 } });
    expect(vfx.getActiveEffectCount()).toBe(4);
    vfx.clear();
    expect(vfx.getActiveHammerSlamCount()).toBe(0);
    expect(vfx.getActiveHammerBounceCount()).toBe(0);
    expect(vfx.getActiveFlareTrailCount()).toBe(0);
    expect(vfx.getActiveWaterWakeCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all 4 Wave-10 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:hammer_slam', { position: { x: 0, y: 0, z: 0 }, radius: 5.5 });
    bus.emit('vfx:hammer_bounce', { position: { x: 0, y: 0, z: 0 } });
    bus.emit('vfx:flare_trail', {
      origin: { x: 0, y: 1, z: 0 },
      target: { x: 10, y: 15, z: 10 },
      radius: 75,
    });
    bus.emit('vfx:water_wake', { position: { x: 0, y: 0, z: 0 }, yaw: 0, speed: 12 });
    expect(vfx.getActiveHammerSlamCount()).toBe(0);
    expect(vfx.getActiveHammerBounceCount()).toBe(0);
    expect(vfx.getActiveFlareTrailCount()).toBe(0);
    expect(vfx.getActiveWaterWakeCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});

describe('Wave-11 Sentry Auto-Turret, Exotic Chug Cannon, Launcher Stance & VFX Channels', () => {
  it('builds bespoke Sentry Auto-Turret briefcase and Exotic Chug Cannon launcher models with wrap rules, translucent canisters, and zero casing ejection', () => {
    const turret = createWeaponModel('auto_turret');
    expect(turret.name).toBe('weapon_auto_turret');
    expect(turret.userData.wrapDisabled).toBe(true);
    expect(isRangedWeapon('auto_turret')).toBe(false);
    expect(isThrowableWeapon('auto_turret')).toBe(true);
    expect(hasMuzzleOffset('auto_turret')).toBe(true);
    expect(countMeshes(turret)).toBeGreaterThanOrEqual(14);
    const turretMuzzle = turret.userData.muzzleOffset as THREE.Vector3;
    expect(turretMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(turretMuzzle.z).toBeGreaterThan(0.15);

    const cyanHex = new THREE.Color('#22d3ee').getHex();
    let hasCyanLockRing = false;
    let barrelCylinders = 0;
    turret.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (
        child.geometry instanceof THREE.TorusGeometry &&
        child.material instanceof THREE.MeshStandardMaterial &&
        child.material.emissive.getHex() === cyanHex
      ) {
        hasCyanLockRing = true;
      }
      if (child.geometry instanceof THREE.CylinderGeometry) {
        barrelCylinders++;
      }
    });
    expect(hasCyanLockRing).toBe(true);
    expect(barrelCylinders).toBeGreaterThanOrEqual(4);
    assertFiniteBox(turret);
    disposeObject3D(turret);

    const cannon = createWeaponModel('chug_cannon');
    expect(cannon.name).toBe('weapon_chug_cannon');
    expect(isRangedWeapon('chug_cannon')).toBe(true);
    expect(isThrowableWeapon('chug_cannon')).toBe(false);
    expect(hasMuzzleOffset('chug_cannon')).toBe(true);
    expect(countMeshes(cannon)).toBeGreaterThanOrEqual(20);
    const cannonMuzzle = cannon.userData.muzzleOffset as THREE.Vector3;
    expect(cannonMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(cannonMuzzle.z).toBeGreaterThan(0.45);

    let translucentCanisters = 0;
    let hasCyanGlow = false;
    let wrapTargets = 0;
    cannon.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) wrapTargets++;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.transparent && child.material.opacity < 0.9) {
          translucentCanisters++;
        }
        if (child.material.emissive.getHex() === cyanHex) {
          hasCyanGlow = true;
        }
      }
    });
    expect(translucentCanisters).toBeGreaterThanOrEqual(2);
    expect(hasCyanGlow).toBe(true);
    expect(wrapTargets).toBeGreaterThanOrEqual(2);

    applyWeaponWrap(cannon, 'neon_cyber');
    const neonMat = getWeaponWrapMaterial('neon_cyber');
    let wrappedCount = 0;
    cannon.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) {
        expect(child.material).toBe(neonMat);
        wrappedCount++;
      } else {
        expect(child.material).not.toBe(neonMat);
      }
    });
    expect(wrappedCount).toBe(wrapTargets);
    assertFiniteBox(cannon);
    disposeObject3D(cannon);

    // Muzzle flashes emit cyan energy without ejecting brass bullet casings
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.5, z: 0.6 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'chug_cannon',
    });
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.3 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'auto_turret',
    });
    expect(vfx.getActiveCasingCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(2);
    vfx.dispose();
  });

  it('animates Chug Cannon heavy shoulder-mounted launcher stance and Auto-Turret throwable briefcase stance cleanly', () => {
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();

    // 1. Chug Cannon heavy shoulder-mounted launcher stance (idle + aiming + sprint + pitch tracking)
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'chug_cannon',
        animState: 'idle',
        isAiming: false,
        isFiring: false,
        pitch: 0,
      }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('chug_cannon');
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.9);
    expect(rig.joints.rightElbow.rotation.x).toBeLessThan(-0.9);
    expect(rig.joints.rightHand.rotation.x).toBeGreaterThan(0.2);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.9);
    expect(rig.joints.leftShoulder.rotation.y).toBeLessThan(-0.4);
    const levelMuzzleY = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;
    assertFiniteBox(rig.getGroup());

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'chug_cannon',
        animState: 'idle',
        isAiming: true,
        pitch: 0.55,
      }),
      0,
    );
    const aimUpMuzzleY = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;
    expect(aimUpMuzzleY).toBeGreaterThan(levelMuzzleY);

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'chug_cannon',
        animState: 'idle',
        isAiming: true,
        pitch: -0.55,
      }),
      0,
    );
    const aimDownMuzzleY = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;
    expect(levelMuzzleY).toBeGreaterThan(aimDownMuzzleY);

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'chug_cannon',
        animState: 'sprint',
        moveSpeed: 8.5,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.8);
    expect(rig.joints.rightElbow.rotation.x).toBeLessThan(-0.9);
    assertFiniteBox(rig.getGroup());

    // 2. Auto-Turret throwable briefcase stance (idle hold + overhand throw wind-up + sprint)
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'auto_turret',
        animState: 'idle',
        isAiming: false,
        isFiring: false,
      }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('auto_turret');
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.4);
    expect(rig.joints.rightShoulder.rotation.x).toBeGreaterThan(-1.2);
    assertFiniteBox(rig.getGroup());

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'auto_turret',
        animState: 'idle',
        isAiming: true,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.5);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.9);

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'auto_turret',
        animState: 'sprint',
        moveSpeed: 8.5,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.3);
    assertFiniteBox(rig.getGroup());

    rig.dispose();
  });

  it('spawns, updates, expires, guards NaN/range, clears, and disposes all 4 Wave-11 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:turret_deploy
    bus.emit('vfx:turret_deploy', { position: { x: 4, y: 0, z: -5 } });
    expect(vfx.getActiveTurretDeployCount()).toBe(1);

    // 2. vfx:turret_laser
    bus.emit('vfx:turret_laser', {
      from: { x: 4, y: 1.2, z: -5 },
      to: { x: 18, y: 1.4, z: 9 },
    });
    expect(vfx.getActiveTurretLaserCount()).toBe(1);

    // 3. vfx:slurp_orb
    bus.emit('vfx:slurp_orb', { position: { x: -6, y: 0.5, z: 7 }, radius: 4.5 });
    expect(vfx.getActiveSlurpOrbCount()).toBe(1);

    // 4. vfx:fishing_splash
    bus.emit('vfx:fishing_splash', { position: { x: 22, y: -1.5, z: -18 } });
    expect(vfx.getActiveFishingSplashCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(4);

    // Advance 0.10s -> all 4 remain active with strictly finite transforms
    vfx.update(0.05);
    vfx.update(0.05);
    expect(vfx.getActiveTurretDeployCount()).toBe(1);
    expect(vfx.getActiveTurretLaserCount()).toBe(1);
    expect(vfx.getActiveSlurpOrbCount()).toBe(1);
    expect(vfx.getActiveFishingSplashCount()).toBe(1);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // Advance past 0.20s -> turret_laser (0.18s) expires
    vfx.update(0.05);
    vfx.update(0.05);
    expect(vfx.getActiveTurretLaserCount()).toBe(0);
    expect(vfx.getActiveFishingSplashCount()).toBe(1);
    expect(vfx.getActiveSlurpOrbCount()).toBe(1);
    expect(vfx.getActiveTurretDeployCount()).toBe(1);

    // Advance to 0.70s -> fishing_splash (0.68s) expires while slurp_orb (0.75s) & turret_deploy (0.76s) stay active
    for (let i = 0; i < 10; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveFishingSplashCount()).toBe(0);
    expect(vfx.getActiveSlurpOrbCount()).toBe(1);
    expect(vfx.getActiveTurretDeployCount()).toBe(1);

    // Advance past 0.80s -> all Wave-11 channels expire cleanly back to pool
    vfx.update(0.05);
    vfx.update(0.05);
    expect(vfx.getActiveSlurpOrbCount()).toBe(0);
    expect(vfx.getActiveTurretDeployCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Strict NaN / Infinity / zero-length laser guards
    bus.emit('vfx:turret_deploy', { position: { x: Number.NaN, y: 0, z: 0 } });
    bus.emit('vfx:turret_laser', {
      from: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
      to: { x: 5, y: 1, z: 5 },
    });
    bus.emit('vfx:turret_laser', {
      from: { x: 2, y: 1, z: 2 },
      to: { x: 2, y: 1, z: 2 },
    });
    bus.emit('vfx:slurp_orb', {
      position: { x: 0, y: 0, z: Number.NEGATIVE_INFINITY },
      radius: 4.5,
    });
    bus.emit('vfx:fishing_splash', { position: { x: Number.NaN, y: -1, z: 2 } });
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Extreme distance laser & negative/NaN Slurp orb radius clamped cleanly without NaN transforms
    bus.emit('vfx:turret_laser', {
      from: { x: 0, y: 1, z: 0 },
      to: { x: 0, y: 1, z: 5000 },
    });
    bus.emit('vfx:slurp_orb', { position: { x: 2, y: 0.5, z: 2 }, radius: -12 });
    bus.emit('vfx:slurp_orb', { position: { x: 4, y: 0.5, z: 4 }, radius: Number.NaN });
    expect(vfx.getActiveTurretLaserCount()).toBe(1);
    expect(vfx.getActiveSlurpOrbCount()).toBe(2);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // clear() resets all 4 Wave-11 pools immediately
    bus.emit('vfx:turret_deploy', { position: { x: 0, y: 0, z: 0 } });
    bus.emit('vfx:fishing_splash', { position: { x: 3, y: -1, z: 3 } });
    expect(vfx.getActiveEffectCount()).toBe(5);
    vfx.clear();
    expect(vfx.getActiveTurretDeployCount()).toBe(0);
    expect(vfx.getActiveTurretLaserCount()).toBe(0);
    expect(vfx.getActiveSlurpOrbCount()).toBe(0);
    expect(vfx.getActiveFishingSplashCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all 4 Wave-11 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:turret_deploy', { position: { x: 0, y: 0, z: 0 } });
    bus.emit('vfx:turret_laser', { from: { x: 0, y: 1, z: 0 }, to: { x: 0, y: 1, z: 12 } });
    bus.emit('vfx:slurp_orb', { position: { x: 0, y: 0, z: 0 }, radius: 4.5 });
    bus.emit('vfx:fishing_splash', { position: { x: 0, y: -1, z: 0 } });
    expect(vfx.getActiveTurretDeployCount()).toBe(0);
    expect(vfx.getActiveTurretLaserCount()).toBe(0);
    expect(vfx.getActiveSlurpOrbCount()).toBe(0);
    expect(vfx.getActiveFishingSplashCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});

describe('Wave-12 Ballistic Shield, Remote C4, Kill-Streak Overdrive Aura & VFX Channels', () => {
  it('builds bespoke Aegis Ballistic Shield (curved hex visor + sidearm + wraps) and Remote C4 (red armed LED + fob + wrapDisabled)', () => {
    const shield = createWeaponModel('ballistic_shield');
    expect(shield.name).toBe('weapon_ballistic_shield');
    expect(isRangedWeapon('ballistic_shield')).toBe(true);
    expect(isThrowableWeapon('ballistic_shield')).toBe(false);
    expect(hasMuzzleOffset('ballistic_shield')).toBe(true);
    expect(countMeshes(shield)).toBeGreaterThanOrEqual(18);
    const shieldMuzzle = shield.userData.muzzleOffset as THREE.Vector3;
    expect(shieldMuzzle).toBeInstanceOf(THREE.Vector3);
    expect(shieldMuzzle.z).toBeGreaterThan(0.15);

    const cyanHex = new THREE.Color('#22d3ee').getHex();
    let translucentCyanVisor = 0;
    let hexPlates = 0;
    let wrapTargets = 0;
    shield.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) wrapTargets++;
      if (
        child.geometry instanceof THREE.CylinderGeometry &&
        child.geometry.parameters.radialSegments === 6
      ) {
        hexPlates++;
      }
      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (
          child.material.transparent &&
          child.material.opacity < 0.9 &&
          child.material.emissive.getHex() === cyanHex
        ) {
          translucentCyanVisor++;
        }
      }
    });
    expect(translucentCyanVisor).toBeGreaterThanOrEqual(1);
    expect(hexPlates).toBeGreaterThanOrEqual(5);
    expect(wrapTargets).toBeGreaterThanOrEqual(4);

    applyWeaponWrap(shield, 'neon_cyber');
    const neonMat = getWeaponWrapMaterial('neon_cyber');
    let wrappedCount = 0;
    shield.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.wrapTarget === true) {
        expect(child.material).toBe(neonMat);
        wrappedCount++;
      } else {
        expect(child.material).not.toBe(neonMat);
      }
    });
    expect(wrappedCount).toBe(wrapTargets);
    assertFiniteBox(shield);
    disposeObject3D(shield);

    const c4 = createWeaponModel('remote_c4');
    expect(c4.name).toBe('weapon_remote_c4');
    expect(c4.userData.wrapDisabled).toBe(true);
    expect(isRangedWeapon('remote_c4')).toBe(false);
    expect(isThrowableWeapon('remote_c4')).toBe(true);
    expect(hasMuzzleOffset('remote_c4')).toBe(true);
    expect(countMeshes(c4)).toBeGreaterThanOrEqual(14);
    const c4Muzzle = c4.userData.muzzleOffset as THREE.Vector3;
    expect(c4Muzzle).toBeInstanceOf(THREE.Vector3);
    expect(c4Muzzle.z).toBeGreaterThan(0.15);

    const redHex = new THREE.Color('#ef4444').getHex();
    let redArmedMeshes = 0;
    c4.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (
        child.material instanceof THREE.MeshStandardMaterial &&
        child.material.emissive.getHex() === redHex
      ) {
        redArmedMeshes++;
      }
    });
    expect(redArmedMeshes).toBeGreaterThanOrEqual(3);

    applyWeaponWrap(c4, 'midas_gold');
    const goldMat = getWeaponWrapMaterial('midas_gold');
    c4.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        expect(child.material).not.toBe(goldMat);
      }
    });
    assertFiniteBox(c4);
    disposeObject3D(c4);

    // Ballistic shield sidearm ejects light casings on fire; Remote C4 does not
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.5 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'ballistic_shield',
    });
    expect(vfx.getActiveCasingCount()).toBe(1);
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.3 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'remote_c4',
    });
    expect(vfx.getActiveCasingCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(3);
    vfx.dispose();
  });

  it('animates Ballistic Shield raised forward guard stance (isShieldBlocking) and Remote C4 throwable/detonator stance cleanly', () => {
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();

    // 1. Unblocked Ballistic Shield ready carry
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'ballistic_shield',
        animState: 'idle',
        isShieldBlocking: false,
        isAiming: false,
        isFiring: false,
      }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('ballistic_shield');
    expect(rig.joints.rightShoulder.rotation.x).toBeGreaterThan(-0.9);
    assertFiniteBox(rig.getGroup());

    // 2. Raised forward guard stance when isShieldBlocking is true (braced even during sprint!)
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'ballistic_shield',
        animState: 'sprint',
        moveSpeed: 8.5,
        isShieldBlocking: true,
        pitch: 0,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.0);
    expect(rig.joints.rightShoulder.rotation.y).toBeGreaterThan(0.3);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.9);
    expect(rig.joints.leftShoulder.rotation.y).toBeLessThan(-0.4);
    expect(rig.joints.chest.rotation.y).toBeGreaterThan(0.1);
    const guardMuzzleLevelY = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;
    assertFiniteBox(rig.getGroup());

    // Pitch tracking while shield blocking
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'ballistic_shield',
        animState: 'idle',
        isShieldBlocking: true,
        pitch: 0.45,
      }),
      0,
    );
    const guardMuzzleUpY = rig.getMuzzleWorldPosition(new THREE.Vector3()).y;
    expect(guardMuzzleUpY).toBeGreaterThan(guardMuzzleLevelY);

    // Unblocked sidearm firing stance
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'ballistic_shield',
        animState: 'idle',
        isShieldBlocking: false,
        isFiring: true,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.9);
    assertFiniteBox(rig.getGroup());

    // 3. Remote C4 ready carry -> wireless detonator trigger stance (isAiming) -> throw wind-up (isFiring) -> sprint
    animator.update(
      rig,
      makeRenderState({
        weaponId: 'remote_c4',
        animState: 'idle',
        isAiming: false,
        isFiring: false,
      }),
      0,
    );
    expect(rig.getEquippedWeaponId()).toBe('remote_c4');
    expect(rig.joints.rightShoulder.rotation.x).toBeGreaterThan(-0.9);

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'remote_c4',
        animState: 'idle',
        isAiming: true,
        isFiring: false,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.95);
    expect(rig.joints.rightShoulder.rotation.x).toBeGreaterThan(-1.45);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.85);
    assertFiniteBox(rig.getGroup());

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'remote_c4',
        animState: 'idle',
        isAiming: false,
        isFiring: true,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-1.6);
    expect(rig.joints.leftShoulder.rotation.x).toBeLessThan(-0.9);
    assertFiniteBox(rig.getGroup());

    animator.update(
      rig,
      makeRenderState({
        weaponId: 'remote_c4',
        animState: 'sprint',
        moveSpeed: 8.5,
      }),
      0,
    );
    expect(rig.joints.rightShoulder.rotation.x).toBeLessThan(-0.3);
    assertFiniteBox(rig.getGroup());

    rig.dispose();
  });

  it('activates, animates, toggles, and disposes Golden-Amber Kill-Streak Overdrive Aura when killStreak >= 3', () => {
    const rig = new CharacterRig();
    const animator = new CharacterAnimator();

    expect(rig.isStreakAuraVisible()).toBe(false);
    expect(rig.getStreakAuraGroup()).toBeNull();

    // Streaks below 3 keep Overdrive Aura hidden
    for (const streak of [0, 1, 2]) {
      animator.update(rig, makeRenderState({ killStreak: streak }), 0.02);
      expect(rig.isStreakAuraVisible()).toBe(false);
    }

    // Streak === 3 activates Golden-Amber Overdrive Aura under chest joint
    animator.update(rig, makeRenderState({ killStreak: 3 }), 0.04);
    expect(rig.isStreakAuraVisible()).toBe(true);
    const auraGrp = rig.getStreakAuraGroup();
    expect(auraGrp).toBeInstanceOf(THREE.Group);
    expect(auraGrp!.name).toBe('streak_aura_group');
    expect(auraGrp!.visible).toBe(true);
    expect(rig.joints.chest.getObjectByName('streak_aura_group')).toBe(auraGrp);

    let ringCount = 0;
    let sparkCount = 0;
    auraGrp!.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.geometry instanceof THREE.TorusGeometry) ringCount++;
      if (child.geometry instanceof THREE.OctahedronGeometry) sparkCount++;
    });
    expect(ringCount).toBeGreaterThanOrEqual(3);
    expect(sparkCount).toBeGreaterThanOrEqual(8);
    assertFiniteBox(rig.getGroup());

    // Advancing animation updates orbital ring rotation & spark positions smoothly
    const firstRingRotY = auraGrp!.children[0].rotation.y;
    const firstSparkPos = auraGrp!.children[3].position.clone();
    animator.update(rig, makeRenderState({ killStreak: 5 }), 0.08);
    expect(rig.isStreakAuraVisible()).toBe(true);
    expect(auraGrp!.children[0].rotation.y).not.toBeCloseTo(firstRingRotY, 3);
    expect(auraGrp!.children[3].position.distanceTo(firstSparkPos)).toBeGreaterThan(0.01);
    assertFiniteBox(rig.getGroup());

    // Dropping below 3 or NaN hides Overdrive Aura cleanly
    animator.update(rig, makeRenderState({ killStreak: 2 }), 0.02);
    expect(rig.isStreakAuraVisible()).toBe(false);
    expect(auraGrp!.visible).toBe(false);

    rig.updateFromState(makeRenderState({ killStreak: 4 }));
    expect(rig.isStreakAuraVisible()).toBe(true);
    rig.updateFromState(makeRenderState({ killStreak: Number.NaN }));
    expect(rig.isStreakAuraVisible()).toBe(false);

    // Clean teardown in dispose()
    rig.dispose();
    expect(rig.isStreakAuraVisible()).toBe(false);
    expect(rig.getStreakAuraGroup()).toBeNull();
    expect(rig.joints.chest.getObjectByName('streak_aura_group')).toBeUndefined();
  });

  it('spawns, updates, expires, guards NaN/range, clears, and disposes all 4 Wave-12 VFX channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    // 1. vfx:tank_shell
    bus.emit('vfx:tank_shell', {
      origin: { x: -12, y: 2.2, z: -18 },
      target: { x: 14, y: 0.4, z: 10 },
      radius: 5.5,
    });
    expect(vfx.getActiveTankShellCount()).toBe(1);

    // 2. vfx:shield_ricochet
    bus.emit('vfx:shield_ricochet', {
      position: { x: 1.2, y: 1.35, z: 0.6 },
      normal: { x: 0, y: 0.25, z: 1 },
    });
    expect(vfx.getActiveShieldRicochetCount()).toBe(1);

    // 3. vfx:c4_blast
    bus.emit('vfx:c4_blast', {
      position: { x: 6, y: 1.0, z: -8 },
      radius: 5.5,
    });
    expect(vfx.getActiveC4BlastCount()).toBe(1);

    // 4. vfx:hot_drop_beam
    bus.emit('vfx:hot_drop_beam', {
      position: { x: -24, y: 0, z: 32 },
    });
    expect(vfx.getActiveHotDropBeamCount()).toBe(1);
    expect(vfx.getActiveEffectCount()).toBe(4);

    // Advance 0.15s -> all 4 active with strictly finite transforms
    for (let i = 0; i < 3; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveTankShellCount()).toBe(1);
    expect(vfx.getActiveShieldRicochetCount()).toBe(1);
    expect(vfx.getActiveC4BlastCount()).toBe(1);
    expect(vfx.getActiveHotDropBeamCount()).toBe(1);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // Advance past 0.35s -> shield_ricochet (0.34s) expires
    for (let i = 0; i < 4; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveShieldRicochetCount()).toBe(0);
    expect(vfx.getActiveTankShellCount()).toBe(1);
    expect(vfx.getActiveC4BlastCount()).toBe(1);
    expect(vfx.getActiveHotDropBeamCount()).toBe(1);

    // Advance past 0.80s -> tank_shell (0.78s) expires
    for (let i = 0; i < 9; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveTankShellCount()).toBe(0);
    expect(vfx.getActiveC4BlastCount()).toBe(1);
    expect(vfx.getActiveHotDropBeamCount()).toBe(1);

    // Advance past 0.90s -> c4_blast (0.88s) expires
    vfx.update(0.05);
    vfx.update(0.05);
    expect(vfx.getActiveC4BlastCount()).toBe(0);
    expect(vfx.getActiveHotDropBeamCount()).toBe(1);

    // Advance past 1.30s -> hot_drop_beam (1.25s) expires cleanly back to pool
    for (let i = 0; i < 8; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveHotDropBeamCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Strict NaN / Infinity guards
    bus.emit('vfx:tank_shell', {
      origin: { x: Number.NaN, y: 0, z: 0 },
      target: { x: 10, y: 0, z: 10 },
      radius: 5.5,
    });
    bus.emit('vfx:tank_shell', {
      origin: { x: 0, y: 1, z: 0 },
      target: { x: 10, y: Number.POSITIVE_INFINITY, z: 10 },
      radius: 5.5,
    });
    bus.emit('vfx:shield_ricochet', {
      position: { x: Number.NaN, y: 1, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    });
    bus.emit('vfx:c4_blast', {
      position: { x: 0, y: 0, z: Number.NEGATIVE_INFINITY },
      radius: 5.5,
    });
    bus.emit('vfx:hot_drop_beam', {
      position: { x: Number.NaN, y: 0, z: 0 },
    });
    expect(vfx.getActiveEffectCount()).toBe(0);

    // Zero-length tank_shell & invalid radius/normal safely clamped without NaN transforms
    bus.emit('vfx:tank_shell', {
      origin: { x: 4, y: 2, z: 4 },
      target: { x: 4, y: 2, z: 4 },
      radius: -10,
    });
    bus.emit('vfx:shield_ricochet', {
      position: { x: 2, y: 1, z: 2 },
      normal: { x: 0, y: 0, z: 0 },
    });
    bus.emit('vfx:c4_blast', {
      position: { x: 6, y: 1, z: 6 },
      radius: Number.NaN,
    });
    expect(vfx.getActiveTankShellCount()).toBe(1);
    expect(vfx.getActiveShieldRicochetCount()).toBe(1);
    expect(vfx.getActiveC4BlastCount()).toBe(1);
    vfx.update(0.05);
    scene.traverse((obj) => {
      expect(Number.isFinite(obj.position.x)).toBe(true);
      expect(Number.isFinite(obj.position.y)).toBe(true);
      expect(Number.isFinite(obj.position.z)).toBe(true);
      expect(Number.isFinite(obj.quaternion.x)).toBe(true);
      expect(Number.isFinite(obj.quaternion.w)).toBe(true);
      expect(Number.isFinite(obj.scale.x)).toBe(true);
    });

    // clear() resets all 4 Wave-12 pools immediately
    bus.emit('vfx:hot_drop_beam', { position: { x: 0, y: 0, z: 0 } });
    expect(vfx.getActiveEffectCount()).toBe(4);
    vfx.clear();
    expect(vfx.getActiveTankShellCount()).toBe(0);
    expect(vfx.getActiveShieldRicochetCount()).toBe(0);
    expect(vfx.getActiveC4BlastCount()).toBe(0);
    expect(vfx.getActiveHotDropBeamCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);

    // dispose() removes root and unsubscribes all 4 Wave-12 channels cleanly
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:tank_shell', {
      origin: { x: 0, y: 1, z: 0 },
      target: { x: 10, y: 0, z: 10 },
      radius: 5.5,
    });
    bus.emit('vfx:shield_ricochet', {
      position: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    });
    bus.emit('vfx:c4_blast', { position: { x: 0, y: 0, z: 0 }, radius: 5.5 });
    bus.emit('vfx:hot_drop_beam', { position: { x: 0, y: 0, z: 0 } });
    expect(vfx.getActiveTankShellCount()).toBe(0);
    expect(vfx.getActiveShieldRicochetCount()).toBe(0);
    expect(vfx.getActiveC4BlastCount()).toBe(0);
    expect(vfx.getActiveHotDropBeamCount()).toBe(0);
    expect(vfx.getActiveEffectCount()).toBe(0);
  });
});
