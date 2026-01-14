/**
 * UI helper functions for the Klarna Payment Selector Demo
 * Handles collapsible sections and clipboard functionality
 */

import { $ } from "./dom.js";

// ============================================================================
// COLLAPSIBLE SECTIONS
// ============================================================================

function setupCollapsibleSection(headerId, contentId) {
  const header = $(headerId);
  const content = $(contentId);
  if (!header || !content) return;

  const icon = header.querySelector(".collapse-icon");

  header.addEventListener("click", () => {
    const isCollapsed = content.classList.contains("collapsed");
    content.classList.toggle("collapsed", !isCollapsed);
    if (icon) icon.classList.toggle("collapsed", !isCollapsed);
  });
}

export function setupCollapsible() {
  setupCollapsibleSection(
    "#payment-config-collapse-header",
    "#payment-config-collapse-content",
  );
  setupCollapsibleSection(
    "#intents-collapse-header",
    "#intents-collapse-content",
  );
  setupCollapsibleSection(
    "#advanced-flows-collapse-header",
    "#advanced-flows-collapse-content",
  );
}

// ============================================================================
// COPY TO CLIPBOARD
// ============================================================================

export function setupCopyableElements() {
  document.querySelectorAll(".copyable").forEach((el) => {
    el.addEventListener("click", async () => {
      const text = el.textContent;
      if (!text || text === "—") return;

      try {
        await navigator.clipboard.writeText(text);
        el.classList.add("copied");
        el.title = "Copied!";

        setTimeout(() => {
          el.classList.remove("copied");
          el.title = "Click to copy";
        }, 1500);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });
  });
}

// ============================================================================
// ELEMENT VISIBILITY
// ============================================================================

export function showElement(element) {
  element.classList.remove("hidden");
  element.removeAttribute("aria-hidden");
  const input = element.querySelector("input");
  if (input) input.disabled = false;
}

export function hideElement(element) {
  element.classList.add("hidden");
  element.setAttribute("aria-hidden", "true");
  const input = element.querySelector("input");
  if (input) input.disabled = true;
}