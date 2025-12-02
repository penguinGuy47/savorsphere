import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME || "PizzaOrders";

export const handler = async (event) => {
  console.log("Vapi payload:", JSON.stringify(event, null, 2));

  let args = event.arguments ?? {};
  if (typeof args === "string") args = JSON.parse(args);

  const order = {
    orderId: Date.now().toString(),
    createdAt: new Date().toISOString(),
    restaurantId: "test-001",
    status: "new",
    ...args,
  };

  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: order,
  }));

  return { statusCode: 200, body: "OK" };
};