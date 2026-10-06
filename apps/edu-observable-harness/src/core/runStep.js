/**
 * Minimal step runner, inspired by packages/core/agent-loop:
 * assemble -> request -> response -> optional tool step -> next step.
 * A task may have one or more steps; max 3 to keep the demo bounded.
 */

import { assembleSystemPrompt } from './promptAssembler.js';
import { activeToolSchemas } from './toolSchemaRegistry.js';
import { runMockTool } from './toolSchemaRegistry.js';
import { deriveMessages } from './sessionProjector.js';

const MAX_STEPS = 3;

export async function runTask(session, onEvent) {
  const emit = onEvent ?? (() => {});
  session.steps = [];

  for (let stepIndex = 1; stepIndex <= MAX_STEPS; stepIndex++) {
    const step = { index: stepIndex, status: 'running' };
    session.steps.push(step);

    const assembled = assembleSystemPrompt(session.sections);
    if (assembled.text) {
      session.log.append('system_prompt_assembled', { text: assembled.text, sections: assembled.sections });
    }
    const tools = activeToolSchemas(session.tools);
    const messages = deriveMessages(session.log);
    const payload = { model: session.model, messages, tools };
    session.log.append('model_request_prepared', {
      step: stepIndex,
      messageCount: messages.length,
      toolCount: tools.length,
    });
    emit('step-prepared', { stepIndex, payload, assembled });

    let response;
    try {
      response = await session.callModel(payload);
    } catch (err) {
      session.log.append('model_request_failed', { step: stepIndex, error: String(err.message ?? err) });
      step.status = 'failed';
      emit('step-failed', { stepIndex, error: String(err.message ?? err) });
      return;
    }
    session.log.append('model_response_received', {
      step: stepIndex,
      text: response.text ?? '',
      toolCalls: response.toolCalls ?? [],
    });
    emit('step-response', { stepIndex, response });

    const toolCalls = response.toolCalls ?? [];
    if (toolCalls.length === 0 || stepIndex === MAX_STEPS) {
      step.status = 'done';
      session.log.append('task_completed', { steps: stepIndex });
      emit('task-completed', { steps: stepIndex });
      return;
    }

    for (const call of toolCalls.slice(0, 3)) {
      session.log.append('tool_call_suggested', {
        step: stepIndex,
        callId: call.id,
        name: call.name,
        arguments: call.arguments ?? {},
      });
      const result = runMockTool(session.tools, call.name, call.arguments);
      session.log.append('tool_result_added', {
        step: stepIndex,
        callId: call.id,
        name: call.name,
        result,
      });
      emit('tool-executed', { stepIndex, call, result });
    }
    session.log.append('next_step_prepared', { from: stepIndex, to: stepIndex + 1 });
    step.status = 'done';
  }
}
