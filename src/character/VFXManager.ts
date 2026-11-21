import * as THREE from 'three';
import type {
  AmmoType,
  BiomeType,
  BuildPieceType,
  MaterialType,
  Rarity,
  Vec3Like,
  WeaponId,
} from '../types';
import { EventBus, MATERIAL_STATS, RARITY_COLORS, WEAPONS, clamp } from '../core';

type ImpactMaterial =
  | 'wood'
  | 'brick'
  | 'metal'
  | 'dirt'
  | 'shield'
  | 'flesh'
  | 'shield_break';

export function getBiomeDustColors(biome: BiomeType): [string, string] {
  switch (biome) {
    case 'ocean':
      return ['#bae6fd', '#38bdf8'];
    case 'beach':
      return ['#fde68a', '#f59e0b'];
    case 'grassland':
      return ['#a16207', '#84cc16'];
    case 'forest':
      return ['#78350f', '#4d7c0f'];
    case 'highland':
      return ['#94a3b8', '#78716c'];
    case 'urban':
      return ['#cbd5e1', '#64748b'];
    case 'snow':
      return ['#f8fafc', '#bae6fd'];
    case 'desert':
      return ['#ea580c', '#fbbf24'];
    case 'volcanic':
      return ['#57534e', '#f97316'];
    case 'cyber':
      return ['#22d3ee', '#a855f7'];
  }
}

interface TracerSlot {
  active: boolean;
  age: number;
  duration: number;
  width: number;
  length: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface MuzzleSlot {
  active: boolean;
  age: number;
  duration: number;
  baseScale: number;
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
}

interface CasingSlot {
  active: boolean;
  age: number;
  duration: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface BurstSlot {
  active: boolean;
  age: number;
  duration: number;
  gravity: number;
  drag: number;
  useRing: boolean;
  ringStartScale: number;
  ringEndScale: number;
  group: THREE.Group;
  ringMesh: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  particles: BurstParticle[];
}

interface ShieldShard {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  baseScale: number;
}

interface ShieldBreakSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  innerRingMesh: THREE.Mesh;
  innerRingMat: THREE.MeshBasicMaterial;
  flashMesh: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
  shards: ShieldShard[];
}

interface ExplosionEmber {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface ExplosionSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  outerMesh: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  smokeMesh: THREE.Mesh;
  smokeMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  embers: ExplosionEmber[];
}

interface ShockwaveSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  violetRingMesh: THREE.Mesh;
  violetRingMat: THREE.MeshBasicMaterial;
  cyanRingMesh: THREE.Mesh;
  cyanRingMat: THREE.MeshBasicMaterial;
  tiltRingMesh: THREE.Mesh;
  tiltRingMat: THREE.MeshBasicMaterial;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
}

interface SplashSparkle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface SplashHealSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  sparkles: SplashSparkle[];
}

interface SlideDustPuff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface SlideDustSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  puffs: SlideDustPuff[];
}

interface EliminationVoxel {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spinSpeed: number;
  delay: number;
  baseScale: number;
}

interface EliminationSlot {
  active: boolean;
  age: number;
  duration: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  group: THREE.Group;
  droneGroup: THREE.Group;
  rotors: THREE.Mesh[];
  beamMesh: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  voxels: EliminationVoxel[];
}

interface WeakpointSlot {
  active: boolean;
  propId: string;
  age: number;
  group: THREE.Group;
  spinnerGroup: THREE.Group;
}

interface GrappleLineSlot {
  active: boolean;
  age: number;
  duration: number;
  length: number;
  group: THREE.Group;
  cableMesh: THREE.Mesh;
  cableMat: THREE.MeshBasicMaterial;
  goldWireMesh: THREE.Mesh;
  goldWireMat: THREE.MeshBasicMaterial;
  hookGroup: THREE.Group;
  hookMat: THREE.MeshBasicMaterial;
  impactRingMesh: THREE.Mesh;
  impactRingMat: THREE.MeshBasicMaterial;
}

interface ShieldBubbleSlot {
  active: boolean;
  id: string;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  hexWireMesh: THREE.Mesh;
  hexWireMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
}

interface VehicleBoostSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface VehicleBoostSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  leftPlume: THREE.Mesh;
  rightPlume: THREE.Mesh;
  plumeMat: THREE.MeshBasicMaterial;
  sparks: VehicleBoostSpark[];
}

interface WeaponUpgradeSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface WeaponUpgradeSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  innerRingMesh: THREE.Mesh;
  innerRingMat: THREE.MeshBasicMaterial;
  sparks: WeaponUpgradeSpark[];
}

interface SlurpDroplet {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface SlurpBurstSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  droplets: SlurpDroplet[];
}

interface CampfireMote {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  swaySpeed: number;
  baseScale: number;
}

interface CampfireHealSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  glowRingMesh: THREE.Mesh;
  glowRingMat: THREE.MeshBasicMaterial;
  motes: CampfireMote[];
}

interface ImpactDecalSlot {
  active: boolean;
  age: number;
  duration: number;
  baseOpacity: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface RiftTearEndpoint {
  group: THREE.Group;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  innerRingMesh: THREE.Mesh;
  innerRingMat: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  crackShards: THREE.Mesh[];
  crackMatCyan: THREE.MeshBasicMaterial;
  crackMatViolet: THREE.MeshBasicMaterial;
  baseScale: number;
}

interface RiftTearSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  ground: RiftTearEndpoint;
  sky: RiftTearEndpoint;
}

interface FlagCaptureSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
  phase: number;
}

interface FlagCaptureSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  beaconMesh: THREE.Mesh;
  beaconMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  sparks: FlagCaptureSpark[];
}

interface AugmentVfxMote {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface AugmentVfxSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  lowerHexMesh: THREE.Mesh;
  lowerHexMat: THREE.MeshBasicMaterial;
  upperHexMesh: THREE.Mesh;
  upperHexMat: THREE.MeshBasicMaterial;
  shellMesh: THREE.Mesh;
  shellMat: THREE.MeshBasicMaterial;
  motes: AugmentVfxMote[];
}

interface TacticalPingSlot {
  active: boolean;
  age: number;
  duration: number;
  kind: 'move' | 'danger' | 'loot';
  group: THREE.Group;
  outerDiamondMesh: THREE.Mesh;
  outerDiamondMat: THREE.MeshBasicMaterial;
  rippleDiamondMesh: THREE.Mesh;
  rippleDiamondMat: THREE.MeshBasicMaterial;
  markerMesh: THREE.Mesh;
  markerMat: THREE.MeshBasicMaterial;
  beamMesh: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
}

function getTacticalPingColor(kind: 'move' | 'danger' | 'loot'): string {
  switch (kind) {
    case 'danger':
      return '#ef4444';
    case 'loot':
      return '#fbbf24';
    case 'move':
    default:
      return '#22d3ee';
  }
}

function createImpactDecalTexture(): THREE.CanvasTexture {
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
      // Soft outer scorch halo via concentric circles (no ellipse/fillText)
      for (let i = 16; i >= 1; i--) {
        ctx.fillStyle = 'rgba(220, 220, 220, 0.055)';
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.45 * (i / 16), 0, Math.PI * 2);
        ctx.fill();
      }
      // Crisp splinter/crack rays
      ctx.strokeStyle = 'rgba(85, 85, 85, 0.85)';
      ctx.lineWidth = 3;
      for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * Math.PI * 2 + (r % 2) * 0.18;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * 8, cy + Math.sin(ang) * 8);
        ctx.lineTo(cx + Math.cos(ang) * (size * 0.41), cy + Math.sin(ang) * (size * 0.41));
        ctx.stroke();
      }
      // Dark bullet impact core
      ctx.fillStyle = 'rgba(20, 20, 20, 0.96)';
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    canvas = {
      width: size,
      height: size,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = 'vfx_impact_decal_tex';
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function isFiniteVec3(v: Vec3Like | null | undefined): v is Vec3Like {
  return (
    v !== null &&
    v !== undefined &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z)
  );
}

const TRACER_POOL_SIZE = 48;
const MUZZLE_POOL_SIZE = 24;
const CASING_POOL_SIZE = 40;
const BURST_POOL_SIZE = 40;
const BURST_PARTICLE_COUNT = 12;
const SHIELD_BREAK_POOL_SIZE = 8;
const SHIELD_BREAK_SHARD_COUNT = 18;
const EXPLOSION_POOL_SIZE = 12;
const EXPLOSION_EMBER_COUNT = 10;
const SHOCKWAVE_POOL_SIZE = 8;
const SPLASH_HEAL_POOL_SIZE = 10;
const SPLASH_SPARKLE_COUNT = 16;
const SLIDE_DUST_POOL_SIZE = 24;
const SLIDE_DUST_PARTICLE_COUNT = 8;
const ELIMINATION_POOL_SIZE = 10;
const ELIMINATION_VOXEL_COUNT = 18;
const WEAKPOINT_POOL_SIZE = 8;
const GRAPPLE_LINE_POOL_SIZE = 8;
const SHIELD_BUBBLE_POOL_SIZE = 8;
const VEHICLE_BOOST_POOL_SIZE = 24;
const VEHICLE_BOOST_SPARK_COUNT = 10;
const WEAPON_UPGRADE_POOL_SIZE = 8;
const WEAPON_UPGRADE_SPARK_COUNT = 14;
const SLURP_BURST_POOL_SIZE = 10;
const SLURP_BURST_DROPLET_COUNT = 16;
const CAMPFIRE_HEAL_POOL_SIZE = 12;
const CAMPFIRE_HEAL_MOTE_COUNT = 12;
const IMPACT_DECAL_POOL_SIZE = 40;
const IMPACT_DECAL_DURATION = 12.0;
const RIFT_TEAR_POOL_SIZE = 6;
const RIFT_TEAR_SHARD_COUNT = 6;
const FLAG_CAPTURE_POOL_SIZE = 6;
const FLAG_CAPTURE_SPARK_COUNT = 20;
const AUGMENT_VFX_POOL_SIZE = 8;
const AUGMENT_VFX_MOTE_COUNT = 12;
const TACTICAL_PING_DURATION = 16.0;
const THROW_ARC_MAX_POINTS = 64;
const THROW_ARC_DOT_COUNT = 40;

/**
 * Pooled 3D VFX manager subscribed to EventBus vfx:* channels.
 * Avoids runtime geometry/material allocations and cleanly recycles/disposes all resources.
 */
export class VFXManager {
  private readonly scene: THREE.Scene;
  private readonly eventBus: EventBus;
  private readonly root: THREE.Group;
  private readonly unsubs: Array<() => void> = [];

