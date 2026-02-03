import { THREE, scene } from "./scene.js";
import { clamp, randomSeed, WORLD_MAX_HEIGHT } from "./config.js";
import { isSolid, getBlock } from "./world.js";
import { spawnItemDrop } from "./entities.js";
import { raycastVoxel } from "./raycast.js";

const mobRaycaster = new THREE.Raycaster();
mobRaycaster.far = 3.5;
const rayCenter = new THREE.Vector2(0, 0);
const rayDir = new THREE.Vector3();
const TARGET_UPDATE_MS = 33;
const lastTargetCamPos = new THREE.Vector3();
let lastTargetYaw = 0;
let lastTargetPitch = 0;
let lastTargetUpdate = 0;

const mobDefs = {
  cow: {
    name: "Tehén",
    radius: 0.45,
    height: 1.4,
    speed: 0.08,
    health: 10,
    drops: [
      { id: "beef_raw", min: 0, max: 2 },
      { id: "leather", min: 0, max: 2 },
    ],
    colors: { body: 0x7a5130, spot: 0xd9cbb4 },
  },
  pig: {
    name: "Malac",
    radius: 0.45,
    height: 1.3,
    speed: 0.08,
    health: 10,
    drops: [{ id: "pork_raw", min: 0, max: 2 }],
    colors: { body: 0xd88b9b, spot: 0xe9a5b1 },
  },
  sheep: {
    name: "Bárány",
    radius: 0.45,
    height: 1.4,
    speed: 0.08,
    health: 8,
    drops: [{ id: "wool", min: 1, max: 1 }],
    colors: { body: 0xf0f0f0, spot: 0xd9d9d9 },
  },
  chicken: {
    name: "Csirke",
    radius: 0.35,
    height: 1.0,
    speed: 0.07,
    health: 4,
    drops: [
      { id: "chicken_raw", min: 0, max: 1 },
      { id: "feather", min: 0, max: 2 },
    ],
    colors: { body: 0xf6f6f6, spot: 0xe0e0e0 },
  },
};

const mobs = [];
const mobsById = new Map();
const mobMeshes = [];
let nextMobId = 1;
let initialMobsSpawned = false;

const tempPos = new THREE.Vector3();
const groundTestPos = new THREE.Vector3();
const moveInput = new THREE.Vector3();
const forwardDir = new THREE.Vector3();

const collidesAt = (pos, radius, height) => {
  const minX = pos.x - radius;
  const maxX = pos.x + radius;
  const minY = pos.y;
  const maxY = pos.y + height;
  const minZ = pos.z - radius;
  const maxZ = pos.z + radius;

  const startX = Math.floor(minX);
  const endX = Math.floor(maxX);
  const startY = Math.floor(minY);
  const endY = Math.floor(maxY);
  const startZ = Math.floor(minZ);
  const endZ = Math.floor(maxZ);

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      for (let z = startZ; z <= endZ; z += 1) {
        if (!isSolid(x, y, z)) continue;
        const blockMinX = x;
        const blockMaxX = x + 1;
        const blockMinY = y;
        const blockMaxY = y + 1;
        const blockMinZ = z;
        const blockMaxZ = z + 1;

        if (
          maxX > blockMinX &&
          minX < blockMaxX &&
          maxY > blockMinY &&
          minY < blockMaxY &&
          maxZ > blockMinZ &&
          minZ < blockMaxZ
        ) {
          return true;
        }
      }
    }
  }
  return false;
};

const moveAxis = (mob, axis, delta) => {
  if (delta === 0) return;
  const steps = Math.ceil(Math.abs(delta) / 0.05);
  const step = delta / steps;
  for (let i = 0; i < steps; i += 1) {
    tempPos.copy(mob.position);
    tempPos[axis] += step;
    if (collidesAt(tempPos, mob.radius, mob.height)) {
      if (axis === "y" && step < 0) {
        mob.onGround = true;
      }
      mob.velocity[axis] = 0;
      return;
    }
    mob.position[axis] = tempPos[axis];
  }
};

const checkGrounded = (mob) => {
  groundTestPos.copy(mob.position);
  groundTestPos.y -= 0.06;
  return collidesAt(groundTestPos, mob.radius, mob.height);
};

