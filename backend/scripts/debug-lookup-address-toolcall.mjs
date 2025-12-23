/**
 * Debug script: simulate Vapi calling the lookup_address function tool endpoint.
 *
 * This script calls the Lambda Function URL configured in Vapi and validates
 * response status/body parsing to help diagnose "no result returned" errors.
 *
 * Usage:
 *   node scripts/debug-lookup-address-toolcall.mjs
 *   node scripts/debug-lookup-address-toolcall.mjs --mode wrapped
 *   node scripts/debug-lookup-address-toolcall.mjs --url https://...lambda-url.../
 *   node scripts/debug-lookup-address-toolcall.mjs --spelled "Grouse"
 *
 * Options:
 *   --url       Lambda Function URL (defaults to production)
 *   --mode      "args" (raw args in body) or "wrapped" (Vapi tool call format)
 *   --spelled   Test the spelled street name fallback
 *   --zip       ZIP code to test (default: 60008)
 *   --street    Street name to test (default: "Grouse Lane")
 */

import { URL } from 'url';

const INGEST_URL = 'http://127.0.0.1:7243/ingest/f77fc304-00be-4268-a2f4-fec2e797516e';

function getArg(key, fallback) {
  const args = process.argv.slice(2);
  const eq = args.find(a => a.startsWith(`${key}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(key);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const endpointUrl = getArg('--url', 'https://rcllq4uqrduewek56gktgprk6m0dcgaf.lambda-url.us-east-2.on.aws/');
const mode = getArg('--mode', 'wrapped'); // "args" or "wrapped"
const spelledStreetName = getArg('--spelled', null);
const zipCode = getArg('--zip', '60008');
const streetName = getArg('--street', 'Grouse Lane');
const streetNumber = getArg('--number', '2202');
const runId = getArg('--runId', `run_${Date.now().toString(36)}`);
const omitMetadata = process.argv.includes('--omit-metadata');

// Generate a fake toolCallId like Vapi does
const fakeToolCallId = `call_test_${Date.now().toString(36)}`;

// Build the tool arguments
const toolArgs = {
  zipCode,
  streetNumber,
  streetName: spelledStreetName ? undefined : streetName,
  spelledStreetName: spelledStreetName || undefined,
  attempt: spelledStreetName ? 2 : 1,
};

// Clean undefined values
Object.keys(toolArgs).forEach(k => toolArgs[k] === undefined && delete toolArgs[k]);

// Raw args payload (direct arguments in body)
const argsPayload = {
  ...toolArgs,
  ...(omitMetadata ? {} : { restaurantId: 'rest-001' }), // Default test restaurant
};

// Wrapped payload (Vapi tool call format with toolCallId)
const wrappedPayload = {
  message: {
    type: 'tool-calls',
    toolCalls: [
      {
        id: fakeToolCallId,
        function: {
          name: 'lookup_address',
          arguments: JSON.stringify(toolArgs)
        }
      }
    ]
  },
  ...(omitMetadata ? {} : {
    assistant: {
      metadata: {
        restaurantId: 'rest-001'
      }
    }
  })
};

const payload = mode === 'wrapped' ? wrappedPayload : argsPayload;

const safeUrlHost = (() => {
  try {
    return new URL(endpointUrl).host;
  } catch {
    return 'invalid-url';
  }
})();

// #region agent log H1
fetch(INGEST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H1', location: 'debug-lookup-address-toolcall.mjs:entry', message: 'Starting lookup_address simulation', data: { mode, urlHost: safeUrlHost, hasSpelled: !!spelledStreetName, zipCode, omitMetadata }, timestamp: Date.now() }) }).catch(() => {});
// #endregion

console.log('=== lookup_address debug ===');
console.log('URL:', endpointUrl);
console.log('Mode:', mode);
console.log('Expected toolCallId:', fakeToolCallId);
console.log('Payload:', JSON.stringify(payload, null, 2));
console.log('');

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
  // #region agent log H2
  fetch(INGEST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H2', location: 'debug-lookup-address-toolcall.mjs:fetch', message: 'HTTP request failed', data: { urlHost: safeUrlHost, durationMs, errorName: e?.name, errorMessage: String(e?.message || '').slice(0, 200) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
  console.error('❌ Request failed:', e?.name, e?.message);
  console.error('Duration(ms):', durationMs);
  clearTimeout(timeout);
  process.exit(1);
}
clearTimeout(timeout);

const contentType = res.headers.get('content-type') || '';

// #region agent log H2
fetch(INGEST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H2', location: 'debug-lookup-address-toolcall.mjs:response', message: 'Received HTTP response', data: { urlHost: safeUrlHost, status: res.status, ok: res.ok, contentType: contentType.slice(0, 80), durationMs, bodyLen: text.length }, timestamp: Date.now() }) }).catch(() => {});
// #endregion

console.log('=== Response ===');
console.log('HTTP Status:', res.status, res.statusText);
console.log('Content-Type:', contentType || '(none)');
console.log('Duration(ms):', durationMs);
console.log('Body length:', text.length);
console.log('');

// Parse and validate response
let parsed = null;
let parseError = null;
try {
  parsed = text ? JSON.parse(text) : null;
} catch (e) {
  parseError = e;
}

if (parseError) {
  // #region agent log H3
  fetch(INGEST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H3', location: 'debug-lookup-address-toolcall.mjs:parse', message: 'JSON parse error', data: { urlHost: safeUrlHost, status: res.status, contentType: contentType.slice(0, 80), parseErrorMessage: String(parseError.message || '').slice(0, 200) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
  console.error('❌ JSON parse error:', parseError.message);
  console.log('Raw body:', text.slice(0, 500));
  process.exit(1);
}

console.log('Parsed response:', JSON.stringify(parsed, null, 2));
console.log('');

// Validate Vapi response format
console.log('=== Validation ===');

// Check HTTP status
if (res.status !== 200) {
  console.error('❌ FAIL: HTTP status is', res.status, '- Vapi will ignore this response!');
  console.log('   Vapi requires HTTP 200 for all tool responses.');
  process.exitCode = 1;
} else {
  console.log('✅ HTTP status is 200');
}

// Check results array
if (!parsed?.results || !Array.isArray(parsed.results)) {
  console.error('❌ FAIL: Response missing "results" array');
  console.log('   Expected format: { "results": [{ "toolCallId": "...", "result": {...} }] }');
  process.exitCode = 1;
} else {
  console.log('✅ Response has "results" array');
  
  const firstResult = parsed.results[0];
  if (!firstResult) {
    console.error('❌ FAIL: "results" array is empty');
    process.exitCode = 1;
  } else {
    // Check toolCallId
    if (mode === 'wrapped') {
      if (firstResult.toolCallId === fakeToolCallId) {
        console.log('✅ toolCallId matches:', firstResult.toolCallId);
      } else if (firstResult.toolCallId) {
        console.warn('⚠️  toolCallId present but different:', firstResult.toolCallId, '(expected:', fakeToolCallId, ')');
      } else {
        console.warn('⚠️  toolCallId missing from response (may cause "no result returned" in Vapi)');
      }
    } else {
      console.log('ℹ️  Mode is "args" - toolCallId not expected in request');
      if (firstResult.toolCallId) {
        console.log('   Response includes toolCallId:', firstResult.toolCallId);
      }
    }
    
    // Check result or error
    if (firstResult.result) {
      console.log('✅ Response has "result" field');
      console.log('   result.result:', firstResult.result.result);
      
      if (firstResult.result.result === 'found') {
        console.log('   ✅ Address found:', firstResult.result.formattedAddress);
      } else if (firstResult.result.result === 'not_found') {
        console.log('   ℹ️  Address not found (suggestAction:', firstResult.result.suggestAction, ')');
      } else if (firstResult.result.result === 'ambiguous') {
        console.log('   ℹ️  Ambiguous match, candidates:', firstResult.result.candidates?.join(', '));
      } else if (firstResult.result.result === 'zip_not_covered') {
        console.log('   ℹ️  ZIP not covered:', firstResult.result.zipCode);
      }
    } else if (firstResult.error) {
      console.log('⚠️  Response has "error" field:', firstResult.error);
    } else {
      console.error('❌ FAIL: Response has neither "result" nor "error"');
      process.exitCode = 1;
    }
  }
}

// #region agent log H3
{
  const hasResults = !!parsed?.results && Array.isArray(parsed.results);
  const first = hasResults ? parsed.results[0] : null;
  const returnedToolCallId = first?.toolCallId || null;
  const hasResultField = !!first?.result;
  const hasErrorField = typeof first?.error === 'string';
  fetch(INGEST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H3', location: 'debug-lookup-address-toolcall.mjs:validate', message: 'Validation summary', data: { urlHost: safeUrlHost, httpStatus: res.status, hasResults, returnedToolCallIdPresent: !!returnedToolCallId, toolCallIdMatches: returnedToolCallId ? returnedToolCallId === fakeToolCallId : false, hasResultField, hasErrorField }, timestamp: Date.now() }) }).catch(() => {});
}
// #endregion

console.log('');
if (process.exitCode) {
  console.log('❌ Some validations FAILED - this may cause Vapi "no result returned" errors');
} else {
  console.log('✅ All validations passed - response format is Vapi-compatible');
}

