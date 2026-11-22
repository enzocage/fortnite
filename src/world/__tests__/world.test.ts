import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CHOPPA_ASCEND_SPEED,
  CHOPPA_DESCEND_SPEED,
  CHOPPA_MAX_ALTITUDE_AGL,
  EventBus,
  GRIND_RAIL_SPEED,
  HOT_DROP_POI_COUNT,
  ISLAND_RADIUS,
  METEOR_CRATER_CRYSTAL_RESPAWN_SEC,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  POIS,
  REBOOT_VAN_COOLDOWN_SEC,
  RUNE_MONOLITH_COOLDOWN_SEC,
  RUNE_MONOLITH_COUNT,
  SHIELD_MUSHROOM_RESPAWN_SEC,
  SKY_BALLOON_HEIGHT,
  STEP_HEIGHT,
  STORM_BLESSING_SHIELD_BONUS,
  STORM_PHASES,
  TRAIN_CHEST_COOLDOWN_SEC,
  TRAIN_HACK_DURATION_SEC,
  TRAIN_SPEED_MPS,
  WATER_LEVEL,
  WEAPON_MOD_COST_GOLD,
  WEAPONS,
  WILD_BOAR_MAX_HP,
  WORLD_HALF,
} from '../../core';
import {
  EnvironmentDetail,
  EnvironmentFX,
  PropsAndLoot,
  RIVER_POLYLINE,
  StormSystem,
  TerrainSystem,
  TextureFactory,
  VehicleSystem,
  VOLCANO_CENTER_X,
  VOLCANO_CENTER_Z,
  WorldBuilder,
  WorldInteractables,
  type BumpTextureKind,
  type FishingCastResult,
  type GrindRailSampleResult,
  type NearbyGrindRailResult,
  type RuneMonolithAttuneResult,
  type SupplyDroneDamageResult,
  type Wave7ShowcaseResult,
  type Wave8ShowcaseResult,
  type Wave9ShowcaseResult,
  type Wave10ShowcaseResult,
  type Wave11ShowcaseResult,
  type Wave12ShowcaseResult,
  type Wave13ShowcaseResult,
} from '../index';
import type { WeatherKind } from '../../types';

function createMockCanvasEnvironment() {
  const noop = () => {};
  const makeCtx = () => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: noop,
  });

  const origDoc = globalThis.document;
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') return {};
      return {
        width: 256,
        height: 256,
        getContext: () => makeCtx(),
      };
    },
  };

  return () => {
    (globalThis as unknown as { document: unknown }).document = origDoc;
  };
}

describe('TextureFactory', () => {
  it('generates and caches all procedural textures with SRGBColorSpace and RepeatWrapping', () => {
    const restore = createMockCanvasEnvironment();
    try {
      const factory = new TextureFactory();
      const textures = [
        factory.getTerrainDetailTexture(),
        factory.getGrassTexture(),
        factory.getSandTexture(),
        factory.getRockTexture(),
        factory.getRoadTexture(),
        factory.getWoodTexture(),
        factory.getBrickTexture(),
        factory.getMetalTexture(),
        factory.getSidingTexture('#3b82f6'),
        factory.getRoofTexture('#334155'),
        factory.getBarkTexture(),
        factory.getChestTexture(),
        factory.getSupplyDropTexture(),
      ];

      for (const tex of textures) {
        expect(tex).toBeInstanceOf(THREE.CanvasTexture);
        expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(tex.wrapS).toBe(THREE.RepeatWrapping);
        expect(tex.wrapT).toBe(THREE.RepeatWrapping);
      }

      // Caching
      expect(factory.getGrassTexture()).toBe(textures[1]);
      expect(factory.getSidingTexture('#3b82f6')).toBe(
        factory.getSidingTexture('#3B82F6'),
      );
      expect(factory.getSidingTexture('#ef4444')).not.toBe(
        factory.getSidingTexture('#3b82f6'),
      );

      const beforeDispose = factory.getWoodTexture();
      factory.dispose();
      const afterDispose = factory.getWoodTexture();
      expect(afterDispose).not.toBe(beforeDispose);
      factory.dispose();
    } finally {
      restore();
    }
  });

  it('generates and caches procedural bump maps and enriched biome/architectural textures safely in Node mock', () => {
    const restore = createMockCanvasEnvironment();
    try {
      const factory = new TextureFactory();
      const bumpKinds: BumpTextureKind[] = [
        'terrain',
        'wood',
        'brick',
        'metal',
        'rock',
        'sandstone',
        'castle',
        'cyber',
        'siding',
        'roof',
        'bark',
        'basalt',
      ];

      const defaultBump = factory.getBumpTexture();
      expect(defaultBump).toBeInstanceOf(THREE.CanvasTexture);
      expect(defaultBump.colorSpace).toBe(THREE.NoColorSpace);
      expect(defaultBump.wrapS).toBe(THREE.RepeatWrapping);
      expect(defaultBump.wrapT).toBe(THREE.RepeatWrapping);
      expect(factory.getBumpTexture('terrain')).toBe(defaultBump);

      const bumpMapSet = new Set<THREE.CanvasTexture>();
      for (const kind of bumpKinds) {
        const b = factory.getBumpTexture(kind);
        expect(b).toBeInstanceOf(THREE.CanvasTexture);
        expect(b.colorSpace).toBe(THREE.NoColorSpace);
        expect(b.wrapS).toBe(THREE.RepeatWrapping);
        expect(b.wrapT).toBe(THREE.RepeatWrapping);
        expect(factory.getBumpTexture(kind)).toBe(b);
        bumpMapSet.add(b);
      }
      expect(bumpMapSet.size).toBe(bumpKinds.length);

      // Enriched color textures
      for (const tex of [
        factory.getSandstoneTexture(),
        factory.getCastleStoneTexture(),
        factory.getCyberMetalTexture(),
        factory.getBasaltTexture(),
        factory.getSnowTexture(),
        factory.getMarbleTexture(),
      ]) {
        expect(tex).toBeInstanceOf(THREE.CanvasTexture);
        expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      }

      factory.dispose();
      expect(factory.getBumpTexture('brick')).not.toBe(bumpMapSet.values().next().value);
      factory.dispose();
    } finally {
      restore();
    }
  });
});

describe('TerrainSystem', () => {
  it('generates deterministic island geometry and matches exact barycentric triangle heights', () => {
    const t1 = new TerrainSystem(4201);
    const t2 = new TerrainSystem(4201);
    expect(t1.getHeightAt(12.3, -44.7)).toBe(t2.getHeightAt(12.3, -44.7));

    const mesh = t1.getMesh();
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.receiveShadow).toBe(true);
    expect((mesh.material as THREE.MeshStandardMaterial).bumpMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(t1.getMesh()).toBe(mesh); // lazily cached

    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const indexAttr = mesh.geometry.getIndex()!;
    const stride = t1.segments + 1;

    // 1. Exact vertex heights match
    for (let iz = 0; iz <= t1.segments; iz += 20) {
      for (let ix = 0; ix <= t1.segments; ix += 20) {
        const idx = iz * stride + ix;
        const vx = posAttr.getX(idx);
        const vy = posAttr.getY(idx);
        const vz = posAttr.getZ(idx);
        expect(t1.getHeightAt(vx, vz)).toBeCloseTo(vy, 4);
      }
    }

    // 2. Arbitrary interior points across both Triangle 1 (u+v<=1) and Triangle 2 (u+v>1)
    const testPoints: Array<[number, number]> = [
      [-68.7, -33.8],
      [-66.1, -31.2],
      [11.4, -108.9],
      [14.6, -105.4],
      [142.2, -138.8],
      [53.8, 134.9],
      [-212.1, 88.3],
    ];

    for (const [px, pz] of testPoints) {
      const gx = (px + WORLD_HALF) / t1.cellSize;
      const gz = (pz + WORLD_HALF) / t1.cellSize;
      const ix = Math.floor(gx);
      const iz = Math.floor(gz);
      const u = gx - ix;
      const v = gz - iz;
      const quadIdx = iz * t1.segments + ix;
      const triOffset = u + v <= 1 ? quadIdx * 6 : quadIdx * 6 + 3;

      const ia = indexAttr.getX(triOffset);
      const ib = indexAttr.getX(triOffset + 1);
      const ic = indexAttr.getX(triOffset + 2);

      const ax = posAttr.getX(ia);
      const ay = posAttr.getY(ia);
      const az = posAttr.getZ(ia);
      const bx = posAttr.getX(ib);
      const by = posAttr.getY(ib);
      const bz = posAttr.getZ(ib);
      const cx = posAttr.getX(ic);
      const cy = posAttr.getY(ic);
      const cz = posAttr.getZ(ic);

      // Compute barycentric coords in XZ
      const denom = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const w0 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / denom;
      const w1 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / denom;
      const w2 = 1 - w0 - w1;
      const expectedY = w0 * ay + w1 * by + w2 * cy;

      expect(t1.getHeightAt(px, pz)).toBeCloseTo(expectedY, 5);

      // Normal must be unit-length, upward, and orthogonal to triangle edges
      const n = t1.getNormalAt(px, pz);
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
      expect(n.y).toBeGreaterThan(0);
      const dot1 = n.x * (bx - ax) + n.y * (by - ay) + n.z * (bz - az);
      const dot2 = n.x * (cx - ax) + n.y * (cy - ay) + n.z * (cz - az);
      expect(dot1).toBeCloseTo(0, 4);
      expect(dot2).toBeCloseTo(0, 4);
    }

    t1.dispose();
    t2.dispose();
  });

  it('shapes coastal beaches below water outside ISLAND_RADIUS and builds Crystal Basin + POI plateaus', () => {
    const terrain = new TerrainSystem(4201);

    // Outer ocean around all 8 directions outside ISLAND_RADIUS + margin
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ox = Math.cos(a) * (ISLAND_RADIUS + 25);
      const oz = Math.sin(a) * (ISLAND_RADIUS + 25);
      expect(terrain.getHeightAt(ox, oz)).toBeLessThan(WATER_LEVEL);
      expect(terrain.isWater(ox, oz)).toBe(true);
      expect(terrain.getBiomeAt(ox, oz)).toBe('ocean');
    }

    // All 10 POIs returned
    const pois = terrain.getPOIs();
    expect(pois).toHaveLength(10);

    // Verify all 10 biome types can be sampled cleanly
    const sampledBiomes = new Set([
      terrain.getBiomeAt(ISLAND_RADIUS + 30, 0), // ocean
      terrain.getBiomeAt(0, 0), // grassland
      terrain.getBiomeAt(165, -165), // forest (Whispering Pines)
      terrain.getBiomeAt(40, 125), // highland (Crater Depot)
      terrain.getBiomeAt(-75, -40), // urban (Metro Towers)
      terrain.getBiomeAt(-10, -245), // snow (Frostpeak Citadel)
      terrain.getBiomeAt(-225, -15), // desert (Sunken Oasis)
      terrain.getBiomeAt(-175, 125), // volcanic (Scorched Caldera)
      terrain.getBiomeAt(160, 165), // cyber (Skyline Spire)
    ]);
    expect(sampledBiomes.has('ocean')).toBe(true);
    expect(sampledBiomes.has('grassland')).toBe(true);
    expect(sampledBiomes.has('forest')).toBe(true);
    expect(sampledBiomes.has('highland')).toBe(true);
    expect(sampledBiomes.has('urban')).toBe(true);
    expect(sampledBiomes.has('snow')).toBe(true);
    expect(sampledBiomes.has('desert')).toBe(true);
    expect(sampledBiomes.has('volcanic')).toBe(true);
    expect(sampledBiomes.has('cyber')).toBe(true);

    // Check beach band along coastline
    let foundBeach = false;
    for (let r = ISLAND_RADIUS - 35; r <= ISLAND_RADIUS + 5; r += 2) {
      if (terrain.getBiomeAt(r, 0) === 'beach') {
        foundBeach = true;
        break;
      }
    }
    expect(foundBeach).toBe(true);

    // River Gorge draining Crystal Basin south to Southern Ocean
    for (const [rx, rz] of [
      RIVER_POLYLINE[2],
      RIVER_POLYLINE[3],
      RIVER_POLYLINE[5],
    ]) {
      expect(terrain.isWater(rx, rz)).toBe(true);
    }

    // Crystal Basin center island r <= 18 at y = 2.5, lake around r = 35 at y ~ -1.8
    const cb = pois.find((p) => p.id === 'crystal_basin')!;
    expect(terrain.getHeightAt(cb.x, cb.z)).toBeCloseTo(2.5, 2);
    expect(terrain.getHeightAt(cb.x + 14, cb.z)).toBeCloseTo(2.5, 2);
    expect(terrain.isWater(cb.x, cb.z)).toBe(false);

    const lakeY = terrain.getHeightAt(cb.x + 35, cb.z);
    expect(lakeY).toBeLessThan(-1.4);
    expect(lakeY).toBeGreaterThan(-2.1);
    expect(terrain.isWater(cb.x + 35, cb.z)).toBe(true);

    // Other 9 POIs sit on dry elevated plateaus
    for (const poi of pois) {
      if (poi.id === 'crystal_basin') continue;
      expect(terrain.getHeightAt(poi.x, poi.z)).toBeCloseTo(poi.plateauY, 2);
      expect(terrain.isWater(poi.x, poi.z)).toBe(false);
    }

    // Safe map canvas call both without and with DOM
    const nodeCanvas = terrain.getMapTextureCanvas();
    expect(nodeCanvas.width).toBe(1024);
    expect(nodeCanvas.height).toBe(1024);

    const restore = createMockCanvasEnvironment();
    try {
      terrain.setBuildingFootprints([
        { x: -75, z: -40, w: 12, d: 12, color: '#ef4444' },
      ]);
      const domCanvas = terrain.getMapTextureCanvas();
      expect(domCanvas.width).toBe(1024);
      expect(domCanvas.height).toBe(1024);
    } finally {
      restore();
    }

    terrain.dispose();
  });
});

describe('WorldBuilder', () => {
  it('builds batched walkable structures across all 10 POIs with sky-island, colliders, stairs, and doorways', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const res = builder.build(terrain, 'high');

    // Batched static primitives keep draw calls low despite massive structural complexity
    expect(res.group.children.length).toBeGreaterThan(15);
    expect(res.group.children.length).toBeLessThan(350);
    expect(res.colliders.length).toBeGreaterThan(300);
    expect(res.chestSpots.length).toBeGreaterThanOrEqual(55);
    expect(res.floorLootSpots.length).toBeGreaterThanOrEqual(90);
    expect(res.buildingFootprints.length).toBeGreaterThanOrEqual(25);

    const skyColliders = res.colliders.filter(
      (c) => c.tag === 'building_sky_island' && c.maxY > 40,
    );
    expect(skyColliders.length).toBeGreaterThan(0);

    // Golden mythic vault pedestals on Skyline Sky-Island (160, 170.2) & Frostpeak Sanctum (-10, -237)
    const skyPedestal = res.colliders.some(
      (c) =>
        c.tag === 'building_sky_island' &&
        c.minY > 44 &&
        c.minX < 160 &&
        c.maxX > 160 &&
        c.minZ < 170.2 &&
        c.maxZ > 170.2,
    );
    expect(skyPedestal).toBe(true);

    const frostPedestal = res.colliders.some(
      (c) =>
        c.tag === 'building_castle' &&
        c.minY >= 36 &&
        c.minX < -10 &&
        c.maxX > -10 &&
        c.minZ < -237 &&
        c.maxZ > -237,
    );
    expect(frostPedestal).toBe(true);

    // Streetlamp lanterns across Urban & Suburbs POIs
    const lamps = res.colliders.filter((c) => c.tag === 'building_lamp');
    expect(lamps.length).toBeGreaterThanOrEqual(20);

    builder.update(0.016, 1.0);

    // Validate all colliders are finite and non-inverted
    for (const c of res.colliders) {
      expect(Number.isFinite(c.minX)).toBe(true);
      expect(Number.isFinite(c.maxY)).toBe(true);
      expect(c.maxX).toBeGreaterThan(c.minX);
      expect(c.maxY).toBeGreaterThan(c.minY);
      expect(c.maxZ).toBeGreaterThan(c.minZ);
    }

    // Every staircase step height <= STEP_HEIGHT (0.55m)
    const stairs = res.colliders.filter((c) => c.tag === 'building_stair');
    expect(stairs.length).toBeGreaterThan(30);
    for (const st of stairs) {
      expect(st.maxY - st.minY).toBeLessThanOrEqual(STEP_HEIGHT + 0.01);
    }

    // Verify open front doorway of Metro Towers Clock Tower (-75 - 19 = -94, -40 - 16 = -56, w=10, d=10, rot=0)
    // Door center is at local (x=+1.0, z=+5.0 - 0.18), width 2.4m, height 2.65m above foundation 0.22m
    const clockBaseY = terrain.getHeightAt(-94, -56) + 0.22;
    const doorCheckX = -94 + 1.0;
    const doorCheckZ = -56 + 5.0 - 0.18;
    const doorMinY = clockBaseY + 0.05;
    const doorMaxY = clockBaseY + PLAYER_HEIGHT;

    const blockingDoor = res.colliders.filter(
      (c) =>
        c.tag === 'building_wall' &&
        c.maxX > doorCheckX - PLAYER_RADIUS &&
        c.minX < doorCheckX + PLAYER_RADIUS &&
        c.maxZ > doorCheckZ - 0.5 &&
        c.minZ < doorCheckZ + 0.5 &&
        c.maxY > doorMinY &&
        c.minY < doorMaxY,
    );
    expect(blockingDoor).toHaveLength(0);

    // Check POIS coverage for footprints
    for (const poi of POIS) {
      const hasNear = res.buildingFootprints.some(
        (fp) => Math.hypot(fp.x - poi.x, fp.z - poi.z) <= poi.radius,
      );
      expect(hasNear).toBe(true);
    }

    builder.dispose();
    terrain.dispose();
  });
});

