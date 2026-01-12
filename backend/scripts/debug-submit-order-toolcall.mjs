/**
 * Debug script: simulate Vapi calling the submit_order function tool endpoint.
 *
 * This script calls the Lambda Function URL configured in Vapi and records
 * response status/body parsing to help diagnose "no result returned".
 *
 * Usage:
 *   node scripts/debug-submit-order-toolcall.mjs
 *   node scripts/debug-submit-order-toolcall.mjs --mode args
 *   node scripts/debug-submit-order-toolcall.mjs --url https://...lambda-url.../ --mode args
 */

import { URL } from 'url';

function getArg(key, fallback) {
  const args = process.argv.slice(2);
  const eq = args.find(a => a.startsWith(`${key}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(key);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const endpointUrl = getArg('--url', 'https://rcllq4uqrduewek56gktgprk6m0dcgaf.lambda-url.us-east-2.on.aws/');
const mode = getArg('--mode', 'args'); // "args" or "wrapper"

// Minimal payload that matches the Vapi tool schema (no PII; dummy phone).
const orderSize = getArg('--size', 'small'); // small, medium, large for different test sizes

const smallPayload = {
  orderType: 'pickup',
  customerPhone: '+15555550123',
  pizzas: [{ size: 'Personal', crust: 'Thin', wholeToppings: ['Pepperoni'] }],
  sides: []
};

const mediumPayload = {
  orderType: 'delivery',
  customerPhone: '+15555550123',
  deliveryAddress: '123 Main St, 60008',
  pizzas: [
    { size: 'Large', crust: 'Thin', wholeToppings: ['Pepperoni', 'Mushrooms'] },
    { size: 'Medium', crust: 'Thin', wholeToppings: ['Sausage'] }
  ],
  sides: [{ name: 'Fries', quantity: 2 }]
};

const largePayload = {
  orderType: 'delivery',
  customerPhone: '+15555550123',
  deliveryAddress: '456 Oak Ave, 60008',
  pizzas: [
    { size: 'Large', crust: 'Thin', wholeToppings: ['Pepperoni'] },
    { size: 'Large', crust: 'Thin', wholeToppings: ['Sausage'] },
    { size: 'XLarge', crust: 'Double', wholeToppings: ['Cheese'] },
    { size: 'Medium', crust: 'Thin', wholeToppings: ['Ham', 'Pineapple'] }
  ],
  sides: [
    { name: 'Wings (12pc)', quantity: 1 },
    { name: 'Garlic Knots', quantity: 2 },
    { name: 'Fries', quantity: 3 }
  ]
};

const argsPayload = orderSize === 'large' ? largePayload 
                  : orderSize === 'medium' ? mediumPayload 
                  : smallPayload;

// Some systems send a wrapper structure; keep for testing shape mismatch.
const wrapperPayload = {
  message: {
    toolCalls: [
      {
        function: {
          name: 'submit_order',
          arguments: JSON.stringify(argsPayload)
        }
      }
    ]
  }
};

const payload = mode === 'wrapper' ? wrapperPayload : argsPayload;

const runId = getArg('--runId', 'pre-fix');
const safeUrlHost = (() => {
  try {
    return new URL(endpointUrl).host;
  } catch {
    return 'invalid-url';
  }
})();

const start = Date.now();

const controller = new AbortController();
const timeoutMs = 20_000;
const timeout = setTimeout(() => controller.abort(), timeoutMs);

let res;
let text = '';
let durationMs = 0;
try {
  res = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  text = await res.text();
  durationMs = Date.now() - start;
} catch (e) {
  durationMs = Date.now() - start;
  console.error('Request failed:', e?.name, e?.message);
  process.exitCode = 1;
  clearTimeout(timeout);
  process.exit(1);
}
clearTimeout(timeout);

const contentType = res.headers.get('content-type') || '';

let parsed = null;
let parseError = null;
try {
  parsed = text ? JSON.parse(text) : null;
} catch (e) {
  parseError = e;
}

console.log('--- submit_order debug ---');
console.log('URL:', endpointUrl);
console.log('Mode:', mode);
console.log('HTTP:', res.status, res.statusText);
console.log('Content-Type:', contentType || '(none)');
console.log('Duration(ms):', durationMs);
console.log('Body length:', text.length);

if (parsed) {
  console.log('\n=== Parsed Response ===');
  console.log(JSON.stringify(parsed, null, 2));
  
  // Validate Vapi response format
  console.log('\n=== Validation ===');
  const hasResults = Array.isArray(parsed.results);
  console.log(hasResults ? '✅ Has "results" array' : '❌ Missing "results" array');
  
  if (hasResults && parsed.results[0]) {
    const result = parsed.results[0].result;
    if (result) {
      console.log('✅ Has result object');
      
      // Check for ETA fields
      const hasEtaMin = typeof result.etaMinMinutes === 'number';
      const hasEtaMax = typeof result.etaMaxMinutes === 'number';
      const hasEtaText = typeof result.etaText === 'string';
      
      console.log(hasEtaMin ? `✅ etaMinMinutes: ${result.etaMinMinutes}` : '❌ Missing etaMinMinutes');
      console.log(hasEtaMax ? `✅ etaMaxMinutes: ${result.etaMaxMinutes}` : '❌ Missing etaMaxMinutes');
      console.log(hasEtaText ? `✅ etaText: "${result.etaText}"` : '❌ Missing etaText');
      console.log(result.total ? `✅ total: $${result.total}` : '❌ Missing total');
      console.log(result.orderId ? `✅ orderId: ${result.orderId}` : '❌ Missing orderId');
    } else if (parsed.results[0].error) {
      console.log(`❌ Error: ${parsed.results[0].error}`);
    }
  }
} else {
  console.log('Body preview:', text.slice(0, 500));
}







