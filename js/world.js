import { THREE, scene } from "./scene.js";
import { CHUNK_RADIUS, CHUNK_SIZE, SEA_LEVEL, WORLD_MAX_HEIGHT, clamp, randomSeed, urlParams } from "./config.js";
import { noise2D, noise3D, hash2, smoothstep } from "./noise.js";
import { blockDefs } from "./textures.js";
import { atlasMaterials, blockFaceTiles, blockRenderGroups, blockMapFaces } from "./atlas.js";
import { buildChunkMeshBuffers } from "./mesher.js";
import { state } from "./state.js";
import { createWaterSystem } from "./water.js";

export const chunks = new Map();

export const keyFor = (x, y, z) => `${x},${y},${z}`;
const chunkKey = (cx, cz) => `${cx},${cz}`;

const blocksPerChunk = CHUNK_SIZE * CHUNK_SIZE * WORLD_MAX_HEIGHT;

const createQueue = () => ({ items: [], head: 0 });
const enqueue = (queue, item) => {
  queue.items.push(item);
};
const dequeue = (queue) => {
  if (queue.head >= queue.items.length) return null;
  const item = queue.items[queue.head];
  queue.head += 1;
  if (queue.head > 64 && queue.head > queue.items.length / 2) {
    queue.items = queue.items.slice(queue.head);
    queue.head = 0;
  }
  return item;
};
const queueSize = (queue) => queue.items.length - queue.head;

const worldToChunk = (x, z) => {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const lx = x - cx * CHUNK_SIZE;
  const lz = z - cz * CHUNK_SIZE;
  return { cx, cz, lx, lz };
};

