import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { buildLaunchOptions, contextOptions } from "./ci/playwright-config.mjs";

const args = process.argv.slice(2);
const argValue = (name) => {
  const entry = args.find((arg) => arg.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
};

const MODE_ARG = argValue("--mode");
const REPORT_DIR_ARG = argValue("--report-dir");
const NO_FALLBACK = args.includes("--no-fallback");

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const rootDir = process.cwd();
const reportDir = REPORT_DIR_ARG ? path.resolve(REPORT_DIR_ARG) : path.resolve(rootDir, "reports", `run-${timestamp()}`);

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

const startStaticServer = async (preferredPort = 5173) =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      const rawPath = decodeURIComponent(url.pathname);
      const safePath = path.normalize(path.join(rootDir, rawPath));
      if (!safePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      let filePath = safePath;
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(filePath).pipe(res);
    });

    const listen = (port) => {
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          listen(port + 1);
        } else {
          reject(err);
        }
      });
      server.listen(port, "127.0.0.1", () => {
        resolve({ server, port, url: `http://127.0.0.1:${port}` });
      });
    };

    listen(preferredPort);
  });

const buildUrl = (base, params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) search.set(key, String(value));
  });
  return `${base}?${search.toString()}`;
};

const createPageLogger = () => {
  const consoleMessages = [];
  const pageErrors = [];
  const attach = (page) => {
    page.on("console", (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      });
    });
    page.on("pageerror", (err) => {
      pageErrors.push({
        message: err?.message || String(err),
        stack: err?.stack || null,
      });
    });
  };
  return { consoleMessages, pageErrors, attach };
};

const collectWebglInfo = async (page) =>
  page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const gl2 = canvas.getContext("webgl2");
    const info = {
      webgl: Boolean(gl),
      webgl2: Boolean(gl2),
      webglVersion: gl ? gl.getParameter(gl.VERSION) : null,
      webgl2Version: gl2 ? gl2.getParameter(gl2.VERSION) : null,
      renderer: null,
      vendor: null,
      renderer2: null,
      vendor2: null,
    };
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        info.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        info.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
      }
    }
    if (gl2) {
      const ext2 = gl2.getExtension("WEBGL_debug_renderer_info");
      if (ext2) {
        info.renderer2 = gl2.getParameter(ext2.UNMASKED_RENDERER_WEBGL);
        info.vendor2 = gl2.getParameter(ext2.UNMASKED_VENDOR_WEBGL);
      }
    }
    window.__WEBGL_INFO = info;
    return info;
  });

const collectRuntimeDiagnostics = async (page) => {
  try {
    return await page.evaluate(() => ({
      rafTicks: window.__RAF_TICKS || 0,
      webglInfo: window.__WEBGL_INFO || null,
      webglContextInfo: window.__WEBGL_CONTEXT_INFO || null,
      rendererInitError: window.__RENDERER_INIT_ERROR || null,
      threeRevision: window.__THREE_REVISION || null,
      lastMeshUpload: window.__LAST_MESH_UPLOAD || null,
    }));
  } catch (err) {
    return { error: err?.message || String(err) };
  }
};

