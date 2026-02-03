import { THREE, scene } from "./scene.js";

const remotePlayers = new Map();
const remoteMeshes = [];

const BODY_COLOR = 0x4a90e2;
const HEAD_COLOR = 0x7fc7ff;

const createNameSprite = (name) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const width = 256;
  const height = 64;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "24px 'Minecraftia', 'Press Start 2P', monospace";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, width / 2, height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.4, 0.6, 1);
  return { sprite, texture };
};

const createPlayerMesh = (name) => {
  const group = new THREE.Group();
  group.userData.remotePlayerId = null;
  const bodyMat = new THREE.MeshLambertMaterial({ color: BODY_COLOR });
  const headMat = new THREE.MeshLambertMaterial({ color: HEAD_COLOR });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.45), bodyMat);
  body.position.set(0, 0.55, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat);
  head.position.set(0, 1.35, 0);
  body.userData.remotePlayerId = null;
  head.userData.remotePlayerId = null;
  group.add(body, head);

  const { sprite, texture } = createNameSprite(name);
  sprite.position.set(0, 2.1, 0);
  sprite.userData.remotePlayerId = null;
  group.add(sprite);

  return { group, label: sprite, labelTexture: texture };
};

export const upsertRemotePlayer = (data) => {
  if (!data || !data.id) return;
  const id = String(data.id);
  const name = data.name || "Player";
  let entry = remotePlayers.get(id);
  if (!entry) {
    const { group, label, labelTexture } = createPlayerMesh(name);
    group.userData.remotePlayerId = id;
    group.traverse((child) => {
      child.userData.remotePlayerId = id;
    });
    entry = {
      id,
      name,
      group,
      label,
      labelTexture,
      position: new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0),
      target: new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0),
      yaw: data.yaw || 0,
      targetYaw: data.yaw || 0,
      lastUpdate: performance.now(),
    };
    group.position.copy(entry.position);
    group.rotation.set(0, entry.yaw, 0);
    scene.add(group);
    remotePlayers.set(id, entry);
    remoteMeshes.push(group);
  }

  if (entry.name !== name) {
    entry.name = name;
    entry.label.material.map.dispose();
    const { sprite, texture } = createNameSprite(name);
    entry.group.remove(entry.label);
    entry.label = sprite;
    entry.labelTexture = texture;
    sprite.position.set(0, 2.1, 0);
    sprite.userData.remotePlayerId = id;
    entry.group.add(sprite);
  }

  entry.target.set(data.x || 0, data.y || 0, data.z || 0);
  entry.targetYaw = data.yaw || 0;
  entry.lastUpdate = performance.now();
};

export const removeRemotePlayer = (id) => {
  const key = String(id);
  const entry = remotePlayers.get(key);
  if (!entry) return;
  scene.remove(entry.group);
  const idx = remoteMeshes.indexOf(entry.group);
  if (idx >= 0) remoteMeshes.splice(idx, 1);
  entry.group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
  if (entry.labelTexture) entry.labelTexture.dispose();
  remotePlayers.delete(key);
};

export const updateRemotePlayers = (dt) => {
  if (remotePlayers.size === 0) return;
  const alpha = 1 - Math.exp(-dt * 8);
  for (const entry of remotePlayers.values()) {
    entry.position.lerp(entry.target, alpha);
    entry.group.position.copy(entry.position);

    const yawDelta = ((entry.targetYaw - entry.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    entry.yaw += yawDelta * alpha;
    entry.group.rotation.set(0, entry.yaw, 0);
  }
};

export const clearRemotePlayers = () => {
  for (const id of remotePlayers.keys()) {
    removeRemotePlayer(id);
  }
};

export const getRemotePlayers = () => Array.from(remotePlayers.values()).map((entry) => ({
  id: entry.id,
  name: entry.name,
  x: entry.position.x,
  y: entry.position.y,
  z: entry.position.z,
  yaw: entry.yaw,
}));

export const getRemotePlayerById = (id) => remotePlayers.get(String(id)) || null;

export const getRemotePlayerMeshes = () => remoteMeshes;
