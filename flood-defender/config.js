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
    },
    {
      id: 'level5',
      name: 'Level 5: Climate Surge',
      description: 'A changing climate brings longer, harder storms.',
      briefing: 'Rainfall patterns have shifted. This storm lasts longer at its peak than anything before it. Green infrastructure alone may not be enough — combine absorption with smart barrier placement. Protect the most vulnerable homes first.',

      gridSeed: 85,
      numHouses: 16,
      numRiverCells: 8,
      riverStartPos: { x: 16, y: 0 },

      budget: 1800,
      rainRate: 0.38,
      riverInflow: 0.55,
      rainRampUp: 5,
      rainPeak: 38,
      rainRampDown: 17,

      maxHousesLost: 5,

      availableTiles: ['tree', 'raingarden', 'pond', 'permeable', 'levee', 'wetland', 'road'],
      showTutorialHints: false,

      solutionExplanation: 'With a longer storm peak, single-tile drainage is not enough — pair wetlands at the river mouth with levees blocking the main overflow channel. Then prioritise the eight houses at the lowest elevation: two rain gardens each, placed immediately downslope. Houses on high ground need no protection. Targeting low-ground houses first while blocking the overflow corridor keeps total losses within the cap.',
      referenceSolution: [
        {x:15,y:0,type:'wetland'},{x:17,y:0,type:'wetland'},
        {x:15,y:1,type:'wetland'},{x:17,y:1,type:'wetland'},
        {x:14,y:2,type:'wetland'},{x:18,y:2,type:'wetland'},
        {x:15,y:3,type:'levee'}, {x:17,y:3,type:'levee'},
        {x:5,y:15,type:'raingarden'}, {x:6,y:14,type:'raingarden'},
        {x:2,y:18,type:'raingarden'}, {x:3,y:17,type:'raingarden'},
        {x:10,y:28,type:'raingarden'},{x:11,y:27,type:'raingarden'},
        {x:22,y:20,type:'raingarden'},{x:23,y:19,type:'raingarden'},
        {x:27,y:25,type:'raingarden'},{x:28,y:24,type:'raingarden'},
        {x:7,y:24,type:'raingarden'}, {x:8,y:23,type:'raingarden'},
        {x:19,y:9,type:'raingarden'}, {x:20,y:8,type:'raingarden'},
        {x:13,y:18,type:'raingarden'},{x:14,y:17,type:'raingarden'},
        {x:30,y:16,type:'raingarden'},{x:31,y:15,type:'raingarden'},
        {x:25,y:11,type:'raingarden'},{x:26,y:10,type:'raingarden'},
      ],
    },
    {
      id: 'level6',
      name: 'Level 6: Flash Flood Warning',
      description: 'Fast onset, heavy rain. Every second counts.',
      briefing: 'Emergency alert: flash flood conditions. Rain reaches peak intensity almost immediately and stays there. You have less build time and every tile must earn its place. Water will find the lowest path — know your terrain before you place.',

      gridSeed: 97,
      numHouses: 18,
      numRiverCells: 9,
      riverStartPos: { x: 16, y: 0 },

      budget: 2000,
      rainRate: 0.45,
      riverInflow: 0.65,
      rainRampUp: 4,
      rainPeak: 40,
      rainRampDown: 16,

      maxHousesLost: 5,

      availableTiles: ['tree', 'raingarden', 'pond', 'permeable', 'levee', 'wetland', 'road'],
      showTutorialHints: false,

      solutionExplanation: 'Flash floods punish low-cost single-tile fixes — use retention ponds near the river to absorb the first surge, then form a levee line across the main flow path before it fans out toward houses. Rain gardens handle residual pooling near individual homes. The key insight: stop the flood corridor first, then mop up the edges. Spreading budget evenly across all 18 houses leaves no house well-protected; concentrating on the flood path protects 13 at once.',
      referenceSolution: [
        {x:15,y:0,type:'wetland'},{x:17,y:0,type:'wetland'},
        {x:14,y:1,type:'wetland'},{x:18,y:1,type:'wetland'},
        {x:15,y:2,type:'pond'},   {x:17,y:2,type:'pond'},
        {x:13,y:4,type:'levee'}, {x:14,y:4,type:'levee'},{x:18,y:4,type:'levee'},{x:19,y:4,type:'levee'},
        {x:7,y:12,type:'raingarden'}, {x:8,y:11,type:'raingarden'},
        {x:4,y:20,type:'raingarden'}, {x:5,y:19,type:'raingarden'},
        {x:12,y:25,type:'raingarden'},{x:13,y:24,type:'raingarden'},
        {x:21,y:17,type:'raingarden'},{x:22,y:16,type:'raingarden'},
        {x:26,y:22,type:'raingarden'},{x:27,y:21,type:'raingarden'},
        {x:29,y:28,type:'raingarden'},{x:30,y:27,type:'raingarden'},
        {x:9,y:29,type:'raingarden'}, {x:10,y:28,type:'raingarden'},
        {x:18,y:24,type:'raingarden'},{x:19,y:23,type:'raingarden'},
        {x:24,y:13,type:'raingarden'},{x:25,y:12,type:'raingarden'},
        {x:2,y:26,type:'raingarden'}, {x:3,y:25,type:'raingarden'},
      ],
    },
    {
      id: 'level7',
      name: 'Level 7: The Great Flood',
      description: 'The hardest storm. Can you protect your town?',
      briefing: 'The river has burst. Rainfall is the heaviest on record. The storm peaks fast and does not relent. You have the most houses, the tightest tolerance, and only your knowledge of green infrastructure to fall back on. This is what all your training has been for.',

      gridSeed: 111,
      numHouses: 20,
      numRiverCells: 10,
      riverStartPos: { x: 16, y: 0 },

      budget: 2200,
      rainRate: 0.55,
      riverInflow: 0.80,
      rainRampUp: 3,
      rainPeak: 45,
      rainRampDown: 12,

      maxHousesLost: 4,

      availableTiles: ['tree', 'raingarden', 'pond', 'permeable', 'levee', 'wetland', 'road'],
      showTutorialHints: false,

      solutionExplanation: 'The Great Flood demands a layered defence: wetlands and ponds at the river mouth absorb the initial burst, a levee arc across the middle-ground channels overflow away from the densest housing cluster, and rain gardens defend the lowest individual houses. No single tool wins alone. Budget discipline is everything — skip high-ground houses entirely and reinforce the flood corridor with every dollar saved. This three-layer approach keeps losses within four, even in a once-in-a-millennium event.',
      referenceSolution: [
        {x:15,y:0,type:'wetland'},{x:17,y:0,type:'wetland'},
        {x:14,y:1,type:'wetland'},{x:18,y:1,type:'wetland'},
        {x:15,y:2,type:'pond'},   {x:17,y:2,type:'pond'},
        {x:14,y:3,type:'pond'},   {x:18,y:3,type:'pond'},
        {x:12,y:5,type:'levee'},{x:13,y:5,type:'levee'},{x:19,y:5,type:'levee'},{x:20,y:5,type:'levee'},
        {x:11,y:6,type:'levee'},{x:21,y:6,type:'levee'},
        {x:6,y:11,type:'raingarden'}, {x:7,y:10,type:'raingarden'},
        {x:3,y:19,type:'raingarden'}, {x:4,y:18,type:'raingarden'},
        {x:9,y:26,type:'raingarden'}, {x:10,y:25,type:'raingarden'},
        {x:20,y:16,type:'raingarden'},{x:21,y:15,type:'raingarden'},
        {x:25,y:22,type:'raingarden'},{x:26,y:21,type:'raingarden'},
        {x:28,y:29,type:'raingarden'},{x:29,y:28,type:'raingarden'},
        {x:16,y:24,type:'raingarden'},{x:17,y:23,type:'raingarden'},
        {x:7,y:30,type:'raingarden'}, {x:8,y:29,type:'raingarden'},
        {x:23,y:9,type:'raingarden'}, {x:24,y:8,type:'raingarden'},
        {x:1,y:24,type:'raingarden'}, {x:2,y:23,type:'raingarden'},
        {x:30,y:20,type:'raingarden'},{x:31,y:19,type:'raingarden'},
      ],
    },
    // ── SANDBOX (Feature 8) ────────────────────────────────────────────────────
    {
      id: 'sandbox',
      name: 'Sandbox — Free Play',
      description: 'No win conditions. Experiment freely with any tiles.',
      briefing: 'Free play mode — unlimited budget, no damage cap, no fail state. Try any combination of tiles and watch how the water behaves. What happens if you ring the entire river with wetlands? Can you build a perfect levee wall? This space is yours to experiment.',
      isSandbox: true,
      gridSeed: 42,
      numHouses: 10,
      numRiverCells: 6,
      riverStartPos: { x: 16, y: 0 },
      budget: 99999,
      rainRate: 0.25,
      riverInflow: 0.35,
      rainRampUp: 8,
      rainPeak: 30,
      rainRampDown: 22,
      maxHousesLost: 9999,
      availableTiles: ['tree', 'raingarden', 'pond', 'permeable', 'levee', 'wetland', 'road'],
      showTutorialHints: false,
      solutionExplanation: '',
      referenceSolution: [],
    },
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

  // ============================================================================
  // IN-CONTEXT GLOSSARY (Feature 11)
  // Terms that appear in briefing text get a dotted underline + hover definition.
  // ============================================================================
  GLOSSARY: {
    'wetland':              'A low-lying area saturated with water, acting as a natural sponge that absorbs and slowly releases floodwater.',
    'levee':                'An embankment alongside a river that holds water back — powerful, but can be overtopped when the volume is too great.',
    'permeable':            'Allows water to pass through into the ground, rather than running off across the surface.',
    'impermeable':          'Blocks water from soaking in — roads and concrete are impermeable, causing rapid runoff and faster flooding.',
    'runoff':               'Rainwater that flows across the surface when the ground cannot absorb it quickly enough.',
    'absorption':           'The process by which soil and vegetation soak up water, reducing surface flow and peak flood levels.',
    'catchment':            'The area of land from which all rainfall drains toward a single river or outlet point.',
    'green infrastructure': 'Networks of trees, wetlands and engineered features that manage water using natural processes.',
    'retention pond':       'An engineered basin that captures stormwater and releases it slowly, preventing rapid downstream surges.',
    'rain garden':          'A shallow planted depression that captures street runoff and lets it soak into the ground.',
    'flash flood':          'A sudden, intense flood caused by heavy rainfall over a short time — water rises within minutes.',
    'inflow':               'Water entering the system from rainfall or a river source during the storm.',
    'maintenance':          'The ongoing cost to keep an infrastructure tile functioning at full capacity each storm cycle.',
    'river health':         'A measure of the ecological quality of a river — improved by natural buffers, degraded by paved runoff.',
    'bioswale':             'A vegetated channel that slows and filters stormwater runoff, similar to a large rain garden.',
  },

  // ============================================================================
  // TILE SYNERGY (Feature 2)
  // Green tiles adjacent to 2+ other green tiles get a 1.2× absorption bonus.
  // ============================================================================
  SYNERGY_TILES: ['tree', 'wetland', 'raingarden', 'pond'],

  // ============================================================================
  // ACHIEVEMENT BADGES (Feature 9)
  // ============================================================================
  BADGES: {
    ecologist: {
      id: 'ecologist', emoji: '🌿',
      name: 'Ecologist',
      description: 'Win 3 different levels using only green infrastructure (trees, rain gardens, wetlands, ponds)',
    },
    budgetWizard: {
      id: 'budgetWizard', emoji: '💰',
      name: 'Budget Wizard',
      description: 'Pass any level with 40% or more of your budget still remaining',
    },
    riverGuardian: {
      id: 'riverGuardian', emoji: '🌊',
      name: 'River Guardian',
      description: 'Pass any level with an average river health score above 90/100',
    },
  },

  // ============================================================================
  // CASE STUDY CARDS (Feature 5) — unlocked on level completion
  // ============================================================================
  CASE_STUDIES: {
    level1: {
      title: 'Rotterdam Water Squares',
      location: 'Rotterdam, Netherlands', year: 2013,
      facts: [
        'Public squares built to flood deliberately during heavy rain, storing water underground',
        'Benthemplein square holds 1.7 million litres — enough to fill 680 bathtubs',
        'Nearby street flooding fell by 80% after the first major storm',
      ],
      connection: 'You designed the same concept: low-lying spaces that catch water before it can reach homes.',
    },
    level2: {
      title: 'Singapore ABC Waters Programme',
      location: 'Singapore', year: 2006,
      facts: [
        'Singapore transformed concrete canals into naturalised waterways with planted banks',
        'The programme linked 100 parks into one continuous blue-green network across the city',
        'Flood events in target areas fell by 90% over the first decade',
      ],
      connection: 'Permeable surfaces and green buffers alongside channels — the same combination you used here.',
    },
    level3: {
      title: 'Bangladesh Mangrove Restoration',
      location: 'Sundarbans, Bangladesh', year: 2015,
      facts: [
        'Bangladesh restored 150,000 hectares of mangrove wetlands along the Bay of Bengal',
        'Mangroves dissipate up to 75% of wave energy and slow river surges during storms',
        'Villagers in restored zones reported significantly less flooding than in cleared areas',
      ],
      connection: 'Wetlands alongside rivers are nature\'s flood buffer — exactly what you placed at the river banks.',
    },
    level4: {
      title: 'New Orleans Post-Katrina Green Rebuild',
      location: 'New Orleans, USA', year: 2010,
      facts: [
        'After Katrina, New Orleans converted a golf course into 25 acres of bioswales and retention ponds',
        'The city\'s "Dutch Dialogues" project imported Netherlands water management expertise city-wide',
        'Green infrastructure projects reduced flood damage in target zones by an estimated 65%',
      ],
      connection: 'Multi-layer defence — large absorption at source, barriers at corridors, drainage per house — mirrors modern New Orleans.',
    },
    level5: {
      title: 'UK Natural Flood Management',
      location: 'Yorkshire & Cumbria, England', year: 2017,
      facts: [
        'After 2015 floods, the UK invested £15M in "slow the flow" — planting floodplain trees and restoring river meanders',
        'Peak flows in treated catchments dropped by up to 30% during later storms',
        'Farmers were paid to hold water in fields using earth bunds and shallow scrapes',
      ],
      connection: 'Longer storms need catchment-wide absorption — trees and wetlands across the whole landscape, not just near individual houses.',
    },
    level6: {
      title: 'Tokyo G-Cans Underground Cistern',
      location: 'Tokyo, Japan', year: 2006,
      facts: [
        'Tokyo built the world\'s largest underground flood cistern — 6.3 km long, 50 m deep',
        'Five enormous silos capture flash flood surges from five rivers simultaneously',
        'Since 2006, flood damage in greater Tokyo has fallen by 85%',
      ],
      connection: 'Flash floods need massive fast-capture storage at the source — the same logic as placing ponds and wetlands at the river head.',
    },
    level7: {
      title: 'Netherlands Delta Programme',
      location: 'Netherlands', year: 1958,
      facts: [
        'After 1,836 people died in the 1953 North Sea flood, the Netherlands built 13 massive barriers and dams over 25 years',
        'Today 60% of the Netherlands\' 17 million people live below sea level, protected by layered defence',
        'The programme costs $1.5 billion per year to maintain — far cheaper than one major flood',
      ],
      connection: 'Your three-layer defence — wetland absorption, levee barriers, local drainage — is the Delta Programme in miniature.',
    },
  },

  // ============================================================================
  // REAL WORLD EVENT LINKS (Feature 10)
  // ============================================================================
  REAL_EVENTS: {
    level1: {
      name: '2015 UK Winter Floods', year: 2015, location: 'Northern England',
      summary: 'After months of record rainfall, rivers in Yorkshire and Cumbria burst their banks. Over 16,000 homes flooded. Damage exceeded £5 billion. Communities that had planted riverside trees and created floodplain meadows in the years prior reported significantly lower water levels.',
      lesson: 'Green infrastructure works year-round — every tree placed today will absorb water from future storms, not just this one.',
    },
    level2: {
      name: '2011 Queensland Floods', year: 2011, location: 'Queensland, Australia',
      summary: '75% of Queensland was declared a disaster zone. The Lockyer Valley was hit by a sudden wall of water. Levees that had never been overtopped failed under the surge volume because the catchment had no buffer infrastructure upstream.',
      lesson: 'Levees alone are not enough — permeable surfaces and catchment-wide absorption reduce the peak volume that reaches any barrier.',
    },
    level3: {
      name: '2011 Bangkok Floods', year: 2011, location: 'Bangkok, Thailand',
      summary: 'Thailand\'s worst flooding in 50 years killed 815 people. Half of Bangkok went underwater for months. The city\'s historic canal network — designed for flood management — had been paved over for urban development, removing the city\'s natural absorption system.',
      lesson: 'What was paved over matters. The wetlands you placed restore exactly what decades of development removed.',
    },
    level4: {
      name: 'Hurricane Katrina — New Orleans', year: 2005, location: 'New Orleans, USA',
      summary: 'Katrina\'s storm surge overwhelmed 240 miles of levees. 1,833 people died and 80% of the city flooded. Post-disaster analysis found that degraded coastal wetlands — which once dissipated storm surge — had been destroyed over decades. Single-layer levee defence had no backup.',
      lesson: 'Redundant defence — wetlands absorbing the first surge, levees as a second line — is the lesson New Orleans has since invested billions to implement.',
    },
    level5: {
      name: '2019 Venice Flooding (Acqua Alta)', year: 2019, location: 'Venice, Italy',
      summary: 'On 12 November 2019, Venice recorded its highest flood level since 1966: 187 cm above sea level. 80% of the city was submerged. The flooding lasted weeks because the storm sustained peak rainfall for far longer than historical models predicted.',
      lesson: 'Long-duration peak rain is what overwhelmed Venice. Extra storage capacity during the prolonged peak is what your strategy addresses.',
    },
    level6: {
      name: '2013 Colorado Flash Floods', year: 2013, location: 'Colorado, USA',
      summary: 'Seven days of intense rain caused flash floods across Colorado\'s Front Range, causing $4 billion in damage and killing 8 people. Suburban expansion had replaced natural grasslands and wetlands that once absorbed intense rainfall, leaving no buffer for the sudden surge.',
      lesson: 'Flash floods punish systems with no buffer near the source. Retention ponds and wetlands at the river head are the difference between managed surge and catastrophe.',
    },
    level7: {
      name: '1931 China Floods', year: 1931, location: 'Central China',
      summary: 'The deadliest natural disaster in recorded history. Up to 4 million people perished when the Yangtze, Huai and Yellow rivers flooded simultaneously. Decades of deforestation had eliminated all natural flood regulation. No layered defence existed — when the rivers rose, nothing slowed them.',
      lesson: 'The three-layer defence you\'ve mastered — absorption, barrier, local drainage — is the modern answer to what the 1931 floods exposed as a fatal single-point failure.',
    },
  },
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
