import './ui.css';
import { EventBus } from '../core';
import type {
  BannerMessage,
  DamageNumberEvent,
  EmoteId,
  GamePhase,
  GameSettings,
  HUDState,
  KillFeedEntry,
  LaunchPadEntity,
  LobbyConfig,
  MatchSummary,
  ZiplineEntity,
} from '../types';
import { FullMapOverlay } from './FullMapOverlay';
import { HUDManager } from './HUDManager';
import { LobbyScreen, saveStoredSettings } from './LobbyScreen';
import { MatchOverlay } from './MatchOverlay';

export interface UIManagerCallbacks {
  onStartMatch?: (config: LobbyConfig) => void;
  onCosmeticChange?: (
    cosmetics: Pick<
      LobbyConfig,
      'skinId' | 'pickaxeId' | 'gliderId' | 'selectedEmote'
    >,
  ) => void;
  onSettingsChange?: (settings: GameSettings) => void;
  onEmoteSelect?: (emoteId: EmoteId) => void;
  onWaypointChange?: (waypoint: { x: number; z: number } | null) => void;
  onResume?: () => void;
  onPlayAgain?: () => void;
  onReturnLobby?: () => void;
  onEditTileToggle?: (tileIndex: number) => void;
  onEditConfirm?: () => void;
  onEditReset?: () => void;
  onPreviewEmote?: (emoteId: EmoteId) => void;
}

export class UIManager {
  private readonly rootEl: HTMLElement;
  private readonly eventBus: EventBus;
  private callbacks: UIManagerCallbacks;

  private containerEl: HTMLDivElement;
  private lobby: LobbyScreen;
  private hud: HUDManager;
  private fullMap: FullMapOverlay;
  private matchOverlay: MatchOverlay;

  private currentPhase: GamePhase = 'lobby';
  private unsubscribers: Array<() => void> = [];

  constructor(
    rootEl: HTMLElement,
    eventBus: EventBus,
    callbacks: UIManagerCallbacks = {},
  ) {
    this.rootEl = rootEl;
    this.eventBus = eventBus;
    this.callbacks = callbacks;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'fdr-root';
    this.rootEl.appendChild(this.containerEl);

    this.lobby = new LobbyScreen(this.containerEl, this.eventBus, {
      onStartMatch: (config) => this.callbacks.onStartMatch?.(config),
      onCosmeticChange: (cosmetics) =>
        this.callbacks.onCosmeticChange?.(cosmetics),
      onSettingsChange: (settings) => this.handleSettingsUpdate(settings),
      onPreviewEmote: (emoteId) => this.callbacks.onPreviewEmote?.(emoteId),
    });

    const initialSettings = this.lobby.getSettings();

    this.hud = new HUDManager(this.containerEl, initialSettings, {
      onEmoteSelect: (emoteId) => {
        this.syncOverlaySuppression();
        this.callbacks.onEmoteSelect?.(emoteId);
      },
      onEditTileToggle: (tileIndex) =>
        this.callbacks.onEditTileToggle?.(tileIndex),
      onEditConfirm: () => this.callbacks.onEditConfirm?.(),
      onEditReset: () => this.callbacks.onEditReset?.(),
    });

    this.fullMap = new FullMapOverlay(this.containerEl, {
      onWaypointChange: (wp) => this.callbacks.onWaypointChange?.(wp),
      onCloseRequest: () => this.syncOverlaySuppression(),
    });

    this.matchOverlay = new MatchOverlay(
      this.containerEl,
      this.eventBus,
      initialSettings,
      {
        onResume: () => {
          this.syncOverlaySuppression();
          this.callbacks.onResume?.();
        },
        onPlayAgain: () => {
          this.syncOverlaySuppression();
          this.callbacks.onPlayAgain?.();
        },
        onReturnLobby: () => {
          this.syncOverlaySuppression();
          this.callbacks.onReturnLobby?.();
        },
        onSettingsChange: (settings) => this.handleSettingsUpdate(settings),
      },
    );

    this.bindEventBus();
    this.setPhase('lobby');
  }

