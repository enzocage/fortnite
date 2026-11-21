import type {
  AmmoType,
  Difficulty,
  ItemInstance,
  MaterialType,
  POIDef,
  Vec3Like,
  WeaponId,
} from '../types';
import {
  BUILD_COST,
  GLIDER_FORCE_HEIGHT,
  MAX_MATS,
  POIS,
  RARITY_MULTIPLIER,
  RARITY_ORDER,
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
  BotCombatTarget,
  BotEntity,
  BotWorldContext,
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
  if (def.isConsumable) return -1;

  if (item.weaponId === 'pickaxe') {
    return distance <= def.range + 1.0 ? 5 : -1;
  }

  let base = 0;
  switch (item.weaponId) {
    case 'pump_shotgun':
      if (distance > def.range + 4) return 0.5;
      base = distance <= 12 ? 116 - distance * 2.4 : Math.max(4, 88 - (distance - 12) * 3.5);
      break;
    case 'tac_shotgun':
      if (distance > def.range + 4) return 0.5;
      base = distance <= 12 ? 106 - distance * 2.2 : Math.max(4, 80 - (distance - 12) * 3.4);
      break;
    case 'smg':
      if (distance > def.range) return 0.5;
      base = distance <= 18 ? 94 - distance * 0.7 : Math.max(5, 81 - (distance - 18) * 1.15);
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
    case 'sniper':
      if (distance < 22) base = 18;
      else if (distance < 60) base = 64 + (distance - 22) * 1.0;
      else base = Math.min(126, 104 + (distance - 60) * 0.25);
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
    if (!def || def.isConsumable) continue;

    if (def.ammoType !== null && ammo !== undefined) {
      const reserve = ammo[def.ammoType] ?? 0;
      if (item.magAmmo <= 0 && reserve <= 0) {
        continue;
      }
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
 * Selects the optimal usable consumable healing item respecting Fortnite's heal caps
 * (mini shields cap at 50 shield, bandages cap at 75 HP) and mini-before-big shield priority.
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

  const hpCritical = hp < 50;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || item.stackCount <= 0) continue;
    const def = WEAPONS[item.weaponId];
    if (!def || !def.isConsumable) continue;

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
        score = hpCritical ? 115 : hp < 100 && shield < 100 ? 96 : 82;
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
 * Determines whether a bot should reactively build defensive cover (Wall / Ramp).
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
  >,
  difficulty: Difficulty,
  nowSec: number,
  threatDistance = 30,
  roll?: number,
): boolean {
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
  const lowHpThreat = effectiveHp < 75 && threatDistance < 55;
  const builderEngaged =
    bot.personality === 'builder' &&
    bot.state === 'combat' &&
    threatDistance < 45;

  if (!recentlyDamaged && !lowHpThreat && !builderEngaged) {
    return false;
  }

  if (roll !== undefined) {
    const bonus = bot.personality === 'builder' ? 0.15 : 0;
    return roll < clamp(profile.buildChance + bonus, 0, 1);
  }

  if (difficulty === 'casual') {
    return effectiveHp < 70 || bot.personality === 'builder';
  }
  return true;
}

function tryBuildCover(
  bot: BotEntity,
  ctx: BotWorldContext,
  difficulty: Difficulty,
  threatPos: Vec3Like,
): boolean {
  const mat = pickAvailableMaterial(bot);
  if (!mat) return false;

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

  const wall = canonicalizeWall(cell.gx, cell.gy, cell.gz, face);
  const placedWall = ctx.placeBuildPiece(
    bot.id,
    'wall',
    mat,
    wall.gx,
    wall.gy,
    wall.gz,
    wall.dir,
    face,
  );

  let builtAny = false;
  if (placedWall) {
    bot.inventory.materials[mat] = Math.max(0, bot.inventory.materials[mat] - BUILD_COST);
    builtAny = true;
  }

  // Follow up with a ramp behind the wall for highground cover
  const rampMat = pickAvailableMaterial(bot);
  if (
    rampMat &&
    (nextBotRand(bot) < profile.rampOnBuildChance || bot.personality === 'builder')
  ) {
    const placedRamp = ctx.placeBuildPiece(
      bot.id,
      'ramp',
      rampMat,
      cell.gx,
      cell.gy,
      cell.gz,
      'N',
      face,
    );
    if (placedRamp) {
      bot.inventory.materials[rampMat] = Math.max(
        0,
        bot.inventory.materials[rampMat] - BUILD_COST,
      );
      builtAny = true;
    }
  }

  if (builtAny) {
    bot.buildAnimTimer = 0.38;
    bot.isBuilding = true;
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
  if (!def || def.isConsumable || item.weaponId === 'pickaxe') return 0;
  const rarityIdx = RARITY_ORDER.indexOf(item.rarity);
  const baseByType: Record<string, number> = {
    sniper: 52,
    rocket_launcher: 54,
    pump_shotgun: 50,
    ar: 48,
    burst_ar: 45,
    tac_shotgun: 44,
    smg: 40,
    pistol: 28,
  };
  return (baseByType[item.weaponId] ?? 30) + rarityIdx * 14;
}

function countWeapons(bot: BotEntity): number {
  let count = 0;
  for (let i = 1; i < bot.inventory.items.length; i++) {
    const it = bot.inventory.items[i];
    if (it && !WEAPONS[it.weaponId].isConsumable) count++;
  }
  return count;
}

function countHealingSlots(bot: BotEntity): number {
  let count = 0;
  for (let i = 1; i < bot.inventory.items.length; i++) {
    const it = bot.inventory.items[i];
    if (it && WEAPONS[it.weaponId].isConsumable) count++;
  }
  return count;
}

function canUpgradeOrTakeItem(bot: BotEntity, candidate: ItemInstance): number {
  const def = WEAPONS[candidate.weaponId];
  if (!def || candidate.weaponId === 'pickaxe') return -1;

  // Stack existing consumables
  if (def.isConsumable) {
    for (let i = 1; i < bot.inventory.items.length; i++) {
      const slot = bot.inventory.items[i];
      if (slot && slot.weaponId === candidate.weaponId && slot.stackCount < def.maxStack) {
        return i;
      }
    }
  }

  // Upgrade existing same-weapon slot in-place; skip equal/worse duplicates
  if (!def.isConsumable) {
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

  // Replace existing same-weapon with higher rarity
  if (!def.isConsumable) {
    const candValue = getWeaponOverallValue(candidate);
    let worstSlot = -1;
    let worstDiff = 0;
    for (let i = 1; i < bot.inventory.items.length; i++) {
      const slot = bot.inventory.items[i];
      if (!slot) continue;
      if (WEAPONS[slot.weaponId].isConsumable) continue;
      // Same weapon rarity upgrade or strictly weaker weapon when we have duplicates
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
  } else if (countHealingSlots(bot) === 0) {
    // Replace weakest weapon if we have zero heals
    let worstSlot = -1;
    let lowestVal = Infinity;
    for (let i = 1; i < bot.inventory.items.length; i++) {
      const slot = bot.inventory.items[i];
      if (!slot || WEAPONS[slot.weaponId].isConsumable) continue;
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
      if (existing && def.isConsumable && existing.weaponId === item.weaponId) {
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
  const x = clamp(
    targetX + Math.cos(bot.patrolAngle) * spreadR,
    -WORLD_HALF + 25,
    WORLD_HALF - 25,
  );
  const z = clamp(
    targetZ + Math.sin(bot.patrolAngle) * spreadR,
    -WORLD_HALF + 25,
    WORLD_HALF - 25,
  );
  if (!ctx.terrain.isWater(x, z)) {
    return { x, y: ctx.terrain.getHeightAt(x, z), z };
  }
  // Fallback toward safe center or nearest dry POI
  const pois: POIDef[] = ctx.terrain.getPOIs();
  const list = pois.length > 0 ? pois : POIS;
  let best = { x: targetX, y: ctx.terrain.getHeightAt(targetX, targetZ), z: targetZ };
  if (ctx.terrain.isWater(best.x, best.z)) {
    let bestD = Infinity;
    for (const poi of list) {
      if (ctx.terrain.isWater(poi.x, poi.z)) continue;
      const d = dist2D(poi.x, poi.z, targetX, targetZ);
      if (d < bestD) {
        bestD = d;
        best = { x: poi.x, y: poi.plateauY, z: poi.z };
      }
    }
  }
  return best;
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

function selectEnemyTarget(
  bot: BotEntity,
  ctx: BotWorldContext,
  profile: DifficultyProfile,
  elapsed: number,
  isFarLOD: boolean,
): { target: BotCombatTarget; hasLOS: boolean; distance: number } | null {
  const targets = ctx.getCombatTargets();
  const eye = getBotEyePos(bot);
  const losLimit = isFarLOD ? 55 : profile.visionRange;

  let bestTarget: BotCombatTarget | null = null;
  let bestHasLOS = false;
  let bestScore = -Infinity;
  let bestDist = Infinity;

  for (const t of targets) {
    if (!t.alive || t.id === bot.id) continue;
    const d = dist3D(eye, t.eyePos);
    const wasAttacker =
      bot.lastDamagerId === t.id &&
      bot.lastDamageTime >= 0 &&
      elapsed - bot.lastDamageTime < 5.0;
    const wasCurrent = bot.targetEnemyId === t.id;

    if (d > profile.visionRange && !wasAttacker) continue;

    let los = false;
    if (d <= losLimit) {
      los = ctx.hasLineOfSight(eye, t.eyePos);
    }

    if (!los && !wasAttacker && !wasCurrent) {
      continue;
    }

    let score = 200 - d;
    if (los) score += 120;
    if (wasAttacker) score += 90;
    if (wasCurrent) score += 30;
    if (t.hp + t.shield < 60) score += 25;

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

function handleFireAndBurst(
  bot: BotEntity,
  ctx: BotWorldContext,
  difficulty: Difficulty,
  target: BotCombatTarget,
  distance: number,
  hasLOS: boolean,
  dt: number,
): void {
  const activeItem = bot.inventory.items[bot.inventory.activeSlot];
  if (!activeItem || WEAPONS[activeItem.weaponId].isConsumable) return;
  const def = WEAPONS[activeItem.weaponId];
  const profile = DIFFICULTY_PROFILES[difficulty];

  const eye = getBotEyePos(bot);
  // Aim at chest, blended slightly toward head based on difficulty
  const aimY =
    target.eyePos.y - 0.35 * (1 - profile.headshotAimBias);
  const dx = target.position.x - eye.x;
  const dy = aimY - eye.y;
  const dz = target.position.z - eye.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const aimDir: Vec3Like = { x: dx / len, y: dy / len, z: dz / len };

  const targetYaw = Math.atan2(dx, dz);
  const horiz = Math.hypot(dx, dz) || 1;
  const targetPitch = Math.atan2(dy, horiz);
  bot.yaw = lerpAngle(bot.yaw, targetYaw, clamp(profile.turnSpeedRadPerSec * dt, 0, 1));
  bot.pitch = clamp(targetPitch, -1.2, 1.2);

  // Pickaxe melee fallback at point-blank range
  if (activeItem.weaponId === 'pickaxe') {
    if (distance <= def.range + 0.3 && bot.fireCooldown <= 0 && hasLOS) {
      ctx.fireWeapon(bot, activeItem, eye, aimDir, 0.05);
      bot.fireCooldown = 1 / def.fireRate;
      bot.harvestSwingTimer = 0.35;
      bot.isFiring = true;
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
): void {
  bot.gliderOpen = true;
  bot.gliderFactor = clamp(bot.gliderFactor + safeDt * 3.5, 0, 1);

  if (ctx.terrain.isWater(bot.dropTarget.x, bot.dropTarget.z)) {
    bot.dropTarget = pickSafeDestination(bot, ctx);
  }

  const dx = bot.dropTarget.x - bot.position.x;
  const dz = bot.dropTarget.z - bot.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 2.5) {
    const nx = dx / d;
    const nz = dz / d;
    const horizSpeed = Math.min(GLIDE_HORIZONTAL_SPEED, d * 2.5);
    bot.velocity.x = nx * horizSpeed;
    bot.velocity.z = nz * horizSpeed;
    bot.yaw = lerpAngle(bot.yaw, Math.atan2(nx, nz), clamp(5 * safeDt, 0, 1));
  } else {
    bot.velocity.x *= 0.85;
    bot.velocity.z *= 0.85;
  }
  bot.velocity.y = -GLIDE_DESCENT_SPEED;

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
  bot.moveSpeed = Math.hypot(bot.velocity.x, bot.velocity.z);
  bot.animState = 'glide';

  const groundY = ctx.terrain.getHeightAt(bot.position.x, bot.position.z);
  if (bot.grounded || bot.position.y <= groundY + 0.15) {
    bot.position.y = Math.max(bot.position.y, groundY);
    bot.velocity.y = 0;
    bot.grounded = true;
    bot.gliderOpen = false;
    bot.gliderFactor = 0;
    bot.state = 'looting';
    bot.stateTimer = 0;
    bot.animState = 'idle';
  }
}

function stepHealingState(
  bot: BotEntity,
  hasCombatMatch: boolean,
  closeThreat: boolean,
  needRotateStorm: boolean,
  safeDt: number,
): MoveIntent {
  bot.isCrouching = true;
  bot.isSprinting = false;
  const item = bot.inventory.items[bot.healSlot];
  if (!item || !WEAPONS[item.weaponId].isConsumable || item.stackCount <= 0) {
    bot.healTimer = 0;
    bot.isCrouching = false;
    bot.state = hasCombatMatch ? 'combat' : needRotateStorm ? 'rotating' : 'looting';
    return emptyMoveIntent();
  }

  bot.inventory.activeSlot = bot.healSlot;
  bot.healTimer -= safeDt;
  if (bot.healTimer > 0) {
    return emptyMoveIntent();
  }

  const def = WEAPONS[item.weaponId];
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
  if (nextHeal && !closeThreat && (bot.hp < 85 || bot.shield < 85)) {
    bot.healSlot = nextHeal.slotIndex;
    bot.inventory.activeSlot = nextHeal.slotIndex;
    bot.healTimer = WEAPONS[nextHeal.item.weaponId].consumeTime ?? 2.5;
  } else {
    bot.isCrouching = false;
    bot.state = hasCombatMatch ? 'combat' : needRotateStorm ? 'rotating' : 'looting';
    bot.stateTimer = 0;
  }
  return emptyMoveIntent();
}

function getPreferredCombatRange(
  weaponId: WeaponId | undefined,
  personality: BotEntity['personality'],
): { min: number; max: number } {
  if (
    weaponId === 'pump_shotgun' ||
    weaponId === 'tac_shotgun' ||
    personality === 'rusher'
  ) {
    return { min: 5, max: 13 };
  }
  if (weaponId === 'smg') {
    return { min: 9, max: 20 };
  }
  if (weaponId === 'sniper' || personality === 'sniper') {
    return { min: 42, max: 88 };
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
  safeDt: number,
  isFarLOD: boolean,
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
    handleFireAndBurst(bot, ctx, difficulty, target, distance, hasLOS, safeDt);
  }

  const activeWeaponId = bot.inventory.items[bot.inventory.activeSlot]?.weaponId;
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

  let radial = 0;
  if (horizDist > range.max || !hasLOS) radial = 1;
  else if (horizDist < range.min) radial = -0.8;

  const strafeWeight = profile.strafeAgility * (isFarLOD ? 0.25 : 0.85);
  const rawX = fwdX * radial + rightX * bot.strafeDir * strafeWeight;
  const rawZ = fwdZ * radial + rightZ * bot.strafeDir * strafeWeight;
  const rawLen = Math.hypot(rawX, rawZ);

  let dirX = 0;
  let dirZ = 0;
  if (rawLen > 0.05) {
    dirX = rawX / rawLen;
    dirZ = rawZ / rawLen;
  }

  bot.crouchToggleTimer -= safeDt;
  if (!isFarLOD && bot.crouchToggleTimer <= 0) {
    bot.crouchToggleTimer = 0.9 + nextBotRand(bot) * 1.2;
    bot.isCrouching =
      horizDist > 22 && nextBotRand(bot) < profile.crouchInCombatChance;
  }

  let wantsJump = false;
  if (
    !isFarLOD &&
    horizDist < 22 &&
    bot.jumpCooldown <= 0 &&
    nextBotRand(bot) < profile.jumpInCombatChance * safeDt * 4
  ) {
    wantsJump = true;
    bot.isCrouching = false;
  }

  bot.isSprinting = radial > 0 && horizDist > range.max + 8 && !bot.isCrouching;
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
    const d = dist2D(bot.position.x, bot.position.z, drop.x, drop.z);
    if (d > 48) continue;

    let bonus = 0;
    if (drop.item && canUpgradeOrTakeItem(bot, drop.item) >= 1) {
      bonus = WEAPONS[drop.item.weaponId].isConsumable ? 18 : 32;
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
    if (weaponCount >= 1 && getTotalMaterials(bot) < desiredMatGoal && !needRotateStorm) {
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

function stepRotatingState(
  bot: BotEntity,
  ctx: BotWorldContext,
  weaponCount: number,
  inStormNow: boolean,
  needRotateStorm: boolean,
  elapsed: number,
  safeDt: number,
  isFarLOD: boolean,
): MoveIntent {
  bot.isCrouching = false;

  const bestSlot = selectBestWeaponForDistance(bot.inventory.items, 35, bot.inventory.ammo);
  if (bestSlot) {
    bot.inventory.activeSlot = bestSlot.slotIndex;
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
  } else {
    if (
      !bot.moveTarget ||
      dist2D(bot.position.x, bot.position.z, bot.moveTarget.x, bot.moveTarget.z) < 6 ||
      ctx.terrain.isWater(bot.moveTarget.x, bot.moveTarget.z)
    ) {
      bot.patrolAngle += 0.8 + nextBotRand(bot) * 1.4;
      bot.moveTarget = pickSafeDestination(bot, ctx);
    }
    destination = bot.moveTarget;
  }

  if (!needRotateStorm && !isFarLOD && bot.scanCooldown <= 0) {
    bot.scanCooldown = 0.35;
    if (weaponCount < 2 || countHealingSlots(bot) === 0) {
      const hasNearbyLoot = ctx
        .getLootDrops()
        .some((ld) => dist2D(bot.position.x, bot.position.z, ld.x, ld.z) < 28);
      const hasNearbyChest = ctx
        .getChests()
        .some((c) => !c.opened && dist2D(bot.position.x, bot.position.z, c.x, c.z) < 32);
      if (hasNearbyLoot || hasNearbyChest) {
        bot.state = 'looting';
        bot.stateTimer = 0;
      }
    }
  }

  if (!destination) return emptyMoveIntent();
  const d = dist2D(bot.position.x, bot.position.z, destination.x, destination.z);
  if (d <= 2.0) return emptyMoveIntent();

  const intent = moveTowardPoint(bot, destination.x, destination.z, safeDt, inStormNow ? 0 : 15);
  if (inStormNow) {
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

  if (bot.lootTargetId || bot.chestTargetId || bot.harvestTargetId) {
    bot.ignoredTargetId = bot.lootTargetId ?? bot.chestTargetId ?? bot.harvestTargetId;
    bot.ignoredTargetUntil = elapsed + 6.0;
    bot.lootTargetId = null;
    bot.chestTargetId = null;
    bot.harvestTargetId = null;
    bot.moveTarget = pickSafeDestination(bot, ctx);
  }
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
): void {
  if (!bot.alive || bot.hp <= 0 || bot.state === 'eliminated') {
    bot.alive = false;
    bot.hp = 0;
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
  if (bot.buildAnimTimer > 0) {
    bot.buildAnimTimer = Math.max(0, bot.buildAnimTimer - safeDt);
    if (bot.buildAnimTimer === 0) bot.isBuilding = false;
  } else {
    bot.isBuilding = false;
  }

  if (bot.state === 'bus') {
    stepBusPhase(bot, busPos, elapsed);
    return;
  }
  if (bot.state === 'skydiving') {
    stepSkydivingPhase(bot, ctx, safeDt);
    return;
  }
  if (bot.state === 'gliding') {
    stepGlidingPhase(bot, ctx, safeDt);
    return;
  }

  // Grounded states
  handleReloading(bot, safeDt);
  const profile = DIFFICULTY_PROFILES[difficulty];
  bot.thinkCooldown = Math.max(0, bot.thinkCooldown - safeDt);
  bot.scanCooldown = Math.max(0, bot.scanCooldown - safeDt);

  const shouldThink = !isFarLOD || bot.thinkCooldown <= 0;
  if (isFarLOD && bot.thinkCooldown <= 0) {
    bot.thinkCooldown = 0.4 + nextBotRand(bot) * 0.2;
  }

  const inStormNow = isInStorm(bot, ctx, 4);
  const nextDist =
    ctx.storm.nextRadius > 0
      ? dist2D(bot.position.x, bot.position.z, ctx.storm.nextCenterX, ctx.storm.nextCenterZ)
      : 0;
  const needRotateStorm =
    inStormNow ||
    (ctx.storm.isShrinking && ctx.storm.nextRadius > 0 && nextDist > ctx.storm.nextRadius * 0.92);

  let combatMatch: { target: BotCombatTarget; hasLOS: boolean; distance: number } | null = null;
  if (shouldThink) {
    combatMatch = selectEnemyTarget(bot, ctx, profile, elapsed, isFarLOD);
    if (combatMatch) {
      if (bot.targetEnemyId !== combatMatch.target.id) {
        bot.reactionTimer = profile.reactionTimeSec * (0.75 + nextBotRand(bot) * 0.5);
      }
      bot.targetEnemyId = combatMatch.target.id;
      bot.lastKnownEnemyPos = { ...combatMatch.target.position };
      bot.enemyLostTimer = 0;
    } else if (bot.targetEnemyId) {
      bot.enemyLostTimer += isFarLOD ? 0.45 : safeDt;
      if (bot.enemyLostTimer > 4.5) {
        bot.targetEnemyId = null;
        bot.lastKnownEnemyPos = null;
      }
    }
  } else if (bot.targetEnemyId && bot.lastKnownEnemyPos) {
    const existing = ctx.getCombatTargets().find((t) => t.id === bot.targetEnemyId && t.alive);
    if (existing) {
      combatMatch = {
        target: existing,
        hasLOS: dist3D(bot.position, existing.position) < 45,
        distance: dist3D(bot.position, existing.position),
      };
    }
  }

  if (shouldBotBuildDefense(bot, difficulty, elapsed, combatMatch ? combatMatch.distance : 30)) {
    const threatPos =
      combatMatch?.target.position ??
      bot.lastKnownEnemyPos ??
      bot.lastHeardNoisePos ?? {
        x: bot.position.x + Math.sin(bot.yaw) * 15,
        y: bot.position.y,
        z: bot.position.z + Math.cos(bot.yaw) * 15,
      };
    tryBuildCover(bot, ctx, difficulty, threatPos);
  }

  const healChoice = selectHealingItem(
    bot.inventory.items,
    bot.hp,
    bot.shield,
    bot.maxHp,
    bot.maxShield,
  );
  const closeThreat = combatMatch !== null && combatMatch.hasLOS && combatMatch.distance < 18;
  if (
    bot.state === 'healing' &&
    bot.lastDamageTime >= 0 &&
    elapsed - bot.lastDamageTime < 0.25 &&
    closeThreat
  ) {
    bot.healTimer = 0;
    bot.state = 'combat';
  }

  const wantsCriticalHeal =
    healChoice !== null &&
    bot.hp < profile.healThresholdHp &&
    (!closeThreat || bot.buildCooldown > 0);
  const wantsSafeTopOff =
    healChoice !== null && !combatMatch && !inStormNow && (bot.hp < 85 || bot.shield < 85);

  if (bot.state !== 'healing' && (wantsCriticalHeal || wantsSafeTopOff)) {
    bot.state = 'healing';
    bot.healSlot = healChoice.slotIndex;
    bot.inventory.activeSlot = healChoice.slotIndex;
    bot.healTimer = WEAPONS[healChoice.item.weaponId].consumeTime ?? 3.0;
    bot.stateTimer = 0;
  }

  const weaponCount = countWeapons(bot);
  if (bot.state !== 'healing') {
    if (combatMatch) {
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

  let intent: MoveIntent;
  switch (bot.state) {
    case 'healing':
      intent = stepHealingState(bot, combatMatch !== null, closeThreat, needRotateStorm, safeDt);
      break;
    case 'combat':
      intent = stepCombatState(
        bot,
        ctx,
        difficulty,
        profile,
        combatMatch,
        weaponCount,
        safeDt,
        isFarLOD,
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
        needRotateStorm,
        elapsed,
        safeDt,
        isFarLOD,
      );
      break;
  }

  recoverIfStuck(bot, ctx, intent, elapsed, safeDt, isFarLOD);
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
    >,
    difficulty: Difficulty,
    nowSec: number,
    threatDistance?: number,
    roll?: number,
  ): boolean {
    return shouldBotBuildDefense(bot, difficulty, nowSec, threatDistance, roll);
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
  ): void {
    updateBot(bot, ctx, difficulty, busPos, elapsed, dt, isFarLOD);
  }
}
