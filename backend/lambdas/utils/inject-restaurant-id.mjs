/**
 * Multi-tenant helper utilities for extracting and injecting restaurantId.
 * Used across lambdas to support per-restaurant data isolation.
 */

/**
 * Extract restaurantId from JWT claims (Cognito authorizer).
 * Checks multiple claim locations:
 * - custom:restaurantId attribute
 * - cognito:groups with restaurant-{id} pattern
 * - username with kitchen-{restaurantId} pattern
 * 
 * @param {Object} event - API Gateway event
 * @returns {string|null} restaurantId or null if not found
 */
export function extractRestaurantIdFromJwt(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return null;

  // 1. Check for custom claim (set on kitchen users)
  if (claims['custom:restaurantId']) {
    return claims['custom:restaurantId'];
  }

  // 2. Check cognito:groups for restaurant-{id} pattern
  const groups = claims['cognito:groups'];
  if (groups) {
    const groupList = Array.isArray(groups) ? groups : [groups];
    for (const g of groupList) {
      if (g.startsWith('restaurant-')) {
        return g.replace('restaurant-', '');
      }
    }
  }

  // 3. Check username for kitchen-{restaurantId} pattern
  const username = claims['cognito:username'] || claims.username || claims.sub;
  if (username && username.startsWith('kitchen-')) {
    return username.replace('kitchen-', '');
  }

  return null;
}

/**
 * Extract and validate restaurantId from JWT and request context.
 * For protected endpoints, the JWT claim takes precedence and must match
 * any header/path restaurantId (to prevent cross-tenant access).
 * 
 * @param {Object} event - API Gateway event
 * @param {Object} options - Options
 * @param {boolean} options.requireJwt - If true, JWT must be present
 * @param {boolean} options.validateMatch - If true, JWT and header/path must match
 * @returns {{ restaurantId: string|null, error: string|null }} Result with restaurantId or error
 */
export function extractAndValidateRestaurantId(event, options = {}) {
  const { requireJwt = false, validateMatch = true } = options;

  // Get restaurantId from JWT
  const jwtRestaurantId = extractRestaurantIdFromJwt(event);
  
  // Get restaurantId from header/path/query
  const requestRestaurantId = extractRestaurantId(event);

  // If JWT required but missing
  if (requireJwt && !jwtRestaurantId) {
    return { restaurantId: null, error: 'Authentication required' };
  }

  // If both present and validation enabled, they must match
  if (validateMatch && jwtRestaurantId && requestRestaurantId) {
    if (jwtRestaurantId !== requestRestaurantId) {
      return { 
        restaurantId: null, 
        error: `Access denied: token for ${jwtRestaurantId} cannot access ${requestRestaurantId}` 
      };
    }
  }

  // JWT takes precedence if present (authoritative source)
  const restaurantId = jwtRestaurantId || requestRestaurantId;

  return { restaurantId, error: null };
}

/**
 * Extract restaurantId from API Gateway event.
 * Checks multiple locations where the ID might be passed:
 * - Query string parameter
 * - Path parameter
 * - Request header
 * - Vapi call metadata
 * 
 * @param {Object} event - API Gateway event
 * @returns {string|null} restaurantId or null if not found
 */
export function extractRestaurantId(event) {
  // 1. Check query string parameters
  const queryRestaurantId = event?.queryStringParameters?.restaurantId;
  if (queryRestaurantId) return queryRestaurantId;

  // 2. Check path parameters
  const pathRestaurantId = event?.pathParameters?.restaurantId;
  if (pathRestaurantId) return pathRestaurantId;

  // 3. Check headers (case-insensitive)
  const headers = event?.headers || {};
  const headerRestaurantId = headers['x-restaurant-id'] || headers['X-Restaurant-Id'];
  if (headerRestaurantId) return headerRestaurantId;

  // 4. Check Vapi call metadata (for phone orders)
  try {
    const body = typeof event?.body === 'string' ? JSON.parse(event.body) : event?.body;
    const vapiRestaurantId = body?.call?.metadata?.restaurantId 
      || body?.message?.call?.metadata?.restaurantId;
    if (vapiRestaurantId) return vapiRestaurantId;
  } catch (e) {
    // Ignore parse errors
  }

  // 5. Check environment variable fallback
  const envRestaurantId = process.env.DEFAULT_RESTAURANT_ID;
  if (envRestaurantId) return envRestaurantId;

  return null;
}

/**
 * Inject restaurantId into a record before writing to DynamoDB.
 * Only adds if restaurantId is provided and record doesn't already have one.
 * 
 * @param {Object} record - Record to inject into
 * @param {string} restaurantId - Restaurant ID to inject
 * @returns {Object} Record with restaurantId (shallow copy)
 */
export function injectRestaurantIdForWrite(record, restaurantId) {
  if (!restaurantId || !record) return record;
  if (record.restaurantId) return record; // Already has one
  return { ...record, restaurantId };
}

/**
 * Inject restaurantId into a single order/record (for reads).
 * Only adds if restaurantId is provided and record doesn't already have one.
 * 
 * @param {Object} record - Record to inject into
 * @param {string} restaurantId - Restaurant ID to inject
 * @returns {Object} Record with restaurantId (shallow copy)
 */
export function injectRestaurantId(record, restaurantId) {
  if (!restaurantId || !record) return record;
  if (record.restaurantId) return record; // Already has one
  return { ...record, restaurantId };
}

/**
 * Inject restaurantId into a batch of records.
 * 
 * @param {Array} records - Array of records to inject into
 * @param {string} restaurantId - Restaurant ID to inject
 * @returns {Array} Array of records with restaurantId
 */
export function injectRestaurantIdBatch(records, restaurantId) {
  if (!restaurantId || !Array.isArray(records)) return records;
  return records.map(record => injectRestaurantId(record, restaurantId));
}

/**
 * Add restaurantId filter to DynamoDB scan/query params.
 * Modifies the params object in place to add a FilterExpression.
 * 
 * @param {Object} params - DynamoDB scan/query params
 * @param {string} restaurantId - Restaurant ID to filter by
 */
export function addRestaurantIdFilter(params, restaurantId) {
  if (!restaurantId || !params) return;

  // Initialize ExpressionAttributeValues if not present
  if (!params.ExpressionAttributeValues) {
    params.ExpressionAttributeValues = {};
  }

  // Add the restaurantId value
  params.ExpressionAttributeValues[':restaurantId'] = { S: restaurantId };

  // Build or append to FilterExpression
  const restaurantFilter = 'restaurantId = :restaurantId';
  
  if (params.FilterExpression) {
    // Append with AND
    params.FilterExpression = `(${params.FilterExpression}) AND ${restaurantFilter}`;
  } else {
    params.FilterExpression = restaurantFilter;
  }
}




