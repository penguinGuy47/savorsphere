import { DynamoDBClient, PutItemCommand, BatchWriteItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdForWrite } from '../utils/inject-restaurant-id.mjs';
import { generateOrderId, getNextOrderNumber } from '../utils/order-number.mjs';


const ddb = new DynamoDBClient({ region: "us-east-2" });


const TABLES = {
 ORDERS: "Orders",
 ORDER_ITEMS: "OrderItems",
 SETTINGS: "RestaurantSettings",
};


// ============================================
// VAPI RESPONSE HELPERS
// Vapi expects HTTP 200 with { results: [...] }
// Any other status code is IGNORED completely
// ============================================

/**
 * Remove line breaks from strings (Vapi parsing requirement)
 */
function toSingleLine(s) {
  return String(s ?? "").replace(/\r?\n/g, " ").trim();
}


/**
 * Extract toolCallId from submit_order tool call in request body
 */
function extractSubmitOrderToolCallId(body) {
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;

    // Direct toolCallId in body (some Vapi configurations)
    if (parsed?.toolCallId) return parsed.toolCallId;

    const toolCalls = parsed?.message?.toolCalls;
    if (Array.isArray(toolCalls) && toolCalls[0]?.id) return toolCalls[0].id;

    const toolCallList = parsed?.message?.toolCallList;
    if (Array.isArray(toolCallList) && toolCallList[0]?.id) return toolCallList[0].id;

    const toolWithToolCallList = parsed?.message?.toolWithToolCallList;
    if (Array.isArray(toolWithToolCallList)) {
      const entry = toolWithToolCallList[0];
      const tc = entry?.toolCall || entry;
      if (tc?.id) return tc.id;
    }

    return null;
  } catch (e) {
    return null;
  }
}


/**
 * Build a Vapi-compatible tool response
 * CRITICAL: Always returns HTTP 200 - Vapi ignores any other status code
 */
function vapiToolResponse({ toolCallId, result, error }) {
  const entry = {};
  if (toolCallId) entry.toolCallId = toolCallId;

  if (error) {
    entry.error = toSingleLine(error);
  } else if (typeof result === "string") {
    entry.result = { ok: true, message: toSingleLine(result) };
  } else {
    const payload = result && typeof result === "object" ? { ...result } : {};
    if (payload.ok == null) payload.ok = true;
    entry.result = payload;
  }

  return {
    statusCode: 200, // IMPORTANT: always 200 or Vapi ignores the response
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify({ results: [entry] }),
  };
}


// ============================================
// PRICING CONFIGURATION (Server-Side Pricing)
// ============================================

const PRICING = {
  // Base prices by size (in cents)
  basePriceCents: {
    Personal: 1199,
    Small: 1499,
    Medium: 1799,
    Large: 2099,
  },
  // Topping prices by size (in cents)
  toppingPriceCents: {
    Personal: 100,
    Small: 150,
    Medium: 250,
    Large: 350,
  },
  // Crust surcharges (in cents)
  crustSurchargeCents: {
    Thin: 0,
    Regular: 0,
    Double: 200,
    Stuffed: 200,
    "Gluten-Free": 0, // Gluten-Free has a flat base, not a surcharge
  },
  // Gluten-Free special pricing: only allowed for Small, flat base price
  glutenFreeBaseCents: 1600, // $16.00 flat for GF (Small only)
  glutenFreeAllowedSizes: ["Small"],
  // Sides pricing (in cents)
  sidesPriceCents: {
    Fries: 499,
    "Garlic Knots": 599,
    "Wings (6pc)": 899,
    "Wings (12pc)": 1599,
    Wings: 899, // Default to 6pc
    "Breadsticks": 499,
    "Cheesy Bread": 699,
    "Mozzarella Sticks": 799,
  },
  // Default side price if not found
  defaultSidePriceCents: 499,
  // Modifiers that add extra cost (in cents)
  modifierExtraCostCents: {
    "extra cheese": 0, // Charged as a topping
    "extra sauce": 0, // No extra charge
  },
  // Delivery fee (in cents)
  deliveryFeeCents: 300,
};

// Modifiers that count as extra toppings (charge topping price)
const EXTRA_CHARGE_MODIFIERS = ["extra cheese"];


function toNumber(value, fallback = 0) {
 const n = Number(value);
 return Number.isFinite(n) ? n : fallback;
}


