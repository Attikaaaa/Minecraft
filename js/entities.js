import { THREE, scene } from "./scene.js";
import { CHUNK_SIZE, VIEW_RADIUS_MAX, VIEW_RADIUS_MIN, VIEW_RADIUS_UNLIMITED, clamp } from "./config.js";
import { state } from "./state.js";
import { itemDefs } from "./items.js";
import { addItemToInventory, updateAllSlotsUI } from "./inventory.js";
import { isSolid } from "./world.js";

export const itemEntities = [];
const itemEntitiesById = new Map();
let nextItemEntityId = 1;
const itemTextures = new Map();
const tempVec = new THREE.Vector3();
const itemRadius = 0.2;
const itemHalfHeight = 0.25;
const itemEpsilon = 0.001;
const collisionHeights = [-itemHalfHeight + 0.05, itemHalfHeight - 0.05];

const isBlockedAt = (x, y, z) => isSolid(Math.floor(x), Math.floor(y), Math.floor(z));

const hitsAnyBlock = (x, y, z) => {
  for (const dy of collisionHeights) {
    const py = y + dy;
    for (const dx of [-itemRadius, itemRadius]) {
      const px = x + dx;
      for (const dz of [-itemRadius, itemRadius]) {
        const pz = z + dz;
        if (isBlockedAt(px, py, pz)) return true;
      }
    }
  }
  return false;
};

const hitsFloor = (x, y, z) => {
  const py = y - itemHalfHeight - itemEpsilon;
  for (const dx of [-itemRadius, itemRadius]) {
    const px = x + dx;
    for (const dz of [-itemRadius, itemRadius]) {
      const pz = z + dz;
      if (isBlockedAt(px, py, pz)) return true;
    }
  }
  return false;
};

const hitsCeiling = (x, y, z) => {
  const py = y + itemHalfHeight + itemEpsilon;
  for (const dx of [-itemRadius, itemRadius]) {
    const px = x + dx;
    for (const dz of [-itemRadius, itemRadius]) {
      const pz = z + dz;
      if (isBlockedAt(px, py, pz)) return true;
    }
  }
  return false;
};

const snapToGround = (x, y, z) => {
  let floorY = Math.floor(y - itemHalfHeight);
  for (let step = 0; step < 3; step += 1) {
    if (isBlockedAt(x, floorY, z)) {
      return floorY + 1 + itemHalfHeight;
    }
    floorY -= 1;
  }
  return y;
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

const createItemEntity = (id, count, position, entityId = null) => {
  const texture = getItemTexture(id);
  if (!texture) return null;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.45, 0.45, 0.45);
  sprite.position.copy(position);
  scene.add(sprite);

  const resolvedId = entityId ?? nextItemEntityId++;
  const entity = {
    entityId: resolvedId,
    id,
    count,
    position: position.clone(),
    velocity: new THREE.Vector3(0, 0, 0),
    mesh: sprite,
    age: 0,
    onGround: false,
    bobOffset: Math.random() * Math.PI * 2,
  };
  itemEntities.push(entity);
  itemEntitiesById.set(resolvedId, entity);
  return entity;
};

export const spawnItemDrop = (id, count, x, y, z, entityId = null) => {
  if (!id || count <= 0) return;
  const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
  createItemEntity(id, count, pos, entityId);
};

