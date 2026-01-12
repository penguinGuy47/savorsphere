import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId } from '../utils/inject-restaurant-id.mjs';

const ddbClient = new DynamoDBClient();

// Default ETA settings for new restaurants
const DEFAULT_ETA_SETTINGS = {
  // Pickup ETA (in minutes)
  etaPickupBaseMinutes: 15,
  etaPickupRangeMinutes: 5, // e.g., "15 to 20 minutes"
  
  // Delivery ETA (in minutes)
  etaDeliveryBaseMinutes: 30,
  etaDeliveryRangeMinutes: 10, // e.g., "30 to 40 minutes"
  
  // Rush multiplier (1.0 = normal, 1.5 = busy, 2.0 = slammed)
  etaRushMultiplier: 1.0,
  
  // Per-item increments
  etaPerPizzaMinutes: 3, // Add 3 minutes per pizza after the first
  etaPerSideMinutes: 1,  // Add 1 minute per side item
  
  // Size-based additions (minutes added based on pizza size)
  etaSizeAddMinutes: {
    Personal: 0,
    Small: 0,
    Medium: 2,
    Large: 4,
    XLarge: 6,
  },
};

export const handler = async (event) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-restaurant-id",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);
    
    // Determine settingId (multi-tenant aware)
    const settingId = restaurantId 
      ? (restaurantId.startsWith('restaurant-config') ? restaurantId : `restaurant-config-${restaurantId}`)
      : "restaurant-config";

    const params = {
      TableName: "RestaurantSettings",
      Key: { settingId: { S: settingId } },
    };

    const { Item } = await ddbClient.send(new GetItemCommand(params));
    const rawSettings = Item ? unmarshall(Item) : {};

    // Merge with defaults to ensure all ETA fields exist
    const settings = {
      ...DEFAULT_ETA_SETTINGS,
      ...rawSettings,
      // Ensure nested etaSizeAddMinutes is properly merged
      etaSizeAddMinutes: {
        ...DEFAULT_ETA_SETTINGS.etaSizeAddMinutes,
        ...(rawSettings.etaSizeAddMinutes || {}),
      },
    };

    return {
      statusCode: 200,
      body: JSON.stringify(settings),
      headers: corsHeaders,
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        message: "Failed to fetch settings", 
        error: error.message 
      }),
    };
  }
};
