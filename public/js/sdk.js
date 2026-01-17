/**
 * Klarna SDK management for the Payment Selector Demo
 */

import {
  interoperabilityToken,
  klarna,
  sdkConfig,
  sdkToken,
  setInteroperabilityToken,
  setKlarna,
  setSdkToken,
} from "./state.js";
import { advancedFlowSel } from "./dom.js";
import {
  hasCustomerTokenForCurrentCountry,
  isInteroperabilityFlow,
  isTokenizedPaymentsFlow,
  loadConfig,
} from "./config.js";
import {
  fetchInteroperabilitySdkToken,
  fetchInteroperabilityToken,
  fetchSdkToken,
} from "./tokens.js";
import { logSdkEvent } from "./logging.js";

// ============================================================================
// SDK STATE MANAGEMENT
// ============================================================================

/**
 * Reset SDK state - used when config changes and advanced flows require new tokens
 */
export function resetSDKState() {
  if (klarna) {
    console.log("Resetting SDK state for new token");
    setKlarna(null);
  }
  // Clear tokens so new ones are fetched
  setSdkToken(null);
  setInteroperabilityToken(null);
}

// ============================================================================
// SDK INITIALIZATION
// ============================================================================

export async function ensureSDK() {
  // If we already have SDK initialized, return it
  if (klarna) return klarna;

  // Ensure config is loaded
  if (!sdkConfig) {
    const configLoaded = await loadConfig();
    if (!configLoaded) {
      throw new Error("SDK configuration not available");
    }
  }

  // For tokenized payments, fetch SDK token first if not already fetched
  // Only if a customer token is configured for the current country
  if (
    isTokenizedPaymentsFlow() && !sdkToken &&
    hasCustomerTokenForCurrentCountry()
  ) {
    await fetchSdkToken();
  }

  // For interoperability flows, we need both the interoperability test token AND the SDK token
  // The interoperability test token may have been fetched in renderBothPresentations(),
  // but we ensure it's available here as well
  if (isInteroperabilityFlow() && hasCustomerTokenForCurrentCountry()) {
    // Step 1: Ensure we have the interoperability test token
    if (!interoperabilityToken) {
      console.log("Fetching interoperability test token in ensureSDK...");
      await fetchInteroperabilityToken();
    }

    // Step 2: Exchange the interoperability token for an SDK token
    if (interoperabilityToken && !sdkToken) {
      console.log("Exchanging interoperability token for SDK token...");
      await fetchInteroperabilitySdkToken();
    }
  }

  const { KlarnaSDK } = await import(
    "https://js.klarna.com/web-sdk/v2/klarna.mjs"
  );

  // Initialize SDK based on authentication mode from environment variables
  // SUB_PARTNER: only CLIENT_ID needed
  // ACQUIRING_PARTNER: CLIENT_ID + PARTNER_ACCOUNT_ID needed
  const initConfig = {
    clientId: sdkConfig.clientId,
    products: ["PAYMENT", "MESSAGING"],
  };

  // Include locale if provided in config
  if (sdkConfig.locale) {
    initConfig.locale = sdkConfig.locale;
  }

  // Only include partnerAccountId for Acquiring Partner mode
  if (sdkConfig.partnerAccountId) {
    initConfig.partnerAccountId = sdkConfig.partnerAccountId;
  }

  // Include sdkToken for tokenized payments or interoperability flows
  if ((isTokenizedPaymentsFlow() || isInteroperabilityFlow()) && sdkToken) {
    initConfig.sdkToken = sdkToken;
    console.log(
      "✓ Including SDK token for advanced flow:",
      advancedFlowSel?.value,
    );
  } else if (isInteroperabilityFlow() && !sdkToken) {
    console.warn("⚠ Interoperability flow selected but no SDK token available");
  }

  console.log("SDK Init Config:", JSON.stringify(initConfig, null, 2));
  console.log("Auth Mode:", sdkConfig.authMode);
  console.log("Advanced Flow:", advancedFlowSel?.value || "none");
  console.log("SDK Token available:", !!sdkToken);
  console.log("Interoperability Token available:", !!interoperabilityToken);

  // Log SDK init config to SDK logs panel
  logSdkEvent("SDK Initialization", initConfig);

  const klarnaInstance = await KlarnaSDK(initConfig);
  setKlarna(klarnaInstance);
  attachSDKEventListeners(klarnaInstance);

  return klarnaInstance;
}

// ============================================================================
// SDK EVENT LISTENERS
// ============================================================================

function attachSDKEventListeners(sdk) {
  sdk.Payment.on("error", (error, paymentRequest) => {
    logSdkEvent("Payment Error", { error, paymentRequest }, "error");
  });

  sdk.Payment.on("abort", (paymentRequest) => {
    logSdkEvent("Payment Aborted", {
      state: paymentRequest.state,
      stateReason: paymentRequest.stateReason,
    });
    if (paymentRequest.state === "SUBMITTED") {
      sdk.Payment.cancel(paymentRequest.paymentRequestId);
    }
  });

  sdk.Payment.on("complete", (paymentRequest) => {
    logSdkEvent("Payment Complete", {
      paymentRequestId: paymentRequest.paymentRequestId,
      state: paymentRequest.state,
      stateContext: paymentRequest.stateContext,
    });
    return false;
  });

  sdk.Interoperability.on("tokenupdate", (token) => {
    setInteroperabilityToken(token);
    logSdkEvent("Interoperability Token Update", { token });
  });
}
