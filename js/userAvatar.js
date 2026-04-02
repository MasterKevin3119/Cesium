/**
 * Explorer avatars (DiceBear HTTP API) — local prefs + optional Supabase user_metadata.flood_avatar
 */
(function () {
  'use strict';

  var LS_KEY = 'flood_avatar_v1';
  var DIEBEAR_BASE = 'https://api.dicebear.com/7.x/';

  var STYLES = [
    { id: 'notionists', label: 'Calm' },
    { id: 'lorelei', label: 'Explorer' },
    { id: 'adventurer', label: 'Bold' },
    { id: 'bottts', label: 'Bot' },
    { id: 'open-peeps', label: 'Sketch' },
    { id: 'big-smile', label: 'Joy' },
  ];

  var DEFAULT_STYLE = 'notionists';

  function randomSeed() {
    var s = '';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < 16; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      if (typeof o.style !== 'string' || typeof o.seed !== 'string') return null;
      return { style: o.style, seed: o.seed };
    } catch (e) {
      return null;
    }
  }

  function writeLocal(prefs) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(prefs));
    } catch (e) { /* ignore */ }
  }

  function prefsFromUser() {
    if (!window.supabaseAuth) return null;
    var u = window.supabaseAuth.getCurrentUser();
    if (u && u.avatar && u.avatar.style && u.avatar.seed) return { style: u.avatar.style, seed: u.avatar.seed };
    return null;
  }

  function getPrefs() {
    var fromUser = prefsFromUser();
    if (fromUser) return fromUser;
    var loc = readLocal();
    if (loc) return loc;
    return { style: DEFAULT_STYLE, seed: randomSeed() };
  }

  function setPrefs(prefs, syncRemote) {
    if (!prefs || !prefs.style || !prefs.seed) return;
    writeLocal(prefs);
    try {
      window.dispatchEvent(new CustomEvent('floodAvatar:changed', { detail: prefs }));
    } catch (e) { /* ignore */ }
    if (syncRemote && window.supabaseAuth && typeof window.supabaseAuth.updateUserMetadata === 'function') {
      var u = window.supabaseAuth.getCurrentUser();
      if (u) {
        window.supabaseAuth.updateUserMetadata({ flood_avatar: prefs }, function () { /* ignore */ });
      }
    }
  }

  function avatarUrl(prefs, size) {
    prefs = prefs || getPrefs();
    var px = size || 128;
    var enc = encodeURIComponent(prefs.seed);
    return DIEBEAR_BASE + encodeURIComponent(prefs.style) + '/svg?seed=' + enc + '&size=' + px;
  }

  function createBadgeElement(opts) {
    opts = opts || {};
    var size = opts.size || 48;
    var wrap = document.createElement('div');
    wrap.className = 'flood-mission-avatar';
    wrap.setAttribute('title', 'Your explorer profile');
    var img = document.createElement('img');
    img.width = size;
    img.height = size;
    img.alt = '';
    img.className = 'flood-mission-avatar__img';
    img.src = avatarUrl(getPrefs(), size * 2);
    img.decoding = 'async';
    wrap.appendChild(img);
    var label = document.createElement('span');
    label.className = 'flood-mission-avatar__cap';
    label.textContent = 'Explorer';
    wrap.appendChild(label);
    function refresh() {
      img.src = avatarUrl(getPrefs(), size * 2);
    }
    window.addEventListener('floodAvatar:changed', refresh);
    return wrap;
  }

  function mountInSlot(slotEl, opts) {
    if (!slotEl || slotEl.querySelector('.flood-mission-avatar')) return;
    slotEl.appendChild(createBadgeElement(opts));
  }

  function mountBadgeInHeader(headerEl, opts) {
    if (!headerEl || headerEl.querySelector('.flood-mission-avatar')) return;
    headerEl.insertBefore(createBadgeElement(opts), headerEl.firstChild);
  }

  function stripSignInButtonLayout(btn) {
    if (!btn) return;
    btn.classList.remove('site-header__auth--has-face');
    var face = btn.querySelector('.site-header__auth-face');
    if (face) face.remove();
    var lab = btn.querySelector('.site-header__auth-label');
    if (lab) lab.remove();
    btn.textContent = 'Sign in';
  }

  function ensureSignInButtonLayout(btn) {
    if (!btn || btn.querySelector('.site-header__auth-face')) return;
    var face = document.createElement('span');
    face.className = 'site-header__auth-face';
    face.setAttribute('aria-hidden', 'true');
    var img = document.createElement('img');
    img.alt = '';
    img.className = 'site-header__auth-face-img';
    img.width = 28;
    img.height = 28;
    face.appendChild(img);
    var label = document.createElement('span');
    label.className = 'site-header__auth-label';
    while (btn.firstChild) label.appendChild(btn.firstChild);
    btn.appendChild(face);
    btn.appendChild(label);
  }

  /** Avatar beside Sign in only when logged in; guests see plain text. */
  function refreshSignInButton(btn) {
    if (!btn) return;
    var loggedIn = !!(window.supabaseAuth && typeof window.supabaseAuth.getCurrentUser === 'function' && window.supabaseAuth.getCurrentUser());
    if (!loggedIn) {
      stripSignInButtonLayout(btn);
      btn.textContent = 'Sign in';
      return;
    }
    ensureSignInButtonLayout(btn);
    btn.classList.add('site-header__auth--has-face');
    var img = btn.querySelector('.site-header__auth-face-img');
    if (img) {
      img.src = avatarUrl(getPrefs(), 64);
      img.style.display = '';
    }
  }

  function initPicker(modalRoot) {
    if (!modalRoot) return;
    var preview = document.getElementById('avatarPreview');
    var chipsWrap = document.getElementById('avatarStyleChips');
    var shuffleBtn = document.getElementById('avatarShuffle');
    if (!preview || !chipsWrap) return;

    var state = getPrefs();

    function syncPreview() {
      preview.src = avatarUrl(state, 160);
      preview.alt = 'Avatar preview';
    }

    function setChipActive() {
      chipsWrap.querySelectorAll('.avatar-picker__chip').forEach(function (el) {
        el.classList.toggle('avatar-picker__chip--active', el.getAttribute('data-style') === state.style);
      });
    }

    chipsWrap.innerHTML = '';
    STYLES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'avatar-picker__chip' + (state.style === s.id ? ' avatar-picker__chip--active' : '');
      b.setAttribute('data-style', s.id);
      b.textContent = s.label;
      b.title = s.id;
      b.addEventListener('click', function () {
        state.style = s.id;
        setChipActive();
        syncPreview();
        setPrefs(state, !!(window.supabaseAuth && window.supabaseAuth.getCurrentUser()));
      });
      chipsWrap.appendChild(b);
    });

    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', function () {
        state.seed = randomSeed();
        syncPreview();
        setPrefs(state, !!(window.supabaseAuth && window.supabaseAuth.getCurrentUser()));
      });
    }

    syncPreview();
    window.addEventListener('floodAvatar:changed', function () {
      state = getPrefs();
      syncPreview();
      setChipActive();
    });
  }

  function refreshFromSession() {
    try {
      window.dispatchEvent(new CustomEvent('floodAvatar:changed', { detail: getPrefs() }));
    } catch (e) { /* ignore */ }
  }

  function mergeSignupMetadataInto(base) {
    var p = getPrefs();
    base = base || {};
    base.flood_avatar = { style: p.style, seed: p.seed };
    return base;
  }

  window.userAvatar = {
    STYLES: STYLES,
    getPrefs: getPrefs,
    setPrefs: setPrefs,
    avatarUrl: avatarUrl,
    createBadgeElement: createBadgeElement,
    mountInSlot: mountInSlot,
    mountBadgeInHeader: mountBadgeInHeader,
    refreshSignInButton: refreshSignInButton,
    refreshFromSession: refreshFromSession,
    initPicker: initPicker,
    mergeSignupMetadataInto: mergeSignupMetadataInto,
  };
})();
