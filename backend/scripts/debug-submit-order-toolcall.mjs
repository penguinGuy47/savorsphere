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
const argsPayload = {
  orderType: 'pickup',
  totalCents: 1199,
  customerPhone: '+15555550123',
  pizzas: [
    {
      size: 'Personal',
      crust: 'Thin',
      priceCents: 1199,
      wholeToppings: ['Pepperoni']
    }
  ],
  sides: []
};

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

// #region agent log H1
fetch('http://127.0.0.1:7243/ingest/f77fc304-00be-4268-a2f4-fec2e797516e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H1', location: 'debug-submit-order-toolcall.mjs:entry', message: 'Starting submit_order tool call simulation', data: { mode, urlHost: safeUrlHost, payloadKeys: Object.keys(payload) }, timestamp: Date.now() }) }).catch(() => {});
// #endregion

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
  // #region agent log H3
  fetch('http://127.0.0.1:7243/ingest/f77fc304-00be-4268-a2f4-fec2e797516e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H3', location: 'debug-submit-order-toolcall.mjs:fetch', message: 'HTTP request failed or timed out', data: { mode, urlHost: safeUrlHost, durationMs, errorName: e?.name, errorMessage: String(e?.message || '').slice(0, 180) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
  console.error('Request failed:', e?.name, e?.message);
  process.exitCode = 1;
  clearTimeout(timeout);
  process.exit(1);
}
clearTimeout(timeout);

const contentType = res.headers.get('content-type') || '';

// #region agent log H2
fetch('http://127.0.0.1:7243/ingest/f77fc304-00be-4268-a2f4-fec2e797516e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H2', location: 'debug-submit-order-toolcall.mjs:response', message: 'Received HTTP response', data: { mode, urlHost: safeUrlHost, status: res.status, ok: res.ok, contentType: contentType.slice(0, 80), durationMs, bodyLen: text.length }, timestamp: Date.now() }) }).catch(() => {});
// #endregion

let parsed = null;
let parseError = null;
try {
  parsed = text ? JSON.parse(text) : null;
} catch (e) {
  parseError = e;
}

// #region agent log H1
fetch('http://127.0.0.1:7243/ingest/f77fc304-00be-4268-a2f4-fec2e797516e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'debug-session', runId, hypothesisId: 'H1', location: 'debug-submit-order-toolcall.mjs:parse', message: 'Parsed response body', data: { mode, status: res.status, jsonParsed: !!parsed && !parseError, parseErrorName: parseError?.name, parseErrorMessage: String(parseError?.message || '').slice(0, 180), topKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 10) : [], errorField: typeof parsed?.error === 'string' ? parsed.error.slice(0, 120) : undefined }, timestamp: Date.now() }) }).catch(() => {});
// #endregion

console.log('--- submit_order debug ---');
console.log('URL:', endpointUrl);
console.log('Mode:', mode);
console.log('HTTP:', res.status, res.statusText);
console.log('Content-Type:', contentType || '(none)');
console.log('Duration(ms):', durationMs);
console.log('Body length:', text.length);
console.log('Body preview:', text.slice(0, 500));






