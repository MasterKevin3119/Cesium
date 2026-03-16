(function () {
  'use strict';
  const STORAGE_KEY = 'floodConfig_v2';
  const LEVELS = ['60', '100', '0.5', '1'];

  // internal state: 60 mm/hr, 100 mm/hr, 0.5 m, 1 m (all admin-defined, no auto-init)
  let state = { '60': [], '100': [], '0.5': [], '1': [] };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        LEVELS.forEach(function (k) {
          state[k] = Array.isArray(parsed[k]) ? parsed[k].map(Number).filter(function (n) { return !isNaN(n); }) : [];
        });
      }
    } catch (e) { /* ignore */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function clear() {
    state = { '60': [], '100': [], '0.5': [], '1': [] };
    save();
  }

  function getZones(level) {
    const k = String(level);
    return Array.isArray(state[k]) ? state[k].slice() : [];
  }

  function setZones(level, ids) {
    const k = String(level);
    const newIds = Array.isArray(ids) ? ids.map(Number).filter(function (n) { return !isNaN(n); }) : [];
    // Exclusive: remove these zone ids from other levels so each zone belongs to only one
    LEVELS.forEach(function (key) {
      if (key !== k) state[key] = (state[key] || []).filter(function (id) { return newIds.indexOf(id) === -1; });
    });
    state[k] = newIds;
    save();
  }

  function toggle(zoneId, level) {
    zoneId = Number(zoneId);
    if (isNaN(zoneId)) return;
    const k = String(level);
    if (!Array.isArray(state[k])) state[k] = [];
    const idx = state[k].indexOf(zoneId);
    if (idx === -1) state[k].push(zoneId); else state[k].splice(idx, 1);
    save();
  }

  function isSelected(zoneId, level) {
    const k = String(level);
    return Array.isArray(state[k]) && state[k].indexOf(Number(zoneId)) !== -1;
  }

  function setZoneLevel(zoneId, level) {
    zoneId = Number(zoneId);
    if (isNaN(zoneId)) return;
    LEVELS.forEach(function (k) {
      state[k] = (state[k] || []).filter(function (id) { return id !== zoneId; });
    });
    if (LEVELS.indexOf(String(level)) !== -1) {
      state[String(level)].push(zoneId);
    }
    save();
  }

  // expose
  window.floodConfig = {
    load: load,
    save: save,
    clear: clear,
    getZones: getZones,
    setZones: setZones,
    setZoneLevel: setZoneLevel,
    toggle: toggle,
    isSelected: isSelected,
  };

  // auto-load on script include
  load();
})();
