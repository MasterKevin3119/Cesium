/**
 * Blocks viewer and mission pages until the user is signed in (Supabase session).
 * If auth is not configured (isReady() false), the page loads normally for local dev.
 * On failure: redirect to index.html?next=<encoded current path> (see authUi.js sanitizeNext).
 */
(function () {
  'use strict';

  function removeOverlay() {
    var el = document.getElementById('authGateOverlay');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    try {
      document.documentElement.style.removeProperty('overflow');
    } catch (e) { /* ignore */ }
  }

  function showOverlay() {
    var el = document.getElementById('authGateOverlay');
    if (el) return;
    try {
      document.documentElement.style.overflow = 'hidden';
    } catch (e) { /* ignore */ }
    el = document.createElement('div');
    el.id = 'authGateOverlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;background:#0c1222;color:#94a3b8;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;padding:24px;text-align:center;';
    el.innerHTML =
      '<p style="margin:0;font-size:1rem;max-width:22rem;line-height:1.5">Checking account…</p>';
    var parent = document.body || document.documentElement;
    parent.appendChild(el);
  }

  function buildNext() {
    var path = window.location.pathname || '';
    var file = path.split('/').pop() || '';
    var search = window.location.search || '';
    var hash = window.location.hash || '';
    return file + search + hash;
  }

  function run() {
    if (!window.supabaseAuth || typeof window.supabaseAuth.getAuthForApi !== 'function') {
      removeOverlay();
      return;
    }
    if (typeof window.supabaseAuth.isReady === 'function' && !window.supabaseAuth.isReady()) {
      removeOverlay();
      return;
    }
    showOverlay();
    window.supabaseAuth.getAuthForApi(function (auth) {
      if (auth && auth.userId) {
        removeOverlay();
        return;
      }
      var next = encodeURIComponent(buildNext());
      window.location.replace('index.html?next=' + next);
    });
  }

  run();
})();
