import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const canvas = document.getElementById("game");
const startBtn = document.getElementById("start-btn");
const menu = document.getElementById("menu");
const hud = document.getElementById("hud");
const statusEl = document.getElementById("status");
const crosshairEl = document.getElementById("crosshair");
const hotbarEl = document.getElementById("hotbar");
const miningBarEl = document.getElementById("mining-bar");
const miningFillEl = document.getElementById("mining-fill");
const heartsEl = document.getElementById("hearts");
const hungerEl = document.getElementById("hunger");
const inventoryEl = document.getElementById("inventory");
const inventoryGridEl = document.getElementById("inventory-grid");
const inventoryHotbarEl = document.getElementById("inventory-hotbar");
const craftGridEl = document.getElementById("craft-grid");
const craftOutputEl = document.getElementById("craft-output");
const cursorItemEl = document.getElementById("cursor-item");
const craftingTableEl = document.getElementById("crafting-table");
const craftTableGridEl = document.getElementById("craft-table-grid");
const craftTableOutputEl = document.getElementById("craft-table-output");
const craftTableInventoryEl = document.getElementById("craft-table-inventory");
const craftTableHotbarEl = document.getElementById("craft-table-hotbar");
const cursorItemTableEl = document.getElementById("cursor-item-table");
const deathScreenEl = document.getElementById("death-screen");
const respawnBtn = document.getElementById("respawn-btn");

const itemEntities = [];
const itemTextures = new Map();

canvas.setAttribute("tabindex", "0");

const urlParams = new URLSearchParams(window.location.search);
const disablePointerLock = urlParams.has("nopointerlock");

const state = {
  mode: "menu",
  lastTime: 0,
  manualTime: false,
  targetedBlock: null,
  targetedFace: null,
  blocks: 0,
  inventoryOpen: false,
  craftingTableOpen: false,
  selectedHotbar: 0,
  heldItem: null,
  mining: {
    active: false,
    progress: 0,
    targetKey: null,
    blockType: null,
  },
  currentChunkX: null,
  currentChunkZ: null,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fbce6);
scene.fog = new THREE.Fog(0x8fbce6, 10, 55);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x5b4b35, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 30, 10);
scene.add(sun);

const WORLD_MAX_HEIGHT = 32;
const SEA_LEVEL = 8;
const CHUNK_SIZE = 16;
const CHUNK_RADIUS = 2;

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

const randomSeed = (() => {
  const urlSeed = urlParams.get("seed");
  if (urlSeed && Number.isFinite(Number(urlSeed))) return Number(urlSeed);
  return Math.floor(Math.random() * 1_000_000_000);
})();

const fract = (n) => n - Math.floor(n);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hexToRgb = (hex) => ({
  r: (hex >> 16) & 255,
  g: (hex >> 8) & 255,
  b: hex & 255,
});

const pixelNoise = (x, y, seedOffset) =>
  fract(Math.sin(x * 12.9898 + y * 78.233 + seedOffset) * 43758.5453);

const pickFromPalette = (palette, weights, n) => {
  if (!weights || weights.length !== palette.length) {
    const idx = Math.floor(n * palette.length);
    return palette[Math.min(idx, palette.length - 1)];
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let i = 0; i < palette.length; i += 1) {
    acc += weights[i] / total;
    if (n <= acc) return palette[i];
  }
  return palette[palette.length - 1];
};

const makePixelTexture = ({
  palette,
  weights,
  seedOffset,
  cellSize = 4,
  jitter = 10,
  speckleChance = 0,
  speckleColor = null,
  alphaChance = 0,
  alphaValue = 200,
  overlay = null,
}) => {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cellX = Math.floor(x / cellSize);
      const cellY = Math.floor(y / cellSize);
      const cellNoise = pixelNoise(cellX, cellY, seedOffset * 0.77);
      const baseHex = pickFromPalette(palette, weights, cellNoise);
      let { r, g, b } = hexToRgb(baseHex);

      const fine = pixelNoise(x, y, seedOffset * 1.37);
      const shade = (fine - 0.5) * 2 * jitter;
      r += shade;
      g += shade;
      b += shade;

      if (speckleChance > 0) {
        const s = pixelNoise(x * 1.7, y * 1.7, seedOffset * 2.13);
        if (s < speckleChance && speckleColor) {
          const speckle = hexToRgb(speckleColor);
          r = speckle.r;
          g = speckle.g;
          b = speckle.b;
        }
      }

      if (overlay) {
        const adjusted = overlay(x, y, { r, g, b });
        r = adjusted.r;
        g = adjusted.g;
        b = adjusted.b;
      }

      let alpha = 255;
      if (alphaChance > 0) {
        const a = pixelNoise(x * 2.3, y * 2.3, seedOffset * 3.1);
        if (a < alphaChance) alpha = alphaValue;
      }

      const idx = (y * size + x) * 4;
      image.data[idx] = clamp(Math.round(r), 0, 255);
      image.data[idx + 1] = clamp(Math.round(g), 0, 255);
      image.data[idx + 2] = clamp(Math.round(b), 0, 255);
      image.data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData = texture.userData || {};
  texture.userData.sourceCanvas = canvas;
  return texture;
};

const makeGrassSideTexture = (grassPalette, dirtPalette, seedOffset) =>
  makePixelTexture({
    palette: dirtPalette,
    weights: [4, 3, 2],
    seedOffset,
    cellSize: 4,
    jitter: 10,
    speckleChance: 0.05,
    speckleColor: 0x5a472f,
    overlay: (x, y, color) => {
      if (y < 4) {
        const cellNoise = pixelNoise(x, y, seedOffset * 1.11);
        const topHex = pickFromPalette(grassPalette, [4, 3, 2], cellNoise);
        const top = hexToRgb(topHex);
        return { r: top.r, g: top.g, b: top.b };
      }
      return color;
    },
  });

const makeWoodTexture = (palette, seedOffset) =>
  makePixelTexture({
    palette,
    weights: [3, 2, 1],
    seedOffset,
    cellSize: 3,
    jitter: 12,
    overlay: (x, y, color) => {
      const stripe = x % 4 === 0 ? -22 : x % 4 === 1 ? -12 : 0;
      return { r: color.r + stripe, g: color.g + stripe, b: color.b + stripe };
    },
  });

const makeMat = (texture, opts = {}) =>
  new THREE.MeshLambertMaterial({ map: texture, ...opts });

const grassPalettes = [
  [0x6fcf55, 0x5fb94c, 0x7dde65],
  [0x67c84f, 0x5ab348, 0x75d85d],
  [0x74d95d, 0x62c24c, 0x5bb345],
];
const dirtPalettes = [
  [0x8b6c42, 0x7c5f3a, 0x936f46],
  [0x845f39, 0x734f31, 0x8f6841],
  [0x8f6a43, 0x7e5b38, 0x9b744a],
];
const stonePalettes = [
  [0x8a8f98, 0x7c8088, 0x9aa1ac],
  [0x878c95, 0x7a7f87, 0x9da4ae],
  [0x838790, 0x777b83, 0x949aa4],
];
const woodPalettes = [
  [0x9c6b3f, 0x8b5f37, 0xa97545],
  [0x946339, 0x845634, 0xa56f43],
  [0x9f6f43, 0x8c6139, 0xac7848],
];
const leavesPalettes = [
  [0x3f7f3a, 0x357033, 0x4c8d45],
  [0x417f3c, 0x376f34, 0x4f8f47],
  [0x3b7536, 0x346a31, 0x468241],
];
const sandPalettes = [
  [0xdac58a, 0xd0b97f, 0xe1cc95],
  [0xd6c087, 0xcbb37a, 0xe0cb94],
  [0xdec991, 0xd2bc84, 0xe7d19b],
];
const coalPalettes = [
  [0x4a4f55, 0x41454a, 0x525960],
  [0x474b51, 0x3c4046, 0x51575f],
  [0x4e5359, 0x42464d, 0x585f68],
];

