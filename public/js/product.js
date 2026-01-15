/**
 * Product Page - Payment Presentation Config
 * 
 * Initializes the payment configuration section on the product page
 */

import { COUNTRY_MAPPING, API_BASE } from "./constants.js";
import { ensureSDK } from "./sdk.js";
import { loadConfig } from "./config.js";
import { currentAuthMode, sdkConfig } from "./state.js";

// Product page specific DOM elements (will be set in initialization)
let productCountrySel;
let productLocaleSel;
let productAmountInput;
let productCurrencyPill;
let productPriceDisplay;

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

function buildProductPaymentRequestData(paymentOptionId) {
  const country = productCountrySel.value;
  const currency = COUNTRY_MAPPING[country].currency;
  const amount = parseInt(productAmountInput.value, 10) || 15900;
  const intents = getProductSelectedIntents(); // ["PAY"]

  const paymentRequestData = {
    currency,
    paymentOptionId,
    paymentRequestReference: `pay_req_ref_Product_${Date.now()}`,
    intents: intents || undefined,
    amount,
    supplementaryPurchaseData: {
      purchaseReference: `purchase_ref_Product_${Date.now()}`,
      lineItems: [{
        name: "Test Item",
        quantity: 1,
        totalAmount: amount,
        unitPrice: amount,
      }],
    },
  };

  return paymentRequestData;
}

// ============================================================================
// PAYMENT BUTTON INITIALIZATION
// ============================================================================

async function initializePaymentButton() {
  try {
    // Load config first
    const configLoaded = await loadConfig();
    if (!configLoaded) {
      console.error("Failed to load configuration");
      return;
    }

    // Get locale from settings before initializing SDK
    const locale = productLocaleSel.value; // en-FI
    
    // Set locale in SDK config so it's used during initialization
    if (sdkConfig) {
      sdkConfig.locale = locale;
    }

    // Initialize SDK (will use locale from sdkConfig)
    const klarnaInstance = await ensureSDK();
    if (!klarnaInstance) {
      console.error("Klarna SDK not available");
      return;
    }

    // Get pre-selected values
    const country = productCountrySel.value; // FI
    const currency = COUNTRY_MAPPING[country].currency; // EUR
    const amount = parseInt(productAmountInput.value, 10) || 15900;
    const intents = getProductSelectedIntents(); // ["PAY"]

    // Fetch presentation to get payment options
    const presentationConfig = {
      currency,
      locale,
      amount,
      intents,
    };

    console.log("Fetching presentation with config:", presentationConfig);
    const presentation = await klarnaInstance.Payment.presentation(presentationConfig);
    console.log("Presentation received:", presentation);

    // Get payment option ID from presentation
    const paymentOptionId = presentation.paymentOption?.paymentOptionId;
    if (!paymentOptionId) {
      console.error("No payment option ID in presentation");
      return;
    }

    // Create payment button using Klarna.Payment.button()
    const buttonContainer = document.getElementById("product-payment-button-container");
    if (!buttonContainer) {
      console.error("Payment button container not found");
      return;
    }

    buttonContainer.innerHTML = "";

    // Mount on-site messaging placement above the payment button
    const osmContainer = document.getElementById("osm-placement");
    if (osmContainer && klarnaInstance.Messaging?.placement) {
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

    klarnaInstance.Payment.button({
      shape: "default",
      theme: "default",
      initiationMode: "DEVICE_BEST",
      initiate: async (initiateData) => {
        console.log("Payment button initiated:", initiateData);
        const token = initiateData?.klarnaNetworkSessionToken || null;
        console.log("Klarna Network Session Token:", token || "(not provided)");
        
        // Build payment request data with product page values
        const paymentRequestData = buildProductPaymentRequestData(paymentOptionId);
        
        const requestBody = {
          klarnaNetworkSessionToken: token,
          paymentOptionId,
          paymentRequestData,
          returnUrl: `${API_BASE}/payment-complete`,
          appReturnUrl: null,
          authMode: currentAuthMode,
        };

        // Use different endpoint based on auth mode
        const endpoint = currentAuthMode === "SUB_PARTNER"
          ? "/api/payment-request"
          : "/api/authorize-payment";

        const response = await fetch(`${API_BASE}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const res = await response.json();

        if (!response.ok) {
          throw new Error(res.message || "Payment request failed");
        }

        // Handle response based on the endpoint used
        if (currentAuthMode === "SUB_PARTNER") {
          switch (res.status) {
            case "CREATED":
              return { paymentRequestId: res.paymentRequestId };
            case "COMPLETED":
              return { returnUrl: res.successUrl };
            case "ERROR":
              throw new Error(res.message || "Payment request error");
            default:
              throw new Error(`Unexpected payment request status: ${res.status}`);
          }
        } else {
          switch (res.status) {
            case "STEP_UP_REQUIRED":
              return { paymentRequestId: res.paymentRequestId };
            case "APPROVED":
              return { returnUrl: res.successUrl };
            case "DECLINED":
              alert(res.message || "Your payment was declined. Please try another method.");
              return null;
            case "ERROR":
              throw new Error(res.message || "Payment authorization error");
            default:
              throw new Error(`Unexpected payment status: ${res.status}`);
          }
        }
      },
    }).mount("#product-payment-button-container");

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
  // Get DOM elements
  productCountrySel = document.getElementById("product-country");
  productLocaleSel = document.getElementById("product-locale");
  productAmountInput = document.getElementById("product-amount");
  productCurrencyPill = document.getElementById("product-currency-pill");
  productPriceDisplay = document.getElementById("product-price");

  // Check if all required elements exist
  if (!productCountrySel || !productLocaleSel || !productAmountInput || !productCurrencyPill || !productPriceDisplay) {
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

  // Update price display when amount changes
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
