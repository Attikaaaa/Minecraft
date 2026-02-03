import { state } from "./state.js";
import { lockPointer, unlockPointer } from "./controls.js";
import { addItemToInventory, updateAllSlotsUI } from "./inventory.js";
import { blockTypeToItem, itemDefs } from "./items.js";
import { killPlayer, player, teleportPlayer } from "./player.js";
import { spawnMob, getMobDefs } from "./mobs.js";
import { THREE } from "./scene.js";
import { setTimeOfDay } from "./time.js";
import { network, sendAction, sendChat } from "./network.js";
import { clamp, randomSeed, WORLD_MAX_HEIGHT } from "./config.js";
import { blockDefs } from "./textures.js";
import { isWithinWorld, setBlock } from "./world.js";

const chatEl = document.getElementById("chat");
const chatMessagesEl = document.getElementById("chat-messages");
const chatInputRowEl = document.getElementById("chat-input-row");
const chatInputEl = document.getElementById("chat-input");
const chatSuggestionsEl = document.getElementById("chat-suggestions");

const MAX_MESSAGES = 50;
const FADE_AFTER = 10; // seconds

const messages = [];
const commands = new Map();
const history = [];
let historyIndex = -1;
let historyDraft = "";

const formatMessage = (msg) => {
  const line = document.createElement("div");
  line.className = `chat-line ${msg.type || "player"}`;
  line.textContent = msg.text;
  line.dataset.time = String(msg.time);
  msg.el = line;
  return line;
};

const renderMessages = () => {
  chatMessagesEl.innerHTML = "";
  const start = Math.max(0, messages.length - 10);
  for (let i = start; i < messages.length; i += 1) {
    chatMessagesEl.append(messages[i].el);
  }
};

const clearMessages = () => {
  messages.length = 0;
  renderMessages();
};

export const addChatMessage = (text, type = "player") => {
  const msg = { text, type, time: performance.now() / 1000, el: null };
  formatMessage(msg);
  messages.push(msg);
  while (messages.length > MAX_MESSAGES) messages.shift();
  renderMessages();
};

const resetHistoryNavigation = () => {
  historyIndex = -1;
  historyDraft = "";
};

const updateSuggestions = () => {
  if (!chatSuggestionsEl) return;
  if (!state.chatOpen) {
    chatSuggestionsEl.classList.add("hidden");
    chatSuggestionsEl.innerHTML = "";
    return;
  }
  const value = chatInputEl.value.trim();
  if (!value.startsWith("/")) {
    chatSuggestionsEl.classList.add("hidden");
    chatSuggestionsEl.innerHTML = "";
    return;
  }
  const cmdPart = value.slice(1).split(/\s+/)[0]?.toLowerCase();
  if (!cmdPart) {
    chatSuggestionsEl.classList.add("hidden");
    chatSuggestionsEl.innerHTML = "";
    return;
  }
  const matches = getCommandNames().filter((name) => name.startsWith(cmdPart));
  if (!matches.length) {
    chatSuggestionsEl.classList.add("hidden");
    chatSuggestionsEl.innerHTML = "";
    return;
  }
  chatSuggestionsEl.innerHTML = "";
  const max = 6;
  for (const name of matches.slice(0, max)) {
    const chip = document.createElement("div");
    chip.className = "chat-suggestion";
    chip.textContent = `/${name}`;
    chatSuggestionsEl.append(chip);
  }
  if (matches.length > max) {
    const more = document.createElement("div");
    more.className = "chat-suggestion";
    more.textContent = `+${matches.length - max}`;
    chatSuggestionsEl.append(more);
  }
  chatSuggestionsEl.classList.remove("hidden");
};

const setChatOpen = (open) => {
  state.chatOpen = open;
  if (open) {
    chatInputRowEl.classList.remove("hidden");
    chatInputEl.focus();
    unlockPointer();
    updateSuggestions();
  } else {
    chatInputRowEl.classList.add("hidden");
    chatInputEl.blur();
    if (chatSuggestionsEl) {
      chatSuggestionsEl.classList.add("hidden");
      chatSuggestionsEl.innerHTML = "";
    }
    if (state.mode === "playing") lockPointer();
  }
};

