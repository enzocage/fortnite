import type {
  AmmoType,
  BuildPiece,
  CampfireEntity,
  CapturePointEntity,
  Difficulty,
  ExplosiveBarrelEntity,
  GameModeId,
  ItemInstance,
  LaunchPadEntity,
  MaterialType,
  POIDef,
  RiftEntity,
  SlurpBarrelEntity,
  Vec3Like,
  VehicleEntity,
  WeaponId,
} from '../types';
import {
  BUILD_COST,
  DBNO_BLEED_DPS,
  DBNO_MAX_HP,
  GLIDER_FORCE_HEIGHT,
  MAX_MATS,
  POIS,
  RARITY_MULTIPLIER,
  RARITY_ORDER,
  REVIVE_DURATION_SEC,
  WATER_LEVEL,
  WEAPONS,
  WORLD_HALF,
  canonicalizeWall,
  clamp,
  damp,
  dist2D,
  dist3D,
  lerpAngle,
  normalizeAngle,
  worldToGrid,
} from '../core';
import type {
  AllySupportEvent,
  BotCombatTarget,
  BotEntity,
  BotWorldContext,
  ShieldBubbleZone,
} from './BotTypes';

export interface DifficultyProfile {
  aimSpreadMult: number;
  baseAimErrorRad: number;
  reactionTimeSec: number;
  fireRateScale: number;
  buildChance: number;
  buildCooldownSec: number;
  rampOnBuildChance: number;
  strafeAgility: number;
  jumpInCombatChance: number;
  crouchInCombatChance: number;
  visionRange: number;
  healThresholdHp: number;
  headshotAimBias: number;
  turnSpeedRadPerSec: number;
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  casual: {
    aimSpreadMult: 2.8,
    baseAimErrorRad: 0.085,
    reactionTimeSec: 0.72,
    fireRateScale: 0.62,
    buildChance: 0.2,
    buildCooldownSec: 3.4,
    rampOnBuildChance: 0.15,
    strafeAgility: 0.45,
    jumpInCombatChance: 0.12,
    crouchInCombatChance: 0.08,
    visionRange: 75,
    healThresholdHp: 45,
    headshotAimBias: 0.04,
    turnSpeedRadPerSec: 4.5,
  },
  standard: {
    aimSpreadMult: 1.5,
    baseAimErrorRad: 0.038,
    reactionTimeSec: 0.38,
    fireRateScale: 0.85,
    buildChance: 0.6,
    buildCooldownSec: 1.6,
    rampOnBuildChance: 0.55,
    strafeAgility: 0.8,
    jumpInCombatChance: 0.36,
    crouchInCombatChance: 0.25,
    visionRange: 105,
    healThresholdHp: 65,
    headshotAimBias: 0.12,
    turnSpeedRadPerSec: 7.5,
  },
  sweaty: {
    aimSpreadMult: 0.8,
    baseAimErrorRad: 0.012,
    reactionTimeSec: 0.16,
    fireRateScale: 1.0,
    buildChance: 0.92,
    buildCooldownSec: 0.65,
    rampOnBuildChance: 0.9,
    strafeAgility: 1.0,
    jumpInCombatChance: 0.65,
    crouchInCombatChance: 0.45,
    visionRange: 140,
    healThresholdHp: 80,
    headshotAimBias: 0.26,
    turnSpeedRadPerSec: 12.0,
  },
};

const GRAVITY = 22.0;
const JUMP_VELOCITY = 8.2;
const SPRINT_SPEED = 7.2;
const RUN_SPEED = 5.4;
const WALK_SPEED = 4.4;
const CROUCH_SPEED = 2.8;
const SKYDIVE_HORIZONTAL_SPEED = 19.0;
const SKYDIVE_DESCENT_SPEED = 24.0;
const GLIDE_HORIZONTAL_SPEED = 15.0;
const GLIDE_DESCENT_SPEED = 7.5;
const ALLY_LEASH_MIN = 5.5;
const ALLY_LEASH_MAX = 16.0;
const ALLY_TELEPORT_DIST = 38.0;
const ALLY_COMBAT_RANGE = 45.0;
const ALLY_SCOUT_PING_RANGE = 55.0;
const ALLY_SCOUT_PING_COOLDOWN = 16.0;
const ALLY_MEDIC_HEAL_COOLDOWN = 18.0;
const ALLY_MEDIC_HEAL_AMOUNT = 25;
const KNOCKED_CRAWL_SPEED = 1.4;
const REVIVE_REACH_DIST = 3.4;
const SQUAD_REVIVE_RANGE = 55.0;
const SQUAD_UNSAFE_ENEMY_DIST = 16.0;
const playerReviveCompletedLatch = new WeakMap<BotEntity, boolean>();

const SCORCHED_CALDERA_POI = POIS.find((p) => p.id === 'scorched_caldera');
export const VOLCANO_LAVA_CENTER_X = SCORCHED_CALDERA_POI
  ? SCORCHED_CALDERA_POI.x - 19
  : -194;
export const VOLCANO_LAVA_CENTER_Z = SCORCHED_CALDERA_POI
  ? SCORCHED_CALDERA_POI.z + 17
  : 142;
export const VOLCANO_LAVA_SAFE_RADIUS = 14.0;

/**
 * Returns true if the world XZ coordinate lies within the Scorched Caldera molten lava hazard radius.
 */
export function isInVolcanoLavaHazard(
  x: number,
  z: number,
  safeRadius = VOLCANO_LAVA_SAFE_RADIUS,
): boolean {
  return dist2D(x, z, VOLCANO_LAVA_CENTER_X, VOLCANO_LAVA_CENTER_Z) < safeRadius;
}

/**
 * Clamps a world XZ point outside the Scorched Caldera molten lava crater.
 */
export function clampOutsideVolcanoLava(
  x: number,
  z: number,
  safeRadius = VOLCANO_LAVA_SAFE_RADIUS + 1.5,
): { x: number; z: number } {
  const dx = x - VOLCANO_LAVA_CENTER_X;
  const dz = z - VOLCANO_LAVA_CENTER_Z;
  const d = Math.hypot(dx, dz);
  if (d >= safeRadius) return { x, z };
  if (d < 1e-4) {
    return { x: VOLCANO_LAVA_CENTER_X + safeRadius, z: VOLCANO_LAVA_CENTER_Z };
  }
  return {
    x: VOLCANO_LAVA_CENTER_X + (dx / d) * safeRadius,
    z: VOLCANO_LAVA_CENTER_Z + (dz / d) * safeRadius,
  };
}

function isHealingItem(weaponId: WeaponId): boolean {
  return WEAPONS[weaponId].isConsumable || weaponId === 'chug_splash';
}

function isOffensiveThrowable(weaponId: WeaponId): boolean {
  return weaponId === 'frag_grenade' || weaponId === 'shockwave_grenade';
}

function nextBotRand(bot: BotEntity): number {
  bot.rngState = (Math.imul(bot.rngState, 1664525) + 1013904223) >>> 0;
  return bot.rngState / 4294967296;
}

function getBotEyePos(bot: BotEntity): Vec3Like {
  return {
    x: bot.position.x,
    y: bot.position.y + (bot.isCrouching ? 1.05 : 1.55),
    z: bot.position.z,
  };
}

function isFriendlyTarget(
  bot: Pick<BotEntity, 'id' | 'isAlly' | 'isDuoPartner' | 'squadId'>,
  t: Pick<BotCombatTarget, 'id' | 'isPlayer' | 'isAlly' | 'isDuoPartner' | 'squadId'>,
  squadmates?: ReadonlyArray<Pick<BotEntity, 'id'>>,
): boolean {
  if (t.id === bot.id) return true;
  const botInPlayerSquad =
    Boolean(bot.isAlly) ||
    Boolean(bot.isDuoPartner) ||
    bot.squadId === 'player_squad';
  if (botInPlayerSquad) {
    if (
      t.isPlayer ||
      t.id === 'player' ||
      t.isAlly ||
      t.isDuoPartner ||
      t.squadId === 'player_squad'
    ) {
      return true;
    }
  }
  if (bot.squadId && t.squadId && bot.squadId === t.squadId) {
    return true;
  }
  if (squadmates && squadmates.some((m) => m.id === t.id)) {
    return true;
  }
  return false;
}

function getTotalMaterials(bot: Pick<BotEntity, 'inventory'>): number {
  const m = bot.inventory.materials;
  return (m.wood ?? 0) + (m.brick ?? 0) + (m.metal ?? 0);
}

function pickAvailableMaterial(bot: BotEntity): MaterialType | null {
  const m = bot.inventory.materials;
  if (m.wood >= BUILD_COST) return 'wood';
  if (m.brick >= BUILD_COST) return 'brick';
  if (m.metal >= BUILD_COST) return 'metal';
  return null;
}

/**
 * Computes effective weapon spread in radians for a bot at the given difficulty.
 */
export function computeBotSpread(
  weaponId: WeaponId,
  difficulty: Difficulty,
  isMoving = false,
  isCrouching = false,
): number {
  const def = WEAPONS[weaponId];
  const profile = DIFFICULTY_PROFILES[difficulty];
  let spread = def.baseSpread * profile.aimSpreadMult + profile.baseAimErrorRad;
  if (isMoving) {
    spread += def.moveSpreadAdd * profile.aimSpreadMult * 0.5;
  }
  if (isCrouching) {
    spread *= def.crouchSpreadMult;
  }
  return Math.max(0.001, spread);
}

function scoreWeaponForDistance(
  item: ItemInstance,
  distance: number,
  hasLoadedMag: boolean,
): number {
  const def = WEAPONS[item.weaponId];
  if (!def || isHealingItem(item.weaponId)) return -1;
  if (
    def.isGrappler ||
    def.isShieldBubble ||
    item.weaponId === 'grappler' ||
    item.weaponId === 'shield_bubble'
  ) {
    return -1;
  }

  if (item.weaponId === 'pickaxe') {
    return distance <= def.range + 1.0 ? 5 : -1;
  }

  if (item.weaponId === 'kinetic_blade') {
    return distance <= def.range + 1.0 ? 85 : -1;
  }

  if (def.isThrowable) {
    if (item.stackCount <= 0) return -1;
    if (distance < 8 || distance > 52) return -1;
    return item.weaponId === 'frag_grenade' ? 20 : 14;
  }

  let base = 0;
  switch (item.weaponId) {
    case 'pump_shotgun':
      if (distance > def.range + 4) return 0.5;
      base = distance <= 12 ? 116 - distance * 2.4 : Math.max(4, 88 - (distance - 12) * 3.5);
      break;
    case 'heavy_shotgun':
      if (distance > def.range + 4) return 0.5;
      base = distance <= 16 ? 124 - distance * 1.8 : Math.max(8, 95 - (distance - 16) * 3.0);
      break;
    case 'tac_shotgun':
      if (distance > def.range + 4) return 0.5;
      base = distance <= 12 ? 106 - distance * 2.2 : Math.max(4, 80 - (distance - 12) * 3.4);
      break;
    case 'smg':
      if (distance > def.range) return 0.5;
      base = distance <= 18 ? 94 - distance * 0.7 : Math.max(5, 81 - (distance - 18) * 1.15);
      break;
    case 'combat_smg':
      if (distance > def.range) return 0.5;
      base = distance <= 22 ? 102 - distance * 0.65 : Math.max(6, 87.7 - (distance - 22) * 1.1);
      break;
    case 'pistol':
      if (distance > def.range) return 0.5;
      base = distance <= 28 ? 64 - distance * 0.45 : Math.max(5, 51 - (distance - 28) * 0.45);
      break;
    case 'ar':
      if (distance > def.range) return 0.5;
      if (distance < 15) base = 66 + distance * 1.2;
      else if (distance <= 90) base = 104;
      else base = Math.max(15, 104 - (distance - 90) * 0.45);
      break;
    case 'burst_ar':
      if (distance > def.range) return 0.5;
      if (distance < 15) base = 62 + distance * 1.3;
      else if (distance <= 100) base = 102;
      else base = Math.max(15, 102 - (distance - 100) * 0.4);
      break;
    case 'tactical_dmr':
      if (distance > def.range) return 0.5;
      if (distance < 15) base = 60 + distance * 1.2;
      else if (distance <= 115) base = 109;
      else base = Math.max(24, 109 - (distance - 115) * 0.35);
      break;
    case 'mythic_blade_rifle':
      if (distance > def.range) return 0.5;
      if (distance < 15) base = 76 + distance * 1.4;
      else if (distance <= 100) base = 116;
      else base = Math.max(22, 116 - (distance - 100) * 0.4);
      break;
    case 'sniper':
      if (distance < 22) base = 18;
      else if (distance < 60) base = 64 + (distance - 22) * 1.0;
      else base = Math.min(126, 104 + (distance - 60) * 0.25);
      break;
    case 'boom_bow':
      if (distance > def.range) return 0.5;
      if (distance < 14) base = 14;
      else if (distance < 30) base = 58 + (distance - 14) * 2.2;
      else if (distance <= 95) base = 106;
      else base = Math.max(30, 106 - (distance - 95) * 0.48);
      break;
    case 'rocket_launcher':
      if (distance < 8) base = 8;
      else if (distance <= 55) base = 92;
      else base = Math.max(15, 92 - (distance - 55) * 0.45);
      break;
  }

  const rarityMult = RARITY_MULTIPLIER[item.rarity] ?? 1.0;
  return base * rarityMult + (hasLoadedMag ? 15 : 0);
}

/**
 * Selects the highest-scoring weapon slot for the target distance,
 * skipping empty guns that have neither mag ammo nor reserve ammo.
 */
export function selectBestWeaponForDistance(
  items: (ItemInstance | null)[],
  distance: number,
  ammo?: Record<AmmoType, number>,
): { slotIndex: number; item: ItemInstance } | null {
  let bestSlot = -1;
  let bestItem: ItemInstance | null = null;
  let bestScore = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const def = WEAPONS[item.weaponId];
    if (!def || isHealingItem(item.weaponId)) continue;

    if (def.isThrowable && item.stackCount <= 0) continue;

    if (def.ammoType !== null && ammo !== undefined) {
      const reserve = ammo[def.ammoType] ?? 0;
      if (item.magAmmo <= 0 && reserve <= 0) {
        continue;
      }
    }

    const score = scoreWeaponForDistance(
      item,
      distance,
      !def.isThrowable && item.magAmmo > 0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestSlot = i;
      bestItem = item;
    }
  }

  if (bestSlot < 0 || !bestItem || bestScore <= 0) {
    return null;
  }
  return { slotIndex: bestSlot, item: bestItem };
}

/**
 * Alias for `selectBestWeaponForDistance` returning the highest-scoring weapon slot for range.
 */
export function selectBestWeaponForRange(
  items: (ItemInstance | null)[],
  distance: number,
  ammo?: Record<AmmoType, number>,
): { slotIndex: number; item: ItemInstance } | null {
  return selectBestWeaponForDistance(items, distance, ammo);
}

export interface ThrowableDecision {
  slotIndex: number;
  item: ItemInstance;
  reason: 'clustered' | 'boxed';
}

/**
 * Evaluates whether a bot should throw a `frag_grenade` or `shockwave_grenade`
 * against clustered enemies or a boxed/occluded target.
 */
export function selectThrowableForCombat(
  bot: Pick<BotEntity, 'id' | 'position' | 'inventory' | 'throwCooldown'> & {
    isAlly?: boolean;
    isDuoPartner?: boolean;
    squadId?: string;
  },
  target: BotCombatTarget,
  allTargets: BotCombatTarget[],
  hasLOS: boolean,
  buildPieces?: BuildPiece[],
  squadmates?: ReadonlyArray<Pick<BotEntity, 'id'>>,
): ThrowableDecision | null {
  if ((bot.throwCooldown ?? 0) > 0) return null;
  if (
    allTargets.some(
      (other) =>
        other.alive &&
        isFriendlyTarget(bot, other, squadmates) &&
        dist3D(other.position, target.position) <= 9.0,
    )
  ) {
    return null;
  }

  const horizDist = dist2D(
    bot.position.x,
    bot.position.z,
    target.position.x,
    target.position.z,
  );
  if (horizDist < 8 || horizDist > 46) return null;

  let fragSlot = -1;
  let shockwaveSlot = -1;
  for (let i = 0; i < bot.inventory.items.length; i++) {
    const it = bot.inventory.items[i];
    if (!it || it.stackCount <= 0) continue;
    if (it.weaponId === 'frag_grenade' && fragSlot < 0) fragSlot = i;
    if (it.weaponId === 'shockwave_grenade' && shockwaveSlot < 0) shockwaveSlot = i;
  }
  if (fragSlot < 0 && shockwaveSlot < 0) return null;

  const isClustered = allTargets.some(
    (other) =>
      other.alive &&
      other.id !== bot.id &&
      other.id !== target.id &&
      dist3D(other.position, target.position) <= 9.0,
  );

  const hasNearbyBuild =
    buildPieces?.some((p) => {
      const cx = (p.gx + 0.5) * 4.0;
      const cy = (p.gy + 0.5) * 3.2;
      const cz = (p.gz + 0.5) * 4.0;
      return (
        dist2D(cx, cz, target.position.x, target.position.z) <= 5.0 &&
        Math.abs(cy - target.position.y) <= 3.8
      );
    }) ?? false;

  const isBoxed = !hasLOS || hasNearbyBuild;

  if (!isClustered && !isBoxed) return null;

  if (isClustered) {
    const slotIndex = fragSlot >= 0 ? fragSlot : shockwaveSlot;
    const item = bot.inventory.items[slotIndex];
    return item ? { slotIndex, item, reason: 'clustered' } : null;
  }

  // Boxed target: prefer shockwave to shatter builds/displace, or frag grenade to pressure box
  const slotIndex = shockwaveSlot >= 0 ? shockwaveSlot : fragSlot;
  const item = bot.inventory.items[slotIndex];
  return item ? { slotIndex, item, reason: 'boxed' } : null;
}

/**
 * Returns `true` if the line segment `[a, b]` intersects or lies within the sphere
 * centered at `center` with radius `radius`.
 */
export function segmentIntersectsSphere(
  a: Vec3Like,
  b: Vec3Like,
  center: Vec3Like,
  radius: number,
): boolean {
  if (radius <= 0) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  const rSq = radius * radius;
  if (lenSq <= 1e-8) {
    const ox = a.x - center.x;
    const oy = a.y - center.y;
    const oz = a.z - center.z;
    return ox * ox + oy * oy + oz * oz <= rSq;
  }
  const t = clamp(
    ((center.x - a.x) * dx + (center.y - a.y) * dy + (center.z - a.z) * dz) / lenSq,
    0,
    1,
  );
  const cx = a.x + dx * t - center.x;
  const cy = a.y + dy * t - center.y;
  const cz = a.z + dz * t - center.z;
  return cx * cx + cy * cy + cz * cz <= rSq;
}

/**
 * Checks whether a shot from `from` to `to` would cross the shell of any active shield bubble.
 * When both shooter and target are inside the same dome, the shot is NOT blocked.
 */
export function isShotBlockedByShieldBubbles(
  from: Vec3Like,
  to: Vec3Like,
  bubbles: ReadonlyArray<ShieldBubbleZone>,
): ShieldBubbleZone | null {
  for (const bubble of bubbles) {
    if (bubble.radius <= 0) continue;
    const innerRadius = Math.max(0.1, bubble.radius - 0.15);
    const fromInside = dist3D(from, bubble.position) < innerRadius;
    const toInside = dist3D(to, bubble.position) < bubble.radius;
    if (fromInside && toInside) {
      continue;
    }
    if (segmentIntersectsSphere(from, to, bubble.position, bubble.radius)) {
      return bubble;
    }
  }
  return null;
}

/**
 * Selects the bot's best close-quarters shotgun or SMG with available ammo for pushing
 * into an enemy's shield bubble dome.
 */
export function selectCloseQuartersWeapon(
  items: (ItemInstance | null)[],
  ammo?: Record<AmmoType, number>,
): { slotIndex: number; item: ItemInstance } | null {
  let bestSlot = -1;
  let bestItem: ItemInstance | null = null;
  let bestScore = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const def = WEAPONS[item.weaponId];
    if (!def || (def.category !== 'shotgun' && def.category !== 'smg')) continue;

    if (def.ammoType !== null && ammo !== undefined) {
      const reserve = ammo[def.ammoType] ?? 0;
      if (item.magAmmo <= 0 && reserve <= 0) continue;
    }

    const base =
      item.weaponId === 'heavy_shotgun'
        ? 120
        : item.weaponId === 'pump_shotgun'
          ? 112
          : item.weaponId === 'tac_shotgun'
            ? 104
            : item.weaponId === 'combat_smg'
              ? 98
              : 92;
    const rarityMult = RARITY_MULTIPLIER[item.rarity] ?? 1.0;
    const score = base * rarityMult + (item.magAmmo > 0 ? 15 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = i;
      bestItem = item;
    }
  }

  return bestSlot >= 0 && bestItem ? { slotIndex: bestSlot, item: bestItem } : null;
}

/**
 * Evaluates whether a bot carrying a `shield_bubble` has recently taken heavy damage
 * and should deploy it defensively at its position.
 */
export function shouldBotDeployShieldBubble(
  bot: Pick<
    BotEntity,
    | 'hp'
    | 'maxHp'
    | 'shield'
    | 'maxShield'
    | 'position'
    | 'inventory'
    | 'state'
    | 'lastDamageTime'
    | 'shieldBubbleCooldown'
    | 'recentDamageTaken'
  >,
  ctx: Pick<BotWorldContext, 'getActiveShieldBubbles'>,
  nowSec: number,
): { slotIndex: number; item: ItemInstance } | null {
  if (
    bot.state === 'bus' ||
    bot.state === 'skydiving' ||
    bot.state === 'gliding' ||
    bot.state === 'eliminated'
  ) {
    return null;
  }
  if ((bot.shieldBubbleCooldown ?? 0) > 0) return null;

  let slotIndex = -1;
  let item: ItemInstance | null = null;
  for (let i = 1; i < bot.inventory.items.length; i++) {
    const it = bot.inventory.items[i];
    if (it && it.weaponId === 'shield_bubble' && it.stackCount > 0) {
      slotIndex = i;
      item = it;
      break;
    }
  }
  if (slotIndex < 1 || !item) return null;

  const activeBubbles = ctx.getActiveShieldBubbles?.() ?? [];
  const alreadyCovered = activeBubbles.some(
    (b) => dist3D(bot.position, b.position) <= Math.max(0.5, b.radius - 0.4),
  );
  if (alreadyCovered) return null;

  const recentlyDamaged =
    bot.lastDamageTime >= 0 && nowSec - bot.lastDamageTime <= 2.5;
  if (!recentlyDamaged) return null;

  const maxHp = bot.maxHp || 100;
  const maxShield = bot.maxShield || 100;
  const heavyBurst = (bot.recentDamageTaken ?? 0) >= 35;
  const lowAfterHit =
    bot.hp <= maxHp * 0.65 ||
    bot.hp + bot.shield <= (maxHp + maxShield) * 0.55 ||
    (bot.shield <= 0 && bot.hp < maxHp * 0.85);

  if (!heavyBurst && !lowAfterHit) return null;
  return { slotIndex, item };
}

