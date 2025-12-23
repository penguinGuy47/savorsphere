import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  SETTINGS: "RestaurantSettings",
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
    const body = event?.body ? JSON.parse(event.body) : {};
    
    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);
    
    // Determine settingId (multi-tenant aware)
    const settingId = restaurantId 
      ? (restaurantId.startsWith('restaurant-config') ? restaurantId : `restaurant-config-${restaurantId}`)
      : "restaurant-config";

    // Get existing settings to merge updates
    let existingSettings = {};
    try {
      const getRes = await ddb.send(
        new GetItemCommand({
          TableName: TABLES.SETTINGS,
          Key: { settingId: { S: settingId } },
        })
      );
      if (getRes.Item) {
        existingSettings = unmarshall(getRes.Item);
      }
    } catch (e) {
      // If settings don't exist yet, start fresh
      console.log('No existing settings found, creating new');
    }

    // Merge existing settings with updates
    const updatedSettings = {
      settingId,
      ...existingSettings,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    // Ensure createdAt exists
    if (!updatedSettings.createdAt) {
      updatedSettings.createdAt = updatedSettings.updatedAt;
    }

    // MULTI-TENANT: Inject restaurantId if available
    if (restaurantId) {
      updatedSettings.restaurantId = String(restaurantId);
    }

    await ddb.send(
      new PutItemCommand({
        TableName: TABLES.SETTINGS,
        Item: marshall(updatedSettings, { removeUndefinedValues: true }),
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Settings updated successfully",
        settings: updatedSettings,
      }),
    };
  } catch (error) {
    console.error("UpdateSettings error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