describe('PropsAndLoot', () => {
  it('populates 400+ props, 80+ chests, 150+ loot drops outside buildings and water across all 13 prop kinds', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'medium');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);

    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const props = pal.getProps();
    const chests = pal.getChests();
    const loot = pal.getLootDrops();

    expect(props.length).toBeGreaterThanOrEqual(400);
    expect(chests.length).toBeGreaterThanOrEqual(80);
    expect(loot.length).toBeGreaterThanOrEqual(150);

    // Verify all 13 PropKinds exist
    const kinds = new Set(props.map((p) => p.kind));
    expect(kinds).toEqual(
      new Set([
        'tree_pine',
        'tree_oak',
        'tree_redwood',
        'tree_snow_pine',
        'tree_palm',
        'cactus',
        'rock',
        'obsidian_crystal',
        'cyber_pylon',
        'car',
        'shipping_container',
        'crate',
        'fence',
      ]),
    );

    // No prop spawns underwater or off terrain surface
    for (const p of props) {
      expect(terrain.isWater(p.x, p.z)).toBe(false);
      expect(p.y).toBeCloseTo(terrain.getHeightAt(p.x, p.z), 4);
    }

    expect(pal.getActivePropColliders().length).toBe(props.length);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('supports harvesting with weakpoint crits, chest opening, loot rolling, and supply drops', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    // 1. Weakpoint crit & destruction
    const impactSpy = vi.fn();
    const wpSpy = vi.fn();
    bus.on('vfx:impact', impactSpy);
    bus.on('vfx:weakpoint', wpSpy);

    const prop = pal.getProps()[0];
    const startHp = prop.hp;
    const wp = prop.weakpointWorldPos!;
    const critRes = pal.damageProp(prop.id, 30, wp, true);
    expect(critRes.hit).toBe(true);
    expect(critRes.isCrit).toBe(true);
    expect(critRes.matType).toBe(prop.material);
    expect(critRes.yieldAmount).toBeGreaterThan(0);
    expect(prop.hp).toBe(startHp - 60);
    expect(impactSpy).toHaveBeenCalledTimes(1);
    expect(wpSpy).toHaveBeenCalled();

    // Destroy prop
    const initialActiveCols = pal.getActivePropColliders().length;
    const killRes = pal.damageProp(prop.id, prop.hp + 50, { x: prop.x, y: prop.y + 1, z: prop.z }, false);
    expect(killRes.destroyed).toBe(true);
    expect(prop.destroyed).toBe(true);
    expect(pal.getActivePropColliders().length).toBe(initialActiveCols - 1);

    // 2. Chest opening
    const chest = pal.getChests()[0];
    const lootBefore = pal.getLootDrops().length;
    expect(pal.openChest(chest.id)).toBe(true);
    expect(chest.opened).toBe(true);
    expect(pal.getLootDrops().length).toBeGreaterThan(lootBefore);
    expect(pal.openChest(chest.id)).toBe(false);

    // Animate chest lid & scattered loot settling
    for (let i = 0; i < 60; i++) {
      pal.update(0.05, i * 0.05);
    }
    expect(chest.openProgress).toBe(1);

    // 3. Weapon loot rolling respects allowedRarities & magSize
    for (let i = 0; i < 100; i++) {
      const item = pal.rollWeaponLoot(i % 2 === 0);
      const def = WEAPONS[item.weaponId];
      expect(def.allowedRarities).toContain(item.rarity);
      expect(item.magAmmo).toBe(def.magSize);
    }

    // 4. Spawn & remove loot drop
    const customDrop = pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { materials: { type: 'wood', amount: 50 } },
    );
    expect(pal.getLootDrops().some((d) => d.id === customDrop.id)).toBe(true);
    expect(pal.removeLootDrop(customDrop.id)?.id).toBe(customDrop.id);
    expect(pal.removeLootDrop(customDrop.id)).toBeNull();

    // 5. Supply drop descend -> land -> open
    const sd = pal.spawnSupplyDrop(-75, -40);
    expect(sd.state).toBe('descending');
    expect(pal.getSupplyDrops()).toHaveLength(1);
    for (let i = 0; i < 200; i++) {
      pal.update(0.1, i * 0.1);
    }
    expect(sd.state).toBe('landed');
    expect(sd.y).toBeCloseTo(sd.targetY, 3);
    expect(pal.openSupplyDrop(sd.id)).toBe(true);
    expect(sd.state).toBe('opened');
    expect(pal.openSupplyDrop(sd.id)).toBe(false);

    // 6. Reset repopulates cleanly
    pal.reset(world.chestSpots, world.floorLootSpots, world.colliders);
    expect(pal.getProps().length).toBeGreaterThanOrEqual(260);
    expect(pal.getSupplyDrops()).toHaveLength(0);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('spawns 3 deterministic Loot Llamas and bursts mats, ammo, chug_splash & shockwave_grenade when damaged or opened', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();

    const pal1 = new PropsAndLoot(terrain, bus, 4201);
    const pal2 = new PropsAndLoot(terrain, bus, 4201);
    pal1.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    pal2.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const llamas1 = pal1.getLlamas();
    const llamas2 = pal2.getLlamas();
    expect(llamas1).toHaveLength(3);
    expect(llamas2).toHaveLength(3);

    for (let i = 0; i < 3; i++) {
      expect(llamas1[i].id).toBe(llamas2[i].id);
      expect(llamas1[i].x).toBe(llamas2[i].x);
      expect(llamas1[i].y).toBe(llamas2[i].y);
      expect(llamas1[i].z).toBe(llamas2[i].z);
      expect(llamas1[i].opened).toBe(false);
      expect(llamas1[i].hp).toBe(llamas1[i].maxHp);
      expect(llamas1[i].maxHp).toBeGreaterThan(0);
      expect(terrain.isWater(llamas1[i].x, llamas1[i].z)).toBe(false);
      expect(llamas1[i].y).toBeCloseTo(terrain.getHeightAt(llamas1[i].x, llamas1[i].z), 4);
    }

    // Active prop colliders invariant stays untouched
    expect(pal1.getActivePropColliders().length).toBe(pal1.getProps().length);
    expect(pal1.getActiveLlamaColliders()).toHaveLength(3);

    // Non-lethal damage then lethal damage on llama_0
    const l0 = llamas1[0];
    const brokePartial = pal1.damageLlama(l0.id, 75, { x: l0.x, y: l0.y + 1, z: l0.z });
    expect(brokePartial).toBe(false);
    expect(l0.hp).toBe(l0.maxHp - 75);
    expect(l0.opened).toBe(false);

    const dropsBeforeBreak = pal1.getLootDrops().length;
    const brokeLethal = pal1.damageLlama(l0.id, l0.hp + 50, { x: l0.x, y: l0.y + 1, z: l0.z });
    expect(brokeLethal).toBe(true);
    expect(l0.hp).toBe(0);
    expect(l0.opened).toBe(true);
    expect(pal1.getActiveLlamaColliders()).toHaveLength(2);

    const burstDrops = pal1.getLootDrops().slice(dropsBeforeBreak);
    expect(burstDrops.some((d) => d.materials?.type === 'wood' && d.materials.amount >= 100)).toBe(true);
    expect(burstDrops.some((d) => d.materials?.type === 'brick' && d.materials.amount >= 100)).toBe(true);
    expect(burstDrops.some((d) => d.materials?.type === 'metal' && d.materials.amount >= 100)).toBe(true);
    expect(burstDrops.some((d) => Boolean(d.ammo && d.ammo.amount > 0))).toBe(true);
    expect(burstDrops.some((d) => d.item?.weaponId === 'chug_splash')).toBe(true);
    expect(burstDrops.some((d) => d.item?.weaponId === 'shockwave_grenade')).toBe(true);

    // Already broken llama ignores further damage/open
    expect(pal1.damageLlama(l0.id, 50, { x: l0.x, y: l0.y + 1, z: l0.z })).toBe(false);
    expect(pal1.openLlama(l0.id)).toBe(false);

    // Direct openLlama on llama_1
    const l1 = llamas1[1];
    const dropsBeforeOpen = pal1.getLootDrops().length;
    expect(pal1.openLlama(l1.id)).toBe(true);
    expect(l1.opened).toBe(true);
    expect(pal1.openLlama(l1.id)).toBe(false);
    expect(pal1.getActiveLlamaColliders()).toHaveLength(1);

    const openBurst = pal1.getLootDrops().slice(dropsBeforeOpen);
    expect(openBurst.some((d) => d.materials?.type === 'wood')).toBe(true);
    expect(openBurst.some((d) => d.materials?.type === 'brick')).toBe(true);
    expect(openBurst.some((d) => d.materials?.type === 'metal')).toBe(true);
    expect(openBurst.some((d) => Boolean(d.ammo))).toBe(true);
    expect(openBurst.some((d) => d.item?.weaponId === 'chug_splash')).toBe(true);
    expect(openBurst.some((d) => d.item?.weaponId === 'shockwave_grenade')).toBe(true);

    // Update & reset repopulates 3 fresh unopened llamas
    pal1.update(0.05, 1.0);
    pal1.reset(world.chestSpots, world.floorLootSpots, world.colliders);
    expect(pal1.getLlamas()).toHaveLength(3);
    expect(pal1.getLlamas().every((l) => !l.opened && l.hp === l.maxHp)).toBe(true);

    pal1.dispose();
    pal2.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('drops heavy_shotgun, shockwave_grenade, frag_grenade, and chug_splash across chest & floor loot pools', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const rolledFloorWeapons = new Set<string>();
    const rolledChestWeapons = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      rolledFloorWeapons.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      rolledChestWeapons.add(cw.weaponId);
    }
    expect(rolledFloorWeapons.has('heavy_shotgun')).toBe(true);
    expect(rolledChestWeapons.has('heavy_shotgun')).toBe(true);

    // Open all chests and inspect combined floor + chest loot pool items
    for (const c of pal.getChests()) {
      pal.openChest(c.id);
    }
    const allItemIds = new Set(
      pal
        .getLootDrops()
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(allItemIds.has('heavy_shotgun')).toBe(true);
    expect(allItemIds.has('shockwave_grenade')).toBe(true);
    expect(allItemIds.has('frag_grenade')).toBe(true);
    expect(allItemIds.has('chug_splash')).toBe(true);

    // Also validate rollConsumable emits valid rarity & stackCount for throwables
    const utilityIds = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const u = pal.rollConsumable();
      const def = WEAPONS[u.weaponId];
      expect(def.allowedRarities).toContain(u.rarity);
      expect(u.magAmmo).toBe(0);
      expect(u.stackCount).toBeGreaterThanOrEqual(1);
      utilityIds.add(u.weaponId);
    }
    expect(utilityIds.has('shockwave_grenade')).toBe(true);
    expect(utilityIds.has('frag_grenade')).toBe(true);
    expect(utilityIds.has('chug_splash')).toBe(true);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('EnvironmentFX', () => {
  it('builds sky dome, 35+ clouds, ocean, and Battle Bus, and animates cleanly', () => {
    const fx = new EnvironmentFX(4201);
    const group = fx.getGroup();
    expect(group).toBeInstanceOf(THREE.Group);

    // SkyDome + OceanWater + 42 clouds + BattleBus = 45 children
    expect(group.children.length).toBeGreaterThanOrEqual(38);

    fx.setBusTransform({ x: 10, y: 175, z: -20 }, 1.25, true);
    const bus = group.getObjectByName('BattleBus')!;
    expect(bus.visible).toBe(true);
    expect(bus.position.x).toBe(10);
    expect(bus.position.y).toBe(175);
    expect(bus.rotation.y).toBeCloseTo(1.25, 5);

    for (let i = 0; i < 20; i++) {
      fx.update(0.1, i * 0.1);
    }
    const cloudGroup = group.children.find(
      (c) => c.name === 'CloudGroup',
    ) as THREE.Group | undefined;
    expect(cloudGroup).toBeDefined();
    const cloudMats = new Set(
      cloudGroup!.children.map((m) => (m as THREE.Mesh).material),
    );
    expect(cloudMats.size).toBeGreaterThanOrEqual(2);

    const ocean = group.getObjectByName('OceanWater') as THREE.Mesh;
    expect(ocean).toBeDefined();
    const oceanMat = ocean.material as THREE.ShaderMaterial;
    expect(oceanMat.uniforms.uTime).toBeDefined();
    expect(oceanMat.uniforms.uIslandRadius).toBeDefined();
    expect(oceanMat.uniforms.uSunDir).toBeDefined();
    expect(oceanMat.uniforms.uDayPhase).toBeDefined();

    const xBefore = cloudGroup!.position.x;
    fx.update(1.0, 3.0);
    expect(cloudGroup!.position.x).not.toBe(xBefore);

    fx.setBusTransform({ x: 0, y: 175, z: 0 }, 0, false);
    expect(bus.visible).toBe(false);

    fx.dispose();
  });
});

describe('StormSystem', () => {
  it('progresses cleanly across all 6 phases and tracks in-storm state accurately', () => {
    const storm = new StormSystem(4201);
    const mesh = storm.getMesh();
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
    const mat = mesh.material as THREE.ShaderMaterial;
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);

    let st = storm.getState();
    expect(st.phase).toBe(1);
    expect(st.totalPhases).toBe(6);
    expect(st.currentRadius).toBe(WORLD_HALF);
    expect(st.isShrinking).toBe(false);
    expect(storm.isInStorm(0, 0)).toBe(false);
    expect(storm.isInStorm(WORLD_HALF + 20, 0)).toBe(true);

    // Step through all 6 phases
    for (let idx = 0; idx < STORM_PHASES.length; idx++) {
      const cfg = STORM_PHASES[idx];
      const waitRes = storm.update(cfg.waitDuration);
      expect(waitRes.shrinkStarted).toBe(true);
      expect(storm.getState().isShrinking).toBe(true);

      // Mid-shrink check
      const midRes = storm.update(cfg.shrinkDuration * 0.5);
      expect(midRes.phaseChanged).toBe(false);
      expect(storm.getState().currentRadius).toBeGreaterThan(cfg.targetRadius - 0.01);

      // Finish shrink
      const endRes = storm.update(cfg.shrinkDuration * 0.5);
      st = storm.getState();
      if (idx < STORM_PHASES.length - 1) {
        expect(endRes.phaseChanged).toBe(true);
        expect(st.phase).toBe(idx + 2);
        expect(st.currentRadius).toBeCloseTo(cfg.targetRadius, 3);
      } else {
        expect(st.currentRadius).toBe(0);
        expect(storm.isInStorm(0, 0)).toBe(true);
      }
    }

    storm.reset(4201);
    expect(storm.getState().phase).toBe(1);
    expect(storm.getState().currentRadius).toBe(WORLD_HALF);

    storm.dispose();
  });

  it('supports solo, zero_build, and faster blitz storm rules deterministically', () => {
    const solo = new StormSystem(4201);
    const zeroBuild = new StormSystem(4201);
    zeroBuild.reset(4201, 'zero_build');

    expect(zeroBuild.getState()).toEqual(solo.getState());
    solo.update(20);
    zeroBuild.update(20);
    expect(zeroBuild.getState()).toEqual(solo.getState());

    const blitz = new StormSystem(4201);
    blitz.reset(4201, 'blitz');
    expect(blitz.getMode()).toBe('blitz');

    const blitzInit = blitz.getState();
    expect(blitzInit.phase).toBe(1);
    expect(blitzInit.totalPhases).toBe(6);
    expect(blitzInit.currentRadius).toBeCloseTo(230, 1);
    expect(blitzInit.currentRadius).toBeLessThan(WORLD_HALF);
    expect(blitzInit.phaseDuration).toBeCloseTo(STORM_PHASES[0].waitDuration * 0.55, 4);

    // Step blitz through all 6 phases and check 0.55x shrink durations and 1.5x late-phase DPS
    const soloFresh = new StormSystem(4201);
    soloFresh.reset(4201, 'solo');
    for (let idx = 0; idx < STORM_PHASES.length; idx++) {
      const soloCfg = STORM_PHASES[idx];
      const stBeforeWait = blitz.getState();
      expect(stBeforeWait.phase).toBe(idx + 1);
      expect(stBeforeWait.phaseDuration).toBeCloseTo(soloCfg.waitDuration * 0.55, 4);

      if (idx >= 3) {
        expect(stBeforeWait.dps).toBeCloseTo(soloCfg.dps * 1.5, 4);
      }

      const waitRes = blitz.update(stBeforeWait.phaseDuration);
      expect(waitRes.shrinkStarted).toBe(true);
      const stShrink = blitz.getState();
      expect(stShrink.isShrinking).toBe(true);
      expect(stShrink.phaseDuration).toBeCloseTo(soloCfg.shrinkDuration * 0.55, 4);

      const endRes = blitz.update(stShrink.phaseDuration);
      if (idx < STORM_PHASES.length - 1) {
        expect(endRes.phaseChanged).toBe(true);
      } else {
        expect(blitz.getState().currentRadius).toBe(0);
      }
    }

    // Omitting mode in reset() restores solo defaults cleanly
    blitz.reset(4201);
    expect(blitz.getMode()).toBe('solo');
    expect(blitz.getState()).toEqual(soloFresh.getState());

    solo.dispose();
    zeroBuild.dispose();
    blitz.dispose();
    soloFresh.dispose();
  });
});

describe('WorldInteractables & EnvironmentDetail', () => {
  it('constructs 10 launch pads/geysers, 6 energy ziplines, instanced micro-flora, and circling birds', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'medium');

    const interactables = new WorldInteractables(terrain);
    const pads = interactables.getLaunchPads();
    const ziplines = interactables.getZiplines();
    expect(pads).toHaveLength(10);
    expect(ziplines).toHaveLength(6);
    expect(pads.some((p) => p.kind === 'launch_pad')).toBe(true);
    expect(pads.some((p) => p.kind === 'geyser')).toBe(true);
    for (const p of pads) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
    for (const z of ziplines) {
      expect(Number.isFinite(z.start.x)).toBe(true);
      expect(Number.isFinite(z.end.z)).toBe(true);
      expect(z.speed).toBeGreaterThan(10);
    }
    interactables.update(0.016, 1.0);
    interactables.dispose();

    const detail = new EnvironmentDetail(terrain, world.colliders, 'high', 4201);
    expect(detail.getInstancedMeshCount()).toBeGreaterThanOrEqual(4);
    expect(detail.getBirdCount()).toBeGreaterThanOrEqual(20);
    detail.update(0.016, 1.0);
    detail.dispose();

    builder.dispose();
    terrain.dispose();
  });

  it('constructs 3 interactive Mythic Boss Vaults at Skyline, Caldera & Frostpeak and unlocks smoothly', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const soundSpy = vi.fn();
    bus.on('sound:play', soundSpy);

    const interactables = new WorldInteractables(terrain, bus);
    const vaults = interactables.getVaults();
    expect(vaults).toHaveLength(3);

    const poiIds = new Set(vaults.map((v) => v.poiId));
    expect(poiIds).toEqual(
      new Set(['skyline_spire', 'scorched_caldera', 'frostpeak_citadel']),
    );
    for (const v of vaults) {
      expect(v.unlocked).toBe(false);
      expect(v.opened).toBe(false);
      expect(v.bossName.length).toBeGreaterThan(3);
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
      expect(terrain.isWater(v.x, v.z)).toBe(false);
    }

    const colsBefore = interactables.getVaultColliders().length;
    expect(colsBefore).toBe(15); // 3 vaults * (4 bunker walls/roof + 1 door)

    const targetVault = vaults[0];
    expect(interactables.unlockVault('nonexistent_vault')).toEqual({ unlocked: false });

    const unlockRes = interactables.unlockVault(targetVault.id);
    expect(unlockRes.unlocked).toBe(true);
    expect(unlockRes.lootPos).toBeDefined();
    expect(Number.isFinite(unlockRes.lootPos!.x)).toBe(true);
    expect(Number.isFinite(unlockRes.lootPos!.y)).toBe(true);
    expect(Number.isFinite(unlockRes.lootPos!.z)).toBe(true);
    expect(targetVault.unlocked).toBe(true);
    expect(targetVault.opened).toBe(false);
    expect(soundSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vault_unlock' }),
    );
    expect(interactables.getVaultColliders().length).toBe(colsBefore - 1);

    // Double unlock rejected cleanly
    expect(interactables.unlockVault(targetVault.id)).toEqual({ unlocked: false });

    // Door animates open smoothly over update()
    for (let i = 0; i < 30; i++) {
      interactables.update(0.05, i * 0.05);
    }
    expect(targetVault.opened).toBe(true);

    interactables.dispose();
    terrain.dispose();
  });

  it('constructs 6 upgrade benches, 6 campfires, and 24 slurp barrels clear of water/buildings with full reset support', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 0.6) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 1.8 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    // 1. 6 Weapon Upgrade Benches at the 6 specified POIs
    const benches = interactables.getUpgradeBenches();
    expect(benches).toHaveLength(6);
    expect(new Set(benches.map((b) => b.poiId))).toEqual(
      new Set([
        'metro_towers',
        'market_row',
        'sunny_suburbs',
        'crater_depot',
        'skyline_spire',
        'frostpeak_citadel',
      ]),
    );
    expect(interactables.getUpgradeBenchColliders()).toHaveLength(6);

    for (const b of benches) {
      expect(terrain.isWater(b.x, b.z)).toBe(false);
      expect(b.y).toBeCloseTo(terrain.getHeightAt(b.x, b.z), 4);
      expect(terrain.getNormalAt(b.x, b.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(b.x, b.y, b.z, 1.0)).toBe(true);
      for (const v of interactables.getVaults()) {
        expect(Math.hypot(b.x - v.x, b.z - v.z)).toBeGreaterThan(4.0);
      }
      for (const p of interactables.getLaunchPads()) {
        expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeGreaterThan(3.5);
      }
    }

    const b0 = benches[0];
    expect(interactables.getNearestUpgradeBench(b0.x + 2, b0.y, b0.z, 3.8)?.id).toBe(b0.id);
    expect(interactables.getNearestUpgradeBench(b0.x + 10, b0.y, b0.z, 3.8)).toBeNull();
    expect(interactables.getNearestUpgradeBench(b0.x + 10, b0.y, b0.z)?.id).toBe(b0.id);

    // 2. 6 Cozy Campfires at the 6 scenic POIs
    const campfires = interactables.getCampfires();
    expect(campfires).toHaveLength(6);
    expect(new Set(campfires.map((c) => c.poiId))).toEqual(
      new Set([
        'whispering_pines',
        'crystal_basin',
        'sunken_oasis',
        'sunny_suburbs',
        'frostpeak_citadel',
        'scorched_caldera',
      ]),
    );

    for (const cf of campfires) {
      expect(cf.lit).toBe(false);
      expect(cf.remainingSec).toBe(25);
      expect(cf.maxDurationSec).toBe(25);
      expect(cf.healPerSec).toBe(3);
      expect(cf.radius).toBe(5.5);
      expect(terrain.isWater(cf.x, cf.z)).toBe(false);
      expect(cf.y).toBeCloseTo(terrain.getHeightAt(cf.x, cf.z), 4);
      expect(terrain.getNormalAt(cf.x, cf.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(cf.x, cf.y, cf.z, 0.8)).toBe(true);
    }

    const cf0 = campfires[0];
    const cfGroup = interactables.getGroup().getObjectByName(`Campfire_${cf0.id}`) as THREE.Group;
    expect(cfGroup).toBeDefined();
    const cfFlameGroup = cfGroup.children.find((ch) => ch instanceof THREE.Group) as THREE.Group;
    expect(cfFlameGroup.visible).toBe(false);

    expect(interactables.getActiveCampfireHealAt(cf0.x, cf0.y, cf0.z)).toBe(0);
    expect(interactables.igniteCampfire('nonexistent_campfire')).toBe(false);
    expect(interactables.igniteCampfire(cf0.id)).toBe(true);
    expect(cf0.lit).toBe(true);
    expect(cfFlameGroup.visible).toBe(true);
    expect(interactables.igniteCampfire(cf0.id)).toBe(false); // already lit

    expect(interactables.getActiveCampfireHealAt(cf0.x + 5.0, cf0.y, cf0.z)).toBe(3);
    expect(interactables.getActiveCampfireHealAt(cf0.x + 6.0, cf0.y, cf0.z)).toBe(0);
    expect(interactables.getActiveCampfireHealAt(cf0.x, cf0.y + 6.0, cf0.z)).toBe(0);

    interactables.update(10, 10);
    expect(cf0.remainingSec).toBeCloseTo(15, 4);
    expect(cf0.lit).toBe(true);
    expect(interactables.getActiveCampfireHealAt(cf0.x, cf0.y, cf0.z)).toBe(3);

    interactables.update(16, 26);
    expect(cf0.remainingSec).toBe(0);
    expect(cf0.lit).toBe(false);
    expect(cfFlameGroup.visible).toBe(false);
    expect(interactables.getActiveCampfireHealAt(cf0.x, cf0.y, cf0.z)).toBe(0);
    expect(interactables.igniteCampfire(cf0.id)).toBe(false); // burned out until reset

    // 3. 24 Destructible Slurp Barrels
    const barrels = interactables.getSlurpBarrels();
    expect(barrels).toHaveLength(24);
    expect(interactables.getSlurpBarrelColliders()).toHaveLength(24);
    expect(interactables.getStationColliders()).toHaveLength(30); // 6 benches + 24 barrels
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    for (const sb of barrels) {
      expect(sb.hp).toBe(40);
      expect(sb.maxHp).toBe(40);
      expect(sb.shieldAmount).toBe(15);
      expect(sb.destroyed).toBe(false);
      expect(terrain.isWater(sb.x, sb.z)).toBe(false);
      expect(sb.y).toBeCloseTo(terrain.getHeightAt(sb.x, sb.z), 4);
      expect(terrain.getNormalAt(sb.x, sb.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(sb.x, sb.y, sb.z, 0.55)).toBe(true);
      for (const other of barrels) {
        if (other.id !== sb.id) {
          expect(Math.hypot(sb.x - other.x, sb.z - other.z)).toBeGreaterThan(1.2);
        }
      }
    }

    const sb0 = barrels[0];
    const sbGroup = interactables.getGroup().getObjectByName(`SlurpBarrel_${sb0.id}`) as THREE.Group;
    expect(sbGroup.visible).toBe(true);

    const chip = interactables.damageSlurpBarrel(sb0.id, 15);
    expect(chip).toEqual({
      destroyed: false,
      shieldAmount: 0,
      position: { x: sb0.x, y: sb0.y, z: sb0.z },
    });
    expect(sb0.hp).toBe(25);
    expect(sb0.destroyed).toBe(false);
    expect(sbGroup.visible).toBe(true);
    expect(interactables.getSlurpBarrelColliders()).toHaveLength(24);

    // Update animates hit wobble cleanly
    interactables.update(0.05, 26.05);

    const kill = interactables.damageSlurpBarrel(sb0.id, 25);
    expect(kill).toEqual({
      destroyed: true,
      shieldAmount: 15,
      position: { x: sb0.x, y: sb0.y, z: sb0.z },
    });
    expect(sb0.hp).toBe(0);
    expect(sb0.destroyed).toBe(true);
    expect(sbGroup.visible).toBe(false);
    expect(interactables.getSlurpBarrelColliders()).toHaveLength(23);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 23 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);
    expect(interactables.damageSlurpBarrel(sb0.id, 10)).toBeNull();
    expect(interactables.damageSlurpBarrel('nonexistent_barrel', 10)).toBeNull();

    // 4. reset() restores vaults, benches, campfires, and slurp barrels
    interactables.unlockVault(interactables.getVaults()[0].id);
    interactables.reset();

    expect(interactables.getVaults().every((v) => !v.unlocked && !v.opened)).toBe(true);
    expect(interactables.getVaultColliders()).toHaveLength(15);
    expect(interactables.getUpgradeBenches()).toHaveLength(6);
    expect(interactables.getUpgradeBenchColliders()).toHaveLength(6);
    expect(
      interactables
        .getCampfires()
        .every((c) => !c.lit && c.remainingSec === 25 && c.maxDurationSec === 25),
    ).toBe(true);
    expect(cfFlameGroup.visible).toBe(false);
    expect(interactables.igniteCampfire(cf0.id)).toBe(true);
    expect(
      interactables
        .getSlurpBarrels()
        .every((s) => s.hp === 40 && s.maxHp === 40 && !s.destroyed),
    ).toBe(true);
    expect(sbGroup.visible).toBe(true);
    expect(interactables.getSlurpBarrelColliders()).toHaveLength(24);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    interactables.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('VehicleSystem', () => {
  it('spawns 16 deterministic vehicles (4 hover_atv + 4 cyber_bike + 4 speedboat + 2 hover_tank + 2 choppa) clear of buildings', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');

    const vs1 = new VehicleSystem(terrain, undefined, 4201);
    const vs2 = new VehicleSystem(terrain, undefined, 4201);

    const v1 = vs1.getVehicles();
    const v2 = vs2.getVehicles();
    expect(v1).toHaveLength(16);
    expect(v2).toHaveLength(16);
    expect(v1.filter((v) => v.kind === 'hover_atv')).toHaveLength(4);
    expect(v1.filter((v) => v.kind === 'cyber_bike')).toHaveLength(4);
    expect(v1.filter((v) => v.kind === 'speedboat')).toHaveLength(4);
    expect(v1.filter((v) => v.kind === 'hover_tank')).toHaveLength(2);
    expect(v1.filter((v) => v.kind === 'choppa')).toHaveLength(2);
    expect(vs1.getGroup()).toBeInstanceOf(THREE.Group);
    expect(vs1.getActiveVehicleColliders()).toHaveLength(16);

    for (let i = 0; i < v1.length; i++) {
      expect(v1[i].id).toBe(v2[i].id);
      expect(v1[i].x).toBe(v2[i].x);
      expect(v1[i].z).toBe(v2[i].z);
      if (v1[i].kind === 'speedboat') {
        expect(terrain.isWater(v1[i].x, v1[i].z)).toBe(true);
        expect(v1[i].y).toBeCloseTo(WATER_LEVEL + 0.12, 4);
      } else {
        expect(terrain.isWater(v1[i].x, v1[i].z)).toBe(false);
      }
      expect(v1[i].hp).toBe(v1[i].maxHp);
      expect(v1[i].driverId).toBeNull();
      expect(v1[i].destroyed).toBe(false);

      // Must not spawn embedded inside solid building walls
      const overlapsWall = world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.maxY > v1[i].y &&
          c.minY < v1[i].y + 1.5 &&
          v1[i].x >= c.minX - 1.0 &&
          v1[i].x <= c.maxX + 1.0 &&
          v1[i].z >= c.minZ - 1.0 &&
          v1[i].z <= c.maxZ + 1.0,
      );
      expect(overlapsWall).toBe(false);
    }

    vs1.dispose();
    vs2.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('supports enter, driving, steering, boost VFX, water/lava hover float, speedboat buoyancy/wake/amphibious speed, exit, damage, spawn, and reset', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const boostSpy = vi.fn();
    const wakeSpy = vi.fn();
    const soundSpy = vi.fn();
    const explosionSpy = vi.fn();
    bus.on('vfx:vehicle_boost', boostSpy);
    bus.on('vfx:water_wake', wakeSpy);
    bus.on('sound:play', soundSpy);
    bus.on('vfx:explosion', explosionSpy);

    const vs = new VehicleSystem(terrain, bus, 4201);
    const first = vs.getVehicles()[0];

    expect(vs.enterVehicle(first.id, 'player')).toBe(true);
    expect(first.driverId).toBe('player');
    expect(vs.enterVehicle(first.id, 'bot_1')).toBe(false);

    const startX = first.x;
    const startZ = first.z;
    const startYaw = first.yaw;

    for (let i = 0; i < 15; i++) {
      vs.driveVehicle(first.id, 1, 0.8, true, 0.05);
      vs.update(0.05, i * 0.05);
    }

    expect(Math.hypot(first.x - startX, first.z - startZ)).toBeGreaterThan(4);
    expect(first.yaw).not.toBeCloseTo(startYaw, 3);
    expect(first.boostCharge).toBeLessThan(1.0);
    expect(Number.isFinite(first.y)).toBe(true);
    expect(Number.isFinite(first.pitch)).toBe(true);
    expect(Number.isFinite(first.roll)).toBe(true);
    expect(boostSpy).toHaveBeenCalled();

    // Wrong driver cannot exit
    expect(vs.exitVehicle(first.id, 'bot_1')).toBeNull();
    const exitPos = vs.exitVehicle(first.id, 'player');
    expect(exitPos).not.toBeNull();
    expect(Number.isFinite(exitPos!.x)).toBe(true);
    expect(Number.isFinite(exitPos!.y)).toBe(true);
    expect(Number.isFinite(exitPos!.z)).toBe(true);
    expect(first.driverId).toBeNull();

    // Water floatation over Crystal Basin lake (25 + 35, -115)
    const waterBike = vs.spawnVehicleAt('cyber_bike', 60, -115, 0);
    expect(vs.getVehicles()).toHaveLength(17);
    expect(terrain.isWater(waterBike.x, waterBike.z)).toBe(true);
    expect(waterBike.y).toBeGreaterThan(WATER_LEVEL + 0.3);

    // Speedboat water buoyancy (WATER_LEVEL + 0.12), water wake + boat_boost + water_splash_wake, and amphibious 0.78x dry speed
    const waterBoat = vs.getVehicles().find((v) => v.kind === 'speedboat')!;
    expect(waterBoat).toBeDefined();
    expect(terrain.isWater(waterBoat.x, waterBoat.z)).toBe(true);
    expect(waterBoat.y).toBeCloseTo(WATER_LEVEL + 0.12, 4);

    wakeSpy.mockClear();
    soundSpy.mockClear();
    vs.enterVehicle(waterBoat.id, 'boat_driver');
    for (let i = 0; i < 12; i++) {
      vs.driveVehicle(waterBoat.id, 1, 0, true, 0.05);
      vs.update(0.05, 1 + i * 0.05);
    }
    expect(terrain.isWater(waterBoat.x, waterBoat.z)).toBe(true);
    expect(waterBoat.y).toBeCloseTo(WATER_LEVEL + 0.12, 2);
    expect(wakeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        yaw: waterBoat.yaw,
        speed: expect.any(Number),
      }),
    );
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'water_splash_wake' }));
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'boat_boost' }));
    vs.exitVehicle(waterBoat.id, 'boat_driver');

    const dryBoat = vs.spawnVehicleAt('speedboat', -75, -40, 0);
    expect(vs.getVehicles()).toHaveLength(18);
    expect(terrain.isWater(dryBoat.x, dryBoat.z)).toBe(false);
    vs.enterVehicle(dryBoat.id, 'land_driver');
    for (let i = 0; i < 60; i++) {
      vs.driveVehicle(dryBoat.id, 1, 0, false, 0.05);
      vs.update(0.05, 4 + i * 0.05);
    }
    const dryTopSpeed = Math.hypot(dryBoat.vx, dryBoat.vz);

    const waterCruiseBoat = vs.spawnVehicleAt('speedboat', 260, 260, Math.PI * 0.25);
    expect(vs.getVehicles()).toHaveLength(19);
    vs.enterVehicle(waterCruiseBoat.id, 'water_cruise_driver');
    for (let i = 0; i < 60; i++) {
      vs.driveVehicle(waterCruiseBoat.id, 1, 0, false, 0.05);
      vs.update(0.05, 7 + i * 0.05);
    }
    expect(terrain.isWater(waterCruiseBoat.x, waterCruiseBoat.z)).toBe(true);
    expect(waterCruiseBoat.y).toBeCloseTo(WATER_LEVEL + 0.12, 2);
    const waterCruiseSpeed = Math.hypot(waterCruiseBoat.vx, waterCruiseBoat.vz);
    expect(dryTopSpeed / waterCruiseSpeed).toBeCloseTo(0.78, 2);

    // Volcanic lava thermal float & boost recharge over Scorched Caldera
    const lavaAtv = vs.spawnVehicleAt('hover_atv', VOLCANO_CENTER_X, VOLCANO_CENTER_Z, 0);
    lavaAtv.boostCharge = 0.2;
    vs.driveVehicle(lavaAtv.id, 1, 0, false, 0.25);
    expect(lavaAtv.y).toBeGreaterThan(terrain.getHeightAt(VOLCANO_CENTER_X, VOLCANO_CENTER_Z) + 1.5);
    expect(lavaAtv.boostCharge).toBeGreaterThan(0.2);

    // Damage & explosion
    expect(vs.damageVehicle(first.id, 100, { x: first.x, y: first.y, z: first.z })).toBe(false);
    expect(first.hp).toBe(first.maxHp - 100);
    expect(
      vs.damageVehicle(first.id, first.hp + 50, { x: first.x, y: first.y, z: first.z }),
    ).toBe(true);
    expect(first.destroyed).toBe(true);
    expect(first.hp).toBe(0);
    expect(explosionSpy).toHaveBeenCalledTimes(1);
    expect(vs.enterVehicle(first.id, 'player')).toBe(false);
    expect(vs.getActiveVehicleColliders()).toHaveLength(19);

    vs.reset();
    expect(vs.getVehicles()).toHaveLength(16);
    expect(vs.getVehicles().filter((v) => v.kind === 'speedboat')).toHaveLength(4);
    expect(vs.getVehicles().filter((v) => v.kind === 'hover_tank')).toHaveLength(2);
    expect(vs.getVehicles().filter((v) => v.kind === 'choppa')).toHaveLength(2);
    expect(vs.getVehicles().every((v) => !v.destroyed && v.hp === v.maxHp)).toBe(true);

    vs.dispose();
    terrain.dispose();
  });

  it('spawns 2 Vanguard Hover Tanks at crater_depot & scorched_caldera approaches with 900 HP, 18/24 speed, rotating turret & getTankCannonMuzzle', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const vs = new VehicleSystem(terrain, bus, 4201);

    const tanks = vs.getVehicles().filter((v) => v.kind === 'hover_tank');
    expect(tanks).toHaveLength(2);

    const craterDepot = POIS.find((p) => p.id === 'crater_depot')!;
    const scorchedCaldera = POIS.find((p) => p.id === 'scorched_caldera')!;
    expect(tanks.some((t) => Math.hypot(t.x - craterDepot.x, t.z - craterDepot.z) < 60)).toBe(true);
    expect(tanks.some((t) => Math.hypot(t.x - scorchedCaldera.x, t.z - scorchedCaldera.z) < 60)).toBe(true);

    const tank0 = tanks[0];
    expect(tank0.maxHp).toBe(900);
    expect(tank0.hp).toBe(900);
    expect(terrain.isWater(tank0.x, tank0.z)).toBe(false);

    const tankGroup = vs.getGroup().getObjectByName(`Vehicle_${tank0.id}`) as THREE.Group;
    expect(tankGroup).toBeDefined();
    const turretPivot = tankGroup.getObjectByName('TankTurretPivot') as THREE.Group;
    const cannonBarrel = tankGroup.getObjectByName('TankCannonBarrel') as THREE.Group;
    const muzzleObj = tankGroup.getObjectByName('TankCannonMuzzle');
    expect(turretPivot).toBeDefined();
    expect(cannonBarrel).toBeDefined();
    expect(muzzleObj).toBeDefined();

    // Non-tank & unknown vehicle IDs return null for getTankCannonMuzzle
    const atv = vs.getVehicles().find((v) => v.kind === 'hover_atv')!;
    expect(vs.getTankCannonMuzzle(atv.id)).toBeNull();
    expect(vs.getTankCannonMuzzle('nonexistent_vehicle')).toBeNull();

    // Muzzle position sits ahead of tank chassis along forward yaw
    const muzzleBefore = vs.getTankCannonMuzzle(tank0.id);
    expect(muzzleBefore).not.toBeNull();
    expect(Number.isFinite(muzzleBefore!.x)).toBe(true);
    expect(Number.isFinite(muzzleBefore!.y)).toBe(true);
    expect(Number.isFinite(muzzleBefore!.z)).toBe(true);
    expect(muzzleBefore!.y).toBeGreaterThan(tank0.y + 0.4);
    const muzzleDist = Math.hypot(muzzleBefore!.x - tank0.x, muzzleBefore!.z - tank0.z);
    expect(muzzleDist).toBeGreaterThan(2.5);
    expect(muzzleDist).toBeLessThan(4.2);

    // Rotating turret moves muzzle world position cleanly
    const turretRotBefore = turretPivot.rotation.y;
    vs.update(0.4, 1.2);
    expect(turretPivot.rotation.y).not.toBeCloseTo(turretRotBefore, 3);
    const muzzleRotated = vs.getTankCannonMuzzle(tank0.id)!;
    expect(Math.hypot(muzzleRotated.x - muzzleBefore!.x, muzzleRotated.z - muzzleBefore!.z)).toBeGreaterThan(0.2);

    // Driving & boosting respects maxSpeed 18, boostSpeed 24, turnRate 1.55
    const spawnedTank = vs.spawnVehicleAt('hover_tank', -75, -10, 0);
    expect(spawnedTank.kind).toBe('hover_tank');
    expect(spawnedTank.maxHp).toBe(900);
    expect(vs.getVehicles()).toHaveLength(17);

    vs.enterVehicle(spawnedTank.id, 'tanker');
    for (let i = 0; i < 80; i++) {
      vs.driveVehicle(spawnedTank.id, 1, 0, false, 0.05);
      vs.update(0.05, 2 + i * 0.05);
    }
    const cruiseSpeed = Math.hypot(spawnedTank.vx, spawnedTank.vz);
    expect(cruiseSpeed).toBeGreaterThan(16.5);
    expect(cruiseSpeed).toBeLessThanOrEqual(18.05);

    for (let i = 0; i < 40; i++) {
      vs.driveVehicle(spawnedTank.id, 1, 0, true, 0.05);
      vs.update(0.05, 6 + i * 0.05);
    }
    const boostSpeed = Math.hypot(spawnedTank.vx, spawnedTank.vz);
    expect(boostSpeed).toBeGreaterThan(21.5);
    expect(boostSpeed).toBeLessThanOrEqual(24.05);

    // Destroyed tank returns null for getTankCannonMuzzle
    expect(vs.damageVehicle(spawnedTank.id, 950, { x: spawnedTank.x, y: spawnedTank.y, z: spawnedTank.z })).toBe(true);
    expect(vs.getTankCannonMuzzle(spawnedTank.id)).toBeNull();

    vs.reset();
    expect(vs.getVehicles()).toHaveLength(16);
    expect(vs.getVehicles().filter((v) => v.kind === 'hover_tank')).toHaveLength(2);
    expect(vs.getVehicles().filter((v) => v.kind === 'choppa')).toHaveLength(2);
    vs.dispose();
    terrain.dispose();
  });
});

