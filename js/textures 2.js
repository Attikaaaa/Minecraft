import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { hash3 } from "./noise.js";

// Textúra betöltése fájlból Promise-szal
const loadTextureFromFile = (path) => {
  return new Promise((resolve) => {
    const texture = new THREE.TextureLoader().load(
      path,
      () => resolve(texture),
      undefined,
      (err) => {
        console.warn(`Textúra nem található: ${path}, fallback használata`);
        const fallback = new THREE.Texture();
        fallback.image = document.createElement('canvas');
        fallback.image.width = 16;
        fallback.image.height = 16;
        const ctx = fallback.image.getContext('2d');
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, 16, 16);
        fallback.needsUpdate = true;
        fallback.magFilter = THREE.NearestFilter;
        fallback.minFilter = THREE.NearestFilter;
        fallback.generateMipmaps = false;
        fallback.colorSpace = THREE.SRGBColorSpace;
        fallback.wrapS = THREE.RepeatWrapping;
        fallback.wrapT = THREE.RepeatWrapping;
        fallback.flipY = false;
        resolve(fallback);
      }
    );
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.flipY = false; // Minecraft textúrákhoz false kell!
  });
};

const makeMat = (texture, opts = {}) =>
  new THREE.MeshLambertMaterial({ map: texture, ...opts });

// Textúrák
let texturesLoaded = false;
let textures = {};

export const loadAllTextures = async () => {
  if (texturesLoaded) return;
  
  console.log("Textúrák betöltése...");
  
  const textureList = await Promise.all([
    loadTextureFromFile('textures/grass_block_top.png'),
    loadTextureFromFile('textures/grass_block_side.png', true),
    loadTextureFromFile('textures/dirt.png'),
    loadTextureFromFile('textures/stone.png'),
    loadTextureFromFile('textures/oak_log.png'),
    loadTextureFromFile('textures/oak_log_top.png'),
    loadTextureFromFile('textures/oak_leaves.png'),
    loadTextureFromFile('textures/sand.png'),
    loadTextureFromFile('textures/coal_ore.png'),
    loadTextureFromFile('textures/cobblestone.png'),
    loadTextureFromFile('textures/oak_planks.png'),
    loadTextureFromFile('textures/water_still.png'),
    loadTextureFromFile('textures/crafting_table_top.png'),
    loadTextureFromFile('textures/crafting_table_side.png'),
    loadTextureFromFile('textures/crafting_table_front.png'),
    loadTextureFromFile('textures/iron_ore.png'),
    loadTextureFromFile('textures/gold_ore.png'),
    loadTextureFromFile('textures/diamond_ore.png'),
    loadTextureFromFile('textures/redstone_ore.png'),
    loadTextureFromFile('textures/lapis_ore.png'),
    loadTextureFromFile('textures/emerald_ore.png'),
    loadTextureFromFile('textures/torch.png'),
    loadTextureFromFile('textures/block/bedrock.png'),
  ]);
  
  textures = {
    grassTop: textureList[0],
    grassSide: textureList[1],
    dirt: textureList[2],
    stone: textureList[3],
    oakLogSide: textureList[4],
    oakLogTop: textureList[5],
    oakLeaves: textureList[6],
    sand: textureList[7],
    coalOre: textureList[8],
    cobblestone: textureList[9],
    oakPlanks: textureList[10],
    water: textureList[11],
    craftingTableTop: textureList[12],
    craftingTableSide: textureList[13],
    craftingTableFront: textureList[14],
    ironOre: textureList[15],
    goldOre: textureList[16],
    diamondOre: textureList[17],
    redstoneOre: textureList[18],
    lapisOre: textureList[19],
    emeraldOre: textureList[20],
    torch: textureList[21],
    bedrock: textureList[22],
  };
  
  texturesLoaded = true;
  console.log("Textúrák betöltve!");
};

