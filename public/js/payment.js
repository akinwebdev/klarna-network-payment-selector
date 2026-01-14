/**
 * Payment authorization and request building for the Klarna Payment Selector Demo
 */

import { API_BASE, COUNTRY_MAPPING } from "./constants.js";
import { currentAuthMode, interoperabilityToken } from "./state.js";
import {
  amountInput,
  countrySel,
  subscriptionBillingIntervalFrequencyInput,
  subscriptionBillingIntervalSel,
} from "./dom.js";
import {
  generateReference,
  generateUUID,
  getCurrentCountry,
  getSelectedIntents,
} from "./utils.js";
import {
  hasCustomerTokenForCurrentCountry,
  isInteroperabilityFlow,
  isTokenizedPaymentsFlow,
} from "./config.js";
import { logBackendCall, logBackendError } from "./logging.js";

// ============================================================================
// PAYMENT REQUEST DATA BUILDING
// ============================================================================

export function buildPaymentRequestData(paymentOptionId) {
  const country = countrySel.value;
  const currency = COUNTRY_MAPPING[country].currency;
  const amountValue = parseInt(amountInput.value, 10);
  const amount = isNaN(amountValue) ? 2000 : amountValue;
  const intents = getSelectedIntents();

  const isOnlyPay = intents && intents.length === 1 && intents[0] === "PAY";
  const isOnlyDonate = intents && intents.length === 1 &&
    intents[0] === "DONATE";
  const isOnlyAddToWallet = intents && intents.length === 1 &&
    intents[0] === "ADD_TO_WALLET";
  const isOnlySignIn = intents && intents.length === 1 &&
    intents[0] === "SIGNIN";
  const isOnlySignUp = intents && intents.length === 1 &&
    intents[0] === "SIGNUP";
  const isPayPlusAddToWallet = intents && intents.length === 2 &&
    intents.includes("PAY") && intents.includes("ADD_TO_WALLET");
  const isOnlySubscribe = intents && intents.length === 1 &&
    intents[0] === "SUBSCRIBE";
  const isPayPlusSubscribe = intents && intents.length === 2 &&
    intents.includes("PAY") && intents.includes("SUBSCRIBE");

  const paymentRequestData = {
    currency,
    paymentOptionId,
    paymentRequestReference: generateReference("pay_req_ref_WebSDK_"),
    intents: intents || undefined,
  };

  const subscriptionInterval = subscriptionBillingIntervalSel.value || "MONTH";
  const subscriptionFrequency =
    parseInt(subscriptionBillingIntervalFrequencyInput.value, 10) || 1;

  const subscriptionStartDate = new Date();
  subscriptionStartDate.setDate(subscriptionStartDate.getDate() + 1);
  const subscriptionStartDateStr =
    subscriptionStartDate.toISOString().split("T")[0];

  if (isOnlyAddToWallet) {
    paymentRequestData.supplementaryPurchaseData = {
      purchaseReference: generateReference("purchase_ref_WebSDK_"),
      ondemandService: {
        averageAmount: 2000,
        minimumAmount: 2000,
        maximumAmount: 6000,
        purchaseInterval: "MONTH",
        purchaseInterval_frequency: 1,
      },
    };
  } else if (isPayPlusAddToWallet) {
    paymentRequestData.supplementaryPurchaseData = {
      purchaseReference: generateReference("purchase_ref_WebSDK_"),
      lineItems: [{
        name: "Taxi ride",
        quantity: 1,
        totalAmount: amount,
        unitPrice: amount,
      }],
      ondemandService: {
        averageAmount: 2000,
        minimumAmount: 2000,
        maximumAmount: 6000,
        purchaseInterval: "MONTH",
        purchaseInterval_frequency: 1,
      },
    };
  } else if (isOnlySubscribe) {
    paymentRequestData.supplementaryPurchaseData = {
      purchaseReference: generateReference("purchase_ref_WebSDK_"),
      lineItems: [{
        name: "Game Pass",
        quantity: 1,
        totalAmount: amount,
        unitPrice: amount,
        subscriptionReference: "GAME_PASS_USER_XYZ",
      }],
      subscriptions: [{
        subscriptionReference: "GAME_PASS_USER_XYZ",
        name: "Game Pass",
        freeTrial: "INACTIVE",
        billingPlans: [{
          billingAmount: amount,
          currency,
          from: subscriptionStartDateStr,
          interval: subscriptionInterval,
          intervalFrequency: subscriptionFrequency,
        }],
      }],
    };
  } else if (isPayPlusSubscribe) {
    const goodsAmount = Math.floor(amount * 0.85);
    const subscriptionAmount = amount - goodsAmount;
    paymentRequestData.supplementaryPurchaseData = {
      purchaseReference: generateReference("purchase_ref_WebSDK_"),
      lineItems: [
        {
          name: "Video Game Console",
          quantity: 1,
          totalAmount: goodsAmount,
          unitPrice: goodsAmount,
          lineItemReference: "AWESOME_CONSOLE",
        },
        {
          name: "Game Pass",
          quantity: 1,
          totalAmount: subscriptionAmount,
          unitPrice: subscriptionAmount,
          subscriptionReference: "GAME_PASS_USER_XYZ",
        },
      ],
      subscriptions: [{
        subscriptionReference: "GAME_PASS_USER_XYZ",
        name: "Game Pass",
        freeTrial: "INACTIVE",
        billingPlans: [{
          billingAmount: subscriptionAmount,
          currency,
          from: subscriptionStartDateStr,
          interval: subscriptionInterval,
          intervalFrequency: subscriptionFrequency,
        }],
      }],
    };
    paymentRequestData.amount = amount;
  } else if (isOnlyPay || isOnlyDonate) {
    paymentRequestData.supplementaryPurchaseData = {
      purchaseReference: generateReference("purchase_ref_WebSDK_"),
      lineItems: [{
        name: "Test Item",
        quantity: 1,
        totalAmount: amount,
        unitPrice: amount,
      }],
    };
  } else {
    paymentRequestData.supplementaryPurchaseData = {
      purchaseReference: generateReference("purchase_ref_WebSDK_"),
    };
  }

  if (
    !isOnlyAddToWallet && !isOnlySignIn && !isOnlySignUp && !isPayPlusSubscribe
  ) {
    paymentRequestData.amount = amount;
  }

  if (isOnlyAddToWallet || isPayPlusAddToWallet) {
    paymentRequestData.requestCustomerToken = {
      scopes: ["payment:customer_present"],
      customerTokenReference: `customer_token_${generateUUID()}`,
    };
  }

  if (isOnlySubscribe || isPayPlusSubscribe) {
    paymentRequestData.requestCustomerToken = {
      scopes: ["payment:customer_not_present"],
      customerTokenReference: `customer_token_${generateUUID()}`,
    };
  }

  return paymentRequestData;
}

