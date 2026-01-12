#!/usr/bin/env node
/**
 * Seed script to create demo pizza menu items for demo123 and test-001.
 *
 * IMPORTANT: The MenuItems DynamoDB table uses `itemId` as the ONLY partition key.
 * To support per-restaurant menus without collisions, this script writes items using
 * a restaurant-prefixed PK: `${restaurantId}#${baseItemId}` (while still storing the
 * base id in `menuItemId` / `baseItemId` for convenience).
 *
 * Usage:
 *   node backend/scripts/seed-pizza-menu-v2.mjs
 *   node backend/scripts/seed-pizza-menu-v2.mjs --restaurant demo123
 *   node backend/scripts/seed-pizza-menu-v2.mjs --restaurant test-001
 */

import { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const ddb = new DynamoDBClient({ region: "us-east-2" });
const MENU_ITEMS_TABLE = "MenuItems";

// Default restaurants to seed
const DEFAULT_RESTAURANTS = ["demo123", "test-001"];

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { restaurants: [] };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--restaurant" && args[i + 1]) {
      result.restaurants.push(args[++i]);
    }
  }

  if (result.restaurants.length === 0) {
    result.restaurants = DEFAULT_RESTAURANTS;
  }

  return result;
}

function buildMenuItemPk(restaurantId, baseItemId) {
  return `${restaurantId}#${String(baseItemId)}`;
}

// Pizza menu item configurations
const PIZZA_ITEMS = [
  {
    itemId: "pizza-byo",
    name: "Build Your Own Pizza",
    description: "Choose your size, crust, and toppings to create your perfect pizza",
    category: "Pizza",
    sortOrder: 1,
  },
  {
    itemId: "pizza-margherita",
    name: "Margherita Pizza",
    description: "Fresh mozzarella, tomatoes, basil, and olive oil on a thin crust",
    category: "Specialty Pizza",
    sortOrder: 10,
    defaultPizzaDetails: {
      size: "Medium",
      crust: "Thin",
      wholeToppings: ["Fresh Mozzarella", "Tomatoes", "Basil"],
      modifiers: [],
    },
  },
  {
    itemId: "pizza-pepperoni",
    name: "Classic Pepperoni",
    description: "Loaded with pepperoni and extra cheese",
    category: "Specialty Pizza",
    sortOrder: 11,
    defaultPizzaDetails: {
      size: "Medium",
      crust: "Regular",
      wholeToppings: ["Pepperoni", "Extra Cheese"],
      modifiers: [],
    },
  },
  {
    itemId: "pizza-meat-lovers",
    name: "Meat Lovers",
    description: "Pepperoni, sausage, bacon, and ham",
    category: "Specialty Pizza",
    sortOrder: 12,
    defaultPizzaDetails: {
      size: "Large",
      crust: "Regular",
      wholeToppings: ["Pepperoni", "Sausage", "Bacon", "Ham"],
      modifiers: [],
    },
  },
  {
    itemId: "pizza-veggie",
    name: "Garden Veggie",
    description: "Mushrooms, onions, green peppers, black olives, and tomatoes",
    category: "Specialty Pizza",
    sortOrder: 13,
    defaultPizzaDetails: {
      size: "Medium",
      crust: "Thin",
      wholeToppings: ["Mushrooms", "Onions", "Green Peppers", "Black Olives", "Tomatoes"],
      modifiers: [],
    },
  },
];

// Full pizza configuration (shared across all pizza items)
const PIZZA_CONFIG = {
  schemaVersion: 2,
  kind: "pizza",
  available: true,
  image: "",
  
  allowedSizes: ["Personal", "Small", "Medium", "Large"],
  allowedCrusts: ["Thin", "Regular", "Double", "Stuffed", "Gluten-Free"],
  allowedToppings: [
    "Pepperoni", "Sausage", "Italian Sausage", "Bacon", "Ham", "Chicken", "Ground Beef",
    "Mushrooms", "Onions", "Green Peppers", "Black Olives", "Green Olives",
    "Jalapeños", "Banana Peppers", "Tomatoes", "Spinach", "Pineapple",
    "Anchovies", "Fresh Mozzarella", "Feta Cheese", "Basil",
  ],
  allowedModifiers: ["well-done", "light sauce", "extra sauce", "no sauce", "extra cheese"],
  
  pricingRules: {
    basePriceCentsBySize: {
      Personal: 1199,
      Small: 1499,
      Medium: 1799,
      Large: 2099,
    },
    toppingPriceCentsBySize: {
      Personal: 100,
      Small: 150,
      Medium: 250,
      Large: 350,
    },
    crustSurchargeCentsByCrust: {
      Thin: 0,
      Regular: 0,
      Double: 200,
      Stuffed: 200,
      "Gluten-Free": 0,
    },
    glutenFreeBaseCents: 1600,
    glutenFreeAllowedSizes: ["Small"],
    halfToppingCountsAsWhole: true,
    portionMultipliers: {
      regular: 1,
      light: 1,
      extra: 2,
      no: 0,
    },
    extraCheeseCountsAsTopping: true,
  },
  
  constraints: {
    maxToppings: 10,
    allowedCrustsBySizes: null,
  },
};

