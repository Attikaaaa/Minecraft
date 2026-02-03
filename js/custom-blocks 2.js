// Custom block models (torch, flowers, etc.) - nem greedy meshing
import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { scene } from "./scene.js";
import { getBlockMaterial, blockDefs } from "./textures.js";

// Torch meshek tárolása chunk szerint
const torchMeshesByChunk = new Map();

// Torch orientációk tárolása (world coords -> orientation)
const torchOrientations = new Map();

export const setTorchOrientation = (x, y, z, orientation) => {
  const key = `${x},${y},${z}`;
  torchOrientations.set(key, orientation);
};

export const getTorchOrientation = (x, y, z) => {
  const key = `${x},${y},${z}`;
  return torchOrientations.get(key) || 'floor';
};

export const removeTorchOrientation = (x, y, z) => {
  const key = `${x},${y},${z}`;
  torchOrientations.delete(key);
};

// Torch geometria létrehozása (Minecraft 1:1)
const createTorchGeometry = () => {
  // Fáklya: 2x2x10 pixel (Minecraft méret)
  // 1 blokk = 16 pixel, tehát:
  const width = 2 / 16;  // 0.125
  const depth = 2 / 16;  // 0.125
  const height = 10 / 16; // 0.625
  
  const geometry = new THREE.BoxGeometry(width, height, depth);
  
  // Középre igazítás, alul legyen a pivot
  geometry.translate(0, height / 2, 0);
  
  return geometry;
};

const torchGeometry = createTorchGeometry();

// Torch mesh létrehozása egy pozícióra
export const createTorchMesh = (x, y, z, orientation = 'floor') => {
  const material = getBlockMaterial(18, x, y, z); // 18 = torch
  if (!material) return null;
  
  const mesh = new THREE.Mesh(torchGeometry, material);
  
  // Pozíció beállítása
  mesh.position.set(x + 0.5, y, z + 0.5);
  
  // Orientáció (floor, north, south, east, west)
  if (orientation === 'north') {
    mesh.rotation.z = Math.PI / 8; // 22.5° dőlés
    mesh.position.z += 0.25;
  } else if (orientation === 'south') {
    mesh.rotation.z = -Math.PI / 8;
    mesh.position.z -= 0.25;
  } else if (orientation === 'east') {
    mesh.rotation.x = -Math.PI / 8;
    mesh.position.x += 0.25;
  } else if (orientation === 'west') {
    mesh.rotation.x = Math.PI / 8;
    mesh.position.x -= 0.25;
  }
  // floor = default, nincs dőlés
  
  // Fény hozzáadása (Minecraft torch light level 14)
  const light = new THREE.PointLight(0xffaa55, 1.2, 16); // Meleg narancssárga fény
  light.position.set(0, 0.5, 0); // A fáklya tetején
  mesh.add(light);
  
  return mesh;
};

// Chunk összes torch-ának renderelése
export const buildCustomBlocksForChunk = (chunk, getBlockAt) => {
  const chunkKey = `${chunk.cx},${chunk.cz}`;
  
  // Régi meshek törlése
  clearCustomBlocksForChunk(chunkKey);
  
  const meshes = [];
  const baseX = chunk.cx * 16; // CHUNK_SIZE
  const baseZ = chunk.cz * 16;
  
  // Végigmegyünk a chunk összes blokkján
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 256; y++) { // WORLD_MAX_HEIGHT
        const worldX = baseX + x;
        const worldZ = baseZ + z;
        const blockType = getBlockAt(worldX, y, worldZ);
        
        if (!blockType) continue;
        
        const def = blockDefs[blockType];
        if (!def || !def.customModel) continue;
        
        // Torch
        if (blockType === 18) {
          const orientation = getTorchOrientation(worldX, y, worldZ);
          const mesh = createTorchMesh(worldX, y, worldZ, orientation);
          if (mesh) {
            scene.add(mesh);
            meshes.push(mesh);
          }
        }
      }
    }
  }
  
  torchMeshesByChunk.set(chunkKey, meshes);
};

// Chunk custom block mesh-einek törlése
export const clearCustomBlocksForChunk = (chunkKey) => {
  const meshes = torchMeshesByChunk.get(chunkKey);
  if (!meshes) return;
  
  for (const mesh of meshes) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose());
    } else {
      mesh.material.dispose();
    }
  }
  
  torchMeshesByChunk.delete(chunkKey);
};

// Összes custom block mesh törlése
export const clearAllCustomBlocks = () => {
  for (const chunkKey of torchMeshesByChunk.keys()) {
    clearCustomBlocksForChunk(chunkKey);
  }
};
