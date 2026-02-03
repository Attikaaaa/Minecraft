export const urlParams = new URLSearchParams(window.location.search);
export const disablePointerLock = urlParams.has("nopointerlock");
export const defaultServerUrl = (() => {
  const fallback = "ws://localhost:8000";
  if (typeof window === "undefined") return fallback;
  const { protocol, hostname, port } = window.location;
  if (!hostname) return fallback;
  const wsProtocol = protocol === "https:" ? "wss" : "ws";
  const host = port ? `${hostname}:${port}` : hostname;
  return `${wsProtocol}://${host}`;
})();

export const VIEW_RADIUS_MIN = 1;
export const VIEW_RADIUS_MAX = 32;
export const VIEW_RADIUS_UNLIMITED = 32;

export const WORLD_MAX_HEIGHT = 64;
export const SEA_LEVEL = 16;
export const CHUNK_SIZE = 16;
export const CHUNK_RADIUS = (() => {
  const sizeParam = urlParams.get("size");
  const radiusParam = Number(urlParams.get("radius"));
  if (Number.isFinite(radiusParam)) {
    const rounded = Math.round(radiusParam);
    return Math.max(VIEW_RADIUS_MIN, Math.min(rounded, VIEW_RADIUS_MAX));
  }
  if (sizeParam) {
    const key = sizeParam.toLowerCase();
    const sizes = {
      small: 1,
      medium: 2,
      large: 3,
      huge: 4,
    };
    if (sizes[key]) return sizes[key];
  }
  return 2;
})();
export const DAY_LENGTH_SECONDS = 1200;

export const HOTBAR_SIZE = 9;
export const INVENTORY_ROWS = 3;
export const INVENTORY_COLS = 9;
export const CRAFT_SIZE = 4;
export const TABLE_CRAFT_SIZE = 9;

export const randomSeed = (() => {
  const urlSeed = urlParams.get("seed");
  if (urlSeed && Number.isFinite(Number(urlSeed))) return Number(urlSeed);
  if (urlParams.get("bench") === "1") return 1337;
  return Math.floor(Math.random() * 1_000_000_000);
})();

export const fract = (n) => n - Math.floor(n);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const hexToRgb = (hex) => ({
  r: (hex >> 16) & 255,
  g: (hex >> 8) & 255,
  b: hex & 255,
});

export const pixelNoise = (x, y, seedOffset) =>
  fract(Math.sin(x * 12.9898 + y * 78.233 + seedOffset) * 43758.5453);

export const pickFromPalette = (palette, weights, n) => {
  if (!weights || weights.length !== palette.length) {
    const idx = Math.floor(n * palette.length);
    return palette[Math.min(idx, palette.length - 1)];
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let i = 0; i < palette.length; i += 1) {
    acc += weights[i] / total;
    if (n <= acc) return palette[i];
  }
  return palette[palette.length - 1];
};
