import {
  chestEl,
  chestGridEl,
  chestInventoryEl,
  chestHotbarEl,
  cursorItemChestEl,
  crosshairEl,
  statusEl,
} from "./dom.js";
import { state } from "./state.js";
import { itemDefs } from "./items.js";
import {
  clearHeldItem,
  ensureHeldItem,
  setSlot,
  slotIsEmpty,
  updateAllSlotsUI,
} from "./inventory.js";
import { lockPointer, unlockPointer } from "./controls.js";
import { getChest, getChestSize } from "./chest.js";

const chestSlotUIs = [];

const decorateSlot = (el, index) => {
  const slotEl = document.createElement("div");
  slotEl.className = "slot";
  slotEl.dataset.index = String(index);
  const iconEl = document.createElement("div");
  iconEl.className = "item-icon";
  const countEl = document.createElement("div");
  countEl.className = "count";
  const durabilityEl = document.createElement("div");
  durabilityEl.className = "durability";
  const durabilityFillEl = document.createElement("div");
  durabilityEl.append(durabilityFillEl);
  slotEl.append(iconEl, countEl, durabilityEl);
  el.append(slotEl);
  return { slotEl, iconEl, countEl };
};

const updateSlotUI = (ui, slot) => {
  if (!ui) return;
  if (slot && slot.id && slot.count > 0) {
    const icon = itemDefs[slot.id]?.icon;
    ui.iconEl.style.backgroundImage = icon ? `url(${icon})` : "none";
    ui.iconEl.style.display = "block";
    ui.countEl.textContent = slot.count > 1 ? String(slot.count) : "";
  } else {
    ui.iconEl.style.backgroundImage = "none";
    ui.iconEl.style.display = "none";
    ui.countEl.textContent = "";
  }
};

const handleSlotInteraction = (slot, isRightClick) => {
  const held = ensureHeldItem();
  if (slotIsEmpty(held)) {
    if (slotIsEmpty(slot)) return;
    if (isRightClick) {
      const half = Math.ceil(slot.count / 2);
      setSlot(held, slot.id, half);
      slot.count -= half;
      if (slot.count <= 0) setSlot(slot, null, 0);
    } else {
      setSlot(held, slot.id, slot.count);
      setSlot(slot, null, 0);
    }
    return;
  }

  if (slotIsEmpty(slot)) {
    if (isRightClick) {
      setSlot(slot, held.id, 1);
      held.count -= 1;
      if (held.count <= 0) clearHeldItem();
    } else {
      setSlot(slot, held.id, held.count);
      clearHeldItem();
    }
    return;
  }

  if (slot.id === held.id) {
    const maxStack = itemDefs[held.id]?.maxStack ?? 64;
    if (slot.count >= maxStack) return;
    if (isRightClick) {
      slot.count += 1;
      held.count -= 1;
      if (held.count <= 0) clearHeldItem();
    } else {
      const space = maxStack - slot.count;
      const move = Math.min(space, held.count);
      slot.count += move;
      held.count -= move;
      if (held.count <= 0) clearHeldItem();
    }
    return;
  }

  if (!isRightClick) {
    const temp = { id: slot.id, count: slot.count };
    slot.id = held.id;
    slot.count = held.count;
    held.id = temp.id;
    held.count = temp.count;
  }
};

const attachChestSlotListeners = (ui, index) => {
  ui.slotEl.addEventListener("mousedown", (event) => {
    if (!state.chestOpen || !state.activeChest) return;
    event.preventDefault();
    const slot = state.activeChest.slots[index];
    handleSlotInteraction(slot, event.button === 2);
    updateAllSlotsUI();
    updateChestUI();
  });
  ui.slotEl.addEventListener("contextmenu", (event) => event.preventDefault());
};

const ensureUI = () => {
  if (!chestGridEl || chestSlotUIs.length) return;
  const size = getChestSize();
  for (let i = 0; i < size; i += 1) {
    const ui = decorateSlot(chestGridEl, i);
    chestSlotUIs.push(ui);
    attachChestSlotListeners(ui, i);
  }
};

export const openChest = (x, y, z) => {
  ensureUI();
  state.activeChest = getChest(x, y, z);
  state.chestOpen = true;
  chestEl?.classList.remove("hidden");
  statusEl?.classList.add("hidden");
  crosshairEl?.classList.add("hidden");
  unlockPointer();
  updateChestUI();
  updateAllSlotsUI();
};

export const closeChest = () => {
  if (!state.chestOpen) return;
  state.chestOpen = false;
  state.activeChest = null;
  chestEl?.classList.add("hidden");
  statusEl?.classList.toggle("hidden", !state.debugHud);
  crosshairEl?.classList.remove("hidden");
  lockPointer();
};

export const updateChestUI = () => {
  if (!state.chestOpen || !state.activeChest) return;
  const slots = state.activeChest.slots;
  for (let i = 0; i < chestSlotUIs.length; i += 1) {
    updateSlotUI(chestSlotUIs[i], slots[i]);
  }
};

export const updateChestCursor = (event) => {
  if (!state.chestOpen || !cursorItemChestEl) return;
  cursorItemChestEl.style.left = `${event.clientX + 6}px`;
  cursorItemChestEl.style.top = `${event.clientY + 6}px`;
  const held = state.heldItem;
  if (!held || slotIsEmpty(held)) {
    cursorItemChestEl.classList.add("hidden");
    cursorItemChestEl.style.backgroundImage = "none";
    cursorItemChestEl.textContent = "";
    return;
  }
  const icon = itemDefs[held.id]?.icon;
  cursorItemChestEl.classList.remove("hidden");
  cursorItemChestEl.style.backgroundImage = icon ? `url(${icon})` : "none";
  cursorItemChestEl.textContent = held.count > 1 ? String(held.count) : "";
};
