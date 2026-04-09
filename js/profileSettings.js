/**
 * Profile settings modal (avatar, account, PIN / username) — index.html only.
 */
(function () {
  'use strict';

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

  function accountDisplayName(user) {
    if (!user) return '';
    var em = user.email || '';
    return em.indexOf('@flood-app.local') !== -1 ? em.replace(/@flood-app\.local$/, '') : em;
  }

  function showProfileError(msg) {
    var el = document.getElementById('profileSettingsError');
    var ok = document.getElementById('profileSettingsOk');
    if (ok) {
      ok.textContent = '';
      ok.style.display = 'none';
    }
    if (el) {
      el.textContent = msg || '';
      el.style.display = msg ? 'block' : 'none';
    }
  }

  function showProfileOk(msg) {
    var el = document.getElementById('profileSettingsError');
    var ok = document.getElementById('profileSettingsOk');
    if (el) {
      el.textContent = '';
      el.style.display = 'none';
    }
    if (ok) {
      ok.textContent = msg || '';
      ok.style.display = msg ? 'block' : 'none';
    }
  }

  function fillAccountDetails() {
    var u = window.supabaseAuth && window.supabaseAuth.getCurrentUser();
    var nameEl = document.getElementById('profileAccountUsername');
    var emailEl = document.getElementById('profileAccountEmail');
    var usernameSection = document.getElementById('profileUsernameChangeSection');
    var newUserInput = document.getElementById('profileNewUsername');

    if (!u) return;
    var em = u.email || '';
    if (nameEl) {
      nameEl.textContent = accountDisplayName(u) || '—';
    }
    if (emailEl) {
      emailEl.textContent = em || '—';
    }
    var isLocal = em.indexOf('@flood-app.local') !== -1;
    if (usernameSection) {
      usernameSection.hidden = !isLocal;
    }
    if (newUserInput && isLocal) {
      newUserInput.value = accountDisplayName(u) || '';
    }
  }

  function openProfileModal() {
    var modal = document.getElementById('profileSettingsModal');
    if (!modal) return;
    if (!window.supabaseAuth || !window.supabaseAuth.getCurrentUser()) return;
    showProfileError('');
    showProfileOk('');
    fillAccountDetails();
    var pin1 = document.getElementById('profileNewPin');
    var pin2 = document.getElementById('profileConfirmPin');
    if (pin1) pin1.value = '';
    if (pin2) pin2.value = '';
    try {
      if (window.userAvatar && typeof window.userAvatar.initProfilePicker === 'function') {
        window.userAvatar.initProfilePicker();
      }
    } catch (e) { /* ignore */ }
    try {
      if (window.userAvatar && typeof window.userAvatar.refreshFromSession === 'function') {
        window.userAvatar.refreshFromSession();
      }
    } catch (e2) { /* ignore */ }
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeProfileModal() {
    var modal = document.getElementById('profileSettingsModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    showProfileError('');
    showProfileOk('');
  }

  function init() {
    var modal = document.getElementById('profileSettingsModal');
    if (!modal) return;

    var closeBtn = document.getElementById('profileSettingsModalClose');
    var backdrop = document.getElementById('profileSettingsModalBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeProfileModal);
    if (backdrop) backdrop.addEventListener('click', closeProfileModal);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && modal && !modal.hidden) closeProfileModal();
    });

    var landingProfileBtn = document.getElementById('landingProfileBtn');
    if (landingProfileBtn) {
      landingProfileBtn.addEventListener('click', function () {
        openProfileModal();
      });
    }

    var savePin = document.getElementById('profileSavePin');
    if (savePin) {
      savePin.addEventListener('click', function () {
        showProfileError('');
        showProfileOk('');
        var p1 = document.getElementById('profileNewPin');
        var p2 = document.getElementById('profileConfirmPin');
        var a = p1 && p1.value;
        var b = p2 && p2.value;
        if (a !== b) {
          showProfileError('New PIN and confirmation do not match.');
          return;
        }
        var pw = pinToSupabasePassword(a);
        if (!pw) {
          showProfileError('Enter exactly 4 digits for the new PIN.');
          return;
        }
        if (!window.supabaseAuth || typeof window.supabaseAuth.updatePassword !== 'function') {
          showProfileError('Unable to update PIN.');
          return;
        }
        savePin.disabled = true;
        window.supabaseAuth.updatePassword(pw, function (err) {
          savePin.disabled = false;
          if (err) {
            showProfileError(typeof err === 'string' ? err : String(err));
            return;
          }
          if (p1) p1.value = '';
          if (p2) p2.value = '';
          showProfileOk('PIN updated.');
        });
      });
    }

    var saveUser = document.getElementById('profileSaveUsername');
    if (saveUser) {
      saveUser.addEventListener('click', function () {
        showProfileError('');
        showProfileOk('');
        var inp = document.getElementById('profileNewUsername');
        var raw = inp && inp.value;
        var email = usernameToSupabaseEmail(raw);
        if (!email) {
          showProfileError('Username: letters, numbers, _ or - (min 2 characters).');
          return;
        }
        var cur = window.supabaseAuth && window.supabaseAuth.getCurrentUser();
        if (cur && cur.email && cur.email.toLowerCase() === email.toLowerCase()) {
          showProfileOk('That is already your username.');
          return;
        }
        if (!window.supabaseAuth || typeof window.supabaseAuth.updateEmail !== 'function') {
          showProfileError('Unable to update username.');
          return;
        }
        saveUser.disabled = true;
        window.supabaseAuth.updateEmail(email, function (err) {
          saveUser.disabled = false;
          if (err) {
            showProfileError(typeof err === 'string' ? err : String(err));
            return;
          }
          fillAccountDetails();
          showProfileOk('Username updated. If email confirmation is enabled in Supabase, check your inbox.');
        });
      });
    }
  }

  window.openFloodProfileModal = openProfileModal;
  window.closeFloodProfileModal = closeProfileModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
