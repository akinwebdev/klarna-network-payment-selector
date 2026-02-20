/**
 * Call POST /api/payments/klarna/charge without klarna.networkSessionToken.
 * Usage: node scripts/call-klarna-charge-no-token.js
 * Requires: .env or ".env (copy for creds)" with PAYTRAIL_MERCHANT_ID and PAYTRAIL_SECRET_KEY.
 * Server must be running: npm run start
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });
if (!process.env.PAYTRAIL_MERCHANT_ID) {
  dotenv.config({ path: path.join(root, '.env (copy for creds)') });
}

const BASE = process.env.API_BASE || 'http://localhost:3000';

const payment = {
  stamp: `stamp_${Date.now()}_notoken`,
  reference: `ref_${Date.now()}_notoken`,
  amount: 1590,
  currency: 'EUR',
  language: 'EN',
  customer: {
    email: 'test-no-token@example.com',
  },
  // Paytrail requires https; use a placeholder so we can see the no-token response
  redirectUrls: {
    success: 'https://example.com/payment-complete',
    cancel: 'https://example.com/product',
  },
  // No providerDetails.klarna – no networkSessionToken
};

const merchantId = process.env.PAYTRAIL_MERCHANT_ID?.trim() || '';
const secretKey = process.env.PAYTRAIL_SECRET_KEY?.trim() || '';

if (!merchantId || !secretKey) {
  console.error('Missing PAYTRAIL_MERCHANT_ID or PAYTRAIL_SECRET_KEY in .env');
  process.exit(1);
}

const body = { payment, merchantId, secretKey };

console.log('POST', `${BASE}/api/payments/klarna/charge`);
console.log('Payment (no providerDetails.klarna):', JSON.stringify(payment, null, 2));
console.log('---');

const res = await fetch(`${BASE}/api/payments/klarna/charge`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = text;
}

console.log('Status:', res.status, res.statusText);
console.log('Response:', typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
