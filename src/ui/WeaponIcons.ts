import type { AmmoType, BuildPieceType, MaterialType, WeaponId } from '../types';

const WEAPON_SVGS: Record<WeaponId, string> = {
  pickaxe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M12 52L42 22" stroke="#f8fafc" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M12 52L19 45" stroke="#ffd000" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M24 12C35 12 45 18 52 29L43 32C39 25 32 20 22 19L24 12Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M37 15L49 27L42 31L32 21Z" fill="#38bdf8"/>
    <rect x="38" y="18" width="8" height="8" rx="1.5" transform="rotate(45 42 22)" fill="#ffd000" stroke="#0f172a" stroke-width="1.5"/>
  </svg>`,

  ar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M6 34L17 31L18 39L8 42L6 34Z" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M17 28H45V35H36L38 47H32L29 36H23L20 45H15L17 28Z" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M45 30H59V33H45V30Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.5"/>
    <path d="M24 23H39V28H24V23Z" fill="#94a3b8" stroke="#0f172a" stroke-width="1.5"/>
    <path d="M22 20H25V24H22V20ZM37 20H40V24H37V20Z" fill="#ffd000"/>
    <rect x="27" y="30" width="12" height="3" rx="1" fill="#334155"/>
  </svg>`,

  burst_ar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M7 33L18 29H46V35H38L41 47H35L31 35H21L17 44H12L15 36L7 37V33Z" fill="#f1f5f9" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M20 22H42L44 29H18L20 22Z" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M46 30.5H59V33.5H46V30.5Z" fill="#94a3b8" stroke="#0f172a" stroke-width="1.5"/>
    <rect x="25" y="24" width="14" height="3" rx="1" fill="#0f172a"/>
    <circle cx="53" cy="24" r="2.2" fill="#ffd000"/>
    <circle cx="47" cy="24" r="2.2" fill="#ffd000"/>
    <circle cx="41" cy="24" r="2.2" fill="#ffd000"/>
  </svg>`,

  pump_shotgun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M6 39L18 33L21 40L10 46L6 39Z" fill="#d97706" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="18" y="29" width="22" height="7" rx="1.5" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8"/>
    <rect x="40" y="28.5" width="19" height="3.5" rx="1" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.5"/>
    <rect x="40" y="33" width="14" height="3" rx="1" fill="#94a3b8" stroke="#0f172a" stroke-width="1.4"/>
    <rect x="33" y="34" width="13" height="4.5" rx="1.5" fill="#b45309" stroke="#0f172a" stroke-width="1.5"/>
    <path d="M23 36L20 44H25L27 36" fill="#334155" stroke="#0f172a" stroke-width="1.5"/>
  </svg>`,

  tac_shotgun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M7 34L17 30V38L9 42L7 34Z" fill="#ef4444" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M17 26H45V36H33L31 46H25L26 36H17V26Z" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="45" y="27" width="13" height="4" rx="1" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.5"/>
    <rect x="45" y="32" width="10" height="3" rx="1" fill="#94a3b8" stroke="#0f172a" stroke-width="1.4"/>
    <rect x="22" y="28.5" width="19" height="4" rx="1" fill="#dc2626"/>
    <rect x="35" y="36" width="8" height="4" rx="1" fill="#475569" stroke="#0f172a" stroke-width="1.3"/>
  </svg>`,

  smg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M10 31H17V37H10V31Z" fill="#64748b" stroke="#0f172a" stroke-width="1.6"/>
    <path d="M17 26H43V34H36L39 48H33L29 35H24L21 44H16L17 26Z" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="43" y="28" width="12" height="3.5" rx="1" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.5"/>
    <rect x="26" y="22" width="8" height="4" rx="1" fill="#38bdf8" stroke="#0f172a" stroke-width="1.4"/>
    <rect x="21" y="29" width="16" height="2.6" rx="1" fill="#1e293b"/>
  </svg>`,

  sniper: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M21 21H37V25H21V21Z" fill="#38bdf8" stroke="#0f172a" stroke-width="1.6"/>
    <path d="M24 25V29M34 25V29" stroke="#f8fafc" stroke-width="2.2"/>
    <path d="M5 35L16 31H42V36H29L27 45H22L23 36H14L7 41L5 35Z" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="42" y="31.5" width="18" height="2.8" rx="1" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.4"/>
    <path d="M43 36L48 44M43 36L39 44" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  </svg>`,

  pistol: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M16 23H48V31H30L25 48H17L21 31H16V23Z" fill="#f8fafc" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <rect x="20" y="25" width="23" height="3" rx="1" fill="#64748b"/>
    <path d="M30 31H35V38H29" stroke="#cbd5e1" stroke-width="2" stroke-linejoin="round"/>
    <rect x="44" y="20" width="3" height="3" fill="#ffd000"/>
  </svg>`,

  rocket_launcher: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M8 29L13 26V38L8 35V29Z" fill="#475569" stroke="#0f172a" stroke-width="1.6"/>
    <rect x="13" y="27" width="34" height="10" rx="2" fill="#84cc16" stroke="#0f172a" stroke-width="2"/>
    <path d="M47 26L58 32L47 38V26Z" fill="#ef4444" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M23 37L20 46H26L28 37M36 37L38 45H42L40 37" fill="#334155" stroke="#0f172a" stroke-width="1.6"/>
    <rect x="21" y="29.5" width="18" height="4" rx="1" fill="#3f6212"/>
  </svg>`,

  mini_shield: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="26" y="10" width="12" height="6" rx="1.5" fill="#d97706" stroke="#0f172a" stroke-width="1.8"/>
    <path d="M25 16H39V22L47 32V49C47 52.3 44.3 55 41 55H23C19.7 55 17 52.3 17 49V32L25 22V16Z" fill="#0ea5e9" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M20 35H44V49C44 50.7 42.7 52 41 52H23C21.3 52 20 50.7 20 49V35Z" fill="#22d3ee"/>
    <path d="M24 30L28 36M38 24L42 30" stroke="#e0f2fe" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  shield_potion: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="25" y="8" width="14" height="7" rx="2" fill="#f59e0b" stroke="#0f172a" stroke-width="1.8"/>
    <path d="M26 15H38V21C46 24 51 31 51 40C51 50 43 56 32 56C21 56 13 50 13 40C13 31 18 24 26 21V15Z" fill="#0284c7" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M16 39C16 48 23 53 32 53C41 53 48 48 48 39H16Z" fill="#38bdf8"/>
    <path d="M21 31C20 33 20 36 20 38" stroke="#e0f2fe" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 28L38 31V36C38 40 35.5 43 32 45C28.5 43 26 40 26 36V31L32 28Z" fill="#e0f2fe"/>
  </svg>`,

  bandages: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="12" y="20" width="40" height="26" rx="6" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
    <ellipse cx="44" cy="33" rx="7" ry="12" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.8"/>
    <ellipse cx="44" cy="33" rx="3" ry="5.5" fill="#94a3b8"/>
    <rect x="22" y="25" width="4" height="16" rx="1" fill="#ef4444"/>
    <rect x="16" y="31" width="16" height="4" rx="1" fill="#ef4444"/>
  </svg>`,

  medkit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M23 18V13C23 11.3 24.3 10 26 10H38C39.7 10 41 11.3 41 13V18" stroke="#f8fafc" stroke-width="4" stroke-linecap="round"/>
    <rect x="10" y="18" width="44" height="34" rx="6" fill="#f8fafc" stroke="#0f172a" stroke-width="2.2"/>
    <rect x="10" y="18" width="44" height="8" rx="3" fill="#e2e8f0"/>
    <rect x="29" y="27" width="6" height="18" rx="1.5" fill="#22c55e"/>
    <rect x="23" y="33" width="18" height="6" rx="1.5" fill="#22c55e"/>
  </svg>`,

  slurp_juice: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="22" y="10" width="20" height="7" rx="2" fill="#94a3b8" stroke="#0f172a" stroke-width="1.8"/>
    <rect x="17" y="17" width="30" height="38" rx="6" fill="#06b6d4" stroke="#0f172a" stroke-width="2.2"/>
    <path d="M20 33C26 30 34 36 44 32V50C44 51.7 42.7 53 41 53H23C21.3 53 20 51.7 20 50V33Z" fill="#4ade80"/>
    <circle cx="27" cy="43" r="2.5" fill="#ecfeff"/>
    <circle cx="36" cy="39" r="2" fill="#ecfeff"/>
    <circle cx="33" cy="48" r="1.8" fill="#ecfeff"/>
  </svg>`,

  heavy_shotgun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="10" y="28" width="44" height="10" rx="2" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/></svg>`,
  mythic_blade_rifle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="8" y="27" width="48" height="11" rx="2" fill="#facc15" stroke="#0f172a" stroke-width="2"/></svg>`,
  shockwave_grenade: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="34" r="14" fill="#a855f7" stroke="#0f172a" stroke-width="2"/></svg>`,
  frag_grenade: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="34" r="14" fill="#15803d" stroke="#0f172a" stroke-width="2"/></svg>`,
  chug_splash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="20" y="18" width="24" height="30" rx="5" fill="#38bdf8" stroke="#0f172a" stroke-width="2"/></svg>`,
};

