(function () {
  'use strict';
  const STORAGE_KEY = 'floodConfig_v2';
  /** Which zone layout to show: __mine__ | default | pub_* (shared flood_zones.map_id). */
  const VIEW_SOURCE_KEY = 'floodViewSource_v1';
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

  function getViewSourceKey() {
    try {
      var v = localStorage.getItem(VIEW_SOURCE_KEY);
      if (v != null && v !== '') return v;
    } catch (e) { /* ignore */ }
    return null;
  }

  function setViewSourceKey(key) {
    try {
      if (key == null || key === '') localStorage.removeItem(VIEW_SOURCE_KEY);
      else localStorage.setItem(VIEW_SOURCE_KEY, String(key));
    } catch (e) { /* ignore */ }
  }

  /** Resolved key for pull (logged out cannot use __mine__). */
  function effectiveViewKey(auth) {
    var k = getViewSourceKey();
    if (k === '__mine__' && !auth) return 'default';
    if (k) return k;
    return auth ? '__mine__' : 'default';
  }

  function pullTarget(auth) {
    var key = effectiveViewKey(auth);
    if (key === '__mine__' && auth) {
      return { type: 'by_user', mapId: mapId() };
    }
    return { type: 'shared', mapId: key === '__mine__' ? 'default' : key };
  }

  function scenarioDisplayLabel(mapId, label) {
    if (label != null && String(label).trim() !== '') return String(label).trim();
    var s = String(mapId || '').replace(/^pub_/, '').replace(/-/g, ' ');
    if (!s) return mapId;
    return s.charAt(0).toUpperCase() + s.slice(1);
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
      var url = auth
        ? base + '/rest/v1/flood_zones_by_user'
        : base + '/rest/v1/flood_zones';
      var headers = {
        apikey: anonKey,
        Authorization: 'Bearer ' + (auth ? auth.token : anonKey),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      };
      var body = auth
        ? { user_id: auth.userId, map_id: mid, zones: stateToJson(), updated_at: payload.updated_at }
        : payload;
      fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) })
        .then(function (res) {
          if (!res.ok) console.warn('[floodConfig] Supabase save failed:', res.status);
        })
        .catch(function (err) { console.warn('[floodConfig] Supabase save:', err.message || err); });
    };
    if (window.supabaseAuth && typeof window.supabaseAuth.getAuthForApi === 'function') {
      window.supabaseAuth.getAuthForApi(function (auth) {
        doSave(auth);
      });
    } else {
      doSave(null);
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
    const newIds = Array.isArray(ids) ? ids.map(Number).filter(function (n) { return !isNaN(n); }) : [];
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

  function serverHasAnyZones(z) {
    if (!z || typeof z !== 'object') return false;
    for (var i = 0; i < LEVELS.length; i++) {
      var a = z[LEVELS[i]];
      if (Array.isArray(a) && a.length > 0) return true;
    }
    return false;
  }

  function localHasAnyZones() {
    for (var i = 0; i < LEVELS.length; i++) {
      if ((state[LEVELS[i]] || []).length > 0) return true;
    }
    return false;
  }

  /**
   * Pull zone layout: by user choice — own row (__mine__), public default, or published scenario (pub_*).
   */
  function pullFromSupabase(done) {
    if (!isSupabaseReady()) {
      if (typeof done === 'function') done(false);
      return;
    }
    var base = window.FLOOD_SUPABASE_URL.replace(/\/$/, '');
    var anonKey = window.FLOOD_SUPABASE_ANON_KEY;
    function doPull(auth) {
      var target = pullTarget(auth);
      var url;
      if (target.type === 'by_user' && auth) {
        url = base + '/rest/v1/flood_zones_by_user?user_id=eq.' + encodeURIComponent(auth.userId) + '&map_id=eq.' + encodeURIComponent(target.mapId) + '&select=zones';
      } else {
        url = base + '/rest/v1/flood_zones?map_id=eq.' + encodeURIComponent(target.mapId) + '&select=zones';
      }
      var token = auth ? auth.token : anonKey;
      var headers = { apikey: anonKey, Authorization: 'Bearer ' + token };
      fetch(url, { headers: headers })
        .then(function (res) { return res.json(); })
        .then(function (rows) {
          if (!Array.isArray(rows) || !rows[0] || !rows[0].zones) {
            if (localHasAnyZones()) saveRemote();
            if (typeof done === 'function') done(false);
            return;
          }
          var sz = rows[0].zones;
          if (serverHasAnyZones(sz)) {
            applyZonesFromServer(sz);
            saveLocal();
            if (typeof done === 'function') done(true);
          } else if (localHasAnyZones()) {
            saveRemote();
            if (typeof done === 'function') done(true);
          } else {
            applyZonesFromServer(sz);
            saveLocal();
            if (typeof done === 'function') done(true);
          }
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

  function listPublishedScenarios(done) {
    if (!isSupabaseReady()) {
      if (typeof done === 'function') done([]);
      return;
    }
    var base = window.FLOOD_SUPABASE_URL.replace(/\/$/, '');
    var anonKey = window.FLOOD_SUPABASE_ANON_KEY;
    var headers = { apikey: anonKey, Authorization: 'Bearer ' + anonKey };
    var urlWithLabel = base + '/rest/v1/flood_zones?select=map_id,updated_at,label&order=updated_at.desc';
    var urlNoLabel = base + '/rest/v1/flood_zones?select=map_id,updated_at&order=updated_at.desc';
    fetch(urlWithLabel, { headers: headers })
      .then(function (res) {
        if (res.ok) return res.json();
        return fetch(urlNoLabel, { headers: headers }).then(function (r2) { return r2.json(); });
      })
      .then(function (rows) {
        var list = (Array.isArray(rows) ? rows : []).filter(function (row) {
          return row && row.map_id && String(row.map_id).indexOf('pub_') === 0;
        });
        if (typeof done === 'function') done(list);
      })
      .catch(function () {
        if (typeof done === 'function') done([]);
      });
  }

  /**
   * Copy current in-memory zones to flood_zones as pub_<slug> (merge). Caller should verify flood admin.
   */
  function publishScenario(displayName, done) {
    if (!isSupabaseReady()) {
      if (typeof done === 'function') done(false, 'Supabase not configured');
      return;
    }
    var raw = String(displayName || '').trim();
    if (raw.length < 2) {
      if (typeof done === 'function') done(false, 'Enter a short scenario name');
      return;
    }
    var slug = 'pub_' + raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    if (slug.length < 5) {
      if (typeof done === 'function') done(false, 'Use letters or numbers in the name');
      return;
    }
    var base = window.FLOOD_SUPABASE_URL.replace(/\/$/, '');
    var anonKey = window.FLOOD_SUPABASE_ANON_KEY;
    var payload = {
      map_id: slug,
      zones: stateToJson(),
      updated_at: new Date().toISOString(),
      label: raw.slice(0, 120),
    };
    function postJson(bodyObj, authToken) {
      return fetch(base + '/rest/v1/flood_zones', {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: 'Bearer ' + authToken,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(bodyObj),
      });
    }
    function tryPost(withLabel, authToken, cb) {
      var b = { map_id: payload.map_id, zones: payload.zones, updated_at: payload.updated_at };
      if (withLabel) b.label = payload.label;
      postJson(b, authToken)
        .then(function (res) {
          if (res.ok) {
            cb(true);
            return;
          }
          if (withLabel) {
            tryPost(false, authToken, cb);
            return;
          }
          cb(false, 'Could not publish (' + res.status + ')');
        })
        .catch(function (e) {
          cb(false, e.message || 'Network error');
        });
    }
    if (window.supabaseAuth && typeof window.supabaseAuth.getAuthForApi === 'function') {
      window.supabaseAuth.getAuthForApi(function (auth) {
        var t = auth && auth.token ? auth.token : anonKey;
        tryPost(true, t, function (ok, err) {
          if (typeof done === 'function') done(ok, err, ok ? slug : null);
        });
      });
    } else {
      tryPost(true, anonKey, function (ok, err) {
        if (typeof done === 'function') done(ok, err, ok ? slug : null);
      });
    }
  }

  window.floodConfig = {
    load: load,
    save: save,
    clear: clear,
    getZones: getZones,
    setZones: setZones,
    setZoneLevel: setZoneLevel,
    toggle: toggle,
    isSelected: isSelected,
    pullFromSupabase: pullFromSupabase,
    isSupabaseReady: isSupabaseReady,
    getViewSourceKey: getViewSourceKey,
    setViewSourceKey: setViewSourceKey,
    effectiveViewKey: effectiveViewKey,
    listPublishedScenarios: listPublishedScenarios,
    publishScenario: publishScenario,
    scenarioDisplayLabel: scenarioDisplayLabel,
  };

  load();
})();
