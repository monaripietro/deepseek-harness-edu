import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CapabilityReport, LoadProgress, ModelInfo, ModelProfileId } from '../../domain/types'
import { NOT_LOADED_INFO } from '../../runtime/model/profiles'
import type { RealProfileId } from '../../runtime/model/profiles'
import { ModelSetup } from './ModelSetup'
import { ModelStatusChip } from './ModelStatusChip'

type MockStoreState = {
  capabilities: CapabilityReport | null
  loadProgress: LoadProgress
  modelInfo: ModelInfo
  detect: () => Promise<void>
  loadModel: (profile: RealProfileId) => Promise<void>
  cachedModels: Partial<Record<RealProfileId, number>>
  refreshModelCache: () => Promise<void>
  deleteCachedModel: (profile: RealProfileId) => Promise<void>
}

const mocks = vi.hoisted(() => ({
  state: null as MockStoreState | null,
  detect: vi.fn<() => Promise<void>>(),
  loadModel: vi.fn<(profile: RealProfileId) => Promise<void>>(),
}))

vi.mock('../../state/store', () => {
  const currentState = (): MockStoreState => {
    if (!mocks.state) throw new Error('Mock store state is not initialised')
    return mocks.state
  }
  return {
    useLab: Object.assign(
      <T,>(selector: (state: MockStoreState) => T): T => selector(currentState()),
      { getState: currentState },
    ),
  }
})

vi.mock('../common/Dialog', () => ({
  Dialog: ({ label, children }: { label: string; children: ReactNode }) => <div role="dialog" aria-label={label}>{children}</div>,
}))

const capabilities = (webgpu: boolean, shaderF16: boolean, recommended: ModelProfileId): CapabilityReport => ({
  webgpu,
  shaderF16,
  browser: 'Chrome',
  recommended,
  reasons: [],
})

function createState({
  caps = capabilities(false, false, 'qwen3-0.6b'),
  progress = { phase: 'idle', loadedBytes: 0, totalBytes: 0 },
  cachedModels = {},
}: {
  caps?: CapabilityReport | null
  progress?: LoadProgress
  cachedModels?: Partial<Record<RealProfileId, number>>
} = {}): MockStoreState {
  return {
    capabilities: caps,
    loadProgress: progress,
    modelInfo: NOT_LOADED_INFO,
    detect: mocks.detect,
    loadModel: mocks.loadModel,
    cachedModels,
    refreshModelCache: async () => {},
    deleteCachedModel: async () => {},
  }
}

beforeEach(() => {
  mocks.detect.mockReset().mockResolvedValue()
  mocks.loadModel.mockReset().mockResolvedValue()
  mocks.state = createState()
})

afterEach(() => {
  cleanup()
  mocks.state = null
  mocks.detect.mockReset()
  mocks.loadModel.mockReset()
})

