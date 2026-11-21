import type {
  BotSummary,
  DamageEvent,
  Difficulty,
  GameModeId,
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
  BossEliminationRecord,
  BotEntity,
  BotRenderState,
  BotWorldContext,
  BountyReward,
  BountyTargetSummary,
  NamedBossSpec,
} from './BotTypes';

export const BOUNTY_DURATION_SEC = 90;
export const BOUNTY_RESELECT_COOLDOWN_SEC = 12;

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

interface ActiveBounty {
  targetId: string;
  targetName: string;
  startedAt: number;
  expiresAt: number;
  rewardLabel: string;
  rewardShield: number;
  rewardMats: number;
  rewardXp: number;
}

/**
 * Coordinates spawning, updating, LOD throttling, storm ticking, damage handling,
 * bounty hunts, boss tracking, and elimination lifecycle for all AI bots in a match.
 */
export class BotManager {
  private ctx: BotWorldContext;
  private difficulty: Difficulty;
  private gameMode: GameModeId;
  private baseSeed: number;
  private matchCounter = 0;
  private bots: BotEntity[] = [];
  private botMap = new Map<string, BotEntity>();
  private lastElapsed = 0;
  private killFeedSeq = 0;
  private busTotalDuration = 20;
  private activeBounty: ActiveBounty | null = null;
  private lastBountyTargetId: string | null = null;
  private nextAutoBountyAt = 0;
  private hasHadBounty = false;
  private pendingBountyRewards: BountyReward[] = [];
  private lastBountyReward: BountyReward | null = null;
  private playerEliminatedBossIds = new Set<string>();
  private playerEliminatedBosses: BossEliminationRecord[] = [];
  private pendingVaultKeyBosses: BossEliminationRecord[] = [];
  private onBossEliminatedCallback: ((record: BossEliminationRecord) => void) | null = null;
  private unsubNoise: (() => void) | null = null;

