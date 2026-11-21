import * as THREE from 'three';
import { POIS } from '../core';
import type {
  ColliderBox,
  GraphicsQuality,
  TerrainQuery,
} from '../types';
import { TextureFactory } from './TextureFactory';
import type { BuildingFootprint } from './TerrainSystem';
import { VOLCANO_CENTER_X, VOLCANO_CENTER_Z } from './TerrainSystem';
import {
  addLocalBox,
  addStaircase,
  addStreetLamp,
  addWallWithOpening,
  addWorldBox,
  addWorldPrimitive,
  buildWalkableBuilding,
  emissiveMat,
  getMat,
  MeshBatcher,
  solidColorMat,
  texturedMat,
  transformPoint,
  type BuildContext,
  type ChestSpot,
  type FloorLootSpot,
  type Rot90,
} from './WorldBatcher';

export type { ChestSpot, FloorLootSpot };

export interface WorldBuildResult {
  group: THREE.Group;
  colliders: ColliderBox[];
  chestSpots: ChestSpot[];
  floorLootSpots: FloorLootSpot[];
  buildingFootprints: BuildingFootprint[];
}

function addAnimatedSpinMesh(
  ctx: BuildContext,
  obj: THREE.Object3D,
  axis: 'x' | 'y' | 'z',
  speed: number,
  bobAmp = 0,
  bobSpeed = 0,
): void {
  ctx.group.add(obj);
  ctx.animatedSpins.push({
    obj,
    axis,
    speed,
    bobAmp,
    bobSpeed,
    baseY: obj.position.y,
  });
}

