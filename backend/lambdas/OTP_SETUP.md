# OTP Phone Verification Setup

## DynamoDB Table Setup

You need to create a DynamoDB table named `OTPCodes` with the following configuration:

- **Table Name**: `OTPCodes`
- **Partition Key**: `phone` (String)
- **No Sort Key Required**
- **Billing Mode**: On-Demand (or Provisioned with auto-scaling)

### AWS CLI Command:
```bash
aws dynamodb create-table \
  --table-name OTPCodes \
  --attribute-definitions AttributeName=phone,AttributeType=S \
  --key-schema AttributeName=phone,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-2
```

### AWS Console:
1. Go to DynamoDB Console
2. Create Table
3. Table name: `OTPCodes`
4. Partition key: `phone` (String)
5. Use default settings
6. Create table

## AWS SNS Setup

1. Go to AWS SNS Console
2. Ensure you have SMS sending permissions configured
3. For production, set up spending limits and opt-out handling
4. The Lambda function will automatically use SNS to send SMS messages

## Testing

In development, you can temporarily uncomment the `otp` field in the sendOTP response to see the code in the API response (for testing only - remove in production).

## Environment Variables

No additional environment variables needed - the Lambda functions use IAM roles for permissions.