const BUILD_SVGS: Record<BuildPieceType, string> = {
  wall: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="11" y="12" width="42" height="40" rx="3" fill="rgba(255,255,255,0.16)" stroke="#f8fafc" stroke-width="3"/>
    <path d="M11 25H53M11 39H53M25 12V25M39 25V39M25 39V52" stroke="#f8fafc" stroke-width="2.6"/>
  </svg>`,
  floor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M16 20H48L56 44H8L16 20Z" fill="rgba(255,255,255,0.18)" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round"/>
    <path d="M26 20L22 44M38 20L42 44M12 32H52" stroke="#f8fafc" stroke-width="2.4"/>
  </svg>`,
  ramp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M10 48L50 14L54 48H10Z" fill="rgba(255,255,255,0.16)" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round"/>
    <path d="M18 48L46 24M28 48L48 31M38 48L50 38" stroke="#f8fafc" stroke-width="2.2"/>
  </svg>`,
  roof: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M32 13L54 47H10L32 13Z" fill="rgba(255,255,255,0.18)" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 13V47M21 30H43" stroke="#f8fafc" stroke-width="2.4"/>
  </svg>`,
};

const MATERIAL_SVGS: Record<MaterialType, string> = {
  wood: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M10 22L48 12L54 24L16 34L10 22Z" fill="#d97706" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M10 38L48 28L54 40L16 50L10 38Z" fill="#b45309" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="51" cy="18" r="3" fill="#fde68a"/>
    <circle cx="51" cy="34" r="3" fill="#fde68a"/>
  </svg>`,
  brick: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="8" y="16" width="22" height="12" rx="2" fill="#dc2626" stroke="#0f172a" stroke-width="2"/>
    <rect x="34" y="16" width="22" height="12" rx="2" fill="#ef4444" stroke="#0f172a" stroke-width="2"/>
    <rect x="20" y="30" width="24" height="12" rx="2" fill="#b91c1c" stroke="#0f172a" stroke-width="2"/>
    <rect x="8" y="44" width="22" height="10" rx="2" fill="#ef4444" stroke="#0f172a" stroke-width="2"/>
    <rect x="34" y="44" width="22" height="10" rx="2" fill="#dc2626" stroke="#0f172a" stroke-width="2"/>
  </svg>`,
  metal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M12 16H52V28H37V48H52V54H12V48H27V28H12V16Z" fill="#94a3b8" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M16 20H48" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="18" cy="22" r="2" fill="#38bdf8"/>
    <circle cx="46" cy="22" r="2" fill="#38bdf8"/>
  </svg>`,
};

const AMMO_SVGS: Record<AmmoType, string> = {
  light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect x="8" y="10" width="5" height="16" rx="2" fill="#fbbf24"/><rect x="15" y="10" width="5" height="16" rx="2" fill="#fbbf24"/><rect x="22" y="10" width="5" height="16" rx="2" fill="#fbbf24"/></svg>`,
  medium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="M9 26V12L12 6L15 12V26H9ZM18 26V12L21 6L24 12V26H18Z" fill="#fbbf24"/></svg>`,
  shells: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect x="7" y="8" width="7" height="18" rx="1.5" fill="#ef4444"/><rect x="7" y="21" width="7" height="5" fill="#fbbf24"/><rect x="18" y="8" width="7" height="18" rx="1.5" fill="#ef4444"/><rect x="18" y="21" width="7" height="5" fill="#fbbf24"/></svg>`,
  heavy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="M12 28V11L16 3L20 11V28H12Z" fill="#38bdf8"/></svg>`,
  rockets: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="M11 26V13L16 4L21 13V26H11Z" fill="#f97316"/><path d="M9 26L11 21M23 26L21 21" stroke="#cbd5e1" stroke-width="2"/></svg>`,
};

