/**
 * KLARNA PAYMENT SELECTOR DEMO - VAL TOWN BACKEND
 *
 * Main entry point that initializes and coordinates all modules.
 * This version uses server-side payment authorization via Val Town serverless functions.
 * All API calls are made over HTTPS automatically.
 */

import {
  advancedFlowSel,
  amountInput,
  clearApiLogBtn,
  clearSdkLogBtn,
  countrySel,
  localeSel,
  subscriptionBillingIntervalFrequencyInput,
  subscriptionBillingIntervalSel,
} from "./dom.js";
import { interoperabilityToken } from "./state.js";
import {
  handleExpressCheckoutAmountLock,
  initializeIntentList,
  populateCountries,
  populateLocales,
  reflectCurrency,
  setOnIntentsChangeCallback,
  toggleFieldVisibility,
  updateInteroperabilityOptionsVisibility,
} from "./utils.js";
import {
  hasCustomerTokenForCurrentCountry,
  isInteroperabilityFlow,
  isTokenizedPaymentsFlow,
  loadConfig,
  setRenderBothPresentationsCallback,
} from "./config.js";
import { fetchInteroperabilityToken } from "./tokens.js";
import { resetSDKState } from "./sdk.js";
import {
  renderPresentation,
  setSelected,
  setupSelectionHandlers,
  showSdkLoading,
} from "./presentation-sdk.js";
import {
  renderApiPresentation,
  setApiSelected,
  setupApiSelectionHandlers,
  showApiLoading,
} from "./presentation-api.js";
import { clearApiLog, clearSdkLog } from "./logging.js";
import { setupCollapsible, setupCopyableElements } from "./ui.js";

// ============================================================================
// RENDER BOTH PRESENTATIONS
// ============================================================================

/**
 * Helper to render both presentations
 * For tokenized payments and interoperability flows, we need to reset the SDK since tokens are single-use
 */
async function renderBothPresentations(options = {}) {
  const { resetTokens = false } = options;

  // If tokenized payments or interoperability flow is enabled, reset SDK state so new tokens are fetched
  // These tokens are consumed on initialization and cannot be reused
  // Also reset if explicitly requested (e.g., when switching auth modes)
  const needsTokenReset = resetTokens || isTokenizedPaymentsFlow() ||
    isInteroperabilityFlow();

  if (needsTokenReset) {
    console.log("Resetting SDK for new tokens (resetTokens:", resetTokens, ")");
    // Show loading states immediately BEFORE resetting/fetching tokens
    // This provides immediate visual feedback while the API calls are in progress
    showSdkLoading();
    showApiLoading();
    resetSDKState();
  }

  // For interoperability flows, fetch the shared interoperability token ONCE before rendering both selectors
  // This token is used by both SDK (via sdk-tokens exchange) and API (via header)
  if (
    isInteroperabilityFlow() && hasCustomerTokenForCurrentCountry() &&
    !interoperabilityToken
  ) {
    await fetchInteroperabilityToken();
  }

  renderPresentation();
  renderApiPresentation();
}

// Register the callback so other modules can call it
setRenderBothPresentationsCallback(renderBothPresentations);
setOnIntentsChangeCallback(renderBothPresentations);

// ============================================================================
// CONFIG LISTENERS
// ============================================================================

function attachConfigListeners() {
  countrySel.addEventListener("change", () => {
    populateLocales(countrySel.value);
    reflectCurrency(countrySel.value);
    // Update interoperability options visibility (only available for US)
    updateInteroperabilityOptionsVisibility();
    renderBothPresentations();
  });

  localeSel.addEventListener("change", renderBothPresentations);
  amountInput.addEventListener("change", renderBothPresentations);
  subscriptionBillingIntervalSel.addEventListener(
    "change",
    renderBothPresentations,
  );
  subscriptionBillingIntervalFrequencyInput.addEventListener(
    "change",
    renderBothPresentations,
  );

  // Intents are now handled by the reorderable list (initializeIntentList)

  // Advanced flow dropdown - re-initialize SDK and refresh presentations when changed
  if (advancedFlowSel) {
    advancedFlowSel.addEventListener("change", async () => {
      // Reset SDK to force re-initialization with new settings
      // SDK token is single-use, so we must reset when flow changes
      resetSDKState();

      // Handle KLARNA_EXPRESS_CHECKOUT amount locking
      handleExpressCheckoutAmountLock();

      // Re-render both presentations (will fetch new SDK token if needed)
      renderBothPresentations();
    });
  }

  clearSdkLogBtn.addEventListener("click", clearSdkLog);
  clearApiLogBtn.addEventListener("click", clearApiLog);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

(async function init() {
  populateCountries("SE");
  attachConfigListeners();
  initializeIntentList();
  setupCollapsible();
  setupCopyableElements();
  toggleFieldVisibility();
  setupSelectionHandlers();
  setupApiSelectionHandlers();
  setSelected("CARD");
  setApiSelected("CARD");

  // Load configuration from backend before initializing SDK and API presentation
  const configLoaded = await loadConfig();
  if (configLoaded) {
    // Render both SDK and API presentations in parallel
    await Promise.all([
      renderPresentation(),
      renderApiPresentation(),
    ]);
  }
})();