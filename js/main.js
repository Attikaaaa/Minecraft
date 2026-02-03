import { camera, renderer, scene, THREE } from "./scene.js";
import {
  disablePointerLock,
  CHUNK_SIZE,
  CHUNK_RADIUS,
  SEA_LEVEL,
  VIEW_RADIUS_MAX,
  VIEW_RADIUS_MIN,
  VIEW_RADIUS_UNLIMITED,
  WORLD_MAX_HEIGHT,
  clamp,
  randomSeed,
  urlParams,
} from "./config.js";
import { state } from "./state.js";
import { input } from "./input.js";
import {
  closeCraftingTable,
  closeInventory,
  craftSlots,
  hotbar,
  inventory,
  openCraftingTable,
  openInventory,
  setSlot,
  tableCraftSlots,
  updateAllSlotsUI,
} from "./inventory.js";
import {
  clearItemEntities,
  itemEntities,
  removeItemEntityById,
  spawnItemDrop,
  syncItemEntities,
  updateItemEntities,
} from "./entities.js";
import {
  killPlayer,
  player,
  placeBlock,
  resetMining,
  teleportPlayer,
  takeDamage,
  tryConsumeFood,
  updateGame,
  updateSurvivalUI,
} from "./player.js";
import { getBlock, initializeWorld, isWithinWorld, setBlock, spawn } from "./world.js";
import {
  canvas,
  hud,
  menu,
  menuResumeBtn,
  menuRestartBtn,
  optionsBackBtn,
  optionsDebugBtn,
  optionsFovEl,
  optionsFovValueEl,
  optionsUnlimitedViewBtn,
  optionsViewDistanceEl,
  optionsViewDistanceValueEl,
  optionsFullscreenBtn,
  optionsMenuEl,
  optionsPerfBtn,
  optionsSensitivityEl,
  optionsSensitivityValueEl,
  pauseMenuEl,
  pauseMultiplayerBtn,
  pauseOptionsBtn,
  pauseQuitBtn,
  pauseResumeBtn,
  startBtn,
  statusEl,
  tabListEl,
  multiplayerMenuEl,
  mpNameInput,
  mpServerInput,
  mpRoomInput,
  mpHostBtn,
  mpJoinBtn,
  mpDisconnectBtn,
  mpCloseBtn,
  mpStatusEl,
  mpLinkEl,
} from "./dom.js";
import { lockPointer, unlockPointer } from "./controls.js";
import {
  attackMob,
  clearMobs,
  spawnInitialMobs,
  spawnMob,
  syncMobs,
  updateMobTarget,
  updateMobs,
} from "./mobs.js";
import { itemDefs, refreshItemIcons } from "./items.js";
import { getMobs } from "./mobs.js";
import { addChatMessage, closeChat, isChatOpen, openChat, updateChatDisplay } from "./chat.js";
import { setTimeOfDay } from "./time.js";
import { advanceTime, initTime } from "./time.js";
import {
  isPerfOverlayEnabled,
  recordFrameTime,
  setPerfOverlayEnabled,
  setPerfTimings,
  startBenchmark,
  togglePerfOverlay,
  updatePerfOverlay,
} from "./perf.js";
import { initializeAtlas, initAtlasMaterials } from "./atlas.js";
import { blockIcons, getBlockIcons, updateAnimatedTextures } from "./textures.js";
import { updateFallingBlocks } from "./physics.js";
import { raycastVoxel } from "./raycast.js";
import {
  network,
  connect,
  disconnect,
  sendAction,
  sendEntities,
  sendPlayerData,
  sendPlayerDamage,
  sendPlayerState,
  setNetworkHandlers,
} from "./network.js";
import {
  upsertRemotePlayer,
  removeRemotePlayer,
  updateRemotePlayers,
  clearRemotePlayers,
  getRemotePlayers,
  getRemotePlayerById,
  getRemotePlayerMeshes,
} from "./remote-players.js";
import { removeTorchOrientation, setTorchOrientation } from "./custom-blocks.js";

const resize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

window.addEventListener("resize", resize);

