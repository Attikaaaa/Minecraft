import { THREE, camera, getDaylightFactor, scene, updateTorchLight } from "./scene.js";
import { clamp, randomSeed, SEA_LEVEL } from "./config.js";
import { state } from "./state.js";
import { input } from "./input.js";
import {
  applyToolDamage,
  canPlaceSelected,
  getSelectedItemId,
  getSelectedSlot,
  setSlot,
  slotIsEmpty,
  updateAllSlotsUI,
} from "./inventory.js";
import { getBreakTimeSeconds, getDropForBlock, itemDefs } from "./items.js";
import { spawnItemDrop } from "./entities.js";
import {
  ensureChunksAround,
  getBlock,
  initializeWorld,
  isSolid,
  isWithinWorld,
  keyFor,
  removeBlock,
  setBlock,
  spawn,
  updateWorld,
} from "./world.js";
import { raycastVoxel } from "./raycast.js";
import {
  crosshairEl,
  deathScreenEl,
  handItemEl,
  handItemIconEl,
  heartsEl,
  hud,
  hungerEl,
  miningBarEl,
  miningFillEl,
  statusEl,
  respawnBtn,
} from "./dom.js";
import { statusIcons, blockDefs } from "./textures.js";
import { lockPointer, unlockPointer } from "./controls.js";
import { setTorchOrientation, removeTorchOrientation } from "./custom-blocks.js";

const highlightGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
const highlightMaterial = new THREE.LineBasicMaterial({ color: 0xffff88 });
const highlightMesh = new THREE.LineSegments(highlightGeometry, highlightMaterial);
highlightMesh.visible = false;
scene.add(highlightMesh);

const moveInput = new THREE.Vector3();
const forwardDir = new THREE.Vector3();
const rightDir = new THREE.Vector3();
const desired = new THREE.Vector3();
const upDir = new THREE.Vector3(0, 1, 0);
const tempPos = new THREE.Vector3();
const groundTestPos = new THREE.Vector3();
const rayDir = new THREE.Vector3();
const targetFace = new THREE.Vector3();

export const player = {
  position: new THREE.Vector3(spawn.x + 0.5, Math.max(spawn.height + 2, SEA_LEVEL + 2), spawn.z + 0.5),
  velocity: new THREE.Vector3(),
  radius: 0.35,
  height: 1.7,
  eyeHeight: 1.55,
  yaw: 0,
  pitch: 0,
  onGround: false,
  speed: 4.4,
  sprintMultiplier: 1.6,
  jumpSpeed: 6.2,
  health: 20,
  hunger: 20,
  exhaustion: 0,
  regenTimer: 0,
  starveTimer: 0,
  fallDistance: 0,
  lastPos: null,
};

player.lastPos = player.position.clone();

const HEART_COUNT = 10;
const hungerIcons = [];
const heartIcons = [];

const buildStatusIcons = (container, count, type, store) => {
  container.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const icon = document.createElement("div");
    icon.className = "status-icon";
    icon.dataset.type = type;
    container.append(icon);
    store.push(icon);
  }
};

buildStatusIcons(heartsEl, HEART_COUNT, "heart", heartIcons);
buildStatusIcons(hungerEl, HEART_COUNT, "hunger", hungerIcons);

