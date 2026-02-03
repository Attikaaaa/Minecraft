import { itemDefs } from "./items.js";

const CHEST_SIZE = 27;
const chests = new Map();

const createSlot = (id = null, count = 0) => ({ id, count });

const makeChestSlots = () => Array.from({ length: CHEST_SIZE }, () => createSlot());

export const getChestKey = (x, y, z) => `${x},${y},${z}`;

export const getChest = (x, y, z) => {
  const key = getChestKey(x, y, z);
  if (!chests.has(key)) {
    chests.set(key, { key, x, y, z, slots: makeChestSlots() });
  }
  return chests.get(key);
};

export const removeChest = (x, y, z) => {
  const key = getChestKey(x, y, z);
  chests.delete(key);
};

export const clearChests = () => {
  chests.clear();
};

export const serializeChests = () =>
  Array.from(chests.values()).map((chest) => ({
    key: chest.key,
    x: chest.x,
    y: chest.y,
    z: chest.z,
    slots: chest.slots.map((slot) => ({
      id: slot.id,
      count: slot.count,
    })),
  }));

export const loadChests = (entries) => {
  chests.clear();
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string") continue;
    const slots = Array.isArray(entry.slots) ? entry.slots : [];
    const chestSlots = makeChestSlots();
    for (let i = 0; i < chestSlots.length; i += 1) {
      const slot = slots[i];
      if (!slot || !slot.id || !itemDefs[slot.id]) continue;
      chestSlots[i].id = slot.id;
      chestSlots[i].count = Math.max(0, Math.floor(slot.count || 0));
      if (chestSlots[i].count <= 0) {
        chestSlots[i].id = null;
        chestSlots[i].count = 0;
      }
    }
    chests.set(entry.key, {
      key: entry.key,
      x: entry.x,
      y: entry.y,
      z: entry.z,
      slots: chestSlots,
    });
  }
};

export const getChestSize = () => CHEST_SIZE;
