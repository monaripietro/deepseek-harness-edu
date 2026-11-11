import type { ModelInfo, ModelProfileId, ThinkingEffort } from '../../domain/types'
import { tr, uiLang } from '../../i18n'

/**
 * Real models the app can run, all locally in the browser with Transformers.js.
 * Small models first: they run on the CPU (WASM) and use WebGPU only when it is available.
 * Repos, file names and sizes verified on the Hugging Face API (onnx/ tree) on 2026-10-14.
 *
 * Descriptive texts (tagline, params, notes…) are getters: they follow the interface language when read.
 * Model and brand names are never translated.
 */
export type RealProfileId = Exclude<ModelProfileId, 'test-double' | 'openrouter'>
export type TransformersProfileId = Exclude<RealProfileId, 'emma-6'>

/** A list of notes in the current interface language. */
const trList = (it: string[], en: string[]): string[] => (uiLang() === 'en' ? en : it)

/** Where the weights come from. Flip `selfHosted` later to serve the weights from the app origin. */
export const MODEL_SOURCE: Readonly<{ selfHosted: boolean; localModelPath: string }> = {
  /** false = download from the Hugging Face hub (cached by Transformers.js in the Cache API). */
  selfHosted: false,
  /** Used only when selfHosted is true: folder served by the app, containing `<repo-id>/...`. */
  localModelPath: '/models/',
}

/** Context window the app actually uses: small prompts keep CPU prefill fast. */
export const APP_CONTEXT_LIMIT = 4000

export interface ModelVariant {
  device: 'wasm' | 'webgpu'
  dtype: 'q4' | 'q4f16' | 'q8'
  /** Bytes downloaded for this variant (weights + external data). */
  sizeBytes: number
}

export interface WllamaVariant {
  runtime: 'wllama'
  device: 'wasm' | 'webgpu'
  dtype: 'Q4_K_M'
  sizeBytes: number
}

export type ResolvedModelVariant = ModelVariant | WllamaVariant
export type ToolCallFormat = 'lfm' | 'qwen' | 'gemma'

interface BaseModelProfile {
  id: RealProfileId
  repo: string
  label: string
  /** Short tagline shown on the card. */
  tagline: string
  params: string
  /** Variant used on the CPU (absent = WebGPU required). */
  cpu?: ModelVariant
  /** Variant used when WebGPU (with shader-f16) is available. */
  gpu?: ModelVariant
  license: string
  licenseUrl: string
  languages: string
  memoryEstimate: string
  notes: string[]
  /** Generation settings recommended by the vendor (greedy decoding keeps runs repeatable). */
  repetitionPenalty: number
  /** Extra kwargs for the chat template (e.g. Qwen3 thinking switch). */
  templateKwargs?: Record<string, unknown>
  /** The chat template has an enable_thinking switch: the reasoning effort setting applies. */
  thinking?: boolean
  /**
   * Reuse the KV cache between calls (CPU only): pure-attention models whose cache can be cropped
   * to the common prefix. Hybrid models with convolution state (LFM2) cannot.
   */
  kvReuse?: boolean
}

export interface TransformersModelProfile extends BaseModelProfile {
  runtime?: 'transformers'
  cpu?: ModelVariant
  gpu?: ModelVariant
  /** Native tool-call syntax, used to pre-write a guided call. */
  toolFormat: ToolCallFormat
}

export interface WllamaModelProfile extends BaseModelProfile {
  runtime: 'wllama'
  modelFile: string
  quantization: 'Q4_K_M'
  modelSizeBytes: number
  contextLength: number
  /** Emma-6 uses the harness's text protocol instead of native tool calls. */
  toolFormat: null
  cpu?: never
  gpu?: never
}

export type ModelProfile = TransformersModelProfile | WllamaModelProfile