const collidesAt = (pos) => {
  const minX = pos.x - player.radius;
  const maxX = pos.x + player.radius;
  const minY = pos.y;
  const maxY = pos.y + player.height;
  const minZ = pos.z - player.radius;
  const maxZ = pos.z + player.radius;

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

const moveAxis = (axis, delta) => {
  if (delta === 0) return;
  const steps = Math.ceil(Math.abs(delta) / 0.05);
  const step = delta / steps;
  for (let i = 0; i < steps; i += 1) {
    tempPos.copy(player.position);
    tempPos[axis] += step;
    if (collidesAt(tempPos)) {
      if (axis === "y" && step < 0) {
        player.onGround = true;
      }
      player.velocity[axis] = 0;
      return;
    }
    player.position[axis] = tempPos[axis];
  }
};

const checkGrounded = () => {
  groundTestPos.copy(player.position);
  groundTestPos.y -= 0.06;
  return collidesAt(groundTestPos);
};

export const updatePlayer = (dt) => {
  const movementEnabled = !state.inventoryOpen && !state.craftingTableOpen && !state.chatOpen;
  const isCreative = state.gamemode === "creative";
  const isSpectator = state.gamemode === "spectator";

  if (isCreative || isSpectator) {
    moveInput.set(
      movementEnabled ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0,
      0,
      movementEnabled ? (input.backward ? 1 : 0) - (input.forward ? 1 : 0) : 0
    );
    const inputMag = moveInput.length();
    if (inputMag > 1) {
      moveInput.divideScalar(inputMag);
    }

    const yaw = player.yaw;
    const cosPitch = Math.cos(player.pitch);
    forwardDir.set(Math.sin(yaw) * cosPitch, Math.sin(player.pitch), Math.cos(yaw) * cosPitch);
    rightDir.set(Math.sin(yaw + Math.PI / 2), 0, Math.cos(yaw + Math.PI / 2));

    desired.set(0, 0, 0);
    if (inputMag > 0) {
      desired.addScaledVector(forwardDir, moveInput.z);
      desired.addScaledVector(rightDir, moveInput.x);
    }
    const vertical = movementEnabled ? (input.jump ? 1 : 0) - (input.sprint ? 1 : 0) : 0;
    desired.addScaledVector(upDir, vertical);

    if (desired.lengthSq() > 0) desired.normalize();
    const baseSpeed = isSpectator ? 8 : 6;
    const speed = baseSpeed * (input.boost ? 2 : 1);
    const delta = speed * dt;

    player.onGround = false;
    if (isSpectator) {
      player.position.addScaledVector(desired, delta);
    } else {
      moveAxis("x", desired.x * delta);
      moveAxis("z", desired.z * delta);
      moveAxis("y", desired.y * delta);
      player.onGround = checkGrounded();
    }

    player.velocity.set(0, 0, 0);
    camera.position.set(player.position.x, player.position.y + player.eyeHeight, player.position.z);
    camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
    return;
  }

  const tickScale = dt * 20;
  moveInput.set(
    movementEnabled ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0,
    0,
    movementEnabled ? (input.backward ? 1 : 0) - (input.forward ? 1 : 0) : 0
  );

  const inputMag = moveInput.length();
  if (inputMag > 1) {
    moveInput.divideScalar(inputMag);
  }

  const yaw = player.yaw;
  forwardDir.set(Math.sin(yaw), 0, Math.cos(yaw));
  rightDir.set(forwardDir.z, 0, -forwardDir.x);

  const onGround = player.onGround;
  const baseFriction = onGround ? 0.6 * 0.91 : 0.91;
  let moveSpeed = onGround ? 0.1 * (0.16277136 / (baseFriction ** 3)) : 0.02;
  
  // Sprint mechanika (Minecraft 1:1)
  const isSprinting = input.isSprinting && input.forward && !input.backward && player.hunger > 6;
  if (movementEnabled && isSprinting) {
    moveSpeed *= 1.3; // Sprint sebesség
  }
  
  // Sprint leáll ha ütközünk vagy nincs éhség
  if (isSprinting && player.hunger <= 6) {
    input.isSprinting = false;
  }
  
  // FOV változás sprint közben (Minecraft effect)
  const targetFov = isSprinting ? 80 : 70;
  const currentFov = camera.fov;
  camera.fov += (targetFov - currentFov) * 0.1;
  camera.updateProjectionMatrix();

  if (movementEnabled && input.jump && onGround && !input.jumping) {
    player.velocity.y = 0.42;
    input.jumping = true;
    
    // Sprint jump boost - csak ha tisztán előre mész (Minecraft 1:1)
    if (isSprinting && moveInput.z < 0 && Math.abs(moveInput.x) < 0.1) {
      // Boost a nézési irányba
      const boostAmount = 0.2;
      player.velocity.x += Math.sin(yaw) * boostAmount;
      player.velocity.z -= Math.cos(yaw) * boostAmount;
    }
    
    player.exhaustion += isSprinting ? 0.2 : 0.05;
  }

  if (inputMag > 0) {
    const accel = moveSpeed * tickScale;
    player.velocity.x += (moveInput.x * rightDir.x + moveInput.z * forwardDir.x) * accel;
    player.velocity.z += (moveInput.x * rightDir.z + moveInput.z * forwardDir.z) * accel;
  }

  const wasOnGround = player.onGround;
  player.onGround = false;
  const startY = player.position.y;
  moveAxis("x", player.velocity.x * tickScale);
  moveAxis("z", player.velocity.z * tickScale);
  moveAxis("y", player.velocity.y * tickScale);

  player.onGround = checkGrounded();
  if (player.onGround) {
    input.jumping = false;
    if (player.velocity.y < 0) player.velocity.y = 0;
  }

  const dy = player.position.y - startY;
  if (!player.onGround && dy < 0) {
    player.fallDistance += -dy;
  } else if (player.onGround) {
    if (!wasOnGround && player.fallDistance > 0) {
      const damage = Math.floor(player.fallDistance - 3);
      if (damage > 0) takeDamage(damage);
    }
    player.fallDistance = 0;
  }

  player.velocity.y -= 0.08 * tickScale;
  player.velocity.y *= Math.pow(0.98, tickScale);
  const frictionFactor = Math.pow(baseFriction, tickScale);
  player.velocity.x *= frictionFactor;
  player.velocity.z *= frictionFactor;

  camera.position.set(player.position.x, player.position.y + player.eyeHeight, player.position.z);
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
};

export const updateTarget = () => {
  camera.getWorldDirection(rayDir);
  const hit = raycastVoxel(camera.position, rayDir, 6, getBlock);

  if (!hit) {
    state.targetedBlock = null;
    state.targetedFace = null;
    highlightMesh.visible = false;
    return;
  }

  state.targetedBlock = { x: hit.x, y: hit.y, z: hit.z };
  targetFace.set(hit.normal.x, hit.normal.y, hit.normal.z);
  state.targetedFace = targetFace;
  highlightMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  highlightMesh.visible = true;
};

export const resetMining = () => {
  state.mining.active = false;
  state.mining.progress = 0;
  state.mining.targetKey = null;
  state.mining.blockType = null;
  miningBarEl.classList.add("hidden");
  miningFillEl.style.width = "0%";
  highlightMaterial.color.set(0xffff88);
};

const completeMining = (blockType) => {
  const toolId = getSelectedItemId();
  const tx = state.targetedBlock.x;
  const ty = state.targetedBlock.y;
  const tz = state.targetedBlock.z;
  
  // Torch orientáció törlése
  if (blockType === 18) {
    removeTorchOrientation(tx, ty, tz);
  }
  
  removeBlock(tx, ty, tz);
  if (state.gamemode !== "creative") {
    const drop = getDropForBlock(blockType, toolId);
    if (drop) spawnItemDrop(drop.id, drop.count, tx, ty, tz);
    applyToolDamage();
    updateAllSlotsUI();
  }
};

export const updateMining = (dt) => {
  if (state.gamemode === "spectator") {
    resetMining();
    return;
  }
  if (!input.mining || state.inventoryOpen || state.craftingTableOpen || state.chatOpen) {
    resetMining();
    return;
  }
  if (!state.targetedBlock) {
    resetMining();
    return;
  }

  const { x, y, z } = state.targetedBlock;
  const blockType = getBlock(x, y, z);
  if (blockType === 0 || blockType === 8) {
    resetMining();
    return;
  }

  const key = keyFor(x, y, z);
  if (state.mining.targetKey !== key) {
    state.mining.progress = 0;
    state.mining.targetKey = key;
    state.mining.blockType = blockType;
  }

  const toolId = getSelectedItemId();
  const breakTime = state.gamemode === "creative" ? 0 : getBreakTimeSeconds(blockType, toolId);
  if (!Number.isFinite(breakTime)) {
    resetMining();
    return;
  }
  if (breakTime <= 0) {
    completeMining(blockType);
    resetMining();
    return;
  }

  state.mining.active = true;
  state.mining.progress += dt / breakTime;
  const progress = clamp(state.mining.progress, 0, 1);
  miningBarEl.classList.remove("hidden");
  miningFillEl.style.width = `${progress * 100}%`;
  highlightMaterial.color.setHSL(0.12 - progress * 0.12, 1, 0.65);

  if (state.mining.progress >= 1) {
    completeMining(blockType);
    state.mining.progress = 0;
    state.mining.targetKey = null;
    state.mining.blockType = null;
    miningFillEl.style.width = "0%";
  }
};

export const updateSurvivalUI = () => {
  const health = Math.max(0, Math.min(20, player.health));
  const hunger = Math.max(0, Math.min(20, player.hunger));

  for (let i = 0; i < HEART_COUNT; i += 1) {
    const value = health - i * 2;
    const icon = value >= 2 ? statusIcons.heart.full : value === 1 ? statusIcons.heart.half : statusIcons.heart.empty;
    heartIcons[i].style.backgroundImage = `url(${icon})`;
  }

  for (let i = 0; i < HEART_COUNT; i += 1) {
    const value = hunger - i * 2;
    const icon = value >= 2 ? statusIcons.hunger.full : value === 1 ? statusIcons.hunger.half : statusIcons.hunger.empty;
    hungerIcons[i].style.backgroundImage = `url(${icon})`;
  }
};

const triggerDeath = () => {
  if (state.mode !== "playing") return;
  state.mode = "dead";
  deathScreenEl.classList.remove("hidden");
  hud.classList.add("hidden");
  crosshairEl.classList.add("hidden");
  miningBarEl.classList.add("hidden");
  miningFillEl.style.width = "0%";
  updateTorchLight(false, null);
  unlockPointer();
};

export const takeDamage = (amount) => {
  if (state.mode !== "playing") return;
  if (state.gamemode === "creative" || state.gamemode === "spectator") return;
  player.health = Math.max(0, player.health - amount);
  if (player.health <= 0) {
    triggerDeath();
  }
};

export const killPlayer = () => {
  if (state.mode !== "playing") return;
  player.health = 0;
  triggerDeath();
};

export const updateSurvival = (dt) => {
  if (state.mode !== "playing") return;
  if (state.gamemode === "creative" || state.gamemode === "spectator") {
    player.health = 20;
    player.hunger = 20;
    player.exhaustion = 0;
    player.regenTimer = 0;
    player.starveTimer = 0;
    return;
  }

  const dx = player.position.x - player.lastPos.x;
  const dz = player.position.z - player.lastPos.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0) {
    const isSprinting = input.isSprinting && input.forward;
    const exhaustionRate = isSprinting ? 0.1 : 0.01; // Sprint = 10x több éhség
    player.exhaustion += distance * exhaustionRate;
    player.lastPos.copy(player.position);
  }

  while (player.exhaustion >= 4 && player.hunger > 0) {
    player.exhaustion -= 4;
    player.hunger = Math.max(0, player.hunger - 1);
  }

  if (player.hunger >= 18 && player.health < 20) {
    player.regenTimer += dt;
    if (player.regenTimer >= 4) {
      player.regenTimer = 0;
      player.health = Math.min(20, player.health + 1);
      player.hunger = Math.max(0, player.hunger - 1);
    }
  } else {
    player.regenTimer = 0;
  }

  if (player.hunger <= 0) {
    player.starveTimer += dt;
    if (player.starveTimer >= 4) {
      player.starveTimer = 0;
      takeDamage(1);
    }
  } else {
    player.starveTimer = 0;
  }
};

