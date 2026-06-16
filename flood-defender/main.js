/**
 * FLOOD DEFENDER - Main Entry Point & Event Wiring
 */

let game;
let renderer;
let _rafId = null;
let _lastStormTick = 0;
const STORM_TICK_MS = 100;

function initGame() {
  game = new Game(CONFIG);
  renderer = new Renderer(CONFIG, game, 'game-canvas');
  renderer.render();
  setupEventListeners();
  startGameLoop();
}

function setupEventListeners() {
  const canvas = renderer.canvas;

  document.addEventListener('click', (e) => {
    if (e.target.id === 'start-build-btn') {
      game.startBuild();
      renderer.render();
    }

    if (e.target.id === 'run-storm-btn') {
      // Show confirm modal with current objective + spend summary
      const ld = game.levelDef;
      const el = (id) => document.getElementById(id);
      const c = el('confirm-cap');    if (c) c.textContent = ld.damageCapForPass;
      const s = el('confirm-spent');  if (s) s.textContent = '$' + (ld.budget - game.budgetRemaining);
      const b = el('confirm-budget'); if (b) b.textContent = ld.budget;
      const modal = el('storm-confirm');
      if (modal) modal.classList.remove('hidden');
    }

    if (e.target.id === 'confirm-run-btn') {
      const modal = document.getElementById('storm-confirm');
      if (modal) modal.classList.add('hidden');
      game.startStorm();
      renderer.render();
    }

    if (e.target.id === 'confirm-cancel-btn') {
      const modal = document.getElementById('storm-confirm');
      if (modal) modal.classList.add('hidden');
    }

    if (e.target.id === 'retry-btn')      { game.retry();     renderer.render(); }
    if (e.target.id === 'next-level-btn') { if (game.nextLevel()) renderer.render(); }
    if (e.target.id === 'reset-btn')      { game.retry();     renderer.render(); }
  });

  canvas.addEventListener('click', (e) => {
    renderer.handleCanvasClick(e.clientX, e.clientY, false);
    renderer.render();
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    renderer.handleCanvasClick(e.clientX, e.clientY, true);
    renderer.render();
  });

  // Update hover state only — the RAF loop redraws the canvas
  canvas.addEventListener('mousemove', (e) => {
    renderer.handleCanvasHover(e.clientX, e.clientY);
  });

  canvas.addEventListener('mouseleave', () => {
    renderer.hoveredCell = null;
    renderer._mousePos   = null;
    renderer._hideTooltip();
  });
}

function startGameLoop() {
  if (_rafId) cancelAnimationFrame(_rafId);
  _lastStormTick = performance.now();

  function tick(now) {
    // Advance storm simulation at its own fixed cadence
    if (game.isStormActive() && now - _lastStormTick >= STORM_TICK_MS) {
      game.advanceStorm();
      _lastStormTick = now;
    }

    renderer.render();
    _rafId = requestAnimationFrame(tick);
  }

  _rafId = requestAnimationFrame(tick);
}

window.addEventListener('beforeunload', () => {
  if (_rafId) cancelAnimationFrame(_rafId);
});

document.addEventListener('DOMContentLoaded', initGame);
