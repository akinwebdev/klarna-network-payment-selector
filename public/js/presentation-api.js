/**
 * API-based payment presentation for the Klarna Payment Selector Demo
 */

import { API_BASE, COUNTRY_MAPPING } from "./constants.js";
import {
  currentApiPresentation,
  currentAuthMode,
  interoperabilityToken,
  setCurrentApiPresentation,
} from "./state.js";
import {
  $,
  amountInput,
  apiLoadingButton,
  apiLoadingPlaceholder,
  apiMsg1,
  apiMsg2,
  apiOptCard,
  apiOptKlarna,
  apiOptKlarnaSaved,
  apiPaymentOptionIdEl,
  apiPresentationInstructionEl,
  countrySel,
  localeSel,
  subscriptionBillingIntervalFrequencyInput,
  subscriptionBillingIntervalSel,
} from "./dom.js";
import { getSelectedIntents } from "./utils.js";
import {
  hasCustomerTokenForCurrentCountry,
  isInteroperabilityFlow,
  isTokenizedPaymentsFlow,
} from "./config.js";
import { initiateApiKlarnaPayment } from "./payment.js";
import { logBackendCall } from "./logging.js";
import { hideElement, showElement } from "./ui.js";

// ============================================================================
// LOADING STATE
// ============================================================================

export function showApiLoading() {
  if (apiLoadingPlaceholder) apiLoadingPlaceholder.classList.remove("hidden");
  if (apiLoadingButton) apiLoadingButton.style.display = "block";
  hideElement(apiOptKlarna);
  hideElement(apiOptKlarnaSaved);
  $("#api-action-button").innerHTML = "";
}

export function hideApiLoading() {
  if (apiLoadingPlaceholder) apiLoadingPlaceholder.classList.add("hidden");
  if (apiLoadingButton) apiLoadingButton.style.display = "none";
}

// ============================================================================
// API PRESENTATION FETCHING
// ============================================================================

async function fetchApiPresentation() {
  try {
    const country = countrySel.value;
    const locale = localeSel.value;
    const currency = COUNTRY_MAPPING[country].currency;
    const amountValue = parseInt(amountInput.value, 10);
    const amount = isNaN(amountValue) ? 2000 : amountValue;
    const intents = getSelectedIntents();

    const isOnlyAddToWallet = intents && intents.length === 1 &&
      intents[0] === "ADD_TO_WALLET";

    // For interoperability flows, verify the shared interoperability token is available
    // Note: The token is fetched once in renderBothPresentations() and reused by both selectors
    if (
      isInteroperabilityFlow() && hasCustomerTokenForCurrentCountry() &&
      !interoperabilityToken
    ) {
      console.error(
        "Interoperability token not available for API presentation",
      );
      return null;
    }

    // Build query parameters for GET request
    const queryParams = new URLSearchParams();
    queryParams.append("currency", currency);
    queryParams.append("locale", locale);

    if (!isOnlyAddToWallet) {
      queryParams.append("amount", amount.toString());
    }

    if (intents && intents.length > 0) {
      queryParams.append("intents", intents.join(","));
    }

    const hasSubscribe = intents && intents.includes("SUBSCRIBE");
    if (hasSubscribe) {
      const subscriptionInterval = subscriptionBillingIntervalSel.value;
      const subscriptionFrequency = parseInt(
        subscriptionBillingIntervalFrequencyInput.value,
        10,
      );
      if (subscriptionInterval) {
        queryParams.append(
          "subscription_billing_interval",
          subscriptionInterval,
        );
      }
      if (!isNaN(subscriptionFrequency) && subscriptionFrequency > 0) {
        queryParams.append(
          "subscription_billing_interval_frequency",
          subscriptionFrequency.toString(),
        );
      }
    }

    // Include customer token for tokenized payments flow (if country has token)
    if (isTokenizedPaymentsFlow() && hasCustomerTokenForCurrentCountry()) {
      queryParams.append("include_customer_token", "true");
      queryParams.append("country", country);
    }

    // Include interoperability token for interoperability flows
    if (isInteroperabilityFlow() && interoperabilityToken) {
      queryParams.append("interoperability_token", interoperabilityToken);
    }

    // Include auth mode
    if (currentAuthMode) {
      queryParams.append("auth_mode", currentAuthMode);
    }

    const response = await fetch(
      `${API_BASE}/api/presentation?${queryParams.toString()}`,
    );

    const res = await response.json();

    // Log to API panel
    if (res._request && res._response) {
      logBackendCall(
        res._request,
        res._response,
        res.status,
        "payment/presentation",
        "api",
      );
    }

    if (!response.ok || res.status === "ERROR") {
      throw new Error(res.message || "Presentation API failed");
    }

    return res.presentation;
  } catch (error) {
    console.error("API Presentation error:", error);
    return null;
  }
}

