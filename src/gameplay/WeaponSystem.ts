import type {
  DamageEvent,
  ExplosiveBarrelEntity,
  ItemInstance,
  LootLlamaEntity,
  MaterialType,
  ProjectileState,
  Rarity,
  SlurpBarrelEntity,
  SlurpTankerEntity,
  SoundEventId,
  Vec3Like,
  VehicleEntity,
  WeaponId,
} from '../types';
import {
  EventBus,
  GRID_XZ,
  GRID_Y,
  RARITY_MULTIPLIER,
  WEAPONS,
  clamp,
  dist3D,
  lerp,
} from '../core';
import type { BuildingSystem } from './BuildingSystem';
import type { CollisionSystem } from './CollisionSystem';
import type {
  CombatActor,
  FireWeaponParams,
  FireWeaponResult,
  PropsInteractionBridge,
  ShieldBubbleState,
  VehicleBridge,
  WorldChapterBridge,
  WorldRiftCaptureBridge,
  WorldStationBridge,
} from './GameplayTypes';

export const WEAPON_SOUND_MAP: Record<WeaponId, SoundEventId> = {
  pickaxe: 'pickaxe_swing',
  ar: 'shot_ar',
  burst_ar: 'shot_burst_ar',
  tactical_dmr: 'shot_dmr',
  pump_shotgun: 'shot_pump',
  tac_shotgun: 'shot_tac',
  heavy_shotgun: 'shot_heavy_shotgun',
  smg: 'shot_smg',
  combat_smg: 'shot_combat_smg',
  sniper: 'shot_sniper',
  boom_bow: 'bow_release',
  pistol: 'shot_pistol',
  rocket_launcher: 'shot_rocket',
  mythic_blade_rifle: 'shot_mythic_rifle',
  kinetic_blade: 'kinetic_slash',
  shockwave_grenade: 'pickaxe_swing',
  frag_grenade: 'pickaxe_swing',
  chug_splash: 'pickaxe_swing',
  grappler: 'grappler_fire',
  shield_bubble: 'pickaxe_swing',
  mini_shield: 'ui_click',
  shield_potion: 'ui_click',
  bandages: 'ui_click',
  medkit: 'ui_click',
  slurp_juice: 'ui_click',
};

const SHOT_SOUND_MAP = WEAPON_SOUND_MAP;

export function computeWeaponDamage(
  weaponId: WeaponId,
  rarity: Rarity,
  distance: number,
  isHeadshot: boolean,
): number {
  const def = WEAPONS[weaponId];
  const rarityMult = RARITY_MULTIPLIER[rarity] ?? 1.0;

  let falloffMult = 1.0;
  if (def.falloffEnd > def.falloffStart && distance > def.falloffStart) {
    const t = clamp(
      (distance - def.falloffStart) / (def.falloffEnd - def.falloffStart),
      0,
      1,
    );
    falloffMult = lerp(1.0, def.minFalloffMult, t);
  }

  const hsMult = isHeadshot ? def.headshotMultiplier : 1.0;
  return Math.round(def.baseDamage * rarityMult * falloffMult * hsMult);
}

function normalizeVec(v: Vec3Like): Vec3Like {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return { x: 0, y: 0, z: -1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function distPointToSegment(
  p: Vec3Like,
  a: Vec3Like,
  b: Vec3Like,
): { dist: number; t: number; closest: Vec3Like } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  const t =
    lenSq > 1e-8
      ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lenSq, 0, 1)
      : 0;
  const closest = {
    x: a.x + abx * t,
    y: a.y + aby * t,
    z: a.z + abz * t,
  };
  return {
    dist: Math.hypot(p.x - closest.x, p.y - closest.y, p.z - closest.z),
    t,
    closest,
  };
}

function applySpreadToDir(dir: Vec3Like, spreadRad: number): Vec3Like {
  if (spreadRad <= 1e-6) return dir;

  // Build orthonormal basis around dir
  const upRef = Math.abs(dir.y) < 0.92 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  // tangent = normalize(cross(upRef, dir))
  let tx = upRef.y * dir.z - upRef.z * dir.y;
  let ty = upRef.z * dir.x - upRef.x * dir.z;
  let tz = upRef.x * dir.y - upRef.y * dir.x;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  // bitangent = cross(dir, tangent)
  const bx = dir.y * tz - dir.z * ty;
  const by = dir.z * tx - dir.x * tz;
  const bz = dir.x * ty - dir.y * tx;

  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * Math.tan(spreadRad);
  const ox = Math.cos(angle) * radius;
  const oy = Math.sin(angle) * radius;

  return normalizeVec({
    x: dir.x + tx * ox + bx * oy,
    y: dir.y + ty * ox + by * oy,
    z: dir.z + tz * ox + bz * oy,
  });
}

interface ActorHit {
  actor: CombatActor;
  distance: number;
  point: Vec3Like;
  normal: Vec3Like;
  isHeadshot: boolean;
}

interface ActiveProjectile extends ProjectileState {
  isPlayer: boolean;
  startPos: Vec3Like;
  isThrowable?: boolean;
  settled?: boolean;
  bounceSoundCooldown?: number;
  demolisherActive?: boolean;
  firstAssaultActive?: boolean;
  combatMedallionActive?: boolean;
}

interface PendingBurst {
  params: FireWeaponParams;
  shotsRemaining: number;
  timer: number;
  interval: number;
}

export class WeaponSystem {
  private collision: CollisionSystem;
  private building: BuildingSystem;
  private propsBridge: PropsInteractionBridge;
  private eventBus: EventBus;

  private actorsProvider: (() => CombatActor[]) | null = null;
  private vehicleBridge: VehicleBridge | null = null;
  private stationBridge: WorldStationBridge | null = null;
  private riftCaptureBridge: WorldRiftCaptureBridge | null = null;
  private chapterBridge: WorldChapterBridge | null = null;
  private explodingBarrelIds = new Set<string>();
  private rupturingTankerIds = new Set<string>();
  private twinMagSlowUids = new Set<string>();
  private onSlurpBarrelBroken:
    | ((actorId: string, shieldAmount: number) => void)
    | null = null;
  private projectiles: ActiveProjectile[] = [];
  private pendingBursts: PendingBurst[] = [];
  private shieldBubbles: ShieldBubbleState[] = [];
  private nextProjId = 1;
  private nextBubbleId = 1;
  private dmgNumSeq = 1;

  constructor(
    collision: CollisionSystem,
    building: BuildingSystem,
    propsBridge: PropsInteractionBridge,
    eventBus: EventBus,
  ) {
    this.collision = collision;
    this.building = building;
    this.propsBridge = propsBridge;
    this.eventBus = eventBus;
  }

  registerActorsProvider(fn: () => CombatActor[]): void {
    this.actorsProvider = fn;
  }

  getActors(): CombatActor[] {
    return this.actorsProvider ? this.actorsProvider() : [];
  }

  setVehicleBridge(bridge: VehicleBridge | null): void {
    this.vehicleBridge = bridge;
  }

  getVehicleBridge(): VehicleBridge | null {
    return this.vehicleBridge;
  }

  setStationBridge(bridge: WorldStationBridge | null): void {
    this.stationBridge = bridge;
  }

  getStationBridge(): WorldStationBridge | null {
    return this.stationBridge;
  }

  setRiftCaptureBridge(bridge: WorldRiftCaptureBridge | null): void {
    this.riftCaptureBridge = bridge;
  }

  getRiftCaptureBridge(): WorldRiftCaptureBridge | null {
    return this.riftCaptureBridge;
  }

  setChapterBridge(bridge: WorldChapterBridge | null): void {
    this.chapterBridge = bridge;
  }

  getChapterBridge(): WorldChapterBridge | null {
    return this.chapterBridge;
  }

  isTwinMagFastReload(item: ItemInstance): boolean {
    const def = WEAPONS[item.weaponId];
    if (!def || def.twinMagFastReloadTime === undefined) return false;
    return !this.twinMagSlowUids.has(item.uid);
  }

  getReloadTime(
    item: ItemInstance,
    opts?: { hasLightFingers?: boolean; hasCombatMedallion?: boolean },
  ): number {
    const def = WEAPONS[item.weaponId];
    if (!def) return 0;
    const baseTime =
      def.twinMagFastReloadTime !== undefined && this.isTwinMagFastReload(item)
        ? def.twinMagFastReloadTime
        : def.reloadTime;
    const augmentScale = opts?.hasLightFingers ? 0.7 : 1.0;
    const medallionScale = opts?.hasCombatMedallion ? 0.8 : 1.0;
    return baseTime * augmentScale * medallionScale;
  }

  completeTwinMagReload(item: ItemInstance): boolean {
    const def = WEAPONS[item.weaponId];
    if (!def || def.twinMagFastReloadTime === undefined) return false;
    const wasFast = !this.twinMagSlowUids.has(item.uid);
    if (wasFast) {
      this.twinMagSlowUids.add(item.uid);
    } else {
      this.twinMagSlowUids.delete(item.uid);
    }
    return wasFast;
  }

  setOnSlurpBarrelBroken(
    cb: ((actorId: string, shieldAmount: number) => void) | null,
  ): void {
    this.onSlurpBarrelBroken = cb;
  }

  getProjectiles(): ProjectileState[] {
    return this.projectiles;
  }

  getActiveShieldBubbles(): Array<{ position: Vec3Like; radius: number }> {
    const active: Array<{ position: Vec3Like; radius: number }> = [];
    for (let i = 0; i < this.shieldBubbles.length; i++) {
      const b = this.shieldBubbles[i];
      if (b.remaining > 0) {
        active.push({
          position: { ...b.position },
          radius: b.radius,
        });
      }
    }
    return active;
  }

