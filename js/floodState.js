(function () {
  'use strict';

  let viewer = null;

  function init(v) { viewer = v; }

  function trigger(level) {
    if (!viewer) return;
    if (level === 'none') {
      clearAll();
      return;
    }
    var meters = 0.5;
    if (level === '30') meters = 0.1;
    else if (level === '60' || level === '0.5') meters = 0.5;
    else if (level === '100' || level === '1') meters = 1.0;
    const zones = (window.floodConfig && window.floodConfig.getZones(level)) || [];
    // Rain tiers 0.1/0.5/1 mm vs flood depth 0.5 m/1 m
    try { window.gridManager && window.gridManager.setCurrentFloodLevel(level); } catch (e) { /* ignore */ }
    if (!zones || !zones.length) return;
    zones.forEach(function (zid) {
      const z = (window.floodZones || []).find(function (zz) { return zz.id === Number(zid); });
      if (!z) return;
      try { if (window.animateZoneFlood) window.animateZoneFlood(z, meters, 700, { level: level }); } catch (e) { /* ignore */ }
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
