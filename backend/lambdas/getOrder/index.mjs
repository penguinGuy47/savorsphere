import { DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

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

    const orderRes = await ddb.send(
      new GetItemCommand({ TableName: TABLES.ORDERS, Key: { orderId: { S: orderId } } })
    );
    if (!orderRes.Item) {
      return { statusCode: 404, body: JSON.stringify({ error: "Order not found" }) };
    }
    const order = unmarshall(orderRes.Item);

    // Try Query first; if it fails due to key schema, fall back to Scan + Filter
    let items = [];
    try {
      const q = await ddb.send(
        new QueryCommand({
          TableName: TABLES.ORDER_ITEMS,
          KeyConditionExpression: "orderId = :oid",
          ExpressionAttributeValues: { ":oid": { S: orderId } },
        })
      );
      items = (q.Items || []).map(unmarshall);
    } catch (e) {
      const s = await ddb.send(
        new ScanCommand({
          TableName: TABLES.ORDER_ITEMS,
          FilterExpression: "orderId = :oid",
          ExpressionAttributeValues: { ":oid": { S: orderId } },
        })
      );
      items = (s.Items || []).map(unmarshall);
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


