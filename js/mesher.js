import { CHUNK_SIZE, WORLD_MAX_HEIGHT } from "./config.js";
import { getBlockFaceTile, getBlockRenderGroup } from "./atlas.js";

const DIMS = [CHUNK_SIZE, WORLD_MAX_HEIGHT, CHUNK_SIZE];

const GROUP_OPAQUE = 1;
const GROUP_CUTOUT = 2;
const GROUP_WATER = 3;

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

const pushQuad = (buffers, origin, du, dv, normal, tile, flip, isWater) => {
  const [ox, oy, oz] = origin;
  const v0 = [ox, oy, oz];
  const v1 = [ox + du[0], oy + du[1], oz + du[2]];
  const v2 = [ox + du[0] + dv[0], oy + du[1] + dv[1], oz + du[2] + dv[2]];
  const v3 = [ox + dv[0], oy + dv[1], oz + dv[2]];
  const nx = normal[0];
  const ny = normal[1];
  const nz = normal[2];
  const base = buffers.vertexCount;
  
  // Textúra ismétlődik minden blokkon (mint Minecraftban)
  const uLen = Math.abs(du[0] + du[1] + du[2]);
  const vLen = Math.abs(dv[0] + dv[1] + dv[2]);
  const uMax = uLen;
  const vMax = vLen;

  pushVertex(buffers, v0[0], v0[1], v0[2], nx, ny, nz, 0, 0, tile);
  pushVertex(buffers, v1[0], v1[1], v1[2], nx, ny, nz, uMax, 0, tile);
  pushVertex(buffers, v2[0], v2[1], v2[2], nx, ny, nz, uMax, vMax, tile);
  pushVertex(buffers, v3[0], v3[1], v3[2], nx, ny, nz, 0, vMax, tile);

  if (!flip) {
    buffers.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    buffers.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
};

export const buildChunkMeshBuffers = (chunk, getBlockAt) => {
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

          const normal = [0, 0, 0];
          normal[d] = side;
          const flip = side === -1;

          const isWater = group === GROUP_WATER;
          pushQuad(buffersByGroup[group], origin, du, dv, normal, tile, flip, isWater);

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
