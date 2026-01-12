/**
 * Debug script: simulate Vapi calling the lookup_address function tool endpoint.
 *
 * This script calls the Lambda endpoint and records response to help diagnose issues.
 *
 * Usage:
 *   node scripts/debug-lookup-address-toolcall.mjs
 *   node scripts/debug-lookup-address-toolcall.mjs --url https://... --zip 60008 --number 2202 --street "Grouse Lane"
 *   node scripts/debug-lookup-address-toolcall.mjs --omit-metadata --spelled "Grouse"
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

function hasFlag(key) {
  return process.argv.slice(2).includes(key);
}

const endpointUrl = getArg('--url', 'https://b850esmck5.execute-api.us-east-2.amazonaws.com/address/lookup');
const runId = getArg('--runId', 'test');
const omitMetadata = hasFlag('--omit-metadata');

// Address parameters
const zipCode = getArg('--zip', '60008');
const streetNumber = getArg('--number', '2202');
const streetName = getArg('--street', 'Grouse Lane');
const spelledStreetName = getArg('--spelled', '');

// Build the tool call payload
function buildPayload() {
  const toolArgs = {
    zipCode,
    streetNumber,
    streetName,
  };
  
  if (spelledStreetName) {
    toolArgs.spelledStreetName = spelledStreetName;
  }

  // When omit-metadata is set, we simulate Vapi calling without restaurantId
  // This tests the DEFAULT_RESTAURANT_ID fallback
  if (omitMetadata) {
    // Direct args format (no metadata wrapper)
    return toolArgs;
  }

  // Full Vapi-style payload with metadata
  return {
    message: {
      toolCalls: [
        {
          id: `call_${runId}_${Date.now()}`,
          function: {
            name: 'lookup_address',
            arguments: JSON.stringify(toolArgs),
          },
        },
      ],
    },
    assistant: {
      metadata: {
        restaurantId: 'rest-001',
      },
    },
  };
}

const payload = buildPayload();

const safeUrlHost = (() => {
  try {
    return new URL(endpointUrl).host;
  } catch {
    return 'invalid-url';
  }
})();

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

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
    signal: controller.signal,
  });
  text = await res.text();
  durationMs = Date.now() - start;
} catch (e) {
  durationMs = Date.now() - start;
  console.error('Request failed:', e?.name, e?.message);
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

console.log('\n--- lookup_address debug ---');
log(`URL: ${endpointUrl}`, 'cyan');
log(`RunId: ${runId}`, 'cyan');
log(`Omit Metadata: ${omitMetadata}`, 'cyan');
console.log(`HTTP Status: ${res.status} ${res.statusText}`);
console.log(`Content-Type: ${contentType || '(none)'}`);
console.log(`Duration(ms): ${durationMs}`);
console.log(`Body length: ${text.length}`);

console.log('\n--- Request Payload ---');
console.log(JSON.stringify(payload, null, 2));

if (parsed) {
  console.log('\n=== Parsed Response ===');
  console.log(JSON.stringify(parsed, null, 2));

  console.log('\n=== Validation ===');
  const hasResults = Array.isArray(parsed.results);
  log(hasResults ? '✅ Has "results" array' : '❌ Missing "results" array', hasResults ? 'green' : 'red');

  if (hasResults && parsed.results[0]) {
    const entry = parsed.results[0];
    
    if (entry.toolCallId) {
      log(`✅ toolCallId: ${entry.toolCallId}`, 'green');
    }
    
    if (entry.result) {
      const result = entry.result;
      log(`✅ result: "${result.result}"`, 'green');
      
      if (result.result === 'found') {
        log(`   normalizedAddress: ${result.normalizedAddress}`, 'cyan');
      } else if (result.result === 'ambiguous') {
        log(`   confirmPrompt: ${result.confirmPrompt}`, 'yellow');
        log(`   candidates: ${JSON.stringify(result.candidates)}`, 'yellow');
      } else if (result.result === 'not_found') {
        log(`   message: ${result.message}`, 'yellow');
      } else if (result.result === 'zip_not_covered') {
        log(`   message: ${result.message}`, 'red');
      }
    } else if (entry.error) {
      log(`❌ Error: ${entry.error}`, 'red');
    }
  }
} else {
  console.log('Body preview:', text.slice(0, 500));
  if (parseError) {
    log(`❌ JSON parse error: ${parseError.message}`, 'red');
  }
}

// Exit with appropriate code
process.exitCode = res.ok ? 0 : 1;
