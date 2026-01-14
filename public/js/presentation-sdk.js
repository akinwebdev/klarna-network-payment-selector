/**
 * SDK-based payment presentation for the Klarna Payment Selector Demo
 */

import { COUNTRY_MAPPING } from "./constants.js";
import { currentPresentation, setCurrentPresentation } from "./state.js";
import {
  $,
  amountInput,
  countrySel,
  localeSel,
  msg1,
  msg2,
  optCard,
  optKlarna,
  optKlarnaSaved,
  sdkLoadingButton,
  sdkLoadingPlaceholder,
  sdkPaymentOptionIdEl,
  sdkPresentationInstructionEl,
  subscriptionBillingIntervalFrequencyInput,
  subscriptionBillingIntervalSel,
} from "./dom.js";
import { getSelectedIntents } from "./utils.js";
import { ensureSDK } from "./sdk.js";
import { initiateKlarnaPayment } from "./payment.js";
import { logSdkEvent } from "./logging.js";
import { hideElement, showElement } from "./ui.js";

// ============================================================================
// LOADING STATE
// ============================================================================

export function showSdkLoading() {
  if (sdkLoadingPlaceholder) sdkLoadingPlaceholder.classList.remove("hidden");
  if (sdkLoadingButton) sdkLoadingButton.style.display = "block";
  hideElement(optKlarna);
  hideElement(optKlarnaSaved);
  $("#action-button").innerHTML = "";
}

export function hideSdkLoading() {
  if (sdkLoadingPlaceholder) sdkLoadingPlaceholder.classList.add("hidden");
  if (sdkLoadingButton) sdkLoadingButton.style.display = "none";
}

// ============================================================================
// PRESENTATION RENDERING
// ============================================================================

function clearPresentationTargets() {
  [
    "#opt1-header",
    "#opt1-subheader",
    "#opt1-message",
    "#opt1-icon",
    "#opt2-header",
    "#opt2-subheader",
    "#opt2-message",
    "#opt2-badge",
    "#opt2-icon",
  ].forEach((sel) => {
    const el = $(sel);
    if (el) el.innerHTML = "";
  });
}

export async function renderPresentation() {
  // Show loading state
  showSdkLoading();

  try {
    clearPresentationTargets();
    const sdk = await ensureSDK();
    const country = countrySel.value;
    const locale = localeSel.value;
    const currency = COUNTRY_MAPPING[country].currency;
    const amountValue = parseInt(amountInput.value, 10);
    const amount = isNaN(amountValue) ? 2000 : amountValue;
    const intents = getSelectedIntents();

    const isOnlyAddToWallet = intents && intents.length === 1 &&
      intents[0] === "ADD_TO_WALLET";

    const presentationConfig = { currency, locale };
    if (!isOnlyAddToWallet) presentationConfig.amount = amount;
    if (intents) presentationConfig.intents = intents;

    const hasSubscribe = intents && intents.includes("SUBSCRIBE");
    if (hasSubscribe) {
      const subscriptionInterval = subscriptionBillingIntervalSel.value;
      const subscriptionFrequency = parseInt(
        subscriptionBillingIntervalFrequencyInput.value,
        10,
      );
      if (subscriptionInterval) {
        presentationConfig.subscriptionBillingInterval = subscriptionInterval;
      }
      if (!isNaN(subscriptionFrequency) && subscriptionFrequency > 0) {
        presentationConfig.subscriptionBillingIntervalFrequency =
          subscriptionFrequency;
      }
    }

    const presentation = await sdk.Payment.presentation(presentationConfig);
    setCurrentPresentation(presentation);
    console.log(presentation);

    // Log presentation to SDK logs panel (extract serializable data)
    logSdkEvent("SDK Presentation", {
      instruction: presentation.instruction,
      paymentOption: {
        paymentOptionId: presentation.paymentOption?.paymentOptionId,
      },
      savedPaymentOption: presentation.savedPaymentOption?.paymentOptionId
        ? {
          paymentOptionId: presentation.savedPaymentOption.paymentOptionId,
        }
        : null,
    });

    // Hide loading and show content
    hideSdkLoading();

    showElement(optKlarna);
    presentation.paymentOption.header.component().mount("#opt1-header");
    presentation.paymentOption.subheader.component().mount("#opt1-subheader");
    presentation.paymentOption.icon.component().mount("#opt1-icon");
    presentation.paymentOption.message.component().mount("#opt1-message");

    const hasSavedOption =
      presentation.savedPaymentOption?.paymentOptionId !== undefined;
    if (hasSavedOption) {
      showElement(optKlarnaSaved);
      presentation.savedPaymentOption.header.component().mount("#opt2-header");
      presentation.savedPaymentOption.subheader.component().mount(
        "#opt2-subheader",
      );
      presentation.savedPaymentOption.badge.component().mount("#opt2-badge");
      presentation.savedPaymentOption.icon.component().mount("#opt2-icon");
      presentation.savedPaymentOption.message.component().mount(
        "#opt2-message",
      );
    } else {
      hideElement(optKlarnaSaved);
    }

    setupSelectionHandlers();

    const instruction = presentation.instruction || "—";
    sdkPresentationInstructionEl.textContent = instruction;

    if (instruction === "SHOW_ONLY_KLARNA") {
      hideElement(optCard);
      hideElement(optKlarnaSaved);
      showElement(optKlarna);
      setSelected("KLARNA");
    } else {
      showElement(optCard);

      if (hasSavedOption && instruction === "PRESELECT_KLARNA") {
        reorderPaymentOptions("KLARNA_SAVED_FIRST");
      } else {
        reorderPaymentOptions("DEFAULT");
      }

      let defaultSelection = "CARD";
      if (instruction === "PRESELECT_KLARNA") {
        defaultSelection = hasSavedOption ? "KLARNA_SAVED" : "KLARNA";
      }

      setSelected(defaultSelection);
    }
  } catch (error) {
    console.error("Failed to load Klarna payment presentation:", error);
    hideSdkLoading();
    hideElement(optKlarna);
    hideElement(optKlarnaSaved);
    showElement(optCard);
    sdkPresentationInstructionEl.textContent = "—";
    reorderPaymentOptions("DEFAULT");
    setSelected("CARD");
  }
}

