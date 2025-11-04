import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const handler = async (event) => {
  try {
    const { items, total } = JSON.parse(event.body);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100), // Amount in cents
      currency: 'usd',
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // Or your specific frontend domain
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};


