import { describe, expect, it, vi } from 'vitest';
import type {
  BuildPiece,
  CampfireEntity,
  CapturePointEntity,
  ChestEntity,
  DamageEvent,
  ExplosiveBarrelEntity,
  HarvestableProp,
  ItemInstance,
  LaunchPadEntity,
  LootDrop,
  NpcSpecialistEntity,
  RiftEntity,
  SlurpBarrelEntity,
  StormState,
  TerrainQuery,
  Vec3Like,
  VehicleEntity,
  WallDir,
} from '../../types';
import {
  BUILD_COST,
  DBNO_BLEED_DPS,
  DBNO_MAX_HP,
  EventBus,
  GLIDER_FORCE_HEIGHT,
  GLIDERS,
  MEDALLIONS,
  MEDALLION_CIRCLE_RADII,
  PICKAXES,
  POIS,
  REVIVE_DURATION_SEC,
  SKINS,
  dist2D,
} from '../../core';
import {
  BOT_NAMES,
  BOUNTY_DURATION_SEC,
  BOUNTY_RESELECT_COOLDOWN_SEC,
  BotBrain,
  BotManager,
  DIFFICULTY_PROFILES,
  VOLCANO_LAVA_CENTER_X,
  VOLCANO_LAVA_CENTER_Z,
  computeBotSpread,
  findIncomingVehicleThreat,
  isInVolcanoLavaHazard,
  isShotBlockedByShieldBubbles,
  pickBotLoadoutCosmetics,
  segmentIntersectsSphere,
  selectBestWeaponForDistance,
  selectBestWeaponForRange,
  selectCapturePointTarget,
  selectEscapeRift,
  selectExplosiveBarrelTarget,
  selectHealingItem,
  selectLaunchPadForRotation,
  selectThrowableForCombat,
  shouldBotBuildDefense,
  shouldBotDeployShieldBubble,
  updateBot,
  type BotCombatTarget,
  type BotEntity,
  type BotWorldContext,
} from '../index';

function makeItem(
  weaponId: ItemInstance['weaponId'],
  rarity: ItemInstance['rarity'] = 'rare',
  magAmmo = 30,
  stackCount = 1,
): ItemInstance {
  return {
    uid: `item_${weaponId}_${rarity}`,
    weaponId,
    rarity,
    magAmmo,
    stackCount,
  };
}

function makeMockTerrain(groundY = 10): TerrainQuery {
  return {
    getHeightAt: () => groundY,
    getNormalAt: () => ({ x: 0, y: 1, z: 0 }),
    isWater: (x, z) => Math.hypot(x, z) > 340,
    getBiomeAt: () => 'grassland',
    getPOIs: () => POIS,
    getMapTextureCanvas: () => ({}) as HTMLCanvasElement,
  };
}

function makeDefaultStorm(overrides: Partial<StormState> = {}): StormState {
  return {
    phase: 1,
    totalPhases: 6,
    currentCenterX: 0,
    currentCenterZ: 0,
    currentRadius: 300,
    nextCenterX: 0,
    nextCenterZ: 0,
    nextRadius: 200,
    isShrinking: false,
    phaseTimeRemaining: 30,
    phaseDuration: 45,
    dps: 2,
    ...overrides,
  };
}

function makeMockContext(
  overrides: Partial<BotWorldContext> = {},
): BotWorldContext & {
  placedBuilds: Array<{
    ownerId: string;
    type: string;
    material: string;
    gx: number;
    gy: number;
    gz: number;
    dir: WallDir;
    rotation: 0 | 1 | 2 | 3;
  }>;
  firedCalls: Array<{
    botId: string;
    weaponId: string;
    spreadRad: number;
    aimDir: Vec3Like;
  }>;
  droppedBots: string[];
} {
  const terrain = overrides.terrain ?? makeMockTerrain(10);
  const placedBuilds: Array<{
    ownerId: string;
    type: string;
    material: string;
    gx: number;
    gy: number;
    gz: number;
    dir: WallDir;
    rotation: 0 | 1 | 2 | 3;
  }> = [];
  const firedCalls: Array<{
    botId: string;
    weaponId: string;
    spreadRad: number;
    aimDir: Vec3Like;
  }> = [];
  const droppedBots: string[] = [];

  const ctx: BotWorldContext & {
    placedBuilds: Array<{
      ownerId: string;
      type: string;
      material: string;
      gx: number;
      gy: number;
      gz: number;
      dir: WallDir;
      rotation: 0 | 1 | 2 | 3;
    }>;
    firedCalls: Array<{
      botId: string;
      weaponId: string;
      spreadRad: number;
      aimDir: Vec3Like;
    }>;
    droppedBots: string[];
  } = {
    terrain,
    storm: makeDefaultStorm(),
    getChests: () => [],
    openChest: () => true,
    getLootDrops: () => [],
    pickupLootDrop: () => null,
    getProps: () => [],
    damageProp: () => ({
      hit: true,
      destroyed: false,
      matType: 'wood',
      yieldAmount: 12,
    }),
    resolveMovement: (pos, vel, _radius, _height, dt) => {
      const nx = pos.x + vel.x * dt;
      const nz = pos.z + vel.z * dt;
      let ny = pos.y + vel.y * dt;
      const gy = terrain.getHeightAt(nx, nz);
      let grounded = false;
      const nvy = vel.y;
      if (ny <= gy) {
        ny = gy;
        grounded = true;
      }
      return {
        position: { x: nx, y: ny, z: nz },
        velocity: { x: vel.x, y: grounded ? 0 : nvy, z: vel.z },
        grounded,
        groundMaterial: 'grass',
      };
    },
    hasLineOfSight: () => true,
    placeBuildPiece: (ownerId, type, material, gx, gy, gz, dir, rotation) => {
      placedBuilds.push({ ownerId, type, material, gx, gy, gz, dir, rotation });
      return true;
    },
    fireWeapon: (bot, item, _origin, aimDir, spreadRad) => {
      firedCalls.push({
        botId: bot.id,
        weaponId: item.weaponId,
        spreadRad,
        aimDir: { ...aimDir },
      });
      return { fired: true, shotsHit: 1, headshots: 0, damageDealt: 30 };
    },
    getCombatTargets: () => [],
    dropBotLoot: (bot) => {
      droppedBots.push(bot.id);
    },
    eventBus: new EventBus(),
    placedBuilds,
    firedCalls,
    droppedBots,
    ...overrides,
  };
  return ctx;
}

function makeBotEntity(overrides: Partial<BotEntity> = {}): BotEntity {
  const ctx = makeMockContext();
  const mgr = new BotManager(ctx, 'standard', 123);
  mgr.spawnBots(1, 20);
  const bot = mgr.getBots()[0];
  return {
    ...bot,
    ...overrides,
    inventory: overrides.inventory ?? bot.inventory,
    position: overrides.position ?? { ...bot.position },
    velocity: overrides.velocity ?? { ...bot.velocity },
  };
}

describe('BotNames', () => {
  it('provides 60+ unique gamer tags', () => {
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(60);
    const unique = new Set(BOT_NAMES);
    expect(unique.size).toBe(BOT_NAMES.length);
  });

  it('picks deterministic unique cosmetics and personalities', () => {
    const firstA = pickBotLoadoutCosmetics(0, 777);
    const firstB = pickBotLoadoutCosmetics(0, 777);
    expect(firstA).toEqual(firstB);

    const skinIds = new Set(SKINS.map((s) => s.id));
    const pickIds = new Set(PICKAXES.map((p) => p.id));
    const gliderIds = new Set(GLIDERS.map((g) => g.id));

    const names = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const loadout = pickBotLoadoutCosmetics(i, 777);
      expect(skinIds.has(loadout.skinId)).toBe(true);
      expect(pickIds.has(loadout.pickaxeId)).toBe(true);
      expect(gliderIds.has(loadout.gliderId)).toBe(true);
      expect(['rusher', 'builder', 'sniper', 'looter']).toContain(
        loadout.personality,
      );
      names.add(loadout.name);
    }
    expect(names.size).toBe(40);
  });
});

describe('selectBestWeaponForDistance', () => {
  const items: (ItemInstance | null)[] = [
    makeItem('pickaxe', 'common', 0),
    makeItem('ar', 'rare', 30),
    makeItem('pump_shotgun', 'rare', 5),
    makeItem('sniper', 'epic', 1),
    makeItem('mini_shield', 'uncommon', 0, 3),
    null,
  ];
  const fullAmmo = {
    light: 60,
    medium: 90,
    shells: 20,
    heavy: 12,
    rockets: 0,
  };

  it('picks shotgun close, AR mid, and sniper long range', () => {
    const close = selectBestWeaponForDistance(items, 8, fullAmmo);
    expect(close?.item.weaponId).toBe('pump_shotgun');

    const mid = selectBestWeaponForDistance(items, 42, fullAmmo);
    expect(mid?.item.weaponId).toBe('ar');

    const long = selectBestWeaponForDistance(items, 130, fullAmmo);
    expect(long?.item.weaponId).toBe('sniper');
  });

  it('prefers higher rarity among same weapon and skips empty out-of-ammo guns', () => {
    const mix: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('ar', 'common', 30),
      makeItem('ar', 'legendary', 30),
      makeItem('sniper', 'legendary', 0),
    ];
    const noHeavyAmmo = { ...fullAmmo, heavy: 0 };
    const pickedLong = selectBestWeaponForDistance(mix, 120, noHeavyAmmo);
    expect(pickedLong?.slotIndex).toBe(2);
    expect(pickedLong?.item.rarity).toBe('legendary');
  });

  it('uses pickaxe only at melee distance when no firearms have ammo', () => {
    const onlyPickaxe: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('medkit', 'uncommon', 0, 1),
    ];
    expect(selectBestWeaponForDistance(onlyPickaxe, 2.5, fullAmmo)?.item.weaponId).toBe(
      'pickaxe',
    );
    expect(selectBestWeaponForDistance(onlyPickaxe, 15, fullAmmo)).toBeNull();
  });
});

describe('selectHealingItem', () => {
  it('follows mini-before-big shield priority and respects 50 shield / 75 hp caps', () => {
    const items: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('shield_potion', 'rare', 0, 2),
      makeItem('mini_shield', 'uncommon', 0, 4),
      makeItem('bandages', 'common', 0, 5),
      makeItem('medkit', 'uncommon', 0, 1),
    ];

    // At 100 HP, 0 Shield -> mini_shield first!
    expect(selectHealingItem(items, 100, 0)?.item.weaponId).toBe('mini_shield');

    // At 100 HP, 50 Shield -> minis capped at 50, must choose shield_potion!
    expect(selectHealingItem(items, 100, 50)?.item.weaponId).toBe('shield_potion');

    // At 75 HP, 100 Shield -> bandages capped at 75, must choose medkit!
    expect(selectHealingItem(items, 75, 100)?.item.weaponId).toBe('medkit');

    // At 100 HP, 100 Shield -> nothing needed
    expect(selectHealingItem(items, 100, 100)).toBeNull();
  });

  it('prioritizes HP healing when critically low HP', () => {
    const items: (ItemInstance | null)[] = [
      makeItem('mini_shield', 'uncommon', 0, 3),
      makeItem('medkit', 'uncommon', 0, 1),
    ];
    expect(selectHealingItem(items, 25, 0)?.item.weaponId).toBe('medkit');
  });
});

describe('shouldBotBuildDefense & Difficulty Spread Scaling', () => {
  it('requires sufficient materials, off-cooldown, grounded state, and threat/hit', () => {
    const bot = makeBotEntity({
      state: 'combat',
      hp: 90,
      shield: 50,
      buildCooldown: 0,
      lastDamageTime: 10.0,
    });
    bot.inventory.materials.wood = 50;

    // Recently damaged -> builds on standard & sweaty
    expect(shouldBotBuildDefense(bot, 'sweaty', 10.4, 25)).toBe(true);
    expect(shouldBotBuildDefense(bot, 'standard', 10.4, 25)).toBe(true);

    // No materials -> false
    bot.inventory.materials.wood = BUILD_COST - 1;
    expect(shouldBotBuildDefense(bot, 'sweaty', 10.4, 25)).toBe(false);

    // On cooldown -> false
    bot.inventory.materials.wood = 50;
    bot.buildCooldown = 1.2;
    expect(shouldBotBuildDefense(bot, 'sweaty', 10.4, 25)).toBe(false);

    // Healthy and not damaged recently -> false
    bot.buildCooldown = 0;
    bot.lastDamageTime = -50;
    bot.personality = 'rusher';
    expect(shouldBotBuildDefense(bot, 'standard', 10.4, 25)).toBe(false);
  });

  it('scales weapon spread monotonically: casual > standard > sweaty', () => {
    expect(DIFFICULTY_PROFILES.casual.aimSpreadMult).toBeGreaterThan(
      DIFFICULTY_PROFILES.standard.aimSpreadMult,
    );
    expect(DIFFICULTY_PROFILES.standard.aimSpreadMult).toBeGreaterThan(
      DIFFICULTY_PROFILES.sweaty.aimSpreadMult,
    );

    for (const weapon of ['ar', 'pump_shotgun', 'smg', 'sniper'] as const) {
      const casual = computeBotSpread(weapon, 'casual', true, false);
      const standard = computeBotSpread(weapon, 'standard', true, false);
      const sweaty = computeBotSpread(weapon, 'sweaty', true, false);
      expect(casual).toBeGreaterThan(standard);
      expect(standard).toBeGreaterThan(sweaty);
    }
  });
});

