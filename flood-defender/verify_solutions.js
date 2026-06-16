/**
 * Reference-solution verification script.
 * Run with: node verify_solutions.js
 */
'use strict';

// ── Inline the seeded-RNG to discover map layouts ──────────────────────────

function seededRandom(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function generateMapLayout(levelDef) {
  const W = 32, H = 32;
  const rng = seededRandom(levelDef.gridSeed);

  // Build blank grid
  const grid = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push({ type: 'grass', elevation: 0 });
    grid.push(row);
  }

  // River
  const { x: rx, y: ry } = levelDef.riverStartPos;
  const rivers = [];
  for (let i = 0; i < levelDef.numRiverCells; i++) {
    const cy = ry + i;
    if (cy < H) { grid[cy][rx].type = 'river'; rivers.push({ x: rx, y: cy }); }
  }

  // Houses
  const houses = [];
  let placed = 0;
  while (placed < levelDef.numHouses) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * H);
    if (grid[y][x].type === 'grass') {
      grid[y][x].type = 'house';
      houses.push({ x, y });
      placed++;
    }
  }

  // Elevation (we don't need exact values, just want the grid type map)
  return { grid, rivers, houses };
}

// ── Load game files ─────────────────────────────────────────────────────────

const CONFIG     = require('./config.js');
const Simulation = require('./sim.js');

// ── Run a simulation with given placements ──────────────────────────────────

function runSim(levelIndex, placements) {
  const ld  = CONFIG.LEVELS[levelIndex];
  const sim = new Simulation(CONFIG, ld);

  // Discover occupied cells
  const occupied = new Set();
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      if (sim.getCell(x, y).type !== 'grass') occupied.add(`${x},${y}`);

  let spent = 0;
  const skipped = [];
  for (const p of placements) {
    const key = `${p.x},${p.y}`;
    if (occupied.has(key)) { skipped.push(key); continue; }
    const td = CONFIG.TILES[p.type];
    if (!td || !td.placeable) continue;
    sim.setCell(p.x, p.y, p.type);
    spent += td.cost;
  }

  if (skipped.length) console.log(`  ⚠  Skipped ${skipped.length} placements (occupied): ${skipped.join(', ')}`);

  while (!sim.isComplete()) sim.tick();

  const m = sim.getFinalMetrics();
  return { metrics: m, spent, budget: ld.budget };
}

// ── Print layout discovery ──────────────────────────────────────────────────

console.log('\n=== MAP LAYOUT DISCOVERY ===\n');
for (let li = 0; li < CONFIG.LEVELS.length; li++) {
  const ld = CONFIG.LEVELS[li];
  const { rivers, houses } = generateMapLayout(ld);
  console.log(`Level ${li + 1} (${ld.name}, seed=${ld.gridSeed}):`);
  console.log(`  River: ${rivers.map(r => `(${r.x},${r.y})`).join(', ')}`);
  console.log(`  Houses (${houses.length}): ${houses.map(h => `(${h.x},${h.y})`).join(', ')}`);
  console.log(`  Budget: $${ld.budget}, DamageCap: ${ld.damageCapForPass}`);
  console.log();
}

// ── Reference solutions ─────────────────────────────────────────────────────
// Placements are in { x, y, type } format. Edit config.js to store these.
// Designed after map-layout discovery — see comments for strategy.

