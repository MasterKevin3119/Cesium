/**
 * Cesium viewer app: URL params, cesiumFlyTo API, postMessage, Google Places.
 */
(function () {
  "use strict";

  const { DEFAULTS, BOUNDS } = typeof CONFIG !== "undefined" ? CONFIG : {
    DEFAULTS: { flyToHeight: 1000, flyToDuration: 1.2, placesFlyToHeight: 1500 },
    BOUNDS: { lat: { min: -90, max: 90 }, lon: { min: -180, max: 180 }, height: { min: 100, max: 10000000 } },
  };

  let viewer = null;
  let markerEntity = null;

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

  function showWeatherData(lat, lon, data) {
    const el = document.getElementById("weatherResult");
    if (!el) return;
    const c = data.current;
    if (!c) {
      showWeatherError("No current weather in response.");
      return;
    }
    const temp = c.temperature_2m != null ? c.temperature_2m + " °C" : "—";
    const rain = c.precipitation != null ? c.precipitation + " mm" : (c.rain != null ? c.rain + " mm" : "—");
    const humidity = c.relative_humidity_2m != null ? c.relative_humidity_2m + "%" : "—";
    const cloud = c.cloud_cover != null ? c.cloud_cover + "%" : "—";
    const desc = weatherCodeToText(c.weather_code || 0);
    el.innerHTML =
      '<div class="row"><span class="label">Condition</span><span>' + escapeHtml(desc) + "</span></div>" +
      '<div class="row"><span class="label">Temperature</span><span>' + escapeHtml(String(temp)) + "</span></div>" +
      '<div class="row"><span class="label">Rain / precipitation</span><span class="rain">' + escapeHtml(String(rain)) + "</span></div>" +
      '<div class="row"><span class="label">Humidity</span><span>' + escapeHtml(String(humidity)) + "</span></div>" +
      '<div class="row"><span class="label">Cloud cover</span><span>' + escapeHtml(String(cloud)) + "</span></div>";
    el.classList.remove("weather-error");
  }

  function fetchWeatherForCoordinates(lat, lon) {
    const url = WEATHER_API +
      "?latitude=" + encodeURIComponent(lat) +
      "&longitude=" + encodeURIComponent(lon) +
      "&current=precipitation,rain,weather_code,temperature_2m,relative_humidity_2m,cloud_cover" +
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
      flyToCoordinates(lon, lat, DEFAULTS.flyToHeight, true);
      btn.disabled = true;
      fetchWeatherForCoordinates(lat, lon);
      setTimeout(function () { btn.disabled = false; }, 2000);
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

  function init() {
    if (typeof Cesium === "undefined") {
      console.error("Cesium failed to load.");
      return;
    }
    if (typeof CONFIG !== "undefined" && CONFIG.CESIUM_ION_ACCESS_TOKEN) {
      Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_ION_ACCESS_TOKEN;
    }

    viewer = new Cesium.Viewer("cesiumContainer", {
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
    });

    viewer.scene.globe.depthTestAgainstTerrain = true;

    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    readUrlParams();
    initCoordsWeather();
    initPlacesSearch();
    initCopyUrlButton();
    initApiHint();
    initPostMessage();

    viewer.scene.globe.tileLoadProgressEvent.addEventListener(function (queuedTileCount) {
      if (queuedTileCount === 0) hideLoading();
    });
    setTimeout(hideLoading, 3000);

    window.cesiumFlyTo = cesiumFlyTo;
    window.CesiumViewer = viewer;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
