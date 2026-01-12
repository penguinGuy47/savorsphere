/**
 * PATCH /order/{id} - Update order status and other fields
 * Used by kitchen display and admin dashboard to update order status.
 */
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractAndValidateRestaurantId, injectRestaurantId } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  ORDERS: "Orders",
  SETTINGS: "RestaurantSettings",
};

/**
 * Get JWT claims from API Gateway (HTTP API JWT authorizer).
 */
function getJwtClaims(event) {
  return event?.requestContext?.authorizer?.jwt?.claims || null;
}

/**
 * Is this request authenticated as a kitchen device user?
 * Kitchen users are created as username: kitchen-{restaurantId}
 */
function isKitchenClaims(claims) {
  if (!claims) return false;
  const username = claims['cognito:username'] || claims.username || '';
  return typeof username === 'string' && username.startsWith('kitchen-');
}

function parseClaimInt(claims, key) {
  if (!claims || claims[key] == null) return null;
  const n = parseInt(String(claims[key]), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Enforce that kitchen tokens are only valid if issued AFTER the current PIN was set.
 */
async function assertKitchenSessionValid(restaurantId, claims) {
  const authTimeSec = parseClaimInt(claims, 'auth_time') || parseClaimInt(claims, 'iat');
  if (!authTimeSec) {
    return { ok: false, reason: 'Missing auth_time' };
  }

  const tokenAuthMs = authTimeSec * 1000;
  const settingId = `restaurant-config-${restaurantId}`;

  const { Item } = await ddb.send(new GetItemCommand({
    TableName: TABLES.SETTINGS,
    Key: { settingId: { S: settingId } },
  }));

  const settings = Item ? unmarshall(Item) : {};
  const pinSetAt = settings.kitchenPinSetAt;
  if (!pinSetAt) {
    return { ok: true };
  }

  const pinSetMs = new Date(pinSetAt).getTime();
  if (!Number.isFinite(pinSetMs)) {
    return { ok: true };
  }

  if (tokenAuthMs < pinSetMs) {
    return { ok: false, reason: 'PIN rotated' };
  }

  return { ok: true };
}

// Valid status transitions
const VALID_STATUSES = ['needs_callback', 'new', 'paid', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];

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
    // Get order ID from path parameters
    const orderId = event?.pathParameters?.id;
    if (!orderId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing order id" }),
      };
    }

    // Parse request body
    let body = {};
    try {
      body = event?.body ? JSON.parse(event.body) : {};
    } catch (e) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const { status, acceptedAt } = body;

    // MULTI-TENANT: Extract restaurantId (JWT claims take precedence and must match header/path if both exist)
    const { restaurantId, error: tenantError } = extractAndValidateRestaurantId(event, { requireJwt: false, validateMatch: true });
    if (tenantError) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: tenantError }),
      };
    }

    // If this is a kitchen JWT request, enforce PIN rotation invalidation
    const claims = getJwtClaims(event);
    if (restaurantId && isKitchenClaims(claims)) {
      const session = await assertKitchenSessionValid(restaurantId, claims);
      if (!session.ok) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Kitchen session invalidated. Please re-pair with the new PIN." }),
        };
      }
    }

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

    // Verify order exists
    const getResult = await ddb.send(
      new GetItemCommand({
        TableName: TABLES.ORDERS,
        Key: { orderId: { S: orderId } },
      })
    );

    if (!getResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Order not found" }),
      };
    }

    let existingOrder = unmarshall(getResult.Item);
    
    // MULTI-TENANT: Verify order belongs to this restaurant (if restaurantId available)
    if (restaurantId && existingOrder.restaurantId && existingOrder.restaurantId !== restaurantId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Access denied to this order" }),
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

    if (acceptedAt) {
      updateExpressions.push('acceptedAt = :acceptedAt');
      expressionAttributeValues[':acceptedAt'] = { S: acceptedAt };
    }

    // Always update updatedAt timestamp
    const updatedAt = new Date().toISOString();
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = { S: updatedAt };

    // If status is 'completed', set completedAt
    if (status === 'completed') {
      updateExpressions.push('completedAt = :completedAt');
      expressionAttributeValues[':completedAt'] = { S: updatedAt };
    }

    // If status is 'cancelled', set cancelledAt
    if (status === 'cancelled') {
      updateExpressions.push('cancelledAt = :cancelledAt');
      expressionAttributeValues[':cancelledAt'] = { S: updatedAt };
    }

    if (updateExpressions.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "No fields to update" }),
      };
    }

    // Execute update
    const updateParams = {
      TableName: TABLES.ORDERS,
      Key: { orderId: { S: orderId } },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
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

    console.log("UpdateOrder success:", { orderId, status, updatedAt });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        order: updatedOrder,
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



