import { readFileSync } from "node:fs";
import { parse } from "yaml";

const files = process.argv.slice(2);
for (const file of files) {
  const doc = parse(readFileSync(file, "utf8")) as {
    components?: { schemas?: Record<string, { required?: string[]; properties?: Record<string, unknown> }> };
  };
  const schemas = doc.components?.schemas ?? {};
  for (const name of ["StoreProduct", "StoreProductCategory", "StoreCurrency", "RegionCountry"]) {
    const schema = schemas[name];
    if (!schema) {
      console.log(`${file} :: ${name} :: NOT FOUND`);
      continue;
    }
    console.log(
      `${file} :: ${name} :: required=${JSON.stringify(schema.required ?? null)} ` +
        `external_id=${Boolean(schema.properties?.external_id)} deleted_at=${Boolean(schema.properties?.deleted_at)} status=${Boolean(schema.properties?.status)}`,
    );
  }
}
