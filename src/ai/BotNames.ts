import type { BotPersonality } from '../types';
import { GLIDERS, PICKAXES, SKINS, mulberry32 } from '../core';

export const BOT_NAMES: readonly string[] = [
  'TiltedTaco',
  'StormChaser99',
  'RampRushRex',
  'LlamaKing',
  'BushCampBarry',
  'PumpShottyPro',
  'PixelSniper',
  'CrankNinety',
  'LootGoblin_X',
  'SkyBaseSam',
  'ZoneWarrior',
  'ChugJugChad',
  'NoScopeNina',
  'BuildBob',
  'TurboEditz',
  'GliderAce',
  'FrostByte',
  'VictoryViper',
  'CrystalHawk',
  'SunnySlayer',
  'MetroMaven',
  'CraterCaptain',
  'PinePhantom',
  'ShadowBoxer',
  'ScarLegend',
  'ShieldPopper',
  'RiftRaider',
  'HyperBuilder',
  'TacticalTim',
  'BoogieBot_TV',
  'NeonKnight',
  'QuickScopeQ',
  'HighgroundHank',
  'RocketRex',
  'SlurpSlinger',
  'ClutchCarl',
  'DropZoneDan',
  'WKeyWendy',
  'PeekABooPete',
  'TrapTowerTom',
  'BluePumpBen',
  'GoldScarGus',
  'StormEdgeEva',
  'HarvestHero',
  'MatFarmerMax',
  'FlickShotFaye',
  'GlideMaster',
  'BattleBusBoi',
  'CrownSeeker',
  'VortexValk',
  'LaserBeamLeo',
  'RoofRunner',
  'CanyonCrow',
  'BunkerBuster',
  'DriftKing_99',
  'BriteBomberZ',
  'CozyCampfire',
  'RebootReady',
  'SweatySocks',
  'LootLlamaLou',
  'SniperWolfie',
  'BoxFightBro',
  'ZeroBuildZack',
  'OmegaZero',
  'TimberTitan',
  'MeteorMike',
  'TornadoTessa',
  'BlitzBriggs',
  'PulsePirate',
  'VanguardVic',
  'CobaltCobra',
  'ApexAlbatross',
];

const PERSONALITIES: readonly BotPersonality[] = [
  'rusher',
  'builder',
  'sniper',
  'looter',
];

export interface BotLoadoutCosmetics {
  name: string;
  skinId: string;
  pickaxeId: string;
  gliderId: string;
  personality: BotPersonality;
}

/**
 * Deterministically picks a bot's display name, cosmetics, and AI personality
 * without duplicating names across the first `BOT_NAMES.length` bots for a given seed.
 */
export function pickBotLoadoutCosmetics(
  index: number,
  seed: number,
): BotLoadoutCosmetics {
  const safeIndex = Math.max(0, Math.floor(index));
  const poolLen = BOT_NAMES.length;

  // Deterministic seeded Fisher-Yates order over BOT_NAMES
  const order = Array.from({ length: poolLen }, (_, i) => i);
  const shuffleRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  for (let i = poolLen - 1; i > 0; i--) {
    const j = Math.floor(shuffleRng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }

  const baseName = BOT_NAMES[order[safeIndex % poolLen]];
  const lap = Math.floor(safeIndex / poolLen);
  const name = lap === 0 ? baseName : `${baseName}_${lap + 1}`;

  const itemRng = mulberry32(((seed + 1) * 73856093) ^ ((safeIndex + 1) * 19349663));
  const skin = SKINS[Math.floor(itemRng() * SKINS.length)] ?? SKINS[0];
  const pickaxe = PICKAXES[Math.floor(itemRng() * PICKAXES.length)] ?? PICKAXES[0];
  const glider = GLIDERS[Math.floor(itemRng() * GLIDERS.length)] ?? GLIDERS[0];
  const personality =
    PERSONALITIES[Math.floor(itemRng() * PERSONALITIES.length)] ?? 'rusher';

  return {
    name,
    skinId: skin.id,
    pickaxeId: pickaxe.id,
    gliderId: glider.id,
    personality,
  };
}
