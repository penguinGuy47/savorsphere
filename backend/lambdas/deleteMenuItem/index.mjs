import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";

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
    const menuItemId = event.pathParameters?.menuItemId;
    if (!menuItemId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "menuItemId is required in path" }),
      };
    }

    // Try itemId first (primary key), then menuItemId for backward compatibility
    try {
      await ddb.send(
        new DeleteItemCommand({
          TableName: TABLES.MENU_ITEMS,
          Key: { itemId: { S: String(menuItemId) } },
        })
      );
    } catch (error) {
      // Fallback to menuItemId if itemId doesn't exist
      await ddb.send(
        new DeleteItemCommand({
          TableName: TABLES.MENU_ITEMS,
          Key: { menuItemId: { S: String(menuItemId) } },
        })
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Menu item deleted successfully",
        menuItemId,
      }),
    };
  } catch (error) {
    console.error("DeleteMenuItem error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

