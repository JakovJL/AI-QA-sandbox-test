import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { loadTargetEnv } from "../../lib/env";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("ui-admin");
const env = loadTargetEnv();

test.use({ viewport: { width: 1440, height: 900 } });

test("admin pages load without server errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedResponses: { status: number; url: string }[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto("/app", { waitUntil: "load" });
  await page.waitForTimeout(4000);

  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  if (await emailInput.count()) {
    await emailInput.fill(env.adminEmail);
    await page.locator('input[type="password"]').first().fill(env.adminPassword);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(6000);
  }

  const visited: Record<string, number> = {};
  for (const path of ["/app/orders", "/app/products", "/app/settings"]) {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    visited[path] = await page.locator("h1").count();
    await page.screenshot({
      path: join(artifactDir, `admin-${path.replace(/[^a-z]+/gi, "-")}.png`),
      fullPage: true,
    });
  }

  saveJson(artifactDir, "admin-evidence", { consoleErrors, failedResponses, visited });

  const serverErrors = failedResponses.filter((failure) => failure.status >= 500);
  expect(serverErrors, "admin 5xx responses").toEqual([]);
  expect(visited["/app/orders"], "orders page heading count").toBeGreaterThan(0);
});
