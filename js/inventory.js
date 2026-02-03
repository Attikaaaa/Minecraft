import { clamp, CRAFT_SIZE, HOTBAR_SIZE, INVENTORY_COLS, INVENTORY_ROWS, TABLE_CRAFT_SIZE } from "./config.js";
import {
  craftGridEl,
  craftOutputEl,
  craftTableGridEl,
  craftTableHotbarEl,
  craftTableInventoryEl,
  craftTableOutputEl,
  armorGridEl,
  armorGridTableEl,
  furnaceInventoryEl,
  furnaceHotbarEl,
  chestInventoryEl,
  chestHotbarEl,
  cursorItemEl,
  cursorItemTableEl,
  craftingTableEl,
  crosshairEl,
  hotbarEl,
  inventoryEl,
  inventoryGridEl,
  inventoryHotbarEl,
  statusEl,
  itemNameEl,
} from "./dom.js";
import { itemDefs, maxStackFor } from "./items.js";
import { state } from "./state.js";
import { lockPointer, unlockPointer } from "./controls.js";

const slotUIs = {
  hotbar: [],
  inventory: [],
  craft: [],
  craftTable: [],
  armor: [],
};

const createSlotElement = (group, index) => {
  const slotEl = document.createElement("div");
  slotEl.className = "slot";
  slotEl.dataset.group = group;
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
  return { slotEl, iconEl, countEl, durabilityEl, durabilityFillEl };
};

const buildSlots = (container, group, count) => {
  container.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const ui = createSlotElement(group, i);
    slotUIs[group].push(ui);
    container.append(ui.slotEl);
  }
};

export const createSlot = (id = null, count = 0, durability = null) => ({
  id,
  count,
  durability,
});

export const hotbar = Array.from({ length: HOTBAR_SIZE }, () => createSlot());
export const inventory = Array.from({ length: INVENTORY_ROWS * INVENTORY_COLS }, () => createSlot());
export const craftSlots = Array.from({ length: CRAFT_SIZE }, () => createSlot());
export const tableCraftSlots = Array.from({ length: TABLE_CRAFT_SIZE }, () => createSlot());
export const armorSlots = Array.from({ length: 4 }, () => createSlot());

export const seedStartingItems = () => {
  hotbar[0] = createSlot("grass", 64);
  hotbar[1] = createSlot("dirt", 64);
  hotbar[2] = createSlot("stone", 64);
  hotbar[3] = createSlot("wood", 24);
  hotbar[4] = createSlot("leaves", 32);
  hotbar[5] = createSlot("sand", 48);
  hotbar[6] = createSlot("coal", 24);
  hotbar[7] = createSlot("water", 16);
  hotbar[8] = createSlot("plank", 16);
  inventory[0] = createSlot("apple", 6);
  inventory[1] = createSlot("cow_spawn_egg", 4);
  inventory[2] = createSlot("pig_spawn_egg", 4);
  inventory[3] = createSlot("sheep_spawn_egg", 4);
  inventory[4] = createSlot("chicken_spawn_egg", 4);
  inventory[5] = createSlot("torch", 16);
  inventory[6] = createSlot("seeds", 6);
};

seedStartingItems();

buildSlots(hotbarEl, "hotbar", HOTBAR_SIZE);
buildSlots(inventoryGridEl, "inventory", inventory.length);
buildSlots(inventoryHotbarEl, "hotbar", HOTBAR_SIZE);
if (furnaceInventoryEl) buildSlots(furnaceInventoryEl, "inventory", inventory.length);
if (furnaceHotbarEl) buildSlots(furnaceHotbarEl, "hotbar", HOTBAR_SIZE);
if (chestInventoryEl) buildSlots(chestInventoryEl, "inventory", inventory.length);
if (chestHotbarEl) buildSlots(chestHotbarEl, "hotbar", HOTBAR_SIZE);
if (armorGridEl) buildSlots(armorGridEl, "armor", armorSlots.length);
buildSlots(craftGridEl, "craft", craftSlots.length);
buildSlots(craftTableGridEl, "craftTable", TABLE_CRAFT_SIZE);
buildSlots(craftTableInventoryEl, "inventory", inventory.length);
buildSlots(craftTableHotbarEl, "hotbar", HOTBAR_SIZE);
if (armorGridTableEl) buildSlots(armorGridTableEl, "armor", armorSlots.length);

