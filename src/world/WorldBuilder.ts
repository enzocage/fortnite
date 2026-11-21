import * as THREE from 'three';
import { POIS } from '../core';
import type {
  ColliderBox,
  GraphicsQuality,
  MaterialType,
  TerrainQuery,
} from '../types';
import { TextureFactory } from './TextureFactory';
import type { BuildingFootprint } from './TerrainSystem';

export interface ChestSpot {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export interface FloorLootSpot {
  x: number;
  y: number;
  z: number;
}

export interface WorldBuildResult {
  group: THREE.Group;
  colliders: ColliderBox[];
  chestSpots: ChestSpot[];
  floorLootSpots: FloorLootSpot[];
  buildingFootprints: BuildingFootprint[];
}

type Rot90 = 0 | 1 | 2 | 3;

interface BuildContext {
  group: THREE.Group;
  colliders: ColliderBox[];
  chestSpots: ChestSpot[];
  floorLootSpots: FloorLootSpot[];
  buildingFootprints: BuildingFootprint[];
  terrain: TerrainQuery;
  quality: GraphicsQuality;
  textures: TextureFactory;
  materials: Map<string, THREE.Material>;
  geometries: THREE.BufferGeometry[];
  boxGeo: THREE.BoxGeometry;
  cylGeo: THREE.CylinderGeometry;
  colliderCounter: number;
}

function getMat(
  ctx: BuildContext,
  key: string,
  factory: () => THREE.Material,
): THREE.Material {
  let mat = ctx.materials.get(key);
  if (!mat) {
    mat = factory();
    ctx.materials.set(key, mat);
  }
  return mat;
}

function solidColorMat(
  ctx: BuildContext,
  color: string,
  roughness = 0.78,
  metalness = 0.05,
): THREE.Material {
  return getMat(ctx, `solid:${color}:${roughness}:${metalness}`, () => {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });
  });
}

function texturedMat(
  ctx: BuildContext,
  key: string,
  getTex: () => THREE.Texture,
  roughness = 0.82,
  metalness = 0.08,
): THREE.Material {
  return getMat(ctx, `tex:${key}`, () => {
    return new THREE.MeshStandardMaterial({
      map: getTex(),
      roughness,
      metalness,
    });
  });
}

function transformLocal(
  ox: number,
  oy: number,
  oz: number,
  rot: Rot90,
  lx: number,
  ly: number,
  lz: number,
  sx: number,
  sy: number,
  sz: number,
): { wx: number; wy: number; wz: number; wsx: number; wsy: number; wsz: number } {
  let wx: number;
  let wz: number;
  let wsx: number;
  let wsz: number;
  switch (rot) {
    case 0:
      wx = ox + lx;
      wz = oz + lz;
      wsx = sx;
      wsz = sz;
      break;
    case 1:
      wx = ox + lz;
      wz = oz - lx;
      wsx = sz;
      wsz = sx;
      break;
    case 2:
      wx = ox - lx;
      wz = oz - lz;
      wsx = sx;
      wsz = sz;
      break;
    case 3:
      wx = ox - lz;
      wz = oz + lx;
      wsx = sz;
      wsz = sx;
      break;
  }
  return { wx, wy: oy + ly, wz, wsx, wsy: sy, wsz };
}

function transformPoint(
  ox: number,
  oy: number,
  oz: number,
  rot: Rot90,
  lx: number,
  ly: number,
  lz: number,
): { x: number; y: number; z: number } {
  const res = transformLocal(ox, oy, oz, rot, lx, ly, lz, 1, 1, 1);
  return { x: res.wx, y: res.wy, z: res.wz };
}

function addLocalBox(
  ctx: BuildContext,
  ox: number,
  oy: number,
  oz: number,
  rot: Rot90,
  lx: number,
  ly: number,
  lz: number,
  sx: number,
  sy: number,
  sz: number,
  material: THREE.Material,
  matType: MaterialType,
  tag: string,
  options: { collider?: boolean; castShadow?: boolean; receiveShadow?: boolean } = {},
): void {
  const { wx, wy, wz, wsx, wsy, wsz } = transformLocal(
    ox,
    oy,
    oz,
    rot,
    lx,
    ly,
    lz,
    sx,
    sy,
    sz,
  );
  const mesh = new THREE.Mesh(ctx.boxGeo, material);
  mesh.position.set(wx, wy, wz);
  mesh.scale.set(wsx, wsy, wsz);
  const allowCast =
    ctx.quality === 'high'
      ? options.castShadow !== false
      : ctx.quality === 'medium'
        ? options.castShadow === true
        : false;
  mesh.castShadow = allowCast;
  mesh.receiveShadow = options.receiveShadow !== false;
  ctx.group.add(mesh);

  if (options.collider !== false) {
    ctx.colliders.push({
      id: `wb_${++ctx.colliderCounter}`,
      minX: wx - wsx * 0.5,
      minY: wy - wsy * 0.5,
      minZ: wz - wsz * 0.5,
      maxX: wx + wsx * 0.5,
      maxY: wy + wsy * 0.5,
      maxZ: wz + wsz * 0.5,
      material: matType,
      tag,
    });
  }
}

function addWorldBox(
  ctx: BuildContext,
  wx: number,
  wy: number,
  wz: number,
  sx: number,
  sy: number,
  sz: number,
  material: THREE.Material,
  matType: MaterialType,
  tag: string,
  options: { collider?: boolean; castShadow?: boolean } = {},
): void {
  addLocalBox(ctx, wx, wy, wz, 0, 0, 0, 0, sx, sy, sz, material, matType, tag, options);
}

/**
 * Adds a wall segment along X (spanning [x1, x2] at z = wallZ) or along Z (spanning [z1, z2] at x = wallX),
 * with optional doorway opening (>= 2.2m wide, 2.6m tall) or window openings.
 */
function addWallWithOpening(
  ctx: BuildContext,
  ox: number,
  oy: number,
  oz: number,
  rot: Rot90,
  axis: 'x' | 'z',
  fixedCoord: number,
  start: number,
  end: number,
  baseY: number,
  wallH: number,
  wallT: number,
  material: THREE.Material,
  glassMat: THREE.Material,
  matType: MaterialType,
  tag: string,
  opening:
    | { kind: 'none' }
    | { kind: 'door'; center: number; width: number; height: number }
    | { kind: 'window'; center: number; width: number; sill: number; head: number },
): void {
  const placeSegment = (s: number, e: number, yMin: number, yMax: number, coll = true, m = material) => {
    const len = e - s;
    const h = yMax - yMin;
    if (len <= 0.05 || h <= 0.05) return;
    const mid = (s + e) * 0.5;
    const midY = (yMin + yMax) * 0.5;
    if (axis === 'x') {
      addLocalBox(ctx, ox, oy, oz, rot, mid, midY, fixedCoord, len, h, wallT, m, matType, tag, {
        collider: coll,
        castShadow: true,
      });
    } else {
      addLocalBox(ctx, ox, oy, oz, rot, fixedCoord, midY, mid, wallT, h, len, m, matType, tag, {
        collider: coll,
        castShadow: true,
      });
    }
  };

  if (opening.kind === 'none') {
    placeSegment(start, end, baseY, baseY + wallH);
    return;
  }

  if (opening.kind === 'door') {
    const half = opening.width * 0.5;
    const oStart = Math.max(start, opening.center - half);
    const oEnd = Math.min(end, opening.center + half);
    placeSegment(start, oStart, baseY, baseY + wallH);
    placeSegment(oEnd, end, baseY, baseY + wallH);
    placeSegment(oStart, oEnd, baseY + opening.height, baseY + wallH);
    return;
  }

  // Window opening: solid lower sill, piers, upper lintel, and non-blocking translucent glass
  const half = opening.width * 0.5;
  const oStart = Math.max(start, opening.center - half);
  const oEnd = Math.min(end, opening.center + half);
  placeSegment(start, oStart, baseY, baseY + wallH);
  placeSegment(oEnd, end, baseY, baseY + wallH);
  placeSegment(oStart, oEnd, baseY, baseY + opening.sill);
  placeSegment(oStart, oEnd, baseY + opening.head, baseY + wallH);
  // Thin glass pane (no collider so players can shoot through windows, sill+lintel prevent walking out)
  const glassMid = (oStart + oEnd) * 0.5;
  const glassY = baseY + (opening.sill + opening.head) * 0.5;
  const glassH = opening.head - opening.sill;
  const glassW = oEnd - oStart;
  if (axis === 'x') {
    addLocalBox(ctx, ox, oy, oz, rot, glassMid, glassY, fixedCoord, glassW, glassH, 0.08, glassMat, matType, tag, {
      collider: false,
      castShadow: false,
    });
  } else {
    addLocalBox(ctx, ox, oy, oz, rot, fixedCoord, glassY, glassMid, 0.08, glassH, glassW, glassMat, matType, tag, {
      collider: false,
      castShadow: false,
    });
  }
}

