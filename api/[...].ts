/**
 * Klarna Payment Selector Demo - Vercel Version
 *
 * This server uses Hono to handle API routes on Vercel.
 * Supports Sub Partner authentication mode.
 *
 * Environment Variables (set in Vercel dashboard):
 *
 *    Sub Partner credentials:
 *    - SP_CLIENT_ID: Client ID for Sub Partner mode
 *    - SP_API_KEY: Base64 encoded API credentials for Sub Partner mode
 *
 *    Common settings:
 *    - KLARNA_API_BASE_URL: (optional) defaults to test environment
 *    - MTLS_CERT: (optional) Base64 encoded PEM certificate for mTLS
 *    - MTLS_KEY: (optional) Base64 encoded PEM private key for mTLS
 *    - KLARNA_CUSTOMER_TOKENS: (optional) JSON object of country->token mappings
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import crypto from "crypto";

const app = new Hono();

// Configuration from environment variables
const getEnv = (key: string): string => {
  return process.env[key] || "";
};

const KLARNA_API_BASE_URL = getEnv("KLARNA_API_BASE_URL") ||
  "https://api-global.test.klarna.com";

// Sub Partner credentials
const SP_CLIENT_ID = getEnv("SP_CLIENT_ID");
const SP_API_KEY = getEnv("SP_API_KEY");

// Paytrail API configuration
const PAYTRAIL_API_URL = getEnv("PAYTRAIL_API_URL") ||
  "https://services.paytrail.com";
const PAYTRAIL_MERCHANT_ID = getEnv("PAYTRAIL_MERCHANT_ID");
const PAYTRAIL_SECRET_KEY = getEnv("PAYTRAIL_SECRET_KEY");

// Check if Sub Partner credentials are configured
const hasSubPartnerConfig = !!(SP_CLIENT_ID && SP_API_KEY);

// Interface for auth configuration
interface AuthConfig {
  clientId: string;
  apiKey: string;
}

// Get Sub Partner credentials
function getAuthConfig(): AuthConfig | null {
  if (SP_CLIENT_ID && SP_API_KEY) {
    return {
      clientId: SP_CLIENT_ID,
      apiKey: SP_API_KEY,
    };
  }
  return null;
}

// mTLS configuration (optional) - certificates should be base64 encoded PEM
const MTLS_CERT_B64 = getEnv("MTLS_CERT");
const MTLS_KEY_B64 = getEnv("MTLS_KEY");

// Customer tokens for tokenized payments (optional)
// Stored as JSON object mapping country codes to tokens: {"SE":"tok_xxx","US":"tok_yyy"}
const KLARNA_CUSTOMER_TOKENS_RAW = getEnv("KLARNA_CUSTOMER_TOKENS");

// Parse customer tokens JSON
function parseCustomerTokens(): Record<string, string> {
  if (!KLARNA_CUSTOMER_TOKENS_RAW) return {};
  try {
    const parsed = JSON.parse(KLARNA_CUSTOMER_TOKENS_RAW);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
    console.warn("KLARNA_CUSTOMER_TOKENS is not a valid JSON object");
    return {};
  } catch (error) {
    console.error("Failed to parse KLARNA_CUSTOMER_TOKENS:", error);
    return {};
  }
}

const CUSTOMER_TOKENS = parseCustomerTokens();
const CONFIGURED_TOKEN_COUNTRIES = Object.keys(CUSTOMER_TOKENS);
const hasAnyCustomerToken = CONFIGURED_TOKEN_COUNTRIES.length > 0;

// Get customer token for a specific country
function getCustomerTokenForCountry(country: string): string | null {
  if (!country) return null;
  // Normalize country code (e.g., "se" -> "SE")
  const normalizedCountry = country.toUpperCase();
  return CUSTOMER_TOKENS[normalizedCountry] || null;
}

// Decode base64 to string (for PEM certificates)
function decodeBase64(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8");
}

// Check if mTLS is configured
const isMtlsConfigured = Boolean(MTLS_CERT_B64 && MTLS_KEY_B64);

// Helper to get auth config (always uses Sub Partner mode)
function resolveAuthConfig(): AuthConfig {
  const config = getAuthConfig();
  if (!config) {
    throw new Error("Sub Partner authentication configuration not available. Please set SP_CLIENT_ID and SP_API_KEY environment variables.");
  }
  return config;
}

// Fetch with optional mTLS support
// Note: mTLS support on Vercel may be limited. This is a placeholder for future implementation.
async function fetchWithMtls(
  url: string,
  options: RequestInit,
): Promise<Response> {
  // On Vercel, mTLS would require custom configuration
  // For now, use regular fetch
  // TODO: Implement mTLS support if needed (may require Vercel Enterprise or custom setup)
  if (isMtlsConfigured) {
    console.warn("mTLS is configured but not fully supported on Vercel without custom setup");
  }
  return fetch(url, options);
}

// Enable CORS
app.use("*", cors());

// ============================================================================
// API ROUTES
// ============================================================================

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    authMode: defaultAuthMode,
    mtls: isMtlsConfigured ? "configured (limited support on Vercel)" : "not configured",
  });
});

// SDK configuration endpoint - provides client ID to frontend
app.get("/api/config", (c) => {
  const config = getAuthConfig();
  
  if (!config) {
    return c.json({
      error:
        "Sub Partner authentication not configured. Please set SP_CLIENT_ID and SP_API_KEY environment variables.",
    }, 500);
  }

  return c.json({
    // Available authentication modes
    availableModes: [{
      mode: "SUB_PARTNER",
      clientId: config.clientId,
    }],
    defaultMode: "SUB_PARTNER",
    // Legacy fields for backward compatibility
    clientId: config.clientId,
    authMode: "SUB_PARTNER",
    mtlsEnabled: isMtlsConfigured,
    // Customer token configuration - returns list of countries with tokens
    customerTokenConfigured: hasAnyCustomerToken,
    customerTokenCountries: CONFIGURED_TOKEN_COUNTRIES,
  });
});

// Generate Identity SDK Token endpoint (for tokenized payments)
app.post("/api/identity/sdk-tokens", async (c) => {
  try {
    const body = await c.req.json();
    const { country } = body;

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig();
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    const customerToken = country ? getCustomerTokenForCountry(country) : null;

    const apiPath = `/v2/identity/sdk-tokens`;
    const requestUrl = `${KLARNA_API_BASE_URL}${apiPath}`;

    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
    };

    if (customerToken) {
      headers["Klarna-Customer-Token"] = customerToken;
    }

    const klarnaResponse = await fetchWithMtls(
      requestUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      },
    );

    const klarnaData = await klarnaResponse.json();
    const correlationId = klarnaResponse.headers.get("klarna-correlation-id") ||
      null;
    const mtlsVerificationStatus =
      klarnaResponse.headers.get("klarna-mtls-verification-status") || null;

    const requestMeta = {
      url: requestUrl,
      authMode: "SUB_PARTNER",
      method: "POST",
      klarnaCustomerToken: customerToken,
      requestBody: {},
    };
    const responseMeta = {
      correlationId,
      mtlsVerificationStatus,
      responseBody: klarnaData,
    };

    if (!klarnaResponse.ok) {
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message || "SDK token generation failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    return c.json({
      status: "OK",
      sdkToken: klarnaData.sdk_token,
      expiresAt: klarnaData.expires_at,
      _request: requestMeta,
      _response: responseMeta,
    });
  } catch (error) {
    console.error("Identity SDK Token error:", error);
    return c.json({
      status: "ERROR",
      message: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
});

// Payment Presentation API endpoint (GET with query params)
app.get("/api/presentation", async (c) => {
  try {
    const currency = c.req.query("currency");
    const locale = c.req.query("locale");
    const amount = c.req.query("amount");
    const intents = c.req.query("intents");
    const subscriptionBillingInterval = c.req.query(
      "subscription_billing_interval",
    );
    const subscriptionBillingIntervalFrequency = c.req.query(
      "subscription_billing_interval_frequency",
    );
    const includeCustomerToken =
      c.req.query("include_customer_token") === "true";
    const country = c.req.query("country");

    if (!currency) {
      return c.json({
        status: "ERROR",
        message: "Missing required query parameter: currency",
      }, 400);
    }

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig();
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    const queryParams = new URLSearchParams();
    queryParams.append("currency", currency);
    if (locale) queryParams.append("locale", locale);
    if (amount) queryParams.append("amount", amount);
    if (intents) {
      const intentList = intents.split(",");
      intentList.forEach((intent) =>
        queryParams.append("intents[]", intent.trim())
      );
    }
    if (subscriptionBillingInterval) {
      queryParams.append(
        "subscription_billing_interval",
        subscriptionBillingInterval,
      );
    }
    if (subscriptionBillingIntervalFrequency) {
      queryParams.append(
        "subscription_billing_interval_frequency",
        subscriptionBillingIntervalFrequency,
      );
    }

    const apiPath = `/v2/payment/presentation`;
    const requestUrl =
      `${KLARNA_API_BASE_URL}${apiPath}?${queryParams.toString()}`;

    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
    };

    const customerToken = includeCustomerToken && country
      ? getCustomerTokenForCountry(country)
      : null;
    if (customerToken) {
      headers["Klarna-Customer-Token"] = customerToken;
    }

    const klarnaResponse = await fetchWithMtls(
      requestUrl,
      {
        method: "GET",
        headers,
      },
    );

    const klarnaData = await klarnaResponse.json();
    const correlationId = klarnaResponse.headers.get("klarna-correlation-id") ||
      null;
    const mtlsVerificationStatus =
      klarnaResponse.headers.get("klarna-mtls-verification-status") || null;

    const requestMeta = {
      url: requestUrl,
      authMode: "SUB_PARTNER",
      method: "GET",
      queryParams: Object.fromEntries(queryParams.entries()),
      klarnaCustomerToken: customerToken,
    };
    const responseMeta = {
      correlationId,
      mtlsVerificationStatus,
      responseBody: klarnaData,
    };

    if (!klarnaResponse.ok) {
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message || "Presentation API failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    return c.json({
      status: "OK",
      presentation: klarnaData,
      _request: requestMeta,
      _response: responseMeta,
    });
  } catch (error) {
    console.error("Presentation API error:", error);
    return c.json({
      status: "ERROR",
      message: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
});

// Payment Request endpoint (for SUB_PARTNER mode)
app.post("/api/payment-request", async (c) => {
  try {
    const body = await c.req.json();
    const {
      klarnaNetworkSessionToken,
      paymentOptionId,
      paymentRequestData,
      returnUrl,
      appReturnUrl,
      includeCustomerToken,
      country,
    } = body;

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig();
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    if (!paymentRequestData) {
      return c.json({
        status: "ERROR",
        message: "Missing required field: paymentRequestData is required",
      }, 400);
    }

    const intents = paymentRequestData.intents as string[] | undefined;
    const isOnlyAddToWallet = intents && intents.length === 1 &&
      intents[0] === "ADD_TO_WALLET";

    const resolvedPaymentOptionId = paymentOptionId ||
      paymentRequestData.paymentOptionId;

    // paymentOptionId is optional when using Klarna.Payment.button() directly
    // Only include it in the payment request if it's provided
    const paymentRequest: Record<string, unknown> = {
      currency: paymentRequestData.currency,
      payment_request_reference: paymentRequestData.paymentRequestReference ||
        `req_${Date.now()}`,
      customer_interaction_config: {
        method: "HANDOVER",
        return_url: returnUrl ||
          `${new URL(c.req.url).origin}/payment-complete`,
        ...(appReturnUrl && { app_return_url: appReturnUrl }),
      },
    };
    
    // Only include payment_option_id if it was provided
    if (resolvedPaymentOptionId) {
      paymentRequest.payment_option_id = resolvedPaymentOptionId;
    }

    if (!isOnlyAddToWallet) {
      paymentRequest.amount = paymentRequestData.amount;
    }

    if (paymentRequestData.supplementaryPurchaseData) {
      paymentRequest.supplementary_purchase_data =
        transformSupplementaryPurchaseData(
          paymentRequestData.supplementaryPurchaseData,
        );
    }

    if (paymentRequestData.requestCustomerToken) {
      paymentRequest.request_customer_token = {
        scopes: paymentRequestData.requestCustomerToken.scopes,
        customer_token_reference:
          paymentRequestData.requestCustomerToken.customerTokenReference,
      };
    }

    const requestUrl = `${KLARNA_API_BASE_URL}/v2/payment/requests`;

    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
    };
    if (klarnaNetworkSessionToken) {
      headers["Klarna-Network-Session-Token"] = klarnaNetworkSessionToken;
    }
    const customerToken = includeCustomerToken && country
      ? getCustomerTokenForCountry(country)
      : null;
    if (customerToken) {
      headers["Klarna-Customer-Token"] = customerToken;
    }

    const klarnaResponse = await fetchWithMtls(
      requestUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify(paymentRequest),
      },
    );

    const klarnaData = await klarnaResponse.json();
    const correlationId = klarnaResponse.headers.get("klarna-correlation-id") ||
      null;
    const mtlsVerificationStatus =
      klarnaResponse.headers.get("klarna-mtls-verification-status") || null;

    const requestMeta = {
      url: requestUrl,
      authMode: "SUB_PARTNER",
      method: "POST",
      klarnaNetworkSessionToken: klarnaNetworkSessionToken || null,
      klarnaCustomerToken: customerToken,
      requestBody: paymentRequest,
    };
    const responseMeta = {
      correlationId,
      mtlsVerificationStatus,
      responseBody: klarnaData,
    };

    if (!klarnaResponse.ok) {
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message || "Payment request creation failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    const paymentRequestState = klarnaData.state;

    if (paymentRequestState === "COMPLETED") {
      const paymentRequestId = klarnaData.payment_request_id;
      console.log("✅ Payment Request ID (COMPLETED):", paymentRequestId);
      const returnUrlFromResponse =
        klarnaData.customer_interaction_config?.return_url || returnUrl ||
        "/payment-complete";
      return c.json({
        status: "COMPLETED",
        paymentRequestId: paymentRequestId,
        successUrl: returnUrlFromResponse,
        expiresAt: klarnaData.expires_at,
        _request: requestMeta,
        _response: responseMeta,
      });
    }

    const paymentRequestId = klarnaData.state_context?.customer_interaction
      ?.payment_request_id;
    const paymentRequestUrl = klarnaData.state_context?.customer_interaction
      ?.payment_request_url;
    
    console.log("✅ Payment Request ID (CREATED):", paymentRequestId);

    return c.json({
      status: "CREATED",
      paymentRequestId,
      paymentRequestUrl,
      expiresAt: klarnaData.expires_at,
      _request: requestMeta,
      _response: responseMeta,
    });
  } catch (error) {
    console.error("Payment request error:", error);
    return c.json({
      status: "ERROR",
      message: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
});

// ============================================================================
// PAYTRAIL API ENDPOINTS
// ============================================================================

function transformSupplementaryPurchaseData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!data) return {};

  const transformed: Record<string, unknown> = {};

  if (data.purchaseReference) {
    transformed.purchase_reference = data.purchaseReference;
  }

  if (data.lineItems && Array.isArray(data.lineItems)) {
    transformed.line_items = data.lineItems.map(
      (item: Record<string, unknown>) => {
        const lineItem: Record<string, unknown> = {
          name: item.name,
          quantity: item.quantity,
          total_amount: item.totalAmount,
          unit_price: item.unitPrice,
        };
        if (item.lineItemReference) {
          lineItem.line_item_reference = item.lineItemReference;
        }
        if (item.subscriptionReference) {
          lineItem.subscription_reference = item.subscriptionReference;
        }
        return lineItem;
      },
    );
  }

  if (data.ondemandService) {
    const ondemand = data.ondemandService as Record<string, unknown>;
    transformed.ondemand_service = {
      average_amount: ondemand.averageAmount,
      minimum_amount: ondemand.minimumAmount,
      maximum_amount: ondemand.maximumAmount,
      purchase_interval: ondemand.purchaseInterval,
      purchase_interval_frequency: ondemand.purchaseInterval_frequency,
    };
  }

  if (data.subscriptions && Array.isArray(data.subscriptions)) {
    transformed.subscriptions = data.subscriptions.map((
      sub: Record<string, unknown>,
    ) => ({
      subscription_reference: sub.subscriptionReference,
      name: sub.name,
      free_trial: sub.freeTrial,
      billing_plans: (sub.billingPlans as Record<string, unknown>[])?.map((
        plan: Record<string, unknown>,
      ) => ({
        billing_amount: plan.billingAmount,
        currency: plan.currency,
        from: plan.from,
        interval: plan.interval,
        interval_frequency: plan.intervalFrequency,
      })),
    }));
  }

  return transformed;
}

// ============================================================================
// PAYTRAIL API HELPERS
// ============================================================================

/**
 * Create HMAC signature for Paytrail API requests
 */
