import { test, expect } from "@playwright/test";
import { ApiClient, parseJson } from "../../lib/api";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("store-shipping-calculate");
const client = new ApiClient();

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

test("calculate shipping option price for a valid cart", async () => {
  const options = parseJson<{ shipping_options: { id: string; name: string }[] }>(
    await client.store(`/store/shipping-options?cart_id=${cartId}`),
  ).shipping_options;
  expect(options.length).toBeGreaterThan(0);

  const attempts: unknown[] = [];
  for (const option of options) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await client.storeRequest("POST", `/store/shipping-options/${option.id}/calculate`, {
        cart_id: cartId,
      });
      attempts.push({ option: option.name, attempt, status: response.status, body: response.body.slice(0, 300) });
    }
  }

  saveJson(artifactDir, "calculate-attempts", { cartId, attempts });

  const serverErrors = attempts.filter(
    (attempt) => (attempt as { status: number }).status >= 500,
  );
  expect(
    serverErrors,
    `server errors on calculate: ${JSON.stringify(serverErrors).slice(0, 500)}`,
  ).toEqual([]);
});
