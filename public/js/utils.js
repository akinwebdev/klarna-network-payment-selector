/**
 * Utility functions for the Klarna Payment Selector Demo
 */

import { COUNTRY_MAPPING } from "./constants.js";
import {
  advancedFlowSel,
  amountField,
  amountInput,
  availableIntents,
  countrySel,
  currencyPill,
  intentsEmpty,
  intentWarning,
  localeSel,
  selectedIntentsList,
  subscriptionBillingIntervalField,
  subscriptionBillingIntervalFrequencyField,
} from "./dom.js";

// Touch drag state for mobile reordering
let touchDragState = {
  draggingItem: null,
  startY: 0,
  currentY: 0,
};

// Callback for when intents change - set by main.js
let onIntentsChangeCallback = null;

export function setOnIntentsChangeCallback(callback) {
  onIntentsChangeCallback = callback;
}

// ============================================================================
// COUNTRY & LOCALE FUNCTIONS
// ============================================================================

export function populateCountries(defaultCountry = "SE") {
  countrySel.innerHTML = "";
  Object.keys(COUNTRY_MAPPING).forEach((cc) => {
    const opt = document.createElement("option");
    opt.value = cc;
    opt.textContent = cc;
    if (cc === defaultCountry) opt.selected = true;
    countrySel.appendChild(opt);
  });
  populateLocales(countrySel.value);
  reflectCurrency(countrySel.value);
}

export function populateLocales(countryCode) {
  const { locales } = COUNTRY_MAPPING[countryCode];
  localeSel.innerHTML = "";
  locales.forEach((loc, i) => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    if (i === 0) opt.selected = true;
    localeSel.appendChild(opt);
  });
}

export function reflectCurrency(countryCode) {
  currencyPill.textContent = COUNTRY_MAPPING[countryCode].currency;
}

// ============================================================================
// INTENT MANAGEMENT
// ============================================================================

/**
 * Get selected intents from the reorderable list in their current order
 * Returns array of intent values in the order displayed, or undefined if empty
 */
export function getSelectedIntents() {
  const items = selectedIntentsList.querySelectorAll(".intent-item");
  const selected = Array.from(items).map((item) => item.dataset.intent);
  return selected.length > 0 ? selected : undefined;
}

/**
 * Add an intent to the selected list
 */
export function addIntent(intent) {
  // Check if already added
  if (selectedIntentsList.querySelector(`[data-intent="${intent}"]`)) return;

  // Create new intent item
  const item = document.createElement("div");
  item.className = "intent-item";
  item.dataset.intent = intent;
  item.draggable = true;
  item.innerHTML = `
    <span class="drag-handle">⋮⋮</span>
    <span class="intent-name">${intent}</span>
    <button type="button" class="intent-remove" data-intent="${intent}">×</button>
  `;

  // Add drag event listeners
  setupIntentItemDragListeners(item);

  // Add remove button listener
  item.querySelector(".intent-remove").addEventListener(
    "click",
    () => removeIntent(intent),
  );

  selectedIntentsList.appendChild(item);

  // Mark chip as added
  const chip = availableIntents.querySelector(`[data-intent="${intent}"]`);
  if (chip) {
    chip.classList.add("added");
    chip.textContent = `✓ ${intent}`;
  }

  // Hide empty message
  intentsEmpty.style.display = "none";
  selectedIntentsList.style.display = "flex";

  // Trigger update
  onIntentsChange();
}

/**
 * Remove an intent from the selected list
 */
export function removeIntent(intent) {
  const item = selectedIntentsList.querySelector(`[data-intent="${intent}"]`);
  if (item) item.remove();

  // Unmark chip as added
  const chip = availableIntents.querySelector(`[data-intent="${intent}"]`);
  if (chip) {
    chip.classList.remove("added");
    chip.textContent = `+ ${intent}`;
  }

  // Show empty message if no intents left
  if (selectedIntentsList.children.length === 0) {
    intentsEmpty.style.display = "block";
    selectedIntentsList.style.display = "none";
  }

  // Trigger update
  onIntentsChange();
}

/**
 * Setup drag and drop listeners for an intent item (supports both mouse and touch)
 */
