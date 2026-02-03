/**
 * Product Page - Payment Presentation Config
 * 
 * Initializes the payment configuration section on the product page
 */

import { COUNTRY_MAPPING, API_BASE } from "./constants.js";
import { ensureSDK, resetSDKState } from "./sdk.js";
import { loadConfig } from "./config.js";
import { sdkConfig } from "./state.js";
import { logFlow } from "./flow-logger.js";

// Product page specific DOM elements (will be set in initialization)
let productCountrySel;
let productLocaleSel;
let productAmountInput;
let productCurrencyPill;
let productPriceDisplay;
let productPaymentEndpointSel;

// Track current session's payment_request_id to validate tokens are from current session
let currentSessionPaymentRequestId = null;

// Store button instance reference so we can unmount it if needed
let currentButtonInstance = null;

// ============================================================================
// COUNTRY & LOCALE FUNCTIONS
// ============================================================================

function populateProductCountries(defaultCountry = "FI") {
  productCountrySel.innerHTML = "";
  Object.keys(COUNTRY_MAPPING).forEach((cc) => {
    const opt = document.createElement("option");
    opt.value = cc;
    opt.textContent = cc;
    if (cc === defaultCountry) opt.selected = true;
    productCountrySel.appendChild(opt);
  });
  populateProductLocales(productCountrySel.value, "en-FI");
  reflectProductCurrency(productCountrySel.value);
}

function populateProductLocales(countryCode, defaultLocale = null) {
  const { locales } = COUNTRY_MAPPING[countryCode];
  productLocaleSel.innerHTML = "";
  locales.forEach((loc, i) => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    if (defaultLocale && loc === defaultLocale) {
      opt.selected = true;
    } else if (!defaultLocale && i === 0) {
      opt.selected = true;
    }
    productLocaleSel.appendChild(opt);
  });
}

function reflectProductCurrency(countryCode) {
  if (productCurrencyPill) {
    productCurrencyPill.textContent = COUNTRY_MAPPING[countryCode].currency;
  }
  updateProductPriceDisplay();
}

// ============================================================================
// PRICE DISPLAY UPDATE
// ============================================================================

function updateProductPriceDisplay() {
  if (!productPriceDisplay || !productCountrySel || !productAmountInput) {
    return;
  }

  const country = productCountrySel.value;
  const currency = COUNTRY_MAPPING[country]?.currency || "EUR";
  const amount = parseInt(productAmountInput.value, 10) || 0;
  
  // Format the price based on currency
  const formattedPrice = formatPrice(amount, currency);
  productPriceDisplay.textContent = formattedPrice;
}

function formatPrice(amountInMinorUnits, currency) {
  // Convert minor units to major units (e.g., 15900 -> 159.00)
  const majorUnits = amountInMinorUnits / 100;
  
  // Use Intl.NumberFormat for proper currency formatting
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return formatter.format(majorUnits);
}

// ============================================================================
// INTENT MANAGEMENT
// ============================================================================

// Default intent is "PAY" - no UI needed, just return it when needed
export function getProductSelectedIntents() {
  return ["PAY"];
}

// ============================================================================
// PAYMENT REQUEST DATA BUILDING (Product Page)
// ============================================================================

function buildProductPaymentRequestData() {
  const country = productCountrySel.value;
  const currency = COUNTRY_MAPPING[country].currency;
  const amount = parseInt(productAmountInput.value, 10) || 15900;
  const intents = getProductSelectedIntents(); // ["PAY"]

  // Generate unique references to prevent Klarna idempotency conflicts
  // Use high-resolution timestamp + multiple random components for uniqueness
  const timestamp = Date.now();
  const performanceNow = typeof performance !== 'undefined' ? performance.now() : Math.random() * 1000;
  const randomStr1 = Math.random().toString(36).substr(2, 9);
  const randomStr2 = Math.random().toString(36).substr(2, 9);
  const uniqueId = `${timestamp}_${performanceNow}_${randomStr1}_${randomStr2}`;
  
  const paymentRequestData = {
    currency,
    paymentRequestReference: `pay_req_ref_Product_${uniqueId}`,
    intents: intents || undefined,
    amount,
    supplementaryPurchaseData: {
      purchaseReference: `purchase_ref_Product_${uniqueId}`,
      customer: {
        email: sessionCustomerEmail
      },
    },
  };

  console.log("🔄 Generated Klarna payment request data:", {
    paymentRequestReference: paymentRequestData.paymentRequestReference,
    purchaseReference: paymentRequestData.supplementaryPurchaseData.purchaseReference,
    uniqueId
  });

  return paymentRequestData;
}

// ============================================================================
// PAYMENT BUTTON INITIALIZATION
// ============================================================================

// Track current locale to detect changes
let currentSDKLocale = null;

// Store the currency and amount used when initializing the button
// This ensures we use the same values when sending to Paytrail
let buttonInitCurrency = null;
let buttonInitAmount = null;

