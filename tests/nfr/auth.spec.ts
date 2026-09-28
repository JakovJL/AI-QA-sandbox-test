import { test, expect } from "@playwright/test";
import { ApiClient, parseJson } from "../../lib/api";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("nfr-auth");
const client = new ApiClient();

const CANDIDATES = [
  { email: "qa-checkout@example.com", password: "pass1234" },
  { email: "qa-ui@example.com", password: "pass1234" },
  { email: "qa-flow-1790590202122@example.com", password: "pass1234" },
];

async function customerLogin(): Promise<{ email: string; token: string }> {
  const attempts: { email: string; status: number }[] = [];
  for (const candidate of CANDIDATES) {
    const response = await client.storeRequest("POST", "/auth/customer/emailpass", candidate);
    attempts.push({ email: candidate.email, status: response.status });
    if (response.status >= 500) {
      throw new Error(`customer login 5xx for ${candidate.email}: ${response.status} ${response.body.slice(0, 200)}`);
    }
    if (response.status === 200) {
      const parsed = JSON.parse(response.body) as { token?: string };
      if (parsed.token) {
        saveJson(artifactDir, "login-attempts", attempts);
        return { email: candidate.email, token: parsed.token };
      }
    }
  }
  saveJson(artifactDir, "login-attempts", attempts);
  throw new Error(`no test customer could log in: ${JSON.stringify(attempts)}`);
}

test("NFR-AUTH-1: customer token is accepted by Store API and rejected by Admin API", async () => {
  const { email, token } = await customerLogin();
  const me = await client.store("/store/customers/me", { authorization: `Bearer ${token}` });
  const admin = await client.admin("/products?limit=1", token);
  saveJson(artifactDir, "cross-boundary", {
    email,
    me: { status: me.status, body: me.body.slice(0, 200) },
    admin: { status: admin.status, body: admin.body.slice(0, 200) },
  });
  expect(me.status, "customer token on /store/customers/me").toBe(200);
  expect(admin.status, "customer token on /admin/products").toBe(401);
});

test("NFR-AUTH-2: tampered customer token is rejected", async () => {
  const { email, token } = await customerLogin();
  const last = token.slice(-1);
  const tampered = token.slice(0, -1) + (last === "a" ? "b" : "a");
  const response = await client.store("/store/customers/me", { authorization: `Bearer ${tampered}` });
  saveJson(artifactDir, "tampered-token", { email, status: response.status, body: response.body.slice(0, 200) });
  expect(response.status, "tampered token status").toBe(401);
});

test("NFR-AUTH-3: auth endpoint throttling behavior is recorded", async () => {
  const attempts: { attempt: number; status: number; retryAfter: string | string[] | undefined }[] = [];
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await client.storeRequest("POST", "/auth/customer/emailpass", {
      email: "qa-nonexistent@example.com",
      password: "wrong-password",
    });
    attempts.push({ attempt, status: response.status, retryAfter: response.headers["retry-after"] });
  }
  saveJson(artifactDir, "throttling", attempts);
  for (const attempt of attempts) {
    expect(attempt.status, "no 5xx on failed logins").toBeLessThan(500);
  }
});

test("NFR-AUTH-4: admin token is rejected by Store API customer routes", async () => {
  const token = await client.adminToken();
  const response = await client.store("/store/customers/me", { authorization: `Bearer ${token}` });
  saveJson(artifactDir, "admin-token-on-store", {
    status: response.status,
    body: response.body.slice(0, 200),
  });
  expect(response.status, "admin token on /store/customers/me").toBe(401);
});
