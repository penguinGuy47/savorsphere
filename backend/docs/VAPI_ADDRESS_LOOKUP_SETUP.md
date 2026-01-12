# Vapi Address Lookup Setup

This guide explains how to configure your Vapi assistant to validate delivery addresses using phonetic/fuzzy matching.

## Overview

The address verification flow:
1. Ask for ZIP code
2. Ask for full address (number + street)
3. Call `lookup_address` tool to verify street
4. If found → confirm once ("I have 54 Golf Road, correct?") → proceed
5. If not found → "Could you spell just the street name for me?"
6. Search again with spelling → if found, proceed
7. If still not found → collect callback number → human follows up

## 1. Add the `lookup_address` Tool

In your Vapi assistant configuration, add this tool:

```json
{
  "type": "function",
  "function": {
    "name": "lookup_address",
    "description": "Verify a delivery street address exists in the restaurant's delivery zone. Call this BEFORE confirming a delivery order to ensure the address is valid.",
    "parameters": {
      "type": "object",
      "properties": {
        "zipCode": {
          "type": "string",
          "description": "5-digit ZIP code"
        },
        "streetNumber": {
          "type": "string",
          "description": "Street number (e.g., '54')"
        },
        "streetName": {
          "type": "string",
          "description": "Street name as spoken by customer (e.g., 'Golf Road')"
        },
        "spelledStreetName": {
          "type": "string",
          "description": "Only provide if customer spelled the street name letter by letter (e.g., 'G O L F')"
        },
        "attempt": {
          "type": "number",
          "description": "1 for first attempt, 2 if customer already spelled the name"
        }
      },
      "required": ["zipCode", "streetName", "attempt"]
    }
  },
  "server": {
    "url": "{{YOUR_API_URL}}/address/lookup"
  }
}
```

Replace `{{YOUR_API_URL}}` with your deployed API Gateway URL (e.g., `https://abc123.execute-api.us-east-2.amazonaws.com`).

## 2. Configure restaurantId in Assistant Metadata

The `lookup_address` Lambda needs to know which restaurant's delivery zone to search. Configure this in Vapi:

### Option A: Assistant-level metadata (recommended)
```json
{
  "metadata": {
    "restaurantId": "rest-001"
  }
}
```

### Option B: Per-call metadata
When making a call via API:
```json
{
  "assistantId": "your-assistant-id",
  "metadata": {
    "restaurantId": "rest-001"
  }
}
```

## 3. System Prompt for Delivery Address Verification

Add this to your assistant's system prompt:

```
## Delivery Address Verification

When a customer requests DELIVERY, you MUST verify their address before proceeding:

### Step 1: Get ZIP Code
Ask: "What's the ZIP code for your delivery address?"
- Wait for response
- If unclear, ask them to repeat

### Step 2: Get Street Address  
Ask: "And what's the street address? Please give me the number and street name."
- Example response: "54 Golf Road"

### Step 3: Verify Address
Call the `lookup_address` tool with:
- zipCode: the ZIP they provided
- streetNumber: extracted from their response (e.g., "54")
- streetName: extracted from their response (e.g., "Golf Road")
- attempt: 1

### Step 4: Handle the Response

**If result is "found":**
- Say the confirmPrompt from the response (e.g., "I have 54 Golf Road in ZIP code 60005. Is that correct?")
- If they confirm YES → proceed with order
- If they say NO → ask them to repeat the address and try again

**If result is "ambiguous":**
- Read the clarifyPrompt which lists the similar options
- Let them pick one, then confirm and proceed

**If result is "not_found" and attempt was 1:**
- Say: "I'm having trouble finding that street. Could you spell just the street name for me?"
- When they spell it (e.g., "G-O-L-F" or "G as in George, O, L, F")
- Call `lookup_address` again with:
  - spelledStreetName: their spelled response
  - attempt: 2

**If result is "not_found" and attempt was 2:**
- Say: "I'm having trouble finding that address in our system. Let me have someone call you right back to confirm. What's the best number to reach you?"
- Collect their callback number
- Say: "Perfect. We'll call you back shortly at [number] to confirm the address. Let's finish your order real quick."
- Continue the order flow, and when you call `submit_order` include:
  - `addressStatus`: `"unconfirmed"`
  - `callbackPhone`: the number they gave you
  - `callId`: the current call's id
  - `reason`: `"address_unconfirmed"`

**If result is "zip_not_covered":**
- Say: "I'm sorry, but that ZIP code doesn't appear to be in our delivery area. Would you like to place a pickup order instead?"

### Important Notes:
- ALWAYS verify the address before asking for payment
- NEVER skip address verification for delivery orders
- If confused, ask the customer to repeat rather than guessing
- The spelled name parser understands both letter-by-letter ("G O L F") and phonetic ("G as in George")
```

