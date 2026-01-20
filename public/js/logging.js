/**
 * Logging functions for the Klarna Payment Selector Demo
 */

import { apiLogContent, sdkLogContent } from "./dom.js";

// ============================================================================
// JSON SYNTAX HIGHLIGHTING
// ============================================================================

/**
 * Syntax highlight JSON for dark theme display
 */
export function syntaxHighlightJson(json) {
  if (typeof json !== "string") {
    json = JSON.stringify(json, null, 2);
  }
  // Escape HTML entities
  json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  );

  // Apply syntax highlighting with colors optimized for dark background
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = "json-number"; // numbers
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "json-key"; // keys
        } else {
          cls = "json-string"; // string values
        }
      } else if (/true|false/.test(match)) {
        cls = "json-boolean"; // booleans
      } else if (/null/.test(match)) {
        cls = "json-null"; // null
      }
      return '<span class="' + cls + '">' + match + "</span>";
    },
  );
}

// ============================================================================
// LOG PANEL FUNCTIONS
// ============================================================================

/**
 * Log an SDK event to the SDK selector log panel
 */
export function logSdkEvent(title, data, type = "") {
  // Skip logging if log panel doesn't exist (e.g., on product page)
  if (!sdkLogContent) return;

  const placeholder = sdkLogContent.querySelector(".log-placeholder");
  if (placeholder) placeholder.remove();

  const entry = document.createElement("div");
  entry.className = `log-entry sdk-event ${type}`;
  entry.innerHTML = `
    <div class="log-entry-header">
      <div class="log-entry-header-left">
        <span class="log-entry-collapse-icon collapsed">▼</span>
        <span class="log-entry-title">${title}</span>
        <span class="log-entry-badge sdk">SDK Event</span>
      </div>
      <span class="log-entry-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="log-entry-body collapsed">
      <pre>${syntaxHighlightJson(data)}</pre>
    </div>
  `;

  // Add collapse toggle functionality
  const header = entry.querySelector(".log-entry-header");
  const body = entry.querySelector(".log-entry-body");
  const icon = entry.querySelector(".log-entry-collapse-icon");
  header.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    icon.classList.toggle("collapsed");
  });

  sdkLogContent.insertBefore(entry, sdkLogContent.firstChild);
}

export function clearSdkLog() {
  if (!sdkLogContent) return;
  sdkLogContent.innerHTML =
    '<p class="log-placeholder">SDK events and backend calls will appear here...</p>';
}

export function clearApiLog() {
  if (!apiLogContent) return;
  apiLogContent.innerHTML =
    '<p class="log-placeholder">Backend calls will appear here...</p>';
}

// ============================================================================
// BACKEND LOGGING
// ============================================================================

/**
 * Log a backend API call to the specified log panel
 * @param {Object} request - Request metadata
 * @param {Object} response - Response metadata
 * @param {string} status - Response status
 * @param {string} endpoint - API endpoint name
 * @param {string} target - Which log panel to target: 'sdk' or 'api'
 */
