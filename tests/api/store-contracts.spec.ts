import { test, expect } from "@playwright/test";
import Ajv, { AnySchema } from "ajv";
import addFormats from "ajv-formats";
import { ApiClient, parseJson } from "../../lib/api";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";
import { getJsonResponseSchema, loadSpec, OpenApiDocument } from "../../lib/spec";

const artifactDir = ensureArtifactDir("store-contracts");
const client = new ApiClient();
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
for (const format of ["int32", "int64", "float", "double"]) {
  ajv.addFormat(format, true);
}

let spec: OpenApiDocument;
let productId = "";
let regionId = "";

function tryJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return { invalidJson: body.slice(0, 500) };
  }
}

interface ContractCase {
  title: string;
  specPath: string;
  url: () => string;
  method: string;
  status?: number;
}

const cases: ContractCase[] = [
  { title: "regions list", specPath: "/store/regions", url: () => "/store/regions", method: "get" },
  { title: "products list", specPath: "/store/products", url: () => "/store/products?limit=2", method: "get" },
  { title: "product by id", specPath: "/store/products/{id}", url: () => `/store/products/${productId}`, method: "get" },
  { title: "categories list", specPath: "/store/product-categories", url: () => "/store/product-categories?limit=2", method: "get" },
  { title: "tags list", specPath: "/store/product-tags", url: () => "/store/product-tags?limit=2", method: "get" },
  { title: "types list", specPath: "/store/product-types", url: () => "/store/product-types?limit=2", method: "get" },
  { title: "collections list", specPath: "/store/collections", url: () => "/store/collections?limit=2", method: "get" },
  { title: "currencies list", specPath: "/store/currencies", url: () => "/store/currencies", method: "get" },
  { title: "return reasons list", specPath: "/store/return-reasons", url: () => "/store/return-reasons", method: "get" },
  { title: "payment providers list", specPath: "/store/payment-providers", url: () => `/store/payment-providers?region_id=${regionId}`, method: "get" },
];

test.beforeAll(async () => {
  spec = await loadSpec("vendor/openapi/store.openapi.full.yaml");

  const products = await client.store("/store/products?limit=1");
  productId = parseJson<{ products?: { id: string }[] }>(products).products?.[0]?.id ?? "";

  const regions = await client.store("/store/regions");
  regionId = parseJson<{ regions?: { id: string }[] }>(regions).regions?.[0]?.id ?? "";

  expect(productId, "bootstrap product id").toBeTruthy();
  expect(regionId, "bootstrap region id").toBeTruthy();
});

for (const contractCase of cases) {
  test(`${contractCase.method.toUpperCase()} ${contractCase.specPath} matches spec`, async () => {
    const response = await client.store(contractCase.url());
    const expectedStatus = contractCase.status ?? 200;
    const artifactName = `contract-${contractCase.title.replace(/\s+/g, "-")}`;

    saveJson(artifactDir, artifactName, {
      case: contractCase.title,
      specPath: contractCase.specPath,
      url: contractCase.url(),
      status: response.status,
      durationMs: response.durationMs,
      body: tryJson(response.body),
    });

    expect(response.status, `status for ${contractCase.url()}`).toBe(expectedStatus);

    const schema = getJsonResponseSchema(spec, contractCase.specPath, contractCase.method, String(expectedStatus));
    expect(schema, `spec schema for ${contractCase.method.toUpperCase()} ${contractCase.specPath}`).toBeTruthy();

    const validate = ajv.compile(schema as AnySchema);
    const valid = validate(tryJson(response.body));
    if (!valid) {
      const errors = validate.errors ?? [];
      const specDeviations = errors.filter((error) => error.keyword === "required");
      const schemaErrors = errors.filter((error) => error.keyword !== "required");
      if (specDeviations.length) {
        saveJson(artifactDir, `${artifactName}-spec-deviations`, { errors: specDeviations });
      }
      if (schemaErrors.length) {
        saveJson(artifactDir, `${artifactName}-schema-errors`, { errors: schemaErrors, body: tryJson(response.body) });
      }
      expect(schemaErrors, `schema errors for ${contractCase.url()}`).toEqual([]);
    }
  });
}
