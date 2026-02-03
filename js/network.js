import { defaultServerUrl } from "./config.js";

export const network = {
  ws: null,
  connected: false,
  connecting: false,
  isHost: false,
  clientId: null,
  room: null,
  seed: null,
  name: "Player",
  serverUrl: defaultServerUrl,
  onWelcome: null,
  onPlayerState: null,
  onBlockUpdate: null,
  onEntities: null,
  onChat: null,
  onPlayerDamage: null,
  onAction: null,
  onPlayerJoin: null,
  onPlayerLeave: null,
  onHostChange: null,
  onSnapshot: null,
  onDisconnect: null,
  onError: null,
};

const safeCall = (handler, payload) => {
  if (typeof handler === "function") handler(payload);
};

const emitError = (message) => {
  safeCall(network.onError, { message });
};

const send = (payload) => {
  if (!network.ws || network.ws.readyState !== WebSocket.OPEN) return false;
  network.ws.send(JSON.stringify(payload));
  return true;
};

export const connect = ({ url, room, name, isHost, seed }) => {
  if (network.connecting) return;
  if (network.ws) {
    try {
      network.ws.close();
    } catch (err) {
      // ignore
    }
  }
  network.connecting = true;
  network.connected = false;
  network.serverUrl = url || network.serverUrl;
  network.name = name || network.name;

  let ws;
  try {
    ws = new WebSocket(network.serverUrl);
  } catch (err) {
    network.connecting = false;
    emitError("Nem sikerült kapcsolódni a szerverhez.");
    return;
  }

  network.ws = ws;

  ws.addEventListener("open", () => {
    send({
      type: "hello",
      room: room || null,
      name: network.name,
      isHost: Boolean(isHost),
      seed: Number.isFinite(seed) ? seed : null,
    });
  });

  ws.addEventListener("message", (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (!payload || typeof payload.type !== "string") return;

    if (payload.type === "welcome") {
      network.connecting = false;
      network.connected = true;
      network.clientId = payload.clientId;
      network.room = payload.room;
      network.seed = payload.seed;
      network.isHost = Boolean(payload.isHost);
      safeCall(network.onWelcome, payload);
      return;
    }

    if (payload.type === "host_change") {
      network.isHost = payload.hostId === network.clientId;
      safeCall(network.onHostChange, payload);
      return;
    }

    if (payload.type === "player_join") {
      safeCall(network.onPlayerJoin, payload);
      return;
    }

    if (payload.type === "player_leave") {
      safeCall(network.onPlayerLeave, payload);
      return;
    }

    if (payload.type === "player_state") {
      safeCall(network.onPlayerState, payload);
      return;
    }

    if (payload.type === "block_update") {
      safeCall(network.onBlockUpdate, payload);
      return;
    }

    if (payload.type === "entities") {
      safeCall(network.onEntities, payload);
      return;
    }

    if (payload.type === "chat") {
      safeCall(network.onChat, payload);
      return;
    }

    if (payload.type === "player_damage") {
      safeCall(network.onPlayerDamage, payload);
      return;
    }

    if (payload.type === "snapshot") {
      safeCall(network.onSnapshot, payload.snapshot ?? null);
      return;
    }

    if (payload.type === "action") {
      safeCall(network.onAction, payload);
      return;
    }
  });

  ws.addEventListener("close", () => {
    network.connected = false;
    network.connecting = false;
    const wasConnected = Boolean(network.clientId);
    network.clientId = null;
    safeCall(network.onDisconnect, { wasConnected });
  });

  ws.addEventListener("error", () => {
    emitError("Hálózati hiba a WebSocket kapcsolaton.");
  });
};

export const disconnect = () => {
  if (network.ws) {
    try {
      network.ws.close();
    } catch (err) {
      // ignore
    }
  }
  network.connected = false;
  network.connecting = false;
  network.clientId = null;
  network.room = null;
  network.seed = null;
  network.isHost = false;
};

export const sendPlayerState = (state) => {
  if (!network.connected) return;
  send({ type: "player_state", ...state });
};

export const sendBlockUpdates = (updates) => {
  if (!network.connected) return;
  send({ type: "block_update", updates });
};

export const sendEntities = (payload) => {
  if (!network.connected || !network.isHost) return;
  send({ type: "entities", ...payload });
};

export const sendPlayerData = (payload) => {
  if (!network.connected) return;
  send({ type: "player_data", ...payload });
};

export const sendPlayerDamage = (targetId, amount = 1) => {
  if (!network.connected) return;
  send({ type: "player_damage", targetId, amount });
};

export const sendChat = (payload) => {
  if (!network.connected) return;
  if (typeof payload === "string") {
    send({ type: "chat", text: payload });
    return;
  }
  if (payload && typeof payload.text === "string") {
    send({ type: "chat", text: payload.text, kind: payload.kind || null });
  }
};

export const sendAction = (action) => {
  if (!network.connected) return;
  send({ type: "action", action });
};

export const requestSnapshot = () => {
  if (!network.connected) return;
  send({ type: "request_snapshot" });
};

export const setNetworkHandlers = (handlers = {}) => {
  network.onWelcome = handlers.onWelcome || network.onWelcome;
  network.onPlayerState = handlers.onPlayerState || network.onPlayerState;
  network.onBlockUpdate = handlers.onBlockUpdate || network.onBlockUpdate;
  network.onEntities = handlers.onEntities || network.onEntities;
  network.onChat = handlers.onChat || network.onChat;
  network.onPlayerDamage = handlers.onPlayerDamage || network.onPlayerDamage;
  network.onPlayerJoin = handlers.onPlayerJoin || network.onPlayerJoin;
  network.onPlayerLeave = handlers.onPlayerLeave || network.onPlayerLeave;
  network.onHostChange = handlers.onHostChange || network.onHostChange;
  network.onSnapshot = handlers.onSnapshot || network.onSnapshot;
  network.onDisconnect = handlers.onDisconnect || network.onDisconnect;
  network.onError = handlers.onError || network.onError;
  network.onAction = handlers.onAction || network.onAction;
};
