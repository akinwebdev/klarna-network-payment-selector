/**
 * Product Page - Payment Presentation Config
 * 
 * Initializes the payment configuration section on the product page
 */

import { COUNTRY_MAPPING, API_BASE } from "./constants.js";
import { ensureSDK, resetSDKState } from "./sdk.js";
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
      customer: {
        email: 'customer@example.com'
      },
    },
  };

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
    
    // If locale changed, reset SDK state to force re-initialization with new locale
    if (currentSDKLocale !== null && currentSDKLocale !== locale) {
      console.log(`Locale changed from ${currentSDKLocale} to ${locale}, resetting SDK...`);
      resetSDKState();
    }
    currentSDKLocale = locale;
    
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

    // Store currency and amount for use in complete event
    // This ensures we use the same values that were used in Klarna payment
    buttonInitCurrency = currency;
    buttonInitAmount = amount;

    console.log("🔵 Klarna button initialization - Currency:", currency, "Amount:", amount);

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
              console.log("✅ Payment Request ID received (SUB_PARTNER - CREATED):", res.paymentRequestId);
              return { paymentRequestId: res.paymentRequestId };
            case "COMPLETED":
              console.log("✅ Payment Request ID received (SUB_PARTNER - COMPLETED):", res.paymentRequestId);
              return { returnUrl: res.successUrl };
            case "ERROR":
              throw new Error(res.message || "Payment request error");
            default:
              throw new Error(`Unexpected payment request status: ${res.status}`);
          }
        } else {
          switch (res.status) {
            case "STEP_UP_REQUIRED":
              console.log("✅ Payment Request ID received (ACQUIRING_PARTNER - STEP_UP_REQUIRED):", res.paymentRequestId);
              return { paymentRequestId: res.paymentRequestId };
            case "APPROVED":
              console.log("✅ Payment Request ID received (ACQUIRING_PARTNER - APPROVED):", res.paymentRequestId);
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

    // Add product-page-specific complete event handler
    klarnaInstance.Payment.on("complete", async (paymentRequest) => {
      console.log("Payment complete event received on product page:", paymentRequest);
      console.log("Full paymentRequest object:", JSON.stringify(paymentRequest, null, 2));
      console.log("paymentRequest.stateContext:", paymentRequest?.stateContext);
      
      // Extract Klarna Network Session Token from stateContext
      // Based on Paytrail project, the token is in stateContext.interoperabilityToken
      // But we check multiple possible locations
      const klarnaNetworkSessionToken = paymentRequest?.stateContext?.interoperabilityToken ||
                                        paymentRequest?.stateContext?.klarnaNetworkSessionToken ||
                                        paymentRequest?.klarnaNetworkSessionToken ||
                                        null;
      
      if (!klarnaNetworkSessionToken) {
        console.error("No Klarna Network Session Token found in paymentRequest");
        console.error("Available paymentRequest keys:", Object.keys(paymentRequest || {}));
        console.error("Available stateContext keys:", Object.keys(paymentRequest?.stateContext || {}));
        alert("Payment completed but no session token found. Please check console for details.");
        return false;
      }

      console.log("Klarna Network Session Token extracted:", klarnaNetworkSessionToken);

      // Check if user wants to skip Paytrail payment request (for testing)
      const skipPaytrailCheckbox = document.getElementById('skip-paytrail-request');
      if (skipPaytrailCheckbox && skipPaytrailCheckbox.checked) {
        console.log("⚠️ Skipping Paytrail payment request (testing mode enabled)");
        alert("Payment completed! Paytrail request skipped (testing mode).");
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
        
        // Generate unique references
        const stamp = `stamp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const reference = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Map locale to Paytrail language code (must be uppercase: FI, SV, or EN)
        const localeCode = productLocaleSel.value.split('-')[0] || 'en';
        const languageMap = {
          'fi': 'FI',
          'sv': 'SV',
          'en': 'EN'
        };
        const language = languageMap[localeCode.toLowerCase()] || 'EN';

        // Build Paytrail payment request
        const paymentData = {
          stamp: stamp,
          reference: reference,
          amount: amount,
          currency: currency,
          language: language,
          customer: {
            email: 'customer@example.com'
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

        console.log("Calling Paytrail /api/payments with:", JSON.stringify(paymentData, null, 2));

        // Call Paytrail payment endpoint
        const response = await fetch(`${API_BASE}/api/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(paymentData)
        });

        const data = await response.json();

        if (!response.ok) {
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
        return false;
      } catch (error) {
        console.error("Error creating Paytrail payment:", error);
        alert(`Error processing payment: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    });

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
