import crypto from 'crypto';

// Generates the HMAC-SHA256 signature for a webhook payload.
// Use this in tests that need to send authenticated webhooks.
export function signWebhookPayload(
  payload: Record<string, unknown>,
  secret  = 'vanguard-webhook-test-secret-32-chars'
): string {
  const body = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(body, 'utf8'))
    .digest('hex');
}