(function () {
  'use strict';

  let viewer = null;
  let tempSelection = []; // ids
  let currentFloodLevel = 'none';

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
    // overwrite saved zones for level with tempSelection
    try {
      if (window.floodConfig && typeof window.floodConfig.setZones === 'function') {
        window.floodConfig.setZones(level, tempSelection);
      }
    } catch (e) { /* ignore */ }
    // keep tempSelection as-is but update visuals (saved highlights apply)
    updateAllVisuals();
  }

  function isTempSelected(zoneId) { return tempSelection.indexOf(Number(zoneId)) !== -1; }

  function getSavedZones(level) {
    try { return (window.floodConfig && window.floodConfig.getZones(level)) || []; } catch (e) { return []; }
  }

  function setCurrentFloodLevel(level) {
    currentFloodLevel = level || 'none';
    updateAllVisuals();
  }

  function updateAllVisuals() {
    const zones = window.floodZones || [];
    for (let i = 0; i < zones.length; i++) updateZoneVisual(zones[i]);
  }

  function updateZoneVisual(z) {
    if (!z || !z.outlineEntity) return;
    try {
      const saved1 = getSavedZones('1').indexOf(z.id) !== -1;
      const saved05 = getSavedZones('0.5').indexOf(z.id) !== -1;
      const temp = isTempSelected(z.id);
      // Admin mode visuals
      const adminEnabled = window.adminMode && window.adminMode.isEnabled && window.adminMode.isEnabled();
      if (adminEnabled) {
        if (temp) {
          z.outlineEntity.rectangle.material = Cesium.Color.CYAN.withAlpha(0.18); // selected but not saved
        } else if (saved1) {
          z.outlineEntity.rectangle.material = Cesium.Color.RED.withAlpha(0.12);
        } else if (saved05) {
          z.outlineEntity.rectangle.material = Cesium.Color.YELLOW.withAlpha(0.12);
        } else {
          z.outlineEntity.rectangle.material = Cesium.Color.WHITE.withAlpha(0.05);
        }
        return;
      }
      // Normal user visuals depend on currentFloodLevel
      if (currentFloodLevel === '1') {
        if (saved1) z.outlineEntity.rectangle.material = Cesium.Color.RED.withAlpha(0.12); else z.outlineEntity.rectangle.material = Cesium.Color.WHITE.withAlpha(0.03);
      } else if (currentFloodLevel === '0.5') {
        if (saved05) z.outlineEntity.rectangle.material = Cesium.Color.YELLOW.withAlpha(0.12); else z.outlineEntity.rectangle.material = Cesium.Color.WHITE.withAlpha(0.03);
      } else {
        z.outlineEntity.rectangle.material = Cesium.Color.WHITE.withAlpha(0.05);
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
