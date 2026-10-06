import { createEventLog } from '../core/eventLog.js';
import { DEFAULT_SECTIONS, DEFAULT_TOOLS } from '../config/defaultConfig.js';

export function createSession() {
  return {
    task: null,
    steps: [],
    sections: structuredClone(DEFAULT_SECTIONS),
    tools: structuredClone(DEFAULT_TOOLS),
    log: createEventLog(),
    userPrompt: '',
    runtimeNotes: '',
  };
}

export function startTask(session, { userPrompt, runtimeNotes }) {
  session.task = { id: `task-${Date.now()}`, startedAt: new Date().toISOString() };
  session.steps = [];
  session.log.reset();
  session.log.append('user_message', { text: userPrompt });
  if (runtimeNotes.trim()) {
    session.log.append('runtime_notes_added', { text: runtimeNotes });
  }
}