export const openChat = (prefill = "") => {
  setChatOpen(true);
  chatInputEl.value = prefill;
  chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
  resetHistoryNavigation();
  updateSuggestions();
};

export const closeChat = () => {
  setChatOpen(false);
  resetHistoryNavigation();
};

export const isChatOpen = () => state.chatOpen;

const registerCommand = (name, help, usage, handler) => {
  commands.set(name, { help, usage, handler });
};

const parseNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const clampSpeed = (value, min = 0.1, max = 10) => Math.max(min, Math.min(max, value));

const parseCoord = (value, base) => {
  if (value == null) return null;
  if (value.startsWith("~")) {
    const offsetText = value.slice(1);
    if (!offsetText) return base;
    const offset = parseNumber(offsetText);
    return offset == null ? null : base + offset;
  }
  return parseNumber(value);
};

const parseBlockCoord = (value, base) => {
  const coord = parseCoord(value, base);
  return coord == null ? null : Math.floor(coord);
};

const stripDiacritics = (value) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeKey = (value) =>
  stripDiacritics(value.trim().toLowerCase().replace(/^minecraft:/, "")).replace(/\s+/g, "_");

const blockNameMap = new Map();
Object.entries(blockDefs).forEach(([id, def]) => {
  const key = normalizeKey(def.name);
  blockNameMap.set(key, Number(id));
});

const resolveBlockType = (value) => {
  if (!value) return null;
  const key = normalizeKey(value);
  if (key === "air") return 0;
  if (/^-?\d+$/.test(key)) {
    const id = parseInt(key, 10);
    if (id === 0) return 0;
    return blockDefs[id] ? id : null;
  }
  if (itemDefs[key]?.blockType != null) return itemDefs[key].blockType;
  if (blockNameMap.has(key)) return blockNameMap.get(key);
  return null;
};

const resolveItemId = (value) => {
  if (!value) return null;
  const key = normalizeKey(value);
  if (itemDefs[key]) return key;
  if (/^-?\d+$/.test(key)) {
    const blockId = parseInt(key, 10);
    return blockTypeToItem[blockId] || null;
  }
  if (blockNameMap.has(key)) {
    const blockId = blockNameMap.get(key);
    return blockTypeToItem[blockId] || null;
  }
  return null;
};

const getCommandNames = () => [...commands.keys()].sort();

const runCommand = (raw) => {
  const trimmed = raw.slice(1).trim();
  if (!trimmed) return;
  const parts = trimmed.split(/\s+/);
  const name = parts.shift().toLowerCase();
  const command = commands.get(name);
  if (!command) {
    addChatMessage(`Ismeretlen parancs: /${name}`, "error");
    return;
  }
  try {
    command.handler(parts);
  } catch (err) {
    addChatMessage(`Hiba: ${err.message || err}`, "error");
  }
};

const showUsage = (usage) => {
  addChatMessage(`Használat: ${usage}`, "error");
};

