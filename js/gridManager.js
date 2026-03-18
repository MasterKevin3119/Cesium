(function () {
  'use strict';

  let viewer = null;
  let tempSelection = []; // ids
  let showLevel30 = false;
  let showLevel60 = false;
  let showLevel100 = false;
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
      showLevel30 = false;
      showLevel60 = false;
      showLevel100 = false;
      showLevel05 = false;
      showLevel1 = false;
    } else if (level === '30') {
      showLevel30 = true;
    } else if (level === '60') {
      showLevel60 = true;
    } else if (level === '100') {
      showLevel100 = true;
    } else if (level === '0.5') {
      showLevel05 = true;
    } else if (level === '1') {
      showLevel1 = true;
    }
    updateAllVisuals();
    syncZoneColorLegend();
  }

  /** Rain tiers: hourly precip ≥0.1 / ≥0.5 / ≥1 mm (admin keys 30/60/100). */
  function setRainVisibility(hourlyPrecipMm) {
    const v = Number(hourlyPrecipMm);
    showLevel30 = v >= 0.1;
    showLevel60 = v >= 0.5;
    showLevel100 = v >= 1;
    updateAllVisuals();
    syncZoneColorLegend();
  }

  function syncZoneColorLegend() {
    try {
      function setRow(id, on) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('zone-color-legend__row--active', !!on);
      }
      setRow('legendRowRain01', showLevel30);
      setRow('legendRowRain05', showLevel60);
      setRow('legendRowRain1', showLevel100);
      setRow('legendRowDepth05', showLevel05);
      setRow('legendRowDepth1', showLevel1);
    } catch (e) { /* ignore */ }
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
  // Rain zones: 0.1 / 0.5 / 1 mm thresholds (blue shades); flood depth: 0.5 m / 1 m (green).
  const COLOR_30 = new Cesium.Color(0.88, 0.96, 1.0, 0.5);
  const COLOR_60 = new Cesium.Color(0.7, 0.9, 1.0, 0.55);
  const COLOR_100 = new Cesium.Color(0.0, 0.25, 0.7, 0.65);
  const COLOR_05 = new Cesium.Color(0.5, 0.95, 0.6, 0.55);
  const COLOR_1 = new Cesium.Color(0.0, 0.6, 0.25, 0.65);
  const COLOR_TEMP = new Cesium.Color(0.96, 0.62, 0.04, 0.35);
  const MATERIAL_30 = materialProp(COLOR_30);
  const MATERIAL_60 = materialProp(COLOR_60);
  const MATERIAL_100 = materialProp(COLOR_100);
  const MATERIAL_05 = materialProp(COLOR_05);
  const MATERIAL_1 = materialProp(COLOR_1);
  const MATERIAL_TEMP = materialProp(COLOR_TEMP);
  const MATERIAL_BASE = materialProp(Cesium.Color.WHITE.withAlpha(0.05));

  function updateZoneVisual(z) {
    if (!z || !z.outlineEntity) return;
    try {
      const saved100 = isZoneSavedForLevel(z.id, '100');
      const saved60 = isZoneSavedForLevel(z.id, '60');
      const saved30 = isZoneSavedForLevel(z.id, '30');
      const saved05 = isZoneSavedForLevel(z.id, '0.5');
      const saved1 = isZoneSavedForLevel(z.id, '1');
      const temp = isTempSelected(z.id);
      const adminEnabled = window.adminMode && window.adminMode.isEnabled && window.adminMode.isEnabled();

      if (adminEnabled) {
        if (temp) {
          z.outlineEntity.rectangle.material = MATERIAL_TEMP;
        } else if (saved100) {
          z.outlineEntity.rectangle.material = MATERIAL_100;
        } else if (saved60) {
          z.outlineEntity.rectangle.material = MATERIAL_60;
        } else if (saved30) {
          z.outlineEntity.rectangle.material = MATERIAL_30;
        } else if (saved1) {
          z.outlineEntity.rectangle.material = MATERIAL_1;
        } else if (saved05) {
          z.outlineEntity.rectangle.material = MATERIAL_05;
        } else {
          z.outlineEntity.rectangle.material = MATERIAL_BASE;
        }
        return;
      }
      // User mode: auto rain for 0.1/0.5/1 mm; buttons for 0.5 m / 1 m
      if (saved100 && showLevel100) {
        z.outlineEntity.rectangle.material = MATERIAL_100;
      } else if (saved60 && showLevel60) {
        z.outlineEntity.rectangle.material = MATERIAL_60;
      } else if (saved30 && showLevel30) {
        z.outlineEntity.rectangle.material = MATERIAL_30;
      } else if (saved05 && showLevel05) {
        z.outlineEntity.rectangle.material = MATERIAL_05;
      } else if (saved1 && showLevel1) {
        z.outlineEntity.rectangle.material = MATERIAL_1;
      } else {
        z.outlineEntity.rectangle.material = MATERIAL_BASE;
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
    setRainVisibility: setRainVisibility,
    updateAllVisuals: updateAllVisuals,
    updateZoneVisual: updateZoneVisual,
  };
})();