const craftOutputUI = (() => {
  const ui = createSlotElement("craftOutput", 0);
  ui.slotEl.dataset.context = "inventory";
  craftOutputEl.append(ui.slotEl);
  return ui;
})();

const craftTableOutputUI = (() => {
  const ui = createSlotElement("craftOutput", 0);
  ui.slotEl.dataset.context = "table";
  craftTableOutputEl.append(ui.slotEl);
  return ui;
})();

export const slotIsEmpty = (slot) => !slot || !slot.id || slot.count <= 0;

export const setSlot = (slot, id, count) => {
  slot.id = id;
  slot.count = count;
  slot.durability = slot.durability ?? null;
  if (id && itemDefs[id]?.durability != null && slot.durability == null) {
    slot.durability = itemDefs[id].durability;
  }
  if (!id || count <= 0) {
    slot.id = null;
    slot.count = 0;
    slot.durability = null;
  }
};

const copySlotData = (target, source) => {
  if (!source || !source.id || source.count <= 0) {
    setSlot(target, null, 0);
    return;
  }
  target.id = source.id;
  target.count = source.count;
  target.durability = source.durability ?? (itemDefs[source.id]?.durability ?? null);
};

const addItemToSlot = (slot, id, count) => {
  if (count <= 0) return 0;
  const maxStack = maxStackFor(id);
  if (slotIsEmpty(slot)) {
    const placed = Math.min(maxStack, count);
    setSlot(slot, id, placed);
    return count - placed;
  }
  if (slot.id !== id) return count;
  if (maxStack === 1) return count;
  const space = maxStack - slot.count;
  const placed = Math.min(space, count);
  slot.count += placed;
  return count - placed;
};

export const addItemToInventory = (id, count) => {
  let remaining = count;
  const slots = [...hotbar, ...inventory];
  for (const slot of slots) {
    if (remaining <= 0) break;
    if (slot.id === id) remaining = addItemToSlot(slot, id, remaining);
  }
  for (const slot of slots) {
    if (remaining <= 0) break;
    if (slotIsEmpty(slot)) remaining = addItemToSlot(slot, id, remaining);
  }
  return remaining;
};

export const getSelectedSlot = () => hotbar[state.selectedHotbar];
export const getSelectedItemId = () => {
  const slot = getSelectedSlot();
  return slot && slot.id ? slot.id : null;
};

export const canPlaceSelected = () => {
  const id = getSelectedItemId();
  if (!id) return false;
  return itemDefs[id]?.blockType != null;
};

export const applyToolDamage = () => {
  const slot = getSelectedSlot();
  if (!slot || slotIsEmpty(slot)) return;
  const def = itemDefs[slot.id];
  if (!def || def.durability == null) return;
  slot.durability = (slot.durability ?? def.durability) - 1;
  if (slot.durability <= 0) {
    setSlot(slot, null, 0);
  }
  updateAllSlotsUI();
};

const updateSlotUI = (ui, slot) => {
  if (!ui) return;
  if (slot && slot.id && slot.count > 0) {
    const icon = itemDefs[slot.id]?.icon;
    ui.iconEl.style.backgroundImage = icon ? `url(${icon})` : "none";
    ui.iconEl.style.display = "block";
    ui.countEl.textContent = slot.count > 1 ? String(slot.count) : "";
    const maxDurability = itemDefs[slot.id]?.durability ?? null;
    if (maxDurability && slot.durability != null) {
      const ratio = clamp(slot.durability / maxDurability, 0, 1);
      ui.durabilityEl.style.display = "block";
      ui.durabilityFillEl.style.width = `${ratio * 100}%`;
    } else {
      ui.durabilityEl.style.display = "none";
      ui.durabilityFillEl.style.width = "0%";
    }
  } else {
    ui.iconEl.style.backgroundImage = "none";
    ui.iconEl.style.display = "none";
    ui.countEl.textContent = "";
    ui.durabilityEl.style.display = "none";
    ui.durabilityFillEl.style.width = "0%";
  }
};

const updateHotbarSelectionUI = () => {
  slotUIs.hotbar.forEach((ui) => {
    const idx = Number(ui.slotEl.dataset.index);
    ui.slotEl.classList.toggle("selected", idx === state.selectedHotbar);
  });
  showItemName();
};

