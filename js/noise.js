import { fract, randomSeed } from "./config.js";

export const hash2 = (x, z) => {
  const h = Math.sin(x * 127.1 + z * 311.7 + randomSeed * 0.0001) * 43758.5453;
  return fract(h);
};

export const hash3 = (x, y, z) => {
  const h =
    Math.sin(x * 127.1 + y * 269.5 + z * 311.7 + randomSeed * 0.0007) * 43758.5453;
  return fract(h);
};

export const smoothstep = (t) => t * t * (3 - 2 * t);
export const lerp = (a, b, t) => a + (b - a) * t;

export const noise2D = (x, z) => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const zf = z - z0;

  const v00 = hash2(x0, z0);
  const v10 = hash2(x0 + 1, z0);
  const v01 = hash2(x0, z0 + 1);
  const v11 = hash2(x0 + 1, z0 + 1);

  const u = smoothstep(xf);
  const v = smoothstep(zf);

  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
};

export const noise3D = (x, y, z) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const yf = y - y0;
  const zf = z - z0;

  const v000 = hash3(x0, y0, z0);
  const v100 = hash3(x0 + 1, y0, z0);
  const v010 = hash3(x0, y0 + 1, z0);
  const v110 = hash3(x0 + 1, y0 + 1, z0);
  const v001 = hash3(x0, y0, z0 + 1);
  const v101 = hash3(x0 + 1, y0, z0 + 1);
  const v011 = hash3(x0, y0 + 1, z0 + 1);
  const v111 = hash3(x0 + 1, y0 + 1, z0 + 1);

  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const w = smoothstep(zf);

  const x00 = lerp(v000, v100, u);
  const x10 = lerp(v010, v110, u);
  const x01 = lerp(v001, v101, u);
  const x11 = lerp(v011, v111, u);
  const yInterp0 = lerp(x00, x10, v);
  const yInterp1 = lerp(x01, x11, v);
  return lerp(yInterp0, yInterp1, w);
};
