import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { canvas } from "./dom.js";

canvas?.setAttribute("tabindex", "0");

export { THREE };

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

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
