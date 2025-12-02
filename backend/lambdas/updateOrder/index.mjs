import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantId } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  ORDERS: "Orders",
};

export const handler = async (event) => {
  // CORS headers for all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle CORS preflight requests
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
    
    // Get order ID from path parameters
    const orderId = event?.pathParameters?.id || event?.pathParameters?.orderId;
    if (!orderId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing order id" }),
      };
    }

    // Parse request body
    const body = event?.body ? JSON.parse(event.body) : {};
    const { status, acceptedAt } = body;

    // Validate status if provided
    if (status !== undefined) {
      const validStatuses = ['new', 'paid', 'accepted', 'ready', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }),
        };
      }
    }

    // Check if order exists
    const getOrderRes = await ddb.send(
      new GetItemCommand({
        TableName: TABLES.ORDERS,
        Key: { orderId: { S: orderId } },
      })
    );

    if (!getOrderRes.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Order not found" }),
      };
    }
    
    let existingOrder = unmarshall(getOrderRes.Item);
    
    // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
    if (restaurantId) {
      existingOrder = injectRestaurantId(existingOrder, restaurantId);
    }

    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    if (status !== undefined) {
      updateExpressions.push("#status = :status");
      expressionAttributeNames["#status"] = "status";
      expressionAttributeValues[":status"] = { S: status };
    }

    if (acceptedAt !== undefined) {
      updateExpressions.push("acceptedAt = :acceptedAt");
      expressionAttributeValues[":acceptedAt"] = { S: acceptedAt };
    }
    
    // MULTI-TENANT: Always ensure restaurantId is set on update
    if (restaurantId) {
      updateExpressions.push("restaurantId = :restaurantId");
      expressionAttributeValues[":restaurantId"] = { S: String(restaurantId) };
    }

    if (updateExpressions.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "No fields to update. Provide 'status' and/or 'acceptedAt'" }),
      };
    }

    // Update the order
    const updateParams = {
      TableName: TABLES.ORDERS,
      Key: { orderId: { S: orderId } },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      updateParams.ExpressionAttributeNames = expressionAttributeNames;
    }

    const updateResult = await ddb.send(new UpdateItemCommand(updateParams));
    let updatedOrder = unmarshall(updateResult.Attributes);
    
    // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
    if (restaurantId) {
      updatedOrder = injectRestaurantId(updatedOrder, restaurantId);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        orderId: updatedOrder.orderId,
        status: updatedOrder.status,
        acceptedAt: updatedOrder.acceptedAt,
        restaurantId: updatedOrder.restaurantId,
        message: "Order updated successfully",
      }),
    };
  } catch (error) {
    console.error("UpdateOrder error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

