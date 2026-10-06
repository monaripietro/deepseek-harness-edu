/**
 * Append-only event log, inspired by packages/core/session:
 * the session log is the source of truth; messages are derived from it.
 * The API key is never accepted here.
 */

let nextId = 1;

export function createEventLog() {
  const events = [];
  return {
    events,
    append(type, payload = {}) {
      const event = {
        id: nextId++,
        type,
        timestampLocal: new Date().toLocaleTimeString(),
        payload,
      };
      events.push(event);
      return event;
    },
    reset() {
      events.length = 0;
    },
  };
}