const grassMaterials = grassPalettes.map((palette, idx) => {
  const topTex = makePixelTexture({
    palette,
    weights: [4, 3, 2],
    seedOffset: randomSeed + idx * 9.1,
    cellSize: 3,
    jitter: 10,
    speckleChance: 0.03,
    speckleColor: 0x3f7f2f,
  });
  const sideTex = makeGrassSideTexture(palette, dirtPalettes[idx % dirtPalettes.length], randomSeed + idx * 10.3);
  const bottomTex = makePixelTexture({
    palette: dirtPalettes[idx % dirtPalettes.length],
    weights: [4, 3, 2],
    seedOffset: randomSeed + idx * 8.4,
    cellSize: 4,
    jitter: 8,
    speckleChance: 0.06,
    speckleColor: 0x5a472f,
  });
  return [
    makeMat(sideTex),
    makeMat(sideTex),
    makeMat(topTex),
    makeMat(bottomTex),
    makeMat(sideTex),
    makeMat(sideTex),
  ];
});

const dirtMaterials = dirtPalettes.map((palette, idx) =>
  makeMat(
    makePixelTexture({
      palette,
      weights: [4, 3, 2],
      seedOffset: randomSeed + idx * 7.7,
      cellSize: 4,
      jitter: 8,
      speckleChance: 0.08,
      speckleColor: 0x5a472f,
    })
  )
);
const stoneMaterials = stonePalettes.map((palette, idx) =>
  makeMat(
    makePixelTexture({
      palette,
      weights: [3, 3, 2],
      seedOffset: randomSeed + idx * 6.5,
      cellSize: 4,
      jitter: 12,
      speckleChance: 0.08,
      speckleColor: 0x6f737a,
    })
  )
);
const woodMaterials = woodPalettes.map((palette, idx) =>
  makeMat(makeWoodTexture(palette, randomSeed + idx * 5.3))
);
const leavesMaterials = leavesPalettes.map((palette, idx) =>
  makeMat(
    makePixelTexture({
      palette,
      weights: [3, 3, 2],
      seedOffset: randomSeed + idx * 4.9,
      cellSize: 3,
      jitter: 8,
      speckleChance: 0.06,
      speckleColor: 0x2f5e2b,
      alphaChance: 0.12,
      alphaValue: 200,
    }),
    {
      transparent: true,
      opacity: 0.95,
    }
  )
);
const sandMaterials = sandPalettes.map((palette, idx) =>
  makeMat(
    makePixelTexture({
      palette,
      weights: [4, 3, 2],
      seedOffset: randomSeed + idx * 7.1,
      cellSize: 4,
      jitter: 6,
      speckleChance: 0.04,
      speckleColor: 0xc7b078,
    })
  )
);
const coalMaterials = coalPalettes.map((palette, idx) =>
  makeMat(
    makePixelTexture({
      palette,
      weights: [3, 3, 2],
      seedOffset: randomSeed + idx * 6.9,
      cellSize: 3,
      jitter: 10,
      speckleChance: 0.2,
      speckleColor: 0x8b929a,
    })
  )
);
const cobbleMaterials = stonePalettes.map((palette, idx) =>
  makeMat(
    makePixelTexture({
      palette,
      weights: [3, 3, 2],
      seedOffset: randomSeed + idx * 8.6,
      cellSize: 3,
      jitter: 14,
      speckleChance: 0.25,
      speckleColor: 0x6b7077,
    })
  )
);

const makeOreMaterials = (oreColor, seedOffset) =>
  stonePalettes.map((palette, idx) =>
    makeMat(
      makePixelTexture({
        palette,
        weights: [3, 3, 2],
        seedOffset: randomSeed + seedOffset + idx * 5.4,
        cellSize: 3,
        jitter: 12,
        speckleChance: 0.18,
        speckleColor: oreColor,
        overlay: (x, y, color) => {
          const n = pixelNoise(x * 1.7, y * 1.7, seedOffset + idx * 2.1);
          if (n < 0.12) {
            const ore = hexToRgb(oreColor);
            return { r: ore.r, g: ore.g, b: ore.b };
          }
          return color;
        },
      })
    )
  );

const ironOreMaterials = makeOreMaterials(0xd8a066, 71.1);
const goldOreMaterials = makeOreMaterials(0xf2d36b, 82.5);
const diamondOreMaterials = makeOreMaterials(0x6fe7e7, 93.8);
const redstoneOreMaterials = makeOreMaterials(0xd94b3d, 104.2);
const lapisOreMaterials = makeOreMaterials(0x3b6bd6, 115.7);
const emeraldOreMaterials = makeOreMaterials(0x36c96f, 127.9);
const waterMaterial = makeMat(
  makePixelTexture({
    palette: [0x3c7bd6, 0x356fc2, 0x4a8be6],
    weights: [4, 3, 2],
    seedOffset: randomSeed * 0.73,
    cellSize: 3,
    jitter: 6,
  }),
  {
    transparent: true,
    opacity: 0.7,
  }
);

const plankMaterials = woodPalettes.map((palette, idx) =>
  makeMat(
    makePixelTexture({
      palette,
      weights: [3, 2, 1],
      seedOffset: randomSeed + idx * 9.4,
      cellSize: 4,
      jitter: 8,
      overlay: (x, y, color) => {
        const stripe = y % 4 === 0 ? -22 : y % 4 === 1 ? -12 : 0;
        return { r: color.r + stripe, g: color.g + stripe, b: color.b + stripe };
      },
    })
  )
);

const craftingTopTex = makePixelTexture({
  palette: [0xb7895b, 0xa9784e, 0x9a6a42],
  weights: [3, 3, 2],
  seedOffset: randomSeed + 44.7,
  cellSize: 3,
  jitter: 8,
  overlay: (x, y, color) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) {
      return { r: color.r - 28, g: color.g - 28, b: color.b - 28 };
    }
    if (x === 7 || y === 7) {
      return { r: color.r - 20, g: color.g - 20, b: color.b - 20 };
    }
    return color;
  },
});
const craftingSideTex = makePixelTexture({
  palette: [0xa16c3f, 0x8f5f37, 0xb37b4d],
  weights: [3, 3, 2],
  seedOffset: randomSeed + 52.9,
  cellSize: 3,
  jitter: 10,
  overlay: (x, y, color) => {
    if (x === 0 || x === 15) {
      return { r: color.r - 20, g: color.g - 20, b: color.b - 20 };
    }
    if (y > 9 && x > 4 && x < 11) {
      return { r: color.r - 30, g: color.g - 30, b: color.b - 30 };
    }
    return color;
  },
});
const craftingBottomTex = makePixelTexture({
  palette: [0x845634, 0x744b2e, 0x93613a],
  weights: [3, 2, 1],
  seedOffset: randomSeed + 61.3,
  cellSize: 4,
  jitter: 6,
});

const craftingTableMaterials = [
  [
    makeMat(craftingSideTex),
    makeMat(craftingSideTex),
    makeMat(craftingTopTex),
    makeMat(craftingBottomTex),
    makeMat(craftingSideTex),
    makeMat(craftingSideTex),
  ],
];