  constructor(
    ctx: BotWorldContext,
    difficulty: Difficulty = 'standard',
    seed = 9001,
    gameMode: GameModeId = 'solo',
  ) {
    this.ctx = ctx;
    this.difficulty = difficulty;
    this.baseSeed = seed;
    this.gameMode = gameMode;
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

  private resetBountyAndBossState(): void {
    this.activeBounty = null;
    this.lastBountyTargetId = null;
    this.nextAutoBountyAt = 0;
    this.hasHadBounty = false;
    this.pendingBountyRewards = [];
    this.lastBountyReward = null;
    this.playerEliminatedBossIds.clear();
    this.playerEliminatedBosses = [];
    this.pendingVaultKeyBosses = [];
  }

  spawnBots(
    count = 20,
    busTotalDuration = 20,
    mode?: GameModeId,
  ): void {
    if (mode !== undefined) {
      this.gameMode = mode;
    }
    this.bots = [];
    this.botMap.clear();
    this.lastElapsed = 0;
    this.matchCounter += 1;
    this.resetBountyAndBossState();
    this.busTotalDuration = busTotalDuration;
    this.nextAutoBountyAt = Math.max(0, busTotalDuration) + 4.0;

    const total = Math.max(0, Math.floor(count));
    if (total === 0) return;

    const matchSeed = (this.baseSeed + this.matchCounter * 7919) >>> 0;
    const rng = mulberry32(matchSeed);

    const terrainPois = this.ctx.terrain.getPOIs();
    const poiList: POIDef[] = terrainPois.length > 0 ? terrainPois : POIS;

    const isZeroBuild = this.gameMode === 'zero_build';
    const isBlitz = this.gameMode === 'blitz';
    const minJump = isBlitz
      ? Math.min(0.35, Math.max(0.05, busTotalDuration * 0.025))
      : Math.min(1.2, Math.max(0.1, busTotalDuration * 0.1));
    const maxJump = isBlitz
      ? Math.max(
          minJump + 0.4,
          Math.min(busTotalDuration * 0.45, Math.max(2.0, busTotalDuration - 2.0)),
        )
      : Math.max(minJump + 0.5, busTotalDuration - 2.0);
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
      const jitter = (rng() - 0.5) * (isBlitz ? 0.9 : 1.8);
      const dropJumpTime = clamp(
        minJump + frac * (maxJump - minJump) + jitter,
        minJump,
        maxJump,
      );

      const blitzWeaponId: WeaponId | null = isBlitz
        ? (i + (matchSeed & 1)) % 2 === 0
          ? 'ar'
          : 'smg'
        : null;
      const blitzStarterItem = blitzWeaponId
        ? {
            uid: `${id}_blitz_starter`,
            weaponId: blitzWeaponId,
            rarity: 'uncommon' as const,
            magAmmo: WEAPONS[blitzWeaponId].magSize,
            stackCount: 1,
          }
        : null;

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
        overshield: isZeroBuild ? 50 : 0,
        maxOvershield: isZeroBuild ? 50 : 0,
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
            blitzStarterItem,
            null,
            null,
            null,
            null,
          ],
          activeSlot: blitzStarterItem ? 1 : 0,
          ammo: {
            light: blitzWeaponId === 'smg' ? 60 : 0,
            medium: blitzWeaponId === 'ar' ? 60 : 0,
            shells: 0,
            heavy: 0,
            rockets: 0,
          },
          materials: {
            wood: isBlitz ? 100 : 0,
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
        shieldBubbleCooldown: 0,
        recentDamageTaken: 0,
        recentDamageWindowStart: -999,
        eliminatedByPlayer: false,
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
        overshield: isZeroBuild ? 50 : 0,
        maxOvershield: isZeroBuild ? 50 : 0,
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
        shieldBubbleCooldown: 0,
        recentDamageTaken: 0,
        recentDamageWindowStart: -999,
        eliminatedByPlayer: false,
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
    const safeOvershieldDt = Math.max(0, dt);
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
        this.gameMode,
      );
      if (
        this.gameMode === 'zero_build' &&
        bot.alive &&
        bot.hp > 0 &&
        bot.state !== 'bus' &&
        safeOvershieldDt > 0
      ) {
        const maxOs = bot.maxOvershield ?? 50;
        const curOs = bot.overshield ?? 0;
        const timeSinceDamage =
          bot.lastDamageTime < 0 ? Infinity : elapsed - bot.lastDamageTime;
        if (curOs < maxOs && timeSinceDamage >= 6.5) {
          bot.overshield = Math.min(maxOs, curOs + 12 * safeOvershieldDt);
        }
      }
    }
    this.stepBountyLifecycle(playerPos, elapsed);
  }

  private stepBountyLifecycle(playerPos: Vec3Like, nowSec: number): void {
    if (this.activeBounty) {
      const target = this.botMap.get(this.activeBounty.targetId);
      if (!target || !target.alive || target.state === 'eliminated') {
        this.activeBounty = null;
        this.nextAutoBountyAt = Math.max(
          this.nextAutoBountyAt,
          nowSec + BOUNTY_RESELECT_COOLDOWN_SEC,
        );
      } else if (nowSec >= this.activeBounty.expiresAt) {
        this.expireActiveBounty(nowSec);
      }
    }

    if (
      !this.activeBounty &&
      this.getAliveCount() > 0 &&
      nowSec >= this.nextAutoBountyAt
    ) {
      const hasGroundedBot = this.bots.some(
        (b) =>
          b.alive &&
          b.state !== 'eliminated' &&
          b.state !== 'bus' &&
          b.state !== 'skydiving' &&
          b.state !== 'gliding',
      );
      if (this.hasHadBounty || (nowSec >= this.busTotalDuration + 4.0 && hasGroundedBot)) {
        this.assignBounty(playerPos, nowSec);
      }
    }
  }

  private expireActiveBounty(nowSec: number): void {
    if (!this.activeBounty) return;
    const expired = this.activeBounty;
    this.activeBounty = null;
    this.nextAutoBountyAt = nowSec + BOUNTY_RESELECT_COOLDOWN_SEC;
    this.ctx.eventBus.emit('ui:bounty', {
      title: 'BOUNTY EXPIRED',
      targetName: expired.targetName,
      tone: 'expired',
    });
    this.ctx.eventBus.emit('sound:play', {
      id: 'bounty_alert',
    });
  }

  private buildBountySummary(
    bot: BotEntity,
    playerPos: Vec3Like,
    nowSec: number,
  ): BountyTargetSummary {
    return {
      targetName: bot.name,
      distance: dist3D(playerPos, bot.position),
      timeRemaining: Math.max(
        0,
        (this.activeBounty?.expiresAt ?? nowSec) - nowSec,
      ),
      rewardLabel: this.activeBounty?.rewardLabel ?? '+50 SHIELD • +75 MATS',
    };
  }

  /**
   * Assigns an active 90s Bounty Hunt target from living bots and emits `'ui:bounty'` (`start`)
   * + `'bounty_alert'` SFX. If an unexpired living bounty is already active, returns it.
   */
  assignBounty(playerPos: Vec3Like, nowSec: number): BountyTargetSummary | null {
    if (this.activeBounty) {
      const existing = this.botMap.get(this.activeBounty.targetId);
      if (!existing || !existing.alive || existing.state === 'eliminated') {
        this.activeBounty = null;
      } else if (nowSec >= this.activeBounty.expiresAt) {
        this.expireActiveBounty(nowSec);
      } else {
        return this.buildBountySummary(existing, playerPos, nowSec);
      }
    }

    const aliveBots = this.bots.filter(
      (b) => b.alive && b.state !== 'eliminated',
    );
    if (aliveBots.length === 0) return null;

    const hasNonBus = aliveBots.some((b) => b.state !== 'bus');
    const hasOtherThanLast = aliveBots.some((b) => b.id !== this.lastBountyTargetId);
    const hasNonBoss = aliveBots.some((b) => !b.isBoss);

    let best: BotEntity = aliveBots[0];
    let bestScore = -Infinity;
    for (const bot of aliveBots) {
      const d = dist3D(playerPos, bot.position);
      let score = -Math.abs(d - 85);
      if (hasNonBus && bot.state === 'bus') score -= 1000;
      if (hasOtherThanLast && bot.id === this.lastBountyTargetId) score -= 500;
      if (hasNonBoss && bot.isBoss) score -= 250;
      if (score > bestScore) {
        bestScore = score;
        best = bot;
      }
    }

    const rewardShield = best.isBoss ? 75 : 50;
    const rewardMats = best.isBoss ? 150 : 75;
    const rewardXp = best.isBoss ? 300 : 150;
    const rewardLabel = `+${rewardShield} SHIELD • +${rewardMats} MATS`;

    this.activeBounty = {
      targetId: best.id,
      targetName: best.name,
      startedAt: nowSec,
      expiresAt: nowSec + BOUNTY_DURATION_SEC,
      rewardLabel,
      rewardShield,
      rewardMats,
      rewardXp,
    };
    this.lastBountyTargetId = best.id;
    this.hasHadBounty = true;

    this.ctx.eventBus.emit('ui:bounty', {
      title: 'BOUNTY HUNT',
      targetName: best.name,
      tone: 'start',
    });
    this.ctx.eventBus.emit('sound:play', {
      id: 'bounty_alert',
    });

    return this.buildBountySummary(best, playerPos, nowSec);
  }

  /**
   * Returns the current Bounty Hunt HUD summary (auto-expiring after 90s if elapsed),
   * or `null` if no living bounty is active.
   */
  getBountyTarget(playerPos: Vec3Like, nowSec: number): BountyTargetSummary | null {
    if (!this.activeBounty) return null;
    const bot = this.botMap.get(this.activeBounty.targetId);
    if (!bot || !bot.alive || bot.state === 'eliminated') {
      this.activeBounty = null;
      return null;
    }
    if (nowSec >= this.activeBounty.expiresAt) {
      this.expireActiveBounty(nowSec);
      return null;
    }
    return this.buildBountySummary(bot, playerPos, nowSec);
  }

  getActiveBountyBot(): BotEntity | null {
    if (!this.activeBounty) return null;
    const bot = this.botMap.get(this.activeBounty.targetId);
    return bot && bot.alive && bot.state !== 'eliminated' ? bot : null;
  }

  consumeBountyRewards(): BountyReward[] {
    if (this.pendingBountyRewards.length === 0) return [];
    const copy = [...this.pendingBountyRewards];
    this.pendingBountyRewards.length = 0;
    return copy;
  }

  getLastBountyReward(): BountyReward | null {
    return this.lastBountyReward;
  }

  /**
   * Returns `true` if `botId` (or any Named Boss if `botId` is omitted) was a Named Boss
   * eliminated directly by `'player'`, qualifying the player for a Vault Key.
   */
  wasBossEliminatedByPlayer(botId?: string): boolean {
    if (botId !== undefined) {
      return this.playerEliminatedBossIds.has(botId);
    }
    return this.playerEliminatedBossIds.size > 0;
  }

  consumePlayerEliminatedBosses(): BossEliminationRecord[] {
    if (this.pendingVaultKeyBosses.length === 0) return [];
    const copy = [...this.pendingVaultKeyBosses];
    this.pendingVaultKeyBosses.length = 0;
    return copy;
  }

  getPlayerEliminatedBosses(): BossEliminationRecord[] {
    return [...this.playerEliminatedBosses];
  }

  setOnBossEliminatedByPlayer(
    cb: ((record: BossEliminationRecord) => void) | null,
  ): void {
    this.onBossEliminatedCallback = cb;
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

    const prevHp = bot.hp;
    const prevShield = bot.shield;
    const prevOvershield = bot.overshield ?? 0;
    const isStorm = damageEvent.attackerId === 'storm';

    if (!isStorm && prevOvershield > 0) {
      const totalIncoming = Math.max(
        0,
        damageEvent.damage > 0
          ? damageEvent.damage
          : damageEvent.shieldDamage + damageEvent.hpDamage,
      );
      const osAbsorbed = Math.min(prevOvershield, totalIncoming);
      bot.overshield = Math.max(0, prevOvershield - osAbsorbed);
      const afterOs = Math.max(0, totalIncoming - osAbsorbed);
      const shieldAbsorbed = Math.min(bot.shield, afterOs);
      bot.shield = Math.max(0, bot.shield - shieldAbsorbed);
      const hpAbsorbed = Math.max(0, afterOs - shieldAbsorbed);
      bot.hp = Math.max(0, bot.hp - hpAbsorbed);
    } else if (damageEvent.shieldDamage > 0 || damageEvent.hpDamage > 0) {
      const shieldDmg = isStorm
        ? 0
        : Math.min(bot.shield, Math.max(0, damageEvent.shieldDamage));
      const overflow = isStorm
        ? Math.max(0, damageEvent.shieldDamage)
        : Math.max(0, damageEvent.shieldDamage - shieldDmg);
      bot.shield = Math.max(0, bot.shield - shieldDmg);
      bot.hp = Math.max(0, bot.hp - Math.max(0, damageEvent.hpDamage) - overflow);
    } else if (damageEvent.damage > 0) {
      const absorbed = isStorm ? 0 : Math.min(bot.shield, damageEvent.damage);
      bot.shield = Math.max(0, bot.shield - absorbed);
      bot.hp = Math.max(0, bot.hp - (damageEvent.damage - absorbed));
    }

    const totalAppliedDamage =
      Math.max(0, prevOvershield - (bot.overshield ?? 0)) +
      Math.max(0, prevShield - bot.shield) +
      Math.max(0, prevHp - bot.hp);
    if (
      bot.recentDamageWindowStart === undefined ||
      nowSec - bot.recentDamageWindowStart > 3.0
    ) {
      bot.recentDamageWindowStart = nowSec;
      bot.recentDamageTaken = totalAppliedDamage;
    } else {
      bot.recentDamageTaken = (bot.recentDamageTaken ?? 0) + totalAppliedDamage;
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

  private eliminateBot(bot: BotEntity, meta: EliminationMeta): BountyReward | null {
    if (!bot.alive) return null;
    bot.alive = false;
    bot.hp = 0;
    bot.state = 'eliminated';
    bot.moveSpeed = 0;
    bot.isFiring = false;
    bot.isAiming = false;
    bot.isBuilding = false;
    bot.gliderOpen = false;
    bot.gliderFactor = 0;

    const killedByPlayer = !meta.isStorm && meta.killerId === 'player';
    bot.eliminatedByPlayer = killedByPlayer;

    if (!meta.isStorm && meta.killerId && meta.killerId !== bot.id) {
      const killerBot = this.botMap.get(meta.killerId);
      if (killerBot) {
        killerBot.kills += 1;
      }
    }

    if (bot.isBoss) {
      this.ensureBossEliminationDrops(bot);
      if (killedByPlayer) {
        this.playerEliminatedBossIds.add(bot.id);
        const record: BossEliminationRecord = {
          bossId: bot.id,
          bossName: bot.name,
          poiId: bot.bossPoiId ?? '',
          position: { ...bot.position },
          timestamp: meta.timestamp,
        };
        this.playerEliminatedBosses.push(record);
        this.pendingVaultKeyBosses.push(record);
        this.onBossEliminatedCallback?.(record);
      }
    }

    let bountyReward: BountyReward | null = null;
    if (this.activeBounty && this.activeBounty.targetId === bot.id) {
      if (meta.timestamp >= this.activeBounty.expiresAt) {
        this.expireActiveBounty(meta.timestamp);
      } else {
        const active = this.activeBounty;
        this.activeBounty = null;
        this.nextAutoBountyAt = meta.timestamp + BOUNTY_RESELECT_COOLDOWN_SEC;

        if (killedByPlayer) {
          bountyReward = {
            targetId: bot.id,
            targetName: bot.name,
            shield: active.rewardShield,
            materials: active.rewardMats,
            xp: active.rewardXp,
            rewardLabel: active.rewardLabel,
            timestamp: meta.timestamp,
          };
          this.pendingBountyRewards.push(bountyReward);
          this.lastBountyReward = bountyReward;

          this.ctx.eventBus.emit('ui:bounty', {
            title: `BOUNTY COMPLETE • ${active.rewardLabel}`,
            targetName: bot.name,
            tone: 'complete',
          });
          this.ctx.eventBus.emit('sound:play', {
            id: 'bounty_alert',
          });
        } else {
          this.ctx.eventBus.emit('ui:bounty', {
            title: 'BOUNTY POACHED',
            targetName: bot.name,
            tone: 'expired',
          });
          this.ctx.eventBus.emit('sound:play', {
            id: 'bounty_alert',
          });
        }
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
    return bountyReward;
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

  setGameMode(mode: GameModeId): void {
    const changed = this.gameMode !== mode;
    this.gameMode = mode;
    if (!changed) return;
    for (const bot of this.bots) {
      if (!bot.alive || bot.state === 'eliminated') continue;
      if (mode === 'zero_build') {
        bot.maxOvershield = 50;
        bot.overshield = 50;
      } else {
        bot.maxOvershield = 0;
        bot.overshield = 0;
      }
    }
  }

  getGameMode(): GameModeId {
    return this.gameMode;
  }

  reset(): void {
    this.bots = [];
    this.botMap.clear();
    this.lastElapsed = 0;
    this.resetBountyAndBossState();
  }

  dispose(): void {
    this.unsubNoise?.();
    this.unsubNoise = null;
    this.reset();
  }
}
