/**
 * Tool schema registry, inspired by packages/core/system-prompt tool providers:
 * the model sees full JSON schemas, not just tool names.
 */

export function activeToolSchemas(tools) {
  return tools
    .filter((t) => t.enabled)
    .map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
}

export function runMockTool(tools, name, args) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  switch (tool.mockResultStrategy) {
    case 'calculator':
      return { result: safeEvalCalculator(args?.expression) };
    case 'clarification':
      return { asked: args?.question ?? '', ...tool.mockResult };
    default:
      return tool.mockResult ?? { result: '(mock result)' };
  }
}

function safeEvalCalculator(expr) {
  if (typeof expr !== 'string' || !/^[\d+\-*/().%\s]+$/.test(expr)) return null;
  try {
    const value = Function(`"use strict"; return (${expr});`)();
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
