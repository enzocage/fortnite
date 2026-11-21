import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type {
  BiomeType,
  ChestEntity,
  DamageEvent,
  HarvestableProp,
  ItemInstance,
  LaunchPadEntity,
  LootDrop,
  LootLlamaEntity,
  POIDef,
  SoundEventId,
  SupplyDrop,
  TerrainQuery,
  Vec3Like,
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
  WEAPONS,
} from '../../core';
import { VOLCANO_CENTER_X, VOLCANO_CENTER_Z } from '../../world';
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