registerCommand("help", "Lista a parancsokról", "/help [parancs]", (args) => {
  if (args.length > 0) {
    const name = normalizeKey(args[0]).replace(/^\//, "");
    const cmd = commands.get(name);
    if (!cmd) {
      addChatMessage(`Ismeretlen parancs: /${name}`, "error");
      return;
    }
    const usage = cmd.usage ? ` Használat: ${cmd.usage}` : "";
    addChatMessage(`/${name} — ${cmd.help}.${usage}`, "system");
    return;
  }
  const list = getCommandNames().map((cmd) => `/${cmd}`).join(", ");
  addChatMessage(`Parancsok: ${list}`, "system");
});

registerCommand("seed", "Világ seed kiírása", "/seed", () => {
  addChatMessage(`Seed: ${randomSeed}`, "system");
});

registerCommand("clear", "Chat törlése", "/clear", () => {
  clearMessages();
});

registerCommand("say", "Üzenet küldése a chatbe", "/say <szöveg>", (args) => {
  const text = args.join(" ");
  if (!text) {
    showUsage("/say <szöveg>");
    return;
  }
  const message = `[Server] ${text}`;
  addChatMessage(message, "system");
  if (network.connected) {
    sendChat({ text: message, kind: "system" });
  }
});

registerCommand("me", "Szerepjáték üzenet", "/me <szöveg>", (args) => {
  const text = args.join(" ");
  if (!text) {
    showUsage("/me <szöveg>");
    return;
  }
  const message = `${text}`;
  addChatMessage(`* Játékos ${text}`, "system");
  if (network.connected) {
    sendChat({ text: message, kind: "me" });
  }
});

registerCommand("give", "Item adása", "/give <item> [count]", (args) => {
  const id = resolveItemId(args[0]);
  if (!id) {
    addChatMessage("Nincs ilyen item.", "error");
    return;
  }
  const count = args[1] ? Math.max(1, parseInt(args[1], 10)) : 1;
  const remaining = addItemToInventory(id, count);
  updateAllSlotsUI();
  if (remaining > 0) {
    addChatMessage(`Nincs elég hely. Bent maradt: ${remaining}`, "error");
  } else {
    addChatMessage(`Adva: ${id} x${count}`, "system");
  }
});

registerCommand("tp", "Teleport", "/tp <x> <y> <z>", (args) => {
  const x = parseCoord(args[0], player.position.x);
  const y = parseCoord(args[1], player.position.y);
  const z = parseCoord(args[2], player.position.z);
  if (x == null || y == null || z == null) {
    showUsage("/tp <x> <y> <z>");
    return;
  }
  teleportPlayer(x, y, z);
  addChatMessage(`Teleported: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`, "system");
});

registerCommand("summon", "Mob idézés", "/summon <cow|pig|sheep|chicken> [x y z]", (args) => {
  const type = args[0];
  if (!type || !getMobDefs()[type]) {
    addChatMessage("Ismeretlen mob típus.", "error");
    return;
  }
  const x = args[1] ? parseCoord(args[1], player.position.x) : player.position.x + Math.sin(player.yaw) * 2;
  const y = args[2] ? parseCoord(args[2], player.position.y) : player.position.y;
  const z = args[3] ? parseCoord(args[3], player.position.z) : player.position.z + Math.cos(player.yaw) * 2;
  if (x == null || y == null || z == null) {
    showUsage("/summon <cow|pig|sheep|chicken> [x y z]");
    return;
  }
  if (network.connected && !network.isHost) {
    sendAction({ kind: "spawn_mob", type, position: { x, y, z } });
    addChatMessage(`Summon kérés elküldve: ${type}`, "system");
    return;
  }
  const spawnPos = new THREE.Vector3(x, y, z);
  spawnMob(type, spawnPos);
  addChatMessage(`Summon: ${type}`, "system");
});

registerCommand("time", "Idő beállítása", "/time set day|night", (args) => {
  if (args[0] !== "set" || !args[1]) {
    showUsage("/time set day|night");
    return;
  }
  const mode = args[1];
  let value = null;
  if (mode === "day") value = 0.25;
  if (mode === "night") value = 0.75;
  if (value == null) {
    showUsage("/time set day|night");
    return;
  }
  if (network.connected && !network.isHost) {
    sendAction({ kind: "set_time", value });
    addChatMessage(`Idő kérés elküldve: ${mode}`, "system");
    return;
  }
  setTimeOfDay(value);
  addChatMessage(`Idő beállítva: ${mode === "day" ? "nappal" : "éjszaka"}`, "system");
});

registerCommand("gamemode", "Játékmód váltás", "/gamemode <survival|creative|spectator>", (args) => {
  const modeRaw = args[0] ? normalizeKey(args[0]) : "";
  const mode =
    modeRaw === "3" || modeRaw === "spectator" || modeRaw === "sp" ? "spectator" :
    modeRaw === "1" || modeRaw === "creative" || modeRaw === "c" ? "creative" :
    "survival";
  const valid =
    modeRaw === "3" || modeRaw === "spectator" || modeRaw === "sp" ||
    modeRaw === "1" || modeRaw === "creative" || modeRaw === "c" ||
    modeRaw === "0" || modeRaw === "survival" || modeRaw === "s";
  if (!args[0] || !valid) {
    showUsage("/gamemode <survival|creative|spectator>");
    return;
  }
  state.gamemode = mode;
  addChatMessage(
    `Játékmód: ${mode === "creative" ? "Kreatív" : mode === "spectator" ? "Néző" : "Túlélő"}`,
    "system"
  );
});

registerCommand("speed", "Mozgás sebesség (survival)", "/speed <0.1..10>", (args) => {
  if (!args[0]) {
    addChatMessage(`Mozgás sebesség: ${state.movementSpeed.toFixed(2)}x`, "system");
    return;
  }
  const value = parseNumber(args[0]);
  if (value == null) {
    showUsage("/speed <0.1..10>");
    return;
  }
  state.movementSpeed = clampSpeed(value);
  addChatMessage(`Mozgás sebesség beállítva: ${state.movementSpeed.toFixed(2)}x`, "system");
});

registerCommand("flyspeed", "Repülés sebesség (creative/spectator)", "/flyspeed <0.1..10>", (args) => {
  if (!args[0]) {
    addChatMessage(`Fly sebesség: ${state.flySpeed.toFixed(2)}x`, "system");
    return;
  }
  const value = parseNumber(args[0]);
  if (value == null) {
    showUsage("/flyspeed <0.1..10>");
    return;
  }
  state.flySpeed = clampSpeed(value);
  addChatMessage(`Fly sebesség beállítva: ${state.flySpeed.toFixed(2)}x`, "system");
});

registerCommand("kill", "Azonnali halál", "/kill", () => {
  killPlayer();
});

registerCommand("spawnpoint", "Respawn pont beállítása", "/spawnpoint [x y z]", (args) => {
  if (args.length >= 3) {
    const x = parseCoord(args[0], player.position.x);
    const y = parseCoord(args[1], player.position.y);
    const z = parseCoord(args[2], player.position.z);
    if (x == null || y == null || z == null) {
      showUsage("/spawnpoint [x y z]");
      return;
    }
    const clampedY = Math.min(Math.max(1, y), WORLD_MAX_HEIGHT - 1);
    state.respawnPoint = { x, y: clampedY, z };
  } else {
    state.respawnPoint = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
    };
  }
  addChatMessage(
    `Respawn beállítva: ${state.respawnPoint.x.toFixed(2)}, ${state.respawnPoint.y.toFixed(2)}, ${state.respawnPoint.z.toFixed(2)}`,
    "system"
  );
});