/**
 * Detects an oncoming player- or bot-driven vehicle on a collision course with the bot
 * and returns a perpendicular sprint-evade vector.
 */
export function findIncomingVehicleThreat(
  botPos: Vec3Like,
  botId: string,
  vehicles: ReadonlyArray<VehicleEntity>,
): { vehicle: VehicleEntity; evadeDirX: number; evadeDirZ: number; distance: number } | null {
  let closestThreat: {
    vehicle: VehicleEntity;
    evadeDirX: number;
    evadeDirZ: number;
    distance: number;
  } | null = null;
  let bestDist = Infinity;

  for (const v of vehicles) {
    if (v.destroyed || !v.driverId || v.driverId === botId) continue;
    if (Math.abs(botPos.y - v.y) > 4.5) continue;

    const spd = Math.hypot(v.vx, v.vz);
    if (spd < 5.0) continue;

    const dx = botPos.x - v.x;
    const dz = botPos.z - v.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 22 || dist < 0.2 || dist >= bestDist) continue;

    const vxN = v.vx / spd;
    const vzN = v.vz / spd;
    const forwardProj = dx * vxN + dz * vzN;
    if (forwardProj < 0) continue;

    // Signed perpendicular offset along vehicle right normal (-vzN, vxN)
    const perp = dx * -vzN + dz * vxN;
    if (Math.abs(perp) <= 3.8) {
      const side = perp >= 0 ? 1 : -1;
      bestDist = dist;
      closestThreat = {
        vehicle: v,
        evadeDirX: -vzN * side,
        evadeDirZ: vxN * side,
        distance: dist,
      };
    }
  }

  return closestThreat;
}

/**
 * Selects the optimal usable healing item (consumable or `chug_splash`) respecting
 * Fortnite's heal caps (mini shields cap at 50 shield, bandages cap at 75 HP)
 * and mini-before-big shield priority.
 */
export function selectHealingItem(
  items: (ItemInstance | null)[],
  hp: number,
  shield: number,
  maxHp = 100,
  maxShield = 100,
): { slotIndex: number; item: ItemInstance } | null {
  let bestSlot = -1;
  let bestItem: ItemInstance | null = null;
  let bestScore = -1;

  const hpCritical = hp < maxHp * 0.5;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || item.stackCount <= 0) continue;
    const def = WEAPONS[item.weaponId];
    if (!def || !isHealingItem(item.weaponId)) continue;

    if (item.weaponId === 'chug_splash') {
      const canUseSplash = hp < maxHp || shield < maxShield;
      if (!canUseSplash) continue;
      let score = 94;
      if (hpCritical) score = 114;
      else if (hp < maxHp && shield < maxShield) score = 108;
      else if (hp < maxHp) score = 104;
      else if (shield < 50) score = 96; // let mini_shield (105) top up 0..50 first if present
      if (score > bestScore) {
        bestScore = score;
        bestSlot = i;
        bestItem = item;
      }
      continue;
    }

    const target = def.healTarget;
    const cap = def.healCap ?? 100;

    let canUse = false;
    if (target === 'hp') {
      canUse = hp < Math.min(maxHp, cap);
    } else if (target === 'shield') {
      canUse = shield < Math.min(maxShield, cap);
    } else if (target === 'both') {
      canUse = hp < Math.min(maxHp, cap) || shield < Math.min(maxShield, cap);
    }

    if (!canUse) continue;

    let score = 0;
    switch (item.weaponId) {
      case 'slurp_juice':
        score = hpCritical ? 115 : hp < maxHp && shield < maxShield ? 96 : 82;
        break;
      case 'medkit':
        score = hpCritical ? 110 : hp < 70 ? 78 : 55;
        break;
      case 'bandages':
        score = hpCritical ? 88 : hp <= 65 ? 64 : 70;
        break;
      case 'mini_shield':
        // Mini-before-big rule: strongly prioritize minis whenever shield < 50
        score = hpCritical ? 60 : shield < 50 ? 105 : 0;
        break;
      case 'shield_potion':
        score = hpCritical ? 50 : shield < 50 ? 85 : 98;
        break;
      default:
        score = 40;
        break;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSlot = i;
      bestItem = item;
    }
  }

  return bestSlot >= 0 && bestItem ? { slotIndex: bestSlot, item: bestItem } : null;
}

/**
 * Determines whether a bot should reactively build defensive 1x1 box + ramp cover.
 */
export function shouldBotBuildDefense(
  bot: Pick<
    BotEntity,
    | 'hp'
    | 'shield'
    | 'personality'
    | 'inventory'
    | 'buildCooldown'
    | 'lastDamageTime'
    | 'state'
  > & { maxHp?: number; reactionTimer?: number },
  difficulty: Difficulty,
  nowSec: number,
  threatDistance = 30,
  roll?: number,
  gameMode: GameModeId = 'solo',
): boolean {
  if (gameMode === 'zero_build') {
    return false;
  }
  if (
    bot.state === 'bus' ||
    bot.state === 'skydiving' ||
    bot.state === 'gliding' ||
    bot.state === 'eliminated'
  ) {
    return false;
  }
  if (bot.buildCooldown > 0) return false;
  if (getTotalMaterials(bot) < BUILD_COST) return false;

  const profile = DIFFICULTY_PROFILES[difficulty];
  const hitWindow =
    difficulty === 'sweaty' ? 3.0 : difficulty === 'standard' ? 2.2 : 1.5;
  const recentlyDamaged =
    bot.lastDamageTime >= 0 && nowSec - bot.lastDamageTime <= hitWindow;
  const effectiveHp = bot.hp + bot.shield;
  const scale = (bot.maxHp ?? 100) / 100;
  const lowHpThreat = effectiveHp < 75 * scale && threatDistance < 55;
  const underAmbush =
    difficulty !== 'casual' &&
    (bot.reactionTimer ?? 0) > 0.05 &&
    threatDistance < 32;
  const builderEngaged =
    bot.personality === 'builder' &&
    bot.state === 'combat' &&
    threatDistance < 45;

  if (!recentlyDamaged && !lowHpThreat && !underAmbush && !builderEngaged) {
    return false;
  }

  if (roll !== undefined) {
    const bonus = bot.personality === 'builder' ? 0.15 : 0;
    return roll < clamp(profile.buildChance + bonus, 0, 1);
  }

  if (difficulty === 'casual') {
    return effectiveHp < 70 * scale || bot.personality === 'builder';
  }
  return true;
}

function tryBuildCover(
  bot: BotEntity,
  ctx: BotWorldContext,
  difficulty: Difficulty,
  threatPos: Vec3Like,
  elapsed: number,
): boolean {
  if (!pickAvailableMaterial(bot)) return false;

  const profile = DIFFICULTY_PROFILES[difficulty];
  const cell = worldToGrid(bot.position.x, bot.position.y + 0.3, bot.position.z);
  const dx = threatPos.x - bot.position.x;
  const dz = threatPos.z - bot.position.z;

  let face: 0 | 1 | 2 | 3;
  if (Math.abs(dz) >= Math.abs(dx)) {
    face = dz < 0 ? 0 : 2;
  } else {
    face = dx >= 0 ? 1 : 3;
  }

  const leftFace = ((face + 3) % 4) as 0 | 1 | 2 | 3;
  const rightFace = ((face + 1) % 4) as 0 | 1 | 2 | 3;
  const backFace = ((face + 2) % 4) as 0 | 1 | 2 | 3;

  let builtAny = false;

  const placeWallFace = (f: 0 | 1 | 2 | 3): boolean => {
    const mat = pickAvailableMaterial(bot);
    if (!mat) return false;
    const wall = canonicalizeWall(cell.gx, cell.gy, cell.gz, f);
    const placed = ctx.placeBuildPiece(
      bot.id,
      'wall',
      mat,
      wall.gx,
      wall.gy,
      wall.gz,
      wall.dir,
      f,
    );
    if (placed) {
      bot.inventory.materials[mat] = Math.max(
        0,
        bot.inventory.materials[mat] - BUILD_COST,
      );
      builtAny = true;
      return true;
    }
    return false;
  };

  const placeRamp = (): boolean => {
    const mat = pickAvailableMaterial(bot);
    if (!mat) return false;
    const placed = ctx.placeBuildPiece(
      bot.id,
      'ramp',
      mat,
      cell.gx,
      cell.gy,
      cell.gz,
      'N',
      face,
    );
    if (placed) {
      bot.inventory.materials[mat] = Math.max(
        0,
        bot.inventory.materials[mat] - BUILD_COST,
      );
      builtAny = true;
      return true;
    }
    return false;
  };

  const wantsMultiWallBox =
    difficulty !== 'casual' ||
    bot.personality === 'builder' ||
    bot.hp + bot.shield < 75 * (bot.maxHp / 100);

  // 1. Primary wall facing the threat
  placeWallFace(face);

  // 2. First perpendicular flank wall for 1x1 box protection
  if (wantsMultiWallBox) {
    placeWallFace(leftFace);
  }

  // 3. Ramp inside 1x1 for highground crouch/jump peeking
  if (
    difficulty !== 'casual' ||
    bot.personality === 'builder' ||
    nextBotRand(bot) < profile.rampOnBuildChance
  ) {
    placeRamp();
  }

  // 4. Second perpendicular wall + rear wall to finish defensive 1x1 box
  if (wantsMultiWallBox) {
    placeWallFace(rightFace);
    if (
      difficulty === 'sweaty' ||
      bot.personality === 'builder' ||
      bot.hp + bot.shield < 85 * (bot.maxHp / 100)
    ) {
      placeWallFace(backFace);
    }
  }

  if (builtAny) {
    bot.buildAnimTimer = 0.38;
    bot.isBuilding = true;
    bot.lastBuildTime = elapsed;
    bot.buildCooldown =
      profile.buildCooldownSec * (bot.personality === 'builder' ? 0.7 : 1.0);
    ctx.eventBus.emit('audio:noise', {
      position: { ...bot.position },
      kind: 'build',
      sourceId: bot.id,
      radius: 38,
    });
  } else {
    // Back off slightly if cell was already full so we don't spam failed builds
    bot.buildCooldown = 0.5;
  }

  return builtAny;
}

function getWeaponOverallValue(item: ItemInstance): number {
  const def = WEAPONS[item.weaponId];
  if (!def || isHealingItem(item.weaponId) || def.isThrowable || item.weaponId === 'pickaxe') {
    return 0;
  }
  const rarityIdx = RARITY_ORDER.indexOf(item.rarity);
  const baseByType: Record<string, number> = {
    mythic_blade_rifle: 62,
    heavy_shotgun: 56,
    rocket_launcher: 54,
    tactical_dmr: 53,
    boom_bow: 53,
    sniper: 52,
    pump_shotgun: 50,
    ar: 48,
    combat_smg: 47,
    burst_ar: 45,
    tac_shotgun: 44,
    smg: 40,
    pistol: 28,
    kinetic_blade: 26,
  };
  return (baseByType[item.weaponId] ?? 30) + rarityIdx * 14;
}

function countWeapons(bot: BotEntity): number {
  let count = 0;
  for (let i = 1; i < bot.inventory.items.length; i++) {
    const it = bot.inventory.items[i];
    if (it && !isHealingItem(it.weaponId) && !WEAPONS[it.weaponId].isThrowable) {
      count++;
    }
  }
  return count;
}

function countHealingSlots(bot: BotEntity): number {
  let count = 0;
  for (let i = 1; i < bot.inventory.items.length; i++) {
    const it = bot.inventory.items[i];
    if (it && isHealingItem(it.weaponId)) count++;
  }
  return count;
}

function canUpgradeOrTakeItem(bot: BotEntity, candidate: ItemInstance): number {
  const def = WEAPONS[candidate.weaponId];
  if (!def || candidate.weaponId === 'pickaxe' || def.isGrappler) return -1;

  // Stack existing consumables and throwables
  if (def.isConsumable || def.isThrowable) {
    for (let i = 1; i < bot.inventory.items.length; i++) {
      const slot = bot.inventory.items[i];
      if (slot && slot.weaponId === candidate.weaponId && slot.stackCount < def.maxStack) {
        return i;
      }
    }
  }

  // Upgrade existing same-weapon slot in-place; skip equal/worse duplicates
  if (!def.isConsumable && !def.isThrowable) {
    for (let i = 1; i < bot.inventory.items.length; i++) {
      const slot = bot.inventory.items[i];
      if (slot && slot.weaponId === candidate.weaponId) {
        const candRarity = RARITY_ORDER.indexOf(candidate.rarity);
        const slotRarity = RARITY_ORDER.indexOf(slot.rarity);
        return candRarity > slotRarity ? i : -1;
      }
    }
  }

  // Empty slot 1..5
  for (let i = 1; i < bot.inventory.items.length; i++) {
    if (!bot.inventory.items[i]) {
      return i;
    }
  }

  // Replace existing same-weapon with higher rarity or strictly better weapon
  if (!def.isConsumable && !def.isThrowable) {
    const candValue = getWeaponOverallValue(candidate);
    let worstSlot = -1;
    let worstDiff = 0;
    for (let i = 1; i < bot.inventory.items.length; i++) {
      const slot = bot.inventory.items[i];
      if (!slot) continue;
      if (isHealingItem(slot.weaponId) || WEAPONS[slot.weaponId].isThrowable) continue;
      const slotVal = getWeaponOverallValue(slot);
      const sameWeapon = slot.weaponId === candidate.weaponId;
      const diff = candValue - slotVal;
      if ((sameWeapon && diff > 0) || (!sameWeapon && diff >= 12)) {
        if (diff > worstDiff) {
          worstDiff = diff;
          worstSlot = i;
        }
      }
    }
    return worstSlot;
  } else if (isHealingItem(candidate.weaponId) && countHealingSlots(bot) === 0) {
    // Replace weakest weapon if we have zero heals
    let worstSlot = -1;
    let lowestVal = Infinity;
    for (let i = 1; i < bot.inventory.items.length; i++) {
      const slot = bot.inventory.items[i];
      if (!slot || isHealingItem(slot.weaponId) || WEAPONS[slot.weaponId].isThrowable) {
        continue;
      }
      const val = getWeaponOverallValue(slot);
      if (val < lowestVal) {
        lowestVal = val;
        worstSlot = i;
      }
    }
    return worstSlot;
  }

  return -1;
}

function applyPickedLoot(
  bot: BotEntity,
  item?: ItemInstance,
  ammo?: { type: AmmoType; amount: number },
  materials?: { type: MaterialType; amount: number },
): void {
  if (ammo) {
    bot.inventory.ammo[ammo.type] = (bot.inventory.ammo[ammo.type] ?? 0) + ammo.amount;
  }
  if (materials) {
    bot.inventory.materials[materials.type] = Math.min(
      MAX_MATS,
      (bot.inventory.materials[materials.type] ?? 0) + materials.amount,
    );
  }
  if (item) {
    const slotIdx = canUpgradeOrTakeItem(bot, item);
    if (slotIdx >= 1) {
      const existing = bot.inventory.items[slotIdx];
      const def = WEAPONS[item.weaponId];
      if (
        existing &&
        (def.isConsumable || def.isThrowable) &&
        existing.weaponId === item.weaponId
      ) {
        existing.stackCount = Math.min(def.maxStack, existing.stackCount + item.stackCount);
      } else {
        bot.inventory.items[slotIdx] = { ...item };
        if (def.ammoType) {
          // Ensure a small reserve if weapon had only magAmmo so bots stay active in prolonged fights
          bot.inventory.ammo[def.ammoType] = Math.max(
            bot.inventory.ammo[def.ammoType] ?? 0,
            Math.round(def.magSize * 0.5),
          );
        }
      }
    }
  }
}

function isInStorm(bot: BotEntity, ctx: BotWorldContext, buffer = 0): boolean {
  const s = ctx.storm;
  const dist = dist2D(bot.position.x, bot.position.z, s.currentCenterX, s.currentCenterZ);
  return dist > Math.max(0, s.currentRadius - buffer);
}

function pickSafeDestination(bot: BotEntity, ctx: BotWorldContext): Vec3Like {
  const s = ctx.storm;
  const targetX = s.nextRadius > 0 ? s.nextCenterX : s.currentCenterX;
  const targetZ = s.nextRadius > 0 ? s.nextCenterZ : s.currentCenterZ;
  const targetR = s.nextRadius > 0 ? s.nextRadius : s.currentRadius;
  const spreadR = Math.max(4, targetR * 0.6);
  let x = clamp(
    targetX + Math.cos(bot.patrolAngle) * spreadR,
    -WORLD_HALF + 25,
    WORLD_HALF - 25,
  );
  let z = clamp(
    targetZ + Math.sin(bot.patrolAngle) * spreadR,
    -WORLD_HALF + 25,
    WORLD_HALF - 25,
  );
  if (isInVolcanoLavaHazard(x, z, VOLCANO_LAVA_SAFE_RADIUS + 2)) {
    const safe = clampOutsideVolcanoLava(x, z, VOLCANO_LAVA_SAFE_RADIUS + 2.5);
    x = safe.x;
    z = safe.z;
  }
  if (!ctx.terrain.isWater(x, z)) {
    return { x, y: ctx.terrain.getHeightAt(x, z), z };
  }
  // Fallback toward safe center or nearest dry POI
  const pois: POIDef[] = ctx.terrain.getPOIs();
  const list = pois.length > 0 ? pois : POIS;
  const clampedCenter = clampOutsideVolcanoLava(
    targetX,
    targetZ,
    VOLCANO_LAVA_SAFE_RADIUS + 2,
  );
  let best = {
    x: clampedCenter.x,
    y: ctx.terrain.getHeightAt(clampedCenter.x, clampedCenter.z),
    z: clampedCenter.z,
  };
  if (ctx.terrain.isWater(best.x, best.z)) {
    let bestD = Infinity;
    for (const poi of list) {
      if (ctx.terrain.isWater(poi.x, poi.z)) continue;
      const d = dist2D(poi.x, poi.z, targetX, targetZ);
      if (d < bestD) {
        bestD = d;
        const safePoi = clampOutsideVolcanoLava(poi.x, poi.z, VOLCANO_LAVA_SAFE_RADIUS + 2);
        best = { x: safePoi.x, y: poi.plateauY, z: safePoi.z };
      }
    }
  }
  return best;
}

/**
 * Picks an active Launch Pad / Geyser during a long safe-zone rotation if one is
 * nearby and helps carry the bot toward `destination`.
 */
export function selectLaunchPadForRotation(
  bot: Pick<BotEntity, 'position' | 'launchPadCooldown' | 'isBoss'>,
  launchPads: LaunchPadEntity[],
  destination: Vec3Like,
  preferNearbyStormPad = false,
): LaunchPadEntity | null {
  if ((bot.launchPadCooldown ?? 0) > 0 || launchPads.length === 0) return null;

  const distToDest = dist2D(
    bot.position.x,
    bot.position.z,
    destination.x,
    destination.z,
  );
  const minRotDist = preferNearbyStormPad ? 18 : 45;
  if (distToDest < minRotDist) return null;

  let bestPad: LaunchPadEntity | null = null;
  let bestScore = Infinity;

  for (const pad of launchPads) {
    if (Math.abs(pad.y - bot.position.y) > 12) continue;
    if (isInVolcanoLavaHazard(pad.x, pad.z)) continue;

    const dToPad = dist2D(bot.position.x, bot.position.z, pad.x, pad.z);
    if (dToPad > 78) continue;

    const dPadToDest = dist2D(pad.x, pad.z, destination.x, destination.z);
    const helpsRotation = preferNearbyStormPad
      ? (dToPad <= 28 && dPadToDest < distToDest + 16) ||
        (dPadToDest < distToDest + 12 &&
          dToPad + dPadToDest * 0.45 < distToDest + 15)
      : dPadToDest < distToDest + 12 &&
        (dToPad <= 28 || dToPad + dPadToDest * 0.45 < distToDest + 15);
    if (!helpsRotation) continue;

    // Prioritize nearby <= 28m launch pads strongly during storm/edge rotations
    const proximityBonus = preferNearbyStormPad && dToPad <= 28 ? -25 : 0;
    const score = dToPad + dPadToDest * 0.35 + proximityBonus;
    if (score < bestScore) {
      bestScore = score;
      bestPad = pad;
    }
  }

  return bestPad;
}

function tryTriggerLaunchPad(
  bot: BotEntity,
  ctx: BotWorldContext,
  safeDest: Vec3Like,
): boolean {
  if ((bot.launchPadCooldown ?? 0) > 0 || !ctx.getLaunchPads) return false;
  const pads = ctx.getLaunchPads();
  if (!pads || pads.length === 0) return false;

  for (const pad of pads) {
    const d2 = dist2D(bot.position.x, bot.position.z, pad.x, pad.z);
    const dy = Math.abs(bot.position.y - pad.y);
    if (d2 <= Math.max(pad.radius, 2.2) && dy <= 2.5) {
      const dx = safeDest.x - bot.position.x;
      const dz = safeDest.z - bot.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;

      bot.launchPadCooldown = 3.0;
      bot.launchPadTargetId = null;
      bot.isCrouching = false;
      bot.isSprinting = false;
      bot.grounded = false;
      bot.dropTarget = { ...safeDest };
      bot.moveTarget = { ...safeDest };
      bot.velocity.x = nx * Math.max(GLIDE_HORIZONTAL_SPEED, pad.boostForward);
      bot.velocity.y = pad.boostVy;
      bot.velocity.z = nz * Math.max(GLIDE_HORIZONTAL_SPEED, pad.boostForward);
      bot.yaw = Math.atan2(nx, nz);
      bot.state = 'gliding';
      bot.animState = 'glide';
      bot.gliderOpen = true;
      bot.gliderFactor = 0.25;
      bot.stateTimer = 0;

      ctx.eventBus.emit('sound:play', {
        id: 'launch_pad',
        position: { x: pad.x, y: pad.y, z: pad.z },
        spatial: true,
      });
      ctx.eventBus.emit('vfx:build_pop', {
        position: { x: pad.x, y: pad.y + 0.4, z: pad.z },
        material: 'metal',
        pieceType: 'floor',
      });
      return true;
    }
  }
  return false;
}

