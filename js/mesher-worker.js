let CHUNK_SIZE = 16;
let WORLD_MAX_HEIGHT = 32;
let randomSeed = 0;
let blockFaceTiles = {};
let blockRenderGroups = {};
let blockMapFaces = {};

const GROUP_OPAQUE = 1;
const GROUP_CUTOUT = 2;
const GROUP_WATER = 3;

const DIMS = [CHUNK_SIZE, WORLD_MAX_HEIGHT, CHUNK_SIZE];

const updateDims = () => {
  DIMS[0] = CHUNK_SIZE;
  DIMS[1] = WORLD_MAX_HEIGHT;
  DIMS[2] = CHUNK_SIZE;
};

const fract = (value) => value - Math.floor(value);

const hash3 = (x, y, z) => {
  const h =
    Math.sin(x * 127.1 + y * 269.5 + z * 311.7 + randomSeed * 0.0007) * 43758.5453;
  return fract(h);
};

const getBlockRenderGroup = (type) => blockRenderGroups[type] || "opaque";

const getBlockFaceTile = (type, faceIndex, x, y, z) => {
  const variants = blockFaceTiles[type];
  if (!variants || variants.length === 0) return 0;
  const variantIndex = Math.floor(hash3(x, y, z) * variants.length) % variants.length;
  const tilesForVariant = variants[variantIndex];
  const mapFace = blockMapFaces[type];
  if (mapFace === "top") {
    return tilesForVariant?.[2] ?? tilesForVariant?.[0] ?? 0;
  }
  if (mapFace === "side") {
    return tilesForVariant?.[0] ?? 0;
  }
  return tilesForVariant?.[faceIndex] ?? 0;
};

const groupIdForType = (type) => {
  const group = getBlockRenderGroup(type);
  if (group === "water") return GROUP_WATER;
  if (group === "cutout") return GROUP_CUTOUT;
  return GROUP_OPAQUE;
};

const shouldRenderFace = (typeA, typeB) => {
  if (!typeA) return false;
  if (!typeB) return true;
  const groupA = groupIdForType(typeA);
  const groupB = groupIdForType(typeB);
  if (groupA === groupB) return false;
  return true;
};

const faceIndexFor = (axis, side) => {
  if (axis === 0) return side === 1 ? 0 : 1;
  if (axis === 1) return side === 1 ? 2 : 3;
  return side === 1 ? 4 : 5;
};

const createBuffers = () => ({
  positions: [],
  normals: [],
  uvs: [],
  tiles: [],
  indices: [],
  vertexCount: 0,
});

const pushVertex = (buffers, x, y, z, nx, ny, nz, u, v, tile) => {
  buffers.positions.push(x, y, z);
  buffers.normals.push(nx, ny, nz);
  buffers.uvs.push(u, v);
  buffers.tiles.push(tile);
  buffers.vertexCount += 1;
};