function buildMetroTowers(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'metro_towers')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  const brickMat = texturedMat(ctx, 'brick', () => ctx.textures.getBrickTexture());
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const marbleMat = texturedMat(ctx, 'marble', () => ctx.textures.getMarbleTexture());
  const blueSiding = texturedMat(ctx, 'siding:#3b82f6', () => ctx.textures.getSidingTexture('#3b82f6'));
  const yellowSiding = texturedMat(ctx, 'siding:#eab308', () => ctx.textures.getSidingTexture('#eab308'));
  const cyberMat = texturedMat(ctx, 'cyber_metal', () => ctx.textures.getCyberMetalTexture());
  const roofSlate = texturedMat(ctx, 'roof:#334155', () => ctx.textures.getRoofTexture('#334155'));
  const trimDark = solidColorMat(ctx, '#1e293b', 0.65, 0.25);
  const glassMat = getMat(ctx, 'skybridge_glass', () => {
    return new THREE.MeshStandardMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0.45,
      roughness: 0.15,
      metalness: 0.35,
    });
  });

  // Central marble plaza pad
  addWorldBox(ctx, poi.x, baseY + 0.05, poi.z, 24, 0.1, 24, marbleMat, 'brick', 'building_plaza', {
    collider: false,
    castShadow: false,
  });

  // 1. Iconic Clock Tower (EXACT position (-94, -56), rot=0, w=10, d=10 preserved for doorway tests!)
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
  const towerY = ctx.terrain.getHeightAt(poi.x - 19, poi.z - 16) + 0.22 + 3 * 3.2;
  const clockGold = emissiveMat(ctx, '#facc15', 0.45);
  addWorldBox(ctx, poi.x - 19, towerY + 2.2, poi.z - 16, 4.2, 4.4, 4.2, brickMat, 'brick', 'building_tower');
  addWorldBox(ctx, poi.x - 19, towerY + 2.8, poi.z - 16 + 2.15, 2.2, 2.2, 0.16, clockGold, 'metal', 'building_tower', { collider: false });
  addWorldBox(ctx, poi.x - 19, towerY + 2.8, poi.z - 16 - 2.15, 2.2, 2.2, 0.16, clockGold, 'metal', 'building_tower', { collider: false });
  addWorldBox(ctx, poi.x - 19, towerY + 5.6, poi.z - 16, 2.6, 2.4, 2.6, roofSlate, 'metal', 'building_tower');

  // 2. Blue Glass High-Rise Skyscraper (North-East, 5 stories + Helipad + Animated Helicopter!)
  buildWalkableBuilding(ctx, {
    x: poi.x + 18,
    z: poi.z - 16,
    rot: 0,
    w: 14,
    d: 11,
    stories: 5,
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

  // Helipad & Helicopter on Blue Skyscraper roof (story 5 top = baseY + 0.22 + 16.0)
  const heliY = baseY + 0.22 + 5 * 3.2;
  const heliX = poi.x + 18;
  const heliZ = poi.z - 16;
  const helipadMat = solidColorMat(ctx, '#facc15', 0.5, 0.2);
  addWorldBox(ctx, heliX, heliY + 0.06, heliZ, 8.2, 0.12, 8.2, trimDark, 'metal', 'building_roof', { collider: false });
  addWorldBox(ctx, heliX - 1.4, heliY + 0.13, heliZ, 0.55, 0.04, 3.6, helipadMat, 'metal', 'building_roof', { collider: false });
  addWorldBox(ctx, heliX + 1.4, heliY + 0.13, heliZ, 0.55, 0.04, 3.6, helipadMat, 'metal', 'building_roof', { collider: false });
  addWorldBox(ctx, heliX, heliY + 0.13, heliZ, 3.2, 0.04, 0.55, helipadMat, 'metal', 'building_roof', { collider: false });

  // Helicopter fuselage (parked slightly off-center so player has launchpad/loot space)
  const heliBodyMat = solidColorMat(ctx, '#dc2626', 0.35, 0.45);
  addWorldBox(ctx, heliX - 2.6, heliY + 1.1, heliZ + 2.2, 2.0, 1.5, 3.8, heliBodyMat, 'metal', 'building_heli');
  addWorldBox(ctx, heliX - 2.6, heliY + 1.3, heliZ + 5.4, 0.55, 0.55, 3.2, trimDark, 'metal', 'building_heli');
  const rotorGeo = new THREE.BoxGeometry(7.2, 0.08, 0.28);
  const rotorMat = solidColorMat(ctx, '#e2e8f0', 0.4, 0.6);
  ctx.geometries.push(rotorGeo);
  const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
  rotorMesh.position.set(heliX - 2.6, heliY + 2.15, heliZ + 2.2);
  addAnimatedSpinMesh(ctx, rotorMesh, 'y', 7.5);

  // 3. Red Brick Apartments (South-West, 3 stories)
  buildWalkableBuilding(ctx, {
    x: poi.x - 18,
    z: poi.z + 18,
    rot: 2,
    w: 14,
    d: 11,
    stories: 3,
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

  // 4. Cyber-Neon Corner Tower (South-East, 4 stories)
  buildWalkableBuilding(ctx, {
    x: poi.x + 17,
    z: poi.z + 17,
    rot: 3,
    w: 11,
    d: 10,
    stories: 4,
    wallMat: yellowSiding,
    trimMat: cyberMat,
    floorMat: woodMat,
    roofMat: roofSlate,
    matType: 'wood',
    footprintColor: '#eab308',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  // Elevated Skybridges connecting Metro Towers buildings!
  // Skybridge A: Clock Tower (x=-94, z=-56) <-> Blue High-Rise (x=-57, z=-56) at floor 3 height (y = baseY + 9.82)
  const sbY1 = baseY + 0.22 + 3 * 3.2;
  addWorldBox(ctx, poi.x - 1.5, sbY1 - 0.14, poi.z - 16, 25, 0.28, 3.2, metalMat, 'metal', 'building_skybridge');
  addWorldBox(ctx, poi.x - 1.5, sbY1 + 0.65, poi.z - 16 - 1.45, 25, 1.3, 0.2, glassMat, 'metal', 'building_skybridge');
  addWorldBox(ctx, poi.x - 1.5, sbY1 + 0.65, poi.z - 16 + 1.45, 25, 1.3, 0.2, glassMat, 'metal', 'building_skybridge');
  ctx.chestSpots.push({ x: poi.x - 1.5, y: sbY1, z: poi.z - 16, rotationY: 0 });

  // Skybridge B: Blue High-Rise (East) <-> Yellow Corner Tower (South-East) at floor 3 height
  addWorldBox(ctx, poi.x + 17.5, sbY1 - 0.14, poi.z + 0.5, 3.2, 0.28, 23, metalMat, 'metal', 'building_skybridge');
  addWorldBox(ctx, poi.x + 17.5 - 1.45, sbY1 + 0.65, poi.z + 0.5, 0.2, 1.3, 23, glassMat, 'metal', 'building_skybridge');
  addWorldBox(ctx, poi.x + 17.5 + 1.45, sbY1 + 0.65, poi.z + 0.5, 0.2, 1.3, 23, glassMat, 'metal', 'building_skybridge');
  ctx.floorLootSpots.push({ x: poi.x + 17.5, y: sbY1 + 0.05, z: poi.z + 0.5 });

  // Neon Billboards mounted on skyscrapers
  const cyberSignMat = texturedMat(ctx, 'billboard:cyber', () => ctx.textures.getBillboardTexture('cyber'));
  const royalSignMat = texturedMat(ctx, 'billboard:royal', () => ctx.textures.getBillboardTexture('royal'));
  addWorldBox(ctx, poi.x + 18, baseY + 10.5, poi.z - 10.2, 6.2, 3.4, 0.24, cyberSignMat, 'metal', 'building_sign', { collider: false });
  addWorldBox(ctx, poi.x - 18, baseY + 7.2, poi.z + 12.2, 5.6, 3.2, 0.24, royalSignMat, 'metal', 'building_sign', { collider: false });

  // Central Plaza Fountain + Bus Stop Shelter
  const stoneMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());
  const waterGlow = emissiveMat(ctx, '#38bdf8', 0.45);
  addWorldBox(ctx, poi.x, baseY + 0.35, poi.z, 5.4, 0.7, 5.4, stoneMat, 'brick', 'building_fountain');
  addWorldBox(ctx, poi.x, baseY + 0.75, poi.z, 4.4, 0.15, 4.4, waterGlow, 'brick', 'building_fountain', { collider: false });
  addWorldBox(ctx, poi.x, baseY + 1.7, poi.z, 1.2, 2.0, 1.2, stoneMat, 'brick', 'building_fountain');
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
  const poolMat = emissiveMat(ctx, '#22d3ee', 0.3);
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());

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

    // Backyard fence & swimming pool for NE & SW houses
    if (h.dx * h.dz < 0) {
      const poolX = poi.x + h.dx;
      const poolZ = poi.z + h.dz + (h.dz < 0 ? -9.5 : 9.5);
      addWorldBox(ctx, poolX, baseY + 0.12, poolZ, 6.5, 0.24, 4.2, trimWhite, 'brick', 'building_pool');
      addWorldBox(ctx, poolX, baseY + 0.25, poolZ, 5.6, 0.06, 3.3, poolMat, 'brick', 'building_pool', { collider: false });
      ctx.floorLootSpots.push({ x: poolX + 3.6, y: baseY + 0.1, z: poolZ });
    }
  }

  // Soccer Stadium Pitch + Bleachers + Floodlight Towers!
  const pitchX = poi.x;
  const pitchZ = poi.z + 1;
  const pitchY = ctx.terrain.getHeightAt(pitchX, pitchZ);
  const turfMat = texturedMat(ctx, 'grass', () => ctx.textures.getGrassTexture());
  const lineMat = solidColorMat(ctx, '#ffffff', 0.85, 0);
  const goalMat = solidColorMat(ctx, '#f1f5f9', 0.4, 0.5);
  const floodGlow = emissiveMat(ctx, '#fef9c3', 1.4);

  addWorldBox(ctx, pitchX, pitchY + 0.04, pitchZ, 18, 0.08, 12, turfMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX, pitchY + 0.09, pitchZ - 5.7, 17.6, 0.03, 0.22, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX, pitchY + 0.09, pitchZ + 5.7, 17.6, 0.03, 0.22, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX - 8.7, pitchY + 0.09, pitchZ, 0.22, 0.03, 11.4, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX + 8.7, pitchY + 0.09, pitchZ, 0.22, 0.03, 11.4, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });
  addWorldBox(ctx, pitchX, pitchY + 0.09, pitchZ, 0.22, 0.03, 11.4, lineMat, 'wood', 'building_soccer', { collider: false, castShadow: false });

  // Bleacher tiers (North & South sidelines, walkable!)
  for (const side of [-1, 1]) {
    for (let t = 0; t < 3; t++) {
      addWorldBox(ctx, pitchX, pitchY + 0.25 + t * 0.42, pitchZ + side * (7.2 + t * 0.85), 14, 0.42, 0.85, metalMat, 'metal', 'building_bleachers');
    }
  }

  // Stadium floodlights at 4 pitch corners
  for (const fx of [-9.5, 9.5]) {
    for (const fz of [-6.8, 6.8]) {
      addWorldBox(ctx, pitchX + fx, pitchY + 4.5, pitchZ + fz, 0.3, 9.0, 0.3, metalMat, 'metal', 'building_lamp');
      addWorldBox(ctx, pitchX + fx, pitchY + 9.1, pitchZ + fz, 1.4, 0.7, 0.4, floodGlow, 'metal', 'building_lamp', { collider: false });
    }
  }

  for (const dir of [-1, 1]) {
    const gx = pitchX + dir * 8.8;
    addWorldBox(ctx, gx, pitchY + 1.2, pitchZ - 2.2, 0.18, 2.4, 0.18, goalMat, 'metal', 'building_goal');
    addWorldBox(ctx, gx, pitchY + 1.2, pitchZ + 2.2, 0.18, 2.4, 0.18, goalMat, 'metal', 'building_goal');
    addWorldBox(ctx, gx, pitchY + 2.38, pitchZ, 0.18, 0.18, 4.58, goalMat, 'metal', 'building_goal');
    addWorldBox(ctx, gx + dir * 1.1, pitchY + 0.1, pitchZ, 2.2, 0.16, 4.5, goalMat, 'metal', 'building_goal', { collider: false });
  }

  ctx.chestSpots.push({ x: pitchX, y: pitchY + 0.08, z: pitchZ - 4.4, rotationY: 0 });
  ctx.floorLootSpots.push({ x: pitchX, y: pitchY + 0.08, z: pitchZ });
  addStreetLamp(ctx, poi.x - 10, poi.z - 9);
  addStreetLamp(ctx, poi.x + 10, poi.z + 9);
}

function buildCrystalBasin(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'crystal_basin')!;
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const barkMat = texturedMat(ctx, 'bark', () => ctx.textures.getBarkTexture());
  const roofMat = texturedMat(ctx, 'roof:#0ea5e9', () => ctx.textures.getRoofTexture('#0ea5e9'));
  const stoneMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());
  const lighthouseRed = solidColorMat(ctx, '#ef4444', 0.5, 0.1);
  const lighthouseWhite = solidColorMat(ctx, '#f8fafc', 0.5, 0.1);

  // 1. Central Island 2-Story Victorian Pavilion & Zero-Point Floating Crystal Spire
  const islandY = ctx.terrain.getHeightAt(poi.x, poi.z);
  const deckH = 0.35;
  addWorldBox(ctx, poi.x, islandY + deckH * 0.5, poi.z, 10.5, deckH, 10.5, woodMat, 'wood', 'building_gazebo');
  ctx.buildingFootprints.push({ x: poi.x, z: poi.z, w: 10.5, d: 10.5, color: '#0ea5e9' });

  for (const ox of [-4.4, 4.4]) {
    for (const oz of [-4.4, 4.4]) {
      addWorldBox(ctx, poi.x + ox, islandY + deckH + 1.8, poi.z + oz, 0.44, 3.6, 0.44, barkMat, 'wood', 'building_gazebo');
    }
  }
  addWorldBox(ctx, poi.x, islandY + deckH + 3.8, poi.z, 11.4, 0.4, 11.4, roofMat, 'wood', 'building_roof');
  addWorldBox(ctx, poi.x, islandY + deckH + 4.3, poi.z, 7.6, 0.45, 7.6, roofMat, 'wood', 'building_roof');

  // Floating animated Zero-Point Crystal above pagoda!
  const crystalGeo = new THREE.OctahedronGeometry(1.8, 0);
  const crystalMat = emissiveMat(ctx, '#22d3ee', 1.3);
  ctx.geometries.push(crystalGeo);
  const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
  crystalMesh.position.set(poi.x, islandY + 9.2, poi.z);
  addAnimatedSpinMesh(ctx, crystalMesh, 'y', 1.4, 0.6, 2.2);

  ctx.chestSpots.push({ x: poi.x - 1.8, y: islandY + deckH, z: poi.z, rotationY: Math.PI * 0.5 });
  ctx.chestSpots.push({ x: poi.x + 1.8, y: islandY + deckH, z: poi.z, rotationY: -Math.PI * 0.5 });
  ctx.floorLootSpots.push({ x: poi.x, y: islandY + deckH, z: poi.z + 2.8 });
  ctx.floorLootSpots.push({ x: poi.x, y: islandY + deckH, z: poi.z - 2.8 });

  // 2. Walkable West Timber Bridge connecting west shore onto central island
  const dockY = 0.75;
  const bridgeLen = 40;
  const bridgeCenterX = poi.x - 34;
  addWorldBox(ctx, bridgeCenterX, dockY, poi.z, bridgeLen, 0.3, 3.8, woodMat, 'wood', 'building_dock');
  ctx.buildingFootprints.push({ x: bridgeCenterX, z: poi.z, w: bridgeLen, d: 3.8, color: '#b97a45' });
  for (let px = poi.x - 52; px <= poi.x - 16; px += 6) {
    for (const pz of [poi.z - 1.5, poi.z + 1.5]) {
      addWorldBox(ctx, px, -0.8, pz, 0.34, 3.2, 0.34, barkMat, 'wood', 'building_dock');
    }
  }
  addStaircase(ctx, poi.x - 14, dockY, poi.z, 0, 0, 0, 'x', 1, 5.0, 3.8, 0, islandY - dockY, 5, woodMat, 'wood', 'building_dock');
  ctx.floorLootSpots.push({ x: bridgeCenterX, y: dockY + 0.15, z: poi.z });

  // 3. North Pier Dock
  const northDockZ = poi.z - 42;
  addWorldBox(ctx, poi.x, dockY, northDockZ, 4.2, 0.3, 24, woodMat, 'wood', 'building_dock');
  for (let pz = northDockZ - 10; pz <= northDockZ + 10; pz += 5) {
    for (const px of [poi.x - 1.8, poi.x + 1.8]) {
      addWorldBox(ctx, px, -0.8, pz, 0.32, 3.2, 0.32, barkMat, 'wood', 'building_dock');
    }
  }
  ctx.chestSpots.push({ x: poi.x, y: dockY + 0.15, z: northDockZ + 10, rotationY: Math.PI });
  ctx.floorLootSpots.push({ x: poi.x, y: dockY + 0.15, z: northDockZ - 4 });

  // 4. East Boathouse + Tall Striped Coastal Lighthouse!
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

  // Coastal Lighthouse perched at (poi.x + 56, poi.z - 22)
  const lhX = poi.x + 56;
  const lhZ = poi.z - 22;
  const lhY = ctx.terrain.getHeightAt(lhX, lhZ);
  ctx.buildingFootprints.push({ x: lhX, z: lhZ, w: 6, d: 6, color: '#ef4444' });
  for (let band = 0; band < 6; band++) {
    const rBand = 2.6 - band * 0.22;
    const mat = band % 2 === 0 ? lighthouseWhite : lighthouseRed;
    addWorldPrimitive(ctx, 'cyl', lhX, lhY + band * 2.8 + 1.4, lhZ, 0, 0, 0, rBand, 2.8, rBand, mat);
  }
  ctx.colliders.push({
    id: `wb_${++ctx.colliderCounter}`,
    minX: lhX - 2.3,
    minY: lhY,
    minZ: lhZ - 2.3,
    maxX: lhX + 2.3,
    maxY: lhY + 18,
    maxZ: lhZ + 2.3,
    material: 'brick',
    tag: 'building_lighthouse',
  });
  addWorldPrimitive(ctx, 'cone', lhX, lhY + 18.6, lhZ, 0, 0, 0, 2.2, 2.0, 2.2, lighthouseRed);
  // Lighthouse rotating beam
  const beamGroup = new THREE.Group();
  beamGroup.position.set(lhX, lhY + 17.2, lhZ);
  const beamGeo = new THREE.ConeGeometry(2.6, 22, 10, 1, true);
  beamGeo.rotateZ(Math.PI * 0.5);
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#fef08a',
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  ctx.geometries.push(beamGeo);
  ctx.materials.set('lighthouse_beam', beamMat);
  const beam1 = new THREE.Mesh(beamGeo, beamMat);
  beam1.position.x = 11;
  const beam2 = new THREE.Mesh(beamGeo, beamMat);
  beam2.rotation.y = Math.PI;
  beam2.position.x = -11;
  beamGroup.add(beam1, beam2);
  addAnimatedSpinMesh(ctx, beamGroup, 'y', 0.9);

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
  const roadMat = texturedMat(ctx, 'road', () => ctx.textures.getRoadTexture());

  addWorldBox(ctx, poi.x, baseY + 0.04, poi.z, 36, 0.08, 18, roadMat, 'brick', 'building_parking', {
    collider: false,
    castShadow: false,
  });

  // 1. Durr Burger Diner (North-West, 2 stories + Spinning Giant Burger Mascot!)
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

  const dinerTopY = ctx.terrain.getHeightAt(poi.x - 14, poi.z - 16) + 0.22 + 2 * 3.2;
  const burgerGroup = new THREE.Group();
  burgerGroup.position.set(poi.x - 14, dinerTopY + 1.8, poi.z - 14);
  const partGeo = new THREE.CylinderGeometry(1.55, 1.55, 1, 14);
  ctx.geometries.push(partGeo);
  const bunMat = solidColorMat(ctx, '#f59e0b', 0.65, 0.05);
  const pattyMat = solidColorMat(ctx, '#78350f', 0.85, 0.05);
  const lettuceMat = solidColorMat(ctx, '#22c55e', 0.65, 0.05);
  const botBun = new THREE.Mesh(partGeo, bunMat);
  botBun.scale.set(1, 0.55, 1);
  const patty = new THREE.Mesh(partGeo, pattyMat);
  patty.position.y = 0.5;
  patty.scale.set(1.04, 0.42, 1.04);
  const lettuce = new THREE.Mesh(partGeo, lettuceMat);
  lettuce.position.y = 0.84;
  lettuce.scale.set(1.12, 0.22, 1.12);
  const topBun = new THREE.Mesh(partGeo, bunMat);
  topBun.position.y = 1.25;
  topBun.scale.set(0.96, 0.7, 0.96);
  burgerGroup.add(botBun, patty, lettuce, topBun);
  addAnimatedSpinMesh(ctx, burgerGroup, 'y', 0.85);

  const burgerSignMat = texturedMat(ctx, 'billboard:burger', () => ctx.textures.getBillboardTexture('burger'));
  addWorldBox(ctx, poi.x - 14, baseY + 4.8, poi.z - 10.8, 5.2, 2.2, 0.22, burgerSignMat, 'metal', 'building_sign', { collider: false });

  // 2. Noms Super-Mall (North-East, 3 stories + neon awning)
  buildWalkableBuilding(ctx, {
    x: poi.x + 14,
    z: poi.z - 16,
    rot: 0,
    w: 15,
    d: 11,
    stories: 3,
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

  // 3. Corner Brick Cafe & Apartments (South-West, 3 stories)
  buildWalkableBuilding(ctx, {
    x: poi.x - 14,
    z: poi.z + 16,
    rot: 2,
    w: 12,
    d: 10,
    stories: 3,
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

  // 4. Roadside Gas Canopy + Parked Semi Truck (South-East)
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
  for (const px of [-2.2, 2.2]) {
    addWorldBox(ctx, gasX + px, baseY + 0.85, gasZ, 0.9, 1.7, 0.8, dinerSiding, 'metal', 'building_pump');
  }
  // Walkable Water Tower overlooking Market Row!
  const wtX = poi.x + 24;
  const wtZ = poi.z + 2;
  for (const lx of [-1.4, 1.4]) {
    for (const lz of [-1.4, 1.4]) {
      addWorldBox(ctx, wtX + lx, baseY + 4.5, wtZ + lz, 0.35, 9.0, 0.35, metalMat, 'metal', 'building_tower');
    }
  }
  addWorldPrimitive(ctx, 'cyl', wtX, baseY + 10.6, wtZ, 0, 0, 0, 2.3, 3.4, 2.3, grocerySiding);
  addWorldPrimitive(ctx, 'cone', wtX, baseY + 13.0, wtZ, 0, 0, 0, 2.5, 1.6, 2.5, roofDark);
  ctx.colliders.push({
    id: `wb_${++ctx.colliderCounter}`,
    minX: wtX - 2.1,
    minY: baseY + 8.8,
    minZ: wtZ - 2.1,
    maxX: wtX + 2.1,
    maxY: baseY + 12.3,
    maxZ: wtZ + 2.1,
    material: 'metal',
    tag: 'building_tower',
  });

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
  const wallMat = texturedMat(ctx, `corrugated:${colorHex}`, () => ctx.textures.getCorrugatedTexture(colorHex));
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

  addLocalBox(ctx, x, baseY, z, rot, 0, slabH * 0.5, 0, w, slabH, d, metalMat, 'metal', 'building_floor');
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
  addLocalBox(ctx, x, baseY, z, rot, -hw + wallT * 0.5, slabH + wallH * 0.5, 0, wallT, wallH, d - wallT * 2, wallMat, 'metal', 'building_wall');
  addLocalBox(ctx, x, baseY, z, rot, hw - wallT * 0.5, slabH + wallH * 0.5, 0, wallT, wallH, d - wallT * 2, wallMat, 'metal', 'building_wall');

  const mezY = slabH + 2.8;
  addLocalBox(ctx, x, baseY, z, rot, 1.5, mezY - 0.12, -hd * 0.45, w - 4.0, 0.24, d * 0.42, metalMat, 'metal', 'building_floor');
  addStaircase(ctx, x, baseY, z, rot, -hw + 1.6, 2.2, 'z', -1, 4.2, 2.0, slabH, mezY, 7, metalMat, 'metal', 'building_stair');
  addLocalBox(ctx, x, baseY, z, rot, hw - 2.2, slabH + 1.0, 2.4, 2.4, 2.0, 3.6, crateMat, 'wood', 'building_crate');

  addLocalBox(ctx, x, baseY, z, rot, 0, slabH + wallH + 0.2, 0, w + 0.6, 0.4, d + 0.6, roofMat, 'metal', 'building_roof');
  addLocalBox(ctx, x, baseY, z, rot, 0, slabH + wallH + 0.65, 0, w * 0.65, 0.5, d + 0.4, roofMat, 'metal', 'building_roof');

  ctx.chestSpots.push({ ...transformPoint(x, baseY, z, rot, 2.2, mezY, -hd * 0.5), rotationY: (rot * Math.PI) / 2 });
  ctx.chestSpots.push({ ...transformPoint(x, baseY, z, rot, 0, slabH + wallH + 0.9, 0), rotationY: (rot * Math.PI) / 2 });
  ctx.floorLootSpots.push(transformPoint(x, baseY, z, rot, 0, slabH + 0.05, 1.5));
  ctx.floorLootSpots.push(transformPoint(x, baseY, z, rot, -1.8, slabH + 0.05, -1.5));
  ctx.floorLootSpots.push(transformPoint(x, baseY, z, rot, 1.5, mezY + 0.05, -hd * 0.35));
}

function buildCraterDepot(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'crater_depot')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  buildWarehouse(ctx, poi.x - 18, poi.z - 12, 0, 12, 16, '#dc2626');
  buildWarehouse(ctx, poi.x - 18, poi.z + 16, 0, 12, 16, '#2563eb');
  buildWarehouse(ctx, poi.x + 8, poi.z - 22, 1, 12, 16, '#64748b');

  // Industrial Overhead Gantry Crane spanning between warehouses!
  const craneMat = solidColorMat(ctx, '#eab308', 0.45, 0.4);
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());
  addWorldBox(ctx, poi.x - 25, baseY + 5.2, poi.z + 2, 0.7, 10.4, 0.7, craneMat, 'metal', 'building_crane');
  addWorldBox(ctx, poi.x - 11, baseY + 5.2, poi.z + 2, 0.7, 10.4, 0.7, craneMat, 'metal', 'building_crane');
  addWorldBox(ctx, poi.x - 18, baseY + 10.2, poi.z + 2, 16.5, 0.9, 1.2, craneMat, 'metal', 'building_crane');

  // Freight Train Rail Cars parked along West yard!
  const redBox = texturedMat(ctx, 'corrugated:#b91c1c', () => ctx.textures.getCorrugatedTexture('#b91c1c'));
  const blueBox = texturedMat(ctx, 'corrugated:#0284c7', () => ctx.textures.getCorrugatedTexture('#0284c7'));
  addWorldBox(ctx, poi.x - 4, baseY + 1.55, poi.z + 2, 3.2, 2.7, 9.5, redBox, 'metal', 'building_train');
  addWorldBox(ctx, poi.x - 4, baseY + 1.55, poi.z + 13, 3.2, 2.7, 9.5, blueBox, 'metal', 'building_train');
  ctx.chestSpots.push({ x: poi.x - 4, y: baseY + 2.9, z: poi.z + 2, rotationY: 0 });
  ctx.floorLootSpots.push({ x: poi.x - 4, y: baseY + 2.95, z: poi.z + 13 });

  // Meteorite Crater Pit + Arched Steel Research Catwalk spanning directly over the meteor!
  const mx = poi.x + 22;
  const mz = poi.z + 16;
  const my = ctx.terrain.getHeightAt(mx, mz);

  const rockMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());
  const crystalMat = emissiveMat(ctx, '#a855f7', 1.25);

  addWorldBox(ctx, mx, my + 1.1, mz, 3.2, 2.4, 3.0, rockMat, 'brick', 'building_meteor');
  addWorldBox(ctx, mx + 0.8, my + 2.3, mz - 0.5, 1.3, 1.9, 1.3, crystalMat, 'brick', 'building_meteor');
  addWorldBox(ctx, mx - 1.1, my + 1.8, mz + 0.8, 1.1, 1.6, 1.1, crystalMat, 'brick', 'building_meteor');

  // Research Catwalk Bridge across the crater pit at y = baseY + 2.6m!
  const catY = baseY + 2.6;
  addWorldBox(ctx, mx, catY, mz, 22, 0.25, 2.6, metalMat, 'metal', 'building_catwalk');
  addWorldBox(ctx, mx, catY + 0.55, mz - 1.2, 22, 0.85, 0.14, craneMat, 'metal', 'building_catwalk');
  addWorldBox(ctx, mx, catY + 0.55, mz + 1.2, 22, 0.85, 0.14, craneMat, 'metal', 'building_catwalk');
  addStaircase(ctx, mx - 14.5, baseY, mz, 0, 0, 0, 'x', 1, 4.0, 2.4, 0, catY - baseY, 6, metalMat, 'metal', 'building_stair');
  addStaircase(ctx, mx + 14.5, baseY, mz, 0, 0, 0, 'x', -1, 4.0, 2.4, 0, catY - baseY, 6, metalMat, 'metal', 'building_stair');
  ctx.chestSpots.push({ x: mx + 2.6, y: ctx.terrain.getHeightAt(mx + 2.6, mz), z: mz, rotationY: -Math.PI * 0.5 });
  ctx.chestSpots.push({ x: mx, y: catY + 0.13, z: mz, rotationY: 0 });

  const hazardMat = solidColorMat(ctx, '#facc15', 0.5, 0.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rx = mx + Math.cos(a) * 11.5;
    const rz = mz + Math.sin(a) * 11.5;
    const ry = ctx.terrain.getHeightAt(rx, rz);
    addWorldBox(ctx, rx, ry + 0.65, rz, 0.3, 1.3, 0.3, hazardMat, 'metal', 'building_fence');
  }
}

