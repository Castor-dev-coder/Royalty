import { useEffect, useRef, useState } from 'react';

/**
 * The sign-out control in the side bar.
 *
 * It is shared by the administrator and the staff member, so the two behave
 * the same way: the card opens a warning, a second click asks for the
 * confirmation, and the confirmation button shows that the sign-out is
 * running. The shell decides what "signed out" means for it, through the
 * `onSignOut` callback, so the authentication handling is not repeated here.
 */
export function SignOutControl({
  label,
  initials = 'SA',
  onSignOut,
}: {
  /** The name shown on the card, and the first part of its accessible name. */
  label: string;
  /** The letters in the avatar. */
  initials?: string;
  /** Called once the sign-out is confirmed. */
  onSignOut: () => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [executing, setExecuting] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => { window.clearTimeout(closeTimer.current); }, []);

  useEffect(() => {
    if (!pending || executing) return;
    confirmRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setExecuting(false);
      setPending(false);
      setPopoverOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setPending(false);
        setPopoverOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pending, executing]);

  function keepPopoverOpen() { window.clearTimeout(closeTimer.current); setPopoverOpen(true); }
  function schedulePopoverClose() { closeTimer.current = window.setTimeout(() => setPopoverOpen(false), 180); }

  function requestSignOut() {
    if (executing) return;
    setExecuting(true);
    onSignOut();
  }

  function handlePrimaryClick() {
    if (executing) return;
    if (!pending) {
      setPending(true);
      setPopoverOpen(true);
      return;
    }
    requestSignOut();
  }

  return (
    <div
      ref={wrapRef}
      className={`signout-wrap${pending ? ' pending' : ''}`}
      onPointerEnter={keepPopoverOpen}
      onPointerLeave={schedulePopoverClose}
      onFocus={(event) => { if (event.target instanceof Element && wrapRef.current?.contains(event.target)) keepPopoverOpen(); }}
      onBlur={(event) => { if (!pending && !event.currentTarget.contains(event.relatedTarget as Node | null)) schedulePopoverClose(); }}
    >
      <div className={`signout-popover${pending ? ' pending' : ''}`} role="dialog" aria-label={pending ? 'Confirm sign out' : 'Sign out warning'} hidden={!popoverOpen}>
        <p className="signout-popover-title">{pending ? 'Are you sure?' : 'Leaving so soon?'}</p>
        <p className="signout-popover-text">{pending ? "You'll need to sign in again to access your account." : "You'll be signed out of your Royalty account."}</p>
        {pending && (
          <div className="signout-popover-actions">
            <button type="button" className="reject-action" ref={confirmRef} disabled={executing} onClick={requestSignOut}>
              {executing ? 'Signing out…' : 'Sign Out'}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => { setExecuting(false); setPending(false); setPopoverOpen(false); }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="profile-card sidebar-profile"
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
        aria-label={`${label}. Sign out`}
        onClick={handlePrimaryClick}
      >
        <div className="avatar">{initials}</div>
        <div>
          <strong>{label}</strong>
          <span>Sign out</span>
        </div>
      </button>
    </div>
  );
}