describe('updateBot state transitions & gameplay', () => {
  it('transitions cleanly from bus -> skydiving -> gliding -> looting', () => {
    const ctx = makeMockContext({ terrain: makeMockTerrain(10) });
    const bot = makeBotEntity({
      state: 'bus',
      dropJumpTime: 2.0,
      dropTarget: { x: 10, y: 10, z: 10 },
      position: { x: 0, y: 175, z: 0 },
    });

    const busPos: Vec3Like = { x: 0, y: 175, z: 0 };

    // Before jump time -> stays on bus
    updateBot(bot, ctx, 'standard', busPos, 1.0, 0.05, false);
    expect(bot.state).toBe('bus');

    // Past jump time -> skydiving
    updateBot(bot, ctx, 'standard', busPos, 2.1, 0.05, false);
    expect(bot.state).toBe('skydiving');
    expect(bot.gliderOpen).toBe(false);

    // Descend until <= GLIDER_FORCE_HEIGHT above ground (10 + 48 = 58)
    let t = 2.15;
    for (let step = 0; step < 200 && bot.state === 'skydiving'; step++) {
      t += 0.05;
      updateBot(bot, ctx, 'standard', busPos, t, 0.05, false);
    }
    expect(bot.state).toBe('gliding');
    expect(bot.gliderOpen).toBe(true);
    expect(bot.position.y - 10).toBeLessThanOrEqual(GLIDER_FORCE_HEIGHT + 1);

    // Descend until landed -> looting
    for (let step = 0; step < 300 && bot.state === 'gliding'; step++) {
      t += 0.05;
      updateBot(bot, ctx, 'standard', busPos, t, 0.05, false);
    }
    expect(bot.state).toBe('looting');
    expect(bot.gliderOpen).toBe(false);
    expect(bot.grounded).toBe(true);
  });

  it('opens chests, picks up loot drops, and harvests props', () => {
    const chests: ChestEntity[] = [
      { id: 'chest_1', x: 1.5, y: 10, z: 0, rotationY: 0, opened: false, openProgress: 0 },
    ];
    const drops: LootDrop[] = [
      {
        id: 'drop_ar',
        x: 1.0,
        y: 10,
        z: 1.0,
        vx: 0,
        vy: 0,
        vz: 0,
        item: makeItem('ar', 'epic', 30),
        ammo: { type: 'medium', amount: 30 },
        settled: true,
        age: 0,
      },
    ];
    const props: HarvestableProp[] = [
      {
        id: 'tree_1',
        kind: 'tree_pine',
        material: 'wood',
        x: 2.0,
        y: 10,
        z: 0,
        rotationY: 0,
        scale: 1,
        hp: 100,
        maxHp: 100,
        matYield: 18,
        radius: 0.8,
        height: 6,
        destroyed: false,
      },
    ];

    const openChest = vi.fn((id: string) => {
      const c = chests.find((ch) => ch.id === id);
      if (c) c.opened = true;
      return true;
    });
    const pickupLootDrop = vi.fn((id: string) => {
      const idx = drops.findIndex((d) => d.id === id);
      if (idx >= 0) return drops.splice(idx, 1)[0];
      return null;
    });

    const ctx = makeMockContext({
      getChests: () => chests,
      openChest,
      getLootDrops: () => drops,
      pickupLootDrop,
      getProps: () => props,
    });

    const bot = makeBotEntity({
      state: 'looting',
      position: { x: 0, y: 10, z: 0 },
      grounded: true,
      scanCooldown: 0,
    });

    // Step looting -> picks up AR drop first, then opens nearby chest
    updateBot(bot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 5.0, 0.05, false);
    updateBot(bot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 5.05, 0.05, false);
    expect(pickupLootDrop).toHaveBeenCalledWith('drop_ar');
    expect(bot.inventory.items.some((it) => it?.weaponId === 'ar')).toBe(true);

    bot.scanCooldown = 0;
    updateBot(bot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 5.3, 0.05, false);
    updateBot(bot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 5.35, 0.05, false);
    expect(openChest).toHaveBeenCalledWith('chest_1');

    // Step harvesting -> damages prop and gathers wood
    bot.state = 'harvesting';
    bot.scanCooldown = 0;
    bot.harvestCooldown = 0;
    updateBot(bot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 6.0, 0.05, false);
    expect(bot.inventory.materials.wood).toBeGreaterThan(0);
  });

  it('engages enemies in combat, fires weapons, and reactively builds Wall + Ramp when hit', () => {
    const enemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 25 },
      eyePos: { x: 0, y: 11.6, z: 25 },
      hp: 100,
      shield: 50,
      alive: true,
      isPlayer: true,
    };

    const ctx = makeMockContext({
      getCombatTargets: () => [enemy],
    });
    const bot = makeBotEntity({
      state: 'combat',
      personality: 'builder',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0, // facing +Z directly toward enemy
      grounded: true,
      targetEnemyId: 'player',
      lastDamageTime: 9.8,
      lastDamagerId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
      buildCooldown: 0,
    });
    bot.inventory.items[1] = makeItem('ar', 'rare', 30);
    bot.inventory.ammo.medium = 60;
    bot.inventory.materials.wood = 80;

    updateBot(bot, ctx, 'sweaty', { x: 0, y: 175, z: 0 }, 10.0, 0.05, false);

    // Built defensive wall + ramp!
    expect(ctx.placedBuilds.some((b) => b.type === 'wall')).toBe(true);
    expect(ctx.placedBuilds.some((b) => b.type === 'ramp')).toBe(true);
    expect(bot.inventory.materials.wood).toBeLessThan(80);

    // Fired AR toward enemy!
    expect(ctx.firedCalls.length).toBe(1);
    expect(ctx.firedCalls[0].weaponId).toBe('ar');
    expect(bot.inventory.items[1]?.magAmmo).toBe(29);
  });

  it('heals in cover and rotates toward safe zone when outside storm', () => {
    const ctx = makeMockContext({
      storm: makeDefaultStorm({
        currentCenterX: 0,
        currentCenterZ: 0,
        currentRadius: 80,
        nextRadius: 40,
      }),
    });

    // Healing test
    const healingBot = makeBotEntity({
      state: 'looting',
      hp: 35,
      shield: 0,
      position: { x: 0, y: 10, z: 0 },
      grounded: true,
    });
    healingBot.inventory.items[1] = makeItem('medkit', 'uncommon', 0, 1);

    // Step past 6.5s consumeTime
    let elapsed = 10;
    for (let i = 0; i < 80; i++) {
      elapsed += 0.1;
      updateBot(healingBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, elapsed, 0.1, false);
    }
    expect(healingBot.hp).toBe(100);
    expect(healingBot.inventory.items[1]).toBeNull();

    // Storm rotation test
    const stormBot = makeBotEntity({
      state: 'looting',
      position: { x: 140, y: 10, z: 0 }, // outside radius 80!
      grounded: true,
    });
    stormBot.inventory.items[1] = makeItem('ar', 'common', 30);
    updateBot(stormBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 20, 0.1, false);
    expect(stormBot.state).toBe('rotating');
    expect(stormBot.position.x).toBeLessThan(140);
  });

  it('throttles expensive queries under Far LOD (>180m)', () => {
    const hasLOS = vi.fn(() => true);
    const resolveMovement = vi.fn((pos, vel, _r, _h, dt) => ({
      position: { x: pos.x + vel.x * dt, y: 10, z: pos.z + vel.z * dt },
      velocity: vel,
      grounded: true,
    }));
    const enemy: BotCombatTarget = {
      id: 'other',
      name: 'Other',
      position: { x: 250, y: 10, z: 25 },
      eyePos: { x: 250, y: 11.6, z: 25 },
      hp: 100,
      shield: 0,
      alive: true,
    };
    const ctx = makeMockContext({
      hasLineOfSight: hasLOS,
      resolveMovement,
      getCombatTargets: () => [enemy],
    });
    const bot = makeBotEntity({
      state: 'rotating',
      position: { x: 250, y: 10, z: 0 },
      grounded: true,
      thinkCooldown: 0,
    });

    for (let i = 0; i < 30; i++) {
      updateBot(bot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 10 + i * 0.016, 0.016, true);
    }
    // Far LOD skips resolveMovement and throttles LOS checks to ~1-2 think ticks over 0.48s
    expect(resolveMovement).toHaveBeenCalledTimes(0);
    expect(hasLOS.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

describe('BotManager lifecycle, damage, storm, and audio awareness', () => {
  it('spawns bots, tracks alive counts, handles damage, kills, loot drops, and killfeed', () => {
    const ctx = makeMockContext();
    const manager = new BotManager(ctx, 'standard', 42);
    const killFeedEvents: string[] = [];
    const elimVfxEvents: number[] = [];

    ctx.eventBus.on('combat:killfeed', (e) => killFeedEvents.push(e.victimId));
    ctx.eventBus.on('vfx:elimination', () => elimVfxEvents.push(1));

    manager.spawnBots(5, 24);
    expect(manager.getBots().length).toBe(5);
    expect(manager.getAliveCount()).toBe(5);
    expect(manager.getRenderStates().length).toBe(5);
    expect(manager.getRenderStates()[0].isHiddenInBus).toBe(true);

    const bot1 = manager.getBotById('bot_1')!;
    const bot2 = manager.getBotById('bot_2')!;
    bot1.shield = 50;
    bot1.state = 'looting';

    // Non-lethal shield + HP hit
    const hit1: DamageEvent = {
      targetId: bot1.id,
      attackerId: bot2.id,
      attackerName: bot2.name,
      weaponId: 'ar',
      rarity: 'rare',
      damage: 65,
      hpDamage: 15,
      shieldDamage: 50,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { ...bot1.position },
      distance: 25,
    };
    expect(manager.onBotDamaged(bot1.id, hit1, 15)).toBe(true);
    expect(bot1.shield).toBe(0);
    expect(bot1.hp).toBe(85);
    expect(bot1.alive).toBe(true);
    expect(manager.getAliveCount()).toBe(5);

    // Lethal sniper headshot from bot_2
    const hit2: DamageEvent = {
      targetId: bot1.id,
      attackerId: bot2.id,
      attackerName: bot2.name,
      weaponId: 'sniper',
      rarity: 'legendary',
      damage: 220,
      hpDamage: 220,
      shieldDamage: 0,
      isHeadshot: true,
      isElimination: true,
      hitPoint: { ...bot1.position },
      distance: 110,
    };
    expect(manager.onBotDamaged(bot1.id, hit2, 16)).toBe(true);
    expect(bot1.alive).toBe(false);
    expect(bot1.state).toBe('eliminated');
    expect(manager.getAliveCount()).toBe(4);
    expect(manager.getAliveBots().length).toBe(4);
    expect(bot2.kills).toBe(1);
    expect(ctx.droppedBots).toContain(bot1.id);
    expect(killFeedEvents).toContain(bot1.id);
    expect(elimVfxEvents.length).toBe(1);

    // Damaging already-dead or unknown bot returns false
    expect(manager.onBotDamaged(bot1.id, hit2, 17)).toBe(false);
    expect(manager.onBotDamaged('missing_bot', hit2, 17)).toBe(false);

    manager.dispose();
  });

  it('applies storm damage to bots outside the safe zone and spares bots inside', () => {
    const ctx = makeMockContext({
      storm: makeDefaultStorm({
        currentCenterX: 0,
        currentCenterZ: 0,
        currentRadius: 50,
        dps: 20,
      }),
    });
    const manager = new BotManager(ctx, 'standard', 99);
    manager.spawnBots(2, 20);

    const [insideBot, outsideBot] = manager.getBots();
    insideBot.state = 'looting';
    insideBot.position = { x: 10, y: 10, z: 10 };
    outsideBot.state = 'rotating';
    outsideBot.position = { x: 120, y: 10, z: 0 };

    manager.applyStormDamage(1.0);
    expect(insideBot.hp).toBe(100);
    expect(outsideBot.hp).toBe(80);

    // Eliminate outsideBot in storm
    manager.applyStormDamage(4.5);
    expect(outsideBot.alive).toBe(false);
    expect(outsideBot.state).toBe('eliminated');
    expect(manager.getAliveCount()).toBe(1);

    manager.reset();
    expect(manager.getAliveCount()).toBe(0);
    manager.dispose();
  });

  it('registers nearby audio:noise events for audio awareness', () => {
    const ctx = makeMockContext();
    const manager = new BotManager(ctx, 'standard', 55);
    manager.spawnBots(2, 20);
    const [nearBot, farBot] = manager.getBots();

    nearBot.state = 'looting';
    nearBot.position = { x: 10, y: 10, z: 0 };
    farBot.state = 'looting';
    farBot.position = { x: 200, y: 10, z: 0 };

    manager.update(0.016, 12.0, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    ctx.eventBus.emit('audio:noise', {
      position: { x: 25, y: 10, z: 0 },
      kind: 'gunfire',
      sourceId: 'player',
      radius: 60,
    });

    expect(nearBot.lastHeardNoisePos).toEqual({ x: 25, y: 10, z: 0 });
    expect(nearBot.lastHeardNoiseTime).toBe(12.0);
    expect(farBot.lastHeardNoisePos).toBeNull();

    manager.dispose();
  });

  it('handles burst weapons, ammo reloading, and in-place rarity loot upgrades', () => {
    const enemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 35 },
      eyePos: { x: 0, y: 11.6, z: 35 },
      hp: 100,
      shield: 0,
      alive: true,
      isPlayer: true,
    };
    const drops: LootDrop[] = [
      {
        id: 'drop_gold_ar',
        x: 0.5,
        y: 10,
        z: 0.5,
        vx: 0,
        vy: 0,
        vz: 0,
        item: makeItem('ar', 'legendary', 30),
        settled: true,
        age: 0,
      },
    ];
    const looterCtx = makeMockContext({
      getLootDrops: () => drops,
      pickupLootDrop: (id) => {
        const idx = drops.findIndex((d) => d.id === id);
        return idx >= 0 ? drops.splice(idx, 1)[0] : null;
      },
    });
    const ctx = makeMockContext({
      getCombatTargets: () => [enemy],
    });

    // In-place rarity upgrade in looting
    const looter = makeBotEntity({
      state: 'looting',
      position: { x: 0, y: 10, z: 0 },
      grounded: true,
      scanCooldown: 0,
    });
    looter.inventory.items[1] = makeItem('ar', 'common', 20);
    updateBot(looter, looterCtx, 'standard', { x: 0, y: 175, z: 0 }, 5, 0.05, false);
    expect(looter.inventory.items[1]?.rarity).toBe('legendary');
    expect(looter.inventory.items[2]).toBeNull();

    // Burst AR fires 3 rounds and reloads when mag empty
    const gunner = makeBotEntity({
      state: 'combat',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
    });
    gunner.inventory.items[1] = makeItem('burst_ar', 'epic', 3);
    gunner.inventory.ammo.medium = 30;

    for (let i = 0; i < 6; i++) {
      updateBot(gunner, ctx, 'sweaty', { x: 0, y: 175, z: 0 }, 10 + i * 0.08, 0.08, false);
    }
    expect(ctx.firedCalls.length).toBe(3);
    expect(gunner.inventory.items[1]?.magAmmo).toBe(0);

    // Trigger reload (reloadTime = 2.2s) and verify full reload + continued bursting
    updateBot(gunner, ctx, 'sweaty', { x: 0, y: 175, z: 0 }, 10.5, 0.08, false);
    expect(gunner.reloadTimer).toBeGreaterThan(0);

    for (let i = 0; i < 30; i++) {
      updateBot(gunner, ctx, 'sweaty', { x: 0, y: 175, z: 0 }, 11 + i * 0.08, 0.08, false);
    }
    expect(gunner.reloadTimer).toBe(0);
    expect(gunner.inventory.ammo.medium).toBe(0);
    expect(gunner.inventory.items[1]!.magAmmo + (ctx.firedCalls.length - 3)).toBe(30);
  });

  it('automatically applies Far LOD (>180m) inside BotManager.update and updates difficulty', () => {
    const resolveMovement = vi.fn((pos, vel, _r, _h, dt) => ({
      position: { x: pos.x + vel.x * dt, y: 10, z: pos.z + vel.z * dt },
      velocity: vel,
      grounded: true,
    }));
    const ctx = makeMockContext({ resolveMovement });
    const manager = new BotManager(ctx, 'casual', 321);
    expect(manager.getDifficulty()).toBe('casual');
    manager.setDifficulty('sweaty');
    expect(manager.getDifficulty()).toBe('sweaty');

    manager.spawnBots(2, 20);
    const [nearBot, farBot] = manager.getBots();
    nearBot.state = 'rotating';
    nearBot.position = { x: 10, y: 10, z: 0 };
    farBot.state = 'rotating';
    farBot.position = { x: 250, y: 10, z: 0 };

    manager.update(0.05, 10, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    // Only nearBot triggers resolveMovement; farBot (>180m) uses fast Far LOD terrain integration
    expect(resolveMovement).toHaveBeenCalledTimes(1);
    manager.dispose();
  });
});

describe('Wave 1 Named POI Mythic Bosses', () => {
  it('replaces 3 regular bots with 3 Named POI Bosses when count >= 12 and omits bosses when count < 12', () => {
    const ctx = makeMockContext();
    const manager = new BotManager(ctx, 'standard', 5150);

    manager.spawnBots(11, 22);
    expect(manager.getBots().length).toBe(11);
    expect(manager.getBots().filter((b) => b.isBoss)).toHaveLength(0);

    manager.spawnBots(12, 22);
    expect(manager.getBots().length).toBe(12);
    const bosses12 = manager.getBots().filter((b) => b.isBoss);
    expect(bosses12).toHaveLength(3);
    expect(manager.getBots().filter((b) => !b.isBoss)).toHaveLength(9);

    manager.spawnBots(25, 22);
    expect(manager.getBots().length).toBe(25);
    const bosses25 = manager.getBots().filter((b) => b.isBoss);
    expect(bosses25).toHaveLength(3);

    const byPoi = new Map(bosses25.map((b) => [b.bossPoiId, b]));
    expect(byPoi.get('skyline_spire')?.name).toBe('Skyline Warden');
    expect(byPoi.get('scorched_caldera')?.name).toBe('Obsidian Titan');
    expect(byPoi.get('frostpeak_citadel')?.name).toBe('Glacier Monarch');

    for (const boss of bosses25) {
      expect(boss.maxHp).toBe(150);
      expect(boss.hp).toBe(150);
      expect(boss.maxShield).toBe(150);
      expect(boss.shield).toBe(150);

      const weapons = boss.inventory.items.filter((i) => i !== null);
      expect(
        weapons.some(
          (i) => i?.weaponId === 'mythic_blade_rifle' && i.rarity === 'mythic',
        ),
      ).toBe(true);
      expect(weapons.some((i) => i?.weaponId === 'heavy_shotgun')).toBe(true);
      expect(weapons.some((i) => i?.weaponId === 'chug_splash')).toBe(true);
    }

    const summaries = manager.getBotSummaries();
    expect(summaries).toHaveLength(25);
    const bossSummaries = summaries.filter((s) => s.isBoss);
    expect(bossSummaries).toHaveLength(3);
    expect(bossSummaries.map((s) => s.bossPoiId).sort()).toEqual([
      'frostpeak_citadel',
      'scorched_caldera',
      'skyline_spire',
    ]);
    expect(summaries.filter((s) => !s.isBoss)).toHaveLength(22);

    manager.dispose();
  });

  it('patrols landmark while in safe zone and guarantees mythic_blade_rifle + chug_splash drop on elimination', () => {
    let droppedInventory: Array<ItemInstance | null> = [];
    const ctx = makeMockContext({
      dropBotLoot: (bot) => {
        droppedInventory = bot.inventory.items.map((it) => (it ? { ...it } : null));
      },
    });
    const manager = new BotManager(ctx, 'standard', 808);
    manager.spawnBots(12, 22);

    const skylineBoss = manager
      .getBots()
      .find((b) => b.isBoss && b.bossPoiId === 'skyline_spire')!;
    const startPos = { ...skylineBoss.position };

    // Step 5 seconds while storm is safely wide -> boss patrols around its landmark
    for (let i = 0; i < 50; i++) {
      manager.update(
        0.1,
        5 + i * 0.1,
        { x: 0, y: 175, z: 0 },
        { ...skylineBoss.position, x: skylineBoss.position.x + 30 },
      );
    }

    const movedDist = Math.hypot(
      skylineBoss.position.x - startPos.x,
      skylineBoss.position.z - startPos.z,
    );
    const distFromHome = Math.hypot(
      skylineBoss.position.x - skylineBoss.bossHomePos!.x,
      skylineBoss.position.z - skylineBoss.bossHomePos!.z,
    );
    expect(movedDist).toBeGreaterThan(0.5);
    expect(distFromHome).toBeLessThanOrEqual(16);

    // Even if boss used all chug_splash during combat, elimination ensures mythic rifle + chug_splash drop
    skylineBoss.inventory.items[3] = null;

    const lethalHit: DamageEvent = {
      targetId: skylineBoss.id,
      attackerId: 'player',
      attackerName: 'Player',
      weaponId: 'pump_shotgun',
      rarity: 'legendary',
      damage: 320,
      hpDamage: 170,
      shieldDamage: 150,
      isHeadshot: true,
      isElimination: true,
      hitPoint: { ...skylineBoss.position },
      distance: 10,
    };
    expect(manager.onBotDamaged(skylineBoss.id, lethalHit, 12)).toBe(true);
    expect(skylineBoss.alive).toBe(false);
    expect(
      droppedInventory.some(
        (it) => it?.weaponId === 'mythic_blade_rifle' && it.rarity === 'mythic',
      ),
    ).toBe(true);
    expect(droppedInventory.some((it) => it?.weaponId === 'chug_splash')).toBe(true);

    manager.dispose();
  });
});

describe('Wave 1 Defensive 1x1 Cover, Combat Peeking, Throwables & Healing Retreat', () => {
  it('constructs defensive multi-wall 1x1 box + ramp cover (front + perpendicular walls + ramp) when hit or ambushed', () => {
    const enemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 22 },
      eyePos: { x: 0, y: 11.6, z: 22 },
      hp: 100,
      shield: 50,
      alive: true,
      isPlayer: true,
    };
    const ctx = makeMockContext({
      getCombatTargets: () => [enemy],
    });

    // Test standard bot under sudden ambush (reactionTimer > 0)
    const ambushedBot = makeBotEntity({
      state: 'combat',
      personality: 'rusher',
      position: { x: 2, y: 10, z: 2 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0.25,
      buildCooldown: 0,
      lastDamageTime: -99,
    });
    ambushedBot.inventory.items[1] = makeItem('ar', 'rare', 30);
    ambushedBot.inventory.ammo.medium = 60;
    ambushedBot.inventory.materials.wood = 100;

    updateBot(ambushedBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 15.0, 0.05, false);

    const walls = ctx.placedBuilds.filter((b) => b.type === 'wall');
    const ramps = ctx.placedBuilds.filter((b) => b.type === 'ramp');
    expect(walls.length).toBeGreaterThanOrEqual(3);
    expect(walls.some((w) => w.dir === 'N')).toBe(true);
    expect(walls.some((w) => w.dir === 'W')).toBe(true);
    expect(ramps.length).toBe(1);
    expect(ambushedBot.inventory.materials.wood).toBeLessThan(100);
  });

  it('jump-peeks with shotguns at <12m and crouch-peeks behind ramp cover with AR/sniper', () => {
    const closeEnemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 8 },
      eyePos: { x: 0, y: 11.6, z: 8 },
      hp: 100,
      shield: 0,
      alive: true,
    };
    const closeCtx = makeMockContext({ getCombatTargets: () => [closeEnemy] });
    const shotgunBot = makeBotEntity({
      state: 'combat',
      personality: 'rusher',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
      jumpCooldown: 0,
    });
    shotgunBot.inventory.items[1] = makeItem('heavy_shotgun', 'legendary', 7);
    shotgunBot.inventory.ammo.shells = 21;

    let jumped = false;
    for (let i = 0; i < 6; i++) {
      updateBot(shotgunBot, closeCtx, 'standard', { x: 0, y: 175, z: 0 }, 10 + i * 0.05, 0.05, false);
      if (shotgunBot.velocity.y > 0 || !shotgunBot.grounded) {
        jumped = true;
      }
    }
    expect(jumped).toBe(true);
    expect(shotgunBot.isCrouching).toBe(false);
    expect(closeCtx.firedCalls.some((c) => c.weaponId === 'heavy_shotgun')).toBe(true);

    // Crouch-peek with sniper/AR behind recently built ramp cover
    const midEnemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 48 },
      eyePos: { x: 0, y: 11.6, z: 48 },
      hp: 100,
      shield: 0,
      alive: true,
    };
    const sniperCtx = makeMockContext({ getCombatTargets: () => [midEnemy] });
    const sniperBot = makeBotEntity({
      state: 'combat',
      personality: 'sniper',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0,
      fireCooldown: 0.6,
      lastBuildTime: 9.5,
      crouchToggleTimer: 0.1,
    });
    sniperBot.inventory.items[1] = makeItem('sniper', 'epic', 1);
    sniperBot.inventory.ammo.heavy = 10;

    let observedCrouch = false;
    let observedStand = false;
    for (let i = 0; i < 30; i++) {
      updateBot(sniperBot, sniperCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 10 + i * 0.1, 0.1, false);
      if (sniperBot.isCrouching) observedCrouch = true;
      else observedStand = true;
    }
    expect(observedCrouch).toBe(true);
    expect(observedStand).toBe(true);
  });

  it('retreats briefly when low HP to heal with chug_splash and mini_shield', () => {
    const enemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 14 },
      eyePos: { x: 0, y: 11.6, z: 14 },
      hp: 100,
      shield: 50,
      alive: true,
    };

    // 1) Low HP bot with chug_splash retreats away from enemy and splashes +20 HP
    const splashCtx = makeMockContext({ getCombatTargets: () => [enemy] });
    const splashBot = makeBotEntity({
      state: 'combat',
      hp: 35,
      shield: 0,
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      lastDamageTime: 9.9,
      lastDamagerId: 'player',
    });
    splashBot.inventory.items[1] = makeItem('ar', 'rare', 30);
    splashBot.inventory.items[2] = makeItem('chug_splash', 'rare', 0, 2);

    for (let i = 0; i < 12; i++) {
      updateBot(splashBot, splashCtx, 'standard', { x: 0, y: 175, z: 0 }, 10 + i * 0.1, 0.1, false);
    }
    expect(splashBot.position.z).toBeLessThan(-1.0); // retreated away from +Z enemy
    expect(splashBot.hp).toBeGreaterThanOrEqual(55);
    expect(splashCtx.firedCalls.some((c) => c.weaponId === 'chug_splash')).toBe(true);

    // 2) Low HP/shield bot with mini_shield retreats briefly behind cover and pops mini shield
    const miniCtx = makeMockContext({ getCombatTargets: () => [enemy] });
    const miniBot = makeBotEntity({
      state: 'combat',
      hp: 50,
      shield: 0,
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      lastDamageTime: 9.9,
      lastDamagerId: 'player',
    });
    miniBot.inventory.items[1] = makeItem('ar', 'rare', 30);
    miniBot.inventory.items[2] = makeItem('mini_shield', 'uncommon', 0, 2);

    for (let i = 0; i < 35; i++) {
      updateBot(miniBot, miniCtx, 'standard', { x: 0, y: 175, z: 0 }, 10 + i * 0.1, 0.1, false);
    }
    expect(miniBot.position.z).toBeLessThan(-1.5);
    expect(miniBot.shield).toBeGreaterThanOrEqual(25);
  });

  it('throws frag_grenade against clustered targets and shockwave_grenade against boxed targets', () => {
    const enemyA: BotCombatTarget = {
      id: 'e1',
      name: 'EnemyA',
      position: { x: 0, y: 10, z: 24 },
      eyePos: { x: 0, y: 11.6, z: 24 },
      hp: 100,
      shield: 0,
      alive: true,
    };
    const enemyB: BotCombatTarget = {
      id: 'e2',
      name: 'EnemyB',
      position: { x: 3.5, y: 10, z: 25 },
      eyePos: { x: 3.5, y: 11.6, z: 25 },
      hp: 100,
      shield: 0,
      alive: true,
    };

    // Clustered enemies -> throws frag_grenade with upward ballistic arc
    const clusterCtx = makeMockContext({
      getCombatTargets: () => [enemyA, enemyB],
    });
    const grenadier = makeBotEntity({
      state: 'combat',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'e1',
      reactionTimer: 0,
      fireCooldown: 0,
    });
    grenadier.inventory.items[1] = makeItem('ar', 'rare', 30);
    grenadier.inventory.ammo.medium = 60;
    grenadier.inventory.items[2] = makeItem('frag_grenade', 'rare', 0, 3);

    updateBot(grenadier, clusterCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 10, 0.05, false);
    const fragCall = clusterCtx.firedCalls.find((c) => c.weaponId === 'frag_grenade');
    expect(fragCall).toBeDefined();
    expect(fragCall!.aimDir.y).toBeGreaterThan(0.1);
    expect(grenadier.inventory.items[2]?.stackCount).toBe(2);

    // Boxed enemy (no LOS + surrounding build piece) -> throws shockwave_grenade
    const boxPiece: BuildPiece = {
      id: 'b1',
      key: 'wall:0,3,6:N',
      type: 'wall',
      material: 'wood',
      gx: 0,
      gy: 3,
      gz: 6,
      dir: 'N',
      rotation: 0,
      hp: 150,
      maxHp: 150,
      targetMaxHp: 150,
      buildProgress: 1,
      ownerId: 'e1',
      editMask: 0,
      editVariant: 'full',
      createdAt: 0,
    };
    const boxedCtx = makeMockContext({
      getCombatTargets: () => [enemyA],
      hasLineOfSight: () => false,
      getBuildPieces: () => [boxPiece],
    });
    const breacher = makeBotEntity({
      state: 'combat',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'e1',
      reactionTimer: 0,
      fireCooldown: 0,
    });
    breacher.inventory.items[1] = makeItem('ar', 'rare', 30);
    breacher.inventory.ammo.medium = 60;
    breacher.inventory.items[2] = makeItem('shockwave_grenade', 'epic', 0, 2);

    expect(
      selectThrowableForCombat(breacher, enemyA, [enemyA], false, [boxPiece])?.item
        .weaponId,
    ).toBe('shockwave_grenade');

    updateBot(breacher, boxedCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 10, 0.05, false);
    expect(boxedCtx.firedCalls.some((c) => c.weaponId === 'shockwave_grenade')).toBe(
      true,
    );
    expect(breacher.inventory.items[2]?.stackCount).toBe(1);
  });
});

