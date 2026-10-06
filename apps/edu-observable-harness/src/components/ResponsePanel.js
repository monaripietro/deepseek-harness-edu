import { el } from '../utils/dom.js';

export function ResponsePanel() {
  const root = document.getElementById('response-panel');
  root.innerHTML = '';
  const out = el('div', {});
  root.append(el('p', { class: 'micro' }, '💬 Risposta del modello e passaggi del task (1 task = 1 o più step).'), out);

  function render(event) {
    if (event) out.append(event);
  }
  function clear() {
    out.innerHTML = '';
  }
  return { render, clear };
}

export function renderStep(stepIndex, payload, response, toolsUsed) {
  const wrap = el('div', { class: 'step-card' }, [
    el('h4', {}, `Step ${stepIndex}`),
  ]);
  if (payload) wrap.append(el('div', { class: 'muted micro' }, `→ ${payload.messages.length} messaggi, ${payload.tools.length} tool`));
  if (response) {
    if (response.text) wrap.append(el('div', { class: 'msg model' }, [el('div', { class: 'msg-tag' }, 'risposta del modello'), el('pre', {}, response.text)]));
    for (const tc of response.toolCalls ?? []) {
      wrap.append(el('div', { class: 'msg tool' }, [el('div', { class: 'msg-tag' }, `il modello chiede il tool ${tc.name}`), el('pre', { class: 'snippet' }, JSON.stringify(tc.arguments))]));
    }
  }
  return wrap;
}