const blockIndex = (lx, y, lz) => (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

const encodeWaterLevel = (level) => {
  if (!Number.isFinite(level)) return 1;
  const clamped = Math.max(0, Math.min(7, level));
  return clamped + 1;
};

const decodeWaterLevel = (stored) => {
  if (!stored) return 0;
  return Math.max(0, stored - 1);
};

const getChunk = (cx, cz) => chunks.get(chunkKey(cx, cz)) || null;

const createChunk = (cx, cz) => {
  const key = chunkKey(cx, cz);
  if (chunks.has(key)) return chunks.get(key);
  const chunk = {
    key,
    cx,
    cz,
    blocks: new Uint16Array(blocksPerChunk),
    water: new Uint8Array(blocksPerChunk),
    generated: false,
    loaded: false,
    dirty: false,
    genQueued: false,
    meshQueued: false,
    meshInFlight: false,
    meshNeedsRebuild: false,
    shouldBeLoaded: false,
    group: null,
    meshes: {
      opaque: null,
      cutout: null,
      water: null,
    },
  };
  chunks.set(key, chunk);
  return chunk;
};

export const isWithinWorld = (x, y, z) => y >= 0 && y < WORLD_MAX_HEIGHT;

export const getBlock = (x, y, z) => {
  if (!isWithinWorld(x, y, z)) return 0;
  const { cx, cz, lx, lz } = worldToChunk(x, z);
  const chunk = getChunk(cx, cz);
  if (!chunk || !chunk.generated) return 0;
  return chunk.blocks[blockIndex(lx, y, lz)] || 0;
};

export const getWaterLevel = (x, y, z) => {
  if (!isWithinWorld(x, y, z)) return 0;
  const { cx, cz, lx, lz } = worldToChunk(x, z);
  const chunk = getChunk(cx, cz);
  if (!chunk || !chunk.generated) return 0;
  const idx = blockIndex(lx, y, lz);
  if (chunk.blocks[idx] !== 8) return 0;
  return decodeWaterLevel(chunk.water[idx]);
};

export const setWaterLevel = (x, y, z, level, clearOnly = false) => {
  if (!isWithinWorld(x, y, z)) return;
  const { cx, cz, lx, lz } = worldToChunk(x, z);
  const chunk = getChunk(cx, cz);
  if (!chunk || !chunk.generated) return;
  const idx = blockIndex(lx, y, lz);
  if (clearOnly) {
    chunk.water[idx] = 0;
    return;
  }
  if (chunk.blocks[idx] !== 8) return;
  chunk.water[idx] = encodeWaterLevel(level);
};

const setBlockInChunk = (chunk, lx, y, lz, type, waterLevel = null) => {
  const idx = blockIndex(lx, y, lz);
  const prev = chunk.blocks[idx] || 0;
  if (prev === type) return prev;
  chunk.blocks[idx] = type;
  if (type === 8) {
    chunk.water[idx] = encodeWaterLevel(waterLevel ?? 0);
  } else {
    chunk.water[idx] = 0;
  }
  if (prev === 0 && type !== 0) state.blocks += 1;
  if (prev !== 0 && type === 0) state.blocks = Math.max(0, state.blocks - 1);
  return prev;
};

const markChunkDirty = (chunk) => {
  if (!chunk) return;
  chunk.dirty = true;
  if (chunk.meshInFlight) {
    chunk.meshNeedsRebuild = true;
    return;
  }
  if (!chunk.meshQueued) {
    chunk.meshQueued = true;
    enqueue(meshQueue, chunk);
  }
};

const markNeighborDirty = (cx, cz) => {
  const neighbor = getChunk(cx, cz);
  if (neighbor && neighbor.generated) {
    markChunkDirty(neighbor);
  }
};

const setGeneratedBlock = (x, y, z, type) => {
  if (!isWithinWorld(x, y, z)) return;
  const { cx, cz, lx, lz } = worldToChunk(x, z);
  const chunk = createChunk(cx, cz);
  const prev = chunk.blocks[blockIndex(lx, y, lz)] || 0;
  if (prev !== 0) return;
  chunk.blocks[blockIndex(lx, y, lz)] = type;
  if (type === 8) {
    chunk.water[blockIndex(lx, y, lz)] = encodeWaterLevel(0);
  } else {
    chunk.water[blockIndex(lx, y, lz)] = 0;
  }
  state.blocks += 1;
  if (chunk.generated) {
    markChunkDirty(chunk);
  }
};

const toSigned = (value) => value * 2 - 1;

const getTerrainInfo = (x, z) => {
  const warpX = toSigned(noise2D(x * 0.01 + 19.3, z * 0.01 + 7.1)) * 5.5;
  const warpZ = toSigned(noise2D(x * 0.01 - 31.7, z * 0.01 - 11.2)) * 5.5;
  const wx = x + warpX;
  const wz = z + warpZ;

  const continent = toSigned(noise2D(wx * 0.008, wz * 0.008));
  const hills = toSigned(noise2D(wx * 0.04, wz * 0.04));
  const detail = toSigned(noise2D(wx * 0.12, wz * 0.12));
  const mountainMask = noise2D(wx * 0.006 + 133.7, wz * 0.006 + 91.9);

  let height = 10 + continent * 4 + hills * 4.2 + detail * 1.8;
  const mountain = Math.max(0, mountainMask - 0.65) * 18;
  height += mountain;

  const riverValue = Math.abs(toSigned(noise2D(wx * 0.015 + 221.4, wz * 0.015 - 91.2)));
  const isRiver = riverValue < 0.08;
  if (isRiver) {
    height = Math.min(height, SEA_LEVEL - 1);
  }

  const lakeValue = noise2D(wx * 0.005 - 301.2, wz * 0.005 + 407.1);
  const isLake = lakeValue > 0.76 && height < SEA_LEVEL + 3;
  if (isLake) {
    height = Math.min(height, SEA_LEVEL - 1);
  }

  height = Math.max(3, Math.min(WORLD_MAX_HEIGHT - 4, Math.floor(height)));

  const moisture = noise2D(wx * 0.01 + 500.7, wz * 0.01 - 200.4);
  const temperature = noise2D(wx * 0.01 - 412.1, wz * 0.01 + 312.9);

  return {
    height,
    moisture,
    temperature,
    mountainMask,
    isRiver,
    isLake,
  };
};

const heightAt = (x, z) => getTerrainInfo(x, z).height;

export const findSpawn = () => {
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

export const spawn = findSpawn();

const oreConfigs = [
  { type: 14, maxY: 10, scale: 0.18, threshold: 0.83 },
  { type: 15, maxY: 14, scale: 0.17, threshold: 0.82 },
  { type: 16, maxY: 16, scale: 0.16, threshold: 0.82 },
  { type: 17, maxY: 8, scale: 0.2, threshold: 0.86 },
  { type: 13, maxY: 20, scale: 0.15, threshold: 0.8 },
  { type: 12, maxY: 24, scale: 0.14, threshold: 0.78 },
  { type: 7, maxY: 26, scale: 0.13, threshold: 0.76 },
];

const pickOreType = (x, y, z) => {
  for (const ore of oreConfigs) {
    if (y > ore.maxY) continue;
    const value = noise3D(x * ore.scale, y * ore.scale, z * ore.scale);
    if (value > ore.threshold) return ore.type;
  }
  return null;
};

const shouldCarveCave = (x, y, z, surfaceHeight) => {
  if (y < 2 || y > WORLD_MAX_HEIGHT - 2) return false;
  const depth = surfaceHeight - y;
  if (depth < 3) return false;
  const n1 = noise3D(x * 0.07, y * 0.07, z * 0.07);
  const n2 = noise3D(x * 0.14, y * 0.14, z * 0.14);
  const caveValue = n1 * 0.7 + n2 * 0.3;
  const depthFactor = clamp(depth / WORLD_MAX_HEIGHT, 0, 1);
  const surfaceBias = smoothstep(clamp((y - SEA_LEVEL) / 10, 0, 1));
  const threshold = 0.7 - depthFactor * 0.2 + surfaceBias * 0.08;
  return caveValue > threshold;
};

const isTreeCandidate = (x, z, moisture, temperature) => {
  if (moisture < 0.28) return false;
  const forestBias = moisture > 0.6 && temperature > 0.35;
  const cellSize = forestBias ? 6 : 9;
  const cellX = Math.floor(x / cellSize);
  const cellZ = Math.floor(z / cellSize);
  const density = forestBias ? 0.65 : 0.32;
  const cellRoll = hash2(cellX * 2.1, cellZ * 2.9);
  if (cellRoll > density) return false;
  const offsetX = Math.floor(hash2(cellX + 13.7, cellZ + 91.3) * cellSize);
  const offsetZ = Math.floor(hash2(cellX + 53.9, cellZ + 17.2) * cellSize);
  return x === cellX * cellSize + offsetX && z === cellZ * cellSize + offsetZ;
};

const generateChunk = (chunk) => {
  if (chunk.generated) return;
  const startX = chunk.cx * CHUNK_SIZE;
  const startZ = chunk.cz * CHUNK_SIZE;

  for (let x = 0; x < CHUNK_SIZE; x += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      const worldX = startX + x;
      const worldZ = startZ + z;
      const terrain = getTerrainInfo(worldX, worldZ);
      const height = terrain.height;
      const isBeach = height <= SEA_LEVEL + 1 || terrain.isRiver || terrain.isLake;
      const isDesert = terrain.moisture < 0.25 && terrain.temperature > 0.4;
      // Reduce rocky coverage so stone only appears on higher peaks/cliffs.
      const isRocky = terrain.mountainMask > 0.82 || height > SEA_LEVEL + 12;
      const topType = isRocky ? 3 : isDesert || isBeach ? 6 : 1;
      const fillerType = isRocky ? 3 : isDesert || isBeach ? 6 : 2;

      for (let y = 0; y < height; y += 1) {
        let type = 3;
        if (y >= height - 1) type = topType;
        else if (y >= height - 3) type = fillerType;

        if (y > 2 && y < height - 1 && shouldCarveCave(worldX, y, worldZ, height)) {
          continue;
        }

        if (type === 3 && y < height - 1) {
          const oreType = pickOreType(worldX, y, worldZ);
          if (oreType) type = oreType;
        }

        setGeneratedBlock(worldX, y, worldZ, type);
      }

      if (height < SEA_LEVEL) {
        for (let y = height; y <= SEA_LEVEL; y += 1) {
          if (!shouldCarveCave(worldX, y, worldZ, height)) {
            setGeneratedBlock(worldX, y, worldZ, 8);
          }
        }
      }

      const noTreeZone = Math.abs(worldX - spawn.x) <= 2 && Math.abs(worldZ - spawn.z) <= 2;
      const canGrowTree = topType === 1 && fillerType === 2;
      if (
        !noTreeZone &&
        !isBeach &&
        !isDesert &&
        canGrowTree &&
        height < WORLD_MAX_HEIGHT - 7 &&
        isTreeCandidate(worldX, worldZ, terrain.moisture, terrain.temperature)
      ) {
        const trunkHeight = 3 + Math.floor(hash2(worldX * 1.1, worldZ * 1.3) * 3);
        for (let t = 0; t < trunkHeight; t += 1) {
          setGeneratedBlock(worldX, height + t, worldZ, 4);
        }
        for (let lx = -2; lx <= 2; lx += 1) {
          for (let lz = -2; lz <= 2; lz += 1) {
            for (let ly = 0; ly <= 2; ly += 1) {
              const dist = Math.abs(lx) + Math.abs(lz) + ly;
              if (dist < 4) {
                setGeneratedBlock(worldX + lx, height + trunkHeight - 1 + ly, worldZ + lz, 5);
              }
            }
          }
        }
      }
    }
  }

  chunk.generated = true;
  markChunkDirty(chunk);
  markNeighborDirty(chunk.cx - 1, chunk.cz);
  markNeighborDirty(chunk.cx + 1, chunk.cz);
  markNeighborDirty(chunk.cx, chunk.cz - 1);
  markNeighborDirty(chunk.cx, chunk.cz + 1);
};

const applyBuffersToMesh = (chunk, key, buffers, material) => {
  if (buffers.vertexCount === 0) {
    const existing = chunk.meshes[key];
    if (existing && existing.parent) existing.parent.remove(existing);
    chunk.meshes[key] = null;
    return;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute("aTile", new THREE.Float32BufferAttribute(buffers.tiles, 1));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();

  let mesh = chunk.meshes[key];
  if (!mesh) {
    mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = true;
    mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    chunk.meshes[key] = mesh;
    chunk.group.add(mesh);
  } else {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    mesh.material = material;
  }

  if (key === "water") {
    mesh.renderOrder = 1;
  }
};

const applyChunkMeshBuffers = (chunk, buffers) => {
  if (!chunk.generated) return;
  if (!chunk.group) {
    chunk.group = new THREE.Group();
    chunk.group.name = `chunk-${chunk.key}`;
    chunk.group.position.set(0, 0, 0);
    scene.add(chunk.group);
  }

  applyBuffersToMesh(chunk, "opaque", buffers.opaque, atlasMaterials.opaque);
  applyBuffersToMesh(chunk, "cutout", buffers.cutout, atlasMaterials.cutout);
  applyBuffersToMesh(chunk, "water", buffers.water, atlasMaterials.water);

  chunk.dirty = false;
  chunk.meshQueued = false;
  chunk.meshInFlight = false;
  chunk.loaded = true;
};

const rebuildChunkMesh = (chunk) => {
  if (!chunk.generated) return;
  const buffers = buildChunkMeshBuffers(chunk, getBlock);
  applyChunkMeshBuffers(chunk, buffers);
};

const unloadChunk = (chunk) => {
  if (!chunk.loaded) return;
  if (chunk.group) {
    chunk.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    scene.remove(chunk.group);
  }
  chunk.group = null;
  chunk.meshes.opaque = null;
  chunk.meshes.cutout = null;
  chunk.meshes.water = null;
  chunk.loaded = false;
  chunk.meshQueued = false;
  chunk.meshInFlight = false;
  chunk.meshNeedsRebuild = false;
};

const genQueue = createQueue();
const meshQueue = createQueue();
const meshApplyQueue = createQueue();
const meshJobs = new Map();
let meshWorker = null;
let meshWorkerAvailable = typeof Worker !== "undefined";
const meshWorkerDisabled =
  urlParams.get("mesher")?.toLowerCase() === "main" || urlParams.get("meshworker") === "0";
if (meshWorkerDisabled) meshWorkerAvailable = false;
let meshJobId = 1;
const worldTimings = {
  genMs: 0,
  meshMs: 0,
  waterMs: 0,
  workerMeshMs: 0,
};

const faceSize = WORLD_MAX_HEIGHT * CHUNK_SIZE;

const extractNeighborFace = (neighbor, face) => {
  const data = new Uint16Array(faceSize);
  if (!neighbor || !neighbor.generated) return data;
  for (let y = 0; y < WORLD_MAX_HEIGHT; y += 1) {
    for (let offset = 0; offset < CHUNK_SIZE; offset += 1) {
      let lx = offset;
      let lz = offset;
      if (face === "left") lx = CHUNK_SIZE - 1;
      if (face === "right") lx = 0;
      if (face === "back") lz = CHUNK_SIZE - 1;
      if (face === "front") lz = 0;
      const idx = blockIndex(lx, y, lz);
      data[y * CHUNK_SIZE + offset] = neighbor.blocks[idx] || 0;
    }
  }
  return data;
};

const initMeshWorker = () => {
  if (!meshWorkerAvailable || meshWorker) return;
  try {
    meshWorker = new Worker(new URL("./mesher-worker.js", import.meta.url), { type: "module" });
  } catch (err) {
    console.warn("Failed to start meshing worker", err);
    meshWorkerAvailable = false;
    meshWorker = null;
    return;
  }
  meshWorker.postMessage({
    type: "init",
    chunkSize: CHUNK_SIZE,
    worldHeight: WORLD_MAX_HEIGHT,
    randomSeed,
    blockFaceTiles,
    blockRenderGroups,
    blockMapFaces,
  });
  meshWorker.onmessage = (event) => {
    const payload = event.data;
    if (!payload || payload.type !== "meshResult") return;
    enqueue(meshApplyQueue, payload);
  };
  meshWorker.onerror = (err) => {
    console.warn("Meshing worker error", err);
    meshWorkerAvailable = false;
    meshWorker = null;
  };
};

const queueGenerate = (chunk) => {
  if (chunk.genQueued) return;
  chunk.genQueued = true;
  enqueue(genQueue, chunk);
};

const sendMeshJob = (chunk) => {
  if (!chunk.generated) return;
  if (!meshWorkerAvailable || !meshWorker) {
    rebuildChunkMesh(chunk);
    return;
  }
  const left = extractNeighborFace(getChunk(chunk.cx - 1, chunk.cz), "left");
  const right = extractNeighborFace(getChunk(chunk.cx + 1, chunk.cz), "right");
  const back = extractNeighborFace(getChunk(chunk.cx, chunk.cz - 1), "back");
  const front = extractNeighborFace(getChunk(chunk.cx, chunk.cz + 1), "front");
  const blocksCopy = chunk.blocks.slice();
  const jobId = meshJobId++;
  chunk.meshInFlight = true;
  meshJobs.set(jobId, { chunk, sentAt: performance.now() });
  meshWorker.postMessage(
    {
      type: "mesh",
      jobId,
      cx: chunk.cx,
      cz: chunk.cz,
      blocks: blocksCopy,
      neighbors: { left, right, back, front },
    },
    [blocksCopy.buffer, left.buffer, right.buffer, back.buffer, front.buffer]
  );
};

const drainMeshApplyQueue = (budgetMs) => {
  const start = performance.now();
  while (queueSize(meshApplyQueue) && performance.now() - start < budgetMs) {
    const payload = dequeue(meshApplyQueue);
    if (!payload || payload.type !== "meshResult") continue;
    const job = meshJobs.get(payload.jobId);
    if (!job) continue;
    meshJobs.delete(payload.jobId);
    const chunk = job.chunk;
    chunk.meshInFlight = false;
    if (!chunk.shouldBeLoaded) continue;
    applyChunkMeshBuffers(chunk, payload.buffers);
    worldTimings.workerMeshMs = payload.timeMs || 0;
    if (chunk.meshNeedsRebuild) {
      chunk.meshNeedsRebuild = false;
      markChunkDirty(chunk);
    }
  }
  worldTimings.meshMs = performance.now() - start;
};

export const ensureChunksAround = (x, z) => {
  const { cx, cz } = worldToChunk(x, z);
  if (state.currentChunkX === cx && state.currentChunkZ === cz) return;
  state.currentChunkX = cx;
  state.currentChunkZ = cz;

  const genCandidates = [];
  const meshCandidates = [];
  const needed = new Set();
  for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx += 1) {
    for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz += 1) {
      const nx = cx + dx;
      const nz = cz + dz;
      const key = chunkKey(nx, nz);
      needed.add(key);
      const chunk = createChunk(nx, nz);
      chunk.shouldBeLoaded = true;
      if (!chunk.generated) {
        if (!chunk.genQueued) genCandidates.push({ chunk, dist: dx * dx + dz * dz });
      } else if ((chunk.dirty || !chunk.loaded) && !chunk.meshQueued) {
        meshCandidates.push({ chunk, dist: dx * dx + dz * dz });
      }
    }
  }

  genCandidates.sort((a, b) => a.dist - b.dist).forEach(({ chunk }) => queueGenerate(chunk));
  meshCandidates.sort((a, b) => a.dist - b.dist).forEach(({ chunk }) => {
    chunk.meshQueued = true;
    enqueue(meshQueue, chunk);
  });

  for (const [key, chunk] of chunks) {
    if (!needed.has(key)) {
      chunk.shouldBeLoaded = false;
      if (chunk.loaded) unloadChunk(chunk);
    }
  }
};

