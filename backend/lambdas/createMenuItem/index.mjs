import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdForWrite } from '../utils/inject-restaurant-id.mjs';
import { validatePizzaMenuItem, DEFAULT_PIZZA_PRICING } from '../utils/pizza-pricing.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  MENU_ITEMS: "MenuItems",
};

function buildMenuItemPk(restaurantId, baseItemId) {
  const base = String(baseItemId);
  if (!restaurantId) return base;
  const prefix = `${restaurantId}#`;
  return base.startsWith(prefix) ? base : `${prefix}${base}`;
}

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-restaurant-id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({}),
    };
  }

  try {
    const body = event?.body ? JSON.parse(event.body) : {};
    
    // MULTI-TENANT: Extract restaurantId from event context
    // Check body first (since frontend sends it there), then event context
    const restaurantId = body.restaurantId || extractRestaurantId(event);
    
    console.log('CreateMenuItem - restaurantId:', restaurantId);
    console.log('CreateMenuItem - body:', JSON.stringify(body, null, 2));
    
    const schemaVersion = body.schemaVersion || 1;
    
    // Handle schemaVersion 2 (pizza items)
    if (schemaVersion === 2) {
      return await handleV2PizzaItem(body, restaurantId, corsHeaders);
    }
    
    // Handle v1 (existing flat items)
    return await handleV1MenuItem(body, restaurantId, corsHeaders);
  } catch (error) {
    console.error("CreateMenuItem error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * Handle schemaVersion 1 (flat menu items) - existing behavior
 */
async function handleV1MenuItem(body, restaurantId, corsHeaders) {
  const {
    menuItemId,
    itemId: altItemId,
    name,
    description = '',
    price,
    category = 'Uncategorized',
    available = true,
    image = '',
  } = body;

  const itemId = menuItemId || altItemId;

  if (!itemId || !name || price === undefined) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "itemId (or menuItemId), name, and price are required" }),
    };
  }

  const baseItemId = String(itemId);
  const pkItemId = buildMenuItemPk(restaurantId, baseItemId);

  let menuItem = {
    itemId: pkItemId, // DynamoDB PK (restaurant-prefixed when restaurantId is provided)
    menuItemId: baseItemId, // Keep menuItemId for API compatibility (base id)
    baseItemId,
    schemaVersion: 1,
    name: String(name),
    description: String(description),
    price: Number(price),
    category: String(category),
    available: Boolean(available),
    image: String(image),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // MULTI-TENANT: Always inject restaurantId on write
  if (restaurantId) {
    menuItem = injectRestaurantIdForWrite(menuItem, restaurantId);
    console.log('CreateMenuItem - v1 menuItem with restaurantId:', JSON.stringify(menuItem, null, 2));
  } else {
    console.warn('CreateMenuItem - WARNING: No restaurantId found! Menu item created without restaurantId.');
  }

  await ddb.send(
    new PutItemCommand({
      TableName: TABLES.MENU_ITEMS,
      Item: marshall(menuItem, { removeUndefinedValues: true }),
    })
  );

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      message: "Menu item created successfully",
      menuItem,
    }),
  };
}

/**
 * Handle schemaVersion 2 (pizza items)
 */
async function handleV2PizzaItem(body, restaurantId, corsHeaders) {
  const {
    itemId,
    kind,
    name,
    description = '',
    category = 'Pizza',
    image = '',
    available = true,
    sortOrder = 1,
    allowedSizes,
    allowedCrusts,
    allowedToppings = [],
    allowedModifiers = [],
    pricingRules = {},
    constraints = {},
  } = body;

  if (!itemId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "itemId is required for v2 items" }),
    };
  }

  const baseItemId = String(itemId);
  const pkItemId = buildMenuItemPk(restaurantId, baseItemId);

  // Merge with default pricing rules to ensure required fields exist
  const mergedPricingRules = {
    ...DEFAULT_PIZZA_PRICING,
    ...pricingRules,
    basePriceCentsBySize: { ...DEFAULT_PIZZA_PRICING.basePriceCentsBySize, ...pricingRules.basePriceCentsBySize },
    toppingPriceCentsBySize: { ...DEFAULT_PIZZA_PRICING.toppingPriceCentsBySize, ...pricingRules.toppingPriceCentsBySize },
    crustSurchargeCentsByCrust: { ...DEFAULT_PIZZA_PRICING.crustSurchargeCentsByCrust, ...pricingRules.crustSurchargeCentsByCrust },
    portionMultipliers: { ...DEFAULT_PIZZA_PRICING.portionMultipliers, ...pricingRules.portionMultipliers },
  };

  let menuItem = {
    itemId: pkItemId, // DynamoDB PK (restaurant-prefixed when restaurantId is provided)
    menuItemId: baseItemId,
    baseItemId,
    schemaVersion: 2,
    kind: kind || 'pizza',
    name: String(name || 'Untitled Pizza'),
    description: String(description),
    category: String(category),
    image: String(image),
    available: Boolean(available),
    sortOrder: Number(sortOrder),
    allowedSizes: allowedSizes || [],
    allowedCrusts: allowedCrusts || [],
    allowedToppings: allowedToppings || [],
    allowedModifiers: allowedModifiers || [],
    pricingRules: mergedPricingRules,
    constraints: constraints || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Validate pizza item structure
  const validation = validatePizzaMenuItem(menuItem);
  if (!validation.valid) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: "Invalid pizza item configuration",
        details: validation.errors 
      }),
    };
  }

  // MULTI-TENANT: Always inject restaurantId on write
  if (restaurantId) {
    menuItem = injectRestaurantIdForWrite(menuItem, restaurantId);
    console.log('CreateMenuItem - v2 pizza menuItem with restaurantId:', JSON.stringify(menuItem, null, 2));
  } else {
    console.warn('CreateMenuItem - WARNING: No restaurantId found! Pizza item created without restaurantId.');
  }

  await ddb.send(
    new PutItemCommand({
      TableName: TABLES.MENU_ITEMS,
      Item: marshall(menuItem, { removeUndefinedValues: true }),
    })
  );

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      message: "Pizza menu item created successfully",
      menuItem,
    }),
  };
}