export const getBlockMaterials = () => {
  if (!texturesLoaded) {
    throw new Error("Textúrák még nem töltődtek be!");
  }
  
  const t = textures;
  
  // Three.js material sorrend: [+X(jobb), -X(bal), +Y(felső), -Y(alsó), +Z(elülső), -Z(hátsó)]
  
  return {
    grassMaterials: [[
      makeMat(t.grassSide), makeMat(t.grassSide), makeMat(t.grassTop),
      makeMat(t.dirt), makeMat(t.grassSide), makeMat(t.grassSide)
    ]],
    dirtMaterials: [[
      makeMat(t.dirt), makeMat(t.dirt), makeMat(t.dirt),
      makeMat(t.dirt), makeMat(t.dirt), makeMat(t.dirt)
    ]],
    stoneMaterials: [[
      makeMat(t.stone), makeMat(t.stone), makeMat(t.stone),
      makeMat(t.stone), makeMat(t.stone), makeMat(t.stone)
    ]],
    woodMaterials: [[
      makeMat(t.oakLogSide), makeMat(t.oakLogSide), makeMat(t.oakLogTop),
      makeMat(t.oakLogTop), makeMat(t.oakLogSide), makeMat(t.oakLogSide)
    ]],
    leavesMaterials: [[
      makeMat(t.oakLeaves, { transparent: true, alphaTest: 0.5 }),
      makeMat(t.oakLeaves, { transparent: true, alphaTest: 0.5 }),
      makeMat(t.oakLeaves, { transparent: true, alphaTest: 0.5 }),
      makeMat(t.oakLeaves, { transparent: true, alphaTest: 0.5 }),
      makeMat(t.oakLeaves, { transparent: true, alphaTest: 0.5 }),
      makeMat(t.oakLeaves, { transparent: true, alphaTest: 0.5 })
    ]],
    sandMaterials: [[
      makeMat(t.sand), makeMat(t.sand), makeMat(t.sand),
      makeMat(t.sand), makeMat(t.sand), makeMat(t.sand)
    ]],
    coalMaterials: [[
      makeMat(t.coalOre), makeMat(t.coalOre), makeMat(t.coalOre),
      makeMat(t.coalOre), makeMat(t.coalOre), makeMat(t.coalOre)
    ]],
    cobbleMaterials: [[
      makeMat(t.cobblestone), makeMat(t.cobblestone), makeMat(t.cobblestone),
      makeMat(t.cobblestone), makeMat(t.cobblestone), makeMat(t.cobblestone)
    ]],
    bedrockMaterials: [[
      makeMat(t.bedrock), makeMat(t.bedrock), makeMat(t.bedrock),
      makeMat(t.bedrock), makeMat(t.bedrock), makeMat(t.bedrock)
    ]],
    plankMaterials: [[
      makeMat(t.oakPlanks), makeMat(t.oakPlanks), makeMat(t.oakPlanks),
      makeMat(t.oakPlanks), makeMat(t.oakPlanks), makeMat(t.oakPlanks)
    ]],
    waterMaterial: [
      makeMat(t.water, { transparent: true, opacity: 0.7 }),
      makeMat(t.water, { transparent: true, opacity: 0.7 }),
      makeMat(t.water, { transparent: true, opacity: 0.7 }),
      makeMat(t.water, { transparent: true, opacity: 0.7 }),
      makeMat(t.water, { transparent: true, opacity: 0.7 }),
      makeMat(t.water, { transparent: true, opacity: 0.7 })
    ],
    ironOreMaterials: [[
      makeMat(t.ironOre), makeMat(t.ironOre), makeMat(t.ironOre),
      makeMat(t.ironOre), makeMat(t.ironOre), makeMat(t.ironOre)
    ]],
    goldOreMaterials: [[
      makeMat(t.goldOre), makeMat(t.goldOre), makeMat(t.goldOre),
      makeMat(t.goldOre), makeMat(t.goldOre), makeMat(t.goldOre)
    ]],
    diamondOreMaterials: [[
      makeMat(t.diamondOre), makeMat(t.diamondOre), makeMat(t.diamondOre),
      makeMat(t.diamondOre), makeMat(t.diamondOre), makeMat(t.diamondOre)
    ]],
    redstoneOreMaterials: [[
      makeMat(t.redstoneOre), makeMat(t.redstoneOre), makeMat(t.redstoneOre),
      makeMat(t.redstoneOre), makeMat(t.redstoneOre), makeMat(t.redstoneOre)
    ]],
    lapisOreMaterials: [[
      makeMat(t.lapisOre), makeMat(t.lapisOre), makeMat(t.lapisOre),
      makeMat(t.lapisOre), makeMat(t.lapisOre), makeMat(t.lapisOre)
    ]],
    emeraldOreMaterials: [[
      makeMat(t.emeraldOre), makeMat(t.emeraldOre), makeMat(t.emeraldOre),
      makeMat(t.emeraldOre), makeMat(t.emeraldOre), makeMat(t.emeraldOre)
    ]],
    craftingTableMaterials: [[
      makeMat(t.craftingTableSide), makeMat(t.craftingTableSide), makeMat(t.craftingTableTop),
      makeMat(t.oakPlanks), makeMat(t.craftingTableFront), makeMat(t.craftingTableSide)
    ]],
    torchMaterial: makeMat(t.torch, { transparent: true, alphaTest: 0.1 }),
  };
};