const updateCursorItemUI = () => {
  const activeCursorEl = state.craftingTableOpen ? cursorItemTableEl : cursorItemEl;
  const inactiveCursorEl = state.craftingTableOpen ? cursorItemEl : cursorItemTableEl;

  if (inactiveCursorEl) {
    inactiveCursorEl.classList.add("hidden");
    inactiveCursorEl.style.backgroundImage = "none";
    inactiveCursorEl.textContent = "";
  }

  if (!state.heldItem || slotIsEmpty(state.heldItem)) {
    activeCursorEl.classList.add("hidden");
    activeCursorEl.style.backgroundImage = "none";
    activeCursorEl.textContent = "";
    return;
  }
  const icon = itemDefs[state.heldItem.id]?.icon;
  activeCursorEl.classList.remove("hidden");
  activeCursorEl.style.backgroundImage = icon ? `url(${icon})` : "none";
  activeCursorEl.textContent = state.heldItem.count > 1 ? state.heldItem.count : "";
};

const shapedMatch = (grid, size, pattern, key) => {
  const patternHeight = pattern.length;
  const patternWidth = pattern[0].length;
  if (patternHeight > size || patternWidth > size) return null;

  for (let offsetY = 0; offsetY <= size - patternHeight; offsetY += 1) {
    for (let offsetX = 0; offsetX <= size - patternWidth; offsetX += 1) {
      let valid = true;
      const consumes = [];
      for (let i = 0; i < grid.length; i += 1) {
        const gx = i % size;
        const gy = Math.floor(i / size);
        const localX = gx - offsetX;
        const localY = gy - offsetY;
        const inPattern =
          localX >= 0 &&
          localX < patternWidth &&
          localY >= 0 &&
          localY < patternHeight;
        const symbol = inPattern ? pattern[localY][localX] : " ";
        const slot = grid[i];
        if (symbol === " ") {
          if (!slotIsEmpty(slot)) {
            valid = false;
            break;
          }
        } else {
          const expected = key[symbol];
          if (!expected || slot.id !== expected) {
            valid = false;
            break;
          }
          consumes.push({ index: i, count: 1 });
        }
      }
      if (valid) return consumes;
    }
  }
  return null;
};

const shapelessMatch = (grid, inputs) => {
  const counts = {};
  grid.forEach((slot) => {
    if (!slotIsEmpty(slot)) {
      counts[slot.id] = (counts[slot.id] || 0) + 1;
    }
  });
  const inputKeys = Object.keys(inputs);
  if (Object.keys(counts).length !== inputKeys.length) return null;
  for (const key of inputKeys) {
    if (counts[key] !== inputs[key]) return null;
  }
  const consumes = [];
  grid.forEach((slot, idx) => {
    if (!slotIsEmpty(slot)) {
      consumes.push({ index: idx, count: 1 });
    }
  });
  return consumes;
};

