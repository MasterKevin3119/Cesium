/**
 * Auth gate for flood-defender/ — mirrors /js/requireAuthGate.js exactly,
 * but redirects to ../index.html (one level up) with ?next=flood-defender/index.html
 * so the landing page auth modal opens and sends the user back here after sign-in.
 */
(function () {
  'use strict';

  function removeOverlay() {
    var el = document.getElementById('authGateOverlay');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    try { document.documentElement.style.removeProperty('overflow'); } catch (e) {}
  }

  function showOverlay() {
    if (document.getElementById('authGateOverlay')) return;
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
    var el = document.createElement('div');
    el.id = 'authGateOverlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;background:#0c1222;color:#94a3b8;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:Inter,system-ui,sans-serif;padding:24px;text-align:center;';
    el.innerHTML =
      '<p style="margin:0;font-size:1rem;max-width:22rem;line-height:1.5">Checking account…</p>';
    (document.body || document.documentElement).appendChild(el);
  }

  function run() {
    if (!window.supabaseAuth || typeof window.supabaseAuth.getAuthForApi !== 'function') {
      removeOverlay(); return;
    }
    if (typeof window.supabaseAuth.isReady === 'function' && !window.supabaseAuth.isReady()) {
      removeOverlay(); return;
    }
    showOverlay();
    var done = false;
    var next = encodeURIComponent('flood-defender/index.html');
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      window.location.replace('../index.html?next=' + next);
    }, 8000);
    window.supabaseAuth.getAuthForApi(function (auth) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (auth && auth.userId) { removeOverlay(); return; }
      window.location.replace('../index.html?next=' + next);
    });
  }

  run();
})();
