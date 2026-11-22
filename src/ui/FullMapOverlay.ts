import { POIS, WORLD_SIZE } from '../core';
import type {
  ApexTrainState,
  CampfireEntity,
  CapturePointEntity,
  DroppedCrownEntity,
  DroppedMedallionEntity,
  ForecastTowerEntity,
  GameSettings,
  GrindRailEntity,
  HUDState,
  LaunchPadEntity,
  LootIslandState,
  MeteorCraterEntity,
  ModBenchEntity,
  NpcSpecialistEntity,
  RebootVanEntity,
  RiftEntity,
  SlurpTankerEntity,
  SupplyDroneEntity,
  UpgradeBenchEntity,
  VaultEntity,
  VehicleEntity,
  VendingMachineEntity,
  WeaponBunkerEntity,
  ZiplineEntity,
} from '../types';
import {
  BOSS_POI_LABELS,
  drawChapterMapOverlay,
  drawFrontierMapOverlay,
  drawOverdriveMapOverlay,
  drawSkyforgeMapOverlay,
  formatKeyCodeLabel,
  mapNormToWorld,
  type ResolvedChapterOverlay,
  type ResolvedOverdriveOverlay,
  resolveChapterOverlayArgs,
  resolveFrontierOverlayArgs,
  resolveKeybinds,
  resolveOverdriveOverlayArgs,
  resolveSkyforgeOverlayArgs,
  type WorldChapterOverlay,
  type WorldFrontierOverlay,
  type WorldOverdriveOverlay,
  type WorldSkyforgeOverlay,
  worldToMapNorm,
} from './UIHelpers';
import {
  getAllyRoleSvg,
  getBunkerSvg,
  getCampfireIconSvg,
  getCaptureFlagIconSvg,
  getCrownSvg,
  getForecastTowerSvg,
  getGrindRailSvg,
  getHopCrystalSvg,
  getLootIslandIconSvg,
  getMedallionSvg,
  getModBenchSvg,
  getRebootVanSvg,
  getSkyRiftIconSvg,
  getSupplyDroneSvg,
  getTankerSvg,
  getTrainSvg,
  getUpgradeBenchIconSvg,
  getVaultLockSvg,
  getVehicleIconSvg,
  getVendingIconSvg,
} from './WeaponIcons';

export interface FullMapCallbacks {
  onWaypointChange: (waypoint: { x: number; z: number } | null) => void;
  onCloseRequest?: () => void;
}

