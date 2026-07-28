/**
 * Admin Sign In UI for pages without the Cesium viewer.
 * There is no public sign-up — the single admin account is created directly
 * in the Supabase Dashboard (see docs/SUPABASE_SETUP.md). Signing in here
 * only unlocks the flood-zone editor in the simulator.
 */
(function () {
  'use strict';

  function initFloodAuthUi(opts) {
    opts = opts || {};
    var userAuthBtnId = opts.userAuthBtnId || 'landingAuthBtn';

    var landingProfileBtn = document.getElementById('landingProfileBtn');

    var panel = document.getElementById('authPanel');
    var modal = document.getElementById('authModal');
    var userAuthBtn = document.getElementById(userAuthBtnId);
    var loggedOut = document.getElementById('authLoggedOut');
    var loggedIn = document.getElementById('authLoggedIn');
    var authUserEmail = document.getElementById('authUserEmail');
    var authError = document.getElementById('authError');
    var authUsername = document.getElementById('authUsername');
    var authPin = document.getElementById('authPin');
    var authModalTitleEl = document.getElementById('authModalTitle');
    var authSharedTitle = document.getElementById('authSharedTitle');

    if (!panel || !window.supabaseAuth || !window.supabaseAuth.isReady()) {
      if (userAuthBtn) userAuthBtn.style.display = 'none';
      if (landingProfileBtn) landingProfileBtn.hidden = true;
      return;
    }

    var authModalContext = document.getElementById('authModalContext');

    function setAuthModalCopy() {
      if (authModalTitleEl) authModalTitleEl.textContent = 'Admin Sign In';
      if (authSharedTitle) authSharedTitle.textContent = 'Admin username + password';
    }

    function openAuthModal(contextText) {
      if (!modal) return;
      if (authModalContext) {
        if (contextText) {
          authModalContext.textContent = contextText;
          authModalContext.hidden = false;
        } else {
          authModalContext.textContent = '';
          authModalContext.hidden = true;
        }
      }
      setAuthModalCopy();
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      try { if (authUsername) authUsername.focus(); } catch (e) { /* ignore */ }
    }

    function closeAuthModal() {
      if (!modal) return;
      if (authModalContext) {
        authModalContext.textContent = '';
        authModalContext.hidden = true;
      }
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (authError) { authError.textContent = ''; authError.style.display = 'none'; }
    }

    window.openFloodAuthModal = function (contextText) {
      openAuthModal(contextText || '');
    };

    if (userAuthBtn) {
      userAuthBtn.addEventListener('click', function () {
        try { window._floodAuthNext = null; } catch (e) { /* ignore */ }
        var user = window.supabaseAuth && window.supabaseAuth.getCurrentUser();
        if (user && typeof window.openFloodProfileModal === 'function') {
          window.openFloodProfileModal();
        } else {
          openAuthModal('');
        }
      });
    }

    var closeBtn = document.getElementById('authModalClose');
    var backdrop = document.getElementById('authModalBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
    if (backdrop) backdrop.addEventListener('click', closeAuthModal);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && modal && !modal.hidden) closeAuthModal();
    });

    function usernameToSupabaseEmail(raw) {
      var s = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (s.length < 2) return null;
      return s + '@flood-app.local';
    }
    function pinToSupabasePassword(pin) {
      var d = String(pin || '').replace(/\D/g, '');
      if (d.length !== 4) return null;
      return '00' + d;
    }
    function showError(msg) {
      if (authError) { authError.textContent = msg || ''; authError.style.display = msg ? 'block' : 'none'; }
    }
    function formatNetworkError(s) {
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(s)) {
        return 'Cannot reach the server. Your Supabase project may be paused — go to supabase.com, open your project, and click "Restore" if it shows as paused. Then try again.';
      }
      return null;
    }
    function formatAuthSignInError(err) {
      var s = typeof err === 'string' ? err : ((err && err.message) ? String(err.message) : String(err || ''));
      var net = formatNetworkError(s);
      if (net) return net;
      return s;
    }
    function accountDisplayName(user) {
      if (!user) return '';
      var em = user.email || '';
      return em.indexOf('@flood-app.local') !== -1 ? em.replace(/@flood-app\.local$/, '') : (em || 'Account');
    }

    function sanitizeNext(raw) {
      if (!raw || typeof raw !== 'string') return null;
      var s = raw.trim();
      try { s = decodeURIComponent(s); } catch (e) { /* ignore */ }
      if (s.indexOf('..') !== -1) return null;
      if (/^https?:\/\//i.test(s)) return null;
      var patterns = [
        /^viewer\.html([?#].*)?$/i,
        /^mission-(read-water|flooded-areas|decision-making)\.html([?#].*)?$/i,
        /^mission-end\.html([?#].*)?$/i,
        /^flood-defender\/index\.html([?#].*)?$/i,
      ];
      for (var i = 0; i < patterns.length; i++) {
        if (patterns[i].test(s)) return s;
      }
      return null;
    }

    function maybeRedirectAfterAuth() {
      var next = null;
      try {
        next = sanitizeNext(window._floodAuthNext);
        window._floodAuthNext = null;
      } catch (e) { /* ignore */ }
      if (!next) {
        try {
          var q = new URLSearchParams(window.location.search);
          next = sanitizeNext(q.get('next') || '');
        } catch (e) { /* ignore */ }
      }
      if (next) {
        window.location.href = next;
        return true;
      }
      return false;
    }

    function updateAuthUI(sessionAuth) {
      var user = window.supabaseAuth.getCurrentUser();
      if (user) {
        if (loggedOut) loggedOut.style.display = 'none';
        if (loggedIn) loggedIn.style.display = 'block';
        if (landingProfileBtn) {
          landingProfileBtn.hidden = false;
          landingProfileBtn.removeAttribute('hidden');
        }
        if (authUserEmail) {
          var nm = accountDisplayName(user);
          authUserEmail.textContent = user.isAdmin ? (nm + ' · Admin') : nm;
        }
        if (userAuthBtn) {
          var shortName = accountDisplayName(user);
          var btnLabel = user.isAdmin ? (shortName + ' (Admin)') : shortName;
          if (btnLabel.length > 20) btnLabel = btnLabel.slice(0, 19) + '…';
          try {
            if (window.userAvatar) window.userAvatar.refreshSignInButton(userAuthBtn);
          } catch (e) { /* ignore */ }
          var labIn = userAuthBtn.querySelector('.site-header__auth-label');
          if (labIn) labIn.textContent = btnLabel;
          else userAuthBtn.textContent = btnLabel;
          userAuthBtn.title = user.isAdmin ? 'Signed in as admin — account' : 'Signed in — account';
          userAuthBtn.classList.toggle('site-header__auth--admin', !!user.isAdmin);
        }
        showError('');
      } else {
        if (loggedOut) loggedOut.style.display = 'block';
        if (loggedIn) loggedIn.style.display = 'none';
        if (landingProfileBtn) {
          landingProfileBtn.hidden = true;
          landingProfileBtn.setAttribute('hidden', '');
        }
        if (authUserEmail) authUserEmail.textContent = '';
        if (userAuthBtn) {
          try {
            if (window.userAvatar) window.userAvatar.refreshSignInButton(userAuthBtn);
            else userAuthBtn.textContent = 'Admin';
          } catch (e) {
            userAuthBtn.textContent = 'Admin';
          }
          userAuthBtn.title = 'Sign in as admin to edit the flood simulator';
          userAuthBtn.classList.remove('site-header__auth--admin');
        }
      }
    }

    function authRefreshUi() {
      window.supabaseAuth.getAuthForApi(function (auth) {
        try {
          if (window.userAvatar) window.userAvatar.refreshFromSession();
        } catch (e) { /* ignore */ }
        updateAuthUI(auth);
      });
    }

    authRefreshUi();
    window.supabaseAuth.onAuthChange(authRefreshUi);

    if (document.getElementById('authSignIn')) {
      document.getElementById('authSignIn').addEventListener('click', function () {
        var email = usernameToSupabaseEmail(authUsername && authUsername.value);
        var password = pinToSupabasePassword(authPin && authPin.value);
        if (!email) { showError('Username: letters, numbers, _ or - (min 2 chars)'); return; }
        if (!password) { showError('Enter the 4-digit admin password'); return; }
        showError('');
        window.supabaseAuth.signIn(email, password, function (err) {
          if (err) { showError(formatAuthSignInError(err)); return; }
          authRefreshUi();
          if (maybeRedirectAfterAuth()) return;
          closeAuthModal();
        });
      });
    }
    if (document.getElementById('authSignOut')) {
      document.getElementById('authSignOut').addEventListener('click', function () {
        showError('');
        window.supabaseAuth.signOut();
        closeAuthModal();
      });
    }

    var authOpenProfile = document.getElementById('authOpenProfile');
    if (authOpenProfile) {
      authOpenProfile.addEventListener('click', function () {
        closeAuthModal();
        if (typeof window.openFloodProfileModal === 'function') window.openFloodProfileModal();
      });
    }

  }

  window.initFloodAuthUi = initFloodAuthUi;
})();
