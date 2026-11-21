import * as THREE from 'three';
import type {
  AnimState,
  BackblingStyle,
  CharacterRenderState,
  ContrailDef,
  GliderDef,
  PickaxeDef,
  SkinDef,
  SpecialistRole,
  WeaponId,
} from '../types';
import { CONTRAILS, GLIDERS, PICKAXES, SKINS, WEAPON_WRAPS, clamp } from '../core';
import {
  applyWeaponWrap,
  createBlueprintModel,
  createWeaponModel,
  disposeObject3D,
  getWeaponWrapDef,
} from './WeaponModels';

export function getAllyRoleColor(role?: SpecialistRole): string {
  switch (role) {
    case 'medic':
      return '#22c55e';
    case 'heavy':
      return '#fbbf24';
    case 'scout':
    default:
      return '#22d3ee';
  }
}

export function getContrailDef(contrailId?: string): ContrailDef {
  if (contrailId) {
    const found = CONTRAILS.find((c) => c.id === contrailId);
    if (found) return found;
  }
  return CONTRAILS[0];
}

export function shouldActivateContrail(
  state: Pick<CharacterRenderState, 'animState' | 'grounded' | 'velocityY'>,
  resolvedAnim?: AnimState,
): boolean {
  const anim = resolvedAnim ?? state.animState;
  if (anim === 'glide') return false;
  return anim === 'skydive' || (!state.grounded && (state.velocityY ?? 0) < -8);
}

const CONTRAIL_WHITE = new THREE.Color('#ffffff');
const CONTRAIL_PARTICLES_PER_LIMB = 6;

interface ContrailParticle {
  mesh: THREE.Mesh;
  phaseOffset: number;
  radialAngle: number;
  radialRadius: number;
  speed: number;
}

interface ContrailLimbStream {
  group: THREE.Group;
  cuffMesh: THREE.Mesh;
  primaryRibbon: THREE.Mesh;
  secondaryRibbon: THREE.Mesh;
  particles: ContrailParticle[];
  isFoot: boolean;
  sideSign: 1 | -1;
}

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

interface BackblingParts {
  style: BackblingStyle;
  capeUpper?: THREE.Group;
  capeLower?: THREE.Group;
  leftWing?: THREE.Group;
  rightWing?: THREE.Group;
  packAntenna?: THREE.Group;
  shieldPivot?: THREE.Group;
}

const GROUND_SHADOW_BASE_OPACITY = 0.46;
const GROUND_SHADOW_MAX_HEIGHT = 8.0;
const GROUND_SHADOW_RADIUS = 0.48;
let cachedGroundShadowTexture: THREE.CanvasTexture | null = null;