function setupIntentItemDragListeners(item) {
  // Desktop drag events
  item.addEventListener("dragstart", (e) => {
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.dataset.intent);
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    // Remove all drop indicators
    document.querySelectorAll(".intent-item").forEach((el) => {
      el.classList.remove("drop-above", "drop-below");
    });
  });

  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const draggingItem = selectedIntentsList.querySelector(".dragging");
    if (draggingItem && draggingItem !== item) {
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      // Remove existing indicators
      document.querySelectorAll(".intent-item").forEach((el) => {
        el.classList.remove("drop-above", "drop-below");
      });

      // Add indicator based on mouse position
      if (e.clientY < midY) {
        item.classList.add("drop-above");
      } else {
        item.classList.add("drop-below");
      }
    }
  });

  item.addEventListener("drop", (e) => {
    e.preventDefault();
    const draggingItem = selectedIntentsList.querySelector(".dragging");
    if (draggingItem && draggingItem !== item) {
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (e.clientY < midY) {
        selectedIntentsList.insertBefore(draggingItem, item);
      } else {
        selectedIntentsList.insertBefore(draggingItem, item.nextSibling);
      }

      // Trigger update after reorder
      onIntentsChange();
    }

    // Remove drop indicators
    document.querySelectorAll(".intent-item").forEach((el) => {
      el.classList.remove("drop-above", "drop-below");
    });
  });

  // Touch events for mobile reordering
  const dragHandle = item.querySelector(".drag-handle");
  if (dragHandle) {
    dragHandle.addEventListener("touchstart", (e) => {
      e.preventDefault();
      touchDragState.draggingItem = item;
      touchDragState.startY = e.touches[0].clientY;
      item.classList.add("dragging");
    }, { passive: false });
  }
}

// Global touch move handler for intent reordering
document.addEventListener("touchmove", (e) => {
  if (!touchDragState.draggingItem) return;

  e.preventDefault();
  touchDragState.currentY = e.touches[0].clientY;

  // Find which item we're over
  const items = selectedIntentsList.querySelectorAll(
    ".intent-item:not(.dragging)",
  );
  items.forEach((item) => {
    item.classList.remove("drop-above", "drop-below");
    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (
      touchDragState.currentY >= rect.top &&
      touchDragState.currentY <= rect.bottom
    ) {
      if (touchDragState.currentY < midY) {
        item.classList.add("drop-above");
      } else {
        item.classList.add("drop-below");
      }
    }
  });
}, { passive: false });

// Global touch end handler for intent reordering
document.addEventListener("touchend", () => {
  if (!touchDragState.draggingItem) return;

  // Find the drop target
  const targetItem = selectedIntentsList.querySelector(
    ".intent-item.drop-above, .intent-item.drop-below",
  );
  if (targetItem) {
    if (targetItem.classList.contains("drop-above")) {
      selectedIntentsList.insertBefore(touchDragState.draggingItem, targetItem);
    } else {
      selectedIntentsList.insertBefore(
        touchDragState.draggingItem,
        targetItem.nextSibling,
      );
    }
    onIntentsChange();
  }

  // Cleanup
  touchDragState.draggingItem.classList.remove("dragging");
  document.querySelectorAll(".intent-item").forEach((el) => {
    el.classList.remove("drop-above", "drop-below");
  });
  touchDragState.draggingItem = null;
});

/**
 * Initialize the reorderable intent list with default state
 */
export function initializeIntentList() {
  // Setup click handlers for available intent chips
  availableIntents.querySelectorAll(".intent-chip:not(.disabled)").forEach(
    (chip) => {
      chip.addEventListener("click", () => {
        const intent = chip.dataset.intent;
        if (chip.classList.contains("added")) {
          removeIntent(intent);
        } else {
          addIntent(intent);
        }
      });
    },
  );

  // Setup initial PAY intent item (already in HTML)
  const initialItem = selectedIntentsList.querySelector(".intent-item");
  if (initialItem) {
    setupIntentItemDragListeners(initialItem);
    initialItem.querySelector(".intent-remove").addEventListener(
      "click",
      () => {
        removeIntent(initialItem.dataset.intent);
      },
    );

    // Mark PAY chip as added
    const payChip = availableIntents.querySelector('[data-intent="PAY"]');
    if (payChip) {
      payChip.classList.add("added");
      payChip.textContent = "✓ PAY";
    }
  }

  // Setup drag events on the list container
  selectedIntentsList.addEventListener("dragover", (e) => {
    e.preventDefault();
    selectedIntentsList.classList.add("drag-over");
  });

  selectedIntentsList.addEventListener("dragleave", (e) => {
    if (!selectedIntentsList.contains(e.relatedTarget)) {
      selectedIntentsList.classList.remove("drag-over");
    }
  });

  selectedIntentsList.addEventListener("drop", () => {
    selectedIntentsList.classList.remove("drag-over");
  });
}

