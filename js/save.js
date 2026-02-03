import { randomSeed } from "./config.js";
import { state } from "./state.js";
import { player } from "./player.js";
import {
  craftSlots,
  armorSlots,
  hotbar,
  inventory,
  setSlot,
  slotIsEmpty,
  tableCraftSlots,
  updateAllSlotsUI,
} from "./inventory.js";
import { itemDefs } from "./items.js";
import { getWorldEditsSnapshot, setWorldEditsSnapshot } from "./world.js";
import { setTimeOfDay } from "./time.js";
import { getMobs, syncMobs } from "./mobs.js";
import { itemEntities, syncItemEntities, clearItemEntities } from "./entities.js";
import { loadFurnaces, serializeFurnaces } from "./furnace.js";
import { loadChests, serializeChests } from "./chest.js";

const SAVE_VERSION = 1;
const INDEX_KEY = "blockland_world_index_v1";
const SAVE_PREFIX = "blockland_world_save_v1_";

const safeParse = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
};

export const getWorldId = (seed = randomSeed) => String(seed);
export const getWorldKey = (seed = randomSeed) => `${SAVE_PREFIX}${getWorldId(seed)}`;

const loadIndex = () => {
  const raw = localStorage.getItem(INDEX_KEY);
  const parsed = safeParse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const saveIndex = (list) => {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch (err) {
    // Ignore storage failures.
  }
};

export const listWorlds = () => loadIndex();
export const getWorldMeta = (seed) => loadIndex().find((entry) => String(entry.seed) === String(seed)) || null;

export const upsertWorldMeta = ({ seed, name, createdAt, lastPlayed } = {}) => {
  if (seed == null) return;
  const id = String(seed);
  const list = loadIndex();
  const now = new Date().toISOString();
  const existing = list.find((entry) => String(entry.seed) === id);
  if (existing) {
    existing.name = name ?? existing.name ?? `World ${id}`;
    existing.lastPlayed = lastPlayed ?? now;
    if (!existing.createdAt) existing.createdAt = createdAt ?? now;
  } else {
    list.push({
      seed: id,
      name: name ?? `World ${id}`,
      createdAt: createdAt ?? now,
      lastPlayed: lastPlayed ?? now,
    });
  }
  saveIndex(list);
};

export const deleteWorld = (seed) => {
  if (seed == null) return;
  const id = String(seed);
  try {
    localStorage.removeItem(getWorldKey(id));
  } catch (err) {
    // ignore
  }
  const list = loadIndex().filter((entry) => String(entry.seed) !== id);
  saveIndex(list);
};

export const renameWorld = (seed, name) => {
  if (seed == null) return;
  const id = String(seed);
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  const list = loadIndex();
  const entry = list.find((row) => String(row.seed) === id);
  if (entry) {
    entry.name = trimmed;
  } else {
    list.push({ seed: id, name: trimmed, createdAt: new Date().toISOString(), lastPlayed: new Date().toISOString() });
  }
  saveIndex(list);
  try {
    const payload = loadWorldState(id);
    if (payload) {
      payload.name = trimmed;
      saveWorldState(payload);
    }
  } catch (err) {
    // ignore
  }
};

const serializeSlots = (slots) =>
  slots.map((slot) => (slotIsEmpty(slot) ? null : {
    id: slot.id,
    count: slot.count,
    durability: slot.durability ?? null,
  }));

const applySlots = (slots, data) => {
  const source = Array.isArray(data) ? data : [];
  for (let i = 0; i < slots.length; i += 1) {
    const entry = source[i];
    if (!entry || !entry.id || !itemDefs[entry.id] || !Number.isFinite(entry.count)) {
      setSlot(slots[i], null, 0);
      continue;
    }
    slots[i].id = entry.id;
    slots[i].count = Math.max(0, Math.floor(entry.count));
    slots[i].durability =
      entry.durability ?? (itemDefs[entry.id]?.durability != null ? itemDefs[entry.id].durability : null);
  }
};

const serializeMobs = (mobs) =>
  mobs.map((mob) => ({
    id: mob.id,
    type: mob.type,
    x: mob.position.x,
    y: mob.position.y,
    z: mob.position.z,
    yaw: mob.yaw,
    health: mob.health,
  }));

const serializeItems = (items) =>
  items.map((entity) => ({
    entityId: entity.entityId,
    id: entity.id,
    count: entity.count,
    x: entity.position.x,
    y: entity.position.y,
    z: entity.position.z,
  }));

export const buildSavePayload = () => {
  const now = new Date().toISOString();
  return {
    version: SAVE_VERSION,
    seed: randomSeed,
    name: state.worldName ?? null,
    savedAt: now,
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
      velocity: {
        x: player.velocity.x,
        y: player.velocity.y,
        z: player.velocity.z,
      },
      health: player.health,
      hunger: player.hunger,
      exhaustion: player.exhaustion,
      regenTimer: player.regenTimer,
      starveTimer: player.starveTimer,
      fallDistance: player.fallDistance,
    },
    state: {
      gamemode: state.gamemode,
      selectedHotbar: state.selectedHotbar,
      respawnPoint: state.respawnPoint,
      timeOfDay: state.timeOfDay,
      movementSpeed: state.movementSpeed,
      flySpeed: state.flySpeed,
    },
  inventory: {
    hotbar: serializeSlots(hotbar),
    inventory: serializeSlots(inventory),
    armor: serializeSlots(armorSlots),
  },
    blocks: getWorldEditsSnapshot(),
    mobs: serializeMobs(getMobs()),
    items: serializeItems(itemEntities),
    furnaces: serializeFurnaces(),
    chests: serializeChests(),
  };
};

