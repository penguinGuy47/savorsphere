import { DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantId, injectRestaurantIdBatch, addRestaurantIdFilter } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  ORDERS: "Orders",
  ORDER_ITEMS: "OrderItems",
};

export const handler = async (event) => {
  try {
    const orderId = event?.pathParameters?.id || event?.queryStringParameters?.id;
    if (!orderId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing order id" }) };
    }

    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);

    const orderRes = await ddb.send(
      new GetItemCommand({ TableName: TABLES.ORDERS, Key: { orderId: { S: orderId } } })
    );
    if (!orderRes.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: "Order not found" }) };
    }
    let order = unmarshall(orderRes.Item);
    
    // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
    if (restaurantId) {
      order = injectRestaurantId(order, restaurantId);
    }

    // Try Query first; if it fails due to key schema, fall back to Scan + Filter
    let items = [];
    try {
      const queryParams = {
        TableName: TABLES.ORDER_ITEMS,
        KeyConditionExpression: "orderId = :oid",
        ExpressionAttributeValues: { ":oid": { S: orderId } },
      };
      
      // MULTI-TENANT: Add restaurantId filter if available
      if (restaurantId) {
        addRestaurantIdFilter(queryParams, restaurantId);
      }
      
      const q = await ddb.send(new QueryCommand(queryParams));
      items = (q.Items || []).map(unmarshall);
    } catch (e) {
      const scanParams = {
        TableName: TABLES.ORDER_ITEMS,
        FilterExpression: "orderId = :oid",
        ExpressionAttributeValues: { ":oid": { S: orderId } },
      };
      
      // MULTI-TENANT: Add restaurantId filter if available
      if (restaurantId) {
        addRestaurantIdFilter(scanParams, restaurantId);
      }
      
      const s = await ddb.send(new ScanCommand(scanParams));
      items = (s.Items || []).map(unmarshall);
    }
    
    // MULTI-TENANT: Lazy inject restaurantId into order items if missing
    if (restaurantId) {
      items = injectRestaurantIdBatch(items, restaurantId);
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify({ ...order, items }),
    };
  } catch (error) {
    console.error("GetOrder error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};


