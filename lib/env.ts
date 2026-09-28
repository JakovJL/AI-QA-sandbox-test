import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

export interface TargetEnv {
  targetHost: string;
  targetIp?: string;
  publishableKey: string;
  adminEmail: string;
  adminPassword: string;
}

export function loadTargetEnv(root: string = process.cwd()): TargetEnv {
  try {
    loadEnvFile(resolve(root, ".env"));
  } catch {}

  const env = process.env;
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Missing required env var ${name}`);
    return value;
  };

  return {
    targetHost: required("TARGET_HOST"),
    targetIp: env.TARGET_IP || undefined,
    publishableKey: required("PUBLISHABLE_KEY"),
    adminEmail: env.ADMIN_EMAIL ?? "admin@sandbox.local",
    adminPassword: env.ADMIN_PASSWORD ?? "",
  };
}
