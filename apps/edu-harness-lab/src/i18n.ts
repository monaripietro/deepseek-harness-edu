import { create } from 'zustand'

/**
 * Interface language (Italian or English). Texts are written inline, side by side, so the two
 * versions are never out of sync and nothing needs a key registry:
 *
 *   React components:  const t = useT();  …  {t('Avvia la richiesta', 'Run the request')}
 *   anywhere else:     tr('Avvia la richiesta', 'Run the request')   (read at call time)
 *   tables of labels:  const LABEL: Record<Phase, Bi> = { idle: ['In attesa', 'Waiting'], … };  pick(LABEL[p])
 *
 * The language of what the MODEL reads (prompts, scenario data, tool results) is a separate
 * setting (`promptLanguage` in the store); choosing the interface language also sets it.
 */
export type UiLang = 'it' | 'en'
/** An Italian/English pair. */
export type Bi = readonly [it: string, en: string]

const KEY = 'harness-lab:ui-language'

function initialLang(): UiLang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang')
    if (q === 'en' || q === 'it') return q
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'it') return saved
  } catch {
    /* no window / storage: default */
  }
  return 'it'
}

interface UiLangState {
  lang: UiLang
  setLang: (lang: UiLang) => void
}

export const useUiLang = create<UiLangState>()(set => ({
  lang: initialLang(),
  setLang: (lang) => {
    set({ lang })
    try {
      localStorage.setItem(KEY, lang)
      document.documentElement.lang = lang
    } catch {
      /* storage unavailable */
    }
  },
}))

/** Current interface language, read at call time (outside React, or in event handlers). */
export const uiLang = (): UiLang => useUiLang.getState().lang

/** Italian or English text for the current interface language (outside React). */
export function tr(it: string, en: string): string {
  return uiLang() === 'en' ? en : it
}

/** Pick from an Italian/English pair. */
export function pick(pair: Bi, lang: UiLang = uiLang()): string {
  return lang === 'en' ? pair[1] : pair[0]
}

/** React hook: a `t(it, en)` bound to the current interface language; re-renders on change. */
export function useT(): (it: string, en: string) => string {
  const lang = useUiLang(s => s.lang)
  return (it, en) => (lang === 'en' ? en : it)
}

try {
  document.documentElement.lang = useUiLang.getState().lang
} catch {
  /* no document (tests) */
}

/**
 * A table of labels whose values follow the interface language at READ time, with the same type
 * as a plain `Record<K, string>`: existing call sites (`LABEL[key]`) keep working unchanged.
 *   export const STOP_LABEL = biRecord<StopReason>({ final_answer: ['Risposta finale', 'Final answer'], … })
 */
export function biRecord<K extends string>(pairs: Record<K, Bi>): Record<K, string> {
  const out = {} as Record<K, string>
  for (const key of Object.keys(pairs) as K[]) {
    Object.defineProperty(out, key, { enumerable: true, get: () => pick(pairs[key]) })
  }
  return out
}