describe('EnvironmentFX Wave-2 Weather & Rain', () => {
  it('supports all 5 weather states, smooth automatic transitions, rain streaks, and storm lightning', () => {
    const bus = new EventBus();
    const lightningSpy = vi.fn();
    const soundSpy = vi.fn();
    bus.on('vfx:lightning_flash', lightningSpy);
    bus.on('sound:play', soundSpy);

    const fx = new EnvironmentFX(4201, bus);
    const rainMesh = fx.getGroup().getObjectByName('RainStreaks') as THREE.LineSegments;
    const skyMesh = fx.getGroup().getObjectByName('SkyDome') as THREE.Mesh;
    const skyMat = skyMesh.material as THREE.ShaderMaterial;
    expect(rainMesh).toBeDefined();
    expect(rainMesh.visible).toBe(false);

    const kinds: WeatherKind[] = ['clear', 'golden_hour', 'overcast', 'rain', 'storm_front'];
    for (const k of kinds) {
      fx.setWeather(k);
      expect(fx.getWeatherState().kind).toBe(k);
      fx.update(0.25, 1.0, { x: 10, y: 12, z: 10 }, 'grassland');
      if (k === 'rain' || k === 'storm_front') {
        expect(rainMesh.visible).toBe(true);
      } else {
        expect(rainMesh.visible).toBe(false);
      }
    }

    // Golden hour warmth vs Storm overcast shader uniforms
    fx.setWeather('golden_hour');
    for (let i = 0; i < 15; i++) fx.update(0.1, i * 0.1);
    expect(skyMat.uniforms.uWarmth.value).toBeGreaterThan(0.5);

    fx.setWeather('storm_front');
    for (let i = 0; i < 40; i++) {
      fx.update(0.2, 10 + i * 0.2, { x: 0, y: 14, z: 0 }, 'grassland');
    }
    expect(skyMat.uniforms.uOvercast.value).toBeGreaterThan(0.7);
    expect(lightningSpy).toHaveBeenCalled();
    expect(soundSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'weather_thunder' }),
    );

    // Resume automatic weather cycle over match time
    fx.setWeather();
    const seenAutoKinds = new Set<WeatherKind>();
    for (let t = 0; t <= 300; t += 20) {
      fx.update(0.5, t, { x: 0, y: 12, z: 0 }, 'grassland');
      seenAutoKinds.add(fx.getWeatherState().kind);
    }
    expect(seenAutoKinds).toEqual(new Set(kinds));

    fx.dispose();
  });
});

describe('PropsAndLoot Wave-2 Loot Pools', () => {
  it('spawns grappler and shield_bubble across floor, chest, and supply-drop loot pools', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 220; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('grappler')).toBe(true);
    expect(chestIds.has('grappler')).toBe(true);

    const consumableIds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = pal.rollConsumable();
      expect(WEAPONS[c.weaponId].allowedRarities).toContain(c.rarity);
      expect(c.magAmmo).toBe(0);
      consumableIds.add(c.weaponId);
    }
    expect(consumableIds.has('shield_bubble')).toBe(true);

    // Open multiple supply drops and confirm grappler & shield_bubble both appear
    const supplyItemIds = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    for (const drop of pal.getLootDrops()) {
      if (drop.item) {
        expect(WEAPONS[drop.item.weaponId].allowedRarities).toContain(drop.item.rarity);
        supplyItemIds.add(drop.item.weaponId);
      }
    }
    expect(supplyItemIds.has('grappler')).toBe(true);
    expect(supplyItemIds.has('shield_bubble')).toBe(true);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('WorldInteractables Wave-4 Rifts, Capture Points & Explosive Barrels', () => {
  it('constructs 5 sky rifts, 4 POI flag capture points, and 18 explosive red barrels clear of water/buildings with full lifecycle and reset', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 0.6) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 2.2 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    // 1. 5 Shimmering Sky Rifts across the 5 edge/highland POIs
    const rifts = interactables.getRifts();
    expect(rifts).toHaveLength(5);
    expect(new Set(rifts.map((r) => r.poiId))).toEqual(
      new Set([
        'frostpeak_citadel',
        'scorched_caldera',
        'sunken_oasis',
        'whispering_pines',
        'skyline_spire',
      ]),
    );

    for (const r of rifts) {
      expect(r.active).toBe(true);
      expect(r.openRemainingSec).toBe(0);
      expect(r.cooldownSec).toBe(0);
      expect(terrain.isWater(r.x, r.z)).toBe(false);
      expect(r.y).toBeCloseTo(terrain.getHeightAt(r.x, r.z), 4);
      expect(terrain.getNormalAt(r.x, r.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(r.x, r.y, r.z, 1.0)).toBe(true);
      for (const v of interactables.getVaults()) {
        expect(Math.hypot(r.x - v.x, r.z - v.z)).toBeGreaterThan(4.0);
      }
      for (const p of interactables.getLaunchPads()) {
        expect(Math.hypot(r.x - p.x, r.z - p.z)).toBeGreaterThan(4.0);
      }
      for (const b of interactables.getUpgradeBenches()) {
        expect(Math.hypot(r.x - b.x, r.z - b.z)).toBeGreaterThan(3.0);
      }
      for (const cf of interactables.getCampfires()) {
        expect(Math.hypot(r.x - cf.x, r.z - cf.z)).toBeGreaterThan(3.0);
      }
      for (const sb of interactables.getSlurpBarrels()) {
        expect(Math.hypot(r.x - sb.x, r.z - sb.z)).toBeGreaterThan(2.5);
      }
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(r.x - veh.x, r.z - veh.z)).toBeGreaterThan(3.0);
      }
      const riftMesh = interactables.getGroup().getObjectByName(`SkyRift_${r.id}`) as THREE.Group;
      expect(riftMesh).toBeDefined();
      expect(riftMesh.children.length).toBeGreaterThanOrEqual(2);
      const portalGroup = riftMesh.children.find((ch) => ch instanceof THREE.Group) as THREE.Group;
      expect(portalGroup.visible).toBe(true);
    }

    // Trigger rift -> 8s open window -> 45s cooldown -> auto reopen
    const r0 = rifts[0];
    const r0Mesh = interactables.getGroup().getObjectByName(`SkyRift_${r0.id}`) as THREE.Group;
    const r0Portal = r0Mesh.children.find((ch) => ch instanceof THREE.Group) as THREE.Group;
    expect(interactables.triggerRift('nonexistent_rift')).toBeNull();
    const firstTrigger = interactables.triggerRift(r0.id);
    expect(firstTrigger).toEqual({
      skyPos: { x: r0.x, y: r0.y + 92, z: r0.z },
    });
    expect(r0.active).toBe(true);
    expect(r0.openRemainingSec).toBe(8);
    expect(r0.cooldownSec).toBe(0);

    // Halfway through 8s open window, pursuers can still enter without resetting the 8s window
    interactables.update(4.0, 4.0);
    expect(r0.active).toBe(true);
    expect(r0.openRemainingSec).toBeCloseTo(4.0, 4);
    const pursuerTrigger = interactables.triggerRift(r0.id);
    expect(pursuerTrigger).toEqual({
      skyPos: { x: r0.x, y: r0.y + 92, z: r0.z },
    });
    expect(r0.openRemainingSec).toBeCloseTo(4.0, 4);

    // Remaining 4s expire -> enters 45s cooldown and blocks triggers
    interactables.update(4.0, 8.0);
    expect(r0.active).toBe(false);
    expect(r0.openRemainingSec).toBe(0);
    expect(r0.cooldownSec).toBe(45);
    expect(r0Portal.visible).toBe(false);
    expect(interactables.triggerRift(r0.id)).toBeNull();

    // Advance 30s into cooldown -> still inactive
    interactables.update(30.0, 38.0);
    expect(r0.active).toBe(false);
    expect(r0.cooldownSec).toBeCloseTo(15.0, 4);
    expect(interactables.triggerRift(r0.id)).toBeNull();

    // Remaining 15s expire -> reopens automatically
    interactables.update(15.0, 53.0);
    expect(r0.active).toBe(true);
    expect(r0.cooldownSec).toBe(0);
    expect(r0.openRemainingSec).toBe(0);
    expect(r0Portal.visible).toBe(true);
    expect(interactables.triggerRift(r0.id)).toEqual({
      skyPos: { x: r0.x, y: r0.y + 92, z: r0.z },
    });

    // 2. 4 Capturable POI Flag Control Points
    const capturePoints = interactables.getCapturePoints();
    expect(capturePoints).toHaveLength(4);
    expect(new Set(capturePoints.map((c) => c.poiId))).toEqual(
      new Set(['metro_towers', 'market_row', 'crater_depot', 'sunny_suburbs']),
    );

    for (const cp of capturePoints) {
      expect(cp.radius).toBe(6.5);
      expect(cp.progress).toBe(0);
      expect(cp.captured).toBe(false);
      expect(cp.ownerId).toBeNull();
      expect(cp.ownerName).toBeNull();
      expect(cp.poiName).toBe(POIS.find((p) => p.id === cp.poiId)!.name);
      expect(terrain.isWater(cp.x, cp.z)).toBe(false);
      expect(cp.y).toBeCloseTo(terrain.getHeightAt(cp.x, cp.z), 4);
      expect(terrain.getNormalAt(cp.x, cp.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(cp.x, cp.y, cp.z, 1.2)).toBe(true);
      for (const b of interactables.getUpgradeBenches()) {
        expect(Math.hypot(cp.x - b.x, cp.z - b.z)).toBeGreaterThan(3.0);
      }
      for (const cf of interactables.getCampfires()) {
        expect(Math.hypot(cp.x - cf.x, cp.z - cf.z)).toBeGreaterThan(3.0);
      }
      for (const sb of interactables.getSlurpBarrels()) {
        expect(Math.hypot(cp.x - sb.x, cp.z - sb.z)).toBeGreaterThan(2.5);
      }
      for (const p of interactables.getLaunchPads()) {
        expect(Math.hypot(cp.x - p.x, cp.z - p.z)).toBeGreaterThan(3.0);
      }
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(cp.x - veh.x, cp.z - veh.z)).toBeGreaterThan(3.0);
      }
      const cpMesh = interactables.getGroup().getObjectByName(`CapturePoint_${cp.id}`) as THREE.Group;
      expect(cpMesh).toBeDefined();
      expect(cpMesh.children.length).toBeGreaterThanOrEqual(6);
    }

    const cp0 = capturePoints[0];
    const cpMesh = interactables.getGroup().getObjectByName(`CapturePoint_${cp0.id}`) as THREE.Group;
    const cpFlagGroup = cpMesh.children.find((ch) => ch instanceof THREE.Group) as THREE.Group;
    const cpBannerMesh = cpFlagGroup.children[1] as THREE.Mesh;
    const uncapturedColorHex = (cpBannerMesh.material as THREE.MeshStandardMaterial).color.getHexString();
    const flagStartY = cpFlagGroup.position.y;

    // Advance 6s -> progress 0.5; same-frame update(dt) must NOT decay it
    const midAdvance = interactables.advanceCapturePoint(cp0.id, 'player', 'Hero', 6.0);
    expect(midAdvance).toEqual({
      capturedNow: false,
      progress: 0.5,
      poiName: cp0.poiName,
    });
    expect(cp0.progress).toBeCloseTo(0.5, 5);
    expect(cpFlagGroup.position.y).toBeGreaterThan(flagStartY);

    interactables.update(0.1, 53.1);
    expect(cp0.progress).toBeCloseTo(0.5, 5);

    // Subsequent frame without advancing decays at dt / 18
    interactables.update(4.5, 57.6);
    expect(cp0.progress).toBeCloseTo(0.25, 5);

    // Decay clamps cleanly at 0
    interactables.update(9.0, 66.6);
    expect(cp0.progress).toBe(0);

    // Advance across 12s in 0.1s frames with update() each tick -> captures smoothly at 12s
    let capRes = interactables.advanceCapturePoint(cp0.id, 'player', 'Hero', 0);
    for (let i = 0; i < 120; i++) {
      capRes = interactables.advanceCapturePoint(cp0.id, 'player', 'Hero', 0.1);
      interactables.update(0.1, 66.7 + i * 0.1);
    }
    expect(capRes.capturedNow).toBe(true);
    expect(capRes.progress).toBe(1);
    expect(capRes.poiName).toBe(cp0.poiName);
    expect(capRes.lootPos).toEqual({ x: cp0.x, y: cp0.y + 0.6, z: cp0.z });
    expect(cp0.captured).toBe(true);
    expect(cp0.progress).toBe(1);
    expect(cp0.ownerId).toBe('player');
    expect(cp0.ownerName).toBe('Hero');
    expect((cpBannerMesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('facc15');
    expect((cpBannerMesh.material as THREE.MeshStandardMaterial).color.getHexString()).not.toBe(
      uncapturedColorHex,
    );

    // Already captured point does not re-trigger capturedNow, overwrite owner, or decay
    const repeatRes = interactables.advanceCapturePoint(cp0.id, 'bot_1', 'Bot1', 5.0);
    expect(repeatRes).toEqual({
      capturedNow: false,
      progress: 1,
      poiName: cp0.poiName,
    });
    expect(cp0.ownerId).toBe('player');
    interactables.update(10.0, 90.0);
    expect(cp0.progress).toBe(1);
    expect(cp0.captured).toBe(true);

    // 3. 18 Destructible Explosive Red Fuel Barrels
    const expBarrels = interactables.getExplosiveBarrels();
    expect(expBarrels).toHaveLength(18);
    expect(interactables.getExplosiveBarrelColliders()).toHaveLength(18);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    for (const eb of expBarrels) {
      expect(eb.hp).toBe(35);
      expect(eb.maxHp).toBe(35);
      expect(eb.blastRadius).toBe(6.8);
      expect(eb.blastDamage).toBe(85);
      expect(eb.exploded).toBe(false);
      expect(terrain.isWater(eb.x, eb.z)).toBe(false);
      expect(eb.y).toBeCloseTo(terrain.getHeightAt(eb.x, eb.z), 4);
      expect(terrain.getNormalAt(eb.x, eb.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(eb.x, eb.y, eb.z, 0.55)).toBe(true);
      for (const other of expBarrels) {
        if (other.id !== eb.id) {
          expect(Math.hypot(eb.x - other.x, eb.z - other.z)).toBeGreaterThan(1.5);
        }
      }
      for (const sb of interactables.getSlurpBarrels()) {
        expect(Math.hypot(eb.x - sb.x, eb.z - sb.z)).toBeGreaterThan(1.5);
      }
      for (const b of interactables.getUpgradeBenches()) {
        expect(Math.hypot(eb.x - b.x, eb.z - b.z)).toBeGreaterThan(2.0);
      }
      for (const cf of interactables.getCampfires()) {
        expect(Math.hypot(eb.x - cf.x, eb.z - cf.z)).toBeGreaterThan(2.0);
      }
      for (const v of interactables.getVaults()) {
        expect(Math.hypot(eb.x - v.x, eb.z - v.z)).toBeGreaterThan(3.0);
      }
      for (const p of interactables.getLaunchPads()) {
        expect(Math.hypot(eb.x - p.x, eb.z - p.z)).toBeGreaterThan(2.5);
      }
      for (const r of rifts) {
        expect(Math.hypot(eb.x - r.x, eb.z - r.z)).toBeGreaterThan(2.5);
      }
      for (const cp of capturePoints) {
        expect(Math.hypot(eb.x - cp.x, eb.z - cp.z)).toBeGreaterThan(2.5);
      }
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(eb.x - veh.x, eb.z - veh.z)).toBeGreaterThan(2.5);
      }
    }

    const eb0 = expBarrels[0];
    const ebGroup = interactables.getGroup().getObjectByName(`ExplosiveBarrel_${eb0.id}`) as THREE.Group;
    expect(ebGroup.visible).toBe(true);

    const chipDmg = interactables.damageExplosiveBarrel(eb0.id, 15);
    expect(chipDmg).toEqual({
      exploded: false,
      position: { x: eb0.x, y: eb0.y, z: eb0.z },
      blastRadius: 6.8,
      blastDamage: 85,
    });
    expect(eb0.hp).toBe(20);
    expect(eb0.exploded).toBe(false);
    expect(ebGroup.visible).toBe(true);
    expect(interactables.getExplosiveBarrelColliders()).toHaveLength(18);

    interactables.update(0.05, 90.05);

    const lethalDmg = interactables.damageExplosiveBarrel(eb0.id, 25);
    expect(lethalDmg).toEqual({
      exploded: true,
      position: { x: eb0.x, y: eb0.y, z: eb0.z },
      blastRadius: 6.8,
      blastDamage: 85,
    });
    expect(eb0.hp).toBe(0);
    expect(eb0.exploded).toBe(true);
    expect(ebGroup.visible).toBe(false);
    expect(interactables.getExplosiveBarrelColliders()).toHaveLength(17);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 17 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);
    expect(interactables.damageExplosiveBarrel(eb0.id, 10)).toBeNull();
    expect(interactables.damageExplosiveBarrel('nonexistent_barrel', 10)).toBeNull();

    // 4. reset() restores all 5 rifts, 4 capture points, and 18 explosive barrels
    interactables.triggerRift(r0.id);
    interactables.update(8.0, 98.05); // r0 in cooldown
    expect(r0.active).toBe(false);

    interactables.reset();

    expect(
      interactables
        .getRifts()
        .every((r) => r.active && r.openRemainingSec === 0 && r.cooldownSec === 0),
    ).toBe(true);
    expect(
      interactables
        .getCapturePoints()
        .every(
          (cp) =>
            cp.progress === 0 &&
            !cp.captured &&
            cp.ownerId === null &&
            cp.ownerName === null,
        ),
    ).toBe(true);
    expect(cpFlagGroup.position.y).toBeCloseTo(flagStartY, 4);
    expect((cpBannerMesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(
      uncapturedColorHex,
    );
    expect(r0Portal.visible).toBe(true);
    expect(
      interactables
        .getExplosiveBarrels()
        .every((b) => b.hp === 35 && b.maxHp === 35 && !b.exploded),
    ).toBe(true);
    expect(ebGroup.visible).toBe(true);
    expect(interactables.getExplosiveBarrelColliders()).toHaveLength(18);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    vehicles.dispose();
    interactables.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('WorldInteractables Wave-5 Vending Machines, NPC Specialists & Floating Loot Island', () => {
  it('constructs 6 vending machines and 3 hireable NPC posts clear of water/buildings/props with full lifecycle and reset', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 0.8) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 2.6 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    const isClearOfProps = (x: number, z: number, pad = 1.0) =>
      !pal.getProps().some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + pad);

    // 1. 6 Glowing Vending Machines
    const machines = interactables.getVendingMachines();
    expect(machines).toHaveLength(6);
    expect(interactables.getVendingMachineColliders()).toHaveLength(6);
    expect(new Set(machines.map((m) => m.poiId))).toEqual(
      new Set([
        'metro_towers',
        'market_row',
        'sunny_suburbs',
        'crater_depot',
        'skyline_spire',
        'frostpeak_citadel',
      ]),
    );

    const mendingOffers = machines
      .filter((m) => m.kind === 'mending')
      .map((m) => [m.offerWeaponId, m.priceGold]);
    expect(mendingOffers).toHaveLength(3);
    expect(new Set(mendingOffers.map(([id]) => id))).toEqual(
      new Set(['medkit', 'shield_potion', 'chug_splash']),
    );
    expect(machines.find((m) => m.offerWeaponId === 'medkit')?.priceGold).toBe(75);
    expect(machines.find((m) => m.offerWeaponId === 'shield_potion')?.priceGold).toBe(90);
    expect(machines.find((m) => m.offerWeaponId === 'chug_splash')?.priceGold).toBe(100);

    const weaponOffers = machines.filter((m) => m.kind === 'weapon');
    expect(weaponOffers).toHaveLength(3);
    const dmrVm = weaponOffers.find((m) => m.offerWeaponId === 'tactical_dmr');
    const bladeVm = weaponOffers.find((m) => m.offerWeaponId === 'kinetic_blade');
    const heavyVm = weaponOffers.find((m) => m.offerWeaponId === 'heavy_shotgun');
    expect(dmrVm).toMatchObject({ offerRarity: 'epic', priceGold: 175, stock: 3 });
    expect(bladeVm).toMatchObject({ offerRarity: 'epic', priceGold: 225, stock: 3 });
    expect(heavyVm).toMatchObject({ offerRarity: 'legendary', priceGold: 250, stock: 3 });

    for (const vm of machines) {
      expect(vm.stock).toBe(3);
      expect(terrain.isWater(vm.x, vm.z)).toBe(false);
      expect(vm.y).toBeCloseTo(terrain.getHeightAt(vm.x, vm.z), 4);
      expect(terrain.getNormalAt(vm.x, vm.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(vm.x, vm.y, vm.z, 0.9)).toBe(true);
      expect(isClearOfProps(vm.x, vm.z, 1.0)).toBe(true);
      for (const v of interactables.getVaults()) {
        expect(Math.hypot(vm.x - v.x, vm.z - v.z)).toBeGreaterThan(3.5);
      }
      for (const b of interactables.getUpgradeBenches()) {
        expect(Math.hypot(vm.x - b.x, vm.z - b.z)).toBeGreaterThan(3.0);
      }
      for (const cp of interactables.getCapturePoints()) {
        expect(Math.hypot(vm.x - cp.x, vm.z - cp.z)).toBeGreaterThan(3.0);
      }
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(vm.x - veh.x, vm.z - veh.z)).toBeGreaterThan(3.0);
      }
      const vmGroup = interactables.getGroup().getObjectByName(`VendingMachine_${vm.id}`) as THREE.Group;
      expect(vmGroup).toBeDefined();
      expect(vmGroup.children.length).toBeGreaterThanOrEqual(8);
    }

    // Purchase stock decrement, halo/screen dimming when sold out & sold-out guard
    expect(interactables.purchaseFromVendingMachine('nonexistent_vm')).toBeNull();
    const targetVm = dmrVm!;
    const vmGroup = interactables.getGroup().getObjectByName(`VendingMachine_${targetVm.id}`) as THREE.Group;
    const haloGroup = vmGroup.children[vmGroup.children.length - 1] as THREE.Group;
    const haloRingMesh = haloGroup.children[0] as THREE.Mesh;
    const haloMat = haloRingMesh.material as THREE.MeshStandardMaterial;
    const initialEmissiveIntensity = haloMat.emissiveIntensity;
    expect(initialEmissiveIntensity).toBeGreaterThan(1.0);
    expect(haloGroup.scale.x).toBeCloseTo(1, 4);

    // Verify update() animates stocked vending halos
    interactables.update(0.25, 1.5);
    const stockedHaloAfter = haloGroup.rotation.y;
    expect(stockedHaloAfter).not.toBe(0);

    const uids = new Set<string>();
    for (let i = 2; i >= 0; i--) {
      const purchase = interactables.purchaseFromVendingMachine(targetVm.id);
      expect(purchase).not.toBeNull();
      expect(targetVm.stock).toBe(i);
      expect(purchase!.priceGold).toBe(175);
      expect(purchase!.position).toEqual({ x: targetVm.x, y: targetVm.y, z: targetVm.z });
      expect(purchase!.item.weaponId).toBe('tactical_dmr');
      expect(purchase!.item.rarity).toBe('epic');
      expect(purchase!.item.magAmmo).toBe(WEAPONS.tactical_dmr.magSize);
      expect(purchase!.item.stackCount).toBe(1);
      expect(purchase!.item.uid.length).toBeGreaterThan(3);
      uids.add(purchase!.item.uid);
    }
    expect(uids.size).toBe(3);
    expect(haloMat.emissiveIntensity).toBeLessThan(0.5);
    expect(haloGroup.scale.x).toBeLessThan(1);
    expect(interactables.purchaseFromVendingMachine(targetVm.id)).toBeNull();
    expect(targetVm.stock).toBe(0);

    // 2. 3 Hireable NPC Specialist Posts
    const npcs = interactables.getNpcSpecialists();
    expect(npcs).toHaveLength(3);

    const nova = npcs.find((n) => n.poiId === 'whispering_pines');
    const remedy = npcs.find((n) => n.poiId === 'sunken_oasis');
    const bastion = npcs.find((n) => n.poiId === 'frostpeak_citadel');
    expect(nova).toMatchObject({ name: 'Recon Nova', role: 'scout', skinId: 'neon_drift', priceGold: 200, hiredBy: null });
    expect(remedy).toMatchObject({ name: 'Doc Remedy', role: 'medic', skinId: 'emerald_scout', priceGold: 200, hiredBy: null });
    expect(bastion).toMatchObject({ name: 'Tank Bastion', role: 'heavy', skinId: 'arctic_apex', priceGold: 200, hiredBy: null });
    const remedyBeacon = interactables.getGroup().getObjectByName(`NpcBeacon_${remedy!.id}`) as THREE.Group;
    const remedyEmblem = remedyBeacon.children[2] as THREE.Group;
    expect(remedyEmblem.rotation.y).not.toBe(0);

    for (const npc of npcs) {
      expect(terrain.isWater(npc.x, npc.z)).toBe(false);
      expect(npc.y).toBeCloseTo(terrain.getHeightAt(npc.x, npc.z), 4);
      expect(terrain.getNormalAt(npc.x, npc.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(npc.x, npc.y, npc.z, 0.9)).toBe(true);
      expect(isClearOfProps(npc.x, npc.z, 1.0)).toBe(true);
      for (const vm of machines) {
        expect(Math.hypot(npc.x - vm.x, npc.z - vm.z)).toBeGreaterThan(4.0);
      }
      for (const b of interactables.getUpgradeBenches()) {
        expect(Math.hypot(npc.x - b.x, npc.z - b.z)).toBeGreaterThan(3.0);
      }
      const npcGroup = interactables.getGroup().getObjectByName(`NpcSpecialist_${npc.id}`) as THREE.Group;
      const beacon = interactables.getGroup().getObjectByName(`NpcBeacon_${npc.id}`) as THREE.Group;
      expect(npcGroup).toBeDefined();
      expect(beacon).toBeDefined();
      expect(npcGroup.visible).toBe(true);
      expect(beacon.visible).toBe(true);
    }

    expect(interactables.hireNpcSpecialist('nonexistent_npc', 'player')).toBeNull();
    expect(interactables.hireNpcSpecialist(nova!.id, '')).toBeNull();

    const hiredCopy = interactables.hireNpcSpecialist(nova!.id, 'player');
    expect(hiredCopy).not.toBeNull();
    expect(hiredCopy!.hiredBy).toBe('player');
    expect(nova!.hiredBy).toBe('player');
    // Mutating returned copy must not mutate internal state
    hiredCopy!.hiredBy = 'other';
    expect(nova!.hiredBy).toBe('player');

    const novaGroup = interactables.getGroup().getObjectByName(`NpcSpecialist_${nova!.id}`) as THREE.Group;
    const novaBeacon = interactables.getGroup().getObjectByName(`NpcBeacon_${nova!.id}`) as THREE.Group;
    expect(novaGroup.visible).toBe(false);
    expect(novaBeacon.visible).toBe(false);
    expect(interactables.hireNpcSpecialist(nova!.id, 'bot_1')).toBeNull();

    // 3. Mid-Match Floating Loot Island
    const initIsland = interactables.getLootIslandState();
    expect(initIsland.active).toBe(false);
    expect(initIsland.captured).toBe(false);
    expect(initIsland.captureProgress).toBe(0);
    expect(interactables.getLootIslandColliders()).toHaveLength(0);
    expect(interactables.advanceLootIslandCapture(2.0)).toEqual({ capturedNow: false });

    const islandMesh = interactables.getGroup().getObjectByName('LootIsland') as THREE.Group;
    const geyserMesh = interactables.getGroup().getObjectByName('LootIslandRiftGeyser') as THREE.Group;
    expect(islandMesh).toBeDefined();
    expect(geyserMesh).toBeDefined();
    expect(islandMesh.visible).toBe(false);
    expect(geyserMesh.visible).toBe(false);

    const cx = 15;
    const cz = 20;
    const groundY = terrain.getHeightAt(cx, cz);
    const spawnedIsland = interactables.spawnLootIsland(cx, cz, 95);
    expect(spawnedIsland).toEqual({
      active: true,
      spawnedAtSec: 95,
      x: cx,
      y: groundY + 24,
      z: cz,
      radius: 14,
      captured: false,
      captureProgress: 0,
    });
    expect(islandMesh.visible).toBe(true);
    expect(geyserMesh.visible).toBe(true);
    expect(islandMesh.position.y).toBeCloseTo(groundY + 24, 4);
    expect(geyserMesh.position.x).toBe(cx);
    expect(geyserMesh.position.y).toBeCloseTo(groundY, 4);
    expect(geyserMesh.position.z).toBe(cz);

    const islandCols = interactables.getLootIslandColliders();
    expect(islandCols).toHaveLength(1);
    expect(islandCols[0].minX).toBeCloseTo(cx - 12.5, 4);
    expect(islandCols[0].maxX).toBeCloseTo(cx + 12.5, 4);
    expect(islandCols[0].minY).toBeCloseTo(groundY + 24 - 0.6, 4);
    expect(islandCols[0].maxY).toBeCloseTo(groundY + 24, 4);
    expect(islandCols[0].minZ).toBeCloseTo(cz - 12.5, 4);
    expect(islandCols[0].maxZ).toBeCloseTo(cz + 12.5, 4);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 1 + 6 + 4 + 4 + 4);

    // 10s capture duration
    const islandFlagGroup = islandMesh.children[islandMesh.children.length - 1] as THREE.Group;
    const islandBannerMesh = islandFlagGroup.children[1] as THREE.Mesh;
    const islandFlagStartY = islandFlagGroup.position.y;
    expect(interactables.advanceLootIslandCapture(4.0)).toEqual({ capturedNow: false });
    expect(interactables.getLootIslandState().captureProgress).toBeCloseTo(0.4, 5);
    expect(islandFlagGroup.position.y).toBeGreaterThan(islandFlagStartY);
    interactables.update(0.1, 99.1);
    expect(interactables.getLootIslandState().captureProgress).toBeCloseTo(0.4, 5);

    const capComplete = interactables.advanceLootIslandCapture(6.0);
    expect(capComplete.capturedNow).toBe(true);
    expect(capComplete.lootPos).toBeDefined();
    expect(capComplete.lootPos!.x).toBe(cx);
    expect(capComplete.lootPos!.y).toBeCloseTo(groundY + 24.5, 3);
    expect(capComplete.lootPos!.z).toBe(cz);
    expect(interactables.getLootIslandState().captured).toBe(true);
    expect(interactables.getLootIslandState().captureProgress).toBe(1);
    expect((islandBannerMesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('facc15');

    // Subsequent advance does not re-trigger
    expect(interactables.advanceLootIslandCapture(2.0)).toEqual({ capturedNow: false });

    // 4. reset() restores vending machines, NPCs, and hides/resets Loot Island
    interactables.reset();

    expect(interactables.getVendingMachines().every((m) => m.stock === 3)).toBe(true);
    expect(haloMat.emissiveIntensity).toBeGreaterThan(1.0);
    expect(haloGroup.scale.x).toBeCloseTo(1, 4);
    expect(interactables.purchaseFromVendingMachine(targetVm.id)).not.toBeNull();
    expect(interactables.getNpcSpecialists().every((n) => n.hiredBy === null)).toBe(true);
    expect(novaGroup.visible).toBe(true);
    expect(novaBeacon.visible).toBe(true);
    expect(interactables.hireNpcSpecialist(nova!.id, 'player2')?.hiredBy).toBe('player2');

    const resetIsland = interactables.getLootIslandState();
    expect(resetIsland.active).toBe(false);
    expect(resetIsland.captured).toBe(false);
    expect(resetIsland.captureProgress).toBe(0);
    expect(islandMesh.visible).toBe(false);
    expect(geyserMesh.visible).toBe(false);
    expect(interactables.getLootIslandColliders()).toHaveLength(0);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    vehicles.dispose();
    interactables.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('spawns tactical_dmr and kinetic_blade across PropsAndLoot floor, chest, and supply-drop pools', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 240; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('tactical_dmr')).toBe(true);
    expect(floorIds.has('kinetic_blade')).toBe(true);
    expect(chestIds.has('tactical_dmr')).toBe(true);
    expect(chestIds.has('kinetic_blade')).toBe(true);

    const supplyIds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    for (const drop of pal.getLootDrops()) {
      if (drop.item) {
        expect(WEAPONS[drop.item.weaponId].allowedRarities).toContain(drop.item.rarity);
        supplyIds.add(drop.item.weaponId);
      }
    }
    expect(supplyIds.has('tactical_dmr')).toBe(true);
    expect(supplyIds.has('kinetic_blade')).toBe(true);

    // Custom spawnLootDrop for kinetic_blade & tactical_dmr builds valid drops
    const bladeDrop = pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { item: { uid: 'blade_test', weaponId: 'kinetic_blade', rarity: 'epic', magAmmo: 0, stackCount: 1 } },
    );
    expect(bladeDrop.item?.weaponId).toBe('kinetic_blade');

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('WorldInteractables Wave-6 Weapon Bunkers, Slurp Tankers, Dropped Medallions/Crowns & Showcase', () => {
  it('constructs 8 Weapon Bunkers near POI flanks and 6 Slurp Tanker trucks along roads clear of water/buildings/props with full lifecycle', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const soundSpy = vi.fn();
    const tankerVfxSpy = vi.fn();
    bus.on('sound:play', soundSpy);
    bus.on('vfx:slurp_tanker_burst', tankerVfxSpy);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 1.2) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 3.2 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    const isClearOfProps = (x: number, z: number, pad = 1.4) =>
      !pal.getProps().some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + pad);

    // 1. 8 Weapon Bunkers near POI flanks
    const bunkers = interactables.getWeaponBunkers();
    expect(bunkers).toHaveLength(8);
    expect(interactables.getWeaponBunkerColliders()).toHaveLength(40); // 8 * (4 walls/roof + 1 door)
    expect(new Set(bunkers.map((b) => b.poiId)).size).toBe(8);

    for (const b of bunkers) {
      expect(b.unlockAtStormPhase).toBe(2);
      expect(b.unlocked).toBe(false);
      expect(b.looted).toBe(false);
      expect(terrain.isWater(b.x, b.z)).toBe(false);
      expect(b.y).toBeCloseTo(terrain.getHeightAt(b.x, b.z), 4);
      expect(terrain.getNormalAt(b.x, b.z).y).toBeGreaterThan(0.92);
      expect(isClearOfBuildings(b.x, b.y, b.z, 1.4)).toBe(true);
      expect(isClearOfProps(b.x, b.z, 1.4)).toBe(true);
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(b.x - veh.x, b.z - veh.z)).toBeGreaterThan(3.5);
      }
      for (const v of interactables.getVaults()) {
        expect(Math.hypot(b.x - v.x, b.z - v.z)).toBeGreaterThan(4.5);
      }
      for (const p of interactables.getLaunchPads()) {
        expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeGreaterThan(4.0);
      }
      for (const cp of interactables.getCapturePoints()) {
        expect(Math.hypot(b.x - cp.x, b.z - cp.z)).toBeGreaterThan(4.0);
      }
      for (const vm of interactables.getVendingMachines()) {
        expect(Math.hypot(b.x - vm.x, b.z - vm.z)).toBeGreaterThan(4.0);
      }
      for (const r of interactables.getRifts()) {
        expect(Math.hypot(b.x - r.x, b.z - r.z)).toBeGreaterThan(4.0);
      }

      const bGroup = interactables.getGroup().getObjectByName(`WeaponBunker_${b.id}`) as THREE.Group;
      expect(bGroup).toBeDefined();
      const door = bGroup.getObjectByName(`WeaponBunkerDoor_${b.id}`) as THREE.Group;
      const cache = bGroup.getObjectByName(`WeaponBunkerCache_${b.id}`) as THREE.Group;
      expect(door).toBeDefined();
      expect(cache).toBeDefined();
      expect(cache.visible).toBe(true);
    }

    const b0 = bunkers[0];
    const b0Group = interactables.getGroup().getObjectByName(`WeaponBunker_${b0.id}`) as THREE.Group;
    const b0Door = b0Group.getObjectByName(`WeaponBunkerDoor_${b0.id}`) as THREE.Group;
    const b0Cache = b0Group.getObjectByName(`WeaponBunkerCache_${b0.id}`) as THREE.Group;
    const b0ClosedY = b0Door.position.y;
    const b0BeaconOrb = b0Group.children.find(
      (ch) =>
        ch instanceof THREE.Mesh &&
        (ch.material as THREE.MeshStandardMaterial).color?.getHexString() === 'f59e0b',
    ) as THREE.Mesh;
    expect(b0BeaconOrb).toBeDefined();

    // Locked in Storm Phase 1
    expect(interactables.unlockBunkersForPhase(1)).toHaveLength(0);
    expect(b0.unlocked).toBe(false);
    expect(interactables.lootWeaponBunker(b0.id)).toBeNull();
    expect(soundSpy).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'bunker_unlock' }));

    // Unlocks at Storm Phase 2 -> opens blast door, flips beacon green, emits sound
    const unlockedList = interactables.unlockBunkersForPhase(2);
    expect(unlockedList).toHaveLength(8);
    expect(bunkers.every((b) => b.unlocked)).toBe(true);
    expect(interactables.getWeaponBunkerColliders()).toHaveLength(32); // 8 * 4 walls/roof (doors open)
    expect((b0BeaconOrb.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('22c55e');
    expect(b0Door.position.y).toBeGreaterThan(b0ClosedY);
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'bunker_unlock' }));

    // Animate blast door fully open
    for (let i = 0; i < 30; i++) {
      interactables.update(0.05, i * 0.05);
    }
    expect(b0Door.position.y).toBeGreaterThan(b0ClosedY + 2.5);

    // Subsequent phase call does not re-unlock or double-emit
    soundSpy.mockClear();
    expect(interactables.unlockBunkersForPhase(3)).toHaveLength(0);
    expect(soundSpy).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'bunker_unlock' }));

    // Looting Weapon Bunker returns valid payload & hides cache
    const lootRes = interactables.lootWeaponBunker(b0.id);
    expect(lootRes).not.toBeNull();
    expect(['combat_smg', 'boom_bow', 'tactical_dmr']).toContain(lootRes!.weaponId);
    expect(['epic', 'legendary']).toContain(lootRes!.rarity);
    expect(lootRes!.gold).toBeGreaterThan(0);
    expect(lootRes!.shieldRestore).toBeGreaterThan(0);
    expect(b0.looted).toBe(true);
    expect(b0Cache.visible).toBe(false);
    expect(interactables.lootWeaponBunker(b0.id)).toBeNull();

    // 2. 6 Slurp Tanker Trucks along roads
    const tankers = interactables.getSlurpTankers();
    expect(tankers).toHaveLength(6);
    expect(interactables.getSlurpTankerColliders()).toHaveLength(6);

    for (const t of tankers) {
      expect(t.hp).toBe(220);
      expect(t.maxHp).toBe(220);
      expect(t.healRadius).toBe(10);
      expect(t.healAmount).toBe(60);
      expect(t.destroyed).toBe(false);
      expect(terrain.isWater(t.x, t.z)).toBe(false);
      expect(t.y).toBeCloseTo(terrain.getHeightAt(t.x, t.z), 4);
      expect(terrain.getNormalAt(t.x, t.z).y).toBeGreaterThan(0.85);
      expect(isClearOfBuildings(t.x, t.y, t.z, 1.2)).toBe(true);
      expect(isClearOfProps(t.x, t.z, 1.2)).toBe(true);
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(t.x - veh.x, t.z - veh.z)).toBeGreaterThan(4.0);
      }

      const tGroup = interactables.getGroup().getObjectByName(`SlurpTanker_${t.id}`) as THREE.Group;
      const intact = tGroup.getObjectByName(`SlurpTankerIntact_${t.id}`) as THREE.Group;
      const ruptured = tGroup.getObjectByName(`SlurpTankerRuptured_${t.id}`) as THREE.Group;
      expect(intact.visible).toBe(true);
      expect(ruptured.visible).toBe(false);
    }

    const t0 = tankers[0];
    const t0Group = interactables.getGroup().getObjectByName(`SlurpTanker_${t0.id}`) as THREE.Group;
    const t0Intact = t0Group.getObjectByName(`SlurpTankerIntact_${t0.id}`) as THREE.Group;
    const t0Ruptured = t0Group.getObjectByName(`SlurpTankerRuptured_${t0.id}`) as THREE.Group;

    // Non-lethal damage
    const chipRes = interactables.damageSlurpTanker(t0.id, 80);
    expect(chipRes).toEqual({
      exploded: false,
      x: t0.x,
      y: t0.y,
      z: t0.z,
      radius: 10,
      healAmount: 0,
    });
    expect(t0.hp).toBe(140);
    expect(t0.destroyed).toBe(false);
    expect(t0Intact.visible).toBe(true);
    expect(t0Ruptured.visible).toBe(false);
    interactables.update(0.05, 2.0);

    // Lethal damage ruptures tank, swaps visuals, emits VFX + SFX, removes collider
    const burstRes = interactables.damageSlurpTanker(t0.id, 150);
    expect(burstRes).toEqual({
      exploded: true,
      x: t0.x,
      y: t0.y,
      z: t0.z,
      radius: 10,
      healAmount: 60,
    });
    expect(t0.hp).toBe(0);
    expect(t0.destroyed).toBe(true);
    expect(t0Intact.visible).toBe(false);
    expect(t0Ruptured.visible).toBe(true);
    expect(interactables.getSlurpTankerColliders()).toHaveLength(5);
    expect(tankerVfxSpy).toHaveBeenCalledWith({
      position: { x: t0.x, y: t0.y + 1.5, z: t0.z },
      radius: 10,
    });
    expect(soundSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'slurp_tanker_burst' }),
    );
    expect(interactables.damageSlurpTanker(t0.id, 10)).toBeNull();
    expect(interactables.damageSlurpTanker('nonexistent_tanker', 10)).toBeNull();

    // 3. Reset restores all bunkers and tankers
    interactables.reset();
    expect(interactables.getWeaponBunkers()).toHaveLength(8);
    expect(
      interactables.getWeaponBunkers().every((b) => !b.unlocked && !b.looted),
    ).toBe(true);
    expect((b0BeaconOrb.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('f59e0b');
    expect(b0Door.position.y).toBeCloseTo(b0ClosedY, 4);
    expect(b0Cache.visible).toBe(true);
    expect(interactables.getWeaponBunkerColliders()).toHaveLength(40);

    expect(interactables.getSlurpTankers()).toHaveLength(6);
    expect(
      interactables.getSlurpTankers().every((t) => t.hp === 220 && !t.destroyed),
    ).toBe(true);
    expect(t0Intact.visible).toBe(true);
    expect(t0Ruptured.visible).toBe(false);
    expect(interactables.getSlurpTankerColliders()).toHaveLength(6);

    vehicles.dispose();
    interactables.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('spawns and collects dynamic DroppedMedallions & DroppedCrowns, supports qaPlaceWave6Showcase, and clears on reset()', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    expect(interactables.getDroppedMedallions()).toHaveLength(0);
    expect(interactables.getDroppedCrowns()).toHaveLength(0);

    // Spawn Dropped Medallions & verify 3D spinning golden mesh + light pillar
    const m1 = interactables.spawnDroppedMedallion('medallion_siphon', 10, 12, 10);
    const m2 = interactables.spawnDroppedMedallion('medallion_agility', 24, 12, 24);
    expect(interactables.getDroppedMedallions()).toHaveLength(2);
    expect(m1.collected).toBe(false);

    const m1Group = interactables.getGroup().getObjectByName(`DroppedMedallion_${m1.id}`) as THREE.Group;
    expect(m1Group).toBeDefined();
    expect(m1Group.visible).toBe(true);
    const m1Spin = m1Group.children.find((ch) => ch instanceof THREE.Group) as THREE.Group;
    expect(m1Spin).toBeDefined();
    const rotBefore = m1Spin.rotation.y;
    interactables.update(0.25, 1.0);
    expect(m1Spin.rotation.y).toBeGreaterThan(rotBefore);

    // Out of range returns null; in range collects closest
    expect(interactables.collectNearbyMedallion(0, 0, 2.5)).toBeNull();
    const pickedM = interactables.collectNearbyMedallion(11, 10.5, 2.5);
    expect(pickedM?.id).toBe(m1.id);
    expect(pickedM?.medallionId).toBe('medallion_siphon');
    expect(pickedM?.collected).toBe(true);
    expect(m1Group.visible).toBe(false);
    expect(interactables.collectNearbyMedallion(11, 10.5, 2.5)).toBeNull();
    expect(m2.collected).toBe(false);

    // Spawn Dropped Crown & verify 3D spinning golden mesh + light pillar
    const c1 = interactables.spawnDroppedCrown(-15, 12, -15);
    expect(interactables.getDroppedCrowns()).toHaveLength(1);
    expect(c1.collected).toBe(false);

    const c1Group = interactables.getGroup().getObjectByName(`DroppedCrown_${c1.id}`) as THREE.Group;
    expect(c1Group).toBeDefined();
    expect(c1Group.visible).toBe(true);
    const c1Spin = c1Group.children.find((ch) => ch instanceof THREE.Group) as THREE.Group;
    const crownRotBefore = c1Spin.rotation.y;
    interactables.update(0.25, 1.25);
    expect(c1Spin.rotation.y).toBeGreaterThan(crownRotBefore);

    expect(interactables.collectNearbyCrown(0, 0, 2.5)).toBeNull();
    const pickedC = interactables.collectNearbyCrown(-14.2, -15, 2.5);
    expect(pickedC?.id).toBe(c1.id);
    expect(pickedC?.collected).toBe(true);
    expect(c1Group.visible).toBe(false);
    expect(interactables.collectNearbyCrown(-14.2, -15, 2.5)).toBeNull();

    // qaPlaceWave6Showcase places unlocked bunker, intact tanker, medallion, and crown grounded near centerPos
    const center = { x: -75, y: terrain.getHeightAt(-75, -40), z: -40 };
    const showcase = interactables.qaPlaceWave6Showcase(center);
    expect(showcase.bunker.unlocked).toBe(true);
    expect(showcase.bunker.looted).toBe(false);
    expect(showcase.bunker.y).toBeCloseTo(terrain.getHeightAt(showcase.bunker.x, showcase.bunker.z), 4);
    expect(terrain.isWater(showcase.bunker.x, showcase.bunker.z)).toBe(false);
    expect(Math.hypot(showcase.bunker.x - center.x, showcase.bunker.z - center.z)).toBeLessThan(15);

    expect(showcase.tanker.hp).toBe(220);
    expect(showcase.tanker.destroyed).toBe(false);
    expect(showcase.tanker.y).toBeCloseTo(terrain.getHeightAt(showcase.tanker.x, showcase.tanker.z), 4);
    expect(terrain.isWater(showcase.tanker.x, showcase.tanker.z)).toBe(false);

    expect(showcase.medallion.collected).toBe(false);
    expect(showcase.medallion.y).toBeCloseTo(terrain.getHeightAt(showcase.medallion.x, showcase.medallion.z), 4);
    expect(showcase.crown.collected).toBe(false);
    expect(showcase.crown.y).toBeCloseTo(terrain.getHeightAt(showcase.crown.x, showcase.crown.z), 4);

    // Calling qaPlaceWave6Showcase again replaces showcase bunker/tanker cleanly without leaking duplicates
    interactables.qaPlaceWave6Showcase(center);
    expect(interactables.getWeaponBunkers()).toHaveLength(9);
    expect(interactables.getSlurpTankers()).toHaveLength(7);

    // reset() clears dynamic medallions/crowns and removes QA showcase entities
    interactables.reset();
    expect(interactables.getDroppedMedallions()).toHaveLength(0);
    expect(interactables.getDroppedCrowns()).toHaveLength(0);
    expect(interactables.getWeaponBunkers()).toHaveLength(8);
    expect(interactables.getSlurpTankers()).toHaveLength(6);

    interactables.dispose();
    terrain.dispose();
  });

  it('spawns combat_smg and boom_bow across PropsAndLoot floor, chest, and supply-drop pools', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 280; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('combat_smg')).toBe(true);
    expect(floorIds.has('boom_bow')).toBe(true);
    expect(chestIds.has('combat_smg')).toBe(true);
    expect(chestIds.has('boom_bow')).toBe(true);

    const supplyIds = new Set<string>();
    for (let i = 0; i < 65; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    for (const drop of pal.getLootDrops()) {
      if (drop.item) {
        expect(WEAPONS[drop.item.weaponId].allowedRarities).toContain(drop.item.rarity);
        supplyIds.add(drop.item.weaponId);
      }
    }
    expect(supplyIds.has('combat_smg')).toBe(true);
    expect(supplyIds.has('boom_bow')).toBe(true);

    const bowDrop = pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { item: { uid: 'bow_test', weaponId: 'boom_bow', rarity: 'legendary', magAmmo: 1, stackCount: 1 } },
    );
    expect(bowDrop.item?.weaponId).toBe('boom_bow');

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('triggers pooled 3D lightning bolts, updates golden_hour sun corona, and keeps oceanMat/skyMat GLSL ES 1.00 valid', () => {
    const bus = new EventBus();
    const fx = new EnvironmentFX(4201, bus);
    const group = fx.getGroup();

    // 1. Pooled 3D lightning bolts triggered on 'vfx:lightning_flash' & 'storm_front'
    const boltsGroup = group.getObjectByName('LightningBolts') as THREE.Group;
    expect(boltsGroup).toBeDefined();
    expect(boltsGroup.children.length).toBeGreaterThanOrEqual(4);
    expect(boltsGroup.children.every((b) => !b.visible)).toBe(true);

    bus.emit('vfx:lightning_flash', { intensity: 0.95 });
    expect(boltsGroup.children.some((b) => b.visible)).toBe(true);

    // Advances & expires cleanly
    for (let i = 0; i < 12; i++) {
      fx.update(0.1, i * 0.1, { x: 0, y: 12, z: 0 }, 'grassland');
    }
    expect(boltsGroup.children.every((b) => !b.visible)).toBe(true);

    // Storm front weather also triggers lightning bolts
    fx.setWeather('storm_front');
    let sawStormBolt = false;
    for (let i = 0; i < 45; i++) {
      fx.update(0.15, 2 + i * 0.15, { x: 0, y: 14, z: 0 }, 'grassland');
      if (boltsGroup.children.some((b) => b.visible)) {
        sawStormBolt = true;
      }
    }
    expect(sawStormBolt).toBe(true);

    // 2. Sun corona halo synced to sun elevation & golden_hour warmth
    const corona = group.getObjectByName('SunCorona') as THREE.Group;
    expect(corona).toBeDefined();
    expect(corona.children.length).toBeGreaterThanOrEqual(2);

    fx.setWeather('clear');
    for (let i = 0; i < 20; i++) fx.update(0.2, 10 + i * 0.2);
    const clearScale = corona.scale.x;
    const clearInnerMat = (corona.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const clearOuterMat = (corona.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const clearOuterBlue = clearOuterMat.color.b;

    fx.setWeather('golden_hour');
    for (let i = 0; i < 20; i++) fx.update(0.2, 15 + i * 0.2);
    const goldScale = corona.scale.x;
    expect(goldScale).toBeGreaterThan(clearScale);
    expect(clearOuterMat.color.b).toBeLessThan(clearOuterBlue);
    expect(clearInnerMat.opacity).toBeGreaterThan(0.5);

    const sunDir = fx.getSunDirection();
    expect(corona.position.x / 1180).toBeCloseTo(sunDir.x, 3);
    expect(corona.position.y / 1180).toBeCloseTo(sunDir.y, 3);
    expect(corona.position.z / 1180).toBeCloseTo(sunDir.z, 3);

    // 3. GLSL ES 1.00 validity & shoreline foam modulation check on skyMat and oceanMat
    const skyMesh = group.getObjectByName('SkyDome') as THREE.Mesh;
    const oceanMesh = group.getObjectByName('OceanWater') as THREE.Mesh;
    const skyMat = skyMesh.material as THREE.ShaderMaterial;
    const oceanMat = oceanMesh.material as THREE.ShaderMaterial;

    for (const shader of [skyMat.fragmentShader, oceanMat.fragmentShader]) {
      const smoothMatches = [...shader.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)];
      expect(smoothMatches.length).toBeGreaterThan(0);
      for (const m of smoothMatches) {
        expect(Number(m[1])).toBeLessThan(Number(m[2]));
      }
    }
    expect(oceanMat.fragmentShader).toContain('shoreWarp');
    expect(oceanMat.fragmentShader).toContain('surfCrestA');
    expect(oceanMat.fragmentShader).toContain('foamLace');

    fx.dispose();
  });
});