const blockDefs = {
  1: { name: "Fű", solid: true, variants: grassMaterials },
  2: { name: "Föld", solid: true, variants: dirtMaterials },
  3: { name: "Kő", solid: true, variants: stoneMaterials },
  4: { name: "Fa", solid: true, variants: woodMaterials },
  5: { name: "Lomb", solid: true, variants: leavesMaterials },
  6: { name: "Homok", solid: true, variants: sandMaterials },
  7: { name: "Szénérc", solid: true, variants: coalMaterials },
  8: { name: "Víz", solid: false, variants: [waterMaterial] },
  9: { name: "Munkapad", solid: true, variants: craftingTableMaterials },
  10: { name: "Deszka", solid: true, variants: plankMaterials },
  11: { name: "Kockakő", solid: true, variants: cobbleMaterials },
  12: { name: "Vasérc", solid: true, variants: ironOreMaterials },
  13: { name: "Aranyérc", solid: true, variants: goldOreMaterials },
  14: { name: "Gyémántérc", solid: true, variants: diamondOreMaterials },
  15: { name: "Redstone ér", solid: true, variants: redstoneOreMaterials },
  16: { name: "Lapis ér", solid: true, variants: lapisOreMaterials },
  17: { name: "Smaragdérc", solid: true, variants: emeraldOreMaterials },
};

const textureToIcon = (source) => {
  const texture = source?.isTexture ? source : source?.map;
  const canvas = texture?.userData?.sourceCanvas;
  return canvas ? canvas.toDataURL() : null;
};

const blockIcons = {
  1: textureToIcon(grassMaterials[0][2]),
  2: textureToIcon(dirtMaterials[0]),
  3: textureToIcon(stoneMaterials[0]),
  4: textureToIcon(woodMaterials[0]),
  5: textureToIcon(leavesMaterials[0]),
  6: textureToIcon(sandMaterials[0]),
  7: textureToIcon(coalMaterials[0]),
  8: textureToIcon(waterMaterial),
  9: textureToIcon(craftingTopTex),
  10: textureToIcon(plankMaterials[0]),
  11: textureToIcon(cobbleMaterials[0]),
  12: textureToIcon(ironOreMaterials[0]),
  13: textureToIcon(goldOreMaterials[0]),
  14: textureToIcon(diamondOreMaterials[0]),
  15: textureToIcon(redstoneOreMaterials[0]),
  16: textureToIcon(lapisOreMaterials[0]),
  17: textureToIcon(emeraldOreMaterials[0]),
};

const makeIconCanvas = (drawFn) => {
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

const statusIcons = {
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

const toolIcons = {
  wood_pickaxe: makeToolIcon("pickaxe", "#d8b47a", "#8b5a2b").toDataURL(),
  wood_axe: makeToolIcon("axe", "#d8b47a", "#8b5a2b").toDataURL(),
  wood_shovel: makeToolIcon("shovel", "#d8b47a", "#8b5a2b").toDataURL(),
  stone_pickaxe: makeToolIcon("pickaxe", "#a0a5ad", "#6b7280").toDataURL(),
  stone_axe: makeToolIcon("axe", "#a0a5ad", "#6b7280").toDataURL(),
  stone_shovel: makeToolIcon("shovel", "#a0a5ad", "#6b7280").toDataURL(),
};

const itemDefs = {
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
};

const getItemTexture = (id) => {
  if (itemTextures.has(id)) return itemTextures.get(id);
  const icon = itemDefs[id]?.icon;
  if (!icon) return null;
  const texture = new THREE.TextureLoader().load(icon);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  itemTextures.set(id, texture);
  return texture;
};

const createItemEntity = (id, count, position) => {
  const texture = getItemTexture(id);
  if (!texture) return null;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.45, 0.45, 0.45);
  sprite.position.copy(position);
  scene.add(sprite);

  const entity = {
    id,
    count,
    position: position.clone(),
    velocity: new THREE.Vector3((Math.random() - 0.5) * 1.2, 2 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2),
    mesh: sprite,
    age: 0,
    bobOffset: Math.random() * Math.PI * 2,
  };
  itemEntities.push(entity);
  return entity;
};

const spawnItemDrop = (id, count, x, y, z) => {
  if (!id || count <= 0) return;
  const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
  createItemEntity(id, count, pos);
};

const blockTypeToItem = {
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
};

const HOTBAR_SIZE = 9;
const INVENTORY_ROWS = 3;
const INVENTORY_COLS = 9;
const CRAFT_SIZE = 4;
const TABLE_CRAFT_SIZE = 9;

const createSlot = (id = null, count = 0, durability = null) => ({
  id,
  count,
  durability,
});
const hotbar = Array.from({ length: HOTBAR_SIZE }, () => createSlot());
const inventory = Array.from({ length: INVENTORY_ROWS * INVENTORY_COLS }, () => createSlot());
const craftSlots = Array.from({ length: CRAFT_SIZE }, () => createSlot());
const tableCraftSlots = Array.from({ length: TABLE_CRAFT_SIZE }, () => createSlot());

const seedStartingItems = () => {
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
};

seedStartingItems();

const world = new Map();
const meshes = new Map();
const chunks = new Map();

const keyFor = (x, y, z) => `${x},${y},${z}`;
const chunkKey = (cx, cz) => `${cx},${cz}`;
const worldToChunk = (x, z) => ({
  cx: Math.floor(x / CHUNK_SIZE),
  cz: Math.floor(z / CHUNK_SIZE),
});

const getChunk = (cx, cz) => chunks.get(chunkKey(cx, cz)) || null;

const createChunk = (cx, cz) => {
  const key = chunkKey(cx, cz);
  if (chunks.has(key)) return chunks.get(key);
  const chunk = {
    key,
    cx,
    cz,
    blocks: new Set(),
    generated: false,
    loaded: false,
    group: null,
  };
  chunks.set(key, chunk);
  return chunk;
};

const isWithinWorld = (x, y, z) => y >= 0 && y < WORLD_MAX_HEIGHT;

const getBlock = (x, y, z) => world.get(keyFor(x, y, z)) || 0;

const hash2 = (x, z) => {
  const h = Math.sin(x * 127.1 + z * 311.7 + randomSeed * 0.0001) * 43758.5453;
  return fract(h);
};

const hash3 = (x, y, z) => {
  const h =
    Math.sin(x * 127.1 + y * 269.5 + z * 311.7 + randomSeed * 0.0007) * 43758.5453;
  return fract(h);
};

const smoothstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const noise2D = (x, z) => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const zf = z - z0;

  const v00 = hash2(x0, z0);
  const v10 = hash2(x0 + 1, z0);
  const v01 = hash2(x0, z0 + 1);
  const v11 = hash2(x0 + 1, z0 + 1);

  const u = smoothstep(xf);
  const v = smoothstep(zf);

  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
};

const noise3D = (x, y, z) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const yf = y - y0;
  const zf = z - z0;

  const v000 = hash3(x0, y0, z0);
  const v100 = hash3(x0 + 1, y0, z0);
  const v010 = hash3(x0, y0 + 1, z0);
  const v110 = hash3(x0 + 1, y0 + 1, z0);
  const v001 = hash3(x0, y0, z0 + 1);
  const v101 = hash3(x0 + 1, y0, z0 + 1);
  const v011 = hash3(x0, y0 + 1, z0 + 1);
  const v111 = hash3(x0 + 1, y0 + 1, z0 + 1);

  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const w = smoothstep(zf);

  const x00 = lerp(v000, v100, u);
  const x10 = lerp(v010, v110, u);
  const x01 = lerp(v001, v101, u);
  const x11 = lerp(v011, v111, u);
  const yInterp0 = lerp(x00, x10, v);
  const yInterp1 = lerp(x01, x11, v);
  return lerp(yInterp0, yInterp1, w);
};

const pickVariant = (variants, x, y, z) => {
  const idx = Math.floor(hash3(x, y, z) * variants.length);
  return variants[Math.min(idx, variants.length - 1)];
};

const getBlockMaterial = (type, x, y, z) => {
  const def = blockDefs[type];
  if (!def) return null;
  return pickVariant(def.variants, x, y, z);
};