export const updateWorld = () => {
  const genBudgetMs = 2.5;
  const meshBudgetMs = 1.5;
  const meshApplyBudgetMs = 1.5;
  const maxMeshJobsPerFrame = 2;
  const startGen = performance.now();
  while (queueSize(genQueue) && performance.now() - startGen < genBudgetMs) {
    const chunk = dequeue(genQueue);
    if (!chunk) break;
    chunk.genQueued = false;
    generateChunk(chunk);
  }
  worldTimings.genMs = performance.now() - startGen;

  if (meshWorkerAvailable && meshWorker) {
    let jobs = 0;
    const startMesh = performance.now();
    while (queueSize(meshQueue) && performance.now() - startMesh < meshBudgetMs && jobs < maxMeshJobsPerFrame) {
      const chunk = dequeue(meshQueue);
      if (!chunk) break;
      chunk.meshQueued = false;
      if (!chunk.shouldBeLoaded) continue;
      sendMeshJob(chunk);
      jobs += 1;
    }
    drainMeshApplyQueue(meshApplyBudgetMs);
  } else {
    const startMesh = performance.now();
    while (queueSize(meshQueue) && performance.now() - startMesh < meshBudgetMs) {
      const chunk = dequeue(meshQueue);
      if (!chunk) break;
      if (!chunk.shouldBeLoaded) {
        chunk.meshQueued = false;
        continue;
      }
      rebuildChunkMesh(chunk);
    }
    worldTimings.meshMs = performance.now() - startMesh;
  }

  if (waterSystem) {
    const waterStart = performance.now();
    waterSystem.update(1.25, 220);
    worldTimings.waterMs = performance.now() - waterStart;
  } else {
    worldTimings.waterMs = 0;
  }
};