function applyMovementStep(
  bot: BotEntity,
  ctx: BotWorldContext,
  desiredDirX: number,
  desiredDirZ: number,
  targetSpeed: number,
  wantsJump: boolean,
  dt: number,
  isFarLOD: boolean,
): void {
  const desiredVx = desiredDirX * targetSpeed;
  const desiredVz = desiredDirZ * targetSpeed;

  bot.velocity.x = damp(bot.velocity.x, desiredVx, 11, dt);
  bot.velocity.z = damp(bot.velocity.z, desiredVz, 11, dt);

  if (wantsJump && bot.grounded && bot.jumpCooldown <= 0) {
    bot.velocity.y = JUMP_VELOCITY;
    bot.grounded = false;
    bot.jumpCooldown = 0.9;
  }

  if (!bot.grounded) {
    bot.velocity.y -= GRAVITY * dt;
  } else {
    bot.velocity.y = Math.max(bot.velocity.y, -2.0);
  }

  const effectiveHeight = bot.isCrouching ? 1.25 : bot.height;

  if (isFarLOD) {
    // Fast Far-LOD terrain integration (>180m from player)
    const nx = clamp(bot.position.x + bot.velocity.x * dt, -WORLD_HALF + 5, WORLD_HALF - 5);
    const nz = clamp(bot.position.z + bot.velocity.z * dt, -WORLD_HALF + 5, WORLD_HALF - 5);
    let ny = bot.position.y + bot.velocity.y * dt;
    const groundY = ctx.terrain.getHeightAt(nx, nz);
    if (ny <= groundY + 0.05) {
      ny = groundY;
      bot.velocity.y = 0;
      bot.grounded = true;
    } else {
      bot.grounded = false;
    }
    bot.position.x = nx;
    bot.position.y = ny;
    bot.position.z = nz;
  } else {
    const res = ctx.resolveMovement(
      bot.position,
      bot.velocity,
      bot.radius,
      effectiveHeight,
      dt,
    );
    bot.position.x = clamp(res.position.x, -WORLD_HALF + 4, WORLD_HALF - 4);
    bot.position.y = res.position.y;
    bot.position.z = clamp(res.position.z, -WORLD_HALF + 4, WORLD_HALF - 4);
    bot.velocity.x = res.velocity.x;
    bot.velocity.y = res.velocity.y;
    bot.velocity.z = res.velocity.z;
    bot.grounded = res.grounded;
  }

  // Keep afloat in water
  if (ctx.terrain.isWater(bot.position.x, bot.position.z) && bot.position.y < WATER_LEVEL - 0.3) {
    bot.position.y = WATER_LEVEL - 0.3;
    bot.velocity.y = Math.max(0, bot.velocity.y);
    bot.grounded = true;
  }

  bot.moveSpeed = Math.hypot(bot.velocity.x, bot.velocity.z);
}

function updateAnimState(bot: BotEntity): void {
  if (bot.state === 'eliminated' || !bot.alive) {
    bot.animState = 'idle';
    return;
  }
  if (bot.state === 'skydiving') {
    bot.animState = 'skydive';
    return;
  }
  if (bot.state === 'gliding') {
    bot.animState = 'glide';
    return;
  }
  if (bot.state === 'knocked' || bot.isKnocked) {
    bot.animState = 'knocked';
    return;
  }
  if (bot.state === 'reviving' || bot.isReviving) {
    bot.animState = 'reviving';
    return;
  }
  if (bot.state === 'healing' && bot.healTimer > 0) {
    bot.animState = 'heal';
    return;
  }
  if (bot.buildAnimTimer > 0) {
    bot.animState = 'build';
    return;
  }
  if (bot.reloadTimer > 0) {
    bot.animState = 'reload';
    return;
  }
  if (bot.harvestSwingTimer > 0) {
    bot.animState = 'harvest';
    return;
  }
  if (!bot.grounded) {
    bot.animState = bot.velocity.y > 0.5 ? 'jump' : 'fall';
    return;
  }
  if (bot.isCrouching) {
    bot.animState = bot.moveSpeed > 0.4 ? 'crouch_walk' : 'crouch_idle';
    return;
  }
  if (bot.isSprinting && bot.moveSpeed > 5.6) {
    bot.animState = 'sprint';
  } else if (bot.moveSpeed > 3.2) {
    bot.animState = 'run';
  } else if (bot.moveSpeed > 0.35) {
    bot.animState = 'walk';
  } else {
    bot.animState = 'idle';
  }
}

function getTargetMedallionCount(
  t: BotCombatTarget,
  ctx: BotWorldContext,
  medallionHolderIds?: ReadonlySet<string>,
): number {
  let count = Math.max(t.medallionCount ?? 0, t.medallions?.length ?? 0);
  if (
    count === 0 &&
    (t.isPlayer || t.id === 'player') &&
    (ctx.playerMedallionCount ?? 0) > 0
  ) {
    count = ctx.playerMedallionCount ?? 0;
  }
  if (count === 0 && medallionHolderIds?.has(t.id)) {
    count = 1;
  }
  if (count === 0 && ctx.getMedallionHolders) {
    const holder = ctx
      .getMedallionHolders()
      .find((h) => h.id === t.id || h.botId === t.id);
    if (holder) {
      count = Math.max(1, holder.medallionCount ?? holder.count ?? holder.medallions.length);
    }
  }
  return count;
}

function selectEnemyTarget(
  bot: BotEntity,
  ctx: BotWorldContext,
  profile: DifficultyProfile,
  elapsed: number,
  isFarLOD: boolean,
  squadmates?: ReadonlyArray<BotEntity>,
  medallionHolderIds?: ReadonlySet<string>,
): { target: BotCombatTarget; hasLOS: boolean; distance: number } | null {
  const targets = ctx.getCombatTargets();
  const eye = getBotEyePos(bot);
  const losLimit = isFarLOD ? 55 : profile.visionRange;
  const isPlayerSide = Boolean(
    bot.isAlly || bot.isDuoPartner || bot.squadId === 'player_squad',
  );

  let bestTarget: BotCombatTarget | null = null;
  let bestHasLOS = false;
  let bestScore = -Infinity;
  let bestDist = Infinity;

  for (const t of targets) {
    if (!t.alive || t.id === bot.id) continue;
    if (isFriendlyTarget(bot, t, squadmates)) continue;

    const d = dist3D(eye, t.eyePos);
    const wasAttacker =
      bot.lastDamagerId === t.id &&
      bot.lastDamageTime >= 0 &&
      elapsed - bot.lastDamageTime < 5.0;
    const wasCurrent = bot.targetEnemyId === t.id;
    const medCount = getTargetMedallionCount(t, ctx, medallionHolderIds);

    if (isPlayerSide) {
      if (d > ALLY_COMBAT_RANGE) continue;
    } else {
      const effectiveRange =
        medCount > 0 ? profile.visionRange * 1.25 : profile.visionRange;
      if (d > effectiveRange && !wasAttacker) {
        continue;
      }
    }

    let los = false;
    const effectiveLosLimit = isPlayerSide
      ? ALLY_COMBAT_RANGE
      : medCount > 0 && !isFarLOD
        ? profile.visionRange * 1.25
        : losLimit;
    if (d <= effectiveLosLimit) {
      los = ctx.hasLineOfSight(eye, t.eyePos);
    }

    if (!los && !wasAttacker && !wasCurrent) {
      continue;
    }

    const medBoost = medCount > 0 ? 65 + Math.min(2, medCount - 1) * 25 : 0;
    const knockedPenalty = t.isKnocked ? (isPlayerSide ? -120 : -85) : 0;

    let score: number;
    if (isPlayerSide) {
      score =
        (los ? 1000 : 400) -
        d +
        (wasCurrent ? 1.5 : 0) +
        (medCount > 0 ? 35 : 0) +
        knockedPenalty;
    } else {
      score = 200 - d + medBoost + knockedPenalty;
      if (los) score += 120;
      if (wasAttacker) score += 90;
      if (wasCurrent) score += 30;
      if (t.hp + t.shield < 60 && !t.isKnocked) score += 25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTarget = t;
      bestHasLOS = los;
      bestDist = d;
    }
  }

  return bestTarget
    ? { target: bestTarget, hasLOS: bestHasLOS, distance: bestDist }
    : null;
}

function handleReloading(bot: BotEntity, dt: number): void {
  if (bot.reloadTimer <= 0) return;
  bot.reloadTimer -= dt;
  if (bot.reloadTimer <= 0) {
    bot.reloadTimer = 0;
    const item = bot.inventory.items[bot.reloadSlot];
    if (item) {
      const def = WEAPONS[item.weaponId];
      if (def.ammoType) {
        const reserve = bot.inventory.ammo[def.ammoType] ?? 0;
        const needed = Math.max(0, def.magSize - item.magAmmo);
        const take = Math.min(reserve, needed);
        item.magAmmo += take;
        bot.inventory.ammo[def.ammoType] = reserve - take;
      }
    }
  }
}

function computeBallisticAimDir(
  from: Vec3Like,
  to: Vec3Like,
  speed: number,
  gravity: number,
): Vec3Like {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dz) || 1;
  const ratio = clamp((gravity * horiz) / Math.max(1, speed * speed), -0.95, 0.95);
  const arcPitch = 0.5 * Math.asin(ratio);
  const elevPitch = Math.atan2(dy, horiz);
  const pitch = clamp(arcPitch + elevPitch * 0.65, -0.35, Math.PI * 0.34);
  const cosP = Math.cos(pitch);
  return {
    x: (dx / horiz) * cosP,
    y: Math.sin(pitch),
    z: (dz / horiz) * cosP,
  };
}

function handleFireAndBurst(
  bot: BotEntity,
  ctx: BotWorldContext,
  difficulty: Difficulty,
  target: BotCombatTarget,
  distance: number,
  hasLOS: boolean,
  dt: number,
  squadmates?: ReadonlyArray<BotEntity>,
): void {
  if (isFriendlyTarget(bot, target, squadmates)) {
    return;
  }
  const activeItem = bot.inventory.items[bot.inventory.activeSlot];
  if (
    !activeItem ||
    isHealingItem(activeItem.weaponId) ||
    activeItem.weaponId === 'shield_bubble' ||
    activeItem.weaponId === 'grappler'
  ) {
    return;
  }
  const def = WEAPONS[activeItem.weaponId];
  const profile = DIFFICULTY_PROFILES[difficulty];

  const eye = getBotEyePos(bot);
  // Aim at chest, blended slightly toward head based on difficulty
  let aimTargetX = target.position.x;
  let aimTargetY = target.eyePos.y - 0.35 * (1 - profile.headshotAimBias);
  let aimTargetZ = target.position.z;

  if (def.isProjectile) {
    const vehicle = ctx.getVehicles?.().find(
      (v) => !v.destroyed && v.driverId === target.id,
    );
    const targetVel = vehicle
      ? { x: vehicle.vx, y: vehicle.vy, z: vehicle.vz }
      : target.velocity;
    if (targetVel) {
      const projSpd = Math.max(12, def.projectileSpeed || 60);
      const leadSec = clamp(distance / projSpd, 0, 0.75);
      aimTargetX += targetVel.x * leadSec;
      aimTargetY += targetVel.y * leadSec * 0.35;
      aimTargetZ += targetVel.z * leadSec;
    }
    if (def.isBow && def.projectileSpeed > 0 && def.projectileGravity > 0) {
      const flightT = distance / def.projectileSpeed;
      aimTargetY += 0.5 * def.projectileGravity * flightT * flightT;
    }
  }

  const dx = aimTargetX - eye.x;
  const dy = aimTargetY - eye.y;
  const dz = aimTargetZ - eye.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const aimDir: Vec3Like = { x: dx / len, y: dy / len, z: dz / len };

  const targetYaw = Math.atan2(dx, dz);
  const horiz = Math.hypot(dx, dz) || 1;
  const targetPitch = Math.atan2(dy, horiz);
  bot.yaw = lerpAngle(bot.yaw, targetYaw, clamp(profile.turnSpeedRadPerSec * dt, 0, 1));
  bot.pitch = clamp(targetPitch, -1.2, 1.2);

  // Pickaxe / Kinetic Blade melee fallback at point-blank range
  if (activeItem.weaponId === 'pickaxe' || activeItem.weaponId === 'kinetic_blade') {
    if (distance <= def.range + 0.3 && bot.fireCooldown <= 0 && hasLOS) {
      ctx.fireWeapon(bot, activeItem, eye, aimDir, 0.05);
      bot.fireCooldown = 1 / def.fireRate;
      bot.harvestSwingTimer = 0.35;
      bot.isFiring = true;
    }
    return;
  }

  // Offensive throwables (`frag_grenade`, `shockwave_grenade`)
  if (def.isThrowable) {
    if (
      activeItem.stackCount > 0 &&
      bot.reactionTimer <= 0 &&
      bot.fireCooldown <= 0 &&
      bot.reloadTimer <= 0
    ) {
      const yawDiff = Math.abs(normalizeAngle(targetYaw - bot.yaw));
      if (yawDiff <= 0.65) {
        const throwDir = computeBallisticAimDir(
          eye,
          target.position,
          def.projectileSpeed || 26,
          def.projectileGravity || 20,
        );
        const res = ctx.fireWeapon(bot, activeItem, eye, throwDir, 0.02);
        if (!res || res.fired !== false) {
          activeItem.stackCount = Math.max(0, activeItem.stackCount - 1);
          if (activeItem.stackCount <= 0) {
            bot.inventory.items[bot.inventory.activeSlot] = null;
          }
          bot.isFiring = true;
          bot.recoilKick = 0.8;
          bot.fireCooldown = 1 / Math.max(0.2, def.fireRate * profile.fireRateScale);
          bot.throwCooldown = 3.5;
        }
      }
    }
    return;
  }

  // Handle magazine empty -> start reload
  if (activeItem.magAmmo <= 0) {
    if (bot.reloadTimer <= 0 && def.ammoType && (bot.inventory.ammo[def.ammoType] ?? 0) > 0) {
      bot.reloadSlot = bot.inventory.activeSlot;
      bot.reloadTimer = def.reloadTime;
      bot.burstQueue = 0;
    }
    return;
  }

  if (bot.reloadTimer > 0) return;

  // Continue burst fire queue
  if (bot.burstQueue > 0) {
    bot.burstTimer -= dt;
    if (bot.burstTimer <= 0) {
      const spread = computeBotSpread(
        activeItem.weaponId,
        difficulty,
        bot.moveSpeed > 0.5,
        bot.isCrouching,
      );
      const res = ctx.fireWeapon(bot, activeItem, eye, aimDir, spread);
      if (!res || res.fired !== false) {
        activeItem.magAmmo = Math.max(0, activeItem.magAmmo - 1);
        bot.isFiring = true;
        bot.recoilKick = 1.0;
      }
      bot.burstQueue -= 1;
      bot.burstTimer = def.burstInterval ?? 0.075;
    }
    return;
  }

  if (!hasLOS || bot.reactionTimer > 0 || bot.fireCooldown > 0) return;
  if (distance > def.range * 1.05) return;

  // Don't fire until roughly facing target
  const yawDiff = Math.abs(normalizeAngle(targetYaw - bot.yaw));
  if (yawDiff > 0.45) return;

  bot.isAiming = distance > 14;
  const spread = computeBotSpread(
    activeItem.weaponId,
    difficulty,
    bot.moveSpeed > 0.5,
    bot.isCrouching,
  );
  const res = ctx.fireWeapon(bot, activeItem, eye, aimDir, spread);
  if (!res || res.fired !== false) {
    activeItem.magAmmo = Math.max(0, activeItem.magAmmo - 1);
    bot.isFiring = true;
    bot.recoilKick = 1.0;
    bot.fireCooldown = 1 / Math.max(0.2, def.fireRate * profile.fireRateScale);
    if (def.burstCount && def.burstCount > 1 && activeItem.magAmmo > 0) {
      bot.burstQueue = Math.min(def.burstCount - 1, activeItem.magAmmo);
      bot.burstTimer = def.burstInterval ?? 0.075;
    }
  }
}

interface MoveIntent {
  dirX: number;
  dirZ: number;
  speed: number;
  wantsJump: boolean;
  launchedGliding?: boolean;
}

function emptyMoveIntent(): MoveIntent {
  return { dirX: 0, dirZ: 0, speed: 0, wantsJump: false };
}

function moveTowardPoint(
  bot: BotEntity,
  tx: number,
  tz: number,
  safeDt: number,
  sprintAboveDist = 10,
): MoveIntent {
  const dx = tx - bot.position.x;
  const dz = tz - bot.position.z;
  const d = Math.hypot(dx, dz);
  if (d <= 0.01) return emptyMoveIntent();
  const dirX = dx / d;
  const dirZ = dz / d;
  bot.yaw = lerpAngle(bot.yaw, Math.atan2(dirX, dirZ), clamp(8 * safeDt, 0, 1));
  bot.isSprinting = d > sprintAboveDist;
  return {
    dirX,
    dirZ,
    speed: bot.isSprinting ? SPRINT_SPEED : RUN_SPEED,
    wantsJump: false,
  };
}

function stepBusPhase(
  bot: BotEntity,
  busPos: Vec3Like,
  elapsed: number,
): void {
  bot.position.x = busPos.x;
  bot.position.y = busPos.y;
  bot.position.z = busPos.z;
  bot.velocity.x = 0;
  bot.velocity.y = 0;
  bot.velocity.z = 0;
  bot.gliderOpen = false;
  bot.gliderFactor = 0;

  const nearDropPoi =
    elapsed >= bot.dropJumpTime * 0.55 &&
    dist2D(busPos.x, busPos.z, bot.dropTarget.x, bot.dropTarget.z) < 80;

  if (elapsed >= bot.dropJumpTime || nearDropPoi) {
    bot.state = 'skydiving';
    bot.animState = 'skydive';
    bot.position.x = busPos.x + (nextBotRand(bot) - 0.5) * 3;
    bot.position.y = busPos.y - 2.0;
    bot.position.z = busPos.z + (nextBotRand(bot) - 0.5) * 3;
    bot.grounded = false;
    bot.stateTimer = 0;
  }
}

function stepSkydivingPhase(
  bot: BotEntity,
  ctx: BotWorldContext,
  safeDt: number,
): void {
  if (
    isInVolcanoLavaHazard(
      bot.dropTarget.x,
      bot.dropTarget.z,
      VOLCANO_LAVA_SAFE_RADIUS + 1.5,
    )
  ) {
    const safe = clampOutsideVolcanoLava(
      bot.dropTarget.x,
      bot.dropTarget.z,
      VOLCANO_LAVA_SAFE_RADIUS + 2,
    );
    bot.dropTarget = {
      x: safe.x,
      y: ctx.terrain.getHeightAt(safe.x, safe.z),
      z: safe.z,
    };
  }

  const dx = bot.dropTarget.x - bot.position.x;
  const dz = bot.dropTarget.z - bot.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 1) {
    const nx = dx / d;
    const nz = dz / d;
    bot.velocity.x = nx * SKYDIVE_HORIZONTAL_SPEED;
    bot.velocity.z = nz * SKYDIVE_HORIZONTAL_SPEED;
    bot.yaw = lerpAngle(bot.yaw, Math.atan2(nx, nz), clamp(6 * safeDt, 0, 1));
  } else {
    bot.velocity.x = 0;
    bot.velocity.z = 0;
  }
  bot.velocity.y = -SKYDIVE_DESCENT_SPEED;

  bot.position.x = clamp(
    bot.position.x + bot.velocity.x * safeDt,
    -WORLD_HALF + 8,
    WORLD_HALF - 8,
  );
  bot.position.y += bot.velocity.y * safeDt;
  bot.position.z = clamp(
    bot.position.z + bot.velocity.z * safeDt,
    -WORLD_HALF + 8,
    WORLD_HALF - 8,
  );
  bot.moveSpeed = Math.hypot(bot.velocity.x, bot.velocity.z);
  bot.animState = 'skydive';

  const groundY = ctx.terrain.getHeightAt(bot.position.x, bot.position.z);
  if (bot.position.y - groundY <= GLIDER_FORCE_HEIGHT) {
    bot.state = 'gliding';
    bot.animState = 'glide';
    bot.gliderOpen = true;
    bot.gliderFactor = 0.25;
    bot.stateTimer = 0;
  }
}

function stepGlidingPhase(
  bot: BotEntity,
  ctx: BotWorldContext,
  safeDt: number,
  isFarLOD: boolean,
): void {
  bot.gliderOpen = true;
  bot.gliderFactor = clamp(bot.gliderFactor + safeDt * 3.5, 0, 1);

  if (ctx.terrain.isWater(bot.dropTarget.x, bot.dropTarget.z)) {
    bot.dropTarget = pickSafeDestination(bot, ctx);
  } else if (
    isInVolcanoLavaHazard(
      bot.dropTarget.x,
      bot.dropTarget.z,
      VOLCANO_LAVA_SAFE_RADIUS + 1.5,
    )
  ) {
    const safe = clampOutsideVolcanoLava(
      bot.dropTarget.x,
      bot.dropTarget.z,
      VOLCANO_LAVA_SAFE_RADIUS + 2,
    );
    bot.dropTarget = {
      x: safe.x,
      y: ctx.terrain.getHeightAt(safe.x, safe.z),
      z: safe.z,
    };
  }

  const dx = bot.dropTarget.x - bot.position.x;
  const dz = bot.dropTarget.z - bot.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 2.5) {
    const nx = dx / d;
    const nz = dz / d;
    const currentHoriz = Math.hypot(bot.velocity.x, bot.velocity.z);
    const boostHoriz = bot.velocity.y > 0 ? clamp(currentHoriz, GLIDE_HORIZONTAL_SPEED, 26) : GLIDE_HORIZONTAL_SPEED;
    const horizSpeed = Math.min(boostHoriz, d * 2.5);
    bot.velocity.x = damp(bot.velocity.x, nx * horizSpeed, 6, safeDt);
    bot.velocity.z = damp(bot.velocity.z, nz * horizSpeed, 6, safeDt);
    bot.yaw = lerpAngle(bot.yaw, Math.atan2(nx, nz), clamp(5 * safeDt, 0, 1));
  } else {
    bot.velocity.x *= 0.85;
    bot.velocity.z *= 0.85;
  }

  // Preserve upward Launch Pad / Geyser momentum before settling into steady glider descent
  if (bot.velocity.y > -GLIDE_DESCENT_SPEED) {
    bot.velocity.y = Math.max(-GLIDE_DESCENT_SPEED, bot.velocity.y - GRAVITY * safeDt);
  } else {
    bot.velocity.y = -GLIDE_DESCENT_SPEED;
  }

  if (isFarLOD) {
    const nx = clamp(bot.position.x + bot.velocity.x * safeDt, -WORLD_HALF + 6, WORLD_HALF - 6);
    const nz = clamp(bot.position.z + bot.velocity.z * safeDt, -WORLD_HALF + 6, WORLD_HALF - 6);
    const ny = bot.position.y + bot.velocity.y * safeDt;
    const gy = ctx.terrain.getHeightAt(nx, nz);
    bot.position.x = nx;
    bot.position.z = nz;
    if (bot.velocity.y <= 0 && ny <= gy + 0.05) {
      bot.position.y = gy;
      bot.velocity.y = 0;
      bot.grounded = true;
    } else {
      bot.position.y = ny;
      bot.grounded = false;
    }
  } else {
    const res = ctx.resolveMovement(
      bot.position,
      bot.velocity,
      bot.radius,
      bot.height,
      safeDt,
    );
    bot.position.x = clamp(res.position.x, -WORLD_HALF + 6, WORLD_HALF - 6);
    bot.position.y = res.position.y;
    bot.position.z = clamp(res.position.z, -WORLD_HALF + 6, WORLD_HALF - 6);
    bot.grounded = res.grounded;
  }

  bot.moveSpeed = Math.hypot(bot.velocity.x, bot.velocity.z);
  bot.animState = 'glide';

  const groundY = ctx.terrain.getHeightAt(bot.position.x, bot.position.z);
  if (bot.velocity.y <= 0 && (bot.grounded || bot.position.y <= groundY + 0.15)) {
    bot.position.y = Math.max(bot.position.y, groundY);
    bot.velocity.y = 0;
    bot.grounded = true;
    bot.gliderOpen = false;
    bot.gliderFactor = 0;
    const distLeft = dist2D(
      bot.position.x,
      bot.position.z,
      bot.dropTarget.x,
      bot.dropTarget.z,
    );
    bot.state =
      bot.isBoss || isInStorm(bot, ctx, 4) || distLeft > 25
        ? 'rotating'
        : 'looting';
    bot.stateTimer = 0;
    bot.animState = 'idle';
  }
}

