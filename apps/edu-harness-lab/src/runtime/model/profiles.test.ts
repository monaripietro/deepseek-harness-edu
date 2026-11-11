import { describe, expect, it } from 'vitest'
import { useUiLang } from '../../i18n'
import { recommendProfile } from './capabilities'
import { PROFILE_LIST, PROFILES, resolveVariant } from './profiles'

describe('profile texts follow the interface language', () => {
  it('translates the descriptions and keeps the model names', () => {
    expect(PROFILES['qwen3-0.6b'].params).toBe('600 milioni di parametri')
    useUiLang.setState({ lang: 'en' })
    try {
      expect(PROFILES['qwen3-0.6b'].params).toBe('600 million parameters')
      expect(PROFILES['qwen3-0.6b'].label).toBe('Qwen3 0.6B')
    } finally {
      useUiLang.setState({ lang: 'it' })
    }
  })
})

describe('Emma-6 profile', () => {
  it('pins the direct GGUF source and does not recommend Emma automatically', () => {
    const emma = PROFILES['emma-6']

    expect(emma).toMatchObject({
      runtime: 'wllama',
      repo: 'PaoloneSborracchione/emma-6-GGUF',
      modelFile: 'emma-6-Q4_K_M.gguf',
      quantization: 'Q4_K_M',
      modelSizeBytes: 1_024_069_952,
      contextLength: 4096,
      toolFormat: null,
    })
    expect(PROFILE_LIST.at(-1)?.id).toBe('emma-6')
    expect(recommendProfile({ webgpu: true, shaderF16: true, browser: 'Chrome' }).recommended).not.toBe('emma-6')
    expect(recommendProfile({ webgpu: false, shaderF16: false, browser: 'Firefox' }).recommended).not.toBe('emma-6')
  })

  it('uses WebGPU when available and remains selectable on WASM otherwise', () => {
    const emma = PROFILES['emma-6']

    expect(resolveVariant(emma, true, false)).toMatchObject({ runtime: 'wllama', device: 'webgpu', dtype: 'Q4_K_M' })
    expect(resolveVariant(emma, false, false)).toMatchObject({ runtime: 'wllama', device: 'wasm', dtype: 'Q4_K_M' })
  })
})
