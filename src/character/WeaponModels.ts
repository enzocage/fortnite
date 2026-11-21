import * as THREE from 'three';
import type { PickaxeDef, WeaponId } from '../types';
import { PICKAXES } from '../core';

const RANGED_WEAPONS = new Set<WeaponId>([
  'ar',
  'burst_ar',
  'pump_shotgun',
  'tac_shotgun',
  'heavy_shotgun',
  'smg',
  'sniper',
  'pistol',
  'rocket_launcher',
  'mythic_blade_rifle',
]);

const THROWABLE_WEAPONS = new Set<WeaponId>([
  'shockwave_grenade',
  'frag_grenade',
  'chug_splash',
]);

export function isRangedWeapon(weaponId: WeaponId): boolean {
  return RANGED_WEAPONS.has(weaponId);
}

export function isThrowableWeapon(weaponId: WeaponId): boolean {
  return THROWABLE_WEAPONS.has(weaponId);
}

export function hasMuzzleOffset(weaponId: WeaponId): boolean {
  return RANGED_WEAPONS.has(weaponId) || THROWABLE_WEAPONS.has(weaponId);
}

/**
 * Disposes all BufferGeometries and Materials inside an Object3D subtree.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry?.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else if (mat) {
        mat.dispose();
      }
    }
  });
}

function makeStandardMat(
  color: THREE.ColorRepresentation,
  roughness = 0.45,
  metalness = 0.25,
  emissive?: THREE.ColorRepresentation,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive: emissive ?? 0x000000,
    emissiveIntensity,
  });
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  return addMesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z, rx, ry, rz);
}

function addCylinder(
  parent: THREE.Object3D,
  rTop: number,
  rBottom: number,
  height: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  segments = 10,
): THREE.Mesh {
  return addMesh(
    parent,
    new THREE.CylinderGeometry(rTop, rBottom, height, segments),
    material,
    x,
    y,
    z,
    rx,
    ry,
    rz,
  );
}

function buildPlasmaKatana(def: PickaxeDef): THREE.Group {
  const group = new THREE.Group();
  group.name = `weapon_pickaxe_${def.style}`;

  const handleMat = makeStandardMat(def.handleColor, 0.55, 0.35);
  const plasmaMat = makeStandardMat(def.headColor, 0.16, 0.15, def.headColor, 0.85);
  const goldMat = makeStandardMat(def.accentColor, 0.25, 0.72, def.accentColor, 0.28);
  const darkSpine = makeStandardMat('#1e293b', 0.35, 0.65);

  // Katana tsuka hilt & diamond wrap bands
  addCylinder(group, 0.022, 0.025, 0.34, handleMat, 0, 0.04, 0, 0, 0, 0, 10);
  for (let i = 0; i < 4; i++) {
    addBox(group, 0.048, 0.022, 0.054, goldMat, 0, -0.06 + i * 0.07, 0, 0, 0.35, 0);
  }
  addCylinder(group, 0.032, 0.024, 0.04, goldMat, 0, -0.145, 0, 0, 0, 0, 8);

  // Octagonal tsuba handguard + habaki collar
  addCylinder(group, 0.068, 0.068, 0.022, goldMat, 0, 0.22, 0, 0, 0, 0, 8);
  addBox(group, 0.042, 0.048, 0.064, darkSpine, 0, 0.255, 0.005);

  // Curved multi-segment plasma katana blade spine + glowing energy cutting edge
  addBox(group, 0.018, 0.34, 0.042, darkSpine, 0, 0.44, 0.014, 0.04, 0, 0);
  addBox(group, 0.012, 0.34, 0.032, plasmaMat, 0, 0.44, 0.044, 0.04, 0, 0);

  addBox(group, 0.016, 0.30, 0.038, darkSpine, 0, 0.74, 0.042, 0.14, 0, 0);
  addBox(group, 0.010, 0.31, 0.030, plasmaMat, 0, 0.74, 0.072, 0.14, 0, 0);

  // Swept kissaki razor tip + gold energy conduit nodes
  addBox(group, 0.012, 0.14, 0.034, plasmaMat, 0, 0.93, 0.088, 0.36, 0, 0);
  addBox(group, 0.024, 0.045, 0.026, goldMat, 0, 0.56, 0.025, 0.08, 0, 0);
  addBox(group, 0.022, 0.045, 0.024, goldMat, 0, 0.76, 0.052, 0.14, 0, 0);

  return group;
}

function buildMagmaAxe(def: PickaxeDef): THREE.Group {
  const group = new THREE.Group();
  group.name = `weapon_pickaxe_${def.style}`;

  const obsidianMat = makeStandardMat(def.handleColor, 0.52, 0.45);
  const magmaMat = makeStandardMat(def.headColor, 0.24, 0.2, def.headColor, 0.65);
  const emberMat = makeStandardMat(def.accentColor, 0.18, 0.15, def.accentColor, 0.85);
  const ironMat = makeStandardMat('#1c1917', 0.4, 0.68);

  // Rugged volcanic shaft + grip + spiked pommel
  addCylinder(group, 0.025, 0.027, 0.94, obsidianMat, 0, 0.26, 0, 0, 0, 0, 8);
  addCylinder(group, 0.033, 0.033, 0.22, ironMat, 0, 0.0, 0, 0, 0, 0, 8);
  addCylinder(group, 0.012, 0.032, 0.09, magmaMat, 0, -0.25, 0, Math.PI, 0, 0, 6);
  addCylinder(group, 0.046, 0.038, 0.10, magmaMat, 0, 0.66, 0, 0, 0, 0, 8);

  // Central basalt socket + glowing molten core
  addBox(group, 0.11, 0.16, 0.18, ironMat, 0, 0.76, 0);
  addBox(group, 0.118, 0.08, 0.12, emberMat, 0, 0.76, 0);

  // Double-headed bearded caldera axe blades with glowing magma edges
  for (const dir of [1, -1]) {
    addBox(group, 0.052, 0.19, 0.18, ironMat, 0, 0.77, dir * 0.15, dir * 0.12, 0, 0);
    addBox(group, 0.036, 0.27, 0.11, magmaMat, 0, 0.76, dir * 0.26, dir * 0.18, 0, 0);
    addBox(group, 0.022, 0.30, 0.06, emberMat, 0, 0.75, dir * 0.32, dir * 0.22, 0, 0);
    // Lower beard horn
    addBox(group, 0.03, 0.10, 0.08, magmaMat, 0, 0.61, dir * 0.23, dir * -0.35, 0, 0);
  }
  // Top volcanic crest spike
  addCylinder(group, 0.008, 0.038, 0.13, emberMat, 0, 0.90, 0, 0, 0, 0, 6);

  return group;
}

function buildPickaxe(def: PickaxeDef): THREE.Group {
  if (def.id === 'plasma_katana') {
    return buildPlasmaKatana(def);
  }
  if (def.id === 'magma_axe') {
    return buildMagmaAxe(def);
  }

  const group = new THREE.Group();
  group.name = `weapon_pickaxe_${def.style}`;

  const handleMat = makeStandardMat(def.handleColor, 0.65, 0.2);
  const headMat = makeStandardMat(def.headColor, 0.32, 0.55);
  const accentMat = makeStandardMat(def.accentColor, 0.25, 0.4, def.accentColor, 0.22);
  const gripMat = makeStandardMat('#1e293b', 0.85, 0.05);

  // Main shaft (origin at hand grip y = 0, extends up to +Y)
  addCylinder(group, 0.022, 0.024, 0.92, handleMat, 0, 0.26, 0, 0, 0, 0, 10);
  // Hand grip wrap & pommel
  addCylinder(group, 0.029, 0.029, 0.22, gripMat, 0, 0.0, 0, 0, 0, 0, 10);
  addCylinder(group, 0.035, 0.026, 0.05, accentMat, 0, -0.21, 0, 0, 0, 0, 10);
  // Neck collar
  addCylinder(group, 0.036, 0.032, 0.08, accentMat, 0, 0.68, 0, 0, 0, 0, 10);

  if (def.style === 'classic') {
    // Tactical wedge blade forward (+Z) + rear spike (-Z)
    addBox(group, 0.06, 0.09, 0.24, headMat, 0, 0.72, 0.06, 0.14, 0, 0);
    addBox(group, 0.04, 0.13, 0.16, accentMat, 0, 0.70, 0.21, 0.32, 0, 0);
    addBox(group, 0.03, 0.11, 0.09, headMat, 0, 0.67, 0.30, 0.45, 0, 0);
    // Cheek reinforcement plates
    addBox(group, 0.072, 0.06, 0.12, gripMat, 0, 0.73, 0.02);
    // Rear pick spike
    addCylinder(group, 0.006, 0.026, 0.20, headMat, 0, 0.74, -0.14, -Math.PI * 0.42, 0, 0, 6);
  } else if (def.style === 'cyber') {
    // Futuristic energy reactor hub + twin glowing curved blades
    addCylinder(group, 0.055, 0.055, 0.08, headMat, 0, 0.73, 0, 0, 0, Math.PI / 2, 12);
    addCylinder(group, 0.038, 0.038, 0.09, accentMat, 0, 0.73, 0, 0, 0, Math.PI / 2, 12);
    const glowMat = makeStandardMat(def.accentColor, 0.2, 0.1, def.accentColor, 0.85);
    // Front swept cyber axe blade
    addBox(group, 0.03, 0.16, 0.28, headMat, 0, 0.76, 0.16, 0.22, 0, 0);
    addBox(group, 0.018, 0.19, 0.14, glowMat, 0, 0.75, 0.28, 0.28, 0, 0);
    // Rear cyber fin
    addBox(group, 0.024, 0.10, 0.18, headMat, 0, 0.77, -0.13, -0.25, 0, 0);
    addBox(group, 0.014, 0.07, 0.16, glowMat, 0, 0.78, -0.18, -0.28, 0, 0);
  } else if (def.style === 'hammer') {
    // Heavy storm crusher mallet head
    addBox(group, 0.16, 0.16, 0.34, headMat, 0, 0.74, 0.02);
    addBox(group, 0.18, 0.18, 0.06, accentMat, 0, 0.74, 0.20);
    addBox(group, 0.18, 0.18, 0.06, accentMat, 0, 0.74, -0.16);
    addBox(group, 0.18, 0.04, 0.26, accentMat, 0, 0.83, 0.02);
    addCylinder(group, 0.035, 0.015, 0.09, accentMat, 0, 0.87, 0.02, 0, 0, 0, 8);
  } else {
    // 'scythe': sweeping crescent blade + counterweight
    const edgeGlow = makeStandardMat(def.accentColor, 0.25, 0.2, def.accentColor, 0.55);
    addBox(group, 0.045, 0.08, 0.18, headMat, 0, 0.74, 0.04, 0.1, 0, 0);
    addBox(group, 0.024, 0.075, 0.26, headMat, 0, 0.71, 0.22, 0.38, 0, 0);
    addBox(group, 0.018, 0.06, 0.22, headMat, 0, 0.59, 0.38, 0.78, 0, 0);
    // Glowing inner crescent edge
    addBox(group, 0.01, 0.035, 0.24, edgeGlow, 0, 0.67, 0.23, 0.38, 0, 0);
    addBox(group, 0.01, 0.03, 0.20, edgeGlow, 0, 0.56, 0.39, 0.78, 0, 0);
    // Rear hook spur
    addBox(group, 0.026, 0.065, 0.15, accentMat, 0, 0.77, -0.10, -0.35, 0, 0);
  }

  return group;
}

function buildAssaultRifle(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_ar';

  const bodyGold = makeStandardMat('#d97706', 0.38, 0.35);
  const bodyTan = makeStandardMat('#f59e0b', 0.42, 0.25);
  const darkMetal = makeStandardMat('#1e293b', 0.35, 0.6);
  const gunmetal = makeStandardMat('#475569', 0.3, 0.7);
  const sightGlow = makeStandardMat('#38bdf8', 0.2, 0.1, '#38bdf8', 0.5);

  // Pistol grip centered around origin (0, 0, 0)
  addBox(group, 0.042, 0.12, 0.05, darkMetal, 0, -0.02, -0.02, 0.22, 0, 0);
  // Lower & upper SCAR-style receiver
  addBox(group, 0.064, 0.085, 0.36, bodyGold, 0, 0.065, 0.09);
  addBox(group, 0.058, 0.045, 0.38, bodyTan, 0, 0.115, 0.10);
  // Side handguard vents & charging handle
  addBox(group, 0.070, 0.022, 0.14, darkMetal, 0, 0.075, 0.21);
  addCylinder(group, 0.008, 0.008, 0.04, gunmetal, -0.042, 0.105, 0.08, 0, 0, Math.PI / 2, 6);
  // Top picatinny rail + iron sights
  addBox(group, 0.03, 0.018, 0.34, darkMetal, 0, 0.145, 0.10);
  addBox(group, 0.026, 0.026, 0.02, darkMetal, 0, 0.162, -0.04);
  addBox(group, 0.02, 0.028, 0.02, darkMetal, 0, 0.162, 0.27);
  addBox(group, 0.012, 0.012, 0.01, sightGlow, 0, 0.165, 0.275);
  // Curved magazine
  addBox(group, 0.036, 0.14, 0.06, darkMetal, 0, -0.03, 0.12, -0.18, 0, 0);
  // Angled boot stock
  addBox(group, 0.05, 0.09, 0.20, bodyTan, 0, 0.06, -0.17, 0.08, 0, 0);
  addBox(group, 0.052, 0.115, 0.04, darkMetal, 0, 0.045, -0.27);
  // Barrel + muzzle brake
  addCylinder(group, 0.015, 0.017, 0.26, gunmetal, 0, 0.085, 0.40, Math.PI / 2, 0, 0, 10);
  addCylinder(group, 0.022, 0.02, 0.05, darkMetal, 0, 0.085, 0.53, Math.PI / 2, 0, 0, 10);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.085, 0.56);
  return group;
}

function buildBurstAR(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_burst_ar';

  const slate = makeStandardMat('#334155', 0.4, 0.4);
  const dark = makeStandardMat('#0f172a', 0.45, 0.5);
  const steel = makeStandardMat('#64748b', 0.3, 0.7);
  const accent = makeStandardMat('#f97316', 0.35, 0.2);

  // Grip
  addBox(group, 0.04, 0.115, 0.05, dark, 0, -0.02, 0.0, 0.2, 0, 0);
  // Bullpup/tactical body
  addBox(group, 0.062, 0.095, 0.42, slate, 0, 0.065, 0.04);
  // Iconic elevated carry handle / rail
  addBox(group, 0.034, 0.05, 0.28, dark, 0, 0.135, 0.03);
  addBox(group, 0.038, 0.018, 0.30, steel, 0, 0.16, 0.03);
  addBox(group, 0.014, 0.014, 0.08, accent, 0, 0.172, 0.12);
  // Rear bullpup mag
  addBox(group, 0.034, 0.125, 0.055, dark, 0, -0.015, -0.11, -0.12, 0, 0);
  // Forward handguard + tri-rail barrel
  addBox(group, 0.05, 0.065, 0.14, accent, 0, 0.065, 0.27);
  addCylinder(group, 0.015, 0.016, 0.22, steel, 0, 0.08, 0.41, Math.PI / 2, 0, 0, 10);
  addCylinder(group, 0.02, 0.02, 0.045, dark, 0, 0.08, 0.51, Math.PI / 2, 0, 0, 8);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.08, 0.54);
  return group;
}

function buildPumpShotgun(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_pump_shotgun';

  const steel = makeStandardMat('#334155', 0.35, 0.65);
  const darkMetal = makeStandardMat('#1e293b', 0.4, 0.55);
  const wood = makeStandardMat('#92400e', 0.6, 0.08);
  const brass = makeStandardMat('#fbbf24', 0.28, 0.7);

  // Stock & angled grip
  addBox(group, 0.044, 0.10, 0.065, wood, 0, -0.01, -0.02, 0.38, 0, 0);
  addBox(group, 0.046, 0.09, 0.22, wood, 0, 0.045, -0.15, 0.14, 0, 0);
  // Receiver + side shell carrier
  addBox(group, 0.058, 0.08, 0.20, darkMetal, 0, 0.07, 0.08);
  addBox(group, 0.012, 0.045, 0.11, darkMetal, 0.032, 0.07, 0.08);
  // Long barrel & underbarrel shell tube
  addCylinder(group, 0.019, 0.02, 0.46, steel, 0, 0.095, 0.39, Math.PI / 2, 0, 0, 10);
  addCylinder(group, 0.016, 0.016, 0.38, darkMetal, 0, 0.055, 0.35, Math.PI / 2, 0, 0, 10);
  // Ribbed pump forend
  addCylinder(group, 0.027, 0.027, 0.17, wood, 0, 0.055, 0.32, Math.PI / 2, 0, 0, 10);
  // Front bead sight
  addCylinder(group, 0.007, 0.007, 0.016, brass, 0, 0.118, 0.59, 0, 0, 0, 6);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.095, 0.63);
  return group;
}

function buildTacShotgun(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_tac_shotgun';

  const crimson = makeStandardMat('#dc2626', 0.35, 0.25);
  const silver = makeStandardMat('#cbd5e1', 0.3, 0.65);
  const dark = makeStandardMat('#1e293b', 0.45, 0.45);
  const glow = makeStandardMat('#22c55e', 0.2, 0.1, '#22c55e', 0.65);

  // Grip
  addBox(group, 0.042, 0.11, 0.05, dark, 0, -0.02, 0, 0.22, 0, 0);
  // Bulky red tactical receiver
  addBox(group, 0.072, 0.105, 0.30, crimson, 0, 0.07, 0.08);
  addBox(group, 0.076, 0.03, 0.26, silver, 0, 0.115, 0.09);
  // Ammo counter indicator
  addBox(group, 0.078, 0.02, 0.06, glow, 0, 0.075, 0.05);
  // Short stubby stock
  addBox(group, 0.05, 0.085, 0.16, dark, 0, 0.055, -0.14, 0.08, 0, 0);
  // Thick ventilated barrel shroud + muzzle
  addBox(group, 0.058, 0.082, 0.24, dark, 0, 0.075, 0.34);
  addCylinder(group, 0.022, 0.022, 0.10, silver, 0, 0.088, 0.47, Math.PI / 2, 0, 0, 10);
  addCylinder(group, 0.017, 0.017, 0.08, dark, 0, 0.05, 0.45, Math.PI / 2, 0, 0, 10);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.088, 0.53);
  return group;
}

function buildHeavyShotgun(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_heavy_shotgun';

  const matteDark = makeStandardMat('#0f172a', 0.42, 0.55);
  const slateSteel = makeStandardMat('#334155', 0.32, 0.72);
  const silver = makeStandardMat('#94a3b8', 0.25, 0.8);
  const crimsonAccent = makeStandardMat('#ef4444', 0.35, 0.3, '#ef4444', 0.2);

  // Ergonomic pistol grip
  addBox(group, 0.044, 0.12, 0.052, matteDark, 0, -0.02, -0.01, 0.22, 0, 0);

  // Heavy reinforced receiver + top picatinny rail + crimson trim
  addBox(group, 0.072, 0.098, 0.32, slateSteel, 0, 0.072, 0.09);
  addBox(group, 0.076, 0.022, 0.26, crimsonAccent, 0, 0.08, 0.08);
  addBox(group, 0.036, 0.018, 0.32, matteDark, 0, 0.132, 0.10);

  // Reflex ghost-ring sight
  addBox(group, 0.032, 0.034, 0.04, matteDark, 0, 0.155, 0.02);
  addBox(group, 0.012, 0.012, 0.01, crimsonAccent, 0, 0.16, 0.035);

  // High-capacity Drum Magazine beneath receiver
  addCylinder(group, 0.074, 0.074, 0.095, matteDark, 0, -0.028, 0.14, Math.PI / 2, 0, 0, 14);
  addCylinder(group, 0.056, 0.056, 0.102, slateSteel, 0, -0.028, 0.14, Math.PI / 2, 0, 0, 14);
  addCylinder(group, 0.022, 0.022, 0.11, silver, 0, -0.028, 0.14, Math.PI / 2, 0, 0, 10);
  // Mag feed neck
  addBox(group, 0.046, 0.06, 0.065, matteDark, 0, 0.025, 0.14);

  // Folding tactical skeleton stock
  addBox(group, 0.042, 0.025, 0.22, slateSteel, 0, 0.09, -0.17);
  addBox(group, 0.038, 0.025, 0.20, matteDark, 0, 0.035, -0.16, -0.15, 0, 0);
  addBox(group, 0.048, 0.11, 0.036, matteDark, 0, 0.055, -0.27);

  // Heavy barrel + Ventilated Cooling Shroud with ribbed slots
  addCylinder(group, 0.022, 0.024, 0.34, silver, 0, 0.092, 0.42, Math.PI / 2, 0, 0, 12);
  addBox(group, 0.060, 0.078, 0.23, matteDark, 0, 0.088, 0.36);
  for (let v = 0; v < 4; v++) {
    addBox(group, 0.066, 0.084, 0.024, slateSteel, 0, 0.088, 0.28 + v * 0.054);
  }
  // Ported heavy choke muzzle brake
  addCylinder(group, 0.028, 0.026, 0.06, matteDark, 0, 0.092, 0.58, Math.PI / 2, 0, 0, 10);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.092, 0.62);
  return group;
}

function buildSMG(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_smg';

  const dark = makeStandardMat('#1e293b', 0.42, 0.45);
  const gunmetal = makeStandardMat('#475569', 0.32, 0.65);
  const cyan = makeStandardMat('#06b6d4', 0.3, 0.3, '#06b6d4', 0.2);

  // Grip
  addBox(group, 0.038, 0.105, 0.045, dark, 0, -0.02, 0, 0.2, 0, 0);
  // Compact body
  addBox(group, 0.054, 0.078, 0.26, dark, 0, 0.062, 0.06);
  addBox(group, 0.058, 0.022, 0.22, cyan, 0, 0.092, 0.06);
  // Stick magazine
  addBox(group, 0.028, 0.14, 0.038, gunmetal, 0, -0.035, 0.11, -0.14, 0, 0);
  // Foregrip
  addBox(group, 0.028, 0.075, 0.032, dark, 0, 0.005, 0.20, 0.1, 0, 0);
  // Folded wire stock
  addBox(group, 0.04, 0.065, 0.13, gunmetal, 0, 0.06, -0.12);
  // Shrouded short barrel / suppressor nose
  addCylinder(group, 0.019, 0.019, 0.18, gunmetal, 0, 0.068, 0.28, Math.PI / 2, 0, 0, 10);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.068, 0.38);
  return group;
}

function buildSniper(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_sniper';

  const chassis = makeStandardMat('#1e293b', 0.42, 0.45);
  const olive = makeStandardMat('#334155', 0.45, 0.35);
  const barrelMat = makeStandardMat('#0f172a', 0.28, 0.75);
  const lensMat = makeStandardMat('#38bdf8', 0.1, 0.2, '#38bdf8', 0.7);
  const steel = makeStandardMat('#94a3b8', 0.25, 0.8);

  // Grip & skeleton precision stock
  addBox(group, 0.04, 0.11, 0.05, chassis, 0, -0.02, -0.01, 0.22, 0, 0);
  addBox(group, 0.046, 0.085, 0.25, olive, 0, 0.05, -0.18, 0.05, 0, 0);
  // Long receiver + forend
  addBox(group, 0.06, 0.08, 0.42, olive, 0, 0.065, 0.12);
  // Bolt handle on right side (-X)
  addCylinder(group, 0.009, 0.009, 0.055, steel, -0.045, 0.08, 0.03, 0, 0, Math.PI / 2, 8);
  addMesh(group, new THREE.SphereGeometry(0.015, 8, 8), steel, -0.072, 0.072, 0.03);
  // Long fluted heavy barrel + rectangular muzzle brake
  addCylinder(group, 0.015, 0.018, 0.44, barrelMat, 0, 0.08, 0.54, Math.PI / 2, 0, 0, 10);
  addBox(group, 0.038, 0.036, 0.075, steel, 0, 0.08, 0.76);
  // Large scope + rings + cyan glass lenses
  addBox(group, 0.028, 0.032, 0.024, chassis, 0, 0.12, 0.04);
  addBox(group, 0.028, 0.032, 0.024, chassis, 0, 0.12, 0.18);
  addCylinder(group, 0.024, 0.022, 0.24, chassis, 0, 0.155, 0.11, Math.PI / 2, 0, 0, 12);
  addCylinder(group, 0.032, 0.024, 0.07, chassis, 0, 0.155, 0.24, Math.PI / 2, 0, 0, 12);
  addCylinder(group, 0.026, 0.026, 0.012, lensMat, 0, 0.155, 0.275, Math.PI / 2, 0, 0, 12);
  addCylinder(group, 0.019, 0.019, 0.012, lensMat, 0, 0.155, -0.01, Math.PI / 2, 0, 0, 12);
  // Bipod legs under forend
  addCylinder(group, 0.008, 0.008, 0.16, steel, 0.045, 0.015, 0.36, -0.55, 0, 0.35, 6);
  addCylinder(group, 0.008, 0.008, 0.16, steel, -0.045, 0.015, 0.36, -0.55, 0, -0.35, 6);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.08, 0.80);
  return group;
}

function buildPistol(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_pistol';

  const frame = makeStandardMat('#1e293b', 0.55, 0.25);
  const slide = makeStandardMat('#64748b', 0.28, 0.72);
  const sight = makeStandardMat('#facc15', 0.2, 0.2, '#facc15', 0.45);

  // Grip + mag floorplate
  addBox(group, 0.036, 0.11, 0.048, frame, 0, -0.025, -0.01, 0.24, 0, 0);
  addBox(group, 0.04, 0.018, 0.054, slide, 0, -0.08, -0.025, 0.24, 0, 0);
  // Polymer lower + trigger guard
  addBox(group, 0.038, 0.026, 0.19, frame, 0, 0.045, 0.065);
  addBox(group, 0.014, 0.032, 0.055, frame, 0, 0.022, 0.05);
  // Metallic slide + sights
  addBox(group, 0.04, 0.042, 0.21, slide, 0, 0.075, 0.075);
  addBox(group, 0.014, 0.012, 0.012, sight, 0, 0.10, 0.165);
  addBox(group, 0.02, 0.012, 0.012, sight, 0, 0.10, -0.015);
  // Barrel tip
  addCylinder(group, 0.011, 0.011, 0.04, frame, 0, 0.072, 0.19, Math.PI / 2, 0, 0, 8);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.072, 0.215);
  return group;
}

function buildRocketLauncher(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_rocket_launcher';

  const olive = makeStandardMat('#4d7c0f', 0.5, 0.25);
  const darkMetal = makeStandardMat('#1e293b', 0.4, 0.6);
  const steel = makeStandardMat('#94a3b8', 0.3, 0.7);
  const warheadRed = makeStandardMat('#ef4444', 0.32, 0.3);
  const bandYellow = makeStandardMat('#facc15', 0.35, 0.3);

  // Pistol grip & shoulder brace
  addBox(group, 0.042, 0.115, 0.052, darkMetal, 0, -0.025, 0.02, 0.18, 0, 0);
  addBox(group, 0.036, 0.095, 0.045, darkMetal, 0, -0.01, 0.22);
  // Main olive launcher tube
  addCylinder(group, 0.068, 0.068, 0.78, olive, 0, 0.09, 0.08, Math.PI / 2, 0, 0, 14);
  // Front & rear metal bands
  addCylinder(group, 0.074, 0.074, 0.06, darkMetal, 0, 0.09, 0.44, Math.PI / 2, 0, 0, 14);
  addCylinder(group, 0.078, 0.068, 0.12, darkMetal, 0, 0.09, -0.34, Math.PI / 2, 0, 0, 14);
  // Side iron sight bracket
  addBox(group, 0.025, 0.075, 0.08, steel, 0.065, 0.145, 0.26);
  // Iconic red rocket warhead sticking out the front!
  addCylinder(group, 0.046, 0.052, 0.14, steel, 0, 0.09, 0.49, Math.PI / 2, 0, 0, 12);
  addCylinder(group, 0.01, 0.052, 0.15, warheadRed, 0, 0.09, 0.61, Math.PI / 2, 0, 0, 12);
  addCylinder(group, 0.053, 0.053, 0.025, bandYellow, 0, 0.09, 0.535, Math.PI / 2, 0, 0, 12);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.09, 0.69);
  return group;
}

function buildMythicBladeRifle(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_mythic_blade_rifle';

  const pearlWhite = makeStandardMat('#f8fafc', 0.25, 0.28);
  const goldTrim = makeStandardMat('#fbbf24', 0.22, 0.78, '#f59e0b', 0.18);
  const obsidian = makeStandardMat('#1e293b', 0.38, 0.55);
  const cyanEnergy = makeStandardMat('#22d3ee', 0.14, 0.15, '#22d3ee', 0.9);

  // Sculpted white/gold pistol grip
  addBox(group, 0.042, 0.12, 0.048, obsidian, 0, -0.02, -0.02, 0.24, 0, 0);
  addBox(group, 0.046, 0.026, 0.052, goldTrim, 0, -0.075, -0.032, 0.24, 0, 0);

  // Sleek aerodynamic gold-white chassis
  addBox(group, 0.066, 0.084, 0.40, pearlWhite, 0, 0.070, 0.11);
  addBox(group, 0.054, 0.036, 0.44, goldTrim, 0, 0.118, 0.13);
  // Swept forward blade shroud
  addBox(group, 0.058, 0.068, 0.22, pearlWhite, 0, 0.080, 0.39);
  addBox(group, 0.044, 0.024, 0.24, goldTrim, 0, 0.118, 0.40);

  // Twin glowing cyan energy rails along sides + glowing top pulse core!
  addBox(group, 0.014, 0.022, 0.46, cyanEnergy, 0.036, 0.078, 0.28);
  addBox(group, 0.014, 0.022, 0.46, cyanEnergy, -0.036, 0.078, 0.28);
  addBox(group, 0.026, 0.014, 0.26, cyanEnergy, 0, 0.138, 0.20);

  // Gold-accented futuristic energy cell magazine
  addBox(group, 0.036, 0.135, 0.06, obsidian, 0, -0.025, 0.13, -0.18, 0, 0);
  addBox(group, 0.040, 0.08, 0.02, cyanEnergy, 0, -0.02, 0.135, -0.18, 0, 0);

  // Sleek sculpted mythic stock
  addBox(group, 0.048, 0.082, 0.21, pearlWhite, 0, 0.064, -0.17, 0.06, 0, 0);
  addBox(group, 0.052, 0.11, 0.034, goldTrim, 0, 0.05, -0.27);

  // Holographic blade reflex optic
  addBox(group, 0.036, 0.036, 0.065, goldTrim, 0, 0.155, 0.06);
  addBox(group, 0.024, 0.024, 0.008, cyanEnergy, 0, 0.172, 0.06);

  // Split-emitter energy barrel & muzzle tip
  addCylinder(group, 0.014, 0.016, 0.16, obsidian, 0, 0.088, 0.54, Math.PI / 2, 0, 0, 10);
  addBox(group, 0.048, 0.018, 0.08, goldTrim, 0, 0.092, 0.57);
  addCylinder(group, 0.018, 0.018, 0.024, cyanEnergy, 0, 0.088, 0.61, Math.PI / 2, 0, 0, 10);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.09, 0.63);
  return group;
}

function buildShockwaveGrenade(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_shockwave_grenade';

  const cyanCore = makeStandardMat('#22d3ee', 0.12, 0.2, '#22d3ee', 0.95);
  const violetGlow = makeStandardMat('#a855f7', 0.18, 0.25, '#a855f7', 0.85);
  const darkCage = makeStandardMat('#1e293b', 0.35, 0.72);
  const silver = makeStandardMat('#cbd5e1', 0.28, 0.8);

  // Glowing cyan/violet sphere energy core
  addMesh(group, new THREE.SphereGeometry(0.068, 14, 12), cyanCore, 0, 0.06, 0.02);
  addMesh(group, new THREE.TorusGeometry(0.072, 0.012, 8, 16), violetGlow, 0, 0.06, 0.02, Math.PI / 2, 0, 0);

  // Metallic tactical containment rings
  addMesh(group, new THREE.TorusGeometry(0.078, 0.009, 8, 16), darkCage, 0, 0.06, 0.02, 0, 0, 0);
  addMesh(group, new THREE.TorusGeometry(0.078, 0.009, 8, 16), darkCage, 0, 0.06, 0.02, 0, Math.PI / 2, 0);

  // Top & bottom activation caps + glowing violet nodes
  addCylinder(group, 0.036, 0.048, 0.03, darkCage, 0, 0.132, 0.02, 0, 0, 0, 10);
  addCylinder(group, 0.022, 0.022, 0.016, violetGlow, 0, 0.15, 0.02, 0, 0, 0, 10);
  addCylinder(group, 0.044, 0.032, 0.022, silver, 0, -0.012, 0.02, 0, 0, 0, 10);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.08, 0.22);
  return group;
}

function buildFragGrenade(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_frag_grenade';

  const olive = makeStandardMat('#4d7c0f', 0.55, 0.22);
  const darkOlive = makeStandardMat('#365314', 0.62, 0.25);
  const steel = makeStandardMat('#64748b', 0.3, 0.78);
  const pinMetal = makeStandardMat('#e2e8f0', 0.25, 0.85);

  // Faceted olive canister body + beveled top/bottom caps
  addCylinder(group, 0.056, 0.056, 0.095, olive, 0, 0.055, 0.02, 0, 0, 0, 8);
  addCylinder(group, 0.036, 0.056, 0.026, olive, 0, 0.115, 0.02, 0, 0, 0, 8);
  addCylinder(group, 0.056, 0.034, 0.024, olive, 0, -0.005, 0.02, 0, 0, 0, 8);

  // Faceted fragmentation waffle bands
  for (let yOff of [0.03, 0.058, 0.085]) {
    addCylinder(group, 0.060, 0.060, 0.014, darkOlive, 0, yOff, 0.02, 0, 0, 0, 8);
  }
  addBox(group, 0.122, 0.082, 0.016, darkOlive, 0, 0.055, 0.02);
  addBox(group, 0.016, 0.082, 0.122, darkOlive, 0, 0.055, 0.02);

  // Fuse head + safety spoon lever + metallic pull-pin ring
  addCylinder(group, 0.024, 0.028, 0.032, steel, 0, 0.142, 0.02, 0, 0, 0, 10);
  addBox(group, 0.02, 0.095, 0.012, steel, 0, 0.098, -0.044, -0.22, 0, 0);
  addMesh(group, new THREE.TorusGeometry(0.024, 0.0045, 6, 14), pinMetal, 0.032, 0.148, 0.02, 0, Math.PI / 2, 0);

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.08, 0.22);
  return group;
}

function buildChugSplash(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_chug_splash';

  const crateMat = makeStandardMat('#1e3a8a', 0.45, 0.25);
  const rimMat = makeStandardMat('#38bdf8', 0.3, 0.35, '#0ea5e9', 0.25);
  const flaskGlow = makeStandardMat('#06b6d4', 0.15, 0.15, '#22d3ee', 0.8);
  const capMat = makeStandardMat('#e2e8f0', 0.25, 0.8);

  // 6-pack tactical crate base + top rim + center carry handle
  addBox(group, 0.165, 0.075, 0.115, crateMat, 0, 0.03, 0.02);
  addBox(group, 0.172, 0.016, 0.122, rimMat, 0, 0.068, 0.02);
  addBox(group, 0.018, 0.085, 0.105, crateMat, 0, 0.10, 0.02);
  addBox(group, 0.024, 0.018, 0.11, rimMat, 0, 0.145, 0.02);

  // 6 glowing blue-cyan splash flasks (3x2 grid)
  const xs = [-0.052, 0, 0.052];
  const zs = [-0.014, 0.054];
  for (const fx of xs) {
    for (const fz of zs) {
      addCylinder(group, 0.018, 0.020, 0.075, flaskGlow, fx, 0.088, fz, 0, 0, 0, 10);
      addCylinder(group, 0.010, 0.018, 0.022, flaskGlow, fx, 0.135, fz, 0, 0, 0, 8);
      addCylinder(group, 0.012, 0.012, 0.012, capMat, fx, 0.150, fz, 0, 0, 0, 8);
    }
  }

  group.userData.muzzleOffset = new THREE.Vector3(0, 0.08, 0.24);
  return group;
}

function buildMiniShield(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_mini_shield';

  const potion = makeStandardMat('#0ea5e9', 0.18, 0.15, '#38bdf8', 0.55);
  const rim = makeStandardMat('#cbd5e1', 0.3, 0.65);
  const cork = makeStandardMat('#92400e', 0.8, 0.05);

  addCylinder(group, 0.058, 0.052, 0.13, potion, 0, 0.04, 0.02, 0, 0, 0, 12);
  addCylinder(group, 0.028, 0.055, 0.035, potion, 0, 0.12, 0.02, 0, 0, 0, 12);
  addCylinder(group, 0.032, 0.032, 0.02, rim, 0, 0.142, 0.02, 0, 0, 0, 12);
  addCylinder(group, 0.024, 0.02, 0.035, cork, 0, 0.165, 0.02, 0, 0, 0, 10);

  return group;
}

function buildShieldPotion(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_shield_potion';

  const potion = makeStandardMat('#0284c7', 0.15, 0.2, '#22d3ee', 0.6);
  const strap = makeStandardMat('#78350f', 0.75, 0.1);
  const cork = makeStandardMat('#a16207', 0.8, 0.05);

  addMesh(group, new THREE.SphereGeometry(0.088, 12, 10), potion, 0, 0.06, 0.02);
  addCylinder(group, 0.034, 0.048, 0.065, potion, 0, 0.15, 0.02, 0, 0, 0, 12);
  addCylinder(group, 0.04, 0.04, 0.022, strap, 0, 0.14, 0.02, 0, 0, 0, 12);
  addCylinder(group, 0.028, 0.024, 0.04, cork, 0, 0.195, 0.02, 0, 0, 0, 10);

  return group;
}

function buildBandages(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_bandages';

  const cloth = makeStandardMat('#f8fafc', 0.85, 0.02);
  const stripe = makeStandardMat('#ef4444', 0.65, 0.05);

  addCylinder(group, 0.044, 0.044, 0.12, cloth, -0.025, 0.05, 0.02, 0.15, 0, Math.PI / 2, 12);
  addCylinder(group, 0.046, 0.046, 0.028, stripe, -0.025, 0.05, 0.02, 0.15, 0, Math.PI / 2, 12);
  addCylinder(group, 0.042, 0.042, 0.11, cloth, 0.03, 0.08, -0.01, -0.2, 0.3, Math.PI / 2, 12);
  addCylinder(group, 0.044, 0.044, 0.026, stripe, 0.03, 0.08, -0.01, -0.2, 0.3, Math.PI / 2, 12);

  return group;
}

function buildMedkit(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_medkit';

  const white = makeStandardMat('#f8fafc', 0.45, 0.1);
  const red = makeStandardMat('#ef4444', 0.4, 0.1);
  const dark = makeStandardMat('#334155', 0.5, 0.35);

  addBox(group, 0.17, 0.13, 0.09, white, 0, 0.055, 0.03);
  // Carrying handle
  addBox(group, 0.08, 0.024, 0.028, dark, 0, 0.132, 0.03);
  // Latches
  addBox(group, 0.022, 0.022, 0.096, dark, -0.05, 0.105, 0.03);
  addBox(group, 0.022, 0.022, 0.096, dark, 0.05, 0.105, 0.03);
  // Red medical cross (front and back faces)
  addBox(group, 0.068, 0.022, 0.098, red, 0, 0.055, 0.03);
  addBox(group, 0.022, 0.068, 0.098, red, 0, 0.055, 0.03);

  return group;
}

function buildSlurpJuice(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_slurp_juice';

  const cyanGlow = makeStandardMat('#06b6d4', 0.15, 0.15, '#22d3ee', 0.65);
  const limeGlow = makeStandardMat('#84cc16', 0.15, 0.15, '#a3e635', 0.55);
  const lid = makeStandardMat('#cbd5e1', 0.3, 0.75);

  addCylinder(group, 0.058, 0.056, 0.11, cyanGlow, 0, 0.035, 0.02, 0, 0, 0, 12);
  addCylinder(group, 0.059, 0.059, 0.045, limeGlow, 0, 0.105, 0.02, 0, 0, 0, 12);
  addCylinder(group, 0.05, 0.056, 0.025, lid, 0, 0.14, 0.02, 0, 0, 0, 12);
  addCylinder(group, 0.042, 0.042, 0.015, lid, 0, 0.158, 0.02, 0, 0, 0, 12);

  return group;
}

/**
 * Creates a stylized procedural 3D weapon, throwable, or consumable mesh for any WeaponId.
 * All ranged weapons and throwables assign `group.userData.muzzleOffset` (THREE.Vector3) in local space.
 */
