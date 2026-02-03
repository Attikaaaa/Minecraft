import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { buildLaunchOptions, contextOptions } from "./ci/playwright-config.mjs";

const rootDir = process.cwd();
const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve(rootDir, "reports", `multiplayer-${timestamp()}`);
fs.mkdirSync(reportDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startServer = () => {
  return new Promise((resolve, reject) => {
    const server = spawn("node", ["server.js"], {
      cwd: rootDir,
      env: { ...process.env, PORT: "8080" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;
    const onData = (data) => {
      const text = data.toString();
      fs.appendFileSync(path.join(reportDir, "server.log"), text);
      if (text.includes("Blockland 3D server running")) {
        ready = true;
        resolve(server);
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.on("exit", (code) => {
      if (!ready) {
        reject(new Error(`Server exited early (${code})`));
      }
    });
  });
};

const attachLogs = (page, label) => {
  const logFile = path.join(reportDir, `${label}-console.log`);
  page.on("console", (msg) => {
    const line = `[${msg.type()}] ${msg.text()}\n`;
    fs.appendFileSync(logFile, line);
  });
  page.on("pageerror", (err) => {
    fs.appendFileSync(logFile, `[pageerror] ${err?.message || err}\n`);
  });
};

const waitForGameReady = async (page) => {
  await page.waitForFunction(
    () => window.render_game_to_text && !document.getElementById("hud")?.classList.contains("hidden"),
    { timeout: 60000 }
  );
};

const openPauseMenu = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("pause-menu")?.classList.contains("hidden"));
};

const openMultiplayerMenu = async (page) => {
  await openPauseMenu(page);
  await page.click("#pause-mp-btn");
  await page.waitForFunction(() => !document.getElementById("multiplayer-menu")?.classList.contains("hidden"));
};

const closeMultiplayerMenu = async (page) => {
  await page.click("#mp-close-btn");
  await page.waitForFunction(() => document.getElementById("multiplayer-menu")?.classList.contains("hidden"));
};

const closePauseMenu = async (page) => {
  const isOpen = await page.evaluate(() => !document.getElementById("pause-menu")?.classList.contains("hidden"));
  if (isOpen) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("pause-menu")?.classList.contains("hidden"));
  }
};

const getState = async (page) => {
  const raw = await page.evaluate(() => window.render_game_to_text());
  return JSON.parse(raw);
};

const connectHost = async (page, name) => {
  await openMultiplayerMenu(page);
  await page.fill("#mp-name", name);
  await page.fill("#mp-server", "ws://localhost:8080");
  await page.fill("#mp-room", "");
  await page.click("#mp-host-btn");
  await page.waitForFunction(() => {
    const data = JSON.parse(window.render_game_to_text());
    return data?.multiplayer?.connected && data?.multiplayer?.isHost;
  }, { timeout: 30000 });
  await closeMultiplayerMenu(page);
  await closePauseMenu(page);
  return getState(page);
};

const connectClient = async (page, name, room) => {
  await openMultiplayerMenu(page);
  await page.fill("#mp-name", name);
  await page.fill("#mp-server", "ws://localhost:8080");
  await page.fill("#mp-room", room);
  await page.click("#mp-join-btn");
  await page.waitForFunction(() => {
    const data = JSON.parse(window.render_game_to_text());
    return data?.multiplayer?.connected && !data?.multiplayer?.isHost;
  }, { timeout: 30000 });
  await closeMultiplayerMenu(page);
  await closePauseMenu(page);
  return getState(page);
};

const readChatLines = async (page) => {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("#chat-messages .chat-line")).map((el) => el.textContent || "")
  );
};