let waterSystem = null;

export const setBlock = (x, y, z, type, options = {}) => {
  if (!isWithinWorld(x, y, z)) return false;
  const { cx, cz, lx, lz } = worldToChunk(x, z);
  const chunk = createChunk(cx, cz);
  if (!chunk.generated) generateChunk(chunk);

  const prev = setBlockInChunk(chunk, lx, y, lz, type, options.waterLevel ?? null);
  if (prev === type) return true;

  markChunkDirty(chunk);
  if (lx === 0) markNeighborDirty(cx - 1, cz);
  if (lx === CHUNK_SIZE - 1) markNeighborDirty(cx + 1, cz);
  if (lz === 0) markNeighborDirty(cx, cz - 1);
  if (lz === CHUNK_SIZE - 1) markNeighborDirty(cx, cz + 1);
  if (!options.skipWater && waterSystem) {
    waterSystem.onBlockChanged(x, y, z, prev, type);
  }
  return true;
};

export const removeBlock = (x, y, z) => setBlock(x, y, z, 0);

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

export const initializeWorld = () => {
  if (state.worldInitialized) return;
  initMeshWorker();
  ensureChunksAround(spawn.x, spawn.z);
  clearSpawnArea();
  if (!waterSystem) {
    waterSystem = createWaterSystem({
      getBlock,
      setBlock,
      getWaterLevel,
      setWaterLevel,
      isWithinWorld,
    });
  }
  state.worldInitialized = true;
};

export const isSolid = (x, y, z) => {
  if (!isWithinWorld(x, y, z)) return true;
  const type = getBlock(x, y, z);
  if (type === 0) return false;
  const def = blockDefs[type];
  return def ? def.solid !== false : true;
};

export const getWorldStats = () => {
  let loadedChunks = 0;
  let dirtyChunks = 0;
  for (const chunk of chunks.values()) {
    if (chunk.loaded) loadedChunks += 1;
    if (chunk.dirty) dirtyChunks += 1;
  }
  return {
    chunks: chunks.size,
    loadedChunks,
    dirtyQueue: dirtyChunks,
    genQueue: queueSize(genQueue),
    meshQueue: queueSize(meshQueue),
    waterQueue: waterSystem ? waterSystem.getQueueSize() : 0,
  };
};

export const getWorldTimings = () => ({ ...worldTimings });
