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
    
    // Budget & placement
    this.budgetRemaining = levelDef.budget;
    this.maintenanceCost = 0;
    this.placements = {}; // { "x,y": tileType }

    // Simulation
    this.simulation = null;

    // Phase tracking
    this.phase = 'briefing'; // 'briefing' | 'build' | 'storm' | 'results'
    this.score = 0;
    this.stars = 0;
    this.passed = false;
  }

  getCurrentLevel() {
    return this.config.LEVELS[this.currentLevelIndex];
  }

  getAvailableTiles() {
    return this.levelDef.availableTiles || [];
  }

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
    // Create simulation
    this.simulation = new Simulation(this.config, this.levelDef);

    // Apply placements to grid
    for (const [key, tileType] of Object.entries(this.placements)) {
      const [x, y] = key.split(',').map(Number);
      this.simulation.setCell(x, y, tileType);
    }

    this.phase = 'storm';
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
    const metrics = this.simulation.getFinalMetrics();
    const levelDef = this.levelDef;

    // Reference damage: no green infrastructure (only grass & houses)
    const maxDamage = levelDef.numHouses * 100 * (this.config.SIM.stormDurationTicks / 10);
    const damageAvoided = Math.max(0, maxDamage - metrics.totalDamage);
    const propertyScore = Math.min(1, damageAvoided / maxDamage);

    // Budget efficiency
    const budgetUsed = levelDef.budget - this.budgetRemaining;
    const budgetScore = this.budgetRemaining / levelDef.budget;

    // Ecological health (average of three metrics)
    const ecoScore = (
      (metrics.avgHappiness / 100) +
      (metrics.avgTreeHealth / 100) +
      (metrics.avgRiverHealth / 100)
    ) / 3;

    // Weighted sum
    const weights = this.config.SCORING;
    const normalizedScore =
      propertyScore * weights.propertyProtectionWeight +
      budgetScore * weights.budgetEfficiencyWeight +
      ecoScore * weights.ecologicalHealthWeight;

    this.score = Math.round(normalizedScore * 100);

    // Star rating
    if (normalizedScore >= weights.star3Threshold) {
      this.stars = 3;
    } else if (normalizedScore >= weights.star2Threshold) {
      this.stars = 2;
    } else if (normalizedScore >= weights.star1Threshold) {
      this.stars = 1;
    } else {
      this.stars = 0;
    }

    // Pass condition: damage under cap AND stayed within budget
    const passedDamage = metrics.totalDamage <= levelDef.damageCapForPass;
    const passedBudget = this.budgetRemaining >= 0;
    this.passed = passedDamage && passedBudget;

    // Unlock next level on pass
    if (this.passed && this.currentLevelIndex + 1 < this.config.LEVELS.length) {
      if (!this.unlockedLevels.includes(this.currentLevelIndex + 1)) {
        this.unlockedLevels.push(this.currentLevelIndex + 1);
      }
    }
  }

  /**
   * Move to next level (only if passed).
   */
  nextLevel() {
    if (!this.passed) return false;
    if (this.currentLevelIndex + 1 >= this.config.LEVELS.length) {
      return false; // No more levels
    }
    this.currentLevelIndex++;
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

  /**
   * Is storm in progress?
   */
  isStormActive() {
    return this.phase === 'storm';
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
