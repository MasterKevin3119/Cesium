/**
 * Supabase Auth: login, signup, signout. Exposes current user for per-admin zones.
 * Depends: Supabase script loaded (window.supabase), js/supabaseConfig.js (URL + anon key).
 */
(function () {
  'use strict';

  var client = null;
  var authCallback = null;

  function getClient() {
    if (client) return client;
    var url = (window.FLOOD_SUPABASE_URL || '').trim();
    var key = (window.FLOOD_SUPABASE_ANON_KEY || '').trim();
    if (url.length < 12 || key.length < 20) return null;
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
    client = window.supabase.createClient(url, key);
    return client;
  }

  var cachedUser = null;
  var cachedToken = null;

  function getCurrentUser() {
    return cachedUser;
  }

  function parseFloodAvatar(meta) {
    if (!meta || typeof meta !== 'object') return null;
    var raw = meta.flood_avatar;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) { return null; }
    }
    if (typeof raw !== 'object' || !raw) return null;
    var style = typeof raw.style === 'string' ? raw.style : '';
    var seed = typeof raw.seed === 'string' ? raw.seed : '';
    if (!style || !seed) return null;
    return { style: style, seed: seed };
  }

  function userFromSupabaseUser(u) {
    if (!u) return null;
    var meta = u.user_metadata || {};
    var appMeta = u.app_metadata || {};
    var flag = meta.flood_is_admin;
    if (flag !== true && flag !== 'true') flag = appMeta.flood_is_admin;
    var isAdmin = flag === true || flag === 'true';
    return {
      id: u.id,
      email: u.email || '',
      isAdmin: isAdmin,
      avatar: parseFloodAvatar(meta),
    };
  }

  /**
   * Call cb with { token, userId } when logged in (for API calls), or cb(null) when not.
   * Use this before fetch to Supabase so RLS sees the user.
   */
  function getAuthForApi(cb) {
    if (!cb) return;
    var c = getClient();
    if (!c) {
      cb(null);
      return;
    }
    c.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session || !session.user) {
        cachedUser = null;
        cachedToken = null;
        cb(null);
        return;
      }
      cachedToken = session.access_token || null;
      cachedUser = userFromSupabaseUser(session.user);
      var uid = session.user.id;
      function finish() {
        cb(cachedToken ? { token: cachedToken, userId: uid } : null);
      }
      if (c.auth.getUser) {
        c.auth.getUser().then(function (ur) {
          if (ur && !ur.error && ur.data && ur.data.user) cachedUser = userFromSupabaseUser(ur.data.user);
        }).catch(function () { /* keep session-based user */ }).then(finish);
      } else {
        finish();
      }
    }).catch(function () {
      cachedUser = null;
      cachedToken = null;
      cb(null);
    });
  }

  function signIn(email, password, done) {
    var c = getClient();
    if (!c) {
      if (done) done(new Error('Supabase not configured'), null);
      return;
    }
    c.auth.signInWithPassword({ email: email, password: password })
      .then(function (r) {
        var err = r.error ? (r.error.message || 'Login failed') : null;
        if (done) done(err, err ? null : (r.data && r.data.user ? { id: r.data.user.id, email: r.data.user.email } : null));
        if (!err && authCallback) authCallback();
      })
      .catch(function (e) {
        if (done) done(e.message || e, null);
      });
  }

  /**
   * @param {function} done
   * @param {object} [opts] opts.userData — merged into signUp options.data (e.g. { flood_is_admin: true })
   */
  function signUp(email, password, done, opts) {
    var c = getClient();
    if (!c) {
      if (done) done(new Error('Supabase not configured'), null);
      return;
    }
    opts = opts || {};
    var payload = { email: email, password: password };
    if (opts.userData && typeof opts.userData === 'object') {
      payload.options = { data: opts.userData };
    }
    c.auth.signUp(payload)
      .then(function (r) {
        var err = r.error ? (r.error.message || 'Sign up failed') : null;
        var u = r.data && r.data.user ? userFromSupabaseUser(r.data.user) : null;
        if (done) done(err, err ? null : u);
        if (!err && authCallback) authCallback();
      })
      .catch(function (e) {
        if (done) done(e.message || e, null);
      });
  }

  function signOut(done) {
    var c = getClient();
    if (!c) {
      if (done) done();
      return;
    }
    c.auth.signOut().then(function () {
      if (authCallback) authCallback();
      if (done) done();
    }).catch(function () { if (done) done(); });
  }

  /** Call cb when auth state changes (login/logout). Use to refresh zones. */
  function onAuthChange(cb) {
    authCallback = cb;
    var c = getClient();
    if (c && c.auth && c.auth.onAuthStateChange) {
      c.auth.onAuthStateChange(function () {
        if (authCallback) authCallback();
      });
    }
  }

  /**
   * Merge into auth.users.user_metadata (e.g. { flood_avatar: { style, seed } }).
   * @param {object} data
   * @param {function(Error|string|null)} [done]
   */
  function updateUserMetadata(data, done) {
    if (!data || typeof data !== 'object') {
      if (done) done(null);
      return;
    }
    var c = getClient();
    if (!c) {
      if (done) done(new Error('Supabase not configured'));
      return;
    }
    c.auth.updateUser({ data: data })
      .then(function (r) {
        var err = r.error ? (r.error.message || 'Update failed') : null;
        if (err) {
          if (done) done(err);
          return;
        }
        if (r.data && r.data.user) cachedUser = userFromSupabaseUser(r.data.user);
        if (authCallback) authCallback();
        if (done) done(null);
      })
      .catch(function (e) {
        if (done) done(e.message || e);
      });
  }

  window.supabaseAuth = {
    getCurrentUser: getCurrentUser,
    getAuthForApi: getAuthForApi,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    onAuthChange: onAuthChange,
    updateUserMetadata: updateUserMetadata,
    isReady: function () { return getClient() !== null; },
    isFloodAdmin: function () {
      var u = getCurrentUser();
      return !!(u && u.isAdmin);
    },
  };
})();