function stepHealingState(
  bot: BotEntity,
  ctx: BotWorldContext,
  combatMatch: { target: BotCombatTarget; hasLOS: boolean; distance: number } | null,
  closeThreat: boolean,
  needRotateStorm: boolean,
  safeDt: number,
): MoveIntent {
  const item = bot.inventory.items[bot.healSlot];
  if (!item || !isHealingItem(item.weaponId) || item.stackCount <= 0) {
    bot.healTimer = 0;
    bot.retreatTimer = 0;
    bot.isCrouching = false;
    bot.state = combatMatch ? 'combat' : needRotateStorm ? 'rotating' : 'looting';
    return emptyMoveIntent();
  }

  const def = WEAPONS[item.weaponId];
  const isSplash = item.weaponId === 'chug_splash';
  const threatPos = combatMatch?.target.position ?? bot.lastKnownEnemyPos;
  let moveIntent = emptyMoveIntent();

  // Brief tactical retreat away from threat before channeling shields/meds (or while tossing Chug Splash)
  if ((bot.retreatTimer ?? 0) > 0 && threatPos) {
    bot.retreatTimer = Math.max(0, (bot.retreatTimer ?? 0) - safeDt);
    const awayX = bot.position.x - threatPos.x;
    const awayZ = bot.position.z - threatPos.z;
    const awayDist = Math.hypot(awayX, awayZ) || 1;
    const dirX = awayX / awayDist;
    const dirZ = awayZ / awayDist;
    bot.yaw = lerpAngle(bot.yaw, Math.atan2(dirX, dirZ), clamp(9 * safeDt, 0, 1));
    bot.isCrouching = false;
    bot.isSprinting = true;
    moveIntent = {
      dirX,
      dirZ,
      speed: SPRINT_SPEED,
      wantsJump: false,
    };
    bot.inventory.activeSlot = bot.healSlot;
    if (!isSplash) {
      return moveIntent;
    }
  } else {
    bot.isCrouching = !isSplash;
    bot.isSprinting = false;
  }

  bot.inventory.activeSlot = bot.healSlot;
  bot.healTimer -= safeDt;
  if (bot.healTimer > 0) {
    return moveIntent;
  }

  if (isSplash) {
    const splashAmt = def.splashHealAmount ?? 20;
    const hpGain = Math.min(splashAmt, Math.max(0, bot.maxHp - bot.hp));
    const shieldGain = Math.min(
      splashAmt - hpGain,
      Math.max(0, bot.maxShield - bot.shield),
    );
    bot.hp = Math.min(bot.maxHp, bot.hp + hpGain);
    bot.shield = Math.min(bot.maxShield, bot.shield + shieldGain);

    const eye = getBotEyePos(bot);
    const throwDir = {
      x: Math.sin(bot.yaw) * 0.25,
      y: -0.94,
      z: Math.cos(bot.yaw) * 0.25,
    };
    ctx.fireWeapon(bot, item, eye, throwDir, 0.01);
    bot.isFiring = true;
  } else {
    const amt = def.healAmount ?? 25;
    const cap = def.healCap ?? 100;
    if (def.healTarget === 'hp') {
      bot.hp = Math.min(bot.maxHp, cap, bot.hp + amt);
    } else if (def.healTarget === 'shield') {
      bot.shield = Math.min(bot.maxShield, cap, bot.shield + amt);
    } else if (def.healTarget === 'both') {
      bot.hp = Math.min(bot.maxHp, cap, bot.hp + amt);
      bot.shield = Math.min(bot.maxShield, cap, bot.shield + amt);
    }
  }

  item.stackCount -= 1;
  if (item.stackCount <= 0) {
    bot.inventory.items[bot.healSlot] = null;
  }
  bot.healTimer = 0;

  const nextHeal = selectHealingItem(
    bot.inventory.items,
    bot.hp,
    bot.shield,
    bot.maxHp,
    bot.maxShield,
  );
  if (
    nextHeal &&
    !closeThreat &&
    (bot.hp < bot.maxHp * 0.85 || bot.shield < bot.maxShield * 0.85)
  ) {
    bot.healSlot = nextHeal.slotIndex;
    bot.inventory.activeSlot = nextHeal.slotIndex;
    bot.healTimer =
      WEAPONS[nextHeal.item.weaponId].consumeTime ??
      (nextHeal.item.weaponId === 'chug_splash' ? 0.55 : 2.5);
  } else {
    bot.isCrouching = false;
    bot.retreatTimer = 0;
    bot.state = combatMatch ? 'combat' : needRotateStorm ? 'rotating' : 'looting';
    bot.stateTimer = 0;
  }
  return moveIntent;
}

interface ExplosiveBarrelCandidate {
  barrel: ExplosiveBarrelEntity;
  aimPoint: Vec3Like;
  distToBot: number;
  firearm: { slotIndex: number; item: ItemInstance };
}

function selectBestFirearmForRange(
  items: (ItemInstance | null)[],
  distance: number,
  ammo: Record<AmmoType, number>,
): { slotIndex: number; item: ItemInstance } | null {
  let bestSlot = -1;
  let bestItem: ItemInstance | null = null;
  let bestScore = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const def = WEAPONS[item.weaponId];
    if (
      !def ||
      item.weaponId === 'pickaxe' ||
      def.isThrowable ||
      def.isGrappler ||
      def.isShieldBubble ||
      isHealingItem(item.weaponId)
    ) {
      continue;
    }
    if (item.weaponId === 'rocket_launcher' && distance < 9) continue;
    if (distance > def.range) continue;

    if (def.ammoType !== null) {
      const reserve = ammo[def.ammoType] ?? 0;
      if (item.magAmmo <= 0 && reserve <= 0) continue;
    }

    const score = scoreWeaponForDistance(item, distance, item.magAmmo > 0);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = i;
      bestItem = item;
    }
  }

  if (bestSlot < 0 || !bestItem || bestScore <= 0) {
    return null;
  }
  return { slotIndex: bestSlot, item: bestItem };
}

/**
 * Selects an unexploded `ExplosiveBarrelEntity` within 6.2m of `target` that the bot
 * has clear LOS and firearm range to shoot safely without blowing itself up.
 */
export function selectExplosiveBarrelTarget(
  bot: Pick<BotEntity, 'position' | 'isCrouching' | 'inventory'>,
  target: Pick<BotCombatTarget, 'position' | 'eyePos'>,
  barrels: ReadonlyArray<ExplosiveBarrelEntity>,
  hasLineOfSight: (from: Vec3Like, to: Vec3Like) => boolean,
  activeBubbles: ReadonlyArray<ShieldBubbleZone> = [],
): ExplosiveBarrelCandidate | null {
  if (barrels.length === 0) return null;
  const eye: Vec3Like = {
    x: bot.position.x,
    y: bot.position.y + (bot.isCrouching ? 1.05 : 1.55),
    z: bot.position.z,
  };

  let best: ExplosiveBarrelCandidate | null = null;
  let bestScore = Infinity;

  for (const b of barrels) {
    if (b.exploded || b.hp <= 0) continue;
    const aimPoint: Vec3Like = { x: b.x, y: b.y + 0.65, z: b.z };
    const dToTarget = Math.min(
      dist3D(b, target.position),
      dist3D(aimPoint, target.position),
    );
    if (dToTarget > 6.2) continue;

    const dToBot = dist3D(eye, aimPoint);
    if (dToBot <= 4.2) continue;

    const firearm = selectBestFirearmForRange(
      bot.inventory.items,
      dToBot,
      bot.inventory.ammo,
    );
    if (!firearm) continue;

    if (
      activeBubbles.length > 0 &&
      (isShotBlockedByShieldBubbles(eye, aimPoint, activeBubbles) !== null ||
        isShotBlockedByShieldBubbles(aimPoint, target.eyePos, activeBubbles) !== null)
    ) {
      continue;
    }

    if (!hasLineOfSight(eye, aimPoint)) continue;

    const score = dToTarget + b.hp * 0.04;
    if (score < bestScore) {
      bestScore = score;
      best = { barrel: b, aimPoint, distToBot: dToBot, firearm };
    }
  }

  return best;
}

function triggerBarrelExplosionEffects(
  botId: string,
  ctx: BotWorldContext,
  initialBarrelId: string,
  initialPos: Vec3Like,
  initialRadius: number,
  initialDamage: number,
  activeBubbles: ReadonlyArray<ShieldBubbleZone>,
): void {
  const emitExplosion = (pos: Vec3Like, radius: number) => {
    ctx.eventBus.emit('vfx:explosion', {
      position: { ...pos },
      radius,
    });
    ctx.eventBus.emit('sound:play', {
      id: 'barrel_explode',
      position: { ...pos },
      spatial: true,
    });
    ctx.eventBus.emit('audio:noise', {
      position: { ...pos },
      kind: 'gunfire',
      sourceId: botId,
      radius: 140,
    });
  };

  emitExplosion(initialPos, initialRadius);

  if (!ctx.getExplosiveBarrels || !ctx.damageExplosiveBarrel) return;
  const visited = new Set<string>([initialBarrelId]);
  const queue: Array<{ position: Vec3Like; blastRadius: number; blastDamage: number }> = [
    { position: initialPos, blastRadius: initialRadius, blastDamage: initialDamage },
  ];

  while (queue.length > 0) {
    const blast = queue.shift()!;
    const allBarrels = ctx.getExplosiveBarrels();
    for (const other of allBarrels) {
      if (other.exploded || other.hp <= 0 || visited.has(other.id)) continue;
      const otherCenter: Vec3Like = { x: other.x, y: other.y + 0.625, z: other.z };
      const d = Math.min(dist3D(blast.position, other), dist3D(blast.position, otherCenter));
      if (d > blast.blastRadius + 0.85) continue;
      if (
        activeBubbles.length > 0 &&
        isShotBlockedByShieldBubbles(blast.position, otherCenter, activeBubbles) !== null
      ) {
        continue;
      }
      visited.add(other.id);
      const chainRes = ctx.damageExplosiveBarrel(other.id, blast.blastDamage);
      if (chainRes?.exploded) {
        emitExplosion(chainRes.position, chainRes.blastRadius);
        queue.push({
          position: chainRes.position,
          blastRadius: chainRes.blastRadius,
          blastDamage: chainRes.blastDamage,
        });
      }
    }
  }
}

function tryShootExplosiveBarrel(
  bot: BotEntity,
  ctx: BotWorldContext,
  profile: DifficultyProfile,
  target: BotCombatTarget,
  activeBubbles: ReadonlyArray<ShieldBubbleZone>,
  safeDt: number,
  squadmates?: ReadonlyArray<BotEntity>,
): boolean {
  if (!ctx.getExplosiveBarrels || !ctx.damageExplosiveBarrel) return false;
  const barrels = ctx.getExplosiveBarrels();
  if (!barrels || barrels.length === 0) return false;

  const candidate = selectExplosiveBarrelTarget(
    bot,
    target,
    barrels,
    ctx.hasLineOfSight,
    activeBubbles,
  );
  if (!candidate) return false;

  if (bot.isAlly || bot.isDuoPartner || bot.squadId) {
    const friendlyNearBlast = ctx.getCombatTargets().some(
      (t) =>
        t.alive &&
        isFriendlyTarget(bot, t, squadmates) &&
        dist3D(t.position, candidate.barrel) <= candidate.barrel.blastRadius + 2.0,
    );
    if (friendlyNearBlast) return false;
  }

  const { barrel, aimPoint, distToBot, firearm } = candidate;
  if (bot.inventory.activeSlot !== firearm.slotIndex) {
    bot.inventory.activeSlot = firearm.slotIndex;
    bot.burstQueue = 0;
  }

  const item = firearm.item;
  const def = WEAPONS[item.weaponId];
  const eye = getBotEyePos(bot);
  const dx = aimPoint.x - eye.x;
  const dy = aimPoint.y - eye.y;
  const dz = aimPoint.z - eye.z;
  const horiz = Math.hypot(dx, dz) || 0.001;
  const targetYaw = Math.atan2(dx, dz);
  const targetPitch = Math.atan2(dy, horiz);

  bot.yaw = lerpAngle(
    bot.yaw,
    targetYaw,
    clamp(profile.turnSpeedRadPerSec * safeDt, 0, 1),
  );
  bot.pitch = clamp(targetPitch, -1.2, 1.2);

  if (item.magAmmo <= 0) {
    if (
      bot.reloadTimer <= 0 &&
      def.ammoType &&
      (bot.inventory.ammo[def.ammoType] ?? 0) > 0
    ) {
      bot.reloadSlot = firearm.slotIndex;
      bot.reloadTimer = def.reloadTime;
      bot.burstQueue = 0;
    }
    return true;
  }

  if (bot.reloadTimer > 0 || bot.reactionTimer > 0 || bot.fireCooldown > 0) {
    return true;
  }

  const yawDiff = Math.abs(normalizeAngle(targetYaw - bot.yaw));
  if (yawDiff > 0.45) {
    return true;
  }

  bot.isAiming = distToBot > 14;
  const dmg = Math.max(
    1,
    Math.round(def.baseDamage * (RARITY_MULTIPLIER[item.rarity] ?? 1)),
  );
  const res = ctx.damageExplosiveBarrel(barrel.id, dmg);
  if (!res) {
    return false;
  }

  item.magAmmo = Math.max(0, item.magAmmo - 1);
  bot.isFiring = true;
  bot.recoilKick = 1.0;
  bot.fireCooldown = 1 / Math.max(0.2, def.fireRate * profile.fireRateScale);

  ctx.eventBus.emit('vfx:tracer', { from: eye, to: aimPoint });
  ctx.eventBus.emit('vfx:impact', {
    position: aimPoint,
    normal: { x: 0, y: 1, z: 0 },
    material: 'metal',
  });
  ctx.eventBus.emit('audio:noise', {
    position: { ...bot.position },
    kind: 'gunfire',
    sourceId: bot.id,
    radius: 48,
  });

  if (res.exploded) {
    triggerBarrelExplosionEffects(
      bot.id,
      ctx,
      barrel.id,
      res.position,
      res.blastRadius,
      res.blastDamage,
      activeBubbles,
    );
  }
  return true;
}

function getPreferredCombatRange(
  weaponId: WeaponId | undefined,
  personality: BotEntity['personality'],
): { min: number; max: number } {
  if (
    weaponId === 'pump_shotgun' ||
    weaponId === 'tac_shotgun' ||
    weaponId === 'heavy_shotgun' ||
    personality === 'rusher'
  ) {
    return { min: weaponId === 'heavy_shotgun' ? 6 : 5, max: weaponId === 'heavy_shotgun' ? 15 : 13 };
  }
  if (weaponId === 'smg' || weaponId === 'combat_smg') {
    return { min: 8, max: 22 };
  }
  if (weaponId === 'boom_bow') {
    return { min: 22, max: 62 };
  }
  if (weaponId === 'sniper' || personality === 'sniper') {
    return { min: 42, max: 88 };
  }
  if (weaponId === 'mythic_blade_rifle') {
    return { min: 16, max: 38 };
  }
  return { min: 16, max: 35 };
}

function stepCombatState(
  bot: BotEntity,
  ctx: BotWorldContext,
  difficulty: Difficulty,
  profile: DifficultyProfile,
  combatMatch: { target: BotCombatTarget; hasLOS: boolean; distance: number } | null,
  weaponCount: number,
  elapsed: number,
  safeDt: number,
  isFarLOD: boolean,
  squadmates?: ReadonlyArray<BotEntity>,
): MoveIntent {
  if (!combatMatch) {
    if (bot.lastKnownEnemyPos) {
      const d = dist2D(
        bot.position.x,
        bot.position.z,
        bot.lastKnownEnemyPos.x,
        bot.lastKnownEnemyPos.z,
      );
      if (d > 2.5) {
        return moveTowardPoint(
          bot,
          bot.lastKnownEnemyPos.x,
          bot.lastKnownEnemyPos.z,
          safeDt,
          16,
        );
      }
      bot.lastKnownEnemyPos = null;
    }
    bot.state = weaponCount > 0 ? 'rotating' : 'looting';
    return emptyMoveIntent();
  }

  const { target, hasLOS, distance } = combatMatch;
  const eye = getBotEyePos(bot);
  const activeBubbles = ctx.getActiveShieldBubbles?.() ?? [];
  const blockingBubble =
    activeBubbles.length > 0
      ? isShotBlockedByShieldBubbles(eye, target.eyePos, activeBubbles)
      : null;
  const targetBubble =
    activeBubbles.find(
      (b) =>
        dist3D(target.eyePos, b.position) < b.radius ||
        dist3D(target.position, b.position) < b.radius,
    ) ?? null;
  const cqcWeapon =
    activeBubbles.length > 0
      ? selectCloseQuartersWeapon(bot.inventory.items, bot.inventory.ammo)
      : null;
  const bothInsideSameBubble =
    targetBubble !== null &&
    blockingBubble === null &&
    dist3D(eye, targetBubble.position) < Math.max(0.1, targetBubble.radius - 0.15);

  if (blockingBubble) {
    // Avoid wasting AR/sniper bursts into an active shield bubble dome
    bot.burstQueue = 0;
    const faceYaw = Math.atan2(target.position.x - eye.x, target.position.z - eye.z);
    bot.yaw = lerpAngle(bot.yaw, faceYaw, clamp(profile.turnSpeedRadPerSec * safeDt, 0, 1));
    if (
      cqcWeapon &&
      (targetBubble !== null ||
        dist3D(eye, blockingBubble.position) < blockingBubble.radius ||
        distance <= 38)
    ) {
      bot.inventory.activeSlot = cqcWeapon.slotIndex;
    }
  } else if (
    !isFarLOD &&
    tryShootExplosiveBarrel(bot, ctx, profile, target, activeBubbles, safeDt, squadmates)
  ) {
    // Prioritized explosive barrel near target enemy
  } else if (bothInsideSameBubble && cqcWeapon) {
    if (bot.inventory.activeSlot !== cqcWeapon.slotIndex) {
      bot.inventory.activeSlot = cqcWeapon.slotIndex;
      bot.burstQueue = 0;
    }
    handleFireAndBurst(bot, ctx, difficulty, target, distance, hasLOS, safeDt, squadmates);
  } else {
    // Check tactical throwables (`frag_grenade` / `shockwave_grenade`) against clustered or boxed enemies
    const throwDecision =
      !isFarLOD && bot.reloadTimer <= 0 && bot.burstQueue <= 0
        ? selectThrowableForCombat(
            bot,
            target,
            ctx.getCombatTargets(),
            hasLOS,
            ctx.getBuildPieces?.(),
            squadmates,
          )
        : null;

    if (throwDecision && bot.fireCooldown <= 0 && bot.reactionTimer <= 0) {
      if (bot.inventory.activeSlot !== throwDecision.slotIndex) {
        bot.inventory.activeSlot = throwDecision.slotIndex;
        bot.burstQueue = 0;
      }
      handleFireAndBurst(bot, ctx, difficulty, target, distance, hasLOS, safeDt, squadmates);
    } else {
      const chosen = selectBestWeaponForDistance(
        bot.inventory.items,
        distance,
        bot.inventory.ammo,
      );
      if (chosen) {
        if (bot.inventory.activeSlot !== chosen.slotIndex) {
          bot.inventory.activeSlot = chosen.slotIndex;
          bot.burstQueue = 0;
        }
        handleFireAndBurst(bot, ctx, difficulty, target, distance, hasLOS, safeDt, squadmates);
      }
    }
  }

  const activeWeaponId = bot.inventory.items[bot.inventory.activeSlot]?.weaponId;
  const activeDef = activeWeaponId ? WEAPONS[activeWeaponId] : undefined;
  const range = getPreferredCombatRange(activeWeaponId, bot.personality);

  const toEnemyX = target.position.x - bot.position.x;
  const toEnemyZ = target.position.z - bot.position.z;
  const horizDist = Math.hypot(toEnemyX, toEnemyZ) || 1;
  const fwdX = toEnemyX / horizDist;
  const fwdZ = toEnemyZ / horizDist;
  const rightX = -fwdZ;
  const rightZ = fwdX;

  bot.strafeTimer -= safeDt;
  if (bot.strafeTimer <= 0) {
    bot.strafeDir = nextBotRand(bot) < 0.5 ? -1 : 1;
    bot.strafeTimer = 0.65 + nextBotRand(bot) * 1.1;
  }

  const behindRampCover =
    bot.lastBuildTime !== undefined && elapsed - bot.lastBuildTime <= 8.0;
  const isRangedPrecision =
    activeDef?.category === 'rifle' || activeDef?.category === 'sniper';

  let radial = 0;
  let strafeWeightOverride: number | null = null;
  let forceBubbleSprint = false;

  if (blockingBubble) {
    const targetInside = targetBubble !== null;
    const botInside = dist3D(eye, blockingBubble.position) < blockingBubble.radius;
    if (targetInside && cqcWeapon) {
      // Push inside the enemy's shield bubble with shotgun / SMG
      radial = 1;
      strafeWeightOverride = 0.2;
      forceBubbleSprint = horizDist > blockingBubble.radius * 0.6;
    } else if (botInside && !targetInside) {
      radial = cqcWeapon && horizDist < 22 ? 1 : 0.35;
      strafeWeightOverride = cqcWeapon && horizDist < 22 ? 0.45 : 0.95;
    } else {
      // Flank laterally around the blocking dome when using ranged guns or intervening bubbles
      bot.strafeTimer = Math.max(bot.strafeTimer, 0.75);
      radial = horizDist > 26 ? 0.35 : 0;
      strafeWeightOverride = 1.0;
    }
  } else if (bothInsideSameBubble && targetBubble) {
    const maxStay = Math.max(2.6, targetBubble.radius - 1.4);
    const minStay = Math.min(range.min, 2.2);
    if (horizDist > maxStay) {
      radial = 0.9;
    } else if (horizDist < minStay) {
      radial = -0.6;
    }
  } else if (behindRampCover && isRangedPrecision && horizDist >= 12) {
    // Hold 1x1 ramp cover; nudge slightly up the ramp if own wall obscures LOS
    radial = hasLOS ? 0 : 0.42;
  } else if (horizDist > range.max || !hasLOS) {
    radial = 1;
  } else if (horizDist < range.min) {
    radial = -0.8;
  }

  const strafeWeight =
    strafeWeightOverride !== null
      ? strafeWeightOverride * (isFarLOD ? 0.25 : 1.0)
      : profile.strafeAgility *
        (isFarLOD ? 0.25 : behindRampCover && isRangedPrecision ? 0.45 : 0.85);
  const rawX = fwdX * radial + rightX * bot.strafeDir * strafeWeight;
  const rawZ = fwdZ * radial + rightZ * bot.strafeDir * strafeWeight;
  const rawLen = Math.hypot(rawX, rawZ);

  let dirX = 0;
  let dirZ = 0;
  if (rawLen > 0.05) {
    dirX = rawX / rawLen;
    dirZ = rawZ / rawLen;
  }

  let wantsJump = false;
  if (!isFarLOD && activeDef?.category === 'shotgun' && horizDist < 12) {
    // Jump-peek aggressively with shotguns at close quarters (<12m)
    bot.isCrouching = false;
    if (
      bot.grounded &&
      bot.jumpCooldown <= 0 &&
      (bot.fireCooldown <= 0.22 ||
        nextBotRand(bot) < (0.35 + profile.jumpInCombatChance) * safeDt * 6)
    ) {
      wantsJump = true;
    }
  } else if (!isFarLOD && isRangedPrecision && horizDist >= 12 && behindRampCover) {
    // Crouch-peek behind defensive ramp with AR / Sniper
    if (
      bot.reloadTimer > 0 ||
      (activeWeaponId === 'sniper' && bot.fireCooldown > 0.35)
    ) {
      bot.isCrouching = true;
    } else {
      bot.crouchToggleTimer -= safeDt;
      if (bot.crouchToggleTimer <= 0) {
        bot.crouchToggleTimer = 0.45 + nextBotRand(bot) * 0.45;
        bot.isCrouching = !bot.isCrouching;
      }
    }
  } else {
    bot.crouchToggleTimer -= safeDt;
    if (!isFarLOD && bot.crouchToggleTimer <= 0) {
      bot.crouchToggleTimer = 0.9 + nextBotRand(bot) * 1.2;
      bot.isCrouching =
        horizDist > 22 && nextBotRand(bot) < profile.crouchInCombatChance;
    }

    if (
      !isFarLOD &&
      horizDist < 22 &&
      bot.jumpCooldown <= 0 &&
      nextBotRand(bot) < profile.jumpInCombatChance * safeDt * 4
    ) {
      wantsJump = true;
      bot.isCrouching = false;
    }
  }

  bot.isSprinting =
    (forceBubbleSprint || (radial > 0 && horizDist > range.max + 8)) && !bot.isCrouching;
  const speed = bot.isCrouching
    ? CROUCH_SPEED
    : bot.isSprinting
      ? SPRINT_SPEED
      : WALK_SPEED;

  return { dirX, dirZ, speed, wantsJump };
}

