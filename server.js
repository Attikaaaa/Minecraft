import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(process.cwd());

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const safeJoin = (base, target) => {
  const targetPath = path.resolve(base, target.replace(/^\/+/, ""));
  if (!targetPath.startsWith(base)) return null;
  return targetPath;
};

const serveFile = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = safeJoin(ROOT, pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
};

const server = http.createServer(serveFile);
const wss = new WebSocketServer({ server });

let nextClientId = 1;
const rooms = new Map();
const SAVE_DIR = path.join(ROOT, "saves");
fs.mkdirSync(SAVE_DIR, { recursive: true });

const roomFile = (code) => path.join(SAVE_DIR, `${code}.json`);

const serializeRoom = (room) => ({
  code: room.code,
  seed: room.seed,
  timeOfDay: room.timeOfDay ?? null,
  blocks: serializeBlocks(room),
  mobs: room.mobs ?? [],
  items: room.items ?? [],
  playersByName: room.playersByName ? Object.fromEntries(room.playersByName) : {},
});

const saveRoom = (room) => {
  try {
    const payload = serializeRoom(room);
    fs.writeFileSync(roomFile(room.code), JSON.stringify(payload));
  } catch (err) {
    console.error("Failed to save room", room.code, err);
  }
};

const loadRoom = (code) => {
  try {
    const filePath = roomFile(code);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load room", code, err);
    return null;
  }
};

const scheduleSave = (room) => {
  room.saveDirty = true;
  if (room.saveTimer) return;
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    if (!room.saveDirty) return;
    room.saveDirty = false;
    saveRoom(room);
  }, 1500);
};

const makeRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const getRoom = (code) => rooms.get(code);

const send = (ws, payload) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
};

const broadcast = (room, payload, exceptId = null) => {
  for (const [id, client] of room.clients.entries()) {
    if (exceptId && id === exceptId) continue;
    send(client.ws, payload);
  }
};

const serializeBlocks = (room) => {
  const blocks = [];
  for (const [key, entry] of room.blocks.entries()) {
    blocks.push({ key, ...entry });
  }
  return blocks;
};

const roomSnapshot = (room) => ({
  seed: room.seed,
  hostId: room.hostId,
  blocks: serializeBlocks(room),
  timeOfDay: room.timeOfDay ?? null,
  mobs: room.mobs ?? [],
  items: room.items ?? [],
  players: Array.from(room.clients.values())
    .map((client) => client.lastState)
    .filter(Boolean),
});

const ensureRoom = (code, seed) => {
  const existing = rooms.get(code);
  if (existing) return existing;
  const saved = loadRoom(code);
  const room = {
    code,
    seed: saved?.seed ?? seed,
    hostId: null,
    clients: new Map(),
    blocks: new Map(),
    timeOfDay: saved?.timeOfDay ?? null,
    mobs: saved?.mobs ?? [],
    items: saved?.items ?? [],
    playersByName: new Map(Object.entries(saved?.playersByName || {})),
    saveTimer: null,
    saveDirty: false,
  };
  if (Array.isArray(saved?.blocks)) {
    for (const entry of saved.blocks) {
      if (!entry || typeof entry.key !== "string") continue;
      room.blocks.set(entry.key, {
        type: entry.type ?? 0,
        waterLevel: entry.waterLevel ?? null,
        torchOrientation: entry.torchOrientation ?? null,
      });
    }
  }
  rooms.set(code, room);
  return room;
};

const setHost = (room, clientId) => {
  room.hostId = clientId;
  broadcast(room, { type: "host_change", hostId: clientId });
};

const removeClient = (room, clientId) => {
  const client = room.clients.get(clientId);
  room.clients.delete(clientId);
  broadcast(room, { type: "player_leave", id: clientId, name: client?.name || null });
  scheduleSave(room);
  if (room.hostId === clientId) {
    const next = room.clients.keys().next();
    if (!next.done) {
      setHost(room, next.value);
    } else {
      saveRoom(room);
      rooms.delete(room.code);
    }
  }
};