/**
 * Adds a floor slab spanning [xMin, xMax] x [zMin, zMax] with an optional rectangular stairwell hole.
 */
function addFloorWithStairHole(
  ctx: BuildContext,
  ox: number,
  oy: number,
  oz: number,
  rot: Rot90,
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number,
  topY: number,
  thickness: number,
  material: THREE.Material,
  matType: MaterialType,
  tag: string,
  hole?: { xMin: number; xMax: number; zMin: number; zMax: number },
): void {
  const cy = topY - thickness * 0.5;
  const addPiece = (ax: number, bx: number, az: number, bz: number) => {
    const w = bx - ax;
    const d = bz - az;
    if (w <= 0.05 || d <= 0.05) return;
    addLocalBox(
      ctx,
      ox,
      oy,
      oz,
      rot,
      (ax + bx) * 0.5,
      cy,
      (az + bz) * 0.5,
      w,
      thickness,
      d,
      material,
      matType,
      tag,
      { collider: true, castShadow: true },
    );
  };

  if (!hole) {
    addPiece(xMin, xMax, zMin, zMax);
    return;
  }

  const hx0 = Math.max(xMin, hole.xMin);
  const hx1 = Math.min(xMax, hole.xMax);
  const hz0 = Math.max(zMin, hole.zMin);
  const hz1 = Math.min(zMax, hole.zMax);

  // Split around stairwell hole cleanly without overlapping colliders
  addPiece(xMin, hx0, zMin, zMax);
  addPiece(hx1, xMax, zMin, zMax);
  addPiece(hx0, hx1, zMin, hz0);
  addPiece(hx0, hx1, hz1, zMax);
}

/**
 * Builds an interior staircase of individual step boxes (each <= 0.42m tall <= STEP_HEIGHT 0.55m).
 * Climb runs along +Z or -Z or +X or -X from baseY up to topY.
 */
function addStaircase(
  ctx: BuildContext,
  ox: number,
  oy: number,
  oz: number,
  rot: Rot90,
  startX: number,
  startZ: number,
  runAxis: 'x' | 'z',
  runDir: 1 | -1,
  runLength: number,
  width: number,
  baseY: number,
  topY: number,
  steps: number,
  material: THREE.Material,
  matType: MaterialType,
  tag: string,
): void {
  const totalRise = topY - baseY;
  const stepRise = totalRise / steps;
  const stepRun = runLength / steps;

  for (let i = 0; i < steps; i++) {
    const stepTop = baseY + (i + 1) * stepRise;
    const stepH = Math.max(0.2, stepRise + 0.04);
    const cy = stepTop - stepH * 0.5;
    const offset = (i + 0.5) * stepRun * runDir;
    if (runAxis === 'z') {
      addLocalBox(
        ctx,
        ox,
        oy,
        oz,
        rot,
        startX,
        cy,
        startZ + offset,
        width,
        stepH,
        stepRun + 0.04,
        material,
        matType,
        tag,
        { collider: true, castShadow: false },
      );
    } else {
      addLocalBox(
        ctx,
        ox,
        oy,
        oz,
        rot,
        startX + offset,
        cy,
        startZ,
        stepRun + 0.04,
        stepH,
        width,
        material,
        matType,
        tag,
        { collider: true, castShadow: false },
      );
    }
  }
}

function addStreetLamp(ctx: BuildContext, x: number, z: number): void {
  const y = ctx.terrain.getHeightAt(x, z);
  const poleMat = solidColorMat(ctx, '#1e293b', 0.45, 0.7);
  const bulbMat = getMat(ctx, 'lamp_bulb', () => {
    return new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#fbbf24',
      emissiveIntensity: 1.4,
      roughness: 0.25,
    });
  });

  addWorldBox(ctx, x, y + 2.4, z, 0.22, 4.8, 0.22, poleMat, 'metal', 'building_lamp', {
    collider: true,
    castShadow: ctx.quality === 'high',
  });
  addWorldBox(ctx, x + 0.55, y + 4.7, z, 1.2, 0.16, 0.22, poleMat, 'metal', 'building_lamp', {
    collider: false,
    castShadow: false,
  });
  addWorldBox(ctx, x + 0.95, y + 4.55, z, 0.42, 0.14, 0.28, bulbMat, 'metal', 'building_lamp', {
    collider: false,
    castShadow: false,
  });
}

/**
 * Multi-story walkable urban/suburban building with open doorways, stairs to all upper floors & roof,
 * interior floors, windows, parapet walls or pitched roof, and chest/loot placements.
 */
