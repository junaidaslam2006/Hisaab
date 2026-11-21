import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from './ui.jsx'
import { useCommon } from '../lib/i18n.jsx'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Modal behaviour for any dialog node: focus moves in (to [data-autofocus], else `pickInitial(focusables)`),
 * Tab stays inside, Escape calls onClose, page scroll is locked, focus returns to the opener on close.
 * Give the node tabIndex={-1}: a click on static text inside then focuses the dialog instead of <body>, so the
 * keys keep reaching it.
 */
export function useModal(ref, open, onClose, { pickInitial = els => els[0] } = {}) {
  // Keep the latest callbacks without re-running the focus effect on every parent render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const pickRef = useRef(pickInitial)
  pickRef.current = pickInitial

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const node = ref.current
    if (!node) return
    const focusables = () => [...node.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled)
    const first = node.querySelector('[data-autofocus]') || pickRef.current(focusables())
    first?.focus()
    const onKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key === 'Tab') {
        const els = focusables()
        if (!els.length) return
        const [a, z] = [els[0], els[els.length - 1]]
        const at = document.activeElement
        if (e.shiftKey && (at === a || at === node)) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && at === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    node.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      node.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [open, ref])
}

/**
 * Modal dialog: a square ink frame anchored near the top on desktop (grows downward), a bottom sheet with a
 * top hairline on phones. Closes on Escape and backdrop click; returns focus to the opener; keeps Tab inside.
 * The entrance animation plays once per open, never again when the content changes.
 */
export default function Sheet({ open, onClose, title, description, children, footer, wide }) {
  const C = useCommon()
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()
  const descId = useId()
  const [entered, setEntered] = useState(false)
  // Skip the close button (first focusable) so typing can start straight away.
  useModal(ref, open, onClose, { pickInitial: els => els[1] || els[0] })

  useEffect(() => {
    if (!open) setEntered(false)
  }, [open])

  const onAnimationEnd = e => {
    if (e.target === ref.current) setEntered(true)
  }

  if (!open) return null
  return createPortal(
    <div className={entered ? 'sheet-backdrop' : 'sheet-backdrop is-entering'} onMouseDown={e => e.target === e.currentTarget && closeRef.current()} onAnimationEnd={onAnimationEnd}>
      <div ref={ref} className={['sheet', wide && 'wide'].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}>
        <div className="sheet-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descId}>{description}</p>}
          </div>
          <IconButton icon="x" label={C.close} onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Yes/no confirmation. `danger` styles the confirm button rust. */
export function ConfirmSheet({ open, onClose, onConfirm, title, description, confirmLabel, cancelLabel, confirmDisabled, danger, busy, children }) {
  const C = useCommon()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{cancelLabel || C.cancel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} className={danger ? 'solid' : ''} loading={busy} disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Sheet>
  )
}
