const STORAGE_KEY = "blockland_keybinds_v1";

export const KEYBIND_ACTIONS = [
  { id: "forward", label: "Előre" },
  { id: "backward", label: "Hátra" },
  { id: "left", label: "Balra" },
  { id: "right", label: "Jobbra" },
  { id: "jump", label: "Ugrás" },
  { id: "sprint", label: "Sprint" },
  { id: "inventory", label: "Inventory" },
  { id: "chat", label: "Chat" },
  { id: "command", label: "Parancs (/)"},
  { id: "pause", label: "Játék menü" },
  { id: "fullscreen", label: "Fullscreen" },
  { id: "debug", label: "Debug HUD" },
  { id: "perf", label: "Perf overlay" },
];

const DEFAULT_KEYBINDS = {
  forward: "KeyW",
  backward: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  sprint: "ShiftLeft",
  inventory: "KeyE",
  chat: "KeyT",
  command: "Slash",
  pause: "Escape",
  fullscreen: "KeyF",
  debug: "F3",
  perf: "F4",
};

const ALIAS_KEYS = {
  forward: ["ArrowUp"],
  backward: ["ArrowDown"],
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  sprint: ["ShiftRight"],
  inventory: ["KeyI"],
};

let keybinds = { ...DEFAULT_KEYBINDS };

export const loadKeybinds = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return keybinds;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      keybinds = { ...DEFAULT_KEYBINDS, ...parsed };
    }
  } catch (err) {
    keybinds = { ...DEFAULT_KEYBINDS };
  }
  return keybinds;
};

export const saveKeybinds = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keybinds));
  } catch (err) {
    // ignore
  }
};

export const resetKeybinds = () => {
  keybinds = { ...DEFAULT_KEYBINDS };
  saveKeybinds();
  return keybinds;
};

export const getKeybind = (action) => keybinds[action] || DEFAULT_KEYBINDS[action];

export const setKeybind = (action, code) => {
  if (!action || !code) return;
  keybinds[action] = code;
  saveKeybinds();
};

export const isActionKey = (action, code) => {
  if (!action || !code) return false;
  if (getKeybind(action) === code) return true;
  const aliases = ALIAS_KEYS[action];
  if (aliases && aliases.includes(code)) return true;
  return false;
};

export const findActionByKey = (code) => {
  if (!code) return null;
  for (const action of Object.keys(DEFAULT_KEYBINDS)) {
    if (getKeybind(action) === code) return action;
  }
  return null;
};

const friendlyKeyMap = {
  Space: "Space",
  Escape: "Esc",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Slash: "/",
};

export const formatKey = (code) => {
  if (!code) return "-";
  if (friendlyKeyMap[code]) return friendlyKeyMap[code];
  if (code.startsWith("Key")) return code.replace("Key", "");
  if (code.startsWith("Digit")) return code.replace("Digit", "");
  return code;
};

export const getKeybindDisplay = (action) => {
  const primary = formatKey(getKeybind(action));
  const aliases = ALIAS_KEYS[action];
  if (!aliases || aliases.length === 0) return primary;
  const aliasText = aliases.map((alias) => formatKey(alias)).join(", ");
  return `${primary} (${aliasText})`;
};
