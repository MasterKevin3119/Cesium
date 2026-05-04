/**
 * One shared zone layout per `FLOOD_MAP_ID` in Supabase `flood_zones` (not per user).
 * Any flood admin can save; all viewers load the same row. Mission answers use other tables.
 */
(function () {
  'use strict';
  const STORAGE_KEY = 'floodConfig_v2';
  const LEVELS = ['30', '60', '100', '0.5', '1'];

  let state = { '30': [], '60': [], '100': [], '0.5': [], '1': [] };

  function isSupabaseReady() {
    const u = (window.FLOOD_SUPABASE_URL || '').trim();
    const k = (window.FLOOD_SUPABASE_ANON_KEY || '').trim();
    return u.length > 12 && k.length > 20;
  }

  function mapId() {
    return String(window.FLOOD_MAP_ID || 'default').trim() || 'default';
  }

  function applyZonesFromServer(zonesObj) {
    if (!zonesObj || typeof zonesObj !== 'object') return;
    LEVELS.forEach(function (k) {
      const arr = zonesObj[k];
      state[k] = Array.isArray(arr) ? arr.map(Number).filter(function (n) { return !isNaN(n); }) : [];
    });
  }

  function stateToJson() {
    var o = {};
    LEVELS.forEach(function (k) { o[k] = (state[k] || []).slice(); });
    return o;
  }

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

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function saveRemote() {
    if (!isSupabaseReady()) return;
    var base = window.FLOOD_SUPABASE_URL.replace(/\/$/, '');
    var anonKey = window.FLOOD_SUPABASE_ANON_KEY;
    var mid = mapId();
    var payload = { map_id: mid, zones: stateToJson(), updated_at: new Date().toISOString() };
    var doSave = function (auth) {
      var isAdmin = !!(window.supabaseAuth && typeof window.supabaseAuth.isFloodAdmin === 'function' && window.supabaseAuth.isFloodAdmin());
      if (!isAdmin) return;
      var url = base + '/rest/v1/flood_zones';
      var headers = {
        apikey: anonKey,
        Authorization: 'Bearer ' + (auth ? auth.token : anonKey),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      };
      fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
        .then(function (res) {
          if (!res.ok) console.warn('[floodConfig] Supabase save failed:', res.status);
        })
        .catch(function (err) { console.warn('[floodConfig] Supabase save:', err.message || err); });
    };
    if (window.supabaseAuth && typeof window.supabaseAuth.getAuthForApi === 'function') {
      window.supabaseAuth.getAuthForApi(function (auth) {
        doSave(auth);
      });
    }
  }

  function save() {
    saveLocal();
    saveRemote();
  }

  function clear() {
    state = { '30': [], '60': [], '100': [], '0.5': [], '1': [] };
    save();
  }

  function getZones(level) {
    const k = String(level);
    return Array.isArray(state[k]) ? state[k].slice() : [];
  }

  function setZones(level, ids) {
    const k = String(level);
    state[k] = Array.isArray(ids) ? ids.map(Number).filter(function (n) { return !isNaN(n); }) : [];
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

  function removeZonesFromLevel(level, ids) {
    const k = String(level);
    const removeIds = Array.isArray(ids) ? ids.map(Number) : [];
    if (Array.isArray(state[k])) {
      state[k] = state[k].filter(function (id) { return removeIds.indexOf(id) === -1; });
    }
    save();
  }

  function isSelected(zoneId, level) {
    const k = String(level);
    return Array.isArray(state[k]) && state[k].indexOf(Number(zoneId)) !== -1;
  }

  function setZoneLevel(zoneId, level) {
    zoneId = Number(zoneId);
    if (isNaN(zoneId)) return;
    const k = String(level);
    if (LEVELS.indexOf(k) !== -1) {
      if (!Array.isArray(state[k])) state[k] = [];
      if (state[k].indexOf(zoneId) === -1) state[k].push(zoneId);
    }
    save();
  }

  /** Pull shared zones for the configured map id from `flood_zones`. */
  function pullFromSupabase(done) {
    if (!isSupabaseReady()) {
      if (typeof done === 'function') done(false);
      return;
    }
    var base = window.FLOOD_SUPABASE_URL.replace(/\/$/, '');
    var anonKey = window.FLOOD_SUPABASE_ANON_KEY;
    function doPull(auth) {
      var mid = mapId();
      var url = base + '/rest/v1/flood_zones?map_id=eq.' + encodeURIComponent(mid) + '&select=zones';
      var token = auth ? auth.token : anonKey;
      var headers = { apikey: anonKey, Authorization: 'Bearer ' + token };
      fetch(url, { headers: headers })
        .then(function (res) { return res.json(); })
        .then(function (rows) {
          if (!Array.isArray(rows) || !rows[0] || !rows[0].zones) {
            if (typeof done === 'function') done(false);
            return;
          }
          var sz = rows[0].zones;
          applyZonesFromServer(sz);
          saveLocal();
          if (typeof done === 'function') done(true);
        })
        .catch(function (e) {
          console.warn('[floodConfig] Supabase pull:', e.message || e);
          if (typeof done === 'function') done(false);
        });
    }
    if (window.supabaseAuth && typeof window.supabaseAuth.getAuthForApi === 'function') {
      window.supabaseAuth.getAuthForApi(doPull);
    } else {
      doPull(null);
    }
  }

  window.floodConfig = {
    load: load,
    save: save,
    clear: clear,
    getZones: getZones,
    setZones: setZones,
    setZoneLevel: setZoneLevel,
    removeZonesFromLevel: removeZonesFromLevel,
    toggle: toggle,
    isSelected: isSelected,
    pullFromSupabase: pullFromSupabase,
    isSupabaseReady: isSupabaseReady,
  };

  load();
})();
