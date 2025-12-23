import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  ORDERS: "Orders",
};

const VALID_STATUSES = ['new', 'preparing', 'ready', 'completed', 'cancelled'];

export const handler = async (event) => {
  // CORS headers for all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
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
    const orderId = event?.pathParameters?.id;
    if (!orderId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing order id" }),
      };
    }

    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);

    // Parse request body
    const body = event?.body ? JSON.parse(event.body) : {};
    const { status, ...otherUpdates } = body;

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` 
        }),
      };
    }

    // Get existing order to verify it exists
    const getOrderRes = await ddb.send(
      new GetItemCommand({ 
        TableName: TABLES.ORDERS, 
        Key: { orderId: { S: orderId } } 
      })
    );

    if (!getOrderRes.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Order not found" }),
      };
    }

    const existingOrder = unmarshall(getOrderRes.Item);

    // MULTI-TENANT: Verify restaurantId matches if provided
    if (restaurantId && existingOrder.restaurantId && existingOrder.restaurantId !== restaurantId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Forbidden: Order belongs to different restaurant" }),
      };
    }

    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    if (status) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = { S: status };
    }

    // Allow updating other fields (like etaMinutes, notes, etc.)
    const allowedFields = ['etaMinutes', 'notes', 'customer'];
    for (const [key, value] of Object.entries(otherUpdates)) {
      if (allowedFields.includes(key)) {
        const attrName = `#${key}`;
        const attrValue = `:${key}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        
        // Convert value to DynamoDB format
        if (typeof value === 'number') {
          expressionAttributeValues[attrValue] = { N: String(value) };
        } else if (typeof value === 'object' && value !== null) {
          expressionAttributeValues[attrValue] = { M: marshall(value) };
        } else {
          expressionAttributeValues[attrValue] = { S: String(value) };
        }
      }
    }

    if (updateExpressions.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "No valid fields to update" }),
      };
    }

    // Add updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = { S: new Date().toISOString() };

    // Build update params
    const updateParams = {
      TableName: TABLES.ORDERS,
      Key: { orderId: { S: orderId } },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    };

    // MULTI-TENANT: Add restaurantId filter if available
    if (restaurantId) {
      updateParams.ConditionExpression = 'restaurantId = :restaurantId';
      updateParams.ExpressionAttributeValues[':restaurantId'] = { S: String(restaurantId) };
    }

    const updateResult = await ddb.send(new UpdateItemCommand(updateParams));
    const updatedOrder = unmarshall(updateResult.Attributes);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(updatedOrder),
    };
  } catch (error) {
    console.error("UpdateOrder error:", error);
    
    // Handle conditional check failure (restaurantId mismatch)
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Forbidden: Order belongs to different restaurant" }),
      };
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