const pushQuad = (buffers, origin, du, dv, normal, tile, flip, isWater, worldPos) => {
  const [ox, oy, oz] = origin;
  const v0 = [ox, oy, oz];
  const v1 = [ox + du[0], oy + du[1], oz + du[2]];
  const v2 = [ox + du[0] + dv[0], oy + du[1] + dv[1], oz + du[2] + dv[2]];
  const v3 = [ox + dv[0], oy + dv[1], oz + dv[2]];
  const nx = normal[0];
  const ny = normal[1];
  const nz = normal[2];
  const base = buffers.vertexCount;
  const uLen = Math.abs(du[0] + du[1] + du[2]);
  const vLen = Math.abs(dv[0] + dv[1] + dv[2]);
  const uMax = uLen;
  const vMax = vLen;

  let u0 = 0;
  let v0val = 0;
  let u1 = uMax;
  let v1val = 0;
  let u2 = uMax;
  let v2val = vMax;
  let u3 = 0;
  let v3val = vMax;

  if (isWater && worldPos) {
    const [wx, wy, wz] = worldPos;
    if (Math.abs(nx) > 0) {
      u0 = wz + v0[2] - oz;
      v0val = wy + v0[1] - oy;
      u1 = wz + v1[2] - oz;
      v1val = wy + v1[1] - oy;
      u2 = wz + v2[2] - oz;
      v2val = wy + v2[1] - oy;
      u3 = wz + v3[2] - oz;
      v3val = wy + v3[1] - oy;
    } else if (Math.abs(ny) > 0) {
      u0 = wx + v0[0] - ox;
      v0val = wz + v0[2] - oz;
      u1 = wx + v1[0] - ox;
      v1val = wz + v1[2] - oz;
      u2 = wx + v2[0] - ox;
      v2val = wz + v2[2] - oz;
      u3 = wx + v3[0] - ox;
      v3val = wz + v3[2] - oz;
    } else {
      u0 = wx + v0[0] - ox;
      v0val = wy + v0[1] - oy;
      u1 = wx + v1[0] - ox;
      v1val = wy + v1[1] - oy;
      u2 = wx + v2[0] - ox;
      v2val = wy + v2[1] - oy;
      u3 = wx + v3[0] - ox;
      v3val = wy + v3[1] - oy;
    }
  } else {
    u0 = 0;
    v0val = 0;
    u1 = uMax;
    v1val = 0;
    u2 = uMax;
    v2val = vMax;
    u3 = 0;
    v3val = vMax;
  }

  pushVertex(buffers, v0[0], v0[1], v0[2], nx, ny, nz, u0, v0val, tile);
  pushVertex(buffers, v1[0], v1[1], v1[2], nx, ny, nz, u1, v1val, tile);
  pushVertex(buffers, v2[0], v2[1], v2[2], nx, ny, nz, u2, v2val, tile);
  pushVertex(buffers, v3[0], v3[1], v3[2], nx, ny, nz, u3, v3val, tile);

  if (!flip) {
    buffers.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    buffers.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
};

const buildChunkMeshBuffers = (chunk, getBlockAt) => {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  const buffersByGroup = {
    [GROUP_OPAQUE]: createBuffers(),
    [GROUP_CUTOUT]: createBuffers(),
    [GROUP_WATER]: createBuffers(),
  };

  for (let d = 0; d < 3; d += 1) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;

    const maskSize = DIMS[u] * DIMS[v];
    const maskType = new Uint16Array(maskSize);
    const maskTile = new Uint16Array(maskSize);
    const maskSide = new Int8Array(maskSize);
    const maskGroup = new Uint8Array(maskSize);

    for (x[d] = -1; x[d] < DIMS[d]; ) {
      let n = 0;
      for (x[v] = 0; x[v] < DIMS[v]; x[v] += 1) {
        for (x[u] = 0; x[u] < DIMS[u]; x[u] += 1) {
          const ax = baseX + x[0];
          const ay = x[1];
          const az = baseZ + x[2];
          const bx = baseX + x[0] + q[0];
          const by = x[1] + q[1];
          const bz = baseZ + x[2] + q[2];

          const a = x[d] >= 0 ? getBlockAt(ax, ay, az) : 0;
          const b = x[d] < DIMS[d] - 1 ? getBlockAt(bx, by, bz) : 0;

          let type = 0;
          let side = 0;
          let tile = 0;
          let group = 0;

          if (shouldRenderFace(a, b)) {
            type = a;
            side = 1;
            const faceIndex = faceIndexFor(d, side);
            tile = getBlockFaceTile(type, faceIndex, ax, ay, az);
            group = groupIdForType(type);
          } else if (shouldRenderFace(b, a)) {
            type = b;
            side = -1;
            const faceIndex = faceIndexFor(d, side);
            tile = getBlockFaceTile(type, faceIndex, bx, by, bz);
            group = groupIdForType(type);
          }

          maskType[n] = type;
          maskTile[n] = tile;
          maskSide[n] = side;
          maskGroup[n] = group;
          n += 1;
        }
      }

      x[d] += 1;
      const slice = x[d];
      n = 0;
      for (let j = 0; j < DIMS[v]; j += 1) {
        for (let i = 0; i < DIMS[u]; ) {
          const type = maskType[n];
          if (!type) {
            i += 1;
            n += 1;
            continue;
          }
          const tile = maskTile[n];
          const side = maskSide[n];
          const group = maskGroup[n];

          let w = 1;
          while (
            i + w < DIMS[u] &&
            maskType[n + w] === type &&
            maskTile[n + w] === tile &&
            maskSide[n + w] === side &&
            maskGroup[n + w] === group
          ) {
            w += 1;
          }

          let h = 1;
          outer: for (; j + h < DIMS[v]; h += 1) {
            for (let k = 0; k < w; k += 1) {
              const idx = n + k + h * DIMS[u];
              if (
                maskType[idx] !== type ||
                maskTile[idx] !== tile ||
                maskSide[idx] !== side ||
                maskGroup[idx] !== group
              ) {
                break outer;
              }
            }
          }

          x[u] = i;
          x[v] = j;
          const du = [0, 0, 0];
          const dv = [0, 0, 0];
          du[u] = w;
          dv[v] = h;

          const origin = [
            d === 0 ? slice : x[0],
            d === 1 ? slice : x[1],
            d === 2 ? slice : x[2],
          ];

          const worldPos = [
            baseX + (d === 0 ? slice : x[0]),
            d === 1 ? slice : x[1],
            baseZ + (d === 2 ? slice : x[2]),
          ];

          const normal = [0, 0, 0];
          normal[d] = side;
          const flip = side === -1;

          const isWater = group === GROUP_WATER;
          pushQuad(buffersByGroup[group], origin, du, dv, normal, tile, flip, isWater, worldPos);

          for (let dy = 0; dy < h; dy += 1) {
            for (let dx = 0; dx < w; dx += 1) {
              const idx = n + dx + dy * DIMS[u];
              maskType[idx] = 0;
            }
          }

          i += w;
          n += w;
        }
      }
    }
  }

  return {
    opaque: buffersByGroup[GROUP_OPAQUE],
    cutout: buffersByGroup[GROUP_CUTOUT],
    water: buffersByGroup[GROUP_WATER],
  };
};

