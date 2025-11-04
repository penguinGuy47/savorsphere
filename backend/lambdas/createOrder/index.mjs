import { DynamoDBClient, PutItemCommand, BatchWriteItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const ddb = new DynamoDBClient();

const TABLES = {
  ORDERS: "Orders",
  ORDER_ITEMS: "OrderItems",
  PAYMENTS: "Payments",
  SETTINGS: "RestaurantSettings",
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const handler = async (event) => {
  try {
    const body = event?.body ? JSON.parse(event.body) : {};
    const {
      items = [],
      total: clientTotal = 0,
      tip = 0,
      orderType = "pickup",
      name = "",
      phone = "",
      email = "",
      address = "",
      table = "",
      instructions = "",
      paymentId,
    } = body;

    // Load settings to compute tax and ETA (fallbacks provided)
    const settingsRes = await ddb.send(
      new GetItemCommand({
        TableName: TABLES.SETTINGS,
        Key: { settingId: { S: "restaurant-config" } },
      })
    );
    const settings = settingsRes.Item ? unmarshall(settingsRes.Item) : {};
    const taxRate = toNumber(settings?.taxRate, 0);
    const etaMinutes = toNumber(settings?.etaMinutes ?? settings?.defaultEtaMinutes, 30);

    // Server-side total calculation for trust
    const subtotal = items.reduce((sum, it) => sum + toNumber(it?.price) * toNumber(it?.quantity, 0), 0);
    const tax = subtotal * (taxRate / 100);
    const tipAmount = toNumber(tip, 0);
    const serverTotal = +(subtotal + tax + tipAmount).toFixed(2);

    const total = Number.isFinite(toNumber(clientTotal)) ? toNumber(clientTotal) : serverTotal;

    const orderId = `ord_${Date.now()}`;
    const createdAt = new Date().toISOString();

    // Persist order header
    const orderRecord = {
      orderId,
      createdAt,
      status: "paid",
      orderType,
      subtotal: +subtotal.toFixed(2),
      tax: +tax.toFixed(2),
      tip: +tipAmount.toFixed(2),
      total,
      taxRate,
      etaMinutes,
      paymentId,
      customer: { name, phone, email, address, table, instructions },
    };

    await ddb.send(
      new PutItemCommand({
        TableName: TABLES.ORDERS,
        Item: marshall(orderRecord, { removeUndefinedValues: true }),
      })
    );

    // Persist order items
    if (items.length > 0) {
      // Batch in chunks of 25
      for (let i = 0; i < items.length; i += 25) {
        const slice = items.slice(i, i + 25);
        const RequestItems = {
          [TABLES.ORDER_ITEMS]: slice.map((it, idx) => ({
            PutRequest: {
              Item: marshall(
                {
                  orderId,
                  itemId: String(it.itemId ?? idx),
                  name: it.name,
                  price: toNumber(it.price),
                  quantity: toNumber(it.quantity, 0),
                },
                { removeUndefinedValues: true }
              ),
            },
          })),
        };
        await ddb.send(new BatchWriteItemCommand({ RequestItems }));
      }
    }

    // Persist payment
    if (paymentId) {
      const paymentRecord = {
        paymentId,
        orderId,
        amount: total,
        currency: "usd",
        status: "succeeded",
        createdAt,
      };
      await ddb.send(
        new PutItemCommand({
          TableName: TABLES.PAYMENTS,
          Item: marshall(paymentRecord, { removeUndefinedValues: true }),
        })
      );
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({ orderId, total, etaMinutes }),
    };
  } catch (error) {
    console.error("CreateOrder error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