/**
 * Parse a topping string that may have a portion tag
 * e.g., "Pepperoni|extra" -> { name: "Pepperoni", portion: "extra", onTopOnly: false }
 *       "Mushrooms|light" -> { name: "Mushrooms", portion: "light", onTopOnly: false }
 *       "Onions|onTop"    -> { name: "Onions", portion: "regular", onTopOnly: true }
 *       "Sausage"         -> { name: "Sausage", portion: "regular", onTopOnly: false }
 */
function parseTopping(toppingStr) {
  if (!toppingStr || typeof toppingStr !== "string") {
    return { name: String(toppingStr || ""), portion: "regular", onTopOnly: false };
  }
  
  const parts = toppingStr.split("|");
  const name = parts[0].trim();
  let portion = "regular";
  let onTopOnly = false;
  
  for (let i = 1; i < parts.length; i++) {
    const tag = parts[i].toLowerCase().trim();
    if (tag === "extra") portion = "extra";
    else if (tag === "light") portion = "light";
    else if (tag === "no") portion = "no";
    else if (tag === "ontop" || tag === "on top") onTopOnly = true;
  }
  
  return { name, portion, onTopOnly };
}


/**
 * Calculate the price of a single pizza (in cents)
 */
function calculatePizzaPriceCents(pizza) {
  const size = pizza.size || "Medium";
  const crust = pizza.crust || "Thin";
  
  let baseCents = PRICING.basePriceCents[size] || PRICING.basePriceCents.Medium;
  let crustSurcharge = PRICING.crustSurchargeCents[crust] || 0;
  
  // Special handling for Gluten-Free
  if (crust === "Gluten-Free") {
    if (!PRICING.glutenFreeAllowedSizes.includes(size)) {
      // If GF requested for wrong size, we still accept but log a warning
      console.warn(`[Pricing] Gluten-Free crust requested for ${size}, but only allowed for ${PRICING.glutenFreeAllowedSizes.join(", ")}. Charging GF base anyway.`);
    }
    baseCents = PRICING.glutenFreeBaseCents;
    crustSurcharge = 0; // No additional surcharge for GF
  }
  
  // Calculate topping cost
  const toppingPricePerItem = PRICING.toppingPriceCents[size] || PRICING.toppingPriceCents.Medium;
  let toppingsCents = 0;
  
  // Helper to count topping cost
  const addToppingCost = (toppingStr) => {
    const parsed = parseTopping(toppingStr);
    if (parsed.portion === "no") return 0; // No charge for removed toppings
    if (parsed.portion === "extra") return toppingPricePerItem * 2; // Double charge
    return toppingPricePerItem; // Regular or light = 1x charge
  };
  
  // Whole toppings
  const wholeToppings = pizza.wholeToppings || [];
  for (const t of wholeToppings) {
    toppingsCents += addToppingCost(t);
  }
  
  // Half toppings count as full topping charge
  const leftHalfToppings = pizza.leftHalfToppings || [];
  for (const t of leftHalfToppings) {
    toppingsCents += addToppingCost(t);
  }
  
  const rightHalfToppings = pizza.rightHalfToppings || [];
  for (const t of rightHalfToppings) {
    toppingsCents += addToppingCost(t);
  }
  
  // Check modifiers for extra charges
  const modifiers = pizza.modifiers || [];
  for (const mod of modifiers) {
    const modLower = (mod || "").toLowerCase().trim();
    if (EXTRA_CHARGE_MODIFIERS.includes(modLower)) {
      // "extra cheese" counts as an extra topping
      toppingsCents += toppingPricePerItem;
    }
  }
  
  const totalCents = baseCents + crustSurcharge + toppingsCents;
  
  return {
    baseCents,
    crustSurcharge,
    toppingsCents,
    totalCents,
  };
}


/**
 * Calculate the price of a side item (in cents)
 */
function calculateSidePriceCents(side) {
  const name = (side.name || "").trim();
  const quantity = toNumber(side.quantity, 1);
  
  // Try exact match first
  let unitPriceCents = PRICING.sidesPriceCents[name];
  
  // If not found, try case-insensitive match
  if (unitPriceCents === undefined) {
    const nameLower = name.toLowerCase();
    for (const [key, price] of Object.entries(PRICING.sidesPriceCents)) {
      if (key.toLowerCase() === nameLower) {
        unitPriceCents = price;
        break;
      }
    }
  }
  
  // If still not found, use default
  if (unitPriceCents === undefined) {
    console.warn(`[Pricing] Unknown side item: "${name}", using default price`);
    unitPriceCents = PRICING.defaultSidePriceCents;
  }
  
  return {
    unitPriceCents,
    quantity,
    totalCents: unitPriceCents * quantity,
  };
}


