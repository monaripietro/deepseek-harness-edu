import { el } from '../utils/dom.js';

const LABELS = {
  user_message: '✍️ Messaggio utente',
  runtime_notes_added: '📝 Note runtime aggiunte',
  system_prompt_assembled: '🧩 System prompt assemblato',
  model_request_prepared: '→ Richiesta al modello preparata',
  model_response_received: '← Risposta del modello ricevuta',
  tool_call_suggested: '🔧 Tool chiamato dal modello',
  tool_result_added: '📥 Risultato del tool aggiunto al contesto',
  next_step_prepared: '⏭️ Step successivo preparato',
  task_completed: '✅ Task completato',
  model_request_failed: '❌ Richiesta fallita',
};

export function TraceTimeline(session) {
  const root = document.getElementById('trace-timeline');
  root.innerHTML = '';
  const list = el('div', { class: 'timeline' });
  const exportBtn = el('button', { class: 'btn btn-small' }, 'Esporta log (JSON, senza chiave)');
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ events: session.log.events }, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'edu-harness-log.json' });
    a.click();
  });
  root.append(el('p', { class: 'micro' }, '⏱️ Questa timeline mostra i passaggi del mini-harness, in ordine cronologico. La chiave API non compare mai.'), exportBtn, list);

  function render() {
    list.innerHTML = '';
    if (session.log.events.length === 0) {
      list.append(el('p', { class: 'micro' }, 'Nessun evento: invia una richiesta per vedere il mini-harness al lavoro.'));
      return;
    }
    for (const ev of session.log.events) {
      list.append(
        el('div', { class: `event event-${ev.type}` }, [
          el('div', { class: 'row between' }, [
            el('strong', {}, LABELS[ev.type] ?? ev.type),
            el('span', { class: 'muted' }, `#${ev.id} · ${ev.timestampLocal}`),
          ]),
          summarize(ev),
        ]),
      );
    }
  }
  render();
  return { render };
}

function summarize(ev) {
  const p = ev.payload ?? {};
  switch (ev.type) {
    case 'user_message':
      return el('pre', { class: 'snippet' }, p.text);
    case 'system_prompt_assembled':
      return el('div', { class: 'muted' }, `${p.sections?.length ?? 0} sezioni attive`);
    case 'model_request_prepared':
      return el('div', { class: 'muted' }, `step ${p.step}: ${p.messageCount} messaggi, ${p.toolCount} tool`);
    case 'model_response_received':
      return el('pre', { class: 'snippet' }, (p.text || '(nessun testo)').slice(0, 200));
    case 'tool_call_suggested':
      return el('pre', { class: 'snippet' }, `${p.name}(${JSON.stringify(p.arguments)})`);
    case 'tool_result_added':
      return el('pre', { class: 'snippet' }, JSON.stringify(p.result).slice(0, 200));
    default:
      return null;
  }
}
