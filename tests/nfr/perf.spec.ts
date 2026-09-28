import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ApiClient, parseJson } from "../../lib/api";
import { loadTargetEnv } from "../../lib/env";
import { httpRequest } from "../../lib/http";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("nfr-perf");
const client = new ApiClient();
const env = loadTargetEnv();
const pinHost = env.targetIp ? { hostname: env.targetHost, ip: env.targetIp } : undefined;

const ROUNDS = 2;
const PER_ROUND = 10;

interface Sample {
  round: number;
  index: number;
  status: number;
  durationMs: number;
  error?: string;
}

interface Stats {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
}

function stats(samples: Sample[]): Stats {
  const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const quantile = (q: number) => durations[Math.min(durations.length - 1, Math.floor(q * durations.length))];
  return {
    count: durations.length,
    min: durations[0],
    median: quantile(0.5),
    p95: quantile(0.95),
    max: durations[durations.length - 1],
  };
}

interface PerfResult {
  label: string;
  samples: Sample[];
  stats: Stats;
  roundStats: ({ round: number } & Stats)[];
}

function labelToFile(label: string): string {
  return `perf-${label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
}

async function sample(label: string, request: () => Promise<{ status: number; durationMs: number }>): Promise<PerfResult> {
  const samples: Sample[] = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (let index = 0; index < PER_ROUND; index += 1) {
      try {
        const response = await request();
        samples.push({ round, index, status: response.status, durationMs: response.durationMs });
      } catch (error) {
        samples.push({ round, index, status: 0, durationMs: -1, error: String(error) });
      }
    }
  }
  const result: PerfResult = {
    label,
    samples,
    stats: stats(samples),
    roundStats: [1, 2].map((round) => ({ round, ...stats(samples.filter((sample) => sample.round === round)) })),
  };
  saveJson(artifactDir, labelToFile(label), result);
  return result;
}

function failures(result: PerfResult, expected: (status: number) => boolean) {
  return result.samples.filter((sample) => sample.status === 0 || !expected(sample.status));
}

function expectStable(result: PerfResult, expected: (status: number) => boolean) {
  const failed = failures(result, expected);
  expect(
    failed,
    `${result.label} unstable: ${JSON.stringify({ stats: result.stats, roundStats: result.roundStats, failed: failed.slice(0, 5) })}`,
  ).toEqual([]);
}

let cartId = "";
let productId = "";

test.beforeAll(async () => {
  const regions = parseJson<{ regions: { id: string }[] }>(await client.store("/store/regions")).regions;
  const products = parseJson<{ products: { id: string; handle: string; variants: { id: string }[] }[] }>(
    await client.store("/store/products?limit=10&fields=id,handle,*variants.id"),
  ).products;
  const sweatshirt = products.find((product) => product.handle === "sweatshirt");
  if (!sweatshirt) throw new Error("sweatshirt not found");
  productId = sweatshirt.id;

  const cart = parseJson<{ cart: { id: string } }>(
    await client.storeRequest("POST", "/store/carts", { region_id: regions[0].id }),
  ).cart;
  cartId = cart.id;
  await client.storeRequest("POST", `/store/carts/${cartId}/line-items`, {
    variant_id: sweatshirt.variants[0].id,
    quantity: 1,
  });
});

for (const path of ["/dk", "/dk/store", "/dk/products/sweatshirt"]) {
  test(`NFR-PERF-HTML ${path}: latency and stability`, async () => {
    const result = await sample(path, () => httpRequest(`https://${env.targetHost}${path}`, { pinHost }));
    expectStable(result, (status) => status === 200);
  });
}

const storeEndpoints = [
  { label: "store-api products", path: () => "/store/products?limit=10" },
  { label: "store-api product by id", path: () => `/store/products/${productId}` },
  { label: "store-api categories", path: () => "/store/product-categories" },
  { label: "store-api regions", path: () => "/store/regions" },
  { label: "store-api cart", path: () => `/store/carts/${cartId}` },
  { label: "store-api shipping options", path: () => `/store/shipping-options?cart_id=${cartId}` },
];

for (const endpoint of storeEndpoints) {
  test(`NFR-PERF-API ${endpoint.label}: latency and stability`, async () => {
    const result = await sample(endpoint.label, () => client.store(endpoint.path()));
    expectStable(result, (status) => status === 200);
  });
}

test("NFR-PERF-SUMMARY: aggregate latency baseline is recorded", async () => {
  const files = readdirSync(artifactDir).filter(
    (file) => file.startsWith("perf-") && file.endsWith(".json") && file !== "perf-aggregate.json",
  );
  const aggregate = files.map((file) => {
    const parsed = JSON.parse(readFileSync(resolve(artifactDir, file), "utf8")) as PerfResult;
    return { label: parsed.label, stats: parsed.stats, roundStats: parsed.roundStats };
  });
  saveJson(artifactDir, "aggregate", aggregate);
  expect(aggregate.length).toBeGreaterThan(0);
});
