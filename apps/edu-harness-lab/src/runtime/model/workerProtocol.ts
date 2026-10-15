import type { ChatMessage, ModelToolSpec } from '../../domain/types'
import type { RealProfileId } from './profiles'

/** Messages main thread -> worker. */
export type WorkerRequest =
  | { type: 'load'; profile: RealProfileId; device: 'wasm' | 'webgpu'; dtype: string; expectedBytes?: number; cacheOnly?: boolean }
  | { type: 'generate'; id: string; messages: ChatMessage[]; tools?: ModelToolSpec[]; maxNewTokens: number; forceTool?: { name: string; arg: string }; thinking?: boolean }
  | { type: 'abort'; id: string }
  | { type: 'unload' }

export type WorkerErrorCode = 'quota' | 'network' | 'device-lost' | 'oom' | 'unsupported' | 'unknown'

/** Messages worker -> main thread. */
export type WorkerEvent =
  | { type: 'progress'; loaded: number; total: number; file?: string; phase: 'downloading' | 'initializing' }
  | { type: 'ready'; backend: 'webgpu' | 'wasm'; threads: number }
  | { type: 'token'; id: string; text: string }
  /** Reasoning in progress: tokens so far and its text (shown only if the user expands it). */
  | { type: 'thinking'; id: string; tokens: number; text: string }
  | {
    type: 'done'
    id: string
    text: string
    tokensIn: number
    tokensOut: number
    durationMs: number
    finishReason: 'stop' | 'length' | 'aborted'
  }
  | { type: 'unloaded' }
  | { type: 'error'; id?: string; code: WorkerErrorCode; message: string; detail?: string }
