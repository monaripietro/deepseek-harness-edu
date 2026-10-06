import { el } from '../utils/dom.js';

export function PromptEditor(session, onChange) {
  const root = document.getElementById('prompt-editor');
  root.innerHTML = '';

  const userPrompt = el('textarea', { id: 'user-prompt', rows: 3, placeholder: 'Scrivi qui il tuo prompt...' });
  const runtimeNotes = el('textarea', { id: 'runtime-notes', rows: 2, placeholder: 'Note di contesto opzionali...' });

  userPrompt.addEventListener('input', () => { session.userPrompt = userPrompt.value; onChange(); });
  runtimeNotes.addEventListener('input', () => { session.runtimeNotes = runtimeNotes.value; onChange(); });

  session.userPrompt = userPrompt.value;
  session.runtimeNotes = runtimeNotes.value;

  root.append(
    el('p', { class: 'micro' }, '✏️ Questo è il testo scritto da te. L\u2019harness lo userà come punto di partenza.'),
    el('label', {}, 'Prompt utente'), userPrompt,
    el('label', {}, 'Contesto / note runtime (opzionale)'), runtimeNotes,
  );
  return { getUserPrompt: () => userPrompt.value, getRuntimeNotes: () => runtimeNotes.value };
}
