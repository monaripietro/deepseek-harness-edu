import { createSession, startTask } from './state/sessionState.js';
import { createApiKeyStore } from './state/apiKeyStore.js';
import { ApiKeyPanel } from './components/ApiKeyPanel.js';
import { PromptEditor } from './components/PromptEditor.js';
import { HarnessSectionsPanel } from './components/HarnessSectionsPanel.js';
import { ToolPanel } from './components/ToolPanel.js';
import { AssemblyView } from './components/AssemblyView.js';
import { TraceTimeline } from './components/TraceTimeline.js';
import { ResponsePanel, renderStep } from './components/ResponsePanel.js';
import { CompareView } from './components/CompareView.js';
import { runTask } from './core/runStep.js';
import { callOpenAICompatible } from './providers/openaiCompatibleClient.js';
import { el } from './utils/dom.js';

const session = createSession();
const keyStore = createApiKeyStore();
const state = { provider: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' } };

const apiKeyPanel = ApiKeyPanel(keyStore, (p) => { state.provider = p; });
const promptEditor = PromptEditor(session, refresh);
const sectionsPanel = HarnessSectionsPanel(session, refresh);
const toolPanel = ToolPanel(session, refresh);
const assemblyView = AssemblyView(session, () => state);
const traceTimeline = TraceTimeline(session);
const responsePanel = ResponsePanel();
CompareView({
  getApiKey: () => keyStore.value,
  getProvider: () => state.provider,
  callModel: callOpenAICompatible,
  getUserPrompt: () => promptEditor.getUserPrompt(),
  getRuntimeNotes: () => promptEditor.getRuntimeNotes(),
  session,
});

function refresh() {
  sectionsPanel.render();
  toolPanel.render();
  assemblyView.render();
}

const runBtn = document.getElementById('run-btn');
const resetBtn = document.getElementById('reset-btn');
const status = document.getElementById('status');

runBtn.addEventListener('click', async () => {
  const apiKey = keyStore.value;
  const userPrompt = promptEditor.getUserPrompt().trim();
  if (!apiKey) { alert('Inserisci la chiave API nel pannello di configurazione.'); apiKeyPanel.focusKey(); return; }
  if (!userPrompt) { alert('Scrivi un prompt utente.'); return; }

  runBtn.disabled = true;
  status.textContent = 'In esecuzione...';
  responsePanel.clear();

  startTask(session, { userPrompt, runtimeNotes: promptEditor.getRuntimeNotes() });
  session.callModel = (payload) =>
    callOpenAICompatible({
      baseUrl: state.provider.baseUrl,
      model: state.provider.model,
      apiKey,
      messages: payload.messages.map(({ origin, ...m }) => m),
      tools: payload.tools,
    });

  try {
    await runTask(session, (kind, data) => {
      if (kind === 'step-prepared') responsePanel.render(el('div', {}, []));
      if (kind === 'step-response') responsePanel.render(renderStep(data.stepIndex, null, data.response));
      if (kind === 'tool-executed') responsePanel.render(renderStep(data.stepIndex, null, null, true));
      if (kind === 'step-failed') responsePanel.render(el('div', { class: 'security-warning' }, `Errore: ${data.error}`));
      traceTimeline.render();
    });
    if (session.log.events.at(-1)?.type === 'task_completed') status.textContent = 'Task completato.';
    else status.textContent = 'Task interrotto (vedi timeline).';
  } finally {
    runBtn.disabled = false;
    traceTimeline.render();
  }
});

resetBtn.addEventListener('click', () => {
  session.log.reset();
  session.task = null;
  session.steps = [];
  responsePanel.clear();
  traceTimeline.render();
  status.textContent = 'Sessione azzerata (la chiave resta in memoria; usa "Cancella chiave" per rimuoverla).';
});
