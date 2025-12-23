import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const ddbClient = new DynamoDBClient({ region: "us-east-2" });

export const handler = async (event) => {
  console.log("event", JSON.stringify(event, null, 2));

  try {
    const params = {
      TableName: "MenuItems",
    };
    console.log("Scanning table:", params.TableName);

    const { Items } = await ddbClient.send(new ScanCommand(params));
    console.log("scan result:", Items);

    const items = Items ? Items.map(item => unmarshall(item)) : [];
    console.log("Unmarshalled items:", items);

    return {
      statusCode: 200,
      body: JSON.stringify(items),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to fetch menu", error: error.message }),
    };
  }
};


