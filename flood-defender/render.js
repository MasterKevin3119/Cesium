/**
 * FLOOD DEFENDER - Rendering & UI
 *
 * Canvas rendering, UI updates, tooltips. Reads game state, updates DOM and canvas.
 */

class Renderer {
  constructor(config, game, canvasId) {
    this.config = config;
    this.game = game;

    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.cellSize = config.CELL_SIZE;

    this.elements = {
      phaseTitle:       document.getElementById('phase-title'),
      phaseBriefing:    document.getElementById('phase-briefing'),
      budgetRemaining:  document.getElementById('budget-remaining'),
      maintenanceCost:  document.getElementById('maintenance-cost'),
      runStormBtn:      document.getElementById('run-storm-btn'),
      retryBtn:         document.getElementById('retry-btn'),
      nextLevelBtn:     document.getElementById('next-level-btn'),
      prevLevelBtn:     document.getElementById('prev-level-btn'),
      resetBtn:         document.getElementById('reset-btn'),
      tileSelector:     document.getElementById('tile-selector'),
      happinessMeter:   document.getElementById('happiness-meter'),
      treeHealthMeter:  document.getElementById('tree-health-meter'),
      riverHealthMeter: document.getElementById('river-health-meter'),
      housesCounter:    document.getElementById('houses-counter'),
      resultsPanel:     document.getElementById('results-panel'),
      scoreDisplay:     document.getElementById('score-display'),
      starsDisplay:     document.getElementById('stars-display'),
      lessonCard:       document.getElementById('lesson-card'),
      parametersPanel:  document.getElementById('parameters-panel'),
    };

    this.selectedTile     = null;
    this.hoveredCell      = null;
    this._mousePos        = null;
    this._lostHouseCells  = [];
    this._images           = {};
    this._preloadImages();

    this.elements.cellTooltip = document.getElementById('cell-tooltip');

    // Dirty-check state — avoid redundant DOM writes
    this._lastPhase       = null;
    this._lastBudget      = null;
    this._lastMaintenance = null;
    this._paletteBuilt    = false;

    // Pre-cache hex→rgb per tile type so hexToRgb() is never called in the draw loop
    this._rgbCache = {};
    for (const [key, tile] of Object.entries(config.TILES)) {
      this._rgbCache[key] = this._hexToRgb(tile.color);
    }
  }

  // ── Top-level render ────────────────────────────────────────────────────────

  render() {
    const phaseChanged = this.game.phase !== this._lastPhase;
    if (phaseChanged) {
      this._lastPhase    = this.game.phase;
      this._paletteBuilt = false;
      this._updateObjectiveBar();
    }

    // Budget counter — update only when value changes
    if (this.game.budgetRemaining !== this._lastBudget) {
      this._lastBudget = this.game.budgetRemaining;
      this.elements.budgetRemaining.textContent = this.game.budgetRemaining;
    }
    if (this.game.maintenanceCost !== this._lastMaintenance) {
      this._lastMaintenance = this.game.maintenanceCost;
      this.elements.maintenanceCost.textContent = this.game.maintenanceCost;
    }

    switch (this.game.phase) {
      case 'briefing': this.renderBriefing(phaseChanged); break;
      case 'build':    this.renderBuild(phaseChanged);    break;
      case 'storm':    this.renderStorm();                break;
      case 'results':  this.renderResults(phaseChanged);  break;
    }
  }

  // ── PHASE: BRIEFING ─────────────────────────────────────────────────────────

