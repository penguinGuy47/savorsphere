import { DynamoDBClient, ScanCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdBatch, addRestaurantIdFilter } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  ORDERS: "Orders",
  ORDER_ITEMS: "OrderItems",
};

export const handler = async (event) => {
  // CORS headers for all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle CORS preflight requests (check both HTTP API and REST API formats)
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
    
    // Get query parameters
    const queryParams = event?.queryStringParameters || {};
    const dateFilter = queryParams.date; // Optional: filter by date (YYYY-MM-DD)
    const statusFilter = queryParams.status; // Optional: filter by status
    const orderTypeFilter = queryParams.orderType; // Optional: filter by orderType

    // Calculate today's date range (for filtering after scan)
    const today = dateFilter ? new Date(dateFilter) : new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Scan all orders (we'll filter in JavaScript for flexibility)
    // This allows us to handle different field name variations
    const scanParams = {
      TableName: TABLES.ORDERS,
    };
    
    // MULTI-TENANT: Add restaurantId filter if available
    if (restaurantId) {
      addRestaurantIdFilter(scanParams, restaurantId);
    }

    const scanResult = await ddb.send(new ScanCommand(scanParams));
    let orders = (scanResult.Items || []).map(unmarshall);
    
    // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
    if (restaurantId) {
      orders = injectRestaurantIdBatch(orders, restaurantId);
    }
    
    // Normalize field names to handle different schemas
    orders = orders.map(order => {
      // Map date field: use createdAt if exists, otherwise date, otherwise today
      if (!order.createdAt && order.date) {
        order.createdAt = order.date;
      } else if (!order.createdAt) {
        // If no date field at all, set to today so it shows up
        order.createdAt = new Date().toISOString();
      }
      
      // Map total field: use total if exists, otherwise cost
      if (!order.total && order.cost !== undefined) {
        order.total = typeof order.cost === 'number' ? order.cost : parseFloat(order.cost) || 0;
      }
      
      // Map orderType field: use orderType if exists, otherwise type
      if (!order.orderType && order.type) {
        order.orderType = order.type;
      }
      
      // Ensure status exists
      if (!order.status) {
        order.status = 'new';
      }
      
      return order;
    });
    
    // Apply filters in JavaScript (more flexible than DynamoDB FilterExpression)
    // Default to today's orders, but include orders with invalid/unparseable dates
    orders = orders.filter(order => {
      if (!order.createdAt) return true; // Include orders without date
      
      try {
        const orderDate = new Date(order.createdAt);
        // If date is invalid, include it anyway (might be old data format)
        if (isNaN(orderDate.getTime())) {
          return true;
        }
        return orderDate >= startOfDay && orderDate <= endOfDay;
      } catch (e) {
        // If parsing fails, include the order anyway
        return true;
      }
    });
    
    if (statusFilter) {
      orders = orders.filter(order => order.status === statusFilter);
    }
    
    if (orderTypeFilter) {
      orders = orders.filter(order => {
        const type = order.orderType || order.type;
        return type === orderTypeFilter;
      });
    }

    // Fetch order items for each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
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

          // Format items summary
          const itemsSummary = items
            .map((item) => `${item.quantity}x ${item.name}`)
            .join(", ");

          // Handle different field name variations
          const orderTotal = order.total || order.cost || 0;
          const orderType = order.orderType || order.type || "pickup";
          const orderStatus = order.status || "new";
          const createdAt = order.createdAt || order.date || new Date().toISOString();
          
          return {
            id: order.orderId,
            orderId: order.orderId,
            time: new Date(createdAt),
            items: itemsSummary || "No items",
            total: typeof orderTotal === 'number' ? orderTotal : parseFloat(orderTotal) || 0,
            status: orderStatus,
            phone: order.customer?.phone || order.phone || "",
            name: order.customer?.name || order.name || "",
            email: order.customer?.email || order.email || "",
            type: orderType,
            address: order.customer?.address || order.address || "",
            table: order.customer?.table || order.table || "",
            instructions: order.customer?.instructions || order.instructions || "",
            subtotal: order.subtotal || 0,
            tax: order.tax || 0,
            tip: order.tip || 0,
            createdAt: createdAt,
            orderItems: items,
          };
        } catch (error) {
          console.error(`Error fetching items for order ${order.orderId}:`, error);
          // Handle different field name variations
          const orderTotal = order.total || order.cost || 0;
          const orderType = order.orderType || order.type || "pickup";
          const orderStatus = order.status || "new";
          const createdAt = order.createdAt || order.date || new Date().toISOString();
          
          return {
            id: order.orderId,
            orderId: order.orderId,
            time: new Date(createdAt),
            items: "Error loading items",
            total: typeof orderTotal === 'number' ? orderTotal : parseFloat(orderTotal) || 0,
            status: orderStatus,
            phone: order.customer?.phone || order.phone || "",
            name: order.customer?.name || order.name || "",
            email: order.customer?.email || order.email || "",
            type: orderType,
            createdAt: createdAt,
            orderItems: [],
          };
        }
      })
    );

    // Sort by creation time (newest first)
    ordersWithItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Calculate total revenue for today
    const totalRevenue = ordersWithItems.reduce((sum, order) => sum + (order.total || 0), 0);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        orders: ordersWithItems,
        totalRevenue,
        count: ordersWithItems.length,
      }),
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

