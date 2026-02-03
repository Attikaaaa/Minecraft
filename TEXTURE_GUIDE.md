# Saját Textúrák Hozzáadása

## Minecraft textúrák használata (ha van legális példányod)

1. Minecraft textúrák helye:
   - `.minecraft/versions/[verzió]/[verzió].jar` fájlban
   - Kicsomagolva: `assets/minecraft/textures/block/` mappában

2. Textúrák hozzáadása a projekthez:
   - Hozz létre egy `textures/` mappát a projekt gyökerében
   - Másold be a 16x16-os PNG fájlokat

3. Módosítsd a `js/textures.js` fájlt:

```javascript
// Textúra betöltése fájlból
const loadTexture = (path) => {
  const texture = new THREE.TextureLoader().load(path);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

// Használat
const grassTopTex = loadTexture('textures/grass_block_top.png');
const grassSideTex = loadTexture('textures/grass_block_side.png');
const dirtTex = loadTexture('textures/dirt.png');
// stb...
```

## Szükséges textúrák listája

- grass_block_top.png
- grass_block_side.png
- dirt.png
- stone.png
- oak_log.png
- oak_leaves.png
- sand.png
- coal_ore.png
- cobblestone.png
- oak_planks.png
- water_still.png
- crafting_table_top.png
- crafting_table_side.png
- iron_ore.png
- gold_ore.png
- diamond_ore.png
- redstone_ore.png
- lapis_ore.png
- emerald_ore.png
