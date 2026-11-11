import { useT, useUiLang, type UiLang } from '../../i18n'
import { useLab } from '../../state/store'
import styles from './LangToggle.module.css'

const OPTIONS: { value: UiLang; label: string; title: string }[] = [
  { value: 'it', label: 'IT', title: 'Italiano' },
  { value: 'en', label: 'EN', title: 'English' },
]

/**
 * Interface language as a compact "IT | EN" toggle. Choosing a language also sets the language the
 * model reads (prompts, data, answers), so the two stay in step; the model language can still be
 * changed on its own in the side menu.
 */
export function LangToggle({ className }: { className?: string }) {
  const t = useT()
  const lang = useUiLang(s => s.lang)

  const choose = (next: UiLang) => {
    useUiLang.getState().setLang(next)
    useLab.getState().setPromptLanguage(next)
  }

  return (
    <div
      role="group"
      aria-label={t("Lingua dell'interfaccia", 'Interface language')}
      className={`${styles.group} ${className ?? ''}`}
    >
      {OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          className={styles.opt}
          aria-pressed={lang === option.value}
          title={option.title}
          onClick={() => { choose(option.value) }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
