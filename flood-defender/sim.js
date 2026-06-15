/**
 * FLOOD DEFENDER - Water Simulation Engine
 * 
 * Core physics and parameters. No DOM access here—purely data and logic.
 * Manages grid state, runs the simulation loop, tracks ecological/damage metrics.
 */

class Simulation {
  constructor(config, levelDef) {
    this.config = config;
    this.levelDef = levelDef;

    // Grid dimensions
    this.width = config.GRID_WIDTH;
    this.height = config.GRID_HEIGHT;

    // Initialize double-buffered grids
    this.grid = this.createEmptyGrid();
    this.nextGrid = this.createEmptyGrid();

    // Generate the map for this level
    this.generateMap();

    // Simulation state
    this.tick = 0;
    this.rainRate = levelDef.rainRate;
    this.riverInflow = levelDef.riverInflow;

    // Accumulated metrics
    this.totalDamage = 0;
    this.totalHappiness = 0;
    this.totalTreeHealth = 0; // 0–100 per tree; average over time
    this.totalRiverHealth = 0;
    this.treeCount = 0;
    this.riverCellCount = 0;

    // Transient tracking
    this.currentHappiness = 0;
    this.currentTreeHealth = 100;
    this.currentRiverHealth = 100;
  }

  createEmptyGrid() {
    const grid = [];
    for (let y = 0; y < this.height; y++) {
      const row = [];
      for (let x = 0; x < this.width; x++) {
        row.push({
          type: 'grass',
          elevation: 0,
          water: 0,
          absorbed: 0,
          treeFloodDuration: 0 // tracks how long a tree has been deeply submerged
        });
      }
      grid.push(row);
    }
    return grid;
  }

  getCell(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.grid[y][x];
  }

