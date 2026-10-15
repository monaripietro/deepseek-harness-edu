import type { CustomToolSpec, JSONSchema, ToolDefinition, ToolOutcome } from '../../domain/types'
import { SIMULATED_LOCAL } from '../../domain/types'

function fillTemplate(tpl: string, args: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => {
    const v = args[name]
    return v === undefined || v === null ? '' : String(v)
  })
}

/** Build a ToolDefinition from a declarative spec authored in the Tool Lab (no code). */
export function toolFromSpec(spec: CustomToolSpec): ToolDefinition {
  const properties: Record<string, unknown> = {}
  for (const p of spec.params) properties[p.name] = { type: p.type, description: p.description }
  const inputSchema: JSONSchema = {
    type: 'object',
    properties,
    required: spec.params.filter(p => p.required).map(p => p.name),
    additionalProperties: false,
  }
  return {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    purpose: spec.purpose,
    inputSchema,
    output: 'Testo generato dal modello di risposta definito per questo strumento.',
    permissions: spec.permissions,
    risk: spec.risk,
    approval: spec.approval,
    provenance: { ...SIMULATED_LOCAL, note: 'strumento creato nel laboratorio, senza codice' },
    errors: [{ code: 'TOOL_ERROR', message: spec.errorMessage || 'Errore simulato' }],
    latencyMs: spec.latencyMs,
    source: 'custom',
    async execute(args): Promise<ToolOutcome> {
      if (Math.random() < spec.errorRate) {
        return { ok: false, code: 'TOOL_ERROR', message: spec.errorMessage || 'Errore simulato' }
      }
      const text = fillTemplate(spec.outputTemplate, args)
      return { ok: true, data: { text }, summary: text }
    },
  }
}