export const saveWorldState = (payload) => {
  if (!payload) return;
  const seed = payload.seed ?? randomSeed;
  try {
    localStorage.setItem(getWorldKey(seed), JSON.stringify(payload));
  } catch (err) {
    // ignore
  }
  upsertWorldMeta({
    seed,
    name: payload.name ?? state.worldName ?? null,
    lastPlayed: payload.savedAt ?? new Date().toISOString(),
  });
};

export const loadWorldState = (seed = randomSeed) => {
  const raw = localStorage.getItem(getWorldKey(seed));
  const parsed = safeParse(raw);
  if (!parsed || parsed.version !== SAVE_VERSION) return null;
  return parsed;
};

export const applySavePayload = (payload) => {
  if (!payload) return false;
  const savedState = payload.state || {};
  const savedPlayer = payload.player || {};
  const savedInventory = payload.inventory || {};

  state.gamemode = savedState.gamemode ?? state.gamemode;
  state.selectedHotbar = Number.isFinite(savedState.selectedHotbar) ? savedState.selectedHotbar : 0;
  state.respawnPoint = savedState.respawnPoint ?? null;
  state.movementSpeed = Number.isFinite(savedState.movementSpeed) ? savedState.movementSpeed : state.movementSpeed;
  state.flySpeed = Number.isFinite(savedState.flySpeed) ? savedState.flySpeed : state.flySpeed;
  if (Number.isFinite(savedState.timeOfDay)) {
    setTimeOfDay(savedState.timeOfDay);
  }

  if (payload.name) state.worldName = payload.name;

  player.position.set(savedPlayer.x ?? player.position.x, savedPlayer.y ?? player.position.y, savedPlayer.z ?? player.position.z);
  player.velocity.set(
    savedPlayer.velocity?.x ?? player.velocity.x,
    savedPlayer.velocity?.y ?? player.velocity.y,
    savedPlayer.velocity?.z ?? player.velocity.z
  );
  player.yaw = Number.isFinite(savedPlayer.yaw) ? savedPlayer.yaw : player.yaw;
  player.pitch = Number.isFinite(savedPlayer.pitch) ? savedPlayer.pitch : player.pitch;
  player.health = Number.isFinite(savedPlayer.health) ? savedPlayer.health : player.health;
  player.hunger = Number.isFinite(savedPlayer.hunger) ? savedPlayer.hunger : player.hunger;
  player.exhaustion = Number.isFinite(savedPlayer.exhaustion) ? savedPlayer.exhaustion : player.exhaustion;
  player.regenTimer = Number.isFinite(savedPlayer.regenTimer) ? savedPlayer.regenTimer : player.regenTimer;
  player.starveTimer = Number.isFinite(savedPlayer.starveTimer) ? savedPlayer.starveTimer : player.starveTimer;
  player.fallDistance = Number.isFinite(savedPlayer.fallDistance) ? savedPlayer.fallDistance : player.fallDistance;
  player.lastPos.copy(player.position);

  applySlots(hotbar, savedInventory.hotbar);
  applySlots(inventory, savedInventory.inventory);
  applySlots(armorSlots, savedInventory.armor);
  for (const slot of craftSlots) setSlot(slot, null, 0);
  for (const slot of tableCraftSlots) setSlot(slot, null, 0);
  updateAllSlotsUI();

  if (Array.isArray(payload.mobs)) {
    syncMobs(payload.mobs);
  }

  if (Array.isArray(payload.items)) {
    syncItemEntities(payload.items);
  } else {
    clearItemEntities();
  }

  if (Array.isArray(payload.furnaces)) {
    loadFurnaces(payload.furnaces);
  }

  if (Array.isArray(payload.chests)) {
    loadChests(payload.chests);
  }

  if (Array.isArray(payload.blocks)) {
    setWorldEditsSnapshot(payload.blocks);
  }

  return true;
};