function scanLootingTargets(
  bot: BotEntity,
  ctx: BotWorldContext,
  elapsed: number,
): void {
  bot.scanCooldown = 0.16;

  const drops = ctx.getLootDrops();
  let bestDropId: string | null = null;
  let bestDropPos: Vec3Like | null = null;
  let bestDropScore = -Infinity;

  for (const drop of drops) {
    if (drop.id === bot.ignoredTargetId && elapsed < bot.ignoredTargetUntil) continue;
    if (isInVolcanoLavaHazard(drop.x, drop.z)) continue;
    const d = dist2D(bot.position.x, bot.position.z, drop.x, drop.z);
    if (d > 48) continue;

    let bonus = 0;
    if (drop.item && canUpgradeOrTakeItem(bot, drop.item) >= 1) {
      bonus = isHealingItem(drop.item.weaponId) ? 18 : 32;
    } else if (drop.ammo) {
      bonus = 6;
    } else if (drop.materials && getTotalMaterials(bot) < 400) {
      bonus = 5;
    } else {
      continue;
    }

    const score = bonus - d;
    if (score > bestDropScore) {
      bestDropScore = score;
      bestDropId = drop.id;
      bestDropPos = { x: drop.x, y: drop.y, z: drop.z };
    }
  }

  if (bestDropId && bestDropPos) {
    bot.lootTargetId = bestDropId;
    bot.chestTargetId = null;
    bot.moveTarget = bestDropPos;
    return;
  }

  bot.lootTargetId = null;
  const chests = ctx.getChests();
  let bestChestId: string | null = null;
  let bestChestPos: Vec3Like | null = null;
  let bestChestDist = 58;

  for (const chest of chests) {
    if (chest.opened) continue;
    if (chest.id === bot.ignoredTargetId && elapsed < bot.ignoredTargetUntil) continue;
    if (isInVolcanoLavaHazard(chest.x, chest.z)) continue;
    const d = dist2D(bot.position.x, bot.position.z, chest.x, chest.z);
    if (d < bestChestDist) {
      bestChestDist = d;
      bestChestId = chest.id;
      bestChestPos = { x: chest.x, y: chest.y, z: chest.z };
    }
  }

  bot.chestTargetId = bestChestId;
  if (bestChestPos) {
    bot.moveTarget = bestChestPos;
  }
}

function stepLootingState(
  bot: BotEntity,
  ctx: BotWorldContext,
  weaponCount: number,
  needRotateStorm: boolean,
  elapsed: number,
  safeDt: number,
  isFarLOD: boolean,
  gameMode: GameModeId = 'solo',
): MoveIntent {
  bot.isCrouching = false;

  const ranLootScan = !isFarLOD && bot.scanCooldown <= 0;
  if (ranLootScan) {
    scanLootingTargets(bot, ctx, elapsed);
  }

  if (bot.lootTargetId) {
    const drop = ctx.getLootDrops().find((ld) => ld.id === bot.lootTargetId);
    if (!drop) {
      bot.lootTargetId = null;
      bot.moveTarget = null;
      bot.scanCooldown = 0;
      return emptyMoveIntent();
    }
    const d = dist2D(bot.position.x, bot.position.z, drop.x, drop.z);
    if (d <= 2.4 && Math.abs(bot.position.y - drop.y) <= 2.5) {
      const picked = ctx.pickupLootDrop(drop.id);
      if (picked) {
        applyPickedLoot(bot, picked.item, picked.ammo, picked.materials);
      }
      bot.lootTargetId = null;
      bot.moveTarget = null;
      bot.scanCooldown = 0;
      return emptyMoveIntent();
    }
    return moveTowardPoint(bot, drop.x, drop.z, safeDt, 10);
  }

  if (bot.chestTargetId) {
    const chest = ctx.getChests().find((c) => c.id === bot.chestTargetId && !c.opened);
    if (!chest) {
      bot.chestTargetId = null;
      bot.moveTarget = null;
      bot.scanCooldown = 0;
      return emptyMoveIntent();
    }
    const d = dist2D(bot.position.x, bot.position.z, chest.x, chest.z);
    if (d <= 2.6 && Math.abs(bot.position.y - chest.y) <= 2.6) {
      ctx.openChest(chest.id);
      bot.chestTargetId = null;
      bot.scanCooldown = 0;
      return emptyMoveIntent();
    }
    return moveTowardPoint(bot, chest.x, chest.z, safeDt, 10);
  }

  if (ranLootScan || isFarLOD || bot.stateTimer > 1.0) {
    const desiredMatGoal = bot.personality === 'builder' ? 240 : 120;
    if (
      gameMode !== 'zero_build' &&
      weaponCount >= 1 &&
      getTotalMaterials(bot) < desiredMatGoal &&
      !needRotateStorm
    ) {
      bot.state = 'harvesting';
      bot.stateTimer = 0;
    } else {
      bot.state = 'rotating';
      bot.stateTimer = 0;
      bot.moveTarget = pickSafeDestination(bot, ctx);
    }
  }
  return emptyMoveIntent();
}

function stepHarvestingState(
  bot: BotEntity,
  ctx: BotWorldContext,
  needRotateStorm: boolean,
  elapsed: number,
  safeDt: number,
  isFarLOD: boolean,
): MoveIntent {
  bot.isCrouching = false;
  bot.inventory.activeSlot = 0;

  const matGoal = bot.personality === 'builder' ? 250 : 150;
  if (getTotalMaterials(bot) >= matGoal || needRotateStorm) {
    bot.harvestTargetId = null;
    bot.state = 'rotating';
    bot.stateTimer = 0;
    return emptyMoveIntent();
  }

  if (bot.scanCooldown <= 0 && !bot.harvestTargetId) {
    bot.scanCooldown = 0.25;
    let bestId: string | null = null;
    let bestDist = 42;
    for (const prop of ctx.getProps()) {
      if (prop.destroyed) continue;
      if (prop.id === bot.ignoredTargetId && elapsed < bot.ignoredTargetUntil) continue;
      if (isInVolcanoLavaHazard(prop.x, prop.z)) continue;
      const d = dist2D(bot.position.x, bot.position.z, prop.x, prop.z);
      if (d < bestDist) {
        bestDist = d;
        bestId = prop.id;
      }
    }
    bot.harvestTargetId = bestId;
  }

  const prop = bot.harvestTargetId
    ? ctx.getProps().find((p) => p.id === bot.harvestTargetId && !p.destroyed)
    : undefined;

  if (!prop) {
    bot.harvestTargetId = null;
    if (bot.stateTimer > 3.5 || isFarLOD) {
      bot.state = 'rotating';
      bot.stateTimer = 0;
    }
    return emptyMoveIntent();
  }

  const d = dist2D(bot.position.x, bot.position.z, prop.x, prop.z);
  const reach = prop.radius + 2.2;
  const dx = prop.x - bot.position.x;
  const dz = prop.z - bot.position.z;
  bot.yaw = lerpAngle(bot.yaw, Math.atan2(dx, dz), clamp(8 * safeDt, 0, 1));

  if (d <= reach) {
    if (bot.harvestCooldown <= 0) {
      const hitPoint: Vec3Like = { x: prop.x, y: prop.y + 1.0, z: prop.z };
      const res = ctx.damageProp(prop.id, 50, hitPoint);
      if (res.hit) {
        bot.inventory.materials[res.matType] = Math.min(
          MAX_MATS,
          (bot.inventory.materials[res.matType] ?? 0) + res.yieldAmount,
        );
      }
      bot.harvestSwingTimer = 0.4;
      bot.harvestCooldown = 1 / WEAPONS.pickaxe.fireRate;
      if (res.destroyed) {
        bot.harvestTargetId = null;
      }
    }
    return emptyMoveIntent();
  }

  return moveTowardPoint(bot, prop.x, prop.z, safeDt, 10);
}

function pickBossPatrolPoint(bot: BotEntity, ctx: BotWorldContext): Vec3Like {
  const home = bot.bossHomePos ?? bot.position;
  const radius = 5.0;
  let x = home.x + Math.cos(bot.patrolAngle) * radius;
  let z = home.z + Math.sin(bot.patrolAngle) * radius;
  if (isInVolcanoLavaHazard(x, z, VOLCANO_LAVA_SAFE_RADIUS + 2)) {
    const safe = clampOutsideVolcanoLava(x, z, VOLCANO_LAVA_SAFE_RADIUS + 2);
    x = safe.x;
    z = safe.z;
  }
  if (ctx.terrain.isWater(x, z)) {
    x = home.x;
    z = home.z;
  }
  return { x, y: ctx.terrain.getHeightAt(x, z), z };
}

function stepRotatingState(
  bot: BotEntity,
  ctx: BotWorldContext,
  weaponCount: number,
  inStormNow: boolean,
  farFromSafeZone: boolean,
  needRotateStorm: boolean,
  elapsed: number,
  safeDt: number,
  isFarLOD: boolean,
  squadmates?: ReadonlyArray<BotEntity>,
): MoveIntent {
  bot.isCrouching = false;

  const bestSlot = selectBestWeaponForDistance(bot.inventory.items, 35, bot.inventory.ammo);
  if (bestSlot) {
    bot.inventory.activeSlot = bestSlot.slotIndex;
  }

  // Named POI Bosses patrol their landmark while inside the safe zone
  if (bot.isBoss && bot.bossHomePos && !needRotateStorm) {
    const home = bot.bossHomePos;
    let destination: Vec3Like;
    if (
      bot.lastHeardNoisePos &&
      elapsed - bot.lastHeardNoiseTime < 4.0 &&
      dist2D(bot.lastHeardNoisePos.x, bot.lastHeardNoisePos.z, home.x, home.z) <= 36
    ) {
      destination = bot.lastHeardNoisePos;
    } else {
      const targetFarFromHome =
        !bot.moveTarget ||
        dist2D(bot.moveTarget.x, bot.moveTarget.z, home.x, home.z) > 12;
      if (
        targetFarFromHome ||
        dist2D(bot.position.x, bot.position.z, bot.moveTarget!.x, bot.moveTarget!.z) < 2.2
      ) {
        bot.patrolAngle += 1.05 + nextBotRand(bot) * 0.8;
        bot.moveTarget = pickBossPatrolPoint(bot, ctx);
      }
      destination = bot.moveTarget!;
    }
    const d = dist2D(bot.position.x, bot.position.z, destination.x, destination.z);
    if (d <= 1.2) return emptyMoveIntent();
    const intent = moveTowardPoint(bot, destination.x, destination.z, safeDt, 18);
    intent.speed = Math.min(intent.speed, WALK_SPEED);
    bot.isSprinting = false;
    return intent;
  }

  let destination: Vec3Like | null = null;
  if (
    !needRotateStorm &&
    weaponCount > 0 &&
    bot.lastHeardNoisePos &&
    elapsed - bot.lastHeardNoiseTime < 4.0 &&
    bot.personality !== 'looter'
  ) {
    destination = bot.lastHeardNoisePos;
    bot.launchPadTargetId = null;
  } else if (
    !needRotateStorm &&
    !bot.isBoss &&
    !bot.isAlly &&
    !bot.isDuoPartner &&
    squadmates &&
    squadmates.length > 0
  ) {
    const aliveMate = squadmates.find(
      (m) =>
        m.id !== bot.id &&
        m.alive &&
        !m.isKnocked &&
        m.state !== 'knocked' &&
        m.state !== 'bus' &&
        m.state !== 'skydiving' &&
        m.state !== 'gliding' &&
        dist2D(bot.position.x, bot.position.z, m.position.x, m.position.z) > 18 &&
        dist2D(bot.position.x, bot.position.z, m.position.x, m.position.z) <= 85 &&
        !isInVolcanoLavaHazard(m.position.x, m.position.z, VOLCANO_LAVA_SAFE_RADIUS + 1.5),
    );
    if (aliveMate) {
      destination = { ...aliveMate.position };
      bot.launchPadTargetId = null;
    }
  }
  if (!destination) {
    const moveTargetOutsideSafe =
      needRotateStorm &&
      bot.moveTarget &&
      ctx.storm.currentRadius > 0 &&
      dist2D(
        bot.moveTarget.x,
        bot.moveTarget.z,
        ctx.storm.currentCenterX,
        ctx.storm.currentCenterZ,
      ) >
        ctx.storm.currentRadius * 0.9;
    if (
      !bot.moveTarget ||
      moveTargetOutsideSafe ||
      dist2D(bot.position.x, bot.position.z, bot.moveTarget.x, bot.moveTarget.z) < 6 ||
      ctx.terrain.isWater(bot.moveTarget.x, bot.moveTarget.z) ||
      isInVolcanoLavaHazard(bot.moveTarget.x, bot.moveTarget.z, VOLCANO_LAVA_SAFE_RADIUS + 1.5)
    ) {
      bot.patrolAngle += 0.8 + nextBotRand(bot) * 1.4;
      bot.moveTarget = pickSafeDestination(bot, ctx);
    }
    const safeDest = bot.moveTarget;

    // Check if an active Launch Pad / Geyser is nearby to boost long zone rotations
    const pads = ctx.getLaunchPads?.();
    if (pads && pads.length > 0 && (bot.launchPadCooldown ?? 0) <= 0) {
      if (tryTriggerLaunchPad(bot, ctx, safeDest)) {
        return { ...emptyMoveIntent(), launchedGliding: true };
      }
      let pad: LaunchPadEntity | null = null;
      if (bot.launchPadTargetId) {
        pad = pads.find((p) => p.id === bot.launchPadTargetId) ?? null;
        if (
          !pad ||
          dist2D(bot.position.x, bot.position.z, pad.x, pad.z) > 85 ||
          isInVolcanoLavaHazard(pad.x, pad.z)
        ) {
          pad = null;
          bot.launchPadTargetId = null;
        }
      }
      if (!pad) {
        const preferStormPad = inStormNow || farFromSafeZone;
        pad = selectLaunchPadForRotation(bot, pads, safeDest, preferStormPad);
        if (!pad && preferStormPad) {
          const safeCenter: Vec3Like = {
            x: ctx.storm.currentCenterX,
            y: ctx.terrain.getHeightAt(ctx.storm.currentCenterX, ctx.storm.currentCenterZ),
            z: ctx.storm.currentCenterZ,
          };
          pad = selectLaunchPadForRotation(bot, pads, safeCenter, true);
          if (pad) {
            bot.moveTarget = safeCenter;
          }
        }
        bot.launchPadTargetId = pad ? pad.id : null;
      }
      destination = pad ? { x: pad.x, y: pad.y, z: pad.z } : safeDest;
    } else {
      destination = safeDest;
    }
  }

  if (!needRotateStorm && !bot.isBoss && !isFarLOD && bot.scanCooldown <= 0) {
    bot.scanCooldown = 0.35;
    if (weaponCount < 2 || countHealingSlots(bot) === 0) {
      const hasNearbyLoot = ctx
        .getLootDrops()
        .some(
          (ld) =>
            !isInVolcanoLavaHazard(ld.x, ld.z) &&
            dist2D(bot.position.x, bot.position.z, ld.x, ld.z) < 28,
        );
      const hasNearbyChest = ctx
        .getChests()
        .some(
          (c) =>
            !c.opened &&
            !isInVolcanoLavaHazard(c.x, c.z) &&
            dist2D(bot.position.x, bot.position.z, c.x, c.z) < 32,
        );
      if (hasNearbyLoot || hasNearbyChest) {
        bot.state = 'looting';
        bot.stateTimer = 0;
      }
    }
  }

  if (!destination) return emptyMoveIntent();
  const d = dist2D(bot.position.x, bot.position.z, destination.x, destination.z);
  if (d <= 2.0) return emptyMoveIntent();

  const intent = moveTowardPoint(
    bot,
    destination.x,
    destination.z,
    safeDt,
    inStormNow || farFromSafeZone || bot.launchPadTargetId ? 0 : 15,
  );
  if (inStormNow || farFromSafeZone || bot.launchPadTargetId) {
    bot.isSprinting = true;
    intent.speed = SPRINT_SPEED;
  }
  return intent;
}

function recoverIfStuck(
  bot: BotEntity,
  ctx: BotWorldContext,
  intent: MoveIntent,
  elapsed: number,
  safeDt: number,
  isFarLOD: boolean,
): void {
  if (isFarLOD || intent.speed <= 1.5) {
    bot.stuckTimer = 0;
    bot.lastStuckCheckPos = { ...bot.position };
    return;
  }

  bot.stuckTimer += safeDt;
  if (bot.stuckTimer < 1.1) return;

  const moved = dist2D(
    bot.position.x,
    bot.position.z,
    bot.lastStuckCheckPos.x,
    bot.lastStuckCheckPos.z,
  );
  bot.lastStuckCheckPos = { ...bot.position };
  bot.stuckTimer = 0;

  if (moved >= 0.65) return;

  intent.wantsJump = true;
  const side = nextBotRand(bot) < 0.5 ? 1 : -1;
  const rx = -intent.dirZ * side;
  const rz = intent.dirX * side;
  intent.dirX = rx;
  intent.dirZ = rz;

  if (
    bot.lootTargetId ||
    bot.chestTargetId ||
    bot.harvestTargetId ||
    bot.captureTargetId ||
    bot.riftTargetId
  ) {
    bot.ignoredTargetId =
      bot.lootTargetId ??
      bot.chestTargetId ??
      bot.harvestTargetId ??
      bot.captureTargetId ??
      bot.riftTargetId ??
      null;
    bot.ignoredTargetUntil = elapsed + 6.0;
    bot.lootTargetId = null;
    bot.chestTargetId = null;
    bot.harvestTargetId = null;
    bot.captureTargetId = null;
    bot.riftTargetId = null;
    bot.moveTarget = pickSafeDestination(bot, ctx);
  }
}

function applyVolcanoLavaAvoidance(
  bot: BotEntity,
  intent: MoveIntent,
): MoveIntent {
  const dx = bot.position.x - VOLCANO_LAVA_CENTER_X;
  const dz = bot.position.z - VOLCANO_LAVA_CENTER_Z;
  const d = Math.hypot(dx, dz);

  // If inside or on edge of molten lava (< 14.8m), sprint directly radially outward
  if (d < VOLCANO_LAVA_SAFE_RADIUS + 0.8) {
    const ox = d > 1e-4 ? dx / d : 1;
    const oz = d > 1e-4 ? dz / d : 0;
    bot.isSprinting = true;
    bot.isCrouching = false;
    return {
      dirX: ox,
      dirZ: oz,
      speed: SPRINT_SPEED,
      wantsJump: intent.wantsJump,
    };
  }

  // If just outside the crater rim and moving toward lava, steer tangentially around it
  if (d < VOLCANO_LAVA_SAFE_RADIUS + 5.5 && intent.speed > 0.1) {
    const rx = dx / d;
    const rz = dz / d;
    const inwardDot = intent.dirX * -rx + intent.dirZ * -rz;
    if (inwardDot > 0.05) {
      const txA = -rz;
      const tzA = rx;
      const dotA = intent.dirX * txA + intent.dirZ * tzA;
      const sign = dotA >= 0 ? 1 : -1;
      const outBias = d < VOLCANO_LAVA_SAFE_RADIUS + 2.2 ? 0.35 : 0.12;
      const bx = txA * sign + rx * outBias;
      const bz = tzA * sign + rz * outBias;
      const blen = Math.hypot(bx, bz) || 1;
      return {
        ...intent,
        dirX: bx / blen,
        dirZ: bz / blen,
      };
    }
  }

  return intent;
}