export const blockDefs = {
  1: { name: "Fű", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().grassMaterials },
  2: { name: "Föld", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().dirtMaterials },
  3: { name: "Kő", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().stoneMaterials },
  4: { name: "Fa", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().woodMaterials, mapFace: "side" },
  5: { name: "Lomb", solid: true, renderGroup: "cutout", getMaterials: () => getBlockMaterials().leavesMaterials, mapFace: "side" },
  6: { name: "Homok", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().sandMaterials },
  7: { name: "Szénérc", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().coalMaterials, mapFace: "side" },
  8: { name: "Víz", solid: false, renderGroup: "water", getMaterials: () => [getBlockMaterials().waterMaterial] },
  9: { name: "Munkapad", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().craftingTableMaterials },
  10: { name: "Deszka", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().plankMaterials, mapFace: "top" },
  11: { name: "Kockakő", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().cobbleMaterials, mapFace: "side" },
  12: { name: "Vasérc", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().ironOreMaterials, mapFace: "side" },
  13: { name: "Aranyérc", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().goldOreMaterials, mapFace: "side" },
  14: { name: "Gyémántérc", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().diamondOreMaterials, mapFace: "side" },
  15: { name: "Redstone ér", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().redstoneOreMaterials, mapFace: "side" },
  16: { name: "Lapis ér", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().lapisOreMaterials, mapFace: "side" },
  17: { name: "Smaragdérc", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().emeraldOreMaterials, mapFace: "side" },
  18: { 
    name: "Fáklya", 
    solid: false, 
    renderGroup: "cutout", 
    getMaterials: () => getBlockMaterials().torchMaterial, 
    mapFace: "side",
    isAttachable: true,
    needsSupport: true,
    customModel: true, // Ne rendereljük a greedy meshing-gel
  },
  19: { name: "Bedrock", solid: true, renderGroup: "opaque", getMaterials: () => getBlockMaterials().bedrockMaterials },
};

const textureToIcon = (source) => {
  const texture = source?.isTexture ? source : source?.map;
  if (!texture) return null;
  const sourceCanvas = texture.userData?.sourceCanvas;
  if (sourceCanvas) return sourceCanvas.toDataURL();
  const image = texture.image;
  if (!image) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, 16, 16);
  return canvas.toDataURL();
};

export const getBlockIcons = () => {
  const mats = getBlockMaterials();
  return {
    1: textureToIcon(mats.grassMaterials[0][2]),
    2: textureToIcon(mats.dirtMaterials[0][0]),
    3: textureToIcon(mats.stoneMaterials[0][0]),
    4: textureToIcon(mats.woodMaterials[0][2]),
    5: textureToIcon(mats.leavesMaterials[0][0]),
    6: textureToIcon(mats.sandMaterials[0][0]),
    7: textureToIcon(mats.coalMaterials[0][0]),
    8: textureToIcon(mats.waterMaterial[0]),
    9: textureToIcon(mats.craftingTableMaterials[0][2]),
    10: textureToIcon(mats.plankMaterials[0][0]),
    11: textureToIcon(mats.cobbleMaterials[0][0]),
    12: textureToIcon(mats.ironOreMaterials[0][0]),
    13: textureToIcon(mats.goldOreMaterials[0][0]),
    14: textureToIcon(mats.diamondOreMaterials[0][0]),
    15: textureToIcon(mats.redstoneOreMaterials[0][0]),
    16: textureToIcon(mats.lapisOreMaterials[0][0]),
    17: textureToIcon(mats.emeraldOreMaterials[0][0]),
    18: textureToIcon(mats.torchMaterial),
    19: textureToIcon(mats.bedrockMaterials[0][0]),
  };
};

export const blockIcons = {};

export const refreshBlockIcons = () => {
  Object.assign(blockIcons, getBlockIcons());
  return blockIcons;
};

export const makeIconCanvas = (drawFn) => {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  drawFn(ctx);
  return canvas;
};

const makePatternIcon = (pattern, color, emptyColor, mode = "full") => {
  const scale = 2;
  const width = pattern[0].length;
  const height = pattern.length;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pattern[y][x] !== "1") continue;
      let fill = color;
      if (mode === "empty") fill = emptyColor;
      if (mode === "half") {
        fill = x < width / 2 ? color : emptyColor;
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas.toDataURL();
};

const heartPattern = [
  "01100110",
  "11111111",
  "11111111",
  "11111111",
  "11111111",
  "01111110",
  "00111100",
  "00011000",
];

const hungerPattern = [
  "00011100",
  "00111110",
  "01111111",
  "01111111",
  "00111110",
  "00111000",
  "01101100",
  "11000110",
];

export const statusIcons = {
  heart: {
    full: makePatternIcon(heartPattern, "#e53935", "#5a1a1a", "full"),
    half: makePatternIcon(heartPattern, "#e53935", "#5a1a1a", "half"),
    empty: makePatternIcon(heartPattern, "#5a1a1a", "#5a1a1a", "empty"),
  },
  hunger: {
    full: makePatternIcon(hungerPattern, "#d9772b", "#5b3617", "full"),
    half: makePatternIcon(hungerPattern, "#d9772b", "#5b3617", "half"),
    empty: makePatternIcon(hungerPattern, "#5b3617", "#5b3617", "empty"),
  },
};

const pickVariant = (variants, x, y, z) => {
  const idx = Math.floor(hash3(x, y, z) * variants.length);
  return variants[Math.min(idx, variants.length - 1)];
};

export const getBlockMaterial = (type, x, y, z) => {
  const def = blockDefs[type];
  if (!def) return null;
  
  const materials = def.getMaterials ? def.getMaterials() : (def.variants || []);
  
  // Ha nem array (pl. torch), akkor közvetlenül visszaadjuk
  if (!Array.isArray(materials)) {
    return materials;
  }
  
  // Ha array, akkor pickVariant
  return pickVariant(materials, x, y, z);
};