function buildWalkableBuilding(
  ctx: BuildContext,
  opts: {
    x: number;
    z: number;
    rot: Rot90;
    w: number;
    d: number;
    stories: number;
    wallMat: THREE.Material;
    trimMat: THREE.Material;
    floorMat: THREE.Material;
    roofMat: THREE.Material;
    matType: MaterialType;
    footprintColor: string;
    roofStyle: 'flat_parapet' | 'gable';
    backDoor?: boolean;
    porch?: boolean;
    addChestOnRoof?: boolean;
    addChestTopFloor?: boolean;
  },
): void {
  const baseY = ctx.terrain.getHeightAt(opts.x, opts.z);
  const glassMat = getMat(ctx, 'window_glass', () => {
    return new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.42,
      roughness: 0.15,
      metalness: 0.35,
    });
  });

  const hw = opts.w * 0.5;
  const hd = opts.d * 0.5;
  const wallT = 0.36;
  const floorH = 3.2;
  const slabT = 0.24;
  const foundationH = 0.22;

  const footprintW = opts.rot % 2 === 0 ? opts.w : opts.d;
  const footprintD = opts.rot % 2 === 0 ? opts.d : opts.w;
  ctx.buildingFootprints.push({
    x: opts.x,
    z: opts.z,
    w: footprintW,
    d: footprintD,
    color: opts.footprintColor,
  });

  // Ground foundation slab (top at foundationH = 0.22m <= STEP_HEIGHT 0.55m)
  addLocalBox(
    ctx,
    opts.x,
    baseY,
    opts.z,
    opts.rot,
    0,
    foundationH * 0.5,
    0,
    opts.w,
    foundationH,
    opts.d,
    opts.floorMat,
    opts.matType,
    'building_floor',
    { collider: true, castShadow: false },
  );

  // Optional front porch
  if (opts.porch) {
    addLocalBox(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      0,
      foundationH * 0.5,
      hd + 1.2,
      opts.w * 0.72,
      foundationH,
      2.4,
      opts.floorMat,
      'wood',
      'building_porch',
      { collider: true, castShadow: false },
    );
    // Porch columns
    for (const px of [-opts.w * 0.32, opts.w * 0.32]) {
      addLocalBox(
        ctx,
        opts.x,
        baseY,
        opts.z,
        opts.rot,
        px,
        foundationH + 1.4,
        hd + 2.1,
        0.24,
        2.8,
        0.24,
        opts.trimMat,
        'wood',
        'building_porch',
        { collider: true, castShadow: true },
      );
    }
    // Porch roof awning
    addLocalBox(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      0,
      foundationH + 2.9,
      hd + 1.2,
      opts.w * 0.78,
      0.22,
      2.6,
      opts.roofMat,
      opts.matType,
      'building_roof',
      { collider: true, castShadow: true },
    );
  }

  // Stairwell strip along the West interior side (lx in [-hw + 0.4, -hw + 2.8])
  const stairWidth = 2.2;
  const stairCenterX = -hw + wallT + stairWidth * 0.5 + 0.05;
  const stairHole = {
    xMin: stairCenterX - stairWidth * 0.5 - 0.1,
    xMax: stairCenterX + stairWidth * 0.5 + 0.1,
    zMin: -2.4,
    zMax: 2.6,
  };

  for (let s = 0; s < opts.stories; s++) {
    const storyBase = foundationH + s * floorH;
    const isGround = s === 0;
    const storyTop = storyBase + floorH;

    // South wall (front, z = +hd)
    addWallWithOpening(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      'x',
      hd - wallT * 0.5,
      -hw,
      hw,
      storyBase,
      floorH,
      wallT,
      opts.wallMat,
      glassMat,
      opts.matType,
      'building_wall',
      isGround
        ? { kind: 'door', center: 1.0, width: 2.4, height: 2.65 }
        : { kind: 'window', center: 1.0, width: 2.6, sill: 1.05, head: 2.35 },
    );

    // North wall (back, z = -hd)
    addWallWithOpening(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      'x',
      -hd + wallT * 0.5,
      -hw,
      hw,
      storyBase,
      floorH,
      wallT,
      opts.wallMat,
      glassMat,
      opts.matType,
      'building_wall',
      isGround && opts.backDoor
        ? { kind: 'door', center: 0.8, width: 2.3, height: 2.65 }
        : { kind: 'window', center: 0.8, width: 2.6, sill: 1.05, head: 2.35 },
    );

    // East wall (x = +hw)
    addWallWithOpening(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      'z',
      hw - wallT * 0.5,
      -hd + wallT,
      hd - wallT,
      storyBase,
      floorH,
      wallT,
      opts.wallMat,
      glassMat,
      opts.matType,
      'building_wall',
      { kind: 'window', center: 0, width: Math.min(3.2, opts.d * 0.35), sill: 1.05, head: 2.35 },
    );

    // West wall (x = -hw)
    addWallWithOpening(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      'z',
      -hw + wallT * 0.5,
      -hd + wallT,
      hd - wallT,
      storyBase,
      floorH,
      wallT,
      opts.wallMat,
      glassMat,
      opts.matType,
      'building_wall',
      { kind: 'window', center: 0, width: 2.2, sill: 1.1, head: 2.35 },
    );

    // Corner trim pillars
    for (const cx of [-hw + 0.16, hw - 0.16]) {
      for (const cz of [-hd + 0.16, hd - 0.16]) {
        addLocalBox(
          ctx,
          opts.x,
          baseY,
          opts.z,
          opts.rot,
          cx,
          storyBase + floorH * 0.5,
          cz,
          0.42,
          floorH,
          0.42,
          opts.trimMat,
          opts.matType,
          'building_trim',
          { collider: false, castShadow: false },
        );
      }
    }

    // Staircase rising to next floor (or roof if flat_parapet)
    const hasUpperWalkable = s < opts.stories - 1 || opts.roofStyle === 'flat_parapet';
    if (hasUpperWalkable) {
      const runDir: 1 | -1 = s % 2 === 0 ? -1 : 1;
      const stairStartZ = runDir === -1 ? 2.4 : -2.2;
      addStaircase(
        ctx,
        opts.x,
        baseY,
        opts.z,
        opts.rot,
        stairCenterX,
        stairStartZ,
        'z',
        runDir,
        4.6,
        stairWidth,
        storyBase,
        storyTop,
        8,
        opts.floorMat,
        opts.matType,
        'building_stair',
      );
    }

    // Ceiling / upper floor slab
    addFloorWithStairHole(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      -hw,
      hw,
      -hd,
      hd,
      storyTop,
      slabT,
      s === opts.stories - 1 ? opts.roofMat : opts.floorMat,
      opts.matType,
      s === opts.stories - 1 ? 'building_roof' : 'building_floor',
      hasUpperWalkable ? stairHole : undefined,
    );

    // Interior floor loot spots per story
    const lootPt1 = transformPoint(opts.x, baseY, opts.z, opts.rot, 1.8, storyBase + 0.05, 0.8);
    ctx.floorLootSpots.push(lootPt1);
    if (opts.w >= 11) {
      const lootPt2 = transformPoint(opts.x, baseY, opts.z, opts.rot, 1.5, storyBase + 0.05, -2.0);
      ctx.floorLootSpots.push(lootPt2);
    }
  }

  const roofTopY = foundationH + opts.stories * floorH;
  if (opts.roofStyle === 'flat_parapet') {
    // Low roof parapet walls (1.0m high, leaving room over stair exit)
    const pH = 0.95;
    const pT = 0.3;
    addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, 0, roofTopY + pH * 0.5, hd - pT * 0.5, opts.w, pH, pT, opts.trimMat, opts.matType, 'building_roof');
    addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, 0, roofTopY + pH * 0.5, -hd + pT * 0.5, opts.w, pH, pT, opts.trimMat, opts.matType, 'building_roof');
    addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, hw - pT * 0.5, roofTopY + pH * 0.5, 0, pT, pH, opts.d - pT * 2, opts.trimMat, opts.matType, 'building_roof');
    addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, -hw + pT * 0.5, roofTopY + pH * 0.5, 0, pT, pH, opts.d - pT * 2, opts.trimMat, opts.matType, 'building_roof');

    if (opts.addChestOnRoof !== false) {
      const cp = transformPoint(opts.x, baseY, opts.z, opts.rot, hw - 1.8, roofTopY, -hd + 1.8);
      ctx.chestSpots.push({ ...cp, rotationY: (opts.rot * Math.PI) / 2 });
    }
    const rl = transformPoint(opts.x, baseY, opts.z, opts.rot, 1.2, roofTopY + 0.05, 1.2);
    ctx.floorLootSpots.push(rl);
  } else {
    // Stepped gable roof (walkable stepped pyramid tiers so players can land & stand on house roofs!)
    const tiers = 4;
    const tierH = 0.5;
    for (let t = 0; t < tiers; t++) {
      const shrink = t * 1.4;
      const rw = Math.max(2.0, opts.w + 0.8 - shrink * 1.5);
      const rd = Math.max(2.0, opts.d + 0.8 - shrink * 1.5);
      addLocalBox(
        ctx,
        opts.x,
        baseY,
        opts.z,
        opts.rot,
        0,
        roofTopY + t * tierH + tierH * 0.5,
        0,
        rw,
        tierH,
        rd,
        opts.roofMat,
        opts.matType,
        'building_roof',
        { collider: true, castShadow: true },
      );
    }
    // Brick chimney
    const chimneyMat = texturedMat(ctx, 'brick', () => ctx.textures.getBrickTexture());
    addLocalBox(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      hw - 1.4,
      roofTopY + 1.6,
      -hd + 1.4,
      1.1,
      3.2,
      1.1,
      chimneyMat,
      'brick',
      'building_roof',
      { collider: true, castShadow: true },
    );
  }

  if (opts.addChestTopFloor !== false) {
    const topFloorY = foundationH + (opts.stories - 1) * floorH;
    const cp = transformPoint(opts.x, baseY, opts.z, opts.rot, hw - 1.7, topFloorY, -hd + 1.7);
    ctx.chestSpots.push({ ...cp, rotationY: (opts.rot * Math.PI) / 2 + Math.PI });
  }
}