describe('ModelSetup', () => {
  it('lets the user switch to another model while one is already running', () => {
    mocks.state = {
      ...createState({ caps: capabilities(true, true, 'lfm-350m'), progress: { phase: 'ready', loadedBytes: 1, totalBytes: 1 } }),
      modelInfo: { ...NOT_LOADED_INFO, profile: 'lfm-350m', label: 'LFM2.5 350M · GPU', backend: 'webgpu', provenance: { provenance: 'real', locality: 'local' } },
    }
    render(<ModelSetup onClose={vi.fn()} />)

    expect(screen.getByText('Modello pronto')).toBeTruthy()
    expect(screen.getByText('Cambia modello')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Gemma 4 E2B/ }))
    fireEvent.click(screen.getByRole('button', { name: /Scarica e passa a Gemma 4 E2B/ }))
    expect(mocks.loadModel).toHaveBeenCalledWith('gemma4-e2b')
  })

  it('starts an already downloaded model without a new download and offers to remove its files', () => {
    mocks.state = createState({ cachedModels: { 'qwen3-0.6b': 640_000_000 } })
    render(<ModelSetup onClose={vi.fn()} />)

    const essentials = screen.getByRole('list', { name: 'Download, privacy e limiti' })
    expect(essentials.textContent).toContain('Già scaricato')
    expect(screen.queryByRole('button', { name: /Scarica e avvia/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Avvia/ }))
    expect(mocks.loadModel).toHaveBeenCalledWith('qwen3-0.6b')
    expect(screen.getByRole('button', { name: /Elimina dal browser/ })).toBeTruthy()
  })

  it('makes the recommendation and requirements clear without downloading until the user starts it', () => {
    render(<ModelSetup onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Scegli il modello' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Qwen3 0.6B' })).toBeTruthy()
    expect(screen.getByText('Consigliato per questo dispositivo')).toBeTruthy()
    const essentials = screen.getByRole('list', { name: 'Download, privacy e limiti' })
    expect(essentials.textContent).toContain('Download da Hugging Face: circa 618 MB, una volta sola')
    expect(essentials.textContent).toContain('il testo non viene inviato al fornitore del modello')
    expect(essentials.textContent).toContain('Sulla CPU può essere lento')
    expect(mocks.loadModel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Scarica e avvia' }))

    expect(mocks.loadModel).toHaveBeenCalledWith('qwen3-0.6b')
  })

  it('keeps the CPU-compatible model available and explains the WebGPU requirement for other profiles', () => {
    mocks.state = createState()
    render(<ModelSetup onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Altri modelli'))

    const cpuOption = screen.getByRole('radio', { name: /Qwen3 0.6B/ }) as HTMLButtonElement
    const gpuOnlyOption = screen.getByRole('radio', { name: /LFM2\.5 350M/ }) as HTMLButtonElement
    expect(cpuOption.disabled).toBe(false)
    expect(gpuOnlyOption.disabled).toBe(true)
    expect(gpuOnlyOption.textContent).toContain('Richiede WebGPU')
  })

  it('shows the selected GPU variant when WebGPU is available', () => {
    mocks.state = createState({ caps: capabilities(true, true, 'lfm-350m') })
    render(<ModelSetup onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'LFM2.5 350M' })).toBeTruthy()
    expect(screen.getByText(/255 MB · GPU · WebGPU/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scarica e avvia' })).toBeTruthy()
  })

  it('announces the loading phase and progress', () => {
    mocks.state = createState({
      progress: { phase: 'downloading', loadedBytes: 42_000_000, totalBytes: 100_000_000 },
    })
    render(<ModelSetup onClose={vi.fn()} />)

    expect(screen.getByRole('status').textContent).toContain('Download di Qwen3 0.6B')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42')
    expect(screen.getByText(/Puoi chiudere questa finestra: il download continua/)).toBeTruthy()
  })

  it('shows a retryable error without losing the selected model', () => {
    mocks.state = createState({
      progress: { phase: 'error', loadedBytes: 0, totalBytes: 0, message: 'errore di rete' },
    })
    render(<ModelSetup onClose={vi.fn()} />)

    expect(screen.getByRole('alert').textContent).toContain('Avvio non riuscito')
    expect(screen.getByText('errore di rete')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Riprova l’avvio' }))
    expect(mocks.loadModel).toHaveBeenCalledWith('qwen3-0.6b')
  })
})

describe('ModelStatusChip', () => {
  it('offers an explicit start action and opens model setup', () => {
    const onOpen = vi.fn()
    render(<ModelStatusChip onOpen={onOpen} />)
    const button = screen.getByRole('button', { name: 'Nessun modello avviato. Apri per scegliere e avviare un modello.' })

    expect(button.textContent).toContain('Avvia modello')
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('exposes loading and error states', () => {
    mocks.state = createState({
      progress: { phase: 'downloading', loadedBytes: 0, totalBytes: 1_000 },
    })
    const { rerender } = render(<ModelStatusChip onOpen={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toContain('Download …')

    mocks.state = createState({
      progress: { phase: 'error', loadedBytes: 0, totalBytes: 0, message: 'errore di rete' },
    })
    rerender(<ModelStatusChip onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Caricamento non riuscito. Apri per riprovare.' }).textContent).toContain('Errore · riprova')
  })
})