const toggleFullscreen = async () => {
  if (!document.fullscreenElement) {
    await document.body.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
  resize();
};

const pointerActive = () =>
  document.pointerLockElement === canvas || disablePointerLock || navigator.webdriver;

const SETTINGS_KEY = "blockland_settings_v1";
const MIN_SENSITIVITY = 0.2;
const MAX_SENSITIVITY = 2;
const MIN_FOV = 60;
const MAX_FOV = 110;

const formatSensitivity = (value) => `${value.toFixed(2)}x`;
const formatFov = (value) => `${Math.round(value)}°`;
const formatViewRadius = (value) => `${Math.round(value)} chunk`;

const updateFogDistance = () => {
  if (!scene.fog) return;
  const maxRadius = state.unlimitedViewDistance ? VIEW_RADIUS_UNLIMITED : VIEW_RADIUS_MAX;
  const radius = clamp(Math.round(state.viewRadius ?? CHUNK_RADIUS), VIEW_RADIUS_MIN, maxRadius);
  const far = state.unlimitedViewDistance
    ? Math.max(800, CHUNK_SIZE * (radius + 1) * 2.8)
    : Math.max(40, CHUNK_SIZE * (radius + 1) * 1.2);
  const near = Math.max(6, far * 0.4);
  scene.fog.near = near;
  scene.fog.far = far;
  const cameraFar = Math.max(200, far + CHUNK_SIZE * 2);
  if (camera.far !== cameraFar) {
    camera.far = cameraFar;
    camera.updateProjectionMatrix();
  }
};

const syncDebugHudVisibility = () => {
  if (!statusEl) return;
  const shouldShow =
    state.debugHud && state.mode === "playing" && !state.inventoryOpen && !state.craftingTableOpen;
  statusEl.classList.toggle("hidden", !shouldShow);
};

const updateOptionsUI = () => {
  if (optionsSensitivityEl) {
    optionsSensitivityEl.value = String(state.mouseSensitivity);
  }
  if (optionsSensitivityValueEl) {
    optionsSensitivityValueEl.textContent = formatSensitivity(state.mouseSensitivity);
  }
  if (optionsFovEl) {
    optionsFovEl.value = String(Math.round(state.fov));
  }
  if (optionsFovValueEl) {
    optionsFovValueEl.textContent = formatFov(state.fov);
  }
  if (optionsViewDistanceEl) {
    const maxRadius = state.unlimitedViewDistance ? VIEW_RADIUS_UNLIMITED : VIEW_RADIUS_MAX;
    optionsViewDistanceEl.max = String(maxRadius);
    optionsViewDistanceEl.value = String(Math.round(state.viewRadius));
    optionsViewDistanceEl.disabled = state.unlimitedViewDistance;
  }
  if (optionsViewDistanceValueEl) {
    optionsViewDistanceValueEl.textContent = state.unlimitedViewDistance
      ? "∞"
      : formatViewRadius(state.viewRadius);
  }
  if (optionsUnlimitedViewBtn) {
    optionsUnlimitedViewBtn.textContent = `Végtelen látótáv: ${state.unlimitedViewDistance ? "Be" : "Ki"}`;
  }
  if (optionsDebugBtn) {
    optionsDebugBtn.textContent = `Debug HUD: ${state.debugHud ? "Be" : "Ki"}`;
  }
  if (optionsPerfBtn) {
    optionsPerfBtn.textContent = `Perf overlay: ${isPerfOverlayEnabled() ? "Be" : "Ki"}`;
  }
  if (optionsFullscreenBtn) {
    const active = Boolean(document.fullscreenElement);
    optionsFullscreenBtn.textContent = active ? "Kilépés teljes képernyőből" : "Teljes képernyő";
  }
};

const saveSettings = () => {
  try {
    const payload = {
      sensitivity: state.mouseSensitivity,
      fov: state.fov,
      viewRadius: state.viewRadius,
      unlimitedViewDistance: state.unlimitedViewDistance,
      debugHud: state.debugHud,
      perfOverlay: isPerfOverlayEnabled(),
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch (err) {
    // Ignore storage failures.
  }
};

const applySettings = (settings) => {
  const nextSensitivity = clamp(Number(settings?.sensitivity ?? state.mouseSensitivity), MIN_SENSITIVITY, MAX_SENSITIVITY);
  const nextFov = clamp(Number(settings?.fov ?? state.fov ?? camera.fov), MIN_FOV, MAX_FOV);
  const unlimited = Boolean(settings?.unlimitedViewDistance ?? state.unlimitedViewDistance);
  const maxRadius = unlimited ? VIEW_RADIUS_UNLIMITED : VIEW_RADIUS_MAX;
  const nextViewRadius = clamp(
    Number(settings?.viewRadius ?? state.viewRadius ?? CHUNK_RADIUS),
    VIEW_RADIUS_MIN,
    maxRadius
  );
  state.mouseSensitivity = Number.isFinite(nextSensitivity) ? nextSensitivity : 1;
  state.fov = Number.isFinite(nextFov) ? nextFov : camera.fov;
  state.viewRadius = Number.isFinite(nextViewRadius) ? Math.round(nextViewRadius) : CHUNK_RADIUS;
  state.unlimitedViewDistance = unlimited;
  state.debugHud = Boolean(settings?.debugHud ?? state.debugHud);
  camera.fov = state.fov;
  camera.updateProjectionMatrix();
  updateFogDistance();
  state.currentChunkX = null;
  state.currentChunkZ = null;
  state.currentViewRadius = null;
  if (settings && Object.prototype.hasOwnProperty.call(settings, "perfOverlay")) {
    setPerfOverlayEnabled(Boolean(settings.perfOverlay));
  }
  syncDebugHudVisibility();
  updateOptionsUI();
};

const loadSettings = () => {
  const defaults = {
    sensitivity: state.mouseSensitivity,
    fov: state.fov,
    viewRadius: state.viewRadius,
    unlimitedViewDistance: state.unlimitedViewDistance,
    debugHud: state.debugHud,
    perfOverlay: false,
  };
  let next = defaults;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        next = { ...defaults, ...parsed };
      }
    }
  } catch (err) {
    next = defaults;
  }
  applySettings(next);
};

const MULTIPLAYER_SETTINGS_KEY = "blockland_multiplayer_v1";

const loadMultiplayerSettings = () => {
  const defaults = {
    name: state.multiplayer.name,
    serverUrl: state.multiplayer.serverUrl,
  };
  let settings = defaults;
  try {
    const raw = localStorage.getItem(MULTIPLAYER_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        settings = { ...defaults, ...parsed };
      }
    }
  } catch (err) {
    settings = defaults;
  }
  state.multiplayer.name = settings.name || state.multiplayer.name;
  state.multiplayer.serverUrl = settings.serverUrl || state.multiplayer.serverUrl;
};

const saveMultiplayerSettings = () => {
  try {
    const payload = {
      name: state.multiplayer.name,
      serverUrl: state.multiplayer.serverUrl,
    };
    localStorage.setItem(MULTIPLAYER_SETTINGS_KEY, JSON.stringify(payload));
  } catch (err) {
    // ignore
  }
};

const buildJoinLink = (room, seed) => {
  if (!room || seed == null) return "";
  const url = new URL(window.location.href);
  url.searchParams.set("room", room);
  url.searchParams.set("seed", String(seed));
  return url.toString();
};

const updateMultiplayerUI = () => {
  if (mpNameInput) mpNameInput.value = state.multiplayer.name;
  if (mpServerInput) mpServerInput.value = state.multiplayer.serverUrl;
  if (mpRoomInput && state.multiplayer.room) mpRoomInput.value = state.multiplayer.room;

  if (mpDisconnectBtn) {
    mpDisconnectBtn.classList.toggle("hidden", !state.multiplayer.connected);
  }

  if (mpStatusEl) {
    if (state.multiplayer.connected) {
      mpStatusEl.textContent = `Kapcsolódva: ${state.multiplayer.room} · ${state.multiplayer.isHost ? "Host" : "Client"}`;
    } else if (network.connecting) {
      mpStatusEl.textContent = "Kapcsolódás...";
    } else {
      mpStatusEl.textContent = "Nincs kapcsolat.";
    }
  }

  if (mpLinkEl) {
    if (state.multiplayer.connected) {
      const link = buildJoinLink(state.multiplayer.room, network.seed ?? randomSeed);
      mpLinkEl.textContent = link ? `Meghívó link: ${link}` : "";
      mpLinkEl.classList.toggle("hidden", !link);
    } else {
      mpLinkEl.textContent = "";
      mpLinkEl.classList.add("hidden");
    }
  }
};

const openMultiplayerMenu = () => {
  if (!multiplayerMenuEl) return;
  multiplayerMenuEl.classList.remove("hidden");
  unlockPointer();
  updateMultiplayerUI();
  if (mpNameInput) mpNameInput.focus();
};

const closeMultiplayerMenu = () => {
  if (!multiplayerMenuEl) return;
  multiplayerMenuEl.classList.add("hidden");
  if (state.mode === "playing") lockPointer();
};

const getTabPlayers = () => {
  if (!state.multiplayer.connected) return [];
  const names = [];
  const selfName = state.multiplayer.name || "You";
  names.push(selfName);
  for (const playerInfo of getRemotePlayers()) {
    if (playerInfo?.name) names.push(playerInfo.name);
  }
  return names;
};

const updateTabList = () => {
  if (!tabListEl) return;
  if (!state.multiplayer.connected) {
    tabListEl.innerHTML = "";
    return;
  }
  const players = getTabPlayers();
  const title = `<div class="tab-title">Játékosok: ${players.length}</div>`;
  const rows = players.map((name) => `<div class="tab-row">${name}</div>`).join("");
  tabListEl.innerHTML = `${title}${rows}`;
};

