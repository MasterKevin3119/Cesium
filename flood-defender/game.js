/**
 * FLOOD DEFENDER - Game State & Scoring
 * 
 * Manages game phases, budget, tile placements, scoring, and level progression.
 */

class Game {
  constructor(config) {
    this.config = config;
    this.currentLevelIndex = 0;
    this.unlockedLevels = [0]; // Start with level 0 unlocked

    this.reset();
  }

  reset() {
    const levelDef = this.config.LEVELS[this.currentLevelIndex];
    this.levelDef = levelDef;

    // Apply difficulty multipliers
    const diffCfg = this.config.DIFFICULTY || {};
    const diff = diffCfg[diffCfg.current || 'normal'] ||
                 { budgetMultiplier: 1, rainMultiplier: 1, riverMultiplier: 1 };

    this.effectiveLevelDef = Object.assign({}, levelDef, {
      budget:      Math.round(levelDef.budget      * diff.budgetMultiplier),
      rainRate:    levelDef.rainRate    * diff.rainMultiplier,
      riverInflow: levelDef.riverInflow * diff.riverMultiplier,
      customGrid:  this._adminCustomGrid || levelDef.customGrid || null,
    });

    // Budget & placement
    this.budgetRemaining = this.effectiveLevelDef.budget;
    this.maintenanceCost = 0;
    this.placements = {};

    // Undo / redo stacks (build phase only)
    this._undoHistory = [];
    this._redoHistory = [];

    // Simulation
    this.simulation = null;

    // Phase tracking
    this.phase = 'briefing';
    this.score = 0;
    this.stars = 0;
    this.passed = false;
    this._elevationGrid = null;
    this._refSolResult  = null;

    // Adaptive difficulty flags (Feature 3)
    this._adaptiveBoosted = false;
    this._suggestEasy     = false;
    this._applyAdaptiveDifficulty();

    // Unlock sandbox (Feature 8) after any 2 regular levels are unlocked
    if (this.unlockedLevels.length >= 2) {
      const sandboxIdx = this.config.LEVELS.findIndex(l => l.isSandbox);
      if (sandboxIdx >= 0 && !this.unlockedLevels.includes(sandboxIdx)) {
        this.unlockedLevels.push(sandboxIdx);
      }
    }
  }

  getCurrentLevel() {
    return this.config.LEVELS[this.currentLevelIndex];
  }

  getAvailableTiles() {
    return this.levelDef.availableTiles || [];
  }

  // ── Undo / Redo ──────────────────────────────────────────────────────────────

  _snapshotState() {
    return {
      placements:      Object.assign({}, this.placements),
      budgetRemaining: this.budgetRemaining,
      maintenanceCost: this.maintenanceCost,
    };
  }

  _pushUndo() {
    this._undoHistory.push(this._snapshotState());
    if (this._undoHistory.length > 20) this._undoHistory.shift();
    this._redoHistory = [];
  }

  undo() {
    if (this.phase !== 'build' || this._undoHistory.length === 0) return false;
    this._redoHistory.push(this._snapshotState());
    const s = this._undoHistory.pop();
    this.placements      = s.placements;
    this.budgetRemaining = s.budgetRemaining;
    this.maintenanceCost = s.maintenanceCost;
    return true;
  }

  redo() {
    if (this.phase !== 'build' || this._redoHistory.length === 0) return false;
    this._undoHistory.push(this._snapshotState());
    const s = this._redoHistory.pop();
    this.placements      = s.placements;
    this.budgetRemaining = s.budgetRemaining;
    this.maintenanceCost = s.maintenanceCost;
    return true;
  }

  canUndo() { return this.phase === 'build' && this._undoHistory.length > 0; }
  canRedo() { return this.phase === 'build' && this._redoHistory.length > 0; }

