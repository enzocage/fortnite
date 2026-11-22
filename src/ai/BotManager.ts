import type {
  BotSummary,
  DamageEvent,
  Difficulty,
  GameModeId,
  KillFeedEntry,
  MedallionId,
  NpcSpecialistEntity,
  POIDef,
  Rarity,
  Vec3Like,
  WeaponId,
} from '../types';
import {
  DBNO_MAX_HP,
  MEDALLIONS,
  MEDALLION_CIRCLE_RADII,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  POIS,
  SKINS,
  WEAPONS,
  WORLD_HALF,
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
  AllySupportEvent,
  BossEliminationRecord,
  BotEntity,
  BotRenderState,
  BotWorldContext,
  BountyReward,
  BountyTargetSummary,
  DroppedCrownReward,
  DroppedMedallionReward,
  DroppedRewards,
  DuoPartnerHudState,
  MedallionHolderInfo,
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
  private allySeq = 0;
  private pendingAllySupportEvents: AllySupportEvent[] = [];
  private pendingDroppedMedallions: DroppedMedallionReward[] = [];
  private pendingDroppedCrowns: DroppedCrownReward[] = [];
  private onPlayerRevivedCallback: ((reviverId: string) => void) | null = null;

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
      if (
        !payload?.position ||
        !Number.isFinite(payload.position.x) ||
        !Number.isFinite(payload.position.y) ||
        !Number.isFinite(payload.position.z) ||
        !Number.isFinite(payload.radius) ||
        payload.radius <= 0
      ) {
        return;
      }
      const isFriendlySource =
        payload.sourceId === 'player' ||
        payload.sourceId === 'duo_partner' ||
        payload.sourceId.startsWith('reboot');
      for (const bot of this.bots) {
        if (!bot.alive || bot.state === 'eliminated' || bot.id === payload.sourceId) continue;
        if ((bot.isAlly || bot.isDuoPartner) && isFriendlySource) continue;
        if (
          bot.state === 'bus' ||
          bot.state === 'skydiving' ||
          bot.state === 'gliding' ||
          bot.state === 'knocked' ||
          bot.state === 'reviving' ||
          bot.isKnocked
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
    this.pendingDroppedMedallions = [];
    this.pendingDroppedCrowns = [];
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
    this.pendingAllySupportEvents = [];
    this.matchCounter += 1;
    this.resetBountyAndBossState();
    this.busTotalDuration = busTotalDuration;
    this.nextAutoBountyAt = Math.max(0, busTotalDuration) + 4.0;

    const total = Math.max(0, Math.floor(count));
    const matchSeed = (this.baseSeed + this.matchCounter * 7919) >>> 0;
    const rng = mulberry32(matchSeed);

    const terrainPois = this.ctx.terrain.getPOIs();
    const poiList: POIDef[] = terrainPois.length > 0 ? terrainPois : POIS;
    const isDuos = this.gameMode === 'duos';

    if (total === 0) {
      if (isDuos) {
        this.spawnDuoPartner(poiList, matchSeed);
      }
      return;
    }

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

    const crownIndices = new Set<number>();
    if (regularCount >= 2) {
      crownIndices.add(regularCount - 1);
      crownIndices.add(regularCount >= 4 ? regularCount - 3 : regularCount - 2);
    }

    for (let i = 0; i < regularCount; i++) {
      const id = `bot_${i + 1}`;
      const cosmetics = pickBotLoadoutCosmetics(i, matchSeed);
      const squadPartner = isDuos && i % 2 === 1 ? this.bots[i - 1] : undefined;
      const squadId = isDuos ? `squad_${Math.floor(i / 2) + 1}` : undefined;

      const poi = squadPartner
        ? poiList.find((p) => p.id === squadPartner.targetPoiId) ??
          poiList[(i + Math.floor(rng() * poiList.length)) % poiList.length]
        : poiList[(i + Math.floor(rng() * poiList.length)) % poiList.length];

      // Pick landing offset around the target POI (or near squadmate in Duos), avoiding water & volcano lava
      let dropX = squadPartner
        ? squadPartner.dropTarget.x + (rng() - 0.5) * 10 + 3.5
        : poi.x + (rng() - 0.5) * poi.radius * 1.1;
      let dropZ = squadPartner
        ? squadPartner.dropTarget.z + (rng() - 0.5) * 10 + 3.5
        : poi.z + (rng() - 0.5) * poi.radius * 1.1;
      if (isInVolcanoLavaHazard(dropX, dropZ, VOLCANO_LAVA_SAFE_RADIUS + 2)) {
        const safe = clampOutsideVolcanoLava(dropX, dropZ, VOLCANO_LAVA_SAFE_RADIUS + 2.5);
        dropX = safe.x;
        dropZ = safe.z;
      }
      if (this.ctx.terrain.isWater(dropX, dropZ)) {
        dropX = squadPartner ? squadPartner.dropTarget.x : poi.x;
        dropZ = squadPartner ? squadPartner.dropTarget.z : poi.z;
      }
      const dropY = this.ctx.terrain.getHeightAt(dropX, dropZ);

      // Spread jump times smoothly across bus flight (matching squad partner in Duos)
      const frac = regularCount > 1 ? i / (regularCount - 1) : 0.5;
      const jitter = (rng() - 0.5) * (isBlitz ? 0.9 : 1.8);
      const dropJumpTime = squadPartner
        ? squadPartner.dropJumpTime
        : clamp(minJump + frac * (maxJump - minJump) + jitter, minJump, maxJump);

      const hasVictoryCrown = crownIndices.has(i);
      const blitzWeaponId: WeaponId | null = isBlitz
        ? (i + (matchSeed & 1)) % 2 === 0
          ? 'ar'
          : 'smg'
        : null;
      const crownWeaponId: WeaponId | null =
        !isBlitz && hasVictoryCrown ? (i === regularCount - 1 ? 'combat_smg' : 'ar') : null;
      const starterWeaponId = blitzWeaponId ?? crownWeaponId;
      const starterItem = starterWeaponId
        ? {
            uid: `${id}_${blitzWeaponId ? 'blitz' : 'crown'}_starter`,
            weaponId: starterWeaponId,
            rarity: blitzWeaponId ? ('uncommon' as const) : ('rare' as const),
            magAmmo: WEAPONS[starterWeaponId].magSize,
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
        shield: hasVictoryCrown ? 50 : 0,
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
            starterItem,
            null,
            null,
            null,
            null,
          ],
          activeSlot: starterItem ? 1 : 0,
          ammo: {
            light: starterWeaponId === 'smg' || starterWeaponId === 'combat_smg' ? 90 : 0,
            medium: starterWeaponId === 'ar' ? 90 : 0,
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
        squadId,
        isDuoPartner: false,
        isKnocked: false,
        reviveProgress: 0,
        reviveTargetId: null,
        isReviving: false,
        hasVictoryCrown,
        medallions: [],
        medallionCount: 0,
        throwCooldown: 0,
        retreatTimer: 0,
        launchPadCooldown: 0,
        launchPadTargetId: null,
        shieldBubbleCooldown: 0,
        recentDamageTaken: 0,
        recentDamageWindowStart: -999,
        eliminatedByPlayer: false,
        riftCooldown: 0,
        riftTargetId: null,
        captureTargetId: null,
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
      const bossMedallion = MEDALLIONS.find((m) => m.bossPoiId === spec.poiId);
      const bossMedallions: MedallionId[] = bossMedallion ? [bossMedallion.id] : [];

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
        isDuoPartner: false,
        isKnocked: false,
        reviveProgress: 0,
        reviveTargetId: null,
        isReviving: false,
        hasVictoryCrown: false,
        medallions: bossMedallions,
        medallionCount: bossMedallions.length,
        throwCooldown: 0,
        retreatTimer: 0,
        launchPadCooldown: 0,
        launchPadTargetId: null,
        shieldBubbleCooldown: 0,
        recentDamageTaken: 0,
        recentDamageWindowStart: -999,
        eliminatedByPlayer: false,
        riftCooldown: 0,
        riftTargetId: null,
        captureTargetId: null,
      };

      this.bots.push(boss);
      this.botMap.set(spec.id, boss);
    }

    if (isDuos) {
      this.spawnDuoPartner(poiList, matchSeed);
    }
  }

  private spawnDuoPartner(poiList: POIDef[], matchSeed: number): BotEntity {
    const id = 'duo_partner';
    let spawnX = 4;
    let spawnZ = 4;
    if (this.ctx.terrain.isWater(spawnX, spawnZ)) {
      const dryPoi = poiList.find((p) => !this.ctx.terrain.isWater(p.x, p.z)) ?? poiList[0];
      spawnX = dryPoi?.x ?? 0;
      spawnZ = dryPoi?.z ?? 0;
    }
    if (isInVolcanoLavaHazard(spawnX, spawnZ, VOLCANO_LAVA_SAFE_RADIUS + 2)) {
      const safe = clampOutsideVolcanoLava(
        spawnX,
        spawnZ,
        VOLCANO_LAVA_SAFE_RADIUS + 2.5,
      );
      spawnX = safe.x;
      spawnZ = safe.z;
    }
    const spawnY = this.ctx.terrain.getHeightAt(spawnX, spawnZ);

    const partner: BotEntity = {
      id,
      name: 'APEX VALKYRIE',
      skinId: 'cyber_valkyrie',
      pickaxeId: 'plasma_katana',
      gliderId: 'cyber_falcon',
      personality: 'builder',
      state: 'rotating',

      position: { x: spawnX, y: spawnY, z: spawnZ },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      grounded: true,
      isCrouching: false,
      isSprinting: false,
      moveSpeed: 0,
      radius: PLAYER_RADIUS,
      height: PLAYER_HEIGHT,

      hp: 100,
      maxHp: 100,
      shield: 100,
      maxShield: 100,
      overshield: 0,
      maxOvershield: 0,
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
          {
            uid: `${id}_ar`,
            weaponId: 'ar',
            rarity: 'rare',
            magAmmo: WEAPONS.ar.magSize,
            stackCount: 1,
          },
          {
            uid: `${id}_combat_smg`,
            weaponId: 'combat_smg',
            rarity: 'rare',
            magAmmo: WEAPONS.combat_smg.magSize,
            stackCount: 1,
          },
          {
            uid: `${id}_pump`,
            weaponId: 'pump_shotgun',
            rarity: 'rare',
            magAmmo: WEAPONS.pump_shotgun.magSize,
            stackCount: 1,
          },
          {
            uid: `${id}_chug_splash`,
            weaponId: 'chug_splash',
            rarity: 'rare',
            magAmmo: 0,
            stackCount: 4,
          },
          null,
        ],
        activeSlot: 1,
        ammo: {
          light: 180,
          medium: 180,
          shells: 24,
          heavy: 0,
          rockets: 0,
        },
        materials: {
          wood: 100,
          brick: 0,
          metal: 0,
        },
      },

      targetPoiId: null,
      dropJumpTime: 0,
      dropTarget: { x: spawnX, y: spawnY, z: spawnZ },
      moveTarget: { x: spawnX, y: spawnY, z: spawnZ },
      patrolAngle: 0.75,

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

      strafeDir: 1,
      strafeTimer: 0.75,
      jumpCooldown: 0,
      crouchToggleTimer: 0.9,
      stateTimer: 0,
      thinkCooldown: 0,
      scanCooldown: 0,

      harvestTargetId: null,
      lootTargetId: null,
      chestTargetId: null,
      ignoredTargetId: null,
      ignoredTargetUntil: 0,
      stuckTimer: 0,
      lastStuckCheckPos: { x: spawnX, y: spawnY, z: spawnZ },

      rngState: ((matchSeed ^ 0x51a7b3c9) >>> 0) || 1,
      isBoss: false,
      isAlly: false,
      squadId: 'player_squad',
      isDuoPartner: true,
      isKnocked: false,
      reviveProgress: 0,
      reviveTargetId: null,
      isReviving: false,
      hasVictoryCrown: false,
      medallions: [],
      medallionCount: 0,
      throwCooldown: 0,
      retreatTimer: 0,
      launchPadCooldown: 0,
      launchPadTargetId: null,
      shieldBubbleCooldown: 0,
      recentDamageTaken: 0,
      recentDamageWindowStart: -999,
      eliminatedByPlayer: false,
      riftCooldown: 0,
      riftTargetId: null,
      captureTargetId: null,
    };

    this.bots.push(partner);
    this.botMap.set(id, partner);
    return partner;
  }

  /**
   * Spawns a friendly hired NPC specialist companion near `(npc.x, npc.z)`,
   * replacing any previously hired ally so at most 1 ally is active.
   */
  spawnAlliedSpecialist(npc: NpcSpecialistEntity): BotEntity {
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const existing = this.bots[i];
      if (existing.isAlly) {
        existing.alive = false;
        existing.state = 'eliminated';
        this.botMap.delete(existing.id);
        this.bots.splice(i, 1);
      }
    }

    const allySeq = ++this.allySeq;
    const id = `ally_${npc.id}_${allySeq}`;

    let spawnX = npc.x + 1.8;
    let spawnZ = npc.z + 1.4;
    if (isInVolcanoLavaHazard(spawnX, spawnZ, VOLCANO_LAVA_SAFE_RADIUS + 2)) {
      const safe = clampOutsideVolcanoLava(
        spawnX,
        spawnZ,
        VOLCANO_LAVA_SAFE_RADIUS + 2.5,
      );
      spawnX = safe.x;
      spawnZ = safe.z;
    }
    if (this.ctx.terrain.isWater(spawnX, spawnZ)) {
      spawnX = npc.x;
      spawnZ = npc.z;
    }
    const terrainY = this.ctx.terrain.getHeightAt(spawnX, spawnZ);
    const spawnY = Math.abs(npc.y - terrainY) <= 4 ? Math.max(terrainY, npc.y) : terrainY;

    const shieldAmount = npc.role === 'heavy' ? 125 : 100;
    const personality =
      npc.role === 'scout'
        ? 'sniper'
        : npc.role === 'heavy'
          ? 'rusher'
          : 'looter';
    const pickaxeId =
      npc.role === 'scout'
        ? 'neon_edge'
        : npc.role === 'medic'
          ? 'emerald_reaper'
          : 'storm_breaker';
    const gliderId =
      npc.role === 'scout'
        ? 'cyber_hover'
        : npc.role === 'medic'
          ? 'victory_brolly'
          : 'crimson_jet';

    const items: BotEntity['inventory']['items'] = [
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
    ];
    let ammo: BotEntity['inventory']['ammo'];

    if (npc.role === 'scout') {
      items[1] = {
        uid: `${id}_ar`,
        weaponId: 'ar',
        rarity: 'rare',
        magAmmo: WEAPONS.ar.magSize,
        stackCount: 1,
      };
      items[2] = {
        uid: `${id}_dmr`,
        weaponId: 'tactical_dmr',
        rarity: 'rare',
        magAmmo: WEAPONS.tactical_dmr.magSize,
        stackCount: 1,
      };
      items[3] = {
        uid: `${id}_sniper`,
        weaponId: 'sniper',
        rarity: 'rare',
        magAmmo: WEAPONS.sniper.magSize,
        stackCount: 1,
      };
      ammo = { light: 90, medium: 210, shells: 0, heavy: 24, rockets: 0 };
    } else if (npc.role === 'medic') {
      items[1] = {
        uid: `${id}_smg`,
        weaponId: 'smg',
        rarity: 'rare',
        magAmmo: WEAPONS.smg.magSize,
        stackCount: 1,
      };
      items[2] = {
        uid: `${id}_ar`,
        weaponId: 'ar',
        rarity: 'rare',
        magAmmo: WEAPONS.ar.magSize,
        stackCount: 1,
      };
      items[3] = {
        uid: `${id}_chug_splash`,
        weaponId: 'chug_splash',
        rarity: 'rare',
        magAmmo: 0,
        stackCount: 4,
      };
      ammo = { light: 210, medium: 180, shells: 0, heavy: 0, rockets: 0 };
    } else {
      items[1] = {
        uid: `${id}_heavy_sg`,
        weaponId: 'heavy_shotgun',
        rarity: 'epic',
        magAmmo: WEAPONS.heavy_shotgun.magSize,
        stackCount: 1,
      };
      items[2] = {
        uid: `${id}_ar`,
        weaponId: 'ar',
        rarity: 'rare',
        magAmmo: WEAPONS.ar.magSize,
        stackCount: 1,
      };
      ammo = { light: 0, medium: 180, shells: 42, heavy: 0, rockets: 0 };
    }

    const ally: BotEntity = {
      id,
      name: npc.name,
      skinId: npc.skinId || 'sky_striker',
      pickaxeId,
      gliderId,
      personality,
      state: 'rotating',

      position: { x: spawnX, y: spawnY, z: spawnZ },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      grounded: true,
      isCrouching: false,
      isSprinting: false,
      moveSpeed: 0,
      radius: PLAYER_RADIUS,
      height: PLAYER_HEIGHT,

      hp: 160,
      maxHp: 160,
      shield: shieldAmount,
      maxShield: shieldAmount,
      overshield: 0,
      maxOvershield: 0,
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
        items,
        activeSlot: 1,
        ammo,
        materials: {
          wood: 0,
          brick: 0,
          metal: 0,
        },
      },

      targetPoiId: npc.poiId,
      dropJumpTime: 0,
      dropTarget: { x: spawnX, y: spawnY, z: spawnZ },
      moveTarget: { x: spawnX, y: spawnY, z: spawnZ },
      patrolAngle: ((allySeq * 1.9) % (Math.PI * 2)),

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

      strafeDir: 1,
      strafeTimer: 0.75,
      jumpCooldown: 0,
      crouchToggleTimer: 0.9,
      stateTimer: 0,
      thinkCooldown: 0,
      scanCooldown: 0,

      harvestTargetId: null,
      lootTargetId: null,
      chestTargetId: null,
      ignoredTargetId: null,
      ignoredTargetUntil: 0,
      stuckTimer: 0,
      lastStuckCheckPos: { x: spawnX, y: spawnY, z: spawnZ },

      rngState: ((this.baseSeed ^ (allySeq * 2654435761)) >>> 0) || 1,
      isBoss: false,
      throwCooldown: 0,
      retreatTimer: 0,
      launchPadCooldown: 0,
      launchPadTargetId: null,
      shieldBubbleCooldown: 0,
      recentDamageTaken: 0,
      recentDamageWindowStart: -999,
      eliminatedByPlayer: false,
      riftCooldown: 0,
      riftTargetId: null,
      captureTargetId: null,
      isAlly: true,
      allyRole: npc.role,
      allyAbilityCooldown: 0,
    };

    this.bots.push(ally);
    this.botMap.set(ally.id, ally);
    return ally;
  }

  getHiredAlly(): BotEntity | null {
    for (const bot of this.bots) {
      if (bot.isAlly && bot.alive && bot.state !== 'eliminated') {
        return bot;
      }
    }
    return null;
  }

  getDuoPartner(): BotEntity | null {
    for (const bot of this.bots) {
      if (bot.isDuoPartner && bot.alive && bot.state !== 'eliminated') {
        return bot;
      }
    }
    return null;
  }

  getDuoPartnerHudState(playerPos: Vec3Like): DuoPartnerHudState | null {
    const partner = this.bots.find((b) => b.isDuoPartner);
    if (!partner) return null;
    const knocked = Boolean(partner.isKnocked || partner.state === 'knocked');
    return {
      name: partner.name,
      hp: partner.hp,
      maxHp: partner.maxHp,
      shield: partner.shield,
      maxShield: partner.maxShield,
      knocked,
      alive: partner.alive,
      bleedOutHp: knocked ? partner.bleedOutHp : undefined,
      distance: dist3D(playerPos, partner.position),
    };
  }

  reviveDuoPartner(): boolean {
    const partner = this.bots.find(
      (b) =>
        b.isDuoPartner &&
        b.alive &&
        (b.isKnocked || b.state === 'knocked'),
    );
    if (!partner) return false;
    partner.isKnocked = false;
    partner.bleedOutHp = undefined;
    partner.hp = Math.min(partner.maxHp, 30);
    partner.shield = 0;
    partner.state = 'rotating';
    partner.animState = 'idle';
    partner.isReviving = false;
    partner.reviveProgress = 0;
    partner.reviveTargetId = null;
    partner.isCrouching = false;
    partner.isGrinding = false;

    this.ctx.eventBus.emit('sound:play', {
      id: 'revive_complete',
      position: { ...partner.position },
      spatial: true,
    });
    this.ctx.eventBus.emit('vfx:revive_beam', {
      position: { ...partner.position },
      progress: 1,
    });
    return true;
  }

  hasPartnerRebootCard(): boolean {
    if (this.gameMode !== 'duos') return false;
    const partner =
      this.botMap.get('duo_partner') ??
      this.bots.find((b) => b.isDuoPartner);
    if (!partner) return false;
    return !partner.alive || partner.state === 'eliminated';
  }

  rebootDuoPartner(vanPos: Vec3Like): BotEntity | null {
    if (this.gameMode !== 'duos') return null;
    const partner =
      this.botMap.get('duo_partner') ??
      this.bots.find((b) => b.isDuoPartner);
    if (!partner || (partner.alive && partner.state !== 'eliminated')) {
      return null;
    }

    const rawX = Number.isFinite(vanPos.x) ? vanPos.x : 0;
    const rawZ = Number.isFinite(vanPos.z) ? vanPos.z : 0;
    const rawY = Number.isFinite(vanPos.y)
      ? vanPos.y
      : this.ctx.terrain.getHeightAt(rawX, rawZ);
    const spawnX = clamp(rawX, -WORLD_HALF + 8, WORLD_HALF - 8);
    const spawnZ = clamp(rawZ, -WORLD_HALF + 8, WORLD_HALF - 8);
    const spawnY = rawY + 32;

    let landingX = spawnX;
    let landingZ = spawnZ;
    if (isInVolcanoLavaHazard(landingX, landingZ, VOLCANO_LAVA_SAFE_RADIUS + 2)) {
      const safe = clampOutsideVolcanoLava(
        landingX,
        landingZ,
        VOLCANO_LAVA_SAFE_RADIUS + 2.5,
      );
      landingX = safe.x;
      landingZ = safe.z;
    }
    const landingY = this.ctx.terrain.getHeightAt(landingX, landingZ);

    partner.alive = true;
    partner.state = 'gliding';
    partner.animState = 'glide';
    partner.position = { x: spawnX, y: spawnY, z: spawnZ };
    partner.velocity = { x: 0, y: -3.5, z: 0 };
    partner.grounded = false;
    partner.gliderOpen = true;
    partner.gliderFactor = 0.5;
    partner.isCrouching = false;
    partner.isSprinting = false;
    partner.isAiming = false;
    partner.isFiring = false;
    partner.isBuilding = false;
    partner.isGrinding = false;
    partner.emoteId = null;
    partner.moveSpeed = 0;
    partner.recoilKick = 0;
    partner.harvestSwingTimer = 0;

    partner.hp = 100;
    partner.maxHp = 100;
    partner.shield = 0;
    partner.maxShield = 100;
    partner.overshield = 0;
    partner.maxOvershield = 0;
    partner.isKnocked = false;
    partner.bleedOutHp = undefined;
    partner.isReviving = false;
    partner.reviveProgress = 0;
    partner.reviveTargetId = null;
    partner.isDuoPartner = true;
    partner.squadId = 'player_squad';

    partner.dropTarget = { x: landingX, y: landingY, z: landingZ };
    partner.moveTarget = { x: landingX, y: landingY, z: landingZ };
    partner.targetEnemyId = null;
    partner.lastKnownEnemyPos = null;
    partner.enemyLostTimer = 0;
    partner.lastHeardNoisePos = null;
    partner.lastHeardNoiseTime = -999;
    partner.lastDamageTime = -999;
    partner.lastDamagerId = null;
    partner.lastAttackerName = null;
    partner.lastDamageWeaponId = null;
    partner.lastDamageRarity = null;
    partner.lastDamageHeadshot = false;
    partner.recentDamageTaken = 0;
    partner.recentDamageWindowStart = -999;
    partner.eliminatedByPlayer = false;
    partner.reactionTimer = 0;
    partner.fireCooldown = 0;
    partner.burstQueue = 0;
    partner.burstTimer = 0;
    partner.reloadTimer = 0;
    partner.reloadSlot = 0;
    partner.healTimer = 0;
    partner.healSlot = 0;
    partner.buildCooldown = 0;
    partner.buildAnimTimer = 0;
    partner.harvestCooldown = 0;
    partner.retreatTimer = 0;
    partner.stateTimer = 0;
    partner.stuckTimer = 0;
    partner.lastStuckCheckPos = { ...partner.position };

    partner.inventory = {
      items: [
        {
          uid: `${partner.id}_pickaxe`,
          weaponId: 'pickaxe',
          rarity: 'common',
          magAmmo: 0,
          stackCount: 1,
        },
        {
          uid: `${partner.id}_reboot_ar`,
          weaponId: 'ar',
          rarity: 'rare',
          magAmmo: WEAPONS.ar.magSize,
          stackCount: 1,
        },
        {
          uid: `${partner.id}_reboot_smg`,
          weaponId: 'smg',
          rarity: 'rare',
          magAmmo: WEAPONS.smg.magSize,
          stackCount: 1,
        },
        {
          uid: `${partner.id}_reboot_mini_shield`,
          weaponId: 'mini_shield',
          rarity: 'uncommon',
          magAmmo: 0,
          stackCount: 2,
        },
        null,
        null,
      ],
      activeSlot: 1,
      ammo: {
        light: 120,
        medium: 90,
        shells: 0,
        heavy: 0,
        rockets: 0,
      },
      materials: {
        wood: 100,
        brick: 60,
        metal: 40,
      },
    };

    this.botMap.set(partner.id, partner);
    this.ctx.eventBus.emit('sound:play', {
      id: 'reboot_complete',
      position: { x: spawnX, y: rawY, z: spawnZ },
      spatial: true,
    });
    return partner;
  }

  setOnPlayerRevived(cb: ((reviverId: string) => void) | null): void {
    this.onPlayerRevivedCallback = cb;
  }

  consumeDroppedRewards(): DroppedRewards {
    const medallions = [...this.pendingDroppedMedallions];
    const crowns = [...this.pendingDroppedCrowns];
    this.pendingDroppedMedallions.length = 0;
    this.pendingDroppedCrowns.length = 0;
    return { medallions, crowns };
  }

  getMedallionHolders(): MedallionHolderInfo[] {
    const holders: MedallionHolderInfo[] = [];
    for (const bot of this.bots) {
      if (!bot.alive || bot.state === 'eliminated') continue;
      const meds = bot.medallions ?? [];
      const count = Math.max(meds.length, bot.medallionCount ?? 0);
      if (count <= 0) continue;
      const circleRadius =
        MEDALLION_CIRCLE_RADII[
          Math.min(MEDALLION_CIRCLE_RADII.length - 1, Math.max(0, count - 1))
        ];
      holders.push({
        id: bot.id,
        botId: bot.id,
        name: bot.name,
        x: bot.position.x,
        y: bot.position.y,
        z: bot.position.z,
        position: { ...bot.position },
        medallions: [...meds],
        medallionCount: count,
        count,
        circleRadius,
        isBoss: Boolean(bot.isBoss),
      });
    }
    return holders;
  }

  consumeAllySupportEvents(): AllySupportEvent[] {
    if (this.pendingAllySupportEvents.length === 0) return [];
    const copy = [...this.pendingAllySupportEvents];
    this.pendingAllySupportEvents.length = 0;
    return copy;
  }

  update(
    dt: number,
    elapsed: number,
    busPos: Vec3Like,
    playerPos: Vec3Like,
  ): void {
    this.lastElapsed = elapsed;
    const safeOvershieldDt = Math.max(0, dt);
    const emitAllySupport = (ev: AllySupportEvent): void => {
      this.pendingAllySupportEvents.push(ev);
      this.ctx.onAllySupportEvent?.(ev);
    };
    const emitPlayerRevived = (reviverId: string): void => {
      this.onPlayerRevivedCallback?.(reviverId);
      this.ctx.onPlayerRevived?.(reviverId);
    };

    const squadMap = new Map<string, BotEntity[]>();
    const medallionHolderIds = new Set<string>();
    for (const bot of this.bots) {
      if (!bot.alive || bot.state === 'eliminated') continue;
      if (bot.squadId) {
        let list = squadMap.get(bot.squadId);
        if (!list) {
          list = [];
          squadMap.set(bot.squadId, list);
        }
        list.push(bot);
      }
      if ((bot.medallions?.length ?? 0) > 0 || (bot.medallionCount ?? 0) > 0) {
        medallionHolderIds.add(bot.id);
      }
    }

    for (const bot of this.bots) {
      if (!bot.alive || bot.state === 'eliminated') continue;
      const distToPlayer = dist3D(bot.position, playerPos);
      const isFarLOD = !bot.isAlly && !bot.isDuoPartner && distToPlayer > 180;
      const squadmates = bot.squadId ? squadMap.get(bot.squadId) : undefined;
      updateBot(
        bot,
        this.ctx,
        this.difficulty,
        busPos,
        elapsed,
        dt,
        isFarLOD,
        this.gameMode,
        playerPos,
        emitAllySupport,
        emitPlayerRevived,
        squadmates,
        medallionHolderIds,
      );
      const isKnocked = Boolean(bot.isKnocked || bot.state === 'knocked');
      if (bot.alive && (isKnocked ? (bot.bleedOutHp ?? bot.hp) <= 0 : bot.hp <= 0)) {
        this.eliminateBot(bot, {
          killerId: bot.lastDamagerId ?? 'bleed_out',
          killerName: bot.lastAttackerName ?? 'Bleed Out',
          weaponId: bot.lastDamageWeaponId ?? 'pistol',
          rarity: bot.lastDamageRarity ?? 'common',
          isHeadshot: bot.lastDamageHeadshot ?? false,
          isStorm: false,
          distance: 0,
          timestamp: elapsed,
        });
        continue;
      }
      if (
        this.gameMode === 'zero_build' &&
        !bot.isAlly &&
        !bot.isDuoPartner &&
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
          !b.isAlly &&
          !b.isDuoPartner &&
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
      (b) => b.alive && !b.isAlly && !b.isDuoPartner && b.state !== 'eliminated',
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

  private hasAliveNonKnockedSquadmate(bot: BotEntity): boolean {
    if (!bot.squadId) return false;

    if (bot.squadId === 'player_squad' || bot.isDuoPartner) {
      const playerTarget = this.ctx
        .getCombatTargets()
        .find((t) => t.isPlayer || t.id === 'player');
      const playerAlive =
        this.ctx.playerAlive !== false && (playerTarget ? playerTarget.alive : true);
      if (playerAlive && !this.ctx.playerKnocked) {
        return true;
      }
      return this.bots.some(
        (m) =>
          m.id !== bot.id &&
          (m.squadId === 'player_squad' || m.isDuoPartner) &&
          m.alive &&
          m.state !== 'eliminated' &&
          !m.isKnocked &&
          m.state !== 'knocked',
      );
    }

    return this.bots.some(
      (m) =>
        m.id !== bot.id &&
        m.squadId === bot.squadId &&
        m.alive &&
        m.state !== 'eliminated' &&
        !m.isKnocked &&
        m.state !== 'knocked',
    );
  }

  private knockBot(bot: BotEntity): void {
    bot.isKnocked = true;
    bot.state = 'knocked';
    bot.animState = 'knocked';
    bot.bleedOutHp = DBNO_MAX_HP;
    bot.hp = DBNO_MAX_HP;
    bot.shield = 0;
    bot.moveSpeed = 0;
    bot.isFiring = false;
    bot.isAiming = false;
    bot.isBuilding = false;
    bot.isSprinting = false;
    bot.isCrouching = false;
    bot.isGrinding = false;
    bot.burstQueue = 0;
    bot.reloadTimer = 0;
    bot.healTimer = 0;
    bot.isReviving = false;
    bot.reviveProgress = 0;
    bot.reviveTargetId = null;

    this.ctx.eventBus.emit('sound:play', {
      id: 'knocked_down',
      position: { ...bot.position },
      spatial: true,
    });
  }

  private handleZeroHp(bot: BotEntity, meta: EliminationMeta): void {
    if (this.gameMode === 'duos' && this.hasAliveNonKnockedSquadmate(bot)) {
      this.knockBot(bot);
      return;
    }
    this.eliminateBot(bot, meta);
  }

  /**
   * Applies incoming damage (either a `DamageEvent` or numeric amount) to a bot,
   * enforcing friendly-fire immunity and Duos DBNO / Squad Wipe rules.
   */
  damageBot(botId: string, damageEvent: DamageEvent, nowSec?: number): boolean;
  damageBot(
    botId: string,
    damageAmount: number,
    attackerId?: string,
    attackerName?: string,
    nowSec?: number,
  ): boolean;
  damageBot(
    botId: string,
    damageOrEvent: DamageEvent | number,
    attackerIdOrNow?: string | number,
    attackerName?: string,
    nowSecArg?: number,
  ): boolean {
    const bot = this.botMap.get(botId);
    if (!bot || !bot.alive || bot.state === 'eliminated') {
      return false;
    }

    let damageEvent: DamageEvent;
    let nowSec: number;
    if (typeof damageOrEvent === 'number') {
      const attackerId =
        typeof attackerIdOrNow === 'string' ? attackerIdOrNow : 'player';
      nowSec = nowSecArg ?? this.lastElapsed;
      damageEvent = {
        targetId: botId,
        attackerId,
        attackerName: attackerName ?? (attackerId === 'player' ? 'Player' : attackerId),
        weaponId: 'ar',
        rarity: 'common',
        damage: Math.max(0, damageOrEvent),
        hpDamage: 0,
        shieldDamage: 0,
        isHeadshot: false,
        isElimination: false,
        hitPoint: { ...bot.position },
        distance: 10,
      };
    } else {
      damageEvent = damageOrEvent;
      nowSec = typeof attackerIdOrNow === 'number' ? attackerIdOrNow : this.lastElapsed;
    }

    const attackerBot =
      damageEvent.attackerId && damageEvent.attackerId !== bot.id
        ? this.botMap.get(damageEvent.attackerId)
        : undefined;

    if (
      (bot.isAlly || bot.isDuoPartner || bot.squadId === 'player_squad') &&
      (damageEvent.attackerId === 'player' ||
        damageEvent.attackerId === bot.id ||
        attackerBot?.isAlly ||
        attackerBot?.isDuoPartner ||
        attackerBot?.squadId === 'player_squad')
    ) {
      return false;
    }

    if (bot.squadId && attackerBot && attackerBot.squadId === bot.squadId) {
      return false;
    }

    const isStorm = damageEvent.attackerId === 'storm';

    if (bot.isKnocked || bot.state === 'knocked') {
      const incoming =
        damageEvent.shieldDamage > 0 || damageEvent.hpDamage > 0
          ? Math.max(0, damageEvent.shieldDamage + damageEvent.hpDamage)
          : Math.max(0, damageEvent.damage);
      bot.bleedOutHp = Math.max(0, (bot.bleedOutHp ?? DBNO_MAX_HP) - incoming);
      bot.hp = bot.bleedOutHp;
      bot.lastDamageTime = nowSec;
      bot.lastDamagerId = damageEvent.attackerId;
      bot.lastAttackerName = damageEvent.attackerName;
      bot.lastDamageWeaponId = damageEvent.weaponId;
      bot.lastDamageRarity = damageEvent.rarity;
      bot.lastDamageHeadshot = damageEvent.isHeadshot;

      if (bot.bleedOutHp <= 0) {
        this.eliminateBot(bot, {
          killerId: damageEvent.attackerId,
          killerName: damageEvent.attackerName,
          weaponId: damageEvent.weaponId,
          rarity: damageEvent.rarity,
          isHeadshot: damageEvent.isHeadshot,
          isStorm,
          distance: damageEvent.distance,
          timestamp: nowSec,
        });
      }
      return true;
    }

    const prevHp = bot.hp;
    const prevShield = bot.shield;
    const prevOvershield = bot.overshield ?? 0;

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
      this.handleZeroHp(bot, {
        killerId: damageEvent.attackerId,
        killerName: damageEvent.attackerName,
        weaponId: damageEvent.weaponId,
        rarity: damageEvent.rarity,
        isHeadshot: damageEvent.isHeadshot,
        isStorm,
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

  /**
   * Applies incoming damage to a bot. Returns `true` if the bot existed and was alive
   * when damaged, or `false` if the bot was not found or already eliminated.
   */
  onBotDamaged(
    botId: string,
    damageEvent: DamageEvent,
    nowSec: number = this.lastElapsed,
  ): boolean {
    return this.damageBot(botId, damageEvent, nowSec);
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
        if (bot.isKnocked || bot.state === 'knocked') {
          bot.bleedOutHp = Math.max(0, (bot.bleedOutHp ?? DBNO_MAX_HP) - dmg);
          bot.hp = bot.bleedOutHp;
          if (bot.bleedOutHp <= 0) {
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
        } else {
          bot.hp = Math.max(0, bot.hp - dmg);
          if (bot.hp <= 0) {
            this.handleZeroHp(bot, {
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
  }

  private eliminateBot(bot: BotEntity, meta: EliminationMeta): BountyReward | null {
    if (!bot.alive) return null;
    bot.alive = false;
    bot.hp = 0;
    bot.state = 'eliminated';
    bot.isKnocked = false;
    bot.bleedOutHp = undefined;
    bot.isReviving = false;
    bot.reviveProgress = 0;
    bot.reviveTargetId = null;
    bot.moveSpeed = 0;
    bot.isFiring = false;
    bot.isAiming = false;
    bot.isBuilding = false;
    bot.isGrinding = false;
    bot.gliderOpen = false;
    bot.gliderFactor = 0;

    if (bot.medallions && bot.medallions.length > 0) {
      for (let m = 0; m < bot.medallions.length; m++) {
        const offsetAng = (m / bot.medallions.length) * Math.PI * 2;
        const dx = bot.medallions.length > 1 ? Math.cos(offsetAng) * 0.8 : 0;
        const dz = bot.medallions.length > 1 ? Math.sin(offsetAng) * 0.8 : 0;
        const pos = {
          x: bot.position.x + dx,
          y: bot.position.y,
          z: bot.position.z + dz,
        };
        this.pendingDroppedMedallions.push({
          medallionId: bot.medallions[m],
          botId: bot.id,
          position: pos,
          x: pos.x,
          y: pos.y,
          z: pos.z,
        });
      }
      bot.medallions = [];
      bot.medallionCount = 0;
    }

    if (bot.hasVictoryCrown) {
      const pos = { ...bot.position };
      this.pendingDroppedCrowns.push({
        botId: bot.id,
        position: pos,
        x: pos.x,
        y: pos.y,
        z: pos.z,
      });
      bot.hasVictoryCrown = false;
    }

    const killedByPlayer = !meta.isStorm && meta.killerId === 'player';
    bot.eliminatedByPlayer = killedByPlayer;

    let killerBot: BotEntity | undefined;
    if (!meta.isStorm && meta.killerId && meta.killerId !== bot.id) {
      killerBot = this.botMap.get(meta.killerId);
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
        meta.killerId === 'player' ||
        bot.id === 'player' ||
        Boolean(bot.isAlly) ||
        Boolean(bot.isDuoPartner) ||
        Boolean(killerBot?.isAlly) ||
        Boolean(killerBot?.isDuoPartner),
    };
    this.ctx.eventBus.emit('combat:killfeed', entry);

    if (
      this.gameMode === 'duos' &&
      bot.squadId &&
      !this.hasAliveNonKnockedSquadmate(bot)
    ) {
      const knockedMates = this.bots.filter(
        (m) =>
          m.id !== bot.id &&
          m.squadId === bot.squadId &&
          m.alive &&
          m.state !== 'eliminated' &&
          (m.isKnocked || m.state === 'knocked'),
      );
      for (const mate of knockedMates) {
        this.eliminateBot(mate, meta);
      }
    }

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
      if (bot.alive && !bot.isAlly && !bot.isDuoPartner) count++;
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
      const meds = bot.medallions ? [...bot.medallions] : [];
      const medallionCount = Math.max(meds.length, bot.medallionCount ?? 0);
      const isKnocked = Boolean(bot.isKnocked || bot.state === 'knocked');
      const isReviving = Boolean(bot.isReviving || bot.state === 'reviving');
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
        isAlly: Boolean(bot.isAlly),
        allyRole: bot.allyRole,
        squadId: bot.squadId,
        isDuoPartner: Boolean(bot.isDuoPartner),
        isKnocked,
        bleedOutHp: isKnocked ? bot.bleedOutHp : undefined,
        reviveProgress: bot.reviveProgress,
        reviveTargetId: bot.reviveTargetId,
        hasVictoryCrown: Boolean(bot.hasVictoryCrown),
        medallions: meds,
        medallionCount,
        isReviving,
        isGrinding: Boolean(bot.isGrinding),
        bowCharge: bot.bowCharge,
      };
    });
  }

  getBotSummaries(): BotSummary[] {
    return this.bots.map((bot) => {
      const medallionCount = Math.max(
        bot.medallions?.length ?? 0,
        bot.medallionCount ?? 0,
      );
      return {
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
        squadId: bot.squadId,
        isDuoPartner: Boolean(bot.isDuoPartner),
        isKnocked: Boolean(bot.isKnocked || bot.state === 'knocked'),
        hasVictoryCrown: Boolean(bot.hasVictoryCrown),
        medallionCount,
      };
    });
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
      if (!bot.alive || bot.state === 'eliminated' || bot.isAlly || bot.isDuoPartner) {
        continue;
      }
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
    this.pendingAllySupportEvents = [];
    this.resetBountyAndBossState();
  }

  dispose(): void {
    this.unsubNoise?.();
    this.unsubNoise = null;
    this.reset();
  }
}