const openTabList = () => {
  if (!tabListEl || !state.multiplayer.connected) return;
  updateTabList();
  tabListEl.classList.remove("hidden");
};

const closeTabList = () => {
  if (!tabListEl) return;
  tabListEl.classList.add("hidden");
};

const applyMultiplayerState = (payload) => {
  state.multiplayer.connected = true;
  state.multiplayer.enabled = true;
  state.multiplayer.isHost = network.isHost;
  state.multiplayer.room = payload.room;
};

const setMultiplayerStatus = (text) => {
  if (mpStatusEl) mpStatusEl.textContent = text;
};

const startMultiplayerConnection = (isHost) => {
  const name = mpNameInput?.value?.trim() || state.multiplayer.name || "Player";
  const serverUrl = mpServerInput?.value?.trim() || state.multiplayer.serverUrl;
  const room = mpRoomInput?.value?.trim().toUpperCase() || null;
  if (!serverUrl) {
    setMultiplayerStatus("Adj meg szerver címet.");
    return;
  }
  if (!isHost && !room) {
    setMultiplayerStatus("Add meg a szoba kódot.");
    return;
  }
  state.multiplayer.name = name;
  state.multiplayer.serverUrl = serverUrl;
  saveMultiplayerSettings();
  connect({ url: serverUrl, room, name, isHost, seed: randomSeed });
  updateMultiplayerUI();
};

const stopMultiplayerConnection = () => {
  disconnect();
  state.multiplayer.connected = false;
  state.multiplayer.enabled = false;
  state.multiplayer.isHost = false;
  state.multiplayer.room = null;
  clearRemotePlayers();
  updateMultiplayerUI();
};

const applyBlockUpdates = (updates) => {
  if (!Array.isArray(updates)) return;
  for (const update of updates) {
    if (!update || typeof update.key !== "string") continue;
    const [sx, sy, sz] = update.key.split(",");
    const x = Number(sx);
    const y = Number(sy);
    const z = Number(sz);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const type = update.type ?? 0;
    if (type === 18 && update.torchOrientation) {
      setTorchOrientation(x, y, z, update.torchOrientation);
    } else if (type !== 18) {
      removeTorchOrientation(x, y, z);
    }
    const allowSim = state.multiplayer.isHost;
    setBlock(x, y, z, type, {
      remote: true,
      skipBroadcast: true,
      skipWater: !allowSim,
      skipPhysics: !allowSim,
      waterLevel: update.waterLevel ?? null,
      torchOrientation: update.torchOrientation ?? null,
    });
  }
};

const applySnapshot = (snapshot) => {
  if (!snapshot) return;
  if (Array.isArray(snapshot.blocks)) applyBlockUpdates(snapshot.blocks);
  if (Array.isArray(snapshot.mobs)) syncMobs(snapshot.mobs);
  if (Array.isArray(snapshot.items)) syncItemEntities(snapshot.items);
  if (Number.isFinite(snapshot.timeOfDay)) {
    setTimeOfDay(snapshot.timeOfDay);
  }
  if (Array.isArray(snapshot.players)) {
    for (const playerState of snapshot.players) {
      if (!playerState || playerState.id === network.clientId) continue;
      upsertRemotePlayer(playerState);
    }
  }
};

const resetInputState = () => {
  input.forward = false;
  input.backward = false;
  input.left = false;
  input.right = false;
  input.jump = false;
  input.sprint = false;
  input.boost = false;
  input.mining = false;
  input.isSprinting = false;
  input.jumping = false;
  input.lastWPress = 0;
  resetMining();
};

let lastPlayerStateSent = 0;
let lastEntitiesSent = 0;
let pendingSnapshot = null;
let lastPlayerDataSent = 0;

const playerRaycaster = new THREE.Raycaster();
playerRaycaster.far = 3.5;
const playerRayCenter = new THREE.Vector2(0, 0);
const playerRayDir = new THREE.Vector3();
const PLAYER_TARGET_UPDATE_MS = 33;
const lastPlayerTargetCamPos = new THREE.Vector3();
let lastPlayerTargetYaw = 0;
let lastPlayerTargetPitch = 0;
let lastPlayerTargetUpdate = 0;

const updatePlayerTarget = () => {
  const meshes = getRemotePlayerMeshes();
  if (!meshes.length) {
    state.targetedPlayer = null;
    return;
  }
  const now = performance.now();
  const moved =
    lastPlayerTargetCamPos.distanceToSquared(camera.position) > 0.0004 ||
    Math.abs(player.yaw - lastPlayerTargetYaw) > 0.0005 ||
    Math.abs(player.pitch - lastPlayerTargetPitch) > 0.0005;
  if (!moved && now - lastPlayerTargetUpdate < PLAYER_TARGET_UPDATE_MS) {
    return;
  }
  lastPlayerTargetUpdate = now;
  lastPlayerTargetCamPos.copy(camera.position);
  lastPlayerTargetYaw = player.yaw;
  lastPlayerTargetPitch = player.pitch;
  playerRaycaster.setFromCamera(playerRayCenter, camera);
  const hits = playerRaycaster.intersectObjects(meshes, true);
  if (!hits.length) {
    state.targetedPlayer = null;
    return;
  }
  camera.getWorldDirection(playerRayDir);
  const blockHit = raycastVoxel(camera.position, playerRayDir, playerRaycaster.far, getBlock);
  if (blockHit && blockHit.distance + 0.01 < hits[0].distance) {
    state.targetedPlayer = null;
    return;
  }
  const targetId = hits[0].object.userData?.remotePlayerId;
  state.targetedPlayer = targetId ? getRemotePlayerById(targetId) : null;
};

const buildPlayerStatePayload = () => {
  const selected = hotbar[state.selectedHotbar];
  return {
    x: Number(player.position.x.toFixed(3)),
    y: Number(player.position.y.toFixed(3)),
    z: Number(player.position.z.toFixed(3)),
    yaw: Number(player.yaw.toFixed(3)),
    pitch: Number(player.pitch.toFixed(3)),
    vx: Number(player.velocity.x.toFixed(3)),
    vy: Number(player.velocity.y.toFixed(3)),
    vz: Number(player.velocity.z.toFixed(3)),
    heldItem: selected?.id || null,
    gamemode: state.gamemode,
    health: player.health,
    hunger: player.hunger,
  };
};

const applySlotPayload = (slot, data) => {
  if (!data || !data.id || data.count <= 0) {
    setSlot(slot, null, 0);
    return;
  }
  setSlot(slot, data.id, data.count);
  if (data.durability != null) {
    slot.durability = data.durability;
  }
};

