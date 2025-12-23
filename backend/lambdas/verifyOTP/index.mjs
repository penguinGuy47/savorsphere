import { DynamoDBClient, GetItemCommand, DeleteItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const ddbClient = new DynamoDBClient({ region: "us-east-2" });
const OTP_TABLE = "OTPCodes";
const MAX_ATTEMPTS = 5;

// Normalize phone number
function normalizePhoneNumber(phone) {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }
  return phone.startsWith("+") ? phone : `+${cleaned}`;
}

export const handler = async (event) => {
  try {
    const body = event?.body ? JSON.parse(event.body) : {};
    const { phone, otp } = body;

    if (!phone || !otp) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Phone number and OTP are required" }),
      };
    }

    const normalizedPhone = normalizePhoneNumber(phone);

    // Get OTP record from DynamoDB
    const { Item } = await ddbClient.send(
      new GetItemCommand({
        TableName: OTP_TABLE,
        Key: marshall({ phone: normalizedPhone }),
      })
    );

    if (!Item) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "OTP not found or expired. Please request a new code." }),
      };
    }

    const otpRecord = unmarshall(Item);

    // Check if OTP has expired
    if (Date.now() > otpRecord.expiresAt) {
      // Delete expired OTP
      await ddbClient.send(
        new DeleteItemCommand({
          TableName: OTP_TABLE,
          Key: marshall({ phone: normalizedPhone }),
        })
      );
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "OTP has expired. Please request a new code." }),
      };
    }

    // Check attempt limit
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      return {
        statusCode: 429,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Too many attempts. Please request a new code." }),
      };
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      // Increment attempts
      await ddbClient.send(
        new UpdateItemCommand({
          TableName: OTP_TABLE,
          Key: marshall({ phone: normalizedPhone }),
          UpdateExpression: "SET attempts = attempts + :inc",
          ExpressionAttributeValues: marshall({ ":inc": 1 }),
        })
      );

      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Invalid OTP code. Please try again." }),
      };
    }

    // OTP is valid - delete it to prevent reuse
    await ddbClient.send(
      new DeleteItemCommand({
        TableName: OTP_TABLE,
        Key: marshall({ phone: normalizedPhone }),
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ 
        success: true, 
        verified: true,
        message: "Phone number verified successfully" 
      }),
    };
  } catch (error) {
    console.error("VerifyOTP error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ 
        error: "Failed to verify OTP", 
        message: error.message 
      }),
    };
  }
};





