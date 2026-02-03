import { blockDefs } from "./textures.js";

export const blockInfo = {
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  wood: 4,
  leaves: 5,
  sand: 6,
  coal_ore: 7,
  water: 8,
  crafting_table: 9,
  planks: 10,
  cobble: 11,
  iron_ore: 12,
  gold_ore: 13,
  diamond_ore: 14,
  redstone_ore: 15,
  lapis_ore: 16,
  emerald_ore: 17,
  torch: 18,
  bedrock: 19,
  furnace: 20,
  chest: 21,
  door_closed: 22,
  door_open: 23,
  ladder: 24,
  farmland: 25,
  wheat_0: 26,
  wheat_1: 27,
  wheat_2: 28,
  wheat_3: 29,
  glass: 30,
  slab: 31,
  stair: 32,
  bed: 33,
};

export const setBlockDef = (id, def) => {
  if (!blockDefs[id]) {
    blockDefs[id] = { ...def };
  } else {
    Object.assign(blockDefs[id], def);
  }
};
