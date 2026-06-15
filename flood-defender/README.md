# Flood Defender - Educational Game

A phase-based 2D educational browser game that teaches students how green and sustainable infrastructure reduces flood damage.

## Overview

Players design solutions to protect a town from flooding by strategically placing green infrastructure (trees, wetlands, retention ponds, levees) and grey infrastructure (roads, permeable pavements) within a budget. The game uses water physics simulation to show how different solutions perform during a storm.

## Game Phases

Each level cycles through four phases:

1. **Briefing** — Learn the scenario, budget, and goal
2. **Build** — Place tiles on the grid to design your solution
3. **Storm** — Watch your design in action as rain falls and water spreads (60 animated ticks)
4. **Results** — See your score, damage taken, and an educational lesson

## How to Play

1. Open `index.html` in a web browser (no server needed)
2. Read the briefing and click "Start Building"
3. Click on tiles in the palette, then click the grid to place them (right-click to remove, 50% refund)
4. Watch your budget—each tile costs upfront money and maintenance per level
5. Click "Run Storm" to simulate the weather event
6. Review results and try the next level if you passed!

**Win Condition:** Keep total damage **below the damage cap** AND stay **within budget**. Only then does the next level unlock.

## File Structure

```
flood-defender/
├── index.html          # Main page with canvas and UI
├── style.css           # Layout, colors, responsive design
├── config.js           # All tunable constants and game definitions
├── sim.js              # Water physics simulation (no DOM access)
├── game.js             # Game state, phases, scoring, level progression
├── render.js           # Canvas drawing and UI updates
└── main.js             # Event wiring and game loop
```

## Game Architecture

- **Canvas-based rendering** — Uses a single HTML5 canvas for the 32×32 grid (no DOM elements per cell for performance)
- **Modular design** — Each file has a single responsibility
- **Config-driven** — All numbers live in `config.js`; tweak them to balance difficulty
- **Physics-based** — Double-buffered grid simulation with elevation-aware water flow

## Tile Types

| Tile | Cost | Maintenance | Capacity | Rate | Blocks Flow | Damageable | Notes |
|------|------|-------------|----------|------|-------------|-----------|-------|
| Grass | — | — | 5 | 0.3 | No | No | Default terrain |
| River | — | — | 0 | 0 | No | No | Water source; overflows during storm |
| Tree | $40 | $5 | 30 | 0.8 | No | No | Boosts happiness; dies if deeply flooded |
| Wetland | $60 | $8 | 50 | 1.2 | No | No | Best absorber; natural river buffer |
| Pond | $120 | $15 | 200 | 1.5 | No | No | Huge capacity; ultimate water storage |
| Levee | $90 | $12 | 0 | 0 | **Yes** | No | Blocks flow; can be overtopped |
| Permeable | $70 | $10 | 20 | 0.6 | No | No | Walkable; absorbs water |
| Road | $30 | $3 | 0 | 0 | No | **Yes** (1) | Impermeable; low damage value |
| House | — | — | 0 | 0 | No | **Yes** (100) | **Main target to protect!** |

## Key Constants to Tweak for Balancing

Open `config.js` and adjust these to fine-tune difficulty:

### Storm Intensity
```javascript
rainRate: 0.15,        // Start here to make storms easier/harder (rainfall per tick)
riverInflow: 0.2,      // Extra water from river source each tick
rainRampUp: 10,        // Ticks to reach peak (shorter = steeper rise)
rainPeak: 20,          // Ticks at peak rainfall
rainRampDown: 30,      // Ticks to taper (longer = gentler descent)
```

**Effect:** Increase `rainRate` and `riverInflow` for harder levels. Adjust ramp timings to make it a sudden spike vs. sustained rain.

### Budget & Costs
```javascript
budget: 800,           // Player's upfront money
// In TILES, adjust .cost for each tile
// In TILES, adjust .maintenance for each tile
```

**Effect:** Tight budget forces hard choices. Raise maintenance on expensive tiles to penalize poor planning. Lower costs to allow more experimentation.

### Damage & Thresholds
```javascript
damageCapForPass: 50,  // Must keep damage below this to pass
floodThreshold: 0.5,   // Water depth above this causes damage
```

**Effect:** Raise `damageCapForPass` to make levels easier. Lower `floodThreshold` to make ANY water damaging (harder).

### Tree & River Health
```javascript
treeDeathThreshold: 3.0,      // Depth at which trees start drowning
treeDeathDuration: 15,        // Ticks before a drowned tree dies
```

