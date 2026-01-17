// Postman Pre-request Script for Paytrail HMAC Authentication
// Matches the exact implementation from api/[...].ts

// Use crypto-js which is available in Postman
const CryptoJS = require('crypto-js');

// Set your Paytrail credentials
const ACCOUNT = "1100830"; // Your Paytrail merchant ID
const SECRET = "49940e14fa2e814f39a4c69f7d798c01d14fba04f1fcae8cd985c2aa1585ebabd5575973ae26ab90"; // Your Paytrail secret key

// Generate UUID function (since crypto.randomUUID() is not available)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Generate timestamp and nonce (exactly as backend does)
const timestamp = new Date().toISOString();
const nonce = generateUUID();

// Get the request body from Postman
// Postman stores the body in pm.request.body.raw
let bodyString = '';
if (pm.request.body && pm.request.body.raw) {
    bodyString = pm.request.body.raw;
} else {
    // Fallback: hardcoded body string - exact JSON as provided
    bodyString = '{"stamp":"stamp_1768642044094_r1ky9mmnf","reference":"ref_1768642044094_4i42mbql1","amount":15900,"currency":"EUR","language":"EN","customer":{"email":"customer_1768642028693_l08jdtq7t@example.com"},"redirectUrls":{"success":"https://klarna-network-payment-selector.vercel.app/payment-complete","cancel":"https://klarna-network-payment-selector.vercel.app/product"},"providerDetails":{"klarna":{"networkSessionToken":"krn:network:us1:test:interoperability:eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImY0ZThhZTBjLWQyNjYtNDY0Zi05OWNjLWYyNjcyYmVjOWJiNCJ9.eyJzaG9wcGluZ19zZXNzaW9uX2lkIjoia3JuOnNob3BwaW5nOmV1MTp0ZXN0OnNlc3Npb246OWU2M2YyMTMtMDJkNi00MzFlLWE5OTgtYTk4N2M3NTAwZDM5IiwicGF5bWVudF9yZXF1ZXN0cyI6W3siYW1vdW50IjoxNTkwMCwiY3VycmVuY3kiOiJFVVIiLCJsYXN0X21vZGlmaWVkX2F0IjoiMjAyNi0wMS0xNlQxMzoyMzo0OS45MDY5ODA0MDRaIiwiaWQiOiJrcm46cGF5bWVudDp1czE6cmVxdWVzdDo2YWJlNzRmMi02NThmLTY1NjItYjIyZi0yZDllZjk2N2ZkM2UiLCJzdGF0ZSI6IkNPTVBMRVRFRCJ9LHsiYW1vdW50IjoxNTkwMCwiY3VycmVuY3kiOiJFVVIiLCJsYXN0X21vZGlmaWVkX2F0IjoiMjAyNi0wMS0xNlQxMzozMjoxNC4yMDU4NDQ3ODhaIiwiaWQiOiJrcm46cGF5bWVudDp1czE6cmVxdWVzdDpiYmIzNDRmMC00MzZkLTYwYTctYmVhMi1jZDVlMGQyYzU4MGEiLCJzdGF0ZSI6IkNPTVBMRVRFRCJ9LHsiYW1vdW50IjoxNTkwMCwiY3VycmVuY3kiOiJFVVIiLCJsYXN0X21vZGlmaWVkX2F0IjoiMjAyNi0wMS0xNlQxMzozMzozMS4wMjMxMjY1ODNaIiwiaWQiOiJrcm46cGF5bWVudDp1czE6cmVxdWVzdDpmZWIzYTkzNS01MTZjLTY3MjMtOGRmYi1iN2Q5OTc4NDc2ZWYiLCJzdGF0ZSI6IkNPTVBMRVRFRCJ9LHsiYW1vdW50IjoxNTkwMCwiY3VycmVuY3kiOiJFVVIiLCJsYXN0X21vZGlmaWVkX2F0IjoiMjAyNi0wMS0xNlQxNDowODo1NC4zNzIyMDYyMTNaIiwiaWQiOiJrcm46cGF5bWVudDp1czE6cmVxdWVzdDo3YmIwYjU3NS0yODgwLTZiNTEtOTkzNC1iNDVhYWFjODk5MDkiLCJzdGF0ZSI6IkNPTVBMRVRFRCJ9LHsiYW1vdW50IjoxNTkwMCwiY3VycmVuY3kiOiJFVVIiLCJsYXN0X21vZGlmaWVkX2F0IjoiMjAyNi0wMS0xN1QwOToyNjozNS4xNzg4MjE4ODNaIiwiaWQiOiJrcm46cGF5bWVudDp1czE6cmVxdWVzdDpjM2IxMDQ2Yi1lMTE2LTY3ODYtYTNlYy1jMzFkNTY4Y2QzZWYiLCJzdGF0ZSI6IkNPTVBMRVRFRCJ9LHsiYW1vdW50IjoxNTkwMCwiY3VycmVuY3kiOiJFVVIiLCJpZCI6ImtybjpwYXltZW50OnVzMTpyZXF1ZXN0OjVmYjc4NDc3LTJjZjItNmJkNy1iNThlLTQxYjdhOTg3NzkzMiIsInN0YXRlIjoiQ09NUExFVEVEIiwibGFzdF9tb2RpZmllZF9hdCI6IjIwMjYtMDEtMTdUMDk6Mjc6MTIuMDE0OTAzMTA0WiJ9XSwicHJlX3F1YWxpZmljYXRpb24iOnt9LCJpc3MiOiJzZXNzaW9uLWFjcXVpcmluZy1zZXJ2aWNlIiwidmVyIjoiMS4wLjAiLCJpYXQiOjE3Njg2NDIwNDMsImV4cCI6MTc2ODY0NTY0M30.xZ2tBw5P_7j8ArO6_kptZc-v6ApbfIuNVoETzAJMD7tZ8R0-aoNUphCXa9u9k75-FBo0hAVOmMNy6XF8KrOhBA"}}}';
}