describe('Wave 1 Smart World Traversal & Volcano Lava Avoidance', () => {
  it('routes to an active Launch Pad during long zone rotations and launches into a high-altitude glide toward safe zone', () => {
    const pads: LaunchPadEntity[] = [
      {
        id: 'pad_rot_1',
        kind: 'launch_pad',
        x: 132,
        y: 10,
        z: 0,
        radius: 2.2,
        boostVy: 30,
        boostForward: 20,
      },
    ];
    const ctx = makeMockContext({
      storm: makeDefaultStorm({
        currentCenterX: 0,
        currentCenterZ: 0,
        currentRadius: 80,
        nextCenterX: 0,
        nextCenterZ: 0,
        nextRadius: 40,
        isShrinking: true,
      }),
      getLaunchPads: () => pads,
    });

    const rotBot = makeBotEntity({
      state: 'rotating',
      position: { x: 146, y: 10, z: 0 },
      yaw: -Math.PI * 0.5,
      grounded: true,
    });
    rotBot.inventory.items[1] = makeItem('ar', 'rare', 30);

    expect(
      selectLaunchPadForRotation(rotBot, pads, { x: 0, y: 10, z: 0 })?.id,
    ).toBe('pad_rot_1');

    let enteredGlide = false;
    let peakAltitude = 10;
    for (let i = 0; i < 60; i++) {
      updateBot(rotBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 20 + i * 0.1, 0.1, false);
      if (rotBot.state === 'gliding' && rotBot.gliderOpen) {
        enteredGlide = true;
      }
      if (rotBot.position.y > peakAltitude) {
        peakAltitude = rotBot.position.y;
      }
    }

    expect(enteredGlide).toBe(true);
    expect(peakAltitude).toBeGreaterThan(22);
    expect(rotBot.position.x).toBeLessThan(120);
  });

  it('avoids entering VOLCANO_CENTER_X/Z molten lava (>= 14m away) and escapes immediately if placed inside', () => {
    const ctx = makeMockContext({
      storm: makeDefaultStorm({
        currentCenterX: VOLCANO_LAVA_CENTER_X - 40,
        currentCenterZ: VOLCANO_LAVA_CENTER_Z,
        currentRadius: 300,
        nextCenterX: VOLCANO_LAVA_CENTER_X - 40,
        nextCenterZ: VOLCANO_LAVA_CENTER_Z,
        nextRadius: 80,
      }),
    });

    expect(isInVolcanoLavaHazard(VOLCANO_LAVA_CENTER_X, VOLCANO_LAVA_CENTER_Z)).toBe(true);
    expect(isInVolcanoLavaHazard(VOLCANO_LAVA_CENTER_X + 15, VOLCANO_LAVA_CENTER_Z)).toBe(
      false,
    );

    // 1) Bot placed inside crater immediately sprints outward to >= 14m
    const trappedBot = makeBotEntity({
      state: 'rotating',
      position: { x: VOLCANO_LAVA_CENTER_X + 4, y: 10, z: VOLCANO_LAVA_CENTER_Z },
      grounded: true,
    });
    for (let i = 0; i < 30; i++) {
      updateBot(trappedBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 10 + i * 0.1, 0.1, false);
    }
    const trappedDist = Math.hypot(
      trappedBot.position.x - VOLCANO_LAVA_CENTER_X,
      trappedBot.position.z - VOLCANO_LAVA_CENTER_Z,
    );
    expect(trappedDist).toBeGreaterThanOrEqual(14);

    // 2) Bot routing across the volcano center skirts around the rim staying >= 14m away
    const crossingBot = makeBotEntity({
      state: 'rotating',
      position: { x: VOLCANO_LAVA_CENTER_X + 20, y: 10, z: VOLCANO_LAVA_CENTER_Z },
      moveTarget: { x: VOLCANO_LAVA_CENTER_X - 40, y: 10, z: VOLCANO_LAVA_CENTER_Z },
      grounded: true,
    });
    crossingBot.inventory.items[1] = makeItem('ar', 'rare', 30);

    let minDistToCrater = Infinity;
    for (let i = 0; i < 80; i++) {
      updateBot(crossingBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 10 + i * 0.08, 0.08, false);
      const d = Math.hypot(
        crossingBot.position.x - VOLCANO_LAVA_CENTER_X,
        crossingBot.position.z - VOLCANO_LAVA_CENTER_Z,
      );
      if (d < minDistToCrater) minDistToCrater = d;
    }
    expect(minDistToCrater).toBeGreaterThanOrEqual(14);
  });

  it('scores heavy_shotgun, mythic_blade_rifle, chug_splash up to 150/150 boss caps, and exposes BotBrain helpers', () => {
    const brain = new BotBrain();
    const fullAmmo = {
      light: 60,
      medium: 120,
      shells: 28,
      heavy: 12,
      rockets: 0,
    };

    const bossItems: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('mythic_blade_rifle', 'mythic', 32),
      makeItem('heavy_shotgun', 'legendary', 7),
      makeItem('chug_splash', 'rare', 0, 3),
    ];

    expect(brain.selectBestWeaponForDistance(bossItems, 10, fullAmmo)?.item.weaponId).toBe(
      'heavy_shotgun',
    );
    expect(brain.selectBestWeaponForDistance(bossItems, 45, fullAmmo)?.item.weaponId).toBe(
      'mythic_blade_rifle',
    );

    // Boss at 120/120 with max 150/150 still selects chug_splash; at 150/150 returns null
    expect(brain.selectHealingItem(bossItems, 120, 120, 150, 150)?.item.weaponId).toBe(
      'chug_splash',
    );
    expect(brain.selectHealingItem(bossItems, 150, 150, 150, 150)).toBeNull();
    expect(brain.isInVolcanoLavaHazard(VOLCANO_LAVA_CENTER_X, VOLCANO_LAVA_CENTER_Z)).toBe(
      true,
    );
  });
});