export function logBackendCall(
  request,
  response,
  status,
  endpoint = "payment/authorize",
  target = "sdk",
) {
  const logContent = target === "api" ? apiLogContent : sdkLogContent;
  // Skip logging if log panel doesn't exist (e.g., on product page)
  if (!logContent) return;

  const placeholder = logContent.querySelector(".log-placeholder");
  if (placeholder) placeholder.remove();

  const statusClass =
    status === "APPROVED" || status === "OK" || status === "CREATED" ||
      status === "COMPLETED"
      ? "success"
      : (status === "DECLINED" || status === "ERROR")
      ? "error"
      : "";

  const entry = document.createElement("div");
  entry.className = `log-entry backend ${statusClass}`;

  // Determine HTTP method (from metadata or default based on endpoint)
  const method = request.method ||
    (endpoint === "payment/presentation" ? "GET" : "POST");

  // Build request section
  const authModeLabel = "👤 Sub Partner";
  let requestHtml = `
    <div class="backend-log-section">
      <div class="backend-log-label">Request <span class="auth-mode-indicator">${authModeLabel}</span></div>
      <div class="backend-log-url">${method} ${request.url}</div>
  `;

  // Show Klarna-Network-Session-Token header if present
  if (request.klarnaNetworkSessionToken) {
    requestHtml +=
      `<div class="backend-log-header">Klarna-Network-Session-Token: ${request.klarnaNetworkSessionToken}</div>`;
  }

  // Show Klarna-Customer-Token header if used (for tokenized payments)
  if (request.klarnaCustomerToken) {
    requestHtml +=
      `<div class="backend-log-header customer-token">Klarna-Customer-Token: ${request.klarnaCustomerToken}</div>`;
  }

  // Show Klarna-Interoperability-Token header if used (for interoperability flows)
  if (request.klarnaInteroperabilityToken) {
    requestHtml +=
      `<div class="backend-log-header interop-token">Klarna-Interoperability-Token: ${request.klarnaInteroperabilityToken}</div>`;
  }

  // Show request body for POST (GET requests don't have a body - query params are already in the URL)
  if (
    method === "POST" && request.requestBody &&
    Object.keys(request.requestBody).length > 0
  ) {
    requestHtml += `<pre>${
      syntaxHighlightJson(request.requestBody)
    }</pre></div>`;
  } else {
    requestHtml += `</div>`;
  }

  // Build response section - show mTLS badge only if klarna-mtls-verification-status is VALID
  // Parse first value in case of duplicated headers (e.g., "VALID, VALID")
  const mtlsStatus = response.mtlsVerificationStatus?.split(",")[0]?.trim()
    .toUpperCase();
  const mtlsVerified = mtlsStatus === "VALID";
  let responseHtml = `
    <div class="backend-log-section">
      <div class="backend-log-label">Response (${status})${
    mtlsVerified ? ' <span class="mtls-indicator">🔐 mTLS Verified</span>' : ""
  }</div>
  `;

  if (response.correlationId) {
    responseHtml +=
      `<div class="backend-log-header">klarna-correlation-id: ${response.correlationId}</div>`;
  }

  responseHtml += `<pre>${
    syntaxHighlightJson(response.responseBody)
  }</pre></div>`;

  entry.innerHTML = `
    <div class="log-entry-header">
      <div class="log-entry-header-left">
        <span class="log-entry-collapse-icon collapsed">▼</span>
        <span class="log-entry-title">${endpoint}</span>
        <span class="log-entry-badge backend">Backend</span>
      </div>
      <span class="log-entry-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="log-entry-body collapsed">
      ${requestHtml}
      ${responseHtml}
    </div>
  `;

  // Add collapse toggle functionality
  const header = entry.querySelector(".log-entry-header");
  const body = entry.querySelector(".log-entry-body");
  const icon = entry.querySelector(".log-entry-collapse-icon");
  header.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    icon.classList.toggle("collapsed");
  });

  logContent.insertBefore(entry, logContent.firstChild);
}

/**
 * Log a backend error to the specified log panel
 * @param {string} message - Error message
 * @param {string} target - Which log panel to target: 'sdk' or 'api'
 */
export function logBackendError(message, target = "sdk") {
  const logContent = target === "api" ? apiLogContent : sdkLogContent;
  // Skip logging if log panel doesn't exist (e.g., on product page)
  if (!logContent) return;

  const placeholder = logContent.querySelector(".log-placeholder");
  if (placeholder) placeholder.remove();

  const entry = document.createElement("div");
  entry.className = "log-entry backend error";
  entry.innerHTML = `
    <div class="log-entry-header">
      <div class="log-entry-header-left">
        <span class="log-entry-collapse-icon collapsed">▼</span>
        <span class="log-entry-title">Error</span>
        <span class="log-entry-badge backend">Backend</span>
      </div>
      <span class="log-entry-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="log-entry-body collapsed">
      <pre>${message}</pre>
    </div>
  `;

  // Add collapse toggle functionality
  const header = entry.querySelector(".log-entry-header");
  const body = entry.querySelector(".log-entry-body");
  const icon = entry.querySelector(".log-entry-collapse-icon");
  header.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    icon.classList.toggle("collapsed");
  });

  logContent.insertBefore(entry, logContent.firstChild);
}
