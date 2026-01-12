/**
 * Atomic order number generator using DynamoDB counter
 * 
 * Each restaurant gets a sequential order number starting at 1001.
 * Uses DynamoDB atomic increment to ensure uniqueness even under concurrent load.
 */

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient();
const ORDER_COUNTERS_TABLE = "OrderCounters";

// Starting order number (first order will be this value)
const STARTING_ORDER_NUMBER = 1001;

/**
 * Generate a unique orderId with timestamp + random suffix
 * Format: ord_{timestamp}_{random4hex}
 */
export function generateOrderId() {
  const timestamp = Date.now();
  const randomHex = Math.random().toString(16).substring(2, 6).padStart(4, '0');
  return `ord_${timestamp}_${randomHex}`;
}

/**
 * Get the next order number for a restaurant (atomic increment)
 * Returns a sequential number starting at 1001
 * 
 * @param {string} restaurantId - The restaurant's unique identifier
 * @returns {Promise<number>} - The next order number
 */
export async function getNextOrderNumber(restaurantId) {
  if (!restaurantId) {
    restaurantId = 'default';
  }

  try {
    const result = await ddb.send(new UpdateItemCommand({
      TableName: ORDER_COUNTERS_TABLE,
      Key: {
        restaurantId: { S: restaurantId },
      },
      // Atomically increment lastOrderNumber, creating with default if it doesn't exist
      UpdateExpression: "SET lastOrderNumber = if_not_exists(lastOrderNumber, :start) + :inc",
      ExpressionAttributeValues: {
        ":start": { N: String(STARTING_ORDER_NUMBER - 1) }, // -1 because we add 1
        ":inc": { N: "1" },
      },
      ReturnValues: "UPDATED_NEW",
    }));

    const newOrderNumber = parseInt(result.Attributes?.lastOrderNumber?.N ?? STARTING_ORDER_NUMBER, 10);
    return newOrderNumber;
  } catch (error) {
    console.error("[OrderNumber] Failed to get next order number:", error);
    // Fallback to timestamp-based number if DynamoDB fails
    // This is not ideal but prevents order failures
    const fallback = Math.floor(Date.now() / 1000) % 100000;
    console.warn(`[OrderNumber] Using fallback order number: ${fallback}`);
    return fallback;
  }
}





