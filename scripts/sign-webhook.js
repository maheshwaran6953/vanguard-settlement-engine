// scripts/sign-webhook.js
// Usage: node scripts/sign-webhook.js
//
// Generates the exact HMAC-SHA256 signature for a webhook payload.
// The signature is computed over the raw bytes that Thunder Client
// will send — which means the JSON must be minified with no extra
// spaces or newlines.

const crypto = require('crypto');
const path   = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../infra/config/.env.development'),
});

const secret = process.env.WEBHOOK_SECRET;
if (!secret) {
  console.error('ERROR: WEBHOOK_SECRET not found in .env.development');
  process.exit(1);
}

// ----------------------------------------------------------------
// IMPORTANT: This payload object must exactly match what you send
// in Thunder Client. Edit the values here, then copy the output
// signature and the printed JSON into Thunder Client.
//
// Do NOT add extra spaces or reformat the JSON in Thunder Client.
// Use the minified JSON printed below — copy it character for
// character into the Thunder Client body field.
// ----------------------------------------------------------------
const payload = {
  account_number:  'VSE_REPLACE_WITH_ACTUAL_VAN_NUMBER',   // replace with your actual VAN number
  amount_cents:    500000,
  idempotency_key: `smoke_test_${Date.now()}`,
  paid_at:         new Date().toISOString(),
};

// JSON.stringify with no spaces — this is exactly what the server
// receives as raw bytes when Thunder Client sends minified JSON.
const body      = JSON.stringify(payload);
const signature = crypto
  .createHmac('sha256', secret)
  .update(Buffer.from(body, 'utf8'))
  .digest('hex');

console.log('\n=== WEBHOOK SIGNING UTILITY ===\n');
console.log('Secret (first 8 chars):', secret.slice(0, 8) + '...');
console.log('\nPayload (copy this EXACTLY into Thunder Client body):');
console.log(body);
console.log('\nX-Webhook-Signature header value:');
console.log(signature);
console.log('\n================================\n');
console.log('Instructions:');
console.log('1. In Thunder Client, set Body type to "Raw JSON"');
console.log('2. Paste the payload line above into the body field');
console.log('3. Add header: X-Webhook-Signature =', signature);
console.log('4. Send the request');