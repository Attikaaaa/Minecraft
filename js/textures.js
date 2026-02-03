import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { clamp, hexToRgb, pickFromPalette, pixelNoise, randomSeed } from "./config.js";
import { hash3 } from "./noise.js";

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

const torchSeed = randomSeed + 77.7;
const torchTexture = makePixelTexture({
  palette: [0x8b5a2b, 0x6f4320, 0xa36a32],
  weights: [3, 2, 1],
  seedOffset: torchSeed,
  cellSize: 4,
  jitter: 8,
  overlay: (x, y, color) => {
    if (y < 5) {
      const flicker = pixelNoise(x * 2.1, y * 2.1, torchSeed) - 0.5;
      return {
        r: 240 + flicker * 20,
        g: 190 + flicker * 15,
        b: 90 + flicker * 10,
      };
    }
    if (x > 6 && x < 10) {
      return {
        r: color.r + 18,
        g: color.g + 10,
        b: color.b + 4,
      };
    }
    return color;
  },
});
const torchMaterial = makeMat(torchTexture);

export const blockDefs = {
  1: { name: "Fű", solid: true, renderGroup: "opaque", variants: grassMaterials },
  2: { name: "Föld", solid: true, renderGroup: "opaque", variants: dirtMaterials },
  3: { name: "Kő", solid: true, renderGroup: "opaque", variants: stoneMaterials },
  4: { name: "Fa", solid: true, renderGroup: "opaque", variants: woodMaterials, mapFace: "side" },
  5: { name: "Lomb", solid: true, renderGroup: "cutout", variants: leavesMaterials, mapFace: "side" },
  6: { name: "Homok", solid: true, renderGroup: "opaque", variants: sandMaterials },
  7: { name: "Szénérc", solid: true, renderGroup: "opaque", variants: coalMaterials, mapFace: "side" },
  8: { name: "Víz", solid: false, renderGroup: "water", variants: [waterMaterial] },
  9: { name: "Munkapad", solid: true, renderGroup: "opaque", variants: craftingTableMaterials },
  10: { name: "Deszka", solid: true, renderGroup: "opaque", variants: plankMaterials, mapFace: "top" },
  11: { name: "Kockakő", solid: true, renderGroup: "opaque", variants: cobbleMaterials, mapFace: "side" },
  12: { name: "Vasérc", solid: true, renderGroup: "opaque", variants: ironOreMaterials, mapFace: "side" },
  13: { name: "Aranyérc", solid: true, renderGroup: "opaque", variants: goldOreMaterials, mapFace: "side" },
  14: { name: "Gyémántérc", solid: true, renderGroup: "opaque", variants: diamondOreMaterials, mapFace: "side" },
  15: { name: "Redstone ér", solid: true, renderGroup: "opaque", variants: redstoneOreMaterials, mapFace: "side" },
  16: { name: "Lapis ér", solid: true, renderGroup: "opaque", variants: lapisOreMaterials, mapFace: "side" },
  17: { name: "Smaragdérc", solid: true, renderGroup: "opaque", variants: emeraldOreMaterials, mapFace: "side" },
  18: { name: "Fáklya", solid: false, renderGroup: "cutout", variants: [torchMaterial], mapFace: "side" },
};

const textureToIcon = (source) => {
  const texture = source?.isTexture ? source : source?.map;
  const canvas = texture?.userData?.sourceCanvas;
  return canvas ? canvas.toDataURL() : null;
};

export const blockIcons = {
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
  18: textureToIcon(torchMaterial),
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
  return pickVariant(def.variants, x, y, z);
};