function trySlurpBarrelRecovery(
  bot: BotEntity,
  ctx: BotWorldContext,
  profile: DifficultyProfile,
  combatMatch: { target: BotCombatTarget; hasLOS: boolean; distance: number } | null,
  inStormNow: boolean,
  safeDt: number,
  isFarLOD: boolean,
): MoveIntent | null {
  if (isFarLOD || !ctx.getSlurpBarrels || !ctx.damageSlurpBarrel) return null;
  if (bot.state === 'healing' || inStormNow) return null;
  if (bot.shield >= 75 || bot.shield >= bot.maxShield) return null;

  const inCloseRangePanic =
    combatMatch !== null &&
    ((combatMatch.hasLOS && combatMatch.distance < 18) ||
      combatMatch.distance < 14 ||
      (bot.hp < 45 && combatMatch.distance < 26));
  if (inCloseRangePanic) return null;

  const barrels = ctx.getSlurpBarrels();
  if (!barrels || barrels.length === 0) return null;

  let bestBarrel: SlurpBarrelEntity | null = null;
  let bestDist = 14.0001;
  for (const barrel of barrels) {
    if (barrel.destroyed || barrel.hp <= 0) continue;
    if (Math.abs(barrel.y - bot.position.y) > 4.5) continue;
    if (isInVolcanoLavaHazard(barrel.x, barrel.z)) continue;
    const d = dist2D(bot.position.x, bot.position.z, barrel.x, barrel.z);
    if (d <= 14 && d < bestDist) {
      bestDist = d;
      bestBarrel = barrel;
    }
  }
  if (!bestBarrel) return null;

  const eye = getBotEyePos(bot);
  const aimPoint: Vec3Like = {
    x: bestBarrel.x,
    y: bestBarrel.y + 0.65,
    z: bestBarrel.z,
  };
  const dx = aimPoint.x - eye.x;
  const dy = aimPoint.y - eye.y;
  const dz = aimPoint.z - eye.z;
  const horiz = Math.hypot(dx, dz) || 0.001;
  const targetYaw = Math.atan2(dx, dz);
  const targetPitch = Math.atan2(dy, horiz);
  bot.yaw = lerpAngle(
    bot.yaw,
    targetYaw,
    clamp(profile.turnSpeedRadPerSec * safeDt, 0, 1),
  );
  bot.pitch = clamp(targetPitch, -1.2, 1.2);

  const weaponChoice = selectBestWeaponForDistance(
    bot.inventory.items,
    Math.max(2.5, bestDist),
    bot.inventory.ammo,
  );
  const useFirearm =
    weaponChoice !== null &&
    weaponChoice.item.weaponId !== 'pickaxe' &&
    !WEAPONS[weaponChoice.item.weaponId].isThrowable &&
    !(weaponChoice.item.weaponId === 'rocket_launcher' && bestDist < 9);

  if (useFirearm && weaponChoice) {
    const item = weaponChoice.item;
    const def = WEAPONS[item.weaponId];
    bot.inventory.activeSlot = weaponChoice.slotIndex;

    if (item.magAmmo <= 0) {
      if (
        bot.reloadTimer <= 0 &&
        def.ammoType &&
        (bot.inventory.ammo[def.ammoType] ?? 0) > 0
      ) {
        bot.reloadSlot = weaponChoice.slotIndex;
        bot.reloadTimer = def.reloadTime;
        bot.burstQueue = 0;
      }
      return bestDist > 6
        ? moveTowardPoint(bot, bestBarrel.x, bestBarrel.z, safeDt, 10)
        : emptyMoveIntent();
    }

    const hasLOS = bestDist <= 2.8 || ctx.hasLineOfSight(eye, aimPoint);
    if (!hasLOS) {
      return moveTowardPoint(bot, bestBarrel.x, bestBarrel.z, safeDt, 10);
    }

    const yawDiff = Math.abs(normalizeAngle(targetYaw - bot.yaw));
    bot.isAiming = bestDist > 6;
    if (yawDiff <= 0.55 && bot.fireCooldown <= 0 && bot.reloadTimer <= 0) {
      const dmg = Math.max(
        1,
        Math.round(def.baseDamage * (RARITY_MULTIPLIER[item.rarity] ?? 1)),
      );
      const res = ctx.damageSlurpBarrel(bestBarrel.id, dmg);
      item.magAmmo = Math.max(0, item.magAmmo - 1);
      bot.isFiring = true;
      bot.recoilKick = 0.85;
      bot.fireCooldown = 1 / Math.max(0.5, def.fireRate * profile.fireRateScale);

      ctx.eventBus.emit('vfx:tracer', { from: eye, to: aimPoint });
      ctx.eventBus.emit('vfx:impact', {
        position: aimPoint,
        normal: { x: 0, y: 1, z: 0 },
        material: 'shield',
      });
      ctx.eventBus.emit('audio:noise', {
        position: { ...bot.position },
        kind: 'gunfire',
        sourceId: bot.id,
        radius: 48,
      });

      if (res?.destroyed) {
        bot.shield = Math.min(bot.maxShield, bot.shield + res.shieldAmount);
        ctx.eventBus.emit('vfx:slurp_burst', {
          position: { ...res.position },
          radius: 3.5,
        });
        ctx.eventBus.emit('sound:play', {
          id: 'slurp_barrel_break',
          position: { ...res.position },
          spatial: true,
        });
      }
    }

    return bestDist > 9
      ? moveTowardPoint(bot, bestBarrel.x, bestBarrel.z, safeDt, 12)
      : emptyMoveIntent();
  }

  bot.inventory.activeSlot = 0;
  if (bestDist <= 3.2) {
    if (bot.harvestCooldown <= 0 && bot.fireCooldown <= 0) {
      const res = ctx.damageSlurpBarrel(bestBarrel.id, WEAPONS.pickaxe.structureDamage);
      bot.harvestSwingTimer = 0.4;
      bot.harvestCooldown = 1 / WEAPONS.pickaxe.fireRate;
      bot.fireCooldown = 1 / WEAPONS.pickaxe.fireRate;
      bot.isFiring = true;

      ctx.eventBus.emit('vfx:impact', {
        position: aimPoint,
        normal: { x: 0, y: 1, z: 0 },
        material: 'shield',
      });

      if (res?.destroyed) {
        bot.shield = Math.min(bot.maxShield, bot.shield + res.shieldAmount);
        ctx.eventBus.emit('vfx:slurp_burst', {
          position: { ...res.position },
          radius: 3.5,
        });
        ctx.eventBus.emit('sound:play', {
          id: 'slurp_barrel_break',
          position: { ...res.position },
          spatial: true,
        });
      }
    }
    return emptyMoveIntent();
  }

  return moveTowardPoint(bot, bestBarrel.x, bestBarrel.z, safeDt, 10);
}

function tryCampfireHealing(
  bot: BotEntity,
  ctx: BotWorldContext,
  combatMatch: { target: BotCombatTarget; hasLOS: boolean; distance: number } | null,
  needRotateStorm: boolean,
  safeDt: number,
  isFarLOD: boolean,
): MoveIntent | null {
  if (isFarLOD || !ctx.getCampfires) return null;
  if (
    combatMatch !== null ||
    bot.state === 'combat' ||
    bot.state === 'healing' ||
    needRotateStorm
  ) {
    bot.campfireTargetId = null;
    return null;
  }

  const campfires = ctx.getCampfires();
  if (!campfires || campfires.length === 0) {
    bot.campfireTargetId = null;
    return null;
  }

  let chosen: CampfireEntity | null = null;
  if (bot.campfireTargetId) {
    const existing = campfires.find((c) => c.id === bot.campfireTargetId);
    if (
      existing &&
      existing.remainingSec > 0 &&
      bot.hp < Math.min(bot.maxHp, 85) &&
      dist2D(bot.position.x, bot.position.z, existing.x, existing.z) <= 18 &&
      Math.abs(existing.y - bot.position.y) <= 4.5 &&
      !isInVolcanoLavaHazard(existing.x, existing.z)
    ) {
      chosen = existing;
    } else {
      bot.campfireTargetId = null;
    }
  }

  if (!chosen && bot.hp < 65 && bot.hp < bot.maxHp) {
    let bestScore = Infinity;
    for (const cf of campfires) {
      if (cf.remainingSec <= 0) continue;
      if (Math.abs(cf.y - bot.position.y) > 4.5) continue;
      if (isInVolcanoLavaHazard(cf.x, cf.z)) continue;
      const d = dist2D(bot.position.x, bot.position.z, cf.x, cf.z);
      if (d > 16) continue;
      const score = d - (cf.lit ? 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        chosen = cf;
      }
    }
    if (chosen) {
      bot.campfireTargetId = chosen.id;
    }
  }

  if (!chosen) return null;

  const d = dist2D(bot.position.x, bot.position.z, chosen.x, chosen.z);
  const healRadius = chosen.radius > 0 ? chosen.radius : 5.5;

  if (!chosen.lit && d <= 3.6 && ctx.igniteCampfire) {
    const ignited = ctx.igniteCampfire(chosen.id);
    if (ignited) {
      ctx.eventBus.emit('sound:play', {
        id: 'campfire_ignite',
        position: { x: chosen.x, y: chosen.y, z: chosen.z },
        spatial: true,
      });
    }
  }

  if (chosen.lit && chosen.remainingSec > 0 && d <= healRadius) {
    const healRate = chosen.healPerSec > 0 ? chosen.healPerSec : 3;
    bot.hp = Math.min(bot.maxHp, bot.hp + healRate * safeDt);
    if (d > Math.min(3.2, healRadius * 0.7)) {
      bot.isCrouching = false;
      return moveTowardPoint(bot, chosen.x, chosen.z, safeDt, 12);
    }
    const dx = chosen.x - bot.position.x;
    const dz = chosen.z - bot.position.z;
    if (Math.hypot(dx, dz) > 0.4) {
      bot.yaw = lerpAngle(bot.yaw, Math.atan2(dx, dz), clamp(6 * safeDt, 0, 1));
    }
    bot.isSprinting = false;
    bot.isCrouching = true;
    return emptyMoveIntent();
  }

  bot.isCrouching = false;
  return moveTowardPoint(bot, chosen.x, chosen.z, safeDt, 10);
}

/**
 * Selects an active `RiftEntity` within 24m for a bot escaping Storm or critical burst damage.
 */
export function selectEscapeRift(
  bot: Pick<
    BotEntity,
    | 'position'
    | 'hp'
    | 'maxHp'
    | 'shield'
    | 'state'
    | 'isBoss'
    | 'lastDamageTime'
    | 'recentDamageTaken'
    | 'retreatTimer'
    | 'riftCooldown'
    | 'riftTargetId'
    | 'ignoredTargetId'
    | 'ignoredTargetUntil'
  >,
  rifts: ReadonlyArray<RiftEntity>,
  inStormNow: boolean,
  elapsed: number,
): RiftEntity | null {
  if (
    (bot.riftCooldown ?? 0) > 0 ||
    rifts.length === 0 ||
    bot.state === 'bus' ||
    bot.state === 'skydiving' ||
    bot.state === 'gliding' ||
    bot.state === 'eliminated'
  ) {
    return null;
  }
  if (bot.isBoss && !inStormNow) {
    return null;
  }

  const maxHp = bot.maxHp || 100;
  const recentWindow = bot.riftTargetId ? 5.0 : 3.5;
  const recentlyBurstDamaged =
    bot.lastDamageTime >= 0 &&
    elapsed - bot.lastDamageTime <= recentWindow &&
    (bot.recentDamageTaken ?? 0) >= 35;
  const criticallyInjured =
    bot.hp <= maxHp * 0.45 ||
    (bot.hp <= maxHp * 0.6 && bot.shield <= 15);
  const isRetreating = (bot.retreatTimer ?? 0) > 0;
  const shouldEscape =
    inStormNow ||
    (recentlyBurstDamaged &&
      (criticallyInjured || isRetreating || bot.state === 'healing')) ||
    (isRetreating && criticallyInjured);
  if (!shouldEscape) return null;

  let best: RiftEntity | null = null;
  let bestDist = Infinity;
  for (const rift of rifts) {
    if (!rift.active) continue;
    if (rift.id === bot.ignoredTargetId && elapsed < bot.ignoredTargetUntil) continue;
    if (Math.abs(rift.y - bot.position.y) > 10) continue;
    if (isInVolcanoLavaHazard(rift.x, rift.z)) continue;
    const d = dist2D(bot.position.x, bot.position.z, rift.x, rift.z);
    const maxRange = bot.riftTargetId === rift.id ? 28 : 24;
    if (d > maxRange) continue;
    if (d < bestDist) {
      bestDist = d;
      best = rift;
    }
  }
  return best;
}

function executeRiftWarp(
  bot: BotEntity,
  ctx: BotWorldContext,
  rift: RiftEntity,
): boolean {
  if (!ctx.triggerRift) return false;
  const res = ctx.triggerRift(rift.id);
  if (!res) {
    bot.riftTargetId = null;
    return false;
  }

  const safeDest = pickSafeDestination(bot, ctx);
  const dx = safeDest.x - res.skyPos.x;
  const dz = safeDest.z - res.skyPos.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;

  bot.position = {
    x: res.skyPos.x,
    y: res.skyPos.y,
    z: res.skyPos.z,
  };
  bot.velocity = {
    x: nx * GLIDE_HORIZONTAL_SPEED,
    y: -GLIDE_DESCENT_SPEED * 0.5,
    z: nz * GLIDE_HORIZONTAL_SPEED,
  };
  bot.yaw = Math.atan2(nx, nz);
  bot.dropTarget = { ...safeDest };
  bot.moveTarget = { ...safeDest };
  bot.state = 'gliding';
  bot.animState = 'glide';
  bot.gliderOpen = true;
  bot.gliderFactor = 0.35;
  bot.grounded = false;
  bot.isCrouching = false;
  bot.isSprinting = false;
  bot.isBuilding = false;
  bot.isAiming = false;
  bot.isFiring = false;
  bot.healTimer = 0;
  bot.retreatTimer = 0;
  bot.burstQueue = 0;
  bot.stateTimer = 0;
  bot.riftCooldown = 20.0;
  bot.riftTargetId = null;
  bot.captureTargetId = null;
  bot.stuckTimer = 0;
  bot.lastStuckCheckPos = { ...bot.position };

  ctx.eventBus.emit('vfx:rift_tear', {
    position: { x: rift.x, y: rift.y, z: rift.z },
    skyPosition: { ...res.skyPos },
  });
  ctx.eventBus.emit('sound:play', {
    id: 'rift_teleport',
    position: { x: rift.x, y: rift.y, z: rift.z },
    spatial: true,
  });
  return true;
}

function tryRiftEscape(
  bot: BotEntity,
  ctx: BotWorldContext,
  inStormNow: boolean,
  elapsed: number,
  safeDt: number,
): (MoveIntent & { warpedGliding?: boolean }) | null {
  if ((bot.riftCooldown ?? 0) > 0 || !ctx.getRifts || !ctx.triggerRift) {
    bot.riftTargetId = null;
    return null;
  }

  const rifts = ctx.getRifts();
  if (!rifts || rifts.length === 0) {
    bot.riftTargetId = null;
    return null;
  }

  const chosen = selectEscapeRift(bot, rifts, inStormNow, elapsed);
  if (!chosen) {
    bot.riftTargetId = null;
    return null;
  }

  const d = dist2D(bot.position.x, bot.position.z, chosen.x, chosen.z);
  const dy = Math.abs(bot.position.y - chosen.y);
  if (d <= 2.5 && dy <= 4.0) {
    if (executeRiftWarp(bot, ctx, chosen)) {
      return { ...emptyMoveIntent(), warpedGliding: true };
    }
    return null;
  }

  bot.riftTargetId = chosen.id;
  bot.captureTargetId = null;
  bot.moveTarget = { x: chosen.x, y: chosen.y, z: chosen.z };
  if (bot.state === 'healing' || bot.state === 'combat') {
    bot.healTimer = 0;
    bot.state = 'rotating';
    bot.stateTimer = 0;
  }
  bot.isCrouching = false;
  const intent = moveTowardPoint(bot, chosen.x, chosen.z, safeDt, 0);
  bot.isSprinting = true;
  intent.speed = SPRINT_SPEED;
  return intent;
}

/**
 * Selects an uncaptured `CapturePointEntity` within 35m for roaming/looting bots.
 */
export function selectCapturePointTarget(
  bot: Pick<
    BotEntity,
    | 'position'
    | 'state'
    | 'isBoss'
    | 'captureTargetId'
    | 'ignoredTargetId'
    | 'ignoredTargetUntil'
  >,
  capturePoints: ReadonlyArray<CapturePointEntity>,
  elapsed: number,
): CapturePointEntity | null {
  if (
    bot.isBoss ||
    bot.state === 'bus' ||
    bot.state === 'skydiving' ||
    bot.state === 'gliding' ||
    bot.state === 'combat' ||
    bot.state === 'healing' ||
    bot.state === 'eliminated' ||
    capturePoints.length === 0
  ) {
    return null;
  }

  let best: CapturePointEntity | null = null;
  let bestScore = Infinity;
  for (const cp of capturePoints) {
    if (cp.captured) continue;
    if (cp.id === bot.ignoredTargetId && elapsed < bot.ignoredTargetUntil) continue;
    if (Math.abs(cp.y - bot.position.y) > 8.0) continue;
    if (isInVolcanoLavaHazard(cp.x, cp.z)) continue;
    const d = dist2D(bot.position.x, bot.position.z, cp.x, cp.z);
    const maxRange = bot.captureTargetId === cp.id ? 38 : 35;
    if (d > maxRange) continue;
    const score = d - (cp.id === bot.captureTargetId ? 4 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = cp;
    }
  }
  return best;
}

function tryCapturePoint(
  bot: BotEntity,
  ctx: BotWorldContext,
  combatMatch: { target: BotCombatTarget; hasLOS: boolean; distance: number } | null,
  inStormNow: boolean,
  needRotateStorm: boolean,
  elapsed: number,
  safeDt: number,
  isFarLOD: boolean,
): MoveIntent | null {
  if (
    isFarLOD ||
    !ctx.getCapturePoints ||
    !ctx.advanceCapturePoint ||
    combatMatch !== null ||
    bot.state === 'combat' ||
    bot.state === 'healing' ||
    inStormNow ||
    needRotateStorm ||
    bot.isBoss
  ) {
    bot.captureTargetId = null;
    return null;
  }

  const points = ctx.getCapturePoints();
  if (!points || points.length === 0) {
    bot.captureTargetId = null;
    return null;
  }

  const chosen = selectCapturePointTarget(bot, points, elapsed);
  if (!chosen) {
    bot.captureTargetId = null;
    return null;
  }

  bot.captureTargetId = chosen.id;
  bot.harvestTargetId = null;
  bot.moveTarget = { x: chosen.x, y: chosen.y, z: chosen.z };
  bot.isCrouching = false;

  const d = dist2D(bot.position.x, bot.position.z, chosen.x, chosen.z);
  const captureRadius = chosen.radius > 0 ? chosen.radius : 6.5;

  if (d <= captureRadius && Math.abs(bot.position.y - chosen.y) <= 4.5) {
    const res = ctx.advanceCapturePoint(chosen.id, bot.id, bot.name, safeDt);
    if (res.capturedNow) {
      ctx.eventBus.emit('vfx:flag_captured', {
        position: { x: chosen.x, y: chosen.y, z: chosen.z },
        poiName: res.poiName || chosen.poiName,
      });
      ctx.eventBus.emit('sound:play', {
        id: 'flag_captured',
        position: { x: chosen.x, y: chosen.y, z: chosen.z },
        spatial: true,
      });
      bot.captureTargetId = null;
      bot.moveTarget = null;
      return emptyMoveIntent();
    }

    if (d > Math.min(2.4, captureRadius * 0.4)) {
      const intent = moveTowardPoint(bot, chosen.x, chosen.z, safeDt, 16);
      intent.speed = Math.min(intent.speed, WALK_SPEED);
      bot.isSprinting = false;
      return intent;
    }

    bot.isSprinting = false;
    return emptyMoveIntent();
  }

  return moveTowardPoint(bot, chosen.x, chosen.z, safeDt, 12);
}

function resolveEffectivePlayerPos(
  ctx: BotWorldContext,
  playerPos?: Vec3Like,
): Vec3Like | null {
  if (playerPos) return playerPos;
  const playerTarget = ctx
    .getCombatTargets()
    .find((t) => (t.alive || t.isKnocked) && (t.isPlayer || t.id === 'player'));
  return playerTarget ? playerTarget.position : null;
}

function pickAllyFollowSpot(
  bot: BotEntity,
  ctx: BotWorldContext,
  playerPos: Vec3Like,
  desiredDist = 6.5,
): Vec3Like {
  const baseAngle = bot.patrolAngle;
  const candidateAngles = [
    baseAngle,
    baseAngle + Math.PI * 0.5,
    baseAngle - Math.PI * 0.5,
    baseAngle + Math.PI,
  ];
  for (const ang of candidateAngles) {
    const x = clamp(
      playerPos.x + Math.cos(ang) * desiredDist,
      -WORLD_HALF + 8,
      WORLD_HALF - 8,
    );
    const z = clamp(
      playerPos.z + Math.sin(ang) * desiredDist,
      -WORLD_HALF + 8,
      WORLD_HALF - 8,
    );
    if (
      !ctx.terrain.isWater(x, z) &&
      !isInVolcanoLavaHazard(x, z, VOLCANO_LAVA_SAFE_RADIUS + 2)
    ) {
      return { x, y: ctx.terrain.getHeightAt(x, z), z };
    }
  }
  const safe = clampOutsideVolcanoLava(
    playerPos.x,
    playerPos.z,
    VOLCANO_LAVA_SAFE_RADIUS + 2,
  );
  const cx = clamp(safe.x, -WORLD_HALF + 8, WORLD_HALF - 8);
  const cz = clamp(safe.z, -WORLD_HALF + 8, WORLD_HALF - 8);
  return { x: cx, y: ctx.terrain.getHeightAt(cx, cz), z: cz };
}

