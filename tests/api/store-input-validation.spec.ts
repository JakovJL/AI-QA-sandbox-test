import { test, expect } from "@playwright/test";
import { ApiClient } from "../../lib/api";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("store-input-validation");
const client = new ApiClient();

function expectClientError(category: string, url: string): void {
  test(`${category}: ${url}`, async () => {
    const response = await client.store(url);
    saveJson(artifactDir, `${category}-${url.replace(/[^a-z0-9]+/gi, "_")}`, {
      url,
      status: response.status,
      body: response.body.slice(0, 500),
    });
    expect(response.status, `status for ${url}: ${response.body.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    expect(response.status, `status for ${url} must be client error, not 5xx`).toBeLessThan(500);
  });
}

for (const url of [
  "/store/products?limit=-1",
  "/store/products?offset=-1",
  "/store/products?limit=abc",
  "/store/products?offset=abc",
  "/store/collections?limit=-1",
  "/store/regions?limit=-1",
  "/store/product-types?limit=-1",
  "/store/product-tags?limit=-1",
  "/store/return-reasons?limit=-1",
  "/store/product-variants?offset=-1",
]) {
  expectClientError("negative-or-nonnumeric-pagination", url);
}

for (const url of [
  "/store/products?order=",
  "/store/products?order=xyz",
  "/store/regions?order=",
  "/store/collections?order=",
  "/store/return-reasons?order=",
  "/store/product-categories?order=",
]) {
  expectClientError("invalid-order", url);
}

for (const url of [
  "/store/product-categories?updated_at=",
  "/store/product-categories?updated_at=not-a-date",
  "/store/product-categories?created_at=",
  "/store/collections?updated_at=",
  "/store/product-options?updated_at=",
  "/store/products?created_at=",
]) {
  expectClientError("invalid-date-filter", url);
}

test("observation: fractional limit is accepted", async () => {
  const response = await client.store("/store/products?limit=1.5");
  saveJson(artifactDir, "observation-fractional-limit", {
    url: "/store/products?limit=1.5",
    status: response.status,
    body: response.body.slice(0, 300),
  });
  expect(response.status).toBe(200);
});