// ============================================================================
// PRESENTATION RENDERING
// ============================================================================

function clearApiPresentationTargets() {
  $("#api-opt1-header").textContent = "";
  $("#api-opt1-subheader").textContent = "";
  $("#api-opt1-message").innerHTML = "";
  $("#api-opt1-icon").src = "";
  $("#api-opt2-header").textContent = "";
  $("#api-opt2-subheader").textContent = "";
  $("#api-opt2-message").innerHTML = "";
  $("#api-opt2-badge").textContent = "";
  $("#api-opt2-icon").src = "";
  $("#api-action-button").innerHTML = "";
}

export async function renderApiPresentation() {
  // Show loading state
  showApiLoading();

  try {
    // Clear previous content
    clearApiPresentationTargets();

    const presentation = await fetchApiPresentation();

    // Hide loading state
    hideApiLoading();

    if (!presentation) {
      hideElement(apiOptKlarna);
      hideElement(apiOptKlarnaSaved);
      showElement(apiOptCard);
      apiPresentationInstructionEl.textContent = "—";
      setApiSelected("CARD");
      return;
    }

    setCurrentApiPresentation(presentation);
    const instruction = presentation.instruction || "SHOW_KLARNA";
    apiPresentationInstructionEl.textContent = instruction;

    // Render Klarna payment option
    if (presentation.payment_option) {
      showElement(apiOptKlarna);
      renderApiPaymentOption(presentation.payment_option, "api-opt1");
    } else {
      hideElement(apiOptKlarna);
    }

    // Render saved payment option if available
    const hasSavedOption =
      presentation.saved_payment_option?.payment_option_id !== undefined;
    if (hasSavedOption) {
      showElement(apiOptKlarnaSaved);
      renderApiSavedPaymentOption(
        presentation.saved_payment_option,
        "api-opt2",
      );
    } else {
      hideElement(apiOptKlarnaSaved);
    }

    // Handle presentation instruction
    // SHOW_ONLY_KLARNA: Only show Klarna option
    // SHOW_KLARNA (default): Show both Card and Klarna
    // PRESELECT_KLARNA: Show both but preselect Klarna
    if (instruction === "SHOW_ONLY_KLARNA") {
      hideElement(apiOptCard);
      hideElement(apiOptKlarnaSaved);
      showElement(apiOptKlarna);
      setApiSelected("KLARNA");
    } else {
      // Default behavior (SHOW_KLARNA) or PRESELECT_KLARNA: show both Card and Klarna
      showElement(apiOptCard);

      // Ensure Klarna option is visible if payment_option exists
      if (presentation.payment_option) {
        showElement(apiOptKlarna);
      }

      if (hasSavedOption && instruction === "PRESELECT_KLARNA") {
        reorderApiPaymentOptions("KLARNA_SAVED_FIRST");
      } else {
        reorderApiPaymentOptions("DEFAULT");
      }

      let defaultSelection = "CARD";
      if (instruction === "PRESELECT_KLARNA") {
        defaultSelection = hasSavedOption ? "KLARNA_SAVED" : "KLARNA";
      }

      setApiSelected(defaultSelection);
    }

    setupApiSelectionHandlers();
  } catch (error) {
    console.error("Failed to load API payment presentation:", error);
    hideApiLoading();
    hideElement(apiOptKlarna);
    hideElement(apiOptKlarnaSaved);
    showElement(apiOptCard);
    apiPresentationInstructionEl.textContent = "—";
    setApiSelected("CARD");
  }
}

// ============================================================================
// MESSAGE RENDERING
// ============================================================================

/**
 * Open a URL in a new window with responsive sizing
 * - Narrow screens (up to 640px): fullscreen (100% width/height)
 * - Wider screens: 600x800 centered popup
 */
