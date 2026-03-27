/**
 * Identify Flooded Areas (?mission=flooded-areas)
 * Step 1 — 0.5 m: correct A.png (options A, B, C).
 * Step 2 — 1.0 m: correct F.png (E = 0.8 m, F = 1.0 m, D = 1.5 m).
 * Option order is shuffled each time; logic is keyed by filename.
 *
 * Emits CustomEvent "identifyFlood:selection", window.__IDENTIFY_FLOOD_LAST_SELECTION__,
 * postMessage { type: "identifyFlood:selection", payload } from iframe.
 */
(function () {
  "use strict";

  var ASSETS_BASE = "assets/identify-flood/";

  var STEPS = [
    {
      questionId: "map-flood-0.5m",
      targetDepthM: 0.5,
      question:
        "Based on the images shown, which scenario represents an area flooded with a water depth of 0.5 m?",
      options: [
        { id: "A", file: "A.png" },
        { id: "B", file: "B.png" },
        { id: "C", file: "C.png" },
      ],
      correctFile: "A.png",
      correct: {
        title: "Good Job",
        body:
          "At 0.5 m, floodwater spreads beyond the lowest points and begins to affect nearby roads and buildings but does not yet cover the entire area.",
        nextLabel: "Next",
      },
      wrongDefault: {
        title: "Not quite",
        body:
          "Compare the extent of flooding on the maps. At 0.5 m, water reaches past river banks and starts to affect roads and buildings without covering the whole scene.",
        tryAgainLabel: "Try Again",
      },
      wrongByFile: {
        "B.png": {
          title: "Too Shallow",
          body:
            "This scenario shows the flood level of 0.3 m, which is usually confined to depressions and the lowest parts of the area, with limited spread.",
        },
        "C.png": {
          title: "Too Extensive",
          body:
            "This scenario is approximately 0.7 m, where floodwater spreads more widely and covers larger portions of roads and properties.",
        },
      },
    },
    {
      questionId: "map-flood-1m",
      targetDepthM: 1,
      question:
        "Based on the image shown, which area is most likely to be flooded at a water depth of 1 m?",
      /* Left 0.8 m (E) → centre 1.0 m (F) → right 1.5 m (D) */
      options: [
        { id: "E", file: "E.png" },
        { id: "F", file: "F.png" },
        { id: "D", file: "D.png" },
      ],
      correctFile: "F.png",
      correct: {
        title: "Good Job",
        body:
          "At 1.0 m, floodwater spreads across most roads and nearby areas, creating serious movement restrictions, but some higher ground may still remain visible.",
        nextLabel: "Next",
      },
      wrongDefault: {
        title: "Not quite",
        body:
          "Compare how far floodwater spreads on each map. At 1.0 m, flooding covers most roads and nearby low areas but is not as extreme as the deepest scenario.",
        tryAgainLabel: "Try Again",
      },
      wrongByFile: {
        "E.png": {
          title: "Not Quite",
          body:
            "While 0.8 m flooding affects many roads, it does not spread as extensively as a 1.0 m flood, which reaches deeper into surrounding areas.",
        },
        "D.png": {
          title: "Too Severe",
          body:
            "At 1.5 m, floodwater submerges almost all land areas, indicating a more extreme flood than the 1.0 m scenario shown.",
        },
      },
    },
  ];

  function shuffleOptionsOrder(options) {
    var a = options.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function assetUrl(file) {
    return ASSETS_BASE + file;
  }

  function emitSelection(detail) {
    window.__IDENTIFY_FLOOD_LAST_SELECTION__ = detail;
    try {
      document.dispatchEvent(new CustomEvent("identifyFlood:selection", { detail: detail }));
    } catch (e) {
      /* ignore */
    }
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: "identifyFlood:selection", payload: detail },
          "*"
        );
      } catch (e2) {
        /* ignore */
      }
    }
    if (typeof console !== "undefined" && console.info) {
      console.info("[identify-flood] selection", detail);
    }
  }

  function shouldMount() {
    try {
      var p = new URLSearchParams(window.location.search);
      return p.get("mission") === "flooded-areas";
    } catch (e) {
      return false;
    }
  }

  function mount() {
    var root = document.getElementById("identifyFloodOverlay");
    if (!root) return;

    root.hidden = false;
    root.setAttribute("aria-hidden", "false");

    var titleEl = root.querySelector(".identify-flood__title");
    var qEl = root.querySelector(".identify-flood__question");
    var grid = root.querySelector(".identify-flood__grid");
    var modal = root.querySelector(".identify-flood__modal");
    var modalTitle = root.querySelector(".identify-flood__modal-title");
    var modalBody = root.querySelector(".identify-flood__modal-body");
    var modalBtn = root.querySelector(".identify-flood__modal-btn");
    var modalClose = root.querySelector(".identify-flood__modal-close");

    var stepIndex = 0;

    if (titleEl) titleEl.textContent = "Identify Flooded Areas";

    function getStep() {
      return STEPS[stepIndex];
    }

    function updateQuestionText() {
      if (qEl) qEl.textContent = getStep().question;
    }

    function closeModal() {
      if (modal) modal.hidden = true;
    }

    function openModal(isCorrect, selectedFile) {
      if (!modal || !modalTitle || !modalBody || !modalBtn) return;
      var step = getStep();
      modal.hidden = false;
      if (isCorrect) {
        modalTitle.textContent = step.correct.title;
        modalBody.textContent = step.correct.body;
        modalBtn.textContent = step.correct.nextLabel;
        modalBtn.dataset.action = "next";
      } else {
        var wf = step.wrongByFile[selectedFile] || step.wrongDefault;
        modalTitle.textContent = wf.title || step.wrongDefault.title;
        modalBody.textContent = wf.body || step.wrongDefault.body;
        modalBtn.textContent =
          (wf.tryAgainLabel != null ? wf.tryAgainLabel : null) ||
          step.wrongDefault.tryAgainLabel;
        modalBtn.dataset.action = "tryAgain";
      }
    }

    function buildGrid() {
      if (!grid) return;
      var step = getStep();
      var correctFile = step.correctFile;
      var options = shuffleOptionsOrder(step.options);
      grid.innerHTML = "";
      options.forEach(function (opt, gridIndex) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "identify-flood__choice";
        btn.setAttribute("aria-label", "Option " + opt.id);
        var img = document.createElement("img");
        img.src = assetUrl(opt.file);
        img.alt = "Flood depth map option " + opt.id;
        img.loading = "eager";
        btn.appendChild(img);
        btn.addEventListener("click", function () {
          var isCorrect = opt.file === correctFile;
          var detail = {
            mission: "flooded-areas",
            missionId: "flooded-areas",
            questionId: step.questionId,
            stepIndex: stepIndex,
            targetDepthM: step.targetDepthM,
            selectedFile: opt.file,
            selectedId: opt.id,
            correctFile: correctFile,
            isCorrect: isCorrect,
            gridIndex: gridIndex,
            optionOrder: options.map(function (o) {
              return o.file;
            }),
            at: new Date().toISOString(),
          };
          emitSelection(detail);
          openModal(isCorrect, opt.file);
        });
        grid.appendChild(btn);
      });
    }

    function advanceOrFinish() {
      if (stepIndex < STEPS.length - 1) {
        stepIndex += 1;
        updateQuestionText();
        buildGrid();
        closeModal();
      } else {
        window.location.href = "mission-end.html?completed=flooded-areas";
      }
    }

    updateQuestionText();
    buildGrid();

    if (modalBtn) {
      modalBtn.addEventListener("click", function () {
        if (modalBtn.dataset.action === "next") {
          advanceOrFinish();
        } else {
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
