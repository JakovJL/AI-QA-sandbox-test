import { defineConfig } from "@playwright/test";
import { loadTargetEnv } from "./lib/env";

function targetEnv() {
  try {
    return loadTargetEnv();
  } catch {
    return undefined;
  }
}

const env = targetEnv();
const resolverArgs =
  env?.targetIp && env.targetHost ? [`--host-resolver-rules=MAP ${env.targetHost} ${env.targetIp}`] : [];

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: env ? `https://${env.targetHost}` : undefined,
  },
  projects: [
    { name: "api", testMatch: /api\/.*\.spec\.ts/ },
    {
      name: "ui",
      testMatch: /ui\/.*\.spec\.ts/,
      use: { browserName: "chromium", launchOptions: { args: resolverArgs } },
    },
    {
      name: "nfr",
      testMatch: /nfr\/.*\.spec\.ts/,
      timeout: 300_000,
      use: { browserName: "chromium", launchOptions: { args: resolverArgs } },
    },
  ],
});
