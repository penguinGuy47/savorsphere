/**
 * POST /kitchen/pin - Regenerate kitchen PIN
 * Protected by JWT authorizer - requires admin login
 * 
 * Flow:
 * 1. Generate random 6-digit PIN
 * 2. Create or update Cognito user: kitchen-{restaurantId}
 * 3. Set password to the PIN (permanent)
 * 4. Global sign-out to invalidate existing sessions
 * 5. Store metadata (non-secret) in RestaurantSettings
 * 6. Return PIN formatted as XXX-XXX (shown only once)
 */
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { extractRestaurantId } from "../utils/inject-restaurant-id.mjs";

const ddb = new DynamoDBClient();
const cognito = new CognitoIdentityProviderClient();

const USER_POOL_ID = process.env.USER_POOL_ID;

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-restaurant-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "{}" };
  }

  try {
    // Extract restaurantId from JWT claims or headers
    const restaurantId = extractRestaurantIdFromJwt(event) || extractRestaurantId(event);
    
    if (!restaurantId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing restaurantId" }),
      };
    }

    // 1. Generate random 6-digit PIN
    const pin = generatePin();
    const pinFormatted = `${pin.slice(0, 3)}-${pin.slice(3)}`;
    const kitchenUsername = `kitchen-${restaurantId}`;

    // 2. Create or update Cognito user
    const userExists = await checkUserExists(kitchenUsername);
    
    if (!userExists) {
      // Create new user (suppress welcome email)
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: kitchenUsername,
        MessageAction: "SUPPRESS", // Don't send email
        UserAttributes: [
          { Name: "custom:restaurantId", Value: restaurantId },
        ],
      }));
    }

    // 3. Set password to PIN (permanent, not temporary)
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: kitchenUsername,
      Password: pin,
      Permanent: true,
    }));

    // 4. Global sign-out to invalidate existing kitchen sessions
    try {
      await cognito.send(new AdminUserGlobalSignOutCommand({
        UserPoolId: USER_POOL_ID,
        Username: kitchenUsername,
      }));
    } catch (signOutError) {
      // User might not have any sessions - that's okay
      console.log("Global sign-out skipped (no active sessions):", signOutError.message);
    }

    // 5. Store metadata in RestaurantSettings (NOT the PIN itself)
    const settingId = `restaurant-config-${restaurantId}`;
    const now = new Date().toISOString();

    // Get existing settings first
    const { Item: existingItem } = await ddb.send(new GetItemCommand({
      TableName: "RestaurantSettings",
      Key: { settingId: { S: settingId } },
    }));
    const existingSettings = existingItem ? unmarshall(existingItem) : {};

    // Merge with new PIN metadata
    const updatedSettings = {
      ...existingSettings,
      settingId,
      restaurantId,
      kitchenPinSetAt: now,
      kitchenPinUser: kitchenUsername,
      updatedAt: now,
    };

    await ddb.send(new PutItemCommand({
      TableName: "RestaurantSettings",
      Item: marshall(updatedSettings, { removeUndefinedValues: true }),
    }));

    // 6. Return PIN (shown only this once!)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        pinFormatted,
        lastUpdatedAt: now,
        message: "Write this down - you'll need it to pair kitchen tablets. This PIN won't be shown again.",
      }),
    };
  } catch (error) {
    console.error("RegenerateKitchenPin error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * Generate a random 6-digit PIN (as string, preserves leading zeros)
 */
function generatePin() {
  const min = 0;
  const max = 999999;
  const num = Math.floor(Math.random() * (max - min + 1)) + min;
  return num.toString().padStart(6, "0");
}

/**
 * Check if a Cognito user already exists
 */
async function checkUserExists(username) {
  try {
    await cognito.send(new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    }));
    return true;
  } catch (error) {
    if (error.name === "UserNotFoundException") {
      return false;
    }
    throw error;
  }
}

/**
 * Extract restaurantId from JWT claims
 */
function extractRestaurantIdFromJwt(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return null;

  // Check for custom claim
  if (claims['custom:restaurantId']) {
    return claims['custom:restaurantId'];
  }

  // Check cognito:groups for restaurant-{id} pattern
  const groups = claims['cognito:groups'];
  if (groups) {
    const groupList = Array.isArray(groups) ? groups : [groups];
    for (const g of groupList) {
      if (g.startsWith('restaurant-')) {
        return g.replace('restaurant-', '');
      }
    }
  }

  // Check username for kitchen-{restaurantId} pattern
  const username = claims['cognito:username'] || claims.username || claims.sub;
  if (username && username.startsWith('kitchen-')) {
    return username.replace('kitchen-', '');
  }

  return null;
}