  renderBriefing(phaseChanged) {
    if (phaseChanged) {
      const ld = this.game.levelDef;
      this.elements.phaseTitle.textContent = 'Briefing';
      this.elements.phaseBriefing.innerHTML = `
        <h2>${ld.name}</h2>
        <p>${ld.briefing}</p>
        <hr>
        <p style="font-weight:600;color:var(--accent);margin-bottom:6px">How to WIN this level:</p>
        <ul class="win-list">
          <li>Lose no more than <strong>${ld.maxHousesLost}</strong> house${ld.maxHousesLost === 1 ? '' : 's'} to flooding</li>
          <li>Don't exceed your budget of <strong>$${this.game.effectiveLevelDef.budget}</strong></li>
        </ul>
        <p style="font-size:0.75rem;color:var(--text-dim);margin-bottom:10px">
          Ecology (happiness, trees, river) does <em>not</em> affect pass/fail — only your star rating.
        </p>
        <hr>
        <p style="font-weight:600;margin-bottom:5px">Star rating:</p>
        <ul class="star-tier-list">
          <li>&#9733; Survive — lose ≤ ${ld.maxHousesLost} houses and budget intact</li>
          <li>&#9733;&#9733; Survive with decent ecology and some budget left over</li>
          <li>&#9733;&#9733;&#9733; Survive with excellent ecology and efficient spending</li>
        </ul>
        <button id="start-build-btn" class="primary-btn" style="margin-top:14px">Start Building</button>
      `;
      this.elements.lessonCard.style.display      = 'none';
      this.elements.runStormBtn.style.display     = 'none';
      this.elements.retryBtn.style.display        = 'none';
      this.elements.nextLevelBtn.style.display    = 'none';
      this.elements.parametersPanel.style.display = 'none';
      if (this.elements.prevLevelBtn) {
        this.elements.prevLevelBtn.style.display  = this.game.currentLevelIndex > 0 ? 'block' : 'none';
      }
    }
    this.drawGrid(null);
  }

  // ── PHASE: BUILD ────────────────────────────────────────────────────────────

  renderBuild(phaseChanged) {
    if (phaseChanged) {
      this.elements.phaseTitle.textContent = 'Build';
      this.elements.runStormBtn.style.display  = 'block';
      this.elements.retryBtn.style.display     = 'block';
      this.elements.nextLevelBtn.style.display = 'none';
      this.elements.lessonCard.style.display   = 'none';
      this.elements.parametersPanel.style.display = 'none';
    }

    // Briefing updates when budget changes (placement / removal)
    if (phaseChanged || this.game.budgetRemaining !== this._lastBriefingBudget) {
      this._lastBriefingBudget = this.game.budgetRemaining;
      this.elements.phaseBriefing.innerHTML = `
        <p>Place green infrastructure to reduce flood damage.</p>
        <p>Click to place, right-click to remove.</p>
        <p><strong>Budget:</strong> $${this.game.budgetRemaining} / ${this.game.levelDef.budget}</p>
        <p><strong>Maintenance:</strong> $${this.game.maintenanceCost}/level</p>
      `;
    }

    // Tile palette — built once per phase entry, not every frame
    if (!this._paletteBuilt) {
      this.renderTilePalette();
      this._paletteBuilt = true;
    }

    this.drawGrid(null);
  }

  renderTilePalette() {
    const panel = this.elements.tileSelector;
    panel.innerHTML = '<h3>Tiles</h3>';

    for (const tileType of this.game.getAvailableTiles()) {
      const tileDef = this.config.TILES[tileType];
      const btn = document.createElement('button');
      btn.className = 'tile-btn';
      btn.title = tileDef.tooltip;
      if (tileDef.image) {
        btn.innerHTML = `
          <img class="tile-btn-icon" src="${tileDef.image}" alt="${tileDef.name}">
          <span class="tile-btn-label">${tileDef.name}</span>
          <span class="tile-btn-cost">$${tileDef.cost}</span>
        `;
      } else {
        btn.style.backgroundColor = tileDef.color;
        btn.innerHTML = `<span class="tile-btn-label">${tileDef.name}</span><span class="tile-btn-cost">$${tileDef.cost}</span>`;
      }
      btn.dataset.tile = tileType;
      btn.addEventListener('click', () => {
        this.selectedTile = this.selectedTile === tileType ? null : tileType;
        this.updateTilePaletteSelection();
      });
      panel.appendChild(btn);
    }

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
    btns.forEach(btn => btn.classList.toggle('selected', btn.dataset.tile === this.selectedTile));
  }

  // ── PHASE: STORM ────────────────────────────────────────────────────────────