describe('WorldInteractables Wave-7 Grind Rails, Reboot Vans, Supply Drones & Showcase', () => {
  it('constructs 4 Neon Energy Grind Rails, 6 Glowing Blue Reboot Vans, and 12 Flying Supply Drones with full lifecycle and reset()', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const soundSpy = vi.fn();
    const droneVfxSpy = vi.fn();
    bus.on('sound:play', soundSpy);
    bus.on('vfx:drone_explode', droneVfxSpy);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 1.0) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 3.2 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    // 1. 4 Neon Energy Grind Rails
    const rails = interactables.getGrindRails();
    expect(rails).toHaveLength(4);
    expect(new Set(rails.map((r) => r.poiId))).toEqual(
      new Set(['metro_towers', 'skyline_spire', 'market_row', 'frostpeak_citadel']),
    );

    expect(interactables.sampleGrindRailAt('nonexistent_rail', 0)).toBeNull();
    expect(interactables.sampleGrindRailAt(rails[0].id, Number.NaN)).toBeNull();
    expect(interactables.findNearbyGrindRail({ x: 0, y: 500, z: 0 }, 2.8)).toBeNull();

    for (const rail of rails) {
      expect(rail.speed).toBe(GRIND_RAIL_SPEED);
      expect(rail.points.length).toBeGreaterThanOrEqual(6);
      const railGroup = interactables.getGroup().getObjectByName(`GrindRail_${rail.id}`) as THREE.Group;
      expect(railGroup).toBeDefined();
      expect(railGroup.children.length).toBeGreaterThanOrEqual(10);

      // Wrapping [0, 1) cleanly on sampleGrindRailAt
      const s0: GrindRailSampleResult | null = interactables.sampleGrindRailAt(rail.id, 0);
      const s1 = interactables.sampleGrindRailAt(rail.id, 1);
      const s2 = interactables.sampleGrindRailAt(rail.id, 2);
      const sNeg1 = interactables.sampleGrindRailAt(rail.id, -1);
      expect(s0).not.toBeNull();
      expect(s1!.position.x).toBeCloseTo(s0!.position.x, 4);
      expect(s1!.position.y).toBeCloseTo(s0!.position.y, 4);
      expect(s1!.position.z).toBeCloseTo(s0!.position.z, 4);
      expect(s2!.position.x).toBeCloseTo(s0!.position.x, 4);
      expect(sNeg1!.position.x).toBeCloseTo(s0!.position.x, 4);

      const sNegQuarter = interactables.sampleGrindRailAt(rail.id, -0.25)!;
      const sThreeQuarters = interactables.sampleGrindRailAt(rail.id, 0.75)!;
      expect(sNegQuarter.position.x).toBeCloseTo(sThreeQuarters.position.x, 4);
      expect(sNegQuarter.position.y).toBeCloseTo(sThreeQuarters.position.y, 4);
      expect(sNegQuarter.position.z).toBeCloseTo(sThreeQuarters.position.z, 4);

      for (let i = 0; i < 20; i++) {
        const sample = interactables.sampleGrindRailAt(rail.id, i / 20)!;
        expect(Math.hypot(sample.tangent.x, sample.tangent.y, sample.tangent.z)).toBeCloseTo(1, 4);
        expect(terrain.isWater(sample.position.x, sample.position.z)).toBe(false);
        expect(
          isClearOfBuildings(sample.position.x, sample.position.y, sample.position.z, 0.25),
        ).toBe(true);
      }

      const targetSample = interactables.sampleGrindRailAt(rail.id, 0.37)!;
      const found: NearbyGrindRailResult | null = interactables.findNearbyGrindRail(
        {
          x: targetSample.position.x + 1.0,
          y: targetSample.position.y,
          z: targetSample.position.z,
        },
        2.8,
      );
      expect(found).not.toBeNull();
      expect(found!.rail.id).toBe(rail.id);
      expect(found!.t).toBeGreaterThanOrEqual(0);
      expect(found!.t).toBeLessThan(1);
      expect(
        Math.hypot(
          found!.position.x - targetSample.position.x,
          found!.position.y - targetSample.position.y,
          found!.position.z - targetSample.position.z,
        ),
      ).toBeLessThan(1.05);
      expect(Math.hypot(found!.tangent.x, found!.tangent.y, found!.tangent.z)).toBeCloseTo(1, 4);
      expect(
        interactables.findNearbyGrindRail(
          {
            x: targetSample.position.x + 1.0,
            y: targetSample.position.y,
            z: targetSample.position.z,
          },
          0.4,
        ),
      ).toBeNull();
    }

    // Ring animation advances smoothly
    const rail0Group = interactables.getGroup().getObjectByName(`GrindRail_${rails[0].id}`) as THREE.Group;
    const ringMesh = rail0Group.children[rail0Group.children.length - 1] as THREE.Mesh;
    const ringPosBefore = ringMesh.position.clone();
    interactables.update(0.25, 0.25);
    expect(ringMesh.position.distanceTo(ringPosBefore)).toBeGreaterThan(0.5);

    // 2. 6 Glowing Blue Reboot Vans
    const vans = interactables.getRebootVans();
    expect(vans).toHaveLength(6);
    expect(interactables.getRebootVanColliders()).toHaveLength(6);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    for (const van of vans) {
      expect(van.available).toBe(true);
      expect(van.cooldownRemainingSec).toBe(0);
      expect(terrain.isWater(van.x, van.z)).toBe(false);
      expect(van.y).toBeCloseTo(terrain.getHeightAt(van.x, van.z), 4);
      expect(terrain.getNormalAt(van.x, van.z).y).toBeGreaterThan(0.92);
      expect(isClearOfBuildings(van.x, van.y, van.z, 1.1)).toBe(true);
      const blockingProp = pal.getProps().find((p) => Math.hypot(van.x - p.x, van.z - p.z) < p.radius + 1.2);
      expect(blockingProp, `${van.id} (${van.x}, ${van.z}) near prop ${blockingProp?.kind} at (${blockingProp?.x}, ${blockingProp?.z})`).toBeUndefined();
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(van.x - veh.x, van.z - veh.z)).toBeGreaterThan(3.5);
      }
      for (const bench of interactables.getUpgradeBenches()) {
        expect(Math.hypot(van.x - bench.x, van.z - bench.z)).toBeGreaterThan(3.5);
      }
      for (const vm of interactables.getVendingMachines()) {
        expect(Math.hypot(van.x - vm.x, van.z - vm.z)).toBeGreaterThan(3.5);
      }
      const vanGroup = interactables.getGroup().getObjectByName(`RebootVan_${van.id}`) as THREE.Group;
      const beaconGroup = interactables.getGroup().getObjectByName(`RebootVanBeacon_${van.id}`) as THREE.Group;
      expect(vanGroup).toBeDefined();
      expect(beaconGroup).toBeDefined();
    }

    const van0 = vans[0];
    const van0Beacon = interactables.getGroup().getObjectByName(`RebootVanBeacon_${van0.id}`) as THREE.Group;
    const van0Beam = van0Beacon.children[1] as THREE.Mesh;
    const van0Holo = van0Beacon.children[2] as THREE.Group;
    expect(van0Beam.visible).toBe(true);

    expect(interactables.triggerRebootVan('nonexistent_van')).toBe(false);
    expect(interactables.triggerRebootVan(van0.id)).toBe(true);
    expect(van0.available).toBe(false);
    expect(van0.cooldownRemainingSec).toBe(REBOOT_VAN_COOLDOWN_SEC);
    expect(van0Beam.visible).toBe(false);
    expect(interactables.triggerRebootVan(van0.id)).toBe(false);

    const holoRotBefore = van0Holo.rotation.y;
    interactables.update(25, 25.25);
    expect(van0Holo.rotation.y).toBeGreaterThan(holoRotBefore);
    expect(van0.available).toBe(false);
    expect(van0.cooldownRemainingSec).toBeCloseTo(REBOOT_VAN_COOLDOWN_SEC - 25, 4);

    interactables.update(36, 61.25);
    expect(van0.available).toBe(true);
    expect(van0.cooldownRemainingSec).toBe(0);
    expect(van0Beam.visible).toBe(true);
    expect(interactables.triggerRebootVan(van0.id)).toBe(true);

    // 3. 12 Flying Supply Drones
    const drones = interactables.getSupplyDrones();
    expect(drones).toHaveLength(12);

    for (const drone of drones) {
      expect(drone.hp).toBe(drone.maxHp);
      expect(drone.maxHp).toBeGreaterThan(0);
      expect(drone.destroyed).toBe(false);
      expect(drone.orbitRadius).toBeGreaterThan(0);
      const localGroundY = terrain.getHeightAt(drone.x, drone.z);
      expect(drone.y - localGroundY).toBeGreaterThanOrEqual(12);
      expect(drone.y - localGroundY).toBeLessThanOrEqual(17);

      const droneGroup = interactables.getGroup().getObjectByName(`SupplyDrone_${drone.id}`) as THREE.Group;
      expect(droneGroup).toBeDefined();
      expect(droneGroup.visible).toBe(true);
    }

    const d0 = drones[0];
    const d0Group = interactables.getGroup().getObjectByName(`SupplyDrone_${d0.id}`) as THREE.Group;
    const d0BeforeX = d0.x;
    const d0BeforeZ = d0.z;
    const d0BeforeAngle = d0.orbitAngle;
    interactables.update(0.5, 61.75);
    expect(d0.orbitAngle).not.toBeCloseTo(d0BeforeAngle, 4);
    expect(Math.hypot(d0.x - d0BeforeX, d0.z - d0BeforeZ)).toBeGreaterThan(0.5);

    expect(interactables.damageSupplyDrone('nonexistent_drone', 50)).toBeNull();

    const chipDrone = interactables.damageSupplyDrone(d0.id, 30);
    expect(chipDrone).not.toBeNull();
    expect(chipDrone!.destroyed).toBe(false);
    expect(chipDrone!.gold).toBe(0);
    expect(d0.hp).toBe(d0.maxHp - 30);
    expect(d0.destroyed).toBe(false);
    expect(d0Group.visible).toBe(true);
    expect(droneVfxSpy).not.toHaveBeenCalled();

    const killDrone: SupplyDroneDamageResult | null = interactables.damageSupplyDrone(d0.id, 100);
    expect(killDrone).not.toBeNull();
    expect(killDrone!.destroyed).toBe(true);
    expect(killDrone!.rarity).toBe(d0.rarity);
    expect(WEAPONS[killDrone!.weaponId].allowedRarities).toContain(killDrone!.rarity);
    expect(killDrone!.gold).toBeGreaterThan(0);
    expect(['spike_trap', 'bouncer_pad']).toContain(killDrone!.trapKind);
    expect(d0.hp).toBe(0);
    expect(d0.destroyed).toBe(true);
    expect(d0Group.visible).toBe(false);
    expect(droneVfxSpy).toHaveBeenCalledWith({
      position: { x: d0.x, y: d0.y, z: d0.z },
      rarity: d0.rarity,
    });
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'drone_explode' }));
    expect(interactables.damageSupplyDrone(d0.id, 10)).toBeNull();

    const deadX = d0.x;
    const deadZ = d0.z;
    interactables.update(0.5, 62.25);
    expect(d0.x).toBe(deadX);
    expect(d0.z).toBe(deadZ);

    // 4. reset() restores vans and drones
    interactables.reset();
    expect(
      interactables.getRebootVans().every((v) => v.available && v.cooldownRemainingSec === 0),
    ).toBe(true);
    expect(van0Beam.visible).toBe(true);
    expect(
      interactables.getSupplyDrones().every((d) => d.hp === d.maxHp && !d.destroyed),
    ).toBe(true);
    expect(d0Group.visible).toBe(true);

    vehicles.dispose();
    interactables.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('supports qaPlaceWave7Showcase and clears Wave-7 QA showcase extras on reset()', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    const center = { x: -75, y: terrain.getHeightAt(-75, -40), z: -40 };
    const showcase: Wave7ShowcaseResult = interactables.qaPlaceWave7Showcase(center);

    expect(showcase.rebootVan.available).toBe(true);
    expect(showcase.rebootVan.cooldownRemainingSec).toBe(0);
    expect(terrain.isWater(showcase.rebootVan.x, showcase.rebootVan.z)).toBe(false);
    expect(showcase.rebootVan.y).toBeCloseTo(
      terrain.getHeightAt(showcase.rebootVan.x, showcase.rebootVan.z),
      4,
    );
    expect(Math.hypot(showcase.rebootVan.x - center.x, showcase.rebootVan.z - center.z)).toBeLessThan(15);

    expect(showcase.grindRail.speed).toBe(GRIND_RAIL_SPEED);
    const railSample = interactables.sampleGrindRailAt(showcase.grindRail.id, 0);
    expect(railSample).not.toBeNull();
    expect(
      interactables.findNearbyGrindRail(railSample!.position, 1.5)?.rail.id,
    ).toBe(showcase.grindRail.id);

    expect(showcase.drones).toHaveLength(2);
    for (const sd of showcase.drones) {
      expect(sd.destroyed).toBe(false);
      const gY = terrain.getHeightAt(sd.x, sd.z);
      expect(sd.y - gY).toBeGreaterThanOrEqual(12);
      expect(sd.y - gY).toBeLessThanOrEqual(17);
    }

    expect(interactables.getRebootVans()).toHaveLength(7);
    expect(interactables.getRebootVanColliders()).toHaveLength(7);
    expect(interactables.getGrindRails()).toHaveLength(5);
    expect(interactables.getSupplyDrones()).toHaveLength(14);

    // Calling qaPlaceWave7Showcase again replaces showcase extras without leaking duplicates
    interactables.qaPlaceWave7Showcase(center);
    expect(interactables.getRebootVans()).toHaveLength(7);
    expect(interactables.getRebootVanColliders()).toHaveLength(7);
    expect(interactables.getGrindRails()).toHaveLength(5);
    expect(interactables.getSupplyDrones()).toHaveLength(14);

    interactables.reset();
    expect(interactables.getRebootVans()).toHaveLength(6);
    expect(interactables.getRebootVanColliders()).toHaveLength(6);
    expect(interactables.getGrindRails()).toHaveLength(4);
    expect(interactables.getSupplyDrones()).toHaveLength(12);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    interactables.dispose();
    terrain.dispose();
  });
});

