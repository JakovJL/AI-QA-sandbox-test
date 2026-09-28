import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ApiClient, parseJson } from "../lib/api";
import { loadTargetEnv } from "../lib/env";

const outDir = join(process.cwd(), "docs", "screenshots", "issues");
mkdirSync(outDir, { recursive: true });

const env = loadTargetEnv();
const client = new ApiClient(env);
const baseURL = `https://${env.targetHost}`;
const resolverArgs =
  env.targetIp && env.targetHost ? [`--host-resolver-rules=MAP ${env.targetHost} ${env.targetIp}`] : [];

async function main() {
  const browser = await chromium.launch({ args: resolverArgs });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Prepare cart for cart/checkout screenshots
  let cartId = "";
  try {
    const regions = parseJson<{ regions: { id: string }[] }>(await client.store("/store/regions")).regions;
    const products = parseJson<{ products: { handle: string; variants: { id: string }[] }[] }>(
      await client.store("/store/products?limit=20&fields=handle,*variants.id"),
    ).products;
    const sweatshirt = products.find((p) => p.handle === "sweatshirt") ?? products[0];
    const cart = parseJson<{ cart: { id: string } }>(
      await client.storeRequest("POST", "/store/carts", { region_id: regions[0].id }),
    ).cart;
    cartId = cart.id;
    await client.storeRequest("POST", `/store/carts/${cartId}/line-items`, {
      variant_id: sweatshirt.variants[0].id,
      quantity: 1,
    });
    await context.addCookies([{ name: "_medusa_cart_id", value: cartId, domain: env.targetHost, path: "/" }]);
    console.log(`cart ready: ${cartId}`);
  } catch (e) {
    console.log(`cart setup failed: ${e}`);
  }

  const shot = async (name: string, path: string, waitMs = 3000) => {
    await page.goto(`${baseURL}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(waitMs);
    const out = join(outDir, name);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`saved ${name} title=${JSON.stringify(await page.title())} url=${page.url()}`);
  };

  // BUG-005: /dk/store localhost requests (console errors not visible, but page state is)
  await shot("BUG-005-dk-store.png", "/dk/store", 5000);

  // BUG-006: fake order -> soft 200 with "Page not found" but title Order Confirmed
  await shot("BUG-006-fake-order.png", "/dk/order/order_fake_123/confirmed", 4000);

  // BUG-007: category title duplicated (title in head, screenshot shows page)
  await shot("BUG-007-category-shirts.png", "/dk/categories/shirts", 3000);

  // BUG-008 + BUG-015 (cart): cart page with quantity select + delete button
  await shot("BUG-008-cart.png", "/dk/cart", 3000);

  // BUG-012: dead Customer Service link -> 404 + account page with the link
  await shot("BUG-012-account-with-link.png", "/dk/account", 2500);
  await shot("BUG-012-customer-service-404.png", "/dk/customer-service", 2500);

  // BUG-013: storefront + admin login (both framable, no security headers)
  await shot("BUG-013-storefront-dk.png", "/dk", 3000);
  await shot("BUG-013-admin-login.png", "/app", 4000);

  // BUG-014: forms without accessible names
  await shot("BUG-014-checkout-address.png", "/dk/checkout?step=address", 4000);
  await shot("BUG-014-account.png", "/dk/account", 2500);

  // BUG-015: PDP gallery buttons without names
  await shot("BUG-015-pdp-sweatshirt.png", "/dk/products/sweatshirt", 3000);

  // BUG-016: images without alt (store + category)
  await shot("BUG-016-store.png", "/dk/store", 4000);

  // BUG-017: contrast (account/cart) - reuse account, add cart closeup + 404
  await shot("BUG-017-cart.png", "/dk/cart", 3000);
  await shot("BUG-017-404.png", "/dk/nonexistent-route-xyz", 2500);

  // BUG-018: footer links without text + nested popover (homepage shows both header + footer)
  await shot("BUG-018-home-footer.png", "/dk", 3000);

  // BUG-019: root file paths -> 200 HTML instead of 404
  await shot("BUG-019-dotenv-soft200.png", "/.env", 2500);
  await shot("BUG-019-404-control.png", "/dk/nonexistent-route-xyz", 2500);

  await browser.close();
  console.log(`done -> ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