// Some v1 items to seed as well (for testing mixed menus)
const V1_ITEMS = [
  {
    itemId: "garlic-knots",
    name: "Garlic Knots (6pc)",
    description: "Fresh-baked knots brushed with garlic butter",
    category: "Appetizers",
    price: 5.99,
    available: true,
    sortOrder: 100,
  },
  {
    itemId: "buffalo-wings",
    name: "Buffalo Wings (12pc)",
    description: "Crispy wings tossed in spicy buffalo sauce",
    category: "Appetizers",
    price: 14.99,
    available: true,
    sortOrder: 101,
  },
  {
    itemId: "caesar-salad",
    name: "Caesar Salad",
    description: "Romaine, parmesan, croutons, caesar dressing",
    category: "Salads",
    price: 9.99,
    available: true,
    sortOrder: 110,
  },
  {
    itemId: "soda-coke",
    name: "Coca-Cola",
    description: "20oz bottle",
    category: "Drinks",
    price: 2.99,
    available: true,
    sortOrder: 200,
  },
  {
    itemId: "soda-sprite",
    name: "Sprite",
    description: "20oz bottle",
    category: "Drinks",
    price: 2.99,
    available: true,
    sortOrder: 201,
  },
];

async function seedMenuItem(item) {
  try {
    await ddb.send(new PutItemCommand({
      TableName: MENU_ITEMS_TABLE,
      Item: marshall(item, { removeUndefinedValues: true }),
    }));
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to seed ${item.itemId}:`, error.message);
    return false;
  }
}

async function deleteLegacyIfOwnedByRestaurant(restaurantId, baseItemId) {
  try {
    const getRes = await ddb.send(new GetItemCommand({
      TableName: MENU_ITEMS_TABLE,
      Key: { itemId: { S: String(baseItemId) } },
    }));

    if (!getRes.Item) return false;
    const existing = unmarshall(getRes.Item);
    if (existing?.restaurantId !== restaurantId) return false;

    await ddb.send(new DeleteItemCommand({
      TableName: MENU_ITEMS_TABLE,
      Key: { itemId: { S: String(baseItemId) } },
    }));
    return true;
  } catch (e) {
    return false;
  }
}

async function seedRestaurant(restaurantId) {
  console.log(`\n🍕 Seeding menu for restaurant: ${restaurantId}`);
  console.log("─".repeat(50));

  const now = new Date().toISOString();
  let successCount = 0;
  let failCount = 0;

  // Cleanup legacy (unprefixed) seed items for this restaurant, if present.
  // This prevents duplicates when migrating from legacy PKs to prefixed PKs.
  const seedBaseIds = [
    ...PIZZA_ITEMS.map(p => p.itemId),
    ...V1_ITEMS.map(v => v.itemId),
  ];

  let deletedLegacy = 0;
  for (const baseId of seedBaseIds) {
    const didDelete = await deleteLegacyIfOwnedByRestaurant(restaurantId, baseId);
    if (didDelete) deletedLegacy++;

    // Also delete any existing prefixed version so seeding is idempotent
    const pk = buildMenuItemPk(restaurantId, baseId);
    await ddb.send(new DeleteItemCommand({
      TableName: MENU_ITEMS_TABLE,
      Key: { itemId: { S: pk } },
    }));
  }

  if (deletedLegacy > 0) {
    console.log(`  🧹 Deleted ${deletedLegacy} legacy (unprefixed) seed items for ${restaurantId}`);
  }

  // Seed pizza items (v2)
  for (const pizzaItem of PIZZA_ITEMS) {
    const baseItemId = pizzaItem.itemId;
    const pkItemId = buildMenuItemPk(restaurantId, baseItemId);
    const fullItem = {
      ...PIZZA_CONFIG,
      ...pizzaItem,
      itemId: pkItemId,
      menuItemId: baseItemId,
      baseItemId,
      restaurantId,
      createdAt: now,
      updatedAt: now,
    };

    const success = await seedMenuItem(fullItem);
    if (success) {
      console.log(`  ✅ ${pizzaItem.name} (v2 pizza)`);
      successCount++;
    } else {
      failCount++;
    }
  }

  // Seed v1 items
  for (const item of V1_ITEMS) {
    const baseItemId = item.itemId;
    const pkItemId = buildMenuItemPk(restaurantId, baseItemId);
    const fullItem = {
      ...item,
      itemId: pkItemId,
      schemaVersion: 1,
      menuItemId: baseItemId, // For API compatibility
      baseItemId,
      restaurantId,
      createdAt: now,
      updatedAt: now,
    };

    const success = await seedMenuItem(fullItem);
    if (success) {
      console.log(`  ✅ ${item.name} (v1 flat)`);
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n  📊 Summary: ${successCount} succeeded, ${failCount} failed`);
  return { successCount, failCount };
}

async function main() {
  const { restaurants } = parseArgs();

  console.log("═".repeat(60));
  console.log("  🍕 PIZZA MENU V2 SEEDER");
  console.log("═".repeat(60));
  console.log(`\nTarget restaurants: ${restaurants.join(", ")}`);
  console.log(`Table: ${MENU_ITEMS_TABLE}`);

  let totalSuccess = 0;
  let totalFail = 0;

  for (const restaurantId of restaurants) {
    const { successCount, failCount } = await seedRestaurant(restaurantId);
    totalSuccess += successCount;
    totalFail += failCount;
  }

  console.log("\n" + "═".repeat(60));
  console.log(`  ✅ COMPLETE: ${totalSuccess} items seeded, ${totalFail} failed`);
  console.log("═".repeat(60));
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