export function createWeaponModel(weaponId: WeaponId, pickaxeDef?: PickaxeDef): THREE.Group {
  switch (weaponId) {
    case 'pickaxe':
      return buildPickaxe(pickaxeDef ?? PICKAXES[0]);
    case 'ar':
      return buildAssaultRifle();
    case 'burst_ar':
      return buildBurstAR();
    case 'pump_shotgun':
      return buildPumpShotgun();
    case 'tac_shotgun':
      return buildTacShotgun();
    case 'heavy_shotgun':
      return buildHeavyShotgun();
    case 'smg':
      return buildSMG();
    case 'sniper':
      return buildSniper();
    case 'pistol':
      return buildPistol();
    case 'rocket_launcher':
      return buildRocketLauncher();
    case 'mythic_blade_rifle':
      return buildMythicBladeRifle();
    case 'shockwave_grenade':
      return buildShockwaveGrenade();
    case 'frag_grenade':
      return buildFragGrenade();
    case 'chug_splash':
      return buildChugSplash();
    case 'mini_shield':
      return buildMiniShield();
    case 'shield_potion':
      return buildShieldPotion();
    case 'bandages':
      return buildBandages();
    case 'medkit':
      return buildMedkit();
    case 'slurp_juice':
      return buildSlurpJuice();
  }
}

