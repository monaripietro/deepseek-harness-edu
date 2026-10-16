import type { PromptLanguage, ToolDefinition, ToolExecContext, ToolOutcome } from '../../domain/types'
import { errorText, t } from './lang'

function sleep(ms: number, signal: AbortSignal): Promise<'done' | 'aborted'> {
  return new Promise((resolve) => {
    if (signal.aborted) {  resolve('aborted'); return }
    const onAbort = () => {
      clearTimeout(timer)
      resolve('aborted')
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve('done')
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function aborted(lang: PromptLanguage | undefined): ToolOutcome {
  return { ok: false, code: 'TOOL_ERROR', message: t(lang, "Esecuzione interrotta dall'utente.", 'Execution stopped by the user.') }
}

function timeoutOutcome(timeoutMs: number, lang: PromptLanguage | undefined): ToolOutcome {
  const s = Math.max(1, Math.round(timeoutMs / 1000))
  const message = t(lang, `Lo strumento non ha risposto entro ${s} s`, `The tool did not respond within ${s} s`)
  return { ok: false, code: 'TIMEOUT', message }
}

/**
 * Run a tool: injected faults first, then simulated latency, then execute(),
 * all raced against the timeout and the abort signal. Never throws.
 * Messages are in the prompt language `ctx.lang` (default Italian): the model reads them.
 */
export async function executeTool(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  ctx: ToolExecContext,
  timeoutMs: number,
): Promise<ToolOutcome> {
  const lang = ctx.lang
  try {
    if (ctx.signal.aborted) return aborted(lang)

    if (ctx.faults.timeout.includes(tool.id)) {
      const r = await sleep(timeoutMs, ctx.signal)
      return r === 'aborted' ? aborted(lang) : timeoutOutcome(timeoutMs, lang)
    }

    // Inner controller: aborted when the caller aborts, or when we give up (timeout).
    const inner = new AbortController()
    const onOuterAbort = () =>{  inner.abort() }
    ctx.signal.addEventListener('abort', onOuterAbort, { once: true })

    const run = async (): Promise<ToolOutcome> => {
      const [lo, hi] = tool.latencyMs
      const latency = Math.round(lo + Math.random() * Math.max(0, hi - lo))
      if ((await sleep(latency, inner.signal)) === 'aborted') return aborted(lang)
      if (ctx.faults.error.includes(tool.id)) {
        const message = t(
          lang,
          'Errore simulato: lo strumento ha restituito un errore interno.',
          'Simulated error: the tool returned an internal error.',
        )
        return { ok: false, code: 'TOOL_ERROR', message }
      }
      if (ctx.faults.empty.includes(tool.id)) {
        const message = t(
          lang,
          'Nessun risultato: lo strumento ha restituito una risposta vuota (simulata).',
          'No result: the tool returned an empty response (simulated).',
        )
        return { ok: false, code: 'EMPTY', message }
      }
      try {
        return await tool.execute(args, { ...ctx, signal: inner.signal })
      } catch (err) {
        return { ok: false, code: 'TOOL_ERROR', message: `${t(lang, 'Errore dello strumento', 'Tool error')}: ${errorText(err, lang)}` }
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<ToolOutcome>((resolve) => {
      timer = setTimeout(() =>{  resolve(timeoutOutcome(timeoutMs, lang)) }, timeoutMs)
    })
    try {
      return await Promise.race([run(), timeout])
    } finally {
      if (timer) clearTimeout(timer)
      ctx.signal.removeEventListener('abort', onOuterAbort)
      inner.abort() // stop any late work of a timed-out call
    }
  } catch (err) {
    return { ok: false, code: 'TOOL_ERROR', message: `${t(lang, 'Errore imprevisto', 'Unexpected error')}: ${errorText(err, lang)}` }
  }
}
