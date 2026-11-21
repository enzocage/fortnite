import type { AmmoType, Rarity, Vec3Like } from './common';

export type WeaponId =
  | 'pickaxe'
  | 'ar'
  | 'burst_ar'
  | 'pump_shotgun'
  | 'tac_shotgun'
  | 'heavy_shotgun'
  | 'smg'
  | 'sniper'
  | 'pistol'
  | 'rocket_launcher'
  | 'mythic_blade_rifle'
  | 'shockwave_grenade'
  | 'frag_grenade'
  | 'chug_splash'
  | 'mini_shield'
  | 'shield_potion'
  | 'bandages'
  | 'medkit'
  | 'slurp_juice';

export type WeaponCategory =
  | 'pickaxe'
  | 'rifle'
  | 'shotgun'
  | 'smg'
  | 'sniper'
  | 'pistol'
  | 'launcher'
  | 'throwable'
  | 'consumable';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  shortName: string;
  category: WeaponCategory;
  ammoType: AmmoType | null;
  isConsumable: boolean;
  isProjectile: boolean;
  projectileSpeed: number;
  projectileGravity: number;
  splashRadius: number;
  baseDamage: number;
  structureDamage: number;
  headshotMultiplier: number;
  fireRate: number; // shots per second
  pellets: number;
  magSize: number;
  reloadTime: number;
  baseSpread: number; // radians
  adsSpread: number;
  crouchSpreadMult: number;
  moveSpreadAdd: number;
  bloomPerShot: number;
  bloomMax: number;
  bloomRecovery: number;
  range: number;
  falloffStart: number;
  falloffEnd: number;
  minFalloffMult: number;
  recoilPitch: number;
  recoilYaw: number;
  burstCount?: number;
  burstInterval?: number;
  healAmount?: number;
  healTarget?: 'hp' | 'shield' | 'both';
  healCap?: number;
  consumeTime?: number;
  maxStack: number;
  hotOverTime?: number; // seconds for slurp HoT
  isThrowable?: boolean;
  fuseTime?: number;
  impulseStrength?: number;
  splashHealAmount?: number;
  allowedRarities: Rarity[];
}

export interface ItemInstance {
  uid: string;
  weaponId: WeaponId;
  rarity: Rarity;
  magAmmo: number;
  stackCount: number;
}

export interface DamageEvent {
  targetId: string;
  attackerId: string;
  attackerName: string;
  weaponId: WeaponId;
  rarity: Rarity;
  damage: number;
  hpDamage: number;
  shieldDamage: number;
  isHeadshot: boolean;
  isElimination: boolean;
  hitPoint: Vec3Like;
  distance: number;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  ownerName: string;
  weaponId: WeaponId;
  rarity: Rarity;
  position: Vec3Like;
  velocity: Vec3Like;
  gravity: number;
  damage: number;
  structureDamage: number;
  headshotMultiplier: number;
  splashRadius: number;
  age: number;
  maxAge: number;
  alive: boolean;
  bouncesRemaining?: number;
  fuseRemaining?: number;
  isShockwave?: boolean;
  isSplashHeal?: boolean;
}
