import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, addRestaurantIdFilter } from "../utils/inject-restaurant-id.mjs";

const ddbClient = new DynamoDBClient({ region: "us-east-2" });

export const handler = async (event) => {
  console.log("event", JSON.stringify(event, null, 2));

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-restaurant-id",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };

  const method = event.requestContext?.http?.method || event.httpMethod || event.requestContext?.httpMethod;
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({}),
    };
  }

  try {
    // Extract restaurantId from x-restaurant-id header
    const restaurantId = extractRestaurantId(event);
    console.log("restaurantId:", restaurantId);

    let params = {
      TableName: "MenuItems",
    };

    // If restaurantId is provided, filter results to that restaurant
    // Otherwise, return all items (backwards compatibility)
    if (restaurantId) {
      addRestaurantIdFilter(params, restaurantId);
    }

    console.log("Scanning table:", params.TableName, "with params:", JSON.stringify(params));

    const { Items } = await ddbClient.send(new ScanCommand(params));
    console.log("scan result count:", Items?.length || 0);

    const items = Items ? Items.map(item => unmarshall(item)) : [];
    console.log("Unmarshalled items count:", items.length);

    // If we have migrated to restaurant-prefixed itemIds (e.g., demo123#pizza-byo),
    // prefer returning those to avoid duplicates from legacy unprefixed itemIds.
    let responseItems = items;
    if (restaurantId) {
      const prefix = `${restaurantId}#`;
      const prefixed = items.filter((it) => typeof it?.itemId === "string" && it.itemId.startsWith(prefix));
      if (prefixed.length > 0) {
        responseItems = prefixed;
      }
      console.log("Menu responseItems count:", responseItems.length, "prefixed:", prefixed.length);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(responseItems),
      headers: corsHeaders,
    };
  } catch (error) {
    console.error("Error", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Failed to fetch menu", error: error.message }),
    };
  }
};
