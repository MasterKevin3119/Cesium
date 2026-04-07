/**
 * Persists each signed-in user's first selection per mission question in Supabase.
 * Retries (after wrong answer) do not overwrite — unique (user_id, mission_id, question_id).
 * Requires: 004_mission_first_answers.sql, js/supabaseAuth.js, viewer loads this before mission scripts.
 */
(function () {
  'use strict';

  function cloneDetail(detail) {
    if (!detail || typeof detail !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(detail));
    } catch (e) {
      return {};
    }
  }

  function record(detail) {
    if (!detail || !window.supabaseAuth) return;
    if (typeof window.supabaseAuth.getCurrentUser !== 'function') return;
    if (!window.supabaseAuth.getCurrentUser()) return;
    if (typeof window.supabaseAuth.getAuthForApi !== 'function') return;
    var missionId = detail.missionId || detail.mission;
    var questionId = detail.questionId;
    if (!missionId || !questionId) return;

    window.supabaseAuth.getAuthForApi(function (auth) {
      if (!auth || !auth.userId) return;
      var c = window.supabaseAuth.getSupabaseClient && window.supabaseAuth.getSupabaseClient();
      if (!c) return;
      var row = {
        user_id: auth.userId,
        mission_id: String(missionId),
        question_id: String(questionId),
        answer: cloneDetail(detail),
        is_correct: !!detail.isCorrect,
      };
      c.from('mission_first_answers').insert(row).then(function (res) {
        if (!res.error) return;
        var code = res.error.code;
        var msg = res.error.message || '';
        if (code === '23505' || /duplicate key|unique constraint/i.test(msg)) return;
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[missionFirstAnswers]', res.error);
        }
      });
    });
  }

  function init() {
    document.addEventListener('readTheWater:selection', function (ev) {
      if (ev && ev.detail) record(ev.detail);
    });
    document.addEventListener('identifyFlood:selection', function (ev) {
      if (ev && ev.detail) record(ev.detail);
    });
    document.addEventListener('decisionMaking:selection', function (ev) {
      if (ev && ev.detail) record(ev.detail);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.missionFirstAnswers = { record: record };
})();