function buildWhisperingPines(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'whispering_pines')!;
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const barkMat = texturedMat(ctx, 'bark', () => ctx.textures.getBarkTexture());
  const cabinRoof = texturedMat(ctx, 'roof:#14532d', () => ctx.textures.getRoofTexture('#14532d'));
  const redRoof = texturedMat(ctx, 'roof:#7f1d1d', () => ctx.textures.getRoofTexture('#7f1d1d'));
  const stoneMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());
  const pineCanopyMat = solidColorMat(ctx, '#1b6633', 0.85, 0.02);

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

  // 3. Elevated Redwood Treehouse Canopy Village (North-East Giant Redwoods + Skywalk!)
  const treeDeckY = 6.4;
  const redwoodA = { x: poi.x + 12, z: poi.z - 18 };
  const redwoodB = { x: poi.x + 26, z: poi.z - 12 };
  for (const rw of [redwoodA, redwoodB]) {
    const ry = ctx.terrain.getHeightAt(rw.x, rw.z);
    // Giant Redwood trunk + green pine canopy above treehouse
    addWorldPrimitive(ctx, 'cyl', rw.x, ry + 7.5, rw.z, 0, 0, 0, 1.5, 15.0, 1.5, barkMat);
    ctx.colliders.push({
      id: `wb_${++ctx.colliderCounter}`,
      minX: rw.x - 1.4,
      minY: ry,
      minZ: rw.z - 1.4,
      maxX: rw.x + 1.4,
      maxY: ry + 15,
      maxZ: rw.z + 1.4,
      material: 'wood',
      tag: 'building_treehouse',
    });
    addWorldPrimitive(ctx, 'cone', rw.x, ry + 15.5, rw.z, 0, 0, 0, 5.2, 6.2, 5.2, pineCanopyMat);
    addWorldPrimitive(ctx, 'cone', rw.x, ry + 19.2, rw.z, 0, 0, 0, 3.8, 5.0, 3.8, pineCanopyMat);

    // Wraparound wooden treehouse deck + railing!
    addWorldBox(ctx, rw.x, ry + treeDeckY, rw.z, 7.6, 0.3, 7.6, woodMat, 'wood', 'building_treehouse');
    ctx.buildingFootprints.push({ x: rw.x, z: rw.z, w: 7.6, d: 7.6, color: '#15803d' });
    addWorldBox(ctx, rw.x, ry + treeDeckY + 0.55, rw.z + 3.65, 7.6, 0.9, 0.2, barkMat, 'wood', 'building_treehouse');
    addWorldBox(ctx, rw.x, ry + treeDeckY + 0.55, rw.z - 3.65, 7.6, 0.9, 0.2, barkMat, 'wood', 'building_treehouse');

    // Climbable stairs spiraling up from ground to treehouse deck
    addStaircase(ctx, rw.x - 4.2, ry, rw.z, 0, 0, 3.5, 'z', -1, 7.2, 2.0, 0, treeDeckY, 16, woodMat, 'wood', 'building_stair');
    ctx.chestSpots.push({ x: rw.x + 2.4, y: ry + treeDeckY + 0.15, z: rw.z + 2.0, rotationY: Math.PI });
  }

  // Timber Skywalk connecting Redwood A and Redwood B high in the canopy!
  const midAx = (redwoodA.x + redwoodB.x) * 0.5;
  const midAz = (redwoodA.z + redwoodB.z) * 0.5;
  const deckWorldY = ctx.terrain.getHeightAt(redwoodA.x, redwoodA.z) + treeDeckY;
  addWorldBox(ctx, midAx, deckWorldY, midAz, 11.5, 0.26, 2.8, woodMat, 'wood', 'building_treehouse');
  ctx.floorLootSpots.push({ x: midAx, y: deckWorldY + 0.16, z: midAz });

  // 4. Tall 4-Story Wooden Fire Watchtower (South-East)
  const tx = poi.x + 20;
  const tz = poi.z + 15;
  const ty = ctx.terrain.getHeightAt(tx, tz);
  ctx.buildingFootprints.push({ x: tx, z: tz, w: 6.4, d: 6.4, color: '#92400e' });

  const towerLevels = 4;
  const levelH = 3.2;
  const deckHalf = 3.0;

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
  addWorldBox(ctx, tx, ty + 0.1, tz, 6.2, 0.2, 6.2, woodMat, 'wood', 'building_watchtower');

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

    const hole = { xMin: -2.4, xMax: -0.2, zMin: -2.3, zMax: 2.3 };
    const w = deckHalf * 2;
    const cy = lvTop - 0.11;
    // Split floor manually around stairwell
    addWorldBox(ctx, tx + 1.4, ty + cy, tz, 2.8, 0.22, w, woodMat, 'wood', 'building_floor');
    addWorldBox(ctx, tx - 2.7, ty + cy, tz, 0.6, 0.22, w, woodMat, 'wood', 'building_floor');
    addWorldBox(ctx, tx - 1.3, ty + cy, tz - 2.65, 2.2, 0.22, 0.7, woodMat, 'wood', 'building_floor');
    addWorldBox(ctx, tx - 1.3, ty + cy, tz + 2.65, 2.2, 0.22, 0.7, woodMat, 'wood', 'building_floor');
    void hole;
  }

  const topY = ty + 0.2 + towerLevels * levelH;
  const railH = 0.95;
  addWorldBox(ctx, tx, topY + railH * 0.5, tz + deckHalf - 0.15, 6.0, railH, 0.25, woodMat, 'wood', 'building_watchtower');
  addWorldBox(ctx, tx, topY + railH * 0.5, tz - deckHalf + 0.15, 6.0, railH, 0.25, woodMat, 'wood', 'building_watchtower');
  addWorldBox(ctx, tx + deckHalf - 0.15, topY + railH * 0.5, tz, 0.25, railH, 5.6, woodMat, 'wood', 'building_watchtower');
  addWorldBox(ctx, tx - deckHalf + 0.15, topY + railH * 0.5, tz, 0.25, railH, 5.6, woodMat, 'wood', 'building_watchtower');

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
}