function buildMetroTowers(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'metro_towers')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  const brickMat = texturedMat(ctx, 'brick', () => ctx.textures.getBrickTexture());
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const blueSiding = texturedMat(ctx, 'siding:#3b82f6', () => ctx.textures.getSidingTexture('#3b82f6'));
  const yellowSiding = texturedMat(ctx, 'siding:#eab308', () => ctx.textures.getSidingTexture('#eab308'));
  const roofSlate = texturedMat(ctx, 'roof:#334155', () => ctx.textures.getRoofTexture('#334155'));
  const trimDark = solidColorMat(ctx, '#1e293b', 0.65, 0.25);
  const plazaMat = solidColorMat(ctx, '#94a3b8', 0.9, 0.05);

  // Central paved plaza pad
  addWorldBox(ctx, poi.x, baseY + 0.05, poi.z, 22, 0.1, 22, plazaMat, 'brick', 'building_plaza', {
    collider: false,
    castShadow: false,
  });

  // 1. Clock Tower (North-West corner of Metro Towers)
  buildWalkableBuilding(ctx, {
    x: poi.x - 19,
    z: poi.z - 16,
    rot: 0,
    w: 10,
    d: 10,
    stories: 3,
    wallMat: brickMat,
    trimMat: trimDark,
    floorMat: woodMat,
    roofMat: roofSlate,
    matType: 'brick',
    footprintColor: '#c25943',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });
  // Clock Tower spire & golden clock face on top
  const towerY = ctx.terrain.getHeightAt(poi.x - 19, poi.z - 16) + 0.22 + 3 * 3.2;
  const clockGold = solidColorMat(ctx, '#facc15', 0.35, 0.4);
  addWorldBox(ctx, poi.x - 19, towerY + 2.2, poi.z - 16, 4.2, 4.4, 4.2, brickMat, 'brick', 'building_tower');
  addWorldBox(ctx, poi.x - 19, towerY + 2.8, poi.z - 16 + 2.15, 2.2, 2.2, 0.16, clockGold, 'metal', 'building_tower', { collider: false });
  addWorldBox(ctx, poi.x - 19, towerY + 2.8, poi.z - 16 - 2.15, 2.2, 2.2, 0.16, clockGold, 'metal', 'building_tower', { collider: false });
  addWorldBox(ctx, poi.x - 19, towerY + 5.6, poi.z - 16, 2.6, 2.4, 2.6, roofSlate, 'metal', 'building_tower');

  // 2. Blue Glass High-Rise (North-East)
  buildWalkableBuilding(ctx, {
    x: poi.x + 18,
    z: poi.z - 16,
    rot: 0,
    w: 14,
    d: 11,
    stories: 3,
    wallMat: blueSiding,
    trimMat: metalMat,
    floorMat: metalMat,
    roofMat: roofSlate,
    matType: 'metal',
    footprintColor: '#3b82f6',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  // 3. Red Brick Apartments (South-West)
  buildWalkableBuilding(ctx, {
    x: poi.x - 18,
    z: poi.z + 18,
    rot: 2,
    w: 14,
    d: 11,
    stories: 2,
    wallMat: brickMat,
    trimMat: trimDark,
    floorMat: woodMat,
    roofMat: roofSlate,
    matType: 'brick',
    footprintColor: '#b91c1c',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  // 4. Golden Corner Pawn Shop (South-East)
  buildWalkableBuilding(ctx, {
    x: poi.x + 17,
    z: poi.z + 17,
    rot: 3,
    w: 11,
    d: 10,
    stories: 2,
    wallMat: yellowSiding,
    trimMat: trimDark,
    floorMat: woodMat,
    roofMat: roofSlate,
    matType: 'wood',
    footprintColor: '#eab308',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: false,
  });

  // Plaza fountain centerpiece + street lamps
  const stoneMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());
  const waterGlow = solidColorMat(ctx, '#38bdf8', 0.2, 0.1);
  addWorldBox(ctx, poi.x, baseY + 0.35, poi.z, 5.2, 0.7, 5.2, stoneMat, 'brick', 'building_fountain');
  addWorldBox(ctx, poi.x, baseY + 0.75, poi.z, 4.2, 0.15, 4.2, waterGlow, 'brick', 'building_fountain', { collider: false });
  addWorldBox(ctx, poi.x, baseY + 1.5, poi.z, 1.2, 1.6, 1.2, stoneMat, 'brick', 'building_fountain');
  ctx.floorLootSpots.push({ x: poi.x + 3.4, y: baseY + 0.1, z: poi.z });

  for (const [lx, lz] of [
    [poi.x - 10, poi.z - 6],
    [poi.x + 10, poi.z - 6],
    [poi.x - 10, poi.z + 8],
    [poi.x + 10, poi.z + 8],
  ]) {
    addStreetLamp(ctx, lx, lz);
  }
}

function buildSunnySuburbs(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'sunny_suburbs')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const trimWhite = solidColorMat(ctx, '#f8fafc', 0.7, 0.05);

  const houseDefs: Array<{
    dx: number;
    dz: number;
    rot: Rot90;
    siding: string;
    roof: string;
  }> = [
    { dx: -18, dz: -18, rot: 0, siding: '#6ee7b7', roof: '#334155' },
    { dx: 18, dz: -18, rot: 0, siding: '#7dd3fc', roof: '#1e3a8a' },
    { dx: -18, dz: 18, rot: 2, siding: '#fda4af', roof: '#7f1d1d' },
    { dx: 18, dz: 18, rot: 2, siding: '#fde047', roof: '#78350f' },
  ];

  for (const h of houseDefs) {
    const wallMat = texturedMat(ctx, `siding:${h.siding}`, () => ctx.textures.getSidingTexture(h.siding));
    const roofMat = texturedMat(ctx, `roof:${h.roof}`, () => ctx.textures.getRoofTexture(h.roof));
    buildWalkableBuilding(ctx, {
      x: poi.x + h.dx,
      z: poi.z + h.dz,
      rot: h.rot,
      w: 11,
      d: 10,
      stories: 2,
      wallMat,
      trimMat: trimWhite,
      floorMat: woodMat,
      roofMat,
      matType: 'wood',
      footprintColor: h.siding,
      roofStyle: 'gable',
      backDoor: true,
      porch: true,
      addChestOnRoof: false,
      addChestTopFloor: true,
    });
  }

  // Soccer Field on the South/West side of Sunny Suburbs
  const pitchX = poi.x;
  const pitchZ = poi.z + 1;
  const pitchY = ctx.terrain.getHeightAt(pitchX, pitchZ);
  const turfMat = texturedMat(ctx, 'grass', () => ctx.textures.getGrassTexture());
  const lineMat = solidColorMat(ctx, '#ffffff', 0.85, 0);
  const goalMat = solidColorMat(ctx, '#f1f5f9', 0.4, 0.5);

  // Pitch turf pad (kept flat & flush with terrain)
  addWorldBox(ctx, pitchX, pitchY + 0.04, pitchZ, 18, 0.08, 12, turfMat, 'wood', 'building_soccer', {
    collider: false,
    castShadow: false,
  });
  // Crisp white sidelines & midfield line
  addWorldBox(ctx, pitchX, pitchY + 0.09, pitchZ - 5.7, 17.6, 0.03, 0.22, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX, pitchY + 0.09, pitchZ + 5.7, 17.6, 0.03, 0.22, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX - 8.7, pitchY + 0.09, pitchZ, 0.22, 0.03, 11.4, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX + 8.7, pitchY + 0.09, pitchZ, 0.22, 0.03, 11.4, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX, pitchY + 0.09, pitchZ, 0.22, 0.03, 11.4, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });

  // Two 3D Soccer Goals (East & West ends)
  for (const dir of [-1, 1]) {
    const gx = pitchX + dir * 8.8;
    // Left & right goal posts
    addWorldBox(ctx, gx, pitchY + 1.2, pitchZ - 2.2, 0.18, 2.4, 0.18, goalMat, 'metal', 'building_goal');
    addWorldBox(ctx, gx, pitchY + 1.2, pitchZ + 2.2, 0.18, 2.4, 0.18, goalMat, 'metal', 'building_goal');
    // Crossbar
    addWorldBox(ctx, gx, pitchY + 2.38, pitchZ, 0.18, 0.18, 4.58, goalMat, 'metal', 'building_goal');
    // Back support frame
    addWorldBox(ctx, gx + dir * 1.1, pitchY + 0.1, pitchZ, 2.2, 0.16, 4.5, goalMat, 'metal', 'building_goal', { collider: false });
  }

  ctx.chestSpots.push({ x: pitchX, y: pitchY + 0.08, z: pitchZ - 4.4, rotationY: 0 });
  ctx.floorLootSpots.push({ x: pitchX, y: pitchY + 0.08, z: pitchZ });
  ctx.floorLootSpots.push({ x: pitchX - 5, y: pitchY + 0.08, z: pitchZ + 2 });

  addStreetLamp(ctx, poi.x - 10, baseY > 0 ? poi.z - 9 : poi.z - 9);
  addStreetLamp(ctx, poi.x + 10, poi.z + 9);
}