  /**
   * Try to place a tile at (x, y). Returns { success, reason }.
   */
  placeTile(x, y, tileType) {
    const key = `${x},${y}`;

    // Can't place if already occupied
    if (this.placements[key]) {
      return { success: false, reason: 'Tile already exists here' };
    }

    const tileDef = this.config.TILES[tileType];
    if (!tileDef || !tileDef.placeable) {
      return { success: false, reason: 'Tile not placeable' };
    }

    // Check budget
    if (this.budgetRemaining < tileDef.cost) {
      return { success: false, reason: 'Not enough budget' };
    }

    // Check maintenance doesn't exceed budget after placement
    const newMaintenance = this.maintenanceCost + tileDef.maintenance;
    // For now, allow maintenance; it's deducted at results

    this._pushUndo();

    // Place it
    this.placements[key] = tileType;
    this.budgetRemaining -= tileDef.cost;
    this.maintenanceCost += tileDef.maintenance;

    return { success: true };
  }

  /**
   * Remove a tile, refunding a fraction of its cost.
   */
  removeTile(x, y, refundFraction = 0.5) {
    const key = `${x},${y}`;
    const tileType = this.placements[key];
    if (!tileType) {
      return { success: false, reason: 'No tile here' };
    }

    this._pushUndo();

    const tileDef = this.config.TILES[tileType];
    const refund = Math.round(tileDef.cost * refundFraction);

    delete this.placements[key];
    this.budgetRemaining += refund;
    this.maintenanceCost -= tileDef.maintenance;

    return { success: true, refund };
  }

  /**
   * Transition to build phase. Initializes simulation with current placements.
   */
  startBuild() {
    this.phase = 'build';
  }

  /**
   * Transition to storm phase.
   */
  startStorm() {
    this.simulation = new Simulation(this.config, this.effectiveLevelDef);
    this.simulation.enableReplayRecording();
    this.simulation.enableHydrologyLog();
    for (const [key, tileType] of Object.entries(this.placements)) {
      const [x, y] = key.split(',').map(Number);
      this.simulation.setCell(x, y, tileType);
    }
    this.phase = 'storm';
  }

  getReplayFrames() {
    return this.simulation ? this.simulation.getReplayFrames() : [];
  }

  getHydrologyLog() {
    return this.simulation ? this.simulation.getHydrologyLog() : [];
  }

  /**
   * Advance storm by one tick.
   */
  advanceStorm() {
    if (!this.simulation || this.phase !== 'storm') return;
    this.simulation.tick();
    if (this.simulation.isComplete()) {
      this.endStorm();
    }
  }

  /**
   * Transition to results phase.
   */
  endStorm() {
    this.phase = 'results';
    this.computeScore();
  }

  /**
   * Compute final score and star rating.
   */
  computeScore() {
    // Sandbox: no scoring, always passes
    if (this.effectiveLevelDef.isSandbox) {
      this.score  = 0;
      this.stars  = 0;
      this.passed = true;
      return;
    }

    const metrics  = this.simulation.getFinalMetrics();
    const levelDef = this.effectiveLevelDef;

    // Houses protected ratio (0–1)
    const housesProtected = metrics.totalHouses - metrics.housesLost;
    const propertyScore = housesProtected / Math.max(1, metrics.totalHouses);

    // Budget efficiency
    const budgetScore = this.budgetRemaining / levelDef.budget;

    // Ecological health
    const ecoScore = (
      (metrics.avgHappiness  / 100) +
      (metrics.avgTreeHealth / 100) +
      (metrics.avgRiverHealth / 100)
    ) / 3;

    const weights = this.config.SCORING;
    const normalizedScore =
      propertyScore * weights.propertyProtectionWeight +
      budgetScore   * weights.budgetEfficiencyWeight +
      ecoScore      * weights.ecologicalHealthWeight;

    this.score = Math.round(normalizedScore * 100);

    if      (normalizedScore >= weights.star3Threshold) this.stars = 3;
    else if (normalizedScore >= weights.star2Threshold) this.stars = 2;
    else if (normalizedScore >= weights.star1Threshold) this.stars = 1;
    else                                                this.stars = 0;

    // Pass: houses lost within cap AND budget not overspent
    this.passed = metrics.housesLost <= levelDef.maxHousesLost && this.budgetRemaining >= 0;

    if (this.passed && this.currentLevelIndex + 1 < this.config.LEVELS.length) {
      const next = this.currentLevelIndex + 1;
      if (!this.unlockedLevels.includes(next)) this.unlockedLevels.push(next);
    }

    // Sandbox unlock once 2+ regular levels are unlocked
    const sandboxIdx = this.config.LEVELS.findIndex(l => l.isSandbox);
    if (sandboxIdx >= 0 && this.unlockedLevels.length >= 2 && !this.unlockedLevels.includes(sandboxIdx)) {
      this.unlockedLevels.push(sandboxIdx);
    }

    this._savePerformanceHistory();
    this._evaluateBadges(metrics);
  }