  private readonly sharedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];

  private readonly unitBoxGeo: THREE.BoxGeometry;
  private readonly unitCylinderGeo: THREE.CylinderGeometry;
  private readonly unitConeGeo: THREE.ConeGeometry;
  private readonly unitSphereGeo: THREE.SphereGeometry;
  private readonly unitRingGeo: THREE.RingGeometry;
  private readonly unitCircleGeo: THREE.CircleGeometry;
  private readonly unitCrystalGeo: THREE.OctahedronGeometry;
  private readonly unitPlaneGeo: THREE.PlaneGeometry;
  private readonly casingGeo: THREE.CylinderGeometry;
  private readonly droneBodyGeo: THREE.BoxGeometry;
  private readonly droneRotorGeo: THREE.TorusGeometry;
  private readonly beamCylGeo: THREE.CylinderGeometry;
  private readonly hexDomeGeo: THREE.IcosahedronGeometry;
  private readonly hexRingGeo: THREE.RingGeometry;
  private readonly hexPrismGeo: THREE.CylinderGeometry;
  private readonly diamondRingGeo: THREE.RingGeometry;
  private readonly impactDecalTex: THREE.CanvasTexture;

  private readonly tracers: TracerSlot[] = [];
  private readonly muzzles: MuzzleSlot[] = [];
  private readonly casings: CasingSlot[] = [];
  private readonly bursts: BurstSlot[] = [];
  private readonly shieldBreaks: ShieldBreakSlot[] = [];
  private readonly explosions: ExplosionSlot[] = [];
  private readonly shockwaves: ShockwaveSlot[] = [];
  private readonly splashHeals: SplashHealSlot[] = [];
  private readonly slideDusts: SlideDustSlot[] = [];
  private readonly eliminations: EliminationSlot[] = [];
  private readonly weakpoints: WeakpointSlot[] = [];
  private readonly grappleLines: GrappleLineSlot[] = [];
  private readonly shieldBubbles: ShieldBubbleSlot[] = [];
  private readonly vehicleBoosts: VehicleBoostSlot[] = [];
  private readonly weaponUpgrades: WeaponUpgradeSlot[] = [];
  private readonly slurpBursts: SlurpBurstSlot[] = [];
  private readonly campfireHeals: CampfireHealSlot[] = [];
  private readonly impactDecals: ImpactDecalSlot[] = [];
  private readonly riftTears: RiftTearSlot[] = [];
  private readonly flagCaptures: FlagCaptureSlot[] = [];
  private readonly augmentVfx: AugmentVfxSlot[] = [];
  private tacticalPing!: TacticalPingSlot;

  private readonly throwArcGroup: THREE.Group;
  private readonly throwArcPositions: Float32Array;
  private readonly throwArcPosAttr: THREE.BufferAttribute;
  private readonly throwArcLineGeo: THREE.BufferGeometry;
  private readonly throwArcLineMat: THREE.LineDashedMaterial;
  private readonly throwArcLine: THREE.Line;
  private readonly throwArcDotMat: THREE.MeshBasicMaterial;
  private readonly throwArcDots: THREE.Mesh[] = [];
  private readonly throwLandingRingGroup: THREE.Group;
  private readonly throwLandingOuterMat: THREE.MeshBasicMaterial;
  private readonly throwLandingInnerMat: THREE.MeshBasicMaterial;
  private readonly throwLandingFillMat: THREE.MeshBasicMaterial;
  private readonly scratchArcPoints: THREE.Vector3[] = Array.from(
    { length: THROW_ARC_MAX_POINTS },
    () => new THREE.Vector3(),
  );
  private throwArcPointCount = 0;
  private throwArcAge = 0;

  private tracerCursor = 0;
  private muzzleCursor = 0;
  private casingCursor = 0;
  private burstCursor = 0;
  private shieldBreakCursor = 0;
  private explosionCursor = 0;
  private shockwaveCursor = 0;
  private splashHealCursor = 0;
  private slideDustCursor = 0;
  private eliminationCursor = 0;
  private grappleLineCursor = 0;
  private shieldBubbleCursor = 0;
  private vehicleBoostCursor = 0;
  private weaponUpgradeCursor = 0;
  private slurpBurstCursor = 0;
  private campfireHealCursor = 0;
  private impactDecalCursor = 0;
  private riftTearCursor = 0;
  private flagCaptureCursor = 0;
  private augmentVfxCursor = 0;
  private rngSeed = 918273;
  private disposed = false;

  // Reusable scratch math objects (zero allocations in update/handlers)
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, eventBus: EventBus) {
    this.scene = scene;
    this.eventBus = eventBus;

    this.root = new THREE.Group();
    this.root.name = 'vfx_root';
    this.scene.add(this.root);

    this.unitBoxGeo = this.trackGeo(new THREE.BoxGeometry(1, 1, 1));
    this.unitCylinderGeo = this.trackGeo(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    this.unitConeGeo = this.trackGeo(new THREE.ConeGeometry(0.5, 1, 8));
    this.unitSphereGeo = this.trackGeo(new THREE.SphereGeometry(0.5, 10, 8));
    this.unitRingGeo = this.trackGeo(new THREE.RingGeometry(0.65, 1.0, 20));
    this.unitCircleGeo = this.trackGeo(new THREE.CircleGeometry(0.5, 20));
    this.unitCrystalGeo = this.trackGeo(new THREE.OctahedronGeometry(0.5, 0));
    this.unitPlaneGeo = this.trackGeo(new THREE.PlaneGeometry(1, 1));
    this.casingGeo = this.trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.048, 8));
    this.droneBodyGeo = this.trackGeo(new THREE.BoxGeometry(0.52, 0.16, 0.42));
    this.droneRotorGeo = this.trackGeo(new THREE.TorusGeometry(0.14, 0.022, 6, 12));
    this.beamCylGeo = this.trackGeo(new THREE.CylinderGeometry(0.42, 0.68, 1, 12, 1, true));
    this.hexDomeGeo = this.trackGeo(new THREE.IcosahedronGeometry(1, 1));
    this.hexRingGeo = this.trackGeo(new THREE.RingGeometry(0.68, 1.0, 6));
    this.hexPrismGeo = this.trackGeo(new THREE.CylinderGeometry(0.85, 0.85, 1, 6, 1, true));
    this.diamondRingGeo = this.trackGeo(new THREE.RingGeometry(0.68, 1.0, 4));
    this.impactDecalTex = createImpactDecalTexture();
    this.ownedTextures.push(this.impactDecalTex);

    // Pre-allocated throw trajectory preview arc + landing ring
    this.throwArcGroup = new THREE.Group();
    this.throwArcGroup.name = 'vfx_throw_arc';
    this.throwArcGroup.visible = false;
    this.root.add(this.throwArcGroup);

    this.throwArcPositions = new Float32Array(THROW_ARC_MAX_POINTS * 3);
    this.throwArcPosAttr = new THREE.BufferAttribute(this.throwArcPositions, 3);
    this.throwArcPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.throwArcLineGeo = this.trackGeo(new THREE.BufferGeometry());
    this.throwArcLineGeo.setAttribute('position', this.throwArcPosAttr);
    this.throwArcLineGeo.setDrawRange(0, 0);

    this.throwArcLineMat = this.trackMat(
      new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 0.45,
        gapSize: 0.25,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.throwArcLine = new THREE.Line(this.throwArcLineGeo, this.throwArcLineMat);
    this.throwArcLine.frustumCulled = false;
    this.throwArcGroup.add(this.throwArcLine);

    this.throwArcDotMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    for (let i = 0; i < THROW_ARC_DOT_COUNT; i++) {
      const dot = new THREE.Mesh(this.unitCylinderGeo, this.throwArcDotMat);
      dot.visible = false;
      this.throwArcGroup.add(dot);
      this.throwArcDots.push(dot);
    }

    this.throwLandingRingGroup = new THREE.Group();
    this.throwLandingOuterMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    const outerLanding = new THREE.Mesh(this.unitRingGeo, this.throwLandingOuterMat);
    outerLanding.rotation.x = -Math.PI / 2;
    outerLanding.scale.setScalar(0.85);
    this.throwLandingRingGroup.add(outerLanding);

    this.throwLandingInnerMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    const innerLanding = new THREE.Mesh(this.unitRingGeo, this.throwLandingInnerMat);
    innerLanding.rotation.x = -Math.PI / 2;
    innerLanding.scale.setScalar(0.45);
    this.throwLandingRingGroup.add(innerLanding);

    this.throwLandingFillMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    const fillLanding = new THREE.Mesh(this.unitCircleGeo, this.throwLandingFillMat);
    fillLanding.rotation.x = -Math.PI / 2;
    fillLanding.scale.setScalar(0.42);
    this.throwLandingRingGroup.add(fillLanding);

    this.throwArcGroup.add(this.throwLandingRingGroup);

    this.initPools();
    this.subscribeEvents();
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.sharedGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private nextRand(): number {
    this.rngSeed = (this.rngSeed * 1664525 + 1013904223) >>> 0;
    return this.rngSeed / 4294967296;
  }

  private initPools(): void {
    // 1. Tracers
    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
      const material = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffe066,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const mesh = new THREE.Mesh(this.unitCylinderGeo, material);
      mesh.visible = false;
      this.root.add(mesh);
      this.tracers.push({
        active: false,
        age: 0,
        duration: 0.1,
        width: 0.04,
        length: 1,
        mesh,
        material,
      });
    }

    // 2. Muzzle flashes
    for (let i = 0; i < MUZZLE_POOL_SIZE; i++) {
      const material = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffd166,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      const group = new THREE.Group();
      group.visible = false;

      const core = new THREE.Mesh(this.unitSphereGeo, material);
      core.scale.setScalar(0.24);
      group.add(core);

      for (let f = 0; f < 3; f++) {
        const fin = new THREE.Mesh(this.unitPlaneGeo, material);
        fin.scale.set(0.46, 0.16, 1);
        fin.rotation.z = (f * Math.PI) / 3;
        group.add(fin);
      }

      const spike = new THREE.Mesh(this.unitConeGeo, material);
      spike.rotation.x = Math.PI / 2;
      spike.position.z = 0.22;
      spike.scale.set(0.18, 0.45, 0.18);
      group.add(spike);

      this.root.add(group);
      this.muzzles.push({
        active: false,
        age: 0,
        duration: 0.065,
        baseScale: 1,
        group,
        material,
      });
    }

    // 3. Spinning Brass Bullet Casings / Shotgun Shells
    for (let i = 0; i < CASING_POOL_SIZE; i++) {
      const material = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          roughness: 0.25,
          metalness: 0.85,
          transparent: true,
          opacity: 1,
        }),
      );
      const mesh = new THREE.Mesh(this.casingGeo, material);
      mesh.visible = false;
      this.root.add(mesh);
      this.casings.push({
        active: false,
        age: 0,
        duration: 0.55,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        mesh,
        material,
      });
    }

    // 4. Impact / Build Pop / Chest Open Bursts
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const ringMaterial = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMaterial);
      group.add(ringMesh);

      const particles: BurstParticle[] = [];
      for (let p = 0; p < BURST_PARTICLE_COUNT; p++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1,
          }),
        );
        const geo = p % 2 === 0 ? this.unitBoxGeo : this.unitCrystalGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        particles.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.08,
        });
      }

      this.root.add(group);
      this.bursts.push({
        active: false,
        age: 0,
        duration: 0.4,
        gravity: 9.8,
        drag: 2.5,
        useRing: true,
        ringStartScale: 0.15,
        ringEndScale: 0.8,
        group,
        ringMesh,
        ringMaterial,
        particles,
      });
    }

    // 5. Enhanced Shield-Break Crystalline Shards
    for (let i = 0; i < SHIELD_BREAK_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const outerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerRingMesh = new THREE.Mesh(this.unitRingGeo, outerRingMat);
      group.add(outerRingMesh);

      const innerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const innerRingMesh = new THREE.Mesh(this.unitRingGeo, innerRingMat);
      innerRingMesh.rotation.x = Math.PI / 3;
      group.add(innerRingMesh);

      const flashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flashMesh = new THREE.Mesh(this.unitSphereGeo, flashMat);
      group.add(flashMesh);

      const shards: ShieldShard[] = [];
      for (let s = 0; s < SHIELD_BREAK_SHARD_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xe0f2fe : s % 2 === 0 ? 0x22d3ee : 0x38bdf8,
            transparent: true,
            opacity: 1,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        shards.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          rz: 0,
          baseScale: 0.14,
        });
      }

      this.root.add(group);
      this.shieldBreaks.push({
        active: false,
        age: 0,
        duration: 0.62,
        group,
        outerRingMesh,
        outerRingMat,
        innerRingMesh,
        innerRingMat,
        flashMesh,
        flashMat,
        shards,
      });
    }

    // 6. Rocket Explosions
    for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitSphereGeo, coreMat);
      group.add(coreMesh);

      const outerMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerMesh = new THREE.Mesh(this.unitSphereGeo, outerMat);
      group.add(outerMesh);

      const smokeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x475569,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      const smokeMesh = new THREE.Mesh(this.unitSphereGeo, smokeMat);
      group.add(smokeMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfb923c,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      group.add(ringMesh);

      const embers: ExplosionEmber[] = [];
      for (let e = 0; e < EXPLOSION_EMBER_COUNT; e++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: e % 2 === 0 ? 0xfbbf24 : 0xef4444,
            transparent: true,
            opacity: 1,
          }),
        );
        const mesh = new THREE.Mesh(this.unitBoxGeo, material);
        group.add(mesh);
        embers.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.25,
        });
      }

      this.root.add(group);
      this.explosions.push({
        active: false,
        age: 0,
        duration: 0.65,
        radius: 5,
        group,
        coreMesh,
        coreMat,
        outerMesh,
        outerMat,
        smokeMesh,
        smokeMat,
        ringMesh,
        ringMat,
        embers,
      });
    }

    // 7. Shockwave Rings + Vertical Distortion Dome
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const violetRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const violetRingMesh = new THREE.Mesh(this.unitRingGeo, violetRingMat);
      violetRingMesh.rotation.x = -Math.PI / 2;
      group.add(violetRingMesh);

      const cyanRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const cyanRingMesh = new THREE.Mesh(this.unitRingGeo, cyanRingMat);
      cyanRingMesh.rotation.x = -Math.PI / 2;
      cyanRingMesh.position.y = 0.08;
      group.add(cyanRingMesh);

      const tiltRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xc084fc,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const tiltRingMesh = new THREE.Mesh(this.unitRingGeo, tiltRingMat);
      tiltRingMesh.rotation.set(Math.PI / 4, 0, Math.PI / 6);
      group.add(tiltRingMesh);

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x8b5cf6,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

      this.root.add(group);
      this.shockwaves.push({
        active: false,
        age: 0,
        duration: 0.58,
        radius: 6,
        group,
        violetRingMesh,
        violetRingMat,
        cyanRingMesh,
        cyanRingMat,
        tiltRingMesh,
        tiltRingMat,
        domeMesh,
        domeMat,
      });
    }

    // 8. Chug Splash Heal Mist Dome + Rising Healing Sparkles
    for (let i = 0; i < SPLASH_HEAL_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x2dd4bf,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x5eead4,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      group.add(ringMesh);

      const sparkles: SplashSparkle[] = [];
      for (let s = 0; s < SPLASH_SPARKLE_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xecfeff : s % 2 === 0 ? 0x67e8f9 : 0x2dd4bf,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        const geo = s % 2 === 0 ? this.unitCrystalGeo : this.unitSphereGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        sparkles.push({
          mesh,
          material,
          angle: (s / SPLASH_SPARKLE_COUNT) * Math.PI * 2,
          radius: 0.3,
          speedY: 1.5,
          spin: 4,
          baseScale: 0.11,
        });
      }

      this.root.add(group);
      this.splashHeals.push({
        active: false,
        age: 0,
        duration: 0.85,
        radius: 4.5,
        group,
        domeMesh,
        domeMat,
        ringMesh,
        ringMat,
        sparkles,
      });
    }

    // 9. Biome-Colored Slide Dust Particles
    for (let i = 0; i < SLIDE_DUST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const puffs: SlideDustPuff[] = [];
      for (let p = 0; p < SLIDE_DUST_PARTICLE_COUNT; p++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0xd6d3d1,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
          }),
        );
        const mesh = new THREE.Mesh(this.unitSphereGeo, material);
        group.add(mesh);
        puffs.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.16,
        });
      }

      this.root.add(group);
      this.slideDusts.push({
        active: false,
        age: 0,
        duration: 0.42,
        group,
        puffs,
      });
    }

    // 10. Elimination Drone Beam-Out
    for (let i = 0; i < ELIMINATION_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const droneGroup = new THREE.Group();
      const hullMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: '#1e293b',
          roughness: 0.35,
          metalness: 0.7,
        }),
      );
      const eyeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#38bdf8',
        }),
      );
      const rotorMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#7dd3fc',
          transparent: true,
          opacity: 0.85,
        }),
      );

      const hull = new THREE.Mesh(this.droneBodyGeo, hullMat);
      droneGroup.add(hull);

      const eye = new THREE.Mesh(this.unitSphereGeo, eyeMat);
      eye.scale.setScalar(0.14);
      eye.position.set(0, -0.06, 0.20);
      droneGroup.add(eye);

      const rotors: THREE.Mesh[] = [];
      const offsets = [
        [0.26, 0.09, 0.2],
        [-0.26, 0.09, 0.2],
        [0.26, 0.09, -0.2],
        [-0.26, 0.09, -0.2],
      ];
      for (const [rx, ry, rz] of offsets) {
        const rotor = new THREE.Mesh(this.droneRotorGeo, rotorMat);
        rotor.rotation.x = Math.PI / 2;
        rotor.position.set(rx, ry, rz);
        droneGroup.add(rotor);
        rotors.push(rotor);
      }
      group.add(droneGroup);

      const beamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const beamMesh = new THREE.Mesh(this.beamCylGeo, beamMat);
      group.add(beamMesh);

      const voxels: EliminationVoxel[] = [];
      for (let v = 0; v < ELIMINATION_VOXEL_COUNT; v++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: v % 3 === 0 ? '#e0f2fe' : v % 2 === 0 ? '#38bdf8' : '#0284c7',
            transparent: true,
            opacity: 0.95,
          }),
        );
        const mesh = new THREE.Mesh(this.unitBoxGeo, material);
        group.add(mesh);
        voxels.push({
          mesh,
          material,
          angle: (v / ELIMINATION_VOXEL_COUNT) * Math.PI * 2,
          radius: 0.22 + (v % 4) * 0.09,
          speedY: 1.5 + (v % 3) * 0.45,
          spinSpeed: 3 + (v % 5),
          delay: (v % 6) * 0.07,
          baseScale: 0.10 + (v % 3) * 0.035,
        });
      }

      this.root.add(group);
      this.eliminations.push({
        active: false,
        age: 0,
        duration: 1.65,
        baseX: 0,
        baseY: 0,
        baseZ: 0,
        group,
        droneGroup,
        rotors,
        beamMesh,
        beamMat,
        voxels,
      });
    }

    // 11. Weakpoint Target Discs
    for (let i = 0; i < WEAKPOINT_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const outerMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const whiteMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#f8fafc',
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#ef4444',
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );

      const outerRing = new THREE.Mesh(this.unitRingGeo, outerMat);
      outerRing.scale.setScalar(0.32);
      group.add(outerRing);

      const midRing = new THREE.Mesh(this.unitRingGeo, whiteMat);
      midRing.scale.setScalar(0.20);
      midRing.position.z = 0.002;
      group.add(midRing);

      const bullseye = new THREE.Mesh(this.unitCircleGeo, coreMat);
      bullseye.scale.setScalar(0.18);
      bullseye.position.z = 0.004;
      group.add(bullseye);

      const spinnerGroup = new THREE.Group();
      spinnerGroup.position.z = 0.006;
      for (let t = 0; t < 4; t++) {
        const tick = new THREE.Mesh(this.unitBoxGeo, outerMat);
        const ang = (t * Math.PI) / 2;
        tick.position.set(Math.cos(ang) * 0.34, Math.sin(ang) * 0.34, 0);
        tick.rotation.z = ang;
        tick.scale.set(0.10, 0.025, 0.01);
        spinnerGroup.add(tick);
      }
      group.add(spinnerGroup);

      this.root.add(group);
      this.weakpoints.push({
        active: false,
        propId: '',
        age: 0,
        group,
        spinnerGroup,
      });
    }

    // 12. Grapple Lines (taut glowing cyan/gold cable + impact hook tip)
    for (let i = 0; i < GRAPPLE_LINE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const cableMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const cableMesh = new THREE.Mesh(this.unitCylinderGeo, cableMat);
      group.add(cableMesh);

      const goldWireMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const goldWireMesh = new THREE.Mesh(this.unitCylinderGeo, goldWireMat);
      group.add(goldWireMesh);

      const hookGroup = new THREE.Group();
      const hookMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.98,
        }),
      );
      const tipCone = new THREE.Mesh(this.unitConeGeo, hookMat);
      tipCone.scale.set(0.18, 0.36, 0.18);
      tipCone.position.y = 0.08;
      hookGroup.add(tipCone);

      for (let c = 0; c < 3; c++) {
        const ang = (c / 3) * Math.PI * 2;
        const claw = new THREE.Mesh(this.unitBoxGeo, hookMat);
        claw.position.set(Math.cos(ang) * 0.11, -0.06, Math.sin(ang) * 0.11);
        claw.rotation.set(Math.sin(ang) * 0.65, -ang, -Math.cos(ang) * 0.65);
        claw.scale.set(0.04, 0.22, 0.04);
        hookGroup.add(claw);
      }
      group.add(hookGroup);

      const impactRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const impactRingMesh = new THREE.Mesh(this.unitRingGeo, impactRingMat);
      group.add(impactRingMesh);

      this.root.add(group);
      this.grappleLines.push({
        active: false,
        age: 0,
        duration: 0.35,
        length: 1,
        group,
        cableMesh,
        cableMat,
        goldWireMesh,
        goldWireMat,
        hookGroup,
        hookMat,
        impactRingMesh,
        impactRingMat,
      });
    }

    // 13. Shield Bubble Energy Domes (translucent hexagonal blue energy dome)
    for (let i = 0; i < SHIELD_BUBBLE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const domeMesh = new THREE.Mesh(this.hexDomeGeo, domeMat);
      group.add(domeMesh);

      const hexWireMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          wireframe: true,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const hexWireMesh = new THREE.Mesh(this.hexDomeGeo, hexWireMat);
      group.add(hexWireMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x7dd3fc,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      group.add(ringMesh);

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xbae6fd,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitCrystalGeo, coreMat);
      coreMesh.scale.setScalar(0.32);
      group.add(coreMesh);

      this.root.add(group);
      this.shieldBubbles.push({
        active: false,
        id: '',
        age: 0,
        duration: 18,
        radius: 5.2,
        group,
        domeMesh,
        domeMat,
        hexWireMesh,
        hexWireMat,
        ringMesh,
        ringMat,
        coreMesh,
        coreMat,
      });
    }

    // 14. Vehicle Twin Boost Exhaust Sparks
    for (let i = 0; i < VEHICLE_BOOST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const plumeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );

      const leftPlume = new THREE.Mesh(this.unitConeGeo, plumeMat);
      leftPlume.position.set(-0.35, 0, 0.2);
      leftPlume.rotation.x = Math.PI / 2;
      leftPlume.scale.set(0.24, 0.55, 0.24);
      group.add(leftPlume);

      const rightPlume = new THREE.Mesh(this.unitConeGeo, plumeMat);
      rightPlume.position.set(0.35, 0, 0.2);
      rightPlume.rotation.x = Math.PI / 2;
      rightPlume.scale.set(0.24, 0.55, 0.24);
      group.add(rightPlume);

      const sparks: VehicleBoostSpark[] = [];
      for (let s = 0; s < VEHICLE_BOOST_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xfef08a : s % 2 === 0 ? 0x22d3ee : 0x38bdf8,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = s % 2 === 0 ? this.unitCrystalGeo : this.unitBoxGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.1,
        });
      }

      this.root.add(group);
      this.vehicleBoosts.push({
        active: false,
        age: 0,
        duration: 0.28,
        group,
        leftPlume,
        rightPlume,
        plumeMat,
        sparks,
      });
    }

    // 15. Weapon Upgrade Bench Holographic Ring + Rising Spark Burst
    for (let i = 0; i < WEAPON_UPGRADE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const outerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x26a6ff,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerRingMesh = new THREE.Mesh(this.unitRingGeo, outerRingMat);
      outerRingMesh.rotation.x = -Math.PI / 2;
      group.add(outerRingMesh);

      const innerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const innerRingMesh = new THREE.Mesh(this.unitRingGeo, innerRingMat);
      innerRingMesh.rotation.x = -Math.PI / 2;
      group.add(innerRingMesh);

      const sparks: WeaponUpgradeSpark[] = [];
      for (let s = 0; s < WEAPON_UPGRADE_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0x26a6ff,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = s % 2 === 0 ? this.unitCrystalGeo : this.unitBoxGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / WEAPON_UPGRADE_SPARK_COUNT) * Math.PI * 2,
          radius: 0.45,
          speedY: 1.8,
          spin: 3.5,
          baseScale: 0.09,
        });
      }

      this.root.add(group);
      this.weaponUpgrades.push({
        active: false,
        age: 0,
        duration: 0.92,
        group,
        outerRingMesh,
        outerRingMat,
        innerRingMesh,
        innerRingMat,
        sparks,
      });
    }

    // 16. Slurp Barrel Burst (glowing cyan liquid splash dome + upward droplet particles)
    for (let i = 0; i < SLURP_BURST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      group.add(ringMesh);

      const droplets: SlurpDroplet[] = [];
      for (let d = 0; d < SLURP_BURST_DROPLET_COUNT; d++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: d % 4 === 0 ? 0xa3e635 : d % 2 === 0 ? 0x67e8f9 : 0x22d3ee,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = d % 2 === 0 ? this.unitSphereGeo : this.unitCrystalGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        droplets.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.11,
        });
      }

      this.root.add(group);
      this.slurpBursts.push({
        active: false,
        age: 0,
        duration: 0.85,
        radius: 4.0,
        group,
        domeMesh,
        domeMat,
        ringMesh,
        ringMat,
        droplets,
      });
    }

    // 17. Campfire Heal (rising warm green/amber healing ember motes)
    for (let i = 0; i < CAMPFIRE_HEAL_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const glowRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const glowRingMesh = new THREE.Mesh(this.unitRingGeo, glowRingMat);
      glowRingMesh.rotation.x = -Math.PI / 2;
      group.add(glowRingMesh);

      const motes: CampfireMote[] = [];
      for (let m = 0; m < CAMPFIRE_HEAL_MOTE_COUNT; m++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: m % 3 === 0 ? 0xfbbf24 : m % 2 === 0 ? 0x4ade80 : 0xf97316,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = m % 2 === 0 ? this.unitCrystalGeo : this.unitSphereGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        motes.push({
          mesh,
          material,
          angle: (m / CAMPFIRE_HEAL_MOTE_COUNT) * Math.PI * 2,
          radius: 0.5,
          speedY: 1.4,
          swaySpeed: 2.5,
          baseScale: 0.085,
        });
      }

      this.root.add(group);
      this.campfireHeals.push({
        active: false,
        age: 0,
        duration: 1.15,
        group,
        glowRingMesh,
        glowRingMat,
        motes,
      });
    }

    // 18. Surface Bullet Impact Decals (max 40 pooled circular scorch/splinter discs, polygonOffset: true)
    for (let i = 0; i < IMPACT_DECAL_POOL_SIZE; i++) {
      const material = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x3f3f46,
          map: this.impactDecalTex,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          side: THREE.DoubleSide,
        }),
      );
      const mesh = new THREE.Mesh(this.unitCircleGeo, material);
      mesh.name = `vfx_impact_decal_${i}`;
      mesh.visible = false;
      this.root.add(mesh);
      this.impactDecals.push({
        active: false,
        age: 0,
        duration: IMPACT_DECAL_DURATION,
        baseOpacity: 0.86,
        mesh,
        material,
      });
    }

    // 19. Sky Rift Tears (cyan-violet jagged crack + expanding portal rings at ground & sky endpoints)
    for (let i = 0; i < RIFT_TEAR_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const ground = this.createRiftEndpoint(1.0);
      const sky = this.createRiftEndpoint(1.65);
      group.add(ground.group);
      group.add(sky.group);

      this.root.add(group);
      this.riftTears.push({
        active: false,
        age: 0,
        duration: 1.35,
        group,
        ground,
        sky,
      });
    }

    // 20. Flag Captured (tall golden beacon column + rising celebratory fireworks sparks)
    for (let i = 0; i < FLAG_CAPTURE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const beaconMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const beaconMesh = new THREE.Mesh(this.beamCylGeo, beaconMat);
      beaconMesh.position.y = 8;
      beaconMesh.scale.set(0.85, 16, 0.85);
      group.add(beaconMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.unitCylinderGeo, coreBeamMat);
      coreBeamMesh.position.y = 9;
      coreBeamMesh.scale.set(0.28, 18, 0.28);
      group.add(coreBeamMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      group.add(ringMesh);

      const sparks: FlagCaptureSpark[] = [];
      for (let s = 0; s < FLAG_CAPTURE_SPARK_COUNT; s++) {
        const sparkColor =
          s % 4 === 0 ? 0xffffff : s % 3 === 0 ? 0x22d3ee : s % 2 === 0 ? 0xfde047 : 0xfbbf24;
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: sparkColor,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = s % 2 === 0 ? this.unitCrystalGeo : this.unitSphereGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.14,
          phase: s * 0.7,
        });
      }

      this.root.add(group);
      this.flagCaptures.push({
        active: false,
        age: 0,
        duration: 2.1,
        group,
        beaconMesh,
        beaconMat,
        coreBeamMesh,
        coreBeamMat,
        ringMesh,
        ringMat,
        sparks,
      });
    }

    // 21. Augment Activate (ascending holographic hex/ring aura tinted by augment color)
    for (let i = 0; i < AUGMENT_VFX_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const lowerHexMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const lowerHexMesh = new THREE.Mesh(this.hexRingGeo, lowerHexMat);
      lowerHexMesh.rotation.x = -Math.PI / 2;
      group.add(lowerHexMesh);

      const upperHexMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const upperHexMesh = new THREE.Mesh(this.hexRingGeo, upperHexMat);
      upperHexMesh.rotation.x = -Math.PI / 2;
      group.add(upperHexMesh);

      const shellMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const shellMesh = new THREE.Mesh(this.hexPrismGeo, shellMat);
      shellMesh.position.y = 0.9;
      group.add(shellMesh);

      const motes: AugmentVfxMote[] = [];
      for (let m = 0; m < AUGMENT_VFX_MOTE_COUNT; m++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        motes.push({
          mesh,
          material,
          angle: (m / AUGMENT_VFX_MOTE_COUNT) * Math.PI * 2,
          radius: 0.72,
          speedY: 1.9,
          spin: 4.0,
          baseScale: 0.095,
        });
      }

      this.root.add(group);
      this.augmentVfx.push({
        active: false,
        age: 0,
        duration: 1.15,
        group,
        lowerHexMesh,
        lowerHexMat,
        upperHexMesh,
        upperHexMat,
        shellMesh,
        shellMat,
        motes,
      });
    }

    // 22. Tactical World Ping (singleton pulsing diamond ring + slender color-coded beacon beam up to 16s)
    {
      const group = new THREE.Group();
      group.name = 'vfx_tactical_ping';
      group.visible = false;

      const outerDiamondMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerDiamondMesh = new THREE.Mesh(this.diamondRingGeo, outerDiamondMat);
      outerDiamondMesh.rotation.x = -Math.PI / 2;
      outerDiamondMesh.position.y = 0.08;
      group.add(outerDiamondMesh);

      const rippleDiamondMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const rippleDiamondMesh = new THREE.Mesh(this.diamondRingGeo, rippleDiamondMat);
      rippleDiamondMesh.rotation.x = -Math.PI / 2;
      rippleDiamondMesh.position.y = 0.09;
      group.add(rippleDiamondMesh);

      const markerMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const markerMesh = new THREE.Mesh(this.unitCrystalGeo, markerMat);
      markerMesh.position.y = 1.65;
      markerMesh.scale.set(0.36, 0.54, 0.36);
      group.add(markerMesh);

      const beamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const beamMesh = new THREE.Mesh(this.unitCylinderGeo, beamMat);
      beamMesh.position.y = 11;
      beamMesh.scale.set(0.16, 22, 0.16);
      group.add(beamMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.unitCylinderGeo, coreBeamMat);
      coreBeamMesh.position.y = 11;
      coreBeamMesh.scale.set(0.055, 22, 0.055);
      group.add(coreBeamMesh);

      this.root.add(group);
      this.tacticalPing = {
        active: false,
        age: 0,
        duration: TACTICAL_PING_DURATION,
        kind: 'move',
        group,
        outerDiamondMesh,
        outerDiamondMat,
        rippleDiamondMesh,
        rippleDiamondMat,
        markerMesh,
        markerMat,
        beamMesh,
        beamMat,
        coreBeamMesh,
        coreBeamMat,
      };
    }
  }

  private createRiftEndpoint(baseScale: number): RiftTearEndpoint {
    const group = new THREE.Group();

    const outerRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    const outerRingMesh = new THREE.Mesh(this.unitRingGeo, outerRingMat);
    outerRingMesh.rotation.x = -Math.PI / 2;
    group.add(outerRingMesh);

    const innerRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    const innerRingMesh = new THREE.Mesh(this.unitRingGeo, innerRingMat);
    innerRingMesh.rotation.set(Math.PI / 3, 0, Math.PI / 5);
    group.add(innerRingMesh);

    const coreMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const coreMesh = new THREE.Mesh(this.unitSphereGeo, coreMat);
    coreMesh.position.y = 1.1 * baseScale;
    group.add(coreMesh);

    const crackMatCyan = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const crackMatViolet = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x8b5cf6,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    const crackShards: THREE.Mesh[] = [];
    for (let i = 0; i < RIFT_TEAR_SHARD_COUNT; i++) {
      const mat = i % 2 === 0 ? crackMatCyan : crackMatViolet;
      const shard = new THREE.Mesh(this.unitCrystalGeo, mat);
      const frac = i / (RIFT_TEAR_SHARD_COUNT - 1);
      const zig = (i % 2 === 0 ? 1 : -1) * 0.24 * baseScale;
      shard.position.set(zig, (0.3 + frac * 2.1) * baseScale, (i % 3 - 1) * 0.1 * baseScale);
      shard.rotation.z = (i % 2 === 0 ? -1 : 1) * 0.42;
      shard.scale.set(0.22 * baseScale, 0.88 * baseScale, 0.12 * baseScale);
      group.add(shard);
      crackShards.push(shard);
    }

    return {
      group,
      outerRingMesh,
      outerRingMat,
      innerRingMesh,
      innerRingMat,
      coreMesh,
      coreMat,
      crackShards,
      crackMatCyan,
      crackMatViolet,
      baseScale,
    };
  }

  private updateRiftEndpoint(
    ep: RiftTearEndpoint,
    t: number,
    age: number,
    safeDt: number,
  ): void {
    const easeOut = 1 - Math.pow(1 - t, 3);
    const fade = 1 - t;
    const sc = ep.baseScale;

    ep.outerRingMesh.scale.setScalar(sc * (0.45 + 3.4 * easeOut));
    ep.outerRingMat.opacity = 0.94 * fade;

    ep.innerRingMesh.rotation.y += 4.2 * safeDt;
    ep.innerRingMesh.scale.setScalar(sc * (0.35 + 2.6 * easeOut));
    ep.innerRingMat.opacity = 0.9 * fade;

    const corePulse = sc * (0.45 + 1.15 * Math.sin(t * Math.PI));
    ep.coreMesh.scale.set(corePulse * 0.7, corePulse * 1.4, corePulse * 0.7);
    ep.coreMat.opacity = 0.85 * fade * fade;

    const crackWidth = Math.max(0.05, 1 - t * 0.65);
    ep.crackMatCyan.opacity = 0.95 * fade;
    ep.crackMatViolet.opacity = 0.92 * fade;

    for (let i = 0; i < ep.crackShards.length; i++) {
      const shard = ep.crackShards[i];
      shard.rotation.y += (i % 2 === 0 ? 3.5 : -3.5) * safeDt;
      shard.scale.set(
        0.24 * sc * crackWidth,
        0.92 * sc * (0.65 + 0.55 * Math.sin(t * Math.PI + age * 2)),
        0.14 * sc * crackWidth,
      );
    }
  }

  private subscribeEvents(): void {
    this.unsubs.push(
      this.eventBus.on('vfx:tracer', (e) => this.spawnTracer(e.from, e.to, e.color, e.width)),
      this.eventBus.on('vfx:muzzle', (e) => this.spawnMuzzle(e.position, e.direction, e.weaponId)),
      this.eventBus.on('vfx:impact', (e) => this.spawnImpact(e.position, e.normal, e.material)),
      this.eventBus.on('vfx:explosion', (e) => this.spawnExplosion(e.position, e.radius)),
      this.eventBus.on('vfx:elimination', (e) => this.spawnElimination(e.position, e.skinColor)),
      this.eventBus.on('vfx:build_pop', (e) => this.spawnBuildPop(e.position, e.material, e.pieceType)),
      this.eventBus.on('vfx:chest_open', (e) => this.spawnChestOpen(e.position)),
      this.eventBus.on('vfx:weakpoint', (e) =>
        this.updateWeakpoint(e.propId, e.position, e.normal, e.active),
      ),
      this.eventBus.on('vfx:shockwave', (e) => this.spawnShockwave(e.position, e.radius)),
      this.eventBus.on('vfx:splash_heal', (e) => this.spawnSplashHeal(e.position, e.radius)),
      this.eventBus.on('vfx:slide_dust', (e) => this.spawnSlideDust(e.position, e.biome)),
      this.eventBus.on('vfx:grapple_line', (e) =>
        this.spawnGrappleLine(e.from, e.to, e.duration),
      ),
      this.eventBus.on('vfx:shield_bubble', (e) =>
        this.spawnShieldBubble(e.id, e.position, e.radius, e.duration),
      ),
      this.eventBus.on('vfx:vehicle_boost', (e) => this.spawnVehicleBoost(e.position, e.direction)),
      this.eventBus.on('vfx:weapon_upgrade', (e) =>
        this.spawnWeaponUpgrade(e.position, e.rarity),
      ),
      this.eventBus.on('vfx:slurp_burst', (e) => this.spawnSlurpBurst(e.position, e.radius)),
      this.eventBus.on('vfx:campfire_heal', (e) => this.spawnCampfireHeal(e.position)),
      this.eventBus.on('vfx:rift_tear', (e) => this.spawnRiftTear(e.position, e.skyPosition)),
      this.eventBus.on('vfx:flag_captured', (e) => this.spawnFlagCapture(e.position)),
      this.eventBus.on('vfx:augment_activate', (e) =>
        this.spawnAugmentVfx(e.position, e.color),
      ),
      this.eventBus.on('vfx:tactical_ping', (e) => this.spawnTacticalPing(e.position, e.kind)),
    );
  }

  private orientToDirection(obj: THREE.Object3D, dir: Vec3Like, localForward: THREE.Vector3): void {
    this.tmpDir.set(dir.x, dir.y, dir.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.copy(localForward);
    } else {
      this.tmpDir.normalize();
    }
    this.tmpQuat.setFromUnitVectors(localForward, this.tmpDir);
    obj.quaternion.copy(this.tmpQuat);
  }

  private spawnTracer(from: Vec3Like, to: Vec3Like, color = 0xffe066, width = 0.036): void {
    if (this.disposed) return;

    const slot = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % TRACER_POOL_SIZE;

    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const len = this.tmpDir.length();
    if (len < 1e-4) return;

    this.tmpDir.divideScalar(len);
    this.tmpQuat.setFromUnitVectors(this.upAxis, this.tmpDir);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.11;
    slot.width = width;
    slot.length = len;

    slot.mesh.position.addVectors(this.tmpA, this.tmpB).multiplyScalar(0.5);
    slot.mesh.quaternion.copy(this.tmpQuat);
    slot.mesh.scale.set(width, len, width);
    slot.material.color.setHex(color);
    slot.material.opacity = 0.92;
    slot.mesh.visible = true;
  }

  private spawnMuzzle(position: Vec3Like, direction: Vec3Like, weaponId: WeaponId): void {
    if (this.disposed) return;

    const slot = this.muzzles[this.muzzleCursor];
    this.muzzleCursor = (this.muzzleCursor + 1) % MUZZLE_POOL_SIZE;

    let scale = 1.0;
    let color = 0xffd166;
    if (weaponId === 'rocket_launcher') {
      scale = 1.85;
      color = 0xf97316;
    } else if (weaponId === 'heavy_shotgun') {
      scale = 1.55;
      color = 0xf59e0b;
    } else if (weaponId === 'pump_shotgun' || weaponId === 'tac_shotgun') {
      scale = 1.45;
      color = 0xfbbf24;
    } else if (weaponId === 'sniper') {
      scale = 1.5;
      color = 0x93c5fd;
    } else if (weaponId === 'mythic_blade_rifle') {
      scale = 1.35;
      color = 0x22d3ee;
    } else if (weaponId === 'grappler') {
      scale = 1.05;
      color = 0x22d3ee;
    } else if (weaponId === 'smg' || weaponId === 'pistol') {
      scale = 0.78;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.065;
    slot.baseScale = scale;

    slot.group.position.set(position.x, position.y, position.z);
    this.orientToDirection(slot.group, direction, this.zAxis);
    slot.group.rotateZ(this.nextRand() * Math.PI);
    slot.group.scale.setScalar(scale);
    slot.material.color.setHex(color);
    slot.material.opacity = 0.95;
    slot.group.visible = true;

    // Eject spinning brass casing or shotgun shell for bullet/shell firearms
    const ammoType = WEAPONS[weaponId]?.ammoType;
    if (
      ammoType === 'light' ||
      ammoType === 'medium' ||
      ammoType === 'heavy' ||
      ammoType === 'shells'
    ) {
      this.spawnCasing(position, direction, ammoType);
    }
  }

  private spawnCasing(position: Vec3Like, direction: Vec3Like, ammoType: AmmoType): void {
    const slot = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % CASING_POOL_SIZE;

    this.tmpDir.set(direction.x, direction.y, direction.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 0, 1);
    } else {
      this.tmpDir.normalize();
    }

    // Character's right side vector = normalize(cross(forward, up))
    this.tmpRight.crossVectors(this.tmpDir, this.upAxis);
    if (this.tmpRight.lengthSq() < 1e-6) {
      this.tmpRight.set(-1, 0, 0);
    } else {
      this.tmpRight.normalize();
    }

    const isShell = ammoType === 'shells';
    const isHeavy = ammoType === 'heavy';
    const isLight = ammoType === 'light';

    const scaleXZ = isShell ? 1.45 : isHeavy ? 1.4 : isLight ? 0.85 : 1.0;
    const scaleY = isShell ? 1.3 : isHeavy ? 1.65 : isLight ? 0.85 : 1.0;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.56;

    // Eject slightly back from muzzle at receiver port
    slot.mesh.position.set(
      position.x - this.tmpDir.x * 0.22 + this.tmpRight.x * 0.05,
      position.y - this.tmpDir.y * 0.22 + 0.02,
      position.z - this.tmpDir.z * 0.22 + this.tmpRight.z * 0.05,
    );
    slot.mesh.rotation.set(
      this.nextRand() * Math.PI,
      this.nextRand() * Math.PI,
      this.nextRand() * Math.PI,
    );
    slot.mesh.scale.set(scaleXZ, scaleY, scaleXZ);

    const outSpeed = 2.2 + this.nextRand() * 1.4;
    const upSpeed = 2.3 + this.nextRand() * 1.3;
    const backDrift = -0.35 + (this.nextRand() - 0.5) * 0.8;

    slot.vx = this.tmpRight.x * outSpeed + this.tmpDir.x * backDrift;
    slot.vy = upSpeed;
    slot.vz = this.tmpRight.z * outSpeed + this.tmpDir.z * backDrift;
    slot.rx = (this.nextRand() > 0.5 ? 1 : -1) * (18 + this.nextRand() * 14);
    slot.ry = (this.nextRand() > 0.5 ? 1 : -1) * (16 + this.nextRand() * 14);
    slot.rz = (this.nextRand() > 0.5 ? 1 : -1) * (20 + this.nextRand() * 14);

    slot.material.color.setHex(isShell ? 0xdc2626 : 0xfbbf24);
    slot.material.metalness = isShell ? 0.35 : 0.85;
    slot.material.roughness = isShell ? 0.45 : 0.22;
    slot.material.opacity = 1;
    slot.mesh.visible = true;
  }

  private spawnImpact(position: Vec3Like, normal: Vec3Like, material: ImpactMaterial): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const safeNormal: Vec3Like = isFiniteVec3(normal) ? normal : { x: 0, y: 1, z: 0 };

    if (material === 'shield_break') {
      this.spawnShieldBreak(position, safeNormal);
      return;
    }

    if (
      material === 'wood' ||
      material === 'brick' ||
      material === 'metal' ||
      material === 'dirt'
    ) {
      this.spawnImpactDecal(position, safeNormal, material);
    }

    const slot = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % BURST_POOL_SIZE;

    this.tmpDir.set(safeNormal.x, safeNormal.y, safeNormal.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 1, 0);
    } else {
      this.tmpDir.normalize();
    }

    let primaryColor = '#c88a4b';
    let secondaryColor = '#fde68a';
    let ringColor = '#e2e8f0';
    let particleCount = 8;
    let speedMin = 2.0;
    let speedMax = 4.8;
    let baseScale = 0.065;
    let ringEndScale = 0.45;
    let duration = 0.38;
    let gravity = 9.5;

    switch (material) {
      case 'wood':
        primaryColor = MATERIAL_STATS.wood.color;
        secondaryColor = '#78350f';
        ringColor = '#fde68a';
        break;
      case 'brick':
        primaryColor = MATERIAL_STATS.brick.color;
        secondaryColor = '#94a3b8';
        ringColor = '#cbd5e1';
        gravity = 12.0;
        break;
      case 'metal':
        primaryColor = '#fef08a';
        secondaryColor = '#f59e0b';
        ringColor = '#ffffff';
        particleCount = 10;
        speedMin = 3.5;
        speedMax = 7.5;
        baseScale = 0.05;
        duration = 0.30;
        break;
      case 'dirt':
        primaryColor = '#854d0e';
        secondaryColor = '#65a30d';
        ringColor = '#a16207';
        break;
      case 'flesh':
        primaryColor = '#ef4444';
        secondaryColor = '#fb923c';
        ringColor = '#fca5a5';
        duration = 0.32;
        break;
      case 'shield':
        primaryColor = '#38bdf8';
        secondaryColor = '#22d3ee';
        ringColor = '#7dd3fc';
        particleCount = 10;
        ringEndScale = 0.72;
        gravity = 3.0;
        duration = 0.38;
        break;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = duration;
    slot.gravity = gravity;
    slot.drag = 2.6;
    slot.useRing = true;
    slot.ringStartScale = 0.12;
    slot.ringEndScale = ringEndScale;

    slot.group.position.set(
      position.x + this.tmpDir.x * 0.02,
      position.y + this.tmpDir.y * 0.02,
      position.z + this.tmpDir.z * 0.02,
    );
    slot.group.visible = true;

    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.ringMesh.quaternion.copy(this.tmpQuat);
    slot.ringMesh.scale.setScalar(slot.ringStartScale);
    slot.ringMaterial.color.set(ringColor);
    slot.ringMaterial.opacity = 0.9;
    slot.ringMesh.visible = true;

    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const p = slot.particles[i];
      if (i >= particleCount) {
        p.mesh.visible = false;
        continue;
      }
      const speed = speedMin + this.nextRand() * (speedMax - speedMin);
      const sx = (this.nextRand() - 0.5) * 2;
      const sy = (this.nextRand() - 0.5) * 2;
      const sz = (this.nextRand() - 0.5) * 2;
      this.tmpA.set(
        this.tmpDir.x * 0.9 + sx * 0.85,
        this.tmpDir.y * 0.9 + sy * 0.85 + 0.25,
        this.tmpDir.z * 0.9 + sz * 0.85,
      );
      if (this.tmpA.lengthSq() < 1e-6) this.tmpA.set(0, 1, 0);
      this.tmpA.normalize().multiplyScalar(speed);

      p.vx = this.tmpA.x;
      p.vy = this.tmpA.y;
      p.vz = this.tmpA.z;
      p.rx = (this.nextRand() - 0.5) * 14;
      p.ry = (this.nextRand() - 0.5) * 14;
      p.baseScale = baseScale * (0.75 + this.nextRand() * 0.55);
      p.mesh.position.set(0, 0, 0);
      p.mesh.scale.setScalar(p.baseScale);
      p.material.color.set(i % 2 === 0 ? primaryColor : secondaryColor);
      p.material.opacity = 1;
      p.mesh.visible = true;
    }
  }

  private spawnShieldBreak(position: Vec3Like, normal: Vec3Like): void {
    const slot = this.shieldBreaks[this.shieldBreakCursor];
    this.shieldBreakCursor = (this.shieldBreakCursor + 1) % SHIELD_BREAK_POOL_SIZE;

    this.tmpDir.set(normal.x, normal.y, normal.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 1, 0);
    } else {
      this.tmpDir.normalize();
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.62;

    slot.group.position.set(
      position.x + this.tmpDir.x * 0.03,
      position.y + this.tmpDir.y * 0.03,
      position.z + this.tmpDir.z * 0.03,
    );
    slot.group.visible = true;

    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.outerRingMesh.quaternion.copy(this.tmpQuat);
    slot.outerRingMesh.scale.setScalar(0.2);
    slot.outerRingMat.opacity = 0.95;

    slot.innerRingMesh.rotation.set(Math.PI / 3, this.nextRand() * Math.PI, 0);
    slot.innerRingMesh.scale.setScalar(0.15);
    slot.innerRingMat.opacity = 0.9;

    slot.flashMesh.scale.setScalar(0.35);
    slot.flashMat.opacity = 0.85;

    for (let i = 0; i < SHIELD_BREAK_SHARD_COUNT; i++) {
      const sh = slot.shards[i];
      const ang = (i / SHIELD_BREAK_SHARD_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      const elev = (this.nextRand() - 0.15) * 1.4;
      const speed = 4.0 + this.nextRand() * 5.2;

      this.tmpA.set(
        Math.cos(ang) * 0.9 + this.tmpDir.x * 0.55,
        0.35 + elev + this.tmpDir.y * 0.45,
        Math.sin(ang) * 0.9 + this.tmpDir.z * 0.55,
      );
      if (this.tmpA.lengthSq() < 1e-6) this.tmpA.set(0, 1, 0);
      this.tmpA.normalize().multiplyScalar(speed);

      sh.vx = this.tmpA.x;
      sh.vy = this.tmpA.y;
      sh.vz = this.tmpA.z;
      sh.rx = (this.nextRand() - 0.5) * 18;
      sh.ry = (this.nextRand() - 0.5) * 18;
      sh.rz = (this.nextRand() - 0.5) * 18;
      sh.baseScale = 0.11 + this.nextRand() * 0.08;

      sh.mesh.position.set(0, 0, 0);
      sh.mesh.rotation.set(this.nextRand() * 3, this.nextRand() * 3, 0);
      sh.mesh.scale.set(sh.baseScale * 0.72, sh.baseScale * 2.15, sh.baseScale * 0.55);
      sh.material.opacity = 1;
      sh.mesh.visible = true;
    }
  }

  private spawnBuildPop(
    position: Vec3Like,
    material: MaterialType,
    pieceType: BuildPieceType,
  ): void {
    if (this.disposed) return;

    const slot = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % BURST_POOL_SIZE;

    const matColor = MATERIAL_STATS[material].color;
    const popScale = pieceType === 'wall' ? 1.55 : 1.75;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.42;
    slot.gravity = 3.5;
    slot.drag = 3.2;
    slot.useRing = true;
    slot.ringStartScale = 0.35;
    slot.ringEndScale = popScale;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.ringMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.ringMesh.scale.setScalar(slot.ringStartScale);
    slot.ringMaterial.color.set(matColor);
    slot.ringMaterial.opacity = 0.85;
    slot.ringMesh.visible = true;

    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const p = slot.particles[i];
      const ang = (i / BURST_PARTICLE_COUNT) * Math.PI * 2;
      const spd = 2.6 + this.nextRand() * 2.2;
      p.vx = Math.cos(ang) * spd;
      p.vy = 1.4 + this.nextRand() * 2.2;
      p.vz = Math.sin(ang) * spd;
      p.rx = 6;
      p.ry = 8;
      p.baseScale = 0.10;
      p.mesh.position.set(0, 0, 0);
      p.mesh.scale.setScalar(p.baseScale);
      p.material.color.set(i % 2 === 0 ? matColor : '#e0f2fe');
      p.material.opacity = 0.95;
      p.mesh.visible = true;
    }
  }

  private spawnChestOpen(position: Vec3Like): void {
    if (this.disposed) return;

    const slot = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % BURST_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.78;
    slot.gravity = -1.2;
    slot.drag = 1.8;
    slot.useRing = true;
    slot.ringStartScale = 0.25;
    slot.ringEndScale = 1.85;

    slot.group.position.set(position.x, position.y + 0.35, position.z);
    slot.group.visible = true;

    slot.ringMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.ringMesh.scale.setScalar(slot.ringStartScale);
    slot.ringMaterial.color.set('#fbbf24');
    slot.ringMaterial.opacity = 0.95;
    slot.ringMesh.visible = true;

    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const p = slot.particles[i];
      const ang = (i / BURST_PARTICLE_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      const spd = 1.1 + this.nextRand() * 1.9;
      p.vx = Math.cos(ang) * spd;
      p.vy = 2.4 + this.nextRand() * 2.4;
      p.vz = Math.sin(ang) * spd;
      p.rx = 7;
      p.ry = 9;
      p.baseScale = 0.11;
      p.mesh.position.set(0, 0, 0);
      p.mesh.scale.setScalar(p.baseScale);
      p.material.color.set(i % 3 === 0 ? '#ffffff' : i % 2 === 0 ? '#fde047' : '#fbbf24');
      p.material.opacity = 1;
      p.mesh.visible = true;
    }
  }

  private spawnExplosion(position: Vec3Like, radius: number): void {
    if (this.disposed) return;

    const slot = this.explosions[this.explosionCursor];
    this.explosionCursor = (this.explosionCursor + 1) % EXPLOSION_POOL_SIZE;

    const safeRadius = Math.max(1.5, Number.isFinite(radius) ? radius : 5);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.68;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.coreMesh.scale.setScalar(0.2 * safeRadius);
    slot.coreMat.opacity = 1;
    slot.outerMesh.scale.setScalar(0.35 * safeRadius);
    slot.outerMat.opacity = 0.85;
    slot.smokeMesh.scale.setScalar(0.25 * safeRadius);
    slot.smokeMat.opacity = 0.55;
    slot.ringMesh.scale.setScalar(0.3 * safeRadius);
    slot.ringMat.opacity = 0.9;

    for (let i = 0; i < EXPLOSION_EMBER_COUNT; i++) {
      const e = slot.embers[i];
      const ang = (i / EXPLOSION_EMBER_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const hSpd = safeRadius * (1.2 + this.nextRand() * 1.4);
      e.vx = Math.cos(ang) * hSpd;
      e.vy = safeRadius * (0.9 + this.nextRand() * 1.4);
      e.vz = Math.sin(ang) * hSpd;
      e.baseScale = Math.max(0.14, safeRadius * 0.055);
      e.mesh.position.set(0, 0.1, 0);
      e.mesh.rotation.set(0, 0, 0);
      e.mesh.scale.setScalar(e.baseScale);
      e.material.opacity = 1;
    }
  }

  private spawnShockwave(position: Vec3Like, radius: number): void {
    if (this.disposed) return;

    const slot = this.shockwaves[this.shockwaveCursor];
    this.shockwaveCursor = (this.shockwaveCursor + 1) % SHOCKWAVE_POOL_SIZE;

    const safeRadius = Math.max(1.8, Number.isFinite(radius) ? radius : 6);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.58;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.08, position.z);
    slot.group.visible = true;

    slot.violetRingMesh.scale.setScalar(0.3 * safeRadius);
    slot.violetRingMat.opacity = 0.95;

    slot.cyanRingMesh.scale.setScalar(0.22 * safeRadius);
    slot.cyanRingMat.opacity = 0.92;

    slot.tiltRingMesh.rotation.set(Math.PI / 4, this.nextRand() * Math.PI, Math.PI / 6);
    slot.tiltRingMesh.scale.setScalar(0.25 * safeRadius);
    slot.tiltRingMat.opacity = 0.8;

    slot.domeMesh.scale.set(0.35 * safeRadius, 0.5 * safeRadius, 0.35 * safeRadius);
    slot.domeMat.opacity = 0.48;
  }

  private spawnSplashHeal(position: Vec3Like, radius: number): void {
    if (this.disposed) return;

    const slot = this.splashHeals[this.splashHealCursor];
    this.splashHealCursor = (this.splashHealCursor + 1) % SPLASH_HEAL_POOL_SIZE;

    const safeRadius = Math.max(1.5, Number.isFinite(radius) ? radius : 4.5);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.85;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.06, position.z);
    slot.group.visible = true;

    slot.domeMesh.scale.set(0.35 * safeRadius, 0.30 * safeRadius, 0.35 * safeRadius);
    slot.domeMat.opacity = 0.45;
    slot.ringMesh.scale.setScalar(0.32 * safeRadius);
    slot.ringMat.opacity = 0.9;

    for (let i = 0; i < SPLASH_SPARKLE_COUNT; i++) {
      const sp = slot.sparkles[i];
      sp.angle = (i / SPLASH_SPARKLE_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      sp.radius = safeRadius * (0.14 + this.nextRand() * 0.38);
      sp.speedY = 1.6 + this.nextRand() * 1.9;
      sp.spin = (this.nextRand() > 0.5 ? 1 : -1) * (3 + this.nextRand() * 4);
      sp.baseScale = 0.09 + this.nextRand() * 0.06;

      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.1 + this.nextRand() * 0.35,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 1;
      sp.mesh.visible = true;
    }
  }

  private spawnSlideDust(position: Vec3Like, biome: BiomeType): void {
    if (this.disposed) return;

    const slot = this.slideDusts[this.slideDustCursor];
    this.slideDustCursor = (this.slideDustCursor + 1) % SLIDE_DUST_POOL_SIZE;

    const [primary, secondary] = getBiomeDustColors(biome);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.42;

    slot.group.position.set(position.x, position.y + 0.08, position.z);
    slot.group.visible = true;

    for (let i = 0; i < SLIDE_DUST_PARTICLE_COUNT; i++) {
      const p = slot.puffs[i];
      const ang = (i / SLIDE_DUST_PARTICLE_COUNT) * Math.PI * 2 + this.nextRand() * 0.5;
      const spd = 0.9 + this.nextRand() * 1.6;
      p.vx = Math.cos(ang) * spd;
      p.vy = 0.85 + this.nextRand() * 1.15;
      p.vz = Math.sin(ang) * spd;
      p.rx = (this.nextRand() - 0.5) * 6;
      p.ry = (this.nextRand() - 0.5) * 6;
      p.baseScale = 0.14 + this.nextRand() * 0.10;
      p.mesh.position.set((this.nextRand() - 0.5) * 0.25, 0.02, (this.nextRand() - 0.5) * 0.25);
      p.mesh.scale.setScalar(p.baseScale);
      p.material.color.set(i % 2 === 0 ? primary : secondary);
      p.material.opacity = 0.82;
      p.mesh.visible = true;
    }
  }

  private spawnElimination(position: Vec3Like, skinColor?: string): void {
    if (this.disposed) return;

    const slot = this.eliminations[this.eliminationCursor];
    this.eliminationCursor = (this.eliminationCursor + 1) % ELIMINATION_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.65;
    slot.baseX = position.x;
    slot.baseY = position.y;
    slot.baseZ = position.z;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.droneGroup.position.set(0, 3.6, 0);
    slot.beamMesh.position.set(0, 1.25, 0);
    slot.beamMesh.scale.set(0.1, 2.5, 0.1);
    slot.beamMat.opacity = 0.45;

    for (let i = 0; i < ELIMINATION_VOXEL_COUNT; i++) {
      const v = slot.voxels[i];
      v.mesh.position.set(
        Math.cos(v.angle) * v.radius,
        0.1 + (i % 5) * 0.18,
        Math.sin(v.angle) * v.radius,
      );
      v.mesh.scale.setScalar(v.baseScale);
      v.material.opacity = 0.95;
      if (skinColor && i % 5 === 0) {
        v.material.color.set(skinColor);
      } else {
        v.material.color.set(i % 3 === 0 ? '#e0f2fe' : i % 2 === 0 ? '#38bdf8' : '#0284c7');
      }
      v.mesh.visible = true;
    }
  }

  private updateWeakpoint(
    propId: string,
    position: Vec3Like,
    normal: Vec3Like,
    active: boolean,
  ): void {
    if (this.disposed) return;

    let slot = this.weakpoints.find((w) => w.active && w.propId === propId);

    if (!active) {
      if (slot) {
        slot.active = false;
        slot.propId = '';
        slot.group.visible = false;
      }
      return;
    }

    if (!slot) {
      slot = this.weakpoints.find((w) => !w.active) ?? this.weakpoints[0];
    }

    slot.active = true;
    slot.propId = propId;
    slot.age = 0;

    this.tmpDir.set(normal.x, normal.y, normal.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 0, 1);
    } else {
      this.tmpDir.normalize();
    }

    slot.group.position.set(
      position.x + this.tmpDir.x * 0.035,
      position.y + this.tmpDir.y * 0.035,
      position.z + this.tmpDir.z * 0.035,
    );
    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.group.quaternion.copy(this.tmpQuat);
    slot.group.scale.setScalar(1);
    slot.group.visible = true;
  }

  public update(dt: number): void {
    if (this.disposed) return;
    const safeDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    if (safeDt <= 0) return;

    // 1. Tracers
    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
      const s = this.tracers[i];
      if (!s.active) continue;
      s.age += safeDt;
      const t = s.age / s.duration;
      if (t >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      const w = s.width * (1 - 0.65 * t);
      s.mesh.scale.set(w, s.length, w);
      s.material.opacity = 0.92 * (1 - t);
    }

    // 2. Muzzles
    for (let i = 0; i < MUZZLE_POOL_SIZE; i++) {
      const m = this.muzzles[i];
      if (!m.active) continue;
      m.age += safeDt;
      const t = m.age / m.duration;
      if (t >= 1) {
        m.active = false;
        m.group.visible = false;
        continue;
      }
      const sc = m.baseScale * (1 - 0.55 * t);
      m.group.scale.setScalar(sc);
      m.material.opacity = 0.95 * (1 - t);
    }

    // 3. Spinning Bullet Casings
    for (let i = 0; i < CASING_POOL_SIZE; i++) {
      const c = this.casings[i];
      if (!c.active) continue;
      c.age += safeDt;
      const t = c.age / c.duration;
      if (t >= 1) {
        c.active = false;
        c.mesh.visible = false;
        continue;
      }
      c.vy -= 14.5 * safeDt;
      c.mesh.position.x += c.vx * safeDt;
      c.mesh.position.y += c.vy * safeDt;
      c.mesh.position.z += c.vz * safeDt;
      c.mesh.rotation.x += c.rx * safeDt;
      c.mesh.rotation.y += c.ry * safeDt;
      c.mesh.rotation.z += c.rz * safeDt;
      c.material.opacity = t > 0.7 ? clamp((1 - t) / 0.3, 0, 1) : 1;
    }

    // 4. Bursts (impacts, build pops, chest open)
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      const b = this.bursts[i];
      if (!b.active) continue;
      b.age += safeDt;
      const t = b.age / b.duration;
      if (t >= 1) {
        b.active = false;
        b.group.visible = false;
        continue;
      }

      if (b.useRing) {
        const ringT = Math.min(1, t * 1.45);
        const rs = b.ringStartScale + (b.ringEndScale - b.ringStartScale) * (1 - (1 - ringT) * (1 - ringT));
        b.ringMesh.scale.setScalar(rs);
        b.ringMaterial.opacity = 0.9 * (1 - ringT);
      }

      const dampFactor = Math.exp(-b.drag * safeDt);
      for (let p = 0; p < BURST_PARTICLE_COUNT; p++) {
        const pt = b.particles[p];
        if (!pt.mesh.visible) continue;
        pt.vy -= b.gravity * safeDt;
        pt.vx *= dampFactor;
        pt.vz *= dampFactor;
        pt.mesh.position.x += pt.vx * safeDt;
        pt.mesh.position.y += pt.vy * safeDt;
        pt.mesh.position.z += pt.vz * safeDt;
        pt.mesh.rotation.x += pt.rx * safeDt;
        pt.mesh.rotation.y += pt.ry * safeDt;
        pt.mesh.scale.setScalar(pt.baseScale * (1 - 0.7 * t));
        pt.material.opacity = 1 - t;
      }
    }

    // 5. Shield-Break Crystalline Shards
    for (let i = 0; i < SHIELD_BREAK_POOL_SIZE; i++) {
      const sb = this.shieldBreaks[i];
      if (!sb.active) continue;
      sb.age += safeDt;
      const t = sb.age / sb.duration;
      if (t >= 1) {
        sb.active = false;
        sb.group.visible = false;
        continue;
      }

      const expand = 1 - (1 - Math.min(1, t * 1.8)) * (1 - Math.min(1, t * 1.8));
      const fade = 1 - t;
      sb.outerRingMesh.scale.setScalar(0.2 + 1.55 * expand);
      sb.outerRingMat.opacity = 0.95 * fade;
      sb.innerRingMesh.scale.setScalar(0.15 + 1.15 * expand);
      sb.innerRingMat.opacity = 0.85 * fade;
      sb.flashMesh.scale.setScalar(0.35 + 0.9 * expand);
      sb.flashMat.opacity = Math.max(0, 0.85 * (1 - t * 2.2));

      const dampFactor = Math.exp(-2.2 * safeDt);
      for (let s = 0; s < SHIELD_BREAK_SHARD_COUNT; s++) {
        const sh = sb.shards[s];
        sh.vy -= 6.5 * safeDt;
        sh.vx *= dampFactor;
        sh.vz *= dampFactor;
        sh.mesh.position.x += sh.vx * safeDt;
        sh.mesh.position.y += sh.vy * safeDt;
        sh.mesh.position.z += sh.vz * safeDt;
        sh.mesh.rotation.x += sh.rx * safeDt;
        sh.mesh.rotation.y += sh.ry * safeDt;
        sh.mesh.rotation.z += sh.rz * safeDt;
        const sc = sh.baseScale * (1 - 0.55 * t);
        sh.mesh.scale.set(sc * 0.72, sc * 2.15, sc * 0.55);
        sh.material.opacity = fade;
      }
    }

    // 6. Explosions
    for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
      const ex = this.explosions[i];
      if (!ex.active) continue;
      ex.age += safeDt;
      const t = ex.age / ex.duration;
      if (t >= 1) {
        ex.active = false;
        ex.group.visible = false;
        continue;
      }

      const expand = 1 - (1 - Math.min(1, t * 2.8)) * (1 - Math.min(1, t * 2.8));
      const fade = 1 - t;
      ex.coreMesh.scale.setScalar(ex.radius * 0.72 * expand);
      ex.coreMat.opacity = Math.max(0, 1 - t * 1.45);
      ex.outerMesh.scale.setScalar(ex.radius * 1.35 * expand);
      ex.outerMat.opacity = 0.8 * fade;
      ex.smokeMesh.position.y = ex.radius * 0.35 * t;
      ex.smokeMesh.scale.setScalar(ex.radius * (0.65 + 0.9 * t));
      ex.smokeMat.opacity = 0.52 * fade;
      ex.ringMesh.scale.setScalar(ex.radius * (0.4 + 1.55 * t));
      ex.ringMat.opacity = 0.85 * fade;

      for (let j = 0; j < EXPLOSION_EMBER_COUNT; j++) {
        const em = ex.embers[j];
        em.vy -= 12 * safeDt;
        em.mesh.position.x += em.vx * safeDt;
        em.mesh.position.y += em.vy * safeDt;
        em.mesh.position.z += em.vz * safeDt;
        em.mesh.rotation.x += 8 * safeDt;
        em.mesh.rotation.y += 6 * safeDt;
        em.mesh.scale.setScalar(em.baseScale * fade);
        em.material.opacity = fade;
      }
    }

    // 7. Shockwaves (expanding neon violet/cyan rings + vertical distortion dome)
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      sw.age += safeDt;
      const t = sw.age / sw.duration;
      if (t >= 1) {
        sw.active = false;
        sw.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      sw.violetRingMesh.scale.setScalar(sw.radius * (0.25 + 1.35 * easeOut));
      sw.violetRingMat.opacity = 0.95 * fade;

      sw.cyanRingMesh.scale.setScalar(sw.radius * (0.18 + 1.15 * easeOut));
      sw.cyanRingMat.opacity = 0.92 * fade;

      sw.tiltRingMesh.rotation.y += 4.5 * safeDt;
      sw.tiltRingMesh.scale.setScalar(sw.radius * (0.2 + 1.1 * easeOut));
      sw.tiltRingMat.opacity = 0.78 * fade;

      const xzScale = sw.radius * (0.35 + 1.05 * easeOut);
      const yScale = sw.radius * (0.55 + 1.45 * easeOut);
      sw.domeMesh.scale.set(xzScale, yScale, xzScale);
      sw.domeMat.opacity = 0.48 * fade * fade;
    }

    // 8. Splash Heals (turquoise mist dome + rising sparkles)
    for (let i = 0; i < SPLASH_HEAL_POOL_SIZE; i++) {
      const sh = this.splashHeals[i];
      if (!sh.active) continue;
      sh.age += safeDt;
      const t = sh.age / sh.duration;
      if (t >= 1) {
        sh.active = false;
        sh.group.visible = false;
        continue;
      }

      const expand = 1 - Math.pow(1 - Math.min(1, t * 1.6), 2);
      const fade = 1 - t;
      const domeXZ = sh.radius * (0.35 + 0.65 * expand);
      const domeY = sh.radius * (0.3 + 0.55 * expand);
      sh.domeMesh.scale.set(domeXZ, domeY, domeXZ);
      sh.domeMat.opacity = 0.45 * fade;

      sh.ringMesh.scale.setScalar(sh.radius * (0.3 + 0.9 * expand));
      sh.ringMat.opacity = 0.88 * fade;

      for (let s = 0; s < SPLASH_SPARKLE_COUNT; s++) {
        const sp = sh.sparkles[s];
        const ang = sp.angle + sh.age * sp.spin * 0.4;
        const rad = sp.radius * (1 + 0.25 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += sp.spin * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.55 * t));
        sp.material.opacity = fade;
      }
    }

    // 9. Biome-Colored Slide Dust
    for (let i = 0; i < SLIDE_DUST_POOL_SIZE; i++) {
      const sd = this.slideDusts[i];
      if (!sd.active) continue;
      sd.age += safeDt;
      const t = sd.age / sd.duration;
      if (t >= 1) {
        sd.active = false;
        sd.group.visible = false;
        continue;
      }

      const dampFactor = Math.exp(-3.4 * safeDt);
      const puffCurve = 1 + 0.6 * Math.sin(t * Math.PI);
      const fade = 1 - t;
      for (let p = 0; p < SLIDE_DUST_PARTICLE_COUNT; p++) {
        const pt = sd.puffs[p];
        pt.vy -= 2.2 * safeDt;
        pt.vx *= dampFactor;
        pt.vz *= dampFactor;
        pt.mesh.position.x += pt.vx * safeDt;
        pt.mesh.position.y += pt.vy * safeDt;
        pt.mesh.position.z += pt.vz * safeDt;
        pt.mesh.rotation.x += pt.rx * safeDt;
        pt.mesh.rotation.y += pt.ry * safeDt;
        pt.mesh.scale.setScalar(pt.baseScale * puffCurve * (1 - 0.4 * t));
        pt.material.opacity = 0.82 * fade;
      }
    }

    // 10. Elimination Drone Beam-Out
    for (let i = 0; i < ELIMINATION_POOL_SIZE; i++) {
      const el = this.eliminations[i];
      if (!el.active) continue;
      el.age += safeDt;
      const t = el.age / el.duration;
      if (t >= 1) {
        el.active = false;
        el.group.visible = false;
        continue;
      }

      let droneY = 2.45;
      let beamWidth = 1.0;
      let beamAlpha = 0.42;

      if (t < 0.15) {
        const k = t / 0.15;
        droneY = 3.6 - 1.15 * k;
        beamWidth = k;
      } else if (t > 0.78) {
        const k = (t - 0.78) / 0.22;
        droneY = 2.45 + k * k * 4.5;
        beamWidth = 1 - k;
        beamAlpha = 0.42 * (1 - k);
      } else {
        droneY = 2.45 + Math.sin(el.age * 6) * 0.08;
        beamWidth = 1 + Math.sin(el.age * 14) * 0.08;
      }

      el.droneGroup.position.y = droneY;
      el.droneGroup.rotation.y += 1.4 * safeDt;
      for (let r = 0; r < el.rotors.length; r++) {
        el.rotors[r].rotation.z += 28 * safeDt;
      }

      const beamHeight = Math.max(0.2, droneY);
      el.beamMesh.position.y = beamHeight * 0.5;
      el.beamMesh.scale.set(beamWidth, beamHeight, beamWidth);
      el.beamMat.opacity = beamAlpha;

      for (let v = 0; v < ELIMINATION_VOXEL_COUNT; v++) {
        const vx = el.voxels[v];
        const vAge = Math.max(0, el.age - vx.delay);
        const rise = vAge * vx.speedY;
        const spin = vx.angle + vAge * vx.spinSpeed;
        const lifeFrac = clamp(rise / 2.4, 0, 1);
        const rad = vx.radius * (1 - lifeFrac * 0.55);

        vx.mesh.position.set(Math.cos(spin) * rad, 0.1 + rise, Math.sin(spin) * rad);
        vx.mesh.rotation.x += 4 * safeDt;
        vx.mesh.rotation.y += 5 * safeDt;
        vx.mesh.scale.setScalar(vx.baseScale * (1 - lifeFrac * 0.75));
        vx.material.opacity = (1 - lifeFrac) * (1 - Math.max(0, (t - 0.75) * 4));
      }
    }

    // 11. Active Weakpoint Targets
    for (let i = 0; i < WEAKPOINT_POOL_SIZE; i++) {
      const wp = this.weakpoints[i];
      if (!wp.active) continue;
      wp.age += safeDt;
      wp.spinnerGroup.rotation.z += 4.2 * safeDt;
      const pulse = 1 + 0.14 * Math.sin(wp.age * 9.5);
      wp.group.scale.setScalar(pulse);
    }

    // 12. Grapple Lines (taut cyan/gold cable + impact hook fading over duration)
    for (let i = 0; i < GRAPPLE_LINE_POOL_SIZE; i++) {
      const gl = this.grappleLines[i];
      if (!gl.active) continue;
      gl.age += safeDt;
      const t = gl.age / gl.duration;
      if (t >= 1) {
        gl.active = false;
        gl.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      const wScale = 1 - 0.55 * t;
      gl.cableMesh.scale.set(0.065 * wScale, gl.length, 0.065 * wScale);
      gl.cableMat.opacity = 0.94 * fade;
      gl.goldWireMesh.scale.set(0.026 * wScale, gl.length, 0.026 * wScale);
      gl.goldWireMat.opacity = 0.95 * fade;
      gl.hookMat.opacity = fade;

      const ringGrow = 0.25 + 0.65 * Math.min(1, t * 2.2);
      gl.impactRingMesh.scale.setScalar(ringGrow);
      gl.impactRingMat.opacity = 0.92 * fade;
    }

    // 13. Shield Bubbles (translucent hexagonal blue energy dome pulsing over duration)
    for (let i = 0; i < SHIELD_BUBBLE_POOL_SIZE; i++) {
      const sb = this.shieldBubbles[i];
      if (!sb.active) continue;
      sb.age += safeDt;
      const t = sb.age / sb.duration;
      if (t >= 1) {
        sb.active = false;
        sb.id = '';
        sb.group.visible = false;
        continue;
      }

      const popIn = clamp(sb.age / 0.25, 0, 1);
      const popScale = 1 - Math.pow(1 - popIn, 3);
      const fadeOut = t > 0.85 ? clamp((1 - t) / 0.15, 0, 1) : 1;
      const pulse = 0.5 + 0.5 * Math.sin(sb.age * 4.5);
      const breathe = 1 + 0.018 * Math.sin(sb.age * 3.2);
      const domeRadius = sb.radius * popScale * breathe;

      sb.domeMesh.scale.setScalar(domeRadius);
      sb.domeMat.opacity = (0.18 + 0.08 * pulse) * fadeOut;

      sb.hexWireMesh.scale.setScalar(domeRadius * 1.006);
      sb.hexWireMesh.rotation.y += 0.22 * safeDt;
      sb.hexWireMat.opacity = (0.48 + 0.24 * pulse) * fadeOut;

      sb.ringMesh.scale.setScalar(sb.radius * popScale * (0.98 + 0.04 * pulse));
      sb.ringMat.opacity = (0.65 + 0.25 * pulse) * fadeOut;

      sb.coreMesh.rotation.y += 1.8 * safeDt;
      sb.coreMesh.scale.setScalar(0.32 * popScale * (0.9 + 0.16 * pulse));
      sb.coreMat.opacity = 0.9 * fadeOut;
    }

    // 14. Vehicle Boost Twin Exhaust Sparks
    for (let i = 0; i < VEHICLE_BOOST_POOL_SIZE; i++) {
      const vb = this.vehicleBoosts[i];
      if (!vb.active) continue;
      vb.age += safeDt;
      const t = vb.age / vb.duration;
      if (t >= 1) {
        vb.active = false;
        vb.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      const plumeScale = 1 - 0.5 * t;
      vb.leftPlume.scale.set(0.24 * plumeScale, 0.55 * (0.7 + 0.5 * fade), 0.24 * plumeScale);
      vb.rightPlume.scale.set(0.24 * plumeScale, 0.55 * (0.7 + 0.5 * fade), 0.24 * plumeScale);
      vb.plumeMat.opacity = 0.92 * fade;

      for (let s = 0; s < VEHICLE_BOOST_SPARK_COUNT; s++) {
        const sp = vb.sparks[s];
        sp.vy -= 2.4 * safeDt;
        sp.mesh.position.x += sp.vx * safeDt;
        sp.mesh.position.y += sp.vy * safeDt;
        sp.mesh.position.z += sp.vz * safeDt;
        sp.mesh.rotation.x += sp.rx * safeDt;
        sp.mesh.rotation.y += sp.ry * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.65 * t));
        sp.material.opacity = fade;
      }
    }

    // 15. Throw Trajectory Arc Preview Pulse
    if (this.throwArcGroup.visible) {
      this.throwArcAge += safeDt;
      const pulse = 1 + 0.08 * Math.sin(this.throwArcAge * 7);
      this.throwLandingRingGroup.scale.setScalar(pulse);
      this.throwLandingRingGroup.rotation.y += 1.6 * safeDt;
      this.throwArcDotMat.opacity = 0.72 + 0.22 * Math.sin(this.throwArcAge * 6);
    }

    // 16. Weapon Upgrade Holographic Rings + Rising Sparks
    for (let i = 0; i < WEAPON_UPGRADE_POOL_SIZE; i++) {
      const wu = this.weaponUpgrades[i];
      if (!wu.active) continue;
      wu.age += safeDt;
      const t = wu.age / wu.duration;
      if (t >= 1) {
        wu.active = false;
        wu.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      wu.outerRingMesh.scale.setScalar(0.35 + 1.45 * easeOut);
      wu.outerRingMat.opacity = 0.94 * fade;

      wu.innerRingMesh.position.y = 0.12 + 1.25 * easeOut;
      wu.innerRingMesh.rotation.z += 4.2 * safeDt;
      wu.innerRingMesh.scale.setScalar(0.25 + 0.95 * easeOut);
      wu.innerRingMat.opacity = 0.88 * fade;

      for (let s = 0; s < WEAPON_UPGRADE_SPARK_COUNT; s++) {
        const sp = wu.sparks[s];
        const ang = sp.angle + wu.age * sp.spin;
        const rad = sp.radius * (1 + 0.45 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 6 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.5 * t));
        sp.material.opacity = fade;
      }
    }

    // 17. Slurp Barrel Bursts (glowing cyan liquid dome + upward droplets)
    for (let i = 0; i < SLURP_BURST_POOL_SIZE; i++) {
      const sb = this.slurpBursts[i];
      if (!sb.active) continue;
      sb.age += safeDt;
      const t = sb.age / sb.duration;
      if (t >= 1) {
        sb.active = false;
        sb.group.visible = false;
        continue;
      }

      const expand = 1 - Math.pow(1 - Math.min(1, t * 1.7), 2);
      const fade = 1 - t;
      sb.domeMesh.scale.set(
        sb.radius * (0.35 + 0.65 * expand),
        sb.radius * (0.3 + 0.5 * expand),
        sb.radius * (0.35 + 0.65 * expand),
      );
      sb.domeMat.opacity = 0.48 * fade;

      sb.ringMesh.scale.setScalar(sb.radius * (0.32 + 0.85 * expand));
      sb.ringMat.opacity = 0.9 * fade;

      for (let d = 0; d < SLURP_BURST_DROPLET_COUNT; d++) {
        const dr = sb.droplets[d];
        dr.vy -= 6.8 * safeDt;
        dr.mesh.position.x += dr.vx * safeDt;
        dr.mesh.position.y = Math.max(0.02, dr.mesh.position.y + dr.vy * safeDt);
        dr.mesh.position.z += dr.vz * safeDt;
        dr.mesh.rotation.y += 5 * safeDt;
        dr.mesh.scale.setScalar(dr.baseScale * (1 - 0.45 * t));
        dr.material.opacity = fade;
      }
    }

    // 18. Campfire Healing Ember Motes
    for (let i = 0; i < CAMPFIRE_HEAL_POOL_SIZE; i++) {
      const ch = this.campfireHeals[i];
      if (!ch.active) continue;
      ch.age += safeDt;
      const t = ch.age / ch.duration;
      if (t >= 1) {
        ch.active = false;
        ch.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      ch.glowRingMesh.scale.setScalar(0.55 + 0.55 * t);
      ch.glowRingMat.opacity = 0.55 * fade;

      for (let m = 0; m < CAMPFIRE_HEAL_MOTE_COUNT; m++) {
        const mt = ch.motes[m];
        const ang = mt.angle + ch.age * mt.swaySpeed;
        const rad = mt.radius * (1 - 0.25 * t);
        mt.mesh.position.x = Math.cos(ang) * rad;
        mt.mesh.position.y += mt.speedY * safeDt;
        mt.mesh.position.z = Math.sin(ang) * rad;
        mt.mesh.rotation.x += 4 * safeDt;
        mt.mesh.rotation.y += 5 * safeDt;
        mt.mesh.scale.setScalar(mt.baseScale * (1 - 0.5 * t));
        mt.material.opacity = 0.95 * fade;
      }
    }

    // 19. Pooled Surface Bullet Impact Decals (fade smoothly over 12s)
    for (let i = 0; i < IMPACT_DECAL_POOL_SIZE; i++) {
      const d = this.impactDecals[i];
      if (!d.active) continue;
      d.age += safeDt;
      const t = d.age / d.duration;
      if (t >= 1) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      d.material.opacity = d.baseOpacity * (1 - Math.pow(t, 1.35));
    }

    // 20. Sky Rift Tears (ground + sky cyan-violet jagged cracks & expanding portal rings)
    for (let i = 0; i < RIFT_TEAR_POOL_SIZE; i++) {
      const rt = this.riftTears[i];
      if (!rt.active) continue;
      rt.age += safeDt;
      const t = rt.age / rt.duration;
      if (t >= 1) {
        rt.active = false;
        rt.group.visible = false;
        continue;
      }
      this.updateRiftEndpoint(rt.ground, t, rt.age, safeDt);
      this.updateRiftEndpoint(rt.sky, t, rt.age, safeDt);
    }

    // 21. Flag Captured (tall golden beacon column + rising fireworks sparks)
    for (let i = 0; i < FLAG_CAPTURE_POOL_SIZE; i++) {
      const fc = this.flagCaptures[i];
      if (!fc.active) continue;
      fc.age += safeDt;
      const t = fc.age / fc.duration;
      if (t >= 1) {
        fc.active = false;
        fc.group.visible = false;
        continue;
      }

      const pop = clamp(fc.age / 0.16, 0, 1);
      const fade = 1 - t;
      const pulse = 1 + 0.12 * Math.sin(fc.age * 10);
      const colW = (1 - 0.55 * t) * pulse;
      const colH = 16 * pop;

      fc.beaconMesh.position.y = colH * 0.5;
      fc.beaconMesh.scale.set(0.95 * colW, Math.max(0.1, colH), 0.95 * colW);
      fc.beaconMat.opacity = 0.44 * fade;

      fc.coreBeamMesh.position.y = colH * 0.55;
      fc.coreBeamMesh.scale.set(0.32 * colW, Math.max(0.1, colH * 1.1), 0.32 * colW);
      fc.coreBeamMat.opacity = 0.72 * fade;

      const ringEase = 1 - Math.pow(1 - Math.min(1, t * 1.6), 2);
      fc.ringMesh.scale.setScalar(0.5 + 4.5 * ringEase);
      fc.ringMat.opacity = 0.92 * fade;

      for (let s = 0; s < FLAG_CAPTURE_SPARK_COUNT; s++) {
        const sp = fc.sparks[s];
        sp.vy -= 5.2 * safeDt;
        sp.mesh.position.x += sp.vx * safeDt;
        sp.mesh.position.y += sp.vy * safeDt;
        sp.mesh.position.z += sp.vz * safeDt;
        sp.mesh.rotation.y += 6.5 * safeDt;
        const twinkle = 0.72 + 0.28 * Math.sin(fc.age * 18 + sp.phase);
        sp.mesh.scale.setScalar(sp.baseScale * twinkle * (1 - 0.45 * t));
        sp.material.opacity = fade;
      }
    }

    // 22. Augment Activate (ascending holographic hex/ring aura)
    for (let i = 0; i < AUGMENT_VFX_POOL_SIZE; i++) {
      const av = this.augmentVfx[i];
      if (!av.active) continue;
      av.age += safeDt;
      const t = av.age / av.duration;
      if (t >= 1) {
        av.active = false;
        av.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      av.lowerHexMesh.position.y = 0.08 + 1.3 * easeOut;
      av.lowerHexMesh.rotation.z += 3.6 * safeDt;
      av.lowerHexMesh.scale.setScalar(0.6 + 1.15 * easeOut);
      av.lowerHexMat.opacity = 0.92 * fade;

      av.upperHexMesh.position.y = 0.35 + 2.15 * easeOut;
      av.upperHexMesh.rotation.z -= 2.8 * safeDt;
      av.upperHexMesh.scale.setScalar(0.45 + 0.95 * easeOut);
      av.upperHexMat.opacity = 0.86 * fade;

      av.shellMesh.position.y = 0.8 + 0.9 * t;
      av.shellMesh.rotation.y += 2.2 * safeDt;
      av.shellMesh.scale.set(0.85 + 0.45 * easeOut, 1.4 + 0.8 * t, 0.85 + 0.45 * easeOut);
      av.shellMat.opacity = 0.36 * fade;

      for (let m = 0; m < AUGMENT_VFX_MOTE_COUNT; m++) {
        const mt = av.motes[m];
        const ang = mt.angle + av.age * mt.spin;
        const rad = mt.radius * (1 + 0.25 * t);
        mt.mesh.position.x = Math.cos(ang) * rad;
        mt.mesh.position.y += mt.speedY * safeDt;
        mt.mesh.position.z = Math.sin(ang) * rad;
        mt.mesh.rotation.y += 5.5 * safeDt;
        mt.mesh.scale.setScalar(mt.baseScale * (1 - 0.45 * t));
        mt.material.opacity = fade;
      }
    }

    // 23. Tactical World Ping (pulsing diamond ring + slender color-coded beacon up to 16s)
    if (this.tacticalPing.active) {
      const ping = this.tacticalPing;
      ping.age += safeDt;
      const t = ping.age / ping.duration;
      if (t >= 1) {
        ping.active = false;
        ping.group.visible = false;
      } else {
        const fadeOut = t > 0.9 ? clamp((1 - t) / 0.1, 0, 1) : 1;
        const pulse = 0.5 + 0.5 * Math.sin(ping.age * 5.0);
        const ringCycle = (ping.age * 1.1) % 1;

        ping.outerDiamondMesh.rotation.z += 0.9 * safeDt;
        ping.outerDiamondMesh.scale.setScalar(0.95 + 0.18 * pulse);
        ping.outerDiamondMat.opacity = (0.78 + 0.2 * pulse) * fadeOut;

        ping.rippleDiamondMesh.scale.setScalar(0.45 + 1.25 * ringCycle);
        ping.rippleDiamondMat.opacity = 0.92 * (1 - ringCycle) * fadeOut;

        ping.markerMesh.position.y = 1.65 + Math.sin(ping.age * 3.8) * 0.18;
        ping.markerMesh.rotation.y += 2.6 * safeDt;
        ping.markerMat.opacity = 0.95 * fadeOut;

        const beamW = 0.14 + 0.04 * pulse;
        ping.beamMesh.scale.set(beamW, 22, beamW);
        ping.beamMat.opacity = (0.26 + 0.14 * pulse) * fadeOut;
        ping.coreBeamMat.opacity = 0.55 * fadeOut;
      }
    }
  }

  private spawnGrappleLine(from: Vec3Like, to: Vec3Like, duration = 0.35): void {
    if (this.disposed || !isFiniteVec3(from) || !isFiniteVec3(to)) return;

    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const len = this.tmpDir.length();
    if (len < 1e-4) return;

    const slot = this.grappleLines[this.grappleLineCursor];
    this.grappleLineCursor = (this.grappleLineCursor + 1) % GRAPPLE_LINE_POOL_SIZE;

    const safeDuration = Math.max(0.08, Number.isFinite(duration) ? duration : 0.35);
    this.tmpDir.divideScalar(len);
    this.tmpQuat.setFromUnitVectors(this.upAxis, this.tmpDir);

    slot.active = true;
    slot.age = 0;
    slot.duration = safeDuration;
    slot.length = len;
    slot.group.visible = true;

    slot.cableMesh.position.addVectors(this.tmpA, this.tmpB).multiplyScalar(0.5);
    slot.cableMesh.quaternion.copy(this.tmpQuat);
    slot.cableMesh.scale.set(0.065, len, 0.065);
    slot.cableMat.opacity = 0.94;

    slot.goldWireMesh.position.copy(slot.cableMesh.position);
    slot.goldWireMesh.quaternion.copy(this.tmpQuat);
    slot.goldWireMesh.scale.set(0.026, len, 0.026);
    slot.goldWireMat.opacity = 0.95;

    slot.hookGroup.position.copy(this.tmpB);
    slot.hookGroup.quaternion.copy(this.tmpQuat);
    slot.hookMat.opacity = 0.98;

    slot.impactRingMesh.position.copy(this.tmpB);
    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.impactRingMesh.quaternion.copy(this.tmpQuat);
    slot.impactRingMesh.scale.setScalar(0.25);
    slot.impactRingMat.opacity = 0.92;
  }

  private spawnShieldBubble(id: string, position: Vec3Like, radius: number, duration: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    let slot = id ? this.shieldBubbles.find((s) => s.active && s.id === id) : undefined;
    if (!slot) {
      slot =
        this.shieldBubbles.find((s) => !s.active) ??
        this.shieldBubbles[this.shieldBubbleCursor];
      this.shieldBubbleCursor = (this.shieldBubbleCursor + 1) % SHIELD_BUBBLE_POOL_SIZE;
    }

    const safeRadius = Math.max(0.5, Number.isFinite(radius) ? radius : 5.2);
    const safeDuration = Math.max(0.2, Number.isFinite(duration) ? duration : 18);

    slot.active = true;
    slot.id = id;
    slot.age = 0;
    slot.duration = safeDuration;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.domeMesh.scale.setScalar(safeRadius * 0.35);
    slot.domeMat.opacity = 0.22;
    slot.hexWireMesh.scale.setScalar(safeRadius * 0.352);
    slot.hexWireMat.opacity = 0.62;
    slot.ringMesh.scale.setScalar(safeRadius * 0.35);
    slot.ringMat.opacity = 0.85;
    slot.coreMesh.scale.setScalar(0.25);
    slot.coreMat.opacity = 0.9;
  }

  private spawnVehicleBoost(position: Vec3Like, direction: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.vehicleBoosts[this.vehicleBoostCursor];
    this.vehicleBoostCursor = (this.vehicleBoostCursor + 1) % VEHICLE_BOOST_POOL_SIZE;

    const safeDir: Vec3Like = isFiniteVec3(direction) ? direction : { x: 0, y: 0, z: 1 };

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.28;

    slot.group.position.set(position.x, position.y, position.z);
    this.orientToDirection(slot.group, safeDir, this.zAxis);
    slot.group.visible = true;

    slot.leftPlume.scale.set(0.24, 0.55, 0.24);
    slot.rightPlume.scale.set(0.24, 0.55, 0.24);
    slot.plumeMat.opacity = 0.92;

    for (let s = 0; s < VEHICLE_BOOST_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      const r = this.nextRand();
      const sideX = s % 2 === 0 ? -0.35 : 0.35;
      sp.baseScale = 0.08 + r * 0.07;
      sp.mesh.position.set(sideX + (r - 0.5) * 0.08, (r - 0.5) * 0.08, 0.15);
      sp.mesh.rotation.set(r * Math.PI, r * Math.PI, 0);
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 1;
      sp.mesh.visible = true;
      sp.vx = (this.nextRand() - 0.5) * 1.6;
      sp.vy = 0.35 + this.nextRand() * 1.4;
      sp.vz = 4.2 + this.nextRand() * 4.4;
      sp.rx = (this.nextRand() - 0.5) * 16;
      sp.ry = (this.nextRand() - 0.5) * 16;
    }
  }

  private spawnWeaponUpgrade(position: Vec3Like, rarity: Rarity): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.weaponUpgrades[this.weaponUpgradeCursor];
    this.weaponUpgradeCursor = (this.weaponUpgradeCursor + 1) % WEAPON_UPGRADE_POOL_SIZE;

    const hexColor = RARITY_COLORS[rarity] ?? RARITY_COLORS.rare;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.92;

    slot.group.position.set(position.x, position.y + 0.08, position.z);
    slot.group.visible = true;

    slot.outerRingMat.color.set(hexColor);
    slot.outerRingMat.opacity = 0.94;
    slot.outerRingMesh.scale.setScalar(0.35);

    slot.innerRingMat.color.set(hexColor);
    slot.innerRingMat.opacity = 0.9;
    slot.innerRingMesh.position.set(0, 0.12, 0);
    slot.innerRingMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.innerRingMesh.scale.setScalar(0.25);

    for (let s = 0; s < WEAPON_UPGRADE_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / WEAPON_UPGRADE_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      sp.radius = 0.25 + this.nextRand() * 0.45;
      sp.speedY = 1.4 + this.nextRand() * 1.8;
      sp.spin = (this.nextRand() > 0.5 ? 1 : -1) * (3 + this.nextRand() * 3);
      sp.baseScale = 0.075 + this.nextRand() * 0.05;

      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.06 + this.nextRand() * 0.25,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.color.set(s % 4 === 0 ? '#ffffff' : hexColor);
      sp.material.opacity = 1;
      sp.mesh.visible = true;
    }
  }

  private spawnSlurpBurst(position: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.slurpBursts[this.slurpBurstCursor];
    this.slurpBurstCursor = (this.slurpBurstCursor + 1) % SLURP_BURST_POOL_SIZE;

    const safeRadius = Math.max(1.2, Number.isFinite(radius) ? radius : 4.0);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.85;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.06, position.z);
    slot.group.visible = true;

    slot.domeMesh.scale.set(safeRadius * 0.35, safeRadius * 0.3, safeRadius * 0.35);
    slot.domeMat.opacity = 0.48;
    slot.ringMesh.scale.setScalar(safeRadius * 0.32);
    slot.ringMat.opacity = 0.9;

    for (let d = 0; d < SLURP_BURST_DROPLET_COUNT; d++) {
      const dr = slot.droplets[d];
      const ang = (d / SLURP_BURST_DROPLET_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const horiz = (0.7 + this.nextRand() * 1.5) * Math.min(2.2, safeRadius * 0.55);
      dr.vx = Math.cos(ang) * horiz;
      dr.vy = 2.6 + this.nextRand() * 2.5;
      dr.vz = Math.sin(ang) * horiz;
      dr.baseScale = 0.085 + this.nextRand() * 0.065;
      dr.mesh.position.set(Math.cos(ang) * 0.22, 0.2 + this.nextRand() * 0.25, Math.sin(ang) * 0.22);
      dr.mesh.scale.setScalar(dr.baseScale);
      dr.material.opacity = 1;
      dr.mesh.visible = true;
    }
  }

  private spawnCampfireHeal(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.campfireHeals[this.campfireHealCursor];
    this.campfireHealCursor = (this.campfireHealCursor + 1) % CAMPFIRE_HEAL_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.15;

    slot.group.position.set(position.x, position.y + 0.08, position.z);
    slot.group.visible = true;

    slot.glowRingMesh.scale.setScalar(0.55);
    slot.glowRingMat.opacity = 0.55;

    for (let m = 0; m < CAMPFIRE_HEAL_MOTE_COUNT; m++) {
      const mt = slot.motes[m];
      mt.angle = (m / CAMPFIRE_HEAL_MOTE_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      mt.radius = 0.25 + this.nextRand() * 0.75;
      mt.speedY = 1.1 + this.nextRand() * 1.25;
      mt.swaySpeed = (this.nextRand() > 0.5 ? 1 : -1) * (1.8 + this.nextRand() * 2.2);
      mt.baseScale = 0.065 + this.nextRand() * 0.045;

      mt.mesh.position.set(
        Math.cos(mt.angle) * mt.radius,
        0.1 + this.nextRand() * 0.35,
        Math.sin(mt.angle) * mt.radius,
      );
      mt.mesh.scale.setScalar(mt.baseScale);
      mt.material.opacity = 0.95;
      mt.mesh.visible = true;
    }
  }

  private spawnImpactDecal(
    position: Vec3Like,
    normal: Vec3Like,
    material: 'wood' | 'brick' | 'metal' | 'dirt',
  ): void {
    const slot = this.impactDecals[this.impactDecalCursor];
    this.impactDecalCursor = (this.impactDecalCursor + 1) % IMPACT_DECAL_POOL_SIZE;

    this.tmpDir.set(normal.x, normal.y, normal.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 1, 0);
    } else {
      this.tmpDir.normalize();
    }

    let tint = '#5c3317';
    let scale = 0.21 + this.nextRand() * 0.06;
    switch (material) {
      case 'wood':
        tint = '#5c3317';
        scale = 0.20 + this.nextRand() * 0.06;
        break;
      case 'brick':
        tint = '#475569';
        scale = 0.23 + this.nextRand() * 0.07;
        break;
      case 'metal':
        tint = '#1e293b';
        scale = 0.16 + this.nextRand() * 0.05;
        break;
      case 'dirt':
        tint = '#3f2e18';
        scale = 0.24 + this.nextRand() * 0.07;
        break;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = IMPACT_DECAL_DURATION;
    slot.baseOpacity = 0.86;

    slot.mesh.position.set(
      position.x + this.tmpDir.x * 0.014,
      position.y + this.tmpDir.y * 0.014,
      position.z + this.tmpDir.z * 0.014,
    );
    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.mesh.quaternion.copy(this.tmpQuat);
    slot.mesh.rotateZ(this.nextRand() * Math.PI * 2);
    slot.mesh.scale.setScalar(scale);

    slot.material.color.set(tint);
    slot.material.opacity = slot.baseOpacity;
    slot.mesh.visible = true;
  }

  private spawnRiftTear(position: Vec3Like, skyPosition?: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.riftTears[this.riftTearCursor];
    this.riftTearCursor = (this.riftTearCursor + 1) % RIFT_TEAR_POOL_SIZE;

    const safeSky: Vec3Like = isFiniteVec3(skyPosition)
      ? skyPosition
      : { x: position.x, y: position.y + 92, z: position.z };

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.35;
    slot.group.visible = true;

    slot.ground.group.position.set(position.x, position.y + 0.15, position.z);
    slot.sky.group.position.set(safeSky.x, safeSky.y, safeSky.z);
    this.updateRiftEndpoint(slot.ground, 0, 0, 0);
    this.updateRiftEndpoint(slot.sky, 0, 0, 0);
  }

  private spawnFlagCapture(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.flagCaptures[this.flagCaptureCursor];
    this.flagCaptureCursor = (this.flagCaptureCursor + 1) % FLAG_CAPTURE_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 2.1;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.beaconMesh.position.y = 1.5;
    slot.beaconMesh.scale.set(0.95, 3, 0.95);
    slot.beaconMat.opacity = 0.44;

    slot.coreBeamMesh.position.y = 1.8;
    slot.coreBeamMesh.scale.set(0.32, 3.6, 0.32);
    slot.coreBeamMat.opacity = 0.72;

    slot.ringMesh.scale.setScalar(0.5);
    slot.ringMat.opacity = 0.92;

    for (let s = 0; s < FLAG_CAPTURE_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      const ang = (s / FLAG_CAPTURE_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      const horiz = 1.8 + this.nextRand() * 3.4;
      sp.vx = Math.cos(ang) * horiz;
      sp.vy = 6.2 + this.nextRand() * 5.8;
      sp.vz = Math.sin(ang) * horiz;
      sp.baseScale = 0.12 + this.nextRand() * 0.08;
      sp.phase = s * 0.7;
      sp.mesh.position.set(Math.cos(ang) * 0.35, 0.4 + this.nextRand() * 0.6, Math.sin(ang) * 0.35);
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 1;
      sp.mesh.visible = true;
    }
  }

  private spawnAugmentVfx(position: Vec3Like, color: string): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.augmentVfx[this.augmentVfxCursor];
    this.augmentVfxCursor = (this.augmentVfxCursor + 1) % AUGMENT_VFX_POOL_SIZE;

    const safeColor =
      typeof color === 'string' && color.trim().length > 0 ? color.trim() : '#38bdf8';

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.15;

    slot.group.position.set(position.x, position.y + 0.05, position.z);
    slot.group.visible = true;

    slot.lowerHexMat.color.set(safeColor);
    slot.lowerHexMat.opacity = 0.92;
    slot.lowerHexMesh.position.y = 0.08;
    slot.lowerHexMesh.scale.setScalar(0.6);

    slot.upperHexMat.color.set(safeColor);
    slot.upperHexMat.opacity = 0.86;
    slot.upperHexMesh.position.y = 0.35;
    slot.upperHexMesh.scale.setScalar(0.45);

    slot.shellMat.color.set(safeColor);
    slot.shellMat.opacity = 0.36;
    slot.shellMesh.position.y = 0.8;
    slot.shellMesh.scale.set(0.85, 1.4, 0.85);

    for (let m = 0; m < AUGMENT_VFX_MOTE_COUNT; m++) {
      const mt = slot.motes[m];
      mt.angle = (m / AUGMENT_VFX_MOTE_COUNT) * Math.PI * 2 + this.nextRand() * 0.25;
      mt.radius = 0.55 + this.nextRand() * 0.35;
      mt.speedY = 1.6 + this.nextRand() * 1.4;
      mt.spin = (m % 2 === 0 ? 1 : -1) * (3.2 + this.nextRand() * 2.2);
      mt.baseScale = 0.08 + this.nextRand() * 0.045;
      mt.mesh.position.set(
        Math.cos(mt.angle) * mt.radius,
        0.1 + this.nextRand() * 0.3,
        Math.sin(mt.angle) * mt.radius,
      );
      mt.mesh.scale.setScalar(mt.baseScale);
      mt.material.color.set(m % 4 === 0 ? '#ffffff' : safeColor);
      mt.material.opacity = 1;
      mt.mesh.visible = true;
    }
  }

  private spawnTacticalPing(position: Vec3Like, kind: 'move' | 'danger' | 'loot'): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const ping = this.tacticalPing;
    const pingColor = getTacticalPingColor(kind);

    ping.active = true;
    ping.age = 0;
    ping.duration = TACTICAL_PING_DURATION;
    ping.kind = kind;

    ping.group.position.set(position.x, position.y, position.z);
    ping.group.visible = true;

    ping.outerDiamondMat.color.set(pingColor);
    ping.outerDiamondMat.opacity = 0.95;
    ping.outerDiamondMesh.scale.setScalar(1.0);

    ping.rippleDiamondMat.color.set(pingColor);
    ping.rippleDiamondMat.opacity = 0.92;
    ping.rippleDiamondMesh.scale.setScalar(0.45);

    ping.markerMat.color.set(pingColor);
    ping.markerMat.opacity = 0.95;
    ping.markerMesh.position.y = 1.65;

    ping.beamMat.color.set(pingColor);
    ping.beamMat.opacity = 0.32;
    ping.beamMesh.scale.set(0.16, 22, 0.16);
    ping.coreBeamMat.opacity = 0.55;
  }

  /**
   * Updates the throwable parabolic trajectory preview line + landing ring.
   * Pass `null` (or < 2 points) to hide the preview cleanly.
   */
  public updateThrowArc(points: Vec3Like[] | null): void {
    if (this.disposed) return;

    if (!points || points.length < 2) {
      this.throwArcGroup.visible = false;
      this.throwArcPointCount = 0;
      return;
    }

    let count = 0;
    const maxPts = Math.min(points.length, THROW_ARC_MAX_POINTS);
    for (let i = 0; i < maxPts; i++) {
      const pt = points[i];
      if (!isFiniteVec3(pt)) continue;
      this.scratchArcPoints[count].set(pt.x, pt.y, pt.z);
      count++;
    }

    if (count < 2) {
      this.throwArcGroup.visible = false;
      this.throwArcPointCount = 0;
      return;
    }

    let totalLen = 0;
    for (let i = 1; i < count; i++) {
      totalLen += this.scratchArcPoints[i - 1].distanceTo(this.scratchArcPoints[i]);
    }
    if (totalLen < 1e-4) {
      this.throwArcGroup.visible = false;
      this.throwArcPointCount = 0;
      return;
    }

    for (let i = 0; i < count; i++) {
      const pt = this.scratchArcPoints[i];
      const base = i * 3;
      this.throwArcPositions[base] = pt.x;
      this.throwArcPositions[base + 1] = pt.y;
      this.throwArcPositions[base + 2] = pt.z;
    }
    const lastPt = this.scratchArcPoints[count - 1];
    for (let i = count; i < THROW_ARC_MAX_POINTS; i++) {
      const base = i * 3;
      this.throwArcPositions[base] = lastPt.x;
      this.throwArcPositions[base + 1] = lastPt.y;
      this.throwArcPositions[base + 2] = lastPt.z;
    }

    this.throwArcPosAttr.needsUpdate = true;
    this.throwArcLineGeo.setDrawRange(0, count);
    this.throwArcLineGeo.computeBoundingSphere();
    this.throwArcLine.computeLineDistances();

    // Place evenly spaced glowing 3D dash capsules along the trajectory
    const dashInterval = Math.max(0.55, totalLen / THROW_ARC_DOT_COUNT);
    let dotIdx = 0;
    let nextDashDist = dashInterval * 0.5;
    let accumDist = 0;

    for (let i = 1; i < count && dotIdx < THROW_ARC_DOT_COUNT; i++) {
      const a = this.scratchArcPoints[i - 1];
      const b = this.scratchArcPoints[i];
      this.tmpDir.subVectors(b, a);
      const segLen = this.tmpDir.length();
      if (segLen < 1e-5) continue;
      this.tmpDir.divideScalar(segLen);
      this.tmpQuat.setFromUnitVectors(this.upAxis, this.tmpDir);

      while (nextDashDist <= accumDist + segLen && dotIdx < THROW_ARC_DOT_COUNT) {
        const alpha = (nextDashDist - accumDist) / segLen;
        const dot = this.throwArcDots[dotIdx++];
        dot.position.lerpVectors(a, b, alpha);
        dot.quaternion.copy(this.tmpQuat);
        dot.scale.set(0.042, 0.24, 0.042);
        dot.visible = true;
        nextDashDist += dashInterval;
      }
      accumDist += segLen;
    }

    for (let i = dotIdx; i < THROW_ARC_DOT_COUNT; i++) {
      this.throwArcDots[i].visible = false;
    }

    this.throwLandingRingGroup.position.set(lastPt.x, lastPt.y + 0.04, lastPt.z);
    this.throwArcGroup.visible = true;
    this.throwArcPointCount = count;
  }

  public isThrowArcVisible(): boolean {
    return this.throwArcGroup.visible;
  }

  public getThrowArcPointCount(): number {
    return this.throwArcPointCount;
  }

  public getActiveEffectCount(): number {
    let count = 0;
    for (const s of this.tracers) if (s.active) count++;
    for (const s of this.muzzles) if (s.active) count++;
    for (const s of this.casings) if (s.active) count++;
    for (const s of this.bursts) if (s.active) count++;
    for (const s of this.shieldBreaks) if (s.active) count++;
    for (const s of this.explosions) if (s.active) count++;
    for (const s of this.shockwaves) if (s.active) count++;
    for (const s of this.splashHeals) if (s.active) count++;
    for (const s of this.slideDusts) if (s.active) count++;
    for (const s of this.eliminations) if (s.active) count++;
    for (const s of this.grappleLines) if (s.active) count++;
    for (const s of this.shieldBubbles) if (s.active) count++;
    for (const s of this.vehicleBoosts) if (s.active) count++;
    for (const s of this.weaponUpgrades) if (s.active) count++;
    for (const s of this.slurpBursts) if (s.active) count++;
    for (const s of this.campfireHeals) if (s.active) count++;
    for (const s of this.riftTears) if (s.active) count++;
    for (const s of this.flagCaptures) if (s.active) count++;
    for (const s of this.augmentVfx) if (s.active) count++;
    if (this.tacticalPing.active) count++;
    return count;
  }

  public getActiveWeakpointCount(): number {
    let count = 0;
    for (const w of this.weakpoints) if (w.active) count++;
    return count;
  }

  public getActiveCasingCount(): number {
    let count = 0;
    for (const c of this.casings) if (c.active) count++;
    return count;
  }

  public getActiveShockwaveCount(): number {
    let count = 0;
    for (const sw of this.shockwaves) if (sw.active) count++;
    return count;
  }

  public getActiveSplashHealCount(): number {
    let count = 0;
    for (const sh of this.splashHeals) if (sh.active) count++;
    return count;
  }

  public getActiveSlideDustCount(): number {
    let count = 0;
    for (const sd of this.slideDusts) if (sd.active) count++;
    return count;
  }

  public getActiveShieldBreakCount(): number {
    let count = 0;
    for (const sb of this.shieldBreaks) if (sb.active) count++;
    return count;
  }

  public getActiveGrappleLineCount(): number {
    let count = 0;
    for (const gl of this.grappleLines) if (gl.active) count++;
    return count;
  }

  public getActiveShieldBubbleCount(): number {
    let count = 0;
    for (const sb of this.shieldBubbles) if (sb.active) count++;
    return count;
  }

  public getActiveVehicleBoostCount(): number {
    let count = 0;
    for (const vb of this.vehicleBoosts) if (vb.active) count++;
    return count;
  }

  public getActiveWeaponUpgradeCount(): number {
    let count = 0;
    for (const wu of this.weaponUpgrades) if (wu.active) count++;
    return count;
  }

  public getActiveSlurpBurstCount(): number {
    let count = 0;
    for (const sb of this.slurpBursts) if (sb.active) count++;
    return count;
  }

  public getActiveCampfireHealCount(): number {
    let count = 0;
    for (const ch of this.campfireHeals) if (ch.active) count++;
    return count;
  }

  public getActiveImpactDecalCount(): number {
    let count = 0;
    for (const d of this.impactDecals) if (d.active) count++;
    return count;
  }

  public getActiveRiftTearCount(): number {
    let count = 0;
    for (const rt of this.riftTears) if (rt.active) count++;
    return count;
  }

  public getActiveFlagCaptureCount(): number {
    let count = 0;
    for (const fc of this.flagCaptures) if (fc.active) count++;
    return count;
  }

  public getActiveAugmentVfxCount(): number {
    let count = 0;
    for (const av of this.augmentVfx) if (av.active) count++;
    return count;
  }

  public hasActiveTacticalPing(): boolean {
    return this.tacticalPing.active;
  }

  public clear(): void {
    for (const s of this.tracers) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const m of this.muzzles) {
      m.active = false;
      m.group.visible = false;
    }
    for (const c of this.casings) {
      c.active = false;
      c.mesh.visible = false;
    }
    for (const b of this.bursts) {
      b.active = false;
      b.group.visible = false;
    }
    for (const sb of this.shieldBreaks) {
      sb.active = false;
      sb.group.visible = false;
    }
    for (const e of this.explosions) {
      e.active = false;
      e.group.visible = false;
    }
    for (const sw of this.shockwaves) {
      sw.active = false;
      sw.group.visible = false;
    }
    for (const sh of this.splashHeals) {
      sh.active = false;
      sh.group.visible = false;
    }
    for (const sd of this.slideDusts) {
      sd.active = false;
      sd.group.visible = false;
    }
    for (const el of this.eliminations) {
      el.active = false;
      el.group.visible = false;
    }
    for (const wp of this.weakpoints) {
      wp.active = false;
      wp.propId = '';
      wp.group.visible = false;
    }
    for (const gl of this.grappleLines) {
      gl.active = false;
      gl.group.visible = false;
    }
    for (const sb of this.shieldBubbles) {
      sb.active = false;
      sb.id = '';
      sb.group.visible = false;
    }
    for (const vb of this.vehicleBoosts) {
      vb.active = false;
      vb.group.visible = false;
    }
    for (const wu of this.weaponUpgrades) {
      wu.active = false;
      wu.group.visible = false;
    }
    for (const sb of this.slurpBursts) {
      sb.active = false;
      sb.group.visible = false;
    }
    for (const ch of this.campfireHeals) {
      ch.active = false;
      ch.group.visible = false;
    }
    for (const d of this.impactDecals) {
      d.active = false;
      d.mesh.visible = false;
    }
    for (const rt of this.riftTears) {
      rt.active = false;
      rt.group.visible = false;
    }
    for (const fc of this.flagCaptures) {
      fc.active = false;
      fc.group.visible = false;
    }
    for (const av of this.augmentVfx) {
      av.active = false;
      av.group.visible = false;
    }
    if (this.tacticalPing) {
      this.tacticalPing.active = false;
      this.tacticalPing.group.visible = false;
    }
    this.throwArcGroup.visible = false;
    this.throwArcPointCount = 0;
    this.throwArcAge = 0;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;

    this.clear();

    for (const geo of this.sharedGeometries) {
      geo.dispose();
    }
    this.sharedGeometries.length = 0;

    for (const mat of this.ownedMaterials) {
      mat.dispose();
    }
    this.ownedMaterials.length = 0;

    for (const tex of this.ownedTextures) {
      tex.dispose();
    }
    this.ownedTextures.length = 0;

    this.scene.remove(this.root);
  }
}
