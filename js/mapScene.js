/**
 * Admin-placed 3D houses (boxes) and roads (corridors), shared per FLOOD_MAP_ID via Supabase map_scene.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'mapScene_v1';
  const DEFAULT_HOUSE = { lengthM: 14, widthM: 10, heightM: 9, headingDeg: 0, colorHex: '#deb887' };
  const DEFAULT_ROAD_WIDTH_M = 6;

  let viewer = null;
  /** @type {string|null} */
  let selectedHouseId = null;
  /** While true, house form `input` handlers ignore updates (programmatic fill). */
  let houseFormSkipLive = false;
  /** @type {number|null} */
  let liveRemoteTimer = null;
  /** @type {Cesium.ScreenSpaceEventHandler|null} */
  let houseRotateHandler = null;
  let houseRotateDragging = false;
  let houseRotateLastX = 0;
  /** Saved camera flags while dragging rotate (restore on mouse up). */
  let houseRotateCamSaved = null;
  /** Visual transform mode from on-map toolbar: none | rotate | resize */
  let manipMode = 'none';
  const MANIP_NONE = 'none';
  const MANIP_ROTATE = 'rotate';
  const MANIP_RESIZE = 'resize';
  let resizePointerDragging = false;
  /** @type {string} 'len' | 'wid' | 'hgt' */
  let resizeDragAxis = '';
  let lastManipDragEndMs = 0;
  /** Arc-style rotate: screen pivot + last pointer angle (rad), view-independent. */
  let rotateArcValid = false;
  let rotateArcCx = 0;
  let rotateArcCy = 0;
  let rotateLastAngleRad = 0;
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

  function clampNum(n, lo, hi, fallback) {
    const x = Number(n);
    if (isNaN(x)) return fallback;
    return Math.min(hi, Math.max(lo, x));
  }

  function cesiumColorFromHex(hex) {
    var h = typeof hex === 'string' ? hex.trim() : '';
    if (!h || h[0] !== '#') return Cesium.Color.BURLYWOOD.withAlpha(0.92);
    var m = h.slice(1);
    if (m.length === 3) {
      m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    }
    if (m.length !== 6 || /[^0-9a-f]/i.test(m)) return Cesium.Color.BURLYWOOD.withAlpha(0.92);
    var r = parseInt(m.slice(0, 2), 16) / 255;
    var g = parseInt(m.slice(2, 4), 16) / 255;
    var b = parseInt(m.slice(4, 6), 16) / 255;
    return new Cesium.Color(r, g, b, 0.92);
  }

  function outlineColorFromFill(c) {
    return new Cesium.Color(c.red * 0.5, c.green * 0.42, c.blue * 0.35, 1);
  }

  function readHousePropsFromForm() {
    var lenEl = document.getElementById('adminHouseLen');
    var widEl = document.getElementById('adminHouseWid');
    var hgtEl = document.getElementById('adminHouseHgt');
    var headEl = document.getElementById('adminHouseHeading');
    var colEl = document.getElementById('adminHouseColor');
    return {
      lengthM: clampNum(lenEl && lenEl.value, 0.5, 500, DEFAULT_HOUSE.lengthM),
      widthM: clampNum(widEl && widEl.value, 0.5, 500, DEFAULT_HOUSE.widthM),
      heightM: clampNum(hgtEl && hgtEl.value, 0.5, 500, DEFAULT_HOUSE.heightM),
      headingDeg: clampNum(headEl && headEl.value, -720, 720, 0),
      colorHex: (colEl && typeof colEl.value === 'string' && colEl.value[0] === '#') ? colEl.value : DEFAULT_HOUSE.colorHex,
    };
  }

  function writeHousePropsToForm(h) {
    houseFormSkipLive = true;
    try {
      var lenEl = document.getElementById('adminHouseLen');
      var widEl = document.getElementById('adminHouseWid');
      var hgtEl = document.getElementById('adminHouseHgt');
      var headEl = document.getElementById('adminHouseHeading');
      var colEl = document.getElementById('adminHouseColor');
      var len = typeof h.lengthM === 'number' && h.lengthM > 0 ? h.lengthM : DEFAULT_HOUSE.lengthM;
      var wid = typeof h.widthM === 'number' && h.widthM > 0 ? h.widthM : DEFAULT_HOUSE.widthM;
      var height = typeof h.heightM === 'number' && h.heightM > 0 ? h.heightM : DEFAULT_HOUSE.heightM;
      var heading = typeof h.headingDeg === 'number' ? h.headingDeg : DEFAULT_HOUSE.headingDeg;
      var col = typeof h.colorHex === 'string' && h.colorHex[0] === '#' ? h.colorHex : DEFAULT_HOUSE.colorHex;
      if (lenEl) lenEl.value = String(len);
      if (widEl) widEl.value = String(wid);
      if (hgtEl) hgtEl.value = String(height);
      if (headEl) headEl.value = String(heading);
      if (colEl) colEl.value = col;
    } finally {
      houseFormSkipLive = false;
    }
  }

  function updateHouseSelectionHint() {
    var el = document.getElementById('adminHouseSelectionHint');
    if (!el) return;
    if (!selectedHouseId) {
      el.textContent = 'No house selected.';
      return;
    }
    el.textContent = 'Selected: ' + selectedHouseId + ' — ↻ then drag the gold dot to rotate; bars → red/green/blue resize. ✓ Done deselects. Numbers = live; Apply = save.';
  }

  function getSelectedHouseObject() {
    if (!selectedHouseId) return null;
    return state.houses.find(function (x) { return x.id === selectedHouseId; }) || null;
  }

  function scheduleRemoteSave() {
    if (liveRemoteTimer) clearTimeout(liveRemoteTimer);
    liveRemoteTimer = setTimeout(function () {
      liveRemoteTimer = null;
      saveRemote();
    }, 450);
  }

  function flushPendingRemoteSave() {
    if (liveRemoteTimer) {
      clearTimeout(liveRemoteTimer);
      liveRemoteTimer = null;
    }
    saveRemote();
  }

  function liveApplySelectedHouseFromForm() {
    if (houseFormSkipLive || !selectedHouseId) return;
    var idx = state.houses.findIndex(function (x) { return x.id === selectedHouseId; });
    if (idx === -1) {
      clearHouseSelection();
      return;
    }
    var p = readHousePropsFromForm();
    var h = state.houses[idx];
    h.lengthM = p.lengthM;
    h.widthM = p.widthM;
    h.heightM = p.heightM;
    h.headingDeg = p.headingDeg;
    h.colorHex = p.colorHex;
    saveLocal();
    render();
    scheduleRemoteSave();
  }

  function canUseRotateDrag() {
    if (!isSceneEditActive() || !selectedHouseId) return false;
    if (getTool() !== 'edit_house') return false;
    return manipMode === MANIP_ROTATE;
  }

  function canUseResizeManip() {
    return !!(isSceneEditActive() && manipMode === MANIP_RESIZE && selectedHouseId);
  }

  function normalizeHeadingDegrees(deg) {
    return Cesium.Math.toDegrees(Cesium.Math.negativePiToPi(Cesium.Math.toRadians(deg)));
  }

  function endHouseRotateDrag() {
    var hadDrag = houseRotateDragging || resizePointerDragging;
    houseRotateDragging = false;
    resizePointerDragging = false;
    resizeDragAxis = '';
    rotateArcValid = false;
    if (viewer && viewer.scene && viewer.scene.screenSpaceCameraController) {
      var sscc = viewer.scene.screenSpaceCameraController;
      if (houseRotateCamSaved) {
        sscc.enableRotate = houseRotateCamSaved.rotate;
        sscc.enableTranslate = houseRotateCamSaved.translate;
        houseRotateCamSaved = null;
      } else {
        sscc.enableRotate = true;
        sscc.enableTranslate = true;
      }
    }
    if (hadDrag) lastManipDragEndMs = Date.now();
    flushPendingRemoteSave();
  }

  function attachHouseRotateHandler() {
    if (!viewer || houseRotateHandler) return;
    houseRotateHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    houseRotateHandler.setInputAction(function (click) {
      var axis = findResizeHandlePick(click);
      if (axis && canUseResizeManip()) {
        var sscc0 = viewer.scene.screenSpaceCameraController;
        if (!houseRotateCamSaved) {
          houseRotateCamSaved = { rotate: sscc0.enableRotate, translate: sscc0.enableTranslate };
        }
        resizePointerDragging = true;
        resizeDragAxis = axis;
        houseRotateLastX = click.position.x;
        sscc0.enableRotate = false;
        sscc0.enableTranslate = false;
        return;
      }
      if (!canUseRotateDrag()) return;
      if (!getSelectedHouseObject()) return;
      if (manipMode === MANIP_ROTATE && !findRotateHandleNubPick(click)) return;
      var sscc = viewer.scene.screenSpaceCameraController;
      if (!houseRotateCamSaved) {
        houseRotateCamSaved = { rotate: sscc.enableRotate, translate: sscc.enableTranslate };
      }
      houseRotateDragging = true;
      houseRotateLastX = click.position.x;
      sscc.enableRotate = false;
      sscc.enableTranslate = false;
      rotateArcValid = false;
      var h0 = getSelectedHouseObject();
      if (h0) {
        var hg0 = typeof h0.heightM === 'number' && h0.heightM > 0 ? h0.heightM : DEFAULT_HOUSE.heightM;
        var cart0 = Cesium.Cartesian3.fromDegrees(h0.lon, h0.lat, hg0 / 2);
        var wc0 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, cart0);
        if (Cesium.defined(wc0)) {
          rotateArcCx = wc0.x;
          rotateArcCy = wc0.y;
          rotateLastAngleRad = Math.atan2(click.position.y - rotateArcCy, click.position.x - rotateArcCx);
          rotateArcValid = true;
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    houseRotateHandler.setInputAction(function (movement) {
      var pos = movement.endPosition || movement.startPosition;
      if (!pos) return;
      if (resizePointerDragging && resizeDragAxis) {
        var hR = getSelectedHouseObject();
        if (!hR || !canUseResizeManip()) {
          endHouseRotateDrag();
          return;
        }
        var dxR = pos.x - houseRotateLastX;
        houseRotateLastX = pos.x;
        var sens = 0.065;
        if (resizeDragAxis === 'len') {
          hR.lengthM = clampNum(hR.lengthM + dxR * sens, 0.5, 500, DEFAULT_HOUSE.lengthM);
        } else if (resizeDragAxis === 'wid') {
          hR.widthM = clampNum(hR.widthM + dxR * sens, 0.5, 500, DEFAULT_HOUSE.widthM);
        } else if (resizeDragAxis === 'hgt') {
          hR.heightM = clampNum(hR.heightM + dxR * sens, 0.5, 500, DEFAULT_HOUSE.heightM);
        }
        houseFormSkipLive = true;
        try {
          writeHousePropsToForm(hR);
        } finally {
          houseFormSkipLive = false;
        }
        saveLocal();
        render();
        scheduleRemoteSave();
        return;
      }
      if (!houseRotateDragging || !canUseRotateDrag()) return;
      var h = getSelectedHouseObject();
      if (!h) {
        endHouseRotateDrag();
        return;
      }
      if (rotateArcValid) {
        var ang = Math.atan2(pos.y - rotateArcCy, pos.x - rotateArcCx);
        var d = ang - rotateLastAngleRad;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        h.headingDeg = normalizeHeadingDegrees(h.headingDeg + Cesium.Math.toDegrees(d));
        rotateLastAngleRad = ang;
      } else {
        var x = pos.x;
        var dx = x - houseRotateLastX;
        houseRotateLastX = x;
        h.headingDeg = normalizeHeadingDegrees(h.headingDeg + dx * 0.22);
      }
      houseFormSkipLive = true;
      try {
        var headEl = document.getElementById('adminHouseHeading');
        if (headEl) headEl.value = String(Math.round(h.headingDeg * 100) / 100);
      } finally {
        houseFormSkipLive = false;
      }
      saveLocal();
      render();
      scheduleRemoteSave();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    houseRotateHandler.setInputAction(function () {
      if (houseRotateDragging || resizePointerDragging) endHouseRotateDrag();
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    if (!attachHouseRotateHandler._docMouseUp) {
      attachHouseRotateHandler._docMouseUp = true;
      document.addEventListener('mouseup', function () {
        try {
          if (houseRotateDragging || resizePointerDragging) endHouseRotateDrag();
        } catch (e) { /* ignore */ }
      });
    }
  }

  function clearHouseSelection() {
    endHouseRotateDrag();
    selectedHouseId = null;
    manipMode = MANIP_NONE;
    syncManipToolbarButtons();
    updateHouseSelectionHint();
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
      const fillColor = cesiumColorFromHex(typeof h.colorHex === 'string' ? h.colorHex : DEFAULT_HOUSE.colorHex);
      const lineColor = outlineColorFromFill(fillColor);
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
          material: fillColor,
          outline: true,
          outlineColor: lineColor,
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

    if (manipMode === MANIP_RESIZE && selectedHouseId) {
      var selH = state.houses.find(function (z) { return z.id === selectedHouseId; });
      if (selH) appendResizeHandlesForHouse(selH);
    }
    if (manipMode === MANIP_ROTATE && selectedHouseId) {
      var selR = state.houses.find(function (z2) { return z2.id === selectedHouseId; });
      if (selR) appendRotateHandleForHouse(selR);
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

  /** @returns {string} internal house id or '' (skips resize handles in front of the box) */
  function findMapSceneHouseInternalIdAtClick(click) {
    if (!viewer || !viewer.scene) return '';
    var results = viewer.scene.drillPick(click.position, 48);
    for (var i = 0; i < results.length; i++) {
      var sid = entityStringIdFromPickResult(results[i]);
      if (sid.indexOf('mapscene-handle-') === 0) continue;
      if (sid.indexOf('mapscene-rotate-handle-') === 0) continue;
      if (sid.indexOf('mapscene-house-') === 0) return sid.slice('mapscene-house-'.length);
    }
    return '';
  }

  /** @returns {'len'|'wid'|'hgt'|null} */
  function findResizeHandlePick(click) {
    if (!viewer || !viewer.scene || !selectedHouseId || manipMode !== MANIP_RESIZE) return null;
    var results = viewer.scene.drillPick(click.position, 48);
    for (var j = 0; j < results.length; j++) {
      var sid = entityStringIdFromPickResult(results[j]);
      if (sid.indexOf('mapscene-handle-') !== 0) continue;
      var rest = sid.slice('mapscene-handle-'.length);
      var lastDash = rest.lastIndexOf('-');
      if (lastDash <= 0) continue;
      var hid = rest.slice(0, lastDash);
      var ax = rest.slice(lastDash + 1);
      if (hid !== selectedHouseId) continue;
      if (ax === 'len' || ax === 'wid' || ax === 'hgt') return ax;
    }
    return null;
  }

  function appendResizeHandlesForHouse(h) {
    const len = typeof h.lengthM === 'number' && h.lengthM > 0 ? h.lengthM : DEFAULT_HOUSE.lengthM;
    const wid = typeof h.widthM === 'number' && h.widthM > 0 ? h.widthM : DEFAULT_HOUSE.widthM;
    const height = typeof h.heightM === 'number' && h.heightM > 0 ? h.heightM : DEFAULT_HOUSE.heightM;
    const heading = typeof h.headingDeg === 'number' ? h.headingDeg : DEFAULT_HOUSE.headingDeg;
    const half = height / 2;
    const cart = Cesium.Cartesian3.fromDegrees(h.lon, h.lat, half);
    const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(heading), 0, 0);
    const q = Cesium.Transforms.headingPitchRollQuaternion(cart, hpr);
    const rotM = Cesium.Matrix3.fromQuaternion(q);
    const HANDLE_PAD = 1.5;
    function axisWorldPos(unitLocal, halfDim) {
      var scaled = Cesium.Cartesian3.multiplyByScalar(unitLocal, halfDim + HANDLE_PAD, new Cesium.Cartesian3());
      Cesium.Matrix3.multiplyByVector(rotM, scaled, scaled);
      return Cesium.Cartesian3.add(cart, scaled, new Cesium.Cartesian3());
    }
    const posLen = axisWorldPos(Cesium.Cartesian3.UNIT_X, len / 2);
    const posWid = axisWorldPos(Cesium.Cartesian3.UNIT_Y, wid / 2);
    const posHgt = axisWorldPos(Cesium.Cartesian3.UNIT_Z, height / 2);
    function mk(pos, suffix, col) {
      var ent = viewer.entities.add({
        id: 'mapscene-handle-' + h.id + '-' + suffix,
        position: pos,
        point: {
          pixelSize: 16,
          color: col,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entityList.push(ent);
    }
    mk(posLen, 'len', Cesium.Color.CRIMSON);
    mk(posWid, 'wid', Cesium.Color.LIME);
    mk(posHgt, 'hgt', Cesium.Color.DODGERBLUE);
  }

  /** Gold dot beside the house — drag this (not empty map) when using toolbar rotate mode. */
  function appendRotateHandleForHouse(h) {
    const len = typeof h.lengthM === 'number' && h.lengthM > 0 ? h.lengthM : DEFAULT_HOUSE.lengthM;
    const wid = typeof h.widthM === 'number' && h.widthM > 0 ? h.widthM : DEFAULT_HOUSE.widthM;
    const height = typeof h.heightM === 'number' && h.heightM > 0 ? h.heightM : DEFAULT_HOUSE.heightM;
    const heading = typeof h.headingDeg === 'number' ? h.headingDeg : DEFAULT_HOUSE.headingDeg;
    const half = height / 2;
    const cart = Cesium.Cartesian3.fromDegrees(h.lon, h.lat, half);
    const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(heading), 0, 0);
    const q = Cesium.Transforms.headingPitchRollQuaternion(cart, hpr);
    const rotM = Cesium.Matrix3.fromQuaternion(q);
    const rad = Math.max(len, wid) / 2 + 2.8;
    var off = Cesium.Cartesian3.multiplyByScalar(Cesium.Cartesian3.UNIT_Y, rad, new Cesium.Cartesian3());
    Cesium.Matrix3.multiplyByVector(rotM, off, off);
    const pos = Cesium.Cartesian3.add(cart, off, new Cesium.Cartesian3());
    var ent = viewer.entities.add({
      id: 'mapscene-rotate-handle-' + h.id,
      position: pos,
      point: {
        pixelSize: 18,
        color: Cesium.Color.GOLD,
        outlineColor: Cesium.Color.SADDLEBROWN,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    entityList.push(ent);
  }

  function findRotateHandleNubPick(click) {
    if (!viewer || !viewer.scene || !selectedHouseId) return false;
    var want = 'mapscene-rotate-handle-' + selectedHouseId;
    var results = viewer.scene.drillPick(click.position, 48);
    for (var k = 0; k < results.length; k++) {
      if (entityStringIdFromPickResult(results[k]) === want) return true;
    }
    return false;
  }

  function syncManipToolbarButtons() {
    var br = document.getElementById('mapSceneManipRotate');
    var bs = document.getElementById('mapSceneManipResize');
    if (br) br.classList.toggle('map-scene-manip-bar__btn--active', manipMode === MANIP_ROTATE);
    if (bs) bs.classList.toggle('map-scene-manip-bar__btn--active', manipMode === MANIP_RESIZE);
  }

  function updateManipBarPosition() {
    var bar = document.getElementById('mapSceneManipBar');
    if (!bar || !viewer || !viewer.scene) return;
    if (!selectedHouseId || !isSceneEditActive() || !isSceneTargetSelected()) {
      bar.style.display = 'none';
      return;
    }
    var h = getSelectedHouseObject();
    if (!h) {
      bar.style.display = 'none';
      return;
    }
    var height = typeof h.heightM === 'number' && h.heightM > 0 ? h.heightM : DEFAULT_HOUSE.heightM;
    var half = height / 2;
    var cart = Cesium.Cartesian3.fromDegrees(h.lon, h.lat, half);
    var win = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, cart);
    if (!Cesium.defined(win)) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    bar.style.left = Math.round(win.x - 58) + 'px';
    bar.style.top = Math.round(win.y - 78) + 'px';
  }

  function wireManipToolbar() {
    if (!document.getElementById('mapSceneManipDone')) return;
    if (wireManipToolbar._wired) return;
    wireManipToolbar._wired = true;
    var btnR = document.getElementById('mapSceneManipRotate');
    var btnS = document.getElementById('mapSceneManipResize');
    var btnD = document.getElementById('mapSceneManipDone');
    if (btnR) {
      btnR.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedHouseId) {
          alert('Pick a house on the map first (tool: Pick house to edit).');
          return;
        }
        endHouseRotateDrag();
        manipMode = manipMode === MANIP_ROTATE ? MANIP_NONE : MANIP_ROTATE;
        syncManipToolbarButtons();
        render();
      });
    }
    if (btnS) {
      btnS.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedHouseId) {
          alert('Pick a house on the map first (tool: Pick house to edit).');
          return;
        }
        endHouseRotateDrag();
        manipMode = manipMode === MANIP_RESIZE ? MANIP_NONE : MANIP_RESIZE;
        syncManipToolbarButtons();
        render();
      });
    }
    if (btnD) {
      btnD.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearHouseSelection();
        try { render(); } catch (err) { /* ignore */ }
        try { updateManipBarPosition(); } catch (err2) { /* ignore */ }
      });
    }
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
        if (selectedHouseId === hid) clearHouseSelection();
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

    if (tool === 'edit_house') {
      if (Date.now() - lastManipDragEndMs < 320) return true;
      const hid = findMapSceneHouseInternalIdAtClick(click);
      if (!hid) return true;
      const house = state.houses.find(function (x) { return x.id === hid; });
      if (!house) return true;
      selectedHouseId = hid;
      writeHousePropsToForm(house);
      updateHouseSelectionHint();
      return true;
    }

    const ll = pickGlobeDegrees(click);
    if (!ll) return true;

    if (tool === 'house') {
      const p = readHousePropsFromForm();
      state.houses.push({
        id: newId('h'),
        lon: ll.lon,
        lat: ll.lat,
        lengthM: p.lengthM,
        widthM: p.widthM,
        heightM: p.heightM,
        headingDeg: p.headingDeg,
        colorHex: p.colorHex,
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

  function applyHousePropsToSelected() {
    if (!selectedHouseId) {
      alert('Pick a house first (tool: Pick house to edit), or place a new house with Place house.');
      return;
    }
    var idx = state.houses.findIndex(function (x) { return x.id === selectedHouseId; });
    if (idx === -1) {
      clearHouseSelection();
      return;
    }
    flushPendingRemoteSave();
    var p = readHousePropsFromForm();
    var h = state.houses[idx];
    h.lengthM = p.lengthM;
    h.widthM = p.widthM;
    h.heightM = p.heightM;
    h.headingDeg = p.headingDeg;
    h.colorHex = p.colorHex;
    saveLocal();
    render();
    saveRemote();
  }

  function clearAllScene() {
    state = { houses: [], roads: [] };
    roadDraft = [];
    clearHouseSelection();
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
        var t = String(toolSel.value || 'none');
        if (t !== 'edit_house') endHouseRotateDrag();
        if (t !== 'edit_house') clearHouseSelection();
        else syncManipToolbarButtons();
        render();
      });
    }
    var applyHouseBtn = document.getElementById('btnAdminHouseApply');
    if (applyHouseBtn) {
      applyHouseBtn.addEventListener('click', function () {
        try {
          if (window.adminMode && typeof window.adminMode.isFloodEditorAccount === 'function' && !window.adminMode.isFloodEditorAccount()) {
            alert('Only admin accounts can edit the scene.');
            return;
          }
        } catch (e) { /* ignore */ }
        applyHousePropsToSelected();
      });
    }
    var clearSelBtn = document.getElementById('btnAdminHouseClearSel');
    if (clearSelBtn) {
      clearSelBtn.addEventListener('click', function () {
        clearHouseSelection();
      });
    }
    var liveIds = ['adminHouseLen', 'adminHouseWid', 'adminHouseHgt', 'adminHouseHeading', 'adminHouseColor'];
    for (var li = 0; li < liveIds.length; li++) {
      var el = document.getElementById(liveIds[li]);
      if (!el) continue;
      el.addEventListener('input', function () {
        liveApplySelectedHouseFromForm();
      });
      el.addEventListener('change', function () {
        liveApplySelectedHouseFromForm();
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
    wireManipToolbar();
    attachHouseRotateHandler();
    if (!init._mapScenePostRender) {
      init._mapScenePostRender = true;
      viewer.scene.postRender.addEventListener(updateManipBarPosition);
    }
    updateHouseSelectionHint();
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
