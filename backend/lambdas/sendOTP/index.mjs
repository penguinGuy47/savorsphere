import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantIdForWrite } from '../utils/inject-restaurant-id.mjs';

const snsClient = new SNSClient({ region: "us-east-2" });
const ddbClient = new DynamoDBClient({ region: "us-east-2" });
const OTP_TABLE = "OTPCodes"; // You'll need to create this table
const OTP_EXPIRY_MINUTES = 10;

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalize phone number (remove non-digits, ensure +1 prefix for US)
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
    const { phone } = body;

    if (!phone) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Phone number is required" }),
      };
    }

    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);
    
    const normalizedPhone = normalizePhoneNumber(phone);
    const otp = generateOTP();
    const expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

    // Store OTP in DynamoDB
    let otpRecord = {
      phone: normalizedPhone,
      otp,
      expiresAt,
      attempts: 0,
      createdAt: Date.now(),
    };
    
    // MULTI-TENANT: Always inject restaurantId on write
    if (restaurantId) {
      otpRecord = injectRestaurantIdForWrite(otpRecord, restaurantId);
    }
    
    await ddbClient.send(
      new PutItemCommand({
        TableName: OTP_TABLE,
        Item: marshall(otpRecord),
      })
    );

    // Send SMS via SNS
    const message = `Your SavorSphere verification code is: ${otp}. This code expires in ${OTP_EXPIRY_MINUTES} minutes.`;
    
    await snsClient.send(
      new PublishCommand({
        PhoneNumber: normalizedPhone,
        Message: message,
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
        message: "OTP sent successfully",
        // In production, don't send OTP back. This is for testing only.
        // Remove this in production!
        // otp: otp 
      }),
    };
  } catch (error) {
    console.error("SendOTP error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ 
        error: "Failed to send OTP", 
        message: error.message 
      }),
    };
  }
};





