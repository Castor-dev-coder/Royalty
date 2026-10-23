import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Toast from './Toast.jsx'
import { ToastContext } from '../context/toast-context.js'
import { subscribeDialogs } from '../utils/dialog-stack.js'

const MAX_VISIBLE = 3

// Transient feedback dismisses itself; errors stay until acknowledged.
const DEFAULT_DURATION = {
  success: 4500,
  info: 5000,
  warning: 7000,
  error: 0,
}

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const timersRef = useRef(new Map())
  const durationsRef = useRef(new Map())

  useEffect(() => subscribeDialogs(setDialogOpen), [])

  const clearTimer = useCallback((id) => {
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const dismissToast = useCallback(
    (id) => {
      clearTimer(id)
      durationsRef.current.delete(id)
      setToasts((current) => current.filter((toast) => toast.id !== id))
    },
    [clearTimer],
  )

  const showToast = useCallback(
    (variant, message, options = {}) => {
      const id = nextId++
      const duration = options.duration ?? DEFAULT_DURATION[variant] ?? 5000
      durationsRef.current.set(id, duration)

      setToasts((current) => {
        const next = [...current, { id, variant, message, duration }]
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next
      })

      if (duration > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => dismissToast(id), duration),
        )
      }
      return id
    },
    [dismissToast],
  )

  const pauseToast = useCallback(
    (id) => {
      clearTimer(id)
    },
    [clearTimer],
  )

  const resumeToast = useCallback(
    (id) => {
      const duration = durationsRef.current.get(id) ?? 0
      if (duration > 0 && !timersRef.current.has(id)) {
        timersRef.current.set(
          id,
          setTimeout(() => dismissToast(id), duration),
        )
      }
    },
    [dismissToast],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const api = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-label="Notifications"
        className="toast-viewport"
        data-dialog-open={dialogOpen ? 'true' : 'false'}
        role="region"
      >
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              message={toast.message}
              onClose={() => dismissToast(toast.id)}
              onPause={() => pauseToast(toast.id)}
              onResume={() => resumeToast(toast.id)}
              variant={toast.variant}
            />
          ))}
        </ol>
      </div>
    </ToastContext.Provider>
  )
}

export default ToastProvider
