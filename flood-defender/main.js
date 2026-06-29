/**
 * FLOOD DEFENDER - Main Entry Point & Event Wiring
 */

let game;
let renderer;
let _rafId = null;
let _lastStormTick = 0;
let _resizeTimer = null;

// ── Guided Discovery Tour (Feature 4) ───────────────────────────────────────
const TOUR_STEPS = [
  { text: 'Welcome to Flood Defender! A storm is coming. Your job is to protect houses by placing green infrastructure before it hits.' },
  { text: 'Select a tile from the palette on the right — try Rain Garden or Tree. Then click any cell on the grid to place it.' },
  { text: 'Low-elevation cells (dark blue tint) flood first. Place tiles next to houses to absorb incoming water.' },
  { text: 'Watch your budget — every tile costs money. Maintenance costs are deducted each level, so plan carefully!' },
  { text: 'When you\'re ready, click "Run Storm" to start the simulation. Good luck — the city is counting on you!' },
];
let _tourStep = 0;

function _isTourDone() {
  try { return localStorage.getItem('fdTourDone') === '1'; } catch(e) { return true; }
}
function _markTourDone() {
  try { localStorage.setItem('fdTourDone', '1'); } catch(e) {}
}

function startTour() {
  if (_isTourDone()) return;
  _tourStep = 0;
  _showTourStep();
  document.getElementById('tour-overlay').classList.remove('hidden');
}

function _showTourStep() {
  const step = TOUR_STEPS[_tourStep];
  const label = document.getElementById('tour-step-label');
  const text  = document.getElementById('tour-text');
  const card  = document.getElementById('tour-card');
  if (!step || !label || !text) return;
  label.textContent = `Step ${_tourStep + 1} / ${TOUR_STEPS.length}`;
  text.textContent  = step.text;

  // Position the card near the canvas on desktop, center on mobile
  if (card) {
    const canvas = document.getElementById('game-canvas');
    if (canvas && window.innerWidth > 700) {
      const rect = canvas.getBoundingClientRect();
      card.style.left = `${rect.right + 16}px`;
      card.style.top  = `${rect.top + _tourStep * 60}px`;
    } else {
      card.style.left = '50%';
      card.style.top  = '50%';
      card.style.transform = 'translate(-50%,-50%)';
    }
  }
}

function advanceTour() {
  _tourStep++;
  if (_tourStep >= TOUR_STEPS.length) {
    endTour();
  } else {
    _showTourStep();
  }
}

function endTour() {
  document.getElementById('tour-overlay').classList.add('hidden');
  _markTourDone();
}

// Resize the canvas so cells are always whole pixels that fill available width.
function resizeCanvas() {
  const section = document.querySelector('.main-section');
  if (!section) return;
  const available = Math.min(640, section.clientWidth);
  const cs   = Math.max(8, Math.floor(available / CONFIG.GRID_WIDTH));
  const size = cs * CONFIG.GRID_WIDTH;
  const canvas = document.getElementById('game-canvas');
  if (canvas.width === size && canvas.height === size) return;
  canvas.width  = size;
  canvas.height = size;
  CONFIG.CELL_SIZE = cs;
  if (renderer) {
    renderer.cellSize = cs;
    renderer.render();
  }
}

function initGame() {
  game = new Game(CONFIG);
  resizeCanvas(); // set canvas + CELL_SIZE before renderer reads it
  renderer = new Renderer(CONFIG, game, 'game-canvas');
  renderer.render();
  setupEventListeners();
  startGameLoop();

  // Start guided tour on Level 1, first visit
  if (game.currentLevelIndex === 0) startTour();
}

function updateUndoRedoBtns() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  if (undoBtn) undoBtn.disabled = !game.canUndo();
  if (redoBtn) redoBtn.disabled = !game.canRedo();
}

