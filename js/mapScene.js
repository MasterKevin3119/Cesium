/**
 * Admin-placed 3D houses (boxes) and roads (corridors), shared per FLOOD_MAP_ID via Supabase map_scene.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'mapScene_v1';
  const DEFAULT_HOUSE = { lengthM: 14, widthM: 10, heightM: 9, headingDeg: 0 };
  const DEFAULT_ROAD_WIDTH_M = 6;

  let viewer = null;
  /** @type {Cesium.Entity[]} */
  const entityList = [];
  let roadDraft = [];

  let state = { houses: [], roads: [] };

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function normalizeScene() {
    state.houses = (state.houses || []).filter(function (h) {
      return h && typeof h.id === 'string' && typeof h.lon === 'number' && typeof h.lat === 'number';
    });
    state.roads = (state.roads || []).filter(function (r) {
      return r && typeof r.id === 'string' && Array.isArray(r.positions) && r.positions.length >= 2;
    });
  }

  function clearEntities() {
    if (!viewer) return;
    for (let i = 0; i < entityList.length; i++) {
      try { viewer.entities.remove(entityList[i]); } catch (e) { /* ignore */ }
    }
    entityList.length = 0;
  }

  function render() {
    clearEntities();
    if (!viewer) return;
    normalizeScene();

    for (let i = 0; i < state.houses.length; i++) {
      const h = state.houses[i];
      const len = typeof h.lengthM === 'number' && h.lengthM > 0 ? h.lengthM : DEFAULT_HOUSE.lengthM;
      const wid = typeof h.widthM === 'number' && h.widthM > 0 ? h.widthM : DEFAULT_HOUSE.widthM;
      const height = typeof h.heightM === 'number' && h.heightM > 0 ? h.heightM : DEFAULT_HOUSE.heightM;
      const heading = typeof h.headingDeg === 'number' ? h.headingDeg : DEFAULT_HOUSE.headingDeg;
      const half = height / 2;
      const cart = Cesium.Cartesian3.fromDegrees(h.lon, h.lat, half);
      const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(heading), 0, 0);
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(cart, hpr);
      const e = viewer.entities.add({
        id: 'mapscene-house-' + h.id,
        name: 'House',
        position: new Cesium.ConstantPositionProperty(cart, undefined, Cesium.HeightReference.RELATIVE_TO_GROUND),
        orientation: orientation,
        box: {
          dimensions: new Cesium.Cartesian3(len, wid, height),
          fill: true,
          material: Cesium.Color.BURLYWOOD.withAlpha(0.92),
          outline: true,
          outlineColor: Cesium.Color.SADDLEBROWN,
        },
      });
      entityList.push(e);
    }

    for (let r = 0; r < state.roads.length; r++) {
      const road = state.roads[r];
      const flat = [];
      for (let p = 0; p < road.positions.length; p++) {
        const pt = road.positions[p];
        if (Array.isArray(pt) && pt.length >= 2) {
          flat.push(pt[0], pt[1]);
        }
      }
      if (flat.length < 4) continue;
      const width = typeof road.widthM === 'number' && road.widthM > 0 ? road.widthM : DEFAULT_ROAD_WIDTH_M;
      const e = viewer.entities.add({
        id: 'mapscene-road-' + road.id,
        name: 'Road',
        corridor: {
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: width,
          height: 0.25,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          cornerType: Cesium.CornerType.ROUNDED,
          material: Cesium.Color.DIMGRAY.withAlpha(0.95),
          outline: true,
          outlineColor: Cesium.Color.BLACK,
        },
      });
      entityList.push(e);
    }

    /* Draft road polyline preview */
    if (roadDraft.length >= 2) {
      const flat = [];
      for (let d = 0; d < roadDraft.length; d++) {
        flat.push(roadDraft[d].lon, roadDraft[d].lat);
      }
      const e = viewer.entities.add({
        id: 'mapscene-road-draft',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: 3,
          material: Cesium.Color.YELLOW.withAlpha(0.85),
          clampToGround: true,
        },
      });
      entityList.push(e);
    }
  }

  function getTool() {
    const sel = document.getElementById('adminSceneTool');
    return sel ? String(sel.value || 'none') : 'none';
  }

  function isSceneTargetSelected() {
    const radios = document.getElementsByName('adminEditTarget');
    for (let i = 0; i < radios.length; i++) {
      if (radios[i].checked && radios[i].value === 'scene') return true;
    }
    return false;
  }

  function isSceneEditActive() {
    return !!(window.adminMode && window.adminMode.isEnabled && window.adminMode.isEnabled() &&
      isSceneTargetSelected());
  }

  /**
   * Resolve entity id from a pick or drillPick result (Entity API vs raw primitive).
   */
  function entityStringIdFromPickResult(picked) {
    if (!picked) return '';
    var e = picked.id;
    if (e) {
      if (typeof e.id === 'string') return e.id;
      if (e.id != null) return String(e.id);
    }
    var prim = picked.primitive;
    if (prim && prim.id) {
      if (typeof prim.id === 'object' && prim.id !== null && prim.id.id != null) {
        return String(prim.id.id);
      }
      if (typeof prim.id === 'string') return prim.id;
    }
    return '';
  }

  /**
   * Flood zone rectangles and other overlays often sit in front of boxes/roads; pick() only sees the top layer.
   */
  function findMapSceneEntityIdAtClick(click) {
    if (!viewer || !viewer.scene) return '';
    var results = viewer.scene.drillPick(click.position, 48);
    if (!results || results.length === 0) return '';
    for (var i = 0; i < results.length; i++) {
      var sid = entityStringIdFromPickResult(results[i]);
      if (sid.indexOf('mapscene-house-') === 0 || sid.indexOf('mapscene-road-') === 0) return sid;
    }
    return '';
  }

  function pickGlobeDegrees(click) {
    if (!viewer) return null;
    const ray = viewer.camera.getPickRay(click.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return null;
    const c = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      lon: Cesium.Math.toDegrees(c.longitude),
      lat: Cesium.Math.toDegrees(c.latitude),
    };
  }

  function handleAdminClick(click) {
    if (!isSceneEditActive()) return false;
    const tool = getTool();
    if (tool === 'none') return false;

    if (tool === 'delete') {
      const id = findMapSceneEntityIdAtClick(click);
      if (id.indexOf('mapscene-house-') === 0) {
        const hid = id.slice('mapscene-house-'.length);
        state.houses = state.houses.filter(function (h) { return h.id !== hid; });
        saveLocal();
        saveRemote();
        render();
        return true;
      }
      if (id.indexOf('mapscene-road-') === 0) {
        const rid = id.slice('mapscene-road-'.length);
        state.roads = state.roads.filter(function (r) { return r.id !== rid; });
        saveLocal();
        saveRemote();
        render();
        return true;
      }
      return true;
    }

    const ll = pickGlobeDegrees(click);
    if (!ll) return true;

    if (tool === 'house') {
      state.houses.push({
        id: newId('h'),
        lon: ll.lon,
        lat: ll.lat,
        lengthM: DEFAULT_HOUSE.lengthM,
        widthM: DEFAULT_HOUSE.widthM,
        heightM: DEFAULT_HOUSE.heightM,
        headingDeg: DEFAULT_HOUSE.headingDeg,
      });
      saveLocal();
      saveRemote();
      render();
      return true;
    }

    if (tool === 'road') {
      roadDraft.push({ lon: ll.lon, lat: ll.lat });
      render();
      return true;
    }

    return false;
  }

  function finishRoadDraft() {
    if (roadDraft.length < 2) {
      roadDraft = [];
      render();
      return;
    }
    const positions = roadDraft.map(function (p) { return [p.lon, p.lat]; });
    state.roads.push({
      id: newId('r'),
      positions: positions,
      widthM: DEFAULT_ROAD_WIDTH_M,
    });
    roadDraft = [];
    saveLocal();
    saveRemote();
    render();
  }

  function clearAllScene() {
    state = { houses: [], roads: [] };
    roadDraft = [];
    saveLocal();
    saveRemote();
    render();
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
      window.supabaseAuth.getAuthForApi(function (auth) {
        doSave(auth);
      });
    }
  }

  function pullFromSupabase(done) {
    if (!isSupabaseReady()) {
      if (typeof done === 'function') done(false);
      return;
    }
    var base = window.FLOOD_SUPABASE_URL.replace(/\/$/, '');
    var anonKey = window.FLOOD_SUPABASE_ANON_KEY;
    function doPull(auth) {
      var mid = mapId();
      var url = base + '/rest/v1/map_scene?map_id=eq.' + encodeURIComponent(mid) + '&select=scene';
      var token = auth ? auth.token : anonKey;
      var headers = { apikey: anonKey, Authorization: 'Bearer ' + token };
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
          render();
          if (typeof done === 'function') done(true);
        })
        .catch(function (e) {
          console.warn('[mapScene] Supabase pull:', e.message || e);
          if (typeof done === 'function') done(false);
        });
    }
    if (window.supabaseAuth && typeof window.supabaseAuth.getAuthForApi === 'function') {
      window.supabaseAuth.getAuthForApi(doPull);
    } else {
      doPull(null);
    }
  }

  function syncSceneToolsVisibility() {
    var sceneBox = document.getElementById('adminSceneTools');
    var floodBox = document.getElementById('adminFloodTools');
    var adminOn = !!(window.adminMode && window.adminMode.isEnabled && window.adminMode.isEnabled());
    if (!adminOn) {
      if (sceneBox) sceneBox.style.display = 'none';
      if (floodBox) floodBox.style.display = 'none';
      return;
    }
    var sceneOn = isSceneTargetSelected();
    if (sceneBox) sceneBox.style.display = sceneOn ? 'block' : 'none';
    if (floodBox) floodBox.style.display = sceneOn ? 'none' : 'block';
  }

  function wireUi() {
    var floodRadios = document.getElementsByName('adminEditTarget');
    for (var i = 0; i < floodRadios.length; i++) {
      floodRadios[i].addEventListener('change', function () {
        roadDraft = [];
        try { render(); } catch (e) { /* ignore */ }
        syncSceneToolsVisibility();
        try { if (window.gridManager && window.gridManager.updateAllVisuals) window.gridManager.updateAllVisuals(); } catch (e) { /* ignore */ }
      });
    }
    var toolSel = document.getElementById('adminSceneTool');
    if (toolSel) {
      toolSel.addEventListener('change', function () {
        roadDraft = [];
        render();
      });
    }
    var finishBtn = document.getElementById('btnAdminRoadFinish');
    if (finishBtn) {
      finishBtn.addEventListener('click', function () {
        finishRoadDraft();
      });
    }
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
  }

  function init(v) {
    viewer = v;
    loadLocal();
    wireUi();
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