function buildCrystalBasin(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'crystal_basin')!;
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const barkMat = texturedMat(ctx, 'bark', () => ctx.textures.getBarkTexture());
  const roofMat = texturedMat(ctx, 'roof:#0ea5e9', () => ctx.textures.getRoofTexture('#0ea5e9'));
  const stoneMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());

  // 1. Central Island Pavilion (center island r <= 18 is at y = 2.5)
  const islandY = ctx.terrain.getHeightAt(poi.x, poi.z);
  const deckH = 0.35;
  addWorldBox(ctx, poi.x, islandY + deckH * 0.5, poi.z, 9.0, deckH, 9.0, woodMat, 'wood', 'building_gazebo');
  ctx.buildingFootprints.push({ x: poi.x, z: poi.z, w: 9, d: 9, color: '#0ea5e9' });

  // 4 corner pavilion posts
  for (const ox of [-3.8, 3.8]) {
    for (const oz of [-3.8, 3.8]) {
      addWorldBox(ctx, poi.x + ox, islandY + deckH + 1.6, poi.z + oz, 0.42, 3.2, 0.42, barkMat, 'wood', 'building_gazebo');
    }
  }
  // Stepped pagoda roof
  addWorldBox(ctx, poi.x, islandY + deckH + 3.4, poi.z, 10.2, 0.4, 10.2, roofMat, 'wood', 'building_roof');
  addWorldBox(ctx, poi.x, islandY + deckH + 3.9, poi.z, 7.0, 0.45, 7.0, roofMat, 'wood', 'building_roof');
  addWorldBox(ctx, poi.x, islandY + deckH + 4.4, poi.z, 3.8, 0.5, 3.8, roofMat, 'wood', 'building_roof');

  ctx.chestSpots.push({ x: poi.x - 1.5, y: islandY + deckH, z: poi.z, rotationY: Math.PI * 0.5 });
  ctx.chestSpots.push({ x: poi.x + 1.5, y: islandY + deckH, z: poi.z, rotationY: -Math.PI * 0.5 });
  ctx.floorLootSpots.push({ x: poi.x, y: islandY + deckH, z: poi.z + 2.4 });
  ctx.floorLootSpots.push({ x: poi.x, y: islandY + deckH, z: poi.z - 2.4 });

  // 2. Walkable West Timber Bridge connecting west shore (x = -29) onto central island (x = +11)
  const dockY = 0.75;
  const bridgeLen = 40;
  const bridgeCenterX = poi.x - 34; // spans [poi.x - 54, poi.x - 14]
  addWorldBox(ctx, bridgeCenterX, dockY, poi.z, bridgeLen, 0.3, 3.6, woodMat, 'wood', 'building_dock');
  ctx.buildingFootprints.push({ x: bridgeCenterX, z: poi.z, w: bridgeLen, d: 3.6, color: '#b97a45' });
  // Support pilings into lakebed
  for (let px = poi.x - 52; px <= poi.x - 16; px += 6) {
    for (const pz of [poi.z - 1.5, poi.z + 1.5]) {
      addWorldBox(ctx, px, -0.8, pz, 0.34, 3.2, 0.34, barkMat, 'wood', 'building_dock');
    }
  }
  // Stepped bridge ramp onto island (x = poi.x - 14 -> poi.x - 10, climbing 0.75 -> 2.5)
  addStaircase(ctx, poi.x - 14, dockY, poi.z, 0, 0, 0, 'x', 1, 5.0, 3.6, 0, islandY - dockY, 5, woodMat, 'wood', 'building_dock');
  ctx.floorLootSpots.push({ x: bridgeCenterX, y: dockY + 0.15, z: poi.z });

  // 3. North Pier Dock (z = -170 -> -142)
  const northDockZ = poi.z - 42;
  addWorldBox(ctx, poi.x, dockY, northDockZ, 4.2, 0.3, 24, woodMat, 'wood', 'building_dock');
  for (let pz = northDockZ - 10; pz <= northDockZ + 10; pz += 5) {
    for (const px of [poi.x - 1.8, poi.x + 1.8]) {
      addWorldBox(ctx, px, -0.8, pz, 0.32, 3.2, 0.32, barkMat, 'wood', 'building_dock');
    }
  }
  ctx.chestSpots.push({ x: poi.x, y: dockY + 0.15, z: northDockZ + 10, rotationY: Math.PI });
  ctx.floorLootSpots.push({ x: poi.x, y: dockY + 0.15, z: northDockZ - 4 });

  // 4. East Boathouse Cabin on East Shore
  const cabinX = poi.x + 62;
  const cabinZ = poi.z;
  buildWalkableBuilding(ctx, {
    x: cabinX,
    z: cabinZ,
    rot: 3,
    w: 9,
    d: 8,
    stories: 1,
    wallMat: woodMat,
    trimMat: stoneMat,
    floorMat: woodMat,
    roofMat,
    matType: 'wood',
    footprintColor: '#a16207',
    roofStyle: 'gable',
    backDoor: true,
    porch: false,
    addChestOnRoof: false,
    addChestTopFloor: true,
  });

  // East Dock extending west from boathouse
  addWorldBox(ctx, poi.x + 48, dockY, poi.z, 16, 0.3, 3.6, woodMat, 'wood', 'building_dock');
  ctx.chestSpots.push({ x: poi.x + 42, y: dockY + 0.15, z: poi.z, rotationY: -Math.PI * 0.5 });
}

