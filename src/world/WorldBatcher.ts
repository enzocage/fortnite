import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

export type Rot90 = 0 | 1 | 2 | 3;

export type PrimitiveKind = 'box' | 'cyl' | 'cone' | 'oct';

export interface AnimatedSpinEntry {
  obj: THREE.Object3D;
  axis: 'x' | 'y' | 'z';
  speed: number;
  bobAmp?: number;
  bobSpeed?: number;
  baseY?: number;
}

export interface BuildContext {
  group: THREE.Group;
  batcher: MeshBatcher;
  colliders: ColliderBox[];
  chestSpots: ChestSpot[];
  floorLootSpots: FloorLootSpot[];
  buildingFootprints: BuildingFootprint[];
  terrain: TerrainQuery;
  quality: GraphicsQuality;
  textures: TextureFactory;
  materials: Map<string, THREE.Material>;
  geometries: THREE.BufferGeometry[];
  animatedSpins: AnimatedSpinEntry[];
  shaderMaterials: THREE.ShaderMaterial[];
  colliderCounter: number;
}

interface BatchBucket {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  geos: THREE.BufferGeometry[];
}

function normalizeNonIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const attrName of Object.keys(g.attributes)) {
    if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv') {
      g.deleteAttribute(attrName);
    }
  }
  if (!g.getAttribute('normal')) {
    g.computeVertexNormals();
  }
  if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

export class MeshBatcher {
  private baseGeos: Record<PrimitiveKind, THREE.BufferGeometry>;
  private buckets = new Map<string, BatchBucket>();
  private tmpMat = new THREE.Matrix4();
  private tmpPos = new THREE.Vector3();
  private tmpEuler = new THREE.Euler();
  private tmpQuat = new THREE.Quaternion();
  private tmpScale = new THREE.Vector3();

  constructor() {
    this.baseGeos = {
      box: normalizeNonIndexed(new THREE.BoxGeometry(1, 1, 1)),
      cyl: normalizeNonIndexed(new THREE.CylinderGeometry(1, 1, 1, 10)),
      cone: normalizeNonIndexed(new THREE.ConeGeometry(1, 1, 10)),
      oct: normalizeNonIndexed(new THREE.OctahedronGeometry(1, 0)),
    };
  }

  add(
    kind: PrimitiveKind,
    wx: number,
    wy: number,
    wz: number,
    rx: number,
    ry: number,
    rz: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
    matKey: string,
    castShadow: boolean,
    receiveShadow: boolean,
  ): void {
    const qx = wx >= 0 ? 1 : 0;
    const qz = wz >= 0 ? 2 : 0;
    const quad = qx + qz;
    const key = `${matKey}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}|q${quad}`;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        material,
        castShadow,
        receiveShadow,
        geos: [],
      };
      this.buckets.set(key, bucket);
    }

    this.tmpPos.set(wx, wy, wz);
    this.tmpEuler.set(rx, ry, rz);
    this.tmpQuat.setFromEuler(this.tmpEuler);
    this.tmpScale.set(sx, sy, sz);
    this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);

    const g = this.baseGeos[kind].clone();
    g.applyMatrix4(this.tmpMat);
    bucket.geos.push(g);
  }

  flush(targetGroup: THREE.Group, ownedGeos: THREE.BufferGeometry[]): void {
    for (const bucket of this.buckets.values()) {
      if (bucket.geos.length === 0) continue;
      const merged =
        bucket.geos.length === 1
          ? bucket.geos[0].clone()
          : mergeGeometries(bucket.geos, false);

      for (const g of bucket.geos) {
        g.dispose();
      }
      bucket.geos.length = 0;

      if (!merged) continue;
      ownedGeos.push(merged);
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      targetGroup.add(mesh);
    }
    this.buckets.clear();
  }

  dispose(): void {
    for (const bucket of this.buckets.values()) {
      for (const g of bucket.geos) g.dispose();
    }
    this.buckets.clear();
    for (const g of Object.values(this.baseGeos)) {
      g.dispose();
    }
  }
}

export function getMat(
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

export function solidColorMat(
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

export function emissiveMat(
  ctx: BuildContext,
  color: string,
  intensity = 1.1,
): THREE.Material {
  return getMat(ctx, `emissive:${color}:${intensity}`, () => {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.25,
      metalness: 0.2,
    });
  });
}

