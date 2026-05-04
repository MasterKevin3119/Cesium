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
  let selectedId = '';   // entity string id of selected object (e.g. "mapscene-house-xxx")
  let movePending = false;
  let gizmoDragState = null;        // active drag descriptor or null
  let postRenderUnsubscribe = null; // removes postRender listener when called
  let gizmoClientPos = { x: 0, y: 0 }; // cached client-space center of gizmo

  let state = { houses: [], roads: [] };

  // ── Helpers ────────────────────────────────────────────────────────────────

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

  // ── Rendering ──────────────────────────────────────────────────────────────

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

    for (var i = 0; i < state.houses.length; i++) {
      var h = state.houses[i];
      var len = typeof h.lengthM === 'number' && h.lengthM > 0 ? h.lengthM : DEFAULT_HOUSE.lengthM;
      var wid = typeof h.widthM === 'number' && h.widthM > 0 ? h.widthM : DEFAULT_HOUSE.widthM;
      var height = typeof h.heightM === 'number' && h.heightM > 0 ? h.heightM : DEFAULT_HOUSE.heightM;
      var heading = typeof h.headingDeg === 'number' ? h.headingDeg : DEFAULT_HOUSE.headingDeg;
      var half = height / 2;
      var eid = 'mapscene-house-' + h.id;
      var isSelected = eid === selectedId;
      var cart = Cesium.Cartesian3.fromDegrees(h.lon, h.lat, half);
      var hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(heading), 0, 0);
      var orientation = Cesium.Transforms.headingPitchRollQuaternion(cart, hpr);
      var e = viewer.entities.add({
        id: eid,
        name: 'House',
        position: new Cesium.ConstantPositionProperty(cart, undefined, Cesium.HeightReference.RELATIVE_TO_GROUND),
        orientation: orientation,
        box: {
          dimensions: new Cesium.Cartesian3(len, wid, height),
          fill: true,
          material: isSelected ? Cesium.Color.GOLD.withAlpha(0.92) : Cesium.Color.BURLYWOOD.withAlpha(0.92),
          outline: true,
          outlineColor: isSelected ? Cesium.Color.YELLOW : Cesium.Color.SADDLEBROWN,
          outlineWidth: isSelected ? 3 : 1,
        },
      });
      entityList.push(e);
    }

    for (var r = 0; r < state.roads.length; r++) {
      var road = state.roads[r];
      var flat = [];
      for (var p = 0; p < road.positions.length; p++) {
        var pt = road.positions[p];
        if (Array.isArray(pt) && pt.length >= 2) flat.push(pt[0], pt[1]);
      }
      if (flat.length < 4) continue;
      var rwidth = typeof road.widthM === 'number' && road.widthM > 0 ? road.widthM : DEFAULT_ROAD_WIDTH_M;
      var reid = 'mapscene-road-' + road.id;
      var rSelected = reid === selectedId;
      var re = viewer.entities.add({
        id: reid,
        name: 'Road',
        corridor: {
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: rwidth,
          height: 0.25,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          cornerType: Cesium.CornerType.ROUNDED,
          material: rSelected ? Cesium.Color.GOLD.withAlpha(0.9) : Cesium.Color.DIMGRAY.withAlpha(0.95),
          outline: true,
          outlineColor: rSelected ? Cesium.Color.YELLOW : Cesium.Color.BLACK,
        },
      });
      entityList.push(re);
    }

    /* Draft road polyline preview */
    if (roadDraft.length >= 2) {
      var dflat = [];
      for (var d = 0; d < roadDraft.length; d++) dflat.push(roadDraft[d].lon, roadDraft[d].lat);
      var de = viewer.entities.add({
        id: 'mapscene-road-draft',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(dflat),
          width: 3,
          material: Cesium.Color.YELLOW.withAlpha(0.85),
          clampToGround: true,
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
      if (sid.indexOf('mapscene-house-') === 0 || sid.indexOf('mapscene-road-') === 0) return sid;
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

    if (entityStringId.indexOf('mapscene-house-') === 0) {
      var hid = entityStringId.slice('mapscene-house-'.length);
      var house = null;
      for (var i = 0; i < state.houses.length; i++) { if (state.houses[i].id === hid) { house = state.houses[i]; break; } }
      if (!house) return;
      if (typeLabel) typeLabel.textContent = 'House';
      if (houseFields) houseFields.style.display = 'block';
      if (roadFields) roadFields.style.display = 'none';
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
      var rw = document.getElementById('editRoadWidth'); if (rw) rw.value = road.widthM || DEFAULT_ROAD_WIDTH_M;
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

    gizmoDragState = {
      handle: handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLon: obj.lon,
      startLat: obj.lat,
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
    var dx = e.clientX - ds.startMouseX;
    var dy = e.clientY - ds.startMouseY;

    if (ds.handle === 'rotCW' || ds.handle === 'rotCCW') {
      var curAngle = Math.atan2(e.clientY - gizmoClientPos.y, e.clientX - gizmoClientPos.x) * (180 / Math.PI);
      var delta = curAngle - ds.startAngle;
      var newHeading = ((ds.startHeading + delta) % 360 + 360) % 360;
      applyGizmoRotation(newHeading);
      return;
    }

    var mpp = getMetersPerPixel();
    var cosLat = Math.cos(Cesium.Math.toRadians(ds.startLat));
    var LAT_DEG = 1 / 111320;
    var LON_DEG = cosLat > 0.01 ? 1 / (111320 * cosLat) : 1 / 111320;
    var newLon = ds.startLon, newLat = ds.startLat;

    if (ds.handle === 'center') {
      newLon = ds.startLon + dx * mpp * LON_DEG;
      newLat = ds.startLat - dy * mpp * LAT_DEG;
    } else if (ds.handle === 'N' || ds.handle === 'S') {
      newLat = ds.startLat - dy * mpp * LAT_DEG;
    } else if (ds.handle === 'E' || ds.handle === 'W') {
      newLon = ds.startLon + dx * mpp * LON_DEG;
    }

    applyGizmoPosition(newLon, newLat, ds.startPositions);
    try { viewer.scene.requestRender(); } catch (ex) { /* ignore */ }
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

  function applyGizmoPosition(lon, lat, startPositions) {
    if (!selectedId) return;
    if (selectedId.indexOf('mapscene-house-') === 0) {
      var hid = selectedId.slice('mapscene-house-'.length);
      for (var i = 0; i < state.houses.length; i++) {
        if (state.houses[i].id === hid) { state.houses[i].lon = lon; state.houses[i].lat = lat; break; }
      }
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
    render();
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
      var sid = findMapSceneEntityIdAtClick(click);
      setSelected(sid);
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
      roadDraft.push({ lon: ll.lon, lat: ll.lat });
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
    state.roads.push({
      id: newId('r'),
      positions: roadDraft.map(function (p) { return [p.lon, p.lat]; }),
      widthM: getNum('roadWidth', DEFAULT_ROAD_WIDTH_M),
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
