import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { acquireDialog } from '../utils/dialog-stack.js'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableWithin(panel) {
  return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  )
}

// Shared modal shell: portal, backdrop, Escape, scroll lock, focus trap, and
// focus restoration. Existing dialogs (auth, booking, lightbox, review form)
// render their own content inside this shell.
function Dialog({
  labelledBy,
  describedBy,
  onClose,
  children,
  panelClassName = 'max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-md border border-(--gold) bg-[#11110f] shadow-[0_20px_80px_rgba(0,0,0,.65)]',
  backdropClassName = 'bg-black/80 p-4 backdrop-blur-[3px]',
  initialFocusRef,
}) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const releaseDialog = acquireDialog()
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    const firstField = panel?.querySelector(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    )
    const initialFocus =
      initialFocusRef?.current ?? firstField ?? (panel ? focusableWithin(panel)[0] ?? panel : null)
    if (initialFocus instanceof HTMLElement) initialFocus.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = focusableWithin(panel)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      releaseDialog()
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
    // Setup runs once per mounted dialog; callbacks go through onCloseRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] grid place-items-center overflow-y-auto ${backdropClassName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current?.()
      }}
      role="presentation"
    >
      <section
        aria-labelledby={labelledBy}
        aria-modal="true"
        aria-describedby={describedBy}
        className={`relative ${panelClassName}`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  )
}

export default Dialog
