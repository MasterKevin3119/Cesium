/**
 * FLOOD DEFENDER - Game Configuration
 * 
 * All tunable constants live here. Modify these to balance difficulty, test scenarios,
 * or adjust educational messaging without touching game logic.
 */

const CONFIG = {
  // ============================================================================
  // GRID AND CANVAS
  // ============================================================================
  GRID_WIDTH: 32,
  GRID_HEIGHT: 32,
  CELL_SIZE: 20, // pixels per cell
  CANVAS_WIDTH: 32 * 20,
  CANVAS_HEIGHT: 32 * 20,

  // ============================================================================
  // TILE DEFINITIONS
  // Each tile defines behaviour: cost, maintenance, absorption, flow blocking, etc.
  // ============================================================================
  TILES: {
    grass: {
      name: 'Grass',
      placeable: false,
      cost: 0,
      maintenance: 0,
      absorbCapacity: 5,
      absorbRate: 0.3,
      blocksFlow: false,
      damageValue: 0,
      color: '#7cb342',
      tooltip: 'Default terrain. Absorbs some water, but not much.'
    },
    river: {
      name: 'River (Source)',
      placeable: false,
      cost: 0,
      maintenance: 0,
      absorbCapacity: 0,
      absorbRate: 0,
      blocksFlow: false,
      damageValue: 0,
      color: '#1976d2',
      tooltip: 'Natural river. Generates inflow during storm. Can overflow and flood nearby terrain.'
    },
    tree: {
      name: 'Tree',
      placeable: true,
      cost: 40,
      maintenance: 5,
      absorbCapacity: 30,
      absorbRate: 0.8,
      blocksFlow: false,
      damageValue: 0,
      color: '#2e7d32',
      tooltip: 'Urban forest. High absorption. Improves happiness & river health. Dies if deeply flooded for too long.'
    },
    wetland: {
      name: 'Wetland',
      placeable: true,
      cost: 60,
      maintenance: 8,
      absorbCapacity: 50,
      absorbRate: 1.2,
      blocksFlow: false,
      damageValue: 0,
      color: '#00838f',
      tooltip: 'Natural sponge. Highest absorption capacity. Excellent river buffer. Can overflow if storm is extreme.'
    },
    pond: {
      name: 'Retention Pond',
      placeable: true,
      cost: 120,
      maintenance: 15,
      absorbCapacity: 200,
      absorbRate: 1.5,
      blocksFlow: false,
      damageValue: 0,
      color: '#0277bd',
      tooltip: 'Large water storage. Huge capacity. Doesn\'t help if it fills up. Great for peak rain events.'
    },
    levee: {
      name: 'Levee / Dam',
      placeable: true,
      cost: 90,
      maintenance: 12,
      absorbCapacity: 0,
      absorbRate: 0,
      blocksFlow: true,
      damageValue: 0,
      color: '#5d4037',
      tooltip: 'Blocks water flow. Can be overtopped if water exceeds its height. Trade-off: protects behind but floods before.'
    },
    permeable: {
      name: 'Permeable Pavement',
      placeable: true,
      cost: 70,
      maintenance: 10,
      absorbCapacity: 20,
      absorbRate: 0.6,
      blocksFlow: false,
      damageValue: 0,
      color: '#a1887f',
      tooltip: 'Walkable surface that absorbs water. "Grey vs green" lesson: sustainable alternative to impermeable roads.'
    },
    road: {
      name: 'Road',
      placeable: true,
      cost: 30,
      maintenance: 3,
      absorbCapacity: 0,
      absorbRate: 0,
      blocksFlow: false,
      damageValue: 1, // low damage if flooded (can pass through)
      color: '#424242',
      tooltip: 'Impermeable surface. Speeds runoff. Low damage value, but contributes to flooding downstream.'
    },
    house: {
      name: 'House',
      placeable: false,
      cost: 0,
      maintenance: 0,
      absorbCapacity: 0,
      absorbRate: 0,
      blocksFlow: false,
      damageValue: 100, // HIGH value; protecting houses is the primary goal
      color: '#d32f2f',
      tooltip: 'The main thing to protect! High damage if flooded. Happiness rises with trees nearby.'
    }
  },

  // ============================================================================
  // WATER SIMULATION PARAMETERS
  // ============================================================================
  SIM: {
    stormDurationTicks: 60,
    floodThreshold: 0.5, // water depth above this causes damage
    leveHeight: 1.5, // elevation threshold for levee overtopping
    treeDeathThreshold: 3.0, // tree dies if submerged to this depth for too long
    treeDeathDuration: 15, // ticks of deep submersion before tree dies
    
    // Derived from level (see LEVELS below)
    rainRate: 0.2,
    riverInflow: 0.5,
  },

  // ============================================================================
  // SCORING WEIGHTS
  // Final score is a weighted combination of these factors.
  // ============================================================================
  SCORING: {
    propertyProtectionWeight: 0.5,    // damage avoided
    budgetEfficiencyWeight: 0.3,      // money left over
    ecologicalHealthWeight: 0.2,      // average of happiness, tree health, river health
    
    // Star thresholds (as fraction of max possible score)
    star1Threshold: 0.5,  // 1 star
    star2Threshold: 0.75, // 2 stars
    star3Threshold: 0.9,  // 3 stars
  },

  // ============================================================================
  // GAME PARAMETERS (per-level tuning)
  // ============================================================================
  LEVELS: [
    {
      id: 'level1',
      name: 'Tutorial: Small Storm',
      description: 'A gentle rain. Get familiar with the basics.',
      briefing: 'Your town faces a small storm. Heavy rain is expected. Use trees and ponds to absorb water and protect houses. Budget is generous!',
      
      // Map generation
      gridSeed: 42, // for reproducible maps
      numHouses: 8,
      numRiverCells: 4,
      riverStartPos: { x: 16, y: 0 }, // top center
      
      // Storm & budget
      budget: 800,
      rainRate: 0.15,
      riverInflow: 0.2,
      rainRampUp: 10,    // ticks to reach peak
      rainPeak: 20,      // ticks at peak
      rainRampDown: 30,  // ticks to taper
      
      damageCapForPass: 50,
      
      // Unlocks
      availableTiles: ['tree', 'pond'],
      showTutorialHints: true,
    },
    {
      id: 'level2',
      name: 'Level 2: Growing Storm',
      description: 'A bigger downpour. New tools unlocked!',
      briefing: 'Rainfall is increasing. You now have levees and permeable pavement. Strategic placement is key!',
      
      gridSeed: 51,
      numHouses: 10,
      numRiverCells: 5,
      riverStartPos: { x: 16, y: 0 },
      
      budget: 900,
      rainRate: 0.25,
      riverInflow: 0.35,
      rainRampUp: 8,
      rainPeak: 25,
      rainRampDown: 27,
      
      damageCapForPass: 60,
      
      availableTiles: ['tree', 'pond', 'levee', 'permeable'],
      showTutorialHints: false,
    },
    {
      id: 'level3',
      name: 'Level 3: Flood Risk',
      description: 'A serious storm. Wetlands become critical.',
      briefing: 'This is a major event. Wetlands offer the best natural absorption. Budget is tighter. Maintenance costs matter now.',
      
      gridSeed: 63,
      numHouses: 12,
      numRiverCells: 6,
      riverStartPos: { x: 16, y: 0 },
      
      budget: 950,
      rainRate: 0.35,
      riverInflow: 0.5,
      rainRampUp: 7,
      rainPeak: 30,
      rainRampDown: 23,
      
      damageCapForPass: 80,
      
      availableTiles: ['tree', 'pond', 'levee', 'permeable', 'wetland'],
      showTutorialHints: false,
    },
    {
      id: 'level4',
      name: 'Level 4: Extreme Weather',
      description: 'All tools available. Can you handle it?',
      briefing: 'A once-in-a-century storm. All green & grey infrastructure is at your disposal. Every dollar counts.',
      
      gridSeed: 73,
      numHouses: 14,
      numRiverCells: 7,
      riverStartPos: { x: 16, y: 0 },
      
      budget: 1200,
      rainRate: 0.45,
      riverInflow: 0.65,
      rainRampUp: 5,
      rainPeak: 35,
      rainRampDown: 20,
      
      damageCapForPass: 100,
      
      availableTiles: ['tree', 'pond', 'levee', 'permeable', 'wetland', 'road'],
      showTutorialHints: false,
    }
  ],

  // ============================================================================
  // UI / DISPLAY CONSTANTS
  // ============================================================================
  WATER_OPACITY_SCALE: 0.15, // how much water depth increases overlay alpha
  ELEVATION_SHADE_INTENSITY: 0.05, // subtle elevation shading

  // Tile palette toolbar
  PALETTE_CELL_SIZE: 50,
  PALETTE_PADDING: 10,

  // Parameter meter styling
  METER_WIDTH: 200,
  METER_HEIGHT: 20,

  // ============================================================================
  // EDUCATIONAL MESSAGES
  // ============================================================================
  LESSONS: {
    propertyProtection: "Green infrastructure protects property by reducing and slowing floodwaters.",
    treeHealth: "Trees absorb water and stabilize soil. But they drown if flooded too deep!",
    riverHealth: "A healthy river is buffered by natural features (trees, wetlands). Direct paved runoff stresses the river.",
    budgetEfficiency: "Smart planning maximizes protection with minimal cost. Maintenance compounds—maintain what you really need.",
    leveleTrade: "Levees protect behind but concentrate water ahead. Use them strategically!",
  },
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