describe('Wave-7 Loot Pools, EnvironmentDetail Wind Sway & EnvironmentFX Rain Ripples', () => {
  it('spawns railgun and minigun across PropsAndLoot floor, chest, and supply-drop pools', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 320; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('railgun')).toBe(true);
    expect(floorIds.has('minigun')).toBe(true);
    expect(chestIds.has('railgun')).toBe(true);
    expect(chestIds.has('minigun')).toBe(true);

    const supplyIds = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    for (const drop of pal.getLootDrops()) {
      if (drop.item) {
        expect(WEAPONS[drop.item.weaponId].allowedRarities).toContain(drop.item.rarity);
        supplyIds.add(drop.item.weaponId);
      }
    }
    expect(supplyIds.has('railgun')).toBe(true);
    expect(supplyIds.has('minigun')).toBe(true);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('animates weather-responsive wind sway on EnvironmentDetail instanced foliage and rain splash ripples in EnvironmentFX', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const detail = new EnvironmentDetail(terrain, world.colliders, 'low', 4201);

    const grassMesh = detail.getGroup().getObjectByName('InstancedGrass') as THREE.InstancedMesh;
    expect(grassMesh).toBeDefined();
    const grassMat = grassMesh.material as THREE.MeshStandardMaterial;
    const windUniforms = grassMat.userData.windUniforms as {
      uWindTime: { value: number };
      uWindStrength: { value: number };
    };
    expect(windUniforms).toBeDefined();

    // Test onBeforeCompile shader injection validity
    const mockShader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '',
    };
    grassMat.onBeforeCompile(mockShader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(mockShader.vertexShader).toContain('uniform float uWindTime;');
    expect(mockShader.vertexShader).toContain('uniform float uWindStrength;');
    expect(mockShader.vertexShader).toContain('transformed.x +=');
    expect(mockShader.vertexShader).toContain('transformed.z +=');

    detail.update(0.1, 2.5, 0.4);
    expect(detail.getWindState()).toEqual({ time: 2.5, strength: 0.4 });
    expect(windUniforms.uWindTime.value).toBe(2.5);
    expect(windUniforms.uWindStrength.value).toBe(0.4);

    detail.update(0.1, 6.0, 3.2);
    expect(detail.getWindState()).toEqual({ time: 6.0, strength: 3.2 });
    expect(windUniforms.uWindTime.value).toBe(6.0);
    expect(windUniforms.uWindStrength.value).toBe(3.2);

    // Optional elapsed & windStrength arguments work seamlessly
    detail.update(0.25);
    expect(detail.getWindState().time).toBeCloseTo(6.25, 4);
    expect(detail.getWindState().strength).toBe(1.0);

    detail.dispose();
    builder.dispose();
    terrain.dispose();

    // EnvironmentFX subtle ground rain splash ripples & valid GLSL ES 1.00
    const bus = new EventBus();
    const fx = new EnvironmentFX(4201, bus);
    const fxGroup = fx.getGroup();
    const splashMesh = fxGroup.getObjectByName('RainSplashRipples') as THREE.Mesh;
    expect(splashMesh).toBeDefined();
    expect(splashMesh.visible).toBe(false);

    const splashMat = splashMesh.material as THREE.ShaderMaterial;
    const oceanMesh = fxGroup.getObjectByName('OceanWater') as THREE.Mesh;
    const oceanMat = oceanMesh.material as THREE.ShaderMaterial;
    const skyMesh = fxGroup.getObjectByName('SkyDome') as THREE.Mesh | undefined;
    const shaderMats = [splashMat, oceanMat, ...(skyMesh?.material instanceof THREE.ShaderMaterial ? [skyMesh.material] : [])];

    for (const mat of shaderMats) {
      for (const glsl of [mat.vertexShader, mat.fragmentShader]) {
        const smoothMatches = [
          ...glsl.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g),
        ];
        for (const m of smoothMatches) {
          expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
        const usedUniforms = new Set(glsl.match(/\bu[A-Z][A-Za-z0-9_]*/g) ?? []);
        for (const uName of usedUniforms) {
          expect(glsl).toMatch(new RegExp(`uniform\\s+(?:float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D)\\s+${uName}\\b`));
          expect(mat.uniforms[uName]).toBeDefined();
        }
      }
    }
    expect(oceanMat.fragmentShader).toContain('uniform float uRain;');

    fx.setWeather('rain');
    fx.update(0.1, 3.0, { x: 10, y: 12, z: -5 }, 'grassland');
    expect(splashMesh.visible).toBe(true);
    expect(splashMesh.position.x).toBe(10);
    expect(splashMesh.position.y).toBeCloseTo(12.05, 4);
    expect(splashMesh.position.z).toBe(-5);
    expect(splashMat.uniforms.uTime.value).toBe(3.0);
    expect(splashMat.uniforms.uRainStrength.value).toBeGreaterThan(0.2);

    fx.setWeather('storm_front');
    fx.update(0.2, 4.0, { x: -20, y: 14, z: 8 }, 'urban');
    expect(splashMesh.visible).toBe(true);
    expect(splashMat.uniforms.uRainStrength.value).toBeGreaterThan(0.4);

    fx.setWeather('clear');
    fx.update(0.2, 5.0, { x: -20, y: 14, z: 8 }, 'urban');
    expect(splashMesh.visible).toBe(false);
    expect(splashMat.uniforms.uRainStrength.value).toBe(0);

    fx.dispose();
  });
});

describe('WorldInteractables Wave-8 Mod Benches, Forecast Towers, Stealth Bushes & Showcase', () => {
  it('constructs 6 Mod Benches, 4 Forecast Towers, and 28 Stealth Bushes clear of water/buildings/props with full lifecycle and reset()', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const soundSpy = vi.fn();
    const forecastVfxSpy = vi.fn();
    bus.on('sound:play', soundSpy);
    bus.on('vfx:forecast_pulse', forecastVfxSpy);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 1.0) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 2.8 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    const isClearOfProps = (x: number, z: number, pad = 1.0) =>
      !pal.getProps().some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + pad);

    // 1. 6 Illuminated Weapon Mod Benches
    const modBenches = interactables.getModBenches();
    expect(modBenches).toHaveLength(6);
    expect(interactables.getModBenchColliders()).toHaveLength(6);

    for (const mb of modBenches) {
      expect(mb.costGold).toBe(WEAPON_MOD_COST_GOLD);
      expect(mb.costGold).toBe(75);
      expect(terrain.isWater(mb.x, mb.z)).toBe(false);
      expect(mb.y).toBeCloseTo(terrain.getHeightAt(mb.x, mb.z), 4);
      expect(terrain.getNormalAt(mb.x, mb.z).y).toBeGreaterThan(0.92);
      expect(isClearOfBuildings(mb.x, mb.y, mb.z, 1.0)).toBe(true);
      const blockingProp = pal.getProps().find((p) => Math.hypot(mb.x - p.x, mb.z - p.z) < p.radius + 1.0);
      expect(blockingProp, `${mb.id} (${mb.x}, ${mb.z}) near prop ${blockingProp?.kind} at (${blockingProp?.x}, ${blockingProp?.z})`).toBeUndefined();
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(mb.x - veh.x, mb.z - veh.z)).toBeGreaterThan(3.0);
      }
      for (const bench of interactables.getUpgradeBenches()) {
        expect(Math.hypot(mb.x - bench.x, mb.z - bench.z)).toBeGreaterThan(3.0);
      }
      for (const vm of interactables.getVendingMachines()) {
        expect(Math.hypot(mb.x - vm.x, mb.z - vm.z)).toBeGreaterThan(3.0);
      }
      for (const v of interactables.getVaults()) {
        expect(Math.hypot(mb.x - v.x, mb.z - v.z)).toBeGreaterThan(3.5);
      }
      for (const wb of interactables.getWeaponBunkers()) {
        expect(Math.hypot(mb.x - wb.x, mb.z - wb.z)).toBeGreaterThan(4.0);
      }
      for (const rv of interactables.getRebootVans()) {
        expect(Math.hypot(mb.x - rv.x, mb.z - rv.z)).toBeGreaterThan(3.5);
      }
      for (const cp of interactables.getCapturePoints()) {
        expect(Math.hypot(mb.x - cp.x, mb.z - cp.z)).toBeGreaterThan(3.5);
      }
      const mbGroup = interactables.getGroup().getObjectByName(`ModBench_${mb.id}`) as THREE.Group;
      expect(mbGroup).toBeDefined();
      expect(mbGroup.children.length).toBeGreaterThanOrEqual(8);
    }

    const mb0 = modBenches[0];
    const mb0Group = interactables.getGroup().getObjectByName(`ModBench_${mb0.id}`) as THREE.Group;
    const mb0Holo = mb0Group.children[mb0Group.children.length - 1] as THREE.Group;
    const holoRotBefore = mb0Holo.rotation.y;
    interactables.update(0.25, 1.0);
    expect(mb0Holo.rotation.y).not.toBe(holoRotBefore);

    expect(interactables.findNearbyModBench({ x: mb0.x + 2.0, y: mb0.y, z: mb0.z }, 3.8)?.id).toBe(mb0.id);
    expect(interactables.findNearbyModBench({ x: mb0.x + 12.0, y: mb0.y, z: mb0.z }, 3.8)).toBeNull();
    expect(interactables.findNearbyModBench({ x: Number.NaN, y: mb0.y, z: mb0.z })).toBeNull();

    // 2. 4 Radar Weather Forecast Towers
    const towers = interactables.getForecastTowers();
    expect(towers).toHaveLength(4);
    expect(interactables.getForecastTowerColliders()).toHaveLength(4);

    for (const ft of towers) {
      expect(ft.scanned).toBe(false);
      expect(ft.scannedBy).toBeNull();
      expect(terrain.isWater(ft.x, ft.z)).toBe(false);
      expect(ft.y).toBeCloseTo(terrain.getHeightAt(ft.x, ft.z), 4);
      expect(terrain.getNormalAt(ft.x, ft.z).y).toBeGreaterThan(0.92);
      expect(isClearOfBuildings(ft.x, ft.y, ft.z, 1.1)).toBe(true);
      const blockingProp = pal.getProps().find((p) => Math.hypot(ft.x - p.x, ft.z - p.z) < p.radius + 1.1);
      expect(blockingProp, `${ft.id} (${ft.x}, ${ft.z}) near prop ${blockingProp?.kind} at (${blockingProp?.x}, ${blockingProp?.z})`).toBeUndefined();
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(ft.x - veh.x, ft.z - veh.z)).toBeGreaterThan(3.5);
      }
      for (const wb of interactables.getWeaponBunkers()) {
        expect(Math.hypot(ft.x - wb.x, ft.z - wb.z)).toBeGreaterThan(4.0);
      }
      for (const mb of modBenches) {
        expect(Math.hypot(ft.x - mb.x, ft.z - mb.z)).toBeGreaterThan(4.0);
      }
      const ftGroup = interactables.getGroup().getObjectByName(`ForecastTower_${ft.id}`) as THREE.Group;
      const dishPivot = ftGroup.getObjectByName(`ForecastDish_${ft.id}`) as THREE.Group;
      expect(ftGroup).toBeDefined();
      expect(dishPivot).toBeDefined();
    }

    const ft0 = towers[0];
    const ft1 = towers[1];
    const ft0Group = interactables.getGroup().getObjectByName(`ForecastTower_${ft0.id}`) as THREE.Group;
    const ft1Group = interactables.getGroup().getObjectByName(`ForecastTower_${ft1.id}`) as THREE.Group;
    const ft0Dish = ft0Group.getObjectByName(`ForecastDish_${ft0.id}`) as THREE.Group;
    const ft0BeaconOrb = ft0Group.children[ft0Group.children.length - 3] as THREE.Mesh;
    const ft1BeaconOrb = ft1Group.children[ft1Group.children.length - 3] as THREE.Mesh;
    const unscannedHex = (ft0BeaconOrb.material as THREE.MeshStandardMaterial).color.getHexString();

    const dishRotBefore = ft0Dish.rotation.y;
    interactables.update(0.3, 1.3);
    expect(ft0Dish.rotation.y).toBeGreaterThan(dishRotBefore);

    expect(interactables.findNearbyForecastTower({ x: ft0.x + 2.2, y: ft0.y, z: ft0.z }, 4.2)?.id).toBe(ft0.id);
    expect(interactables.findNearbyForecastTower({ x: ft0.x + 14.0, y: ft0.y, z: ft0.z }, 4.2)).toBeNull();
    expect(interactables.findNearbyForecastTower({ x: ft0.x, y: Number.NaN, z: ft0.z })).toBeNull();

    expect(interactables.scanForecastTower('nonexistent_tower', 'player')).toBe(false);
    expect(interactables.scanForecastTower(ft0.id, '')).toBe(false);
    expect(interactables.scanForecastTower(ft0.id, 'player')).toBe(true);
    expect(ft0.scanned).toBe(true);
    expect(ft0.scannedBy).toBe('player');
    const claimedHex = (ft0BeaconOrb.material as THREE.MeshStandardMaterial).color.getHexString();
    expect(claimedHex).not.toBe(unscannedHex);
    expect((ft1BeaconOrb.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(unscannedHex);
    expect(forecastVfxSpy).toHaveBeenCalledWith({
      position: { x: ft0.x, y: ft0.y + 1.5, z: ft0.z },
    });
    expect(soundSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'forecast_scan' }),
    );
    expect(interactables.scanForecastTower(ft0.id, 'bot_1')).toBe(false);

    // 3. 28 Interactive Stealth Bushes
    const bushes = interactables.getStealthBushes();
    expect(bushes).toHaveLength(28);

    for (const bush of bushes) {
      expect(bush.radius).toBe(1.85);
      expect(terrain.isWater(bush.x, bush.z)).toBe(false);
      expect(bush.y).toBeCloseTo(terrain.getHeightAt(bush.x, bush.z), 4);
      expect(
        terrain.getNormalAt(bush.x, bush.z).y,
        `${bush.id} (${bush.x}, ${bush.z})`,
      ).toBeGreaterThan(0.84);
      expect(isClearOfBuildings(bush.x, bush.y, bush.z, 0.8)).toBe(true);
      const blockingProp = pal.getProps().find((p) => Math.hypot(bush.x - p.x, bush.z - p.z) < p.radius + 0.8);
      expect(blockingProp, `${bush.id} (${bush.x}, ${bush.z}) near prop ${blockingProp?.kind} at (${blockingProp?.x}, ${blockingProp?.z})`).toBeUndefined();
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(bush.x - veh.x, bush.z - veh.z)).toBeGreaterThan(3.0);
      }
      for (const mb of modBenches) {
        expect(Math.hypot(bush.x - mb.x, bush.z - mb.z)).toBeGreaterThan(3.0);
      }
      for (const ft of towers) {
        expect(Math.hypot(bush.x - ft.x, bush.z - ft.z)).toBeGreaterThan(3.0);
      }
      const bGroup = interactables.getGroup().getObjectByName(`StealthBush_${bush.id}`) as THREE.Group;
      expect(bGroup).toBeDefined();
      const foliageGroup = bGroup.children[0] as THREE.Group;
      expect(foliageGroup.children.length).toBeGreaterThanOrEqual(10);
    }

    const bush0 = bushes[0];
    const bush0Group = interactables.getGroup().getObjectByName(`StealthBush_${bush0.id}`) as THREE.Group;
    const bush0Foliage = bush0Group.children[0] as THREE.Group;
    expect(interactables.isInsideStealthBush({ x: bush0.x + 5.0, y: bush0.y, z: bush0.z })).toBeNull();
    expect(interactables.isInsideStealthBush({ x: bush0.x, y: bush0.y + 12.0, z: bush0.z })).toBeNull();
    expect(interactables.isInsideStealthBush({ x: Number.NaN, y: bush0.y, z: bush0.z })).toBeNull();

    const inside = interactables.isInsideStealthBush({ x: bush0.x + 0.8, y: bush0.y, z: bush0.z - 0.6 });
    expect(inside?.id).toBe(bush0.id);

    interactables.update(0.08, 1.5);
    expect(Math.abs(bush0Foliage.rotation.z) + Math.abs(bush0Foliage.rotation.x)).toBeGreaterThan(0.005);

    interactables.update(1.0, 2.5);
    expect(bush0Foliage.rotation.z).toBe(0);
    expect(bush0Foliage.rotation.x).toBe(0);
    expect(bush0Foliage.scale.x).toBe(1);

    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    // 4. reset() restores Forecast Towers & Stealth Bushes
    interactables.reset();
    expect(interactables.getForecastTowers().every((t) => !t.scanned && t.scannedBy === null)).toBe(true);
    expect((ft0BeaconOrb.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(unscannedHex);
    expect(interactables.scanForecastTower(ft0.id, 'player2')).toBe(true);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    vehicles.dispose();
    interactables.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('supports qaPlaceWave8Showcase and clears Wave-8 QA showcase extras on reset()', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    const center = { x: -75, y: terrain.getHeightAt(-75, -40), z: -40 };
    const showcase: Wave8ShowcaseResult = interactables.qaPlaceWave8Showcase(center);

    expect(showcase.modBench.costGold).toBe(WEAPON_MOD_COST_GOLD);
    expect(terrain.isWater(showcase.modBench.x, showcase.modBench.z)).toBe(false);
    expect(showcase.modBench.y).toBeCloseTo(terrain.getHeightAt(showcase.modBench.x, showcase.modBench.z), 4);
    expect(Math.hypot(showcase.modBench.x - center.x, showcase.modBench.z - center.z)).toBeLessThan(15);

    expect(showcase.forecastTower.scanned).toBe(false);
    expect(showcase.forecastTower.scannedBy).toBeNull();
    expect(terrain.isWater(showcase.forecastTower.x, showcase.forecastTower.z)).toBe(false);
    expect(showcase.forecastTower.y).toBeCloseTo(
      terrain.getHeightAt(showcase.forecastTower.x, showcase.forecastTower.z),
      4,
    );

    expect(showcase.stealthBushes).toHaveLength(2);
    for (const sb of showcase.stealthBushes) {
      expect(sb.radius).toBe(1.85);
      expect(terrain.isWater(sb.x, sb.z)).toBe(false);
      expect(sb.y).toBeCloseTo(terrain.getHeightAt(sb.x, sb.z), 4);
      expect(interactables.isInsideStealthBush({ x: sb.x, y: sb.y, z: sb.z })?.id).toBe(sb.id);
    }

    expect(interactables.getModBenches()).toHaveLength(7);
    expect(interactables.getModBenchColliders()).toHaveLength(7);
    expect(interactables.getForecastTowers()).toHaveLength(5);
    expect(interactables.getForecastTowerColliders()).toHaveLength(5);
    expect(interactables.getStealthBushes()).toHaveLength(30);

    // Calling qaPlaceWave8Showcase again replaces cleanly without leaking duplicates
    interactables.qaPlaceWave8Showcase(center);
    expect(interactables.getModBenches()).toHaveLength(7);
    expect(interactables.getForecastTowers()).toHaveLength(5);
    expect(interactables.getStealthBushes()).toHaveLength(30);

    interactables.reset();
    expect(interactables.getModBenches()).toHaveLength(6);
    expect(interactables.getModBenchColliders()).toHaveLength(6);
    expect(interactables.getForecastTowers()).toHaveLength(4);
    expect(interactables.getForecastTowerColliders()).toHaveLength(4);
    expect(interactables.getStealthBushes()).toHaveLength(28);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    interactables.dispose();
    terrain.dispose();
  });
});

