(function () {
  'use strict';

  let viewer = null;
  let tempSelection = []; // ids
  let showLevel05 = false;
  let showLevel1 = false;

  function init(v) {
    viewer = v;
    tempSelection = [];
    // ensure floodConfig loaded
    try { if (window.floodConfig && typeof window.floodConfig.load === 'function') window.floodConfig.load(); } catch (e) { /* ignore */ }
    updateAllVisuals();
  }

  function findZoneById(id) {
    return (window.floodZones || []).find(function (z) { return z.id === Number(id); });
  }

  function toggleTempSelection(zoneId) {
    zoneId = Number(zoneId);
    if (isNaN(zoneId)) return;
    const idx = tempSelection.indexOf(zoneId);
    if (idx === -1) tempSelection.push(zoneId); else tempSelection.splice(idx, 1);
    updateAllVisuals();
  }

  function clearTempSelection() {
    tempSelection = [];
    updateAllVisuals();
  }

  function getTempSelection() { return tempSelection.slice(); }

  function saveSelection(level) {
    try {
      if (window.floodConfig && typeof window.floodConfig.setZones === 'function') {
        window.floodConfig.setZones(level, tempSelection);
      }
    } catch (e) { /* ignore */ }
    tempSelection = [];
    updateAllVisuals();
  }

  function isTempSelected(zoneId) { return tempSelection.indexOf(Number(zoneId)) !== -1; }

  function getSavedZones(level) {
    try { return (window.floodConfig && window.floodConfig.getZones(level)) || []; } catch (e) { return []; }
  }

  function isZoneSavedForLevel(zoneId, level) {
    const list = getSavedZones(level);
    const id = Number(zoneId);
    for (let i = 0; i < list.length; i++) { if (Number(list[i]) === id) return true; }
    return false;
  }

  function setCurrentFloodLevel(level) {
    if (level === 'none') {
      showLevel05 = false;
      showLevel1 = false;
    } else if (level === '0.5') {
      showLevel05 = true;
    } else if (level === '1') {
      showLevel1 = true;
    }
    updateAllVisuals();
  }

  function updateAllVisuals() {
    try { if (window.floodConfig && typeof window.floodConfig.load === 'function') window.floodConfig.load(); } catch (e) { /* ignore */ }
    const zones = window.floodZones || [];
    for (let i = 0; i < zones.length; i++) updateZoneVisual(zones[i]);
    if (viewer && viewer.scene) try { viewer.scene.requestRender(); } catch (e) { /* ignore */ }
  }

  // Entity.rectangle.material must be a MaterialProperty (e.g. ColorMaterialProperty), not a raw Color
  function materialProp(color) {
    return new Cesium.ColorMaterialProperty(color);
  }
  // True blues – no purple (0.5 m = light, 1 m = dark)
  const COLOR_05 = new Cesium.Color(0.7, 0.9, 1.0, 0.55);    // light sky blue
  const COLOR_1  = new Cesium.Color(0.0, 0.25, 0.7, 0.65);   // dark blue
  const COLOR_TEMP = new Cesium.Color(0.96, 0.62, 0.04, 0.35); // amber – pending (admin)

  function updateZoneVisual(z) {
    if (!z || !z.outlineEntity) return;
    try {
      const saved1 = isZoneSavedForLevel(z.id, '1');
      const saved05 = isZoneSavedForLevel(z.id, '0.5');
      const temp = isTempSelected(z.id);
      const adminEnabled = window.adminMode && window.adminMode.isEnabled && window.adminMode.isEnabled();

      if (adminEnabled) {
        if (temp) {
          z.outlineEntity.rectangle.material = materialProp(COLOR_TEMP);
        } else if (saved1) {
          z.outlineEntity.rectangle.material = materialProp(COLOR_1);
        } else if (saved05) {
          z.outlineEntity.rectangle.material = materialProp(COLOR_05);
        } else {
          z.outlineEntity.rectangle.material = materialProp(Cesium.Color.WHITE.withAlpha(0.05));
        }
        return;
      }
      var baseMaterial = materialProp(Cesium.Color.WHITE.withAlpha(0.05));
      if (saved05 && (showLevel05 || showLevel1)) {
        z.outlineEntity.rectangle.material = materialProp(COLOR_05);
      } else if (saved1 && showLevel1) {
        z.outlineEntity.rectangle.material = materialProp(COLOR_1);
      } else {
        z.outlineEntity.rectangle.material = baseMaterial;
      }
    } catch (e) { /* ignore */ }
  }

  // Allow admin click handling attachment
  function enableClickSelection(enable) {
    if (window.adminMode && window.adminMode.isEnabled && !window.adminMode.isEnabled()) return;
    try { window.adminMode && window.adminMode.attachClick(); } catch (e) { /* ignore */ }
  }

  window.gridManager = {
    init: init,
    toggleTempSelection: toggleTempSelection,
    clearTempSelection: clearTempSelection,
    getTempSelection: getTempSelection,
    saveSelection: saveSelection,
    getSavedZones: getSavedZones,
    isTempSelected: isTempSelected,
    setCurrentFloodLevel: setCurrentFloodLevel,
    updateAllVisuals: updateAllVisuals,
    updateZoneVisual: updateZoneVisual,
  };
})();
