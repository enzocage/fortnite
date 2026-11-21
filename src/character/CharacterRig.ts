import * as THREE from 'three';
import type { GliderDef, PickaxeDef, SkinDef, WeaponId } from '../types';
import { GLIDERS, PICKAXES, SKINS, clamp } from '../core';
import {
  createBlueprintModel,
  createWeaponModel,
  disposeObject3D,
} from './WeaponModels';

export interface CharacterJoints {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  leftHand: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  rightHand: THREE.Group;
  weaponSocket: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftFoot: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightFoot: THREE.Group;
  backblingSocket: THREE.Group;
  gliderSocket: THREE.Group;
}

function makeMat(
  color: THREE.ColorRepresentation,
  roughness = 0.58,
  metalness = 0.12,
  emissive?: THREE.ColorRepresentation,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive: emissive ?? 0x000000,
    emissiveIntensity,
  });
}

function createPart(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Stylized ~1.85m cartoon-tactical humanoid character rig.
 * Root sits at feet (y = 0); local +Z is forward (yaw = 0 faces +Z).
 */
export class CharacterRig {
  public readonly joints: CharacterJoints;

  private skin: SkinDef;
  private pickaxe: PickaxeDef;
  private glider: GliderDef;

  private equippedWeaponId: WeaponId = 'pickaxe';
  private buildMode = false;
  private gliderOpen = false;
  private gliderOpenFactor = 0;

  private readonly skinVisualRoots: THREE.Group[] = [];
  private readonly weaponCache = new Map<string, THREE.Group>();
  private activeWeaponGroup: THREE.Group | null = null;
  private gliderVisualGroup: THREE.Group | null = null;
  private disposed = false;

  constructor(skin?: SkinDef, pickaxe?: PickaxeDef, glider?: GliderDef) {
    this.skin = skin ?? SKINS[0];
    this.pickaxe = pickaxe ?? PICKAXES[0];
    this.glider = glider ?? GLIDERS[0];

    this.joints = this.createJointHierarchy();
    this.joints.rightShoulder.rotation.set(-0.52, 0.08, -0.14);
    this.joints.rightElbow.rotation.set(-0.62, 0, 0);
    this.joints.leftShoulder.rotation.set(-0.35, -0.1, 0.1);
    this.joints.leftElbow.rotation.set(-0.45, 0, 0);

    this.buildSkinVisuals();
    this.buildGliderVisual();
    this.setGliderOpen(false, 0);
    this.equipWeapon('pickaxe', false);
  }

  private createJointHierarchy(): CharacterJoints {
    const root = new THREE.Group();
    root.name = 'character_root';

    const hips = new THREE.Group();
    hips.name = 'hips';
    hips.position.set(0, 0.9, 0);
    root.add(hips);

    const spine = new THREE.Group();
    spine.name = 'spine';
    spine.position.set(0, 0.12, 0);
    hips.add(spine);

    const chest = new THREE.Group();
    chest.name = 'chest';
    chest.position.set(0, 0.21, 0);
    spine.add(chest);

    const neck = new THREE.Group();
    neck.name = 'neck';
    neck.position.set(0, 0.23, 0);
    chest.add(neck);

    const head = new THREE.Group();
    head.name = 'head';
    head.position.set(0, 0.07, 0);
    neck.add(head);

    const leftShoulder = new THREE.Group();
    leftShoulder.name = 'leftShoulder';
    leftShoulder.position.set(0.23, 0.16, 0);
    chest.add(leftShoulder);

    const leftElbow = new THREE.Group();
    leftElbow.name = 'leftElbow';
    leftElbow.position.set(0.01, -0.25, 0);
    leftShoulder.add(leftElbow);

    const leftHand = new THREE.Group();
    leftHand.name = 'leftHand';
    leftHand.position.set(0, -0.23, 0);
    leftElbow.add(leftHand);

    const rightShoulder = new THREE.Group();
    rightShoulder.name = 'rightShoulder';
    rightShoulder.position.set(-0.23, 0.16, 0);
    chest.add(rightShoulder);

    const rightElbow = new THREE.Group();
    rightElbow.name = 'rightElbow';
    rightElbow.position.set(-0.01, -0.25, 0);
    rightShoulder.add(rightElbow);

    const rightHand = new THREE.Group();
    rightHand.name = 'rightHand';
    rightHand.position.set(0, -0.23, 0);
    rightElbow.add(rightHand);

    const weaponSocket = new THREE.Group();
    weaponSocket.name = 'weaponSocket';
    weaponSocket.position.set(0, -0.05, 0.03);
    weaponSocket.rotation.set(Math.PI / 2, 0, 0);
    rightHand.add(weaponSocket);

    const leftHip = new THREE.Group();
    leftHip.name = 'leftHip';
    leftHip.position.set(0.105, -0.04, 0);
    hips.add(leftHip);

    const leftKnee = new THREE.Group();
    leftKnee.name = 'leftKnee';
    leftKnee.position.set(0, -0.39, 0);
    leftHip.add(leftKnee);

    const leftFoot = new THREE.Group();
    leftFoot.name = 'leftFoot';
    leftFoot.position.set(0, -0.37, 0);
    leftKnee.add(leftFoot);

    const rightHip = new THREE.Group();
    rightHip.name = 'rightHip';
    rightHip.position.set(-0.105, -0.04, 0);
    hips.add(rightHip);

    const rightKnee = new THREE.Group();
    rightKnee.name = 'rightKnee';
    rightKnee.position.set(0, -0.39, 0);
    rightHip.add(rightKnee);

    const rightFoot = new THREE.Group();
    rightFoot.name = 'rightFoot';
    rightFoot.position.set(0, -0.37, 0);
    rightKnee.add(rightFoot);

    const backblingSocket = new THREE.Group();
    backblingSocket.name = 'backblingSocket';
    backblingSocket.position.set(0, 0.11, -0.145);
    chest.add(backblingSocket);

    const gliderSocket = new THREE.Group();
    gliderSocket.name = 'gliderSocket';
    gliderSocket.position.set(0, 0.9, 0.06);
    chest.add(gliderSocket);

    return {
      root,
      hips,
      spine,
      chest,
      neck,
      head,
      leftShoulder,
      leftElbow,
      leftHand,
      rightShoulder,
      rightElbow,
      rightHand,
      weaponSocket,
      leftHip,
      leftKnee,
      leftFoot,
      rightHip,
      rightKnee,
      rightFoot,
      backblingSocket,
      gliderSocket,
    };
  }

  private clearSkinVisuals(): void {
    for (const grp of this.skinVisualRoots) {
      disposeObject3D(grp);
      grp.parent?.remove(grp);
    }
    this.skinVisualRoots.length = 0;
  }

  private attachVisualGroup(parent: THREE.Object3D, name: string): THREE.Group {
    const grp = new THREE.Group();
    grp.name = name;
    parent.add(grp);
    this.skinVisualRoots.push(grp);
    return grp;
  }

  private buildSkinVisuals(): void {
    this.clearSkinVisuals();

    const primary = makeMat(this.skin.primaryColor, 0.52, 0.14);
    const secondary = makeMat(this.skin.secondaryColor, 0.62, 0.18);
    const accent = makeMat(this.skin.accentColor, 0.35, 0.35, this.skin.accentColor, 0.12);
    const skinMat = makeMat(this.skin.skinTone, 0.72, 0.02);
    const hairMat = makeMat(this.skin.hairColor, 0.78, 0.05);
    const darkTrim = makeMat('#0f172a', 0.6, 0.25);
    const bootMat = makeMat('#1e293b', 0.68, 0.15);
    const soleMat = makeMat('#0f172a', 0.85, 0.05);
    const scleraMat = makeMat('#f8fafc', 0.3, 0.0);
    const irisMat = makeMat('#1d4ed8', 0.25, 0.1);
    const pupilMat = makeMat('#020617', 0.2, 0.0);

    // --- Hips & Tactical Utility Belt ---
    const hipVis = this.attachVisualGroup(this.joints.hips, 'hips_visual');
    createPart(hipVis, new THREE.BoxGeometry(0.32, 0.15, 0.20), secondary, 0, 0.01, 0);
    // Belt + buckle + pouches
    createPart(hipVis, new THREE.BoxGeometry(0.345, 0.055, 0.225), darkTrim, 0, 0.06, 0);
    createPart(hipVis, new THREE.BoxGeometry(0.08, 0.062, 0.03), accent, 0, 0.06, 0.112);
    createPart(hipVis, new THREE.BoxGeometry(0.065, 0.085, 0.09), secondary, 0.185, 0.035, 0.02);
    createPart(hipVis, new THREE.BoxGeometry(0.065, 0.085, 0.09), secondary, -0.185, 0.035, 0.02);
    createPart(hipVis, new THREE.BoxGeometry(0.11, 0.075, 0.065), primary, 0, 0.04, -0.125);

    // --- Spine / Waist ---
    const spineVis = this.attachVisualGroup(this.joints.spine, 'spine_visual');
    createPart(spineVis, new THREE.BoxGeometry(0.28, 0.20, 0.18), primary, 0, 0.06, 0);
    createPart(spineVis, new THREE.BoxGeometry(0.295, 0.06, 0.195), secondary, 0, 0.02, 0);

    // --- Chest & Tactical Vest ---
    const chestVis = this.attachVisualGroup(this.joints.chest, 'chest_visual');
    createPart(chestVis, new THREE.BoxGeometry(0.36, 0.27, 0.22), primary, 0, 0.10, 0);
    // Armor vest plates + glowing core strip
    createPart(chestVis, new THREE.BoxGeometry(0.30, 0.21, 0.245), secondary, 0, 0.11, 0.005);
    createPart(chestVis, new THREE.BoxGeometry(0.12, 0.045, 0.256), accent, 0, 0.15, 0.01);
    createPart(chestVis, new THREE.BoxGeometry(0.05, 0.12, 0.256), accent, 0.09, 0.10, 0.005);
    createPart(chestVis, new THREE.BoxGeometry(0.05, 0.12, 0.256), accent, -0.09, 0.10, 0.005);
    // Collar ring
    createPart(chestVis, new THREE.CylinderGeometry(0.09, 0.11, 0.045, 10), secondary, 0, 0.23, 0);

    // --- Neck ---
    const neckVis = this.attachVisualGroup(this.joints.neck, 'neck_visual');
    createPart(neckVis, new THREE.CylinderGeometry(0.058, 0.068, 0.10, 10), skinMat, 0, 0.04, 0);

    // --- Head & Expressive Face ---
    const headVis = this.attachVisualGroup(this.joints.head, 'head_visual');
    // Stylized rounded-tactical head (cranium + jawline)
    createPart(headVis, new THREE.BoxGeometry(0.24, 0.24, 0.24), skinMat, 0, 0.15, 0);
    createPart(headVis, new THREE.BoxGeometry(0.20, 0.07, 0.21), skinMat, 0, 0.045, 0.01);
    // Ears
    createPart(headVis, new THREE.BoxGeometry(0.035, 0.075, 0.05), skinMat, 0.132, 0.145, -0.01);
    createPart(headVis, new THREE.BoxGeometry(0.035, 0.075, 0.05), skinMat, -0.132, 0.145, -0.01);
    // Nose bridge
    createPart(headVis, new THREE.BoxGeometry(0.034, 0.055, 0.045), skinMat, 0, 0.135, 0.128);
    // Expressive eyes (sclera + iris + pupil) facing +Z
    for (const side of [1, -1]) {
      const ex = side * 0.055;
      createPart(headVis, new THREE.BoxGeometry(0.046, 0.036, 0.016), scleraMat, ex, 0.17, 0.118);
      createPart(headVis, new THREE.BoxGeometry(0.026, 0.028, 0.018), irisMat, ex, 0.168, 0.122);
      createPart(headVis, new THREE.BoxGeometry(0.014, 0.016, 0.02), pupilMat, ex, 0.168, 0.124);
      // Expressive tilted brow
      createPart(
        headVis,
        new THREE.BoxGeometry(0.056, 0.016, 0.02),
        hairMat,
        ex,
        0.205,
        0.124,
        0,
        0,
        side * -0.14,
      );
    }
    // Confident mouth smile/smirk line
    createPart(headVis, new THREE.BoxGeometry(0.065, 0.012, 0.014), darkTrim, 0, 0.082, 0.122);

    // --- Headgear & Hair ---
    this.buildHeadgear(headVis, primary, secondary, accent, hairMat, darkTrim);

    // --- Arms, Shoulder Pads, Gauntlets, Gloves ---
    this.buildArmVisuals(
      this.joints.leftShoulder,
      this.joints.leftElbow,
      this.joints.leftHand,
      1,
      primary,
      secondary,
      accent,
      skinMat,
    );
    this.buildArmVisuals(
      this.joints.rightShoulder,
      this.joints.rightElbow,
      this.joints.rightHand,
      -1,
      primary,
      secondary,
      accent,
      skinMat,
    );

    // --- Legs, Knee Pads, Boots ---
    this.buildLegVisuals(
      this.joints.leftHip,
      this.joints.leftKnee,
      this.joints.leftFoot,
      1,
      primary,
      secondary,
      accent,
      bootMat,
      soleMat,
    );
    this.buildLegVisuals(
      this.joints.rightHip,
      this.joints.rightKnee,
      this.joints.rightFoot,
      -1,
      primary,
      secondary,
      accent,
      bootMat,
      soleMat,
    );

    // --- Backbling ---
    const backVis = this.attachVisualGroup(this.joints.backblingSocket, 'backbling_visual');
    this.buildBackbling(backVis, primary, secondary, accent);
  }

  private buildHeadgear(
    headVis: THREE.Group,
    primary: THREE.Material,
    secondary: THREE.Material,
    accent: THREE.Material,
    hairMat: THREE.Material,
    darkTrim: THREE.Material,
  ): void {
    const style = this.skin.headgear;

    // Base hair for styles that leave hair visible
    if (style === 'none' || style === 'cap' || style === 'visor' || style === 'crown' || style === 'bandana') {
      createPart(headVis, new THREE.BoxGeometry(0.255, 0.075, 0.255), hairMat, 0, 0.265, -0.005);
      createPart(headVis, new THREE.BoxGeometry(0.255, 0.14, 0.08), hairMat, 0, 0.19, -0.095);
    }

    switch (style) {
      case 'none': {
        // Swept hero hair tufts
        createPart(headVis, new THREE.BoxGeometry(0.18, 0.07, 0.16), hairMat, 0.02, 0.305, 0.03, -0.2, 0.15, -0.15);
        createPart(headVis, new THREE.BoxGeometry(0.11, 0.055, 0.10), hairMat, -0.04, 0.29, 0.09, 0.2, -0.2, 0.1);
        break;
      }
      case 'cap': {
        // Tactical baseball cap + front brim facing +Z
        createPart(headVis, new THREE.BoxGeometry(0.265, 0.095, 0.265), primary, 0, 0.275, -0.005);
        createPart(headVis, new THREE.BoxGeometry(0.23, 0.022, 0.16), secondary, 0, 0.238, 0.145, 0.12, 0, 0);
        createPart(headVis, new THREE.BoxGeometry(0.08, 0.045, 0.02), accent, 0, 0.275, 0.132);
        break;
      }
      case 'visor': {
        // Spiky hair + glowing cyber fox visor
        createPart(headVis, new THREE.BoxGeometry(0.21, 0.08, 0.18), hairMat, 0, 0.305, 0.01, -0.18, 0, 0);
        createPart(headVis, new THREE.BoxGeometry(0.262, 0.062, 0.16), darkTrim, 0, 0.18, 0.065);
        createPart(headVis, new THREE.BoxGeometry(0.254, 0.044, 0.03), accent, 0, 0.18, 0.14);
        break;
      }
      case 'hood': {
        // Tactical cowl/hood wrapping back, sides & top
        createPart(headVis, new THREE.BoxGeometry(0.29, 0.28, 0.26), primary, 0, 0.175, -0.02);
        createPart(headVis, new THREE.BoxGeometry(0.27, 0.05, 0.12), accent, 0, 0.305, 0.06, 0.18, 0, 0);
        createPart(headVis, new THREE.BoxGeometry(0.03, 0.22, 0.08), secondary, 0.14, 0.16, 0.08);
        createPart(headVis, new THREE.BoxGeometry(0.03, 0.22, 0.08), secondary, -0.14, 0.16, 0.08);
        break;
      }
      case 'crown': {
        // Golden spiked royal crown
        const crownGold = makeMat(this.skin.accentColor, 0.22, 0.78, this.skin.accentColor, 0.15);
        createPart(headVis, new THREE.CylinderGeometry(0.135, 0.13, 0.055, 8), crownGold, 0, 0.315, 0);
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          createPart(
            headVis,
            new THREE.ConeGeometry(0.028, 0.065, 4),
            crownGold,
            Math.sin(ang) * 0.115,
            0.365,
            Math.cos(ang) * 0.115,
          );
        }
        createPart(headVis, new THREE.BoxGeometry(0.03, 0.03, 0.025), primary, 0, 0.318, 0.132);
        break;
      }
      case 'bandana': {
        // Tied tactical headband + twin fluttering rear tails
        createPart(headVis, new THREE.BoxGeometry(0.262, 0.055, 0.262), primary, 0, 0.23, 0);
        createPart(headVis, new THREE.BoxGeometry(0.05, 0.05, 0.04), accent, 0, 0.23, -0.14);
        createPart(headVis, new THREE.BoxGeometry(0.038, 0.13, 0.02), primary, 0.035, 0.16, -0.165, 0.35, 0, 0.22);
        createPart(headVis, new THREE.BoxGeometry(0.038, 0.11, 0.02), primary, -0.035, 0.165, -0.165, 0.3, 0, -0.2);
        break;
      }
      case 'helmet': {
        // Full combat/knight helmet with glowing visor slit
        createPart(headVis, new THREE.BoxGeometry(0.28, 0.29, 0.29), primary, 0, 0.165, 0);
        createPart(headVis, new THREE.BoxGeometry(0.10, 0.07, 0.31), secondary, 0, 0.305, -0.01);
        createPart(headVis, new THREE.BoxGeometry(0.22, 0.04, 0.04), accent, 0, 0.175, 0.14);
        createPart(headVis, new THREE.BoxGeometry(0.20, 0.09, 0.03), secondary, 0, 0.085, 0.14);
        break;
      }
      case 'beanie': {
        // Snug knit beanie + folded cuff
        createPart(headVis, new THREE.BoxGeometry(0.265, 0.12, 0.275), primary, 0, 0.275, -0.015, -0.08, 0, 0);
        createPart(headVis, new THREE.BoxGeometry(0.275, 0.055, 0.282), accent, 0, 0.225, -0.01, -0.08, 0, 0);
        createPart(headVis, new THREE.SphereGeometry(0.042, 8, 8), secondary, 0, 0.355, -0.04);
        break;
      }
    }
  }

  private buildArmVisuals(
    shoulder: THREE.Group,
    elbow: THREE.Group,
    hand: THREE.Group,
    sideSign: 1 | -1,
    primary: THREE.Material,
    secondary: THREE.Material,
    accent: THREE.Material,
    skinMat: THREE.Material,
  ): void {
    const shVis = this.attachVisualGroup(shoulder, `shoulder_vis_${sideSign}`);
    // Tactical angled shoulder pad
    createPart(
      shVis,
      new THREE.BoxGeometry(0.14, 0.11, 0.16),
      secondary,
      sideSign * 0.025,
      0.01,
      0,
      0,
      0,
      sideSign * -0.22,
    );
    createPart(
      shVis,
      new THREE.BoxGeometry(0.145, 0.032, 0.165),
      accent,
      sideSign * 0.028,
      0.045,
      0,
      0,
      0,
      sideSign * -0.22,
    );
    // Upper arm sleeve
    createPart(shVis, new THREE.BoxGeometry(0.105, 0.23, 0.105), primary, sideSign * 0.005, -0.12, 0);

    const elVis = this.attachVisualGroup(elbow, `elbow_vis_${sideSign}`);
    // Forearm (skin + tactical wrist bracer)
    createPart(elVis, new THREE.BoxGeometry(0.09, 0.14, 0.09), skinMat, 0, -0.075, 0);
    createPart(elVis, new THREE.BoxGeometry(0.098, 0.10, 0.098), secondary, 0, -0.18, 0);
    createPart(elVis, new THREE.BoxGeometry(0.102, 0.025, 0.102), accent, 0, -0.145, 0);

    const haVis = this.attachVisualGroup(hand, `hand_vis_${sideSign}`);
    // Tactical glove
    createPart(haVis, new THREE.BoxGeometry(0.088, 0.095, 0.092), secondary, 0, -0.045, 0.01);
    createPart(haVis, new THREE.BoxGeometry(0.092, 0.03, 0.05), accent, 0, -0.03, 0.04);
  }

  private buildLegVisuals(
    hip: THREE.Group,
    knee: THREE.Group,
    foot: THREE.Group,
    sideSign: 1 | -1,
    primary: THREE.Material,
    secondary: THREE.Material,
    accent: THREE.Material,
    bootMat: THREE.Material,
    soleMat: THREE.Material,
  ): void {
    const hipVis = this.attachVisualGroup(hip, `hip_vis_${sideSign}`);
    // Thigh
    createPart(hipVis, new THREE.BoxGeometry(0.145, 0.38, 0.155), primary, 0, -0.19, 0);
    // Tactical thigh strap / holster on right thigh (-1)
    createPart(hipVis, new THREE.BoxGeometry(0.155, 0.045, 0.165), secondary, 0, -0.16, 0);
    if (sideSign === -1) {
      createPart(hipVis, new THREE.BoxGeometry(0.04, 0.11, 0.08), accent, -0.085, -0.17, 0.01);
    }

    const kneeVis = this.attachVisualGroup(knee, `knee_vis_${sideSign}`);
    // Shin + sculpted knee pad
    createPart(kneeVis, new THREE.BoxGeometry(0.125, 0.35, 0.135), secondary, 0, -0.18, 0);
    createPart(kneeVis, new THREE.BoxGeometry(0.11, 0.105, 0.055), bootMat, 0, -0.02, 0.065);
    createPart(kneeVis, new THREE.BoxGeometry(0.07, 0.035, 0.06), accent, 0, -0.02, 0.072);

    const footVis = this.attachVisualGroup(foot, `foot_vis_${sideSign}`);
    // Boot cuff + main upper + thick tread sole (bottom sits cleanly at world y = 0!)
    createPart(footVis, new THREE.BoxGeometry(0.135, 0.045, 0.145), accent, 0, 0.02, 0);
    createPart(footVis, new THREE.BoxGeometry(0.13, 0.085, 0.215), bootMat, 0, -0.035, 0.035);
    createPart(footVis, new THREE.BoxGeometry(0.14, 0.038, 0.235), soleMat, 0, -0.081, 0.038);
  }

  private buildBackbling(
    backVis: THREE.Group,
    primary: THREE.Material,
    secondary: THREE.Material,
    accent: THREE.Material,
  ): void {
    switch (this.skin.backblingStyle) {
      case 'none':
        break;
      case 'pack': {
        createPart(backVis, new THREE.BoxGeometry(0.24, 0.30, 0.12), secondary, 0, 0, -0.05);
        createPart(backVis, new THREE.BoxGeometry(0.20, 0.12, 0.14), primary, 0, 0.06, -0.06);
        createPart(backVis, new THREE.BoxGeometry(0.14, 0.035, 0.148), accent, 0, 0.06, -0.065);
        createPart(backVis, new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), accent, 0.085, 0.20, -0.07);
        break;
      }
      case 'cape': {
        createPart(backVis, new THREE.BoxGeometry(0.32, 0.05, 0.08), accent, 0, 0.14, 0.02);
        createPart(backVis, new THREE.BoxGeometry(0.34, 0.56, 0.028), primary, 0, -0.14, -0.05, 0.14, 0, 0);
        createPart(backVis, new THREE.BoxGeometry(0.22, 0.48, 0.032), secondary, 0, -0.14, -0.055, 0.14, 0, 0);
        createPart(backVis, new THREE.BoxGeometry(0.35, 0.04, 0.034), accent, 0, -0.39, -0.09, 0.14, 0, 0);
        break;
      }
      case 'wings': {
        createPart(backVis, new THREE.BoxGeometry(0.14, 0.16, 0.06), secondary, 0, 0.03, -0.03);
        for (const side of [1, -1]) {
          createPart(
            backVis,
            new THREE.BoxGeometry(0.42, 0.14, 0.03),
            secondary,
            side * 0.24,
            0.10,
            -0.08,
            0.1,
            side * -0.25,
            side * 0.32,
          );
          createPart(
            backVis,
            new THREE.BoxGeometry(0.34, 0.07, 0.035),
            accent,
            side * 0.26,
            0.05,
            -0.09,
            0.1,
            side * -0.25,
            side * 0.22,
          );
          createPart(
            backVis,
            new THREE.BoxGeometry(0.28, 0.08, 0.025),
            primary,
            side * 0.20,
            -0.05,
            -0.07,
            0.1,
            side * -0.2,
            side * 0.08,
          );
        }
        break;
      }
      case 'shield': {
        createPart(backVis, new THREE.BoxGeometry(0.30, 0.38, 0.045), secondary, 0, -0.02, -0.03, 0, 0, 0.15);
        createPart(backVis, new THREE.BoxGeometry(0.24, 0.31, 0.054), primary, 0, -0.02, -0.035, 0, 0, 0.15);
        createPart(backVis, new THREE.BoxGeometry(0.11, 0.14, 0.064), accent, 0, -0.01, -0.04, 0, 0, 0.15);
        break;
      }
    }
  }

  private buildGliderVisual(): void {
    if (this.gliderVisualGroup) {
      disposeObject3D(this.gliderVisualGroup);
      this.joints.gliderSocket.remove(this.gliderVisualGroup);
      this.gliderVisualGroup = null;
    }

    const grp = new THREE.Group();
    grp.name = `glider_${this.glider.style}`;

    const primary = makeMat(this.glider.primaryColor, 0.4, 0.25);
    const accent = makeMat(this.glider.accentColor, 0.28, 0.35, this.glider.accentColor, 0.25);
    const frameMat = makeMat('#1e293b', 0.45, 0.55);

    switch (this.glider.style) {
      case 'wing': {
        // Swept hang-glider wing overhead + twin grip handles hanging down
        createPart(grp, new THREE.BoxGeometry(0.24, 0.07, 0.95), primary, 0, 0, 0);
        createPart(grp, new THREE.BoxGeometry(0.95, 0.05, 0.55), primary, 0.54, -0.04, -0.10, 0, -0.35, -0.1);
        createPart(grp, new THREE.BoxGeometry(0.95, 0.05, 0.55), primary, -0.54, -0.04, -0.10, 0, 0.35, 0.1);
        createPart(grp, new THREE.BoxGeometry(0.95, 0.056, 0.12), accent, 0.54, -0.04, 0.14, 0, -0.35, -0.1);
        createPart(grp, new THREE.BoxGeometry(0.95, 0.056, 0.12), accent, -0.54, -0.04, 0.14, 0, 0.35, 0.1);
        // Handlebar trapezoid
        createPart(grp, new THREE.CylinderGeometry(0.014, 0.014, 0.32, 6), frameMat, 0.20, -0.15, 0.04, 0, 0, 0.35);
        createPart(grp, new THREE.CylinderGeometry(0.014, 0.014, 0.32, 6), frameMat, -0.20, -0.15, 0.04, 0, 0, -0.35);
        createPart(grp, new THREE.CylinderGeometry(0.018, 0.018, 0.54, 8), accent, 0, -0.28, 0.04, 0, 0, Math.PI / 2);
        break;
      }
      case 'umbrella': {
        // Royal Parasol canopy + shaft + curved grip
        createPart(grp, new THREE.ConeGeometry(0.88, 0.28, 8), primary, 0, 0.06, 0);
        createPart(grp, new THREE.CylinderGeometry(0.88, 0.89, 0.04, 8), accent, 0, -0.08, 0);
        createPart(grp, new THREE.SphereGeometry(0.045, 8, 8), accent, 0, 0.21, 0);
        createPart(grp, new THREE.CylinderGeometry(0.016, 0.016, 0.44, 8), frameMat, 0, -0.18, 0);
        createPart(grp, new THREE.BoxGeometry(0.14, 0.032, 0.032), accent, 0, -0.40, 0);
        break;
      }
      case 'hover': {
        // Cyber Hoverboard positioned under character feet!
        const boardY = -2.06;
        createPart(grp, new THREE.BoxGeometry(0.36, 0.055, 1.38), primary, 0, boardY, 0.02);
        createPart(grp, new THREE.BoxGeometry(0.40, 0.03, 1.24), accent, 0, boardY - 0.01, 0.02);
        createPart(grp, new THREE.CylinderGeometry(0.11, 0.13, 0.04, 10), accent, 0, boardY - 0.04, 0.42);
        createPart(grp, new THREE.CylinderGeometry(0.11, 0.13, 0.04, 10), accent, 0, boardY - 0.04, -0.42);
        break;
      }
      case 'jet': {
        // Twin turbojet crimson glider
        createPart(grp, new THREE.BoxGeometry(0.26, 0.10, 1.05), primary, 0, 0.02, 0);
        createPart(grp, new THREE.BoxGeometry(1.75, 0.045, 0.50), primary, 0, 0.0, -0.08);
        createPart(grp, new THREE.BoxGeometry(1.80, 0.052, 0.11), accent, 0, 0.0, 0.16);
        for (const side of [1, -1]) {
          createPart(grp, new THREE.CylinderGeometry(0.09, 0.11, 0.56, 10), frameMat, side * 0.42, 0.02, -0.08, Math.PI / 2);
          createPart(grp, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10), accent, side * 0.42, 0.02, -0.37, Math.PI / 2);
          createPart(grp, new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), frameMat, side * 0.20, -0.14, 0.04, 0, 0, side * 0.25);
        }
        createPart(grp, new THREE.CylinderGeometry(0.018, 0.018, 0.52, 8), accent, 0, -0.26, 0.04, 0, 0, Math.PI / 2);
        break;
      }
    }

    this.joints.gliderSocket.add(grp);
    this.gliderVisualGroup = grp;
  }

  public equipWeapon(weaponId: WeaponId, isBuildMode = false): void {
    if (this.disposed) return;

    const targetKey = isBuildMode ? '__blueprint__' : weaponId;
    if (this.equippedWeaponId === weaponId && this.buildMode === isBuildMode && this.activeWeaponGroup) {
      return;
    }

    this.equippedWeaponId = weaponId;
    this.buildMode = isBuildMode;

    if (this.activeWeaponGroup) {
      this.activeWeaponGroup.visible = false;
    }

    let nextGroup = this.weaponCache.get(targetKey);
    if (!nextGroup) {
      nextGroup = isBuildMode
        ? createBlueprintModel()
        : createWeaponModel(weaponId, this.pickaxe);
      this.weaponCache.set(targetKey, nextGroup);
      this.joints.weaponSocket.add(nextGroup);
    }

    nextGroup.visible = true;
    this.activeWeaponGroup = nextGroup;
  }

  public getMuzzleWorldPosition(out?: THREE.Vector3): THREE.Vector3 {
    const target = out ?? new THREE.Vector3();
    this.joints.root.updateMatrixWorld(true);

    if (!this.buildMode && this.activeWeaponGroup) {
      const muzzleOffset = this.activeWeaponGroup.userData.muzzleOffset as THREE.Vector3 | undefined;
      if (muzzleOffset instanceof THREE.Vector3) {
        target.copy(muzzleOffset);
        return this.activeWeaponGroup.localToWorld(target);
      }
    }

    return this.joints.weaponSocket.getWorldPosition(target);
  }

  public setGliderOpen(open: boolean, openFactor = open ? 1 : 0): void {
    this.gliderOpen = open;
    this.gliderOpenFactor = clamp(openFactor, 0, 1);

    if (!open || this.gliderOpenFactor <= 0.01) {
      this.joints.gliderSocket.visible = false;
      this.joints.gliderSocket.position.set(0, 0.15, 0);
      this.joints.gliderSocket.scale.setScalar(0.001);
      return;
    }

    this.joints.gliderSocket.visible = true;
    this.joints.gliderSocket.position.set(0, 0.9, 0.06);
    const s = 0.25 + 0.75 * this.gliderOpenFactor;
    this.joints.gliderSocket.scale.set(s, s, s);
  }

  public setSkin(skin: SkinDef): void {
    if (this.disposed) return;
    this.skin = skin;
    this.buildSkinVisuals();
  }

  public setPickaxe(pickaxe: PickaxeDef): void {
    if (this.disposed) return;
    this.pickaxe = pickaxe;

    const cachedPickaxe = this.weaponCache.get('pickaxe');
    if (cachedPickaxe) {
      disposeObject3D(cachedPickaxe);
      this.joints.weaponSocket.remove(cachedPickaxe);
      this.weaponCache.delete('pickaxe');
      if (this.activeWeaponGroup === cachedPickaxe) {
        this.activeWeaponGroup = null;
      }
    }

    if (this.equippedWeaponId === 'pickaxe' && !this.buildMode) {
      this.equipWeapon('pickaxe', false);
    }
  }

  public setGlider(glider: GliderDef): void {
    if (this.disposed) return;
    this.glider = glider;
    this.buildGliderVisual();
    this.setGliderOpen(this.gliderOpen, this.gliderOpenFactor);
  }

  public setVisible(visible: boolean): void {
    this.joints.root.visible = visible;
  }

  public getGroup(): THREE.Group {
    return this.joints.root;
  }

  public getEquippedWeaponId(): WeaponId {
    return this.equippedWeaponId;
  }

  public isBuildMode(): boolean {
    return this.buildMode;
  }

  public isGliderOpen(): boolean {
    return this.gliderOpen;
  }

  public getSkin(): SkinDef {
    return this.skin;
  }

  public getPickaxe(): PickaxeDef {
    return this.pickaxe;
  }

  public getGlider(): GliderDef {
    return this.glider;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.clearSkinVisuals();

    for (const grp of this.weaponCache.values()) {
      disposeObject3D(grp);
      this.joints.weaponSocket.remove(grp);
    }
    this.weaponCache.clear();
    this.activeWeaponGroup = null;

    if (this.gliderVisualGroup) {
      disposeObject3D(this.gliderVisualGroup);
      this.joints.gliderSocket.remove(this.gliderVisualGroup);
      this.gliderVisualGroup = null;
    }

    disposeObject3D(this.joints.root);
    this.joints.root.parent?.remove(this.joints.root);
  }
}
