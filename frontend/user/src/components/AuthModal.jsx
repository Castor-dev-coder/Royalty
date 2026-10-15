import { useEffect, useRef } from 'react'

function AuthModal({ children, onClose, variant }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector('input')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[rgba(0,0,0,0.78)] p-6 backdrop-blur-[5px] max-[680px]:p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-labelledby={`${variant}-title`}
        aria-modal="true"
        className="relative max-h-[calc(100svh-48px)] w-[min(100%,510px)] overflow-y-auto rounded-[9px] border border-[rgba(212,180,92,0.22)] bg-[radial-gradient(ellipse_at_50%_0%,rgba(79,65,35,0.3),transparent_55%),linear-gradient(145deg,#14130f,#0d0d0c_70%)] shadow-[0_30px_110px_rgba(0,0,0,0.75)] [scrollbar-color:rgba(212,180,92,0.45)_transparent] max-[680px]:max-h-[calc(100svh-24px)]"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="Close"
          className="absolute top-[14px] right-[14px] z-[1] grid size-[34px] cursor-pointer place-items-center rounded-full border border-[rgba(212,180,92,0.25)] bg-[rgba(10,10,10,0.6)] text-[var(--gold)]"
          onClick={onClose}
          type="button"
        >
          <svg className="w-4 fill-none stroke-current [stroke-linecap:round] [stroke-width:1.8]" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        {children}
      </section>
    </div>
  )
}

export default AuthModal
