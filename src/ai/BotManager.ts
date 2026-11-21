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
  clamp,
  dist2D,
  dist3D,
  mulberry32,
} from '../core';
import { updateBot } from './BotBrain';
import { pickBotLoadoutCosmetics } from './BotNames';
import type { BotEntity, BotRenderState, BotWorldContext } from './BotTypes';

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

    for (let i = 0; i < total; i++) {
      const id = `bot_${i + 1}`;
      const cosmetics = pickBotLoadoutCosmetics(i, matchSeed);
      const poi = poiList[(i + Math.floor(rng() * poiList.length)) % poiList.length];

      // Pick landing offset around the target POI, avoiding water
      let dropX = poi.x + (rng() - 0.5) * poi.radius * 1.1;
      let dropZ = poi.z + (rng() - 0.5) * poi.radius * 1.1;
      if (this.ctx.terrain.isWater(dropX, dropZ)) {
        dropX = poi.x;
        dropZ = poi.z;
      }
      const dropY = this.ctx.terrain.getHeightAt(dropX, dropZ);

      // Spread jump times smoothly across bus flight
      const frac = total > 1 ? i / (total - 1) : 0.5;
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
      };

      this.bots.push(bot);
      this.botMap.set(id, bot);
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