export const placeBlock = () => {
  if (state.gamemode === "spectator") return;
  if (!state.targetedBlock || !state.targetedFace) return;
  if (!canPlaceSelected()) return;
  const selectedSlot = getSelectedSlot();
  if (!selectedSlot || selectedSlot.count <= 0) return;
  const target = state.targetedBlock;
  const normal = state.targetedFace;
  const nx = Math.round(normal.x);
  const ny = Math.round(normal.y);
  const nz = Math.round(normal.z);
  const x = target.x + nx;
  const y = target.y + ny;
  const z = target.z + nz;

  if (!isWithinWorld(x, y, z)) return;
  if (getBlock(x, y, z) !== 0) return;

  const selectedItem = getSelectedItemId();
  const blockType = itemDefs[selectedItem]?.blockType;
  if (!blockType) return;
  
  // Ellenőrizzük hogy a blokk támasztékot igényel-e (pl. fáklya)
  const blockDef = blockDefs[blockType];
  if (blockDef?.needsSupport) {
    // Fáklya csak solid blokk mellé/alá rakható
    const supportBlock = getBlock(target.x, target.y, target.z);
    const supportDef = blockDefs[supportBlock];
    if (!supportDef || !supportDef.solid) {
      return; // Nincs solid támasz
    }
  }

  const playerBox = {
    minX: player.position.x - player.radius,
    maxX: player.position.x + player.radius,
    minY: player.position.y,
    maxY: player.position.y + player.height,
    minZ: player.position.z - player.radius,
    maxZ: player.position.z + player.radius,
  };

  const blockMinX = x;
  const blockMaxX = x + 1;
  const blockMinY = y;
  const blockMaxY = y + 1;
  const blockMinZ = z;
  const blockMaxZ = z + 1;

  const intersectsPlayer =
    playerBox.maxX > blockMinX &&
    playerBox.minX < blockMaxX &&
    playerBox.maxY > blockMinY &&
    playerBox.minY < blockMaxY &&
    playerBox.maxZ > blockMinZ &&
    playerBox.minZ < blockMaxZ;

  if (intersectsPlayer) return;
  
  // Torch orientáció beállítása a face alapján
  if (blockType === 18) {
    let orientation = 'floor';
    if (ny === 1) orientation = 'floor'; // Felülre rakva
    else if (ny === -1) orientation = 'floor'; // Alulra (nem szabályos, de legyen floor)
    else if (nz === 1) orientation = 'north'; // Északi falra
    else if (nz === -1) orientation = 'south'; // Déli falra
    else if (nx === 1) orientation = 'east'; // Keleti falra
    else if (nx === -1) orientation = 'west'; // Nyugati falra
    setTorchOrientation(x, y, z, orientation);
  }
  
  setBlock(x, y, z, blockType);
  if (state.gamemode !== "creative") {
    selectedSlot.count -= 1;
    if (selectedSlot.count <= 0) setSlot(selectedSlot, null, 0);
    updateAllSlotsUI();
  }
};

