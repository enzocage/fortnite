import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type {
  BiomeType,
  ChestEntity,
  DamageEvent,
  HarvestableProp,
  ItemInstance,
  LootDrop,
  POIDef,
  SupplyDrop,
  TerrainQuery,
  Vec3Like,
} from '../../types';
import {
  DEFAULT_SETTINGS,
  EventBus,
  GLIDER_FORCE_HEIGHT,
  GRID_XZ,
  GRID_Y,
  MAX_MATS,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  RARITY_MULTIPLIER,
  WEAPONS,
} from '../../core';
import {
  BuildingSystem,
  CollisionSystem,
  InventorySystem,
  PlayerController,
  ROOF_HEIGHT,
  WeaponSystem,
  classifyEditMask,
  computeWeaponDamage,
  getRampHeightAtLocal,
  getRoofHeightAtLocal,
  type CombatActor,
  type PropsInteractionBridge,
} from '../index';

function createFlatTerrain(heightFn: (x: number, z: number) => number = () => 0): TerrainQuery {
  return {
    getHeightAt: heightFn,
    getNormalAt: () => ({ x: 0, y: 1, z: 0 }),
    isWater: () => false,
    getBiomeAt: (): BiomeType => 'grassland',
    getPOIs: (): POIDef[] => [],
    getMapTextureCanvas: () => ({} as HTMLCanvasElement),
  };
}

function createMockPropsBridge(): PropsInteractionBridge & {
  props: HarvestableProp[];
  chests: ChestEntity[];
  drops: LootDrop[];
  supplyDrops: SupplyDrop[];
} {
  const props: HarvestableProp[] = [];
  const chests: ChestEntity[] = [];
  const drops: LootDrop[] = [];
  const supplyDrops: SupplyDrop[] = [];
  let seq = 1;

  return {
    props,
    chests,
    drops,
    supplyDrops,
    getProps: () => props,
    getChests: () => chests,
    getLootDrops: () => drops,
    getSupplyDrops: () => supplyDrops,
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
  });
});
