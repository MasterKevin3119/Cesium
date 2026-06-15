/**
 * FLOOD DEFENDER - Rendering & UI
 * 
 * Canvas rendering, UI updates, tooltips. Reads game state, updates DOM and canvas.
 */

class Renderer {
  constructor(config, game, canvasId) {
    this.config = config;
    this.game = game;

    // Canvas setup
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.cellSize = config.CELL_SIZE;

    // UI elements (cached)
    this.elements = {
      phaseTitle: document.getElementById('phase-title'),
      phaseBriefing: document.getElementById('phase-briefing'),
      budgetRemaining: document.getElementById('budget-remaining'),
      maintenanceCost: document.getElementById('maintenance-cost'),
      runStormBtn: document.getElementById('run-storm-btn'),
      retryBtn: document.getElementById('retry-btn'),
      nextLevelBtn: document.getElementById('next-level-btn'),
      resetBtn: document.getElementById('reset-btn'),
      tileSelector: document.getElementById('tile-selector'),
      happinessMeter: document.getElementById('happiness-meter'),
      treeHealthMeter: document.getElementById('tree-health-meter'),
      riverHealthMeter: document.getElementById('river-health-meter'),
      damageCounter: document.getElementById('damage-counter'),
      resultsPanel: document.getElementById('results-panel'),
      scoreDisplay: document.getElementById('score-display'),
      starsDisplay: document.getElementById('stars-display'),
      lessonCard: document.getElementById('lesson-card'),
    };

    // Interaction state
    this.selectedTile = null;
    this.hoveredCell = null;
  }

  /**
   * Full render update. Call every frame.
   */
  render() {
    // Always update budget info in top bar
    this.elements.budgetRemaining.textContent = this.game.budgetRemaining;
    this.elements.maintenanceCost.textContent = this.game.maintenanceCost;

    // Update UI based on current phase
    switch (this.game.phase) {
      case 'briefing':
        this.renderBriefing();
        break;
      case 'build':
        this.renderBuild();
        break;
      case 'storm':
        this.renderStorm();
        break;
      case 'results':
        this.renderResults();
        break;
    }
  }

  // ============================================================================
  // PHASE: BRIEFING
  // ============================================================================
  renderBriefing() {
    this.elements.phaseTitle.textContent = 'Briefing';
    this.elements.phaseBriefing.innerHTML = `
      <h2>${this.game.levelDef.name}</h2>
      <p>${this.game.levelDef.briefing}</p>
      <p><strong>Budget:</strong> $${this.game.levelDef.budget}</p>
      <p><strong>Goal:</strong> Keep damage below ${this.game.levelDef.damageCapForPass}</p>
      <button id="start-build-btn" class="primary-btn">Start Building</button>
    `;

    // Draw empty grid
    this.drawGrid(null);

    // Hide lesson card
    this.elements.lessonCard.style.display = 'none';

    // Clear buttons
    this.elements.runStormBtn.style.display = 'none';
    this.elements.retryBtn.style.display = 'none';
    this.elements.nextLevelBtn.style.display = 'none';
  }

  // ============================================================================
  // PHASE: BUILD
  // ============================================================================
  renderBuild() {
    this.elements.phaseTitle.textContent = 'Build';
    this.elements.phaseBriefing.innerHTML = `
      <p>Place green infrastructure to reduce flood damage.</p>
      <p>Click to place, right-click to remove.</p>
      <p><strong>Budget:</strong> $${this.game.budgetRemaining} / ${this.game.levelDef.budget}</p>
      <p><strong>Maintenance:</strong> $${this.game.maintenanceCost}/level</p>
    `;

    // Draw grid with placements
    this.drawGrid(null);

    // Hide lesson card
    this.elements.lessonCard.style.display = 'none';

    // Draw tile palette
    this.renderTilePalette();

    // Show run storm button
    this.elements.runStormBtn.style.display = 'block';
    this.elements.retryBtn.style.display = 'block';
    this.elements.nextLevelBtn.style.display = 'none';

    // Hide parameter meters (not relevant in build)
    document.getElementById('parameters-panel').style.display = 'none';
  }

