import { THREE, scene } from "./scene.js";
import { CHUNK_RADIUS, CHUNK_SIZE } from "./config.js";
import { itemDefs } from "./items.js";
import { addItemToInventory, updateAllSlotsUI } from "./inventory.js";
import { getBlock } from "./world.js";

export const itemEntities = [];
const itemTextures = new Map();
const tempVec = new THREE.Vector3();

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

export const spawnItemDrop = (id, count, x, y, z) => {
  if (!id || count <= 0) return;
  const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
  createItemEntity(id, count, pos);
};

export const updateItemEntities = (dt, time, player, isPlaying) => {
  if (itemEntities.length === 0) return;
  const gravity = 18;
  const pickupRadius = 1.2;
  const maxAge = 300;
  const maxDistance = CHUNK_SIZE * (CHUNK_RADIUS + 1.5);
  const pickupRadiusSq = pickupRadius * pickupRadius;
  const maxDistanceSq = maxDistance * maxDistance;

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
    if (dx * dx + dz * dz > maxDistanceSq) {
      scene.remove(entity.mesh);
      itemEntities.splice(i, 1);
      continue;
    }

    entity.velocity.y -= gravity * dt;
    tempVec.copy(entity.position).addScaledVector(entity.velocity, dt);

    if (entity.velocity.y <= 0) {
      const blockBelow = getBlock(Math.floor(tempVec.x), Math.floor(tempVec.y - 0.1), Math.floor(tempVec.z));
      if (blockBelow && blockBelow !== 8) {
        tempVec.y = Math.floor(tempVec.y) + 1.02;
        entity.velocity.y = 0;
      }
    }

    entity.position.copy(tempVec);
    const bob = Math.sin(time * 2 + entity.bobOffset) * 0.05;
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
