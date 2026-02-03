import { renderer } from "./scene.js";
import { getWorldStats } from "./world.js";
import { clamp } from "./config.js";

const SAMPLE_SIZE = 300;
const frameTimes = new Float32Array(SAMPLE_SIZE);
let frameIndex = 0;
let frameCount = 0;
let lastOverlayUpdate = 0;
let overlayEnabled = false;

const overlayEl = document.createElement("div");
overlayEl.id = "perf-overlay";
overlayEl.style.position = "absolute";
overlayEl.style.top = "8px";
overlayEl.style.right = "8px";
overlayEl.style.padding = "8px 10px";
overlayEl.style.background = "rgba(0,0,0,0.6)";
overlayEl.style.border = "1px solid rgba(255,255,255,0.1)";
overlayEl.style.fontFamily = "Courier New, monospace";
overlayEl.style.fontSize = "11px";
overlayEl.style.lineHeight = "1.35";
overlayEl.style.whiteSpace = "pre";
overlayEl.style.color = "#e5e7eb";
overlayEl.style.pointerEvents = "none";
overlayEl.style.zIndex = "10";
overlayEl.classList.add("hidden");

document.body.append(overlayEl);

const computeStats = () => {
  const count = Math.min(frameCount, SAMPLE_SIZE);
  if (count === 0) return { avgMs: 0, p99Ms: 0, fps: 0 };
  let sum = 0;
  const temp = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const val = frameTimes[i];
    sum += val;
    temp[i] = val;
  }
  temp.sort((a, b) => a - b);
  const avgMs = sum / count;
  const p99Index = Math.max(0, Math.floor(count * 0.99) - 1);
  const p99Ms = temp[p99Index] || 0;
  const fps = avgMs > 0 ? 1000 / avgMs : 0;
  return { avgMs, p99Ms, fps };
};

const formatNumber = (value, digits = 1) => Number(value).toFixed(digits);

let benchActive = false;
let benchStart = 0;
let benchDuration = 30000;
let benchLabel = "default";
let benchFrameTimes = [];

export const startBenchmark = (durationMs = 30000, label = "default") => {
  benchActive = true;
  benchStart = performance.now();
  benchDuration = durationMs;
  benchLabel = label;
  benchFrameTimes = [];
};

const finishBenchmark = () => {
  benchActive = false;
  const count = benchFrameTimes.length;
  if (!count) return;
  const temp = benchFrameTimes.slice().sort((a, b) => a - b);
  const sum = benchFrameTimes.reduce((acc, v) => acc + v, 0);
  const avgMs = sum / count;
  const p99Index = Math.max(0, Math.floor(count * 0.99) - 1);
  const p99Ms = temp[p99Index] || 0;
  const fps = avgMs > 0 ? 1000 / avgMs : 0;
  const info = renderer.info.render;
  const worldStats = getWorldStats();
  const payload = {
    label: benchLabel,
    durationMs: benchDuration,
    samples: count,
    avgMs: Number(avgMs.toFixed(3)),
    p99Ms: Number(p99Ms.toFixed(3)),
    fps: Number(fps.toFixed(1)),
    drawCalls: info.calls,
    triangles: info.triangles,
    chunks: worldStats.chunks,
    loadedChunks: worldStats.loadedChunks,
    dirtyChunks: worldStats.dirtyQueue,
    meshingQueue: worldStats.meshQueue,
    generationQueue: worldStats.genQueue,
  };
  console.log("PERF_BENCH", JSON.stringify(payload));
};

export const setPerfOverlayEnabled = (enabled) => {
  overlayEnabled = enabled;
  overlayEl.classList.toggle("hidden", !enabled);
};

export const togglePerfOverlay = () => setPerfOverlayEnabled(!overlayEnabled);

export const recordFrameTime = (dt) => {
  const ms = clamp(dt * 1000, 0, 1000);
  frameTimes[frameIndex] = ms;
  frameIndex = (frameIndex + 1) % SAMPLE_SIZE;
  frameCount += 1;
  if (benchActive) {
    benchFrameTimes.push(ms);
    if (performance.now() - benchStart >= benchDuration) {
      finishBenchmark();
    }
  }
};

export const updatePerfOverlay = () => {
  if (!overlayEnabled) return;
  const now = performance.now();
  if (now - lastOverlayUpdate < 250) return;
  lastOverlayUpdate = now;

  const stats = computeStats();
  const info = renderer.info.render;
  const worldStats = getWorldStats();
  const memory = performance.memory
    ? `${formatNumber(performance.memory.usedJSHeapSize / 1048576, 1)}MB`
    : "n/a";

  overlayEl.textContent =
    `FPS: ${formatNumber(stats.fps, 1)}\n` +
    `Avg: ${formatNumber(stats.avgMs, 2)}ms  P99: ${formatNumber(stats.p99Ms, 2)}ms\n` +
    `Draw: ${info.calls}  Tris: ${info.triangles}\n` +
    `Chunks: ${worldStats.loadedChunks}/${worldStats.chunks}  Dirty: ${worldStats.dirtyQueue}\n` +
    `GenQ: ${worldStats.genQueue}  MeshQ: ${worldStats.meshQueue}\n` +
    `Heap: ${memory}`;
};
