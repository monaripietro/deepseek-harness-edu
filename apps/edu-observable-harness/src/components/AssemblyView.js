import { el, pretty, copyText } from '../utils/dom.js';
import { assembleSystemPrompt } from '../core/promptAssembler.js';
import { activeToolSchemas } from '../core/toolSchemaRegistry.js';

export function AssemblyView(session, getState) {
  const root = document.getElementById('assembly-view');
  root.innerHTML = '';

  root.append(el('p', { class: 'micro' }, '📦 Questo è ciò che il modello riceve davvero: system prompt + messaggi + tool schemas. Le parti aggiunte dall\u2019harness sono evidenziate.'));

  const mode = el('select', {}, [el('option', { value: 'simple' }, 'Modalità semplice'), el('option', { value: 'advanced' }, 'Modalità avanzata (JSON)')]);
  const copyBtn = el('button', { class: 'btn btn-small' }, 'Copia payload');
  const out = el('div', { class: 'assembly-out' });
  root.append(el('div', { class: 'row between' }, [mode, copyBtn]), out);

  copyBtn.addEventListener('click', async () => {
    copyBtn.textContent = (await copyText(currentJson())) ? 'Copiato ✓' : 'Errore';
    setTimeout(() => (copyBtn.textContent = 'Copia payload'), 1500);
  });
  mode.addEventListener('change', render);

  let payload = null;

  function currentJson() {
    return JSON.stringify(payload, null, 2);
  }

  function render() {
    const state = getState();
    const assembled = assembleSystemPrompt(session.sections);
    const tools = activeToolSchemas(session.tools);
    const messages = [];
    if (assembled.text) messages.push({ role: 'system', content: assembled.text, origin: 'harness' });
    if (session.runtimeNotes.trim()) messages.push({ role: 'system', content: `Runtime notes:\n${session.runtimeNotes}`, origin: 'harness' });
    if (session.userPrompt.trim()) messages.push({ role: 'user', content: session.userPrompt, origin: 'user' });
    payload = { model: state.provider.model, messages: messages.map(({ origin, ...m }) => m), tools };

    out.innerHTML = '';
    if (mode.value === 'simple') {
      out.append(
        assembled.text
          ? el('div', { class: 'msg harness' }, [el('div', { class: 'msg-tag' }, 'system — aggiunto dall\u2019harness'), el('pre', {}, assembled.text)])
          : el('p', { class: 'micro' }, 'Nessuna sezione harness attiva: il modello riceverebbe solo il tuo prompt.'),
        session.runtimeNotes.trim() ? el('div', { class: 'msg harness' }, [el('div', { class: 'msg-tag' }, 'note runtime — harness'), el('pre', {}, session.runtimeNotes)]) : null,
        el('div', { class: 'msg user' }, [el('div', { class: 'msg-tag' }, 'user — scritto da te'), el('pre', {}, session.userPrompt || '(vuoto)')]),
        tools.length ? el('div', { class: 'msg harness' }, [el('div', { class: 'msg-tag' }, `tools — ${tools.length} schema aggiunti dall\u2019harness`), el('pre', { class: 'json' }, pretty(tools))]) : null,
      );
    } else {
      out.append(el('pre', { class: 'json' }, pretty(payload)));
    }
  }
  render();
  return { render };
}
