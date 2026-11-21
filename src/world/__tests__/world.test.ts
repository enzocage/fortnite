import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  EventBus,
  ISLAND_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  POIS,
  STEP_HEIGHT,
  STORM_PHASES,
  WATER_LEVEL,
  WEAPONS,
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
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24);

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
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 23);
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
    expect(interactables.getColliders()).toHaveLength(15 + 6 + 24);

    interactables.dispose();
    builder.dispose();
    terrain.dispose();
  });
});

describe('VehicleSystem', () => {
  it('spawns 8 deterministic hover vehicles (4 hover_atv + 4 cyber_bike) clear of water and buildings', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'low');

    const vs1 = new VehicleSystem(terrain, undefined, 4201);
    const vs2 = new VehicleSystem(terrain, undefined, 4201);

    const v1 = vs1.getVehicles();
    const v2 = vs2.getVehicles();
    expect(v1).toHaveLength(8);
    expect(v2).toHaveLength(8);
    expect(v1.filter((v) => v.kind === 'hover_atv')).toHaveLength(4);
    expect(v1.filter((v) => v.kind === 'cyber_bike')).toHaveLength(4);
    expect(vs1.getGroup()).toBeInstanceOf(THREE.Group);
    expect(vs1.getActiveVehicleColliders()).toHaveLength(8);

    for (let i = 0; i < v1.length; i++) {
      expect(v1[i].id).toBe(v2[i].id);
      expect(v1[i].x).toBe(v2[i].x);
      expect(v1[i].z).toBe(v2[i].z);
      expect(terrain.isWater(v1[i].x, v1[i].z)).toBe(false);
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

  it('supports enter, driving, steering, boost VFX, water/lava hover float, exit, damage, spawn, and reset', () => {
    const terrain = new TerrainSystem(4201);
    const bus = new EventBus();
    const boostSpy = vi.fn();
    const explosionSpy = vi.fn();
    bus.on('vfx:vehicle_boost', boostSpy);
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
    expect(vs.getVehicles()).toHaveLength(9);
    expect(terrain.isWater(waterBike.x, waterBike.z)).toBe(true);
    expect(waterBike.y).toBeGreaterThan(WATER_LEVEL + 0.3);

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
    expect(vs.getActiveVehicleColliders()).toHaveLength(9);

    vs.reset();
    expect(vs.getVehicles()).toHaveLength(8);
    expect(vs.getVehicles().every((v) => !v.destroyed && v.hp === v.maxHp)).toBe(true);

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
