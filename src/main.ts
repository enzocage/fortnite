import './style.css';
import { GameEngine } from './engine';

const canvasContainer = document.getElementById('game-canvas-container');
const uiRoot = document.getElementById('ui-root');

if (!canvasContainer || !uiRoot) {
  throw new Error('Missing #game-canvas-container or #ui-root mount elements.');
}

const game = new GameEngine(canvasContainer, uiRoot);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
