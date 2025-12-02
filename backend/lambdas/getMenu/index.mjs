import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdBatch, addRestaurantIdFilter } from '../utils/inject-restaurant-id.mjs';

const ddbClient = new DynamoDBClient({ region: "us-east-2" });

export const handler = async (event) => {
  console.log("event", JSON.stringify(event, null, 2));

  try {
    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);
    
    const params = {
      TableName: "MenuItems",
    };
    
    // MULTI-TENANT: Add restaurantId filter if available
    if (restaurantId) {
      addRestaurantIdFilter(params, restaurantId);
    }
    
    console.log("Scanning table:", params.TableName);

    const { Items } = await ddbClient.send(new ScanCommand(params));
    console.log("scan result:", Items);

    let items = Items ? Items.map(item => unmarshall(item)) : [];
    
    // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
    if (restaurantId) {
      items = injectRestaurantIdBatch(items, restaurantId);
    }
    
    console.log("Unmarshalled items:", items);

    return {
      statusCode: 200,
      body: JSON.stringify(items),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to fetch menu", error: error.message }),
    };
  }
};