/**
 * Format topping for display (strip tags, add descriptors)
 */
function formatToppingForDisplay(toppingStr) {
  const parsed = parseTopping(toppingStr);
  if (parsed.portion === "no") return null; // Don't display removed toppings
  
  let display = parsed.name;
  if (parsed.portion === "extra") display = `Extra ${parsed.name}`;
  else if (parsed.portion === "light") display = `Light ${parsed.name}`;
  if (parsed.onTopOnly) display += " (on top)";
  
  return display;
}


/**
* Transform VAPI pizza payload into order items with server-calculated price
*/
function transformPizzaToItem(pizza, index) {
  // Calculate price server-side
  const pricing = calculatePizzaPriceCents(pizza);
  const priceCents = pricing.totalCents;
  
  const parts = [];
  // Base pizza description
  parts.push(`${pizza.size || "Medium"} Pizza`);
  
  const crust = pizza.crust || "Thin";
  if (crust && crust !== "Thin" && crust !== "Regular") {
    parts.push(`(${crust} crust)`);
  }
  
  // Handle toppings - format for display
  const wholeToppings = (pizza.wholeToppings || [])
    .map(formatToppingForDisplay)
    .filter(Boolean);
  const leftHalfToppings = (pizza.leftHalfToppings || [])
    .map(formatToppingForDisplay)
    .filter(Boolean);
  const rightHalfToppings = (pizza.rightHalfToppings || [])
    .map(formatToppingForDisplay)
    .filter(Boolean);
  
  if (wholeToppings.length > 0) {
    parts.push(`with ${wholeToppings.join(", ")}`);
  }
  
  if (leftHalfToppings.length > 0) {
    parts.push(`Left: ${leftHalfToppings.join(", ")}`);
  }
  
  if (rightHalfToppings.length > 0) {
    parts.push(`Right: ${rightHalfToppings.join(", ")}`);
  }
  
  // Add modifiers to display name
  const modifiers = pizza.modifiers || [];
  if (modifiers.length > 0) {
    parts.push(`[${modifiers.join(", ")}]`);
  }
  
  const name = parts.join(" ");
  
  // Parse toppings into structured format for storage
  const parsedWholeToppings = (pizza.wholeToppings || []).map(parseTopping);
  const parsedLeftHalfToppings = (pizza.leftHalfToppings || []).map(parseTopping);
  const parsedRightHalfToppings = (pizza.rightHalfToppings || []).map(parseTopping);
  
  return {
    itemId: `pizza_${index}`,
    name,
    price: priceCents / 100, // Convert cents to dollars
    priceCents, // Also store cents for precision
    quantity: 1,
    pizzaDetails: {
      size: pizza.size || "Medium",
      crust: crust,
      wholeToppings: parsedWholeToppings,
      leftHalfToppings: parsedLeftHalfToppings,
      rightHalfToppings: parsedRightHalfToppings,
      // Raw topping strings for backward compatibility
      rawWholeToppings: pizza.wholeToppings || [],
      rawLeftHalfToppings: pizza.leftHalfToppings || [],
      rawRightHalfToppings: pizza.rightHalfToppings || [],
    },
    modifiers: modifiers,
    notes: pizza.notes || "",
    // Pricing breakdown for transparency
    pricingBreakdown: {
      baseCents: pricing.baseCents,
      crustSurcharge: pricing.crustSurcharge,
      toppingsCents: pricing.toppingsCents,
    },
  };
}


/**
* Transform VAPI sides payload into order items with server-calculated price
*/
function transformSideToItem(side, index) {
  // Calculate price server-side
  const pricing = calculateSidePriceCents(side);
  const quantity = pricing.quantity;
  const priceCents = pricing.unitPriceCents; // Unit price
  const totalCents = pricing.totalCents;
  
  return {
    itemId: `side_${index}`,
    name: side.name || "Side Item",
    price: priceCents / 100, // Unit price in dollars
    priceCents, // Unit price in cents
    quantity: quantity,
    totalPriceCents: totalCents, // Total for this line item
  };
}