const buildMobMesh = (def) => {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.colors.body });
  const spotMat = new THREE.MeshLambertMaterial({ color: def.colors.spot });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 2.0), bodyMat);
  body.position.set(0, 0.55, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), spotMat);
  head.position.set(0, 0.9, -1.1);
  group.add(body, head);
  return group;
};

export const spawnMob = (type, position, idOverride = null) => {
  const def = mobDefs[type];
  if (!def) return null;
  const pos = position.clone();
  const resolvedId = Number.isFinite(idOverride) ? idOverride : nextMobId++;
  const mob = {
    id: resolvedId,
    type,
    def,
    position: pos,
    velocity: new THREE.Vector3(),
    yaw: Math.random() * Math.PI * 2,
    onGround: false,
    wanderTimer: 0,
    wanderYaw: Math.random() * Math.PI * 2,
    moving: false,
    health: def.health,
    hurtTimer: 0,
    radius: def.radius,
    height: def.height,
    mesh: buildMobMesh(def),
  };
  mob.mesh.position.copy(pos);
  mob.mesh.traverse((child) => {
    child.userData.mobId = mob.id;
  });
  scene.add(mob.mesh);
  mobs.push(mob);
  mobsById.set(mob.id, mob);
  mobMeshes.push(mob.mesh);
  if (resolvedId >= nextMobId) nextMobId = resolvedId + 1;
  return mob;
};

const despawnMob = (mob) => {
  scene.remove(mob.mesh);
  mobsById.delete(mob.id);
  const idx = mobs.indexOf(mob);
  if (idx >= 0) mobs.splice(idx, 1);
  const meshIdx = mobMeshes.indexOf(mob.mesh);
  if (meshIdx >= 0) mobMeshes.splice(meshIdx, 1);
};

const dropLoot = (mob) => {
  if (!mob.def.drops) return;
  for (const drop of mob.def.drops) {
    const count = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
    if (count > 0) spawnItemDrop(drop.id, count, mob.position.x, mob.position.y, mob.position.z);
  }
};

export const attackMob = (mob, damage = 2) => {
  if (!mob || mob.hurtTimer > 0) return;
  mob.health = Math.max(0, mob.health - damage);
  mob.hurtTimer = 0.5;
  if (mob.health <= 0) {
    dropLoot(mob);
    despawnMob(mob);
  }
};

export const updateMobTarget = (camera, state) => {
  if (mobMeshes.length === 0) {
    state.targetedMob = null;
    return;
  }
  const now = performance.now();
  const moved =
    lastTargetCamPos.distanceToSquared(camera.position) > 0.0004 ||
    Math.abs(camera.rotation.y - lastTargetYaw) > 0.0005 ||
    Math.abs(camera.rotation.x - lastTargetPitch) > 0.0005;
  if (!moved && now - lastTargetUpdate < TARGET_UPDATE_MS) {
    return;
  }
  lastTargetUpdate = now;
  lastTargetCamPos.copy(camera.position);
  lastTargetYaw = camera.rotation.y;
  lastTargetPitch = camera.rotation.x;
  mobRaycaster.setFromCamera(rayCenter, camera);
  const hits = mobRaycaster.intersectObjects(mobMeshes, true);
  if (!hits.length) {
    state.targetedMob = null;
    return;
  }
  camera.getWorldDirection(rayDir);
  const blockHit = raycastVoxel(camera.position, rayDir, mobRaycaster.far, getBlock);
  if (blockHit && blockHit.distance + 0.01 < hits[0].distance) {
    state.targetedMob = null;
    return;
  }
  const mobId = hits[0].object.userData?.mobId;
  state.targetedMob = mobsById.get(mobId) || null;
};

