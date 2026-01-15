/**
 * Product Page - Payment Presentation Config
 * 
 * Initializes the payment configuration section on the product page
 */

import { COUNTRY_MAPPING } from "./constants.js";
import { setupCollapsible } from "./ui.js";

// Product page specific DOM elements
const productCountrySel = document.getElementById("product-country");
const productLocaleSel = document.getElementById("product-locale");
const productAmountInput = document.getElementById("product-amount");
const productCurrencyPill = document.getElementById("product-currency-pill");

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
  productCurrencyPill.textContent = COUNTRY_MAPPING[countryCode].currency;
}

// ============================================================================
// INTENT MANAGEMENT
// ============================================================================

// Default intent is "PAY" - no UI needed, just return it when needed
export function getProductSelectedIntents() {
  return ["PAY"];
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeProductPage() {
  // Setup collapsible sections
  setupCollapsible();

  // Populate country and locale dropdowns
  populateProductCountries();

  // Reflect currency when country changes
  productCountrySel.addEventListener("change", () => {
    populateProductLocales(productCountrySel.value, "en-FI");
    reflectProductCurrency(productCountrySel.value);
  });

  console.log("Product page initialized");
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeProductPage);
} else {
  initializeProductPage();
}