describe('Wave 2 Dynamic Bounty Hunt & Named Boss Vault-Key Eligibility', () => {
  it('assigns a bounty, updates distance/timer, completes with player reward, and auto-reselects after cooldown', () => {
    const ctx = makeMockContext();
    const bountyEvents: Array<{ title: string; targetName: string; tone: string }> = [];
    const soundEvents: string[] = [];

    ctx.eventBus.on('ui:bounty', (e) => bountyEvents.push(e));
    ctx.eventBus.on('sound:play', (s) => soundEvents.push(s.id));

    const manager = new BotManager(ctx, 'standard', 1200);
    manager.spawnBots(6, 20);

    for (const bot of manager.getBots()) {
      bot.state = 'looting';
      bot.grounded = true;
    }
    const targetBot = manager.getBotById('bot_1')!;
    targetBot.position = { x: 80, y: 10, z: 0 };

    const playerPos: Vec3Like = { x: 0, y: 10, z: 0 };
    const assigned = manager.assignBounty(playerPos, 30);
    expect(assigned).not.toBeNull();
    expect(assigned!.timeRemaining).toBe(BOUNTY_DURATION_SEC);
    expect(assigned!.rewardLabel.length).toBeGreaterThan(0);
    expect(bountyEvents[0].tone).toBe('start');
    expect(soundEvents).toContain('bounty_alert');

    const activeBot = manager.getActiveBountyBot()!;
    expect(activeBot).not.toBeNull();
    activeBot.position = { x: 45, y: 10, z: 0 };

    const midQuery = manager.getBountyTarget(playerPos, 55);
    expect(midQuery).not.toBeNull();
    expect(midQuery!.targetName).toBe(activeBot.name);
    expect(midQuery!.distance).toBeCloseTo(45, 3);
    expect(midQuery!.timeRemaining).toBeCloseTo(65, 3);

    // Player eliminates the active bounty target -> emits complete + grants reward
    const lethalHit: DamageEvent = {
      targetId: activeBot.id,
      attackerId: 'player',
      attackerName: 'Player',
      weaponId: 'ar',
      rarity: 'epic',
      damage: 150,
      hpDamage: 150,
      shieldDamage: 0,
      isHeadshot: true,
      isElimination: true,
      hitPoint: { ...activeBot.position },
      distance: 45,
    };
    expect(manager.onBotDamaged(activeBot.id, lethalHit, 60)).toBe(true);
    expect(manager.getBountyTarget(playerPos, 60)).toBeNull();

    expect(bountyEvents.some((e) => e.tone === 'complete' && e.targetName === activeBot.name)).toBe(
      true,
    );
    expect(soundEvents.filter((id) => id === 'bounty_alert').length).toBeGreaterThanOrEqual(2);

    const rewards = manager.consumeBountyRewards();
    expect(rewards).toHaveLength(1);
    expect(rewards[0].targetId).toBe(activeBot.id);
    expect(rewards[0].shield).toBeGreaterThan(0);
    expect(rewards[0].materials).toBeGreaterThan(0);
    expect(manager.consumeBountyRewards()).toHaveLength(0);
    expect(manager.getLastBountyReward()?.targetId).toBe(activeBot.id);

    // Auto-reselection triggers cleanly after cooldown via update()
    manager.update(
      0.05,
      60 + BOUNTY_RESELECT_COOLDOWN_SEC + 0.5,
      { x: 0, y: 175, z: 0 },
      playerPos,
    );
    const reselected = manager.getBountyTarget(
      playerPos,
      60 + BOUNTY_RESELECT_COOLDOWN_SEC + 0.5,
    );
    expect(reselected).not.toBeNull();
    expect(reselected!.targetName).not.toBe(activeBot.name);

    manager.dispose();
  });

  it('expires bounties after 90s, handles poached bounties without player reward, and auto-reselects', () => {
    const ctx = makeMockContext();
    const bountyEvents: Array<{ title: string; targetName: string; tone: string }> = [];
    const soundEvents: string[] = [];

    ctx.eventBus.on('ui:bounty', (e) => bountyEvents.push(e));
    ctx.eventBus.on('sound:play', (s) => soundEvents.push(s.id));

    const manager = new BotManager(ctx, 'standard', 3300);
    manager.spawnBots(5, 20);
    for (const b of manager.getBots()) {
      b.state = 'looting';
      b.grounded = true;
    }

    const playerPos: Vec3Like = { x: 0, y: 10, z: 0 };
    const first = manager.assignBounty(playerPos, 10)!;
    const firstBot = manager.getActiveBountyBot()!;
    expect(first.targetName).toBe(firstBot.name);

    // Still active at 89.5s elapsed (t = 99.5)
    expect(manager.getBountyTarget(playerPos, 99.5)).not.toBeNull();

    // Expires at 90s (t = 100.1)
    expect(manager.getBountyTarget(playerPos, 100.1)).toBeNull();
    expect(
      bountyEvents.some((e) => e.tone === 'expired' && e.targetName === firstBot.name),
    ).toBe(true);
    expect(soundEvents.filter((id) => id === 'bounty_alert').length).toBeGreaterThanOrEqual(2);

    // Auto-reselection via update after cooldown picks another living bot
    manager.update(
      0.05,
      100.1 + BOUNTY_RESELECT_COOLDOWN_SEC + 0.5,
      { x: 0, y: 175, z: 0 },
      playerPos,
    );
    const secondBot = manager.getActiveBountyBot();
    expect(secondBot).not.toBeNull();
    expect(secondBot!.id).not.toBe(firstBot.id);

    // Poached by another bot -> clears bounty as expired without player reward
    const killerBot = manager.getBots().find((b) => b.alive && b.id !== secondBot!.id)!;
    manager.onBotDamaged(
      secondBot!.id,
      {
        targetId: secondBot!.id,
        attackerId: killerBot.id,
        attackerName: killerBot.name,
        weaponId: 'pump_shotgun',
        rarity: 'rare',
        damage: 200,
        hpDamage: 200,
        shieldDamage: 0,
        isHeadshot: true,
        isElimination: true,
        hitPoint: { ...secondBot!.position },
        distance: 5,
      },
      120,
    );
    expect(manager.getBountyTarget(playerPos, 120)).toBeNull();
    expect(manager.consumeBountyRewards()).toHaveLength(0);
    expect(bountyEvents[bountyEvents.length - 1].tone).toBe('expired');

    manager.dispose();
  });

  it('tracks Named Boss player eliminations for Vault Key eligibility while rejecting non-boss, bot-killed, or storm kills', () => {
    const ctx = makeMockContext();
    const manager = new BotManager(ctx, 'standard', 7777);
    const callbackRecords: string[] = [];
    manager.setOnBossEliminatedByPlayer((rec) => callbackRecords.push(rec.bossId));

    manager.spawnBots(12, 20);
    const regularBot = manager.getBots().find((b) => !b.isBoss)!;
    const bosses = manager.getBots().filter((b) => b.isBoss);
    expect(bosses).toHaveLength(3);

    const [skylineBoss, scorchedBoss, frostBoss] = bosses;

    // 1. Player eliminates regular bot -> NOT eligible for Vault Key
    manager.onBotDamaged(
      regularBot.id,
      {
        targetId: regularBot.id,
        attackerId: 'player',
        attackerName: 'Player',
        weaponId: 'ar',
        rarity: 'rare',
        damage: 150,
        hpDamage: 150,
        shieldDamage: 0,
        isHeadshot: false,
        isElimination: true,
        hitPoint: { ...regularBot.position },
        distance: 20,
      },
      15,
    );
    expect(manager.wasBossEliminatedByPlayer(regularBot.id)).toBe(false);
    expect(manager.wasBossEliminatedByPlayer()).toBe(false);
    expect(manager.consumePlayerEliminatedBosses()).toHaveLength(0);

    // 2. Another bot eliminates scorchedBoss -> NOT eligible for player Vault Key
    const killerBot = manager.getBots().find((b) => b.alive && !b.isBoss)!;
    manager.onBotDamaged(
      scorchedBoss.id,
      {
        targetId: scorchedBoss.id,
        attackerId: killerBot.id,
        attackerName: killerBot.name,
        weaponId: 'rocket_launcher',
        rarity: 'legendary',
        damage: 400,
        hpDamage: 250,
        shieldDamage: 150,
        isHeadshot: false,
        isElimination: true,
        hitPoint: { ...scorchedBoss.position },
        distance: 12,
      },
      18,
    );
    expect(manager.wasBossEliminatedByPlayer(scorchedBoss.id)).toBe(false);
    expect(scorchedBoss.eliminatedByPlayer).toBe(false);

    // 3. Storm eliminates frostBoss -> NOT eligible for player Vault Key
    frostBoss.hp = 5;
    frostBoss.shield = 0;
    frostBoss.position = { x: 350, y: 10, z: 350 };
    manager.applyStormDamage(5.0);
    expect(frostBoss.alive).toBe(false);
    expect(manager.wasBossEliminatedByPlayer(frostBoss.id)).toBe(false);

    // 4. Player eliminates skylineBoss -> ELIGIBLE for Vault Key!
    manager.onBotDamaged(
      skylineBoss.id,
      {
        targetId: skylineBoss.id,
        attackerId: 'player',
        attackerName: 'Player',
        weaponId: 'heavy_shotgun',
        rarity: 'legendary',
        damage: 320,
        hpDamage: 170,
        shieldDamage: 150,
        isHeadshot: true,
        isElimination: true,
        hitPoint: { ...skylineBoss.position },
        distance: 8,
      },
      25,
    );
    expect(manager.wasBossEliminatedByPlayer(skylineBoss.id)).toBe(true);
    expect(manager.wasBossEliminatedByPlayer()).toBe(true);
    expect(skylineBoss.eliminatedByPlayer).toBe(true);
    expect(callbackRecords).toEqual([skylineBoss.id]);

    const pending = manager.consumePlayerEliminatedBosses();
    expect(pending).toHaveLength(1);
    expect(pending[0].bossId).toBe(skylineBoss.id);
    expect(pending[0].bossName).toBe(skylineBoss.name);
    expect(pending[0].poiId).toBe(skylineBoss.bossPoiId);
    // Consuming again drains cleanly without double-awarding Vault Keys
    expect(manager.consumePlayerEliminatedBosses()).toHaveLength(0);

    manager.dispose();
  });
});

describe('Wave 2 Shield Bubble & Vehicle Combat Awareness', () => {
  it('accurately evaluates segmentIntersectsSphere and blocks external shots while allowing inside-dome CQC', () => {
    const bubbleCenter = { x: 0, y: 10, z: 15 };
    const radius = 5.2;

    // External segment passing through sphere -> blocked
    expect(
      segmentIntersectsSphere({ x: 0, y: 11, z: 0 }, { x: 0, y: 11, z: 15 }, bubbleCenter, radius),
    ).toBe(true);

    // External segment tangent/far away -> not blocked
    expect(
      segmentIntersectsSphere({ x: 10, y: 11, z: 0 }, { x: 10, y: 11, z: 15 }, bubbleCenter, radius),
    ).toBe(false);

    // Both endpoints inside the same dome -> NOT blocked by shell
    expect(
      isShotBlockedByShieldBubbles(
        { x: 0, y: 11, z: 12.5 },
        { x: 0, y: 11, z: 15.5 },
        [{ position: bubbleCenter, radius }],
      ),
    ).toBeNull();

    // Outside shooter vs inside target -> blocked!
    expect(
      isShotBlockedByShieldBubbles(
        { x: 0, y: 11, z: 0 },
        { x: 0, y: 11, z: 15 },
        [{ position: bubbleCenter, radius }],
      ),
    ).not.toBeNull();
  });

  it('avoids wasting AR/sniper bursts into an active shield bubble, flanks laterally, or pushes inside with shotgun/SMG', () => {
    const bubblePos = { x: 0, y: 10, z: 14 };
    const enemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { ...bubblePos },
      eyePos: { x: 0, y: 11.6, z: 14 },
      hp: 100,
      shield: 50,
      alive: true,
      isPlayer: true,
    };

    // 1) Ranged-only bot (AR + Sniper) holds fire and flanks laterally around the bubble
    const rangedCtx = makeMockContext({
      getCombatTargets: () => [enemy],
      getActiveShieldBubbles: () => [{ position: bubblePos, radius: 5.2 }],
    });
    const rangedBot = makeBotEntity({
      state: 'combat',
      personality: 'sniper',
      position: { x: 0, y: 10, z: -8 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
      strafeDir: 1,
    });
    rangedBot.inventory.items[1] = makeItem('ar', 'epic', 30);
    rangedBot.inventory.items[2] = makeItem('sniper', 'epic', 1);
    rangedBot.inventory.ammo.medium = 60;
    rangedBot.inventory.ammo.heavy = 10;

    for (let i = 0; i < 12; i++) {
      updateBot(rangedBot, rangedCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 10 + i * 0.08, 0.08, false);
    }
    expect(rangedCtx.firedCalls).toHaveLength(0);
    expect(Math.abs(rangedBot.position.x)).toBeGreaterThan(1.5);

    // 2) Bot with AR + Pump Shotgun refrains from firing AR outside, switches to shotgun, pushes inside, and shoots!
    const rushCtx = makeMockContext({
      getCombatTargets: () => [enemy],
      getActiveShieldBubbles: () => [{ position: bubblePos, radius: 5.2 }],
    });
    const rushBot = makeBotEntity({
      state: 'combat',
      personality: 'rusher',
      position: { x: 0, y: 10, z: 2 }, // 12m outside dome
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
    });
    rushBot.inventory.items[1] = makeItem('ar', 'rare', 30);
    rushBot.inventory.items[2] = makeItem('pump_shotgun', 'epic', 5);
    rushBot.inventory.ammo.medium = 60;
    rushBot.inventory.ammo.shells = 20;

    for (let i = 0; i < 30; i++) {
      updateBot(rushBot, rushCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 10 + i * 0.08, 0.08, false);
    }

    // Never wasted AR shots into the dome shell
    expect(rushCtx.firedCalls.some((c) => c.weaponId === 'ar')).toBe(false);
    // Pushed inside the dome and fired shotgun!
    expect(Math.hypot(rushBot.position.x - bubblePos.x, rushBot.position.z - bubblePos.z)).toBeLessThan(
      5.2,
    );
    expect(rushCtx.firedCalls.some((c) => c.weaponId === 'pump_shotgun')).toBe(true);
  });

  it('throws shield_bubble defensively on heavy damage and ignores shield_bubble/grappler as offensive guns', () => {
    const fullAmmo = { light: 50, medium: 50, shells: 10, heavy: 5, rockets: 0 };
    const utilityOnly: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('shield_bubble', 'rare', 0, 2),
      makeItem('grappler', 'epic', 10, 1),
    ];
    expect(selectBestWeaponForDistance(utilityOnly, 25, fullAmmo)).toBeNull();

    const activeBubbles: Array<{ position: Vec3Like; radius: number }> = [];
    const ctx = makeMockContext({
      getActiveShieldBubbles: () => activeBubbles,
    });
    const manager = new BotManager(ctx, 'standard', 919);
    manager.spawnBots(2, 20);
    const bot = manager.getBotById('bot_1')!;
    bot.state = 'rotating';
    bot.position = { x: 0, y: 10, z: 0 };
    bot.grounded = true;
    bot.shield = 100;
    bot.hp = 100;
    bot.inventory.items[1] = makeItem('ar', 'rare', 30);
    bot.inventory.items[2] = makeItem('shield_bubble', 'rare', 0, 2);

    // Minor 10-damage chip -> should NOT waste shield_bubble
    manager.onBotDamaged(
      bot.id,
      {
        targetId: bot.id,
        attackerId: 'player',
        attackerName: 'Player',
        weaponId: 'pistol',
        rarity: 'common',
        damage: 10,
        hpDamage: 0,
        shieldDamage: 10,
        isHeadshot: false,
        isElimination: false,
        hitPoint: { ...bot.position },
        distance: 30,
      },
      10,
    );
    expect(shouldBotDeployShieldBubble(bot, ctx, 10.1)).toBeNull();

    // Heavy 65-damage burst -> triggers defensive shield_bubble throw!
    manager.onBotDamaged(
      bot.id,
      {
        targetId: bot.id,
        attackerId: 'player',
        attackerName: 'Player',
        weaponId: 'sniper',
        rarity: 'epic',
        damage: 65,
        hpDamage: 0,
        shieldDamage: 65,
        isHeadshot: false,
        isElimination: false,
        hitPoint: { ...bot.position },
        distance: 55,
      },
      10.5,
    );
    expect(shouldBotDeployShieldBubble(bot, ctx, 10.6)?.item.weaponId).toBe('shield_bubble');

    manager.update(0.05, 10.6, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 40 });
    expect(ctx.firedCalls.some((c) => c.weaponId === 'shield_bubble')).toBe(true);
    expect(bot.inventory.items[2]?.stackCount).toBe(1);

    // If already covered by an active bubble, will not deploy a second bubble immediately
    bot.shieldBubbleCooldown = 0;
    bot.recentDamageTaken = 60;
    activeBubbles.push({ position: { ...bot.position }, radius: 5.2 });
    expect(shouldBotDeployShieldBubble(bot, ctx, 11.0)).toBeNull();

    manager.dispose();
  });

  it('evades oncoming enemy vehicles and leads projectile aim against moving vehicles', () => {
    const brain = new BotBrain();
    const vehicles: VehicleEntity[] = [
      {
        id: 'veh_1',
        kind: 'hover_atv',
        x: 0,
        y: 10,
        z: 0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        vx: 0,
        vy: 0,
        vz: 18,
        hp: 300,
        maxHp: 300,
        boostCharge: 100,
        isBoosting: true,
        driverId: 'player',
        destroyed: false,
      },
    ];

    const threat = findIncomingVehicleThreat({ x: 0.6, y: 10, z: 12 }, 'bot_1', vehicles);
    expect(threat).not.toBeNull();
    expect(threat!.evadeDirX).toBeGreaterThan(0.5);
    expect(brain.findIncomingVehicleThreat({ x: 0.6, y: 10, z: 12 }, 'bot_1', vehicles)).not.toBeNull();

    const evadeCtx = makeMockContext({
      getVehicles: () => vehicles,
    });
    const evadeBot = makeBotEntity({
      state: 'rotating',
      position: { x: 0.6, y: 10, z: 10 },
      grounded: true,
      jumpCooldown: 0,
    });
    for (let i = 0; i < 6; i++) {
      updateBot(evadeBot, evadeCtx, 'standard', { x: 0, y: 175, z: 0 }, 10 + i * 0.05, 0.05, false);
    }
    expect(evadeBot.position.x).toBeGreaterThan(1.4);

    // Leads sniper projectile ahead along fast-moving lateral vehicle velocity
    const movingVehicle: VehicleEntity = {
      ...vehicles[0],
      x: 0,
      y: 10,
      z: 40,
      vx: 24,
      vz: 0,
    };
    const driverTarget: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 40 },
      eyePos: { x: 0, y: 11.6, z: 40 },
      hp: 100,
      shield: 0,
      alive: true,
      isPlayer: true,
    };
    const leadCtx = makeMockContext({
      getCombatTargets: () => [driverTarget],
      getVehicles: () => [movingVehicle],
    });
    const sniperBot = makeBotEntity({
      state: 'combat',
      personality: 'sniper',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
    });
    sniperBot.inventory.items[1] = makeItem('sniper', 'epic', 1);
    sniperBot.inventory.ammo.heavy = 10;

    updateBot(sniperBot, leadCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 10, 0.05, false);
    expect(leadCtx.firedCalls).toHaveLength(1);
    expect(leadCtx.firedCalls[0].weaponId).toBe('sniper');
    expect(leadCtx.firedCalls[0].aimDir.x).toBeGreaterThan(0.08);
  });
});