function getGroundShadowTexture(): THREE.CanvasTexture {
  if (cachedGroundShadowTexture) return cachedGroundShadowTexture;

  const size = 128;
  let canvas: HTMLCanvasElement;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const cx = size * 0.5;
      const cy = size * 0.5;
      const steps = 24;
      for (let i = steps; i >= 1; i--) {
        const r = (size * 0.46) * (i / steps);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.055)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    canvas = {
      width: size,
      height: size,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = 'ground_contact_shadow_tex';
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedGroundShadowTexture = tex;
  return tex;
}

function applyArmorRimShader(
  mat: THREE.MeshStandardMaterial,
  rimColor: THREE.ColorRepresentation,
  strength = 0.22,
): THREE.MeshStandardMaterial {
  const rimCol = new THREE.Color(rimColor);
  mat.userData.hasArmorRim = true;
  mat.customProgramCacheKey = () => 'armor_fresnel_rim_v1';
  mat.onBeforeCompile = (shader) => {
    try {
      if (
        !shader ||
        typeof shader.fragmentShader !== 'string' ||
        !shader.fragmentShader.includes('#include <common>') ||
        !shader.fragmentShader.includes('#include <opaque_fragment>')
      ) {
        return;
      }
      if (!shader.uniforms) {
        shader.uniforms = {};
      }
      shader.uniforms.uRimColor = { value: rimCol };
      shader.uniforms.uRimStrength = { value: strength };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;',
        )
        .replace(
          '#include <opaque_fragment>',
          `float rimNdotV = clamp( dot( normal / max( length( normal ), 0.0001 ), vViewPosition / max( length( vViewPosition ), 0.0001 ) ), 0.0, 1.0 );
float rimInv = 1.0 - rimNdotV;
float rimFresnel = rimInv * rimInv * rimInv;
outgoingLight += uRimColor * ( rimFresnel * uRimStrength );
#include <opaque_fragment>`,
        );
    } catch {
      // Safe fallback for mock or non-standard shader environments
    }
  };
  return mat;
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
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  if (sx !== 1 || sy !== 1 || sz !== 1) {
    mesh.scale.set(sx, sy, sz);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Stylized ~1.85m cartoon-tactical sculpted humanoid character rig.
 * Root sits at feet (y = 0); local +Z is forward (yaw = 0 faces +Z).
 */
export class CharacterRig {
  public readonly joints: CharacterJoints;

  private skin: SkinDef;
  private pickaxe: PickaxeDef;
  private glider: GliderDef;

  private equippedWeaponId: WeaponId = 'pickaxe';
  private currentWrapId: string = WEAPON_WRAPS[0]?.id ?? 'factory_matte';
  private currentContrailId: string = CONTRAILS[0]?.id ?? 'wind_stream';
  private buildMode = false;
  private gliderOpen = false;
  private gliderOpenFactor = 0;

  private readonly skinVisualRoots: THREE.Group[] = [];
  private readonly weaponCache = new Map<string, THREE.Group>();
  private activeWeaponGroup: THREE.Group | null = null;
  private gliderVisualGroup: THREE.Group | null = null;
  private backblingParts: BackblingParts = { style: 'none' };
  private groundShadowMesh: THREE.Mesh | null = null;
  private groundShadowMat: THREE.MeshBasicMaterial | null = null;
  private lastGroundedY = 0;
  private bossAuraEnabled = false;
  private bossAuraTime = 0;
  private bossAuraGroup: THREE.Group | null = null;
  private bossCrownRing: THREE.Group | null = null;
  private bossBeaconMesh: THREE.Mesh | null = null;
  private bossBeaconMat: THREE.MeshBasicMaterial | null = null;
  private bossCoreBeamMat: THREE.MeshBasicMaterial | null = null;
  private bossAuraHaloMesh: THREE.Mesh | null = null;
  private bossAuraHaloMat: THREE.MeshBasicMaterial | null = null;
  private allyAuraEnabled = false;
  private allyAuraTime = 0;
  private allyRole: SpecialistRole = 'scout';
  private allyAuraGroup: THREE.Group | null = null;
  private allyChevronGroup: THREE.Group | null = null;
  private allyRoleRingMesh: THREE.Mesh | null = null;
  private allyRoleRingMat: THREE.MeshStandardMaterial | null = null;
  private allyRoleHaloMesh: THREE.Mesh | null = null;
  private allyRoleHaloMat: THREE.MeshBasicMaterial | null = null;
  private contrailActive = false;
  private contrailTime = 0;
  private contrailPrimaryMat: THREE.MeshBasicMaterial | null = null;
  private contrailSecondaryMat: THREE.MeshBasicMaterial | null = null;
  private contrailCoreMat: THREE.MeshBasicMaterial | null = null;
  private readonly contrailStreams: ContrailLimbStream[] = [];
  private disposed = false;

  constructor(skin?: SkinDef, pickaxe?: PickaxeDef, glider?: GliderDef, contrailId?: string) {
    this.skin = skin ?? SKINS[0];
    this.pickaxe = pickaxe ?? PICKAXES[0];
    this.glider = glider ?? GLIDERS[0];

    this.joints = this.createJointHierarchy();
    this.joints.rightShoulder.rotation.set(-0.52, 0.08, -0.14);
    this.joints.rightElbow.rotation.set(-0.62, 0, 0);
    this.joints.leftShoulder.rotation.set(-0.35, -0.1, 0.1);
    this.joints.leftElbow.rotation.set(-0.45, 0, 0);

    this.buildGroundShadow();
    this.buildSkinVisuals();
    this.buildGliderVisual();
    this.buildContrailVisuals();
    this.setContrail(contrailId);
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
    leftShoulder.position.set(0.235, 0.16, 0);
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
    rightShoulder.position.set(-0.235, 0.16, 0);
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

  private buildGroundShadow(): void {
    const geo = new THREE.CircleGeometry(GROUND_SHADOW_RADIUS, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x050810,
      map: getGroundShadowTexture(),
      transparent: true,
      opacity: GROUND_SHADOW_BASE_OPACITY,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'ground_contact_shadow';
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.025, 0);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = -1;

    this.joints.root.add(mesh);
    this.groundShadowMesh = mesh;
    this.groundShadowMat = mat;
  }

  private clearSkinVisuals(): void {
    for (const grp of this.skinVisualRoots) {
      disposeObject3D(grp);
      grp.parent?.remove(grp);
    }
    this.skinVisualRoots.length = 0;
    this.backblingParts = { style: 'none' };
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

    const primary = applyArmorRimShader(makeMat(this.skin.primaryColor, 0.48, 0.16), '#dbeafe', 0.18);
    const secondary = applyArmorRimShader(makeMat(this.skin.secondaryColor, 0.56, 0.22), '#cbd5e1', 0.2);
    const accent = applyArmorRimShader(
      makeMat(this.skin.accentColor, 0.30, 0.38, this.skin.accentColor, 0.16),
      this.skin.accentColor,
      0.26,
    );
    const skinMat = makeMat(this.skin.skinTone, 0.72, 0.02);
    const hairMat = makeMat(this.skin.hairColor, 0.78, 0.05);
    const darkTrim = makeMat('#0f172a', 0.55, 0.3);
    const armorSteel = applyArmorRimShader(makeMat('#334155', 0.36, 0.58), '#93c5fd', 0.24);
    const bootMat = makeMat('#1e293b', 0.65, 0.18);
    const soleMat = makeMat('#0f172a', 0.85, 0.05);
    const scleraMat = makeMat('#f8fafc', 0.25, 0.0);
    const irisMat = makeMat('#0ea5e9', 0.22, 0.12);
    const pupilMat = makeMat('#020617', 0.18, 0.0);
    const catchlightMat = makeMat('#ffffff', 0.1, 0.0, '#ffffff', 0.45);

    // --- Hips & Tactical Utility Belt + Pouches ---
    const hipVis = this.attachVisualGroup(this.joints.hips, 'hips_visual');
    createPart(hipVis, new THREE.CylinderGeometry(0.155, 0.166, 0.15, 12), secondary, 0, 0.01, 0, 0, 0, 0, 1.04, 1, 0.68);
    // Belt webbing + metallic clasp buckle
    createPart(hipVis, new THREE.CylinderGeometry(0.168, 0.172, 0.055, 12), darkTrim, 0, 0.06, 0, 0, 0, 0, 1.05, 1, 0.72);
    createPart(hipVis, new THREE.BoxGeometry(0.082, 0.060, 0.03), armorSteel, 0, 0.06, 0.118);
    createPart(hipVis, new THREE.BoxGeometry(0.052, 0.036, 0.036), accent, 0, 0.06, 0.122);
    // Tactical dual side ammo pouches + flap + rear utility pack + canteen
    for (const side of [1, -1]) {
      createPart(hipVis, new THREE.BoxGeometry(0.062, 0.09, 0.095), secondary, side * 0.185, 0.035, 0.02, 0, 0, side * -0.1);
      createPart(hipVis, new THREE.BoxGeometry(0.066, 0.026, 0.098), accent, side * 0.188, 0.068, 0.02, 0, 0, side * -0.1);
    }
    createPart(hipVis, new THREE.BoxGeometry(0.125, 0.082, 0.068), primary, 0, 0.04, -0.128);
    createPart(hipVis, new THREE.BoxGeometry(0.09, 0.024, 0.072), darkTrim, 0, 0.068, -0.13);
    createPart(hipVis, new THREE.CylinderGeometry(0.028, 0.028, 0.085, 8), armorSteel, -0.11, 0.035, -0.115);

    // --- Spine / Sculpted Tapered Waist ---
    const spineVis = this.attachVisualGroup(this.joints.spine, 'spine_visual');
    createPart(spineVis, new THREE.CylinderGeometry(0.156, 0.138, 0.21, 12), primary, 0, 0.06, 0, 0, 0, 0, 1.04, 1, 0.68);
    // Tactical rib-brace belt & abdominal armor strips
    createPart(spineVis, new THREE.CylinderGeometry(0.152, 0.146, 0.058, 12), secondary, 0, 0.02, 0, 0, 0, 0, 1.05, 1, 0.72);
    createPart(spineVis, new THREE.BoxGeometry(0.16, 0.055, 0.03), secondary, 0, 0.09, 0.098);
    createPart(spineVis, new THREE.BoxGeometry(0.12, 0.045, 0.028), armorSteel, 0, 0.035, 0.098);

    // --- Chest & Layered Armor Plates ---
    const chestVis = this.attachVisualGroup(this.joints.chest, 'chest_visual');
    createPart(chestVis, new THREE.CylinderGeometry(0.190, 0.152, 0.27, 12), primary, 0, 0.105, 0, 0, 0, 0, 1.08, 1, 0.68);
    // Angled front pectoral armor plates + sternum power core
    for (const side of [1, -1]) {
      createPart(
        chestVis,
        new THREE.BoxGeometry(0.145, 0.145, 0.055),
        secondary,
        side * 0.088,
        0.135,
        0.105,
        -0.12,
        side * -0.18,
        side * 0.06,
      );
      createPart(
        chestVis,
        new THREE.BoxGeometry(0.052, 0.115, 0.062),
        accent,
        side * 0.098,
        0.12,
        0.108,
        -0.12,
        side * -0.18,
        0,
      );
      // Clavicle tactical harness straps
      createPart(
        chestVis,
        new THREE.BoxGeometry(0.048, 0.045, 0.225),
        darkTrim,
        side * 0.105,
        0.225,
        0,
        0,
        0,
        side * -0.14,
      );
    }
    // Central sternum core & dorsal backplate
    createPart(chestVis, new THREE.BoxGeometry(0.085, 0.095, 0.045), armorSteel, 0, 0.135, 0.115);
    createPart(chestVis, new THREE.BoxGeometry(0.052, 0.045, 0.052), accent, 0, 0.14, 0.118);
    createPart(chestVis, new THREE.BoxGeometry(0.24, 0.20, 0.045), secondary, 0, 0.115, -0.108);
    // Sculpted collar armor ring
    createPart(chestVis, new THREE.CylinderGeometry(0.092, 0.118, 0.052, 12), secondary, 0, 0.235, 0);
    createPart(chestVis, new THREE.CylinderGeometry(0.096, 0.105, 0.02, 12), accent, 0, 0.25, 0);

    // --- Neck ---
    const neckVis = this.attachVisualGroup(this.joints.neck, 'neck_visual');
    createPart(neckVis, new THREE.CylinderGeometry(0.056, 0.068, 0.105, 10), skinMat, 0, 0.042, 0);

    // --- Head & Expressive Sculpted Face ---
    const headVis = this.attachVisualGroup(this.joints.head, 'head_visual');
    // Rounded sculpted cranium + cheek/jawline taper
    createPart(headVis, new THREE.SphereGeometry(0.130, 14, 12), skinMat, 0, 0.175, 0, 0, 0, 0, 0.96, 1.02, 1.0);
    createPart(headVis, new THREE.CylinderGeometry(0.116, 0.084, 0.125, 10), skinMat, 0, 0.095, 0.008, 0, 0, 0, 0.98, 1, 0.96);
    createPart(headVis, new THREE.BoxGeometry(0.085, 0.042, 0.085), skinMat, 0, 0.042, 0.045, 0.14, 0, 0);
    // Sculpted ears
    createPart(headVis, new THREE.BoxGeometry(0.032, 0.072, 0.046), skinMat, 0.128, 0.145, -0.01, 0, 0, -0.1);
    createPart(headVis, new THREE.BoxGeometry(0.032, 0.072, 0.046), skinMat, -0.128, 0.145, -0.01, 0, 0, 0.1);
    // Nose bridge
    createPart(headVis, new THREE.BoxGeometry(0.030, 0.055, 0.044), skinMat, 0, 0.135, 0.126, -0.12, 0, 0);

    // Expressive eyes (sclera + iris + pupil + specular catchlight + sculpted tilted brow) facing +Z
    for (const side of [1, -1]) {
      const ex = side * 0.052;
      createPart(headVis, new THREE.BoxGeometry(0.046, 0.034, 0.016), scleraMat, ex, 0.168, 0.116);
      createPart(headVis, new THREE.BoxGeometry(0.025, 0.026, 0.018), irisMat, ex, 0.166, 0.120);
      createPart(headVis, new THREE.BoxGeometry(0.013, 0.015, 0.020), pupilMat, ex, 0.166, 0.122);
      createPart(headVis, new THREE.BoxGeometry(0.006, 0.006, 0.022), catchlightMat, ex + 0.005, 0.172, 0.123);
      // Expressive angled brow ridge
      createPart(
        headVis,
        new THREE.BoxGeometry(0.056, 0.016, 0.024),
        hairMat,
        ex,
        0.200,
        0.122,
        0.1,
        side * -0.15,
        side * -0.16,
      );
    }
    // Confident smirk / mouth line
    createPart(headVis, new THREE.BoxGeometry(0.062, 0.011, 0.014), darkTrim, 0, 0.084, 0.118, 0, 0, 0.05);

    // --- Headgear & Hair ---
    this.buildHeadgear(headVis, primary, secondary, accent, hairMat, darkTrim, armorSteel);

    // --- Arms, Shoulder Pauldrons, Gauntlets, Gloves ---
    this.buildArmVisuals(
      this.joints.leftShoulder,
      this.joints.leftElbow,
      this.joints.leftHand,
      1,
      primary,
      secondary,
      accent,
      skinMat,
      armorSteel,
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
      armorSteel,
    );

    // --- Legs, Knee Guards, Boots ---
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
      armorSteel,
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
      armorSteel,
    );

    // --- Articulated Backbling ---
    const backVis = this.attachVisualGroup(this.joints.backblingSocket, 'backbling_visual');
    this.buildBackbling(backVis, primary, secondary, accent, armorSteel);
  }

  private buildHeadgear(
    headVis: THREE.Group,
    primary: THREE.Material,
    secondary: THREE.Material,
    accent: THREE.Material,
    hairMat: THREE.Material,
    darkTrim: THREE.Material,
    armorSteel: THREE.Material,
  ): void {
    const style = this.skin.headgear;

    if (style === 'none' || style === 'cap' || style === 'visor' || style === 'crown' || style === 'bandana') {
      createPart(headVis, new THREE.SphereGeometry(0.136, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat, 0, 0.185, -0.005);
      createPart(headVis, new THREE.CylinderGeometry(0.125, 0.112, 0.13, 10), hairMat, 0, 0.185, -0.045);
    }

    switch (style) {
      case 'none': {
        // Swept sculpted hero hair tufts
        createPart(headVis, new THREE.BoxGeometry(0.17, 0.065, 0.15), hairMat, 0.02, 0.295, 0.03, -0.22, 0.15, -0.15);
        createPart(headVis, new THREE.BoxGeometry(0.11, 0.052, 0.10), hairMat, -0.045, 0.278, 0.088, 0.22, -0.2, 0.12);
        createPart(headVis, new THREE.BoxGeometry(0.08, 0.042, 0.09), accent, 0.06, 0.26, 0.06, -0.1, 0.2, -0.2);
        break;
      }
      case 'cap': {
        // Rounded tactical baseball cap + curved visor brim + badge
        createPart(headVis, new THREE.SphereGeometry(0.142, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), primary, 0, 0.205, -0.005);
        createPart(headVis, new THREE.CylinderGeometry(0.142, 0.144, 0.055, 12), primary, 0, 0.225, -0.005);
        createPart(headVis, new THREE.BoxGeometry(0.22, 0.020, 0.15), secondary, 0, 0.220, 0.142, 0.12, 0, 0);
        createPart(headVis, new THREE.BoxGeometry(0.075, 0.042, 0.02), accent, 0, 0.258, 0.136);
        break;
      }
      case 'visor': {
        // Spiky hair + wraparound glowing cyber visor + side ear comms
        createPart(headVis, new THREE.BoxGeometry(0.19, 0.075, 0.17), hairMat, 0, 0.298, 0.01, -0.18, 0, 0);
        createPart(headVis, new THREE.BoxGeometry(0.11, 0.055, 0.12), hairMat, 0.04, 0.312, -0.04, -0.28, 0.18, -0.12);
        createPart(headVis, new THREE.CylinderGeometry(0.144, 0.144, 0.064, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84), darkTrim, 0, 0.174, 0.008);
        createPart(headVis, new THREE.CylinderGeometry(0.147, 0.147, 0.042, 14, 1, false, -Math.PI * 0.38, Math.PI * 0.76), accent, 0, 0.174, 0.012);
        // Side ear comms pods
        for (const side of [1, -1]) {
          createPart(headVis, new THREE.CylinderGeometry(0.038, 0.038, 0.032, 8), secondary, side * 0.138, 0.17, 0.0, 0, 0, Math.PI / 2);
          createPart(headVis, new THREE.CylinderGeometry(0.022, 0.022, 0.036, 8), accent, side * 0.142, 0.17, 0.0, 0, 0, Math.PI / 2);
        }
        break;
      }
      case 'hood': {
        // Sculpted cowl/hood wrapping back, sides & top peak
        createPart(headVis, new THREE.SphereGeometry(0.158, 12, 10), primary, 0, 0.185, -0.025, 0, 0, 0, 0.98, 1.06, 1.04);
        createPart(headVis, new THREE.BoxGeometry(0.25, 0.048, 0.12), accent, 0, 0.305, 0.055, 0.20, 0, 0);
        createPart(headVis, new THREE.BoxGeometry(0.034, 0.22, 0.09), secondary, 0.138, 0.16, 0.07);
        createPart(headVis, new THREE.BoxGeometry(0.034, 0.22, 0.09), secondary, -0.138, 0.16, 0.07);
        break;
      }
      case 'crown': {
        // Golden spiked royal crown
        const crownGold = applyArmorRimShader(
          makeMat(this.skin.accentColor, 0.22, 0.78, this.skin.accentColor, 0.15),
          '#fef08a',
          0.28,
        );
        createPart(headVis, new THREE.CylinderGeometry(0.132, 0.126, 0.052, 10), crownGold, 0, 0.305, 0);
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          createPart(
            headVis,
            new THREE.ConeGeometry(0.026, 0.062, 4),
            crownGold,
            Math.sin(ang) * 0.112,
            0.352,
            Math.cos(ang) * 0.112,
          );
        }
        createPart(headVis, new THREE.BoxGeometry(0.03, 0.03, 0.025), primary, 0, 0.308, 0.13);
        break;
      }
      case 'bandana': {
        // Tied tactical headband + armored forehead plate + twin fluttering rear tails
        createPart(headVis, new THREE.CylinderGeometry(0.142, 0.142, 0.052, 12), primary, 0, 0.225, 0);
        createPart(headVis, new THREE.BoxGeometry(0.11, 0.038, 0.022), armorSteel, 0, 0.225, 0.138);
        createPart(headVis, new THREE.BoxGeometry(0.05, 0.05, 0.04), accent, 0, 0.225, -0.142);
        createPart(headVis, new THREE.BoxGeometry(0.036, 0.13, 0.02), primary, 0.035, 0.155, -0.165, 0.35, 0, 0.22);
        createPart(headVis, new THREE.BoxGeometry(0.036, 0.11, 0.02), primary, -0.035, 0.160, -0.165, 0.3, 0, -0.2);
        break;
      }
      case 'helmet': {
        // Full faceted tactical/knight combat helmet with glowing visor eye slit & crest ridge
        createPart(headVis, new THREE.SphereGeometry(0.158, 12, 10), primary, 0, 0.185, 0, 0, 0, 0, 0.98, 1.06, 1.02);
        createPart(headVis, new THREE.BoxGeometry(0.24, 0.16, 0.24), primary, 0, 0.12, 0.015);
        createPart(headVis, new THREE.BoxGeometry(0.085, 0.065, 0.28), secondary, 0, 0.305, -0.01);
        // Glowing visor eye-slit + cheek vents
        createPart(headVis, new THREE.BoxGeometry(0.20, 0.036, 0.045), darkTrim, 0, 0.175, 0.128);
        createPart(headVis, new THREE.BoxGeometry(0.185, 0.024, 0.048), accent, 0, 0.175, 0.132);
        createPart(headVis, new THREE.BoxGeometry(0.18, 0.085, 0.035), secondary, 0, 0.085, 0.132);
        break;
      }
      case 'beanie': {
        // Snug knit beanie + folded cuff + pom-pom
        createPart(headVis, new THREE.SphereGeometry(0.146, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), primary, 0, 0.215, -0.012, -0.08, 0, 0);
        createPart(headVis, new THREE.CylinderGeometry(0.148, 0.148, 0.056, 12), accent, 0, 0.218, -0.01, -0.08, 0, 0);
        createPart(headVis, new THREE.SphereGeometry(0.040, 8, 8), secondary, 0, 0.355, -0.035);
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
    armorSteel: THREE.Material,
  ): void {
    const shVis = this.attachVisualGroup(shoulder, `shoulder_vis_${sideSign}`);
    // Sculpted layered shoulder pauldron
    createPart(
      shVis,
      new THREE.BoxGeometry(0.135, 0.095, 0.155),
      secondary,
      sideSign * 0.028,
      0.012,
      0,
      0,
      0,
      sideSign * -0.24,
    );
    createPart(
      shVis,
      new THREE.BoxGeometry(0.115, 0.042, 0.145),
      armorSteel,
      sideSign * 0.036,
      0.048,
      0,
      0,
      0,
      sideSign * -0.28,
    );
    createPart(
      shVis,
      new THREE.BoxGeometry(0.125, 0.022, 0.16),
      accent,
      sideSign * 0.030,
      0.036,
      0,
      0,
      0,
      sideSign * -0.24,
    );
    // Tapered upper arm sleeve + elbow guard cap
    createPart(shVis, new THREE.CylinderGeometry(0.056, 0.047, 0.23, 10), primary, sideSign * 0.005, -0.12, 0);
    createPart(shVis, new THREE.SphereGeometry(0.048, 8, 8), armorSteel, sideSign * 0.005, -0.24, -0.01);

    const elVis = this.attachVisualGroup(elbow, `elbow_vis_${sideSign}`);
    // Tapered forearm + armored wrist bracer/gauntlet
    createPart(elVis, new THREE.CylinderGeometry(0.046, 0.038, 0.145, 10), skinMat, 0, -0.072, 0);
    createPart(elVis, new THREE.CylinderGeometry(0.050, 0.044, 0.105, 10), secondary, 0, -0.175, 0);
    createPart(elVis, new THREE.BoxGeometry(0.032, 0.075, 0.058), armorSteel, sideSign * 0.022, -0.175, 0.005);
    createPart(elVis, new THREE.CylinderGeometry(0.052, 0.052, 0.022, 10), accent, 0, -0.142, 0);

    const haVis = this.attachVisualGroup(hand, `hand_vis_${sideSign}`);
    // Tactical armored glove + knuckle guard
    createPart(haVis, new THREE.BoxGeometry(0.084, 0.090, 0.088), secondary, 0, -0.045, 0.01);
    createPart(haVis, new THREE.BoxGeometry(0.088, 0.028, 0.048), accent, 0, -0.03, 0.04);
    createPart(haVis, new THREE.BoxGeometry(0.024, 0.042, 0.034), secondary, sideSign * -0.038, -0.038, 0.032, 0.3, 0, 0);
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
    armorSteel: THREE.Material,
  ): void {
    const hipVis = this.attachVisualGroup(hip, `hip_vis_${sideSign}`);
    // Tapered athletic thigh
    createPart(hipVis, new THREE.CylinderGeometry(0.080, 0.064, 0.385, 10), primary, 0, -0.19, 0, 0, 0, 0, 1.02, 1, 1.06);
    // Front quad armor plate & tactical thigh strap
    createPart(hipVis, new THREE.BoxGeometry(0.092, 0.15, 0.035), armorSteel, 0, -0.18, 0.064);
    createPart(hipVis, new THREE.CylinderGeometry(0.078, 0.074, 0.042, 10), secondary, 0, -0.16, 0, 0, 0, 0, 1.04, 1, 1.08);
    // Drop-leg holster on right thigh (-1)
    if (sideSign === -1) {
      createPart(hipVis, new THREE.BoxGeometry(0.044, 0.115, 0.082), accent, -0.084, -0.17, 0.01);
      createPart(hipVis, new THREE.BoxGeometry(0.036, 0.045, 0.065), armorSteel, -0.09, -0.125, 0.015);
    }

    const kneeVis = this.attachVisualGroup(knee, `knee_vis_${sideSign}`);
    // Tapered calf/shin + multi-piece sculpted knee guard + shin plate
    createPart(kneeVis, new THREE.CylinderGeometry(0.064, 0.049, 0.355, 10), secondary, 0, -0.18, 0, 0, 0, 0, 1.0, 1, 1.05);
    createPart(kneeVis, new THREE.BoxGeometry(0.112, 0.105, 0.056), bootMat, 0, -0.015, 0.056);
    createPart(kneeVis, new THREE.BoxGeometry(0.088, 0.072, 0.038), armorSteel, 0, -0.015, 0.072);
    createPart(kneeVis, new THREE.BoxGeometry(0.068, 0.028, 0.044), accent, 0, -0.015, 0.076);
    createPart(kneeVis, new THREE.BoxGeometry(0.076, 0.16, 0.032), armorSteel, 0, -0.19, 0.052);

    const footVis = this.attachVisualGroup(foot, `foot_vis_${sideSign}`);
    // Boot cuff + sculpted toe & heel + thick lugged tread sole (bottom sits cleanly at world y = 0!)
    createPart(footVis, new THREE.CylinderGeometry(0.064, 0.068, 0.048, 10), accent, 0, 0.02, 0);
    createPart(footVis, new THREE.BoxGeometry(0.126, 0.084, 0.215), bootMat, 0, -0.035, 0.035);
    createPart(footVis, new THREE.BoxGeometry(0.116, 0.052, 0.09), armorSteel, 0, -0.044, 0.11, 0.14, 0, 0);
    createPart(footVis, new THREE.BoxGeometry(0.138, 0.038, 0.235), soleMat, 0, -0.081, 0.038);
  }

  private buildBackbling(
    backVis: THREE.Group,
    primary: THREE.Material,
    secondary: THREE.Material,
    accent: THREE.Material,
    armorSteel: THREE.Material,
  ): void {
    const style = this.skin.backblingStyle;
    const parts: BackblingParts = { style };

    switch (style) {
      case 'none':
        break;
      case 'pack': {
        createPart(backVis, new THREE.BoxGeometry(0.24, 0.30, 0.12), secondary, 0, 0, -0.05);
        createPart(backVis, new THREE.BoxGeometry(0.20, 0.12, 0.14), primary, 0, 0.06, -0.06);
        createPart(backVis, new THREE.BoxGeometry(0.14, 0.035, 0.148), accent, 0, 0.06, -0.065);
        createPart(backVis, new THREE.CylinderGeometry(0.038, 0.038, 0.22, 8), armorSteel, 0, -0.14, -0.07, 0, 0, Math.PI / 2);
        // Articulated swaying radio antenna
        const antennaPivot = new THREE.Group();
        antennaPivot.position.set(0.088, 0.14, -0.07);
        createPart(antennaPivot, new THREE.CylinderGeometry(0.008, 0.012, 0.18, 6), accent, 0, 0.09, 0);
        createPart(antennaPivot, new THREE.SphereGeometry(0.016, 6, 6), accent, 0, 0.18, 0);
        backVis.add(antennaPivot);
        parts.packAntenna = antennaPivot;
        break;
      }
      case 'cape': {
        // Armored shoulder mantle clasps
        createPart(backVis, new THREE.BoxGeometry(0.34, 0.055, 0.085), accent, 0, 0.14, 0.02);
        // Upper articulated cape segment
        const capeUpper = new THREE.Group();
        capeUpper.position.set(0, 0.12, -0.02);
        createPart(capeUpper, new THREE.BoxGeometry(0.33, 0.28, 0.028), primary, 0, -0.14, -0.02, 0.08, 0, 0);
        createPart(capeUpper, new THREE.BoxGeometry(0.21, 0.24, 0.032), secondary, 0, -0.14, -0.024, 0.08, 0, 0);
        // Lower articulated cape hem segment
        const capeLower = new THREE.Group();
        capeLower.position.set(0, -0.27, -0.042);
        createPart(capeLower, new THREE.BoxGeometry(0.35, 0.28, 0.026), primary, 0, -0.14, 0, 0.08, 0, 0);
        createPart(capeLower, new THREE.BoxGeometry(0.22, 0.24, 0.030), secondary, 0, -0.14, -0.004, 0.08, 0, 0);
        createPart(capeLower, new THREE.BoxGeometry(0.36, 0.04, 0.034), accent, 0, -0.27, -0.01, 0.08, 0, 0);
        capeUpper.add(capeLower);
        backVis.add(capeUpper);
        parts.capeUpper = capeUpper;
        parts.capeLower = capeLower;
        break;
      }
      case 'wings': {
        // Central cyber wing hub
        createPart(backVis, new THREE.BoxGeometry(0.14, 0.16, 0.065), armorSteel, 0, 0.03, -0.03);
        createPart(backVis, new THREE.SphereGeometry(0.042, 8, 8), accent, 0, 0.04, -0.06);

        for (const side of [1, -1]) {
          const wingPivot = new THREE.Group();
          wingPivot.position.set(side * 0.07, 0.04, -0.05);
          createPart(wingPivot, new THREE.BoxGeometry(0.42, 0.13, 0.028), secondary, side * 0.18, 0.06, -0.03, 0.08, side * -0.24, side * 0.30);
          createPart(wingPivot, new THREE.BoxGeometry(0.36, 0.065, 0.034), accent, side * 0.20, 0.01, -0.04, 0.08, side * -0.24, side * 0.20);
          createPart(wingPivot, new THREE.BoxGeometry(0.28, 0.075, 0.024), primary, side * 0.14, -0.08, -0.02, 0.08, side * -0.20, side * 0.06);
          backVis.add(wingPivot);
          if (side === 1) parts.leftWing = wingPivot;
          else parts.rightWing = wingPivot;
        }
        break;
      }
      case 'shield': {
        const shieldPivot = new THREE.Group();
        shieldPivot.position.set(0, -0.01, -0.03);
        shieldPivot.rotation.set(0, 0, 0.15);
        createPart(shieldPivot, new THREE.BoxGeometry(0.30, 0.38, 0.042), secondary, 0, 0, 0);
        createPart(shieldPivot, new THREE.BoxGeometry(0.24, 0.31, 0.052), primary, 0, 0, -0.005);
        createPart(shieldPivot, new THREE.CylinderGeometry(0.058, 0.058, 0.062, 6), armorSteel, 0, 0.01, -0.012, Math.PI / 2, 0, 0);
        createPart(shieldPivot, new THREE.CylinderGeometry(0.038, 0.038, 0.068, 6), accent, 0, 0.01, -0.014, Math.PI / 2, 0, 0);
        backVis.add(shieldPivot);
        parts.shieldPivot = shieldPivot;
        break;
      }
    }

    this.backblingParts = parts;
  }

  /**
   * Drives secondary articulated backbling motion (cape flutter, wing spread/flap, antenna sway).
   */
  public animateBackbling(
    moveSpeed: number,
    time: number,
    isAirborne: boolean,
    isSliding: boolean,
  ): void {
    const parts = this.backblingParts;
    if (parts.style === 'none') return;

    const speedFrac = clamp(Number.isFinite(moveSpeed) ? moveSpeed / 8.5 : 0, 0, 1.3);
    const wind = isAirborne ? 1.15 : isSliding ? 1.05 : speedFrac;
    const t = Number.isFinite(time) ? time : 0;

    if (parts.style === 'cape' && parts.capeUpper && parts.capeLower) {
      const flutter = Math.sin(t * (6 + wind * 8)) * (0.04 + wind * 0.14);
      const sway = Math.cos(t * 4.5) * (0.02 + wind * 0.05);
      parts.capeUpper.rotation.set(0.08 + wind * 0.42 + flutter * 0.5, 0, sway);
      parts.capeLower.rotation.set(0.06 + wind * 0.35 + flutter, 0, -sway * 0.7);
    } else if (parts.style === 'wings' && parts.leftWing && parts.rightWing) {
      const flap = isAirborne
        ? Math.sin(t * 9.5) * 0.24 + 0.18
        : Math.sin(t * 3.2) * (0.04 + wind * 0.08);
      const sweep = wind * 0.16;
      parts.leftWing.rotation.set(0, -sweep, flap);
      parts.rightWing.rotation.set(0, sweep, -flap);
    } else if (parts.style === 'pack' && parts.packAntenna) {
      const whip = Math.sin(t * (7 + wind * 7)) * (0.03 + wind * 0.12);
      parts.packAntenna.rotation.set(-wind * 0.28 + whip, 0, Math.cos(t * 5.2) * 0.05);
    } else if (parts.style === 'shield' && parts.shieldPivot) {
      parts.shieldPivot.rotation.set(wind * 0.06, 0, 0.15 + Math.sin(t * 4) * (0.01 + wind * 0.025));
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

    const primary = makeMat(this.glider.primaryColor, 0.38, 0.28);
    const accent = makeMat(this.glider.accentColor, 0.24, 0.35, this.glider.accentColor, 0.42);
    const thrusterGlow = makeMat(this.glider.accentColor, 0.16, 0.15, this.glider.accentColor, 0.9);
    const frameMat = makeMat('#1e293b', 0.42, 0.62);

    if (this.glider.id === 'cyber_falcon') {
      // Swept cyber-falcon feathered wing glider + beak prow + twin glowing thrusters
      createPart(grp, new THREE.BoxGeometry(0.24, 0.09, 1.02), primary, 0, 0.02, 0.04);
      createPart(grp, new THREE.ConeGeometry(0.11, 0.32, 6), accent, 0, 0.02, 0.66, Math.PI / 2, 0, 0);
      for (const side of [1, -1]) {
        // Primary swept falcon wing + secondary split feather blades
        createPart(grp, new THREE.BoxGeometry(0.92, 0.048, 0.42), primary, side * 0.54, 0.02, -0.02, 0, side * -0.42, side * 0.08);
        createPart(grp, new THREE.BoxGeometry(0.84, 0.036, 0.16), accent, side * 0.62, 0.02, -0.22, 0, side * -0.52, side * 0.12);
        createPart(grp, new THREE.BoxGeometry(0.45, 0.032, 0.12), thrusterGlow, side * 0.88, 0.05, -0.34, 0, side * -0.62, side * 0.16);
        // Twin glowing rear micro-thrusters + engine vents
        createPart(grp, new THREE.CylinderGeometry(0.065, 0.082, 0.34, 8), frameMat, side * 0.26, 0.03, -0.28, Math.PI / 2);
        createPart(grp, new THREE.CylinderGeometry(0.052, 0.052, 0.06, 8), thrusterGlow, side * 0.26, 0.03, -0.46, Math.PI / 2);
        // Trapeze grips
        createPart(grp, new THREE.CylinderGeometry(0.014, 0.014, 0.32, 6), frameMat, side * 0.20, -0.15, 0.04, 0, 0, side * 0.35);
      }
      createPart(grp, new THREE.CylinderGeometry(0.018, 0.018, 0.54, 8), accent, 0, -0.28, 0.04, 0, 0, Math.PI / 2);
    } else if (this.glider.id === 'solar_dragon') {
      // Fiery Solar Dragon jet-glider with jagged wings, horned prow & twin engine vents
      createPart(grp, new THREE.BoxGeometry(0.28, 0.12, 1.12), primary, 0, 0.02, 0.04);
      createPart(grp, new THREE.ConeGeometry(0.12, 0.36, 5), accent, 0, 0.04, 0.72, Math.PI / 2, 0, 0);
      for (const side of [1, -1]) {
        // Horned dragon brow + glowing solar eyes
        createPart(grp, new THREE.ConeGeometry(0.032, 0.24, 5), accent, side * 0.10, 0.12, 0.42, -0.9, side * 0.25, 0);
        // Swept jagged dragon wing spars + glowing membrane
        createPart(grp, new THREE.BoxGeometry(1.05, 0.042, 0.54), primary, side * 0.62, 0.02, -0.08, 0, side * -0.32, side * 0.14);
        createPart(grp, new THREE.BoxGeometry(1.08, 0.05, 0.11), accent, side * 0.62, 0.03, 0.16, 0, side * -0.32, side * 0.14);
        createPart(grp, new THREE.BoxGeometry(0.55, 0.035, 0.16), thrusterGlow, side * 0.78, 0.04, -0.34, 0, side * -0.46, side * 0.18);
        // Heavy solar turbojet pods + glowing intake & exhaust vents
        createPart(grp, new THREE.CylinderGeometry(0.095, 0.115, 0.58, 10), frameMat, side * 0.40, 0.02, -0.06, Math.PI / 2);
        createPart(grp, new THREE.CylinderGeometry(0.078, 0.078, 0.05, 10), thrusterGlow, side * 0.40, 0.02, 0.24, Math.PI / 2);
        createPart(grp, new THREE.CylinderGeometry(0.082, 0.095, 0.08, 10), thrusterGlow, side * 0.40, 0.02, -0.38, Math.PI / 2);
        createPart(grp, new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), frameMat, side * 0.20, -0.14, 0.04, 0, 0, side * 0.25);
      }
      createPart(grp, new THREE.CylinderGeometry(0.018, 0.018, 0.52, 8), accent, 0, -0.26, 0.04, 0, 0, Math.PI / 2);
    } else {
      switch (this.glider.style) {
        case 'wing': {
          // Swept hang-glider wing overhead + wingtip glowing vents + twin grip handles
          createPart(grp, new THREE.BoxGeometry(0.24, 0.07, 0.95), primary, 0, 0, 0);
          createPart(grp, new THREE.BoxGeometry(0.95, 0.05, 0.55), primary, 0.54, -0.04, -0.10, 0, -0.35, -0.1);
          createPart(grp, new THREE.BoxGeometry(0.95, 0.05, 0.55), primary, -0.54, -0.04, -0.10, 0, 0.35, 0.1);
          createPart(grp, new THREE.BoxGeometry(0.95, 0.056, 0.12), accent, 0.54, -0.04, 0.14, 0, -0.35, -0.1);
          createPart(grp, new THREE.BoxGeometry(0.95, 0.056, 0.12), accent, -0.54, -0.04, 0.14, 0, 0.35, 0.1);
          for (const side of [1, -1]) {
            createPart(grp, new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), frameMat, side * 0.25, -0.02, -0.22, Math.PI / 2);
            createPart(grp, new THREE.CylinderGeometry(0.032, 0.032, 0.04, 8), thrusterGlow, side * 0.25, -0.02, -0.34, Math.PI / 2);
            createPart(grp, new THREE.CylinderGeometry(0.014, 0.014, 0.32, 6), frameMat, side * 0.20, -0.15, 0.04, 0, 0, side * 0.35);
          }
          createPart(grp, new THREE.CylinderGeometry(0.018, 0.018, 0.54, 8), accent, 0, -0.28, 0.04, 0, 0, Math.PI / 2);
          break;
        }
        case 'umbrella': {
          // Royal Parasol canopy + ribs + shaft + curved grip
          createPart(grp, new THREE.ConeGeometry(0.88, 0.28, 8), primary, 0, 0.06, 0);
          createPart(grp, new THREE.CylinderGeometry(0.88, 0.89, 0.04, 8), accent, 0, -0.08, 0);
          createPart(grp, new THREE.SphereGeometry(0.045, 8, 8), accent, 0, 0.21, 0);
          createPart(grp, new THREE.CylinderGeometry(0.016, 0.016, 0.44, 8), frameMat, 0, -0.18, 0);
          createPart(grp, new THREE.BoxGeometry(0.14, 0.032, 0.032), accent, 0, -0.40, 0);
          break;
        }
        case 'hover': {
          // Cyber Hoverboard positioned under character feet with glowing repulsor thrusters & vents!
          const boardY = -2.06;
          createPart(grp, new THREE.BoxGeometry(0.36, 0.055, 1.38), primary, 0, boardY, 0.02);
          createPart(grp, new THREE.BoxGeometry(0.42, 0.03, 1.24), accent, 0, boardY - 0.01, 0.02);
          createPart(grp, new THREE.BoxGeometry(0.56, 0.025, 0.24), frameMat, 0, boardY, -0.44);
          createPart(grp, new THREE.CylinderGeometry(0.11, 0.14, 0.045, 10), thrusterGlow, 0, boardY - 0.042, 0.42);
          createPart(grp, new THREE.CylinderGeometry(0.11, 0.14, 0.045, 10), thrusterGlow, 0, boardY - 0.042, -0.42);
          for (const side of [1, -1]) {
            createPart(grp, new THREE.CylinderGeometry(0.04, 0.05, 0.24, 8), frameMat, side * 0.22, boardY + 0.01, -0.54, Math.PI / 2);
            createPart(grp, new THREE.CylinderGeometry(0.034, 0.034, 0.05, 8), thrusterGlow, side * 0.22, boardY + 0.01, -0.67, Math.PI / 2);
          }
          break;
        }
        case 'jet': {
          // Twin turbojet crimson glider with glowing intake & engine vents
          createPart(grp, new THREE.BoxGeometry(0.26, 0.10, 1.05), primary, 0, 0.02, 0);
          createPart(grp, new THREE.BoxGeometry(1.75, 0.045, 0.50), primary, 0, 0.0, -0.08);
          createPart(grp, new THREE.BoxGeometry(1.80, 0.052, 0.11), accent, 0, 0.0, 0.16);
          for (const side of [1, -1]) {
            createPart(grp, new THREE.CylinderGeometry(0.09, 0.11, 0.56, 10), frameMat, side * 0.42, 0.02, -0.08, Math.PI / 2);
            createPart(grp, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10), thrusterGlow, side * 0.42, 0.02, -0.37, Math.PI / 2);
            createPart(grp, new THREE.CylinderGeometry(0.062, 0.062, 0.04, 10), accent, side * 0.42, 0.02, 0.21, Math.PI / 2);
            createPart(grp, new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), frameMat, side * 0.20, -0.14, 0.04, 0, 0, side * 0.25);
          }
          createPart(grp, new THREE.CylinderGeometry(0.018, 0.018, 0.52, 8), accent, 0, -0.26, 0.04, 0, 0, Math.PI / 2);
          break;
        }
      }
    }

    this.joints.gliderSocket.add(grp);
    this.gliderVisualGroup = grp;
  }

  public equipWeapon(weaponId: WeaponId, isBuildMode = false): void {
    if (this.disposed) return;

    const targetKey = isBuildMode ? '__blueprint__' : weaponId;
    if (this.equippedWeaponId === weaponId && this.buildMode === isBuildMode && this.activeWeaponGroup) {
      if (!isBuildMode && this.activeWeaponGroup.userData.appliedWrapId !== this.currentWrapId) {
        applyWeaponWrap(this.activeWeaponGroup, this.currentWrapId);
      }
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

    if (!isBuildMode && nextGroup.userData.appliedWrapId !== this.currentWrapId) {
      applyWeaponWrap(nextGroup, this.currentWrapId);
    }

    nextGroup.visible = true;
    this.activeWeaponGroup = nextGroup;
  }

  public setWeaponWrap(wrapId?: string): void {
    if (this.disposed) return;
    const resolvedId = getWeaponWrapDef(wrapId).id;
    const changed = this.currentWrapId !== resolvedId;
    this.currentWrapId = resolvedId;

    if (
      !this.buildMode &&
      this.activeWeaponGroup &&
      (changed || this.activeWeaponGroup.userData.appliedWrapId !== resolvedId)
    ) {
      applyWeaponWrap(this.activeWeaponGroup, resolvedId);
    }
  }

  public getWeaponWrapId(): string {
    return this.currentWrapId;
  }

  public updateGroundShadow(
    grounded: boolean,
    posY = this.joints.root.position.y,
    groundY?: number,
    animState?: AnimState,
  ): void {
    if (this.disposed || !this.groundShadowMesh || !this.groundShadowMat) return;

    const safePosY = Number.isFinite(posY) ? posY : 0;
    let effectiveHeight = 0;

    if (groundY !== undefined && Number.isFinite(groundY)) {
      const airHeight = Math.max(0, safePosY - groundY);
      this.groundShadowMesh.position.y = -airHeight + 0.025;
      effectiveHeight = !grounded && airHeight === 0 ? 1.5 : airHeight;
      if (grounded && airHeight === 0) {
        this.lastGroundedY = safePosY;
      }
    } else if (grounded) {
      this.lastGroundedY = safePosY;
      this.groundShadowMesh.position.y = 0.025;
      effectiveHeight = 0;
    } else {
      const rise = Math.max(0, safePosY - this.lastGroundedY);
      const minAirHeight = animState === 'skydive' || animState === 'glide' ? 6.5 : 1.6;
      effectiveHeight = Math.max(rise, minAirHeight);
      this.groundShadowMesh.position.y =
        rise > 0 ? -Math.min(rise, GROUND_SHADOW_MAX_HEIGHT) + 0.025 : 0.025;
    }

    const t = clamp(effectiveHeight / GROUND_SHADOW_MAX_HEIGHT, 0, 1);
    const fade = (1 - t) * (1 - t);
    const opacity = GROUND_SHADOW_BASE_OPACITY * fade;
    const scale = 1.0 - 0.55 * t;

    this.groundShadowMat.opacity = opacity;
    this.groundShadowMesh.scale.setScalar(scale);
    this.groundShadowMesh.visible = opacity > 0.015;
  }

  public updateFromState(state: CharacterRenderState, groundY?: number): void {
    if (this.disposed) return;

    const px = Number.isFinite(state.position.x) ? state.position.x : 0;
    const py = Number.isFinite(state.position.y) ? state.position.y : 0;
    const pz = Number.isFinite(state.position.z) ? state.position.z : 0;
    this.joints.root.position.set(px, py, pz);
    this.joints.root.rotation.y = Number.isFinite(state.yaw) ? state.yaw : 0;

    this.equipWeapon(state.weaponId, state.isBuilding);
    if (state.weaponWrapId !== undefined) {
      this.setWeaponWrap(state.weaponWrapId);
    }
    if (state.contrailId !== undefined) {
      this.setContrail(state.contrailId);
    }
    this.updateGroundShadow(state.grounded, py, groundY, state.animState);
    const contrailActive = shouldActivateContrail(state);
    this.updateContrail(
      contrailActive,
      1 / 60,
      contrailActive ? this.contrailTime + 1 / 60 : this.contrailTime,
    );

    if (state.isBoss !== undefined) {
      this.setBossAura(Boolean(state.isBoss));
    }
    if (state.isAlly !== undefined) {
      this.setAllyAura(Boolean(state.isAlly), state.allyRole);
    } else if (state.allyRole !== undefined && this.allyAuraEnabled) {
      this.setAllyAura(true, state.allyRole);
    }
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

  private buildBossAuraGroup(): void {
    const auraGroup = new THREE.Group();
    auraGroup.name = 'boss_crown_aura';

    const crownGroup = new THREE.Group();
    crownGroup.name = 'boss_crown_ring';

    const goldRingMat = makeMat('#fbbf24', 0.18, 0.85, '#f59e0b', 0.95);
    const innerGoldMat = makeMat('#fef08a', 0.14, 0.35, '#fde047', 1.1);

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 8, 24), goldRingMat);
    outerRing.rotation.x = Math.PI / 2;
    outerRing.castShadow = false;
    crownGroup.add(outerRing);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.012, 6, 20), innerGoldMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.castShadow = false;
    crownGroup.add(innerRing);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.085, 4), goldRingMat);
      spike.position.set(Math.sin(ang) * 0.25, 0.055, Math.cos(ang) * 0.25);
      spike.castShadow = false;
      crownGroup.add(spike);
    }

    auraGroup.add(crownGroup);

    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const haloMesh = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.36, 24), haloMat);
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.position.y = -0.02;
    haloMesh.castShadow = false;
    auraGroup.add(haloMesh);

    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const beaconMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.26, 2.4, 16, 1, true),
      beaconMat,
    );
    beaconMesh.position.y = 1.2;
    beaconMesh.castShadow = false;
    auraGroup.add(beaconMesh);

    const coreBeamMat = new THREE.MeshBasicMaterial({
      color: 0xfef9c3,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const coreBeamMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.09, 2.7, 12, 1, true),
      coreBeamMat,
    );
    coreBeamMesh.position.y = 1.35;
    coreBeamMesh.castShadow = false;
    auraGroup.add(coreBeamMesh);

    this.joints.root.add(auraGroup);
    this.bossAuraGroup = auraGroup;
    this.bossCrownRing = crownGroup;
    this.bossBeaconMesh = beaconMesh;
    this.bossBeaconMat = beaconMat;
    this.bossCoreBeamMat = coreBeamMat;
    this.bossAuraHaloMesh = haloMesh;
    this.bossAuraHaloMat = haloMat;
  }

  public setBossAura(enabled: boolean, elapsed?: number): void {
    if (this.disposed) return;

    if (!enabled) {
      this.bossAuraEnabled = false;
      if (this.bossAuraGroup) {
        this.bossAuraGroup.visible = false;
        this.bossAuraGroup.position.set(0, 1.0, 0);
        this.bossAuraGroup.scale.setScalar(0.001);
      }
      return;
    }

    if (!this.bossAuraGroup) {
      this.buildBossAuraGroup();
    }

    this.bossAuraEnabled = true;
    if (this.allyAuraEnabled) {
      this.setAllyAura(false);
    }
    if (elapsed !== undefined && Number.isFinite(elapsed)) {
      this.bossAuraTime = elapsed;
    }

    const t = this.bossAuraTime;
    const aura = this.bossAuraGroup!;
    const bob = Math.sin(t * 2.8) * 0.055;
    const headTrackY = this.joints.hips.position.y + 1.24;

    aura.visible = true;
    aura.position.set(this.joints.hips.position.x, headTrackY + bob, this.joints.hips.position.z);
    aura.scale.setScalar(1);

    if (this.bossCrownRing) {
      this.bossCrownRing.rotation.y = t * 1.4;
      this.bossCrownRing.scale.setScalar(1 + Math.sin(t * 4.2) * 0.05);
    }
    if (this.bossBeaconMesh) {
      const xz = 1 + 0.14 * Math.sin(t * 3.5);
      this.bossBeaconMesh.scale.set(xz, 1, xz);
    }
    if (this.bossBeaconMat) {
      this.bossBeaconMat.opacity = 0.22 + 0.10 * Math.sin(t * 3.5);
    }
    if (this.bossCoreBeamMat) {
      this.bossCoreBeamMat.opacity = 0.34 + 0.12 * Math.cos(t * 4.0);
    }
    if (this.bossAuraHaloMesh && this.bossAuraHaloMat) {
      this.bossAuraHaloMesh.scale.setScalar(1 + 0.16 * Math.sin(t * 3.5));
      this.bossAuraHaloMat.opacity = 0.52 + 0.22 * Math.sin(t * 3.5);
    }
  }

  private buildAllyAuraGroup(): void {
    const auraGroup = new THREE.Group();
    auraGroup.name = 'ally_tactical_aura';

    const chevronGroup = new THREE.Group();
    chevronGroup.name = 'ally_tactical_chevron';

    const cyanMat = makeMat('#22d3ee', 0.14, 0.25, '#22d3ee', 1.15);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Hovering cyan diamond tactical core
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), cyanMat);
    diamond.position.y = 0.11;
    diamond.scale.set(0.9, 1.45, 0.9);
    diamond.castShadow = false;
    chevronGroup.add(diamond);

    const innerDiamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), coreMat);
    innerDiamond.position.y = 0.11;
    innerDiamond.scale.set(0.85, 1.35, 0.85);
    innerDiamond.castShadow = false;
    chevronGroup.add(innerDiamond);

    // Crisp cyan tactical chevron wings framing the diamond
    const wingGeo = new THREE.BoxGeometry(0.11, 0.024, 0.026);
    const leftWing = new THREE.Mesh(wingGeo, cyanMat);
    leftWing.position.set(-0.048, 0.032, 0);
    leftWing.rotation.z = -0.62;
    leftWing.castShadow = false;
    chevronGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, cyanMat);
    rightWing.position.set(0.048, 0.032, 0);
    rightWing.rotation.z = 0.62;
    rightWing.castShadow = false;
    chevronGroup.add(rightWing);

    auraGroup.add(chevronGroup);

    const roleColor = getAllyRoleColor(this.allyRole);
    const roleRingMat = makeMat(roleColor, 0.18, 0.45, roleColor, 0.95);
    const roleRingMesh = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 8, 24), roleRingMat);
    roleRingMesh.name = 'ally_role_ring';
    roleRingMesh.rotation.x = Math.PI / 2;
    roleRingMesh.position.y = -0.02;
    roleRingMesh.castShadow = false;
    auraGroup.add(roleRingMesh);

    const roleHaloMat = new THREE.MeshBasicMaterial({
      color: roleColor,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const roleHaloMesh = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.29, 24), roleHaloMat);
    roleHaloMesh.rotation.x = -Math.PI / 2;
    roleHaloMesh.position.y = -0.02;
    roleHaloMesh.castShadow = false;
    auraGroup.add(roleHaloMesh);

    this.joints.root.add(auraGroup);
    this.allyAuraGroup = auraGroup;
    this.allyChevronGroup = chevronGroup;
    this.allyRoleRingMesh = roleRingMesh;
    this.allyRoleRingMat = roleRingMat;
    this.allyRoleHaloMesh = roleHaloMesh;
    this.allyRoleHaloMat = roleHaloMat;
  }

  public setAllyAura(isAlly: boolean, role?: SpecialistRole, elapsed?: number): void {
    if (this.disposed) return;

    if (role !== undefined) {
      this.allyRole = role;
    }

    const shouldEnable = Boolean(isAlly) && !this.bossAuraEnabled;
    if (!shouldEnable) {
      this.allyAuraEnabled = false;
      if (this.allyAuraGroup) {
        this.allyAuraGroup.visible = false;
        this.allyAuraGroup.position.set(0, 1.0, 0);
        this.allyAuraGroup.scale.setScalar(0.001);
      }
      return;
    }

    if (!this.allyAuraGroup) {
      this.buildAllyAuraGroup();
    }

    this.allyAuraEnabled = true;
    if (elapsed !== undefined && Number.isFinite(elapsed)) {
      this.allyAuraTime = elapsed;
    }

    const roleColor = getAllyRoleColor(this.allyRole);
    if (this.allyRoleRingMat) {
      this.allyRoleRingMat.color.set(roleColor);
      this.allyRoleRingMat.emissive.set(roleColor);
    }
    if (this.allyRoleHaloMat) {
      this.allyRoleHaloMat.color.set(roleColor);
    }

    const t = this.allyAuraTime;
    const aura = this.allyAuraGroup!;
    const bob = Math.sin(t * 3.1) * 0.045;
    const headTrackY = this.joints.hips.position.y + 1.24;

    aura.visible = true;
    aura.position.set(this.joints.hips.position.x, headTrackY + bob, this.joints.hips.position.z);
    aura.scale.setScalar(1);

    if (this.allyChevronGroup) {
      this.allyChevronGroup.rotation.y = t * 1.8;
    }
    if (this.allyRoleRingMesh) {
      this.allyRoleRingMesh.scale.setScalar(1 + 0.06 * Math.sin(t * 3.8));
    }
    if (this.allyRoleHaloMesh && this.allyRoleHaloMat) {
      this.allyRoleHaloMesh.scale.setScalar(1 + 0.14 * Math.sin(t * 3.6));
      this.allyRoleHaloMat.opacity = 0.46 + 0.2 * Math.sin(t * 3.6);
    }
  }

  private buildContrailVisuals(): void {
    const def = getContrailDef(this.currentContrailId);

    this.contrailPrimaryMat = new THREE.MeshBasicMaterial({
      color: def.primaryColor,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.contrailSecondaryMat = new THREE.MeshBasicMaterial({
      color: def.secondaryColor,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.contrailCoreMat = new THREE.MeshBasicMaterial({
      color: def.primaryColor,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const attachments: Array<{
      parent: THREE.Group;
      name: string;
      isFoot: boolean;
      sideSign: 1 | -1;
      offsetY: number;
      offsetZ: number;
    }> = [
      {
        parent: this.joints.leftHand,
        name: 'contrail_left_hand',
        isFoot: false,
        sideSign: 1,
        offsetY: -0.04,
        offsetZ: 0,
      },
      {
        parent: this.joints.rightHand,
        name: 'contrail_right_hand',
        isFoot: false,
        sideSign: -1,
        offsetY: -0.04,
        offsetZ: 0,
      },
      {
        parent: this.joints.leftFoot,
        name: 'contrail_left_foot',
        isFoot: true,
        sideSign: 1,
        offsetY: -0.02,
        offsetZ: -0.04,
      },
      {
        parent: this.joints.rightFoot,
        name: 'contrail_right_foot',
        isFoot: true,
        sideSign: -1,
        offsetY: -0.02,
        offsetZ: -0.04,
      },
    ];

    for (const att of attachments) {
      const grp = new THREE.Group();
      grp.name = att.name;
      grp.position.set(0, att.offsetY, att.offsetZ);
      grp.visible = false;
      grp.scale.setScalar(0.001);

      const cuffMesh = new THREE.Mesh(
        new THREE.TorusGeometry(att.isFoot ? 0.075 : 0.056, 0.012, 6, 14),
        this.contrailPrimaryMat,
      );
      cuffMesh.rotation.x = Math.PI / 2;
      cuffMesh.castShadow = true;
      grp.add(cuffMesh);

      const primaryRibbon = new THREE.Mesh(
        new THREE.ConeGeometry(att.isFoot ? 0.068 : 0.052, 0.85, 6, 1, true),
        this.contrailPrimaryMat,
      );
      primaryRibbon.rotation.x = Math.PI;
      primaryRibbon.position.y = -0.44;
      primaryRibbon.castShadow = true;
      grp.add(primaryRibbon);

      const secondaryRibbon = new THREE.Mesh(
        new THREE.CylinderGeometry(att.isFoot ? 0.036 : 0.028, 0.004, 0.72, 6, 1, true),
        this.contrailSecondaryMat,
      );
      secondaryRibbon.position.y = -0.38;
      secondaryRibbon.castShadow = true;
      grp.add(secondaryRibbon);

      const particles: ContrailParticle[] = [];
      for (let i = 0; i < CONTRAIL_PARTICLES_PER_LIMB; i++) {
        const mat =
          i % 3 === 0
            ? this.contrailCoreMat
            : i % 2 === 0
              ? this.contrailPrimaryMat
              : this.contrailSecondaryMat;
        const pMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), mat);
        pMesh.castShadow = true;
        grp.add(pMesh);
        particles.push({
          mesh: pMesh,
          phaseOffset: i / CONTRAIL_PARTICLES_PER_LIMB,
          radialAngle: (i / CONTRAIL_PARTICLES_PER_LIMB) * Math.PI * 2,
          radialRadius: att.isFoot ? 0.065 : 0.05,
          speed: 1.55 + (i % 3) * 0.35,
        });
      }

      att.parent.add(grp);
      this.contrailStreams.push({
        group: grp,
        cuffMesh,
        primaryRibbon,
        secondaryRibbon,
        particles,
        isFoot: att.isFoot,
        sideSign: att.sideSign,
      });
    }
  }

  public setContrail(contrailId?: string): void {
    if (this.disposed) return;
    const def = getContrailDef(contrailId);
    this.currentContrailId = def.id;

    if (this.contrailPrimaryMat) {
      this.contrailPrimaryMat.color.set(def.primaryColor);
    }
    if (this.contrailSecondaryMat) {
      this.contrailSecondaryMat.color.set(def.secondaryColor);
    }
    if (this.contrailCoreMat) {
      this.contrailCoreMat.color.set(def.primaryColor).lerp(CONTRAIL_WHITE, 0.55);
    }
  }

  public getContrailId(): string {
    return this.currentContrailId;
  }

  public isContrailActive(): boolean {
    return this.contrailActive;
  }

  public updateContrail(active: boolean, dt: number, elapsed: number): void {
    if (this.disposed) return;

    if (!active) {
      this.contrailActive = false;
      for (let i = 0; i < this.contrailStreams.length; i++) {
        const stream = this.contrailStreams[i];
        stream.group.visible = false;
        stream.group.scale.setScalar(0.001);
      }
      return;
    }

    this.contrailActive = true;
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const t = Number.isFinite(elapsed) ? elapsed : this.contrailTime + safeDt;
    this.contrailTime = t;

    const style = getContrailDef(this.currentContrailId).style;

    let ribbonWidth = 1.0;
    let ribbonLength = 1.0;
    let swirlSpeed = 5.0;
    let flutterAmp = 0.06;
    let flicker = 1.0;
    let pScaleX = 1.0;
    let pScaleY = 1.0;
    let pScaleZ = 1.0;

    switch (style) {
      case 'wind':
        ribbonWidth = 0.92;
        ribbonLength = 1.18;
        swirlSpeed = 4.2;
        flutterAmp = 0.05;
        flicker = 0.85 + 0.15 * Math.sin(t * 9);
        pScaleX = 0.7;
        pScaleY = 1.85;
        pScaleZ = 0.7;
        break;
      case 'plasma':
        ribbonWidth = 1.15;
        ribbonLength = 1.12;
        swirlSpeed = 10.5;
        flutterAmp = 0.09;
        flicker = 0.82 + 0.18 * Math.sin(t * 16);
        pScaleX = 1.1;
        pScaleY = 1.1;
        pScaleZ = 1.1;
        break;
      case 'solar':
        ribbonWidth = 1.38;
        ribbonLength = 1.25;
        swirlSpeed = 7.5;
        flutterAmp = 0.1;
        flicker = 0.76 + 0.24 * Math.sin(t * 22);
        pScaleX = 1.25;
        pScaleY = 1.45;
        pScaleZ = 1.25;
        break;
      case 'frost':
        ribbonWidth = 0.96;
        ribbonLength = 1.05;
        swirlSpeed = 6.0;
        flutterAmp = 0.04;
        flicker = 0.88 + 0.12 * Math.cos(t * 11);
        pScaleX = 0.72;
        pScaleY = 2.1;
        pScaleZ = 0.72;
        break;
      case 'sakura':
        ribbonWidth = 1.08;
        ribbonLength = 0.96;
        swirlSpeed = 3.8;
        flutterAmp = 0.15;
        flicker = 0.86 + 0.14 * Math.sin(t * 6.5);
        pScaleX = 1.45;
        pScaleY = 0.28;
        pScaleZ = 1.05;
        break;
      case 'void':
        ribbonWidth = 1.18;
        ribbonLength = 1.22;
        swirlSpeed = 13.5;
        flutterAmp = 0.12;
        flicker = 0.68 + 0.32 * Math.abs(Math.sin(t * 20));
        pScaleX = 0.8;
        pScaleY = 2.35;
        pScaleZ = 0.8;
        break;
    }

    if (this.contrailPrimaryMat) {
      this.contrailPrimaryMat.opacity = clamp(0.82 * flicker, 0.25, 0.98);
    }
    if (this.contrailSecondaryMat) {
      this.contrailSecondaryMat.opacity = clamp(0.72 * flicker, 0.2, 0.95);
    }
    if (this.contrailCoreMat) {
      this.contrailCoreMat.opacity = clamp(0.9 * flicker, 0.3, 1.0);
    }

    for (let i = 0; i < this.contrailStreams.length; i++) {
      const stream = this.contrailStreams[i];
      stream.group.visible = true;
      stream.group.scale.setScalar(1);

      const wave = Math.sin(t * 10 + i * 1.4);
      const pulse = 1 + 0.12 * Math.sin(t * 14 + i);
      const zigZag = style === 'void' ? Math.sin(t * 28 + i * 2.1) * 0.22 : wave * 0.08;

      stream.cuffMesh.rotation.z = t * swirlSpeed * stream.sideSign;
      stream.cuffMesh.scale.setScalar(pulse);

      stream.primaryRibbon.scale.set(
        ribbonWidth * pulse,
        ribbonLength * (0.94 + 0.1 * wave),
        ribbonWidth * pulse,
      );
      stream.primaryRibbon.rotation.y = t * swirlSpeed * stream.sideSign;
      stream.primaryRibbon.rotation.z = zigZag;

      stream.secondaryRibbon.scale.set(
        ribbonWidth * 0.95,
        ribbonLength * (0.92 - 0.1 * wave),
        ribbonWidth * 0.95,
      );
      stream.secondaryRibbon.rotation.y = -t * swirlSpeed * 1.25 * stream.sideSign;
      stream.secondaryRibbon.rotation.x = wave * flutterAmp;
      stream.secondaryRibbon.rotation.z = -zigZag;

      const trailLen = (stream.isFoot ? 1.05 : 0.9) * ribbonLength;
      for (let p = 0; p < stream.particles.length; p++) {
        const pt = stream.particles[p];
        const rawProg = (t * pt.speed + pt.phaseOffset) % 1;
        const prog = rawProg < 0 ? rawProg + 1 : rawProg;
        const ang = pt.radialAngle + t * swirlSpeed * stream.sideSign + prog * 2.6;
        const spread = pt.radialRadius + prog * flutterAmp * 1.8;
        const driftX =
          style === 'void'
            ? Math.sin(t * 30 + p * 2.3) * 0.08
            : Math.cos(ang) * spread;
        const driftZ = Math.sin(ang) * spread;
        const fadeScale = Math.max(0.15, (1 - prog * 0.72) * (0.75 + 0.35 * Math.sin(prog * Math.PI)));

        pt.mesh.position.set(driftX, -0.08 - prog * trailLen, driftZ);
        pt.mesh.rotation.set(t * 4.5 + p, t * 5.2 * stream.sideSign, t * 3.8);
        pt.mesh.scale.set(pScaleX * fadeScale, pScaleY * fadeScale, pScaleZ * fadeScale);
      }
    }
  }

  public isBossAuraEnabled(): boolean {
    return this.bossAuraEnabled;
  }

  public isAllyAuraEnabled(): boolean {
    return this.allyAuraEnabled;
  }

  public getAllyRole(): SpecialistRole {
    return this.allyRole;
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

  public getBackblingStyle(): BackblingStyle {
    return this.backblingParts.style;
  }

  public getGroundShadowMesh(): THREE.Mesh | null {
    return this.groundShadowMesh;
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

    if (this.bossAuraGroup) {
      disposeObject3D(this.bossAuraGroup);
      this.bossAuraGroup.parent?.remove(this.bossAuraGroup);
      this.bossAuraGroup = null;
      this.bossCrownRing = null;
      this.bossBeaconMesh = null;
      this.bossBeaconMat = null;
      this.bossCoreBeamMat = null;
      this.bossAuraHaloMesh = null;
      this.bossAuraHaloMat = null;
    }

    if (this.allyAuraGroup) {
      disposeObject3D(this.allyAuraGroup);
      this.allyAuraGroup.parent?.remove(this.allyAuraGroup);
      this.allyAuraGroup = null;
      this.allyChevronGroup = null;
      this.allyRoleRingMesh = null;
      this.allyRoleRingMat = null;
      this.allyRoleHaloMesh = null;
      this.allyRoleHaloMat = null;
      this.allyAuraEnabled = false;
    }

    disposeObject3D(this.joints.root);
    this.joints.root.parent?.remove(this.joints.root);
    this.groundShadowMesh = null;
    this.groundShadowMat = null;
    this.contrailStreams.length = 0;
    this.contrailPrimaryMat = null;
    this.contrailSecondaryMat = null;
    this.contrailCoreMat = null;
    this.contrailActive = false;
  }
}