// Generate a unique customer email for this session (for debugging)
// This will be the same throughout the session but unique per page load
const sessionCustomerEmail = `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@example.com`;
console.log("📧 Generated session customer email:", sessionCustomerEmail);

// Track if complete event listener has been registered to prevent duplicates
let completeEventListenerRegistered = false;
let productPageCompleteHandler = null;
let isProcessingComplete = false; // Guard to prevent duplicate execution

async function initializePaymentButton() {
  try {
    console.log("🔄 initializePaymentButton called");
    console.log("🔄 Current state:", {
      currentSDKLocale,
      completeEventListenerRegistered,
      isProcessingComplete,
      sessionCustomerEmail,
      buttonInitCurrency,
      buttonInitAmount
    });
    
    // Clear any stored payment_request_id from localStorage/sessionStorage to prevent reuse
    // This ensures we always create a fresh payment request
    try {
      const storedPaymentRequestId = sessionStorage.getItem('paymentRequestId') || localStorage.getItem('paymentRequestId');
      if (storedPaymentRequestId) {
        console.log("⚠️ Found stored payment_request_id, clearing it:", storedPaymentRequestId);
        sessionStorage.removeItem('paymentRequestId');
        localStorage.removeItem('paymentRequestId');
      }
    } catch (e) {
      console.warn("Error clearing stored payment_request_id:", e);
    }
    
    // Load config first
    const configLoaded = await loadConfig();
    if (!configLoaded) {
      console.error("Failed to load configuration");
      return;
    }

    // Get locale from settings before initializing SDK
    const locale = productLocaleSel.value; // en-FI
    
    // If locale changed, reset SDK state to force re-initialization with new locale
    if (currentSDKLocale !== null && currentSDKLocale !== locale) {
      console.log(`Locale changed from ${currentSDKLocale} to ${locale}, resetting SDK...`);
      resetSDKState();
      // Reset the complete event listener flag when SDK is reset
      completeEventListenerRegistered = false;
      productPageCompleteHandler = null;
      isProcessingComplete = false;
    }
    currentSDKLocale = locale;
    
    // Set locale in SDK config so it's used during initialization
    if (sdkConfig) {
      sdkConfig.locale = locale;
    }

    // Reset SDK state when returning to page to ensure fresh initialization
    // This prevents Klarna from seeing reused payment requests
    if (completeEventListenerRegistered) {
      console.log("🔄 User returned to page - resetting SDK state for fresh initialization");
      resetSDKState();
      completeEventListenerRegistered = false;
      productPageCompleteHandler = null;
      isProcessingComplete = false;
      currentSessionPaymentRequestId = null; // Clear current session payment request ID
    }
    
    // Initialize SDK (will use locale from sdkConfig)
    const klarnaInstance = await ensureSDK();
    if (!klarnaInstance) {
      console.error("Klarna SDK not available");
      return;
    }
    
    console.log("🔄 SDK instance obtained:", {
      isNewInstance: !completeEventListenerRegistered,
      klarnaInstanceExists: !!klarnaInstance
    });

    // Get pre-selected values
    const country = productCountrySel.value; // FI
    const currency = COUNTRY_MAPPING[country].currency; // EUR
    const amount = parseInt(productAmountInput.value, 10) || 15900;
    const intents = getProductSelectedIntents(); // ["PAY"]

    // Store currency and amount for use in complete event
    // This ensures we use the same values that were used in Klarna payment
    buttonInitCurrency = currency;
    buttonInitAmount = amount;

    console.log("🔵 Klarna button initialization - Currency:", currency, "Amount:", amount);

    // Create payment button using Klarna.Payment.button()
    // Note: paymentOptionId is NOT required when using Payment.button() directly
    // We don't need to fetch presentation - Payment.button() handles it internally
    const buttonContainer = document.getElementById("product-payment-button-container");
    if (!buttonContainer) {
      console.error("Payment button container not found");
      return;
    }

    // Clear button container to unmount any existing button
    // This ensures we create a fresh button instance on every page load
    buttonContainer.innerHTML = "";
    console.log("🔄 Cleared button container - creating fresh button instance");

    // Clear and mount on-site messaging placement above the payment button
    const osmContainer = document.getElementById("osm-placement");
    if (osmContainer) {
      // Clear existing placement before mounting a new one
      osmContainer.innerHTML = "";
      
      if (klarnaInstance.Messaging?.placement) {
        try {
          klarnaInstance.Messaging.placement({
            key: 'credit-promotion-badge',
            locale: locale,
            amount: amount,
          }).mount('#osm-placement');
          console.log("On-site messaging placement mounted successfully");
        } catch (error) {
          console.warn("Error mounting messaging placement:", error);
        }
      }
    }

    // Create payment request server-side BEFORE initializing the button
    // This ensures we get a fresh payment_request_id for each page load, similar to /payments flow
    console.log("🔄 Creating payment request server-side before button initialization...");
    console.log("🔄 Page load timestamp:", new Date().toISOString());
    console.log("🔄 Session ID check - customer email:", sessionCustomerEmail);
    
    const paymentRequestData = buildProductPaymentRequestData();
    
    const klarnaClientId = (typeof window !== "undefined" && window.CredentialStorage && window.CredentialStorage.get ? window.CredentialStorage.get("klarna_websdk_client_id") : null) || localStorage.getItem("klarna_websdk_client_id") || sessionStorage.getItem("klarna_websdk_client_id") || undefined;
    const klarnaApiKey = (typeof window !== "undefined" && window.CredentialStorage && window.CredentialStorage.get ? window.CredentialStorage.get("klarna_api_key") : null) || localStorage.getItem("klarna_api_key") || sessionStorage.getItem("klarna_api_key") || undefined;
    const klarnaEnvironment = (typeof window !== "undefined" && window.CredentialStorage && window.CredentialStorage.get ? window.CredentialStorage.get("klarna_environment") : null) || localStorage.getItem("klarna_environment") || sessionStorage.getItem("klarna_environment") || "playground";

    const requestBody = {
      paymentRequestData,
      returnUrl: `${API_BASE}/payment-complete`,
      appReturnUrl: null,
      authMode: "SUB_PARTNER", // Product page only uses SUB_PARTNER mode
      klarnaEnvironment,
      ...(klarnaClientId && { klarnaClientId }),
      ...(klarnaApiKey && { klarnaApiKey }),
    };

    const endpoint = "/api/payment-request";
    logFlow('request', `POST ${endpoint}`, requestBody);

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const res = await response.json();
    logFlow('response', `POST ${endpoint}`, { status: response.status, statusText: response.statusText, data: res });

    if (!response.ok) {
      console.error("Failed to create payment request:", res);
      if (res.validation_errors) console.error("Klarna validation_errors:", res.validation_errors);
      if (res.details) console.error("Klarna response details:", res.details);
      throw new Error(res.message || "Payment request failed");
    }

    // Handle SUB_PARTNER response and get payment_request_id
    let paymentRequestId;
    switch (res.status) {
      case "CREATED":
        paymentRequestId = res.paymentRequestId;
        console.log("✅ Payment Request ID created server-side:", paymentRequestId);
        console.log("✅ Payment Request ID timestamp:", new Date().toISOString());
        console.log("✅ Payment Request Reference sent:", paymentRequestData.paymentRequestReference);
        logFlow('success', 'Payment Request Created (Server-side)', { 
          payment_request_id: paymentRequestId,
          payment_request_reference: paymentRequestData.paymentRequestReference,
          status: res.status,
          timestamp: new Date().toISOString()
        });
        break;
      case "COMPLETED":
        paymentRequestId = res.paymentRequestId;
        console.log("✅ Payment Request ID created server-side (COMPLETED):", paymentRequestId);
        console.log("✅ Payment Request ID timestamp:", new Date().toISOString());
        console.log("✅ Payment Request Reference sent:", paymentRequestData.paymentRequestReference);
        logFlow('success', 'Payment Request Created (Server-side, COMPLETED)', { 
          payment_request_id: paymentRequestId,
          payment_request_reference: paymentRequestData.paymentRequestReference,
          status: res.status,
          timestamp: new Date().toISOString()
        });
        break;
      case "ERROR":
        throw new Error(res.message || "Payment request error");
      default:
        throw new Error(`Unexpected payment request status: ${res.status}`);
    }

    // Now initialize button with the payment_request_id we just created
    // Store it in a const to ensure closure captures the correct value
    // Also update module-level variable so event handler can validate
    const currentPaymentRequestId = paymentRequestId;
    
    // Store the previous payment_request_id before updating, so we can cancel it
    const previousPaymentRequestId = currentSessionPaymentRequestId;
    currentSessionPaymentRequestId = paymentRequestId; // Update module-level variable
    
    console.log("🔄 Initializing Klarna payment button with payment_request_id:", currentPaymentRequestId);
    console.log("🔄 Payment request ID timestamp:", new Date().toISOString());
    console.log("🔄 Previous payment_request_id (if any):", previousPaymentRequestId);
    console.log("🔄 Updated currentSessionPaymentRequestId:", currentSessionPaymentRequestId);
    
    // Unmount previous button instance if it exists
    if (currentButtonInstance && typeof currentButtonInstance.unmount === 'function') {
      try {
        console.log("🔄 Unmounting previous button instance");
        currentButtonInstance.unmount();
        console.log("✅ Previous button instance unmounted");
      } catch (error) {
        console.warn("⚠️ Error unmounting previous button instance:", error);
      }
      currentButtonInstance = null;
    }
    
    // Clear button container again right before mounting to ensure clean state
    buttonContainer.innerHTML = "";
    
    // Cancel any PREVIOUS payment request before creating a new button
    // This ensures the SDK doesn't try to reuse the old payment_request_id
    if (previousPaymentRequestId && klarnaInstance.Payment?.cancel) {
      try {
        console.log("🔄 Cancelling PREVIOUS payment request before creating new button:", previousPaymentRequestId);
        klarnaInstance.Payment.cancel(previousPaymentRequestId);
        console.log("✅ Previous payment request cancelled");
      } catch (error) {
        console.warn("⚠️ Error cancelling previous payment request (might not exist or already completed):", error);
      }
    } else if (previousPaymentRequestId) {
      console.log("⚠️ Previous payment_request_id exists but Payment.cancel is not available:", previousPaymentRequestId);
    }
    
    console.log("🔄 Creating NEW button instance with payment_request_id:", currentPaymentRequestId);
    console.log("🔄 Button creation timestamp:", new Date().toISOString());
    
    const buttonInstance = klarnaInstance.Payment.button({
      shape: "default",
      theme: "default",
      initiationMode: "DEVICE_BEST",
      initiate: async (initiateData) => {
        console.log("🟡 Payment button initiated - initiate callback called");
        console.log("🟡 initiateData received:", initiateData);
        console.log("🟡 initiate callback - using payment_request_id:", currentPaymentRequestId);
        console.log("🟡 Payment request ID timestamp in initiate:", new Date().toISOString());
        console.log("🟡 Current session payment_request_id (module level):", currentSessionPaymentRequestId);
        
        // Filter out klarnaNetworkSessionToken from initiate log if present
        // This token (if it exists) is from a previous session and should not be used
        // The actual token we need comes from the 'complete' event, not from initiation
        const initiateLogData = { ...initiateData };
        if (initiateLogData.klarnaNetworkSessionToken) {
          console.log("⚠️ Note: klarnaNetworkSessionToken found in initiateData (from previous session, will be ignored)");
          delete initiateLogData.klarnaNetworkSessionToken;
        }
        logFlow('event', 'Klarna Button: Initiated', {
          ...initiateLogData,
          paymentRequestIdBeingReturned: currentPaymentRequestId,
          timestamp: new Date().toISOString()
        });
        
        // Return the payment_request_id we created server-side (not creating a new one)
        // Use const to ensure we're returning the correct value from this closure
        const returnValue = { paymentRequestId: currentPaymentRequestId };
        console.log("🟡 Returning payment_request_id to SDK:", returnValue);
        console.log("🟡 Return value timestamp:", new Date().toISOString());
        return returnValue;
      },
    });
    
    console.log("🔄 Mounting button instance to container");
    buttonInstance.mount("#product-payment-button-container");
    console.log("✅ Button mounted successfully");
    
    // Store button instance reference for future unmounting
    currentButtonInstance = buttonInstance;

    // Add product-page-specific complete event handler (only register once)
    // Don't remove SDK's listener - just ensure we only register ours once
    if (!completeEventListenerRegistered) {
      completeEventListenerRegistered = true;
      console.log("🔵 Registering product page complete event listener (first time)");
      
      // Store handler reference to prevent duplicate registrations
      // Use module-level currentSessionPaymentRequestId to validate token is from current session
      productPageCompleteHandler = async (paymentRequest) => {
      // Guard against duplicate execution
      if (isProcessingComplete) {
        console.warn("⚠️ Complete event already being processed, ignoring duplicate event");
        return false;
      }
      isProcessingComplete = true;
      
      console.log("🟢 Payment complete event received on product page:", paymentRequest);
      console.log("🟢 Complete event timestamp:", new Date().toISOString());
      console.log("🟢 Current session payment_request_id:", currentSessionPaymentRequestId);
      console.log("🟢 Payment request ID from event:", paymentRequest?.paymentRequestId);
      logFlow('event', 'Klarna Button: Payment Complete', {
        ...paymentRequest,
        currentSessionPaymentRequestId: currentSessionPaymentRequestId,
        eventTimestamp: new Date().toISOString()
      });
      console.log("Full paymentRequest object:", JSON.stringify(paymentRequest, null, 2));
      console.log("paymentRequest.stateContext:", paymentRequest?.stateContext);
      
      // Validate that this complete event is for the current session's payment request
      // If the payment_request_id doesn't match, this might be a stale event from a previous session
      // Use module-level variable to check against current session
      if (paymentRequest?.paymentRequestId && currentSessionPaymentRequestId && 
          paymentRequest.paymentRequestId !== currentSessionPaymentRequestId) {
        console.warn("⚠️ WARNING: Payment request ID mismatch!");
        console.warn("  Expected (current session):", currentSessionPaymentRequestId);
        console.warn("  Received (from event):", paymentRequest.paymentRequestId);
        console.warn("  This might be a stale event from a previous session - ignoring");
        console.warn("  Event timestamp:", new Date().toISOString());
        logFlow('warning', 'Klarna Button: Payment Request ID Mismatch', {
          expected: currentSessionPaymentRequestId,
          received: paymentRequest.paymentRequestId,
          note: 'This might be a stale event from a previous session - token will be ignored',
          eventTimestamp: new Date().toISOString()
        });
        isProcessingComplete = false; // Reset flag so we can process the correct event
        return false;
      }
      
      // Also log if payment_request_id matches to confirm we're using the correct token
      if (paymentRequest?.paymentRequestId === currentSessionPaymentRequestId) {
        console.log("✅ Payment request ID matches current session - token is valid");
      }
      
      // Extract Klarna Network Session Token from stateContext
      // Based on Paytrail project, the token is in stateContext.interoperabilityToken
      // But we check multiple possible locations
      const klarnaNetworkSessionToken = paymentRequest?.stateContext?.interoperabilityToken ||
                                        paymentRequest?.stateContext?.klarnaNetworkSessionToken ||
                                        paymentRequest?.klarnaNetworkSessionToken ||
                                        null;
      
      if (!klarnaNetworkSessionToken) {
        console.error("No Klarna Network Session Token found in paymentRequest");
        logFlow('error', 'Klarna Button: No Session Token Found', {
          availableKeys: Object.keys(paymentRequest || {}),
          stateContextKeys: Object.keys(paymentRequest?.stateContext || {})
        });
        console.error("Available paymentRequest keys:", Object.keys(paymentRequest || {}));
        console.error("Available stateContext keys:", Object.keys(paymentRequest?.stateContext || {}));
        alert("Payment completed but no session token found. Please check console for details.");
        isProcessingComplete = false; // Reset flag
        return false;
      }

      console.log("✅ Klarna Network Session Token extracted:", klarnaNetworkSessionToken);
      console.log("🔄 Session token timestamp:", new Date().toISOString());
      console.log("🔄 Session token length:", klarnaNetworkSessionToken?.length);
      console.log("🔄 Session token first 20 chars:", klarnaNetworkSessionToken?.substring(0, 20));
      console.log("🔄 Session token last 20 chars:", klarnaNetworkSessionToken?.substring(klarnaNetworkSessionToken.length - 20));
      logFlow('info', 'Klarna Button: Session Token Extracted', { 
        token: klarnaNetworkSessionToken,
        tokenLength: klarnaNetworkSessionToken?.length,
        tokenPreview: klarnaNetworkSessionToken?.substring(0, 20) + '...',
        tokenSuffix: '...' + klarnaNetworkSessionToken?.substring(klarnaNetworkSessionToken.length - 20),
        timestamp: new Date().toISOString(),
        paymentRequestId: paymentRequest?.paymentRequestId
      });

      // Check if user wants to skip Paytrail payment request (for testing)
      const skipPaytrailCheckbox = document.getElementById('skip-paytrail-request');
      if (skipPaytrailCheckbox && skipPaytrailCheckbox.checked) {
        console.log("⚠️ Skipping Paytrail payment request (testing mode enabled)");
        console.log("✅ Session Token (for reference):", klarnaNetworkSessionToken);
        logFlow('info', 'Klarna Button: Paytrail Request Skipped (Testing Mode)', { 
          token: klarnaNetworkSessionToken,
          note: 'Payment completed successfully, but Paytrail request was skipped as requested'
        });
        alert("Payment completed! Paytrail request skipped (testing mode).");
        isProcessingComplete = false; // Reset flag so user can try again
        return false;
      }

      try {
        // Use the same currency and amount that were used when initializing the Klarna button
        // This ensures consistency - if Klarna payment was created with GBP 15900,
        // Paytrail should receive the same currency and amount
        const currency = buttonInitCurrency || COUNTRY_MAPPING[productCountrySel.value].currency;
        const amount = buttonInitAmount || parseInt(productAmountInput.value, 10) || 15900;
        
        console.log("🟢 Paytrail payment request - Currency:", currency, "Amount:", amount);
        console.log("🟢 Using stored values from button init - Currency:", buttonInitCurrency, "Amount:", buttonInitAmount);
        
        // Paytrail only supports EUR, so if currency is not EUR, we need to handle this
        // For now, we'll use the currency from Klarna button, but this may cause issues
        // TODO: Consider currency conversion or restricting to EUR-only countries
        if (currency !== 'EUR') {
          console.warn("⚠️ WARNING: Currency mismatch! Klarna button used", currency, "but Paytrail only supports EUR.");
          console.warn("⚠️ This may cause Klarna to not recognize the completed payment.");
        }
        
        // Generate unique references for each payment attempt
        // Use high-resolution timestamp + multiple random components to ensure uniqueness
        // This prevents idempotency conflicts when user tries again after returning to page
        const timestamp = Date.now();
        const performanceNow = typeof performance !== 'undefined' ? performance.now() : Math.random() * 1000;
        const randomStr1 = Math.random().toString(36).substr(2, 9);
        const randomStr2 = Math.random().toString(36).substr(2, 9);
        const uniqueId = `${timestamp}_${performanceNow}_${randomStr1}_${randomStr2}`;
        const stamp = `stamp_${uniqueId}`;
        const reference = `ref_${uniqueId}`;
        
        console.log("🔄 Generated new payment references:", { stamp, reference, uniqueId });

        // Map locale to Paytrail language code (must be uppercase: FI, SV, or EN)
        const localeCode = productLocaleSel.value.split('-')[0] || 'en';
        const languageMap = {
          'fi': 'FI',
          'sv': 'SV',
          'en': 'EN'
        };
        const language = languageMap[localeCode.toLowerCase()] || 'EN';

        // Get the selected payment endpoint
        const selectedEndpoint = productPaymentEndpointSel.value;
        
        // Build Paytrail payment request
        const paymentData = {
          stamp: stamp,
          reference: reference,
          amount: amount,
          currency: currency,
          language: language,
          customer: {
            email: sessionCustomerEmail
          },
          redirectUrls: {
            success: `${API_BASE}/payment-complete`,
            cancel: `${API_BASE}/product`
          },
          providerDetails: {
            klarna: {
              networkSessionToken: klarnaNetworkSessionToken
            }
          }
        };
        // Paytrail credentials (CredentialStorage, localStorage, or sessionStorage)
        const PAYTRAIL_MERCHANT_ID_KEY = 'paytrail_merchant_id';
        const PAYTRAIL_SECRET_KEY_KEY = 'paytrail_secret_key';
        function getCred(key) {
          if (typeof window !== 'undefined' && window.CredentialStorage && window.CredentialStorage.get) return window.CredentialStorage.get(key) || '';
          try { return localStorage.getItem(key) || sessionStorage.getItem(key) || ''; } catch (e) { return ''; }
        }
        const merchantId = getCred(PAYTRAIL_MERCHANT_ID_KEY);
        const secretKey = getCred(PAYTRAIL_SECRET_KEY_KEY);
        if (!merchantId || !secretKey) {
          alert('Please set your Paytrail credentials on the Demo Store homepage first (Paytrail credentials section, then Save).');
          return;
        }

        // HPP option uses the same /api/payments endpoint but handles response differently
        const actualEndpoint = selectedEndpoint === '/payments-hpp' ? '/payments' : selectedEndpoint;
        const endpointUrl = `${API_BASE}/api${actualEndpoint}`;
        const requestBody = { payment: paymentData, merchantId, secretKey };

        console.log(`Calling backend API ${endpointUrl} with:`, JSON.stringify(paymentData, null, 2));
        logFlow('request', `POST ${endpointUrl} (Backend API)`, paymentData);

        // Call Paytrail payment endpoint (credentials in body for all Paytrail endpoints)
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        logFlow('response', `POST ${endpointUrl} (Paytrail)`, { status: response.status, statusText: response.statusText, data: data });

        // Check if this is the HPP option
        const isHppEndpoint = selectedEndpoint === '/payments-hpp';
        console.log("🔍 Endpoint check:", { selectedEndpoint, isHppEndpoint });
        
        // Check if this is one of the new Klarna endpoints (charge or authorization-hold)
        const isKlarnaExpressEndpoint = selectedEndpoint.includes('/klarna/charge') || 
                                       selectedEndpoint.includes('/klarna/authorization-hold');

        if (isKlarnaExpressEndpoint) {
          console.log("🔍 Klarna Express endpoint detected");
          console.log("Response status:", response.status);
          console.log("Response data:", data);
          console.log("Has transactionId:", !!data.transactionId);
          
          // Handle new Klarna Express endpoints
          // Accept both 200 and 201 as success status codes
          if ((response.status === 201 || response.status === 200) && data.transactionId) {
            // Success: payment created - redirect to payment-complete page with transaction ID
            console.log("✅ Klarna Express payment created successfully");
            console.log("Transaction ID:", data.transactionId);
            logFlow('success', 'Klarna Express Payment Created', { transactionId: data.transactionId });
            
            // Store transaction ID in sessionStorage as backup
            sessionStorage.setItem('paytrailTransactionId', data.transactionId);
            
            // Redirect to payment-complete page with transaction ID
            const redirectUrl = `${API_BASE}/payment-complete?transaction_id=${encodeURIComponent(data.transactionId)}&status=completed`;
            console.log("Redirecting to:", redirectUrl);
            // Use window.location.replace to ensure redirect happens
            window.location.replace(redirectUrl);
            return;
          } else if (response.status === 403 && data.stepUpUrl) {
            // Step-up required: redirect to stepUpUrl
            console.log("⚠️ Step-up required for Klarna Express payment");
            console.log("Transaction ID:", data.transactionId);
            console.log("Step-up URL:", data.stepUpUrl);
            logFlow('info', 'Klarna Express Step-up Required', { 
              transactionId: data.transactionId, 
              stepUpUrl: data.stepUpUrl 
            });
            
            // Redirect to step-up URL
            window.location.href = data.stepUpUrl;
            return;
          } else {
            // Error case - log detailed information
            console.error("❌ Klarna Express payment failed or unexpected response");
            console.error("Response status:", response.status);
            console.error("Response data:", data);
            console.error("Expected: status 200/201 with transactionId, or status 403 with stepUpUrl");
            logFlow('error', 'Klarna Express Payment Failed', { 
              status: response.status, 
              statusText: response.statusText,
              error: data,
              expected: "status 200/201 with transactionId, or status 403 with stepUpUrl"
            });
            throw new Error(data.message || data.error || `Klarna Express payment failed: status ${response.status}`);
          }
        }

        // Handle HPP endpoint - redirect to href value from Paytrail response
        if (isHppEndpoint) {
          console.log("🔍 HPP endpoint detected, checking response...");
          console.log("Response status:", response.status);
          console.log("Response ok:", response.ok);
          console.log("Response data:", data);
          
          // Check for successful response (201 is returned for successful payment creation)
          if (!response.ok || (response.status !== 201 && response.status !== 200)) {
            logFlow('error', 'Paytrail Payment Failed (HPP)', { status: response.status, error: data });
            throw new Error(data.message || data.error || 'Payment creation failed');
          }

          console.log("Paytrail payment response (HPP):", data);
          console.log("Checking for href in response...", { hasHref: !!data.href, dataKeys: Object.keys(data) });

          // For HPP, always use the href value from the response (not Klarna provider)
          if (data.href) {
            console.log("✅ Found href, redirecting to HPP URL from Paytrail response:", data.href);
            logFlow('info', 'Redirecting to HPP URL', { href: data.href });
            
            // Store transaction ID in sessionStorage for payment-complete page
            if (data.transactionId) {
              sessionStorage.setItem('paytrailTransactionId', data.transactionId);
              console.log("Stored transaction ID for payment-complete page:", data.transactionId);
            }
            
            // For HPP, redirect immediately using GET request (window.location.href uses GET)
            // Stop all further execution by redirecting immediately
            window.location.replace(data.href);
            return false; // Return false to prevent any further execution
          } else {
            console.error("❌ HPP Payment Response Missing href", data);
            console.error("Response structure:", JSON.stringify(data, null, 2));
            logFlow('error', 'HPP Payment Response Missing href', { data, dataKeys: Object.keys(data) });
            throw new Error('HPP payment response missing href value');
          }
        }

        // Original /api/payments endpoint handling
        if (!response.ok) {
          logFlow('error', 'Paytrail Payment Failed', { status: response.status, error: data });
          throw new Error(data.message || data.error || 'Payment creation failed');
        }

        console.log("Paytrail payment response:", data);

        // Find Klarna provider URL in the response
        // The response should have a providers array with Klarna provider
        const providers = data.providers || [];
        const klarnaProvider = providers.find((provider) => 
          provider.id?.toLowerCase() === 'klarna' || 
          provider.name?.toLowerCase() === 'klarna' ||
          provider.url?.includes('klarna')
        );

        if (klarnaProvider && klarnaProvider.url) {
          console.log("Klarna provider found:", klarnaProvider);
          console.log("Provider URL:", klarnaProvider.url);
          console.log("Provider parameters:", klarnaProvider.parameters);
          logFlow('info', 'Redirecting to Klarna Provider', {
            url: klarnaProvider.url,
            parameters: klarnaProvider.parameters
          });

          // Store transaction ID in sessionStorage for payment-complete page
          if (data.transactionId) {
            sessionStorage.setItem('paytrailTransactionId', data.transactionId);
            console.log("Stored transaction ID for payment-complete page:", data.transactionId);
          }

          // Create a form to POST to the provider URL with all parameters
          // This matches how the homepage handles provider redirects
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = klarnaProvider.url;
          form.style.display = 'none';

          // Add hidden inputs for all provider parameters
          if (klarnaProvider.parameters && Array.isArray(klarnaProvider.parameters)) {
            klarnaProvider.parameters.forEach(param => {
              const input = document.createElement('input');
              input.type = 'hidden';
              input.name = param.name;
              input.value = param.value || '';
              form.appendChild(input);
            });
          }

          // Append form to body and submit
          document.body.appendChild(form);
          form.submit();
        } else if (data.href) {
          // Fallback: if no specific Klarna provider found but we have a main href,
          // we still need to check if there are any providers with parameters
          const firstProvider = providers.find(p => p.url && p.parameters);
          if (firstProvider && firstProvider.parameters) {
            // Use the first provider with parameters
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = firstProvider.url;
            form.style.display = 'none';

            firstProvider.parameters.forEach(param => {
              const input = document.createElement('input');
              input.type = 'hidden';
              input.name = param.name;
              input.value = param.value || '';
              form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();
          } else {
            // Last resort: redirect to href (though this shouldn't happen for Klarna)
            console.warn("No provider with parameters found, redirecting to href:", data.href);
            window.location.href = data.href;
          }
        } else {
          throw new Error("No redirect URL found in Paytrail response");
        }

        // Return false to prevent default SDK behavior
        isProcessingComplete = false; // Reset guard after successful completion
        return false;
      } catch (error) {
        console.error("Error creating Paytrail payment:", error);
        logFlow('error', 'Paytrail Payment Error', { error: error.message, stack: error.stack });
        alert(`Error processing payment: ${error instanceof Error ? error.message : String(error)}`);
        isProcessingComplete = false; // Reset guard after error
        return false;
      }
      };
      
      // Register the handler
      klarnaInstance.Payment.on("complete", productPageCompleteHandler);
      
      console.log("✅ Complete event listener registered for product page");
    } else {
      console.warn("⚠️ Complete event listener already registered, skipping duplicate registration");
    }

    console.log("Payment button initialized successfully");
  } catch (error) {
    console.error("Error initializing payment button:", error);
    const buttonContainer = document.getElementById("product-payment-button-container");
    if (buttonContainer) {
      buttonContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initializeProductPage() {
  console.log("🔄 Product page loading - performing complete cleanup and SDK reinitialization");
  
  // Do NOT clear localStorage or sessionStorage here - credentials (Paytrail/Klarna)
  // are stored there by the homepage and must be preserved. Only clear product-page-
  // specific transient keys if needed.
  try {
    localStorage.removeItem('paymentRequestId');
    sessionStorage.removeItem('paymentRequestId');
  } catch (e) {
    console.warn("⚠️ Error clearing payment request id:", e);
  }
  
  // Unmount Klarna button if it exists
  try {
    console.log("🧹 Unmounting Klarna button if it exists...");
    if (currentButtonInstance && typeof currentButtonInstance.unmount === 'function') {
      currentButtonInstance.unmount();
      console.log("✅ Klarna button unmounted");
    }
    currentButtonInstance = null;
    
    // Also clear button container
    const buttonContainer = document.getElementById("product-payment-button-container");
    if (buttonContainer) {
      buttonContainer.innerHTML = "";
      console.log("✅ Button container cleared");
    }
  } catch (e) {
    console.warn("⚠️ Error unmounting button:", e);
  }
  
  // Step 4: Remove Payment event listeners (only the specific handler to avoid SDK warning)
  try {
    console.log("🧹 Removing Payment event listeners...");
    const klarnaInstance = await ensureSDK().catch(() => null);
    if (klarnaInstance && klarnaInstance.Payment && productPageCompleteHandler) {
      klarnaInstance.Payment.off("complete", productPageCompleteHandler);
      console.log("✅ Removed complete event listener");
    }
  } catch (e) {
    console.warn("⚠️ Error removing event listeners (SDK might not be initialized yet):", e);
  }
  
  // Do NOT call resetSDKState() here - it clears the Klarna instance and causes ensureSDK()
  // to re-import the SDK, which triggers "test-drive-badge has already been used" (duplicate
  // custom element registration). We only need to clear our module-level state and unmount
  // the button; the SDK can stay loaded.
  
  // Step 5: Reset all module-level state
  console.log("🧹 Resetting module-level state...");
  completeEventListenerRegistered = false;
  productPageCompleteHandler = null;
  isProcessingComplete = false;
  currentSessionPaymentRequestId = null;
  currentSDKLocale = null;
  console.log("✅ Module-level state reset");
  
  console.log("✅ Complete cleanup finished - SDK will be reinstalled from scratch");
  
  // Get DOM elements
  productCountrySel = document.getElementById("product-country");
  productLocaleSel = document.getElementById("product-locale");
  productAmountInput = document.getElementById("product-amount");
  productCurrencyPill = document.getElementById("product-currency-pill");
  productPriceDisplay = document.getElementById("product-price");
  productPaymentEndpointSel = document.getElementById("product-payment-endpoint");

  // Check if all required elements exist
  if (!productCountrySel || !productLocaleSel || !productAmountInput || !productCurrencyPill || !productPriceDisplay || !productPaymentEndpointSel) {
    console.error("Required DOM elements not found");
    return;
  }

  // Populate country and locale dropdowns
  populateProductCountries();

  // Reflect currency when country changes
  productCountrySel.addEventListener("change", () => {
    const defaultLocale = productCountrySel.value === "FI" ? "en-FI" : null;
    populateProductLocales(productCountrySel.value, defaultLocale);
    reflectProductCurrency(productCountrySel.value);
    // Re-initialize payment button and messaging when country changes
    initializePaymentButton();
  });

  // Re-initialize when locale changes
  productLocaleSel.addEventListener("change", () => {
    updateProductPriceDisplay();
    // Re-initialize payment button and messaging when locale changes
    initializePaymentButton();
  });

  // Update price display and re-initialize messaging when amount changes
  productAmountInput.addEventListener("input", () => {
    updateProductPriceDisplay();
    // Re-initialize messaging when amount changes (to update the amount in OSM)
    initializePaymentButton();
  });

  // Initial price display update
  updateProductPriceDisplay();

  // Initialize payment button after page loads
  await initializePaymentButton();

  console.log("Product page initialized");
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeProductPage);
} else {
  initializeProductPage();
}