  /**
   * Move to next level (only if passed).
   */
  nextLevel() {
    if (!this.passed) return false;
    if (this.currentLevelIndex + 1 >= this.config.LEVELS.length) return false;
    this.currentLevelIndex++;
    this.reset();
    return true;
  }

  /**
   * Move to previous level.
   */
  prevLevel() {
    if (this.currentLevelIndex === 0) return false;
    this.currentLevelIndex--;
    this.reset();
    return true;
  }

  /**
   * Restart current level.
   */
  retry() {
    this.reset();
  }

  /**
   * Select a level to play.
   */
  selectLevel(levelIndex) {
    if (!this.unlockedLevels.includes(levelIndex)) {
      return false; // Not unlocked
    }
    this.currentLevelIndex = levelIndex;
    this.reset();
    return true;
  }

  /**
   * Get the base map grid (elevation + tile types before placements).
   * Uses effectiveLevelDef so custom/admin grids are reflected correctly.
   */
  getElevationGrid() {
    if (!this._elevationGrid) {
      const tempSim = new Simulation(this.config, this.effectiveLevelDef);
      this._elevationGrid = tempSim.grid;
    }
    return this._elevationGrid;
  }

  /**
   * Get the current grid state for rendering (if in storm phase).
   */
  getGridState() {
    if (!this.simulation) return null;
    return this.simulation.getGridState();
  }

  /**
   * Get current metrics (if in storm phase).
   */
  getCurrentMetrics() {
    if (!this.simulation) return null;
    return this.simulation.getCurrentMetrics();
  }

  /**
   * Get final metrics (if in results phase).
   */
  getFinalMetrics() {
    if (!this.simulation) return null;
    return this.simulation.getFinalMetrics();
  }

  getLostHouseCells() {
    if (!this.simulation) return [];
    return this.simulation.getLostHouseCells();
  }

  /**
   * Is storm in progress?
   */
  isStormActive() {
    return this.phase === 'storm';
  }

  /**
   * Run the level's referenceSolution on a fresh simulation (does NOT touch
   * the player's grid or score). Returns { metrics, spent } so the Results
   * screen can show a side-by-side comparison.  Result is cached per level.
   */
  runReferenceSolution() {
    if (this._refSolResult) return this._refSolResult;

    const ld  = this.effectiveLevelDef;
    const sol = ld.referenceSolution || this.levelDef.referenceSolution;
    if (!sol || sol.length === 0) return null;

    const sim = new Simulation(this.config, ld);
    sim.enableReplayRecording();

    // Track occupied cells so we don't double-count skipped placements
    const occupied = new Set();
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++)
        if (sim.getCell(x, y).type !== 'grass') occupied.add(`${x},${y}`);

    let spent = 0;
    for (const pl of sol) {
      const key = `${pl.x},${pl.y}`;
      if (occupied.has(key)) continue;
      const td = this.config.TILES[pl.type];
      if (!td || !td.placeable) continue;
      sim.setCell(pl.x, pl.y, pl.type);
      occupied.add(key);
      spent += td.cost;
    }

