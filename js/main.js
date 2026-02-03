import { camera, renderer, scene, THREE } from "./scene.js";
import {
  disablePointerLock,
  CHUNK_SIZE,
  CHUNK_RADIUS,
  SEA_LEVEL,
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
import { itemEntities, updateItemEntities } from "./entities.js";
import { killPlayer, player, placeBlock, resetMining, teleportPlayer, tryConsumeFood, updateGame } from "./player.js";
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
  optionsFullscreenBtn,
  optionsMenuEl,
  optionsPerfBtn,
  optionsSensitivityEl,
  optionsSensitivityValueEl,
  pauseMenuEl,
  pauseOptionsBtn,
  pauseQuitBtn,
  pauseResumeBtn,
  startBtn,
  statusEl,
} from "./dom.js";
import { lockPointer, unlockPointer } from "./controls.js";
import { attackMob, spawnInitialMobs, spawnMob, updateMobTarget, updateMobs } from "./mobs.js";
import { itemDefs, refreshItemIcons } from "./items.js";
import { getMobs } from "./mobs.js";
import { closeChat, isChatOpen, openChat, updateChatDisplay } from "./chat.js";
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
import { blockIcons, getBlockIcons } from "./textures.js";
import { updateFallingBlocks } from "./physics.js";

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
  state.mouseSensitivity = Number.isFinite(nextSensitivity) ? nextSensitivity : 1;
  state.fov = Number.isFinite(nextFov) ? nextFov : camera.fov;
  state.debugHud = Boolean(settings?.debugHud ?? state.debugHud);
  camera.fov = state.fov;
  camera.updateProjectionMatrix();
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

pauseResumeBtn?.addEventListener("click", () => {
  closePauseMenu();
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
  spawnInitialMobs(player.position);
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
    if (state.targetedMob) {
      attackMob(state.targetedMob);
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
      const mob = spawnMob(spawnType, spawnPos);
      if (mob) {
        if (state.gamemode !== "creative") {
          selected.count -= 1;
          if (selected.count <= 0) {
            setSlot(selected, null, 0);
          }
          updateAllSlotsUI();
        }
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
  if (!state.manualTime) {
    const now = time * 0.001;
    const dt = Math.min(0.033, now - state.lastTime || 0.016);
    state.lastTime = now;
    if (benchState.enabled) {
      updateBenchScenario(dt);
    }
    const worldStart = performance.now();
    let uiMs = 0;
    if (state.mode === "playing") {
      advanceTime(dt);
      updateMobTarget(camera, state);
      const gameTimings = updateGame(dt);
      uiMs = gameTimings?.uiMs ?? 0;
      updateMobs(dt);
      updateFallingBlocks(dt); // Minecraft fizika: falling blocks
      updateItemEntities(dt, now, player, state.gamemode !== "spectator");
    }
    const worldMs = performance.now() - worldStart;
    const uiStart = performance.now();
    updateChatDisplay();
    uiMs += performance.now() - uiStart;
    const renderStart = performance.now();
    render();
    const renderMs = performance.now() - renderStart;
    setPerfTimings({ renderMs, worldMs, uiMs });
    recordFrameTime(dt);
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
    worldSize: { chunkSize: CHUNK_SIZE, height: WORLD_MAX_HEIGHT, viewRadius: CHUNK_RADIUS },
    seaLevel: SEA_LEVEL,
    seed: randomSeed,
    timeOfDay: Number(state.timeOfDay.toFixed(3)),
    hotbar: hotbar.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    inventory: inventory.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    crafting: craftSlots.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    craftingTable: tableCraftSlots.map((slot) => ({ id: slot.id, count: slot.count, durability: slot.durability })),
    droppedItems: itemEntities.slice(0, 30).map((entity) => ({
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
    perfBench: typeof window !== "undefined" ? window.__perfBench || null : null,
  };
  return JSON.stringify(payload);
};

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
