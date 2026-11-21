import type {
  Difficulty,
  GamePhase,
  MaterialType,
  Vec3Like,
  AmmoType,
} from './common';
import type { BuildPieceType, EditModeState } from './building';
import type { EmoteId } from './character';
import type { ItemInstance } from './weapons';
import type { StormState } from './world';

export interface MinimapBlip {
  id: string;
  x: number;
  z: number;
  kind: 'gunfire' | 'chest' | 'supply_drop' | 'bot';
  age: number;
  maxAge: number;
}

export interface HitmarkerFeedback {
  timestamp: number;
  isHeadshot: boolean;
  isShield: boolean;
  isElimination: boolean;
}

export interface DamageDirectionFeedback {
  timestamp: number;
  angleRad: number;
}

export interface HUDState {
  phase: GamePhase;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  stamina: number;
  isSprinting: boolean;
  isCrouching: boolean;
  isAiming: boolean;
  isScoped: boolean;
  isBuildMode: boolean;
  activeBuildType: BuildPieceType;
  activeMaterial: MaterialType;
  buildRotation: 0 | 1 | 2 | 3;
  editMode: EditModeState;
  slots: (ItemInstance | null)[];
  activeSlot: number;
  ammo: Record<AmmoType, number>;
  materials: Record<MaterialType, number>;
  activeWeaponSpread: number;
  interactPrompt: {
    label: string;
    key: string;
    rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  } | null;
  reloadProgress: number | null;
  healProgress: number | null;
  healLabel: string | null;
  aliveCount: number;
  totalPlayers: number;
  kills: number;
  stormState: StormState;
  busProgress: number;
  busStart: Vec3Like;
  busEnd: Vec3Like;
  busPos: Vec3Like;
  playerPos: Vec3Like;
  playerYaw: number;
  mapWaypoint: { x: number; z: number } | null;
  compassHeading: number; // degrees 0..360 (0=N, 90=E, 180=S, 270=W)
  fps: number;
  pointerLocked: boolean;
  canDeployGlider: boolean;
  canJumpBus: boolean;
  hitmarker: HitmarkerFeedback | null;
  damageDirection: DamageDirectionFeedback | null;
  audioBlips: MinimapBlip[];
  inStorm: boolean;
}

export interface DamageNumberEvent {
  id: string;
  worldPos: Vec3Like;
  screenX?: number;
  screenY?: number;
  visible?: boolean;
  amount: number;
  isShield: boolean;
  isHeadshot: boolean;
  timestamp: number;
}

export interface LobbyConfig {
  playerName: string;
  difficulty: Difficulty;
  botCount: number;
  skinId: string;
  pickaxeId: string;
  gliderId: string;
  selectedEmote: EmoteId;
}

export interface MatchSummary {
  victory: boolean;
  placement: number;
  totalPlayers: number;
  kills: number;
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
  headshots: number;
  structuresBuilt: number;
  chestsOpened: number;
  survivalTimeSec: number;
  eliminatedBy?: string;
}

export interface BannerMessage {
  id: string;
  title: string;
  subtitle?: string;
  tone: 'info' | 'storm' | 'elim' | 'victory';
  durationMs: number;
}
