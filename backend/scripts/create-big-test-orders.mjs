#!/usr/bin/env node
/**
 * Big Test Order Creator (stress / UI testing)
 *
 * Creates "large" orders:
 *  - 6+ pizzas (default 6–10)
 *  - 4+ sides  (default 4–8)
 *  - optional drinks
 *
 * Usage:
 *   node scripts/create-big-test-orders.mjs                    # 1 big order for demo123
 *   node scripts/create-big-test-orders.mjs demo123            # 1 big order for demo123
 *   node scripts/create-big-test-orders.mjs demo123 5          # 5 big orders for demo123
 *   node scripts/create-big-test-orders.mjs --both             # 1 big order for demo123 + test-001
 *
 * Optional knobs (env vars):
 *   API_URL=...
 *   PIZZA_MIN=6 PIZZA_MAX=10
 *   SIDE_MIN=4  SIDE_MAX=8
 *   DRINK_MIN=0 DRINK_MAX=3
 */

const API_BASE =
  process.env.API_URL || "https://b850esmck5.execute-api.us-east-2.amazonaws.com";

// ----- Menu pools -----
// Keep IDs consistent with your system expectations.
// If your menu uses different itemIds, just swap these lists.

const PIZZAS = [
  { itemId: "pizza-1", name: "Large Pepperoni Pizza", price: 18.99 },
  { itemId: "pizza-2", name: "Medium Cheese Pizza", price: 14.99 },
  { itemId: "pizza-3", name: "Large Sausage Pizza", price: 19.99 },
  { itemId: "pizza-4", name: "Large Veggie Pizza", price: 20.99 },
  { itemId: "pizza-5", name: "Medium Supreme Pizza", price: 18.49 },
  { itemId: "pizza-6", name: "Large BBQ Chicken Pizza", price: 21.49 },
];

const SIDES = [
  { itemId: "side-1", name: "Garlic Knots (6pc)", price: 5.99 },
  { itemId: "side-2", name: "Buffalo Wings (12pc)", price: 15.99 },
  { itemId: "side-3", name: "Mozzarella Sticks", price: 7.99 },
  { itemId: "side-4", name: "Caesar Salad", price: 6.99 },
  { itemId: "side-5", name: "Fries", price: 4.99 },
  { itemId: "side-6", name: "Chicken Tenders", price: 9.99 },
];

const DRINKS = [
  { itemId: "drink-1", name: "2-Liter Coke", price: 3.99 },
  { itemId: "drink-2", name: "2-Liter Diet Coke", price: 3.99 },
  { itemId: "drink-3", name: "Bottled Water", price: 1.99 },
  { itemId: "drink-4", name: "Sprite Can", price: 1.49 },
];

const NAMES = [
  "John Smith",
  "Jane Doe",
  "Mike Johnson",
  "Sarah Williams",
  "Bob Brown",
  "Alice Davis",
  "Chris Lee",
  "Emma Wilson",
];

const ORDER_TYPES = ["pickup", "delivery"]; // keep consistent with your backend

// ----- helpers -----
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPhone() {
  const area = randInt(100, 999);
  const exchange = randInt(100, 999);
  const subscriber = randInt(1000, 9999);
  return `(${area}) ${exchange}-${subscriber}`;
}

/**
 * Build N line items from a pool.
 * Allows duplicates by increasing quantity on existing lines.
 */
function buildItemsFromPool(pool, count, quantityRange = [1, 2]) {
  const items = [];
  const indexById = new Map();

  for (let i = 0; i < count; i++) {
    const base = pickOne(pool);
    const qty = randInt(quantityRange[0], quantityRange[1]);

    if (indexById.has(base.itemId)) {
      // accumulate quantity
      items[indexById.get(base.itemId)].quantity += qty;
    } else {
      indexById.set(base.itemId, items.length);
      items.push({
        itemId: base.itemId,
        name: base.name,
        price: base.price,
        quantity: qty,
      });
    }
  }

  return items;
}

