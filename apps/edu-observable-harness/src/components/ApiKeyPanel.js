import { DEFAULT_PROVIDERS } from '../config/defaultConfig.js';
import { el } from '../utils/dom.js';

export function ApiKeyPanel(store, onChange) {
  const root = document.getElementById('api-key-panel');
  root.innerHTML = '';

  const warning = el('div', { class: 'security-warning' }, [
    el('strong', {}, '⚠️ Sicurezza: '),
    'in un\u2019app solo front-end la chiave API NON può essere realmente protetta: resta nel browser e può essere letta da script della pagina o estensioni. Usa una chiave dedicata con budget basso. La chiave non viene mai loggata né salvata nel repo.',
  ]);

  const providerSelect = el('select', { id: 'cfg-provider' }, DEFAULT_PROVIDERS.map((p, i) => el('option', { value: i }, `${p.label} (${p.model})`)));

  const baseUrl = el('input', { id: 'cfg-base-url', type: 'text', value: DEFAULT_PROVIDERS[0].baseUrl, placeholder: 'https://.../v1' });
  const model = el('input', { id: 'cfg-model', type: 'text', value: DEFAULT_PROVIDERS[0].model, placeholder: 'model name' });

  const apiKey = el('input', { id: 'cfg-api-key', type: 'password', placeholder: 'sk-...', autocomplete: 'off' });
  const toggleVisibility = el('button', { type: 'button', class: 'btn btn-small' }, 'Mostra');
  toggleVisibility.addEventListener('click', () => {
    const show = apiKey.type === 'password';
    apiKey.type = show ? 'text' : 'password';
    toggleVisibility.textContent = show ? 'Nascondi' : 'Mostra';
  });

  const persist = el('input', { id: 'cfg-persist', type: 'checkbox' });
  const persistLabel = el('label', { class: 'inline-label' }, [persist, ' Ricorda su questo browser (localStorage)']);
  const clearBtn = el('button', { type: 'button', class: 'btn btn-danger' }, 'Cancella chiave');

  providerSelect.addEventListener('change', () => {
    const p = DEFAULT_PROVIDERS[Number(providerSelect.value)];
    baseUrl.value = p.baseUrl;
    model.value = p.model;
    notify();
  });
  const notify = () => onChange({ label: DEFAULT_PROVIDERS[Number(providerSelect.value)].label, baseUrl: baseUrl.value.trim(), model: model.value.trim() });

  persist.addEventListener('change', () => {
    if (persist.checked && !confirm('Salvare la chiave API in localStorage di questo browser? È meno sicuro della sola memoria.')) {
      persist.checked = false;
      return;
    }
    store.set(apiKey.value.trim(), { persist: persist.checked });
  });
  apiKey.addEventListener('input', () => store.set(apiKey.value.trim(), { persist: persist.checked }));
  clearBtn.addEventListener('click', () => {
    store.clear();
    apiKey.value = '';
    persist.checked = false;
  });
  [baseUrl, model].forEach((i) => i.addEventListener('input', notify));

  root.append(
    el('p', { class: 'micro' }, 'Configura il provider e incolla la tua chiave API. La chiave resta nel browser.'),
    warning,
    el('div', { class: 'form-grid' }, [
      el('label', {}, 'Provider'), providerSelect,
      el('label', {}, 'Base URL'), baseUrl,
      el('label', {}, 'Modello'), model,
      el('label', {}, 'API key'), el('div', { class: 'row' }, [apiKey, toggleVisibility]),
    ]),
    el('div', { class: 'row gap' }, [persistLabel, clearBtn]),
  );

  return { getProvider: notify, getApiKey: () => apiKey.value.trim(), focusKey: () => apiKey.focus() };
}
