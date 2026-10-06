/**
 * OpenAI-compatible client, browser-side only.
 * The API key is passed per call, never logged, never stored by this module.
 */

export async function callOpenAICompatible({ baseUrl, model, apiKey, messages, tools }) {
  const body = { model, messages, stream: false };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Provider error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0]?.message ?? {};
  const toolCalls = (choice.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function?.name,
    arguments: safeParse(tc.function?.arguments),
  }));
  return {
    raw: choice,
    text: choice.content ?? '',
    toolCalls,
  };
}

function safeParse(s) {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return { _raw: s };
  }
}
