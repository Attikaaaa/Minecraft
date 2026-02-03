import { getBlock, setBlock } from "./world.js";
import { state } from "./state.js";

const cropStages = [26, 27, 28, 29];
const cropTimers = new Map();
const GROW_TIME = 25; // seconds per stage

const keyFor = (x, y, z) => `${x},${y},${z}`;

export const isCropBlock = (type) => cropStages.includes(type);

export const getCropStageIndex = (type) => cropStages.indexOf(type);

export const plantCrop = (x, y, z) => {
  setBlock(x, y, z, cropStages[0]);
  cropTimers.set(keyFor(x, y, z), { stage: 0, timer: 0 });
};

export const updateCrops = (dt) => {
  if (cropTimers.size === 0) return;
  for (const [key, data] of cropTimers.entries()) {
    const [sx, sy, sz] = key.split(",");
    const x = Number(sx);
    const y = Number(sy);
    const z = Number(sz);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      cropTimers.delete(key);
      continue;
    }
    const current = getBlock(x, y, z);
    const idx = getCropStageIndex(current);
    if (idx === -1) {
      cropTimers.delete(key);
      continue;
    }
    data.timer += dt;
    data.stage = idx;
    if (data.timer >= GROW_TIME && idx < cropStages.length - 1) {
      const nextStage = idx + 1;
      setBlock(x, y, z, cropStages[nextStage], { skipPhysics: true });
      data.timer = 0;
      data.stage = nextStage;
    }
  }
};

export const syncCropsFromEdits = (entries) => {
  cropTimers.clear();
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string") continue;
    const type = Number(entry.type);
    if (!isCropBlock(type)) continue;
    const [sx, sy, sz] = entry.key.split(",");
    const x = Number(sx);
    const y = Number(sy);
    const z = Number(sz);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    cropTimers.set(keyFor(x, y, z), { stage: getCropStageIndex(type), timer: Math.random() * GROW_TIME });
  }
};

export const clearCrops = () => {
  cropTimers.clear();
};
