/**
 * Default educational configuration.
 * Naming follows the DeepSeek Harness concepts: prompt sections with
 * name/order/enabled, tool schemas, session events.
 */

export const DEFAULT_SECTIONS = [
  {
    id: 'agent-identity',
    title: 'Agent identity',
    order: -1000,
    enabled: true,
    content: 'You are a helpful educational assistant. You explain concepts simply and accurately.',
  },
  {
    id: 'response-style',
    title: 'Response style',
    order: 0,
    enabled: true,
    content: 'Answer in short paragraphs. Use concrete examples. Avoid unnecessary jargon.',
  },
  {
    id: 'tool-usage-rule',
    title: 'Tool usage rule',
    order: 100,
    enabled: false,
    content:
      'You may use the provided tools when they help. After receiving a tool result, integrate it into your answer. Do not invent tool results.',
  },
  {
    id: 'runtime-context',
    title: 'Runtime context (fictional)',
    order: 500,
    enabled: false,
    content: 'Runtime: educational demo, single task, no filesystem or network access. Today is a demo day.',
  },
  {
    id: 'safety-reminder',
    title: 'Safety reminder',
    order: 1000,
    enabled: true,
    content: 'Never ask the user for API keys, passwords, or personal data.',
  },
];

export const DEFAULT_TOOLS = [
  {
    name: 'search_web_mock',
    description: 'Simulated web search. Returns a fixed demo result; no real request is made.',
    enabled: false,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
    mockResultStrategy: 'static',
    mockResult: {
      summary: '(mock) 3 results found for the query.',
      results: [
        { title: 'Mock result 1', snippet: 'This is a simulated search result, not real data.' },
        { title: 'Mock result 2', snippet: 'Harness demo: tool output becomes part of the context.' },
      ],
    },
  },
  {
    name: 'read_file_mock',
    description: 'Simulated file read. Returns a fixed demo file content; nothing is read from disk.',
    enabled: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of the file to read' },
      },
      required: ['path'],
    },
    mockResultStrategy: 'static',
    mockResult: {
      path: '(mock)',
      content: 'Hello from a simulated file. In a real harness this would be real file content.',
    },
  },
  {
    name: 'calculator_mock',
    description: 'Simple calculator that really evaluates basic arithmetic expressions (deterministic).',
    enabled: false,
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Arithmetic expression, e.g. 2*8+1' },
      },
      required: ['expression'],
    },
    mockResultStrategy: 'calculator',
    mockResult: null,
  },
  {
    name: 'ask_clarification_mock',
    description: 'Ask the user a clarifying question before answering (simulated: returns a placeholder question).',
    enabled: false,
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The clarification question' },
      },
      required: ['question'],
    },
    mockResultStrategy: 'clarification',
    mockResult: {
      status: 'awaiting user',
      note: 'The user has been asked to clarify. For the demo, assume they answered "yes, please continue".',
    },
  },
];

export const DEFAULT_PROVIDERS = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
];
