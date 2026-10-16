import { useEffect, useReducer } from 'react'

/** Re-render when an external service (memory, MCP hub, business log…) notifies a change. */
export function useSubscription(subscribe: (cb: () => void) => () => void): number {
  const [version, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribe(bump), [subscribe])
  return version
}