    while (!sim.isComplete()) sim.tick();

    this._refSolResult = { metrics: sim.getFinalMetrics(), spent, frames: sim.getReplayFrames() };
    return this._refSolResult;
  }

  // ── Adaptive Difficulty (Feature 3) ─────────────────────────────────────────

  _getPerformanceHistory() {
    try { return JSON.parse(localStorage.getItem('fdPerfHistory') || '[]'); } catch(e) { return []; }
  }

  _applyAdaptiveDifficulty() {
    const history = this._getPerformanceHistory();
    if (history.length < 2) return;
    const recent = history.slice(-2);
    const all3Stars = recent.every(h => h.stars === 3 && h.passed);
    const allFailed = recent.every(h => !h.passed);

    if (all3Stars && this.effectiveLevelDef) {
      this.effectiveLevelDef = Object.assign({}, this.effectiveLevelDef, {
        rainRate:    this.effectiveLevelDef.rainRate    * 1.12,
        riverInflow: this.effectiveLevelDef.riverInflow * 1.12,
      });
      this._adaptiveBoosted = true;
    }
    this._suggestEasy = allFailed && (this.config.DIFFICULTY.current !== 'easy');
  }

  _savePerformanceHistory() {
    const history = this._getPerformanceHistory();
    history.push({ levelIndex: this.currentLevelIndex, stars: this.stars, passed: this.passed });
    if (history.length > 10) history.splice(0, history.length - 10);
    try { localStorage.setItem('fdPerfHistory', JSON.stringify(history)); } catch(e) {}
  }

  // ── Badges (Feature 9) ───────────────────────────────────────────────────────

  _getBadgeStore() {
    try { return JSON.parse(localStorage.getItem('fdBadges') || '{}'); } catch(e) { return {}; }
  }

  _evaluateBadges(metrics) {
    if (!this.passed || !metrics) return;
    const store = this._getBadgeStore();

    // Budget Wizard: pass with ≥40% budget remaining
    const budgetPct = this.effectiveLevelDef.budget > 0
      ? this.budgetRemaining / this.effectiveLevelDef.budget : 0;
    if (budgetPct >= 0.40) store.budgetWizard = true;

    // River Guardian: pass with avg river health ≥90
    if (metrics.avgRiverHealth >= 90) store.riverGuardian = true;

    // Ecologist: pass using only green tiles — track across levels
    const greenSet = new Set(this.config.SYNERGY_TILES || ['tree','wetland','raingarden','pond']);
    const onlyGreen = Object.values(this.placements).every(t => greenSet.has(t));
    if (onlyGreen) {
      if (!store.ecologistLevels) store.ecologistLevels = [];
      if (!store.ecologistLevels.includes(this.currentLevelIndex))
        store.ecologistLevels.push(this.currentLevelIndex);
      if (store.ecologistLevels.length >= 3) store.ecologist = true;
    }

    this._badgeData = store;
    try { localStorage.setItem('fdBadges', JSON.stringify(store)); } catch(e) {}
  }

  getBadgeData() {
    if (!this._badgeData) this._badgeData = this._getBadgeStore();
    return this._badgeData;
  }

  // ── Storm Preview (Feature 1) ─────────────────────────────────────────────────

  computeStormPreview(ticks = 20) {
    const tempSim = new Simulation(this.config, this.effectiveLevelDef);
    for (const [key, tileType] of Object.entries(this.placements)) {
      const [x, y] = key.split(',').map(Number);
      tempSim.setCell(x, y, tileType);
    }
    for (let i = 0; i < ticks; i++) tempSim.tick();
    return tempSim.getGridState();
  }

  /**
   * Debugging: dump placements to console.
   */
  debugPlacements() {
    console.log('Placements:', this.placements);
    console.log('Budget remaining:', this.budgetRemaining);
    console.log('Maintenance cost:', this.maintenanceCost);
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Game;
}
