/**
 * Session projector, inspired by deriveMessages() in packages/core/session:
 * model-facing messages are derived from the append-only event log.
 */

export function deriveMessages(log) {
  const messages = [];
  for (const ev of log.events) {
    switch (ev.type) {
      case 'system_prompt_assembled':
        if (ev.payload.text) messages.push({ role: 'system', content: ev.payload.text, origin: 'harness' });
        break;
      case 'user_message':
        messages.push({ role: 'user', content: ev.payload.text, origin: 'user' });
        break;
      case 'model_response_received':
        if (ev.payload.text) messages.push({ role: 'assistant', content: ev.payload.text, origin: 'model' });
        break;
      case 'tool_call_suggested':
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: ev.payload.callId,
              type: 'function',
              function: { name: ev.payload.name, arguments: JSON.stringify(ev.payload.arguments ?? {}) },
            },
          ],
          origin: 'model-tool',
        });
        break;
      case 'tool_result_added':
        messages.push({
          role: 'tool',
          tool_call_id: ev.payload.callId,
          name: ev.payload.name,
          content: typeof ev.payload.result === 'string' ? ev.payload.result : JSON.stringify(ev.payload.result),
          origin: 'tool',
        });
        break;
    }
  }
  return messages;
}