/**
* Extract order arguments from VAPI webhook body
*/
function extractOrderArguments(body) {
 let parsedBody;
  // Parse body if it's a string
 if (typeof body === "string") {
   try {
     parsedBody = JSON.parse(body);
   } catch (e) {
     throw new Error(`Failed to parse body: ${e.message}`);
   }
 } else {
   parsedBody = body;
 }

  // NOTE: When Vapi uses a "function tool" with a server URL, it typically POSTs the
  // tool arguments as the raw JSON body (NOT wrapped in message.toolCalls).
  // Support both formats:
  // - Direct args (tool call): { orderType, customerPhone, pizzas, sides, ... }
  // - Wrapped webhook payload: { message: { toolCalls: [...] }, ... }
  if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
    // Check for direct args - totalCents is no longer required (server calculates)
    const isDirectArgs =
      ("orderType" in parsedBody) &&
      ("customerPhone" in parsedBody) &&
      (("pizzas" in parsedBody) || ("sides" in parsedBody));

    if (isDirectArgs) {
      const args = parsedBody;

      // Normalize customerPhone to a string (avoid logging raw PII elsewhere)
      if (typeof args.customerPhone !== "string") {
        args.customerPhone = args.customerPhone == null ? "" : String(args.customerPhone);
      }

      return args;
    }
  }


 // Try to find submit_order tool call in various locations
 let toolCall = null;
 let foundIn = null;
  // Check message.toolCalls array
 if (parsedBody?.message?.toolCalls) {
   toolCall = parsedBody.message.toolCalls.find(
     tc => tc?.function?.name === "submit_order"
   );
   if (toolCall) foundIn = "message.toolCalls";
 }
  // Check message.toolCallList array
 if (!toolCall && parsedBody?.message?.toolCallList) {
   toolCall = parsedBody.message.toolCallList.find(
     tc => tc?.function?.name === "submit_order"
   );
   if (toolCall) foundIn = "message.toolCallList";
 }
  // Check message.toolWithToolCallList array
 if (!toolCall && parsedBody?.message?.toolWithToolCallList) {
   toolCall = parsedBody.message.toolWithToolCallList.find(
     tc => tc?.function?.name === "submit_order"
   );
   if (toolCall) foundIn = "message.toolWithToolCallList";
 }


 if (!toolCall) {
   // Log available structures for debugging
   const availablePaths = [];
   if (parsedBody?.message?.toolCalls) availablePaths.push(`message.toolCalls (${parsedBody.message.toolCalls.length} items)`);
   if (parsedBody?.message?.toolCallList) availablePaths.push(`message.toolCallList (${parsedBody.message.toolCallList.length} items)`);
   if (parsedBody?.message?.toolWithToolCallList) availablePaths.push(`message.toolWithToolCallList (${parsedBody.message.toolWithToolCallList.length} items)`);
  
   throw new Error(`No submit_order tool call found. Available paths: ${availablePaths.join(", ") || "none"}`);
 }
  console.log("[VAPI Order] Found tool call", { foundIn, functionName: toolCall.function?.name });


 // Extract arguments from tool call - check multiple possible locations
 let args = toolCall.function?.arguments;
  // If not found, check alternative locations
 if (!args) {
   args = toolCall.function?.parameters?.arguments;
 }
  // If still not found, check if arguments are at the toolCall level
 if (!args) {
   args = toolCall.arguments;
 }


 if (!args) {
   throw new Error("No arguments found in tool call");
 }
  // Parse arguments if they're a string
 if (typeof args === "string") {
   try {
     args = JSON.parse(args);
   } catch (e) {
     throw new Error(`Failed to parse tool call arguments: ${e.message}`);
   }
 }


 // Ensure args is an object
 if (typeof args !== "object" || args === null) {
   throw new Error(`Invalid arguments format: expected object, got ${typeof args}`);
 }


 // Try to extract customer phone from call metadata or transcript
 if (!args.customerPhone) {
   // Check call metadata
   if (parsedBody?.call?.metadata?.restaurantPhone) {
     // Could use restaurant phone as fallback, but better to leave empty
   }
  
   // Could parse from transcript if needed, but for now leave empty
   args.customerPhone = args.customerPhone || "";
 }


 return args;
}

function extractCallIdFromHeaders(headers) {
  if (!headers || typeof headers !== "object") return "";
  const key = Object.keys(headers).find((k) => k.toLowerCase() === "x-call-id");
  const value = key ? headers[key] : "";
  return value ? String(value).trim() : "";
}

function normalizePhone10(value) {
  if (!value) return "";
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits.length === 10 ? digits : "";
}


