/**
 * App configuration. For production, inject CESIUM_ION_ACCESS_TOKEN via build or server.
 * Get a token at https://cesium.com/ion/
 */
const CONFIG = {
  CESIUM_ION_ACCESS_TOKEN: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwYmNmNzc3OS1jY2QxLTRjMGItYjc0ZS0wMzVjYzAwYTIzZTkiLCJpZCI6MzMxMDU3LCJpYXQiOjE3NzIwMDI2MDJ9.E6luxgKIk-2hTJkLFcOJj07TYoIMyMv_zltTeFdmPvg",
  /**
   * Optional: Bing Maps key for Bing Aerial imagery (base map).
   * Get a key at https://www.bingmapsportal.com/ — then terrain uses Cesium World Terrain (elevation) + Bing imagery.
   */
  BING_MAPS_KEY: "",
  /** Default location when no URL params (lat, lon) — e.g. 3.36, 101.34 Malaysia */
  defaultLat: 3.3633483,
  defaultLon: 101.3449264,
  DEFAULTS: {
    flyToHeight: 1000,
    flyToDuration: 1.2,
    placesFlyToHeight: 1500,
  },
  BOUNDS: {
    lat: { min: -90, max: 90 },
    lon: { min: -180, max: 180 },
    height: { min: 100, max: 10000000 },
  },
};
