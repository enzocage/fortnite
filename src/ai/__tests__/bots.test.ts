import { describe, expect, it, vi } from 'vitest';
import type {
  ChestEntity,
  DamageEvent,
  HarvestableProp,
  ItemInstance,
  LootDrop,
  StormState,
  TerrainQuery,
  Vec3Like,
} from '../../types';
import {
  BUILD_COST,
  EventBus,
  GLIDER_FORCE_HEIGHT,
  GLIDERS,
  PICKAXES,
  POIS,
  SKINS,
} from '../../core';
import {
  BOT_NAMES,
  BotManager,
  DIFFICULTY_PROFILES,
  computeBotSpread,
  pickBotLoadoutCosmetics,
  selectBestWeaponForDistance,
  selectHealingItem,
  shouldBotBuildDefense,
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
  placedBuilds: Array<{ ownerId: string; type: string; material: string }>;
  firedCalls: Array<{ botId: string; weaponId: string; spreadRad: number }>;
  droppedBots: string[];
} {
  const terrain = overrides.terrain ?? makeMockTerrain(10);
  const placedBuilds: Array<{ ownerId: string; type: string; material: string }> = [];
  const firedCalls: Array<{ botId: string; weaponId: string; spreadRad: number }> = [];
  const droppedBots: string[] = [];

  const ctx: BotWorldContext & {
    placedBuilds: Array<{ ownerId: string; type: string; material: string }>;
    firedCalls: Array<{ botId: string; weaponId: string; spreadRad: number }>;
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
    placeBuildPiece: (ownerId, type, material) => {
      placedBuilds.push({ ownerId, type, material });
      return true;
    },
    fireWeapon: (bot, item, _origin, _aimDir, spreadRad) => {
      firedCalls.push({ botId: bot.id, weaponId: item.weaponId, spreadRad });
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