const recipes = [
  {
    id: "plank_from_wood",
    type: "shapeless",
    inputs: { wood: 1 },
    output: { id: "plank", count: 4 },
    size: [2, 3],
  },
  {
    id: "stick_from_plank",
    type: "shaped",
    pattern: ["P", "P"],
    key: { P: "plank" },
    output: { id: "stick", count: 4 },
    size: [2, 3],
  },
  {
    id: "crafting_table",
    type: "shaped",
    pattern: ["PP", "PP"],
    key: { P: "plank" },
    output: { id: "crafting_table", count: 1 },
    size: [2, 3],
  },
  {
    id: "wood_pickaxe",
    type: "shaped",
    pattern: ["PPP", " S ", " S "],
    key: { P: "plank", S: "stick" },
    output: { id: "wood_pickaxe", count: 1 },
    size: [3],
  },
  {
    id: "wood_axe_left",
    type: "shaped",
    pattern: ["PP ", "PS ", " S "],
    key: { P: "plank", S: "stick" },
    output: { id: "wood_axe", count: 1 },
    size: [3],
  },
  {
    id: "wood_axe_right",
    type: "shaped",
    pattern: [" PP", " SP", " S "],
    key: { P: "plank", S: "stick" },
    output: { id: "wood_axe", count: 1 },
    size: [3],
  },
  {
    id: "wood_shovel",
    type: "shaped",
    pattern: [" P ", " S ", " S "],
    key: { P: "plank", S: "stick" },
    output: { id: "wood_shovel", count: 1 },
    size: [3],
  },
  {
    id: "stone_pickaxe",
    type: "shaped",
    pattern: ["CCC", " S ", " S "],
    key: { C: "cobble", S: "stick" },
    output: { id: "stone_pickaxe", count: 1 },
    size: [3],
  },
  {
    id: "stone_axe_left",
    type: "shaped",
    pattern: ["CC ", "CS ", " S "],
    key: { C: "cobble", S: "stick" },
    output: { id: "stone_axe", count: 1 },
    size: [3],
  },
  {
    id: "stone_axe_right",
    type: "shaped",
    pattern: [" CC", " SC", " S "],
    key: { C: "cobble", S: "stick" },
    output: { id: "stone_axe", count: 1 },
    size: [3],
  },
  {
    id: "stone_shovel",
    type: "shaped",
    pattern: [" C ", " S ", " S "],
    key: { C: "cobble", S: "stick" },
    output: { id: "stone_shovel", count: 1 },
    size: [3],
  },
  {
    id: "furnace",
    type: "shaped",
    pattern: ["CCC", "C C", "CCC"],
    key: { C: "cobble" },
    output: { id: "furnace", count: 1 },
    size: [3],
  },
  {
    id: "chest",
    type: "shaped",
    pattern: ["PPP", "P P", "PPP"],
    key: { P: "plank" },
    output: { id: "chest", count: 1 },
    size: [3],
  },
  {
    id: "door",
    type: "shaped",
    pattern: ["PP", "PP", "PP"],
    key: { P: "plank" },
    output: { id: "door", count: 1 },
    size: [3],
  },
  {
    id: "ladder",
    type: "shaped",
    pattern: ["S S", "SSS", "S S"],
    key: { S: "stick" },
    output: { id: "ladder", count: 3 },
    size: [3],
  },
  {
    id: "slab",
    type: "shaped",
    pattern: ["PPP"],
    key: { P: "plank" },
    output: { id: "slab", count: 6 },
    size: [3],
  },
  {
    id: "stair",
    type: "shaped",
    pattern: ["P  ", "PP ", "PPP"],
    key: { P: "plank" },
    output: { id: "stair", count: 4 },
    size: [3],
  },
  {
    id: "bed",
    type: "shaped",
    pattern: ["WWW", "PPP"],
    key: { W: "wool", P: "plank" },
    output: { id: "bed", count: 1 },
    size: [3],
  },
  {
    id: "wood_sword",
    type: "shaped",
    pattern: [" P ", " P ", " S "],
    key: { P: "plank", S: "stick" },
    output: { id: "wood_sword", count: 1 },
    size: [3],
  },
  {
    id: "stone_sword",
    type: "shaped",
    pattern: [" C ", " C ", " S "],
    key: { C: "cobble", S: "stick" },
    output: { id: "stone_sword", count: 1 },
    size: [3],
  },
  {
    id: "iron_sword",
    type: "shaped",
    pattern: [" I ", " I ", " S "],
    key: { I: "iron_ingot", S: "stick" },
    output: { id: "iron_sword", count: 1 },
    size: [3],
  },
  {
    id: "wood_hoe",
    type: "shaped",
    pattern: ["PP ", " S ", " S "],
    key: { P: "plank", S: "stick" },
    output: { id: "wood_hoe", count: 1 },
    size: [3],
  },
  {
    id: "stone_hoe",
    type: "shaped",
    pattern: ["CC ", " S ", " S "],
    key: { C: "cobble", S: "stick" },
    output: { id: "stone_hoe", count: 1 },
    size: [3],
  },
  {
    id: "iron_hoe",
    type: "shaped",
    pattern: ["II ", " S ", " S "],
    key: { I: "iron_ingot", S: "stick" },
    output: { id: "iron_hoe", count: 1 },
    size: [3],
  },
  {
    id: "iron_pickaxe",
    type: "shaped",
    pattern: ["III", " S ", " S "],
    key: { I: "iron_ingot", S: "stick" },
    output: { id: "iron_pickaxe", count: 1 },
    size: [3],
  },
  {
    id: "iron_axe_left",
    type: "shaped",
    pattern: ["II ", "IS ", " S "],
    key: { I: "iron_ingot", S: "stick" },
    output: { id: "iron_axe", count: 1 },
    size: [3],
  },
  {
    id: "iron_axe_right",
    type: "shaped",
    pattern: [" II", " SI", " S "],
    key: { I: "iron_ingot", S: "stick" },
    output: { id: "iron_axe", count: 1 },
    size: [3],
  },
  {
    id: "iron_shovel",
    type: "shaped",
    pattern: [" I ", " S ", " S "],
    key: { I: "iron_ingot", S: "stick" },
    output: { id: "iron_shovel", count: 1 },
    size: [3],
  },
  {
    id: "iron_helmet",
    type: "shaped",
    pattern: ["III", "I I"],
    key: { I: "iron_ingot" },
    output: { id: "iron_helmet", count: 1 },
    size: [3],
  },
  {
    id: "iron_chestplate",
    type: "shaped",
    pattern: ["I I", "III", "III"],
    key: { I: "iron_ingot" },
    output: { id: "iron_chestplate", count: 1 },
    size: [3],
  },
  {
    id: "iron_leggings",
    type: "shaped",
    pattern: ["III", "I I", "I I"],
    key: { I: "iron_ingot" },
    output: { id: "iron_leggings", count: 1 },
    size: [3],
  },
  {
    id: "iron_boots",
    type: "shaped",
    pattern: ["I I", "I I"],
    key: { I: "iron_ingot" },
    output: { id: "iron_boots", count: 1 },
    size: [3],
  },
  {
    id: "bread",
    type: "shaped",
    pattern: ["WWW"],
    key: { W: "wheat" },
    output: { id: "bread", count: 1 },
    size: [3],
  },
];