  setCell(x, y, type) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.grid[y][x].type = type;
    // Reset state when tile type changes
    this.grid[y][x].water = 0;
    this.grid[y][x].absorbed = 0;
    this.grid[y][x].treeFloodDuration = 0;
  }

  generateMap() {
    // Simple seeded random for reproducibility
    const seed = this.levelDef.gridSeed;
    const rng = this.seededRandom(seed);

    // Clear map
    this.grid = this.createEmptyGrid();
    this.treeCount = 0;
    this.riverCellCount = 0;

    // Place river
    const { x: riverX, y: riverY } = this.levelDef.riverStartPos;
    for (let i = 0; i < this.levelDef.numRiverCells; i++) {
      const y = riverY + i;
      if (y < this.height) {
        this.grid[y][riverX].type = 'river';
        this.riverCellCount++;
      }
    }

    // Place houses randomly (but not on river)
    let housesPlaced = 0;
    while (housesPlaced < this.levelDef.numHouses) {
      const x = Math.floor(rng() * this.width);
      const y = Math.floor(rng() * this.height);
      const cell = this.grid[y][x];
      if (cell.type === 'grass') {
        cell.type = 'house';
        housesPlaced++;
      }
    }

    // Vary elevation slightly for visual interest (but keep it subtle)
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.grid[y][x].elevation = Math.floor(rng() * 3); // 0–2
      }
    }
  }

  // Simple seeded random for reproducibility
  seededRandom(seed) {
    return () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  /**
   * Run one tick of the simulation.
   * Order matters: rainfall → river inflow → absorption → flow → damage.
   */
  tick() {
    this.tick++;

    // Compute rain rate for this tick (ramp up, peak, ramp down)
    const rampUpEnd = this.levelDef.rainRampUp;
    const peakEnd = rampUpEnd + this.levelDef.rainPeak;
    const peakRamp = peakEnd + this.levelDef.rainRampDown;

    let rainFactor = 1.0;
    if (this.tick <= rampUpEnd) {
      rainFactor = this.tick / rampUpEnd;
    } else if (this.tick <= peakEnd) {
      rainFactor = 1.0;
    } else if (this.tick <= peakRamp) {
      rainFactor = 1.0 - ((this.tick - peakEnd) / this.levelDef.rainRampDown);
    } else {
      rainFactor = 0;
    }

    const currentRainRate = this.rainRate * rainFactor;

    // Step 1: Rainfall
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.grid[y][x].water += currentRainRate;
      }
    }

    // Step 2: River inflow
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].type === 'river') {
          this.grid[y][x].water += this.riverInflow;
        }
      }
    }

    // Step 3: Absorption
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.absorb(x, y);
      }
    }

    // Step 4: Flow (prepare next grid, then swap)
    this.nextGrid = this.createEmptyGrid();
    // Copy tile types and elevations to nextGrid
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.nextGrid[y][x].type = this.grid[y][x].type;
        this.nextGrid[y][x].elevation = this.grid[y][x].elevation;
        this.nextGrid[y][x].absorbed = this.grid[y][x].absorbed;
      }
    }
    // Compute flow into nextGrid
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.flow(x, y);
      }
    }
    // Swap grids
    [this.grid, this.nextGrid] = [this.nextGrid, this.grid];

    // Step 5: Damage
    this.computeDamage();

    // Update live parameters
    this.updateLiveParameters();
  }

  absorb(x, y) {
    const cell = this.grid[y][x];
    const tileDef = this.config.TILES[cell.type];

    if (tileDef.absorbCapacity === 0) return; // Can't absorb

    const canAbsorb = Math.min(
      tileDef.absorbRate,
      tileDef.absorbCapacity - cell.absorbed,
      cell.water
    );

    cell.water -= canAbsorb;
    cell.absorbed += canAbsorb;
  }

  flow(x, y) {
    const cell = this.grid[y][x];
    if (cell.water <= 0.01) return; // Negligible water, don't flow

    const head = cell.elevation + cell.water;

    // Orthogonal neighbors: [up, down, left, right]
    const neighbors = [
      { dx: 0, dy: -1 }, // up
      { dx: 0, dy: 1 },  // down
      { dx: -1, dy: 0 }, // left
      { dx: 1, dy: 0 }   // right
    ];

    for (const { dx, dy } of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;

      const neighbor = this.grid[ny][nx];
      const neighborHead = neighbor.elevation + neighbor.water;

      // Check if a levee blocks flow
      if (this.isLeveeBetween(x, y, nx, ny, head)) {
        continue; // Levee blocks unless overtopped
      }

      // Only flow to lower head
      if (neighborHead >= head) continue;

      const headDiff = head - neighborHead;
      // Flow proportional to head difference, but capped to avoid overshoot
      const flowAmount = Math.min(cell.water * 0.5, headDiff * 0.3);

      cell.water -= flowAmount;
      this.nextGrid[ny][nx].water += flowAmount;
    }

    // Copy remaining water to nextGrid
    this.nextGrid[y][x].water += cell.water;
  }

  isLeveeBetween(x, y, nx, ny, waterHead) {
    // Check if a levee on either side of the edge blocks flow
    const cell = this.grid[y][x];
    const neighbor = this.grid[ny][nx];

    // If either cell is a levee, check overtopping
    const leveeHeight = this.config.SIM.leveHeight;
    if (cell.type === 'levee') {
      if (waterHead <= leveeHeight) return true; // Levee blocks
    }
    if (neighbor.type === 'levee') {
      const neighborHead = neighbor.elevation + neighbor.water;
      if (neighborHead <= leveeHeight) return true;
    }

    return false;
  }

  computeDamage() {
    let tickDamage = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.grid[y][x];
        const tileDef = this.config.TILES[cell.type];

        // Only damageable tiles suffer
        if (tileDef.damageValue === 0) continue;

        if (cell.water > this.config.SIM.floodThreshold) {
          const floodDepth = cell.water - this.config.SIM.floodThreshold;
          const damage = floodDepth * tileDef.damageValue;
          tickDamage += damage;
        }

        // Trees die if deeply submerged for too long
        if (cell.type === 'tree') {
          if (cell.water > this.config.SIM.treeDeathThreshold) {
            cell.treeFloodDuration++;
            if (cell.treeFloodDuration > this.config.SIM.treeDeathDuration) {
              // Tree dies, becomes grass
              cell.type = 'grass';
              cell.absorbed = 0;
              cell.water = 0; // don't retain absorbed water
            }
          } else {
            cell.treeFloodDuration = 0; // Reset timer if water recedes
          }
        }
      }
    }
    this.totalDamage += tickDamage;
  }

  updateLiveParameters() {
    // Recalculate happiness, tree health, river health each tick
    let happinessSum = 0;
    let treeHealthSum = 0;
    let treeCount = 0;
    let riverHealthSum = 0;
    let riverCellsNearNature = 0;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.grid[y][x];

        // Happiness: houses gain happiness if trees nearby
        if (cell.type === 'house') {
          let nearbyTrees = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                if (this.grid[ny][nx].type === 'tree') nearbyTrees++;
              }
            }
          }
          happinessSum += Math.min(nearbyTrees * 10, 100); // Cap at 100
          // Lose happiness if flooded
          if (cell.water > this.config.SIM.floodThreshold) {
            happinessSum = Math.max(0, happinessSum - cell.water * 20);
          }
        }

        // Tree health: health degrades if flooded or if no nearby water (need moderate water)
        if (cell.type === 'tree') {
          let health = 100;
          treeCount++;
          // Penalty for deep flooding
          if (cell.water > this.config.SIM.treeDeathThreshold) {
            health -= Math.min(50, cell.water * 10);
          } else if (cell.water < 0.5) {
            health -= 10; // Needs some moisture
          }
          treeHealthSum += Math.max(0, health);
        }

        // River health: improves with adjacent nature, worsens with paved runoff
        if (cell.type === 'river') {
          let health = 100;
          // Check adjacent cells for green infrastructure
          let naturalBuffer = 0;
          let pavedRunoff = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                const t = this.grid[ny][nx].type;
                if (t === 'tree' || t === 'wetland') naturalBuffer++;
                if (t === 'road') pavedRunoff++;
              }
            }
          }
          health += naturalBuffer * 5;
          health -= pavedRunoff * 10;
          riverHealthSum += Math.max(0, Math.min(100, health));
          riverCellsNearNature++;
        }
      }
    }

    // Average parameters
    this.currentHappiness = happinessSum / Math.max(1, this.levelDef.numHouses);
    this.currentTreeHealth = treeHealthSum / Math.max(1, treeCount);
    this.currentRiverHealth = riverHealthSum / Math.max(1, this.riverCellCount);

    // Accumulate for final averaging
    this.totalHappiness += this.currentHappiness;
    this.totalTreeHealth += this.currentTreeHealth;
    this.totalRiverHealth += this.currentRiverHealth;
  }

  /**
   * Get current state of grid for rendering.
   */
  getGridState() {
    return this.grid;
  }

  /**
   * Get final metrics after storm ends.
   */
  getFinalMetrics() {
    const tickCount = this.tick;
    return {
      totalDamage: this.totalDamage,
      avgHappiness: this.totalHappiness / Math.max(1, tickCount),
      avgTreeHealth: this.totalTreeHealth / Math.max(1, tickCount),
      avgRiverHealth: this.totalRiverHealth / Math.max(1, tickCount),
    };
  }

  getCurrentMetrics() {
    return {
      happiness: Math.round(this.currentHappiness),
      treeHealth: Math.round(this.currentTreeHealth),
      riverHealth: Math.round(this.currentRiverHealth),
      damage: Math.round(this.totalDamage),
    };
  }

  isComplete() {
    return this.tick >= this.config.SIM.stormDurationTicks;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Simulation;
}