const GRID_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export class FullMapOverlay {
  private readonly root: HTMLElement;
  private callbacks: FullMapCallbacks;

  private backdropEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private closeBtn: HTMLButtonElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private terrainMapCanvas: HTMLCanvasElement | null = null;
  private launchPads: LaunchPadEntity[] = [];
  private ziplines: ZiplineEntity[] = [];
  private vehicles: VehicleEntity[] = [];
  private vaults: VaultEntity[] = [];
  private upgradeBenches: UpgradeBenchEntity[] = [];
  private campfires: CampfireEntity[] = [];
  private rifts: RiftEntity[] = [];
  private capturePoints: CapturePointEntity[] = [];
  private vendingMachines: VendingMachineEntity[] = [];
  private npcSpecialists: NpcSpecialistEntity[] = [];
  private lootIsland: LootIslandState | null = null;
  private chapterOverlay: ResolvedChapterOverlay = {
    bunkers: [],
    tankers: [],
    droppedMedallions: [],
    droppedCrowns: [],
  };
  private overdriveOverlay: ResolvedOverdriveOverlay = {
    rails: [],
    vans: [],
    drones: [],
  };
  private frontierOverlay: WorldFrontierOverlay = {
    modBenches: [],
    forecastTowers: [],
  };
  private skyforgeOverlay: WorldSkyforgeOverlay = {
    train: null,
    craters: [],
  };

  private open = false;
  private lastState: HUDState | null = null;
  private lastDrawMs = 0;

  constructor(root: HTMLElement, callbacks: FullMapCallbacks) {
    this.root = root;
    this.callbacks = callbacks;

    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'fdr-fullmap-backdrop fdr-hidden';

    const frame = document.createElement('div');
    frame.className = 'fdr-fullmap-frame';

    const head = document.createElement('div');
    head.className = 'fdr-fullmap-head';

    const titleWrap = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'fdr-fullmap-title';
    titleEl.textContent = 'FORTDROP ISLAND — TACTICAL MAP';
    this.hintEl = document.createElement('div');
    this.hintEl.className = 'fdr-fullmap-hint';
    this.hintEl.textContent =
      'LEFT CLICK: SET WAYPOINT • RIGHT CLICK: CLEAR WAYPOINT • [M] CLOSE';
    titleWrap.append(titleEl, this.hintEl);

    this.closeBtn = document.createElement('button');
    this.closeBtn.type = 'button';
    this.closeBtn.className = 'fdr-btn fdr-btn-dark';
    this.closeBtn.style.padding = '5px 14px';
    this.closeBtn.style.fontSize = '15px';
    this.closeBtn.innerHTML = '<span>CLOSE [M]</span>';
    this.closeBtn.addEventListener('click', () => {
      this.setOpen(false);
      this.callbacks.onCloseRequest?.();
    });

    head.append(titleWrap, this.closeBtn);

    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 640;
    this.canvas.className = 'fdr-fullmap-canvas';
    this.ctx = this.canvas.getContext('2d');

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const nz = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const world = mapNormToWorld(nx, nz);
      this.callbacks.onWaypointChange(world);
      if (this.lastState) {
        this.lastState = { ...this.lastState, mapWaypoint: world };
        this.draw(this.lastState);
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.callbacks.onWaypointChange(null);
      if (this.lastState) {
        this.lastState = { ...this.lastState, mapWaypoint: null };
        this.draw(this.lastState);
      }
    });

    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) {
        this.setOpen(false);
        this.callbacks.onCloseRequest?.();
      }
    });

    const stage = document.createElement('div');
    stage.className = 'fdr-fullmap-stage';

    const legend = document.createElement('div');
    legend.className = 'fdr-map-legend';
    legend.innerHTML = `
      <div class="fdr-map-legend-title">TACTICAL LEGEND</div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch pad"></span>
        <span>LAUNCH PAD</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch geyser"></span>
        <span>THERMAL GEYSER</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch zipline"></span>
        <span>ENERGY ZIPLINE</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch safe"></span>
        <span>SAFE ZONE</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch boss">${getCrownSvg()}</span>
        <span>NAMED POI BOSS ZONE</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch vehicle">${getVehicleIconSvg('hover_atv')}</span>
        <span>VEHICLE</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch vault">${getVaultLockSvg(false)}</span>
        <span>BOSS VAULT</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch bench">${getUpgradeBenchIconSvg()}</span>
        <span>UPGRADE BENCH</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch campfire">${getCampfireIconSvg(true)}</span>
        <span>CAMPFIRE</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch rift">${getSkyRiftIconSvg(true)}</span>
        <span>SKY RIFT</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch flag">${getCaptureFlagIconSvg(true)}</span>
        <span>CAPTURE FLAG</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch vending">${getVendingIconSvg()}</span>
        <span>VENDING MACHINE</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch npc">${getAllyRoleSvg('scout')}</span>
        <span>SPECIALIST NPC</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch island">${getLootIslandIconSvg()}</span>
        <span>LOOT ISLAND</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch medallion-zone"></span>
        <span>MEDALLION ZONE</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch bunker">${getBunkerSvg(true)}</span>
        <span>WEAPON BUNKER</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch tanker">${getTankerSvg()}</span>
        <span>SLURP TANKER</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch medallion">${getMedallionSvg('medallion_combat')}</span>
        <span>DROPPED MEDALLION</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch crown">${getCrownSvg()}</span>
        <span>DROPPED CROWN</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch grindrail">${getGrindRailSvg()}</span>
        <span>GRIND RAIL</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch rebootvan">${getRebootVanSvg()}</span>
        <span>REBOOT VAN</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch drone">${getSupplyDroneSvg()}</span>
        <span>SUPPLY DRONE</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch modbench">${getModBenchSvg()}</span>
        <span>MOD BENCH</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch forecasttower">${getForecastTowerSvg()}</span>
        <span>FORECAST TOWER</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch apextrain">${getTrainSvg()}</span>
        <span>APEX TRAIN</span>
      </div>
      <div class="fdr-map-legend-row">
        <span class="fdr-legend-swatch riftcrater">${getHopCrystalSvg()}</span>
        <span>RIFT CRATER</span>
      </div>
    `;

    stage.append(this.canvas, legend);
    frame.append(head, stage);
    this.backdropEl.appendChild(frame);
    this.root.appendChild(this.backdropEl);
  }

  setCallbacks(callbacks: FullMapCallbacks): void {
    this.callbacks = callbacks;
  }

  setTerrainMapCanvas(canvas: HTMLCanvasElement): void {
    this.terrainMapCanvas = canvas;
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setSettings(settings: GameSettings): void {
    const mapKey = formatKeyCodeLabel(resolveKeybinds(settings.keybinds).map);
    this.hintEl.textContent = `LEFT CLICK: SET WAYPOINT • RIGHT CLICK: CLEAR WAYPOINT • [${mapKey}] CLOSE`;
    this.closeBtn.innerHTML = `<span>CLOSE [${mapKey}]</span>`;
  }

  setWorldTraversal(launchPads: LaunchPadEntity[], ziplines: ZiplineEntity[]): void {
    this.launchPads = launchPads;
    this.ziplines = ziplines;
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldVehicles(vehicles: VehicleEntity[]): void {
    this.vehicles = vehicles;
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldVaults(vaults: VaultEntity[]): void {
    this.vaults = vaults;
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldStations(
    benches: UpgradeBenchEntity[],
    campfires: CampfireEntity[],
  ): void {
    this.upgradeBenches = benches;
    this.campfires = campfires;
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldRiftsAndFlags(
    rifts: RiftEntity[],
    capturePoints: CapturePointEntity[],
  ): void {
    this.rifts = rifts;
    this.capturePoints = capturePoints;
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldEconomy(
    vendingMachines: VendingMachineEntity[],
    npcs: NpcSpecialistEntity[],
    lootIsland: LootIslandState | null,
  ): void {
    this.vendingMachines = vendingMachines;
    this.npcSpecialists = npcs;
    this.lootIsland = lootIsland;
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldChapterOverlay(
    bunkers: WeaponBunkerEntity[],
    tankers: SlurpTankerEntity[],
    droppedMedallions?: DroppedMedallionEntity[],
    droppedCrowns?: DroppedCrownEntity[],
  ): void;
  setWorldChapterOverlay(overlay: WorldChapterOverlay): void;
  setWorldChapterOverlay(
    bunkersOrOverlay: WeaponBunkerEntity[] | WorldChapterOverlay,
    tankers?: SlurpTankerEntity[],
    droppedMedallions?: DroppedMedallionEntity[],
    droppedCrowns?: DroppedCrownEntity[],
  ): void {
    this.chapterOverlay = resolveChapterOverlayArgs(
      bunkersOrOverlay,
      tankers,
      droppedMedallions,
      droppedCrowns,
    );
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldOverdriveOverlay(
    rails: GrindRailEntity[],
    vans: RebootVanEntity[],
    drones: SupplyDroneEntity[],
  ): void;
  setWorldOverdriveOverlay(overlay: WorldOverdriveOverlay): void;
  setWorldOverdriveOverlay(
    railsOrOverlay: GrindRailEntity[] | WorldOverdriveOverlay,
    vans?: RebootVanEntity[],
    drones?: SupplyDroneEntity[],
  ): void {
    this.overdriveOverlay = resolveOverdriveOverlayArgs(
      railsOrOverlay,
      vans,
      drones,
    );
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldFrontierOverlay(
    modBenches: ModBenchEntity[],
    forecastTowers: ForecastTowerEntity[],
  ): void;
  setWorldFrontierOverlay(overlay: WorldFrontierOverlay): void;
  setWorldFrontierOverlay(
    modBenchesOrOverlay: ModBenchEntity[] | WorldFrontierOverlay,
    forecastTowers?: ForecastTowerEntity[],
  ): void {
    this.frontierOverlay = resolveFrontierOverlayArgs(
      modBenchesOrOverlay,
      forecastTowers,
    );
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  setWorldSkyforgeOverlay(
    train: ApexTrainState | null,
    craters: MeteorCraterEntity[],
  ): void;
  setWorldSkyforgeOverlay(overlay: WorldSkyforgeOverlay): void;
  setWorldSkyforgeOverlay(
    trainOrOverlay: ApexTrainState | null | WorldSkyforgeOverlay,
    craters?: MeteorCraterEntity[],
  ): void {
    this.skyforgeOverlay = resolveSkyforgeOverlayArgs(trainOrOverlay, craters);
    if (this.open && this.lastState) {
      this.draw(this.lastState);
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): boolean {
    this.open = open;
    this.backdropEl.classList.toggle('fdr-hidden', !open);
    if (open && this.lastState) {
      this.draw(this.lastState);
    }
    return this.open;
  }

  toggle(force?: boolean): boolean {
    const next = typeof force === 'boolean' ? force : !this.open;
    return this.setOpen(next);
  }

  update(state: HUDState): void {
    this.lastState = state;
    if (!this.open) return;
    const now = performance.now();
    if (now - this.lastDrawMs >= 33) {
      this.lastDrawMs = now;
      this.draw(state);
    }
  }

  private draw(state: HUDState): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const size = this.canvas.width;
    const pxPerMeter = size / WORLD_SIZE;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#092d57';
    ctx.fillRect(0, 0, size, size);

    if (this.terrainMapCanvas) {
      ctx.drawImage(this.terrainMapCanvas, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#1b5e38';
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    const toPx = (wx: number, wz: number) => {
      const n = worldToMapNorm(wx, wz);
      return { x: n.nx * size, y: n.nz * size };
    };

    // Storm overlay outside current circle
    const storm = state.stormState;
    const sCenter = toPx(storm.currentCenterX, storm.currentCenterZ);
    const sRadPx = storm.currentRadius * pxPerMeter;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(sCenter.x, sCenter.y, Math.max(0, sRadPx), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(139, 36, 219, 0.36)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sCenter.x, sCenter.y, Math.max(0, sRadPx), 0, Math.PI * 2);
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Next safe zone circle
    if (storm.nextRadius > 0) {
      const nCenter = toPx(storm.nextCenterX, storm.nextCenterZ);
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(nCenter.x, nCenter.y, storm.nextRadius * pxPerMeter, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // A1-H8 Tactical Grid
    const step = size / 8;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = i * step;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    // Grid coordinates labels
    ctx.font = '700 13px "Barlow Condensed", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.textBaseline = 'top';
    for (let col = 0; col < 8; col++) {
      ctx.textAlign = 'center';
      ctx.fillText(GRID_COLS[col], col * step + step * 0.5, 5);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < 8; row++) {
      ctx.fillText(String(row + 1), 6, row * step + step * 0.5);
    }
    ctx.restore();

    // Battle Bus path
    const bStart = toPx(state.busStart.x, state.busStart.z);
    const bEnd = toPx(state.busEnd.x, state.busEnd.z);
    ctx.save();
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(bStart.x, bStart.y);
    ctx.lineTo(bEnd.x, bEnd.y);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();

    if (state.phase === 'bus' || state.phase === 'skydiving') {
      const bPos = toPx(state.busPos.x, state.busPos.z);
      ctx.save();
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bPos.x, bPos.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Zipline routes & Launch Pads / Thermal Geysers
    if (this.ziplines.length > 0) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.78)';
      ctx.lineWidth = 2.0;
      for (const zip of this.ziplines) {
        const a = toPx(zip.start.x, zip.start.z);
        const b = toPx(zip.end.x, zip.end.z);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 2.5, 0, Math.PI * 2);
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (this.launchPads.length > 0) {
      ctx.save();
      for (const pad of this.launchPads) {
        const p = toPx(pad.x, pad.z);
        ctx.fillStyle = pad.kind === 'geyser' ? '#fb923c' : '#38bdf8';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Driveable Vehicles
    if (this.vehicles.length > 0) {
      ctx.save();
      for (const vehicle of this.vehicles) {
        if (vehicle.destroyed) continue;
        const vp = toPx(vehicle.x, vehicle.z);
        const occupied = vehicle.driverId !== null;
        ctx.save();
        ctx.translate(vp.x, vp.y);
        if (vehicle.kind === 'cyber_bike') {
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = occupied ? '#ffd000' : '#22d3ee';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.6;
          ctx.fillRect(-4.5, -4.5, 9, 9);
          ctx.strokeRect(-4.5, -4.5, 9, 9);
        } else {
          ctx.fillStyle = occupied ? '#ffd000' : '#34eb5e';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.6;
          ctx.fillRect(-6, -4.5, 12, 9);
          ctx.strokeRect(-6, -4.5, 12, 9);
          ctx.fillStyle = '#e0f2fe';
          ctx.fillRect(-4, -2.5, 8, 2.5);
        }
        ctx.restore();
      }
      ctx.restore();
    }

    // Named POI Boss Zone dashed perimeters (underneath markers & text)
    for (const poi of POIS) {
      const p = toPx(poi.x, poi.z);
      const bossName = BOSS_POI_LABELS[poi.id];
      if (bossName) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(12, poi.radius * pxPerMeter), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 208, 0, 0.72)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 208, 0, 0.08)';
        ctx.fill();
        ctx.restore();
      }
    }

    // Stationary station markers drawn BEFORE POI text labels so no icons cross over POI names:
    // Upgrade Benches (cyan anvil/wrench marker)
    if (this.upgradeBenches.length > 0) {
      ctx.save();
      for (const bench of this.upgradeBenches) {
        const bp = toPx(bench.x, bench.z);
        ctx.save();
        ctx.translate(bp.x, bp.y);

        ctx.beginPath();
        ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8, 24, 48, 0.92)';
        ctx.fill();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.moveTo(-4.8, -1.8);
        ctx.lineTo(3.8, -1.8);
        ctx.lineTo(5.2, -3.2);
        ctx.lineTo(5.2, 0.2);
        ctx.lineTo(2.4, 0.8);
        ctx.lineTo(3.2, 3.6);
        ctx.lineTo(-3.2, 3.6);
        ctx.lineTo(-2.4, 0.8);
        ctx.lineTo(-4.8, -0.4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(-3.2, -1.5, 6.2, 1.1);

        ctx.restore();
      }
      ctx.restore();
    }

    // Campfires (orange flame / dim stone ring)
    if (this.campfires.length > 0) {
      ctx.save();
      for (const campfire of this.campfires) {
        const cp = toPx(campfire.x, campfire.z);
        ctx.save();
        ctx.translate(cp.x, cp.y);

        if (campfire.lit) {
          ctx.beginPath();
          ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(41, 18, 8, 0.92)';
          ctx.fill();
          ctx.strokeStyle = '#d6d3d1';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(0, -5.2);
          ctx.lineTo(3.8, -0.5);
          ctx.lineTo(3.2, 3.8);
          ctx.lineTo(0, 4.8);
          ctx.lineTo(-3.2, 3.8);
          ctx.lineTo(-3.8, -0.5);
          ctx.closePath();
          ctx.fillStyle = '#fb923c';
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(0, -2.4);
          ctx.lineTo(1.8, 1.0);
          ctx.lineTo(0, 3.4);
          ctx.lineTo(-1.8, 1.0);
          ctx.closePath();
          ctx.fillStyle = '#fde047';
          ctx.fill();
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
          ctx.fill();
          ctx.setLineDash([2.5, 2]);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.restore();

          ctx.beginPath();
          ctx.arc(0, 0, 2.0, 0, Math.PI * 2);
          ctx.fillStyle = '#475569';
          ctx.fill();
        }

        ctx.restore();
      }
      ctx.restore();
    }

    // Sky Rifts (glowing cyan portal star)
    if (this.rifts.length > 0) {
      ctx.save();
      for (const rift of this.rifts) {
        const rp = toPx(rift.x, rift.z);
        ctx.save();
        ctx.translate(rp.x, rp.y);

        if (rift.active) {
          const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 12);
          glow.addColorStop(0, 'rgba(34, 211, 238, 0.72)');
          glow.addColorStop(0.6, 'rgba(168, 85, 247, 0.35)');
          glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(8, 24, 52, 0.9)';
          ctx.fill();
          ctx.strokeStyle = '#67e8f9';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          ctx.beginPath();
          const outerR = 6.2;
          const innerR = 2.0;
          for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4 - Math.PI / 2;
            const r = i % 2 === 0 ? outerR : innerR;
            const sx = Math.cos(angle) * r;
            const sy = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.closePath();
          ctx.fillStyle = '#e0f2fe';
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.2;
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
          ctx.fill();
          ctx.setLineDash([2.5, 2.5]);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(1.5, 0);
          ctx.lineTo(0, 4);
          ctx.lineTo(-1.5, 0);
          ctx.closePath();
          ctx.fillStyle = '#94a3b8';
          ctx.fill();
        }

        ctx.restore();
      }
      ctx.restore();
    }

    // Capture Flags (pennant icon, gold when captured)
    if (this.capturePoints.length > 0) {
      ctx.save();
      for (const cp of this.capturePoints) {
        const fp = toPx(cp.x, cp.z);
        ctx.save();
        ctx.translate(fp.x, fp.y);

        ctx.beginPath();
        ctx.arc(0, 0, 7.8, 0, Math.PI * 2);
        ctx.fillStyle = cp.captured
          ? 'rgba(120, 53, 15, 0.92)'
          : 'rgba(10, 24, 52, 0.9)';
        ctx.fill();
        ctx.strokeStyle = cp.captured ? '#ffd000' : '#38bdf8';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        if (!cp.captured && cp.progress > 0) {
          const clamped = Math.max(0, Math.min(1, cp.progress));
          ctx.beginPath();
          ctx.arc(
            0,
            0,
            7.8,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * clamped,
          );
          ctx.strokeStyle = '#ffd000';
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(-3.2, 5.0);
        ctx.lineTo(-3.2, -5.0);
        ctx.strokeStyle = cp.captured ? '#fef08a' : '#e2e8f0';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-2.6, -4.8);
        ctx.lineTo(5.4, -1.8);
        ctx.lineTo(-2.6, 1.2);
        ctx.closePath();
        ctx.fillStyle = cp.captured ? '#ffd000' : '#38bdf8';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.0;
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }
      ctx.restore();
    }

    // Interactive Boss Vaults (offset cleanly above POI center so zero icons cross over POI names)
    if (this.vaults.length > 0) {
      ctx.save();
      for (const vault of this.vaults) {
        const vp = toPx(vault.x, vault.z);

        // Anchor dot at true vault coordinate
        ctx.save();
        ctx.translate(vp.x, vp.y);
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = vault.unlocked ? '#34eb5e' : '#ffd000';
        ctx.fill();
        ctx.restore();

        const poi =
          POIS.find((p) => p.id === vault.poiId) ??
          POIS.find((p) => {
            const pp = toPx(p.x, p.z);
            return Math.abs(vp.x - pp.x) < 48 && Math.abs(vp.y - pp.y) < 26;
          });
        let badgeX = vp.x;
        let badgeY = vp.y;
        if (poi) {
          const pp = toPx(poi.x, poi.z);
          if (
            Math.abs(vp.x - pp.x) < 48 &&
            vp.y >= pp.y - 16 &&
            vp.y <= pp.y + 24
          ) {
            badgeY = pp.y - 17;
          }
        }

        ctx.save();
        ctx.translate(badgeX, badgeY);

        // Backdrop badge
        ctx.beginPath();
        ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
        ctx.fillStyle = vault.unlocked
          ? 'rgba(20, 83, 45, 0.92)'
          : 'rgba(120, 53, 15, 0.92)';
        ctx.fill();
        ctx.strokeStyle = vault.unlocked ? '#34eb5e' : '#ffd000';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Padlock shackle
        ctx.beginPath();
        if (vault.unlocked) {
          ctx.arc(2.5, -2.5, 3.2, Math.PI, 0);
        } else {
          ctx.arc(0, -2.5, 3.2, Math.PI, 0);
        }
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Padlock body
        ctx.fillStyle = vault.unlocked ? '#34eb5e' : '#ffd000';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.fillRect(-4.5, -2, 9, 7.5);
        ctx.strokeRect(-4.5, -2, 9, 7.5);

        // Keyhole dot
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 1.8, 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
      ctx.restore();
    }

    // Vending Machines (kiosk badge)
    if (this.vendingMachines.length > 0) {
      ctx.save();
      for (const vm of this.vendingMachines) {
        const vp = toPx(vm.x, vm.z);
        const inStock = vm.stock > 0;
        const strokeCol = !inStock
          ? '#64748b'
          : vm.kind === 'mending'
            ? '#34eb5e'
            : '#38bdf8';
        ctx.save();
        ctx.translate(vp.x, vp.y);

        ctx.beginPath();
        ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
        ctx.fillStyle = inStock
          ? 'rgba(8, 24, 52, 0.92)'
          : 'rgba(15, 23, 42, 0.78)';
        ctx.fill();
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.fillStyle = strokeCol;
        ctx.fillRect(-3.8, -4.4, 7.6, 8.8);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-2.6, -3.2, 5.2, 3.6);
        ctx.fillStyle = inStock ? '#ffd000' : '#64748b';
        ctx.fillRect(-2.6, 1.4, 5.2, 1.6);

        ctx.restore();
      }
      ctx.restore();
    }

    // Specialist NPCs (hireable ally markers)
    if (this.npcSpecialists.length > 0) {
      ctx.save();
      for (const npc of this.npcSpecialists) {
        const np = toPx(npc.x, npc.z);
        const hired = npc.hiredBy !== null;
        const roleColor =
          npc.role === 'medic'
            ? '#34eb5e'
            : npc.role === 'heavy'
              ? '#fb923c'
              : '#22d3ee';
        ctx.save();
        ctx.translate(np.x, np.y);

        ctx.beginPath();
        ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
        ctx.fillStyle = hired
          ? 'rgba(120, 53, 15, 0.92)'
          : 'rgba(10, 22, 46, 0.92)';
        ctx.fill();
        ctx.strokeStyle = hired ? '#ffd000' : roleColor;
        ctx.lineWidth = 1.7;
        ctx.stroke();

        ctx.fillStyle = roleColor;
        ctx.beginPath();
        ctx.arc(0, -2.0, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 4.2, 3.8, Math.PI, 0);
        ctx.fill();

        ctx.restore();
      }
      ctx.restore();
    }

    // Floating Loot Island Ring + Shrine Icon
    if (this.lootIsland && this.lootIsland.active) {
      const lip = toPx(this.lootIsland.x, this.lootIsland.z);
      const islandRadPx = Math.max(14, this.lootIsland.radius * pxPerMeter);
      const captured = this.lootIsland.captured;
      ctx.save();
      ctx.translate(lip.x, lip.y);

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, islandRadPx, 0, Math.PI * 2);
      ctx.fillStyle = captured
        ? 'rgba(255, 208, 0, 0.14)'
        : 'rgba(34, 211, 238, 0.14)';
      ctx.fill();
      ctx.strokeStyle = captured ? '#ffd000' : '#22d3ee';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      if (!captured && this.lootIsland.captureProgress > 0) {
        const prog = Math.max(0, Math.min(1, this.lootIsland.captureProgress));
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          islandRadPx,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * prog,
        );
        ctx.strokeStyle = '#ffd000';
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }

      const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 12);
      glow.addColorStop(
        0,
        captured ? 'rgba(255, 208, 0, 0.78)' : 'rgba(34, 211, 238, 0.78)',
      );
      glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 7.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 22, 48, 0.94)';
      ctx.fill();
      ctx.strokeStyle = captured ? '#ffd000' : '#67e8f9';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, -5.2);
      ctx.lineTo(4.4, 0);
      ctx.lineTo(0, 5.2);
      ctx.lineTo(-4.4, 0);
      ctx.closePath();
      ctx.fillStyle = captured ? '#ffd000' : '#22d3ee';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // Wave-6 Chapter Overlay (Medallion Threat Circles, Bunkers, Slurp Tankers, Dropped Medallions & Crowns)
    drawChapterMapOverlay(
      ctx,
      size,
      pxPerMeter,
      toPx,
      this.chapterOverlay,
      state.medallionCircles,
      performance.now(),
    );

    // Wave-7 Overdrive Overlay (Grind Rails, Reboot Vans, Active Supply Drones)
    drawOverdriveMapOverlay(
      ctx,
      size,
      pxPerMeter,
      toPx,
      this.overdriveOverlay,
      performance.now(),
    );

    // Wave-8 Frontier Overlay (Future Storm Forecast Rings, Mod Benches, Forecast Towers, Team Rumble Blue Allies)
    drawFrontierMapOverlay(
      ctx,
      size,
      pxPerMeter,
      toPx,
      this.frontierOverlay,
      state.futureStormRings,
      state.teamRumble?.blueAllies,
      performance.now(),
    );

    // Wave-9 Skyforge Overlay (Apex Express Railway Loop, Live Train, Rift Meteor Craters)
    drawSkyforgeMapOverlay(
      ctx,
      size,
      pxPerMeter,
      toPx,
      this.skyforgeOverlay,
      state.trainPos,
      performance.now(),
    );

    // 10 POI Text Labels + Boss Tags (rendered AFTER stationary markers for crisp readability)
    ctx.save();
    ctx.font = '800 13px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const poi of POIS) {
      const p = toPx(poi.x, poi.z);
      const bossName = BOSS_POI_LABELS[poi.id];
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(6, 12, 26, 0.92)';
      ctx.strokeText(poi.name, p.x, p.y);
      ctx.fillStyle = bossName ? '#fde047' : '#ffffff';
      ctx.fillText(poi.name, p.x, p.y);

      if (bossName) {
        ctx.save();
        ctx.font = '800 10px "Barlow Condensed", sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(6, 12, 26, 0.95)';
        const tag = `★ BOSS: ${bossName}`;
        ctx.strokeText(tag, p.x, p.y + 13);
        ctx.fillStyle = '#ffd000';
        ctx.fillText(tag, p.x, p.y + 13);
        ctx.restore();
      }
    }
    ctx.restore();

    // Supply drops / active blips
    for (const blip of state.audioBlips) {
      if (blip.kind === 'supply_drop') {
        const bp = toPx(blip.x, blip.z);
        ctx.fillStyle = '#22d3ee';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.fillRect(bp.x - 5, bp.y - 5, 10, 10);
        ctx.strokeRect(bp.x - 5, bp.y - 5, 10, 10);
      }
    }

    // Waypoint + route line
    const playerPx = toPx(state.playerPos.x, state.playerPos.z);
    if (state.mapWaypoint) {
      const wpPx = toPx(state.mapWaypoint.x, state.mapWaypoint.z);
      const distMeters = Math.round(
        Math.hypot(
          state.mapWaypoint.x - state.playerPos.x,
          state.mapWaypoint.z - state.playerPos.z,
        ),
      );

      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(playerPx.x, playerPx.y);
      ctx.lineTo(wpPx.x, wpPx.y);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(wpPx.x, wpPx.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd000';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();

      ctx.save();
      ctx.font = '800 13px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.strokeText(`${distMeters}M`, wpPx.x, wpPx.y - 16);
      ctx.fillStyle = '#ffd000';
      ctx.fillText(`${distMeters}M`, wpPx.x, wpPx.y - 16);
      ctx.restore();
    }

    // Player cone + chevron
    const rad = (state.compassHeading * Math.PI) / 180;
    ctx.save();
    ctx.translate(playerPx.x, playerPx.y);
    ctx.rotate(rad);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 44, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 44);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffd000';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  dispose(): void {
    this.backdropEl.remove();
  }
}