export const tryConsumeFood = () => {
  const selectedSlot = getSelectedSlot();
  if (!selectedSlot || slotIsEmpty(selectedSlot)) return false;
  const def = itemDefs[selectedSlot.id];
  if (!def || def.food == null) return false;
  if (state.gamemode === "creative") {
    player.hunger = 20;
    return true;
  }
  if (player.hunger >= 20) return false;
  player.hunger = Math.min(20, player.hunger + def.food);
  selectedSlot.count -= 1;
  if (selectedSlot.count <= 0) setSlot(selectedSlot, null, 0);
  updateAllSlotsUI();
  return true;
};

export const updateHud = () => {
  const pos = player.position;
  const target = state.targetedBlock
    ? `${state.targetedBlock.x},${state.targetedBlock.y},${state.targetedBlock.z}`
    : "-";
  const selectedSlot = getSelectedSlot();
  const selectedId = selectedSlot?.id;
  const selectedName = selectedId ? itemDefs[selectedId]?.name : "Üres";
  const selectedCount = selectedSlot?.count || 0;
  const selectedDurability =
    selectedId && itemDefs[selectedId]?.durability != null ? selectedSlot?.durability : null;
  const modeLabel =
    state.gamemode === "creative" ? "Kreatív" : state.gamemode === "spectator" ? "Néző" : "Túlélő";
  const lines = [
    `Pozíció: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`,
    `Sebesség: ${player.velocity.x.toFixed(2)}, ${player.velocity.y.toFixed(2)}, ${player.velocity.z.toFixed(2)}`,
    `Talajon: ${player.onGround ? "igen" : "nem"}`,
    `Cél blokk: ${target}`,
    selectedDurability != null
      ? `Kiválasztott: ${selectedName} (${selectedDurability})`
      : `Kiválasztott: ${selectedName} x${selectedCount}`,
    `Élet: ${player.health} · Éhség: ${player.hunger}`,
    `Mód: ${modeLabel}`,
    `Blokkok: ${state.blocks}`,
    `Seed: ${randomSeed}`,
  ];
  if (statusEl) {
    statusEl.textContent = lines.join("\n");
    const shouldShow = state.debugHud && !state.inventoryOpen && !state.craftingTableOpen;
    statusEl.classList.toggle("hidden", !shouldShow);
  }
  if (handItemEl && handItemIconEl) {
    const icon = selectedId ? itemDefs[selectedId]?.icon : null;
    const hideHand = state.inventoryOpen || state.craftingTableOpen || state.chatOpen;
    if (icon && !hideHand) {
      handItemEl.classList.remove("hidden");
      handItemIconEl.style.backgroundImage = `url(${icon})`;
    } else {
      handItemEl.classList.add("hidden");
      handItemIconEl.style.backgroundImage = "none";
    }
  }
  const holdingTorch = selectedId === "torch";
  const isDark = getDaylightFactor() < 0.4;
  updateTorchLight(holdingTorch && isDark, camera.position);
  updateSurvivalUI();
};

