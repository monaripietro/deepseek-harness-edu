import { el } from '../utils/dom.js';

export function CompareView({ getApiKey, getProvider, callModel, getUserPrompt, getRuntimeNotes, session }) {
  const root = document.getElementById('compare-view');
  root.innerHTML = '';

  root.append(el('p', { class: 'micro' }, '⚖️ Stessa domanda, stesso modello: a sinistra il prompt "nudo" (solo il tuo testo), a destra il prompt mediato dall\u2019harness (system prompt + tool).'));

  const leftPayload = el('pre', { class: 'json small' });
  const leftOut = el('div', { class: 'msg model' });
  const rightPayload = el('pre', { class: 'json small' });
  const rightOut = el('div', { class: 'msg model' });
  const btn = el('button', { class: 'btn' }, 'Esegui confronto');

  root.append(
    el('div', { class: 'row center' }, [btn]),
    el('div', { class: 'compare-grid' }, [
      el('div', { class: 'col' }, [el('h4', {}, '1. Solo prompt utente'), leftPayload, el('h5', {}, 'Output'), leftOut]),
      el('div', { class: 'col' }, [el('h4', {}, '2. Prompt mediato dall\u2019harness'), rightPayload, el('h5', {}, 'Output'), rightOut]),
    ]),
  );

  btn.addEventListener('click', async () => {
    const apiKey = getApiKey();
    if (!apiKey) { alert('Inserisci prima la chiave API.'); return; }
    btn.disabled = true; btn.textContent = 'Esecuzione...';
    leftOut.textContent = rightOut.textContent = '';
    try {
      const userText = getUserPrompt();
      const provider = getProvider();

      const bare = { model: provider.model, messages: [{ role: 'user', content: userText }], tools: [] };
      leftPayload.textContent = JSON.stringify(bare, null, 2);
      const r1 = await callModel({ baseUrl: provider.baseUrl, model: provider.model, apiKey, messages: bare.messages, tools: undefined });
      leftOut.textContent = r1.text || '(nessun testo)';

      const assembledText = assembleText();
      const msgs = [];
      if (assembledText) msgs.push({ role: 'system', content: assembledText });
      const notes = getRuntimeNotes();
      if (notes.trim()) msgs.push({ role: 'system', content: `Runtime notes:\n${notes}` });
      msgs.push({ role: 'user', content: userText });
      const tools = activeTools();
      const rich = { model: provider.model, messages: msgs, tools };
      rightPayload.textContent = JSON.stringify(rich, null, 2);
      const r2 = await callModel({ baseUrl: provider.baseUrl, model: provider.model, apiKey, messages: msgs, tools });
      rightOut.textContent = r2.text || '(nessun testo)';
    } catch (err) {
      rightOut.textContent = `Errore: ${err.message}`;
    } finally {
      btn.disabled = false; btn.textContent = 'Esegui confronto';
    }
  });

  function assembleText() {
    return session.sections.filter((s) => s.enabled).sort((a, b) => a.order - b.order).map((s) => s.content.trim()).join('\n\n');
  }
  function activeTools() {
    return session.tools.filter((t) => t.enabled).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }
}
