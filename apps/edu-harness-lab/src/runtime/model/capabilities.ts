import type { CapabilityReport, ModelProfileId } from '../../domain/types'

/** Free storage needed to cache the default small model with headroom. */
export const MIN_FREE_BYTES = 1.2e9

export type BrowserName = 'Chrome' | 'Edge' | 'Firefox' | 'Safari' | 'Opera' | 'Altro'

export function detectBrowserName(ua: string): BrowserName {
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua)) return 'Opera'
  if (/Firefox\//.test(ua) || /FxiOS\//.test(ua)) return 'Firefox'
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Altro'
}

export interface RecommendInput {
  webgpu: boolean
  shaderF16: boolean
  browser: string
  /** Free bytes (quota - usage) if known. */
  freeBytes?: number
  deviceMemoryGb?: number
  maxBufferSize?: number
  crossOriginIsolated?: boolean
  cores?: number
}

/** Pure decision logic: which real model to recommend and why (plain Italian). Always a real model. */
export function recommendProfile(input: RecommendInput): { recommended: ModelProfileId; reasons: string[] } {
  const reasons: string[] = []
  if (input.webgpu && input.shaderF16 && (input.deviceMemoryGb === undefined || input.deviceMemoryGb >= 8)) {
    reasons.push('La scheda grafica è utilizzabile (WebGPU): puoi scegliere anche il modello più capace, LFM2.5 1.2B.')
  } else if (!input.webgpu) {
    reasons.push('Nessuna scheda grafica compatibile (WebGPU): nessun problema, i modelli piccoli girano sul processore.')
  }
  if (input.crossOriginIsolated) reasons.push(`Il processore può lavorare in parallelo su ${input.cores ?? 'più'} core: velocità migliore.`)
  else reasons.push('La pagina non è isolata (COOP/COEP): il modello userà un solo core, quindi sarà più lento.')
  if (input.freeBytes !== undefined && input.freeBytes < MIN_FREE_BYTES) reasons.push('Lo spazio libero nel browser è poco: scegli il modello più piccolo disponibile.')
  if (input.webgpu && input.shaderF16) {
    reasons.push('Consigliato: LFM2.5 350M sulla scheda grafica, piccolo e veloce, addestrato per usare strumenti.')
    return { recommended: 'lfm-350m', reasons }
  }
  reasons.push('Consigliato: Qwen3 0.6B sul processore. Funziona ovunque, ma ogni risposta richiede qualche decina di secondi.')
  return { recommended: 'qwen3-0.6b', reasons }
}

interface GpuAdapterLike {
  features?: { has(name: string): boolean }
  limits?: { maxBufferSize?: number; maxStorageBufferBindingSize?: number }
  info?: { vendor?: string; architecture?: string; description?: string }
  requestAdapterInfo?: () => Promise<{ vendor?: string; architecture?: string; description?: string }>
}

/** The parts of `navigator` probed here: all optional, since browsers (and test environments) expose different subsets. */
interface NavigatorLike {
  userAgent?: string
  hardwareConcurrency?: number
  /** Chromium only: approximate RAM in GB. */
  deviceMemory?: number
  gpu?: { requestAdapter?: (options: { powerPreference: 'high-performance' }) => Promise<GpuAdapterLike | null> }
  storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> }
}

/** Probes the browser. Never throws. */
export async function detectCapabilities(): Promise<CapabilityReport> {
  const nav: NavigatorLike = typeof navigator !== 'undefined' ? navigator : {}
  const browser = detectBrowserName(String(nav.userAgent ?? ''))

  let webgpu = false
  let shaderF16 = false
  let adapterInfo: CapabilityReport['adapterInfo']
  let maxBufferSize: number | undefined
  let maxStorageBufferBindingSize: number | undefined
  try {
    if (nav.gpu?.requestAdapter) {
      const adapter: GpuAdapterLike | null = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (adapter) {
        webgpu = true
        shaderF16 = Boolean(adapter.features?.has('shader-f16'))
        maxBufferSize = adapter.limits?.maxBufferSize
        maxStorageBufferBindingSize = adapter.limits?.maxStorageBufferBindingSize
        try {
          const info = adapter.info ?? (await adapter.requestAdapterInfo?.())
          if (info) {
            adapterInfo = {
              vendor: info.vendor || undefined,
              architecture: info.architecture || undefined,
              description: info.description || undefined,
            }
          }
        } catch {
          /* adapter info is optional */
        }
      }
    }
  } catch {
    webgpu = false
  }

  let storageQuotaBytes: number | undefined
  let storageUsageBytes: number | undefined
  try {
    const est = await nav.storage?.estimate?.()
    if (est) {
      storageQuotaBytes = est.quota
      storageUsageBytes = est.usage
    }
  } catch {
    /* ignore */
  }

  const deviceMemoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined
  const freeBytes =
    storageQuotaBytes !== undefined && storageUsageBytes !== undefined ? Math.max(0, storageQuotaBytes - storageUsageBytes) : undefined

  const isolated = !!(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated
  const { recommended, reasons } = recommendProfile({
    webgpu,
    shaderF16,
    browser,
    freeBytes,
    deviceMemoryGb,
    maxBufferSize,
    crossOriginIsolated: isolated,
    cores: nav.hardwareConcurrency,
  })

  return {
    webgpu,
    shaderF16,
    adapterInfo,
    maxBufferSize,
    maxStorageBufferBindingSize,
    storageQuotaBytes,
    storageUsageBytes,
    deviceMemoryGb,
    browser,
    recommended,
    reasons,
  }
}
