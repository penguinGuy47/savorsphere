/**
 * Multi-tenant support utilities for DynamoDB operations
 * 
 * This module provides functions to:
 * 1. Extract restaurantId from Lambda event context
 * 2. Inject restaurantId into DynamoDB items on read/write
 */

/**
 * Extract restaurantId from Lambda event context
 * Checks multiple sources in order of priority:
 * 1. Path parameters (e.g., /orders/{restaurantId}/...)
 * 2. Query string parameters (e.g., ?restaurantId=...)
 * 3. Request body (parsed JSON)
 * 4. Vapi payload.assistantId (if available)
 * 
 * @param {Object} event - Lambda event object
 * @returns {string|null} - restaurantId if found, null otherwise
 */
export function extractRestaurantId(event) {
  // 1. Check path parameters
  if (event?.pathParameters?.restaurantId) {
    return String(event.pathParameters.restaurantId);
  }

  // 2. Check query string parameters
  if (event?.queryStringParameters?.restaurantId) {
    return String(event.queryStringParameters.restaurantId);
  }

  // 3. Check request body (if parsed)
  if (event?.body) {
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (body?.restaurantId) {
        return String(body.restaurantId);
      }
      // Check for Vapi payload structure
      if (body?.payload?.assistantId) {
        return String(body.payload.assistantId);
      }
    } catch (e) {
      // Body not JSON, skip
    }
  }

  // 4. Check Vapi webhook structure
  if (event?.assistantId) {
    return String(event.assistantId);
  }

  // Default: return null if not found
  // In production, you might want to throw an error or use a default tenant
  return null;
}

/**
 * Inject restaurantId into a DynamoDB item (unmarshalled)
 * Uses lazy injection pattern: only adds if missing
 * 
 * @param {Object} item - Unmarshalled DynamoDB item
 * @param {string} restaurantId - Restaurant ID to inject
 * @returns {Object} - Item with restaurantId injected
 */
export function injectRestaurantId(item, restaurantId) {
  if (!item || !restaurantId) {
    return item;
  }

  // Lazy injection: only add if missing
  if (!item.restaurantId) {
    item.restaurantId = String(restaurantId);
  }

  return item;
}

/**
 * Inject restaurantId into multiple items (array)
 * 
 * @param {Array} items - Array of unmarshalled DynamoDB items
 * @param {string} restaurantId - Restaurant ID to inject
 * @returns {Array} - Items with restaurantId injected
 */
export function injectRestaurantIdBatch(items, restaurantId) {
  if (!Array.isArray(items) || !restaurantId) {
    return items;
  }

  return items.map(item => injectRestaurantId(item, restaurantId));
}

/**
 * Inject restaurantId into item before marshalling for write operations
 * Always adds restaurantId (not lazy) for writes
 * 
 * @param {Object} item - Item to be written to DynamoDB
 * @param {string} restaurantId - Restaurant ID to inject
 * @returns {Object} - Item with restaurantId always set
 */
export function injectRestaurantIdForWrite(item, restaurantId) {
  if (!item || !restaurantId) {
    return item;
  }

  // Always inject for writes (not lazy)
  item.restaurantId = String(restaurantId);
  return item;
}

/**
 * Add restaurantId filter to DynamoDB query/scan operations
 * 
 * @param {Object} params - DynamoDB QueryCommand or ScanCommand parameters
 * @param {string} restaurantId - Restaurant ID to filter by
 * @returns {Object} - Updated parameters with restaurantId filter
 */
export function addRestaurantIdFilter(params, restaurantId) {
  if (!restaurantId) {
    return params;
  }

  // For QueryCommand: Add FilterExpression (not KeyConditionExpression)
  // For ScanCommand: Add FilterExpression
  const restaurantFilter = 'restaurantId = :restaurantId';
  
  // Initialize ExpressionAttributeValues if needed
  if (!params.ExpressionAttributeValues) {
    params.ExpressionAttributeValues = {};
  }
  params.ExpressionAttributeValues[':restaurantId'] = { S: String(restaurantId) };

  // Handle existing FilterExpression
  if (params.FilterExpression) {
    params.FilterExpression = `${params.FilterExpression} AND ${restaurantFilter}`;
  } else {
    // If KeyConditionExpression exists (QueryCommand), add FilterExpression separately
    if (params.KeyConditionExpression) {
      params.FilterExpression = restaurantFilter;
    } else {
      // For ScanCommand, set FilterExpression
      params.FilterExpression = restaurantFilter;
    }
  }

  return params;
}

