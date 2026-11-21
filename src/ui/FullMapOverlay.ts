import { POIS, WORLD_SIZE } from '../core';
import type { HUDState, LaunchPadEntity, ZiplineEntity } from '../types';
import { BOSS_POI_LABELS, mapNormToWorld, worldToMapNorm } from './UIHelpers';
import { getCrownSvg } from './WeaponIcons';

export interface FullMapCallbacks {
  onWaypointChange: (waypoint: { x: number; z: number } | null) => void;
  onCloseRequest?: () => void;
}

const GRID_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export class FullMapOverlay {
  private readonly root: HTMLElement;
  private callbacks: FullMapCallbacks;

  private backdropEl: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private terrainMapCanvas: HTMLCanvasElement | null = null;
  private launchPads: LaunchPadEntity[] = [];
  private ziplines: ZiplineEntity[] = [];

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
    titleWrap.innerHTML = `
      <div class="fdr-fullmap-title">FORTDROP ISLAND — TACTICAL MAP</div>
      <div class="fdr-fullmap-hint">LEFT CLICK: SET WAYPOINT • RIGHT CLICK: CLEAR WAYPOINT • [M] CLOSE</div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fdr-btn fdr-btn-dark';
    closeBtn.style.padding = '5px 14px';
    closeBtn.style.fontSize = '15px';
    closeBtn.innerHTML = '<span>CLOSE [M]</span>';
    closeBtn.addEventListener('click', () => {
      this.setOpen(false);
      this.callbacks.onCloseRequest?.();
    });

    head.append(titleWrap, closeBtn);

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

  setWorldTraversal(launchPads: LaunchPadEntity[], ziplines: ZiplineEntity[]): void {
    this.launchPads = launchPads;
    this.ziplines = ziplines;
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

    // 10 POI Labels + Named POI Boss Zones
    ctx.save();
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
