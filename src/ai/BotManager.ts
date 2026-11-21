import type {
  BotSummary,
  DamageEvent,
  Difficulty,
  KillFeedEntry,
  POIDef,
  Rarity,
  Vec3Like,
  WeaponId,
} from '../types';
import {
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  POIS,
  SKINS,
  WEAPONS,
  clamp,
  dist2D,
  dist3D,
  mulberry32,
} from '../core';
import {
  VOLCANO_LAVA_SAFE_RADIUS,
  clampOutsideVolcanoLava,
  isInVolcanoLavaHazard,
  updateBot,
} from './BotBrain';
import { pickBotLoadoutCosmetics } from './BotNames';
import type {
  BotEntity,
  BotRenderState,
  BotWorldContext,
  NamedBossSpec,
} from './BotTypes';

export const BOSS_SPECS: readonly NamedBossSpec[] = [
  {
    id: 'boss_skyline_spire',
    name: 'Skyline Warden',
    poiId: 'skyline_spire',
    skinId: 'cyber_knight',
    pickaxeId: 'plasma_katana',
    gliderId: 'cyber_falcon',
    personality: 'builder',
    offsetX: 2,
    offsetZ: -2,
    patrolRadius: 5.5,
  },
  {
    id: 'boss_scorched_caldera',
    name: 'Obsidian Titan',
    poiId: 'scorched_caldera',
    skinId: 'obsidian_knight',
    pickaxeId: 'magma_axe',
    gliderId: 'solar_dragon',
    personality: 'rusher',
    offsetX: -5,
    offsetZ: -4,
    patrolRadius: 5.0,
  },
  {
    id: 'boss_frostpeak_citadel',
    name: 'Glacier Monarch',
    poiId: 'frostpeak_citadel',
    skinId: 'frost_phantom',
    pickaxeId: 'storm_breaker',
    gliderId: 'victory_brolly',
    personality: 'builder',
    offsetX: 8,
    offsetZ: 7,
    patrolRadius: 4.0,
  },
];

interface EliminationMeta {
  killerId: string;
  killerName: string;
  weaponId: WeaponId;
  rarity: Rarity;
  isHeadshot: boolean;
  isStorm: boolean;
  distance: number;
  timestamp: number;
}

/**
 * Coordinates spawning, updating, LOD throttling, storm ticking, damage handling,
 * and elimination lifecycle for all AI bots in a match.
 */
export class BotManager {
  private ctx: BotWorldContext;
  private difficulty: Difficulty;
  private baseSeed: number;
  private matchCounter = 0;
  private bots: BotEntity[] = [];
  private botMap = new Map<string, BotEntity>();
  private lastElapsed = 0;
  private killFeedSeq = 0;
  private unsubNoise: (() => void) | null = null;

  constructor(
    ctx: BotWorldContext,
    difficulty: Difficulty = 'standard',
    seed = 9001,
  ) {
    this.ctx = ctx;
    this.difficulty = difficulty;
    this.baseSeed = seed;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.unsubNoise?.();
    this.unsubNoise = this.ctx.eventBus.on('audio:noise', (payload) => {
      for (const bot of this.bots) {
        if (!bot.alive || bot.id === payload.sourceId) continue;
        if (
          bot.state === 'bus' ||
          bot.state === 'skydiving' ||
          bot.state === 'gliding'
        ) {
          continue;
        }
        if (dist3D(bot.position, payload.position) <= payload.radius) {
          bot.lastHeardNoisePos = { ...payload.position };
          bot.lastHeardNoiseTime = this.lastElapsed;
        }
      }
    });
  }

