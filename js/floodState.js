(function () {
  'use strict';

  let viewer = null;

  function init(v) { viewer = v; }

  function trigger(level) {
    if (!viewer) return;
    // level: '0.5' | '1' | 'none'
    if (level === 'none') {
      clearAll();
      return;
    }
    const meters = (level === '1') ? 1.0 : 0.5;
    // Use saved configured zones
    const zones = (window.floodConfig && window.floodConfig.getZones(level)) || [];
    if (!zones || !zones.length) return;
    // Update current flood level in grid visuals
    try { window.gridManager && window.gridManager.setCurrentFloodLevel(level); } catch (e) { /* ignore */ }
    zones.forEach(function (zid) {
      const z = (window.floodZones || []).find(function (zz) { return zz.id === Number(zid); });
      if (!z) return;
      try { if (window.animateZoneFlood) window.animateZoneFlood(z, meters, 700); } catch (e) { /* ignore */ }
    });
  }

  function clearAll() {
    // Reset visuals
    try { window.gridManager && window.gridManager.setCurrentFloodLevel('none'); } catch (e) { /* ignore */ }
    // Lower all flood overlays
    const zones = window.floodZones || [];
    zones.forEach(function (z) {
      try { if (window.animateZoneFlood) window.animateZoneFlood(z, 0, 500); } catch (e) { /* ignore */ }
    });
  }

  window.floodState = { init: init, trigger: trigger, clearAll: clearAll };
})();
