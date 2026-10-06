/**
 * API key state: memory-only by default; explicit opt-in localStorage persistence.
 */

const STORAGE_KEY = 'edu-harness-api-key';

export function createApiKeyStore() {
  let apiKey = '';
  let persist = false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    apiKey = stored;
    persist = true;
  }
  return {
    get value() {
      return apiKey;
    },
    get persist() {
      return persist;
    },
    get persistedAvailable() {
      return Boolean(stored);
    },
    set(value, { persist: wantPersist } = {}) {
      apiKey = value ?? '';
      persist = Boolean(wantPersist);
      if (persist && apiKey) localStorage.setItem(STORAGE_KEY, apiKey);
      else localStorage.removeItem(STORAGE_KEY);
    },
    clear() {
      apiKey = '';
      persist = false;
      localStorage.removeItem(STORAGE_KEY);
    },
  };
}