function buildFrostpeakCitadel(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'frostpeak_citadel')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  const castleMat = texturedMat(ctx, 'castle_stone', () => ctx.textures.getCastleStoneTexture());
  const snowMat = texturedMat(ctx, 'snow', () => ctx.textures.getSnowTexture());
  const roofIce = texturedMat(ctx, 'roof:#1e3a8a', () => ctx.textures.getRoofTexture('#1e3a8a'));
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const goldMat = emissiveMat(ctx, '#facc15', 0.45);
  const iceGlow = emissiveMat(ctx, '#7dd3fc', 0.55);

  // Courtyard cobblestone/snow pad
  addWorldBox(ctx, poi.x, baseY + 0.06, poi.z, 34, 0.14, 34, snowMat, 'brick', 'building_plaza', { collider: false, castShadow: false });

  // Central Royal Keep (3-story stone castle)
  buildWalkableBuilding(ctx, {
    x: poi.x,
    z: poi.z - 6,
    rot: 0,
    w: 14,
    d: 12,
    stories: 3,
    wallMat: castleMat,
    trimMat: snowMat,
    floorMat: woodMat,
    roofMat: roofIce,
    matType: 'brick',
    footprintColor: '#94a3b8',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  // Grand Curtain Walls + 4 Corner Watch Turrets with pointed snowy cones!
  const wallR = 17.5;
  const wallH = 4.6;
  const wallT = 1.6;
  // North, West, East curtain walls + South Gatehouse with wide archway
  addWorldBox(ctx, poi.x, baseY + wallH * 0.5, poi.z - wallR, 34, wallH, wallT, castleMat, 'brick', 'building_castle');
  addWorldBox(ctx, poi.x - wallR, baseY + wallH * 0.5, poi.z, wallT, wallH, 34, castleMat, 'brick', 'building_castle');
  addWorldBox(ctx, poi.x + wallR, baseY + wallH * 0.5, poi.z, wallT, wallH, 34, castleMat, 'brick', 'building_castle');

  // South Gatehouse opening (4.6m wide gate)
  addWorldBox(ctx, poi.x - 10.5, baseY + wallH * 0.5, poi.z + wallR, 13, wallH, wallT, castleMat, 'brick', 'building_castle');
  addWorldBox(ctx, poi.x + 10.5, baseY + wallH * 0.5, poi.z + wallR, 13, wallH, wallT, castleMat, 'brick', 'building_castle');
  addWorldBox(ctx, poi.x, baseY + wallH - 0.6, poi.z + wallR, 8.2, 1.2, wallT, castleMat, 'brick', 'building_castle');

  // Battlement crenellations along top of curtain walls
  for (let i = -14; i <= 14; i += 3.5) {
    addWorldBox(ctx, poi.x + i, baseY + wallH + 0.45, poi.z - wallR, 1.4, 0.9, 1.6, snowMat, 'brick', 'building_castle');
    addWorldBox(ctx, poi.x - wallR, baseY + wallH + 0.45, poi.z + i, 1.6, 0.9, 1.4, snowMat, 'brick', 'building_castle');
    addWorldBox(ctx, poi.x + wallR, baseY + wallH + 0.45, poi.z + i, 1.6, 0.9, 1.4, snowMat, 'brick', 'building_castle');
  }

  // Climbable stairs onto curtain wall ramparts
  addStaircase(ctx, poi.x - 14.5, baseY, poi.z + 4, 0, 0, 0, 'z', -1, 7.0, 2.2, 0, wallH, 10, woodMat, 'wood', 'building_stair');

  // 4 Corner Turrets
  for (const cx of [-wallR, wallR]) {
    for (const cz of [-wallR, wallR]) {
      const tx = poi.x + cx;
      const tz = poi.z + cz;
      addWorldPrimitive(ctx, 'cyl', tx, baseY + 5.5, tz, 0, 0, 0, 2.8, 11.0, 2.8, castleMat);
      addWorldPrimitive(ctx, 'cone', tx, baseY + 12.6, tz, 0, 0, 0, 3.4, 3.6, 3.4, roofIce);
      addWorldBox(ctx, tx, baseY + 11.0, tz, 4.4, 0.3, 4.4, snowMat, 'brick', 'building_castle');
      ctx.colliders.push({
        id: `wb_${++ctx.colliderCounter}`,
        minX: tx - 2.4,
        minY: baseY,
        minZ: tz - 2.4,
        maxX: tx + 2.4,
        maxY: baseY + 11,
        maxZ: tz + 2.4,
        material: 'brick',
        tag: 'building_castle',
      });
      ctx.buildingFootprints.push({ x: tx, z: tz, w: 5, d: 5, color: '#64748b' });
    }
  }

  // Glowing Ice Shrine Crystal in Courtyard
  addWorldBox(ctx, poi.x, baseY + 1.1, poi.z + 8, 2.2, 2.2, 2.2, iceGlow, 'brick', 'building_castle');
  addWorldBox(ctx, poi.x, baseY + 0.25, poi.z + 8, 4.0, 0.5, 4.0, goldMat, 'metal', 'building_castle');
  ctx.chestSpots.push({ x: poi.x + 2.5, y: baseY + 0.1, z: poi.z + 8, rotationY: -Math.PI * 0.5 });
  ctx.floorLootSpots.push({ x: poi.x - 2.5, y: baseY + 0.1, z: poi.z + 8 });

  // Animated Cascading Glacial Waterfall pouring down Frostpeak's southern cliff!
  const wfX = poi.x + 28;
  const wfZ = poi.z + 44;
  const wfTopY = ctx.terrain.getHeightAt(wfX, wfZ - 6);
  const wfBotY = ctx.terrain.getHeightAt(wfX, wfZ + 12);
  const wfHeight = Math.max(8, wfTopY - wfBotY);
  const wfGeo = new THREE.PlaneGeometry(5.5, wfHeight + 4, 1, 8);
  const wfMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float flow = sin(vUv.y * 26.0 + uTime * 8.5) * 0.5 + 0.5;
        float streaks = sin(vUv.x * 22.0) * 0.5 + 0.5;
        vec3 waterCol = mix(vec3(0.18, 0.78, 0.96), vec3(0.88, 0.98, 1.0), flow * 0.45 + streaks * 0.25);
        float foam = smoothstep(0.18, 0.0, vUv.y) * 0.7;
        waterCol = mix(waterCol, vec3(1.0), foam);
        gl_FragColor = vec4(waterCol, 0.78);
      }
    `,
  });
  ctx.geometries.push(wfGeo);
  ctx.materials.set('frostpeak_waterfall', wfMat);
  ctx.shaderMaterials.push(wfMat);
  const wfMesh = new THREE.Mesh(wfGeo, wfMat);
  wfMesh.position.set(wfX, (wfTopY + wfBotY) * 0.5, wfZ);
  wfMesh.rotation.x = -0.35;
  ctx.group.add(wfMesh);
}

function buildScorchedCaldera(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'scorched_caldera')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  const basaltMat = texturedMat(ctx, 'basalt', () => ctx.textures.getBasaltTexture());
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());
  const cyberMat = texturedMat(ctx, 'cyber_metal', () => ctx.textures.getCyberMetalTexture());
  const hazardMat = solidColorMat(ctx, '#f97316', 0.45, 0.25);
  const lavaGlowMat = emissiveMat(ctx, '#ea580c', 1.4);

  // 1. Molten Lava Pool inside the volcanic crater with animated churning shader!
  const lavaY = ctx.terrain.getHeightAt(VOLCANO_CENTER_X, VOLCANO_CENTER_Z) + 1.5;
  const lavaGeo = new THREE.CircleGeometry(11.8, 32);
  lavaGeo.rotateX(-Math.PI * 0.5);
  const lavaShader = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 8.0;
        float w1 = sin(p.x + uTime * 1.4) * cos(p.y - uTime * 1.1);
        float w2 = sin(p.x * 2.1 - uTime * 2.0 + p.y * 1.7);
        float heat = clamp(0.5 + 0.35 * w1 + 0.25 * w2, 0.0, 1.0);
        vec3 crust = vec3(0.18, 0.06, 0.05);
        vec3 magma = vec3(0.98, 0.36, 0.04);
        vec3 core = vec3(1.0, 0.88, 0.28);
        vec3 col = mix(crust, magma, smoothstep(0.18, 0.6, heat));
        col = mix(col, core, smoothstep(0.65, 0.96, heat));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  ctx.geometries.push(lavaGeo);
  ctx.materials.set('caldera_lava', lavaShader);
  ctx.shaderMaterials.push(lavaShader);
  const lavaMesh = new THREE.Mesh(lavaGeo, lavaShader);
  lavaMesh.position.set(VOLCANO_CENTER_X, lavaY, VOLCANO_CENTER_Z);
  ctx.group.add(lavaMesh);

  // 2. Jagged Hexagonal Obsidian Spires around caldera rim
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const sx = VOLCANO_CENTER_X + Math.cos(a) * 15.2;
    const sz = VOLCANO_CENTER_Z + Math.sin(a) * 15.2;
    const sy = ctx.terrain.getHeightAt(sx, sz);
    const spireH = 5.5 + (i % 3) * 2.8;
    addWorldPrimitive(ctx, 'cone', sx, sy + spireH * 0.45, sz, 0, a, 0.08, 2.2, spireH, 2.2, basaltMat);
  }

  // 3. Elevated Steel Geothermal Bridge spanning directly across the boiling caldera!
  const bridgeY = baseY + 5.2;
  addWorldBox(ctx, VOLCANO_CENTER_X, bridgeY, VOLCANO_CENTER_Z, 28, 0.32, 3.2, cyberMat, 'metal', 'building_catwalk');
  addWorldBox(ctx, VOLCANO_CENTER_X, bridgeY + 0.55, VOLCANO_CENTER_Z - 1.5, 28, 0.9, 0.16, hazardMat, 'metal', 'building_catwalk');
  addWorldBox(ctx, VOLCANO_CENTER_X, bridgeY + 0.55, VOLCANO_CENTER_Z + 1.5, 28, 0.9, 0.16, hazardMat, 'metal', 'building_catwalk');
  ctx.chestSpots.push({ x: VOLCANO_CENTER_X, y: bridgeY + 0.18, z: VOLCANO_CENTER_Z, rotationY: 0 });
  ctx.floorLootSpots.push({ x: VOLCANO_CENTER_X + 6, y: bridgeY + 0.2, z: VOLCANO_CENTER_Z });

  // 4. Thermal Research Lab & Bunker at POI center/East yard
  buildWalkableBuilding(ctx, {
    x: poi.x + 8,
    z: poi.z - 10,
    rot: 3,
    w: 13,
    d: 11,
    stories: 2,
    wallMat: cyberMat,
    trimMat: hazardMat,
    floorMat: metalMat,
    roofMat: basaltMat,
    matType: 'metal',
    footprintColor: '#f97316',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  buildWalkableBuilding(ctx, {
    x: poi.x + 12,
    z: poi.z + 18,
    rot: 2,
    w: 10,
    d: 9,
    stories: 2,
    wallMat: basaltMat,
    trimMat: hazardMat,
    floorMat: metalMat,
    roofMat: cyberMat,
    matType: 'brick',
    footprintColor: '#ea580c',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  // Glowing Thermal Chimney stack
  const chX = poi.x + 2;
  const chZ = poi.z - 22;
  addWorldPrimitive(ctx, 'cyl', chX, baseY + 6.0, chZ, 0, 0, 0, 1.8, 12.0, 1.8, basaltMat);
  addWorldPrimitive(ctx, 'cyl', chX, baseY + 12.1, chZ, 0, 0, 0, 1.4, 0.3, 1.4, lavaGlowMat);
  ctx.colliders.push({
    id: `wb_${++ctx.colliderCounter}`,
    minX: chX - 1.7,
    minY: baseY,
    minZ: chZ - 1.7,
    maxX: chX + 1.7,
    maxY: baseY + 12,
    maxZ: chZ + 1.7,
    material: 'brick',
    tag: 'building_volcano',
  });
}

function buildSunkenOasis(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'sunken_oasis')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  const sandstoneMat = texturedMat(ctx, 'sandstone', () => ctx.textures.getSandstoneTexture());
  const goldMat = emissiveMat(ctx, '#facc15', 0.5);
  const woodMat = texturedMat(ctx, 'wood', () => ctx.textures.getWoodTexture());
  const awningRed = solidColorMat(ctx, '#dc2626', 0.78, 0.05);
  const awningTeal = solidColorMat(ctx, '#0d9488', 0.78, 0.05);

  // 1. Monumental Stepped Sandstone Desert Pyramid (walkable steps up to summit + open South Temple Chamber!)
  const px = poi.x - 10;
  const pz = poi.z - 12;
  const py = ctx.terrain.getHeightAt(px, pz);
  ctx.buildingFootprints.push({ x: px, z: pz, w: 22, d: 22, color: '#d97706' });

  // Outer stepped tiers with interior hollow ground-level sanctum + wide doorway on South (+Z) face!
  const tiers = 16;
  const tierRise = 0.48; // <= STEP_HEIGHT 0.55m so player can run straight up every step!
  for (let t = 0; t < tiers; t++) {
    const span = 22.0 - t * 1.25;
    const ty = py + t * tierRise + tierRise * 0.5;
    if (t < 7) {
      // Hollow lower levels with open 3.6m South portal doorway into golden treasure chamber!
      const half = span * 0.5;
      const wallThick = 1.6;
      addWorldBox(ctx, px, ty, pz - half + wallThick * 0.5, span, tierRise, wallThick, sandstoneMat, 'brick', 'building_pyramid');
      addWorldBox(ctx, px - half + wallThick * 0.5, ty, pz, wallThick, tierRise, span - wallThick * 2, sandstoneMat, 'brick', 'building_pyramid');
      addWorldBox(ctx, px + half - wallThick * 0.5, ty, pz, wallThick, tierRise, span - wallThick * 2, sandstoneMat, 'brick', 'building_pyramid');
      // South entrance cheeks
      const sideW = Math.max(1.0, (span - 3.6) * 0.5);
      addWorldBox(ctx, px - half + sideW * 0.5, ty, pz + half - wallThick * 0.5, sideW, tierRise, wallThick, sandstoneMat, 'brick', 'building_pyramid');
      addWorldBox(ctx, px + half - sideW * 0.5, ty, pz + half - wallThick * 0.5, sideW, tierRise, wallThick, sandstoneMat, 'brick', 'building_pyramid');
    } else {
      addWorldBox(ctx, px, ty, pz, span, tierRise, span, sandstoneMat, 'brick', 'building_pyramid');
    }
  }
  // Golden capstone & summit chest!
  const peakY = py + tiers * tierRise;
  addWorldPrimitive(ctx, 'cone', px, peakY + 1.4, pz, 0, Math.PI * 0.25, 0, 1.8, 2.8, 1.8, goldMat);
  ctx.chestSpots.push({ x: px, y: py + 0.1, z: pz - 1.5, rotationY: 0 });
  ctx.chestSpots.push({ x: px, y: peakY - 0.1, z: pz + 2.0, rotationY: Math.PI });
  ctx.floorLootSpots.push({ x: px - 2.2, y: py + 0.1, z: pz });

  // 2. Natural Red-Rock Sandstone Arches (West & North)
  const archX = poi.x + 16;
  const archZ = poi.z - 16;
  const archY = ctx.terrain.getHeightAt(archX, archZ);
  addWorldBox(ctx, archX - 5.2, archY + 3.8, archZ, 3.2, 7.6, 3.6, sandstoneMat, 'brick', 'building_arch');
  addWorldBox(ctx, archX + 5.2, archY + 3.8, archZ, 3.2, 7.6, 3.6, sandstoneMat, 'brick', 'building_arch');
  addWorldBox(ctx, archX, archY + 8.4, archZ, 14.5, 2.4, 3.8, sandstoneMat, 'brick', 'building_arch');
  ctx.floorLootSpots.push({ x: archX, y: archY + 0.1, z: archZ });

  // 3. Desert Bazaar Stalls + Oasis Pier
  for (let i = 0; i < 3; i++) {
    const bx = poi.x - 10 + i * 7.5;
    const bz = poi.z + 18;
    const by = ctx.terrain.getHeightAt(bx, bz);
    const awning = i % 2 === 0 ? awningRed : awningTeal;
    addWorldBox(ctx, bx, by + 1.4, bz - 1.5, 0.22, 2.8, 0.22, woodMat, 'wood', 'building_bazaar');
    addWorldBox(ctx, bx + 3.2, by + 1.4, bz - 1.5, 0.22, 2.8, 0.22, woodMat, 'wood', 'building_bazaar');
    addWorldBox(ctx, bx + 1.6, by + 2.85, bz, 4.2, 0.22, 3.8, awning, 'wood', 'building_bazaar');
    addWorldBox(ctx, bx + 1.6, by + 0.45, bz, 3.6, 0.9, 1.0, sandstoneMat, 'brick', 'building_bazaar');
    ctx.floorLootSpots.push({ x: bx + 1.6, y: by + 0.1, z: bz + 1.4 });
  }
  ctx.chestSpots.push({ x: poi.x + 16, y: baseY + 0.1, z: poi.z + 6, rotationY: 0 });

  // 4. Sparkling Elevated Turquoise Oasis Lagoon + Palm Waterfront Dock
  const ox = poi.x + 20;
  const oz = poi.z + 18;
  const oasisWaterGeo = new THREE.CircleGeometry(10.8, 28);
  oasisWaterGeo.rotateX(-Math.PI * 0.5);
  const oasisWaterMat = new THREE.MeshStandardMaterial({
    color: '#06b6d4',
    emissive: '#0891b2',
    emissiveIntensity: 0.25,
    roughness: 0.14,
    metalness: 0.2,
    transparent: true,
    opacity: 0.86,
  });
  ctx.geometries.push(oasisWaterGeo);
  ctx.materials.set('oasis_water', oasisWaterMat);
  const oasisWaterMesh = new THREE.Mesh(oasisWaterGeo, oasisWaterMat);
  oasisWaterMesh.position.set(ox, baseY - 1.25, oz);
  ctx.group.add(oasisWaterMesh);
}

function buildSkylineSpire(ctx: BuildContext): void {
  const poi = POIS.find((p) => p.id === 'skyline_spire')!;
  const baseY = ctx.terrain.getHeightAt(poi.x, poi.z);

  const cyberMat = texturedMat(ctx, 'cyber_metal', () => ctx.textures.getCyberMetalTexture());
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());
  const marbleMat = texturedMat(ctx, 'marble', () => ctx.textures.getMarbleTexture());
  const cyanGlow = emissiveMat(ctx, '#22d3ee', 1.35);
  const magentaGlow = emissiveMat(ctx, '#ec4899', 1.15);
  const roofCyber = texturedMat(ctx, 'roof:#0f172a', () => ctx.textures.getRoofTexture('#0f172a'));

  // 1. Ground-Level Cyber Spaceport Plaza & Energy Conduit Arches
  addWorldBox(ctx, poi.x, baseY + 0.08, poi.z, 34, 0.16, 34, cyberMat, 'metal', 'building_plaza', { collider: false, castShadow: false });
  addWorldBox(ctx, poi.x, baseY + 0.18, poi.z, 16, 0.08, 16, cyanGlow, 'metal', 'building_plaza', { collider: false, castShadow: false });

  // Ground Research Pavilion (West side of ground plaza)
  buildWalkableBuilding(ctx, {
    x: poi.x - 16,
    z: poi.z - 12,
    rot: 0,
    w: 11,
    d: 10,
    stories: 2,
    wallMat: cyberMat,
    trimMat: cyanGlow,
    floorMat: metalMat,
    roofMat: roofCyber,
    matType: 'metal',
    footprintColor: '#06b6d4',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
  });

  // 4 Futuristic Energy Conduit Pylons around Ground Plaza pointing upward toward the Floating Sky-Island!
  for (const [px, pz] of [
    [-14, 14],
    [14, 14],
    [14, -14],
  ]) {
    const cx = poi.x + px;
    const cz = poi.z + pz;
    addWorldBox(ctx, cx, baseY + 4.5, cz, 2.2, 9.0, 2.2, cyberMat, 'metal', 'building_tower');
    addWorldBox(ctx, cx, baseY + 4.5, cz, 2.4, 8.2, 0.4, cyanGlow, 'metal', 'building_tower', { collider: false });
  }

  // 2. FLOATING SKY-ISLAND CITADEL at y = 44.0m (+28m above ground!)
  const skyY = 44.0;
  const rockMat = texturedMat(ctx, 'rock', () => ctx.textures.getRockTexture());

  // Main floating island deck (28m x 28m, walkable, tagged 'building_sky_island'!)
  addWorldBox(ctx, poi.x, skyY - 0.5, poi.z, 28, 1.0, 28, rockMat, 'brick', 'building_sky_island');
  addWorldBox(ctx, poi.x, skyY + 0.08, poi.z, 25, 0.18, 25, marbleMat, 'metal', 'building_sky_island');
  ctx.buildingFootprints.push({ x: poi.x, z: poi.z, w: 28, d: 28, color: '#22d3ee' });

  // Sculpted inverted jagged rock underside + glowing zero-point crystal core!
  addWorldPrimitive(ctx, 'cone', poi.x, skyY - 5.2, poi.z, Math.PI, 0, 0, 14.5, 9.0, 14.5, rockMat);
  addWorldPrimitive(ctx, 'cone', poi.x - 6, skyY - 3.6, poi.z + 5, Math.PI, 0.4, 0, 6.2, 6.0, 6.2, rockMat);
  addWorldPrimitive(ctx, 'cone', poi.x + 6, skyY - 3.8, poi.z - 5, Math.PI, -0.3, 0, 5.8, 6.2, 5.8, rockMat);
  addWorldPrimitive(ctx, 'oct', poi.x, skyY - 10.6, poi.z, 0, 0, 0, 2.4, 3.8, 2.4, cyanGlow);

  // Two giant counter-rotating Holographic Antigravity Energy Rings encircling the Floating Sky-Island!
  const ringGeo1 = new THREE.TorusGeometry(17.5, 0.36, 10, 48);
  ringGeo1.rotateX(Math.PI * 0.5);
  const ringGeo2 = new THREE.TorusGeometry(19.8, 0.28, 10, 48);
  ringGeo2.rotateX(Math.PI * 0.5);
  ctx.geometries.push(ringGeo1, ringGeo2);

  const ringMesh1 = new THREE.Mesh(ringGeo1, cyanGlow);
  ringMesh1.position.set(poi.x, skyY - 1.5, poi.z);
  addAnimatedSpinMesh(ctx, ringMesh1, 'y', 0.9);

  const ringMesh2 = new THREE.Mesh(ringGeo2, magentaGlow);
  ringMesh2.position.set(poi.x, skyY - 3.2, poi.z);
  ringMesh2.rotation.z = 0.08;
  addAnimatedSpinMesh(ctx, ringMesh2, 'y', -0.65);

  // Futuristic Cyber Spire Citadel & Legendary Vault Plaza ON TOP of the Floating Island!
  buildWalkableBuilding(ctx, {
    x: poi.x,
    z: poi.z - 4,
    rot: 0,
    w: 12,
    d: 10,
    stories: 2,
    wallMat: cyberMat,
    trimMat: cyanGlow,
    floorMat: metalMat,
    roofMat: roofCyber,
    matType: 'metal',
    footprintColor: '#38bdf8',
    roofStyle: 'flat_parapet',
    backDoor: true,
    addChestOnRoof: true,
    addChestTopFloor: true,
    baseYOverride: skyY + 0.16,
    colliderTagPrefix: 'building_sky_island',
  });

  // Extra Sky-Island Vault Chests & Floor Loot
  ctx.chestSpots.push({ x: poi.x - 8, y: skyY + 0.16, z: poi.z + 8, rotationY: 0 });
  ctx.chestSpots.push({ x: poi.x + 8, y: skyY + 0.16, z: poi.z + 8, rotationY: 0 });
  ctx.floorLootSpots.push({ x: poi.x, y: skyY + 0.2, z: poi.z + 9 });
}

function buildSuspensionBridge(
  ctx: BuildContext,
  cx: number,
  cz: number,
  spanLen: number,
  deckY: number,
): void {
  const metalMat = texturedMat(ctx, 'metal', () => ctx.textures.getMetalTexture());
  const redSteel = solidColorMat(ctx, '#dc2626', 0.45, 0.55);
  const roadMat = texturedMat(ctx, 'road', () => ctx.textures.getRoadTexture());
  const hw = spanLen * 0.5;

  ctx.buildingFootprints.push({ x: cx, z: cz, w: spanLen, d: 6.4, color: '#dc2626' });

  // Main horizontal deck
  addWorldBox(ctx, cx, deckY - 0.18, cz, spanLen, 0.36, 6.4, roadMat, 'metal', 'building_bridge');
  // Safety side railings
  addWorldBox(ctx, cx, deckY + 0.55, cz - 3.05, spanLen, 1.1, 0.24, redSteel, 'metal', 'building_bridge');
  addWorldBox(ctx, cx, deckY + 0.55, cz + 3.05, spanLen, 1.1, 0.24, redSteel, 'metal', 'building_bridge');

  // Twin Suspension Pylon Towers
  for (const tx of [cx - hw * 0.45, cx + hw * 0.45]) {
    for (const tz of [cz - 3.0, cz + 3.0]) {
      addWorldBox(ctx, tx, deckY + 3.4, tz, 0.7, 10.5, 0.7, redSteel, 'metal', 'building_bridge');
    }
    addWorldBox(ctx, tx, deckY + 8.3, cz, 0.7, 0.65, 6.6, redSteel, 'metal', 'building_bridge');
  }

  // Stepped approach ramps at West & East ends down to ground
  const westGround = Math.max(0.2, ctx.terrain.getHeightAt(cx - hw - 5, cz));
  const eastGround = Math.max(0.2, ctx.terrain.getHeightAt(cx + hw + 5, cz));
  if (deckY > westGround + 0.2) {
    addStaircase(ctx, cx - hw - 5.2, westGround, cz, 0, 0, 0, 'x', 1, 5.4, 6.0, 0, deckY - westGround, 7, metalMat, 'metal', 'building_stair');
  }
  if (deckY > eastGround + 0.2) {
    addStaircase(ctx, cx + hw + 5.2, eastGround, cz, 0, 0, 0, 'x', -1, 5.4, 6.0, 0, deckY - eastGround, 7, metalMat, 'metal', 'building_stair');
  }

  ctx.floorLootSpots.push({ x: cx, y: deckY + 0.05, z: cz });
}

function buildWindTurbines(ctx: BuildContext): void {
  const towerMat = solidColorMat(ctx, '#f8fafc', 0.45, 0.25);
  const hubMat = solidColorMat(ctx, '#334155', 0.4, 0.5);
  const turbineCoords: Array<[number, number, number]> = [
    [-90, -185, 0.3],
    [72, -195, -0.4],
    [-125, 45, 0.9],
    [130, -82, -0.8],
    [35, 225, 0.1],
  ];

  const bladeGeo = new THREE.BoxGeometry(0.45, 7.6, 0.16);
  ctx.geometries.push(bladeGeo);

  for (const [wx, wz, yaw] of turbineCoords) {
    const wy = ctx.terrain.getHeightAt(wx, wz);
    if (wy < 1.5) continue;

    // Tapered mast tower + nacelle
    addWorldPrimitive(ctx, 'cyl', wx, wy + 11.0, wz, 0, 0, 0, 0.72, 22.0, 0.72, towerMat);
    ctx.colliders.push({
      id: `wb_${++ctx.colliderCounter}`,
      minX: wx - 0.75,
      minY: wy,
      minZ: wz - 0.75,
      maxX: wx + 0.75,
      maxY: wy + 22,
      maxZ: wz + 0.75,
      material: 'metal',
      tag: 'building_turbine',
    });

    const hub = new THREE.Group();
    hub.position.set(wx, wy + 22.0, wz);
    hub.rotation.y = yaw;

    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 2.8), towerMat);
    ctx.geometries.push(nacelle.geometry);
    hub.add(nacelle);

    const rotor = new THREE.Group();
    rotor.position.set(0, 0, 1.5);
    for (let b = 0; b < 3; b++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.z = (b / 3) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, towerMat);
      blade.position.y = 3.9;
      bladeWrap.add(blade);
      rotor.add(bladeWrap);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 10), hubMat);
    nose.geometry.rotateX(Math.PI * 0.5);
    ctx.geometries.push(nose.geometry);
    rotor.add(nose);
    hub.add(rotor);

    ctx.group.add(hub);
    ctx.animatedSpins.push({ obj: rotor, axis: 'z', speed: 1.8 });
  }
}

export class WorldBuilder {
  private lastBuildGroup: THREE.Group | null = null;
  private textures: TextureFactory | null = null;
  private materials: Map<string, THREE.Material> = new Map();
  private geometries: THREE.BufferGeometry[] = [];
  private animatedSpins: Array<{
    obj: THREE.Object3D;
    axis: 'x' | 'y' | 'z';
    speed: number;
    bobAmp?: number;
    bobSpeed?: number;
    baseY?: number;
  }> = [];
  private shaderMaterials: THREE.ShaderMaterial[] = [];

  build(terrain: TerrainQuery, quality: GraphicsQuality = 'high'): WorldBuildResult {
    this.dispose();

    const group = new THREE.Group();
    group.name = 'WorldStructures';

    const textures = new TextureFactory();
    const batcher = new MeshBatcher();
    this.textures = textures;

    const ctx: BuildContext = {
      group,
      batcher,
      colliders: [],
      chestSpots: [],
      floorLootSpots: [],
      buildingFootprints: [],
      terrain,
      quality,
      textures,
      materials: this.materials,
      geometries: this.geometries,
      animatedSpins: this.animatedSpins,
      shaderMaterials: this.shaderMaterials,
      colliderCounter: 0,
    };

    // Original 6 POIs (massively upgraded!)
    buildMetroTowers(ctx);
    buildSunnySuburbs(ctx);
    buildCrystalBasin(ctx);
    buildMarketRow(ctx);
    buildCraterDepot(ctx);
    buildWhisperingPines(ctx);

    // New 4 Iconic Multi-Biome POIs!
    buildFrostpeakCitadel(ctx);
    buildScorchedCaldera(ctx);
    buildSunkenOasis(ctx);
    buildSkylineSpire(ctx);

    // 2 Grand River Suspension Bridges + 5 Scenic Wind Turbines
    buildSuspensionBridge(ctx, 95.5, 8.0, 23, 2.8);
    buildSuspensionBridge(ctx, 98.0, 156.0, 24, 3.2);
    buildWindTurbines(ctx);

    // Roadside outposts connecting major corridors
    const woodMat = texturedMat(ctx, 'wood', () => textures.getWoodTexture());
    const roofMat = texturedMat(ctx, 'roof:#475569', () => textures.getRoofTexture('#475569'));
    const shacks: Array<[number, number, Rot90]> = [
      [-32, 32, 0],
      [-105, -108, 1],
      [112, -52, 3],
      [-65, -195, 0],
      [-145, 58, 1],
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

    // Flush batched geometry primitives into ultra-low draw-call meshes!
    batcher.flush(group, this.geometries);
    batcher.dispose();

    this.lastBuildGroup = group;

    return {
      group,
      colliders: ctx.colliders,
      chestSpots: ctx.chestSpots,
      floorLootSpots: ctx.floorLootSpots,
      buildingFootprints: ctx.buildingFootprints,
    };
  }

  update(dt: number, elapsed: number): void {
    for (let i = 0; i < this.animatedSpins.length; i++) {
      const entry = this.animatedSpins[i];
      entry.obj.rotation[entry.axis] += entry.speed * dt;
      if (entry.bobAmp && entry.bobSpeed && entry.baseY !== undefined) {
        entry.obj.position.y = entry.baseY + Math.sin(elapsed * entry.bobSpeed) * entry.bobAmp;
      }
    }
    for (let i = 0; i < this.shaderMaterials.length; i++) {
      const mat = this.shaderMaterials[i];
      if (mat.uniforms.uTime) {
        mat.uniforms.uTime.value = elapsed;
      }
    }
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
    this.animatedSpins = [];
    this.shaderMaterials = [];
    this.textures?.dispose();
    this.textures = null;
  }
}
