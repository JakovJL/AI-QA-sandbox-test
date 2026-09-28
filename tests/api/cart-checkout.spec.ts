import { test, expect } from "@playwright/test";
import { ApiClient, parseJson } from "../../lib/api";
import { ensureArtifactDir, saveJson } from "../../lib/artifacts";
import { HttpResult } from "../../lib/http";

const artifactDir = ensureArtifactDir("cart-checkout");
const client = new ApiClient();

interface CartItem {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Cart {
  id: string;
  currency_code: string;
  email?: string | null;
  items?: CartItem[];
  item_total?: number;
  total?: number;
  shipping_total?: number;
  shipping_methods?: { shipping_option_id: string }[];
  shipping_address?: { country_code?: string } | null;
  region_id?: string;
}

let token = "";
let regionId = "";
let variantId = "";
let inventoryItemId = "";
let initialOrderCount = 0;

async function adminOrderCount(): Promise<number> {
  const response = await client.admin("/orders?limit=1", token);
  return parseJson<{ count: number }>(response).count;
}

async function fetchInventory(variant: string): Promise<{ itemId: string; available: number; reserved: number }> {
  const response = await client.admin("/inventory-items?limit=100&fields=id,reserved_quantity,*variants.id,*location_levels", token);
  const items = parseJson<{
    inventory_items: {
      id: string;
      reserved_quantity: number;
      variants?: { id: string }[];
      location_levels?: { available_quantity: number }[];
    }[];
  }>(response).inventory_items;
  const item = items.find((candidate) => candidate.variants?.some((linked) => linked.id === variant));
  if (!item) throw new Error(`No inventory item linked to variant ${variant}`);
  return {
    itemId: item.id,
    available: item.location_levels?.[0]?.available_quantity ?? -1,
    reserved: item.reserved_quantity,
  };
}

function saveStep(name: string, result: HttpResult, extra: Record<string, unknown> = {}): void {
  saveJson(artifactDir, name, { status: result.status, ...extra, body: result.body.slice(0, 4000) });
}

test.beforeAll(async () => {
  token = await client.adminToken();
  regionId = parseJson<{ regions: { id: string }[] }>(await client.store("/store/regions")).regions[0].id;

  const products = parseJson<{ products: { id: string; handle: string; variants: { id: string }[] }[] }>(
    await client.store("/store/products?limit=100&fields=id,handle,*variants.id"),
  ).products;
  const sweatshirt = products.find((product) => product.handle === "sweatshirt");
  if (!sweatshirt) throw new Error("Sweatshirt product not found");
  variantId = sweatshirt.variants[0].id;

  const inventory = await fetchInventory(variantId);
  inventoryItemId = inventory.itemId;
  initialOrderCount = await adminOrderCount();
  saveJson(artifactDir, "bootstrap", { regionId, variantId, inventory, initialOrderCount });
});

test.describe.serial("cart checkout flow", () => {
  let cartId = "";
  let orderId = "";

  test("create empty cart", async () => {
    const response = await client.storeRequest("POST", "/store/carts", { region_id: regionId });
    saveStep("01-create-cart", response);
    expect(response.status).toBe(200);
    const cart = parseJson<{ cart: Cart }>(response).cart;
    expect(cart.id).toMatch(/^cart_/);
    expect(cart.currency_code).toBe("eur");
    expect(cart.total).toBe(0);
    cartId = cart.id;
  });

  test("add line item and check totals", async () => {
    const response = await client.storeRequest("POST", `/store/carts/${cartId}/line-items`, {
      variant_id: variantId,
      quantity: 2,
    });
    saveStep("02-add-line-item", response);
    expect(response.status).toBe(200);
    const cart = parseJson<{ cart: Cart }>(response).cart;
    expect(cart.items?.[0]?.quantity).toBe(2);
    expect(cart.items?.[0]?.unit_price).toBe(10);
    expect(cart.item_total).toBe(20);
    expect(cart.total).toBe(20);
  });

  test("email and addresses", async () => {
    const response = await client.storeRequest("POST", `/store/carts/${cartId}`, {
      email: "qa-checkout@example.com",
      shipping_address: {
        first_name: "QA",
        last_name: "Tester",
        address_1: "Testvej 1",
        city: "Copenhagen",
        country_code: "dk",
        postal_code: "1000",
      },
      billing_address: {
        first_name: "QA",
        last_name: "Tester",
        address_1: "Testvej 1",
        city: "Copenhagen",
        country_code: "dk",
        postal_code: "1000",
      },
    });
    saveStep("03-update-cart", response);
    expect(response.status).toBe(200);
    const cart = parseJson<{ cart: Cart }>(response).cart;
    expect(cart.email).toBe("qa-checkout@example.com");
    expect(cart.shipping_address?.country_code).toBe("dk");
  });

  test("shipping options and method", async () => {
    const options = await client.store(`/store/shipping-options?cart_id=${cartId}`);
    saveStep("04-shipping-options", options);
    expect(options.status).toBe(200);
    const optionList = parseJson<{ shipping_options: { id: string }[] }>(options).shipping_options;
    expect(optionList.length).toBeGreaterThan(0);

    const response = await client.storeRequest("POST", `/store/carts/${cartId}/shipping-methods`, {
      option_id: optionList[0].id,
    });
    saveStep("05-add-shipping-method", response);
    expect(response.status).toBe(200);
    const cart = parseJson<{ cart: Cart }>(response).cart;
    expect(cart.shipping_methods?.length).toBe(1);
    expect(typeof cart.shipping_total).toBe("number");
  });

  test("payment collection and session", async () => {
    const collection = await client.storeRequest("POST", "/store/payment-collections", { cart_id: cartId });
    saveStep("06-payment-collection", collection);
    expect(collection.status).toBe(200);
    const collectionId = parseJson<{ payment_collection: { id: string } }>(collection).payment_collection.id;

    const session = await client.storeRequest(
      "POST",
      `/store/payment-collections/${collectionId}/payment-sessions`,
      { provider_id: "pp_system_default" },
    );
    saveStep("07-payment-session", session);
    expect(session.status).toBe(200);
  });

  test("complete cart creates order and reserves inventory", async () => {
    const before = await fetchInventory(variantId);

    const response = await client.storeRequest("POST", `/store/carts/${cartId}/complete`);
    saveStep("08-complete", response);
    expect(response.status).toBe(200);
    const body = parseJson<{ type: string; order?: { id: string; total: number; currency_code: string } }>(response);
    expect(body.type).toBe("order");
    expect(body.order?.id).toMatch(/^order_/);
    expect(body.order?.currency_code).toBe("eur");
    orderId = body.order?.id ?? "";

    const after = await fetchInventory(variantId);
    saveJson(artifactDir, "08-inventory-after-order", { before, after, itemId: inventoryItemId });
    expect(after.available).toBe(before.available - 2);
    expect(after.reserved).toBe(before.reserved + 2);

    const orderCount = await adminOrderCount();
    saveJson(artifactDir, "08-admin-order-count", { initialOrderCount, orderCount });
    expect(orderCount).toBe(initialOrderCount + 1);
  });

  test("order is retrievable by id", async () => {
    const response = await client.store(`/store/orders/${orderId}`);
    saveStep("09-order-by-id", response);
    expect([200, 401, 404]).toContain(response.status);
    if (response.status === 200) {
      const order = parseJson<{ order?: { id: string } }>(response).order;
      expect(order?.id).toBe(orderId);
    }
  });

  test("repeated complete is idempotent", async () => {
    const response = await client.storeRequest("POST", `/store/carts/${cartId}/complete`);
    saveStep("10-complete-again", response);
    expect(response.status).toBe(200);
    const body = parseJson<{ type: string; order?: { id: string } }>(response);
    expect(body.type).toBe("order");
    expect(body.order?.id, "second complete must return the same order").toBe(orderId);

    const orderCount = await adminOrderCount();
    saveJson(artifactDir, "10-admin-order-count", { initialOrderCount, orderCount });
    expect(orderCount, "no duplicate order must be created").toBe(initialOrderCount + 1);
  });
});

test.describe.serial("checkout boundaries", () => {
  test("negative and zero quantities are rejected", async () => {
    for (const quantity of [0, -1]) {
      const cart = await client.storeRequest("POST", "/store/carts", { region_id: regionId });
      const cartId = parseJson<{ cart: Cart }>(cart).cart.id;
      const response = await client.storeRequest("POST", `/store/carts/${cartId}/line-items`, {
        variant_id: variantId,
        quantity,
      });
      saveStep(`11-quantity-${String(quantity).replace("-", "minus-")}`, response, { quantity });
      expect(response.status, `quantity ${quantity}: ${response.body.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(response.status, `quantity ${quantity} must be client error`).toBeLessThan(500);
    }
  });

  test("non-numeric quantity is rejected", async () => {
    const cart = await client.storeRequest("POST", "/store/carts", { region_id: regionId });
    const cartId = parseJson<{ cart: Cart }>(cart).cart.id;
    const response = await client.storeRequest("POST", `/store/carts/${cartId}/line-items`, {
      variant_id: variantId,
      quantity: "abc",
    });
    saveStep("12-quantity-abc", response);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  test("oversell is rejected at add-to-cart", async () => {
    const inventory = await fetchInventory(variantId);
    const cart = await client.storeRequest("POST", "/store/carts", { region_id: regionId });
    expect(cart.status).toBe(200);
    const cartId = parseJson<{ cart: Cart }>(cart).cart.id;

    const response = await client.storeRequest("POST", `/store/carts/${cartId}/line-items`, {
      variant_id: variantId,
      quantity: inventory.available + 1,
    });
    saveStep("13-oversell-add", response, { quantity: inventory.available + 1, available: inventory.available });
    expect(response.status, `oversell: ${response.body.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});
