# EDU Observable Harness

Una webapp educativa, statica e osservabile, derivata concettualmente da [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Nessuna dipendenza, nessun backend: solo HTML, CSS e moduli JavaScript nativi.

## Perché esiste

> Un LLM da solo riceve testo e produce testo; un harness prepara il contesto, offre strumenti, registra eventi e decide come orchestrare i passaggi.

L'app mostra a un neofita, in modo concreto:

- come vengono assemblate le sezioni del system prompt (ordine, attivazione, rendering);
- come i tool vengono descritti al modello tramite JSON schema;
- qual è il payload finale (`messages` + `tools`) inviato al provider;
- come un task si compone di uno o più step e come ogni passaggio viene registrato in una timeline append-only;
- la differenza tra il prompt "nudo" e il prompt mediato dall'harness (modalità confronto).

I concetti e i nomi riprendono i package originali: `system-prompt` (sezioni con `order`, `enabled`, rendering), `agent-loop` (turn/step), `session` (log append-only + messaggi derivati dal log tramite una `deriveMessages()` semplificata).

## Avvio locale

Non serve alcuna build. Dal punto di vista di questo repository, aprire un server statico locale:

```sh
cd apps/edu-observable-harness
python3 -m http.server 8080
# poi apri http://localhost:8080
```

(O qualsiasi altro server di file statici; aprire `index.html` direttamente da `file://` può fallire per i moduli ES, a seconda del browser.)

## Deploy su GitHub Pages

L'app è una cartella statica; due opzioni:

1. **Pages su cartella**: in *Settings → Pages* selezionare deploy da branch e cartella, oppure creare un workflow che copi `apps/edu-observable-harness/` su Pages.
2. **Dominio custom `https://harness.monaripietro.it`**: aggiungere un file `CNAME` (contenuto `harness.monaripietro.it`) nella cartella pubblicata e configurare il DNS del dominio verso GitHub Pages.

## Architettura

```text
app.js                 wiring UI + task run
src/config/            sezioni harness e tool mock predefiniti
src/core/              promptAssembler, toolSchemaRegistry, eventLog,
                       sessionProjector (deriveMessages), runStep (task/step loop)
src/providers/         openaiCompatibleClient, providerConfig
src/state/             sessionState, apiKeyStore
src/components/        ApiKeyPanel, PromptEditor, HarnessSectionsPanel,
                       ToolPanel, AssemblyView, TraceTimeline,
                       ResponsePanel, CompareView
```

Pipeline minima: input utente → sezioni attive → tool schema attivi → payload →
eventi `system_prompt_assembled` e `model_request_prepared` → chiamata →
`model_response_received` → eventuale `tool_call_suggested` + `tool_result_added`
→ `next_step_prepared` → nuovo step (max 3).

## What this teaches about harnesses

- Il **system prompt** non è magia: è testo composto da sezioni ordinate che l'harness controlla.
- I **tool** non sono funzioni nascoste: sono schemi JSON che il modello legge e decide di usare.
- La **storia** che il modello vede è ricostruita dal log degli eventi, non da una chat "vera".
- Un **task** può richiedere più **step**: risposta → tool → risultato → risposta finale.
- La differenza tra chat grezza e harness è visibile sia nel payload sia nell'output (confronto affiancato).

## Security limitations of frontend-only BYOK apps

- La chiave API **non può essere realmente protetta** in un'app solo front-end: qualsiasi script o estensione del browser può leggerla.
- La chiave è conservata **solo in memoria** per default; la persistenza in `localStorage` è **opzionale, disattivata e richiede conferma esplicita**.
- La chiave non viene mai loggata, inclusa nella timeline, esportata nei log né committata nel repository.
- Le richieste partono solo verso il `baseUrl` del provider scelto.
- Consiglio: usa una **chiave dedicata con budget basso** e ruotala dopo l'uso.

## Scope

Tool mock only: `search_web_mock`, `read_file_mock`, `calculator_mock`, `ask_clarification_mock`. Nessuna esecuzione reale di shell, filesystem o rete da parte dell'harness.
