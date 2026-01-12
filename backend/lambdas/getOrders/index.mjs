/**
 * GET /orders - List orders with flexible date filtering
 * Supports: days (default 30), from/to date range, all=true, pagination via cursor
 */
import { DynamoDBClient, ScanCommand, QueryCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractAndValidateRestaurantId, injectRestaurantIdBatch, addRestaurantIdFilter } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  ORDERS: "Orders",
  ORDER_ITEMS: "OrderItems",
  SETTINGS: "RestaurantSettings",
};

// Default to last 30 days
const DEFAULT_DAYS = 30;

/**
 * Safely parse a date string or timestamp.
 * Returns null if the date is invalid.
 */
function safeParseDate(value) {
  if (!value) return null;
  
  // If already a Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  // If number (timestamp)
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // If string
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  
  return null;
}

/**
 * Sanitize createdAt field - ensure we always have valid date fields
 */
function sanitizeCreatedAt(order) {
  let createdAtDate = safeParseDate(order.createdAt);
  
  // Try alternative fields if createdAt is invalid
  if (!createdAtDate && order.date) {
    createdAtDate = safeParseDate(order.date);
  }
  
  // If still invalid, try to extract from orderId (ord_1766887721913 format)
  if (!createdAtDate && order.orderId && order.orderId.startsWith('ord_')) {
    const timestamp = parseInt(order.orderId.replace('ord_', ''), 10);
    if (!isNaN(timestamp) && timestamp > 0) {
      createdAtDate = new Date(timestamp);
      if (isNaN(createdAtDate.getTime())) {
        createdAtDate = null;
      }
    }
  }
  
  // Fallback to now (shouldn't happen with valid data)
  if (!createdAtDate) {
    createdAtDate = new Date();
  }
  
  return {
    createdAt: createdAtDate.toISOString(),
    createdAtMs: createdAtDate.getTime(),
  };
}

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
 * This makes PIN regeneration immediately invalidate all existing paired devices.
 */
