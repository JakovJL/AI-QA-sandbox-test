import { test, expect } from "@playwright/test";
import { ApiClient, parseJson } from "../../lib/api";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("store-products-count");
const client = new ApiClient();

let total = 0;

test.beforeAll(async () => {
  const token = await client.adminToken();
  const adminResponse = await client.admin("/products?limit=1", token);
  total = parseJson<{ count: number }>(adminResponse).count;
  expect(total, "admin products total").toBeGreaterThan(0);
});

const countCases = [
  "/store/products?limit=1",
  "/store/products?limit=2",
  "/store/products?limit=3",
  "/store/products?limit=1&offset=1",
  "/store/products?limit=1&offset=100",
  "/store/products?limit=0",
];

for (const url of countCases) {
  test(`count equals total: ${url}`, async () => {
    const response = await client.store(url);
    const body = parseJson<{ count: number; products: unknown[]; limit: number; offset: number }>(response);
    const artifactName = `count-${url.replace(/[^a-z0-9]+/gi, "_")}`;

    saveJson(artifactDir, artifactName, {
      url,
      status: response.status,
      returned: body.products.length,
      count: body.count,
      limit: body.limit,
      offset: body.offset,
      adminTotal: total,
    });

    expect(response.status).toBe(200);
    expect(
      body.count,
      `count=${body.count}, returned=${body.products.length}, admin total=${total} (${url})`,
    ).toBe(total);
  });
}

test("control: store categories count equals total", async () => {
  const response = await client.store("/store/product-categories?limit=1");
  const body = parseJson<{ count: number; product_categories: unknown[] }>(response);
  saveJson(artifactDir, "control-categories", {
    status: response.status,
    returned: body.product_categories.length,
    count: body.count,
  });
  expect(response.status).toBe(200);
  expect(body.count).toBe(4);
});
