import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId } from '../utils/inject-restaurant-id.mjs';

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

  // Handle CORS preflight
  const method = event.requestContext?.http?.method || event.httpMethod || event.requestContext?.httpMethod;
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({}),
    };
  }

  try {
    const menuItemId = event?.pathParameters?.menuItemId;
    if (!menuItemId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing menuItemId" }),
      };
    }

    const body = event?.body ? JSON.parse(event.body) : {};
    
    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = body.restaurantId || extractRestaurantId(event);

    // Get existing menu item
    const getRes = await ddb.send(
      new GetItemCommand({
        TableName: TABLES.MENU_ITEMS,
        Key: { itemId: { S: String(menuItemId) } },
      })
    );

    if (!getRes.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Menu item not found" }),
      };
    }

    const existingItem = unmarshall(getRes.Item);

    // MULTI-TENANT: Verify restaurantId matches if provided
    if (restaurantId && existingItem.restaurantId && existingItem.restaurantId !== restaurantId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Forbidden: Menu item belongs to different restaurant" }),
      };
    }

    // Merge updates with existing item
    const updatedItem = {
      ...existingItem,
      ...body,
      itemId: String(menuItemId), // Ensure itemId doesn't change
      menuItemId: String(menuItemId), // Keep menuItemId for API compatibility
      updatedAt: new Date().toISOString(),
    };

    // Preserve createdAt if it exists
    if (existingItem.createdAt) {
      updatedItem.createdAt = existingItem.createdAt;
    } else {
      updatedItem.createdAt = updatedItem.updatedAt;
    }

    // MULTI-TENANT: Ensure restaurantId is set
    if (restaurantId) {
      updatedItem.restaurantId = String(restaurantId);
    }

    await ddb.send(
      new PutItemCommand({
        TableName: TABLES.MENU_ITEMS,
        Item: marshall(updatedItem, { removeUndefinedValues: true }),
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Menu item updated successfully",
        menuItem: updatedItem,
      }),
    };
  } catch (error) {
    console.error("UpdateMenuItem error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

