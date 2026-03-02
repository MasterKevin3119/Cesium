(function () {
  // simple wrapper for chart rendering/updating
  let rainfallChart = null;
  let tempChart = null;

  function createCharts() {
    const rainCtx = document.getElementById('rainfallChart');
    const tempCtx = document.getElementById('temperatureChart');
    if (rainCtx) {
      rainfallChart = new Chart(rainCtx.getContext('2d'), {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Rainfall (mm)',
            data: [],
            borderColor: '#7dd3fc',
            backgroundColor: 'rgba(125,211,252,0.3)',
            fill: true,
            tension: 0.3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { display: true, title: { display: true, text: 'Time' } },
            y: { display: true, title: { display: true, text: 'Rainfall (mm)' } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
    if (tempCtx) {
      tempChart = new Chart(tempCtx.getContext('2d'), {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Temperature (°C)',
            data: [],
            borderColor: '#fca5a5',
            backgroundColor: 'rgba(252,165,165,0.3)',
            fill: true,
            tension: 0.3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { display: true, title: { display: true, text: 'Time' } },
            y: { display: true, title: { display: true, text: 'Temperature (°C)' } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }

  function updateData(data) {
    if (!data || !data.time || !Array.isArray(data.time)) return;
    const labels = data.time.map(function (t) {
      if (typeof window.formatHourlyTime === 'function') return window.formatHourlyTime(t);
      return t;
    });
    const rainArray = Array.isArray(data.precipitation) ? data.precipitation : [];
    const tempArray = Array.isArray(data.temperature) ? data.temperature : [];

    if (rainfallChart) {
      rainfallChart.data.labels = labels;
      rainfallChart.data.datasets[0].data = labels.map(function (_, idx) {
        const v = rainArray[idx];
        return (v == null || isNaN(v)) ? 0 : v;
      });
      rainfallChart.update();
    }
    if (tempChart) {
      tempChart.data.labels = labels;
      tempChart.data.datasets[0].data = labels.map(function (_, idx) {
        const v = tempArray[idx];
        return (v == null || isNaN(v)) ? 0 : v;
      });
      tempChart.update();
    }
  }

  function showModal() {
    const modal = document.getElementById('weatherGraphsModal');
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
    // if there is cached data expose it again so charts are populated
    if (window.lastHourlyData && typeof updateData === 'function') {
      updateData(window.lastHourlyData);
    }
  }
  function hideModal() {
    const modal = document.getElementById('weatherGraphsModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }
  function hideModal() {
    const modal = document.getElementById('weatherGraphsModal');
    if (modal) modal.classList.remove('open');
  }

  function init() {
    createCharts();
    const closeBtn = document.getElementById('weatherGraphsCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', hideModal);
    // allow clicking outside content to close
    const modal = document.getElementById('weatherGraphsModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) hideModal();
      });
    }
  }

  window.weatherGraphs = {
    init: init,
    updateData: updateData,
    showModal: showModal,
    hideModal: hideModal,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