// ============================================================================
// SDK PAYMENT INITIATION
// ============================================================================

export async function initiateKlarnaPayment(
  klarnaNetworkSessionToken,
  paymentOptionId,
) {
  try {
    const paymentRequestData = buildPaymentRequestData(paymentOptionId);
    const country = getCurrentCountry();
    const useCustomerToken = isTokenizedPaymentsFlow() &&
      hasCustomerTokenForCurrentCountry();

    const requestBody = {
      klarnaNetworkSessionToken,
      paymentOptionId,
      paymentRequestData,
      returnUrl: `${API_BASE}/payment-complete`,
      appReturnUrl: null,
      // Include customer token for tokenized payments flow (if country has token)
      includeCustomerToken: useCustomerToken,
      country: useCustomerToken ? country : undefined,
      // Include auth mode for server-side credential selection
      authMode: currentAuthMode,
    };

    // Use different endpoint based on auth mode:
    // SUB_PARTNER: POST /api/payment-request (creates payment request, returns payment_request_id for SDK)
    // ACQUIRING_PARTNER: POST /api/authorize-payment (may return STEP_UP_REQUIRED or APPROVED)
    const endpoint = currentAuthMode === "SUB_PARTNER"
      ? "/api/payment-request"
      : "/api/authorize-payment";

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const res = await response.json();

    // Log request and response to SDK panel
    const endpointName = currentAuthMode === "SUB_PARTNER"
      ? "payment/requests"
      : "payment/authorize";
    if (res._request && res._response) {
      logBackendCall(
        res._request,
        res._response,
        res.status,
        endpointName,
        "sdk",
      );
    }

    if (!response.ok) {
      throw new Error(res.message || "Payment request failed");
    }

    // Handle response based on the endpoint used
    if (currentAuthMode === "SUB_PARTNER") {
      // Payment Request API response
      switch (res.status) {
        case "CREATED":
          // Return paymentRequestId to SDK to trigger the purchase flow
          return { paymentRequestId: res.paymentRequestId };
        case "COMPLETED":
          // Tokenized payments - payment completed directly without customer interaction
          // Store the request/response for display on payment-complete page
          if (res._request && res._response) {
            sessionStorage.setItem(
              "approvedPaymentLog",
              JSON.stringify({
                request: res._request,
                response: res._response,
                status: res.status,
                endpoint: "payment/requests",
                timestamp: new Date().toLocaleTimeString(),
              }),
            );
          }
          // Return returnUrl so SDK callback can handle redirect
          return { returnUrl: res.successUrl };
        case "ERROR":
          throw new Error(res.message || "Payment request error");
        default:
          throw new Error(`Unexpected payment request status: ${res.status}`);
      }
    } else {
      // Payment Authorize API response - handle step-up or direct approval
      switch (res.status) {
        case "STEP_UP_REQUIRED":
          return { paymentRequestId: res.paymentRequestId };
        case "APPROVED":
          // Store the request/response for display on payment-complete page
          if (res._request && res._response) {
            sessionStorage.setItem(
              "approvedPaymentLog",
              JSON.stringify({
                request: res._request,
                response: res._response,
                status: res.status,
                endpoint: "payment/authorize",
                timestamp: new Date().toLocaleTimeString(),
              }),
            );
          }
          return { returnUrl: res.successUrl };
        case "DECLINED":
          alert(
            res.message ||
              "Your payment was declined. Please try another method or contact support.",
          );
          return null;
        case "ERROR":
          throw new Error(res.message || "Payment authorization error");
        default:
          throw new Error(`Unexpected payment status: ${res.status}`);
      }
    }
  } catch (error) {
    console.error("Payment error:", error);
    logBackendError(error.message, "sdk");
    alert("There was an error processing the payment. Please try again.");
    return null;
  }
}

