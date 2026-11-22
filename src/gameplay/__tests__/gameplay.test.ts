import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type {
  ApexTrainState,
  AugmentId,
  BiomeType,
  CampfireEntity,
  CapturePointEntity,
  ChestEntity,
  ColliderBox,
  DamageEvent,
  DroppedCrownEntity,
  DroppedMedallionEntity,
  ExplosiveBarrelEntity,
  ForecastTowerEntity,
  GrindRailEntity,
  HarvestableProp,
  ItemInstance,
  LaunchPadEntity,
  LootDrop,
  LootIslandState,
  LootLlamaEntity,
  MatchQuest,
  MedallionId,
  MeteorCraterEntity,
  ModBenchEntity,
  NpcSpecialistEntity,
  POIDef,
  Rarity,
  RebootVanEntity,
  RiftEntity,
  SlurpBarrelEntity,
  SlurpTankerEntity,
  SoundEventId,
  StealthBushEntity,
  SupplyDroneEntity,
  SupplyDrop,
  TeamId,
  TerrainQuery,
  TrapKind,
  UpgradeBenchEntity,
  VaultEntity,
  Vec3Like,
  VehicleEntity,
  VendingMachineEntity,
  WeaponBunkerEntity,
  WeaponModId,
  ZiplineEntity,
} from '../../types';
import {
  AUGMENTS,
  BOUNCER_IMPULSE_FWD,
  BOUNCER_IMPULSE_Y,
  DBNO_BLEED_DPS,
  DBNO_MAX_HP,
  DEFAULT_SETTINGS,
  EventBus,
  GLIDER_FORCE_HEIGHT,
  GRID_XZ,
  GRID_Y,
  GRIND_RAIL_SPEED,
  JETPACK_BURN_RATE,
  JETPACK_MAX_FUEL,
  JETPACK_RECHARGE_RATE,
  LOW_GRAVITY_DURATION_SEC,
  LOW_GRAVITY_SCALE,
  MAX_GOLD_BARS,
  MAX_MATS,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  RARITY_MULTIPLIER,
  REBOOT_DURATION_SEC,
  REVIVE_DURATION_SEC,
  SPIKE_TRAP_DAMAGE,
  STARTING_GOLD_BARS,
  TEAM_RUMBLE_RESPAWN_SEC,
  TEAM_RUMBLE_TARGET_SCORE,
  TRAIN_HACK_DURATION_SEC,
  UPGRADE_COSTS,
  WEAPONS,
  WEAPON_MODS,
  WEAPON_MOD_COST_GOLD,
  dist3D,
} from '../../core';
import { VOLCANO_CENTER_X, VOLCANO_CENTER_Z } from '../../world';
import {
  AUGMENT_INTERVAL_BLITZ,
  AUGMENT_INTERVAL_DEFAULT,
  AugmentManager,
  BuildingSystem,
  CollisionSystem,
  InventorySystem,
  MAX_ACTIVE_AUGMENTS,
  PlayerController,
  QuestTracker,
  ROOF_HEIGHT,
  WEAPON_SOUND_MAP,
  WeaponSystem,
  classifyEditMask,
  computeWeaponDamage,
  getItemMagCapacity,
  getRampHeightAtLocal,
  getRoofHeightAtLocal,
  getWeaponModEffects,
  resolveWeaponMods,
  type CombatActor,
  type DuoRebootBridge,
  type DuoReviveBridge,
  type PropsInteractionBridge,
  type SupplyDroneDamageResult,
  type VaultBridge,
  type VehicleBridge,
  type WorldChapterBridge,
  type WorldEconomyBridge,
  type WorldFrontierBridge,
  type WorldOverdriveBridge,
  type WorldRiftCaptureBridge,
  type WorldSkyforgeBridge,
  type WorldStationBridge,
} from '../index';

function createFlatTerrain(
  heightFn: (x: number, z: number) => number = () => 0,
  opts?: {
    normalFn?: (x: number, z: number) => Vec3Like;
    isWaterFn?: (x: number, z: number) => boolean;
    biomeFn?: (x: number, z: number) => BiomeType;
  },
): TerrainQuery {
  return {
    getHeightAt: heightFn,
    getNormalAt: opts?.normalFn ?? (() => ({ x: 0, y: 1, z: 0 })),
    isWater: opts?.isWaterFn ?? (() => false),
    getBiomeAt: opts?.biomeFn ?? ((): BiomeType => 'grassland'),
    getPOIs: (): POIDef[] => [],
    getMapTextureCanvas: () => ({} as HTMLCanvasElement),
  };
}

function createMockPropsBridge(): PropsInteractionBridge & {
  props: HarvestableProp[];
  chests: ChestEntity[];
  drops: LootDrop[];
  supplyDrops: SupplyDrop[];
  llamas: LootLlamaEntity[];
} {
  const props: HarvestableProp[] = [];
  const chests: ChestEntity[] = [];
  const drops: LootDrop[] = [];
  const supplyDrops: SupplyDrop[] = [];
  const llamas: LootLlamaEntity[] = [];
  let seq = 1;

  return {
    props,
    chests,
    drops,
    supplyDrops,
    llamas,
    getProps: () => props,
    getChests: () => chests,
    getLootDrops: () => drops,
    getSupplyDrops: () => supplyDrops,
    getLlamas: () => llamas,
    damageLlama: (id, dmg) => {
      const l = llamas.find((item) => item.id === id);
      if (!l || l.opened) return false;
      l.hp = Math.max(0, l.hp - dmg);
      if (l.hp <= 0) l.opened = true;
      return true;
    },
    openLlama: (id) => {
      const l = llamas.find((item) => item.id === id);
      if (!l || l.opened) return false;
      l.opened = true;
      return true;
    },
    damageProp: (propId, amount, _hitPoint, isPickaxe) => {
      const p = props.find((item) => item.id === propId);
      if (!p || p.destroyed) {
        return {
          hit: false,
          destroyed: false,
          isCrit: false,
          matType: 'wood',
          yieldAmount: 0,
        };
      }
      p.hp = Math.max(0, p.hp - amount);
      if (p.hp <= 0) p.destroyed = true;
      return {
        hit: true,
        destroyed: p.destroyed,
        isCrit: isPickaxe,
        matType: p.material,
        yieldAmount: isPickaxe ? Math.round(p.matYield * 0.4) : 0,
      };
    },
    openChest: (id) => {
      const c = chests.find((item) => item.id === id);
      if (!c || c.opened) return false;
      c.opened = true;
      return true;
    },
    openSupplyDrop: (id) => {
      const s = supplyDrops.find((item) => item.id === id);
      if (!s || s.state !== 'landed') return false;
      s.state = 'opened';
      return true;
    },
    removeLootDrop: (id) => {
      const idx = drops.findIndex((d) => d.id === id);
      if (idx === -1) return null;
      const [removed] = drops.splice(idx, 1);
      return removed;
    },
    spawnLootDrop: (pos, payload, scatterVel) => {
      const drop: LootDrop = {
        id: `drop_${seq++}`,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: scatterVel?.x ?? 0,
        vy: scatterVel?.y ?? 0,
        vz: scatterVel?.z ?? 0,
        item: payload.item,
        ammo: payload.ammo,
        materials: payload.materials,
        settled: true,
        age: 0,
      };
      drops.push(drop);
      return drop;
    },
  };
}

describe('CollisionSystem', () => {
  it('computes ramp heights accurately across all 4 rotations', () => {
    // rotation 0: ascends toward North (-Z)
    expect(getRampHeightAtLocal(2, GRID_XZ, 0)).toBeCloseTo(0);
    expect(getRampHeightAtLocal(2, 0, 0)).toBeCloseTo(GRID_Y);
    expect(getRampHeightAtLocal(2, GRID_XZ / 2, 0)).toBeCloseTo(GRID_Y / 2);

    // rotation 1: ascends toward East (+X)
    expect(getRampHeightAtLocal(0, 2, 1)).toBeCloseTo(0);
    expect(getRampHeightAtLocal(GRID_XZ, 2, 1)).toBeCloseTo(GRID_Y);

    // rotation 2: ascends toward South (+Z)
    expect(getRampHeightAtLocal(2, 0, 2)).toBeCloseTo(0);
    expect(getRampHeightAtLocal(2, GRID_XZ, 2)).toBeCloseTo(GRID_Y);

    // rotation 3: ascends toward West (-X)
    expect(getRampHeightAtLocal(GRID_XZ, 2, 3)).toBeCloseTo(0);
    expect(getRampHeightAtLocal(0, 2, 3)).toBeCloseTo(GRID_Y);
  });

  it('computes pyramid roof height accurately', () => {
    expect(getRoofHeightAtLocal(0, 0)).toBeCloseTo(0);
    expect(getRoofHeightAtLocal(GRID_XZ, GRID_XZ / 2)).toBeCloseTo(0);
    expect(getRoofHeightAtLocal(GRID_XZ / 2, GRID_XZ / 2)).toBeCloseTo(ROOF_HEIGHT);
    expect(getRoofHeightAtLocal(GRID_XZ / 4, GRID_XZ / 2)).toBeCloseTo(ROOF_HEIGHT * 0.5);
  });

  it('supports stair step-up, wall sliding, sloped ramps, and edited door pass-through', () => {
    const terrain = createFlatTerrain(() => 0);
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());

    // Step box (0.45m <= STEP_HEIGHT) and tall wall box (3m)
    collision.setStaticColliders([
      { id: 'step', minX: 2, minY: 0, minZ: -1, maxX: 4, maxY: 0.45, maxZ: 1, material: 'brick' },
      { id: 'wall', minX: -5, minY: 0, minZ: 4, maxX: 5, maxY: 3, maxZ: 5, material: 'brick' },
    ]);

    // Step-up test
    let pos: Vec3Like = { x: 1.5, y: 0, z: 0 };
    const stepRes = collision.resolveCharacterMovement(
      pos,
      { x: 6, y: 0, z: 0 },
      PLAYER_RADIUS,
      PLAYER_HEIGHT,
      0.1,
    );
    expect(stepRes.position.y).toBeCloseTo(0.45);
    expect(stepRes.grounded).toBe(true);

    // Wall sliding test
    pos = { x: 0, y: 0, z: 3.55 };
    const slideRes = collision.resolveCharacterMovement(
      pos,
      { x: 5, y: 0, z: 5 },
      PLAYER_RADIUS,
      PLAYER_HEIGHT,
      0.1,
    );
    expect(slideRes.position.z).toBeLessThanOrEqual(4 - PLAYER_RADIUS + 0.01);
    expect(slideRes.position.x).toBeGreaterThan(0.3);

    // Ramp climbing test
    building.placePieceForEntity('player', 'ramp', 'wood', 2, 0, 2, 'N', 1); // x in [8, 12], ascends +X
    let rampPos: Vec3Like = { x: 8.2, y: 0.16, z: 10 };
    for (let i = 0; i < 20; i++) {
      const r = collision.resolveCharacterMovement(
        rampPos,
        { x: 4.5, y: -1, z: 0 },
        PLAYER_RADIUS,
        PLAYER_HEIGHT,
        0.03,
      );
      rampPos = r.position;
    }
    expect(rampPos.x).toBeGreaterThan(10.0);
    expect(rampPos.y).toBeGreaterThan(1.4);

    // Edited door pass-through test
    const wallPiece = building.placePieceForEntity('player', 'wall', 'wood', 0, 0, -2, 'N', 0)!;
    // Wall sits at z = -8, x in [0, 4]. Door is tiles {4, 7} -> x in [1.333, 2.667]
    building.beginEdit(wallPiece.id);
    building.toggleEditTile(4);
    building.toggleEditTile(7);
    const editRes = building.confirmEdit();
    expect(editRes.success).toBe(true);
    expect(editRes.variant).toBe('door');

    let doorPos: Vec3Like = { x: 2.0, y: 0, z: -7.2 };
    for (let i = 0; i < 15; i++) {
      const r = collision.resolveCharacterMovement(
        doorPos,
        { x: 0, y: 0, z: -5.0 },
        PLAYER_RADIUS,
        PLAYER_HEIGHT,
        0.04,
      );
      doorPos = r.position;
    }
    expect(doorPos.z).toBeLessThan(-8.5); // Walked cleanly through the door!
  });

  it('raycasts static boxes, terrain, ramps, props, and passes through edited windows', () => {
    const terrain = createFlatTerrain(() => 0);
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());

    const wall = building.placePieceForEntity('player', 'wall', 'brick', 0, 0, 0, 'N', 0)!;
    // Wall at z = 0, x in [0, 4], y in [0, 3.2]. Cut center window (tile 4: x in [1.33, 2.67], y in [1.067, 2.133])
    building.beginEdit(wall.id);
    building.toggleEditTile(4);
    const editRes = building.confirmEdit();
    expect(editRes.variant).toBe('window');

    // Ray through window passes through
    const passHit = collision.raycastWorld(
      { x: 2.0, y: 1.6, z: 3.0 },
      { x: 0, y: 0, z: -1 },
      20,
    );
    expect(passHit.hit).toBe(false);

    // Ray at left wall column hits build
    const wallHit = collision.raycastWorld(
      { x: 0.5, y: 1.6, z: 3.0 },
      { x: 0, y: 0, z: -1 },
      20,
    );
    expect(wallHit.hit).toBe(true);
    expect(wallHit.targetType).toBe('build');
    expect(wallHit.targetId).toBe(wall.id);
    expect(wallHit.material).toBe('brick');

    // Ray against terrain downward
    const terrainHit = collision.raycastWorld(
      { x: 10, y: 5, z: 10 },
      { x: 0, y: -1, z: 0 },
      20,
    );
    expect(terrainHit.hit).toBe(true);
    expect(terrainHit.targetType).toBe('terrain');
    expect(terrainHit.point.y).toBeCloseTo(0, 1);

    // Ray against prop
    const props: HarvestableProp[] = [
      {
        id: 'tree_1',
        kind: 'tree_pine',
        material: 'wood',
        x: 15,
        y: 0,
        z: 0,
        rotationY: 0,
        scale: 1,
        hp: 200,
        maxHp: 200,
        matYield: 35,
        radius: 0.8,
        height: 5,
        destroyed: false,
      },
    ];
    const propHit = collision.raycastWorld(
      { x: 10, y: 1.5, z: 0 },
      { x: 1, y: 0, z: 0 },
      20,
      { props },
    );
    expect(propHit.hit).toBe(true);
    expect(propHit.targetType).toBe('prop');
    expect(propHit.targetId).toBe('tree_1');
  });
});

describe('InventorySystem', () => {
  it('manages 6 slots, stacks consumables, clamps materials, reloads, and drops loot', () => {
    const inv = new InventorySystem();
    expect(inv.getSlot(0)?.weaponId).toBe('pickaxe');
    expect(inv.getActiveSlotIndex()).toBe(0);

    const ar: ItemInstance = {
      uid: 'ar_1',
      weaponId: 'ar',
      rarity: 'rare',
      magAmmo: 10,
      stackCount: 1,
    };
    const res1 = inv.addItem(ar);
    expect(res1.added).toBe(true);
    expect(res1.slotIndex).toBe(1);

    // Stackable consumables
    inv.addItem({ uid: 'm1', weaponId: 'mini_shield', rarity: 'uncommon', magAmmo: 0, stackCount: 4 });
    inv.addItem({ uid: 'm2', weaponId: 'mini_shield', rarity: 'uncommon', magAmmo: 0, stackCount: 4 });
    expect(inv.getSlot(2)?.stackCount).toBe(6); // maxStack = 6
    expect(inv.getSlot(3)?.stackCount).toBe(2); // overflow

    inv.setActiveSlot(3);
    expect(inv.consumeActiveItem()).toBe(true);
    expect(inv.getSlot(3)?.stackCount).toBe(1);
    expect(inv.consumeActiveItem()).toBe(true);
    expect(inv.getSlot(3)).toBeNull();

    // Reload from reserve
    inv.addAmmo('medium', 15);
    const loaded = inv.reloadSlot(1);
    expect(loaded).toBe(15);
    expect(inv.getSlot(1)?.magAmmo).toBe(25);
    expect(inv.getAmmo('medium')).toBe(0);

    // Materials capped at MAX_MATS (999)
    inv.addMaterial('wood', 1500);
    expect(inv.getMaterials().wood).toBe(MAX_MATS);
    expect(inv.spendMaterial('wood', 10)).toBe(true);
    expect(inv.getMaterials().wood).toBe(MAX_MATS - 10);
    expect(inv.spendMaterial('brick', 10)).toBe(false);

    // Drop all loot keeps pickaxe at slot 0
    const dropped = inv.dropAllLoot();
    expect(dropped.items.length).toBe(2);
    expect(dropped.materials.wood).toBe(MAX_MATS - 10);
    expect(inv.getSlot(0)?.weaponId).toBe('pickaxe');
    expect(inv.getSlot(1)).toBeNull();
  });
});

describe('BuildingSystem & classifyEditMask', () => {
  it('classifies valid and invalid 3x3 edit masks accurately', () => {
    expect(classifyEditMask('wall', 0)).toEqual({ valid: true, variant: 'full' });
    expect(classifyEditMask('wall', (1 << 4) | (1 << 7))).toEqual({ valid: true, variant: 'door' });
    expect(classifyEditMask('wall', 1 << 4)).toEqual({ valid: true, variant: 'window' });
    expect(classifyEditMask('wall', (1 << 3) | (1 << 5))).toEqual({
      valid: true,
      variant: 'double_window',
    });
    expect(classifyEditMask('wall', (1 << 0) | (1 << 1) | (1 << 2))).toEqual({
      valid: true,
      variant: 'half_wall',
    });
    expect(classifyEditMask('wall', (1 << 3) | (1 << 4) | (1 << 6) | (1 << 7))).toEqual({
      valid: true,
      variant: 'arch',
    });
    expect(classifyEditMask('wall', (1 << 0) | (1 << 1) | (1 << 3))).toEqual({
      valid: true,
      variant: 'corner',
    });

    // Invalid masks: empty, floating bottom removed, disconnected split
    expect(classifyEditMask('wall', 0b111111111).valid).toBe(false);
    expect(classifyEditMask('wall', (1 << 6) | (1 << 7) | (1 << 8)).valid).toBe(false);
    expect(classifyEditMask('wall', (1 << 1) | (1 << 4) | (1 << 7)).valid).toBe(false);

    expect(classifyEditMask('floor', 1 << 4)).toEqual({ valid: true, variant: 'hatch' });
    expect(classifyEditMask('floor', (1 << 0) | (1 << 1) | (1 << 2))).toEqual({
      valid: true,
      variant: 'half_floor',
    });
    expect(classifyEditMask('ramp', (1 << 0) | (1 << 3) | (1 << 6))).toEqual({
      valid: true,
      variant: 'half_ramp',
    });
    expect(classifyEditMask('roof', 1 << 4)).toEqual({ valid: true, variant: 'hatch' });
  });

  it('places, builds up HP over time, edits, damages, and disposes structures cleanly', () => {
    const scene = new THREE.Scene();
    const terrain = createFlatTerrain(() => 0);
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);

    const preview = building.computePreview(
      { x: 2, y: 1.6, z: 2 },
      { x: 0, y: 0, z: -1 },
      'wall',
      'wood',
      0,
      true,
    );
    expect(preview.valid).toBe(true);

    const piece = building.placePieceFromPreview(preview, 'player')!;
    expect(piece).not.toBeNull();
    expect(piece.hp).toBe(85); // wood startHp

    building.update(2.0, 2.0);
    expect(piece.hp).toBeGreaterThan(85);
    expect(piece.buildProgress).toBeGreaterThan(0.5);

    const dmgRes = building.damagePiece(piece.id, 300);
    expect(dmgRes.destroyed).toBe(true);
    expect(building.getPieceById(piece.id)).toBeUndefined();

    building.dispose();
  });
});

