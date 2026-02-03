import { renderer } from "./scene.js";
import { getWorldStats, getWorldTimings } from "./world.js";
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
let benchMeta = {};
const benchTimingSums = {
  renderMs: 0,
  worldMs: 0,
  uiMs: 0,
  meshMs: 0,
  waterMs: 0,
};
let benchTimingFrames = 0;
const lastTimings = {
  renderMs: 0,
  worldMs: 0,
  uiMs: 0,
};

export const startBenchmark = (durationMs = 30000, label = "default", meta = {}) => {
  benchActive = true;
  benchStart = performance.now();
  benchDuration = durationMs;
  benchLabel = label;
  benchMeta = { ...meta };
  benchFrameTimes = [];
  benchTimingFrames = 0;
  benchTimingSums.renderMs = 0;
  benchTimingSums.worldMs = 0;
  benchTimingSums.uiMs = 0;
  benchTimingSums.meshMs = 0;
  benchTimingSums.waterMs = 0;
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
  const worstMs = temp[count - 1] || 0;
  const avgFps = avgMs > 0 ? 1000 / avgMs : 0;
  const fps1Low = p99Ms > 0 ? 1000 / p99Ms : 0;
  const info = renderer.info.render;
  const worldStats = getWorldStats();
  const timingDiv = benchTimingFrames || count || 1;
  const timingAverages = {
    render: benchTimingSums.renderMs / timingDiv,
    worldTick: benchTimingSums.worldMs / timingDiv,
    meshingApply: benchTimingSums.meshMs / timingDiv,
    waterTick: benchTimingSums.waterMs / timingDiv,
    ui: benchTimingSums.uiMs / timingDiv,
  };
  const payload = {
    label: benchLabel,
    scenario: benchMeta.scenario ?? benchLabel,
    seed: benchMeta.seed ?? null,
    durationMs: benchDuration,
    samples: count,
    avgFps: Number(avgFps.toFixed(1)),
    fps1Low: Number(fps1Low.toFixed(1)),
    avgFrameMs: Number(avgMs.toFixed(3)),
    p99FrameMs: Number(p99Ms.toFixed(3)),
    worstFrameMs: Number(worstMs.toFixed(3)),
    avgMs: Number(avgMs.toFixed(3)),
    p99Ms: Number(p99Ms.toFixed(3)),
    fps: Number(avgFps.toFixed(1)),
    drawCalls: info.calls,
    triangles: info.triangles,
    chunksRendered: worldStats.loadedChunks,
    chunks: worldStats.chunks,
    loadedChunks: worldStats.loadedChunks,
    queues: {
      dirtyChunks: worldStats.dirtyQueue,
      genQueue: worldStats.genQueue,
      meshQueue: worldStats.meshQueue,
      waterQueue: worldStats.waterQueue,
    },
    dirtyChunks: worldStats.dirtyQueue,
    meshingQueue: worldStats.meshQueue,
    generationQueue: worldStats.genQueue,
    waterQueue: worldStats.waterQueue,
    timingsMs: {
      render: Number(timingAverages.render.toFixed(3)),
      worldTick: Number(timingAverages.worldTick.toFixed(3)),
      meshingApply: Number(timingAverages.meshingApply.toFixed(3)),
      waterTick: Number(timingAverages.waterTick.toFixed(3)),
      ui: Number(timingAverages.ui.toFixed(3)),
    },
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

export const setPerfTimings = (timings) => {
  if (!timings) return;
  if (Number.isFinite(timings.renderMs)) lastTimings.renderMs = timings.renderMs;
  if (Number.isFinite(timings.worldMs)) lastTimings.worldMs = timings.worldMs;
  if (Number.isFinite(timings.uiMs)) lastTimings.uiMs = timings.uiMs;
  if (benchActive) {
    benchTimingFrames += 1;
    benchTimingSums.renderMs += lastTimings.renderMs;
    benchTimingSums.worldMs += lastTimings.worldMs;
    benchTimingSums.uiMs += lastTimings.uiMs;
    const worldTimings = getWorldTimings();
    benchTimingSums.meshMs += worldTimings.meshMs;
    benchTimingSums.waterMs += worldTimings.waterMs;
  }
};

export const updatePerfOverlay = () => {
  if (!overlayEnabled) return;
  const now = performance.now();
  if (now - lastOverlayUpdate < 250) return;
  lastOverlayUpdate = now;

  const stats = computeStats();
  const info = renderer.info.render;
  const memoryInfo = renderer.info.memory || {};
  const worldStats = getWorldStats();
  const worldTimings = getWorldTimings();
  const memory = performance.memory
    ? `${formatNumber(performance.memory.usedJSHeapSize / 1048576, 1)}MB`
    : "n/a";

  overlayEl.textContent =
    `FPS: ${formatNumber(stats.fps, 1)}\n` +
    `Avg: ${formatNumber(stats.avgMs, 2)}ms  P99: ${formatNumber(stats.p99Ms, 2)}ms\n` +
    `Draw: ${info.calls}  Tris: ${info.triangles}  Geom: ${memoryInfo.geometries ?? 0}\n` +
    `Chunks: ${worldStats.loadedChunks}/${worldStats.chunks}  Dirty: ${worldStats.dirtyQueue}\n` +
    `MeshQ: ${worldStats.meshQueue}  GenQ: ${worldStats.genQueue}  WaterQ: ${worldStats.waterQueue}\n` +
    `Render: ${formatNumber(lastTimings.renderMs, 2)}ms  World: ${formatNumber(lastTimings.worldMs, 2)}ms\n` +
    `Mesh: ${formatNumber(worldTimings.meshMs, 2)}ms  Water: ${formatNumber(worldTimings.waterMs, 2)}ms  UI: ${formatNumber(lastTimings.uiMs, 2)}ms\n` +
    `Heap: ${memory}`;
};
