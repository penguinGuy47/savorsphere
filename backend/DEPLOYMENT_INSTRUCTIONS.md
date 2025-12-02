# Backend Deployment Instructions

## Update Order Endpoint Deployment

The `PATCH /order/{id}` endpoint has been created to update order status. Follow these steps to deploy:

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. CDK CLI installed (`npm install -g aws-cdk`)
3. Node.js dependencies installed (`npm install`)

### Deployment Steps

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies (if not already done):**
   ```bash
   npm install
   ```

3. **Synthesize the CloudFormation template (optional, to verify):**
   ```bash
   npx cdk synth
   ```

4. **Deploy the stack:**
   ```bash
   npx cdk deploy
   ```
   
   Or if you want to skip approval prompts:
   ```bash
   npx cdk deploy --require-approval never
   ```

5. **Verify the deployment:**
   - Check the API Gateway console to confirm the `PATCH /order/{id}` route exists
   - Verify the `UpdateOrderFn` Lambda function is created
   - Test the endpoint using curl or Postman

### Testing the Endpoint

After deployment, you can test the endpoint:

```bash
# Update order status to "accepted"
curl -X PATCH https://YOUR_API_URL/prod/order/ord_1234567890 \
  -H "Content-Type: application/json" \
  -d '{"status": "accepted", "acceptedAt": "2024-01-01T12:00:00Z"}'

# Update order status to "completed"
curl -X PATCH https://YOUR_API_URL/prod/order/ord_1234567890 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### API Endpoint Details

- **Method:** `PATCH`
- **Path:** `/order/{id}`
- **Request Body:**
  ```json
  {
    "status": "accepted" | "completed" | "cancelled" | "ready" | "paid" | "new",
    "acceptedAt": "ISO 8601 timestamp (optional)"
  }
  ```
- **Response:**
  ```json
  {
    "orderId": "ord_1234567890",
    "status": "accepted",
    "acceptedAt": "2024-01-01T12:00:00Z",
    "message": "Order updated successfully"
  }
  ```

### Valid Status Values

- `new` - Order just created
- `paid` - Payment received
- `accepted` - Kitchen accepted the order
- `ready` - Order is ready for pickup/delivery
- `completed` - Order completed
- `cancelled` - Order cancelled

### Troubleshooting

If you encounter issues:

1. **Check CloudFormation stack status:**
   ```bash
   aws cloudformation describe-stacks --stack-name SavorSphereProd
   ```

2. **Check Lambda function logs:**
   ```bash
   aws logs tail /aws/lambda/SavorSphereProd-UpdateOrderFn-XXXXX --follow
   ```

3. **Verify API Gateway routes:**
   - Go to AWS Console → API Gateway → Your API → Routes
   - Confirm `PATCH /order/{id}` is listed

4. **Check DynamoDB permissions:**
   - Ensure the Lambda execution role has `dynamodb:UpdateItem` permission on the Orders table

### Rollback (if needed)

If you need to rollback:
```bash
cdk destroy
# Then redeploy previous version
```





