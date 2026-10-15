import type { ModelInfo, ModelProfileId, ThinkingEffort } from '../../domain/types'

/**
 * Real models the app can run, all locally in the browser with Transformers.js.
 * Small models first: they run on the CPU (WASM) and use WebGPU only when it is available.
 * Repos, file names and sizes verified on the Hugging Face API (onnx/ tree) on 2026-10-14.
 */
export type RealProfileId = Exclude<ModelProfileId, 'test-double' | 'openrouter'>

/** Where the weights come from. Flip `selfHosted` later to serve the weights from the app origin. */
export const MODEL_SOURCE = {
  /** false = download from the Hugging Face hub (cached by Transformers.js in the Cache API). */
  selfHosted: false,
  /** Used only when selfHosted is true: folder served by the app, containing `<repo-id>/...`. */
  localModelPath: '/models/',
} as const

/** Context window the app actually uses: small prompts keep CPU prefill fast. */
export const APP_CONTEXT_LIMIT = 4000

export interface ModelVariant {
  device: 'wasm' | 'webgpu'
  dtype: 'q4' | 'q4f16' | 'q8'
  /** Bytes downloaded for this variant (weights + external data). */
  sizeBytes: number
}

export interface ModelProfile {
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
  /** Native tool-call syntax, used to pre-write a guided call: LFM2 Pythonic, Qwen JSON in <tool_call>, Gemma 4 call:name{}. */
  toolFormat: 'lfm' | 'qwen' | 'gemma'
  /** The chat template has an enable_thinking switch: the reasoning effort setting applies. */
  thinking?: boolean
  /**
   * Reuse the KV cache between calls (CPU only): pure-attention models whose cache can be cropped
   * to the common prefix. Hybrid models with convolution state (LFM2) cannot.
   */
  kvReuse?: boolean
}

const MB = 1_000_000

