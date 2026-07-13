/**
 * Admin-placed 3D houses (boxes) and roads (corridors), shared per FLOOD_MAP_ID via Supabase map_scene.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'mapScene_v1';
  const DEFAULT_HOUSE = { lengthM: 14, widthM: 10, heightM: 9, headingDeg: 0 };
  const DEFAULT_ROAD_WIDTH_M = 6;
  const DEFAULT_ROAD_HEIGHT_M = 0.5;   // metres above sampled terrain

  let viewer = null;
  /** @type {Cesium.Entity[]} */
  const entityList = [];
  let roadDraft = [];
  let selectedId = '';   // entity string id of selected object (e.g. "mapscene-house-xxx")
  let movePending = false;
  let reshapeMode = false;         // waypoint-edit mode for selected road
  let selectedWaypointIdx = -1;    // index of the highlighted waypoint handle, -1 = none
  let gizmoDragState = null;        // active drag descriptor or null
  let postRenderUnsubscribe = null; // removes postRender listener when called
  let gizmoClientPos = { x: 0, y: 0 }; // cached client-space center of gizmo

  let state = { houses: [], roads: [] };

  // ── Helpers ────────────────────────────────────────────────────────────────

  /* N-dimensional Catmull-Rom spline — works for [lon,lat] and [lon,lat,h] */
  function catmullRomSpline(pts, samples) {
    if (pts.length < 3) return pts;
    samples = samples || 8;
    var dims = pts[0].length;
    var out = [];
    var p = [pts[0]].concat(pts).concat([pts[pts.length - 1]]);
    for (var i = 1; i < p.length - 2; i++) {
      var p0 = p[i-1], p1 = p[i], p2 = p[i+1], p3 = p[i+2];
      for (var s = 0; s < samples; s++) {
        var t = s / samples, t2 = t*t, t3 = t2*t;
        var pt = [];
        for (var d = 0; d < dims; d++) {
          pt.push(0.5 * ((2*p1[d]) + (-p0[d]+p2[d])*t + (2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*t2 + (-p0[d]+3*p1[d]-3*p2[d]+p3[d])*t3));
        }
        out.push(pt);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }

  function haversineM(lon1, lat1, lon2, lat2) {
    var R = 6371000;
    var dLat = Cesium.Math.toRadians(lat2 - lat1);
    var dLon = Cesium.Math.toRadians(lon2 - lon1);
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(Cesium.Math.toRadians(lat1))*Math.cos(Cesium.Math.toRadians(lat2))*
            Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function roadLengthM(positions) {
    var total = 0;
    for (var i = 1; i < positions.length; i++) {
      total += haversineM(positions[i-1][0], positions[i-1][1], positions[i][0], positions[i][1]);
    }
    return total;
  }

  /* Terrain height cache: keyed by "lon,lat" rounded to 6dp */
  var _thCache = {};

  /* Returns ellipsoid-relative terrain height at a lon/lat, or 0 if tiles not loaded yet */
  function getTerrainHeight(lon, lat) {
    var key = lon.toFixed(6) + ',' + lat.toFixed(6);
    if (_thCache[key] !== undefined) return _thCache[key];
    try {
      var cart = Cesium.Cartographic.fromDegrees(lon, lat);
      var h = viewer && viewer.scene.globe.getHeight(cart);
      var result = (typeof h === 'number' && isFinite(h)) ? h : 0;
      if (result !== 0) _thCache[key] = result;
      return result;
    } catch (e) { return 0; }
  }

  /* Pre-fetch terrain heights for all house positions using sampleTerrainMostDetailed,
     then re-render once all heights are known. */
  function prefetchTerrainHeights(callback) {
    if (!viewer || !state.houses.length) { if (callback) callback(); return; }
    // Ensure every house gets a cache entry so the re-render guard terminates.
    function _markFallback() {
      state.houses.forEach(function (h) {
        var key = h.lon.toFixed(6) + ',' + h.lat.toFixed(6);
        if (_thCache[key] === undefined) _thCache[key] = 0;
      });
    }
    try {
      var cartos = state.houses.map(function (h) {
        return Cesium.Cartographic.fromDegrees(h.lon, h.lat);
      });
      Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartos)
        .then(function (updated) {
          updated.forEach(function (c, i) {
            var h = state.houses[i];
            var key = h.lon.toFixed(6) + ',' + h.lat.toFixed(6);
            // Store the result (including 0) so _terrainKey checks stop looping.
            _thCache[key] = (typeof c.height === 'number' && isFinite(c.height)) ? c.height : 0;
          });
          if (callback) callback();
        })
        .catch(function () { _markFallback(); if (callback) callback(); });
    } catch (e) { _markFallback(); if (callback) callback(); }
  }

  function mapId() {
    return String(window.FLOOD_MAP_ID || 'default').trim() || 'default';
  }

  function isSupabaseReady() {
    const u = (window.FLOOD_SUPABASE_URL || '').trim();
    const k = (window.FLOOD_SUPABASE_ANON_KEY || '').trim();
    return u.length > 12 && k.length > 20;
  }

  function newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function getTool() {
    const sel = document.getElementById('adminSceneTool');
    return sel ? String(sel.value || 'none') : 'none';
  }

  function getNum(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return isNaN(v) || v < 1 ? fallback : v;
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.houses = Array.isArray(parsed.houses) ? parsed.houses : [];
        state.roads = Array.isArray(parsed.roads) ? parsed.roads : [];
      }
    } catch (e) { /* ignore */ }
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function normalizeScene() {
    state.houses = (state.houses || []).filter(function (h) {
      return h && typeof h.id === 'string' && typeof h.lon === 'number' && typeof h.lat === 'number';
    });
    state.roads = (state.roads || []).filter(function (r) {
      return r && typeof r.id === 'string' && Array.isArray(r.positions) && r.positions.length >= 2;
    });
  }

  function saveRemote() {
    if (!isSupabaseReady()) return;
    var base = window.FLOOD_SUPABASE_URL.replace(/\/$/, '');
    var anonKey = window.FLOOD_SUPABASE_ANON_KEY;
    var mid = mapId();
    var payload = { map_id: mid, scene: { houses: state.houses, roads: state.roads }, updated_at: new Date().toISOString() };
    var doSave = function (auth) {
      var isAdmin = !!(window.supabaseAuth && typeof window.supabaseAuth.isFloodAdmin === 'function' && window.supabaseAuth.isFloodAdmin());
      if (!isAdmin) return;
      var url = base + '/rest/v1/map_scene';
      var headers = {
        apikey: anonKey,
        Authorization: 'Bearer ' + (auth ? auth.token : anonKey),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      };
      fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
        .then(function (res) {
          if (!res.ok) console.warn('[mapScene] Supabase save failed:', res.status);
        })
        .catch(function (err) { console.warn('[mapScene] Supabase save:', err.message || err); });
    };
    if (window.supabaseAuth && typeof window.supabaseAuth.getAuthForApi === 'function') {
      window.supabaseAuth.getAuthForApi(function (auth) { doSave(auth); });
    }
  }

  function pullFromSupabase(done) {
    if (!isSupabaseReady()) {
      if (typeof done === 'function') done(false);
      return;
    }
    var base = window.FLOOD_SUPABASE_URL.replace(/\/$/, '');
    var anonKey = window.FLOOD_SUPABASE_ANON_KEY;
    // Use anonKey as the Bearer token so all users (not just admins) can read the scene.
    // Writes still require an admin JWT — see saveRemote().
    var mid = mapId();
    var url = base + '/rest/v1/map_scene?map_id=eq.' + encodeURIComponent(mid) + '&select=scene';
    var headers = { apikey: anonKey, Authorization: 'Bearer ' + anonKey };
    fetch(url, { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        if (!Array.isArray(rows) || !rows[0] || !rows[0].scene) {
          if (typeof done === 'function') done(false);
          return;
        }
        var sc = rows[0].scene;
        state.houses = Array.isArray(sc.houses) ? sc.houses : [];
        state.roads = Array.isArray(sc.roads) ? sc.roads : [];
        normalizeScene();
        saveLocal();
        prefetchTerrainHeights(function () {
          render();
          if (typeof done === 'function') done(true);
        });
      })
      .catch(function (e) {
        console.warn('[mapScene] Supabase pull:', e.message || e);
        if (typeof done === 'function') done(false);
      });
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function renderHousePolygons(h, isSelected) {
    var len    = typeof h.lengthM  === 'number' && h.lengthM  > 0 ? h.lengthM  : DEFAULT_HOUSE.lengthM;
    var wid    = typeof h.widthM   === 'number' && h.widthM   > 0 ? h.widthM   : DEFAULT_HOUSE.widthM;
    var height = (typeof h.heightM  === 'number' && h.heightM  > 0 ? h.heightM  : DEFAULT_HOUSE.heightM) - 1;
    var heading = typeof h.headingDeg === 'number' ? h.headingDeg : DEFAULT_HOUSE.headingDeg;
    var headingRad = Cesium.Math.toRadians(heading);
    var cosH = Math.cos(headingRad), sinH = Math.sin(headingRad);
    var halfLen = len / 2, halfWid = wid / 2;
    var mPerDegLon = 111320 * Math.cos(Cesium.Math.toRadians(h.lat));
    var eid = 'mapscene-house-' + h.id;
    var _terrainKey = h.lon.toFixed(6) + ',' + h.lat.toFixed(6);
    var th = getTerrainHeight(h.lon, h.lat);

    function pt(xM, yM, zM) {
      return Cesium.Cartesian3.fromDegrees(
        h.lon + (xM * cosH + yM * sinH) / mPerDegLon,
        h.lat + (-xM * sinH + yM * cosH) / 111320,
        th + zM
      );
    }

    var wallMat  = isSelected ? Cesium.Color.GOLD.withAlpha(1.0) : new Cesium.Color(0.918, 0.918, 0.902, 1.0); // #EAEAE6 soft white
    var roofMat  = new Cesium.Color(0.486, 0.420, 0.353, 1.0); // #7C6B5A wood accent
    var paneMat  = new Cesium.Color(0.55, 0.82, 1.0, 1.0);
    var frameMat = new Cesium.Color(0.110, 0.110, 0.110, 1.0); // #1C1C1C charcoal trim
    var rPeak = height + height / 3;
    var winW  = Math.max(1.0, Math.min(wid * 0.22, 2.0));
    var winH  = Math.max(1.0, Math.min(height * 0.28, 2.0));
    var winCZ = height * 0.50;
    var winY  = halfWid * 0.38;
    var fT    = 0.12; // frame border thickness
    var dT    = 0.07; // cross divider thickness
    var doorW = Math.max(1.0, Math.min(len * 0.14, 1.6));
    var doorH = Math.max(2.0, Math.min(height * 0.55, 2.8));
    var doorMat = new Cesium.Color(0.659, 0.710, 0.627, 1.0); // #A8B5A0 sage green

    // Generates frame + pane + cross dividers for one window at (xBase±offset, yCenter)
    function winFaces(xBase, xSign, yCenter, pfx) {
      var pF = xBase + xSign * 0.04; // frame layer
      var pP = xBase + xSign * 0.06; // pane layer
      var pD = xBase + xSign * 0.08; // divider layer
      return [
        { id: pfx + 'f', mat: frameMat, verts: [pt(pF, yCenter-(winW/2+fT), winCZ-(winH/2+fT)), pt(pF, yCenter+(winW/2+fT), winCZ-(winH/2+fT)), pt(pF, yCenter+(winW/2+fT), winCZ+(winH/2+fT)), pt(pF, yCenter-(winW/2+fT), winCZ+(winH/2+fT))] },
        { id: pfx + 'p', mat: paneMat, verts: [pt(pP, yCenter-winW/2, winCZ-winH/2), pt(pP, yCenter+winW/2, winCZ-winH/2), pt(pP, yCenter+winW/2, winCZ+winH/2), pt(pP, yCenter-winW/2, winCZ+winH/2)] },
        { id: pfx + 'h', mat: frameMat, verts: [pt(pD, yCenter-winW/2, winCZ-dT/2), pt(pD, yCenter+winW/2, winCZ-dT/2), pt(pD, yCenter+winW/2, winCZ+dT/2), pt(pD, yCenter-winW/2, winCZ+dT/2)] },
        { id: pfx + 'v', mat: frameMat, verts: [pt(pD, yCenter-dT/2, winCZ-winH/2), pt(pD, yCenter+dT/2, winCZ-winH/2), pt(pD, yCenter+dT/2, winCZ+winH/2), pt(pD, yCenter-dT/2, winCZ+winH/2)] },
      ];
    }

    var winXFront = halfLen * 0.50; // X offset of each front window from centre

    // Frame + pane + cross dividers for a window on the front/back face at (xCenter, yBase)
    function frontWinFaces(yBase, ySign, xCenter, pfx) {
      var pF = yBase + ySign * 0.04;
      var pP = yBase + ySign * 0.06;
      var pD = yBase + ySign * 0.08;
      return [
        { id: pfx + 'f', mat: frameMat, verts: [pt(xCenter-(winW/2+fT), pF, winCZ-(winH/2+fT)), pt(xCenter+(winW/2+fT), pF, winCZ-(winH/2+fT)), pt(xCenter+(winW/2+fT), pF, winCZ+(winH/2+fT)), pt(xCenter-(winW/2+fT), pF, winCZ+(winH/2+fT))] },
        { id: pfx + 'p', mat: paneMat,  verts: [pt(xCenter-winW/2, pP, winCZ-winH/2), pt(xCenter+winW/2, pP, winCZ-winH/2), pt(xCenter+winW/2, pP, winCZ+winH/2), pt(xCenter-winW/2, pP, winCZ+winH/2)] },
        { id: pfx + 'h', mat: frameMat, verts: [pt(xCenter-winW/2, pD, winCZ-dT/2), pt(xCenter+winW/2, pD, winCZ-dT/2), pt(xCenter+winW/2, pD, winCZ+dT/2), pt(xCenter-winW/2, pD, winCZ+dT/2)] },
        { id: pfx + 'v', mat: frameMat, verts: [pt(xCenter-dT/2, pD, winCZ-winH/2), pt(xCenter+dT/2, pD, winCZ-winH/2), pt(xCenter+dT/2, pD, winCZ+winH/2), pt(xCenter-dT/2, pD, winCZ+winH/2)] },
      ];
    }

    // Generates frame + panel + horizontal rail for door centered at (xCenter, yBase)
    function doorFaces(yBase, ySign, xCenter, pfx) {
      var pF = yBase + ySign * 0.04;
      var pP = yBase + ySign * 0.06;
      var pD = yBase + ySign * 0.08;
      return [
        { id: pfx + 'f', mat: frameMat, verts: [pt(xCenter-(doorW/2+fT), pF, 0), pt(xCenter+(doorW/2+fT), pF, 0), pt(xCenter+(doorW/2+fT), pF, doorH+fT), pt(xCenter-(doorW/2+fT), pF, doorH+fT)] },
        { id: pfx + 'p', mat: doorMat,  verts: [pt(xCenter-doorW/2, pP, 0), pt(xCenter+doorW/2, pP, 0), pt(xCenter+doorW/2, pP, doorH), pt(xCenter-doorW/2, pP, doorH)] },
        { id: pfx + 'h', mat: frameMat, verts: [pt(xCenter-doorW/2, pD, doorH*0.62-dT/2), pt(xCenter+doorW/2, pD, doorH*0.62-dT/2), pt(xCenter+doorW/2, pD, doorH*0.62+dT/2), pt(xCenter-doorW/2, pD, doorH*0.62+dT/2)] },
      ];
    }

    var faces = [
      // 4 walls
      { id: eid + '-wl-0', verts: [pt(-halfLen, -halfWid, 0), pt( halfLen, -halfWid, 0), pt( halfLen, -halfWid, height), pt(-halfLen, -halfWid, height)], mat: wallMat },
      { id: eid + '-wl-1', verts: [pt( halfLen,  halfWid, 0), pt(-halfLen,  halfWid, 0), pt(-halfLen,  halfWid, height), pt( halfLen,  halfWid, height)], mat: wallMat },
      { id: eid + '-wl-2', verts: [pt( halfLen, -halfWid, 0), pt( halfLen,  halfWid, 0), pt( halfLen,  halfWid, height), pt( halfLen, -halfWid, height)], mat: wallMat },
      { id: eid + '-wl-3', verts: [pt(-halfLen,  halfWid, 0), pt(-halfLen, -halfWid, 0), pt(-halfLen, -halfWid, height), pt(-halfLen,  halfWid, height)], mat: wallMat },
      // 4 roof triangles
      { id: eid + '-rf-0', verts: [pt(-halfLen, -halfWid, height), pt( halfLen, -halfWid, height), pt(0, 0, rPeak)], mat: roofMat },
      { id: eid + '-rf-1', verts: [pt( halfLen, -halfWid, height), pt( halfLen,  halfWid, height), pt(0, 0, rPeak)], mat: roofMat },
      { id: eid + '-rf-2', verts: [pt( halfLen,  halfWid, height), pt(-halfLen,  halfWid, height), pt(0, 0, rPeak)], mat: roofMat },
      { id: eid + '-rf-3', verts: [pt(-halfLen,  halfWid, height), pt(-halfLen, -halfWid, height), pt(0, 0, rPeak)], mat: roofMat },
    ].concat(
      // 2 windows on east face (X=+halfLen), 2 on west face (X=-halfLen)
      winFaces( halfLen,  1, -winY, eid + '-we0'),
      winFaces( halfLen,  1,  winY, eid + '-we1'),
      winFaces(-halfLen, -1, -winY, eid + '-ww0'),
      winFaces(-halfLen, -1,  winY, eid + '-ww1'),
      doorFaces(-halfWid, -1, 0, eid + '-dr0'),
      // 2 windows on front face flanking the door
      frontWinFaces(-halfWid, -1, -winXFront, eid + '-wf0'),
      frontWinFaces(-halfWid, -1,  winXFront, eid + '-wf1')
    );

    faces.forEach(function (f) {
      entityList.push(viewer.entities.add({
        id: f.id,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(f.verts),
          perPositionHeight: true,
          material: f.mat,
          fill: true,
          outline: false,
        },
      }));
    });

    // Return true only if terrain hasn't been fetched yet (cache key absent).
    // Returning true when th===0 but the key IS cached (EllipsoidTerrainProvider legitimately
    // returns 0) caused an infinite clear-and-re-render loop that prevented houses appearing.
    return _thCache[_terrainKey] === undefined;
  }

  function clearEntities() {
    if (!viewer) return;
    for (var i = 0; i < entityList.length; i++) {
      try { viewer.entities.remove(entityList[i]); } catch (e) { /* ignore */ }
    }
    entityList.length = 0;
  }

  function render() {
    clearEntities();
    if (!viewer) return;
    normalizeScene();

    var anyNeedsRerender = false;
    for (var i = 0; i < state.houses.length; i++) {
      var h = state.houses[i];
      var isSelected = ('mapscene-house-' + h.id) === selectedId;
      if (renderHousePolygons(h, isSelected)) anyNeedsRerender = true;
    }
    if (anyNeedsRerender && !render._rerenderPending) {
      render._rerenderPending = true;
      prefetchTerrainHeights(function () {
        render._rerenderPending = false;
        render();
      });
    }

    for (var r = 0; r < state.roads.length; r++) {
      var road = state.roads[r];
      var rawPts = [];
      for (var p = 0; p < road.positions.length; p++) {
        var pt = road.positions[p];
        if (Array.isArray(pt) && pt.length >= 2) rawPts.push(pt.slice(0, 3));
      }
      if (rawPts.length < 2) continue;
      var splinePts = rawPts.length >= 3 ? catmullRomSpline(rawPts, 20) : rawPts;
      var rwidth = typeof road.widthM === 'number' && road.widthM > 0 ? road.widthM : DEFAULT_ROAD_WIDTH_M;
      var rheight = typeof road.heightM === 'number' && road.heightM > 0 ? road.heightM : DEFAULT_ROAD_HEIGHT_M;
      var reid = 'mapscene-road-' + road.id;
      var rSelected = reid === selectedId;

      var has3D = rawPts[0].length >= 3;
      var corridorPositions;
      var corridorExtra = {};
      if (has3D) {
        /* New format: absolute 3D positions — no terrain clamping, bend is purely user-controlled */
        var flat3 = [];
        for (var sp = 0; sp < splinePts.length; sp++) {
          flat3.push(splinePts[sp][0], splinePts[sp][1], (splinePts[sp][2] || 0) + rheight);
        }
        corridorPositions = Cesium.Cartesian3.fromDegreesArrayHeights(flat3);
      } else {
        /* Legacy 2D format: fall back to terrain clamping */
        var flat2 = [];
        for (var sp2 = 0; sp2 < splinePts.length; sp2++) { flat2.push(splinePts[sp2][0], splinePts[sp2][1]); }
        corridorPositions = Cesium.Cartesian3.fromDegreesArray(flat2);
        corridorExtra.height = rheight;
        corridorExtra.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
      }

      var re = viewer.entities.add({
        id: reid,
        name: 'Road',
        corridor: Object.assign({
          positions: corridorPositions,
          width: rwidth,
          cornerType: Cesium.CornerType.ROUNDED,
          material: rSelected ? Cesium.Color.GOLD.withAlpha(0.9) : Cesium.Color.DIMGRAY.withAlpha(0.95),
          outline: true,
          outlineColor: rSelected ? Cesium.Color.YELLOW : Cesium.Color.BLACK,
        }, corridorExtra),
      });
      entityList.push(re);
    }

    /* Waypoint handles: shown when a road is in reshape mode */
    if (reshapeMode && selectedId.indexOf('mapscene-road-') === 0) {
      var rwid = selectedId.slice('mapscene-road-'.length);
      for (var rr = 0; rr < state.roads.length; rr++) {
        if (state.roads[rr].id !== rwid) continue;
        var rwRoad = state.roads[rr];
        for (var wi = 0; wi < rwRoad.positions.length; wi++) {
          var wpt = rwRoad.positions[wi];
          var wpEid = 'mapscene-wp-' + rwid + '-' + wi;
          var isWpSel = wi === selectedWaypointIdx;
          var wpBaseH = typeof wpt[2] === 'number' ? wpt[2] : getTerrainHeight(wpt[0], wpt[1]);
          var wpe = viewer.entities.add({
            id: wpEid,
            position: Cesium.Cartesian3.fromDegrees(wpt[0], wpt[1], wpBaseH + DEFAULT_ROAD_HEIGHT_M + 4),
            point: {
              pixelSize: isWpSel ? 18 : 12,
              color: isWpSel ? Cesium.Color.fromCssColorString('#ef4444') : Cesium.Color.fromCssColorString('#38bdf8'),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          entityList.push(wpe);
        }
        break;
      }
    }

    /* Draft road polyline preview */
    if (roadDraft.length >= 2) {
      var dpts = roadDraft.map(function (p) { return [p.lon, p.lat, p.terrainH || 0]; });
      var dspline = dpts.length >= 3 ? catmullRomSpline(dpts, 20) : dpts;
      var dflat = [];
      var dHOffset = DEFAULT_ROAD_HEIGHT_M;
      for (var d = 0; d < dspline.length; d++) {
        dflat.push(dspline[d][0], dspline[d][1], (dspline[d][2] || 0) + dHOffset);
      }
      var de = viewer.entities.add({
        id: 'mapscene-road-draft',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(dflat),
          width: 3,
          material: Cesium.Color.YELLOW.withAlpha(0.85),
          clampToGround: false,
        },
      });
      entityList.push(de);
    }
  }

  // ── Picking helpers ────────────────────────────────────────────────────────

  function entityStringIdFromPickResult(picked) {
    if (!picked) return '';
    var e = picked.id;
    if (e) {
      if (typeof e.id === 'string') return e.id;
      if (e.id != null) return String(e.id);
    }
    var prim = picked.primitive;
    if (prim && prim.id) {
      if (typeof prim.id === 'object' && prim.id !== null && prim.id.id != null) return String(prim.id.id);
      if (typeof prim.id === 'string') return prim.id;
    }
    return '';
  }

  function findMapSceneEntityIdAtClick(click) {
    if (!viewer || !viewer.scene) return '';
    var results = viewer.scene.drillPick(click.position, 48);
    if (!results || results.length === 0) return '';
    for (var i = 0; i < results.length; i++) {
      var sid = entityStringIdFromPickResult(results[i]);
      if (sid.indexOf('mapscene-house-') === 0) {
        var hpart = sid.slice('mapscene-house-'.length);
        var hyphen = hpart.indexOf('-');
        return hyphen === -1 ? sid : 'mapscene-house-' + hpart.slice(0, hyphen);
      }
      if (sid.indexOf('mapscene-road-') === 0 || sid.indexOf('mapscene-wp-') === 0) return sid;
    }
    return '';
  }

  function pickGlobeDegrees(click) {
    if (!viewer) return null;
    var ray = viewer.camera.getPickRay(click.position);
    var cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return null;
    var c = Cesium.Cartographic.fromCartesian(cartesian);
    return { lon: Cesium.Math.toDegrees(c.longitude), lat: Cesium.Math.toDegrees(c.latitude) };
  }

  // ── Selection & editing ────────────────────────────────────────────────────

  function setSelected(entityStringId) {
    selectedId = entityStringId || '';
    movePending = false;
    reshapeMode = false;
    selectedWaypointIdx = -1;
    var reshapeBtn = document.getElementById('btnSceneReshape');
    if (reshapeBtn) { reshapeBtn.textContent = 'Reshape'; reshapeBtn.style.color = ''; }
    var reshapeHint = document.getElementById('reshapeHint');
    if (reshapeHint) reshapeHint.style.display = 'none';
    var moveBtn = document.getElementById('btnSceneMove');
    if (moveBtn) moveBtn.textContent = 'Move';
    if (selectedId) {
      attachGizmoLoop();
    } else {
      hideGizmo();
    }
    populateEditPanel(selectedId);
    render();
  }

  function populateEditPanel(entityStringId) {
    var hint = document.getElementById('sceneSelectHint');
    var panel = document.getElementById('sceneSelectPanel');
    var typeLabel = document.getElementById('sceneSelectedType');
    var houseFields = document.getElementById('sceneEditHouse');
    var roadFields = document.getElementById('sceneEditRoad');

    if (!entityStringId) {
      if (hint) hint.style.display = 'block';
      if (panel) panel.style.display = 'none';
      return;
    }
    if (hint) hint.style.display = 'none';
    if (panel) panel.style.display = 'block';

    var reshapeBtn = document.getElementById('btnSceneReshape');

    if (entityStringId.indexOf('mapscene-house-') === 0) {
      var hid = entityStringId.slice('mapscene-house-'.length);
      var house = null;
      for (var i = 0; i < state.houses.length; i++) { if (state.houses[i].id === hid) { house = state.houses[i]; break; } }
      if (!house) return;
      if (typeLabel) typeLabel.textContent = 'House';
      if (houseFields) houseFields.style.display = 'block';
      if (roadFields) roadFields.style.display = 'none';
      if (reshapeBtn) reshapeBtn.style.display = 'none';
      var el;
      el = document.getElementById('editHouseLength'); if (el) el.value = house.lengthM || DEFAULT_HOUSE.lengthM;
      el = document.getElementById('editHouseWidth');  if (el) el.value = house.widthM  || DEFAULT_HOUSE.widthM;
      el = document.getElementById('editHouseHeight'); if (el) el.value = house.heightM || DEFAULT_HOUSE.heightM;
      el = document.getElementById('editHouseHeading'); if (el) el.value = house.headingDeg != null ? house.headingDeg : 0;
    } else if (entityStringId.indexOf('mapscene-road-') === 0) {
      var rid = entityStringId.slice('mapscene-road-'.length);
      var road = null;
      for (var j = 0; j < state.roads.length; j++) { if (state.roads[j].id === rid) { road = state.roads[j]; break; } }
      if (!road) return;
      if (typeLabel) typeLabel.textContent = 'Road';
      if (houseFields) houseFields.style.display = 'none';
      if (roadFields) roadFields.style.display = 'block';
      if (reshapeBtn) reshapeBtn.style.display = 'inline-block';
      var rw = document.getElementById('editRoadWidth'); if (rw) rw.value = road.widthM || DEFAULT_ROAD_WIDTH_M;
      var rh = document.getElementById('editRoadHeight'); if (rh) rh.value = typeof road.heightM === 'number' && road.heightM > 0 ? road.heightM : DEFAULT_ROAD_HEIGHT_M;
      var rl = document.getElementById('editRoadLength');
      if (rl) {
        var lenM = roadLengthM(road.positions);
        rl.textContent = lenM >= 1000 ? (lenM / 1000).toFixed(2) + ' km' : Math.round(lenM) + ' m';
      }
    }
  }

  function applyEdit() {
    if (!selectedId) return;
    if (selectedId.indexOf('mapscene-house-') === 0) {
      var hid = selectedId.slice('mapscene-house-'.length);
      for (var i = 0; i < state.houses.length; i++) {
        if (state.houses[i].id === hid) {
          state.houses[i].lengthM  = getNum('editHouseLength',  DEFAULT_HOUSE.lengthM);
          state.houses[i].widthM   = getNum('editHouseWidth',   DEFAULT_HOUSE.widthM);
          state.houses[i].heightM  = getNum('editHouseHeight',  DEFAULT_HOUSE.heightM);
          var hdg = parseFloat((document.getElementById('editHouseHeading') || {}).value);
          state.houses[i].headingDeg = isNaN(hdg) ? 0 : hdg;
          break;
        }
      }
    } else if (selectedId.indexOf('mapscene-road-') === 0) {
      var rid = selectedId.slice('mapscene-road-'.length);
      for (var j = 0; j < state.roads.length; j++) {
        if (state.roads[j].id === rid) {
          state.roads[j].widthM = getNum('editRoadWidth', DEFAULT_ROAD_WIDTH_M);
          var rhEl = document.getElementById('editRoadHeight');
          var rhVal = rhEl ? parseFloat(rhEl.value) : NaN;
          state.roads[j].heightM = isNaN(rhVal) ? DEFAULT_ROAD_HEIGHT_M : rhVal;
          break;
        }
      }
    }
    saveLocal();
    saveRemote();
    render();
  }

  function moveSelectedTo(ll) {
    if (!selectedId || !ll) return;
    if (selectedId.indexOf('mapscene-house-') === 0) {
      var hid = selectedId.slice('mapscene-house-'.length);
      for (var i = 0; i < state.houses.length; i++) {
        if (state.houses[i].id === hid) { state.houses[i].lon = ll.lon; state.houses[i].lat = ll.lat; break; }
      }
    } else if (selectedId.indexOf('mapscene-road-') === 0) {
      var rid = selectedId.slice('mapscene-road-'.length);
      for (var j = 0; j < state.roads.length; j++) {
        if (state.roads[j].id === rid) {
          var road = state.roads[j];
          var sumLon = 0, sumLat = 0;
          for (var p = 0; p < road.positions.length; p++) { sumLon += road.positions[p][0]; sumLat += road.positions[p][1]; }
          var cLon = sumLon / road.positions.length;
          var cLat = sumLat / road.positions.length;
          var dLon = ll.lon - cLon, dLat = ll.lat - cLat;
          road.positions = road.positions.map(function (pt) { return [pt[0] + dLon, pt[1] + dLat]; });
          break;
        }
      }
    }
    movePending = false;
    var moveBtn = document.getElementById('btnSceneMove');
    if (moveBtn) moveBtn.textContent = 'Move';
    saveLocal();
    saveRemote();
    render();
  }

  function deleteSelected() {
    if (!selectedId) return;
    if (selectedId.indexOf('mapscene-house-') === 0) {
      var hid = selectedId.slice('mapscene-house-'.length);
      state.houses = state.houses.filter(function (h) { return h.id !== hid; });
    } else if (selectedId.indexOf('mapscene-road-') === 0) {
      var rid = selectedId.slice('mapscene-road-'.length);
      state.roads = state.roads.filter(function (r) { return r.id !== rid; });
    }
    selectedId = '';
    movePending = false;
    hideGizmo();
    saveLocal();
    saveRemote();
    populateEditPanel('');
    render();
  }

  // ── Gizmo: move / rotate handles ──────────────────────────────────────────

  function getSelectedCenter() {
    if (!selectedId) return null;
    if (selectedId.indexOf('mapscene-house-') === 0) {
      var hid = selectedId.slice('mapscene-house-'.length);
      for (var i = 0; i < state.houses.length; i++) {
        if (state.houses[i].id === hid) {
          var h = state.houses[i];
          return { lon: h.lon, lat: h.lat, heightM: h.heightM || DEFAULT_HOUSE.heightM, headingDeg: h.headingDeg || 0, type: 'house' };
        }
      }
    }
    if (selectedId.indexOf('mapscene-road-') === 0) {
      var rid = selectedId.slice('mapscene-road-'.length);
      for (var j = 0; j < state.roads.length; j++) {
        if (state.roads[j].id === rid) {
          var road = state.roads[j];
          var sumLon = 0, sumLat = 0;
          for (var p = 0; p < road.positions.length; p++) { sumLon += road.positions[p][0]; sumLat += road.positions[p][1]; }
          return { lon: sumLon / road.positions.length, lat: sumLat / road.positions.length, heightM: 0, headingDeg: 0, type: 'road' };
        }
      }
    }
    return null;
  }

  function getMetersPerPixel() {
    try {
      var ht = viewer.camera.positionCartographic.height;
      var fov = viewer.camera.frustum.fovy || 1.0;
      var ph = viewer.canvas.clientHeight || viewer.canvas.height || 600;
      return 2 * ht * Math.tan(fov / 2) / ph;
    } catch (e) { return 1; }
  }

  function updateGizmoVisibility() {
    var gizmo = document.getElementById('sceneGizmo');
    if (!gizmo || !viewer || !viewer.scene) return;
    if (!selectedId || getTool() !== 'select' || !isSceneEditActive()) {
      gizmo.style.display = 'none';
      return;
    }
    var obj = getSelectedCenter();
    if (!obj) { gizmo.style.display = 'none'; return; }

    var altM = obj.type === 'house' ? obj.heightM / 2 : 1;
    var cart3 = Cesium.Cartesian3.fromDegrees(obj.lon, obj.lat, altM);
    var canvasPos = viewer.scene.cartesianToCanvasCoordinates(cart3, new Cesium.Cartesian2());
    if (!canvasPos) { gizmo.style.display = 'none'; return; }

    var cr = viewer.canvas.getBoundingClientRect();
    var cx = cr.left + canvasPos.x;
    var cy = cr.top + canvasPos.y;
    if (cx < -100 || cy < -100 || cx > window.innerWidth + 100 || cy > window.innerHeight + 100) {
      gizmo.style.display = 'none';
      return;
    }

    gizmo.style.left = Math.round(cx) + 'px';
    gizmo.style.top = Math.round(cy) + 'px';
    gizmo.style.display = 'block';
    gizmoClientPos = { x: cx, y: cy };

    var isHouse = selectedId.indexOf('mapscene-house-') === 0;
    var rotEls = gizmo.querySelectorAll('.gizmo-rot');
    for (var k = 0; k < rotEls.length; k++) {
      rotEls[k].style.display = isHouse ? 'flex' : 'none';
    }
  }

  function attachGizmoLoop() {
    if (postRenderUnsubscribe || !viewer) return;
    postRenderUnsubscribe = viewer.scene.postRender.addEventListener(updateGizmoVisibility);
  }

  function detachGizmoLoop() {
    if (postRenderUnsubscribe) { postRenderUnsubscribe(); postRenderUnsubscribe = null; }
  }

  function hideGizmo() {
    detachGizmoLoop();
    var gizmo = document.getElementById('sceneGizmo');
    if (gizmo) gizmo.style.display = 'none';
  }

  function startGizmoDrag(e, handle) {
    e.preventDefault();
    var obj = getSelectedCenter();
    if (!obj) return;

    var startPositions = null;
    if (selectedId.indexOf('mapscene-road-') === 0) {
      var rid = selectedId.slice('mapscene-road-'.length);
      for (var j = 0; j < state.roads.length; j++) {
        if (state.roads[j].id === rid) {
          startPositions = state.roads[j].positions.map(function (pt) { return [pt[0], pt[1]]; });
          break;
        }
      }
    }

    var startAngle = 0;
    if (handle === 'rotCW' || handle === 'rotCCW') {
      startAngle = Math.atan2(e.clientY - gizmoClientPos.y, e.clientX - gizmoClientPos.x) * (180 / Math.PI);
    }

    var startPickedLon = obj.lon, startPickedLat = obj.lat;
    if (handle !== 'rotCW' && handle !== 'rotCCW') {
      try {
        var cr0 = viewer.canvas.getBoundingClientRect();
        var ray0 = viewer.camera.getPickRay(new Cesium.Cartesian2(e.clientX - cr0.left, e.clientY - cr0.top));
        var pick0 = viewer.scene.globe.pick(ray0, viewer.scene);
        if (pick0) {
          var pc0 = Cesium.Cartographic.fromCartesian(pick0);
          startPickedLon = Cesium.Math.toDegrees(pc0.longitude);
          startPickedLat = Cesium.Math.toDegrees(pc0.latitude);
        }
      } catch (ex) { /* ignore */ }
    }

    gizmoDragState = {
      handle: handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLon: obj.lon,
      startLat: obj.lat,
      startPickedLon: startPickedLon,
      startPickedLat: startPickedLat,
      startHeading: obj.headingDeg,
      startPositions: startPositions,
      startAngle: startAngle,
    };

    if (viewer.scene.screenSpaceCameraController) {
      viewer.scene.screenSpaceCameraController.enableRotate = false;
      viewer.scene.screenSpaceCameraController.enableTranslate = false;
      viewer.scene.screenSpaceCameraController.enableZoom = false;
      viewer.scene.screenSpaceCameraController.enableTilt = false;
    }
  }

  function moveGizmoDrag(e) {
    if (!gizmoDragState) return;
    var ds = gizmoDragState;

    if (ds.handle === 'rotCW' || ds.handle === 'rotCCW') {
      var curAngle = Math.atan2(e.clientY - gizmoClientPos.y, e.clientX - gizmoClientPos.x) * (180 / Math.PI);
      var delta = curAngle - ds.startAngle;
      var newHeading = ((ds.startHeading + delta) % 360 + 360) % 360;
      applyGizmoRotation(newHeading);
      return;
    }

    try {
      var cr = viewer.canvas.getBoundingClientRect();
      var ray = viewer.camera.getPickRay(new Cesium.Cartesian2(e.clientX - cr.left, e.clientY - cr.top));
      var pickedPos = viewer.scene.globe.pick(ray, viewer.scene);
      if (!pickedPos) return;
      var pickedCart = Cesium.Cartographic.fromCartesian(pickedPos);
      var pickedLon = Cesium.Math.toDegrees(pickedCart.longitude);
      var pickedLat = Cesium.Math.toDegrees(pickedCart.latitude);
      var dLon = pickedLon - ds.startPickedLon;
      var dLat = pickedLat - ds.startPickedLat;
      var newLon = ds.startLon, newLat = ds.startLat;
      if (ds.handle === 'center') {
        newLon = ds.startLon + dLon;
        newLat = ds.startLat + dLat;
      } else if (ds.handle === 'N' || ds.handle === 'S') {
        newLat = ds.startLat + dLat;
      } else if (ds.handle === 'E' || ds.handle === 'W') {
        newLon = ds.startLon + dLon;
      }
      applyGizmoPosition(newLon, newLat, ds.startPositions);
    } catch (ex) { /* ignore */ }
  }

  function endGizmoDrag() {
    if (!gizmoDragState) return;
    if (viewer && viewer.scene && viewer.scene.screenSpaceCameraController) {
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableTranslate = true;
      viewer.scene.screenSpaceCameraController.enableZoom = true;
      viewer.scene.screenSpaceCameraController.enableTilt = true;
    }
    gizmoDragState = null;
    saveLocal();
    saveRemote();
    populateEditPanel(selectedId);
  }

  function rerenderHouse(houseId) {
    var prefix = 'mapscene-house-' + houseId;
    var kept = [];
    for (var i = 0; i < entityList.length; i++) {
      var eid = entityList[i] && entityList[i].id;
      if (typeof eid === 'string' && eid.indexOf(prefix) === 0) {
        try { viewer.entities.remove(entityList[i]); } catch (ex) { /* ignore */ }
      } else {
        kept.push(entityList[i]);
      }
    }
    entityList.length = 0;
    for (var j = 0; j < kept.length; j++) entityList.push(kept[j]);
    for (var k = 0; k < state.houses.length; k++) {
      if (state.houses[k].id === houseId) {
        renderHousePolygons(state.houses[k], ('mapscene-house-' + houseId) === selectedId);
        break;
      }
    }
    try { viewer.scene.requestRender(); } catch (ex) { /* ignore */ }
  }

  function applyGizmoPosition(lon, lat, startPositions) {
    if (!selectedId) return;
    if (selectedId.indexOf('mapscene-house-') === 0) {
      var hid = selectedId.slice('mapscene-house-'.length);
      for (var i = 0; i < state.houses.length; i++) {
        if (state.houses[i].id === hid) { state.houses[i].lon = lon; state.houses[i].lat = lat; break; }
      }
      if (gizmoDragState) { rerenderHouse(hid); return; }
    } else if (selectedId.indexOf('mapscene-road-') === 0 && startPositions && gizmoDragState) {
      var rid = selectedId.slice('mapscene-road-'.length);
      var dLon = lon - gizmoDragState.startLon;
      var dLat = lat - gizmoDragState.startLat;
      for (var j = 0; j < state.roads.length; j++) {
        if (state.roads[j].id === rid) {
          state.roads[j].positions = startPositions.map(function (pt) { return [pt[0] + dLon, pt[1] + dLat]; });
          break;
        }
      }
    }
    render();
  }

  function applyGizmoRotation(headingDeg) {
    if (!selectedId || selectedId.indexOf('mapscene-house-') !== 0) return;
    var hid = selectedId.slice('mapscene-house-'.length);
    for (var i = 0; i < state.houses.length; i++) {
      if (state.houses[i].id === hid) {
        state.houses[i].headingDeg = headingDeg;
        var hdgEl = document.getElementById('editHouseHeading');
        if (hdgEl) hdgEl.value = Math.round(headingDeg);
        break;
      }
    }
    if (gizmoDragState) { rerenderHouse(hid); } else { render(); }
  }

  // ── Click handler ──────────────────────────────────────────────────────────

  function handleAdminClick(click) {
    if (!isSceneEditActive()) return false;
    var tool = getTool();
    if (tool === 'none') return false;

    if (tool === 'delete') {
      var did = findMapSceneEntityIdAtClick(click);
      if (did.indexOf('mapscene-house-') === 0) {
        var dhid = did.slice('mapscene-house-'.length);
        state.houses = state.houses.filter(function (h) { return h.id !== dhid; });
        if (selectedId === did) { selectedId = ''; populateEditPanel(''); }
        saveLocal(); saveRemote(); render();
      } else if (did.indexOf('mapscene-road-') === 0) {
        var drid = did.slice('mapscene-road-'.length);
        state.roads = state.roads.filter(function (r) { return r.id !== drid; });
        if (selectedId === did) { selectedId = ''; populateEditPanel(''); }
        saveLocal(); saveRemote(); render();
      }
      return true;
    }

    if (tool === 'select') {
      if (movePending) {
        var mll = pickGlobeDegrees(click);
        if (mll) moveSelectedTo(mll);
        return true;
      }

      var clickedId = findMapSceneEntityIdAtClick(click);

      /* ── Reshape mode: waypoint selection and movement ── */
      if (reshapeMode && selectedId.indexOf('mapscene-road-') === 0) {
        if (clickedId.indexOf('mapscene-wp-') === 0) {
          /* Click on a handle: select that waypoint */
          var wpParts = clickedId.split('-');
          selectedWaypointIdx = parseInt(wpParts[wpParts.length - 1], 10);
          var reshapeHint = document.getElementById('reshapeHint');
          if (reshapeHint) reshapeHint.textContent = 'Now click the map to move waypoint ' + (selectedWaypointIdx + 1);
          render();
          return true;
        }
        if (selectedWaypointIdx >= 0) {
          /* Waypoint is selected: move it to clicked position, re-sample terrain height */
          var wll = pickGlobeDegrees(click);
          if (wll) {
            var newTH = getTerrainHeight(wll.lon, wll.lat);
            var rwid = selectedId.slice('mapscene-road-'.length);
            for (var rj = 0; rj < state.roads.length; rj++) {
              if (state.roads[rj].id === rwid) {
                if (selectedWaypointIdx < state.roads[rj].positions.length) {
                  state.roads[rj].positions[selectedWaypointIdx] = [wll.lon, wll.lat, newTH];
                }
                break;
              }
            }
            selectedWaypointIdx = -1;
            var rHint = document.getElementById('reshapeHint');
            if (rHint) rHint.textContent = 'Click a blue dot to select a waypoint, then click the map to move it';
            saveLocal(); saveRemote();
            populateEditPanel(selectedId);
          }
          render();
          return true;
        }
        /* Clicked blank terrain or different object: stay in reshape mode on same road */
        if (!clickedId || clickedId === selectedId) { render(); return true; }
        /* Clicked a different object: exit reshape and select it */
        reshapeMode = false;
        selectedWaypointIdx = -1;
        var rb = document.getElementById('btnSceneReshape');
        if (rb) { rb.textContent = 'Reshape'; rb.style.color = ''; }
        var rh2 = document.getElementById('reshapeHint');
        if (rh2) rh2.style.display = 'none';
      }

      setSelected(clickedId);
      return true;
    }

    var ll = pickGlobeDegrees(click);
    if (!ll) return true;

    if (tool === 'house') {
      state.houses.push({
        id: newId('h'),
        lon: ll.lon,
        lat: ll.lat,
        lengthM:    getNum('houseLength',  DEFAULT_HOUSE.lengthM),
        widthM:     getNum('houseWidth',   DEFAULT_HOUSE.widthM),
        heightM:    getNum('houseHeight',  DEFAULT_HOUSE.heightM),
        headingDeg: (function () { var v = parseFloat((document.getElementById('houseHeading') || {}).value); return isNaN(v) ? 0 : v; }()),
      });
      saveLocal(); saveRemote(); render();
      return true;
    }

    if (tool === 'road') {
      /* Endpoint snapping: snap to existing road endpoint if within 5 m */
      var SNAP_M = 5;
      var snapped = false;
      var snapTerrainH = null;
      for (var ri = 0; ri < state.roads.length && !snapped; ri++) {
        var rpos = state.roads[ri].positions;
        var endpoints = [rpos[0], rpos[rpos.length - 1]];
        for (var ei = 0; ei < endpoints.length && !snapped; ei++) {
          var ep = endpoints[ei];
          if (haversineM(ll.lon, ll.lat, ep[0], ep[1]) <= SNAP_M) {
            ll = { lon: ep[0], lat: ep[1] };
            snapTerrainH = typeof ep[2] === 'number' ? ep[2] : getTerrainHeight(ep[0], ep[1]);
            snapped = true;
          }
        }
      }
      var terrainH = snapped ? snapTerrainH : getTerrainHeight(ll.lon, ll.lat);
      roadDraft.push({ lon: ll.lon, lat: ll.lat, terrainH: terrainH });
      var countEl = document.getElementById('roadDraftCount');
      if (countEl) countEl.textContent = roadDraft.length;
      render();
      return true;
    }

    return false;
  }

  // ── Road draft ─────────────────────────────────────────────────────────────

  function finishRoadDraft() {
    if (roadDraft.length < 2) { roadDraft = []; render(); return; }
    var rhEl = document.getElementById('roadHeight');
    var rhVal = rhEl ? parseFloat(rhEl.value) : NaN;
    state.roads.push({
      id: newId('r'),
      positions: roadDraft.map(function (p) { return [p.lon, p.lat, p.terrainH || 0]; }),
      widthM: getNum('roadWidth', DEFAULT_ROAD_WIDTH_M),
      heightM: isNaN(rhVal) ? DEFAULT_ROAD_HEIGHT_M : rhVal,
    });
    roadDraft = [];
    var countEl = document.getElementById('roadDraftCount');
    if (countEl) countEl.textContent = '0';
    saveLocal(); saveRemote(); render();
  }

  function cancelRoadDraft() {
    roadDraft = [];
    var countEl = document.getElementById('roadDraftCount');
    if (countEl) countEl.textContent = '0';
    render();
  }

  function undoRoadDraft() {
    if (roadDraft.length === 0) return;
    roadDraft.pop();
    var countEl = document.getElementById('roadDraftCount');
    if (countEl) countEl.textContent = roadDraft.length;
    render();
  }

  function toggleReshapeMode() {
    if (!selectedId || selectedId.indexOf('mapscene-road-') !== 0) return;
    reshapeMode = !reshapeMode;
    selectedWaypointIdx = -1;
    var btn = document.getElementById('btnSceneReshape');
    var hint = document.getElementById('reshapeHint');
    if (reshapeMode) {
      if (btn) { btn.textContent = 'Done'; btn.style.color = '#38bdf8'; }
      if (hint) { hint.style.display = 'block'; hint.textContent = 'Click a blue dot to select a waypoint, then click the map to move it'; }
    } else {
      if (btn) { btn.textContent = 'Reshape'; btn.style.color = ''; }
      if (hint) hint.style.display = 'none';
    }
    render();
  }

  // ── Scene-wide ops ─────────────────────────────────────────────────────────

  function clearAllScene() {
    state = { houses: [], roads: [] };
    roadDraft = [];
    selectedId = '';
    movePending = false;
    populateEditPanel('');
    saveLocal(); saveRemote(); render();
  }

  // ── UI wiring ──────────────────────────────────────────────────────────────

  function syncToolPanel() {
    var tool = getTool();
    var panels = { house: 'sceneToolHouse', road: 'sceneToolRoad', select: 'sceneToolSelect', delete: 'sceneToolDelete' };
    Object.keys(panels).forEach(function (key) {
      var el = document.getElementById(panels[key]);
      if (el) el.style.display = (key === tool) ? 'block' : 'none';
    });
  }

  function isSceneTargetSelected() {
    var radios = document.getElementsByName('adminEditTarget');
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked && radios[i].value === 'scene') return true;
    }
    return false;
  }

  function isSceneEditActive() {
    return !!(window.adminMode && window.adminMode.isEnabled && window.adminMode.isEnabled() && isSceneTargetSelected());
  }

  function syncSceneToolsVisibility() {
    var sceneBox = document.getElementById('adminSceneTools');
    var floodBox = document.getElementById('adminFloodTools');
    var adminOn = !!(window.adminMode && window.adminMode.isEnabled && window.adminMode.isEnabled());
    if (!adminOn) {
      if (sceneBox) sceneBox.style.display = 'none';
      if (floodBox) floodBox.style.display = 'none';
      hideGizmo();
      try { if (window.gridManager && window.gridManager.setSceneEditMode) window.gridManager.setSceneEditMode(false); } catch (e) { /* ignore */ }
      return;
    }
    var sceneOn = isSceneTargetSelected();
    if (sceneBox) sceneBox.style.display = sceneOn ? 'block' : 'none';
    if (floodBox) floodBox.style.display = sceneOn ? 'none' : 'block';
    if (!sceneOn) hideGizmo();
    try { if (window.gridManager && window.gridManager.setSceneEditMode) window.gridManager.setSceneEditMode(sceneOn); } catch (e) { /* ignore */ }
  }

  function wireUi() {
    /* Edit target radio (flood / scene) */
    var targetRadios = document.getElementsByName('adminEditTarget');
    for (var i = 0; i < targetRadios.length; i++) {
      targetRadios[i].addEventListener('change', function () {
        roadDraft = []; selectedId = ''; movePending = false;
        hideGizmo();
        try { render(); } catch (e) { /* ignore */ }
        syncSceneToolsVisibility();
        syncToolPanel();
        try { if (window.gridManager && window.gridManager.updateAllVisuals) window.gridManager.updateAllVisuals(); } catch (e) { /* ignore */ }
      });
    }

    /* Tool selector */
    var toolSel = document.getElementById('adminSceneTool');
    if (toolSel) {
      toolSel.addEventListener('change', function () {
        roadDraft = []; selectedId = ''; movePending = false;
        hideGizmo();
        var countEl = document.getElementById('roadDraftCount');
        if (countEl) countEl.textContent = '0';
        var moveBtn = document.getElementById('btnSceneMove');
        if (moveBtn) moveBtn.textContent = 'Move';
        populateEditPanel('');
        render();
        syncToolPanel();
      });
    }

    /* Road buttons */
    var finishBtn = document.getElementById('btnAdminRoadFinish');
    if (finishBtn) finishBtn.addEventListener('click', finishRoadDraft);

    var undoBtn = document.getElementById('btnAdminRoadUndo');
    if (undoBtn) undoBtn.addEventListener('click', undoRoadDraft);

    var cancelBtn = document.getElementById('btnAdminRoadCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelRoadDraft);

    /* Select / Edit buttons */
    var applyBtn = document.getElementById('btnSceneApply');
    if (applyBtn) applyBtn.addEventListener('click', applyEdit);

    var moveBtn = document.getElementById('btnSceneMove');
    if (moveBtn) {
      moveBtn.addEventListener('click', function () {
        if (!selectedId) return;
        movePending = !movePending;
        moveBtn.textContent = movePending ? 'Click map to place' : 'Move';
      });
    }

    var reshapeBtn = document.getElementById('btnSceneReshape');
    if (reshapeBtn) reshapeBtn.addEventListener('click', toggleReshapeMode);

    var delSelBtn = document.getElementById('btnSceneDeleteSelected');
    if (delSelBtn) {
      delSelBtn.addEventListener('click', function () {
        if (!selectedId) return;
        if (!confirm('Delete this object?')) return;
        deleteSelected();
      });
    }

    /* Save / Clear */
    var saveBtn = document.getElementById('btnAdminSceneSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        try {
          if (window.adminMode && typeof window.adminMode.isFloodEditorAccount === 'function' && !window.adminMode.isFloodEditorAccount()) {
            alert('Only admin accounts can save the scene.');
            return;
          }
        } catch (e) { /* ignore */ }
        saveRemote();
        alert('Scene saved (houses & roads).');
      });
    }

    var clearBtn = document.getElementById('btnAdminSceneClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (!confirm('Remove all placed houses and roads from this map?')) return;
        try {
          if (window.adminMode && typeof window.adminMode.isFloodEditorAccount === 'function' && !window.adminMode.isFloodEditorAccount()) {
            alert('Only admin accounts can clear the scene.');
            return;
          }
        } catch (e) { /* ignore */ }
        clearAllScene();
      });
    }

    /* Gizmo: mousedown delegation on the overlay, move/up at document level */
    var gizmoEl = document.getElementById('sceneGizmo');
    if (gizmoEl) {
      gizmoEl.addEventListener('mousedown', function (e) {
        var target = e.target;
        while (target && target !== gizmoEl) {
          if (target.getAttribute && target.getAttribute('data-handle')) {
            startGizmoDrag(e, target.getAttribute('data-handle'));
            return;
          }
          target = target.parentElement;
        }
      });
    }
    document.addEventListener('mousemove', moveGizmoDrag);
    document.addEventListener('mouseup', endGizmoDrag);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init(v) {
    viewer = v;
    loadLocal();
    wireUi();
    syncToolPanel();
    render();
    pullFromSupabase(null);
  }

  window.mapScene = {
    init: init,
    render: render,
    pullFromSupabase: pullFromSupabase,
    saveRemote: saveRemote,
    handleAdminClick: handleAdminClick,
    isSceneEditActive: isSceneEditActive,
    syncSceneToolsVisibility: syncSceneToolsVisibility,
    clearAllScene: clearAllScene,
    isSupabaseReady: isSupabaseReady,
  };

  loadLocal();
})();
