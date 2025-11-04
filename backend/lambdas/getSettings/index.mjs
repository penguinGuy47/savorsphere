import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const ddbClient = new DynamoDBClient();

export const handler = async (event) => {
  try {
    const params = {
      TableName: "RestaurantSettings",
      Key: { settingId: { S: "restaurant-config" } },
    };

    const { Item } = await ddbClient.send(new GetItemCommand(params));
    const settings = Item ? unmarshall(Item) : {};

    return {
      statusCode: 200,
      body: JSON.stringify(settings),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ 
        message: "Failed to fetch settings", 
        error: error.message 
      }),
    };
  }
};
