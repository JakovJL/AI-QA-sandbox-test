import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ApiClient, parseJson } from "../../lib/api";
import { loadTargetEnv } from "../../lib/env";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("nfr-a11y");
const client = new ApiClient();
const env = loadTargetEnv();

interface AxeFinding {
  id: string;
  impact: string | null | undefined;
  help: string;
  nodes: number;
  targets: unknown[];
}

async function scan(page: Page, label: string): Promise<AxeFinding[]> {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.length,
    targets: violation.nodes.slice(0, 5).map((node) => node.target),
  }));
  saveJson(artifactDir, `axe-${label}`, { url: page.url(), violations });
  return violations;
}

function blockers(violations: AxeFinding[]): AxeFinding[] {
  return violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
}

let cartId = "";

test.beforeAll(async () => {
  const regions = parseJson<{ regions: { id: string }[] }>(await client.store("/store/regions")).regions;
  const products = parseJson<{ products: { handle: string; variants: { id: string }[] }[] }>(
    await client.store("/store/products?limit=10&fields=handle,*variants.id"),
  ).products;
  const sweatshirt = products.find((product) => product.handle === "sweatshirt");
  if (!sweatshirt) throw new Error("sweatshirt not found");

  const cart = parseJson<{ cart: { id: string } }>(
    await client.storeRequest("POST", "/store/carts", { region_id: regions[0].id }),
  ).cart;
  cartId = cart.id;
  await client.storeRequest("POST", `/store/carts/${cartId}/line-items`, {
    variant_id: sweatshirt.variants[0].id,
    quantity: 1,
  });
});

test("NFR-A11Y-1: storefront content pages have no critical/serious axe violations", async ({ page }) => {
  const pages = ["/dk", "/dk/store", "/dk/products/sweatshirt", "/dk/account"];
  const results: { path: string; blockers: AxeFinding[] }[] = [];
  for (const path of pages) {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const found = await scan(page, path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""));
    results.push({ path, blockers: blockers(found) });
  }
  saveJson(artifactDir, "storefront-summary", results);
  const all = results.flatMap((result) => result.blockers.map((blocker) => ({ path: result.path, ...blocker })));
  expect(all, `storefront blockers: ${JSON.stringify(all)}`).toEqual([]);
});

test("NFR-A11Y-2: cart page has no critical/serious axe violations", async ({ page, context }) => {
  await context.addCookies([{ name: "_medusa_cart_id", value: cartId, domain: env.targetHost, path: "/" }]);
  await page.goto("/dk/cart", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const found = await scan(page, "cart");
  expect(blockers(found), `cart blockers: ${JSON.stringify(blockers(found))}`).toEqual([]);
});

test("NFR-A11Y-3: admin login page has no critical/serious axe violations", async ({ page }) => {
  await page.goto("/app", { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const found = await scan(page, "admin-login");
  expect(blockers(found), `admin login blockers: ${JSON.stringify(blockers(found))}`).toEqual([]);
});

test("NFR-A11Y-4: admin content pages have no critical/serious axe violations", async ({ page }) => {
  await page.goto("/app", { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  if (await emailInput.count()) {
    await emailInput.fill(env.adminEmail);
    await page.locator('input[type="password"]').first().fill(env.adminPassword);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(6000);
  }
  const adminResults: { path: string; blockers: AxeFinding[] }[] = [];
  for (const path of ["/app/orders", "/app/products", "/app/settings", "/app/inventory"]) {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    adminResults.push({ path, blockers: blockers(await scan(page, path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""))) });
  }
  saveJson(artifactDir, "admin-summary", adminResults);
  const all = adminResults.flatMap((result) => result.blockers.map((blocker) => ({ path: result.path, ...blocker })));
  expect(all, `admin blockers: ${JSON.stringify(all)}`).toEqual([]);
});

test("NFR-A11Y-5: category and 404 pages have no critical/serious axe violations", async ({ page }) => {
  const results: { path: string; blockers: AxeFinding[] }[] = [];
  for (const path of ["/dk/categories/shirts", "/dk/nonexistent-route-xyz"]) {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    results.push({ path, blockers: blockers(await scan(page, path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""))) });
  }
  saveJson(artifactDir, "secondary-summary", results);
  const all = results.flatMap((result) => result.blockers.map((blocker) => ({ path: result.path, ...blocker })));
  expect(all, `secondary pages blockers: ${JSON.stringify(all)}`).toEqual([]);
});

test("NFR-A11Y-6: checkout address step has no critical/serious axe violations", async ({ page, context }) => {
  await context.addCookies([{ name: "_medusa_cart_id", value: cartId, domain: env.targetHost, path: "/" }]);
  const results: { path: string; blockers: AxeFinding[]; notes?: string }[] = [];

  await page.goto("/dk/checkout?step=address", { waitUntil: "load" });
  await page.waitForTimeout(4000);
  results.push({ path: "checkout-address", blockers: blockers(await scan(page, "checkout-address")) });

  const fill = async (selector: string, value: string) => {
    const locator = page.locator(selector).first();
    if (await locator.count()) await locator.fill(value).catch(() => undefined);
  };
  await fill('input[name="email"]', "qa-nfr-scan@example.com");
  await fill('input[name="shipping_address.first_name"]', "QA");
  await fill('input[name="shipping_address.last_name"]', "Scanner");
  await fill('input[name="shipping_address.address_1"]', "Testvej 1");
  await fill('input[name="shipping_address.city"]', "Copenhagen");
  await fill('input[name="shipping_address.postal_code"]', "1000");
  await fill('input[name="shipping_address.phone"]', "+4500000000");

  const continueButton = page.getByRole("button", { name: /continue to delivery/i }).first();
  if (await continueButton.count()) {
    await continueButton.click().catch(() => undefined);
    await page.waitForTimeout(4000);
    const advanced =
      page.url().includes("delivery") || (await page.locator("body").innerText()).toLowerCase().includes("delivery");
    results.push({
      path: advanced ? "checkout-delivery" : "checkout-address-after-continue",
      blockers: blockers(await scan(page, advanced ? "checkout-delivery" : "checkout-after-continue")),
      notes: advanced ? undefined : "did not advance to delivery",
    });
  } else {
    results.push({ path: "checkout-delivery", blockers: [], notes: "continue button not found" });
  }

  saveJson(artifactDir, "checkout-summary", results);
  const all = results.flatMap((result) => result.blockers.map((blocker) => ({ path: result.path, ...blocker })));
  expect(all, `checkout blockers: ${JSON.stringify(all)}`).toEqual([]);
});

test("NFR-A11Y-7: mobile viewport pages have no critical/serious axe violations", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: "_medusa_cart_id", value: cartId, domain: env.targetHost, path: "/" }]);
  const results: { path: string; blockers: AxeFinding[] }[] = [];
  for (const path of ["/dk", "/dk/store", "/dk/cart"]) {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    results.push({
      path: `mobile${path}`,
      blockers: blockers(await scan(page, `mobile${path}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""))),
    });
  }
  saveJson(artifactDir, "mobile-summary", results);
  const all = results.flatMap((result) => result.blockers.map((blocker) => ({ path: result.path, ...blocker })));
  expect(all, `mobile blockers: ${JSON.stringify(all)}`).toEqual([]);
});
