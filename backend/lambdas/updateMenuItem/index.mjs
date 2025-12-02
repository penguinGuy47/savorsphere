import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { extractRestaurantId, injectRestaurantId } from '../utils/inject-restaurant-id.mjs';

const ddb = new DynamoDBClient();

const TABLES = {
  MENU_ITEMS: "MenuItems",
};

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({}),
    };
  }

  try {
    // MULTI-TENANT: Extract restaurantId from event context
    const restaurantId = extractRestaurantId(event);
    
    const menuItemId = event.pathParameters?.menuItemId;
    if (!menuItemId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "menuItemId is required in path" }),
      };
    }

    const body = event?.body ? JSON.parse(event.body) : {};
    const {
      name,
      description,
      price,
      category,
      available,
      image,
    } = body;

    // Get existing item to preserve fields not being updated
    // Try both itemId and menuItemId as keys (for backward compatibility)
    let existingItem = {};
    try {
      // First try itemId (primary key)
      let getResult = await ddb.send(
        new GetItemCommand({
          TableName: TABLES.MENU_ITEMS,
          Key: { itemId: { S: String(menuItemId) } },
        })
      );
      
      // If not found, try menuItemId (for backward compatibility)
      if (!getResult.Item) {
        getResult = await ddb.send(
          new GetItemCommand({
            TableName: TABLES.MENU_ITEMS,
            Key: { menuItemId: { S: String(menuItemId) } },
          })
        );
      }
      
      if (getResult.Item) {
        existingItem = unmarshall(getResult.Item);
        
        // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
        if (restaurantId) {
          existingItem = injectRestaurantId(existingItem, restaurantId);
        }
      } else {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Menu item not found" }),
        };
      }
    } catch (error) {
      console.error("Error fetching existing item:", error);
    }

    // Build update expression
    const updateExpressions = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    if (name !== undefined) {
      updateExpressions.push("#name = :name");
      expressionAttributeNames["#name"] = "name";
      expressionAttributeValues[":name"] = { S: String(name) };
    }
    if (description !== undefined) {
      updateExpressions.push("#description = :description");
      expressionAttributeNames["#description"] = "description";
      expressionAttributeValues[":description"] = { S: String(description) };
    }
    if (price !== undefined) {
      updateExpressions.push("#price = :price");
      expressionAttributeNames["#price"] = "price";
      expressionAttributeValues[":price"] = { N: String(Number(price)) };
    }
    if (category !== undefined) {
      updateExpressions.push("#category = :category");
      expressionAttributeNames["#category"] = "category";
      expressionAttributeValues[":category"] = { S: String(category) };
    }
    if (available !== undefined) {
      updateExpressions.push("#available = :available");
      expressionAttributeNames["#available"] = "available";
      expressionAttributeValues[":available"] = { BOOL: Boolean(available) };
    }
    if (image !== undefined) {
      updateExpressions.push("#image = :image");
      expressionAttributeNames["#image"] = "image";
      expressionAttributeValues[":image"] = { S: String(image) };
    }

    // Always update updatedAt
    updateExpressions.push("#updatedAt = :updatedAt");
    expressionAttributeNames["#updatedAt"] = "updatedAt";
    expressionAttributeValues[":updatedAt"] = { S: new Date().toISOString() };
    
    // MULTI-TENANT: Always ensure restaurantId is set on update
    if (restaurantId) {
      updateExpressions.push("restaurantId = :restaurantId");
      expressionAttributeValues[":restaurantId"] = { S: String(restaurantId) };
    }

    if (updateExpressions.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "No fields to update" }),
      };
    }

    // Use itemId as key (primary key), fallback to menuItemId for backward compatibility
    const keyField = existingItem.itemId ? 'itemId' : 'menuItemId';
    const keyValue = existingItem.itemId || menuItemId;
    
    const updateParams = {
      TableName: TABLES.MENU_ITEMS,
      Key: { [keyField]: { S: String(keyValue) } },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    const updateResult = await ddb.send(new UpdateItemCommand(updateParams));
    let updatedItem = unmarshall(updateResult.Attributes);
    
    // MULTI-TENANT: Lazy inject restaurantId if missing (for backward compatibility)
    if (restaurantId) {
      updatedItem = injectRestaurantId(updatedItem, restaurantId);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Menu item updated successfully",
        menuItem: updatedItem,
      }),
    };
  } catch (error) {
    console.error("UpdateMenuItem error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

