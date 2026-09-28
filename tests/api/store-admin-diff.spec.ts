import { test, expect } from "@playwright/test";
import { ApiClient, parseJson } from "../../lib/api";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";

const artifactDir = ensureArtifactDir("store-admin-diff");
const client = new ApiClient();

interface StoreVariant {
  id: string;
  sku?: string | null;
  manage_inventory?: boolean;
  inventory_quantity?: number;
  calculated_price?: { calculated_amount: number | null } | null;
}

interface StoreProduct {
  id: string;
  title: string;
  handle: string;
  variants: StoreVariant[];
}

interface AdminPrice {
  currency_code: string;
  amount: number;
}

interface AdminVariant {
  id: string;
  sku: string | null;
  prices?: AdminPrice[];
}

interface AdminProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  variants: AdminVariant[];
  sales_channels?: { id: string }[];
}

interface AdminInventoryItem {
  id: string;
  sku: string | null;
  reserved_quantity: number;
  stocked_quantity: number;
  variants?: { id: string }[];
  location_levels?: { available_quantity: number }[];
}

let regionId = "";
let storeProducts: StoreProduct[] = [];
let storePrices: StoreProduct[] = [];
let adminProducts: AdminProduct[] = [];
let adminPrices: AdminProduct[] = [];
let adminInventory: AdminInventoryItem[] = [];

test.beforeAll(async () => {
  const token = await client.adminToken();

  regionId = parseJson<{ regions: { id: string }[] }>(await client.store("/store/regions")).regions[0].id;

  storeProducts = parseJson<{ products: StoreProduct[] }>(
    await client.store("/store/products?limit=100&fields=id,title,handle,*variants.id,*variants.sku,+variants.inventory_quantity"),
  ).products;

  storePrices = parseJson<{ products: StoreProduct[] }>(
    await client.store(
      `/store/products?limit=100&region_id=${regionId}&fields=id,*variants.id,*variants.calculated_price`,
    ),
  ).products;

  adminProducts = parseJson<{ products: AdminProduct[] }>(
    await client.admin("/products?limit=100", token),
  ).products;

  adminPrices = [];
  for (const product of adminProducts) {
    const detail = parseJson<{ product: AdminProduct }>(
      await client.admin(`/products/${product.id}?fields=id,*variants.id,*variants.prices`, token),
    );
    adminPrices.push(detail.product);
  }

  adminInventory = parseJson<{ inventory_items: AdminInventoryItem[] }>(
    await client.admin("/inventory-items?limit=100&fields=id,sku,*variants.id,*location_levels", token),
  ).inventory_items;

  saveJson(artifactDir, "dataset", {
    regionId,
    storeSkuExposed: storeProducts.some((product) =>
      product.variants.some((variant) => variant.sku !== undefined),
    ),
    storeProducts,
    storePrices,
    adminProducts: adminProducts.map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      channels: product.sales_channels?.map((channel) => channel.id),
      variants: product.variants.map((variant) => ({ id: variant.id, sku: variant.sku })),
    })),
    adminInventory: adminInventory.map((item) => ({
      id: item.id,
      sku: item.sku,
      stocked: item.stocked_quantity,
      reserved: item.reserved_quantity,
      available: item.location_levels?.[0]?.available_quantity ?? null,
    })),
  });
});

test("product sets match between Store and Admin", () => {
  const storeIds = storeProducts.map((product) => product.id).sort();
  const adminIds = adminProducts.map((product) => product.id).sort();
  saveJson(artifactDir, "product-ids", { storeIds, adminIds });
  expect(storeIds).toEqual(adminIds);
});

test("product titles and handles match", () => {
  const deviations: unknown[] = [];
  for (const storeProduct of storeProducts) {
    const adminProduct = adminProducts.find((candidate) => candidate.id === storeProduct.id);
    if (!adminProduct) continue;
    if (adminProduct.title !== storeProduct.title || adminProduct.handle !== storeProduct.handle) {
      deviations.push({
        id: storeProduct.id,
        store: { title: storeProduct.title, handle: storeProduct.handle },
        admin: { title: adminProduct.title, handle: adminProduct.handle },
      });
    }
  }
  saveJson(artifactDir, "title-handle-deviations", deviations);
  expect(deviations).toEqual([]);
});

test("variant ids match per product", () => {
  const deviations: unknown[] = [];
  for (const storeProduct of storeProducts) {
    const adminProduct = adminProducts.find((candidate) => candidate.id === storeProduct.id);
    if (!adminProduct) continue;
    const storeVariantIds = storeProduct.variants.map((variant) => variant.id).sort();
    const adminVariantIds = adminProduct.variants.map((variant) => variant.id).sort();
    if (JSON.stringify(storeVariantIds) !== JSON.stringify(adminVariantIds)) {
      deviations.push({ product: storeProduct.id, storeVariantIds, adminVariantIds });
    }
  }
  saveJson(artifactDir, "variant-deviations", deviations);
  expect(deviations).toEqual([]);
});

test("prices match: store calculated_price vs admin variant prices (eur)", () => {
  const deviations: unknown[] = [];
  for (const storeProduct of storePrices) {
    const adminProduct = adminPrices.find((candidate) => candidate.id === storeProduct.id);
    if (!adminProduct) continue;
    for (const storeVariant of storeProduct.variants) {
      const adminVariant = adminProduct.variants.find((candidate) => candidate.id === storeVariant.id);
      if (!adminVariant) continue;
      const storeAmount = storeVariant.calculated_price?.calculated_amount ?? null;
      const adminAmount = adminVariant.prices?.find((price) => price.currency_code === "eur")?.amount ?? null;
      if (storeAmount !== adminAmount) {
        deviations.push({ product: storeProduct.id, variant: storeVariant.id, storeAmount, adminAmount });
      }
    }
  }
  saveJson(artifactDir, "price-deviations", deviations);
  expect(deviations).toEqual([]);
});

test("inventory quantities match: store inventory_quantity vs admin available_quantity", () => {
  const byVariant = new Map<string, AdminInventoryItem>();
  for (const item of adminInventory) {
    for (const variant of item.variants ?? []) {
      byVariant.set(variant.id, item);
    }
  }

  const deviations: unknown[] = [];
  for (const product of storeProducts) {
    for (const variant of product.variants) {
      if (variant.manage_inventory === false) continue;
      const item = byVariant.get(variant.id);
      if (!item) {
        deviations.push({ variant: variant.id, reason: "no admin inventory item linked" });
        continue;
      }
      const adminAvailable = item.location_levels?.[0]?.available_quantity ?? null;
      if (variant.inventory_quantity !== adminAvailable) {
        deviations.push({
          product: product.id,
          variant: variant.id,
          sku: item.sku,
          storeQuantity: variant.inventory_quantity ?? null,
          adminAvailable,
        });
      }
    }
  }
  saveJson(artifactDir, "inventory-deviations", deviations);
  expect(deviations).toEqual([]);
});
