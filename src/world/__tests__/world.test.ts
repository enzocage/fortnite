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
  EnvironmentFX,
  PropsAndLoot,
  StormSystem,
  TerrainSystem,
  TextureFactory,
  WorldBuilder,
} from '../index';

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
});

describe('TerrainSystem', () => {
  it('generates deterministic island geometry and matches exact barycentric triangle heights', () => {
    const t1 = new TerrainSystem(4201);
    const t2 = new TerrainSystem(4201);
    expect(t1.getHeightAt(12.3, -44.7)).toBe(t2.getHeightAt(12.3, -44.7));

    const mesh = t1.getMesh();
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.receiveShadow).toBe(true);
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
        expect(t1.getHeightAt(vx, vz)).toBeCloseTo(vy, 5);
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

    // All 6 POIs returned
    const pois = terrain.getPOIs();
    expect(pois).toHaveLength(6);

    // Verify all 6 biome types can be sampled cleanly
    const sampledBiomes = new Set([
      terrain.getBiomeAt(ISLAND_RADIUS + 30, 0), // ocean
      terrain.getBiomeAt(-ISLAND_RADIUS + 18, 0), // beach (or shore near coast)
      terrain.getBiomeAt(0, 0), // grassland
      terrain.getBiomeAt(165, -165), // forest (Whispering Pines)
      terrain.getBiomeAt(40, 125), // highland (Crater Depot)
      terrain.getBiomeAt(-75, -40), // urban (Metro Towers)
    ]);
    expect(sampledBiomes.has('ocean')).toBe(true);
    expect(sampledBiomes.has('grassland')).toBe(true);
    expect(sampledBiomes.has('forest')).toBe(true);
    expect(sampledBiomes.has('highland')).toBe(true);
    expect(sampledBiomes.has('urban')).toBe(true);
    // Check beach band along coastline
    let foundBeach = false;
    for (let r = ISLAND_RADIUS - 35; r <= ISLAND_RADIUS + 5; r += 2) {
      if (terrain.getBiomeAt(r, 0) === 'beach') {
        foundBeach = true;
        break;
      }
    }
    expect(foundBeach).toBe(true);

    // Crystal Basin center island r <= 18 at y = 2.5, lake around r = 35 at y ~ -1.8
    const cb = pois.find((p) => p.id === 'crystal_basin')!;
    expect(terrain.getHeightAt(cb.x, cb.z)).toBeCloseTo(2.5, 2);
    expect(terrain.getHeightAt(cb.x + 14, cb.z)).toBeCloseTo(2.5, 2);
    expect(terrain.isWater(cb.x, cb.z)).toBe(false);

    const lakeY = terrain.getHeightAt(cb.x + 35, cb.z);
    expect(lakeY).toBeLessThan(-1.4);
    expect(lakeY).toBeGreaterThan(-2.1);
    expect(terrain.isWater(cb.x + 35, cb.z)).toBe(true);

    // Other 5 POIs sit on dry elevated plateaus
    for (const poi of pois) {
      if (poi.id === 'crystal_basin') continue;
      expect(terrain.getHeightAt(poi.x, poi.z)).toBeCloseTo(poi.plateauY, 2);
      expect(terrain.isWater(poi.x, poi.z)).toBe(false);
    }

    // Safe map canvas call both without and with DOM
    const nodeCanvas = terrain.getMapTextureCanvas();
    expect(nodeCanvas.width).toBe(512);
    expect(nodeCanvas.height).toBe(512);

    const restore = createMockCanvasEnvironment();
    try {
      terrain.setBuildingFootprints([
        { x: -75, z: -40, w: 12, d: 12, color: '#ef4444' },
      ]);
      const domCanvas = terrain.getMapTextureCanvas();
      expect(domCanvas.width).toBe(512);
      expect(domCanvas.height).toBe(512);
    } finally {
      restore();
    }

    terrain.dispose();
  });
});

describe('WorldBuilder', () => {
  it('builds walkable structures across all 6 POIs with valid colliders, stairs, and doorways', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const res = builder.build(terrain, 'high');

    expect(res.group.children.length).toBeGreaterThan(100);
    expect(res.colliders.length).toBeGreaterThan(150);
    expect(res.chestSpots.length).toBeGreaterThanOrEqual(35);
    expect(res.floorLootSpots.length).toBeGreaterThanOrEqual(60);
    expect(res.buildingFootprints.length).toBeGreaterThanOrEqual(15);

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
  it('populates 260+ props, 55+ chests, 100+ loot drops outside buildings and water', () => {
    const terrain = new TerrainSystem(4201);
    const builder = new WorldBuilder();
    const world = builder.build(terrain, 'medium');
    const bus = new EventBus();
    const pal = new PropsAndLoot(terrain, bus, 4201);

    pal.populate(world.chestSpots, world.floorLootSpots, world.colliders);

    const props = pal.getProps();
    const chests = pal.getChests();
    const loot = pal.getLootDrops();

    expect(props.length).toBeGreaterThanOrEqual(260);
    expect(chests.length).toBeGreaterThanOrEqual(55);
    expect(loot.length).toBeGreaterThanOrEqual(100);

    // Verify all 6 PropKinds exist
    const kinds = new Set(props.map((p) => p.kind));
    expect(kinds).toEqual(
      new Set(['tree_pine', 'tree_oak', 'rock', 'car', 'crate', 'fence']),
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
      (c) => c !== bus && c.name !== 'SkyDome' && c.name !== 'OceanWater',
    );
    expect(cloudGroup).toBeDefined();
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
});
