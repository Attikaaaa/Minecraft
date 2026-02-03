import { itemDefs } from "./items.js";
import { addItemToInventory, updateAllSlotsUI } from "./inventory.js";

const FUEL_BURN_TIME = {
  coal_item: 80,
  coal: 80,
  stick: 5,
  plank: 15,
  wood: 15,
};

const SMELT_RECIPES = {
  iron_ore: { id: "iron_ingot", count: 1, time: 10 },
  gold_ore: { id: "gold_ingot", count: 1, time: 10 },
  sand: { id: "glass", count: 1, time: 8 },
  beef_raw: { id: "beef_cooked", count: 1, time: 8 },
  pork_raw: { id: "pork_cooked", count: 1, time: 8 },
  chicken_raw: { id: "chicken_cooked", count: 1, time: 8 },
};

const furnaces = new Map();

const makeSlot = () => ({ id: null, count: 0 });

const ensureSlot = (slot) => slot ?? makeSlot();

const slotEmpty = (slot) => !slot || !slot.id || slot.count <= 0;

const consumeSlot = (slot, amount = 1) => {
  if (!slot || slot.count <= 0) return false;
  slot.count -= amount;
  if (slot.count <= 0) {
    slot.id = null;
    slot.count = 0;
  }
  return true;
};

export const getFurnaceKey = (x, y, z) => `${x},${y},${z}`;

export const getFurnace = (x, y, z) => {
  const key = getFurnaceKey(x, y, z);
  if (!furnaces.has(key)) {
    furnaces.set(key, {
      key,
      x,
      y,
      z,
      input: makeSlot(),
      fuel: makeSlot(),
      output: makeSlot(),
      burnTime: 0,
      burnMax: 0,
      cookTime: 0,
      cookTotal: 10,
    });
  }
  return furnaces.get(key);
};

export const removeFurnace = (x, y, z) => {
  const key = getFurnaceKey(x, y, z);
  furnaces.delete(key);
};

export const clearFurnaces = () => {
  furnaces.clear();
};

export const serializeFurnaces = () =>
  Array.from(furnaces.values()).map((f) => ({
    key: f.key,
    x: f.x,
    y: f.y,
    z: f.z,
    input: { ...f.input },
    fuel: { ...f.fuel },
    output: { ...f.output },
    burnTime: f.burnTime,
    burnMax: f.burnMax,
    cookTime: f.cookTime,
    cookTotal: f.cookTotal,
  }));

export const loadFurnaces = (entries) => {
  furnaces.clear();
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string") continue;
    furnaces.set(entry.key, {
      key: entry.key,
      x: entry.x,
      y: entry.y,
      z: entry.z,
      input: ensureSlot(entry.input),
      fuel: ensureSlot(entry.fuel),
      output: ensureSlot(entry.output),
      burnTime: entry.burnTime ?? 0,
      burnMax: entry.burnMax ?? 0,
      cookTime: entry.cookTime ?? 0,
      cookTotal: entry.cookTotal ?? 10,
    });
  }
};

const canSmelt = (furnace) => {
  if (!furnace || slotEmpty(furnace.input)) return false;
  const recipe = SMELT_RECIPES[furnace.input.id];
  if (!recipe) return false;
  if (slotEmpty(furnace.output)) return true;
  if (furnace.output.id !== recipe.id) return false;
  const maxStack = itemDefs[recipe.id]?.maxStack ?? 64;
  return furnace.output.count + recipe.count <= maxStack;
};

const startBurnIfNeeded = (furnace) => {
  if (furnace.burnTime > 0) return true;
  if (slotEmpty(furnace.fuel)) return false;
  const fuelTime = FUEL_BURN_TIME[furnace.fuel.id];
  if (!fuelTime) return false;
  consumeSlot(furnace.fuel, 1);
  furnace.burnTime = fuelTime;
  furnace.burnMax = fuelTime;
  return true;
};

const finishSmelt = (furnace) => {
  const recipe = SMELT_RECIPES[furnace.input.id];
  if (!recipe) return;
  consumeSlot(furnace.input, 1);
  if (slotEmpty(furnace.output)) {
    furnace.output.id = recipe.id;
    furnace.output.count = recipe.count;
  } else {
    furnace.output.count += recipe.count;
  }
};

export const updateFurnaces = (dt) => {
  if (furnaces.size === 0) return;
  let anyChanged = false;
  for (const furnace of furnaces.values()) {
    if (!canSmelt(furnace)) {
      furnace.cookTime = 0;
      continue;
    }
    const canBurn = startBurnIfNeeded(furnace);
    if (!canBurn) {
      furnace.cookTime = 0;
      continue;
    }
    furnace.burnTime = Math.max(0, furnace.burnTime - dt);
    furnace.cookTotal = SMELT_RECIPES[furnace.input.id]?.time ?? 10;
    furnace.cookTime += dt;
    if (furnace.cookTime >= furnace.cookTotal) {
      furnace.cookTime = 0;
      finishSmelt(furnace);
      anyChanged = true;
    }
  }
  if (anyChanged) updateAllSlotsUI();
};

export const quickCollectOutput = (furnace) => {
  if (!furnace || slotEmpty(furnace.output)) return;
  const remaining = addItemToInventory(furnace.output.id, furnace.output.count);
  if (remaining <= 0) {
    furnace.output.id = null;
    furnace.output.count = 0;
  } else {
    furnace.output.count = remaining;
  }
};

export const getSmeltRecipe = (id) => SMELT_RECIPES[id] || null;

export const getFuelTime = (id) => FUEL_BURN_TIME[id] || 0;
