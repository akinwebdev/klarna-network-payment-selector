/**
 * Paytrail/Klarna credentials storage.
 * Uses both localStorage and sessionStorage so credentials persist even when
 * one storage is blocked (e.g. private browsing or strict settings).
 * Reads from localStorage first, then sessionStorage.
 */
(function () {
  var KEYS = {
    MERCHANT_ID: 'paytrail_merchant_id',
    SECRET_KEY: 'paytrail_secret_key',
    KLARNA_WEBSDK_CLIENT_ID: 'klarna_websdk_client_id',
    KLARNA_API_KEY: 'klarna_api_key',
    KLARNA_ENVIRONMENT: 'klarna_environment'
  };

  function get(key) {
    try {
      return localStorage.getItem(key) || sessionStorage.getItem(key) || null;
    } catch (e) {
      return null;
    }
  }

  function set(key, value) {
    try {
      if (value != null && value !== '') {
        localStorage.setItem(key, value);
        sessionStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }
    } catch (e) {
      try {
        if (value != null && value !== '') {
          sessionStorage.setItem(key, value);
        } else {
          sessionStorage.removeItem(key);
        }
      } catch (e2) {}
    }
  }

  function remove(key) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (e) {
      try { sessionStorage.removeItem(key); } catch (e2) {}
    }
  }

  function hasPaytrailCredentials() {
    return !!(get(KEYS.MERCHANT_ID) && get(KEYS.SECRET_KEY));
  }

  function storageAvailable() {
    var testKey = '_cred_storage_test_';
    try {
      localStorage.setItem(testKey, '1');
      var ok = localStorage.getItem(testKey) === '1';
      localStorage.removeItem(testKey);
      if (ok) return true;
    } catch (e) {}
    try {
      sessionStorage.setItem(testKey, '1');
      var ok = sessionStorage.getItem(testKey) === '1';
      sessionStorage.removeItem(testKey);
      if (ok) return true;
    } catch (e) {}
    return false;
  }

  window.CredentialStorage = {
    KEYS: KEYS,
    get: get,
    set: set,
    remove: remove,
    hasPaytrailCredentials: hasPaytrailCredentials,
    storageAvailable: storageAvailable
  };
})();
