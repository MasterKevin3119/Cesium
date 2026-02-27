/**
 * Cesium viewer app: URL params, cesiumFlyTo API, postMessage, Google Places.
 */
(function () {
  "use strict";

  const { DEFAULTS, BOUNDS } = typeof CONFIG !== "undefined" ? CONFIG : {
    DEFAULTS: { flyToHeight: 1000, flyToDuration: 1.2, placesFlyToHeight: 1500 },
    BOUNDS: { lat: { min: -90, max: 90 }, lon: { min: -180, max: 180 }, height: { min: 100, max: 10000000 } },
  };

  const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

  let viewer = null;
  let markerEntity = null;
  let rainParticleSystem = null;
  /** Cesium ImageryLayer for precipitation/radar overlay (RainViewer) */
  let precipitationLayer = null;
  /** Last fetched hourly data for time slider: { lat, lon, time[], precipitation[] } */
  let lastHourlyData = null;

  /** (K) for flood visual based on rain intensity */
  const floodBounds = {
    west: 101.65,
    south: 3.10,
    east: 101.66,
    north: 3.11
  };

  function simulateFlood(value) {
    const level = evaluateFloodRisk(value);
    updateFloodVisualization(level);
  }
  let floodEntity = null;

  function evaluateFloodRisk(rainIntensity) {
    if (rainIntensity < 20) {
        return "none";
    } else if (rainIntensity < 50) {
        return "moderate";
    } else {
        return "severe";
    }
  }

  function updateFloodVisualization(level) {

    if (level === "none") {
        if (floodEntity) {
            viewer.entities.remove(floodEntity);
            floodEntity = null;
        }
        return;
    }

    let height = 0;

    if (level === "moderate") {
        height = 5;
    } else if (level === "severe") {
        height = 15;
    }

    if (!floodEntity) {
        floodEntity = viewer.entities.add({
            rectangle: {
                coordinates: Cesium.Rectangle.fromDegrees(
                    floodBounds.west,
                    floodBounds.south,
                    floodBounds.east,
                    floodBounds.north
                ),
                material: Cesium.Color.BLUE.withAlpha(0.5),
                height: height
            }
        });
    } else {
        floodEntity.rectangle.height = height;
    }
}

const rainIntensity = data.hourly.rain[0];  // example
const floodLevel = evaluateFloodRisk(rainIntensity);
updateFloodVisualization(floodLevel);

/**Ends here */

  function makeRainParticleImage() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 6;
      canvas.height = 36;
      const ctx = canvas.getContext("2d");
      if (!ctx) return getRainFallbackImage();
      const g = ctx.createLinearGradient(0, 0, 0, 36);
      g.addColorStop(0, "rgba(220,235,255,0.95)");
      g.addColorStop(0.5, "rgba(200,220,255,0.85)");
      g.addColorStop(1, "rgba(180,210,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 6, 36);
      return canvas.toDataURL("image/png");
    } catch (e) {
      return getRainFallbackImage();
    }
  }
  function getRainFallbackImage() {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  }
  const RAIN_IMAGE = makeRainParticleImage();

  function clamp(value, min, max) {
    const n = Number(value);
    if (isNaN(n)) return undefined;
    return Math.max(min, Math.min(max, n));
  }

  function parseCoord(value, bounds) {
    const n = Number(value);
    if (value == null || value === "" || isNaN(n)) return undefined;
    return clamp(n, bounds.min, bounds.max);
  }

  /**
   * Fly camera to lon/lat (radians or degrees), optional height. Optionally show a marker.
   * @param {number} longitude
   * @param {number} latitude
   * @param {number} [heightMeters]
   * @param {boolean} [addMarker=true]
   * @returns {boolean} true if fly was performed
   */
  function flyToCoordinates(longitude, latitude, heightMeters, addMarker) {
    const lon = parseCoord(longitude, BOUNDS.lon);
    const lat = parseCoord(latitude, BOUNDS.lat);
    if (lon === undefined || lat === undefined) return false;

    const height = heightMeters != null
      ? (clamp(Number(heightMeters), BOUNDS.height.min, BOUNDS.height.max) ?? DEFAULTS.flyToHeight)
      : DEFAULTS.flyToHeight;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      duration: DEFAULTS.flyToDuration,
    });

    if (addMarker !== false) {
      if (markerEntity) viewer.entities.remove(markerEntity);
      markerEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        point: { pixelSize: 12, color: Cesium.Color.CORNFLOWERBLUE },
      });
    }
    return true;
  }

  /**
   * Public API: cesiumFlyTo(latitude, longitude [, heightMeters [, addMarker]]).
   * Called from same window or from parent/iframe via postMessage.
   */
  function cesiumFlyTo(lat, lon, heightMeters, addMarker) {
    return flyToCoordinates(lon, lat, heightMeters, addMarker);
  }

  function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get("lat");
    const lon = params.get("lon");
    const height = params.get("height");
    if (lat != null && lon != null) {
      flyToCoordinates(parseFloat(lon), parseFloat(lat), height != null ? parseFloat(height) : undefined, true);
    }
  }

  const WEATHER_API = "https://api.open-meteo.com/v1/forecast";

  const gravityScratch = new Cesium.Cartesian3();
  function rainUpdateCallback(p, dt) {
    Cesium.Cartesian3.normalize(p.position, gravityScratch);
    Cesium.Cartesian3.multiplyByScalar(gravityScratch, -8000 * dt, gravityScratch);
    p.velocity = Cesium.Cartesian3.add(p.velocity, gravityScratch, p.velocity);
  }

  /**
   * Update or remove rain particle effect based on current precipitation (mm).
   * No rain when precipitation is 0; intensity scales with mm (light -> minimal, heavy -> lots).
   */
  function updateRainEffect(longitude, latitude, precipitationMm) {
    if (rainParticleSystem) {
      viewer.scene.primitives.remove(rainParticleSystem);
      rainParticleSystem = null;
    }
    const precip = Number(precipitationMm);
    if (!viewer || isNaN(precip) || precip <= 0) return;

    const heightM = 1500;
    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, heightM);
    const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const pitchDown = Cesium.Matrix4.fromRotation(
      Cesium.Matrix3.fromHeadingPitchRoll(new Cesium.HeadingPitchRoll(0, Cesium.Math.PI, 0))
    );

    const emissionRate = Math.min(1200, Math.max(200, 200 + precip * 150));
    const speed = 22 + Math.min(28, precip * 5);
    const emitterRadiusM = 4000;

    try {
      rainParticleSystem = viewer.scene.primitives.add(
        new Cesium.ParticleSystem({
          image: RAIN_IMAGE,
          minimumImageSize: new Cesium.Cartesian2(12, 56),
          maximumImageSize: new Cesium.Cartesian2(20, 80),
          startColor: new Cesium.Color(0.75, 0.88, 1.0, 0.92),
          endColor: new Cesium.Color(0.7, 0.85, 1.0, 0.3),
          startScale: 1.3,
          endScale: 0.5,
          particleLife: 3.2,
          minimumSpeed: speed,
          maximumSpeed: speed * 1.25,
          minimumParticleLife: 2.0,
          maximumParticleLife: 3.5,
          emissionRate: emissionRate,
          emitter: new Cesium.CircleEmitter(emitterRadiusM),
          modelMatrix: modelMatrix,
          emitterModelMatrix: pitchDown,
          lifetime: 999999,
          updateCallback: rainUpdateCallback,
        })
      );
      viewer.scene.requestRender();
    } catch (e) {
      console.error("Rain effect failed:", e);
    }
  }

  function weatherCodeToText(code) {
    const codes = {
      0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Foggy", 48: "Depositing rime fog",
      51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
      61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
      66: "Light freezing rain", 67: "Heavy freezing rain",
      71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
      77: "Snow grains", 80: "Slight rain showers", 81: "Rain showers", 82: "Heavy rain showers",
      85: "Slight snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Thunderstorm + heavy hail",
    };
    return codes[code] || "Unknown";
  }

  /**
   * Effective rain intensity (mm) for the rain animation from condition + precipitation.
   * Rainy conditions (drizzle, rain, showers, thunderstorm, snow) get at least a minimum intensity.
   */
  function getRainIntensityFromCondition(weatherCode, precipitationMm) {
    const code = Number(weatherCode);
    const precip = Number(precipitationMm);
    const p = !isNaN(precip) && precip >= 0 ? precip : 0;
    const minByCondition = {
      51: 0.3, 53: 0.5, 55: 0.8,
      61: 0.5, 63: 1.5, 65: 4,
      66: 0.8, 67: 2,
      80: 0.8, 81: 2, 82: 5,
      95: 4, 96: 6, 99: 8,
      71: 0.4, 73: 0.8, 75: 1.5, 77: 0.3, 85: 0.4, 86: 1,
    };
    const minP = minByCondition[code];
    if (minP == null) return p;
    return Math.max(p, minP);
  }

  function isRainyCondition(weatherCode) {
    const code = Number(weatherCode);
    if (isNaN(code)) return false;
    return getRainIntensityFromCondition(code, 0) > 0;
  }

  function showWeatherLoading() {
    const el = document.getElementById("weatherResult");
    if (!el) return;
    el.innerHTML = '<span class="loading">Loading weather…</span>';
    el.classList.remove("weather-error");
  }

  function showWeatherError(msg) {
    const el = document.getElementById("weatherResult");
    if (!el) return;
    el.innerHTML = '<span class="error">' + escapeHtml(msg) + "</span>";
    el.classList.add("weather-error");
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function formatHourlyTime(isoString) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
    const day = isToday ? "Today" : (isTomorrow ? "Tomorrow" : (d.getMonth() + 1) + "/" + d.getDate());
    const h = d.getHours();
    const hour = (h < 10 ? "0" : "") + h + ":00";
    return day + " " + hour;
  }

  function showWeatherData(lat, lon, data) {
    const el = document.getElementById("weatherResult");
    if (!el) return;
    const c = data.current;
    const h = data.hourly;
    if (!c && !h) {
      showWeatherError("No weather data in response.");
      return;
    }

    let html = "";

    if (c) {
      const temp = c.temperature_2m != null ? c.temperature_2m + " °C" : "—";
      const rain = c.precipitation != null ? c.precipitation + " mm" : (c.rain != null ? c.rain + " mm" : "—");
      const humidity = c.relative_humidity_2m != null ? c.relative_humidity_2m + "%" : "—";
      const cloud = c.cloud_cover != null ? c.cloud_cover + "%" : "—";
      const desc = weatherCodeToText(c.weather_code || 0);
      html += '<div class="weather-now">';
      html += '<div class="row"><span class="label">Now – Condition</span><span>' + escapeHtml(desc) + "</span></div>";
      html += '<div class="row"><span class="label">Temperature</span><span>' + escapeHtml(String(temp)) + "</span></div>";
      html += '<div class="row"><span class="label">Rain / precipitation</span><span class="rain">' + escapeHtml(String(rain)) + "</span></div>";
      html += '<div class="row"><span class="label">Humidity</span><span>' + escapeHtml(String(humidity)) + "</span></div>";
      html += '<div class="row"><span class="label">Cloud cover</span><span>' + escapeHtml(String(cloud)) + "</span></div>";
      html += "</div>";
    }

    if (h && h.time && h.time.length) {
      const precips = h.precipitation || h.rain || [];
      const codes = h.weather_code || [];
      lastHourlyData = { lat: lat, lon: lon, time: h.time, precipitation: precips, weatherCode: codes };
      const firstPrecip = precips[0] != null ? precips[0] : 0;
      const firstCode = codes[0] != null ? codes[0] : 0;
      showTimeSlider(h.time.length, h.time[0], getRainIntensityFromCondition(firstCode, firstPrecip));
      html += '<p class="hourly-title">Every hour (next 48h)</p>';
      html += '<div class="hourly-scroll"><table class="hourly-table"><thead><tr><th>Time</th><th>Rain</th><th>Temp</th><th>Condition</th><th>Humidity</th><th>Cloud</th></tr></thead><tbody>';
      const temps = h.temperature_2m || [];
      const humids = h.relative_humidity_2m || [];
      const clouds = h.cloud_cover || [];
      const hoursToShow = Math.min(48, h.time.length);
      for (let i = 0; i < hoursToShow; i++) {
        const time = formatHourlyTime(h.time[i]);
        const temp = temps[i] != null ? temps[i] + "°" : "—";
        const rain = (precips[i] != null && precips[i] > 0) ? precips[i] + " mm" : "0";
        const desc = weatherCodeToText(codes[i] || 0);
        const hum = humids[i] != null ? humids[i] + "%" : "—";
        const cl = clouds[i] != null ? clouds[i] + "%" : "—";
        const rainClass = precips[i] > 0 ? " rain" : "";
        html += "<tr><td>" + escapeHtml(time) + "</td><td class=\"rain-cell" + rainClass + "\">" + escapeHtml(String(rain)) + "</td><td>" + escapeHtml(String(temp)) + "</td><td>" + escapeHtml(desc) + "</td><td>" + escapeHtml(String(hum)) + "</td><td>" + escapeHtml(String(cl)) + "</td></tr>";
      }
      html += "</tbody></table></div>";
    }

    el.innerHTML = html;
    el.classList.remove("weather-error");

    let precipMm = 0;
    let weatherCode = null;
    if (c) {
      precipMm = c.precipitation != null ? c.precipitation : (c.rain != null ? c.rain : 0);
      weatherCode = c.weather_code != null ? c.weather_code : null;
    } else if (h && (h.precipitation || h.rain) && (h.precipitation || h.rain).length) {
      precipMm = (h.precipitation || h.rain)[0] || 0;
      weatherCode = (h.weather_code && h.weather_code[0]) != null ? h.weather_code[0] : null;
    }
    if (!h || !h.time || !h.time.length) {
      lastHourlyData = null;
      hideTimeSlider();
    }
    const effectivePrecip = getRainIntensityFromCondition(weatherCode, precipMm);
    updateRainEffect(lon, lat, effectivePrecip);
  }

  function showTimeSlider(hourCount, firstTimeIso, firstPrecip) {
    const wrap = document.getElementById("timeSliderWrap");
    const slider = document.getElementById("timeSlider");
    const label = document.getElementById("timeSliderLabel");
    if (!wrap || !slider || !label) return;
    const max = Math.max(0, Math.min(47, hourCount - 1));
    slider.min = 0;
    slider.max = max;
    slider.value = 0;
    label.textContent = formatHourlyTime(firstTimeIso);
    wrap.style.display = "block";
  }

  function hideTimeSlider() {
    const wrap = document.getElementById("timeSliderWrap");
    if (wrap) wrap.style.display = "none";
  }

  function onTimeSliderChange() {
    const slider = document.getElementById("timeSlider");
    const label = document.getElementById("timeSliderLabel");
    if (!lastHourlyData || !slider || !label) return;
    const index = parseInt(slider.value, 10);
    const times = lastHourlyData.time;
    const precips = lastHourlyData.precipitation || [];
    const codes = lastHourlyData.weatherCode || [];
    const precip = (precips[index] != null && precips[index] >= 0) ? precips[index] : 0;
    const code = (codes[index] != null) ? codes[index] : null;
    const effectivePrecip = getRainIntensityFromCondition(code, precip);
    label.textContent = index < times.length ? formatHourlyTime(times[index]) : "—";
    updateRainEffect(lastHourlyData.lon, lastHourlyData.lat, effectivePrecip);
  }

  function fetchWeatherForCoordinates(lat, lon) {
    const url = WEATHER_API +
      "?latitude=" + encodeURIComponent(lat) +
      "&longitude=" + encodeURIComponent(lon) +
      "&current=precipitation,rain,weather_code,temperature_2m,relative_humidity_2m,cloud_cover" +
      "&hourly=temperature_2m,precipitation,rain,weather_code,relative_humidity_2m,cloud_cover" +
      "&timezone=auto";
    showWeatherLoading();
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Weather request failed: " + res.status);
        return res.json();
      })
      .then(function (json) {
        showWeatherData(lat, lon, json);
      })
      .catch(function (err) {
        showWeatherError(err.message || "Could not load weather.");
      });
  }

  function initTimeSlider() {
    const slider = document.getElementById("timeSlider");
    if (!slider) return;
    slider.addEventListener("input", onTimeSliderChange);
    slider.addEventListener("change", onTimeSliderChange);
  }

  function initCoordsWeather() {
    const btn = document.getElementById("goWeatherBtn");
    const inputLat = document.getElementById("inputLat");
    const inputLon = document.getElementById("inputLon");
    if (!btn || !inputLat || !inputLon) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("lat") != null) inputLat.value = params.get("lat");
    if (params.get("lon") != null) inputLon.value = params.get("lon");

    btn.addEventListener("click", function () {
      const lat = parseCoord(inputLat.value.trim(), BOUNDS.lat);
      const lon = parseCoord(inputLon.value.trim(), BOUNDS.lon);
      if (lat === undefined || lon === undefined) {
        showWeatherError("Enter valid latitude (-90 to 90) and longitude (-180 to 180).");
        return;
      }
      showRainOverlay(false);
      flyToCoordinates(lon, lat, DEFAULTS.flyToHeight, true);
      btn.disabled = true;
      fetchWeatherForCoordinates(lat, lon);
      setTimeout(function () { btn.disabled = false; }, 2000);
    });

    const exampleRainBtn = document.getElementById("exampleRainBtn");
    if (exampleRainBtn) {
      exampleRainBtn.addEventListener("click", function () {
        let lat = parseCoord(inputLat.value.trim(), BOUNDS.lat);
        let lon = parseCoord(inputLon.value.trim(), BOUNDS.lon);
        if (lat === undefined || lon === undefined) {
          lat = typeof CONFIG !== "undefined" && CONFIG.defaultLat != null ? CONFIG.defaultLat : 3.3633483;
          lon = typeof CONFIG !== "undefined" && CONFIG.defaultLon != null ? CONFIG.defaultLon : 101.3449264;
          if (inputLat) inputLat.value = lat;
          if (inputLon) inputLon.value = lon;
        }
        flyToCoordinates(lon, lat, 2000, true);
        exampleRainBtn.disabled = true;
        exampleRainBtn.textContent = "Showing rain…";
        setTimeout(function () {
          updateRainEffect(lon, lat, 6);
          showRainOverlay(true);
          exampleRainBtn.disabled = false;
          exampleRainBtn.textContent = "Show example rain";
        }, 1500);
      });
    }
  }

  function showRainOverlay(visible) {
    const el = document.getElementById("rainOverlay");
    if (!el) return;
    if (visible) {
      el.classList.add("rain-overlay--visible");
    } else {
      el.classList.remove("rain-overlay--visible");
    }
  }

  function initRainOverlay() {
    const overlay = document.getElementById("rainOverlay");
    if (!overlay) return;
    overlay.addEventListener("click", function () {
      showRainOverlay(false);
    });
  }

  function initPlacesSearch() {
    const input = document.getElementById("placeSearch");
    if (!input) return;
    if (typeof google === "undefined" || !google.maps?.places) {
      input.placeholder = "Add Google API key for place search";
      return;
    }
    const autocomplete = new google.maps.places.Autocomplete(input, { types: ["establishment", "geocode"] });
    autocomplete.addListener("place_changed", function () {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) return;
      const lat = place.geometry.location.lat();
      const lon = place.geometry.location.lng();
      flyToCoordinates(lon, lat, DEFAULTS.placesFlyToHeight, true);
    });
  }

  function buildShareUrl() {
    const cam = viewer.camera;
    const carto = Cesium.Cartographic.fromCartesian(cam.positionCartographic);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const height = carto.height;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", lat.toFixed(6));
    url.searchParams.set("lon", lon.toFixed(6));
    url.searchParams.set("height", Math.round(height));
    return url.toString();
  }

  function setPrecipitationLayer(visible) {
    if (!viewer) return;
    if (visible) {
      if (precipitationLayer) return;
      fetch(RAINVIEWER_API)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          const host = data.host || "https://tilecache.rainviewer.com";
          const radar = data.radar;
          const frames = (radar && radar.past) ? radar.past : [];
          const frame = frames.length ? frames[frames.length - 1] : null;
          if (!frame || !frame.path) {
            console.warn("RainViewer: no radar frames");
            return;
          }
          const url = host + frame.path + "/256/{z}/{x}/{y}/0/0_0.png";
          try {
            const provider = new Cesium.UrlTemplateImageryProvider({
              url: url,
              maximumLevel: 7,
              credit: "RainViewer",
            });
            precipitationLayer = viewer.imageryLayers.addImageryProvider(provider);
            precipitationLayer.alpha = 0.75;
            const btn = document.getElementById("precipitationLayerBtn");
            if (btn) btn.textContent = "Hide precipitation map";
          } catch (e) {
            console.error("Precipitation layer failed:", e);
          }
        })
        .catch(function (e) {
          console.error("RainViewer fetch failed:", e);
        });
    } else {
      if (precipitationLayer) {
        viewer.imageryLayers.remove(precipitationLayer);
        precipitationLayer = null;
      }
      const btn = document.getElementById("precipitationLayerBtn");
      if (btn) btn.textContent = "Precipitation map";
    }
  }

  function togglePrecipitationLayer() {
    setPrecipitationLayer(!precipitationLayer);
  }

  function initCopyUrlButton() {
    const btn = document.getElementById("copyUrlBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const url = buildShareUrl();
      navigator.clipboard.writeText(url).then(
        () => { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy view URL"; }, 1500); },
        () => { btn.textContent = "Copy failed"; }
      );
    });
  }

  function initPrecipitationLayerButton() {
    const btn = document.getElementById("precipitationLayerBtn");
    if (!btn) return;
    btn.addEventListener("click", togglePrecipitationLayer);
  }

  function initApiHint() {
    const hint = document.getElementById("apiHint");
    const toggle = document.getElementById("apiHintToggle");
    if (!hint || !toggle) return;
    toggle.addEventListener("click", function () {
      const collapsed = hint.classList.toggle("api-hint--collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.textContent = collapsed ? "Show API help" : "Hide API help";
    });
  }

  function initPostMessage() {
    window.addEventListener("message", function (event) {
      const data = event.data;
      if (!data || data.type !== "cesiumFlyTo") return;
      const { lat, lon, height, addMarker } = data;
      cesiumFlyTo(lat, lon, height, addMarker !== false);
    });
  }

  function hideLoading() {
    const el = document.getElementById("loadingOverlay");
    if (el) el.classList.add("loading-overlay--hidden");
  }

  async function init() {
    if (typeof Cesium === "undefined") {
      console.error("Cesium failed to load.");
      return;
    }
    if (typeof CONFIG !== "undefined" && CONFIG.CESIUM_ION_ACCESS_TOKEN) {
      Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_ION_ACCESS_TOKEN;
    }

    const viewerOptions = {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      timeline: false,
      animation: false,
      baseLayerPicker: true,
      geocoder: false,
      sceneModePicker: true,
      navigationHelpButton: true,
      fullscreenButton: true,
      vrButton: false,
      useDefaultRenderLoop: true,
      requestRenderMode: false,
    };

    const bingKey = typeof CONFIG !== "undefined" && CONFIG.BING_MAPS_KEY && String(CONFIG.BING_MAPS_KEY).trim();
    if (bingKey) {
      try {
        const bing = await Cesium.BingMapsImageryProvider.fromUrl("https://dev.virtualearth.net", {
          key: bingKey,
          mapStyle: Cesium.BingMapsStyle.AERIAL_WITH_LABELS,
        });
        viewerOptions.imageryProvider = bing;
      } catch (e) {
        console.warn("Bing Maps failed, using default imagery:", e);
      }
    }

    viewer = new Cesium.Viewer("cesiumContainer", viewerOptions);

    viewer.scene.globe.depthTestAgainstTerrain = true;

    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    readUrlParams();
    initCoordsWeather();
    initTimeSlider();
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("lat") == null || urlParams.get("lon") == null) {
      const lat = typeof CONFIG !== "undefined" && CONFIG.defaultLat != null ? CONFIG.defaultLat : 3.3633483;
      const lon = typeof CONFIG !== "undefined" && CONFIG.defaultLon != null ? CONFIG.defaultLon : 101.3449264;
      flyToCoordinates(lon, lat, DEFAULTS.flyToHeight, true);
      const inputLat = document.getElementById("inputLat");
      const inputLon = document.getElementById("inputLon");
      if (inputLat) inputLat.value = lat;
      if (inputLon) inputLon.value = lon;
      fetchWeatherForCoordinates(lat, lon);
    }
    initPlacesSearch();
    initCopyUrlButton();
    initPrecipitationLayerButton();
    initApiHint();
    initRainOverlay();
    initPostMessage();

    viewer.scene.globe.tileLoadProgressEvent.addEventListener(function (queuedTileCount) {
      if (queuedTileCount === 0) hideLoading();
    });
    setTimeout(hideLoading, 3000);

    window.cesiumFlyTo = cesiumFlyTo;
    window.CesiumViewer = viewer;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init().catch(function (e) { console.error(e); }); });
  } else {
    init().catch(function (e) { console.error(e); });
  }
})();
