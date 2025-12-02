import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantId } from '../utils/inject-restaurant-id.mjs';

const ddbClient = new DynamoDBClient();

export const handler = async (event) => {
  // CORS headers
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    // Fallback to query params for backward compatibility
    const queryParams = event?.queryStringParameters || {};
    let restaurantId = extractRestaurantId(event) || queryParams.restaurantId || 'restaurant-config';
    
    // Use restaurantId in settingId for scalability
    const settingId = restaurantId.startsWith('restaurant-config') 
      ? restaurantId 
      : `restaurant-config-${restaurantId}`;

    const params = {
      TableName: "RestaurantSettings",
      Key: { settingId: { S: settingId } },
    };

    const { Item } = await ddbClient.send(new GetItemCommand(params));
    let settings = Item ? unmarshall(Item) : {};
    
    // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
    if (restaurantId && !settings.restaurantId) {
      settings = injectRestaurantId(settings, restaurantId);
    }

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
