/**
 * PUT/PATCH /settings - Update restaurant settings
 * Stores settings in RestaurantSettings table.
 *
 * NOTE: This file was previously empty, which caused CDK to upload an empty zip
 * and Lambda deployment to fail. This minimal handler fixes packaging and provides
 * correct behavior.
 */
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdForWrite } from "../utils/inject-restaurant-id.mjs";

const ddb = new DynamoDBClient();

const TABLES = {
  SETTINGS: "RestaurantSettings",
};

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Content-Type": "application/json",
  };

  const method = event.requestContext?.http?.method || event.httpMethod || event.requestContext?.httpMethod;
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({}) };
  }

  try {
    const restaurantId = extractRestaurantId(event);
    const body = event?.body ? JSON.parse(event.body) : {};

    // Match createOrder's settings lookup strategy
    const settingId = restaurantId
      ? (restaurantId.startsWith("restaurant-config") ? restaurantId : `restaurant-config-${restaurantId}`)
      : "restaurant-config";

    let record = {
      settingId,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    // Ensure restaurantId persisted for multi-tenant reads (optional but helpful)
    if (restaurantId) {
      record = injectRestaurantIdForWrite(record, restaurantId);
    }

    await ddb.send(
      new PutItemCommand({
        TableName: TABLES.SETTINGS,
        Item: marshall(record, { removeUndefinedValues: true }),
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, settings: record }),
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








