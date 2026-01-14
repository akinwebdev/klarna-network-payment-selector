/**
 * Global state management for the Klarna Payment Selector Demo
 */

// SDK configuration loaded from backend
export let sdkConfig = null;

// Klarna SDK instance
export let klarna = null;

// Current SDK presentation
export let currentPresentation = null;

// Current API presentation
export let currentApiPresentation = null;

// Interoperability token for advanced flows
export let interoperabilityToken = null;

// SDK token for tokenized payments
export let sdkToken = null;

// Current authentication mode (SUB_PARTNER or ACQUIRING_PARTNER)
export let currentAuthMode = null;

// Available authentication modes from config
export let availableAuthModes = [];

// State setters
export function setSdkConfig(config) {
  sdkConfig = config;
}

export function setKlarna(instance) {
  klarna = instance;
}

export function setCurrentPresentation(presentation) {
  currentPresentation = presentation;
}

export function setCurrentApiPresentation(presentation) {
  currentApiPresentation = presentation;
}

export function setInteroperabilityToken(token) {
  interoperabilityToken = token;
}

export function setSdkToken(token) {
  sdkToken = token;
}

export function setCurrentAuthMode(mode) {
  currentAuthMode = mode;
}

export function setAvailableAuthModes(modes) {
  availableAuthModes = modes;
}

// Reset SDK-related state
export function resetTokens() {
  sdkToken = null;
  interoperabilityToken = null;
}