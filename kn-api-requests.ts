/**
 * Klarna Payment Selector Demo - Val Town Version with Hono
 *
 * This server uses Hono to serve static files and handle API routes.
 * Supports both Acquiring Partner and Sub Partner authentication modes with dynamic switching.
 *
 * To use in Val Town:
 * 1. Create a new HTTP val
 * 2. Paste this file
 * 3. Set environment variables in Val Town settings:
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
 *
 * Authentication Modes:
 * - SUB_PARTNER: SDK uses only CLIENT_ID, API calls use /v2/payment/requests and /v2/payment/presentation
 * - ACQUIRING_PARTNER: SDK uses CLIENT_ID + PARTNER_ACCOUNT_ID, API calls use /v2/accounts/{id}/payment/authorize and /v2/accounts/{id}/payment/presentation
 */

import { serveFile } from "https://esm.town/v/std/utils@85-main/index.ts";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();

// Type declarations for Deno/Val Town runtime (suppress local linter errors)
// @ts-ignore - Val Town/Deno specific imports
interface DenoHttpClient {
  close(): void;
}

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  createHttpClient?(options: {
    cert?: string;
    key?: string;
    caCerts?: string[];
  }): DenoHttpClient;
} | undefined;

// Node.js fallback declarations (used only if not running in Deno)
declare const process: { env: Record<string, string | undefined> } | undefined;
declare const Buffer: {
  from(str: string, encoding: string): { toString(encoding: string): string };
} | undefined;

// Configuration from environment variables
const getEnv = (key: string): string => {
  if (typeof Deno !== "undefined" && Deno?.env) {
    return Deno.env.get(key) || "";
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] || "";
  }
  return "";
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
  try {
    // Use atob for browser/Deno compatibility
    return atob(b64);
  } catch {
    // Fallback for Node.js
    return Buffer.from(b64, "base64").toString("utf-8");
  }
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

// Get mTLS credentials (decoded PEM strings)
function getMtlsCredentials(): { cert: string; key: string } | null {
  if (!isMtlsConfigured) return null;

  try {
    return {
      cert: decodeBase64(MTLS_CERT_B64),
      key: decodeBase64(MTLS_KEY_B64),
    };
  } catch (error) {
    console.error("Failed to decode mTLS credentials:", error);
    return null;
  }
}

// Create HTTP client with optional mTLS
function createHttpClient(): DenoHttpClient | null {
  if (!isMtlsConfigured) return null;

  const credentials = getMtlsCredentials();
  if (!credentials) return null;

  if (typeof Deno !== "undefined" && Deno?.createHttpClient) {
    console.log("Creating mTLS-enabled HTTP client");
    return Deno.createHttpClient({
      cert: credentials.cert,
      key: credentials.key,
    });
  }

  console.warn("mTLS configured but Deno.createHttpClient not available");
  return null;
}

// Fetch with optional mTLS support
async function fetchWithMtls(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const client = createHttpClient();

  if (client) {
    try {
      // Use Deno's fetch with custom client
      const response = await fetch(url, {
        ...options,
        // @ts-ignore - Deno-specific option
        client,
      });
      return response;
    } finally {
      // Clean up the client
      client.close();
    }
  }

  // Fallback to regular fetch without mTLS
  return fetch(url, options);
}

// Enable CORS
app.use("*", cors());

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

// Serve index.html at the root /
app.get("/", async (c) => {
  return serveFile("/public/index.html", import.meta.url);
});

// Serve payment completion page
app.get("/payment-complete", async (c) => {
  return serveFile("/public/payment-complete.html", import.meta.url);
});

// Serve all /public files (CSS, JS, etc.)
app.get("/public/*", (c) => serveFile(c.req.path, import.meta.url));