describe('Wave-8 StormSystem Forecast Rings & Team Rumble, Loot Pools & Sky Shader', () => {
  it('precomputes deterministic getFutureStormRings() and supports team_rumble fast arena with min radius >= 75', () => {
    const s1 = new StormSystem(4201, 'solo');
    const s2 = new StormSystem(4201, 'solo');

    const rings1 = s1.getFutureStormRings();
    const rings2 = s2.getFutureStormRings(2);
    expect(rings1).toHaveLength(2);
    expect(rings1).toEqual(rings2);
    expect(rings1[0].phase).toBe(2);
    expect(rings1[0].radius).toBe(STORM_PHASES[1].targetRadius);
    expect(rings1[1].phase).toBe(3);
    expect(rings1[1].radius).toBe(STORM_PHASES[2].targetRadius);

    // Containment invariant across all precomputed future rings
    const allFuture = s1.getFutureStormRings(5);
    expect(allFuture).toHaveLength(5);
    const initState = s1.getState();
    let prevCx = initState.nextCenterX;
    let prevCz = initState.nextCenterZ;
    let prevR = initState.nextRadius;
    for (const ring of allFuture) {
      expect(Math.hypot(ring.centerX - prevCx, ring.centerZ - prevCz) + ring.radius).toBeLessThanOrEqual(prevR + 1e-4);
      prevCx = ring.centerX;
      prevCz = ring.centerZ;
      prevR = ring.radius;
    }

    // Mutating returned objects must not corrupt internal storm state
    rings1[0].centerX = 9999;
    expect(s1.getFutureStormRings(1)[0].centerX).toBe(rings2[0].centerX);
    expect(s1.getFutureStormRings(0)).toEqual([]);

    // Advance into Phase 2 -> nextCenter matches precomputed Phase 2 ring, and future rings shift to 3 & 4
    s1.update(STORM_PHASES[0].waitDuration + STORM_PHASES[0].shrinkDuration);
    const stPhase2 = s1.getState();
    expect(stPhase2.phase).toBe(2);
    expect(stPhase2.nextCenterX).toBeCloseTo(rings2[0].centerX, 5);
    expect(stPhase2.nextCenterZ).toBeCloseTo(rings2[0].centerZ, 5);
    expect(stPhase2.nextRadius).toBe(rings2[0].radius);
    const nextTwo = s1.getFutureStormRings(2);
    expect(nextTwo.map((r) => r.phase)).toEqual([3, 4]);

    // Team Rumble fast arena mode keeps final radius >= 75
    const rumble = new StormSystem(4201, 'team_rumble');
    expect(rumble.getMode()).toBe('team_rumble');
    const rumbleInit = rumble.getState();
    expect(rumbleInit.phase).toBe(1);
    expect(rumbleInit.currentRadius).toBeLessThan(WORLD_HALF);
    expect(rumbleInit.phaseDuration).toBeLessThan(STORM_PHASES[0].waitDuration);

    const rumbleConfigs = rumble.getPhaseConfigs();
    expect(rumbleConfigs.length).toBeGreaterThanOrEqual(4);
    for (const cfg of rumbleConfigs) {
      expect(cfg.targetRadius).toBeGreaterThanOrEqual(75);
    }

    const rumbleFuture = rumble.getFutureStormRings(10);
    expect(rumbleFuture.every((r) => r.radius >= 75)).toBe(true);

    for (const cfg of rumbleConfigs) {
      rumble.update(cfg.waitDuration + cfg.shrinkDuration);
    }
    const rumbleEnd = rumble.getState();
    expect(rumbleEnd.currentRadius).toBeGreaterThanOrEqual(75);
    expect(rumble.isInStorm(rumbleEnd.currentCenterX, rumbleEnd.currentCenterZ)).toBe(false);
    expect(rumble.getFutureStormRings()).toEqual([]);

    s1.dispose();
    s2.dispose();
    rumble.dispose();
  });

  it('spawns port_a_bunker and emp_grenade across floor, chest, and supply-drop pools with crisp 3D pickup meshes', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    // 1. Verify floor loot already contains port_a_bunker & emp_grenade
    const floorItemIds = new Set(
      pal
        .getLootDrops()
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(floorItemIds.has('port_a_bunker')).toBe(true);
    expect(floorItemIds.has('emp_grenade')).toBe(true);

    // 2. Verify rollConsumable & chest drops
    const consumableIds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = pal.rollConsumable();
      expect(WEAPONS[c.weaponId].allowedRarities).toContain(c.rarity);
      expect(c.magAmmo).toBe(0);
      consumableIds.add(c.weaponId);
    }
    expect(consumableIds.has('port_a_bunker')).toBe(true);
    expect(consumableIds.has('emp_grenade')).toBe(true);

    const dropsBeforeChests = pal.getLootDrops().length;
    for (const chest of pal.getChests()) {
      pal.openChest(chest.id);
    }
    const chestItemIds = new Set(
      pal
        .getLootDrops()
        .slice(dropsBeforeChests)
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(chestItemIds.has('port_a_bunker')).toBe(true);
    expect(chestItemIds.has('emp_grenade')).toBe(true);

    // 3. Verify supply drops spawn port_a_bunker & emp_grenade
    const dropsBeforeSupply = pal.getLootDrops().length;
    for (let i = 0; i < 65; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    const supplyItemIds = new Set(
      pal
        .getLootDrops()
        .slice(dropsBeforeSupply)
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(supplyItemIds.has('port_a_bunker')).toBe(true);
    expect(supplyItemIds.has('emp_grenade')).toBe(true);

    // 4. Verify crisp multi-part 3D pickup meshes for port_a_bunker & emp_grenade
    const groupBefore = pal.getGroup().children.length;
    pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { item: { uid: 'bunker_mesh_test', weaponId: 'port_a_bunker', rarity: 'epic', magAmmo: 0, stackCount: 1 } },
    );
    const bunkerDropGroup = pal.getGroup().children[groupBefore] as THREE.Group;
    const bunkerSilhouette = bunkerDropGroup.children[1] as THREE.Group;
    expect(bunkerSilhouette).toBeInstanceOf(THREE.Group);
    expect(bunkerSilhouette.children.length).toBeGreaterThanOrEqual(4);

    pal.spawnLootDrop(
      { x: 4, y: 12, z: 0 },
      { item: { uid: 'emp_mesh_test', weaponId: 'emp_grenade', rarity: 'rare', magAmmo: 0, stackCount: 2 } },
    );
    const empDropGroup = pal.getGroup().children[groupBefore + 1] as THREE.Group;
    const empSilhouette = empDropGroup.children[1] as THREE.Group;
    expect(empSilhouette).toBeInstanceOf(THREE.Group);
    expect(empSilhouette.children.length).toBeGreaterThanOrEqual(4);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('enhances skyMat with Twilight Starfield / Aurora Borealis shimmer and passes GLSL uniform checks across skyMat/oceanMat/rainSplashMat', () => {
    const bus = new EventBus();
    const fx = new EnvironmentFX(4201, bus);
    const group = fx.getGroup();

    const skyMesh = group.getObjectByName('SkyDome') as THREE.Mesh;
    const oceanMesh = group.getObjectByName('OceanWater') as THREE.Mesh;
    const splashMesh = group.getObjectByName('RainSplashRipples') as THREE.Mesh;

    const skyMat = skyMesh.material as THREE.ShaderMaterial;
    const oceanMat = oceanMesh.material as THREE.ShaderMaterial;
    const splashMat = splashMesh.material as THREE.ShaderMaterial;

    expect(skyMat.fragmentShader).toContain('uniform float uTime;');
    expect(skyMat.fragmentShader).toContain('aurora');
    expect(skyMat.fragmentShader).toContain('starPoint');

    for (const mat of [skyMat, oceanMat, splashMat]) {
      for (const glsl of [mat.vertexShader, mat.fragmentShader]) {
        const smoothMatches = [
          ...glsl.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g),
        ];
        for (const m of smoothMatches) {
          expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
        const usedUniforms = new Set(glsl.match(/\bu[A-Z][A-Za-z0-9_]*/g) ?? []);
        for (const uName of usedUniforms) {
          expect(glsl).toMatch(
            new RegExp(`uniform\\s+(?:float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D)\\s+${uName}\\b`),
          );
          expect(mat.uniforms[uName]).toBeDefined();
        }
      }
    }

    fx.setWeather('golden_hour');
    for (let i = 0; i < 15; i++) fx.update(0.1, 2.0 + i * 0.1);
    expect(skyMat.uniforms.uTime.value).toBeGreaterThan(2.0);
    expect(skyMat.uniforms.uDayPhase.value).toBeGreaterThan(0.5);

    fx.setWeather('storm_front');
    for (let i = 0; i < 15; i++) fx.update(0.1, 5.0 + i * 0.1);
    expect(skyMat.uniforms.uDayPhase.value).toBeGreaterThan(0.6);
    expect(skyMat.uniforms.uOvercast.value).toBeGreaterThan(0.7);

    fx.dispose();
  });
});

describe('WorldInteractables Wave-9 Apex Express Train, Meteor Craters & Showcase', () => {
  it('runs Apex Express Moving Loot Train on closed-loop rails with flatbed riding, 3.0s hack, cooldown & periodic horn', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    const soundSpy = vi.fn();
    bus.on('sound:play', soundSpy);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 1.2) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 3.0 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    // 1. Track geometry & closed-loop clearance
    const trackPoints = interactables.getTrainTrackPoints();
    expect(trackPoints.length).toBeGreaterThanOrEqual(40);
    for (const pt of trackPoints) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
      expect(Number.isFinite(pt.z)).toBe(true);
      expect(pt.y).toBeGreaterThan(WATER_LEVEL + 1.0);
      expect(pt.y).toBeGreaterThanOrEqual(terrain.getHeightAt(pt.x, pt.z) + 0.1);
      expect(isClearOfBuildings(pt.x, pt.y, pt.z, 1.5), `Track point (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}, ${pt.z.toFixed(1)}) hits building`).toBe(true);
    }

    const trainGroup = interactables.getGroup().getObjectByName('ApexExpressTrain') as THREE.Group;
    const locoGroup = interactables.getGroup().getObjectByName('ApexTrainLocomotive') as THREE.Group;
    const car1Group = interactables.getGroup().getObjectByName('ApexTrainCargoCar1') as THREE.Group;
    const car2Group = interactables.getGroup().getObjectByName('ApexTrainCargoCar2') as THREE.Group;
    const chestGroup = interactables.getGroup().getObjectByName('ApexTrainHackChest') as THREE.Group;
    expect(trainGroup).toBeDefined();
    expect(locoGroup).toBeDefined();
    expect(car1Group).toBeDefined();
    expect(car2Group).toBeDefined();
    expect(chestGroup).toBeDefined();

    // 2. Train initial state & continuous closed-loop motion + periodic train_horn
    const s0 = interactables.getTrainState();
    expect(s0.active).toBe(true);
    expect(s0.speed).toBe(TRAIN_SPEED_MPS);
    expect(s0.carPositions).toHaveLength(2);
    expect(s0.chestHacked).toBe(false);
    expect(s0.chestHackProgress).toBe(0);
    expect(s0.chestCooldownSec).toBe(0);
    expect(s0.trackPoints.length).toBe(trackPoints.length);

    // Mutating returned snapshot must not corrupt internal state
    s0.carPositions[0].x = 99999;
    expect(interactables.getTrainState().carPositions[0].x).not.toBe(99999);

    for (let i = 0; i < 20; i++) {
      interactables.update(0.5, (i + 1) * 0.5);
    }
    const s1 = interactables.getTrainState();
    expect(s1.t).not.toBeCloseTo(0, 3);
    expect(Math.hypot(s1.x - locoGroup.position.x, s1.z - locoGroup.position.z)).toBeLessThan(1e-4);
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'train_horn' }));

    // 3. Flatbed getTrainPlatformSupport riding detection on Cargo Car 1 & Cargo Car 2
    const beforeRide = interactables.getTrainState();
    const car1Before = beforeRide.carPositions[0];
    const car2Before = beforeRide.carPositions[1];
    const rider1 = { x: car1Before.x, y: car1Before.y + 1.05, z: car1Before.z };
    const rider2 = { x: car2Before.x, y: car2Before.y + 1.05, z: car2Before.z };

    interactables.update(0.1, 10.1);
    const afterRide = interactables.getTrainState();
    const sup1 = interactables.getTrainPlatformSupport(rider1);
    const sup2 = interactables.getTrainPlatformSupport(rider2);
    expect(sup1).not.toBeNull();
    expect(sup2).not.toBeNull();
    expect(sup1!.deltaX).toBeCloseTo(afterRide.carPositions[0].x - car1Before.x, 4);
    expect(sup1!.deltaZ).toBeCloseTo(afterRide.carPositions[0].z - car1Before.z, 4);
    expect(sup1!.deckY).toBeCloseTo(afterRide.carPositions[0].y + 1.05, 4);

    // Applying delta keeps rider centered on Cargo Car 1
    rider1.x += sup1!.deltaX;
    rider1.z += sup1!.deltaZ;
    rider1.y = sup1!.deckY;
    expect(Math.hypot(rider1.x - afterRide.carPositions[0].x, rider1.z - afterRide.carPositions[0].z)).toBeLessThan(0.05);

    // Off-train, ground-level under train, high airborne, and NaN checks return null
    expect(interactables.getTrainPlatformSupport({ x: afterRide.x, y: afterRide.y + 1.05, z: afterRide.z })).toBeNull();
    expect(interactables.getTrainPlatformSupport({ x: afterRide.carPositions[0].x, y: afterRide.carPositions[0].y, z: afterRide.carPositions[0].z })).toBeNull();
    expect(interactables.getTrainPlatformSupport({ x: afterRide.carPositions[0].x, y: afterRide.carPositions[0].y + 5.0, z: afterRide.carPositions[0].z })).toBeNull();
    expect(interactables.getTrainPlatformSupport({ x: Number.NaN, y: 12, z: 0 })).toBeNull();

    // 4. Train Chest proximity + 3.0s hack + 75s cooldown reset
    expect(interactables.isNearTrainChest(rider1)).toBe(true);
    expect(interactables.isNearTrainChest({ x: rider1.x + 25, y: rider1.y, z: rider1.z })).toBe(false);
    expect(interactables.isNearTrainChest({ x: rider1.x, y: Number.NaN, z: rider1.z })).toBe(false);

    expect(interactables.advanceTrainChestHack(0, 'player')).toBeNull();
    expect(interactables.advanceTrainChestHack(1.0, '')).toBeNull();

    const hackHalf = interactables.advanceTrainChestHack(TRAIN_HACK_DURATION_SEC * 0.5, 'player');
    expect(hackHalf).not.toBeNull();
    expect(hackHalf!.completed).toBe(false);
    expect(hackHalf!.progress).toBeCloseTo(0.5, 4);
    expect(interactables.getTrainState().chestHacked).toBe(false);

    const hackComplete = interactables.advanceTrainChestHack(TRAIN_HACK_DURATION_SEC * 0.5, 'player');
    expect(hackComplete).not.toBeNull();
    expect(hackComplete!.completed).toBe(true);
    expect(hackComplete!.progress).toBe(1);
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'train_hack_complete' }));

    const hackedState = interactables.getTrainState();
    expect(hackedState.chestHacked).toBe(true);
    expect(hackedState.chestCooldownSec).toBe(TRAIN_CHEST_COOLDOWN_SEC);
    expect(interactables.isNearTrainChest(rider1)).toBe(false);
    expect(interactables.advanceTrainChestHack(0.5, 'player')).toBeNull();

    // Tick cooldown to completion
    interactables.update(TRAIN_CHEST_COOLDOWN_SEC + 0.5, 90);
    const cooledState = interactables.getTrainState();
    expect(cooledState.chestHacked).toBe(false);
    expect(cooledState.chestCooldownSec).toBe(0);
    expect(cooledState.chestHackProgress).toBe(0);

    // 5. reset() & dispose()
    interactables.reset();
    const resetState = interactables.getTrainState();
    expect(resetState.active).toBe(true);
    expect(resetState.t).toBe(0);
    expect(resetState.chestHacked).toBe(false);
    expect(resetState.chestCooldownSec).toBe(0);

    interactables.dispose();
    expect(interactables.getTrainState().active).toBe(false);
    expect(interactables.getTrainTrackPoints()).toHaveLength(0);
    builder.dispose();
    terrain.dispose();
  });

  it('constructs 6 Zero-Point Meteor Impact Craters clear of water/buildings/props with Hop Crystal consume, respawn & meteor strike', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const auraSpy = vi.fn();
    const meteorVfxSpy = vi.fn();
    const soundSpy = vi.fn();
    bus.on('vfx:hop_crystal_aura', auraSpy);
    bus.on('vfx:meteor_strike', meteorVfxSpy);
    bus.on('sound:play', soundSpy);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 2.0) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 2.8 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    const craters = interactables.getMeteorCraters();
    expect(craters).toHaveLength(6);

    for (const c of craters) {
      expect(c.crystalAvailable).toBe(true);
      expect(c.crystalRespawnSec).toBe(0);
      expect(c.radius).toBeGreaterThan(3);
      expect(terrain.isWater(c.x, c.z)).toBe(false);
      expect(c.y).toBeCloseTo(terrain.getHeightAt(c.x, c.z), 4);
      expect(terrain.getNormalAt(c.x, c.z).y, `${c.id} (${c.x}, ${c.z})`).toBeGreaterThan(0.86);
      expect(isClearOfBuildings(c.x, c.y, c.z, 2.0), `${c.id} overlaps building`).toBe(true);

      const blockingProp = pal.getProps().find((p) => Math.hypot(c.x - p.x, c.z - p.z) < p.radius + 1.5);
      expect(blockingProp, `${c.id} (${c.x}, ${c.z}) near prop ${blockingProp?.kind} at (${blockingProp?.x.toFixed(1)}, ${blockingProp?.z.toFixed(1)})`).toBeUndefined();

      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(c.x - veh.x, c.z - veh.z)).toBeGreaterThan(4.0);
      }
      for (const mb of interactables.getModBenches()) {
        expect(Math.hypot(c.x - mb.x, c.z - mb.z)).toBeGreaterThan(4.0);
      }
      for (const ft of interactables.getForecastTowers()) {
        expect(Math.hypot(c.x - ft.x, c.z - ft.z)).toBeGreaterThan(4.0);
      }
      for (const wb of interactables.getWeaponBunkers()) {
        expect(Math.hypot(c.x - wb.x, c.z - wb.z)).toBeGreaterThan(4.0);
      }

      const craterGroup = interactables.getGroup().getObjectByName(`MeteorCrater_${c.id}`) as THREE.Group;
      const clusterGroup = interactables.getGroup().getObjectByName(`HopCrystalCluster_${c.id}`) as THREE.Group;
      expect(craterGroup).toBeDefined();
      expect(clusterGroup).toBeDefined();
      expect(clusterGroup.visible).toBe(true);
    }

    // Consume Hop Crystal + respawn timer
    const c0 = craters[0];
    const cluster0 = interactables.getGroup().getObjectByName(`HopCrystalCluster_${c0.id}`) as THREE.Group;
    expect(interactables.findNearbyHopCrystal({ x: c0.x + 2.0, y: c0.y, z: c0.z })?.id).toBe(c0.id);
    expect(interactables.findNearbyHopCrystal({ x: c0.x + 15.0, y: c0.y, z: c0.z })).toBeNull();
    expect(interactables.findNearbyHopCrystal({ x: Number.NaN, y: c0.y, z: c0.z })).toBeNull();

    const consumed = interactables.consumeHopCrystal(c0.id);
    expect(consumed).not.toBeNull();
    expect(consumed!.ok).toBe(true);
    expect(c0.crystalAvailable).toBe(false);
    expect(c0.crystalRespawnSec).toBe(METEOR_CRATER_CRYSTAL_RESPAWN_SEC);
    expect(cluster0.visible).toBe(false);
    expect(auraSpy).toHaveBeenCalledTimes(1);
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'hop_crystal_consume' }));
    expect(interactables.consumeHopCrystal(c0.id)).toBeNull();
    expect(interactables.findNearbyHopCrystal({ x: c0.x, y: c0.y, z: c0.z })).toBeNull();

    // Tick halfway then full respawn
    interactables.update(20, 20);
    expect(c0.crystalAvailable).toBe(false);
    expect(c0.crystalRespawnSec).toBeCloseTo(METEOR_CRATER_CRYSTAL_RESPAWN_SEC - 20, 4);

    interactables.update(30, 50);
    expect(c0.crystalAvailable).toBe(true);
    expect(c0.crystalRespawnSec).toBe(0);
    expect(cluster0.visible).toBe(true);

    // Meteor shower strike event
    interactables.triggerMeteorShowerStrike({ x: 10, y: 12, z: -20 });
    expect(meteorVfxSpy).toHaveBeenCalledWith({
      position: { x: 10, y: 12, z: -20 },
      radius: 7.5,
    });
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'meteor_impact' }));
    interactables.triggerMeteorShowerStrike({ x: Number.NaN, y: 12, z: -20 });
    expect(meteorVfxSpy).toHaveBeenCalledTimes(1);

    // reset() restores consumed crystals immediately
    interactables.consumeHopCrystal(c0.id);
    expect(c0.crystalAvailable).toBe(false);
    interactables.reset();
    expect(c0.crystalAvailable).toBe(true);
    expect(c0.crystalRespawnSec).toBe(0);
    expect(cluster0.visible).toBe(true);

    vehicles.dispose();
    interactables.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('supports qaPlaceWave9Showcase(centerPos, yaw) and clears showcase extras cleanly on reset()', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    const center = { x: -75, y: terrain.getHeightAt(-75, -12), z: -12 };
    const yaw = 0.35;
    const showcase: Wave9ShowcaseResult = interactables.qaPlaceWave9Showcase(center, yaw);

    expect(showcase.crater.id).toBe('crater_qa_showcase');
    expect(showcase.crater.crystalAvailable).toBe(true);
    expect(terrain.isWater(showcase.crater.x, showcase.crater.z)).toBe(false);
    expect(Math.hypot(showcase.crater.x - center.x, showcase.crater.z - center.z)).toBeLessThan(12);
    expect(interactables.getMeteorCraters()).toHaveLength(7);

    expect(showcase.train.active).toBe(true);
    expect(showcase.train.carPositions).toHaveLength(2);
    expect(showcase.train.chestHacked).toBe(false);
    const car1 = showcase.train.carPositions[0];
    expect(Math.hypot(car1.x - center.x, car1.z - center.z)).toBeLessThan(16);

    // Train Chest & flatbed support work on showcase train
    const chestSpot = { x: car1.x, y: car1.y + 1.05, z: car1.z };
    expect(interactables.getTrainPlatformSupport(chestSpot)).not.toBeNull();
    expect(interactables.isNearTrainChest(chestSpot)).toBe(true);

    // Calling qaPlaceWave9Showcase again replaces showcase crater cleanly without leaking
    interactables.qaPlaceWave9Showcase(center, yaw);
    expect(interactables.getMeteorCraters()).toHaveLength(7);

    // reset() restores base 6 craters and base island mid-ring track
    interactables.reset();
    expect(interactables.getMeteorCraters()).toHaveLength(6);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    interactables.dispose();
    terrain.dispose();
  });
});

