import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, ShieldAlert, X } from 'lucide-react'
import { useLab } from '../../state/store'
import { Dialog } from '../common/Dialog'
import { Button } from '../common/Button'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import styles from './ApprovalDialog.module.css'

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

export function ApprovalDialog() {
  const req = useLab(s => s.pendingApproval)
  const decide = useLab(s => s.decideApproval)
  const reduce = useReducedMotion()

  return (
    <AnimatePresence>
      {req && (
        <Dialog key={req.id} label="L'agente chiede il tuo permesso" width={680} tone="var(--c-governance)">
          <div className={styles.wrap}>
            <motion.div
              className={styles.shield}
              initial={reduce ? false : { scale: 0.5, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              aria-hidden
            >
              <ShieldAlert size={40} />
            </motion.div>
            <h2 className={styles.title}>L&apos;AGENTE CHIEDE IL TUO PERMESSO</h2>

            <section className={styles.block}>
              <h3>Azione proposta</h3>
              <p className={styles.action}>
                {req.toolTitle} <code>{req.toolId}</code>
              </p>
            </section>

            {req.rationale && (
              <section className={styles.block}>
                <h3>Motivazione dichiarata dal modello</h3>
                <blockquote>{req.rationale}</blockquote>
                <p className={styles.hint}>
                  È un testo prodotto dal modello come parte della sua risposta, non il suo ragionamento interno.
                </p>
              </section>
            )}

            {req.dataUsed.length > 0 && (
              <section className={styles.block}>
                <h3>Dati utilizzati</h3>
                <ul>
                  {req.dataUsed.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className={styles.block}>
              <h3>Effetti previsti</h3>
              <p>{req.effects}</p>
            </section>

            {Object.keys(req.args).length > 0 && (
              <section className={styles.block}>
                <h3>Argomenti</h3>
                <dl className={styles.args}>
                  {Object.entries(req.args).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{show(v)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <div className={styles.prov}>
              <ProvenanceBadge tag={req.provenance} />
              <p>
                {req.provenance.locality === 'external'
                  ? 'La richiesta partirà verso un servizio esterno.'
                  : 'Simulazione: nessun sistema reale verrà modificato.'}
              </p>
            </div>

            <div className={styles.actions}>
              <Button variant="danger" size="lg" icon={<X size={22} />} data-autofocus onClick={() => decide('rejected')}>
                Rifiuta
              </Button>
              <Button variant="success" size="lg" icon={<Check size={22} />} onClick={() => decide('allowed-once')}>
                Approva
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
}
