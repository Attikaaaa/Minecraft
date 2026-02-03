import { blockIcons, makeIconCanvas } from "./textures.js";

const stickIcon = makeIconCanvas((ctx) => {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 16, 16);
  ctx.clearRect(0, 0, 16, 16);
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(7, 2, 2, 12);
  ctx.fillStyle = "#a46b35";
  ctx.fillRect(8, 2, 1, 12);
  ctx.fillStyle = "#6f4420";
  ctx.fillRect(7, 2, 1, 12);
});

const appleIcon = makeIconCanvas((ctx) => {
  ctx.clearRect(0, 0, 16, 16);
  ctx.fillStyle = "#7a3b1a";
  ctx.fillRect(7, 1, 2, 3);
  ctx.fillStyle = "#2f8f4e";
  ctx.fillRect(9, 2, 3, 2);
  ctx.fillStyle = "#d6453d";
  ctx.fillRect(4, 4, 8, 9);
  ctx.fillStyle = "#b73630";
  ctx.fillRect(5, 6, 6, 6);
  ctx.fillStyle = "#e05b52";
  ctx.fillRect(6, 5, 2, 2);
});

const makeToolIcon = (type, headColor, handleColor) =>
  makeIconCanvas((ctx) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = handleColor;
    for (let i = 0; i < 6; i += 1) {
      ctx.fillRect(8 - i, 12 - i, 2, 2);
    }
    ctx.fillStyle = headColor;
    if (type === "pickaxe") {
      ctx.fillRect(2, 2, 12, 2);
      ctx.fillRect(6, 4, 4, 2);
    } else if (type === "axe") {
      ctx.fillRect(4, 2, 6, 2);
      ctx.fillRect(2, 4, 6, 2);
      ctx.fillRect(4, 6, 2, 2);
    } else if (type === "shovel") {
      ctx.fillRect(7, 2, 2, 4);
      ctx.fillRect(6, 6, 4, 3);
    }
  });

const makeEggIcon = (base, spots) =>
  makeIconCanvas((ctx) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(8, 9, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spots;
    ctx.fillRect(5, 6, 2, 2);
    ctx.fillRect(9, 10, 2, 2);
  });

const makeDropIcon = (base, detail) =>
  makeIconCanvas((ctx) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = base;
    ctx.fillRect(3, 4, 10, 9);
    ctx.fillStyle = detail;
    ctx.fillRect(4, 6, 6, 4);
  });

const toolIcons = {
  wood_pickaxe: makeToolIcon("pickaxe", "#d8b47a", "#8b5a2b").toDataURL(),
  wood_axe: makeToolIcon("axe", "#d8b47a", "#8b5a2b").toDataURL(),
  wood_shovel: makeToolIcon("shovel", "#d8b47a", "#8b5a2b").toDataURL(),
  stone_pickaxe: makeToolIcon("pickaxe", "#a0a5ad", "#6b7280").toDataURL(),
  stone_axe: makeToolIcon("axe", "#a0a5ad", "#6b7280").toDataURL(),
  stone_shovel: makeToolIcon("shovel", "#a0a5ad", "#6b7280").toDataURL(),
};

const dropIcons = {
  beef_raw: makeDropIcon("#a34b3f", "#7e2f28").toDataURL(),
  pork_raw: makeDropIcon("#d87a7a", "#b85e5e").toDataURL(),
  chicken_raw: makeDropIcon("#f1d8b7", "#c9a27a").toDataURL(),
  leather: makeDropIcon("#8b5a2b", "#6f4420").toDataURL(),
  feather: makeDropIcon("#f2f2f2", "#cfcfcf").toDataURL(),
  wool: makeDropIcon("#f5f5f5", "#d9d9d9").toDataURL(),
};

const eggIcons = {
  cow_spawn_egg: makeEggIcon("#8b5a2b", "#d8d0c2").toDataURL(),
  pig_spawn_egg: makeEggIcon("#d88b9b", "#f0b2bd").toDataURL(),
  sheep_spawn_egg: makeEggIcon("#f0f0f0", "#cfcfcf").toDataURL(),
  chicken_spawn_egg: makeEggIcon("#f6f6f6", "#f2d36b").toDataURL(),
};