export function texturedMat(
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

function getMatKey(mat: THREE.Material): string {
  return String(mat.uuid);
}

export function transformLocal(
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

export function transformPoint(
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

export function addLocalBox(
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
  const allowCast =
    ctx.quality === 'high'
      ? options.castShadow !== false
      : ctx.quality === 'medium'
        ? options.castShadow === true
        : false;
  const receive = options.receiveShadow !== false;

  ctx.batcher.add(
    'box',
    wx,
    wy,
    wz,
    0,
    0,
    0,
    wsx,
    wsy,
    wsz,
    material,
    getMatKey(material),
    allowCast,
    receive,
  );

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

export function addWorldBox(
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
  options: { collider?: boolean; castShadow?: boolean; receiveShadow?: boolean } = {},
): void {
  addLocalBox(ctx, wx, wy, wz, 0, 0, 0, 0, sx, sy, sz, material, matType, tag, options);
}

export function addWorldPrimitive(
  ctx: BuildContext,
  kind: PrimitiveKind,
  wx: number,
  wy: number,
  wz: number,
  rx: number,
  ry: number,
  rz: number,
  sx: number,
  sy: number,
  sz: number,
  material: THREE.Material,
  options: { castShadow?: boolean; receiveShadow?: boolean } = {},
): void {
  const allowCast =
    ctx.quality === 'high'
      ? options.castShadow !== false
      : ctx.quality === 'medium'
        ? options.castShadow === true
        : false;
  ctx.batcher.add(
    kind,
    wx,
    wy,
    wz,
    rx,
    ry,
    rz,
    sx,
    sy,
    sz,
    material,
    getMatKey(material),
    allowCast,
    options.receiveShadow !== false,
  );
}

export function addWallWithOpening(
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

  const half = opening.width * 0.5;
  const oStart = Math.max(start, opening.center - half);
  const oEnd = Math.min(end, opening.center + half);
  placeSegment(start, oStart, baseY, baseY + wallH);
  placeSegment(oEnd, end, baseY, baseY + wallH);
  placeSegment(oStart, oEnd, baseY, baseY + opening.sill);
  placeSegment(oStart, oEnd, baseY + opening.head, baseY + wallH);

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

export function addFloorWithStairHole(
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

  addPiece(xMin, hx0, zMin, zMax);
  addPiece(hx1, xMax, zMin, zMax);
  addPiece(hx0, hx1, zMin, hz0);
  addPiece(hx0, hx1, hz1, zMax);
}

export function addStaircase(
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

export function addStreetLamp(ctx: BuildContext, x: number, z: number): void {
  const y = ctx.terrain.getHeightAt(x, z);
  const poleMat = solidColorMat(ctx, '#1e293b', 0.45, 0.7);
  const bulbMat = emissiveMat(ctx, '#fef08a', 1.3);

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

export function buildWalkableBuilding(
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
    baseYOverride?: number;
    colliderTagPrefix?: string;
    furnish?: boolean;
  },
): void {
  const baseY = opts.baseYOverride ?? ctx.terrain.getHeightAt(opts.x, opts.z);
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
  const tagWall = opts.colliderTagPrefix ? `${opts.colliderTagPrefix}_wall` : 'building_wall';
  const tagFloor = opts.colliderTagPrefix ? `${opts.colliderTagPrefix}_floor` : 'building_floor';
  const tagRoof = opts.colliderTagPrefix ? `${opts.colliderTagPrefix}_roof` : 'building_roof';
  const tagStair = opts.colliderTagPrefix ? `${opts.colliderTagPrefix}_stair` : 'building_stair';

  const footprintW = opts.rot % 2 === 0 ? opts.w : opts.d;
  const footprintD = opts.rot % 2 === 0 ? opts.d : opts.w;
  ctx.buildingFootprints.push({
    x: opts.x,
    z: opts.z,
    w: footprintW,
    d: footprintD,
    color: opts.footprintColor,
  });

  // Ground foundation slab (visual skirt sinks down -0.8m to eliminate any edge floating on terrain)
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
    tagFloor,
    { collider: true, castShadow: false },
  );
  if (opts.baseYOverride === undefined) {
    addLocalBox(
      ctx,
      opts.x,
      baseY,
      opts.z,
      opts.rot,
      0,
      -0.45,
      0,
      opts.w - 0.1,
      0.9,
      opts.d - 0.1,
      opts.trimMat,
      opts.matType,
      tagFloor,
      { collider: false, castShadow: false },
    );
  }

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
      tagRoof,
      { collider: true, castShadow: true },
    );
  }

  const stairWidth = 2.2;
  const stairCenterX = -hw + wallT + stairWidth * 0.5 + 0.05;
  const stairHole = {
    xMin: stairCenterX - stairWidth * 0.5 - 0.1,
    xMax: stairCenterX + stairWidth * 0.5 + 0.1,
    zMin: -2.4,
    zMax: 2.6,
  };

  const deskMat = solidColorMat(ctx, '#92400e', 0.72, 0.08);
  const cushionMat = solidColorMat(ctx, '#0284c7', 0.85, 0.02);

  for (let s = 0; s < opts.stories; s++) {
    const storyBase = foundationH + s * floorH;
    const isGround = s === 0;
    const storyTop = storyBase + floorH;

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
      tagWall,
      isGround
        ? { kind: 'door', center: 1.0, width: 2.4, height: 2.65 }
        : { kind: 'window', center: 1.0, width: 2.6, sill: 1.05, head: 2.35 },
    );

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
      tagWall,
      isGround && opts.backDoor
        ? { kind: 'door', center: 0.8, width: 2.3, height: 2.65 }
        : { kind: 'window', center: 0.8, width: 2.6, sill: 1.05, head: 2.35 },
    );

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
      tagWall,
      { kind: 'window', center: 0, width: Math.min(3.2, opts.d * 0.35), sill: 1.05, head: 2.35 },
    );

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
      tagWall,
      { kind: 'window', center: 0, width: 2.2, sill: 1.1, head: 2.35 },
    );

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
        tagStair,
      );
    }

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
      s === opts.stories - 1 ? tagRoof : tagFloor,
      hasUpperWalkable ? stairHole : undefined,
    );

    // Interior furniture props (desk / table / couch) cleanly placed on East interior half
    if (opts.furnish !== false && opts.w >= 9 && s < 3) {
      const fx = hw - 2.1;
      const fz = s % 2 === 0 ? -hd + 2.0 : hd - 2.2;
      addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, fx, storyBase + 0.38, fz, 1.8, 0.76, 1.0, deskMat, 'wood', tagFloor, {
        collider: false,
        castShadow: false,
      });
      if (opts.w >= 11) {
        addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, fx - 0.2, storyBase + 0.34, -fz * 0.7, 1.9, 0.68, 0.9, cushionMat, 'wood', tagFloor, {
          collider: false,
          castShadow: false,
        });
      }
    }

    const lootPt1 = transformPoint(opts.x, baseY, opts.z, opts.rot, 1.8, storyBase + 0.05, 0.8);
    ctx.floorLootSpots.push(lootPt1);
    if (opts.w >= 11) {
      const lootPt2 = transformPoint(opts.x, baseY, opts.z, opts.rot, 1.5, storyBase + 0.05, -2.0);
      ctx.floorLootSpots.push(lootPt2);
    }
  }

  const roofTopY = foundationH + opts.stories * floorH;
  if (opts.roofStyle === 'flat_parapet') {
    const pH = 0.95;
    const pT = 0.3;
    addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, 0, roofTopY + pH * 0.5, hd - pT * 0.5, opts.w, pH, pT, opts.trimMat, opts.matType, tagRoof);
    addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, 0, roofTopY + pH * 0.5, -hd + pT * 0.5, opts.w, pH, pT, opts.trimMat, opts.matType, tagRoof);
    addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, hw - pT * 0.5, roofTopY + pH * 0.5, 0, pT, pH, opts.d - pT * 2, opts.trimMat, opts.matType, tagRoof);
    addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, -hw + pT * 0.5, roofTopY + pH * 0.5, 0, pT, pH, opts.d - pT * 2, opts.trimMat, opts.matType, tagRoof);

    // Rooftop HVAC unit for urban silhouette
    if (opts.w >= 12) {
      addLocalBox(ctx, opts.x, baseY, opts.z, opts.rot, -hw + 2.2, roofTopY + 0.5, -hd + 2.2, 1.8, 1.0, 1.5, opts.trimMat, 'metal', tagRoof);
    }

    if (opts.addChestOnRoof !== false) {
      const cp = transformPoint(opts.x, baseY, opts.z, opts.rot, hw - 1.8, roofTopY, -hd + 1.8);
      ctx.chestSpots.push({ ...cp, rotationY: (opts.rot * Math.PI) / 2 });
    }
    const rl = transformPoint(opts.x, baseY, opts.z, opts.rot, 1.2, roofTopY + 0.05, 1.2);
    ctx.floorLootSpots.push(rl);
  } else {
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
        tagRoof,
        { collider: true, castShadow: true },
      );
    }
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
      tagRoof,
      { collider: true, castShadow: true },
    );
  }

  if (opts.addChestTopFloor !== false) {
    const topFloorY = foundationH + (opts.stories - 1) * floorH;
    const cp = transformPoint(opts.x, baseY, opts.z, opts.rot, hw - 1.7, topFloorY, -hd + 1.7);
    ctx.chestSpots.push({ ...cp, rotationY: (opts.rot * Math.PI) / 2 + Math.PI });
  }
}
