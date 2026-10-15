import type { ToolDefinition, ToolExecContext, ToolOutcome } from '../../domain/types'

function sleep(ms: number, signal: AbortSignal): Promise<'done' | 'aborted'> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve('aborted')
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

const ABORTED: ToolOutcome = { ok: false, code: 'TOOL_ERROR', message: "Esecuzione interrotta dall'utente." }

function timeoutOutcome(timeoutMs: number): ToolOutcome {
  const s = Math.max(1, Math.round(timeoutMs / 1000))
  return { ok: false, code: 'TIMEOUT', message: `Lo strumento non ha risposto entro ${s} s` }
}

/**
 * Run a tool: injected faults first, then simulated latency, then execute(),
 * all raced against the timeout and the abort signal. Never throws.
 */
export async function executeTool(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  ctx: ToolExecContext,
  timeoutMs: number,
): Promise<ToolOutcome> {
  try {
    if (ctx.signal.aborted) return ABORTED

    if (ctx.faults.timeout.includes(tool.id)) {
      const r = await sleep(timeoutMs, ctx.signal)
      return r === 'aborted' ? ABORTED : timeoutOutcome(timeoutMs)
    }

    // Inner controller: aborted when the caller aborts, or when we give up (timeout).
    const inner = new AbortController()
    const onOuterAbort = () => inner.abort()
    ctx.signal.addEventListener('abort', onOuterAbort, { once: true })

    const run = async (): Promise<ToolOutcome> => {
      const [lo, hi] = tool.latencyMs
      const latency = Math.round(lo + Math.random() * Math.max(0, hi - lo))
      if ((await sleep(latency, inner.signal)) === 'aborted') return ABORTED
      if (ctx.faults.error.includes(tool.id)) {
        return { ok: false, code: 'TOOL_ERROR', message: 'Errore simulato: lo strumento ha restituito un errore interno.' }
      }
      if (ctx.faults.empty.includes(tool.id)) {
        return { ok: false, code: 'EMPTY', message: 'Nessun risultato: lo strumento ha restituito una risposta vuota (simulata).' }
      }
      try {
        return await tool.execute(args, { ...ctx, signal: inner.signal })
      } catch (err) {
        return { ok: false, code: 'TOOL_ERROR', message: `Errore dello strumento: ${err instanceof Error ? err.message : String(err)}` }
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<ToolOutcome>((resolve) => {
      timer = setTimeout(() => resolve(timeoutOutcome(timeoutMs)), timeoutMs)
    })
    try {
      return await Promise.race([run(), timeout])
    } finally {
      if (timer) clearTimeout(timer)
      ctx.signal.removeEventListener('abort', onOuterAbort)
      inner.abort() // stop any late work of a timed-out call
    }
  } catch (err) {
    return { ok: false, code: 'TOOL_ERROR', message: `Errore imprevisto: ${err instanceof Error ? err.message : String(err)}` }
  }
}
