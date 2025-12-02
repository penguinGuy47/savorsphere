import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdForWrite } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  SETTINGS: "RestaurantSettings",
};

export const handler = async (event) => {
  // CORS headers for all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
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
    // MULTI-TENANT: Extract restaurantId from event context
    // Fallback to query params/body for backward compatibility
    const queryParams = event?.queryStringParameters || {};
    const body = event?.body ? JSON.parse(event.body) : {};
    let restaurantId = extractRestaurantId(event) || queryParams.restaurantId || body.restaurantId || 'restaurant-config';
    
    // Use restaurantId in settingId for scalability
    // Format: "restaurant-config-{restaurantId}" or just "{restaurantId}" if it's already unique
    const settingId = restaurantId.startsWith('restaurant-config') 
      ? restaurantId 
      : `restaurant-config-${restaurantId}`;

    // Extract settings from body (exclude hours as per requirements)
    const {
      deliveryEnabled,
      dineInEnabled,
      pickupEnabled,
      minDeliveryOrder,
      deliveryFee,
      taxRate,
      autoCreditCardFee,
      voiceGreeting,
      stripeLiveMode,
      stripePublicKey,
      stripeSecretKey,
    } = body;

    // Get existing settings to preserve fields not being updated
    let existingSettings = {};
    try {
      const getResult = await ddb.send(
        new GetItemCommand({
          TableName: TABLES.SETTINGS,
          Key: { settingId: { S: settingId } },
        })
      );
      if (getResult.Item) {
        existingSettings = unmarshall(getResult.Item);
      }
    } catch (error) {
      console.log('No existing settings found, creating new record');
    }

    // Merge existing settings with new settings
    let updatedSettings = {
      settingId,
      restaurantId: restaurantId,
      // Delivery settings
      deliveryEnabled: deliveryEnabled !== undefined ? deliveryEnabled : existingSettings.deliveryEnabled ?? false,
      dineInEnabled: dineInEnabled !== undefined ? dineInEnabled : existingSettings.dineInEnabled ?? false,
      pickupEnabled: pickupEnabled !== undefined ? pickupEnabled : existingSettings.pickupEnabled ?? true,
      minDeliveryOrder: minDeliveryOrder !== undefined ? minDeliveryOrder : existingSettings.minDeliveryOrder ?? 0,
      deliveryFee: deliveryFee !== undefined ? deliveryFee : existingSettings.deliveryFee ?? 0,
      // Payment settings
      taxRate: taxRate !== undefined ? taxRate : existingSettings.taxRate ?? 0,
      autoCreditCardFee: autoCreditCardFee !== undefined ? autoCreditCardFee : existingSettings.autoCreditCardFee ?? false,
      // Voice settings
      voiceGreeting: voiceGreeting !== undefined ? voiceGreeting : existingSettings.voiceGreeting ?? '',
      // Stripe settings (preserve if not provided)
      stripeLiveMode: stripeLiveMode !== undefined ? stripeLiveMode : existingSettings.stripeLiveMode ?? false,
      stripePublicKey: stripePublicKey !== undefined ? stripePublicKey : existingSettings.stripePublicKey ?? '',
      stripeSecretKey: stripeSecretKey !== undefined ? stripeSecretKey : existingSettings.stripeSecretKey ?? '',
      // Timestamp
      updatedAt: new Date().toISOString(),
    };
    
    // MULTI-TENANT: Always inject restaurantId on write (ensure it's set)
    if (restaurantId) {
      updatedSettings = injectRestaurantIdForWrite(updatedSettings, restaurantId);
    }

    // Save to DynamoDB
    await ddb.send(
      new PutItemCommand({
        TableName: TABLES.SETTINGS,
        Item: marshall(updatedSettings, { removeUndefinedValues: true }),
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Settings updated successfully",
        settingId: updatedSettings.settingId,
        restaurantId: updatedSettings.restaurantId,
      }),
    };
  } catch (error) {
    console.error("UpdateSettings error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

