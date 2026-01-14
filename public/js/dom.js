/**
 * DOM element references for the Klarna Payment Selector Demo
 */

const $ = (s) => document.querySelector(s);

// Config panel elements
export const countrySel = $("#country");
export const localeSel = $("#locale");
export const amountInput = $("#amount");
export const amountField = $("#amount-field");
export const subscriptionBillingIntervalSel = $(
  "#subscription-billing-interval",
);
export const subscriptionBillingIntervalField = $(
  "#subscription-billing-interval-field",
);
export const subscriptionBillingIntervalFrequencyInput = $(
  "#subscription-billing-interval-frequency",
);
export const subscriptionBillingIntervalFrequencyField = $(
  "#subscription-billing-interval-frequency-field",
);
export const availableIntents = $("#available-intents");
export const selectedIntentsList = $("#selected-intents");
export const intentsEmpty = $("#intents-empty");
export const currencyPill = $("#currency-pill");
export const configError = $("#config-error");
export const configErrorMessage = $("#config-error-message");
export const intentWarning = $("#intent-warning");

// SDK Payment Selector elements
export const optCard = $("#option-card");
export const optKlarna = $("#option-klarna");
export const optKlarnaSaved = $("#option-klarna-saved");
export const msg1 = $("#opt1-message");
export const msg2 = $("#opt2-message");
export const sdkLoadingPlaceholder = $("#sdk-loading-placeholder");
export const sdkLoadingButton = $("#sdk-loading-button");

// API Payment Selector elements
export const apiOptCard = $("#api-option-card");
export const apiOptKlarna = $("#api-option-klarna");
export const apiOptKlarnaSaved = $("#api-option-klarna-saved");
export const apiMsg1 = $("#api-opt1-message");
export const apiMsg2 = $("#api-opt2-message");
export const apiLoadingPlaceholder = $("#api-loading-placeholder");
export const apiLoadingButton = $("#api-loading-button");

// SDK presentation info elements
export const sdkPresentationInstructionEl = $("#sdk-presentation-instruction");
export const sdkPaymentOptionIdEl = $("#sdk-payment-option-id");

// API presentation info elements
export const apiPresentationInstructionEl = $("#api-presentation-instruction");
export const apiPaymentOptionIdEl = $("#api-payment-option-id");

// Log panels (organized by payment selector, not by log type)
export const sdkLogContent = $("#sdk-log-content"); // SDK selector logs (SDK events + backend calls)
export const apiLogContent = $("#api-log-content"); // API selector logs (backend calls only)
export const clearSdkLogBtn = $("#clear-sdk-log-btn");
export const clearApiLogBtn = $("#clear-api-log-btn");

// Status badges
export const authModeBadge = $("#auth-mode-badge");

// Auth mode toggle
export const authModeToggle = $("#auth-mode-toggle");
export const authModeSubPartner = $("#auth-mode-sub-partner");
export const authModeAcquiringPartner = $("#auth-mode-acquiring-partner");

// Advanced flows
export const advancedFlowSel = $("#advanced-flow");
export const customerTokenStatus = $("#customer-token-status");
export const customerTokenPill = $("#customer-token-pill");

// Export the query selector helper
export { $ };