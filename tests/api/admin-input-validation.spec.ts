import { test, expect } from "@playwright/test";
import { ApiClient, parseJson } from "../../lib/api";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("admin-input-validation");
const client = new ApiClient();

let token = "";

test.beforeAll(async () => {
  token = await client.adminToken();
});

async function expectClientError(label: string, action: () => Promise<{ status: number; body: string }>): Promise<void> {
  const response = await action();
  saveJson(artifactDir, label.replace(/[^a-z0-9]+/gi, "_"), {
    status: response.status,
    body: response.body.slice(0, 400),
  });
  expect(response.status, `${label}: ${response.body.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
  expect(response.status, `${label} must be client error`).toBeLessThan(500);
}

const listCases = [
  "/products?offset=-1",
  "/products?limit=-1",
  "/products?order=",
  "/products?created_at=",
  "/orders?offset=-1",
  "/customers?limit=-1",
  "/inventory-items?offset=-1",
];

for (const path of listCases) {
  test(`admin list invalid params: ${path}`, async () => {
    await expectClientError(`list-${path}`, () => client.admin(path, token));
  });
}

test("admin stock location: empty create payload", async () => {
  await expectClientError("stock-location-create-empty", () => client.adminRequest("POST", "/stock-locations", token, {}));
});

test("admin stock location: invalid name type", async () => {
  const locations = parseJson<{ stock_locations: { id: string }[] }>(
    await client.admin("/stock-locations?limit=1", token),
  ).stock_locations;
  expect(locations.length).toBeGreaterThan(0);
  await expectClientError("stock-location-name-number", () =>
    client.adminRequest("POST", `/stock-locations/${locations[0].id}`, token, { name: 123 }),
  );
});

test("admin region: empty currency code", async () => {
  await expectClientError("region-empty-currency", () =>
    client.adminRequest("POST", "/regions", token, { name: "QA Empty Currency", currency_code: "" }),
  );
});

test("admin region: nonexistent currency code is rejected", async () => {
  const response = await client.adminRequest("POST", "/regions", token, {
    name: "QA Invalid Currency",
    currency_code: "zzz",
  });
  saveJson(artifactDir, "region-invalid-currency", { status: response.status, body: response.body.slice(0, 400) });

  if (response.status === 200 || response.status === 201) {
    const regionId = parseJson<{ region: { id: string } }>(response).region.id;
    const cleanup = await client.adminRequest("DELETE", `/regions/${regionId}`, token);
    saveJson(artifactDir, "region-invalid-currency-cleanup", { cleanupStatus: cleanup.status });
  }

  expect(response.status, "creating a region with currency 'zzz' must be rejected").toBeGreaterThanOrEqual(400);
  expect(response.status).toBeLessThan(500);
});
