import {
  furnaceEl,
  furnaceInputEl,
  furnaceFuelEl,
  furnaceOutputEl,
  furnaceProgressFillEl,
  furnaceFireFillEl,
  cursorItemFurnaceEl,
  crosshairEl,
  statusEl,
} from "./dom.js";
import { state } from "./state.js";
import { itemDefs } from "./items.js";
import {
  addItemToInventory,
  clearHeldItem,
  ensureHeldItem,
  setSlot,
  slotIsEmpty,
  updateAllSlotsUI,
} from "./inventory.js";
import { lockPointer, unlockPointer } from "./controls.js";
import { getFurnace, quickCollectOutput } from "./furnace.js";

const slotUIs = {
  input: null,
  fuel: null,
  output: null,
};

const decorateSlot = (el) => {
  const iconEl = document.createElement("div");
  iconEl.className = "item-icon";
  const countEl = document.createElement("div");
  countEl.className = "count";
  const durabilityEl = document.createElement("div");
  durabilityEl.className = "durability";
  const durabilityFillEl = document.createElement("div");
  durabilityEl.append(durabilityFillEl);
  el.append(iconEl, countEl, durabilityEl);
  return { slotEl: el, iconEl, countEl, durabilityEl, durabilityFillEl };
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

const bindSlot = (ui, slotGetter, options = {}) => {
  const { isOutput = false, allowFuelOnly = false } = options;
  ui.slotEl.addEventListener("mousedown", (event) => {
    if (!state.furnaceOpen) return;
    event.preventDefault();
    const held = ensureHeldItem();
    const slot = slotGetter();
    if (isOutput) {
      if (slotIsEmpty(slot)) return;
      const remaining = addItemToInventory(slot.id, slot.count);
      if (remaining <= 0) {
        slot.id = null;
        slot.count = 0;
      } else {
        slot.count = remaining;
      }
      updateAllSlotsUI();
      return;
    }

    if (!slotIsEmpty(held)) {
      if (allowFuelOnly) {
        const def = itemDefs[held.id];
        if (!def || (def.id === "torch")) {
          // allow torches to be placed? keep simple
        }
      }
    }

    if (slotIsEmpty(held)) {
      if (slotIsEmpty(slot)) return;
      if (event.button === 2) {
        const half = Math.ceil(slot.count / 2);
        setSlot(held, slot.id, half);
        slot.count -= half;
        if (slot.count <= 0) setSlot(slot, null, 0);
      } else {
        setSlot(held, slot.id, slot.count);
        setSlot(slot, null, 0);
      }
    } else if (slotIsEmpty(slot)) {
      if (event.button === 2) {
        setSlot(slot, held.id, 1);
        held.count -= 1;
        if (held.count <= 0) clearHeldItem();
      } else {
        setSlot(slot, held.id, held.count);
        clearHeldItem();
      }
    } else if (slot.id === held.id) {
      const maxStack = itemDefs[held.id]?.maxStack ?? 64;
      if (slot.count >= maxStack) return;
      if (event.button === 2) {
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
    } else if (event.button !== 2) {
      const temp = { id: slot.id, count: slot.count };
      slot.id = held.id;
      slot.count = held.count;
      held.id = temp.id;
      held.count = temp.count;
    }

    updateAllSlotsUI();
  });
  ui.slotEl.addEventListener("contextmenu", (event) => event.preventDefault());
};

const ensureUI = () => {
  if (slotUIs.input) return;
  if (furnaceInputEl) slotUIs.input = decorateSlot(furnaceInputEl);
  if (furnaceFuelEl) slotUIs.fuel = decorateSlot(furnaceFuelEl);
  if (furnaceOutputEl) slotUIs.output = decorateSlot(furnaceOutputEl);

  bindSlot(slotUIs.input, () => state.activeFurnace?.input);
  bindSlot(slotUIs.fuel, () => state.activeFurnace?.fuel, { allowFuelOnly: true });
  bindSlot(slotUIs.output, () => state.activeFurnace?.output, { isOutput: true });
};

export const openFurnace = (x, y, z) => {
  ensureUI();
  state.activeFurnace = getFurnace(x, y, z);
  state.furnaceOpen = true;
  furnaceEl?.classList.remove("hidden");
  statusEl?.classList.add("hidden");
  crosshairEl?.classList.add("hidden");
  unlockPointer();
  updateFurnaceUI();
  updateAllSlotsUI();
};

export const closeFurnace = () => {
  if (!state.furnaceOpen) return;
  state.furnaceOpen = false;
  furnaceEl?.classList.add("hidden");
  statusEl?.classList.toggle("hidden", !state.debugHud);
  crosshairEl?.classList.remove("hidden");
  lockPointer();
};

export const updateFurnaceUI = () => {
  if (!state.furnaceOpen || !state.activeFurnace) return;
  const furnace = state.activeFurnace;
  updateSlotUI(slotUIs.input, furnace.input);
  updateSlotUI(slotUIs.fuel, furnace.fuel);
  updateSlotUI(slotUIs.output, furnace.output);
  const burnRatio = furnace.burnMax > 0 ? furnace.burnTime / furnace.burnMax : 0;
  if (furnaceFireFillEl) {
    furnaceFireFillEl.style.height = `${Math.max(0, Math.min(1, burnRatio)) * 100}%`;
  }
  const cookRatio = furnace.cookTotal > 0 ? furnace.cookTime / furnace.cookTotal : 0;
  if (furnaceProgressFillEl) {
    furnaceProgressFillEl.style.width = `${Math.max(0, Math.min(1, cookRatio)) * 100}%`;
  }
};

export const handleFurnaceMouseMove = (event) => {
  if (!state.furnaceOpen) return;
  if (!cursorItemFurnaceEl) return;
  cursorItemFurnaceEl.style.left = `${event.clientX + 6}px`;
  cursorItemFurnaceEl.style.top = `${event.clientY + 6}px`;
};

export const updateFurnaceCursor = () => {
  if (!cursorItemFurnaceEl) return;
  const held = state.heldItem;
  if (!held || slotIsEmpty(held)) {
    cursorItemFurnaceEl.classList.add("hidden");
    cursorItemFurnaceEl.style.backgroundImage = "none";
    cursorItemFurnaceEl.textContent = "";
    return;
  }
  const icon = itemDefs[held.id]?.icon;
  cursorItemFurnaceEl.classList.remove("hidden");
  cursorItemFurnaceEl.style.backgroundImage = icon ? `url(${icon})` : "none";
  cursorItemFurnaceEl.textContent = held.count > 1 ? String(held.count) : "";
};

export const quickCollectFurnaceOutput = () => {
  if (!state.activeFurnace) return;
  quickCollectOutput(state.activeFurnace);
  updateAllSlotsUI();
};
