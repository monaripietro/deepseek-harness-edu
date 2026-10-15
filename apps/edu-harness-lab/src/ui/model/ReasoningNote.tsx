import { useEffect, useState } from 'react'
import { Brain } from 'lucide-react'
import { useLab } from '../../state/store'

/**
 * Live sign that the model is reasoning, so a long silence does not look like a freeze:
 * how long and (for local models) how many tokens. The reasoning itself is never shown: it stays private.
 */
export function ReasoningNote({ fallback }: { fallback: string }) {
  const reasoning = useLab(s => s.reasoning)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!reasoning) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [reasoning])
  if (!reasoning) return <>{fallback}</>
  const secs = Math.max(0, Math.round((now - reasoning.since) / 1000))
  return (
    <span role="status">
      <Brain size={14} aria-hidden /> Il modello sta ragionando… {secs} s{reasoning.tokens > 0 ? ` · ${reasoning.tokens} token` : ''}
      {' '}(il ragionamento resta privato)
    </span>
  )
}
