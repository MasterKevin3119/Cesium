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
      cachedUser = { id: session.user.id, email: session.user.email || '' };
      cachedToken = session.access_token || null;
      cb(cachedToken ? { token: cachedToken, userId: session.user.id } : null);
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

  function signUp(email, password, done) {
    var c = getClient();
    if (!c) {
      if (done) done(new Error('Supabase not configured'), null);
      return;
    }
    c.auth.signUp({ email: email, password: password })
      .then(function (r) {
        var err = r.error ? (r.error.message || 'Sign up failed') : null;
        if (done) done(err, err ? null : (r.data && r.data.user ? { id: r.data.user.id, email: r.data.user.email } : null));
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

  window.supabaseAuth = {
    getCurrentUser: getCurrentUser,
    getAuthForApi: getAuthForApi,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    onAuthChange: onAuthChange,
    isReady: function () { return getClient() !== null; }
  };
})();