const run = async () => {
  const server = await startServer();
  const browser = await chromium.launch(buildLaunchOptions({ headless: true }));
  const hostContext = await browser.newContext(contextOptions);
  const clientContext = await browser.newContext(contextOptions);
  const hostPage = await hostContext.newPage();
  const clientPage = await clientContext.newPage();

  attachLogs(hostPage, "host");
  attachLogs(clientPage, "client");

  const baseUrl = "http://localhost:8080/?test=1";
  await hostPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await clientPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

  await waitForGameReady(hostPage);
  await waitForGameReady(clientPage);

  await hostPage.click("canvas");
  await clientPage.click("canvas");

  const hostState = await connectHost(hostPage, "Host");
  const room = hostState.multiplayer.room;

  const clientState = await connectClient(clientPage, "Client", room);

  await sleep(800);

  // Player sync test: move host forward
  await hostPage.keyboard.down("KeyW");
  await sleep(600);
  await hostPage.keyboard.up("KeyW");
  await sleep(500);

  const hostStateAfterMove = await getState(hostPage);
  const clientStateAfterMove = await getState(clientPage);

  await hostPage.waitForFunction(() => {
    const data = JSON.parse(window.render_game_to_text());
    return data?.multiplayer?.players?.length > 0;
  }, { timeout: 5000 });

  // Block sync test (host -> client)
  const blockPos = {
    x: Math.floor(hostStateAfterMove.player.x + 2),
    y: Math.floor(hostStateAfterMove.player.y + 2),
    z: Math.floor(hostStateAfterMove.player.z),
  };
  await hostPage.evaluate((pos) => window.__test.setBlock(pos.x, pos.y, pos.z, 2), blockPos); // 2 = grass
  await clientPage.waitForFunction(
    (pos) => window.__test.getBlock(pos.x, pos.y, pos.z) === 2,
    blockPos,
    { timeout: 5000 }
  );
  const clientBlock = await clientPage.evaluate((pos) => window.__test.getBlock(pos.x, pos.y, pos.z), blockPos);

  // Block sync test (client -> host)
  const clientBlockPos = {
    x: Math.floor(clientStateAfterMove.player.x + 3),
    y: Math.floor(clientStateAfterMove.player.y + 2),
    z: Math.floor(clientStateAfterMove.player.z),
  };
  await clientPage.evaluate((pos) => window.__test.setBlock(pos.x, pos.y, pos.z, 3), clientBlockPos); // 3 = dirt
  await hostPage.waitForFunction(
    (pos) => window.__test.getBlock(pos.x, pos.y, pos.z) === 3,
    clientBlockPos,
    { timeout: 5000 }
  );
  const hostBlock = await hostPage.evaluate((pos) => window.__test.getBlock(pos.x, pos.y, pos.z), clientBlockPos);

  // Time sync test
  await hostPage.keyboard.press("KeyT");
  await hostPage.keyboard.type("/time set night");
  await hostPage.keyboard.press("Enter");
  await clientPage.waitForFunction(() => {
    const data = JSON.parse(window.render_game_to_text());
    return data?.timeOfDay > 0.6;
  }, { timeout: 5000 });
  const timeClient = await getState(clientPage);

  // Mob sync test
  await hostPage.keyboard.press("KeyT");
  await hostPage.keyboard.type("/summon cow");
  await hostPage.keyboard.press("Enter");
  await clientPage.waitForFunction(() => window.__test.listMobs().length > 0, { timeout: 5000 });
  const mobsClient = await clientPage.evaluate(() => window.__test.listMobs());

  // Item sync test (host spawn on client position)
  const clientPos = clientStateAfterMove.player;
  await hostPage.evaluate((pos) => window.__test.spawnItem("plank", 1, pos.x + 3, pos.y, pos.z), clientPos);
  await clientPage.waitForFunction(() => window.__test.listItems().length > 0, { timeout: 5000 });
  const itemsClient = await clientPage.evaluate(() => window.__test.listItems());
  const itemsHostBeforePickup = await hostPage.evaluate(() => window.__test.listItems());

  // Item pickup sync: teleport client onto the item
  if (itemsClient.length > 0) {
    const item = itemsClient[0];
    await clientPage.evaluate((it) => window.__test.teleport(it.x, it.y, it.z), item);
  }
  await sleep(1200);
  const itemsHostAfterPickup = await hostPage.evaluate(() => window.__test.listItems());

  // Chat sync test
  await clientPage.keyboard.press("KeyT");
  await clientPage.keyboard.type("hello from client");
  await clientPage.keyboard.press("Enter");
  await sleep(800);
  const hostChat = await readChatLines(hostPage);

  // Disconnect test
  await clientPage.close();
  await sleep(800);
  const hostAfterDisconnect = await getState(hostPage);

  const results = {
    room,
    hostId: hostState.multiplayer.clientId,
    clientId: clientState.multiplayer.clientId,
    playerSync: {
      hostMovedTo: hostStateAfterMove.player,
      clientSeesPlayers: clientStateAfterMove.multiplayer.players,
    },
    blockSync: {
      hostPlaced: { pos: blockPos, type: 2, clientSaw: clientBlock },
      clientPlaced: { pos: clientBlockPos, type: 3, hostSaw: hostBlock },
    },
    timeSync: { clientTime: timeClient.timeOfDay },
    mobSync: mobsClient,
    itemSync: {
      clientItemsAfterSpawn: itemsClient,
      hostItemsBeforePickup: itemsHostBeforePickup,
      hostItemsAfterPickup: itemsHostAfterPickup,
    },
    chatSync: hostChat,
    disconnect: hostAfterDisconnect.multiplayer.players,
  };

  fs.writeFileSync(path.join(reportDir, "results.json"), JSON.stringify(results, null, 2));
  await hostPage.screenshot({ path: path.join(reportDir, "host.png") });

  await hostContext.close();
  await clientContext.close();
  await browser.close();

  server.kill("SIGTERM");

  return results;
};

run()
  .then((results) => {
    console.log("Multiplayer test complete");
    console.log(JSON.stringify(results, null, 2));
  })
  .catch((err) => {
    console.error("Multiplayer test failed", err);
    process.exit(1);
  });
