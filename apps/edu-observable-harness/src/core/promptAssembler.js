/**
 * Ordered system-prompt assembly, inspired by packages/core/system-prompt:
 * sections sort by ascending order, then by name/id; enabled sections only.
 */

export function assembleSystemPrompt(sections) {
  const active = sections
    .filter((s) => s.enabled)
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const rendered = active.map((s) => s.content.trim()).filter(Boolean);
  return {
    sections: active.map((s) => ({ id: s.id, title: s.title, order: s.order })),
    text: rendered.join('\n\n'),
  };
}