const craftContexts = {
  inventory: {
    slots: craftSlots,
    size: 2,
    outputUI: craftOutputUI,
    output: null,
  },
  table: {
    slots: tableCraftSlots,
    size: 3,
    outputUI: craftTableOutputUI,
    output: null,
  },
};

const getCraftOutput = (slots, size) => {
  for (const recipe of recipes) {
    if (!recipe.size.includes(size)) continue;
    let consumes = null;
    if (recipe.type === "shapeless") {
      consumes = shapelessMatch(slots, recipe.inputs);
    } else if (recipe.type === "shaped") {
      consumes = shapedMatch(slots, size, recipe.pattern, recipe.key);
    }
    if (consumes) {
      return { output: recipe.output, consumes };
    }
  }
  return null;
};

const updateCraftOutput = (contextKey) => {
  const context = craftContexts[contextKey];
  if (!context) return;
  context.output = getCraftOutput(context.slots, context.size);
  if (context.output) {
    updateSlotUI(context.outputUI, context.output.output);
  } else {
    updateSlotUI(context.outputUI, null);
  }
};

export const clearHeldItem = () => {
  state.heldItem = null;
};

export const ensureHeldItem = () => {
  if (!state.heldItem) state.heldItem = createSlot();
  return state.heldItem;
};

const handleSlotInteraction = (slot, isRightClick, group = null, index = null) => {
  const held = ensureHeldItem();
  const isArmorGroup = group === "armor";
  if (isArmorGroup && index == null) return;
  if (slotIsEmpty(held)) {
    if (slotIsEmpty(slot)) return;
    if (isRightClick) {
      const half = Math.ceil(slot.count / 2);
      setSlot(held, slot.id, half);
      held.durability = slot.durability;
      slot.count -= half;
      if (slot.count <= 0) setSlot(slot, null, 0);
    } else {
      copySlotData(held, slot);
      setSlot(slot, null, 0);
    }
    return;
  }

  if (isArmorGroup && !canPlaceInArmorSlot(index, held.id)) {
    return;
  }

  if (slotIsEmpty(slot)) {
    if (isRightClick) {
      setSlot(slot, held.id, 1);
      slot.durability = held.durability;
      held.count -= 1;
      if (held.count <= 0) clearHeldItem();
    } else {
      copySlotData(slot, held);
      clearHeldItem();
    }
    return;
  }

  if (slot.id === held.id) {
    if (slot.count >= maxStackFor(slot.id)) return;
    if (isRightClick) {
      slot.count += 1;
      slot.durability = held.durability;
      held.count -= 1;
      if (held.count <= 0) clearHeldItem();
    } else {
      const remaining = addItemToSlot(slot, held.id, held.count);
      if (remaining <= 0) clearHeldItem();
      else held.count = remaining;
    }
    return;
  }

  if (!isRightClick) {
    const temp = { id: slot.id, count: slot.count, durability: slot.durability };
    copySlotData(slot, held);
    copySlotData(held, temp);
  }
};

