import { ArrowRight, ChevronDown, Cpu, Download, Sparkles } from 'lucide-react'
import type { ProvenanceTag } from '../../domain/types'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { Button } from '../common/Button'
import styles from './Welcome.module.css'

const STEPS = [
  { title: 'Parti dal modello', text: 'Il modello riceve testo e produce testo.' },
  { title: 'Aggiungi uno strato alla volta', text: 'Istruzioni, memoria, documenti, strumenti e controlli.' },
  { title: 'Osserva il motore', text: 'Segui cosa riceve il modello, cosa decide e cosa fa il sistema intorno a lui.' },
]

const BADGES: { tag: ProvenanceTag; text: string }[] = [
  { tag: { provenance: 'real', locality: 'local' }, text: 'Calcolato davvero, dentro il tuo browser.' },
  { tag: { provenance: 'simulated', locality: 'local' }, text: 'Simulazione didattica: nessun effetto reale.' },
  { tag: { provenance: 'real', locality: 'external' }, text: 'Eseguito davvero da un servizio esterno, via rete.' },
  { tag: { provenance: 'unavailable', locality: 'local' }, text: 'Non eseguibile in questo browser.' },
]

export function Welcome({ onStart, onConfigureModel }: { onStart: () => void; onConfigureModel: () => void }) {
  return (
    <div className={styles.root}>
      <main className={styles.inner}>
        <header className={styles.hero}>
          <p className={styles.kicker}>Harness Lab · laboratorio sull’AI agentica</p>
          <h1 className={styles.title}>Dal modello all&apos;agente.</h1>
          <p className={styles.lead}>
            Il modello non cambia: riceve testo e genera testo. L’harness recupera informazioni, gli offre strumenti, coordina le azioni,
            controlla i risultati e può riprovare.
          </p>
        </header>

        <ol className={styles.steps} aria-label="Come si costruisce un agente">
          {STEPS.map((step, index) => (
            <li className={styles.step} key={step.title}>
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

        <section className={styles.reality} aria-label="Modello reale e simulazioni didattiche">
          <p className={styles.fact}>
            <Cpu className={styles.factIcon} size={18} aria-hidden="true" />
            <span className={styles.factCopy}>
              <strong>Modello reale</strong>
              <span>Gira nel browser: la scheda grafica può accelerarlo, la CPU può essere più lenta.</span>
            </span>
          </p>
          <p className={styles.fact}>
            <Sparkles className={styles.factIcon} size={18} aria-hidden="true" />
            <span className={styles.factCopy}>
              <strong>Simulazione didattica</strong>
              <span>Alcuni sistemi e azioni sono simulati: non producono effetti reali.</span>
            </span>
          </p>
        </section>

        <section className={styles.actions} aria-label="Scegli come iniziare">
          <div className={styles.ctas}>
            <Button variant="primary" size="lg" icon={<ArrowRight size={18} aria-hidden="true" />} onClick={onStart}>
              Apri il laboratorio
            </Button>
            <Button size="lg" icon={<Cpu size={18} aria-hidden="true" />} onClick={onConfigureModel}>
              Carica modello
            </Button>
          </div>
          <p className={styles.downloadNote}>
            <Download size={16} aria-hidden="true" />
            <span>
              Qui non parte nessun download: solo il tuo clic su «Scarica e avvia» avvia il download da Hugging Face; poi il modello resta
              nella cache del browser.
            </span>
          </p>
        </section>

        <details className={styles.disclosure}>
          <summary className={styles.summary}>
            <span>Come leggere le etichette</span>
            <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
          </summary>
          <ul className={styles.badges}>
            {BADGES.map(badge => (
              <li key={badge.text}>
                <ProvenanceBadge tag={badge.tag} />
                <span>{badge.text}</span>
              </li>
            ))}
          </ul>
        </details>
      </main>
    </div>
  )
}