const applyPlayerData = (data) => {
  if (!data) return;
  if (Array.isArray(data.hotbar)) {
    for (let i = 0; i < hotbar.length; i += 1) {
      applySlotPayload(hotbar[i], data.hotbar[i]);
    }
  }
  if (Array.isArray(data.inventory)) {
    for (let i = 0; i < inventory.length; i += 1) {
      applySlotPayload(inventory[i], data.inventory[i]);
    }
  }
  if (Number.isFinite(data.health)) player.health = data.health;
  if (Number.isFinite(data.hunger)) player.hunger = data.hunger;
  if (data.gamemode) state.gamemode = data.gamemode;
  if (data.respawnPoint) state.respawnPoint = data.respawnPoint;
  updateAllSlotsUI();
  updateSurvivalUI();
};

const buildPlayerDataPayload = () => ({
  hotbar: hotbar.map((slot) => ({
    id: slot.id,
    count: slot.count,
    durability: slot.durability ?? null,
  })),
  inventory: inventory.map((slot) => ({
    id: slot.id,
    count: slot.count,
    durability: slot.durability ?? null,
  })),
  health: player.health,
  hunger: player.hunger,
  gamemode: state.gamemode,
  respawnPoint: state.respawnPoint,
});

const sendNetworkUpdates = (now) => {
  if (!network.connected) return;
  if (now - lastPlayerStateSent > 0.05) {
    lastPlayerStateSent = now;
    sendPlayerState(buildPlayerStatePayload());
  }
  if (now - lastPlayerDataSent > 1.0) {
    lastPlayerDataSent = now;
    sendPlayerData(buildPlayerDataPayload());
  }
  if (network.isHost && now - lastEntitiesSent > 0.2) {
    lastEntitiesSent = now;
    const mobsPayload = getMobs().map((mob) => ({
      id: mob.id,
      type: mob.type,
      x: Number(mob.position.x.toFixed(3)),
      y: Number(mob.position.y.toFixed(3)),
      z: Number(mob.position.z.toFixed(3)),
      yaw: Number(mob.yaw.toFixed(3)),
      health: mob.health,
    }));
    const itemsPayload = itemEntities.map((entity) => ({
      entityId: entity.entityId,
      id: entity.id,
      count: entity.count,
      x: Number(entity.position.x.toFixed(3)),
      y: Number(entity.position.y.toFixed(3)),
      z: Number(entity.position.z.toFixed(3)),
    }));
    sendEntities({
      timeOfDay: Number(state.timeOfDay.toFixed(3)),
      mobs: mobsPayload,
      items: itemsPayload,
    });
  }
};

const setHudVisible = (visible) => {
  if (!hud) return;
  hud.classList.toggle("hidden", !visible);
  if (!visible) return;
  syncDebugHudVisibility();
};

const openPauseMenu = () => {
  if (state.mode !== "playing") return;
  state.mode = "paused";
  state.optionsOpen = false;
  pauseMenuEl?.classList.remove("hidden");
  optionsMenuEl?.classList.add("hidden");
  setHudVisible(false);
  unlockPointer();
  resetInputState();
};

const closePauseMenu = () => {
  if (state.mode !== "paused") return;
  state.mode = "playing";
  state.optionsOpen = false;
  pauseMenuEl?.classList.add("hidden");
  optionsMenuEl?.classList.add("hidden");
  setHudVisible(true);
  lockPointer();
};

const openOptionsMenu = () => {
  if (state.mode !== "paused") return;
  state.optionsOpen = true;
  pauseMenuEl?.classList.add("hidden");
  optionsMenuEl?.classList.remove("hidden");
  updateOptionsUI();
};

const closeOptionsMenu = () => {
  if (state.mode !== "paused") return;
  state.optionsOpen = false;
  optionsMenuEl?.classList.add("hidden");
  pauseMenuEl?.classList.remove("hidden");
};

const openMainMenu = () => {
  state.mode = "menu";
  state.optionsOpen = false;
  pauseMenuEl?.classList.add("hidden");
  optionsMenuEl?.classList.add("hidden");
  menu?.classList.remove("hidden");
  setHudVisible(false);
  unlockPointer();
  resetInputState();
};

const resumeFromMenu = () => {
  if (state.mode !== "menu") return;
  menu?.classList.add("hidden");
  state.mode = "playing";
  setHudVisible(true);
  lockPointer();
};

const toggleDebugHud = () => {
  state.debugHud = !state.debugHud;
  syncDebugHudVisibility();
  saveSettings();
  updateOptionsUI();
};

const togglePerfOverlayWithSave = () => {
  togglePerfOverlay();
  saveSettings();
  updateOptionsUI();
};

const BENCH_DURATION_MS = 30000;
const BENCH_SPAM_INTERVAL_MS = 100;
const BENCH_BLOCK_TYPE = 11;
const testMode = urlParams.get("test") === "1";

if (testMode && typeof window !== "undefined") {
  window.__RAF_TICKS = 0;
}

const normalizeBenchScenario = (value) => {
  if (!value) return "A";
  const normalized = value.trim().toUpperCase();
  if (normalized === "B" || normalized === "C") return normalized;
  return "A";
};

const benchState = {
  enabled: urlParams.get("bench") === "1",
  scenario: normalizeBenchScenario(urlParams.get("scenario")),
  started: false,
  elapsedMs: 0,
  actionTimerMs: 0,
  actionPhase: 0,
  target: null,
};

const resetBenchInput = () => {
  input.forward = false;
  input.backward = false;
  input.left = false;
  input.right = false;
  input.jump = false;
  input.sprint = false;
  input.boost = false;
  input.mining = false;
  resetMining();
};

const computeBenchTarget = () => {
  const distance = 3;
  const forwardX = Math.sin(player.yaw);
  const forwardZ = Math.cos(player.yaw);
  const x = Math.round(player.position.x + forwardX * distance);
  const z = Math.round(player.position.z + forwardZ * distance);
  const y = Math.round(player.position.y + 1);
  if (!isWithinWorld(x, y, z)) return null;
  return { x, y, z };
};

const prepareBenchStart = () => {
  const startPos = {
    x: spawn.x + 0.5,
    y: Math.max(spawn.height + 2, SEA_LEVEL + 2),
    z: spawn.z + 0.5,
  };
  teleportPlayer(startPos.x, startPos.y, startPos.z);
  player.yaw = 0;
  player.pitch = 0;
  resetBenchInput();
  benchState.actionTimerMs = 0;
  benchState.actionPhase = 0;
  benchState.target = computeBenchTarget();
  if (benchState.target) {
    setBlock(benchState.target.x, benchState.target.y, benchState.target.z, 0);
  }
};

const startBenchScenario = () => {
  benchState.started = true;
  benchState.elapsedMs = 0;
  benchState.actionTimerMs = 0;
  benchState.actionPhase = 0;
  startBenchmark(BENCH_DURATION_MS, `scenario-${benchState.scenario}`, {
    scenario: benchState.scenario,
    seed: randomSeed,
  });
};

