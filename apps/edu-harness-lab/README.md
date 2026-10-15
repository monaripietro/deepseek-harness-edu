# Harness Lab — Dal modello all'agente

Webapp educativa frontend-only: parti da un piccolo modello linguistico isolato e costruisci, uno strato alla volta, l'harness che lo trasforma in un agente (istruzioni, contesto, memoria, RAG, strumenti, orchestratore, ciclo agentico, controlli, supervisione umana, MCP).

## Avvio

```sh
# dalla radice del repository
pnpm lab                 # avvia Harness Lab su http://localhost:5173

# oppure dalla cartella dell'app
cd apps/edu-harness-lab
pnpm install             # progetto autonomo: escluso dal workspace del monorepo
pnpm dev
pnpm test
pnpm build
```

Attenzione: `pnpm dsh web` avvia l'interfaccia di DeepSeek Harness (il prodotto del repository di riferimento), non Harness Lab.

## Orientarsi nel laboratorio

La vista iniziale **Flusso** mostra quattro passaggi leggibili: richiesta, contesto, modello e risposta. Le frecce indicano la direzione; gli strati attivi compaiono sotto il passaggio che utilizzano. Seleziona un elemento per aprire i dettagli. **Mappa completa** conserva il diagramma con zoom, trascinamento e animazioni.

- **Percorso**: segui i livelli numerati con Precedente e Successivo; apri Tutti i livelli per leggere l'elenco completo.
- **Prova**: modifica la richiesta, avvia il modello quando serve e leggi la conversazione senza ingrandire il diagramma. La bozza resta disponibile quando cambi scheda.
- **Cosa succede**: leggi la spiegazione dell'evento corrente e apri lo storico quando vuoi approfondire.
- **Approfondimenti in basso**: apri una scheda alla volta per esaminare il contesto ricevuto dal modello, il registro degli eventi o la conversazione con le verifiche.
- **Controlli**: raccoglie riproduzione, velocità, laboratori, regia docente, tema, presentazione e impostazioni.

In **Laboratorio**, la sezione Personalizza gli strati dell'harness permette di aggiungere o rimuovere componenti anche nella vista Flusso. I controlli e i collegamenti MCP sono disponibili su richiesta; una richiesta di approvazione apre invece il dialogo con azione, effetti e scelta Approva/Rifiuta.

## Il modello

Harness Lab usa sempre un modello linguistico **vero**, scaricato una volta da Hugging Face e poi eseguito nel browser con Transformers.js:

| Modello | Download | Dove gira |
|---|---|---|
| LFM2.5 350M (consigliato) | ~0,3 GB | CPU (WASM, multi-core), GPU se disponibile |
| Qwen3 0.6B | ~0,6 GB | CPU, GPU se disponibile |
| LFM2.5 1.2B | ~0,8 GB | solo WebGPU |

Con i modelli che ragionano (Qwen3, Gemma 4 e i modelli OpenRouter che lo supportano) il livello di ragionamento si sceglie nella finestra del modello. Il testo del ragionamento non è in primo piano: si legge solo espandendo «Ragionamento del modello» nella risposta, con l’avvertenza che è testo generato, non una spiegazione affidabile di come il modello decide (con OpenRouter compare solo se il fornitore lo restituisce).

Il server di sviluppo invia gli header COOP/COEP: la pagina è isolata e ONNX Runtime può usare più core della CPU. Gli strumenti vengono passati al modello con il suo template di chat nativo (tool calling), e le sue chiamate vengono validate ed eseguite dall'orchestratore.

## Link utili per la lezione

| Link | Effetto |
|---|---|
| `?livello=5` | apre il sesto passaggio; il parametro usa gli indici 0–9 |
| `?modello=lfm-350m&livello=9&avvia=1&approva=auto` | carica il modello reale ed esegue lo scenario guida con il sistema completo |
| `?vista=compare&esperimento=1` | lancia l'esperimento delle 10 configurazioni |
| `?vista=lab&lab=mcp` | laboratorio libero con il pannello MCP aperto |
| `?tema=aula&regia=1` | tema ad alto contrasto per proiettore + regia docente |

## Cosa è reale e cosa è simulato

- **Reale nel browser**: il modello linguistico (sempre reale, nessuna simulazione), orchestratore e ciclo agentico, controlli, validazione degli argomenti, calcolatrice, ricerca nei documenti (BM25), memoria su IndexedDB.
- **Reale ed esterno (opt-in)**: server MCP pubblici in allowlist (Microsoft Learn, DeepWiki), con consenso e approvazione per ogni chiamata.
- **Simulato**: solo i sistemi aziendali (dati, catalogo, magazzino, budget, azioni di scrittura con ID `SIM`) e il server MCP TechSupply. Il modello non è mai simulato.
