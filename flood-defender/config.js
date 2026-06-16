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
      cost: 0, maintenance: 0,
      absorbCapacity: 5, absorbRate: 0.3,
      blocksFlow: false, damageValue: 0,
      color: '#7cb342',
      image: 'assets/tiles/grass.svg',
      tooltip: 'Default terrain. Absorbs some water, but not much.'
    },
    river: {
      name: 'River (Source)',
      placeable: false,
      cost: 0, maintenance: 0,
      absorbCapacity: 0, absorbRate: 0,
      blocksFlow: false, damageValue: 0,
      color: '#1976d2',
      image: 'assets/tiles/river.svg',
      tooltip: 'Natural river. Generates inflow during storm. Can overflow and flood nearby terrain.'
    },
    tree: {
      name: 'Tree',
      placeable: true,
      cost: 30, maintenance: 4,
      absorbCapacity: 150, absorbRate: 4.0,
      blocksFlow: false, damageValue: 0,
      color: '#2e7d32',
      image: 'assets/tiles/tree.svg',
      tooltip: 'Urban forest. Excellent absorption — soaks up rainfall and draws in water from surrounding ground. Improves happiness & river health.'
    },
    raingarden: {
      name: 'Rain Garden',
      placeable: true,
      cost: 25, maintenance: 3,
      absorbCapacity: 90, absorbRate: 3.0,
      blocksFlow: false, damageValue: 0,
      color: '#8bc34a',
      image: 'assets/tiles/raingarden.svg',
      tooltip: 'A shallow planted dip that catches and soaks up street runoff. Highly effective when placed in low ground beside buildings.'
    },
    wetland: {
      name: 'Wetland',
      placeable: true,
      cost: 50, maintenance: 6,
      absorbCapacity: 250, absorbRate: 6.0,
      blocksFlow: false, damageValue: 0,
      color: '#00838f',
      image: 'assets/tiles/wetland.svg',
      tooltip: 'Wetlands act like a sponge — massive storage and fast absorption. Best placed flanking rivers to absorb overflow before it spreads.'
    },
    pond: {
      name: 'Retention Pond',
      placeable: true,
      cost: 100, maintenance: 12,
      absorbCapacity: 1000, absorbRate: 7.5,
      blocksFlow: false, damageValue: 0,
      color: '#0277bd',
      image: 'assets/tiles/pond.svg',
      tooltip: 'Large engineered water storage. Enormous capacity — absorbs concentrated runoff from a wide catchment area.'
    },
    permeable: {
      name: 'Permeable Paving',
      placeable: true,
      cost: 60, maintenance: 8,
      absorbCapacity: 100, absorbRate: 3.0,
      blocksFlow: false, damageValue: 0,
      color: '#a1887f',
      image: 'assets/tiles/permeable.svg',
      tooltip: 'Looks like a road but lets water soak through instead of running off — grey surface, green function. Good on driveways and paths.'
    },
    levee: {
      name: 'Levee / Dam',
      placeable: true,
      cost: 80, maintenance: 10,
      absorbCapacity: 0, absorbRate: 0,
      blocksFlow: true, damageValue: 0,
      color: '#5d4037',
      image: 'assets/tiles/levee.svg',
      tooltip: 'A barrier that blocks water flow. Powerful, but can be overtopped if the water rises above it.'
    },
    road: {
      name: 'Road',
      placeable: true,
      cost: 30, maintenance: 3,
      absorbCapacity: 0, absorbRate: 0,
      blocksFlow: false, damageValue: 1,
      color: '#424242',
      image: 'assets/tiles/road.svg',
      tooltip: 'Impermeable — water sheets straight off it and speeds up flooding. Use permeable pavement instead where you can.'
    },
    house: {
      name: 'House',
      placeable: false,
      cost: 0, maintenance: 0,
      absorbCapacity: 0, absorbRate: 0,
      blocksFlow: false, damageValue: 100,
      color: '#d32f2f',
      image: 'assets/tiles/house.svg',
      tooltip: 'The main thing to protect! High damage if flooded. Happiness rises with trees nearby.'
    }
  },

  // ============================================================================
  // WATER SIMULATION PARAMETERS
  // ============================================================================
  SIM: {
    stormDurationTicks: 60,
    houseLossDepth: 0.05,  // metres — a house is "lost" the moment water exceeds this
    metersPerUnit: 0.1,    // 1 sim water unit = 0.1 m  →  threshold = 0.05/0.1 = 0.5 sim units
    leveHeight: 1.5,
    treeDeathThreshold: 3.0,
    treeDeathDuration: 15,
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
      budget: 1000,
      rainRate: 0.10,
      riverInflow: 0.15,
      rainRampUp: 10,
      rainPeak: 20,
      rainRampDown: 30,

      maxHousesLost: 0,  // must protect ALL houses to pass tutorial

      // Unlocks
      availableTiles: ['tree', 'raingarden', 'pond'],
      showTutorialHints: true,

      // Model solution — one strong layout for reference after the storm
      solutionExplanation: 'Two principles working together: trees flanking the river reduce overflow at the source, and rain gardens placed at the lowest ground beside each house intercept water before it pools around them. Low-elevation cells act as natural basins — a rain garden there drains the whole basin, protecting the house above. Just six river trees and two drains per house eliminates almost all flood damage.',
      referenceSolution: [
        {x:15,y:0,type:'tree'},{x:17,y:0,type:'tree'},
        {x:15,y:1,type:'tree'},{x:17,y:1,type:'tree'},
        {x:15,y:2,type:'tree'},{x:17,y:2,type:'tree'},
        {x:27,y:26,type:'raingarden'},{x:28,y:25,type:'raingarden'},
        {x:31,y:24,type:'raingarden'},{x:29,y:24,type:'raingarden'},
        {x:17,y:22,type:'raingarden'},{x:18,y:23,type:'raingarden'},
        {x:19,y:0,type:'raingarden'}, {x:20,y:1,type:'raingarden'},
        {x:21,y:24,type:'raingarden'},{x:23,y:24,type:'raingarden'},
        {x:21,y:10,type:'raingarden'},{x:22,y:11,type:'raingarden'},
        {x:22,y:30,type:'raingarden'},{x:23,y:29,type:'raingarden'},
        {x:30,y:28,type:'raingarden'},{x:31,y:27,type:'raingarden'},
      ],
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

      budget: 1200,
      rainRate: 0.18,
      riverInflow: 0.25,
      rainRampUp: 8,
      rainPeak: 25,
      rainRampDown: 27,

      maxHousesLost: 2,

      availableTiles: ['tree', 'raingarden', 'pond', 'permeable', 'levee'],
      showTutorialHints: false,

      solutionExplanation: 'Buffer the river with trees on both banks — this slows overflow before it spreads. Then find the lowest ground adjacent to each house: that\'s where water concentrates, and a rain garden there drains it before it reaches the doorstep. Covering 9 of 10 houses with two drains each, within budget, cuts damage by over 65%.',
      referenceSolution: [
        {x:15,y:0,type:'tree'},{x:17,y:0,type:'tree'},
        {x:15,y:1,type:'tree'},{x:17,y:1,type:'tree'},
        {x:15,y:2,type:'tree'},{x:17,y:2,type:'tree'},
        {x:6,y:10,type:'raingarden'}, {x:7,y:11,type:'raingarden'},
        {x:3,y:21,type:'raingarden'}, {x:2,y:22,type:'raingarden'},
        {x:3,y:9,type:'raingarden'},  {x:2,y:10,type:'raingarden'},
        {x:12,y:26,type:'raingarden'},{x:10,y:26,type:'raingarden'},
        {x:28,y:19,type:'raingarden'},{x:29,y:20,type:'raingarden'},
        {x:29,y:14,type:'raingarden'},{x:30,y:15,type:'raingarden'},
        {x:28,y:29,type:'raingarden'},{x:28,y:31,type:'raingarden'},
        {x:9,y:21,type:'raingarden'}, {x:10,y:20,type:'raingarden'},
        {x:4,y:26,type:'raingarden'}, {x:6,y:26,type:'raingarden'},
      ],
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

      budget: 1300,
      rainRate: 0.25,
      riverInflow: 0.35,
      rainRampUp: 7,
      rainPeak: 30,
      rainRampDown: 23,

      maxHousesLost: 4,

      availableTiles: ['tree', 'raingarden', 'pond', 'permeable', 'levee', 'wetland'],
      showTutorialHints: false,

      solutionExplanation: 'Wetlands are the most powerful tool in heavy rain — placed flanking the upper river, they absorb overflow at the highest-risk entry point. Then give each house its own two-tile drainage moat at its lowest adjacent ground. The same pattern scales up: river buffer plus local house drainage. Even protecting only 8 of 12 houses this way reduces overall damage by 60%.',
      referenceSolution: [
        {x:15,y:0,type:'wetland'},{x:17,y:0,type:'wetland'},
        {x:15,y:1,type:'wetland'},{x:17,y:1,type:'wetland'},
        {x:15,y:2,type:'wetland'},{x:17,y:2,type:'wetland'},
        {x:23,y:10,type:'raingarden'},{x:24,y:11,type:'raingarden'},
        {x:21,y:8,type:'raingarden'}, {x:21,y:10,type:'raingarden'},
        {x:12,y:1,type:'raingarden'}, {x:13,y:0,type:'raingarden'},
        {x:23,y:5,type:'raingarden'}, {x:21,y:5,type:'raingarden'},
        {x:19,y:12,type:'raingarden'},{x:17,y:12,type:'raingarden'},
        {x:29,y:20,type:'raingarden'},{x:30,y:19,type:'raingarden'},
        {x:24,y:8,type:'raingarden'}, {x:25,y:7,type:'raingarden'},
        {x:22,y:8,type:'raingarden'}, {x:23,y:9,type:'raingarden'},
      ],
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

      budget: 1600,
      rainRate: 0.32,
      riverInflow: 0.45,
      rainRampUp: 5,
      rainPeak: 35,
      rainRampDown: 20,

      maxHousesLost: 6,

      availableTiles: ['tree', 'raingarden', 'pond', 'permeable', 'levee', 'wetland', 'road'],
      showTutorialHints: false,

      solutionExplanation: 'The same two principles scale to extreme weather: wetlands on the river banks plus targeted rain garden moats beside the most vulnerable houses. In a century storm, budget forces prioritisation — concentrate on houses in low-lying terrain where water concentrates most. Deliberate placement beats spreading the budget thin. This layout protects 12 of 14 houses and cuts damage by nearly half.',
      referenceSolution: [
        {x:15,y:0,type:'wetland'},{x:17,y:0,type:'wetland'},
        {x:15,y:1,type:'wetland'},{x:17,y:1,type:'wetland'},
        {x:15,y:2,type:'wetland'},{x:17,y:2,type:'wetland'},
        {x:3,y:24,type:'raingarden'}, {x:4,y:23,type:'raingarden'},
        {x:19,y:14,type:'raingarden'},{x:18,y:13,type:'raingarden'},
        {x:27,y:21,type:'raingarden'},{x:28,y:20,type:'raingarden'},
        {x:31,y:25,type:'raingarden'},{x:30,y:24,type:'raingarden'},
        {x:19,y:6,type:'raingarden'}, {x:19,y:8,type:'raingarden'},
        {x:25,y:26,type:'raingarden'},{x:24,y:25,type:'raingarden'},
        {x:16,y:13,type:'raingarden'},{x:17,y:12,type:'raingarden'},
        {x:21,y:10,type:'raingarden'},{x:22,y:9,type:'raingarden'},
        {x:29,y:22,type:'raingarden'},{x:29,y:20,type:'raingarden'},
        {x:1,y:28,type:'raingarden'}, {x:2,y:27,type:'raingarden'},
        {x:6,y:2,type:'raingarden'},  {x:5,y:3,type:'raingarden'},
        {x:18,y:22,type:'raingarden'},{x:17,y:21,type:'raingarden'},
      ],
    }
  ],

  // ============================================================================
  // DIFFICULTY SETTINGS
  // ============================================================================
  DIFFICULTY: {
    current: 'normal',   // 'easy' | 'normal'  — change via UI toggle
    easy: {
      label: 'Easy',
      budgetMultiplier: 1.5,   // budget × 1.5
      rainMultiplier:   0.65,  // rainRate × 0.65
      riverMultiplier:  0.65,  // riverInflow × 0.65
    },
    normal: {
      label: 'Normal',
      budgetMultiplier: 1.0,
      rainMultiplier:   1.0,
      riverMultiplier:  1.0,
    },
  },

  // Home URL — shown on the "Main Page" button; update if your site path differs
  HOME_URL: '../index.html',

  // ============================================================================
  // UI / DISPLAY CONSTANTS
  // ============================================================================
  UI: {
    stormTickMs: 150,    // ms between storm ticks — lower = faster (was 100)
  },
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