export const itemDefs = {
  grass: { name: "Fű", blockType: 1, icon: blockIcons[1], maxStack: 64 },
  dirt: { name: "Föld", blockType: 2, icon: blockIcons[2], maxStack: 64 },
  stone: { name: "Kő", blockType: 3, icon: blockIcons[3], maxStack: 64 },
  wood: { name: "Fa", blockType: 4, icon: blockIcons[4], maxStack: 64 },
  leaves: { name: "Lomb", blockType: 5, icon: blockIcons[5], maxStack: 64 },
  sand: { name: "Homok", blockType: 6, icon: blockIcons[6], maxStack: 64 },
  coal: { name: "Szénérc", blockType: 7, icon: blockIcons[7], maxStack: 64 },
  water: { name: "Víz", blockType: 8, icon: blockIcons[8], maxStack: 64 },
  plank: { name: "Deszka", blockType: 10, icon: blockIcons[10], maxStack: 64 },
  stick: { name: "Pálca", blockType: null, icon: stickIcon.toDataURL(), maxStack: 64 },
  apple: { name: "Alma", blockType: null, icon: appleIcon.toDataURL(), maxStack: 64, food: 4 },
  crafting_table: { name: "Munkapad", blockType: 9, icon: blockIcons[9], maxStack: 64 },
  cobble: { name: "Kockakő", blockType: 11, icon: blockIcons[11], maxStack: 64 },
  iron_ore: { name: "Vasérc", blockType: 12, icon: blockIcons[12], maxStack: 64 },
  gold_ore: { name: "Aranyérc", blockType: 13, icon: blockIcons[13], maxStack: 64 },
  diamond: { name: "Gyémánt", blockType: null, icon: blockIcons[14], maxStack: 64 },
  redstone: { name: "Redstone", blockType: null, icon: blockIcons[15], maxStack: 64 },
  lapis: { name: "Lapis", blockType: null, icon: blockIcons[16], maxStack: 64 },
  emerald: { name: "Smaragd", blockType: null, icon: blockIcons[17], maxStack: 64 },
  coal_item: { name: "Szén", blockType: null, icon: blockIcons[7], maxStack: 64 },
  torch: { name: "Fáklya", blockType: 18, icon: blockIcons[18], maxStack: 64 },
  wood_pickaxe: {
    name: "Fa csákány",
    blockType: null,
    icon: toolIcons.wood_pickaxe,
    maxStack: 1,
    durability: 59,
    tool: { type: "pickaxe", speed: 2, tier: 1 },
  },
  wood_axe: {
    name: "Fa fejsze",
    blockType: null,
    icon: toolIcons.wood_axe,
    maxStack: 1,
    durability: 59,
    tool: { type: "axe", speed: 2, tier: 1 },
  },
  wood_shovel: {
    name: "Fa lapát",
    blockType: null,
    icon: toolIcons.wood_shovel,
    maxStack: 1,
    durability: 59,
    tool: { type: "shovel", speed: 2, tier: 1 },
  },
  stone_pickaxe: {
    name: "Kő csákány",
    blockType: null,
    icon: toolIcons.stone_pickaxe,
    maxStack: 1,
    durability: 131,
    tool: { type: "pickaxe", speed: 4, tier: 2 },
  },
  stone_axe: {
    name: "Kő fejsze",
    blockType: null,
    icon: toolIcons.stone_axe,
    maxStack: 1,
    durability: 131,
    tool: { type: "axe", speed: 4, tier: 2 },
  },
  stone_shovel: {
    name: "Kő lapát",
    blockType: null,
    icon: toolIcons.stone_shovel,
    maxStack: 1,
    durability: 131,
    tool: { type: "shovel", speed: 4, tier: 2 },
  },
  beef_raw: { name: "Nyers marhahús", blockType: null, icon: dropIcons.beef_raw, maxStack: 64, food: 3 },
  pork_raw: { name: "Nyers sertéshús", blockType: null, icon: dropIcons.pork_raw, maxStack: 64, food: 3 },
  chicken_raw: { name: "Nyers csirkehús", blockType: null, icon: dropIcons.chicken_raw, maxStack: 64, food: 2 },
  leather: { name: "Bőr", blockType: null, icon: dropIcons.leather, maxStack: 64 },
  feather: { name: "Toll", blockType: null, icon: dropIcons.feather, maxStack: 64 },
  wool: { name: "Gyapjú", blockType: null, icon: dropIcons.wool, maxStack: 64 },
  cow_spawn_egg: { name: "Tehén idéző", blockType: null, icon: eggIcons.cow_spawn_egg, maxStack: 64, spawnMob: "cow" },
  pig_spawn_egg: { name: "Malac idéző", blockType: null, icon: eggIcons.pig_spawn_egg, maxStack: 64, spawnMob: "pig" },
  sheep_spawn_egg: { name: "Bárány idéző", blockType: null, icon: eggIcons.sheep_spawn_egg, maxStack: 64, spawnMob: "sheep" },
  chicken_spawn_egg: { name: "Csirke idéző", blockType: null, icon: eggIcons.chicken_spawn_egg, maxStack: 64, spawnMob: "chicken" },
};

const setItemIcon = (id, icon) => {
  if (!itemDefs[id]) return;
  if (!icon) return;
  itemDefs[id].icon = icon;
};