function buildMarketRow(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'market_row')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  const brickMat = texturedMat(ctx, 'brick', () => ctx.textures.getBrickTexture());
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());
  const dinerSiding = texturedMat(ctx, 'siding:#ef4444', () => ctx.textures.getSidingTexture('#ef4444'));
  const grocerySiding = texturedMat(ctx, 'siding:#2563eb', () => ctx.textures.getSidingTexture('#2563eb'));
  const roofDark = texturedMat(ctx, 'roof:#1e293b', () => ctx.textures.getRoofTexture('#1e293b'));
  const trimGold = solidColorMat(ctx, '#facc15', 0.45, 0.2);

  // Parking lot asphalt pad
  const roadMat = texturedMat(ctx, 'road', () => ctx.textures.getRoadTexture());
  addWorldBox(ctx, poi.x, baseY + 0.04, poi.z, 34, 0.08, 16, roadMat, 'brick', 'building_parking', {
    collider: false,
    castShadow: false,
  });

  // 1. Durr Burger Diner (North-West)
  buildWalkableBuilding(ctx, {
    x: poi.x - 14,
    z: poi.z - 16,
    rot: 0,
    w: 14,
    d: 10,
    stories: 2,
    wallMat: dinerSiding,
    trimMat: trimGold,
    floorMat: woodMat,
    roofMat: roofDark,
    matType: 'brick',
    footprintColor: '#ef4444',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });
  // Iconic Burger Mascot Sign on Diner roof!
  const dinerTopY = ctx.terrain.getHeightAt(poi.x - 14, poi.z - 16) + 0.22 + 2 * 3.2;
  const bunMat = solidColorMat(ctx, '#f59e0b', 0.7, 0.05);
  const pattyMat = solidColorMat(ctx, '#78350f', 0.85, 0.05);
  const lettuceMat = solidColorMat(ctx, '#22c55e', 0.7, 0.05);
  addWorldBox(ctx, poi.x - 14, dinerTopY + 1.2, poi.z - 14, 3.2, 0.6, 3.2, bunMat, 'wood', 'building_sign');
  addWorldBox(ctx, poi.x - 14, dinerTopY + 1.75, poi.z - 14, 3.0, 0.45, 3.0, pattyMat, 'wood', 'building_sign');
  addWorldBox(ctx, poi.x - 14, dinerTopY + 2.1, poi.z - 14, 3.25, 0.25, 3.25, lettuceMat, 'wood', 'building_sign');
  addWorldBox(ctx, poi.x - 14, dinerTopY + 2.55, poi.z - 14, 3.1, 0.65, 3.1, bunMat, 'wood', 'building_sign');

  // 2. Noms Grocery Store (North-East)
  buildWalkableBuilding(ctx, {
    x: poi.x + 14,
    z: poi.z - 16,
    rot: 0,
    w: 14,
    d: 10,
    stories: 2,
    wallMat: grocerySiding,
    trimMat: metalMat,
    floorMat: metalMat,
    roofMat: roofDark,
    matType: 'brick',
    footprintColor: '#2563eb',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  // 3. Corner Brick Cafe & Apartments (South-West)
  buildWalkableBuilding(ctx, {
    x: poi.x - 14,
    z: poi.z + 16,
    rot: 2,
    w: 12,
    d: 10,
    stories: 2,
    wallMat: brickMat,
    trimMat: trimGold,
    floorMat: woodMat,
    roofMat: roofDark,
    matType: 'brick',
    footprintColor: '#c25943',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  // 4. Roadside Gas Canopy + Convenience Booth (South-East)
  const gasX = poi.x + 14;
  const gasZ = poi.z + 15;
  const canopyMat = solidColorMat(ctx, '#f97316', 0.55, 0.2);
  addWorldBox(ctx, gasX, baseY + 3.6, gasZ, 11, 0.5, 8, canopyMat, 'metal', 'building_canopy');
  ctx.buildingFootprints.push({ x: gasX, z: gasZ, w: 11, d: 8, color: '#f97316' });
  for (const px of [-4.6, 4.6]) {
    for (const pz of [-3.2, 3.2]) {
      addWorldBox(ctx, gasX + px, baseY + 1.8, gasZ + pz, 0.45, 3.6, 0.45, metalMat, 'metal', 'building_canopy');
    }
  }
  // Fuel pump islands
  for (const px of [-2.2, 2.2]) {
    addWorldBox(ctx, gasX + px, baseY + 0.85, gasZ, 0.9, 1.7, 0.8, dinerSiding, 'metal', 'building_pump');
  }
  ctx.chestSpots.push({ x: gasX, y: baseY + 3.85, z: gasZ, rotationY: 0 });
  ctx.floorLootSpots.push({ x: gasX, y: baseY + 0.1, z: gasZ + 1.8 });
  ctx.floorLootSpots.push({ x: gasX, y: baseY + 0.1, z: gasZ - 1.8 });

  addStreetLamp(ctx, poi.x - 6, poi.z - 6);
  addStreetLamp(ctx, poi.x + 6, poi.z + 6);
}

function buildWarehouse(
  ctx: BuildContext,
  x: number,
  z: number,
  rot: Rot90,
  w: number,
  d: number,
  colorHex: string,
): void {
  const baseY = ctx.terrain.getHeightAt(x, z);
  const wallMat = texturedMat(ctx, `siding:${colorHex}`, () => ctx.textures.getSidingTexture(colorHex));
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());
  const roofMat = texturedMat(ctx, 'roof:#334155', () => ctx.textures.getRoofTexture('#334155'));
  const crateMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const glassMat = wallMat;

  const hw = w * 0.5;
  const hd = d * 0.5;
  const wallT = 0.36;
  const wallH = 5.6;
  const slabH = 0.2;

  ctx.buildingFootprints.push({
    x,
    z,
    w: rot % 2 === 0 ? w : d,
    d: rot % 2 === 0 ? d : w,
    color: colorHex,
  });

  // Floor slab
  addLocalBox(ctx, x, baseY, z, rot, 0, slabH * 0.5, 0, w, slabH, d, metalMat, 'metal', 'building_floor');

  // Front & back walls with wide 4.2m open bay doors (3.4m tall)
  addWallWithOpening(
    ctx, x, baseY, z, rot, 'x', hd - wallT * 0.5, -hw, hw, slabH, wallH, wallT,
    wallMat, glassMat, 'metal', 'building_wall',
    { kind: 'door', center: 0, width: 4.2, height: 3.4 },
  );
  addWallWithOpening(
    ctx, x, baseY, z, rot, 'x', -hd + wallT * 0.5, -hw, hw, slabH, wallH, wallT,
    wallMat, glassMat, 'metal', 'building_wall',
    { kind: 'door', center: 0, width: 4.2, height: 3.4 },
  );

  // Side solid steel walls
  addLocalBox(ctx, x, baseY, z, rot, -hw + wallT * 0.5, slabH + wallH * 0.5, 0, wallT, wallH, d - wallT * 2, wallMat, 'metal', 'building_wall');
  addLocalBox(ctx, x, baseY, z, rot, hw - wallT * 0.5, slabH + wallH * 0.5, 0, wallT, wallH, d - wallT * 2, wallMat, 'metal', 'building_wall');

  // Elevated interior mezzanine catwalk at back half + stairs
  const mezY = slabH + 2.8;
  addLocalBox(ctx, x, baseY, z, rot, 1.5, mezY - 0.12, -hd * 0.45, w - 4.0, 0.24, d * 0.42, metalMat, 'metal', 'building_floor');
  addStaircase(ctx, x, baseY, z, rot, -hw + 1.6, 2.2, 'z', -1, 4.2, 2.0, slabH, mezY, 7, metalMat, 'metal', 'building_stair');

  // Interior stacked cargo containers
  addLocalBox(ctx, x, baseY, z, rot, hw - 2.2, slabH + 1.0, 2.4, 2.4, 2.0, 3.6, crateMat, 'wood', 'building_crate');

  // Pitched stepped corrugated roof (walkable!)
  addLocalBox(ctx, x, baseY, z, rot, 0, slabH + wallH + 0.2, 0, w + 0.6, 0.4, d + 0.6, roofMat, 'metal', 'building_roof');
  addLocalBox(ctx, x, baseY, z, rot, 0, slabH + wallH + 0.65, 0, w * 0.65, 0.5, d + 0.4, roofMat, 'metal', 'building_roof');

  // Loot & chests (mezzanine + roof + floor)
  ctx.chestSpots.push({ ...transformPoint(x, baseY, z, rot, 2.2, mezY, -hd * 0.5), rotationY: (rot * Math.PI) / 2 });
  ctx.chestSpots.push({ ...transformPoint(x, baseY, z, rot, 0, slabH + wallH + 0.9, 0), rotationY: (rot * Math.PI) / 2 });
  ctx.floorLootSpots.push(transformPoint(x, baseY, z, rot, 0, slabH + 0.05, 1.5));
  ctx.floorLootSpots.push(transformPoint(x, baseY, z, rot, -1.8, slabH + 0.05, -1.5));
  ctx.floorLootSpots.push(transformPoint(x, baseY, z, rot, 1.5, mezY + 0.05, -hd * 0.35));
}

function buildCraterDepot(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'crater_depot')!;

  // 3 iconic industrial warehouses on the flat western/northern yard
  buildWarehouse(ctx, poi.x - 18, poi.z - 12, 0, 12, 16, '#dc2626');
  buildWarehouse(ctx, poi.x - 18, poi.z + 16, 0, 12, 16, '#2563eb');
  buildWarehouse(ctx, poi.x + 8, poi.z - 22, 1, 12, 16, '#64748b');

  // Meteorite Crater pit at (poi.x + 22, poi.z + 16)
  const mx = poi.x + 22;
  const mz = poi.z + 16;
  const my = ctx.terrain.getHeightAt(mx, mz);

  const rockMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());
  const crystalMat = getMat(ctx, 'meteor_crystal', () => {
    return new THREE.MeshStandardMaterial({
      color: '#a855f7',
      emissive: '#9333ea',
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.35,
    });
  });

  // Meteorite core + glowing shards
  addWorldBox(ctx, mx, my + 1.1, mz, 3.2, 2.4, 3.0, rockMat, 'brick', 'building_meteor');
  addWorldBox(ctx, mx + 0.8, my + 2.3, mz - 0.5, 1.3, 1.9, 1.3, crystalMat, 'brick', 'building_meteor');
  addWorldBox(ctx, mx - 1.1, my + 1.8, mz + 0.8, 1.1, 1.6, 1.1, crystalMat, 'brick', 'building_meteor');

  // Research perimeter hazard posts around rim
  const hazardMat = solidColorMat(ctx, '#facc15', 0.5, 0.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rx = mx + Math.cos(a) * 11.5;
    const rz = mz + Math.sin(a) * 11.5;
    const ry = ctx.terrain.getHeightAt(rx, rz);
    addWorldBox(ctx, rx, ry + 0.65, rz, 0.3, 1.3, 0.3, hazardMat, 'metal', 'building_fence');
  }

  ctx.chestSpots.push({ x: mx + 2.6, y: ctx.terrain.getHeightAt(mx + 2.6, mz), z: mz, rotationY: -Math.PI * 0.5 });
  ctx.floorLootSpots.push({ x: mx - 2.6, y: ctx.terrain.getHeightAt(mx - 2.6, mz), z: mz + 1.2 });
  ctx.floorLootSpots.push({ x: mx, y: ctx.terrain.getHeightAt(mx, mz - 3.0), z: mz - 3.0 });
}

