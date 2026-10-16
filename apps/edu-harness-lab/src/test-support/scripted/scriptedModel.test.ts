import { describe, expect, it, vi } from 'vitest'
import type { LoadProgress, ModelRequest } from '../../domain/types'
import { createScriptedModel } from './scriptedModel'

const request: ModelRequest = {
  messages: [{ role: 'user', content: 'test' }],
  maxNewTokens: 32,
  hints: {
    scenarioId: 'test',
    presentKinds: [],
    availableTools: [],
    toolResults: [],
    docIds: [],
    memoryKeys: [],
    protocol: 'text',
    mustAnswer: false,
    repairAttempt: 0,
    stepIndex: 0,
  },
}

describe('scripted model cancellation', () => {
  it('loads and emits the complete answer without cancellation', async () => {
    const runtime = createScriptedModel(() => () => 'abcdefghijk')
    const progress = vi.fn<(progress: LoadProgress) => void>()
    await runtime.load(progress)
    expect(progress).toHaveBeenCalledWith({ phase: 'ready', loadedBytes: 0, totalBytes: 0 })
    const tokens: string[] = []
    const result = await runtime.generate(request, (token) => { tokens.push(token) }, new AbortController().signal)
    expect(result.text).toBe('abcdefghijk')
    expect(result.finishReason).toBe('stop')
    expect(tokens.join('')).toBe(result.text)
  })

  it.each(['abcdefghijk', 'abc'])('observes cancellation in the token callback for %s', async (answer) => {
    const runtime = createScriptedModel(() => () => answer)
    const controller = new AbortController()
    const tokens: string[] = []
    const result = await runtime.generate(request, (token) => {
      tokens.push(token)
      controller.abort()
    }, controller.signal)

    expect(result.finishReason).toBe('aborted')
    expect(result.text).toBe('abc')
    expect(tokens).toEqual(['abc'])
  })

  it('does not call the policy when already cancelled', async () => {
    const policy = vi.fn(() => 'answer')
    const runtime = createScriptedModel(() => policy)
    const controller = new AbortController()
    controller.abort()
    const onToken = vi.fn<(text: string) => void>()
    const result = await runtime.generate(request, onToken, controller.signal)

    expect(result.finishReason).toBe('aborted')
    expect(result.text).toBe('')
    expect(policy).not.toHaveBeenCalled()
    expect(onToken).not.toHaveBeenCalled()
  })
})
