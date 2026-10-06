import { el, pretty } from '../utils/dom.js';

export function ToolPanel(session, onChange) {
  const root = document.getElementById('tool-panel');
  root.innerHTML = '';

  root.append(el('p', { class: 'micro' }, '🔧 Un harness non dà al modello solo nomi di tool: gli mostra descrizioni e parametri (JSON schema). Questi tool sono mock: nessuna azione reale.'));

  const list = el('div', {});
  root.append(list);

  function render() {
    list.innerHTML = '';
    for (const t of session.tools) {
      const chk = el('input', { type: 'checkbox' });
      chk.checked = t.enabled;
      chk.addEventListener('change', () => { t.enabled = chk.checked; onChange(); });
      const details = el('details', {}, [
        el('summary', {}, 'JSON inviato al modello'),
        el('pre', { class: 'json' }, pretty({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        t.mockResult ? el('details', {}, [el('summary', {}, 'Risultato mock'), el('pre', { class: 'json' }, pretty(t.mockResult))]) : null,
      ]);
      list.append(
        el('div', { class: `tool-card ${t.enabled ? 'on' : 'off'}` }, [
          el('div', { class: 'row between' }, [
            el('label', { class: 'inline-label' }, [chk, ` ${t.name}`]),
            el('code', {}, t.mockResultStrategy),
          ]),
          el('p', { class: 'micro' }, t.description),
          details,
        ]),
      );
    }
  }
  render();
  return { render };
}