function buildWhisperingPines(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'whispering_pines')!;
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const barkMat = texturedMat(ctx, 'bark', () => ctx.textures.getBarkTexture());
  const cabinRoof = texturedMat(ctx, 'roof:#14532d', () => ctx.textures.getRoofTexture('#14532d'));
  const redRoof = texturedMat(ctx, 'roof:#7f1d1d', () => ctx.textures.getRoofTexture('#7f1d1d'));
  const stoneMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());

  // 1. Grand Forest Lodge
  buildWalkableBuilding(ctx, {
    x: poi.x - 14,
    z: poi.z - 8,
    rot: 0,
    w: 14,
    d: 11,
    stories: 2,
    wallMat: woodMat,
    trimMat: barkMat,
    floorMat: woodMat,
    roofMat: cabinRoof,
    matType: 'wood',
    footprintColor: '#854d0e',
    roofStyle: 'gable',
    backDoor: true,
    porch: true,
    addChestOnRoof: false,
    addChestTopFloor: true,
  });

  // 2. Ranger Cabin (West)
  buildWalkableBuilding(ctx, {
    x: poi.x - 16,
    z: poi.z + 18,
    rot: 1,
    w: 10,
    d: 9,
    stories: 1,
    wallMat: woodMat,
    trimMat: stoneMat,
    floorMat: woodMat,
    roofMat: redRoof,
    matType: 'wood',
    footprintColor: '#a16207',
    roofStyle: 'gable',
    backDoor: true,
    porch: true,
    addChestOnRoof: false,
    addChestTopFloor: true,
  });

  // 3. Cozy North Cabin
  buildWalkableBuilding(ctx, {
    x: poi.x + 12,
    z: poi.z - 18,
    rot: 2,
    w: 10,
    d: 9,
    stories: 2,
    wallMat: woodMat,
    trimMat: barkMat,
    floorMat: woodMat,
    roofMat: cabinRoof,
    matType: 'wood',
    footprintColor: '#78350f',
    roofStyle: 'gable',
    backDoor: true,
    porch: false,
    addChestOnRoof: false,
    addChestTopFloor: true,
  });

  // 4. Tall Wooden Fire Watchtower at (poi.x + 20, poi.z + 15)
  const tx = poi.x + 20;
  const tz = poi.z + 15;
  const ty = ctx.terrain.getHeightAt(tx, tz);
  ctx.buildingFootprints.push({ x: tx, z: tz, w: 6.4, d: 6.4, color: '#92400e' });

  const towerLevels = 3;
  const levelH = 3.2;
  const deckHalf = 3.0;

  // 4 heavy timber corner legs rising 3 levels
  for (const cx of [-deckHalf + 0.25, deckHalf - 0.25]) {
    for (const cz of [-deckHalf + 0.25, deckHalf - 0.25]) {
      addWorldBox(
        ctx,
        tx + cx,
        ty + (towerLevels * levelH) * 0.5,
        tz + cz,
        0.46,
        towerLevels * levelH,
        0.46,
        barkMat,
        'wood',
        'building_watchtower',
      );
    }
  }

  // Base pad
  addWorldBox(ctx, tx, ty + 0.1, tz, 6.2, 0.2, 6.2, woodMat, 'wood', 'building_watchtower');

  // Climbable levels with alternating staircases (stepHeight = 0.40m <= STEP_HEIGHT!)
  for (let lv = 0; lv < towerLevels; lv++) {
    const lvBase = 0.2 + lv * levelH;
    const lvTop = lvBase + levelH;
    const runDir: 1 | -1 = lv % 2 === 0 ? -1 : 1;
    const startZ = runDir === -1 ? 2.2 : -2.2;

    addStaircase(
      ctx,
      tx,
      ty,
      tz,
      0,
      -1.3,
      startZ,
      'z',
      runDir,
      4.4,
      2.1,
      lvBase,
      lvTop,
      8,
      woodMat,
      'wood',
      'building_stair',
    );

    // Landing deck with stairwell cutout on East/West side
    addFloorWithStairHole(
      ctx,
      tx,
      ty,
      tz,
      0,
      -deckHalf,
      deckHalf,
      -deckHalf,
      deckHalf,
      lvTop,
      0.22,
      woodMat,
      'wood',
      'building_floor',
      { xMin: -2.4, xMax: -0.2, zMin: -2.3, zMax: 2.3 },
    );
  }

  // Top lookout deck + waist-high railing + pitched watchtower roof!
  const topY = ty + 0.2 + towerLevels * levelH;
  const railH = 0.95;
  addWorldBox(ctx, tx, topY + railH * 0.5, tz + deckHalf - 0.15, 6.0, railH, 0.25, woodMat, 'wood', 'building_watchtower');
  addWorldBox(ctx, tx, topY + railH * 0.5, tz - deckHalf + 0.15, 6.0, railH, 0.25, woodMat, 'wood', 'building_watchtower');
  addWorldBox(ctx, tx + deckHalf - 0.15, topY + railH * 0.5, tz, 0.25, railH, 5.6, woodMat, 'wood', 'building_watchtower');
  addWorldBox(ctx, tx - deckHalf + 0.15, topY + railH * 0.5, tz, 0.25, railH, 5.6, woodMat, 'wood', 'building_watchtower');

  // Lookout roof columns & canopy
  for (const cx of [-2.75, 2.75]) {
    for (const cz of [-2.75, 2.75]) {
      addWorldBox(ctx, tx + cx, topY + 1.5, tz + cz, 0.34, 3.0, 0.34, barkMat, 'wood', 'building_watchtower');
    }
  }
  addWorldBox(ctx, tx, topY + 3.15, tz, 6.8, 0.35, 6.8, cabinRoof, 'wood', 'building_roof');
  addWorldBox(ctx, tx, topY + 3.55, tz, 4.2, 0.42, 4.2, cabinRoof, 'wood', 'building_roof');

  ctx.chestSpots.push({ x: tx + 1.5, y: topY, z: tz + 1.2, rotationY: Math.PI });
  ctx.chestSpots.push({ x: tx + 1.5, y: ty + 0.2 + levelH, z: tz, rotationY: -Math.PI * 0.5 });
  ctx.floorLootSpots.push({ x: tx + 1.4, y: topY + 0.05, z: tz - 1.4 });
  ctx.floorLootSpots.push({ x: tx + 1.2, y: ty + 0.25, z: tz + 1.2 });
}

