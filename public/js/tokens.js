/**
 * Token management for the Klarna Payment Selector Demo
 * Handles SDK tokens for tokenized payments and interoperability tokens
 */

import { API_BASE } from "./constants.js";
import {
  currentAuthMode,
  interoperabilityToken,
  sdkToken,
  setInteroperabilityToken,
  setSdkToken,
} from "./state.js";
import { getCurrentCountry } from "./utils.js";
import {
  getInteroperabilityFlowValue,
  hasCustomerTokenForCurrentCountry,
  isInteroperabilityFlow,
  isTokenizedPaymentsFlow,
} from "./config.js";
import { logBackendCall, logBackendError } from "./logging.js";

// ============================================================================
// SDK TOKEN MANAGEMENT
// ============================================================================

/**
 * Fetch SDK token for tokenized payments
 */
export async function fetchSdkToken() {
  try {
    const country = getCurrentCountry();
    const response = await fetch(`${API_BASE}/api/identity/sdk-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, authMode: currentAuthMode }),
    });

    const res = await response.json();

    // Log request and response to SDK panel
    if (res._request && res._response) {
      logBackendCall(
        res._request,
        res._response,
        res.status,
        "identity/sdk-tokens",
        "sdk",
      );
    }

    if (!response.ok) {
      throw new Error(res.message || "Failed to fetch SDK token");
    }

    setSdkToken(res.sdkToken);
    console.log("SDK token fetched successfully, expires at:", res.expiresAt);
    return res.sdkToken;
  } catch (error) {
    console.error("Failed to fetch SDK token:", error);
    logBackendError(`SDK token error: ${error.message}`, "sdk");
    return null;
  }
}

// ============================================================================
// INTEROPERABILITY TOKEN MANAGEMENT
// ============================================================================

/**
 * Fetch interoperability test token for advanced flows
 * This creates a test token for the selected interoperability flow
 */
export async function fetchInteroperabilityToken() {
  const customerJourney = getInteroperabilityFlowValue();
  const country = getCurrentCountry();

  if (!customerJourney) {
    console.error("No interoperability flow selected");
    return null;
  }

  if (!hasCustomerTokenForCurrentCountry()) {
    console.error("No customer token configured for country:", country);
    logBackendError(
      `No customer token configured for country: ${country}`,
      "sdk",
    );
    logBackendError(
      `No customer token configured for country: ${country}`,
      "api",
    );
    return null;
  }

  try {
    console.log("Fetching interoperability test token for:", customerJourney);
    const response = await fetch(
      `${API_BASE}/api/interoperability/test-tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerJourney,
          country,
          authMode: currentAuthMode,
        }),
      },
    );

    const data = await response.json();

    // Log the backend call to BOTH panels (shared token used by both SDK and API)
    if (data._request && data._response) {
      logBackendCall(
        data._request,
        data._response,
        response.status,
        "interoperability/test-tokens",
        "sdk",
      );
      logBackendCall(
        data._request,
        data._response,
        response.status,
        "interoperability/test-tokens",
        "api",
      );
    }

    if (!response.ok || data.status !== "OK") {
      console.error("Failed to fetch interoperability token:", data);
      logBackendError(
        `Interoperability token error: ${data.message || "Unknown error"}`,
        "sdk",
      );
      logBackendError(
        `Interoperability token error: ${data.message || "Unknown error"}`,
        "api",
      );
      return null;
    }

    setInteroperabilityToken(data.interoperabilityToken);
    console.log("Interoperability token obtained");
    return data.interoperabilityToken;
  } catch (error) {
    console.error("Error fetching interoperability token:", error);
    logBackendError(`Interoperability token error: ${error.message}`, "sdk");
    logBackendError(`Interoperability token error: ${error.message}`, "api");
    return null;
  }
}

/**
 * Fetch interoperability SDK token using the interoperability test token
 * This exchanges the test token for an SDK token to initialize the SDK
 */
export async function fetchInteroperabilitySdkToken() {
  if (!interoperabilityToken) {
    console.error("No interoperability token available");
    return null;
  }

  try {
    console.log("Fetching interoperability SDK token...");
    const response = await fetch(
      `${API_BASE}/api/interoperability/sdk-tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interoperabilityToken,
          authMode: currentAuthMode,
        }),
      },
    );

    const data = await response.json();

    // Log the backend call to SDK panel
    if (data._request && data._response) {
      logBackendCall(
        data._request,
        data._response,
        response.status,
        "interoperability/sdk-tokens",
        "sdk",
      );
    }

    if (!response.ok || data.status !== "OK") {
      console.error("Failed to fetch interoperability SDK token:", data);
      logBackendError(
        `Interoperability SDK token error: ${data.message || "Unknown error"}`,
        "sdk",
      );
      return null;
    }

    setSdkToken(data.sdkToken);
    console.log("Interoperability SDK token obtained");
    return data.sdkToken;
  } catch (error) {
    console.error("Error fetching interoperability SDK token:", error);
    logBackendError(
      `Interoperability SDK token error: ${error.message}`,
      "sdk",
    );
    return null;
  }
}

// Re-export getters for external use
export function getSdkToken() {
  return sdkToken;
}

export function getInteroperabilityToken() {
  return interoperabilityToken;
}