import { useEffect, useState } from 'react';

import { dismissToast, rehydrateToasts, subscribeToasts, type ToastItem } from '../lib/toast';

/**
 * Fixed notification region for staff-management operation feedback.
 *
 * Success and info announce politely (role="status"); errors and warnings
 * interrupt (role="alert"). Every toast is dismissible, the region sits above
 * the modal layers, and parked toasts from a confirm-and-reload flow are
 * re-displayed on mount.
 */
export default function ToastRegion() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToasts(setToasts);
    rehydrateToasts();
    return unsubscribe;
  }, []);

  return (
    <div className="toast-region" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
        >
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