describe('Wave-9 Loot Pools, 3D Pickup Meshes & Full GLSL Shader Uniform Validation', () => {
  it('spawns jetpack and plasma_flamethrower across floor, chest, and supply-drop pools with crisp multi-part 3D pickup meshes', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 360; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('jetpack')).toBe(true);
    expect(floorIds.has('plasma_flamethrower')).toBe(true);
    expect(chestIds.has('jetpack')).toBe(true);
    expect(chestIds.has('plasma_flamethrower')).toBe(true);

    const dropsBeforeSupply = pal.getLootDrops().length;
    for (let i = 0; i < 85; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    const supplyIds = new Set(
      pal
        .getLootDrops()
        .slice(dropsBeforeSupply)
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(supplyIds.has('jetpack')).toBe(true);
    expect(supplyIds.has('plasma_flamethrower')).toBe(true);

    // Verify bespoke multi-part 3D pickup meshes for jetpack & plasma_flamethrower
    const groupBefore = pal.getGroup().children.length;
    pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { item: { uid: 'jetpack_mesh_test', weaponId: 'jetpack', rarity: 'legendary', magAmmo: 0, stackCount: 1 } },
    );
    const jetpackDropGroup = pal.getGroup().children[groupBefore] as THREE.Group;
    const jetpackSilhouette = jetpackDropGroup.children[1] as THREE.Group;
    expect(jetpackSilhouette).toBeInstanceOf(THREE.Group);
    expect(jetpackSilhouette.children.length).toBeGreaterThanOrEqual(5);

    pal.spawnLootDrop(
      { x: 4, y: 12, z: 0 },
      { item: { uid: 'flame_mesh_test', weaponId: 'plasma_flamethrower', rarity: 'epic', magAmmo: 60, stackCount: 1 } },
    );
    const flameDropGroup = pal.getGroup().children[groupBefore + 1] as THREE.Group;
    const flameSilhouette = flameDropGroup.children[1] as THREE.Group;
    expect(flameSilhouette).toBeInstanceOf(THREE.Group);
    expect(flameSilhouette.children.length).toBeGreaterThanOrEqual(5);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('validates all GLSL ShaderMaterial uniforms and smoothstep bounds across EnvironmentFX, StormSystem & WorldBuilder', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const fx = new EnvironmentFX(4201, bus);
    const storm = new StormSystem(4201, 'solo');

    const shaderMats: THREE.ShaderMaterial[] = [];
    for (const root of [fx.getGroup(), world.group, storm.getMesh()]) {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
          shaderMats.push(obj.material);
        }
      });
    }
    expect(shaderMats.length).toBeGreaterThanOrEqual(6);

    for (const mat of shaderMats) {
      for (const glsl of [mat.vertexShader, mat.fragmentShader]) {
        const smoothMatches = [
          ...glsl.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g),
        ];
        for (const m of smoothMatches) {
          expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
        const usedUniforms = new Set(glsl.match(/\bu[A-Z][A-Za-z0-9_]*/g) ?? []);
        for (const uName of usedUniforms) {
          expect(glsl).toMatch(
            new RegExp(`uniform\\s+(?:float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D)\\s+${uName}\\b`),
          );
          expect(mat.uniforms[uName]).toBeDefined();
        }
      }
    }

    storm.dispose();
    fx.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('WorldInteractables Wave-10 Shield Mushrooms, Wild Loot Boars & Showcase', () => {
  it('constructs 24 Glowing Shield Mushrooms and 8 Roaming Wild Loot Boars clear of water/buildings/props with full lifecycle and reset()', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const soundSpy = vi.fn();
    const healVfxSpy = vi.fn();
    bus.on('sound:play', soundSpy);
    bus.on('vfx:splash_heal', healVfxSpy);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 1.0) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 2.8 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    // 1. 24 Glowing Blue Shield Slurp Mushrooms
    const mushrooms = interactables.getShieldMushrooms();
    expect(mushrooms).toHaveLength(24);
    expect(new Set(mushrooms.map((m) => m.poiId))).toEqual(
      new Set(['whispering_pines', 'crystal_basin', 'sunny_suburbs']),
    );
    expect(mushrooms.filter((m) => m.poiId === 'whispering_pines')).toHaveLength(8);
    expect(mushrooms.filter((m) => m.poiId === 'crystal_basin')).toHaveLength(8);
    expect(mushrooms.filter((m) => m.poiId === 'sunny_suburbs')).toHaveLength(8);

    for (const m of mushrooms) {
      expect(m.available).toBe(true);
      expect(m.respawnSec).toBe(0);
      expect(terrain.isWater(m.x, m.z)).toBe(false);
      expect(m.y).toBeCloseTo(terrain.getHeightAt(m.x, m.z), 4);
      expect(terrain.getNormalAt(m.x, m.z).y, `${m.id} (${m.x}, ${m.z})`).toBeGreaterThan(0.85);
      expect(isClearOfBuildings(m.x, m.y, m.z, 0.8), `${m.id} hits building`).toBe(true);
      const blockingProp = pal.getProps().find((p) => Math.hypot(m.x - p.x, m.z - p.z) < p.radius + 0.6);
      expect(blockingProp, `${m.id} near prop ${blockingProp?.kind}`).toBeUndefined();
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(m.x - veh.x, m.z - veh.z)).toBeGreaterThan(3.0);
      }
      for (const other of mushrooms) {
        if (other.id !== m.id) {
          expect(Math.hypot(m.x - other.x, m.z - other.z)).toBeGreaterThan(1.2);
        }
      }
      const mGroup = interactables.getGroup().getObjectByName(`ShieldMushroom_${m.id}`) as THREE.Group;
      expect(mGroup).toBeDefined();
      expect(mGroup.children.length).toBeGreaterThanOrEqual(2);
    }

    const m0 = mushrooms[0];
    const m0Group = interactables.getGroup().getObjectByName(`ShieldMushroom_${m0.id}`) as THREE.Group;
    const m0CapGroup = m0Group.children[1] as THREE.Group;
    expect(m0CapGroup.visible).toBe(true);

    expect(interactables.findNearbyShieldMushroom({ x: m0.x - 1.2, y: m0.y, z: m0.z })?.id).toBe(m0.id);
    expect(interactables.findNearbyShieldMushroom({ x: m0.x + 10, y: m0.y, z: m0.z })).toBeNull();
    expect(interactables.findNearbyShieldMushroom({ x: Number.NaN, y: m0.y, z: m0.z })).toBeNull();

    expect(interactables.consumeShieldMushroom('nonexistent_mush')).toBe(false);
    expect(interactables.consumeShieldMushroom(m0.id)).toBe(true);
    expect(m0.available).toBe(false);
    expect(m0.respawnSec).toBe(SHIELD_MUSHROOM_RESPAWN_SEC);
    expect(m0CapGroup.visible).toBe(false);
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'mushroom_eat' }));
    expect(healVfxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        position: expect.objectContaining({ x: m0.x, z: m0.z }),
      }),
    );
    expect(interactables.consumeShieldMushroom(m0.id)).toBe(false);
    expect(interactables.findNearbyShieldMushroom({ x: m0.x, y: m0.y, z: m0.z }, 1.0)).toBeNull();
    expect(interactables.findNearbyShieldMushroom({ x: m0.x, y: m0.y, z: m0.z })?.id).not.toBe(m0.id);

    // Tick half respawn then full respawn
    interactables.update(25, 25);
    expect(m0.available).toBe(false);
    expect(m0.respawnSec).toBeCloseTo(SHIELD_MUSHROOM_RESPAWN_SEC - 25, 4);

    interactables.update(40, 65);
    expect(m0.available).toBe(true);
    expect(m0.respawnSec).toBe(0);
    expect(m0CapGroup.visible).toBe(true);

    // 2. 8 Roaming Stylized 3D Wild Loot Boars
    const boars = interactables.getWildBoars();
    expect(boars).toHaveLength(8);

    for (const b of boars) {
      expect(b.hp).toBe(WILD_BOAR_MAX_HP);
      expect(b.maxHp).toBe(WILD_BOAR_MAX_HP);
      expect(b.alive).toBe(true);
      expect(b.state).toBe('roam');
      expect(b.speed).toBeGreaterThan(1);
      expect(terrain.isWater(b.x, b.z)).toBe(false);
      expect(['grassland', 'forest']).toContain(terrain.getBiomeAt(b.x, b.z));
      expect(b.y).toBeCloseTo(terrain.getHeightAt(b.x, b.z), 4);
      expect(isClearOfBuildings(b.x, b.y, b.z, 1.5), `${b.id} hits building`).toBe(true);
      const blockingProp = pal.getProps().find((p) => Math.hypot(b.x - p.x, b.z - p.z) < p.radius + 1.5);
      expect(blockingProp, `${b.id} near prop ${blockingProp?.kind}`).toBeUndefined();

      const bGroup = interactables.getGroup().getObjectByName(`WildBoar_${b.id}`) as THREE.Group;
      expect(bGroup).toBeDefined();
      expect(bGroup.visible).toBe(true);
      const bodyGroup = bGroup.children[0] as THREE.Group;
      const legPivots = bodyGroup.children.filter((c) => c instanceof THREE.Group);
      expect(legPivots).toHaveLength(4);
    }

    const b0 = boars[0];
    const b0StartX = b0.x;
    const b0StartZ = b0.z;
    const b0Group = interactables.getGroup().getObjectByName(`WildBoar_${b0.id}`) as THREE.Group;
    const b0Body = b0Group.children[0] as THREE.Group;
    const b0Legs = b0Body.children.filter((c) => c instanceof THREE.Group) as THREE.Group[];

    // Roam & articulated 4-leg trot animation
    interactables.update(0.35, 65.35);
    expect(Math.hypot(b0.x - b0StartX, b0.z - b0StartZ)).toBeGreaterThan(0.2);
    expect(terrain.isWater(b0.x, b0.z)).toBe(false);
    expect(b0Legs.some((leg) => Math.abs(leg.rotation.x) > 0.01)).toBe(true);

    // First hit -> flees & emits 'boar_grunt'
    soundSpy.mockClear();
    expect(interactables.damageWildBoar('nonexistent_boar', 30, 'player')).toBeNull();
    expect(interactables.damageWildBoar(b0.id, 0, 'player')).toBeNull();
    const firstHit = interactables.damageWildBoar(b0.id, 45, 'player');
    expect(firstHit).toEqual({
      hit: true,
      eliminated: false,
      x: b0.x,
      y: b0.y,
      z: b0.z,
    });
    expect(b0.hp).toBe(WILD_BOAR_MAX_HP - 45);
    expect(b0.alive).toBe(true);
    expect(b0.state).toBe('flee');
    expect(b0.speed).toBeGreaterThan(5);
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'boar_grunt' }));

    const fleePosBefore = { x: b0.x, z: b0.z };
    interactables.update(0.4, 65.75);
    expect(Math.hypot(b0.x - fleePosBefore.x, b0.z - fleePosBefore.z)).toBeGreaterThan(1.5);
    expect(terrain.isWater(b0.x, b0.z)).toBe(false);

    // Lethal hit -> eliminated & marked alive = false
    const elimHit = interactables.damageWildBoar(b0.id, 90, 'player');
    expect(elimHit).toEqual({
      hit: true,
      eliminated: true,
      x: b0.x,
      y: b0.y,
      z: b0.z,
    });
    expect(b0.hp).toBe(0);
    expect(b0.alive).toBe(false);
    expect(b0Group.visible).toBe(false);
    expect(interactables.damageWildBoar(b0.id, 20, 'player')).toBeNull();

    // 3. reset() restores all 24 mushrooms & 8 boars cleanly (and keeps base colliders unchanged)
    interactables.consumeShieldMushroom(m0.id);
    interactables.reset();
    expect(interactables.getShieldMushrooms()).toHaveLength(24);
    expect(interactables.getShieldMushrooms().every((m) => m.available && m.respawnSec === 0)).toBe(true);
    expect(m0CapGroup.visible).toBe(true);
    expect(interactables.getWildBoars()).toHaveLength(8);
    expect(
      interactables
        .getWildBoars()
        .every((b) => b.alive && b.hp === WILD_BOAR_MAX_HP && b.state === 'roam'),
    ).toBe(true);
    expect(b0Group.visible).toBe(true);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    vehicles.dispose();
    interactables.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('supports qaPlaceWave10Showcase(centerPos, yaw) placing 4 Shield Mushrooms + 2 Wild Boars in foreground view and clears on reset()/dispose()', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    const center = { x: -75, y: terrain.getHeightAt(-75, -12), z: -12 };
    const yaw = 0.25;
    const showcase: Wave10ShowcaseResult = interactables.qaPlaceWave10Showcase(center, yaw);

    expect(showcase.mushrooms).toHaveLength(4);
    for (const m of showcase.mushrooms) {
      expect(m.available).toBe(true);
      expect(m.respawnSec).toBe(0);
      expect(terrain.isWater(m.x, m.z)).toBe(false);
      expect(m.y).toBeCloseTo(terrain.getHeightAt(m.x, m.z), 4);
      expect(Math.hypot(m.x - center.x, m.z - center.z)).toBeLessThan(12);
    }

    expect(showcase.boars).toHaveLength(2);
    for (const b of showcase.boars) {
      expect(b.alive).toBe(true);
      expect(b.hp).toBe(WILD_BOAR_MAX_HP);
      expect(terrain.isWater(b.x, b.z)).toBe(false);
      expect(b.y).toBeCloseTo(terrain.getHeightAt(b.x, b.z), 4);
      expect(Math.hypot(b.x - center.x, b.z - center.z)).toBeLessThan(14);
    }

    expect(interactables.getShieldMushrooms()).toHaveLength(28);
    expect(interactables.getWildBoars()).toHaveLength(10);

    // Calling qaPlaceWave10Showcase again replaces cleanly without leaking duplicates
    interactables.qaPlaceWave10Showcase(center, yaw);
    expect(interactables.getShieldMushrooms()).toHaveLength(28);
    expect(interactables.getWildBoars()).toHaveLength(10);

    interactables.reset();
    expect(interactables.getShieldMushrooms()).toHaveLength(24);
    expect(interactables.getWildBoars()).toHaveLength(8);

    interactables.dispose();
    expect(interactables.getShieldMushrooms()).toHaveLength(0);
    expect(interactables.getWildBoars()).toHaveLength(0);
    terrain.dispose();
  });
});

describe('Wave-10 Loot Pools, 3D Pickup Meshes & GLSL Shader Validation', () => {
  it('spawns shockwave_hammer and flare_gun across floor, chest, and supply-drop pools with distinct 3D pickup silhouettes', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 420; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('shockwave_hammer')).toBe(true);
    expect(floorIds.has('flare_gun')).toBe(true);
    expect(chestIds.has('shockwave_hammer')).toBe(true);
    expect(chestIds.has('flare_gun')).toBe(true);

    const dropsBeforeSupply = pal.getLootDrops().length;
    for (let i = 0; i < 95; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    const supplyIds = new Set(
      pal
        .getLootDrops()
        .slice(dropsBeforeSupply)
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(supplyIds.has('shockwave_hammer')).toBe(true);
    expect(supplyIds.has('flare_gun')).toBe(true);

    // Distinct multi-part 3D pickup silhouettes for shockwave_hammer & flare_gun
    const groupBefore = pal.getGroup().children.length;
    pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { item: { uid: 'hammer_mesh_test', weaponId: 'shockwave_hammer', rarity: 'epic', magAmmo: 0, stackCount: 1 } },
    );
    const hammerDropGroup = pal.getGroup().children[groupBefore] as THREE.Group;
    const hammerSilhouette = hammerDropGroup.children[1] as THREE.Group;
    expect(hammerSilhouette).toBeInstanceOf(THREE.Group);
    expect(hammerSilhouette.children.length).toBeGreaterThanOrEqual(5);

    pal.spawnLootDrop(
      { x: 4, y: 12, z: 0 },
      { item: { uid: 'flare_mesh_test', weaponId: 'flare_gun', rarity: 'rare', magAmmo: 6, stackCount: 1 } },
    );
    const flareDropGroup = pal.getGroup().children[groupBefore + 1] as THREE.Group;
    const flareSilhouette = flareDropGroup.children[1] as THREE.Group;
    expect(flareSilhouette).toBeInstanceOf(THREE.Group);
    expect(flareSilhouette.children.length).toBeGreaterThanOrEqual(5);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('validates GLSL ShaderMaterial uniforms, smoothstep bounds, and EnvironmentDetail wind shader injection after Wave-10 additions', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const fx = new EnvironmentFX(4201, bus);
    const storm = new StormSystem(4201, 'solo');
    const detail = new EnvironmentDetail(terrain, world.colliders, 'low', 4201);

    const shaderMats: THREE.ShaderMaterial[] = [];
    for (const root of [fx.getGroup(), world.group, storm.getMesh()]) {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
          shaderMats.push(obj.material);
        }
      });
    }
    expect(shaderMats.length).toBeGreaterThanOrEqual(6);

    for (const mat of shaderMats) {
      for (const glsl of [mat.vertexShader, mat.fragmentShader]) {
        const smoothMatches = [
          ...glsl.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g),
        ];
        for (const m of smoothMatches) {
          expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
        const usedUniforms = new Set(glsl.match(/\bu[A-Z][A-Za-z0-9_]*/g) ?? []);
        for (const uName of usedUniforms) {
          expect(glsl).toMatch(
            new RegExp(`uniform\\s+(?:float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D)\\s+${uName}\\b`),
          );
          expect(mat.uniforms[uName]).toBeDefined();
        }
      }
    }

    const grassMesh = detail.getGroup().getObjectByName('InstancedGrass') as THREE.InstancedMesh;
    const grassMat = grassMesh.material as THREE.MeshStandardMaterial;
    const mockShader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '',
    };
    grassMat.onBeforeCompile(
      mockShader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(mockShader.vertexShader).toContain('uniform float uWindTime;');
    expect(mockShader.vertexShader).toContain('uniform float uWindStrength;');

    detail.dispose();
    storm.dispose();
    fx.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('WorldInteractables Wave-11 Rippling Fishing Holes, Tethered Sky-Ascent Balloons & Showcase', () => {
  it('constructs 14 Rippling Fishing Holes in verified water and 4 Towering Tethered Sky-Ascent Balloons clear of buildings/water/props with full lifecycle and reset()', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const soundSpy = vi.fn();
    const splashSpy = vi.fn();
    bus.on('sound:play', soundSpy);
    bus.on('vfx:fishing_splash', splashSpy);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 1.0) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.15 &&
          c.minY < y + 3.5 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    // 1. 14 Rippling Fishing Holes in verified water locations
    const holes = interactables.getFishingHoles();
    expect(holes).toHaveLength(14);

    const holePositionsBefore: number[] = [];
    for (const fh of holes) {
      expect(fh.castsRemaining).toBe(3);
      expect(fh.depleted).toBe(false);
      expect(terrain.isWater(fh.x, fh.z), `${fh.id} (${fh.x}, ${fh.z}) must be in water`).toBe(true);
      expect(fh.y).toBeCloseTo(WATER_LEVEL, 4);
      expect(isClearOfBuildings(fh.x, WATER_LEVEL, fh.z, 1.0), `${fh.id} hits building/dock`).toBe(true);
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(fh.x - veh.x, fh.z - veh.z)).toBeGreaterThan(4.0);
      }

      const holeGroup = interactables.getGroup().getObjectByName(`FishingHole_${fh.id}`) as THREE.Group;
      expect(holeGroup).toBeDefined();
      expect(holeGroup.visible).toBe(true);
      const fish0 = holeGroup.getObjectByName(`FishingHoleFish_${fh.id}_1`) as THREE.Group;
      const fish1 = holeGroup.getObjectByName(`FishingHoleFish_${fh.id}_2`) as THREE.Group;
      expect(fish0).toBeDefined();
      expect(fish1).toBeDefined();
      holePositionsBefore.push(fish0.position.y);
    }

    // Animate rippling rings & leaping fish arcs
    interactables.update(0.25, 0.25);
    interactables.update(0.35, 0.6);
    const fh0Group = interactables.getGroup().getObjectByName(`FishingHole_${holes[0].id}`) as THREE.Group;
    const fh0Fish0 = fh0Group.getObjectByName(`FishingHoleFish_${holes[0].id}_1`) as THREE.Group;
    expect(fh0Fish0.position.y).not.toBeCloseTo(holePositionsBefore[0], 3);

    // Proximity lookup & safety checks
    const fh0 = holes[0];
    expect(interactables.findNearbyFishingHole({ x: fh0.x + 2.5, y: fh0.y + 0.5, z: fh0.z })?.id).toBe(fh0.id);
    expect(interactables.findNearbyFishingHole({ x: fh0.x + 18, y: fh0.y, z: fh0.z })).toBeNull();
    expect(interactables.findNearbyFishingHole({ x: Number.NaN, y: fh0.y, z: fh0.z })).toBeNull();
    expect(interactables.findNearbyFishingHole({ x: fh0.x, y: fh0.y, z: fh0.z }, -1)).toBeNull();

    // 3-cast lifecycle + rewards + VFX/SFX + depletion
    const rewards: string[] = [];
    for (let cast = 1; cast <= 3; cast++) {
      const res = interactables.consumeFishingCast(fh0.id) as FishingCastResult;
      expect(res).not.toBeNull();
      expect(res.ok).toBe(true);
      expect(['thermal_flopper', 'epic_weapon', 'gold_cache']).toContain(res.reward);
      expect(res.position.x).toBe(fh0.x);
      expect(res.position.z).toBe(fh0.z);
      rewards.push(res.reward);
      expect(fh0.castsRemaining).toBe(3 - cast);
      expect(fh0.depleted).toBe(cast === 3);
    }
    expect(new Set(rewards)).toEqual(new Set(['thermal_flopper', 'epic_weapon', 'gold_cache']));
    expect(splashSpy).toHaveBeenCalledTimes(3);
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'fishing_catch' }));
    expect(fh0Group.visible).toBe(false);
    expect(interactables.consumeFishingCast(fh0.id)).toBeNull();
    expect(interactables.consumeFishingCast('nonexistent_hole')).toBeNull();
    expect(interactables.findNearbyFishingHole({ x: fh0.x, y: fh0.y, z: fh0.z }, 3.0)).toBeNull();

    // 2. 4 Towering Tethered Sky-Ascent Balloons
    const balloons = interactables.getSkyBalloons();
    expect(balloons).toHaveLength(4);
    expect(new Set(balloons.map((b) => b.poiId))).toEqual(
      new Set(['metro_towers', 'crystal_basin', 'market_row', 'crater_depot']),
    );
    expect(interactables.getSkyBalloonColliders()).toHaveLength(4);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    for (const b of balloons) {
      expect(terrain.isWater(b.x, b.z)).toBe(false);
      expect(b.baseY).toBeCloseTo(terrain.getHeightAt(b.x, b.z), 4);
      expect(b.topY).toBeCloseTo(b.baseY + SKY_BALLOON_HEIGHT, 4);
      expect(b.topY).toBeGreaterThanOrEqual(b.baseY + 35);
      expect(terrain.getNormalAt(b.x, b.z).y, `${b.id} slope`).toBeGreaterThan(0.85);
      expect(isClearOfBuildings(b.x, b.baseY, b.z, 2.0), `${b.id} overlaps building`).toBe(true);

      const blockingProp = pal.getProps().find((p) => Math.hypot(b.x - p.x, b.z - p.z) < p.radius + 1.4);
      expect(blockingProp, `${b.id} (${b.x}, ${b.z}) near prop ${blockingProp?.kind}`).toBeUndefined();
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(b.x - veh.x, b.z - veh.z)).toBeGreaterThan(3.5);
      }
      for (const mb of interactables.getModBenches()) {
        expect(Math.hypot(b.x - mb.x, b.z - mb.z)).toBeGreaterThan(4.0);
      }
      for (const ft of interactables.getForecastTowers()) {
        expect(Math.hypot(b.x - ft.x, b.z - ft.z)).toBeGreaterThan(4.0);
      }
      for (const wb of interactables.getWeaponBunkers()) {
        expect(Math.hypot(b.x - wb.x, b.z - wb.z)).toBeGreaterThan(4.0);
      }

      const bGroup = interactables.getGroup().getObjectByName(`SkyBalloon_${b.id}`) as THREE.Group;
      const canopyGroup = interactables.getGroup().getObjectByName(`SkyBalloonCanopy_${b.id}`) as THREE.Group;
      expect(bGroup).toBeDefined();
      expect(canopyGroup).toBeDefined();
      expect(Math.abs(canopyGroup.position.y - SKY_BALLOON_HEIGHT)).toBeLessThan(0.65);
    }

    const b0 = balloons[0];
    const b0Canopy = interactables.getGroup().getObjectByName(`SkyBalloonCanopy_${b0.id}`) as THREE.Group;
    const canopyYBefore = b0Canopy.position.y;
    interactables.update(0.4, 1.3);
    expect(b0Canopy.position.y).not.toBeCloseTo(canopyYBefore, 3);

    expect(interactables.findNearbySkyBalloon({ x: b0.x + 2.5, y: b0.baseY + 0.8, z: b0.z })?.id).toBe(b0.id);
    expect(interactables.findNearbySkyBalloon({ x: b0.x, y: b0.topY, z: b0.z })).toBeNull();
    expect(interactables.findNearbySkyBalloon({ x: Number.NaN, y: b0.baseY, z: b0.z })).toBeNull();

    // 3. reset() restores all 14 fishing holes & 4 balloons cleanly
    interactables.reset();
    expect(interactables.getFishingHoles()).toHaveLength(14);
    expect(
      interactables
        .getFishingHoles()
        .every((fh) => fh.castsRemaining === 3 && !fh.depleted),
    ).toBe(true);
    expect(fh0Group.visible).toBe(true);
    expect(interactables.getSkyBalloons()).toHaveLength(4);
    expect(b0Canopy.position.y).toBeCloseTo(SKY_BALLOON_HEIGHT, 4);

    vehicles.dispose();
    interactables.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('supports qaPlaceWave11Showcase(centerPos, yaw) placing ahead-left Sky Balloon + ahead-right Fishing Hole and cleans up on reset()/dispose()', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    // 1. Crystal Basin shore centerPos -> Fishing Hole snaps into real water ahead-right
    const basinShore = { x: 25, y: terrain.getHeightAt(25, -55), z: -55 };
    const yawNorth = Math.PI;
    const basinShowcase: Wave11ShowcaseResult = interactables.qaPlaceWave11Showcase(basinShore, yawNorth);

    expect(basinShowcase.balloon.id).toBe('balloon_qa_showcase');
    expect(basinShowcase.balloon.topY).toBeCloseTo(basinShowcase.balloon.baseY + SKY_BALLOON_HEIGHT, 4);
    expect(terrain.isWater(basinShowcase.balloon.x, basinShowcase.balloon.z)).toBe(false);

    expect(basinShowcase.fishingHole.id).toBe('fishing_qa_showcase');
    expect(basinShowcase.fishingHole.castsRemaining).toBe(3);
    expect(basinShowcase.fishingHole.depleted).toBe(false);
    expect(terrain.isWater(basinShowcase.fishingHole.x, basinShowcase.fishingHole.z)).toBe(true);
    expect(basinShowcase.fishingHole.y).toBeCloseTo(WATER_LEVEL, 4);

    // Verify ahead-left vs ahead-right placement relative to yawNorth
    const fwdX = Math.sin(yawNorth);
    const fwdZ = Math.cos(yawNorth);
    const rightX = -Math.cos(yawNorth);
    const rightZ = Math.sin(yawNorth);
    const balFwd = (basinShowcase.balloon.x - basinShore.x) * fwdX + (basinShowcase.balloon.z - basinShore.z) * fwdZ;
    const balRight = (basinShowcase.balloon.x - basinShore.x) * rightX + (basinShowcase.balloon.z - basinShore.z) * rightZ;
    expect(balFwd).toBeGreaterThan(2);
    expect(balRight).toBeLessThan(-1);

    const fhFwd = (basinShowcase.fishingHole.x - basinShore.x) * fwdX + (basinShowcase.fishingHole.z - basinShore.z) * fwdZ;
    const fhRight = (basinShowcase.fishingHole.x - basinShore.x) * rightX + (basinShowcase.fishingHole.z - basinShore.z) * rightZ;
    expect(fhFwd).toBeGreaterThan(2);
    expect(fhRight).toBeGreaterThan(0);

    expect(interactables.getSkyBalloons()).toHaveLength(5);
    expect(interactables.getFishingHoles()).toHaveLength(15);

    // 2. Re-calling on dry Metro plateau replaces without leaking duplicates
    const dryCenter = { x: -75, y: terrain.getHeightAt(-75, -12), z: -12 };
    const dryShowcase = interactables.qaPlaceWave11Showcase(dryCenter, 0.3);
    expect(dryShowcase.balloon.id).toBe('balloon_qa_showcase');
    expect(dryShowcase.fishingHole.id).toBe('fishing_qa_showcase');
    expect(interactables.getSkyBalloons()).toHaveLength(5);
    expect(interactables.getFishingHoles()).toHaveLength(15);
    expect(Math.hypot(dryShowcase.balloon.x - dryCenter.x, dryShowcase.balloon.z - dryCenter.z)).toBeLessThan(16);
    expect(Math.hypot(dryShowcase.fishingHole.x - dryCenter.x, dryShowcase.fishingHole.z - dryCenter.z)).toBeLessThan(16);

    // 3. reset() & dispose() clean up showcase entities and colliders
    interactables.reset();
    expect(interactables.getSkyBalloons()).toHaveLength(4);
    expect(interactables.getFishingHoles()).toHaveLength(14);
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4);

    interactables.dispose();
    expect(interactables.getSkyBalloons()).toHaveLength(0);
    expect(interactables.getFishingHoles()).toHaveLength(0);
    terrain.dispose();
  });
});

describe('Wave-11 Loot Pools, 3D Pickup Silhouettes & GLSL Shader Validation', () => {
  it('spawns auto_turret and chug_cannon across floor, chest, and supply-drop pools with distinct 3D pickup silhouettes', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 480; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('auto_turret')).toBe(true);
    expect(floorIds.has('chug_cannon')).toBe(true);
    expect(chestIds.has('auto_turret')).toBe(true);
    expect(chestIds.has('chug_cannon')).toBe(true);

    const dropsBeforeSupply = pal.getLootDrops().length;
    for (let i = 0; i < 110; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    const supplyIds = new Set(
      pal
        .getLootDrops()
        .slice(dropsBeforeSupply)
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(supplyIds.has('auto_turret')).toBe(true);
    expect(supplyIds.has('chug_cannon')).toBe(true);

    // Distinct multi-part 3D pickup silhouettes for auto_turret & chug_cannon
    const groupBefore = pal.getGroup().children.length;
    pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { item: { uid: 'turret_mesh_test', weaponId: 'auto_turret', rarity: 'epic', magAmmo: 0, stackCount: 1 } },
    );
    const turretDropGroup = pal.getGroup().children[groupBefore] as THREE.Group;
    const turretSilhouette = turretDropGroup.children[1] as THREE.Group;
    expect(turretSilhouette).toBeInstanceOf(THREE.Group);
    expect(turretSilhouette.children.length).toBeGreaterThanOrEqual(5);

    pal.spawnLootDrop(
      { x: 4, y: 12, z: 0 },
      { item: { uid: 'chug_mesh_test', weaponId: 'chug_cannon', rarity: 'mythic', magAmmo: 5, stackCount: 1 } },
    );
    const chugDropGroup = pal.getGroup().children[groupBefore + 1] as THREE.Group;
    const chugSilhouette = chugDropGroup.children[1] as THREE.Group;
    expect(chugSilhouette).toBeInstanceOf(THREE.Group);
    expect(chugSilhouette.children.length).toBeGreaterThanOrEqual(5);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('validates GLSL ShaderMaterial uniforms, smoothstep bounds, and EnvironmentDetail wind shader injection after Wave-11 additions', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const fx = new EnvironmentFX(4201, bus);
    const storm = new StormSystem(4201, 'solo');
    const interactables = new WorldInteractables(terrain, bus);
    const detail = new EnvironmentDetail(terrain, world.colliders, 'low', 4201);

    const shaderMats: THREE.ShaderMaterial[] = [];
    for (const root of [fx.getGroup(), world.group, storm.getMesh(), interactables.getGroup()]) {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
          shaderMats.push(obj.material);
        }
      });
    }
    expect(shaderMats.length).toBeGreaterThanOrEqual(6);

    for (const mat of shaderMats) {
      for (const glsl of [mat.vertexShader, mat.fragmentShader]) {
        const smoothMatches = [
          ...glsl.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g),
        ];
        for (const m of smoothMatches) {
          expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
        const usedUniforms = new Set(glsl.match(/\bu[A-Z][A-Za-z0-9_]*/g) ?? []);
        for (const uName of usedUniforms) {
          expect(glsl).toMatch(
            new RegExp(`uniform\\s+(?:float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D)\\s+${uName}\\b`),
          );
          expect(mat.uniforms[uName]).toBeDefined();
        }
      }
    }

    const grassMesh = detail.getGroup().getObjectByName('InstancedGrass') as THREE.InstancedMesh;
    const grassMat = grassMesh.material as THREE.MeshStandardMaterial;
    const mockShader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '',
    };
    grassMat.onBeforeCompile(
      mockShader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(mockShader.vertexShader).toContain('uniform float uWindTime;');
    expect(mockShader.vertexShader).toContain('uniform float uWindStrength;');

    detail.dispose();
    interactables.dispose();
    storm.dispose();
    fx.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('WorldInteractables Wave-12 Golden Hot-Drop POIs & Showcase', () => {
  it('deterministically selects HOT_DROP_POI_COUNT (2) distinct POIs, spawns 2 extra Golden Supply Drones per Hot Drop, and cleans up on reset()/dispose()', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    expect(interactables.getHotDropPoiIds()).toEqual([]);
    expect(interactables.getSupplyDrones()).toHaveLength(12);

    const picked1 = interactables.selectHotDropPois(4201);
    expect(picked1).toHaveLength(HOT_DROP_POI_COUNT);
    expect(new Set(picked1).size).toBe(HOT_DROP_POI_COUNT);
    const validPoiIds = new Set(POIS.map((p) => p.id));
    for (const id of picked1) {
      expect(validPoiIds.has(id)).toBe(true);
      expect(interactables.isHotDropPoi(id)).toBe(true);
      expect(interactables.getGroup().getObjectByName(`HotDropBeacon_hotdrop_beacon_${id}`)).toBeDefined();
    }
    expect(interactables.isHotDropPoi('nonexistent_poi')).toBe(false);

    // Returned list is defensive copy
    const snap = interactables.getHotDropPoiIds();
    expect(snap).toEqual(picked1);
    snap.push('fake_poi');
    expect(interactables.getHotDropPoiIds()).toEqual(picked1);

    // 12 base + 2*2 golden hot-drop drones = 16
    const allDrones = interactables.getSupplyDrones();
    expect(allDrones).toHaveLength(16);
    const hotDropDrones = allDrones.filter((d) => d.id.startsWith('drone_hotdrop_'));
    expect(hotDropDrones).toHaveLength(4);
    for (const hd of hotDropDrones) {
      expect(picked1).toContain(hd.poiId);
      expect(['legendary', 'mythic']).toContain(hd.rarity);
      expect(hd.destroyed).toBe(false);
      const localGroundY = terrain.getHeightAt(hd.x, hd.z);
      expect(hd.y - localGroundY).toBeGreaterThanOrEqual(11);
      expect(hd.y - localGroundY).toBeLessThanOrEqual(18);
      const dmgRes = interactables.damageSupplyDrone(hd.id, 999);
      expect(dmgRes).not.toBeNull();
      expect(dmgRes!.destroyed).toBe(true);
      expect(WEAPONS[dmgRes!.weaponId].allowedRarities).toContain(dmgRes!.rarity);
    }

    // Determinism check with identical seed
    const interactables2 = new WorldInteractables(terrain, bus);
    const picked2 = interactables2.selectHotDropPois(4201);
    expect(picked2).toEqual(picked1);
    interactables2.dispose();

    // QA override via setHotDropPoiIds deduplicates & replaces cleanly without leaking drones
    const overridden = interactables.setHotDropPoiIds(['metro_towers', 'metro_towers', 'crater_depot']);
    expect(overridden).toEqual(['metro_towers', 'crater_depot']);
    expect(interactables.isHotDropPoi('metro_towers')).toBe(true);
    expect(interactables.isHotDropPoi('crater_depot')).toBe(true);
    expect(interactables.getSupplyDrones()).toHaveLength(16);
    expect(interactables.getSupplyDrones().filter((d) => d.id.startsWith('drone_hotdrop_'))).toHaveLength(4);

    // reset() cleans up dynamic hot-drop drones, beacons, and hotDropPoiIds back to 12 base drones
    interactables.reset();
    expect(interactables.getHotDropPoiIds()).toEqual([]);
    expect(interactables.getSupplyDrones()).toHaveLength(12);
    expect(interactables.getGroup().getObjectByName('HotDropBeacon_hotdrop_beacon_metro_towers')).toBeUndefined();

    // Re-populate then dispose() cleans everything
    interactables.selectHotDropPois(777);
    expect(interactables.getSupplyDrones()).toHaveLength(16);
    interactables.dispose();
    expect(interactables.getHotDropPoiIds()).toEqual([]);
    expect(interactables.getSupplyDrones()).toHaveLength(0);

    terrain.dispose();
  });

  it('supports qaPlaceWave12Showcase(centerPos, poiId) flagging Golden Hot Drop, emitting beam+chime, placing showcase beacon/drone, and cleaning up', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const interactables = new WorldInteractables(terrain, bus);

    const beamSpy = vi.fn();
    const soundSpy = vi.fn();
    bus.on('vfx:hot_drop_beam', beamSpy);
    bus.on('sound:play', soundSpy);

    const center = { x: 25, y: terrain.getHeightAt(25, -55), z: -55 };
    const showcase: Wave12ShowcaseResult = interactables.qaPlaceWave12Showcase(center, 'crystal_basin');

    expect(showcase.poiId).toBe('crystal_basin');
    expect(interactables.isHotDropPoi('crystal_basin')).toBe(true);
    expect(showcase.hotDropPoiIds).toContain('crystal_basin');
    expect(showcase.drone.id).toBe('drone_qa_wave12_showcase');
    expect(showcase.drone.poiId).toBe('crystal_basin');
    expect(['legendary', 'mythic']).toContain(showcase.drone.rarity);
    expect(terrain.isWater(showcase.beaconPosition.x, showcase.beaconPosition.z)).toBe(false);
    expect(interactables.getGroup().getObjectByName('HotDropBeacon_hotdrop_beacon_qa_showcase')).toBeDefined();
    expect(interactables.getGroup().getObjectByName('SupplyDrone_drone_qa_wave12_showcase')).toBeDefined();

    expect(beamSpy).toHaveBeenCalledTimes(1);
    expect(beamSpy).toHaveBeenCalledWith({ position: showcase.beaconPosition });
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'hot_drop_chime' }));

    // Re-calling with default nearest poiId replaces cleanly without duplicating showcase drone
    const metroCenter = { x: -75, y: terrain.getHeightAt(-75, -12), z: -12 };
    const showcase2 = interactables.qaPlaceWave12Showcase(metroCenter);
    expect(showcase2.poiId).toBe('metro_towers');
    expect(interactables.isHotDropPoi('metro_towers')).toBe(true);
    expect(interactables.isHotDropPoi('crystal_basin')).toBe(false);
    expect(interactables.getSupplyDrones()).toHaveLength(13);

    // Update animates golden hot-drop beacon smoothly
    const beaconGroup = interactables.getGroup().getObjectByName('HotDropBeacon_hotdrop_beacon_qa_showcase') as THREE.Group;
    const diamond = beaconGroup.children[2] as THREE.Mesh;
    const rotBefore = diamond.rotation.y;
    interactables.update(0.3, 1.4);
    expect(diamond.rotation.y).not.toBeCloseTo(rotBefore, 3);

    interactables.reset();
    expect(interactables.getHotDropPoiIds()).toEqual([]);
    expect(interactables.getSupplyDrones()).toHaveLength(12);
    expect(interactables.getGroup().getObjectByName('HotDropBeacon_hotdrop_beacon_qa_showcase')).toBeUndefined();

    interactables.dispose();
    terrain.dispose();
  });
});

