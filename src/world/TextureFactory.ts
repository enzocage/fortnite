import * as THREE from 'three';
import { mulberry32 } from '../core';

type CanvasDrawFn = (ctx: CanvasRenderingContext2D, size: number) => void;

function normalizeHex(hex: string): string {
  const c = new THREE.Color(hex);
  return `#${c.getHexString()}`;
}

function shadeHex(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  if (factor >= 1) {
    c.lerp(new THREE.Color(0xffffff), Math.min(1, factor - 1));
  } else {
    c.multiplyScalar(Math.max(0, factor));
  }
  return `#${c.getHexString()}`;
}

export class TextureFactory {
  private cache = new Map<string, THREE.CanvasTexture>();

  private createTexture(
    key: string,
    size: number,
    draw: CanvasDrawFn,
    repeatX = 1,
    repeatY = 1,
  ): THREE.CanvasTexture {
    const cached = this.cache.get(key);
    if (cached) return cached;

    let canvas: HTMLCanvasElement;
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        draw(ctx, size);
      }
    } else {
      // Safe fallback for headless Vitest/Node environments without DOM
      canvas = {
        width: size,
        height: size,
        getContext: () => null,
      } as unknown as HTMLCanvasElement;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;

    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Near-white detail texture for vertex-colored terrain so biomes keep exact vertex hues
   * while gaining crisp blades, pebbles, and grain.
   */
  getTerrainDetailTexture(): THREE.CanvasTexture {
    return this.createTexture('terrain_detail', 256, (ctx, s) => {
      const rand = mulberry32(101);
      ctx.fillStyle = '#f2f4f0';
      ctx.fillRect(0, 0, s, s);

      for (let i = 0; i < 900; i++) {
        const x = rand() * s;
        const y = rand() * s;
        const bright = rand() > 0.45;
        ctx.fillStyle = bright ? 'rgba(255,255,255,0.22)' : 'rgba(180,192,175,0.22)';
        const w = 1.5 + rand() * 3.5;
        const h = 1.5 + rand() * 3.5;
        ctx.fillRect(x, y, w, h);
        if (x + w > s) ctx.fillRect(x - s, y, w, h);
        if (y + h > s) ctx.fillRect(x, y - s, w, h);
      }

      ctx.lineWidth = 1.5;
      for (let i = 0; i < 240; i++) {
        const x = rand() * s;
        const y = rand() * s;
        const len = 4 + rand() * 7;
        const tilt = (rand() - 0.5) * 4;
        ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(170,185,165,0.24)';
        for (const ox of [-s, 0, s]) {
          for (const oy of [-s, 0, s]) {
            if (x + ox < -10 || x + ox > s + 10 || y + oy < -10 || y + oy > s + 10) continue;
            ctx.beginPath();
            ctx.moveTo(x + ox, y + oy);
            ctx.lineTo(x + ox + tilt, y + oy - len);
            ctx.stroke();
          }
        }
      }
    });
  }

  getGrassTexture(): THREE.CanvasTexture {
    return this.createTexture('grass', 256, (ctx, s) => {
      const rand = mulberry32(202);
      ctx.fillStyle = '#47b849';
      ctx.fillRect(0, 0, s, s);

      // Soft turf patches
      for (let i = 0; i < 160; i++) {
        const x = rand() * s;
        const y = rand() * s;
        const r = 8 + rand() * 20;
        ctx.fillStyle = rand() > 0.5 ? 'rgba(92, 214, 88, 0.25)' : 'rgba(42, 145, 52, 0.22)';
        for (const ox of [-s, 0, s]) {
          for (const oy of [-s, 0, s]) {
            ctx.beginPath();
            ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Stylized grass blade tufts
      ctx.lineWidth = 2;
      for (let i = 0; i < 320; i++) {
        const x = rand() * s;
        const y = rand() * s;
        const h = 6 + rand() * 8;
        ctx.strokeStyle = rand() > 0.45 ? '#6ee86b' : '#2e9139';
        for (const ox of [-s, 0, s]) {
          for (const oy of [-s, 0, s]) {
            if (x + ox < -10 || x + ox > s + 10 || y + oy < -10 || y + oy > s + 10) continue;
            ctx.beginPath();
            ctx.moveTo(x + ox, y + oy);
            ctx.lineTo(x + ox + (rand() - 0.5) * 4, y + oy - h);
            ctx.stroke();
          }
        }
      }
    });
  }

  getSandTexture(): THREE.CanvasTexture {
    return this.createTexture('sand', 256, (ctx, s) => {
      const rand = mulberry32(303);
      ctx.fillStyle = '#f0d38c';
      ctx.fillRect(0, 0, s, s);

      // Gentle wind ripples
      for (let y = 0; y < s; y += 16) {
        ctx.fillStyle = y % 32 === 0 ? 'rgba(255,244,210,0.22)' : 'rgba(205,168,96,0.18)';
        ctx.fillRect(0, y, s, 8);
      }

      // Pebbles and shell flecks
      for (let i = 0; i < 650; i++) {
        const x = rand() * s;
        const y = rand() * s;
        const r = 1 + rand() * 2.2;
        ctx.fillStyle = rand() > 0.5 ? '#fae5b0' : '#c9a45f';
        ctx.fillRect(x, y, r, r);
      }
    });
  }

  getRockTexture(): THREE.CanvasTexture {
    return this.createTexture('rock', 256, (ctx, s) => {
      const rand = mulberry32(404);
      ctx.fillStyle = '#7b8491';
      ctx.fillRect(0, 0, s, s);

      // Faceted stone patches
      for (let i = 0; i < 85; i++) {
        const x = rand() * s;
        const y = rand() * s;
        const w = 16 + rand() * 34;
        const h = 14 + rand() * 28;
        const shade = rand();
        ctx.fillStyle =
          shade > 0.65 ? '#949eab' : shade > 0.3 ? '#6c7582' : '#58606b';
        for (const ox of [-s, 0, s]) {
          for (const oy of [-s, 0, s]) {
            ctx.fillRect(x + ox, y + oy, w, h);
          }
        }
      }

      // Stylized stone cracks
      ctx.strokeStyle = 'rgba(42, 48, 56, 0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 36; i++) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 42, y + (rand() - 0.5) * 42);
        ctx.stroke();
      }
    });
  }

  getRoadTexture(): THREE.CanvasTexture {
    return this.createTexture('road', 256, (ctx, s) => {
      const rand = mulberry32(505);
      ctx.fillStyle = '#3b424d';
      ctx.fillRect(0, 0, s, s);

      // Fine asphalt grain
      for (let i = 0; i < 1200; i++) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(15,20,28,0.16)';
        ctx.fillRect(x, y, 2, 2);
      }

      // Subtle edge lines & dashed center stripe
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(10, 0, 5, s);
      ctx.fillRect(s - 15, 0, 5, s);

      ctx.fillStyle = '#facc15';
      for (let y = 12; y < s; y += 64) {
        ctx.fillRect(s / 2 - 4, y, 8, 36);
      }
    });
  }

  getWoodTexture(): THREE.CanvasTexture {
    return this.createTexture('wood', 256, (ctx, s) => {
      const rand = mulberry32(606);
      ctx.fillStyle = '#b97a45';
      ctx.fillRect(0, 0, s, s);

      const planks = 6;
      const ph = s / planks;
      for (let p = 0; p < planks; p++) {
        const y = p * ph;
        ctx.fillStyle = p % 2 === 0 ? '#c4834b' : '#ac6f3c';
        ctx.fillRect(0, y, s, ph - 2);

        // Grain streaks
        ctx.strokeStyle = 'rgba(110, 62, 26, 0.28)';
        ctx.lineWidth = 1.5;
        for (let g = 0; g < 6; g++) {
          const gy = y + 6 + rand() * (ph - 12);
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(s * 0.33, gy + (rand() - 0.5) * 6, s * 0.66, gy + (rand() - 0.5) * 6, s, gy);
          ctx.stroke();
        }

        // Plank seam
        ctx.fillStyle = '#6f4220';
        ctx.fillRect(0, y + ph - 2, s, 2);

        // Staggered vertical joint & nails
        const vx = ((p * 97 + 43) % (s - 32)) + 16;
        ctx.fillRect(vx, y, 2, ph);
        ctx.fillStyle = '#473022';
        ctx.beginPath();
        ctx.arc(vx - 6, y + 8, 2, 0, Math.PI * 2);
        ctx.arc(vx + 8, y + ph - 9, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  getBrickTexture(): THREE.CanvasTexture {
    return this.createTexture('brick', 256, (ctx, s) => {
      const rand = mulberry32(707);
      // Mortar base
      ctx.fillStyle = '#d4cbc0';
      ctx.fillRect(0, 0, s, s);

      const rows = 8;
      const cols = 4;
      const rh = s / rows;
      const cw = s / cols;
      const palette = ['#c25943', '#b34d39', '#cc664e', '#a94835'];

      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const bx = c * cw + offset;
          const by = r * rh;
          ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
          ctx.fillRect(bx + 2, by + 2, cw - 4, rh - 4);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(bx + 2, by + 2, cw - 4, 3);
        }
      }
    });
  }

  getMetalTexture(): THREE.CanvasTexture {
    return this.createTexture('metal', 256, (ctx, s) => {
      ctx.fillStyle = '#8596aa';
      ctx.fillRect(0, 0, s, s);

      // Diagonal brushed sheen
      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
      grad.addColorStop(1, 'rgba(30,41,59,0.18)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      // Panel grid
      const cells = 2;
      const cell = s / cells;
      ctx.strokeStyle = '#536275';
      ctx.lineWidth = 3;
      for (let gx = 0; gx < cells; gx++) {
        for (let gy = 0; gy < cells; gy++) {
          const x = gx * cell;
          const y = gy * cell;
          ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
          // Corner rivets
          ctx.fillStyle = '#cbd5e1';
          for (const rx of [x + 10, x + cell - 10]) {
            for (const ry of [y + 10, y + cell - 10]) {
              ctx.beginPath();
              ctx.arc(rx, ry, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    });
  }

  getSidingTexture(colorHex: string): THREE.CanvasTexture {
    const norm = normalizeHex(colorHex);
    return this.createTexture(`siding:${norm}`, 256, (ctx, s) => {
      const base = norm;
      const hi = shadeHex(norm, 1.16);
      const lo = shadeHex(norm, 0.78);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);

      const slats = 10;
      const sh = s / slats;
      for (let i = 0; i < slats; i++) {
        const y = i * sh;
        ctx.fillStyle = hi;
        ctx.fillRect(0, y, s, 3);
        ctx.fillStyle = base;
        ctx.fillRect(0, y + 3, s, sh - 6);
        ctx.fillStyle = lo;
        ctx.fillRect(0, y + sh - 3, s, 3);
      }
    });
  }

  getRoofTexture(colorHex: string): THREE.CanvasTexture {
    const norm = normalizeHex(colorHex);
    return this.createTexture(`roof:${norm}`, 256, (ctx, s) => {
      const rand = mulberry32(norm.charCodeAt(1) * 97 + norm.charCodeAt(2) * 31);
      const base = norm;
      const dark = shadeHex(norm, 0.72);
      const light = shadeHex(norm, 1.14);
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, s, s);

      const rows = 8;
      const cols = 6;
      const rh = s / rows;
      const cw = s / cols;

      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * cw + offset;
          const y = r * rh;
          ctx.fillStyle = rand() > 0.5 ? base : light;
          ctx.fillRect(x + 2, y + 1, cw - 3, rh - 4);
          ctx.fillStyle = dark;
          ctx.fillRect(x + 2, y + rh - 3, cw - 3, 2);
        }
      }
    });
  }

  getBarkTexture(): THREE.CanvasTexture {
    return this.createTexture('bark', 256, (ctx, s) => {
      const rand = mulberry32(808);
      ctx.fillStyle = '#6c472f';
      ctx.fillRect(0, 0, s, s);

      for (let i = 0; i < 42; i++) {
        const x = rand() * s;
        const w = 4 + rand() * 8;
        ctx.fillStyle = rand() > 0.5 ? '#523421' : '#85583c';
        ctx.fillRect(x, 0, w, s);
      }

      ctx.strokeStyle = 'rgba(44, 25, 14, 0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 30; i++) {
        const x = rand() * s;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (rand() - 0.5) * 14, s);
        ctx.stroke();
      }
    });
  }

  getChestTexture(): THREE.CanvasTexture {
    return this.createTexture('chest', 256, (ctx, s) => {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(0, 0, s, s);

      // Golden metallic sheen
      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#fde047');
      grad.addColorStop(0.5, '#f59e0b');
      grad.addColorStop(1, '#b45309');
      ctx.fillStyle = grad;
      ctx.fillRect(8, 8, s - 16, s - 16);

      // Ornate border & iron straps
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, s - 10, s - 10);

      ctx.fillStyle = '#92400e';
      ctx.fillRect(44, 0, 22, s);
      ctx.fillRect(s - 66, 0, 22, s);

      // Center lock emblem
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(s / 2 - 22, s / 2 - 26, 44, 52);
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, 10, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  getSupplyDropTexture(): THREE.CanvasTexture {
    return this.createTexture('supply_drop', 256, (ctx, s) => {
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(0, 0, s, s);

      // Inner blue crate panel
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(14, 14, s - 28, s - 28);

      // Yellow corner bands
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, s, 18);
      ctx.fillRect(0, s - 18, s, 18);
      ctx.fillRect(0, 0, 18, s);
      ctx.fillRect(s - 18, 0, 18, s);

      // White star / wing emblem in center
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const cx = s / 2;
      const cy = s / 2;
      for (let i = 0; i < 10; i++) {
        const ang = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? 48 : 20;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  getSnowTexture(): THREE.CanvasTexture {
    return this.createTexture('snow', 256, (ctx, s) => {
      const rand = mulberry32(909);
      ctx.fillStyle = '#eff6ff';
      ctx.fillRect(0, 0, s, s);

      for (let i = 0; i < 180; i++) {
        const x = rand() * s;
        const y = rand() * s;
        const r = 6 + rand() * 18;
        ctx.fillStyle = rand() > 0.45 ? 'rgba(255,255,255,0.65)' : 'rgba(186,230,253,0.34)';
        for (const ox of [-s, 0, s]) {
          for (const oy of [-s, 0, s]) {
            ctx.beginPath();
            ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      for (let i = 0; i < 420; i++) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.fillStyle = rand() > 0.35 ? '#ffffff' : '#bae6fd';
        ctx.fillRect(x, y, 2, 2);
      }
    });
  }

  getSandstoneTexture(): THREE.CanvasTexture {
    return this.createTexture('sandstone', 256, (ctx, s) => {
      const rand = mulberry32(1010);
      ctx.fillStyle = '#d97745';
      ctx.fillRect(0, 0, s, s);

      const bands = 12;
      const bh = s / bands;
      const palette = ['#d97745', '#c85a32', '#e5925c', '#b44825', '#df8448'];
      for (let i = 0; i < bands; i++) {
        ctx.fillStyle = palette[i % palette.length];
        ctx.fillRect(0, i * bh, s, bh);
        ctx.fillStyle = 'rgba(72, 26, 12, 0.22)';
        ctx.fillRect(0, i * bh + bh - 2, s, 2);
      }

      for (let i = 0; i < 550; i++) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.fillStyle = rand() > 0.5 ? 'rgba(255,230,195,0.22)' : 'rgba(92,35,16,0.22)';
        ctx.fillRect(x, y, 2 + rand() * 3, 2);
      }
    });
  }

  getBasaltTexture(): THREE.CanvasTexture {
    return this.createTexture('basalt', 256, (ctx, s) => {
      const rand = mulberry32(1111);
      ctx.fillStyle = '#24222a';
      ctx.fillRect(0, 0, s, s);

      for (let i = 0; i < 110; i++) {
        const x = rand() * s;
        const y = rand() * s;
        const w = 14 + rand() * 28;
        const h = 14 + rand() * 28;
        ctx.fillStyle = rand() > 0.5 ? '#2f2b38' : '#1b1921';
        for (const ox of [-s, 0, s]) {
          for (const oy of [-s, 0, s]) {
            ctx.fillRect(x + ox, y + oy, w, h);
          }
        }
      }

      // Glowing magma hairline fractures
      ctx.lineWidth = 2;
      for (let i = 0; i < 24; i++) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(249, 115, 22, 0.72)' : 'rgba(15, 13, 18, 0.75)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 46, y + (rand() - 0.5) * 46);
        ctx.stroke();
      }
    });
  }

  getCastleStoneTexture(): THREE.CanvasTexture {
    return this.createTexture('castle_stone', 256, (ctx, s) => {
      const rand = mulberry32(1212);
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 0, s, s);

      const rows = 6;
      const cols = 4;
      const rh = s / rows;
      const cw = s / cols;
      const stones = ['#94a3b8', '#7c8ba1', '#8392a7', '#6b7a90'];

      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * cw + off;
          const y = r * rh;
          ctx.fillStyle = stones[Math.floor(rand() * stones.length)];
          ctx.fillRect(x + 3, y + 3, cw - 6, rh - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(x + 3, y + 3, cw - 6, 4);
        }
      }
    });
  }

  getCyberMetalTexture(): THREE.CanvasTexture {
    return this.createTexture('cyber_metal', 256, (ctx, s) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, s, s);

      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#1e293b');
      grad.addColorStop(1, '#090f1f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 3;
      const step = 64;
      for (let x = 0; x < s; x += step) {
        for (let y = 0; y < s; y += step) {
          ctx.strokeRect(x + 2, y + 2, step - 4, step - 4);
        }
      }

      // Glowing cyan circuit accents
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 32);
      ctx.lineTo(96, 32);
      ctx.lineTo(128, 64);
      ctx.lineTo(s, 64);
      ctx.moveTo(32, s);
      ctx.lineTo(32, 160);
      ctx.lineTo(64, 128);
      ctx.lineTo(192, 128);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(96, 32, 4, 0, Math.PI * 2);
      ctx.arc(64, 128, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  getCorrugatedTexture(colorHex: string): THREE.CanvasTexture {
    const norm = normalizeHex(colorHex);
    return this.createTexture(`corrugated:${norm}`, 256, (ctx, s) => {
      const hi = shadeHex(norm, 1.18);
      const lo = shadeHex(norm, 0.72);
      ctx.fillStyle = norm;
      ctx.fillRect(0, 0, s, s);

      const ribs = 16;
      const rw = s / ribs;
      for (let i = 0; i < ribs; i++) {
        const x = i * rw;
        ctx.fillStyle = hi;
        ctx.fillRect(x, 0, rw * 0.35, s);
        ctx.fillStyle = lo;
        ctx.fillRect(x + rw * 0.65, 0, rw * 0.35, s);
      }

      ctx.strokeStyle = shadeHex(norm, 0.55);
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, s - 6, s - 6);
    });
  }

  getMarbleTexture(): THREE.CanvasTexture {
    return this.createTexture('marble', 256, (ctx, s) => {
      const rand = mulberry32(1313);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, s, s);

      const step = 64;
      for (let x = 0; x < s; x += step) {
        for (let y = 0; y < s; y += step) {
          ctx.fillStyle = (x / step + y / step) % 2 === 0 ? '#f1f5f9' : '#dce4ee';
          ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
        }
      }

      ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 18; i++) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 60);
        ctx.stroke();
      }
    });
  }

  getBillboardTexture(variant: 'burger' | 'cyber' | 'royal'): THREE.CanvasTexture {
    return this.createTexture(`billboard:${variant}`, 256, (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, s, s);
      if (variant === 'burger') {
        grad.addColorStop(0, '#ea580c');
        grad.addColorStop(1, '#dc2626');
      } else if (variant === 'cyber') {
        grad.addColorStop(0, '#0284c7');
        grad.addColorStop(1, '#7c3aed');
      } else {
        grad.addColorStop(0, '#1e3a8a');
        grad.addColorStop(1, '#4c1d95');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      ctx.strokeStyle = variant === 'cyber' ? '#22d3ee' : '#facc15';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, s - 16, s - 16);

      if (variant === 'burger') {
        // Stylized stacked burger emblem
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(58, 58, 140, 34);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(52, 96, 152, 16);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(56, 116, 144, 28);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(58, 148, 140, 26);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(46, 192, 164, 18);
      } else if (variant === 'cyber') {
        // Futuristic chevron visor & energy bars
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(36, 48, 184, 24);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(36, 86, 140, 20);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(36, 120, 184, 28);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(36, 166, 112, 22);
      } else {
        // Golden crown & diamond badge
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(58, 156);
        ctx.lineTo(58, 80);
        ctx.lineTo(94, 118);
        ctx.lineTo(128, 64);
        ctx.lineTo(162, 118);
        ctx.lineTo(198, 80);
        ctx.lineTo(198, 156);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(58, 174, 140, 22);
      }
    });
  }

  dispose(): void {
    for (const tex of this.cache.values()) {
      tex.dispose();
    }
    this.cache.clear();
  }
}
