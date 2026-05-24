import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.E2E_PORT ?? 5186);
const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = path.resolve("outputs/e2e/local");
const screenshotDir = path.join(outputDir, "screenshots");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROME_CHANNEL ?? "chrome", headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

await mkdir(screenshotDir, { recursive: true });

const server = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BROWSER: "none" },
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

let browser;
try {
  await waitForServer(baseUrl);
  browser = await launchBrowser();
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });

  const viewportResults = [];
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Mods need precedent/i }).waitFor();
    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    assert(noHorizontalOverflow, `Horizontal overflow at ${viewport.width}px`);
    const screenshot = path.join(screenshotDir, `home-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    viewportResults.push({ ...viewport, screenshot, noHorizontalOverflow });
    await page.close();
  }

  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const actionAudit = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a")).map((link) => ({
      text: link.textContent?.trim() ?? "",
      href: link.getAttribute("href") ?? "",
      targetExists: link.hash ? Boolean(document.querySelector(link.hash)) : true,
    }));
    const buttons = Array.from(document.querySelectorAll("button")).map((button) => ({
      text: button.textContent?.trim() ?? "",
      disabled: button.disabled,
      type: button.getAttribute("type") ?? "submit",
    }));
    return { links, buttons };
  });
  assert(actionAudit.links.every((link) => link.href && link.targetExists), "Every visible link must target a real section");
  assert(actionAudit.buttons.every((button) => button.text && !button.disabled), "Every visible button must be named and enabled");

  await page.getByRole("button", { name: /Heated reply in market crash thread/i }).click();
  await page.getByRole("heading", { name: /Heated reply in market crash thread/i }).waitFor();
  const beforeCount = await page.evaluate(() => JSON.parse(localStorage.getItem("mdm-decisions-v1") ?? "[]").length);

  await page.getByLabel("Decision summary").fill("");
  await page.getByRole("button", { name: /Save to memory/i }).click();
  await page.getByText(/summary must be 1-320 characters/i).waitFor();

  await page.getByLabel("Decision summary").fill("Removed because the reply made a direct accusation without evidence.");
  await page.getByLabel("Explanation template").fill("Removed for civility. Critique claims and sources, not other users.");
  await page.getByLabel("Match keywords").fill("civility accusation evidence");
  await page.getByRole("button", { name: /Save to memory/i }).click();
  await page.getByText(/Decision saved to local demo memory/i).waitFor();

  const afterCount = await page.evaluate(() => JSON.parse(localStorage.getItem("mdm-decisions-v1") ?? "[]").length);
  assert(afterCount === beforeCount + 1, `Expected local memory count to grow from ${beforeCount} to ${beforeCount + 1}`);

  await page.getByRole("button", { name: /Copy template/i }).first().click();
  await page.getByText(/Template copied to clipboard|Clipboard is unavailable/i).waitFor();

  const flowScreenshot = path.join(screenshotDir, "flow-after-save-1440.png");
  await page.screenshot({ path: flowScreenshot, fullPage: true });

  process.stdout.write(
    JSON.stringify(
      {
        status: "passed",
        baseUrl,
        viewportResults,
        actionAudit,
        memoryCount: { before: beforeCount, after: afterCount },
        screenshots: [...viewportResults.map((result) => result.screenshot), flowScreenshot],
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (process.env.E2E_DEBUG_SERVER_OUTPUT === "1") {
    console.error(serverOutput);
  }
}