export const updateMobs = (dt) => {
  if (mobs.length === 0) return;
  const tickScale = dt * 20;

  for (const mob of mobs) {
    if (mob.hurtTimer > 0) mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);

    mob.wanderTimer -= dt;
    if (mob.wanderTimer <= 0) {
      mob.wanderTimer = 2 + Math.random() * 3;
      mob.wanderYaw = Math.random() * Math.PI * 2;
      mob.moving = Math.random() > 0.3;
    }

    const onGround = mob.onGround;
    const baseFriction = onGround ? 0.6 * 0.91 : 0.91;
    let moveSpeed = onGround
      ? mob.def.speed * (0.16277136 / (baseFriction ** 3))
      : mob.def.speed * 0.2;

    moveInput.set(0, 0, 0);
    if (mob.moving) {
      forwardDir.set(Math.sin(mob.wanderYaw), 0, Math.cos(mob.wanderYaw));
      moveInput.add(forwardDir);
    }

    const inputMag = moveInput.length();
    if (inputMag > 1) moveInput.divideScalar(inputMag);

    if (inputMag > 0) {
      const accel = moveSpeed * tickScale;
      mob.velocity.x += moveInput.x * accel;
      mob.velocity.z += moveInput.z * accel;
      mob.yaw = Math.atan2(mob.velocity.x, mob.velocity.z);
    }

    mob.velocity.y -= 0.08 * tickScale;
    mob.velocity.y *= Math.pow(0.98, tickScale);

    const frictionFactor = Math.pow(baseFriction, tickScale);
    mob.velocity.x *= frictionFactor;
    mob.velocity.z *= frictionFactor;

    mob.onGround = false;
    moveAxis(mob, "x", mob.velocity.x * tickScale);
    moveAxis(mob, "z", mob.velocity.z * tickScale);
    moveAxis(mob, "y", mob.velocity.y * tickScale);

    mob.onGround = checkGrounded(mob);
    if (mob.onGround && mob.velocity.y < 0) mob.velocity.y = 0;

    const blockBelow = getBlock(Math.floor(mob.position.x), Math.floor(mob.position.y - 0.1), Math.floor(mob.position.z));
    if (blockBelow === 8) {
      mob.velocity.y = Math.max(mob.velocity.y, 0.05 * tickScale);
    }

    mob.mesh.position.copy(mob.position);
    mob.mesh.rotation.y = mob.yaw;
  }
};

export const syncMobs = (mobData) => {
  if (!Array.isArray(mobData)) return;
  const seen = new Set();
  for (const data of mobData) {
    if (!data || data.id == null) continue;
    const id = Number(data.id);
    if (!Number.isFinite(id)) continue;
    seen.add(id);
    let mob = mobsById.get(id);
    if (!mob) {
      const pos = new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0);
      mob = spawnMob(data.type, pos, id);
      if (!mob) continue;
    }
    mob.position.set(data.x || 0, data.y || 0, data.z || 0);
    mob.mesh.position.copy(mob.position);
    if (Number.isFinite(data.yaw)) mob.yaw = data.yaw;
    mob.mesh.rotation.y = mob.yaw || 0;
    if (Number.isFinite(data.health)) mob.health = data.health;
  }

  for (const mob of [...mobs]) {
    if (!seen.has(mob.id)) {
      despawnMob(mob);
    }
  }
};

export const getMobs = () => mobs;
export const getMobDefs = () => mobDefs;

export const clearMobs = () => {
  for (const mob of [...mobs]) {
    despawnMob(mob);
  }
};

const findGround = (x, z) => {
  for (let y = WORLD_MAX_HEIGHT - 2; y >= 1; y -= 1) {
    const type = getBlock(x, y, z);
    if (type && type !== 8) return y;
  }
  return null;
};

export const spawnInitialMobs = (center) => {
  if (initialMobsSpawned) return;
  initialMobsSpawned = true;
  const types = Object.keys(mobDefs);
  for (const type of types) {
    for (let i = 0; i < 2; i += 1) {
      const ox = Math.floor((Math.random() - 0.5) * 10);
      const oz = Math.floor((Math.random() - 0.5) * 10);
      const x = Math.floor(center.x + ox);
      const z = Math.floor(center.z + oz);
      const ground = findGround(x, z);
      if (ground == null) continue;
      const pos = new THREE.Vector3(x + 0.5, ground + 1, z + 0.5);
      if (!collidesAt(pos, mobDefs[type].radius, mobDefs[type].height)) {
        spawnMob(type, pos);
      }
    }
  }
};