describe('WeaponSystem', () => {
  it('computes weapon damage with rarity, falloff, and headshot multipliers', () => {
    const closeBody = computeWeaponDamage('ar', 'common', 20, false);
    expect(closeBody).toBe(30);

    const legendHead = computeWeaponDamage('ar', 'legendary', 20, true);
    expect(legendHead).toBe(Math.round(30 * RARITY_MULTIPLIER.legendary * 1.5));

    const farBody = computeWeaponDamage('ar', 'common', 200, false);
    expect(farBody).toBe(Math.round(30 * WEAPONS.ar.minFalloffMult));
  });

  it('applies hitscan damage to shield then HP, triggers burst shots, projectiles, and pickaxe harvesting', () => {
    const terrain = createFlatTerrain(() => 0);
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    const propsBridge = createMockPropsBridge();
    collision.setBuildPiecesProvider(() => building.getPieces());

    const weapons = new WeaponSystem(collision, building, propsBridge, bus);

    const shooter: CombatActor = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 0, z: 0 },
      eyePos: { x: 0, y: 1.6, z: 0 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };

    const target: CombatActor = {
      id: 'bot_1',
      name: 'Bot1',
      position: { x: 0, y: 0, z: -15 },
      eyePos: { x: 0, y: 1.6, z: -15 },
      hp: 100,
      shield: 50,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };

    weapons.registerActorsProvider(() => [shooter, target]);

    const dmgEvents: DamageEvent[] = [];
    bus.on('combat:damage', (ev) => dmgEvents.push(ev));

    // Hitscan AR shot to torso
    const arItem: ItemInstance = {
      uid: 'ar',
      weaponId: 'ar',
      rarity: 'common',
      magAmmo: 30,
      stackCount: 1,
    };
    const hitRes = weapons.fireWeapon({
      actor: shooter,
      item: arItem,
      origin: { x: 0, y: 1.1, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(hitRes.fired).toBe(true);
    expect(hitRes.shotsHit).toBe(1);
    expect(hitRes.damageDealt).toBe(30);
    expect(target.shield).toBe(20);
    expect(target.hp).toBe(100);
    expect(dmgEvents.length).toBe(1);

    // Burst AR queues 2 follow-up shots
    const burstItem: ItemInstance = {
      uid: 'burst',
      weaponId: 'burst_ar',
      rarity: 'common',
      magAmmo: 30,
      stackCount: 1,
    };
    const burstRes = weapons.fireWeapon({
      actor: shooter,
      item: burstItem,
      origin: { x: 0, y: 1.1, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
      onAmmoConsumed: () => {
        burstItem.magAmmo -= 1;
      },
    });
    expect(burstRes.burstRemaining).toBe(2);
    weapons.update(0.05);
    weapons.update(0.05);
    weapons.update(0.05);
    weapons.update(0.05);
    expect(burstItem.magAmmo).toBe(27);

    // Sniper projectile hits target
    target.hp = 100;
    target.shield = 0;
    const sniperItem: ItemInstance = {
      uid: 'sniper',
      weaponId: 'sniper',
      rarity: 'rare',
      magAmmo: 1,
      stackCount: 1,
    };
    weapons.fireWeapon({
      actor: shooter,
      item: sniperItem,
      origin: { x: 0, y: 1.65, z: 0 },
      aimDir: { x: 0, y: 0.005, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(weapons.getProjectiles().length).toBe(1);
    for (let i = 0; i < 6; i++) {
      weapons.update(0.02);
    }
    expect(target.hp).toBeLessThan(100);

    // Pickaxe harvests nearby prop
    propsBridge.props.push({
      id: 'rock_1',
      kind: 'rock',
      material: 'brick',
      x: 0,
      y: 0,
      z: 2.0,
      rotationY: 0,
      scale: 1,
      hp: 150,
      maxHp: 150,
      matYield: 30,
      radius: 0.9,
      height: 2.0,
      destroyed: false,
    });
    const pickRes = weapons.fireWeapon({
      actor: shooter,
      item: { uid: 'pick', weaponId: 'pickaxe', rarity: 'common', magAmmo: 0, stackCount: 1 },
      origin: { x: 0, y: 1.2, z: 0 },
      aimDir: { x: 0, y: 0, z: 1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(pickRes.fired).toBe(true);
    expect(pickRes.harvested?.matType).toBe('brick');
    expect(pickRes.harvested?.amount).toBeGreaterThan(0);
  });
});

describe('PlayerController', () => {
  it('transitions bus -> skydiving -> gliding -> playing, builds, emotes, and handles elimination', () => {
    const terrain = createFlatTerrain(() => 0);
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);

    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    weapons.registerActorsProvider(() => [player.getCombatActor()]);

    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'Tester');
    expect(player.getPhase()).toBe('bus');

    expect(player.jumpFromBus()).toBe(true);
    expect(player.getPhase()).toBe('skydiving');

    // Simulate falling below GLIDER_FORCE_HEIGHT
    for (let i = 0; i < 160; i++) {
      player.update(0.05, i * 0.05);
      if (player.getPhase() === 'gliding') break;
    }
    expect(player.getPhase()).toBe('gliding');
    expect(player.getPosition().y).toBeLessThanOrEqual(GLIDER_FORCE_HEIGHT + 1);

    // Continue gliding to ground
    for (let i = 0; i < 250; i++) {
      player.update(0.05, i * 0.05);
      if (player.getPhase() === 'playing') break;
    }
    expect(player.getPhase()).toBe('playing');
    expect(player.getPosition().y).toBeCloseTo(0, 1);

    // Build mode & emote check
    player.toggleBuildMode(true);
    player.selectBuildPiece('ramp');
    expect(player.getCharacterRenderState().isBuilding).toBe(true);

    player.enterTestEmote('floss_wave');
    const emoteState = player.getCharacterRenderState();
    expect(emoteState.animState).toBe('emote');
    expect(emoteState.emoteId).toBe('floss_wave');

    // Damage & elimination drops loot
    player.getInventory().addMaterial('wood', 120);
    player.getInventory().addItem({
      uid: 'p1',
      weaponId: 'pump_shotgun',
      rarity: 'epic',
      magAmmo: 5,
      stackCount: 1,
    });
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot_1',
      attackerName: 'SweatyBot',
      weaponId: 'ar',
      rarity: 'rare',
      damage: 100,
      hpDamage: 100,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: true,
      hitPoint: { x: 10, y: 1, z: 0 },
      distance: 10,
    });
    expect(player.getPhase()).toBe('eliminated');
    expect(player.isAlive()).toBe(false);
    expect(propsBridge.drops.length).toBeGreaterThanOrEqual(2);
  });

  it('pulls TPS camera forward when backed up against a wall and respects edited floor hatches', () => {
    const terrain = createFlatTerrain(() => 0);
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);

    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );

    player.resetForMatch({ x: 0, y: 175, z: 0 });
    player.teleport({ x: 2, y: 0, z: 2 });

    // Place a solid wall right behind the player (at z = 4 -> gz = 1, N wall)
    building.placePieceForEntity('player', 'wall', 'metal', 0, 0, 1, 'N', 0);
    player.update(0.016, 0.016);
    // Camera faces -Z (yaw = PI), so camera wants to sit behind player at +Z (z > 4),
    // but wall at z = 4 must pull camera forward to < 4.0!
    expect(camera.position.z).toBeLessThan(4.0);

    // Edit grid hover index check on that wall
    const wall = building.getPieces()[0];
    building.beginEdit(wall.id);
    const centerIdx = building.getHoveredEditTileIndex(
      { x: 2, y: 1.6, z: 2 },
      { x: 0, y: 0, z: 1 },
    );
    expect(centerIdx).toBe(4);
    building.toggleEditTile(centerIdx);
    const res = building.confirmEdit();
    expect(res.success).toBe(true);
    expect(res.variant).toBe('window');
  });
});

describe('Additional Weapon & Inventory Edge Cases', () => {
  it('deals rocket splash damage to builds and actors and swaps full inventory slots cleanly', () => {
    const terrain = createFlatTerrain(() => 0);
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);

    const wall = building.placePieceForEntity('bot', 'wall', 'wood', 0, 0, -2, 'N', 0)!; // z = -8
    const shooter: CombatActor = {
      id: 'player',
      name: 'Player',
      position: { x: 2, y: 0, z: 0 },
      eyePos: { x: 2, y: 1.6, z: 0 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const botBehindWall: CombatActor = {
      id: 'bot',
      name: 'Bot',
      position: { x: 2, y: 0, z: -9.5 },
      eyePos: { x: 2, y: 1.6, z: -9.5 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [shooter, botBehindWall]);

    const rpg: ItemInstance = {
      uid: 'rpg',
      weaponId: 'rocket_launcher',
      rarity: 'legendary',
      magAmmo: 1,
      stackCount: 1,
    };
    weapons.fireWeapon({
      actor: shooter,
      item: rpg,
      origin: { x: 2, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    for (let i = 0; i < 15; i++) {
      weapons.update(0.03);
    }
    expect(building.getPieceById(wall.id)).toBeUndefined(); // 320*1.3 splash destroys wood wall
    expect(botBehindWall.hp).toBeLessThan(100); // Splash hits nearby actor

    // Full inventory swap test
    const inv = new InventorySystem();
    for (let i = 1; i <= 5; i++) {
      inv.addItem({
        uid: `w_${i}`,
        weaponId: 'pistol',
        rarity: 'common',
        magAmmo: 16,
        stackCount: 1,
      });
    }
    inv.setActiveSlot(0); // Holding pickaxe -> should not swap
    const blockedSwap = inv.addItem({
      uid: 'sniper_new',
      weaponId: 'sniper',
      rarity: 'legendary',
      magAmmo: 1,
      stackCount: 1,
    });
    expect(blockedSwap.added).toBe(false);

    inv.setActiveSlot(2); // Holding slot 2 -> should swap out pistol
    const swapped = inv.addItem({
      uid: 'sniper_new',
      weaponId: 'sniper',
      rarity: 'legendary',
      magAmmo: 1,
      stackCount: 1,
    });
    expect(swapped.added).toBe(true);
    expect(swapped.slotIndex).toBe(2);
    expect(swapped.swappedOut?.uid).toBe('w_2');
    expect(inv.getSlot(2)?.weaponId).toBe('sniper');

    // Throwables stack up to maxStack (6) and consumeActiveItem decrements stack
    const throwInv = new InventorySystem();
    throwInv.addItem({ uid: 'f1', weaponId: 'frag_grenade', rarity: 'rare', magAmmo: 0, stackCount: 4 });
    throwInv.addItem({ uid: 'f2', weaponId: 'frag_grenade', rarity: 'rare', magAmmo: 0, stackCount: 3 });
    expect(throwInv.getSlot(1)?.stackCount).toBe(6);
    expect(throwInv.getSlot(2)?.stackCount).toBe(1);
    throwInv.setActiveSlot(2);
    expect(throwInv.consumeActiveItem()).toBe(true);
    expect(throwInv.getSlot(2)).toBeNull();
  });
});

describe('Wave 1 Gameplay Mechanics', () => {
  function setupPlayerHarness(terrain: TerrainQuery = createFlatTerrain(() => 0)) {
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'Tester');
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  it('triggers 0.9s tactical slide on sprint+C with downhill boost, VFX/SFX, leanAngle, and Space jump-cancel', () => {
    const slopeTerrain = createFlatTerrain(
      (x, z) => (x > 100 ? -z * 0.45 : 0),
      {
        normalFn: (x) => {
          if (x > 100) {
            const len = Math.hypot(0.45, 1);
            return { x: 0, y: 1 / len, z: 0.45 / len };
          }
          return { x: 0, y: 1, z: 0 };
        },
        biomeFn: () => 'snow',
      },
    );
    const { bus, player } = setupPlayerHarness(slopeTerrain);

    const slideDustEvents: Array<{ biome: BiomeType }> = [];
    const sounds: SoundEventId[] = [];
    bus.on('vfx:slide_dust', (ev) => slideDustEvents.push({ biome: ev.biome }));
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    player.teleport({ x: 0, y: 0, z: 0 });
    player.setLook(Math.PI, 0); // Facing -Z
    player.pressKey('ShiftLeft');
    player.pressKey('KeyW');
    for (let i = 0; i < 6; i++) player.update(0.03, (i + 1) * 0.03);

    player.pressKey('KeyC');
    const slideRender = player.getCharacterRenderState();
    const slideSnap = player.getHudSnapshot();
    expect(slideRender.animState).toBe('slide');
    expect(slideRender.isSliding).toBe(true);
    expect(slideSnap.isSliding).toBe(true);
    expect(slideSnap.showSpeedLines).toBe(true);
    expect(player.getEyePosition().y).toBeCloseTo(PLAYER_CROUCH_HEIGHT - 0.16, 2);
    expect(slideDustEvents.some((e) => e.biome === 'snow')).toBe(true);
    expect(sounds).toContain('slide_loop');

    // Strafe while moving produces non-zero smooth leanAngle
    player.pressKey('KeyD');
    for (let i = 0; i < 5; i++) player.update(0.03, 0.2 + i * 0.03);
    expect(Math.abs(player.getCharacterRenderState().leanAngle ?? 0)).toBeGreaterThan(0.01);
    expect(Math.abs(player.getHudSnapshot().leanAngle)).toBeGreaterThan(0.01);
    player.releaseKey('KeyD');

    // Flat slide completes after 0.9s
    for (let i = 0; i < 30; i++) player.update(0.035, 0.4 + i * 0.035);
    expect(player.getHudSnapshot().isSliding).toBe(false);

    // Downhill slide travels faster/farther than flat slide & Space jump-cancels
    player.releaseKey('ShiftLeft');
    player.releaseKey('KeyW');
    player.teleport({ x: 150, y: 0, z: 0 });
    player.setLook(0, 0); // Facing +Z (downhill where normal.z > 0)
    player.pressKey('ShiftLeft');
    player.pressKey('KeyW');
    for (let i = 0; i < 6; i++) player.update(0.03, 2.0 + i * 0.03);
    player.pressKey('ControlLeft');
    expect(player.getHudSnapshot().isSliding).toBe(true);
    const zBefore = player.getPosition().z;
    for (let i = 0; i < 12; i++) player.update(0.03, 2.2 + i * 0.03);
    const zAfter = player.getPosition().z;
    expect(zAfter - zBefore).toBeGreaterThan(4.8);

    // Jump-cancel burst with Space ends slide and boosts upward
    player.pressKey('Space');
    expect(player.getHudSnapshot().isSliding).toBe(false);
    expect(player.getCharacterRenderState().velocityY ?? 0).toBeGreaterThan(7.5);
  });

  it('mantles waist/chest-high ledges (1.1m..2.35m) on Space and respects headroom', () => {
    const { collision, bus, player } = setupPlayerHarness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    // Ledge 1.8m high ahead at z in [-2, 0]
    collision.setStaticColliders([
      { id: 'ledge_1', minX: -2, minY: 0, minZ: -2, maxX: 2, maxY: 1.8, maxZ: 0, material: 'brick' },
    ]);

    player.teleport({ x: 0, y: 0, z: 0.75 });
    player.setLook(Math.PI, 0); // Facing -Z toward ledge
    player.pressKey('Space');

    expect(sounds).toContain('mantle_climb');
    expect(player.getCharacterRenderState().animState).toBe('mantle');

    // Step through 0.28s mantle climb
    for (let i = 0; i < 10; i++) {
      player.update(0.03, (i + 1) * 0.03);
    }
    expect(player.getPosition().y).toBeCloseTo(1.8, 1);
    expect(player.getPosition().z).toBeLessThanOrEqual(0.01);
    expect(player.getCharacterRenderState().animState).not.toBe('mantle');

    // Low ceiling blocks mantle
    collision.setStaticColliders([
      { id: 'ledge_low_ceil', minX: 8, minY: 0, minZ: -2, maxX: 12, maxY: 1.8, maxZ: 0, material: 'brick' },
      { id: 'ceiling_block', minX: 8, minY: 2.5, minZ: -2, maxX: 12, maxY: 2.9, maxZ: 2, material: 'brick' },
    ]);
    player.teleport({ x: 10, y: 0, z: 0.75 });
    player.setLook(Math.PI, 0);
    expect(player.tryMantle()).toBe(false);
  });

  it('applies proportional HP fall damage >13m and honors water, launch pad, and shockwave fall immunity', () => {
    const { bus, player } = setupPlayerHarness();
    const sounds: SoundEventId[] = [];
    const shakes: number[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:camera_shake', (ev) => shakes.push(ev.intensity));

    // Give 50 shield to confirm fall damage hits HP directly (bypassing shield)
    player.teleport({ x: 0, y: 20, z: 0 });
    player.applySplashHeal(50);
    expect(player.getHealth()).toBe(100);
    expect(player.getShield()).toBe(50);

    for (let i = 0; i < 60; i++) {
      player.update(0.04, (i + 1) * 0.04);
    }
    expect(player.getPosition().y).toBeCloseTo(0, 1);
    expect(player.getHealth()).toBeCloseTo(65, 0); // (20 - 13) * 5 = 35
    expect(player.getShield()).toBe(50);
    expect(sounds).toContain('fall_damage');
    expect(shakes.length).toBeGreaterThan(0);

    // Shockwave launch immunity prevents fall damage from high fall
    player.teleport({ x: 0, y: 22, z: 0 });
    const hpBeforeShockFall = player.getHealth();
    player.applyExternalImpulse({ x: 2, y: 6, z: 0 }, true);
    expect(player.isFallImmune()).toBe(true);
    for (let i = 0; i < 80; i++) {
      player.update(0.04, 3.0 + i * 0.04);
    }
    expect(player.getPosition().y).toBeCloseTo(0, 1);
    expect(player.getHealth()).toBe(hpBeforeShockFall);
    expect(player.isFallImmune()).toBe(false);

    // Launch pad sets fallImmune & glides safely
    const pads: LaunchPadEntity[] = [
      { id: 'pad_1', kind: 'launch_pad', x: 10, y: 0, z: 10, radius: 2.5, boostVy: 25, boostForward: 12 },
    ];
    player.setTraversalBridge({
      getLaunchPads: () => pads,
      getZiplines: () => [] as ZiplineEntity[],
    });
    player.teleport({ x: 10, y: 0, z: 10 });
    player.update(0.03, 6.5);
    expect(player.getPhase()).toBe('gliding');
    expect(player.isFallImmune()).toBe(true);

    // Water landing prevents fall damage and activates swimming
    const waterTerrain = createFlatTerrain(() => -2.0, { isWaterFn: () => true });
    const waterHarness = setupPlayerHarness(waterTerrain);
    waterHarness.player.teleport({ x: 0, y: 25, z: 0 });
    for (let i = 0; i < 80; i++) {
      waterHarness.player.update(0.04, i * 0.04);
    }
    expect(waterHarness.player.getHealth()).toBe(100);
    expect(waterHarness.player.getHudSnapshot().isSwimming).toBe(true);
    expect(waterHarness.player.getCharacterRenderState().animState).toBe('swim');
  });

  it('triggers molten lava hazard bounce (vy=14) and 10 burn damage at VOLCANO_CENTER_X/Z', () => {
    const { bus, player } = setupPlayerHarness();
    const sounds: SoundEventId[] = [];
    const shakes: number[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:camera_shake', (ev) => shakes.push(ev.intensity));

    player.teleport({ x: VOLCANO_CENTER_X, y: 0.5, z: VOLCANO_CENTER_Z });
    player.update(0.016, 0.016);

    expect(player.getHealth()).toBe(90);
    expect(player.getCharacterRenderState().velocityY ?? 0).toBeGreaterThan(12);
    expect(sounds).toContain('lava_burn');
    expect(shakes.length).toBeGreaterThan(0);
  });

  it('supports turbo building every 0.09s across cells and F-key proportional repair', () => {
    const { bus, building, player } = setupPlayerHarness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    player.getInventory().addMaterial('wood', 200);
    player.teleport({ x: 2, y: 0, z: 2 });
    player.setLook(Math.PI, 0);
    player.selectBuildPiece('wall');

    // Hold LMB while turning yaw across grid directions
    player.setMouseButton(0, true);
    player.update(0.02, 0.02);
    expect(building.getPieces().length).toBe(1);

    // Rotate 90 degrees & hold for 0.1s -> turbo builds next piece
    player.setLook(Math.PI * 0.5, 0);
    player.update(0.05, 0.07);
    player.update(0.05, 0.12);
    expect(building.getPieces().length).toBe(2);

    // Rotate another 90 degrees & hold for 0.1s -> places 3rd piece
    player.setLook(0, 0);
    player.update(0.05, 0.17);
    player.update(0.05, 0.22);
    expect(building.getPieces().length).toBe(3);
    player.setMouseButton(0, false);

    // Build repair test: place wood wall ahead, complete build, damage it, verify canRepairBuild & KeyF repair
    building.clearAll();
    player.toggleBuildMode(false);
    player.teleport({ x: 2, y: 0, z: 2 });
    player.setLook(Math.PI, 0); // Looking -Z toward z=0
    const wall = building.placePieceForEntity('player', 'wall', 'wood', 0, 0, 0, 'N', 0)!;
    building.update(4.0, 4.0); // maxHp = 150
    building.damagePiece(wall.id, 75); // 50% missing -> cost = 5 wood

    player.update(0.016, 4.016);
    expect(player.getHudSnapshot().canRepairBuild).toBe(true);

    const woodBefore = player.getInventory().getMaterials().wood;
    player.pressKey('KeyF');
    expect(wall.hp).toBe(150);
    expect(player.getInventory().getMaterials().wood).toBe(woodBefore - 5);
    expect(sounds).toContain('build_repair');
    player.update(0.016, 4.032);
    expect(player.getHudSnapshot().canRepairBuild).toBe(false);
  });

  it('handles frag grenade bouncing + fuse, shockwave knockback/build-break/immunity, chug splash AoE heal, and new weapons', () => {
    const { bus, building, propsBridge, weapons, player } = setupPlayerHarness();
    const sounds: SoundEventId[] = [];
    const shockwaves: number[] = [];
    const splashes: number[] = [];
    const explosions: number[] = [];
    const shakes: number[] = [];
    const tracers: Array<{ color?: number }> = [];

    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:shockwave', (ev) => shockwaves.push(ev.radius));
    bus.on('vfx:splash_heal', (ev) => splashes.push(ev.radius));
    bus.on('vfx:explosion', (ev) => explosions.push(ev.radius));
    bus.on('vfx:camera_shake', (ev) => shakes.push(ev.intensity));
    bus.on('vfx:tracer', (ev) => tracers.push({ color: ev.color }));

    // 1. New weapons: heavy_shotgun & mythic_blade_rifle
    const enemy: CombatActor = {
      id: 'bot_target',
      name: 'Target',
      position: { x: 2, y: 0, z: -12 },
      eyePos: { x: 2, y: 1.6, z: -12 },
      hp: 100,
      shield: 50,
      maxHp: 100,
      maxShield: 100,
      velocity: { x: 0, y: 0, z: 0 },
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    player.teleport({ x: 2, y: 0, z: 0 });
    weapons.registerActorsProvider(() => [player.getCombatActor(), enemy]);

    const mythicRes = weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: { uid: 'mythic', weaponId: 'mythic_blade_rifle', rarity: 'mythic', magAmmo: 32, stackCount: 1 },
      origin: { x: 2, y: 1.4, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(mythicRes.fired).toBe(true);
    expect(mythicRes.damageDealt).toBe(Math.round(38 * RARITY_MULTIPLIER.mythic));
    expect(sounds).toContain('shot_mythic_rifle');
    expect(tracers.some((t) => t.color === 0x38bdf8)).toBe(true);

    const heavyRes = weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: { uid: 'hsg', weaponId: 'heavy_shotgun', rarity: 'legendary', magAmmo: 7, stackCount: 1 },
      origin: { x: 2, y: 1.4, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(heavyRes.fired).toBe(true);
    expect(heavyRes.shotsHit).toBe(1);
    expect(sounds).toContain('shot_heavy_shotgun');
    expect(shakes.length).toBeGreaterThan(0);

    // 2. Frag grenade bounces off wall and explodes after fuseTime (2.3s)
    const bounceWall = building.placePieceForEntity('bot', 'wall', 'metal', 0, 0, -2, 'N', 0)!; // z = -8
    enemy.alive = true;
    enemy.hp = 100;
    enemy.shield = 0;
    enemy.position = { x: 2, y: 0, z: -6.5 };

    const fragItem: ItemInstance = {
      uid: 'frag_1',
      weaponId: 'frag_grenade',
      rarity: 'rare',
      magAmmo: 0,
      stackCount: 3,
    };
    player.getInventory().addItem(fragItem);
    player.getInventory().setActiveSlot(1);
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: fragItem,
      origin: { x: 2, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(weapons.getProjectiles().length).toBe(1);
    for (let i = 0; i < 52; i++) {
      weapons.update(0.05);
    }
    expect(sounds).toContain('grenade_bounce');
    expect(explosions.length).toBeGreaterThanOrEqual(1);
    expect(sounds).toContain('explosion');
    expect(enemy.hp).toBeLessThan(100);
    expect(bounceWall.hp).toBeLessThan(bounceWall.maxHp);

    // 3. Shockwave grenade breaks nearby builds, launches actors, and grants fall immunity
    building.clearAll();
    const breakWall = building.placePieceForEntity('bot', 'wall', 'metal', 0, 0, -1, 'N', 0)!; // z = -4
    enemy.alive = true;
    enemy.hp = 100;
    enemy.velocity = { x: 0, y: 0, z: 0 };
    enemy.fallImmune = false;
    enemy.position = { x: 2, y: 0, z: -3.5 };
    player.teleport({ x: 2, y: 0, z: 0 });

    const swItem: ItemInstance = {
      uid: 'sw_1',
      weaponId: 'shockwave_grenade',
      rarity: 'epic',
      magAmmo: 0,
      stackCount: 2,
    };
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: swItem,
      origin: { x: 2, y: 1.4, z: 0 },
      aimDir: { x: 0, y: -0.75, z: -0.66 },
      spreadRad: 0,
      isPlayer: true,
    });
    for (let i = 0; i < 12; i++) {
      weapons.update(0.03);
    }
    expect(shockwaves.length).toBe(1);
    expect(sounds).toContain('shockwave_blast');
    expect(building.getPieceById(breakWall.id)).toBeUndefined();
    expect(enemy.velocity!.y).toBeGreaterThan(10);
    expect(enemy.fallImmune).toBe(true);
    expect(player.isFallImmune()).toBe(true);

    // 4. Chug splash heals +20 HP/Shield overflow on impact
    player.teleport({ x: 2, y: 0, z: 0 });
    player.applySplashHeal(100 - player.getHealth());
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot',
      attackerName: 'Bot',
      weaponId: 'ar',
      rarity: 'common',
      damage: 10,
      hpDamage: 10,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { x: 2, y: 1, z: 0 },
      distance: 5,
    }); // HP now 90, Shield 0
    enemy.position = { x: 2, y: 0, z: -1.5 };
    enemy.hp = 60;
    enemy.shield = 0;

    const chugItem: ItemInstance = {
      uid: 'chug_1',
      weaponId: 'chug_splash',
      rarity: 'rare',
      magAmmo: 0,
      stackCount: 4,
    };
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: chugItem,
      origin: { x: 2, y: 1.4, z: 0 },
      aimDir: { x: 0, y: -1, z: 0 },
      spreadRad: 0,
      isPlayer: true,
    });
    for (let i = 0; i < 10; i++) {
      weapons.update(0.03);
    }
    expect(splashes.length).toBe(1);
    expect(sounds).toContain('splash_heal');
    expect(player.getHealth()).toBe(100);
    expect(player.getShield()).toBe(10); // +10 HP +10 overflow Shield!
    expect(enemy.hp).toBe(80);

    // 5. Loot llama interaction via [E] and pickaxe
    propsBridge.llamas.push(
      { id: 'llama_1', x: 2, y: 0, z: 1.5, rotationY: 0, hp: 200, maxHp: 200, opened: false },
      { id: 'llama_2', x: 2, y: 0, z: -1.8, rotationY: 0, hp: 50, maxHp: 50, opened: false },
    );
    player.pressKey('KeyE');
    expect(propsBridge.llamas[0].opened).toBe(true);

    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: { uid: 'pick', weaponId: 'pickaxe', rarity: 'common', magAmmo: 0, stackCount: 1 },
      origin: { x: 2, y: 1.0, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(propsBridge.llamas[1].opened).toBe(true);
  });

  it('grants +50 HP/Shield elimination siphon, tracks killStreak, plays surface footsteps, and exposes all snapshot fields', () => {
    let curBiome: BiomeType = 'grassland';
    const { bus, building, weapons, player } = setupPlayerHarness(
      createFlatTerrain(() => 0, { biomeFn: () => curBiome }),
    );
    const siphonEvents: Array<{ amount: number; healthAdded: number; shieldAdded: number }> = [];
    const sounds: SoundEventId[] = [];
    bus.on('combat:siphon', (ev) => siphonEvents.push(ev));
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    player.teleport({ x: 0, y: 0, z: 0 });
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot_1',
      attackerName: 'Bot1',
      weaponId: 'ar',
      rarity: 'common',
      damage: 70,
      hpDamage: 70,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { x: 0, y: 1, z: -5 },
      distance: 5,
    }); // HP = 30 -> lowHealthPulse > 0!
    player.update(0.016, 0.1);
    expect(player.getHudSnapshot().lowHealthPulse).toBeGreaterThan(0);

    const bot1: CombatActor = {
      id: 'bot_1',
      name: 'Bot1',
      position: { x: 0, y: 0, z: -10 },
      eyePos: { x: 0, y: 1.6, z: -10 },
      hp: 20,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const bot2: CombatActor = {
      id: 'bot_2',
      name: 'Bot2',
      position: { x: 0, y: 0, z: -14 },
      eyePos: { x: 0, y: 1.6, z: -14 },
      hp: 20,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), bot1, bot2]);

    const arItem: ItemInstance = { uid: 'ar', weaponId: 'ar', rarity: 'common', magAmmo: 30, stackCount: 1 };
    // Kill 1 -> +50 HP (30 -> 80)
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: arItem,
      origin: { x: 0, y: 1.2, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(bot1.alive).toBe(false);
    expect(player.getHealth()).toBe(80);
    expect(player.getShield()).toBe(0);
    expect(player.getKillStreak()).toBe(1);
    expect(siphonEvents.length).toBe(1);
    expect(siphonEvents[0]).toEqual({ amount: 50, healthAdded: 50, shieldAdded: 0 });
    expect(player.getHudSnapshot().siphonFlashAt).toBeGreaterThan(0);

    // Kill 2 -> +20 HP (80 -> 100) and +30 Shield (0 -> 30), killStreak = 2 -> kill_streak SFX
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: arItem,
      origin: { x: 0, y: 1.2, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(bot2.alive).toBe(false);
    expect(player.getHealth()).toBe(100);
    expect(player.getShield()).toBe(30);
    expect(player.getHudSnapshot().killStreak).toBe(2);
    expect(siphonEvents[1]).toEqual({ amount: 50, healthAdded: 20, shieldAdded: 30 });
    expect(sounds).toContain('kill_streak');

    // Surface & biome footsteps
    player.pressKey('KeyW');
    curBiome = 'snow';
    for (let i = 0; i < 15; i++) player.update(0.04, 1.0 + i * 0.04);
    expect(sounds).toContain('footstep_snow');

    curBiome = 'desert';
    for (let i = 0; i < 15; i++) player.update(0.04, 2.0 + i * 0.04);
    expect(sounds).toContain('footstep_sand');

    curBiome = 'urban';
    for (let i = 0; i < 15; i++) player.update(0.04, 3.0 + i * 0.04);
    expect(sounds).toContain('footstep_stone');

    curBiome = 'cyber';
    for (let i = 0; i < 15; i++) player.update(0.04, 3.6 + i * 0.04);
    expect(sounds).toContain('footstep_metal');

    // Standing on built wood floor -> footstep_wood
    const pos = player.getPosition();
    const gx = Math.floor(pos.x / GRID_XZ);
    const gz = Math.floor(pos.z / GRID_XZ);
    building.placePieceForEntity('player', 'floor', 'wood', gx, 0, gz, 'N', 0);
    building.placePieceForEntity('player', 'floor', 'wood', gx, 0, gz - 1, 'N', 0);
    player.teleport({ x: (gx + 0.5) * GRID_XZ, y: 0.01, z: (gz + 0.5) * GRID_XZ });
    for (let i = 0; i < 15; i++) player.update(0.04, 4.0 + i * 0.04);
    expect(sounds).toContain('footstep_wood');
  });
});

describe('Wave 2 Gameplay Mechanics', () => {
  function setupWave2Harness(terrain: TerrainQuery = createFlatTerrain(() => 0)) {
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'Tester');
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  function createMockVehicleBridge(initial: VehicleEntity[] = []): VehicleBridge & {
    vehicles: VehicleEntity[];
    driveCalls: Array<{ id: string; throttle: number; steer: number; boost: boolean; dt: number }>;
    damageCalls: Array<{ id: string; dmg: number; hitPos: Vec3Like }>;
  } {
    const vehicles = initial;
    const driveCalls: Array<{ id: string; throttle: number; steer: number; boost: boolean; dt: number }> = [];
    const damageCalls: Array<{ id: string; dmg: number; hitPos: Vec3Like }> = [];
    return {
      vehicles,
      driveCalls,
      damageCalls,
      getVehicles: () => vehicles,
      enterVehicle: (id, driverId) => {
        const v = vehicles.find((item) => item.id === id);
        if (!v || v.destroyed || v.hp <= 0 || v.driverId !== null) return false;
        v.driverId = driverId;
        return true;
      },
      exitVehicle: (id, driverId) => {
        const v = vehicles.find((item) => item.id === id);
        if (!v || v.driverId !== driverId) return null;
        v.driverId = null;
        v.isBoosting = false;
        return { x: v.x + 2.1, y: v.y, z: v.z };
      },
      driveVehicle: (id, throttle, steer, boost, dt) => {
        driveCalls.push({ id, throttle, steer, boost, dt });
        const v = vehicles.find((item) => item.id === id);
        if (!v || v.destroyed) return;
        v.yaw -= steer * 2.0 * dt;
        const speed = throttle * (boost && v.boostCharge > 0 ? 28 : 16);
        v.vx = Math.sin(v.yaw) * speed;
        v.vz = Math.cos(v.yaw) * speed;
        v.x += v.vx * dt;
        v.z += v.vz * dt;
        v.isBoosting = Boolean(boost && throttle !== 0 && v.boostCharge > 0);
        if (v.isBoosting) {
          v.boostCharge = Math.max(0, v.boostCharge - 0.3 * dt);
        }
      },
      damageVehicle: (id, dmg, hitPos) => {
        damageCalls.push({ id, dmg, hitPos });
        const v = vehicles.find((item) => item.id === id);
        if (!v || v.destroyed) return false;
        v.hp = Math.max(0, v.hp - dmg);
        if (v.hp <= 0) {
          v.destroyed = true;
          v.driverId = null;
        }
        return true;
      },
    };
  }

  it('mounts, drives, boosts, honks, widens camera, dismounts with cooldown, and damages vehicles via hitscan & explosives', () => {
    const { bus, weapons, camera, player } = setupWave2Harness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    const atv: VehicleEntity = {
      id: 'veh_1',
      kind: 'hover_atv',
      x: 0,
      y: 0,
      z: -3.4,
      yaw: Math.PI,
      pitch: 0,
      roll: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      hp: 400,
      maxHp: 400,
      boostCharge: 1.0,
      isBoosting: false,
      driverId: null,
      destroyed: false,
    };
    const vehicleBridge = createMockVehicleBridge([atv]);
    player.setVehicleBridge(vehicleBridge);

    // Out of range (> 3.8m) -> no vehicle prompt
    player.teleport({ x: 0, y: 0, z: 2.0 });
    player.setLook(Math.PI, 0);
    player.update(0.016, 0.016);
    expect(player.getHudSnapshot().interactPrompt).toBeNull();
    const onFootCamDist = dist3D(camera.position, player.getPosition());

    // Move within 3.8m -> prompt appears & KeyE mounts
    player.teleport({ x: 0, y: 0, z: 0 });
    player.update(0.016, 0.032);
    expect(player.getHudSnapshot().interactPrompt?.label).toContain('Drive');
    expect(player.getHudSnapshot().interactPrompt?.key).toBe('E');

    player.pressKey('KeyE');
    expect(atv.driverId).toBe('player');
    expect(player.getActiveVehicleId()).toBe('veh_1');
    expect(player.getCharacterRenderState().animState).toBe('drive');
    expect(player.getHudSnapshot().vehicle).toEqual({
      kind: 'hover_atv',
      speedKmh: 0,
      hp: 400,
      maxHp: 400,
      boostCharge: 1.0,
      isBoosting: false,
    });

    // Drive forward + steer + Shift turbo boost
    player.pressKey('KeyW');
    player.pressKey('KeyD');
    player.pressKey('ShiftLeft');
    for (let i = 0; i < 6; i++) {
      player.update(0.04, 0.08 + i * 0.04);
    }
    expect(vehicleBridge.driveCalls.length).toBe(6);
    expect(vehicleBridge.driveCalls[0].throttle).toBe(1);
    expect(vehicleBridge.driveCalls[0].steer).toBe(1);
    expect(vehicleBridge.driveCalls[0].boost).toBe(true);
    expect(player.getPosition().x).toBeCloseTo(atv.x, 3);
    expect(player.getPosition().z).toBeCloseTo(atv.z, 3);
    expect(atv.z).toBeLessThan(-3.4);
    expect(player.getHudSnapshot().showSpeedLines).toBe(true);
    expect(player.getHudSnapshot().vehicle?.isBoosting).toBe(true);
    expect(player.getHudSnapshot().vehicle?.speedKmh).toBeGreaterThan(50);

    // Wider third-person vehicle chase camera
    const drivingCamDist = dist3D(camera.position, player.getPosition());
    expect(drivingCamDist).toBeGreaterThan(onFootCamDist + 1.5);

    // Horn SFX via H
    player.pressKey('KeyH');
    expect(sounds).toContain('vehicle_horn');

    // Clean dismount via Space + dismount cooldown blocks immediate re-mount
    player.releaseKey('KeyW');
    player.releaseKey('KeyD');
    player.releaseKey('ShiftLeft');
    player.pressKey('Space');
    expect(atv.driverId).toBeNull();
    expect(player.getActiveVehicleId()).toBeNull();
    expect(player.getCharacterRenderState().animState).not.toBe('drive');
    expect(player.getHudSnapshot().vehicle).toBeNull();
    expect(player.getPosition().x).toBeCloseTo(atv.x + 2.1, 2);

    // Immediate re-mount blocked by cooldown
    player.teleport({ x: atv.x, y: atv.y, z: atv.z + 1.5 });
    player.pressKey('KeyE');
    expect(atv.driverId).toBeNull();

    // After cooldown expires (> 0.35s), KeyE re-mounts and KeyE dismounts
    for (let i = 0; i < 10; i++) player.update(0.05, 0.5 + i * 0.05);
    player.pressKey('KeyE');
    expect(atv.driverId).toBe('player');
    player.pressKey('KeyE');
    expect(atv.driverId).toBeNull();

    // Hitscan AR and RPG splash damage vehicle via WeaponSystem
    const shooter: CombatActor = {
      id: 'bot_shooter',
      name: 'Shooter',
      position: { x: atv.x, y: 0, z: atv.z + 12 },
      eyePos: { x: atv.x, y: 0.6, z: atv.z + 12 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [shooter]);
    weapons.fireWeapon({
      actor: shooter,
      item: { uid: 'ar_v', weaponId: 'ar', rarity: 'rare', magAmmo: 30, stackCount: 1 },
      origin: { x: atv.x, y: 0.6, z: atv.z + 12 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: false,
    });
    expect(atv.hp).toBeLessThan(400);

    const hpAfterAr = atv.hp;
    weapons.fireWeapon({
      actor: shooter,
      item: { uid: 'rpg_v', weaponId: 'rocket_launcher', rarity: 'legendary', magAmmo: 1, stackCount: 1 },
      origin: { x: atv.x, y: 0.6, z: atv.z + 12 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: false,
    });
    for (let i = 0; i < 15; i++) weapons.update(0.03);
    expect(atv.hp).toBeLessThan(hpAfterAr);
  });

  it('fires Tactical Grappler within 58m, pulls with fallImmune, consumes magAmmo without reload, and enforces cooldown', () => {
    const { collision, bus, player } = setupWave2Harness();
    const sounds: SoundEventId[] = [];
    const grappleLines: Array<{ from: Vec3Like; to: Vec3Like; duration: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:grapple_line', (ev) => grappleLines.push(ev));

    // Wall 35m ahead (within 58m range)
    collision.setStaticColliders([
      { id: 'grapple_wall', minX: -5, minY: 0, minZ: -37, maxX: 5, maxY: 16, maxZ: -35, material: 'metal' },
    ]);

    const grapplerInput: ItemInstance = {
      uid: 'grap_1',
      weaponId: 'grappler',
      rarity: 'epic',
      magAmmo: 2,
      stackCount: 1,
    };
    player.getInventory().addItem(grapplerInput);
    player.getInventory().setActiveSlot(1);
    const grapplerItem = player.getInventory().getSlot(1)!;
    player.teleport({ x: 0, y: 0, z: 0 });

    expect(player.getHudSnapshot().grapplerCharges).toBe(2);

    // Aiming into empty sky (> 58m / no hit) does not consume charge or grapple
    player.setLook(Math.PI, 0.9);
    player.update(0.016, 0.016);
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);
    expect(grapplerItem.magAmmo).toBe(2);
    expect(grappleLines.length).toBe(0);

    // Aim at wall 35m ahead & slightly up
    player.setLook(Math.PI, 0.12);
    player.update(0.016, 0.032);
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);

    expect(grapplerItem.magAmmo).toBe(1);
    expect(player.getHudSnapshot().grapplerCharges).toBe(1);
    expect(player.isFallImmune()).toBe(true);
    expect(grappleLines.length).toBe(1);
    expect(grappleLines[0].to.z).toBeCloseTo(-35, 1);
    expect(sounds).toContain('grappler_fire');
    expect(sounds).toContain('grappler_reel');

    // Immediate refire blocked by cooldown (1 / 1.1s)
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);
    expect(grapplerItem.magAmmo).toBe(1);

    // Step simulation -> player pulls strongly toward wall without taking fall damage
    const zStart = player.getPosition().z;
    for (let i = 0; i < 30; i++) {
      player.update(0.04, 0.08 + i * 0.04);
    }
    expect(player.getPosition().z).toBeLessThan(zStart - 10);
    expect(player.getHealth()).toBe(100);

    // Second grapple drains last charge to 0 without starting a reload
    player.setLook(Math.PI, 0.12);
    player.update(0.016, 1.3);
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);
    expect(grapplerItem.magAmmo).toBe(0);
    expect(player.getHudSnapshot().grapplerCharges).toBe(0);
    expect(player.getHudSnapshot().reloadProgress).toBeNull();

    // Third click at 0 charges emits dryfire and stays 0
    for (let i = 0; i < 25; i++) player.update(0.05, 1.4 + i * 0.05);
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);
    expect(grapplerItem.magAmmo).toBe(0);
    expect(sounds).toContain('dryfire');
  });

  it('deploys 5.2m Shield Bubble lasting 18s that blocks hitscan & projectiles across the shell while actors walk through', () => {
    const { collision, bus, weapons, player } = setupWave2Harness();
    const sounds: SoundEventId[] = [];
    const bubbleEvents: Array<{ id: string; position: Vec3Like; radius: number; duration: number }> = [];
    const impactMaterials: string[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:shield_bubble', (ev) => bubbleEvents.push(ev));
    bus.on('vfx:impact', (ev) => impactMaterials.push(ev.material));

    const thrower: CombatActor = {
      id: 'player',
      name: 'Player',
      position: { x: 0, y: 0, z: 0 },
      eyePos: { x: 0, y: 1.6, z: 0 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const insideTarget: CombatActor = {
      id: 'bot_inside',
      name: 'InsideBot',
      position: { x: 0, y: 0, z: -10 },
      eyePos: { x: 0, y: 1.6, z: -10 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const outsideTarget: CombatActor = {
      id: 'bot_outside',
      name: 'OutsideBot',
      position: { x: 0, y: 0, z: -22 },
      eyePos: { x: 0, y: 1.6, z: -22 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const insideShooter: CombatActor = {
      id: 'bot_inner_shooter',
      name: 'InnerShooter',
      position: { x: 0, y: 0, z: -8 },
      eyePos: { x: 0, y: 1.2, z: -8 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [thrower, insideTarget, outsideTarget, insideShooter]);

    // Throw shield_bubble onto terrain around z = -10
    const bubbleItem: ItemInstance = {
      uid: 'sb_1',
      weaponId: 'shield_bubble',
      rarity: 'epic',
      magAmmo: 0,
      stackCount: 2,
    };
    weapons.fireWeapon({
      actor: thrower,
      item: bubbleItem,
      origin: { x: 0, y: 1.6, z: -5.5 },
      aimDir: { x: 0, y: -0.5, z: -0.866 },
      spreadRad: 0,
      isPlayer: true,
    });
    for (let i = 0; i < 20; i++) {
      weapons.update(0.04);
    }

    const active = weapons.getActiveShieldBubbles();
    expect(active.length).toBe(1);
    expect(active[0].radius).toBeCloseTo(5.2, 2);
    expect(bubbleEvents.length).toBe(1);
    expect(bubbleEvents[0].duration).toBe(18);
    expect(sounds).toContain('shield_bubble_deploy');

    // Center bubble explicitly at exact (0, 0, -10) for deterministic boundary tests? Or read active[0].position
    const center = active[0].position;
    insideTarget.position = { x: center.x, y: 0, z: center.z };
    insideTarget.eyePos = { x: center.x, y: 1.6, z: center.z };
    insideShooter.position = { x: center.x, y: 0, z: center.z + 2.0 };
    insideShooter.eyePos = { x: center.x, y: 1.2, z: center.z + 2.0 };
    outsideTarget.position = { x: center.x, y: 0, z: center.z - 12 };
    outsideTarget.eyePos = { x: center.x, y: 1.6, z: center.z - 12 };

    // 1. Outside AR hitscan shot aimed at insideTarget is blocked at dome shell
    const arRes = weapons.fireWeapon({
      actor: thrower,
      item: { uid: 'ar_sb', weaponId: 'ar', rarity: 'rare', magAmmo: 30, stackCount: 1 },
      origin: { x: center.x, y: 1.1, z: center.z + 10 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(arRes.shotsHit).toBe(0);
    expect(insideTarget.hp).toBe(100);
    expect(impactMaterials).toContain('shield');

    // 2. Outside Sniper projectile & RPG rocket are blocked by dome shell
    weapons.fireWeapon({
      actor: thrower,
      item: { uid: 'snip_sb', weaponId: 'sniper', rarity: 'legendary', magAmmo: 1, stackCount: 1 },
      origin: { x: center.x, y: 1.1, z: center.z + 10 },
      aimDir: { x: 0, y: 0.01, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    weapons.fireWeapon({
      actor: thrower,
      item: { uid: 'rpg_sb', weaponId: 'rocket_launcher', rarity: 'legendary', magAmmo: 1, stackCount: 1 },
      origin: { x: center.x, y: 1.1, z: center.z + 10 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    for (let i = 0; i < 15; i++) weapons.update(0.03);
    expect(insideTarget.hp).toBe(100);

    // 3. Inside shooter firing OUT toward outsideTarget is blocked crossing dome shell
    const outRes = weapons.fireWeapon({
      actor: insideShooter,
      item: { uid: 'ar_out', weaponId: 'ar', rarity: 'common', magAmmo: 30, stackCount: 1 },
      origin: { x: center.x, y: 1.1, z: center.z - 1.5 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: false,
    });
    expect(outRes.shotsHit).toBe(0);
    expect(outsideTarget.hp).toBe(100);

    // 4. Inside shooter firing at insideTarget (both inside dome) hits normally!
    const inRes = weapons.fireWeapon({
      actor: insideShooter,
      item: { uid: 'ar_in', weaponId: 'ar', rarity: 'common', magAmmo: 30, stackCount: 1 },
      origin: { x: center.x, y: 1.1, z: center.z + 2.0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: false,
    });
    expect(inRes.shotsHit).toBe(1);
    expect(insideTarget.hp).toBe(70);

    // 5. Actors walk through dome shell freely
    let walkPos: Vec3Like = { x: center.x, y: 0, z: center.z + 7.0 };
    for (let i = 0; i < 20; i++) {
      const m = collision.resolveCharacterMovement(
        walkPos,
        { x: 0, y: 0, z: -8 },
        PLAYER_RADIUS,
        PLAYER_HEIGHT,
        0.05,
      );
      walkPos = m.position;
    }
    expect(walkPos.z).toBeLessThan(center.z);

    // 6. Bubble expires after 18s -> subsequent outside shot hits insideTarget
    for (let i = 0; i < 370; i++) {
      weapons.update(0.05);
    }
    expect(weapons.getActiveShieldBubbles().length).toBe(0);

    insideShooter.alive = false;
    const afterExpireRes = weapons.fireWeapon({
      actor: thrower,
      item: { uid: 'ar_after', weaponId: 'ar', rarity: 'common', magAmmo: 30, stackCount: 1 },
      origin: { x: center.x, y: 1.1, z: center.z + 10 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(afterExpireRes.shotsHit).toBe(1);
    expect(insideTarget.hp).toBe(40);
  });

  it('predicts parabolic Throwable Aim Trajectory Arc only when holding an isThrowable weapon', () => {
    const { player } = setupWave2Harness();
    player.teleport({ x: 0, y: 0, z: 0 });
    player.setLook(Math.PI, 0.25);

    // Pickaxe -> null
    expect(player.getThrowableArc()).toBeNull();

    // Non-throwable AR & Grappler -> null
    player.getInventory().addItem({
      uid: 'ar_arc',
      weaponId: 'ar',
      rarity: 'rare',
      magAmmo: 30,
      stackCount: 1,
    });
    player.getInventory().setActiveSlot(1);
    expect(player.getThrowableArc()).toBeNull();

    player.getInventory().addItem({
      uid: 'grap_arc',
      weaponId: 'grappler',
      rarity: 'epic',
      magAmmo: 10,
      stackCount: 1,
    });
    player.getInventory().setActiveSlot(2);
    expect(player.getThrowableArc()).toBeNull();

    // Throwable (frag_grenade) -> parabolic gravity arc
    player.getInventory().addItem({
      uid: 'frag_arc',
      weaponId: 'frag_grenade',
      rarity: 'rare',
      magAmmo: 0,
      stackCount: 3,
    });
    player.getInventory().setActiveSlot(3);
    const arc = player.getThrowableArc();
    expect(arc).not.toBeNull();
    expect(arc!.length).toBeGreaterThanOrEqual(5);
    // Rises initially (positive pitch + loft) then curves downward onto terrain y = 0
    const peakY = Math.max(...arc!.map((p) => p.y));
    expect(peakY).toBeGreaterThan(arc![0].y);
    expect(arc![arc!.length - 1].y).toBeCloseTo(0, 1);
    // Moves forward in -Z
    expect(arc![arc!.length - 1].z).toBeLessThan(-5);

    // Build mode hides arc
    player.toggleBuildMode(true);
    expect(player.getThrowableArc()).toBeNull();
  });

  it('unlocks Boss Vaults with vaultKeys <= 4.2m and resolves custom keybinds cleanly', () => {
    const { bus, building, player } = setupWave2Harness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    const vaults: VaultEntity[] = [
      {
        id: 'vault_skyline',
        poiId: 'skyline_spire',
        bossName: 'Cyber Warden',
        x: 0,
        y: 0,
        z: -3.9,
        unlocked: false,
        opened: false,
      },
    ];
    const unlockedLog: Array<{ lootPos: Vec3Like; poiId: string }> = [];
    const vaultBridge: VaultBridge = {
      getVaults: () => vaults,
      unlockVault: (id) => {
        const v = vaults.find((item) => item.id === id);
        if (!v || v.unlocked) return { unlocked: false };
        v.unlocked = true;
        return { unlocked: true, lootPos: { x: v.x, y: v.y + 0.4, z: v.z - 2 } };
      },
    };
    player.setVaultBridge(vaultBridge);
    player.setVaultUnlockHandler((lootPos, poiId) => {
      unlockedLog.push({ lootPos, poiId });
    });

    // Out of range (> 4.2m) -> no prompt
    player.teleport({ x: 0, y: 0, z: 1.0 });
    player.update(0.016, 0.016);
    expect(player.getHudSnapshot().interactPrompt).toBeNull();

    // Within 4.2m with 0 keys -> prompt shows, E cannot unlock
    player.teleport({ x: 0, y: 0, z: 0 });
    player.update(0.016, 0.032);
    expect(player.getHudSnapshot().interactPrompt?.label).toContain('Unlock Boss Vault');
    expect(player.getVaultKeys()).toBe(0);
    expect(player.getHudSnapshot().activeVaultKeys).toBe(0);

    player.pressKey('KeyE');
    expect(vaults[0].unlocked).toBe(false);

    // Add 2 keys, unlock vault -> consumes 1 key, plays vault_unlock, calls handler
    player.addVaultKey(2);
    expect(player.getVaultKeys()).toBe(2);
    expect(player.getHudSnapshot().activeVaultKeys).toBe(2);

    player.update(0.016, 0.048);
    expect(player.getHudSnapshot().interactPrompt?.label).toBe('Unlock Boss Vault');
    player.pressKey('KeyE');
    expect(vaults[0].unlocked).toBe(true);
    expect(player.getVaultKeys()).toBe(1);
    expect(player.getHudSnapshot().activeVaultKeys).toBe(1);
    expect(sounds).toContain('vault_unlock');
    expect(unlockedLog.length).toBe(1);
    expect(unlockedLog[0].poiId).toBe('skyline_spire');

    // Custom keybind remapping across all 8 Gameplay bindings
    player.setSettings({
      ...DEFAULT_SETTINGS,
      keybinds: {
        buildWall: 'KeyU',
        buildFloor: 'KeyI',
        buildRamp: 'KeyO',
        buildRoof: 'KeyP',
        edit: 'KeyJ',
        repair: 'KeyN',
        interact: 'KeyB',
        crouchSlide: 'KeyL',
      },
    });
    player.getInventory().addMaterial('wood', 200);

    // Old default KeyZ must NOT trigger buildWall
    player.toggleBuildMode(false);
    player.pressKey('KeyZ');
    expect(player.getHudSnapshot().isBuildMode).toBe(false);

    // New custom bindings select pieces
    player.pressKey('KeyU');
    expect(player.getHudSnapshot().isBuildMode).toBe(true);
    expect(player.getHudSnapshot().activeBuildType).toBe('wall');

    player.pressKey('KeyI');
    expect(player.getHudSnapshot().activeBuildType).toBe('floor');

    player.pressKey('KeyO');
    expect(player.getHudSnapshot().activeBuildType).toBe('ramp');

    player.pressKey('KeyP');
    expect(player.getHudSnapshot().activeBuildType).toBe('roof');

    // Custom edit (KeyJ) and repair (KeyN)
    player.toggleBuildMode(false);
    player.teleport({ x: 2, y: 0, z: 2 });
    player.setLook(Math.PI, 0);
    const wall = building.placePieceForEntity('player', 'wall', 'wood', 0, 0, 0, 'N', 0)!;
    building.update(4.0, 4.0);
    building.damagePiece(wall.id, 60);

    // Old KeyF must not repair or select roof
    player.pressKey('KeyF');
    expect(wall.hp).toBe(90);
    expect(player.getHudSnapshot().isBuildMode).toBe(false);

    // New KeyN repairs wall
    player.pressKey('KeyN');
    expect(wall.hp).toBe(150);

    // Old KeyG must not enter edit mode; new KeyJ does
    player.pressKey('KeyG');
    expect(player.getHudSnapshot().editMode.active).toBe(false);
    player.pressKey('KeyJ');
    expect(player.getHudSnapshot().editMode.active).toBe(true);
    player.pressKey('KeyJ'); // confirms edit
    expect(player.getHudSnapshot().editMode.active).toBe(false);

    // Custom crouchSlide (KeyL) toggles crouch while old KeyC does not
    player.pressKey('KeyC');
    expect(player.getHudSnapshot().isCrouching).toBe(false);
    player.pressKey('KeyL');
    expect(player.getHudSnapshot().isCrouching).toBe(true);
    player.pressKey('KeyL');
    expect(player.getHudSnapshot().isCrouching).toBe(false);

    // Custom interact (KeyB) unlocks vault & shows key 'B' in prompt
    player.teleport({ x: 20, y: 0, z: 20 });
    vaults.push({
      id: 'vault_2',
      poiId: 'frostpeak_citadel',
      bossName: 'Frost King',
      x: 20,
      y: 0,
      z: 18,
      unlocked: false,
      opened: false,
    });
    player.update(0.016, 0.1);
    expect(player.getHudSnapshot().interactPrompt?.key).toBe('B');
    player.pressKey('KeyB');
    expect(vaults[1].unlocked).toBe(true);
    expect(player.getVaultKeys()).toBe(0);
  });
});

describe('Wave 3 Gameplay Systems', () => {
  function setupWave3Harness() {
    const terrain = createFlatTerrain(() => 0);
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'Wave3Tester');
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  function createMockStationBridge(init?: {
    benches?: UpgradeBenchEntity[];
    campfires?: CampfireEntity[];
    barrels?: SlurpBarrelEntity[];
  }): WorldStationBridge & {
    benches: UpgradeBenchEntity[];
    campfires: CampfireEntity[];
    barrels: SlurpBarrelEntity[];
  } {
    const benches = init?.benches ?? [];
    const campfires = init?.campfires ?? [];
    const barrels = init?.barrels ?? [];
    return {
      benches,
      campfires,
      barrels,
      getUpgradeBenches: () => benches,
      getCampfires: () => campfires,
      igniteCampfire: (id) => {
        const cf = campfires.find((c) => c.id === id);
        if (!cf || cf.lit || cf.remainingSec <= 0) return false;
        cf.lit = true;
        return true;
      },
      getActiveCampfireHealAt: (x, y, z) => {
        for (const cf of campfires) {
          if (!cf.lit || cf.remainingSec <= 0) continue;
          const d = dist3D({ x, y, z }, { x: cf.x, y: cf.y, z: cf.z });
          if (d <= cf.radius) return cf.healPerSec;
        }
        return 0;
      },
      getSlurpBarrels: () => barrels,
      damageSlurpBarrel: (id, dmg) => {
        const b = barrels.find((item) => item.id === id);
        if (!b || b.destroyed || b.hp <= 0) return null;
        b.hp = Math.max(0, b.hp - dmg);
        if (b.hp <= 0) b.destroyed = true;
        return {
          destroyed: b.destroyed,
          shieldAmount: b.shieldAmount,
          position: { x: b.x, y: b.y, z: b.z },
        };
      },
    };
  }

  it('enforces Zero Build mode: blocks building/editing and absorbs & recharges 50 Overshield after 6.5s', () => {
    const { bus, building, weapons, player } = setupWave3Harness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    player.setGameMode('zero_build');
    expect(player.getGameMode()).toBe('zero_build');
    expect(player.getMaxOvershield()).toBe(50);
    expect(player.getOvershield()).toBe(50);
    expect(player.getHudSnapshot().gameMode).toBe('zero_build');
    expect(player.getHudSnapshot().overshield).toBe(50);
    expect(player.getHudSnapshot().maxOvershield).toBe(50);

    player.teleport({ x: 0, y: 0, z: 0 });
    player.getInventory().addMaterial('wood', 200);

    // Building & editing blocked in Zero Build
    player.toggleBuildMode(true);
    expect(player.getHudSnapshot().isBuildMode).toBe(false);
    player.selectBuildPiece('wall');
    expect(player.getHudSnapshot().isBuildMode).toBe(false);
    player.pressKey('KeyQ');
    player.pressKey('KeyZ');
    expect(player.getHudSnapshot().isBuildMode).toBe(false);
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);
    expect(building.getPieces().length).toBe(0);
    expect(player.enterEditMode()).toBe(false);

    // Give shield and test damage order: Overshield -> Shield -> HP
    player.applySplashHeal(30); // health=100, shield=30
    expect(player.getShield()).toBe(30);

    // 30 damage absorbed completely by overshield (50 -> 20)
    player.update(0.05, 1.0);
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot_1',
      attackerName: 'Bot',
      weaponId: 'ar',
      rarity: 'common',
      damage: 30,
      hpDamage: 30,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { x: 0, y: 1, z: -5 },
      distance: 5,
    });
    expect(player.getOvershield()).toBe(20);
    expect(player.getShield()).toBe(30);
    expect(player.getHealth()).toBe(100);

    // 40 damage via WeaponSystem absorbs remaining 20 overshield + 20 shield (shield -> 10)
    const attacker: CombatActor = {
      id: 'bot_2',
      name: 'Bot2',
      position: { x: 0, y: 0, z: -10 },
      eyePos: { x: 0, y: 1.2, z: -10 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), attacker]);
    weapons.fireWeapon({
      actor: attacker,
      item: { uid: 'ar_z', weaponId: 'ar', rarity: 'rare', magAmmo: 30, stackCount: 1 },
      origin: { x: 0, y: 1.2, z: -10 },
      aimDir: { x: 0, y: 0, z: 1 },
      spreadRad: 0,
      isPlayer: false,
    }); // rare AR = round(30 * 1.14) = 34 dmg -> 20 overshield + 14 shield
    expect(player.getOvershield()).toBe(0);
    expect(player.getShield()).toBe(16);
    expect(player.getHealth()).toBe(100);

    // Recharge does not start before 6.5s
    let t = 1.0;
    for (let i = 0; i < 120; i++) {
      t += 0.05;
      player.update(0.05, t); // up to t = 7.0 (6.0s since damage)
    }
    expect(player.getOvershield()).toBe(0);
    expect(sounds).not.toContain('overshield_recharge');

    // Cross 6.5s threshold -> emits 'overshield_recharge' once & recharges at 12/s
    for (let i = 0; i < 30; i++) {
      t += 0.05;
      player.update(0.05, t); // 1.5s more (1.0s past 6.5s -> ~12 overshield)
    }
    const rechargeSignals = sounds.filter((s) => s === 'overshield_recharge');
    expect(rechargeSignals.length).toBe(1);
    expect(player.getOvershield()).toBeGreaterThan(10);
    expect(player.getOvershield()).toBeLessThan(50);

    // Finish recharging to full 50
    for (let i = 0; i < 80; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getOvershield()).toBe(50);

    // Storm damage bypasses overshield & shield directly to HP
    player.applyStormDamage(15);
    expect(player.getOvershield()).toBe(50);
    expect(player.getShield()).toBe(16);
    expect(player.getHealth()).toBe(85);

    (player as unknown as { applyDamage: (ev: DamageEvent & { isStorm?: boolean }) => void }).applyDamage({
      targetId: 'player',
      attackerId: 'storm',
      attackerName: 'Storm',
      weaponId: 'pickaxe',
      rarity: 'common',
      damage: 10,
      hpDamage: 10,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { x: 0, y: 1, z: 0 },
      distance: 0,
      isStorm: true,
    });
    expect(player.getOvershield()).toBe(50);
    expect(player.getHealth()).toBe(75);
  });

  it('initializes Blitz mode starter mats (150/100/100) and zero Overshield', () => {
    const { player } = setupWave3Harness();

    // Default solo starts with 0 mats & 0 overshield
    expect(player.getGameMode()).toBe('solo');
    expect(player.getOvershield()).toBe(0);
    expect(player.getMaxOvershield()).toBe(0);
    expect(player.getInventory().getMaterials()).toEqual({
      wood: 0,
      brick: 0,
      metal: 0,
    });

    // Blitz starter mats & 0 overshield
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'BlitzTester', 'blitz');
    expect(player.getGameMode()).toBe('blitz');
    expect(player.getOvershield()).toBe(0);
    expect(player.getMaxOvershield()).toBe(0);
    expect(player.getInventory().getMaterials()).toEqual({
      wood: 150,
      brick: 100,
      metal: 100,
    });
  });

  it('supports Upgrade Bench rarity upgrades, proportional mat deduction, mag refill, and chest priority', () => {
    const { bus, propsBridge, player } = setupWave3Harness();
    const sounds: SoundEventId[] = [];
    const upgradeVfx: Array<{ position: Vec3Like; rarity: Rarity }> = [];
    const upgradedLog: Array<{ rarity: Rarity; cost: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:weapon_upgrade', (ev) => upgradeVfx.push(ev));

    const stationBridge = createMockStationBridge({
      benches: [
        { id: 'bench_1', poiId: 'metro_towers', x: 0, y: 0, z: -3.0, rotationY: 0 },
      ],
    });
    player.setStationBridge(stationBridge);
    player.setOnWeaponUpgraded((item, cost) => {
      upgradedLog.push({ rarity: item.rarity, cost });
    });

    player.teleport({ x: 0, y: 0, z: 0 });
    player.getInventory().addItem({
      uid: 'ar_upg',
      weaponId: 'ar',
      rarity: 'common',
      magAmmo: 7,
      stackCount: 1,
    });
    player.getInventory().addItem({
      uid: 'mini_upg',
      weaponId: 'mini_shield',
      rarity: 'uncommon',
      magAmmo: 0,
      stackCount: 3,
    });

    // Pickaxe slot 0 -> no bench prompt
    player.getInventory().setActiveSlot(0);
    player.update(0.016, 0.016);
    expect(player.getInteractPrompt()).toBeNull();

    // Consumable slot 2 -> no bench prompt
    player.getInventory().setActiveSlot(2);
    player.update(0.016, 0.032);
    expect(player.getInteractPrompt()).toBeNull();

    // Active common AR -> prompt shows cost & next rarity tint
    player.getInventory().setActiveSlot(1);
    player.update(0.016, 0.048);
    expect(player.getInteractPrompt()?.label).toBe('UPGRADE ASSAULT RIFLE (50 MATS)');
    expect(player.getInteractPrompt()?.rarity).toBe('uncommon');

    // Insufficient mats -> dryfire, no upgrade
    player.getInventory().addMaterial('wood', 20);
    player.pressKey('KeyE');
    expect(player.getInventory().getSlot(1)?.rarity).toBe('common');
    expect(sounds).toContain('dryfire');

    // Add brick + metal (total 20 + 40 + 40 = 100 >= 50) -> proportional deduction of 50
    player.getInventory().addMaterial('brick', 40);
    player.getInventory().addMaterial('metal', 40);
    player.pressKey('KeyE');
    const itemAfter = player.getInventory().getSlot(1)!;
    expect(itemAfter.rarity).toBe('uncommon');
    expect(itemAfter.magAmmo).toBe(WEAPONS.ar.magSize);
    expect(player.getInventory().getTotalMaterials()).toBe(50);
    // Proportional shares of 50 across 20:40:40 -> 10 wood, 20 brick, 20 metal
    expect(player.getInventory().getMaterials()).toEqual({
      wood: 10,
      brick: 20,
      metal: 20,
    });
    expect(sounds).toContain('upgrade_weapon');
    expect(upgradeVfx.length).toBe(1);
    expect(upgradeVfx[0].rarity).toBe('uncommon');
    expect(upgradedLog).toEqual([{ rarity: 'uncommon', cost: UPGRADE_COSTS.common }]);

    // Next tier prompt updates immediately to rare (100 MATS)
    expect(player.getInteractPrompt()?.label).toBe('UPGRADE ASSAULT RIFLE (100 MATS)');
    expect(player.getInteractPrompt()?.rarity).toBe('rare');

    // Chest closer/in range prioritizes Chest over Upgrade Bench
    propsBridge.chests.push({
      id: 'chest_prio',
      x: 1.8,
      y: 0,
      z: 0,
      rotationY: 0,
      opened: false,
      openProgress: 0,
    });
    player.update(0.016, 0.064);
    expect(player.getInteractPrompt()?.label).toBe('Open Chest');

    // Opening chest restores Upgrade Bench prompt
    player.pressKey('KeyE');
    expect(propsBridge.chests[0].opened).toBe(true);
    player.update(0.016, 0.08);
    expect(player.getInteractPrompt()?.label).toBe('UPGRADE ASSAULT RIFLE (100 MATS)');
  });

  it('stokes Cozy Campfire on [E] and heals HP smoothly while inside radius', () => {
    const { bus, player } = setupWave3Harness();
    const sounds: SoundEventId[] = [];
    const healVfx: Vec3Like[] = [];
    const litCampfires: string[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:campfire_heal', (ev) => healVfx.push(ev.position));

    const stationBridge = createMockStationBridge({
      campfires: [
        {
          id: 'cf_1',
          poiId: 'whispering_pines',
          x: 0,
          y: 0,
          z: -2.8,
          lit: false,
          remainingSec: 25,
          maxDurationSec: 25,
          healPerSec: 3,
          radius: 5.5,
        },
      ],
    });
    player.setStationBridge(stationBridge);
    player.setOnCampfireLit((id) => litCampfires.push(id));

    player.teleport({ x: 0, y: 0, z: 0 });
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot_1',
      attackerName: 'Bot',
      weaponId: 'ar',
      rarity: 'common',
      damage: 40,
      hpDamage: 40,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { x: 0, y: 1, z: -5 },
      distance: 5,
    });
    expect(player.getHealth()).toBe(60);

    // Unlit campfire prompt within 3.6m
    player.update(0.016, 0.016);
    expect(player.getInteractPrompt()?.label).toBe('STOKE CAMPFIRE');
    expect(player.isNearCampfireHealing()).toBe(false);

    // Stoke campfire -> ignites, emits campfire_ignite, invokes callback
    player.pressKey('KeyE');
    expect(stationBridge.campfires[0].lit).toBe(true);
    expect(litCampfires).toEqual(['cf_1']);
    expect(sounds).toContain('campfire_ignite');

    // Step 3.0s inside campfire radius -> heals +9 HP (60 -> 69), emits periodic campfire_heal & VFX
    let t = 0.05;
    for (let i = 0; i < 60; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.isNearCampfireHealing()).toBe(true);
    expect(player.getHudSnapshot().nearCampfireHealing).toBe(true);
    expect(player.getHealth()).toBeCloseTo(69, 1);
    expect(sounds.filter((s) => s === 'campfire_heal').length).toBeGreaterThanOrEqual(2);
    expect(healVfx.length).toBeGreaterThanOrEqual(3);

    // Walk outside campfire radius -> stops healing & clears flag
    player.teleport({ x: 0, y: 0, z: 20 });
    player.update(0.05, t + 0.05);
    expect(player.isNearCampfireHealing()).toBe(false);
    expect(player.getHudSnapshot().nearCampfireHealing).toBe(false);
  });

  it('destroys Slurp Barrels via hitscan & pickaxe, credits shield, and emits slurp VFX/SFX', () => {
    const { collision, bus, weapons, player } = setupWave3Harness();
    const sounds: SoundEventId[] = [];
    const impacts: Array<{ material: string }> = [];
    const slurpBursts: Array<{ position: Vec3Like; radius: number }> = [];
    const brokenLog: Array<{ actorId: string; shieldAmount: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:impact', (ev) => impacts.push({ material: ev.material }));
    bus.on('vfx:slurp_burst', (ev) => slurpBursts.push(ev));

    const stationBridge = createMockStationBridge({
      barrels: [
        { id: 'slurp_1', x: 0, y: 0, z: -6, hp: 40, maxHp: 40, shieldAmount: 15, destroyed: false },
        { id: 'slurp_2', x: 2.1, y: 0, z: 0, hp: 40, maxHp: 40, shieldAmount: 15, destroyed: false },
      ],
    });
    // Include static colliders matching the barrels to ensure WeaponSystem still hits barrels cleanly
    collision.setStaticColliders([
      { id: 'slurp_col_1', minX: -0.65, minY: 0, minZ: -6.65, maxX: 0.65, maxY: 1.25, maxZ: -5.35 },
      { id: 'slurp_col_2', minX: 1.45, minY: 0, minZ: -0.65, maxX: 2.75, maxY: 1.25, maxZ: 0.65 },
    ]);
    weapons.setStationBridge(stationBridge);
    weapons.setOnSlurpBarrelBroken((actorId, shieldAmount) => {
      brokenLog.push({ actorId, shieldAmount });
    });

    player.teleport({ x: 0, y: 0, z: 0 });
    // Wound player below 100 HP to verify shield is credited directly (not hijacked by HP)
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot_1',
      attackerName: 'Bot',
      weaponId: 'ar',
      rarity: 'common',
      damage: 25,
      hpDamage: 25,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { x: 0, y: 1, z: -5 },
      distance: 5,
    });
    expect(player.getHealth()).toBe(75);
    expect(player.getShield()).toBe(0);

    const arItem: ItemInstance = {
      uid: 'ar_slurp',
      weaponId: 'ar',
      rarity: 'common',
      magAmmo: 30,
      stackCount: 1,
    };

    // Shot 1: 33 structureDamage -> barrel HP drops from 40 to 7 (not broken yet)
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: arItem,
      origin: { x: 0, y: 0.8, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(stationBridge.barrels[0].hp).toBe(7);
    expect(stationBridge.barrels[0].destroyed).toBe(false);
    expect(impacts.some((i) => i.material === 'shield')).toBe(true);
    expect(player.getShield()).toBe(0);

    // Shot 2: destroys barrel -> +15 shield, emits slurp_barrel_break & vfx:slurp_burst
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: arItem,
      origin: { x: 0, y: 0.8, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(stationBridge.barrels[0].destroyed).toBe(true);
    expect(player.getShield()).toBe(15);
    expect(player.getHealth()).toBe(75);
    expect(sounds).toContain('slurp_barrel_break');
    expect(slurpBursts.length).toBe(1);
    expect(brokenLog).toEqual([{ actorId: 'player', shieldAmount: 15 }]);

    // Pickaxe swing destroys slurp_2 within 3.2m melee range -> +15 more shield (15 -> 30)
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: { uid: 'pick_s', weaponId: 'pickaxe', rarity: 'common', magAmmo: 0, stackCount: 1 },
      origin: { x: 0, y: 0.8, z: 0 },
      aimDir: { x: 1, y: 0, z: 0 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(stationBridge.barrels[1].destroyed).toBe(true);
    expect(player.getShield()).toBe(30);
    expect(slurpBursts.length).toBe(2);
    expect(brokenLog.length).toBe(2);
  });

  it('tracks deterministic match quests in QuestTracker and emits ui:quest_complete once per quest', () => {
    const bus = new EventBus();
    const completedEvents: MatchQuest[] = [];
    const sounds: SoundEventId[] = [];
    bus.on('ui:quest_complete', (ev) => completedEvents.push(ev.quest));
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    const trackerA = new QuestTracker(bus);
    const trackerB = new QuestTracker(new EventBus());
    trackerA.reset(7777, 'solo');
    trackerB.reset(7777, 'solo');

    const questsA = trackerA.getQuests();
    const questsB = trackerB.getQuests();
    expect(questsA.length).toBe(3);
    expect(questsA).toEqual(questsB); // Deterministic match-seeded selection
    // All 3 picked quests are distinct kinds
    expect(new Set(questsA.map((q) => q.id)).size).toBe(3);

    // Pick first active quest and complete it incrementally
    const firstQuest = questsA[0];
    const kind = firstQuest.id.replace('quest_', '') as
      | 'chest_open'
      | 'damage_dealt'
      | 'elimination'
      | 'slurp_break'
      | 'weapon_upgrade'
      | 'campfire_ignite'
      | 'vehicle_distance';

    if (firstQuest.target > 1) {
      trackerA.record(kind, 1);
      expect(trackerA.getQuests()[0].progress).toBe(1);
      expect(trackerA.getQuests()[0].completed).toBe(false);
      expect(completedEvents.length).toBe(0);
    }

    // Complete first quest (overshooting clamps to target and fires completion once)
    trackerA.record(kind, firstQuest.target + 50);
    expect(trackerA.getQuests()[0].progress).toBe(firstQuest.target);
    expect(trackerA.getQuests()[0].completed).toBe(true);
    expect(trackerA.getCompletedCount()).toBe(1);
    expect(trackerA.getCompletedBonusXp()).toBe(firstQuest.xpReward);
    expect(completedEvents.length).toBe(1);
    expect(completedEvents[0].id).toBe(firstQuest.id);
    expect(sounds).toContain('quest_complete');

    // Recording more after completion does NOT re-emit ui:quest_complete
    trackerA.record(kind, 10);
    expect(completedEvents.length).toBe(1);
    expect(trackerA.getCompletedCount()).toBe(1);
  });
});

describe('Wave 4 Gameplay Systems', () => {
  function setupWave4Harness(terrain: TerrainQuery = createFlatTerrain(() => 0)) {
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'Wave4Tester');
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  function createMockRiftCaptureBridge(init?: {
    rifts?: RiftEntity[];
    capturePoints?: CapturePointEntity[];
    explosiveBarrels?: ExplosiveBarrelEntity[];
  }): WorldRiftCaptureBridge & {
    rifts: RiftEntity[];
    capturePoints: CapturePointEntity[];
    explosiveBarrels: ExplosiveBarrelEntity[];
  } {
    const rifts = init?.rifts ?? [];
    const capturePoints = init?.capturePoints ?? [];
    const explosiveBarrels = init?.explosiveBarrels ?? [];
    return {
      rifts,
      capturePoints,
      explosiveBarrels,
      getRifts: () => rifts,
      triggerRift: (id) => {
        const r = rifts.find((item) => item.id === id);
        if (!r || !r.active) return null;
        r.openRemainingSec = 8;
        return { skyPos: { x: r.x, y: r.y + 92, z: r.z } };
      },
      getCapturePoints: () => capturePoints,
      advanceCapturePoint: (id, actorId, actorName, dt) => {
        const cp = capturePoints.find((item) => item.id === id)!;
        if (!cp.captured) {
          cp.progress = Math.min(1, cp.progress + dt / 12);
          if (cp.progress >= 1 - 1e-6) {
            cp.progress = 1;
            cp.captured = true;
            cp.ownerId = actorId;
            cp.ownerName = actorName;
            return {
              capturedNow: true,
              progress: 1,
              lootPos: { x: cp.x, y: cp.y + 0.6, z: cp.z },
              poiName: cp.poiName,
            };
          }
        }
        return {
          capturedNow: false,
          progress: cp.progress,
          poiName: cp.poiName,
        };
      },
      getExplosiveBarrels: () => explosiveBarrels,
      damageExplosiveBarrel: (id, dmg) => {
        const b = explosiveBarrels.find((item) => item.id === id);
        if (!b || b.exploded || b.hp <= 0) return null;
        b.hp = Math.max(0, b.hp - dmg);
        if (b.hp <= 0) b.exploded = true;
        return {
          exploded: b.exploded,
          position: { x: b.x, y: b.y, z: b.z },
          blastRadius: b.blastRadius,
          blastDamage: b.blastDamage,
        };
      },
    };
  }

  function acquireSpecificAugment(
    player: PlayerController,
    targetId: AugmentId,
  ): void {
    const mgr = player.getAugmentManager();
    for (let seed = 1; seed <= 100; seed++) {
      mgr.reset(seed, 'solo');
      const pair = mgr.forceOffer();
      if (pair && pair.includes(targetId)) {
        const idx = pair[0] === targetId ? 0 : 1;
        player.pressKey(idx === 0 ? 'Digit7' : 'Digit8');
        expect(mgr.hasAugment(targetId)).toBe(true);
        return;
      }
    }
    throw new Error(`Could not find augment ${targetId} in seeded offers`);
  }

  it('manages deterministic AugmentManager offer cadence (solo 55s vs blitz 30s), selection, and max 3 cap', () => {
    const bus = new EventBus();
    const sounds: SoundEventId[] = [];
    const activateVfx: Array<{ position: Vec3Like; color: string }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:augment_activate', (ev) => activateVfx.push(ev));

    const mgrA = new AugmentManager(bus);
    const mgrB = new AugmentManager(new EventBus());
    mgrA.reset(1234, 'solo');
    mgrB.reset(1234, 'solo');

    // Solo cadence = 55s
    expect(AUGMENT_INTERVAL_DEFAULT).toBe(55);
    expect(AUGMENT_INTERVAL_BLITZ).toBe(30);
    expect(MAX_ACTIVE_AUGMENTS).toBe(3);

    mgrA.update(54);
    expect(mgrA.getPendingChoices()).toBeNull();
    mgrA.update(1);
    const soloFirst = mgrA.getPendingChoices();
    expect(soloFirst).not.toBeNull();
    expect(soloFirst![0]).not.toBe(soloFirst![1]);
    expect(sounds).toContain('augment_ready');

    // Deterministic matching seed/mode
    mgrB.update(55);
    expect(mgrB.getPendingChoices()).toEqual(soloFirst);

    // Selection with position emits augment_select + vfx:augment_activate
    const picked1 = mgrA.selectChoice(0, { x: 10, y: 2, z: -5 });
    expect(picked1).toBe(soloFirst![0]);
    expect(mgrA.hasAugment(picked1!)).toBe(true);
    expect(mgrA.getPendingChoices()).toBeNull();
    expect(mgrA.getActiveAugments()).toEqual([picked1]);
    expect(sounds).toContain('augment_select');
    expect(activateVfx.length).toBe(1);
    expect(activateVfx[0].color).toBe(
      AUGMENTS.find((a) => a.id === picked1)!.accentColor,
    );

    // Blitz cadence = 30s, max 3 augments cap
    mgrA.reset(5678, 'blitz');
    mgrA.update(29);
    expect(mgrA.getPendingChoices()).toBeNull();
    mgrA.update(1);
    const blitzOffer1 = mgrA.getPendingChoices()!;
    expect(blitzOffer1).not.toBeNull();
    const b1 = mgrA.selectChoice(1)!;

    mgrA.update(30, 60);
    const blitzOffer2 = mgrA.getPendingChoices()!;
    expect(blitzOffer2).not.toBeNull();
    expect(blitzOffer2).not.toContain(b1);
    const b2 = mgrA.selectChoice(0)!;

    mgrA.update(30, 90);
    const blitzOffer3 = mgrA.getPendingChoices()!;
    expect(blitzOffer3).not.toBeNull();
    expect(blitzOffer3).not.toContain(b1);
    expect(blitzOffer3).not.toContain(b2);
    mgrA.selectChoice(1);

    expect(mgrA.getActiveAugments().length).toBe(3);

    // 4th offer is blocked by MAX_ACTIVE_AUGMENTS = 3
    mgrA.update(120, 210);
    expect(mgrA.getPendingChoices()).toBeNull();
    expect(mgrA.forceOffer()).toBeNull();
    expect(mgrA.selectChoice(0)).toBeNull();
  });

  it('applies Reality Augment effects: parkour_boost, light_fingers, siphon_master, aerialist, demolisher, first_assault, and mechanic_overdrive', () => {
    // 1. light_fingers (-30% reload time), siphon_master (+75), and aerialist (>6m glider redeploy)
    {
      const { bus, weapons, player } = setupWave4Harness();
      const sounds: SoundEventId[] = [];
      const siphonAmounts: number[] = [];
      bus.on('sound:play', (ev) => sounds.push(ev.id));
      bus.on('combat:siphon', (ev) => siphonAmounts.push(ev.amount));

      player.teleport({ x: 0, y: 0, z: 0 });
      player.getInventory().addAmmo('medium', 90);
      player.getInventory().addItem({
        uid: 'ar_aug',
        weaponId: 'ar',
        rarity: 'rare',
        magAmmo: 10,
        stackCount: 1,
      });
      player.getInventory().setActiveSlot(1);

      acquireSpecificAugment(player, 'light_fingers');
      expect(player.getHudSnapshot().activeAugments).toContain('light_fingers');

      // AR base reloadTime = 2.1s -> with light_fingers = 1.47s (completes after 1.5s)
      player.pressKey('KeyR');
      expect(player.getHudSnapshot().reloadProgress).not.toBeNull();
      for (let i = 0; i < 31; i++) {
        player.update(0.05, (i + 1) * 0.05);
      }
      expect(player.getHudSnapshot().reloadProgress).toBeNull();
      expect(player.getInventory().getSlot(1)?.magAmmo).toBe(WEAPONS.ar.magSize);

      // Siphon Master: +75 health/shield on elim instead of +50
      acquireSpecificAugment(player, 'siphon_master');
      player.applyDamage({
        targetId: 'player',
        attackerId: 'bot_dmg',
        attackerName: 'Bot',
        weaponId: 'ar',
        rarity: 'common',
        damage: 60,
        hpDamage: 60,
        shieldDamage: 0,
        isHeadshot: false,
        isElimination: false,
        hitPoint: { x: 0, y: 1, z: -5 },
        distance: 5,
      }); // HP = 40, Shield = 0
      const botTarget: CombatActor = {
        id: 'bot_siphon',
        name: 'SiphonBot',
        position: { x: 0, y: 0, z: -12 },
        eyePos: { x: 0, y: 1.6, z: -12 },
        hp: 20,
        shield: 0,
        radius: 0.42,
        height: 1.85,
        alive: true,
      };
      weapons.registerActorsProvider(() => [player.getCombatActor(), botTarget]);
      weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: player.getInventory().getSlot(1)!,
        origin: { x: 0, y: 1.2, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
      });
      expect(botTarget.alive).toBe(false);
      // 40 + 75 = 100 HP + 15 Shield
      expect(player.getHealth()).toBe(100);
      expect(player.getShield()).toBe(15);
      expect(siphonAmounts[0]).toBe(75);

      // Aerialist: <= 6m does NOT deploy; > 6m deploys glider cleanly
      acquireSpecificAugment(player, 'aerialist');
      player.teleport({ x: 0, y: 4.0, z: 0 });
      player.update(0.016, 2.0);
      player.pressKey('Space');
      expect(player.getPhase()).toBe('playing');

      player.teleport({ x: 0, y: 10.0, z: 0 });
      player.update(0.016, 2.05);
      expect(player.getHudSnapshot().canDeployGlider).toBe(true);
      player.pressKey('Space');
      expect(player.getPhase()).toBe('gliding');
      expect(sounds).toContain('glider_deploy');
    }

    // 2. first_assault (+25% full mag first shot) & demolisher (+30% structure & vehicle dmg)
    {
      const { building, weapons, player } = setupWave4Harness();
      player.teleport({ x: 0, y: 0, z: 0 });

      acquireSpecificAugment(player, 'first_assault');

      const enemy: CombatActor = {
        id: 'bot_fa',
        name: 'Target',
        position: { x: 0, y: 0, z: -12 },
        eyePos: { x: 0, y: 1.6, z: -12 },
        hp: 300,
        shield: 0,
        maxHp: 300,
        radius: 0.42,
        height: 1.85,
        alive: true,
      };
      weapons.registerActorsProvider(() => [player.getCombatActor(), enemy]);

      const arItem: ItemInstance = {
        uid: 'ar_fa',
        weaponId: 'ar',
        rarity: 'common',
        magAmmo: 30,
        stackCount: 1,
      };
      // Shot 1 at full mag (30/30): round(30 * 1.25) = 38
      const shot1 = weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: arItem,
        origin: { x: 0, y: 1.1, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
        onAmmoConsumed: () => {
          arItem.magAmmo -= 1;
        },
      });
      expect(shot1.damageDealt).toBe(38);
      expect(arItem.magAmmo).toBe(29);

      // Shot 2 at 29/30: normal 30 damage
      const shot2 = weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: arItem,
        origin: { x: 0, y: 1.1, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
        onAmmoConsumed: () => {
          arItem.magAmmo -= 1;
        },
      });
      expect(shot2.damageDealt).toBe(30);

      // Sniper full mag (1/1): round(computeWeaponDamage('sniper','rare',12,false) * 1.25)
      const hpBeforeSniper = enemy.hp;
      const sniperItem: ItemInstance = {
        uid: 'sniper_fa',
        weaponId: 'sniper',
        rarity: 'rare',
        magAmmo: 1,
        stackCount: 1,
      };
      weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: sniperItem,
        origin: { x: 0, y: 1.1, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
        onAmmoConsumed: () => {
          sniperItem.magAmmo -= 1;
        },
      });
      for (let i = 0; i < 6; i++) weapons.update(0.02);
      const expectedBaseSniper = computeWeaponDamage('sniper', 'rare', 12, false);
      expect(hpBeforeSniper - enemy.hp).toBe(Math.round(expectedBaseSniper * 1.25));

      // Demolisher: +30% structure damage on BuildPiece (33 * 1.3 = 43) & vehicle damage
      acquireSpecificAugment(player, 'demolisher');
      const wall = building.placePieceForEntity('bot', 'wall', 'metal', 0, 0, -1, 'N', 0)!;
      const wallHpBefore = wall.hp;
      weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: { uid: 'ar_dem', weaponId: 'ar', rarity: 'common', magAmmo: 30, stackCount: 1 },
        origin: { x: 2, y: 1.2, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
      });
      expect(wallHpBefore - wall.hp).toBe(Math.round(33 * 1.3));

      const veh: VehicleEntity = {
        id: 'veh_dem',
        kind: 'hover_atv',
        x: 10,
        y: 0,
        z: -8,
        yaw: 0,
        pitch: 0,
        roll: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        hp: 400,
        maxHp: 400,
        boostCharge: 1,
        isBoosting: false,
        driverId: null,
        destroyed: false,
      };
      const vBridge: VehicleBridge = {
        getVehicles: () => [veh],
        enterVehicle: () => false,
        exitVehicle: () => null,
        driveVehicle: () => {},
        damageVehicle: (_id, dmg) => {
          veh.hp -= dmg;
          return true;
        },
      };
      weapons.setVehicleBridge(vBridge);
      weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: { uid: 'ar_dem_v', weaponId: 'ar', rarity: 'common', magAmmo: 30, stackCount: 1 },
        origin: { x: 10, y: 0.6, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
      });
      expect(400 - veh.hp).toBe(Math.round(33 * 1.3));
    }

    // 3. parkour_boost (+35% sprint jump + 0.84x gravity) & mechanic_overdrive (+25% speed & 4 HP/s repair)
    {
      const baseHarness = setupWave4Harness();
      baseHarness.player.teleport({ x: 0, y: 0, z: 0 });
      baseHarness.player.pressKey('ShiftLeft');
      baseHarness.player.pressKey('KeyW');
      baseHarness.player.update(0.03, 0.03);
      baseHarness.player.pressKey('Space');
      const baseJumpVy = baseHarness.player.getCharacterRenderState().velocityY ?? 0;

      const parkourHarness = setupWave4Harness();
      parkourHarness.player.teleport({ x: 0, y: 0, z: 0 });
      acquireSpecificAugment(parkourHarness.player, 'parkour_boost');
      parkourHarness.player.pressKey('ShiftLeft');
      parkourHarness.player.pressKey('KeyW');
      parkourHarness.player.update(0.03, 0.03);
      parkourHarness.player.pressKey('Space');
      const boostedJumpVy =
        parkourHarness.player.getCharacterRenderState().velocityY ?? 0;
      expect(boostedJumpVy).toBeCloseTo(baseJumpVy * 1.35, 1);

      let basePeakY = 0;
      let parkourPeakY = 0;
      for (let i = 0; i < 30; i++) {
        baseHarness.player.update(0.03, 0.06 + i * 0.03);
        parkourHarness.player.update(0.03, 0.06 + i * 0.03);
        basePeakY = Math.max(basePeakY, baseHarness.player.getPosition().y);
        parkourPeakY = Math.max(parkourPeakY, parkourHarness.player.getPosition().y);
      }
      expect(parkourPeakY).toBeGreaterThan(basePeakY + 1.2);

      // Mechanic Overdrive: +25% speed & 4 HP/s self-repair
      const veh: VehicleEntity = {
        id: 'veh_mo',
        kind: 'hover_atv',
        x: 0,
        y: 0,
        z: -2.0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        hp: 300,
        maxHp: 400,
        boostCharge: 1,
        isBoosting: false,
        driverId: null,
        destroyed: false,
      };
      const vBridge: VehicleBridge = {
        getVehicles: () => [veh],
        enterVehicle: (_id, driverId) => {
          veh.driverId = driverId;
          return true;
        },
        exitVehicle: () => {
          veh.driverId = null;
          return { x: veh.x, y: veh.y, z: veh.z };
        },
        driveVehicle: (_id, throttle, _steer, _boost, dt) => {
          veh.vx = 0;
          veh.vz = throttle * 16;
          veh.z += veh.vz * dt;
        },
        damageVehicle: () => true,
      };
      parkourHarness.player.setVehicleBridge(vBridge);
      acquireSpecificAugment(parkourHarness.player, 'mechanic_overdrive');
      parkourHarness.player.teleport({ x: 0, y: 0, z: 0 });
      parkourHarness.player.update(0.016, 0.5);
      parkourHarness.player.pressKey('KeyE');
      expect(parkourHarness.player.getActiveVehicleId()).toBe('veh_mo');

      parkourHarness.player.pressKey('KeyW');
      for (let i = 0; i < 20; i++) {
        parkourHarness.player.update(0.05, 0.6 + i * 0.05);
      }
      // 1s driving: base speed 16 * 1.25 = 20 m/s = 72 km/h, +4 HP/s repair -> 304 HP
      expect(parkourHarness.player.getHudSnapshot().vehicle?.speedKmh).toBe(72);
      expect(veh.z).toBeCloseTo(18.0, 1);
      expect(veh.hp).toBeCloseTo(304, 1);
    }
  });

  it('optimizes setPropColliders with 2D spatial grid for O(1) movement and raycastWorld lookups', () => {
    const { collision } = setupWave4Harness();
    const boxes: ColliderBox[] = [];
    for (let i = 0; i < 400; i++) {
      const gx = ((i % 20) - 10) * 32 + 8;
      const gz = (Math.floor(i / 20) - 10) * 32 + 8;
      boxes.push({
        id: `prop_grid_${i}`,
        minX: gx - 0.6,
        minY: 0,
        minZ: gz - 0.6,
        maxX: gx + 0.6,
        maxY: 2.0,
        maxZ: gz + 0.6,
        material: 'metal',
      });
    }
    boxes.push({
      id: 'barrel_center',
      minX: -0.6,
      minY: 0,
      minZ: -10.6,
      maxX: 0.6,
      maxY: 1.5,
      maxZ: -9.4,
      material: 'metal',
    });
    collision.setPropColliders(boxes);

    const rayHit = collision.raycastWorld(
      { x: 0, y: 0.8, z: 0 },
      { x: 0, y: 0, z: -1 },
      50,
    );
    expect(rayHit.hit).toBe(true);
    expect(rayHit.targetType).toBe('prop');
    expect(rayHit.targetId).toBe('barrel_center');
    expect(rayHit.distance).toBeCloseTo(9.4, 2);

    const moveRes = collision.resolveCharacterMovement(
      { x: 0, y: 0, z: -9.1 },
      { x: 0, y: 0, z: -8 },
      PLAYER_RADIUS,
      PLAYER_HEIGHT,
      0.05,
    );
    expect(moveRes.position.z).toBeGreaterThanOrEqual(-9.4 + PLAYER_RADIUS - 0.02);
  });

  it('warps player into skydiving with fall immunity on Sky Rift entry (auto <=2.2m and [E] <=3.8m)', () => {
    const { bus, player } = setupWave4Harness();
    const sounds: SoundEventId[] = [];
    const riftVfx: Array<{ position: Vec3Like; skyPosition: Vec3Like }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:rift_tear', (ev) => riftVfx.push(ev));

    const bridge = createMockRiftCaptureBridge({
      rifts: [
        {
          id: 'rift_1',
          poiId: 'skyline_spire',
          x: 0,
          y: 0,
          z: -3.2,
          active: true,
          openRemainingSec: 0,
          cooldownSec: 0,
        },
        {
          id: 'rift_2',
          poiId: 'frostpeak_citadel',
          x: 30,
          y: 0,
          z: 0,
          active: true,
          openRemainingSec: 0,
          cooldownSec: 0,
        },
      ],
    });
    player.setRiftCaptureBridge(bridge);

    // Within 3.8m -> shows ENTER SKY RIFT prompt & triggers on KeyE
    player.teleport({ x: 0, y: 0, z: 0 });
    player.update(0.016, 0.016);
    expect(player.getInteractPrompt()?.label).toBe('ENTER SKY RIFT');

    player.pressKey('KeyE');
    expect(player.getPhase()).toBe('skydiving');
    expect(player.isFallImmune()).toBe(true);
    expect(player.getPosition().y).toBeCloseTo(92, 1);
    expect(sounds).toContain('rift_teleport');
    expect(riftVfx.length).toBe(1);
    expect(riftVfx[0].skyPosition.y).toBeCloseTo(92, 1);

    // Auto-trigger on walking within <= 2.2m of rift_2
    player.teleport({ x: 30, y: 0, z: 1.8 });
    for (let i = 0; i < 25; i++) {
      player.update(0.05, 0.2 + i * 0.05); // Wait out 1.0s riftCooldown
      if (player.getPhase() === 'skydiving') break;
    }
    expect(player.getPhase()).toBe('skydiving');
    expect(player.getPosition().y).toBeCloseTo(92, 1);
  });

  it('advances POI Capture Point within 6.5m, emits flag_tick, flag_captured, vfx:flag_captured, and updates poisCaptured', () => {
    const { bus, weapons, player } = setupWave4Harness();
    const sounds: SoundEventId[] = [];
    const flagVfx: Array<{ position: Vec3Like; poiName: string }> = [];
    const capturedCalls: Array<{ poiName: string; lootPos?: Vec3Like }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:flag_captured', (ev) => flagVfx.push(ev));

    const bridge = createMockRiftCaptureBridge({
      capturePoints: [
        {
          id: 'cp_metro',
          poiId: 'metro_towers',
          poiName: 'Metro Towers',
          x: 0,
          y: 0,
          z: -4.0,
          radius: 6.5,
          progress: 0,
          captured: false,
          ownerId: null,
          ownerName: null,
        },
      ],
    });
    player.setRiftCaptureBridge(bridge);
    player.setOnPoiCaptured((poiName, lootPos) => {
      capturedCalls.push({ poiName, lootPos });
    });

    const contestingEnemy: CombatActor = {
      id: 'bot_contest',
      name: 'Contester',
      position: { x: 1.5, y: 0, z: -4.0 },
      eyePos: { x: 1.5, y: 1.6, z: -4.0 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), contestingEnemy]);

    player.teleport({ x: 0, y: 0, z: 0 });
    let t = 0;
    for (let i = 0; i < 40; i++) {
      t += 0.05;
      player.update(0.05, t); // 2.0s inside capture ring
    }
    const midSnap = player.getHudSnapshot();
    expect(midSnap.captureStatus).not.toBeNull();
    expect(midSnap.captureStatus?.poiName).toBe('Metro Towers');
    expect(midSnap.captureStatus?.progress).toBeGreaterThan(0.14);
    expect(midSnap.captureStatus?.captured).toBe(false);
    expect(midSnap.captureStatus?.contested).toBe(true);
    expect(sounds.filter((s) => s === 'flag_tick').length).toBeGreaterThanOrEqual(2);

    // Enemy leaves -> contested clears and capture finishes after remaining ~10s
    contestingEnemy.alive = false;
    for (let i = 0; i < 210; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(bridge.capturePoints[0].captured).toBe(true);
    expect(sounds).toContain('flag_captured');
    expect(flagVfx.length).toBe(1);
    expect(flagVfx[0].poiName).toBe('Metro Towers');
    expect(player.getStats().poisCaptured).toBe(1);
    expect(capturedCalls.length).toBe(1);
    expect(capturedCalls[0].poiName).toBe('Metro Towers');
    expect(capturedCalls[0].lootPos).toEqual({ x: 0, y: 0.6, z: -4.0 });
  });

  it('detonates Explosive Fuel Barrels via hitscan, pickaxe, and chain splash across 6.8m blastRadius', () => {
    const { bus, building, weapons, player } = setupWave4Harness();
    const sounds: SoundEventId[] = [];
    const explosions: Array<{ position: Vec3Like; radius: number }> = [];
    const shakes: number[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:explosion', (ev) => explosions.push(ev));
    bus.on('vfx:camera_shake', (ev) => shakes.push(ev.intensity));

    const bridge = createMockRiftCaptureBridge({
      explosiveBarrels: [
        {
          id: 'exp_1',
          x: 0,
          y: 0,
          z: -6,
          hp: 35,
          maxHp: 35,
          blastRadius: 6.8,
          blastDamage: 85,
          exploded: false,
        },
        {
          id: 'exp_chain',
          x: 3.0,
          y: 0,
          z: -6,
          hp: 35,
          maxHp: 35,
          blastRadius: 6.8,
          blastDamage: 85,
          exploded: false,
        },
        {
          id: 'exp_pick',
          x: 0,
          y: 0,
          z: 2.0,
          hp: 35,
          maxHp: 35,
          blastRadius: 6.8,
          blastDamage: 85,
          exploded: false,
        },
      ],
    });
    weapons.setRiftCaptureBridge(bridge);

    const nearbyBot: CombatActor = {
      id: 'bot_exp',
      name: 'BarrelVictim',
      position: { x: 1.5, y: 0, z: -6 },
      eyePos: { x: 1.5, y: 1.6, z: -6 },
      hp: 100,
      shield: 50,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const nearbyVeh: VehicleEntity = {
      id: 'veh_exp',
      kind: 'hover_atv',
      x: -2.5,
      y: 0,
      z: -6,
      yaw: 0,
      pitch: 0,
      roll: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      hp: 400,
      maxHp: 400,
      boostCharge: 1,
      isBoosting: false,
      driverId: null,
      destroyed: false,
    };
    weapons.setVehicleBridge({
      getVehicles: () => [nearbyVeh],
      enterVehicle: () => false,
      exitVehicle: () => null,
      driveVehicle: () => {},
      damageVehicle: (_id, dmg) => {
        nearbyVeh.hp -= dmg;
        return true;
      },
    });
    weapons.registerActorsProvider(() => [player.getCombatActor(), nearbyBot]);
    const wall = building.placePieceForEntity('bot', 'wall', 'wood', 0, 0, -2, 'N', 0)!;

    // 1. Hitscan AR shot (33 dmg) weakens exp_1 to 2 HP, 2nd shot explodes and chains to exp_chain
    const arItem: ItemInstance = {
      uid: 'ar_exp',
      weaponId: 'ar',
      rarity: 'common',
      magAmmo: 30,
      stackCount: 1,
    };
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: arItem,
      origin: { x: 0, y: 0.7, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(bridge.explosiveBarrels[0].hp).toBe(2);
    expect(bridge.explosiveBarrels[0].exploded).toBe(false);

    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: arItem,
      origin: { x: 0, y: 0.7, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(bridge.explosiveBarrels[0].exploded).toBe(true);
    expect(bridge.explosiveBarrels[1].exploded).toBe(true); // chained explosion!
    expect(sounds).toContain('explosion');
    expect(sounds).toContain('barrel_explode');
    expect(explosions.length).toBe(2);
    expect(shakes.length).toBeGreaterThan(0);
    expect(nearbyBot.shield + nearbyBot.hp).toBeLessThan(150);
    expect(nearbyVeh.hp).toBeLessThan(400);
    expect(wall.hp).toBeLessThan(wall.maxHp);

    // 2. Pickaxe swing (50 structureDamage) explodes exp_pick within 3.2m
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: { uid: 'pick_exp', weaponId: 'pickaxe', rarity: 'common', magAmmo: 0, stackCount: 1 },
      origin: { x: 0, y: 0.7, z: 0 },
      aimDir: { x: 0, y: 0, z: 1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(bridge.explosiveBarrels[2].exploded).toBe(true);
  });

  it('places 16s 3D Tactical Pings on KeyQ and Middle Mouse with danger/loot/move tagging', () => {
    const { bus, propsBridge, weapons, player } = setupWave4Harness();
    const sounds: SoundEventId[] = [];
    const pingVfx: Array<{ position: Vec3Like; kind: 'move' | 'danger' | 'loot'; label: string }> =
      [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:tactical_ping', (ev) => pingVfx.push(ev));

    player.teleport({ x: 0, y: 0, z: 0 });
    player.setLook(Math.PI, -0.15); // Looking down at terrain ahead (-Z)

    // 1. KeyQ on empty terrain -> 'move'
    player.pressKey('KeyQ');
    const moveSnap = player.getHudSnapshot().tacticalPing;
    expect(moveSnap).not.toBeNull();
    expect(moveSnap!.kind).toBe('move');
    expect(moveSnap!.distance).toBeGreaterThan(0);
    expect(sounds).toContain('tactical_ping');
    expect(pingVfx[0].kind).toBe('move');

    // 2. KeyQ aimed at unopened chest -> 'loot'
    propsBridge.chests.push({
      id: 'chest_ping',
      x: 0,
      y: 0,
      z: -12,
      rotationY: 0,
      opened: false,
      openProgress: 0,
    });
    player.setLook(Math.PI, -0.11);
    player.pressKey('KeyQ');
    expect(player.getHudSnapshot().tacticalPing?.kind).toBe('loot');
    expect(player.getHudSnapshot().tacticalPing?.label).toBe('CHEST');

    // 3. Middle mouse aimed at alive enemy -> 'danger'
    const enemy: CombatActor = {
      id: 'bot_ping',
      name: 'PingedEnemy',
      position: { x: 0, y: 0, z: -20 },
      eyePos: { x: 0, y: 1.6, z: -20 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), enemy]);
    player.setLook(Math.PI, 0);
    player.setMouseButton(1, true);
    expect(player.getHudSnapshot().tacticalPing?.kind).toBe('danger');
    expect(player.getHudSnapshot().tacticalPing?.distance).toBeCloseTo(20, 0);

    // 4. Expires cleanly after 16s
    for (let i = 0; i < 325; i++) {
      player.update(0.05, 1.0 + i * 0.05);
    }
    expect(player.getHudSnapshot().tacticalPing).toBeNull();
  });
});

describe('Wave 5 Gameplay Systems (Gold Economy, Kinetic Blade, Tactical DMR, Loot Island)', () => {
  function setupWave5Harness(terrain: TerrainQuery = createFlatTerrain(() => 0)) {
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'Wave5Tester');
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  function createMockEconomyBridge(init?: {
    vendingMachines?: VendingMachineEntity[];
    npcs?: NpcSpecialistEntity[];
    lootIsland?: Partial<LootIslandState>;
  }): WorldEconomyBridge & {
    vendingMachines: VendingMachineEntity[];
    npcs: NpcSpecialistEntity[];
    lootIsland: LootIslandState;
    purchaseCalls: number;
    hireCalls: number;
  } {
    const vendingMachines = init?.vendingMachines ?? [];
    const npcs = init?.npcs ?? [];
    const lootIsland: LootIslandState = {
      active: false,
      spawnedAtSec: 0,
      x: 0,
      y: 24,
      z: 0,
      radius: 14,
      captured: false,
      captureProgress: 0,
      ...init?.lootIsland,
    };
    let itemSeq = 1;
    const bridge = {
      vendingMachines,
      npcs,
      lootIsland,
      purchaseCalls: 0,
      hireCalls: 0,
      getVendingMachines: () => vendingMachines,
      purchaseFromVendingMachine: (id: string) => {
        bridge.purchaseCalls += 1;
        const vm = vendingMachines.find((m) => m.id === id);
        if (!vm || vm.stock <= 0) return null;
        vm.stock -= 1;
        const def = WEAPONS[vm.offerWeaponId];
        return {
          item: {
            uid: `vm_item_${itemSeq++}`,
            weaponId: vm.offerWeaponId,
            rarity: vm.offerRarity,
            magAmmo: def.magSize,
            stackCount: 1,
          },
          priceGold: vm.priceGold,
          position: { x: vm.x, y: vm.y + 1.0, z: vm.z },
        };
      },
      getNpcSpecialists: () => npcs,
      hireNpcSpecialist: (id: string, playerId: string) => {
        bridge.hireCalls += 1;
        const npc = npcs.find((n) => n.id === id);
        if (!npc || npc.hiredBy) return null;
        npc.hiredBy = playerId;
        return { ...npc };
      },
      getLootIslandState: () => lootIsland,
      advanceLootIslandCapture: (dt: number) => {
        if (!lootIsland.active || lootIsland.captured) {
          return { capturedNow: false };
        }
        lootIsland.captureProgress = Math.min(1, lootIsland.captureProgress + dt / 10);
        if (lootIsland.captureProgress >= 1 - 1e-6) {
          lootIsland.captureProgress = 1;
          lootIsland.captured = true;
          return {
            capturedNow: true,
            lootPos: { x: lootIsland.x, y: lootIsland.y + 0.8, z: lootIsland.z },
          };
        }
        return { capturedNow: false };
      },
    };
    return bridge;
  }

  it('tracks Gold Bars via setGoldBars/addGoldBars, clamping [0, MAX_GOLD_BARS] and stats.goldEarned', () => {
    const { bus, player } = setupWave5Harness();
    const sounds: SoundEventId[] = [];
    const goldBursts: Array<{ position: Vec3Like; amount: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:gold_burst', (ev) => goldBursts.push(ev));

    expect(player.getGoldBars()).toBe(STARTING_GOLD_BARS);
    expect(player.getHudSnapshot().goldBars).toBe(STARTING_GOLD_BARS);
    expect(player.getStats().goldEarned).toBe(0);

    player.setGoldBars(100);
    expect(player.getGoldBars()).toBe(100);
    expect(player.getStats().goldEarned).toBe(0);

    const afterAdd = player.addGoldBars(150, { x: 4, y: 1, z: -2 });
    expect(afterAdd).toBe(250);
    expect(player.getStats().goldEarned).toBe(150);
    expect(sounds).toContain('gold_pickup');
    expect(goldBursts.length).toBe(1);
    expect(goldBursts[0]).toEqual({ position: { x: 4, y: 1, z: -2 }, amount: 150 });

    // Negative delta reduces balance without subtracting goldEarned and clamps at 0
    player.addGoldBars(-80);
    expect(player.getGoldBars()).toBe(170);
    expect(player.getStats().goldEarned).toBe(150);
    player.addGoldBars(-9999);
    expect(player.getGoldBars()).toBe(0);

    // Positive overflow clamps at MAX_GOLD_BARS
    player.setGoldBars(MAX_GOLD_BARS - 20);
    expect(player.addGoldBars(500)).toBe(MAX_GOLD_BARS);
    expect(player.getHudSnapshot().goldBars).toBe(MAX_GOLD_BARS);
  });

  it('handles Vending Machine prompt, purchase, insufficient Gold guard, and full-inventory LootDrop fallback', () => {
    const { bus, propsBridge, player } = setupWave5Harness();
    const sounds: SoundEventId[] = [];
    const goldBursts: Array<{ position: Vec3Like; amount: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:gold_burst', (ev) => goldBursts.push(ev));

    const economy = createMockEconomyBridge({
      vendingMachines: [
        {
          id: 'vm_dmr',
          poiId: 'metro_towers',
          kind: 'weapon',
          x: 0,
          y: 0,
          z: -2.5,
          rotationY: 0,
          offerWeaponId: 'tactical_dmr',
          offerRarity: 'epic',
          priceGold: 175,
          stock: 2,
        },
      ],
    });
    player.setEconomyBridge(economy);
    player.teleport({ x: 0, y: 0, z: 0 });
    player.update(0.016, 0.016);

    const prompt = player.getInteractPrompt();
    expect(prompt?.label).toBe('BUY TACTICAL DMR (175 GOLD)');
    expect(prompt?.rarity).toBe('epic');

    // Insufficient Gold guard
    player.setGoldBars(100);
    player.pressKey('KeyE');
    expect(economy.purchaseCalls).toBe(0);
    expect(player.getGoldBars()).toBe(100);
    expect(economy.vendingMachines[0].stock).toBe(2);
    expect(sounds).toContain('dryfire');

    // Successful purchase
    player.setGoldBars(300);
    player.pressKey('KeyE');
    expect(economy.purchaseCalls).toBe(1);
    expect(player.getGoldBars()).toBe(125);
    expect(economy.vendingMachines[0].stock).toBe(1);
    expect(player.getInventory().getSlot(1)?.weaponId).toBe('tactical_dmr');
    expect(player.getInventory().getSlot(1)?.rarity).toBe('epic');
    expect(sounds).toContain('vending_buy');
    expect(goldBursts.length).toBe(1);

    // Fill remaining slots 2..5 and select slot 0 (pickaxe) -> full inventory spawns LootDrop!
    player.getInventory().addItem({ uid: 'f2', weaponId: 'ar', rarity: 'rare', magAmmo: 30, stackCount: 1 });
    player.getInventory().addItem({ uid: 'f3', weaponId: 'smg', rarity: 'rare', magAmmo: 30, stackCount: 1 });
    player.getInventory().addItem({ uid: 'f4', weaponId: 'pump_shotgun', rarity: 'rare', magAmmo: 5, stackCount: 1 });
    player.getInventory().addItem({ uid: 'f5', weaponId: 'sniper', rarity: 'rare', magAmmo: 1, stackCount: 1 });
    player.pressKey('Digit1'); // Hold pickaxe (slot 0)
    player.setGoldBars(200);
    player.update(0.016, 0.05);

    player.pressKey('KeyE');
    expect(player.getGoldBars()).toBe(25);
    expect(economy.vendingMachines[0].stock).toBe(0);
    expect(propsBridge.drops.some((d) => d.item?.weaponId === 'tactical_dmr')).toBe(true);

    // Clear ground loot drop so we verify sold-out vending machine produces no prompt
    propsBridge.drops.length = 0;
    player.update(0.016, 0.1);
    expect(player.getInteractPrompt()).toBeNull();
  });

  it('handles NPC Specialist hiring, insufficient Gold guard, and onNpcHired callback', () => {
    const { bus, player } = setupWave5Harness();
    const sounds: SoundEventId[] = [];
    const goldBursts: Array<{ position: Vec3Like; amount: number }> = [];
    const hiredList: NpcSpecialistEntity[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:gold_burst', (ev) => goldBursts.push(ev));

    const economy = createMockEconomyBridge({
      npcs: [
        {
          id: 'npc_scout',
          name: 'Recon Nova',
          role: 'scout',
          poiId: 'whispering_pines',
          skinId: 'neon_drift',
          x: 0,
          y: 0,
          z: -3.2,
          priceGold: 200,
          hiredBy: null,
        },
      ],
    });
    player.setEconomyBridge(economy);
    player.setOnNpcHired((npc) => hiredList.push(npc));
    player.teleport({ x: 0, y: 0, z: 0 });
    player.update(0.016, 0.016);

    expect(player.getInteractPrompt()?.label).toBe('HIRE Recon Nova • SCOUT (200 GOLD)');

    // Insufficient Gold guard
    player.setGoldBars(150);
    player.pressKey('KeyE');
    expect(economy.hireCalls).toBe(0);
    expect(economy.npcs[0].hiredBy).toBeNull();
    expect(hiredList.length).toBe(0);
    expect(sounds).toContain('dryfire');

    // Hire with sufficient Gold
    player.setGoldBars(260);
    player.pressKey('KeyE');
    expect(economy.hireCalls).toBe(1);
    expect(player.getGoldBars()).toBe(60);
    expect(economy.npcs[0].hiredBy).toBe('player');
    expect(hiredList.length).toBe(1);
    expect(hiredList[0].id).toBe('npc_scout');
    expect(sounds).toContain('ally_hired');
    expect(goldBursts.length).toBe(1);

    player.update(0.016, 0.05);
    expect(player.getInteractPrompt()).toBeNull();
  });

  it('supports Kinetic Blade LMB cleave, 3-charge RMB dash with path damage & fall immunity, and 9s recharge', () => {
    const { bus, building, propsBridge, weapons, player } = setupWave5Harness();
    const sounds: SoundEventId[] = [];
    const dashVfx: Array<{ from: Vec3Like; to: Vec3Like }> = [];
    const tracers: Array<{ from: Vec3Like; to: Vec3Like }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:kinetic_dash', (ev) => dashVfx.push(ev));
    bus.on('vfx:tracer', (ev) => tracers.push(ev));

    player.teleport({ x: 2, y: 0, z: 0 });
    player.setLook(Math.PI, 0); // Looking along -Z
    player.getInventory().addItem({
      uid: 'kb_1',
      weaponId: 'kinetic_blade',
      rarity: 'epic',
      magAmmo: 0,
      stackCount: 1,
    });
    expect(player.getHudSnapshot().kineticDashCharges).toBeNull(); // still on pickaxe slot 0

    player.pressKey('Digit2');
    expect(player.getHudSnapshot().activeWeaponId).toBe('kinetic_blade');
    expect(player.getHudSnapshot().kineticDashCharges).toBe(3);

    const closeEnemy: CombatActor = {
      id: 'bot_kb_1',
      name: 'SlashTarget',
      position: { x: 2, y: 0, z: -2.8 },
      eyePos: { x: 2, y: 1.6, z: -2.8 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const dashEnemy: CombatActor = {
      id: 'bot_kb_2',
      name: 'DashTarget',
      position: { x: 3.4, y: 0, z: -7.0 }, // ~1.4m offset (< 2.8m) along dash path
      eyePos: { x: 3.4, y: 1.6, z: -7.0 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const farEnemy: CombatActor = {
      id: 'bot_kb_far',
      name: 'FarTarget',
      position: { x: 8.5, y: 0, z: -6.0 },
      eyePos: { x: 8.5, y: 1.6, z: -6.0 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [
      player.getCombatActor(),
      closeEnemy,
      dashEnemy,
      farEnemy,
    ]);

    // LMB cleave hits closeEnemy (45 dmg) and emits 'kinetic_slash' without tracer
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);
    expect(closeEnemy.hp).toBe(55);
    expect(farEnemy.hp).toBe(100);
    expect(sounds).toContain('kinetic_slash');
    expect(tracers.length).toBe(0);

    // LMB cleave also deals 75 damage to props & builds within 3.8m at horizontal look
    propsBridge.props.push({
      id: 'crate_kb',
      kind: 'crate',
      material: 'wood',
      x: 2,
      y: 0,
      z: 2.5, // turn around (+Z) to cleave crate
      rotationY: 0,
      scale: 1,
      hp: 150,
      maxHp: 150,
      matYield: 20,
      radius: 0.8,
      height: 1.5,
      destroyed: false,
    });
    player.setLook(0, 0); // Looking straight +Z
    for (let i = 0; i < 12; i++) player.update(0.05, 0.05 * (i + 1)); // wait out fireCooldown
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);
    expect(propsBridge.props[0].hp).toBe(75);

    // Place a weak wood wall along -Z dash path (at z = -4, gx = 0, gz = -1)
    const weakWall = building.placePieceForEntity('bot', 'wall', 'wood', 0, 0, -1, 'N', 0)!;
    const wallHpBefore = weakWall.hp;

    // RMB dash back along -Z
    player.setLook(Math.PI, 0);
    player.setMouseButton(2, true);
    expect(player.getHudSnapshot().isAiming).toBe(false); // RMB does not ADS with kinetic blade
    expect(player.getHudSnapshot().kineticDashCharges).toBe(2);
    expect(player.isFallImmune()).toBe(true);
    expect(player.getCharacterRenderState().grounded).toBe(false);
    expect(player.getCharacterRenderState().velocityY).toBeGreaterThanOrEqual(7.5);
    expect(sounds).toContain('kinetic_dash');
    expect(dashVfx.length).toBe(1);
    expect(dashEnemy.hp).toBe(50); // 50 dash path damage
    expect(farEnemy.hp).toBe(100);
    expect(wallHpBefore - weakWall.hp).toBe(50); // 50 dmg to structure in dash path
    player.setMouseButton(2, false);

    // Consume remaining 2 charges -> 0 charges, 4th RMB dryfires
    player.setMouseButton(2, true);
    player.setMouseButton(2, false);
    player.setMouseButton(2, true);
    player.setMouseButton(2, false);
    expect(player.getHudSnapshot().kineticDashCharges).toBe(0);

    const dashCountBefore = dashVfx.length;
    player.setMouseButton(2, true);
    expect(player.getHudSnapshot().kineticDashCharges).toBe(0);
    expect(dashVfx.length).toBe(dashCountBefore);
    expect(sounds).toContain('dryfire');
    player.setMouseButton(2, false);

    // Step 9 seconds (180 * 0.05s) -> recharges 1 charge
    let t = 1.0;
    for (let i = 0; i < 180; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().kineticDashCharges).toBe(1);

    // Step another 18 seconds -> recharges to max 3 and caps at 3
    for (let i = 0; i < 400; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().kineticDashCharges).toBe(3);

    // Switching away returns null for kineticDashCharges
    player.pressKey('Digit1');
    expect(player.getHudSnapshot().kineticDashCharges).toBeNull();
  });

  it('fires Tactical DMR as hitscan rifle emitting shot_dmr with 1.85x headshot multiplier', () => {
    const { bus, weapons, player } = setupWave5Harness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    player.teleport({ x: 0, y: 0, z: 0 });
    player.setLook(Math.PI, 0);
    player.getInventory().addItem({
      uid: 'dmr_1',
      weaponId: 'tactical_dmr',
      rarity: 'epic',
      magAmmo: 10,
      stackCount: 1,
    });
    player.pressKey('Digit2');

    const enemy: CombatActor = {
      id: 'bot_dmr',
      name: 'DmrTarget',
      position: { x: 0, y: 0, z: -20 },
      eyePos: { x: 0, y: 1.6, z: -20 },
      hp: 200,
      shield: 0,
      maxHp: 200,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), enemy]);

    // Body shot via PlayerController LMB (eye y=1.63 hits upper torso/head, check deterministic fireWeapon too)
    const dmrItem = player.getInventory().getSlot(1)!;
    const bodyRes = weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: dmrItem,
      origin: { x: 0, y: 1.0, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
      onAmmoConsumed: () => {
        dmrItem.magAmmo -= 1;
      },
    });
    expect(bodyRes.fired).toBe(true);
    expect(bodyRes.shotsHit).toBe(1);
    expect(bodyRes.headshots).toBe(0);
    expect(bodyRes.damageDealt).toBe(computeWeaponDamage('tactical_dmr', 'epic', 20, false));
    expect(dmrItem.magAmmo).toBe(9);
    expect(sounds).toContain('shot_dmr');

    // Headshot via PlayerController LMB at head height (y ~ 1.63 matches headCenterY = 1.69)
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);
    expect(dmrItem.magAmmo).toBe(8);
    expect(enemy.hp).toBeLessThan(200 - bodyRes.damageDealt);
  });

  it('launches player on Loot Island updraft and completes 10s capture atop the island', () => {
    const { bus, collision, player } = setupWave5Harness();
    const sounds: SoundEventId[] = [];
    const flagVfx: Array<{ position: Vec3Like; poiName: string }> = [];
    const capturedPositions: Array<Vec3Like | undefined> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:flag_captured', (ev) => flagVfx.push(ev));

    const economy = createMockEconomyBridge({
      lootIsland: {
        active: true,
        spawnedAtSec: 30,
        x: 40,
        y: 24,
        z: 40,
        radius: 14,
        captured: false,
        captureProgress: 0,
      },
    });
    player.setEconomyBridge(economy);
    player.setOnLootIslandCaptured((lootPos) => capturedPositions.push(lootPos));

    // Provide island top deck collider at y = 24
    collision.setStaticColliders([
      {
        id: 'loot_island_deck',
        minX: 27.5,
        minY: 23.4,
        minZ: 27.5,
        maxX: 52.5,
        maxY: 24.0,
        maxZ: 52.5,
        material: 'brick',
      },
    ]);

    // 1. Standing on ground beneath island (<= 4.5m, grounded) triggers updraft
    player.teleport({ x: 41, y: 0, z: 40 });
    player.update(0.05, 0.05);
    expect(player.getCharacterRenderState().velocityY).toBeCloseTo(25, 1);
    expect(player.isFallImmune()).toBe(true);
    expect(player.getCharacterRenderState().grounded).toBe(false);
    expect(sounds).toContain('launch_pad');

    // 2. Standing atop island (<= radius * 0.75 = 10.5m, |dy| <= 3.5) captures over 10s
    player.teleport({ x: 40, y: 24, z: 42 });
    let t = 1.0;
    for (let i = 0; i < 40; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    const midSnap = player.getHudSnapshot();
    expect(midSnap.captureStatus?.poiName).toBe('Loot Island');
    expect(midSnap.captureStatus?.progress).toBeGreaterThan(0.18);
    expect(midSnap.captureStatus?.captured).toBe(false);
    expect(sounds).toContain('flag_tick');

    for (let i = 0; i < 165; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(economy.lootIsland.captured).toBe(true);
    expect(sounds).toContain('flag_captured');
    expect(flagVfx.length).toBe(1);
    expect(flagVfx[0].poiName).toBe('Loot Island');
    expect(capturedPositions.length).toBe(1);
    expect(capturedPositions[0]).toEqual({ x: 40, y: 24.8, z: 40 });
  });
});

describe('Wave 6 Gameplay Systems (Medallions, Twin-Mag, Boom Bow, Slurp Tanker, Victory Crown, Duos DBNO/Revive)', () => {
  function setupWave6Harness(terrain: TerrainQuery = createFlatTerrain(() => 0)) {
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'Wave6Tester');
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  function createMockChapterBridge(init?: {
    bunkers?: WeaponBunkerEntity[];
    tankers?: SlurpTankerEntity[];
    droppedMedallions?: DroppedMedallionEntity[];
    droppedCrowns?: DroppedCrownEntity[];
  }): WorldChapterBridge & {
    bunkers: WeaponBunkerEntity[];
    tankers: SlurpTankerEntity[];
    droppedMedallions: DroppedMedallionEntity[];
    droppedCrowns: DroppedCrownEntity[];
  } {
    const bunkers = init?.bunkers ?? [];
    const tankers = init?.tankers ?? [];
    const droppedMedallions = init?.droppedMedallions ?? [];
    const droppedCrowns = init?.droppedCrowns ?? [];
    return {
      bunkers,
      tankers,
      droppedMedallions,
      droppedCrowns,
      getWeaponBunkers: () => bunkers,
      lootWeaponBunker: (id) => {
        const b = bunkers.find((item) => item.id === id);
        if (!b || !b.unlocked || b.looted) return null;
        b.looted = true;
        return {
          weaponId: 'combat_smg',
          rarity: 'legendary',
          gold: 180,
          shieldRestore: 40,
        };
      },
      getSlurpTankers: () => tankers,
      damageSlurpTanker: (id, dmg) => {
        const st = tankers.find((item) => item.id === id);
        if (!st || st.destroyed || st.hp <= 0) return null;
        st.hp = Math.max(0, st.hp - dmg);
        const exploded = st.hp <= 0;
        if (exploded) st.destroyed = true;
        return {
          exploded,
          x: st.x,
          y: st.y + 1.5,
          z: st.z,
          radius: st.healRadius,
          healAmount: exploded ? st.healAmount : 0,
        };
      },
      getDroppedMedallions: () => droppedMedallions,
      collectNearbyMedallion: (x, z, maxDist) => {
        let best: DroppedMedallionEntity | null = null;
        let bestDist = maxDist;
        for (const dm of droppedMedallions) {
          if (dm.collected) continue;
          const d = Math.hypot(dm.x - x, dm.z - z);
          if (d <= bestDist) {
            bestDist = d;
            best = dm;
          }
        }
        if (!best) return null;
        best.collected = true;
        return best;
      },
      getDroppedCrowns: () => droppedCrowns,
      collectNearbyCrown: (x, z, maxDist) => {
        let best: DroppedCrownEntity | null = null;
        let bestDist = maxDist;
        for (const dc of droppedCrowns) {
          if (dc.collected) continue;
          const d = Math.hypot(dc.x - x, dc.z - z);
          if (d <= bestDist) {
            bestDist = d;
            best = dc;
          }
        }
        if (!best) return null;
        best.collected = true;
        return best;
      },
    };
  }

  it('supports all 3 Boss Medallions (siphon, agility, combat) with duplicate protection and stat buffs', () => {
    // 1. Medallion Siphon: passive +2/s shield up to 50 after >=4s out of combat & +25 siphon on elim
    {
      const { bus, weapons, player } = setupWave6Harness();
      const sounds: SoundEventId[] = [];
      const siphonAmounts: number[] = [];
      bus.on('sound:play', (ev) => sounds.push(ev.id));
      bus.on('combat:siphon', (ev) => siphonAmounts.push(ev.amount));

      player.teleport({ x: 0, y: 0, z: 0 });
      player.update(0.05, 1.0);
      expect(player.addMedallion('medallion_siphon')).toBe(true);
      expect(player.addMedallion('medallion_siphon')).toBe(false);
      expect(player.hasMedallion('medallion_siphon')).toBe(true);
      expect(player.getMedallions()).toEqual(['medallion_siphon']);
      expect(player.getHudSnapshot().medallions).toEqual(['medallion_siphon']);
      expect(player.getCharacterRenderState().medallionCount).toBe(1);
      expect(sounds).toContain('medallion_pickup');

      player.applyDamage({
        targetId: 'player',
        attackerId: 'bot_1',
        attackerName: 'Bot1',
        weaponId: 'ar',
        rarity: 'common',
        damage: 40,
        hpDamage: 40,
        shieldDamage: 0,
        isHeadshot: false,
        isElimination: false,
        hitPoint: { x: 0, y: 1, z: -5 },
        distance: 5,
      }); // HP = 60, lastDamageTime = 1.0

      // At t = 4.5s (3.5s < 4s) -> no shield regen yet
      let t = 1.0;
      for (let i = 0; i < 70; i++) {
        t += 0.05;
        player.update(0.05, t);
      }
      expect(player.getShield()).toBe(0);

      // Advance 0.5s to reach the exact 4.0s out-of-combat threshold (t = 5.0s)
      for (let i = 0; i < 10; i++) {
        t += 0.05;
        player.update(0.05, t);
      }

      // Next 5s out of combat -> regens +10 shield at +2/s
      for (let i = 0; i < 100; i++) {
        t += 0.05;
        player.update(0.05, t);
      }
      expect(player.getShield()).toBeCloseTo(10, 1);

      // Cap at 50 shield
      for (let i = 0; i < 500; i++) {
        t += 0.05;
        player.update(0.05, t);
      }
      expect(player.getShield()).toBe(50);

      // Elimination siphon grants 50 + 25 = 75 total (+40 HP to 100, +35 Shield to 85)
      const target: CombatActor = {
        id: 'bot_siphon_m',
        name: 'Target',
        position: { x: 0, y: 0, z: -10 },
        eyePos: { x: 0, y: 1.6, z: -10 },
        hp: 20,
        shield: 0,
        radius: 0.42,
        height: 1.85,
        alive: true,
      };
      weapons.registerActorsProvider(() => [player.getCombatActor(), target]);
      weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: { uid: 'ar_s', weaponId: 'ar', rarity: 'common', magAmmo: 30, stackCount: 1 },
        origin: { x: 0, y: 1.1, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
      });
      expect(target.alive).toBe(false);
      expect(player.getHealth()).toBe(100);
      expect(player.getShield()).toBe(85);
      expect(siphonAmounts[0]).toBe(75);
    }

    // 2. Medallion Agility: +15% sprint speed, +25% stamina regen, +22% sprint jump impulse
    {
      const base = setupWave6Harness();
      const agile = setupWave6Harness();
      agile.player.addMedallion('medallion_agility');

      base.player.teleport({ x: 0, y: 0, z: 0 });
      agile.player.teleport({ x: 0, y: 0, z: 0 });
      base.player.setLook(Math.PI, 0);
      agile.player.setLook(Math.PI, 0);

      base.player.pressKey('ShiftLeft');
      base.player.pressKey('KeyW');
      agile.player.pressKey('ShiftLeft');
      agile.player.pressKey('KeyW');
      for (let i = 0; i < 60; i++) {
        base.player.update(0.05, (i + 1) * 0.05);
        agile.player.update(0.05, (i + 1) * 0.05);
      }
      const baseSpeed = base.player.getCharacterRenderState().moveSpeed;
      const agileSpeed = agile.player.getCharacterRenderState().moveSpeed;
      expect(agileSpeed).toBeGreaterThan(baseSpeed * 1.12);

      // Sprint jump +22% impulse
      base.player.pressKey('Space');
      agile.player.pressKey('Space');
      const baseVy = base.player.getCharacterRenderState().velocityY ?? 0;
      const agileVy = agile.player.getCharacterRenderState().velocityY ?? 0;
      expect(agileVy).toBeCloseTo(baseVy * 1.22, 2);

      // Wait out staminaRegenDelay (1.15s) then compare regen over 1.0s
      base.player.releaseKey('ShiftLeft');
      base.player.releaseKey('KeyW');
      agile.player.releaseKey('ShiftLeft');
      agile.player.releaseKey('KeyW');
      let t = 1.0;
      for (let i = 0; i < 30; i++) {
        t += 0.05;
        base.player.update(0.05, t);
        agile.player.update(0.05, t);
      }
      const baseStamBefore = base.player.getStamina();
      const agileStamBefore = agile.player.getStamina();
      for (let i = 0; i < 10; i++) {
        t += 0.05;
        base.player.update(0.05, t);
        agile.player.update(0.05, t);
      }
      const baseGain = base.player.getStamina() - baseStamBefore;
      const agileGain = agile.player.getStamina() - agileStamBefore;
      expect(agileGain).toBeCloseTo(baseGain * 1.25, 1);
    }

    // 3. Medallion Combat: +12% weapon damage & +20% faster reload
    {
      const { weapons, player } = setupWave6Harness();
      player.teleport({ x: 0, y: 0, z: 0 });
      player.addMedallion('medallion_combat');
      player.getInventory().addAmmo('medium', 60);
      player.getInventory().addItem({
        uid: 'ar_combat',
        weaponId: 'ar',
        rarity: 'common',
        magAmmo: 15,
        stackCount: 1,
      });
      player.pressKey('Digit2');

      const enemy: CombatActor = {
        id: 'bot_combat_m',
        name: 'Target',
        position: { x: 0, y: 0, z: -12 },
        eyePos: { x: 0, y: 1.6, z: -12 },
        hp: 200,
        shield: 0,
        maxHp: 200,
        radius: 0.42,
        height: 1.85,
        alive: true,
      };
      weapons.registerActorsProvider(() => [player.getCombatActor(), enemy]);

      const shotRes = weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: player.getInventory().getSlot(1)!,
        origin: { x: 0, y: 1.1, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
      });
      expect(shotRes.damageDealt).toBe(Math.round(30 * 1.12)); // 34 vs 30 baseline

      // AR reloadTime = 2.1s -> with medallion_combat (0.8x) = 1.68s
      player.pressKey('KeyR');
      expect(player.getHudSnapshot().reloadProgress).not.toBeNull();
      for (let i = 0; i < 32; i++) {
        player.update(0.05, (i + 1) * 0.05); // 1.60s
      }
      expect(player.getHudSnapshot().reloadProgress).not.toBeNull();
      for (let i = 0; i < 3; i++) {
        player.update(0.05, 1.6 + (i + 1) * 0.05); // 1.75s
      }
      expect(player.getHudSnapshot().reloadProgress).toBeNull();
      expect(player.getInventory().getSlot(1)?.magAmmo).toBe(WEAPONS.ar.magSize);
    }
  });

  it('implements combat_smg Twin-Mag alternating fast reload per uid and WEAPON_SOUND_MAP entries', () => {
    expect(WEAPON_SOUND_MAP.combat_smg).toBe('shot_combat_smg');
    expect(WEAPON_SOUND_MAP.boom_bow).toBe('bow_release');
    expect(Object.keys(WEAPON_SOUND_MAP).length).toBe(Object.keys(WEAPONS).length);

    const { weapons, player } = setupWave6Harness();
    player.teleport({ x: 0, y: 0, z: 0 });
    player.getInventory().addAmmo('light', 200);

    const smgA: ItemInstance = {
      uid: 'twin_a',
      weaponId: 'combat_smg',
      rarity: 'epic',
      magAmmo: 20,
      stackCount: 1,
    };
    const smgB: ItemInstance = {
      uid: 'twin_b',
      weaponId: 'combat_smg',
      rarity: 'rare',
      magAmmo: 20,
      stackCount: 1,
    };
    player.getInventory().addItem(smgA);
    player.getInventory().addItem(smgB);
    const storedA = player.getInventory().getSlot(1)!;
    const storedB = player.getInventory().getSlot(2)!;
    player.pressKey('Digit2');

    // Cancelled reload does NOT consume fast mag
    player.pressKey('KeyR');
    expect(weapons.getReloadTime(storedA)).toBeCloseTo(1.05, 2);
    player.update(0.05, 0.05);
    player.pressKey('Digit3'); // cancel
    expect(weapons.isTwinMagFastReload(storedA)).toBe(true);
    player.pressKey('Digit2');

    // Reload #1 on storedA -> Fast (1.05s)
    player.pressKey('KeyR');
    let t = 0.1;
    for (let i = 0; i < 20; i++) {
      t += 0.05;
      player.update(0.05, t); // 1.00s
    }
    expect(player.getHudSnapshot().reloadProgress).not.toBeNull();
    player.update(0.05, t + 0.05);
    player.update(0.05, t + 0.1);
    expect(player.getHudSnapshot().reloadProgress).toBeNull();
    expect(storedA.magAmmo).toBe(30);
    expect(weapons.isTwinMagFastReload(storedA)).toBe(false);
    expect(weapons.isTwinMagFastReload(storedB)).toBe(true); // independent uid

    // Fire shots then Reload #2 on storedA -> Normal slow (1.85s)
    storedA.magAmmo = 25;
    player.pressKey('KeyR');
    t = 2.0;
    for (let i = 0; i < 23; i++) {
      t += 0.05;
      player.update(0.05, t); // 1.15s > 1.05s, still reloading
    }
    expect(player.getHudSnapshot().reloadProgress).not.toBeNull();
    for (let i = 0; i < 16; i++) {
      t += 0.05;
      player.update(0.05, t); // 1.95s > 1.85s
    }
    expect(player.getHudSnapshot().reloadProgress).toBeNull();
    expect(storedA.magAmmo).toBe(30);
    expect(weapons.isTwinMagFastReload(storedA)).toBe(true);

    // Reload #3 on storedA -> Back to Fast (1.05s)
    storedA.magAmmo = 22;
    player.pressKey('KeyR');
    for (let i = 0; i < 22; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().reloadProgress).toBeNull();
    expect(storedA.magAmmo).toBe(30);
  });

  it('supports Boom Bow hold-LMB draw charge, bow_draw/bow_release, scaled arrow, and 4.4m vfx:bow_explosion', () => {
    const { bus, building, weapons, player } = setupWave6Harness();
    const sounds: SoundEventId[] = [];
    const bowExplosions: Array<{ position: Vec3Like; radius: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:bow_explosion', (ev) => bowExplosions.push(ev));

    player.teleport({ x: 2, y: 0, z: 0 });
    player.setLook(Math.PI, 0);
    player.getInventory().addAmmo('heavy', 10);
    player.getInventory().addItem({
      uid: 'bow_1',
      weaponId: 'boom_bow',
      rarity: 'legendary',
      magAmmo: 1,
      stackCount: 1,
    });
    player.pressKey('Digit2');

    // 1. Direct velocity & damage scaling comparison (low vs full bowCharge)
    const farWall = building.placePieceForEntity('bot', 'wall', 'metal', -2, 0, -4, 'N', 0)!;
    const lowTarget: CombatActor = {
      id: 'bot_bow_low',
      name: 'LowTarget',
      position: { x: 2, y: 0, z: -15 },
      eyePos: { x: 2, y: 1.6, z: -15 },
      hp: 200,
      shield: 0,
      maxHp: 200,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const splashTarget: CombatActor = {
      id: 'bot_bow_splash',
      name: 'SplashTarget',
      position: { x: 5.5, y: 0, z: -15 }, // 3.5m from arrow impact (< 4.4m)
      eyePos: { x: 5.5, y: 1.6, z: -15 },
      hp: 200,
      shield: 0,
      maxHp: 200,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const outOfRangeTarget: CombatActor = {
      id: 'bot_bow_far',
      name: 'FarTarget',
      position: { x: 9.0, y: 0, z: -15 }, // 7.0m away (> 4.4m)
      eyePos: { x: 9.0, y: 1.6, z: -15 },
      hp: 200,
      shield: 0,
      maxHp: 200,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [
      player.getCombatActor(),
      lowTarget,
      splashTarget,
      outOfRangeTarget,
    ]);

    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: { uid: 'bow_low', weaponId: 'boom_bow', rarity: 'rare', magAmmo: 1, stackCount: 1 },
      origin: { x: 2, y: 1.4, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
      bowCharge: 0.1,
    });
    const lowProj = weapons.getProjectiles()[0];
    expect(lowProj.isBoomArrow).toBe(true);
    expect(lowProj.splashRadius).toBeCloseTo(4.4, 2);
    const lowSpeed = Math.hypot(lowProj.velocity.x, lowProj.velocity.y, lowProj.velocity.z);
    const lowProjDamage = lowProj.damage;
    weapons.clear();

    // 2. PlayerController hold-LMB draw & release at full charge
    player.setMouseButton(0, true);
    expect(sounds).toContain('bow_draw');
    expect(player.getHudSnapshot().bowCharge).toBe(0);

    let t = 0;
    for (let i = 0; i < 9; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().bowCharge).toBeCloseTo(0.5, 1);
    expect(player.getCharacterRenderState().bowCharge).toBeCloseTo(0.5, 1);

    for (let i = 0; i < 10; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().bowCharge).toBe(1);

    player.setMouseButton(0, false);
    expect(player.getHudSnapshot().bowCharge).toBeNull();
    expect(sounds).toContain('bow_release');

    const fullProj = weapons.getProjectiles()[0];
    expect(fullProj).toBeDefined();
    expect(fullProj.isBoomArrow).toBe(true);
    const fullSpeed = Math.hypot(fullProj.velocity.x, fullProj.velocity.y, fullProj.velocity.z);
    expect(fullSpeed).toBeGreaterThan(lowSpeed * 2.0);
    expect(fullProj.damage).toBeGreaterThan(lowProjDamage * 2.0);

    // Step projectile until impact on wall/actor
    for (let i = 0; i < 20; i++) {
      weapons.update(0.02);
    }
    expect(bowExplosions.length).toBe(1);
    expect(bowExplosions[0].radius).toBeCloseTo(4.4, 2);
    expect(sounds).toContain('explosion');
    expect(lowTarget.hp).toBeLessThan(200);
    expect(splashTarget.hp).toBeLessThan(200);
    expect(outOfRangeTarget.hp).toBe(200);
    expect(farWall.hp).toBe(farWall.maxHp);
  });

  it('damages Slurp Tankers via gunfire & melee and heals alive actors within 10m burst radius', () => {
    const { bus, weapons, player } = setupWave6Harness();
    const impacts: Array<{ material: string }> = [];
    const sounds: SoundEventId[] = [];
    bus.on('vfx:impact', (ev) => impacts.push({ material: ev.material }));
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    const chapterBridge = createMockChapterBridge({
      tankers: [
        {
          id: 'tanker_1',
          x: 0,
          y: 0,
          z: -8,
          rotationY: 0,
          hp: 220,
          maxHp: 220,
          healRadius: 10,
          healAmount: 60,
          destroyed: false,
        },
        {
          id: 'tanker_melee',
          x: 2.2,
          y: 0,
          z: 0,
          rotationY: 0,
          hp: 40,
          maxHp: 220,
          healRadius: 10,
          healAmount: 60,
          destroyed: false,
        },
      ],
    });
    player.setChapterBridge(chapterBridge);
    player.teleport({ x: 0, y: 0, z: 0 });

    // Wound player to 70 HP, 0 Shield
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot_1',
      attackerName: 'Bot',
      weaponId: 'ar',
      rarity: 'common',
      damage: 30,
      hpDamage: 30,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: false,
      hitPoint: { x: 0, y: 1, z: -5 },
      distance: 5,
    });
    expect(player.getHealth()).toBe(70);

    const nearBot: CombatActor = {
      id: 'bot_near_tanker',
      name: 'NearBot',
      position: { x: 3, y: 0, z: -8 },
      eyePos: { x: 3, y: 1.6, z: -8 },
      hp: 80,
      shield: 10,
      maxHp: 100,
      maxShield: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const farBot: CombatActor = {
      id: 'bot_far_tanker',
      name: 'FarBot',
      position: { x: 25, y: 0, z: -8 },
      eyePos: { x: 25, y: 1.6, z: -8 },
      hp: 50,
      shield: 0,
      maxHp: 100,
      maxShield: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), nearBot, farBot]);

    // Gunfire damages tanker_1
    const smgItem: ItemInstance = {
      uid: 'smg_t',
      weaponId: 'combat_smg',
      rarity: 'legendary',
      magAmmo: 30,
      stackCount: 1,
    };
    for (let i = 0; i < 10; i++) {
      weapons.fireWeapon({
        actor: player.getCombatActor(),
        item: smgItem,
        origin: { x: 0, y: 1.2, z: 0 },
        aimDir: { x: 0, y: 0, z: -1 },
        spreadRad: 0,
        isPlayer: true,
      });
    }
    expect(chapterBridge.tankers[0].destroyed).toBe(true);
    expect(impacts.some((i) => i.material === 'shield')).toBe(true);
    expect(sounds).toContain('shield_hit');
    // Player 8m from tanker -> +30 HP (to 100) + +30 Shield!
    expect(player.getHealth()).toBe(100);
    expect(player.getShield()).toBe(30);
    // NearBot (+20 HP to 100, +40 Shield to 50) & FarBot untouched
    expect(nearBot.hp).toBe(100);
    expect(nearBot.shield).toBe(50);
    expect(farBot.hp).toBe(50);

    // Pickaxe melee breaks tanker_melee and tops up shield (+60 -> 90)
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: { uid: 'pick_t', weaponId: 'pickaxe', rarity: 'common', magAmmo: 0, stackCount: 1 },
      origin: { x: 0, y: 1.0, z: 0 },
      aimDir: { x: 1, y: 0, z: 0 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(chapterBridge.tankers[1].destroyed).toBe(true);
    expect(player.getShield()).toBe(90);
  });

  it('tracks Victory Crown glints and chapterBridge interactions (Weapon Bunkers, Dropped Medallions, Dropped Crowns)', () => {
    const { bus, player } = setupWave6Harness();
    const sounds: SoundEventId[] = [];
    const glints: Vec3Like[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:crown_glint', (ev) => glints.push(ev.position));

    const chapterBridge = createMockChapterBridge({
      bunkers: [
        {
          id: 'bunker_1',
          poiId: 'metro_towers',
          x: 0,
          y: 0,
          z: -3.2,
          rotationY: 0,
          unlocked: false,
          looted: false,
          unlockAtStormPhase: 2,
        },
      ],
      droppedMedallions: [
        {
          id: 'dm_1',
          medallionId: 'medallion_agility',
          x: 10,
          y: 0,
          z: 0,
          collected: false,
        },
      ],
      droppedCrowns: [
        {
          id: 'dc_1',
          x: 20,
          y: 0,
          z: 0,
          collected: false,
        },
      ],
    });
    player.setChapterBridge(chapterBridge);

    // 1. Locked bunker -> locked prompt & dryfire; unlocked -> loot weapon + gold + shield
    player.teleport({ x: 0, y: 0, z: 0 });
    player.update(0.016, 0.016);
    expect(player.getInteractPrompt()?.label).toContain('LOCKED');
    player.pressKey('KeyE');
    expect(chapterBridge.bunkers[0].looted).toBe(false);
    expect(sounds).toContain('dryfire');

    chapterBridge.bunkers[0].unlocked = true;
    player.update(0.016, 0.032);
    expect(player.getInteractPrompt()?.label).toBe('OPEN WEAPON BUNKER');
    const goldBefore = player.getGoldBars();
    player.pressKey('KeyE');
    expect(chapterBridge.bunkers[0].looted).toBe(true);
    expect(player.getInventory().getSlot(1)?.weaponId).toBe('combat_smg');
    expect(player.getGoldBars()).toBe(goldBefore + 180);
    expect(player.getShield()).toBe(40);
    expect(sounds).toContain('chest_open');

    // 2. Dropped Medallion walkover pickup
    player.teleport({ x: 10, y: 0, z: 0.8 });
    player.update(0.016, 0.05);
    expect(chapterBridge.droppedMedallions[0].collected).toBe(true);
    expect(player.hasMedallion('medallion_agility')).toBe(true);
    expect(sounds).toContain('medallion_pickup');

    // 3. Dropped Victory Crown [E] pickup + periodic crown glint
    player.teleport({ x: 20, y: 0, z: 2.6 });
    player.update(0.016, 0.07);
    expect(player.getInteractPrompt()?.label).toBe('Claim Victory Crown');
    player.pressKey('KeyE');
    expect(chapterBridge.droppedCrowns[0].collected).toBe(true);
    expect(player.hasVictoryCrown()).toBe(true);
    expect(player.getHudSnapshot().hasVictoryCrown).toBe(true);
    expect(player.getCharacterRenderState().hasVictoryCrown).toBe(true);
    expect(glints.length).toBe(1);
    expect(sounds).toContain('crown_glint');

    let t = 0.1;
    for (let i = 0; i < 210; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(glints.length).toBeGreaterThanOrEqual(2);
  });

  it('handles Duos DBNO knocked crawl, bleed-out, completeRevive, and [E] hold partner revive channel', () => {
    const { bus, player } = setupWave6Harness();
    const sounds: SoundEventId[] = [];
    const reviveBeams: Array<{ position: Vec3Like; progress: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:revive_beam', (ev) => reviveBeams.push(ev));

    let partnerAlive = true;
    let partnerDowned = false;
    let partnerRevivedCalls = 0;
    const duoBridge: DuoReviveBridge = {
      isPartnerAlive: () => partnerAlive,
      getPartnerDownedNearby: (pos) => {
        if (!partnerDowned) return null;
        const pPos = { x: 0, y: 0, z: -2.2 };
        if (dist3D(pos, pPos) <= 3.5) {
          return { id: 'duo_ally', name: 'APEX VALKYRIE', position: pPos, bleedOutHp: 85 };
        }
        return null;
      },
      completePartnerRevive: () => {
        partnerRevivedCalls += 1;
        partnerDowned = false;
        return true;
      },
    };
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'DuosTester', 'duos');
    player.setDuoReviveBridge(duoBridge);
    player.teleport({ x: 0, y: 0, z: 0 });

    // 1. Lethal damage in Duos with alive partner enters DBNO instead of eliminating
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot_1',
      attackerName: 'Enemy',
      weaponId: 'ar',
      rarity: 'rare',
      damage: 100,
      hpDamage: 100,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: true,
      hitPoint: { x: 0, y: 1, z: -5 },
      distance: 5,
    });
    expect(player.isAlive()).toBe(true);
    expect(player.getHudSnapshot().isKnocked).toBe(true);
    expect(player.getHudSnapshot().bleedOutHp).toBe(DBNO_MAX_HP);
    expect(player.getCharacterRenderState().animState).toBe('knocked');
    expect(sounds).toContain('knocked_down');

    // Knocked crawl speed (~2.1 m/s) and DBNO_BLEED_DPS (2/s)
    player.pressKey('ShiftLeft');
    player.pressKey('KeyW');
    let t = 0;
    for (let i = 0; i < 40; i++) {
      t += 0.05;
      player.update(0.05, t); // 2.0s
    }
    expect(player.getCharacterRenderState().moveSpeed).toBeLessThan(2.5);
    expect(player.getHudSnapshot().bleedOutHp).toBeCloseTo(
      DBNO_MAX_HP - DBNO_BLEED_DPS * 2.0,
      1,
    );
    player.releaseKey('ShiftLeft');
    player.releaseKey('KeyW');

    // completeRevive restores player to 30 HP & clears knocked
    expect(player.completeRevive()).toBe(true);
    expect(player.getHudSnapshot().isKnocked).toBe(false);
    expect(player.getHealth()).toBe(30);
    expect(sounds).toContain('revive_complete');

    // 2. [E] hold REVIVE_DURATION_SEC (4.0s) Partner Revive channel
    partnerDowned = true;
    player.update(0.016, t + 0.016);
    expect(player.getInteractPrompt()?.label).toContain('APEX VALKYRIE');

    // Early release cancels revive
    player.pressKey('KeyE');
    player.update(0.05, t + 0.07);
    expect(player.getCharacterRenderState().animState).toBe('reviving');
    expect(player.getHudSnapshot().reviveProgress).toBeGreaterThan(0);
    player.releaseKey('KeyE');
    player.update(0.05, t + 0.12);
    expect(player.getHudSnapshot().reviveProgress).toBeNull();
    expect(partnerRevivedCalls).toBe(0);

    // Full 4.0s hold completes revive
    player.pressKey('KeyE');
    for (let i = 0; i < 82; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(partnerRevivedCalls).toBe(1);
    expect(player.getStats().revives).toBe(1);
    expect(player.getHudSnapshot().reviveProgress).toBeNull();
    expect(sounds).toContain('revive_tick');
    expect(reviveBeams.some((b) => b.progress === 1)).toBe(true);

    // 3. If partner is dead, lethal damage eliminates immediately instead of DBNO
    partnerAlive = false;
    player.applyDamage({
      targetId: 'player',
      attackerId: 'bot_1',
      attackerName: 'Enemy',
      weaponId: 'ar',
      rarity: 'rare',
      damage: 100,
      hpDamage: 100,
      shieldDamage: 0,
      isHeadshot: false,
      isElimination: true,
      hitPoint: { x: 0, y: 1, z: -5 },
      distance: 5,
    });
    expect(player.getPhase()).toBe('eliminated');
    expect(player.isAlive()).toBe(false);
  });
});

describe('Wave 7 Gameplay Systems (Grind Rails, Tactical Traps, Pulse Railgun, Minigun, Supply Drones, Reboot Vans)', () => {
  function setupWave7Harness(terrain: TerrainQuery = createFlatTerrain(() => 0)) {
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'Wave7Tester');
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  function createLoopGrindRail(
    id = 'rail_test',
    center: Vec3Like = { x: 0, y: 3, z: -20 },
    radius = 20,
  ): GrindRailEntity {
    const points: Vec3Like[] = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      points.push({
        x: center.x + Math.sin(ang) * radius,
        y: center.y,
        z: center.z + Math.cos(ang) * radius,
      });
    }
    return {
      id,
      poiId: 'metro_towers',
      points,
      color: '#22d3ee',
      speed: GRIND_RAIL_SPEED,
    };
  }

  function createMockOverdriveBridge(init?: {
    rails?: GrindRailEntity[];
    vans?: RebootVanEntity[];
    drones?: SupplyDroneEntity[];
  }): WorldOverdriveBridge & {
    rails: GrindRailEntity[];
    vans: RebootVanEntity[];
    drones: SupplyDroneEntity[];
    triggeredVanIds: string[];
  } {
    const rails = init?.rails ?? [];
    const vans = init?.vans ?? [];
    const drones = init?.drones ?? [];
    const triggeredVanIds: string[] = [];

    const sampleGrindRailAt = (
      id: string,
      t: number,
    ): { position: Vec3Like; tangent: Vec3Like } | null => {
      const rail = rails.find((r) => r.id === id);
      if (!rail || rail.points.length < 2) return null;
      const wrapped = ((t % 1) + 1) % 1;
      const pts = rail.points;
      const n = pts.length;
      const scaled = wrapped * n;
      const i0 = Math.floor(scaled) % n;
      const i1 = (i0 + 1) % n;
      const frac = scaled - Math.floor(scaled);
      const a = pts[i0];
      const b = pts[i1];
      const pos = {
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
        z: a.z + (b.z - a.z) * frac,
      };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      return {
        position: pos,
        tangent: { x: dx / len, y: dy / len, z: dz / len },
      };
    };

    return {
      rails,
      vans,
      drones,
      triggeredVanIds,
      getGrindRails: () => rails,
      sampleGrindRailAt,
      findNearbyGrindRail: (pos, maxDist = 2.8) => {
        let best: {
          rail: GrindRailEntity;
          t: number;
          position: Vec3Like;
          tangent: Vec3Like;
          dist: number;
        } | null = null;
        for (const rail of rails) {
          for (let i = 0; i < 64; i++) {
            const t = i / 64;
            const s = sampleGrindRailAt(rail.id, t);
            if (!s) continue;
            const d = dist3D(pos, s.position);
            if (d <= maxDist && (!best || d < best.dist)) {
              best = { rail, t, position: s.position, tangent: s.tangent, dist: d };
            }
          }
        }
        return best
          ? { rail: best.rail, t: best.t, position: best.position, tangent: best.tangent }
          : null;
      },
      getRebootVans: () => vans,
      triggerRebootVan: (id) => {
        const van = vans.find((v) => v.id === id);
        if (!van || !van.available) return false;
        van.available = false;
        van.cooldownRemainingSec = 60;
        triggeredVanIds.push(id);
        return true;
      },
      getSupplyDrones: () => drones,
      damageSupplyDrone: (id, dmg) => {
        const drone = drones.find((d) => d.id === id);
        if (!drone || drone.destroyed || drone.hp <= 0) return null;
        drone.hp = Math.max(0, drone.hp - dmg);
        const destroyed = drone.hp <= 0;
        if (destroyed) drone.destroyed = true;
        return {
          destroyed,
          x: drone.x,
          y: drone.y,
          z: drone.z,
          rarity: drone.rarity,
          weaponId: 'railgun',
          gold: 120,
          trapKind: 'spike_trap',
        };
      },
    };
  }

  it('traverses Neon Grind Rails via [E] & airborne landing, advances at GRIND_RAIL_SPEED, allows aiming/shooting, and dismounts on [Space] with fall immunity', () => {
    const { bus, weapons, player } = setupWave7Harness();
    const sounds: SoundEventId[] = [];
    const sparkVfx: Array<{ position: Vec3Like; velocity?: Vec3Like }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:rail_sparks', (ev) => sparkVfx.push(ev));

    const rail = createLoopGrindRail('rail_1', { x: 0, y: 3, z: -20 }, 20);
    const overdrive = createMockOverdriveBridge({ rails: [rail] });
    player.setOverdriveBridge(overdrive);

    // 1. Attach via [E] near rail point 0 -> (0, 3, 0)
    player.teleport({ x: 0, y: 2.0, z: 0.5 });
    player.setLook(Math.PI * 0.5, 0);
    player.update(0.016, 0.016);
    expect(player.getInteractPrompt()?.label).toBe('Grind Rail');

    player.pressKey('KeyE');
    expect(sounds).toContain('grind_attach');
    expect(sparkVfx.length).toBeGreaterThanOrEqual(1);
    expect(player.getHudSnapshot().isGrinding).toBe(true);
    expect(player.getHudSnapshot().showSpeedLines).toBe(true);
    expect(player.getCharacterRenderState().animState).toBe('grind');
    expect(player.getCharacterRenderState().isGrinding).toBe(true);

    // 2. Advance along spline at GRIND_RAIL_SPEED & emit periodic sparks
    const startPos = player.getPosition();
    let t = 0.05;
    const sparksBefore = sparkVfx.length;
    for (let i = 0; i < 10; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    const midPos = player.getPosition();
    expect(dist3D(startPos, midPos)).toBeGreaterThan(GRIND_RAIL_SPEED * 0.35);
    expect(sparkVfx.length).toBeGreaterThan(sparksBefore);

    // 3. Aim and shoot while grinding
    player.getInventory().addItem({
      uid: 'ar_grind',
      weaponId: 'ar',
      rarity: 'rare',
      magAmmo: 30,
      stackCount: 1,
    });
    player.pressKey('Digit2');
    player.setMouseButton(2, true);
    player.update(0.02, t + 0.02);
    expect(player.getHudSnapshot().isAiming).toBe(true);
    player.setLook(0, 0); // +Z
    const targetPos = player.getPosition();
    const enemy: CombatActor = {
      id: 'bot_rail_target',
      name: 'Target',
      position: { x: targetPos.x, y: targetPos.y, z: targetPos.z + 8 },
      eyePos: { x: targetPos.x, y: targetPos.y + 1.6, z: targetPos.z + 8 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), enemy]);
    player.setMouseButton(0, true);
    expect(enemy.hp).toBeLessThan(100);
    player.setMouseButton(0, false);
    player.setMouseButton(2, false);

    // 4. [Space] dismount grants jump boost & fall immunity
    player.pressKey('Space');
    expect(player.getHudSnapshot().isGrinding).toBe(false);
    expect(player.isFallImmune()).toBe(true);
    expect((player.getCharacterRenderState().velocityY ?? 0)).toBeGreaterThan(6);
    expect(sounds).toContain('jump');

    // 5. Airborne landing near rail auto-attaches after cooldown
    for (let i = 0; i < 15; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    player.teleport({ x: 0, y: 4.2, z: 0 }); // elevated above rail at y=3
    for (let i = 0; i < 4; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().isGrinding).toBe(true);
  });

  it('places & triggers Spike Traps (100 dmg, friendly-safe, 2.5s cooldown) and Bouncer Pads (launch + fall immunity) and cleans up on clearAll/dispose', () => {
    const { bus, building, player } = setupWave7Harness();
    const sounds: SoundEventId[] = [];
    const trapVfx: Array<{ position: Vec3Like; kind: TrapKind }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:trap_trigger', (ev) => trapVfx.push(ev));

    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'TrapTester', 'duos');
    player.teleport({ x: 0, y: 0, z: 0 });
    player.setLook(Math.PI, 0);

    // 1. Tactical Trap inventory & [KeyT] placement on nearby ground/floor
    expect(player.getHudSnapshot().traps).toEqual({ spike_trap: 0, bouncer_pad: 0 });
    expect(player.placeActiveTrap()).toBeNull();

    player.addTrap('spike_trap', 1);
    player.addTrap('bouncer_pad', 1);
    expect(player.getActiveTrapKind()).toBe('spike_trap');
    expect(player.cycleTrapKind()).toBe('bouncer_pad');
    player.setActiveTrapKind('spike_trap');

    const floorPiece = building.placePieceForEntity('player', 'floor', 'wood', 0, 0, -1, 'N', 0)!;
    expect(floorPiece).not.toBeNull();
    player.pressKey('KeyT');
    expect(player.getStats().trapsPlaced).toBe(1);
    expect(player.getTraps()).toEqual({ spike_trap: 0, bouncer_pad: 1 });
    expect(building.getTraps().length).toBe(1);
    const placedSpike = building.getTraps()[0];
    expect(placedSpike.kind).toBe('spike_trap');
    expect(placedSpike.ownerId).toBe('player');
    expect(placedSpike.squadId).toBe('player_squad');
    expect(placedSpike.x).toBeCloseTo(GRID_XZ * 0.5, 2);
    expect(placedSpike.z).toBeCloseTo(-GRID_XZ * 0.5, 2);

    // 2. Spike Trap ignores owner & squadmate, damages enemy within floor footprint by SPIKE_TRAP_DAMAGE (100)
    const squadmate: CombatActor = {
      id: 'duo_partner',
      name: 'Partner',
      position: { x: placedSpike.x, y: placedSpike.y, z: placedSpike.z },
      eyePos: { x: placedSpike.x, y: placedSpike.y + 1.6, z: placedSpike.z },
      hp: 100,
      shield: 0,
      squadId: 'player_squad',
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const farEnemy: CombatActor = {
      id: 'enemy_far',
      name: 'FarEnemy',
      position: { x: placedSpike.x + 8, y: placedSpike.y, z: placedSpike.z },
      eyePos: { x: placedSpike.x + 8, y: placedSpike.y + 1.6, z: placedSpike.z },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const nearEnemy: CombatActor = {
      id: 'enemy_near',
      name: 'NearEnemy',
      position: { x: placedSpike.x + 0.9, y: placedSpike.y, z: placedSpike.z - 0.8 },
      eyePos: { x: placedSpike.x + 0.9, y: placedSpike.y + 1.6, z: placedSpike.z - 0.8 },
      hp: 100,
      shield: 50,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };

    // Owner + squadmate + far enemy do not trigger trap
    player.teleport({ x: placedSpike.x, y: placedSpike.y, z: placedSpike.z });
    expect(building.checkTrapTriggers([player.getCombatActor(), squadmate, farEnemy])).toBe(0);
    expect(player.getHealth()).toBe(100);
    expect(squadmate.hp).toBe(100);
    expect(farEnemy.hp).toBe(100);

    // Enemy in footprint triggers 100 dmg -> 50 shield + 50 HP left
    expect(building.checkTrapTriggers([player.getCombatActor(), squadmate, nearEnemy])).toBe(1);
    expect(nearEnemy.shield).toBe(0);
    expect(nearEnemy.hp).toBe(100 - (SPIKE_TRAP_DAMAGE - 50));
    expect(placedSpike.armed).toBe(false);
    expect(trapVfx.some((v) => v.kind === 'spike_trap')).toBe(true);
    expect(sounds).toContain('trap_snap');

    // 3. Cooldown prevents immediate re-trigger, re-arms after 2.5s
    building.updateTraps(1.0);
    expect(placedSpike.armed).toBe(false);
    expect(building.checkTrapTriggers([nearEnemy])).toBe(0);
    expect(nearEnemy.hp).toBe(50);

    building.updateTraps(1.6); // total 2.6s >= 2.5s
    expect(placedSpike.armed).toBe(true);
    expect(building.checkTrapTriggers([nearEnemy])).toBe(1);
    expect(nearEnemy.hp).toBe(0);
    expect(nearEnemy.alive).toBe(false);

    // 4. Bouncer Pad launches any actor with BOUNCER_IMPULSE_Y + BOUNCER_IMPULSE_FWD + fall immunity
    player.teleport({ x: 30, y: 0, z: 0 });
    player.setLook(0, 0); // facing +Z
    player.pressKey('KeyT'); // auto-selects remaining bouncer_pad
    expect(player.getStats().trapsPlaced).toBe(2);
    const bouncer = building.getTraps().find((t) => t.kind === 'bouncer_pad')!;
    expect(bouncer).toBeDefined();

    player.teleport({ x: bouncer.x, y: bouncer.y, z: bouncer.z });
    const botActor: CombatActor = {
      id: 'bot_bounce',
      name: 'BouncerBot',
      position: { x: bouncer.x + 0.3, y: bouncer.y, z: bouncer.z },
      eyePos: { x: bouncer.x + 0.3, y: bouncer.y + 1.6, z: bouncer.z },
      hp: 100,
      shield: 0,
      velocity: { x: 0, y: 0, z: 0 },
      fallImmune: false,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    expect(building.checkTrapTriggers([player.getCombatActor(), botActor])).toBe(2);
    expect(player.isFallImmune()).toBe(true);
    expect(player.getCharacterRenderState().velocityY).toBeCloseTo(BOUNCER_IMPULSE_Y, 1);
    expect(botActor.fallImmune).toBe(true);
    expect(botActor.velocity!.y).toBeCloseTo(BOUNCER_IMPULSE_Y, 1);
    expect(Math.hypot(botActor.velocity!.x, botActor.velocity!.z)).toBeCloseTo(
      BOUNCER_IMPULSE_FWD,
      1,
    );
    expect(trapVfx.some((v) => v.kind === 'bouncer_pad')).toBe(true);
    expect(sounds).toContain('bouncer_launch');

    // 5. clearAll and dispose remove all trap meshes & state
    building.clearAll();
    expect(building.getTraps().length).toBe(0);
    building.placeTrap('spike_trap', 'player', { x: 5, y: 0, z: 5 }, 0);
    expect(building.getTraps().length).toBe(1);
    building.dispose();
    expect(building.getTraps().length).toBe(0);
  });

  it('implements Pulse Railgun hold-LMB charge (>=0.45 release & auto-fire) and wall-piercing hitscan beam', () => {
    expect(WEAPON_SOUND_MAP.railgun).toBe('shot_railgun');
    expect(WEAPON_SOUND_MAP.minigun).toBe('shot_minigun');
    expect(Object.keys(WEAPON_SOUND_MAP).length).toBe(Object.keys(WEAPONS).length);

    const { bus, building, weapons, player } = setupWave7Harness();
    const sounds: SoundEventId[] = [];
    const railBeams: Array<{ from: Vec3Like; to: Vec3Like; pierced?: boolean }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:railgun_beam', (ev) => railBeams.push(ev));

    player.teleport({ x: 2, y: 0, z: 0 });
    player.setLook(Math.PI, 0); // facing -Z
    player.getInventory().addAmmo('heavy', 10);
    player.getInventory().addItem({
      uid: 'rg_1',
      weaponId: 'railgun',
      rarity: 'epic',
      magAmmo: 1,
      stackCount: 1,
    });
    player.pressKey('Digit2');

    // Place 1 build wall between player (z=0) and enemy (z=-10)
    const wall1 = building.placePieceForEntity('bot', 'wall', 'metal', 0, 0, -1, 'N', 0)!; // z = -4, hp = 115
    const enemy1: CombatActor = {
      id: 'bot_rg_1',
      name: 'BehindWall1',
      position: { x: 2, y: 0, z: -10 },
      eyePos: { x: 2, y: 1.6, z: -10 },
      hp: 150,
      shield: 0,
      maxHp: 150,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), enemy1]);

    // 1. Release early (< 0.45 charge) cancels without firing
    player.setMouseButton(0, true);
    expect(sounds).toContain('railgun_charge');
    expect(player.getHudSnapshot().railgunCharge).toBe(0);
    player.update(0.05, 0.05);
    player.update(0.05, 0.1);
    player.update(0.05, 0.15); // 0.15 / 0.85 ~ 0.176 < 0.45
    player.setMouseButton(0, false);
    expect(player.getHudSnapshot().railgunCharge).toBeNull();
    expect(player.getStats().shotsFired).toBe(0);
    expect(enemy1.hp).toBe(150);

    // 2. Hold >= 0.45 (0.5s / 0.85s ~ 0.588) and release -> pierces wall1 & hits enemy1!
    player.setMouseButton(0, true);
    let t = 0.2;
    for (let i = 0; i < 10; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().railgunCharge!).toBeGreaterThanOrEqual(0.45);
    expect(player.getCharacterRenderState().weaponCharge).toBeGreaterThanOrEqual(0.45);
    player.setMouseButton(0, false);

    expect(player.getStats().shotsFired).toBe(1);
    expect(sounds).toContain('shot_railgun');
    expect(railBeams.length).toBe(1);
    expect(railBeams[0].pierced).toBe(true);
    expect(wall1.hp).toBe(0); // 180 * 1.22 > 115 metal startHp
    expect(enemy1.hp).toBeLessThan(150);

    // 3. Auto-fire at full charge (1.0) & pierceBuildCount = 1 stops at 2nd wall
    const rgItem = player.getInventory().getSlot(1)!;
    rgItem.magAmmo = 1;
    const wallA = building.placePieceForEntity('bot', 'wall', 'metal', 0, 0, -1, 'N', 0)!; // z = -4
    const wallB = building.placePieceForEntity('bot', 'wall', 'metal', 0, 0, -2, 'N', 0)!; // z = -8
    const enemyBehind2: CombatActor = {
      id: 'bot_rg_2',
      name: 'BehindTwoWalls',
      position: { x: 2, y: 0, z: -14 },
      eyePos: { x: 2, y: 1.6, z: -14 },
      hp: 150,
      shield: 0,
      maxHp: 150,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [player.getCombatActor(), enemyBehind2]);

    // Wait out fireCooldown (1 / 0.72 ~ 1.39s)
    for (let i = 0; i < 30; i++) {
      t += 0.05;
      player.update(0.05, t);
    }

    player.setMouseButton(0, true);
    for (let i = 0; i < 18; i++) {
      t += 0.05;
      player.update(0.05, t); // 0.90s >= 0.85s -> auto-fires!
    }
    player.setMouseButton(0, false);

    expect(player.getStats().shotsFired).toBe(2);
    expect(railBeams.length).toBe(2);
    expect(railBeams[1].pierced).toBe(true);
    expect(wallA.hp).toBe(0);
    expect(wallB.hp).toBe(0); // stopped on 2nd wall and damaged it
    expect(enemyBehind2.hp).toBe(150); // protected behind 2nd wall!
  });

  it('implements Overheat Minigun spin-up, light ammo reserve draw without reload, overheat lock, and cooldown', () => {
    const { bus, player } = setupWave7Harness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    player.teleport({ x: 0, y: 0, z: 0 });
    player.getInventory().addAmmo('light', 120);
    player.getInventory().addItem({
      uid: 'mg_1',
      weaponId: 'minigun',
      rarity: 'legendary',
      magAmmo: 999,
      stackCount: 1,
    });
    player.pressKey('Digit2');

    // Manual reload KeyR does nothing on Minigun
    player.pressKey('KeyR');
    expect(player.getHudSnapshot().reloadProgress).toBeNull();

    // 1. Spin-up period (< 0.45s): no shots fired yet
    player.setMouseButton(0, true);
    let t = 0;
    for (let i = 0; i < 8; i++) {
      t += 0.05;
      player.update(0.05, t); // 0.40s < 0.45s
    }
    expect(player.getStats().shotsFired).toBe(0);
    expect(player.getInventory().getAmmo('light')).toBe(120);
    expect(player.getHudSnapshot().minigunHeat).toBe(0);

    // 2. Past spinUpSec -> fires rapidly drawing from 'light' reserve & heating up
    for (let i = 0; i < 10; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    const shotsMid = player.getStats().shotsFired;
    expect(shotsMid).toBeGreaterThan(0);
    expect(player.getInventory().getAmmo('light')).toBe(120 - shotsMid);
    expect(player.getHudSnapshot().minigunHeat!).toBeCloseTo(
      shotsMid * (WEAPONS.minigun.heatPerShot ?? 0.022),
      2,
    );
    expect(sounds).toContain('shot_minigun');

    // 3. Release LMB and verify idle cooling at coolRatePerSec
    player.setMouseButton(0, false);
    const heatBeforeCool = player.getHudSnapshot().minigunHeat!;
    for (let i = 0; i < 10; i++) {
      t += 0.05;
      player.update(0.05, t); // 0.5s
    }
    expect(player.getHudSnapshot().minigunHeat!).toBeCloseTo(
      Math.max(0, heatBeforeCool - (WEAPONS.minigun.coolRatePerSec ?? 0.34) * 0.5),
      2,
    );

    // 4. Fire until overheat (minigunHeat = 1.0 -> minigunOverheated lock)
    player.getInventory().addAmmo('light', 200);
    player.setMouseButton(0, true);
    for (let i = 0; i < 140; i++) {
      t += 0.05;
      player.update(0.05, t);
      if (player.getHudSnapshot().minigunOverheated) break;
    }
    expect(player.getHudSnapshot().minigunOverheated).toBe(true);
    expect(player.getHudSnapshot().minigunHeat).toBeCloseTo(1.0, 2);
    expect(sounds).toContain('minigun_overheat');

    // Locked during overheatLockSec (2.4s): holding LMB fires 0 shots
    const shotsAtOverheat = player.getStats().shotsFired;
    const ammoAtOverheat = player.getInventory().getAmmo('light');
    for (let i = 0; i < 24; i++) {
      t += 0.05;
      player.update(0.05, t); // 1.2s < 2.4s
    }
    expect(player.getHudSnapshot().minigunOverheated).toBe(true);
    expect(player.getStats().shotsFired).toBe(shotsAtOverheat);
    expect(player.getInventory().getAmmo('light')).toBe(ammoAtOverheat);

    // Unlocks after 2.4s total when LMB released -> heat clears to null and can fire again
    player.setMouseButton(0, false);
    for (let i = 0; i < 26; i++) {
      t += 0.05;
      player.update(0.05, t); // 1.3s more -> 2.5s > 2.4s
    }
    expect(player.getHudSnapshot().minigunOverheated).toBe(false);
    expect(player.getHudSnapshot().minigunHeat).toBeNull();
  });

  it('hits and destroys Flying Supply Drones via hitscan, returns loot coordinates, and triggers onDroneDestroyed & stats.dronesShotDown', () => {
    const { weapons, player } = setupWave7Harness();
    const destroyedCallbacks: SupplyDroneDamageResult[] = [];
    player.setOnDroneDestroyed((res) => destroyedCallbacks.push(res));

    const drone: SupplyDroneEntity = {
      id: 'drone_1',
      poiId: 'metro_towers',
      x: 0,
      y: 15,
      z: -10,
      baseY: 15,
      orbitCenterX: 0,
      orbitCenterZ: -10,
      orbitRadius: 8,
      orbitAngle: 0,
      orbitSpeed: 0.6,
      hp: 90,
      maxHp: 90,
      rarity: 'epic',
      destroyed: false,
    };
    const overdrive = createMockOverdriveBridge({ drones: [drone] });
    player.setOverdriveBridge(overdrive);

    player.teleport({ x: 0, y: 0, z: 0 });
    // Aim straight at drone from eyePos (0, 1.63, 0) to (0, 15, -10)
    const dx = drone.x - 0;
    const dy = drone.y - 1.63;
    const dz = drone.z - 0;
    const horiz = Math.hypot(dx, dz);
    const aimPitch = Math.atan2(dy, horiz);
    const aimYaw = Math.atan2(dx, dz);
    player.setLook(aimYaw, aimPitch);

    player.getInventory().addItem({
      uid: 'rg_drone',
      weaponId: 'railgun',
      rarity: 'rare',
      magAmmo: 1,
      stackCount: 1,
    });
    player.pressKey('Digit2');

    // Charge railgun & fire at overhead drone
    player.setMouseButton(0, true);
    let t = 0;
    for (let i = 0; i < 18; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    player.setMouseButton(0, false);

    expect(drone.destroyed).toBe(true);
    expect(player.getStats().dronesShotDown).toBe(1);
    expect(destroyedCallbacks.length).toBe(1);
    expect(destroyedCallbacks[0]).toMatchObject({
      destroyed: true,
      x: 0,
      y: 15,
      z: -10,
      weaponId: 'railgun',
      trapKind: 'spike_trap',
    });

    // Direct WeaponSystem.fireWeapon also returns destroyedDrones coordinates
    const drone2: SupplyDroneEntity = {
      ...drone,
      id: 'drone_2',
      x: 5,
      y: 14,
      z: -8,
      hp: 30,
      maxHp: 90,
      destroyed: false,
    };
    overdrive.drones.push(drone2);
    const directRes = weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: { uid: 'ar_d', weaponId: 'ar', rarity: 'common', magAmmo: 30, stackCount: 1 },
      origin: { x: 5, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 12.5, z: -8 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(directRes.fired).toBe(true);
    expect(directRes.shotsHit).toBe(1);
    expect(directRes.destroyedDrones?.length).toBe(1);
    expect(directRes.destroyedDrones![0].x).toBe(5);
    expect(directRes.destroyedDrones![0].y).toBe(14);
    expect(directRes.destroyedDrones![0].z).toBe(-8);
  });

  it('completes Reboot Van [E] 5.0s channel when partner reboot card is held, emits VFX/SFX/noise, and increments stats.reboots', () => {
    const { bus, player } = setupWave7Harness();
    const sounds: SoundEventId[] = [];
    const rebootBeams: Array<{ position: Vec3Like; progress: number }> = [];
    const noises: Array<{ kind: string; radius: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:reboot_beam', (ev) => rebootBeams.push(ev));
    bus.on('audio:noise', (ev) => noises.push({ kind: ev.kind, radius: ev.radius }));

    const van: RebootVanEntity = {
      id: 'van_metro',
      poiId: 'metro_towers',
      x: 0,
      y: 0,
      z: -3,
      rotationY: 0,
      cooldownRemainingSec: 0,
      available: true,
    };
    const overdrive = createMockOverdriveBridge({ vans: [van] });

    let hasCard = false;
    const rebootPositions: Vec3Like[] = [];
    const duoReboot: DuoRebootBridge = {
      hasPartnerRebootCard: () => hasCard,
      rebootPartnerAt: (pos) => {
        rebootPositions.push(pos);
        hasCard = false;
        return { id: 'duo_partner', alive: true };
      },
    };

    player.resetForMatch({ x: 0, y: 175, z: 0 }, 'RebootHero', 'duos');
    player.setOverdriveBridge(overdrive);
    player.setDuoRebootBridge(duoReboot);
    player.teleport({ x: 0, y: 0, z: 0 });

    // Without reboot card -> no reboot prompt
    player.update(0.016, 0.016);
    expect(player.getHudSnapshot().hasPartnerRebootCard).toBe(false);
    expect(player.getInteractPrompt()).toBeNull();

    // With reboot card -> prompt appears
    hasCard = true;
    player.update(0.016, 0.032);
    expect(player.getHudSnapshot().hasPartnerRebootCard).toBe(true);
    expect(player.getInteractPrompt()?.label).toContain('REBOOT PARTNER');

    // Early release cancels reboot cleanly
    player.pressKey('KeyE');
    let t = 0.05;
    for (let i = 0; i < 20; i++) {
      t += 0.05;
      player.update(0.05, t); // 1.0s
    }
    expect(player.getHudSnapshot().rebootProgress!).toBeCloseTo(1.0 / REBOOT_DURATION_SEC, 1);
    expect(sounds).toContain('reboot_channel');
    expect(noises.some((n) => n.radius >= 100)).toBe(true);

    player.releaseKey('KeyE');
    player.update(0.05, t + 0.05);
    expect(player.getHudSnapshot().rebootProgress).toBeNull();
    expect(rebootPositions.length).toBe(0);
    expect(player.getStats().reboots).toBe(0);

    // Full 5.0s channel completes reboot
    player.pressKey('KeyE');
    for (let i = 0; i < 102; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(overdrive.triggeredVanIds).toEqual(['van_metro']);
    expect(van.available).toBe(false);
    expect(rebootPositions.length).toBe(1);
    expect(rebootPositions[0]).toEqual({ x: 0, y: 0, z: -3 });
    expect(player.getStats().reboots).toBe(1);
    expect(player.getHudSnapshot().rebootProgress).toBeNull();
    expect(player.getHudSnapshot().hasPartnerRebootCard).toBe(false);
    expect(sounds).toContain('reboot_complete');
    expect(rebootBeams.some((b) => b.progress === 1)).toBe(true);
  });
});

describe('Wave 8 Gameplay Systems (Weapon Mods, Port-A-Bunker, EMP Grenade, Forecast Tower, Stealth Bush, Team Rumble)', () => {
  function setupWave8Harness(terrain: TerrainQuery = createFlatTerrain(() => 0)) {
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 0, z: 0 }, 'Wave8Tester');
    player.setPhase('playing');
    player.teleport({ x: 0, y: 0, z: 0 });
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  function createMockFrontierBridge(init?: {
    modBenches?: ModBenchEntity[];
    forecastTowers?: ForecastTowerEntity[];
    stealthBushes?: StealthBushEntity[];
    bus?: EventBus;
  }): WorldFrontierBridge {
    const modBenches = init?.modBenches ?? [];
    const forecastTowers = init?.forecastTowers ?? [];
    const stealthBushes = init?.stealthBushes ?? [];
    return {
      getModBenches: () => modBenches,
      getForecastTowers: () => forecastTowers,
      scanForecastTower: (id, actorId) => {
        const tower = forecastTowers.find((t) => t.id === id);
        if (!tower || tower.scanned) return false;
        tower.scanned = true;
        tower.scannedBy = actorId;
        if (init?.bus) {
          init.bus.emit('sound:play', { id: 'forecast_scan', volume: 0.9 });
          init.bus.emit('vfx:forecast_pulse', {
            position: { x: tower.x, y: tower.y, z: tower.z },
          });
        }
        return true;
      },
      getStealthBushes: () => stealthBushes,
      isInsideStealthBush: (pos) => {
        for (const bush of stealthBushes) {
          const dx = pos.x - bush.x;
          const dz = pos.z - bush.z;
          const dy = Math.abs(pos.y - bush.y);
          if (dx * dx + dz * dz <= bush.radius * bush.radius && dy <= 2.6) {
            return bush;
          }
        }
        return null;
      },
    };
  }

  it('installs all 4 Weapon Mods via Mod Bench & API (red_dot, suppressor, drum_mag, foregrip) and applies stat/audio/FOV effects', () => {
    expect(WEAPON_MOD_COST_GOLD).toBe(75);
    expect(WEAPON_MODS.map((m) => m.id)).toEqual(['red_dot', 'suppressor', 'drum_mag', 'foregrip']);

    const { bus, weapons, camera, player } = setupWave8Harness();
    const sounds: SoundEventId[] = [];
    const modVfx: unknown[] = [];
    const noiseEvents: Array<{ radius: number; x: number; z: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:weapon_mod', (ev) => modVfx.push(ev));
    bus.on('audio:noise', (ev) =>
      noiseEvents.push({ radius: ev.radius, x: ev.position.x, z: ev.position.z }),
    );

    const bench: ModBenchEntity = {
      id: 'bench_1',
      poiId: 'frontier_outpost',
      x: 0,
      y: 0,
      z: -2,
      rotationY: 0,
      costGold: WEAPON_MOD_COST_GOLD,
    };
    player.setFrontierBridge(createMockFrontierBridge({ modBenches: [bench] }));

    const arItem: ItemInstance = {
      uid: 'ar_mod_test',
      weaponId: 'ar',
      rarity: 'rare',
      magAmmo: 15,
      stackCount: 1,
    };
    player.getInventory().addItem(arItem);
    player.getInventory().addAmmo('medium', 200);
    player.pressKey('Digit2'); // equip Assault Rifle

    // Insufficient gold rejects without installing
    expect(player.getHudSnapshot().goldBars).toBe(STARTING_GOLD_BARS);
    player.addGoldBars(-STARTING_GOLD_BARS);
    expect(player.getHudSnapshot().goldBars).toBe(0);
    expect(player.installWeaponMod()).toBe(false);
    expect(player.getStats().modsInstalled).toBe(0);

    // Grant Gold enough for 4 mods (300) + verify base ADS spread before red_dot
    player.addGoldBars(WEAPON_MOD_COST_GOLD * 4);
    player.setMouseButton(2, true);
    player.update(0.3, 0.3);
    const baseAdsSpread = player.getHudSnapshot().activeWeaponSpread;
    const baseAdsFov = camera.fov;
    player.setMouseButton(2, false);

    // 1. [E] near Mod Bench equips 'red_dot' (-35% ADS spread + tighter ADS zoom FOV)
    player.update(0.05, 0.35);
    expect(player.getInteractPrompt()?.label).toContain('MOD ');
    player.pressKey('KeyE');
    expect(player.getStats().modsInstalled).toBe(1);
    expect(player.getHudSnapshot().goldBars).toBe(WEAPON_MOD_COST_GOLD * 3);
    expect(player.getHudSnapshot().activeWeaponMods).toEqual(['red_dot']);
    expect(player.getCharacterRenderState().weaponMods).toEqual(['red_dot']);
    expect(modVfx.length).toBe(1);
    expect(sounds).toContain('mod_install');

    player.setMouseButton(2, true);
    for (let i = 0; i < 10; i++) player.update(0.05, 0.4 + i * 0.05);
    const redDotAdsSpread = player.getHudSnapshot().activeWeaponSpread;
    expect(redDotAdsSpread).toBeCloseTo(baseAdsSpread * 0.65, 4);
    expect(camera.fov).toBeLessThan(baseAdsFov);
    player.setMouseButton(2, false);

    // Compare WeaponSystem noise & spread directly with vs without suppressor/red_dot/foregrip
    const botActor: CombatActor = {
      id: 'other_bot',
      name: 'OtherBot',
      position: { x: 0, y: 0, z: 0 },
      eyePos: { x: 0, y: 1.5, z: 0 },
      hp: 100,
      shield: 0,
      maxHp: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const plainArItem: ItemInstance = {
      uid: 'plain_ar',
      weaponId: 'ar',
      rarity: 'rare',
      magAmmo: 30,
      stackCount: 1,
    };
    const unmoddedShot = weapons.fireWeapon({
      actor: botActor,
      item: plainArItem,
      origin: { x: 0, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0.04,
      isPlayer: false,
      isAiming: true,
    });
    expect(unmoddedShot.bloomScale).toBe(1);
    expect(unmoddedShot.recoilScale).toBe(1);
    const loudNoise = noiseEvents[noiseEvents.length - 1];
    expect(loudNoise.radius).toBeGreaterThan(0);
    expect(sounds).toContain('shot_ar');

    // 2. Equip 'suppressor' -> 'shot_suppressed' & 0.3x audio:noise radius
    const slotAr = player.getInventory().getSlot(1)!;
    expect(player.installWeaponMod('suppressor')).toBe(true);
    expect(player.getStats().modsInstalled).toBe(2);
    const suppressedSoundsBefore = sounds.length;
    const suppressedShot = weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: slotAr,
      origin: { x: 0, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0.04,
      isPlayer: true,
      weaponMods: slotAr.mods,
    });
    expect(suppressedShot.fired).toBe(true);
    expect(sounds.slice(suppressedSoundsBefore)).toContain('shot_suppressed');
    expect(sounds.slice(suppressedSoundsBefore)).not.toContain('shot_ar');
    const quietNoise = noiseEvents[noiseEvents.length - 1];
    expect(quietNoise.radius).toBeCloseTo(loudNoise.radius * 0.3, 3);

    // Also fire via PlayerController input to confirm PlayerController passes weapon mods
    const pcSuppressedBefore = sounds.length;
    player.setMouseButton(0, true);
    player.update(0.05, 0.95);
    player.setMouseButton(0, false);
    expect(sounds.slice(pcSuppressedBefore)).toContain('shot_suppressed');
    expect(noiseEvents[noiseEvents.length - 1].radius).toBeCloseTo(loudNoise.radius * 0.3, 3);

    // 3. [E] near Mod Bench equips next unequipped mod ('drum_mag') -> +45% mag cap & fills magAmmo
    player.pressKey('KeyE');
    expect(player.getHudSnapshot().activeWeaponMods).toEqual(['red_dot', 'suppressor', 'drum_mag']);
    const expectedDrumCap = Math.round(WEAPONS.ar.magSize * 1.45);
    expect(getItemMagCapacity(slotAr)).toBe(expectedDrumCap);
    expect(slotAr.magAmmo).toBe(expectedDrumCap);

    // Reloading after spending rounds refills to drum_mag capacity
    slotAr.magAmmo = 5;
    player.pressKey('KeyR');
    let t = 1.0;
    for (let i = 0; i < 60; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(slotAr.magAmmo).toBe(expectedDrumCap);

    // 4. [E] equips 'foregrip' -> -25% bloomScale & -35% recoilScale; 5th install returns false
    player.pressKey('KeyE');
    expect(player.getHudSnapshot().activeWeaponMods).toEqual([
      'red_dot',
      'suppressor',
      'drum_mag',
      'foregrip',
    ]);
    expect(player.getStats().modsInstalled).toBe(4);
    expect(player.getHudSnapshot().goldBars).toBe(0);

    const modEffects = getWeaponModEffects(resolveWeaponMods(slotAr));
    expect(modEffects.adsSpreadMult).toBeCloseTo(0.65, 4);
    expect(modEffects.noiseRadiusMult).toBeCloseTo(0.3, 4);
    expect(modEffects.magMult).toBeCloseTo(1.45, 4);
    expect(modEffects.bloomMult).toBeCloseTo(0.75, 4);
    expect(modEffects.recoilMult).toBeCloseTo(0.65, 4);

    const grippedShot = weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: slotAr,
      origin: { x: 0, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0.04,
      isPlayer: true,
      weaponMods: slotAr.mods,
    });
    expect(grippedShot.bloomScale).toBeCloseTo(0.75, 4);
    expect(grippedShot.recoilScale).toBeCloseTo(0.65, 4);

    player.addGoldBars(100);
    expect(player.installWeaponMod()).toBe(false);
    expect(player.getHudSnapshot().goldBars).toBe(100);
  });

  it('deploys Port-A-Bunker fortified 1x1 metal fort on landing without spending materials', () => {
    expect(WEAPON_SOUND_MAP.port_a_bunker).toBe('bunker_deploy');
    expect(Object.keys(WEAPON_SOUND_MAP).length).toBe(Object.keys(WEAPONS).length);

    const { bus, building, weapons, player } = setupWave8Harness();
    const sounds: SoundEventId[] = [];
    const bunkerVfx: unknown[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:bunker_deploy', (ev) => bunkerVfx.push(ev));

    player.getInventory().addItem({
      uid: 'bunker_slot',
      weaponId: 'port_a_bunker',
      rarity: 'rare',
      magAmmo: 0,
      stackCount: 2,
    });
    player.pressKey('Digit2');
    player.setLook(Math.PI, -0.15); // facing -Z slightly downward

    expect(player.getInventory().getMaterials()).toEqual({ wood: 0, brick: 0, metal: 0 });

    player.setMouseButton(0, true);
    player.setMouseButton(0, false);

    // Advance projectile simulation until bunker lands
    let t = 0;
    for (let i = 0; i < 80; i++) {
      t += 0.05;
      player.update(0.05, t);
      weapons.update(0.05);
    }

    const pieces = building.getPieces();
    expect(pieces.length).toBe(6);
    expect(pieces.every((p) => p.material === 'metal')).toBe(true);
    expect(pieces.every((p) => p.buildProgress === 1 && p.hp === p.maxHp)).toBe(true);
    expect(pieces.filter((p) => p.type === 'wall').length).toBe(4);
    expect(pieces.filter((p) => p.type === 'floor').length).toBe(1);
    expect(pieces.filter((p) => p.type === 'ramp').length).toBe(1);
    expect(player.getInventory().getMaterials()).toEqual({ wood: 0, brick: 0, metal: 0 });
    expect(bunkerVfx.length).toBe(1);
    expect(sounds).toContain('bunker_deploy');
    expect(player.getStats().bunkersDeployed).toBe(1);
    expect(player.getInventory().getSlot(1)?.stackCount).toBe(1);
  });

  it('detonates EMP Grenade stripping up to 70 Shield/Overshield (respecting team/squad immunity) and disabling enemy traps', () => {
    expect(WEAPON_SOUND_MAP.emp_grenade).toBe('emp_blast');

    const { bus, building, weapons, player } = setupWave8Harness();
    const sounds: SoundEventId[] = [];
    const empVfx: unknown[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:emp_blast', (ev) => empVfx.push(ev));

    player.setGameMode('team_rumble'); // player becomes team_blue
    player.teleport({ x: 0, y: 0, z: 0 });
    player.setLook(Math.PI, 0); // level throw along -Z lands ~7.8m ahead

    const enemyInRange: CombatActor = {
      id: 'enemy_emp_1',
      name: 'EnemyShielded',
      position: { x: 0, y: 0, z: -8 },
      eyePos: { x: 0, y: 1.5, z: -8 },
      hp: 100,
      shield: 50,
      overshield: 40,
      maxHp: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
      teamId: 'team_red',
    };
    const allyTeammate: CombatActor = {
      id: 'ally_emp_1',
      name: 'BlueAlly',
      position: { x: 1.5, y: 0, z: -8 },
      eyePos: { x: 1.5, y: 1.5, z: -8 },
      hp: 100,
      shield: 100,
      overshield: 25,
      maxHp: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
      teamId: 'team_blue',
    };
    const enemyOutOfRange: CombatActor = {
      id: 'enemy_emp_far',
      name: 'FarEnemy',
      position: { x: 0, y: 0, z: -18 },
      eyePos: { x: 0, y: 1.5, z: -18 },
      hp: 100,
      shield: 100,
      maxHp: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
      teamId: 'team_red',
    };
    weapons.registerActorsProvider(() => [
      player.getCombatActor(),
      enemyInRange,
      allyTeammate,
      enemyOutOfRange,
    ]);

    const enemyTrap = building.placeTrap('spike_trap', 'enemy_trap_owner', { x: 0.5, y: 0, z: -8 }, 0)!;
    const friendlyTrap = building.placeTrap('spike_trap', 'player', { x: -0.5, y: 0, z: -8 }, 0)!;
    expect(enemyTrap).toBeTruthy();
    expect(friendlyTrap).toBeTruthy();

    player.getInventory().addItem({
      uid: 'emp_slot',
      weaponId: 'emp_grenade',
      rarity: 'rare',
      magAmmo: 0,
      stackCount: 3,
    });
    player.pressKey('Digit2');
    player.setMouseButton(0, true);
    player.setMouseButton(0, false);

    let t = 0;
    for (let i = 0; i < 80; i++) {
      t += 0.05;
      player.update(0.05, t);
      weapons.update(0.05);
    }

    expect(empVfx.length).toBeGreaterThanOrEqual(1);
    expect(sounds).toContain('emp_blast');
    // Stripped 40 overshield + 30 shield = 70 total, zero HP damage
    expect(enemyInRange.overshield).toBe(0);
    expect(enemyInRange.shield).toBe(20);
    expect(enemyInRange.hp).toBe(100);
    // Team immunity and range check
    expect(allyTeammate.shield).toBe(100);
    expect(allyTeammate.overshield).toBe(25);
    expect(enemyOutOfRange.shield).toBe(100);
    // Enemy trap disabled, friendly trap untouched
    expect(enemyTrap.armed).toBe(false);
    expect(enemyTrap.armTimer).toBeGreaterThanOrEqual(WEAPONS.emp_grenade.empDisableSec ?? 5);
    expect(friendlyTrap.armed).toBe(true);
    // 1 shielded actor hit + 1 enemy trap disabled = 2 EMP hits
    expect(player.getStats().empHits).toBe(2);

    // Direct disableTrapsInRadius helper check
    const secondTrap = building.placeTrap('bouncer_pad', 'other', { x: 20, y: 0, z: 20 }, 0)!;
    expect(building.disableTrapsInRadius({ x: 20, y: 0, z: 20 }, 6.5, 7)).toBe(1);
    expect(secondTrap.armed).toBe(false);
    expect(secondTrap.armTimer).toBeGreaterThanOrEqual(7);
  });

  it('scans Forecast Tower via [E] unlocking Storm Forecast + 100 Gold, and supports QA unlock helper', () => {
    const { bus, player } = setupWave8Harness();
    const sounds: SoundEventId[] = [];
    const pulses: unknown[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:forecast_pulse', (ev) => pulses.push(ev));

    const tower: ForecastTowerEntity = {
      id: 'ft_alpha',
      poiId: 'weather_station',
      x: 0,
      y: 0,
      z: -2,
      rotationY: 0,
      scanned: false,
      scannedBy: null,
    };
    player.setFrontierBridge(createMockFrontierBridge({ forecastTowers: [tower], bus }));
    player.update(0.05, 0.05);

    expect(player.getHudSnapshot().hasStormForecast).toBe(false);
    expect(player.getInteractPrompt()?.label).toContain('FORECAST');
    const goldBefore = player.getHudSnapshot().goldBars;

    player.pressKey('KeyE');
    expect(tower.scanned).toBe(true);
    expect(tower.scannedBy).toBe('player');
    expect(player.getHudSnapshot().hasStormForecast).toBe(true);
    expect(player.getHudSnapshot().goldBars).toBe(goldBefore + 100);
    expect(sounds).toContain('forecast_scan');
    expect(pulses.length).toBe(1);

    // Re-pressing [E] does not re-scan or grant extra Gold
    player.pressKey('KeyE');
    expect(player.getHudSnapshot().goldBars).toBe(goldBefore + 100);

    // Reset clears forecast; QA helper re-unlocks
    player.resetForMatch({ x: 0, y: 0, z: 0 }, 'QA');
    player.setPhase('playing');
    expect(player.getHudSnapshot().hasStormForecast).toBe(false);
    player.unlockStormForecast();
    expect(player.getHudSnapshot().hasStormForecast).toBe(true);
    expect(player.hasStormForecastUnlocked()).toBe(true);
  });

  it('conceals crouched player in Stealth Bush, emits bush_rustle on entry, and breaks stealth briefly on firing', () => {
    const { bus, player } = setupWave8Harness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    const bush: StealthBushEntity = { id: 'bush_1', x: 0, y: 0, z: 0, radius: 2.5 };
    player.setFrontierBridge(createMockFrontierBridge({ stealthBushes: [bush] }));
    player.getInventory().addItem({
      uid: 'ar_bush',
      weaponId: 'ar',
      rarity: 'common',
      magAmmo: 30,
      stackCount: 1,
    });
    player.pressKey('Digit2');

    // Start outside bush
    player.teleport({ x: 10, y: 0, z: 10 });
    player.update(0.05, 0.05);
    expect(player.getHudSnapshot().isStealthed).toBe(false);
    expect(sounds).not.toContain('bush_rustle');

    // Enter bush standing -> plays bush_rustle, not stealthed until crouched
    player.teleport({ x: 0, y: 0, z: 0 });
    player.update(0.05, 0.1);
    expect(sounds).toContain('bush_rustle');
    expect(player.getHudSnapshot().isStealthed).toBe(false);

    // Crouch inside bush -> stealthed in HUD & render state
    player.pressKey('KeyC');
    expect(player.getHudSnapshot().isStealthed).toBe(true);
    expect(player.getCharacterRenderState().isStealthed).toBe(true);

    // Firing breaks stealth briefly (~1.25s)
    player.setMouseButton(0, true);
    player.update(0.05, 0.15);
    player.setMouseButton(0, false);
    expect(player.getHudSnapshot().isStealthed).toBe(false);

    let t = 0.15;
    for (let i = 0; i < 30; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().isStealthed).toBe(true);

    // Uncrouching or leaving bush clears stealth
    player.pressKey('KeyC');
    expect(player.getHudSnapshot().isStealthed).toBe(false);
    player.pressKey('KeyC');
    expect(player.getHudSnapshot().isStealthed).toBe(true);
    player.teleport({ x: 8, y: 0, z: 8 });
    player.update(0.05, t + 0.05);
    expect(player.getHudSnapshot().isStealthed).toBe(false);
  });

  it('supports Team Rumble respawn preserving loadout/mods/mats and QuestTracker + AugmentManager team_rumble mode', () => {
    expect(TEAM_RUMBLE_TARGET_SCORE).toBe(25);
    expect(TEAM_RUMBLE_RESPAWN_SEC).toBeCloseTo(3.5, 3);

    const { bus, player } = setupWave8Harness();
    const sounds: SoundEventId[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));

    player.setGameMode('team_rumble');
    expect(player.getCharacterRenderState().teamId).toBe('team_blue' satisfies TeamId);
    expect(player.getCombatActor().teamId).toBe('team_blue' satisfies TeamId);

    const moddedAr: ItemInstance = {
      uid: 'tr_ar',
      weaponId: 'ar',
      rarity: 'epic',
      magAmmo: 44,
      stackCount: 1,
      mods: ['red_dot', 'drum_mag'],
    };
    player.getInventory().addItem(moddedAr);
    player.getInventory().addAmmo('medium', 90);
    player.getInventory().addMaterial('metal', 120);
    player.pressKey('Digit2');

    // Lethal damage eliminates player without dropping loadout in team_rumble
    player.applyDamage({
      targetId: 'player',
      attackerId: 'red_bot_1',
      attackerName: 'RedBot',
      weaponId: 'ar',
      rarity: 'rare',
      damage: 500,
      hpDamage: 500,
      shieldDamage: 0,
      isHeadshot: true,
      isElimination: true,
      hitPoint: { x: 0, y: 1, z: 0 },
      distance: 10,
    });
    expect(player.getPhase()).toBe('eliminated');
    expect(player.getInventory().getSlot(1)?.weaponId).toBe('ar');
    expect(player.getInventory().getSlot(1)?.mods).toEqual(['red_dot', 'drum_mag']);
    expect(player.getInventory().getAmmo('medium')).toBe(90);
    expect(player.getInventory().getMaterials().metal).toBe(120);

    // Respawn in Team Rumble -> 100 HP, 50 Shield, skydiving at dropPos, keeps inventory
    player.respawnInTeamRumble({ x: 18, y: 115, z: -24 });
    expect(player.getPhase()).toBe('skydiving');
    expect(player.isAlive()).toBe(true);
    expect(player.getPosition()).toEqual({ x: 18, y: 115, z: -24 });
    expect(player.getHudSnapshot().health).toBe(100);
    expect(player.getHudSnapshot().shield).toBe(50);
    expect(player.getHudSnapshot().isKnocked).toBe(false);
    expect(player.getInventory().getSlot(1)?.mods).toEqual(['red_dot', 'drum_mag']);
    expect(player.getInventory().getAmmo('medium')).toBe(90);
    expect(player.getInventory().getMaterials().metal).toBe(120);
    expect(sounds).toContain('rumble_respawn');

    // QuestTracker & AugmentManager support 'team_rumble' cleanly
    const quests = new QuestTracker(bus);
    quests.reset(777, 'team_rumble');
    expect(quests.getQuests().length).toBe(3);

    const augments = new AugmentManager(bus);
    augments.reset(777, 'team_rumble');
    expect(augments.getIntervalSec()).toBe(AUGMENT_INTERVAL_BLITZ);
    augments.update(AUGMENT_INTERVAL_BLITZ, AUGMENT_INTERVAL_BLITZ);
    expect(augments.getPendingChoices()).not.toBeNull();
  });
});

describe('Wave 9 Gameplay Systems (Skyforge Jetpack, Plasma Flamethrower, Hop Crystals, Apex Express Train)', () => {
  function setupWave9Harness(terrain: TerrainQuery = createFlatTerrain(() => 0)) {
    const collision = new CollisionSystem(terrain);
    const scene = new THREE.Scene();
    const bus = new EventBus();
    const building = new BuildingSystem(scene, terrain, bus);
    collision.setBuildPiecesProvider(() => building.getPieces());
    const propsBridge = createMockPropsBridge();
    const weapons = new WeaponSystem(collision, building, propsBridge, bus);
    const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 1000);
    const player = new PlayerController(
      camera,
      terrain,
      collision,
      building,
      weapons,
      propsBridge,
      bus,
      DEFAULT_SETTINGS,
    );
    player.resetForMatch({ x: 0, y: 0, z: 0 }, 'Wave9Tester');
    player.setPhase('playing');
    player.teleport({ x: 0, y: 0, z: 0 });
    return { terrain, collision, scene, bus, building, propsBridge, weapons, camera, player };
  }

  it('powers Skyforge Jetpack airborne Jump & active-slot LMB thrust, fuel burn/recharge, VFX/SFX, and fall damage immunity', () => {
    expect(WEAPON_SOUND_MAP.jetpack).toBe('jetpack_ignite');
    expect(WEAPON_SOUND_MAP.plasma_flamethrower).toBe('flame_burst');
    expect(Object.keys(WEAPON_SOUND_MAP).length).toBe(Object.keys(WEAPONS).length);

    const { bus, player } = setupWave9Harness();
    const sounds: SoundEventId[] = [];
    const flameVfx: Array<{ position: Vec3Like; direction: Vec3Like; intensity: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:jetpack_flame', (ev) => flameVfx.push(ev));

    // Without Jetpack in inventory -> null fuel & false flags
    expect(player.getHudSnapshot().jetpackFuel).toBeNull();
    expect(player.getHudSnapshot().isJetpackThrusting).toBe(false);
    expect(player.getCharacterRenderState().hasJetpack).toBe(false);

    // Equip Jetpack in slot 2 while holding Pickaxe in slot 1
    player.getInventory().addItem({
      uid: 'jp_1',
      weaponId: 'jetpack',
      rarity: 'epic',
      magAmmo: 0,
      stackCount: 1,
    });
    expect(player.getHudSnapshot().jetpackFuel).toBe(JETPACK_MAX_FUEL);
    expect(player.getCharacterRenderState().hasJetpack).toBe(true);

    // Hold Jump while airborne (even when another slot is active) -> thrusts upward & burns fuel
    player.pressKey('Space');
    let t = 0;
    let peakY = 0;
    for (let i = 0; i < 20; i++) {
      t += 0.05;
      player.update(0.05, t);
      peakY = Math.max(peakY, player.getPosition().y);
    }
    expect(peakY).toBeGreaterThan(4.5);
    expect(player.getHudSnapshot().isJetpackThrusting).toBe(true);
    expect(player.getCharacterRenderState().isJetpackThrusting).toBe(true);
    expect(player.getHudSnapshot().jetpackFuel!).toBeCloseTo(
      JETPACK_MAX_FUEL - JETPACK_BURN_RATE * 1.0,
      1,
    );
    expect(sounds).toContain('jetpack_ignite');
    expect(flameVfx.length).toBeGreaterThanOrEqual(1);
    expect(player.isFallImmune()).toBe(true);

    // Release Jump at high altitude (~20m) and fall all the way down -> fallImmune cancels fall damage
    player.releaseKey('Space');
    player.teleport({ x: 0, y: 20, z: 0 });
    player.setJetpackFuel(80);
    player.pressKey('Space'); // thrust briefly mid-air
    t += 0.05;
    player.update(0.05, t);
    player.releaseKey('Space');
    expect(player.isFallImmune()).toBe(true);

    for (let i = 0; i < 80; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getPosition().y).toBeCloseTo(0, 1);
    expect(player.getHealth()).toBe(100);
    expect(sounds).not.toContain('fall_damage');

    // Recharges at JETPACK_RECHARGE_RATE * dt when not thrusting
    player.setJetpackFuel(20);
    for (let i = 0; i < 20; i++) {
      t += 0.05;
      player.update(0.05, t); // 1.0s
    }
    expect(player.getHudSnapshot().jetpackFuel!).toBeCloseTo(
      20 + JETPACK_RECHARGE_RATE * 1.0,
      1,
    );

    // Holding LMB while 'jetpack' slot is active launches straight off the ground
    player.pressKey('Digit2'); // select jetpack slot
    expect(player.getHudSnapshot().activeWeaponId).toBe('jetpack');
    const fuelBeforeLmb = player.getHudSnapshot().jetpackFuel!;
    player.setMouseButton(0, true);
    for (let i = 0; i < 16; i++) {
      t += 0.05;
      player.update(0.05, t); // 0.8s
    }
    player.setMouseButton(0, false);
    expect(player.getPosition().y).toBeGreaterThan(0.8);
    expect(player.getHudSnapshot().jetpackFuel!).toBeLessThan(fuelBeforeLmb);
    expect(player.getStats().shotsFired).toBe(0);
  });

  it("fires Dragon's Breath Plasma Flamethrower with 3.5x wood burn, flame_stream VFX, and 8 DPS x 3.0s burn DOT", () => {
    const { bus, building, weapons, player } = setupWave9Harness();
    const sounds: SoundEventId[] = [];
    const flameStreams: Array<{ origin: Vec3Like; direction: Vec3Like; range: number }> = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:flame_stream', (ev) => flameStreams.push(ev));

    // 1. 3.5x woodDamageMult vs brick BuildPiece
    const woodWall = building.placePieceForEntity('bot', 'wall', 'wood', 0, 0, -1, 'N', 0)!;
    const brickWall = building.placePieceForEntity('bot', 'wall', 'brick', 2, 0, -1, 'N', 0)!;
    woodWall.hp = 150;
    brickWall.hp = 300;
    const flameItem: ItemInstance = {
      uid: 'ft_1',
      weaponId: 'plasma_flamethrower',
      rarity: 'epic',
      magAmmo: 60,
      stackCount: 1,
    };

    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: flameItem,
      origin: { x: 2, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: flameItem,
      origin: { x: 10, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });

    const woodDmg = 150 - woodWall.hp;
    const brickDmg = 300 - brickWall.hp;
    expect(brickDmg).toBe(Math.round(WEAPONS.plasma_flamethrower.structureDamage * RARITY_MULTIPLIER.epic));
    expect(woodDmg).toBe(Math.round(brickDmg * (WEAPONS.plasma_flamethrower.woodDamageMult ?? 3.5)));
    expect(sounds).toContain('flame_burst');
    expect(flameStreams.length).toBe(2);
    expect(flameStreams[0].range).toBe(WEAPONS.plasma_flamethrower.range);

    // 2. Cone actor hit + 8 DPS x 3.0s burn DOT (24 DOT damage) + onFlameDamage + stats.flameDamage
    // First confirm unbroken brick wall at (gx=2, x=8..12, z=-4) blocks flame behind it
    const enemyBlockedByWall: CombatActor = {
      id: 'bot_flame_blocked',
      name: 'WallBlocked',
      position: { x: 10, y: 0, z: -10 },
      eyePos: { x: 10, y: 1.6, z: -10 },
      hp: 100,
      shield: 0,
      maxHp: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    const enemyInRange: CombatActor = {
      id: 'bot_flame_1',
      name: 'FlameTarget',
      position: { x: 20.9, y: 0, z: -10 }, // slightly off-center inside cone (<= 18m)
      eyePos: { x: 20.9, y: 1.6, z: -10 },
      hp: 100,
      shield: 0,
      maxHp: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
      onDamage: () => {},
    };
    const enemyOutOfRange: CombatActor = {
      id: 'bot_flame_far',
      name: 'FarSafeTarget',
      position: { x: 20, y: 0, z: -22 }, // > 18m range
      eyePos: { x: 20, y: 1.6, z: -22 },
      hp: 100,
      shield: 0,
      maxHp: 100,
      radius: 0.42,
      height: 1.85,
      alive: true,
    };
    weapons.registerActorsProvider(() => [
      player.getCombatActor(),
      enemyBlockedByWall,
      enemyInRange,
      enemyOutOfRange,
    ]);

    const shieldRes = weapons.fireWeapon({
      actor: player.getCombatActor(),
      item: flameItem,
      origin: { x: 10, y: 1.5, z: 0 },
      aimDir: { x: 0, y: 0, z: -1 },
      spreadRad: 0,
      isPlayer: true,
    });
    expect(brickWall.hp).toBeGreaterThan(0);
    expect(shieldRes.shotsHit).toBe(0);
    expect(enemyBlockedByWall.hp).toBe(100);

    player.getInventory().addItem({
      uid: 'ft_player',
      weaponId: 'plasma_flamethrower',
      rarity: 'epic',
      magAmmo: 60,
      stackCount: 1,
    });
    player.pressKey('Digit2');
    player.teleport({ x: 20, y: 0, z: 0 });
    player.setLook(Math.PI, 0);
    player.update(0.1, 0.1); // clear 1/12s fireCooldown from earlier direct shot
    player.setMouseButton(0, true);
    player.update(0.05, 0.15);
    player.setMouseButton(0, false);

    const hpAfterDirect = enemyInRange.hp;
    expect(hpAfterDirect).toBeLessThan(100);
    expect(enemyOutOfRange.hp).toBe(100);
    const directFlameDmg = 100 - hpAfterDirect;
    expect(player.getStats().flameDamage).toBe(directFlameDmg);

    // Tick 3.0s of burn DOT at 8 DPS -> 24 DOT damage total
    for (let i = 0; i < 60; i++) {
      weapons.update(0.05);
    }
    expect(hpAfterDirect - enemyInRange.hp).toBe(24);
    expect(player.getStats().flameDamage).toBe(directFlameDmg + 24);
    expect(weapons.getActiveBurnCount()).toBe(0);

    // Extra ticks after 3.0s deal zero further DOT
    const hpAtEnd = enemyInRange.hp;
    for (let i = 0; i < 20; i++) {
      weapons.update(0.05);
    }
    expect(enemyInRange.hp).toBe(hpAtEnd);

    // Enemy hitting player marks CharacterRenderState.isBurning and weapons.clear() cancels it cleanly
    let customFlameDmg = 0;
    const enemyFlamer: CombatActor = {
      id: 'bot_pyro',
      name: 'PyroBot',
      position: { x: 20, y: 0, z: -5 },
      eyePos: { x: 20, y: 1.5, z: -5 },
      hp: 100,
      shield: 0,
      radius: 0.42,
      height: 1.85,
      alive: true,
      onFlameDamage: (d) => {
        customFlameDmg += d;
      },
    };
    weapons.fireWeapon({
      actor: enemyFlamer,
      item: flameItem,
      origin: { x: 20, y: 1.5, z: -5 },
      aimDir: { x: 0, y: 0, z: 1 },
      spreadRad: 0,
      isPlayer: false,
    });
    expect(player.getCharacterRenderState().isBurning).toBe(true);
    weapons.update(0.5);
    expect(customFlameDmg).toBe(4); // 8 DPS * 0.5s
    weapons.clear();
    expect(player.getCharacterRenderState().isBurning).toBe(false);
    expect(weapons.getActiveBurnCount()).toBe(0);
    weapons.update(1.0);
    expect(customFlameDmg).toBe(4);
  });

  it('activates Low-Gravity Hop Crystal buff via [E] with 0.52x gravity, boosted jump height, fall immunity, and countdown', () => {
    expect(LOW_GRAVITY_DURATION_SEC).toBe(15);
    expect(LOW_GRAVITY_SCALE).toBeCloseTo(0.52, 4);

    const { bus, player } = setupWave9Harness();
    const sounds: SoundEventId[] = [];
    const hopAuras: Vec3Like[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    bus.on('vfx:hop_crystal_aura', (ev) => hopAuras.push(ev.position));

    const craters: MeteorCraterEntity[] = [
      {
        id: 'crater_1',
        poiId: 'crater_depot',
        x: 0,
        y: 0,
        z: -2.2,
        radius: 5.5,
        crystalAvailable: true,
        crystalRespawnSec: 0,
      },
    ];
    const skyforgeBridge: WorldSkyforgeBridge = {
      getTrainState: () => null,
      getTrainPlatformSupport: () => null,
      isNearTrainChest: () => false,
      advanceTrainChestHack: () => null,
      getMeteorCraters: () => craters,
      findNearbyHopCrystal: (pos) =>
        craters.find(
          (c) =>
            c.crystalAvailable &&
            dist3D(pos, { x: c.x, y: c.y, z: c.z }) <= c.radius,
        ) ?? null,
      consumeHopCrystal: (id) => {
        const c = craters.find((item) => item.id === id && item.crystalAvailable);
        if (!c) return null;
        c.crystalAvailable = false;
        c.crystalRespawnSec = 45;
        return { ok: true, position: { x: c.x, y: c.y, z: c.z } };
      },
    };
    player.setSkyforgeBridge(skyforgeBridge);

    // Measure normal jump peak height first (with no buff)
    player.teleport({ x: 10, y: 0, z: 10 });
    player.pressKey('Space');
    player.releaseKey('Space');
    let t = 0;
    let normalPeakY = 0;
    for (let i = 0; i < 30; i++) {
      t += 0.05;
      player.update(0.05, t);
      normalPeakY = Math.max(normalPeakY, player.getPosition().y);
    }

    // Move near Meteor Crater Hop Crystal and press [E]
    player.teleport({ x: 0, y: 0, z: 0 });
    player.update(0.05, t + 0.05);
    expect(player.getInteractPrompt()?.label).toContain('HOP CRYSTAL');
    player.pressKey('KeyE');
    player.releaseKey('KeyE');

    expect(craters[0].crystalAvailable).toBe(false);
    expect(player.getStats().hopCrystalsUsed).toBe(1);
    expect(player.getHudSnapshot().lowGravityRemainingSec).toBeCloseTo(15, 1);
    expect(player.getCharacterRenderState().hasLowGravityBuff).toBe(true);
    expect(sounds).toContain('hop_crystal_consume');
    expect(hopAuras.length).toBe(1);

    // Jump under Low-G Hop Buff -> emits low_g_jump and reaches > 2.5x normal jump apex
    player.pressKey('Space');
    player.releaseKey('Space');
    expect(sounds).toContain('low_g_jump');
    let lowGPeakY = 0;
    for (let i = 0; i < 40; i++) {
      t += 0.05;
      player.update(0.05, t);
      lowGPeakY = Math.max(lowGPeakY, player.getPosition().y);
    }
    expect(lowGPeakY).toBeGreaterThan(normalPeakY * 2.4);

    // Fall from >18m while low-G buff is active -> fall damage prevented
    player.teleport({ x: 0, y: 20, z: 0 });
    for (let i = 0; i < 60; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getPosition().y).toBeCloseTo(0, 1);
    expect(player.getHealth()).toBe(100);
    expect(sounds).not.toContain('fall_damage');

    // QA helper + timer expiration clears HUD/render state
    player.setLowGravityTimer(0.2);
    expect(player.getHudSnapshot().lowGravityRemainingSec).toBeCloseTo(0.2, 2);
    for (let i = 0; i < 6; i++) {
      t += 0.05;
      player.update(0.05, t);
    }
    expect(player.getHudSnapshot().lowGravityRemainingSec).toBeNull();
    expect(player.getCharacterRenderState().hasLowGravityBuff).toBe(false);
  });

  it('carries standing player along Apex Express Train flatbed and completes 3.0s Train Chest hack for +150 Gold', () => {
    expect(TRAIN_HACK_DURATION_SEC).toBeCloseTo(3.0, 3);

    const { bus, player } = setupWave9Harness();
    const sounds: SoundEventId[] = [];
    const hackedCallbacks: Vec3Like[] = [];
    bus.on('sound:play', (ev) => sounds.push(ev.id));
    player.setOnTrainChestHacked((pos) => hackedCallbacks.push(pos));

    const trainState: ApexTrainState = {
      active: true,
      x: 10,
      y: 0,
      z: 0,
      yaw: Math.PI * 0.5,
      speed: 11.5,
      t: 0,
      trackPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
      ],
      chestHacked: false,
      chestHackProgress: 0,
      chestCooldownSec: 0,
      carPositions: [
        { x: 10, y: 0, z: 0, yaw: Math.PI * 0.5 },
        { x: 0, y: 0, z: 0, yaw: Math.PI * 0.5 },
      ],
    };
    const deckY = 1.85;
    let hackElapsed = 0;
    const stepTrainPerTick = 0.575; // 11.5 m/s * 0.05s

    const skyforgeBridge: WorldSkyforgeBridge = {
      getTrainState: () => trainState,
      getTrainPlatformSupport: (pos) => {
        const car = trainState.carPositions[1];
        if (
          Math.abs(pos.x - car.x) <= 4.5 &&
          Math.abs(pos.z - car.z) <= 2.2 &&
          pos.y >= deckY - 0.9 &&
          pos.y <= deckY + 0.6
        ) {
          return { deckY, deltaX: stepTrainPerTick, deltaZ: 0 };
        }
        return null;
      },
      isNearTrainChest: (pos, radius = 3.5) => {
        const car = trainState.carPositions[1];
        return dist3D(pos, { x: car.x, y: deckY, z: car.z }) <= radius;
      },
      advanceTrainChestHack: (dt) => {
        if (trainState.chestHacked) return null;
        hackElapsed += dt;
        const progress = Math.min(1, hackElapsed / TRAIN_HACK_DURATION_SEC);
        trainState.chestHackProgress = progress;
        const lootPos = {
          x: trainState.carPositions[1].x,
          y: deckY + 0.4,
          z: trainState.carPositions[1].z,
        };
        if (progress >= 1 - 1e-6) {
          trainState.chestHacked = true;
          trainState.chestCooldownSec = 75;
          return { completed: true, progress: 1, lootPos };
        }
        return { completed: false, progress, lootPos };
      },
      getMeteorCraters: () => [],
      findNearbyHopCrystal: () => null,
      consumeHopCrystal: () => null,
    };
    player.setSkyforgeBridge(skyforgeBridge);

    // Place player on Cargo Car 1 flatbed
    player.teleport({ x: 0, y: deckY, z: 0 });
    let t = 0;
    const advanceTrainTick = () => {
      trainState.x += stepTrainPerTick;
      trainState.carPositions[0].x += stepTrainPerTick;
      trainState.carPositions[1].x += stepTrainPerTick;
      t += 0.05;
      player.update(0.05, t);
    };

    // Riding carry for 10 ticks -> player smoothly carried along X at deckY
    for (let i = 0; i < 10; i++) {
      advanceTrainTick();
    }
    expect(player.getPosition().x).toBeCloseTo(stepTrainPerTick * 10, 2);
    expect(player.getPosition().y).toBeCloseTo(deckY, 3);
    expect(player.getInteractPrompt()?.label).toContain('HACK TRAIN CHEST');

    // Early [E] release cancels hack without awarding Gold
    const goldBefore = player.getGoldBars();
    player.pressKey('KeyE');
    for (let i = 0; i < 10; i++) {
      advanceTrainTick();
    }
    expect(player.getHudSnapshot().trainHackProgress!).toBeCloseTo(0.5 / 3.0, 2);
    player.releaseKey('KeyE');
    advanceTrainTick();
    expect(player.getHudSnapshot().trainHackProgress).toBeNull();
    expect(player.getGoldBars()).toBe(goldBefore);

    // Hold [E] until 3.0s hack completes while riding moving train
    player.pressKey('KeyE');
    for (let i = 0; i < 52; i++) {
      advanceTrainTick();
      if (trainState.chestHacked) break;
    }
    player.releaseKey('KeyE');

    expect(trainState.chestHacked).toBe(true);
    expect(player.getStats().trainChestsHacked).toBe(1);
    expect(player.getGoldBars()).toBe(goldBefore + 150);
    expect(player.getHudSnapshot().trainHackProgress).toBeNull();
    expect(sounds).toContain('train_hack_complete');
    expect(hackedCallbacks.length).toBe(1);
    expect(hackedCallbacks[0].x).toBeCloseTo(trainState.carPositions[1].x, 2);
  });
});
