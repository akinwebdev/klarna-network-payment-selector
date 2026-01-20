/**
 * Persistent Flow Logger
 * Stores logs in localStorage and displays them in a visual panel
 * Persists across page reloads
 */

const STORAGE_KEY = 'klarna_payment_flow_logs';
const MAX_LOGS = 200; // Maximum number of logs to keep

// Initialize log panel
function initLogPanel() {
  // Check if panel already exists
  if (document.getElementById('flow-logger-panel')) {
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'flow-logger-panel';
  panel.className = 'hidden'; // Hidden by default, shown when log icon is clicked
  panel.innerHTML = `
    <div class="flow-logger-header">
      <h3>Payment Flow Logs</h3>
      <div class="flow-logger-controls">
        <button id="flow-logger-clear" class="flow-logger-btn">Clear</button>
        <button id="flow-logger-export" class="flow-logger-btn">Export</button>
      </div>
    </div>
    <div class="flow-logger-content" id="flow-logger-content">
      <div class="flow-logger-empty">No logs yet. Start a payment flow to see logs here.</div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Add styles
  if (!document.getElementById('flow-logger-styles')) {
    const style = document.createElement('style');
    style.id = 'flow-logger-styles';
    style.textContent = `
      #flow-logger-panel {
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 600px;
        max-width: calc(100vw - 40px);
        max-height: 500px;
        background: white;
        border: 1px solid #E0E0E0;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        font-family: 'Klarna Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
      }
      
      #flow-logger-panel.hidden {
        display: none;
      }
      
      .flow-logger-header {
        padding: 12px 16px;
        border-bottom: 1px solid #E0E0E0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #F9F8F5;
      }
      
      .flow-logger-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #0B051D;
      }
      
      .flow-logger-controls {
        display: flex;
        gap: 8px;
      }
      
      .flow-logger-btn {
        padding: 4px 12px;
        border: 1px solid #E0E0E0;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 11px;
        color: #0B051D;
        transition: all 0.2s;
      }
      
      .flow-logger-btn:hover {
        background: #F5F5F5;
        border-color: #D0D0D0;
      }
      
      .flow-logger-content {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        background: #FAFAFA;
      }
      
      .flow-logger-empty {
        padding: 20px;
        text-align: center;
        color: #999;
        font-size: 12px;
      }
      
      .flow-log-entry {
        margin-bottom: 8px;
        padding: 10px;
        background: white;
        border-left: 3px solid #E0E0E0;
        border-radius: 4px;
        font-size: 11px;
        line-height: 1.4;
      }
      
      .flow-log-entry.request {
        border-left-color: #0066FF;
      }
      
      .flow-log-entry.response {
        border-left-color: #00AA44;
      }
      
      .flow-log-entry.event {
        border-left-color: #FF9900;
      }
      
      .flow-log-entry.error {
        border-left-color: #FF3333;
      }
      
      .flow-log-entry.info {
        border-left-color: #6666FF;
      }
      
      .flow-log-time {
        color: #999;
        font-size: 10px;
        margin-bottom: 4px;
      }
      
      .flow-log-title {
        font-weight: 600;
        color: #0B051D;
        margin-bottom: 4px;
      }
      
      .flow-log-data {
        margin-top: 6px;
        padding: 8px;
        background: #F9F9F9;
        border-radius: 4px;
        font-family: 'Klarna Mono', monospace;
        font-size: 10px;
        overflow-x: auto;
        max-height: 200px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
      
      .flow-log-data.collapsed {
        max-height: 50px;
        overflow: hidden;
      }
      
      .flow-log-toggle-data {
        color: #0066FF;
        cursor: pointer;
        font-size: 10px;
        margin-top: 4px;
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Add event listeners
  document.getElementById('flow-logger-clear').addEventListener('click', clearLogs);
  document.getElementById('flow-logger-export').addEventListener('click', exportLogs);
  
  // Load existing logs
  loadAndDisplayLogs();
}

// Get logs from localStorage
function getLogs() {
  try {
    const logsJson = localStorage.getItem(STORAGE_KEY);
    return logsJson ? JSON.parse(logsJson) : [];
  } catch (e) {
    console.error('Error reading logs from localStorage:', e);
    return [];
  }
}

// Save logs to localStorage
function saveLogs(logs) {
  try {
    // Keep only the last MAX_LOGS entries
    const trimmedLogs = logs.slice(-MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedLogs));
  } catch (e) {
    console.error('Error saving logs to localStorage:', e);
  }
}

// Add a log entry
export function logFlow(type, title, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    type: type, // 'request', 'response', 'event', 'error', 'info'
    title: title,
    data: data
  };
  
  const logs = getLogs();
  logs.push(entry);
  saveLogs(logs);
  
  // Update display if panel exists
  if (document.getElementById('flow-logger-content')) {
    addLogEntryToDisplay(entry);
  }
  
  // Also log to console for immediate visibility
  const consoleMethod = type === 'error' ? 'error' : 'log';
  console[consoleMethod](`[${type.toUpperCase()}] ${title}`, data || '');
}

// Add log entry to display
function addLogEntryToDisplay(entry) {
  const content = document.getElementById('flow-logger-content');
  if (!content) return;
  
  // Remove empty message if present
  const empty = content.querySelector('.flow-logger-empty');
  if (empty) {
    empty.remove();
  }
  
  const logDiv = document.createElement('div');
  logDiv.className = `flow-log-entry ${entry.type}`;
  
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const dataStr = entry.data ? JSON.stringify(entry.data, null, 2) : '';
  const dataId = `log-data-${Date.now()}-${Math.random()}`;
  
  logDiv.innerHTML = `
    <div class="flow-log-time">${time}</div>
    <div class="flow-log-title">${entry.title}</div>
    ${dataStr ? `
      <div class="flow-log-data collapsed" id="${dataId}">${escapeHtml(dataStr)}</div>
      <div class="flow-log-toggle-data" onclick="toggleLogData('${dataId}')">Show/Hide Data</div>
    ` : ''}
  `;
  
  content.appendChild(logDiv);
  
  // Auto-scroll to bottom
  content.scrollTop = content.scrollHeight;
}

// Toggle data visibility
window.toggleLogData = function(dataId) {
  const dataEl = document.getElementById(dataId);
  if (dataEl) {
    dataEl.classList.toggle('collapsed');
  }
};

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load and display all logs
function loadAndDisplayLogs() {
  const content = document.getElementById('flow-logger-content');
  if (!content) return;
  
  content.innerHTML = '';
  
  const logs = getLogs();
  if (logs.length === 0) {
    content.innerHTML = '<div class="flow-logger-empty">No logs yet. Start a payment flow to see logs here.</div>';
    return;
  }
  
  logs.forEach(entry => {
    addLogEntryToDisplay(entry);
  });
  
  // Scroll to bottom
  content.scrollTop = content.scrollHeight;
}

// Clear logs
function clearLogs() {
  if (confirm('Clear all flow logs?')) {
    localStorage.removeItem(STORAGE_KEY);
    loadAndDisplayLogs();
  }
}

// Toggle panel visibility (show/hide)
export function toggleLogPanelVisibility() {
  const panel = document.getElementById('flow-logger-panel');
  if (panel) {
    panel.classList.toggle('hidden');
  }
}

// Expose to window for easy access from HTML
window.toggleLogPanelVisibility = toggleLogPanelVisibility;


// Export logs
function exportLogs() {
  const logs = getLogs();
  const dataStr = JSON.stringify(logs, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `klarna-flow-logs-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// Initialize on page load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogPanel);
  } else {
    initLogPanel();
  }
}
