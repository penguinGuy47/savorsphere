import { DynamoDBClient, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  MENU_ITEMS: "MenuItems",
};

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-restaurant-id",
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

    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);

    // Resolve which DynamoDB PK to delete:
    // - Prefer restaurant-prefixed PK when restaurantId exists (e.g., demo123#pizza-byo)
    // - Fall back to legacy unprefixed PK if it exists
    const rawId = String(menuItemId);
    const candidates = rawId.includes('#')
      ? [rawId]
      : [
          ...(restaurantId ? [`${restaurantId}#${rawId}`] : []),
          rawId,
        ];

    let resolvedKey = null;
    let existingItem = null;
    for (const candidate of candidates) {
      const getRes = await ddb.send(
        new GetItemCommand({
          TableName: TABLES.MENU_ITEMS,
          Key: { itemId: { S: String(candidate) } },
        })
      );

      if (getRes.Item) {
        resolvedKey = String(candidate);
        existingItem = unmarshall(getRes.Item);
        break;
      }
    }

    if (!resolvedKey || !existingItem) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Menu item not found" }),
      };
    }

    // MULTI-TENANT: Verify restaurantId matches if provided
    if (restaurantId && existingItem.restaurantId && existingItem.restaurantId !== restaurantId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Forbidden: Menu item belongs to different restaurant" }),
      };
    }

    // Delete the menu item
    const deleteParams = {
      TableName: TABLES.MENU_ITEMS,
      Key: { itemId: { S: String(resolvedKey) } },
    };

    // MULTI-TENANT: Add restaurantId condition if available
    if (restaurantId && existingItem.restaurantId) {
      deleteParams.ConditionExpression = 'restaurantId = :restaurantId';
      deleteParams.ExpressionAttributeValues = {
        ':restaurantId': { S: String(restaurantId) },
      };
    }

    await ddb.send(new DeleteItemCommand(deleteParams));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Menu item deleted successfully",
        menuItemId: String(resolvedKey),
      }),
    };
  } catch (error) {
    console.error("DeleteMenuItem error:", error);
    
    // Handle conditional check failure (restaurantId mismatch)
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Forbidden: Menu item belongs to different restaurant" }),
      };
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};