  renderStorm() {
    if (this._lastPhase !== 'storm' || !this._stormHeaderSet) {
      this._stormHeaderSet = true;
      this.elements.phaseTitle.textContent = 'Storm';
      this.elements.phaseBriefing.innerHTML = '<p>Storm in progress... Watch the water!</p>';
      this.elements.runStormBtn.style.display  = 'none';
      this.elements.retryBtn.style.display     = 'block';
      this.elements.nextLevelBtn.style.display = 'none';
      this.elements.tileSelector.innerHTML     = '';
      this.elements.parametersPanel.style.display = 'block';
    }

    const gridState = this.game.getGridState();
    const metrics   = this.game.getCurrentMetrics();

    this.drawGrid(gridState);

    if (metrics) {
      this.updateMeter(this.elements.happinessMeter,   metrics.happiness);
      this.updateMeter(this.elements.treeHealthMeter,  metrics.treeHealth);
      this.updateMeter(this.elements.riverHealthMeter, metrics.riverHealth);
      this._updateHousesBar(metrics.housesLost, metrics.totalHouses, this.game.effectiveLevelDef.maxHousesLost);
    }
  }

  // ── PHASE: RESULTS ──────────────────────────────────────────────────────────

  renderResults(phaseChanged) {
    if (!phaseChanged) {
      // Redraw canvas in current view mode
      this._drawResultsGrid();
      return;
    }

    this._stormHeaderSet   = false;
    this._showModelSol     = false;
    this._modelSolRunning  = false;
    this._lostHouseCells   = this.game.getLostHouseCells();

    this.elements.phaseTitle.textContent = 'Results';

    const metrics  = this.game.getFinalMetrics();
    const ld       = this.game.effectiveLevelDef;
    const passed   = this.game.passed;
    const housesOver = metrics.housesLost > ld.maxHousesLost;
    const spent    = ld.budget - this.game.budgetRemaining;
    const dmgColor = housesOver ? 'var(--danger)' : 'var(--success)';
    const dmgMark  = housesOver ? '✗' : '✓';

    const starLabels = [
      '',
      'You survived — damage stayed under the cap.',
      'Good ecology and budget efficiency on top of surviving.',
      'Excellent ecology and efficient spending — outstanding!',
    ];

    const adviceHTML = !passed
      ? `<div class="failure-advice">${this._buildFailureAdvice(metrics)}</div>`
      : '';

    // Model solution button (only if level has one)
    const hasSol = !!(ld.referenceSolution && ld.referenceSolution.length > 0);
    const modelBtnHTML = hasSol
      ? `<button id="model-sol-btn" class="secondary-btn model-sol-btn" style="margin-top:10px">Show model solution</button>`
      : '';

    this.elements.phaseBriefing.innerHTML = `
      <div class="result-banner ${passed ? 'pass-banner' : 'fail-banner'}">${passed ? '✓ LEVEL PASSED' : '✗ LEVEL FAILED'}</div>
      <div class="result-verdict">
        <p><span style="color:${dmgColor}">${dmgMark}</span> Houses lost: <strong style="color:${dmgColor}">${metrics.housesLost} / ${metrics.totalHouses}</strong> (cap: ${ld.maxHousesLost})</p>
        <p><span style="color:var(--success)">✓</span> Budget: spent <strong>$${spent}</strong> of $${ld.budget} ($${this.game.budgetRemaining} left)</p>
      </div>
      <hr>
      <p style="font-size:1.1rem;margin-bottom:3px">${'⭐'.repeat(this.game.stars)}${'☆'.repeat(3 - this.game.stars)}</p>
      <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:10px">${starLabels[this.game.stars] || ''}</p>
      <p style="font-size:0.75rem;color:var(--text-dim)">
        Happiness ${Math.round(metrics.avgHappiness)}/100 &nbsp;·&nbsp;
        Trees ${Math.round(metrics.avgTreeHealth)}/100 &nbsp;·&nbsp;
        River ${Math.round(metrics.avgRiverHealth)}/100
      </p>
      ${adviceHTML}
      ${!passed ? '' : '<ul class="star-tier-list" style="margin-top:10px"><li>&#9733; Survive — houses within cap</li><li>&#9733;&#9733; Survive + decent ecology &amp; budget</li><li>&#9733;&#9733;&#9733; Survive + excellent ecology &amp; efficient spending</li></ul>'}
      ${modelBtnHTML}
    `;

    this.elements.resultsPanel.innerHTML = '';

    this.renderLessonCard(metrics);

    this.elements.runStormBtn.style.display     = 'none';
    this.elements.retryBtn.style.display        = 'block';
    this.elements.nextLevelBtn.style.display    = passed ? 'block' : 'none';
    if (this.elements.prevLevelBtn) {
      this.elements.prevLevelBtn.style.display  = this.game.currentLevelIndex > 0 ? 'block' : 'none';
    }
    this.elements.tileSelector.innerHTML        = '';
    this.elements.parametersPanel.style.display = 'none';

    // Wire up model solution button
    if (hasSol) {
      const btn = document.getElementById('model-sol-btn');
      if (btn) btn.addEventListener('click', () => this._toggleModelSolution());
    }

    this._drawResultsGrid();
  }

