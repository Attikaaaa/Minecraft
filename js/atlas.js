import { THREE } from "./scene.js";
import { blockDefs, loadAllTextures } from "./textures.js";
import { hash3 } from "./noise.js";

const TILE_SIZE = 16;
const textureToTile = new Map();
const tiles = [];

const fallbackCanvas = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  return canvas;
})();

const getCanvasFromTexture = (texture) => {
  if (!texture) return fallbackCanvas;
  const canvas = texture.userData?.sourceCanvas;
  if (canvas) return canvas;
  const image = texture.image;
  return image || fallbackCanvas;
};

const registerTexture = (materialOrTexture) => {
  if (!materialOrTexture) return 0;
  const texture = materialOrTexture.isTexture ? materialOrTexture : materialOrTexture.map;
  if (!texture) return 0;
  if (textureToTile.has(texture)) return textureToTile.get(texture);
  const tileIndex = tiles.length;
  tiles.push(texture);
  textureToTile.set(texture, tileIndex);
  return tileIndex;
};

let blockFaceTiles = {};
let blockRenderGroups = {};
let blockMapFaces = {};
let atlas = null;

const initializeAtlas = async () => {
  // Várunk a textúrák betöltésére
  await loadAllTextures();
  
  // Most már regisztráljuk a textúrákat
  for (const [rawType, def] of Object.entries(blockDefs)) {
    const type = Number(rawType);
    const variants = def.getMaterials ? def.getMaterials() : (def.variants || []);
    const variantTiles = variants.map((variant) => {
      if (Array.isArray(variant)) {
        return variant.map((mat) => registerTexture(mat));
      }
      const tile = registerTexture(variant);
      return [tile, tile, tile, tile, tile, tile];
    });
    blockFaceTiles[type] = variantTiles;
    blockRenderGroups[type] = def.renderGroup || (def.solid === false ? "cutout" : "opaque");
    blockMapFaces[type] = def.mapFace || null;
  }
  
  atlas = buildAtlas();
  return atlas;
};

const buildAtlas = () => {
  const count = tiles.length || 1;
  const tilesPerRow = Math.max(1, Math.ceil(Math.sqrt(count)));
  const tilesPerCol = Math.max(1, Math.ceil(count / tilesPerRow));
  const canvas = document.createElement("canvas");
  canvas.width = tilesPerRow * TILE_SIZE;
  canvas.height = tilesPerCol * TILE_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  tiles.forEach((texture, index) => {
    const col = index % tilesPerRow;
    const row = Math.floor(index / tilesPerRow);
    const source = getCanvasFromTexture(texture);
    ctx.drawImage(source, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  });

  const atlasTexture = new THREE.CanvasTexture(canvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.needsUpdate = true;

  return {
    texture: atlasTexture,
    tilesPerRow,
    tilesPerCol,
  };
};

export const getAtlas = () => {
  if (!atlas) {
    throw new Error("Atlas még nem inicializálódott! Hívd meg az initializeAtlas()-t először.");
  }
  return atlas;
};

export { initializeAtlas };
if (typeof window !== "undefined") {
  window.__initializeAtlas = initializeAtlas;
}

const createAtlasMaterial = (options = {}) => {
  const atlas = getAtlas();
  const material = new THREE.MeshLambertMaterial({
    map: atlas.texture,
    ...options,
  });
  material.defines = { ...(material.defines || {}), USE_UV: "" };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlasSize = { value: new THREE.Vector2(atlas.tilesPerRow, atlas.tilesPerCol) };
    shader.vertexShader =
      `
      attribute float aTile;
      varying float vTile;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `
        #include <uv_vertex>
        vTile = aTile;
      `
    );

    shader.fragmentShader =
      `
      varying float vTile;
      uniform vec2 uAtlasSize;
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #if defined(USE_MAP) && defined(USE_UV)
        float tileIndex = floor(vTile + 0.5);
        vec2 atlasScale = 1.0 / uAtlasSize;
        float row = floor(tileIndex / uAtlasSize.x);
        vec2 atlasOffset = vec2(mod(tileIndex, uAtlasSize.x), (uAtlasSize.y - 1.0) - row);
        vec2 atlasUv = (fract(vUv) + atlasOffset) * atlasScale;
        vec4 texelColor = texture2D(map, atlasUv);
        diffuseColor *= texelColor;
      #endif
    `
    );

    material.userData = material.userData || {};
    material.userData.atlasShader = {
      vertex: shader.vertexShader,
      fragment: shader.fragmentShader,
    };
  };

  material.customProgramCacheKey = () => {
    const atlas = getAtlas();
    return `atlas-${atlas.tilesPerRow}x${atlas.tilesPerCol}`;
  };
  return material;
};

export const createAtlasMaterials = () => {
  return {
    opaque: createAtlasMaterial(),
    cutout: createAtlasMaterial({ transparent: true, opacity: 0.95 }),
    water: createAtlasMaterial({ transparent: true, opacity: 0.7 }),
  };
};

export let atlasMaterials = null;

export const initAtlasMaterials = () => {
  atlasMaterials = createAtlasMaterials();
  return atlasMaterials;
};

export const getBlockRenderGroup = (type) => blockRenderGroups[type] || "opaque";

export const getBlockFaceTile = (type, faceIndex, x, y, z) => {
  const variants = blockFaceTiles[type];
  if (!variants || variants.length === 0) return 0;
  const variantIndex = Math.floor(hash3(x, y, z) * variants.length) % variants.length;
  const tilesForVariant = variants[variantIndex];
  const def = blockDefs[type];
  if (def?.mapFace === "top") {
    return tilesForVariant?.[2] ?? tilesForVariant?.[0] ?? 0;
  }
  if (def?.mapFace === "side") {
    return tilesForVariant?.[0] ?? 0;
  }
  return tilesForVariant?.[faceIndex] ?? 0;
};

export const atlasInfo = {
  tileSize: TILE_SIZE,
  get tilesPerRow() {
    return getAtlas().tilesPerRow;
  },
  get tilesPerCol() {
    return getAtlas().tilesPerCol;
  },
};

export { blockFaceTiles, blockRenderGroups, blockMapFaces };