function setupEventListeners() {
  const canvas = renderer.canvas;

  document.addEventListener('keydown', (e) => {
    if (game.phase !== 'build') return;
    const isUndo = e.ctrlKey && !e.shiftKey && e.key === 'z';
    const isRedo = e.ctrlKey && (e.shiftKey && e.key === 'Z' || e.key === 'y');
    if (!isUndo && !isRedo) return;
    e.preventDefault();
    if (isUndo ? game.undo() : game.redo()) renderer.render();
    updateUndoRedoBtns();
  });

  document.addEventListener('click', (e) => {
    if (e.target.id === 'start-build-btn') {
      game.startBuild();
      renderer.render();
    }

    if (e.target.id === 'run-storm-btn') {
      const ld  = game.levelDef;
      const eld = game.effectiveLevelDef || ld;
      const el  = (id) => document.getElementById(id);
      const c = el('confirm-cap');    if (c) c.textContent = ld.maxHousesLost;
      const s = el('confirm-spent');  if (s) s.textContent = '$' + (eld.budget - game.budgetRemaining);
      const b = el('confirm-budget'); if (b) b.textContent = eld.budget;
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

    if (e.target.id === 'retry-btn')      { game.retry();              renderer.render(); updateUndoRedoBtns(); }
    if (e.target.id === 'next-level-btn') { if (game.nextLevel())    { renderer.render(); updateUndoRedoBtns(); } }
    if (e.target.id === 'prev-level-btn') { if (game.prevLevel())    { renderer.render(); updateUndoRedoBtns(); } }
    if (e.target.id === 'reset-btn')      { game.retry();              renderer.render(); updateUndoRedoBtns(); }
    if (e.target.id === 'home-btn')       { window.location.href = CONFIG.HOME_URL; }

    if (e.target.id === 'undo-btn') { if (game.undo()) renderer.render(); updateUndoRedoBtns(); }
    if (e.target.id === 'redo-btn') { if (game.redo()) renderer.render(); updateUndoRedoBtns(); }

    // Tour buttons (Feature 4)
    if (e.target.id === 'tour-next-btn') advanceTour();
    if (e.target.id === 'tour-skip-btn') endTour();

    // Real event modal close (delegated, Feature 10)
    if (e.target.id === 'real-event-close-btn') {
      const m = document.getElementById('real-event-modal');
      if (m) m.classList.add('hidden');
    }

    // Difficulty toggle
    if (e.target.id === 'difficulty-easy-btn' || e.target.id === 'difficulty-normal-btn') {
      const mode = e.target.id === 'difficulty-easy-btn' ? 'easy' : 'normal';
      CONFIG.DIFFICULTY.current = mode;
      document.getElementById('difficulty-easy-btn').classList.toggle('primary-btn',   mode === 'easy');
      document.getElementById('difficulty-easy-btn').classList.toggle('secondary-btn', mode !== 'easy');
      document.getElementById('difficulty-normal-btn').classList.toggle('primary-btn',   mode === 'normal');
      document.getElementById('difficulty-normal-btn').classList.toggle('secondary-btn', mode !== 'normal');
      game.retry();
      renderer.render();
    }
  });

  // Mouse events (desktop)
  canvas.addEventListener('click', (e) => {
    renderer.handleCanvasClick(e.clientX, e.clientY, false);
    renderer.render();
    updateUndoRedoBtns();
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    renderer.handleCanvasClick(e.clientX, e.clientY, true);
    renderer.render();
    updateUndoRedoBtns();
  });

  canvas.addEventListener('mousemove', (e) => {
    renderer.handleCanvasHover(e.clientX, e.clientY);
  });

  canvas.addEventListener('mouseleave', () => {
    renderer.hoveredCell = null;
    renderer._mousePos   = null;
    renderer._hideTooltip();
  });

  // Touch events (mobile) — tap to place, long-press to erase
  let _touchTimer = null;
  let _touchMoved = false;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _touchMoved = false;
    const t = e.touches[0];
    // Long-press (500 ms) triggers erase
    _touchTimer = setTimeout(() => {
      if (!_touchMoved) {
        renderer.handleCanvasClick(t.clientX, t.clientY, true); // right-click = erase
        renderer.render();
      }
    }, 500);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    _touchMoved = true;
    clearTimeout(_touchTimer);
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    clearTimeout(_touchTimer);
    if (!_touchMoved) {
      const t = e.changedTouches[0];
      renderer.handleCanvasClick(t.clientX, t.clientY, false);
      renderer.render();
    }
  }, { passive: false });
}

function startGameLoop() {
  if (_rafId) cancelAnimationFrame(_rafId);
  _lastStormTick = performance.now();

  function tick(now) {
    const _tickMs = (CONFIG.UI && CONFIG.UI.stormTickMs) ? CONFIG.UI.stormTickMs : 150;
    if (game.isStormActive() && now - _lastStormTick >= _tickMs) {
      game.advanceStorm();
      _lastStormTick = now;
    }

    renderer.render();
    _rafId = requestAnimationFrame(tick);
  }

  _rafId = requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(resizeCanvas, 150);
});

window.addEventListener('beforeunload', () => {
  if (_rafId) cancelAnimationFrame(_rafId);
});

document.addEventListener('DOMContentLoaded', initGame);
