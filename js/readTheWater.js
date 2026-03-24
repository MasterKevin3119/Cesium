/**
 * Read The Water mini-game (?mission=read-water)
 * Two steps: 0.5 m (correct: ans.png), then 1.0 m (correct: B.png).
 * Tile order is randomized each time; correctness and feedback are keyed by image file.
 *
 * Each selection emits:
 *   document — CustomEvent "readTheWater:selection" with detail
 *   window.__READ_THE_WATER_LAST_SELECTION__ — same payload
 *   parent — postMessage { type: "readTheWater:selection", payload: detail } in iframe
 */
(function () {
  "use strict";

  var ASSETS_BASE = "assets/read-the-water/";

  /** Four tiles; order is shuffled on each question (correct/wrong still keyed by file). */
  var READ_THE_WATER_TILES = [
    { id: "A", file: "A.png" },
    { id: "B", file: "B.png" },
    { id: "D", file: "D.png" },
    { id: "ans", file: "ans.png" },
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

  var STEPS = [
    {
      questionId: "depth-0.5m",
      targetDepthM: 0.5,
      question:
        "Based on the image shown, which option best represents 0.5 m of water depth?",
      correctFile: "ans.png",
      correct: {
        title: "Correct",
        body:
          "A water depth of 0.5 m typically reaches around knee level. At this depth, movement becomes unstable and walking through floodwater can already be dangerous.",
        nextLabel: "Next",
      },
      wrongDefault: {
        title: "Not quite",
        body:
          "0.5 m flood depth is usually around knee level—enough to affect movement. Compare the options and pick the scene that matches that depth.",
        tryAgainLabel: "Try Again",
      },
      wrongByFile: {
        "A.png": {
          title: "Far Too Deep",
          body:
            "Chest-deep water indicates severe flooding well beyond 0.5 m and would pose extreme danger to people in the area.",
        },
        "B.png": {
          title: "Too Deep",
          body:
            "Waist-deep water usually represents a depth closer to 1.0 m, and would affect movement significantly.",
        },
        "D.png": {
          title: "Not Quite",
          body:
            "Ankle-deep water is much shallower than 0.5 m. At 0.5 m, the water level is high enough to reach the knees and significantly affect movement.",
        },
      },
      options: READ_THE_WATER_TILES,
    },
    {
      questionId: "depth-1m",
      targetDepthM: 1,
      question:
        "Based on the image shown, which option best represents 1 m of water depth?",
      correctFile: "B.png",
      correct: {
        title: "Correct",
        body:
          "A water depth of 1.0 m typically reaches waist level. At this depth, walking becomes extremely dangerous, and evacuation on foot is strongly discouraged.",
        nextLabel: "Next",
      },
      wrongDefault: {
        title: "Not quite",
        body:
          "1.0 m flood depth is usually around waist level. Compare the options and pick the scene that matches that depth.",
        tryAgainLabel: "Try Again",
      },
      wrongByFile: {
        "A.png": {
          title: "Too Deep",
          body:
            "Chest-deep water indicates severe flooding beyond 1.0 m. The scene shown exceeds a depth of about 1 m.",
        },
        "ans.png": {
          title: "Too Shallow",
          body: "Knee-deep water is closer to 0.5 m.",
        },
        "D.png": {
          title: "Not Quite",
          body:
            "Ankle-deep water represents very shallow flooding. A depth of 1.0 m is much higher and poses a serious risk to safety.",
        },
      },
      options: READ_THE_WATER_TILES,
    },
  ];

  var CONFIG = {
    assetsBase: ASSETS_BASE,
    options: READ_THE_WATER_TILES,
    title: "Read The Water",
    steps: STEPS,
  };

  function assetUrl(file) {
    return CONFIG.assetsBase + file;
  }

  function emitSelection(detail) {
    window.__READ_THE_WATER_LAST_SELECTION__ = detail;
    try {
      document.dispatchEvent(new CustomEvent("readTheWater:selection", { detail: detail }));
    } catch (e) {
      /* ignore */
    }
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: "readTheWater:selection", payload: detail },
          "*"
        );
      } catch (e2) {
        /* ignore */
      }
    }
    if (typeof console !== "undefined" && console.info) {
      console.info("[read-the-water] selection", detail);
    }
  }

  function shouldMount() {
    try {
      var p = new URLSearchParams(window.location.search);
      return p.get("mission") === "read-water";
    } catch (e) {
      return false;
    }
  }

  function mount() {
    var root = document.getElementById("readTheWaterOverlay");
    if (!root) return;

    root.hidden = false;
    root.setAttribute("aria-hidden", "false");

    var titleEl = root.querySelector(".read-the-water__title");
    var qEl = root.querySelector(".read-the-water__question");
    var grid = root.querySelector(".read-the-water__grid");
    var modal = root.querySelector(".read-the-water__modal");
    var modalTitle = root.querySelector(".read-the-water__modal-title");
    var modalBody = root.querySelector(".read-the-water__modal-body");
    var modalBtn = root.querySelector(".read-the-water__modal-btn");
    var modalClose = root.querySelector(".read-the-water__modal-close");

    var stepIndex = 0;

    if (titleEl) titleEl.textContent = CONFIG.title;

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
      var options = shuffleOptionsOrder(step.options || READ_THE_WATER_TILES);
      grid.innerHTML = "";
      options.forEach(function (opt, gridIndex) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "read-the-water__choice";
        btn.setAttribute("aria-label", "Option " + opt.id);
        var img = document.createElement("img");
        img.src = assetUrl(opt.file);
        img.alt = "Flood depth option " + opt.id;
        img.loading = "eager";
        btn.appendChild(img);
        btn.addEventListener("click", function () {
          var isCorrect = opt.file === correctFile;
          var detail = {
            mission: "read-water",
            missionId: "read-water",
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
        window.location.href = "index.html";
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
