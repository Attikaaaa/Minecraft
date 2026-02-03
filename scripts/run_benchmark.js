import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith("--mode=")) || "--mode=worker";
const baseUrlArg = args.find((arg) => arg.startsWith("--url=")) || "--url=http://localhost:5173";
const mode = modeArg.split("=")[1];
const baseUrl = baseUrlArg.split("=")[1];

const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));
const scenarios = scenarioArg
  ? scenarioArg
      .split("=")[1]
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s)
  : ["A", "B", "C"];
const outputDir = path.resolve("output", "perf");

const buildUrl = (scenario) => {
  const params = new URLSearchParams();
  params.set("bench", "1");
  params.set("scenario", scenario);
  params.set("realtime", "1");
  params.set("nopointerlock", "1");
  params.set("seed", "1337");
  if (mode === "main") {
    params.set("mesher", "main");
  }
  return `${baseUrl}?${params.toString()}`;
};

const waitForBench = async (page, scenario) => {
  const start = Date.now();
  const timeoutMs = 60000;
  while (Date.now() - start < timeoutMs) {
    const payload = await page.evaluate(() => window.__perfBench || null);
    if (payload && payload.scenario === scenario) return payload;
    await page.waitForTimeout(500);
  }
  return null;
};

const runScenario = async (browser, scenario) => {
  const page = await browser.newPage();
  await page.goto(buildUrl(scenario), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const payload = await waitForBench(page, scenario);
  await page.close();
  return payload;
};

const main = async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const results = [];
  for (const scenario of scenarios) {
    const payload = await runScenario(browser, scenario);
    if (payload) {
      const file = path.join(outputDir, `bench-${mode}-${scenario}.json`);
      fs.writeFileSync(file, JSON.stringify(payload, null, 2));
      results.push({ scenario, file });
      console.log(`Saved ${file}`);
    } else {
      console.warn(`No bench payload for scenario ${scenario}`);
    }
  }
  await browser.close();
  return results;
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