describe('Wave 3 Game Modes (Zero Build & Blitz), Slurp Barrels, Campfires & Edge Traversal', () => {
  it('enforces zero_build: 0 build placements and 50 Overshield absorption + 12/s regen after 6.5s', () => {
    const brain = new BotBrain();
    const enemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 22 },
      eyePos: { x: 0, y: 11.6, z: 22 },
      hp: 100,
      shield: 50,
      alive: true,
      isPlayer: true,
    };
    const ctx = makeMockContext({
      getCombatTargets: () => [enemy],
    });

    // 1. shouldBotBuildDefense & updateBot block all building in 'zero_build'
    const zbBot = makeBotEntity({
      state: 'combat',
      personality: 'builder',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      lastDamageTime: 9.8,
      lastDamagerId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
      buildCooldown: 0,
      isBuilding: true,
      buildAnimTimer: 0.3,
    });
    zbBot.inventory.items[1] = makeItem('ar', 'rare', 30);
    zbBot.inventory.ammo.medium = 60;
    zbBot.inventory.materials.wood = 100;

    expect(shouldBotBuildDefense(zbBot, 'sweaty', 10.0, 22, undefined, 'solo')).toBe(true);
    expect(brain.shouldBotBuildDefense(zbBot, 'sweaty', 10.0, 22, undefined, 'zero_build')).toBe(
      false,
    );

    brain.update(zbBot, ctx, 'sweaty', { x: 0, y: 175, z: 0 }, 10.0, 0.05, false, 'zero_build');
    expect(ctx.placedBuilds).toHaveLength(0);
    expect(zbBot.isBuilding).toBe(false);
    expect(zbBot.inventory.materials.wood).toBe(100);
    expect(ctx.firedCalls.length).toBe(1);

    // 2. BotManager in 'zero_build': 50 Overshield, absorbs first, storm bypasses, 12/s regen after 6.5s
    const manager = new BotManager(ctx, 'sweaty', 3030);
    expect(manager.getGameMode()).toBe('solo');
    manager.setGameMode('zero_build');
    expect(manager.getGameMode()).toBe('zero_build');
    manager.spawnBots(12, 22);

    for (const b of manager.getBots()) {
      expect(b.maxOvershield).toBe(50);
      expect(b.overshield).toBe(50);
    }

    const bot = manager.getBotById('bot_1')!;
    bot.state = 'combat';
    bot.personality = 'builder';
    bot.position = { x: 0, y: 10, z: 0 };
    bot.grounded = true;
    bot.shield = 50;
    bot.hp = 100;
    bot.inventory.materials.wood = 120;

    // 30 damage -> absorbed solely by overshield (50 -> 20)
    manager.onBotDamaged(
      bot.id,
      {
        targetId: bot.id,
        attackerId: 'player',
        attackerName: 'Player',
        weaponId: 'ar',
        rarity: 'rare',
        damage: 30,
        hpDamage: 0,
        shieldDamage: 30,
        isHeadshot: false,
        isElimination: false,
        hitPoint: { ...bot.position },
        distance: 22,
      },
      10.0,
    );
    expect(bot.overshield).toBe(20);
    expect(bot.shield).toBe(50);
    expect(bot.hp).toBe(100);

    // 45 damage -> depletes remaining 20 overshield, then 25 shield
    manager.onBotDamaged(
      bot.id,
      {
        targetId: bot.id,
        attackerId: 'player',
        attackerName: 'Player',
        weaponId: 'ar',
        rarity: 'rare',
        damage: 45,
        hpDamage: 0,
        shieldDamage: 45,
        isHeadshot: false,
        isElimination: false,
        hitPoint: { ...bot.position },
        distance: 22,
      },
      11.0,
    );
    expect(bot.overshield).toBe(0);
    expect(bot.shield).toBe(25);
    expect(bot.hp).toBe(100);

    // Manager update also enforces 0 build placements in 'zero_build'
    const buildsBefore = ctx.placedBuilds.length;
    manager.update(0.05, 11.05, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 22 });
    expect(ctx.placedBuilds.length).toBe(buildsBefore);
    expect(bot.isBuilding).toBe(false);

    // Before 6.5s cooldown (11.0 + 6.4 = 17.4): overshield stays 0
    manager.update(0.1, 17.4, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 22 });
    expect(bot.overshield).toBe(0);

    // After 6.5s without damage (elapsed >= 17.5): regens at 12/s -> 2.0s gives 24 overshield, then caps at 50
    for (let i = 0; i < 20; i++) {
      manager.update(0.1, 17.5 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 22 });
    }
    expect(bot.overshield).toBeCloseTo(24, 1);

    for (let i = 0; i < 30; i++) {
      manager.update(0.1, 19.5 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 22 });
    }
    expect(bot.overshield).toBe(50);

    // Storm damage bypasses overshield & shield directly to HP
    bot.position = { x: 350, y: 10, z: 0 };
    manager.applyStormDamage(2.0); // dps=2 -> 4 dmg
    expect(bot.overshield).toBe(50);
    expect(bot.shield).toBe(25);
    expect(bot.hp).toBe(96);

    manager.dispose();
  });

  it('spawns blitz bots with earlier bus jump delays, wood=100, and uncommon AR/SMG starter weapons', () => {
    const soloCtx = makeMockContext();
    const soloMgr = new BotManager(soloCtx, 'standard', 5050);
    soloMgr.spawnBots(12, 22);
    const soloRegular = soloMgr.getBots().filter((b) => !b.isBoss);

    const blitzCtx = makeMockContext();
    const blitzMgr = new BotManager(blitzCtx, 'standard', 5050);
    blitzMgr.setGameMode('blitz');
    expect(blitzMgr.getGameMode()).toBe('blitz');
    blitzMgr.spawnBots(12, 22);
    const blitzRegular = blitzMgr.getBots().filter((b) => !b.isBoss);

    const avgJump = (bots: BotEntity[]) =>
      bots.reduce((sum, b) => sum + b.dropJumpTime, 0) / bots.length;
    const maxJump = (bots: BotEntity[]) =>
      Math.max(...bots.map((b) => b.dropJumpTime));

    expect(avgJump(blitzRegular)).toBeLessThan(avgJump(soloRegular) * 0.65);
    expect(maxJump(blitzRegular)).toBeLessThan(maxJump(soloRegular));

    const starterWeapons = new Set<string>();
    for (const bot of blitzRegular) {
      expect(bot.maxOvershield).toBe(0);
      expect(bot.overshield).toBe(0);
      expect(bot.inventory.materials.wood).toBe(100);
      const starter = bot.inventory.items[1];
      expect(starter).not.toBeNull();
      expect(starter!.rarity).toBe('uncommon');
      expect(['ar', 'smg']).toContain(starter!.weaponId);
      expect(starter!.magAmmo).toBe(30);
      expect(bot.inventory.activeSlot).toBe(1);
      starterWeapons.add(starter!.weaponId);
    }
    expect(starterWeapons.has('ar')).toBe(true);
    expect(starterWeapons.has('smg')).toBe(true);

    soloMgr.dispose();
    blitzMgr.dispose();
  });

  it('targets and breaks Slurp Barrels within 14m when shield < 75, while ignoring in close-range panic', () => {
    const barrels: SlurpBarrelEntity[] = [
      { id: 'barrel_near', x: 0, y: 10, z: 10, hp: 40, maxHp: 40, shieldAmount: 15, destroyed: false },
      { id: 'barrel_far', x: 0, y: 10, z: 24, hp: 40, maxHp: 40, shieldAmount: 15, destroyed: false },
    ];
    const slurpSounds: string[] = [];
    const damageSlurpBarrel = vi.fn((id: string, dmg: number) => {
      const b = barrels.find((entry) => entry.id === id && !entry.destroyed);
      if (!b) return null;
      b.hp = Math.max(0, b.hp - dmg);
      if (b.hp <= 0) b.destroyed = true;
      return {
        destroyed: b.destroyed,
        shieldAmount: b.shieldAmount,
        position: { x: b.x, y: b.y, z: b.z },
      };
    });

    const ctx = makeMockContext({
      getSlurpBarrels: () => barrels,
      damageSlurpBarrel,
    });
    ctx.eventBus.on('sound:play', (s) => slurpSounds.push(s.id));

    const bot = makeBotEntity({
      state: 'looting',
      hp: 100,
      shield: 30,
      maxShield: 100,
      position: { x: 0, y: 10, z: 0 },
      yaw: Math.PI, // starts facing away; must turn & aim toward +Z barrel
      grounded: true,
      fireCooldown: 0,
    });
    bot.inventory.items[1] = makeItem('ar', 'rare', 30);
    bot.inventory.ammo.medium = 60;

    for (let i = 0; i < 20; i++) {
      updateBot(bot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 10 + i * 0.1, 0.1, false);
    }

    expect(damageSlurpBarrel).toHaveBeenCalled();
    expect(damageSlurpBarrel.mock.calls.every(([id]) => id === 'barrel_near')).toBe(true);
    expect(barrels[0].destroyed).toBe(true);
    expect(barrels[1].destroyed).toBe(false);
    expect(bot.shield).toBe(45);
    expect(slurpSounds).toContain('slurp_barrel_break');

    // Close-range combat panic ignores nearby slurp barrel and fights enemy instead
    const panicBarrels: SlurpBarrelEntity[] = [
      { id: 'barrel_panic', x: 5, y: 10, z: 0, hp: 40, maxHp: 40, shieldAmount: 15, destroyed: false },
    ];
    const closeEnemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 9 },
      eyePos: { x: 0, y: 11.6, z: 9 },
      hp: 100,
      shield: 50,
      alive: true,
      isPlayer: true,
    };
    const panicDamageSpy = vi.fn(() => null);
    const panicCtx = makeMockContext({
      getCombatTargets: () => [closeEnemy],
      getSlurpBarrels: () => panicBarrels,
      damageSlurpBarrel: panicDamageSpy,
    });
    const panicBot = makeBotEntity({
      state: 'combat',
      hp: 80,
      shield: 20,
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
    });
    panicBot.inventory.items[1] = makeItem('pump_shotgun', 'rare', 5);
    panicBot.inventory.ammo.shells = 10;

    updateBot(panicBot, panicCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 10, 0.05, false);
    expect(panicDamageSpy).not.toHaveBeenCalled();
    expect(panicCtx.firedCalls.length).toBe(1);

    // Shield >= 75 skips slurp barrel; out-of-ammo bot with shield < 75 uses pickaxe up close
    const pickaxeBarrels: SlurpBarrelEntity[] = [
      { id: 'barrel_melee', x: 0, y: 10, z: 6, hp: 40, maxHp: 40, shieldAmount: 15, destroyed: false },
    ];
    const meleeDamage = vi.fn((id: string, dmg: number) => {
      const b = pickaxeBarrels.find((entry) => entry.id === id && !entry.destroyed);
      if (!b) return null;
      b.hp = Math.max(0, b.hp - dmg);
      if (b.hp <= 0) b.destroyed = true;
      return { destroyed: b.destroyed, shieldAmount: b.shieldAmount, position: { x: b.x, y: b.y, z: b.z } };
    });
    const meleeCtx = makeMockContext({
      getSlurpBarrels: () => pickaxeBarrels,
      damageSlurpBarrel: meleeDamage,
    });
    const fullShieldBot = makeBotEntity({
      state: 'looting',
      shield: 75,
      maxShield: 100,
      position: { x: 0, y: 10, z: 0 },
      grounded: true,
    });
    updateBot(fullShieldBot, meleeCtx, 'standard', { x: 0, y: 175, z: 0 }, 10, 0.1, false);
    expect(meleeDamage).not.toHaveBeenCalled();

    const unarmedBot = makeBotEntity({
      state: 'looting',
      shield: 50,
      maxShield: 100,
      position: { x: 0, y: 10, z: 0 },
      grounded: true,
    });
    for (let i = 0; i < 20 && !pickaxeBarrels[0].destroyed; i++) {
      updateBot(unarmedBot, meleeCtx, 'standard', { x: 0, y: 175, z: 0 }, 12 + i * 0.1, 0.1, false);
    }
    expect(pickaxeBarrels[0].destroyed).toBe(true);
    expect(unarmedBot.shield).toBe(65);
  });

  it('moves toward unlit Campfires within 16m when hp < 65, ignites them, and heals at 3 HP/s inside 5.5m', () => {
    const campfires: CampfireEntity[] = [
      {
        id: 'cf_1',
        poiId: 'whispering_pines',
        x: 0,
        y: 10,
        z: 11,
        lit: false,
        remainingSec: 25,
        maxDurationSec: 25,
        healPerSec: 3,
        radius: 5.5,
      },
    ];
    const igniteCampfire = vi.fn((id: string) => {
      const cf = campfires.find((c) => c.id === id);
      if (!cf || cf.lit || cf.remainingSec <= 0) return false;
      cf.lit = true;
      return true;
    });
    const ctx = makeMockContext({
      getCampfires: () => campfires,
      igniteCampfire,
    });

    // Healthy bot (hp = 80 >= 65) does not ignite campfire
    const healthyBot = makeBotEntity({
      state: 'looting',
      hp: 80,
      position: { x: 0, y: 10, z: 9 },
      grounded: true,
    });
    updateBot(healthyBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 10, 0.1, false);
    expect(igniteCampfire).not.toHaveBeenCalled();
    expect(campfires[0].lit).toBe(false);

    // Injured out-of-combat bot (hp = 45 < 65) 11m away walks up, ignites, and heals at 3 HP/s
    const hurtBot = makeBotEntity({
      state: 'rotating',
      hp: 45,
      maxHp: 100,
      position: { x: 0, y: 10, z: 0 },
      grounded: true,
    });

    for (let i = 0; i < 60; i++) {
      const dt = 0.1;
      updateBot(hurtBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 12 + i * dt, dt, false);
      if (campfires[0].lit) {
        campfires[0].remainingSec = Math.max(0, campfires[0].remainingSec - dt);
      }
    }

    expect(igniteCampfire).toHaveBeenCalledWith('cf_1');
    expect(campfires[0].lit).toBe(true);
    expect(dist2D(hurtBot.position.x, hurtBot.position.z, 0, 11)).toBeLessThanOrEqual(5.5);
    expect(hurtBot.hp).toBeGreaterThan(55);
  });

  it('steers toward nearby Launch Pads within 28m when far from safe center (> 92% storm radius)', () => {
    const pads: LaunchPadEntity[] = [
      {
        id: 'pad_edge_28',
        kind: 'launch_pad',
        x: 76,
        y: 10,
        z: 10,
        radius: 2.2,
        boostVy: 30,
        boostForward: 20,
      },
    ];
    const ctx = makeMockContext({
      storm: makeDefaultStorm({
        currentCenterX: 0,
        currentCenterZ: 0,
        currentRadius: 100,
        nextCenterX: 0,
        nextCenterZ: 0,
        nextRadius: 60,
        isShrinking: false,
      }),
      getLaunchPads: () => pads,
    });

    // At x=95 (dist 95 > 92 = 100*0.92), even before storm edge arrives and while isShrinking=false
    const edgeBot = makeBotEntity({
      state: 'looting',
      position: { x: 95, y: 10, z: 0 },
      grounded: true,
    });
    edgeBot.inventory.items[1] = makeItem('ar', 'rare', 30);

    let launched = false;
    for (let i = 0; i < 60; i++) {
      updateBot(edgeBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 20 + i * 0.1, 0.1, false);
      if (edgeBot.state === 'gliding' && edgeBot.gliderOpen) {
        launched = true;
      }
    }

    expect(launched).toBe(true);
    expect(edgeBot.position.x).toBeLessThan(76);
  });
});