  spawnBots(count: number, busTotalDuration: number): void {
    this.bots = [];
    this.botMap.clear();
    this.lastElapsed = 0;
    this.matchCounter += 1;

    const total = Math.max(0, Math.floor(count));
    if (total === 0) return;

    const matchSeed = (this.baseSeed + this.matchCounter * 7919) >>> 0;
    const rng = mulberry32(matchSeed);

    const terrainPois = this.ctx.terrain.getPOIs();
    const poiList: POIDef[] = terrainPois.length > 0 ? terrainPois : POIS;

    const minJump = Math.min(1.2, Math.max(0.1, busTotalDuration * 0.1));
    const maxJump = Math.max(minJump + 0.5, busTotalDuration - 2.0);
    const bossCount = total >= 12 ? BOSS_SPECS.length : 0;
    const regularCount = total - bossCount;

    for (let i = 0; i < regularCount; i++) {
      const id = `bot_${i + 1}`;
      const cosmetics = pickBotLoadoutCosmetics(i, matchSeed);
      const poi = poiList[(i + Math.floor(rng() * poiList.length)) % poiList.length];

      // Pick landing offset around the target POI, avoiding water & volcano lava
      let dropX = poi.x + (rng() - 0.5) * poi.radius * 1.1;
      let dropZ = poi.z + (rng() - 0.5) * poi.radius * 1.1;
      if (isInVolcanoLavaHazard(dropX, dropZ, VOLCANO_LAVA_SAFE_RADIUS + 2)) {
        const safe = clampOutsideVolcanoLava(dropX, dropZ, VOLCANO_LAVA_SAFE_RADIUS + 2.5);
        dropX = safe.x;
        dropZ = safe.z;
      }
      if (this.ctx.terrain.isWater(dropX, dropZ)) {
        dropX = poi.x;
        dropZ = poi.z;
      }
      const dropY = this.ctx.terrain.getHeightAt(dropX, dropZ);

      // Spread jump times smoothly across bus flight
      const frac = regularCount > 1 ? i / (regularCount - 1) : 0.5;
      const jitter = (rng() - 0.5) * 1.8;
      const dropJumpTime = clamp(
        minJump + frac * (maxJump - minJump) + jitter,
        minJump,
        maxJump,
      );

      const bot: BotEntity = {
        id,
        name: cosmetics.name,
        skinId: cosmetics.skinId,
        pickaxeId: cosmetics.pickaxeId,
        gliderId: cosmetics.gliderId,
        personality: cosmetics.personality,
        state: 'bus',

        position: { x: 0, y: 175, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: rng() * Math.PI * 2,
        pitch: 0,
        grounded: false,
        isCrouching: false,
        isSprinting: false,
        moveSpeed: 0,
        radius: PLAYER_RADIUS,
        height: PLAYER_HEIGHT,

        hp: 100,
        maxHp: 100,
        shield: 0,
        maxShield: 100,
        alive: true,
        kills: 0,
        damageDealt: 0,

        animState: 'idle',
        isAiming: false,
        isFiring: false,
        isBuilding: false,
        emoteId: null,
        recoilKick: 0,
        harvestSwingTimer: 0,
        gliderOpen: false,
        gliderFactor: 0,

        inventory: {
          items: [
            {
              uid: `${id}_pickaxe`,
              weaponId: 'pickaxe',
              rarity: 'common',
              magAmmo: 0,
              stackCount: 1,
            },
            null,
            null,
            null,
            null,
            null,
          ],
          activeSlot: 0,
          ammo: {
            light: 0,
            medium: 0,
            shells: 0,
            heavy: 0,
            rockets: 0,
          },
          materials: {
            wood: 0,
            brick: 0,
            metal: 0,
          },
        },

        targetPoiId: poi.id,
        dropJumpTime,
        dropTarget: { x: dropX, y: dropY, z: dropZ },
        moveTarget: null,
        patrolAngle: rng() * Math.PI * 2,

        targetEnemyId: null,
        lastKnownEnemyPos: null,
        enemyLostTimer: 0,
        lastHeardNoisePos: null,
        lastHeardNoiseTime: -999,
        lastDamageTime: -999,
        lastDamagerId: null,
        lastAttackerName: null,
        lastDamageWeaponId: null,
        lastDamageRarity: null,
        lastDamageHeadshot: false,
        reactionTimer: 0,

        fireCooldown: 0,
        burstQueue: 0,
        burstTimer: 0,
        reloadTimer: 0,
        reloadSlot: 0,
        healTimer: 0,
        healSlot: 0,
        buildCooldown: 0,
        buildAnimTimer: 0,
        harvestCooldown: 0,

        strafeDir: rng() < 0.5 ? -1 : 1,
        strafeTimer: 0.5 + rng(),
        jumpCooldown: 0,
        crouchToggleTimer: 0.6 + rng(),
        stateTimer: 0,
        thinkCooldown: rng() * 0.35,
        scanCooldown: rng() * 0.16,

        harvestTargetId: null,
        lootTargetId: null,
        chestTargetId: null,
        ignoredTargetId: null,
        ignoredTargetUntil: 0,
        stuckTimer: 0,
        lastStuckCheckPos: { x: dropX, y: dropY, z: dropZ },

        rngState: ((matchSeed ^ ((i + 1) * 2654435761)) >>> 0) || 1,
        isBoss: false,
        throwCooldown: 0,
        retreatTimer: 0,
        launchPadCooldown: 0,
        launchPadTargetId: null,
      };

      this.bots.push(bot);
      this.botMap.set(id, bot);
    }

    // Spawn the 3 Named POI Mythic Bosses replacing 3 regular bots when count >= 12
    for (let b = 0; b < bossCount; b++) {
      const spec = BOSS_SPECS[b];
      const poi =
        poiList.find((p) => p.id === spec.poiId) ??
        POIS.find((p) => p.id === spec.poiId);
      let spawnX = (poi?.x ?? 0) + spec.offsetX;
      let spawnZ = (poi?.z ?? 0) + spec.offsetZ;
      if (isInVolcanoLavaHazard(spawnX, spawnZ, VOLCANO_LAVA_SAFE_RADIUS + 2)) {
        const safe = clampOutsideVolcanoLava(
          spawnX,
          spawnZ,
          VOLCANO_LAVA_SAFE_RADIUS + 2.5,
        );
        spawnX = safe.x;
        spawnZ = safe.z;
      }
      if (this.ctx.terrain.isWater(spawnX, spawnZ) && poi) {
        spawnX = poi.x;
        spawnZ = poi.z;
      }
      const spawnY = this.ctx.terrain.getHeightAt(spawnX, spawnZ);

      const boss: BotEntity = {
        id: spec.id,
        name: spec.name,
        skinId: spec.skinId,
        pickaxeId: spec.pickaxeId,
        gliderId: spec.gliderId,
        personality: spec.personality,
        state: 'rotating',

        position: { x: spawnX, y: spawnY, z: spawnZ },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: rng() * Math.PI * 2,
        pitch: 0,
        grounded: true,
        isCrouching: false,
        isSprinting: false,
        moveSpeed: 0,
        radius: PLAYER_RADIUS,
        height: PLAYER_HEIGHT,

        hp: 150,
        maxHp: 150,
        shield: 150,
        maxShield: 150,
        alive: true,
        kills: 0,
        damageDealt: 0,

        animState: 'idle',
        isAiming: false,
        isFiring: false,
        isBuilding: false,
        emoteId: null,
        recoilKick: 0,
        harvestSwingTimer: 0,
        gliderOpen: false,
        gliderFactor: 0,

        inventory: {
          items: [
            {
              uid: `${spec.id}_pickaxe`,
              weaponId: 'pickaxe',
              rarity: 'common',
              magAmmo: 0,
              stackCount: 1,
            },
            {
              uid: `${spec.id}_mythic_rifle`,
              weaponId: 'mythic_blade_rifle',
              rarity: 'mythic',
              magAmmo: WEAPONS.mythic_blade_rifle.magSize,
              stackCount: 1,
            },
            {
              uid: `${spec.id}_heavy_shotgun`,
              weaponId: 'heavy_shotgun',
              rarity: 'legendary',
              magAmmo: WEAPONS.heavy_shotgun.magSize,
              stackCount: 1,
            },
            {
              uid: `${spec.id}_chug_splash`,
              weaponId: 'chug_splash',
              rarity: 'rare',
              magAmmo: 0,
              stackCount: 4,
            },
            null,
            null,
          ],
          activeSlot: 1,
          ammo: {
            light: 0,
            medium: 150,
            shells: 28,
            heavy: 0,
            rockets: 0,
          },
          materials: {
            wood: 150,
            brick: 100,
            metal: 60,
          },
        },

        targetPoiId: spec.poiId,
        dropJumpTime: 0,
        dropTarget: { x: spawnX, y: spawnY, z: spawnZ },
        moveTarget: { x: spawnX, y: spawnY, z: spawnZ },
        patrolAngle: rng() * Math.PI * 2,

        targetEnemyId: null,
        lastKnownEnemyPos: null,
        enemyLostTimer: 0,
        lastHeardNoisePos: null,
        lastHeardNoiseTime: -999,
        lastDamageTime: -999,
        lastDamagerId: null,
        lastAttackerName: null,
        lastDamageWeaponId: null,
        lastDamageRarity: null,
        lastDamageHeadshot: false,
        reactionTimer: 0,

        fireCooldown: 0,
        burstQueue: 0,
        burstTimer: 0,
        reloadTimer: 0,
        reloadSlot: 0,
        healTimer: 0,
        healSlot: 0,
        buildCooldown: 0,
        buildAnimTimer: 0,
        harvestCooldown: 0,

        strafeDir: rng() < 0.5 ? -1 : 1,
        strafeTimer: 0.5 + rng(),
        jumpCooldown: 0,
        crouchToggleTimer: 0.6 + rng(),
        stateTimer: 0,
        thinkCooldown: rng() * 0.25,
        scanCooldown: rng() * 0.16,

        harvestTargetId: null,
        lootTargetId: null,
        chestTargetId: null,
        ignoredTargetId: null,
        ignoredTargetUntil: 0,
        stuckTimer: 0,
        lastStuckCheckPos: { x: spawnX, y: spawnY, z: spawnZ },

        rngState: ((matchSeed ^ ((regularCount + b + 1) * 2654435761)) >>> 0) || 1,
        isBoss: true,
        bossPoiId: spec.poiId,
        bossHomePos: { x: spawnX, y: spawnY, z: spawnZ },
        throwCooldown: 0,
        retreatTimer: 0,
        launchPadCooldown: 0,
        launchPadTargetId: null,
      };

      this.bots.push(boss);
      this.botMap.set(spec.id, boss);
    }
  }

  update(
    dt: number,
    elapsed: number,
    busPos: Vec3Like,
    playerPos: Vec3Like,
  ): void {
    this.lastElapsed = elapsed;
    for (const bot of this.bots) {
      if (!bot.alive || bot.state === 'eliminated') continue;
      const distToPlayer = dist3D(bot.position, playerPos);
      const isFarLOD = distToPlayer > 180;
      updateBot(
        bot,
        this.ctx,
        this.difficulty,
        busPos,
        elapsed,
        dt,
        isFarLOD,
      );
    }
  }

  /**
   * Applies incoming damage to a bot. Returns `true` if the bot existed and was alive
   * when damaged, or `false` if the bot was not found or already eliminated.
   */
  onBotDamaged(
    botId: string,
    damageEvent: DamageEvent,
    nowSec: number,
  ): boolean {
    const bot = this.botMap.get(botId);
    if (!bot || !bot.alive || bot.state === 'eliminated') {
      return false;
    }

    if (damageEvent.shieldDamage > 0 || damageEvent.hpDamage > 0) {
      const shieldDmg = Math.min(bot.shield, Math.max(0, damageEvent.shieldDamage));
      const overflow = Math.max(0, damageEvent.shieldDamage - shieldDmg);
      bot.shield = Math.max(0, bot.shield - shieldDmg);
      bot.hp = Math.max(0, bot.hp - Math.max(0, damageEvent.hpDamage) - overflow);
    } else if (damageEvent.damage > 0) {
      const absorbed = Math.min(bot.shield, damageEvent.damage);
      bot.shield = Math.max(0, bot.shield - absorbed);
      bot.hp = Math.max(0, bot.hp - (damageEvent.damage - absorbed));
    }

    bot.lastDamageTime = nowSec;
    bot.lastDamagerId = damageEvent.attackerId;
    bot.lastAttackerName = damageEvent.attackerName;
    bot.lastDamageWeaponId = damageEvent.weaponId;
    bot.lastDamageRarity = damageEvent.rarity;
    bot.lastDamageHeadshot = damageEvent.isHeadshot;

    if (bot.hp <= 0) {
      this.eliminateBot(bot, {
        killerId: damageEvent.attackerId,
        killerName: damageEvent.attackerName,
        weaponId: damageEvent.weaponId,
        rarity: damageEvent.rarity,
        isHeadshot: damageEvent.isHeadshot,
        isStorm: false,
        distance: damageEvent.distance,
        timestamp: nowSec,
      });
      return true;
    }

    // Alert living bot to its attacker
    if (
      damageEvent.attackerId &&
      damageEvent.attackerId !== bot.id &&
      bot.state !== 'bus' &&
      bot.state !== 'skydiving' &&
      bot.state !== 'gliding'
    ) {
      if (!bot.targetEnemyId) {
        bot.targetEnemyId = damageEvent.attackerId;
        bot.reactionTimer = Math.min(bot.reactionTimer, 0.08);
      }
    }

    return true;
  }

  applyStormDamage(dt: number): void {
    const storm = this.ctx.storm;
    if (dt <= 0 || storm.dps <= 0) return;

    const dmg = storm.dps * dt;
    for (const bot of this.bots) {
      if (!bot.alive || bot.state === 'eliminated' || bot.state === 'bus') continue;
      const d = dist2D(
        bot.position.x,
        bot.position.z,
        storm.currentCenterX,
        storm.currentCenterZ,
      );
      if (d > storm.currentRadius) {
        bot.hp = Math.max(0, bot.hp - dmg);
        if (bot.hp <= 0) {
          this.eliminateBot(bot, {
            killerId: 'storm',
            killerName: 'The Storm',
            weaponId: bot.lastDamageWeaponId ?? 'pistol',
            rarity: bot.lastDamageRarity ?? 'common',
            isHeadshot: false,
            isStorm: true,
            distance: 0,
            timestamp: this.lastElapsed,
          });
        }
      }
    }
  }

  private eliminateBot(bot: BotEntity, meta: EliminationMeta): void {
    if (!bot.alive) return;
    bot.alive = false;
    bot.hp = 0;
    bot.state = 'eliminated';
    bot.moveSpeed = 0;
    bot.isFiring = false;
    bot.isAiming = false;
    bot.isBuilding = false;
    bot.gliderOpen = false;
    bot.gliderFactor = 0;

    if (!meta.isStorm && meta.killerId && meta.killerId !== bot.id) {
      const killerBot = this.botMap.get(meta.killerId);
      if (killerBot) {
        killerBot.kills += 1;
      }
    }

    if (bot.isBoss) {
      this.ensureBossEliminationDrops(bot);
    }

    this.ctx.dropBotLoot(bot);

    const skinColor = SKINS.find((s) => s.id === bot.skinId)?.primaryColor;
    this.ctx.eventBus.emit('vfx:elimination', {
      position: { ...bot.position },
      skinColor,
    });

    const entry: KillFeedEntry = {
      id: `kf_${++this.killFeedSeq}_${bot.id}`,
      killerId: meta.killerId,
      killerName: meta.killerName,
      victimId: bot.id,
      victimName: bot.name,
      weaponId: meta.weaponId,
      rarity: meta.rarity,
      isHeadshot: meta.isHeadshot,
      isStorm: meta.isStorm,
      distance: Math.round(meta.distance),
      timestamp: meta.timestamp,
      involvesPlayer:
        meta.killerId === 'player' || bot.id === 'player',
    };
    this.ctx.eventBus.emit('combat:killfeed', entry);
  }

  private ensureBossEliminationDrops(bot: BotEntity): void {
    const items = bot.inventory.items;

    const mythicIdx = items.findIndex(
      (it, idx) => idx > 0 && it?.weaponId === 'mythic_blade_rifle',
    );
    if (mythicIdx >= 1 && items[mythicIdx]) {
      items[mythicIdx]!.rarity = 'mythic';
      if (items[mythicIdx]!.magAmmo <= 0) {
        items[mythicIdx]!.magAmmo = WEAPONS.mythic_blade_rifle.magSize;
      }
    } else {
      const targetSlot = items.findIndex((it, idx) => idx > 0 && it === null);
      const slot = targetSlot >= 1 ? targetSlot : 1;
      items[slot] = {
        uid: `${bot.id}_mythic_rifle_drop`,
        weaponId: 'mythic_blade_rifle',
        rarity: 'mythic',
        magAmmo: WEAPONS.mythic_blade_rifle.magSize,
        stackCount: 1,
      };
    }

    const chugIdx = items.findIndex(
      (it, idx) => idx > 0 && it?.weaponId === 'chug_splash',
    );
    if (chugIdx >= 1 && items[chugIdx]) {
      items[chugIdx]!.stackCount = Math.max(2, items[chugIdx]!.stackCount);
    } else {
      const targetSlot = items.findIndex((it, idx) => idx > 0 && it === null);
      const slot = targetSlot >= 1 ? targetSlot : 3;
      items[slot] = {
        uid: `${bot.id}_chug_splash_drop`,
        weaponId: 'chug_splash',
        rarity: 'rare',
        magAmmo: 0,
        stackCount: 2,
      };
    }
  }

  getBots(): BotEntity[] {
    return this.bots;
  }

  getAliveCount(): number {
    let count = 0;
    for (const bot of this.bots) {
      if (bot.alive) count++;
    }
    return count;
  }

  getAliveBots(): BotEntity[] {
    return this.bots.filter((b) => b.alive);
  }

  getBotById(id: string): BotEntity | undefined {
    return this.botMap.get(id);
  }

  getRenderStates(): BotRenderState[] {
    return this.bots.map((bot) => {
      const activeItem = bot.inventory.items[bot.inventory.activeSlot];
      return {
        id: bot.id,
        name: bot.name,
        state: bot.state,
        alive: bot.alive,
        skinId: bot.skinId,
        pickaxeId: bot.pickaxeId,
        gliderId: bot.gliderId,
        gliderOpen: bot.gliderOpen,
        gliderFactor: bot.gliderFactor,
        isCrouching: bot.isCrouching,
        isHiddenInBus: bot.state === 'bus' || !bot.alive,

        position: { ...bot.position },
        yaw: bot.yaw,
        pitch: bot.pitch,
        animState: bot.animState,
        weaponId: activeItem ? activeItem.weaponId : 'pickaxe',
        isAiming: bot.isAiming,
        isFiring: bot.isFiring,
        isBuilding: bot.isBuilding,
        emoteId: bot.emoteId,
        moveSpeed: bot.moveSpeed,
        grounded: bot.grounded,
        health: bot.hp,
        shield: bot.shield,
        recoilKick: bot.recoilKick,
        harvestSwingTimer: bot.harvestSwingTimer,
        isBoss: Boolean(bot.isBoss),
        bossPoiId: bot.bossPoiId,
      };
    });
  }

  getBotSummaries(): BotSummary[] {
    return this.bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      state: bot.state,
      personality: bot.personality,
      skinId: bot.skinId,
      hp: bot.hp,
      shield: bot.shield,
      alive: bot.alive,
      kills: bot.kills,
      position: { ...bot.position },
      isBoss: Boolean(bot.isBoss),
      bossPoiId: bot.bossPoiId,
    }));
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
  }

  getDifficulty(): Difficulty {
    return this.difficulty;
  }

  reset(): void {
    this.bots = [];
    this.botMap.clear();
    this.lastElapsed = 0;
  }

  dispose(): void {
    this.unsubNoise?.();
    this.unsubNoise = null;
    this.reset();
  }
}
