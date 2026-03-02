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

  function promptPassword() {
    const p = prompt('Enter admin password:');
    if (p === null) return false;
    return String(p) === '3119';
  }

  function setEnabled(val) {
    enabled = !!val;
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
    const adminPanel = document.getElementById('adminControls');
    if (adminPanel) adminPanel.style.display = enabled ? 'block' : 'none';
    const btn = document.getElementById('adminModeBtn');
    if (btn) btn.style.background = enabled ? '#ffcc00' : '';
    // Refresh grid colors when switching mode (admin vs user view)
    try { if (window.gridManager && window.gridManager.updateAllVisuals) window.gridManager.updateAllVisuals(); } catch (e) { /* ignore */ }
  }

  function loadEnabled() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === '1';
    } catch (e) { return false; }
  }

  function init(viewer) {
    viewerRef = viewer;
    enabled = loadEnabled();
    setEnabled(enabled);

    const btn = document.getElementById('adminModeBtn');
    if (btn && !buttonListenerAttached) {
      buttonListenerAttached = true;
      btn.addEventListener('click', function () {
        if (enabled) { setEnabled(false); detachClick(); return; }
        if (!promptPassword()) { alert('Incorrect password'); return; }
        setEnabled(true);
        attachClick();
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
      let level = '0.5';
      for (let i = 0; i < radios.length; i++) if (radios[i].checked) { level = radios[i].value; break; }
      try {
        if (window.gridManager) window.gridManager.saveSelection(level);
        alert('Saved selection for ' + level + ' m');
      } catch (e) { alert('Save failed'); }
    });

    if (enabled) attachClick();
  }

  function attachClick() {
    if (!viewerRef || clickHandler) return;
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
  };
})();