function stepAllySupportAbility(
  bot: BotEntity,
  ctx: BotWorldContext,
  onAllySupport?: (event: AllySupportEvent) => void,
): void {
  if (!bot.isAlly || (bot.allyAbilityCooldown ?? 0) > 0) return;

  if (bot.allyRole === 'scout') {
    const hasHostileNearby = ctx.getCombatTargets().some(
      (t) =>
        t.alive &&
        t.id !== bot.id &&
        !t.isPlayer &&
        t.id !== 'player' &&
        !t.isAlly &&
        dist3D(bot.position, t.position) <= ALLY_SCOUT_PING_RANGE,
    );
    if (!hasHostileNearby) return;

    bot.allyAbilityCooldown = ALLY_SCOUT_PING_COOLDOWN;
    const ev: AllySupportEvent = {
      kind: 'scout_ping',
      position: { ...bot.position },
    };
    onAllySupport?.(ev);
    ctx.onAllySupportEvent?.(ev);
    ctx.eventBus.emit('sound:play', {
      id: 'tactical_ping',
      position: { ...bot.position },
      spatial: true,
    });
    return;
  }

  if (bot.allyRole === 'medic') {
    const hpGain = Math.min(ALLY_MEDIC_HEAL_AMOUNT, Math.max(0, bot.maxHp - bot.hp));
    const shieldGain = Math.min(
      ALLY_MEDIC_HEAL_AMOUNT - hpGain,
      Math.max(0, bot.maxShield - bot.shield),
    );
    bot.hp = Math.min(bot.maxHp, bot.hp + hpGain);
    bot.shield = Math.min(bot.maxShield, bot.shield + shieldGain);

    bot.allyAbilityCooldown = ALLY_MEDIC_HEAL_COOLDOWN;
    const ev: AllySupportEvent = {
      kind: 'medic_heal',
      position: { ...bot.position },
      amount: ALLY_MEDIC_HEAL_AMOUNT,
    };
    onAllySupport?.(ev);
    ctx.onAllySupportEvent?.(ev);
    ctx.eventBus.emit('vfx:splash_heal', {
      position: { ...bot.position },
      radius: 6.5,
    });
    ctx.eventBus.emit('sound:play', {
      id: 'splash_heal',
      position: { ...bot.position },
      spatial: true,
    });
  }
}

function stepAllyFollowPlayer(
  bot: BotEntity,
  playerPos: Vec3Like,
  safeDt: number,
): MoveIntent {
  bot.isCrouching = false;
  const bestSlot = selectBestWeaponForDistance(bot.inventory.items, 25, bot.inventory.ammo);
  if (bestSlot) {
    bot.inventory.activeSlot = bestSlot.slotIndex;
  }

  const dx = playerPos.x - bot.position.x;
  const dz = playerPos.z - bot.position.z;
  const dist = Math.hypot(dx, dz);

  if (dist > ALLY_LEASH_MAX) {
    const intent = moveTowardPoint(bot, playerPos.x, playerPos.z, safeDt, 0);
    bot.isSprinting = true;
    intent.speed = dist > 22 ? 8.2 : SPRINT_SPEED;
    return intent;
  }

  if (dist > 10.5) {
    const intent = moveTowardPoint(bot, playerPos.x, playerPos.z, safeDt, 20);
    bot.isSprinting = false;
    intent.speed = RUN_SPEED;
    return intent;
  }

  if (dist < ALLY_LEASH_MIN) {
    let awayX: number;
    let awayZ: number;
    if (dist > 0.05) {
      awayX = -dx / dist;
      awayZ = -dz / dist;
    } else {
      awayX = Math.cos(bot.patrolAngle);
      awayZ = Math.sin(bot.patrolAngle);
    }
    bot.yaw = lerpAngle(bot.yaw, Math.atan2(awayX, awayZ), clamp(8 * safeDt, 0, 1));
    bot.isSprinting = false;
    return {
      dirX: awayX,
      dirZ: awayZ,
      speed: WALK_SPEED,
      wantsJump: false,
    };
  }

  bot.isSprinting = false;
  return emptyMoveIntent();
}

function enforceAllyCombatLeash(
  bot: BotEntity,
  playerPos: Vec3Like,
  intent: MoveIntent,
): MoveIntent {
  const dx = playerPos.x - bot.position.x;
  const dz = playerPos.z - bot.position.z;
  const dist = Math.hypot(dx, dz);

  if (dist > ALLY_LEASH_MAX) {
    // Keep bot.yaw aimed at enemy while pulling back inside the 16m leash
    const dirX = dx / dist;
    const dirZ = dz / dist;
    bot.isCrouching = false;
    bot.isSprinting = dist > 19;
    return {
      dirX,
      dirZ,
      speed: dist > 19 ? SPRINT_SPEED : RUN_SPEED,
      wantsJump: intent.wantsJump,
    };
  }

  if (dist < ALLY_LEASH_MIN) {
    const towardX = dist > 0.05 ? dx / dist : Math.cos(bot.patrolAngle);
    const towardZ = dist > 0.05 ? dz / dist : Math.sin(bot.patrolAngle);
    const inwardDot = intent.dirX * towardX + intent.dirZ * towardZ;
    if (inwardDot > 0 || (dist < 4.5 && intent.speed < 0.2)) {
      return {
        dirX: -towardX,
        dirZ: -towardZ,
        speed: WALK_SPEED,
        wantsJump: intent.wantsJump,
      };
    }
  }

  return intent;
}

function emitReviveBeamAndTick(
  ctx: BotWorldContext,
  pos: Vec3Like,
  prevProg: number,
  newProg: number,
): void {
  const prevStep = Math.floor(prevProg * 4);
  const newStep = Math.floor(newProg * 4);
  if (prevProg === 0 || newStep > prevStep) {
    ctx.eventBus.emit('vfx:revive_beam', {
      position: { ...pos },
      progress: newProg,
    });
    ctx.eventBus.emit('sound:play', {
      id: 'revive_tick',
      position: { ...pos },
      spatial: true,
    });
  }
}

function stepKnockedBot(
  bot: BotEntity,
  ctx: BotWorldContext,
  effectivePlayerPos: Vec3Like | null,
  squadmates: ReadonlyArray<BotEntity>,
  safeDt: number,
  isFarLOD: boolean,
): void {
  bot.isKnocked = true;
  bot.state = 'knocked';
  bot.isFiring = false;
  bot.isAiming = false;
  bot.isBuilding = false;
  bot.isSprinting = false;
  bot.isCrouching = false;
  bot.isReviving = false;
  bot.reviveProgress = 0;
  bot.reviveTargetId = null;
  bot.burstQueue = 0;
  bot.reloadTimer = 0;
  bot.healTimer = 0;

  if (bot.bleedOutHp === undefined) {
    bot.bleedOutHp = Math.min(DBNO_MAX_HP, Math.max(1, bot.hp || DBNO_MAX_HP));
  }

  const mateReviving = squadmates.some(
    (m) =>
      m.id !== bot.id &&
      m.alive &&
      !m.isKnocked &&
      (m.isReviving || m.state === 'reviving') &&
      m.reviveTargetId === bot.id,
  );
  const playerReviving = Boolean(bot.isDuoPartner && ctx.playerRevivingPartner);
  if (!mateReviving && !playerReviving) {
    bot.bleedOutHp = Math.max(0, bot.bleedOutHp - DBNO_BLEED_DPS * safeDt);
    bot.hp = bot.bleedOutHp;
  }

  let intent = emptyMoveIntent();
  let crawlToward: Vec3Like | null = null;
  if (bot.isDuoPartner && effectivePlayerPos) {
    crawlToward = effectivePlayerPos;
  } else {
    let bestMateDist = Infinity;
    for (const mate of squadmates) {
      if (
        mate.id === bot.id ||
        !mate.alive ||
        mate.isKnocked ||
        mate.state === 'knocked' ||
        mate.state === 'eliminated'
      ) {
        continue;
      }
      const d = dist2D(bot.position.x, bot.position.z, mate.position.x, mate.position.z);
      if (d < bestMateDist) {
        bestMateDist = d;
        crawlToward = mate.position;
      }
    }
  }

  if (crawlToward) {
    const dx = crawlToward.x - bot.position.x;
    const dz = crawlToward.z - bot.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.0) {
      const dirX = dx / d;
      const dirZ = dz / d;
      bot.yaw = lerpAngle(bot.yaw, Math.atan2(dirX, dirZ), clamp(6 * safeDt, 0, 1));
      intent = { dirX, dirZ, speed: KNOCKED_CRAWL_SPEED, wantsJump: false };
    }
  } else {
    let threatPos = bot.lastKnownEnemyPos;
    if (!threatPos) {
      let bestEnemyDist = 35;
      for (const t of ctx.getCombatTargets()) {
        if (!t.alive || t.isKnocked || isFriendlyTarget(bot, t, squadmates)) continue;
        const d = dist2D(bot.position.x, bot.position.z, t.position.x, t.position.z);
        if (d < bestEnemyDist) {
          bestEnemyDist = d;
          threatPos = t.position;
        }
      }
    }
    if (threatPos) {
      const awayX = bot.position.x - threatPos.x;
      const awayZ = bot.position.z - threatPos.z;
      const awayD = Math.hypot(awayX, awayZ);
      if (awayD > 0.05) {
        const dirX = awayX / awayD;
        const dirZ = awayZ / awayD;
        bot.yaw = lerpAngle(bot.yaw, Math.atan2(dirX, dirZ), clamp(6 * safeDt, 0, 1));
        intent = { dirX, dirZ, speed: KNOCKED_CRAWL_SPEED, wantsJump: false };
      }
    }
  }

  intent = applyVolcanoLavaAvoidance(bot, intent);
  bot.isSprinting = false;
  bot.isCrouching = false;
  applyMovementStep(
    bot,
    ctx,
    intent.dirX,
    intent.dirZ,
    Math.min(intent.speed, KNOCKED_CRAWL_SPEED),
    false,
    safeDt,
    isFarLOD,
  );
  updateAnimState(bot);
}

function stepDuoPartnerRevive(
  bot: BotEntity,
  ctx: BotWorldContext,
  effectivePlayerPos: Vec3Like | null,
  safeDt: number,
  isFarLOD: boolean,
  onPlayerRevived?: (reviverId: string) => void,
): boolean {
  if (!ctx.playerKnocked) {
    playerReviveCompletedLatch.delete(bot);
    if (bot.reviveTargetId === 'player') {
      bot.isReviving = false;
      bot.reviveProgress = 0;
      bot.reviveTargetId = null;
      if (bot.state === 'reviving') bot.state = 'rotating';
    }
    return false;
  }

  if (playerReviveCompletedLatch.get(bot) || !effectivePlayerPos) {
    return false;
  }

  const d = dist2D(
    bot.position.x,
    bot.position.z,
    effectivePlayerPos.x,
    effectivePlayerPos.z,
  );
  const dy = Math.abs(bot.position.y - effectivePlayerPos.y);

  if (d <= REVIVE_REACH_DIST && dy <= 3.5) {
    bot.state = 'reviving';
    bot.isReviving = true;
    bot.reviveTargetId = 'player';
    bot.isSprinting = false;
    bot.isCrouching = false;
    bot.isFiring = false;
    bot.isAiming = false;
    bot.burstQueue = 0;
    bot.reloadTimer = 0;
    bot.healTimer = 0;

    const dx = effectivePlayerPos.x - bot.position.x;
    const dz = effectivePlayerPos.z - bot.position.z;
    if (Math.hypot(dx, dz) > 0.05) {
      bot.yaw = lerpAngle(bot.yaw, Math.atan2(dx, dz), clamp(10 * safeDt, 0, 1));
    }

    const prevProg = bot.reviveProgress ?? 0;
    const nextProg = clamp(prevProg + safeDt / REVIVE_DURATION_SEC, 0, 1);
    bot.reviveProgress = nextProg;
    emitReviveBeamAndTick(ctx, effectivePlayerPos, prevProg, nextProg);

    if (nextProg >= 1 - 1e-6) {
      bot.reviveProgress = 0;
      bot.isReviving = false;
      bot.reviveTargetId = null;
      bot.state = 'rotating';
      playerReviveCompletedLatch.set(bot, true);
      ctx.eventBus.emit('sound:play', {
        id: 'revive_complete',
        position: { ...effectivePlayerPos },
        spatial: true,
      });
      ctx.eventBus.emit('vfx:revive_beam', {
        position: { ...effectivePlayerPos },
        progress: 1,
      });
      if (onPlayerRevived) {
        onPlayerRevived(bot.id);
      } else {
        ctx.onPlayerRevived?.(bot.id);
      }
    }

    applyMovementStep(bot, ctx, 0, 0, 0, false, safeDt, isFarLOD);
    updateAnimState(bot);
    return true;
  }

  if (bot.isReviving && bot.reviveTargetId === 'player') {
    bot.isReviving = false;
    bot.reviveProgress = 0;
    bot.reviveTargetId = null;
    if (bot.state === 'reviving') bot.state = 'rotating';
  }

  let intent = moveTowardPoint(
    bot,
    effectivePlayerPos.x,
    effectivePlayerPos.z,
    safeDt,
    0,
  );
  bot.isSprinting = true;
  intent.speed = SPRINT_SPEED;
  intent = applyVolcanoLavaAvoidance(bot, intent);
  applyMovementStep(
    bot,
    ctx,
    intent.dirX,
    intent.dirZ,
    intent.speed,
    intent.wantsJump,
    safeDt,
    isFarLOD,
  );
  updateAnimState(bot);
  return true;
}

function isSafeToReviveSquadmate(
  bot: BotEntity,
  ctx: BotWorldContext,
  squadmates: ReadonlyArray<BotEntity>,
  elapsed: number,
  isFarLOD: boolean,
): boolean {
  const eye = getBotEyePos(bot);
  const recentlyHit =
    bot.lastDamageTime >= 0 && elapsed - bot.lastDamageTime < 2.0;

  for (const t of ctx.getCombatTargets()) {
    if (!t.alive || t.isKnocked || isFriendlyTarget(bot, t, squadmates)) continue;
    const d = dist3D(bot.position, t.position);
    if (d <= 10) return false;
    if (d <= SQUAD_UNSAFE_ENEMY_DIST) {
      if (isFarLOD || ctx.hasLineOfSight(eye, t.eyePos)) {
        return false;
      }
    }
    if (recentlyHit && d <= 28 && (!isFarLOD && ctx.hasLineOfSight(eye, t.eyePos))) {
      return false;
    }
  }
  return true;
}

function stepSquadmateRevive(
  bot: BotEntity,
  ctx: BotWorldContext,
  squadmates: ReadonlyArray<BotEntity>,
  elapsed: number,
  safeDt: number,
  isFarLOD: boolean,
): boolean {
  const knockedMate = squadmates.find(
    (m) =>
      m.id !== bot.id &&
      m.alive &&
      (m.isKnocked || m.state === 'knocked') &&
      dist2D(bot.position.x, bot.position.z, m.position.x, m.position.z) <= SQUAD_REVIVE_RANGE,
  );

  if (!knockedMate) {
    if (bot.isReviving || bot.state === 'reviving') {
      bot.isReviving = false;
      bot.reviveProgress = 0;
      bot.reviveTargetId = null;
      if (bot.state === 'reviving') bot.state = 'rotating';
    }
    return false;
  }

  if (!isSafeToReviveSquadmate(bot, ctx, squadmates, elapsed, isFarLOD)) {
    if (bot.isReviving || bot.state === 'reviving') {
      bot.isReviving = false;
      bot.reviveProgress = 0;
      bot.reviveTargetId = null;
      if (bot.state === 'reviving') bot.state = 'combat';
    }
    return false;
  }

  const d = dist2D(
    bot.position.x,
    bot.position.z,
    knockedMate.position.x,
    knockedMate.position.z,
  );
  const dy = Math.abs(bot.position.y - knockedMate.position.y);

  if (d <= REVIVE_REACH_DIST && dy <= 3.0) {
    if (bot.reviveTargetId && bot.reviveTargetId !== knockedMate.id) {
      bot.reviveProgress = 0;
    }
    bot.state = 'reviving';
    bot.isReviving = true;
    bot.reviveTargetId = knockedMate.id;
    bot.isSprinting = false;
    bot.isCrouching = false;
    bot.isFiring = false;
    bot.isAiming = false;
    bot.burstQueue = 0;
    bot.reloadTimer = 0;
    bot.healTimer = 0;

    const dx = knockedMate.position.x - bot.position.x;
    const dz = knockedMate.position.z - bot.position.z;
    if (Math.hypot(dx, dz) > 0.05) {
      bot.yaw = lerpAngle(bot.yaw, Math.atan2(dx, dz), clamp(10 * safeDt, 0, 1));
    }

    const prevProg = bot.reviveProgress ?? 0;
    const nextProg = clamp(prevProg + safeDt / REVIVE_DURATION_SEC, 0, 1);
    bot.reviveProgress = nextProg;
    emitReviveBeamAndTick(ctx, knockedMate.position, prevProg, nextProg);

    if (nextProg >= 1 - 1e-6) {
      knockedMate.isKnocked = false;
      knockedMate.bleedOutHp = undefined;
      knockedMate.hp = Math.min(knockedMate.maxHp, 30);
      knockedMate.state = 'rotating';
      knockedMate.animState = 'idle';
      knockedMate.isReviving = false;
      knockedMate.reviveProgress = 0;
      knockedMate.reviveTargetId = null;
      knockedMate.isCrouching = false;

      bot.reviveProgress = 0;
      bot.isReviving = false;
      bot.reviveTargetId = null;
      bot.state = 'rotating';

      ctx.eventBus.emit('sound:play', {
        id: 'revive_complete',
        position: { ...knockedMate.position },
        spatial: true,
      });
      ctx.eventBus.emit('vfx:revive_beam', {
        position: { ...knockedMate.position },
        progress: 1,
      });
    }

    applyMovementStep(bot, ctx, 0, 0, 0, false, safeDt, isFarLOD);
    updateAnimState(bot);
    return true;
  }

  if (bot.isReviving || bot.reviveTargetId !== null) {
    bot.isReviving = false;
    bot.reviveProgress = 0;
    bot.reviveTargetId = null;
    if (bot.state === 'reviving') bot.state = 'rotating';
  }

  let intent = moveTowardPoint(
    bot,
    knockedMate.position.x,
    knockedMate.position.z,
    safeDt,
    0,
  );
  bot.isSprinting = true;
  intent.speed = SPRINT_SPEED;
  intent = applyVolcanoLavaAvoidance(bot, intent);
  applyMovementStep(
    bot,
    ctx,
    intent.dirX,
    intent.dirZ,
    intent.speed,
    intent.wantsJump,
    safeDt,
    isFarLOD,
  );
  updateAnimState(bot);
  return true;
}

/**
 * Advances a single bot's state machine, physics, perception, combat, building, and animations.
 */
