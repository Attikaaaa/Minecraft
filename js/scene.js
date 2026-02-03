import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { canvas } from "./dom.js";
import { urlParams } from "./config.js";

canvas?.setAttribute("tabindex", "0");

export { THREE };

const testMode = urlParams.get("test") === "1";

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fbce6);
scene.fog = new THREE.Fog(0x8fbce6, 10, 55);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const daySky = new THREE.Color(0x8fbce6);
const nightSky = new THREE.Color(0x0b1020);
const duskSky = new THREE.Color(0xf0a36b);
const tempSky = new THREE.Color();

let daylightFactor = 1;

export const setSky = (mode) => {
  if (mode === "night") {
    scene.background.copy(nightSky);
    scene.fog.color.copy(nightSky);
    return;
  }
  scene.background.copy(daySky);
  scene.fog.color.copy(daySky);
};

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

const collectWebglContextInfo = () => {
  try {
    const probeCanvas = document.createElement("canvas");
    const gl = probeCanvas.getContext("webgl");
    const gl2 = probeCanvas.getContext("webgl2");
    const info = {
      webgl: Boolean(gl),
      webgl2: Boolean(gl2),
      webglVersion: gl ? gl.getParameter(gl.VERSION) : null,
      webgl2Version: gl2 ? gl2.getParameter(gl2.VERSION) : null,
      renderer: null,
      vendor: null,
      renderer2: null,
      vendor2: null,
    };
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        info.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        info.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
      }
    }
    if (gl2) {
      const ext2 = gl2.getExtension("WEBGL_debug_renderer_info");
      if (ext2) {
        info.renderer2 = gl2.getParameter(ext2.UNMASKED_RENDERER_WEBGL);
        info.vendor2 = gl2.getParameter(ext2.UNMASKED_VENDOR_WEBGL);
      }
    }
    return info;
  } catch (err) {
    return { error: err?.message || String(err) };
  }
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  if (testMode && typeof window !== "undefined") {
    window.__RENDERER_INIT_ERROR = {
      message: err?.message || String(err),
      stack: err?.stack || null,
    };
    window.__THREE_REVISION = THREE.REVISION;
    window.__WEBGL_CONTEXT_INFO = collectWebglContextInfo();
  }
  throw err;
}

if (testMode && typeof window !== "undefined") {
  window.__THREE_REVISION = THREE.REVISION;
  window.__WEBGL_CONTEXT_INFO = collectWebglContextInfo();
}

export { renderer };
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x5b4b35, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 30, 10);
scene.add(sun);

export const torchLight = new THREE.PointLight(0xffc27a, 0, 10, 2);
torchLight.castShadow = false;
scene.add(torchLight);

export const updateDayNight = (timeOfDay) => {
  const t = ((timeOfDay % 1) + 1) % 1;
  const angle = (t - 0.25) * Math.PI * 2;
  const sunHeight = Math.sin(angle);
  const daylight = clamp((sunHeight + 1) / 2, 0, 1);
  const eased = daylight * daylight * (3 - 2 * daylight);
  const dusk = clamp(1 - Math.abs(sunHeight) * 3, 0, 1);

  daylightFactor = eased;

  tempSky.copy(daySky).lerp(nightSky, 1 - eased);
  if (dusk > 0) tempSky.lerp(duskSky, dusk * 0.35);
  scene.background.copy(tempSky);
  scene.fog.color.copy(tempSky);

  ambient.intensity = 0.14 + eased * 0.5;
  hemi.intensity = 0.2 + eased * 0.5;
  sun.intensity = 0.05 + eased * 0.95;
  sun.position.set(Math.cos(angle) * 30, 15 + sunHeight * 30, Math.sin(angle) * 30);
};

export const getDaylightFactor = () => daylightFactor;

export const updateTorchLight = (enabled, position) => {
  if (!enabled || !position) {
    torchLight.intensity = 0;
    return;
  }
  torchLight.intensity = 1.1;
  torchLight.position.copy(position);
};

export const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

export const raycaster = new THREE.Raycaster();
raycaster.far = 6;