  _toggleModelSolution() {
    this._showModelSol = !this._showModelSol;
    const btn = document.getElementById('model-sol-btn');

    if (this._showModelSol) {
      // Run reference sim (cached after first call)
      if (!this._modelSolRunning) {
        this._modelSolRunning = true;
        if (btn) btn.textContent = 'Computing...';
        // Use setTimeout to let the UI update before the expensive sim run
        setTimeout(() => {
          const refResult = this.game.runReferenceSolution();
          this._refResult = refResult;
          if (btn) btn.textContent = 'Show your layout';
          this._renderModelComparison(refResult);
          this._drawResultsGrid();
        }, 0);
        return;
      }
      if (btn) btn.textContent = 'Show your layout';
      this._renderModelComparison(this._refResult);
    } else {
      if (btn) btn.textContent = 'Show model solution';
      this.elements.resultsPanel.innerHTML = '';
    }
    this._drawResultsGrid();
  }

  _renderModelComparison(refResult) {
    if (!refResult) return;
    const ld      = this.game.effectiveLevelDef || this.game.levelDef;
    const metrics = this.game.getFinalMetrics();
    const spent   = ld.budget - this.game.budgetRemaining;

    const playerPassed = metrics.housesLost <= ld.maxHousesLost;
    const refPassed    = refResult.metrics.housesLost <= ld.maxHousesLost;

    const pMark  = playerPassed ? '✓' : '✗';
    const pColor = playerPassed ? 'var(--success)' : 'var(--danger)';
    const rMark  = refPassed    ? '✓' : '✗';
    const rColor = refPassed    ? 'var(--success)' : 'var(--danger)';

    const alsoValidNote = this.game.passed
      ? `<p class="sol-also-valid">Your layout passed too — there are many valid ways to solve this level.</p>`
      : '';

    const solExp = this.game.levelDef.solutionExplanation || '';
    this.elements.resultsPanel.innerHTML = `
      <div class="sol-compare">
        <div class="sol-col">
          <div class="sol-col-label">Your layout</div>
          <div class="sol-stat"><span style="color:${pColor}">${pMark}</span> Houses lost: <strong>${metrics.housesLost} / ${metrics.totalHouses}</strong></div>
          <div class="sol-stat">Budget: <strong>$${spent}</strong> of $${ld.budget}</div>
        </div>
        <div class="sol-divider">vs</div>
        <div class="sol-col">
          <div class="sol-col-label">Model solution</div>
          <div class="sol-stat"><span style="color:${rColor}">${rMark}</span> Houses lost: <strong>${refResult.metrics.housesLost} / ${refResult.metrics.totalHouses}</strong></div>
          <div class="sol-stat">Budget: <strong>$${refResult.spent}</strong> of $${ld.budget}</div>
        </div>
      </div>
      ${alsoValidNote}
      <div class="sol-cap-note">Cap: ≤ ${ld.maxHousesLost} houses lost</div>
      ${solExp ? `<div class="sol-explanation"><strong>What makes this layout work:</strong><br>${solExp}</div>` : ''}
    `;
  }

  _drawResultsGrid() {
    const gridState = this.game.getGridState();
    if (this._showModelSol && this._refResult) {
      // Overlay model solution placements on the base map
      this._drawModelSolGrid();
    } else {
      this.drawGrid(gridState);
    }
  }

  _drawModelSolGrid() {
    // Show the base map (no player tiles) with model solution placements overlaid
    const ld  = this.game.levelDef;
    const sol = ld.referenceSolution || [];
    const elevGrid = this.game.getElevationGrid();

    // Build a placements dict from the model solution
    const modelPlacements = {};
    for (const pl of sol) modelPlacements[`${pl.x},${pl.y}`] = pl.type;

    // Temporarily swap placements and draw, then restore
    const savedPlacements = this.game.placements;
    this.game.placements  = modelPlacements;
    this.drawGrid(null);  // null gridState → uses getElevationGrid + placements
    this.game.placements  = savedPlacements;
  }