  renderTilePalette() {
    const panel = this.elements.tileSelector;
    panel.innerHTML = '<h3>Tiles</h3>';

    for (const tileType of this.game.getAvailableTiles()) {
      const tileDef = this.config.TILES[tileType];
      const btn = document.createElement('button');
      btn.className = 'tile-btn';
      btn.style.backgroundColor = tileDef.color;
      btn.textContent = `${tileDef.name}\n$${tileDef.cost}`;
      btn.title = tileDef.tooltip;
      btn.dataset.tile = tileType;
      btn.addEventListener('click', () => {
        this.selectedTile = this.selectedTile === tileType ? null : tileType;
        this.updateTilePaletteSelection();
      });
      panel.appendChild(btn);
    }

    // Add eraser tool
    const eraserBtn = document.createElement('button');
    eraserBtn.className = 'tile-btn eraser-btn';
    eraserBtn.textContent = '🗑️\nErase\n(50%)';
    eraserBtn.title = 'Remove a tile and get 50% refund.';
    eraserBtn.dataset.tile = '__erase__';
    eraserBtn.addEventListener('click', () => {
      this.selectedTile = this.selectedTile === '__erase__' ? null : '__erase__';
      this.updateTilePaletteSelection();
    });
    panel.appendChild(eraserBtn);
  }

