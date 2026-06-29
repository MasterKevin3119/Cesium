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
    this.tickCount = 0;
    this.rainRate = levelDef.rainRate;
    this.riverInflow = levelDef.riverInflow;

    // House-loss tracking (core metric)
    this._lossThreshold = config.SIM.houseLossDepth / config.SIM.metersPerUnit; // 0.5 sim units
    this.lostHouseKeys = new Set();   // "x,y" keys of houses that ever exceeded threshold
    this.houseCount = 0;              // counted during generateMap

    // Accumulated metrics
    this.totalHappiness = 0;
    this.totalTreeHealth = 0;
    this.totalRiverHealth = 0;
    this.treeCount = 0;
    this.riverCellCount = 0;

    // Transient tracking
    this.currentHappiness = 0;
    this.currentTreeHealth = 100;
    this.currentRiverHealth = 100;

    // Replay recording (null = disabled, array = recording)
    this._replayFrames = null;

    // Hydrology log (null = disabled)
    this._hydrologyLog = null;
  }

  enableReplayRecording() {
    this._replayFrames = [];
  }

  getReplayFrames() {
    return this._replayFrames || [];
  }

  enableHydrologyLog() {
    this._hydrologyLog = [];
  }

  getHydrologyLog() {
    return this._hydrologyLog || [];
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
    this.grid = this.createEmptyGrid();
    this.treeCount = 0;
    this.riverCellCount = 0;
    this.houseCount = 0;

    // Admin-designed or level-supplied custom grid takes priority
    if (this.levelDef.customGrid) {
      this._loadCustomGrid(this.levelDef.customGrid);
      return;
    }

    // Seeded procedural generation
    const seed = this.levelDef.gridSeed;
    const rng = this.seededRandom(seed);

    const { x: riverX, y: riverY } = this.levelDef.riverStartPos;
    for (let i = 0; i < this.levelDef.numRiverCells; i++) {
      const y = riverY + i;
      if (y < this.height) {
        this.grid[y][riverX].type = 'river';
        this.riverCellCount++;
      }
    }

    let housesPlaced = 0;
    while (housesPlaced < this.levelDef.numHouses) {
      const x = Math.floor(rng() * this.width);
      const y = Math.floor(rng() * this.height);
      const cell = this.grid[y][x];
      if (cell.type === 'grass') {
        cell.type = 'house';
        this.houseCount++;
        housesPlaced++;
      }
    }

    // River channel sits at elevation 0; surrounding terrain slopes up with
    // distance from the river so water naturally drains toward the channel.
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].type === 'river') {
          this.grid[y][x].elevation = 0;
          continue;
        }
        const dist = Math.abs(x - riverX);
        const slope = dist >= 10 ? 2 : dist >= 5 ? 1 : 0;
        this.grid[y][x].elevation = Math.min(2, slope + Math.floor(rng() * 2));
      }
    }
  }

  _loadCustomGrid(cells) {
    for (const c of cells) {
      if (c.x >= 0 && c.x < this.width && c.y >= 0 && c.y < this.height) {
        this.grid[c.y][c.x].type      = c.type      || 'grass';
        this.grid[c.y][c.x].elevation = c.elevation !== undefined ? c.elevation : 1;
        if (c.type === 'river') this.riverCellCount++;
        if (c.type === 'house') this.houseCount++;
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
    this.tickCount++;

    // Compute rain rate for this tick (ramp up, peak, ramp down)
    const rampUpEnd = this.levelDef.rainRampUp;
    const peakEnd = rampUpEnd + this.levelDef.rainPeak;
    const peakRamp = peakEnd + this.levelDef.rainRampDown;

    let rainFactor = 1.0;
    if (this.tickCount <= rampUpEnd) {
      rainFactor = this.tickCount / rampUpEnd;
    } else if (this.tickCount <= peakEnd) {
      rainFactor = 1.0;
    } else if (this.tickCount <= peakRamp) {
      rainFactor = 1.0 - ((this.tickCount - peakEnd) / this.levelDef.rainRampDown);
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

    // Step 5: House-loss check
    this.computeHouseLoss();

    // Update live parameters
    this.updateLiveParameters();

    // Record replay frame (water depths only, compact)
    if (this._replayFrames !== null) {
      const W = this.width, H = this.height;
      const frame = new Float32Array(W * H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          frame[y * W + x] = this.grid[y][x].water;
      this._replayFrames.push(frame);
    }

    // Record hydrology log entry (rainfall rate + max house water depth per tick)
    if (this._hydrologyLog !== null) {
      let maxHouseWater = 0;
      for (let y = 0; y < this.height; y++)
        for (let x = 0; x < this.width; x++)
          if (this.grid[y][x].type === 'house' && this.grid[y][x].water > maxHouseWater)
            maxHouseWater = this.grid[y][x].water;
      this._hydrologyLog.push({ tick: this.tickCount, rainRate: currentRainRate, maxHouseWater });
    }
  }

  absorb(x, y) {
    const cell = this.grid[y][x];
    const tileDef = this.config.TILES[cell.type];

    if (tileDef.absorbCapacity === 0) return;

    // Tile synergy: green tiles adjacent to 2+ other green tiles absorb 20% more
    const synergySet = this.config.SYNERGY_TILES;
    let synergyNeighbours = 0;
    if (synergySet && synergySet.includes(cell.type)) {
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
          if (synergySet.includes(this.grid[ny][nx].type)) synergyNeighbours++;
        }
      }
    }
    const synergyMult = synergyNeighbours >= 2 ? 1.2 : 1.0;

    const canAbsorb = Math.min(
      tileDef.absorbRate * synergyMult,
      tileDef.absorbCapacity - cell.absorbed,
      cell.water
    );

    cell.water -= canAbsorb;
    cell.absorbed += canAbsorb;
  }

  flow(x, y) {
    const cell = this.grid[y][x];
    const waterIn = cell.water; // read-only snapshot — never mutate this.grid during flow

    // Even negligible water must be forwarded so nextGrid is complete (mass conserved)
    if (waterIn <= 0.01) {
      this.nextGrid[y][x].water += waterIn;
      return;
    }

    const head = cell.elevation + waterIn;
    const offsets = [
      { dx:  0, dy: -1 }, // up
      { dx:  0, dy:  1 }, // down
      { dx: -1, dy:  0 }, // left
      { dx:  1, dy:  0 }, // right
    ];

    let totalDesired = 0;
    const flowList = [];

    for (const { dx, dy } of offsets) {
      const nx = x + dx;
      const ny = y + dy;

      // ── Boundary exits ──────────────────────────────────────────────────────
      // Top edge is the river entry point — no drain there.
      // All other edges act as open outfalls (virtual sea level: elev 0, water 0).
      if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
        if (ny < 0) continue; // top edge: sealed
        // head of virtual outfall cell = 0; flow toward it if head > 0
        const desired = Math.min(waterIn * 0.5, head * 0.3);
        if (desired > 0) { flowList.push({ nx: -1, ny: -1, desired }); totalDesired += desired; }
        continue;
      }

      const neighbor = this.grid[ny][nx];
      const neighborHead = neighbor.elevation + neighbor.water;

      if (this.isLeveeBetween(x, y, nx, ny)) continue;
      if (neighborHead >= head) continue;

      const desired = Math.min(waterIn * 0.5, (head - neighborHead) * 0.3);
      if (desired > 0) { flowList.push({ nx, ny, desired }); totalDesired += desired; }
    }

    // ── Proportional scaling ─────────────────────────────────────────────────
    // If the sum of all desired outflows exceeds available water, scale every
    // outflow down by the same factor so no water is created.
    const scale = totalDesired > waterIn ? waterIn / totalDesired : 1.0;
    let totalSent = 0;

    for (const f of flowList) {
      const amt = f.desired * scale;
      totalSent += amt;
      if (f.nx >= 0) this.nextGrid[f.ny][f.nx].water += amt;
      // nx === -1: water exits the map through a boundary — intentional drain
    }

    // Remaining water stays on this cell
    this.nextGrid[y][x].water += waterIn - totalSent;
  }

  isLeveeBetween(x, y, nx, ny) {
    const cell     = this.grid[y][x];
    const neighbor = this.grid[ny][nx];
    const crestDepth = this.config.SIM.leveHeight; // water DEPTH needed to overtop (not absolute head)

    // A levee on the destination side blocks inflow unless source water is deep enough to overtop.
    if (neighbor.type === 'levee') return cell.water <= crestDepth;
    // A levee on the source side blocks outflow until water depth exceeds the crest.
    if (cell.type     === 'levee') return cell.water <= crestDepth;
    return false;
  }

  computeHouseLoss() {
    const threshold = this._lossThreshold;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.grid[y][x];

        // Mark house as lost the moment water exceeds threshold (stays lost)
        if (cell.type === 'house' && cell.water > threshold) {
          this.lostHouseKeys.add(`${x},${y}`);
        }

        // Trees die if deeply submerged for too long
        if (cell.type === 'tree') {
          if (cell.water > this.config.SIM.treeDeathThreshold) {
            cell.treeFloodDuration++;
            if (cell.treeFloodDuration > this.config.SIM.treeDeathDuration) {
              cell.type = 'grass';
              cell.absorbed = 0;
            }
          } else {
            cell.treeFloodDuration = 0;
          }
        }
      }
    }
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
          happinessSum += Math.min(nearbyTrees * 10, 100);
          if (cell.water > this._lossThreshold) {
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

    // Average parameters (use live houseCount so custom grids work correctly)
    this.currentHappiness = happinessSum / Math.max(1, this.houseCount || this.levelDef.numHouses);
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
    const tickCount = this.tickCount;
    const lostHouseCells = Array.from(this.lostHouseKeys).map(k => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
    return {
      housesLost:     this.lostHouseKeys.size,
      totalHouses:    this.houseCount || this.levelDef.numHouses,
      lostHouseCells,
      avgHappiness:  this.totalHappiness / Math.max(1, tickCount),
      avgTreeHealth: this.totalTreeHealth / Math.max(1, tickCount),
      avgRiverHealth: this.totalRiverHealth / Math.max(1, tickCount),
    };
  }

  getLostHouseCells() {
    return Array.from(this.lostHouseKeys).map(k => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
  }

  getCurrentMetrics() {
    return {
      housesLost:  this.lostHouseKeys.size,
      totalHouses: this.houseCount || this.levelDef.numHouses,
      happiness:   Math.round(this.currentHappiness),
      treeHealth:  Math.round(this.currentTreeHealth),
      riverHealth: Math.round(this.currentRiverHealth),
    };
  }

  isComplete() {
    return this.tickCount >= this.config.SIM.stormDurationTicks;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Simulation;
}
