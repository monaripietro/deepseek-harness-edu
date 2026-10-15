import type { Disposer, ToolDefinition, ToolRegistry } from '../../domain/types'

/** Map-based, reversible tool registry (register returns a disposer). */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>()
  return {
    list: () => [...tools.values()],
    get: id => tools.get(id),
    register(tool): Disposer {
      tools.set(tool.id, tool)
      return () => {
        // Only remove the entry if it is still the one this call registered.
        if (tools.get(tool.id) === tool) tools.delete(tool.id)
      }
    },
  }
}
