import { test, expect } from "@playwright/test";
import { ApiClient } from "../../lib/api";
import { loadTargetEnv } from "../../lib/env";
import { httpRequest, HttpResult } from "../../lib/http";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("nfr-headers");
const client = new ApiClient();
const env = loadTargetEnv();
const pinHost = env.targetIp ? { hostname: env.targetHost, ip: env.targetIp } : undefined;

const BASELINE_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
] as const;

function url(path: string): string {
  return `https://${env.targetHost}${path}`;
}

function snapshot(response: HttpResult) {
  return {
    status: response.status,
    missing: BASELINE_HEADERS.filter((name) => !response.headers[name]),
    headers: response.headers,
  };
}

test("NFR-SF-1: storefront HTML includes baseline security headers", async () => {
  const pages = [
    "/dk",
    "/dk/store",
    "/dk/cart",
    "/dk/order/order_fake_123/confirmed",
    "/dk/nonexistent-route-xyz",
  ];
  const results: { path: string; status: number; missing: string[]; headers: HttpResult["headers"] }[] = [];
  for (const path of pages) {
    const response = await httpRequest(url(path), { pinHost });
    results.push({ path, ...snapshot(response) });
  }
  saveJson(artifactDir, "storefront-pages", results);
  for (const result of results) {
    expect(result.missing, `${result.path} (HTTP ${result.status}) missing headers`).toEqual([]);
  }
});

test("NFR-API-1: Store API success includes baseline security headers", async () => {
  const response = await client.store("/store/products?limit=1");
  saveJson(artifactDir, "store-api-200", snapshot(response));
  expect(snapshot(response).missing, "Store API 200 missing headers").toEqual([]);
});

test("NFR-API-2: Store API errors include baseline security headers", async () => {
  const cases: { label: string; response: HttpResult }[] = [
    { label: "401 without publishable key", response: await httpRequest(url("/store/products"), { pinHost }) },
    { label: "404 unknown route", response: await client.store("/store/nonexistent-route-xyz") },
    { label: "400 invalid limit type", response: await client.store("/store/products?limit=abc") },
    { label: "500 negative limit (BUG-002)", response: await client.store("/store/products?limit=-1") },
  ];
  saveJson(
    artifactDir,
    "store-api-errors",
    cases.map((item) => ({ label: item.label, ...snapshot(item.response) })),
  );
  for (const item of cases) {
    expect(snapshot(item.response).missing, `${item.label} missing headers`).toEqual([]);
  }
});

test("NFR-ADMIN-1: Admin UI HTML and Admin API include baseline security headers", async () => {
  const adminUi = await httpRequest(url("/app"), { pinHost });
  const unauth = await httpRequest(url("/admin/products"), { pinHost });
  const token = await client.adminToken();
  const authed = await client.admin("/products?limit=1", token);
  const results = [
    { surface: "admin UI /app", ...snapshot(adminUi) },
    { surface: "admin API 401", ...snapshot(unauth) },
    { surface: "admin API 200", ...snapshot(authed) },
  ];
  saveJson(artifactDir, "admin-surfaces", results);
  for (const result of results) {
    expect(result.missing, `${result.surface} missing headers`).toEqual([]);
  }
});

test("NFR-CORS-1: foreign-origin CORS behavior is recorded and does not reflect credentials", async () => {
  const origin = "https://qa-evil.example";
  const preflight = await httpRequest(url("/store/products"), {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "GET",
      "access-control-request-headers": "x-publishable-api-key",
    },
    pinHost,
  });
  const simple = await client.store("/store/products?limit=1", { origin });
  const storefront = await httpRequest(url("/dk"), { headers: { origin }, pinHost });

  const results = [
    { surface: "store API preflight", response: preflight },
    { surface: "store API GET with Origin", response: simple },
    { surface: "storefront HTML with Origin", response: storefront },
  ].map(({ surface, response }) => ({
    surface,
    origin,
    status: response.status,
    allowOrigin: response.headers["access-control-allow-origin"],
    allowCredentials: response.headers["access-control-allow-credentials"],
    allowMethods: response.headers["access-control-allow-methods"],
    vary: response.headers["vary"],
  }));
  saveJson(artifactDir, "cors", results);

  for (const result of results) {
    const reflected = result.allowOrigin === origin || result.allowOrigin === "*";
    expect(
      reflected && result.allowCredentials === "true",
      `${result.surface} reflects arbitrary origin with credentials: ${JSON.stringify(result)}`,
    ).toBe(false);
  }
});
