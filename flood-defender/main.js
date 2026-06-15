/**
 * FLOOD DEFENDER - Main Entry Point & Event Wiring
 * 
 * Initializes the game, sets up event handlers, runs the main game loop.
 */

let game;
let renderer;
let gameLoopInterval = null;

/**
 * Initialize the game.
 */
function initGame() {
  game = new Game(CONFIG);
  renderer = new Renderer(CONFIG, game, 'game-canvas');

  // Initial render
  renderer.render();

  // Wire up event listeners
  setupEventListeners();

  // Start animation loop
  startGameLoop();
}

/**
 * Set up all event listeners.
 */
function setupEventListeners() {
  const canvas = renderer.canvas;

  // Phase transition buttons
  document.addEventListener('click', (e) => {
    if (e.target.id === 'start-build-btn') {
      game.startBuild();
      renderer.render();
    }
    if (e.target.id === 'run-storm-btn') {
      game.startStorm();
      renderer.render();
    }
    if (e.target.id === 'retry-btn') {
      game.retry();
      renderer.render();
    }
    if (e.target.id === 'next-level-btn') {
      if (game.nextLevel()) {
        renderer.render();
      }
    }
    if (e.target.id === 'reset-btn') {
      game.retry();
      renderer.render();
    }
  });

  // Canvas interactions (build phase)
  canvas.addEventListener('click', (e) => {
    renderer.handleCanvasClick(e.clientX, e.clientY, false);
    renderer.render();
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    renderer.handleCanvasClick(e.clientX, e.clientY, true);
    renderer.render();
  });

  canvas.addEventListener('mousemove', (e) => {
    renderer.handleCanvasHover(e.clientX, e.clientY);
    renderer.render(); // Re-render for hover preview
  });
}

/**
 * Main game loop.
 */
function startGameLoop() {
  // Clear any existing loop
  if (gameLoopInterval) clearInterval(gameLoopInterval);

  gameLoopInterval = setInterval(() => {
    // Only advance storm if in storm phase
    if (game.isStormActive()) {
      game.advanceStorm();
    }

    // Always render
    renderer.render();
  }, 100); // ~10 FPS for reasonable animation speed
}

/**
 * Clean up on page unload.
 */
window.addEventListener('beforeunload', () => {
  if (gameLoopInterval) clearInterval(gameLoopInterval);
});

// Start game when DOM is ready
document.addEventListener('DOMContentLoaded', initGame);
