/**
 * App configuration. For production, inject CESIUM_ION_ACCESS_TOKEN via build or server.
 * Get a token at https://cesium.com/ion/
 */
const CONFIG = {
  CESIUM_ION_ACCESS_TOKEN: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwYmNmNzc3OS1jY2QxLTRjMGItYjc0ZS0wMzVjYzAwYTIzZTkiLCJpZCI6MzMxMDU3LCJpYXQiOjE3NzIwMDI2MDJ9.E6luxgKIk-2hTJkLFcOJj07TYoIMyMv_zltTeFdmPvg",
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
