/**
 * Multi-tenant restaurant ID utilities
 * 
 * Provides functions to extract restaurantId from Lambda events and inject it
 * into DynamoDB operations for multi-tenant data isolation.
 */

/**
 * Extract restaurantId from Lambda event
 * Checks multiple sources: headers, query params, request context, body metadata
 */
export function extractRestaurantId(event) {
  // Check headers (API Gateway HTTP API)
  if (event?.headers?.['x-restaurant-id']) {
    return String(event.headers['x-restaurant-id']);
  }
  if (event?.headers?.['X-Restaurant-Id']) {
    return String(event.headers['X-Restaurant-Id']);
  }

  // Check query parameters
  const queryParams = event?.queryStringParameters || {};
  if (queryParams.restaurantId) {
    return String(queryParams.restaurantId);
  }

  // Check path parameters (API Gateway REST API)
  if (event?.pathParameters?.restaurantId) {
    return String(event.pathParameters.restaurantId);
  }

  // Check request context (API Gateway custom authorizer)
  if (event?.requestContext?.authorizer?.restaurantId) {
    return String(event.requestContext.authorizer.restaurantId);
  }

  // Check body metadata (for Vapi calls)
  if (event?.body) {
    try {
      const parsed = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (parsed?.call?.metadata?.restaurantId) {
        return String(parsed.call.metadata.restaurantId);
      }
      if (parsed?.assistant?.metadata?.restaurantId) {
        return String(parsed.assistant.metadata.restaurantId);
      }
      if (parsed?.assistantId) {
        return String(parsed.assistantId);
      }
      if (parsed?.restaurantId) {
        return String(parsed.restaurantId);
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  // Check event metadata directly
  if (event?.restaurantId) {
    return String(event.restaurantId);
  }

  return null;
}

/**
 * Inject restaurantId into an object before writing to DynamoDB
 * Adds restaurantId field if not already present
 */
export function injectRestaurantIdForWrite(obj, restaurantId) {
  if (!restaurantId || !obj) return obj;
  
  return {
    ...obj,
    restaurantId: String(restaurantId)
  };
}

/**
 * Inject restaurantId into a single object (alias for injectRestaurantIdForWrite)
 */
export function injectRestaurantId(obj, restaurantId) {
  return injectRestaurantIdForWrite(obj, restaurantId);
}

/**
 * Inject restaurantId into an array of items (batch operation)
 * Useful for read operations that need to add restaurantId to legacy data
 */
export function injectRestaurantIdBatch(items, restaurantId) {
  if (!restaurantId || !Array.isArray(items)) return items;
  
  return items.map(item => ({
    ...item,
    restaurantId: item.restaurantId || String(restaurantId)
  }));
}

/**
 * Add restaurantId filter to DynamoDB query/scan parameters
 * Modifies params in-place to add FilterExpression or KeyConditionExpression
 */
export function addRestaurantIdFilter(params, restaurantId) {
  if (!restaurantId || !params) return;
  
  const restaurantIdValue = String(restaurantId);
  
  // If there's already a KeyConditionExpression, add restaurantId to it
  if (params.KeyConditionExpression) {
    // Check if restaurantId is part of the key
    const hasRestaurantIdInKey = params.KeyConditionExpression.includes('restaurantId');
    
    if (!hasRestaurantIdInKey) {
      // Add restaurantId filter to existing expression
      params.FilterExpression = params.FilterExpression 
        ? `(${params.FilterExpression}) AND restaurantId = :restaurantId`
        : 'restaurantId = :restaurantId';
      
      if (!params.ExpressionAttributeValues) {
        params.ExpressionAttributeValues = {};
      }
      params.ExpressionAttributeValues[':restaurantId'] = { S: restaurantIdValue };
    }
  } else {
    // For Scan operations, use FilterExpression
    params.FilterExpression = params.FilterExpression
      ? `(${params.FilterExpression}) AND restaurantId = :restaurantId`
      : 'restaurantId = :restaurantId';
    
    if (!params.ExpressionAttributeValues) {
      params.ExpressionAttributeValues = {};
    }
    params.ExpressionAttributeValues[':restaurantId'] = { S: restaurantIdValue };
  }
}

