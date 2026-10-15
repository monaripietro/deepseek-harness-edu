import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeDetails } from './NodeDetails'
import { EMPTY_STAGE } from './deriveStage'
import type { StageNodeId } from './geometry'
import { useStageUi } from './stageUi'

function SelectedNodeDetails() {
  const selected = useStageUi(state => state.selected)
  return selected === 'question' ? <NodeDetails node="question" stage={EMPTY_STAGE} onApprovalDetails={() => {}} /> : null
}

describe('NodeDetails', () => {
  let trigger: HTMLButtonElement | null = null
  let outsideButton: HTMLButtonElement | null = null
  let previousSelection: StageNodeId | null = null
  let previousFocus: HTMLElement | null = null
  let previousBodyChildren: ChildNode[] = []

  beforeEach(() => {
    previousSelection = useStageUi.getState().selected
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousBodyChildren = Array.from(document.body.childNodes)
  })

  afterEach(() => {
    cleanup()
    trigger?.remove()
    outsideButton?.remove()
    trigger = null
    outsideButton = null
    useStageUi.getState().select(previousSelection)
    if (previousFocus?.isConnected) previousFocus.focus()
    expect(useStageUi.getState().selected).toBe(previousSelection)
    expect(document.activeElement).toBe(previousFocus)
    const bodyChildren = Array.from(document.body.childNodes)
    expect(bodyChildren).toHaveLength(previousBodyChildren.length)
    previousBodyChildren.forEach((child, index) => expect(bodyChildren[index]).toBe(child))
    previousSelection = null
    previousFocus = null
    previousBodyChildren = []
  })

  it('focuses its title and closes on Escape, returning focus to the stage node', () => {
    trigger = document.createElement('button')
    trigger.dataset.node = 'question'
    document.body.append(trigger)
    trigger.focus()
    useStageUi.getState().select('question')

    render(<SelectedNodeDetails />)

    const title = screen.getByRole('heading', { name: 'La tua richiesta' })
    expect(document.activeElement).toBe(title)
    expect(screen.getByRole('dialog', { name: 'La tua richiesta' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chiudi i dettagli' }).getAttribute('aria-keyshortcuts')).toBe('Escape')

    fireEvent.keyDown(title, { key: 'Escape' })

    expect(useStageUi.getState().selected).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('leaves Escape on a control outside the panel to that control', () => {
    trigger = document.createElement('button')
    trigger.dataset.node = 'question'
    document.body.append(trigger)
    trigger.focus()
    useStageUi.getState().select('question')
    render(<SelectedNodeDetails />)

    outsideButton = document.createElement('button')
    document.body.append(outsideButton)
    outsideButton.focus()

    fireEvent.keyDown(outsideButton, { key: 'Escape' })

    expect(useStageUi.getState().selected).toBe('question')
    expect(screen.getByRole('dialog', { name: 'La tua richiesta' })).toBeTruthy()
  })

  it('closes from the labeled button and returns focus to the stage node', () => {
    trigger = document.createElement('button')
    trigger.dataset.node = 'question'
    document.body.append(trigger)
    trigger.focus()
    useStageUi.getState().select('question')
    render(<SelectedNodeDetails />)

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi i dettagli' }))

    expect(useStageUi.getState().selected).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
