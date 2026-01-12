/**
 * POST /kitchen/session - Exchange PIN for JWT tokens
 * PUBLIC endpoint (no JWT required) - this IS the login
 * 
 * Request: { restaurantId, pin }
 * Response: { idToken, accessToken, expiresIn, restaurantId }
 */
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient();

const USER_POOL_ID = process.env.USER_POOL_ID;
const KITCHEN_CLIENT_ID = process.env.KITCHEN_CLIENT_ID;

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
    const body = event.body ? JSON.parse(event.body) : {};
    const { restaurantId, pin } = body;

    if (!restaurantId || !pin) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing restaurantId or pin" }),
      };
    }

    // Normalize PIN (remove dashes if formatted as XXX-XXX)
    const normalizedPin = pin.replace(/-/g, "");
    
    if (!/^\d{6}$/.test(normalizedPin)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "PIN must be 6 digits" }),
      };
    }

    const kitchenUsername = `kitchen-${restaurantId}`;

    // Attempt Cognito authentication
    const authResult = await cognito.send(new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: KITCHEN_CLIENT_ID,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: kitchenUsername,
        PASSWORD: normalizedPin,
      },
    }));

    if (!authResult.AuthenticationResult) {
      // Shouldn't happen for successful auth, but handle edge cases
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Authentication failed" }),
      };
    }

    const { IdToken, AccessToken, ExpiresIn, RefreshToken } = authResult.AuthenticationResult;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        idToken: IdToken,
        accessToken: AccessToken,
        refreshToken: RefreshToken,
        expiresIn: ExpiresIn,
        restaurantId,
      }),
    };
  } catch (error) {
    console.error("KitchenSession error:", error);

    // Return user-friendly error for auth failures
    if (error.name === "NotAuthorizedException" || error.name === "UserNotFoundException") {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid PIN or restaurant not found" }),
      };
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};




