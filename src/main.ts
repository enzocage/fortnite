import './style.css';
import { GameEngine } from './engine';

const canvasContainer = document.getElementById('game-canvas-container');
const uiRoot = document.getElementById('ui-root');

if (!canvasContainer || !uiRoot) {
  throw new Error('Missing #game-canvas-container or #ui-root mount elements.');
}

let game: GameEngine | null = null;
try {
  game = new GameEngine(canvasContainer, uiRoot);
} catch (err) {
  const box = document.createElement('div');
  box.id = 'fdr-boot-error';
  box.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,14,28,0.95);color:#f8fafc;font-family:system-ui,sans-serif;';
  const card = document.createElement('div');
  card.style.cssText =
    'max-width:560px;padding:20px 24px;border-radius:10px;border:1.5px solid #ef4444;background:#0f172a;box-shadow:0 16px 40px rgba(0,0,0,0.6);';
  const heading = document.createElement('h2');
  heading.textContent = 'NITEFORT — Startup Error';
  heading.style.cssText = 'margin:0 0 10px;font-size:20px;color:#f87171;';
  const msg = document.createElement('p');
  msg.textContent = err instanceof Error ? err.message : String(err);
  msg.style.cssText = 'margin:0 0 8px;font-size:14px;line-height:1.5;color:#e2e8f0;word-break:break-word;';
  const hint = document.createElement('p');
  hint.textContent = 'Please ensure WebGL is enabled in your browser and the page is served via HTTP/HTTPS.';
  hint.style.cssText = 'margin:0;font-size:12px;color:#94a3b8;';
  card.append(heading, msg, hint);
  box.appendChild(card);
  uiRoot.appendChild(box);
  throw err;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose();
  });
}
