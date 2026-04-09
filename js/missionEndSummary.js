/**
 * After a mission, loads first-try answers from Supabase and shows a short performance summary.
 * Depends: Supabase CDN, js/supabaseConfig.js, js/supabaseAuth.js
 */
(function () {
  "use strict";

  var QUESTION_SHORT = {
    "depth-0.5m": "0.5 m depth (Read The Water)",
    "depth-1m": "1.0 m depth (Read The Water)",
    "map-flood-0.5m": "0.5 m flooded map",
    "map-flood-1m": "1.0 m flooded map",
    "flow-direction-1": "flood flow direction",
    "escape-route-1": "escape routes at 0.5 m",
    "escape-route-1m": "escape routes at 1 m",
  };

  function labelForQuestion(qid) {
    return QUESTION_SHORT[qid] || qid || "a question";
  }

  function explainWrong(missionId, row) {
    var a = row.answer && typeof row.answer === "object" ? row.answer : {};
    var q = row.question_id || a.questionId;
    if (missionId === "read-water" || missionId === "flooded-areas") {
      if (a.selectedFile && a.correctFile && a.selectedFile !== a.correctFile) {
        return (
          "First choice did not match the target depth — compare water level and spread in the images before choosing."
        );
      }
      return "First choice did not match the scenario; review how depth shows up in the imagery.";
    }
    if (missionId === "decision-making") {
      if (q === "flow-direction-1") {
        return "Watch where water and debris move in the simulation to judge flow direction.";
      }
      if (q === "escape-route-1") {
        var wv = a.wrongVariant;
        if (wv === "noneAt05") {
          return "At this depth there were safe dry routes — \"no path\" was not the right call.";
        }
        if (wv === "needBoth") {
          return "More than one route was safe; you needed to select every safe option, then Submit.";
        }
        if (wv === "incomplete") {
          return "The question asked for all answers that apply — submit only after selecting each safe route.";
        }
        return "Match routes to flood depth and flow: prefer dry paths and avoid flooded segments.";
      }
      if (q === "escape-route-1m") {
        if (a.wrongVariant === "incomplete") {
          return "Select an answer before Submit when choosing a single option.";
        }
        return "At 1 m depth, all paths were unsafe — the suitable choice was that no route was safe.";
      }
    }
    return "Review the feedback in the mission and try a similar scenario again.";
  }

  function render(container, missionId, missionLabel, rows) {
    if (!container) return;
    var label = (missionLabel && String(missionLabel).trim()) || "this mission";
    container.removeAttribute("hidden");
    container.innerHTML = "";

    var head = document.createElement("h2");
    head.className = "mission-end-summary__heading";
    head.textContent = "How you did on first try";
    container.appendChild(head);

    if (!rows || rows.length === 0) {
      var p = document.createElement("p");
      p.className = "mission-end-summary__text";
      p.textContent =
        "No first-try answers were saved for this mission. Sign in before playing so we can store your first selection for each question.";
      container.appendChild(p);
      return;
    }

    var correct = 0;
    var wrongList = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.is_correct === true) correct += 1;
      else wrongList.push(r);
    }
    var total = rows.length;

    var lead = document.createElement("p");
    lead.className = "mission-end-summary__text mission-end-summary__lead";
    if (wrongList.length === 0) {
      lead.textContent =
        "Strong work — you answered all " +
        total +
        " question" +
        (total === 1 ? "" : "s") +
        " correctly on your first try in " +
        label +
        ".";
    } else if (correct === 0) {
      lead.textContent =
        "On your first try at each question in " +
        label +
        ", none of the " +
        total +
        " answers were correct yet. The tips below point to what to review; replaying the mission can help.";
    } else {
      lead.textContent =
        "On your first try in " +
        label +
        ", you got " +
        correct +
        " of " +
        total +
        " question" +
        (total === 1 ? "" : "s") +
        " right. Below is where to focus.";
    }
    container.appendChild(lead);

    if (wrongList.length === 0) return;

    var ul = document.createElement("ul");
    ul.className = "mission-end-summary__list";
    wrongList.forEach(function (row) {
      var qid = row.question_id || (row.answer && row.answer.questionId);
      var li = document.createElement("li");
      li.className = "mission-end-summary__item";
      var strong = document.createElement("strong");
      strong.textContent = labelForQuestion(qid);
      li.appendChild(strong);
      li.appendChild(document.createTextNode(" — "));
      var span = document.createElement("span");
      span.textContent = explainWrong(missionId, row);
      li.appendChild(span);
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  function run(completedMissionId, missionLabel) {
    var box = document.getElementById("missionFirstTrySummary");
    if (!box) return;
    if (!completedMissionId) {
      box.setAttribute("hidden", "");
      return;
    }
    if (!window.supabaseAuth || typeof window.supabaseAuth.getAuthForApi !== "function") {
      box.setAttribute("hidden", "");
      return;
    }
    window.supabaseAuth.getAuthForApi(function (auth) {
      if (!auth) {
        box.removeAttribute("hidden");
        box.innerHTML =
          '<h2 class="mission-end-summary__heading">How you did on first try</h2>' +
          '<p class="mission-end-summary__text">Sign in before playing missions to see a summary of your first answer per question here.</p>';
        return;
      }
      var c = window.supabaseAuth.getSupabaseClient && window.supabaseAuth.getSupabaseClient();
      if (!c) {
        box.setAttribute("hidden", "");
        return;
      }
      c.from("mission_first_answers")
        .select("question_id, is_correct, answer")
        .eq("mission_id", completedMissionId)
        .order("created_at", { ascending: true })
        .then(function (res) {
          if (res.error) {
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[missionEndSummary]", res.error);
            }
            box.removeAttribute("hidden");
            box.innerHTML =
              '<h2 class="mission-end-summary__heading">How you did on first try</h2>' +
              '<p class="mission-end-summary__text">Could not load your summary. Check your connection and try again later.</p>';
            return;
          }
          render(box, completedMissionId, missionLabel, res.data || []);
        })
        .catch(function (e) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[missionEndSummary]", e);
          }
          box.setAttribute("hidden", "");
        });
    });
  }

  window.missionEndSummary = { run: run };
})();
