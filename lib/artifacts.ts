import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function ensureArtifactDir(label: string, root: string = process.cwd()): string {
  const dir = resolve(root, "reports", "artifacts", label);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveJson(dir: string, name: string, data: unknown): string {
  const file = resolve(dir, name.endsWith(".json") ? name : `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}
