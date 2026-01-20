/**
 * Configuration loading and auth mode management for the Klarna Payment Selector Demo
 */

import { API_BASE } from "./constants.js";
import {
  availableAuthModes,
  currentAuthMode,
  sdkConfig,
  setAvailableAuthModes,
  setCurrentAuthMode,
  setSdkConfig,
} from "./state.js";
import {
  $,
  authModeBadge,
  authModeSubPartner,
  authModeToggle,
  configError,
  configErrorMessage,
  customerTokenPill,
  customerTokenStatus,
} from "./dom.js";
import { updateInteroperabilityOptionsVisibility } from "./utils.js";

// Callback for rendering both presentations - set by main.js
let renderBothPresentationsCallback = null;

export function setRenderBothPresentationsCallback(callback) {
  renderBothPresentationsCallback = callback;
}

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

export async function loadConfig() {
  try {
    const response = await fetch(`${API_BASE}/api/config`);
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || "Failed to load configuration");
    }

    setSdkConfig(data);
    if (configError) {
      configError.style.display = "none";
    }

    // Store available modes and set current mode
    setAvailableAuthModes(data.availableModes || []);
    setCurrentAuthMode(data.defaultMode || data.authMode);

    // Update sdkConfig.authMode to reflect current selection
    data.authMode = currentAuthMode;

    // Set up auth mode toggle (only if elements exist)
    if (authModeToggle) {
      setupAuthModeToggle();
    }

    // Update UI for current auth mode (only if elements exist)
    if (authModeBadge) {
      updateAuthModeUI();
    }

    // Show customer token status if configured
    if (
      customerTokenStatus && data.customerTokenConfigured &&
      data.customerTokenCountries?.length > 0
    ) {
      customerTokenStatus.style.display = "block";
      const countries = data.customerTokenCountries.join(", ");
      if (customerTokenPill) {
        customerTokenPill.textContent = `${countries}`;
        customerTokenPill.classList.add("success");
        customerTokenPill.title = `Customer tokens configured for: ${countries}`;
      }
    }

    return true;
  } catch (error) {
    console.error("Failed to load configuration:", error);
    if (configErrorMessage) {
      configErrorMessage.textContent = error.message;
    }
    if (configError) {
      configError.style.display = "flex";
    }
    return false;
  }
}

// ============================================================================
// AUTH MODE TOGGLE
// ============================================================================

/**
 * Set up auth mode toggle (always SUB_PARTNER mode)
 */
function setupAuthModeToggle() {
  if (!authModeToggle) return;

  // Hide the toggle since we only support SUB_PARTNER mode
  authModeToggle.style.display = "none";

  // Ensure SUB_PARTNER is selected
  if (authModeSubPartner) {
    authModeSubPartner.checked = true;
    authModeSubPartner.disabled = false;
  }
}

/**
 * Handle auth mode toggle change
 */
async function handleAuthModeChange(event) {
  const newMode = event.target.value;
  if (newMode === currentAuthMode) return;

  console.log(`Switching auth mode from ${currentAuthMode} to ${newMode}`);
  setCurrentAuthMode(newMode);

  // Update sdkConfig
  const modeConfig = availableAuthModes.find((m) => m.mode === newMode);
  if (modeConfig && sdkConfig) {
    sdkConfig.authMode = newMode;
    sdkConfig.clientId = modeConfig.clientId;
  }

  // Update UI
  updateAuthModeUI();

  // Re-render both presentations (with token reset since credentials changed)
  if (renderBothPresentationsCallback) {
    await renderBothPresentationsCallback({ resetTokens: true });
  }
}

/**
 * Update UI elements based on current auth mode (always SUB_PARTNER)
 */
export function updateAuthModeUI() {
  // Update auth mode badge
  if (authModeBadge) {
    authModeBadge.textContent = "👤 Sub Partner";
    authModeBadge.className = "auth-mode-badge sub-partner";
    authModeBadge.style.display = "inline-block";
  }

  // Update info banners (only if they exist)
  const subPartnerBanner = $("#info-banner-sub-partner");
  if (subPartnerBanner) {
    subPartnerBanner.style.display = "flex";
  }
  const acquiringPartnerBanner = $("#info-banner-acquiring-partner");
  if (acquiringPartnerBanner) {
    acquiringPartnerBanner.style.display = "none";
  }

  // Update interoperability options visibility (only if element exists)
  if (advancedFlowSel) {
    updateInteroperabilityOptionsVisibility();
  }
}

// ============================================================================
// FLOW DETECTION HELPERS
// ============================================================================

import { advancedFlowSel, countrySel } from "./dom.js";

/**
 * Check if tokenized payments flow is selected
 */
export function isTokenizedPaymentsFlow() {
  return advancedFlowSel && advancedFlowSel.value === "TOKENIZED_PAYMENTS";
}

/**
 * Check if an interoperability flow is selected
 */
export function isInteroperabilityFlow() {
  const value = advancedFlowSel?.value;
  return value === "KLARNA_EXPRESS_CHECKOUT" ||
    value === "SIGN_IN_WITH_KLARNA" ||
    value === "KLARNA_PRE_QUALIFICATION" ||
    value === "KLARNA_ACCOUNT_LINKING";
}

/**
 * Get the current interoperability flow (customer journey) value
 */
export function getInteroperabilityFlowValue() {
  if (!isInteroperabilityFlow()) return null;
  return advancedFlowSel?.value || null;
}

/**
 * Check if the current country has a customer token configured
 */
export function hasCustomerTokenForCurrentCountry() {
  if (!sdkConfig?.customerTokenCountries?.length) return false;
  const currentCountry = countrySel?.value?.toUpperCase();
  return sdkConfig.customerTokenCountries.includes(currentCountry);
}

// Re-export sdkConfig getter for external use
export function getSdkConfig() {
  return sdkConfig;
}