  updateTilePaletteSelection() {
    const btns = this.elements.tileSelector.querySelectorAll('.tile-btn');
    btns.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.tile === this.selectedTile);
    });
  }

  // ============================================================================
  // PHASE: STORM
  // ============================================================================
  renderStorm() {
    this.elements.phaseTitle.textContent = 'Storm';
    this.elements.phaseBriefing.innerHTML = `<p>Storm in progress... Watch the water!</p>`;

    const gridState = this.game.getGridState();
    const metrics = this.game.getCurrentMetrics();

    // Draw animated grid
    this.drawGrid(gridState);

    // Update parameter meters
    if (metrics) {
      this.updateMeter(this.elements.happinessMeter, metrics.happiness);
      this.updateMeter(this.elements.treeHealthMeter, metrics.treeHealth);
      this.updateMeter(this.elements.riverHealthMeter, metrics.riverHealth);
      this.elements.damageCounter.textContent = `Damage: ${metrics.damage}`;
    }

    // Show parameters panel
    document.getElementById('parameters-panel').style.display = 'block';

    // Hide buttons during storm
    this.elements.runStormBtn.style.display = 'none';
    this.elements.retryBtn.style.display = 'none';
    this.elements.nextLevelBtn.style.display = 'none';
    this.elements.tileSelector.innerHTML = ''; // Hide palette
  }

  // ============================================================================
  // PHASE: RESULTS
  // ============================================================================
  renderResults() {
    this.elements.phaseTitle.textContent = 'Results';

    const metrics = this.game.getFinalMetrics();
    const levelDef = this.game.levelDef;

    let resultHTML = `
      <h2>Level Complete</h2>
      <p><strong>Final Damage:</strong> ${Math.round(metrics.totalDamage)} (cap: ${levelDef.damageCapForPass})</p>
      <p><strong>Damage Avoided:</strong> ${Math.round(Math.max(0, 10000 - metrics.totalDamage))}</p>
      <p><strong>Budget Remaining:</strong> $${this.game.budgetRemaining}</p>
      <p><strong>Maintenance Paid:</strong> $${this.game.maintenanceCost}</p>
      <hr>
      <p><strong>Happiness:</strong> ${Math.round(metrics.avgHappiness)}/100</p>
      <p><strong>Tree Health:</strong> ${Math.round(metrics.avgTreeHealth)}/100</p>
      <p><strong>River Health:</strong> ${Math.round(metrics.avgRiverHealth)}/100</p>
      <hr>
      <p style="font-size: 24px; font-weight: bold;">Score: ${this.game.score}</p>
      <p>${'⭐'.repeat(this.game.stars)} (${'☆'.repeat(3 - this.game.stars)})</p>
    `;

    if (!this.game.passed) {
      resultHTML += `<p style="color: red; font-weight: bold;">❌ Level Failed. Try again!</p>`;
    } else {
      resultHTML += `<p style="color: green; font-weight: bold;">✅ Level Passed!</p>`;
    }

    this.elements.phaseBriefing.innerHTML = resultHTML;

    // Show lesson card
    this.renderLessonCard(metrics);

    // Draw final grid
    const gridState = this.game.getGridState();
    this.drawGrid(gridState);

    // Show result buttons
    this.elements.runStormBtn.style.display = 'none';
    this.elements.retryBtn.style.display = 'block';
    this.elements.nextLevelBtn.style.display = this.game.passed ? 'block' : 'none';
    this.elements.tileSelector.innerHTML = '';

    // Hide parameters during results
    document.getElementById('parameters-panel').style.display = 'none';
  }

  renderLessonCard(metrics) {
    let lesson = '';
    
    // Pick a lesson based on outcome
    if (metrics.totalDamage > 80) {
      lesson = 'Green infrastructure like wetlands and retention ponds absorb and store water, reducing downstream flooding.';
    } else if (metrics.avgTreeHealth < 50) {
      lesson = 'Trees provide urban cooling and water absorption, but they need the right moisture level to survive.';
    } else if (metrics.avgRiverHealth < 50) {
      lesson = 'Rivers thrive when surrounded by natural buffers (trees, wetlands). Direct paved runoff stresses the river ecosystem.';
    } else if (this.game.budgetRemaining < 100) {
      lesson = 'Maintenance costs compound. Strategic placement of high-efficiency solutions (wetlands, ponds) maximizes protection per dollar.';
    } else {
      lesson = 'Excellent work! Smart design using multiple green infrastructure types provides resilient flood defense.';
    }

    this.elements.lessonCard.innerHTML = `
      <h3>What You Learned</h3>
      <p>${lesson}</p>
    `;
    this.elements.lessonCard.style.display = 'block';
  }

  // ============================================================================
  // CANVAS DRAWING
  // ============================================================================
  drawGrid(gridState) {
    // Clear canvas
    this.ctx.fillStyle = '#f5f5f5';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const width = this.config.GRID_WIDTH;
    const height = this.config.GRID_HEIGHT;

    // Draw cells
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Get tile info from gridState or simulation's starting grid
        let tileType = 'grass';
        let water = 0;
        let elevation = 0;

        if (gridState) {
          const cell = gridState[y][x];
          tileType = cell.type;
          water = cell.water;
          elevation = cell.elevation;
        } else {
          // In briefing/build, show placements
          const key = `${x},${y}`;
          if (this.game.placements[key]) {
            tileType = this.game.placements[key];
          }
        }

        const tileDef = this.config.TILES[tileType];

        // Draw tile base color
        this.ctx.fillStyle = tileDef.color;
        
        // Subtle elevation shading
        const elevationShade = elevation * this.config.ELEVATION_SHADE_INTENSITY;
        const rgb = this.hexToRgb(tileDef.color);
        this.ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${1 - elevationShade})`;
        
        this.ctx.fillRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);

        // Water overlay (semi-transparent blue, intensity with depth)
        if (water > 0) {
          const waterAlpha = Math.min(0.8, water * this.config.WATER_OPACITY_SCALE);
          this.ctx.fillStyle = `rgba(30, 136, 229, ${waterAlpha})`;
          this.ctx.fillRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
        }

        // Grid lines
        this.ctx.strokeStyle = '#ccc';
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
      }
    }

    // Draw hovered cell preview (build phase only)
    if (this.game.phase === 'build' && this.hoveredCell && this.selectedTile && this.selectedTile !== '__erase__') {
      const { x, y } = this.hoveredCell;
      const tileDef = this.config.TILES[this.selectedTile];
      this.ctx.fillStyle = tileDef.color;
      this.ctx.globalAlpha = 0.5;
      this.ctx.fillRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
      this.ctx.globalAlpha = 1;
    }
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 127, g: 127, b: 127 };
  }

  updateMeter(meterElement, value) {
    const clampedValue = Math.max(0, Math.min(100, value));
    // meterElement IS the meter-fill div
    meterElement.style.width = `${clampedValue}%`;
    const text = meterElement.querySelector('.meter-text');
    if (text) {
      text.textContent = `${Math.round(clampedValue)}`;
    }
  }

  /**
   * Get grid cell from mouse coordinates.
   */
  getCellFromMouse(mouseX, mouseY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((mouseX - rect.left) / this.cellSize);
    const y = Math.floor((mouseY - rect.top) / this.cellSize);
    if (x >= 0 && x < this.config.GRID_WIDTH && y >= 0 && y < this.config.GRID_HEIGHT) {
      return { x, y };
    }
    return null;
  }

  /**
   * Handle canvas click (place tile).
   */
  handleCanvasClick(mouseX, mouseY, isRightClick = false) {
    if (this.game.phase !== 'build') return;

    const cell = this.getCellFromMouse(mouseX, mouseY);
    if (!cell) return;

    if (isRightClick || this.selectedTile === '__erase__') {
      // Remove tile
      const result = this.game.removeTile(cell.x, cell.y);
      if (result.success) {
        console.log(`Removed tile, got $${result.refund} back`);
      }
    } else if (this.selectedTile) {
      // Place tile
      const result = this.game.placeTile(cell.x, cell.y, this.selectedTile);
      if (!result.success) {
        console.log(`Failed to place: ${result.reason}`);
      }
    }
  }

  /**
   * Handle canvas hover (show preview).
   */
  handleCanvasHover(mouseX, mouseY) {
    const cell = this.getCellFromMouse(mouseX, mouseY);
    this.hoveredCell = cell;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Renderer;
}