const handleCraftOutputClick = (contextKey) => {
  const context = craftContexts[contextKey];
  if (!context || !context.output) return;
  const held = ensureHeldItem();
  const outId = context.output.output.id;
  const outCount = context.output.output.count;
  if (!slotIsEmpty(held) && held.id !== outId) return;

  const maxStack = maxStackFor(outId);
  const availableSpace = slotIsEmpty(held) ? maxStack : maxStack - held.count;
  if (availableSpace < outCount) return;

  if (slotIsEmpty(held)) {
    setSlot(held, outId, outCount);
  } else {
    held.count += outCount;
  }

  context.output.consumes.forEach((consume) => {
    const slot = context.slots[consume.index];
    slot.count -= consume.count;
    if (slot.count <= 0) setSlot(slot, null, 0);
  });

  updateCraftOutput(contextKey);
};

const getSlotArrayForGroup = (group) => {
  if (group === "hotbar") return hotbar;
  if (group === "inventory") return inventory;
  if (group === "craft") return craftSlots;
  if (group === "craftTable") return tableCraftSlots;
  if (group === "armor") return armorSlots;
  return null;
};

const armorOrder = ["head", "chest", "legs", "feet"];

const canPlaceInArmorSlot = (index, itemId) => {
  const def = itemDefs[itemId];
  if (!def || !def.armor) return false;
  const expected = armorOrder[index];
  return def.armor.slot === expected;
};

const handleSlotMouseDown = (event) => {
  if (!state.inventoryOpen && !state.craftingTableOpen) return;
  event.preventDefault();
  const group = event.currentTarget.dataset.group;
  const index = Number(event.currentTarget.dataset.index);
  const isRightClick = event.button === 2;

  if (group === "craftOutput") {
    const context = event.currentTarget.dataset.context || "inventory";
    handleCraftOutputClick(context);
    updateAllSlotsUI();
    return;
  }

  const slots = getSlotArrayForGroup(group);
  if (!slots || Number.isNaN(index)) return;
  handleSlotInteraction(slots[index], isRightClick, group, index);
  updateAllSlotsUI();

  if (!isRightClick && state.heldItem && !slotIsEmpty(state.heldItem)) {
    state.dragging = true;
    state.dragMoved = false;
    state.dragButton = event.button;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
  } else {
    state.dragging = false;
    state.dragMoved = false;
  }
};

const attachSlotListeners = (ui) => {
  ui.slotEl.addEventListener("mousedown", handleSlotMouseDown);
  ui.slotEl.addEventListener("contextmenu", (event) => event.preventDefault());
};

slotUIs.hotbar.forEach(attachSlotListeners);
slotUIs.inventory.forEach(attachSlotListeners);
slotUIs.craft.forEach(attachSlotListeners);
slotUIs.craftTable.forEach(attachSlotListeners);
attachSlotListeners(craftOutputUI);
attachSlotListeners(craftTableOutputUI);

window.addEventListener("mousemove", (event) => {
  if (!state.inventoryOpen && !state.craftingTableOpen) return;
  const activeCursorEl = state.craftingTableOpen ? cursorItemTableEl : cursorItemEl;
  activeCursorEl.style.left = `${event.clientX + 6}px`;
  activeCursorEl.style.top = `${event.clientY + 6}px`;

  if (state.dragging && !state.dragMoved) {
    const dx = event.clientX - state.dragStartX;
    const dy = event.clientY - state.dragStartY;
    if (Math.hypot(dx, dy) > 4) {
      state.dragMoved = true;
    }
  }
});

document.addEventListener("mouseup", (event) => {
  if (!state.dragging) return;
  if (!state.inventoryOpen && !state.craftingTableOpen) {
    state.dragging = false;
    state.dragMoved = false;
    return;
  }
  const moved = state.dragMoved;
  state.dragging = false;
  state.dragMoved = false;

  if (!moved) return;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const slotEl = target?.closest?.(".slot");
  if (!slotEl) return;

  const group = slotEl.dataset.group;
  if (group === "craftOutput") return;
  const index = Number(slotEl.dataset.index);
  const slots = getSlotArrayForGroup(group);
  if (!slots || Number.isNaN(index)) return;
  handleSlotInteraction(slots[index], state.dragButton === 2, group, index);
  updateAllSlotsUI();
});