export const refreshItemIcons = (icons = blockIcons) => {
  setItemIcon("grass", icons[1]);
  setItemIcon("dirt", icons[2]);
  setItemIcon("stone", icons[3]);
  setItemIcon("wood", icons[4]);
  setItemIcon("leaves", icons[5]);
  setItemIcon("sand", icons[6]);
  setItemIcon("coal", icons[7]);
  setItemIcon("water", icons[8]);
  setItemIcon("crafting_table", icons[9]);
  setItemIcon("plank", icons[10]);
  setItemIcon("cobble", icons[11]);
  setItemIcon("iron_ore", icons[12]);
  setItemIcon("gold_ore", icons[13]);
  setItemIcon("diamond", icons[14]);
  setItemIcon("redstone", icons[15]);
  setItemIcon("lapis", icons[16]);
  setItemIcon("emerald", icons[17]);
  setItemIcon("coal_item", icons[7]);
  setItemIcon("torch", icons[18]);
  return itemDefs;
};

export const blockTypeToItem = {
  1: "grass",
  2: "dirt",
  3: "stone",
  4: "wood",
  5: "leaves",
  6: "sand",
  7: "coal",
  8: "water",
  9: "crafting_table",
  10: "plank",
  11: "cobble",
  12: "iron_ore",
  13: "gold_ore",
  18: "torch",
};

export const blockHardness = {
  1: 0.6,
  2: 0.5,
  3: 1.5,
  4: 2.0,
  5: 0.2,
  6: 0.5,
  7: 3.0,
  8: Infinity,
  9: 2.5,
  10: 2.0,
  11: 2.0,
  12: 3.0,
  13: 3.0,
  14: 3.0,
  15: 3.0,
  16: 3.0,
  17: 3.0,
  18: 0.1,
  19: Infinity,
};

export const blockEffectiveTool = {
  1: "shovel",
  2: "shovel",
  3: "pickaxe",
  4: "axe",
  6: "shovel",
  7: "pickaxe",
  9: "axe",
  10: "axe",
  11: "pickaxe",
  12: "pickaxe",
  13: "pickaxe",
  14: "pickaxe",
  15: "pickaxe",
  16: "pickaxe",
  17: "pickaxe",
};

export const blockHarvestTool = {
  3: "pickaxe",
  7: "pickaxe",
  11: "pickaxe",
  12: "pickaxe",
  13: "pickaxe",
  14: "pickaxe",
  15: "pickaxe",
  16: "pickaxe",
  17: "pickaxe",
};

export const blockHarvestLevel = {
  3: 1, // stone -> any pickaxe
  7: 1, // coal ore -> any pickaxe
  11: 1, // cobble -> any pickaxe
  12: 2, // iron ore -> stone+
  13: 3, // gold ore -> iron+
  14: 3, // diamond ore -> iron+
  15: 3, // redstone ore -> iron+
  16: 2, // lapis ore -> stone+
  17: 3, // emerald ore -> iron+
};

export const maxStackFor = (id) => itemDefs[id]?.maxStack ?? 64;

export const getBreakTimeSeconds = (blockType, toolId) => {
  const hardness = blockHardness[blockType] ?? 1;
  if (!Number.isFinite(hardness) || hardness <= 0) return Infinity;
  const tool = itemDefs[toolId]?.tool ?? null;
  const harvestTool = blockHarvestTool[blockType];
  const requiredLevel = blockHarvestLevel[blockType] ?? 0;
  const toolTier = tool?.tier ?? 0;
  const canHarvest = !harvestTool || (tool && tool.type === harvestTool && toolTier >= requiredLevel);
  const base = canHarvest ? hardness * 1.5 : hardness * 5;
  const effectiveTool = blockEffectiveTool[blockType];
  const speed = canHarvest && tool && effectiveTool && tool.type === effectiveTool ? tool.speed ?? 1 : 1;
  const raw = base / speed;
  return Math.ceil(raw * 20) / 20;
};

export const getDropForBlock = (blockType, toolId) => {
  if (blockType === 8) return null;
  if (blockType === 19) return null;
  const tool = itemDefs[toolId]?.tool;
  const requiredTool = blockHarvestTool[blockType];
  const requiredLevel = blockHarvestLevel[blockType] ?? 0;
  const toolTier = tool?.tier ?? 0;
  const correctTool = requiredTool ? tool?.type === requiredTool : true;
  const canHarvest = !requiredTool || (correctTool && toolTier >= requiredLevel);
  if (!canHarvest) return null;

  if (blockType === 3) return { id: "cobble", count: 1 };
  if (blockType === 7) return { id: "coal_item", count: 1 };
  if (blockType === 12) return { id: "iron_ore", count: 1 };
  if (blockType === 13) return { id: "gold_ore", count: 1 };
  if (blockType === 14) return { id: "diamond", count: 1 };
  if (blockType === 15) return { id: "redstone", count: 4 };
  if (blockType === 16) return { id: "lapis", count: 4 };
  if (blockType === 17) return { id: "emerald", count: 1 };

  const itemId = blockTypeToItem[blockType];
  return itemId ? { id: itemId, count: 1 } : null;
};