/**
 * Creates the holographic blue folded blueprint paper + yellow drafting pencil held in Build Mode.
 */
export function createBlueprintModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'weapon_blueprint';

  const paperMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
  });
  const gridLineMat = new THREE.MeshBasicMaterial({
    color: '#e0f2fe',
    transparent: true,
    opacity: 0.9,
  });

  // Two slightly folded holographic blueprint panels
  addBox(group, 0.16, 0.008, 0.22, paperMat, -0.075, 0.02, 0.06, -0.25, 0, 0.12);
  addBox(group, 0.16, 0.008, 0.22, paperMat, 0.075, 0.02, 0.06, -0.25, 0, -0.12);

  // Subtle holographic blueprint grid lines
  addBox(group, 0.26, 0.011, 0.008, gridLineMat, 0, 0.024, 0.03, -0.25, 0, 0);
  addBox(group, 0.26, 0.011, 0.008, gridLineMat, 0, 0.036, 0.09, -0.25, 0, 0);
  addBox(group, 0.008, 0.011, 0.18, gridLineMat, -0.05, 0.026, 0.06, -0.25, 0, 0.12);
  addBox(group, 0.008, 0.011, 0.18, gridLineMat, 0.05, 0.026, 0.06, -0.25, 0, -0.12);

  // Classic yellow drafting pencil hovering/resting beside paper
  const pencilMat = makeStandardMat('#facc15', 0.45, 0.1);
  const woodTipMat = makeStandardMat('#fde68a', 0.7, 0.05);
  const eraserMat = makeStandardMat('#f472b6', 0.75, 0.05);
  const leadMat = makeStandardMat('#1e293b', 0.5, 0.2);

  const pencilGroup = new THREE.Group();
  pencilGroup.position.set(0.08, 0.08, 0.10);
  pencilGroup.rotation.set(0.65, -0.3, 0.45);
  addCylinder(pencilGroup, 0.01, 0.01, 0.16, pencilMat, 0, 0, 0, 0, 0, 0, 6);
  addCylinder(pencilGroup, 0.01, 0.01, 0.02, eraserMat, 0, -0.09, 0, 0, 0, 0, 6);
  addCylinder(pencilGroup, 0.003, 0.01, 0.025, woodTipMat, 0, 0.092, 0, 0, 0, 0, 6);
  addCylinder(pencilGroup, 0.0008, 0.003, 0.01, leadMat, 0, 0.108, 0, 0, 0, 0, 6);
  group.add(pencilGroup);

  return group;
}
