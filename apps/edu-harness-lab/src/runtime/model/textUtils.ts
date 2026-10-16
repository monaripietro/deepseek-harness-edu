import type { ChatMessage } from '../../domain/types'

/**
 * Pure helpers used by the model worker (kept separate so they are unit-testable without Transformers.js).
 */

const BLOCK_RES = [/<\|channel>[\s\S]*?<channel\|>/g, /<think>[\s\S]*?<\/think>/g]
const OPENERS = ['<|channel>', '<think>']

/** The reasoning ("thinking") segments of raw decoded text, without their markers (also an unclosed one). */
export function reasoningText(raw: string): string {
  const parts: string[] = []
  for (const m of raw.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)|<\|channel>([\s\S]*?)(?:<channel\|>|$)/g)) {
    parts.push((m[1] ?? m[2] ?? '').replace(/^\s*thought\b/, ''))
  }
  return parts.join('\n').trim()
}

/**
 * Removes reasoning ("thinking") segments and special tokens from raw decoded text.
 * Inner reasoning must never be shown. With `streaming`, a trailing partial marker is held back
 * so that half-received tags never leak into the visible text.
 */
export function visibleText(raw: string, specialTokens: readonly string[] = [], streaming = false): string {
  let text = raw
  for (const re of BLOCK_RES) text = text.replace(re, '')
  // An opener without its closer: the model is still "thinking" (or was cut) — hide everything from it on.
  for (const opener of OPENERS) {
    const i = text.indexOf(opener)
    if (i >= 0) text = text.slice(0, i)
  }
  const specials = [...specialTokens].filter(Boolean).sort((a, b) => b.length - a.length)
  for (const s of specials) text = text.split(s).join('')
  if (streaming) {
    const markers = [...OPENERS, '<channel|>', '</think>', ...specials]
    let hold = 0
    for (const m of markers) {
      for (let len = Math.min(m.length - 1, text.length); len > hold; len--) {
        if (text.endsWith(m.slice(0, len))) {
          hold = len
          break
        }
      }
    }
    if (hold > 0) text = text.slice(0, text.length - hold)
  }
  return streaming ? text : text.trim()
}

/** Maps chat messages to roles every Gemma template understands, merging consecutive same-role messages. */
export function normalizeMessages(messages: ChatMessage[]): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const out: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
  for (const m of messages) {
    let role: 'system' | 'user' | 'assistant'
    let content = m.content
    if (m.role === 'tool') {
      role = 'user'
      content = `Risultato dello strumento${m.name ? ` ${m.name}` : ''}:\n${m.content}`
    } else {
      role = m.role
    }
    const last = out[out.length - 1]
    if (last && last.role === role) last.content = `${last.content}\n\n${content}`
    else out.push({ role, content })
  }
  return out
}

/** Folds the system message(s) into the first user message (for templates that reject the 'system' role). */
export function mergeSystemIntoUser(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
): { role: 'user' | 'assistant'; content: string }[] {
  const system = messages.filter(m => m.role === 'system').map(m => m.content)
  const rest = messages.filter(m => m.role !== 'system') as { role: 'user' | 'assistant'; content: string }[]
  if (system.length === 0) return rest
  const prefix = system.join('\n\n')
  const firstUser = rest.findIndex(m => m.role === 'user')
  if (firstUser < 0) return [{ role: 'user', content: prefix }, ...rest]
  return rest.map((m, i) => (i === firstUser ? { ...m, content: `${prefix}\n\n${m.content}` } : m))
}

export type WorkerErrorKind = 'quota' | 'network' | 'device-lost' | 'oom' | 'unsupported' | 'unknown'

const OOM_ERROR = new RegExp(
  [
    /out of memory|oom|failed to allocate|allocation|buffer.{0,30}(too large|size)/,
    /maxbuffersize|memory access out of bounds|bad_alloc/,
  ].map(r => r.source).join('|'),
)
const NETWORK_ERROR = new RegExp(
  [
    /failed to fetch|networkerror|network error|load failed|err_internet|err_network/,
    /unable to get model file|could not locate file|\b40[134]\b|\b5\d\d\b|timeout/,
  ].map(r => r.source).join('|'),
)

/** Classifies a thrown value and returns a plain-Italian message. */
export function classifyError(err: unknown): { code: WorkerErrorKind; message: string; detail: string } {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  const s = detail.toLowerCase()
  if (/quotaexceeded|quota/.test(s))
    return {
      code: 'quota',
      message: 'Spazio di archiviazione del browser insufficiente per salvare il modello in cache. Libera spazio o scegli il modello più piccolo (LFM2.5 350M).',
      detail,
    }
  if (/device.{0,20}lost|devicelost|gpudevice.*lost/.test(s))
    return {
      code: 'device-lost',
      message: 'La GPU si è disconnessa durante l’esecuzione (device lost). Ricarica la pagina oppure scegli un modello che gira sulla CPU.',
      detail,
    }
  if (OOM_ERROR.test(s))
    return {
      code: 'oom',
      message: 'Memoria insufficiente per questo modello (GPU o RAM). Prova il modello più piccolo (LFM2.5 350M).',
      detail,
    }
  if (NETWORK_ERROR.test(s))
    return {
      code: 'network',
      message: 'Download del modello non riuscito: controlla la connessione di rete (Hugging Face deve essere raggiungibile) e riprova.',
      detail,
    }
  if (/webgpu|unsupported|not supported|unknown model class|no available backend|could not find an implementation/.test(s))
    return {
      code: 'unsupported',
      message: 'Questo browser o questa GPU non supportano l’esecuzione del modello. Scegli un modello che gira sulla CPU (LFM2.5 350M o Qwen3 0.6B).',
      detail,
    }
  return { code: 'unknown', message: 'Errore imprevisto del modello locale. Dettagli tecnici disponibili nella console.', detail }
}
