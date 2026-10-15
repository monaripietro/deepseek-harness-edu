import { describe, expect, it } from 'vitest'
import { detectBrowserName, recommendProfile } from './capabilities'
import { PROFILES, fingerprintFor, resolveVariant } from './profiles'

describe('recommendProfile', () => {
  it('always recommends a real model, even without WebGPU', () => {
    const r = recommendProfile({ webgpu: false, shaderF16: false, browser: 'Firefox' })
    expect(r.recommended).toBe('qwen3-0.6b')
    expect(r.reasons.join(' ')).toMatch(/processore/)
  })
  it('mentions multi-core execution only when the page is cross-origin isolated', () => {
    expect(recommendProfile({ webgpu: false, shaderF16: false, browser: 'Chrome', crossOriginIsolated: true, cores: 8 }).reasons.join(' ')).toMatch(/8 core/)
    expect(recommendProfile({ webgpu: false, shaderF16: false, browser: 'Chrome', crossOriginIsolated: false }).reasons.join(' ')).toMatch(/un solo core/)
  })
})

describe('profiles', () => {
  it('runs the small models on the CPU without WebGPU', () => {
    expect(resolveVariant(PROFILES['qwen3-0.6b'], false, false)).toMatchObject({ device: 'wasm', dtype: 'q8' })
    expect(resolveVariant(PROFILES['lfm-350m'], false, false)).toBeNull()
  })
  it('uses WebGPU when present and f16-capable', () => {
    expect(resolveVariant(PROFILES['lfm-350m'], true, true)).toMatchObject({ device: 'webgpu', dtype: 'q4f16' })
    expect(recommendProfile({ webgpu: true, shaderF16: true, browser: 'Chrome' }).recommended).toBe('lfm-350m')
  })
  it('refuses the GPU-only model without WebGPU', () => {
    expect(resolveVariant(PROFILES['lfm-1.2b'], false, false)).toBeNull()
  })
  it('has a stable fingerprint per repo and dtype', () => {
    const p = PROFILES['qwen3-0.6b']
    const v = resolveVariant(p, false, false)
    if (!v) throw new Error('expected a CPU variant for qwen3-0.6b')
    expect(fingerprintFor(p, v)).toBe(fingerprintFor(p, v))
    expect(fingerprintFor(p, v)).not.toBe(fingerprintFor(p, { ...v, dtype: 'q4f16' }))
  })
})

describe('detectBrowserName', () => {
  it('detects Edge before Chrome', () => {
    expect(detectBrowserName('Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0')).toBe('Edge')
  })
})