const SOLUTIONS = [

  // ── Level 1 (seed 42, budget $800, cap 50) ────────────────────────────────
  // River runs x=16, y=0–3. Houses scattered across grid.
  // Strategy: buffer river with trees; retention ponds downstream;
  //           rain gardens near the densest cluster of houses.
  [
    // Flank the river (left and right of each river cell)
    { x: 15, y: 0, type: 'tree' }, { x: 17, y: 0, type: 'tree' },
    { x: 15, y: 1, type: 'tree' }, { x: 17, y: 1, type: 'tree' },
    { x: 15, y: 2, type: 'tree' }, { x: 17, y: 2, type: 'tree' },
    { x: 15, y: 3, type: 'tree' }, { x: 17, y: 3, type: 'tree' },
    // Downstream ponds to catch overflow
    { x: 16, y: 4, type: 'pond' },   // directly downstream
    { x: 14, y: 4, type: 'pond' },
    // Rain gardens further out — cost-efficient area coverage
    { x: 13, y: 2, type: 'raingarden' }, { x: 19, y: 2, type: 'raingarden' },
    { x: 13, y: 3, type: 'raingarden' }, { x: 19, y: 3, type: 'raingarden' },
    { x: 12, y: 5, type: 'raingarden' }, { x: 20, y: 5, type: 'raingarden' },
    { x:  8, y: 8, type: 'raingarden' }, { x: 24, y: 8, type: 'raingarden' },
  ],

  // ── Level 2 (seed 51, budget $900, cap 60) ────────────────────────────────
  // River x=16, y=0–4. New tools: permeable + levee.
  // Strategy: wetland not available yet. Use trees + permeable for river buffer;
  //           levee on one side to direct overflow into a pond; permeable on
  //           the main runoff corridor.
  [
    // River flanking trees
    { x: 15, y: 0, type: 'tree' }, { x: 17, y: 0, type: 'tree' },
    { x: 15, y: 1, type: 'tree' }, { x: 17, y: 1, type: 'tree' },
    { x: 15, y: 2, type: 'tree' }, { x: 17, y: 2, type: 'tree' },
    { x: 15, y: 3, type: 'tree' }, { x: 17, y: 3, type: 'tree' },
    // Levee on the left flank to channel overflow into the pond
    { x: 14, y: 1, type: 'levee' }, { x: 14, y: 2, type: 'levee' },
    { x: 14, y: 3, type: 'levee' },
    // Retention pond downstream
    { x: 16, y: 5, type: 'pond' }, { x: 18, y: 5, type: 'pond' },
    // Permeable on the primary runoff corridor
    { x: 12, y: 5, type: 'permeable' }, { x: 12, y: 6, type: 'permeable' },
    { x: 20, y: 5, type: 'permeable' }, { x: 20, y: 6, type: 'permeable' },
    // Rain gardens for area coverage
    { x:  8, y: 8, type: 'raingarden' }, { x: 24, y: 8, type: 'raingarden' },
    { x: 13, y: 8, type: 'raingarden' }, { x: 19, y: 8, type: 'raingarden' },
  ],

  // ── Level 3 (seed 63, budget $950, cap 80) ────────────────────────────────
  // River x=16, y=0–5. New tool: wetland.
  // Strategy: wetlands directly flank the river (top cells) — best absorption +
  //           best river health bonus. Trees behind wetlands as second layer.
  //           Large pond catches overflow. Permeable on corridors.
  [
    // Wetlands flanking the upper river (biggest flood risk zone)
    { x: 15, y: 0, type: 'wetland' }, { x: 17, y: 0, type: 'wetland' },
    { x: 15, y: 1, type: 'wetland' }, { x: 17, y: 1, type: 'wetland' },
    { x: 15, y: 2, type: 'wetland' }, { x: 17, y: 2, type: 'wetland' },
    // Trees as second buffer layer
    { x: 14, y: 2, type: 'tree' }, { x: 18, y: 2, type: 'tree' },
    { x: 14, y: 3, type: 'tree' }, { x: 18, y: 3, type: 'tree' },
    { x: 15, y: 3, type: 'tree' }, { x: 17, y: 3, type: 'tree' },
    // Big pond downstream of the river
    { x: 16, y: 6, type: 'pond' }, { x: 15, y: 6, type: 'pond' },
    // Permeable on approach corridors
    { x: 13, y: 5, type: 'permeable' }, { x: 19, y: 5, type: 'permeable' },
    { x: 12, y: 6, type: 'permeable' }, { x: 20, y: 6, type: 'permeable' },
    // Rain gardens for broader coverage
    { x:  8, y: 8, type: 'raingarden' }, { x: 24, y: 8, type: 'raingarden' },
  ],

  // ── Level 4 (seed 73, budget $1200, cap 100) ──────────────────────────────
  // River x=16, y=0–6. All tools available.
  // Strategy: wetlands + levee channel the river overflow into a pond;
  //           trees as habitat buffer; permeable on runoff corridors;
  //           rain gardens spread across the map for rainfall absorption.
  [
    // Wetlands flanking the upper river
    { x: 15, y: 0, type: 'wetland' }, { x: 17, y: 0, type: 'wetland' },
    { x: 15, y: 1, type: 'wetland' }, { x: 17, y: 1, type: 'wetland' },
    { x: 15, y: 2, type: 'wetland' }, { x: 17, y: 2, type: 'wetland' },
    // Levee barriers left flank to direct overflow right → pond
    { x: 14, y: 0, type: 'levee' }, { x: 14, y: 1, type: 'levee' },
    { x: 14, y: 2, type: 'levee' }, { x: 14, y: 3, type: 'levee' },
    // Trees as second buffer layer
    { x: 18, y: 3, type: 'tree' }, { x: 13, y: 4, type: 'tree' },
    { x: 15, y: 4, type: 'tree' }, { x: 17, y: 4, type: 'tree' },
    { x: 19, y: 4, type: 'tree' },
    // Large pond at the natural flood outlet
    { x: 16, y: 7, type: 'pond' }, { x: 17, y: 7, type: 'pond' },
    { x: 15, y: 7, type: 'pond' },
    // Permeable corridors
    { x: 13, y: 6, type: 'permeable' }, { x: 19, y: 6, type: 'permeable' },
    { x: 12, y: 7, type: 'permeable' }, { x: 20, y: 7, type: 'permeable' },
    // Rain gardens for rainfall coverage across the map
    { x:  6, y: 6, type: 'raingarden' }, { x: 26, y: 6, type: 'raingarden' },
    { x:  8, y:10, type: 'raingarden' }, { x: 24, y:10, type: 'raingarden' },
    { x: 14, y:12, type: 'raingarden' }, { x: 18, y:12, type: 'raingarden' },
  ],
];

// ── Verify solutions ─────────────────────────────────────────────────────────

console.log('\n=== REFERENCE SOLUTION VERIFICATION ===\n');

for (let li = 0; li < SOLUTIONS.length; li++) {
  const ld  = CONFIG.LEVELS[li];
  const sol = SOLUTIONS[li];
  console.log(`Level ${li + 1}: ${ld.name}`);

  const { metrics, spent, budget } = runSim(li, sol);
  const pass = metrics.totalDamage <= ld.damageCapForPass && spent <= budget;

  console.log(`  Damage:  ${Math.round(metrics.totalDamage)} / ${ld.damageCapForPass} cap  ${metrics.totalDamage <= ld.damageCapForPass ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Budget:  $${spent} spent of $${budget}  ($${budget - spent} remaining)  ${spent <= budget ? '✓' : '✗ OVER BUDGET'}`);
  console.log(`  Overall: ${pass ? '✓ SOLUTION PASSES' : '✗ NEEDS ADJUSTMENT'}`);
  console.log(`  Ecology: happiness=${Math.round(metrics.avgHappiness)}, trees=${Math.round(metrics.avgTreeHealth)}, river=${Math.round(metrics.avgRiverHealth)}`);
  console.log();
}