export const EMMA_PROFILE: WllamaModelProfile = {
  id: 'emma-6',
  runtime: 'wllama',
  repo: 'PaoloneSborracchione/emma-6-GGUF',
  modelFile: 'emma-6-Q4_K_M.gguf',
  label: 'Emma-6',
  get tagline() {
    return tr('Un modello italiano sperimentale, eseguito nel browser senza conversioni', 'An experimental Italian model, run in the browser with no conversion')
  },
  get params() {
    return tr('Circa 1,55 miliardi di parametri', 'About 1.55 billion parameters')
  },
  quantization: 'Q4_K_M',
  modelSizeBytes: 1_024_069_952,
  contextLength: 4096,
  license: 'OpenRAIL',
  licenseUrl: 'https://huggingface.co/PaoloneSborracchione/emma-6-GGUF',
  get languages() {
    return tr('Italiano come lingua principale', 'Italian as the main language')
  },
  get memoryEstimate() {
    return tr('Stima: oltre 1 GB di memoria durante l’uso.', 'Estimate: more than 1 GB of memory while in use.')
  },
  get notes() {
    return trList(
      [
        'Conversione GGUF non ufficiale del modello Egomnia; usa il template di chat incluso nel file.',
        'Non è addestrato per chiamate native agli strumenti: l’harness usa il protocollo testuale.',
        'È sperimentale e può essere limitato nel ragionamento complesso; non garantisce la soluzione del rompicapo.',
      ],
      [
        'Unofficial GGUF conversion of the Egomnia model; it uses the chat template included in the file.',
        'It is not trained for native tool calls: the harness uses the text protocol.',
        'It is experimental and may be limited in complex reasoning; it does not guarantee solving the puzzle.',
      ],
    )
  },
  repetitionPenalty: 1.05,
  toolFormat: null,
}

const MB = 1_000_000

