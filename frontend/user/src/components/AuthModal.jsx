import Dialog from './Dialog.jsx'

// Auth dialogs share the app's modal shell (focus trap, Escape, scroll lock,
// focus restoration) with their own visual treatment.
function AuthModal({ children, onClose, variant }) {
  return (
    <Dialog
      backdropClassName="bg-[rgba(0,0,0,0.78)] p-6 backdrop-blur-[5px] max-[680px]:p-3"
      labelledBy={`${variant}-title`}
      onClose={onClose}
      panelClassName="auth-panel relative max-h-[calc(100svh-48px)] w-[min(100%,510px)] overflow-y-auto rounded-[9px] border border-[rgba(212,180,92,0.22)] bg-[radial-gradient(ellipse_at_50%_0%,rgba(79,65,35,0.3),transparent_55%),linear-gradient(145deg,#14130f,#0d0d0c_70%)] shadow-[0_30px_110px_rgba(0,0,0,0.75)] [scrollbar-color:rgba(212,180,92,0.45)_transparent] max-[680px]:max-h-[calc(100svh-24px)]"
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
      <p className="auth-note m-0 border-t border-[rgba(212,180,92,0.14)] px-6 pt-3.5 pb-4 text-center text-[0.68rem] leading-[1.5]">
        UI preview — login is not connected to the salon&apos;s live system.
      </p>
    </Dialog>
  )
}

export default AuthModal
