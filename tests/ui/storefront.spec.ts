import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { ApiClient, parseJson } from "../../lib/api";
import { loadTargetEnv } from "../../lib/env";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("ui-storefront");
const client = new ApiClient();
const env = loadTargetEnv();

test("UI-1: /dk/store loads without console errors and without localhost requests", async ({ page }) => {
  const consoleErrors: string[] = [];
  const localhostRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("127.0.0.1") || url.includes("localhost")) localhostRequests.push(url);
  });

  const response = await page.goto("/dk/store", { waitUntil: "load" });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(artifactDir, "ui-1-store.png"), fullPage: true });

  saveJson(artifactDir, "ui-1-evidence", {
    status: response?.status(),
    consoleErrors,
    localhostRequests,
    productCount: await page.locator("[data-testid=product-wrapper]").count(),
  });

  expect(localhostRequests, "no requests to localhost from the storefront page").toEqual([]);
  expect(consoleErrors, "no console errors on /dk/store").toEqual([]);
});

test("UI-2: fake order confirmation returns proper 404", async ({ page }) => {
  const response = await page.goto("/dk/order/order_fake_123/confirmed", { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const title = await page.title();
  const body = await page.locator("body").innerText();
  await page.screenshot({ path: join(artifactDir, "ui-2-order-fake.png"), fullPage: true });

  saveJson(artifactDir, "ui-2-evidence", {
    status: response?.status(),
    title,
    showsPageNotFound: body.includes("Page not found"),
  });

  expect(response?.status(), "HTTP status for nonexistent order page").toBe(404);
});

test("UI-3: category page title is not duplicated", async ({ page }) => {
  await page.goto("/dk/categories/shirts", { waitUntil: "load" });
  const title = await page.title();
  saveJson(artifactDir, "ui-3-evidence", { title });
  expect(title, "category page title").toBe("Shirts | Medusa Store");
});

test("UI-4: cart quantity select has no duplicate option", async ({ page, context }) => {
  const regions = parseJson<{ regions: { id: string }[] }>(await client.store("/store/regions")).regions;
  const products = parseJson<{ products: { id: string; handle: string; variants: { id: string }[] }[] }>(
    await client.store("/store/products?limit=100&fields=id,handle,*variants.id"),
  ).products;
  const sweatshirt = products.find((product) => product.handle === "sweatshirt");
  if (!sweatshirt) throw new Error("Sweatshirt not found");

  const cartResponse = await client.storeRequest("POST", "/store/carts", { region_id: regions[0].id });
  const cart = parseJson<{ cart: { id: string } }>(cartResponse).cart;
  const lineResponse = await client.storeRequest("POST", `/store/carts/${cart.id}/line-items`, {
    variant_id: sweatshirt.variants[0].id,
    quantity: 1,
  });
  expect(lineResponse.status).toBe(200);

  await context.addCookies([
    { name: "_medusa_cart_id", value: cart.id, domain: env.targetHost, path: "/" },
  ]);

  await page.goto("/dk/cart", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(artifactDir, "ui-4-cart.png"), fullPage: true });

  const select = page.locator("select").first();
  const optionCount = await select.locator("option").count();
  const optionTexts = await select
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.textContent?.trim() ?? ""));

  saveJson(artifactDir, "ui-4-evidence", { cartId: cart.id, optionCount, optionTexts });

  expect(optionCount, "quantity options count").toBeGreaterThan(0);
  expect(new Set(optionTexts).size, `duplicate options in cart select: ${JSON.stringify(optionTexts)}`).toBe(
    optionTexts.length,
  );
});

test("UI-5: home page observation (hero only, no collections)", async ({ page }) => {
  await page.goto("/dk", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const imageCount = await page.locator("img").count();
  const bodyText = await page.locator("body").innerText();
  await page.screenshot({ path: join(artifactDir, "ui-5-home.png"), fullPage: true });

  saveJson(artifactDir, "ui-5-observation", {
    imageCount,
    hasHero: bodyText.includes("Ecommerce Starter Template"),
    hasEmptyState: /nothing|no products|empty/i.test(bodyText),
  });
  expect(bodyText).toContain("Ecommerce Starter Template");
});

test("UI-6: Customer Service link leads to an existing page", async ({ page }) => {
  await page.goto("/dk/account", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const link = page.getByRole("link", { name: "Customer Service" }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const response = await page.goto(href ?? "/customer-service", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(artifactDir, "ui-6-customer-service.png"), fullPage: true });

  saveJson(artifactDir, "ui-6-evidence", { href, status: response?.status(), title: await page.title() });
  expect(response?.status(), `Customer Service link ${href} must not be 404`).not.toBe(404);
});
