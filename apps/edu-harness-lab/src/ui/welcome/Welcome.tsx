import { ArrowRight, ChevronDown, Cpu, Download, Sparkles } from 'lucide-react'
import type { ProvenanceTag } from '../../domain/types'
import { useT } from '../../i18n'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { Button } from '../common/Button'
import { LangToggle } from '../shell/LangToggle'
import styles from './Welcome.module.css'

export function Welcome({ onStart, onConfigureModel }: { onStart: () => void; onConfigureModel: () => void }) {
  const t = useT()

  const steps = [
    {
      title: t('Parti dal modello', 'Start from the model'),
      text: t('Il modello riceve testo e produce testo.', 'The model receives text and produces text.'),
    },
    {
      title: t('Aggiungi uno strato alla volta', 'Add one layer at a time'),
      text: t('Istruzioni, memoria, documenti, strumenti e controlli.', 'Instructions, memory, documents, tools and controls.'),
    },
    {
      title: t('Osserva il motore', 'Watch the engine'),
      text: t(
        'Segui cosa riceve il modello, cosa decide e cosa fa il sistema intorno a lui.',
        'Follow what the model receives, what it decides and what the system around it does.',
      ),
    },
  ]

  const badges: { tag: ProvenanceTag; text: string }[] = [
    { tag: { provenance: 'real', locality: 'local' }, text: t('Calcolato davvero, dentro il tuo browser.', 'Really computed, inside your browser.') },
    {
      tag: { provenance: 'simulated', locality: 'local' },
      text: t('Simulazione didattica: nessun effetto reale.', 'Teaching simulation: no real effect.'),
    },
    {
      tag: { provenance: 'real', locality: 'external' },
      text: t('Eseguito davvero da un servizio esterno, via rete.', 'Really run by an external service, over the network.'),
    },
    { tag: { provenance: 'unavailable', locality: 'local' }, text: t('Non eseguibile in questo browser.', 'Cannot run in this browser.') },
  ]

  return (
    <div className={styles.root}>
      <main className={styles.inner}>
        <div className={styles.langBar}>
          <LangToggle />
        </div>

        <header className={styles.hero}>
          <p className={styles.kicker}>{t('Harness Lab · laboratorio sull’AI agentica', 'Harness Lab · a lab on agentic AI')}</p>
          <h1 className={styles.title}>{t('Dal modello all’agente.', 'From the model to the agent.')}</h1>
          <p className={styles.lead}>
            {t(
              'Il modello non cambia: riceve testo e genera testo. L’harness recupera informazioni, gli offre strumenti, coordina le azioni, controlla i risultati e può riprovare.',
              'The model does not change: it receives text and generates text. The harness retrieves information, offers it tools, coordinates actions, checks the results and can try again.',
            )}
          </p>
        </header>

        <ol className={styles.steps} aria-label={t('Come si costruisce un agente', 'How an agent is built')}>
          {steps.map((step, index) => (
            <li className={styles.step} key={index}>
              <span className={styles.stepNum} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className={styles.stepCopy}>
                <h2>{step.title}</h2>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className={styles.reality} aria-label={t('Modello reale e simulazioni didattiche', 'Real model and teaching simulations')}>
          <p className={styles.fact}>
            <Cpu className={styles.factIcon} size={18} aria-hidden="true" />
            <span className={styles.factCopy}>
              <strong>{t('Modello reale', 'Real model')}</strong>
              <span>
                {t(
                  'Gira nel browser: la scheda grafica può accelerarlo, la CPU può essere più lenta.',
                  'It runs in the browser: the graphics card can speed it up, the CPU may be slower.',
                )}
              </span>
            </span>
          </p>
          <p className={styles.fact}>
            <Sparkles className={styles.factIcon} size={18} aria-hidden="true" />
            <span className={styles.factCopy}>
              <strong>{t('Simulazione didattica', 'Teaching simulation')}</strong>
              <span>
                {t(
                  'Alcuni sistemi e azioni sono simulati: non producono effetti reali.',
                  'Some systems and actions are simulated: they have no real effects.',
                )}
              </span>
            </span>
          </p>
        </section>

        <section className={styles.actions} aria-label={t('Scegli come iniziare', 'Choose how to start')}>
          <div className={styles.ctas}>
            <Button variant="primary" size="lg" icon={<ArrowRight size={18} aria-hidden="true" />} onClick={onStart}>
              {t('Apri il laboratorio', 'Open the lab')}
            </Button>
            <Button size="lg" icon={<Cpu size={18} aria-hidden="true" />} onClick={onConfigureModel}>
              {t('Carica modello', 'Load model')}
            </Button>
          </div>
          <p className={styles.downloadNote}>
            <Download size={16} aria-hidden="true" />
            <span>
              {t(
                'Qui non parte nessun download: solo il tuo clic su «Scarica e avvia» avvia il download da Hugging Face; poi il modello resta nella cache del browser.',
                'No download starts here: only your click on “Download and start” begins the download from Hugging Face; after that the model stays in the browser cache.',
              )}
            </span>
          </p>
        </section>

        <details className={styles.disclosure}>
          <summary className={styles.summary}>
            <span>{t('Come leggere le etichette', 'How to read the labels')}</span>
            <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
          </summary>
          <ul className={styles.badges}>
            {badges.map((badge, index) => (
              <li key={index}>
                <ProvenanceBadge tag={badge.tag} />
                <span>{badge.text}</span>
              </li>
            ))}
          </ul>
        </details>

        <footer className={styles.credits}>
          <p>
            {t('Harness Lab è stato creato da', 'Harness Lab was created by')}{' '}
            <a href="https://www.monaripietro.it/" target="_blank" rel="noreferrer">Pietro Monari</a>{' '}
            {t('in collaborazione con', 'in collaboration with')}{' '}
            <a href="https://e38.it/" target="_blank" rel="noreferrer">E38 S.r.l.</a>
          </p>
          <a className={styles.creditLogoLink} href="https://e38.it/" target="_blank" rel="noreferrer" aria-label="E38 S.r.l.">
            <img className={styles.creditLogo} src="/Logo%20e38_Tavola%20disegno%201%20copia.png" alt={t('Logo E38', 'E38 logo')} />
          </a>
        </footer>
      </main>
    </div>
  )
}