export const updateItemEntities = (dt, time, player, isPlaying, options = {}) => {
  if (itemEntities.length === 0) return;
  const simulatePhysics = options.simulatePhysics !== false;
  const allowCleanup = options.allowCleanup !== false;
  const onPickup = typeof options.onPickup === "function" ? options.onPickup : null;
  const gravity = 18;
  const airDrag = 2.2;
  const groundFriction = 14;
  const settleSpeed = 0.01;
  const pickupRadius = 1.2;
  const maxAge = 300;
  const maxRadius = state.unlimitedViewDistance ? VIEW_RADIUS_UNLIMITED : VIEW_RADIUS_MAX;
  const viewRadius = clamp(Math.round(state.viewRadius ?? 2), VIEW_RADIUS_MIN, maxRadius);
  const maxDistance = CHUNK_SIZE * (viewRadius + 1.5);
  const pickupRadiusSq = pickupRadius * pickupRadius;
  const maxDistanceSq = maxDistance * maxDistance;

  for (let i = itemEntities.length - 1; i >= 0; i -= 1) {
    const entity = itemEntities[i];
    entity.age += dt;
    if (allowCleanup && entity.age > maxAge) {
      scene.remove(entity.mesh);
      itemEntitiesById.delete(entity.entityId);
      itemEntities.splice(i, 1);
      continue;
    }

    const dx = entity.position.x - player.position.x;
    const dz = entity.position.z - player.position.z;
    if (allowCleanup && dx * dx + dz * dz > maxDistanceSq) {
      scene.remove(entity.mesh);
      itemEntitiesById.delete(entity.entityId);
      itemEntities.splice(i, 1);
      continue;
    }

    if (simulatePhysics) {
      if (!entity.onGround) {
        entity.velocity.y -= gravity * dt;
      } else {
        entity.velocity.y = 0;
      }

      const drag = Math.exp(-airDrag * dt);
      entity.velocity.x *= drag;
      entity.velocity.z *= drag;

      tempVec.copy(entity.position);
      entity.onGround = false;

      let nextY = tempVec.y + entity.velocity.y * dt;
      if (entity.velocity.y < 0 && hitsFloor(tempVec.x, nextY, tempVec.z)) {
        nextY = snapToGround(tempVec.x, nextY, tempVec.z);
        entity.velocity.y = 0;
        entity.onGround = true;
      } else if (entity.velocity.y > 0 && hitsCeiling(tempVec.x, nextY, tempVec.z)) {
        const ceilY = Math.floor(nextY + itemHalfHeight);
        nextY = ceilY - itemHalfHeight - itemEpsilon;
        entity.velocity.y = 0;
      }
      tempVec.y = nextY;

      let nextX = tempVec.x + entity.velocity.x * dt;
      if (!hitsAnyBlock(nextX, tempVec.y, tempVec.z)) {
        tempVec.x = nextX;
      } else {
        entity.velocity.x = 0;
      }

      let nextZ = tempVec.z + entity.velocity.z * dt;
      if (!hitsAnyBlock(tempVec.x, tempVec.y, nextZ)) {
        tempVec.z = nextZ;
      } else {
        entity.velocity.z = 0;
      }

      if (hitsFloor(tempVec.x, tempVec.y, tempVec.z)) {
        entity.onGround = true;
        tempVec.y = snapToGround(tempVec.x, tempVec.y, tempVec.z);
        const groundDrag = Math.exp(-groundFriction * dt);
        entity.velocity.x *= groundDrag;
        entity.velocity.z *= groundDrag;
        if (Math.abs(entity.velocity.x) < settleSpeed) entity.velocity.x = 0;
        if (Math.abs(entity.velocity.z) < settleSpeed) entity.velocity.z = 0;
        if (entity.velocity.x !== 0 || entity.velocity.z !== 0) {
          entity.velocity.x = 0;
          entity.velocity.z = 0;
        }
      }

      entity.position.copy(tempVec);
    }
    const bob = entity.onGround ? 0 : Math.sin(time * 2 + entity.bobOffset) * 0.05;
    entity.mesh.position.set(entity.position.x, entity.position.y + bob, entity.position.z);
    if (entity.mesh.material) {
      entity.mesh.material.rotation = time * 0.8 + entity.bobOffset;
    }

    if (isPlaying) {
      const dy = entity.position.y - player.position.y;
      const distSq = dx * dx + dz * dz + dy * dy;
      if (distSq < pickupRadiusSq && Math.abs(dy) < 1.8) {
        const remaining = addItemToInventory(entity.id, entity.count);
        if (remaining <= 0) {
          if (onPickup) onPickup(entity);
          scene.remove(entity.mesh);
          itemEntitiesById.delete(entity.entityId);
          itemEntities.splice(i, 1);
        } else {
          entity.count = remaining;
        }
        updateAllSlotsUI();
      }
    }
  }
};

export const syncItemEntities = (items) => {
  if (!Array.isArray(items)) return;
  const seen = new Set();
  for (const item of items) {
    if (!item) continue;
    const entityId = Number(item.entityId);
    if (!Number.isFinite(entityId)) continue;
    seen.add(entityId);
    const existing = itemEntitiesById.get(entityId);
    const position = new THREE.Vector3(item.x || 0, item.y || 0, item.z || 0);
    if (existing) {
      existing.position.copy(position);
      existing.mesh.position.copy(position);
      existing.count = item.count ?? existing.count;
      existing.id = item.id ?? existing.id;
      continue;
    }
    createItemEntity(item.id, item.count, position, entityId);
  }
  for (const entity of [...itemEntities]) {
    if (!seen.has(entity.entityId)) {
      scene.remove(entity.mesh);
      itemEntitiesById.delete(entity.entityId);
      const idx = itemEntities.indexOf(entity);
      if (idx >= 0) itemEntities.splice(idx, 1);
    }
  }
};

export const clearItemEntities = () => {
  for (const entity of [...itemEntities]) {
    scene.remove(entity.mesh);
    itemEntitiesById.delete(entity.entityId);
  }
  itemEntities.length = 0;
};

export const removeItemEntityById = (entityId) => {
  const id = Number(entityId);
  if (!Number.isFinite(id)) return;
  const entity = itemEntitiesById.get(id);
  if (!entity) return;
  scene.remove(entity.mesh);
  itemEntitiesById.delete(id);
  const idx = itemEntities.indexOf(entity);
  if (idx >= 0) itemEntities.splice(idx, 1);
};