/**
 * Called when intents change (add, remove, or reorder)
 */
function onIntentsChange() {
  toggleFieldVisibility();
  if (onIntentsChangeCallback) {
    onIntentsChangeCallback();
  }
}

/**
 * Validate intent combinations
 * Note: Intent ordering matters for the Presentation API (e.g., ['PAY', 'SUBSCRIBE'] vs ['SUBSCRIBE', 'PAY']),
 * but does NOT affect the payment request structure. The user can drag to reorder.
 */
export function validateIntents(intents) {
  if (!intents || intents.length === 0) return true;

  // For validation, we check against sorted combinations since the actual
  // valid combinations are the same regardless of order
  const sorted = [...intents].sort().join(",");
  const validCombinations = [
    "PAY",
    "DONATE",
    "SUBSCRIBE",
    "SIGNUP",
    "SIGNIN",
    "ADD_TO_WALLET",
    "ADD_TO_WALLET,PAY",
    "DONATE,SIGNIN",
    "PAY,SIGNIN",
    "PAY,SUBSCRIBE",
  ];
  return validCombinations.includes(sorted);
}

export function toggleFieldVisibility() {
  const intents = getSelectedIntents();
  const isOnlyAddToWallet = intents && intents.length === 1 &&
    intents[0] === "ADD_TO_WALLET";
  const isOnlySignIn = intents && intents.length === 1 &&
    intents[0] === "SIGNIN";
  const isOnlySignUp = intents && intents.length === 1 &&
    intents[0] === "SIGNUP";
  const hasSubscribe = intents && intents.includes("SUBSCRIBE");

  const isValid = validateIntents(intents);
  intentWarning.classList.toggle("show", !isValid);

  amountField.style.display =
    (isOnlyAddToWallet || isOnlySignIn || isOnlySignUp) ? "none" : "grid";
  subscriptionBillingIntervalField.style.display = hasSubscribe
    ? "grid"
    : "none";
  subscriptionBillingIntervalFrequencyField.style.display = hasSubscribe
    ? "grid"
    : "none";
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateReference(prefix) {
  return `${prefix}${new Date().toISOString()}`;
}

export function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================================
// INTEROPERABILITY OPTIONS VISIBILITY
// ============================================================================

import { currentAuthMode } from "./state.js";

/**
 * Update interoperability options visibility based on country and auth mode
 * Interoperability flows are only available for Acquiring Partners AND US market
 */
export function updateInteroperabilityOptionsVisibility() {
  const isUS = countrySel?.value?.toUpperCase() === "US";
  const isAcquiringPartner = currentAuthMode === "ACQUIRING_PARTNER";
  const shouldShow = isUS && isAcquiringPartner;

  const interopOptions = document.querySelectorAll(
    "#advanced-flow .acquiring-partner-only",
  );
  interopOptions.forEach((option) => {
    option.style.display = shouldShow ? "" : "none";
    // If current selection is an interop option and we should hide it, reset to default
    if (
      !shouldShow && advancedFlowSel && advancedFlowSel.value === option.value
    ) {
      advancedFlowSel.value = "";
      // Also unlock the amount field if it was locked
      unlockAmountField();
    }
  });
}

/**
 * Handle KLARNA_EXPRESS_CHECKOUT specific behavior
 */
export function handleExpressCheckoutAmountLock() {
  if (advancedFlowSel?.value === "KLARNA_EXPRESS_CHECKOUT") {
    // Lock amount to 50000 (minor unit = $500.00)
    amountInput.value = "50000";
    amountInput.disabled = true;
    amountInput.classList.add("locked");
  } else {
    unlockAmountField();
  }
}

/**
 * Unlock the amount field
 */
export function unlockAmountField() {
  if (amountInput.disabled) {
    amountInput.disabled = false;
    amountInput.classList.remove("locked");
  }
}

/**
 * Get the current country (normalized to uppercase)
 */
export function getCurrentCountry() {
  return countrySel?.value?.toUpperCase() || null;
}