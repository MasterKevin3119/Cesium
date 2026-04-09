/**
 * Account UI (Sign in / Sign up) for pages without the Cesium viewer.
 * Viewer uses the same Supabase session; admins get the zone editor automatically.
 */
(function () {
  'use strict';

  var FLOOD_ADMIN_SIGNUP_CODE = '3119';

  function initFloodAuthUi(opts) {
    opts = opts || {};
    var signUpBtnId = opts.signUpBtnId || 'landingSignUpBtn';
    var userAuthBtnId = opts.userAuthBtnId || 'landingAuthBtn';

    var landingProfileBtn = document.getElementById('landingProfileBtn');

    var panel = document.getElementById('authPanel');
    var modal = document.getElementById('authModal');
    var userAuthBtn = document.getElementById(userAuthBtnId);
    var landingSignUpBtn = document.getElementById(signUpBtnId);
    var loggedOut = document.getElementById('authLoggedOut');
    var loggedIn = document.getElementById('authLoggedIn');
    var authUserEmail = document.getElementById('authUserEmail');
    var authError = document.getElementById('authError');
    var authUsername = document.getElementById('authUsername');
    var authPin = document.getElementById('authPin');
    var authAdminCode = document.getElementById('authAdminCode');
    var authModeLogin = document.getElementById('authModeLogin');
    var authModeSignUp = document.getElementById('authModeSignUp');
    var authModalTitleEl = document.getElementById('authModalTitle');
    var authSharedTitle = document.getElementById('authSharedTitle');

    if (!panel || !window.supabaseAuth || !window.supabaseAuth.isReady()) {
      if (userAuthBtn) userAuthBtn.style.display = 'none';
      if (landingSignUpBtn) landingSignUpBtn.style.display = 'none';
      if (landingProfileBtn) landingProfileBtn.hidden = true;
      return;
    }

    var authModalContext = document.getElementById('authModalContext');

    /** Sign up is only for guests — hide whenever Supabase has an active session. */
    function updateLandingSignUpVisible(show) {
      if (!landingSignUpBtn) return;
      if (!show) {
        landingSignUpBtn.hidden = true;
        landingSignUpBtn.style.display = 'none';
        landingSignUpBtn.setAttribute('aria-hidden', 'true');
      } else {
        landingSignUpBtn.hidden = false;
        landingSignUpBtn.style.removeProperty('display');
        landingSignUpBtn.removeAttribute('aria-hidden');
      }
    }

    function setAuthModeLogin() {
      if (authModeLogin) authModeLogin.hidden = false;
      if (authModeSignUp) authModeSignUp.hidden = true;
      if (authModalTitleEl) authModalTitleEl.textContent = 'Account';
      if (authSharedTitle) authSharedTitle.textContent = 'Username + 4-digit PIN (zones saved per account when logged in)';
    }

    function setAuthModeSignUp() {
      if (authModeLogin) authModeLogin.hidden = true;
      if (authModeSignUp) authModeSignUp.hidden = false;
      if (authModalTitleEl) authModalTitleEl.textContent = 'Create account';
      if (authSharedTitle) authSharedTitle.textContent = 'Choose avatar, then username + PIN';
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
      setAuthModeLogin();
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
      setAuthModeLogin();
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (authError) { authError.textContent = ''; authError.style.display = 'none'; }
      try { if (authAdminCode) authAdminCode.value = ''; } catch (e) { /* ignore */ }
    }

    window.openFloodAuthModal = function (contextText) {
      openAuthModal(contextText || '');
    };

    if (userAuthBtn) {
      userAuthBtn.addEventListener('click', function () {
        try { window._floodAuthNext = null; } catch (e) { /* ignore */ }
        openAuthModal('');
      });
    }

    if (landingSignUpBtn) {
      landingSignUpBtn.addEventListener('click', function () {
        try { window._floodAuthNext = null; } catch (e) { /* ignore */ }
        openAuthModal('');
        setAuthModeSignUp();
        try {
          var sh = document.getElementById('avatarShuffle');
          if (sh) sh.focus();
          else if (authUsername) authUsername.focus();
        } catch (e2) { /* ignore */ }
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
    function formatAuthSignupError(err) {
      var s = typeof err === 'string' ? err : ((err && err.message) ? String(err.message) : String(err || ''));
      if (/signup.*disabled|signups.*disabled|email signups/i.test(s)) {
        return 'Supabase has signups disabled. In the Supabase Dashboard: Authentication → Settings → allow new users to sign up. See docs/SUPABASE_SETUP.md.';
      }
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

    function tryLandingNextParam() {
      var next = null;
      try {
        var q = new URLSearchParams(window.location.search);
        next = sanitizeNext(q.get('next') || '');
      } catch (e) { /* ignore */ }
      if (!next) return;
      window.supabaseAuth.getAuthForApi(function () {
        var user = window.supabaseAuth.getCurrentUser();
        if (user) {
          if (maybeRedirectAfterAuth()) return;
          return;
        }
        try { window._floodAuthNext = next; } catch (e) { /* ignore */ }
        var ctx;
        if (next.indexOf('admin=1') !== -1) {
          ctx = 'Sign in with an admin account to open the zone editor (admins see it automatically after sign-in).';
        } else if (/^mission-.*\.html/i.test(next)) {
          ctx = 'Sign in or create an account to open missions and the flood map.';
        } else {
          ctx = 'Sign in or create an account to use the simulator and missions.';
        }
        openAuthModal(ctx);
      });
    }

    function updateAuthUI(sessionAuth) {
      var hasSession = !!sessionAuth;
      updateLandingSignUpVisible(!hasSession);

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
            else userAuthBtn.textContent = 'Sign in';
          } catch (e) {
            userAuthBtn.textContent = 'Sign in';
          }
          userAuthBtn.title = 'Sign in or create an account';
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
    tryLandingNextParam();

    try {
      if (modal && window.userAvatar) window.userAvatar.initPicker(modal);
    } catch (e) { /* ignore */ }

    var swUp = document.getElementById('authSwitchToSignUp');
    var swIn = document.getElementById('authSwitchToLogin');
    if (swUp) swUp.addEventListener('click', function () {
      showError('');
      setAuthModeSignUp();
      try { document.getElementById('avatarShuffle').focus(); } catch (e) { try { if (authUsername) authUsername.focus(); } catch (e2) { /* ignore */ } }
    });
    if (swIn) swIn.addEventListener('click', function () {
      showError('');
      setAuthModeLogin();
      try { if (authUsername) authUsername.focus(); } catch (e) { /* ignore */ }
    });

    if (document.getElementById('authSignIn')) {
      document.getElementById('authSignIn').addEventListener('click', function () {
        var email = usernameToSupabaseEmail(authUsername && authUsername.value);
        var password = pinToSupabasePassword(authPin && authPin.value);
        if (!email) { showError('Username: letters, numbers, _ or - (min 2 chars)'); return; }
        if (!password) { showError('Enter exactly 4 digits for PIN'); return; }
        showError('');
        window.supabaseAuth.signIn(email, password, function (err) {
          if (err) { showError(err); return; }
          authRefreshUi();
          if (maybeRedirectAfterAuth()) return;
          closeAuthModal();
        });
      });
    }
    if (document.getElementById('authSignUp')) {
      document.getElementById('authSignUp').addEventListener('click', function () {
        var email = usernameToSupabaseEmail(authUsername && authUsername.value);
        var password = pinToSupabasePassword(authPin && authPin.value);
        if (!email) { showError('Username: letters, numbers, _ or - (min 2 chars)'); return; }
        if (!password) { showError('Enter exactly 4 digits for PIN'); return; }
        showError('');
        var adminRaw = authAdminCode ? String(authAdminCode.value).trim() : '';
        var signUpOpts = { userData: {} };
        if (adminRaw === FLOOD_ADMIN_SIGNUP_CODE) {
          signUpOpts.userData.flood_is_admin = true;
        } else if (adminRaw.length > 0 && adminRaw !== FLOOD_ADMIN_SIGNUP_CODE) {
          showError('Admin code is not valid. Leave the field empty or use the correct code when signing up.');
          return;
        }
        if (window.userAvatar && typeof window.userAvatar.mergeSignupMetadataInto === 'function') {
          signUpOpts.userData = window.userAvatar.mergeSignupMetadataInto(signUpOpts.userData);
        }
        window.supabaseAuth.signUp(email, password, function (err) {
          if (err) { showError(formatAuthSignupError(err)); return; }
          authRefreshUi();
          if (maybeRedirectAfterAuth()) return;
          closeAuthModal();
        }, signUpOpts);
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

    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('openAuth') === '1') openAuthModal('');
    } catch (e) { /* ignore */ }
  }

  window.initFloodAuthUi = initFloodAuthUi;
})();
