/**
 * Cesium viewer app: URL params, cesiumFlyTo API, postMessage, Google Places.
 */
(function () {
  "use strict";

  const { DEFAULTS, BOUNDS } = typeof CONFIG !== "undefined" ? CONFIG : {
    DEFAULTS: { flyToHeight: 1000, flyToDuration: 1.2, placesFlyToHeight: 1500 },
    BOUNDS: { lat: { min: -90, max: 90 }, lon: { min: -180, max: 180 }, height: { min: 100, max: 10000000 } },
  };

  const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

  let viewer = null;
  let markerEntity = null;
  let rainParticleSystem = null;
  /** Cesium ImageryLayer for precipitation/radar overlay (RainViewer) */
  let precipitationLayer = null;
  /** Last fetched hourly data for time slider: { lat, lon, time[], precipitation[] } */
  let lastHourlyData = null;
  /** Whether the weather data table (Time/Rain/Temp/etc.) is minimized */
  let weatherTableCollapsed = false;
  /** Last rendered hourly data for graph: { time[], temperature_2m[], precipitation[], ... } */
  let lastRenderedHourlyData = null;
  /** Graph x-axis range in hours: 12, 24, 72 (3d), 168 (7d) */
  let graphTimeRangeHours = 24;

  // --- Flood simulation (test-only, does not depend on any API) ----------------
  // Center coordinate for the flood test area (kept minimal and explicit)
  const FLOOD_CENTER = {
    latitude: 3.362314160759136,
    longitude: 101.3447474675057,
  };
  const FLOOD_OFFSET_DEG = 0.003; // +/- offset for the total flood area (expanded)
  // Grid configuration (make dynamic for future scaling)
  let GRID_ROWS = 32;
  let GRID_COLS = 32;
  const GRID_BASE_HEIGHT = 75; // meters elevation for all grid boxes (reduced by 50%)

  // Helper: compute rectangle degrees [west, south, east, north] around center
  function computeFloodBounds() {
    const west = FLOOD_CENTER.longitude - FLOOD_OFFSET_DEG;
    const east = FLOOD_CENTER.longitude + FLOOD_OFFSET_DEG;
    const south = FLOOD_CENTER.latitude - FLOOD_OFFSET_DEG;
    const north = FLOOD_CENTER.latitude + FLOOD_OFFSET_DEG;
    return { west: west, south: south, east: east, north: north };
  }

  // Global flood entity reference (null when no flood shown)
  let floodEntity = null;
  // Flood grid zones (will be generated; default to 32x32 → 1024 zones)
  let floodZones = [];

  /**
   * Initialize floodZones array dividing the total bounding box into 5x5 cells.
   * Each zone: { id, bounds: { west, south, east, north }, entity: null }
   */
  function initFloodZones() {
    // Reset array
    floodZones = [];

    // Compute expanded bounding box: start from the configured half-offset, then
    // expand outward by one previous 5x5 cell width on each side.
    const baseHalf = FLOOD_OFFSET_DEG; // previous half-width (0.003)
    const previousCellWidth = (2 * baseHalf) / 5.0;
    const expandedHalf = baseHalf + previousCellWidth;

    const totalWest = FLOOD_CENTER.longitude - expandedHalf;
    const totalEast = FLOOD_CENTER.longitude + expandedHalf;
    const totalSouth = FLOOD_CENTER.latitude - expandedHalf;
    const totalNorth = FLOOD_CENTER.latitude + expandedHalf;

    const rows = GRID_ROWS, cols = GRID_COLS;
    const cellWidth = (totalEast - totalWest) / cols;
    const cellHeight = (totalNorth - totalSouth) / rows;

    let id = 1;
    // Row ordering: row 0 -> northernmost. IDs go left→right, top→bottom.
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const west = totalWest + col * cellWidth;
        const east = west + cellWidth;
        const south = totalNorth - (row + 1) * cellHeight;
        const north = south + cellHeight;
        floodZones.push({ id: id, bounds: { west: west, south: south, east: east, north: north }, outlineEntity: null, floodEntity: null, currentFloodDelta: 0 });
        id++;
      }
    }
  }

  /**
   * Draws the zone grid as transparent white outlines (no fill).
   * Replaces any previous zone entities to avoid duplicates.
   */
  function renderZoneGrid() {
    if (!viewer) return;
    for (let i = 0; i < floodZones.length; i++) {
      const z = floodZones[i];
      // Remove existing outline entity if present
      if (z.outlineEntity) {
        try { viewer.entities.remove(z.outlineEntity); } catch (e) { /* ignore */ }
        z.outlineEntity = null;
      }
      const rect = Cesium.Rectangle.fromDegrees(z.bounds.west, z.bounds.south, z.bounds.east, z.bounds.north);
      // Create elevated rectangle with faint fill and visible yellow outline
      z.outlineEntity = viewer.entities.add({
        name: 'Flood zone ' + z.id,
        rectangle: {
          coordinates: rect,
          material: Cesium.Color.WHITE.withAlpha(0.05),
          fill: true,
          outline: true,
          outlineColor: Cesium.Color.YELLOW,
          outlineWidth: 3,
          height: GRID_BASE_HEIGHT,
        },
      });
      // Apply admin selection visuals if any
      try { if (window.gridManager) window.gridManager.updateZoneVisual(z); } catch (e) { /* ignore */ }
    }
    try { viewer.scene.requestRender(); } catch (e) { /* ignore */ }
  }

  /**
   * Apply flood surface to given zone IDs with severity string.
   * zoneIds: array of numeric IDs (1-25). severity: "moderate"|"severe"|"none".
   */
  // Animate a zone's flood surface to target delta (meters above GRID_BASE_HEIGHT)
  function animateZoneFlood(z, targetDelta, durationMs) {
    if (!z) return;
    durationMs = typeof durationMs === 'number' ? durationMs : 800;
    const targetHeight = GRID_BASE_HEIGHT + (Number(targetDelta) || 0);
    // Ensure floodEntity exists
    if (!z.floodEntity) {
      const rect = Cesium.Rectangle.fromDegrees(z.bounds.west, z.bounds.south, z.bounds.east, z.bounds.north);
      z.floodEntity = viewer.entities.add({
        name: 'Flood overlay ' + z.id,
        rectangle: {
          coordinates: rect,
          material: Cesium.Color.BLUE.withAlpha(0.5),
          fill: true,
          outline: false,
          height: GRID_BASE_HEIGHT + (z.currentFloodDelta || 0),
        },
      });
    }

    const startHeight = (z.floodEntity.rectangle && z.floodEntity.rectangle.height) || (GRID_BASE_HEIGHT + (z.currentFloodDelta || 0));
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
      const current = startHeight + (targetHeight - startHeight) * ease;
      try {
        if (z.floodEntity && z.floodEntity.rectangle) z.floodEntity.rectangle.height = current;
        viewer.scene.requestRender();
      } catch (e) { /* ignore */ }
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Finalize
        z.currentFloodDelta = targetHeight - GRID_BASE_HEIGHT;
        // If target delta is 0, remove floodEntity
        if (!z.currentFloodDelta) {
          try { viewer.entities.remove(z.floodEntity); } catch (e) { /* ignore */ }
          z.floodEntity = null;
        }
      }
    }
    requestAnimationFrame(step);
  }
  // expose for other modules
  try { window.animateZoneFlood = animateZoneFlood; } catch (e) { /* ignore */ }

  function findZoneContainingPoint(lat, lon) {
    if (!floodZones || !floodZones.length) return null;
    for (let i = 0; i < floodZones.length; i++) {
      const z = floodZones[i];
      const b = z.bounds;
      if (lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east) return z;
    }
    return null;
  }

  /**
   * Raise/clear flood on specified zone IDs.
   * zoneIds: array of numbers or comma-separated string
   * level: '30'/'60'/'100' = rain tiers (0.1/0.5/1 mm); animation depth 0.1/0.5/1 m
   */
  function floodZonesByIds(zoneIds, level) {
    if (!viewer) return;
    // Normalize zoneIds to array of numbers
    let ids = Array.isArray(zoneIds) ? zoneIds.map(Number) : String(zoneIds).split(/\s*,\s*/).map(Number);
    ids = ids.filter(function (n) { return !isNaN(n); });

    // If admin mode is enabled and configuration exists for this level, use configured zones instead
    try {
      if (window.adminMode && window.adminMode.isEnabled && window.adminMode.isEnabled()) {
        const cfg = window.floodConfig && window.floodConfig.getZones(level);
        if (Array.isArray(cfg) && cfg.length) ids = cfg.slice();
      }
    } catch (e) { /* ignore */ }

    if (!ids.length) return;
    const duration = 700;
    ids.forEach(function (zid) {
      const z = floodZones.find(function (zz) { return zz.id === Number(zid); });
      if (!z) return;
      if (level === 'none') {
        animateZoneFlood(z, 0, duration);
        return;
      }
      // Rain tiers map to flood animation height (m): 0.1 / 0.5 / 1
      let meters = null;
      if (level === '30') meters = 0.1;
      else if (level === '60') meters = 0.5;
      else if (level === '100') meters = 1.0;
      else if (level === '0.5' || level === '0.5m' || level === 0.5) meters = 0.5;
      else if (level === '1' || level === '1m' || level === 1) meters = 1.0;
      else if (!isNaN(Number(level))) meters = Number(level);
      if (meters == null) meters = 0.5;
      animateZoneFlood(z, meters, duration);
    });
  }

  /**
   * Evaluate flood risk level from a synthetic rain intensity value.
   * Returns one of: "none", "moderate", "severe".
   */
  function evaluateFloodRisk(rainIntensity) {
    const v = Number(rainIntensity) || 0;
    if (v < 20) return "none";
    if (v >= 20 && v < 50) return "moderate";
    return "severe";
  }

  /**
   * Update flood visualization according to level string.
   * - "none": remove entity
   * - "moderate": 5m
   * - "severe": 15m
   * Reuses existing entity when present; never creates duplicates.
   */
  function updateFloodVisualization(level) {
    console.log("updateFloodVisualization entered; level:", level);
    if (!viewer) {
      console.warn("updateFloodVisualization: viewer not initialized");
      return;
    }

    if (level === "none") {
      if (floodEntity) {
        console.log("updateFloodVisualization: removing flood entity");
        try { viewer.entities.remove(floodEntity); } catch (e) { /* ignore */ }
        floodEntity = null;
      } else {
        console.log("updateFloodVisualization: no flood entity to remove");
      }
      return;
    }

    // Map severity to a flat water opacity (do not create an extruded volume)
    let opacity = 0.4; // default / moderate
    if (level === "moderate") opacity = 0.4;
    if (level === "severe") opacity = 0.6;

    const b = computeFloodBounds();

    // Build a flat polygon from the bounding box corners and clamp it to the terrain
    const coords = [
      b.west, b.south,
      b.east, b.south,
      b.east, b.north,
      b.west, b.north,
    ];

    if (!floodEntity) {
      console.log("updateFloodVisualization: creating flat flood surface with opacity", opacity);
      floodEntity = viewer.entities.add({
        name: "Flood test",
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
          material: Cesium.Color.BLUE.withAlpha(opacity),
          // Clamp to ground so the surface follows terrain rather than float
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      try { viewer.zoomTo(floodEntity); } catch (e) { /* ignore */ }
      viewer.scene.requestRender();
    } else {
      console.log("updateFloodVisualization: updating existing flood surface opacity", opacity);
      try {
        if (floodEntity.polygon) {
          floodEntity.polygon.material = Cesium.Color.BLUE.withAlpha(opacity);
        } else if (floodEntity.rectangle) {
          // If entity was previously a rectangle, replace it with a polygon
          try { viewer.entities.remove(floodEntity); } catch (e) { /* ignore */ }
          floodEntity = viewer.entities.add({
            name: "Flood test",
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
              material: Cesium.Color.BLUE.withAlpha(opacity),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        }
        viewer.scene.requestRender();
      } catch (e) {
        console.error("Failed to update flood surface:", e);
      }
    }
  }

  /**
   * High-level helper to simulate a flood value (synthetic input).
   * Calls evaluateFloodRisk and then updateFloodVisualization.
   */
  function simulateFlood(value) {
    console.log("simulateFlood called with value:", value);
    const level = evaluateFloodRisk(value);
    console.log("evaluateFloodRisk ->", level);

    // Update the flood surface according to evaluated level (no extruded debug box)
    updateFloodVisualization(level);
  }

  // Expose simulate function to global for button onclicks / console
  window.simulateFlood = simulateFlood;
  // ---------------------------------------------------------------------------

  function makeRainParticleImage() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 6;
      canvas.height = 36;
      const ctx = canvas.getContext("2d");
      if (!ctx) return getRainFallbackImage();
      const g = ctx.createLinearGradient(0, 0, 0, 36);
      g.addColorStop(0, "rgba(220,235,255,0.95)");
      g.addColorStop(0.5, "rgba(200,220,255,0.85)");
      g.addColorStop(1, "rgba(180,210,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 6, 36);
      return canvas.toDataURL("image/png");
    } catch (e) {
      return getRainFallbackImage();
    }
  }
  function getRainFallbackImage() {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  }
  const RAIN_IMAGE = makeRainParticleImage();

  function clamp(value, min, max) {
    const n = Number(value);
    if (isNaN(n)) return undefined;
    return Math.max(min, Math.min(max, n));
  }

  function parseCoord(value, bounds) {
    const n = Number(value);
    if (value == null || value === "" || isNaN(n)) return undefined;
    return clamp(n, bounds.min, bounds.max);
  }

  /**
   * Fly camera to lon/lat (radians or degrees), optional height. Optionally show a marker.
   * @param {number} longitude
   * @param {number} latitude
   * @param {number} [heightMeters]
   * @param {boolean} [addMarker=true]
   * @returns {boolean} true if fly was performed
   */
  function flyToCoordinates(longitude, latitude, heightMeters, addMarker) {
    const lon = parseCoord(longitude, BOUNDS.lon);
    const lat = parseCoord(latitude, BOUNDS.lat);
    if (lon === undefined || lat === undefined) return false;

    const height = heightMeters != null
      ? (clamp(Number(heightMeters), BOUNDS.height.min, BOUNDS.height.max) ?? DEFAULTS.flyToHeight)
      : DEFAULTS.flyToHeight;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      duration: DEFAULTS.flyToDuration,
    });

    if (addMarker !== false) {
      if (markerEntity) viewer.entities.remove(markerEntity);
      markerEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        point: { pixelSize: 12, color: Cesium.Color.CORNFLOWERBLUE },
      });
    }
    return true;
  }

  /**
   * Public API: cesiumFlyTo(latitude, longitude [, heightMeters [, addMarker]]).
   * Called from same window or from parent/iframe via postMessage.
   */
  function cesiumFlyTo(lat, lon, heightMeters, addMarker) {
    return flyToCoordinates(lon, lat, heightMeters, addMarker);
  }

  function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get("lat");
    const lon = params.get("lon");
    const height = params.get("height");
    if (lat != null && lon != null) {
      flyToCoordinates(parseFloat(lon), parseFloat(lat), height != null ? parseFloat(height) : undefined, true);
    }
  }

  function initAuthPanel() {
    var panel = document.getElementById('authPanel');
    var loggedOut = document.getElementById('authLoggedOut');
    var loggedIn = document.getElementById('authLoggedIn');
    var authUserEmail = document.getElementById('authUserEmail');
    var authError = document.getElementById('authError');
    var authUsername = document.getElementById('authUsername');
    var authPin = document.getElementById('authPin');
    if (!panel || !window.supabaseAuth || !window.supabaseAuth.isReady()) return;

    function usernameToSupabaseEmail(raw) {
      var s = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (s.length < 2) return null;
      return s + '@flood-app.local';
    }
    function pinToSupabasePassword(pin) {
      var d = String(pin || '').replace(/\D/g, '');
      if (d.length !== 4) return null;
      return '00' + d;
    }
    panel.style.display = 'block';

    function showError(msg) {
      if (authError) { authError.textContent = msg || ''; authError.style.display = msg ? 'block' : 'none'; }
    }
    function updateAuthUI() {
      var user = window.supabaseAuth.getCurrentUser();
        if (user) {
        if (loggedOut) loggedOut.style.display = 'none';
        if (loggedIn) loggedIn.style.display = 'block';
        if (authUserEmail) {
          var em = user.email || '';
          authUserEmail.textContent = em.indexOf('@flood-app.local') !== -1 ? em.replace(/@flood-app\.local$/, '') : (em || 'Logged in');
        }
        showError('');
      } else {
        if (loggedOut) loggedOut.style.display = 'block';
        if (loggedIn) loggedIn.style.display = 'none';
        if (authUserEmail) authUserEmail.textContent = '';
      }
    }
    function refreshZonesAfterAuth() {
      try {
        if (window.floodConfig && window.floodConfig.pullFromSupabase) {
          window.floodConfig.pullFromSupabase(function (ok) {
            try { if (window.gridManager && window.gridManager.updateAllVisuals) window.gridManager.updateAllVisuals(); } catch (e) { /* ignore */ }
          });
        }
      } catch (e) { /* ignore */ }
    }

    window.supabaseAuth.getAuthForApi(function () {
      updateAuthUI();
      refreshZonesAfterAuth();
    });
    window.supabaseAuth.onAuthChange(function () {
      window.supabaseAuth.getAuthForApi(function () {
        updateAuthUI();
        refreshZonesAfterAuth();
      });
    });

    if (document.getElementById('authSignIn')) {
      document.getElementById('authSignIn').addEventListener('click', function () {
        var email = usernameToSupabaseEmail(authUsername && authUsername.value);
        var password = pinToSupabasePassword(authPin && authPin.value);
        if (!email) { showError('Username: letters, numbers, _ or - (min 2 chars)'); return; }
        if (!password) { showError('Enter exactly 4 digits for PIN'); return; }
        showError('');
        window.supabaseAuth.signIn(email, password, function (err) {
          if (err) showError(err); else updateAuthUI();
        });
      });
    }
    if (document.getElementById('authSignUp')) {
      document.getElementById('authSignUp').addEventListener('click', function () {
        var email = usernameToSupabaseEmail(authUsername && authUsername.value);
        var password = pinToSupabasePassword(authPin && authPin.value);
        if (!email) { showError('Username: letters, numbers, _ or - (min 2 chars)'); return; }
        if (!password) { showError('Enter exactly 4 digits for PIN'); return; }
        showError('');
        window.supabaseAuth.signUp(email, password, function (err) {
          if (err) showError(err); else updateAuthUI();
        });
      });
    }
    if (document.getElementById('authSignOut')) {
      document.getElementById('authSignOut').addEventListener('click', function () {
        showError('');
        window.supabaseAuth.signOut();
      });
    }
  }

  // Initialize flood UI controls inside the coords/weather panel
  function initFloodControls() {
    const btn05m = document.getElementById('btnFlood05m');
    const btn1m = document.getElementById('btnFlood1m');
    const btnClear = document.getElementById('btnClearFlood');
    const btnToggle = document.getElementById('btnToggleGrid');
    let gridVisible = true;
    if (btn05m) btn05m.addEventListener('click', function () {
      try { if (window.floodState) window.floodState.trigger('0.5'); } catch (e) { /* ignore */ }
    });
    if (btn1m) btn1m.addEventListener('click', function () {
      try { if (window.floodState) window.floodState.trigger('1'); } catch (e) { /* ignore */ }
    });
    if (btnClear) btnClear.addEventListener('click', function () {
      try { if (window.floodState) window.floodState.clearAll(); } catch (e) { /* ignore */ }
    });
    if (btnToggle) btnToggle.addEventListener('click', function () {
      gridVisible = !gridVisible;
      if (!gridVisible) {
        // remove outlines
        floodZones.forEach(function (z) {
          if (z.outlineEntity) {
            try { viewer.entities.remove(z.outlineEntity); } catch (e) { /* ignore */ }
            z.outlineEntity = null;
          }
        });
        try { viewer.scene.requestRender(); } catch (e) { /* ignore */ }
      } else {
        renderZoneGrid();
      }
    });

    // Minimize data table + Table/Graph tab (delegation)
    const weatherResultEl = document.getElementById('weatherResult');
    if (weatherResultEl) {
      weatherResultEl.addEventListener('click', function (e) {
        var target = e.target;
        if (target.id === 'weatherTableToggleBtn' || (target.closest && target.closest('#weatherTableToggleBtn'))) {
          var btn = target.id === 'weatherTableToggleBtn' ? target : target.closest('#weatherTableToggleBtn');
          var section = document.getElementById('weatherDataTableSection');
          if (section && btn) {
            section.classList.toggle('weather-data-table-section--collapsed');
            weatherTableCollapsed = section.classList.contains('weather-data-table-section--collapsed');
            btn.textContent = weatherTableCollapsed ? '▴ Table' : '▾ Table';
          }
          return;
        }
        var tab = target.classList && target.classList.contains('hourly-tab') ? target : (target.closest && target.closest('.hourly-tab'));
        if (tab && tab.dataset && tab.dataset.tab) {
          var tabName = tab.dataset.tab;
          var container = tab.closest('#weatherDataTableSection');
          if (!container) return;
          var tabs = container.querySelectorAll('.hourly-tab');
          var tablePanel = document.getElementById('hourlyTablePanel');
          var graphPanel = document.getElementById('hourlyGraphPanel');
          var canvas = document.getElementById('hourlyGraphCanvas');
          for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('hourly-tab--active', tabs[i] === tab);
          if (tablePanel) tablePanel.classList.toggle('hourly-panel--active', tabName === 'table');
          if (graphPanel) graphPanel.classList.toggle('hourly-panel--active', tabName === 'graph');
          if (tabName === 'graph' && canvas) drawHourlyChart(canvas);
          return;
        }
      });
      weatherResultEl.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'graphRangeSelect') {
          var can = document.getElementById('hourlyGraphCanvas');
          if (can) drawHourlyChart(can);
        }
      });
    }

    // Hide/show entire Master Control panel
    const panelMinBtn = document.getElementById('panelMinimizeBtn');
    const coordsPanel = document.getElementById('coordsWeatherPanel');
    const panelExpandBtn = document.getElementById('panelExpandBtn');
    if (panelMinBtn && coordsPanel && panelExpandBtn) {
      panelMinBtn.addEventListener('click', function () {
        coordsPanel.style.display = 'none';
        coordsPanel.setAttribute('aria-hidden', 'true');
        panelExpandBtn.style.display = 'block';
      });
      panelExpandBtn.addEventListener('click', function () {
        coordsPanel.style.display = '';
        coordsPanel.setAttribute('aria-hidden', 'false');
        panelExpandBtn.style.display = 'none';
      });
    }

    // Draggable Master Control panel (drag by header)
    if (coordsPanel) {
      const header = coordsPanel.querySelector('.coords-weather__header');
      if (header) {
        header.addEventListener('mousedown', function (e) {
          if (e.target.closest && e.target.closest('button')) return;
          e.preventDefault();
          const rect = coordsPanel.getBoundingClientRect();
          const startX = e.clientX - rect.left;
          const startY = e.clientY - rect.top;
          coordsPanel.style.bottom = 'auto';
          coordsPanel.style.left = rect.left + 'px';
          coordsPanel.style.top = rect.top + 'px';
          function onMove(e2) {
            const left = e2.clientX - startX;
            const top = e2.clientY - startY;
            coordsPanel.style.left = Math.max(0, left) + 'px';
            coordsPanel.style.top = Math.max(0, top) + 'px';
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
    }

    // Admin button is wired in adminMode.init() (called once at startup)
  }

  const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

  const gravityScratch = new Cesium.Cartesian3();
  function rainUpdateCallback(p, dt) {
    Cesium.Cartesian3.normalize(p.position, gravityScratch);
    Cesium.Cartesian3.multiplyByScalar(gravityScratch, -8000 * dt, gravityScratch);
    p.velocity = Cesium.Cartesian3.add(p.velocity, gravityScratch, p.velocity);
  }

  /**
   * Update or remove rain particle effect based on current precipitation (mm).
   * No rain when precipitation is 0; intensity scales with mm (light -> minimal, heavy -> lots).
   */
  function updateRainEffect(longitude, latitude, precipitationMm) {
    if (rainParticleSystem) {
      viewer.scene.primitives.remove(rainParticleSystem);
      rainParticleSystem = null;
    }
    const precip = Number(precipitationMm);
    if (!viewer || isNaN(precip) || precip <= 0) return;

    const heightM = 1500;
    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, heightM);
    const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const pitchDown = Cesium.Matrix4.fromRotation(
      Cesium.Matrix3.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(0, Cesium.Math.PI, 0))
    );

    const emissionRate = Math.min(1200, Math.max(200, 200 + precip * 150));
    const speed = 22 + Math.min(28, precip * 5);
    const emitterRadiusM = 4000;

    try {
      rainParticleSystem = viewer.scene.primitives.add(
        new Cesium.ParticleSystem({
          image: RAIN_IMAGE,
          minimumImageSize: new Cesium.Cartesian2(12, 56),
          maximumImageSize: new Cesium.Cartesian2(20, 80),
          startColor: new Cesium.Color(0.75, 0.88, 1.0, 0.92),
          endColor: new Cesium.Color(0.7, 0.85, 1.0, 0.3),
          startScale: 1.3,
          endScale: 0.5,
          particleLife: 3.2,
          minimumSpeed: speed,
          maximumSpeed: speed * 1.25,
          minimumParticleLife: 2.0,
          maximumParticleLife: 3.5,
          emissionRate: emissionRate,
          emitter: new Cesium.CircleEmitter(emitterRadiusM),
          modelMatrix: modelMatrix,
          emitterModelMatrix: pitchDown,
          lifetime: 999999,
          updateCallback: rainUpdateCallback,
        })
      );
      viewer.scene.requestRender();
    } catch (e) {
      console.error("Rain effect failed:", e);
    }
  }

  function weatherCodeToText(code) {
    const codes = {
      0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Foggy", 48: "Depositing rime fog",
      51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
      61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
      66: "Light freezing rain", 67: "Heavy freezing rain",
      71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
      77: "Snow grains", 80: "Slight rain showers", 81: "Rain showers", 82: "Heavy rain showers",
      85: "Slight snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Thunderstorm + heavy hail",
    };
    return codes[code] || "Unknown";
  }

  /**
   * Effective rain intensity (mm) for the rain animation from condition + precipitation.
   * Rainy conditions (drizzle, rain, showers, thunderstorm, snow) get at least a minimum intensity.
   */
  function getRainIntensityFromCondition(weatherCode, precipitationMm) {
    const code = Number(weatherCode);
    const precip = Number(precipitationMm);
    const p = !isNaN(precip) && precip >= 0 ? precip : 0;
    const minByCondition = {
      51: 0.3, 53: 0.5, 55: 0.8,
      61: 0.5, 63: 1.5, 65: 4,
      66: 0.8, 67: 2,
      80: 0.8, 81: 2, 82: 5,
      95: 4, 96: 6, 99: 8,
      71: 0.4, 73: 0.8, 75: 1.5, 77: 0.3, 85: 0.4, 86: 1,
    };
    const minP = minByCondition[code];
    if (minP == null) return p;
    return Math.max(p, minP);
  }

  function isRainyCondition(weatherCode) {
    const code = Number(weatherCode);
    if (isNaN(code)) return false;
    return getRainIntensityFromCondition(code, 0) > 0;
  }

  function showWeatherLoading() {
    const el = document.getElementById("weatherResult");
    if (!el) return;
    el.innerHTML = '<span class="loading">Loading weather…</span>';
    el.classList.remove("weather-error");
  }

  function showWeatherError(msg) {
    const el = document.getElementById("weatherResult");
    if (!el) return;
    el.innerHTML = '<span class="error">' + escapeHtml(msg) + "</span>";
    el.classList.add("weather-error");
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function formatHourlyTime(isoString) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
    const day = isToday ? "Today" : (isTomorrow ? "Tomorrow" : (d.getMonth() + 1) + "/" + d.getDate());
    const h = d.getHours();
    const hour = (h < 10 ? "0" : "") + h + ":00";
    return day + " " + hour;
  }

  function drawHourlyChart(canvas) {
    if (!canvas || !lastRenderedHourlyData) return;
    const d = lastRenderedHourlyData;
    const rangeSelect = document.getElementById("graphRangeSelect");
    const rangeHours = rangeSelect ? Math.max(1, parseInt(rangeSelect.value, 10) || 24) : graphTimeRangeHours;
    let times = d.time || [];
    let precips = d.precipitation || [];
    const total = times.length;
    const n = Math.min(total, rangeHours);
    times = times.slice(0, n);
    precips = precips.slice(0, n);
    if (n === 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    const padding = { top: 16, right: 20, bottom: 44, left: 32 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    ctx.clearRect(0, 0, w, h);
    const validPrecips = (precips || []).filter(function (v) { return v != null && !isNaN(v); });
    const precipMax = Math.max(1, (validPrecips.length ? Math.max.apply(null, validPrecips) : 1));
    function x(i) { return padding.left + (i / Math.max(1, n - 1)) * chartW; }
    function yRain(p) { return padding.top + chartH - ((p || 0) / precipMax) * chartH; }
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.stroke();
    ctx.fillStyle = "rgba(125,211,252,0.4)";
    ctx.beginPath();
    ctx.moveTo(x(0), padding.top + chartH);
    for (let i = 0; i < n; i++) {
      const p = precips[i] != null ? precips[i] : 0;
      ctx.lineTo(x(i), yRain(p));
    }
    ctx.lineTo(x(n - 1), padding.top + chartH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(125,211,252,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const p = precips[i] != null ? precips[i] : 0;
      if (!started) { ctx.moveTo(x(i), yRain(p)); started = true; } else ctx.lineTo(x(i), yRain(p));
    }
    ctx.stroke();
    ctx.fillStyle = "#e0e0e0";
    ctx.font = "11px system-ui,sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 8))) {
      const lbl = formatHourlyTime(times[i]).replace(" ", "\n");
      const parts = lbl.split("\n");
      ctx.fillText(parts[0], x(i), padding.top + chartH + 12);
      if (parts[1]) ctx.fillText(parts[1], x(i), padding.top + chartH + 24);
    }
    ctx.fillText("Time", padding.left + chartW / 2, padding.top + chartH + 36);
    ctx.textAlign = "left";
    ctx.fillText("mm", padding.left - 22, padding.top + chartH - 2);
  }

  function initGraphHover() {
    const canvas = document.getElementById("hourlyGraphCanvas");
    const tooltip = document.getElementById("hourlyGraphTooltip");
    if (!canvas || !tooltip || !lastRenderedHourlyData) return;
    const padding = { left: 32, right: 20 };
    const chartW = 380 - padding.left - padding.right;

    function getDataIndex(clientX) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const rangeSelect = document.getElementById("graphRangeSelect");
      const rangeHours = rangeSelect ? Math.max(1, parseInt(rangeSelect.value, 10) || 24) : 24;
      const n = Math.min(lastRenderedHourlyData.time.length, rangeHours);
      if (n <= 0) return -1;
      if (x < padding.left || x > padding.left + chartW) return -1;
      const t = (x - padding.left) / chartW;
      let i = Math.round(t * (n - 1));
      if (i < 0) i = 0;
      if (i >= n) i = n - 1;
      return i;
    }

    canvas.addEventListener("mousemove", function (e) {
      const i = getDataIndex(e.clientX);
      if (i < 0) {
        tooltip.style.display = "none";
        tooltip.setAttribute("aria-hidden", "true");
        return;
      }
      const rangeSelect = document.getElementById("graphRangeSelect");
      const rangeHours = rangeSelect ? Math.max(1, parseInt(rangeSelect.value, 10) || 24) : 24;
      const times = (lastRenderedHourlyData.time || []).slice(0, rangeHours);
      const precips = (lastRenderedHourlyData.precipitation || []).slice(0, rangeHours);
      const timeStr = formatHourlyTime(times[i]);
      const precip = precips[i] != null ? precips[i] : 0;
      tooltip.textContent = timeStr + " · " + (precip.toFixed(1)) + " mm";
      tooltip.style.display = "block";
      tooltip.setAttribute("aria-hidden", "false");
      const rect = canvas.getBoundingClientRect();
      const pad = 12;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      var wrap = canvas.parentElement;
      var wrapW = wrap ? wrap.offsetWidth : 380;
      var wrapH = wrap ? wrap.offsetHeight : 240;
      var tw = 140;
      var th = 32;
      var left = x + pad;
      var top = y + pad;
      if (left + tw > wrapW) left = x - tw - 8;
      if (left < 8) left = 8;
      if (top + th > wrapH) top = y - th - 8;
      if (top < 8) top = 8;
      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
    });
    canvas.addEventListener("mouseleave", function () {
      tooltip.style.display = "none";
      tooltip.setAttribute("aria-hidden", "true");
    });
  }

  function showWeatherData(lat, lon, data) {
    const el = document.getElementById("weatherResult");
    if (!el) return;
    const c = data.current;
    const h = data.hourly;
    if (!c && !h) {
      showWeatherError("No weather data in response.");
      return;
    }

    let html = "";

    if (c) {
      const temp = c.temperature_2m != null ? c.temperature_2m + " °C" : "—";
      const rain = c.precipitation != null ? c.precipitation + " mm" : (c.rain != null ? c.rain + " mm" : "—");
      const humidity = c.relative_humidity_2m != null ? c.relative_humidity_2m + "%" : "—";
      const cloud = c.cloud_cover != null ? c.cloud_cover + "%" : "—";
      const desc = weatherCodeToText(c.weather_code || 0);
      html += '<div class="weather-now">';
      html += '<div class="row"><span class="label">Now – Condition</span><span>' + escapeHtml(desc) + "</span></div>";
      html += '<div class="row"><span class="label">Temperature</span><span>' + escapeHtml(String(temp)) + "</span></div>";
      html += '<div class="row"><span class="label">Rain / precipitation</span><span class="rain">' + escapeHtml(String(rain)) + "</span></div>";
      html += '<div class="row"><span class="label">Humidity</span><span>' + escapeHtml(String(humidity)) + "</span></div>";
      html += '<div class="row"><span class="label">Cloud cover</span><span>' + escapeHtml(String(cloud)) + "</span></div>";
      html += "</div>";
    }

    if (h && h.time && h.time.length) {
      const precips = h.precipitation || h.rain || [];
      const codes = h.weather_code || [];
      lastHourlyData = { lat: lat, lon: lon, time: h.time, precipitation: precips, weatherCode: codes };
      const firstPrecip = precips[0] != null ? precips[0] : 0;
      const firstCode = codes[0] != null ? codes[0] : 0;
      showTimeSlider(h.time.length, h.time[0], getRainIntensityFromCondition(firstCode, firstPrecip));
      const temps = h.temperature_2m || [];
      const humids = h.relative_humidity_2m || [];
      const clouds = h.cloud_cover || [];
      const hoursToShow = Math.min(48, h.time.length);
      const hoursForGraph = Math.min(168, h.time.length);
      lastRenderedHourlyData = {
        time: h.time.slice(0, hoursForGraph),
        temperature_2m: temps.slice(0, hoursForGraph),
        precipitation: (h.precipitation || h.rain || []).slice(0, hoursForGraph),
        relative_humidity_2m: humids.slice(0, hoursForGraph),
        cloud_cover: clouds.slice(0, hoursForGraph),
      };
      html += '<p class="weather-table-toggle-wrap"><button type="button" id="weatherTableToggleBtn" class="weather-table-toggle-btn" aria-label="Minimize data table" title="Minimize data table">' + (weatherTableCollapsed ? '▴ Table' : '▾ Table') + '</button></p>';
      html += '<div id="weatherDataTableSection" class="weather-data-table-section">';
      html += '<p class="hourly-title">Every hour (next 48h)</p>';
      html += '<div class="hourly-tabs"><button type="button" class="hourly-tab hourly-tab--active" data-tab="table">Table</button><button type="button" class="hourly-tab" data-tab="graph">Graph</button></div>';
      html += '<div id="hourlyTablePanel" class="hourly-panel hourly-panel--active"><div class="hourly-scroll"><table class="hourly-table"><thead><tr><th>Time</th><th>Rain</th><th>Temp</th><th>Condition</th><th>Humidity</th><th>Cloud</th></tr></thead><tbody>';
      for (let i = 0; i < hoursToShow; i++) {
        const time = formatHourlyTime(h.time[i]);
        const temp = temps[i] != null ? temps[i] + "°" : "—";
        const rain = (precips[i] != null && precips[i] > 0) ? precips[i] + " mm" : "0";
        const desc = weatherCodeToText(codes[i] || 0);
        const hum = humids[i] != null ? humids[i] + "%" : "—";
        const cl = clouds[i] != null ? clouds[i] + "%" : "—";
        const rainClass = precips[i] > 0 ? " rain" : "";
        html += "<tr><td>" + escapeHtml(time) + "</td><td class=\"rain-cell" + rainClass + "\">" + escapeHtml(String(rain)) + "</td><td>" + escapeHtml(String(temp)) + "</td><td>" + escapeHtml(desc) + "</td><td>" + escapeHtml(String(hum)) + "</td><td>" + escapeHtml(String(cl)) + "</td></tr>";
      }
      html += "</tbody></table></div></div>";
      html += '<div id="hourlyGraphPanel" class="hourly-panel">';
      html += '<div class="graph-range-wrap"><label class="graph-range-label">Time:</label><select id="graphRangeSelect" class="graph-range-select" aria-label="Graph time range">';
      html += '<option value="12">12 hours</option><option value="24" selected>24 hours (Today)</option><option value="72">3 days</option><option value="168">1 week</option>';
      html += '</select></div>';
      html += '<div class="graph-canvas-wrap"><canvas id="hourlyGraphCanvas" class="hourly-graph-canvas" width="380" height="240"></canvas>';
      html += '<div id="hourlyGraphTooltip" class="graph-tooltip" aria-hidden="true"></div></div></div>';
      html += "</div>";

      // First hour precip (mm): show rain zones when ≥0.1 / ≥0.5 / ≥1 mm
      var precipForHour = (precips[0] != null && !isNaN(precips[0])) ? precips[0] : 0;
      try { if (window.gridManager && window.gridManager.setRainVisibility) window.gridManager.setRainVisibility(precipForHour); } catch (e) { /* ignore */ }
      var lr = document.getElementById('legendCurrentRain');
      if (lr) lr.textContent = (precipForHour != null && !isNaN(precipForHour)) ? Number(precipForHour).toFixed(2) + ' mm' : '—';
    }

    el.innerHTML = html;
    el.classList.remove("weather-error");
    if (weatherTableCollapsed) {
      const section = el.querySelector("#weatherDataTableSection");
      if (section) section.classList.add("weather-data-table-section--collapsed");
    }
    if (lastRenderedHourlyData) initGraphHover();

    let precipMm = 0;
    let weatherCode = null;
    if (c) {
      precipMm = c.precipitation != null ? c.precipitation : (c.rain != null ? c.rain : 0);
      weatherCode = c.weather_code != null ? c.weather_code : null;
    } else if (h && (h.precipitation || h.rain) && (h.precipitation || h.rain).length) {
      precipMm = (h.precipitation || h.rain)[0] || 0;
      weatherCode = (h.weather_code && h.weather_code[0]) != null ? h.weather_code[0] : null;
    }
    if (!h || !h.time || !h.time.length) {
      lastHourlyData = null;
      lastRenderedHourlyData = null;
      hideTimeSlider();
    }
    const effectivePrecip = getRainIntensityFromCondition(weatherCode, precipMm);
    updateRainEffect(lon, lat, effectivePrecip);
  }

  function showTimeSlider(hourCount, firstTimeIso, firstPrecip) {
    const wrap = document.getElementById("timeSliderWrap");
    const slider = document.getElementById("timeSlider");
    const label = document.getElementById("timeSliderLabel");
    if (!wrap || !slider || !label) return;
    // Today only: first 24 hours (indices 0–23)
    const max = Math.max(0, Math.min(23, hourCount - 1));
    slider.min = 0;
    slider.max = max;
    slider.value = 0;
    label.textContent = formatHourlyTime(firstTimeIso);
    wrap.style.display = "block";
    wrap.setAttribute("aria-hidden", "false");
  }

  function hideTimeSlider() {
    const wrap = document.getElementById("timeSliderWrap");
    if (wrap) {
      wrap.style.display = "none";
      wrap.setAttribute("aria-hidden", "true");
    }
  }

  function onTimeSliderChange() {
    const slider = document.getElementById("timeSlider");
    const label = document.getElementById("timeSliderLabel");
    if (!lastHourlyData || !slider || !label) return;
    const index = parseInt(slider.value, 10);
    const times = lastHourlyData.time;
    const precips = lastHourlyData.precipitation || [];
    const codes = lastHourlyData.weatherCode || [];
    const precip = (precips[index] != null && precips[index] >= 0) ? precips[index] : 0;
    const code = (codes[index] != null) ? codes[index] : null;
    const effectivePrecip = getRainIntensityFromCondition(code, precip);
    label.textContent = index < times.length ? formatHourlyTime(times[index]) : "—";
    updateRainEffect(lastHourlyData.lon, lastHourlyData.lat, effectivePrecip);
    // Rain zone visibility for selected hour (0.1 / 0.5 / 1 mm thresholds)
    try { if (window.gridManager && window.gridManager.setRainVisibility) window.gridManager.setRainVisibility(precip); } catch (e) { /* ignore */ }
    var lr = document.getElementById('legendCurrentRain');
    if (lr) lr.textContent = (precip != null && !isNaN(precip)) ? Number(precip).toFixed(2) + ' mm' : '—';
  }

  function fetchWeatherForCoordinates(lat, lon) {
    const url = WEATHER_API +
      "?latitude=" + encodeURIComponent(lat) +
      "&longitude=" + encodeURIComponent(lon) +
      "&current=precipitation,rain,weather_code,temperature_2m,relative_humidity_2m,cloud_cover" +
      "&hourly=temperature_2m,precipitation,rain,weather_code,relative_humidity_2m,cloud_cover" +
      "&forecast_days=7" +
      "&timezone=auto";
    showWeatherLoading();
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Weather request failed: " + res.status);
        return res.json();
      })
      .then(function (json) {
        showWeatherData(lat, lon, json);
      })
      .catch(function (err) {
        showWeatherError(err.message || "Could not load weather.");
      });
  }

  function initTimeSlider() {
    const slider = document.getElementById("timeSlider");
    if (!slider) return;
    slider.addEventListener("input", onTimeSliderChange);
    slider.addEventListener("change", onTimeSliderChange);
  }

  function initCoordsWeather() {
    const btn = document.getElementById("goWeatherBtn");
    const inputLat = document.getElementById("inputLat");
    const inputLon = document.getElementById("inputLon");
    if (!btn || !inputLat || !inputLon) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("lat") != null) inputLat.value = params.get("lat");
    if (params.get("lon") != null) inputLon.value = params.get("lon");

    btn.addEventListener("click", function () {
      const lat = parseCoord(inputLat.value.trim(), BOUNDS.lat);
      const lon = parseCoord(inputLon.value.trim(), BOUNDS.lon);
      if (lat === undefined || lon === undefined) {
        showWeatherError("Enter valid latitude (-90 to 90) and longitude (-180 to 180).");
        return;
      }
      showRainOverlay(false);
      flyToCoordinates(lon, lat, DEFAULTS.flyToHeight, true);
      btn.disabled = true;
      fetchWeatherForCoordinates(lat, lon);
      setTimeout(function () { btn.disabled = false; }, 2000);
    });

    const exampleRainBtn = document.getElementById("exampleRainBtn");
    if (exampleRainBtn) {
      exampleRainBtn.addEventListener("click", function () {
        let lat = parseCoord(inputLat.value.trim(), BOUNDS.lat);
        let lon = parseCoord(inputLon.value.trim(), BOUNDS.lon);
        if (lat === undefined || lon === undefined) {
          lat = typeof CONFIG !== "undefined" && CONFIG.defaultLat != null ? CONFIG.defaultLat : 3.3633483;
          lon = typeof CONFIG !== "undefined" && CONFIG.defaultLon != null ? CONFIG.defaultLon : 101.3449264;
          if (inputLat) inputLat.value = lat;
          if (inputLon) inputLon.value = lon;
        }
        flyToCoordinates(lon, lat, 2000, true);
        exampleRainBtn.disabled = true;
        exampleRainBtn.textContent = "Showing rain…";
        setTimeout(function () {
          updateRainEffect(lon, lat, 6);
          showRainOverlay(true);
          exampleRainBtn.disabled = false;
          exampleRainBtn.textContent = "Show example rain";
        }, 1500);
      });
    }
  }

  function showRainOverlay(visible) {
    const el = document.getElementById("rainOverlay");
    if (!el) return;
    if (visible) {
      el.classList.add("rain-overlay--visible");
    } else {
      el.classList.remove("rain-overlay--visible");
    }
  }

  function initRainOverlay() {
    const overlay = document.getElementById("rainOverlay");
    if (!overlay) return;
    overlay.addEventListener("click", function () {
      showRainOverlay(false);
    });
  }

  function initPlacesSearch() {
    const input = document.getElementById("placeSearch");
    if (!input) return;
    if (typeof google === "undefined" || !google.maps?.places) {
      input.placeholder = "Add Google API key for place search";
      return;
    }
    const autocomplete = new google.maps.places.Autocomplete(input, { types: ["establishment", "geocode"] });
    autocomplete.addListener("place_changed", function () {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) return;
      const lat = place.geometry.location.lat();
      const lon = place.geometry.location.lng();
      flyToCoordinates(lon, lat, DEFAULTS.placesFlyToHeight, true);
    });
  }

  function buildShareUrl() {
    const cam = viewer.camera;
    const carto = Cesium.Cartographic.fromCartesian(cam.positionCartographic);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const height = carto.height;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", lat.toFixed(6));
    url.searchParams.set("lon", lon.toFixed(6));
    url.searchParams.set("height", Math.round(height));
    return url.toString();
  }

  function setPrecipitationLayer(visible) {
    if (!viewer) return;
    if (visible) {
      if (precipitationLayer) return;
      fetch(RAINVIEWER_API)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          const host = data.host || "https://tilecache.rainviewer.com";
          const radar = data.radar;
          const frames = (radar && radar.past) ? radar.past : [];
          const frame = frames.length ? frames[frames.length - 1] : null;
          if (!frame || !frame.path) {
            console.warn("RainViewer: no radar frames");
            return;
          }
          const url = host + frame.path + "/256/{z}/{x}/{y}/0/0_0.png";
          try {
            const provider = new Cesium.UrlTemplateImageryProvider({
              url: url,
              maximumLevel: 7,
              credit: "RainViewer",
            });
            precipitationLayer = viewer.imageryLayers.addImageryProvider(provider);
            precipitationLayer.alpha = 0.75;
            const btn = document.getElementById("precipitationLayerBtn");
            if (btn) btn.textContent = "Hide precipitation map";
          } catch (e) {
            console.error("Precipitation layer failed:", e);
          }
        })
        .catch(function (e) {
          console.error("RainViewer fetch failed:", e);
        });
    } else {
      if (precipitationLayer) {
        viewer.imageryLayers.remove(precipitationLayer);
        precipitationLayer = null;
      }
      const btn = document.getElementById("precipitationLayerBtn");
      if (btn) btn.textContent = "Precipitation map";
    }
  }

  function togglePrecipitationLayer() {
    setPrecipitationLayer(!precipitationLayer);
  }

  function initCopyUrlButton() {
    const btn = document.getElementById("copyUrlBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const url = buildShareUrl();
      navigator.clipboard.writeText(url).then(
        () => { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy view URL"; }, 1500); },
        () => { btn.textContent = "Copy failed"; }
      );
    });
  }

  function initPrecipitationLayerButton() {
    const btn = document.getElementById("precipitationLayerBtn");
    if (!btn) return;
    btn.addEventListener("click", togglePrecipitationLayer);
  }

  function initApiHint() {
    const hint = document.getElementById("apiHint");
    const toggle = document.getElementById("apiHintToggle");
    if (!hint || !toggle) return;
    toggle.addEventListener("click", function () {
      const collapsed = hint.classList.toggle("api-hint--collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.textContent = collapsed ? "Show API help" : "Hide API help";
    });
  }

  function initPostMessage() {
    window.addEventListener("message", function (event) {
      const data = event.data;
      if (!data || data.type !== "cesiumFlyTo") return;
      const { lat, lon, height, addMarker } = data;
      cesiumFlyTo(lat, lon, height, addMarker !== false);
    });
  }

  function hideLoading() {
    const el = document.getElementById("loadingOverlay");
    if (el) el.classList.add("loading-overlay--hidden");
  }

  async function init() {
    if (typeof Cesium === "undefined") {
      console.error("Cesium failed to load.");
      return;
    }
    if (typeof CONFIG !== "undefined" && CONFIG.CESIUM_ION_ACCESS_TOKEN) {
      Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_ION_ACCESS_TOKEN;
    }

    const viewerOptions = {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      timeline: false,
      animation: false,
      baseLayerPicker: true,
      geocoder: false,
      sceneModePicker: true,
      navigationHelpButton: true,
      fullscreenButton: true,
      vrButton: false,
      useDefaultRenderLoop: true,
      requestRenderMode: false,
    };

    const bingKey = typeof CONFIG !== "undefined" && CONFIG.BING_MAPS_KEY && String(CONFIG.BING_MAPS_KEY).trim();
    if (bingKey) {
      try {
        const bing = await Cesium.BingMapsImageryProvider.fromUrl("https://dev.virtualearth.net", {
          key: bingKey,
          mapStyle: Cesium.BingMapsStyle.AERIAL_WITH_LABELS,
        });
        viewerOptions.imageryProvider = bing;
      } catch (e) {
        console.warn("Bing Maps failed, using default imagery:", e);
      }
    }

    viewer = new Cesium.Viewer("cesiumContainer", viewerOptions);

    viewer.scene.globe.depthTestAgainstTerrain = true;

    // Initialize and render the flood zone grid (outline-only)
    try {
      try { if (window.floodConfig && typeof window.floodConfig.load === 'function') window.floodConfig.load(); } catch (e) { /* ignore */ }
      initFloodZones();
      window.floodZones = floodZones;
      try { if (window.gridManager && typeof window.gridManager.init === 'function') window.gridManager.init(viewer); } catch (e) { /* ignore */ }
      renderZoneGrid();
      try {
        if (window.floodConfig && typeof window.floodConfig.pullFromSupabase === 'function') {
          window.floodConfig.pullFromSupabase(function (ok) {
            if (ok) {
              try { if (window.gridManager && window.gridManager.updateAllVisuals) window.gridManager.updateAllVisuals(); } catch (e) { /* ignore */ }
            }
          });
        }
      } catch (e) { /* ignore */ }
      // initialize floodState
      try { if (window.floodState && typeof window.floodState.init === 'function') window.floodState.init(viewer); } catch (e) { /* ignore */ }
      // Expose utility to window for external calls if needed
      window.floodZonesByIds = floodZonesByIds;
      // Init adminMode after viewer and gridManager are ready
      try { if (window.adminMode && typeof window.adminMode.init === 'function') window.adminMode.init(viewer); } catch (e) { /* ignore */ }
    } catch (e) {
      console.warn('Flood zone init failed:', e);
    }

    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    readUrlParams();
    initCoordsWeather();
    initTimeSlider();
    // Flood controls in the coords/weather panel
    try { initFloodControls(); } catch (e) { /* ignore */ }
    try { initAuthPanel(); } catch (e) { /* ignore */ }
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("lat") == null || urlParams.get("lon") == null) {
      const lat = typeof CONFIG !== "undefined" && CONFIG.defaultLat != null ? CONFIG.defaultLat : 3.3633483;
      const lon = typeof CONFIG !== "undefined" && CONFIG.defaultLon != null ? CONFIG.defaultLon : 101.3449264;
      flyToCoordinates(lon, lat, DEFAULTS.flyToHeight, true);
      const inputLat = document.getElementById("inputLat");
      const inputLon = document.getElementById("inputLon");
      if (inputLat) inputLat.value = lat;
      if (inputLon) inputLon.value = lon;
      fetchWeatherForCoordinates(lat, lon);
    }
    initPlacesSearch();
    initCopyUrlButton();
    initPrecipitationLayerButton();
    initApiHint();
    initRainOverlay();
    initPostMessage();

    viewer.scene.globe.tileLoadProgressEvent.addEventListener(function (queuedTileCount) {
      if (queuedTileCount === 0) hideLoading();
    });
    setTimeout(hideLoading, 3000);

    window.cesiumFlyTo = cesiumFlyTo;
    window.CesiumViewer = viewer;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init().catch(function (e) { console.error(e); }); });
  } else {
    init().catch(function (e) { console.error(e); });
  }
})();
