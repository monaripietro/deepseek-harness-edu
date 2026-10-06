import { el } from '../utils/dom.js';

export function HarnessSectionsPanel(session, onChange) {
  const root = document.getElementById('harness-sections');
  root.innerHTML = '';

  root.append(el('p', { class: 'micro' }, '🧩 Queste sono istruzioni aggiunte dal sistema (l\u2019harness). Attivale, disattivale o modificale: cambieranno il prompt finale.'));

  const list = el('div', { class: 'sections-list' });
  root.append(list);

  function render() {
    list.innerHTML = '';
    const sorted = session.sections.slice().sort((a, b) => a.order - b.order);
    for (const s of sorted) {
      const chk = el('input', { type: 'checkbox' });
      chk.checked = s.enabled;
      chk.addEventListener('change', () => { s.enabled = chk.checked; onChange(); });
      const ta = el('textarea', { rows: 2 });
      ta.value = s.content;
      ta.addEventListener('input', () => { s.content = ta.value; onChange(); });
      list.append(
        el('div', { class: `section-card ${s.enabled ? 'on' : 'off'}` }, [
          el('div', { class: 'row between' }, [
            el('label', { class: 'inline-label' }, [chk, ` ${s.title} (order ${s.order})`]),
            el('code', {}, s.id),
          ]),
          ta,
        ]),
      );
    }
  }
  render();
  return { render };
}
