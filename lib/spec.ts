import SwaggerParser from "@apidevtools/swagger-parser";
import { resolve } from "node:path";

export interface OpenApiDocument {
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
}

export interface OpenApiOperation {
  responses?: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>;
}

export async function loadSpec(relativePath: string): Promise<OpenApiDocument> {
  const file = resolve(process.cwd(), relativePath);
  const document = (await SwaggerParser.dereference(file)) as unknown;
  return document as OpenApiDocument;
}

function normalizeOpenApiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeOpenApiSchema);
  if (!node || typeof node !== "object") return node;

  const obj = { ...(node as Record<string, unknown>) };

  if (typeof obj.type === "string") {
    obj.type = obj.type === "null" ? "null" : [obj.type, "null"];
  } else if (Array.isArray(obj.type) && !obj.type.includes("null")) {
    obj.type = [...obj.type, "null"];
  }
  delete obj.nullable;

  if (obj.properties && typeof obj.properties === "object") {
    const properties = obj.properties as Record<string, unknown>;
    obj.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, normalizeOpenApiSchema(value)]),
    );
  }
  if (obj.items) obj.items = normalizeOpenApiSchema(obj.items);
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(obj[key])) {
      obj[key] = (obj[key] as unknown[]).map(normalizeOpenApiSchema);
    }
  }
  return obj;
}

export function getJsonResponseSchema(
  spec: OpenApiDocument,
  path: string,
  method: string,
  status = "200",
): Record<string, unknown> | undefined {
  const operation = spec.paths[path]?.[method.toLowerCase()];
  const schema = operation?.responses?.[status]?.content?.["application/json"]?.schema;
  return schema ? (normalizeOpenApiSchema(schema) as Record<string, unknown>) : undefined;
}
