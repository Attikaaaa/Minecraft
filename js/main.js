import { camera, renderer, scene, THREE } from "./scene.js";
import {
  disablePointerLock,
  CHUNK_SIZE,
  CHUNK_RADIUS,
  SEA_LEVEL,
  WORLD_MAX_HEIGHT,
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
import { canvas, hud, menu, startBtn } from "./dom.js";
import { lockPointer, unlockPointer } from "./controls.js";
import { attackMob, spawnInitialMobs, spawnMob, updateMobTarget, updateMobs } from "./mobs.js";
import { itemDefs } from "./items.js";
import { getMobs } from "./mobs.js";
import { closeChat, isChatOpen, openChat, updateChatDisplay } from "./chat.js";
import { setTimeOfDay } from "./time.js";
import { advanceTime, initTime } from "./time.js";
import { recordFrameTime, setPerfTimings, startBenchmark, togglePerfOverlay, updatePerfOverlay } from "./perf.js";

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
  startAt: 0,
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
  benchState.startAt = performance.now();
  benchState.actionTimerMs = 0;
  benchState.actionPhase = 0;
  startBenchmark(BENCH_DURATION_MS, `scenario-${benchState.scenario}`, {
    scenario: benchState.scenario,
    seed: randomSeed,
  });
};

const updateBenchScenario = (dt) => {
  if (!benchState.started) return;
  const elapsedMs = performance.now() - benchState.startAt;
  if (elapsedMs >= BENCH_DURATION_MS) {
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
      setTimeout(() => {
        togglePerfOverlay();
      }, 50);
    }
  }

  if (benchState.enabled) {
    setTimeout(() => {
      prepareBenchStart();
      startBenchScenario();
    }, 200);
  }
};

const startGame = () => {
  initializeWorld();
  initTime();
  state.mode = "playing";
  if (menu) menu.classList.add("hidden");
  hud?.classList.remove("hidden");
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
  if (event.code === "KeyW" || event.code === "ArrowUp") input.forward = true;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.backward = true;
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = true;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = true;
  if (event.code === "Space") input.jump = true;
  if (event.code === "ShiftLeft") input.sprint = true;
  if (event.code === "ControlLeft" || event.code === "ControlRight") input.boost = true;
  if (event.code === "KeyF") toggleFullscreen();
  if (event.code === "F3") {
    state.debugHud = !state.debugHud;
    const shouldShow = state.debugHud && !state.inventoryOpen && !state.craftingTableOpen;
    const statusEl = document.getElementById("status");
    statusEl?.classList.toggle("hidden", !shouldShow);
  }
  if (event.code === "F4") {
    togglePerfOverlay();
  }

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
      unlockPointer();
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (isChatOpen()) return;
  if (event.code === "KeyW" || event.code === "ArrowUp") input.forward = false;
  if (event.code === "KeyS" || event.code === "ArrowDown") input.backward = false;
  if (event.code === "KeyA" || event.code === "ArrowLeft") input.left = false;
  if (event.code === "KeyD" || event.code === "ArrowRight") input.right = false;
  if (event.code === "Space") input.jump = false;
  if (event.code === "ShiftLeft") input.sprint = false;
  if (event.code === "ControlLeft" || event.code === "ControlRight") input.boost = false;
});

window.addEventListener("wheel", (event) => {
  if (isChatOpen()) return;
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
  const sensitivity = 0.002;
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
    }
    updateItemEntities(dt, now, player, state.mode === "playing" && state.gamemode !== "spectator");
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
      }
      updateItemEntities(step, state.lastTime + i * step, player, state.mode === "playing" && state.gamemode !== "spectator");
    }
    updateChatDisplay();
    render();
  };
}