async function assertKitchenSessionValid(restaurantId, claims) {
  // Prefer auth_time, fall back to iat (both are seconds since epoch)
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

export const handler = async (event) => {
  // CORS headers for all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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
    
    // Get query parameters
    const queryParams = event?.queryStringParameters || {};
    const daysParam = queryParams.days; // Number of days to look back (default: 30)
    const fromParam = queryParams.from; // Start date (ISO or YYYY-MM-DD)
    const toParam = queryParams.to; // End date (ISO or YYYY-MM-DD)
    const allParam = queryParams.all; // If "true", return all orders (no date filter)
    const statusFilter = queryParams.status; // Optional: filter by status
    const orderTypeFilter = queryParams.orderType; // Optional: filter by orderType
    const cursorParam = queryParams.cursor; // Pagination cursor (base64 encoded LastEvaluatedKey)

    // Determine date range
    let startDate, endDate;
    const now = new Date();
    
    if (allParam === 'true') {
      // No date filtering - return all orders
      startDate = null;
      endDate = null;
    } else if (fromParam || toParam) {
      // Use explicit from/to range
      if (fromParam) {
        startDate = safeParseDate(fromParam);
        if (!startDate) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Invalid 'from' date format" }),
          };
        }
        startDate.setHours(0, 0, 0, 0);
      }
      if (toParam) {
        endDate = safeParseDate(toParam);
        if (!endDate) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Invalid 'to' date format" }),
          };
        }
        endDate.setHours(23, 59, 59, 999);
      }
      // If only from is provided, default to = now
      if (fromParam && !toParam) {
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
      }
      // If only to is provided, default from = 30 days before to
      if (toParam && !fromParam) {
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - DEFAULT_DAYS);
        startDate.setHours(0, 0, 0, 0);
      }
    } else {
      // Default: last N days (default 30)
      const days = parseInt(daysParam, 10) || DEFAULT_DAYS;
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
    }

    // Paginate through all results using LastEvaluatedKey
    let allOrders = [];
    let lastEvaluatedKey = cursorParam 
      ? JSON.parse(Buffer.from(cursorParam, 'base64').toString('utf8')) 
      : undefined;
    
    // Limit iterations to prevent infinite loops (safety)
    const MAX_ITERATIONS = 100;
    let iterations = 0;
    
    do {
      const scanParams = {
        TableName: TABLES.ORDERS,
      };
      
      // Add pagination cursor
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      // MULTI-TENANT: Add restaurantId filter if available
      if (restaurantId) {
        addRestaurantIdFilter(scanParams, restaurantId);
      }

      const scanResult = await ddb.send(new ScanCommand(scanParams));
      const batchOrders = (scanResult.Items || []).map(unmarshall);
      allOrders = allOrders.concat(batchOrders);
      
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
      iterations++;
    } while (lastEvaluatedKey && iterations < MAX_ITERATIONS);

    // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
    if (restaurantId) {
      allOrders = injectRestaurantIdBatch(allOrders, restaurantId);
    }
    
    // Sanitize timestamps for all orders
    allOrders = allOrders.map(order => {
      const { createdAt, createdAtMs } = sanitizeCreatedAt(order);
      return {
        ...order,
        createdAt,
        createdAtMs,
      };
    });
    
    // Apply date filter in JavaScript (more flexible than DynamoDB FilterExpression)
    if (startDate || endDate) {
      allOrders = allOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        if (startDate && orderDate < startDate) return false;
        if (endDate && orderDate > endDate) return false;
        return true;
      });
    }
    
    // Apply status filter
    if (statusFilter) {
      allOrders = allOrders.filter(order => order.status === statusFilter);
    }
    
    // Apply orderType filter
    if (orderTypeFilter) {
      allOrders = allOrders.filter(order => {
        const type = order.orderType || order.type;
        return type === orderTypeFilter;
      });
    }

    // Fetch order items for each order
    const ordersWithItems = await Promise.all(
      allOrders.map(async (order) => {
        try {
          // Try Query first, fall back to Scan if needed
          let items = [];
          try {
            const queryParams = {
              TableName: TABLES.ORDER_ITEMS,
              KeyConditionExpression: "orderId = :oid",
              ExpressionAttributeValues: { ":oid": { S: order.orderId } },
            };
            
            // MULTI-TENANT: Add restaurantId filter if available
            if (restaurantId) {
              addRestaurantIdFilter(queryParams, restaurantId);
            }
            
            const queryResult = await ddb.send(new QueryCommand(queryParams));
            items = (queryResult.Items || []).map(unmarshall);
          } catch (e) {
            // Fall back to Scan with filter
            const scanParams = {
              TableName: TABLES.ORDER_ITEMS,
              FilterExpression: "orderId = :oid",
              ExpressionAttributeValues: { ":oid": { S: order.orderId } },
            };
            
            // MULTI-TENANT: Add restaurantId filter if available
            if (restaurantId) {
              addRestaurantIdFilter(scanParams, restaurantId);
            }
            
            const scanItemsResult = await ddb.send(new ScanCommand(scanParams));
            items = (scanItemsResult.Items || []).map(unmarshall);
          }
          
          // MULTI-TENANT: Lazy inject restaurantId into order items if missing
          if (restaurantId) {
            items = injectRestaurantIdBatch(items, restaurantId);
          }

          // Format items summary (modifiers are already included in item.name from vapiOrderWebhook)
          const itemsSummary = items
            .map((item) => `${item.quantity || 1}x ${item.name}`)
            .join(", ");

          // Handle different field name variations with safe defaults
          const orderTotal = typeof order.total === 'number' 
            ? order.total 
            : (parseFloat(order.total) || parseFloat(order.cost) || 0);
          const orderType = order.orderType || order.type || "pickup";
          const orderStatus = order.status || "new";
          
          // Parse ETA fields - ensure they are numbers
          const etaMinMinutes = typeof order.etaMinMinutes === 'number' 
            ? order.etaMinMinutes 
            : (order.etaMinMinutes ? parseInt(order.etaMinMinutes, 10) : null);
          const etaMaxMinutes = typeof order.etaMaxMinutes === 'number' 
            ? order.etaMaxMinutes 
            : (order.etaMaxMinutes ? parseInt(order.etaMaxMinutes, 10) : null);
          const etaText = order.etaText || null;
          
          return {
            id: order.orderId,
            orderId: order.orderId,
            orderNumber: order.orderNumber || null, // Sequential display number (e.g., 1001)
            time: order.createdAt, // Keep as ISO string for JSON serialization
            items: itemsSummary || "No items",
            total: orderTotal,
            status: orderStatus,
            phone: order.customer?.phone || order.phone || "",
            name: order.customer?.name || order.name || "",
            email: order.customer?.email || order.email || "",
            type: orderType,
            orderType: orderType,
            address: order.customer?.address || order.address || "",
            table: order.customer?.table || order.table || "",
            instructions: order.customer?.instructions || order.instructions || "",
            addressStatus: order.addressStatus || "",
            callbackPhone: order.callbackPhone || "",
            subtotal: order.subtotal || 0,
            tax: order.tax || 0,
            tip: order.tip || 0,
            createdAt: order.createdAt,
            createdAtMs: order.createdAtMs,
            etaMinMinutes: etaMinMinutes,
            etaMaxMinutes: etaMaxMinutes,
            etaText: etaText,
            orderItems: items,
          };
        } catch (error) {
          console.error(`Error fetching items for order ${order.orderId}:`, error);
          // Return order with safe defaults even on error
          const orderTotal = typeof order.total === 'number' 
            ? order.total 
            : (parseFloat(order.total) || parseFloat(order.cost) || 0);
          const orderType = order.orderType || order.type || "pickup";
          const orderStatus = order.status || "new";
          
          const etaMinMinutes = typeof order.etaMinMinutes === 'number' 
            ? order.etaMinMinutes 
            : (order.etaMinMinutes ? parseInt(order.etaMinMinutes, 10) : null);
          const etaMaxMinutes = typeof order.etaMaxMinutes === 'number' 
            ? order.etaMaxMinutes 
            : (order.etaMaxMinutes ? parseInt(order.etaMaxMinutes, 10) : null);
          const etaText = order.etaText || null;
          
          return {
            id: order.orderId,
            orderId: order.orderId,
            orderNumber: order.orderNumber || null,
            time: order.createdAt,
            items: "Error loading items",
            total: orderTotal,
            status: orderStatus,
            phone: order.customer?.phone || order.phone || "",
            name: order.customer?.name || order.name || "",
            email: order.customer?.email || order.email || "",
            type: orderType,
            orderType: orderType,
            createdAt: order.createdAt,
            createdAtMs: order.createdAtMs,
            etaMinMinutes: etaMinMinutes,
            etaMaxMinutes: etaMaxMinutes,
            etaText: etaText,
            addressStatus: order.addressStatus || "",
            callbackPhone: order.callbackPhone || "",
            orderItems: [],
          };
        }
      })
    );

    // Sort by creation time (newest first)
    ordersWithItems.sort((a, b) => b.createdAtMs - a.createdAtMs);

    // Calculate total revenue for the period (exclude cancelled/refunded orders)
    const NON_REVENUE_STATUSES = new Set(['cancelled', 'refunded', 'failed']);
    const totalRevenue = ordersWithItems.reduce(
      (sum, order) => sum + (NON_REVENUE_STATUSES.has(order.status) ? 0 : (order.total || 0)),
      0
    );

    // Build response
    const response = {
      orders: ordersWithItems,
      totalRevenue,
      count: ordersWithItems.length,
      dateRange: {
        from: startDate ? startDate.toISOString() : null,
        to: endDate ? endDate.toISOString() : null,
        days: startDate && endDate 
          ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      },
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("GetOrders error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
