/**
 * PUT/PATCH /menu/{menuItemId} - Update an existing menu item.
 *
 * NOTE: This file was previously empty, which caused CDK to upload an empty zip
 * and Lambda deployment to fail. This minimal handler fixes packaging and supports
 * updating menu items in DynamoDB.
 */
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId } from "../utils/inject-restaurant-id.mjs";

const ddb = new DynamoDBClient();

const TABLES = {
  MENU_ITEMS: "MenuItems",
};

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-restaurant-id",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Content-Type": "application/json",
  };

  const method = event.requestContext?.http?.method || event.httpMethod || event.requestContext?.httpMethod;
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({}) };
  }

  try {
    const menuItemId = event?.pathParameters?.menuItemId;
    if (!menuItemId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing menuItemId" }) };
    }

    // Multi-tenant: currently we only extract restaurantId so future table design can filter;
    // MenuItems table in this project is shared by name, so we keep updates simple.
    const restaurantId = extractRestaurantId(event);

    const body = event?.body ? JSON.parse(event.body) : {};
    // Strip primary key fields from update body
    const { id, menuItemId: bodyMenuItemId, ...updates } = body || {};

    // Resolve which DynamoDB PK to update:
    // - Prefer restaurant-prefixed PK when restaurantId exists (e.g., demo123#pizza-byo)
    // - Fall back to legacy unprefixed PK if it exists
    const rawId = String(menuItemId);
    const candidates = rawId.includes("#")
      ? [rawId]
      : [
          ...(restaurantId ? [`${restaurantId}#${rawId}`] : []),
          rawId,
        ];

    let resolvedKey = null;
    let existingItem = null;
    for (const candidate of candidates) {
      const getRes = await ddb.send(
        new GetItemCommand({
          TableName: TABLES.MENU_ITEMS,
          Key: { itemId: { S: String(candidate) } },
        })
      );
      if (getRes.Item) {
        resolvedKey = String(candidate);
        existingItem = unmarshall(getRes.Item);
        break;
      }
    }

    if (!resolvedKey) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Menu item not found" }) };
    }

    if (restaurantId && existingItem?.restaurantId && existingItem.restaurantId !== restaurantId) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "Forbidden: Menu item belongs to different restaurant" }) };
    }

    // Build UpdateExpression dynamically
    const updateKeys = Object.keys(updates).filter(k => updates[k] !== undefined);
    if (updateKeys.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No fields to update" }) };
    }

    const ExpressionAttributeNames = {};
    const ExpressionAttributeValues = {};
    const setParts = [];

    updateKeys.forEach((key, idx) => {
      const nameKey = `#k${idx}`;
      const valueKey = `:v${idx}`;
      ExpressionAttributeNames[nameKey] = key;
      // marshall returns a full object; we only need the single attribute value
      ExpressionAttributeValues[valueKey] = marshall({ v: updates[key] }, { removeUndefinedValues: true }).v;
      setParts.push(`${nameKey} = ${valueKey}`);
    });

    // Always update updatedAt
    ExpressionAttributeNames["#updatedAt"] = "updatedAt";
    ExpressionAttributeValues[":updatedAt"] = { S: new Date().toISOString() };
    setParts.push("#updatedAt = :updatedAt");

    // Optionally store restaurantId on the record for multi-tenant reads
    if (restaurantId && (!existingItem?.restaurantId || existingItem.restaurantId === restaurantId)) {
      ExpressionAttributeNames["#restaurantId"] = "restaurantId";
      ExpressionAttributeValues[":restaurantId"] = { S: restaurantId };
      setParts.push("#restaurantId = :restaurantId");
    }

    const result = await ddb.send(
      new UpdateItemCommand({
        TableName: TABLES.MENU_ITEMS,
        // Table schema uses `itemId` as the DynamoDB partition key (see createMenuItem lambda)
        Key: { itemId: { S: String(resolvedKey) } },
        UpdateExpression: `SET ${setParts.join(", ")}`,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, menuItemId: resolvedKey, attributes: result.Attributes || null }),
    };
  } catch (error) {
    console.error("UpdateMenuItem error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};