export const updateAllSlotsUI = () => {
  slotUIs.hotbar.forEach((ui) => {
    const idx = Number(ui.slotEl.dataset.index);
    updateSlotUI(ui, hotbar[idx]);
  });
  slotUIs.inventory.forEach((ui) => {
    const idx = Number(ui.slotEl.dataset.index);
    updateSlotUI(ui, inventory[idx]);
  });
  slotUIs.craft.forEach((ui) => {
    const idx = Number(ui.slotEl.dataset.index);
    updateSlotUI(ui, craftSlots[idx]);
  });
  slotUIs.craftTable.forEach((ui) => {
    const idx = Number(ui.slotEl.dataset.index);
    updateSlotUI(ui, tableCraftSlots[idx]);
  });
  slotUIs.armor.forEach((ui) => {
    const idx = Number(ui.slotEl.dataset.index);
    updateSlotUI(ui, armorSlots[idx]);
  });
  updateCraftOutput("inventory");
  updateCraftOutput("table");
  updateHotbarSelectionUI();
  updateCursorItemUI();
};

export const openInventory = () => {
  if (state.inventoryOpen) return;
  if (state.craftingTableOpen) closeCraftingTable();
  state.inventoryOpen = true;
  inventoryEl.classList.remove("hidden");
  statusEl.classList.add("hidden");
  crosshairEl.classList.add("hidden");
  unlockPointer();
  updateAllSlotsUI();
};

export const closeInventory = () => {
  if (!state.inventoryOpen) return;
  state.dragging = false;
  state.dragMoved = false;
  if (state.heldItem && !slotIsEmpty(state.heldItem)) {
    addItemToInventory(state.heldItem.id, state.heldItem.count);
    clearHeldItem();
  }
  state.inventoryOpen = false;
  inventoryEl.classList.add("hidden");
  statusEl.classList.toggle("hidden", !state.debugHud);
  crosshairEl.classList.remove("hidden");
  lockPointer();
  updateAllSlotsUI();
};

export const openCraftingTable = () => {
  if (state.craftingTableOpen) return;
  if (state.inventoryOpen) closeInventory();
  state.craftingTableOpen = true;
  craftingTableEl.classList.remove("hidden");
  statusEl.classList.add("hidden");
  crosshairEl.classList.add("hidden");
  unlockPointer();
  updateAllSlotsUI();
};

export const closeCraftingTable = () => {
  if (!state.craftingTableOpen) return;
  state.dragging = false;
  state.dragMoved = false;
  if (state.heldItem && !slotIsEmpty(state.heldItem)) {
    addItemToInventory(state.heldItem.id, state.heldItem.count);
    clearHeldItem();
  }
  state.craftingTableOpen = false;
  craftingTableEl.classList.add("hidden");
  statusEl.classList.toggle("hidden", !state.debugHud);
  crosshairEl.classList.remove("hidden");
  lockPointer();
  updateAllSlotsUI();
};

let itemNameTimeout = null;

export const showItemName = () => {
  if (!itemNameEl) return;
  
  const slot = getSelectedSlot();
  if (!slot || slotIsEmpty(slot)) {
    itemNameEl.style.opacity = "0";
    if (itemNameTimeout) {
      clearTimeout(itemNameTimeout);
      itemNameTimeout = null;
    }
    return;
  }
  
  const itemDef = itemDefs[slot.id];
  if (!itemDef) {
    itemNameEl.style.opacity = "0";
    return;
  }
  
  itemNameEl.textContent = itemDef.name || slot.id;
  itemNameEl.style.opacity = "1";
  
  if (itemNameTimeout) {
    clearTimeout(itemNameTimeout);
  }
  
  // 3 másodperc után kezd elhalványodni
  itemNameTimeout = setTimeout(() => {
    itemNameEl.style.opacity = "0";
  }, 3000);
};

export const getArmorValue = () => {
  let total = 0;
  for (const slot of armorSlots) {
    if (!slot || slotIsEmpty(slot)) continue;
    const def = itemDefs[slot.id];
    if (def?.armor?.defense) total += def.armor.defense;
  }
  return total;
};

export const getWeaponDamage = () => {
  const slot = getSelectedSlot();
  if (!slot || slotIsEmpty(slot)) return 2;
  const def = itemDefs[slot.id];
  if (def?.weapon?.damage) return def.weapon.damage;
  return 2;
};
