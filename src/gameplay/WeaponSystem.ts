import type {
  DamageEvent,
  LootLlamaEntity,
  MaterialType,
  ProjectileState,
  Rarity,
  SoundEventId,
  Vec3Like,
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
} from './GameplayTypes';

const SHOT_SOUND_MAP: Record<WeaponId, SoundEventId> = {
  pickaxe: 'pickaxe_swing',
  ar: 'shot_ar',
  burst_ar: 'shot_burst_ar',
  pump_shotgun: 'shot_pump',
  tac_shotgun: 'shot_tac',
  heavy_shotgun: 'shot_heavy_shotgun',
  smg: 'shot_smg',
  sniper: 'shot_sniper',
  pistol: 'shot_pistol',
  rocket_launcher: 'shot_rocket',
  mythic_blade_rifle: 'shot_mythic_rifle',
  shockwave_grenade: 'pickaxe_swing',
  frag_grenade: 'pickaxe_swing',
  chug_splash: 'pickaxe_swing',
  mini_shield: 'ui_click',
  shield_potion: 'ui_click',
  bandages: 'ui_click',
  medkit: 'ui_click',
  slurp_juice: 'ui_click',
};

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
  private projectiles: ActiveProjectile[] = [];
  private pendingBursts: PendingBurst[] = [];
  private nextProjId = 1;
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

  getProjectiles(): ProjectileState[] {
    return this.projectiles;
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
    const shieldBefore = Math.max(0, target.shield);
    const shieldDamage = Math.min(shieldBefore, damage);
    const remaining = damage - shieldDamage;
    const hpDamage = Math.min(Math.max(0, target.hp), remaining);
    const isElimination = target.hp - hpDamage <= 0;

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

    const shieldBroke = shieldBefore > 0 && target.shield <= 0;
    const hitShield = shieldDamage > 0;

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

  private raycastLlamas(
    origin: Vec3Like,
    dir: Vec3Like,
    maxDist: number,
  ): { llama: LootLlamaEntity; distance: number; point: Vec3Like; normal: Vec3Like } | null {
    const llamas = this.propsBridge.getLlamas?.();
    if (!llamas || llamas.length === 0) return null;

    const invDx = Math.abs(dir.x) > 1e-9 ? 1 / dir.x : 1e9;
    const invDy = Math.abs(dir.y) > 1e-9 ? 1 / dir.y : 1e9;
    const invDz = Math.abs(dir.z) > 1e-9 ? 1 / dir.z : 1e9;
    const r = 0.78;
    const h = 1.65;

    let bestDist = maxDist;
    let best: { llama: LootLlamaEntity; distance: number; point: Vec3Like; normal: Vec3Like } | null = null;

    for (let i = 0; i < llamas.length; i++) {
      const llama = llamas[i];
      if (llama.opened) continue;
      const minX = llama.x - r;
      const maxX = llama.x + r;
      const minY = llama.y;
      const maxY = llama.y + h;
      const minZ = llama.z - r;
      const maxZ = llama.z + r;

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

      if (tmax >= Math.max(0, tmin) && tmin >= 0 && tmin < bestDist) {
        bestDist = tmin;
        best = {
          llama,
          distance: tmin,
          point: {
            x: origin.x + dir.x * tmin,
            y: origin.y + dir.y * tmin,
            z: origin.z + dir.z * tmin,
          },
          normal: { x: nx, y: ny, z: nz },
        };
      }
    }

    return best;
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

    if (
      actorHit &&
      (!worldHit.hit || actorHit.distance <= worldHit.distance) &&
      (!llamaHit || actorHit.distance <= llamaHit.distance)
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

    if (llamaHit && (!worldHit.hit || llamaHit.distance <= worldHit.distance)) {
      this.propsBridge.damageLlama?.(
        llamaHit.llama.id,
        def.structureDamage,
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
        damageDealt: def.structureDamage,
      };
    }

    if (worldHit.hit) {
      if (worldHit.targetType === 'prop' && worldHit.targetId) {
        const res = this.propsBridge.damageProp(
          worldHit.targetId,
          def.structureDamage,
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
            damageDealt: def.structureDamage,
            harvested: {
              matType: res.matType,
              amount: res.yieldAmount,
              isCrit: res.isCrit,
            },
          };
        }
      } else if (worldHit.targetType === 'build' && worldHit.targetId) {
        this.building.damagePiece(worldHit.targetId, def.structureDamage);
        this.eventBus.emit('vfx:impact', {
          position: worldHit.point,
          normal: worldHit.normal,
          material: worldHit.material ?? 'wood',
        });
        return {
          fired: true,
          shotsHit: 1,
          headshots: 0,
          damageDealt: def.structureDamage,
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

  private launchProjectile(
    params: FireWeaponParams,
    aimDir: Vec3Like,
  ): FireWeaponResult {
    const def = WEAPONS[params.item.weaponId];
    if (def.isThrowable && params.item.stackCount <= 0) {
      return { fired: false, shotsHit: 0, headshots: 0, damageDealt: 0 };
    }
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
        x: shotDir.x * def.projectileSpeed,
        y: shotDir.y * def.projectileSpeed,
        z: shotDir.z * def.projectileSpeed,
      },
      gravity: def.projectileGravity,
      damage: Math.round(def.baseDamage * rarityMult),
      structureDamage: Math.round(def.structureDamage * rarityMult),
      headshotMultiplier: def.headshotMultiplier,
      splashRadius: def.splashRadius,
      age: 0,
      maxAge:
        def.fuseTime !== undefined
          ? def.fuseTime + 0.5
          : params.item.weaponId === 'sniper'
            ? 3.2
            : 8.5,
      alive: true,
      isPlayer: params.isPlayer,
      isThrowable: Boolean(def.isThrowable),
      bouncesRemaining: isFrag ? 5 : 0,
      fuseRemaining: def.fuseTime,
      isShockwave,
      isSplashHeal,
      settled: false,
      bounceSoundCooldown: 0,
    };

    this.projectiles.push(proj);
    return { fired: true, shotsHit: 0, headshots: 0, damageDealt: 0 };
  }

  private executeHitscanShot(
    params: FireWeaponParams,
    aimDir: Vec3Like,
  ): FireWeaponResult {
    const def = WEAPONS[params.item.weaponId];
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

      const worldHit = this.collision.raycastWorld(params.origin, rayDir, def.range, {
        checkBuilds: true,
        checkProps: true,
        props,
      });

      const actorMaxDist = worldHit.hit ? worldHit.distance : def.range;
      const actorHit = this.raycastActors(
        params.origin,
        rayDir,
        actorMaxDist,
        params.actor.id,
      );
      const llamaHit = this.raycastLlamas(params.origin, rayDir, actorMaxDist);

      const endPoint = actorHit
        ? actorHit.point
        : llamaHit && (!worldHit.hit || llamaHit.distance <= worldHit.distance)
          ? llamaHit.point
          : worldHit.hit
            ? worldHit.point
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

      if (actorHit) {
        const pelletDmg =
          computeWeaponDamage(
            params.item.weaponId,
            params.item.rarity,
            actorHit.distance,
            actorHit.isHeadshot,
          ) / pellets;

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
      } else if (llamaHit && (!worldHit.hit || llamaHit.distance <= worldHit.distance)) {
        const structDmg = Math.max(
          1,
          Math.round((def.structureDamage * (RARITY_MULTIPLIER[params.item.rarity] ?? 1)) / pellets),
        );
        this.propsBridge.damageLlama?.(llamaHit.llama.id, structDmg, llamaHit.point);
        this.eventBus.emit('vfx:impact', {
          position: llamaHit.point,
          normal: llamaHit.normal,
          material: 'wood',
        });
      } else if (worldHit.hit) {
        const structDmg = Math.max(
          1,
          Math.round((def.structureDamage * (RARITY_MULTIPLIER[params.item.rarity] ?? 1)) / pellets),
        );

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

  private detonateExplosive(proj: ActiveProjectile, impactPos: Vec3Like): void {
    this.eventBus.emit('vfx:explosion', {
      position: impactPos,
      radius: proj.splashRadius,
    });
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
      if (d <= proj.splashRadius + 2.2) {
        const falloff = clamp(1 - (d / (proj.splashRadius + 2.2)) * 0.5, 0.4, 1.0);
        this.building.damagePiece(p.id, Math.round(proj.structureDamage * falloff));
      }
    }

    // Damage Props within splash radius
    const props = this.propsBridge.getProps();
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (prop.destroyed) continue;
      const d = dist3D(impactPos, { x: prop.x, y: prop.y + prop.height * 0.5, z: prop.z });
      if (d <= proj.splashRadius + prop.radius) {
        this.propsBridge.damageProp(prop.id, proj.structureDamage, impactPos, false);
      }
    }

    // Damage Loot Llamas within splash radius
    const llamas = this.propsBridge.getLlamas?.() ?? [];
    for (let i = 0; i < llamas.length; i++) {
      const llama = llamas[i];
      if (llama.opened) continue;
      const d = dist3D(impactPos, { x: llama.x, y: llama.y + 0.8, z: llama.z });
      if (d <= proj.splashRadius + 1.0) {
        this.propsBridge.damageLlama?.(llama.id, proj.structureDamage, impactPos);
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
        const d = dist3D(impactPos, center);
        if (d <= proj.splashRadius) {
          const falloff = clamp(1 - (d / proj.splashRadius) * 0.65, 0.35, 1.0);
          const splashDmg = Math.round(proj.damage * falloff);
          this.applyActorDamage(
            attackerStub,
            actor,
            proj.weaponId,
            proj.rarity,
            splashDmg,
            false,
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

  update(dt: number): void {
    const safeDt = clamp(dt, 0, 0.05);

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

        const worldHit = this.collision.raycastWorld(prevPos, stepDir, stepLen, {
          checkBuilds: true,
          checkProps: true,
          props,
        });
        const actorHit = this.raycastActors(
          prevPos,
          stepDir,
          worldHit.hit ? worldHit.distance : stepLen,
          proj.ownerId,
        );

        const nextPos = actorHit
          ? actorHit.point
          : worldHit.hit
            ? worldHit.point
            : {
                x: prevPos.x + stepDx,
                y: prevPos.y + stepDy,
                z: prevPos.z + stepDz,
              };

        const tracerColor =
          proj.weaponId === 'rocket_launcher'
            ? 0xff5a2a
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

        if (actorHit || worldHit.hit) {
          if (proj.fuseRemaining !== undefined) {
            // Bouncing frag grenade
            const n = actorHit ? actorHit.normal : worldHit.normal;
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
          } else if (proj.isShockwave) {
            this.detonateShockwave(proj, nextPos);
            proj.alive = false;
            this.projectiles.splice(i, 1);
          } else if (proj.isSplashHeal) {
            this.detonateChugSplash(proj, nextPos);
            proj.alive = false;
            this.projectiles.splice(i, 1);
          } else if (proj.splashRadius > 0) {
            this.detonateExplosive(proj, nextPos);
            proj.alive = false;
            this.projectiles.splice(i, 1);
          } else {
            if (actorHit) {
              const travelDist = dist3D(proj.startPos, nextPos);
              const dmg = computeWeaponDamage(
                proj.weaponId,
                proj.rarity,
                travelDist,
                actorHit.isHeadshot,
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
            } else if (worldHit.hit) {
              if (worldHit.targetType === 'build' && worldHit.targetId) {
                this.building.damagePiece(worldHit.targetId, proj.structureDamage);
                this.eventBus.emit('vfx:impact', {
                  position: worldHit.point,
                  normal: worldHit.normal,
                  material: worldHit.material ?? 'wood',
                });
              } else if (worldHit.targetType === 'prop' && worldHit.targetId) {
                const propRes = this.propsBridge.damageProp(
                  worldHit.targetId,
                  proj.structureDamage,
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
  }
}
