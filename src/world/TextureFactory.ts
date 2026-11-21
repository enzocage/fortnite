import * as THREE from 'three';
import { mulberry32 } from '../core';

type CanvasDrawFn = (ctx: CanvasRenderingContext2D, size: number) => void;

export type BumpTextureKind =
  | 'terrain'
  | 'wood'
  | 'brick'
  | 'metal'
  | 'rock'
  | 'sandstone'
  | 'castle'
  | 'cyber'
  | 'siding'
  | 'roof'
  | 'bark'
  | 'basalt';

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
    isDataMap = false,
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
    texture.colorSpace = isDataMap ? THREE.NoColorSpace : THREE.SRGBColorSpace;
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
        ctx.fillStyle = p % 2 === 0 ? '#c8874e' : '#a86b38';
        ctx.fillRect(0, y, s, ph - 2);

        // Subtle top bevel highlight & bottom plank shadow
        ctx.fillStyle = 'rgba(255, 224, 180, 0.22)';
        ctx.fillRect(0, y + 1, s, 2.5);
        ctx.fillStyle = 'rgba(65, 34, 14, 0.28)';
        ctx.fillRect(0, y + ph - 5, s, 3);

        // Rich multi-tone woodgrain streaks
        for (let g = 0; g < 9; g++) {
          const gy = y + 5 + rand() * (ph - 10);
          ctx.strokeStyle =
            g % 3 === 0 ? 'rgba(245, 198, 138, 0.24)' : 'rgba(84, 44, 16, 0.36)';
          ctx.lineWidth = g % 2 === 0 ? 1.8 : 1.1;
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(
            s * 0.33,
            gy + (rand() - 0.5) * 7,
            s * 0.66,
            gy + (rand() - 0.5) * 7,
            s,
            gy,
          );
          ctx.stroke();
        }

        // Wood knot detail on alternating planks
        if (p % 2 === 1) {
          const kx = ((p * 83 + 52) % (s - 48)) + 24;
          const ky = y + ph * 0.5;
          ctx.fillStyle = 'rgba(72, 36, 14, 0.45)';
          ctx.beginPath();
          ctx.arc(kx, ky, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(88, 46, 18, 0.35)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(kx, ky, 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Deep plank seam
        ctx.fillStyle = '#5c3316';
        ctx.fillRect(0, y + ph - 2, s, 2);

        // Staggered vertical joint & nails with highlight rim
        const vx = ((p * 97 + 43) % (s - 32)) + 16;
        ctx.fillRect(vx, y, 2, ph);
        ctx.fillStyle = '#382215';
        ctx.beginPath();
        ctx.arc(vx - 6, y + 8, 2.2, 0, Math.PI * 2);
        ctx.arc(vx + 8, y + ph - 9, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  getBrickTexture(): THREE.CanvasTexture {
    return this.createTexture('brick', 256, (ctx, s) => {
      const rand = mulberry32(707);
      // Richer contrasting recessed mortar base
      ctx.fillStyle = '#9b9184';
      ctx.fillRect(0, 0, s, s);

      const rows = 8;
      const cols = 4;
      const rh = s / rows;
      const cw = s / cols;
      const palette = ['#c85c44', '#ae4733', '#d46c52', '#9f412f', '#bd533d'];

      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const bx = c * cw + offset;
          const by = r * rh;
          // Recessed mortar shadow lip
          ctx.fillStyle = 'rgba(42, 34, 28, 0.35)';
          ctx.fillRect(bx + 1.5, by + 1.5, cw - 3, rh - 3);

          ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
          ctx.fillRect(bx + 2.5, by + 2.5, cw - 5, rh - 5);

          // Top highlight + bottom shadow bevel
          ctx.fillStyle = 'rgba(255, 232, 212, 0.22)';
          ctx.fillRect(bx + 2.5, by + 2.5, cw - 5, 3);
          ctx.fillStyle = 'rgba(54, 18, 12, 0.26)';
          ctx.fillRect(bx + 2.5, by + rh - 5.5, cw - 5, 3);

          // Kiln texture flecks
          for (let f = 0; f < 5; f++) {
            ctx.fillStyle =
              rand() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(45,15,10,0.18)';
            ctx.fillRect(
              bx + 4 + rand() * (cw - 10),
              by + 4 + rand() * (rh - 10),
              2 + rand() * 3,
              2,
            );
          }
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

      const bands = 14;
      const bh = s / bands;
      const palette = ['#dc7b47', '#c2542d', '#ea9962', '#ad4222', '#e1864a', '#cf6436'];
      for (let i = 0; i < bands; i++) {
        const by = i * bh;
        ctx.fillStyle = palette[i % palette.length];
        ctx.fillRect(0, by, s, bh);

        // Undulating sedimentary contour ribbon
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(255, 224, 184, 0.25)' : 'rgba(84, 30, 14, 0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, by + bh * 0.45);
        ctx.bezierCurveTo(
          s * 0.3,
          by + bh * (0.2 + rand() * 0.5),
          s * 0.7,
          by + bh * (0.2 + rand() * 0.5),
          s,
          by + bh * 0.45,
        );
        ctx.stroke();

        // Eroded strata shadow seam
        ctx.fillStyle = 'rgba(62, 22, 10, 0.34)';
        ctx.fillRect(0, by + bh - 2.5, s, 2.5);
      }

      for (let i = 0; i < 650; i++) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.fillStyle = rand() > 0.48 ? 'rgba(255,235,205,0.26)' : 'rgba(78,28,12,0.26)';
        ctx.fillRect(x, y, 2 + rand() * 3.5, 2);
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
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(0, 0, s, s);

      const rows = 6;
      const cols = 4;
      const rh = s / rows;
      const cw = s / cols;
      const stones = ['#94a3b8', '#7c8ba1', '#8896ab', '#67778f'];

      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * cw + off;
          const y = r * rh;
          ctx.fillStyle = stones[Math.floor(rand() * stones.length)];
          ctx.fillRect(x + 3, y + 3, cw - 6, rh - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.24)';
          ctx.fillRect(x + 3, y + 3, cw - 6, 4);
          ctx.fillStyle = 'rgba(15,23,42,0.28)';
          ctx.fillRect(x + 3, y + rh - 6, cw - 6, 3);
        }
      }
    });
  }

  getCyberMetalTexture(): THREE.CanvasTexture {
    return this.createTexture('cyber_metal', 256, (ctx, s) => {
      const rand = mulberry32(1414);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, s, s);

      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#1e293b');
      grad.addColorStop(0.5, '#131d31');
      grad.addColorStop(1, '#090f1f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      // Brushed metallic micro-striations
      for (let i = 0; i < 80; i++) {
        const y = rand() * s;
        ctx.fillStyle =
          rand() > 0.5 ? 'rgba(148, 163, 184, 0.08)' : 'rgba(2, 6, 23, 0.16)';
        ctx.fillRect(0, y, s, 1.5);
      }

      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 3;
      const step = 64;
      for (let x = 0; x < s; x += step) {
        for (let y = 0; y < s; y += step) {
          ctx.strokeRect(x + 2, y + 2, step - 4, step - 4);
          ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.fillRect(x + 6, y + 6, 3, 3);
          ctx.fillRect(x + step - 9, y + step - 9, 3, 3);
        }
      }

      // Dual-layer glowing cyan & electric blue circuit traces
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, 32);
      ctx.lineTo(96, 32);
      ctx.lineTo(128, 64);
      ctx.lineTo(s, 64);
      ctx.moveTo(32, s);
      ctx.lineTo(32, 160);
      ctx.lineTo(64, 128);
      ctx.lineTo(192, 128);
      ctx.lineTo(224, 96);
      ctx.lineTo(224, 0);
      ctx.stroke();

      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 32);
      ctx.lineTo(96, 32);
      ctx.lineTo(128, 64);
      ctx.lineTo(s, 64);
      ctx.moveTo(32, s);
      ctx.lineTo(32, 160);
      ctx.lineTo(64, 128);
      ctx.lineTo(192, 128);
      ctx.lineTo(224, 96);
      ctx.lineTo(224, 0);
      ctx.stroke();

      ctx.fillStyle = '#67e8f9';
      ctx.beginPath();
      ctx.arc(96, 32, 4, 0, Math.PI * 2);
      ctx.arc(64, 128, 4, 0, Math.PI * 2);
      ctx.arc(192, 128, 4, 0, Math.PI * 2);
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

  getBumpTexture(kind: BumpTextureKind = 'terrain'): THREE.CanvasTexture {
    return this.createTexture(
      `bump:${kind}`,
      256,
      (ctx, s) => {
        const rand = mulberry32(2000 + kind.charCodeAt(0) * 97 + kind.length * 31);
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, s, s);

        if (kind === 'brick' || kind === 'castle') {
          ctx.fillStyle = '#242424';
          ctx.fillRect(0, 0, s, s);
          const rows = kind === 'brick' ? 8 : 6;
          const cols = 4;
          const rh = s / rows;
          const cw = s / cols;
          const gap = kind === 'brick' ? 2.5 : 3.5;

          for (let r = 0; r < rows; r++) {
            const off = (r % 2) * (cw * 0.5);
            for (let c = -1; c <= cols; c++) {
              const bx = c * cw + off;
              const by = r * rh;
              const v = Math.floor(175 + rand() * 55);
              ctx.fillStyle = `rgb(${v},${v},${v})`;
              ctx.fillRect(bx + gap, by + gap, cw - gap * 2, rh - gap * 2);
              ctx.fillStyle = '#f2f2f2';
              ctx.fillRect(bx + gap, by + gap, cw - gap * 2, 2.5);
              ctx.fillStyle = '#525252';
              ctx.fillRect(bx + gap, by + rh - gap - 2.5, cw - gap * 2, 2.5);
            }
          }
          return;
        }

        if (kind === 'wood' || kind === 'bark') {
          const planks = kind === 'wood' ? 6 : 10;
          const ph = s / planks;
          for (let p = 0; p < planks; p++) {
            const pos = p * ph;
            const tone = p % 2 === 0 ? '#a8a8a8' : '#949494';
            ctx.fillStyle = tone;
            if (kind === 'wood') {
              ctx.fillRect(0, pos, s, ph - 2);
              for (let g = 0; g < 7; g++) {
                const gy = pos + 5 + rand() * (ph - 10);
                ctx.strokeStyle = g % 2 === 0 ? '#d8d8d8' : '#585858';
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.bezierCurveTo(
                  s * 0.33,
                  gy + (rand() - 0.5) * 6,
                  s * 0.66,
                  gy + (rand() - 0.5) * 6,
                  s,
                  gy,
                );
                ctx.stroke();
              }
              ctx.fillStyle = '#1e1e1e';
              ctx.fillRect(0, pos + ph - 2.5, s, 2.5);
              const vx = ((p * 97 + 43) % (s - 32)) + 16;
              ctx.fillRect(vx, pos, 2.5, ph);
            } else {
              ctx.fillRect(pos, 0, ph - 2, s);
              ctx.fillStyle = '#262626';
              ctx.fillRect(pos + ph - 3, 0, 3, s);
              ctx.strokeStyle = '#d4d4d4';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(pos + ph * 0.4, 0);
              ctx.lineTo(pos + ph * 0.4 + (rand() - 0.5) * 8, s);
              ctx.stroke();
            }
          }
          return;
        }

        if (kind === 'metal' || kind === 'cyber') {
          const grad = ctx.createLinearGradient(0, 0, s, s);
          grad.addColorStop(0, '#c0c0c0');
          grad.addColorStop(0.5, '#969696');
          grad.addColorStop(1, '#787878');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, s, s);

          // Brushed striations
          for (let i = 0; i < 90; i++) {
            const y = rand() * s;
            ctx.fillStyle = rand() > 0.5 ? '#d8d8d8' : '#646464';
            ctx.fillRect(0, y, s, 1);
          }

          const step = kind === 'cyber' ? 64 : 128;
          ctx.strokeStyle = '#242424';
          ctx.lineWidth = 3;
          for (let x = 0; x < s; x += step) {
            for (let y = 0; y < s; y += step) {
              ctx.strokeRect(x + 2, y + 2, step - 4, step - 4);
              ctx.fillStyle = '#f0f0f0';
              for (const rx of [x + 9, x + step - 9]) {
                for (const ry of [y + 9, y + step - 9]) {
                  ctx.beginPath();
                  ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
            }
          }

          if (kind === 'cyber') {
            ctx.strokeStyle = '#202020';
            ctx.lineWidth = 4;
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
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(96, 32, 4, 0, Math.PI * 2);
            ctx.arc(64, 128, 4, 0, Math.PI * 2);
            ctx.fill();
          }
          return;
        }

        if (kind === 'sandstone' || kind === 'siding' || kind === 'roof') {
          const bands = kind === 'sandstone' ? 14 : 10;
          const bh = s / bands;
          for (let i = 0; i < bands; i++) {
            const by = i * bh;
            const hi = Math.floor(155 + (i % 3) * 30);
            ctx.fillStyle = `rgb(${hi},${hi},${hi})`;
            ctx.fillRect(0, by, s, bh - 2);
            ctx.fillStyle = '#2c2c2c';
            ctx.fillRect(0, by + bh - 2.5, s, 2.5);
            if (kind === 'sandstone') {
              ctx.strokeStyle = '#d8d8d8';
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(0, by + bh * 0.45);
              ctx.bezierCurveTo(
                s * 0.35,
                by + bh * (0.25 + rand() * 0.4),
                s * 0.7,
                by + bh * (0.25 + rand() * 0.4),
                s,
                by + bh * 0.45,
              );
              ctx.stroke();
            }
          }
          return;
        }

        // 'terrain' | 'rock' | 'basalt'
        const blobCount = kind === 'terrain' ? 420 : 120;
        for (let i = 0; i < blobCount; i++) {
          const x = rand() * s;
          const y = rand() * s;
          const w = kind === 'terrain' ? 2 + rand() * 5 : 12 + rand() * 26;
          const h = kind === 'terrain' ? 2 + rand() * 5 : 10 + rand() * 24;
          const v = rand() > 0.5 ? Math.floor(150 + rand() * 85) : Math.floor(60 + rand() * 55);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          for (const ox of [-s, 0, s]) {
            for (const oy of [-s, 0, s]) {
              if (x + ox < -w || x + ox > s + w || y + oy < -h || y + oy > s + h) continue;
              ctx.fillRect(x + ox, y + oy, w, h);
            }
          }
        }
        ctx.strokeStyle = '#282828';
        ctx.lineWidth = kind === 'terrain' ? 1.2 : 2.2;
        const cracks = kind === 'terrain' ? 110 : 38;
        for (let i = 0; i < cracks; i++) {
          const x = rand() * s;
          const y = rand() * s;
          const span = kind === 'terrain' ? 8 : 38;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (rand() - 0.5) * span, y + (rand() - 0.5) * span);
          ctx.stroke();
        }
      },
      1,
      1,
      true,
    );
  }

  dispose(): void {
    for (const tex of this.cache.values()) {
      tex.dispose();
    }
    this.cache.clear();
  }
}