**Effect:** Lower `treeDeathThreshold` to make trees more fragile. Raise `treeDeathDuration` to give players more time to recover.

### Levee Behavior
```javascript
leveHeight: 1.5,       // Elevation threshold before levee is overtopped
```

**Effect:** Lower this to make levees easier to top (more water-like). Raise to make levees more powerful.

### Absorption Tuning
In the TILES section, adjust each tile's `absorbCapacity` and `absorbRate`:
```javascript
absorbCapacity: 50,    // Max water this tile can store
absorbRate: 1.2,       // How fast it absorbs (per tick)
```

**Effect:** Higher capacity = tile stores more before saturating. Higher rate = faster absorption.

### Scoring Weights
```javascript
propertyProtectionWeight: 0.5,     // 50% of score from property saved
budgetEfficiencyWeight: 0.3,       // 30% from budget left over
ecologicalHealthWeight: 0.2,       // 20% from ecosystem health
```

**Effect:** Adjust to reward different playstyles (money-saving vs. eco-friendly vs. damage-prevention).

## Recommended Balancing Workflow

1. **Play Level 1** and verify the tutorial budget is generous enough to pass easily
2. **Tweak `rainRate`** if storms are too easy/hard
3. **Adjust `damageCapForPass`** if players consistently pass/fail on different margins
4. **Modify tile `costs`** if some tiles feel over/under-powered
5. **Test Levels 2–4** progressively for increasing difficulty

**Pro tip:** Use the browser console to log `game.debugPlacements()` to see what the player built, and `game.getFinalMetrics()` to inspect the outcome.

## Unlocking & Progression

Levels unlock only after passing the previous one. Define new levels in `config.js`:

```javascript
LEVELS: [
  { id: 'level1', name: 'Tutorial', /* ... */ },
  { id: 'level2', name: 'Growing Storm', /* ... */ },
  // ... add more levels here
]
```

Each level specifies:
- `availableTiles` — which tile types players can place
- `budget`, `rainRate`, `riverInflow` — difficulty
- `damageCapForPass` — win condition
- `gridSeed` — for reproducible maps

## Educational Messaging

Tooltips on every tile explain real-world mechanisms. The "What You Learned" card at the end ties the outcome to concepts:

- **Wetlands** act like sponges; absorb huge water volumes
- **Trees** provide urban cooling, absorb water, and improve happiness
- **Retention ponds** store extreme rainfall; critical for peak events
- **Levees** protect behind but flood before; use strategically
- **Permeable pavement** is "grey-green"—impermeable roads speed runoff
- **River buffers**—natural infrastructure improves river health

## Technical Details

### Water Simulation (per tick)

1. **Rainfall** — Add `rainRate` water to all cells (ramping over time)
2. **River inflow** — River cells gain `riverInflow` water
3. **Absorption** — Each cell absorbs min(absorbRate, capacity − absorbed, water)
4. **Flow** — Compute `head = elevation + water`; move water to lower-head neighbors (double-buffered)
5. **Damage** — For damageable tiles, if water > floodThreshold, add damage ∝ depth × tileValue

### Parameters Tracked

- **Budget** — Reduces with placements; maintenance subtracted at results
- **Happiness** — Rises with trees near houses; falls with flooding
- **Tree health** — Degrades if deeply flooded for too long (teaches spreading solutions)
- **River health** — Improves with natural buffers; worsens with paved runoff

### Scoring Formula

```
Score = (propertyProtected * 0.5) + (budgetEfficiency * 0.3) + (ecoHealth * 0.2)

Stars:
  3★ if Score ≥ 0.9
  2★ if Score ≥ 0.75
  1★ if Score ≥ 0.5
  0★ otherwise
```

Pass = damage < cap AND budget ≥ 0

## Browser Compatibility

- **Modern browsers** (Chrome, Firefox, Safari, Edge)
- HTML5 Canvas support required
- ES6 JavaScript (const, arrow functions, class syntax)
- No build step; no framework; no external dependencies

## Future Extensions

- **Mobile touch support** for placing tiles
- **Sound effects** (water flowing, trees dying, success/failure)
- **Level editor** to create custom scenarios
- **Multiplayer** (e.g., design simultaneously, compare scores)
- **More tiles** (green roofs, bioswales, permafrost effects, etc.)
- **Difficulty modes** (eco-focused, budget-focused, speed-run)

---

**Enjoy teaching sustainable flood management!** 🌊🌳
