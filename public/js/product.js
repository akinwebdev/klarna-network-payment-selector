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
const productSubscriptionBillingIntervalSel = document.getElementById("product-subscription-billing-interval");
const productSubscriptionBillingIntervalFrequencyInput = document.getElementById("product-subscription-billing-interval-frequency");
const productAdvancedFlowSel = document.getElementById("product-advanced-flow");
const productAvailableIntents = document.getElementById("product-available-intents");
const productSelectedIntents = document.getElementById("product-selected-intents");
const productIntentsEmpty = document.getElementById("product-intents-empty");
const productIntentWarning = document.getElementById("product-intent-warning");

// ============================================================================
// COUNTRY & LOCALE FUNCTIONS
// ============================================================================

function populateProductCountries(defaultCountry = "SE") {
  productCountrySel.innerHTML = "";
  Object.keys(COUNTRY_MAPPING).forEach((cc) => {
    const opt = document.createElement("option");
    opt.value = cc;
    opt.textContent = cc;
    if (cc === defaultCountry) opt.selected = true;
    productCountrySel.appendChild(opt);
  });
  populateProductLocales(productCountrySel.value);
  reflectProductCurrency(productCountrySel.value);
}

function populateProductLocales(countryCode) {
  const { locales } = COUNTRY_MAPPING[countryCode];
  productLocaleSel.innerHTML = "";
  locales.forEach((loc, i) => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    if (i === 0) opt.selected = true;
    productLocaleSel.appendChild(opt);
  });
}

function reflectProductCurrency(countryCode) {
  productCurrencyPill.textContent = COUNTRY_MAPPING[countryCode].currency;
}

// ============================================================================
// INTENT MANAGEMENT
// ============================================================================

function getProductSelectedIntents() {
  const items = productSelectedIntents.querySelectorAll(".intent-item");
  const selected = Array.from(items).map((item) => item.dataset.intent);
  return selected.length > 0 ? selected : undefined;
}

function addProductIntent(intent) {
  if (productSelectedIntents.querySelector(`[data-intent="${intent}"]`)) return;

  const item = document.createElement("div");
  item.className = "intent-item";
  item.dataset.intent = intent;
  item.draggable = true;
  item.innerHTML = `
    <span class="drag-handle">⋮⋮</span>
    <span class="intent-name">${intent}</span>
    <button type="button" class="intent-remove" data-intent="${intent}">×</button>
  `;

  productSelectedIntents.appendChild(item);
  productIntentsEmpty.style.display = "none";
  validateProductIntents();
  setupProductIntentItemEvents(item);
}

function removeProductIntent(intent) {
  const item = productSelectedIntents.querySelector(`[data-intent="${intent}"]`);
  if (item) {
    item.remove();
    if (productSelectedIntents.children.length === 0) {
      productIntentsEmpty.style.display = "block";
    }
    validateProductIntents();
  }
}

function validateProductIntents() {
  const intents = getProductSelectedIntents();
  if (!intents || intents.length === 0) {
    productIntentWarning.style.display = "none";
    return;
  }

  const validCombinations = [
    ["PAY"],
    ["DONATE"],
    ["SUBSCRIBE"],
    ["SIGNUP"],
    ["SIGNIN"],
    ["ADD_TO_WALLET"],
    ["PAY", "ADD_TO_WALLET"],
    ["ADD_TO_WALLET", "PAY"],
    ["PAY", "SIGNIN"],
    ["SIGNIN", "PAY"],
    ["PAY", "SUBSCRIBE"],
    ["SUBSCRIBE", "PAY"],
    ["DONATE", "SIGNIN"],
    ["SIGNIN", "DONATE"],
  ];

  const isValid = validCombinations.some((combo) => {
    if (combo.length !== intents.length) return false;
    return combo.every((intent) => intents.includes(intent));
  });

  productIntentWarning.style.display = isValid ? "none" : "block";
}

function setupProductIntentItemEvents(item) {
  const removeBtn = item.querySelector(".intent-remove");
  removeBtn.addEventListener("click", () => {
    removeProductIntent(item.dataset.intent);
  });

  // Drag and drop for reordering
  item.addEventListener("dragstart", (e) => {
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    document.querySelectorAll(".intent-item").forEach((el) => {
      el.classList.remove("drop-above", "drop-below");
    });
  });

  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    const draggingItem = productSelectedIntents.querySelector(".dragging");
    if (!draggingItem || draggingItem === item) return;

    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    item.classList.remove("drop-above", "drop-below");

    if (e.clientY < midY) {
      item.classList.add("drop-above");
    } else {
      item.classList.add("drop-below");
    }
  });

  item.addEventListener("drop", (e) => {
    e.preventDefault();
    const draggingItem = productSelectedIntents.querySelector(".dragging");
    if (!draggingItem || draggingItem === item) return;

    if (item.classList.contains("drop-above")) {
      productSelectedIntents.insertBefore(draggingItem, item);
    } else {
      productSelectedIntents.insertBefore(draggingItem, item.nextSibling);
    }

    document.querySelectorAll(".intent-item").forEach((el) => {
      el.classList.remove("drop-above", "drop-below");
    });
  });
}

function initializeProductIntentList() {
  productAvailableIntents.querySelectorAll(".intent-chip:not(.disabled)").forEach(
    (chip) => {
      chip.addEventListener("click", () => {
        const intent = chip.dataset.intent;
        if (chip.classList.contains("added")) {
          removeProductIntent(intent);
          chip.classList.remove("added");
        } else {
          addProductIntent(intent);
          chip.classList.add("added");
        }
      });
    },
  );

  // Setup existing intent items
  productSelectedIntents.querySelectorAll(".intent-item").forEach((item) => {
    setupProductIntentItemEvents(item);
    const chip = productAvailableIntents.querySelector(
      `[data-intent="${item.dataset.intent}"]`,
    );
    if (chip) chip.classList.add("added");
  });

  if (productSelectedIntents.children.length > 0) {
    productIntentsEmpty.style.display = "none";
  }
  validateProductIntents();
}

// ============================================================================
// FIELD VISIBILITY
// ============================================================================

function toggleProductFieldVisibility() {
  const intervalField = document.getElementById("product-subscription-billing-interval-frequency-field");
  if (productSubscriptionBillingIntervalSel.value) {
    intervalField.style.display = "block";
  } else {
    intervalField.style.display = "none";
  }
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
    populateProductLocales(productCountrySel.value);
    reflectProductCurrency(productCountrySel.value);
  });

  // Initialize intent list
  initializeProductIntentList();

  // Toggle field visibility based on subscription settings
  productSubscriptionBillingIntervalSel.addEventListener("change", toggleProductFieldVisibility);
  toggleProductFieldVisibility();

  console.log("Product page initialized");
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeProductPage);
} else {
  initializeProductPage();
}