export const handler = async (event) => {
 const startTime = Date.now();
 
 // Extract toolCallId for Vapi response matching (must be done early)
 const toolCallId = extractSubmitOrderToolCallId(event.body);
 
  try {
   // Parse body and extract order arguments
   let args = {};
   try {
     args = extractOrderArguments(event.body);
   } catch (e) {
     console.error("[VAPI Order] Failed to extract order arguments:", e.message);
     console.log("[VAPI Order] Event structure:", {
       hasBody: !!event.body,
       bodyType: typeof event.body,
       bodyPreview: typeof event.body === "string" ? event.body.substring(0, 200) : "not a string",
     });
     return vapiToolResponse({
       toolCallId,
       error: `Failed to extract order data: ${e.message}`,
     });
   }


   console.log("[VAPI Order] Incoming order", {
     hasArguments: !!args,
     pizzasCount: Array.isArray(args.pizzas) ? args.pizzas.length : 0,
     sidesCount: Array.isArray(args.sides) ? args.sides.length : 0,
     orderType: args.orderType,
     totalCents: args.totalCents,
     customerPhone: args.customerPhone ? `${args.customerPhone.slice(0, 3)}***${args.customerPhone.slice(-4)}` : "none",
   });


   let {
     pizzas = [],
     sides = [],
     orderType = "pickup",
     customerPhone = "",
     deliveryAddress = "",
     addressStatus = "",
     callbackPhone = "",
     callId = "",
     reason = "",
     // Note: totalCents from VAPI is ignored - we calculate server-side
   } = args;

   const headerCallId = extractCallIdFromHeaders(event?.headers);
   if (headerCallId) {
     callId = headerCallId;
   }

   const normalizedAddressStatus = typeof addressStatus === "string" ? addressStatus.toLowerCase() : "";
   const needsCallback = normalizedAddressStatus === "unconfirmed";
   if (needsCallback && !callbackPhone && customerPhone) {
     callbackPhone = customerPhone;
   }

   const normalizedCustomerPhone = normalizePhone10(customerPhone);
   const normalizedCallbackPhone = normalizePhone10(callbackPhone);
   if (!normalizedCustomerPhone) {
     return vapiToolResponse({
       toolCallId,
       error: "Invalid customerPhone. Provide a 10-digit phone number.",
     });
   }
   customerPhone = normalizedCustomerPhone;
   if (callbackPhone && !normalizedCallbackPhone) {
     return vapiToolResponse({
       toolCallId,
       error: "Invalid callbackPhone. Provide a 10-digit phone number.",
     });
   }
   if (normalizedCallbackPhone) {
     callbackPhone = normalizedCallbackPhone;
   }


   // MULTI-TENANT: Extract restaurantId from event context or body metadata
   let restaurantId = extractRestaurantId(event);
  
   // Also check body metadata if not found in event
   if (!restaurantId && event.body) {
     try {
       const parsedBody = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
       restaurantId = parsedBody?.call?.metadata?.restaurantId ||
                      parsedBody?.assistant?.metadata?.restaurantId ||
                      parsedBody?.assistantId;
     } catch (e) {
       // Ignore parsing errors, use fallback
     }
   }
  
   restaurantId = restaurantId || "test-001";


   // Validate that we have items (unless this is a placeholder callback order)
   const hasPizzas = Array.isArray(pizzas) && pizzas.length > 0;
   const hasSides = Array.isArray(sides) && sides.length > 0;

   if (needsCallback) {
     const normalizedCallId = String(callId || "").trim();
     const normalizedDeliveryAddress = String(deliveryAddress || "").trim();
     
     if (!normalizedCallbackPhone) {
       return vapiToolResponse({
         toolCallId,
         error: "Invalid callbackPhone. Provide a 10-digit phone number.",
       });
     }
     
     if (!normalizedCallId) {
       return vapiToolResponse({
         toolCallId,
         error: "Missing callId for address-unconfirmed placeholder order.",
       });
     }
     callId = normalizedCallId;
     
     if (normalizedDeliveryAddress) {
       return vapiToolResponse({
         toolCallId,
         error: "deliveryAddress must be empty for address-unconfirmed placeholder orders.",
       });
     }
     
     if (orderType !== "delivery") {
       return vapiToolResponse({
         toolCallId,
         error: "orderType must be delivery for address-unconfirmed placeholder orders.",
       });
     }
   }
  
   if (!hasPizzas && !hasSides && !needsCallback) {
     console.error("[VAPI Order] Validation failed: No items found in arguments", {
       pizzas: pizzas,
       sides: sides,
       args: args,
     });
     return vapiToolResponse({
       toolCallId,
       error: "No items found in order. Please add at least one pizza or side.",
     });
   }


   let callbackOrderId = null;
   
   // Transform VAPI payload into items format with server-calculated prices
   const items = [
     ...(hasPizzas ? pizzas.map((pizza, idx) => transformPizzaToItem(pizza, idx)) : []),
     ...(hasSides ? sides.map((side, idx) => transformSideToItem(side, idx)) : []),
   ];


   console.log("[VAPI Order] Transformed items with pricing", {
     totalItems: items.length,
     items: items.map(item => ({
       name: item.name,
       price: `$${item.price.toFixed(2)}`,
       quantity: item.quantity,
       modifiers: item.modifiers || [],
       notes: item.notes || "",
     })),
   });


   // Placeholder order: create a callback record without pricing or items
   if (needsCallback) {
     const normalizedCallId = String(callId || "").trim();
     
     callbackOrderId = `vapi_callback_${restaurantId}_${normalizedCallId}`;
     
     const existing = await ddb.send(
       new GetItemCommand({
         TableName: TABLES.ORDERS,
         Key: { orderId: { S: callbackOrderId } },
       })
     );
     
     if (existing.Item) {
       const existingOrder = unmarshall(existing.Item);
       return vapiToolResponse({
         toolCallId,
         result: {
           orderId: existingOrder.orderId,
           orderNumber: existingOrder.orderNumber || null,
           status: existingOrder.status || "needs_callback",
           addressStatus: existingOrder.addressStatus || "unconfirmed",
           callbackPhone: existingOrder.callbackPhone || normalizedCallbackPhone,
         },
       });
     }
     
     if (!hasPizzas && !hasSides) {
       const orderNumber = await getNextOrderNumber(restaurantId);
       const createdAt = new Date().toISOString();
       
       let placeholderRecord = {
         orderId: callbackOrderId,
         orderNumber,
         createdAt,
         status: "needs_callback",
         orderType: "delivery",
         subtotal: 0,
         deliveryFee: 0,
         tax: 0,
         tip: 0,
         total: 0,
         taxRate: 0,
         customer: {
           name: "",
           phone: customerPhone,
           email: "",
           address: "",
           table: "",
           instructions: "",
         },
         addressStatus: "unconfirmed",
         callbackPhone: normalizedCallbackPhone,
         callId: normalizedCallId,
         reason: reason || undefined,
         source: "vapi",
       };
       
       if (restaurantId) {
         placeholderRecord = injectRestaurantIdForWrite(placeholderRecord, restaurantId);
       }
       
       try {
         await ddb.send(
           new PutItemCommand({
             TableName: TABLES.ORDERS,
             Item: marshall(placeholderRecord, { removeUndefinedValues: true }),
             ConditionExpression: "attribute_not_exists(orderId)",
           })
         );
       } catch (error) {
         if (error?.name === "ConditionalCheckFailedException") {
           const existingFallback = await ddb.send(
             new GetItemCommand({
               TableName: TABLES.ORDERS,
               Key: { orderId: { S: callbackOrderId } },
             })
           );
           if (existingFallback.Item) {
             const existingOrder = unmarshall(existingFallback.Item);
             return vapiToolResponse({
               toolCallId,
               result: {
                 orderId: existingOrder.orderId,
                 orderNumber: existingOrder.orderNumber || null,
                 status: existingOrder.status || "needs_callback",
                 addressStatus: existingOrder.addressStatus || "unconfirmed",
                 callbackPhone: existingOrder.callbackPhone || normalizedCallbackPhone,
               },
             });
           }
         }
         console.error("[VAPI Order] Placeholder PutItem failed", {
           error: error?.message || String(error),
         });
         return vapiToolResponse({
           toolCallId,
           error: "Failed to create placeholder order.",
         });
       }
       
       return vapiToolResponse({
         toolCallId,
         result: {
           orderId: callbackOrderId,
           orderNumber,
           status: "needs_callback",
           addressStatus: "unconfirmed",
           callbackPhone: normalizedCallbackPhone,
         },
       });
     }
   }

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
  
   // ETA calculation settings with defaults
   const etaPickupBase = toNumber(settings?.etaPickupBaseMinutes, 15);
   const etaPickupRange = toNumber(settings?.etaPickupRangeMinutes, 5);
   const etaDeliveryBase = toNumber(settings?.etaDeliveryBaseMinutes, 30);
   const etaDeliveryRange = toNumber(settings?.etaDeliveryRangeMinutes, 10);
   const etaRushMultiplier = toNumber(settings?.etaRushMultiplier, 1.0);
   const etaPerPizza = toNumber(settings?.etaPerPizzaMinutes, 3);
   const etaPerSide = toNumber(settings?.etaPerSideMinutes, 1);
   const etaSizeAdd = settings?.etaSizeAddMinutes || { Personal: 0, Small: 0, Medium: 2, Large: 4, XLarge: 6 };
  
   console.log("[VAPI Order] Settings loaded", {
     settingId,
     taxRate: `${taxRate}%`,
     etaPickupBase,
     etaDeliveryBase,
     etaRushMultiplier,
   });


   // Calculate totals (SERVER-SIDE PRICING - authoritative)
   // For sides, use totalPriceCents if available (accounts for quantity)
   const subtotalCents = items.reduce((sum, it) => {
     if (it.totalPriceCents !== undefined) {
       return sum + it.totalPriceCents; // Sides with quantity already calculated
     }
     return sum + (it.priceCents || Math.round(toNumber(it.price) * 100)) * toNumber(it.quantity, 1);
   }, 0);
   const subtotal = subtotalCents / 100;
   
   // Add delivery fee for delivery orders
   const deliveryFeeCents = orderType === "delivery" ? PRICING.deliveryFeeCents : 0;
   const deliveryFee = deliveryFeeCents / 100;
   
   const taxableAmount = subtotal; // Delivery fee typically not taxed
   const tax = taxableAmount * (taxRate / 100);
   const tip = 0; // VAPI orders don't include tip
   
   // Server-calculated total (authoritative - ignore any VAPI-provided total)
   const total = +(subtotal + deliveryFee + tax + tip).toFixed(2);


   // Generate unique orderId and sequential orderNumber
   const orderId = callbackOrderId || generateOrderId();
   const orderNumber = await getNextOrderNumber(restaurantId);
   const createdAt = new Date().toISOString();
  
   console.log("[VAPI Order] Totals calculated (SERVER-SIDE)", {
     subtotal: `$${subtotal.toFixed(2)}`,
     deliveryFee: deliveryFeeCents > 0 ? `$${deliveryFee.toFixed(2)}` : "N/A",
     tax: `$${tax.toFixed(2)}`,
     tip: `$${tip.toFixed(2)}`,
     total: `$${total.toFixed(2)}`,
     orderType,
   });

   // ============================================
   // ETA CALCULATION (based on order contents + settings)
   // ============================================
   const pizzaCount = pizzas.length;
   const sideCount = sides.reduce((sum, s) => sum + toNumber(s.quantity, 1), 0);
   
   // Base ETA depends on order type
   const baseEta = orderType === "delivery" ? etaDeliveryBase : etaPickupBase;
   const rangeEta = orderType === "delivery" ? etaDeliveryRange : etaPickupRange;
   
   // Add time for extra pizzas (first pizza is included in base)
   const extraPizzaTime = pizzaCount > 1 ? (pizzaCount - 1) * etaPerPizza : 0;
   
   // Add time for sides
   const sideTime = sideCount * etaPerSide;
   
   // Add time based on pizza sizes
   const sizeTime = pizzas.reduce((sum, pizza) => {
     const size = pizza.size || "Medium";
     return sum + toNumber(etaSizeAdd[size], 0);
   }, 0);
   
   // Calculate raw ETA before rush multiplier
   const rawEtaMin = baseEta + extraPizzaTime + sideTime + sizeTime;
   
   // Apply rush multiplier and round to nearest minute
   const etaMinMinutes = Math.round(rawEtaMin * etaRushMultiplier);
   const etaMaxMinutes = Math.round((rawEtaMin + rangeEta) * etaRushMultiplier);
   
   // Generate human-readable ETA text for Vapi to speak
   const etaText = `about ${etaMinMinutes} to ${etaMaxMinutes} minutes`;
   
   console.log("[VAPI Order] ETA calculated", {
     orderType,
     pizzaCount,
     sideCount,
     baseEta,
     extraPizzaTime,
     sideTime,
     sizeTime,
     rushMultiplier: etaRushMultiplier,
     etaMinMinutes,
     etaMaxMinutes,
     etaText,
   });


   // Persist order header
   let orderRecord = {
     orderId,
     orderNumber, // Sequential order number for display (e.g., 1001, 1002)
     createdAt,
     status: needsCallback ? "needs_callback" : "new", // VAPI orders start as "new" (not paid yet)
     orderType,
     subtotal: +subtotal.toFixed(2),
     deliveryFee: +deliveryFee.toFixed(2),
     tax: +tax.toFixed(2),
     tip: +tip.toFixed(2),
     total: +total.toFixed(2),
     taxRate,
     // ETA range for kitchen display
     etaMinMinutes,
     etaMaxMinutes,
     etaText,
     customer: {
       name: "", // VAPI doesn't provide name
       phone: customerPhone,
       email: "",
       address: orderType === "delivery" ? deliveryAddress : "",
       table: "",
       instructions: "",
     },
     addressStatus: normalizedAddressStatus || undefined,
     callbackPhone: callbackPhone || undefined,
     callId: callId || undefined,
     reason: reason || undefined,
     // Store source for analytics
     source: "vapi",
   };
  
   // MULTI-TENANT: Always inject restaurantId on write
   if (restaurantId) {
     orderRecord = injectRestaurantIdForWrite(orderRecord, restaurantId);
   }


   await ddb.send(
     new PutItemCommand({
       TableName: TABLES.ORDERS,
       Item: marshall(orderRecord, { removeUndefinedValues: true }),
     })
   );
  
   console.log("[VAPI Order] Order header saved", { orderId, status: orderRecord.status });


   // Persist order items
   if (items.length > 0) {
     const batches = Math.ceil(items.length / 25);
     console.log("[VAPI Order] Saving order items", {
       totalItems: items.length,
       batches,
     });
    
     // Batch in chunks of 25
     for (let i = 0; i < items.length; i += 25) {
       const slice = items.slice(i, i + 25);
       const RequestItems = {
         [TABLES.ORDER_ITEMS]: slice.map((it, idx) => {
           let orderItem = {
             orderId,
             itemId: String(it.itemId ?? `${i + idx}`),
             name: it.name,
             price: toNumber(it.price),
             priceCents: it.priceCents || Math.round(toNumber(it.price) * 100),
             quantity: toNumber(it.quantity, 1),
           };
          
           // Include pizza details if present
           if (it.pizzaDetails) {
             orderItem.pizzaDetails = it.pizzaDetails;
           }
           
           // Include modifiers if present (for pizzas)
           if (it.modifiers && it.modifiers.length > 0) {
             orderItem.modifiers = it.modifiers;
           }
           
           // Include notes if present
           if (it.notes) {
             orderItem.notes = it.notes;
           }
           
           // Include pricing breakdown for transparency
           if (it.pricingBreakdown) {
             orderItem.pricingBreakdown = it.pricingBreakdown;
           }
          
           // MULTI-TENANT: Always inject restaurantId on write
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
    
     console.log("[VAPI Order] Order items saved", { orderId, itemCount: items.length });
   }


   const duration = Date.now() - startTime;
   console.log("[VAPI Order] Order created successfully", {
     orderId,
     itemCount: items.length,
     total: `$${total.toFixed(2)}`,
     duration: `${duration}ms`,
   });


   // Response includes server-calculated total and ETA for Vapi to read back
   const response = {
     orderId,
     orderNumber, // Sequential order number for the customer (e.g., 1001)
     total: +total.toFixed(2),
     subtotal: +subtotal.toFixed(2),
     deliveryFee: +deliveryFee.toFixed(2),
     tax: +tax.toFixed(2),
     itemCount: items.length,
     etaMinMinutes,
     etaMaxMinutes,
     etaText,
     status: "success",
   };
   
   // Return Vapi-compatible response (HTTP 200 with results array)
   // Include structured result so Vapi can access etaText
   return vapiToolResponse({
     toolCallId,
     result: response,
   });
 } catch (error) {
   const duration = Date.now() - startTime;
  
   // Try to extract some info about the body for debugging
   let bodyInfo = "no body";
   if (event?.body) {
     try {
       const parsedBody = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
       bodyInfo = {
         hasMessage: !!parsedBody?.message,
         hasToolCalls: !!parsedBody?.message?.toolCalls,
         toolCallsCount: Array.isArray(parsedBody?.message?.toolCalls) ? parsedBody.message.toolCalls.length : 0,
         hasCallMetadata: !!parsedBody?.call?.metadata,
       };
     } catch (e) {
       bodyInfo = `body parse error: ${e.message}`;
     }
   }
  
   console.error("[VAPI Order] Error processing order", {
     error: error.message,
     stack: error.stack,
     duration: `${duration}ms`,
     bodyInfo,
   });
  
   // Return Vapi-compatible error response (HTTP 200 with error in results)
   return vapiToolResponse({
     toolCallId,
     error: `Order failed: ${error.message}`,
   });
 }
};
