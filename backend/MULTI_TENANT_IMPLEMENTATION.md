# Multi-Tenant Implementation Summary

This document describes the multi-tenant support implementation that injects `restaurantId` into all DynamoDB operations.

## Overview

All Lambda functions have been updated to:
1. **Extract `restaurantId`** from Lambda event context (path params, query params, body, or Vapi payload)
2. **On READ operations**: Lazy inject `restaurantId` if missing (for backward compatibility with existing data)
3. **On WRITE operations**: Always inject `restaurantId` before saving to DynamoDB
4. **Filter operations**: Add `restaurantId` filter to queries/scans when available

## Utility Functions

### `backend/lambdas/utils/inject-restaurant-id.mjs`

**Functions:**
- `extractRestaurantId(event)` - Extracts restaurantId from event context
- `injectRestaurantId(item, restaurantId)` - Lazy injects restaurantId (only if missing)
- `injectRestaurantIdBatch(items, restaurantId)` - Batch lazy injection
- `injectRestaurantIdForWrite(item, restaurantId)` - Always injects restaurantId for writes
- `addRestaurantIdFilter(params, restaurantId)` - Adds restaurantId filter to DynamoDB operations

## Updated Lambda Functions

### 1. `getMenu/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Adds `restaurantId` filter to ScanCommand
- Lazy injects `restaurantId` into results if missing

### 2. `getOrder/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Adds `restaurantId` filter to QueryCommand/ScanCommand for order items
- Lazy injects `restaurantId` into order and order items if missing

### 3. `getOrders/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Adds `restaurantId` filter to ScanCommand for orders
- Adds `restaurantId` filter to QueryCommand/ScanCommand for order items
- Lazy injects `restaurantId` into all orders and order items if missing

### 4. `createOrder/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Uses `restaurantId` for settings lookup
- Always injects `restaurantId` into order record before write
- Always injects `restaurantId` into order items before write
- Always injects `restaurantId` into payment record before write

### 5. `updateOrder/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Lazy injects `restaurantId` into existing order if missing
- Always ensures `restaurantId` is set on update

### 6. `createMenuItem/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Always injects `restaurantId` into menu item before write

### 7. `updateMenuItem/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Lazy injects `restaurantId` into existing menu item if missing
- Always ensures `restaurantId` is set on update

### 8. `deleteMenuItem/index.mjs`
**Changes:**
- No changes needed (delete operations don't read/write item data)
- Note: Consider adding restaurantId validation for security

### 9. `getSettings/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context (with fallback to query params)
- Lazy injects `restaurantId` into settings if missing

### 10. `updateSettings/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context (with fallback to query params/body)
- Always injects `restaurantId` into settings before write

### 11. `sendOTP/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Always injects `restaurantId` into OTP record before write

### 12. `verifyOTP/index.mjs`
**Changes:**
- Extracts `restaurantId` from event context
- Lazy injects `restaurantId` into OTP record if missing
- Note: Optional validation to ensure OTP belongs to correct restaurant (commented out)

### 13. `createPaymentIntent/index.mjs`
**Changes:**
- No changes needed (doesn't interact with DynamoDB)

## RestaurantId Extraction Priority

The `extractRestaurantId()` function checks in this order:
1. `event.pathParameters.restaurantId`
2. `event.queryStringParameters.restaurantId`
3. `event.body.restaurantId` (parsed JSON)
4. `event.body.payload.assistantId` (Vapi webhook structure)
5. `event.assistantId` (direct Vapi property)
6. Returns `null` if not found

## Backward Compatibility

- **Lazy injection on reads**: Existing items without `restaurantId` will have it injected dynamically
- **Filter behavior**: If `restaurantId` is not provided, operations work without filtering (shows all data)
- **Write behavior**: New items always get `restaurantId` injected

## Security Considerations

1. **Filtering**: When `restaurantId` is provided, all queries/scans are filtered to that restaurant
2. **Validation**: Consider adding validation to ensure users can only access their own restaurant's data
3. **OTP**: OTP records are scoped by phone number; consider adding restaurantId validation

## Testing Recommendations

1. Test with `restaurantId` in path parameters
2. Test with `restaurantId` in query parameters
3. Test with `restaurantId` in request body
4. Test with Vapi webhook payload structure
5. Test backward compatibility (items without `restaurantId`)
6. Test filtering behavior (ensure items from other restaurants are not returned)

## Migration Notes

- Existing data without `restaurantId` will continue to work (lazy injection)
- New data will always have `restaurantId`
- Consider running a migration script to backfill `restaurantId` for existing records