const updateBenchScenario = (dt) => {
  if (!benchState.started) return;
  benchState.elapsedMs += dt * 1000;
  if (benchState.elapsedMs >= BENCH_DURATION_MS) {
    benchState.started = false;
    resetBenchInput();
    return;
  }

  player.yaw = 0;
  player.pitch = 0;

  if (benchState.scenario === "A") {
    resetBenchInput();
    return;
  }

  if (benchState.scenario === "B") {
    resetBenchInput();
    input.forward = true;
    input.sprint = true;
    return;
  }

  if (benchState.scenario === "C") {
    resetBenchInput();
    if (!benchState.target) return;
    benchState.actionTimerMs += dt * 1000;
    while (benchState.actionTimerMs >= BENCH_SPAM_INTERVAL_MS) {
      benchState.actionTimerMs -= BENCH_SPAM_INTERVAL_MS;
      benchState.actionPhase += 1;
      const shouldPlace = benchState.actionPhase % 2 === 1;
      const current = getBlock(benchState.target.x, benchState.target.y, benchState.target.z);
      if (shouldPlace) {
        if (current === 0) {
          setBlock(benchState.target.x, benchState.target.y, benchState.target.z, BENCH_BLOCK_TYPE);
        }
      } else if (current !== 0) {
        setBlock(benchState.target.x, benchState.target.y, benchState.target.z, 0);
      }
    }
  }
};

const applyDebugState = () => {
  const debugEnabled = urlParams.get("debug") === "1";
  if (debugEnabled) {
    const gm = urlParams.get("gamemode");
    if (gm) {
      const raw = gm.toLowerCase();
      if (raw.startsWith("spec")) state.gamemode = "spectator";
      else if (raw.startsWith("cre")) state.gamemode = "creative";
      else if (raw.startsWith("sur")) state.gamemode = "survival";
    }
    const time = urlParams.get("time");
    if (time) {
      const t = time.toLowerCase();
      if (t === "day") setTimeOfDay(0.25);
      if (t === "night") setTimeOfDay(0.75);
      if (t === "dawn") setTimeOfDay(0);
      if (t === "dusk") setTimeOfDay(0.5);
    }
    const hand = urlParams.get("hand");
    if (hand === "torch") {
      hotbar[0].id = "torch";
      hotbar[0].count = 64;
      hotbar[0].durability = null;
      state.selectedHotbar = 0;
    }
    updateAllSlotsUI();

    const ui = urlParams.get("ui");
    if (ui === "inventory") openInventory();
    if (ui === "crafting") openCraftingTable();
    if (ui === "chat") openChat("/");
    if (ui === "death") {
      setTimeout(() => {
        killPlayer();
      }, 50);
    }
    if (urlParams.get("debugHud") === "1") {
      state.debugHud = true;
    }

    if (urlParams.get("perf") === "1") {
      setPerfOverlayEnabled(true);
    }
  }

  syncDebugHudVisibility();
  updateOptionsUI();

  if (benchState.enabled) {
    setTimeout(() => {
      prepareBenchStart();
      startBenchScenario();
    }, 200);
  }
};

loadSettings();
loadMultiplayerSettings();
if (window.location.host) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const currentWs = `${proto}://${window.location.host}`;
  const saved = state.multiplayer.serverUrl;
  const isLocalHost = (value) => value === "localhost" || value === "127.0.0.1";
  if (!saved) {
    state.multiplayer.serverUrl = currentWs;
  } else {
    try {
      const parsed = new URL(saved);
      const sameLocal = isLocalHost(parsed.hostname) && isLocalHost(window.location.hostname);
      const portMismatch = parsed.port !== window.location.port;
      const legacyDefault = saved === "ws://localhost:8000" || saved === "ws://localhost:8080";
      if ((sameLocal && portMismatch) || legacyDefault) {
        state.multiplayer.serverUrl = currentWs;
      }
    } catch (err) {
      state.multiplayer.serverUrl = currentWs;
    }
  }
}
updateMultiplayerUI();
const autoRoom = urlParams.get("room");
if (autoRoom) {
  if (mpRoomInput) mpRoomInput.value = autoRoom;
  startMultiplayerConnection(false);
}

optionsSensitivityEl?.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) return;
  state.mouseSensitivity = clamp(value, MIN_SENSITIVITY, MAX_SENSITIVITY);
  saveSettings();
  updateOptionsUI();
});

optionsFovEl?.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) return;
  state.fov = clamp(value, MIN_FOV, MAX_FOV);
  camera.fov = state.fov;
  camera.updateProjectionMatrix();
  saveSettings();
  updateOptionsUI();
});

optionsViewDistanceEl?.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  if (!Number.isFinite(value)) return;
  const maxRadius = state.unlimitedViewDistance ? VIEW_RADIUS_UNLIMITED : VIEW_RADIUS_MAX;
  state.viewRadius = clamp(Math.round(value), VIEW_RADIUS_MIN, maxRadius);
  updateFogDistance();
  state.currentChunkX = null;
  state.currentChunkZ = null;
  state.currentViewRadius = null;
  saveSettings();
  updateOptionsUI();
});

optionsUnlimitedViewBtn?.addEventListener("click", () => {
  state.unlimitedViewDistance = !state.unlimitedViewDistance;
  if (state.unlimitedViewDistance) {
    state.viewRadius = Math.max(state.viewRadius, VIEW_RADIUS_UNLIMITED);
  } else if (state.viewRadius > VIEW_RADIUS_MAX) {
    state.viewRadius = VIEW_RADIUS_MAX;
  }
  updateFogDistance();
  state.currentChunkX = null;
  state.currentChunkZ = null;
  state.currentViewRadius = null;
  saveSettings();
  updateOptionsUI();
});

optionsDebugBtn?.addEventListener("click", () => {
  toggleDebugHud();
});

optionsPerfBtn?.addEventListener("click", () => {
  togglePerfOverlayWithSave();
});

optionsFullscreenBtn?.addEventListener("click", () => {
  toggleFullscreen();
});

optionsBackBtn?.addEventListener("click", () => {
  closeOptionsMenu();
});

mpHostBtn?.addEventListener("click", () => {
  startMultiplayerConnection(true);
});

mpJoinBtn?.addEventListener("click", () => {
  startMultiplayerConnection(false);
});

mpDisconnectBtn?.addEventListener("click", () => {
  stopMultiplayerConnection();
});

mpCloseBtn?.addEventListener("click", () => {
  closeMultiplayerMenu();
});

pauseResumeBtn?.addEventListener("click", () => {
  closePauseMenu();
});

pauseMultiplayerBtn?.addEventListener("click", () => {
  openMultiplayerMenu();
});

pauseOptionsBtn?.addEventListener("click", () => {
  openOptionsMenu();
});

pauseQuitBtn?.addEventListener("click", () => {
  openMainMenu();
});

menuResumeBtn?.addEventListener("click", () => {
  resumeFromMenu();
});