function openMessageLink(url) {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  let windowFeatures;
  if (screenWidth <= 640) {
    // Mobile/narrow: fullscreen
    windowFeatures = `width=${screenWidth},height=${screenHeight},left=0,top=0`;
  } else {
    // Desktop: centered 600x800 popup
    const width = 600;
    const height = 800;
    const left = Math.max(0, (screenWidth - width) / 2 + window.screenX);
    const top = Math.max(0, (screenHeight - height) / 2 + window.screenY);
    windowFeatures =
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`;
  }

  window.open(url, "_blank", windowFeatures);
}

// Expose to global scope for inline onclick handlers
window.openMessageLink = openMessageLink;

/**
 * Render message parts from API response
 * Handles TEXT and LINK parts with proper link behavior based on context:
 * - INFO: Can be opened in new window (informational content)
 * - AUTH: Must be opened in new window (requires authentication)
 */
function renderMessageParts(message) {
  if (!message) return "";

  // If message has parts array, render each part wrapped in a <p> tag
  if (message.parts && Array.isArray(message.parts)) {
    const content = message.parts.map((part) => {
      if (part.type === "TEXT") {
        // Escape HTML in text content
        const escapedText = part.text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return escapedText;
      } else if (part.type === "LINK") {
        // Create link that opens in a new window via onclick
        const escapedText = part.text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        // Escape URL for use in JavaScript string
        const jsEscapedUrl = part.url
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "\\'");
        return `<a href="${part.url}" role="button" tabindex="0" onclick="event.preventDefault(); openMessageLink('${jsEscapedUrl}');" class="api-message-link">${escapedText}</a>`;
      }
      return "";
    }).join("");
    return `<p>${content}</p>`;
  }

  // Fallback to simple text if no parts
  if (message.text) {
    return message.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  return "";
}

// ============================================================================
// PAYMENT OPTION RENDERING
// ============================================================================

function renderApiPaymentOption(option, prefix) {
  $(`#${prefix}-header`).textContent = option.header?.text || "";
  $(`#${prefix}-subheader`).textContent = option.subheader?.text || "";

  // Render message with parts (TEXT + LINK support)
  $(`#${prefix}-message`).innerHTML = renderMessageParts(option.message);

  // Use badge_image_url for the icon displayed next to header/subheader
  if (option.icon?.badge_image_url) {
    $(`#${prefix}-icon`).src = option.icon.badge_image_url;
    $(`#${prefix}-icon`).style.display = "block";
  } else {
    $(`#${prefix}-icon`).style.display = "none";
  }
}

function renderApiSavedPaymentOption(option, prefix) {
  $(`#${prefix}-header`).textContent = option.header?.text || "";
  $(`#${prefix}-subheader`).textContent = option.subheader?.text || "";

  // Render message with parts (TEXT + LINK support)
  $(`#${prefix}-message`).innerHTML = renderMessageParts(option.message);
  $(`#${prefix}-badge`).textContent = option.badge?.text || "";

  // Use badge_image_url for the icon displayed next to header/subheader
  if (option.icon?.badge_image_url) {
    $(`#${prefix}-icon`).src = option.icon.badge_image_url;
    $(`#${prefix}-icon`).style.display = "block";
  } else {
    $(`#${prefix}-icon`).style.display = "none";
  }
}

// ============================================================================
// PAYMENT OPTION ORDERING
// ============================================================================

function reorderApiPaymentOptions(order) {
  const selectorDiv = apiOptCard.parentElement;
  const actionButton = $("#api-action-button");
  const title = selectorDiv.querySelector("h3");

  if (order === "KLARNA_SAVED_FIRST") {
    if (title) selectorDiv.insertBefore(title, selectorDiv.firstChild);
    selectorDiv.insertBefore(
      apiOptKlarnaSaved,
      title ? title.nextSibling : selectorDiv.firstChild,
    );
    selectorDiv.insertBefore(apiOptKlarna, apiOptKlarnaSaved.nextSibling);
    selectorDiv.insertBefore(apiOptCard, apiOptKlarna.nextSibling);
    selectorDiv.appendChild(actionButton);
  } else {
    if (title) selectorDiv.insertBefore(title, selectorDiv.firstChild);
    selectorDiv.insertBefore(
      apiOptCard,
      title ? title.nextSibling : selectorDiv.firstChild,
    );
    selectorDiv.insertBefore(apiOptKlarna, apiOptCard.nextSibling);
    selectorDiv.insertBefore(apiOptKlarnaSaved, apiOptKlarna.nextSibling);
    selectorDiv.appendChild(actionButton);
  }
}

// ============================================================================
// SELECTION HANDLING
// ============================================================================

export function setupApiSelectionHandlers() {
  apiOptCard.onclick = () => setApiSelected("CARD");
  apiOptKlarna.onclick = () => setApiSelected("KLARNA");
  apiOptKlarnaSaved.onclick = () => setApiSelected("KLARNA_SAVED");
}

export function setApiSelected(which) {
  const isCard = which === "CARD";
  const isKlarna = which === "KLARNA";
  const isKlarnaSaved = which === "KLARNA_SAVED";

  apiOptCard.classList.toggle("selected", isCard);
  apiOptKlarna.classList.toggle("selected", isKlarna);
  apiOptKlarnaSaved.classList.toggle("selected", isKlarnaSaved);

  apiMsg1.style.display = isKlarna ? "block" : "none";
  apiMsg2.style.display = isKlarnaSaved ? "block" : "none";

  // Update the payment option ID display
  if (isCard) {
    apiPaymentOptionIdEl.textContent = "—";
  } else if (isKlarna) {
    apiPaymentOptionIdEl.textContent =
      currentApiPresentation?.payment_option?.payment_option_id || "—";
  } else if (isKlarnaSaved) {
    apiPaymentOptionIdEl.textContent =
      currentApiPresentation?.saved_payment_option?.payment_option_id || "—";
  }

  renderApiPaymentButton(which);
}

// ============================================================================
// PAYMENT BUTTON RENDERING
// ============================================================================

function renderApiPaymentButton(which) {
  const container = $("#api-action-button");
  container.innerHTML = "";

  if (which === "CARD") {
    const button = document.createElement("button");
    button.className = "api-payment-button";
    button.textContent = "Pay";
    button.onclick = () => alert("Payment processing with card...");
    container.appendChild(button);
  } else {
    // Get the payment button data from the presentation
    const buttonData = (which === "KLARNA_SAVED")
      ? currentApiPresentation?.saved_payment_option?.payment_button
      : currentApiPresentation?.payment_option?.payment_button;

    const paymentOptionId = (which === "KLARNA_SAVED")
      ? currentApiPresentation?.saved_payment_option?.payment_option_id
      : currentApiPresentation?.payment_option?.payment_option_id;

    if (buttonData) {
      // Create Klarna-styled button using official CSS classes
      const button = document.createElement("button");
      button.style.width = "100%";
      button.className = "klarna-sdk-button theme-dark shape-default";

      // Create outline div
      const outlineDiv = document.createElement("div");
      outlineDiv.className = "klarna-sdk-button__outline";
      outlineDiv.setAttribute("aria-hidden", "true");
      button.appendChild(outlineDiv);

      // Create inner container
      const innerContainer = document.createElement("div");
      innerContainer.className = "klarna-sdk-button__inner-container";

      // Create text span with badge
      const textSpan = document.createElement("span");
      textSpan.className = "klarna-sdk-button__text";

      // Add text content
      if (buttonData.text) {
        textSpan.textContent = buttonData.text + " ";
      }

      // Add badge image if available
      if (buttonData.image_url) {
        const img = document.createElement("img");
        img.src = buttonData.image_url;
        img.alt = "";
        img.className = "klarna-sdk-button__badge";
        textSpan.appendChild(img);
      }

      innerContainer.appendChild(textSpan);

      // Create spinner span
      const spinnerSpan = document.createElement("span");
      spinnerSpan.className = "klarna-sdk-button__spinner";
      spinnerSpan.setAttribute("aria-hidden", "true");
      innerContainer.appendChild(spinnerSpan);

      button.appendChild(innerContainer);

      // Add click handler to initiate payment
      button.onclick = () => initiateApiKlarnaPayment(paymentOptionId);
      container.appendChild(button);
    } else {
      // Fallback button if no button data - still use Klarna styling
      const button = document.createElement("button");
      button.style.width = "100%";
      button.className = "klarna-sdk-button theme-dark shape-default";

      const outlineDiv = document.createElement("div");
      outlineDiv.className = "klarna-sdk-button__outline";
      outlineDiv.setAttribute("aria-hidden", "true");
      button.appendChild(outlineDiv);

      const innerContainer = document.createElement("div");
      innerContainer.className = "klarna-sdk-button__inner-container";

      const textSpan = document.createElement("span");
      textSpan.className = "klarna-sdk-button__text";
      textSpan.textContent = "Pay with Klarna";
      innerContainer.appendChild(textSpan);

      const spinnerSpan = document.createElement("span");
      spinnerSpan.className = "klarna-sdk-button__spinner";
      spinnerSpan.setAttribute("aria-hidden", "true");
      innerContainer.appendChild(spinnerSpan);

      button.appendChild(innerContainer);

      button.onclick = () => initiateApiKlarnaPayment(paymentOptionId);
      container.appendChild(button);
    }
  }
}