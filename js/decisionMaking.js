/**
 * Flood Awareness & Safe Decision-Making (?mission=decision-making)
 * Step 1: compass (1.png). Step 2: routes — Blue+Green (2.png). Step 3: same map — only “no path” (2.png, 1 m).
 *
 * Emits CustomEvent "decisionMaking:selection", window.__DECISION_MAKING_LAST_SELECTION__,
 * postMessage { type: "decisionMaking:selection", payload } from iframe.
 */
(function () {
  "use strict";

  var ASSETS_BASE = "assets/decision-making/";

  /** Order around the compass dial (0° = N, 90° = E). */
  var COMPASS_DIRECTIONS = [
    "north",
    "north-east",
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
  ];

  var DIRECTION_LABELS = {
    north: "N",
    "north-east": "NE",
    east: "E",
    "south-east": "SE",
    south: "S",
    "south-west": "SW",
    west: "W",
    "north-west": "NW",
  };

  /** Angle in degrees for position on dial (0 = top/North, 90 = right/East). */
  var DIRECTION_ANGLE = {
    north: 0,
    "north-east": 45,
    east: 90,
    "south-east": 135,
    south: 180,
    "south-west": 225,
    west: 270,
    "north-west": 315,
  };

  function positionOnCircle(angleDeg, radiusPct) {
    var rad = (angleDeg * Math.PI) / 180;
    var x = radiusPct * Math.sin(rad);
    var y = -radiusPct * Math.cos(rad);
    return { x: x, y: y };
  }

  var STEPS = [
    {
      scenarioId: 1,
      type: "compass",
      questionId: "flow-direction-1",
      question:
        "Based on the flood simulation shown, in which direction is the floodwater primarily flowing?",
      mapFile: "1.png",
      correctDirection: "south-east",
      correct: {
        title: "Good Job",
        body:
          "Well done! You correctly identified the flood flow direction by observing water movement.",
        nextLabel: "Next",
      },
      wrong: {
        title: "Not Quite",
        body:
          "Try observing the direction of water movement, floating debris, or where water accumulates most quickly in the simulation.",
        tryAgainLabel: "Try Again",
      },
    },
    {
      scenarioId: 2,
      type: "routes",
      questionId: "escape-route-1",
      question:
        "Considering the flood flow direction and 0.5 m water depth, which route offers the safest escape to a less affected area?",
      mapFile: "2.png",
      routeHint: "Select all safe routes.",
      correctAnswers: ["blue", "green"],
      options: [
        { id: "blue", label: "Blue Path" },
        { id: "green", label: "Green Path" },
        { id: "red", label: "Red Path" },
        { id: "none", label: "There's no suitable path" },
      ],
      correct: {
        title: "Good Job",
        body:
          "Well done! Blue and Green paths both offer safe escape routes away from the main flood flow.",
        nextLabel: "Next",
      },
      wrong: {
        title: "Not Quite",
        body:
          "There is a suitable escape route available.",
        bodyHtml:
          "There <em>is</em> a suitable escape route available.",
        tryAgainLabel: "Try Again →",
      },
      wrongIncomplete: {
        title: "Not Quite",
        body: "Choose all correct answers.",
        bodyHtml: "Choose <strong>all</strong> correct answers.",
        tryAgainLabel: "Try Again →",
      },
    },
    {
      scenarioId: 3,
      type: "routes",
      questionId: "escape-route-1m",
      question:
        "Considering the flood flow direction and 1 m water depth, which route offers the safest escape to a less affected area?",
      mapFile: "2.png",
      routeHint: "Choose the option that matches this scenario, then tap Submit.",
      correctAnswers: ["none"],
      options: [
        { id: "blue", label: "Blue Path" },
        { id: "green", label: "Green Path" },
        { id: "red", label: "Red Path" },
        { id: "none", label: "There's no suitable path" },
      ],
      correct: {
        title: "Good Job",
        body:
          "At 1 m depth, conditions can make every visible route unsafe. Recognising when there is no suitable path is an important part of flood decision-making.",
        nextLabel: "Next",
      },
      wrong: {
        title: "Not Quite",
        body:
          "At 1 m water depth, flooding is severe. Re-check whether any of these routes is still safe—or if none of them is.",
        bodyHtml:
          "At <strong>1 m</strong> water depth, flooding is severe. Re-check whether any route is still safe—or if <strong>none</strong> of them is.",
        tryAgainLabel: "Try Again →",
      },
      wrongIncomplete: {
        title: "Not Quite",
        body: "Select an answer, then tap Submit.",
        bodyHtml: "Select an answer, then tap <strong>Submit</strong>.",
        tryAgainLabel: "Try Again →",
      },
    },
  ];

  function emitSelection(detail) {
    window.__DECISION_MAKING_LAST_SELECTION__ = detail;
    try {
      document.dispatchEvent(new CustomEvent("decisionMaking:selection", { detail: detail }));
    } catch (e) {
      /* ignore */
    }
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: "decisionMaking:selection", payload: detail },
          "*"
        );
      } catch (e2) {
        /* ignore */
      }
    }
    if (typeof console !== "undefined" && console.info) {
      console.info("[decision-making] selection", detail);
    }
  }

  function shouldMount() {
    try {
      var p = new URLSearchParams(window.location.search);
      return p.get("mission") === "decision-making";
    } catch (e) {
      return false;
    }
  }

  function mount() {
    var root = document.getElementById("decisionMakingOverlay");
    if (!root) return;

    root.hidden = false;
    root.setAttribute("aria-hidden", "false");

    var titleEl = root.querySelector(".decision-making__title");
    var qEl = root.querySelector(".decision-making__question");
    var mapImg = root.querySelector(".decision-making__map-img");
    var compassEl = root.querySelector(".decision-making__compass");
    var modal = root.querySelector(".decision-making__modal");
    var modalTitle = root.querySelector(".decision-making__modal-title");
    var modalBody = root.querySelector(".decision-making__modal-body");
    var modalBtn = root.querySelector(".decision-making__modal-btn");
    var modalClose = root.querySelector(".decision-making__modal-close");

    var stepIndex = 0;

    function getStep() {
      return STEPS[stepIndex];
    }

    function updateStepContent() {
      var step = getStep();
      if (qEl) qEl.textContent = step.question;
      if (mapImg) {
        mapImg.src = ASSETS_BASE + step.mapFile;
        mapImg.alt = "Flood simulation map for scenario " + step.scenarioId;
      }
    }

    function closeModal() {
      if (modal) modal.hidden = true;
    }

    function openModal(isCorrect, wrongVariant) {
      if (!modal || !modalTitle || !modalBody || !modalBtn) return;
      var step = getStep();
      modal.hidden = false;
      if (isCorrect) {
        modalTitle.textContent = step.correct.title;
        modalBody.textContent = step.correct.body;
        modalBtn.textContent = step.correct.nextLabel;
        modalBtn.dataset.action = "next";
        modalBtn.classList.remove("decision-making__modal-btn--inline");
      } else {
        var w = step.wrong;
        if (step.type === "routes" && wrongVariant === "incomplete" && step.wrongIncomplete) {
          w = step.wrongIncomplete;
        }
        modalTitle.textContent = w.title;
        if (w.bodyHtml) {
          modalBody.innerHTML = w.bodyHtml;
        } else {
          modalBody.textContent = w.body || "";
        }
        modalBtn.textContent = w.tryAgainLabel || "Try Again →";
        modalBtn.dataset.action = "tryAgain";
        modalBtn.classList.add("decision-making__modal-btn--inline");
      }
    }

    function buildStepContent() {
      if (!compassEl) return;
      var step = getStep();
      compassEl.innerHTML = "";
      if (step.type === "routes") {
        buildRoutes();
        return;
      }
      buildCompass();
    }

    function buildRoutes() {
      var step = getStep();
      var correctIds = (step.correctAnswers || []).slice().sort();
      var wrap = document.createElement("div");
      wrap.className = "decision-making__routes";

      var hint = document.createElement("p");
      hint.className = "decision-making__route-hint";
      hint.textContent = step.routeHint || "Select all correct routes, then tap Submit.";
      wrap.appendChild(hint);

      var inputs = [];
      (step.options || []).forEach(function (opt) {
        var lbl = document.createElement("label");
        lbl.className = "decision-making__route-label";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.className = "decision-making__route-check";
        input.value = opt.id;
        input.setAttribute("aria-label", opt.label);
        var span = document.createElement("span");
        span.className = "decision-making__route-label-text";
        span.textContent = opt.label;
        lbl.appendChild(input);
        lbl.appendChild(span);
        inputs.push(input);
        wrap.appendChild(lbl);
      });

      var submit = document.createElement("button");
      submit.type = "button";
      submit.className = "decision-making__route-submit";
      submit.textContent = "Submit";
      submit.setAttribute("aria-label", "Submit route choices");
      submit.addEventListener("click", function () {
        var selected = inputs
          .filter(function (inp) {
            return inp.checked;
          })
          .map(function (inp) {
            return inp.value;
          })
          .sort();
        var isCorrect =
          selected.length === correctIds.length &&
          correctIds.every(function (id, i) {
            return selected[i] === id;
          });
        var wrongVariant = "default";
        if (!isCorrect) {
          var onlyCorrectChoices =
            selected.length === 0 ||
            selected.every(function (id) {
              return correctIds.indexOf(id) !== -1;
            });
          if (onlyCorrectChoices && selected.length < correctIds.length) {
            wrongVariant = "incomplete";
          }
        }
        var detail = {
          mission: "decision-making",
          missionId: "decision-making",
          questionId: step.questionId,
          scenarioId: step.scenarioId,
          stepIndex: stepIndex,
          selectedOptions: selected,
          correctAnswers: correctIds.slice(),
          isCorrect: isCorrect,
          wrongVariant: isCorrect ? null : wrongVariant,
          at: new Date().toISOString(),
        };
        emitSelection(detail);
        openModal(isCorrect, wrongVariant);
      });
      wrap.appendChild(submit);

      compassEl.appendChild(wrap);
    }

    function clearRouteCheckboxes() {
      if (!compassEl) return;
      compassEl.querySelectorAll(".decision-making__route-check").forEach(function (inp) {
        inp.checked = false;
      });
    }

    function buildCompass() {
      var step = getStep();
      var correctDir = step.correctDirection;
      var dial = document.createElement("div");
      dial.className = "decision-making__dial";
      COMPASS_DIRECTIONS.forEach(function (dirId) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "decision-making__dir-btn";
        btn.dataset.direction = dirId;
        btn.textContent = DIRECTION_LABELS[dirId] || dirId;
        var pos = positionOnCircle(DIRECTION_ANGLE[dirId] != null ? DIRECTION_ANGLE[dirId] : 0, 38);
        btn.style.setProperty("--x", pos.x + "%");
        btn.style.setProperty("--y", pos.y + "%");
        btn.setAttribute("aria-label", "Select " + dirId.replace("-", " "));
        btn.addEventListener("click", function () {
          var isCorrect = dirId === correctDir;
          var detail = {
            mission: "decision-making",
            missionId: "decision-making",
            questionId: step.questionId,
            scenarioId: step.scenarioId,
            stepIndex: stepIndex,
            selectedDirection: dirId,
            correctDirection: correctDir,
            isCorrect: isCorrect,
            at: new Date().toISOString(),
          };
          emitSelection(detail);
          openModal(isCorrect);
        });
        dial.appendChild(btn);
      });
      var needle = document.createElement("div");
      needle.className = "decision-making__needle";
      needle.setAttribute("aria-hidden", "true");
      dial.insertBefore(needle, dial.firstChild);
      compassEl.appendChild(dial);
    }

    function advanceOrFinish() {
      if (stepIndex < STEPS.length - 1) {
        stepIndex += 1;
        updateStepContent();
        buildStepContent();
        closeModal();
      } else {
        window.location.href = "index.html";
      }
    }

    if (titleEl) {
      titleEl.textContent = "Flood Awareness & Safe Decision-Making";
    }
    updateStepContent();
    buildStepContent();

    if (modalBtn) {
      modalBtn.addEventListener("click", function () {
        if (modalBtn.dataset.action === "next") {
          advanceOrFinish();
        } else {
          if (getStep().type === "routes") {
            clearRouteCheckboxes();
          }
          closeModal();
        }
      });
    }
    if (modalClose) {
      modalClose.addEventListener("click", closeModal);
    }
  }

  function run() {
    if (!shouldMount()) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      mount();
    }
  }

  run();
})();