export const PROFILES: Record<RealProfileId, ModelProfile> = {
  'lfm-350m': {
    id: 'lfm-350m',
    repo: 'onnx-community/LFM2.5-350M-ONNX',
    label: 'LFM2.5 350M',
    get tagline() {
      return tr(
        'Piccolissimo e veloce sulla scheda grafica, addestrato per usare strumenti',
        'Very small and fast on the graphics card, trained to use tools',
      )
    },
    get params() {
      return tr('350 milioni di parametri', '350 million parameters')
    },
    // Every LFM2.5 ONNX export (q4, q4f16, q8) uses GatherBlockQuantized, which ONNX Runtime WASM lacks
    // (verified in the browser on 2026-10-14): WebGPU only.
    gpu: { device: 'webgpu', dtype: 'q4f16', sizeBytes: 255 * MB },
    license: 'LFM Open License v1.0',
    licenseUrl: 'https://huggingface.co/LiquidAI/LFM2.5-350M/blob/main/LICENSE',
    get languages() {
      return tr('multilingue (italiano indicato nei metadati del modello)', 'multilingual (Italian listed in the model metadata)')
    },
    get memoryEstimate() {
      return tr('Stima: meno di 1 GB di memoria durante l’uso.', 'Estimate: less than 1 GB of memory while in use.')
    },
    get notes() {
      return trList(
        [
          'Richiede una scheda grafica compatibile (WebGPU): Chrome o Edge su desktop.',
          'È un modello minuscolo: sbaglia più spesso di un modello grande. Proprio per questo si vede bene il lavoro dell’harness.',
          'Qualità dell’italiano da verificare dal vivo.',
        ],
        [
          'Needs a compatible graphics card (WebGPU): Chrome or Edge on desktop.',
          'It is a tiny model: it makes mistakes more often than a large one. That is exactly why the harness’s work is easy to see.',
          'Italian quality to be checked live.',
        ],
      )
    },
    repetitionPenalty: 1.05,
    toolFormat: 'lfm',
  },
  'qwen3-0.6b': {
    id: 'qwen3-0.6b',
    repo: 'onnx-community/Qwen3-0.6B-ONNX',
    label: 'Qwen3 0.6B',
    get tagline() {
      return tr('Gira anche solo sul processore (CPU), italiano compreso', 'Runs even on the processor alone (CPU), Italian included')
    },
    get params() {
      return tr('600 milioni di parametri', '600 million parameters')
    },
    cpu: { device: 'wasm', dtype: 'q8', sizeBytes: 618 * MB },
    gpu: { device: 'webgpu', dtype: 'q4f16', sizeBytes: 570 * MB },
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE',
    get languages() {
      return tr('119 lingue, italiano compreso', '119 languages, Italian included')
    },
    get memoryEstimate() {
      return tr('Stima: circa 1–1,5 GB di memoria durante l’uso.', 'Estimate: about 1–1.5 GB of memory while in use.')
    },
    get notes() {
      return trList(
        [
          'Funziona senza scheda grafica: usa i core del processore (verificato nel browser). Sulla CPU è lento: ogni risposta richiede decine di secondi.',
          'La modalità “ragionamento” del modello è disattivata: vediamo solo eventi osservabili.',
          'Velocità non garantita: dipende dal processore.',
        ],
        [
          'Works without a graphics card: it uses the processor cores (verified in the browser). On the CPU it is slow: each answer takes tens of seconds.',
          'The model’s “reasoning” mode is switched off: we only see observable events.',
          'Speed not guaranteed: it depends on the processor.',
        ],
      )
    },
    repetitionPenalty: 1.05,
    toolFormat: 'qwen',
    thinking: true,
    templateKwargs: { enable_thinking: false },
    kvReuse: true,
  },
  'lfm-1.2b': {
    id: 'lfm-1.2b',
    repo: 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX',
    label: 'LFM2.5 1.2B',
    get tagline() {
      return tr('Più capace, solo con scheda grafica compatibile (WebGPU)', 'More capable, only with a compatible graphics card (WebGPU)')
    },
    get params() {
      return tr('1,2 miliardi di parametri', '1.2 billion parameters')
    },
    gpu: { device: 'webgpu', dtype: 'q4f16', sizeBytes: 760 * MB },
    license: 'LFM Open License v1.0',
    licenseUrl: 'https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct/blob/main/LICENSE',
    get languages() {
      return tr('multilingue, italiano compreso', 'multilingual, Italian included')
    },
    get memoryEstimate() {
      return tr('Stima: circa 1,5–2 GB di memoria (GPU condivisa + RAM).', 'Estimate: about 1.5–2 GB of memory (shared GPU + RAM).')
    },
    get notes() {
      return trList(
        ['Richiede WebGPU (Chrome o Edge su desktop).', 'Velocità e stabilità sulle GPU integrate non garantite.'],
        ['Needs WebGPU (Chrome or Edge on desktop).', 'Speed and stability on integrated GPUs are not guaranteed.'],
      )
    },
    repetitionPenalty: 1.05,
    toolFormat: 'lfm',
  },
  'gemma4-e2b': {
    id: 'gemma4-e2b',
    repo: 'onnx-community/gemma-4-E2B-it-ONNX',
    label: 'Gemma 4 E2B',
    get tagline() {
      return tr(
        'Il più capace: Gemma 4 di Google, chiamate a strumenti native, solo con scheda grafica',
        'The most capable: Google’s Gemma 4, with native tool calls, graphics card only',
      )
    },
    get params() {
      return tr(
        '2,3 miliardi di parametri effettivi (5,1 con gli embedding per strato)',
        '2.3 billion effective parameters (5.1 with per-layer embeddings)',
      )
    },
    // Text-only load (AutoModelForCausalLM → Gemma4ForCausalLM): embed_tokens + decoder_model_merged in q4f16,
    // without the audio and vision encoders. Sizes from the Hugging Face API on 2026-10-14.
    gpu: { device: 'webgpu', dtype: 'q4f16', sizeBytes: 3135 * MB },
    license: 'Apache-2.0 (Gemma 4)',
    licenseUrl: 'https://ai.google.dev/gemma/docs/gemma_4_license',
    get languages() {
      return tr('oltre 140 lingue, italiano compreso', 'over 140 languages, Italian included')
    },
    get memoryEstimate() {
      return tr('Stima: circa 3,5–4 GB di memoria della scheda grafica.', 'Estimate: about 3.5–4 GB of graphics card memory.')
    },
    get notes() {
      return trList(
        [
          'Richiede WebGPU con supporto f16 (Chrome o Edge su desktop) e una scheda grafica con almeno 4 GB disponibili.',
          'Download grande (circa 3,1 GB) la prima volta; poi resta salvato nel browser.',
          'Si carica solo la parte testuale: le parti per immagini e audio non vengono scaricate.',
          'La modalità “ragionamento” è disattivata: vediamo solo eventi osservabili.',
        ],
        [
          'Needs WebGPU with f16 support (Chrome or Edge on desktop) and a graphics card with at least 4 GB free.',
          'Large download (about 3.1 GB) the first time; then it stays saved in the browser.',
          'Only the text part is loaded: the image and audio parts are not downloaded.',
          'The “reasoning” mode is switched off: we only see observable events.',
        ],
      )
    },
    repetitionPenalty: 1.0,
    toolFormat: 'gemma',
    thinking: true,
    templateKwargs: { enable_thinking: false },
  },
  'emma-6': EMMA_PROFILE,
}

