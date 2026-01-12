/**
 * Comprehensive test script for delivery order flow
 * 
 * Tests both address lookup and order submission with various scenarios:
 * - Real addresses in ZIP 60008 (found, ambiguous, not found)
 * - Fake addresses (should fail gracefully)
 * - Delivery orders with verified addresses
 * - Pickup orders (baseline)
 * 
 * Usage:
 *   node scripts/test-delivery-flow.mjs
 *   node scripts/test-delivery-flow.mjs --address-url https://.../address/lookup
 *   node scripts/test-delivery-flow.mjs --order-url https://.../vapi/webhook
 *   node scripts/test-delivery-flow.mjs --address-only    # Only run address tests
 *   node scripts/test-delivery-flow.mjs --order-only      # Only run order tests
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

function getArg(key, fallback) {
  const args = process.argv.slice(2);
  const eq = args.find(a => a.startsWith(`${key}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(key);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

function hasFlag(key) {
  return process.argv.slice(2).includes(key);
}

const addressUrl = getArg('--address-url', 'https://b850esmck5.execute-api.us-east-2.amazonaws.com/address/lookup');
const orderUrl = getArg('--order-url', 'https://b850esmck5.execute-api.us-east-2.amazonaws.com/vapi/webhook');
const addressOnly = hasFlag('--address-only');
const orderOnly = hasFlag('--order-only');

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80));
}

function logTest(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const color = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
  log(`${icon} ${name}`, color);
  if (details) {
    console.log(`   ${details}`);
  }
}

// Run a test script and capture output
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd();
    const hereDir = path.dirname(fileURLToPath(import.meta.url));
    const backendDir = path.resolve(hereDir, '..');
    const resolvedFromCwd = path.resolve(cwd, scriptPath);
    const resolvedFromBackend = path.resolve(backendDir, scriptPath);
    const existsFromCwd = fs.existsSync(resolvedFromCwd);
    const existsFromBackend = fs.existsSync(resolvedFromBackend);
    const argKeys = args.filter((a) => typeof a === 'string' && a.startsWith('--'));
    const effectiveScriptPath = path.isAbsolute(scriptPath)
      ? scriptPath
      : (existsFromCwd ? resolvedFromCwd : resolvedFromBackend);

    const proc = spawn('node', [effectiveScriptPath, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
        success: code === 0,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// Parse test output to determine pass/fail
function parseLookupResult(output) {
  const hasResults = output.includes('"results"') || output.includes('results:');
  const hasError = output.includes('"error"') || output.includes('error:');
  
  // Check for specific result types
  const found = output.includes('"result":"found"') || output.includes('"result": "found"');
  const ambiguous = output.includes('"result":"ambiguous"') || output.includes('"result": "ambiguous"');
  const notFound = output.includes('"result":"not_found"') || output.includes('"result": "not_found"');
  const zipNotCovered = output.includes('"result":"zip_not_covered"') || output.includes('"result": "zip_not_covered"');
  
  return {
    hasResults,
    hasError,
    found,
    ambiguous,
    notFound,
    zipNotCovered,
    http200: output.includes('HTTP Status: 200'),
  };
}

function parseOrderResult(output) {
  const hasResults = output.includes('"results"') || output.includes('results:');
  const hasError = output.includes('"error"') || output.includes('error:');
  const hasOrderId = output.includes('orderId') || output.includes('order_id');
  const hasEta = output.includes('eta') || output.includes('ETA');
  const http200 = output.includes('HTTP Status: 200');
  
  return {
    hasResults,
    hasError,
    hasOrderId,
    hasEta,
    http200,
  };
}

// Test results tracker
const results = {
  address: { pass: 0, fail: 0, total: 0 },
  order: { pass: 0, fail: 0, total: 0 },
};

// ============================================================================
// ADDRESS LOOKUP TESTS - Real 60008 ZIP Addresses
// ============================================================================

const addressTests = [
  // ========== EXPECTED: FOUND OR AMBIGUOUS (Grouse has Lane + Court variants) ==========
  {
    name: 'Grouse Lane (full suffix) → found or ambiguous',
    runId: 'found_grouse_lane',
    args: ['--runId', 'found_grouse_lane', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', 'Grouse Lane'],
    expected: { found: true, ambiguous: true }, // Both acceptable - depends on tie-breaking
  },
  {
    name: 'Grouse Ln (abbreviation) → found or ambiguous',
    runId: 'found_grouse_ln',
    args: ['--runId', 'found_grouse_ln', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', 'Grouse Ln'],
    expected: { found: true, ambiguous: true },
  },
  {
    name: 'Grouse LN (uppercase abbrev) → found or ambiguous',
    runId: 'found_grouse_ln_upper',
    args: ['--runId', 'found_grouse_ln_upper', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', 'Grouse LN'],
    expected: { found: true, ambiguous: true },
  },
  {
    name: 'GROUSE LANE (all caps) → found or ambiguous',
    runId: 'found_grouse_allcaps',
    args: ['--runId', 'found_grouse_allcaps', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', 'GROUSE LANE'],
    expected: { found: true, ambiguous: true },
  },
  {
    name: 'grouse lane (lowercase) → found or ambiguous',
    runId: 'found_grouse_lowercase',
    args: ['--runId', 'found_grouse_lowercase', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', 'grouse lane'],
    expected: { found: true, ambiguous: true },
  },
  
  // Real streets in Rolling Meadows / 60008 area
  {
    name: 'Found: Algonquin Road (major road)',
    runId: 'found_algonquin_rd',
    args: ['--runId', 'found_algonquin_rd', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '3500', '--street', 'Algonquin Road'],
    expected: { found: true, ambiguous: true, notFound: true }, // Accept any - may not be seeded
  },
  {
    name: 'Found: Kirchoff Road',
    runId: 'found_kirchoff_rd',
    args: ['--runId', 'found_kirchoff_rd', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2100', '--street', 'Kirchoff Road'],
    expected: { found: true, ambiguous: true, notFound: true }, // Accept any - may not be seeded
  },
  {
    name: 'Found: Golf Road',
    runId: 'found_golf_rd',
    args: ['--runId', 'found_golf_rd', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '4000', '--street', 'Golf Road'],
    expected: { found: true, ambiguous: true, notFound: true }, // Accept any
  },
  
  // ========== EXPECTED: AMBIGUOUS ==========
  {
    name: 'Ambiguous: Grouse (no suffix - Lane vs Court)',
    runId: 'ambiguous_grouse_no_suffix',
    args: ['--runId', 'ambiguous_grouse_no_suffix', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', 'Grouse'],
    expected: { ambiguous: true },
  },
  
  // ========== PUNCTUATION & EDGE CASES ==========
  {
    name: 'Punctuation: Grouse Ln, (trailing comma)',
    runId: 'punct_trailing_comma',
    args: ['--runId', 'punct_trailing_comma', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', 'Grouse Ln,'],
    expected: { found: true, ambiguous: true }, // Accept both - punctuation should be stripped
  },
  {
    name: 'Punctuation: Grouse. Lane. (periods)',
    runId: 'punct_periods',
    args: ['--runId', 'punct_periods', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', 'Grouse. Lane.'],
    expected: { found: true, ambiguous: true },
  },
  {
    name: 'Extra spaces: "  Grouse   Lane  "',
    runId: 'extra_spaces',
    args: ['--runId', 'extra_spaces', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--street', '  Grouse   Lane  '],
    expected: { found: true, ambiguous: true }, // Accept both - spaces should be normalized
  },
  
  // ========== SPELLED STREET NAME (phonetic) ==========
  {
    name: 'Spelled: G-R-O-U-S-E (letter by letter)',
    runId: 'spelled_grouse',
    args: ['--runId', 'spelled_grouse', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '2202', '--spelled', 'G R O U S E'],
    expected: { found: true, ambiguous: true }, // May return ambiguous without suffix
  },
  
  // ========== EXPECTED: NOT FOUND (fake streets) ==========
  {
    name: 'Not Found: Banana Boulevard (fake)',
    runId: 'fake_banana_blvd',
    args: ['--runId', 'fake_banana_blvd', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '123', '--street', 'Banana Boulevard'],
    expected: { notFound: true },
  },
  {
    name: 'Not Found: Zzyzx Road (fake)',
    runId: 'fake_zzyzx_rd',
    args: ['--runId', 'fake_zzyzx_rd', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '9999', '--street', 'Zzyzx Road'],
    expected: { notFound: true },
  },
  {
    name: 'Not Found: Unicorn Street (fake)',
    runId: 'fake_unicorn_st',
    args: ['--runId', 'fake_unicorn_st', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '42', '--street', 'Unicorn Street'],
    expected: { notFound: true },
  },
  {
    name: 'Not Found: Pizza Paradise Lane (fake)',
    runId: 'fake_pizza_paradise',
    args: ['--runId', 'fake_pizza_paradise', '--omit-metadata', '--url', addressUrl, '--zip', '60008', '--number', '1', '--street', 'Pizza Paradise Lane'],
    expected: { notFound: true },
  },
  
  // ========== EXPECTED: ZIP NOT COVERED ==========
  {
    name: 'Zip Not Covered: 90210 (Beverly Hills)',
    runId: 'zip_not_covered_90210',
    args: ['--runId', 'zip_not_covered_90210', '--omit-metadata', '--url', addressUrl, '--zip', '90210', '--number', '123', '--street', 'Rodeo Drive'],
    expected: { zipNotCovered: true, notFound: true },
  },
  {
    name: 'Zip Not Covered: 10001 (NYC)',
    runId: 'zip_not_covered_10001',
    args: ['--runId', 'zip_not_covered_10001', '--omit-metadata', '--url', addressUrl, '--zip', '10001', '--number', '350', '--street', '5th Avenue'],
    expected: { zipNotCovered: true, notFound: true },
  },
];

async function runAddressTests() {
  logSection('ADDRESS LOOKUP TESTS');
  
  for (const test of addressTests) {
    results.address.total++;
    log(`\n▶ Running: ${test.name}`, 'cyan');
    
    try {
      const result = await runScript('scripts/debug-lookup-address-toolcall.mjs', test.args);
      const parsed = parseLookupResult(result.stdout + result.stderr);
      
      // Check expectations
      let passed = true;
      let details = [];
      
      if (!parsed.http200) {
        passed = false;
        details.push('HTTP status not 200');
      }
      
      if (!parsed.hasResults) {
        passed = false;
        details.push('Missing "results" array');
      }
      
      // Check if ANY expected result type matched (flexible matching)
      const expectedTypes = [];
      if (test.expected.found) expectedTypes.push('found');
      if (test.expected.ambiguous) expectedTypes.push('ambiguous');
      if (test.expected.notFound) expectedTypes.push('not_found');
      if (test.expected.zipNotCovered) expectedTypes.push('zip_not_covered');
      
      const actualTypes = [];
      if (parsed.found) actualTypes.push('found');
      if (parsed.ambiguous) actualTypes.push('ambiguous');
      if (parsed.notFound) actualTypes.push('not_found');
      if (parsed.zipNotCovered) actualTypes.push('zip_not_covered');
      
      const anyExpectedMatch = expectedTypes.some(t => actualTypes.includes(t));
      
      if (!anyExpectedMatch && expectedTypes.length > 0) {
        passed = false;
        details.push(`Expected one of [${expectedTypes.join(', ')}] but got [${actualTypes.join(', ') || 'unknown'}]`);
      } else if (actualTypes.length > 0) {
        details.push(`Result: ${actualTypes.join(', ')}`);
      }
      
      if (parsed.hasError && !test.expected.error) {
        // Check if error is in the expected results context
        const errorInOutput = result.stdout.includes('"error"');
        if (errorInOutput && actualTypes.length === 0) {
          passed = false;
          details.push('Unexpected error in response');
        }
      }
      
      if (passed) {
        results.address.pass++;
        logTest(test.name, 'PASS', details.join('; ') || 'All checks passed');
      } else {
        results.address.fail++;
        logTest(test.name, 'FAIL', details.join('; '));
        // Show relevant output snippet
        const outputPreview = (result.stdout + result.stderr).slice(0, 600);
        if (outputPreview.includes('"result"')) {
          const match = outputPreview.match(/"result"\s*:\s*"[^"]+"/);
          if (match) console.log(`   Found in output: ${match[0]}`);
        }
      }
    } catch (error) {
      results.address.fail++;
      logTest(test.name, 'FAIL', `Script error: ${error.message}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

// ============================================================================
// ORDER SUBMISSION TESTS
// ============================================================================

// Helper to submit a custom order payload directly
async function submitOrder(payload) {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutMs = 25_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  let text = '';
  let durationMs = 0;
  let stdout = '';
  let stderr = '';

  try {
    res = await fetch(orderUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    text = await res.text();
    durationMs = Date.now() - start;
  } catch (e) {
    durationMs = Date.now() - start;
    stderr = `Request failed: ${e?.name} ${e?.message}`;
    clearTimeout(timeout);
    return {
      code: 1,
      stdout: '',
      stderr,
      success: false,
    };
  }
  clearTimeout(timeout);

  stdout += `HTTP Status: ${res.status} ${res.statusText}\n`;
  stdout += `Duration(ms): ${durationMs}\n`;
  stdout += `Body length: ${text.length}\n`;

  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (e) {
    stdout += `JSON parse error: ${e.message}\n`;
  }

  if (parsed) {
    stdout += '\n=== Parsed Response ===\n';
    stdout += JSON.stringify(parsed, null, 2) + '\n';
  } else {
    stdout += '\nBody preview: ' + text.slice(0, 500) + '\n';
  }

  return {
    code: res.ok ? 0 : 1,
    stdout,
    stderr,
    success: res.ok,
    parsed,
  };
}

const orderTests = [
  // ========== PICKUP ORDERS ==========
  {
    name: 'Pickup: Simple (1 pizza)',
    description: 'Basic pickup order with one pizza',
    payload: {
      orderType: 'pickup',
      customerPhone: '+15555550101',
      pizzas: [
        { size: 'Large', crust: 'Thin', wholeToppings: ['Pepperoni'] }
      ],
      sides: []
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Pickup: Medium (2 pizzas + side)',
    description: 'Pickup with multiple items',
    payload: {
      orderType: 'pickup',
      customerPhone: '+15555550102',
      pizzas: [
        { size: 'Large', crust: 'Thin', wholeToppings: ['Pepperoni', 'Mushrooms'] },
        { size: 'Medium', crust: 'Regular', wholeToppings: ['Sausage'] }
      ],
      sides: [
        { name: 'Garlic Knots', quantity: 1 }
      ]
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Pickup: Large order (4 pizzas + 3 sides)',
    description: 'Large family order for pickup',
    payload: {
      orderType: 'pickup',
      customerPhone: '+15555550103',
      pizzas: [
        { size: 'XLarge', crust: 'Double', wholeToppings: ['Cheese'] },
        { size: 'Large', crust: 'Thin', wholeToppings: ['Pepperoni', 'Sausage'] },
        { size: 'Large', crust: 'Thin', wholeToppings: ['Mushrooms', 'Onions', 'Peppers'] },
        { size: 'Medium', crust: 'Regular', wholeToppings: ['Ham', 'Pineapple'] }
      ],
      sides: [
        { name: 'Wings (12pc)', quantity: 2 },
        { name: 'Fries', quantity: 2 },
        { name: 'Garlic Knots', quantity: 1 }
      ]
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  
  // ========== DELIVERY ORDERS - REAL 60008 ADDRESSES ==========
  {
    name: 'Delivery: Grouse Lane (verified)',
    description: 'Delivery to verified address in 60008',
    payload: {
      orderType: 'delivery',
      customerPhone: '+15555550201',
      deliveryAddress: '2202 Grouse Lane, Rolling Meadows, IL 60008',
      pizzas: [
        { size: 'Large', crust: 'Thin', wholeToppings: ['Pepperoni', 'Mushrooms'] }
      ],
      sides: [
        { name: 'Fries', quantity: 1 }
      ]
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Delivery: Grouse Ln (abbreviated)',
    description: 'Delivery using abbreviated street suffix',
    payload: {
      orderType: 'delivery',
      customerPhone: '+15555550202',
      deliveryAddress: '2202 Grouse Ln, 60008',
      pizzas: [
        { size: 'Medium', crust: 'Regular', wholeToppings: ['Sausage', 'Peppers'] }
      ],
      sides: []
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Delivery: Large order to Grouse Lane',
    description: 'Party order delivery',
    payload: {
      orderType: 'delivery',
      customerPhone: '+15555550203',
      deliveryAddress: '2202 Grouse Lane, 60008',
      pizzas: [
        { size: 'XLarge', crust: 'Double', wholeToppings: ['Pepperoni'] },
        { size: 'XLarge', crust: 'Thin', wholeToppings: ['Sausage', 'Mushrooms'] },
        { size: 'Large', crust: 'Thin', wholeToppings: ['Cheese'] },
        { size: 'Large', crust: 'Regular', wholeToppings: ['Pepperoni', 'Sausage', 'Mushrooms'] }
      ],
      sides: [
        { name: 'Wings (12pc)', quantity: 3 },
        { name: 'Garlic Knots', quantity: 2 },
        { name: 'Fries', quantity: 4 }
      ]
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Delivery: Algonquin Road',
    description: 'Delivery to major road in 60008',
    payload: {
      orderType: 'delivery',
      customerPhone: '+15555550204',
      deliveryAddress: '3500 Algonquin Road, Rolling Meadows, IL 60008',
      pizzas: [
        { size: 'Large', crust: 'Thin', wholeToppings: ['Pepperoni'] }
      ],
      sides: []
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Delivery: Kirchoff Road',
    description: 'Delivery to Kirchoff Rd area',
    payload: {
      orderType: 'delivery',
      customerPhone: '+15555550205',
      deliveryAddress: '2100 Kirchoff Road, Rolling Meadows, IL 60008',
      pizzas: [
        { size: 'Medium', crust: 'Thin', wholeToppings: ['Ham', 'Pineapple'] },
        { size: 'Personal', crust: 'Regular', wholeToppings: ['Cheese'] }
      ],
      sides: [
        { name: 'Fries', quantity: 1 }
      ]
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Delivery: Golf Road',
    description: 'Delivery to Golf Rd shopping area',
    payload: {
      orderType: 'delivery',
      customerPhone: '+15555550206',
      deliveryAddress: '4000 Golf Road, 60008',
      pizzas: [
        { size: 'Large', crust: 'Double', wholeToppings: ['Pepperoni', 'Sausage'] }
      ],
      sides: [
        { name: 'Wings (12pc)', quantity: 1 }
      ]
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  
  // ========== EDGE CASES ==========
  {
    name: 'Delivery: Minimal info (just ZIP)',
    description: 'Address with minimal formatting',
    payload: {
      orderType: 'delivery',
      customerPhone: '+15555550301',
      deliveryAddress: '2202 Grouse Ln 60008',
      pizzas: [
        { size: 'Large', crust: 'Thin', wholeToppings: ['Cheese'] }
      ],
      sides: []
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Order: Pizza only (no sides)',
    description: 'Order with empty sides array',
    payload: {
      orderType: 'pickup',
      customerPhone: '+15555550302',
      pizzas: [
        { size: 'Personal', crust: 'Thin', wholeToppings: ['Pepperoni'] }
      ],
      sides: []
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Order: Sides only (no pizzas)',
    description: 'Order with only side items',
    payload: {
      orderType: 'pickup',
      customerPhone: '+15555550303',
      pizzas: [],
      sides: [
        { name: 'Wings (12pc)', quantity: 2 },
        { name: 'Fries', quantity: 3 }
      ]
    },
    expected: { hasOrderId: true, hasEta: true },
  },
  {
    name: 'Order: Many toppings pizza',
    description: 'Supreme pizza with many toppings',
    payload: {
      orderType: 'pickup',
      customerPhone: '+15555550304',
      pizzas: [
        { 
          size: 'XLarge', 
          crust: 'Double', 
          wholeToppings: ['Pepperoni', 'Sausage', 'Mushrooms', 'Onions', 'Peppers', 'Olives']
        }
      ],
      sides: []
    },
    expected: { hasOrderId: true, hasEta: true },
  },
];

async function runOrderTests() {
  logSection('ORDER SUBMISSION TESTS');
  
  for (const test of orderTests) {
    results.order.total++;
    log(`\n▶ Running: ${test.name}`, 'cyan');
    log(`  ${test.description}`, 'blue');
    
    try {
      const result = await submitOrder(test.payload);
      const parsed = parseOrderResult(result.stdout + result.stderr);
      
      // Check expectations
      let passed = true;
      let details = [];
      
      if (!parsed.http200) {
        passed = false;
        details.push('HTTP status not 200');
      }
      
      if (!parsed.hasResults && !parsed.hasOrderId) {
        passed = false;
        details.push('Missing "results" array or orderId');
      }
      
      if (test.expected.hasOrderId && !parsed.hasOrderId) {
        passed = false;
        details.push('Missing orderId in response');
      }
      
      if (test.expected.hasEta && !parsed.hasEta) {
        passed = false;
        details.push('Missing ETA in response');
      }
      
      if (parsed.hasError) {
        // Check if it's actually an error or just the word appearing
        const actualError = result.stdout.includes('"error":') && 
                           !result.stdout.includes('"error": null');
        if (actualError) {
          passed = false;
          details.push('Error in response');
        }
      }
      
      // Extract order details for successful orders
      if (result.parsed?.results?.[0]?.result) {
        const orderResult = result.parsed.results[0].result;
        if (orderResult.orderId) {
          details.push(`orderId: ${orderResult.orderId}`);
        }
        if (orderResult.total) {
          details.push(`total: $${orderResult.total}`);
        }
        if (orderResult.etaText) {
          details.push(`ETA: ${orderResult.etaText}`);
        }
      }
      
      if (passed) {
        results.order.pass++;
        logTest(test.name, 'PASS', details.join(' | '));
      } else {
        results.order.fail++;
        logTest(test.name, 'FAIL', details.join('; '));
        if (result.stdout) {
          console.log('   Output preview:', result.stdout.slice(0, 400));
        }
      }
    } catch (error) {
      results.order.fail++;
      logTest(test.name, 'FAIL', `Script error: ${error.message}`);
    }
    
    // Delay between order tests (creates real orders)
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  log('\n🚀 DELIVERY FLOW TEST SUITE', 'bright');
  log('━'.repeat(80), 'magenta');
  log(`📍 Address Lookup URL: ${addressUrl}`, 'cyan');
  log(`📦 Order Webhook URL:  ${orderUrl}`, 'cyan');
  log('━'.repeat(80), 'magenta');
  
  const startTime = Date.now();
  
  try {
    // Run tests based on flags
    if (!orderOnly) {
      await runAddressTests();
    }
    
    if (!addressOnly) {
      await runOrderTests();
    }
    
    // Summary
    logSection('📊 TEST SUMMARY');
    
    if (!orderOnly) {
      const addressPct = results.address.total > 0 
        ? ((results.address.pass / results.address.total) * 100).toFixed(1)
        : 0;
      log(`🔍 Address Lookup: ${results.address.pass}/${results.address.total} passed (${addressPct}%)`, 
          results.address.fail === 0 ? 'green' : 'red');
    }
    
    if (!addressOnly) {
      const orderPct = results.order.total > 0
        ? ((results.order.pass / results.order.total) * 100).toFixed(1)
        : 0;
      log(`📦 Order Submission: ${results.order.pass}/${results.order.total} passed (${orderPct}%)`,
          results.order.fail === 0 ? 'green' : 'red');
    }
    
    const totalPass = results.address.pass + results.order.pass;
    const totalFail = results.address.fail + results.order.fail;
    const totalTests = results.address.total + results.order.total;
    const totalPct = totalTests > 0 ? ((totalPass / totalTests) * 100).toFixed(1) : 0;
    
    console.log('');
    log(`🎯 OVERALL: ${totalPass}/${totalTests} passed (${totalPct}%)`,
        totalFail === 0 ? 'green' : totalFail < 3 ? 'yellow' : 'red');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`⏱️  Duration: ${duration}s`, 'cyan');
    
    // Exit code based on results
    process.exitCode = totalFail === 0 ? 0 : 1;
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exitCode = 1;
  }
}

// Run if executed directly
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