  setCallbacks(callbacks: UIManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setTerrainMapCanvas(canvas: HTMLCanvasElement): void {
    this.hud.setTerrainMapCanvas(canvas);
    this.fullMap.setTerrainMapCanvas(canvas);
  }

  setWorldTraversal(launchPads: LaunchPadEntity[], ziplines: ZiplineEntity[]): void {
    this.fullMap.setWorldTraversal(launchPads, ziplines);
  }

  setPhase(phase: GamePhase): void {
    const prevPhase = this.currentPhase;
    this.currentPhase = phase;
    const isLobby = phase === 'lobby';
    const isEnd = phase === 'eliminated' || phase === 'victory';
    const wasInactive =
      prevPhase === 'lobby' ||
      prevPhase === 'eliminated' ||
      prevPhase === 'victory';

    this.lobby.setVisible(isLobby);
    this.hud.setVisible(!isLobby);

    if (isLobby) {
      this.fullMap.setOpen(false);
      this.matchOverlay.setPauseMenuOpen(false);
      this.matchOverlay.hideMatchSummary();
      this.matchOverlay.clearBanners();
      this.hud.setEmoteWheelOpen(false);
      this.hud.clearTransient();
    } else if (!isEnd) {
      if (wasInactive) {
        this.hud.clearTransient();
      }
      this.matchOverlay.hideMatchSummary();
    } else {
      this.fullMap.setOpen(false);
      this.matchOverlay.setPauseMenuOpen(false);
      this.hud.setEmoteWheelOpen(false);
    }

    this.syncOverlaySuppression();
  }

  updateHUD(state: HUDState): void {
    this.hud.update(state);
    this.fullMap.update(state);
  }

  showMatchSummary(summary: MatchSummary): void {
    this.fullMap.setOpen(false);
    this.hud.setEmoteWheelOpen(false);
    this.matchOverlay.showMatchSummary(summary);
    this.syncOverlaySuppression();
  }

  toggleFullMap(force?: boolean): boolean {
    if (this.currentPhase === 'lobby') return false;
    const next = this.fullMap.toggle(force);
    if (next) {
      this.matchOverlay.setPauseMenuOpen(false);
      this.hud.setEmoteWheelOpen(false);
    }
    this.syncOverlaySuppression();
    return next;
  }

  togglePauseMenu(force?: boolean): boolean {
    if (this.currentPhase === 'lobby') return false;
    const next = this.matchOverlay.togglePauseMenu(force);
    if (next) {
      this.fullMap.setOpen(false);
      this.hud.setEmoteWheelOpen(false);
    }
    this.syncOverlaySuppression();
    return next;
  }

  toggleEmoteWheel(force?: boolean): boolean {
    if (this.currentPhase === 'lobby') return false;
    const next = this.hud.toggleEmoteWheel(force);
    if (next) {
      this.fullMap.setOpen(false);
      this.matchOverlay.setPauseMenuOpen(false);
    }
    this.syncOverlaySuppression();
    return next;
  }

  isOverlayOpen(): boolean {
    return (
      this.fullMap.isOpen() ||
      this.matchOverlay.isPauseOpen() ||
      this.matchOverlay.isSummaryOpen() ||
      this.hud.isEmoteWheelOpen()
    );
  }

  addKillFeed(entry: KillFeedEntry): void {
    this.hud.addKillFeed(entry);
  }

  addDamageNumber(event: DamageNumberEvent): void {
    this.hud.addDamageNumber(event);
  }

  showBanner(banner: BannerMessage): void {
    this.matchOverlay.showBanner(banner);
  }

  getSettings(): GameSettings {
    return this.lobby.getSettings();
  }

  getLobbyConfig(): LobbyConfig {
    return this.lobby.getConfig();
  }

  private handleSettingsUpdate(settings: GameSettings): void {
    const copy = { ...settings };
    saveStoredSettings(copy);
    this.lobby.syncSettings(copy);
    this.hud.setSettings(copy);
    this.matchOverlay.setSettings(copy);
    this.callbacks.onSettingsChange?.(copy);
  }

  private syncOverlaySuppression(): void {
    this.hud.setOverlaySuppressed(this.isOverlayOpen());
  }

  private bindEventBus(): void {
    this.unsubscribers.push(
      this.eventBus.on('combat:killfeed', (entry) => {
        this.addKillFeed(entry);
      }),
      this.eventBus.on('ui:damage_number', (ev) => {
        this.addDamageNumber(ev);
      }),
      this.eventBus.on('ui:banner', (banner) => {
        this.showBanner(banner);
      }),
      this.eventBus.on('combat:hitmarker', (hm) => {
        this.hud.triggerHitmarker({
          timestamp: Date.now(),
          isHeadshot: hm.isHeadshot,
          isShield: hm.isShield,
          isElimination: hm.isElimination,
        });
      }),
    );
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.lobby.dispose();
    this.hud.dispose();
    this.fullMap.dispose();
    this.matchOverlay.dispose();
    this.containerEl.remove();
  }
}