menuRestartBtn?.addEventListener("click", () => {
  window.location.reload();
});

document.addEventListener("fullscreenchange", () => {
  updateOptionsUI();
});

setNetworkHandlers({
  onWelcome: (payload) => {
    applyMultiplayerState(payload);
    if (mpRoomInput) mpRoomInput.value = payload.room || "";
    if (!network.isHost) {
      clearMobs();
      clearItemEntities();
    }
    clearRemotePlayers();
    if (state.worldInitialized) {
      applySnapshot(payload.snapshot);
    } else {
      pendingSnapshot = payload.snapshot;
    }
    if (payload.playerData) {
      applyPlayerData(payload.playerData);
    }
    if (payload.seed !== randomSeed) {
      const link = buildJoinLink(payload.room, payload.seed);
      const seedParam = urlParams.get("seed");
      const shouldReload =
        urlParams.get("test") !== "1" &&
        (!seedParam || Number(seedParam) !== Number(payload.seed));
      setMultiplayerStatus("Seed eltérés! Újratöltés a pontos world-hez...");
      if (mpLinkEl && link) {
        mpLinkEl.textContent = `Meghívó link: ${link}`;
        mpLinkEl.classList.remove("hidden");
      }
      if (shouldReload && link) {
        window.location.href = link;
      }
    }
    updateMultiplayerUI();
  },
  onPlayerState: (payload) => {
    if (!payload || payload.id === network.clientId) return;
    upsertRemotePlayer(payload);
    if (tabListEl && !tabListEl.classList.contains("hidden")) updateTabList();
  },
  onPlayerJoin: (payload) => {
    if (!payload || !payload.name) return;
    addChatMessage(`${payload.name} csatlakozott.`, "system");
    if (tabListEl && !tabListEl.classList.contains("hidden")) updateTabList();
  },
  onPlayerLeave: (payload) => {
    if (!payload) return;
    removeRemotePlayer(payload.id);
    if (payload.name) addChatMessage(`${payload.name} kilépett.`, "system");
    if (tabListEl && !tabListEl.classList.contains("hidden")) updateTabList();
  },
  onBlockUpdate: (payload) => {
    if (!payload || payload.sourceId === network.clientId) return;
    applyBlockUpdates(payload.updates);
  },
  onEntities: (payload) => {
    if (network.isHost) return;
    if (Array.isArray(payload.mobs)) syncMobs(payload.mobs);
    if (Array.isArray(payload.items)) syncItemEntities(payload.items);
    if (Number.isFinite(payload.timeOfDay)) setTimeOfDay(payload.timeOfDay);
  },
  onChat: (payload) => {
    if (!payload || payload.id === network.clientId) return;
    if (payload.kind === "system") {
      addChatMessage(payload.text, "system");
      return;
    }
    if (payload.kind === "me") {
      addChatMessage(`* ${payload.name} ${payload.text}`, "system");
      return;
    }
    addChatMessage(`${payload.name}: ${payload.text}`, "player");
  },
  onPlayerDamage: (payload) => {
    if (!payload || payload.amount == null) return;
    takeDamage(payload.amount);
    if (Number.isFinite(payload.health)) {
      player.health = payload.health;
      updateSurvivalUI();
    }
  },
  onHostChange: () => {
    state.multiplayer.isHost = network.isHost;
    updateMultiplayerUI();
  },
  onDisconnect: () => {
    state.multiplayer.connected = false;
    state.multiplayer.enabled = false;
    state.multiplayer.isHost = false;
    state.multiplayer.room = null;
    clearRemotePlayers();
    closeTabList();
    updateMultiplayerUI();
  },
  onError: (err) => {
    if (err?.message) setMultiplayerStatus(err.message);
  },
  onAction: (payload) => {
    if (!network.isHost) return;
    const action = payload?.action;
    if (!action || !action.kind) return;
    if (action.kind === "attack_mob") {
      const mob = getMobs().find((m) => m.id === action.mobId);
      if (mob) attackMob(mob, action.damage ?? 2);
      return;
    }
    if (action.kind === "spawn_mob") {
      if (!action.type || !action.position) return;
      const pos = new THREE.Vector3(action.position.x, action.position.y, action.position.z);
      spawnMob(action.type, pos);
      return;
    }
    if (action.kind === "block_update") {
      const updates = Array.isArray(action.updates) ? action.updates : [];
      for (const update of updates) {
        if (!update || typeof update.key !== "string") continue;
        const [sx, sy, sz] = update.key.split(",");
        const x = Number(sx);
        const y = Number(sy);
        const z = Number(sz);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        setBlock(x, y, z, update.type ?? 0, {
          skipWater: false,
          skipPhysics: false,
          waterLevel: update.waterLevel ?? null,
          torchOrientation: update.torchOrientation ?? null,
        });
      }
      return;
    }
    if (action.kind === "set_time") {
      if (!Number.isFinite(action.value)) return;
      setTimeOfDay(action.value);
      return;
    }
    if (action.kind === "attack_player") {
      const targetId = action.targetId ? String(action.targetId) : null;
      const amount = Number.isFinite(action.amount) ? action.amount : 2;
      if (!targetId || amount <= 0) return;
      if (targetId === network.clientId) {
        takeDamage(amount);
        return;
      }
      sendPlayerDamage(targetId, amount);
      return;
    }
    if (action.kind === "item_pickup") {
      if (action.entityId == null) return;
      const entityId = Number(action.entityId);
      if (Number.isFinite(entityId)) {
        removeItemEntityById(entityId);
      }
    }
  },
});

const startGame = async () => {
  // Textúrák és atlas betöltése
  console.log("Atlas inicializálása...");
  await initializeAtlas();
  initAtlasMaterials();
  Object.assign(blockIcons, getBlockIcons());
  refreshItemIcons();
  console.log("Atlas kész!");
  
  initializeWorld();
  initTime();
  state.mode = "playing";
  state.optionsOpen = false;
  if (menu) menu.classList.add("hidden");
  setHudVisible(true);
  lockPointer();
  updateAllSlotsUI();
  if (!state.multiplayer.enabled || state.multiplayer.isHost) {
    spawnInitialMobs(player.position);
  }
  if (pendingSnapshot) {
    applySnapshot(pendingSnapshot);
    pendingSnapshot = null;
  }
  applyDebugState();
};

if (startBtn) {
  startBtn.addEventListener("click", () => {
    startGame();
  });
}

if (!startBtn) {
  // Auto-start when no start button exists.
  startGame();
}

canvas?.addEventListener("click", () => {
  if (state.mode === "playing" && document.pointerLockElement !== canvas) {
    lockPointer();
  }
});