describe('Wave 4 Sky Rifts, POI Flag Capture & Explosive Barrel Opportunism', () => {
  it('steers storm-trapped or burst-injured bots to active Sky Rifts <= 24m, warps to skyPos, and enters gliding', () => {
    const brain = new BotBrain();
    const rifts: RiftEntity[] = [
      {
        id: 'rift_inactive',
        poiId: 'sunken_oasis',
        x: 114,
        y: 10,
        z: 0,
        active: false,
        openRemainingSec: 0,
        cooldownSec: 25,
      },
      {
        id: 'rift_near',
        poiId: 'sunken_oasis',
        x: 106,
        y: 10,
        z: 0,
        active: true,
        openRemainingSec: 0,
        cooldownSec: 0,
      },
      {
        id: 'rift_far',
        poiId: 'sunken_oasis',
        x: 155,
        y: 10,
        z: 0,
        active: true,
        openRemainingSec: 0,
        cooldownSec: 0,
      },
    ];

    const triggerRift = vi.fn((id: string) => {
      const r = rifts.find((entry) => entry.id === id && entry.active);
      if (!r) return null;
      r.openRemainingSec = 8;
      return { skyPos: { x: r.x, y: r.y + 92, z: r.z } };
    });

    const riftVfx: Array<{ position: Vec3Like; skyPosition: Vec3Like }> = [];
    const riftSounds: string[] = [];

    const ctx = makeMockContext({
      storm: makeDefaultStorm({
        currentCenterX: 0,
        currentCenterZ: 0,
        currentRadius: 100,
        nextCenterX: 0,
        nextCenterZ: 0,
        nextRadius: 60,
      }),
      getRifts: () => rifts,
      triggerRift,
    });
    ctx.eventBus.on('vfx:rift_tear', (ev) => riftVfx.push(ev));
    ctx.eventBus.on('sound:play', (s) => riftSounds.push(s.id));

    const stormBot = makeBotEntity({
      state: 'rotating',
      position: { x: 120, y: 10, z: 0 }, // 14m from rift_near (<= 24m), inside storm (> 100m)
      grounded: true,
      hp: 100,
      shield: 50,
    });
    stormBot.inventory.items[1] = makeItem('ar', 'rare', 30);

    // Tick 1: should lock onto rift_near via moveTarget and sprint toward it
    updateBot(stormBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 10.0, 0.1, false);
    expect(stormBot.moveTarget).toEqual({ x: 106, y: 10, z: 0 });
    expect(stormBot.position.x).toBeLessThan(120);

    // Step until bot enters <= 2.5m and triggers the rift
    for (let i = 1; i <= 30 && stormBot.state !== 'gliding'; i++) {
      updateBot(stormBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 10.0 + i * 0.1, 0.1, false);
    }

    expect(triggerRift).toHaveBeenCalledTimes(1);
    expect(triggerRift).toHaveBeenCalledWith('rift_near');
    expect(stormBot.state).toBe('gliding');
    expect(stormBot.gliderOpen).toBe(true);
    expect(stormBot.grounded).toBe(false);
    expect(stormBot.position.y).toBe(102);
    expect(stormBot.riftCooldown ?? 0).toBeGreaterThan(0);
    expect(riftVfx).toHaveLength(1);
    expect(riftVfx[0].position).toEqual({ x: 106, y: 10, z: 0 });
    expect(riftVfx[0].skyPosition).toEqual({ x: 106, y: 102, z: 0 });
    expect(riftSounds).toContain('rift_teleport');

    // Subsequent gliding ticks carry bot toward safe zone
    const xAfterWarp = stormBot.position.x;
    updateBot(stormBot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 14.0, 0.1, false);
    expect(stormBot.state).toBe('gliding');
    expect(stormBot.position.x).toBeLessThan(xAfterWarp);

    // Burst-injured bot inside safe zone also seeks active Sky Rift <= 24m
    const hurtRifts: RiftEntity[] = [
      {
        id: 'rift_safe_zone',
        poiId: 'whispering_pines',
        x: 10,
        y: 10,
        z: 0,
        active: true,
        openRemainingSec: 0,
        cooldownSec: 0,
      },
    ];
    const burstBot = makeBotEntity({
      state: 'combat',
      position: { x: 2, y: 10, z: 0 },
      grounded: true,
      hp: 35,
      maxHp: 100,
      shield: 0,
      lastDamageTime: 19.6,
      recentDamageTaken: 55,
      retreatTimer: 0.75,
    });
    expect(brain.selectEscapeRift(burstBot, hurtRifts, false, 20.0)?.id).toBe('rift_safe_zone');

    // Healthy uninjured bot inside safe zone ignores rifts
    const healthyBot = makeBotEntity({
      state: 'rotating',
      position: { x: 2, y: 10, z: 0 },
      grounded: true,
      hp: 100,
      maxHp: 100,
      shield: 100,
    });
    expect(selectEscapeRift(healthyBot, hurtRifts, false, 20.0)).toBeNull();
  });

  it('steers roaming/looting bots within 35m to uncaptured Capture Points, advances capture inside 6.5m, and emits flag_captured', () => {
    const capturePoints: CapturePointEntity[] = [
      {
        id: 'cp_metro',
        poiId: 'metro_towers',
        poiName: 'Metro Towers',
        x: 0,
        y: 10,
        z: 24,
        radius: 6.5,
        progress: 0,
        captured: false,
        ownerId: null,
        ownerName: null,
      },
      {
        id: 'cp_far',
        poiId: 'market_row',
        poiName: 'Market Row',
        x: 0,
        y: 10,
        z: 95,
        radius: 6.5,
        progress: 0,
        captured: false,
        ownerId: null,
        ownerName: null,
      },
    ];

    const advanceCapturePoint = vi.fn(
      (id: string, actorId: string, actorName: string, dt: number) => {
        const cp = capturePoints.find((c) => c.id === id)!;
        if (cp.captured) {
          return {
            capturedNow: false,
            progress: 1,
            lootPos: { x: cp.x, y: cp.y + 0.6, z: cp.z },
            poiName: cp.poiName,
          };
        }
        cp.progress = Math.min(1, cp.progress + dt / 12);
        const capturedNow = cp.progress >= 1;
        if (capturedNow) {
          cp.captured = true;
          cp.ownerId = actorId;
          cp.ownerName = actorName;
        }
        return {
          capturedNow,
          progress: cp.progress,
          lootPos: capturedNow ? { x: cp.x, y: cp.y + 0.6, z: cp.z } : undefined,
          poiName: cp.poiName,
        };
      },
    );

    const flagVfx: Array<{ position: Vec3Like; poiName: string }> = [];
    const flagSounds: string[] = [];

    const ctx = makeMockContext({
      getCapturePoints: () => capturePoints,
      advanceCapturePoint,
    });
    ctx.eventBus.on('vfx:flag_captured', (ev) => flagVfx.push(ev));
    ctx.eventBus.on('sound:play', (s) => flagSounds.push(s.id));

    // Bot > 35m away does not pick cp_metro when out of range
    const farBot = makeBotEntity({
      state: 'rotating',
      position: { x: 0, y: 10, z: -20 }, // 44m from cp_metro
      grounded: true,
    });
    expect(selectCapturePointTarget(farBot, capturePoints, 10)).toBeNull();

    // Roaming/looting bot 24m away (<= 35m) steers in and captures cp_metro over 12s
    const bot = makeBotEntity({
      state: 'looting',
      position: { x: 0, y: 10, z: 0 },
      grounded: true,
    });
    bot.inventory.items[1] = makeItem('ar', 'rare', 30);

    for (let i = 0; i < 180 && !capturePoints[0].captured; i++) {
      updateBot(bot, ctx, 'standard', { x: 0, y: 175, z: 0 }, 15 + i * 0.1, 0.1, false);
    }

    expect(advanceCapturePoint).toHaveBeenCalled();
    expect(capturePoints[0].captured).toBe(true);
    expect(capturePoints[0].ownerId).toBe(bot.id);
    expect(capturePoints[0].ownerName).toBe(bot.name);
    expect(dist2D(bot.position.x, bot.position.z, 0, 24)).toBeLessThanOrEqual(6.5);
    expect(flagVfx).toEqual([
      { position: { x: 0, y: 10, z: 24 }, poiName: 'Metro Towers' },
    ]);
    expect(flagSounds).toContain('flag_captured');

    // Bot in active combat abandons/skips flag capture to fight enemy
    capturePoints[0].captured = false;
    capturePoints[0].progress = 0;
    const enemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 14 },
      eyePos: { x: 0, y: 11.6, z: 14 },
      hp: 100,
      shield: 50,
      alive: true,
      isPlayer: true,
    };
    const combatAdvanceSpy = vi.fn(() => ({
      capturedNow: false,
      progress: 0,
      poiName: 'Metro Towers',
    }));
    const combatCtx = makeMockContext({
      getCombatTargets: () => [enemy],
      getCapturePoints: () => capturePoints,
      advanceCapturePoint: combatAdvanceSpy,
    });
    const combatBot = makeBotEntity({
      state: 'looting',
      position: { x: 0, y: 10, z: 22 }, // inside capture radius, but enemy is visible!
      yaw: Math.PI,
      grounded: true,
      reactionTimer: 0,
      fireCooldown: 0,
    });
    combatBot.inventory.items[1] = makeItem('ar', 'rare', 30);
    combatBot.inventory.ammo.medium = 60;

    updateBot(combatBot, combatCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 25, 0.1, false);
    expect(combatBot.state).toBe('combat');
    expect(combatAdvanceSpy).not.toHaveBeenCalled();
  });

  it('prioritizes shooting unexploded Explosive Barrels within 6.2m of combat target and triggers chain explosions', () => {
    const enemy: BotCombatTarget = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 10, z: 22 },
      eyePos: { x: 0, y: 11.6, z: 22 },
      hp: 100,
      shield: 50,
      alive: true,
      isPlayer: true,
    };

    const barrels: ExplosiveBarrelEntity[] = [
      {
        id: 'exp_near_enemy',
        x: 3.5,
        y: 10,
        z: 22, // 3.5m from enemy (<= 6.2m)
        hp: 35,
        maxHp: 35,
        blastRadius: 6.8,
        blastDamage: 85,
        exploded: false,
      },
      {
        id: 'exp_chain',
        x: 7.5,
        y: 10,
        z: 22, // 4.0m from exp_near_enemy (<= 6.8m chain radius)
        hp: 35,
        maxHp: 35,
        blastRadius: 6.8,
        blastDamage: 85,
        exploded: false,
      },
      {
        id: 'exp_too_far',
        x: -9.0,
        y: 10,
        z: 22, // 9.0m from enemy (> 6.2m)
        hp: 35,
        maxHp: 35,
        blastRadius: 6.8,
        blastDamage: 85,
        exploded: false,
      },
    ];

    const damageExplosiveBarrel = vi.fn((id: string, dmg: number) => {
      const b = barrels.find((entry) => entry.id === id && !entry.exploded);
      if (!b) return null;
      b.hp = Math.max(0, b.hp - dmg);
      if (b.hp <= 0) b.exploded = true;
      return {
        exploded: b.exploded,
        position: { x: b.x, y: b.y, z: b.z },
        blastRadius: b.blastRadius,
        blastDamage: b.blastDamage,
      };
    });

    const explosionEvents: Array<{ position: Vec3Like; radius: number }> = [];
    const barrelSounds: string[] = [];

    const ctx = makeMockContext({
      getCombatTargets: () => [enemy],
      getExplosiveBarrels: () => barrels,
      damageExplosiveBarrel,
    });
    ctx.eventBus.on('vfx:explosion', (ev) => explosionEvents.push(ev));
    ctx.eventBus.on('sound:play', (s) => barrelSounds.push(s.id));

    const bot = makeBotEntity({
      state: 'combat',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      targetEnemyId: 'player',
      reactionTimer: 0,
      fireCooldown: 0,
    });
    bot.inventory.items[1] = makeItem('ar', 'rare', 30); // rare AR: 34 dmg/shot -> 2 shots to break 35 HP
    bot.inventory.ammo.medium = 60;

    // On first shot, bot prioritizes barrel over shooting enemy directly
    updateBot(bot, ctx, 'sweaty', { x: 0, y: 175, z: 0 }, 10.0, 0.05, false);
    expect(damageExplosiveBarrel).toHaveBeenCalledWith('exp_near_enemy', expect.any(Number));
    expect(ctx.firedCalls).toHaveLength(0);

    // Continue until barrel explodes (triggers chain explosion on exp_chain too!)
    for (let i = 1; i <= 10 && !barrels[0].exploded; i++) {
      updateBot(bot, ctx, 'sweaty', { x: 0, y: 175, z: 0 }, 10.0 + i * 0.08, 0.08, false);
    }

    expect(barrels[0].exploded).toBe(true);
    expect(barrels[1].exploded).toBe(true);
    expect(barrels[2].exploded).toBe(false);
    expect(explosionEvents.length).toBeGreaterThanOrEqual(2);
    expect(barrelSounds.filter((s) => s === 'barrel_explode').length).toBeGreaterThanOrEqual(2);

    // Once nearby barrels are exploded, bot fires directly at enemy
    const firedBefore = ctx.firedCalls.length;
    for (let i = 0; i < 6; i++) {
      updateBot(bot, ctx, 'sweaty', { x: 0, y: 175, z: 0 }, 11.2 + i * 0.08, 0.08, false);
    }
    expect(ctx.firedCalls.length).toBeGreaterThan(firedBefore);

    // Blocked LOS skips barrel selection
    const blockedBarrel: ExplosiveBarrelEntity = {
      id: 'exp_blocked',
      x: 2.0,
      y: 10,
      z: 22,
      hp: 35,
      maxHp: 35,
      blastRadius: 6.8,
      blastDamage: 85,
      exploded: false,
    };
    expect(
      selectExplosiveBarrelTarget(bot, enemy, [blockedBarrel], () => false),
    ).toBeNull();
  });
});

