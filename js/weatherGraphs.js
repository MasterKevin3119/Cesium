(function () {
  // simple wrapper for chart rendering/updating
  let rainfallChart = null;
  let tempChart = null;
  let cachedData = null;
  let aggMode = 'hour'; // 'hour' or 'day'

  function createCharts() {
    // cleanup previous charts if any
    if (rainfallChart) {
      try { rainfallChart.destroy(); } catch (e) {}
      rainfallChart = null;
    }
    if (tempChart) {
      try { tempChart.destroy(); } catch (e) {}
      tempChart = null;
    }
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

  // when new data arrives store and render
  function updateData(data) {
    if (!data || !data.time || !Array.isArray(data.time)) return;
    cachedData = data;
    renderCharts();
  }

  // helper to build arrays from full dataset (hourly view)
  function buildStats(data) {
    if (!data || !data.time || !Array.isArray(data.time)) return {labels:[], rain:[], temp:[]};
    const labels = data.time.map(function (t) {
      if (typeof window.formatHourlyTime === 'function') return window.formatHourlyTime(t);
      return t;
    });
    const rainArr = Array.isArray(data.precipitation) ? data.precipitation : [];
    const tempArr = Array.isArray(data.temperature) ? data.temperature : [];
    const rainVals = labels.map(function (_, idx) {
      const v = rainArr[idx];
      return (v == null || isNaN(v)) ? 0 : v;
    });
    const tempVals = labels.map(function (_, idx) {
      const v = tempArr[idx];
      return (v == null || isNaN(v)) ? 0 : v;
    });
    return {labels: labels, rain: rainVals, temp: tempVals};
  }

  // helper to aggregate dataset by day
  function buildDailyStats(data) {
    if (!data || !data.time || !Array.isArray(data.time)) return {labels:[], rain:[], temp:[]};
    const rainArr = Array.isArray(data.precipitation) ? data.precipitation : [];
    const tempArr = Array.isArray(data.temperature) ? data.temperature : [];
    const buckets = {}; // dateStr -> {rainTotal, tempSum, count}
    data.time.forEach(function (iso, idx) {
      const d = new Date(iso);
      if (isNaN(d)) return;
      const key = d.getFullYear() + '-' + (d.getMonth()+1).toString().padStart(2,'0') + '-' + d.getDate().toString().padStart(2,'0');
      if (!buckets[key]) buckets[key] = {rainTotal:0, tempSum:0, count:0};
      const rain = Number(rainArr[idx]) || 0;
      const temp = Number(tempArr[idx]);
      buckets[key].rainTotal += rain;
      if (!isNaN(temp)) {
        buckets[key].tempSum += temp;
        buckets[key].count++;
      }
    });
    const labels = [];
    const rainVals = [];
    const tempVals = [];
    Object.keys(buckets).sort().forEach(function (key) {
      labels.push(key);
      rainVals.push(buckets[key].rainTotal);
      const avg = buckets[key].count ? (buckets[key].tempSum / buckets[key].count) : 0;
      tempVals.push(avg);
    });
    return { labels: labels, rain: rainVals, temp: tempVals };
  }

  function renderCharts() {
    if (!cachedData) return;
    const stats = aggMode === 'hour' ? buildStats(cachedData) : buildDailyStats(cachedData);
    if (rainfallChart) {
      rainfallChart.data.labels = stats.labels;
      rainfallChart.data.datasets[0].data = stats.rain;
      rainfallChart.update();
    }
    if (tempChart) {
      tempChart.data.labels = stats.labels;
      tempChart.data.datasets[0].data = stats.temp;
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
    if (cachedData) {
      renderCharts();
    } else if (window.lastHourlyData && typeof updateData === 'function') {
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

  function init() {
    createCharts();
    // toggle control listeners
    const radios = document.querySelectorAll('input[name="aggMode"]');
    radios.forEach(function (r) {
      r.addEventListener('change', function () {
        if (r.checked) {
          aggMode = r.value;
          renderCharts();
        }
      });
    });

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