describe('Wave-12 Loot Pools, 3D Pickup Silhouettes & GLSL Shader Validation', () => {
  it('spawns ballistic_shield and remote_c4 across floor, chest, and supply-drop pools with crisp multi-part 3D pickup silhouettes', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('ballistic_shield')).toBe(true);
    expect(floorIds.has('remote_c4')).toBe(true);
    expect(chestIds.has('ballistic_shield')).toBe(true);
    expect(chestIds.has('remote_c4')).toBe(true);

    const dropsBeforeSupply = pal.getLootDrops().length;
    for (let i = 0; i < 130; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    const supplyIds = new Set(
      pal
        .getLootDrops()
        .slice(dropsBeforeSupply)
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(supplyIds.has('ballistic_shield')).toBe(true);
    expect(supplyIds.has('remote_c4')).toBe(true);

    // Distinct multi-part 3D pickup silhouettes for ballistic_shield & remote_c4
    const groupBefore = pal.getGroup().children.length;
    pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { item: { uid: 'shield_mesh_test', weaponId: 'ballistic_shield', rarity: 'epic', magAmmo: 15, stackCount: 1 } },
    );
    const shieldDropGroup = pal.getGroup().children[groupBefore] as THREE.Group;
    const shieldSilhouette = shieldDropGroup.children[1] as THREE.Group;
    expect(shieldSilhouette).toBeInstanceOf(THREE.Group);
    expect(shieldSilhouette.children.length).toBeGreaterThanOrEqual(5);

    pal.spawnLootDrop(
      { x: 4, y: 12, z: 0 },
      { item: { uid: 'c4_mesh_test', weaponId: 'remote_c4', rarity: 'epic', magAmmo: 0, stackCount: 3 } },
    );
    const c4DropGroup = pal.getGroup().children[groupBefore + 1] as THREE.Group;
    const c4Silhouette = c4DropGroup.children[1] as THREE.Group;
    expect(c4Silhouette).toBeInstanceOf(THREE.Group);
    expect(c4Silhouette.children.length).toBeGreaterThanOrEqual(5);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('validates GLSL ShaderMaterial uniforms, smoothstep bounds, and EnvironmentDetail wind shader injection after Wave-12 additions', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const fx = new EnvironmentFX(4201, bus);
    const storm = new StormSystem(4201, 'solo');
    const interactables = new WorldInteractables(terrain, bus);
    interactables.selectHotDropPois(4201);
    const detail = new EnvironmentDetail(terrain, world.colliders, 'low', 4201);

    const shaderMats: THREE.ShaderMaterial[] = [];
    for (const root of [fx.getGroup(), world.group, storm.getMesh(), interactables.getGroup()]) {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
          shaderMats.push(obj.material);
        }
      });
    }
    expect(shaderMats.length).toBeGreaterThanOrEqual(6);

    for (const mat of shaderMats) {
      for (const glsl of [mat.vertexShader, mat.fragmentShader]) {
        const smoothMatches = [
          ...glsl.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g),
        ];
        for (const m of smoothMatches) {
          expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
        const usedUniforms = new Set(glsl.match(/\bu[A-Z][A-Za-z0-9_]*/g) ?? []);
        for (const uName of usedUniforms) {
          expect(glsl).toMatch(
            new RegExp(`uniform\\s+(?:float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D)\\s+${uName}\\b`),
          );
          expect(mat.uniforms[uName]).toBeDefined();
        }
      }
    }

    const grassMesh = detail.getGroup().getObjectByName('InstancedGrass') as THREE.InstancedMesh;
    const grassMat = grassMesh.material as THREE.MeshStandardMaterial;
    const mockShader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '',
    };
    grassMat.onBeforeCompile(
      mockShader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(mockShader.vertexShader).toContain('uniform float uWindTime;');
    expect(mockShader.vertexShader).toContain('uniform float uWindStrength;');

    detail.dispose();
    interactables.dispose();
    storm.dispose();
    fx.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('Wave-13 VehicleSystem Storm Choppa Helicopter', () => {
  it('spawns 2 deterministic Storm Choppas near Frostpeak & Skyline overlooks (16 vehicles across 5 kinds) with rotor pivots, flight AGL physics, and wash VFX', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const vs = new VehicleSystem(terrain, bus, 4201);

    const washSpy = vi.fn();
    const soundSpy = vi.fn();
    bus.on('vfx:choppa_wash', washSpy);
    bus.on('sound:play', soundSpy);

    const all = vs.getVehicles();
    expect(all).toHaveLength(16);
    expect(all.filter((v) => v.kind === 'hover_atv')).toHaveLength(4);
    expect(all.filter((v) => v.kind === 'cyber_bike')).toHaveLength(4);
    expect(all.filter((v) => v.kind === 'speedboat')).toHaveLength(4);
    expect(all.filter((v) => v.kind === 'hover_tank')).toHaveLength(2);
    const choppas = all.filter((v) => v.kind === 'choppa');
    expect(choppas).toHaveLength(2);

    const frostpeak = POIS.find((p) => p.id === 'frostpeak_citadel')!;
    const skyline = POIS.find((p) => p.id === 'skyline_spire')!;
    expect(choppas.some((c) => Math.hypot(c.x - frostpeak.x, c.z - frostpeak.z) < 55)).toBe(true);
    expect(choppas.some((c) => Math.hypot(c.x - skyline.x, c.z - skyline.z) < 55)).toBe(true);

    for (const ch of choppas) {
      expect(ch.maxHp).toBe(1000);
      expect(ch.hp).toBe(1000);
      expect(ch.altitude).toBeCloseTo(1.05, 4);
      expect(ch.rotorRpm).toBe(0);
      expect(terrain.isWater(ch.x, ch.z)).toBe(false);
      expect(terrain.getNormalAt(ch.x, ch.z).y).toBeGreaterThan(0.95);

      const blockingProp = pal.getProps().find((p) => Math.hypot(ch.x - p.x, ch.z - p.z) < p.radius + 2.5);
      expect(blockingProp, `${ch.id} near prop ${blockingProp?.kind}`).toBeUndefined();

      const chGroup = vs.getGroup().getObjectByName(`Vehicle_${ch.id}`) as THREE.Group;
      expect(chGroup).toBeDefined();
      const bodyPivot = chGroup.children[0] as THREE.Group;
      expect(bodyPivot.children.length).toBeGreaterThanOrEqual(15);
      const rotorPivot = chGroup.getObjectByName('rotorPivot') as THREE.Group;
      const tailRotorPivot = chGroup.getObjectByName('tailRotorPivot') as THREE.Group;
      expect(rotorPivot).toBeDefined();
      expect(tailRotorPivot).toBeDefined();
      expect(rotorPivot.children.length).toBeGreaterThanOrEqual(4);
      expect(tailRotorPivot.children.length).toBeGreaterThanOrEqual(3);
    }

    // Spawn test choppa on open dry Metro plateau and exercise full flight lifecycle
    const c0 = vs.spawnVehicleAt('choppa', -75, -10, 0);
    expect(vs.getVehicles()).toHaveLength(17);
    expect(vs.enterVehicle(c0.id, 'pilot')).toBe(true);

    const c0Group = vs.getGroup().getObjectByName(`Vehicle_${c0.id}`) as THREE.Group;
    const mainRotor = c0Group.getObjectByName('rotorPivot') as THREE.Group;
    const tailRotor = c0Group.getObjectByName('tailRotorPivot') as THREE.Group;
    const mainRotBefore = mainRotor.rotation.y;
    const tailRotBefore = tailRotor.rotation.x;

    // Low-altitude hover (< 9m AGL) emits periodic vfx:choppa_wash and spins rotors
    for (let i = 0; i < 6; i++) {
      vs.driveVehicle(c0.id, 0, 0, false, 0.05, 0);
      vs.update(0.05, i * 0.05);
    }
    expect(washSpy).toHaveBeenCalled();
    expect(washSpy.mock.calls[0][0].intensity).toBeGreaterThan(0.1);
    expect(washSpy.mock.calls[0][0].intensity).toBeLessThanOrEqual(1);
    expect(c0.rotorRpm!).toBeGreaterThan(0.5);
    expect(c0.rotorRpm!).toBeLessThanOrEqual(1);
    expect(mainRotor.rotation.y).not.toBeCloseTo(mainRotBefore, 2);
    expect(tailRotor.rotation.x).not.toBeCloseTo(tailRotBefore, 2);

    // Ascend cleanly at CHOPPA_ASCEND_SPEED up to CHOPPA_MAX_ALTITUDE_AGL (42m)
    const altAfter1sStart = c0.altitude!;
    for (let i = 0; i < 20; i++) {
      vs.driveVehicle(c0.id, 0, 0, false, 0.05, 1);
      vs.update(0.05, 0.3 + i * 0.05);
    }
    expect(c0.altitude! - altAfter1sStart).toBeGreaterThan(CHOPPA_ASCEND_SPEED * 0.65);
    expect(c0.altitude!).toBeGreaterThan(10);

    // Once above 9m AGL, vfx:choppa_wash stops emitting
    washSpy.mockClear();
    for (let i = 0; i < 50; i++) {
      vs.driveVehicle(c0.id, 0, 0, false, 0.05, 1);
      vs.update(0.05, 1.3 + i * 0.05);
    }
    expect(washSpy).not.toHaveBeenCalled();
    expect(c0.altitude!).toBeCloseTo(CHOPPA_MAX_ALTITUDE_AGL, 1);
    expect(c0.altitude!).toBeLessThanOrEqual(CHOPPA_MAX_ALTITUDE_AGL);

    // Forward cruise (maxSpeed: 28) and boost (boostSpeed: 38 + choppa_boost)
    soundSpy.mockClear();
    for (let i = 0; i < 40; i++) {
      vs.driveVehicle(c0.id, 1, 0, false, 0.05, 0);
      vs.update(0.05, 3.8 + i * 0.05);
    }
    const cruiseSpeed = Math.hypot(c0.vx, c0.vz);
    expect(cruiseSpeed).toBeGreaterThan(24);
    expect(cruiseSpeed).toBeLessThanOrEqual(28.05);

    for (let i = 0; i < 30; i++) {
      vs.driveVehicle(c0.id, 1, 0.4, true, 0.05, 0);
      vs.update(0.05, 5.8 + i * 0.05);
    }
    const boostSpeed = Math.hypot(c0.vx, c0.vz);
    expect(boostSpeed).toBeGreaterThan(32);
    expect(boostSpeed).toBeLessThanOrEqual(38.05);
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'choppa_boost' }));

    // Descend cleanly at CHOPPA_DESCEND_SPEED down to hoverHeight (1.05m) and resume rotor wash < 9m
    const altBeforeDescend = c0.altitude!;
    for (let i = 0; i < 20; i++) {
      vs.driveVehicle(c0.id, 0, 0, false, 0.05, -1);
      vs.update(0.05, 7.3 + i * 0.05);
    }
    expect(altBeforeDescend - c0.altitude!).toBeGreaterThan(CHOPPA_DESCEND_SPEED * 0.65);

    washSpy.mockClear();
    for (let i = 0; i < 65; i++) {
      vs.driveVehicle(c0.id, 0, 0, false, 0.05, -1);
      vs.update(0.05, 8.3 + i * 0.05);
    }
    expect(c0.altitude!).toBeCloseTo(1.05, 2);
    expect(c0.altitude!).toBeGreaterThanOrEqual(1.05);
    expect(washSpy).toHaveBeenCalled();

    // Mid-air exit returns airborne coordinates cleanly
    for (let i = 0; i < 25; i++) {
      vs.driveVehicle(c0.id, 0, 0, false, 0.05, 1);
      vs.update(0.05, 11.6 + i * 0.05);
    }
    const midAirExit = vs.exitVehicle(c0.id, 'pilot');
    expect(midAirExit).not.toBeNull();
    expect(midAirExit!.y).toBeGreaterThan(terrain.getHeightAt(midAirExit!.x, midAirExit!.z) + 5);

    // reset() restores 16 default vehicles including 2 choppas
    vs.reset();
    expect(vs.getVehicles()).toHaveLength(16);
    expect(vs.getVehicles().filter((v) => v.kind === 'choppa')).toHaveLength(2);
    expect(vs.getVehicles().filter((v) => v.kind === 'choppa').every((c) => c.altitude === 1.05 && c.rotorRpm === 0)).toBe(true);

    vs.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('WorldInteractables Wave-13 Ancient Rune Monoliths & Showcase', () => {
  it('constructs 4 Ancient Rune Monoliths clear of water/buildings/props/interactables with attune lifecycle, cooldown regen, showcase & reset', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);
    const interactables = new WorldInteractables(terrain, bus);
    const vehicles = new VehicleSystem(terrain, bus, 4201);

    const attuneVfxSpy = vi.fn();
    const soundSpy = vi.fn();
    bus.on('vfx:rune_attune', attuneVfxSpy);
    bus.on('sound:play', soundSpy);

    const isClearOfBuildings = (x: number, y: number, z: number, pad = 2.0) =>
      !world.colliders.some(
        (c) =>
          c.tag !== 'building_floor' &&
          c.tag !== 'building_plaza' &&
          c.tag !== 'building_sky_island' &&
          c.maxY > y + 0.1 &&
          c.minY < y + 4.0 &&
          x >= c.minX - pad &&
          x <= c.maxX + pad &&
          z >= c.minZ - pad &&
          z <= c.maxZ + pad,
      );

    const monoliths = interactables.getRuneMonoliths();
    expect(monoliths).toHaveLength(RUNE_MONOLITH_COUNT);
    expect(interactables.getRuneMonolithColliders()).toHaveLength(RUNE_MONOLITH_COUNT);
    expect(interactables.getColliders()).toHaveLength(
      15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4,
    );

    for (const rm of monoliths) {
      expect(rm.attuned).toBe(false);
      expect(rm.cooldownSec).toBe(0);
      expect(terrain.isWater(rm.x, rm.z)).toBe(false);
      expect(rm.y).toBeCloseTo(terrain.getHeightAt(rm.x, rm.z), 4);
      expect(terrain.getNormalAt(rm.x, rm.z).y).toBeGreaterThan(0.95);
      expect(isClearOfBuildings(rm.x, rm.y, rm.z, 2.0), `${rm.id} hits building`).toBe(true);

      const blockingProp = pal.getProps().find((p) => Math.hypot(rm.x - p.x, rm.z - p.z) < p.radius + 2.0);
      expect(blockingProp, `${rm.id} near prop ${blockingProp?.kind}`).toBeUndefined();
      for (const veh of vehicles.getVehicles()) {
        expect(Math.hypot(rm.x - veh.x, rm.z - veh.z)).toBeGreaterThan(4.5);
      }
      for (const mb of interactables.getModBenches()) {
        expect(Math.hypot(rm.x - mb.x, rm.z - mb.z)).toBeGreaterThan(4.5);
      }
      for (const ft of interactables.getForecastTowers()) {
        expect(Math.hypot(rm.x - ft.x, rm.z - ft.z)).toBeGreaterThan(4.5);
      }
      for (const sb of interactables.getSkyBalloons()) {
        expect(Math.hypot(rm.x - sb.x, rm.z - sb.z)).toBeGreaterThan(4.5);
      }

      const group = interactables.getGroup().getObjectByName(`RuneMonolith_${rm.id}`) as THREE.Group;
      const ring = interactables.getGroup().getObjectByName(`RuneMonolithRing_${rm.id}`) as THREE.Group;
      expect(group).toBeDefined();
      expect(ring).toBeDefined();
      expect(ring.children.length).toBeGreaterThanOrEqual(6);
    }

    // Proximity lookup & safety guards
    const m0 = monoliths[0];
    expect(interactables.findNearbyRuneMonolith({ x: m0.x + 2.5, y: m0.y + 0.5, z: m0.z })?.id).toBe(m0.id);
    expect(interactables.findNearbyRuneMonolith({ x: m0.x + 12, y: m0.y, z: m0.z })).toBeNull();
    expect(interactables.findNearbyRuneMonolith({ x: Number.NaN, y: m0.y, z: m0.z })).toBeNull();
    expect(interactables.findNearbyRuneMonolith({ x: m0.x, y: m0.y, z: m0.z }, -1)).toBeNull();

    // Attune lifecycle + rewards + VFX/SFX + duplicate/invalid protection
    const m0Ring = interactables.getGroup().getObjectByName(`RuneMonolithRing_${m0.id}`) as THREE.Group;
    const rotBefore = m0Ring.rotation.y;
    const res = interactables.attuneRuneMonolith(m0.id) as RuneMonolithAttuneResult;
    expect(res.ok).toBe(true);
    expect(res.position).toBeDefined();
    expect(res.position!.x).toBe(m0.x);
    expect(res.position!.z).toBe(m0.z);
    expect(res.shieldBonus).toBe(STORM_BLESSING_SHIELD_BONUS);
    expect(res.goldBonus).toBe(100);
    expect(['storm_breaker', 'shadow_cloak']).toContain(res.weaponId);
    expect(['mythic', 'legendary']).toContain(res.rarity);

    expect(m0.attuned).toBe(true);
    expect(m0.cooldownSec).toBe(RUNE_MONOLITH_COOLDOWN_SEC);
    expect(attuneVfxSpy).toHaveBeenCalledTimes(1);
    expect(attuneVfxSpy).toHaveBeenCalledWith({ position: res.position });
    expect(soundSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'rune_attune' }));

    expect(interactables.attuneRuneMonolith(m0.id)).toEqual({ ok: false });
    expect(interactables.attuneRuneMonolith('nonexistent_monolith')).toEqual({ ok: false });
    expect(interactables.findNearbyRuneMonolith({ x: m0.x, y: m0.y, z: m0.z })).toBeNull();

    // Half cooldown + animation + full cooldown regen
    interactables.update(25, 25);
    expect(m0.attuned).toBe(true);
    expect(m0.cooldownSec).toBeCloseTo(RUNE_MONOLITH_COOLDOWN_SEC - 25, 4);
    expect(m0Ring.rotation.y).not.toBeCloseTo(rotBefore, 3);

    interactables.update(40, 65);
    expect(m0.attuned).toBe(false);
    expect(m0.cooldownSec).toBe(0);
    expect(interactables.findNearbyRuneMonolith({ x: m0.x, y: m0.y, z: m0.z })?.id).toBe(m0.id);

    // qaPlaceWave13Showcase places dry-ground showcase monolith ahead-left and replaces cleanly
    const basinShore = { x: 25, y: terrain.getHeightAt(25, -55), z: -55 };
    const yawNorth = Math.PI;
    const showcase: Wave13ShowcaseResult = interactables.qaPlaceWave13Showcase(basinShore, yawNorth);
    expect(showcase.monolith.id).toBe('rune_monolith_qa_showcase');
    expect(showcase.monolith.attuned).toBe(false);
    expect(terrain.isWater(showcase.monolith.x, showcase.monolith.z)).toBe(false);

    const fwdX = Math.sin(yawNorth);
    const fwdZ = Math.cos(yawNorth);
    const rightX = -Math.cos(yawNorth);
    const rightZ = Math.sin(yawNorth);
    const monoFwd = (showcase.monolith.x - basinShore.x) * fwdX + (showcase.monolith.z - basinShore.z) * fwdZ;
    const monoRight = (showcase.monolith.x - basinShore.x) * rightX + (showcase.monolith.z - basinShore.z) * rightZ;
    expect(monoFwd).toBeGreaterThan(2);
    expect(monoRight).toBeLessThan(-1);
    expect(interactables.getRuneMonoliths()).toHaveLength(5);
    expect(interactables.getRuneMonolithColliders()).toHaveLength(5);

    // Re-calling replaces cleanly without leaking duplicates
    interactables.qaPlaceWave13Showcase({ x: -75, y: terrain.getHeightAt(-75, -12), z: -12 }, 0.25);
    expect(interactables.getRuneMonoliths()).toHaveLength(5);

    // reset() and dispose() clean up showcase monolith & restore base 4 monoliths
    interactables.attuneRuneMonolith(m0.id);
    interactables.reset();
    expect(interactables.getRuneMonoliths()).toHaveLength(4);
    expect(interactables.getRuneMonolithColliders()).toHaveLength(4);
    expect(interactables.getRuneMonoliths().every((m) => !m.attuned && m.cooldownSec === 0)).toBe(true);
    expect(interactables.getColliders()).toHaveLength(
      15 + 6 + 24 + 18 + 6 + 40 + 6 + 6 + 6 + 4 + 4 + 4,
    );

    interactables.dispose();
    expect(interactables.getRuneMonoliths()).toHaveLength(0);
    expect(interactables.getRuneMonolithColliders()).toHaveLength(0);

    vehicles.dispose();
    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('Wave-13 Loot Pools, 3D Pickup Meshes & GLSL Shader Validation', () => {
  it('spawns storm_breaker and shadow_cloak across floor, chest, and supply-drop pools with distinct multi-part 3D pickup meshes', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);
    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const floorIds = new Set<string>();
    const chestIds = new Set<string>();
    for (let i = 0; i < 720; i++) {
      const fw = pal.rollWeaponLoot(false);
      expect(WEAPONS[fw.weaponId].allowedRarities).toContain(fw.rarity);
      expect(fw.magAmmo).toBe(WEAPONS[fw.weaponId].magSize);
      floorIds.add(fw.weaponId);

      const cw = pal.rollWeaponLoot(true);
      expect(WEAPONS[cw.weaponId].allowedRarities).toContain(cw.rarity);
      expect(cw.magAmmo).toBe(WEAPONS[cw.weaponId].magSize);
      chestIds.add(cw.weaponId);
    }
    expect(floorIds.has('storm_breaker')).toBe(true);
    expect(floorIds.has('shadow_cloak')).toBe(true);
    expect(chestIds.has('storm_breaker')).toBe(true);
    expect(chestIds.has('shadow_cloak')).toBe(true);

    const dropsBeforeSupply = pal.getLootDrops().length;
    for (let i = 0; i < 160; i++) {
      const sd = pal.spawnSupplyDrop(-75 + i, -40);
      pal.openSupplyDrop(sd.id);
    }
    const supplyIds = new Set(
      pal
        .getLootDrops()
        .slice(dropsBeforeSupply)
        .filter((d) => Boolean(d.item))
        .map((d) => d.item!.weaponId),
    );
    expect(supplyIds.has('storm_breaker')).toBe(true);
    expect(supplyIds.has('shadow_cloak')).toBe(true);

    // Distinct multi-part 3D pickup meshes for storm_breaker & shadow_cloak
    const groupBefore = pal.getGroup().children.length;
    pal.spawnLootDrop(
      { x: 0, y: 12, z: 0 },
      { item: { uid: 'arc_mesh_test', weaponId: 'storm_breaker', rarity: 'mythic', magAmmo: 20, stackCount: 1 } },
    );
    const arcDropGroup = pal.getGroup().children[groupBefore] as THREE.Group;
    const arcSilhouette = arcDropGroup.children[1] as THREE.Group;
    expect(arcSilhouette).toBeInstanceOf(THREE.Group);
    expect(arcSilhouette.children.length).toBeGreaterThanOrEqual(6);

    pal.spawnLootDrop(
      { x: 4, y: 12, z: 0 },
      { item: { uid: 'cloak_mesh_test', weaponId: 'shadow_cloak', rarity: 'mythic', magAmmo: 0, stackCount: 1 } },
    );
    const cloakDropGroup = pal.getGroup().children[groupBefore + 1] as THREE.Group;
    const cloakSilhouette = cloakDropGroup.children[1] as THREE.Group;
    expect(cloakSilhouette).toBeInstanceOf(THREE.Group);
    expect(cloakSilhouette.children.length).toBeGreaterThanOrEqual(6);

    pal.dispose();
    builder.dispose();
    terrain.dispose();
  });

  it('validates GLSL ShaderMaterial uniforms, smoothstep bounds, and EnvironmentDetail wind shader injection after Wave-13 additions', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');
    const bus = new EventBus();
    const fx = new EnvironmentFX(4201, bus);
    const storm = new StormSystem(4201, 'solo');
    const interactables = new WorldInteractables(terrain, bus);
    const detail = new EnvironmentDetail(terrain, world.colliders, 'low', 4201);

    const shaderMats: THREE.ShaderMaterial[] = [];
    for (const root of [fx.getGroup(), world.group, storm.getMesh(), interactables.getGroup()]) {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
          shaderMats.push(obj.material);
        }
      });
    }
    expect(shaderMats.length).toBeGreaterThanOrEqual(6);

    for (const mat of shaderMats) {
      for (const glsl of [mat.vertexShader, mat.fragmentShader]) {
        const smoothMatches = [
          ...glsl.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g),
        ];
        for (const m of smoothMatches) {
          expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
        const usedUniforms = new Set(glsl.match(/\bu[A-Z][A-Za-z0-9_]*/g) ?? []);
        for (const uName of usedUniforms) {
          expect(glsl).toMatch(
            new RegExp(`uniform\\s+(?:float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D)\\s+${uName}\\b`),
          );
          expect(mat.uniforms[uName]).toBeDefined();
        }
      }
    }

    const grassMesh = detail.getGroup().getObjectByName('InstancedGrass') as THREE.InstancedMesh;
    const grassMat = grassMesh.material as THREE.MeshStandardMaterial;
    const mockShader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '',
    };
    grassMat.onBeforeCompile(
      mockShader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(mockShader.vertexShader).toContain('uniform float uWindTime;');
    expect(mockShader.vertexShader).toContain('uniform float uWindStrength;');

    detail.dispose();
    interactables.dispose();
    storm.dispose();
    fx.dispose();
    builder.dispose();
    terrain.dispose();
  });
});
