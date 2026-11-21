import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type {
  BiomeType,
  CampfireEntity,
  ChestEntity,
  DamageEvent,
  HarvestableProp,
  ItemInstance,
  LaunchPadEntity,
  LootDrop,
  LootLlamaEntity,
  MatchQuest,
  POIDef,
  Rarity,
  SlurpBarrelEntity,
  SoundEventId,
  SupplyDrop,
  TerrainQuery,
  UpgradeBenchEntity,
  VaultEntity,
  Vec3Like,
  VehicleEntity,
  ZiplineEntity,
} from '../../types';
import {
  DEFAULT_SETTINGS,
  EventBus,
  GLIDER_FORCE_HEIGHT,
  GRID_XZ,
  GRID_Y,
  MAX_MATS,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  RARITY_MULTIPLIER,
  UPGRADE_COSTS,
  WEAPONS,
  dist3D,
} from '../../core';
import { VOLCANO_CENTER_X, VOLCANO_CENTER_Z } from '../../world';
import {
  BuildingSystem,
  CollisionSystem,
  InventorySystem,
  PlayerController,
  QuestTracker,
  ROOF_HEIGHT,
  WeaponSystem,
  classifyEditMask,
  computeWeaponDamage,
  getRampHeightAtLocal,
  getRoofHeightAtLocal,
  type CombatActor,
  type PropsInteractionBridge,
  type VaultBridge,
  type VehicleBridge,
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