registerCommand("setblock", "Blokk lerakása", "/setblock <x> <y> <z> <block>", (args) => {
  const x = parseBlockCoord(args[0], player.position.x);
  const y = parseBlockCoord(args[1], player.position.y);
  const z = parseBlockCoord(args[2], player.position.z);
  const blockType = resolveBlockType(args[3]);
  if (x == null || y == null || z == null || blockType == null) {
    showUsage("/setblock <x> <y> <z> <block>");
    return;
  }
  if (!isWithinWorld(x, y, z)) {
    addChatMessage("A koordináta a világon kívül esik.", "error");
    return;
  }
  setBlock(x, y, z, blockType);
  addChatMessage(`Blokk beállítva: ${x}, ${y}, ${z}`, "system");
});

registerCommand("fill", "Terület kitöltése", "/fill <x1> <y1> <z1> <x2> <y2> <z2> <block>", (args) => {
  const x1 = parseBlockCoord(args[0], player.position.x);
  const y1 = parseBlockCoord(args[1], player.position.y);
  const z1 = parseBlockCoord(args[2], player.position.z);
  const x2 = parseBlockCoord(args[3], player.position.x);
  const y2 = parseBlockCoord(args[4], player.position.y);
  const z2 = parseBlockCoord(args[5], player.position.z);
  const blockType = resolveBlockType(args[6]);
  if (x1 == null || y1 == null || z1 == null || x2 == null || y2 == null || z2 == null || blockType == null) {
    showUsage("/fill <x1> <y1> <z1> <x2> <y2> <z2> <block>");
    return;
  }
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);
  const volume = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
  const limit = 4096;
  if (volume > limit) {
    addChatMessage(`Túl nagy terület (${volume}). Limit: ${limit}.`, "error");
    return;
  }
  let placed = 0;
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (!isWithinWorld(x, y, z)) continue;
        setBlock(x, y, z, blockType);
        placed += 1;
      }
    }
  }
  addChatMessage(`Kitöltve: ${placed} blokk`, "system");
});

chatInputEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const text = chatInputEl.value.trim();
    if (text) {
      if (text.startsWith("/")) runCommand(text);
      else {
        addChatMessage(text, "player");
        if (network.connected) sendChat(text);
      }
      history.push(text);
      if (history.length > 50) history.shift();
      resetHistoryNavigation();
    }
    chatInputEl.value = "";
    updateSuggestions();
    closeChat();
    event.preventDefault();
  } else if (event.key === "Escape") {
    chatInputEl.value = "";
    updateSuggestions();
    closeChat();
    event.preventDefault();
  } else if (event.key === "ArrowUp") {
    if (history.length === 0) return;
    if (historyIndex === -1) {
      historyDraft = chatInputEl.value;
      historyIndex = history.length - 1;
    } else {
      historyIndex = Math.max(0, historyIndex - 1);
    }
    chatInputEl.value = history[historyIndex];
    chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
    updateSuggestions();
    event.preventDefault();
  } else if (event.key === "ArrowDown") {
    if (history.length === 0) return;
    if (historyIndex === -1) return;
    historyIndex += 1;
    if (historyIndex >= history.length) {
      historyIndex = -1;
      chatInputEl.value = historyDraft;
    } else {
      chatInputEl.value = history[historyIndex];
    }
    chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
    updateSuggestions();
    event.preventDefault();
  } else if (event.key === "Tab") {
    const value = chatInputEl.value;
    if (!value.startsWith("/")) return;
    const parts = value.slice(1).split(/\s+/);
    if (parts.length > 1) return;
    const prefix = parts[0].toLowerCase();
    const matches = getCommandNames().filter((name) => name.startsWith(prefix));
    if (!matches.length) {
      event.preventDefault();
      return;
    }
    if (matches.length === 1) {
      chatInputEl.value = `/${matches[0]}`;
      chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
      updateSuggestions();
      event.preventDefault();
      return;
    }
    const common = matches.reduce((acc, name) => {
      let i = 0;
      while (i < acc.length && i < name.length && acc[i] === name[i]) i += 1;
      return acc.slice(0, i);
    }, matches[0]);
    if (common.length > prefix.length) {
      chatInputEl.value = `/${common}`;
      chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
      updateSuggestions();
    } else {
      addChatMessage(`Lehetséges: ${matches.map((cmd) => `/${cmd}`).join(", ")}`, "system");
    }
    event.preventDefault();
  }
});

chatInputEl?.addEventListener("input", () => {
  updateSuggestions();
});

export const updateChatDisplay = () => {
  if (!chatMessagesEl) return;
  const now = performance.now() / 1000;
  const isOpen = state.chatOpen;
  for (const msg of messages) {
    if (!msg.el) continue;
    if (isOpen) {
      msg.el.style.opacity = "1";
      continue;
    }
    const age = now - msg.time;
    const alpha = clamp(1 - age / FADE_AFTER, 0, 1);
    msg.el.style.opacity = String(alpha);
  }
};

window.addEventListener("keydown", (event) => {
  if (state.chatOpen || state.inventoryOpen || state.craftingTableOpen) return;
  if (state.mode !== "playing") return;
  if (event.code === "KeyT") {
    openChat("");
    event.preventDefault();
  } else if (event.code === "Slash") {
    openChat("/");
    event.preventDefault();
  }
});
