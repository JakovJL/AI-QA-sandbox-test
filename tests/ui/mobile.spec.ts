import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("ui-mobile");

test.use({ viewport: { width: 390, height: 844 } });

test("mobile home: no horizontal overflow, menu works", async ({ page }) => {
  await page.goto("/dk", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: join(artifactDir, "mobile-home.png"), fullPage: true });

  await page.locator("[data-testid=nav-menu-button]").click();
  await page.waitForTimeout(800);
  const storeLinkVisible = await page.locator("[data-testid=nav-store-link]").isVisible();
  await page.screenshot({ path: join(artifactDir, "mobile-home-menu.png") });

  saveJson(artifactDir, "mobile-home", { overflow, storeLinkVisible });
  expect(overflow, "horizontal overflow px").toBeLessThanOrEqual(1);
  expect(storeLinkVisible).toBe(true);
});

test("mobile store listing: products render without overflow", async ({ page }) => {
  await page.goto("/dk/store", { waitUntil: "load" });
  await page.waitForTimeout(3500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const products = await page.locator("[data-testid=product-wrapper]").count();
  await page.screenshot({ path: join(artifactDir, "mobile-store.png"), fullPage: true });

  saveJson(artifactDir, "mobile-store", { overflow, products });
  expect(overflow).toBeLessThanOrEqual(1);
  expect(products).toBeGreaterThan(0);
});

test("mobile product page: variant and add-to-cart visible", async ({ page }) => {
  await page.goto("/dk/products/sweatshirt", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const addButton = page.getByRole("button", { name: /Add to cart|Select variant/ }).first();
  await expect(addButton).toBeVisible();
  await page.screenshot({ path: join(artifactDir, "mobile-product.png"), fullPage: true });

  saveJson(artifactDir, "mobile-product", { overflow });
  expect(overflow).toBeLessThanOrEqual(1);
});
