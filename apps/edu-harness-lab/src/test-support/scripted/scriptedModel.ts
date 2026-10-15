import type { ContextHints, LoadProgress, ModelInfo, ModelRequest, ModelResponse, ModelRuntime } from '../../domain/types'
import { simulateGuide } from './guidePolicy'
import { s1, s2, s3, s4, s5, s6, s7, s8, s9 } from './otherPolicies'
import { simulateReflection } from './reflectionPolicy'

/**
 * TEST DOUBLE ONLY. A deterministic stand-in for a language model, driven by scripted policies
 * that read the ContextHints. It lets tests exercise the real orchestrator without a neural network.
 * The app itself always uses a real model.
 */
export type ScriptedPolicy = (hints: ContextHints, request: ModelRequest) => string

export const POLICIES: Record<string, ScriptedPolicy> = {
  'notebook-nuovi-assunti': h => simulateGuide(h),
  'rimborso-chilometrico': h => s1(h),
  'lavoro-agile': h => s2(h),
  'margine-commessa': h => s3(h),
  'confronto-notebook': h => s4(h),
  'ordine-in-ritardo': h => s5(h),
  'followup-cliente': h => s6(h),
  'timeout-magazzino': h => s7(h),
  'sala-senza-data': h => s8(h),
  'prezzo-in-dollari': h => s9(h),
  'ragionamento-iterativo': h => simulateReflection(h),
}

const INFO: ModelInfo = {
  profile: 'test-double',
  id: 'scripted-test-model',
  label: 'Modello di test (script)',
  backend: 'none',
  fingerprint: 'TEST',
  provenance: { provenance: 'simulated', locality: 'local', note: 'Doppio di test' },
}

export function createScriptedModel(policyFor: () => ScriptedPolicy, options: { chunkDelayMs?: number } = {}): ModelRuntime {
  const chunkDelayMs = options.chunkDelayMs ?? 0
  return {
    info: INFO,
    isReady: () => true,
    async load(onProgress: (p: LoadProgress) => void) {
      onProgress({ phase: 'ready', loadedBytes: 0, totalBytes: 0 })
      return Promise.resolve()
    },
    async generate(req, onToken, signal): Promise<ModelResponse> {
      const started = Date.now()
      const isAborted = () => signal.aborted
      const done = (text: string, finishReason: ModelResponse['finishReason']): ModelResponse => ({
        text,
        tokensIn: Math.ceil(req.messages.reduce((n, m) => n + m.content.length, 0) / 3.6),
        tokensOut: Math.ceil(text.length / 3.6),
        durationMs: Date.now() - started,
        finishReason,
        provenance: INFO.provenance,
      })
      if (isAborted()) return done('', 'aborted')
      const full = policyFor()(req.hints, req)
      let emitted = ''
      for (let pos = 0, i = 0; pos < full.length; i++) {
        if (isAborted()) return done(emitted, 'aborted')
        const chunk = full.slice(pos, pos + 3 + (i % 4))
        pos += chunk.length
        emitted += chunk
        onToken(chunk)
        if (chunkDelayMs > 0) await new Promise(r => setTimeout(r, chunkDelayMs))
      }
      return isAborted() ? done(emitted, 'aborted') : done(full, 'stop')
    },
    async unload() {},
  }
}
