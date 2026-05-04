(function () {
  'use strict';

  const STORAGE_KEY = 'adminEnabled_v1';
  let viewerRef = null;
  let clickHandler = null;
  let enabled = false;
  /** True when signed-in user is a flood admin (zone editor may be shown). */
  let adminChromeAllowed = false;
  let buttonListenerAttached = false;

  function isEnabled() {
    return enabled;
  }

  function loadAdminEditingPreference() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v === '0') return false;
      if (v === '1') return true;
      return null;
    } catch (e) {
      return null;
    }
  }

  function clearStoredAdminPreference() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  function syncToolbarAdminBtn() {
    var btn = document.getElementById('adminModeBtn');
    if (!btn) return;
    if (!adminChromeAllowed) {
      btn.style.display = 'none';
      btn.style.background = '';
      return;
    }
    btn.style.display = enabled ? 'none' : 'inline-flex';
    btn.style.background = '';
  }

  /**
   * @param {boolean} val
   * @param {{ persist?: boolean }} [opts] persist: write localStorage (user chose Exit / Edit zones)
   */
  function setEnabled(val, opts) {
    opts = opts || {};
    var on = !!val;
    if (on && !isFloodEditorAccount()) {
      on = false;
      clearStoredAdminPreference();
    }
    enabled = on;
    if (opts.persist) {
      try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    var adminPanel = document.getElementById('adminControls');
    if (adminPanel) {
      if (!adminChromeAllowed) adminPanel.style.display = 'none';
      else adminPanel.style.display = enabled ? 'block' : 'none';
    }
    syncToolbarAdminBtn();
    try { if (window.mapScene && window.mapScene.syncSceneToolsVisibility) window.mapScene.syncSceneToolsVisibility(); } catch (e) { /* ignore */ }
    try { if (window.gridManager && window.gridManager.updateAllVisuals) window.gridManager.updateAllVisuals(); } catch (e) { /* ignore */ }
  }

  function hideAllAdminUi() {
    adminChromeAllowed = false;
    enabled = false;
    detachClick();
    var adminPanel = document.getElementById('adminControls');
    if (adminPanel) adminPanel.style.display = 'none';
    syncToolbarAdminBtn();
  }

  /** If editor is on but this account is not allowed, turn it off. */
  function synchronizeEditorWithAccount() {
    if (!isFloodEditorAccount()) {
      hideAllAdminUi();
      clearStoredAdminPreference();
      return;
    }
    var wasAllowed = adminChromeAllowed;
    adminChromeAllowed = true;
    if (!wasAllowed) {
      var pref = loadAdminEditingPreference();
      var startOn = pref !== false;
      setEnabled(startOn, { persist: false });
      if (startOn) attachClick();
      else detachClick();
    }
    syncToolbarAdminBtn();
  }

  function disableAfterLogout() {
    try { window._floodPendingAdminEnable = false; } catch (e) { /* ignore */ }
    hideAllAdminUi();
    clearStoredAdminPreference();
  }

  function isFloodEditorAccount() {
    return !!(window.supabaseAuth && typeof window.supabaseAuth.isFloodAdmin === 'function' && window.supabaseAuth.isFloodAdmin());
  }

  /** Deep link ?admin=1 after login. */
  function enableAfterAuth() {
    if (!viewerRef || !isFloodEditorAccount()) return;
    adminChromeAllowed = true;
    setEnabled(true, { persist: true });
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
          alert('Sign in on the intro page, then open the simulator again.');
        }
        return;
      }
      if (!isFloodEditorAccount()) {
        alert('Only admin accounts can edit flood zones. Sign up with the admin code, or sign in with an admin account.');
        return;
      }
      adminChromeAllowed = true;
      setEnabled(true, { persist: true });
      attachClick();
    });
  }

  function getSelectedEditLevel() {
    var radios = document.getElementsByName('adminEditLevel');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
    return '30';
  }

  function levelLabel(level) {
    return level === '0.5' ? '0.5 m' : level === '1' ? '1 m' : level === '30' ? '0.1 mm' : level === '60' ? '0.5 mm' : level === '100' ? '1 mm' : level;
  }

  function init(viewer) {
    viewerRef = viewer;
    adminChromeAllowed = false;
    enabled = false;
    detachClick();
    var adminPanel = document.getElementById('adminControls');
    if (adminPanel) adminPanel.style.display = 'none';
    syncToolbarAdminBtn();

    if (!window.supabaseAuth || typeof window.supabaseAuth.isReady !== 'function' || !window.supabaseAuth.isReady()) {
      return;
    }
    window.supabaseAuth.getAuthForApi(function (auth) {
      if (!auth || !isFloodEditorAccount()) {
        return;
      }
      adminChromeAllowed = true;
      var pref = loadAdminEditingPreference();
      var startOn = pref !== false;
      setEnabled(startOn, { persist: false });
      if (startOn) attachClick();
    });

    var btn = document.getElementById('adminModeBtn');
    if (btn && !buttonListenerAttached) {
      buttonListenerAttached = true;
      btn.addEventListener('click', function () {
        if (enabled) {
          setEnabled(false, { persist: true });
          detachClick();
        } else {
          tryEnableAdminFromClick();
        }
      });
    }

    var exitBtn = document.getElementById('btnExitAdmin');
    if (exitBtn) {
      exitBtn.addEventListener('click', function () {
        setEnabled(false, { persist: true });
        detachClick();
      });
    }

    var selectAllBtn = document.getElementById('btnAdminSelectAll');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', function () {
        try { if (window.gridManager) window.gridManager.selectAll(getSelectedEditLevel()); } catch (e) { /* ignore */ }
      });
    }

    var clearBtn = document.getElementById('btnAdminClearTemp');
    var saveBtn = document.getElementById('btnAdminSave');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        try { if (window.gridManager) window.gridManager.clearTempSelection(); } catch (e) { /* ignore */ }
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var level = getSelectedEditLevel();
        try {
          if (window.gridManager) window.gridManager.saveSelection(level);
          var label = levelLabel(level);
          alert('Saved selection for ' + label);
        } catch (e) { alert('Save failed'); }
      });
    }

    var deleteBtn = document.getElementById('btnAdminDelete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        var level = getSelectedEditLevel();
        if (!confirm('Remove selected zones from ' + levelLabel(level) + '?')) return;
        try {
          if (window.gridManager) window.gridManager.deleteSelection(level);
        } catch (e) { alert('Delete failed'); }
      });
    }

    var visCheckboxes = [
      { id: 'adminShowLevel30', level: '30' },
      { id: 'adminShowLevel60', level: '60' },
      { id: 'adminShowLevel100', level: '100' },
      { id: 'adminShowLevel05', level: '0.5' },
      { id: 'adminShowLevel1', level: '1' },
    ];
    visCheckboxes.forEach(function (item) {
      var el = document.getElementById(item.id);
      if (!el) return;
      el.addEventListener('change', function () {
        try { if (window.gridManager) window.gridManager.setAdminLevelVisibility(item.level, el.checked); } catch (e) { /* ignore */ }
      });
    });
  }

  function attachClick() {
    if (!viewerRef || clickHandler) return;
    if (!isFloodEditorAccount()) return;
    var handler = new Cesium.ScreenSpaceEventHandler(viewerRef.scene.canvas);
    handler.setInputAction(function (click) {
      if (!enabled) return;
      if (window.mapScene && typeof window.mapScene.isSceneEditActive === 'function' && window.mapScene.isSceneEditActive()) {
        var sceneTool = document.getElementById('adminSceneTool');
        var st = sceneTool ? String(sceneTool.value || 'none') : 'none';
        if (st !== 'none') {
          try { window.mapScene.handleAdminClick(click); } catch (e) { console.error(e); }
          return;
        }
        return;
      }
      var picked = viewerRef.scene.pick(click.position);
      if (!picked || !picked.id) return;
      var entity = picked.id;
      var z = (window.floodZones || []).find(function (zz) { return zz.outlineEntity === entity; });
      if (!z) return;
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
