import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, ShieldAlert, X } from 'lucide-react'
import { registry, useLab } from '../../state/store'
import { useT } from '../../i18n'
import { toolText } from '../../i18nContent'
import { Dialog } from '../common/Dialog'
import { Button } from '../common/Button'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import styles from './ApprovalDialog.module.css'

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

/** Localized tool title from the registry; falls back to the title carried by the request. */
const toolTitleOf = (toolId: string, fallback: string): string => {
  const def = registry.get(toolId)
  return def ? toolText(def).title : fallback
}

export function ApprovalDialog() {
  const t = useT()
  const req = useLab(s => s.pendingApproval)
  const decide = useLab(s => s.decideApproval)
  const reduce = useReducedMotion()

  return (
    <AnimatePresence>
      {req && (
        <Dialog key={req.id} label={t('L\'agente chiede il tuo permesso', 'The agent asks for your permission')} width={680} tone="var(--c-governance)">
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
            <h2 className={styles.title}>{t('L\'AGENTE CHIEDE IL TUO PERMESSO', 'THE AGENT IS ASKING FOR YOUR PERMISSION')}</h2>

            <section className={styles.block}>
              <h3>{t('Azione proposta', 'Proposed action')}</h3>
              <p className={styles.action}>
                {toolTitleOf(req.toolId, req.toolTitle)} <code>{req.toolId}</code>
              </p>
            </section>

            {req.rationale && (
              <section className={styles.block}>
                <h3>{t('Motivazione dichiarata dal modello', 'Reason stated by the model')}</h3>
                <blockquote>{req.rationale}</blockquote>
                <p className={styles.hint}>
                  {t(
                    'È un testo prodotto dal modello come parte della sua risposta, non il suo ragionamento interno.',
                    'This is text the model produced as part of its answer, not its internal reasoning.',
                  )}
                </p>
              </section>
            )}

            {req.dataUsed.length > 0 && (
              <section className={styles.block}>
                <h3>{t('Dati utilizzati', 'Data used')}</h3>
                <ul>
                  {req.dataUsed.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className={styles.block}>
              <h3>{t('Effetti previsti', 'Expected effects')}</h3>
              <p>{req.effects}</p>
            </section>

            {Object.keys(req.args).length > 0 && (
              <section className={styles.block}>
                <h3>{t('Argomenti', 'Arguments')}</h3>
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
                  ? t('La richiesta partirà verso un servizio esterno.', 'The request will be sent to an external service.')
                  : t('Simulazione: nessun sistema reale verrà modificato.', 'Simulation: no real system will be changed.')}
              </p>
            </div>

            <div className={styles.actions}>
              <Button variant="danger" size="lg" icon={<X size={22} />} data-autofocus onClick={() =>{  decide('rejected') }}>
                {t('Rifiuta', 'Reject')}
              </Button>
              <Button variant="success" size="lg" icon={<Check size={22} />} onClick={() =>{  decide('allowed-once') }}>
                {t('Approva', 'Approve')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
}
