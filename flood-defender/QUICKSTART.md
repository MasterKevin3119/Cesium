# 🌊 Flood Defender - Quick Start Guide

## Installation & Launch

1. **Open the game:** Simply open `index.html` in any modern web browser
   - No build step, no server needed
   - Works offline
   - Chrome, Firefox, Safari, and Edge all supported

2. **Start with Level 1:** It's a tutorial-friendly level with generous budget and only trees + ponds available

## How to Play (3 Steps per Level)

### 1. Briefing Phase
- Read the scenario and budget
- Click **"Start Building"** button

### 2. Build Phase
- **Click a tile type** in the palette (left side) to select it
- **Click the grid** to place it
- **Right-click** to remove (50% refund)
- **Watch your budget** at the top—placements are deducted
- Click **"▶ Run Storm"** when ready

### 3. Storm Phase
- **Watch the animation** (60 ticks, ~6 seconds at normal speed)
- **Blue overlay** shows water depth (darker = deeper)
- **Parameter meters** show happiness, tree health, and river health in real-time
- You can't click during the storm—just watch!

### 4. Results Phase
- **Score** and **stars** (1–3)
- **Damage dealt** vs. the cap
- **What you learned** — an educational card explaining the mechanics
- **"Retry"** to try again, or **"→ Next Level"** if you passed

## Win Condition

✅ **Pass** if:
- Total damage is **below the damage cap** (shown in briefing)
- You stayed **within budget**

Only passing unlocks the next level!

## Quick Tips

1. **Trees** are the cheapest green infrastructure; great for learning
2. **Wetlands** absorb the most water and buffer the river
3. **Retention ponds** store huge amounts but cost more
4. **Levees** block water but concentrate it elsewhere—use strategically
5. **Permeable pavement** is a "grey-green" alternative to roads
6. **Spreading solutions across the map** is better than concentrating all water in one spot (forces players to learn diverse approaches)

## Balancing: Key Constants to Tweak

Open **`config.js`** and find the `LEVELS` array. For each level, adjust:

### Make it Easier:
- Increase `budget` (more money to spend)
- Decrease `rainRate` or `riverInflow` (less water)
- Increase `damageCapForPass` (more damage allowed)
- Decrease tile `cost` (cheaper to build)

### Make it Harder:
- Decrease `budget` (less money)
- Increase `rainRate` or `riverInflow` (more water)
- Decrease `damageCapForPass` (stricter damage limit)
- Increase tile `maintenance` (long-term costs compound)
- Decrease `absorbCapacity` on green tiles (solutions saturate faster)

### Example: Difficulty Progression

```javascript
// Level 1 (Tutorial)
rainRate: 0.15,
budget: 800,
damageCapForPass: 50,
availableTiles: ['tree', 'pond'],

// Level 2 (Growing)
rainRate: 0.25,
budget: 900,
damageCapForPass: 60,
availableTiles: ['tree', 'pond', 'levee', 'permeable'],

// Level 3 (Serious)
rainRate: 0.35,
budget: 950,
damageCapForPass: 80,
availableTiles: ['tree', 'pond', 'levee', 'permeable', 'wetland'],

// Level 4 (Extreme)
rainRate: 0.45,
budget: 1200,
damageCapForPass: 100,
availableTiles: ['tree', 'pond', 'levee', 'permeable', 'wetland', 'road'],
```

## File Guide

| File | Purpose |
|------|---------|
| **index.html** | Main page; canvas, UI, script includes |
| **style.css** | Layout, colors, responsive design |
| **config.js** | ALL constants: tiles, costs, levels, rainfall, scoring |
| **sim.js** | Water physics (no DOM access) |
| **game.js** | Game state, phases, scoring, level progression |
| **render.js** | Canvas drawing, UI updates |
| **main.js** | Event wiring, game loop |
| **README.md** | Full documentation |

## Troubleshooting

**Nothing shows up?**
- Check browser console (F12 → Console) for errors
- Ensure all .js files are in the same folder as index.html
- Try a different browser

**Storm runs too fast/slow?**
- Adjust the interval in main.js: `gameLoopInterval = setInterval(() => { ... }, 100);`
- Smaller number = faster (e.g., 50 for 20 FPS)
- Larger number = slower (e.g., 200 for 5 FPS)

**Water doesn't flow correctly?**
- Check `SIM.floodThreshold`, `absorbRate`, `absorbCapacity` in config.js
- Verify levee placement; they block flow

**Scoring seems off?**
- Adjust weights in `SCORING` section of config.js
- Tweak `star1Threshold`, `star2Threshold`, `star3Threshold`

## Example: Custom Level

Add this to the `LEVELS` array in config.js:

```javascript
{
  id: 'level5',
  name: 'Your Custom Level',
  description: 'Design your own challenge!',
  briefing: 'A massive hurricane is coming. Everything is at stake.',
  
  gridSeed: 99,
  numHouses: 20,
  numRiverCells: 8,
  riverStartPos: { x: 16, y: 0 },
  
  budget: 1500,
  rainRate: 0.6,           // Very intense!
  riverInflow: 0.8,
  rainRampUp: 3,
  rainPeak: 40,
  rainRampDown: 17,
  
  damageCapForPass: 120,
  
  availableTiles: ['tree', 'pond', 'levee', 'permeable', 'wetland', 'road'],
  showTutorialHints: false,
}
```

---

**Have fun teaching sustainable flood management!** 🌳🌊
