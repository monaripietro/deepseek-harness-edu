import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SCENARIOS } from '../../scenarios'
import { useLab } from '../../state/store'
import { ContextCard, InstructionsCard } from './cards'

const originalState = useLab.getState()

afterEach(() => {
  cleanup()
  useLab.setState(originalState, true)
})

describe('scenario-specific information cards', () => {
  it.each(SCENARIOS)('$id displays its own task data', (scenario) => {
    useLab.setState({ scenarioId: scenario.id })
    const view = render(<ContextCard active lit={false} />)
    for (const item of scenario.context.taskData) {
      expect(view.container.textContent).toContain(item.title)
      expect(view.container.textContent).toContain(item.text.length > 260 ? `${item.text.slice(0, 259)}…` : item.text)
    }
    if (scenario.id !== 'notebook-nuovi-assunti') expect(view.container.textContent).not.toContain('Marco Rinaldi')
  })

  it('updates task facts and scenario instructions when the selection changes', () => {
    useLab.setState({ scenarioId: 'notebook-nuovi-assunti' })
    const view = render(<><ContextCard active lit={false} /><InstructionsCard active lit={false} /></>)
    expect(view.container.textContent).toContain('Marco Rinaldi')
    act(() =>{  useLab.getState().setScenario('margine-commessa') })
    expect(view.container.textContent).not.toContain('Marco Rinaldi')
    expect(view.container.textContent).toContain('Bianchi')
    expect(view.container.textContent).toContain(SCENARIOS.find(scenario => scenario.id === 'margine-commessa')?.context.instructions)
  })
})
