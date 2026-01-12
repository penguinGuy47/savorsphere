import { DynamoDBClient, PutItemCommand, BatchWriteItemCommand, GetItemCommand, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdForWrite } from '../utils/inject-restaurant-id.mjs';
import { generateOrderId, getNextOrderNumber } from '../utils/order-number.mjs';
import { isPizzaMenuItem, calculatePizzaPriceCents } from '../utils/pizza-pricing.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  ORDERS: "Orders",
  ORDER_ITEMS: "OrderItems",
  PAYMENTS: "Payments",
  SETTINGS: "RestaurantSettings",
  MENU_ITEMS: "MenuItems",
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Batch fetch menu items by itemId (up to 100 items, batched in groups of 25)
 */
async function batchGetMenuItems(itemIds) {
  if (!itemIds || itemIds.length === 0) return {};

  const uniqueIds = [...new Set(itemIds.map(id => String(id)))];
  const menuItemsMap = {};

  // BatchGetItem allows max 100 keys per request, but we'll do 25 at a time
  for (let i = 0; i < uniqueIds.length; i += 25) {
    const slice = uniqueIds.slice(i, i + 25);
    const Keys = slice.map(id => ({ itemId: { S: id } }));

    try {
      const result = await ddb.send(new BatchGetItemCommand({
        RequestItems: {
          [TABLES.MENU_ITEMS]: { Keys },
        },
      }));

      const items = result.Responses?.[TABLES.MENU_ITEMS] || [];
      for (const item of items) {
        const unmarshalled = unmarshall(item);
        menuItemsMap[unmarshalled.itemId] = unmarshalled;
      }
    } catch (error) {
      console.error("BatchGetMenuItems error for slice:", slice, error);
    }
  }

  return menuItemsMap;
}

/**
 * Calculate price for an order item.
 * - For v2 pizza items: use pizzaDetails + pricingRules
 * - For v1 items: use client-provided price (menu item price as fallback)
 */
