/**
 * Constants and mappings for the Klarna Payment Selector Demo
 */

// API base URL (same origin for Val Town)
export const API_BASE = window.location.origin;

// Country to currency and locale mapping
export const COUNTRY_MAPPING = {
  AT: { currency: "EUR", locales: ["de-AT", "en-AT"] },
  AU: { currency: "AUD", locales: ["en-AU"] },
  BE: { currency: "EUR", locales: ["nl-BE", "fr-BE", "en-BE"] },
  CA: { currency: "CAD", locales: ["en-CA", "fr-CA"] },
  CH: { currency: "CHF", locales: ["de-CH", "fr-CH", "it-CH", "en-CH"] },
  CZ: { currency: "CZK", locales: ["cs-CZ", "en-CZ"] },
  DE: { currency: "EUR", locales: ["de-DE", "en-DE"] },
  DK: { currency: "DKK", locales: ["da-DK", "en-DK"] },
  ES: { currency: "EUR", locales: ["es-ES", "en-ES"] },
  FI: { currency: "EUR", locales: ["fi-FI", "sv-FI", "en-FI"] },
  FR: { currency: "EUR", locales: ["fr-FR", "en-FR"] },
  GB: { currency: "GBP", locales: ["en-GB"] },
  GR: { currency: "EUR", locales: ["el-GR", "en-GR"] },
  HU: { currency: "HUF", locales: ["hu-HU", "en-HU"] },
  IE: { currency: "EUR", locales: ["en-IE"] },
  IT: { currency: "EUR", locales: ["it-IT", "en-IT"] },
  MX: { currency: "MXN", locales: ["en-MX", "es-MX"] },
  NL: { currency: "EUR", locales: ["nl-NL", "en-NL"] },
  NO: { currency: "NOK", locales: ["nb-NO", "en-NO"] },
  NZ: { currency: "NZD", locales: ["en-NZ"] },
  PL: { currency: "PLN", locales: ["pl-PL", "en-PL"] },
  PT: { currency: "EUR", locales: ["pt-PT", "en-PT"] },
  RO: { currency: "RON", locales: ["ro-RO", "en-RO"] },
  SE: { currency: "SEK", locales: ["sv-SE", "en-SE"] },
  SK: { currency: "EUR", locales: ["sk-SK", "en-SK"] },
  US: { currency: "USD", locales: ["en-US", "es-US"] },
};