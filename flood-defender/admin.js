/**
 * FLOOD DEFENDER — Admin Terrain Editor
 *
 * Activation: Ctrl+Shift+A  (or Cmd+Shift+A on Mac)
 * Hidden from students — no visible UI trigger.
 *
 * Lets the designer paint terrain (grass / river / house / elevation) on a
 * 32×32 grid, export the result as JSON, and apply it to the live game.
 */

const Admin = (function () {
  const W = 32, H = 32, CS = 16; // cell size in admin canvas (px)

  let active       = false;
  let adminGrid    = null;   // 32×32 [{type, elevation}]
  let selectedTool = 'grass';
  let isPainting   = false;
  let panelEl      = null;
  let canvasEl     = null;
  let ctx          = null;

  const TOOLS = [
    { id: 'grass',  label: 'Grass',   color: '#7cb342' },
    { id: 'river',  label: 'River',   color: '#1565c0' },
    { id: 'house',  label: 'House',   color: '#c62828' },
    { id: 'elev0',  label: 'Elev 0',  color: '#37474f', note: 'Low ground (dark)' },
    { id: 'elev1',  label: 'Elev 1',  color: '#78909c', note: 'Mid ground' },
    { id: 'elev2',  label: 'Elev 2',  color: '#cfd8dc', note: 'High ground (light)' },
  ];

  const TILE_COLORS = {
    grass: '#7cb342', river: '#1565c0', house: '#c62828',
    tree: '#2e7d32', wetland: '#00838f', raingarden: '#8bc34a',
    pond: '#0277bd', permeable: '#a1887f', levee: '#5d4037',
  };

  // ── Initialise (called once after DOM ready) ─────────────────────────────────
  function init() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        toggle();
      }
    });
  }

  function toggle() {
    active ? exit() : enter();
  }

  // ── Enter admin mode ─────────────────────────────────────────────────────────
  function enter() {
    active = true;

    // Snapshot current elevation grid
    const baseGrid = (typeof game !== 'undefined') ? game.getElevationGrid() : null;
    adminGrid = [];
    for (let y = 0; y < H; y++) {
      adminGrid.push([]);
      for (let x = 0; x < W; x++) {
        const cell = baseGrid ? baseGrid[y][x] : { type: 'grass', elevation: 1 };
        adminGrid[y].push({ type: cell.type, elevation: cell.elevation });
      }
    }
    buildPanel();
  }

  // ── Exit admin mode ──────────────────────────────────────────────────────────
  function exit() {
    active = false;
    if (panelEl) { panelEl.remove(); panelEl = null; }
    canvasEl = null;
    ctx      = null;
  }

  // ── Apply admin grid to the live game (resets to briefing) ──────────────────
  function applyToGame() {
    if (typeof game === 'undefined') { alert('Game not initialised.'); return; }

    const cells = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        cells.push({ x, y, type: adminGrid[y][x].type, elevation: adminGrid[y][x].elevation });
      }
    }
    game._adminCustomGrid = cells;
    game.reset();
    if (typeof renderer !== 'undefined') renderer.render();
    exit();
  }

  // ── Build the panel DOM ──────────────────────────────────────────────────────
  function buildPanel() {
    if (panelEl) panelEl.remove();

    panelEl = document.createElement('div');
    panelEl.id = 'admin-panel';
    Object.assign(panelEl.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: '9999',
      background: '#1e293b',
      border: '2px solid #facc15',
      borderRadius: '12px',
      padding: '14px',
      color: '#e2e8f0',
      fontFamily: "'Inter', sans-serif",
      fontSize: '12px',
      boxShadow: '0 24px 64px rgba(0,0,0,0.75)',
      maxHeight: '95vh',
      overflowY: 'auto',
      width: (W * CS + 28) + 'px',
    });

    panelEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <strong style="color:#facc15;font-size:13px">⚙ Admin — Terrain Editor</strong>
        <small style="opacity:0.55">Ctrl+Shift+A to close</small>
        <button id="adm-close" style="${btnStyle('#475569')}">✕</button>
      </div>

      <div id="adm-tools" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px"></div>

      <canvas id="adm-canvas" width="${W * CS}" height="${H * CS}"
        style="display:block;border:1px solid #475569;border-radius:6px;cursor:crosshair;margin-bottom:8px"></canvas>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <button id="adm-apply"  style="${btnStyle('#16a34a')}">▶ Apply to Game</button>
        <button id="adm-export" style="${btnStyle('#0284c7')}">⬇ Export JSON</button>
        <button id="adm-import" style="${btnStyle('#7c3aed')}">⬆ Import JSON</button>
        <button id="adm-clear"  style="${btnStyle('#dc2626')}">⬜ Clear</button>
      </div>

      <textarea id="adm-json" rows="4" placeholder="Paste exported JSON here, then click Import…"
        style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #475569;
               border-radius:6px;color:#cbd5e1;padding:6px;font-family:monospace;font-size:11px;
               resize:vertical"></textarea>
      <small style="opacity:0.5;display:block;margin-top:4px">
        Paste JSON into a level's <code>customGrid</code> field in config.js to make it permanent.
      </small>
    `;

    document.body.appendChild(panelEl);

    // Tool buttons
    const toolsDiv = document.getElementById('adm-tools');
    TOOLS.forEach(t => {
      const b = document.createElement('button');
      b.textContent  = t.label;
      b.dataset.tool = t.id;
      b.title        = t.note || t.label;
      Object.assign(b.style, {
        padding: '4px 8px',
        background: t.color,
        color: '#fff',
        border: '2px solid ' + (selectedTool === t.id ? '#facc15' : 'transparent'),
        borderRadius: '5px',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: '600',
      });
      b.addEventListener('click', () => { selectedTool = t.id; refreshToolBtns(); });
      toolsDiv.appendChild(b);
    });

    // Canvas
    canvasEl = document.getElementById('adm-canvas');
    ctx      = canvasEl.getContext('2d');
    drawGrid();

    canvasEl.addEventListener('mousedown', e => { isPainting = true; paint(e); });
    canvasEl.addEventListener('mousemove', e => { if (isPainting) paint(e); });
    document.addEventListener('mouseup',   () => { isPainting = false; }, { once: false });

    // Prevent panel drag from firing paint on canvas
    panelEl.addEventListener('mouseup', () => { isPainting = false; });

    document.getElementById('adm-close').addEventListener('click', exit);
    document.getElementById('adm-apply').addEventListener('click', applyToGame);
    document.getElementById('adm-export').addEventListener('click', exportJSON);
    document.getElementById('adm-import').addEventListener('click', importJSON);
    document.getElementById('adm-clear').addEventListener('click', clearGrid);
  }

  function btnStyle(bg) {
    return `padding:5px 10px;background:${bg};color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600`;
  }

  function refreshToolBtns() {
    const btns = document.querySelectorAll('#adm-tools button');
    btns.forEach(b => {
      b.style.borderColor = b.dataset.tool === selectedTool ? '#facc15' : 'transparent';
    });
  }

  // ── Painting ─────────────────────────────────────────────────────────────────
  function cellFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    const sx   = W * CS / rect.width;
    const sy   = H * CS / rect.height;
    const x    = Math.floor((e.clientX - rect.left) * sx / CS);
    const y    = Math.floor((e.clientY - rect.top)  * sy / CS);
    return (x >= 0 && x < W && y >= 0 && y < H) ? { x, y } : null;
  }

  function paint(e) {
    const cell = cellFromEvent(e);
    if (!cell) return;
    const { x, y } = cell;
    if      (selectedTool === 'elev0') adminGrid[y][x].elevation = 0;
    else if (selectedTool === 'elev1') adminGrid[y][x].elevation = 1;
    else if (selectedTool === 'elev2') adminGrid[y][x].elevation = 2;
    else                               adminGrid[y][x].type       = selectedTool;
    drawGrid();
  }

  function clearGrid() {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        adminGrid[y][x] = { type: 'grass', elevation: 1 };
    drawGrid();
  }

  // ── Canvas drawing ────────────────────────────────────────────────────────────
  function drawGrid() {
    if (!ctx) return;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cell  = adminGrid[y][x];
        const color = TILE_COLORS[cell.type] || '#7cb342';

        ctx.fillStyle = color;
        ctx.fillRect(x * CS, y * CS, CS, CS);

        // Elevation shade
        if (cell.elevation === 0) {
          ctx.fillStyle = 'rgba(0,0,60,0.32)';
          ctx.fillRect(x * CS, y * CS, CS, CS);
        } else if (cell.elevation === 2) {
          ctx.fillStyle = 'rgba(255,255,200,0.28)';
          ctx.fillRect(x * CS, y * CS, CS, CS);
        }

        // Grid lines
        ctx.strokeStyle = 'rgba(148,163,184,0.12)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(x * CS, y * CS, CS, CS);
      }
    }
  }

  // ── Import / Export ──────────────────────────────────────────────────────────
  function exportJSON() {
    // Only emit non-default cells (saves space; sim fills rest with grass elev=0)
    const cells = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = adminGrid[y][x];
        if (c.type !== 'grass' || c.elevation !== 0)
          cells.push({ x, y, type: c.type, elevation: c.elevation });
      }
    }
    const json = JSON.stringify({ width: W, height: H, cells }, null, 2);
    const ta   = document.getElementById('adm-json');
    ta.value   = json;
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
  }

  function importJSON() {
    const ta = document.getElementById('adm-json');
    try {
      const data = JSON.parse(ta.value);
      clearGrid();
      for (const c of (data.cells || [])) {
        if (c.x >= 0 && c.x < W && c.y >= 0 && c.y < H) {
          adminGrid[c.y][c.x].type      = c.type      || 'grass';
          adminGrid[c.y][c.x].elevation = c.elevation !== undefined ? c.elevation : 0;
        }
      }
      drawGrid();
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  }

  return { init };
})();

// Boot after the game is ready
document.addEventListener('DOMContentLoaded', () => Admin.init());