export class WorldBuilder {
  private lastBuildGroup: THREE.Group | null = null;
  private textures: TextureFactory | null = null;
  private materials: Map<string, THREE.Material> = new Map();
  private geometries: THREE.BufferGeometry[] = [];

  build(terrain: TerrainQuery, quality: GraphicsQuality = 'high'): WorldBuildResult {
    this.dispose();

    const group = new THREE.Group();
    group.name = 'WorldStructures';

    const textures = new TextureFactory();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
    this.textures = textures;
    this.geometries.push(boxGeo, cylGeo);

    const ctx: BuildContext = {
      group,
      colliders: [],
      chestSpots: [],
      floorLootSpots: [],
      buildingFootprints: [],
      terrain,
      quality,
      textures,
      materials: this.materials,
      geometries: this.geometries,
      boxGeo,
      cylGeo,
      colliderCounter: 0,
    };

    buildMetroTowers(ctx);
    buildSunnySuburbs(ctx);
    buildCrystalBasin(ctx);
    buildMarketRow(ctx);
    buildCraterDepot(ctx);
    buildWhisperingPines(ctx);

    // Roadside scenic watch shacks connecting central corridors for extra cover & loot
    const woodMat = texturedMat(ctx, 'wood', () => textures.getWoodTexture());
    const roofMat = texturedMat(ctx, 'roof:#475569', () => textures.getRoofTexture('#475569'));
    const shacks: Array<[number, number, Rot90]> = [
      [-32, 32, 0],
      [-105, -108, 1],
      [112, -52, 3],
    ];
    for (const [sx, sz, rot] of shacks) {
      if (!terrain.isWater(sx, sz)) {
        buildWalkableBuilding(ctx, {
          x: sx,
          z: sz,
          rot,
          w: 7,
          d: 6,
          stories: 1,
          wallMat: woodMat,
          trimMat: woodMat,
          floorMat: woodMat,
          roofMat,
          matType: 'wood',
          footprintColor: '#a16207',
          roofStyle: 'flat_parapet',
          backDoor: false,
          porch: false,
          addChestOnRoof: false,
          addChestTopFloor: true,
        });
      }
    }

    this.lastBuildGroup = group;

    return {
      group,
      colliders: ctx.colliders,
      chestSpots: ctx.chestSpots,
      floorLootSpots: ctx.floorLootSpots,
      buildingFootprints: ctx.buildingFootprints,
    };
  }

  dispose(): void {
    if (this.lastBuildGroup) {
      this.lastBuildGroup.clear();
      this.lastBuildGroup = null;
    }
    for (const geo of this.geometries) {
      geo.dispose();
    }
    this.geometries = [];
    for (const mat of this.materials.values()) {
      mat.dispose();
    }
    this.materials.clear();
    this.textures?.dispose();
    this.textures = null;
  }
}
