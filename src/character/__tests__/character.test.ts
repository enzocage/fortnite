import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type {
  AnimState,
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
  isRangedWeapon,
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

describe('WeaponModels', () => {
  it('builds valid stylized 3D groups for all WeaponIds', () => {
    const allIds = Object.keys(WEAPONS) as WeaponId[];
    expect(allIds.length).toBeGreaterThanOrEqual(19);

    for (const id of allIds) {
      const grp = createWeaponModel(id);
      expect(grp).toBeInstanceOf(THREE.Group);
      expect(countMeshes(grp)).toBeGreaterThan(0);

      grp.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          expect(child.castShadow).toBe(true);
        }
      });

      if (isRangedWeapon(id)) {
        const offset = grp.userData.muzzleOffset;
        expect(offset).toBeInstanceOf(THREE.Vector3);
        expect(Number.isFinite(offset.x)).toBe(true);
        expect(Number.isFinite(offset.y)).toBe(true);
        expect(offset.z).toBeGreaterThan(0.15);
      }

      disposeObject3D(grp);
    }
  });

  it('builds all pickaxe styles and blueprint model', () => {
    expect(PICKAXES.length).toBeGreaterThanOrEqual(6);
    for (const pickaxe of PICKAXES) {
      const model = createWeaponModel('pickaxe', pickaxe);
      expect(model.name).toBe(`weapon_pickaxe_${pickaxe.style}`);
      expect(countMeshes(model)).toBeGreaterThanOrEqual(4);
      disposeObject3D(model);
    }

    const blueprint = createBlueprintModel();
    expect(blueprint.name).toBe('weapon_blueprint');
    expect(countMeshes(blueprint)).toBeGreaterThanOrEqual(6);
    disposeObject3D(blueprint);
  });
});

describe('CharacterRig', () => {
  it('constructs a ~1.85m tall humanoid with feet at y=0 and all 21 joints', () => {
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

    const box = new THREE.Box3().setFromObject(root);
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

  it('supports swapping all skins, pickaxes, and gliders cleanly', () => {
    const rig = new CharacterRig(SKINS[0], PICKAXES[0], GLIDERS[0]);

    for (const skin of SKINS) {
      rig.setSkin(skin);
      expect(rig.getSkin().id).toBe(skin.id);
      if (skin.backblingStyle === 'none') {
        expect(countMeshes(rig.joints.backblingSocket)).toBe(0);
      } else {
        expect(countMeshes(rig.joints.backblingSocket)).toBeGreaterThan(0);
      }
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
    }

    rig.setGliderOpen(false);
    expect(rig.joints.gliderSocket.visible).toBe(false);

    rig.setVisible(false);
    expect(rig.getGroup().visible).toBe(false);
    rig.setVisible(true);
    expect(rig.getGroup().visible).toBe(true);

    rig.dispose();
  });

  it('computes world muzzle position accurately across yaw and build mode', () => {
    const rig = new CharacterRig();
    rig.equipWeapon('ar', false);
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
  it('animates all 15 AnimStates and all 4 EmoteIds without NaN transforms', () => {
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
      'skydive',
      'glide',
      'harvest',
      'reload',
      'heal',
      'build',
      'emote',
    ];

    for (const animState of states) {
      const emoteIds: Array<EmoteId | null> =
        animState === 'emote' ? EMOTES.map((e) => e.id) : [null];
      for (const emoteId of emoteIds) {
        const renderState = makeRenderState({
          animState,
          emoteId,
          weaponId: animState === 'harvest' ? 'pickaxe' : animState === 'heal' ? 'shield_potion' : 'ar',
          isBuilding: animState === 'build',
          moveSpeed: animState.includes('walk') || animState === 'run' || animState === 'sprint' ? 6.5 : 0,
          harvestSwingTimer: animState === 'harvest' ? 0.25 : 0,
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
      }
    }

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
  it('spawns, animates, pools, clears, and disposes all 8 VFX EventBus channels', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    expect(scene.getObjectByName('vfx_root')).toBeDefined();

    bus.emit('vfx:tracer', {
      from: { x: 0, y: 1.4, z: 0 },
      to: { x: 0, y: 1.4, z: 30 },
    });
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1.4, z: 0.6 },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: 'ar',
    });

    const impactMats = ['wood', 'brick', 'metal', 'dirt', 'shield', 'flesh', 'shield_break'] as const;
    for (const material of impactMats) {
      bus.emit('vfx:impact', {
        position: { x: 2, y: 1, z: 5 },
        normal: { x: 0, y: 1, z: 0 },
        material,
      });
    }

    bus.emit('vfx:explosion', { position: { x: -4, y: 0.5, z: 8 }, radius: 6.2 });
    bus.emit('vfx:elimination', { position: { x: 3, y: 0, z: -4 }, skinColor: '#2563eb' });
    bus.emit('vfx:build_pop', {
      position: { x: 4, y: 1.6, z: 4 },
      material: 'wood',
      pieceType: 'wall',
    });
    bus.emit('vfx:chest_open', { position: { x: -2, y: 0, z: -2 } });
    bus.emit('vfx:weakpoint', {
      propId: 'tree_1',
      position: { x: 1, y: 1.2, z: 1 },
      normal: { x: 0, y: 0, z: 1 },
      active: true,
    });

    expect(vfx.getActiveEffectCount()).toBe(13);
    expect(vfx.getActiveWeakpointCount()).toBe(1);

    // Step forward until all timed effects expire back to pool
    for (let i = 0; i < 40; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveEffectCount()).toBe(0);
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
    bus.emit('vfx:explosion', { position: { x: 0, y: 0, z: 0 }, radius: 5 });
    bus.emit('vfx:weakpoint', {
      propId: 'rock_1',
      position: { x: 0, y: 1, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      active: true,
    });
    expect(vfx.getActiveEffectCount()).toBe(1);
    expect(vfx.getActiveWeakpointCount()).toBe(1);

    vfx.clear();
    expect(vfx.getActiveEffectCount()).toBe(0);
    expect(vfx.getActiveWeakpointCount()).toBe(0);

    // Dispose removes from scene and unsubscribes EventBus
    vfx.dispose();
    expect(scene.getObjectByName('vfx_root')).toBeUndefined();

    bus.emit('vfx:tracer', { from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 10 } });
    expect(vfx.getActiveEffectCount()).toBe(0);
  });

  it('handles zero-length directions and normals safely without NaN transforms', () => {
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const vfx = new VFXManager(scene, bus);

    bus.emit('vfx:tracer', { from: { x: 1, y: 1, z: 1 }, to: { x: 1, y: 1, z: 1 } });
    bus.emit('vfx:muzzle', {
      position: { x: 0, y: 1, z: 0 },
      direction: { x: 0, y: 0, z: 0 },
      weaponId: 'rocket_launcher',
    });
    bus.emit('vfx:impact', {
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 0 },
      material: 'metal',
    });
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
    });

    vfx.dispose();
  });
});