const packBuffers = (buffers) => {
  if (!buffers || buffers.vertexCount === 0) {
    return {
      vertexCount: 0,
      positions: null,
      normals: null,
      uvs: null,
      tiles: null,
      indices: null,
    };
  }
  const positions = new Float32Array(buffers.positions);
  const normals = new Float32Array(buffers.normals);
  const uvs = new Float32Array(buffers.uvs);
  const tiles = new Float32Array(buffers.tiles);
  const use32 = buffers.vertexCount > 65535;
  const indexArray = use32 ? new Uint32Array(buffers.indices) : new Uint16Array(buffers.indices);
  return {
    vertexCount: buffers.vertexCount,
    positions: positions.buffer,
    normals: normals.buffer,
    uvs: uvs.buffer,
    tiles: tiles.buffer,
    indices: indexArray.buffer,
    indexType: use32 ? "u32" : "u16",
  };
};

self.onmessage = (event) => {
  const payload = event.data;
  if (!payload || !payload.type) return;
  if (payload.type === "init") {
    CHUNK_SIZE = payload.chunkSize || CHUNK_SIZE;
    WORLD_MAX_HEIGHT = payload.worldHeight || WORLD_MAX_HEIGHT;
    randomSeed = payload.randomSeed || 0;
    blockFaceTiles = payload.blockFaceTiles || {};
    blockRenderGroups = payload.blockRenderGroups || {};
    blockMapFaces = payload.blockMapFaces || {};
    updateDims();
    return;
  }
  if (payload.type !== "mesh") return;
  const { jobId, cx, cz, blocks, neighbors } = payload;
  const start = performance.now();
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  const faceStride = CHUNK_SIZE;
  const faceIndex = (y, offset) => y * faceStride + offset;

  const getNeighbor = (side, y, offset) => {
    const face = neighbors?.[side];
    if (!face) return 0;
    if (offset < 0 || offset >= CHUNK_SIZE) return 0;
    const idx = faceIndex(y, offset);
    return face[idx] || 0;
  };

  const getBlockAt = (x, y, z) => {
    if (y < 0 || y >= WORLD_MAX_HEIGHT) return 0;
    const lx = x - baseX;
    const lz = z - baseZ;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      const idx = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
      return blocks[idx] || 0;
    }
    if (lx < 0) return getNeighbor("left", y, lz);
    if (lx >= CHUNK_SIZE) return getNeighbor("right", y, lz);
    if (lz < 0) return getNeighbor("back", y, lx);
    if (lz >= CHUNK_SIZE) return getNeighbor("front", y, lx);
    return 0;
  };

  const meshBuffers = buildChunkMeshBuffers({ cx, cz }, getBlockAt);
  const opaque = packBuffers(meshBuffers.opaque);
  const cutout = packBuffers(meshBuffers.cutout);
  const water = packBuffers(meshBuffers.water);
  const elapsedMs = performance.now() - start;

  const transfer = [];
  const collectTransfer = (buf) => {
    if (buf?.positions) transfer.push(buf.positions);
    if (buf?.normals) transfer.push(buf.normals);
    if (buf?.uvs) transfer.push(buf.uvs);
    if (buf?.tiles) transfer.push(buf.tiles);
    if (buf?.indices) transfer.push(buf.indices);
  };
  collectTransfer(opaque);
  collectTransfer(cutout);
  collectTransfer(water);

  self.postMessage(
    {
      type: "meshResult",
      jobId,
      cx,
      cz,
      timeMs: elapsedMs,
      buffers: {
        opaque,
        cutout,
        water,
      },
    },
    transfer
  );
};