export const PROFILES: Record<RealProfileId, ModelProfile> = {
  'lfm-350m': {
    id: 'lfm-350m',
    repo: 'onnx-community/LFM2.5-350M-ONNX',
    label: 'LFM2.5 350M',
    tagline: 'Piccolissimo e veloce sulla scheda grafica, addestrato per usare strumenti',
    params: '350 milioni di parametri',
    // Every LFM2.5 ONNX export (q4, q4f16, q8) uses GatherBlockQuantized, which ONNX Runtime WASM lacks
    // (verified in the browser on 2026-10-14): WebGPU only.
    gpu: { device: 'webgpu', dtype: 'q4f16', sizeBytes: 255 * MB },
    license: 'LFM Open License v1.0',
    licenseUrl: 'https://huggingface.co/LiquidAI/LFM2.5-350M/blob/main/LICENSE',
    languages: 'multilingue (italiano indicato nei metadati del modello)',
    memoryEstimate: 'Stima: meno di 1 GB di memoria durante l’uso.',
    notes: [
      'Richiede una scheda grafica compatibile (WebGPU): Chrome o Edge su desktop.',
      'È un modello minuscolo: sbaglia più spesso di un modello grande. Proprio per questo si vede bene il lavoro dell’harness.',
      'Qualità dell’italiano da verificare dal vivo.',
    ],
    repetitionPenalty: 1.05,
    toolFormat: 'lfm',
  },
  'qwen3-0.6b': {
    id: 'qwen3-0.6b',
    repo: 'onnx-community/Qwen3-0.6B-ONNX',
    label: 'Qwen3 0.6B',
    tagline: 'Gira anche solo sul processore (CPU), italiano compreso',
    params: '600 milioni di parametri',
    cpu: { device: 'wasm', dtype: 'q8', sizeBytes: 618 * MB },
    gpu: { device: 'webgpu', dtype: 'q4f16', sizeBytes: 570 * MB },
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE',
    languages: '119 lingue, italiano compreso',
    memoryEstimate: 'Stima: circa 1–1,5 GB di memoria durante l’uso.',
    notes: [
      'Funziona senza scheda grafica: usa i core del processore (verificato nel browser). Sulla CPU è lento: ogni risposta richiede decine di secondi.',
      'La modalità “ragionamento” del modello è disattivata: vediamo solo eventi osservabili.',
      'Velocità non garantita: dipende dal processore.',
    ],
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
    tagline: 'Più capace, solo con scheda grafica compatibile (WebGPU)',
    params: '1,2 miliardi di parametri',
    gpu: { device: 'webgpu', dtype: 'q4f16', sizeBytes: 760 * MB },
    license: 'LFM Open License v1.0',
    licenseUrl: 'https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct/blob/main/LICENSE',
    languages: 'multilingue, italiano compreso',
    memoryEstimate: 'Stima: circa 1,5–2 GB di memoria (GPU condivisa + RAM).',
    notes: ['Richiede WebGPU (Chrome o Edge su desktop).', 'Velocità e stabilità sulle GPU integrate non garantite.'],
    repetitionPenalty: 1.05,
    toolFormat: 'lfm',
  },
  'gemma4-e2b': {
    id: 'gemma4-e2b',
    repo: 'onnx-community/gemma-4-E2B-it-ONNX',
    label: 'Gemma 4 E2B',
    tagline: 'Il più capace: Gemma 4 di Google, chiamate a strumenti native, solo con scheda grafica',
    params: '2,3 miliardi di parametri effettivi (5,1 con gli embedding per strato)',
    // Text-only load (AutoModelForCausalLM → Gemma4ForCausalLM): embed_tokens + decoder_model_merged in q4f16,
    // without the audio and vision encoders. Sizes from the Hugging Face API on 2026-10-14.
    gpu: { device: 'webgpu', dtype: 'q4f16', sizeBytes: 3135 * MB },
    license: 'Apache-2.0 (Gemma 4)',
    licenseUrl: 'https://ai.google.dev/gemma/docs/gemma_4_license',
    languages: 'oltre 140 lingue, italiano compreso',
    memoryEstimate: 'Stima: circa 3,5–4 GB di memoria della scheda grafica.',
    notes: [
      'Richiede WebGPU con supporto f16 (Chrome o Edge su desktop) e una scheda grafica con almeno 4 GB disponibili.',
      'Download grande (circa 3,1 GB) la prima volta; poi resta salvato nel browser.',
      'Si carica solo la parte testuale: le parti per immagini e audio non vengono scaricate.',
      'La modalità “ragionamento” è disattivata: vediamo solo eventi osservabili.',
    ],
    repetitionPenalty: 1.0,
    toolFormat: 'gemma',
    thinking: true,
    templateKwargs: { enable_thinking: false },
  },
}

export const PROFILE_LIST: ModelProfile[] = [PROFILES['qwen3-0.6b'], PROFILES['lfm-350m'], PROFILES['lfm-1.2b'], PROFILES['gemma4-e2b']]

/** Which variant runs on this device: WebGPU when present (and f16-capable for q4f16), otherwise the CPU. */
export function resolveVariant(profile: ModelProfile, webgpu: boolean, shaderF16: boolean): ModelVariant | null {
  if (webgpu && profile.gpu && (profile.gpu.dtype !== 'q4f16' || shaderF16)) return profile.gpu
  if (profile.cpu) return profile.cpu
  if (webgpu && profile.gpu) return { ...profile.gpu, dtype: 'q4' }
  return null
}

/** Extra new tokens allowed for the hidden reasoning, by effort (the visible answer keeps its own budget). */
export const THINKING_BUDGET: Record<Exclude<ThinkingEffort, 'off'>, number> = { low: 512, medium: 1024, high: 2048 }

/** Opening of a native tool call whose argument the model completes (guided decoding). */
export function toolCallPrefix(format: ModelProfile['toolFormat'], call: { name: string; arg: string }): string {
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
export function fingerprintFor(profile: ModelProfile, variant: ModelVariant): string {
  let h = 0x811c9dc5
  for (const ch of `${profile.repo}|${variant.dtype}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** Shown before any model is loaded: nothing runs until a real model is ready. */
export const NOT_LOADED_INFO: ModelInfo = {
  profile: 'lfm-350m',
  id: '—',
  label: 'Nessun modello caricato',
  backend: 'none',
  fingerprint: '—',
  nativeTools: true,
  provenance: { provenance: 'unavailable', locality: 'local', note: 'Carica un modello reale per iniziare.' },
}