describe('Wave 5 NPC Specialist Allies, Friendly-Fire Immunity & Support Events', () => {
  function makeNpc(
    role: NpcSpecialistEntity['role'],
    overrides: Partial<NpcSpecialistEntity> = {},
  ): NpcSpecialistEntity {
    const defaults: Record<
      NpcSpecialistEntity['role'],
      { id: string; name: string; poiId: string; skinId: string }
    > = {
      scout: {
        id: 'npc_scout',
        name: 'Recon Nova',
        poiId: 'whispering_pines',
        skinId: 'neon_drift',
      },
      medic: {
        id: 'npc_medic',
        name: 'Doc Remedy',
        poiId: 'sunken_oasis',
        skinId: 'emerald_scout',
      },
      heavy: {
        id: 'npc_heavy',
        name: 'Tank Bastion',
        poiId: 'frostpeak_citadel',
        skinId: 'arctic_apex',
      },
    };
    const spec = defaults[role];
    return {
      id: spec.id,
      name: spec.name,
      role,
      poiId: spec.poiId,
      skinId: spec.skinId,
      x: 10,
      y: 10,
      z: 10,
      priceGold: 200,
      hiredBy: 'player',
      ...overrides,
    };
  }

  it('spawns role-configured allies, enforces at-most-1 companion, and excludes allies from getAliveCount & bounty', () => {
    const ctx = makeMockContext();
    const manager = new BotManager(ctx, 'standard', 777);
    manager.spawnBots(2, 20);
    const [bot1, bot2] = manager.getBots();
    bot1.state = 'rotating';
    bot1.position = { x: 25, y: 10, z: 0 };
    bot2.state = 'rotating';
    bot2.position = { x: 140, y: 10, z: 0 };

    // 1. Scout loadout & vitals
    const scout = manager.spawnAlliedSpecialist(makeNpc('scout'));
    expect(scout.isAlly).toBe(true);
    expect(scout.allyRole).toBe('scout');
    expect(scout.hp).toBe(160);
    expect(scout.maxHp).toBe(160);
    expect(scout.shield).toBe(100);
    expect(scout.maxShield).toBe(100);
    expect(
      scout.inventory.items.some((i) => i?.weaponId === 'ar' && i.rarity === 'rare'),
    ).toBe(true);
    expect(
      scout.inventory.items.some(
        (i) => i?.weaponId === 'tactical_dmr' || i?.weaponId === 'sniper',
      ),
    ).toBe(true);
    expect(manager.getHiredAlly()?.id).toBe(scout.id);
    expect(manager.getAliveCount()).toBe(2);

    // 2. Medic replaces Scout cleanly
    const medic = manager.spawnAlliedSpecialist(makeNpc('medic'));
    expect(medic.allyRole).toBe('medic');
    expect(medic.shield).toBe(100);
    expect(medic.inventory.items.some((i) => i?.weaponId === 'smg')).toBe(true);
    expect(medic.inventory.items.some((i) => i?.weaponId === 'chug_splash')).toBe(true);
    expect(medic.inventory.items.some((i) => i?.weaponId === 'ar')).toBe(true);
    expect(manager.getBots().filter((b) => b.isAlly)).toHaveLength(1);
    expect(manager.getHiredAlly()?.id).toBe(medic.id);

    // 3. Heavy replaces Medic with 125 shield & Epic Heavy Shotgun + AR
    const heavy = manager.spawnAlliedSpecialist(makeNpc('heavy'));
    expect(heavy.allyRole).toBe('heavy');
    expect(heavy.hp).toBe(160);
    expect(heavy.maxHp).toBe(160);
    expect(heavy.shield).toBe(125);
    expect(heavy.maxShield).toBe(125);
    expect(
      heavy.inventory.items.some(
        (i) => i?.weaponId === 'heavy_shotgun' && i.rarity === 'epic',
      ),
    ).toBe(true);
    expect(heavy.inventory.items.some((i) => i?.weaponId === 'ar')).toBe(true);
    expect(manager.getBots().filter((b) => b.isAlly)).toHaveLength(1);
    expect(manager.getHiredAlly()?.id).toBe(heavy.id);

    // Render state exposes ally flags cleanly for CharacterRig visuals
    const allyRender = manager.getRenderStates().find((r) => r.id === heavy.id);
    expect(allyRender?.isAlly).toBe(true);
    expect(allyRender?.allyRole).toBe('heavy');
    expect(allyRender?.alive).toBe(true);

    // Eliminate both hostile bots (1 by damage, 1 by storm) -> getAliveCount === 0 even with alive ally!
    expect(
      manager.onBotDamaged(
        bot1.id,
        {
          targetId: bot1.id,
          attackerId: heavy.id,
          attackerName: heavy.name,
          weaponId: 'heavy_shotgun',
          rarity: 'epic',
          damage: 150,
          hpDamage: 150,
          shieldDamage: 0,
          isHeadshot: true,
          isElimination: true,
          hitPoint: { ...bot1.position },
          distance: 8,
        },
        15,
      ),
    ).toBe(true);
    expect(heavy.kills).toBe(1);
    expect(manager.getAliveCount()).toBe(1);

    ctx.storm = makeDefaultStorm({
      currentCenterX: 0,
      currentCenterZ: 0,
      currentRadius: 50,
      dps: 40,
    });
    manager.applyStormDamage(3.0);
    expect(bot2.alive).toBe(false);
    expect(manager.getAliveCount()).toBe(0);
    expect(manager.getHiredAlly()?.alive).toBe(true);
    expect(manager.assignBounty({ x: 0, y: 10, z: 0 }, 20)).toBeNull();

    manager.reset();
    expect(manager.getHiredAlly()).toBeNull();
    manager.dispose();
  });

  it('grants allies friendly-fire immunity from player while allowing hostile vs ally combat damage', () => {
    const ctx = makeMockContext();
    const manager = new BotManager(ctx, 'standard', 101);
    manager.spawnBots(1, 20);
    const hostile = manager.getBotById('bot_1')!;
    hostile.state = 'combat';
    hostile.position = { x: 20, y: 10, z: 0 };

    const ally = manager.spawnAlliedSpecialist(makeNpc('heavy', { x: 0, z: 0 }));

    // Friendly fire from 'player' is completely ignored
    const ffHit: DamageEvent = {
      targetId: ally.id,
      attackerId: 'player',
      attackerName: 'Player',
      weaponId: 'pump_shotgun',
      rarity: 'legendary',
      damage: 180,
      hpDamage: 180,
      shieldDamage: 0,
      isHeadshot: true,
      isElimination: false,
      hitPoint: { ...ally.position },
      distance: 4,
    };
    expect(manager.onBotDamaged(ally.id, ffHit, 10)).toBe(false);
    expect(ally.hp).toBe(160);
    expect(ally.shield).toBe(125);
    expect(ally.targetEnemyId).toBeNull();

    // Damage from hostile bot reduces ally shield/hp and alerts ally
    const enemyHit: DamageEvent = {
      targetId: ally.id,
      attackerId: hostile.id,
      attackerName: hostile.name,
      weaponId: 'ar',
      rarity: 'rare',
      damage: 80,
      hpDamage: 0,
      shieldDamage: 80,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { ...ally.position },
      distance: 18,
    };
    expect(manager.onBotDamaged(ally.id, enemyHit, 11)).toBe(true);
    expect(ally.shield).toBe(45);
    expect(ally.hp).toBe(160);
    expect(ally.targetEnemyId).toBe(hostile.id);

    // Lethal hostile damage eliminates the ally cleanly
    const lethalEnemyHit: DamageEvent = {
      ...enemyHit,
      damage: 250,
      hpDamage: 205,
      shieldDamage: 45,
      isElimination: true,
    };
    expect(manager.onBotDamaged(ally.id, lethalEnemyHit, 12)).toBe(true);
    expect(ally.alive).toBe(false);
    expect(manager.getHiredAlly()).toBeNull();
    expect(hostile.kills).toBe(1);

    manager.dispose();
  });

  it('never fires at player, targets closest hostile within 45m, follows 5.5m..16m leash with >38m teleport catchup, and draws hostile aggro', () => {
    let targets: BotCombatTarget[] = [];
    const ctx = makeMockContext({
      getCombatTargets: () => targets,
    });
    const manager = new BotManager(ctx, 'sweaty', 333);
    const ally = manager.spawnAlliedSpecialist(makeNpc('scout', { x: 0, z: 10 }));
    ally.yaw = 0;

    // 1. Only player present -> ally NEVER targets or fires at player
    targets = [
      {
        id: 'player',
        name: 'Player',
        position: { x: 0, y: 10, z: 0 },
        eyePos: { x: 0, y: 11.6, z: 0 },
        hp: 100,
        shield: 100,
        alive: true,
        isPlayer: true,
      },
    ];
    for (let i = 0; i < 15; i++) {
      manager.update(0.05, 10 + i * 0.05, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    }
    expect(ally.targetEnemyId).toBeNull();
    expect(ctx.firedCalls).toHaveLength(0);

    // 2. Hostile beyond 45m is ignored
    targets.push({
      id: 'far_enemy',
      name: 'FarBot',
      position: { x: 0, y: 10, z: 62 }, // > 45m from ally at z~10
      eyePos: { x: 0, y: 11.6, z: 62 },
      hp: 100,
      shield: 0,
      alive: true,
      isPlayer: false,
    });
    manager.update(0.05, 11, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    expect(ally.targetEnemyId).toBeNull();
    expect(ctx.firedCalls).toHaveLength(0);

    // 3. Closest hostile within 45m is prioritized over farther hostile (and player is still ignored)
    targets.push(
      {
        id: 'mid_enemy',
        name: 'MidBot',
        position: { x: 0, y: 10, z: 42 },
        eyePos: { x: 0, y: 11.6, z: 42 },
        hp: 100,
        shield: 0,
        alive: true,
        isPlayer: false,
      },
      {
        id: 'near_enemy',
        name: 'NearBot',
        position: { x: 0, y: 10, z: 24 },
        eyePos: { x: 0, y: 11.6, z: 24 },
        hp: 100,
        shield: 50,
        alive: true,
        isPlayer: false,
      },
    );
    for (let i = 0; i < 15; i++) {
      manager.update(0.05, 12 + i * 0.05, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    }
    expect(ally.targetEnemyId).toBe('near_enemy');
    expect(ctx.firedCalls.some((c) => c.botId === ally.id)).toBe(true);

    // 4. Leash behavior: teleport catchup when > 38m, sprint catchup when > 16m, step back when < 5.5m
    targets = [targets[0]]; // player only
    ally.position = { x: 110, y: 10, z: 0 };
    manager.update(0.05, 15, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    expect(dist2D(ally.position.x, ally.position.z, 0, 0)).toBeLessThanOrEqual(16);

    ally.position = { x: 28, y: 10, z: 0 };
    for (let i = 0; i < 30; i++) {
      manager.update(0.1, 16 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    }
    expect(dist2D(ally.position.x, ally.position.z, 0, 0)).toBeLessThanOrEqual(16);

    ally.position = { x: 1.5, y: 10, z: 0 };
    for (let i = 0; i < 15; i++) {
      manager.update(0.1, 20 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    }
    expect(dist2D(ally.position.x, ally.position.z, 0, 0)).toBeGreaterThanOrEqual(5.4);

    // 5. Hostile bots perceive alive ally targets nearby
    const hostileBot = makeBotEntity({
      id: 'hostile_observer',
      state: 'rotating',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      reactionTimer: 0,
      fireCooldown: 0,
    });
    hostileBot.inventory.items[1] = makeItem('ar', 'rare', 30);
    hostileBot.inventory.ammo.medium = 60;
    const hostileTargets: BotCombatTarget[] = [
      {
        id: ally.id,
        name: ally.name,
        position: { x: 0, y: 10, z: 14 },
        eyePos: { x: 0, y: 11.6, z: 14 },
        hp: ally.hp,
        shield: ally.shield,
        alive: true,
        isPlayer: false,
        isAlly: true,
      },
    ];
    const hostileCtx = makeMockContext({
      getCombatTargets: () => hostileTargets,
    });
    for (let i = 0; i < 8; i++) {
      updateBot(
        hostileBot,
        hostileCtx,
        'sweaty',
        { x: 0, y: 175, z: 0 },
        25 + i * 0.05,
        0.05,
        false,
      );
    }
    expect(hostileBot.targetEnemyId).toBe(ally.id);
    expect(hostileBot.state).toBe('combat');
    expect(hostileCtx.firedCalls.some((c) => c.botId === hostileBot.id)).toBe(true);

    manager.dispose();
  });

  it('triggers Scout scout_ping every 16s when hostiles are within 55m and Medic medic_heal every 18s', () => {
    // Scout test
    let scoutTargets: BotCombatTarget[] = [
      {
        id: 'far_bot',
        name: 'FarBot',
        position: { x: 75, y: 10, z: 0 }, // > 55m
        eyePos: { x: 75, y: 11.6, z: 0 },
        hp: 100,
        shield: 0,
        alive: true,
      },
    ];
    const scoutCtx = makeMockContext({ getCombatTargets: () => scoutTargets });
    const scoutMgr = new BotManager(scoutCtx, 'standard', 404);
    scoutMgr.spawnAlliedSpecialist(makeNpc('scout', { x: 0, z: 0 }));

    scoutMgr.update(0.1, 1.0, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 6 });
    expect(scoutMgr.consumeAllySupportEvents()).toHaveLength(0);

    // Bring hostile within 55m -> immediate scout_ping, then 16s cooldown
    scoutTargets = [
      {
        id: 'near_bot',
        name: 'NearBot',
        position: { x: 35, y: 10, z: 0 },
        eyePos: { x: 35, y: 11.6, z: 0 },
        hp: 100,
        shield: 0,
        alive: true,
      },
    ];
    scoutMgr.update(0.1, 2.0, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 6 });
    const firstScoutEvents = scoutMgr.consumeAllySupportEvents();
    expect(firstScoutEvents).toHaveLength(1);
    expect(firstScoutEvents[0].kind).toBe('scout_ping');

    // Step 15.5s (< 16s) -> still on cooldown
    for (let i = 0; i < 155; i++) {
      scoutMgr.update(0.1, 3.0 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 6 });
    }
    expect(scoutMgr.consumeAllySupportEvents()).toHaveLength(0);

    // Cross 16s -> triggers second scout_ping
    for (let i = 0; i < 6; i++) {
      scoutMgr.update(0.1, 18.6 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 6 });
    }
    const secondScoutEvents = scoutMgr.consumeAllySupportEvents();
    expect(secondScoutEvents).toHaveLength(1);
    expect(secondScoutEvents[0].kind).toBe('scout_ping');
    scoutMgr.dispose();

    // Medic test
    const medicCtx = makeMockContext();
    const medicMgr = new BotManager(medicCtx, 'standard', 505);
    const medic = medicMgr.spawnAlliedSpecialist(makeNpc('medic', { x: 0, z: 0 }));
    medic.hp = 140;
    medic.shield = 95;

    medicMgr.update(0.1, 1.0, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 6 });
    const firstMedicEvents = medicMgr.consumeAllySupportEvents();
    expect(firstMedicEvents).toHaveLength(1);
    expect(firstMedicEvents[0].kind).toBe('medic_heal');
    expect(firstMedicEvents[0].amount).toBe(25);
    expect(medic.hp).toBe(160);
    expect(medic.shield).toBe(100);

    // Step 17.5s (< 18s) -> no event yet
    for (let i = 0; i < 175; i++) {
      medicMgr.update(0.1, 2.0 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 6 });
    }
    expect(medicMgr.consumeAllySupportEvents()).toHaveLength(0);

    // Cross 18s -> triggers second medic_heal
    for (let i = 0; i < 6; i++) {
      medicMgr.update(0.1, 19.6 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 6 });
    }
    const secondMedicEvents = medicMgr.consumeAllySupportEvents();
    expect(secondMedicEvents).toHaveLength(1);
    expect(secondMedicEvents[0]).toMatchObject({ kind: 'medic_heal', amount: 25 });
    medicMgr.dispose();
  });

  it('scores Wave 5 tactical_dmr and kinetic_blade weapons cleanly in selectBestWeaponForDistance', () => {
    const items: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('tactical_dmr', 'epic', 10),
      makeItem('kinetic_blade', 'epic', 0),
    ];
    const ammo = { light: 0, medium: 60, shells: 0, heavy: 0, rockets: 0 };

    expect(selectBestWeaponForDistance(items, 35, ammo)?.item.weaponId).toBe(
      'tactical_dmr',
    );
    expect(
      selectBestWeaponForDistance([makeItem('pickaxe', 'common', 0), makeItem('kinetic_blade', 'epic', 0)], 2.5, ammo)?.item.weaponId,
    ).toBe('kinetic_blade');
  });
});