// ============================================================================
// API ROUTES
// ============================================================================

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    authMode: AUTH_MODE,
    mtls: isMtlsConfigured ? "configured" : "not configured",
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
// API Reference: https://docs.klarna.com/klarna-network-distribution/api/klarna-product-api-identity/#tag/Identity-API/operation/generateIdentitySdkToken
app.post("/api/identity/sdk-tokens", async (c) => {
  try {
    const body = await c.req.json();
    const { country, authMode: requestedAuthMode } = body; // Country is used to look up the customer token

    // Resolve auth configuration based on requested mode
    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    // Get customer token for the specified country
    const customerToken = country ? getCustomerTokenForCountry(country) : null;

    // Build the API URL based on authentication mode
    const apiPath = auth.isAcquiringPartner
      ? `/v2/accounts/${auth.partnerAccountId}/identity/sdk-tokens`
      : `/v2/identity/sdk-tokens`;
    const requestUrl = `${KLARNA_API_BASE_URL}${apiPath}`;

    console.log("Calling Klarna Identity SDK Token API...");
    console.log(
      "Auth Mode:",
      auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
    );
    console.log("Request URL:", requestUrl);
    console.log("Country:", country || "not specified");
    console.log(
      "Customer Token:",
      customerToken ? "found for country" : "not configured for country",
    );
    console.log("mTLS:", isMtlsConfigured ? "enabled" : "disabled");

    // Build headers
    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
    };

    // Add customer token header if found for country
    if (customerToken) {
      headers["Klarna-Customer-Token"] = customerToken;
    }

    // Call Klarna's Identity SDK Token API (with optional mTLS)
    const klarnaResponse = await fetchWithMtls(
      requestUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}), // Empty body for SDK token generation
      },
    );

    const klarnaData = await klarnaResponse.json();
    const correlationId = klarnaResponse.headers.get("klarna-correlation-id") ||
      null;
    const mtlsVerificationStatus =
      klarnaResponse.headers.get("klarna-mtls-verification-status") || null;

    console.log(
      "Klarna Identity SDK Token API Response:",
      JSON.stringify(klarnaData, null, 2),
    );
    console.log("Klarna Correlation ID:", correlationId);

    // Response metadata for frontend logging
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
      console.error("Klarna Identity SDK Token API Error:", klarnaData);
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message || "SDK token generation failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    // Return the SDK token
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
// API Reference: POST /v2/accounts/{accountId}/interoperability/test-tokens
// This creates a test token for interoperability flows (EXPRESS_CHECKOUT, SIGN_IN, PRE_QUAL, ACCOUNT_LINKING)
app.post("/api/interoperability/test-tokens", async (c) => {
  try {
    const body = await c.req.json();
    const { customerJourney, country, authMode: requestedAuthMode } = body;

    // Resolve auth configuration based on requested mode
    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    // Interoperability flows are only available for Acquiring Partners
    if (!auth.isAcquiringPartner) {
      return c.json({
        status: "ERROR",
        message:
          "Interoperability flows are only available for Acquiring Partners",
      }, 400);
    }

    // Validate required fields
    if (!customerJourney) {
      return c.json({
        status: "ERROR",
        message: "Missing required field: customerJourney",
      }, 400);
    }

    // Validate customerJourney value
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

    // Get customer token for the specified country
    const customerToken = country ? getCustomerTokenForCountry(country) : null;
    if (!customerToken) {
      return c.json({
        status: "ERROR",
        message: `No customer token configured for country: ${country}`,
      }, 400);
    }

    // Build the API URL
    const requestUrl =
      `${KLARNA_API_BASE_URL}/v2/accounts/${auth.partnerAccountId}/interoperability/test-tokens`;

    // Build request body
    const requestBody = {
      customer_journey: customerJourney,
    };

    // Build headers
    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
      "Klarna-Customer-Token": customerToken,
      "Klarna-Customer-Region": "krn:test:us1:test",
    };

    console.log("Calling Klarna Interoperability Test Tokens API...");
    console.log(
      "Auth Mode:",
      auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
    );
    console.log("Request URL:", requestUrl);
    console.log("Customer Journey:", customerJourney);
    console.log("Country:", country);
    console.log(
      "Customer Token:",
      customerToken ? "found for country" : "not configured",
    );
    console.log("mTLS:", isMtlsConfigured ? "enabled" : "disabled");

    // Call Klarna's Interoperability Test Tokens API (with optional mTLS)
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

    console.log(
      "Klarna Interoperability Test Tokens API Response:",
      JSON.stringify(klarnaData, null, 2),
    );
    console.log("Klarna Correlation ID:", correlationId);

    // Response metadata for frontend logging
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
      console.error(
        "Klarna Interoperability Test Tokens API Error:",
        klarnaData,
      );
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message ||
          "Interoperability test token generation failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    // Return the interoperability token
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
// API Reference: POST /v2/accounts/{accountId}/interoperability/sdk-tokens
// This exchanges an interoperability test token for an SDK token to initialize the SDK
app.post("/api/interoperability/sdk-tokens", async (c) => {
  try {
    const body = await c.req.json();
    const { interoperabilityToken, authMode: requestedAuthMode } = body;

    // Resolve auth configuration based on requested mode
    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    // Interoperability flows are only available for Acquiring Partners
    if (!auth.isAcquiringPartner) {
      return c.json({
        status: "ERROR",
        message:
          "Interoperability flows are only available for Acquiring Partners",
      }, 400);
    }

    // Validate required fields
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

    // Build the API URL
    const requestUrl =
      `${KLARNA_API_BASE_URL}/v2/accounts/${auth.partnerAccountId}/interoperability/sdk-tokens`;

    // Build headers - the interoperability token is passed as a header
    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
      "Klarna-Interoperability-Token": interoperabilityToken,
    };

    console.log("Calling Klarna Interoperability SDK Tokens API...");
    console.log(
      "Auth Mode:",
      auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
    );
    console.log("Request URL:", requestUrl);
    console.log(
      "Interoperability Token:",
      interoperabilityToken ? "included" : "not included",
    );
    console.log("mTLS:", isMtlsConfigured ? "enabled" : "disabled");

    // Call Klarna's Interoperability SDK Tokens API (with optional mTLS)
    // Note: This endpoint has no request body
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

    console.log(
      "Klarna Interoperability SDK Tokens API Response:",
      JSON.stringify(klarnaData, null, 2),
    );
    console.log("Klarna Correlation ID:", correlationId);

    // Response metadata for frontend logging
    const requestMeta = {
      url: requestUrl,
      authMode: auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
      method: "POST",
      klarnaInteroperabilityToken: interoperabilityToken,
      requestBody: {}, // No body for this request
    };
    const responseMeta = {
      correlationId,
      mtlsVerificationStatus,
      responseBody: klarnaData,
    };

    if (!klarnaResponse.ok) {
      console.error(
        "Klarna Interoperability SDK Tokens API Error:",
        klarnaData,
      );
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message ||
          "Interoperability SDK token generation failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    // Return the SDK token
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
    // Get query parameters
    const currency = c.req.query("currency");
    const locale = c.req.query("locale");
    const amount = c.req.query("amount");
    const intents = c.req.query("intents"); // comma-separated
    const subscriptionBillingInterval = c.req.query(
      "subscription_billing_interval",
    );
    const subscriptionBillingIntervalFrequency = c.req.query(
      "subscription_billing_interval_frequency",
    );
    const includeCustomerToken =
      c.req.query("include_customer_token") === "true";
    const country = c.req.query("country"); // Country for customer token lookup
    const interoperabilityToken = c.req.query("interoperability_token"); // For interoperability flows
    const requestedAuthMode = c.req.query("auth_mode"); // Auth mode from frontend

    // Validate required fields
    if (!currency) {
      return c.json({
        status: "ERROR",
        message: "Missing required query parameter: currency",
      }, 400);
    }

    // Resolve auth configuration based on requested mode
    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode || undefined);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    // Build query parameters for Klarna API
    const queryParams = new URLSearchParams();
    queryParams.append("currency", currency);
    if (locale) queryParams.append("locale", locale);
    if (amount) queryParams.append("amount", amount);
    if (intents) {
      // Klarna API expects array format: intents[]=PAY&intents[]=SUBSCRIBE
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

    // Build the API URL based on authentication mode
    const apiPath = auth.isAcquiringPartner
      ? `/v2/accounts/${auth.partnerAccountId}/payment/presentation`
      : `/v2/payment/presentation`;
    const requestUrl =
      `${KLARNA_API_BASE_URL}${apiPath}?${queryParams.toString()}`;

    // Build headers
    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
    };

    // Add customer token header if requested and token exists for country (for tokenized payments)
    const customerToken = includeCustomerToken && country
      ? getCustomerTokenForCountry(country)
      : null;
    if (customerToken) {
      headers["Klarna-Customer-Token"] = customerToken;
    }

    // Add interoperability token header if provided (for interoperability flows)
    if (interoperabilityToken) {
      headers["Klarna-Interoperability-Token"] = interoperabilityToken;
    }

    console.log("Calling Klarna Payment Presentation API (GET)...");
    console.log(
      "Auth Mode:",
      auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
    );
    console.log("Request URL:", requestUrl);
    console.log("Country:", country || "not specified");
    console.log(
      "Customer Token:",
      customerToken ? "found for country" : "not configured for country",
    );
    console.log(
      "Interoperability Token:",
      interoperabilityToken ? "included" : "not included",
    );
    console.log("mTLS:", isMtlsConfigured ? "enabled" : "disabled");

    // Call Klarna's Payment Presentation API (GET with optional mTLS)
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

    console.log(
      "Klarna Presentation API Response:",
      JSON.stringify(klarnaData, null, 2),
    );
    console.log("Klarna Correlation ID:", correlationId);

    // Response metadata for frontend logging
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
      console.error("Klarna Presentation API Error:", klarnaData);
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message || "Presentation API failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    // Return the presentation data with metadata
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
// Creates a payment request and returns payment_request_id/payment_request_url
// API Reference: https://docs.klarna.com/klarna-network-distribution/api/klarna-product-api-payment/#tag/Payment-Request-API/operation/createPaymentRequest
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
      country, // Country for customer token lookup
      authMode: requestedAuthMode, // Auth mode from frontend
    } = body;

    // Resolve auth configuration based on requested mode
    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    // Validate required fields
    if (!paymentRequestData) {
      return c.json({
        status: "ERROR",
        message: "Missing required field: paymentRequestData is required",
      }, 400);
    }

    // Check if intent is only ADD_TO_WALLET (amount should be omitted)
    const intents = paymentRequestData.intents as string[] | undefined;
    const isOnlyAddToWallet = intents && intents.length === 1 &&
      intents[0] === "ADD_TO_WALLET";

    // Retrieve paymentOptionId: use direct parameter or get from paymentRequestData
    const resolvedPaymentOptionId = paymentOptionId ||
      paymentRequestData.paymentOptionId;

    // paymentOptionId is required for payment request
    if (!resolvedPaymentOptionId) {
      return c.json({
        status: "ERROR",
        message:
          "Missing paymentOptionId: provide it directly or include it in paymentRequestData",
      }, 400);
    }

    // Build the Payment Request API request body
    // Structure: amount, currency, payment_request_reference, supplementary_purchase_data,
    //            request_customer_token, customer_interaction_config, payment_option_id
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

    // Only include amount if NOT ADD_TO_WALLET only
    if (!isOnlyAddToWallet) {
      paymentRequest.amount = paymentRequestData.amount;
    }

    // Add supplementary_purchase_data if present
    if (paymentRequestData.supplementaryPurchaseData) {
      paymentRequest.supplementary_purchase_data =
        transformSupplementaryPurchaseData(
          paymentRequestData.supplementaryPurchaseData,
        );
    }

    // Add request_customer_token if present
    if (paymentRequestData.requestCustomerToken) {
      paymentRequest.request_customer_token = {
        scopes: paymentRequestData.requestCustomerToken.scopes,
        customer_token_reference:
          paymentRequestData.requestCustomerToken.customerTokenReference,
      };
    }

    // Build the API URL - SUB_PARTNER mode uses /v2/payment/requests (no account ID)
    const requestUrl = `${KLARNA_API_BASE_URL}/v2/payment/requests`;

    // Build headers
    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
    };
    if (klarnaNetworkSessionToken) {
      headers["Klarna-Network-Session-Token"] = klarnaNetworkSessionToken;
    }
    // Add customer token header if requested and token exists for country (for tokenized payments)
    const customerToken = includeCustomerToken && country
      ? getCustomerTokenForCountry(country)
      : null;
    if (customerToken) {
      headers["Klarna-Customer-Token"] = customerToken;
    }

    console.log("Calling Klarna Payment Request API...");
    console.log(
      "Auth Mode:",
      auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
    );
    console.log(
      "Intent:",
      isOnlyAddToWallet
        ? "ADD_TO_WALLET only (no amount)"
        : (intents?.join(", ") || "not specified"),
    );
    console.log("Request URL:", requestUrl);
    console.log("Request Body:", JSON.stringify(paymentRequest, null, 2));
    console.log("Country:", country || "not specified");
    console.log(
      "Customer Token:",
      customerToken ? "found for country" : "not configured for country",
    );
    console.log("mTLS:", isMtlsConfigured ? "enabled" : "disabled");

    // Call Klarna's Payment Request API (with optional mTLS)
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

    console.log(
      "Klarna Payment Request API Response:",
      JSON.stringify(klarnaData, null, 2),
    );
    console.log("Klarna Correlation ID:", correlationId);
    console.log("Klarna mTLS Verification Status:", mtlsVerificationStatus);

    // Response metadata for frontend logging
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
      console.error("Klarna Payment Request API Error:", klarnaData);
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message || "Payment request creation failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    // Check the payment request state
    const paymentRequestState = klarnaData.state;
    console.log("Payment Request State:", paymentRequestState);

    // Handle COMPLETED state (tokenized payments with existing customer token)
    // In this case, the payment is already completed and we redirect to return_url
    if (paymentRequestState === "COMPLETED") {
      const returnUrlFromResponse =
        klarnaData.customer_interaction_config?.return_url || returnUrl ||
        "/payment-complete";
      return c.json({
        status: "COMPLETED",
        paymentRequestId: klarnaData.payment_request_id,
        successUrl: returnUrlFromResponse,
        expiresAt: klarnaData.expires_at,
        _request: requestMeta,
        _response: responseMeta,
      });
    }

    // Success (HTTP 201 with SUBMITTED state) - extract payment_request_id and payment_request_url from state_context
    const paymentRequestId = klarnaData.state_context?.customer_interaction
      ?.payment_request_id;
    const paymentRequestUrl = klarnaData.state_context?.customer_interaction
      ?.payment_request_url;

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

// Payment authorization endpoint (supports both ACQUIRING_PARTNER and SUB_PARTNER modes)
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
      country, // Country for customer token lookup
      interoperabilityToken, // For interoperability flows
      authMode: requestedAuthMode, // Auth mode from frontend
    } = body;

    // Resolve auth configuration based on requested mode
    let auth: AuthConfig;
    try {
      auth = resolveAuthConfig(requestedAuthMode);
    } catch (error) {
      return c.json({
        status: "ERROR",
        message: "Server configuration error: No authentication configured",
      }, 500);
    }

    // Validate that we have payment request data
    if (!paymentRequestData) {
      return c.json({
        status: "ERROR",
        message: "Missing required field: paymentRequestData is required",
      }, 400);
    }

    // Check if intent is only ADD_TO_WALLET (no payment transaction needed)
    const intents = paymentRequestData.intents as string[] | undefined;
    const isOnlyAddToWallet = intents && intents.length === 1 &&
      intents[0] === "ADD_TO_WALLET";

    // Retrieve paymentOptionId: use direct parameter or get from paymentRequestData
    const resolvedPaymentOptionId = paymentOptionId ||
      paymentRequestData.paymentOptionId;

    // paymentOptionId is only required when there's a payment transaction (not ADD_TO_WALLET only)
    if (!isOnlyAddToWallet && !resolvedPaymentOptionId) {
      return c.json({
        status: "ERROR",
        message:
          "Missing paymentOptionId: provide it directly or include it in paymentRequestData",
      }, 400);
    }

    // For Acquiring Partner mode, account ID is required
    const accountId = partnerAccountId || auth.partnerAccountId;

    if (auth.isAcquiringPartner && !accountId) {
      return c.json({
        status: "ERROR",
        message:
          "Partner Account ID is required for Acquiring Partner mode. Set AP_PARTNER_ACCOUNT_ID env var or provide in request.",
      }, 400);
    }

    // Build the Payment Authorize API request
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

    // Only include request_payment_transaction if not ADD_TO_WALLET only
    if (!isOnlyAddToWallet) {
      authorizeRequest.request_payment_transaction = {
        amount: paymentRequestData.amount,
        payment_option_id: resolvedPaymentOptionId,
        payment_transaction_reference:
          paymentRequestData.paymentRequestReference || `txn_${Date.now()}`,
      };
    }

    // Add requestCustomerToken if present
    if (paymentRequestData.requestCustomerToken) {
      authorizeRequest.request_customer_token = {
        scopes: paymentRequestData.requestCustomerToken.scopes,
        customer_token_reference:
          paymentRequestData.requestCustomerToken.customerTokenReference,
      };
    }

    // Build the API URL based on authentication mode
    // Acquiring Partner: /v2/accounts/{accountId}/payment/authorize
    // Sub Partner: /v2/payment/authorize (no account ID in path)
    const apiPath = auth.isAcquiringPartner
      ? `/v2/accounts/${accountId}/payment/authorize`
      : `/v2/payment/authorize`;
    const requestUrl = `${KLARNA_API_BASE_URL}${apiPath}`;

    // Build headers
    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth.apiKey}`,
      "Content-Type": "application/json",
    };
    if (klarnaNetworkSessionToken) {
      headers["Klarna-Network-Session-Token"] = klarnaNetworkSessionToken;
    }
    // Add customer token header if requested and token exists for country (for tokenized payments)
    const customerToken = includeCustomerToken && country
      ? getCustomerTokenForCountry(country)
      : null;
    if (customerToken) {
      headers["Klarna-Customer-Token"] = customerToken;
    }
    // Add interoperability token header if provided (for interoperability flows)
    if (interoperabilityToken) {
      headers["Klarna-Interoperability-Token"] = interoperabilityToken;
    }

    console.log("Calling Klarna Payment Authorize API...");
    console.log(
      "Auth Mode:",
      auth.isAcquiringPartner ? "ACQUIRING_PARTNER" : "SUB_PARTNER",
    );
    console.log(
      "Intent:",
      isOnlyAddToWallet
        ? "ADD_TO_WALLET only (no payment transaction)"
        : (intents?.join(", ") || "not specified"),
    );
    console.log("Request URL:", requestUrl);
    console.log("Request Body:", JSON.stringify(authorizeRequest, null, 2));
    console.log("Country:", country || "not specified");
    console.log(
      "Customer Token:",
      customerToken ? "found for country" : "not configured for country",
    );
    console.log(
      "Interoperability Token:",
      interoperabilityToken ? "included" : "not included",
    );
    console.log("mTLS:", isMtlsConfigured ? "enabled" : "disabled");

    // Call Klarna's Payment Authorize API (with optional mTLS)
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

    console.log("Klarna API Response:", JSON.stringify(klarnaData, null, 2));
    console.log("Klarna Correlation ID:", correlationId);
    console.log("Klarna mTLS Verification Status:", mtlsVerificationStatus);

    // Common response metadata for frontend logging
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
      console.error("Klarna API Error:", klarnaData);
      return c.json({
        status: "ERROR",
        message: klarnaData.error_message || "Payment authorization failed",
        details: klarnaData,
        _request: requestMeta,
        _response: responseMeta,
      }, klarnaResponse.status);
    }

    // Handle the response based on result
    // For ADD_TO_WALLET only: response contains customer_token_response instead of payment_transaction_response
    // For payment flows: response contains payment_transaction_response
    const paymentResult = klarnaData.payment_transaction_response?.result;
    const customerTokenResult = klarnaData.customer_token_response?.result;

    // Determine which result to use based on the flow type
    const result = isOnlyAddToWallet ? customerTokenResult : paymentResult;

    switch (result) {
      case "STEP_UP_REQUIRED":
        // payment_request_id is always in payment_request.state_context.customer_interaction
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
          // ADD_TO_WALLET approved - return customer token info
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
        // Regular payment approved
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

/**
 * Transform frontend supplementaryPurchaseData to Klarna API format (snake_case)
 */
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

// Export the Hono app as the default handler
export default app.fetch;