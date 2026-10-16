import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoadProgress, ModelRuntime } from '../../domain/types'
import { createTransformersRuntime } from './transformersRuntime'
import type { WorkerEvent, WorkerRequest } from './workerProtocol'

class TestWorker extends EventTarget implements Worker {
  onmessage: Worker['onmessage'] = null
  onmessageerror: Worker['onmessageerror'] = null
  onerror: Worker['onerror'] = null
  readonly firstRequest = Promise.withResolvers<WorkerRequest>()
  readonly postMessage = vi.fn((request: WorkerRequest) => {
    this.firstRequest.resolve(request)
  })
  readonly terminate = vi.fn<() => void>()

  emit(event: WorkerEvent): void {
    this.dispatchEvent(new MessageEvent('message', { data: event }))
  }
}

let runtime: ModelRuntime | undefined

afterEach(async () => {
  await runtime?.unload()
  runtime = undefined
})

describe('Transformers runtime lifecycle', () => {
  it('finishes loading on worker readiness and terminates the worker on unload', async () => {
    const worker = new TestWorker()
    runtime = createTransformersRuntime('qwen3-0.6b', { workerFactory: () => worker })
    const loading = runtime.load(vi.fn())
    expect(await Promise.race([worker.firstRequest.promise, loading])).toMatchObject({ type: 'load' })
    worker.emit({ type: 'ready', backend: 'wasm', threads: 1 })
    await loading
    expect(runtime.isReady()).toBe(true)
    expect(runtime.info.backend).toBe('wasm')

    await expect(runtime.unload()).resolves.toBeUndefined()
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'unload' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(runtime.isReady()).toBe(false)
    expect(runtime.info.backend).toBe('none')
  })

  it('rejects an aborted load, reports idle, and ignores late readiness', async () => {
    const worker = new TestWorker()
    const controller = new AbortController()
    const progress = vi.fn<(progress: LoadProgress) => void>()
    runtime = createTransformersRuntime('qwen3-0.6b', { workerFactory: () => worker })
    const loading = runtime.load(progress, controller.signal)
    await Promise.race([worker.firstRequest.promise, loading])
    const rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(progress).toHaveBeenLastCalledWith({ phase: 'idle', loadedBytes: 0, totalBytes: 0 })
    worker.emit({ type: 'ready', backend: 'wasm', threads: 1 })
    expect(runtime.isReady()).toBe(false)
    expect(runtime.info.backend).toBe('none')
    expect(progress).toHaveBeenCalledTimes(2)
  })

  it('rejects an already-aborted load without creating a worker', async () => {
    const factory = vi.fn(() => new TestWorker())
    const controller = new AbortController()
    controller.abort()
    runtime = createTransformersRuntime('qwen3-0.6b', { workerFactory: factory })

    await expect(runtime.load(vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(factory).not.toHaveBeenCalled()
  })
})