function generateBigOrder() {
  const pizzaMin = parseInt(process.env.PIZZA_MIN || "6", 10);
  const pizzaMax = parseInt(process.env.PIZZA_MAX || "10", 10);
  const sideMin = parseInt(process.env.SIDE_MIN || "4", 10);
  const sideMax = parseInt(process.env.SIDE_MAX || "8", 10);
  const drinkMin = parseInt(process.env.DRINK_MIN || "0", 10);
  const drinkMax = parseInt(process.env.DRINK_MAX || "3", 10);

  const numPizzas = randInt(pizzaMin, pizzaMax);
  const numSides = randInt(sideMin, sideMax);
  const numDrinks = randInt(drinkMin, drinkMax);

  // pizzas often have qty 1–2 per line, sides 1–3, drinks 1–4
  const pizzaItems = buildItemsFromPool(PIZZAS, numPizzas, [1, 2]);
  const sideItems = buildItemsFromPool(SIDES, numSides, [1, 3]);
  const drinkItems = numDrinks > 0 ? buildItemsFromPool(DRINKS, numDrinks, [1, 4]) : [];

  const orderType = pickOne(ORDER_TYPES);
  const name = pickOne(NAMES);

  // Mix list order so UI doesn't group too predictably
  const items = shuffle([...pizzaItems, ...sideItems, ...drinkItems]);

  return {
    name,
    phone: randomPhone(),
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    orderType,
    items,
    address: orderType === "delivery" ? "60 Golf Rd, Arlington Heights, IL 60005" : "",
    table: orderType === "dine-in" ? `Table ${randInt(1, 20)}` : "",
    instructions:
      Math.random() > 0.5
        ? "Big order test: please pack sauces/napkins"
        : "Big order test: split into multiple bags",
    tip: randInt(0, 20),
    paymentMethod: "in-store",
  };
}

async function createOrder(restaurantId) {
  const orderData = generateBigOrder();

  const subtotal = orderData.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const taxRate = 8.875;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax + (orderData.tip || 0);

  const payload = {
    ...orderData,
    subtotal: +subtotal.toFixed(2),
    tax: +tax.toFixed(2),
    total: +total.toFixed(2),
  };

  console.log(`\n📦 Creating BIG order for restaurant: ${restaurantId}`);
  console.log(`   Customer: ${payload.name}`);
  console.log(`   Type: ${payload.orderType}`);
  console.log(
    `   Lines: ${payload.items.length} | Qty total: ${payload.items.reduce(
      (s, i) => s + i.quantity,
      0
    )}`
  );
  console.log(
    `   Items: ${payload.items
      .map((i) => `${i.quantity}x ${i.name}`)
      .join(", ")}`
  );
  console.log(`   Subtotal: $${payload.subtotal.toFixed(2)} | Total: $${payload.total.toFixed(2)}`);

  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-restaurant-id": restaurantId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`   ✅ Order created: #${result.orderNumber || result.orderId}`);
    console.log(`   Order ID: ${result.orderId}`);
    return result;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);

  console.log("🍕 BIG Test Order Creator");
  console.log(`API: ${API_BASE}`);
  console.log("─".repeat(50));

  if (args.includes("--both")) {
    console.log("\nCreating BIG orders for both demo123 and test-001...");
    await createOrder("demo123");
    await createOrder("test-001");
    console.log("\n✅ Done! Created 1 BIG order for each restaurant.");
    return;
  }

  const restaurantId = args[0] || "demo123";
  const count = parseInt(args[1], 10) || 1;

  console.log(`\nCreating ${count} BIG order(s) for restaurant: ${restaurantId}`);

  for (let i = 0; i < count; i++) {
    await createOrder(restaurantId);
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  console.log(`\n✅ Done! Created ${count} BIG order(s) for ${restaurantId}.`);
  console.log(`\nView orders at: http://localhost:3000/${restaurantId}`);
}

main().catch((err) => {
  console.error("\n❌ Script failed:", err.message);
  process.exit(1);
});