const ensureChunkGenerated = (x, z) => {
  const { cx, cz } = worldToChunk(x, z);
  const chunk = createChunk(cx, cz);
  if (!chunk.generated) generateChunk(chunk);
  return chunk;
};

const setBlock = (x, y, z, type) => {
  if (!isWithinWorld(x, y, z)) return false;
  const chunk = ensureChunkGenerated(x, z);
  const key = keyFor(x, y, z);
  const previous = world.get(key) || 0;

  if (type === 0) {
    if (previous === 0) return true;
    world.delete(key);
    chunk.blocks.delete(key);
    const mesh = meshes.get(key);
    if (mesh && mesh.parent) {
      mesh.parent.remove(mesh);
    }
    meshes.delete(key);
    state.blocks = Math.max(0, state.blocks - 1);
    return true;
  }

  world.set(key, type);
  if (previous === 0) {
    chunk.blocks.add(key);
    state.blocks += 1;
  } else {
    chunk.blocks.add(key);
  }

  if (meshes.has(key)) {
    const mesh = meshes.get(key);
    mesh.material = getBlockMaterial(type, x, y, z);
    mesh.userData.type = type;
    return true;
  }

  if (chunk.loaded) {
    const mesh = new THREE.Mesh(blockGeometry, getBlockMaterial(type, x, y, z));
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.userData = { x, y, z, type };
    chunk.group.add(mesh);
    meshes.set(key, mesh);
  }
  return true;
};

const removeBlock = (x, y, z) => setBlock(x, y, z, 0);

const heightAt = (x, z) => {
  const n1 = noise2D(x * 0.04, z * 0.04) * 12;
  const n2 = noise2D(x * 0.1, z * 0.1) * 6;
  const n3 = noise2D(x * 0.22, z * 0.22) * 2;
  const base = 6 + n1 + n2 + n3;
  return Math.max(3, Math.min(WORLD_MAX_HEIGHT - 4, Math.floor(base)));
};

const findSpawn = () => {
  const maxRadius = 24;
  for (let r = 0; r <= maxRadius; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        const x = dx;
        const z = dz;
        const height = heightAt(x, z);
        if (height > SEA_LEVEL + 1) {
          return { x, z, height };
        }
      }
    }
  }
  return { x: 0, z: 0, height: heightAt(0, 0) };
};

const spawn = findSpawn();
let worldInitialized = false;

const oreConfigs = [
  { type: 14, maxY: 10, chance: 0.006, seed: 1.3 },
  { type: 15, maxY: 14, chance: 0.008, seed: 2.1 },
  { type: 16, maxY: 16, chance: 0.008, seed: 2.7 },
  { type: 17, maxY: 8, chance: 0.003, seed: 3.1 },
  { type: 13, maxY: 20, chance: 0.01, seed: 4.4 },
  { type: 12, maxY: 24, chance: 0.015, seed: 5.2 },
  { type: 7, maxY: 26, chance: 0.02, seed: 6.6 },
];

const pickOreType = (x, y, z) => {
  for (const ore of oreConfigs) {
    if (y > ore.maxY) continue;
    const roll = hash3(x * 1.7 + ore.seed, y * 2.1 + ore.seed, z * 1.3 + ore.seed);
    if (roll < ore.chance) return ore.type;
  }
  return null;
};

const shouldCarveCave = (x, y, z) => {
  if (y < 2 || y > WORLD_MAX_HEIGHT - 2) return false;
  const n1 = noise3D(x * 0.08, y * 0.08, z * 0.08);
  const n2 = noise3D(x * 0.16, y * 0.16, z * 0.16);
  const caveValue = n1 * 0.7 + n2 * 0.3;
  const depthFactor = 1 - y / WORLD_MAX_HEIGHT;
  const threshold = 0.64 - depthFactor * 0.1;
  return caveValue > threshold;
};

const setGeneratedBlock = (chunk, x, y, z, type) => {
  if (!isWithinWorld(x, y, z)) return;
  const key = keyFor(x, y, z);
  if (world.has(key)) return;
  world.set(key, type);
  chunk.blocks.add(key);
  state.blocks += 1;
};

const generateChunk = (chunk) => {
  if (chunk.generated) return;
  chunk.generated = true;
  const startX = chunk.cx * CHUNK_SIZE;
  const startZ = chunk.cz * CHUNK_SIZE;

  for (let x = 0; x < CHUNK_SIZE; x += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      const worldX = startX + x;
      const worldZ = startZ + z;
      const height = heightAt(worldX, worldZ);
      const biome = noise2D(worldX * 0.05, worldZ * 0.05);
      const rocky = noise2D(worldX * 0.18, worldZ * 0.18);
      const isBeach = height <= SEA_LEVEL + 1 || biome < 0.25;
      const topType = rocky > 0.72 ? 3 : isBeach ? 6 : 1;

      for (let y = 0; y < height; y += 1) {
        let type = 3;
        if (y >= height - 1) type = topType;
        else if (y >= height - 3) type = isBeach ? 6 : 2;

        if (y > 2 && y < height - 1 && shouldCarveCave(worldX, y, worldZ)) {
          continue;
        }

        if (type === 3 && y < height - 1) {
          const oreType = pickOreType(worldX, y, worldZ);
          if (oreType) type = oreType;
        }

        setGeneratedBlock(chunk, worldX, y, worldZ, type);
      }

      if (height < SEA_LEVEL) {
        for (let y = height; y <= SEA_LEVEL; y += 1) {
          if (!shouldCarveCave(worldX, y, worldZ)) {
            setGeneratedBlock(chunk, worldX, y, worldZ, 8);
          }
        }
      }

      const treeChance = hash2(worldX * 2.3, worldZ * 2.7);
      const noTreeZone =
        Math.abs(worldX - spawn.x) <= 2 && Math.abs(worldZ - spawn.z) <= 2;
      if (!noTreeZone && !isBeach && treeChance > 0.86 && height < WORLD_MAX_HEIGHT - 6) {
        const trunkHeight = 3 + Math.floor(hash2(worldX * 1.1, worldZ * 1.3) * 2);
        for (let t = 0; t < trunkHeight; t += 1) {
          setGeneratedBlock(chunk, worldX, height + t, worldZ, 4);
        }
        for (let lx = -2; lx <= 2; lx += 1) {
          for (let lz = -2; lz <= 2; lz += 1) {
            for (let ly = 0; ly <= 2; ly += 1) {
              const dist = Math.abs(lx) + Math.abs(lz) + ly;
              if (dist < 4) {
                setGeneratedBlock(chunk, worldX + lx, height + trunkHeight - 1 + ly, worldZ + lz, 5);
              }
            }
          }
        }
      }
    }
  }
};

const loadChunk = (chunk) => {
  if (chunk.loaded) return;
  const group = new THREE.Group();
  group.name = `chunk-${chunk.key}`;
  for (const key of chunk.blocks) {
    const type = world.get(key);
    if (!type) continue;
    const [x, y, z] = key.split(",").map(Number);
    const mesh = new THREE.Mesh(blockGeometry, getBlockMaterial(type, x, y, z));
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.userData = { x, y, z, type };
    group.add(mesh);
    meshes.set(key, mesh);
  }
  scene.add(group);
  chunk.group = group;
  chunk.loaded = true;
};

const unloadChunk = (chunk) => {
  if (!chunk.loaded) return;
  for (const key of chunk.blocks) {
    const mesh = meshes.get(key);
    if (mesh && mesh.parent) {
      mesh.parent.remove(mesh);
    }
    meshes.delete(key);
  }
  if (chunk.group) {
    scene.remove(chunk.group);
  }
  chunk.group = null;
  chunk.loaded = false;
};