// ============================================================================
// API PAYMENT INITIATION
// ============================================================================

export async function initiateApiKlarnaPayment(paymentOptionId) {
  try {
    const paymentRequestData = buildPaymentRequestData(paymentOptionId);
    const country = getCurrentCountry();
    const useCustomerToken = isTokenizedPaymentsFlow() &&
      hasCustomerTokenForCurrentCountry();
    const useInteroperability = isInteroperabilityFlow() &&
      interoperabilityToken;

    const requestBody = {
      paymentOptionId,
      paymentRequestData,
      returnUrl: `${API_BASE}/payment-complete`,
      appReturnUrl: null,
      // Include customer token for tokenized payments flow (if country has token)
      includeCustomerToken: useCustomerToken,
      country: useCustomerToken ? country : undefined,
      // Include interoperability token for interoperability flows
      interoperabilityToken: useInteroperability
        ? interoperabilityToken
        : undefined,
      // Include auth mode for server-side credential selection
      authMode: currentAuthMode,
    };

    // Use different endpoint based on auth mode:
    // SUB_PARTNER: POST /api/payment-request (creates payment request, returns URL for redirect)
    // ACQUIRING_PARTNER: POST /api/authorize-payment (may return STEP_UP_REQUIRED or APPROVED)
    const endpoint = currentAuthMode === "SUB_PARTNER"
      ? "/api/payment-request"
      : "/api/authorize-payment";

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const res = await response.json();

    // Log request and response to API panel
    const endpointName = currentAuthMode === "SUB_PARTNER"
      ? "payment/requests"
      : "payment/authorize";
    if (res._request && res._response) {
      logBackendCall(
        res._request,
        res._response,
        res.status,
        endpointName,
        "api",
      );
    }

    if (!response.ok) {
      throw new Error(res.message || "Payment request failed");
    }

    // Handle response based on the endpoint used
    if (currentAuthMode === "SUB_PARTNER") {
      // Payment Request API response
      switch (res.status) {
        case "CREATED":
          // Standard flow - redirect to payment_request_url for customer interaction
          if (res.paymentRequestUrl) {
            window.location.href = res.paymentRequestUrl;
          } else {
            alert("Payment request created but no redirect URL available");
          }
          break;
        case "COMPLETED":
          // Tokenized payments - payment completed directly without customer interaction
          // Store the request/response for display on payment-complete page
          if (res._request && res._response) {
            sessionStorage.setItem(
              "approvedPaymentLog",
              JSON.stringify({
                request: res._request,
                response: res._response,
                status: res.status,
                endpoint: "payment/requests",
                timestamp: new Date().toLocaleTimeString(),
              }),
            );
          }
          window.location.href = res.successUrl || "/payment-complete";
          break;
        case "ERROR":
          throw new Error(res.message || "Payment request error");
        default:
          throw new Error(`Unexpected payment request status: ${res.status}`);
      }
    } else {
      // Payment Authorize API response - handle step-up or direct approval
      switch (res.status) {
        case "STEP_UP_REQUIRED":
          // For API-based flow, redirect to the payment request URL
          if (res.paymentRequestUrl) {
            window.location.href = res.paymentRequestUrl;
          } else {
            alert("Step-up required but no redirect URL available");
          }
          break;
        case "APPROVED":
          // Store the request/response for display on payment-complete page
          if (res._request && res._response) {
            sessionStorage.setItem(
              "approvedPaymentLog",
              JSON.stringify({
                request: res._request,
                response: res._response,
                status: res.status,
                endpoint: "payment/authorize",
                timestamp: new Date().toLocaleTimeString(),
              }),
            );
          }
          window.location.href = res.successUrl || "/payment-complete";
          break;
        case "DECLINED":
          alert(
            res.message ||
              "Your payment was declined. Please try another method.",
          );
          break;
        case "ERROR":
          throw new Error(res.message || "Payment authorization error");
        default:
          throw new Error(`Unexpected payment status: ${res.status}`);
      }
    }
  } catch (error) {
    console.error("API Payment error:", error);
    alert("There was an error processing the payment. Please try again.");
  }
}