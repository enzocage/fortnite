import * as THREE from 'three';
import type {
  AmmoType,
  BiomeType,
  BuildPieceType,
  MaterialType,
  Rarity,
  Vec3Like,
  WeaponId,
  WeaponModId,
} from '../types';
import { EventBus, MATERIAL_STATS, RARITY_COLORS, WEAPONS, WEAPON_MODS, clamp } from '../core';

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

interface KineticDashStreak {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  radialX: number;
  radialY: number;
  progress: number;
  width: number;
  lengthFrac: number;
}

interface KineticDashSlot {
  active: boolean;
  age: number;
  duration: number;
  dashLength: number;
  group: THREE.Group;
  beamGroup: THREE.Group;
  trailMesh: THREE.Mesh;
  trailMat: THREE.MeshBasicMaterial;
  coreTrailMesh: THREE.Mesh;
  coreTrailMat: THREE.MeshBasicMaterial;
  originRingMesh: THREE.Mesh;
  originRingMat: THREE.MeshBasicMaterial;
  crescentGroup: THREE.Group;
  innerArcMesh: THREE.Mesh;
  innerArcMat: THREE.MeshBasicMaterial;
  outerArcMesh: THREE.Mesh;
  outerArcMat: THREE.MeshBasicMaterial;
  coreArcMesh: THREE.Mesh;
  coreArcMat: THREE.MeshBasicMaterial;
  streaks: KineticDashStreak[];
}

interface GoldBurstBar {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  baseScale: number;
}

interface GoldBurstSlot {
  active: boolean;
  age: number;
  duration: number;
  activeCount: number;
  group: THREE.Group;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  glowMesh: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  bars: GoldBurstBar[];
}

interface LootIslandShard {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  yOffset: number;
  baseScale: number;
}

interface LootIslandRiftSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  violetRingMesh: THREE.Mesh;
  violetRingMat: THREE.MeshBasicMaterial;
  spireOuterMesh: THREE.Mesh;
  spireOuterMat: THREE.MeshBasicMaterial;
  spireCoreMesh: THREE.Mesh;
  spireCoreMat: THREE.MeshBasicMaterial;
  coreSphereMesh: THREE.Mesh;
  coreSphereMat: THREE.MeshBasicMaterial;
  shards: LootIslandShard[];
}

interface BowExplosionSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface BowExplosionSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  blastMesh: THREE.Mesh;
  blastMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  tiltRingMesh: THREE.Mesh;
  tiltRingMat: THREE.MeshBasicMaterial;
  sparks: BowExplosionSpark[];
}

interface SlurpTankerDroplet {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface SlurpTankerBurstSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  innerDomeMesh: THREE.Mesh;
  innerDomeMat: THREE.MeshBasicMaterial;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  limeRingMesh: THREE.Mesh;
  limeRingMat: THREE.MeshBasicMaterial;
  geyserMesh: THREE.Mesh;
  geyserMat: THREE.MeshBasicMaterial;
  droplets: SlurpTankerDroplet[];
}

interface CrownGlintSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  baseScale: number;
}

interface CrownGlintSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  flareGroup: THREE.Group;
  flareMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  sparks: CrownGlintSpark[];
}

interface ReviveBeamSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  baseScale: number;
}

interface ReviveBeamSlot {
  active: boolean;
  age: number;
  duration: number;
  progress: number;
  group: THREE.Group;
  outerBeamMesh: THREE.Mesh;
  outerBeamMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  baseRingMesh: THREE.Mesh;
  baseRingMat: THREE.MeshBasicMaterial;
  pulseRingMesh: THREE.Mesh;
  pulseRingMat: THREE.MeshBasicMaterial;
  sparks: ReviveBeamSpark[];
}

interface RailgunBeamRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  frac: number;
}

interface RailgunBeamSlot {
  active: boolean;
  age: number;
  duration: number;
  beamLength: number;
  pierced: boolean;
  group: THREE.Group;
  beamGroup: THREE.Group;
  outerBeamMesh: THREE.Mesh;
  outerBeamMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  violetHaloMesh: THREE.Mesh;
  violetHaloMat: THREE.MeshBasicMaterial;
  impactRingMesh: THREE.Mesh;
  impactRingMat: THREE.MeshBasicMaterial;
  rings: RailgunBeamRing[];
}

interface RailSparkParticle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface RailSparkSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  glowMesh: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  sparks: RailSparkParticle[];
}

interface TrapTriggerMote {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface TrapTriggerSlot {
  active: boolean;
  age: number;
  duration: number;
  kind: 'spike_trap' | 'bouncer_pad';
  group: THREE.Group;
  baseRingMesh: THREE.Mesh;
  baseRingMat: THREE.MeshBasicMaterial;
  pulseRingMesh: THREE.Mesh;
  pulseRingMat: THREE.MeshBasicMaterial;
  columnMesh: THREE.Mesh;
  columnMat: THREE.MeshBasicMaterial;
  spikes: THREE.Mesh[];
  spikeMat: THREE.MeshBasicMaterial;
  motes: TrapTriggerMote[];
}

interface DroneExplodeShard {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
  isHullDebris: boolean;
}

interface DroneExplodeSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  outerMesh: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  tiltRingMesh: THREE.Mesh;
  tiltRingMat: THREE.MeshBasicMaterial;
  shards: DroneExplodeShard[];
}

interface RebootBeamSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  baseScale: number;
}

interface RebootBeamSlot {
  active: boolean;
  age: number;
  duration: number;
  progress: number;
  group: THREE.Group;
  outerBeamMesh: THREE.Mesh;
  outerBeamMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  baseRingMesh: THREE.Mesh;
  baseRingMat: THREE.MeshBasicMaterial;
  pulseRingMesh: THREE.Mesh;
  pulseRingMat: THREE.MeshBasicMaterial;
  sparks: RebootBeamSpark[];
}

interface BunkerDeploySpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  baseScale: number;
}

interface BunkerDeploySlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  baseSquareMesh: THREE.Mesh;
  baseSquareMat: THREE.MeshBasicMaterial;
  holoFrameMesh: THREE.Mesh;
  holoFrameMat: THREE.MeshBasicMaterial;
  shellMesh: THREE.Mesh;
  shellMat: THREE.MeshBasicMaterial;
  sparks: BunkerDeploySpark[];
}

interface EmpBlastArc {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface EmpBlastSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  tiltRingMesh: THREE.Mesh;
  tiltRingMat: THREE.MeshBasicMaterial;
  arcs: EmpBlastArc[];
}

interface WeaponModSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface WeaponModSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  upperRingMesh: THREE.Mesh;
  upperRingMat: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  sparks: WeaponModSpark[];
}

interface ForecastPulseSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  baseScale: number;
}

interface ForecastPulseSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  beaconMesh: THREE.Mesh;
  beaconMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  groundRingMesh: THREE.Mesh;
  groundRingMat: THREE.MeshBasicMaterial;
  skyRingMesh: THREE.Mesh;
  skyRingMat: THREE.MeshBasicMaterial;
  sparks: ForecastPulseSpark[];
}

interface JetpackFlameSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface JetpackFlameSlot {
  active: boolean;
  age: number;
  duration: number;
  intensity: number;
  group: THREE.Group;
  leftCone: THREE.Mesh;
  rightCone: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  leftCoreCone: THREE.Mesh;
  rightCoreCone: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  sparks: JetpackFlameSpark[];
}

interface FlameStreamPuff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
  isCyanCore: boolean;
}

interface FlameStreamSlot {
  active: boolean;
  age: number;
  duration: number;
  range: number;
  group: THREE.Group;
  outerConeMesh: THREE.Mesh;
  outerConeMat: THREE.MeshBasicMaterial;
  coreConeMesh: THREE.Mesh;
  coreConeMat: THREE.MeshBasicMaterial;
  puffs: FlameStreamPuff[];
}

interface MeteorStrikeEmber {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
  isRock: boolean;
}

interface MeteorStrikeSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  meteorMesh: THREE.Mesh;
  meteorMat: THREE.MeshBasicMaterial;
  trailConeMesh: THREE.Mesh;
  trailConeMat: THREE.MeshBasicMaterial;
  innerTrailMesh: THREE.Mesh;
  innerTrailMat: THREE.MeshBasicMaterial;
  blastSphereMesh: THREE.Mesh;
  blastSphereMat: THREE.MeshBasicMaterial;
  coreFlashMesh: THREE.Mesh;
  coreFlashMat: THREE.MeshBasicMaterial;
  shockRingMesh: THREE.Mesh;
  shockRingMat: THREE.MeshBasicMaterial;
  outerShockRingMesh: THREE.Mesh;
  outerShockRingMat: THREE.MeshBasicMaterial;
  tiltedRingMesh: THREE.Mesh;
  tiltedRingMat: THREE.MeshBasicMaterial;
  embers: MeteorStrikeEmber[];
}

interface HopCrystalMote {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface HopCrystalAuraSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  groundRingMesh: THREE.Mesh;
  groundRingMat: THREE.MeshBasicMaterial;
  levitateRingMesh: THREE.Mesh;
  levitateRingMat: THREE.MeshBasicMaterial;
  auraShellMesh: THREE.Mesh;
  auraShellMat: THREE.MeshBasicMaterial;
  motes: HopCrystalMote[];
}

interface HammerSlamShard {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface HammerSlamSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  flashMesh: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  violetRingMesh: THREE.Mesh;
  violetRingMat: THREE.MeshBasicMaterial;
  cyanRingMesh: THREE.Mesh;
  cyanRingMat: THREE.MeshBasicMaterial;
  tiltRingMesh: THREE.Mesh;
  tiltRingMat: THREE.MeshBasicMaterial;
  shards: HammerSlamShard[];
}

interface HammerBounceSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface HammerBounceSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  groundRingMesh: THREE.Mesh;
  groundRingMat: THREE.MeshBasicMaterial;
  boostRingMesh: THREE.Mesh;
  boostRingMat: THREE.MeshBasicMaterial;
  columnMesh: THREE.Mesh;
  columnMat: THREE.MeshBasicMaterial;
  sparks: HammerBounceSpark[];
}

interface FlareTrailSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface FlareTrailSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  beamLength: number;
  group: THREE.Group;
  beamMesh: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  burstMesh: THREE.Mesh;
  burstMat: THREE.MeshBasicMaterial;
  innerRingMesh: THREE.Mesh;
  innerRingMat: THREE.MeshBasicMaterial;
  scanRingMesh: THREE.Mesh;
  scanRingMat: THREE.MeshBasicMaterial;
  sparks: FlareTrailSpark[];
}

interface WaterWakeDroplet {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface WaterWakeSlot {
  active: boolean;
  age: number;
  duration: number;
  speedScale: number;
  group: THREE.Group;
  leftWakeMesh: THREE.Mesh;
  rightWakeMesh: THREE.Mesh;
  wakeMat: THREE.MeshBasicMaterial;
  rippleRingMesh: THREE.Mesh;
  rippleRingMat: THREE.MeshBasicMaterial;
  foamRingMesh: THREE.Mesh;
  foamRingMat: THREE.MeshBasicMaterial;
  droplets: WaterWakeDroplet[];
}

interface TurretDeploySpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface TurretDeploySlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  baseRingMesh: THREE.Mesh;
  baseRingMat: THREE.MeshBasicMaterial;
  lockRingMesh: THREE.Mesh;
  lockRingMat: THREE.MeshBasicMaterial;
  holoDomeMesh: THREE.Mesh;
  holoDomeMat: THREE.MeshBasicMaterial;
  sparks: TurretDeploySpark[];
}

interface TurretLaserSlot {
  active: boolean;
  age: number;
  duration: number;
  beamLength: number;
  group: THREE.Group;
  beamGroup: THREE.Group;
  outerBeamMesh: THREE.Mesh;
  outerBeamMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  muzzleFlashMesh: THREE.Mesh;
  muzzleFlashMat: THREE.MeshBasicMaterial;
  impactRingMesh: THREE.Mesh;
  impactRingMat: THREE.MeshBasicMaterial;
  impactFlashMesh: THREE.Mesh;
  impactFlashMat: THREE.MeshBasicMaterial;
}

interface SlurpOrbDroplet {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface SlurpOrbSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  tiltRingMesh: THREE.Mesh;
  tiltRingMat: THREE.MeshBasicMaterial;
  droplets: SlurpOrbDroplet[];
}

interface FishingSplashDroplet {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface FishingSplashSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  innerRingMesh: THREE.Mesh;
  innerRingMat: THREE.MeshBasicMaterial;
  plumeMesh: THREE.Mesh;
  plumeMat: THREE.MeshBasicMaterial;
  droplets: FishingSplashDroplet[];
}

interface TankShellShard {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface TankShellSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  beamLength: number;
  group: THREE.Group;
  beamMesh: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  flashMesh: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
  fireballMesh: THREE.Mesh;
  fireballMat: THREE.MeshBasicMaterial;
  shockRingMesh: THREE.Mesh;
  shockRingMat: THREE.MeshBasicMaterial;
  hexRingMesh: THREE.Mesh;
  hexRingMat: THREE.MeshBasicMaterial;
  shards: TankShellShard[];
}

interface ShieldRicochetSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface ShieldRicochetSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  flashMesh: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  hexShieldMesh: THREE.Mesh;
  hexShieldMat: THREE.MeshBasicMaterial;
  sparks: ShieldRicochetSpark[];
}

interface C4BlastShard {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  baseScale: number;
}

interface C4BlastSlot {
  active: boolean;
  age: number;
  duration: number;
  radius: number;
  group: THREE.Group;
  flashMesh: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
  shockRingMesh: THREE.Mesh;
  shockRingMat: THREE.MeshBasicMaterial;
  emberRingMesh: THREE.Mesh;
  emberRingMat: THREE.MeshBasicMaterial;
  shards: C4BlastShard[];
}

interface HotDropBeamSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface HotDropBeamSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  outerBeamMesh: THREE.Mesh;
  outerBeamMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  groundRingMesh: THREE.Mesh;
  groundRingMat: THREE.MeshBasicMaterial;
  hexRingMesh: THREE.Mesh;
  hexRingMat: THREE.MeshBasicMaterial;
  sparks: HotDropBeamSpark[];
}

interface ArcLightningSlot {
  active: boolean;
  age: number;
  duration: number;
  isChain: boolean;
  coreWidth: number;
  glowWidth: number;
  segmentLengths: number[];
  group: THREE.Group;
  coreSegments: THREE.Mesh[];
  glowSegments: THREE.Mesh[];
  coreMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  originFlashMesh: THREE.Mesh;
  impactFlashMesh: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
}

interface ShadowCloakWisp {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  startRadius: number;
  endRadius: number;
  startY: number;
  endY: number;
  spin: number;
  baseScale: number;
}

interface ShadowCloakBurstSlot {
  active: boolean;
  age: number;
  duration: number;
  entering: boolean;
  group: THREE.Group;
  mistRingMesh: THREE.Mesh;
  mistRingMat: THREE.MeshBasicMaterial;
  outerRingMesh: THREE.Mesh;
  outerRingMat: THREE.MeshBasicMaterial;
  shroudMesh: THREE.Mesh;
  shroudMat: THREE.MeshBasicMaterial;
  wisps: ShadowCloakWisp[];
}

interface RuneAttuneSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  angle: number;
  radius: number;
  speedY: number;
  spin: number;
  baseScale: number;
}

interface RuneAttuneSlot {
  active: boolean;
  age: number;
  duration: number;
  group: THREE.Group;
  outerBeamMesh: THREE.Mesh;
  outerBeamMat: THREE.MeshBasicMaterial;
  coreBeamMesh: THREE.Mesh;
  coreBeamMat: THREE.MeshBasicMaterial;
  glyphRingMesh: THREE.Mesh;
  glyphRingMat: THREE.MeshBasicMaterial;
  groundRingMesh: THREE.Mesh;
  groundRingMat: THREE.MeshBasicMaterial;
  sparks: RuneAttuneSpark[];
}

interface ChoppaWashMote {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

interface ChoppaWashSlot {
  active: boolean;
  age: number;
  duration: number;
  intensity: number;
  group: THREE.Group;
  outerDustRingMesh: THREE.Mesh;
  outerDustRingMat: THREE.MeshBasicMaterial;
  innerAirRingMesh: THREE.Mesh;
  innerAirRingMat: THREE.MeshBasicMaterial;
  motes: ChoppaWashMote[];
}

function getWeaponModColor(modId: WeaponModId): string {
  const found = WEAPON_MODS.find((m) => m.id === modId);
  return found?.accentColor ?? '#38bdf8';
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
const KINETIC_DASH_POOL_SIZE = 8;
const KINETIC_DASH_STREAK_COUNT = 8;
const GOLD_BURST_POOL_SIZE = 10;
const GOLD_BURST_BAR_COUNT = 14;
const LOOT_ISLAND_RIFT_POOL_SIZE = 4;
const LOOT_ISLAND_SHARD_COUNT = 8;
const BOW_EXPLOSION_POOL_SIZE = 10;
const BOW_EXPLOSION_SPARK_COUNT = 12;
const SLURP_TANKER_BURST_POOL_SIZE = 8;
const SLURP_TANKER_DROPLET_COUNT = 22;
const CROWN_GLINT_POOL_SIZE = 12;
const CROWN_GLINT_SPARK_COUNT = 8;
const REVIVE_BEAM_POOL_SIZE = 8;
const REVIVE_BEAM_SPARK_COUNT = 10;
const RAILGUN_BEAM_POOL_SIZE = 8;
const RAILGUN_BEAM_RING_COUNT = 5;
const RAIL_SPARKS_POOL_SIZE = 24;
const RAIL_SPARK_PARTICLE_COUNT = 10;
const TRAP_TRIGGER_POOL_SIZE = 10;
const TRAP_TRIGGER_SPIKE_COUNT = 8;
const TRAP_TRIGGER_MOTE_COUNT = 10;
const DRONE_EXPLODE_POOL_SIZE = 8;
const DRONE_EXPLODE_SHARD_COUNT = 12;
const REBOOT_BEAM_POOL_SIZE = 6;
const REBOOT_BEAM_SPARK_COUNT = 12;
const BUNKER_DEPLOY_POOL_SIZE = 6;
const BUNKER_DEPLOY_SPARK_COUNT = 12;
const EMP_BLAST_POOL_SIZE = 8;
const EMP_BLAST_ARC_COUNT = 14;
const WEAPON_MOD_POOL_SIZE = 8;
const WEAPON_MOD_SPARK_COUNT = 12;
const FORECAST_PULSE_POOL_SIZE = 6;
const FORECAST_PULSE_SPARK_COUNT = 12;
const JETPACK_FLAME_POOL_SIZE = 24;
const JETPACK_FLAME_SPARK_COUNT = 8;
const FLAME_STREAM_POOL_SIZE = 24;
const FLAME_STREAM_PUFF_COUNT = 10;
const METEOR_STRIKE_POOL_SIZE = 6;
const METEOR_STRIKE_EMBER_COUNT = 16;
const HOP_CRYSTAL_AURA_POOL_SIZE = 10;
const HOP_CRYSTAL_MOTE_COUNT = 12;
const HAMMER_SLAM_POOL_SIZE = 8;
const HAMMER_SLAM_SHARD_COUNT = 16;
const HAMMER_BOUNCE_POOL_SIZE = 10;
const HAMMER_BOUNCE_SPARK_COUNT = 12;
const FLARE_TRAIL_POOL_SIZE = 8;
const FLARE_TRAIL_SPARK_COUNT = 14;
const WATER_WAKE_POOL_SIZE = 32;
const WATER_WAKE_DROPLET_COUNT = 8;
const TURRET_DEPLOY_POOL_SIZE = 8;
const TURRET_DEPLOY_SPARK_COUNT = 12;
const TURRET_LASER_POOL_SIZE = 24;
const SLURP_ORB_POOL_SIZE = 10;
const SLURP_ORB_DROPLET_COUNT = 16;
const FISHING_SPLASH_POOL_SIZE = 12;
const FISHING_SPLASH_DROPLET_COUNT = 14;
const TANK_SHELL_POOL_SIZE = 8;
const TANK_SHELL_SHARD_COUNT = 14;
const SHIELD_RICOCHET_POOL_SIZE = 16;
const SHIELD_RICOCHET_SPARK_COUNT = 12;
const C4_BLAST_POOL_SIZE = 8;
const C4_BLAST_SHARD_COUNT = 18;
const HOT_DROP_BEAM_POOL_SIZE = 6;
const HOT_DROP_BEAM_SPARK_COUNT = 14;
const ARC_LIGHTNING_POOL_SIZE = 24;
const ARC_LIGHTNING_SEGMENT_COUNT = 8;
const SHADOW_CLOAK_BURST_POOL_SIZE = 10;
const SHADOW_CLOAK_WISP_COUNT = 14;
const RUNE_ATTUNE_POOL_SIZE = 6;
const RUNE_ATTUNE_SPARK_COUNT = 14;
const CHOPPA_WASH_POOL_SIZE = 16;
const CHOPPA_WASH_MOTE_COUNT = 10;
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
  private readonly kineticArcGeo: THREE.TorusGeometry;
  private readonly kineticOuterArcGeo: THREE.TorusGeometry;
  private readonly goldBarGeo: THREE.BoxGeometry;
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
  private readonly kineticDashes: KineticDashSlot[] = [];
  private readonly goldBursts: GoldBurstSlot[] = [];
  private readonly lootIslandRifts: LootIslandRiftSlot[] = [];
  private readonly bowExplosions: BowExplosionSlot[] = [];
  private readonly slurpTankerBursts: SlurpTankerBurstSlot[] = [];
  private readonly crownGlints: CrownGlintSlot[] = [];
  private readonly reviveBeams: ReviveBeamSlot[] = [];
  private readonly railgunBeams: RailgunBeamSlot[] = [];
  private readonly railSparks: RailSparkSlot[] = [];
  private readonly trapTriggers: TrapTriggerSlot[] = [];
  private readonly droneExplodes: DroneExplodeSlot[] = [];
  private readonly rebootBeams: RebootBeamSlot[] = [];
  private readonly bunkerDeploys: BunkerDeploySlot[] = [];
  private readonly empBlasts: EmpBlastSlot[] = [];
  private readonly weaponMods: WeaponModSlot[] = [];
  private readonly forecastPulses: ForecastPulseSlot[] = [];
  private readonly jetpackFlames: JetpackFlameSlot[] = [];
  private readonly flameStreams: FlameStreamSlot[] = [];
  private readonly meteorStrikes: MeteorStrikeSlot[] = [];
  private readonly hopCrystalAuras: HopCrystalAuraSlot[] = [];
  private readonly hammerSlams: HammerSlamSlot[] = [];
  private readonly hammerBounces: HammerBounceSlot[] = [];
  private readonly flareTrails: FlareTrailSlot[] = [];
  private readonly waterWakes: WaterWakeSlot[] = [];
  private readonly turretDeploys: TurretDeploySlot[] = [];
  private readonly turretLasers: TurretLaserSlot[] = [];
  private readonly slurpOrbs: SlurpOrbSlot[] = [];
  private readonly fishingSplashes: FishingSplashSlot[] = [];
  private readonly tankShells: TankShellSlot[] = [];
  private readonly shieldRicochets: ShieldRicochetSlot[] = [];
  private readonly c4Blasts: C4BlastSlot[] = [];
  private readonly hotDropBeams: HotDropBeamSlot[] = [];
  private readonly arcLightnings: ArcLightningSlot[] = [];
  private readonly shadowCloakBursts: ShadowCloakBurstSlot[] = [];
  private readonly runeAttunes: RuneAttuneSlot[] = [];
  private readonly choppaWashes: ChoppaWashSlot[] = [];

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
  private kineticDashCursor = 0;
  private goldBurstCursor = 0;
  private lootIslandRiftCursor = 0;
  private bowExplosionCursor = 0;
  private slurpTankerBurstCursor = 0;
  private crownGlintCursor = 0;
  private reviveBeamCursor = 0;
  private railgunBeamCursor = 0;
  private railSparksCursor = 0;
  private trapTriggerCursor = 0;
  private droneExplodeCursor = 0;
  private rebootBeamCursor = 0;
  private bunkerDeployCursor = 0;
  private empBlastCursor = 0;
  private weaponModCursor = 0;
  private forecastPulseCursor = 0;
  private jetpackFlameCursor = 0;
  private flameStreamCursor = 0;
  private meteorStrikeCursor = 0;
  private hopCrystalAuraCursor = 0;
  private hammerSlamCursor = 0;
  private hammerBounceCursor = 0;
  private flareTrailCursor = 0;
  private waterWakeCursor = 0;
  private turretDeployCursor = 0;
  private turretLaserCursor = 0;
  private slurpOrbCursor = 0;
  private fishingSplashCursor = 0;
  private tankShellCursor = 0;
  private shieldRicochetCursor = 0;
  private c4BlastCursor = 0;
  private hotDropBeamCursor = 0;
  private arcLightningCursor = 0;
  private shadowCloakBurstCursor = 0;
  private runeAttuneCursor = 0;
  private choppaWashCursor = 0;
  private rngSeed = 918273;
  private disposed = false;

  // Reusable scratch math objects (zero allocations in update/handlers)
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpOrthoUp = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly arcNodes: THREE.Vector3[] = Array.from(
    { length: ARC_LIGHTNING_SEGMENT_COUNT + 1 },
    () => new THREE.Vector3(),
  );

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
    this.kineticArcGeo = this.trackGeo(new THREE.TorusGeometry(1.15, 0.085, 6, 20, Math.PI * 1.05));
    this.kineticOuterArcGeo = this.trackGeo(
      new THREE.TorusGeometry(1.36, 0.05, 6, 20, Math.PI * 1.15),
    );
    this.goldBarGeo = this.trackGeo(new THREE.BoxGeometry(0.16, 0.075, 0.32));
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

    // 23. Kinetic Dash (sweeping cyan-violet plasma katana crescent ribbon + dash speed streaks)
    for (let i = 0; i < KINETIC_DASH_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_kinetic_dash';
      group.visible = false;

      const beamGroup = new THREE.Group();
      group.add(beamGroup);

      const trailMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const trailMesh = new THREE.Mesh(this.unitCylinderGeo, trailMat);
      trailMesh.rotation.x = Math.PI / 2;
      beamGroup.add(trailMesh);

      const coreTrailMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xc4b5fd,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreTrailMesh = new THREE.Mesh(this.unitCylinderGeo, coreTrailMat);
      coreTrailMesh.rotation.x = Math.PI / 2;
      beamGroup.add(coreTrailMesh);

      const originRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const originRingMesh = new THREE.Mesh(this.unitRingGeo, originRingMat);
      beamGroup.add(originRingMesh);

      const crescentGroup = new THREE.Group();
      beamGroup.add(crescentGroup);

      const innerArcMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const innerArcMesh = new THREE.Mesh(this.kineticArcGeo, innerArcMat);
      crescentGroup.add(innerArcMesh);

      const outerArcMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerArcMesh = new THREE.Mesh(this.kineticOuterArcGeo, outerArcMat);
      crescentGroup.add(outerArcMesh);

      const coreArcMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreArcMesh = new THREE.Mesh(this.kineticArcGeo, coreArcMat);
      coreArcMesh.scale.setScalar(0.84);
      crescentGroup.add(coreArcMesh);

      const streaks: KineticDashStreak[] = [];
      for (let s = 0; s < KINETIC_DASH_STREAK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 2 === 0 ? 0x22d3ee : 0xa855f7,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCylinderGeo, material);
        mesh.rotation.x = Math.PI / 2;
        beamGroup.add(mesh);
        streaks.push({
          mesh,
          material,
          radialX: 0,
          radialY: 0,
          progress: 0.5,
          width: 0.035,
          lengthFrac: 0.35,
        });
      }

      this.root.add(group);
      this.kineticDashes.push({
        active: false,
        age: 0,
        duration: 0.55,
        dashLength: 1,
        group,
        beamGroup,
        trailMesh,
        trailMat,
        coreTrailMesh,
        coreTrailMat,
        originRingMesh,
        originRingMat,
        crescentGroup,
        innerArcMesh,
        innerArcMat,
        outerArcMesh,
        outerArcMat,
        coreArcMesh,
        coreArcMat,
        streaks,
      });
    }