export const PROFILE_LIST: ModelProfile[] = [
  PROFILES['qwen3-0.6b'],
  PROFILES['lfm-350m'],
  PROFILES['lfm-1.2b'],
  PROFILES['gemma4-e2b'],
  EMMA_PROFILE,
]

/** Which variant runs on this device: WebGPU when present (and f16-capable for q4f16), otherwise the CPU. */
export function resolveVariant(
  profile: TransformersModelProfile,
  webgpu: boolean,
  shaderF16: boolean,
): ModelVariant | null
export function resolveVariant(profile: WllamaModelProfile, webgpu: boolean, shaderF16: boolean): WllamaVariant
export function resolveVariant(
  profile: ModelProfile,
  webgpu: boolean,
  shaderF16: boolean,
): ResolvedModelVariant | null
export function resolveVariant(
  profile: ModelProfile,
  webgpu: boolean,
  shaderF16: boolean,
): ResolvedModelVariant | null {
  if (profile.runtime === 'wllama') {
    return {
      runtime: 'wllama',
      device: webgpu ? 'webgpu' : 'wasm',
      dtype: profile.quantization,
      sizeBytes: profile.modelSizeBytes,
    }
  }
  if (webgpu && profile.gpu && (profile.gpu.dtype !== 'q4f16' || shaderF16)) return profile.gpu
  if (profile.cpu) return profile.cpu
  if (webgpu && profile.gpu) return { ...profile.gpu, dtype: 'q4' }
  return null
}

/** Extra new tokens allowed for the hidden reasoning, by effort (the visible answer keeps its own budget). */
export const THINKING_BUDGET: Record<Exclude<ThinkingEffort, 'off'>, number> = { low: 512, medium: 1024, high: 2048 }

/** Opening of a native tool call whose argument the model completes (guided decoding). */
export function toolCallPrefix(format: ToolCallFormat, call: { name: string; arg: string }): string {
  switch (format) {
    case 'lfm':
      return `<|tool_call_start|>[${call.name}(${call.arg}="`
    case 'qwen':
      return `<tool_call>\n{"name": "${call.name}", "arguments": {"${call.arg}": "`
    case 'gemma':
      return `<|tool_call>call:${call.name}{${call.arg}:<|"|>`
  }
}

/** Short constant label proving the model never changes between levels. */
export function fingerprintFor(profile: ModelProfile, variant: ResolvedModelVariant): string {
  let h = 0x811c9dc5
  const modelIdentity =
    profile.runtime === 'wllama' ? `${profile.repo}|${profile.modelFile}|${variant.dtype}` : `${profile.repo}|${variant.dtype}`
  for (const ch of modelIdentity) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** Shown before any model is loaded: nothing runs until a real model is ready. */
export const NOT_LOADED_INFO: ModelInfo = {
  profile: 'lfm-350m',
  id: '—',
  get label() {
    return tr('Nessun modello caricato', 'No model loaded')
  },
  backend: 'none',
  fingerprint: '—',
  nativeTools: true,
  provenance: {
    provenance: 'unavailable',
    locality: 'local',
    get note() {
      return tr('Carica un modello reale per iniziare.', 'Load a real model to start.')
    },
  },
}