  renderLessonCard(metrics) {
    let lesson;
    if (metrics.housesLost > 0) {
      lesson = 'Green infrastructure like rain gardens and wetlands absorb water before it reaches houses. Next time, place tiles on the low-elevation ground right beside the houses that flooded.';
    } else if (metrics.avgTreeHealth < 50) {
      lesson = 'Trees provide urban cooling and water absorption, but they need the right moisture level to survive.';
    } else if (metrics.avgRiverHealth < 50) {
      lesson = 'Rivers thrive when surrounded by natural buffers (trees, wetlands). Direct paved runoff stresses the river ecosystem.';
    } else if (this.game.budgetRemaining < 100) {
      lesson = 'Maintenance costs compound. Strategic placement of high-efficiency solutions (wetlands, ponds) maximizes protection per dollar.';
    } else {
      lesson = 'Excellent work! Smart design using multiple green infrastructure types provides resilient flood defense.';
    }
    this.elements.lessonCard.innerHTML = `<h3>What You Learned</h3><p>${lesson}</p>`;
    this.elements.lessonCard.style.display = 'block';
  }

  // ── CANVAS ──────────────────────────────────────────────────────────────────

  drawGrid(gridState) {
    const ctx   = this.ctx;
    const cs    = this.cellSize;
    const W     = this.config.GRID_WIDTH;
    const H     = this.config.GRID_HEIGHT;
    const cache = this._rgbCache;
    const waterScale = this.config.WATER_OPACITY_SCALE;
    const now   = performance.now();

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // During briefing/build, get base map for elevation + original tile types
    const elevGrid = gridState ? null : this.game.getElevationGrid();

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let tileType = 'grass', water = 0, elevation = 0;

        if (gridState) {
          const cell = gridState[y][x];
          tileType  = cell.type;
          water     = cell.water;
          elevation = cell.elevation;
        } else {
          const baseCell = elevGrid[y][x];
          const key = `${x},${y}`;
          // Show player placement, or underlying map tile (river/house/grass)
          tileType  = this.game.placements[key] || baseCell.type;
          elevation = baseCell.elevation;
        }

        const rgb = cache[tileType] || cache['grass'];
        const isRiver = tileType === 'river';
        const px = x * cs, py = y * cs;

        // Base tile — SVG image if loaded, fall back to flat color
        const img = this._images[tileType];
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, px, py, cs, cs);
        } else {
          ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
          ctx.fillRect(px, py, cs, cs);
        }

        // Elevation tiers — 3 clearly distinct levels (0 = low/dark, 1 = neutral, 2 = high/bright)
        if (elevation === 0) {
          ctx.fillStyle = 'rgba(0,15,50,0.35)';
          ctx.fillRect(px, py, cs, cs);
        } else if (elevation === 2) {
          ctx.fillStyle = 'rgba(255,250,200,0.22)';
          ctx.fillRect(px, py, cs, cs);
        }

        // River: animated shimmer so it reads as flowing water
        if (isRiver) {
          const shimmer = Math.sin(now * 0.002 + x * 0.7 - y * 0.5) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(56,189,248,${0.35 + shimmer * 0.35})`;
          ctx.fillRect(px, py, cs, cs);
          // Moving highlight band
          const lineY = py + ((Math.floor(now * 0.04 + x + y * 2) % cs + cs) % cs);
          ctx.fillStyle = 'rgba(200,240,255,0.45)';
          ctx.fillRect(px, lineY, cs, 2);
        }

        // Water overlay during storm
        if (water > 0) {
          ctx.fillStyle = `rgba(30,136,229,${Math.min(0.82, water * waterScale)})`;
          ctx.fillRect(px, py, cs, cs);
        }

        // Grid lines
        ctx.strokeStyle = 'rgba(148,163,184,0.10)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(px, py, cs, cs);
      }
    }

    // Elevation contour edges — single batched path for all borders between different levels
    ctx.beginPath();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const src = gridState ? gridState[y][x] : elevGrid[y][x];
        const e   = src.elevation;
        if (x < W - 1) {
          const re = (gridState ? gridState[y][x+1] : elevGrid[y][x+1]).elevation;
          if (re !== e) { ctx.moveTo((x+1)*cs, y*cs); ctx.lineTo((x+1)*cs, (y+1)*cs); }
        }
        if (y < H - 1) {
          const be = (gridState ? gridState[y+1][x] : elevGrid[y+1][x]).elevation;
          if (be !== e) { ctx.moveTo(x*cs, (y+1)*cs); ctx.lineTo((x+1)*cs, (y+1)*cs); }
        }
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Mark lost houses red in results phase; show flooding houses during storm
    if (this.game.phase === 'results' && this._lostHouseCells.length > 0) {
      for (const { x, y } of this._lostHouseCells) {
        ctx.fillStyle   = 'rgba(239,68,68,0.45)';
        ctx.fillRect(x * cs, y * cs, cs, cs);
        ctx.strokeStyle = 'rgba(239,68,68,0.9)';
        ctx.lineWidth   = 2;
        ctx.strokeRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2);
      }
    } else if (this.game.phase === 'storm' && gridState) {
      const thr = this.config.SIM.houseLossDepth / this.config.SIM.metersPerUnit;
      for (let y2 = 0; y2 < H; y2++) {
        for (let x2 = 0; x2 < W; x2++) {
          const c2 = gridState[y2][x2];
          if (c2.type === 'house' && c2.water > thr) {
            ctx.fillStyle = 'rgba(239,68,68,0.35)';
            ctx.fillRect(x2 * cs, y2 * cs, cs, cs);
          }
        }
      }
    }

    // Hover preview (build phase) + accent border on any hovered cell
    if (this.hoveredCell) {
      const { x, y } = this.hoveredCell;

      if (this.game.phase === 'build' && this.selectedTile && this.selectedTile !== '__erase__') {
        const rgb = cache[this.selectedTile];
        if (rgb) {
          ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`;
          ctx.fillRect(x * cs, y * cs, cs, cs);
        }
      }

      // Always draw a subtle accent border on the hovered cell
      ctx.strokeStyle = 'rgba(56,189,248,0.75)';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2);

      // Update tooltip
      if (this._mousePos) {
        const info = this._getCellInfo(this.hoveredCell, gridState, elevGrid);
        this._updateTooltip(info.tileType, info.elevation, info.water, this._mousePos);
      }
    } else {
      this._hideTooltip();
    }
  }

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  _hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r
      ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
      : { r: 127, g: 127, b: 127 };
  }

  updateMeter(meterEl, value) {
    const v = Math.max(0, Math.min(100, value));
    meterEl.style.width = `${v}%`;
    const txt = meterEl.querySelector('.meter-text');
    if (txt) txt.textContent = Math.round(v);
  }

  getCellFromMouse(mouseX, mouseY) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.floor((mouseX - rect.left) * scaleX / this.cellSize);
    const y = Math.floor((mouseY - rect.top)  * scaleY / this.cellSize);
    if (x >= 0 && x < this.config.GRID_WIDTH && y >= 0 && y < this.config.GRID_HEIGHT) return { x, y };
    return null;
  }

  handleCanvasClick(mouseX, mouseY, isRightClick = false) {
    if (this.game.phase !== 'build') return;
    const cell = this.getCellFromMouse(mouseX, mouseY);
    if (!cell) return;

    if (isRightClick || this.selectedTile === '__erase__') {
      this.game.removeTile(cell.x, cell.y);
    } else if (this.selectedTile) {
      this.game.placeTile(cell.x, cell.y, this.selectedTile);
    }
  }

  handleCanvasHover(mouseX, mouseY) {
    this.hoveredCell = this.getCellFromMouse(mouseX, mouseY);
    this._mousePos   = { x: mouseX, y: mouseY };
    if (!this.hoveredCell) this._hideTooltip();
  }

  // ── TOOLTIP ─────────────────────────────────────────────────────────────────

  _getCellInfo(cell, gridState, elevGrid) {
    const { x, y } = cell;
    if (gridState) {
      const c = gridState[y][x];
      return { tileType: c.type, elevation: c.elevation, water: c.water };
    }
    if (elevGrid) {
      const base = elevGrid[y][x];
      const key  = `${x},${y}`;
      return { tileType: this.game.placements[key] || base.type, elevation: base.elevation, water: 0 };
    }
    return { tileType: 'grass', elevation: 0, water: 0 };
  }

  _updateTooltip(tileType, elevation, water, mousePos) {
    const el = this.elements.cellTooltip;
    if (!el) return;

    const tileDef  = this.config.TILES[tileType];
    const name     = tileDef ? tileDef.name     : tileType;
    const desc     = tileDef ? tileDef.tooltip  : '';

    const elevLabel = elevation === 0 ? 'Low Ground' : elevation === 2 ? 'High Ground' : 'Mid Ground';
    const elevColor = elevation === 0 ? '#f87171'    : elevation === 2 ? '#4ade80'     : '#94a3b8';

    let tags = `<span class="tt-tag" style="color:${elevColor}">${elevLabel}</span>`;

    if (tileDef && tileDef.cost > 0) {
      tags += `<span class="tt-tag" style="color:#fbbf24">$${tileDef.cost}</span>`;
    }
    if (tileDef && tileDef.maintenance > 0) {
      tags += `<span class="tt-tag" style="color:#94a3b8">Maint $${tileDef.maintenance}/lvl</span>`;
    }
    if (water > 0.01) {
      tags += `<span class="tt-tag" style="color:#38bdf8">Water ${water.toFixed(2)}m</span>`;
    }

    el.innerHTML = `
      <div class="tt-name">${name}</div>
      <div class="tt-desc">${desc}</div>
      <div class="tt-meta">${tags}</div>
    `;

    // Position near cursor, clamped inside viewport
    const pad = 14;
    const tw  = 234;
    const th  = el.offsetHeight || 90;
    let tx = mousePos.x + pad;
    let ty = mousePos.y - th - pad;
    if (tx + tw > window.innerWidth  - 8) tx = mousePos.x - tw - pad;
    if (ty < 8)                           ty = mousePos.y + pad;

    el.style.left = `${tx}px`;
    el.style.top  = `${ty}px`;
    el.classList.remove('hidden');
  }

  _hideTooltip() {
    if (this.elements.cellTooltip) this.elements.cellTooltip.classList.add('hidden');
  }

  // ── IMAGE PRELOADING ────────────────────────────────────────────────────────

  _preloadImages() {
    for (const [key, tile] of Object.entries(this.config.TILES)) {
      if (!tile.image) continue;
      const img = new Image();
      img.src = tile.image;
      this._images[key] = img;
    }
  }

  // ── WIN CONDITION HELPERS ────────────────────────────────────────────────────

  _updateObjectiveBar() {
    const ld  = this.game.levelDef;
    const eld = this.game.effectiveLevelDef || ld;
    const cap = document.getElementById('obj-cap');
    const bud = document.getElementById('obj-budget');
    if (cap) cap.textContent = ld.maxHousesLost;
    if (bud) bud.textContent = eld.budget;
  }

  _updateHousesBar(housesLost, totalHouses, maxLost) {
    const fill   = document.getElementById('houses-meter-fill');
    const label  = document.getElementById('houses-value-label');
    const status = document.getElementById('houses-status-text');
    if (!fill || !label) return;

    const pct  = Math.min(100, (housesLost / Math.max(1, totalHouses)) * 100);
    const over = housesLost > maxLost;
    fill.style.width = `${pct}%`;
    label.textContent = `${housesLost} / ${totalHouses} (cap: ${maxLost})`;
    fill.classList.toggle('over-cap', over);
    if (status) {
      if (over) {
        status.textContent = `${housesLost - maxLost} too many — failing!`;
        status.style.color = 'var(--danger)';
      } else {
        const rem = maxLost - housesLost;
        status.textContent = rem === 0
          ? 'At the limit — barely passing!'
          : `${rem} more allowed — winning!`;
        status.style.color = 'var(--success)';
      }
    }
  }

  _buildFailureAdvice(metrics) {
    const ld    = this.game.effectiveLevelDef || this.game.levelDef;
    const lines = [];

    if (metrics.housesLost > ld.maxHousesLost) {
      const over = metrics.housesLost - ld.maxHousesLost;
      lines.push(`<strong>${metrics.housesLost}</strong> house${metrics.housesLost !== 1 ? 's' : ''} flooded — ${over} over the cap.`);
      lines.push('The red tiles on the map show which houses were lost. Place <strong>rain gardens or trees</strong> on the low-elevation cells right beside them — those basins are where water concentrates.');
      if (metrics.housesLost === metrics.totalHouses) {
        lines.push('Try placing tiles <em>before</em> the storm and use the full budget — even a few well-placed rain gardens make a big difference.');
      }
    }

    return lines.join(' ');
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Renderer;