const findSlotCenters = async (page) =>
  page.evaluate(() => {
    const centerOf = (el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const inventorySlots = Array.from(document.querySelectorAll("#inventory-grid .slot"));
    const sourceEl = inventorySlots.find((slot) => {
      const icon = slot.querySelector(".item-icon");
      if (!icon) return false;
      const style = window.getComputedStyle(icon);
      return style.backgroundImage && style.backgroundImage !== "none";
    });
    const targetEl = document.querySelector("#inventory-hotbar .slot");
    return {
      source: sourceEl ? centerOf(sourceEl) : null,
      target: targetEl ? centerOf(targetEl) : null,
    };
  });

const runSmokeTests = async (page, screenshotDir) => {
  await page.waitForFunction(() => window.render_game_to_text && !document.getElementById("hud")?.classList.contains("hidden"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenshotDir, "hud.png") });

  await page.keyboard.press("KeyE");
  await page.waitForFunction(() => !document.getElementById("inventory")?.classList.contains("hidden"));

  const centers = await findSlotCenters(page);
  if (!centers.source || !centers.target) {
    throw new Error("Smoke test failed: could not find inventory slots for drag/drop.");
  }

  await page.mouse.move(centers.source.x, centers.source.y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(centers.target.x, centers.target.y);
  await page.mouse.up({ button: "left" });
  await sleep(150);

  await page.mouse.click(centers.target.x, centers.target.y, { button: "right" });
  await sleep(150);
  await page.screenshot({ path: path.join(screenshotDir, "inventory.png") });

  await page.keyboard.press("KeyE");
  await page.waitForFunction(() => document.getElementById("inventory")?.classList.contains("hidden"));

  await page.keyboard.press("KeyT");
  await page.waitForFunction(() => !document.getElementById("chat-input-row")?.classList.contains("hidden"));
  await page.keyboard.type("/time set night");
  await page.keyboard.press("Enter");
  await sleep(150);
  await page.keyboard.press("KeyT");
  await page.waitForFunction(() => !document.getElementById("chat-input-row")?.classList.contains("hidden"));
  await page.keyboard.type("/time set day");
  await page.keyboard.press("Enter");
  await sleep(150);
  await page.keyboard.press("KeyT");
  await page.waitForFunction(() => !document.getElementById("chat-input-row")?.classList.contains("hidden"));
  await page.screenshot({ path: path.join(screenshotDir, "chat.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("chat-input-row")?.classList.contains("hidden"));
};

const captureCraftingScreenshot = async (browser, baseUrl, screenshotDir) => {
  const page = await browser.newPage();
  await page.goto(
    buildUrl(baseUrl, { debug: 1, ui: "crafting", test: 1, nopointerlock: 1, realtime: 1 }),
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForFunction(() => !document.getElementById("crafting-table")?.classList.contains("hidden"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotDir, "crafting.png") });
  await page.close();
};

const waitForBenchResult = async (page, scenario) => {
  await page.waitForFunction(
    (sc) => window.__BENCH_RESULT && window.__BENCH_RESULT.scenario === sc,
    scenario,
    { timeout: 70000 },
  );
  return page.evaluate(() => window.__BENCH_RESULT);
};

const runBenchScenario = async (browser, baseUrl, scenario, benchDir) => {
  const page = await browser.newPage();
  await page.goto(
    buildUrl(baseUrl, { bench: 1, scenario, realtime: 1, nopointerlock: 1, seed: 1337 }),
    { waitUntil: "domcontentloaded" },
  );
  const payload = await waitForBenchResult(page, scenario);
  await page.close();
  const file = path.join(benchDir, `${scenario}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return payload;
};

const looksLikeWebglError = (error, logs = []) => {
  const message = `${error?.message || ""} ${error?.stack || ""}`;
  const patterns = [/WebGL/i, /byteLength/i, /context/i, /\bGL\b/i];
  if (patterns.some((regex) => regex.test(message))) return true;
  return logs.some((entry) => patterns.some((regex) => regex.test(entry.text || "")));
};

const writeFailureDiagnostics = async (reportDirLocal, error, logger, runtimeInfo) => {
  const payload = {
    error: {
      message: error?.message || String(error),
      stack: error?.stack || null,
    },
    console: logger.consoleMessages,
    pageErrors: logger.pageErrors,
    runtime: runtimeInfo || null,
  };
  const file = path.join(reportDirLocal, "fail-diagnostics.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
};

const writeSummary = async (reportDirLocal, data) => {
  const lines = [];
  lines.push("# CI Summary");
  lines.push("");
  lines.push("## Environment");
  lines.push(`- Node: ${process.version}`);
  lines.push(`- Platform: ${process.platform}`);
  lines.push(`- Browser: ${data.browserVersion || "unknown"}`);
  lines.push(`- Mode: ${data.headless ? "headless" : "headed"}`);
  lines.push(`- Base URL: ${data.baseUrl}`);
  lines.push("");
  lines.push("## Benchmarks");
  lines.push("| Scenario | Avg FPS | 1% Low FPS | P99 Frame (ms) | Worst Frame (ms) | Draw Calls | Triangles | Chunks |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  ["A", "B", "C"].forEach((scenario) => {
    const result = data.benchResults[scenario];
    if (!result) {
      lines.push(`| ${scenario} | n/a | n/a | n/a | n/a | n/a | n/a | n/a |`);
      return;
    }
    lines.push(
      `| ${scenario} | ${result.avgFps ?? "n/a"} | ${result.fps1Low ?? "n/a"} | ${result.p99FrameMs ?? "n/a"} | ${result.worstFrameMs ?? "n/a"} | ${result.drawCalls ?? "n/a"} | ${result.triangles ?? "n/a"} | ${result.loadedChunks ?? "n/a"} |`,
    );
  });
  lines.push("");
  lines.push("## Smoke Tests");
  lines.push(`- Status: ${data.smokeSuccess ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("## WebGL Info");
  lines.push("```json");
  lines.push(JSON.stringify(data.webglInfo || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Console Errors");
  if (!data.consoleErrors?.length && !data.pageErrors?.length) {
    lines.push("- none");
  } else {
    data.consoleErrors?.forEach((entry) => {
      lines.push(`- console.${entry.type}: ${entry.text}`);
    });
    data.pageErrors?.forEach((entry) => {
      lines.push(`- pageerror: ${entry.message}`);
    });
  }
  lines.push("");
  const file = path.join(reportDirLocal, "SUMMARY.md");
  fs.writeFileSync(file, lines.join("\n"));
};

const runOnce = async ({ headless, reportDirLocal }) => {
  ensureDir(reportDirLocal);
  const benchDir = path.join(reportDirLocal, "bench");
  const screenshotDir = path.join(reportDirLocal, "screenshots");
  const playwrightDir = path.join(reportDirLocal, "playwright");
  ensureDir(benchDir);
  ensureDir(screenshotDir);
  ensureDir(playwrightDir);

  const { server, url: baseUrl } = await startStaticServer();
  const logger = createPageLogger();
  let browser;
  let mainPage = null;
  let runtimeInfo = null;

  try {
    const launchOptions = buildLaunchOptions({
      headless,
      noSandbox: process.env.CI_NO_SANDBOX === "1",
    });
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext(contextOptions);
    await context.tracing.start({ screenshots: true, snapshots: true });

    mainPage = await context.newPage();
    logger.attach(mainPage);

    await mainPage.goto(buildUrl(baseUrl, { test: 1, nopointerlock: 1, realtime: 1 }), {
      waitUntil: "domcontentloaded",
    });
    await mainPage.waitForFunction(() => window.render_game_to_text);

    const webglInfo = await collectWebglInfo(mainPage);
    if (!webglInfo.webgl && !webglInfo.webgl2) {
      throw new Error(`WebGL init failed: ${JSON.stringify(webglInfo)}`);
    }

    let smokeSuccess = true;
    try {
      await runSmokeTests(mainPage, screenshotDir);
    } catch (err) {
      smokeSuccess = false;
      throw err;
    }

    await captureCraftingScreenshot(browser, baseUrl, screenshotDir);

    const benchResults = {};
    for (const scenario of ["A", "B", "C"]) {
      benchResults[scenario] = await runBenchScenario(browser, baseUrl, scenario, benchDir);
    }

    runtimeInfo = await collectRuntimeDiagnostics(mainPage);

    await context.tracing.stop({ path: path.join(playwrightDir, "trace.zip") });

    const browserVersion = browser.version();
    await browser.close();
    browser = null;

    await writeSummary(reportDirLocal, {
      baseUrl,
      headless,
      webglInfo,
      benchResults,
      smokeSuccess,
      browserVersion,
      consoleErrors: logger.consoleMessages,
      pageErrors: logger.pageErrors,
    });

    server.close();
    return { success: true, webglInfo, benchResults, smokeSuccess };
  } catch (err) {
    err.__consoleMessages = logger.consoleMessages;
    err.__pageErrors = logger.pageErrors;
    if (mainPage) {
      try {
        const failShot = path.join(reportDirLocal, "failure.png");
        await mainPage.screenshot({ path: failShot });
      } catch (shotErr) {
        // Ignore screenshot errors.
      }
      if (!runtimeInfo) {
        runtimeInfo = await collectRuntimeDiagnostics(mainPage);
      }
    }
    if (browser) {
      await browser.close();
    }
    await writeFailureDiagnostics(reportDirLocal, err, logger, runtimeInfo);
    server.close();
    throw err;
  }
};

const runWithFallback = async () => {
  const headless = MODE_ARG ? MODE_ARG === "headless" : true;
  try {
    return await runOnce({ headless, reportDirLocal: reportDir });
  } catch (err) {
    if (!headless || NO_FALLBACK) {
      throw err;
    }
    if (!looksLikeWebglError(err, err.__consoleMessages || [])) {
      throw err;
    }

    console.error("Headless WebGL failed, attempting headed fallback...");
    const argsForChild = [
      path.resolve(rootDir, "scripts", "run-ci.mjs"),
      "--mode=headed",
      `--report-dir=${reportDir}`,
      "--no-fallback",
    ];

    if (process.platform === "linux") {
      return new Promise((resolve, reject) => {
        const child = spawn("xvfb-run", ["-a", process.execPath, ...argsForChild], {
          stdio: "inherit",
        });
        child.on("exit", (code) => {
          if (code === 0) resolve({ fallback: true });
          else reject(new Error(`Fallback CI failed with exit code ${code}`));
        });
      });
    }

    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, argsForChild, { stdio: "inherit" });
      child.on("exit", (code) => {
        if (code === 0) resolve({ fallback: true });
        else reject(new Error(`Fallback CI failed with exit code ${code}`));
      });
    });
  }
};

runWithFallback()
  .then(() => {
    console.log(`CI run complete. Reports in ${reportDir}`);
  })
  .catch((err) => {
    console.error(err?.stack || err);
    process.exit(1);
  });