function createPaytrailSignature(
  method: string,
  uri: string,
  headers: Record<string, string>,
  body: string = "",
): { headers: Record<string, string>; signature: string } {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();

  // Headers that need to be included in signature (Paytrail format)
  const signatureHeaders: Record<string, string> = {
    "checkout-account": PAYTRAIL_MERCHANT_ID || "",
    "checkout-algorithm": "sha256",
    "checkout-method": method,
    "checkout-nonce": nonce,
    "checkout-timestamp": timestamp,
  };

  // Add request-specific headers
  Object.assign(signatureHeaders, headers);

  // Create signature string according to Paytrail format
  const signatureString = Object.keys(signatureHeaders)
    .sort()
    .map((key) => `${key}:${signatureHeaders[key]}`)
    .join("\n") + "\n" + body;

  // Create HMAC signature
  const signature = crypto
    .createHmac("sha256", PAYTRAIL_SECRET_KEY || "")
    .update(signatureString)
    .digest("hex");

  return {
    headers: signatureHeaders,
    signature,
  };
}

/**
 * Make authenticated request to Paytrail API
 */
async function makePaytrailRequest(
  method: string,
  endpoint: string,
  body: unknown = null,
): Promise<unknown> {
  const bodyString = body ? JSON.stringify(body) : "";
  const { headers, signature } = createPaytrailSignature(
    method,
    endpoint,
    {},
    bodyString,
  );

  const requestHeaders: Record<string, string> = {
    ...headers,
    signature: signature,
    "content-type": "application/json; charset=utf-8",
  };

  console.log(
    `Making ${method} request to: ${PAYTRAIL_API_URL}${endpoint}`,
  );
  console.log("Request headers:", requestHeaders);

  // Log request payload for POST requests
  if (method === "POST" && body) {
    console.log(
      "Request payload sent to Paytrail:",
      JSON.stringify(body, null, 2),
    );
  }

  try {
    const response = await fetch(`${PAYTRAIL_API_URL}${endpoint}`, {
      method: method,
      headers: requestHeaders,
      body: bodyString || undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Paytrail API error: ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Log raw response from Paytrail API
    console.log("Raw response from Paytrail API:");
    console.log(JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error(
      "Paytrail API Error:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

// ============================================================================
// PAYTRAIL API ENDPOINTS
// ============================================================================

// GET /api/merchants/payment-providers
app.get("/api/merchants/payment-providers", async (c: Context) => {
  try {
    if (!PAYTRAIL_MERCHANT_ID || !PAYTRAIL_SECRET_KEY) {
      return c.json(
        {
          error: "Paytrail credentials not configured",
          message:
            "Please set PAYTRAIL_MERCHANT_ID and PAYTRAIL_SECRET_KEY environment variables",
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    console.log("🔄 Fetching payment providers from Paytrail API...");

    const response = await makePaytrailRequest(
      "GET",
      "/merchants/payment-providers",
    );

    console.log("✅ Payment providers fetched successfully from Paytrail");
    return c.json(response);
  } catch (error) {
    console.error(
      "❌ Error fetching payment providers:",
      error instanceof Error ? error.message : String(error),
    );

    // If API call fails, return error details
    const errorResponse = {
      error: "Failed to fetch payment providers from Paytrail API",
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };

    return c.json(errorResponse, 500);
  }
});

// GET /api/merchants/grouped-payment-providers
app.get("/api/merchants/grouped-payment-providers", async (c: Context) => {
  try {
    if (!PAYTRAIL_MERCHANT_ID || !PAYTRAIL_SECRET_KEY) {
      return c.json(
        {
          error: "Paytrail credentials not configured",
          message:
            "Please set PAYTRAIL_MERCHANT_ID and PAYTRAIL_SECRET_KEY environment variables",
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    console.log(
      "🔄 Fetching grouped payment providers from Paytrail API...",
    );

    const response = await makePaytrailRequest(
      "GET",
      "/merchants/grouped-payment-providers",
    );

    console.log(
      "✅ Grouped payment providers fetched successfully from Paytrail",
    );
    return c.json(response);
  } catch (error) {
    console.error(
      "❌ Error fetching grouped payment providers:",
      error instanceof Error ? error.message : String(error),
    );

    // If API call fails, return error details
    const errorResponse = {
      error: "Failed to fetch grouped payment providers from Paytrail API",
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };

    return c.json(errorResponse, 500);
  }
});

// POST /api/payments
app.post("/api/payments", async (c: Context) => {
  try {
    if (!PAYTRAIL_MERCHANT_ID || !PAYTRAIL_SECRET_KEY) {
      return c.json(
        {
          error: "Paytrail credentials not configured",
          message:
            "Please set PAYTRAIL_MERCHANT_ID and PAYTRAIL_SECRET_KEY environment variables",
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    console.log("🔄 Creating payment with Paytrail API...");
    const paymentData = await c.req.json();
    console.log(
      "Payment data received:",
      JSON.stringify(paymentData, null, 2),
    );

    // Validate required fields for Paytrail API
    // Note: items are optional when providerDetails.klarna.networkSessionToken is provided
    const requiredFields = [
      "stamp",
      "reference",
      "amount",
      "currency",
      "customer",
      "redirectUrls",
    ];
    const missingFields = requiredFields.filter(
      (field) => !paymentData[field],
    );

    if (missingFields.length > 0) {
      return c.json(
        {
          error: "Missing required fields",
          missing: missingFields,
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }

    // Log the reference being sent
    console.log("📤 Sending to Paytrail API:");
    console.log("  Reference in request:", paymentData.reference);
    console.log("  Stamp in request:", paymentData.stamp);

    // Log Klarna interoperability token if present
    if (paymentData.providerDetails?.klarna?.networkSessionToken) {
      console.log(
        "  Klarna Network Session Token (interoperability_token):",
        paymentData.providerDetails.klarna.networkSessionToken,
      );
    }

    // Make real API call to Paytrail
    const response = await makePaytrailRequest("POST", "/payments", paymentData);

    // Log the reference received
    console.log("📥 Received from Paytrail API:");
    console.log("  Reference in response:", (response as { reference?: string }).reference);
    console.log(
      "  TransactionId in response:",
      (response as { transactionId?: string }).transactionId,
    );
    if ((response as { checkoutReference?: string }).checkoutReference) {
      console.log(
        "  CheckoutReference in response:",
        (response as { checkoutReference?: string }).checkoutReference,
      );
    }
    console.log("  Full response:", JSON.stringify(response, null, 2));

    console.log("✅ Payment created successfully with Paytrail");
    return c.json(response, 201);
  } catch (error) {
    console.error(
      "❌ Error creating payment:",
      error instanceof Error ? error.message : String(error),
    );

    // If API call fails, return error details
    const errorResponse = {
      error: "Failed to create payment with Paytrail API",
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };

    return c.json(errorResponse, 500);
  }
});

// POST /api/payments/klarna/charge (auto-capture)
app.post("/api/payments/klarna/charge", async (c: Context) => {
  try {
    if (!PAYTRAIL_MERCHANT_ID || !PAYTRAIL_SECRET_KEY) {
      return c.json(
        {
          error: "Paytrail credentials not configured",
          message:
            "Please set PAYTRAIL_MERCHANT_ID and PAYTRAIL_SECRET_KEY environment variables",
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    console.log("🔄 Creating Klarna charge payment (auto-capture) with Paytrail API...");
    const paymentData = await c.req.json();
    console.log(
      "Payment data received:",
      JSON.stringify(paymentData, null, 2),
    );

    // Validate required fields
    // Note: redirectUrls is not required for Klarna Express endpoints
    // as they return 201 with transactionId instead of redirecting
    const requiredFields = [
      "stamp",
      "reference",
      "amount",
      "currency",
      "customer",
    ];
    const missingFields = requiredFields.filter(
      (field) => !paymentData[field],
    );

    if (missingFields.length > 0) {
      return c.json(
        {
          error: "Missing required fields",
          missing: missingFields,
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }

    // Log Klarna network session token if present
    if (paymentData.providerDetails?.klarna?.networkSessionToken) {
      console.log(
        "  Klarna Network Session Token:",
        paymentData.providerDetails.klarna.networkSessionToken,
      );
    }

    // Make API call directly to handle 403 responses
    const bodyString = JSON.stringify(paymentData);
    const { headers, signature } = createPaytrailSignature(
      "POST",
      "/payments/klarna/charge",
      {},
      bodyString,
    );

    const requestHeaders: Record<string, string> = {
      ...headers,
      signature: signature,
      "content-type": "application/json; charset=utf-8",
    };

    console.log(
      "Making POST request to: https://services.paytrail.com/payments/klarna/charge",
    );

    const paytrailResponse = await fetch(
      "https://services.paytrail.com/payments/klarna/charge",
      {
        method: "POST",
        headers: requestHeaders,
        body: bodyString,
      },
    );

    let responseData: any;
    try {
      const responseText = await paytrailResponse.text();
      console.log("📥 Raw Paytrail response text:", responseText);
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error("❌ Failed to parse Paytrail response as JSON:", parseError);
      return c.json(
        {
          error: "Failed to parse Paytrail response",
          message: parseError instanceof Error ? parseError.message : "Unknown error",
          status: paytrailResponse.status,
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    console.log("📥 Paytrail response for Klarna charge:", {
      status: paytrailResponse.status,
      statusText: paytrailResponse.statusText,
      data: responseData,
    });

    // Handle response based on status
    // Success: 200 or 201 with transaction ID
    // Error: 403 with transaction ID and stepUpUrl

    if ((paytrailResponse.status === 201 || paytrailResponse.status === 200) && responseData.transactionId) {
      // Success: return 201 with transaction ID
      console.log("✅ Klarna charge payment created successfully");
      console.log("  Transaction ID:", responseData.transactionId);
      return c.json(
        {
          transactionId: responseData.transactionId,
        },
        201,
      );
    } else if ((paytrailResponse.status === 201 || paytrailResponse.status === 200) && !responseData.transactionId) {
      // 201 but missing transactionId - log and return error
      console.error("❌ Paytrail returned 201 but missing transactionId:", responseData);
      return c.json(
        {
          error: "Unexpected response format from Paytrail",
          message: "Response status is 201 but transactionId is missing",
          response: responseData,
          timestamp: new Date().toISOString(),
        },
        500,
      );
    } else if (paytrailResponse.status === 403 && responseData.transactionId && responseData.stepUpUrl) {
      // Step-up required: return 403 with transaction ID and stepUpUrl
      console.log("⚠️ Step-up required for Klarna charge payment");
      console.log("  Transaction ID:", responseData.transactionId);
      console.log("  Step-up URL:", responseData.stepUpUrl);
      return c.json(
        {
          transactionId: responseData.transactionId,
          stepUpUrl: responseData.stepUpUrl,
          error: responseData.error || "Step-up required",
          message: responseData.message,
        },
        403,
      );
    } else if (paytrailResponse.status === 403) {
      // 403 but missing required fields
      console.error("❌ Paytrail returned 403 but missing transactionId or stepUpUrl:", responseData);
      return c.json(
        {
          error: "Unexpected response format from Paytrail",
          message: "Response status is 403 but transactionId or stepUpUrl is missing",
          response: responseData,
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    // Unexpected response format or status
    console.error("❌ Unexpected response from Paytrail:", {
      status: paytrailResponse.status,
      statusText: paytrailResponse.statusText,
      data: responseData,
    });
    return c.json(
      {
        error: "Unexpected response from Paytrail",
        status: paytrailResponse.status,
        response: responseData,
        timestamp: new Date().toISOString(),
      },
      paytrailResponse.status >= 400 && paytrailResponse.status < 500
        ? paytrailResponse.status
        : 500,
    );
  } catch (error) {
    console.error(
      "❌ Error creating Klarna charge payment:",
      error instanceof Error ? error.message : String(error),
    );

    return c.json(
      {
        error: "Failed to create payment with Paytrail API",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
});

// POST /api/payments/klarna/authorization-hold (manual capture)
app.post("/api/payments/klarna/authorization-hold", async (c: Context) => {
  try {
    if (!PAYTRAIL_MERCHANT_ID || !PAYTRAIL_SECRET_KEY) {
      return c.json(
        {
          error: "Paytrail credentials not configured",
          message:
            "Please set PAYTRAIL_MERCHANT_ID and PAYTRAIL_SECRET_KEY environment variables",
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    console.log("🔄 Creating Klarna authorization hold (manual capture) with Paytrail API...");
    const paymentData = await c.req.json();
    console.log(
      "Payment data received:",
      JSON.stringify(paymentData, null, 2),
    );

    // Validate required fields
    // Note: redirectUrls is not required for Klarna Express endpoints
    // as they return 201 with transactionId instead of redirecting
    const requiredFields = [
      "stamp",
      "reference",
      "amount",
      "currency",
      "customer",
    ];
    const missingFields = requiredFields.filter(
      (field) => !paymentData[field],
    );

    if (missingFields.length > 0) {
      return c.json(
        {
          error: "Missing required fields",
          missing: missingFields,
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }

    // Log Klarna network session token if present
    if (paymentData.providerDetails?.klarna?.networkSessionToken) {
      console.log(
        "  Klarna Network Session Token:",
        paymentData.providerDetails.klarna.networkSessionToken,
      );
    }

    // Make API call directly to handle 403 responses
    const bodyString = JSON.stringify(paymentData);
    const { headers, signature } = createPaytrailSignature(
      "POST",
      "/payments/klarna/authorization-hold",
      {},
      bodyString,
    );

    const requestHeaders: Record<string, string> = {
      ...headers,
      signature: signature,
      "content-type": "application/json; charset=utf-8",
    };

    console.log(
      "Making POST request to: https://services.paytrail.com/payments/klarna/authorization-hold",
    );

    const paytrailResponse = await fetch(
      "https://services.paytrail.com/payments/klarna/authorization-hold",
      {
        method: "POST",
        headers: requestHeaders,
        body: bodyString,
      },
    );

    let responseData: any;
    try {
      const responseText = await paytrailResponse.text();
      console.log("📥 Raw Paytrail response text:", responseText);
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error("❌ Failed to parse Paytrail response as JSON:", parseError);
      return c.json(
        {
          error: "Failed to parse Paytrail response",
          message: parseError instanceof Error ? parseError.message : "Unknown error",
          status: paytrailResponse.status,
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    console.log("📥 Paytrail response for Klarna authorization-hold:", {
      status: paytrailResponse.status,
      statusText: paytrailResponse.statusText,
      data: responseData,
    });

    // Handle response based on status
    // Success: 200 or 201 with transaction ID
    // Error: 403 with transaction ID and stepUpUrl
    if ((paytrailResponse.status === 201 || paytrailResponse.status === 200) && responseData.transactionId) {
      // Success: return 201 with transaction ID
      console.log("✅ Klarna authorization hold created successfully");
      console.log("  Transaction ID:", responseData.transactionId);
      return c.json(
        {
          transactionId: responseData.transactionId,
        },
        201,
      );
    } else if ((paytrailResponse.status === 201 || paytrailResponse.status === 200) && !responseData.transactionId) {
      // 201 but missing transactionId - log and return error
      console.error("❌ Paytrail returned 201 but missing transactionId:", responseData);
      return c.json(
        {
          error: "Unexpected response format from Paytrail",
          message: "Response status is 201 but transactionId is missing",
          response: responseData,
          timestamp: new Date().toISOString(),
        },
        500,
      );
    } else if (paytrailResponse.status === 403 && responseData.transactionId && responseData.stepUpUrl) {
      // Step-up required: return 403 with transaction ID and stepUpUrl
      console.log("⚠️ Step-up required for Klarna authorization hold");
      console.log("  Transaction ID:", responseData.transactionId);
      console.log("  Step-up URL:", responseData.stepUpUrl);
      return c.json(
        {
          transactionId: responseData.transactionId,
          stepUpUrl: responseData.stepUpUrl,
          error: responseData.error || "Step-up required",
          message: responseData.message,
        },
        403,
      );
    } else if (paytrailResponse.status === 403) {
      // 403 but missing required fields
      console.error("❌ Paytrail returned 403 but missing transactionId or stepUpUrl:", responseData);
      return c.json(
        {
          error: "Unexpected response format from Paytrail",
          message: "Response status is 403 but transactionId or stepUpUrl is missing",
          response: responseData,
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }

    // Unexpected response format or status
    console.error("❌ Unexpected response from Paytrail:", {
      status: paytrailResponse.status,
      statusText: paytrailResponse.statusText,
      data: responseData,
    });
    return c.json(
      {
        error: "Unexpected response from Paytrail",
        status: paytrailResponse.status,
        response: responseData,
        timestamp: new Date().toISOString(),
      },
      paytrailResponse.status >= 400 && paytrailResponse.status < 500
        ? paytrailResponse.status
        : 500,
    );
  } catch (error) {
    console.error(
      "❌ Error creating Klarna authorization hold:",
      error instanceof Error ? error.message : String(error),
    );

    return c.json(
      {
        error: "Failed to create payment with Paytrail API",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
});

// Export the handler for Vercel
export default app;