export function getWeaponSvg(id: WeaponId): string {
  return WEAPON_SVGS[id];
}

export function getBuildIconSvg(type: BuildPieceType): string {
  return BUILD_SVGS[type];
}

export function getMaterialIconSvg(mat: MaterialType): string {
  return MATERIAL_SVGS[mat];
}

export function getAmmoIconSvg(ammo: AmmoType): string {
  return AMMO_SVGS[ammo];
}

export function getSkullSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M32 8C18.7 8 10 17.5 10 29.5C10 36.8 13.8 43 19.5 46.5V54C19.5 55.7 20.8 57 22.5 57H41.5C43.2 57 44.5 55.7 44.5 54V46.5C50.2 43 54 36.8 54 29.5C54 17.5 45.3 8 32 8Z" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="22.5" cy="30" r="5.5" fill="#0f172a"/>
    <circle cx="41.5" cy="30" r="5.5" fill="#0f172a"/>
    <path d="M32 36L28.5 42H35.5L32 36Z" fill="#0f172a"/>
    <path d="M25 50V57M32 50V57M39 50V57" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}

export function getStormEyeSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M8 32C14.5 21 22.5 16 32 16C41.5 16 49.5 21 56 32C49.5 43 41.5 48 32 48C22.5 48 14.5 43 8 32Z" fill="#6d28d9" stroke="#e9d5ff" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="10" fill="#a855f7" stroke="#f5d0fe" stroke-width="2"/>
    <path d="M34 22L28 32H34L30 42" stroke="#ffd000" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function getCrownSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <path d="M10 47L6 19L21 30L32 12L43 30L58 19L54 47H10Z" fill="#ffd000" stroke="#78350f" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="10" y="47" width="44" height="7" rx="2" fill="#f59e0b" stroke="#78350f" stroke-width="2.2"/>
    <circle cx="32" cy="12" r="3.5" fill="#fef08a"/>
    <circle cx="6" cy="19" r="3" fill="#fef08a"/>
    <circle cx="58" cy="19" r="3" fill="#fef08a"/>
    <circle cx="32" cy="37" r="4" fill="#38bdf8" stroke="#0f172a" stroke-width="1.5"/>
  </svg>`;
}
