import { test, expect } from "@playwright/test";
import http from "node:http";
import { loadTargetEnv } from "../../lib/env";
import { httpRequest } from "../../lib/http";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("nfr-perimeter");
const env = loadTargetEnv();
const base = `https://${env.targetHost}`;
const pinHost = env.targetIp ? { hostname: env.targetHost, ip: env.targetIp } : undefined;

function httpRequestRaw(
  url: string,
  options: { method?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const agent = pinHost
      ? new http.Agent({
          lookup: (
            hostname: string,
            _lookupOptions: unknown,
            callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
          ) => {
            if (hostname === pinHost.hostname) {
              callback(null, pinHost.ip, 4);
            } else {
              callback(new Error(`Unexpected host ${hostname}`), "", 0);
            }
          },
        })
      : undefined;
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: target.pathname + target.search,
        method: options.method ?? "GET",
        headers: options.headers,
        agent,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

test("NFR-PERI-1: plain HTTP redirects to HTTPS", async () => {
  let record: { status?: number; location?: string; error?: string } = {};
  try {
    const response = await httpRequestRaw(`http://${env.targetHost}/dk`);
    record = { status: response.status, location: String(response.headers.location ?? "") };
  } catch (error) {
    record = { error: String(error) };
  }
  saveJson(artifactDir, "http-redirect", record);
  expect(record.error, `plain HTTP behavior: ${JSON.stringify(record)}`).toBeUndefined();
  expect([301, 302, 307, 308], `HTTP status: ${record.status}`).toContain(record.status);
  expect(record.location, "redirect target").toMatch(/^https:/);
});

test("NFR-PERI-2: storefront and admin pages cannot be embedded in a cross-site iframe", async ({ page }) => {
  const results: { path: string; framed: boolean; bodyChars: number | null }[] = [];
  for (const path of ["/dk", "/app"]) {
    await page.setContent(`<iframe id="frame" src="${base}${path}" width="1024" height="768"></iframe>`);
    await page.waitForTimeout(4000);
    const frame = page.frames().find((candidate) => candidate.url().startsWith(`${base}${path}`));
    let bodyChars: number | null = null;
    if (frame) {
      bodyChars = (await frame.locator("body").innerText().catch(() => "")).length;
    }
    results.push({ path, framed: Boolean(frame), bodyChars });
  }
  saveJson(artifactDir, "clickjacking", results);
  for (const result of results) {
    expect(result.framed, `${result.path} must not be frameable: ${JSON.stringify(result)}`).toBe(false);
  }
});

test("NFR-PERI-3: sensitive service paths are not exposed over HTTP", async () => {
  const secretPaths = ["/.env", "/.git/config", "/metrics", "/debug", "/server-status"];
  const infoPaths = ["/health", "/healthz"];
  const results = [];
  for (const path of [...secretPaths, ...infoPaths]) {
    const response = await httpRequest(`${base}${path}`, { pinHost });
    results.push({
      path,
      status: response.status,
      contentType: response.headers["content-type"],
      snippet: response.body.slice(0, 120),
    });
  }
  saveJson(artifactDir, "path-probes", results);
  for (const result of results.filter((item) => secretPaths.includes(item.path))) {
    expect(result.status, `${result.path} must not be served (got HTTP ${result.status})`).not.toBe(200);
  }
});

test("NFR-PERI-4: TRACE method is not enabled", async () => {
  const response = await httpRequest(`${base}/store/products`, {
    method: "TRACE",
    headers: { "x-publishable-api-key": env.publishableKey },
    pinHost,
  });
  saveJson(artifactDir, "trace", { status: response.status, body: response.body.slice(0, 200) });
  expect(response.status, `TRACE status ${response.status}`).not.toBe(200);
});

test("NFR-PERI-5: Admin API does not reflect foreign origins with credentials", async () => {
  const origin = "https://qa-evil.example";
  const preflight = await httpRequest(`${base}/admin/products`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization",
    },
    pinHost,
  });
  const record = {
    origin,
    status: preflight.status,
    allowOrigin: preflight.headers["access-control-allow-origin"],
    allowCredentials: preflight.headers["access-control-allow-credentials"],
    allowMethods: preflight.headers["access-control-allow-methods"],
    vary: preflight.headers["vary"],
  };
  saveJson(artifactDir, "admin-cors", record);
  const reflected = record.allowOrigin === origin || record.allowOrigin === "*";
  expect(reflected && record.allowCredentials === "true", JSON.stringify(record)).toBe(false);
});
