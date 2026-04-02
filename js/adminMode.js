(function () {
  'use strict';

  const STORAGE_KEY = 'adminEnabled_v1';
  let viewerRef = null;
  let clickHandler = null;
  let enabled = false;
  let buttonListenerAttached = false;

  function isEnabled() {
    return enabled;
  }

  function setEnabled(val) {
    var on = !!val;
    if (on) {
      if (!isFloodEditorAccount()) {
        on = false;
        clearStoredAdminPreference();
      }
    }
    enabled = on;
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
    const adminPanel = document.getElementById('adminControls');
    if (adminPanel) adminPanel.style.display = enabled ? 'block' : 'none';
    const btn = document.getElementById('adminModeBtn');
    if (btn) btn.style.background = enabled ? '#ffcc00' : '';
    // Refresh grid colors when switching mode (admin vs user view)
    try { if (window.gridManager && window.gridManager.updateAllVisuals) window.gridManager.updateAllVisuals(); } catch (e) { /* ignore */ }
  }

  /** If editor is on but this account is not allowed, turn it off (stale session or toggled user). */
  function synchronizeEditorWithAccount() {
    if (!enabled) return;
    if (!isFloodEditorAccount()) {
      setEnabled(false);
      detachClick();
      clearStoredAdminPreference();
    }
  }

  function loadEnabled() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === '1';
    } catch (e) { return false; }
  }

  function clearStoredAdminPreference() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  /** Turn off admin after sign-out or missing session. */
  function disableAfterLogout() {
    try { window._floodPendingAdminEnable = false; } catch (e) { /* ignore */ }
    if (!enabled) return;
    setEnabled(false);
    detachClick();
    clearStoredAdminPreference();
  }

  function isFloodEditorAccount() {
    return !!(window.supabaseAuth && typeof window.supabaseAuth.isFloodAdmin === 'function' && window.supabaseAuth.isFloodAdmin());
  }

  /** Called from app.js after successful sign-in/up when user opened Admin first. */
  function enableAfterAuth() {
    if (!viewerRef || !isFloodEditorAccount()) return;
    setEnabled(true);
    attachClick();
  }

  function tryEnableAdminFromClick() {
    if (!window.supabaseAuth || typeof window.supabaseAuth.isReady !== 'function' || !window.supabaseAuth.isReady()) {
      alert('Account sign-in is not configured. Add Supabase URL and anon key in js/supabaseConfig.js (see docs/SUPABASE_SETUP.md).');
      return;
    }
    window.supabaseAuth.getAuthForApi(function (auth) {
      if (!auth) {
        try {
          var page = (window.location.pathname.split('/').pop() || 'viewer.html');
          var next = encodeURIComponent(page + (window.location.search || '') + (window.location.hash || ''));
          window.location.href = 'index.html?next=' + next;
        } catch (e) {
          alert('Sign in on the intro page (Sign in / Admin), then open the simulator again.');
        }
        return;
      }
      if (!isFloodEditorAccount()) {
        alert('Only admin accounts can edit flood zones. Use Sign up with the admin code, or sign in with an admin account.');
        return;
      }
      setEnabled(true);
      attachClick();
    });
  }

  function init(viewer) {
    viewerRef = viewer;
    const stored = loadEnabled();
    setEnabled(false);
    detachClick();

    if (!window.supabaseAuth || typeof window.supabaseAuth.isReady !== 'function' || !window.supabaseAuth.isReady()) {
      if (stored) clearStoredAdminPreference();
    } else {
      window.supabaseAuth.getAuthForApi(function (auth) {
        if (stored && auth && isFloodEditorAccount()) {
          setEnabled(true);
          attachClick();
        } else if (stored && (!auth || !isFloodEditorAccount())) {
          clearStoredAdminPreference();
        }
      });
    }

    const btn = document.getElementById('adminModeBtn');
    if (btn && !buttonListenerAttached) {
      buttonListenerAttached = true;
      btn.addEventListener('click', function () {
        if (enabled) { setEnabled(false); detachClick(); return; }
        tryEnableAdminFromClick();
      });
    }

    const exitBtn = document.getElementById('btnExitAdmin');
    if (exitBtn) exitBtn.addEventListener('click', function () { setEnabled(false); detachClick(); });

    // Wire admin clear/save buttons
    const clearBtn = document.getElementById('btnAdminClearTemp');
    const saveBtn = document.getElementById('btnAdminSave');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      try { if (window.gridManager) window.gridManager.clearTempSelection(); } catch (e) { /* ignore */ }
    });
    if (saveBtn) saveBtn.addEventListener('click', function () {
      const radios = document.getElementsByName('adminEditLevel');
      let level = '30';
      for (let i = 0; i < radios.length; i++) if (radios[i].checked) { level = radios[i].value; break; }
      try {
        if (window.gridManager) window.gridManager.saveSelection(level);
        var label = level === '0.5' ? '0.5 m' : level === '1' ? '1 m' : level === '30' ? '0.1 mm' : level === '60' ? '0.5 mm' : level === '100' ? '1 mm' : level;
        alert('Saved selection for ' + label);
      } catch (e) { alert('Save failed'); }
    });
  }

  function attachClick() {
    if (!viewerRef || clickHandler) return;
    if (!isFloodEditorAccount()) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewerRef.scene.canvas);
    handler.setInputAction(function (click) {
      if (!enabled) return;
      const picked = viewerRef.scene.pick(click.position);
      if (!picked || !picked.id) return;
      const entity = picked.id;
      // find zone whose outlineEntity equals this entity
      const z = (window.floodZones || []).find(function (zz) { return zz.outlineEntity === entity; });
      if (!z) return;
      // determine edit level from radio
      // toggle temporary selection via gridManager
      try { if (window.gridManager) window.gridManager.toggleTempSelection(z.id); } catch (e) { console.error(e); }
      try { if (window.gridManager) window.gridManager.updateAllVisuals(); } catch (e) { /* ignore */ }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    clickHandler = handler;
  }

  function detachClick() {
    if (!clickHandler) return;
    try { clickHandler.destroy(); } catch (e) { /* ignore */ }
    clickHandler = null;
  }

  window.adminMode = {
    init: init,
    isEnabled: isEnabled,
    attachClick: attachClick,
    detachClick: detachClick,
    enableAfterAuth: enableAfterAuth,
    disableAfterLogout: disableAfterLogout,
    isFloodEditorAccount: isFloodEditorAccount,
    synchronizeEditorWithAccount: synchronizeEditorWithAccount,
  };
})();