export function updateBot(
  bot: BotEntity,
  ctx: BotWorldContext,
  difficulty: Difficulty,
  busPos: Vec3Like,
  elapsed: number,
  dt: number,
  isFarLOD: boolean,
  gameMode?: GameModeId,
  playerPos?: Vec3Like,
  onAllySupport?: (event: AllySupportEvent) => void,
  onPlayerRevived?: (reviverId: string) => void,
  squadmates?: ReadonlyArray<BotEntity>,
  medallionHolderIds?: ReadonlySet<string>,
): void {
  const effectiveMode: GameModeId = gameMode ?? ctx.gameMode ?? 'solo';
  const isKnockedState = bot.state === 'knocked' || Boolean(bot.isKnocked);
  const effectiveHp = isKnockedState ? (bot.bleedOutHp ?? bot.hp) : bot.hp;
  if (!bot.alive || effectiveHp <= 0 || bot.state === 'eliminated') {
    bot.alive = false;
    bot.hp = 0;
    bot.isKnocked = false;
    bot.isReviving = false;
    bot.reviveProgress = 0;
    bot.reviveTargetId = null;
    bot.state = 'eliminated';
    bot.moveSpeed = 0;
    bot.isFiring = false;
    bot.isAiming = false;
    bot.isBuilding = false;
    bot.gliderOpen = false;
    return;
  }

  const safeDt = clamp(dt, 0, 0.1);
  if (safeDt <= 0) return;

  const isPlayerCompanion = Boolean(bot.isAlly || bot.isDuoPartner);
  const effectiveSquadmates =
    squadmates ?? (bot.squadId ? ctx.getSquadmates?.(bot.squadId) : undefined) ?? [];

  // Decay transient timers
  bot.isFiring = false;
  bot.isAiming = false;
  bot.stateTimer += safeDt;
  if (bot.fireCooldown > 0) bot.fireCooldown = Math.max(0, bot.fireCooldown - safeDt);
  if (bot.buildCooldown > 0) bot.buildCooldown = Math.max(0, bot.buildCooldown - safeDt);
  if (bot.jumpCooldown > 0) bot.jumpCooldown = Math.max(0, bot.jumpCooldown - safeDt);
  if (bot.reactionTimer > 0) bot.reactionTimer = Math.max(0, bot.reactionTimer - safeDt);
  if (bot.recoilKick > 0) bot.recoilKick = Math.max(0, bot.recoilKick - safeDt * 6);
  if (bot.harvestSwingTimer > 0) bot.harvestSwingTimer = Math.max(0, bot.harvestSwingTimer - safeDt);
  if (bot.harvestCooldown > 0) bot.harvestCooldown = Math.max(0, bot.harvestCooldown - safeDt);
  if ((bot.throwCooldown ?? 0) > 0) {
    bot.throwCooldown = Math.max(0, (bot.throwCooldown ?? 0) - safeDt);
  }
  if ((bot.shieldBubbleCooldown ?? 0) > 0) {
    bot.shieldBubbleCooldown = Math.max(0, (bot.shieldBubbleCooldown ?? 0) - safeDt);
  }
  if ((bot.launchPadCooldown ?? 0) > 0) {
    bot.launchPadCooldown = Math.max(0, (bot.launchPadCooldown ?? 0) - safeDt);
  }
  if ((bot.riftCooldown ?? 0) > 0) {
    bot.riftCooldown = Math.max(0, (bot.riftCooldown ?? 0) - safeDt);
  }
  if ((bot.allyAbilityCooldown ?? 0) > 0) {
    bot.allyAbilityCooldown = Math.max(0, (bot.allyAbilityCooldown ?? 0) - safeDt);
  }
  if (bot.buildAnimTimer > 0) {
    bot.buildAnimTimer = Math.max(0, bot.buildAnimTimer - safeDt);
    if (bot.buildAnimTimer === 0) bot.isBuilding = false;
  } else {
    bot.isBuilding = false;
  }

  if (isPlayerCompanion) {
    if (
      bot.state === 'bus' ||
      bot.state === 'skydiving' ||
      bot.state === 'gliding' ||
      bot.state === 'looting' ||
      bot.state === 'harvesting'
    ) {
      bot.state = 'rotating';
    }
    if (bot.targetEnemyId === 'player') {
      bot.targetEnemyId = null;
      bot.lastKnownEnemyPos = null;
    }
  } else {
    if (bot.state === 'bus') {
      stepBusPhase(bot, busPos, elapsed);
      return;
    }
    if (bot.state === 'skydiving') {
      stepSkydivingPhase(bot, ctx, safeDt);
      return;
    }
    if (bot.state === 'gliding') {
      stepGlidingPhase(bot, ctx, safeDt, isFarLOD);
      return;
    }
  }

  const effectivePlayerPos = isPlayerCompanion
    ? resolveEffectivePlayerPos(ctx, playerPos)
    : null;

  if (isKnockedState) {
    stepKnockedBot(bot, ctx, effectivePlayerPos, effectiveSquadmates, safeDt, isFarLOD);
    return;
  }

  // Grounded states
  handleReloading(bot, safeDt);
  if (isPlayerCompanion && effectivePlayerPos) {
    const dist2dToPlayer = dist2D(
      bot.position.x,
      bot.position.z,
      effectivePlayerPos.x,
      effectivePlayerPos.z,
    );
    const dist3dToPlayer = dist3D(bot.position, effectivePlayerPos);
    const playerGroundY = ctx.terrain.getHeightAt(
      effectivePlayerPos.x,
      effectivePlayerPos.z,
    );
    const playerOnGroundOrLow = Math.abs(effectivePlayerPos.y - playerGroundY) <= 10;
    if (
      dist2dToPlayer > ALLY_TELEPORT_DIST ||
      (dist3dToPlayer > ALLY_TELEPORT_DIST && playerOnGroundOrLow)
    ) {
      const teleportPos = pickAllyFollowSpot(bot, ctx, effectivePlayerPos, 6.5);
      bot.position.x = teleportPos.x;
      bot.position.y = teleportPos.y;
      bot.position.z = teleportPos.z;
      bot.velocity.x = 0;
      bot.velocity.y = 0;
      bot.velocity.z = 0;
      bot.grounded = true;
      bot.gliderOpen = false;
      bot.gliderFactor = 0;
      bot.targetEnemyId = null;
      bot.lastKnownEnemyPos = null;
      bot.burstQueue = 0;
      bot.lastStuckCheckPos = { ...bot.position };
      bot.stuckTimer = 0;
    }
  }
  if (bot.isAlly) {
    stepAllySupportAbility(bot, ctx, onAllySupport);
  }
  if (
    bot.isDuoPartner &&
    stepDuoPartnerRevive(
      bot,
      ctx,
      effectivePlayerPos,
      safeDt,
      isFarLOD,
      onPlayerRevived,
    )
  ) {
    return;
  }
  if (
    !isPlayerCompanion &&
    effectiveSquadmates.length > 0 &&
    stepSquadmateRevive(bot, ctx, effectiveSquadmates, elapsed, safeDt, isFarLOD)
  ) {
    return;
  }

  const profile = DIFFICULTY_PROFILES[difficulty];
  bot.thinkCooldown = Math.max(0, bot.thinkCooldown - safeDt);
  bot.scanCooldown = Math.max(0, bot.scanCooldown - safeDt);

  const shouldThink = !isFarLOD || bot.thinkCooldown <= 0;
  if (isFarLOD && bot.thinkCooldown <= 0) {
    bot.thinkCooldown = 0.4 + nextBotRand(bot) * 0.2;
  }

  const distToSafeCenter = dist2D(
    bot.position.x,
    bot.position.z,
    ctx.storm.currentCenterX,
    ctx.storm.currentCenterZ,
  );
  const inStormNow =
    ctx.storm.currentRadius > 0
      ? distToSafeCenter > Math.max(0, ctx.storm.currentRadius - 4)
      : isInStorm(bot, ctx, 4);
  const farFromSafeZone =
    ctx.storm.currentRadius > 0 &&
    distToSafeCenter > ctx.storm.currentRadius * 0.92;
  const nextDist =
    ctx.storm.nextRadius > 0
      ? dist2D(bot.position.x, bot.position.z, ctx.storm.nextCenterX, ctx.storm.nextCenterZ)
      : 0;
  const needRotateStorm =
    inStormNow ||
    farFromSafeZone ||
    (ctx.storm.isShrinking && ctx.storm.nextRadius > 0 && nextDist > ctx.storm.nextRadius * 0.92);

  let combatMatch: { target: BotCombatTarget; hasLOS: boolean; distance: number } | null = null;
  if (shouldThink) {
    combatMatch = selectEnemyTarget(
      bot,
      ctx,
      profile,
      elapsed,
      isFarLOD,
      effectiveSquadmates,
      medallionHolderIds,
    );
    if (combatMatch) {
      if (bot.targetEnemyId !== combatMatch.target.id) {
        const reactBase = isPlayerCompanion
          ? Math.min(profile.reactionTimeSec, 0.18)
          : profile.reactionTimeSec;
        bot.reactionTimer = reactBase * (0.75 + nextBotRand(bot) * 0.5);
      }
      bot.targetEnemyId = combatMatch.target.id;
      bot.lastKnownEnemyPos = { ...combatMatch.target.position };
      bot.enemyLostTimer = 0;
    } else if (bot.targetEnemyId) {
      bot.enemyLostTimer += isFarLOD ? 0.45 : safeDt;
      if (isPlayerCompanion || bot.enemyLostTimer > 4.5) {
        bot.targetEnemyId = null;
        bot.lastKnownEnemyPos = null;
      }
    } else if (!isPlayerCompanion && effectiveSquadmates.length > 0 && !bot.lastKnownEnemyPos) {
      const engagedMate = effectiveSquadmates.find(
        (m) =>
          m.id !== bot.id &&
          m.alive &&
          !m.isKnocked &&
          m.lastKnownEnemyPos &&
          dist2D(bot.position.x, bot.position.z, m.lastKnownEnemyPos.x, m.lastKnownEnemyPos.z) <=
            profile.visionRange,
      );
      if (engagedMate?.lastKnownEnemyPos) {
        bot.lastKnownEnemyPos = { ...engagedMate.lastKnownEnemyPos };
      }
    }
  } else if (bot.targetEnemyId && bot.lastKnownEnemyPos) {
    const existing = ctx.getCombatTargets().find(
      (t) =>
        t.id === bot.targetEnemyId &&
        t.alive &&
        !isFriendlyTarget(bot, t, effectiveSquadmates) &&
        (!isPlayerCompanion || dist3D(bot.position, t.position) <= ALLY_COMBAT_RANGE),
    );
    if (existing) {
      combatMatch = {
        target: existing,
        hasLOS: dist3D(bot.position, existing.position) < 45,
        distance: dist3D(bot.position, existing.position),
      };
    }
  }

  if (effectiveMode === 'zero_build' || bot.isAlly) {
    bot.isBuilding = false;
    bot.buildAnimTimer = 0;
  } else if (
    shouldBotBuildDefense(
      bot,
      difficulty,
      elapsed,
      combatMatch ? combatMatch.distance : 30,
      undefined,
      effectiveMode,
    )
  ) {
    const threatPos =
      combatMatch?.target.position ??
      bot.lastKnownEnemyPos ??
      bot.lastHeardNoisePos ?? {
        x: bot.position.x + Math.sin(bot.yaw) * 15,
        y: bot.position.y,
        z: bot.position.z + Math.cos(bot.yaw) * 15,
      };
    tryBuildCover(bot, ctx, difficulty, threatPos, elapsed);
  }

  if (!isFarLOD && !bot.isAlly) {
    const bubbleDeploy = shouldBotDeployShieldBubble(bot, ctx, elapsed);
    if (bubbleDeploy) {
      bot.inventory.activeSlot = bubbleDeploy.slotIndex;
      bot.burstQueue = 0;
      const eye = getBotEyePos(bot);
      const throwDir: Vec3Like = {
        x: Math.sin(bot.yaw) * 0.22,
        y: -0.95,
        z: Math.cos(bot.yaw) * 0.22,
      };
      const res = ctx.fireWeapon(bot, bubbleDeploy.item, eye, throwDir, 0.01);
      if (!res || res.fired !== false) {
        bubbleDeploy.item.stackCount = Math.max(0, bubbleDeploy.item.stackCount - 1);
        if (bubbleDeploy.item.stackCount <= 0) {
          bot.inventory.items[bubbleDeploy.slotIndex] = null;
        }
        bot.isFiring = true;
        bot.recoilKick = 0.6;
        bot.fireCooldown = 1 / Math.max(0.2, WEAPONS.shield_bubble.fireRate);
        bot.shieldBubbleCooldown = 12.0;
        bot.recentDamageTaken = 0;
      }
    }
  }

  const riftIntent = isPlayerCompanion
    ? null
    : tryRiftEscape(bot, ctx, inStormNow, elapsed, safeDt);
  if (riftIntent?.warpedGliding) {
    updateAnimState(bot);
    return;
  }

  const healChoice = selectHealingItem(
    bot.inventory.items,
    bot.hp,
    bot.shield,
    bot.maxHp,
    bot.maxShield,
  );
  const closeThreat = combatMatch !== null && combatMatch.hasLOS && combatMatch.distance < 18;
  const activeHealItem = bot.inventory.items[bot.healSlot];
  if (
    !riftIntent &&
    bot.state === 'healing' &&
    bot.stateTimer > 1.1 &&
    activeHealItem?.weaponId !== 'chug_splash' &&
    bot.hp >= 35 * (bot.maxHp / 100) &&
    bot.lastDamageTime >= 0 &&
    elapsed - bot.lastDamageTime < 0.25 &&
    closeThreat
  ) {
    bot.healTimer = 0;
    bot.retreatTimer = 0;
    bot.state = 'combat';
  }

  const hpScale = bot.maxHp / 100;
  const lowHpForHeal =
    bot.hp < profile.healThresholdHp * hpScale ||
    (bot.hp + bot.shield < 85 * hpScale &&
      (healChoice?.item.weaponId === 'chug_splash' ||
        healChoice?.item.weaponId === 'mini_shield'));
  const wantsCriticalHeal =
    healChoice !== null &&
    lowHpForHeal &&
    (!closeThreat ||
      effectiveMode === 'zero_build' ||
      bot.buildCooldown > 0 ||
      getTotalMaterials(bot) < BUILD_COST ||
      healChoice.item.weaponId === 'chug_splash' ||
      healChoice.item.weaponId === 'mini_shield');
  const wantsSafeTopOff =
    healChoice !== null &&
    !combatMatch &&
    !inStormNow &&
    (bot.hp < bot.maxHp * 0.85 || bot.shield < bot.maxShield * 0.85);

  if (!riftIntent && bot.state !== 'healing' && (wantsCriticalHeal || wantsSafeTopOff)) {
    bot.state = 'healing';
    bot.healSlot = healChoice.slotIndex;
    bot.inventory.activeSlot = healChoice.slotIndex;
    bot.healTimer =
      WEAPONS[healChoice.item.weaponId].consumeTime ??
      (healChoice.item.weaponId === 'chug_splash' ? 0.55 : 3.0);
    bot.retreatTimer = !isPlayerCompanion && combatMatch ? 0.75 : 0;
    bot.stateTimer = 0;
  }

  const weaponCount = countWeapons(bot);
  if (!riftIntent && bot.state !== 'healing') {
    if (isPlayerCompanion) {
      if (combatMatch) {
        if (bot.state !== 'combat') {
          bot.state = 'combat';
          bot.stateTimer = 0;
        }
      } else {
        bot.lastKnownEnemyPos = null;
        if (bot.state !== 'rotating') {
          bot.state = 'rotating';
          bot.stateTimer = 0;
        }
      }
    } else if (combatMatch) {
      const bestGun = selectBestWeaponForDistance(
        bot.inventory.items,
        combatMatch.distance,
        bot.inventory.ammo,
      );
      if (bestGun && (bestGun.item.weaponId !== 'pickaxe' || combatMatch.distance <= 4.0)) {
        if (bot.state !== 'combat') {
          bot.state = 'combat';
          bot.stateTimer = 0;
        }
      } else if (weaponCount === 0) {
        bot.state = needRotateStorm ? 'rotating' : 'looting';
      }
    } else if (needRotateStorm) {
      if (bot.state !== 'rotating') {
        bot.state = 'rotating';
        bot.stateTimer = 0;
      }
    } else if (bot.state === 'combat' && !bot.lastKnownEnemyPos) {
      bot.state = weaponCount > 0 ? 'rotating' : 'looting';
      bot.stateTimer = 0;
    }
  }

  let intent: MoveIntent | null = riftIntent ?? null;
  if (!intent && !isPlayerCompanion && bot.state !== 'healing') {
    intent = trySlurpBarrelRecovery(
      bot,
      ctx,
      profile,
      combatMatch,
      inStormNow,
      safeDt,
      isFarLOD,
    );
    if (!intent) {
      intent = tryCampfireHealing(
        bot,
        ctx,
        combatMatch,
        needRotateStorm,
        safeDt,
        isFarLOD,
      );
    }
    if (!intent) {
      intent = tryCapturePoint(
        bot,
        ctx,
        combatMatch,
        inStormNow,
        needRotateStorm,
        elapsed,
        safeDt,
        isFarLOD,
      );
    }
  }

  if (!intent) {
    if (isPlayerCompanion) {
      if (bot.state === 'healing') {
        intent = stepHealingState(
          bot,
          ctx,
          combatMatch,
          closeThreat,
          false,
          safeDt,
        );
      } else if (bot.state === 'combat' && combatMatch) {
        intent = stepCombatState(
          bot,
          ctx,
          difficulty,
          profile,
          combatMatch,
          weaponCount,
          elapsed,
          safeDt,
          isFarLOD,
          effectiveSquadmates,
        );
      } else {
        bot.state = 'rotating';
        intent = stepAllyFollowPlayer(
          bot,
          effectivePlayerPos ?? bot.position,
          safeDt,
        );
      }
      if (effectivePlayerPos && (bot.state === 'combat' || bot.state === 'healing')) {
        intent = enforceAllyCombatLeash(bot, effectivePlayerPos, intent);
      }
    } else {
      switch (bot.state) {
        case 'healing':
          intent = stepHealingState(
            bot,
            ctx,
            combatMatch,
            closeThreat,
            needRotateStorm,
            safeDt,
          );
          break;
        case 'combat':
          intent = stepCombatState(
            bot,
            ctx,
            difficulty,
            profile,
            combatMatch,
            weaponCount,
            elapsed,
            safeDt,
            isFarLOD,
            effectiveSquadmates,
          );
          break;
        case 'looting':
          intent = stepLootingState(
            bot,
            ctx,
            weaponCount,
            needRotateStorm,
            elapsed,
            safeDt,
            isFarLOD,
            effectiveMode,
          );
          break;
        case 'harvesting':
          intent = stepHarvestingState(bot, ctx, needRotateStorm, elapsed, safeDt, isFarLOD);
          break;
        default:
          intent = stepRotatingState(
            bot,
            ctx,
            weaponCount,
            inStormNow,
            farFromSafeZone,
            needRotateStorm,
            elapsed,
            safeDt,
            isFarLOD,
            effectiveSquadmates,
          );
          if (intent.launchedGliding) {
            updateAnimState(bot);
            return;
          }
          break;
      }
    }
  }

  if (!isFarLOD && ctx.getVehicles) {
    const incomingVehicle = findIncomingVehicleThreat(
      bot.position,
      bot.id,
      ctx.getVehicles(),
    );
    if (incomingVehicle) {
      bot.isSprinting = true;
      bot.isCrouching = false;
      intent = {
        dirX: incomingVehicle.evadeDirX,
        dirZ: incomingVehicle.evadeDirZ,
        speed: SPRINT_SPEED,
        wantsJump:
          bot.grounded &&
          bot.jumpCooldown <= 0 &&
          incomingVehicle.distance < 12,
      };
    }
  }

  recoverIfStuck(bot, ctx, intent, elapsed, safeDt, isFarLOD);
  intent = applyVolcanoLavaAvoidance(bot, intent);
  applyMovementStep(
    bot,
    ctx,
    intent.dirX,
    intent.dirZ,
    intent.speed,
    intent.wantsJump,
    safeDt,
    isFarLOD,
  );
  if (
    bot.riftTargetId &&
    (bot.riftCooldown ?? 0) <= 0 &&
    ctx.getRifts &&
    ctx.triggerRift
  ) {
    const targetRift = ctx
      .getRifts()
      .find((r) => r.id === bot.riftTargetId && r.active);
    if (
      targetRift &&
      dist2D(bot.position.x, bot.position.z, targetRift.x, targetRift.z) <= 2.5 &&
      Math.abs(bot.position.y - targetRift.y) <= 4.0
    ) {
      executeRiftWarp(bot, ctx, targetRift);
    }
  }
  updateAnimState(bot);
}

/**
 * Stateless facade wrapping bot tactical AI evaluation and state transitions.
 */
export class BotBrain {
  readonly profiles = DIFFICULTY_PROFILES;

  selectBestWeaponForDistance(
    items: (ItemInstance | null)[],
    distance: number,
    ammo?: Record<AmmoType, number>,
  ): { slotIndex: number; item: ItemInstance } | null {
    return selectBestWeaponForDistance(items, distance, ammo);
  }

  selectBestWeaponForRange(
    items: (ItemInstance | null)[],
    distance: number,
    ammo?: Record<AmmoType, number>,
  ): { slotIndex: number; item: ItemInstance } | null {
    return selectBestWeaponForRange(items, distance, ammo);
  }

  selectThrowableForCombat(
    bot: Pick<BotEntity, 'id' | 'position' | 'inventory' | 'throwCooldown'> & {
      isAlly?: boolean;
      isDuoPartner?: boolean;
      squadId?: string;
    },
    target: BotCombatTarget,
    allTargets: BotCombatTarget[],
    hasLOS: boolean,
    buildPieces?: BuildPiece[],
    squadmates?: ReadonlyArray<Pick<BotEntity, 'id'>>,
  ): ThrowableDecision | null {
    return selectThrowableForCombat(
      bot,
      target,
      allTargets,
      hasLOS,
      buildPieces,
      squadmates,
    );
  }

  segmentIntersectsSphere(
    a: Vec3Like,
    b: Vec3Like,
    center: Vec3Like,
    radius: number,
  ): boolean {
    return segmentIntersectsSphere(a, b, center, radius);
  }

  isShotBlockedByShieldBubbles(
    from: Vec3Like,
    to: Vec3Like,
    bubbles: ReadonlyArray<ShieldBubbleZone>,
  ): ShieldBubbleZone | null {
    return isShotBlockedByShieldBubbles(from, to, bubbles);
  }

  shouldBotDeployShieldBubble(
    bot: Pick<
      BotEntity,
      | 'hp'
      | 'maxHp'
      | 'shield'
      | 'maxShield'
      | 'position'
      | 'inventory'
      | 'state'
      | 'lastDamageTime'
      | 'shieldBubbleCooldown'
      | 'recentDamageTaken'
    >,
    ctx: Pick<BotWorldContext, 'getActiveShieldBubbles'>,
    nowSec: number,
  ): { slotIndex: number; item: ItemInstance } | null {
    return shouldBotDeployShieldBubble(bot, ctx, nowSec);
  }

  findIncomingVehicleThreat(
    botPos: Vec3Like,
    botId: string,
    vehicles: ReadonlyArray<VehicleEntity>,
  ): { vehicle: VehicleEntity; evadeDirX: number; evadeDirZ: number; distance: number } | null {
    return findIncomingVehicleThreat(botPos, botId, vehicles);
  }

  selectLaunchPadForRotation(
    bot: Pick<BotEntity, 'position' | 'launchPadCooldown' | 'isBoss'>,
    launchPads: LaunchPadEntity[],
    destination: Vec3Like,
    preferNearbyStormPad = false,
  ): LaunchPadEntity | null {
    return selectLaunchPadForRotation(bot, launchPads, destination, preferNearbyStormPad);
  }

  selectEscapeRift(
    bot: Pick<
      BotEntity,
      | 'position'
      | 'hp'
      | 'maxHp'
      | 'shield'
      | 'state'
      | 'isBoss'
      | 'lastDamageTime'
      | 'recentDamageTaken'
      | 'retreatTimer'
      | 'riftCooldown'
      | 'riftTargetId'
      | 'ignoredTargetId'
      | 'ignoredTargetUntil'
    >,
    rifts: ReadonlyArray<RiftEntity>,
    inStormNow: boolean,
    elapsed: number,
  ): RiftEntity | null {
    return selectEscapeRift(bot, rifts, inStormNow, elapsed);
  }

  selectCapturePointTarget(
    bot: Pick<
      BotEntity,
      | 'position'
      | 'state'
      | 'isBoss'
      | 'captureTargetId'
      | 'ignoredTargetId'
      | 'ignoredTargetUntil'
    >,
    capturePoints: ReadonlyArray<CapturePointEntity>,
    elapsed: number,
  ): CapturePointEntity | null {
    return selectCapturePointTarget(bot, capturePoints, elapsed);
  }

  selectExplosiveBarrelTarget(
    bot: Pick<BotEntity, 'position' | 'isCrouching' | 'inventory'>,
    target: Pick<BotCombatTarget, 'position' | 'eyePos'>,
    barrels: ReadonlyArray<ExplosiveBarrelEntity>,
    hasLineOfSight: (from: Vec3Like, to: Vec3Like) => boolean,
    activeBubbles: ReadonlyArray<ShieldBubbleZone> = [],
  ): ExplosiveBarrelCandidate | null {
    return selectExplosiveBarrelTarget(bot, target, barrels, hasLineOfSight, activeBubbles);
  }

  isInVolcanoLavaHazard(
    x: number,
    z: number,
    safeRadius = VOLCANO_LAVA_SAFE_RADIUS,
  ): boolean {
    return isInVolcanoLavaHazard(x, z, safeRadius);
  }

  selectHealingItem(
    items: (ItemInstance | null)[],
    hp: number,
    shield: number,
    maxHp = 100,
    maxShield = 100,
  ): { slotIndex: number; item: ItemInstance } | null {
    return selectHealingItem(items, hp, shield, maxHp, maxShield);
  }

  shouldBotBuildDefense(
    bot: Pick<
      BotEntity,
      | 'hp'
      | 'shield'
      | 'personality'
      | 'inventory'
      | 'buildCooldown'
      | 'lastDamageTime'
      | 'state'
    > & { maxHp?: number; reactionTimer?: number },
    difficulty: Difficulty,
    nowSec: number,
    threatDistance?: number,
    roll?: number,
    gameMode: GameModeId = 'solo',
  ): boolean {
    return shouldBotBuildDefense(bot, difficulty, nowSec, threatDistance, roll, gameMode);
  }

  computeBotSpread(
    weaponId: WeaponId,
    difficulty: Difficulty,
    isMoving = false,
    isCrouching = false,
  ): number {
    return computeBotSpread(weaponId, difficulty, isMoving, isCrouching);
  }

  update(
    bot: BotEntity,
    ctx: BotWorldContext,
    difficulty: Difficulty,
    busPos: Vec3Like,
    elapsed: number,
    dt: number,
    isFarLOD: boolean,
    gameMode?: GameModeId,
    playerPos?: Vec3Like,
    onAllySupport?: (event: AllySupportEvent) => void,
    onPlayerRevived?: (reviverId: string) => void,
    squadmates?: ReadonlyArray<BotEntity>,
    medallionHolderIds?: ReadonlySet<string>,
  ): void {
    updateBot(
      bot,
      ctx,
      difficulty,
      busPos,
      elapsed,
      dt,
      isFarLOD,
      gameMode,
      playerPos,
      onAllySupport,
      onPlayerRevived,
      squadmates,
      medallionHolderIds,
    );
  }
}
