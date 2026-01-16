/**
 * Klarna Payment Selector Demo - Vercel Version
 *
 * This server uses Hono to handle API routes on Vercel.
 * Supports both Acquiring Partner and Sub Partner authentication modes with dynamic switching.
 *
 * Environment Variables (set in Vercel dashboard):
 *
 *    Acquiring Partner credentials:
 *    - AP_CLIENT_ID: Client ID for Acquiring Partner mode
 *    - AP_API_KEY: Base64 encoded API credentials for Acquiring Partner mode
 *    - PARTNER_ACCOUNT_ID: Partner account ID (required for Acquiring Partner mode)
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

// Acquiring Partner credentials
const AP_CLIENT_ID = getEnv("AP_CLIENT_ID");
const AP_API_KEY = getEnv("AP_API_KEY");
const PARTNER_ACCOUNT_ID = getEnv("PARTNER_ACCOUNT_ID"); // Required for Acquiring Partner mode

// Sub Partner credentials
const SP_CLIENT_ID = getEnv("SP_CLIENT_ID");
const SP_API_KEY = getEnv("SP_API_KEY");

// Paytrail API configuration
const PAYTRAIL_API_URL = getEnv("PAYTRAIL_API_URL") ||
  "https://services.paytrail.com";
const PAYTRAIL_MERCHANT_ID = getEnv("PAYTRAIL_MERCHANT_ID");
const PAYTRAIL_SECRET_KEY = getEnv("PAYTRAIL_SECRET_KEY");

// Determine which modes are available based on configured credentials
const hasAcquiringPartnerConfig =
  !!(AP_CLIENT_ID && AP_API_KEY && PARTNER_ACCOUNT_ID);
const hasSubPartnerConfig = !!(SP_CLIENT_ID && SP_API_KEY);

// Interface for auth configuration
interface AuthConfig {
  clientId: string;
  apiKey: string;
  partnerAccountId: string | null;
  isAcquiringPartner: boolean;
}

// Get credentials for a specific auth mode
function getAuthConfig(
  mode: "SUB_PARTNER" | "ACQUIRING_PARTNER",
): AuthConfig | null {
  if (mode === "ACQUIRING_PARTNER") {
    if (AP_CLIENT_ID && AP_API_KEY && PARTNER_ACCOUNT_ID) {
      return {
        clientId: AP_CLIENT_ID,
        apiKey: AP_API_KEY,
        partnerAccountId: PARTNER_ACCOUNT_ID,
        isAcquiringPartner: true,
      };
    }
    return null;
  } else {
    // SUB_PARTNER mode
    if (SP_CLIENT_ID && SP_API_KEY) {
      return {
        clientId: SP_CLIENT_ID,
        apiKey: SP_API_KEY,
        partnerAccountId: null,
        isAcquiringPartner: false,
      };
    }
    return null;
  }
}

// Default auth mode (prefer Acquiring Partner if both available, otherwise use what's configured)
const defaultAuthMode: "SUB_PARTNER" | "ACQUIRING_PARTNER" =
  hasAcquiringPartnerConfig ? "ACQUIRING_PARTNER" : "SUB_PARTNER";

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

// Helper to get auth config from request parameter (resolves to appropriate credentials)
function resolveAuthConfig(requestedMode?: string): AuthConfig {
  const mode =
    (requestedMode?.toUpperCase() === "SUB_PARTNER" ||
        requestedMode?.toUpperCase() === "ACQUIRING_PARTNER")
      ? requestedMode.toUpperCase() as "SUB_PARTNER" | "ACQUIRING_PARTNER"
      : defaultAuthMode;

  const config = getAuthConfig(mode);
  if (!config) {
    // Fall back to default mode if requested mode not available
    const fallbackConfig = getAuthConfig(defaultAuthMode);
    if (!fallbackConfig) {
      throw new Error("No authentication configuration available");
    }
    return fallbackConfig;
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

// SDK configuration endpoint - provides client ID and partner account ID to frontend
app.get("/api/config", (c) => {
  // Build available modes configuration
  const availableModes: {
    mode: "SUB_PARTNER" | "ACQUIRING_PARTNER";
    clientId: string;
    partnerAccountId?: string;
  }[] = [];

  // Check Acquiring Partner configuration
  const apConfig = getAuthConfig("ACQUIRING_PARTNER");
  if (apConfig) {
    availableModes.push({
      mode: "ACQUIRING_PARTNER",
      clientId: apConfig.clientId,
      partnerAccountId: apConfig.partnerAccountId || undefined,
    });
  }

  // Check Sub Partner configuration
  const spConfig = getAuthConfig("SUB_PARTNER");
  if (spConfig) {
    availableModes.push({
      mode: "SUB_PARTNER",
      clientId: spConfig.clientId,
    });
  }

  if (availableModes.length === 0) {
    return c.json({
      error:
        "No authentication modes configured. Please set either AP_CLIENT_ID/AP_API_KEY/PARTNER_ACCOUNT_ID for Acquiring Partner mode, or SP_CLIENT_ID/SP_API_KEY for Sub Partner mode.",
    }, 500);
  }

  // Determine default mode (prefer Acquiring Partner if both available)
  const defaultMode = availableModes.find((m) =>
    m.mode === "ACQUIRING_PARTNER"
  ) || availableModes[0];

  return c.json({
    // Available authentication modes
    availableModes,
    defaultMode: defaultMode.mode,
    // Legacy fields for backward compatibility
    clientId: defaultMode.clientId,
    ...(defaultMode.partnerAccountId &&
      { partnerAccountId: defaultMode.partnerAccountId }),
    authMode: defaultMode.mode,
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
    const { country, authMode: requestedAuthMode } = body;

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    const customerToken = country ? getCustomerTokenForCountry(country) : null;

    const apiPath = auth.isAcquiringPartner
      ? `/v2/accounts/${auth.partnerAccountId}/identity/sdk-tokens`
      : `/v2/identity/sdk-tokens`;
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
      authMode: auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
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

// Interoperability Test Token endpoint (for Acquiring Partners only)
app.post("/api/interoperability/test-tokens", async (c) => {
  try {
    const body = await c.req.json();
    const { customerJourney, country, authMode: requestedAuthMode } = body;

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    if (!auth.isAcquiringPartner) {
      return c.json({
        status: "ERROR",
        message:
          "Interoperability flows are only available for Acquiring Partners",
      }, 400);
    }

    if (!customerJourney) {
      return c.json({
        status: "ERROR",
        message: "Missing required field: customerJourney",
      }, 400);
    }

    const validJourneys = [
      "KLARNA_EXPRESS_CHECKOUT",
      "SIGN_IN_WITH_KLARNA",
      "KLARNA_PRE_QUALIFICATION",
      "KLARNA_ACCOUNT_LINKING",
    ];
    if (!validJourneys.includes(customerJourney)) {
      return c.json({
        status: "ERROR",
        message: `Invalid customerJourney. Must be one of: ${
          validJourneys.join(", ")
        }`,
      }, 400);
    }

    if (!auth.partnerAccountId) {
      return c.json({
        status: "ERROR",
        message:
          "Server configuration error: PARTNER_ACCOUNT_ID not set (required for interoperability)",
      }, 500);
    }

    const customerToken = country ? getCustomerTokenForCountry(country) : null;
    if (!customerToken) {
      return c.json({
        status: "ERROR",
        message: `No customer token configured for country: ${country}`,
      }, 400);
    }

    const requestUrl =
      `${KLARNA_API_BASE_URL}/v2/accounts/${auth.partnerAccountId}/interoperability/test-tokens`;

    const requestBody = {
      customer_journey: customerJourney,
    };

    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
      "Klarna-Customer-Token": customerToken,
      "Klarna-Customer-Region": "krn:test:us1:test",
    };

    const klarnaResponse = await fetchWithMtls(
      requestUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      },
    );

    const klarnaData = await klarnaResponse.json();
    const correlationId = klarnaResponse.headers.get("klarna-correlation-id") ||
      null;
    const mtlsVerificationStatus =
      klarnaResponse.headers.get("klarna-mtls-verification-status") || null;

    const requestMeta = {
      url: requestUrl,
      authMode: auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
      method: "POST",
      klarnaCustomerToken: customerToken,
      requestBody,
    };
    const responseMeta = {
      correlationId,
      mtlsVerificationStatus,
      responseBody: klarnaData,
    };

    if (!klarnaResponse.ok) {
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message ||
          "Interoperability test token generation failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    return c.json({
      status: "OK",
      interoperabilityToken: klarnaData.interoperability_token,
      _request: requestMeta,
      _response: responseMeta,
    });
  } catch (error) {
    console.error("Interoperability test token error:", error);
    return c.json({
      status: "ERROR",
      message: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
});

// Interoperability SDK Token endpoint (for Acquiring Partners only)
app.post("/api/interoperability/sdk-tokens", async (c) => {
  try {
    const body = await c.req.json();
    const { interoperabilityToken, authMode: requestedAuthMode } = body;

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    if (!auth.isAcquiringPartner) {
      return c.json({
        status: "ERROR",
        message:
          "Interoperability flows are only available for Acquiring Partners",
      }, 400);
    }

    if (!interoperabilityToken) {
      return c.json({
        status: "ERROR",
        message: "Missing required field: interoperabilityToken",
      }, 400);
    }

    if (!auth.partnerAccountId) {
      return c.json({
        status: "ERROR",
        message:
          "Server configuration error: PARTNER_ACCOUNT_ID not set (required for interoperability)",
      }, 500);
    }

    const requestUrl =
      `${KLARNA_API_BASE_URL}/v2/accounts/${auth.partnerAccountId}/interoperability/sdk-tokens`;

    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
      "Klarna-Interoperability-Token": interoperabilityToken,
    };

    const klarnaResponse = await fetchWithMtls(
      requestUrl,
      {
        method: "POST",
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
      authMode: auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
      method: "POST",
      klarnaInteroperabilityToken: interoperabilityToken,
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
        message: klarnaData.error_message ||
          "Interoperability SDK token generation failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    return c.json({
      status: "OK",
      sdkToken: klarnaData.sdk_token,
      _request: requestMeta,
      _response: responseMeta,
    });
  } catch (error) {
    console.error("Interoperability SDK token error:", error);
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
    const interoperabilityToken = c.req.query("interoperability_token");
    const requestedAuthMode = c.req.query("auth_mode");

    if (!currency) {
      return c.json({
        status: "ERROR",
        message: "Missing required query parameter: currency",
      }, 400);
    }

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode || undefined);
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

    const apiPath = auth.isAcquiringPartner
      ? `/v2/accounts/${auth.partnerAccountId}/payment/presentation`
      : `/v2/payment/presentation`;
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

    if (interoperabilityToken) {
      headers["Klarna-Interoperability-Token"] = interoperabilityToken;
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
      authMode: auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
      method: "GET",
      queryParams: Object.fromEntries(queryParams.entries()),
      klarnaCustomerToken: customerToken,
      klarnaInteroperabilityToken: interoperabilityToken || null,
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
      authMode: requestedAuthMode,
    } = body;

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
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

    if (!resolvedPaymentOptionId) {
      return c.json({
        status: "ERROR",
        message:
          "Missing paymentOptionId: provide it directly or include it in paymentRequestData",
      }, 400);
    }

    const paymentRequest: Record<string, unknown> = {
      currency: paymentRequestData.currency,
      payment_request_reference: paymentRequestData.paymentRequestReference ||
        `req_${Date.now()}`,
      payment_option_id: resolvedPaymentOptionId,
      customer_interaction_config: {
        method: "HANDOVER",
        return_url: returnUrl ||
          `${new URL(c.req.url).origin}/payment-complete`,
        ...(appReturnUrl && { app_return_url: appReturnUrl }),
      },
    };

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
      authMode: auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
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

// Payment authorization endpoint
app.post("/api/authorize-payment", async (c) => {
  try {
    const body = await c.req.json();
    const {
      klarnaNetworkSessionToken,
      paymentOptionId,
      paymentRequestData,
      returnUrl,
      appReturnUrl,
      partnerAccountId,
      includeCustomerToken,
      country,
      interoperabilityToken,
      authMode: requestedAuthMode,
    } = body;

    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
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

    if (!isOnlyAddToWallet && !resolvedPaymentOptionId) {
      return c.json({
        status: "ERROR",
        message:
          "Missing paymentOptionId: provide it directly or include it in paymentRequestData",
      }, 400);
    }

    const accountId = partnerAccountId || auth.partnerAccountId;

    if (auth.isAcquiringPartner && !accountId) {
      return c.json({
        status: "ERROR",
        message:
          "Partner Account ID is required for Acquiring Partner mode. Set PARTNER_ACCOUNT_ID env var or provide in request.",
      }, 400);
    }

    const authorizeRequest: Record<string, unknown> = {
      currency: paymentRequestData.currency,
      supplementary_purchase_data: transformSupplementaryPurchaseData(
        paymentRequestData.supplementaryPurchaseData,
      ),
      step_up_config: {
        payment_request_reference: paymentRequestData.paymentRequestReference ||
          `req_${Date.now()}`,
        customer_interaction_config: {
          method: "HANDOVER",
          return_url: returnUrl ||
            `${new URL(c.req.url).origin}/payment-complete`,
          ...(appReturnUrl && { app_return_url: appReturnUrl }),
        },
      },
    };

    if (!isOnlyAddToWallet) {
      authorizeRequest.request_payment_transaction = {
        amount: paymentRequestData.amount,
        payment_option_id: resolvedPaymentOptionId,
        payment_transaction_reference:
          paymentRequestData.paymentRequestReference || `txn_${Date.now()}`,
      };
    }

    if (paymentRequestData.requestCustomerToken) {
      authorizeRequest.request_customer_token = {
        scopes: paymentRequestData.requestCustomerToken.scopes,
        customer_token_reference:
          paymentRequestData.requestCustomerToken.customerTokenReference,
      };
    }

    const apiPath = auth.isAcquiringPartner
      ? `/v2/accounts/${accountId}/payment/authorize`
      : `/v2/payment/authorize`;
    const requestUrl = `${KLARNA_API_BASE_URL}${apiPath}`;

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
    if (interoperabilityToken) {
      headers["Klarna-Interoperability-Token"] = interoperabilityToken;
    }

    const klarnaResponse = await fetchWithMtls(
      requestUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify(authorizeRequest),
      },
    );

    const klarnaData = await klarnaResponse.json();
    const correlationId = klarnaResponse.headers.get("klarna-correlation-id") ||
      null;
    const mtlsVerificationStatus =
      klarnaResponse.headers.get("klarna-mtls-verification-status") || null;

    const requestMeta = {
      url: requestUrl,
      authMode: auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
      method: "POST",
      klarnaNetworkSessionToken: klarnaNetworkSessionToken || null,
      klarnaCustomerToken: customerToken,
      klarnaInteroperabilityToken: interoperabilityToken || null,
      requestBody: authorizeRequest,
    };
    const responseMeta = {
      correlationId,
      mtlsVerificationStatus,
      responseBody: klarnaData,
    };

    if (!klarnaResponse.ok) {
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message || "Payment authorization failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    const paymentResult = klarnaData.payment_transaction_response?.result;
    const customerTokenResult = klarnaData.customer_token_response?.result;

    const result = isOnlyAddToWallet ? customerTokenResult : paymentResult;

    switch (result) {
      case "STEP_UP_REQUIRED":
        return c.json({
          status: "STEP_UP_REQUIRED",
          paymentRequestId: klarnaData.payment_request?.state_context
            ?.customer_interaction?.payment_request_id,
          paymentRequestUrl: klarnaData.payment_request?.state_context
            ?.customer_interaction?.payment_request_url,
          expiresAt: klarnaData.payment_request?.expires_at,
          _request: requestMeta,
          _response: responseMeta,
        });

      case "APPROVED":
        if (isOnlyAddToWallet) {
          return c.json({
            status: "APPROVED",
            customerTokenId: klarnaData.customer_token_response?.customer_token
              ?.customer_token_id,
            customerTokenReference: klarnaData.customer_token_response
              ?.customer_token?.customer_token_reference,
            successUrl: returnUrl || "/payment-complete",
            _request: requestMeta,
            _response: responseMeta,
          });
        }
        return c.json({
          status: "APPROVED",
          paymentTransactionId: klarnaData.payment_transaction_response
            ?.payment_transaction?.payment_transaction_id,
          paymentTransactionReference: klarnaData.payment_transaction_response
            ?.payment_transaction?.payment_transaction_reference,
          successUrl: returnUrl || "/payment-complete",
          _request: requestMeta,
          _response: responseMeta,
        });

      case "DECLINED":
        const declineReason = isOnlyAddToWallet
          ? klarnaData.customer_token_response?.result_reason
          : klarnaData.payment_transaction_response?.result_reason;
        return c.json({
          status: "DECLINED",
          message: declineReason || "Request declined",
          reason: declineReason,
          _request: requestMeta,
          _response: responseMeta,
        });

      default:
        return c.json({
          status: "ERROR",
          message: `Unexpected result: ${result}`,
          details: klarnaData,
          _request: requestMeta,
          _response: responseMeta,
        }, 500);
    }
  } catch (error) {
    console.error("Payment authorization error:", error);
    return c.json({
      status: "ERROR",
      message: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
});

// ============================================================================
// HELPER FUNCTIONS
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

// Export the handler for Vercel
export default app;
