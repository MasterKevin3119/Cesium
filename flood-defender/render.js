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

    // Replay and compare state
    this._replayActive  = false;
    this._replayFrame   = 0;
    this._replayTimer   = null;
    this._compareActive = false;
    this._compareFrame  = 0;
    this._compareTimer  = null;

    // Terrain heatmap (Feature 6)
    this._heatmapActive = false;

    // Storm preview (Feature 1)
    this._previewActive = false;
    this._previewGrid   = null;

    // Glossary tooltip element (Feature 11)
    this._glossTooltip  = null;

    this.elements.cellTooltip = document.getElementById('cell-tooltip');

    // Glossary delegated listener (Feature 11) — set up once
    this._setupGlossaryListener();

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

      // Stop any active replay/compare animations
      if (this._replayTimer)  { clearInterval(this._replayTimer);  this._replayTimer  = null; this._replayActive  = false; }
      if (this._compareTimer) { clearInterval(this._compareTimer); this._compareTimer = null; this._compareActive = false; }

      // Show undo/redo buttons only in build phase
      const undoBtn = document.getElementById('undo-btn');
      const redoBtn = document.getElementById('redo-btn');
      const inBuild = this.game.phase === 'build';
      if (undoBtn) undoBtn.style.display = inBuild ? 'inline-block' : 'none';
      if (redoBtn) redoBtn.style.display = inBuild ? 'inline-block' : 'none';
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
      const realEvent = this.config.REAL_EVENTS && this.config.REAL_EVENTS[ld.id];
      const eventFootnote = realEvent
        ? `<div class="real-event-note">🌍 Similar to: <em>${realEvent.name}</em> (${realEvent.year}) &mdash; <button class="link-btn" id="real-event-btn">Learn more</button></div>`
        : '';

      const winConditions = ld.isSandbox
        ? `<p style="color:var(--success);font-weight:600">Sandbox — no win condition. Experiment freely!</p>`
        : `<ul class="win-list">
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
          </ul>`;

      this.elements.phaseTitle.textContent = 'Briefing';
      this.elements.phaseBriefing.innerHTML = `
        <h2>${ld.name}</h2>
        <p>${ld.briefing}</p>
        ${eventFootnote}
        <hr>
        <p style="font-weight:600;color:var(--accent);margin-bottom:6px">${ld.isSandbox ? '' : 'How to WIN this level:'}</p>
        ${winConditions}
        <button id="start-build-btn" class="primary-btn" style="margin-top:14px">Start Building</button>
      `;

      this._applyGlossary(this.elements.phaseBriefing);

      // Wire real event button
      const evtBtn = document.getElementById('real-event-btn');
      if (evtBtn && realEvent) {
        evtBtn.addEventListener('click', () => this._showRealEventModal(realEvent));
      }
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

      const adaptiveHtml = this.game._adaptiveBoosted
        ? `<div class="adaptive-chip challenge">⚡ Challenge Mode — +12% rain intensity</div>`
        : this.game._suggestEasy
          ? `<div class="adaptive-chip easy-nudge">💡 Struggling? Try Easy mode — same map, less rain.</div>`
          : '';

      this.elements.phaseBriefing.innerHTML = `
        ${adaptiveHtml}
        <p>Place green infrastructure to reduce flood damage.</p>
        <p>Click to place, right-click or long-press to remove.</p>
        <p><strong>Budget:</strong> $${this.game.budgetRemaining} / ${this.game.effectiveLevelDef.budget}</p>
        <p><strong>Maintenance:</strong> $${this.game.maintenanceCost}/level</p>
        <div class="build-toggles">
          <button id="heatmap-btn" class="toggle-btn ${this._heatmapActive ? 'active' : ''}">🗺 Terrain Map</button>
          <button id="preview-btn" class="toggle-btn">🌧 Flood Preview</button>
        </div>
      `;

      // Wire toggle buttons
      const heatBtn = document.getElementById('heatmap-btn');
      if (heatBtn) heatBtn.addEventListener('click', () => {
        this._heatmapActive = !this._heatmapActive;
        heatBtn.classList.toggle('active', this._heatmapActive);
        if (this._heatmapActive) { this._previewActive = false; }
      });
      const prevBtn = document.getElementById('preview-btn');
      if (prevBtn) prevBtn.addEventListener('click', () => {
        this._previewGrid  = this.game.computeStormPreview(20);
        this._previewActive = true;
        this._heatmapActive = false;
        const hb = document.getElementById('heatmap-btn');
        if (hb) hb.classList.remove('active');
        prevBtn.textContent = '🌧 Flood Preview (updated)';
      });

      this._applyGlossary(this.elements.phaseBriefing);
    }

    // Tile palette — built once per phase entry, not every frame
    if (!this._paletteBuilt) {
      this.renderTilePalette();
      this._paletteBuilt = true;
    }

    // Keep undo/redo buttons in sync with stack state
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.disabled = !this.game.canUndo();
    if (redoBtn) redoBtn.disabled = !this.game.canRedo();

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
    const isSandbox = !!ld.isSandbox;
    const housesOver = !isSandbox && metrics.housesLost > ld.maxHousesLost;
    const spent    = ld.budget - this.game.budgetRemaining;
    const dmgColor = housesOver ? 'var(--danger)' : 'var(--success)';
    const dmgMark  = housesOver ? '✗' : '✓';

    const starLabels = [
      '',
      'You survived — damage stayed under the cap.',
      'Good ecology and budget efficiency on top of surviving.',
      'Excellent ecology and efficient spending — outstanding!',
    ];

    const adviceHTML = !passed && !isSandbox
      ? `<div class="failure-advice">${this._buildFailureAdvice(metrics)}</div>`
      : '';

    // Model solution button (only if level has one)
    const hasSol = !isSandbox && !!(ld.referenceSolution && ld.referenceSolution.length > 0);
    const modelBtnHTML = hasSol
      ? `<button id="model-sol-btn" class="secondary-btn model-sol-btn" style="margin-top:10px">Show model solution</button>`
      : '';

    // Replay and compare buttons
    const hasFrames = this.game.getReplayFrames().length > 0;
    const replayBtnHTML = hasFrames
      ? `<button id="replay-btn" class="secondary-btn" style="margin-top:8px;width:100%">↩ Replay Storm</button>`
      : '';
    const compareBtnHTML = (hasFrames && hasSol)
      ? `<button id="compare-btn" class="secondary-btn" style="margin-top:6px;width:100%">⚡ Compare Side-by-Side</button>`
      : '';

    // Sandbox vs regular banner
    const bannerHTML = isSandbox
      ? `<div class="result-banner sandbox-banner">🧪 EXPERIMENT COMPLETE</div>
         <p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:8px">No win condition in Sandbox. Tiles placed: <strong>${Object.keys(this.game.placements).length}</strong>. Budget used: <strong>$${spent}</strong>.</p>`
      : `<div class="result-banner ${passed ? 'pass-banner' : 'fail-banner'}">${passed ? '✓ LEVEL PASSED' : '✗ LEVEL FAILED'}</div>
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
         </p>`;

    // Achievement badges (Feature 9)
    const badgeData = this.game.getBadgeData();
    const badgeDefs = this.config.BADGES || {};
    const earnedBadges = Object.entries(badgeDefs)
      .filter(([id]) => badgeData[id])
      .map(([, b]) => `<span class="badge-chip" title="${b.description}">${b.emoji} ${b.name}</span>`)
      .join('');
    const badgesHTML = earnedBadges
      ? `<div class="badge-strip">${earnedBadges}</div>`
      : '';

    this.elements.phaseBriefing.innerHTML = `
      ${bannerHTML}
      ${adviceHTML}
      ${badgesHTML}
      ${!passed || isSandbox ? '' : '<ul class="star-tier-list" style="margin-top:10px"><li>&#9733; Survive — houses within cap</li><li>&#9733;&#9733; Survive + decent ecology &amp; budget</li><li>&#9733;&#9733;&#9733; Survive + excellent ecology &amp; efficient spending</li></ul>'}
      ${modelBtnHTML}
      ${replayBtnHTML}
      ${compareBtnHTML}
    `;

    this.elements.resultsPanel.innerHTML = '';

    // Case study card (Feature 5)
    const caseStudy = this.config.CASE_STUDIES && this.config.CASE_STUDIES[this.game.levelDef.id];
    if (caseStudy) {
      const factsHTML = (caseStudy.facts || []).map(f => `<li>${f}</li>`).join('');
      const el = document.createElement('div');
      el.className = 'case-card';
      el.innerHTML = `
        <div class="case-card-header">📖 Real-World Case Study</div>
        <div class="case-title">${caseStudy.title}</div>
        <div class="case-meta">${caseStudy.location} · ${caseStudy.year}</div>
        <ul class="case-facts">${factsHTML}</ul>
        <div class="case-connection"><em>${caseStudy.connection}</em></div>
      `;
      this.elements.resultsPanel.appendChild(el);
    }

    // Hydrology dashboard (Feature 12)
    const hydroLog = this.game.getHydrologyLog();
    if (hydroLog && hydroLog.length > 1) {
      const dash = document.createElement('div');
      dash.className = 'hydro-dash';
      dash.innerHTML = `<div class="hydro-title">💧 Hydrology Dashboard</div>${this._buildHydroSVG(hydroLog)}
        <div class="hydro-legend">
          <span class="hl-rain">▬ Rainfall Rate</span>
          <span class="hl-water">▬ Max House Depth</span>
        </div>`;
      this.elements.resultsPanel.appendChild(dash);
    }

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

    // Wire up replay / compare buttons
    const replayBtn = document.getElementById('replay-btn');
    if (replayBtn) replayBtn.addEventListener('click', () => this._toggleReplay());
    const compareBtn = document.getElementById('compare-btn');
    if (compareBtn) compareBtn.addEventListener('click', () => this._toggleCompare());

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
    if (this._replayActive || this._compareActive) return;
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

  drawGrid(gridState, skipLostHouses = false) {
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

    // Terrain heatmap overlay (Feature 6) — build/briefing phase only
    if (this._heatmapActive && !gridState) {
      const heatGrid = elevGrid;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const elev = heatGrid[y][x].elevation;
          const px = x * cs, py = y * cs;
          if (elev === 0)      ctx.fillStyle = 'rgba(0,102,204,0.38)';
          else if (elev === 2) ctx.fillStyle = 'rgba(204,34,0,0.38)';
          else                 continue;
          ctx.fillRect(px, py, cs, cs);
        }
      }
    }

    // Storm preview overlay (Feature 1) — build phase only
    if (this._previewActive && this._previewGrid && !gridState) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const water = this._previewGrid[y][x].water;
          if (water > 0.01) {
            ctx.fillStyle = `rgba(56,189,248,${Math.min(0.65, water * waterScale)})`;
            ctx.fillRect(x * cs, y * cs, cs, cs);
          }
        }
      }
    }

    // Synergy glow (Feature 2) — green border on tiles with 2+ adjacent green tiles
    if (this.game.phase === 'build' && !gridState) {
      const synergySet = this.config.SYNERGY_TILES;
      if (synergySet) {
        const dx = [1, -1, 0, 0], dy = [0, 0, 1, -1];
        ctx.lineWidth = 2.5;
        for (const [key, tileType] of Object.entries(this.game.placements)) {
          if (!synergySet.includes(tileType)) continue;
          const [cx2, cy2] = key.split(',').map(Number);
          let adj = 0;
          for (let d = 0; d < 4; d++) {
            const nx = cx2 + dx[d], ny = cy2 + dy[d];
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const nKey = `${nx},${ny}`;
            const nType = this.game.placements[nKey] || (elevGrid ? elevGrid[ny][nx].type : 'grass');
            if (synergySet.includes(nType)) adj++;
          }
          if (adj >= 2) {
            ctx.strokeStyle = 'rgba(74,222,128,0.85)';
            ctx.strokeRect(cx2 * cs + 1.5, cy2 * cs + 1.5, cs - 3, cs - 3);
          }
        }
      }
    }

    // Mark lost houses red in results phase; show flooding houses during storm
    if (!skipLostHouses && this.game.phase === 'results' && this._lostHouseCells.length > 0) {
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

  // ── REPLAY ──────────────────────────────────────────────────────────────────

  _toggleReplay() {
    if (this._replayActive) this._stopReplay();
    else this._startReplay();
  }

  _startReplay() {
    this._stopCompare();
    this._replayActive = true;
    this._replayFrame  = 0;
    const btn = document.getElementById('replay-btn');
    if (btn) btn.textContent = '⏹ Stop Replay';

    const frames = this.game.getReplayFrames();
    this._replayTimer = setInterval(() => {
      if (this._replayFrame >= frames.length) { this._stopReplay(); return; }
      this._drawReplayFrame(this._replayFrame++, frames);
    }, 75);
  }

  _stopReplay() {
    this._replayActive = false;
    if (this._replayTimer) { clearInterval(this._replayTimer); this._replayTimer = null; }
    const btn = document.getElementById('replay-btn');
    if (btn) btn.textContent = '↩ Replay Storm';
    this._drawResultsGrid();
  }

  _drawReplayFrame(frameIndex, frames) {
    const frame = frames[frameIndex];
    const W   = this.config.GRID_WIDTH;
    const H   = this.config.GRID_HEIGHT;
    const cs  = this.cellSize;
    const ctx = this.ctx;
    const waterScale = this.config.WATER_OPACITY_SCALE;
    const threshold  = this.config.SIM.houseLossDepth / this.config.SIM.metersPerUnit;

    this.drawGrid(null, true); // base map without static lost-house boxes

    const elevGrid = this.game.getElevationGrid();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const water = frame[y * W + x];
        if (water <= 0.001) continue;
        const px = x * cs, py = y * cs;
        ctx.fillStyle = `rgba(30,136,229,${Math.min(0.82, water * waterScale)})`;
        ctx.fillRect(px, py, cs, cs);
        const key = `${x},${y}`;
        const tileType = this.game.placements[key] || elevGrid[y][x].type;
        if (tileType === 'house' && water > threshold) {
          ctx.fillStyle = 'rgba(239,68,68,0.55)';
          ctx.fillRect(px, py, cs, cs);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
        }
      }
    }

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(4, 4, 148, 28);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(`↩ Tick ${frameIndex + 1} / ${frames.length}`, 10, 23);
  }

  // ── COMPARE (side-by-side replay) ───────────────────────────────────────────

  _toggleCompare() {
    if (this._compareActive) this._stopCompare();
    else this._startCompare();
  }

  _startCompare() {
    this._stopReplay();

    const playerFrames = this.game.getReplayFrames();
    if (!playerFrames.length) return;

    // runReferenceSolution is cached; this call is free if already done
    const refResult = this.game.runReferenceSolution();
    if (!refResult) return;
    this._refResult = refResult;

    this._compareActive = true;
    this._compareFrame  = 0;
    const btn = document.getElementById('compare-btn');
    if (btn) btn.textContent = '⏹ Stop Compare';

    const refFrames  = refResult.frames || [];
    const maxFrames  = Math.max(playerFrames.length, refFrames.length);

    this._compareTimer = setInterval(() => {
      if (this._compareFrame >= maxFrames) { this._stopCompare(); return; }
      this._drawCompareSplit(this._compareFrame++, playerFrames, refFrames);
    }, 75);
  }

  _stopCompare() {
    this._compareActive = false;
    if (this._compareTimer) { clearInterval(this._compareTimer); this._compareTimer = null; }
    const btn = document.getElementById('compare-btn');
    if (btn) btn.textContent = '⚡ Compare Side-by-Side';
    this._drawResultsGrid();
  }

  _drawCompareSplit(frameIndex, playerFrames, refFrames) {
    const W      = this.config.GRID_WIDTH;
    const H      = this.config.GRID_HEIGHT;
    const totalW = this.canvas.width;
    const totalH = this.canvas.height;
    const halfW  = Math.floor(totalW / 2);
    const cs     = Math.floor(halfW / W);
    const ctx    = this.ctx;

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, totalW, totalH);

    const playerFrame = playerFrames[Math.min(frameIndex, playerFrames.length - 1)];
    const refFrame    = refFrames[Math.min(frameIndex, refFrames.length - 1)];

    const modelPlacements = {};
    for (const pl of (this.game.levelDef.referenceSolution || []))
      modelPlacements[`${pl.x},${pl.y}`] = pl.type;

    this._drawMiniGrid(0,     0, cs, playerFrame, this.game.placements);
    this._drawMiniGrid(halfW, 0, cs, refFrame,    modelPlacements);

    // Divider
    ctx.strokeStyle = 'rgba(56,189,248,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, totalH);
    ctx.stroke();

    // Labels
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0,     0, halfW, 26);
    ctx.fillRect(halfW, 0, halfW, 26);
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Your Layout',    halfW / 2,          17);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('Model Solution', halfW + halfW / 2,  17);
    ctx.textAlign = 'left';

    // Tick counter
    const maxFrames = Math.max(playerFrames.length, refFrames.length);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(4, totalH - 28, 168, 24);
    ctx.fillStyle = '#fff';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`Tick ${frameIndex + 1} / ${maxFrames}`, 8, totalH - 10);
  }

  _drawMiniGrid(offsetX, offsetY, cs, waterFrame, placements) {
    const W   = this.config.GRID_WIDTH;
    const H   = this.config.GRID_HEIGHT;
    const ctx = this.ctx;
    const cache     = this._rgbCache;
    const elevGrid  = this.game.getElevationGrid();
    const waterScale = this.config.WATER_OPACITY_SCALE;
    const threshold  = this.config.SIM.houseLossDepth / this.config.SIM.metersPerUnit;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const baseCell = elevGrid[y][x];
        const key      = `${x},${y}`;
        const tileType = placements[key] || baseCell.type;
        const elev     = baseCell.elevation;
        const px = offsetX + x * cs;
        const py = offsetY + y * cs;

        const img = this._images[tileType];
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, px, py, cs, cs);
        } else {
          const rgb = cache[tileType] || cache['grass'];
          ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
          ctx.fillRect(px, py, cs, cs);
        }

        if (elev === 0) {
          ctx.fillStyle = 'rgba(0,15,50,0.35)';
          ctx.fillRect(px, py, cs, cs);
        } else if (elev === 2) {
          ctx.fillStyle = 'rgba(255,250,200,0.22)';
          ctx.fillRect(px, py, cs, cs);
        }

        if (waterFrame) {
          const water = waterFrame[y * W + x];
          if (water > 0.001) {
            ctx.fillStyle = `rgba(30,136,229,${Math.min(0.82, water * waterScale)})`;
            ctx.fillRect(px, py, cs, cs);
            const resolvedType = placements[key] || baseCell.type;
            if (resolvedType === 'house' && water > threshold) {
              ctx.fillStyle = 'rgba(239,68,68,0.55)';
              ctx.fillRect(px, py, cs, cs);
            }
          }
        }

        ctx.strokeStyle = 'rgba(148,163,184,0.08)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(px, py, cs, cs);
      }
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
      // Budget forecast (Feature 7): lifetime cost over storm duration
      const ld = this.game.effectiveLevelDef || this.game.levelDef;
      const stormTicks = (ld.rainRampUp || 0) + (ld.rainPeak || 0) + (ld.rainRampDown || 0);
      if (stormTicks > 0 && this.game.phase === 'build') {
        const lifetime = tileDef.cost + Math.round(tileDef.maintenance * stormTicks / 10);
        tags += `<span class="tt-tag" style="color:#c084fc">Lifecycle ~$${lifetime}</span>`;
      }
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

  // ── Glossary (Feature 11) ────────────────────────────────────────────────────

  _setupGlossaryListener() {
    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('.gloss-term');
      if (!target) return;
      const term = target.dataset.term;
      const def  = this.config.GLOSSARY && this.config.GLOSSARY[term];
      if (!def) return;
      const rect = target.getBoundingClientRect();
      this._showGlossTooltip(rect, term, def);
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.classList && e.target.classList.contains('gloss-term'))
        this._hideGlossTooltip();
    });
  }

  _showGlossTooltip(rect, term, def) {
    let el = document.getElementById('gloss-tooltip');
    if (!el) return;
    el.innerHTML = `<strong>${term}</strong><br>${def}`;
    const pad = 6;
    let tx = rect.left, ty = rect.bottom + pad;
    if (tx + 240 > window.innerWidth) tx = Math.max(0, window.innerWidth - 248);
    if (ty + 70  > window.innerHeight) ty = rect.top - 70;
    el.style.left = `${tx}px`;
    el.style.top  = `${ty}px`;
    el.classList.remove('hidden');
  }

  _hideGlossTooltip() {
    const el = document.getElementById('gloss-tooltip');
    if (el) el.classList.add('hidden');
  }

  _applyGlossary(element) {
    if (!this.config.GLOSSARY || !element) return;
    const terms   = Object.keys(this.config.GLOSSARY);
    const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex   = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes  = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    for (const n of nodes) {
      if (!n.textContent || !regex.test(n.textContent)) { regex.lastIndex = 0; continue; }
      regex.lastIndex = 0;
      const wrap = document.createElement('span');
      wrap.innerHTML = n.textContent.replace(regex, (match) => {
        const key = terms.find(t => t.toLowerCase() === match.toLowerCase()) || match;
        return `<span class="gloss-term" data-term="${key}">${match}</span>`;
      });
      n.parentNode.replaceChild(wrap, n);
    }
  }

  // ── Real Event Modal (Feature 10) ────────────────────────────────────────────

  _showRealEventModal(evt) {
    const modal = document.getElementById('real-event-modal');
    if (!modal) return;
    const body = modal.querySelector('.modal-card');
    if (body) {
      body.innerHTML = `
        <div class="modal-title">🌍 ${evt.name} (${evt.year})</div>
        <p class="modal-line" style="color:var(--text-dim);margin-bottom:8px">${evt.location}</p>
        <p class="modal-line">${evt.summary}</p>
        <div class="modal-note"><strong>Lesson:</strong> ${evt.lesson}</div>
        <div class="modal-btns">
          <button id="real-event-close-btn" class="primary-btn">Close</button>
        </div>
      `;
      document.getElementById('real-event-close-btn')
        .addEventListener('click', () => modal.classList.add('hidden'));
    }
    modal.classList.remove('hidden');
  }

  // ── Hydrology Dashboard (Feature 12) ─────────────────────────────────────────

  _buildHydroSVG(log) {
    const W = 300, H = 90, pad = 6;
    const n  = log.length;
    const maxRain  = Math.max(...log.map(e => e.rainRate),  0.001);
    const maxWater = Math.max(...log.map(e => e.maxHouseWater), 0.001);

    const rx = (i) => pad + (i / (n - 1)) * (W - pad * 2);
    const rainY  = (v) => H - pad - (v / maxRain)  * (H - pad * 2);
    const waterY = (v) => H - pad - (v / maxWater) * (H - pad * 2);

    const rainPts  = log.map((e, i) => `${rx(i).toFixed(1)},${rainY(e.rainRate).toFixed(1)}`).join(' ');
    const waterPts = log.map((e, i) => `${rx(i).toFixed(1)},${waterY(e.maxHouseWater).toFixed(1)}`).join(' ');

    return `<svg class="hydro-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${rainPts}"  fill="none" stroke="#38bdf8" stroke-width="1.8"/>
      <polyline points="${waterPts}" fill="none" stroke="#f87171" stroke-width="1.8"/>
    </svg>`;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Renderer;
