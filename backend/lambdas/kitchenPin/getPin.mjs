/**
 * GET /kitchen/pin - Check if a kitchen PIN is set for this restaurant
 * Protected by JWT authorizer - requires admin login
 * Returns { hasPin, lastUpdatedAt } (never returns the actual PIN)
 */
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId } from "../utils/inject-restaurant-id.mjs";

const ddb = new DynamoDBClient();

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-restaurant-id",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "{}" };
  }

  try {
    // Extract restaurantId from JWT claims or headers
    const restaurantId = extractRestaurantIdFromJwt(event) || extractRestaurantId(event);
    
    if (!restaurantId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing restaurantId" }),
      };
    }

    // Look up kitchen PIN metadata in RestaurantSettings
    const settingId = `restaurant-config-${restaurantId}`;
    const { Item } = await ddb.send(new GetItemCommand({
      TableName: "RestaurantSettings",
      Key: { settingId: { S: settingId } },
    }));

    const settings = Item ? unmarshall(Item) : {};
    const hasPin = !!settings.kitchenPinSetAt;
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        hasPin,
        lastUpdatedAt: settings.kitchenPinSetAt || null,
        kitchenUser: settings.kitchenPinUser || null,
      }),
    };
  } catch (error) {
    console.error("GetKitchenPin error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * Extract restaurantId from JWT claims
 * Kitchen users have username format: kitchen-{restaurantId}
 * Admin users may have restaurantId in custom claims or groups
 */
function extractRestaurantIdFromJwt(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return null;

  // Check for custom claim
  if (claims['custom:restaurantId']) {
    return claims['custom:restaurantId'];
  }

  // Check cognito:groups for restaurant-{id} pattern
  const groups = claims['cognito:groups'];
  if (groups) {
    const groupList = Array.isArray(groups) ? groups : [groups];
    for (const g of groupList) {
      if (g.startsWith('restaurant-')) {
        return g.replace('restaurant-', '');
      }
    }
  }

  // Check username for kitchen-{restaurantId} pattern
  const username = claims['cognito:username'] || claims.username || claims.sub;
  if (username && username.startsWith('kitchen-')) {
    return username.replace('kitchen-', '');
  }

  return null;
}