window.addEventListener("keydown", (event) => {
  if (isChatOpen()) {
    if (event.code === "Escape") closeChat();
    return;
  }

  if (state.mode === "paused") {
    if (event.code === "Escape") {
      if (state.optionsOpen) closeOptionsMenu();
      else closePauseMenu();
    }
    return;
  }

  if (state.mode !== "playing") return;

  if (event.code === "Tab") {
    openTabList();
    event.preventDefault();
    return;
  }

  // Dupla W nyomás sprint (Minecraft mechanika)
  if (event.code === "KeyW" || event.code === "ArrowUp") {
    const now = Date.now();
    if (!input.forward && now - input.lastWPress < 300) {
      // Dupla W nyomás 300ms-en belül
      input.isSprinting = true;
    }
    input.lastWPress = now;
    input.forward = true;
  }
  
  if (event.code === "KeyS" || event.code === "ArrowDown") input.backward = true;
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = true;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = true;
  if (event.code === "Space") input.jump = true;
  if (event.code === "ShiftLeft") input.sprint = true;
  
  // Ctrl is sprint (Minecraft 1.15+)
  if (event.code === "ControlLeft" || event.code === "ControlRight") {
    input.isSprinting = true;
    input.boost = true;
  }
  
  if (event.code === "KeyF") toggleFullscreen();
  if (event.code === "F3") toggleDebugHud();
  if (event.code === "F4") togglePerfOverlayWithSave();

  if (event.code.startsWith("Digit")) {
    const digit = Number(event.code.replace("Digit", ""));
    if (digit >= 1 && digit <= 9) {
      state.selectedHotbar = digit - 1;
      updateAllSlotsUI();
    }
  }

  if (event.code === "KeyE" || event.code === "KeyI") {
    if (state.craftingTableOpen) closeCraftingTable();
    else if (state.inventoryOpen) closeInventory();
    else openInventory();
  }

  if (event.code === "Escape") {
    if (state.craftingTableOpen) {
      closeCraftingTable();
    } else if (state.inventoryOpen) {
      closeInventory();
    } else {
      openPauseMenu();
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (isChatOpen()) return;
  if (state.mode !== "playing") return;
  if (event.code === "Tab") {
    closeTabList();
    event.preventDefault();
    return;
  }
  if (event.code === "KeyW" || event.code === "ArrowUp") {
    input.forward = false;
    // Sprint leáll ha nem megyünk előre
    if (input.isSprinting && !input.boost) {
      input.isSprinting = false;
    }
  }
  if (event.code === "KeyS" || event.code === "ArrowDown") {
    input.backward = false;
    // Sprint leáll ha hátra megyünk
    if (input.isSprinting) {
      input.isSprinting = false;
    }
  }
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = false;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = false;
  if (event.code === "Space") input.jump = false;
  if (event.code === "ShiftLeft") input.sprint = false;
  if (event.code === "ControlLeft" || event.code === "ControlRight") {
    input.boost = false;
    // Sprint leáll ha elengedjük a Ctrl-t (kivéve ha dupla W-vel aktiváltuk)
    if (input.isSprinting && !input.forward) {
      input.isSprinting = false;
    }
  }
});

window.addEventListener("wheel", (event) => {
  if (isChatOpen()) return;
  if (state.mode !== "playing") return;
  if (state.inventoryOpen || state.craftingTableOpen) return;
  if (event.deltaY > 0) {
    state.selectedHotbar = (state.selectedHotbar + 1) % hotbar.length;
  } else {
    state.selectedHotbar = (state.selectedHotbar - 1 + hotbar.length) % hotbar.length;
  }
  updateAllSlotsUI();
});

window.addEventListener("mousemove", (event) => {
  if (isChatOpen()) return;
  if (state.inventoryOpen || state.craftingTableOpen) return;
  if (!pointerActive() || state.mode !== "playing") return;
  const sensitivity = 0.002 * state.mouseSensitivity;
  player.yaw -= event.movementX * sensitivity;
  player.pitch -= event.movementY * sensitivity;
  player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, player.pitch));
});

window.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("mousedown", (event) => {
  if (isChatOpen()) return;
  if (state.inventoryOpen || state.craftingTableOpen) return;
  if (state.mode !== "playing" || !pointerActive()) return;
  if (state.gamemode === "spectator") return;
  if (event.button === 0) {
    if (state.targetedPlayer) {
      if (network.connected && state.targetedPlayer.id) {
        if (network.isHost) {
          if (state.targetedPlayer.id === network.clientId) {
            takeDamage(2);
          } else {
            sendPlayerDamage(state.targetedPlayer.id, 2);
          }
        } else {
          sendAction({ kind: "attack_player", targetId: state.targetedPlayer.id, amount: 2 });
        }
      }
      return;
    }
    if (state.targetedMob) {
      if (network.connected && !network.isHost) {
        sendAction({ kind: "attack_mob", mobId: state.targetedMob.id, damage: 2 });
      } else {
        attackMob(state.targetedMob);
      }
      return;
    }
    input.mining = true;
  }
  if (event.button === 2) {
    if (state.targetedBlock) {
      const blockType = getBlock(state.targetedBlock.x, state.targetedBlock.y, state.targetedBlock.z);
      if (blockType === 9) {
        openCraftingTable();
        return;
      }
    }
    const selected = hotbar[state.selectedHotbar];
    const spawnType = selected?.id ? itemDefs[selected.id]?.spawnMob : null;
    if (spawnType) {
      const baseX = state.targetedBlock ? state.targetedBlock.x + 0.5 : player.position.x + Math.sin(player.yaw) * 1.5;
      const baseY = state.targetedBlock ? state.targetedBlock.y + 1 : player.position.y + 0.5;
      const baseZ = state.targetedBlock ? state.targetedBlock.z + 0.5 : player.position.z + Math.cos(player.yaw) * 1.5;
      const spawnPos = new THREE.Vector3(baseX, baseY, baseZ);
      if (network.connected && !network.isHost) {
        sendAction({
          kind: "spawn_mob",
          type: spawnType,
          position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
        });
      } else {
        const mob = spawnMob(spawnType, spawnPos);
        if (!mob) return;
      }
      if (state.gamemode !== "creative") {
        selected.count -= 1;
        if (selected.count <= 0) {
          setSlot(selected, null, 0);
        }
        updateAllSlotsUI();
      }
      return;
    }
    if (tryConsumeFood()) return;
    placeBlock();
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    input.mining = false;
    resetMining();
  }
});

const render = () => {
  renderer.render(scene, camera);
};

