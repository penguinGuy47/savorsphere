#!/usr/bin/env node
/**
 * Test script to create orders for different restaurants
 * 
 * Usage:
 *   node scripts/create-test-orders.mjs                    # Creates 1 order for demo123
 *   node scripts/create-test-orders.mjs demo123            # Creates 1 order for demo123
 *   node scripts/create-test-orders.mjs test-001           # Creates 1 order for test-001
 *   node scripts/create-test-orders.mjs demo123 3          # Creates 3 orders for demo123
 *   node scripts/create-test-orders.mjs --both             # Creates 1 order for each restaurant
 */

const API_BASE = process.env.API_URL || 'https://b850esmck5.execute-api.us-east-2.amazonaws.com';

// Sample menu items for test orders
const SAMPLE_ITEMS = [
  { itemId: 'pizza-1', name: 'Large Pepperoni Pizza', price: 18.99, quantity: 1 },
  { itemId: 'pizza-2', name: 'Medium Cheese Pizza', price: 14.99, quantity: 1 },
  { itemId: 'side-1', name: 'Garlic Knots (6pc)', price: 5.99, quantity: 1 },
  { itemId: 'side-2', name: 'Buffalo Wings (12pc)', price: 15.99, quantity: 1 },
  { itemId: 'drink-1', name: '2-Liter Coke', price: 3.99, quantity: 1 },
];

// Sample customer names
const NAMES = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Williams', 'Bob Brown', 'Alice Davis'];
const ORDER_TYPES = ['pickup', 'delivery', 'dine-in'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone() {
  const area = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const subscriber = Math.floor(Math.random() * 9000) + 1000;
  return `(${area}) ${exchange}-${subscriber}`;
}

function generateOrder() {
  // Pick 1-4 random items
  const numItems = Math.floor(Math.random() * 4) + 1;
  const items = [];
  const usedIds = new Set();
  
  for (let i = 0; i < numItems; i++) {
    const item = randomItem(SAMPLE_ITEMS);
    if (!usedIds.has(item.itemId)) {
      usedIds.add(item.itemId);
      items.push({
        ...item,
        quantity: Math.floor(Math.random() * 2) + 1,
      });
    }
  }

  const orderType = randomItem(ORDER_TYPES);
  const name = randomItem(NAMES);

  return {
    name,
    phone: randomPhone(),
    email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
    orderType,
    items,
    address: orderType === 'delivery' ? '123 Test Street, Testville, NY 10001' : '',
    table: orderType === 'dine-in' ? `Table ${Math.floor(Math.random() * 20) + 1}` : '',
    instructions: Math.random() > 0.7 ? 'Extra napkins please' : '',
    tip: Math.floor(Math.random() * 10),
    paymentMethod: 'in-store',
  };
}

async function createOrder(restaurantId) {
  const orderData = generateOrder();
  
  // Calculate totals
  const subtotal = orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const taxRate = 8.875;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax + (orderData.tip || 0);
  
  const payload = {
    ...orderData,
    subtotal: +subtotal.toFixed(2),
    tax: +tax.toFixed(2),
    total: +total.toFixed(2),
  };

  console.log(`\n📦 Creating order for restaurant: ${restaurantId}`);
  console.log(`   Customer: ${payload.name}`);
  console.log(`   Type: ${payload.orderType}`);
  console.log(`   Items: ${payload.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}`);
  console.log(`   Total: $${payload.total.toFixed(2)}`);

  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-restaurant-id': restaurantId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`   ✅ Order created: #${result.orderNumber || result.orderId}`);
    console.log(`   Order ID: ${result.orderId}`);
    return result;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('🍕 Test Order Creator');
  console.log(`API: ${API_BASE}`);
  console.log('─'.repeat(50));

  // Handle --both flag
  if (args.includes('--both')) {
    console.log('\nCreating orders for both demo123 and test-001...');
    await createOrder('demo123');
    await createOrder('test-001');
    console.log('\n✅ Done! Created 1 order for each restaurant.');
    return;
  }

  // Parse args
  const restaurantId = args[0] || 'demo123';
  const count = parseInt(args[1], 10) || 1;

  console.log(`\nCreating ${count} order(s) for restaurant: ${restaurantId}`);

  for (let i = 0; i < count; i++) {
    await createOrder(restaurantId);
    // Small delay between orders
    if (i < count - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ Done! Created ${count} order(s) for ${restaurantId}.`);
  console.log(`\nView orders at: http://localhost:3000/${restaurantId}`);
}

main().catch(err => {
  console.error('\n❌ Script failed:', err.message);
  process.exit(1);
});