const ensureChunksAround = (x, z) => {
  const { cx, cz } = worldToChunk(x, z);
  if (state.currentChunkX === cx && state.currentChunkZ === cz) return;
  state.currentChunkX = cx;
  state.currentChunkZ = cz;
  const needed = new Set();
  for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx += 1) {
    for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz += 1) {
      const nx = cx + dx;
      const nz = cz + dz;
      const key = chunkKey(nx, nz);
      needed.add(key);
      const chunk = createChunk(nx, nz);
      if (!chunk.generated) generateChunk(chunk);
      loadChunk(chunk);
    }
  }
  for (const [key, chunk] of chunks) {
    if (chunk.loaded && !needed.has(key)) {
      unloadChunk(chunk);
    }
  }
};

const clearSpawnArea = () => {
  for (let x = spawn.x - 1; x <= spawn.x + 1; x += 1) {
    for (let z = spawn.z - 1; z <= spawn.z + 1; z += 1) {
      for (let y = spawn.height; y <= spawn.height + 4; y += 1) {
        if (isWithinWorld(x, y, z)) {
          setBlock(x, y, z, 0);
        }
      }
    }
  }
};

const initializeWorld = () => {
  if (worldInitialized) return;
  ensureChunksAround(spawn.x, spawn.z);
  clearSpawnArea();
  worldInitialized = true;
};

const player = {
  position: new THREE.Vector3(spawn.x + 0.5, Math.max(spawn.height + 2, SEA_LEVEL + 2), spawn.z + 0.5),
  velocity: new THREE.Vector3(),
  radius: 0.35,
  height: 1.7,
  eyeHeight: 1.55,
  yaw: 0,
  pitch: 0,
  onGround: false,
  speed: 4.4,
  sprintMultiplier: 1.6,
  jumpSpeed: 6.2,
  health: 20,
  hunger: 20,
  exhaustion: 0,
  regenTimer: 0,
  starveTimer: 0,
  fallDistance: 0,
  lastPos: null,
};

player.lastPos = player.position.clone();

const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  jumping: false,
  mining: false,
};

const slotUIs = {
  hotbar: [],
  inventory: [],
  craft: [],
  craftTable: [],
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

buildSlots(hotbarEl, "hotbar", HOTBAR_SIZE);
buildSlots(inventoryGridEl, "inventory", inventory.length);
buildSlots(inventoryHotbarEl, "hotbar", HOTBAR_SIZE);
buildSlots(craftGridEl, "craft", craftSlots.length);
buildSlots(craftTableGridEl, "craftTable", 9);
buildSlots(craftTableInventoryEl, "inventory", inventory.length);
buildSlots(craftTableHotbarEl, "hotbar", HOTBAR_SIZE);

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

const HEART_COUNT = 10;
const hungerIcons = [];
const heartIcons = [];

const buildStatusIcons = (container, count, type, store) => {
  container.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const icon = document.createElement("div");
    icon.className = "status-icon";
    icon.dataset.type = type;
    container.append(icon);
    store.push(icon);
  }
};

buildStatusIcons(heartsEl, HEART_COUNT, "heart", heartIcons);
buildStatusIcons(hungerEl, HEART_COUNT, "hunger", hungerIcons);

const maxStackFor = (id) => itemDefs[id]?.maxStack ?? 64;
const slotIsEmpty = (slot) => !slot || !slot.id || slot.count <= 0;

