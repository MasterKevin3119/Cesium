(function () {
  'use strict';
  const STORAGE_KEY = 'floodConfig_v1';

  // internal state
  let state = { '0.5': [], '1': [] };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') state = parsed;
    } catch (e) { /* ignore */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function clear() { state = { '0.5': [], '1': [] }; save(); }

  function getZones(level) {
    const k = String(level);
    return Array.isArray(state[k]) ? state[k].slice() : [];
  }

  function setZones(level, ids) {
    const k = String(level);
    state[k] = Array.isArray(ids) ? ids.map(Number).filter(n => !isNaN(n)) : [];
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

  // expose
  window.floodConfig = {
    load: load,
    save: save,
    clear: clear,
    getZones: getZones,
    setZones: setZones,
    toggle: toggle,
    isSelected: isSelected,
  };

  // auto-load on script include
  load();
})();