const tick = (time) => {
  if (testMode && typeof window !== "undefined") {
    window.__RAF_TICKS = (window.__RAF_TICKS || 0) + 1;
  }
  if (!state.manualTime) {
    const now = time * 0.001;
    const rawDt = now - state.lastTime || 0.016;
    const dt = Math.min(0.033, rawDt);
    state.lastTime = now;
    
    // Animált textúrák frissítése (víz, láva)
    updateAnimatedTextures(dt);
    
    if (benchState.enabled) {
      updateBenchScenario(dt);
    }
    const worldStart = performance.now();
    let uiMs = 0;
    if (state.mode === "playing") {
      const isHostSim = !state.multiplayer.enabled || state.multiplayer.isHost;
      if (isHostSim) advanceTime(dt);
      updateMobTarget(camera, state);
      updatePlayerTarget();
      const gameTimings = updateGame(dt);
      uiMs = gameTimings?.uiMs ?? 0;
      if (isHostSim) {
        updateMobs(dt);
        updateFallingBlocks(dt); // Minecraft fizika: falling blocks
      }
      updateItemEntities(dt, now, player, state.gamemode !== "spectator", {
        simulatePhysics: isHostSim,
        allowCleanup: isHostSim,
        onPickup: (entity) => {
          if (network.connected && !network.isHost) {
            sendAction({ kind: "item_pickup", entityId: entity.entityId });
          }
        },
      });
      updateRemotePlayers(dt);
      sendNetworkUpdates(now);
    }
    const worldMs = performance.now() - worldStart;
    const uiStart = performance.now();
    updateChatDisplay();
    uiMs += performance.now() - uiStart;
    const renderStart = performance.now();
    render();
    const renderMs = performance.now() - renderStart;
    setPerfTimings({ renderMs, worldMs, uiMs });
    recordFrameTime(rawDt);
    updatePerfOverlay();
  } else {
    const renderStart = performance.now();
    render();
    const renderMs = performance.now() - renderStart;
    setPerfTimings({ renderMs, worldMs: 0, uiMs: 0 });
  }
  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);

window.render_game_to_text = () => {
  const payload = {
    mode: state.mode,
    gamemode: state.gamemode,
    pauseMenuOpen: state.mode === "paused",
    optionsMenuOpen: state.mode === "paused" && state.optionsOpen,
    menuOpen: state.mode === "menu",
    settings: {
      sensitivity: Number(state.mouseSensitivity.toFixed(2)),
      fov: Number(state.fov.toFixed(1)),
      viewRadius: state.viewRadius,
      unlimitedViewDistance: state.unlimitedViewDistance,
      movementSpeed: Number(state.movementSpeed.toFixed(2)),
      flySpeed: Number(state.flySpeed.toFixed(2)),
    },
    coordSystem: "origin (0,0,0) at world corner; +x east, +y up, +z south",
    player: {
      x: Number(player.position.x.toFixed(2)),
      y: Number(player.position.y.toFixed(2)),
      z: Number(player.position.z.toFixed(2)),
      yaw: Number(player.yaw.toFixed(3)),
      pitch: Number(player.pitch.toFixed(3)),
      onGround: player.onGround,
      health: player.health,
      hunger: player.hunger,
      velocity: {
        x: Number(player.velocity.x.toFixed(2)),
        y: Number(player.velocity.y.toFixed(2)),
        z: Number(player.velocity.z.toFixed(2)),
      },
    },
    target: state.targetedBlock,
    selectedHotbar: state.selectedHotbar,
    selectedItem: hotbar[state.selectedHotbar]?.id || null,
    inventoryOpen: state.inventoryOpen,
    craftingTableOpen: state.craftingTableOpen,
    respawnPoint: state.respawnPoint
      ? { x: Number(state.respawnPoint.x.toFixed(2)), y: Number(state.respawnPoint.y.toFixed(2)), z: Number(state.respawnPoint.z.toFixed(2)) }
      : null,
    blocks: state.blocks,
    worldSize: { chunkSize: CHUNK_SIZE, height: WORLD_MAX_HEIGHT, viewRadius: state.viewRadius },
    seaLevel: SEA_LEVEL,
    seed: randomSeed,
    timeOfDay: Number(state.timeOfDay.toFixed(3)),
    hotbar: hotbar.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    inventory: inventory.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    crafting: craftSlots.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    craftingTable: tableCraftSlots.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    droppedItems: itemEntities.slice(0, 30).map((entity) => ({
      entityId: entity.entityId,
      id: entity.id,
      count: entity.count,
      x: Number(entity.position.x.toFixed(2)),
      y: Number(entity.position.y.toFixed(2)),
      z: Number(entity.position.z.toFixed(2)),
    })),
    mobs: getMobs().map((mob) => ({
      id: mob.id,
      type: mob.type,
      x: Number(mob.position.x.toFixed(2)),
      y: Number(mob.position.y.toFixed(2)),
      z: Number(mob.position.z.toFixed(2)),
      health: mob.health,
    })),
    multiplayer: {
      connected: state.multiplayer.connected,
      isHost: state.multiplayer.isHost,
      room: state.multiplayer.room,
      clientId: network.clientId,
      players: getRemotePlayers().map((p) => ({
        id: p.id,
        name: p.name,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        z: Number(p.z.toFixed(2)),
      })),
    },
    perfBench: typeof window !== "undefined" ? window.__perfBench || null : null,
  };
  return JSON.stringify(payload);
};

if (urlParams.get("test") === "1") {
  window.__test = {
    getBlock: (x, y, z) => getBlock(x, y, z),
    setBlock: (x, y, z, type) => setBlock(x, y, z, type),
    spawnItem: (id, count, x, y, z) => spawnItemDrop(id, count, x, y, z),
    teleport: (x, y, z) => teleportPlayer(x, y, z),
    setView: (yaw, pitch) => {
      player.yaw = yaw;
      player.pitch = pitch;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    },
    lookAt: (x, y, z) => {
      const dx = x - camera.position.x;
      const dy = y - camera.position.y;
      const dz = z - camera.position.z;
      const yaw = Math.atan2(dx, dz);
      const dist = Math.hypot(dx, dz) || 0.0001;
      const pitch = -Math.atan2(dy, dist);
      player.yaw = yaw;
      player.pitch = pitch;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    },
    attackPlayer: (targetId, amount = 2) => {
      if (!network.connected || !targetId) return false;
      if (network.isHost) {
        sendPlayerDamage(String(targetId), amount);
      } else {
        sendAction({ kind: "attack_player", targetId: String(targetId), amount });
      }
      return true;
    },
    listItems: () =>
      itemEntities.map((entity) => ({
        entityId: entity.entityId,
        id: entity.id,
        count: entity.count,
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      })),
    listMobs: () =>
      getMobs().map((mob) => ({
        id: mob.id,
        type: mob.type,
        x: mob.position.x,
        y: mob.position.y,
        z: mob.position.z,
        health: mob.health,
      })),
  };
}

if (urlParams.get("realtime") !== "1") {
  window.advanceTime = (ms) => {
    state.manualTime = true;
    const step = 1 / 60;
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      if (state.mode === "playing") {
        advanceTime(step);
        updateMobTarget(camera, state);
        updateGame(step);
        updateMobs(step);
        updateItemEntities(step, state.lastTime + i * step, player, state.gamemode !== "spectator");
      }
    }
    updateChatDisplay();
    render();
  };
}
