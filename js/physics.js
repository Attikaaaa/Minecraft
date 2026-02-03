// Minecraft fizika: falling blocks (homok, kavics, stb.)
import { getBlock, setBlock, isWithinWorld } from "./world.js";
import { spawnItemDrop } from "./entities.js";
import { THREE, scene } from "./scene.js";
import { getBlockMaterial, blockDefs } from "./textures.js";
import { removeTorchOrientation } from "./custom-blocks.js";

// Falling block típusok (Minecraft 1:1)
export const FALLING_BLOCKS = new Set([
  6,  // Homok
  // 19, // Kavics (ha hozzáadod később)
  // 20, // Concrete powder (ha hozzáadod később)
]);

// Blokkok amik támasztékot igényelnek (fáklya, virágok, stb.)
export const NEEDS_SUPPORT_BLOCKS = new Set([
  18, // Fáklya
]);

// Falling block entitások
const fallingBlocks = [];

export class FallingBlock {
  constructor(x, y, z, blockType) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.blockType = blockType;
    this.velocity = 0;
    this.age = 0;
    this.removed = false;
    this.fallDelay = 0.05; // Minecraft: 1 tick delay (0.05 sec)
    this.hasStartedFalling = false;
    
    // 3D mesh létrehozása
    const geometry = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const material = getBlockMaterial(blockType, x, y, z);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    scene.add(this.mesh);
  }
  
  update(dt) {
    if (this.removed) return;
    
    this.age += dt;
    
    // Minecraft: 1 tick késleltetés mielőtt elesne
    if (!this.hasStartedFalling) {
      this.fallDelay -= dt;
      if (this.fallDelay <= 0) {
        this.hasStartedFalling = true;
      } else {
        // Kis lebegés animáció a késleltetés alatt (Minecraft effect)
        if (this.mesh) {
          const wobble = Math.sin(this.age * 20) * 0.02;
          this.mesh.position.y = this.y + 0.5 + wobble;
        }
        return; // Még nem kezd el esni
      }
    }
    
    // Gravitáció (Minecraft: 0.04 blocks/tick^2)
    this.velocity -= 0.04 * (dt * 20);
    this.y += this.velocity * (dt * 20);
    
    // Maximum fall speed (Minecraft: -3.92 blocks/tick)
    if (this.velocity < -3.92) {
      this.velocity = -3.92;
    }
    
    // Mesh pozíció frissítése
    if (this.mesh) {
      this.mesh.position.y = this.y + 0.5;
    }
    
    // Ellenőrzés hogy földet ért-e
    const blockX = Math.floor(this.x);
    const blockY = Math.floor(this.y);
    const blockZ = Math.floor(this.z);
    
    if (!isWithinWorld(blockX, blockY, blockZ)) {
      this.remove();
      return;
    }
    
    // Ha földet ért
    const blockBelow = getBlock(blockX, blockY - 1, blockZ);
    if (blockBelow !== 0 && blockBelow !== 8) { // Nem levegő és nem víz
      // Blokk lerakása
      const currentBlock = getBlock(blockX, blockY, blockZ);
      if (currentBlock === 0 || currentBlock === 8) {
        setBlock(blockX, blockY, blockZ, this.blockType, { skipPhysics: true });
      } else {
        // Ha nem lehet lerakni, item drop
        spawnItemDrop(this.x, this.y, this.z, this.blockType, 1);
      }
      this.remove();
    }
    
    // Ha túl sokáig esik (100 blokk = 5 másodperc), töröljük
    if (this.age > 5) {
      this.remove();
    }
  }
  
  remove() {
    this.removed = true;
    if (this.mesh) {
      scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(m => m.dispose());
      } else {
        this.mesh.material.dispose();
      }
      this.mesh = null;
    }
  }
}

export const createFallingBlock = (x, y, z, blockType) => {
  const fb = new FallingBlock(x, y, z, blockType);
  fallingBlocks.push(fb);
  return fb;
};

export const updateFallingBlocks = (dt) => {
  for (let i = fallingBlocks.length - 1; i >= 0; i--) {
    const fb = fallingBlocks[i];
    fb.update(dt);
    if (fb.removed) {
      fallingBlocks.splice(i, 1);
    }
  }
};

export const getFallingBlocks = () => fallingBlocks;

// Blokk frissítés ellenőrzés (amikor blokk változik)
export const checkFallingBlock = (x, y, z) => {
  const blockType = getBlock(x, y, z);
  
  if (!FALLING_BLOCKS.has(blockType)) return;
  
  // Ellenőrizzük hogy van-e alatta blokk
  const blockBelow = getBlock(x, y - 1, z);
  
  if (blockBelow === 0 || blockBelow === 8) { // Levegő vagy víz
    // Töröljük a blokkot és létrehozunk falling block entitást
    setBlock(x, y, z, 0, { skipPhysics: true });
    createFallingBlock(x, y, z, blockType);
  }
};

// Szomszédos blokkok ellenőrzése (amikor blokk törlődik)
export const checkNeighborFalling = (x, y, z) => {
  // Felette lévő blokk
  checkFallingBlock(x, y + 1, z);
  
  // Támasztékot igénylő blokkok ellenőrzése (fáklya, stb.)
  checkSupportedBlocks(x, y, z);
};

// Támasztékot igénylő blokkok ellenőrzése
const checkSupportedBlocks = (x, y, z) => {
  // Felette lévő blokk (pl. fáklya a falon)
  const above = getBlock(x, y + 1, z);
  if (NEEDS_SUPPORT_BLOCKS.has(above)) {
    // Töröljük és item drop
    removeTorchOrientation(x, y + 1, z);
    setBlock(x, y + 1, z, 0, { skipPhysics: true });
    spawnItemDrop(x + 0.5, y + 1, z + 0.5, above, 1);
  }
  
  // Oldalsó blokkok (fáklya a falon)
  const directions = [
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y, z + 1],
    [x, y, z - 1],
  ];
  
  for (const [nx, ny, nz] of directions) {
    if (!isWithinWorld(nx, ny, nz)) continue;
    const block = getBlock(nx, ny, nz);
    if (NEEDS_SUPPORT_BLOCKS.has(block)) {
      // Ellenőrizzük hogy van-e támasz
      const hasSupport = checkBlockHasSupport(nx, ny, nz);
      if (!hasSupport) {
        removeTorchOrientation(nx, ny, nz);
        setBlock(nx, ny, nz, 0, { skipPhysics: true });
        spawnItemDrop(nx + 0.5, ny, nz + 0.5, block, 1);
      }
    }
  }
};

// Ellenőrzi hogy egy blokknak van-e támasz
const checkBlockHasSupport = (x, y, z) => {
  // Alatta
  const below = getBlock(x, y - 1, z);
  const belowDef = blockDefs[below];
  if (belowDef && belowDef.solid) return true;
  
  // Oldalt (bármelyik irányban)
  const directions = [
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y, z + 1],
    [x, y, z - 1],
  ];
  
  for (const [nx, ny, nz] of directions) {
    if (!isWithinWorld(nx, ny, nz)) continue;
    const block = getBlock(nx, ny, nz);
    const def = blockDefs[block];
    if (def && def.solid) return true;
  }
  
  return false;
};