// Strip any carriage returns to ensure Paytrail compatibility
bodyString = bodyString.replace(/\r/g, '');

// Create signature headers (exactly as backend does)
const signatureHeaders = {
    "checkout-account": ACCOUNT,
    "checkout-algorithm": "sha256",
    "checkout-method": "POST",
    "checkout-nonce": nonce,
    "checkout-timestamp": timestamp,
};

// Create signature string (exactly as backend does)
// Paytrail format: headers separated by \n (line feed), then \n, then body
// Note: Carriage returns (\r) are NOT supported - only line feeds (\n)
const signatureString = Object.keys(signatureHeaders)
    .sort()
    .map((key) => `${key}:${signatureHeaders[key]}`)
    .join("\n") + "\n" + bodyString;

// Create HMAC signature (exactly as backend does)
// Using crypto-js which is available in Postman
const signature = CryptoJS.HmacSHA256(signatureString, SECRET).toString(CryptoJS.enc.Hex);

// Set headers in Postman
pm.request.headers.add({
    key: 'checkout-account',
    value: ACCOUNT
});
pm.request.headers.add({
    key: 'checkout-algorithm',
    value: 'sha256'
});
pm.request.headers.add({
    key: 'checkout-method',
    value: 'POST'
});
pm.request.headers.add({
    key: 'checkout-nonce',
    value: nonce
});
pm.request.headers.add({
    key: 'checkout-timestamp',
    value: timestamp
});
pm.request.headers.add({
    key: 'signature',
    value: signature
});

// Debug logging - compare with backend logs
console.log('=== Paytrail Signature (matching backend) ===');
console.log('Body string:', bodyString);
console.log('Signature headers:', signatureHeaders);
console.log('Signature string (exact):');
console.log('---START SIGNATURE STRING---');
console.log(signatureString);
console.log('---END SIGNATURE STRING---');
console.log('Signature string length:', signatureString.length);
console.log('Generated signature:', signature);
console.log('===========================================');