// ============================================================================
// PAYMENT OPTION ORDERING
// ============================================================================

function reorderPaymentOptions(order) {
  const selectorDiv = optCard.parentElement;
  const actionButton = $("#action-button");
  const title = selectorDiv.querySelector("h3");

  if (order === "KLARNA_SAVED_FIRST") {
    if (title) selectorDiv.insertBefore(title, selectorDiv.firstChild);
    selectorDiv.insertBefore(
      optKlarnaSaved,
      title ? title.nextSibling : selectorDiv.firstChild,
    );
    selectorDiv.insertBefore(optKlarna, optKlarnaSaved.nextSibling);
    selectorDiv.insertBefore(optCard, optKlarna.nextSibling);
    selectorDiv.appendChild(actionButton);
  } else {
    if (title) selectorDiv.insertBefore(title, selectorDiv.firstChild);
    selectorDiv.insertBefore(
      optCard,
      title ? title.nextSibling : selectorDiv.firstChild,
    );
    selectorDiv.insertBefore(optKlarna, optCard.nextSibling);
    selectorDiv.insertBefore(optKlarnaSaved, optKlarna.nextSibling);
    selectorDiv.appendChild(actionButton);
  }
}

// ============================================================================
// SELECTION HANDLING
// ============================================================================

export function setupSelectionHandlers() {
  optCard.onclick = () => setSelected("CARD");
  optKlarna.onclick = () => setSelected("KLARNA");
  optKlarnaSaved.onclick = () => setSelected("KLARNA_SAVED");
}

export function setSelected(which) {
  const isCard = which === "CARD";
  const isKlarna = which === "KLARNA";
  const isKlarnaSaved = which === "KLARNA_SAVED";

  optCard.classList.toggle("selected", isCard);
  optKlarna.classList.toggle("selected", isKlarna);
  optKlarnaSaved.classList.toggle("selected", isKlarnaSaved);

  msg1.style.display = isKlarna ? "block" : "none";
  msg2.style.display = isKlarnaSaved ? "block" : "none";

  if (isCard) {
    sdkPaymentOptionIdEl.textContent = "—";
  } else if (isKlarna) {
    sdkPaymentOptionIdEl.textContent =
      currentPresentation.paymentOption.paymentOptionId || "—";
  } else if (isKlarnaSaved) {
    sdkPaymentOptionIdEl.textContent =
      currentPresentation.savedPaymentOption.paymentOptionId || "—";
  }

  renderPaymentButton(which);
}

// ============================================================================
// PAYMENT BUTTON RENDERING
// ============================================================================

function renderPaymentButton(which) {
  const container = $("#action-button");
  container.innerHTML = "";

  if (which === "CARD") {
    const button = document.createElement("button");
    button.textContent = "Pay";
    button.onclick = () => alert("Payment processing with card...");
    container.appendChild(button);
  } else {
    // Get paymentOptionId from the presentation - this is determined by which button the user clicked
    const selectedPaymentOptionId = (which === "KLARNA")
      ? currentPresentation.paymentOption.paymentOptionId
      : currentPresentation.savedPaymentOption.paymentOptionId;

    const buttonComponent = (which === "KLARNA_SAVED")
      ? currentPresentation.savedPaymentOption.paymentButton.component
      : currentPresentation.paymentOption.paymentButton.component;

    // The initiate handler receives an object from the SDK containing:
    // - klarnaNetworkSessionToken: the session token string (optional)
    // - paymentOptionId: the payment option ID
    // We extract just the token and use the selectedPaymentOptionId from the presentation
    buttonComponent({
      shape: "default",
      theme: "default",
      initiationMode: "DEVICE_BEST",
      initiate: (initiateData) => {
        console.log("SDK initiate callback received:", initiateData);
        const token = initiateData?.klarnaNetworkSessionToken || null;
        console.log(
          "Klarna Network Session Token:",
          token ? token : "(not provided)",
        );
        return initiateKlarnaPayment(token, selectedPaymentOptionId);
      },
    }).mount("#action-button");
  }
}