describe('Wave 6 Duos Squads, DBNO/Revive, Boss Medallions, Victory Crowns & New Weapons', () => {
  it('spawns APEX VALKYRIE Duo Partner, pairs enemy bots into 2-bot squads, and excludes partner from getAliveCount & friendly fire', () => {
    const ctx = makeMockContext({ gameMode: 'duos' });
    const manager = new BotManager(ctx, 'standard', 4242, 'duos');
    manager.spawnBots(6, 20, 'duos');

    const partner = manager.getDuoPartner();
    expect(partner).not.toBeNull();
    expect(partner!.name).toBe('APEX VALKYRIE');
    expect(partner!.isDuoPartner).toBe(true);
    expect(partner!.squadId).toBe('player_squad');

    // Hostile count excludes Duo Partner; total bots = 6 enemies + 1 partner
    expect(manager.getAliveCount()).toBe(6);
    expect(manager.getBots()).toHaveLength(7);

    // Enemy bots paired into 2-bot squads squad_1, squad_2, squad_3
    const enemies = manager.getBots().filter((b) => !b.isDuoPartner);
    const bySquad = new Map<string, BotEntity[]>();
    for (const enemy of enemies) {
      expect(enemy.squadId).toMatch(/^squad_\d+$/);
      const list = bySquad.get(enemy.squadId!) ?? [];
      list.push(enemy);
      bySquad.set(enemy.squadId!, list);
    }
    expect(Array.from(bySquad.keys()).sort()).toEqual(['squad_1', 'squad_2', 'squad_3']);
    for (const members of bySquad.values()) {
      expect(members).toHaveLength(2);
      expect(members[0].targetPoiId).toBe(members[1].targetPoiId);
      expect(members[0].dropJumpTime).toBe(members[1].dropJumpTime);
    }

    // Friendly-fire immune from player and same-squad enemy
    expect(manager.damageBot(partner!.id, 150, 'player', 'Player', 10)).toBe(false);
    expect(partner!.hp).toBe(100);
    expect(partner!.shield).toBe(100);

    const [s1a, s1b] = bySquad.get('squad_1')!;
    expect(manager.damageBot(s1a.id, 90, s1b.id, s1b.name, 10)).toBe(false);
    expect(s1a.hp).toBe(100);

    // Duo Partner HUD state reports live distance and vitals
    partner!.position = { x: 3, y: 10, z: 4 };
    const hudState = manager.getDuoPartnerHudState({ x: 0, y: 10, z: 0 });
    expect(hudState).toMatchObject({
      name: 'APEX VALKYRIE',
      hp: 100,
      maxHp: 100,
      shield: 100,
      maxShield: 100,
      knocked: false,
      alive: true,
    });
    expect(hudState!.distance).toBeCloseTo(5, 3);

    // Render state & summary expose Wave 6 fields
    const partnerRender = manager.getRenderStates().find((r) => r.id === partner!.id);
    expect(partnerRender?.isDuoPartner).toBe(true);
    expect(partnerRender?.squadId).toBe('player_squad');

    manager.dispose();
  });

  it('handles Duos DBNO knocking, thirsting, Squad Wipe elimination, slow crawl bleed-out, and reviveDuoPartner()', () => {
    const ctx = makeMockContext({ gameMode: 'duos' });
    const manager = new BotManager(ctx, 'standard', 6161, 'duos');
    const sounds: string[] = [];
    ctx.eventBus.on('sound:play', (s) => sounds.push(s.id));

    manager.spawnBots(4, 20, 'duos');
    const partner = manager.getDuoPartner()!;
    const squad1 = manager.getBots().filter((b) => b.squadId === 'squad_1');
    const squad2 = manager.getBots().filter((b) => b.squadId === 'squad_2');
    expect(squad1).toHaveLength(2);
    expect(squad2).toHaveLength(2);

    // 1. Lethal hit on squad_1[0] while squad_1[1] is alive & standing -> DBNO ('knocked')
    expect(manager.damageBot(squad1[0].id, 200, 'player', 'Player', 12)).toBe(true);
    expect(squad1[0].isKnocked).toBe(true);
    expect(squad1[0].state).toBe('knocked');
    expect(squad1[0].alive).toBe(true);
    expect(squad1[0].bleedOutHp).toBe(DBNO_MAX_HP);
    expect(manager.getAliveCount()).toBe(4);
    expect(sounds).toContain('knocked_down');

    // 2. Lethal hit on squad_1[1] -> no non-knocked squadmates left -> Squad Wipe eliminates BOTH!
    expect(manager.damageBot(squad1[1].id, 200, 'player', 'Player', 13)).toBe(true);
    expect(squad1[1].alive).toBe(false);
    expect(squad1[1].state).toBe('eliminated');
    expect(squad1[0].alive).toBe(false);
    expect(squad1[0].state).toBe('eliminated');
    expect(squad1[0].isKnocked).toBe(false);
    expect(manager.getAliveCount()).toBe(2);

    // 3. Thirsting a knocked bot directly eliminates it once bleedOutHp reaches 0
    expect(manager.damageBot(squad2[0].id, 200, 'player', 'Player', 14)).toBe(true);
    expect(squad2[0].isKnocked).toBe(true);
    expect(manager.damageBot(squad2[0].id, 60, 'player', 'Player', 14.5)).toBe(true);
    expect(squad2[0].bleedOutHp).toBe(40);
    expect(squad2[0].alive).toBe(true);
    expect(manager.damageBot(squad2[0].id, 50, 'player', 'Player', 15)).toBe(true);
    expect(squad2[0].alive).toBe(false);
    expect(squad2[0].state).toBe('eliminated');

    // 4. Knocking Duo Partner while player is alive -> slow crawl + bleed-out + reviveDuoPartner()
    partner.position = { x: 10, y: 10, z: 0 };
    expect(manager.damageBot(partner.id, 250, squad2[1].id, squad2[1].name, 16)).toBe(true);
    expect(partner.isKnocked).toBe(true);
    expect(partner.state).toBe('knocked');
    expect(partner.bleedOutHp).toBe(DBNO_MAX_HP);

    const startX = partner.position.x;
    manager.update(0.1, 16.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 0 });
    expect(partner.animState).toBe('knocked');
    expect(partner.moveSpeed).toBeLessThanOrEqual(1.45);
    expect(partner.position.x).toBeLessThan(startX);
    expect(partner.bleedOutHp).toBeCloseTo(DBNO_MAX_HP - DBNO_BLEED_DPS * 0.1, 2);

    const hudKnocked = manager.getDuoPartnerHudState({ x: 0, y: 10, z: 0 });
    expect(hudKnocked?.knocked).toBe(true);
    expect(hudKnocked?.bleedOutHp).toBeCloseTo(partner.bleedOutHp!, 2);

    expect(manager.reviveDuoPartner()).toBe(true);
    expect(partner.isKnocked).toBe(false);
    expect(partner.state).toBe('rotating');
    expect(partner.hp).toBe(30);
    expect(sounds).toContain('revive_complete');

    manager.dispose();
  });

  it('auto-revives knocked human player after 4s via Duo Partner and revives enemy squadmates only when safe', () => {
    // 1. Duo Partner auto-revives knocked human player when ctx.playerKnocked === true
    let playerKnocked = true;
    const onPlayerRevived = vi.fn(() => {
      playerKnocked = false;
    });
    const duoCtx = makeMockContext({
      gameMode: 'duos',
      get playerKnocked() {
        return playerKnocked;
      },
      onPlayerRevived,
    });
    const reviveVfx: number[] = [];
    duoCtx.eventBus.on('vfx:revive_beam', (ev) => reviveVfx.push(ev.progress));

    const duoMgr = new BotManager(duoCtx, 'standard', 1111, 'duos');
    duoMgr.spawnBots(2, 20, 'duos');
    const partner = duoMgr.getDuoPartner()!;
    partner.position = { x: 8, y: 10, z: 0 };
    const playerPos: Vec3Like = { x: 0, y: 10, z: 0 };

    // Step until partner sprints in (<3.4m) and finishes 4s revive channel
    let t = 1.0;
    for (let i = 0; i < 80 && playerKnocked; i++) {
      t += 0.1;
      duoMgr.update(0.1, t, { x: 0, y: 175, z: 0 }, playerPos);
      if (partner.state === 'reviving') {
        expect(partner.animState).toBe('reviving');
        expect(partner.isReviving).toBe(true);
        expect(partner.reviveTargetId).toBe('player');
      }
    }

    expect(onPlayerRevived).toHaveBeenCalledTimes(1);
    expect(playerKnocked).toBe(false);
    expect(partner.isReviving).toBe(false);
    expect(partner.state).toBe('rotating');
    expect(reviveVfx.length).toBeGreaterThanOrEqual(2);
    duoMgr.dispose();

    // 2. Enemy squadmate revives knocked partner when safe, but interrupts when close LOS threat appears
    let enemyTargets: BotCombatTarget[] = [];
    const squadCtx = makeMockContext({
      gameMode: 'duos',
      getCombatTargets: () => enemyTargets,
    });
    const squadMgr = new BotManager(squadCtx, 'sweaty', 2222, 'duos');
    squadMgr.spawnBots(2, 20, 'duos');
    const [e1, e2] = squadMgr.getBots().filter((b) => !b.isDuoPartner);
    e1.state = 'rotating';
    e1.grounded = true;
    e1.position = { x: 0, y: 10, z: 0 };
    e2.state = 'rotating';
    e2.grounded = true;
    e2.position = { x: 2.0, y: 10, z: 0 };
    e2.inventory.items[1] = makeItem('ar', 'rare', 30);
    e2.inventory.ammo.medium = 60;

    squadMgr.damageBot(e1.id, 200, 'player', 'Player', 5);
    expect(e1.isKnocked).toBe(true);

    // Unsafe threat at 9m -> e2 fights instead of reviving
    enemyTargets = [
      {
        id: 'player',
        name: 'Player',
        position: { x: 0, y: 10, z: 9 },
        eyePos: { x: 0, y: 11.6, z: 9 },
        hp: 100,
        shield: 50,
        alive: true,
        isPlayer: true,
      },
    ];
    for (let i = 0; i < 6; i++) {
      squadMgr.update(0.1, 6 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 0, y: 10, z: 9 });
    }
    expect(e2.isReviving).toBe(false);
    expect(e1.isKnocked).toBe(true);

    // Threat cleared -> e2 safely channels 4.0s revive and restores e1
    enemyTargets = [];
    for (let i = 0; i < Math.ceil(REVIVE_DURATION_SEC / 0.1) + 5 && e1.isKnocked; i++) {
      squadMgr.update(0.1, 7 + i * 0.1, { x: 0, y: 175, z: 0 }, { x: 200, y: 10, z: 200 });
    }
    expect(e1.isKnocked).toBe(false);
    expect(e1.state).toBe('rotating');
    expect(e1.hp).toBe(30);
    expect(e2.isReviving).toBe(false);

    squadMgr.dispose();
  });

  it('assigns Boss Medallions & Victory Crowns, exposes getMedallionHolders/consumeDroppedRewards, and boosts Medallion aggro priority', () => {
    const ctx = makeMockContext();
    const manager = new BotManager(ctx, 'standard', 7373, 'solo');
    manager.spawnBots(12, 20);

    // Verify all 3 Boss Medallions match Config.ts MEDALLIONS POI assignments
    const bosses = manager.getBots().filter((b) => b.isBoss);
    expect(bosses).toHaveLength(3);
    for (const med of MEDALLIONS) {
      const boss = bosses.find((b) => b.bossPoiId === med.bossPoiId)!;
      expect(boss).toBeDefined();
      expect(boss.medallions).toEqual([med.id]);
      expect(boss.medallionCount).toBe(1);
    }

    // Verify 2 top-tier bots carry Victory Crowns
    const crownedBots = manager.getBots().filter((b) => b.hasVictoryCrown);
    expect(crownedBots).toHaveLength(2);

    // Verify getMedallionHolders() reports all 3 active holders with 65m single-medallion circle radius
    const holders = manager.getMedallionHolders();
    expect(holders).toHaveLength(3);
    for (const h of holders) {
      expect(h.count).toBe(1);
      expect(h.circleRadius).toBe(MEDALLION_CIRCLE_RADII[0]);
    }

    // Render states and summaries expose crown & medallion counts
    const renderById = new Map(manager.getRenderStates().map((r) => [r.id, r]));
    expect(renderById.get(bosses[0].id)?.medallionCount).toBe(1);
    expect(renderById.get(crownedBots[0].id)?.hasVictoryCrown).toBe(true);

    // Eliminating a Boss and a Crowned bot queues dropped rewards once and drains on consume
    expect(manager.damageBot(bosses[0].id, 400, 'player', 'Player', 20)).toBe(true);
    expect(manager.damageBot(crownedBots[0].id, 200, 'player', 'Player', 21)).toBe(true);

    const dropped = manager.consumeDroppedRewards();
    expect(dropped.medallions).toHaveLength(1);
    expect(dropped.medallions[0].medallionId).toBe(
      MEDALLIONS.find((m) => m.bossPoiId === bosses[0].bossPoiId)!.id,
    );
    expect(dropped.crowns).toHaveLength(1);
    expect(dropped.crowns[0].botId).toBe(crownedBots[0].id);

    // Second consume drains cleanly & eliminated boss leaves getMedallionHolders()
    expect(manager.consumeDroppedRewards()).toEqual({ medallions: [], crowns: [] });
    expect(manager.getMedallionHolders()).toHaveLength(2);

    manager.dispose();

    // Medallion holder aggro priority boost in BotBrain
    const normalTarget: BotCombatTarget = {
      id: 'closer_enemy',
      name: 'Closer',
      position: { x: 0, y: 10, z: 16 },
      eyePos: { x: 0, y: 11.6, z: 16 },
      hp: 100,
      shield: 50,
      alive: true,
    };
    const medallionTarget: BotCombatTarget = {
      id: 'medallion_enemy',
      name: 'MedallionHolder',
      position: { x: 0, y: 10, z: 32 },
      eyePos: { x: 0, y: 11.6, z: 32 },
      hp: 100,
      shield: 50,
      alive: true,
      medallions: ['medallion_combat'],
      medallionCount: 1,
    };
    const aggroCtx = makeMockContext({
      getCombatTargets: () => [normalTarget, medallionTarget],
    });
    const hunter = makeBotEntity({
      state: 'rotating',
      position: { x: 0, y: 10, z: 0 },
      yaw: 0,
      grounded: true,
      reactionTimer: 0,
    });
    hunter.inventory.items[1] = makeItem('ar', 'rare', 30);
    hunter.inventory.ammo.medium = 60;

    updateBot(hunter, aggroCtx, 'sweaty', { x: 0, y: 175, z: 0 }, 10, 0.05, false);
    expect(hunter.targetEnemyId).toBe('medallion_enemy');
  });

  it('scores Wave 6 combat_smg and boom_bow cleanly in selectBestWeaponForRange', () => {
    const brain = new BotBrain();
    const fullAmmo = { light: 90, medium: 90, shells: 20, heavy: 16, rockets: 0 };

    // combat_smg outscores regular smg at CQC/close-mid range
    const smgVsCombat: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('smg', 'rare', 30),
      makeItem('combat_smg', 'rare', 30),
    ];
    expect(selectBestWeaponForRange(smgVsCombat, 14, fullAmmo)?.item.weaponId).toBe(
      'combat_smg',
    );
    expect(brain.selectBestWeaponForRange(smgVsCombat, 14, fullAmmo)?.item.weaponId).toBe(
      'combat_smg',
    );

    // boom_bow scores well at mid-long range (55m) and yields to combat_smg at close range (8m)
    const bowLoadout: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('combat_smg', 'rare', 30),
      makeItem('boom_bow', 'epic', 1),
    ];
    expect(selectBestWeaponForRange(bowLoadout, 8, fullAmmo)?.item.weaponId).toBe(
      'combat_smg',
    );
    expect(selectBestWeaponForRange(bowLoadout, 55, fullAmmo)?.item.weaponId).toBe(
      'boom_bow',
    );

    // Skips empty boom_bow when heavy ammo is exhausted
    const noHeavy = { ...fullAmmo, heavy: 0 };
    const emptyBowLoadout: (ItemInstance | null)[] = [
      makeItem('pickaxe', 'common', 0),
      makeItem('combat_smg', 'rare', 30),
      makeItem('boom_bow', 'legendary', 0),
    ];
    expect(selectBestWeaponForRange(emptyBowLoadout, 55, noHeavy)?.item.weaponId).toBe(
      'combat_smg',
    );
  });
});