  private raycastActors(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
    excludeActorId: string,
  ): ActorHit | null {
    if (!this.actorsProvider) return null;
    const actors = this.actorsProvider();
    let best: ActorHit | null = null;
    let bestDist = maxDist;

    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      if (!actor.alive || actor.id === excludeActorId) continue;

      // 1. Head sphere test
      const headR = Math.max(0.24, actor.radius * 0.62);
      const headCenterY = actor.position.y + actor.height - 0.16;
      const hx = origin.x - actor.position.x;
      const hy = origin.y - headCenterY;
      const hz = origin.z - actor.position.z;
      const bHead = hx * dir.x + hy * dir.y + hz * dir.z;
      const cHead = hx * hx + hy * hy + hz * hz - headR * headR;
      const discHead = bHead * bHead - cHead;

      if (discHead >= 0) {
        const tHead = -bHead - Math.sqrt(discHead);
        if (tHead >= 0 && tHead < bestDist) {
          const px = origin.x + dir.x * tHead;
          const py = origin.y + dir.y * tHead;
          const pz = origin.z + dir.z * tHead;
          const nx = (px - actor.position.x) / headR;
          const ny = (py - headCenterY) / headR;
          const nz = (pz - actor.position.z) / headR;
          bestDist = tHead;
          best = {
            actor,
            distance: tHead,
            point: { x: px, y: py, z: pz },
            normal: { x: nx, y: ny, z: nz },
            isHeadshot: true,
          };
          continue;
        }
      }

      // 2. Body cylinder test in XZ
      const bodyR = actor.radius * 1.08;
      const dx = dir.x;
      const dz = dir.z;
      const ox = origin.x - actor.position.x;
      const oz = origin.z - actor.position.z;

      const a = dx * dx + dz * dz;
      if (a > 1e-8) {
        const b = 2 * (ox * dx + oz * dz);
        const c = ox * ox + oz * oz - bodyR * bodyR;
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sqrtDisc = Math.sqrt(disc);
          const t0 = (-b - sqrtDisc) / (2 * a);
          const t1 = (-b + sqrtDisc) / (2 * a);
          const t = t0 >= 0 ? t0 : t1 >= 0 ? t1 : -1;
          if (t >= 0 && t < bestDist) {
            const hitY = origin.y + dir.y * t;
            if (hitY >= actor.position.y - 0.05 && hitY <= actor.position.y + actor.height) {
              const px = origin.x + dir.x * t;
              const pz = origin.z + dir.z * t;
              const nx = (px - actor.position.x) / bodyR;
              const nz = (pz - actor.position.z) / bodyR;
              const isHeadRegion = hitY >= actor.position.y + actor.height - 0.34;
              bestDist = t;
              best = {
                actor,
                distance: t,
                point: { x: px, y: hitY, z: pz },
                normal: { x: nx, y: 0, z: nz },
                isHeadshot: isHeadRegion,
              };
            }
          }
        }
      }
    }

    return best;
  }

  private applyActorDamage(
    attacker: CombatActor,
    target: CombatActor,
    weaponId: WeaponId,
    rarity: Rarity,
    rawDamage: number,
    isHeadshot: boolean,
    hitPoint: Vec3Like,
    distance: number,
    isPlayerAttacker: boolean,
  ): DamageEvent {
    const damage = Math.max(1, Math.round(rawDamage));
    const overshieldBefore = Math.max(0, target.overshield ?? 0);
    const overshieldDamage = Math.min(overshieldBefore, damage);
    const afterOvershield = damage - overshieldDamage;
    const shieldBefore = Math.max(0, target.shield);
    const shieldDamage = Math.min(shieldBefore, afterOvershield);
    const remaining = afterOvershield - shieldDamage;
    const hpDamage = Math.min(Math.max(0, target.hp), remaining);
    const isElimination = target.hp - hpDamage <= 0;

    if (target.overshield !== undefined) {
      target.overshield = Math.max(0, target.overshield - overshieldDamage);
    }
    target.shield = Math.max(0, target.shield - shieldDamage);
    target.hp = Math.max(0, target.hp - hpDamage);
    if (target.hp <= 0) {
      target.alive = false;
    }

    const ev: DamageEvent = {
      targetId: target.id,
      attackerId: attacker.id,
      attackerName: attacker.name,
      weaponId,
      rarity,
      damage,
      hpDamage,
      shieldDamage,
      isHeadshot,
      isElimination,
      hitPoint,
      distance,
    };

    target.onDamage?.(ev);

    const shieldBroke =
      (shieldBefore > 0 && target.shield <= 0) ||
      (overshieldBefore > 0 && (target.overshield ?? 0) <= 0 && shieldBefore === 0);
    const hitShield = shieldDamage > 0 || overshieldDamage > 0;

    this.eventBus.emit('vfx:impact', {
      position: hitPoint,
      normal: { x: 0, y: 1, z: 0 },
      material: shieldBroke ? 'shield_break' : hitShield ? 'shield' : 'flesh',
    });

    this.eventBus.emit('combat:damage', ev);

    if (isPlayerAttacker) {
      this.eventBus.emit('combat:hitmarker', {
        attackerId: attacker.id,
        isHeadshot,
        isShield: hitShield,
        isElimination,
      });

      this.eventBus.emit('ui:damage_number', {
        id: `dmg_${this.dmgNumSeq++}`,
        worldPos: hitPoint,
        amount: damage,
        isShield: hitShield && hpDamage === 0,
        isHeadshot,
        timestamp: Date.now(),
      });

      if (isElimination) {
        this.eventBus.emit('sound:play', { id: 'elimination' });
      } else if (shieldBroke) {
        this.eventBus.emit('sound:play', { id: 'shield_break' });
      } else if (isHeadshot) {
        this.eventBus.emit('sound:play', { id: 'headshot_dink' });
      } else if (hitShield) {
        this.eventBus.emit('sound:play', { id: 'shield_hit' });
      } else {
        this.eventBus.emit('sound:play', { id: 'hitmarker' });
      }
    }

    return ev;
  }

  fireWeapon(params: FireWeaponParams): FireWeaponResult {
    const def = WEAPONS[params.item.weaponId];
    if (!def || def.isConsumable) {
      return { fired: false, shotsHit: 0, headshots: 0, damageDealt: 0 };
    }

    const aimDir = normalizeVec(params.aimDir);

    if (params.item.weaponId === 'pickaxe') {
      return this.executePickaxeSwing(params, aimDir);
    }

    if (def.isKineticBlade || params.item.weaponId === 'kinetic_blade') {
      return this.executeKineticBladeCleave(params, aimDir);
    }

    if (def.isGrappler || params.item.weaponId === 'grappler') {
      return this.executeGrapplerShot(params, aimDir);
    }

    if (def.isProjectile) {
      return this.launchProjectile(params, aimDir);
    }

    const res = this.executeHitscanShot(params, aimDir);
    if (def.burstCount && def.burstCount > 1) {
      const remaining = def.burstCount - 1;
      this.pendingBursts.push({
        params: { ...params },
        shotsRemaining: remaining,
        timer: def.burstInterval ?? 0.075,
        interval: def.burstInterval ?? 0.075,
      });
      res.burstRemaining = remaining;
    }

    return res;
  }

  private intersectRayAABB(
    origin: Vec3Like,
    dir: Vec3Like,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    maxDist: number,
  ): { distance: number; point: Vec3Like; normal: Vec3Like } | null {
    const invDx = Math.abs(dir.x) > 1e-9 ? 1 / dir.x : 1e9;
    const invDy = Math.abs(dir.y) > 1e-9 ? 1 / dir.y : 1e9;
    const invDz = Math.abs(dir.z) > 1e-9 ? 1 / dir.z : 1e9;

    const tx1 = (minX - origin.x) * invDx;
    const tx2 = (maxX - origin.x) * invDx;
    let tmin = Math.min(tx1, tx2);
    let tmax = Math.max(tx1, tx2);
    let nx = tx1 < tx2 ? -1 : 1;
    let ny = 0;
    let nz = 0;

    const ty1 = (minY - origin.y) * invDy;
    const ty2 = (maxY - origin.y) * invDy;
    const tyMin = Math.min(ty1, ty2);
    const tyMax = Math.max(ty1, ty2);
    if (tyMin > tmin) {
      tmin = tyMin;
      nx = 0;
      ny = ty1 < ty2 ? -1 : 1;
      nz = 0;
    }
    tmax = Math.min(tmax, tyMax);

    const tz1 = (minZ - origin.z) * invDz;
    const tz2 = (maxZ - origin.z) * invDz;
    const tzMin = Math.min(tz1, tz2);
    const tzMax = Math.max(tz1, tz2);
    if (tzMin > tmin) {
      tmin = tzMin;
      nx = 0;
      ny = 0;
      nz = tz1 < tz2 ? -1 : 1;
    }
    tmax = Math.min(tmax, tzMax);

    if (tmax >= Math.max(0, tmin) && tmin >= 0 && tmin < maxDist) {
      return {
        distance: tmin,
        point: {
          x: origin.x + dir.x * tmin,
          y: origin.y + dir.y * tmin,
          z: origin.z + dir.z * tmin,
        },
        normal: { x: nx, y: ny, z: nz },
      };
    }
    return null;
  }

  private raycastLlamas(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
  ): { llama: LootLlamaEntity; distance: number; point: Vec3Like; normal: Vec3Like } | null {
    const llamas = this.propsBridge.getLlamas?.();
    if (!llamas || llamas.length === 0) return null;

    const r = 0.78;
    const h = 1.65;
    let bestDist = maxDist;
    let best: { llama: LootLlamaEntity; distance: number; point: Vec3Like; normal: Vec3Like } | null = null;

    for (let i = 0; i < llamas.length; i++) {
      const llama = llamas[i];
      if (llama.opened) continue;
      const hit = this.intersectRayAABB(
        origin,
        dir,
        llama.x - r,
        llama.y,
        llama.z - r,
        llama.x + r,
        llama.y + h,
        llama.z + r,
        bestDist,
      );
      if (hit) {
        bestDist = hit.distance;
        best = { llama, ...hit };
      }
    }

    return best;
  }

  private raycastVehicles(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
    bridge?: VehicleBridge | null,
    excludeDriverId?: string,
  ): { vehicle: VehicleEntity; distance: number; point: Vec3Like; normal: Vec3Like } | null {
    const activeBridge = bridge ?? this.vehicleBridge;
    const vehicles = activeBridge?.getVehicles();
    if (!vehicles || vehicles.length === 0) return null;

    let bestDist = maxDist;
    let best: { vehicle: VehicleEntity; distance: number; point: Vec3Like; normal: Vec3Like } | null = null;

    for (let i = 0; i < vehicles.length; i++) {
      const veh = vehicles[i];
      if (veh.destroyed || veh.hp <= 0) continue;
      if (excludeDriverId && veh.driverId === excludeDriverId) continue;
      const r = veh.kind === 'hover_atv' ? 1.25 : 0.95;
      const hit = this.intersectRayAABB(
        origin,
        dir,
        veh.x - r,
        veh.y - 0.2,
        veh.z - r,
        veh.x + r,
        veh.y + 1.35,
        veh.z + r,
        bestDist,
      );
      if (hit) {
        bestDist = hit.distance;
        best = { vehicle: veh, ...hit };
      }
    }

    return best;
  }

  private raycastSlurpBarrels(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
    bridge?: WorldStationBridge | null,
  ): { barrel: SlurpBarrelEntity; distance: number; point: Vec3Like; normal: Vec3Like } | null {
    const activeBridge = bridge ?? this.stationBridge;
    const barrels = activeBridge?.getSlurpBarrels();
    if (!barrels || barrels.length === 0) return null;

    const r = 0.65;
    const h = 1.25;
    let bestDist = maxDist;
    let best: {
      barrel: SlurpBarrelEntity;
      distance: number;
      point: Vec3Like;
      normal: Vec3Like;
    } | null = null;

    for (let i = 0; i < barrels.length; i++) {
      const barrel = barrels[i];
      if (barrel.destroyed || barrel.hp <= 0) continue;
      const hit = this.intersectRayAABB(
        origin,
        dir,
        barrel.x - r,
        barrel.y,
        barrel.z - r,
        barrel.x + r,
        barrel.y + h,
        barrel.z + r,
        bestDist,
      );
      if (hit) {
        bestDist = hit.distance;
        best = { barrel, ...hit };
      }
    }

    return best;
  }

  private creditSlurpShieldToActor(actor: CombatActor, shieldAmount: number): void {
    if (shieldAmount <= 0) return;
    const maxShield = actor.maxShield ?? 100;
    const maxHp = actor.maxHp ?? 100;
    const shieldAdded = Math.min(shieldAmount, Math.max(0, maxShield - actor.shield));
    const overflow = shieldAmount - shieldAdded;
    const hpAdded =
      overflow > 0 ? Math.min(overflow, Math.max(0, maxHp - actor.hp)) : 0;

    actor.shield = Math.min(maxShield, actor.shield + shieldAdded);
    actor.hp = Math.min(maxHp, actor.hp + hpAdded);
    actor.onHeal?.(hpAdded, shieldAdded);
  }

  private applySlurpBarrelHit(
    bridge: WorldStationBridge,
    barrelId: string,
    dmg: number,
    hitPoint: Vec3Like,
    normal: Vec3Like,
    actor: CombatActor | null,
  ): boolean {
    const res = bridge.damageSlurpBarrel(barrelId, dmg);
    if (!res) return false;

    this.eventBus.emit('vfx:impact', {
      position: hitPoint,
      normal,
      material: 'shield',
    });
    this.eventBus.emit('sound:play', {
      id: 'shield_hit',
      position: hitPoint,
      spatial: true,
    });

    if (res.destroyed) {
      if (actor) {
        this.creditSlurpShieldToActor(actor, res.shieldAmount);
      }
      this.eventBus.emit('sound:play', {
        id: 'slurp_barrel_break',
        position: res.position,
        spatial: true,
      });
      this.eventBus.emit('vfx:slurp_burst', {
        position: res.position,
        radius: 2.4,
      });
      if (actor) {
        this.onSlurpBarrelBroken?.(actor.id, res.shieldAmount);
      }
    }
    return true;
  }

  private raycastSlurpTankers(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
    bridge?: WorldChapterBridge | null,
  ): {
    tanker: SlurpTankerEntity;
    distance: number;
    point: Vec3Like;
    normal: Vec3Like;
  } | null {
    const activeBridge = bridge ?? this.chapterBridge;
    const tankers = activeBridge?.getSlurpTankers();
    if (!tankers || tankers.length === 0) return null;

    const halfW = 1.45;
    const halfL = 3.35;
    const minY = -0.05;
    const maxY = 2.95;
    let bestDist = maxDist;
    let best: {
      tanker: SlurpTankerEntity;
      distance: number;
      point: Vec3Like;
      normal: Vec3Like;
    } | null = null;

    for (let i = 0; i < tankers.length; i++) {
      const tanker = tankers[i];
      if (tanker.destroyed || tanker.hp <= 0) continue;

      const cos = Math.cos(tanker.rotationY);
      const sin = Math.sin(tanker.rotationY);
      const ox = origin.x - tanker.x;
      const oy = origin.y - tanker.y;
      const oz = origin.z - tanker.z;

      const localOrigin: Vec3Like = {
        x: ox * cos - oz * sin,
        y: oy,
        z: ox * sin + oz * cos,
      };
      const localDir: Vec3Like = {
        x: dir.x * cos - dir.z * sin,
        y: dir.y,
        z: dir.x * sin + dir.z * cos,
      };

      const hit = this.intersectRayAABB(
        localOrigin,
        localDir,
        -halfW,
        minY,
        -halfL,
        halfW,
        maxY,
        halfL,
        bestDist,
      );
      if (hit) {
        bestDist = hit.distance;
        best = {
          tanker,
          distance: hit.distance,
          point: {
            x: tanker.x + hit.point.x * cos + hit.point.z * sin,
            y: tanker.y + hit.point.y,
            z: tanker.z - hit.point.x * sin + hit.point.z * cos,
          },
          normal: {
            x: hit.normal.x * cos + hit.normal.z * sin,
            y: hit.normal.y,
            z: -hit.normal.x * sin + hit.normal.z * cos,
          },
        };
      }
    }

    return best;
  }

  private applySlurpTankerHit(
    bridge: WorldChapterBridge,
    tankerId: string,
    dmg: number,
    hitPoint: Vec3Like,
    normal: Vec3Like,
  ): boolean {
    if (this.rupturingTankerIds.has(tankerId)) return false;
    const res = bridge.damageSlurpTanker(tankerId, dmg);
    if (!res) return false;

    this.eventBus.emit('vfx:impact', {
      position: hitPoint,
      normal,
      material: 'shield',
    });
    this.eventBus.emit('sound:play', {
      id: 'shield_hit',
      position: hitPoint,
      spatial: true,
    });

    if (res.exploded) {
      this.rupturingTankerIds.add(tankerId);
      try {
        const burstPos: Vec3Like = { x: res.x, y: res.y, z: res.z };
        const radius = res.radius > 0 ? res.radius : 10;
        const healAmount = res.healAmount > 0 ? res.healAmount : 60;
        if (this.actorsProvider && healAmount > 0) {
          const actors = this.actorsProvider();
          for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            if (!actor.alive || actor.isKnocked) continue;
            const center = {
              x: actor.position.x,
              y: actor.position.y + actor.height * 0.5,
              z: actor.position.z,
            };
            const d = Math.min(
              dist3D(burstPos, actor.position),
              dist3D(burstPos, center),
            );
            if (d <= radius) {
              const maxHp = actor.maxHp ?? 100;
              const maxShield = actor.maxShield ?? 100;
              const hpAdded = Math.min(healAmount, Math.max(0, maxHp - actor.hp));
              const leftover = healAmount - hpAdded;
              const shieldAdded = Math.min(
                leftover,
                Math.max(0, maxShield - actor.shield),
              );
              actor.hp = Math.min(maxHp, actor.hp + hpAdded);
              actor.shield = Math.min(maxShield, actor.shield + shieldAdded);
              actor.onHeal?.(hpAdded, shieldAdded);
            }
          }
        }
      } finally {
        this.rupturingTankerIds.delete(tankerId);
      }
    }
    return true;
  }

  private raycastExplosiveBarrels(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
    bridge?: WorldRiftCaptureBridge | null,
  ): { barrel: ExplosiveBarrelEntity; distance: number; point: Vec3Like; normal: Vec3Like } | null {
    const activeBridge = bridge ?? this.riftCaptureBridge;
    const barrels = activeBridge?.getExplosiveBarrels();
    if (!barrels || barrels.length === 0) return null;

    const r = 0.6;
    const h = 1.25;
    let bestDist = maxDist;
    let best: {
      barrel: ExplosiveBarrelEntity;
      distance: number;
      point: Vec3Like;
      normal: Vec3Like;
    } | null = null;

    for (let i = 0; i < barrels.length; i++) {
      const barrel = barrels[i];
      if (barrel.exploded || barrel.hp <= 0) continue;
      const hit = this.intersectRayAABB(
        origin,
        dir,
        barrel.x - r,
        barrel.y,
        barrel.z - r,
        barrel.x + r,
        barrel.y + h,
        barrel.z + r,
        bestDist,
      );
      if (hit) {
        bestDist = hit.distance;
        best = { barrel, ...hit };
      }
    }

    return best;
  }

  private detonateBarrelExplosion(
    bridge: WorldRiftCaptureBridge,
    pos: Vec3Like,
    blastRadius: number,
    blastDamage: number,
    attacker: CombatActor | null,
    isPlayer: boolean,
  ): void {
    const radius = blastRadius > 0 ? blastRadius : 6.8;
    const baseDmg = blastDamage > 0 ? blastDamage : 85;

    this.eventBus.emit('vfx:explosion', {
      position: { ...pos },
      radius,
    });
    this.eventBus.emit('sound:play', {
      id: 'explosion',
      position: { ...pos },
      spatial: true,
    });
    this.eventBus.emit('sound:play', {
      id: 'barrel_explode',
      position: { ...pos },
      spatial: true,
    });
    this.eventBus.emit('audio:noise', {
      position: { ...pos },
      kind: 'gunfire',
      sourceId: attacker?.id ?? 'barrel',
      radius: 145,
    });
    this.emitBlastCameraShake(pos, 0.65, isPlayer);

    const attackerStub: CombatActor = attacker ?? {
      id: 'environment',
      name: 'Explosive Barrel',
      position: { ...pos },
      eyePos: { ...pos },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };

    // 1. Damage Actors within blast radius with distance falloff
    if (this.actorsProvider) {
      const actors = this.actorsProvider();
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i];
        if (!actor.alive) continue;
        const center = {
          x: actor.position.x,
          y: actor.position.y + actor.height * 0.5,
          z: actor.position.z,
        };
        const d = Math.min(dist3D(pos, actor.position), dist3D(pos, center));
        if (d <= radius && !this.isBlockedByShieldBubble(pos, center)) {
          const falloff = clamp(1 - (d / radius) * 0.65, 0.35, 1.0);
          const dmg = Math.round(baseDmg * falloff);
          this.applyActorDamage(
            attackerStub,
            actor,
            'frag_grenade',
            'rare',
            dmg,
            false,
            center,
            d,
            isPlayer && actor.id !== attackerStub.id,
          );
        }
      }
    }

    // 2. Damage BuildPieces within blast radius
    const pieces = [...this.building.getPieces()];
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const center = {
        x: (p.gx + 0.5) * GRID_XZ,
        y: (p.gy + 0.5) * GRID_Y,
        z: (p.gz + 0.5) * GRID_XZ,
      };
      const d = dist3D(pos, center);
      if (d <= radius + 1.8 && !this.isBlockedByShieldBubble(pos, center)) {
        const falloff = clamp(1 - (d / (radius + 1.8)) * 0.65, 0.35, 1.0);
        this.building.damagePiece(p.id, Math.round(baseDmg * falloff));
      }
    }

    // 3. Damage Vehicles within blast radius
    const vehicles = this.vehicleBridge?.getVehicles() ?? [];
    for (let i = 0; i < vehicles.length; i++) {
      const veh = vehicles[i];
      if (veh.destroyed || veh.hp <= 0) continue;
      const center = { x: veh.x, y: veh.y + 0.65, z: veh.z };
      const d = dist3D(pos, center);
      if (d <= radius + 1.2 && !this.isBlockedByShieldBubble(pos, center)) {
        const falloff = clamp(1 - (d / (radius + 1.2)) * 0.65, 0.35, 1.0);
        this.vehicleBridge?.damageVehicle(veh.id, Math.round(baseDmg * falloff), pos);
      }
    }

    // 4. Damage Props within blast radius
    const props = this.propsBridge.getProps();
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (prop.destroyed) continue;
      const center = { x: prop.x, y: prop.y + prop.height * 0.5, z: prop.z };
      const d = dist3D(pos, center);
      if (d <= radius + prop.radius && !this.isBlockedByShieldBubble(pos, center)) {
        const falloff = clamp(1 - (d / (radius + prop.radius)) * 0.65, 0.35, 1.0);
        this.propsBridge.damageProp(prop.id, Math.round(baseDmg * falloff), pos, false);
      }
    }

    // 5. Damage Slurp Barrels within blast radius
    if (this.stationBridge) {
      const slurps = this.stationBridge.getSlurpBarrels();
      for (let i = 0; i < slurps.length; i++) {
        const sb = slurps[i];
        if (sb.destroyed || sb.hp <= 0) continue;
        const center = { x: sb.x, y: sb.y + 0.625, z: sb.z };
        const d = dist3D(pos, center);
        if (d <= radius + 0.85 && !this.isBlockedByShieldBubble(pos, center)) {
          const falloff = clamp(1 - (d / (radius + 0.85)) * 0.65, 0.35, 1.0);
          this.applySlurpBarrelHit(
            this.stationBridge,
            sb.id,
            Math.round(baseDmg * falloff),
            center,
            { x: 0, y: 1, z: 0 },
            attacker,
          );
        }
      }
    }

    // 6. Chain-detonate nearby Explosive Barrels
    const expBarrels = bridge.getExplosiveBarrels();
    for (let i = 0; i < expBarrels.length; i++) {
      const other = expBarrels[i];
      if (other.exploded || other.hp <= 0 || this.explodingBarrelIds.has(other.id)) {
        continue;
      }
      const center = { x: other.x, y: other.y + 0.625, z: other.z };
      const d = dist3D(pos, center);
      if (d <= radius && !this.isBlockedByShieldBubble(pos, center)) {
        const falloff = clamp(1 - (d / radius) * 0.65, 0.35, 1.0);
        this.applyExplosiveBarrelHit(
          bridge,
          other.id,
          Math.round(baseDmg * falloff),
          center,
          { x: 0, y: 1, z: 0 },
          attacker,
          isPlayer,
        );
      }
    }

    // 7. Damage Slurp Tankers within blast radius
    if (this.chapterBridge) {
      const tankers = this.chapterBridge.getSlurpTankers();
      for (let i = 0; i < tankers.length; i++) {
        const tanker = tankers[i];
        if (tanker.destroyed || tanker.hp <= 0 || this.rupturingTankerIds.has(tanker.id)) {
          continue;
        }
        const center = { x: tanker.x, y: tanker.y + 1.4, z: tanker.z };
        const d = dist3D(pos, center);
        if (d <= radius + 2.2 && !this.isBlockedByShieldBubble(pos, center)) {
          const falloff = clamp(1 - (d / (radius + 2.2)) * 0.65, 0.35, 1.0);
          this.applySlurpTankerHit(
            this.chapterBridge,
            tanker.id,
            Math.round(baseDmg * falloff),
            center,
            { x: 0, y: 1, z: 0 },
          );
        }
      }
    }
  }

  private applyExplosiveBarrelHit(
    bridge: WorldRiftCaptureBridge,
    barrelId: string,
    dmg: number,
    hitPoint: Vec3Like,
    normal: Vec3Like,
    attacker: CombatActor | null,
    isPlayer: boolean,
  ): boolean {
    if (this.explodingBarrelIds.has(barrelId)) return false;
    const res = bridge.damageExplosiveBarrel(barrelId, dmg);
    if (!res) return false;

    this.eventBus.emit('vfx:impact', {
      position: hitPoint,
      normal,
      material: 'metal',
    });
    this.eventBus.emit('sound:play', {
      id: 'hit_metal',
      position: hitPoint,
      spatial: true,
    });

    if (res.exploded) {
      this.explodingBarrelIds.add(barrelId);
      try {
        this.detonateBarrelExplosion(
          bridge,
          res.position,
          res.blastRadius,
          res.blastDamage,
          attacker,
          isPlayer,
        );
      } finally {
        this.explodingBarrelIds.delete(barrelId);
      }
    }
    return true;
  }

  private raycastShieldBubbles(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
  ): { bubble: ShieldBubbleState; distance: number; point: Vec3Like; normal: Vec3Like } | null {
    if (this.shieldBubbles.length === 0) return null;
    let bestDist = maxDist;
    let best: { bubble: ShieldBubbleState; distance: number; point: Vec3Like; normal: Vec3Like } | null = null;

    for (let i = 0; i < this.shieldBubbles.length; i++) {
      const bubble = this.shieldBubbles[i];
      if (bubble.remaining <= 0) continue;
      const ox = origin.x - bubble.position.x;
      const oy = origin.y - bubble.position.y;
      const oz = origin.z - bubble.position.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - bubble.radius * bubble.radius;
      const disc = b * b - c;
      if (disc < 0) continue;

      const sqrtDisc = Math.sqrt(disc);
      const t0 = -b - sqrtDisc;
      const t1 = -b + sqrtDisc;
      const eps = 1e-4;
      let t = -1;
      if (t0 > eps && t0 <= bestDist) {
        t = t0;
      } else if (t1 > eps && t1 <= bestDist) {
        t = t1;
      }
      if (t < 0) continue;

      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      let nx = (px - bubble.position.x) / bubble.radius;
      let ny = (py - bubble.position.y) / bubble.radius;
      let nz = (pz - bubble.position.z) / bubble.radius;
      if (nx * dir.x + ny * dir.y + nz * dir.z > 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }

      bestDist = t;
      best = {
        bubble,
        distance: t,
        point: { x: px, y: py, z: pz },
        normal: { x: nx, y: ny, z: nz },
      };
    }

    return best;
  }

  private isBlockedByShieldBubble(from: Vec3Like, to: Vec3Like): boolean {
    if (this.shieldBubbles.length === 0) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) return false;
    const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
    return this.raycastShieldBubbles(from, dir, dist - 1e-3) !== null;
  }

  private executePickaxeSwing(
    params: FireWeaponParams,
    aimDir: Vec3Like,
  ): FireWeaponResult {
    const def = WEAPONS.pickaxe;
    this.eventBus.emit('sound:play', {
      id: 'pickaxe_swing',
      position: params.origin,
      spatial: true,
    });

    const vBridge = params.vehicleBridge ?? this.vehicleBridge;
    const sBridge = params.stationBridge ?? this.stationBridge;
    const rcBridge = params.riftCaptureBridge ?? this.riftCaptureBridge;
    const chBridge = params.chapterBridge ?? this.chapterBridge;
    const hasDemolisher = Boolean(params.hasDemolisher ?? params.actor.hasDemolisher);
    const structDmg = Math.round(def.structureDamage * (hasDemolisher ? 1.3 : 1));

    const props = this.propsBridge.getProps();
    const worldHit = this.collision.raycastWorld(params.origin, aimDir, def.range, {
      checkBuilds: true,
      checkProps: true,
      props,
    });
    const actorHit = this.raycastActors(
      params.origin,
      aimDir,
      def.range,
      params.actor.id,
    );
    const llamaHit = this.raycastLlamas(params.origin, aimDir, def.range);
    const vehicleHit = this.raycastVehicles(
      params.origin,
      aimDir,
      def.range,
      vBridge,
      params.actor.id,
    );
    const barrelHit = this.raycastSlurpBarrels(
      params.origin,
      aimDir,
      def.range,
      sBridge,
    );
    const expBarrelHit = this.raycastExplosiveBarrels(
      params.origin,
      aimDir,
      def.range,
      rcBridge,
    );
    const tankerHit = this.raycastSlurpTankers(
      params.origin,
      aimDir,
      def.range,
      chBridge,
    );

    if (
      actorHit &&
      (!worldHit.hit || actorHit.distance <= worldHit.distance) &&
      (!llamaHit || actorHit.distance <= llamaHit.distance) &&
      (!vehicleHit || actorHit.distance <= vehicleHit.distance) &&
      (!barrelHit || actorHit.distance <= barrelHit.distance) &&
      (!expBarrelHit || actorHit.distance <= expBarrelHit.distance) &&
      (!tankerHit || actorHit.distance <= tankerHit.distance)
    ) {
      const ev = this.applyActorDamage(
        params.actor,
        actorHit.actor,
        'pickaxe',
        'common',
        def.baseDamage,
        false,
        actorHit.point,
        actorHit.distance,
        params.isPlayer,
      );
      return {
        fired: true,
        shotsHit: 1,
        headshots: 0,
        damageDealt: ev.damage,
      };
    }

    if (
      tankerHit &&
      chBridge &&
      (!worldHit.hit ||
        (worldHit.targetType === 'static' && worldHit.targetId?.includes('tanker')) ||
        tankerHit.distance <=
          worldHit.distance + (worldHit.targetType === 'static' ? 0.12 : 0)) &&
      (!llamaHit || tankerHit.distance <= llamaHit.distance) &&
      (!vehicleHit || tankerHit.distance <= vehicleHit.distance) &&
      (!barrelHit || tankerHit.distance <= barrelHit.distance) &&
      (!expBarrelHit || tankerHit.distance <= expBarrelHit.distance)
    ) {
      this.applySlurpTankerHit(
        chBridge,
        tankerHit.tanker.id,
        structDmg,
        tankerHit.point,
        tankerHit.normal,
      );
      return {
        fired: true,
        shotsHit: 1,
        headshots: 0,
        damageDealt: structDmg,
      };
    }

    if (
      expBarrelHit &&
      rcBridge &&
      (!worldHit.hit ||
        expBarrelHit.distance <=
          worldHit.distance + (worldHit.targetType === 'static' ? 0.06 : 0)) &&
      (!llamaHit || expBarrelHit.distance <= llamaHit.distance) &&
      (!vehicleHit || expBarrelHit.distance <= vehicleHit.distance) &&
      (!barrelHit || expBarrelHit.distance <= barrelHit.distance)
    ) {
      this.applyExplosiveBarrelHit(
        rcBridge,
        expBarrelHit.barrel.id,
        structDmg,
        expBarrelHit.point,
        expBarrelHit.normal,
        params.actor,
        params.isPlayer,
      );
      return {
        fired: true,
        shotsHit: 1,
        headshots: 0,
        damageDealt: structDmg,
      };
    }

    if (
      barrelHit &&
      sBridge &&
      (!worldHit.hit ||
        barrelHit.distance <= worldHit.distance + (worldHit.targetType === 'static' ? 0.06 : 0)) &&
      (!llamaHit || barrelHit.distance <= llamaHit.distance) &&
      (!vehicleHit || barrelHit.distance <= vehicleHit.distance)
    ) {
      this.applySlurpBarrelHit(
        sBridge,
        barrelHit.barrel.id,
        structDmg,
        barrelHit.point,
        barrelHit.normal,
        params.actor,
      );
      return {
        fired: true,
        shotsHit: 1,
        headshots: 0,
        damageDealt: structDmg,
      };
    }

    if (
      llamaHit &&
      (!worldHit.hit || llamaHit.distance <= worldHit.distance) &&
      (!vehicleHit || llamaHit.distance <= vehicleHit.distance)
    ) {
      this.propsBridge.damageLlama?.(
        llamaHit.llama.id,
        structDmg,
        llamaHit.point,
      );
      this.eventBus.emit('vfx:impact', {
        position: llamaHit.point,
        normal: llamaHit.normal,
        material: 'wood',
      });
      this.eventBus.emit('sound:play', {
        id: 'hit_wood',
        position: llamaHit.point,
        spatial: true,
      });
      return {
        fired: true,
        shotsHit: 1,
        headshots: 0,
        damageDealt: structDmg,
      };
    }

    if (vehicleHit && (!worldHit.hit || vehicleHit.distance <= worldHit.distance)) {
      vBridge?.damageVehicle(
        vehicleHit.vehicle.id,
        structDmg,
        vehicleHit.point,
      );
      this.eventBus.emit('vfx:impact', {
        position: vehicleHit.point,
        normal: vehicleHit.normal,
        material: 'metal',
      });
      this.eventBus.emit('sound:play', {
        id: 'hit_metal',
        position: vehicleHit.point,
        spatial: true,
      });
      return {
        fired: true,
        shotsHit: 1,
        headshots: 0,
        damageDealt: structDmg,
      };
    }

    if (worldHit.hit) {
      if (worldHit.targetType === 'prop' && worldHit.targetId) {
        const res = this.propsBridge.damageProp(
          worldHit.targetId,
          structDmg,
          worldHit.point,
          true,
        );
        if (res.hit) {
          this.eventBus.emit('vfx:impact', {
            position: worldHit.point,
            normal: worldHit.normal,
            material: res.matType,
          });
          const hitSound: SoundEventId =
            res.matType === 'wood'
              ? 'hit_wood'
              : res.matType === 'brick'
                ? 'hit_brick'
                : 'hit_metal';
          this.eventBus.emit('sound:play', {
            id: hitSound,
            position: worldHit.point,
            spatial: true,
          });
          if (res.isCrit && params.isPlayer) {
            this.eventBus.emit('sound:play', { id: 'weakpoint_crit' });
          }
          if (res.weakpointPos) {
            this.eventBus.emit('vfx:weakpoint', {
              propId: worldHit.targetId,
              position: res.weakpointPos,
              normal: worldHit.normal,
              active: !res.destroyed,
            });
          }
          params.onHarvest?.(res.matType, res.yieldAmount, res.isCrit);
          return {
            fired: true,
            shotsHit: 1,
            headshots: res.isCrit ? 1 : 0,
            damageDealt: structDmg,
            harvested: {
              matType: res.matType,
              amount: res.yieldAmount,
              isCrit: res.isCrit,
            },
          };
        }
      } else if (worldHit.targetType === 'build' && worldHit.targetId) {
        this.building.damagePiece(worldHit.targetId, structDmg);
        this.eventBus.emit('vfx:impact', {
          position: worldHit.point,
          normal: worldHit.normal,
          material: worldHit.material ?? 'wood',
        });
        return {
          fired: true,
          shotsHit: 1,
          headshots: 0,
          damageDealt: structDmg,
        };
      } else {
        this.eventBus.emit('vfx:impact', {
          position: worldHit.point,
          normal: worldHit.normal,
          material: worldHit.material ?? 'dirt',
        });
      }
    }

    return { fired: true, shotsHit: 0, headshots: 0, damageDealt: 0 };
  }

  /**
   * Executes a wide frontal 3.8m katana melee cleave (`45` enemy dmg / `75` build & prop dmg).
   */
  private executeKineticBladeCleave(
    params: FireWeaponParams,
    aimDir: Vec3Like,
  ): FireWeaponResult {
    const def = WEAPONS.kinetic_blade;
    const range = def.range > 0 ? def.range : 3.8;
    const hasCombatMedallion = Boolean(
      params.hasCombatMedallion ?? params.actor.hasCombatMedallion,
    );
    const actorDmg = Math.round(
      (def.baseDamage > 0 ? def.baseDamage : 45) * (hasCombatMedallion ? 1.12 : 1),
    );
    const hasDemolisher = Boolean(params.hasDemolisher ?? params.actor.hasDemolisher);
    const structDmg = Math.round(
      (def.structureDamage > 0 ? def.structureDamage : 75) * (hasDemolisher ? 1.3 : 1),
    );

    this.eventBus.emit('sound:play', {
      id: 'kinetic_slash',
      position: params.origin,
      spatial: true,
    });

    const vBridge = params.vehicleBridge ?? this.vehicleBridge;
    const sBridge = params.stationBridge ?? this.stationBridge;
    const rcBridge = params.riftCaptureBridge ?? this.riftCaptureBridge;
    const chBridge = params.chapterBridge ?? this.chapterBridge;
    const props = this.propsBridge.getProps();

    const hitActorIds = new Set<string>();
    const hitStructKeys = new Set<string>();
    let shotsHit = 0;
    let actorDamageDealt = 0;
    let structDamageDealt = 0;

    const cleaveAngles = [0, -0.28, 0.28, -0.55, 0.55];
    const cleaveRays: Array<{ origin: Vec3Like; dir: Vec3Like }> = [];
    for (let i = 0; i < cleaveAngles.length; i++) {
      const ang = cleaveAngles[i];
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const rayDir =
        ang === 0
          ? aimDir
          : normalizeVec({
              x: aimDir.x * cosA - aimDir.z * sinA,
              y: aimDir.y,
              z: aimDir.x * sinA + aimDir.z * cosA,
            });
      cleaveRays.push({ origin: params.origin, dir: rayDir });
    }
    if (Math.abs(aimDir.y) < 0.45 && params.origin.y > 0.7) {
      cleaveRays.push({
        origin: {
          x: params.origin.x,
          y: Math.max(0.25, params.origin.y - 0.5),
          z: params.origin.z,
        },
        dir: aimDir,
      });
    }

    for (let i = 0; i < cleaveRays.length; i++) {
      const rayOrigin = cleaveRays[i].origin;
      const rayDir = cleaveRays[i].dir;

      const worldHit = this.collision.raycastWorld(rayOrigin, rayDir, range, {
        checkBuilds: true,
        checkProps: true,
        props,
      });
      const entityMax = worldHit.hit ? worldHit.distance : range;
      const barrelMax =
        worldHit.hit && worldHit.targetType === 'static'
          ? Math.min(range, worldHit.distance + 0.06)
          : entityMax;
      const tankerMax =
        worldHit.hit &&
        worldHit.targetType === 'static' &&
        worldHit.targetId?.includes('tanker')
          ? range
          : worldHit.hit && worldHit.targetType === 'static'
            ? Math.min(range, worldHit.distance + 0.12)
            : entityMax;

      const actorHit = this.raycastActors(
        rayOrigin,
        rayDir,
        entityMax,
        params.actor.id,
      );
      if (actorHit && !hitActorIds.has(actorHit.actor.id)) {
        hitActorIds.add(actorHit.actor.id);
        const ev = this.applyActorDamage(
          params.actor,
          actorHit.actor,
          'kinetic_blade',
          params.item.rarity,
          actorDmg,
          false,
          actorHit.point,
          actorHit.distance,
          params.isPlayer,
        );
        shotsHit += 1;
        actorDamageDealt += ev.damage;
      }

      const expBarrelHit = this.raycastExplosiveBarrels(
        rayOrigin,
        rayDir,
        barrelMax,
        rcBridge,
      );
      const barrelHit = this.raycastSlurpBarrels(
        rayOrigin,
        rayDir,
        barrelMax,
        sBridge,
      );
      const tankerHit = this.raycastSlurpTankers(
        rayOrigin,
        rayDir,
        tankerMax,
        chBridge,
      );
      const llamaHit = this.raycastLlamas(rayOrigin, rayDir, entityMax);
      const vehicleHit = this.raycastVehicles(
        rayOrigin,
        rayDir,
        entityMax,
        vBridge,
        params.actor.id,
      );

      let chosen:
        | 'exp_barrel'
        | 'barrel'
        | 'tanker'
        | 'llama'
        | 'vehicle'
        | 'world'
        | 'none' = worldHit.hit ? 'world' : 'none';
      let chosenDist = worldHit.hit ? worldHit.distance : range;

      if (
        expBarrelHit &&
        rcBridge &&
        expBarrelHit.distance <=
          chosenDist + (chosen === 'world' && worldHit.targetType === 'static' ? 0.06 : 0)
      ) {
        chosen = 'exp_barrel';
        chosenDist = expBarrelHit.distance;
      }
      if (
        barrelHit &&
        sBridge &&
        barrelHit.distance <=
          chosenDist + (chosen === 'world' && worldHit.targetType === 'static' ? 0.06 : 0)
      ) {
        chosen = 'barrel';
        chosenDist = barrelHit.distance;
      }
      if (
        tankerHit &&
        chBridge &&
        ((chosen === 'world' &&
          worldHit.targetType === 'static' &&
          worldHit.targetId?.includes('tanker')) ||
          tankerHit.distance <=
            chosenDist + (chosen === 'world' && worldHit.targetType === 'static' ? 0.12 : 0))
      ) {
        chosen = 'tanker';
        chosenDist = tankerHit.distance;
      }
      if (llamaHit && llamaHit.distance <= chosenDist) {
        chosen = 'llama';
        chosenDist = llamaHit.distance;
      }
      if (vehicleHit && vehicleHit.distance <= chosenDist) {
        chosen = 'vehicle';
        chosenDist = vehicleHit.distance;
      }

      if (chosen === 'exp_barrel' && expBarrelHit && rcBridge) {
        const key = `exp:${expBarrelHit.barrel.id}`;
        if (!hitStructKeys.has(key)) {
          hitStructKeys.add(key);
          this.applyExplosiveBarrelHit(
            rcBridge,
            expBarrelHit.barrel.id,
            structDmg,
            expBarrelHit.point,
            expBarrelHit.normal,
            params.actor,
            params.isPlayer,
          );
          shotsHit += 1;
          structDamageDealt += structDmg;
        }
      } else if (chosen === 'barrel' && barrelHit && sBridge) {
        const key = `slurp:${barrelHit.barrel.id}`;
        if (!hitStructKeys.has(key)) {
          hitStructKeys.add(key);
          this.applySlurpBarrelHit(
            sBridge,
            barrelHit.barrel.id,
            structDmg,
            barrelHit.point,
            barrelHit.normal,
            params.actor,
          );
          shotsHit += 1;
          structDamageDealt += structDmg;
        }
      } else if (chosen === 'tanker' && tankerHit && chBridge) {
        const key = `tanker:${tankerHit.tanker.id}`;
        if (!hitStructKeys.has(key)) {
          hitStructKeys.add(key);
          this.applySlurpTankerHit(
            chBridge,
            tankerHit.tanker.id,
            structDmg,
            tankerHit.point,
            tankerHit.normal,
          );
          shotsHit += 1;
          structDamageDealt += structDmg;
        }
      } else if (chosen === 'llama' && llamaHit) {
        const key = `llama:${llamaHit.llama.id}`;
        if (!hitStructKeys.has(key)) {
          hitStructKeys.add(key);
          this.propsBridge.damageLlama?.(
            llamaHit.llama.id,
            structDmg,
            llamaHit.point,
          );
          this.eventBus.emit('vfx:impact', {
            position: llamaHit.point,
            normal: llamaHit.normal,
            material: 'wood',
          });
          shotsHit += 1;
          structDamageDealt += structDmg;
        }
      } else if (chosen === 'vehicle' && vehicleHit) {
        const key = `veh:${vehicleHit.vehicle.id}`;
        if (!hitStructKeys.has(key)) {
          hitStructKeys.add(key);
          vBridge?.damageVehicle(
            vehicleHit.vehicle.id,
            structDmg,
            vehicleHit.point,
          );
          this.eventBus.emit('vfx:impact', {
            position: vehicleHit.point,
            normal: vehicleHit.normal,
            material: 'metal',
          });
          shotsHit += 1;
          structDamageDealt += structDmg;
        }
      } else if (chosen === 'world' && worldHit.hit) {
        if (
          (worldHit.targetType === 'build' || worldHit.targetType === 'prop') &&
          worldHit.targetId
        ) {
          const key = `${worldHit.targetType}:${worldHit.targetId}`;
          if (!hitStructKeys.has(key)) {
            hitStructKeys.add(key);
            this.applyWorldHitDamage(worldHit, structDmg);
            shotsHit += 1;
            structDamageDealt += structDmg;
          }
        } else {
          this.applyWorldHitDamage(worldHit, structDmg);
        }
      }
    }

    // Arc proximity sweep for enemies inside the frontal cleave cone
    const actors = this.actorsProvider ? this.actorsProvider() : [];
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      if (!actor.alive || actor.id === params.actor.id || hitActorIds.has(actor.id)) {
        continue;
      }
      const center = {
        x: actor.position.x,
        y: actor.position.y + actor.height * 0.5,
        z: actor.position.z,
      };
      const dx = center.x - params.origin.x;
      const dy = center.y - params.origin.y;
      const dz = center.z - params.origin.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > range + actor.radius * 0.5) continue;

      const dirToActor =
        dist > 1e-5 ? { x: dx / dist, y: dy / dist, z: dz / dist } : aimDir;
      const dot =
        dirToActor.x * aimDir.x + dirToActor.y * aimDir.y + dirToActor.z * aimDir.z;
      if (dot < 0.35) continue;

      const blocked = this.collision.raycastWorld(
        params.origin,
        dirToActor,
        Math.max(0.1, dist - actor.radius),
        { checkBuilds: true, checkProps: false },
      );
      if (blocked.hit) continue;

      hitActorIds.add(actor.id);
      const ev = this.applyActorDamage(
        params.actor,
        actor,
        'kinetic_blade',
        params.item.rarity,
        actorDmg,
        false,
        center,
        dist,
        params.isPlayer,
      );
      shotsHit += 1;
      actorDamageDealt += ev.damage;
    }

    return {
      fired: true,
      shotsHit,
      headshots: 0,
      damageDealt: actorDamageDealt > 0 ? actorDamageDealt : structDamageDealt,
    };
  }

  /**
   * Executes a Kinetic Blade RMB dash strike along `[from, to]`, damaging enemies and structures within `radius` (default `2.8m`).
   */
  executeKineticDash(params: {
    actor: CombatActor;
    item: ItemInstance;
    from: Vec3Like;
    to: Vec3Like;
    radius?: number;
    damage?: number;
    isPlayer: boolean;
    vehicleBridge?: VehicleBridge | null;
    stationBridge?: WorldStationBridge | null;
    riftCaptureBridge?: WorldRiftCaptureBridge | null;
    chapterBridge?: WorldChapterBridge | null;
    hasDemolisher?: boolean;
    hasCombatMedallion?: boolean;
  }): FireWeaponResult {
    const dashRadius = params.radius ?? 2.8;
    const baseActorDmg = params.damage ?? 50;
    const hasCombatMedallion = Boolean(
      params.hasCombatMedallion ?? params.actor.hasCombatMedallion,
    );
    const actorDmg = Math.round(baseActorDmg * (hasCombatMedallion ? 1.12 : 1));
    const hasDemolisher = Boolean(params.hasDemolisher ?? params.actor.hasDemolisher);
    const structDmg = Math.round(baseActorDmg * (hasDemolisher ? 1.3 : 1));
    const vBridge = params.vehicleBridge ?? this.vehicleBridge;
    const sBridge = params.stationBridge ?? this.stationBridge;
    const rcBridge = params.riftCaptureBridge ?? this.riftCaptureBridge;
    const chBridge = params.chapterBridge ?? this.chapterBridge;

    this.eventBus.emit('sound:play', {
      id: 'kinetic_dash',
      position: { ...params.from },
      spatial: true,
    });
    this.eventBus.emit('vfx:kinetic_dash', {
      from: { ...params.from },
      to: { ...params.to },
    });

    let shotsHit = 0;
    let actorDamageDealt = 0;
    let structDamageDealt = 0;

    // 1. Damage enemy actors within 2.8m along dash path
    const actors = this.actorsProvider ? this.actorsProvider() : [];
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      if (!actor.alive || actor.id === params.actor.id) continue;
      const center = {
        x: actor.position.x,
        y: actor.position.y + actor.height * 0.5,
        z: actor.position.z,
      };
      const seg = distPointToSegment(center, params.from, params.to);
      if (seg.dist <= dashRadius) {
        const travelDist = dist3D(params.from, center);
        const ev = this.applyActorDamage(
          params.actor,
          actor,
          'kinetic_blade',
          params.item.rarity,
          actorDmg,
          false,
          center,
          travelDist,
          params.isPlayer,
        );
        shotsHit += 1;
        actorDamageDealt += ev.damage;
      }
    }

    // 2. Damage weak structures (builds) within 2.8m along dash path
    const pieces = [...this.building.getPieces()];
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.hp <= 0) continue;
      const pieceCenter: Vec3Like =
        p.type === 'wall'
          ? p.dir === 'N'
            ? {
                x: (p.gx + 0.5) * GRID_XZ,
                y: (p.gy + 0.5) * GRID_Y,
                z: p.gz * GRID_XZ,
              }
            : {
                x: p.gx * GRID_XZ,
                y: (p.gy + 0.5) * GRID_Y,
                z: (p.gz + 0.5) * GRID_XZ,
              }
          : p.type === 'floor'
            ? {
                x: (p.gx + 0.5) * GRID_XZ,
                y: p.gy * GRID_Y,
                z: (p.gz + 0.5) * GRID_XZ,
              }
            : {
                x: (p.gx + 0.5) * GRID_XZ,
                y: (p.gy + 0.5) * GRID_Y,
                z: (p.gz + 0.5) * GRID_XZ,
              };
      const seg = distPointToSegment(pieceCenter, params.from, params.to);
      // Do not break the floor tile directly beneath starting feet
      if (p.type === 'floor' && seg.t <= 0.08 && pieceCenter.y <= params.from.y - 0.5) {
        continue;
      }
      if (seg.dist <= dashRadius) {
        this.building.damagePiece(p.id, structDmg);
        this.eventBus.emit('vfx:impact', {
          position: pieceCenter,
          normal: { x: 0, y: 1, z: 0 },
          material: p.material,
        });
        shotsHit += 1;
        structDamageDealt += structDmg;
      }
    }

    // 3. Damage harvestable props along dash path
    const props = this.propsBridge.getProps();
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (prop.destroyed) continue;
      const center = { x: prop.x, y: prop.y + prop.height * 0.5, z: prop.z };
      const seg = distPointToSegment(center, params.from, params.to);
      if (seg.dist <= dashRadius + prop.radius) {
        this.propsBridge.damageProp(prop.id, structDmg, center, false);
        this.eventBus.emit('vfx:impact', {
          position: center,
          normal: { x: 0, y: 1, z: 0 },
          material: prop.material,
        });
        shotsHit += 1;
        structDamageDealt += structDmg;
      }
    }

    // 4. Damage Slurp Barrels, Explosive Barrels, Llamas, and Vehicles along dash path
    if (sBridge) {
      const slurps = sBridge.getSlurpBarrels();
      for (let i = 0; i < slurps.length; i++) {
        const sb = slurps[i];
        if (sb.destroyed || sb.hp <= 0) continue;
        const center = { x: sb.x, y: sb.y + 0.625, z: sb.z };
        if (distPointToSegment(center, params.from, params.to).dist <= dashRadius) {
          this.applySlurpBarrelHit(
            sBridge,
            sb.id,
            structDmg,
            center,
            { x: 0, y: 1, z: 0 },
            params.actor,
          );
          shotsHit += 1;
          structDamageDealt += structDmg;
        }
      }
    }

    if (rcBridge) {
      const expBarrels = rcBridge.getExplosiveBarrels();
      for (let i = 0; i < expBarrels.length; i++) {
        const eb = expBarrels[i];
        if (eb.exploded || eb.hp <= 0 || this.explodingBarrelIds.has(eb.id)) continue;
        const center = { x: eb.x, y: eb.y + 0.625, z: eb.z };
        if (distPointToSegment(center, params.from, params.to).dist <= dashRadius) {
          this.applyExplosiveBarrelHit(
            rcBridge,
            eb.id,
            structDmg,
            center,
            { x: 0, y: 1, z: 0 },
            params.actor,
            params.isPlayer,
          );
          shotsHit += 1;
          structDamageDealt += structDmg;
        }
      }
    }

    if (chBridge) {
      const tankers = chBridge.getSlurpTankers();
      for (let i = 0; i < tankers.length; i++) {
        const tanker = tankers[i];
        if (tanker.destroyed || tanker.hp <= 0 || this.rupturingTankerIds.has(tanker.id)) {
          continue;
        }
        const center = { x: tanker.x, y: tanker.y + 1.4, z: tanker.z };
        if (distPointToSegment(center, params.from, params.to).dist <= dashRadius + 1.4) {
          this.applySlurpTankerHit(
            chBridge,
            tanker.id,
            structDmg,
            center,
            { x: 0, y: 1, z: 0 },
          );
          shotsHit += 1;
          structDamageDealt += structDmg;
        }
      }
    }

    const llamas = this.propsBridge.getLlamas?.() ?? [];
    for (let i = 0; i < llamas.length; i++) {
      const l = llamas[i];
      if (l.opened) continue;
      const center = { x: l.x, y: l.y + 0.8, z: l.z };
      if (distPointToSegment(center, params.from, params.to).dist <= dashRadius) {
        this.propsBridge.damageLlama?.(l.id, structDmg, center);
        shotsHit += 1;
        structDamageDealt += structDmg;
      }
    }

    const vehicles = vBridge?.getVehicles() ?? [];
    for (let i = 0; i < vehicles.length; i++) {
      const veh = vehicles[i];
      if (veh.destroyed || veh.hp <= 0 || veh.driverId === params.actor.id) continue;
      const center = { x: veh.x, y: veh.y + 0.65, z: veh.z };
      if (distPointToSegment(center, params.from, params.to).dist <= dashRadius) {
        vBridge?.damageVehicle(veh.id, structDmg, center);
        shotsHit += 1;
        structDamageDealt += structDmg;
      }
    }

    return {
      fired: true,
      shotsHit,
      headshots: 0,
      damageDealt: actorDamageDealt > 0 ? actorDamageDealt : structDamageDealt,
    };
  }

  private executeGrapplerShot(
    params: FireWeaponParams,
    aimDir: Vec3Like,
  ): FireWeaponResult {
    const def = WEAPONS.grappler;
    if (params.item.magAmmo <= 0) {
      if (params.isPlayer) {
        this.eventBus.emit('sound:play', {
          id: 'dryfire',
          position: params.origin,
          spatial: true,
        });
      }
      return { fired: false, shotsHit: 0, headshots: 0, damageDealt: 0 };
    }

    const vBridge = params.vehicleBridge ?? this.vehicleBridge;
    const props = this.propsBridge.getProps();
    const worldHit = this.collision.raycastWorld(params.origin, aimDir, def.range, {
      checkBuilds: true,
      checkProps: true,
      props,
    });
    const maxCheck = worldHit.hit ? worldHit.distance : def.range;
    const llamaHit = this.raycastLlamas(params.origin, aimDir, maxCheck);
    const vehicleHit = this.raycastVehicles(
      params.origin,
      aimDir,
      maxCheck,
      vBridge,
      params.actor.id,
    );

    let anchorPoint: Vec3Like | null = null;
    let anchorDist = maxCheck;
    if (llamaHit && llamaHit.distance <= anchorDist) {
      anchorDist = llamaHit.distance;
      anchorPoint = llamaHit.point;
    }
    if (vehicleHit && vehicleHit.distance <= anchorDist) {
      anchorDist = vehicleHit.distance;
      anchorPoint = vehicleHit.point;
    }
    if (!anchorPoint && worldHit.hit) {
      anchorPoint = worldHit.point;
      anchorDist = worldHit.distance;
    }

    if (!anchorPoint || anchorDist > def.range) {
      if (params.isPlayer) {
        this.eventBus.emit('sound:play', {
          id: 'dryfire',
          position: params.origin,
          spatial: true,
        });
      }
      return { fired: false, shotsHit: 0, headshots: 0, damageDealt: 0 };
    }

    params.onAmmoConsumed?.();

    const muzzle = params.muzzlePos ?? params.origin;
    this.eventBus.emit('sound:play', {
      id: 'grappler_fire',
      position: muzzle,
      spatial: true,
    });
    this.eventBus.emit('sound:play', {
      id: 'grappler_reel',
      position: params.origin,
      spatial: true,
    });
    this.eventBus.emit('vfx:grapple_line', {
      from: muzzle,
      to: anchorPoint,
      duration: 0.45,
    });

    const dx = anchorPoint.x - params.origin.x;
    const dy = anchorPoint.y - params.origin.y;
    const dz = anchorPoint.z - params.origin.z;
    const dist = Math.max(0.1, Math.hypot(dx, dy, dz));
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;
    const pullSpeed = clamp(20 + dist * 0.3, 22, 34);
    const impulse: Vec3Like = {
      x: nx * pullSpeed,
      y: clamp(ny * pullSpeed + 8.5, 9.5, 25),
      z: nz * pullSpeed,
    };

    params.actor.fallImmune = true;
    if (params.actor.onImpulse) {
      params.actor.onImpulse(impulse, true);
    } else if (params.actor.velocity) {
      params.actor.velocity.x += impulse.x;
      params.actor.velocity.y = Math.max(params.actor.velocity.y, 0) + impulse.y;
      params.actor.velocity.z += impulse.z;
    }

    return { fired: true, shotsHit: 0, headshots: 0, damageDealt: 0 };
  }

  private launchProjectile(
    params: FireWeaponParams,
    aimDir: Vec3Like,
  ): FireWeaponResult {
    const def = WEAPONS[params.item.weaponId];
    if (def.isThrowable && params.item.stackCount <= 0) {
      return { fired: false, shotsHit: 0, headshots: 0, damageDealt: 0 };
    }
    const hasDemolisher = Boolean(params.hasDemolisher ?? params.actor.hasDemolisher);
    const hasFirstAssault = Boolean(params.hasFirstAssault ?? params.actor.hasFirstAssault);
    const hasCombatMedallion = Boolean(
      params.hasCombatMedallion ?? params.actor.hasCombatMedallion,
    );
    const firstAssaultBoost =
      hasFirstAssault &&
      def.magSize > 0 &&
      !def.isGrappler &&
      params.item.magAmmo === def.magSize;
    params.onAmmoConsumed?.();

    const spreadDir = applySpreadToDir(aimDir, params.spreadRad);
    const shotDir =
      def.isThrowable && Math.abs(spreadDir.y) < 0.72
        ? normalizeVec({ x: spreadDir.x, y: spreadDir.y + 0.15, z: spreadDir.z })
        : spreadDir;
    const muzzle = params.muzzlePos ?? params.origin;

    if (def.isThrowable) {
      this.eventBus.emit('sound:play', {
        id: SHOT_SOUND_MAP[params.item.weaponId],
        position: muzzle,
        volume: 0.45,
        pitch: 1.25,
        spatial: true,
      });
    } else {
      this.eventBus.emit('sound:play', {
        id: SHOT_SOUND_MAP[params.item.weaponId],
        position: muzzle,
        spatial: true,
      });
      this.eventBus.emit('vfx:muzzle', {
        position: muzzle,
        direction: shotDir,
        weaponId: params.item.weaponId,
      });
      this.eventBus.emit('audio:noise', {
        position: params.origin,
        kind: 'gunfire',
        sourceId: params.actor.id,
        radius: 135,
      });
      if (params.isPlayer) {
        this.eventBus.emit('vfx:camera_shake', {
          intensity: params.item.weaponId === 'sniper' ? 0.36 : 0.32,
          duration: 0.16,
        });
      }
    }

    const rarityMult = RARITY_MULTIPLIER[params.item.rarity] ?? 1.0;
    const isFrag = params.item.weaponId === 'frag_grenade';
    const isShockwave = params.item.weaponId === 'shockwave_grenade';
    const isSplashHeal = params.item.weaponId === 'chug_splash';
    const isShieldBubble = Boolean(
      def.isShieldBubble || params.item.weaponId === 'shield_bubble',
    );
    const isBoomArrow = Boolean(def.isBow || params.item.weaponId === 'boom_bow');
    const bowCharge = isBoomArrow ? clamp(params.bowCharge ?? 1.0, 0, 1) : 1.0;
    const bowSpeedMult = isBoomArrow ? lerp(0.35, 1.0, bowCharge) : 1.0;
    const bowDmgMult = isBoomArrow ? lerp(0.35, 1.0, bowCharge) : 1.0;
    const combatMedallionMult = hasCombatMedallion && !def.isThrowable ? 1.12 : 1.0;
    const projSpeed = def.projectileSpeed * bowSpeedMult;

    const proj: ActiveProjectile = {
      id: `proj_${this.nextProjId++}`,
      ownerId: params.actor.id,
      ownerName: params.actor.name,
      weaponId: params.item.weaponId,
      rarity: params.item.rarity,
      position: {
        x: params.origin.x + shotDir.x * 0.45,
        y: params.origin.y + shotDir.y * 0.45,
        z: params.origin.z + shotDir.z * 0.45,
      },
      startPos: { ...params.origin },
      velocity: {
        x: shotDir.x * projSpeed,
        y: shotDir.y * projSpeed,
        z: shotDir.z * projSpeed,
      },
      gravity: def.projectileGravity,
      damage: Math.round(
        def.baseDamage *
          rarityMult *
          bowDmgMult *
          (firstAssaultBoost ? 1.25 : 1.0) *
          combatMedallionMult,
      ),
      structureDamage: Math.round(
        def.structureDamage * rarityMult * bowDmgMult * (hasDemolisher ? 1.3 : 1.0),
      ),
      headshotMultiplier: def.headshotMultiplier,
      splashRadius: def.splashRadius,
      age: 0,
      maxAge:
        def.fuseTime !== undefined
          ? def.fuseTime + 0.5
          : params.item.weaponId === 'sniper' || isBoomArrow
            ? 3.2
            : 8.5,
      alive: true,
      isPlayer: params.isPlayer,
      isThrowable: Boolean(def.isThrowable),
      bouncesRemaining: isFrag ? 5 : 0,
      fuseRemaining: def.fuseTime,
      isShockwave,
      isSplashHeal,
      isShieldBubble,
      isBoomArrow,
      settled: false,
      bounceSoundCooldown: 0,
      demolisherActive: hasDemolisher,
      firstAssaultActive: firstAssaultBoost,
      combatMedallionActive: hasCombatMedallion,
    };

    this.projectiles.push(proj);
    return { fired: true, shotsHit: 0, headshots: 0, damageDealt: 0 };
  }

  private applyWorldHitDamage(
    worldHit: {
      targetType: string;
      targetId?: string;
      point: Vec3Like;
      normal: Vec3Like;
      material?: MaterialType;
    },
    structDmg: number,
  ): void {
    if (worldHit.targetType === 'build' && worldHit.targetId) {
      this.building.damagePiece(worldHit.targetId, structDmg);
      this.eventBus.emit('vfx:impact', {
        position: worldHit.point,
        normal: worldHit.normal,
        material: worldHit.material ?? 'wood',
      });
    } else if (worldHit.targetType === 'prop' && worldHit.targetId) {
      const propRes = this.propsBridge.damageProp(
        worldHit.targetId,
        structDmg,
        worldHit.point,
        false,
      );
      this.eventBus.emit('vfx:impact', {
        position: worldHit.point,
        normal: worldHit.normal,
        material: propRes.matType,
      });
    } else {
      this.eventBus.emit('vfx:impact', {
        position: worldHit.point,
        normal: worldHit.normal,
        material: worldHit.material ?? 'dirt',
      });
    }
  }

  private executeHitscanShot(
    params: FireWeaponParams,
    aimDir: Vec3Like,
  ): FireWeaponResult {
    const def = WEAPONS[params.item.weaponId];
    const vBridge = params.vehicleBridge ?? this.vehicleBridge;
    const sBridge = params.stationBridge ?? this.stationBridge;
    const rcBridge = params.riftCaptureBridge ?? this.riftCaptureBridge;
    const chBridge = params.chapterBridge ?? this.chapterBridge;
    const hasDemolisher = Boolean(params.hasDemolisher ?? params.actor.hasDemolisher);
    const hasFirstAssault = Boolean(params.hasFirstAssault ?? params.actor.hasFirstAssault);
    const hasCombatMedallion = Boolean(
      params.hasCombatMedallion ?? params.actor.hasCombatMedallion,
    );
    const firstAssaultBoost =
      hasFirstAssault &&
      def.magSize > 0 &&
      !def.isGrappler &&
      params.item.magAmmo === def.magSize;
    const firstAssaultMult = firstAssaultBoost ? 1.25 : 1.0;
    const combatMedallionMult = hasCombatMedallion ? 1.12 : 1.0;
    const demolisherMult = hasDemolisher ? 1.3 : 1.0;
    params.onAmmoConsumed?.();

    const muzzle = params.muzzlePos ?? params.origin;
    this.eventBus.emit('sound:play', {
      id: SHOT_SOUND_MAP[params.item.weaponId],
      position: muzzle,
      spatial: true,
    });
    this.eventBus.emit('vfx:muzzle', {
      position: muzzle,
      direction: aimDir,
      weaponId: params.item.weaponId,
    });
    this.eventBus.emit('audio:noise', {
      position: params.origin,
      kind: 'gunfire',
      sourceId: params.actor.id,
      radius: def.category === 'shotgun' ? 85 : 115,
    });

    if (params.isPlayer && def.category === 'shotgun') {
      const intensity =
        params.item.weaponId === 'tac_shotgun' ? 0.2 : 0.3;
      this.eventBus.emit('vfx:camera_shake', {
        intensity,
        duration: params.item.weaponId === 'tac_shotgun' ? 0.11 : 0.14,
      });
    }

    const pellets = Math.max(1, def.pellets);
    const props = this.propsBridge.getProps();

    const actorAccum = new Map<
      string,
      {
        actor: CombatActor;
        totalDamage: number;
        anyHeadshot: boolean;
        hitPoint: Vec3Like;
        distance: number;
      }
    >();

    let shotsHit = 0;
    let headshots = 0;
    let totalDamageDealt = 0;

    for (let p = 0; p < pellets; p++) {
      // Keep first pellet closer to center for responsive shotgun aim
      const effectiveSpread = p === 0 && pellets > 1 ? params.spreadRad * 0.35 : params.spreadRad;
      const rayDir = applySpreadToDir(aimDir, effectiveSpread);

      const bubbleHit = this.raycastShieldBubbles(params.origin, rayDir, def.range);
      const bubbleMaxDist = bubbleHit ? bubbleHit.distance : def.range;

      const worldHit = this.collision.raycastWorld(params.origin, rayDir, bubbleMaxDist, {
        checkBuilds: true,
        checkProps: true,
        props,
      });

      const entityMaxDist = worldHit.hit ? worldHit.distance : bubbleMaxDist;
      const barrelMaxDist =
        worldHit.hit && worldHit.targetType === 'static'
          ? Math.min(bubbleMaxDist, worldHit.distance + 0.06)
          : entityMaxDist;
      const tankerMaxDist =
        worldHit.hit &&
        worldHit.targetType === 'static' &&
        worldHit.targetId?.includes('tanker')
          ? bubbleMaxDist
          : worldHit.hit && worldHit.targetType === 'static'
            ? Math.min(bubbleMaxDist, worldHit.distance + 0.12)
            : entityMaxDist;
      const actorHit = this.raycastActors(
        params.origin,
        rayDir,
        entityMaxDist,
        params.actor.id,
      );
      const llamaHit = this.raycastLlamas(params.origin, rayDir, entityMaxDist);
      const vehicleHit = this.raycastVehicles(
        params.origin,
        rayDir,
        entityMaxDist,
        vBridge,
        params.actor.id,
      );
      const barrelHit = this.raycastSlurpBarrels(
        params.origin,
        rayDir,
        barrelMaxDist,
        sBridge,
      );
      const expBarrelHit = this.raycastExplosiveBarrels(
        params.origin,
        rayDir,
        barrelMaxDist,
        rcBridge,
      );
      const tankerHit = this.raycastSlurpTankers(
        params.origin,
        rayDir,
        tankerMaxDist,
        chBridge,
      );

      let chosenType:
        | 'actor'
        | 'llama'
        | 'vehicle'
        | 'barrel'
        | 'exp_barrel'
        | 'tanker'
        | 'world'
        | 'bubble'
        | 'none' = 'none';
      let chosenDist = bubbleMaxDist;
      if (worldHit.hit && worldHit.distance <= chosenDist) {
        chosenType = 'world';
        chosenDist = worldHit.distance;
      }
      if (
        expBarrelHit &&
        expBarrelHit.distance <=
          chosenDist + (chosenType === 'world' && worldHit.targetType === 'static' ? 0.06 : 0)
      ) {
        chosenType = 'exp_barrel';
        chosenDist = expBarrelHit.distance;
      }
      if (
        barrelHit &&
        barrelHit.distance <=
          chosenDist + (chosenType === 'world' && worldHit.targetType === 'static' ? 0.06 : 0)
      ) {
        chosenType = 'barrel';
        chosenDist = barrelHit.distance;
      }
      if (
        tankerHit &&
        chBridge &&
        ((chosenType === 'world' &&
          worldHit.targetType === 'static' &&
          worldHit.targetId?.includes('tanker')) ||
          tankerHit.distance <=
            chosenDist + (chosenType === 'world' && worldHit.targetType === 'static' ? 0.12 : 0))
      ) {
        chosenType = 'tanker';
        chosenDist = tankerHit.distance;
      }
      if (vehicleHit && vehicleHit.distance <= chosenDist) {
        chosenType = 'vehicle';
        chosenDist = vehicleHit.distance;
      }
      if (llamaHit && llamaHit.distance <= chosenDist) {
        chosenType = 'llama';
        chosenDist = llamaHit.distance;
      }
      if (actorHit && actorHit.distance <= chosenDist) {
        chosenType = 'actor';
        chosenDist = actorHit.distance;
      }
      if (chosenType === 'none' && bubbleHit) {
        chosenType = 'bubble';
      }

      const endPoint =
        chosenType === 'actor'
          ? actorHit!.point
          : chosenType === 'llama'
            ? llamaHit!.point
            : chosenType === 'vehicle'
              ? vehicleHit!.point
              : chosenType === 'exp_barrel'
                ? expBarrelHit!.point
                : chosenType === 'barrel'
                  ? barrelHit!.point
                  : chosenType === 'tanker'
                    ? tankerHit!.point
                    : chosenType === 'world'
                      ? worldHit.point
                      : chosenType === 'bubble'
                        ? bubbleHit!.point
                        : {
                            x: params.origin.x + rayDir.x * def.range,
                            y: params.origin.y + rayDir.y * def.range,
                            z: params.origin.z + rayDir.z * def.range,
                          };

      const isMythicPulse = params.item.weaponId === 'mythic_blade_rifle';
      this.eventBus.emit('vfx:tracer', {
        from: muzzle,
        to: endPoint,
        color: isMythicPulse ? 0x38bdf8 : params.isPlayer ? 0xffe49e : 0xffaa55,
        width: isMythicPulse ? 0.09 : undefined,
      });

      const structDmg = Math.max(
        1,
        Math.round(
          (def.structureDamage *
            (RARITY_MULTIPLIER[params.item.rarity] ?? 1) *
            demolisherMult) /
            pellets,
        ),
      );

      if (chosenType === 'actor' && actorHit) {
        const pelletDmg =
          (computeWeaponDamage(
            params.item.weaponId,
            params.item.rarity,
            actorHit.distance,
            actorHit.isHeadshot,
          ) *
            firstAssaultMult *
            combatMedallionMult) /
          pellets;

        const existing = actorAccum.get(actorHit.actor.id);
        if (existing) {
          existing.totalDamage += pelletDmg;
          existing.anyHeadshot = existing.anyHeadshot || actorHit.isHeadshot;
        } else {
          actorAccum.set(actorHit.actor.id, {
            actor: actorHit.actor,
            totalDamage: pelletDmg,
            anyHeadshot: actorHit.isHeadshot,
            hitPoint: actorHit.point,
            distance: actorHit.distance,
          });
        }
      } else if (chosenType === 'exp_barrel' && expBarrelHit && rcBridge) {
        this.applyExplosiveBarrelHit(
          rcBridge,
          expBarrelHit.barrel.id,
          structDmg,
          expBarrelHit.point,
          expBarrelHit.normal,
          params.actor,
          params.isPlayer,
        );
      } else if (chosenType === 'barrel' && barrelHit && sBridge) {
        this.applySlurpBarrelHit(
          sBridge,
          barrelHit.barrel.id,
          structDmg,
          barrelHit.point,
          barrelHit.normal,
          params.actor,
        );
      } else if (chosenType === 'tanker' && tankerHit && chBridge) {
        this.applySlurpTankerHit(
          chBridge,
          tankerHit.tanker.id,
          structDmg,
          tankerHit.point,
          tankerHit.normal,
        );
      } else if (chosenType === 'llama' && llamaHit) {
        this.propsBridge.damageLlama?.(llamaHit.llama.id, structDmg, llamaHit.point);
        this.eventBus.emit('vfx:impact', {
          position: llamaHit.point,
          normal: llamaHit.normal,
          material: 'wood',
        });
      } else if (chosenType === 'vehicle' && vehicleHit) {
        vBridge?.damageVehicle(vehicleHit.vehicle.id, structDmg, vehicleHit.point);
        this.eventBus.emit('vfx:impact', {
          position: vehicleHit.point,
          normal: vehicleHit.normal,
          material: 'metal',
        });
      } else if (chosenType === 'world' && worldHit.hit) {
        this.applyWorldHitDamage(worldHit, structDmg);
      } else if (chosenType === 'bubble' && bubbleHit) {
        this.eventBus.emit('vfx:impact', {
          position: bubbleHit.point,
          normal: bubbleHit.normal,
          material: 'shield',
        });
        this.eventBus.emit('sound:play', {
          id: 'shield_hit',
          position: bubbleHit.point,
          spatial: true,
        });
      }
    }

    for (const entry of actorAccum.values()) {
      const dmgRounded = Math.max(1, Math.round(entry.totalDamage));
      const ev = this.applyActorDamage(
        params.actor,
        entry.actor,
        params.item.weaponId,
        params.item.rarity,
        dmgRounded,
        entry.anyHeadshot,
        entry.hitPoint,
        entry.distance,
        params.isPlayer,
      );
      shotsHit += 1;
      if (entry.anyHeadshot) headshots += 1;
      totalDamageDealt += ev.damage;
    }

    return {
      fired: true,
      shotsHit,
      headshots,
      damageDealt: totalDamageDealt,
    };
  }

  private emitBlastCameraShake(impactPos: Vec3Like, baseIntensity: number, isPlayer: boolean): void {
    let shouldEmit = isPlayer;
    let intensity = baseIntensity;
    if (this.actorsProvider) {
      const player = this.actorsProvider().find((a) => a.id === 'player' && a.alive);
      if (player) {
        const dist = dist3D(impactPos, player.position);
        if (dist <= 30) {
          shouldEmit = true;
          intensity = Math.max(intensity * clamp(1 - dist / 34, 0.25, 1.0), 0.18);
        }
      }
    }
    if (shouldEmit) {
      this.eventBus.emit('vfx:camera_shake', {
        intensity,
        duration: 0.3,
      });
    }
  }

  private detonateExplosive(
    proj: ActiveProjectile,
    impactPos: Vec3Like,
    directHit?: { actorId: string; isHeadshot: boolean },
  ): void {
    if (proj.isBoomArrow) {
      this.eventBus.emit('vfx:bow_explosion', {
        position: impactPos,
        radius: proj.splashRadius,
      });
    } else {
      this.eventBus.emit('vfx:explosion', {
        position: impactPos,
        radius: proj.splashRadius,
      });
    }
    this.eventBus.emit('sound:play', {
      id: 'explosion',
      position: impactPos,
      spatial: true,
    });
    this.eventBus.emit('audio:noise', {
      position: impactPos,
      kind: 'gunfire',
      sourceId: proj.ownerId,
      radius: 140,
    });
    this.emitBlastCameraShake(impactPos, 0.62, proj.isPlayer);

    const attackerStub: CombatActor = {
      id: proj.ownerId,
      name: proj.ownerName,
      position: proj.startPos,
      eyePos: proj.startPos,
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };

    // Damage BuildPieces within splash radius
    const pieces = [...this.building.getPieces()];
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const center = {
        x: (p.gx + 0.5) * GRID_XZ,
        y: (p.gy + 0.5) * GRID_Y,
        z: (p.gz + 0.5) * GRID_XZ,
      };
      const d = dist3D(impactPos, center);
      if (d <= proj.splashRadius + 2.2 && !this.isBlockedByShieldBubble(impactPos, center)) {
        const falloff = clamp(1 - (d / (proj.splashRadius + 2.2)) * 0.5, 0.4, 1.0);
        this.building.damagePiece(p.id, Math.round(proj.structureDamage * falloff));
      }
    }

    // Damage Props within splash radius
    const props = this.propsBridge.getProps();
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (prop.destroyed) continue;
      const center = { x: prop.x, y: prop.y + prop.height * 0.5, z: prop.z };
      const d = dist3D(impactPos, center);
      if (d <= proj.splashRadius + prop.radius && !this.isBlockedByShieldBubble(impactPos, center)) {
        this.propsBridge.damageProp(prop.id, proj.structureDamage, impactPos, false);
      }
    }

    // Damage Loot Llamas within splash radius
    const llamas = this.propsBridge.getLlamas?.() ?? [];
    for (let i = 0; i < llamas.length; i++) {
      const llama = llamas[i];
      if (llama.opened) continue;
      const center = { x: llama.x, y: llama.y + 0.8, z: llama.z };
      const d = dist3D(impactPos, center);
      if (d <= proj.splashRadius + 1.0 && !this.isBlockedByShieldBubble(impactPos, center)) {
        this.propsBridge.damageLlama?.(llama.id, proj.structureDamage, impactPos);
      }
    }

    // Damage Vehicles within splash radius
    const vehicles = this.vehicleBridge?.getVehicles() ?? [];
    for (let i = 0; i < vehicles.length; i++) {
      const veh = vehicles[i];
      if (veh.destroyed || veh.hp <= 0) continue;
      const center = { x: veh.x, y: veh.y + 0.65, z: veh.z };
      const d = dist3D(impactPos, center);
      if (d <= proj.splashRadius + 1.4 && !this.isBlockedByShieldBubble(impactPos, center)) {
        const falloff = clamp(1 - (d / (proj.splashRadius + 1.4)) * 0.5, 0.4, 1.0);
        this.vehicleBridge?.damageVehicle(
          veh.id,
          Math.round(proj.structureDamage * falloff),
          impactPos,
        );
      }
    }

    // Damage Slurp Barrels within splash radius
    if (this.stationBridge) {
      const barrels = this.stationBridge.getSlurpBarrels();
      const ownerActor =
        this.actorsProvider?.().find((a) => a.id === proj.ownerId && a.alive) ??
        null;
      for (let i = 0; i < barrels.length; i++) {
        const barrel = barrels[i];
        if (barrel.destroyed || barrel.hp <= 0) continue;
        const center = { x: barrel.x, y: barrel.y + 0.625, z: barrel.z };
        const d = dist3D(impactPos, center);
        if (
          d <= proj.splashRadius + 0.85 &&
          !this.isBlockedByShieldBubble(impactPos, center)
        ) {
          this.applySlurpBarrelHit(
            this.stationBridge,
            barrel.id,
            proj.structureDamage,
            center,
            { x: 0, y: 1, z: 0 },
            ownerActor,
          );
        }
      }
    }

    // Damage Explosive Barrels within splash radius
    if (this.riftCaptureBridge) {
      const expBarrels = this.riftCaptureBridge.getExplosiveBarrels();
      const ownerActor =
        this.actorsProvider?.().find((a) => a.id === proj.ownerId && a.alive) ??
        attackerStub;
      for (let i = 0; i < expBarrels.length; i++) {
        const barrel = expBarrels[i];
        if (barrel.exploded || barrel.hp <= 0 || this.explodingBarrelIds.has(barrel.id)) {
          continue;
        }
        const center = { x: barrel.x, y: barrel.y + 0.625, z: barrel.z };
        const d = dist3D(impactPos, center);
        if (
          d <= proj.splashRadius + 0.85 &&
          !this.isBlockedByShieldBubble(impactPos, center)
        ) {
          this.applyExplosiveBarrelHit(
            this.riftCaptureBridge,
            barrel.id,
            proj.structureDamage,
            center,
            { x: 0, y: 1, z: 0 },
            ownerActor,
            proj.isPlayer,
          );
        }
      }
    }

    // Damage Slurp Tankers within splash radius
    if (this.chapterBridge) {
      const tankers = this.chapterBridge.getSlurpTankers();
      for (let i = 0; i < tankers.length; i++) {
        const tanker = tankers[i];
        if (tanker.destroyed || tanker.hp <= 0 || this.rupturingTankerIds.has(tanker.id)) {
          continue;
        }
        const center = { x: tanker.x, y: tanker.y + 1.4, z: tanker.z };
        const d = dist3D(impactPos, center);
        if (
          d <= proj.splashRadius + 2.2 &&
          !this.isBlockedByShieldBubble(impactPos, center)
        ) {
          this.applySlurpTankerHit(
            this.chapterBridge,
            tanker.id,
            proj.structureDamage,
            center,
            { x: 0, y: 1, z: 0 },
          );
        }
      }
    }

    // Damage Actors within splash radius
    if (this.actorsProvider) {
      const actors = this.actorsProvider();
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i];
        if (!actor.alive) continue;
        const center = {
          x: actor.position.x,
          y: actor.position.y + actor.height * 0.5,
          z: actor.position.z,
        };
        const isDirectHit = directHit?.actorId === actor.id;
        const d = Math.min(dist3D(impactPos, actor.position), dist3D(impactPos, center));
        if (
          isDirectHit ||
          (d <= proj.splashRadius && !this.isBlockedByShieldBubble(impactPos, center))
        ) {
          const falloff = isDirectHit
            ? 1.0
            : clamp(1 - (d / proj.splashRadius) * 0.65, 0.35, 1.0);
          const hsMult =
            isDirectHit && directHit?.isHeadshot ? proj.headshotMultiplier : 1.0;
          const splashDmg = Math.round(proj.damage * falloff * hsMult);
          this.applyActorDamage(
            attackerStub,
            actor,
            proj.weaponId,
            proj.rarity,
            splashDmg,
            Boolean(isDirectHit && directHit?.isHeadshot),
            center,
            d,
            proj.isPlayer && actor.id !== proj.ownerId,
          );
        }
      }
    }
  }

  private detonateShockwave(proj: ActiveProjectile, impactPos: Vec3Like): void {
    this.eventBus.emit('vfx:shockwave', {
      position: impactPos,
      radius: proj.splashRadius,
    });
    this.eventBus.emit('sound:play', {
      id: 'shockwave_blast',
      position: impactPos,
      spatial: true,
    });
    this.eventBus.emit('audio:noise', {
      position: impactPos,
      kind: 'gunfire',
      sourceId: proj.ownerId,
      radius: 110,
    });
    this.emitBlastCameraShake(impactPos, 0.48, proj.isPlayer);

    // Break nearby builds
    const pieces = [...this.building.getPieces()];
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const center = {
        x: (p.gx + 0.5) * GRID_XZ,
        y: (p.gy + 0.5) * GRID_Y,
        z: (p.gz + 0.5) * GRID_XZ,
      };
      const d = dist3D(impactPos, center);
      if (d <= proj.splashRadius + 1.5) {
        this.building.damagePiece(p.id, proj.structureDamage);
      }
    }

    // Apply radial impulse knockback & fall immunity to actors in radius
    const baseImpulse = WEAPONS.shockwave_grenade.impulseStrength ?? 24;
    if (this.actorsProvider) {
      const actors = this.actorsProvider();
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i];
        if (!actor.alive) continue;
        const center = {
          x: actor.position.x,
          y: actor.position.y + actor.height * 0.5,
          z: actor.position.z,
        };
        const minDist = Math.min(dist3D(impactPos, actor.position), dist3D(impactPos, center));
        if (minDist <= proj.splashRadius) {
          const dx = actor.position.x - impactPos.x;
          const dz = actor.position.z - impactPos.z;
          const horizDist = Math.hypot(dx, dz);
          const falloff = clamp(1 - (minDist / proj.splashRadius) * 0.45, 0.5, 1.0);
          const strength = baseImpulse * falloff;

          const impulse: Vec3Like =
            horizDist > 0.08
              ? {
                  x: (dx / horizDist) * strength * 0.78,
                  y: Math.max(12, strength * 0.62),
                  z: (dz / horizDist) * strength * 0.78,
                }
              : {
                  x: 0,
                  y: Math.max(16, strength * 0.9),
                  z: 0,
                };

          actor.fallImmune = true;
          if (actor.onImpulse) {
            actor.onImpulse(impulse, true);
          } else if (actor.velocity) {
            actor.velocity.x += impulse.x;
            actor.velocity.y = Math.max(actor.velocity.y, 0) + impulse.y;
            actor.velocity.z += impulse.z;
          }
        }
      }
    }
  }

  private detonateChugSplash(proj: ActiveProjectile, impactPos: Vec3Like): void {
    this.eventBus.emit('vfx:splash_heal', {
      position: impactPos,
      radius: proj.splashRadius,
    });
    this.eventBus.emit('sound:play', {
      id: 'splash_heal',
      position: impactPos,
      spatial: true,
    });

    const healAmount = WEAPONS.chug_splash.splashHealAmount ?? 20;
    if (this.actorsProvider) {
      const actors = this.actorsProvider();
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i];
        if (!actor.alive) continue;
        const center = {
          x: actor.position.x,
          y: actor.position.y + actor.height * 0.5,
          z: actor.position.z,
        };
        const minDist = Math.min(dist3D(impactPos, actor.position), dist3D(impactPos, center));
        if (minDist <= proj.splashRadius) {
          const maxHp = actor.maxHp ?? 100;
          const maxShield = actor.maxShield ?? 100;
          const hpAdded = Math.min(healAmount, Math.max(0, maxHp - actor.hp));
          const leftover = healAmount - hpAdded;
          const shieldAdded = Math.min(leftover, Math.max(0, maxShield - actor.shield));
          actor.hp += hpAdded;
          actor.shield += shieldAdded;
          actor.onHeal?.(hpAdded, shieldAdded);
        }
      }
    }
  }

  private deployShieldBubble(proj: ActiveProjectile, impactPos: Vec3Like): void {
    const radius = proj.splashRadius > 0 ? proj.splashRadius : 5.2;
    const duration = 18;
    const id = `shield_bubble_${this.nextBubbleId++}`;
    this.shieldBubbles.push({
      id,
      position: { ...impactPos },
      radius,
      remaining: duration,
    });
    this.eventBus.emit('vfx:shield_bubble', {
      id,
      position: { ...impactPos },
      radius,
      duration,
    });
    this.eventBus.emit('sound:play', {
      id: 'shield_bubble_deploy',
      position: { ...impactPos },
      spatial: true,
    });
  }

  update(dt: number): void {
    const safeDt = clamp(dt, 0, 0.05);

    // 0. Tick active Shield Bubbles (18s duration)
    for (let i = this.shieldBubbles.length - 1; i >= 0; i--) {
      this.shieldBubbles[i].remaining -= safeDt;
      if (this.shieldBubbles[i].remaining <= 0) {
        this.shieldBubbles.splice(i, 1);
      }
    }

    // 1. Update queued burst shots (Burst AR)
    for (let i = this.pendingBursts.length - 1; i >= 0; i--) {
      const burst = this.pendingBursts[i];
      burst.timer -= safeDt;
      if (burst.timer <= 0) {
        if (!burst.params.actor.alive || burst.params.item.magAmmo <= 0) {
          this.pendingBursts.splice(i, 1);
          continue;
        }
        const aimDir = normalizeVec(burst.params.aimDir);
        this.executeHitscanShot(burst.params, aimDir);
        burst.shotsRemaining -= 1;
        if (burst.shotsRemaining <= 0) {
          this.pendingBursts.splice(i, 1);
        } else {
          burst.timer += burst.interval;
        }
      }
    }

    // 2. Step ballistic projectiles (Sniper, Rocket Launcher, Throwables)
    const props = this.propsBridge.getProps();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.bounceSoundCooldown && proj.bounceSoundCooldown > 0) {
        proj.bounceSoundCooldown = Math.max(0, proj.bounceSoundCooldown - safeDt);
      }

      proj.age += safeDt;

      // Frag grenade fuse countdown
      if (proj.fuseRemaining !== undefined) {
        proj.fuseRemaining -= safeDt;
        if (proj.fuseRemaining <= 0) {
          this.detonateExplosive(proj, proj.position);
          proj.alive = false;
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      if (proj.age >= proj.maxAge) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.settled) {
        continue;
      }

      const prevPos = { ...proj.position };
      proj.velocity.y -= proj.gravity * safeDt;

      const stepDx = proj.velocity.x * safeDt;
      const stepDy = proj.velocity.y * safeDt;
      const stepDz = proj.velocity.z * safeDt;
      const stepLen = Math.hypot(stepDx, stepDy, stepDz);

      if (stepLen > 1e-6) {
        const stepDir = {
          x: stepDx / stepLen,
          y: stepDy / stepLen,
          z: stepDz / stepLen,
        };

        const bubbleHit = proj.isShieldBubble
          ? null
          : this.raycastShieldBubbles(prevPos, stepDir, stepLen);
        const maxStepDist = bubbleHit ? bubbleHit.distance : stepLen;

        const worldHit = this.collision.raycastWorld(prevPos, stepDir, maxStepDist, {
          checkBuilds: true,
          checkProps: true,
          props,
        });
        const entityMaxDist = worldHit.hit ? worldHit.distance : maxStepDist;
        const barrelMaxDist =
          worldHit.hit && worldHit.targetType === 'static'
            ? Math.min(maxStepDist, worldHit.distance + 0.06)
            : entityMaxDist;
        const tankerMaxDist =
          worldHit.hit &&
          worldHit.targetType === 'static' &&
          worldHit.targetId?.includes('tanker')
            ? maxStepDist
            : worldHit.hit && worldHit.targetType === 'static'
              ? Math.min(maxStepDist, worldHit.distance + 0.12)
              : entityMaxDist;
        const actorHit = this.raycastActors(
          prevPos,
          stepDir,
          entityMaxDist,
          proj.ownerId,
        );
        const vehicleHit = this.raycastVehicles(
          prevPos,
          stepDir,
          entityMaxDist,
          this.vehicleBridge,
          proj.ownerId,
        );
        const barrelHit = this.raycastSlurpBarrels(
          prevPos,
          stepDir,
          barrelMaxDist,
          this.stationBridge,
        );
        const expBarrelHit = this.raycastExplosiveBarrels(
          prevPos,
          stepDir,
          barrelMaxDist,
          this.riftCaptureBridge,
        );
        const tankerHit = this.raycastSlurpTankers(
          prevPos,
          stepDir,
          tankerMaxDist,
          this.chapterBridge,
        );

        let hitType:
          | 'actor'
          | 'vehicle'
          | 'barrel'
          | 'exp_barrel'
          | 'tanker'
          | 'world'
          | 'bubble'
          | 'none' = 'none';
        let chosenDist = maxStepDist;
        if (worldHit.hit && worldHit.distance <= chosenDist) {
          hitType = 'world';
          chosenDist = worldHit.distance;
        }
        if (
          expBarrelHit &&
          expBarrelHit.distance <=
            chosenDist + (hitType === 'world' && worldHit.targetType === 'static' ? 0.06 : 0)
        ) {
          hitType = 'exp_barrel';
          chosenDist = expBarrelHit.distance;
        }
        if (
          barrelHit &&
          barrelHit.distance <=
            chosenDist + (hitType === 'world' && worldHit.targetType === 'static' ? 0.06 : 0)
        ) {
          hitType = 'barrel';
          chosenDist = barrelHit.distance;
        }
        if (
          tankerHit &&
          this.chapterBridge &&
          ((hitType === 'world' &&
            worldHit.targetType === 'static' &&
            worldHit.targetId?.includes('tanker')) ||
            tankerHit.distance <=
              chosenDist + (hitType === 'world' && worldHit.targetType === 'static' ? 0.12 : 0))
        ) {
          hitType = 'tanker';
          chosenDist = tankerHit.distance;
        }
        if (vehicleHit && vehicleHit.distance <= chosenDist) {
          hitType = 'vehicle';
          chosenDist = vehicleHit.distance;
        }
        if (actorHit && actorHit.distance <= chosenDist) {
          hitType = 'actor';
          chosenDist = actorHit.distance;
        }
        if (hitType === 'none' && bubbleHit) {
          hitType = 'bubble';
        }

        const nextPos =
          hitType === 'actor'
            ? actorHit!.point
            : hitType === 'vehicle'
              ? vehicleHit!.point
              : hitType === 'exp_barrel'
                ? expBarrelHit!.point
                : hitType === 'barrel'
                  ? barrelHit!.point
                  : hitType === 'tanker'
                    ? tankerHit!.point
                    : hitType === 'world'
                      ? worldHit.point
                      : hitType === 'bubble'
                        ? bubbleHit!.point
                        : {
                            x: prevPos.x + stepDx,
                            y: prevPos.y + stepDy,
                            z: prevPos.z + stepDz,
                          };

        const tracerColor =
          proj.isBoomArrow
            ? 0xfbbf24
            : proj.weaponId === 'rocket_launcher'
              ? 0xff5a2a
              : proj.isShieldBubble
                ? 0x38bdf8
                : proj.isShockwave
                  ? 0xa855f7
                  : proj.isSplashHeal
                    ? 0x22d3ee
                    : proj.isThrowable
                      ? 0xf59e0b
                      : 0xfff3b0;
        const tracerWidth =
          proj.weaponId === 'rocket_launcher'
            ? 0.14
            : proj.isBoomArrow
              ? 0.09
              : proj.isThrowable
                ? 0.08
                : 0.06;

        this.eventBus.emit('vfx:tracer', {
          from: prevPos,
          to: nextPos,
          color: tracerColor,
          width: tracerWidth,
        });

        proj.position = nextPos;

        if (hitType !== 'none') {
          if (proj.fuseRemaining !== undefined) {
            // Bouncing frag grenade (including off shield bubble shell!)
            const n =
              hitType === 'actor'
                ? actorHit!.normal
                : hitType === 'vehicle'
                  ? vehicleHit!.normal
                  : hitType === 'bubble'
                    ? bubbleHit!.normal
                    : worldHit.normal;
            const vn = proj.velocity.x * n.x + proj.velocity.y * n.y + proj.velocity.z * n.z;
            if (vn < 0) {
              const restitution = 0.35;
              const friction = 0.52;
              proj.velocity.x = (proj.velocity.x - (1 + restitution) * vn * n.x) * friction;
              proj.velocity.y = (proj.velocity.y - (1 + restitution) * vn * n.y) * friction;
              proj.velocity.z = (proj.velocity.z - (1 + restitution) * vn * n.z) * friction;
            }
            proj.position = {
              x: nextPos.x + n.x * 0.08,
              y: nextPos.y + n.y * 0.08,
              z: nextPos.z + n.z * 0.08,
            };
            if (Math.abs(vn) > 1.5 && (!proj.bounceSoundCooldown || proj.bounceSoundCooldown <= 0)) {
              this.eventBus.emit('sound:play', {
                id: 'grenade_bounce',
                position: nextPos,
                spatial: true,
              });
              proj.bounceSoundCooldown = 0.08;
            }
            if (proj.bouncesRemaining !== undefined && proj.bouncesRemaining > 0) {
              proj.bouncesRemaining -= 1;
            }
            if (n.y > 0.7 && Math.hypot(proj.velocity.x, proj.velocity.y, proj.velocity.z) < 1.8) {
              proj.velocity = { x: 0, y: 0, z: 0 };
              proj.settled = true;
            }
          } else if (proj.isShieldBubble) {
            this.deployShieldBubble(proj, nextPos);
            proj.alive = false;
            this.projectiles.splice(i, 1);
          } else if (proj.isShockwave) {
            this.detonateShockwave(proj, nextPos);
            proj.alive = false;
            this.projectiles.splice(i, 1);
          } else if (proj.isSplashHeal) {
            this.detonateChugSplash(proj, nextPos);
            proj.alive = false;
            this.projectiles.splice(i, 1);
          } else if (proj.splashRadius > 0) {
            const impactPos =
              hitType === 'bubble' && bubbleHit
                ? {
                    x: nextPos.x + bubbleHit.normal.x * 0.08,
                    y: nextPos.y + bubbleHit.normal.y * 0.08,
                    z: nextPos.z + bubbleHit.normal.z * 0.08,
                  }
                : nextPos;
            const directHit =
              proj.isBoomArrow && hitType === 'actor' && actorHit
                ? { actorId: actorHit.actor.id, isHeadshot: actorHit.isHeadshot }
                : undefined;
            this.detonateExplosive(proj, impactPos, directHit);
            proj.alive = false;
            this.projectiles.splice(i, 1);
          } else {
            if (hitType === 'bubble' && bubbleHit) {
              this.eventBus.emit('vfx:impact', {
                position: bubbleHit.point,
                normal: bubbleHit.normal,
                material: 'shield',
              });
              this.eventBus.emit('sound:play', {
                id: 'shield_hit',
                position: bubbleHit.point,
                spatial: true,
              });
            } else if (hitType === 'actor' && actorHit) {
              const travelDist = dist3D(proj.startPos, nextPos);
              const baseDmg = computeWeaponDamage(
                proj.weaponId,
                proj.rarity,
                travelDist,
                actorHit.isHeadshot,
              );
              const dmg = Math.round(
                baseDmg *
                  (proj.firstAssaultActive ? 1.25 : 1.0) *
                  (proj.combatMedallionActive ? 1.12 : 1.0),
              );
              const attackerStub: CombatActor = {
                id: proj.ownerId,
                name: proj.ownerName,
                position: proj.startPos,
                eyePos: proj.startPos,
                hp: 100,
                shield: 0,
                radius: 0.42,
                height: 1.85,
                alive: true,
              };
              this.applyActorDamage(
                attackerStub,
                actorHit.actor,
                proj.weaponId,
                proj.rarity,
                dmg,
                actorHit.isHeadshot,
                nextPos,
                travelDist,
                proj.isPlayer,
              );
            } else if (hitType === 'exp_barrel' && expBarrelHit && this.riftCaptureBridge) {
              const ownerActor =
                this.actorsProvider?.().find((a) => a.id === proj.ownerId && a.alive) ??
                null;
              this.applyExplosiveBarrelHit(
                this.riftCaptureBridge,
                expBarrelHit.barrel.id,
                proj.structureDamage,
                expBarrelHit.point,
                expBarrelHit.normal,
                ownerActor,
                proj.isPlayer,
              );
            } else if (hitType === 'barrel' && barrelHit && this.stationBridge) {
              const ownerActor =
                this.actorsProvider?.().find((a) => a.id === proj.ownerId && a.alive) ??
                null;
              this.applySlurpBarrelHit(
                this.stationBridge,
                barrelHit.barrel.id,
                proj.structureDamage,
                barrelHit.point,
                barrelHit.normal,
                ownerActor,
              );
            } else if (hitType === 'tanker' && tankerHit && this.chapterBridge) {
              this.applySlurpTankerHit(
                this.chapterBridge,
                tankerHit.tanker.id,
                proj.structureDamage,
                tankerHit.point,
                tankerHit.normal,
              );
            } else if (hitType === 'vehicle' && vehicleHit) {
              this.vehicleBridge?.damageVehicle(
                vehicleHit.vehicle.id,
                proj.structureDamage,
                vehicleHit.point,
              );
              this.eventBus.emit('vfx:impact', {
                position: vehicleHit.point,
                normal: vehicleHit.normal,
                material: 'metal',
              });
            } else if (hitType === 'world' && worldHit.hit) {
              this.applyWorldHitDamage(worldHit, proj.structureDamage);
            }
            proj.alive = false;
            this.projectiles.splice(i, 1);
          }
        }
      }
    }
  }

  clear(): void {
    this.projectiles = [];
    this.pendingBursts = [];
    this.shieldBubbles = [];
    this.explodingBarrelIds.clear();
    this.rupturingTankerIds.clear();
    this.twinMagSlowUids.clear();
  }
}