## 4. Response Reference

The `lookup_address` endpoint returns these response types:

### `found` - High confidence match
```json
{
  "result": "found",
  "confidence": "high",
  "streetName": "Golf Road",
  "formattedAddress": "54 Golf Road",
  "zipCode": "60005",
  "confirmPrompt": "I have 54 Golf Road in ZIP code 60005. Is that correct?"
}
```

### `ambiguous` - Multiple possible matches
```json
{
  "result": "ambiguous",
  "candidates": ["Golf Road", "Gulf Road"],
  "scores": [{"street": "Golf Road", "score": 85}, {"street": "Gulf Road", "score": 82}],
  "clarifyPrompt": "I heard something like \"Golf\". Did you mean Golf Road or Gulf Road?"
}
```

### `not_found` - No matches
```json
{
  "result": "not_found",
  "suggestAction": "request_spelling",  // or "human_handoff" on attempt 2
  "prompt": "I couldn't find \"Golf\" in ZIP code 60005. Could you spell just the street name for me?"
}
```

### `zip_not_covered` - ZIP code not in delivery zone
```json
{
  "result": "zip_not_covered",
  "zipCode": "99999",
  "message": "We don't have delivery coverage data for ZIP code 99999.",
  "suggestAction": "verify_zip"
}
```

### `error` - Missing required field
```json
{
  "result": "error",
  "message": "restaurantId is required"
}
```

## 5. Testing

### Test the endpoint directly:
```bash
curl -X POST https://YOUR_API_URL/address/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "rest-001",
    "zipCode": "60005",
    "streetNumber": "54",
    "streetName": "Golf Road",
    "attempt": 1
  }'
```

### Test similar-sounding streets:
- "Golf" vs "Gulf" vs "Goff"
- "Main" vs "Maine"
- "First" vs "Furst"

### Test spelling parser:
```json
{
  "spelledStreetName": "G O L F",
  "attempt": 2
}
```

Or with phonetic alphabet:
```json
{
  "spelledStreetName": "G as in George, O, L as in Lincoln, F as in Frank",
  "attempt": 2
}
```

## 6. Seeding Street Data

Before the lookup works, you must seed street data for each restaurant:

```bash
# From backend directory

# 1. Create the DynamoDB table (first time only)
node scripts/seed-streets.mjs --create-table

# 2. Fetch and seed streets for a restaurant
node scripts/fetch-streets-osm.mjs \
  --restaurant-id rest-001 \
  --lat 42.0667 \
  --lon -87.9833 \
  --radius 3 \
  --zip 60005,60004 \
  --seed

# Or use a config file for multiple restaurants
node scripts/fetch-streets-osm.mjs --config scripts/delivery-zones.json --seed
```

See [delivery-zones.example.json](../scripts/delivery-zones.example.json) for config file format.

## Troubleshooting

### "restaurantId is required" error
- Ensure `restaurantId` is in your assistant metadata or call metadata
- Check that your Vapi tool server URL is correct

### "zip_not_covered" for valid ZIP
- Run the seeding script for that ZIP code
- Verify the ZIP is in your restaurant's delivery zone config

### False negatives (valid street not found)
- The phonetic matching has a threshold of 30 points
- If a valid street isn't matching, check:
  - Is it seeded in DynamoDB? Query the table directly
  - Is the spelling very different from what OSM has?
  - Try adding common variations manually

### Cache behavior
- Lookups are cached in Lambda memory for 10 minutes
- After seeding new streets, you may need to wait or invoke a new Lambda instance

