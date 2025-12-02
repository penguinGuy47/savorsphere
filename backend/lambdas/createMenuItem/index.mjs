import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdForWrite } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  MENU_ITEMS: "MenuItems",
};

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    
    const {
      menuItemId,
      name,
      description = '',
      price,
      category = 'Uncategorized',
      available = true,
      image = '',
    } = body;

    if (!menuItemId || !name || price === undefined) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "menuItemId, name, and price are required" }),
      };
    }

    let menuItem = {
      itemId: String(menuItemId), // DynamoDB key expects 'itemId', not 'menuItemId'
      menuItemId: String(menuItemId), // Keep menuItemId for API compatibility
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
      console.log('CreateMenuItem - menuItem with restaurantId:', JSON.stringify(menuItem, null, 2));
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
  } catch (error) {
    console.error("CreateMenuItem error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

