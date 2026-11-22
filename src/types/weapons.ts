import type { AmmoType, Rarity, Vec3Like, WeaponModId } from './common';

export type WeaponId =
  | 'pickaxe'
  | 'ar'
  | 'burst_ar'
  | 'tactical_dmr'
  | 'pump_shotgun'
  | 'tac_shotgun'
  | 'heavy_shotgun'
  | 'smg'
  | 'combat_smg'
  | 'minigun'
  | 'sniper'
  | 'boom_bow'
  | 'railgun'
  | 'pistol'
  | 'rocket_launcher'
  | 'mythic_blade_rifle'
  | 'kinetic_blade'
  | 'shockwave_grenade'
  | 'frag_grenade'
  | 'chug_splash'
  | 'grappler'
  | 'shield_bubble'
  | 'port_a_bunker'
  | 'emp_grenade'
  | 'mini_shield'
  | 'shield_potion'
  | 'bandages'
  | 'medkit'
  | 'slurp_juice'
  | 'jetpack'
  | 'plasma_flamethrower'
  | 'shockwave_hammer'
  | 'flare_gun'
  | 'auto_turret'
  | 'chug_cannon';

export type WeaponCategory =
  | 'pickaxe'
  | 'rifle'
  | 'shotgun'
  | 'smg'
  | 'combat_smg'
  | 'minigun'
  | 'sniper'
  | 'boom_bow'
  | 'railgun'
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
  isGrappler?: boolean;
  isShieldBubble?: boolean;
  isKineticBlade?: boolean;
  dashCharges?: number;
  dashCooldownSec?: number;
  isBow?: boolean;
  bowMinChargeSec?: number;
  bowMaxChargeSec?: number;
  twinMagFastReloadTime?: number;
  isRailgun?: boolean;
  chargeTimeSec?: number;
  pierceBuildCount?: number;
  isMinigun?: boolean;
  spinUpSec?: number;
  heatPerShot?: number;
  coolRatePerSec?: number;
  isPortABunker?: boolean;
  isEmpGrenade?: boolean;
  empShieldDamage?: number;
  empDisableSec?: number;
  overheatLockSec?: number;
  isJetpack?: boolean;
  isFlamethrower?: boolean;
  burnDps?: number;
  burnDurationSec?: number;
  woodDamageMult?: number;
  isShockwaveHammer?: boolean;
  isFlareGun?: boolean;
  flareScanRadius?: number;
  hammerMaxCharges?: number;
  hammerChargeRegenSec?: number;
  isAutoTurret?: boolean;
  isChugCannon?: boolean;
  chugRegenSec?: number;
  allowedRarities: Rarity[];
}

export interface ItemInstance {
  uid: string;
  weaponId: WeaponId;
  rarity: Rarity;
  magAmmo: number;
  stackCount: number;
  mods?: WeaponModId[];
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
  isShieldBubble?: boolean;
  isBoomArrow?: boolean;
  isPortABunker?: boolean;
  isEmpGrenade?: boolean;
  isFlare?: boolean;
  flareScanRadius?: number;
  isAutoTurret?: boolean;
  isChugOrb?: boolean;
}