const setSlot = (slot, id, count) => {
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
  target.durability =
    source.durability ?? (itemDefs[source.id]?.durability ?? null);
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

const addItemToInventory = (id, count) => {
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

const getSelectedSlot = () => hotbar[state.selectedHotbar];
const getSelectedItemId = () => {
  const slot = getSelectedSlot();
  return slot && slot.id ? slot.id : null;
};

const canPlaceSelected = () => {
  const id = getSelectedItemId();
  if (!id) return false;
  return itemDefs[id]?.blockType != null;
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

const updateAllSlotsUI = () => {
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
  updateCraftOutput("inventory");
  updateCraftOutput("table");
  updateHotbarSelectionUI();
  updateCursorItemUI();
};

const shapedMatch = (grid, size, pattern, key) => {
  const patternHeight = pattern.length;
  const patternWidth = pattern[0].length;
  if (patternHeight > size || patternWidth > size) return null;

  const cells = [];
  for (let y = 0; y < patternHeight; y += 1) {
    for (let x = 0; x < patternWidth; x += 1) {
      const symbol = pattern[y][x];
      if (symbol && symbol !== " ") {
        cells.push({ x, y, symbol });
      }
    }
  }

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

const clearHeldItem = () => {
  state.heldItem = null;
};

const ensureHeldItem = () => {
  if (!state.heldItem) state.heldItem = createSlot();
  return state.heldItem;
};

const handleSlotInteraction = (slot, isRightClick) => {
  const held = ensureHeldItem();
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

const closeInventory = () => {
  if (!state.inventoryOpen) return;
  if (state.heldItem && !slotIsEmpty(state.heldItem)) {
    addItemToInventory(state.heldItem.id, state.heldItem.count);
    clearHeldItem();
  }
  state.inventoryOpen = false;
  inventoryEl.classList.add("hidden");
  statusEl.classList.remove("hidden");
  crosshairEl.classList.remove("hidden");
  if (!disablePointerLock) lockPointer();
  updateAllSlotsUI();
};

const openInventory = () => {
  if (state.inventoryOpen) return;
  if (state.craftingTableOpen) closeCraftingTable();
  state.inventoryOpen = true;
  inventoryEl.classList.remove("hidden");
  statusEl.classList.add("hidden");
  crosshairEl.classList.add("hidden");
  unlockPointer();
  updateAllSlotsUI();
};

const closeCraftingTable = () => {
  if (!state.craftingTableOpen) return;
  if (state.heldItem && !slotIsEmpty(state.heldItem)) {
    addItemToInventory(state.heldItem.id, state.heldItem.count);
    clearHeldItem();
  }
  state.craftingTableOpen = false;
  craftingTableEl.classList.add("hidden");
  statusEl.classList.remove("hidden");
  crosshairEl.classList.remove("hidden");
  if (!disablePointerLock) lockPointer();
  updateAllSlotsUI();
};

const openCraftingTable = () => {
  if (state.craftingTableOpen) return;
  if (state.inventoryOpen) closeInventory();
  state.craftingTableOpen = true;
  craftingTableEl.classList.remove("hidden");
  statusEl.classList.add("hidden");
  crosshairEl.classList.add("hidden");
  unlockPointer();
  updateAllSlotsUI();
};

const respawn = () => {
  if (state.inventoryOpen) closeInventory();
  if (state.craftingTableOpen) closeCraftingTable();
  player.health = 20;
  player.hunger = 20;
  player.exhaustion = 0;
  player.regenTimer = 0;
  player.starveTimer = 0;
  player.fallDistance = 0;
  player.position.set(spawn.x + 0.5, Math.max(spawn.height + 2, SEA_LEVEL + 2), spawn.z + 0.5);
  player.velocity.set(0, 0, 0);
  player.lastPos.copy(player.position);

  state.mode = "playing";
  deathScreenEl.classList.add("hidden");
  hud.classList.remove("hidden");
  crosshairEl.classList.remove("hidden");
  if (!disablePointerLock) lockPointer();
  updateAllSlotsUI();
  updateSurvivalUI();
};

respawnBtn.addEventListener("click", () => {
  respawn();
});

const getSlotArrayForGroup = (group) => {
  if (group === "hotbar") return hotbar;
  if (group === "inventory") return inventory;
  if (group === "craft") return craftSlots;
  if (group === "craftTable") return tableCraftSlots;
  return null;
};

const handleSlotMouseDown = (event) => {
  if (!state.inventoryOpen) return;
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
  handleSlotInteraction(slots[index], isRightClick);
  updateAllSlotsUI();
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
});

const raycaster = new THREE.Raycaster();
raycaster.far = 6;

const highlightGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
const highlightMaterial = new THREE.LineBasicMaterial({ color: 0xffff88 });
const highlightMesh = new THREE.LineSegments(highlightGeometry, highlightMaterial);
highlightMesh.visible = false;
scene.add(highlightMesh);

const isSolid = (x, y, z) => {
  if (!isWithinWorld(x, y, z)) return true;
  const type = getBlock(x, y, z);
  if (type === 0) return false;
  const def = blockDefs[type];
  return def ? def.solid !== false : true;
};

const collidesAt = (pos) => {
  const minX = pos.x - player.radius;
  const maxX = pos.x + player.radius;
  const minY = pos.y;
  const maxY = pos.y + player.height;
  const minZ = pos.z - player.radius;
  const maxZ = pos.z + player.radius;

  const startX = Math.floor(minX);
  const endX = Math.floor(maxX);
  const startY = Math.floor(minY);
  const endY = Math.floor(maxY);
  const startZ = Math.floor(minZ);
  const endZ = Math.floor(maxZ);

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      for (let z = startZ; z <= endZ; z += 1) {
        if (!isSolid(x, y, z)) continue;
        const blockMinX = x;
        const blockMaxX = x + 1;
        const blockMinY = y;
        const blockMaxY = y + 1;
        const blockMinZ = z;
        const blockMaxZ = z + 1;

        if (
          maxX > blockMinX &&
          minX < blockMaxX &&
          maxY > blockMinY &&
          minY < blockMaxY &&
          maxZ > blockMinZ &&
          minZ < blockMaxZ
        ) {
          return true;
        }
      }
    }
  }
  return false;
};

const moveAxis = (axis, delta) => {
  if (delta === 0) return;
  const steps = Math.ceil(Math.abs(delta) / 0.05);
  const step = delta / steps;
  for (let i = 0; i < steps; i += 1) {
    const nextPos = player.position.clone();
    nextPos[axis] += step;
    if (collidesAt(nextPos)) {
      if (axis === "y" && step < 0) {
        player.onGround = true;
      }
      player.velocity[axis] = 0;
      return;
    }
    player.position[axis] = nextPos[axis];
  }
};

const checkGrounded = () => {
  const testPos = player.position.clone();
  testPos.y -= 0.06;
  return collidesAt(testPos);
};

const updatePlayer = (dt) => {
  const movementEnabled = !state.inventoryOpen && !state.craftingTableOpen;
  const moveInput = new THREE.Vector3(
    movementEnabled ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0,
    0,
    movementEnabled ? (input.backward ? 1 : 0) - (input.forward ? 1 : 0) : 0
  );

  if (moveInput.lengthSq() > 0) {
    moveInput.normalize();
  }

  const yaw = player.yaw;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const desired = new THREE.Vector3();
  desired.addScaledVector(forward, moveInput.z);
  desired.addScaledVector(right, moveInput.x);

  if (desired.lengthSq() > 0) {
    desired.normalize();
  }

  const speed = player.speed * (movementEnabled && input.sprint ? player.sprintMultiplier : 1);
  player.velocity.x = desired.x * speed;
  player.velocity.z = desired.z * speed;

  player.velocity.y += -18 * dt;

  if (movementEnabled && input.jump && player.onGround && !input.jumping) {
    player.velocity.y = player.jumpSpeed;
    input.jumping = true;
    player.exhaustion += 0.2;
  }

  const wasOnGround = player.onGround;
  player.onGround = false;
  moveAxis("x", player.velocity.x * dt);
  moveAxis("z", player.velocity.z * dt);
  moveAxis("y", player.velocity.y * dt);

  player.onGround = checkGrounded();
  if (player.onGround) {
    input.jumping = false;
    if (player.velocity.y < 0) player.velocity.y = 0;
  }

  if (!player.onGround) {
    if (player.velocity.y < 0) {
      player.fallDistance += -player.velocity.y * dt;
    }
  } else {
    if (!wasOnGround && player.fallDistance > 0) {
      const damage = Math.floor(player.fallDistance - 3);
      if (damage > 0) takeDamage(damage);
    }
    player.fallDistance = 0;
  }

  camera.position.set(
    player.position.x,
    player.position.y + player.eyeHeight,
    player.position.z
  );
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
};

const updateTarget = () => {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const meshesArray = Array.from(meshes.values());
  const hits = raycaster.intersectObjects(meshesArray, false);

  if (hits.length === 0) {
    state.targetedBlock = null;
    state.targetedFace = null;
    highlightMesh.visible = false;
    return;
  }

  const hit = hits[0];
  const { x, y, z } = hit.object.userData;
  state.targetedBlock = { x, y, z };
  state.targetedFace = hit.face?.normal || null;
  highlightMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  highlightMesh.visible = true;
};

const blockHardness = {
  1: 0.6, // grass
  2: 0.5, // dirt
  3: 1.5, // stone
  4: 2.0, // wood log
  5: 0.2, // leaves
  6: 0.5, // sand
  7: 3.0, // coal ore
  8: Infinity, // water
  9: 2.5, // crafting table
  10: 2.0, // plank
  11: 2.0, // cobble
  12: 3.0, // iron ore
  13: 3.0, // gold ore
  14: 3.0, // diamond ore
  15: 3.0, // redstone ore
  16: 3.0, // lapis ore
  17: 3.0, // emerald ore
};

const blockToolType = {
  1: "shovel",
  2: "shovel",
  3: "pickaxe",
  4: "axe",
  5: "axe",
  6: "shovel",
  7: "pickaxe",
  12: "pickaxe",
  13: "pickaxe",
  14: "pickaxe",
  15: "pickaxe",
  16: "pickaxe",
  17: "pickaxe",
  9: "axe",
  10: "axe",
  11: "pickaxe",
};

const blockHarvestLevel = {
  3: 1, // stone
  7: 1, // coal ore
  11: 1, // cobble
  12: 2, // iron ore
  13: 2, // gold ore
  14: 2, // diamond ore
  15: 2, // redstone ore
  16: 2, // lapis ore
  17: 2, // emerald ore
};

const getBreakTimeSeconds = (blockType, toolId) => {
  const hardness = blockHardness[blockType] ?? 1;
  if (!Number.isFinite(hardness) || hardness <= 0) return Infinity;
  const tool = itemDefs[toolId]?.tool ?? null;
  const requiredTool = blockToolType[blockType];
  const correctTool = tool && requiredTool && tool.type === requiredTool;
  const base = hardness * 1.5;
  if (correctTool) {
    return base / (tool.speed ?? 1);
  }
  return base * 5;
};

const resetMining = () => {
  state.mining.active = false;
  state.mining.progress = 0;
  state.mining.targetKey = null;
  state.mining.blockType = null;
  miningBarEl.classList.add("hidden");
  miningFillEl.style.width = "0%";
  highlightMaterial.color.set(0xffff88);
};

const applyToolDamage = () => {
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

const getDropForBlock = (blockType, toolId) => {
  if (blockType === 8) return null;
  const tool = itemDefs[toolId]?.tool;
  const requiredTool = blockToolType[blockType];
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

const completeMining = (blockType) => {
  const toolId = getSelectedItemId();
  const tx = state.targetedBlock.x;
  const ty = state.targetedBlock.y;
  const tz = state.targetedBlock.z;
  removeBlock(tx, ty, tz);
  const drop = getDropForBlock(blockType, toolId);
  if (drop) spawnItemDrop(drop.id, drop.count, tx, ty, tz);
  applyToolDamage();
  updateAllSlotsUI();
};

const updateMining = (dt) => {
  if (!input.mining || state.inventoryOpen || state.craftingTableOpen) {
    resetMining();
    return;
  }
  if (!state.targetedBlock) {
    resetMining();
    return;
  }

  const { x, y, z } = state.targetedBlock;
  const blockType = getBlock(x, y, z);
  if (blockType === 0 || blockType === 8) {
    resetMining();
    return;
  }

  const key = keyFor(x, y, z);
  if (state.mining.targetKey !== key) {
    state.mining.progress = 0;
    state.mining.targetKey = key;
    state.mining.blockType = blockType;
  }

  const toolId = getSelectedItemId();
  const breakTime = getBreakTimeSeconds(blockType, toolId);
  if (!Number.isFinite(breakTime)) {
    resetMining();
    return;
  }

  state.mining.active = true;
  state.mining.progress += dt / breakTime;
  const progress = clamp(state.mining.progress, 0, 1);
  miningBarEl.classList.remove("hidden");
  miningFillEl.style.width = `${progress * 100}%`;
  highlightMaterial.color.setHSL(0.12 - progress * 0.12, 1, 0.65);

  if (state.mining.progress >= 1) {
    completeMining(blockType);
    state.mining.progress = 0;
    state.mining.targetKey = null;
    state.mining.blockType = null;
    miningFillEl.style.width = "0%";
  }
};

const updateSurvivalUI = () => {
  const health = Math.max(0, Math.min(20, player.health));
  const hunger = Math.max(0, Math.min(20, player.hunger));

  for (let i = 0; i < HEART_COUNT; i += 1) {
    const value = health - i * 2;
    const icon =
      value >= 2 ? statusIcons.heart.full : value === 1 ? statusIcons.heart.half : statusIcons.heart.empty;
    heartIcons[i].style.backgroundImage = `url(${icon})`;
  }

  for (let i = 0; i < HEART_COUNT; i += 1) {
    const value = hunger - i * 2;
    const icon =
      value >= 2 ? statusIcons.hunger.full : value === 1 ? statusIcons.hunger.half : statusIcons.hunger.empty;
    hungerIcons[i].style.backgroundImage = `url(${icon})`;
  }
};

const takeDamage = (amount) => {
  if (state.mode !== "playing") return;
  player.health = Math.max(0, player.health - amount);
  if (player.health <= 0) {
    state.mode = "dead";
    deathScreenEl.classList.remove("hidden");
    hud.classList.add("hidden");
    crosshairEl.classList.add("hidden");
    miningBarEl.classList.add("hidden");
    miningFillEl.style.width = "0%";
    unlockPointer();
  }
};

const updateSurvival = (dt) => {
  if (state.mode !== "playing") return;

  const dx = player.position.x - player.lastPos.x;
  const dz = player.position.z - player.lastPos.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0) {
    const exhaustionRate = input.sprint ? 0.12 : 0.04;
    player.exhaustion += distance * exhaustionRate;
    player.lastPos.copy(player.position);
  }

  while (player.exhaustion >= 4 && player.hunger > 0) {
    player.exhaustion -= 4;
    player.hunger = Math.max(0, player.hunger - 1);
  }

  if (player.hunger >= 18 && player.health < 20) {
    player.regenTimer += dt;
    if (player.regenTimer >= 4) {
      player.regenTimer = 0;
      player.health = Math.min(20, player.health + 1);
      player.hunger = Math.max(0, player.hunger - 1);
    }
  } else {
    player.regenTimer = 0;
  }

  if (player.hunger <= 0) {
    player.starveTimer += dt;
    if (player.starveTimer >= 4) {
      player.starveTimer = 0;
      takeDamage(1);
    }
  } else {
    player.starveTimer = 0;
  }
};

const updateItemEntities = (dt, time) => {
  if (itemEntities.length === 0) return;
  const gravity = 18;
  const pickupRadius = 1.2;
  const maxAge = 300;
  const maxDistance = CHUNK_SIZE * (CHUNK_RADIUS + 1.5);

  for (let i = itemEntities.length - 1; i >= 0; i -= 1) {
    const entity = itemEntities[i];
    entity.age += dt;
    if (entity.age > maxAge) {
      scene.remove(entity.mesh);
      itemEntities.splice(i, 1);
      continue;
    }

    const dx = entity.position.x - player.position.x;
    const dz = entity.position.z - player.position.z;
    if (Math.hypot(dx, dz) > maxDistance) {
      scene.remove(entity.mesh);
      itemEntities.splice(i, 1);
      continue;
    }

    entity.velocity.y -= gravity * dt;
    const nextPos = entity.position.clone().addScaledVector(entity.velocity, dt);

    if (entity.velocity.y <= 0) {
      const blockBelow = getBlock(Math.floor(nextPos.x), Math.floor(nextPos.y - 0.1), Math.floor(nextPos.z));
      if (blockBelow && blockBelow !== 8) {
        nextPos.y = Math.floor(nextPos.y) + 1.02;
        entity.velocity.y = 0;
      }
    }

    entity.position.copy(nextPos);
    const bob = Math.sin(time * 2 + entity.bobOffset) * 0.05;
    entity.mesh.position.set(entity.position.x, entity.position.y + bob, entity.position.z);
    if (entity.mesh.material) {
      entity.mesh.material.rotation = time * 0.8 + entity.bobOffset;
    }

    if (state.mode === "playing") {
      const dist = entity.position.distanceTo(player.position);
      if (dist < pickupRadius && Math.abs(entity.position.y - player.position.y) < 1.8) {
        const remaining = addItemToInventory(entity.id, entity.count);
        if (remaining <= 0) {
          scene.remove(entity.mesh);
          itemEntities.splice(i, 1);
        } else {
          entity.count = remaining;
        }
        updateAllSlotsUI();
      }
    }
  }
};

const placeBlock = () => {
  if (!state.targetedBlock || !state.targetedFace) return;
  if (!canPlaceSelected()) return;
  const selectedSlot = getSelectedSlot();
  if (!selectedSlot || selectedSlot.count <= 0) return;
  const target = state.targetedBlock;
  const normal = state.targetedFace;
  const nx = Math.round(normal.x);
  const ny = Math.round(normal.y);
  const nz = Math.round(normal.z);
  const x = target.x + nx;
  const y = target.y + ny;
  const z = target.z + nz;

  if (!isWithinWorld(x, y, z)) return;
  if (getBlock(x, y, z) !== 0) return;

  const playerBox = {
    minX: player.position.x - player.radius,
    maxX: player.position.x + player.radius,
    minY: player.position.y,
    maxY: player.position.y + player.height,
    minZ: player.position.z - player.radius,
    maxZ: player.position.z + player.radius,
  };

  const blockMinX = x;
  const blockMaxX = x + 1;
  const blockMinY = y;
  const blockMaxY = y + 1;
  const blockMinZ = z;
  const blockMaxZ = z + 1;

  const intersectsPlayer =
    playerBox.maxX > blockMinX &&
    playerBox.minX < blockMaxX &&
    playerBox.maxY > blockMinY &&
    playerBox.minY < blockMaxY &&
    playerBox.maxZ > blockMinZ &&
    playerBox.minZ < blockMaxZ;

  if (intersectsPlayer) return;
  const selectedItem = getSelectedItemId();
  const blockType = itemDefs[selectedItem]?.blockType;
  if (!blockType) return;
  setBlock(x, y, z, blockType);
  selectedSlot.count -= 1;
  if (selectedSlot.count <= 0) setSlot(selectedSlot, null, 0);
  updateAllSlotsUI();
};

const tryConsumeFood = () => {
  const selectedSlot = getSelectedSlot();
  if (!selectedSlot || slotIsEmpty(selectedSlot)) return false;
  const def = itemDefs[selectedSlot.id];
  if (!def || def.food == null) return false;
  if (player.hunger >= 20) return false;
  player.hunger = Math.min(20, player.hunger + def.food);
  selectedSlot.count -= 1;
  if (selectedSlot.count <= 0) setSlot(selectedSlot, null, 0);
  updateAllSlotsUI();
  return true;
};

const removeTargetedBlock = () => {
  if (!state.targetedBlock) return;
  const { x, y, z } = state.targetedBlock;
  const blockType = getBlock(x, y, z);
  if (blockType === 0) return;
  removeBlock(x, y, z);
  const itemId = blockTypeToItem[blockType];
  if (itemId) spawnItemDrop(itemId, 1, x, y, z);
  updateAllSlotsUI();
};

const updateHud = () => {
  const pos = player.position;
  const target = state.targetedBlock
    ? `${state.targetedBlock.x},${state.targetedBlock.y},${state.targetedBlock.z}`
    : "-";
  const selectedSlot = getSelectedSlot();
  const selectedId = selectedSlot?.id;
  const selectedName = selectedId ? itemDefs[selectedId]?.name : "Üres";
  const selectedCount = selectedSlot?.count || 0;
  const selectedDurability =
    selectedId && itemDefs[selectedId]?.durability != null ? selectedSlot?.durability : null;
  const lines = [
    `Pozíció: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`,
    `Sebesség: ${player.velocity.x.toFixed(2)}, ${player.velocity.y.toFixed(2)}, ${player.velocity.z.toFixed(2)}`,
    `Talajon: ${player.onGround ? "igen" : "nem"}`,
    `Cél blokk: ${target}`,
    selectedDurability != null
      ? `Kiválasztott: ${selectedName} (${selectedDurability})`
      : `Kiválasztott: ${selectedName} x${selectedCount}`,
    `Élet: ${player.health} · Éhség: ${player.hunger}`,
    `Blokkok: ${state.blocks}`,
    `Seed: ${randomSeed}`,
  ];
  statusEl.textContent = lines.join("\n");
  updateSurvivalUI();
};

const update = (dt) => {
  updatePlayer(dt);
  if (!worldInitialized) initializeWorld();
  ensureChunksAround(player.position.x, player.position.z);
  updateTarget();
  updateMining(dt);
  updateSurvival(dt);
  updateHud();
};

const render = () => {
  renderer.render(scene, camera);
};

const tick = (time) => {
  if (!state.manualTime) {
    const now = time * 0.001;
    const dt = Math.min(0.033, now - state.lastTime || 0.016);
    state.lastTime = now;
    if (state.mode === "playing") {
      update(dt);
    }
    updateItemEntities(dt, now);
    render();
  } else {
    render();
  }
  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);

const resize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

window.addEventListener("resize", resize);

const toggleFullscreen = async () => {
  if (!document.fullscreenElement) {
    await document.body.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
  resize();
};

const lockPointer = () => {
  if (!canvas.requestPointerLock) return;
  if (disablePointerLock || navigator.webdriver) return;
  if (!document.body.contains(canvas)) return;
  try {
    canvas.focus();
    canvas.requestPointerLock();
  } catch (err) {
    console.warn("Pointer lock failed.", err);
  }
};

const unlockPointer = () => {
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
};

startBtn.addEventListener("click", () => {
  initializeWorld();
  state.mode = "playing";
  menu.classList.add("hidden");
  hud.classList.remove("hidden");
  lockPointer();
  updateAllSlotsUI();
});

canvas.addEventListener("click", () => {
  if (state.mode === "playing" && document.pointerLockElement !== canvas) {
    lockPointer();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyW") input.forward = true;
  if (event.code === "KeyS") input.backward = true;
  if (event.code === "KeyA") input.left = true;
  if (event.code === "KeyD") input.right = true;
  if (event.code === "Space") input.jump = true;
  if (event.code === "ShiftLeft") input.sprint = true;
  if (event.code === "KeyF") toggleFullscreen();

  if (event.code.startsWith("Digit")) {
    const digit = Number(event.code.replace("Digit", ""));
    if (digit >= 1 && digit <= 9) {
      state.selectedHotbar = digit - 1;
      updateAllSlotsUI();
    }
  }

  if (event.code === "KeyE" || event.code === "KeyI") {
    if (state.craftingTableOpen) closeCraftingTable();
    else if (state.inventoryOpen) closeInventory();
    else openInventory();
  }

  if (event.code === "Escape") {
    if (state.craftingTableOpen) {
      closeCraftingTable();
    } else if (state.inventoryOpen) {
      closeInventory();
    } else {
      unlockPointer();
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") input.forward = false;
  if (event.code === "KeyS") input.backward = false;
  if (event.code === "KeyA") input.left = false;
  if (event.code === "KeyD") input.right = false;
  if (event.code === "Space") input.jump = false;
  if (event.code === "ShiftLeft") input.sprint = false;
});

window.addEventListener("wheel", (event) => {
  if (state.inventoryOpen || state.craftingTableOpen) return;
  if (event.deltaY > 0) {
    state.selectedHotbar = (state.selectedHotbar + 1) % HOTBAR_SIZE;
  } else {
    state.selectedHotbar = (state.selectedHotbar - 1 + HOTBAR_SIZE) % HOTBAR_SIZE;
  }
  updateAllSlotsUI();
});

window.addEventListener("mousemove", (event) => {
  if (state.inventoryOpen || state.craftingTableOpen) return;
  if (document.pointerLockElement !== canvas || state.mode !== "playing") return;
  const sensitivity = 0.002;
  player.yaw -= event.movementX * sensitivity;
  player.pitch -= event.movementY * sensitivity;
  player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, player.pitch));
});

window.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("mousedown", (event) => {
  if (state.inventoryOpen || state.craftingTableOpen) return;
  if (state.mode !== "playing" || document.pointerLockElement !== canvas) return;
  if (event.button === 0) {
    input.mining = true;
  }
  if (event.button === 2) {
    if (state.targetedBlock && getBlock(state.targetedBlock.x, state.targetedBlock.y, state.targetedBlock.z) === 9) {
      openCraftingTable();
      return;
    }
    if (tryConsumeFood()) return;
    placeBlock();
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    input.mining = false;
    resetMining();
  }
});

window.render_game_to_text = () => {
  const payload = {
    mode: state.mode,
    coordSystem: "origin (0,0,0) at world corner; +x east, +y up, +z south",
    player: {
      x: Number(player.position.x.toFixed(2)),
      y: Number(player.position.y.toFixed(2)),
      z: Number(player.position.z.toFixed(2)),
      yaw: Number(player.yaw.toFixed(3)),
      pitch: Number(player.pitch.toFixed(3)),
      onGround: player.onGround,
      health: player.health,
      hunger: player.hunger,
      velocity: {
        x: Number(player.velocity.x.toFixed(2)),
        y: Number(player.velocity.y.toFixed(2)),
        z: Number(player.velocity.z.toFixed(2)),
      },
    },
    target: state.targetedBlock,
    selectedHotbar: state.selectedHotbar,
    selectedItem: getSelectedItemId(),
    inventoryOpen: state.inventoryOpen,
    craftingTableOpen: state.craftingTableOpen,
    blocks: state.blocks,
    worldSize: { chunkSize: CHUNK_SIZE, height: WORLD_MAX_HEIGHT, viewRadius: CHUNK_RADIUS },
    seaLevel: SEA_LEVEL,
    seed: randomSeed,
    hotbar: hotbar.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    inventory: inventory.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    crafting: craftSlots.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    craftingTable: tableCraftSlots.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
  };
  return JSON.stringify(payload);
};

window.advanceTime = (ms) => {
  state.manualTime = true;
  const step = 1 / 60;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    if (state.mode === "playing") update(step);
    updateItemEntities(step, state.lastTime + i * step);
  }
  render();
};