export const respawn = () => {
  player.health = 20;
  player.hunger = 20;
  player.exhaustion = 0;
  player.regenTimer = 0;
  player.starveTimer = 0;
  player.fallDistance = 0;
  const defaultSpawn = {
    x: spawn.x + 0.5,
    y: Math.max(spawn.height + 2, SEA_LEVEL + 2),
    z: spawn.z + 0.5,
  };
  const respawnPoint = state.respawnPoint || defaultSpawn;
  player.position.set(respawnPoint.x, respawnPoint.y, respawnPoint.z);
  player.velocity.set(0, 0, 0);
  player.lastPos.copy(player.position);

  state.mode = "playing";
  deathScreenEl.classList.add("hidden");
  hud.classList.remove("hidden");
  crosshairEl.classList.remove("hidden");
  lockPointer();
  updateAllSlotsUI();
  updateSurvivalUI();
};

export const teleportPlayer = (x, y, z) => {
  player.position.set(x, y, z);
  player.velocity.set(0, 0, 0);
  player.lastPos.copy(player.position);
};

respawnBtn?.addEventListener("click", () => {
  respawn();
});

export const updateGame = (dt) => {
  updatePlayer(dt);
  if (!state.worldInitialized) initializeWorld();
  ensureChunksAround(player.position.x, player.position.z);
  updateWorld();
  updateTarget();
  updateMining(dt);
  updateSurvival(dt);
  const uiStart = performance.now();
  updateHud();
  const uiMs = performance.now() - uiStart;
  return { uiMs };
};
