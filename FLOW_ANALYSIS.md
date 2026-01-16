# User Journey Step-by-Step with Code

## Step 1: User Clicks Klarna Button

**Location:** `public/js/product.js` lines 244-247

```javascript
klarnaInstance.Payment.button({
  shape: "default",
  theme: "default",
  initiationMode: "DEVICE_BEST",
  initiate: async (initiateData) => {
```

**What happens:**
- User clicks the Klarna payment button
- SDK calls the `initiate` callback

---

## Step 2: Build Payment Request Data

**Location:** `public/js/product.js` lines 254-264

```javascript
// Build payment request data with product page values
const paymentRequestData = buildProductPaymentRequestData();

const requestBody = {
  paymentRequestData,  // ⚠️ NO paymentOptionId here anymore!
  returnUrl: `${API_BASE}/payment-complete`,
  appReturnUrl: null,
  authMode: currentAuthMode,
};
```

**What's in paymentRequestData:**
- `currency` (e.g., "EUR")
- `paymentRequestReference` (generated timestamp)
- `intents` (["PAY"])
- `amount` (e.g., 15900)
- `supplementaryPurchaseData` (lineItems, customer email)
- ❌ **NO `paymentOptionId`** (removed per your request)

---

## Step 3: Send Request to Backend

**Location:** `public/js/product.js` lines 273-280

```javascript
const response = await fetch(`${API_BASE}${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(requestBody),
});

const res = await response.json();
```

**Endpoint:** `/api/payment-request` (for SUB_PARTNER mode)

---

## Step 4: Backend Processes Request

**Location:** `api/[...].ts` lines 702-747

```javascript
app.post("/api/payment-request", async (c) => {
  const body = await c.req.json();
  const {
    klarnaNetworkSessionToken,  // undefined (we removed it)
    paymentOptionId,            // undefined (we removed it)
    paymentRequestData,         // ✅ This exists
    // ...
  } = body;

  // Line 738-739: Try to get paymentOptionId
  const resolvedPaymentOptionId = paymentOptionId ||
    paymentRequestData.paymentOptionId;  // ❌ This is also undefined now!

  // Line 741-746: ERROR if missing!
  if (!resolvedPaymentOptionId) {
    return c.json({
      status: "ERROR",
      message: "Missing paymentOptionId: provide it directly or include it in paymentRequestData",
    }, 400);
  }
```

**⚠️ PROBLEM:** The backend requires `paymentOptionId` but we removed it from both:
1. Top-level `paymentOptionId` in request body
2. `paymentRequestData.paymentOptionId`

**Result:** Backend returns 400 error with message "Missing paymentOptionId"

---

## Step 5: Backend Creates Klarna Payment Request (if paymentOptionId was present)

**Location:** `api/[...].ts` lines 749-803

```javascript
const paymentRequest: Record<string, unknown> = {
  currency: paymentRequestData.currency,
  payment_request_reference: paymentRequestData.paymentRequestReference,
  payment_option_id: resolvedPaymentOptionId,  // ⚠️ Required by Klarna API
  customer_interaction_config: {
    method: "HANDOVER",
    return_url: returnUrl,
  },
};

if (!isOnlyAddToWallet) {
  paymentRequest.amount = paymentRequestData.amount;
}

// Send to Klarna API
const klarnaResponse = await fetchWithMtls(
  `${KLARNA_API_BASE_URL}/v2/payment/requests`,
  {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paymentRequest),
  }
);
```

**Klarna API requires:**
- `payment_option_id` (required field)
- `currency`
- `amount`
- `customer_interaction_config`

---

## Step 6: Backend Returns Payment Request ID

**Location:** `api/[...].ts` lines 854-868

```javascript
const paymentRequestId = klarnaData.state_context?.customer_interaction
  ?.payment_request_id;

return c.json({
  status: "CREATED",
  paymentRequestId,  // SDK uses this to continue the flow
  paymentRequestUrl,
  expiresAt: klarnaData.expires_at,
});
```

---

## Step 7: SDK Continues Payment Flow

**Location:** `public/js/product.js` lines 286-299

```javascript
if (currentAuthMode === "SUB_PARTNER") {
  switch (res.status) {
    case "CREATED":
      return { paymentRequestId: res.paymentRequestId };  // ✅ SDK uses this
    // ...
  }
}
```

**What happens:**
- SDK receives `paymentRequestId`
- SDK opens Klarna's payment flow
- User completes payment in Klarna's interface

---

## Step 8: Payment Complete Event

**Location:** `public/js/product.js` lines 327-351

```javascript
klarnaInstance.Payment.on("complete", async (paymentRequest) => {
  // Extract token from stateContext
  const klarnaNetworkSessionToken = paymentRequest?.stateContext?.interoperabilityToken ||
    paymentRequest?.stateContext?.klarnaNetworkSessionToken ||
    null;
  
  if (!klarnaNetworkSessionToken) {
    // Error handling
    return false;
  }
```

---

## Step 9: Send to Paytrail

**Location:** `public/js/product.js` lines 395-434

```javascript
const paymentData = {
  stamp: stamp,
  reference: reference,
  amount: amount,
  currency: currency,
  language: language,
  customer: { email: 'customer@example.com' },
  redirectUrls: { success: ..., cancel: ... },
  providerDetails: {
    klarna: {
      networkSessionToken: klarnaNetworkSessionToken  // ✅ Token from complete event
    }
  }
};

const response = await fetch(`${API_BASE}/api/payments`, {
  method: 'POST',
  body: JSON.stringify(paymentData)
});
```

---

## Step 10: Redirect to Klarna Provider URL

**Location:** `public/js/product.js` lines 447-476

```javascript
if (klarnaProvider && klarnaProvider.url) {
  // Create POST form with parameters
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = klarnaProvider.url;
  
  // Add hidden inputs for all provider parameters
  klarnaProvider.parameters.forEach(param => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = param.name;
    input.value = param.value || '';
    form.appendChild(input);
  });
  
  form.submit();  // User redirected to Klarna
}
```

---

## 🔴 THE PROBLEM

**Current Issue:** Step 4 fails because `paymentOptionId` is missing.

**Error Location:** `api/[...].ts` line 741-746

**Error Message:** "Missing paymentOptionId: provide it directly or include it in paymentRequestData"

**Why it happens:**
1. We removed `paymentOptionId` from `paymentRequestData` (line 114 in product.js)
2. We removed `paymentOptionId` from the request body (line 259 in product.js)
3. Backend requires it (line 741-746 in api/[...].ts)
4. Klarna API requires `payment_option_id` in the payment request (line 753 in api/[...].ts)

**Solution Options:**
1. **Add paymentOptionId back** to `paymentRequestData` (but you said you don't want it)
2. **Modify backend** to not require `paymentOptionId` (but Klarna API still needs it)
3. **Get paymentOptionId from presentation** and include it (recommended)

The `paymentOptionId` is available from the presentation (line 204 in product.js), so we could store it and include it in the payment request data.