    // 24. Gold Burst (fountain of shiny spinning golden bars erupting outward and tumbling with gravity)
    for (let i = 0; i < GOLD_BURST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_gold_burst';
      group.visible = false;

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
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

      const glowMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const glowMesh = new THREE.Mesh(this.unitSphereGeo, glowMat);
      group.add(glowMesh);

      const bars: GoldBurstBar[] = [];
      for (let b = 0; b < GOLD_BURST_BAR_COUNT; b++) {
        const material = this.trackMat(
          new THREE.MeshStandardMaterial({
            color: b % 3 === 0 ? 0xfde047 : 0xfbbf24,
            emissive: 0xd97706,
            emissiveIntensity: 0.55,
            metalness: 0.88,
            roughness: 0.16,
            transparent: true,
            opacity: 1,
          }),
        );
        const mesh = new THREE.Mesh(this.goldBarGeo, material);
        group.add(mesh);
        bars.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          rz: 0,
          baseScale: 1,
        });
      }

      this.root.add(group);
      this.goldBursts.push({
        active: false,
        age: 0,
        duration: 1.05,
        activeCount: GOLD_BURST_BAR_COUNT,
        group,
        ringMesh,
        ringMat,
        glowMesh,
        glowMat,
        bars,
      });
    }

    // 25. Loot Island Rift (huge high-altitude spatial sky-crack shockwave ring + rising light spire)
    for (let i = 0; i < LOOT_ISLAND_RIFT_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_loot_island_rift';
      group.visible = false;

      const outerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerRingMesh = new THREE.Mesh(this.unitRingGeo, outerRingMat);
      outerRingMesh.rotation.x = -Math.PI / 2;
      group.add(outerRingMesh);

      const violetRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const violetRingMesh = new THREE.Mesh(this.unitRingGeo, violetRingMat);
      violetRingMesh.rotation.set(-Math.PI / 2 + 0.28, 0.2, 0.25);
      group.add(violetRingMesh);

      const spireOuterMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const spireOuterMesh = new THREE.Mesh(this.beamCylGeo, spireOuterMat);
      group.add(spireOuterMesh);

      const spireCoreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const spireCoreMesh = new THREE.Mesh(this.unitCylinderGeo, spireCoreMat);
      group.add(spireCoreMesh);

      const coreSphereMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreSphereMesh = new THREE.Mesh(this.unitSphereGeo, coreSphereMat);
      group.add(coreSphereMesh);

      const shards: LootIslandShard[] = [];
      for (let s = 0; s < LOOT_ISLAND_SHARD_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 2 === 0 ? 0x22d3ee : 0xa855f7,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        shards.push({
          mesh,
          material,
          angle: (s / LOOT_ISLAND_SHARD_COUNT) * Math.PI * 2,
          radius: 4.5,
          yOffset: (s % 3 - 1) * 1.4,
          baseScale: 1.6,
        });
      }

      this.root.add(group);
      this.lootIslandRifts.push({
        active: false,
        age: 0,
        duration: 2.4,
        group,
        outerRingMesh,
        outerRingMat,
        violetRingMesh,
        violetRingMat,
        spireOuterMesh,
        spireOuterMat,
        spireCoreMesh,
        spireCoreMat,
        coreSphereMesh,
        coreSphereMat,
        shards,
      });
    }

    // 26. Boom Bow Explosion (concussive orange-red-gold arrow blast + cross shockwave rings + embers)
    for (let i = 0; i < BOW_EXPLOSION_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_bow_explosion';
      group.visible = false;

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitSphereGeo, coreMat);
      group.add(coreMesh);

      const blastMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const blastMesh = new THREE.Mesh(this.unitSphereGeo, blastMat);
      group.add(blastMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfb923c,
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

      const tiltRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const tiltRingMesh = new THREE.Mesh(this.unitRingGeo, tiltRingMat);
      tiltRingMesh.rotation.set(Math.PI / 3, 0, Math.PI / 5);
      group.add(tiltRingMesh);

      const sparks: BowExplosionSpark[] = [];
      for (let s = 0; s < BOW_EXPLOSION_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xfef08a : s % 2 === 0 ? 0xf97316 : 0xef4444,
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
          baseScale: 0.16,
        });
      }

      this.root.add(group);
      this.bowExplosions.push({
        active: false,
        age: 0,
        duration: 0.62,
        radius: 4.4,
        group,
        coreMesh,
        coreMat,
        blastMesh,
        blastMat,
        ringMesh,
        ringMat,
        tiltRingMesh,
        tiltRingMat,
        sparks,
      });
    }

    // 27. Slurp Tanker Burst (huge pressurized cyan/lime healing mist explosion + geyser + droplets)
    for (let i = 0; i < SLURP_TANKER_BURST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_slurp_tanker_burst';
      group.visible = false;

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

      const innerDomeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.56,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const innerDomeMesh = new THREE.Mesh(this.unitSphereGeo, innerDomeMat);
      group.add(innerDomeMesh);

      const outerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerRingMesh = new THREE.Mesh(this.unitRingGeo, outerRingMat);
      outerRingMesh.rotation.x = -Math.PI / 2;
      group.add(outerRingMesh);

      const limeRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa3e635,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const limeRingMesh = new THREE.Mesh(this.unitRingGeo, limeRingMat);
      limeRingMesh.rotation.x = -Math.PI / 2;
      limeRingMesh.position.y = 0.14;
      group.add(limeRingMesh);

      const geyserMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const geyserMesh = new THREE.Mesh(this.beamCylGeo, geyserMat);
      group.add(geyserMesh);

      const droplets: SlurpTankerDroplet[] = [];
      for (let d = 0; d < SLURP_TANKER_DROPLET_COUNT; d++) {
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
          baseScale: 0.18,
        });
      }

      this.root.add(group);
      this.slurpTankerBursts.push({
        active: false,
        age: 0,
        duration: 1.25,
        radius: 10.0,
        group,
        domeMesh,
        domeMat,
        innerDomeMesh,
        innerDomeMat,
        outerRingMesh,
        outerRingMat,
        limeRingMesh,
        limeRingMat,
        geyserMesh,
        geyserMat,
        droplets,
      });
    }

    // 28. Crown Glint (golden 4-point star flare + halo ring + ascending sparkle motes)
    for (let i = 0; i < CROWN_GLINT_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_crown_glint';
      group.visible = false;

      const flareGroup = new THREE.Group();
      const flareMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.98,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );

      const starHoriz = new THREE.Mesh(this.unitCrystalGeo, flareMat);
      starHoriz.scale.set(0.85, 0.14, 0.14);
      flareGroup.add(starHoriz);

      const starVert = new THREE.Mesh(this.unitCrystalGeo, flareMat);
      starVert.scale.set(0.14, 0.85, 0.14);
      flareGroup.add(starVert);

      const starDepth = new THREE.Mesh(this.unitCrystalGeo, flareMat);
      starDepth.scale.set(0.14, 0.14, 0.85);
      flareGroup.add(starDepth);

      group.add(flareGroup);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
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

      const sparks: CrownGlintSpark[] = [];
      for (let s = 0; s < CROWN_GLINT_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 2 === 0 ? 0xfef08a : 0xfbbf24,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / CROWN_GLINT_SPARK_COUNT) * Math.PI * 2,
          radius: 0.3,
          speedY: 1.2,
          baseScale: 0.08,
        });
      }

      this.root.add(group);
      this.crownGlints.push({
        active: false,
        age: 0,
        duration: 0.78,
        group,
        flareGroup,
        flareMat,
        ringMesh,
        ringMat,
        sparks,
      });
    }

    // 29. Revive Beam (emerald-cyan healing column + progress ground ring + ascending healing sparkles)
    for (let i = 0; i < REVIVE_BEAM_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_revive_beam';
      group.visible = false;

      const outerBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x34d399,
          transparent: true,
          opacity: 0.36,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerBeamMesh = new THREE.Mesh(this.beamCylGeo, outerBeamMat);
      outerBeamMesh.position.y = 1.6;
      outerBeamMesh.scale.set(0.65, 3.2, 0.65);
      group.add(outerBeamMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa7f3d0,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.unitCylinderGeo, coreBeamMat);
      coreBeamMesh.position.y = 1.75;
      coreBeamMesh.scale.set(0.22, 3.5, 0.22);
      group.add(coreBeamMesh);

      const baseRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const baseRingMesh = new THREE.Mesh(this.unitRingGeo, baseRingMat);
      baseRingMesh.rotation.x = -Math.PI / 2;
      baseRingMesh.position.y = 0.05;
      group.add(baseRingMesh);

      const pulseRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const pulseRingMesh = new THREE.Mesh(this.unitRingGeo, pulseRingMat);
      pulseRingMesh.rotation.x = -Math.PI / 2;
      pulseRingMesh.position.y = 0.2;
      group.add(pulseRingMesh);

      const sparks: ReviveBeamSpark[] = [];
      for (let s = 0; s < REVIVE_BEAM_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xffffff : s % 2 === 0 ? 0x4ade80 : 0x22d3ee,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / REVIVE_BEAM_SPARK_COUNT) * Math.PI * 2,
          radius: 0.55,
          speedY: 1.5,
          baseScale: 0.09,
        });
      }

      this.root.add(group);
      this.reviveBeams.push({
        active: false,
        age: 0,
        duration: 0.55,
        progress: 0,
        group,
        outerBeamMesh,
        outerBeamMat,
        coreBeamMesh,
        coreBeamMat,
        baseRingMesh,
        baseRingMat,
        pulseRingMesh,
        pulseRingMat,
        sparks,
      });
    }

    // 30. Pulse Railgun Beam (twin cyan-violet plasma beam + traveling pulse rings + impact ring)
    for (let i = 0; i < RAILGUN_BEAM_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_railgun_beam';
      group.visible = false;

      const beamGroup = new THREE.Group();
      group.add(beamGroup);

      const outerBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerBeamMesh = new THREE.Mesh(this.unitCylinderGeo, outerBeamMat);
      outerBeamMesh.rotation.x = Math.PI / 2;
      beamGroup.add(outerBeamMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.unitCylinderGeo, coreBeamMat);
      coreBeamMesh.rotation.x = Math.PI / 2;
      beamGroup.add(coreBeamMesh);

      const violetHaloMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const violetHaloMesh = new THREE.Mesh(this.unitCylinderGeo, violetHaloMat);
      violetHaloMesh.rotation.x = Math.PI / 2;
      beamGroup.add(violetHaloMesh);

      const impactRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xc084fc,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const impactRingMesh = new THREE.Mesh(this.unitRingGeo, impactRingMat);
      beamGroup.add(impactRingMesh);

      const rings: RailgunBeamRing[] = [];
      for (let r = 0; r < RAILGUN_BEAM_RING_COUNT; r++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: r % 2 === 0 ? 0x22d3ee : 0xa855f7,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitRingGeo, material);
        beamGroup.add(mesh);
        rings.push({
          mesh,
          material,
          frac: (r + 1) / (RAILGUN_BEAM_RING_COUNT + 1),
        });
      }

      this.root.add(group);
      this.railgunBeams.push({
        active: false,
        age: 0,
        duration: 0.44,
        beamLength: 1,
        pierced: false,
        group,
        beamGroup,
        outerBeamMesh,
        outerBeamMat,
        coreBeamMesh,
        coreBeamMat,
        violetHaloMesh,
        violetHaloMat,
        impactRingMesh,
        impactRingMat,
        rings,
      });
    }

    // 31. Grind Rail Sparks (high-energy gold-cyan friction sparks spraying off rail)
    for (let i = 0; i < RAIL_SPARKS_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_rail_sparks';
      group.visible = false;

      const glowMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const glowMesh = new THREE.Mesh(this.unitSphereGeo, glowMat);
      group.add(glowMesh);

      const sparks: RailSparkParticle[] = [];
      for (let s = 0; s < RAIL_SPARK_PARTICLE_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xfef08a : s % 2 === 0 ? 0xfbbf24 : 0x22d3ee,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = s % 2 === 0 ? this.unitBoxGeo : this.unitCrystalGeo;
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
          baseScale: 0.08,
        });
      }

      this.root.add(group);
      this.railSparks.push({
        active: false,
        age: 0,
        duration: 0.34,
        group,
        glowMesh,
        glowMat,
        sparks,
      });
    }

    // 32. Tactical Trap Triggers (crimson metallic spikes for spike_trap / cyan-violet launch burst for bouncer_pad)
    for (let i = 0; i < TRAP_TRIGGER_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_trap_trigger';
      group.visible = false;

      const baseRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const baseRingMesh = new THREE.Mesh(this.unitRingGeo, baseRingMat);
      baseRingMesh.rotation.x = -Math.PI / 2;
      group.add(baseRingMesh);

      const pulseRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const pulseRingMesh = new THREE.Mesh(this.unitRingGeo, pulseRingMat);
      pulseRingMesh.rotation.x = -Math.PI / 2;
      group.add(pulseRingMesh);

      const columnMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const columnMesh = new THREE.Mesh(this.beamCylGeo, columnMat);
      group.add(columnMesh);

      const spikeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe2e8f0,
          transparent: true,
          opacity: 0.95,
        }),
      );
      const spikes: THREE.Mesh[] = [];
      for (let sp = 0; sp < TRAP_TRIGGER_SPIKE_COUNT; sp++) {
        const ang = (sp / TRAP_TRIGGER_SPIKE_COUNT) * Math.PI * 2;
        const rad = 0.52 + (sp % 2) * 0.35;
        const spike = new THREE.Mesh(this.unitConeGeo, spikeMat);
        spike.position.set(Math.cos(ang) * rad, 0.45, Math.sin(ang) * rad);
        spike.scale.set(0.14, 1.05, 0.14);
        group.add(spike);
        spikes.push(spike);
      }

      const motes: TrapTriggerMote[] = [];
      for (let m = 0; m < TRAP_TRIGGER_MOTE_COUNT; m++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0xfef08a,
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
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.11,
        });
      }

      this.root.add(group);
      this.trapTriggers.push({
        active: false,
        age: 0,
        duration: 0.55,
        kind: 'spike_trap',
        group,
        baseRingMesh,
        baseRingMat,
        pulseRingMesh,
        pulseRingMat,
        columnMesh,
        columnMat,
        spikes,
        spikeMat,
        motes,
      });
    }

    // 33. Flying Supply Drone Explode (rarity-tinted aerial blast + tumbling hull/loot shards)
    for (let i = 0; i < DRONE_EXPLODE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_drone_explode';
      group.visible = false;

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitSphereGeo, coreMat);
      group.add(coreMesh);

      const outerMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x26a6ff,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerMesh = new THREE.Mesh(this.unitSphereGeo, outerMat);
      group.add(outerMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x26a6ff,
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

      const tiltRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const tiltRingMesh = new THREE.Mesh(this.unitRingGeo, tiltRingMat);
      tiltRingMesh.rotation.set(Math.PI / 3, 0, Math.PI / 4);
      group.add(tiltRingMesh);

      const shards: DroneExplodeShard[] = [];
      for (let s = 0; s < DRONE_EXPLODE_SHARD_COUNT; s++) {
        const isHullDebris = s % 3 === 0;
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: isHullDebris ? 0x334155 : 0x26a6ff,
            transparent: true,
            opacity: 1,
            depthWrite: isHullDebris,
            blending: isHullDebris ? THREE.NormalBlending : THREE.AdditiveBlending,
          }),
        );
        const geo = isHullDebris ? this.unitBoxGeo : this.unitCrystalGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        shards.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.14,
          isHullDebris,
        });
      }

      this.root.add(group);
      this.droneExplodes.push({
        active: false,
        age: 0,
        duration: 0.72,
        group,
        coreMesh,
        coreMat,
        outerMesh,
        outerMat,
        ringMesh,
        ringMat,
        tiltRingMesh,
        tiltRingMat,
        shards,
      });
    }

    // 34. Reboot Van Skyward Respawn Beam (progress-scaled cyan-gold reboot pillar + rising halos)
    for (let i = 0; i < REBOOT_BEAM_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_reboot_beam';
      group.visible = false;

      const outerBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.36,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerBeamMesh = new THREE.Mesh(this.beamCylGeo, outerBeamMat);
      outerBeamMesh.position.y = 9.0;
      outerBeamMesh.scale.set(0.95, 18, 0.95);
      group.add(outerBeamMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.unitCylinderGeo, coreBeamMat);
      coreBeamMesh.position.y = 11.0;
      coreBeamMesh.scale.set(0.28, 22, 0.28);
      group.add(coreBeamMesh);

      const baseRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const baseRingMesh = new THREE.Mesh(this.unitRingGeo, baseRingMat);
      baseRingMesh.rotation.x = -Math.PI / 2;
      baseRingMesh.position.y = 0.08;
      group.add(baseRingMesh);

      const pulseRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const pulseRingMesh = new THREE.Mesh(this.unitRingGeo, pulseRingMat);
      pulseRingMesh.rotation.x = -Math.PI / 2;
      pulseRingMesh.position.y = 0.25;
      group.add(pulseRingMesh);

      const sparks: RebootBeamSpark[] = [];
      for (let s = 0; s < REBOOT_BEAM_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xffffff : s % 2 === 0 ? 0xfde047 : 0x22d3ee,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / REBOOT_BEAM_SPARK_COUNT) * Math.PI * 2,
          radius: 0.85,
          speedY: 2.2,
          baseScale: 0.11,
        });
      }

      this.root.add(group);
      this.rebootBeams.push({
        active: false,
        age: 0,
        duration: 0.6,
        progress: 0,
        group,
        outerBeamMesh,
        outerBeamMat,
        coreBeamMesh,
        coreBeamMat,
        baseRingMesh,
        baseRingMat,
        pulseRingMesh,
        pulseRingMat,
        sparks,
      });
    }

    // 35. Port-A-Bunker Deploy (collapsible cyan blueprint holo-cube frame + expanding square base + construction motes)
    for (let i = 0; i < BUNKER_DEPLOY_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_bunker_deploy';
      group.visible = false;

      const baseSquareMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const baseSquareMesh = new THREE.Mesh(this.diamondRingGeo, baseSquareMat);
      baseSquareMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
      baseSquareMesh.position.y = 0.08;
      group.add(baseSquareMesh);

      const holoFrameMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          wireframe: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const holoFrameMesh = new THREE.Mesh(this.unitBoxGeo, holoFrameMat);
      group.add(holoFrameMesh);

      const shellMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const shellMesh = new THREE.Mesh(this.unitBoxGeo, shellMat);
      group.add(shellMesh);

      const sparks: BunkerDeploySpark[] = [];
      for (let s = 0; s < BUNKER_DEPLOY_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xe0f2fe : s % 2 === 0 ? 0x22d3ee : 0x60a5fa,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = s % 2 === 0 ? this.unitBoxGeo : this.unitCrystalGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / BUNKER_DEPLOY_SPARK_COUNT) * Math.PI * 2,
          radius: 1.8,
          speedY: 2.2,
          baseScale: 0.14,
        });
      }

      this.root.add(group);
      this.bunkerDeploys.push({
        active: false,
        age: 0,
        duration: 0.78,
        group,
        baseSquareMesh,
        baseSquareMat,
        holoFrameMesh,
        holoFrameMat,
        shellMesh,
        shellMat,
        sparks,
      });
    }

    // 36. Shield-Breaker EMP Blast (electric cyan wireframe dome + dual magnetic shock rings + arc streaks)
    for (let i = 0; i < EMP_BLAST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_emp_blast';
      group.visible = false;

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitSphereGeo, coreMat);
      group.add(coreMesh);

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          wireframe: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.hexDomeGeo, domeMat);
      group.add(domeMesh);

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
      outerRingMesh.rotation.x = -Math.PI / 2;
      group.add(outerRingMesh);

      const tiltRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x818cf8,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const tiltRingMesh = new THREE.Mesh(this.unitRingGeo, tiltRingMat);
      tiltRingMesh.rotation.set(Math.PI / 3, 0, Math.PI / 5);
      group.add(tiltRingMesh);

      const arcs: EmpBlastArc[] = [];
      for (let a = 0; a < EMP_BLAST_ARC_COUNT; a++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: a % 3 === 0 ? 0xffffff : a % 2 === 0 ? 0x22d3ee : 0x60a5fa,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = a % 2 === 0 ? this.unitCrystalGeo : this.unitBoxGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        arcs.push({
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
      this.empBlasts.push({
        active: false,
        age: 0,
        duration: 0.68,
        radius: 6.5,
        group,
        coreMesh,
        coreMat,
        domeMesh,
        domeMat,
        outerRingMesh,
        outerRingMat,
        tiltRingMesh,
        tiltRingMat,
        arcs,
      });
    }

    // 37. Weapon Mod Install Burst (mod-color-tinted holographic hex scanner rings + calibration sparks)
    for (let i = 0; i < WEAPON_MOD_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_weapon_mod';
      group.visible = false;

      const outerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerRingMesh = new THREE.Mesh(this.hexRingGeo, outerRingMat);
      outerRingMesh.rotation.x = -Math.PI / 2;
      group.add(outerRingMesh);

      const upperRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const upperRingMesh = new THREE.Mesh(this.hexRingGeo, upperRingMat);
      upperRingMesh.rotation.x = -Math.PI / 2;
      group.add(upperRingMesh);

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitCrystalGeo, coreMat);
      group.add(coreMesh);

      const sparks: WeaponModSpark[] = [];
      for (let s = 0; s < WEAPON_MOD_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / WEAPON_MOD_SPARK_COUNT) * Math.PI * 2,
          radius: 0.45,
          speedY: 1.7,
          spin: 4.5,
          baseScale: 0.085,
        });
      }

      this.root.add(group);
      this.weaponMods.push({
        active: false,
        age: 0,
        duration: 0.75,
        group,
        outerRingMesh,
        outerRingMat,
        upperRingMesh,
        upperRingMat,
        coreMesh,
        coreMat,
        sparks,
      });
    }

    // 38. Radar Weather Forecast Pulse (tall emerald-cyan skyward radar beam + ascending telemetry scan rings)
    for (let i = 0; i < FORECAST_PULSE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_forecast_pulse';
      group.visible = false;

      const beaconMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const beaconMesh = new THREE.Mesh(this.beamCylGeo, beaconMat);
      beaconMesh.position.y = 12;
      beaconMesh.scale.set(0.95, 24, 0.95);
      group.add(beaconMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa7f3d0,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.unitCylinderGeo, coreBeamMat);
      coreBeamMesh.position.y = 13;
      coreBeamMesh.scale.set(0.28, 26, 0.28);
      group.add(coreBeamMesh);

      const groundRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const groundRingMesh = new THREE.Mesh(this.unitRingGeo, groundRingMat);
      groundRingMesh.rotation.x = -Math.PI / 2;
      groundRingMesh.position.y = 0.12;
      group.add(groundRingMesh);

      const skyRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x34d399,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const skyRingMesh = new THREE.Mesh(this.unitRingGeo, skyRingMat);
      skyRingMesh.rotation.x = -Math.PI / 2;
      skyRingMesh.position.y = 0.6;
      group.add(skyRingMesh);

      const sparks: ForecastPulseSpark[] = [];
      for (let s = 0; s < FORECAST_PULSE_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xffffff : s % 2 === 0 ? 0x34d399 : 0x22d3ee,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / FORECAST_PULSE_SPARK_COUNT) * Math.PI * 2,
          radius: 0.95,
          speedY: 4.5,
          baseScale: 0.13,
        });
      }

      this.root.add(group);
      this.forecastPulses.push({
        active: false,
        age: 0,
        duration: 1.25,
        group,
        beaconMesh,
        beaconMat,
        coreBeamMesh,
        coreBeamMat,
        groundRingMesh,
        groundRingMat,
        skyRingMesh,
        skyRingMat,
        sparks,
      });
    }

    // 39. Skyforge Jetpack Twin Thruster Flame Plumes
    for (let i = 0; i < JETPACK_FLAME_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_jetpack_flame';
      group.visible = false;

      const outerMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );

      const leftCone = new THREE.Mesh(this.unitConeGeo, outerMat);
      leftCone.position.set(-0.135, 0, 0.22);
      leftCone.rotation.x = Math.PI / 2;
      leftCone.scale.set(0.18, 0.48, 0.18);
      group.add(leftCone);

      const rightCone = new THREE.Mesh(this.unitConeGeo, outerMat);
      rightCone.position.set(0.135, 0, 0.22);
      rightCone.rotation.x = Math.PI / 2;
      rightCone.scale.set(0.18, 0.48, 0.18);
      group.add(rightCone);

      const leftCoreCone = new THREE.Mesh(this.unitConeGeo, coreMat);
      leftCoreCone.position.set(-0.135, 0, 0.17);
      leftCoreCone.rotation.x = Math.PI / 2;
      leftCoreCone.scale.set(0.095, 0.32, 0.095);
      group.add(leftCoreCone);

      const rightCoreCone = new THREE.Mesh(this.unitConeGeo, coreMat);
      rightCoreCone.position.set(0.135, 0, 0.17);
      rightCoreCone.rotation.x = Math.PI / 2;
      rightCoreCone.scale.set(0.095, 0.32, 0.095);
      group.add(rightCoreCone);

      const sparks: JetpackFlameSpark[] = [];
      for (let s = 0; s < JETPACK_FLAME_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0x38bdf8 : s % 2 === 0 ? 0xfef08a : 0xf97316,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.08,
        });
      }

      this.root.add(group);
      this.jetpackFlames.push({
        active: false,
        age: 0,
        duration: 0.26,
        intensity: 1,
        group,
        leftCone,
        rightCone,
        outerMat,
        leftCoreCone,
        rightCoreCone,
        coreMat,
        sparks,
      });
    }

    // 40. Dragon's Breath Plasma Flamethrower Stream
    for (let i = 0; i < FLAME_STREAM_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_flame_stream';
      group.visible = false;

      const outerConeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerConeMesh = new THREE.Mesh(this.unitConeGeo, outerConeMat);
      outerConeMesh.rotation.x = -Math.PI / 2;
      group.add(outerConeMesh);

      const coreConeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreConeMesh = new THREE.Mesh(this.unitConeGeo, coreConeMat);
      coreConeMesh.rotation.x = -Math.PI / 2;
      group.add(coreConeMesh);

      const puffs: FlameStreamPuff[] = [];
      for (let p = 0; p < FLAME_STREAM_PUFF_COUNT; p++) {
        const isCyanCore = p % 4 === 0;
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: isCyanCore ? 0x38bdf8 : p % 2 === 0 ? 0xfb923c : 0xfde047,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = isCyanCore ? this.unitCrystalGeo : this.unitSphereGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        puffs.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.32,
          isCyanCore,
        });
      }

      this.root.add(group);
      this.flameStreams.push({
        active: false,
        age: 0,
        duration: 0.36,
        range: 14,
        group,
        outerConeMesh,
        outerConeMat,
        coreConeMesh,
        coreConeMat,
        puffs,
      });
    }

    // 41. Dramatic Falling Meteor Strike + Fiery Shock Ring
    const meteorUpTrailDir = new THREE.Vector3(-0.32, 0.93, -0.18).normalize();
    const meteorTrailQuat = new THREE.Quaternion().setFromUnitVectors(this.upAxis, meteorUpTrailDir);
    for (let i = 0; i < METEOR_STRIKE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_meteor_strike';
      group.visible = false;

      const meteorMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfb923c,
          transparent: true,
          opacity: 0.98,
        }),
      );
      const meteorMesh = new THREE.Mesh(this.unitCrystalGeo, meteorMat);
      group.add(meteorMesh);

      const trailConeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const trailConeMesh = new THREE.Mesh(this.unitConeGeo, trailConeMat);
      trailConeMesh.quaternion.copy(meteorTrailQuat);
      group.add(trailConeMesh);

      const innerTrailMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const innerTrailMesh = new THREE.Mesh(this.unitConeGeo, innerTrailMat);
      innerTrailMesh.quaternion.copy(meteorTrailQuat);
      group.add(innerTrailMesh);

      const blastSphereMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const blastSphereMesh = new THREE.Mesh(this.unitSphereGeo, blastSphereMat);
      group.add(blastSphereMesh);

      const coreFlashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef9c3,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreFlashMesh = new THREE.Mesh(this.unitSphereGeo, coreFlashMat);
      group.add(coreFlashMesh);

      const shockRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const shockRingMesh = new THREE.Mesh(this.unitRingGeo, shockRingMat);
      shockRingMesh.rotation.x = -Math.PI / 2;
      shockRingMesh.position.y = 0.14;
      group.add(shockRingMesh);

      const outerShockRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerShockRingMesh = new THREE.Mesh(this.unitRingGeo, outerShockRingMat);
      outerShockRingMesh.rotation.x = -Math.PI / 2;
      outerShockRingMesh.position.y = 0.10;
      group.add(outerShockRingMesh);

      const tiltedRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const tiltedRingMesh = new THREE.Mesh(this.unitRingGeo, tiltedRingMat);
      tiltedRingMesh.rotation.set(Math.PI / 3, 0, Math.PI / 5);
      group.add(tiltedRingMesh);

      const embers: MeteorStrikeEmber[] = [];
      for (let e = 0; e < METEOR_STRIKE_EMBER_COUNT; e++) {
        const isRock = e % 3 === 0;
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: isRock ? 0x57534e : e % 2 === 0 ? 0xfbbf24 : 0xf97316,
            transparent: true,
            opacity: 1,
            depthWrite: isRock,
            blending: isRock ? THREE.NormalBlending : THREE.AdditiveBlending,
          }),
        );
        const geo = isRock ? this.unitBoxGeo : this.unitCrystalGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        embers.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.25,
          isRock,
        });
      }

      this.root.add(group);
      this.meteorStrikes.push({
        active: false,
        age: 0,
        duration: 1.45,
        radius: 10,
        group,
        meteorMesh,
        meteorMat,
        trailConeMesh,
        trailConeMat,
        innerTrailMesh,
        innerTrailMat,
        blastSphereMesh,
        blastSphereMat,
        coreFlashMesh,
        coreFlashMat,
        shockRingMesh,
        shockRingMat,
        outerShockRingMesh,
        outerShockRingMat,
        tiltedRingMesh,
        tiltedRingMat,
        embers,
      });
    }

    // 42. Hop Crystal Low-Gravity Aura (shimmering violet anti-gravity rings + rising crystal shards)
    for (let i = 0; i < HOP_CRYSTAL_AURA_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_hop_crystal_aura';
      group.visible = false;

      const groundRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const groundRingMesh = new THREE.Mesh(this.unitRingGeo, groundRingMat);
      groundRingMesh.rotation.x = -Math.PI / 2;
      groundRingMesh.position.y = 0.08;
      group.add(groundRingMesh);

      const levitateRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xc084fc,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const levitateRingMesh = new THREE.Mesh(this.hexRingGeo, levitateRingMat);
      levitateRingMesh.rotation.x = -Math.PI / 2;
      group.add(levitateRingMesh);

      const auraShellMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x8b5cf6,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const auraShellMesh = new THREE.Mesh(this.hexPrismGeo, auraShellMat);
      group.add(auraShellMesh);

      const motes: HopCrystalMote[] = [];
      for (let m = 0; m < HOP_CRYSTAL_MOTE_COUNT; m++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: m % 3 === 0 ? 0xf3e8ff : m % 2 === 0 ? 0xc084fc : 0xa855f7,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        motes.push({
          mesh,
          material,
          angle: (m / HOP_CRYSTAL_MOTE_COUNT) * Math.PI * 2,
          radius: 0.55,
          speedY: 2.2,
          spin: 4.5,
          baseScale: 0.11,
        });
      }

      this.root.add(group);
      this.hopCrystalAuras.push({
        active: false,
        age: 0,
        duration: 0.95,
        group,
        groundRingMesh,
        groundRingMat,
        levitateRingMesh,
        levitateRingMat,
        auraShellMesh,
        auraShellMat,
        motes,
      });
    }

    // 43. Shockwave Hammer Ground Slam (violet-cyan radial shockwave rings + impact dome + debris shards)
    for (let i = 0; i < HAMMER_SLAM_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_hammer_slam';
      group.visible = false;

      const flashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flashMesh = new THREE.Mesh(this.unitSphereGeo, flashMat);
      group.add(flashMesh);

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x8b5cf6,
          transparent: true,
          opacity: 0.44,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

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
      violetRingMesh.position.y = 0.12;
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
      cyanRingMesh.position.y = 0.18;
      group.add(cyanRingMesh);

      const tiltRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const tiltRingMesh = new THREE.Mesh(this.hexRingGeo, tiltRingMat);
      tiltRingMesh.rotation.set(Math.PI / 3, 0, Math.PI / 5);
      group.add(tiltRingMesh);

      const shards: HammerSlamShard[] = [];
      for (let s = 0; s < HAMMER_SLAM_SHARD_COUNT; s++) {
        const isRock = s % 4 === 0;
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: isRock ? 0x64748b : s % 2 === 0 ? 0x22d3ee : 0xa855f7,
            transparent: true,
            opacity: 0.96,
            depthWrite: isRock,
            blending: isRock ? THREE.NormalBlending : THREE.AdditiveBlending,
          }),
        );
        const geo = isRock ? this.unitBoxGeo : this.unitCrystalGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        shards.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.18,
        });
      }

      this.root.add(group);
      this.hammerSlams.push({
        active: false,
        age: 0,
        duration: 0.78,
        radius: 5.5,
        group,
        flashMesh,
        flashMat,
        domeMesh,
        domeMat,
        violetRingMesh,
        violetRingMat,
        cyanRingMesh,
        cyanRingMat,
        tiltRingMesh,
        tiltRingMat,
        shards,
      });
    }

    // 44. Shockwave Hammer Kinetic Bounce Leap (upward cyan-violet vortex + launch ring + spiraling sparks)
    for (let i = 0; i < HAMMER_BOUNCE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_hammer_bounce';
      group.visible = false;

      const groundRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const groundRingMesh = new THREE.Mesh(this.unitRingGeo, groundRingMat);
      groundRingMesh.rotation.x = -Math.PI / 2;
      groundRingMesh.position.y = 0.08;
      group.add(groundRingMesh);

      const boostRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const boostRingMesh = new THREE.Mesh(this.hexRingGeo, boostRingMat);
      boostRingMesh.rotation.x = -Math.PI / 2;
      group.add(boostRingMesh);

      const columnMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.44,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const columnMesh = new THREE.Mesh(this.beamCylGeo, columnMat);
      group.add(columnMesh);

      const sparks: HammerBounceSpark[] = [];
      for (let s = 0; s < HAMMER_BOUNCE_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xe0f2fe : s % 2 === 0 ? 0x22d3ee : 0xa855f7,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / HAMMER_BOUNCE_SPARK_COUNT) * Math.PI * 2,
          radius: 0.65,
          speedY: 4.5,
          spin: 5.5,
          baseScale: 0.12,
        });
      }

      this.root.add(group);
      this.hammerBounces.push({
        active: false,
        age: 0,
        duration: 0.64,
        group,
        groundRingMesh,
        groundRingMat,
        boostRingMesh,
        boostRingMat,
        columnMesh,
        columnMat,
        sparks,
      });
    }

    // 45. Recon Flare Gun Signal Trail & Scan Beacon Burst
    for (let i = 0; i < FLARE_TRAIL_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_flare_trail';
      group.visible = false;

      const beamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfb923c,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const beamMesh = new THREE.Mesh(this.unitCylinderGeo, beamMat);
      group.add(beamMesh);

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitSphereGeo, coreMat);
      group.add(coreMesh);

      const burstMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const burstMesh = new THREE.Mesh(this.unitSphereGeo, burstMat);
      group.add(burstMesh);

      const innerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const innerRingMesh = new THREE.Mesh(this.unitRingGeo, innerRingMat);
      innerRingMesh.rotation.x = -Math.PI / 2;
      innerRingMesh.position.y = 0.1;
      group.add(innerRingMesh);

      const scanRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const scanRingMesh = new THREE.Mesh(this.unitRingGeo, scanRingMat);
      scanRingMesh.rotation.x = -Math.PI / 2;
      scanRingMesh.position.y = 0.14;
      group.add(scanRingMesh);

      const sparks: FlareTrailSpark[] = [];
      for (let s = 0; s < FLARE_TRAIL_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xfef08a : s % 2 === 0 ? 0xf97316 : 0xef4444,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
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
      this.flareTrails.push({
        active: false,
        age: 0,
        duration: 1.15,
        radius: 15,
        beamLength: 0,
        group,
        beamMesh,
        beamMat,
        coreMesh,
        coreMat,
        burstMesh,
        burstMat,
        innerRingMesh,
        innerRingMat,
        scanRingMesh,
        scanRingMat,
        sparks,
      });
    }

    // 46. Speedboat Water Wake (V-shaped stern foam trails + concentric water ripples + splash droplets)
    for (let i = 0; i < WATER_WAKE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_water_wake';
      group.visible = false;

      const wakeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const leftWakeMesh = new THREE.Mesh(this.unitBoxGeo, wakeMat);
      leftWakeMesh.rotation.y = 0.42;
      group.add(leftWakeMesh);

      const rightWakeMesh = new THREE.Mesh(this.unitBoxGeo, wakeMat);
      rightWakeMesh.rotation.y = -0.42;
      group.add(rightWakeMesh);

      const rippleRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const rippleRingMesh = new THREE.Mesh(this.unitRingGeo, rippleRingMat);
      rippleRingMesh.rotation.x = -Math.PI / 2;
      rippleRingMesh.position.y = 0.04;
      group.add(rippleRingMesh);

      const foamRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf0f9ff,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const foamRingMesh = new THREE.Mesh(this.unitRingGeo, foamRingMat);
      foamRingMesh.rotation.x = -Math.PI / 2;
      foamRingMesh.position.y = 0.06;
      group.add(foamRingMesh);

      const droplets: WaterWakeDroplet[] = [];
      for (let d = 0; d < WATER_WAKE_DROPLET_COUNT; d++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: d % 2 === 0 ? 0xf0f9ff : 0x7dd3fc,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        droplets.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.09,
        });
      }

      this.root.add(group);
      this.waterWakes.push({
        active: false,
        age: 0,
        duration: 0.72,
        speedScale: 1,
        group,
        leftWakeMesh,
        rightWakeMesh,
        wakeMat,
        rippleRingMesh,
        rippleRingMat,
        foamRingMesh,
        foamRingMat,
        droplets,
      });
    }

    // 47. Sentry Auto-Turret Deploy (glowing cyan lock ring + holo dome + rising cyber sparks)
    for (let i = 0; i < TURRET_DEPLOY_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_turret_deploy';
      group.visible = false;

      const baseRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const baseRingMesh = new THREE.Mesh(this.unitRingGeo, baseRingMat);
      baseRingMesh.rotation.x = -Math.PI / 2;
      baseRingMesh.position.y = 0.06;
      group.add(baseRingMesh);

      const lockRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const lockRingMesh = new THREE.Mesh(this.hexRingGeo, lockRingMat);
      lockRingMesh.rotation.x = -Math.PI / 2;
      lockRingMesh.position.y = 0.14;
      group.add(lockRingMesh);

      const holoDomeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          wireframe: true,
          transparent: true,
          opacity: 0.56,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const holoDomeMesh = new THREE.Mesh(this.hexDomeGeo, holoDomeMat);
      holoDomeMesh.position.y = 0.45;
      group.add(holoDomeMesh);

      const sparks: TurretDeploySpark[] = [];
      for (let s = 0; s < TURRET_DEPLOY_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xe0f2fe : s % 2 === 0 ? 0x22d3ee : 0x38bdf8,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / TURRET_DEPLOY_SPARK_COUNT) * Math.PI * 2,
          radius: 0.75,
          speedY: 2.0,
          spin: 4.0,
          baseScale: 0.10,
        });
      }

      this.root.add(group);
      this.turretDeploys.push({
        active: false,
        age: 0,
        duration: 0.76,
        group,
        baseRingMesh,
        baseRingMat,
        lockRingMesh,
        lockRingMat,
        holoDomeMesh,
        holoDomeMat,
        sparks,
      });
    }

    // 48. Sentry Auto-Turret Laser Shot (high-energy cyan bolt + muzzle flash + target impact ring)
    for (let i = 0; i < TURRET_LASER_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_turret_laser';
      group.visible = false;

      const beamGroup = new THREE.Group();
      group.add(beamGroup);

      const outerBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerBeamMesh = new THREE.Mesh(this.unitCylinderGeo, outerBeamMat);
      outerBeamMesh.rotation.x = Math.PI / 2;
      beamGroup.add(outerBeamMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.98,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.unitCylinderGeo, coreBeamMat);
      coreBeamMesh.rotation.x = Math.PI / 2;
      beamGroup.add(coreBeamMesh);

      const muzzleFlashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const muzzleFlashMesh = new THREE.Mesh(this.unitSphereGeo, muzzleFlashMat);
      beamGroup.add(muzzleFlashMesh);

      const impactRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const impactRingMesh = new THREE.Mesh(this.unitRingGeo, impactRingMat);
      beamGroup.add(impactRingMesh);

      const impactFlashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf0f9ff,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const impactFlashMesh = new THREE.Mesh(this.unitSphereGeo, impactFlashMat);
      beamGroup.add(impactFlashMesh);

      this.root.add(group);
      this.turretLasers.push({
        active: false,
        age: 0,
        duration: 0.18,
        beamLength: 1,
        group,
        beamGroup,
        outerBeamMesh,
        outerBeamMat,
        coreBeamMesh,
        coreBeamMat,
        muzzleFlashMesh,
        muzzleFlashMat,
        impactRingMesh,
        impactRingMat,
        impactFlashMesh,
        impactFlashMat,
      });
    }

    // 49. Exotic Chug Cannon Slurp Orb Burst (glowing cyan healing dome + teal rings + bubbling Slurp droplets)
    for (let i = 0; i < SLURP_ORB_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_slurp_orb';
      group.visible = false;

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.46,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa5f3fc,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreMesh = new THREE.Mesh(this.unitSphereGeo, coreMat);
      group.add(coreMesh);

      const ringMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x2dd4bf,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ringMesh = new THREE.Mesh(this.unitRingGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.06;
      group.add(ringMesh);

      const tiltRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const tiltRingMesh = new THREE.Mesh(this.hexRingGeo, tiltRingMat);
      tiltRingMesh.rotation.set(Math.PI / 4, 0, Math.PI / 6);
      group.add(tiltRingMesh);

      const droplets: SlurpOrbDroplet[] = [];
      for (let d = 0; d < SLURP_ORB_DROPLET_COUNT; d++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: d % 3 === 0 ? 0xecfeff : d % 2 === 0 ? 0x22d3ee : 0x2dd4bf,
            transparent: true,
            opacity: 0.96,
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
      this.slurpOrbs.push({
        active: false,
        age: 0,
        duration: 0.75,
        radius: 4.5,
        group,
        domeMesh,
        domeMat,
        coreMesh,
        coreMat,
        ringMesh,
        ringMat,
        tiltRingMesh,
        tiltRingMat,
        droplets,
      });
    }

    // 50. Fishing Hole Splash (aqua splash crown plume + concentric ripple rings + flying water droplets)
    for (let i = 0; i < FISHING_SPLASH_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_fishing_splash';
      group.visible = false;

      const outerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerRingMesh = new THREE.Mesh(this.unitRingGeo, outerRingMat);
      outerRingMesh.rotation.x = -Math.PI / 2;
      outerRingMesh.position.y = 0.05;
      group.add(outerRingMesh);

      const innerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const innerRingMesh = new THREE.Mesh(this.unitRingGeo, innerRingMat);
      innerRingMesh.rotation.x = -Math.PI / 2;
      innerRingMesh.position.y = 0.08;
      group.add(innerRingMesh);

      const plumeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x7dd3fc,
          transparent: true,
          opacity: 0.54,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const plumeMesh = new THREE.Mesh(this.beamCylGeo, plumeMat);
      plumeMesh.position.y = 0.55;
      group.add(plumeMesh);

      const droplets: FishingSplashDroplet[] = [];
      for (let d = 0; d < FISHING_SPLASH_DROPLET_COUNT; d++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: d % 3 === 0 ? 0xf0f9ff : d % 2 === 0 ? 0x7dd3fc : 0x22d3ee,
            transparent: true,
            opacity: 0.94,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const geo = d % 2 === 0 ? this.unitCrystalGeo : this.unitSphereGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        droplets.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.095,
        });
      }

      this.root.add(group);
      this.fishingSplashes.push({
        active: false,
        age: 0,
        duration: 0.68,
        group,
        outerRingMesh,
        outerRingMat,
        innerRingMesh,
        innerRingMat,
        plumeMesh,
        plumeMat,
        droplets,
      });
    }

    // 51. Vanguard Tank Main Cannon Shell (heavy fiery shell tracer beam + high-explosive blast + shrapnel)
    for (let i = 0; i < TANK_SHELL_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_tank_shell';
      group.visible = false;

      const beamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const beamMesh = new THREE.Mesh(this.unitCylinderGeo, beamMat);
      group.add(beamMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.unitCylinderGeo, coreBeamMat);
      group.add(coreBeamMesh);

      const flashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flashMesh = new THREE.Mesh(this.unitSphereGeo, flashMat);
      group.add(flashMesh);

      const fireballMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const fireballMesh = new THREE.Mesh(this.unitSphereGeo, fireballMat);
      group.add(fireballMesh);

      const shockRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const shockRingMesh = new THREE.Mesh(this.unitRingGeo, shockRingMat);
      shockRingMesh.rotation.x = -Math.PI / 2;
      shockRingMesh.position.y = 0.08;
      group.add(shockRingMesh);

      const hexRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const hexRingMesh = new THREE.Mesh(this.hexRingGeo, hexRingMat);
      hexRingMesh.rotation.x = -Math.PI / 2;
      hexRingMesh.position.y = 0.12;
      group.add(hexRingMesh);

      const shards: TankShellShard[] = [];
      for (let s = 0; s < TANK_SHELL_SHARD_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xfef08a : s % 2 === 0 ? 0xf97316 : 0xef4444,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
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
          baseScale: 0.16,
        });
      }

      this.root.add(group);
      this.tankShells.push({
        active: false,
        age: 0,
        duration: 0.78,
        radius: 5.5,
        beamLength: 0,
        group,
        beamMesh,
        beamMat,
        coreBeamMesh,
        coreBeamMat,
        flashMesh,
        flashMat,
        fireballMesh,
        fireballMat,
        shockRingMesh,
        shockRingMat,
        hexRingMesh,
        hexRingMat,
        shards,
      });
    }

    // 52. Aegis Ballistic Shield Ricochet (cyan metallic deflection flare + hex ripple + sparks)
    for (let i = 0; i < SHIELD_RICOCHET_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_shield_ricochet';
      group.visible = false;

      const flashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flashMesh = new THREE.Mesh(this.unitSphereGeo, flashMat);
      group.add(flashMesh);

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
      group.add(outerRingMesh);

      const hexShieldMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const hexShieldMesh = new THREE.Mesh(this.hexRingGeo, hexShieldMat);
      group.add(hexShieldMesh);

      const sparks: ShieldRicochetSpark[] = [];
      for (let s = 0; s < SHIELD_RICOCHET_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xffffff : s % 2 === 0 ? 0x22d3ee : 0xfbbf24,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          rx: 0,
          ry: 0,
          baseScale: 0.085,
        });
      }

      this.root.add(group);
      this.shieldRicochets.push({
        active: false,
        age: 0,
        duration: 0.34,
        group,
        flashMesh,
        flashMat,
        outerRingMesh,
        outerRingMat,
        hexShieldMesh,
        hexShieldMat,
        sparks,
      });
    }

    // 53. Remote C4 Demolition Blast (crimson-orange blast dome + shock ring + fiery shrapnel)
    for (let i = 0; i < C4_BLAST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_c4_blast';
      group.visible = false;

      const flashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flashMesh = new THREE.Mesh(this.unitSphereGeo, flashMat);
      group.add(flashMesh);

      const domeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const domeMesh = new THREE.Mesh(this.unitSphereGeo, domeMat);
      group.add(domeMesh);

      const shockRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const shockRingMesh = new THREE.Mesh(this.unitRingGeo, shockRingMat);
      shockRingMesh.rotation.x = -Math.PI / 2;
      shockRingMesh.position.y = 0.08;
      group.add(shockRingMesh);

      const emberRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const emberRingMesh = new THREE.Mesh(this.hexRingGeo, emberRingMat);
      emberRingMesh.rotation.x = -Math.PI / 2;
      emberRingMesh.position.y = 0.14;
      group.add(emberRingMesh);

      const shards: C4BlastShard[] = [];
      for (let s = 0; s < C4_BLAST_SHARD_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xfef08a : s % 2 === 0 ? 0xef4444 : 0xf97316,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
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
          baseScale: 0.16,
        });
      }

      this.root.add(group);
      this.c4Blasts.push({
        active: false,
        age: 0,
        duration: 0.88,
        radius: 5.5,
        group,
        flashMesh,
        flashMat,
        domeMesh,
        domeMat,
        shockRingMesh,
        shockRingMat,
        emberRingMesh,
        emberRingMat,
        shards,
      });
    }

    // 54. Hot-Drop Gold POI Sky Beam (radiant amber sky spotlight pillar + golden rings + rising drop sparks)
    for (let i = 0; i < HOT_DROP_BEAM_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_hot_drop_beam';
      group.visible = false;

      const outerBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerBeamMesh = new THREE.Mesh(this.beamCylGeo, outerBeamMat);
      outerBeamMesh.position.y = 14;
      group.add(outerBeamMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.beamCylGeo, coreBeamMat);
      coreBeamMesh.position.y = 14;
      group.add(coreBeamMesh);

      const groundRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const groundRingMesh = new THREE.Mesh(this.unitRingGeo, groundRingMat);
      groundRingMesh.rotation.x = -Math.PI / 2;
      groundRingMesh.position.y = 0.08;
      group.add(groundRingMesh);

      const hexRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const hexRingMesh = new THREE.Mesh(this.hexRingGeo, hexRingMat);
      hexRingMesh.rotation.x = -Math.PI / 2;
      hexRingMesh.position.y = 0.25;
      group.add(hexRingMesh);

      const sparks: HotDropBeamSpark[] = [];
      for (let s = 0; s < HOT_DROP_BEAM_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0xfef08a : s % 2 === 0 ? 0xfbbf24 : 0xf59e0b,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / HOT_DROP_BEAM_SPARK_COUNT) * Math.PI * 2,
          radius: 1.2,
          speedY: 4.5,
          spin: 3.4,
          baseScale: 0.14,
        });
      }

      this.root.add(group);
      this.hotDropBeams.push({
        active: false,
        age: 0,
        duration: 1.25,
        group,
        outerBeamMesh,
        outerBeamMat,
        coreBeamMesh,
        coreBeamMat,
        groundRingMesh,
        groundRingMat,
        hexRingMesh,
        hexRingMat,
        sparks,
      });
    }

    // 55. Arc Lightning Bolt (jagged segmented cyan-white core + purple outer glow)
    for (let i = 0; i < ARC_LIGHTNING_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_arc_lightning';
      group.visible = false;

      const coreMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.98,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const glowMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flashMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );

      const coreSegments: THREE.Mesh[] = [];
      const glowSegments: THREE.Mesh[] = [];
      const segmentLengths: number[] = [];
      for (let s = 0; s < ARC_LIGHTNING_SEGMENT_COUNT; s++) {
        const glowMesh = new THREE.Mesh(this.unitCylinderGeo, glowMat);
        const coreMesh = new THREE.Mesh(this.unitCylinderGeo, coreMat);
        group.add(glowMesh);
        group.add(coreMesh);
        glowSegments.push(glowMesh);
        coreSegments.push(coreMesh);
        segmentLengths.push(1);
      }

      const originFlashMesh = new THREE.Mesh(this.unitSphereGeo, flashMat);
      const impactFlashMesh = new THREE.Mesh(this.unitSphereGeo, flashMat);
      group.add(originFlashMesh);
      group.add(impactFlashMesh);

      this.root.add(group);
      this.arcLightnings.push({
        active: false,
        age: 0,
        duration: 0.24,
        isChain: false,
        coreWidth: 0.058,
        glowWidth: 0.155,
        segmentLengths,
        group,
        coreSegments,
        glowSegments,
        coreMat,
        glowMat,
        originFlashMesh,
        impactFlashMesh,
        flashMat,
      });
    }

    // 56. Shadow Cloak Burst (expanding dark-violet mist ring + smoke wisps on enter/exit)
    for (let i = 0; i < SHADOW_CLOAK_BURST_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_shadow_cloak_burst';
      group.visible = false;

      const mistRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x4c1d95,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const mistRingMesh = new THREE.Mesh(this.unitRingGeo, mistRingMat);
      mistRingMesh.rotation.x = -Math.PI / 2;
      mistRingMesh.position.y = 0.08;
      group.add(mistRingMesh);

      const outerRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x7c3aed,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerRingMesh = new THREE.Mesh(this.hexRingGeo, outerRingMat);
      outerRingMesh.rotation.x = -Math.PI / 2;
      outerRingMesh.position.y = 0.85;
      group.add(outerRingMesh);

      const shroudMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x2e1065,
          transparent: true,
          opacity: 0.44,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const shroudMesh = new THREE.Mesh(this.unitSphereGeo, shroudMat);
      shroudMesh.position.y = 0.9;
      group.add(shroudMesh);

      const wisps: ShadowCloakWisp[] = [];
      for (let w = 0; w < SHADOW_CLOAK_WISP_COUNT; w++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: w % 3 === 0 ? 0x3b0764 : w % 2 === 0 ? 0x6d28d9 : 0xa855f7,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
          }),
        );
        const geo = w % 2 === 0 ? this.unitSphereGeo : this.unitCrystalGeo;
        const mesh = new THREE.Mesh(geo, material);
        group.add(mesh);
        wisps.push({
          mesh,
          material,
          angle: (w / SHADOW_CLOAK_WISP_COUNT) * Math.PI * 2,
          startRadius: 0.85,
          endRadius: 0.35,
          startY: 0.25,
          endY: 1.5,
          spin: 2.5,
          baseScale: 0.24,
        });
      }

      this.root.add(group);
      this.shadowCloakBursts.push({
        active: false,
        age: 0,
        duration: 0.62,
        entering: true,
        group,
        mistRingMesh,
        mistRingMat,
        outerRingMesh,
        outerRingMat,
        shroudMesh,
        shroudMat,
        wisps,
      });
    }

    // 57. Rune Monolith Attunement (rising violet-cyan arcane beam + rotating glyph ring)
    for (let i = 0; i < RUNE_ATTUNE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_rune_attune';
      group.visible = false;

      const outerBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x8b5cf6,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const outerBeamMesh = new THREE.Mesh(this.beamCylGeo, outerBeamMat);
      outerBeamMesh.position.y = 8;
      group.add(outerBeamMesh);

      const coreBeamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const coreBeamMesh = new THREE.Mesh(this.beamCylGeo, coreBeamMat);
      coreBeamMesh.position.y = 8;
      group.add(coreBeamMesh);

      const glyphRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xc084fc,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const glyphRingMesh = new THREE.Mesh(this.hexRingGeo, glyphRingMat);
      glyphRingMesh.rotation.x = -Math.PI / 2;
      glyphRingMesh.position.y = 0.2;
      group.add(glyphRingMesh);

      const groundRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      const groundRingMesh = new THREE.Mesh(this.unitRingGeo, groundRingMat);
      groundRingMesh.rotation.x = -Math.PI / 2;
      groundRingMesh.position.y = 0.08;
      group.add(groundRingMesh);

      const sparks: RuneAttuneSpark[] = [];
      for (let s = 0; s < RUNE_ATTUNE_SPARK_COUNT; s++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: s % 3 === 0 ? 0x22d3ee : s % 2 === 0 ? 0xc084fc : 0xa855f7,
            transparent: true,
            opacity: 0.94,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(this.unitCrystalGeo, material);
        group.add(mesh);
        sparks.push({
          mesh,
          material,
          angle: (s / RUNE_ATTUNE_SPARK_COUNT) * Math.PI * 2,
          radius: 1.0,
          speedY: 4.0,
          spin: 3.2,
          baseScale: 0.14,
        });
      }

      this.root.add(group);
      this.runeAttunes.push({
        active: false,
        age: 0,
        duration: 1.15,
        group,
        outerBeamMesh,
        outerBeamMat,
        coreBeamMesh,
        coreBeamMat,
        glyphRingMesh,
        glyphRingMat,
        groundRingMesh,
        groundRingMat,
        sparks,
      });
    }

    // 58. Storm Choppa Rotor Wash (expanding low-altitude translucent dust/air ring + motes)
    for (let i = 0; i < CHOPPA_WASH_POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.name = 'vfx_choppa_wash';
      group.visible = false;

      const outerDustRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xcbd5e1,
          transparent: true,
          opacity: 0.56,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const outerDustRingMesh = new THREE.Mesh(this.unitRingGeo, outerDustRingMat);
      outerDustRingMesh.rotation.x = -Math.PI / 2;
      outerDustRingMesh.position.y = 0.06;
      group.add(outerDustRingMesh);

      const innerAirRingMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const innerAirRingMesh = new THREE.Mesh(this.unitRingGeo, innerAirRingMat);
      innerAirRingMesh.rotation.x = -Math.PI / 2;
      innerAirRingMesh.position.y = 0.12;
      group.add(innerAirRingMesh);

      const motes: ChoppaWashMote[] = [];
      for (let m = 0; m < CHOPPA_WASH_MOTE_COUNT; m++) {
        const material = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: m % 3 === 0 ? 0xe2e8f0 : m % 2 === 0 ? 0xd6d3d1 : 0xcbd5e1,
            transparent: true,
            opacity: 0.46,
            depthWrite: false,
          }),
        );
        const mesh = new THREE.Mesh(this.unitSphereGeo, material);
        group.add(mesh);
        motes.push({
          mesh,
          material,
          vx: 0,
          vy: 0,
          vz: 0,
          baseScale: 0.38,
        });
      }

      this.root.add(group);
      this.choppaWashes.push({
        active: false,
        age: 0,
        duration: 0.52,
        intensity: 1,
        group,
        outerDustRingMesh,
        outerDustRingMat,
        innerAirRingMesh,
        innerAirRingMat,
        motes,
      });
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
      this.eventBus.on('vfx:kinetic_dash', (e) => this.spawnKineticDash(e.from, e.to)),
      this.eventBus.on('vfx:gold_burst', (e) => this.spawnGoldBurst(e.position, e.amount)),
      this.eventBus.on('vfx:loot_island_rift', (e) => this.spawnLootIslandRift(e.position)),
      this.eventBus.on('vfx:bow_explosion', (e) => this.spawnBowExplosion(e.position, e.radius)),
      this.eventBus.on('vfx:slurp_tanker_burst', (e) =>
        this.spawnSlurpTankerBurst(e.position, e.radius),
      ),
      this.eventBus.on('vfx:crown_glint', (e) => this.spawnCrownGlint(e.position)),
      this.eventBus.on('vfx:revive_beam', (e) => this.spawnReviveBeam(e.position, e.progress)),
      this.eventBus.on('vfx:railgun_beam', (e) => this.spawnRailgunBeam(e.from, e.to, e.pierced)),
      this.eventBus.on('vfx:rail_sparks', (e) => this.spawnRailSparks(e.position, e.velocity)),
      this.eventBus.on('vfx:trap_trigger', (e) => this.spawnTrapTrigger(e.position, e.kind)),
      this.eventBus.on('vfx:drone_explode', (e) => this.spawnDroneExplode(e.position, e.rarity)),
      this.eventBus.on('vfx:reboot_beam', (e) => this.spawnRebootBeam(e.position, e.progress)),
      this.eventBus.on('vfx:bunker_deploy', (e) => this.spawnBunkerDeploy(e.position)),
      this.eventBus.on('vfx:emp_blast', (e) => this.spawnEmpBlast(e.position, e.radius)),
      this.eventBus.on('vfx:weapon_mod', (e) => this.spawnWeaponMod(e.position, e.modId)),
      this.eventBus.on('vfx:forecast_pulse', (e) => this.spawnForecastPulse(e.position)),
      this.eventBus.on('vfx:jetpack_flame', (e) =>
        this.spawnJetpackFlame(e.position, e.direction, e.intensity),
      ),
      this.eventBus.on('vfx:flame_stream', (e) =>
        this.spawnFlameStream(e.origin, e.direction, e.range),
      ),
      this.eventBus.on('vfx:meteor_strike', (e) => this.spawnMeteorStrike(e.position, e.radius)),
      this.eventBus.on('vfx:hop_crystal_aura', (e) => this.spawnHopCrystalAura(e.position)),
      this.eventBus.on('vfx:hammer_slam', (e) => this.spawnHammerSlam(e.position, e.radius)),
      this.eventBus.on('vfx:hammer_bounce', (e) => this.spawnHammerBounce(e.position)),
      this.eventBus.on('vfx:flare_trail', (e) =>
        this.spawnFlareTrail(e.origin, e.target, e.radius),
      ),
      this.eventBus.on('vfx:water_wake', (e) => this.spawnWaterWake(e.position, e.yaw, e.speed)),
      this.eventBus.on('vfx:turret_deploy', (e) => this.spawnTurretDeploy(e.position)),
      this.eventBus.on('vfx:turret_laser', (e) => this.spawnTurretLaser(e.from, e.to)),
      this.eventBus.on('vfx:slurp_orb', (e) => this.spawnSlurpOrb(e.position, e.radius)),
      this.eventBus.on('vfx:fishing_splash', (e) => this.spawnFishingSplash(e.position)),
      this.eventBus.on('vfx:tank_shell', (e) =>
        this.spawnTankShell(e.origin, e.target, e.radius),
      ),
      this.eventBus.on('vfx:shield_ricochet', (e) =>
        this.spawnShieldRicochet(e.position, e.normal),
      ),
      this.eventBus.on('vfx:c4_blast', (e) => this.spawnC4Blast(e.position, e.radius)),
      this.eventBus.on('vfx:hot_drop_beam', (e) => this.spawnHotDropBeam(e.position)),
      this.eventBus.on('vfx:arc_lightning', (e) =>
        this.spawnArcLightning(e.from, e.to, e.isChain),
      ),
      this.eventBus.on('vfx:shadow_cloak_burst', (e) =>
        this.spawnShadowCloakBurst(e.position, e.entering),
      ),
      this.eventBus.on('vfx:rune_attune', (e) => this.spawnRuneAttune(e.position)),
      this.eventBus.on('vfx:choppa_wash', (e) => this.spawnChoppaWash(e.position, e.intensity)),
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
    if (this.disposed || !isFiniteVec3(from) || !isFiniteVec3(to)) return;

    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const len = this.tmpDir.length();
    if (!Number.isFinite(len) || len < 1e-4) return;

    const slot = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % TRACER_POOL_SIZE;

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
    if (this.disposed || !isFiniteVec3(position)) return;

    const safeDir: Vec3Like = isFiniteVec3(direction) ? direction : { x: 0, y: 0, z: 1 };
    const slot = this.muzzles[this.muzzleCursor];
    this.muzzleCursor = (this.muzzleCursor + 1) % MUZZLE_POOL_SIZE;

    let scale = 1.0;
    let color = 0xffd166;
    if (weaponId === 'rocket_launcher') {
      scale = 1.85;
      color = 0xf97316;
    } else if (weaponId === 'railgun') {
      scale = 1.65;
      color = 0xa855f7;
    } else if (weaponId === 'minigun') {
      scale = 1.25;
      color = 0xfb923c;
    } else if (weaponId === 'plasma_flamethrower') {
      scale = 1.45;
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
    } else if (weaponId === 'tactical_dmr') {
      scale = 1.15;
      color = 0x22d3ee;
    } else if (weaponId === 'mythic_blade_rifle') {
      scale = 1.35;
      color = 0x22d3ee;
    } else if (weaponId === 'grappler') {
      scale = 1.05;
      color = 0x22d3ee;
    } else if (weaponId === 'combat_smg') {
      scale = 0.88;
      color = 0xfbbf24;
    } else if (weaponId === 'boom_bow') {
      scale = 0.95;
      color = 0xf97316;
    } else if (weaponId === 'flare_gun') {
      scale = 1.18;
      color = 0xf97316;
    } else if (weaponId === 'chug_cannon') {
      scale = 1.55;
      color = 0x22d3ee;
    } else if (weaponId === 'auto_turret') {
      scale = 0.9;
      color = 0x38bdf8;
    } else if (weaponId === 'ballistic_shield') {
      scale = 0.85;
      color = 0xfbbf24;
    } else if (weaponId === 'remote_c4') {
      scale = 0.85;
      color = 0xef4444;
    } else if (weaponId === 'storm_breaker') {
      scale = 1.4;
      color = 0x38bdf8;
    } else if (weaponId === 'shadow_cloak') {
      scale = 0.9;
      color = 0xa855f7;
    } else if (weaponId === 'smg' || weaponId === 'pistol') {
      scale = 0.78;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.065;
    slot.baseScale = scale;

    slot.group.position.set(position.x, position.y, position.z);
    this.orientToDirection(slot.group, safeDir, this.zAxis);
    slot.group.rotateZ(this.nextRand() * Math.PI);
    slot.group.scale.setScalar(scale);
    slot.material.color.setHex(color);
    slot.material.opacity = 0.95;
    slot.group.visible = true;

    // Eject spinning brass casing or shotgun shell for bullet/shell firearms (not arrows, railgun slugs, plasma flamethrower, or Tesla arc rifle)
    const ammoType = WEAPONS[weaponId]?.ammoType;
    if (
      weaponId !== 'boom_bow' &&
      weaponId !== 'railgun' &&
      weaponId !== 'plasma_flamethrower' &&
      weaponId !== 'storm_breaker' &&
      (ammoType === 'light' ||
        ammoType === 'medium' ||
        ammoType === 'heavy' ||
        ammoType === 'shells')
    ) {
      this.spawnCasing(position, safeDir, ammoType);
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
    if (this.disposed || !isFiniteVec3(position)) return;

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
    if (this.disposed || !isFiniteVec3(position)) return;

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
    if (this.disposed || !isFiniteVec3(position)) return;

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
    if (this.disposed || !isFiniteVec3(position)) return;

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
    if (this.disposed || !isFiniteVec3(position)) return;

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
    if (this.disposed || !isFiniteVec3(position)) return;

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
    if (this.disposed || !isFiniteVec3(position)) return;

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

    if (!isFiniteVec3(position)) return;
    const safeNormal: Vec3Like = isFiniteVec3(normal) ? normal : { x: 0, y: 0, z: 1 };

    if (!slot) {
      slot = this.weakpoints.find((w) => !w.active) ?? this.weakpoints[0];
    }

    slot.active = true;
    slot.propId = propId;
    slot.age = 0;

    this.tmpDir.set(safeNormal.x, safeNormal.y, safeNormal.z);
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

    // 24. Kinetic Dash (sweeping cyan-violet plasma katana crescent + dash speed streaks)
    for (let i = 0; i < KINETIC_DASH_POOL_SIZE; i++) {
      const kd = this.kineticDashes[i];
      if (!kd.active) continue;
      kd.age += safeDt;
      const t = kd.age / kd.duration;
      if (t >= 1) {
        kd.active = false;
        kd.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const len = kd.dashLength;

      const trailWidth = Math.max(0.02, 0.28 * (1 - 0.68 * t));
      kd.trailMesh.scale.set(trailWidth, len, trailWidth);
      kd.trailMat.opacity = 0.72 * fade;

      const coreWidth = Math.max(0.01, 0.11 * (1 - 0.75 * t));
      kd.coreTrailMesh.scale.set(coreWidth, len, coreWidth);
      kd.coreTrailMat.opacity = 0.9 * fade;

      kd.originRingMesh.scale.setScalar(0.55 + 1.85 * easeOut);
      kd.originRingMat.opacity = 0.92 * fade * fade;

      kd.crescentGroup.position.set(0, 0, len * (0.48 + 0.42 * easeOut));
      kd.crescentGroup.rotation.set(0.42, 0.15, -0.85 + t * 2.15);
      kd.crescentGroup.scale.setScalar(0.85 + 0.75 * easeOut);
      kd.innerArcMat.opacity = 0.96 * fade;
      kd.outerArcMat.opacity = 0.88 * fade;
      kd.coreArcMat.opacity = 0.95 * fade * fade;

      for (let s = 0; s < KINETIC_DASH_STREAK_COUNT; s++) {
        const st = kd.streaks[s];
        const zPos = clamp(st.progress + 0.25 * easeOut, 0.08, 0.95) * len;
        st.mesh.position.set(st.radialX * (1 + 0.35 * t), st.radialY * (1 + 0.35 * t), zPos);
        const w = Math.max(0.008, st.width * (1 - 0.7 * t));
        st.mesh.scale.set(w, Math.max(0.25, len * st.lengthFrac), w);
        st.material.opacity = 0.92 * fade;
      }
    }

    // 25. Gold Burst (fountain of shiny spinning golden bars tumbling with gravity)
    for (let i = 0; i < GOLD_BURST_POOL_SIZE; i++) {
      const gb = this.goldBursts[i];
      if (!gb.active) continue;
      gb.age += safeDt;
      const t = gb.age / gb.duration;
      if (t >= 1) {
        gb.active = false;
        gb.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      gb.ringMesh.scale.setScalar(0.4 + 2.6 * easeOut);
      gb.ringMat.opacity = 0.9 * fade * fade;

      const glowScale = Math.max(0.05, (1.1 - t * 0.9) * (1 + 0.25 * Math.sin(gb.age * 14)));
      gb.glowMesh.scale.setScalar(glowScale);
      gb.glowMat.opacity = 0.85 * fade * fade;

      const barFade = t > 0.72 ? clamp((1 - t) / 0.28, 0, 1) : 1;
      for (let b = 0; b < gb.activeCount; b++) {
        const bar = gb.bars[b];
        bar.vy -= 15.5 * safeDt;
        bar.mesh.position.x += bar.vx * safeDt;
        bar.mesh.position.y += bar.vy * safeDt;
        bar.mesh.position.z += bar.vz * safeDt;
        if (bar.mesh.position.y < -0.15) {
          bar.mesh.position.y = -0.15;
          bar.vy = Math.abs(bar.vy) * 0.42;
          bar.vx *= 0.78;
          bar.vz *= 0.78;
        }
        bar.mesh.rotation.x += bar.rx * safeDt;
        bar.mesh.rotation.y += bar.ry * safeDt;
        bar.mesh.rotation.z += bar.rz * safeDt;
        bar.mesh.scale.setScalar(bar.baseScale * (0.35 + 0.65 * barFade));
        bar.material.opacity = barFade;
      }
    }

    // 26. Loot Island Rift (huge spatial sky-crack shockwave ring + rising light spire)
    for (let i = 0; i < LOOT_ISLAND_RIFT_POOL_SIZE; i++) {
      const lr = this.lootIslandRifts[i];
      if (!lr.active) continue;
      lr.age += safeDt;
      const t = lr.age / lr.duration;
      if (t >= 1) {
        lr.active = false;
        lr.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const pop = clamp(lr.age / 0.22, 0, 1);

      lr.outerRingMesh.scale.setScalar(2.5 + 28.0 * easeOut);
      lr.outerRingMat.opacity = 0.95 * fade;

      lr.violetRingMesh.rotation.z += 1.4 * safeDt;
      lr.violetRingMesh.scale.setScalar(1.8 + 20.5 * easeOut);
      lr.violetRingMat.opacity = 0.9 * fade;

      const spireHeight = 46 * pop;
      const spireWidth = 2.6 * (1 - 0.55 * t) * (1 + 0.1 * Math.sin(lr.age * 11));
      lr.spireOuterMesh.position.y = spireHeight * 0.5;
      lr.spireOuterMesh.scale.set(spireWidth, Math.max(0.5, spireHeight), spireWidth);
      lr.spireOuterMat.opacity = 0.48 * fade;

      const coreHeight = 54 * pop;
      const coreWidth = 0.9 * (1 - 0.55 * t);
      lr.spireCoreMesh.position.y = coreHeight * 0.5;
      lr.spireCoreMesh.scale.set(coreWidth, Math.max(0.5, coreHeight), coreWidth);
      lr.spireCoreMat.opacity = 0.88 * fade;

      const coreScale = 3.2 + 4.5 * Math.sin(t * Math.PI);
      lr.coreSphereMesh.scale.setScalar(coreScale);
      lr.coreSphereMat.opacity = 0.9 * fade * fade;

      for (let s = 0; s < LOOT_ISLAND_SHARD_COUNT; s++) {
        const sh = lr.shards[s];
        const ang = sh.angle + lr.age * (s % 2 === 0 ? 1.5 : -1.5);
        const rad = sh.radius * (0.65 + 2.4 * easeOut);
        sh.mesh.position.set(
          Math.cos(ang) * rad,
          sh.yOffset + 2.2 * t,
          Math.sin(ang) * rad,
        );
        sh.mesh.rotation.y += 3.2 * safeDt;
        sh.mesh.scale.set(
          sh.baseScale * 0.65 * (1 - 0.45 * t),
          sh.baseScale * 2.1 * (1 - 0.35 * t),
          sh.baseScale * 0.65 * (1 - 0.45 * t),
        );
        sh.material.opacity = 0.95 * fade;
      }
    }

    // 27. Boom Bow Explosion
    for (let i = 0; i < BOW_EXPLOSION_POOL_SIZE; i++) {
      const be = this.bowExplosions[i];
      if (!be.active) continue;
      be.age += safeDt;
      const t = be.age / be.duration;
      if (t >= 1) {
        be.active = false;
        be.group.visible = false;
        continue;
      }

      const expand = 1 - Math.pow(1 - Math.min(1, t * 2.5), 2);
      const fade = 1 - t;

      be.coreMesh.scale.setScalar(be.radius * 0.62 * expand);
      be.coreMat.opacity = Math.max(0, 1 - t * 1.55);

      be.blastMesh.scale.setScalar(be.radius * 1.15 * expand);
      be.blastMat.opacity = 0.82 * fade;

      be.ringMesh.scale.setScalar(be.radius * (0.35 + 1.45 * expand));
      be.ringMat.opacity = 0.92 * fade;

      be.tiltRingMesh.rotation.y += 4.5 * safeDt;
      be.tiltRingMesh.scale.setScalar(be.radius * (0.28 + 1.25 * expand));
      be.tiltRingMat.opacity = 0.85 * fade * fade;

      for (let s = 0; s < BOW_EXPLOSION_SPARK_COUNT; s++) {
        const sp = be.sparks[s];
        sp.vy -= 13.5 * safeDt;
        sp.mesh.position.x += sp.vx * safeDt;
        sp.mesh.position.y += sp.vy * safeDt;
        sp.mesh.position.z += sp.vz * safeDt;
        sp.mesh.rotation.x += 9 * safeDt;
        sp.mesh.rotation.y += 7 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * fade);
        sp.material.opacity = fade;
      }
    }

    // 28. Slurp Tanker Burst
    for (let i = 0; i < SLURP_TANKER_BURST_POOL_SIZE; i++) {
      const st = this.slurpTankerBursts[i];
      if (!st.active) continue;
      st.age += safeDt;
      const t = st.age / st.duration;
      if (t >= 1) {
        st.active = false;
        st.group.visible = false;
        continue;
      }

      const expand = 1 - Math.pow(1 - Math.min(1, t * 1.65), 2);
      const fade = 1 - t;

      st.domeMesh.scale.set(
        st.radius * (0.35 + 0.72 * expand),
        st.radius * (0.32 + 0.58 * expand),
        st.radius * (0.35 + 0.72 * expand),
      );
      st.domeMat.opacity = 0.42 * fade;

      st.innerDomeMesh.scale.setScalar(st.radius * (0.25 + 0.52 * expand));
      st.innerDomeMat.opacity = 0.56 * fade * fade;

      st.outerRingMesh.scale.setScalar(st.radius * (0.35 + 1.05 * expand));
      st.outerRingMat.opacity = 0.92 * fade;

      st.limeRingMesh.scale.setScalar(st.radius * (0.25 + 0.85 * expand));
      st.limeRingMat.opacity = 0.85 * fade;

      const geyserH = st.radius * (0.6 + 0.85 * Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.5));
      const geyserW = st.radius * 0.24 * (1 - 0.55 * t);
      st.geyserMesh.position.y = geyserH * 0.5;
      st.geyserMesh.scale.set(Math.max(0.2, geyserW), Math.max(0.4, geyserH), Math.max(0.2, geyserW));
      st.geyserMat.opacity = 0.52 * fade;

      for (let d = 0; d < SLURP_TANKER_DROPLET_COUNT; d++) {
        const dr = st.droplets[d];
        dr.vy -= 9.2 * safeDt;
        dr.mesh.position.x += dr.vx * safeDt;
        dr.mesh.position.y = Math.max(0.05, dr.mesh.position.y + dr.vy * safeDt);
        dr.mesh.position.z += dr.vz * safeDt;
        dr.mesh.rotation.y += 5 * safeDt;
        dr.mesh.scale.setScalar(dr.baseScale * (1 - 0.45 * t));
        dr.material.opacity = fade;
      }
    }

    // 29. Crown Glint
    for (let i = 0; i < CROWN_GLINT_POOL_SIZE; i++) {
      const cg = this.crownGlints[i];
      if (!cg.active) continue;
      cg.age += safeDt;
      const t = cg.age / cg.duration;
      if (t >= 1) {
        cg.active = false;
        cg.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const pulse = Math.sin(t * Math.PI);
      const fade = 1 - t;

      cg.flareGroup.position.y = 2.08 + 0.32 * t;
      cg.flareGroup.rotation.y += 3.6 * safeDt;
      cg.flareGroup.scale.setScalar(0.55 + 0.95 * pulse);
      cg.flareMat.opacity = 0.98 * fade;

      cg.ringMesh.position.y = 1.98 + 0.35 * easeOut;
      cg.ringMesh.scale.setScalar(0.28 + 0.85 * easeOut);
      cg.ringMat.opacity = 0.9 * fade;

      for (let s = 0; s < CROWN_GLINT_SPARK_COUNT; s++) {
        const sp = cg.sparks[s];
        const ang = sp.angle + cg.age * 3.8;
        const rad = sp.radius * (1 + 0.55 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 6 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.5 * t));
        sp.material.opacity = fade;
      }
    }

    // 30. Revive Beam
    for (let i = 0; i < REVIVE_BEAM_POOL_SIZE; i++) {
      const rb = this.reviveBeams[i];
      if (!rb.active) continue;
      rb.age += safeDt;
      const t = rb.age / rb.duration;
      if (t >= 1) {
        rb.active = false;
        rb.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      const pulse = 1 + 0.1 * Math.sin(rb.age * 10);
      const beamW = (0.52 + 0.28 * rb.progress) * pulse;
      rb.outerBeamMesh.scale.set(beamW, 3.2, beamW);
      rb.outerBeamMat.opacity = (0.28 + 0.16 * rb.progress) * fade;

      rb.coreBeamMesh.scale.set(0.18 + 0.1 * rb.progress, 3.5, 0.18 + 0.1 * rb.progress);
      rb.coreBeamMat.opacity = 0.72 * fade;

      rb.baseRingMesh.scale.setScalar((0.65 + 0.85 * rb.progress) * pulse);
      rb.baseRingMat.opacity = 0.92 * fade;

      const riseFrac = (rb.age * 2.2) % 1;
      rb.pulseRingMesh.position.y = 0.1 + riseFrac * 2.2;
      rb.pulseRingMesh.scale.setScalar(0.55 + 0.55 * (1 - riseFrac));
      rb.pulseRingMat.opacity = 0.88 * (1 - riseFrac) * fade;

      for (let s = 0; s < REVIVE_BEAM_SPARK_COUNT; s++) {
        const sp = rb.sparks[s];
        const ang = sp.angle + rb.age * 3.4;
        sp.mesh.position.x = Math.cos(ang) * sp.radius;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * sp.radius;
        sp.mesh.rotation.y += 5 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.45 * t));
        sp.material.opacity = fade;
      }
    }

    // 31. Pulse Railgun Beam
    for (let i = 0; i < RAILGUN_BEAM_POOL_SIZE; i++) {
      const rg = this.railgunBeams[i];
      if (!rg.active) continue;
      rg.age += safeDt;
      const t = rg.age / rg.duration;
      if (t >= 1) {
        rg.active = false;
        rg.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      const shrink = 1 - 0.65 * t;
      const pierceBoost = rg.pierced ? 1.45 : 1.0;

      rg.outerBeamMesh.scale.set(0.16 * shrink * pierceBoost, rg.beamLength, 0.16 * shrink * pierceBoost);
      rg.outerBeamMat.opacity = 0.72 * fade;

      rg.coreBeamMesh.scale.set(0.065 * (1 - 0.75 * t), rg.beamLength, 0.065 * (1 - 0.75 * t));
      rg.coreBeamMat.opacity = 0.96 * fade;

      rg.violetHaloMesh.scale.set(0.26 * shrink * pierceBoost, rg.beamLength, 0.26 * shrink * pierceBoost);
      rg.violetHaloMat.opacity = (rg.pierced ? 0.68 : 0.42) * fade * fade;

      const easeOut = 1 - Math.pow(1 - t, 3);
      rg.impactRingMesh.scale.setScalar((0.35 + 1.45 * easeOut) * pierceBoost);
      rg.impactRingMat.opacity = 0.92 * fade;

      for (let r = 0; r < RAILGUN_BEAM_RING_COUNT; r++) {
        const ring = rg.rings[r];
        const ringZ = clamp(ring.frac + 0.12 * t, 0.04, 0.98) * rg.beamLength;
        ring.mesh.position.z = ringZ;
        ring.mesh.rotation.z += (r % 2 === 0 ? 5.5 : -5.5) * safeDt;
        ring.mesh.scale.setScalar((0.28 + 0.72 * easeOut) * pierceBoost);
        ring.material.opacity = 0.9 * fade;
      }
    }

    // 32. Grind Rail Sparks
    for (let i = 0; i < RAIL_SPARKS_POOL_SIZE; i++) {
      const rs = this.railSparks[i];
      if (!rs.active) continue;
      rs.age += safeDt;
      const t = rs.age / rs.duration;
      if (t >= 1) {
        rs.active = false;
        rs.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      rs.glowMesh.scale.setScalar(0.28 * (1 - 0.6 * t));
      rs.glowMat.opacity = 0.9 * fade * fade;

      for (let s = 0; s < RAIL_SPARK_PARTICLE_COUNT; s++) {
        const sp = rs.sparks[s];
        sp.vy -= 12.5 * safeDt;
        sp.mesh.position.x += sp.vx * safeDt;
        sp.mesh.position.y += sp.vy * safeDt;
        sp.mesh.position.z += sp.vz * safeDt;
        sp.mesh.rotation.x += sp.rx * safeDt;
        sp.mesh.rotation.y += sp.ry * safeDt;
        sp.mesh.scale.set(
          sp.baseScale * 0.65 * fade,
          sp.baseScale * 0.65 * fade,
          sp.baseScale * 2.1 * fade,
        );
        sp.material.opacity = fade;
      }
    }

    // 33. Tactical Trap Triggers (spike_trap / bouncer_pad)
    for (let i = 0; i < TRAP_TRIGGER_POOL_SIZE; i++) {
      const tt = this.trapTriggers[i];
      if (!tt.active) continue;
      tt.age += safeDt;
      const t = tt.age / tt.duration;
      if (t >= 1) {
        tt.active = false;
        tt.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      tt.baseRingMesh.scale.setScalar(0.55 + 2.1 * easeOut);
      tt.baseRingMat.opacity = 0.92 * fade;

      if (tt.kind === 'spike_trap') {
        tt.pulseRingMesh.position.y = 0.18 + 0.6 * easeOut;
        tt.pulseRingMesh.scale.setScalar(0.45 + 1.35 * easeOut);
        tt.pulseRingMat.opacity = 0.85 * fade * fade;

        // Sharp upward spike thrust followed by snap retraction
        const spikeLift = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
        const spikeHeight = Math.max(0.1, 1.15 * spikeLift);
        tt.spikeMat.opacity = clamp(0.95 * (1 - Math.max(0, (t - 0.65) / 0.35)), 0, 1);
        for (let s = 0; s < TRAP_TRIGGER_SPIKE_COUNT; s++) {
          const sp = tt.spikes[s];
          sp.position.y = spikeHeight * 0.5;
          sp.scale.set(0.14, spikeHeight, 0.14);
        }
      } else {
        tt.pulseRingMesh.position.y = 0.1 + 2.8 * easeOut;
        tt.pulseRingMesh.scale.setScalar(0.75 + 1.65 * easeOut);
        tt.pulseRingMat.opacity = 0.9 * fade;

        const colH = 2.6 * (0.4 + 0.6 * easeOut);
        const colW = 1.25 * (1 - 0.45 * t);
        tt.columnMesh.position.y = colH * 0.5;
        tt.columnMesh.scale.set(colW, colH, colW);
        tt.columnMat.opacity = 0.48 * fade;
      }

      for (let m = 0; m < TRAP_TRIGGER_MOTE_COUNT; m++) {
        const mt = tt.motes[m];
        if (tt.kind === 'spike_trap') {
          mt.vy -= 10.0 * safeDt;
        }
        mt.mesh.position.x += mt.vx * safeDt;
        mt.mesh.position.y += mt.vy * safeDt;
        mt.mesh.position.z += mt.vz * safeDt;
        mt.mesh.rotation.y += 6 * safeDt;
        mt.mesh.scale.setScalar(mt.baseScale * fade);
        mt.material.opacity = fade;
      }
    }

    // 34. Supply Drone Explode
    for (let i = 0; i < DRONE_EXPLODE_POOL_SIZE; i++) {
      const de = this.droneExplodes[i];
      if (!de.active) continue;
      de.age += safeDt;
      const t = de.age / de.duration;
      if (t >= 1) {
        de.active = false;
        de.group.visible = false;
        continue;
      }

      const expand = 1 - Math.pow(1 - Math.min(1, t * 2.4), 2);
      const fade = 1 - t;

      de.coreMesh.scale.setScalar(1.35 * expand);
      de.coreMat.opacity = Math.max(0, 1 - t * 1.6);

      de.outerMesh.scale.setScalar(2.4 * expand);
      de.outerMat.opacity = 0.78 * fade;

      de.ringMesh.scale.setScalar(0.65 + 2.6 * expand);
      de.ringMat.opacity = 0.92 * fade;

      de.tiltRingMesh.rotation.y += 4.8 * safeDt;
      de.tiltRingMesh.scale.setScalar(0.45 + 2.1 * expand);
      de.tiltRingMat.opacity = 0.86 * fade * fade;

      for (let s = 0; s < DRONE_EXPLODE_SHARD_COUNT; s++) {
        const sh = de.shards[s];
        sh.vy -= (sh.isHullDebris ? 13.5 : 6.5) * safeDt;
        sh.mesh.position.x += sh.vx * safeDt;
        sh.mesh.position.y += sh.vy * safeDt;
        sh.mesh.position.z += sh.vz * safeDt;
        sh.mesh.rotation.x += sh.rx * safeDt;
        sh.mesh.rotation.y += sh.ry * safeDt;
        sh.mesh.scale.setScalar(sh.baseScale * (1 - 0.55 * t));
        sh.material.opacity = fade;
      }
    }

    // 35. Reboot Van Skyward Beam
    for (let i = 0; i < REBOOT_BEAM_POOL_SIZE; i++) {
      const rb = this.rebootBeams[i];
      if (!rb.active) continue;
      rb.age += safeDt;
      const t = rb.age / rb.duration;
      if (t >= 1) {
        rb.active = false;
        rb.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      const pulse = 1 + 0.1 * Math.sin(rb.age * 11);
      const beamW = (0.75 + 0.45 * rb.progress) * pulse;
      rb.outerBeamMesh.scale.set(beamW, 18, beamW);
      rb.outerBeamMat.opacity = (0.30 + 0.20 * rb.progress) * fade;

      const coreW = 0.22 + 0.14 * rb.progress;
      rb.coreBeamMesh.scale.set(coreW, 22, coreW);
      rb.coreBeamMat.opacity = (0.65 + 0.25 * rb.progress) * fade;

      rb.baseRingMesh.scale.setScalar((0.95 + 1.15 * rb.progress) * pulse);
      rb.baseRingMat.opacity = 0.94 * fade;

      const riseFrac = (rb.age * 1.9) % 1;
      rb.pulseRingMesh.position.y = 0.2 + riseFrac * 6.5;
      rb.pulseRingMesh.scale.setScalar(0.85 + 0.85 * (1 - riseFrac));
      rb.pulseRingMat.opacity = 0.9 * (1 - riseFrac) * fade;

      for (let s = 0; s < REBOOT_BEAM_SPARK_COUNT; s++) {
        const sp = rb.sparks[s];
        const ang = sp.angle + rb.age * 3.6;
        sp.mesh.position.x = Math.cos(ang) * sp.radius;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * sp.radius;
        sp.mesh.rotation.y += 5.5 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.45 * t));
        sp.material.opacity = fade;
      }
    }

    // 36. Port-A-Bunker Deploy
    for (let i = 0; i < BUNKER_DEPLOY_POOL_SIZE; i++) {
      const bd = this.bunkerDeploys[i];
      if (!bd.active) continue;
      bd.age += safeDt;
      const t = bd.age / bd.duration;
      if (t >= 1) {
        bd.active = false;
        bd.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      bd.baseSquareMesh.scale.setScalar(0.8 + 4.4 * easeOut);
      bd.baseSquareMat.opacity = 0.94 * fade;

      const cubeW = 1.2 + 3.1 * easeOut;
      const cubeH = 0.4 + 2.9 * easeOut;
      bd.holoFrameMesh.position.y = cubeH * 0.5;
      bd.holoFrameMesh.scale.set(cubeW, cubeH, cubeW);
      bd.holoFrameMat.opacity = 0.85 * fade;

      bd.shellMesh.position.y = cubeH * 0.5;
      bd.shellMesh.scale.set(cubeW * 0.98, cubeH * 0.98, cubeW * 0.98);
      bd.shellMat.opacity = 0.28 * fade * fade;

      for (let s = 0; s < BUNKER_DEPLOY_SPARK_COUNT; s++) {
        const sp = bd.sparks[s];
        const ang = sp.angle + bd.age * 2.4;
        const rad = sp.radius * (0.45 + 0.75 * easeOut);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 5 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.5 * t));
        sp.material.opacity = 0.96 * fade;
      }
    }

    // 37. Shield-Breaker EMP Blast
    for (let i = 0; i < EMP_BLAST_POOL_SIZE; i++) {
      const eb = this.empBlasts[i];
      if (!eb.active) continue;
      eb.age += safeDt;
      const t = eb.age / eb.duration;
      if (t >= 1) {
        eb.active = false;
        eb.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      eb.coreMesh.scale.setScalar(eb.radius * 0.42 * (0.4 + 0.85 * easeOut));
      eb.coreMat.opacity = Math.max(0, 0.96 * (1 - t * 1.5));

      const domeR = eb.radius * (0.28 + 0.76 * easeOut);
      eb.domeMesh.scale.setScalar(domeR);
      eb.domeMesh.rotation.y += 2.6 * safeDt;
      eb.domeMat.opacity = 0.82 * fade;

      eb.outerRingMesh.scale.setScalar(eb.radius * (0.24 + 0.92 * easeOut));
      eb.outerRingMat.opacity = 0.95 * fade;

      eb.tiltRingMesh.rotation.y -= 4.8 * safeDt;
      eb.tiltRingMesh.scale.setScalar(eb.radius * (0.22 + 0.86 * easeOut));
      eb.tiltRingMat.opacity = 0.88 * fade * fade;

      for (let a = 0; a < EMP_BLAST_ARC_COUNT; a++) {
        const arc = eb.arcs[a];
        arc.mesh.position.x += arc.vx * safeDt;
        arc.mesh.position.y = Math.max(0.05, arc.mesh.position.y + arc.vy * safeDt);
        arc.mesh.position.z += arc.vz * safeDt;
        arc.mesh.rotation.x += arc.rx * safeDt;
        arc.mesh.rotation.y += arc.ry * safeDt;
        const sc = arc.baseScale * (1 - 0.45 * t);
        arc.mesh.scale.set(sc * 0.65, sc * 2.2, sc * 0.65);
        arc.material.opacity = fade;
      }
    }

    // 38. Weapon Mod Install Burst
    for (let i = 0; i < WEAPON_MOD_POOL_SIZE; i++) {
      const wm = this.weaponMods[i];
      if (!wm.active) continue;
      wm.age += safeDt;
      const t = wm.age / wm.duration;
      if (t >= 1) {
        wm.active = false;
        wm.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      wm.outerRingMesh.scale.setScalar(0.32 + 1.35 * easeOut);
      wm.outerRingMat.opacity = 0.94 * fade;

      wm.upperRingMesh.position.y = 0.1 + 1.15 * easeOut;
      wm.upperRingMesh.rotation.z += 4.8 * safeDt;
      wm.upperRingMesh.scale.setScalar(0.24 + 0.85 * easeOut);
      wm.upperRingMat.opacity = 0.9 * fade;

      wm.coreMesh.position.y = 0.35 + 0.45 * t;
      wm.coreMesh.rotation.y += 7 * safeDt;
      wm.coreMesh.scale.setScalar(0.26 * (1 - 0.5 * t));
      wm.coreMat.opacity = 0.95 * fade;

      for (let s = 0; s < WEAPON_MOD_SPARK_COUNT; s++) {
        const sp = wm.sparks[s];
        const ang = sp.angle + wm.age * sp.spin;
        const rad = sp.radius * (1 + 0.35 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 6 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.5 * t));
        sp.material.opacity = fade;
      }
    }

    // 39. Radar Weather Forecast Pulse
    for (let i = 0; i < FORECAST_PULSE_POOL_SIZE; i++) {
      const fp = this.forecastPulses[i];
      if (!fp.active) continue;
      fp.age += safeDt;
      const t = fp.age / fp.duration;
      if (t >= 1) {
        fp.active = false;
        fp.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const pop = clamp(fp.age / 0.18, 0, 1);

      const colH = 24 * pop;
      const colW = (1 - 0.55 * t) * (1 + 0.1 * Math.sin(fp.age * 12));
      fp.beaconMesh.position.y = colH * 0.5;
      fp.beaconMesh.scale.set(0.95 * colW, Math.max(0.2, colH), 0.95 * colW);
      fp.beaconMat.opacity = 0.44 * fade;

      fp.coreBeamMesh.position.y = colH * 0.55;
      fp.coreBeamMesh.scale.set(0.28 * colW, Math.max(0.2, colH * 1.1), 0.28 * colW);
      fp.coreBeamMat.opacity = 0.78 * fade;

      fp.groundRingMesh.scale.setScalar(0.8 + 8.8 * easeOut);
      fp.groundRingMat.opacity = 0.94 * fade;

      fp.skyRingMesh.position.y = 0.5 + 14.0 * easeOut;
      fp.skyRingMesh.scale.setScalar(0.6 + 5.2 * easeOut);
      fp.skyRingMat.opacity = 0.9 * fade;

      for (let s = 0; s < FORECAST_PULSE_SPARK_COUNT; s++) {
        const sp = fp.sparks[s];
        const ang = sp.angle + fp.age * 2.8;
        const rad = sp.radius * (1 + 1.2 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 5.5 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.45 * t));
        sp.material.opacity = fade;
      }
    }

    // 40. Skyforge Jetpack Twin Thruster Flame Plumes
    for (let i = 0; i < JETPACK_FLAME_POOL_SIZE; i++) {
      const jf = this.jetpackFlames[i];
      if (!jf.active) continue;
      jf.age += safeDt;
      const t = jf.age / jf.duration;
      if (t >= 1) {
        jf.active = false;
        jf.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      const flicker = 0.88 + 0.24 * Math.sin(jf.age * 46);
      const coneScaleXZ = (0.16 + 0.08 * jf.intensity) * (1 - 0.45 * t) * flicker;
      const coneScaleY = (0.38 + 0.24 * jf.intensity) * (0.85 + 0.3 * fade);
      jf.leftCone.scale.set(coneScaleXZ, coneScaleY, coneScaleXZ);
      jf.rightCone.scale.set(coneScaleXZ, coneScaleY, coneScaleXZ);
      jf.leftCoreCone.scale.set(coneScaleXZ * 0.52, coneScaleY * 0.68, coneScaleXZ * 0.52);
      jf.rightCoreCone.scale.set(coneScaleXZ * 0.52, coneScaleY * 0.68, coneScaleXZ * 0.52);
      jf.outerMat.opacity = 0.92 * fade;
      jf.coreMat.opacity = 0.96 * fade;

      for (let s = 0; s < JETPACK_FLAME_SPARK_COUNT; s++) {
        const sp = jf.sparks[s];
        sp.mesh.position.x += sp.vx * safeDt;
        sp.mesh.position.y += sp.vy * safeDt;
        sp.mesh.position.z += sp.vz * safeDt;
        sp.mesh.rotation.y += 8 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.6 * t));
        sp.material.opacity = fade;
      }
    }

    // 41. Dragon's Breath Plasma Flamethrower Stream
    for (let i = 0; i < FLAME_STREAM_POOL_SIZE; i++) {
      const fs = this.flameStreams[i];
      if (!fs.active) continue;
      fs.age += safeDt;
      const t = fs.age / fs.duration;
      if (t >= 1) {
        fs.active = false;
        fs.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      const extend = 0.35 + 0.65 * Math.min(1, t * 2.2);
      const streamLen = fs.range * extend;
      const tipSpread = Math.max(0.45, fs.range * 0.16) * (0.7 + 0.5 * t);

      fs.outerConeMesh.position.z = streamLen * 0.5;
      fs.outerConeMesh.scale.set(tipSpread, streamLen, tipSpread);
      fs.outerConeMat.opacity = 0.62 * fade;

      fs.coreConeMesh.position.z = streamLen * 0.34;
      fs.coreConeMesh.scale.set(tipSpread * 0.48, streamLen * 0.68, tipSpread * 0.48);
      fs.coreConeMat.opacity = 0.85 * fade;

      const puffCurve = 1 + 0.8 * Math.sin(t * Math.PI);
      for (let p = 0; p < FLAME_STREAM_PUFF_COUNT; p++) {
        const pf = fs.puffs[p];
        pf.mesh.position.x += pf.vx * safeDt;
        pf.mesh.position.y += pf.vy * safeDt;
        pf.mesh.position.z += pf.vz * safeDt;
        pf.mesh.rotation.x += pf.rx * safeDt;
        pf.mesh.rotation.y += pf.ry * safeDt;
        pf.mesh.scale.setScalar(pf.baseScale * puffCurve * (1 - 0.35 * t));
        pf.material.opacity = (pf.isCyanCore ? 0.92 : 0.84) * fade;
      }
    }

    // 42. Dramatic Falling Meteor Strike + Fiery Shock Ring
    for (let i = 0; i < METEOR_STRIKE_POOL_SIZE; i++) {
      const ms = this.meteorStrikes[i];
      if (!ms.active) continue;
      ms.age += safeDt;
      const t = ms.age / ms.duration;
      if (t >= 1) {
        ms.active = false;
        ms.group.visible = false;
        continue;
      }

      const impactFrac = 0.22;
      const descentFrac = clamp(t / impactFrac, 0, 1);
      const mx = -9.0 * (1 - descentFrac);
      const my = 0.3 + 25.7 * (1 - descentFrac);
      const mz = -5.0 * (1 - descentFrac);

      const trailFade = t < impactFrac ? 1 : Math.max(0, 1 - (t - impactFrac) * 5.0);
      ms.meteorMesh.position.set(mx, my, mz);
      ms.meteorMesh.rotation.x += 7 * safeDt;
      ms.meteorMesh.rotation.y += 9 * safeDt;
      ms.meteorMesh.scale.setScalar(Math.max(0.05, 1.35 * trailFade));
      ms.meteorMat.opacity = 0.98 * trailFade;

      ms.trailConeMesh.position.set(mx - 0.32 * 4.5, my + 0.93 * 4.5, mz - 0.18 * 4.5);
      ms.trailConeMesh.scale.set(1.5 * Math.max(0.1, trailFade), 9.5 * Math.max(0.1, trailFade), 1.5 * Math.max(0.1, trailFade));
      ms.trailConeMat.opacity = 0.78 * trailFade;

      ms.innerTrailMesh.position.set(mx - 0.32 * 3.5, my + 0.93 * 3.5, mz - 0.18 * 3.5);
      ms.innerTrailMesh.scale.set(0.75 * Math.max(0.1, trailFade), 7.5 * Math.max(0.1, trailFade), 0.75 * Math.max(0.1, trailFade));
      ms.innerTrailMat.opacity = 0.92 * trailFade;

      if (t < impactFrac) {
        ms.blastSphereMesh.scale.setScalar(0.1);
        ms.blastSphereMat.opacity = 0;
        ms.coreFlashMesh.scale.setScalar(0.1);
        ms.coreFlashMat.opacity = 0;
        ms.shockRingMesh.scale.setScalar(0.2);
        ms.shockRingMat.opacity = 0;
        ms.outerShockRingMesh.scale.setScalar(0.2);
        ms.outerShockRingMat.opacity = 0;
        ms.tiltedRingMesh.scale.setScalar(0.2);
        ms.tiltedRingMat.opacity = 0;
      } else {
        const impactT = clamp((t - impactFrac) / (1 - impactFrac), 0, 1);
        const easeOut = 1 - Math.pow(1 - impactT, 3);
        const fade = 1 - impactT;

        const expand = Math.min(1, impactT * 2.4);
        ms.blastSphereMesh.scale.setScalar(ms.radius * 0.95 * (0.2 + 0.85 * expand));
        ms.blastSphereMat.opacity = 0.85 * fade;

        ms.coreFlashMesh.scale.setScalar(ms.radius * 0.55 * (0.15 + 0.9 * Math.min(1, impactT * 3.2)));
        ms.coreFlashMat.opacity = Math.max(0, 0.96 * (1 - impactT * 1.65));

        ms.shockRingMesh.scale.setScalar(ms.radius * (0.25 + 1.45 * easeOut));
        ms.shockRingMat.opacity = 0.95 * fade;

        ms.outerShockRingMesh.scale.setScalar(ms.radius * (0.35 + 1.85 * easeOut));
        ms.outerShockRingMat.opacity = 0.9 * fade * fade;

        ms.tiltedRingMesh.rotation.y += 4.2 * safeDt;
        ms.tiltedRingMesh.scale.setScalar(ms.radius * (0.22 + 1.2 * easeOut));
        ms.tiltedRingMat.opacity = 0.84 * fade;

        for (let e = 0; e < METEOR_STRIKE_EMBER_COUNT; e++) {
          const em = ms.embers[e];
          em.mesh.visible = true;
          em.vy -= (em.isRock ? 18.0 : 11.5) * safeDt;
          em.mesh.position.x += em.vx * safeDt;
          em.mesh.position.y = Math.max(0.02, em.mesh.position.y + em.vy * safeDt);
          em.mesh.position.z += em.vz * safeDt;
          em.mesh.rotation.x += em.rx * safeDt;
          em.mesh.rotation.y += em.ry * safeDt;
          em.mesh.scale.setScalar(em.baseScale * (1 - 0.5 * impactT));
          em.material.opacity = fade;
        }
      }
    }

    // 43. Hop Crystal Low-Gravity Aura
    for (let i = 0; i < HOP_CRYSTAL_AURA_POOL_SIZE; i++) {
      const hc = this.hopCrystalAuras[i];
      if (!hc.active) continue;
      hc.age += safeDt;
      const t = hc.age / hc.duration;
      if (t >= 1) {
        hc.active = false;
        hc.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      hc.groundRingMesh.scale.setScalar(0.55 + 2.0 * easeOut);
      hc.groundRingMat.opacity = 0.94 * fade;

      hc.levitateRingMesh.position.y = 0.15 + 2.15 * easeOut;
      hc.levitateRingMesh.rotation.z += 4.2 * safeDt;
      hc.levitateRingMesh.scale.setScalar(0.45 + 1.15 * easeOut);
      hc.levitateRingMat.opacity = 0.9 * fade;

      hc.auraShellMesh.position.y = 0.9 + 0.85 * t;
      hc.auraShellMesh.rotation.y -= 2.4 * safeDt;
      hc.auraShellMesh.scale.set(0.75 + 0.5 * easeOut, 1.5 + 0.9 * t, 0.75 + 0.5 * easeOut);
      hc.auraShellMat.opacity = 0.36 * fade;

      for (let m = 0; m < HOP_CRYSTAL_MOTE_COUNT; m++) {
        const mt = hc.motes[m];
        const ang = mt.angle + hc.age * mt.spin;
        const rad = mt.radius * (1 + 0.35 * t);
        mt.mesh.position.x = Math.cos(ang) * rad;
        mt.mesh.position.y += mt.speedY * safeDt;
        mt.mesh.position.z = Math.sin(ang) * rad;
        mt.mesh.rotation.y += 6 * safeDt;
        mt.mesh.scale.setScalar(mt.baseScale * (1 - 0.45 * t));
        mt.material.opacity = fade;
      }
    }

    // 44. Shockwave Hammer Ground Slam
    for (let i = 0; i < HAMMER_SLAM_POOL_SIZE; i++) {
      const hs = this.hammerSlams[i];
      if (!hs.active) continue;
      hs.age += safeDt;
      const t = hs.age / hs.duration;
      if (t >= 1) {
        hs.active = false;
        hs.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      hs.flashMesh.scale.setScalar(hs.radius * (0.25 + 0.65 * Math.min(1, t * 4)));
      hs.flashMat.opacity = Math.max(0, 0.96 * (1 - t * 2.2));

      hs.domeMesh.scale.setScalar(hs.radius * (0.28 + 0.78 * easeOut));
      hs.domeMat.opacity = 0.44 * fade * fade;

      hs.violetRingMesh.scale.setScalar(hs.radius * (0.24 + 1.05 * easeOut));
      hs.violetRingMat.opacity = 0.95 * fade;

      hs.cyanRingMesh.scale.setScalar(hs.radius * (0.18 + 0.88 * easeOut));
      hs.cyanRingMat.opacity = 0.92 * fade;

      hs.tiltRingMesh.rotation.y += 4.5 * safeDt;
      hs.tiltRingMesh.scale.setScalar(hs.radius * (0.2 + 0.75 * easeOut));
      hs.tiltRingMat.opacity = 0.86 * fade;

      for (let s = 0; s < HAMMER_SLAM_SHARD_COUNT; s++) {
        const sh = hs.shards[s];
        sh.vy -= 14.5 * safeDt;
        sh.mesh.position.x += sh.vx * safeDt;
        sh.mesh.position.y = Math.max(0.03, sh.mesh.position.y + sh.vy * safeDt);
        sh.mesh.position.z += sh.vz * safeDt;
        sh.mesh.rotation.x += sh.rx * safeDt;
        sh.mesh.rotation.y += sh.ry * safeDt;
        sh.mesh.scale.setScalar(sh.baseScale * (1 - 0.55 * t));
        sh.material.opacity = fade;
      }
    }

    // 45. Shockwave Hammer Kinetic Bounce Leap
    for (let i = 0; i < HAMMER_BOUNCE_POOL_SIZE; i++) {
      const hb = this.hammerBounces[i];
      if (!hb.active) continue;
      hb.age += safeDt;
      const t = hb.age / hb.duration;
      if (t >= 1) {
        hb.active = false;
        hb.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      hb.groundRingMesh.scale.setScalar(0.55 + 3.2 * easeOut);
      hb.groundRingMat.opacity = 0.94 * fade;

      hb.boostRingMesh.position.y = 0.15 + 3.4 * easeOut;
      hb.boostRingMesh.rotation.z += 5.5 * safeDt;
      hb.boostRingMesh.scale.setScalar(0.48 + 1.45 * easeOut);
      hb.boostRingMat.opacity = 0.9 * fade;

      hb.columnMesh.position.y = 1.2 + 1.8 * t;
      hb.columnMesh.scale.set(0.65 + 0.7 * easeOut, 2.4 + 2.2 * t, 0.65 + 0.7 * easeOut);
      hb.columnMat.opacity = 0.44 * fade;

      for (let s = 0; s < HAMMER_BOUNCE_SPARK_COUNT; s++) {
        const sp = hb.sparks[s];
        const ang = sp.angle + hb.age * sp.spin;
        const rad = sp.radius * (1 + 0.5 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 7 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.45 * t));
        sp.material.opacity = fade;
      }
    }

    // 46. Recon Flare Gun Signal Trail & Scan Beacon Burst
    for (let i = 0; i < FLARE_TRAIL_POOL_SIZE; i++) {
      const ft = this.flareTrails[i];
      if (!ft.active) continue;
      ft.age += safeDt;
      const t = ft.age / ft.duration;
      if (t >= 1) {
        ft.active = false;
        ft.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      if (ft.beamLength >= 1e-4) {
        const beamW = Math.max(0.03, 0.22 * (1 - 0.72 * t));
        ft.beamMesh.scale.set(beamW, ft.beamLength, beamW);
        ft.beamMat.opacity = 0.88 * fade;
      }

      ft.coreMesh.scale.setScalar(0.65 + 0.45 * Math.sin(t * Math.PI));
      ft.coreMat.opacity = 0.96 * fade;

      ft.burstMesh.scale.setScalar(0.8 + 3.2 * Math.min(1, t * 2.2));
      ft.burstMat.opacity = 0.78 * fade * fade;

      ft.innerRingMesh.scale.setScalar(0.5 + Math.min(12, ft.radius * 0.25) * easeOut);
      ft.innerRingMat.opacity = 0.94 * fade;

      ft.scanRingMesh.scale.setScalar(1.0 + ft.radius * easeOut);
      ft.scanRingMat.opacity = 0.9 * fade;

      for (let s = 0; s < FLARE_TRAIL_SPARK_COUNT; s++) {
        const sp = ft.sparks[s];
        sp.vy -= 3.2 * safeDt;
        sp.mesh.position.x += sp.vx * safeDt;
        sp.mesh.position.y += sp.vy * safeDt;
        sp.mesh.position.z += sp.vz * safeDt;
        sp.mesh.rotation.x += sp.rx * safeDt;
        sp.mesh.rotation.y += sp.ry * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.45 * t));
        sp.material.opacity = fade;
      }
    }

    // 47. Speedboat Water Wake
    for (let i = 0; i < WATER_WAKE_POOL_SIZE; i++) {
      const ww = this.waterWakes[i];
      if (!ww.active) continue;
      ww.age += safeDt;
      const t = ww.age / ww.duration;
      if (t >= 1) {
        ww.active = false;
        ww.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const sc = ww.speedScale;

      const wakeOffX = (0.52 + 0.85 * easeOut) * sc;
      const wakeOffZ = -(0.35 + 1.15 * easeOut) * sc;
      const wakeW = (0.18 + 0.26 * easeOut) * sc;
      const wakeLen = (1.1 + 1.65 * easeOut) * sc;
      ww.leftWakeMesh.position.set(-wakeOffX, 0.03, wakeOffZ);
      ww.leftWakeMesh.scale.set(wakeW, 0.05, wakeLen);
      ww.rightWakeMesh.position.set(wakeOffX, 0.03, wakeOffZ);
      ww.rightWakeMesh.scale.set(wakeW, 0.05, wakeLen);
      ww.wakeMat.opacity = 0.78 * fade;

      ww.rippleRingMesh.scale.setScalar((0.75 + 2.4 * easeOut) * sc);
      ww.rippleRingMat.opacity = 0.82 * fade;

      ww.foamRingMesh.scale.setScalar((0.45 + 1.55 * easeOut) * sc);
      ww.foamRingMat.opacity = 0.88 * fade;

      for (let d = 0; d < WATER_WAKE_DROPLET_COUNT; d++) {
        const dr = ww.droplets[d];
        dr.vy -= 12.0 * safeDt;
        dr.mesh.position.x += dr.vx * safeDt;
        dr.mesh.position.y = Math.max(0.01, dr.mesh.position.y + dr.vy * safeDt);
        dr.mesh.position.z += dr.vz * safeDt;
        dr.mesh.scale.setScalar(dr.baseScale * (1 - 0.5 * t));
        dr.material.opacity = fade;
      }
    }

    // 48. Sentry Auto-Turret Deploy
    for (let i = 0; i < TURRET_DEPLOY_POOL_SIZE; i++) {
      const td = this.turretDeploys[i];
      if (!td.active) continue;
      td.age += safeDt;
      const t = td.age / td.duration;
      if (t >= 1) {
        td.active = false;
        td.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      td.baseRingMesh.scale.setScalar(0.55 + 2.25 * easeOut);
      td.baseRingMat.opacity = 0.94 * fade;

      td.lockRingMesh.position.y = 0.14 + 1.35 * easeOut;
      td.lockRingMesh.rotation.z += 4.6 * safeDt;
      td.lockRingMesh.scale.setScalar(0.45 + 1.25 * easeOut);
      td.lockRingMat.opacity = 0.9 * fade;

      const domeScale = 0.55 + 0.95 * easeOut;
      td.holoDomeMesh.position.y = 0.45 + 0.35 * easeOut;
      td.holoDomeMesh.rotation.y += 2.8 * safeDt;
      td.holoDomeMesh.scale.setScalar(domeScale);
      td.holoDomeMat.opacity = 0.56 * fade * fade;

      for (let s = 0; s < TURRET_DEPLOY_SPARK_COUNT; s++) {
        const sp = td.sparks[s];
        const ang = sp.angle + td.age * sp.spin;
        const rad = sp.radius * (0.65 + 0.65 * easeOut);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 6 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.45 * t));
        sp.material.opacity = 0.96 * fade;
      }
    }

    // 49. Sentry Auto-Turret Laser Shot
    for (let i = 0; i < TURRET_LASER_POOL_SIZE; i++) {
      const tl = this.turretLasers[i];
      if (!tl.active) continue;
      tl.age += safeDt;
      const t = tl.age / tl.duration;
      if (t >= 1) {
        tl.active = false;
        tl.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const wScale = 1 - 0.62 * t;

      tl.outerBeamMesh.scale.set(0.085 * wScale, tl.beamLength, 0.085 * wScale);
      tl.outerBeamMat.opacity = 0.85 * fade;

      tl.coreBeamMesh.scale.set(0.036 * (1 - 0.72 * t), tl.beamLength, 0.036 * (1 - 0.72 * t));
      tl.coreBeamMat.opacity = 0.98 * fade;

      tl.muzzleFlashMesh.scale.setScalar(0.24 * (1 - 0.6 * t));
      tl.muzzleFlashMat.opacity = 0.95 * fade;

      tl.impactRingMesh.scale.setScalar(0.24 + 0.88 * easeOut);
      tl.impactRingMat.opacity = 0.94 * fade;

      tl.impactFlashMesh.scale.setScalar(0.28 * (1 - 0.55 * t));
      tl.impactFlashMat.opacity = 0.96 * fade;
    }

    // 50. Exotic Chug Cannon Slurp Orb Burst
    for (let i = 0; i < SLURP_ORB_POOL_SIZE; i++) {
      const so = this.slurpOrbs[i];
      if (!so.active) continue;
      so.age += safeDt;
      const t = so.age / so.duration;
      if (t >= 1) {
        so.active = false;
        so.group.visible = false;
        continue;
      }

      const expand = 1 - Math.pow(1 - Math.min(1, t * 1.85), 2);
      const fade = 1 - t;

      so.domeMesh.scale.set(
        so.radius * (0.32 + 0.72 * expand),
        so.radius * (0.28 + 0.56 * expand),
        so.radius * (0.32 + 0.72 * expand),
      );
      so.domeMat.opacity = 0.46 * fade;

      so.coreMesh.scale.setScalar(so.radius * 0.36 * (1 - 0.55 * t));
      so.coreMat.opacity = 0.85 * fade * fade;

      so.ringMesh.scale.setScalar(so.radius * (0.32 + 0.95 * expand));
      so.ringMat.opacity = 0.92 * fade;

      so.tiltRingMesh.rotation.y += 4.2 * safeDt;
      so.tiltRingMesh.scale.setScalar(so.radius * (0.25 + 0.78 * expand));
      so.tiltRingMat.opacity = 0.86 * fade;

      for (let d = 0; d < SLURP_ORB_DROPLET_COUNT; d++) {
        const dr = so.droplets[d];
        dr.vy -= 5.8 * safeDt;
        dr.mesh.position.x += dr.vx * safeDt;
        dr.mesh.position.y = Math.max(0.03, dr.mesh.position.y + dr.vy * safeDt);
        dr.mesh.position.z += dr.vz * safeDt;
        dr.mesh.rotation.y += 5.5 * safeDt;
        dr.mesh.scale.setScalar(dr.baseScale * (1 - 0.45 * t));
        dr.material.opacity = 0.96 * fade;
      }
    }

    // 51. Fishing Hole Splash
    for (let i = 0; i < FISHING_SPLASH_POOL_SIZE; i++) {
      const fs = this.fishingSplashes[i];
      if (!fs.active) continue;
      fs.age += safeDt;
      const t = fs.age / fs.duration;
      if (t >= 1) {
        fs.active = false;
        fs.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      fs.outerRingMesh.scale.setScalar(0.55 + 2.45 * easeOut);
      fs.outerRingMat.opacity = 0.88 * fade;

      fs.innerRingMesh.scale.setScalar(0.32 + 1.55 * easeOut);
      fs.innerRingMat.opacity = 0.92 * fade;

      const plumeLift = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      const plumeH = Math.max(0.15, 1.35 * plumeLift);
      const plumeW = 0.48 + 0.68 * easeOut;
      fs.plumeMesh.position.y = plumeH * 0.5;
      fs.plumeMesh.scale.set(plumeW, plumeH, plumeW);
      fs.plumeMat.opacity = 0.54 * fade;

      for (let d = 0; d < FISHING_SPLASH_DROPLET_COUNT; d++) {
        const dr = fs.droplets[d];
        dr.vy -= 11.5 * safeDt;
        dr.mesh.position.x += dr.vx * safeDt;
        dr.mesh.position.y = Math.max(0.02, dr.mesh.position.y + dr.vy * safeDt);
        dr.mesh.position.z += dr.vz * safeDt;
        dr.mesh.rotation.y += 6 * safeDt;
        dr.mesh.scale.setScalar(dr.baseScale * (1 - 0.45 * t));
        dr.material.opacity = 0.94 * fade;
      }
    }

    // 52. Vanguard Tank Main Cannon Shell
    for (let i = 0; i < TANK_SHELL_POOL_SIZE; i++) {
      const ts = this.tankShells[i];
      if (!ts.active) continue;
      ts.age += safeDt;
      const t = ts.age / ts.duration;
      if (t >= 1) {
        ts.active = false;
        ts.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const beamFade = Math.max(0, 1 - t * 2.4);

      if (ts.beamLength > 0.001) {
        ts.beamMesh.visible = beamFade > 0.01;
        ts.coreBeamMesh.visible = beamFade > 0.01;
        ts.beamMesh.scale.set(0.32 * (1 - 0.65 * Math.min(1, t * 2.2)), ts.beamLength, 0.32 * (1 - 0.65 * Math.min(1, t * 2.2)));
        ts.beamMat.opacity = 0.86 * beamFade;
        ts.coreBeamMesh.scale.set(0.13 * (1 - 0.72 * Math.min(1, t * 2.2)), ts.beamLength, 0.13 * (1 - 0.72 * Math.min(1, t * 2.2)));
        ts.coreBeamMat.opacity = 0.96 * beamFade;
      }

      ts.flashMesh.scale.setScalar(ts.radius * 0.48 * Math.max(0.05, 1 - t * 2.1));
      ts.flashMat.opacity = Math.max(0, 0.96 * (1 - t * 1.9));

      ts.fireballMesh.scale.setScalar(ts.radius * (0.35 + 0.85 * easeOut));
      ts.fireballMat.opacity = 0.72 * fade * fade;

      ts.shockRingMesh.scale.setScalar(ts.radius * (0.35 + 1.05 * easeOut));
      ts.shockRingMat.opacity = 0.92 * fade;

      ts.hexRingMesh.rotation.z += 3.2 * safeDt;
      ts.hexRingMesh.scale.setScalar(ts.radius * (0.28 + 0.92 * easeOut));
      ts.hexRingMat.opacity = 0.88 * fade;

      for (let s = 0; s < TANK_SHELL_SHARD_COUNT; s++) {
        const sh = ts.shards[s];
        sh.vy -= 14.5 * safeDt;
        sh.mesh.position.x += sh.vx * safeDt;
        sh.mesh.position.y = Math.max(0.05, sh.mesh.position.y + sh.vy * safeDt);
        sh.mesh.position.z += sh.vz * safeDt;
        sh.mesh.rotation.x += sh.rx * safeDt;
        sh.mesh.rotation.y += sh.ry * safeDt;
        sh.mesh.scale.setScalar(sh.baseScale * (1 - 0.55 * t));
        sh.material.opacity = 0.95 * fade;
      }
    }

    // 53. Aegis Ballistic Shield Ricochet
    for (let i = 0; i < SHIELD_RICOCHET_POOL_SIZE; i++) {
      const sr = this.shieldRicochets[i];
      if (!sr.active) continue;
      sr.age += safeDt;
      const t = sr.age / sr.duration;
      if (t >= 1) {
        sr.active = false;
        sr.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      sr.flashMesh.scale.setScalar(0.28 * Math.max(0.08, 1 - 0.78 * t));
      sr.flashMat.opacity = 0.96 * fade;

      sr.outerRingMesh.scale.setScalar(0.24 + 0.95 * easeOut);
      sr.outerRingMat.opacity = 0.94 * fade;

      sr.hexShieldMesh.rotation.z += 4.5 * safeDt;
      sr.hexShieldMesh.scale.setScalar(0.18 + 0.72 * easeOut);
      sr.hexShieldMat.opacity = 0.9 * fade;

      for (let s = 0; s < SHIELD_RICOCHET_SPARK_COUNT; s++) {
        const sp = sr.sparks[s];
        sp.vy -= 7.5 * safeDt;
        sp.mesh.position.x += sp.vx * safeDt;
        sp.mesh.position.y += sp.vy * safeDt;
        sp.mesh.position.z += sp.vz * safeDt;
        sp.mesh.rotation.x += sp.rx * safeDt;
        sp.mesh.rotation.y += sp.ry * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.5 * t));
        sp.material.opacity = 0.96 * fade;
      }
    }

    // 54. Remote C4 Demolition Blast
    for (let i = 0; i < C4_BLAST_POOL_SIZE; i++) {
      const cb = this.c4Blasts[i];
      if (!cb.active) continue;
      cb.age += safeDt;
      const t = cb.age / cb.duration;
      if (t >= 1) {
        cb.active = false;
        cb.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      cb.flashMesh.scale.setScalar(cb.radius * 0.52 * Math.max(0.05, 1 - t * 2.2));
      cb.flashMat.opacity = Math.max(0, 0.96 * (1 - t * 1.8));

      cb.domeMesh.scale.set(
        cb.radius * (0.36 + 0.88 * easeOut),
        cb.radius * (0.32 + 0.74 * easeOut),
        cb.radius * (0.36 + 0.88 * easeOut),
      );
      cb.domeMat.opacity = 0.62 * fade * fade;

      cb.shockRingMesh.scale.setScalar(cb.radius * (0.38 + 1.12 * easeOut));
      cb.shockRingMat.opacity = 0.92 * fade;

      cb.emberRingMesh.rotation.z -= 3.6 * safeDt;
      cb.emberRingMesh.scale.setScalar(cb.radius * (0.28 + 0.94 * easeOut));
      cb.emberRingMat.opacity = 0.88 * fade;

      for (let s = 0; s < C4_BLAST_SHARD_COUNT; s++) {
        const sh = cb.shards[s];
        sh.vy -= 13.5 * safeDt;
        sh.mesh.position.x += sh.vx * safeDt;
        sh.mesh.position.y = Math.max(0.04, sh.mesh.position.y + sh.vy * safeDt);
        sh.mesh.position.z += sh.vz * safeDt;
        sh.mesh.rotation.x += sh.rx * safeDt;
        sh.mesh.rotation.y += sh.ry * safeDt;
        sh.mesh.scale.setScalar(sh.baseScale * (1 - 0.5 * t));
        sh.material.opacity = 0.96 * fade;
      }
    }

    // 55. Hot-Drop Gold POI Sky Beam
    for (let i = 0; i < HOT_DROP_BEAM_POOL_SIZE; i++) {
      const hd = this.hotDropBeams[i];
      if (!hd.active) continue;
      hd.age += safeDt;
      const t = hd.age / hd.duration;
      if (t >= 1) {
        hd.active = false;
        hd.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const pulse = 1 + 0.14 * Math.sin(hd.age * 16);

      hd.outerBeamMesh.scale.set(1.25 * pulse * (1 - 0.35 * t), 28, 1.25 * pulse * (1 - 0.35 * t));
      hd.outerBeamMat.opacity = 0.42 * fade;

      hd.coreBeamMesh.scale.set(0.48 * pulse * (1 - 0.45 * t), 28, 0.48 * pulse * (1 - 0.45 * t));
      hd.coreBeamMat.opacity = 0.72 * fade;

      hd.groundRingMesh.scale.setScalar(0.85 + 3.4 * easeOut);
      hd.groundRingMat.opacity = 0.94 * fade;

      hd.hexRingMesh.position.y = 0.25 + 4.8 * easeOut;
      hd.hexRingMesh.rotation.z += 3.5 * safeDt;
      hd.hexRingMesh.scale.setScalar(0.72 + 2.2 * easeOut);
      hd.hexRingMat.opacity = 0.9 * fade;

      for (let s = 0; s < HOT_DROP_BEAM_SPARK_COUNT; s++) {
        const sp = hd.sparks[s];
        const ang = sp.angle + hd.age * sp.spin;
        const rad = sp.radius * (1 - 0.35 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 5 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.4 * t));
        sp.material.opacity = 0.96 * fade;
      }
    }

    // 56. Arc Lightning Bolt
    for (let i = 0; i < ARC_LIGHTNING_POOL_SIZE; i++) {
      const al = this.arcLightnings[i];
      if (!al.active) continue;
      al.age += safeDt;
      const t = al.age / al.duration;
      if (t >= 1) {
        al.active = false;
        al.group.visible = false;
        continue;
      }

      const fade = 1 - t;
      const flicker = 0.72 + 0.28 * Math.sin(al.age * (al.isChain ? 75 : 55));
      const coreScaleXZ = al.coreWidth * Math.max(0.15, 1 - 0.55 * t);
      const glowScaleXZ = al.glowWidth * Math.max(0.2, 1 - 0.4 * t);

      for (let s = 0; s < ARC_LIGHTNING_SEGMENT_COUNT; s++) {
        const segLen = al.segmentLengths[s];
        al.coreSegments[s].scale.set(coreScaleXZ, segLen, coreScaleXZ);
        al.glowSegments[s].scale.set(glowScaleXZ, segLen, glowScaleXZ);
      }

      al.coreMat.opacity = 0.98 * fade * flicker;
      al.glowMat.opacity = 0.65 * fade * flicker;
      al.flashMat.opacity = 0.92 * fade;
      const flashScale = (al.isChain ? 0.24 : 0.36) * Math.max(0.1, 1 - 0.65 * t);
      al.originFlashMesh.scale.setScalar(flashScale * 0.75);
      al.impactFlashMesh.scale.setScalar(flashScale);
    }

    // 57. Shadow Cloak Burst
    for (let i = 0; i < SHADOW_CLOAK_BURST_POOL_SIZE; i++) {
      const sc = this.shadowCloakBursts[i];
      if (!sc.active) continue;
      sc.age += safeDt;
      const t = sc.age / sc.duration;
      if (t >= 1) {
        sc.active = false;
        sc.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;

      const mistScale = sc.entering
        ? 0.45 + 1.85 * easeOut
        : 0.35 + 2.35 * easeOut;
      sc.mistRingMesh.scale.setScalar(mistScale);
      sc.mistRingMat.opacity = 0.85 * fade;

      sc.outerRingMesh.rotation.z += (sc.entering ? -3.4 : 4.2) * safeDt;
      sc.outerRingMesh.position.y = sc.entering ? 0.3 + 0.9 * easeOut : 0.85 + 0.45 * easeOut;
      sc.outerRingMesh.scale.setScalar(0.55 + 1.45 * easeOut);
      sc.outerRingMat.opacity = 0.78 * fade;

      sc.shroudMesh.scale.setScalar(
        sc.entering ? 1.55 - 0.55 * easeOut : 0.85 + 1.65 * easeOut,
      );
      sc.shroudMat.opacity = 0.44 * fade * fade;

      for (let w = 0; w < SHADOW_CLOAK_WISP_COUNT; w++) {
        const wp = sc.wisps[w];
        const ang = wp.angle + sc.age * wp.spin;
        const rad = wp.startRadius + (wp.endRadius - wp.startRadius) * easeOut;
        const wy = wp.startY + (wp.endY - wp.startY) * easeOut;
        wp.mesh.position.set(Math.cos(ang) * rad, wy, Math.sin(ang) * rad);
        wp.mesh.rotation.y += 3.5 * safeDt;
        wp.mesh.scale.setScalar(wp.baseScale * (0.7 + 0.65 * Math.sin(t * Math.PI)));
        wp.material.opacity = 0.72 * fade;
      }
    }

    // 58. Rune Monolith Attunement
    for (let i = 0; i < RUNE_ATTUNE_POOL_SIZE; i++) {
      const ra = this.runeAttunes[i];
      if (!ra.active) continue;
      ra.age += safeDt;
      const t = ra.age / ra.duration;
      if (t >= 1) {
        ra.active = false;
        ra.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const beamHeight = 3.5 + 16.5 * easeOut;
      const pulse = 1 + 0.12 * Math.sin(ra.age * 14);

      ra.outerBeamMesh.position.y = beamHeight * 0.5;
      ra.outerBeamMesh.scale.set(0.95 * pulse * (1 - 0.3 * t), beamHeight, 0.95 * pulse * (1 - 0.3 * t));
      ra.outerBeamMat.opacity = 0.48 * fade;

      ra.coreBeamMesh.position.y = beamHeight * 0.5;
      ra.coreBeamMesh.scale.set(0.36 * pulse * (1 - 0.4 * t), beamHeight, 0.36 * pulse * (1 - 0.4 * t));
      ra.coreBeamMat.opacity = 0.78 * fade;

      ra.glyphRingMesh.position.y = 0.25 + 4.4 * easeOut;
      ra.glyphRingMesh.rotation.z += 3.8 * safeDt;
      ra.glyphRingMesh.scale.setScalar(0.85 + 1.85 * easeOut);
      ra.glyphRingMat.opacity = 0.92 * fade;

      ra.groundRingMesh.scale.setScalar(0.75 + 2.8 * easeOut);
      ra.groundRingMat.opacity = 0.9 * fade;

      for (let s = 0; s < RUNE_ATTUNE_SPARK_COUNT; s++) {
        const sp = ra.sparks[s];
        const ang = sp.angle + ra.age * sp.spin;
        const rad = sp.radius * (1 - 0.35 * t);
        sp.mesh.position.x = Math.cos(ang) * rad;
        sp.mesh.position.y += sp.speedY * safeDt;
        sp.mesh.position.z = Math.sin(ang) * rad;
        sp.mesh.rotation.y += 5 * safeDt;
        sp.mesh.scale.setScalar(sp.baseScale * (1 - 0.4 * t));
        sp.material.opacity = 0.94 * fade;
      }
    }

    // 59. Storm Choppa Rotor Wash
    for (let i = 0; i < CHOPPA_WASH_POOL_SIZE; i++) {
      const cw = this.choppaWashes[i];
      if (!cw.active) continue;
      cw.age += safeDt;
      const t = cw.age / cw.duration;
      if (t >= 1) {
        cw.active = false;
        cw.group.visible = false;
        continue;
      }

      const easeOut = 1 - Math.pow(1 - t, 3);
      const fade = 1 - t;
      const sc = cw.intensity;

      cw.outerDustRingMesh.scale.setScalar((1.1 + 4.4 * easeOut) * sc);
      cw.outerDustRingMat.opacity = 0.56 * fade;

      cw.innerAirRingMesh.rotation.z += 4.2 * safeDt;
      cw.innerAirRingMesh.scale.setScalar((0.75 + 3.1 * easeOut) * sc);
      cw.innerAirRingMat.opacity = 0.48 * fade;

      for (let m = 0; m < CHOPPA_WASH_MOTE_COUNT; m++) {
        const mt = cw.motes[m];
        mt.mesh.position.x += mt.vx * safeDt;
        mt.mesh.position.y = Math.max(0.05, mt.mesh.position.y + mt.vy * safeDt);
        mt.mesh.position.z += mt.vz * safeDt;
        mt.mesh.scale.setScalar(mt.baseScale * (0.65 + 1.15 * easeOut));
        mt.material.opacity = 0.46 * fade;
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

  private spawnKineticDash(from: Vec3Like, to: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(from) || !isFiniteVec3(to)) return;

    const slot = this.kineticDashes[this.kineticDashCursor];
    this.kineticDashCursor = (this.kineticDashCursor + 1) % KINETIC_DASH_POOL_SIZE;

    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const rawLen = this.tmpDir.length();
    const safeLen = Math.max(0.6, rawLen);
    if (rawLen < 1e-4) {
      this.tmpDir.set(0, 0, 1);
    } else {
      this.tmpDir.divideScalar(rawLen);
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.55;
    slot.dashLength = safeLen;

    slot.group.position.copy(this.tmpA);
    slot.group.visible = true;

    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.beamGroup.quaternion.copy(this.tmpQuat);

    slot.trailMesh.position.set(0, 0, safeLen * 0.5);
    slot.trailMesh.scale.set(0.28, safeLen, 0.28);
    slot.trailMat.opacity = 0.72;

    slot.coreTrailMesh.position.set(0, 0, safeLen * 0.5);
    slot.coreTrailMesh.scale.set(0.11, safeLen, 0.11);
    slot.coreTrailMat.opacity = 0.9;

    slot.originRingMesh.position.set(0, 0, 0.12);
    slot.originRingMesh.scale.setScalar(0.55);
    slot.originRingMat.opacity = 0.92;

    slot.crescentGroup.position.set(0, 0, safeLen * 0.48);
    slot.crescentGroup.rotation.set(0.42, 0.15, -0.85);
    slot.crescentGroup.scale.setScalar(0.85);
    slot.innerArcMat.opacity = 0.96;
    slot.outerArcMat.opacity = 0.88;
    slot.coreArcMat.opacity = 0.95;

    for (let s = 0; s < KINETIC_DASH_STREAK_COUNT; s++) {
      const st = slot.streaks[s];
      const ang = (s / KINETIC_DASH_STREAK_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const rad = 0.24 + this.nextRand() * 0.48;
      st.radialX = Math.cos(ang) * rad;
      st.radialY = Math.sin(ang) * rad;
      st.progress = 0.12 + this.nextRand() * 0.55;
      st.width = 0.025 + this.nextRand() * 0.025;
      st.lengthFrac = 0.24 + this.nextRand() * 0.28;
      st.mesh.position.set(st.radialX, st.radialY, st.progress * safeLen);
      st.mesh.scale.set(st.width, Math.max(0.25, safeLen * st.lengthFrac), st.width);
      st.material.opacity = 0.92;
      st.mesh.visible = true;
    }
  }

  private spawnGoldBurst(position: Vec3Like, amount: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.goldBursts[this.goldBurstCursor];
    this.goldBurstCursor = (this.goldBurstCursor + 1) % GOLD_BURST_POOL_SIZE;

    const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 25;
    const activeCount = Math.min(GOLD_BURST_BAR_COUNT, Math.max(6, Math.round(safeAmount / 8)));

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.05;
    slot.activeCount = activeCount;

    slot.group.position.set(position.x, position.y + 0.35, position.z);
    slot.group.visible = true;

    slot.ringMesh.scale.setScalar(0.4);
    slot.ringMat.opacity = 0.9;
    slot.glowMesh.scale.setScalar(1.1);
    slot.glowMat.opacity = 0.85;

    for (let b = 0; b < GOLD_BURST_BAR_COUNT; b++) {
      const bar = slot.bars[b];
      if (b >= activeCount) {
        bar.mesh.visible = false;
        continue;
      }
      const ang = (b / activeCount) * Math.PI * 2 + this.nextRand() * 0.45;
      const speed = 1.8 + this.nextRand() * 3.4;
      bar.vx = Math.cos(ang) * speed;
      bar.vy = 4.6 + this.nextRand() * 4.4;
      bar.vz = Math.sin(ang) * speed;
      bar.rx = (this.nextRand() - 0.5) * 14;
      bar.ry = (this.nextRand() - 0.5) * 16;
      bar.rz = (this.nextRand() - 0.5) * 14;
      bar.baseScale = 0.8 + this.nextRand() * 0.45;
      bar.mesh.position.set(Math.cos(ang) * 0.14, 0.1 + this.nextRand() * 0.25, Math.sin(ang) * 0.14);
      bar.mesh.rotation.set(this.nextRand() * Math.PI, this.nextRand() * Math.PI, 0);
      bar.mesh.scale.setScalar(bar.baseScale);
      bar.material.opacity = 1;
      bar.mesh.visible = true;
    }
  }

  private spawnLootIslandRift(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.lootIslandRifts[this.lootIslandRiftCursor];
    this.lootIslandRiftCursor = (this.lootIslandRiftCursor + 1) % LOOT_ISLAND_RIFT_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 2.4;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.outerRingMesh.scale.setScalar(2.5);
    slot.outerRingMat.opacity = 0.95;

    slot.violetRingMesh.scale.setScalar(1.8);
    slot.violetRingMat.opacity = 0.9;

    slot.spireOuterMesh.position.y = 4;
    slot.spireOuterMesh.scale.set(2.6, 8, 2.6);
    slot.spireOuterMat.opacity = 0.48;

    slot.spireCoreMesh.position.y = 5;
    slot.spireCoreMesh.scale.set(0.9, 10, 0.9);
    slot.spireCoreMat.opacity = 0.88;

    slot.coreSphereMesh.scale.setScalar(3.2);
    slot.coreSphereMat.opacity = 0.9;

    for (let s = 0; s < LOOT_ISLAND_SHARD_COUNT; s++) {
      const sh = slot.shards[s];
      sh.angle = (s / LOOT_ISLAND_SHARD_COUNT) * Math.PI * 2;
      sh.radius = 4.2 + (s % 2) * 1.6;
      sh.yOffset = (s % 3 - 1) * 1.4;
      sh.baseScale = 1.4 + (s % 2) * 0.5;
      sh.mesh.position.set(
        Math.cos(sh.angle) * sh.radius,
        sh.yOffset,
        Math.sin(sh.angle) * sh.radius,
      );
      sh.mesh.scale.set(sh.baseScale * 0.65, sh.baseScale * 2.1, sh.baseScale * 0.65);
      sh.material.opacity = 0.95;
      sh.mesh.visible = true;
    }
  }

  private spawnBowExplosion(position: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.bowExplosions[this.bowExplosionCursor];
    this.bowExplosionCursor = (this.bowExplosionCursor + 1) % BOW_EXPLOSION_POOL_SIZE;

    const safeRadius = Math.max(1.4, Number.isFinite(radius) ? radius : 4.4);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.62;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.coreMesh.scale.setScalar(0.24 * safeRadius);
    slot.coreMat.opacity = 0.96;
    slot.blastMesh.scale.setScalar(0.35 * safeRadius);
    slot.blastMat.opacity = 0.82;
    slot.ringMesh.scale.setScalar(0.35 * safeRadius);
    slot.ringMat.opacity = 0.92;
    slot.tiltRingMesh.rotation.set(Math.PI / 3, this.nextRand() * Math.PI, Math.PI / 5);
    slot.tiltRingMesh.scale.setScalar(0.28 * safeRadius);
    slot.tiltRingMat.opacity = 0.85;

    for (let s = 0; s < BOW_EXPLOSION_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      const ang = (s / BOW_EXPLOSION_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const spd = safeRadius * (1.25 + this.nextRand() * 1.45);
      sp.vx = Math.cos(ang) * spd;
      sp.vy = safeRadius * (0.9 + this.nextRand() * 1.5);
      sp.vz = Math.sin(ang) * spd;
      sp.baseScale = Math.max(0.12, safeRadius * 0.048);
      sp.mesh.position.set(0, 0.1, 0);
      sp.mesh.rotation.set(0, 0, 0);
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 1;
      sp.mesh.visible = true;
    }
  }

  private spawnSlurpTankerBurst(position: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.slurpTankerBursts[this.slurpTankerBurstCursor];
    this.slurpTankerBurstCursor = (this.slurpTankerBurstCursor + 1) % SLURP_TANKER_BURST_POOL_SIZE;

    const safeRadius = Math.max(2.0, Number.isFinite(radius) ? radius : 10.0);
    slot.active = true;
    slot.age = 0;
    slot.duration = 1.25;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.08, position.z);
    slot.group.visible = true;

    slot.domeMesh.scale.set(safeRadius * 0.35, safeRadius * 0.32, safeRadius * 0.35);
    slot.domeMat.opacity = 0.42;
    slot.innerDomeMesh.scale.setScalar(safeRadius * 0.25);
    slot.innerDomeMat.opacity = 0.56;
    slot.outerRingMesh.scale.setScalar(safeRadius * 0.35);
    slot.outerRingMat.opacity = 0.92;
    slot.limeRingMesh.scale.setScalar(safeRadius * 0.25);
    slot.limeRingMat.opacity = 0.85;
    slot.geyserMesh.position.y = safeRadius * 0.3;
    slot.geyserMesh.scale.set(safeRadius * 0.24, safeRadius * 0.6, safeRadius * 0.24);
    slot.geyserMat.opacity = 0.52;

    for (let d = 0; d < SLURP_TANKER_DROPLET_COUNT; d++) {
      const dr = slot.droplets[d];
      const ang = (d / SLURP_TANKER_DROPLET_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const horiz = (1.1 + this.nextRand() * 2.2) * Math.min(3.5, safeRadius * 0.42);
      dr.vx = Math.cos(ang) * horiz;
      dr.vy = 4.2 + this.nextRand() * 4.4;
      dr.vz = Math.sin(ang) * horiz;
      dr.baseScale = 0.14 + this.nextRand() * 0.10;
      dr.mesh.position.set(Math.cos(ang) * 0.6, 0.4 + this.nextRand() * 0.8, Math.sin(ang) * 0.6);
      dr.mesh.scale.setScalar(dr.baseScale);
      dr.material.opacity = 1;
      dr.mesh.visible = true;
    }
  }

  private spawnCrownGlint(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.crownGlints[this.crownGlintCursor];
    this.crownGlintCursor = (this.crownGlintCursor + 1) % CROWN_GLINT_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.78;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.flareGroup.position.set(0, 2.08, 0);
    slot.flareGroup.rotation.set(0, this.nextRand() * Math.PI, 0);
    slot.flareGroup.scale.setScalar(0.6);
    slot.flareMat.opacity = 0.98;

    slot.ringMesh.position.set(0, 1.98, 0);
    slot.ringMesh.scale.setScalar(0.28);
    slot.ringMat.opacity = 0.9;

    for (let s = 0; s < CROWN_GLINT_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / CROWN_GLINT_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      sp.radius = 0.18 + this.nextRand() * 0.22;
      sp.speedY = 0.9 + this.nextRand() * 1.1;
      sp.baseScale = 0.065 + this.nextRand() * 0.04;
      sp.mesh.position.set(Math.cos(sp.angle) * sp.radius, 1.95 + this.nextRand() * 0.2, Math.sin(sp.angle) * sp.radius);
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.95;
      sp.mesh.visible = true;
    }
  }

  private spawnReviveBeam(position: Vec3Like, progress: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const safeProgress = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);

    // Reuse an active beam near the same target to keep continuous revive channels clean
    let slot = this.reviveBeams.find((rb) => {
      if (!rb.active) return false;
      const dx = rb.group.position.x - position.x;
      const dy = rb.group.position.y - position.y;
      const dz = rb.group.position.z - position.z;
      return dx * dx + dy * dy + dz * dz < 1.44;
    });

    if (!slot) {
      slot =
        this.reviveBeams.find((rb) => !rb.active) ??
        this.reviveBeams[this.reviveBeamCursor];
      this.reviveBeamCursor = (this.reviveBeamCursor + 1) % REVIVE_BEAM_POOL_SIZE;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.55;
    slot.progress = safeProgress;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.outerBeamMesh.scale.set(0.52 + 0.28 * safeProgress, 3.2, 0.52 + 0.28 * safeProgress);
    slot.outerBeamMat.opacity = 0.28 + 0.16 * safeProgress;
    slot.coreBeamMesh.scale.set(0.18 + 0.1 * safeProgress, 3.5, 0.18 + 0.1 * safeProgress);
    slot.coreBeamMat.opacity = 0.72;

    slot.baseRingMat.color.setHex(safeProgress > 0.75 ? 0x4ade80 : 0x22d3ee);
    slot.baseRingMesh.scale.setScalar(0.65 + 0.85 * safeProgress);
    slot.baseRingMat.opacity = 0.92;

    slot.pulseRingMesh.position.y = 0.1;
    slot.pulseRingMesh.scale.setScalar(0.55);
    slot.pulseRingMat.opacity = 0.88;

    for (let s = 0; s < REVIVE_BEAM_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / REVIVE_BEAM_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      sp.radius = 0.38 + this.nextRand() * 0.35;
      sp.speedY = 1.2 + this.nextRand() * 1.4;
      sp.baseScale = 0.075 + this.nextRand() * 0.04;
      sp.mesh.position.set(Math.cos(sp.angle) * sp.radius, 0.15 + this.nextRand() * 0.5, Math.sin(sp.angle) * sp.radius);
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.95;
      sp.mesh.visible = true;
    }
  }

  private spawnRailgunBeam(from: Vec3Like, to: Vec3Like, pierced = false): void {
    if (this.disposed || !isFiniteVec3(from) || !isFiniteVec3(to)) return;

    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const rawLen = this.tmpDir.length();
    if (!Number.isFinite(rawLen) || rawLen < 1e-4) return;

    const len = clamp(rawLen, 0.05, 500);
    this.tmpDir.divideScalar(rawLen);

    const slot = this.railgunBeams[this.railgunBeamCursor];
    this.railgunBeamCursor = (this.railgunBeamCursor + 1) % RAILGUN_BEAM_POOL_SIZE;

    const isPierced = Boolean(pierced);
    const pierceBoost = isPierced ? 1.45 : 1.0;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.44;
    slot.beamLength = len;
    slot.pierced = isPierced;

    slot.group.position.copy(this.tmpA);
    slot.group.visible = true;

    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.beamGroup.quaternion.copy(this.tmpQuat);

    slot.outerBeamMesh.position.set(0, 0, len * 0.5);
    slot.outerBeamMesh.scale.set(0.16 * pierceBoost, len, 0.16 * pierceBoost);
    slot.outerBeamMat.opacity = 0.72;

    slot.coreBeamMesh.position.set(0, 0, len * 0.5);
    slot.coreBeamMesh.scale.set(0.065, len, 0.065);
    slot.coreBeamMat.opacity = 0.96;

    slot.violetHaloMesh.position.set(0, 0, len * 0.5);
    slot.violetHaloMesh.scale.set(0.26 * pierceBoost, len, 0.26 * pierceBoost);
    slot.violetHaloMat.opacity = isPierced ? 0.68 : 0.42;

    slot.impactRingMesh.position.set(0, 0, len);
    slot.impactRingMesh.scale.setScalar(0.35 * pierceBoost);
    slot.impactRingMat.color.setHex(isPierced ? 0xa855f7 : 0x22d3ee);
    slot.impactRingMat.opacity = 0.92;

    for (let r = 0; r < RAILGUN_BEAM_RING_COUNT; r++) {
      const ring = slot.rings[r];
      ring.frac = (r + 1) / (RAILGUN_BEAM_RING_COUNT + 1);
      ring.mesh.position.set(0, 0, ring.frac * len);
      ring.mesh.rotation.z = r * 0.7;
      ring.mesh.scale.setScalar(0.28 * pierceBoost);
      ring.material.opacity = 0.9;
    }
  }

  private spawnRailSparks(position: Vec3Like, velocity?: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.railSparks[this.railSparksCursor];
    this.railSparksCursor = (this.railSparksCursor + 1) % RAIL_SPARKS_POOL_SIZE;

    const hasVel = isFiniteVec3(velocity);
    const velX = hasVel ? clamp(velocity.x, -40, 40) : 0;
    const velY = hasVel ? clamp(velocity.y, -40, 40) : 0;
    const velZ = hasVel ? clamp(velocity.z, -40, 40) : 0;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.34;

    slot.group.position.set(position.x, position.y + 0.06, position.z);
    slot.group.visible = true;

    slot.glowMesh.scale.setScalar(0.28);
    slot.glowMat.opacity = 0.9;

    for (let s = 0; s < RAIL_SPARK_PARTICLE_COUNT; s++) {
      const sp = slot.sparks[s];
      const ang = (s / RAIL_SPARK_PARTICLE_COUNT) * Math.PI * 2 + this.nextRand() * 0.45;
      const radialSpeed = 1.6 + this.nextRand() * 2.4;
      sp.vx = Math.cos(ang) * radialSpeed - velX * 0.32;
      sp.vy = 1.8 + this.nextRand() * 2.2 + Math.max(0, -velY * 0.2);
      sp.vz = Math.sin(ang) * radialSpeed - velZ * 0.32;
      sp.rx = (this.nextRand() - 0.5) * 18;
      sp.ry = (this.nextRand() - 0.5) * 18;
      sp.baseScale = 0.06 + this.nextRand() * 0.04;

      sp.mesh.position.set((this.nextRand() - 0.5) * 0.16, 0.04, (this.nextRand() - 0.5) * 0.16);
      sp.mesh.rotation.set(this.nextRand() * Math.PI, this.nextRand() * Math.PI, 0);
      sp.mesh.scale.set(sp.baseScale * 0.65, sp.baseScale * 0.65, sp.baseScale * 2.1);
      sp.material.opacity = 1;
      sp.mesh.visible = true;
    }
  }

  private spawnTrapTrigger(position: Vec3Like, kind: 'spike_trap' | 'bouncer_pad'): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.trapTriggers[this.trapTriggerCursor];
    this.trapTriggerCursor = (this.trapTriggerCursor + 1) % TRAP_TRIGGER_POOL_SIZE;

    const safeKind = kind === 'bouncer_pad' ? 'bouncer_pad' : 'spike_trap';
    const isBouncer = safeKind === 'bouncer_pad';

    slot.active = true;
    slot.age = 0;
    slot.duration = isBouncer ? 0.58 : 0.52;
    slot.kind = safeKind;

    slot.group.position.set(position.x, position.y + 0.05, position.z);
    slot.group.visible = true;

    slot.baseRingMat.color.setHex(isBouncer ? 0x22d3ee : 0xef4444);
    slot.baseRingMat.opacity = 0.92;
    slot.baseRingMesh.scale.setScalar(0.55);

    slot.pulseRingMat.color.setHex(isBouncer ? 0xa855f7 : 0xf87171);
    slot.pulseRingMat.opacity = 0.88;
    slot.pulseRingMesh.position.y = 0.1;
    slot.pulseRingMesh.scale.setScalar(0.45);

    slot.columnMesh.visible = isBouncer;
    slot.columnMat.opacity = 0.48;
    slot.columnMesh.position.y = 1.0;
    slot.columnMesh.scale.set(1.1, 2.0, 1.1);

    slot.spikeMat.opacity = 0.95;
    for (let s = 0; s < TRAP_TRIGGER_SPIKE_COUNT; s++) {
      const sp = slot.spikes[s];
      sp.visible = !isBouncer;
      sp.position.y = 0.45;
      sp.scale.set(0.14, 0.9, 0.14);
    }

    for (let m = 0; m < TRAP_TRIGGER_MOTE_COUNT; m++) {
      const mt = slot.motes[m];
      const ang = (m / TRAP_TRIGGER_MOTE_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      if (isBouncer) {
        mt.vx = Math.cos(ang) * (0.4 + this.nextRand() * 0.6);
        mt.vy = 4.2 + this.nextRand() * 3.4;
        mt.vz = Math.sin(ang) * (0.4 + this.nextRand() * 0.6);
        mt.material.color.setHex(m % 2 === 0 ? 0x22d3ee : 0xa855f7);
      } else {
        const horiz = 1.8 + this.nextRand() * 2.4;
        mt.vx = Math.cos(ang) * horiz;
        mt.vy = 2.4 + this.nextRand() * 2.2;
        mt.vz = Math.sin(ang) * horiz;
        mt.material.color.setHex(m % 2 === 0 ? 0xef4444 : 0xfef08a);
      }
      mt.baseScale = 0.085 + this.nextRand() * 0.05;
      mt.mesh.position.set(Math.cos(ang) * 0.35, 0.15, Math.sin(ang) * 0.35);
      mt.mesh.scale.setScalar(mt.baseScale);
      mt.material.opacity = 1;
      mt.mesh.visible = true;
    }
  }

  private spawnDroneExplode(position: Vec3Like, rarity: Rarity): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.droneExplodes[this.droneExplodeCursor];
    this.droneExplodeCursor = (this.droneExplodeCursor + 1) % DRONE_EXPLODE_POOL_SIZE;

    const rarityColor = RARITY_COLORS[rarity] ?? RARITY_COLORS.rare;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.72;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.coreMesh.scale.setScalar(0.35);
    slot.coreMat.opacity = 0.96;

    slot.outerMesh.scale.setScalar(0.65);
    slot.outerMat.color.set(rarityColor);
    slot.outerMat.opacity = 0.78;

    slot.ringMesh.scale.setScalar(0.65);
    slot.ringMat.color.set(rarityColor);
    slot.ringMat.opacity = 0.92;

    slot.tiltRingMesh.rotation.set(Math.PI / 3, this.nextRand() * Math.PI, Math.PI / 4);
    slot.tiltRingMesh.scale.setScalar(0.45);
    slot.tiltRingMat.color.set(rarityColor);
    slot.tiltRingMat.opacity = 0.86;

    for (let s = 0; s < DRONE_EXPLODE_SHARD_COUNT; s++) {
      const sh = slot.shards[s];
      const ang = (s / DRONE_EXPLODE_SHARD_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      const spd = 2.6 + this.nextRand() * 3.8;
      sh.vx = Math.cos(ang) * spd;
      sh.vy = 1.6 + this.nextRand() * 3.4;
      sh.vz = Math.sin(ang) * spd;
      sh.rx = (this.nextRand() - 0.5) * 14;
      sh.ry = (this.nextRand() - 0.5) * 14;
      sh.baseScale = sh.isHullDebris ? 0.14 + this.nextRand() * 0.08 : 0.11 + this.nextRand() * 0.06;
      sh.mesh.position.set(0, 0, 0);
      sh.mesh.rotation.set(this.nextRand() * 2, this.nextRand() * 2, 0);
      sh.mesh.scale.setScalar(sh.baseScale);
      if (!sh.isHullDebris) {
        sh.material.color.set(s % 2 === 0 ? rarityColor : '#ffffff');
      }
      sh.material.opacity = 1;
      sh.mesh.visible = true;
    }
  }

  private spawnRebootBeam(position: Vec3Like, progress: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const safeProgress = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);

    // Reuse an active reboot beam at the same van so 5.0s channel updates smoothly
    let slot = this.rebootBeams.find((rb) => {
      if (!rb.active) return false;
      const dx = rb.group.position.x - position.x;
      const dy = rb.group.position.y - position.y;
      const dz = rb.group.position.z - position.z;
      return dx * dx + dy * dy + dz * dz < 1.44;
    });

    if (!slot) {
      slot =
        this.rebootBeams.find((rb) => !rb.active) ??
        this.rebootBeams[this.rebootBeamCursor];
      this.rebootBeamCursor = (this.rebootBeamCursor + 1) % REBOOT_BEAM_POOL_SIZE;
    }

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.6;
    slot.progress = safeProgress;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.outerBeamMesh.scale.set(0.75 + 0.45 * safeProgress, 18, 0.75 + 0.45 * safeProgress);
    slot.outerBeamMat.color.setHex(safeProgress > 0.85 ? 0x34d399 : 0x22d3ee);
    slot.outerBeamMat.opacity = 0.30 + 0.20 * safeProgress;

    slot.coreBeamMesh.scale.set(0.22 + 0.14 * safeProgress, 22, 0.22 + 0.14 * safeProgress);
    slot.coreBeamMat.opacity = 0.65 + 0.25 * safeProgress;

    slot.baseRingMat.color.setHex(safeProgress > 0.8 ? 0xfde047 : 0x22d3ee);
    slot.baseRingMesh.scale.setScalar(0.95 + 1.15 * safeProgress);
    slot.baseRingMat.opacity = 0.94;

    slot.pulseRingMesh.position.y = 0.2;
    slot.pulseRingMesh.scale.setScalar(0.85);
    slot.pulseRingMat.opacity = 0.9;

    for (let s = 0; s < REBOOT_BEAM_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / REBOOT_BEAM_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      sp.radius = 0.55 + this.nextRand() * 0.45;
      sp.speedY = 1.8 + this.nextRand() * 2.0;
      sp.baseScale = 0.09 + this.nextRand() * 0.045;
      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.2 + this.nextRand() * 0.9,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.96;
      sp.mesh.visible = true;
    }
  }

  private spawnBunkerDeploy(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.bunkerDeploys[this.bunkerDeployCursor];
    this.bunkerDeployCursor = (this.bunkerDeployCursor + 1) % BUNKER_DEPLOY_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.78;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.baseSquareMesh.scale.setScalar(0.8);
    slot.baseSquareMat.opacity = 0.94;

    slot.holoFrameMesh.position.y = 0.2;
    slot.holoFrameMesh.scale.set(1.2, 0.4, 1.2);
    slot.holoFrameMat.opacity = 0.85;

    slot.shellMesh.position.y = 0.2;
    slot.shellMesh.scale.set(1.18, 0.39, 1.18);
    slot.shellMat.opacity = 0.28;

    for (let s = 0; s < BUNKER_DEPLOY_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / BUNKER_DEPLOY_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.25;
      sp.radius = 1.4 + this.nextRand() * 0.7;
      sp.speedY = 1.8 + this.nextRand() * 2.0;
      sp.baseScale = 0.11 + this.nextRand() * 0.06;
      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius * 0.45,
        0.1 + this.nextRand() * 0.4,
        Math.sin(sp.angle) * sp.radius * 0.45,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.96;
      sp.mesh.visible = true;
    }
  }

  private spawnEmpBlast(position: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.empBlasts[this.empBlastCursor];
    this.empBlastCursor = (this.empBlastCursor + 1) % EMP_BLAST_POOL_SIZE;

    const safeRadius = clamp(Number.isFinite(radius) && radius > 0 ? radius : 6.5, 1.5, 40);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.68;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.1, position.z);
    slot.group.visible = true;

    slot.coreMesh.scale.setScalar(safeRadius * 0.18);
    slot.coreMat.opacity = 0.96;

    slot.domeMesh.scale.setScalar(safeRadius * 0.28);
    slot.domeMat.opacity = 0.82;

    slot.outerRingMesh.scale.setScalar(safeRadius * 0.24);
    slot.outerRingMat.opacity = 0.95;

    slot.tiltRingMesh.rotation.set(Math.PI / 3, this.nextRand() * Math.PI, Math.PI / 5);
    slot.tiltRingMesh.scale.setScalar(safeRadius * 0.22);
    slot.tiltRingMat.opacity = 0.88;

    for (let a = 0; a < EMP_BLAST_ARC_COUNT; a++) {
      const arc = slot.arcs[a];
      const ang = (a / EMP_BLAST_ARC_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      const spd = safeRadius * (0.9 + this.nextRand() * 0.9);
      arc.vx = Math.cos(ang) * spd;
      arc.vy = safeRadius * (0.25 + this.nextRand() * 0.45);
      arc.vz = Math.sin(ang) * spd;
      arc.rx = (this.nextRand() - 0.5) * 18;
      arc.ry = (this.nextRand() - 0.5) * 18;
      arc.baseScale = Math.max(0.12, safeRadius * 0.032);
      arc.mesh.position.set(0, 0.1, 0);
      arc.mesh.rotation.set(this.nextRand() * Math.PI, this.nextRand() * Math.PI, 0);
      arc.mesh.scale.setScalar(arc.baseScale);
      arc.material.opacity = 1;
      arc.mesh.visible = true;
    }
  }

  private spawnWeaponMod(position: Vec3Like, modId: WeaponModId): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.weaponMods[this.weaponModCursor];
    this.weaponModCursor = (this.weaponModCursor + 1) % WEAPON_MOD_POOL_SIZE;

    const hexColor = getWeaponModColor(modId);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.75;

    slot.group.position.set(position.x, position.y + 0.15, position.z);
    slot.group.visible = true;

    slot.outerRingMat.color.set(hexColor);
    slot.outerRingMat.opacity = 0.94;
    slot.outerRingMesh.scale.setScalar(0.32);

    slot.upperRingMat.color.set(hexColor);
    slot.upperRingMat.opacity = 0.9;
    slot.upperRingMesh.position.set(0, 0.1, 0);
    slot.upperRingMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.upperRingMesh.scale.setScalar(0.24);

    slot.coreMat.color.set(hexColor);
    slot.coreMat.opacity = 0.95;
    slot.coreMesh.position.set(0, 0.35, 0);
    slot.coreMesh.scale.setScalar(0.26);

    for (let s = 0; s < WEAPON_MOD_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / WEAPON_MOD_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      sp.radius = 0.24 + this.nextRand() * 0.38;
      sp.speedY = 1.4 + this.nextRand() * 1.4;
      sp.spin = (s % 2 === 0 ? 1 : -1) * (3.5 + this.nextRand() * 2.5);
      sp.baseScale = 0.07 + this.nextRand() * 0.04;
      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.08 + this.nextRand() * 0.25,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.color.set(s % 4 === 0 ? '#ffffff' : hexColor);
      sp.material.opacity = 1;
      sp.mesh.visible = true;
    }
  }

  private spawnForecastPulse(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.forecastPulses[this.forecastPulseCursor];
    this.forecastPulseCursor = (this.forecastPulseCursor + 1) % FORECAST_PULSE_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.25;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.beaconMesh.position.y = 2.0;
    slot.beaconMesh.scale.set(0.95, 4, 0.95);
    slot.beaconMat.opacity = 0.44;

    slot.coreBeamMesh.position.y = 2.2;
    slot.coreBeamMesh.scale.set(0.28, 4.4, 0.28);
    slot.coreBeamMat.opacity = 0.78;

    slot.groundRingMesh.scale.setScalar(0.8);
    slot.groundRingMat.opacity = 0.94;

    slot.skyRingMesh.position.y = 0.5;
    slot.skyRingMesh.scale.setScalar(0.6);
    slot.skyRingMat.opacity = 0.9;

    for (let s = 0; s < FORECAST_PULSE_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / FORECAST_PULSE_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.25;
      sp.radius = 0.65 + this.nextRand() * 0.65;
      sp.speedY = 3.2 + this.nextRand() * 3.4;
      sp.baseScale = 0.10 + this.nextRand() * 0.06;
      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.2 + this.nextRand() * 1.2,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.95;
      sp.mesh.visible = true;
    }
  }

  private spawnJetpackFlame(position: Vec3Like, direction: Vec3Like, intensity: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.jetpackFlames[this.jetpackFlameCursor];
    this.jetpackFlameCursor = (this.jetpackFlameCursor + 1) % JETPACK_FLAME_POOL_SIZE;

    const rawDir = isFiniteVec3(direction) ? direction : { x: 0, y: -1, z: 0 };
    const lenSq = rawDir.x * rawDir.x + rawDir.y * rawDir.y + rawDir.z * rawDir.z;
    const safeDir: Vec3Like = lenSq >= 1e-8 ? rawDir : { x: 0, y: -1, z: 0 };
    const safeIntensity = clamp(Number.isFinite(intensity) && intensity > 0 ? intensity : 1, 0.1, 2.5);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.26;
    slot.intensity = safeIntensity;

    slot.group.position.set(position.x, position.y, position.z);
    this.orientToDirection(slot.group, safeDir, this.zAxis);
    slot.group.visible = true;

    const coneXZ = 0.16 + 0.08 * safeIntensity;
    const coneY = 0.38 + 0.24 * safeIntensity;
    slot.leftCone.scale.set(coneXZ, coneY, coneXZ);
    slot.rightCone.scale.set(coneXZ, coneY, coneXZ);
    slot.leftCoreCone.scale.set(coneXZ * 0.52, coneY * 0.68, coneXZ * 0.52);
    slot.rightCoreCone.scale.set(coneXZ * 0.52, coneY * 0.68, coneXZ * 0.52);
    slot.outerMat.opacity = 0.92;
    slot.coreMat.opacity = 0.96;

    for (let s = 0; s < JETPACK_FLAME_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      const sideX = s % 2 === 0 ? -0.135 : 0.135;
      sp.baseScale = 0.06 + this.nextRand() * 0.045;
      sp.mesh.position.set(
        sideX + (this.nextRand() - 0.5) * 0.06,
        (this.nextRand() - 0.5) * 0.06,
        0.15 + this.nextRand() * 0.12,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.95;
      sp.mesh.visible = true;
      sp.vx = (this.nextRand() - 0.5) * 1.4;
      sp.vy = (this.nextRand() - 0.5) * 1.4;
      sp.vz = (3.4 + this.nextRand() * 3.8) * (0.6 + 0.4 * safeIntensity);
    }
  }

  private spawnFlameStream(origin: Vec3Like, direction: Vec3Like, range: number): void {
    if (this.disposed || !isFiniteVec3(origin)) return;

    const slot = this.flameStreams[this.flameStreamCursor];
    this.flameStreamCursor = (this.flameStreamCursor + 1) % FLAME_STREAM_POOL_SIZE;

    const rawDir = isFiniteVec3(direction) ? direction : { x: 0, y: 0, z: 1 };
    const lenSq = rawDir.x * rawDir.x + rawDir.y * rawDir.y + rawDir.z * rawDir.z;
    const safeDir: Vec3Like = lenSq >= 1e-8 ? rawDir : { x: 0, y: 0, z: 1 };
    const safeRange = clamp(Number.isFinite(range) && range > 0 ? range : 14, 1.5, 45);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.36;
    slot.range = safeRange;

    slot.group.position.set(origin.x, origin.y, origin.z);
    this.orientToDirection(slot.group, safeDir, this.zAxis);
    slot.group.visible = true;

    const initLen = safeRange * 0.35;
    const initSpread = Math.max(0.45, safeRange * 0.14);
    slot.outerConeMesh.position.set(0, 0, initLen * 0.5);
    slot.outerConeMesh.scale.set(initSpread, initLen, initSpread);
    slot.outerConeMat.opacity = 0.62;

    slot.coreConeMesh.position.set(0, 0, initLen * 0.34);
    slot.coreConeMesh.scale.set(initSpread * 0.48, initLen * 0.68, initSpread * 0.48);
    slot.coreConeMat.opacity = 0.85;

    for (let p = 0; p < FLAME_STREAM_PUFF_COUNT; p++) {
      const pf = slot.puffs[p];
      const ang = this.nextRand() * Math.PI * 2;
      const radialSpread = 0.4 + this.nextRand() * 1.3;
      pf.vx = Math.cos(ang) * radialSpread;
      pf.vy = Math.sin(ang) * radialSpread + 0.45;
      pf.vz = safeRange * (1.85 + this.nextRand() * 1.15);
      pf.rx = (this.nextRand() - 0.5) * 10;
      pf.ry = (this.nextRand() - 0.5) * 10;
      pf.baseScale = Math.max(0.24, safeRange * 0.036 * (0.75 + this.nextRand() * 0.5));
      pf.mesh.position.set(
        (this.nextRand() - 0.5) * 0.16,
        (this.nextRand() - 0.5) * 0.16,
        0.2 + this.nextRand() * 0.6,
      );
      pf.mesh.scale.setScalar(pf.baseScale);
      pf.material.opacity = 0.9;
      pf.mesh.visible = true;
    }
  }

  private spawnMeteorStrike(position: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.meteorStrikes[this.meteorStrikeCursor];
    this.meteorStrikeCursor = (this.meteorStrikeCursor + 1) % METEOR_STRIKE_POOL_SIZE;

    const safeRadius = clamp(Number.isFinite(radius) && radius > 0 ? radius : 10, 1.5, 60);

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.45;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.meteorMesh.position.set(-9.0, 26.0, -5.0);
    slot.meteorMesh.scale.setScalar(1.35);
    slot.meteorMat.opacity = 0.98;

    slot.trailConeMesh.position.set(-9.0 - 0.32 * 4.5, 26.0 + 0.93 * 4.5, -5.0 - 0.18 * 4.5);
    slot.trailConeMesh.scale.set(1.5, 9.5, 1.5);
    slot.trailConeMat.opacity = 0.78;

    slot.innerTrailMesh.position.set(-9.0 - 0.32 * 3.5, 26.0 + 0.93 * 3.5, -5.0 - 0.18 * 3.5);
    slot.innerTrailMesh.scale.set(0.75, 7.5, 0.75);
    slot.innerTrailMat.opacity = 0.92;

    slot.blastSphereMesh.scale.setScalar(0.1);
    slot.blastSphereMat.opacity = 0;
    slot.coreFlashMesh.scale.setScalar(0.1);
    slot.coreFlashMat.opacity = 0;
    slot.shockRingMesh.scale.setScalar(0.2);
    slot.shockRingMat.opacity = 0;
    slot.outerShockRingMesh.scale.setScalar(0.2);
    slot.outerShockRingMat.opacity = 0;
    slot.tiltedRingMesh.rotation.set(Math.PI / 3, this.nextRand() * Math.PI, Math.PI / 5);
    slot.tiltedRingMesh.scale.setScalar(0.2);
    slot.tiltedRingMat.opacity = 0;

    for (let e = 0; e < METEOR_STRIKE_EMBER_COUNT; e++) {
      const em = slot.embers[e];
      const ang = (e / METEOR_STRIKE_EMBER_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const spd = safeRadius * (0.85 + this.nextRand() * 1.1);
      em.vx = Math.cos(ang) * spd;
      em.vy = safeRadius * (0.65 + this.nextRand() * 0.95);
      em.vz = Math.sin(ang) * spd;
      em.rx = (this.nextRand() - 0.5) * 14;
      em.ry = (this.nextRand() - 0.5) * 14;
      em.baseScale = Math.max(0.16, safeRadius * (em.isRock ? 0.042 : 0.036));
      em.mesh.position.set(0, 0.2, 0);
      em.mesh.scale.setScalar(em.baseScale);
      em.material.opacity = 1;
      em.mesh.visible = false;
    }
  }

  private spawnHopCrystalAura(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.hopCrystalAuras[this.hopCrystalAuraCursor];
    this.hopCrystalAuraCursor = (this.hopCrystalAuraCursor + 1) % HOP_CRYSTAL_AURA_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.95;

    slot.group.position.set(position.x, position.y + 0.05, position.z);
    slot.group.visible = true;

    slot.groundRingMesh.scale.setScalar(0.55);
    slot.groundRingMat.opacity = 0.94;

    slot.levitateRingMesh.position.set(0, 0.15, 0);
    slot.levitateRingMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.levitateRingMesh.scale.setScalar(0.45);
    slot.levitateRingMat.opacity = 0.9;

    slot.auraShellMesh.position.set(0, 0.9, 0);
    slot.auraShellMesh.scale.set(0.75, 1.5, 0.75);
    slot.auraShellMat.opacity = 0.36;

    for (let m = 0; m < HOP_CRYSTAL_MOTE_COUNT; m++) {
      const mt = slot.motes[m];
      mt.angle = (m / HOP_CRYSTAL_MOTE_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      mt.radius = 0.38 + this.nextRand() * 0.45;
      mt.speedY = 1.9 + this.nextRand() * 1.8;
      mt.spin = (m % 2 === 0 ? 1 : -1) * (3.8 + this.nextRand() * 2.4);
      mt.baseScale = 0.085 + this.nextRand() * 0.055;
      mt.mesh.position.set(
        Math.cos(mt.angle) * mt.radius,
        0.1 + this.nextRand() * 0.5,
        Math.sin(mt.angle) * mt.radius,
      );
      mt.mesh.scale.setScalar(mt.baseScale);
      mt.material.opacity = 0.96;
      mt.mesh.visible = true;
    }
  }

  private spawnHammerSlam(position: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.hammerSlams[this.hammerSlamCursor];
    this.hammerSlamCursor = (this.hammerSlamCursor + 1) % HAMMER_SLAM_POOL_SIZE;

    const safeRadius = clamp(Number.isFinite(radius) && radius > 0 ? radius : 5.5, 1.5, 35);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.78;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.05, position.z);
    slot.group.visible = true;

    slot.flashMesh.scale.setScalar(safeRadius * 0.25);
    slot.flashMat.opacity = 0.96;

    slot.domeMesh.scale.setScalar(safeRadius * 0.28);
    slot.domeMat.opacity = 0.44;

    slot.violetRingMesh.scale.setScalar(safeRadius * 0.24);
    slot.violetRingMat.opacity = 0.95;

    slot.cyanRingMesh.scale.setScalar(safeRadius * 0.18);
    slot.cyanRingMat.opacity = 0.92;

    slot.tiltRingMesh.rotation.set(Math.PI / 3, this.nextRand() * Math.PI, Math.PI / 5);
    slot.tiltRingMesh.scale.setScalar(safeRadius * 0.2);
    slot.tiltRingMat.opacity = 0.86;

    for (let s = 0; s < HAMMER_SLAM_SHARD_COUNT; s++) {
      const sh = slot.shards[s];
      const ang = (s / HAMMER_SLAM_SHARD_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const spd = safeRadius * (0.95 + this.nextRand() * 0.95);
      sh.vx = Math.cos(ang) * spd;
      sh.vy = safeRadius * (0.45 + this.nextRand() * 0.75);
      sh.vz = Math.sin(ang) * spd;
      sh.rx = (this.nextRand() - 0.5) * 14;
      sh.ry = (this.nextRand() - 0.5) * 14;
      sh.baseScale = Math.max(0.14, safeRadius * 0.042);
      sh.mesh.position.set(Math.cos(ang) * 0.3, 0.12, Math.sin(ang) * 0.3);
      sh.mesh.rotation.set(this.nextRand() * Math.PI, this.nextRand() * Math.PI, 0);
      sh.mesh.scale.setScalar(sh.baseScale);
      sh.material.opacity = 0.96;
      sh.mesh.visible = true;
    }
  }

  private spawnHammerBounce(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.hammerBounces[this.hammerBounceCursor];
    this.hammerBounceCursor = (this.hammerBounceCursor + 1) % HAMMER_BOUNCE_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.64;

    slot.group.position.set(position.x, position.y + 0.05, position.z);
    slot.group.visible = true;

    slot.groundRingMesh.scale.setScalar(0.55);
    slot.groundRingMat.opacity = 0.94;

    slot.boostRingMesh.position.set(0, 0.15, 0);
    slot.boostRingMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.boostRingMesh.scale.setScalar(0.48);
    slot.boostRingMat.opacity = 0.9;

    slot.columnMesh.position.set(0, 1.2, 0);
    slot.columnMesh.scale.set(0.65, 2.4, 0.65);
    slot.columnMat.opacity = 0.44;

    for (let s = 0; s < HAMMER_BOUNCE_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / HAMMER_BOUNCE_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      sp.radius = 0.45 + this.nextRand() * 0.45;
      sp.speedY = 3.8 + this.nextRand() * 3.2;
      sp.spin = (s % 2 === 0 ? 1 : -1) * (4.2 + this.nextRand() * 3.0);
      sp.baseScale = 0.10 + this.nextRand() * 0.055;
      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.15 + this.nextRand() * 0.45,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.96;
      sp.mesh.visible = true;
    }
  }

  private spawnFlareTrail(origin: Vec3Like, target: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(origin) || !isFiniteVec3(target)) return;

    const slot = this.flareTrails[this.flareTrailCursor];
    this.flareTrailCursor = (this.flareTrailCursor + 1) % FLARE_TRAIL_POOL_SIZE;

    const safeRadius = clamp(Number.isFinite(radius) && radius > 0 ? radius : 15, 1.5, 90);

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.15;
    slot.radius = safeRadius;

    slot.group.position.set(target.x, target.y, target.z);
    slot.group.visible = true;

    this.tmpA.set(origin.x, origin.y, origin.z);
    this.tmpB.set(target.x, target.y, target.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const len = this.tmpDir.length();
    if (Number.isFinite(len) && len >= 1e-4) {
      slot.beamLength = len;
      this.tmpDir.divideScalar(len);
      this.tmpQuat.setFromUnitVectors(this.upAxis, this.tmpDir);
      slot.beamMesh.position.set(
        (origin.x - target.x) * 0.5,
        (origin.y - target.y) * 0.5,
        (origin.z - target.z) * 0.5,
      );
      slot.beamMesh.quaternion.copy(this.tmpQuat);
      slot.beamMesh.scale.set(0.22, len, 0.22);
      slot.beamMat.opacity = 0.88;
      slot.beamMesh.visible = true;
    } else {
      slot.beamLength = 0;
      slot.beamMesh.position.set(0, 0, 0);
      slot.beamMesh.quaternion.identity();
      slot.beamMesh.scale.set(0.05, 0.05, 0.05);
      slot.beamMat.opacity = 0;
      slot.beamMesh.visible = false;
    }

    slot.coreMesh.scale.setScalar(0.65);
    slot.coreMat.opacity = 0.96;

    slot.burstMesh.scale.setScalar(0.8);
    slot.burstMat.opacity = 0.78;

    slot.innerRingMesh.scale.setScalar(0.5);
    slot.innerRingMat.opacity = 0.94;

    slot.scanRingMesh.scale.setScalar(1.0);
    slot.scanRingMat.opacity = 0.9;

    for (let s = 0; s < FLARE_TRAIL_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      const ang = (s / FLARE_TRAIL_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      const spd = 2.2 + this.nextRand() * 4.2;
      sp.vx = Math.cos(ang) * spd;
      sp.vy = 1.4 + this.nextRand() * 3.0;
      sp.vz = Math.sin(ang) * spd;
      sp.rx = (this.nextRand() - 0.5) * 10;
      sp.ry = (this.nextRand() - 0.5) * 10;
      sp.baseScale = 0.14 + this.nextRand() * 0.08;
      sp.mesh.position.set(0, 0.2, 0);
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.95;
      sp.mesh.visible = true;
    }
  }

  private spawnWaterWake(position: Vec3Like, yaw: number, speed: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.waterWakes[this.waterWakeCursor];
    this.waterWakeCursor = (this.waterWakeCursor + 1) % WATER_WAKE_POOL_SIZE;

    const safeYaw = Number.isFinite(yaw) ? yaw : 0;
    const safeSpeed = clamp(Number.isFinite(speed) && speed >= 0 ? speed : 6, 0.5, 45);
    const speedScale = clamp(0.6 + safeSpeed * 0.055, 0.6, 2.4);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.72;
    slot.speedScale = speedScale;

    slot.group.position.set(position.x, position.y + 0.04, position.z);
    slot.group.rotation.set(0, safeYaw, 0);
    slot.group.visible = true;

    slot.leftWakeMesh.position.set(-0.52 * speedScale, 0.03, -0.35 * speedScale);
    slot.leftWakeMesh.scale.set(0.18 * speedScale, 0.05, 1.1 * speedScale);
    slot.rightWakeMesh.position.set(0.52 * speedScale, 0.03, -0.35 * speedScale);
    slot.rightWakeMesh.scale.set(0.18 * speedScale, 0.05, 1.1 * speedScale);
    slot.wakeMat.opacity = 0.78;

    slot.rippleRingMesh.scale.setScalar(0.75 * speedScale);
    slot.rippleRingMat.opacity = 0.82;

    slot.foamRingMesh.scale.setScalar(0.45 * speedScale);
    slot.foamRingMat.opacity = 0.88;

    for (let d = 0; d < WATER_WAKE_DROPLET_COUNT; d++) {
      const dr = slot.droplets[d];
      const side = d % 2 === 0 ? -1 : 1;
      dr.vx = side * (1.8 + this.nextRand() * 2.4) * speedScale;
      dr.vy = (2.2 + this.nextRand() * 2.0) * (0.7 + 0.3 * speedScale);
      dr.vz = -(1.2 + this.nextRand() * 2.2) * speedScale;
      dr.baseScale = (0.075 + this.nextRand() * 0.045) * (0.85 + 0.25 * speedScale);
      dr.mesh.position.set(side * 0.45, 0.1, -0.25);
      dr.mesh.scale.setScalar(dr.baseScale);
      dr.material.opacity = 0.9;
      dr.mesh.visible = true;
    }
  }

  private spawnTurretDeploy(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.turretDeploys[this.turretDeployCursor];
    this.turretDeployCursor = (this.turretDeployCursor + 1) % TURRET_DEPLOY_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.76;

    slot.group.position.set(position.x, position.y + 0.04, position.z);
    slot.group.visible = true;

    slot.baseRingMesh.scale.setScalar(0.55);
    slot.baseRingMat.opacity = 0.94;

    slot.lockRingMesh.position.set(0, 0.14, 0);
    slot.lockRingMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.lockRingMesh.scale.setScalar(0.45);
    slot.lockRingMat.opacity = 0.9;

    slot.holoDomeMesh.position.set(0, 0.45, 0);
    slot.holoDomeMesh.rotation.set(0, 0, 0);
    slot.holoDomeMesh.scale.setScalar(0.55);
    slot.holoDomeMat.opacity = 0.56;

    for (let s = 0; s < TURRET_DEPLOY_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / TURRET_DEPLOY_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      sp.radius = 0.48 + this.nextRand() * 0.48;
      sp.speedY = 1.6 + this.nextRand() * 1.8;
      sp.spin = (s % 2 === 0 ? 1 : -1) * (3.2 + this.nextRand() * 2.4);
      sp.baseScale = 0.09 + this.nextRand() * 0.05;
      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius * 0.65,
        0.1 + this.nextRand() * 0.3,
        Math.sin(sp.angle) * sp.radius * 0.65,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.96;
      sp.mesh.visible = true;
    }
  }

  private spawnTurretLaser(from: Vec3Like, to: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(from) || !isFiniteVec3(to)) return;

    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const rawLen = this.tmpDir.length();
    if (!Number.isFinite(rawLen) || rawLen < 1e-4) return;

    const len = clamp(rawLen, 0.05, 500);
    this.tmpDir.divideScalar(rawLen);

    const slot = this.turretLasers[this.turretLaserCursor];
    this.turretLaserCursor = (this.turretLaserCursor + 1) % TURRET_LASER_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.18;
    slot.beamLength = len;

    slot.group.position.copy(this.tmpA);
    slot.group.visible = true;

    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
    slot.beamGroup.quaternion.copy(this.tmpQuat);

    slot.outerBeamMesh.position.set(0, 0, len * 0.5);
    slot.outerBeamMesh.scale.set(0.085, len, 0.085);
    slot.outerBeamMat.opacity = 0.85;

    slot.coreBeamMesh.position.set(0, 0, len * 0.5);
    slot.coreBeamMesh.scale.set(0.036, len, 0.036);
    slot.coreBeamMat.opacity = 0.98;

    slot.muzzleFlashMesh.position.set(0, 0, 0);
    slot.muzzleFlashMesh.scale.setScalar(0.24);
    slot.muzzleFlashMat.opacity = 0.95;

    slot.impactRingMesh.position.set(0, 0, len);
    slot.impactRingMesh.scale.setScalar(0.24);
    slot.impactRingMat.opacity = 0.94;

    slot.impactFlashMesh.position.set(0, 0, len);
    slot.impactFlashMesh.scale.setScalar(0.28);
    slot.impactFlashMat.opacity = 0.96;
  }

  private spawnSlurpOrb(position: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.slurpOrbs[this.slurpOrbCursor];
    this.slurpOrbCursor = (this.slurpOrbCursor + 1) % SLURP_ORB_POOL_SIZE;

    const safeRadius = clamp(Number.isFinite(radius) && radius > 0 ? radius : 4.5, 1.2, 25);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.75;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.06, position.z);
    slot.group.visible = true;

    slot.domeMesh.scale.set(safeRadius * 0.32, safeRadius * 0.28, safeRadius * 0.32);
    slot.domeMat.opacity = 0.46;

    slot.coreMesh.scale.setScalar(safeRadius * 0.36);
    slot.coreMat.opacity = 0.85;

    slot.ringMesh.scale.setScalar(safeRadius * 0.32);
    slot.ringMat.opacity = 0.92;

    slot.tiltRingMesh.rotation.set(Math.PI / 4, this.nextRand() * Math.PI, Math.PI / 6);
    slot.tiltRingMesh.scale.setScalar(safeRadius * 0.25);
    slot.tiltRingMat.opacity = 0.86;

    for (let d = 0; d < SLURP_ORB_DROPLET_COUNT; d++) {
      const dr = slot.droplets[d];
      const ang = (d / SLURP_ORB_DROPLET_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const horiz = (0.75 + this.nextRand() * 1.45) * Math.min(2.4, safeRadius * 0.5);
      dr.vx = Math.cos(ang) * horiz;
      dr.vy = 2.4 + this.nextRand() * 2.4;
      dr.vz = Math.sin(ang) * horiz;
      dr.baseScale = 0.09 + this.nextRand() * 0.06;
      dr.mesh.position.set(Math.cos(ang) * 0.25, 0.22 + this.nextRand() * 0.25, Math.sin(ang) * 0.25);
      dr.mesh.scale.setScalar(dr.baseScale);
      dr.material.opacity = 0.96;
      dr.mesh.visible = true;
    }
  }

  private spawnFishingSplash(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.fishingSplashes[this.fishingSplashCursor];
    this.fishingSplashCursor = (this.fishingSplashCursor + 1) % FISHING_SPLASH_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.68;

    slot.group.position.set(position.x, position.y + 0.04, position.z);
    slot.group.visible = true;

    slot.outerRingMesh.scale.setScalar(0.55);
    slot.outerRingMat.opacity = 0.88;

    slot.innerRingMesh.scale.setScalar(0.32);
    slot.innerRingMat.opacity = 0.92;

    slot.plumeMesh.position.set(0, 0.25, 0);
    slot.plumeMesh.scale.set(0.48, 0.45, 0.48);
    slot.plumeMat.opacity = 0.54;

    for (let d = 0; d < FISHING_SPLASH_DROPLET_COUNT; d++) {
      const dr = slot.droplets[d];
      const ang = (d / FISHING_SPLASH_DROPLET_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      const horiz = 0.9 + this.nextRand() * 1.65;
      dr.vx = Math.cos(ang) * horiz;
      dr.vy = 3.2 + this.nextRand() * 2.6;
      dr.vz = Math.sin(ang) * horiz;
      dr.baseScale = 0.075 + this.nextRand() * 0.05;
      dr.mesh.position.set(Math.cos(ang) * 0.18, 0.14 + this.nextRand() * 0.15, Math.sin(ang) * 0.18);
      dr.mesh.scale.setScalar(dr.baseScale);
      dr.material.opacity = 0.94;
      dr.mesh.visible = true;
    }
  }

  private spawnTankShell(origin: Vec3Like, target: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(origin) || !isFiniteVec3(target)) return;

    const slot = this.tankShells[this.tankShellCursor];
    this.tankShellCursor = (this.tankShellCursor + 1) % TANK_SHELL_POOL_SIZE;

    const safeRadius = clamp(Number.isFinite(radius) && radius > 0 ? radius : 5.5, 1.5, 35);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.78;
    slot.radius = safeRadius;

    slot.group.position.set(target.x, target.y + 0.05, target.z);
    slot.group.visible = true;

    this.tmpA.set(origin.x, origin.y, origin.z);
    this.tmpB.set(target.x, target.y, target.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const rawLen = this.tmpDir.length();
    if (Number.isFinite(rawLen) && rawLen >= 1e-4) {
      const len = clamp(rawLen, 0.05, 500);
      slot.beamLength = len;
      this.tmpDir.divideScalar(rawLen);
      this.tmpQuat.setFromUnitVectors(this.upAxis, this.tmpDir);
      slot.beamMesh.position.set(
        (origin.x - target.x) * 0.5,
        (origin.y - target.y) * 0.5,
        (origin.z - target.z) * 0.5,
      );
      slot.beamMesh.quaternion.copy(this.tmpQuat);
      slot.beamMesh.scale.set(0.32, len, 0.32);
      slot.beamMat.opacity = 0.86;
      slot.beamMesh.visible = true;

      slot.coreBeamMesh.position.copy(slot.beamMesh.position);
      slot.coreBeamMesh.quaternion.copy(this.tmpQuat);
      slot.coreBeamMesh.scale.set(0.13, len, 0.13);
      slot.coreBeamMat.opacity = 0.96;
      slot.coreBeamMesh.visible = true;
    } else {
      slot.beamLength = 0;
      slot.beamMesh.position.set(0, 0, 0);
      slot.beamMesh.quaternion.identity();
      slot.beamMesh.scale.set(0.05, 0.05, 0.05);
      slot.beamMat.opacity = 0;
      slot.beamMesh.visible = false;

      slot.coreBeamMesh.position.set(0, 0, 0);
      slot.coreBeamMesh.quaternion.identity();
      slot.coreBeamMesh.scale.set(0.05, 0.05, 0.05);
      slot.coreBeamMat.opacity = 0;
      slot.coreBeamMesh.visible = false;
    }

    slot.flashMesh.scale.setScalar(safeRadius * 0.48);
    slot.flashMat.opacity = 0.96;

    slot.fireballMesh.scale.setScalar(safeRadius * 0.35);
    slot.fireballMat.opacity = 0.72;

    slot.shockRingMesh.scale.setScalar(safeRadius * 0.35);
    slot.shockRingMat.opacity = 0.92;

    slot.hexRingMesh.rotation.set(-Math.PI / 2, 0, this.nextRand() * Math.PI);
    slot.hexRingMesh.scale.setScalar(safeRadius * 0.28);
    slot.hexRingMat.opacity = 0.88;

    for (let s = 0; s < TANK_SHELL_SHARD_COUNT; s++) {
      const sh = slot.shards[s];
      const ang = (s / TANK_SHELL_SHARD_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      const spd = (2.8 + this.nextRand() * 5.2) * Math.min(2.2, safeRadius * 0.32);
      sh.vx = Math.cos(ang) * spd;
      sh.vy = 3.4 + this.nextRand() * 4.4;
      sh.vz = Math.sin(ang) * spd;
      sh.rx = (this.nextRand() - 0.5) * 14;
      sh.ry = (this.nextRand() - 0.5) * 14;
      sh.baseScale = 0.14 + this.nextRand() * 0.09;
      sh.mesh.position.set(0, 0.15, 0);
      sh.mesh.scale.setScalar(sh.baseScale);
      sh.material.opacity = 0.95;
      sh.mesh.visible = true;
    }
  }

  private spawnShieldRicochet(position: Vec3Like, normal: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const safeNormal: Vec3Like = isFiniteVec3(normal) ? normal : { x: 0, y: 1, z: 0 };
    this.tmpDir.set(safeNormal.x, safeNormal.y, safeNormal.z);
    if (this.tmpDir.lengthSq() < 1e-8) {
      this.tmpDir.set(0, 1, 0);
    } else {
      this.tmpDir.normalize();
    }

    const slot = this.shieldRicochets[this.shieldRicochetCursor];
    this.shieldRicochetCursor = (this.shieldRicochetCursor + 1) % SHIELD_RICOCHET_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.34;

    slot.group.position.set(
      position.x + this.tmpDir.x * 0.03,
      position.y + this.tmpDir.y * 0.03,
      position.z + this.tmpDir.z * 0.03,
    );
    slot.group.visible = true;

    this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);

    slot.flashMesh.scale.setScalar(0.28);
    slot.flashMat.opacity = 0.96;

    slot.outerRingMesh.quaternion.copy(this.tmpQuat);
    slot.outerRingMesh.scale.setScalar(0.24);
    slot.outerRingMat.opacity = 0.94;

    slot.hexShieldMesh.quaternion.copy(this.tmpQuat);
    slot.hexShieldMesh.scale.setScalar(0.18);
    slot.hexShieldMat.opacity = 0.9;

    for (let s = 0; s < SHIELD_RICOCHET_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      const ang = (s / SHIELD_RICOCHET_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      const spread = 2.6 + this.nextRand() * 4.2;
      this.tmpA.set(
        this.tmpDir.x * 0.85 + Math.cos(ang) * 0.85,
        this.tmpDir.y * 0.85 + (this.nextRand() - 0.15) * 0.95,
        this.tmpDir.z * 0.85 + Math.sin(ang) * 0.85,
      );
      if (this.tmpA.lengthSq() < 1e-6) this.tmpA.set(0, 1, 0);
      this.tmpA.normalize().multiplyScalar(spread);

      sp.vx = this.tmpA.x;
      sp.vy = this.tmpA.y;
      sp.vz = this.tmpA.z;
      sp.rx = (this.nextRand() - 0.5) * 16;
      sp.ry = (this.nextRand() - 0.5) * 16;
      sp.baseScale = 0.075 + this.nextRand() * 0.045;
      sp.mesh.position.set(0, 0, 0);
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.96;
      sp.mesh.visible = true;
    }
  }

  private spawnC4Blast(position: Vec3Like, radius: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.c4Blasts[this.c4BlastCursor];
    this.c4BlastCursor = (this.c4BlastCursor + 1) % C4_BLAST_POOL_SIZE;

    const safeRadius = clamp(Number.isFinite(radius) && radius > 0 ? radius : 5.5, 1.5, 35);

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.88;
    slot.radius = safeRadius;

    slot.group.position.set(position.x, position.y + 0.05, position.z);
    slot.group.visible = true;

    slot.flashMesh.scale.setScalar(safeRadius * 0.52);
    slot.flashMat.opacity = 0.96;

    slot.domeMesh.scale.set(safeRadius * 0.36, safeRadius * 0.32, safeRadius * 0.36);
    slot.domeMat.opacity = 0.62;

    slot.shockRingMesh.scale.setScalar(safeRadius * 0.38);
    slot.shockRingMat.opacity = 0.92;

    slot.emberRingMesh.rotation.set(-Math.PI / 2, 0, this.nextRand() * Math.PI);
    slot.emberRingMesh.scale.setScalar(safeRadius * 0.28);
    slot.emberRingMat.opacity = 0.88;

    for (let s = 0; s < C4_BLAST_SHARD_COUNT; s++) {
      const sh = slot.shards[s];
      const ang = (s / C4_BLAST_SHARD_COUNT) * Math.PI * 2 + this.nextRand() * 0.3;
      const spd = (3.0 + this.nextRand() * 5.6) * Math.min(2.2, safeRadius * 0.34);
      sh.vx = Math.cos(ang) * spd;
      sh.vy = 3.2 + this.nextRand() * 4.8;
      sh.vz = Math.sin(ang) * spd;
      sh.rx = (this.nextRand() - 0.5) * 16;
      sh.ry = (this.nextRand() - 0.5) * 16;
      sh.baseScale = 0.13 + this.nextRand() * 0.085;
      sh.mesh.position.set(0, 0.12, 0);
      sh.mesh.scale.setScalar(sh.baseScale);
      sh.material.opacity = 0.96;
      sh.mesh.visible = true;
    }
  }

  private spawnHotDropBeam(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.hotDropBeams[this.hotDropBeamCursor];
    this.hotDropBeamCursor = (this.hotDropBeamCursor + 1) % HOT_DROP_BEAM_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.25;

    slot.group.position.set(position.x, position.y + 0.04, position.z);
    slot.group.visible = true;

    slot.outerBeamMesh.position.set(0, 14, 0);
    slot.outerBeamMesh.scale.set(1.25, 28, 1.25);
    slot.outerBeamMat.opacity = 0.42;

    slot.coreBeamMesh.position.set(0, 14, 0);
    slot.coreBeamMesh.scale.set(0.48, 28, 0.48);
    slot.coreBeamMat.opacity = 0.72;

    slot.groundRingMesh.scale.setScalar(0.85);
    slot.groundRingMat.opacity = 0.94;

    slot.hexRingMesh.position.set(0, 0.25, 0);
    slot.hexRingMesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.hexRingMesh.scale.setScalar(0.72);
    slot.hexRingMat.opacity = 0.9;

    for (let s = 0; s < HOT_DROP_BEAM_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / HOT_DROP_BEAM_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      sp.radius = 0.85 + this.nextRand() * 0.95;
      sp.speedY = 3.2 + this.nextRand() * 3.8;
      sp.spin = (s % 2 === 0 ? 1 : -1) * (2.6 + this.nextRand() * 2.2);
      sp.baseScale = 0.12 + this.nextRand() * 0.07;
      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.15 + this.nextRand() * 1.4,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.96;
      sp.mesh.visible = true;
    }
  }

  private spawnArcLightning(from: Vec3Like, to: Vec3Like, isChain = false): void {
    if (this.disposed || !isFiniteVec3(from) || !isFiniteVec3(to)) return;

    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const rawLen = this.tmpDir.length();
    if (!Number.isFinite(rawLen) || rawLen < 1e-4) return;

    const len = Math.min(rawLen, 500);
    this.tmpDir.divideScalar(rawLen);
    this.tmpB.copy(this.tmpA).addScaledVector(this.tmpDir, len);

    const slot = this.arcLightnings[this.arcLightningCursor];
    this.arcLightningCursor = (this.arcLightningCursor + 1) % ARC_LIGHTNING_POOL_SIZE;

    const chain = Boolean(isChain);
    slot.active = true;
    slot.age = 0;
    slot.duration = chain ? 0.16 : 0.24;
    slot.isChain = chain;
    slot.coreWidth = chain ? 0.032 : 0.058;
    slot.glowWidth = chain ? 0.088 : 0.155;

    slot.group.position.set(0, 0, 0);
    slot.group.visible = true;

    // Build orthonormal basis perpendicular to the bolt axis for jagged offsets
    if (Math.abs(this.tmpDir.y) < 0.92) {
      this.tmpRight.crossVectors(this.tmpDir, this.upAxis).normalize();
    } else {
      this.tmpOrthoUp.set(1, 0, 0);
      this.tmpRight.crossVectors(this.tmpDir, this.tmpOrthoUp);
      if (this.tmpRight.lengthSq() < 1e-6) {
        this.tmpRight.set(1, 0, 0);
      } else {
        this.tmpRight.normalize();
      }
    }
    this.tmpOrthoUp.crossVectors(this.tmpRight, this.tmpDir).normalize();

    const jitterAmp = clamp(len * 0.065, 0.08, 0.55) * (chain ? 0.85 : 1.0);
    this.arcNodes[0].copy(this.tmpA);
    this.arcNodes[ARC_LIGHTNING_SEGMENT_COUNT].copy(this.tmpB);
    for (let k = 1; k < ARC_LIGHTNING_SEGMENT_COUNT; k++) {
      const frac = k / ARC_LIGHTNING_SEGMENT_COUNT;
      const env = Math.sin(frac * Math.PI);
      const offR = (this.nextRand() - 0.5) * 2 * jitterAmp * env;
      const offU = (this.nextRand() - 0.5) * 2 * jitterAmp * env;
      this.arcNodes[k]
        .lerpVectors(this.tmpA, this.tmpB, frac)
        .addScaledVector(this.tmpRight, offR)
        .addScaledVector(this.tmpOrthoUp, offU);
    }

    for (let s = 0; s < ARC_LIGHTNING_SEGMENT_COUNT; s++) {
      const p0 = this.arcNodes[s];
      const p1 = this.arcNodes[s + 1];
      this.tmpDir.subVectors(p1, p0);
      const segLen = Math.max(1e-4, this.tmpDir.length());
      this.tmpDir.divideScalar(segLen);
      this.tmpQuat.setFromUnitVectors(this.upAxis, this.tmpDir);

      slot.segmentLengths[s] = segLen;

      const coreMesh = slot.coreSegments[s];
      coreMesh.position.addVectors(p0, p1).multiplyScalar(0.5);
      coreMesh.quaternion.copy(this.tmpQuat);
      coreMesh.scale.set(slot.coreWidth, segLen, slot.coreWidth);

      const glowMesh = slot.glowSegments[s];
      glowMesh.position.copy(coreMesh.position);
      glowMesh.quaternion.copy(this.tmpQuat);
      glowMesh.scale.set(slot.glowWidth, segLen, slot.glowWidth);
    }

    slot.coreMat.opacity = 0.98;
    slot.glowMat.opacity = 0.65;
    slot.flashMat.opacity = 0.92;

    const flashScale = chain ? 0.24 : 0.36;
    slot.originFlashMesh.position.copy(this.tmpA);
    slot.originFlashMesh.scale.setScalar(flashScale * 0.75);
    slot.impactFlashMesh.position.copy(this.tmpB);
    slot.impactFlashMesh.scale.setScalar(flashScale);
  }

  private spawnShadowCloakBurst(position: Vec3Like, entering: boolean): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.shadowCloakBursts[this.shadowCloakBurstCursor];
    this.shadowCloakBurstCursor =
      (this.shadowCloakBurstCursor + 1) % SHADOW_CLOAK_BURST_POOL_SIZE;

    const enter = Boolean(entering);
    slot.active = true;
    slot.age = 0;
    slot.duration = 0.62;
    slot.entering = enter;

    slot.group.position.set(position.x, position.y, position.z);
    slot.group.visible = true;

    slot.mistRingMat.color.setHex(enter ? 0x4c1d95 : 0x7c3aed);
    slot.mistRingMat.opacity = 0.85;
    slot.mistRingMesh.scale.setScalar(enter ? 0.45 : 0.35);

    slot.outerRingMat.color.setHex(enter ? 0x7c3aed : 0xa855f7);
    slot.outerRingMat.opacity = 0.78;
    slot.outerRingMesh.position.y = enter ? 0.3 : 0.85;
    slot.outerRingMesh.rotation.set(-Math.PI / 2, 0, this.nextRand() * Math.PI);
    slot.outerRingMesh.scale.setScalar(0.55);

    slot.shroudMat.color.setHex(enter ? 0x1e1038 : 0x5b21b6);
    slot.shroudMat.opacity = 0.44;
    slot.shroudMesh.scale.setScalar(enter ? 1.55 : 0.85);

    for (let w = 0; w < SHADOW_CLOAK_WISP_COUNT; w++) {
      const wp = slot.wisps[w];
      wp.angle = (w / SHADOW_CLOAK_WISP_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      wp.startRadius = enter ? 0.95 + this.nextRand() * 0.45 : 0.25 + this.nextRand() * 0.25;
      wp.endRadius = enter ? 0.2 + this.nextRand() * 0.25 : 1.35 + this.nextRand() * 0.65;
      wp.startY = enter ? 0.2 + this.nextRand() * 0.4 : 0.5 + this.nextRand() * 0.5;
      wp.endY = enter ? 1.2 + this.nextRand() * 0.65 : 0.9 + this.nextRand() * 0.9;
      wp.spin = (enter ? -1 : 1) * (2.6 + this.nextRand() * 2.4);
      wp.baseScale = 0.18 + this.nextRand() * 0.14;
      wp.mesh.position.set(
        Math.cos(wp.angle) * wp.startRadius,
        wp.startY,
        Math.sin(wp.angle) * wp.startRadius,
      );
      wp.mesh.scale.setScalar(wp.baseScale);
      wp.material.opacity = 0.72;
      wp.mesh.visible = true;
    }
  }

  private spawnRuneAttune(position: Vec3Like): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.runeAttunes[this.runeAttuneCursor];
    this.runeAttuneCursor = (this.runeAttuneCursor + 1) % RUNE_ATTUNE_POOL_SIZE;

    slot.active = true;
    slot.age = 0;
    slot.duration = 1.15;

    slot.group.position.set(position.x, position.y + 0.04, position.z);
    slot.group.visible = true;

    slot.outerBeamMesh.position.set(0, 1.75, 0);
    slot.outerBeamMesh.scale.set(0.95, 3.5, 0.95);
    slot.outerBeamMat.opacity = 0.48;

    slot.coreBeamMesh.position.set(0, 1.75, 0);
    slot.coreBeamMesh.scale.set(0.36, 3.5, 0.36);
    slot.coreBeamMat.opacity = 0.78;

    slot.glyphRingMesh.position.set(0, 0.25, 0);
    slot.glyphRingMesh.rotation.set(-Math.PI / 2, 0, this.nextRand() * Math.PI);
    slot.glyphRingMesh.scale.setScalar(0.85);
    slot.glyphRingMat.opacity = 0.92;

    slot.groundRingMesh.scale.setScalar(0.75);
    slot.groundRingMat.opacity = 0.9;

    for (let s = 0; s < RUNE_ATTUNE_SPARK_COUNT; s++) {
      const sp = slot.sparks[s];
      sp.angle = (s / RUNE_ATTUNE_SPARK_COUNT) * Math.PI * 2 + this.nextRand() * 0.35;
      sp.radius = 0.65 + this.nextRand() * 0.75;
      sp.speedY = 3.0 + this.nextRand() * 3.4;
      sp.spin = (s % 2 === 0 ? 1 : -1) * (2.6 + this.nextRand() * 2.2);
      sp.baseScale = 0.12 + this.nextRand() * 0.07;
      sp.mesh.position.set(
        Math.cos(sp.angle) * sp.radius,
        0.15 + this.nextRand() * 1.1,
        Math.sin(sp.angle) * sp.radius,
      );
      sp.mesh.scale.setScalar(sp.baseScale);
      sp.material.opacity = 0.94;
      sp.mesh.visible = true;
    }
  }

  private spawnChoppaWash(position: Vec3Like, intensity: number): void {
    if (this.disposed || !isFiniteVec3(position)) return;

    const slot = this.choppaWashes[this.choppaWashCursor];
    this.choppaWashCursor = (this.choppaWashCursor + 1) % CHOPPA_WASH_POOL_SIZE;

    const safeIntensity = clamp(
      Number.isFinite(intensity) && intensity > 0 ? intensity : 0.65,
      0.2,
      2.5,
    );

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.52;
    slot.intensity = safeIntensity;

    slot.group.position.set(position.x, position.y + 0.08, position.z);
    slot.group.visible = true;

    slot.outerDustRingMesh.scale.setScalar(1.1 * safeIntensity);
    slot.outerDustRingMat.opacity = 0.56;

    slot.innerAirRingMesh.rotation.set(-Math.PI / 2, 0, this.nextRand() * Math.PI);
    slot.innerAirRingMesh.scale.setScalar(0.75 * safeIntensity);
    slot.innerAirRingMat.opacity = 0.48;

    for (let m = 0; m < CHOPPA_WASH_MOTE_COUNT; m++) {
      const mt = slot.motes[m];
      const ang = (m / CHOPPA_WASH_MOTE_COUNT) * Math.PI * 2 + this.nextRand() * 0.4;
      const spd = (3.2 + this.nextRand() * 4.2) * safeIntensity;
      mt.vx = Math.cos(ang) * spd;
      mt.vy = 0.45 + this.nextRand() * 0.85 * safeIntensity;
      mt.vz = Math.sin(ang) * spd;
      mt.baseScale = (0.28 + this.nextRand() * 0.16) * clamp(safeIntensity, 0.65, 1.8);
      mt.mesh.position.set(Math.cos(ang) * 0.65, 0.12, Math.sin(ang) * 0.65);
      mt.mesh.scale.setScalar(mt.baseScale * 0.65);
      mt.material.opacity = 0.46;
      mt.mesh.visible = true;
    }
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
    for (const kd of this.kineticDashes) if (kd.active) count++;
    for (const gb of this.goldBursts) if (gb.active) count++;
    for (const lr of this.lootIslandRifts) if (lr.active) count++;
    for (const be of this.bowExplosions) if (be.active) count++;
    for (const st of this.slurpTankerBursts) if (st.active) count++;
    for (const cg of this.crownGlints) if (cg.active) count++;
    for (const rb of this.reviveBeams) if (rb.active) count++;
    for (const rg of this.railgunBeams) if (rg.active) count++;
    for (const rs of this.railSparks) if (rs.active) count++;
    for (const tt of this.trapTriggers) if (tt.active) count++;
    for (const de of this.droneExplodes) if (de.active) count++;
    for (const rb of this.rebootBeams) if (rb.active) count++;
    for (const bd of this.bunkerDeploys) if (bd.active) count++;
    for (const eb of this.empBlasts) if (eb.active) count++;
    for (const wm of this.weaponMods) if (wm.active) count++;
    for (const fp of this.forecastPulses) if (fp.active) count++;
    for (const jf of this.jetpackFlames) if (jf.active) count++;
    for (const fs of this.flameStreams) if (fs.active) count++;
    for (const ms of this.meteorStrikes) if (ms.active) count++;
    for (const hc of this.hopCrystalAuras) if (hc.active) count++;
    for (const hs of this.hammerSlams) if (hs.active) count++;
    for (const hb of this.hammerBounces) if (hb.active) count++;
    for (const ft of this.flareTrails) if (ft.active) count++;
    for (const ww of this.waterWakes) if (ww.active) count++;
    for (const td of this.turretDeploys) if (td.active) count++;
    for (const tl of this.turretLasers) if (tl.active) count++;
    for (const so of this.slurpOrbs) if (so.active) count++;
    for (const fs of this.fishingSplashes) if (fs.active) count++;
    for (const ts of this.tankShells) if (ts.active) count++;
    for (const sr of this.shieldRicochets) if (sr.active) count++;
    for (const cb of this.c4Blasts) if (cb.active) count++;
    for (const hd of this.hotDropBeams) if (hd.active) count++;
    for (const al of this.arcLightnings) if (al.active) count++;
    for (const sc of this.shadowCloakBursts) if (sc.active) count++;
    for (const ra of this.runeAttunes) if (ra.active) count++;
    for (const cw of this.choppaWashes) if (cw.active) count++;
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

  public getActiveKineticDashCount(): number {
    let count = 0;
    for (const kd of this.kineticDashes) if (kd.active) count++;
    return count;
  }

  public getActiveGoldBurstCount(): number {
    let count = 0;
    for (const gb of this.goldBursts) if (gb.active) count++;
    return count;
  }

  public getActiveLootIslandVfxCount(): number {
    let count = 0;
    for (const lr of this.lootIslandRifts) if (lr.active) count++;
    return count;
  }

  public getActiveBowExplosionCount(): number {
    let count = 0;
    for (const be of this.bowExplosions) if (be.active) count++;
    return count;
  }

  public getActiveSlurpTankerBurstCount(): number {
    let count = 0;
    for (const st of this.slurpTankerBursts) if (st.active) count++;
    return count;
  }

  public getActiveCrownGlintCount(): number {
    let count = 0;
    for (const cg of this.crownGlints) if (cg.active) count++;
    return count;
  }

  public getActiveReviveBeamCount(): number {
    let count = 0;
    for (const rb of this.reviveBeams) if (rb.active) count++;
    return count;
  }

  public getActiveRailgunBeamCount(): number {
    let count = 0;
    for (const rg of this.railgunBeams) if (rg.active) count++;
    return count;
  }

  public getActiveRailSparksCount(): number {
    let count = 0;
    for (const rs of this.railSparks) if (rs.active) count++;
    return count;
  }

  public getActiveTrapTriggerCount(): number {
    let count = 0;
    for (const tt of this.trapTriggers) if (tt.active) count++;
    return count;
  }

  public getActiveDroneExplodeCount(): number {
    let count = 0;
    for (const de of this.droneExplodes) if (de.active) count++;
    return count;
  }

  public getActiveRebootBeamCount(): number {
    let count = 0;
    for (const rb of this.rebootBeams) if (rb.active) count++;
    return count;
  }

  public getBunkerDeployEffectCount(): number {
    let count = 0;
    for (const bd of this.bunkerDeploys) if (bd.active) count++;
    return count;
  }

  public getEmpBlastEffectCount(): number {
    let count = 0;
    for (const eb of this.empBlasts) if (eb.active) count++;
    return count;
  }

  public getWeaponModEffectCount(): number {
    let count = 0;
    for (const wm of this.weaponMods) if (wm.active) count++;
    return count;
  }

  public getForecastPulseEffectCount(): number {
    let count = 0;
    for (const fp of this.forecastPulses) if (fp.active) count++;
    return count;
  }

  public getActiveJetpackFlameCount(): number {
    let count = 0;
    for (const jf of this.jetpackFlames) if (jf.active) count++;
    return count;
  }

  public getActiveFlameStreamCount(): number {
    let count = 0;
    for (const fs of this.flameStreams) if (fs.active) count++;
    return count;
  }

  public getActiveMeteorStrikeCount(): number {
    let count = 0;
    for (const ms of this.meteorStrikes) if (ms.active) count++;
    return count;
  }

  public getActiveHopCrystalAuraCount(): number {
    let count = 0;
    for (const hc of this.hopCrystalAuras) if (hc.active) count++;
    return count;
  }

  public getActiveHammerSlamCount(): number {
    let count = 0;
    for (const hs of this.hammerSlams) if (hs.active) count++;
    return count;
  }

  public getActiveHammerBounceCount(): number {
    let count = 0;
    for (const hb of this.hammerBounces) if (hb.active) count++;
    return count;
  }

  public getActiveFlareTrailCount(): number {
    let count = 0;
    for (const ft of this.flareTrails) if (ft.active) count++;
    return count;
  }

  public getActiveWaterWakeCount(): number {
    let count = 0;
    for (const ww of this.waterWakes) if (ww.active) count++;
    return count;
  }

  public getActiveTurretDeployCount(): number {
    let count = 0;
    for (const td of this.turretDeploys) if (td.active) count++;
    return count;
  }

  public getActiveTurretLaserCount(): number {
    let count = 0;
    for (const tl of this.turretLasers) if (tl.active) count++;
    return count;
  }

  public getActiveSlurpOrbCount(): number {
    let count = 0;
    for (const so of this.slurpOrbs) if (so.active) count++;
    return count;
  }

  public getActiveFishingSplashCount(): number {
    let count = 0;
    for (const fs of this.fishingSplashes) if (fs.active) count++;
    return count;
  }

  public getActiveTankShellCount(): number {
    let count = 0;
    for (const ts of this.tankShells) if (ts.active) count++;
    return count;
  }

  public getActiveShieldRicochetCount(): number {
    let count = 0;
    for (const sr of this.shieldRicochets) if (sr.active) count++;
    return count;
  }

  public getActiveC4BlastCount(): number {
    let count = 0;
    for (const cb of this.c4Blasts) if (cb.active) count++;
    return count;
  }

  public getActiveHotDropBeamCount(): number {
    let count = 0;
    for (const hd of this.hotDropBeams) if (hd.active) count++;
    return count;
  }

  public getActiveArcLightningCount(): number {
    let count = 0;
    for (const al of this.arcLightnings) if (al.active) count++;
    return count;
  }

  public getActiveShadowCloakBurstCount(): number {
    let count = 0;
    for (const sc of this.shadowCloakBursts) if (sc.active) count++;
    return count;
  }

  public getActiveRuneAttuneCount(): number {
    let count = 0;
    for (const ra of this.runeAttunes) if (ra.active) count++;
    return count;
  }

  public getActiveChoppaWashCount(): number {
    let count = 0;
    for (const cw of this.choppaWashes) if (cw.active) count++;
    return count;
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
    for (const kd of this.kineticDashes) {
      kd.active = false;
      kd.group.visible = false;
    }
    for (const gb of this.goldBursts) {
      gb.active = false;
      gb.group.visible = false;
    }
    for (const lr of this.lootIslandRifts) {
      lr.active = false;
      lr.group.visible = false;
    }
    for (const be of this.bowExplosions) {
      be.active = false;
      be.group.visible = false;
    }
    for (const st of this.slurpTankerBursts) {
      st.active = false;
      st.group.visible = false;
    }
    for (const cg of this.crownGlints) {
      cg.active = false;
      cg.group.visible = false;
    }
    for (const rb of this.reviveBeams) {
      rb.active = false;
      rb.group.visible = false;
    }
    for (const rg of this.railgunBeams) {
      rg.active = false;
      rg.group.visible = false;
    }
    for (const rs of this.railSparks) {
      rs.active = false;
      rs.group.visible = false;
    }
    for (const tt of this.trapTriggers) {
      tt.active = false;
      tt.group.visible = false;
    }
    for (const de of this.droneExplodes) {
      de.active = false;
      de.group.visible = false;
    }
    for (const rb of this.rebootBeams) {
      rb.active = false;
      rb.group.visible = false;
    }
    for (const bd of this.bunkerDeploys) {
      bd.active = false;
      bd.group.visible = false;
    }
    for (const eb of this.empBlasts) {
      eb.active = false;
      eb.group.visible = false;
    }
    for (const wm of this.weaponMods) {
      wm.active = false;
      wm.group.visible = false;
    }
    for (const fp of this.forecastPulses) {
      fp.active = false;
      fp.group.visible = false;
    }
    for (const jf of this.jetpackFlames) {
      jf.active = false;
      jf.group.visible = false;
    }
    for (const fs of this.flameStreams) {
      fs.active = false;
      fs.group.visible = false;
    }
    for (const ms of this.meteorStrikes) {
      ms.active = false;
      ms.group.visible = false;
    }
    for (const hc of this.hopCrystalAuras) {
      hc.active = false;
      hc.group.visible = false;
    }
    for (const hs of this.hammerSlams) {
      hs.active = false;
      hs.group.visible = false;
    }
    for (const hb of this.hammerBounces) {
      hb.active = false;
      hb.group.visible = false;
    }
    for (const ft of this.flareTrails) {
      ft.active = false;
      ft.group.visible = false;
    }
    for (const ww of this.waterWakes) {
      ww.active = false;
      ww.group.visible = false;
    }
    for (const td of this.turretDeploys) {
      td.active = false;
      td.group.visible = false;
    }
    for (const tl of this.turretLasers) {
      tl.active = false;
      tl.group.visible = false;
    }
    for (const so of this.slurpOrbs) {
      so.active = false;
      so.group.visible = false;
    }
    for (const fs of this.fishingSplashes) {
      fs.active = false;
      fs.group.visible = false;
    }
    for (const ts of this.tankShells) {
      ts.active = false;
      ts.group.visible = false;
    }
    for (const sr of this.shieldRicochets) {
      sr.active = false;
      sr.group.visible = false;
    }
    for (const cb of this.c4Blasts) {
      cb.active = false;
      cb.group.visible = false;
    }
    for (const hd of this.hotDropBeams) {
      hd.active = false;
      hd.group.visible = false;
    }
    for (const al of this.arcLightnings) {
      al.active = false;
      al.group.visible = false;
    }
    for (const sc of this.shadowCloakBursts) {
      sc.active = false;
      sc.group.visible = false;
    }
    for (const ra of this.runeAttunes) {
      ra.active = false;
      ra.group.visible = false;
    }
    for (const cw of this.choppaWashes) {
      cw.active = false;
      cw.group.visible = false;
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