wss.on("connection", (ws) => {
  const clientId = String(nextClientId++);
  let room = null;

  ws.on("message", (data) => {
    let message = null;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      return;
    }
    if (!message || typeof message.type !== "string") return;

    if (message.type === "hello") {
      const desiredRoom = typeof message.room === "string" && message.room.trim()
        ? message.room.trim().toUpperCase()
        : makeRoomCode();
      const seed = Number.isFinite(Number(message.seed)) ? Number(message.seed) : Math.floor(Math.random() * 1_000_000_000);
      const isHost = Boolean(message.isHost);
      const name = (message.name || "Player").toString().slice(0, 24);

      room = ensureRoom(desiredRoom, seed);
      if (room.seed == null) room.seed = seed;
      if (!room.hostId || !room.clients.has(room.hostId)) {
        if (isHost || room.clients.size === 0) {
          room.seed = seed;
          setHost(room, clientId);
        }
      }

      room.clients.set(clientId, {
        id: clientId,
        ws,
        name,
        lastState: null,
        lastData: null,
      });

      const savedPlayerData = room.playersByName?.get(name) || null;
      const snapshot = roomSnapshot(room);
      send(ws, {
        type: "welcome",
        clientId,
        room: room.code,
        seed: room.seed,
        hostId: room.hostId,
        isHost: room.hostId === clientId,
        snapshot,
        playerData: savedPlayerData,
      });

      broadcast(room, { type: "player_join", id: clientId, name }, clientId);
      return;
    }

    if (!room) return;

    if (message.type === "player_state") {
      const client = room.clients.get(clientId);
      if (!client) return;
      const state = {
        id: clientId,
        name: client.name,
        x: Number(message.x) || 0,
        y: Number(message.y) || 0,
        z: Number(message.z) || 0,
        yaw: Number(message.yaw) || 0,
        pitch: Number(message.pitch) || 0,
        vx: Number(message.vx) || 0,
        vy: Number(message.vy) || 0,
        vz: Number(message.vz) || 0,
        heldItem: message.heldItem ?? null,
        gamemode: message.gamemode || "survival",
        health: Number(message.health) || 0,
        hunger: Number(message.hunger) || 0,
        ts: Date.now(),
      };
      client.lastState = state;
      broadcast(room, { type: "player_state", ...state }, clientId);
      return;
    }

    if (message.type === "block_update") {
      const updates = Array.isArray(message.updates) ? message.updates : [];
      if (room.hostId && room.hostId !== clientId) {
        const host = room.clients.get(room.hostId);
        if (host) {
          send(host.ws, { type: "action", from: clientId, action: { kind: "block_update", updates } });
        }
        return;
      }
      for (const update of updates) {
        if (!update || typeof update.key !== "string") continue;
        room.blocks.set(update.key, {
          type: update.type ?? 0,
          waterLevel: update.waterLevel ?? null,
          torchOrientation: update.torchOrientation ?? null,
        });
      }
      scheduleSave(room);
      broadcast(room, { type: "block_update", updates, sourceId: clientId }, clientId);
      return;
    }

    if (message.type === "entities") {
      if (room.hostId !== clientId) return;
      if (Number.isFinite(message.timeOfDay)) room.timeOfDay = message.timeOfDay;
      if (Array.isArray(message.mobs)) room.mobs = message.mobs;
      if (Array.isArray(message.items)) room.items = message.items;
      scheduleSave(room);
      broadcast(room, { type: "entities", timeOfDay: room.timeOfDay, mobs: room.mobs, items: room.items }, clientId);
      return;
    }

    if (message.type === "chat") {
      const text = (message.text || "").toString().slice(0, 200);
      if (!text) return;
      const kind = typeof message.kind === "string" ? message.kind : null;
      broadcast(room, {
        type: "chat",
        id: clientId,
        name: room.clients.get(clientId)?.name || "Player",
        text,
        kind,
      });
      return;
    }

    if (message.type === "action") {
      if (!room.hostId) return;
      const host = room.clients.get(room.hostId);
      if (!host) return;
      send(host.ws, { type: "action", from: clientId, action: message.action || {} });
      return;
    }

    if (message.type === "player_data") {
      const client = room.clients.get(clientId);
      if (!client) return;
      const data = {
        hotbar: Array.isArray(message.hotbar) ? message.hotbar : null,
        inventory: Array.isArray(message.inventory) ? message.inventory : null,
        health: Number.isFinite(message.health) ? message.health : null,
        hunger: Number.isFinite(message.hunger) ? message.hunger : null,
        gamemode: message.gamemode || null,
        respawnPoint: message.respawnPoint || null,
      };
      client.lastData = data;
      if (room.playersByName && client.name) {
        room.playersByName.set(client.name, data);
        scheduleSave(room);
      }
      return;
    }

    if (message.type === "player_damage") {
      if (room.hostId !== clientId) return;
      const targetId = message.targetId ? String(message.targetId) : null;
      const amount = Number.isFinite(message.amount) ? message.amount : 1;
      if (!targetId || amount <= 0) return;
      const target = room.clients.get(targetId);
      if (!target) return;

      let updatedHealth = null;
      if (room.playersByName && target.name) {
        const data = room.playersByName.get(target.name) || {};
        const currentHealth = Number.isFinite(data.health) ? data.health : 20;
        updatedHealth = Math.max(0, currentHealth - amount);
        room.playersByName.set(target.name, { ...data, health: updatedHealth });
        scheduleSave(room);
      }

      send(target.ws, {
        type: "player_damage",
        amount,
        health: updatedHealth,
        from: clientId,
      });
      return;
    }
  });

  ws.on("close", () => {
    if (!room) return;
    removeClient(room, clientId);
  });
});

server.listen(PORT, HOST, () => {
  const actualPort = server.address().port;
  console.log(`Blockland 3D server running at http://localhost:${actualPort}`);
  if (HOST === "0.0.0.0") {
    console.log(`LAN: http://<szerver-ip>:${actualPort}`);
  } else {
    console.log(`Listening on http://${HOST}:${actualPort}`);
  }
});