function calculateItemPrice(orderItem, menuItem) {
  const quantity = toNumber(orderItem.quantity, 1);

  if (menuItem && isPizzaMenuItem(menuItem)) {
    // V2 Pizza: Calculate server-side from pizzaDetails
    const pizzaDetails = orderItem.pizzaDetails || {};
    const pricingResult = calculatePizzaPriceCents(pizzaDetails, menuItem.pricingRules);
    
    return {
      unitPriceCents: pricingResult.totalCents,
      unitPrice: pricingResult.totalCents / 100,
      linePrice: (pricingResult.totalCents / 100) * quantity,
      pricingBreakdown: pricingResult.breakdown,
      pizzaDetails,
      isPizza: true,
    };
  }

  // V1 flat item: trust client price but fallback to menu price
  const unitPrice = toNumber(orderItem.price, menuItem?.price || 0);
  return {
    unitPriceCents: Math.round(unitPrice * 100),
    unitPrice,
    linePrice: unitPrice * quantity,
    pricingBreakdown: null,
    pizzaDetails: null,
    isPizza: false,
  };
}

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-restaurant-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle preflight
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '{}' };
  }

  try {
    const body = event?.body ? JSON.parse(event.body) : {};
    
    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);
    
    const {
      items = [],
      tip = 0,
      orderType = "pickup",
      name = "",
      phone = "",
      email = "",
      address = "",
      table = "",
      instructions = "",
      paymentId,
    } = body;

    // Load settings to compute tax and ETA
    const settingId = restaurantId 
      ? (restaurantId.startsWith('restaurant-config') ? restaurantId : `restaurant-config-${restaurantId}`)
      : "restaurant-config";
    
    const settingsRes = await ddb.send(
      new GetItemCommand({
        TableName: TABLES.SETTINGS,
        Key: { settingId: { S: settingId } },
      })
    );
    const settings = settingsRes.Item ? unmarshall(settingsRes.Item) : {};
    const taxRate = toNumber(settings?.taxRate, 0);
    const etaMinutes = toNumber(settings?.etaMinutes ?? settings?.defaultEtaMinutes, 30);

    // Batch fetch menu items for all ordered itemIds
    const itemIds = items.map(it => it.itemId).filter(Boolean);
    const menuItemsMap = await batchGetMenuItems(itemIds);
    console.log("MenuItemsMap loaded:", Object.keys(menuItemsMap).length, "items");

    // Process each order item with server-side pricing
    const processedItems = items.map((orderItem, idx) => {
      const menuItem = menuItemsMap[String(orderItem.itemId)];
      const priceCalc = calculateItemPrice(orderItem, menuItem);
      
      return {
        ...orderItem,
        itemId: String(orderItem.itemId ?? `item-${idx}`),
        name: orderItem.name || menuItem?.name || 'Unknown Item',
        quantity: toNumber(orderItem.quantity, 1),
        // Server-computed prices
        price: priceCalc.unitPrice,
        priceCents: priceCalc.unitPriceCents,
        linePrice: priceCalc.linePrice,
        // Pizza-specific
        isPizza: priceCalc.isPizza,
        pizzaDetails: priceCalc.pizzaDetails,
        pricingBreakdown: priceCalc.pricingBreakdown,
      };
    });

    // Server-side total calculation
    const subtotal = processedItems.reduce((sum, it) => sum + it.linePrice, 0);
    const tax = subtotal * (taxRate / 100);
    const tipAmount = toNumber(tip, 0);
    const total = +(subtotal + tax + tipAmount).toFixed(2);

    // Generate unique orderId and sequential orderNumber
    const orderId = generateOrderId();
    const orderNumber = await getNextOrderNumber(restaurantId);
    const createdAt = new Date().toISOString();

    // Persist order header
    let orderRecord = {
      orderId,
      orderNumber,
      createdAt,
      status: "paid",
      orderType,
      subtotal: +subtotal.toFixed(2),
      tax: +tax.toFixed(2),
      tip: +tipAmount.toFixed(2),
      total,
      taxRate,
      etaMinutes,
      paymentId,
      customer: { name, phone, email, address, table, instructions },
      itemCount: processedItems.length,
      hasPizzaItems: processedItems.some(it => it.isPizza),
    };
    
    if (restaurantId) {
      orderRecord = injectRestaurantIdForWrite(orderRecord, restaurantId);
    }

    await ddb.send(
      new PutItemCommand({
        TableName: TABLES.ORDERS,
        Item: marshall(orderRecord, { removeUndefinedValues: true }),
      })
    );

    // Persist order items with pizza details
    if (processedItems.length > 0) {
      for (let i = 0; i < processedItems.length; i += 25) {
        const slice = processedItems.slice(i, i + 25);
        const RequestItems = {
          [TABLES.ORDER_ITEMS]: slice.map((it, idx) => {
            let orderItem = {
              orderId,
              lineItemId: `${orderId}-${i + idx}`, // Unique line item ID
              itemId: it.itemId,
              name: it.name,
              price: it.price,
              priceCents: it.priceCents,
              quantity: it.quantity,
              linePrice: it.linePrice,
            };

            // Include pizza details if present
            if (it.isPizza && it.pizzaDetails) {
              orderItem.isPizza = true;
              orderItem.pizzaDetails = it.pizzaDetails;
              orderItem.pricingBreakdown = it.pricingBreakdown;
            }
            
            if (restaurantId) {
              orderItem = injectRestaurantIdForWrite(orderItem, restaurantId);
            }
            
            return {
              PutRequest: {
                Item: marshall(orderItem, { removeUndefinedValues: true }),
              },
            };
          }),
        };
        await ddb.send(new BatchWriteItemCommand({ RequestItems }));
      }
    }

    // Persist payment
    if (paymentId) {
      let paymentRecord = {
        paymentId,
        orderId,
        amount: total,
        currency: "usd",
        status: "succeeded",
        createdAt,
      };
      
      if (restaurantId) {
        paymentRecord = injectRestaurantIdForWrite(paymentRecord, restaurantId);
      }
      
      await ddb.send(
        new PutItemCommand({
          TableName: TABLES.PAYMENTS,
          Item: marshall(paymentRecord, { removeUndefinedValues: true }),
        })
      );
    }

    console.log("Order created:", { orderId, orderNumber, total, itemCount: processedItems.length });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        orderId, 
        orderNumber, 
        subtotal: +subtotal.toFixed(2),
        tax: +tax.toFixed(2),
        tip: +tipAmount.toFixed(2),
        total, 
        etaMinutes,
        items: processedItems.map(it => ({
          itemId: it.itemId,
          name: it.name,
          quantity: it.quantity,
          price: it.price,
          linePrice: it.linePrice,
          isPizza: it.isPizza,
        })),
      }),
    };
  } catch (error) {
    console.error("CreateOrder error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
