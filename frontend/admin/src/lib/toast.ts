/**
 * Small toast store for admin operation feedback.
 *
 * Why a plain module instead of context: the toasts are fired from deeply
 * nested handlers (modals, table rows) and only one region renders them, so
 * a subscribe store keeps the call sites to a single import.
 *
 * Reload survival: two staff-management success paths confirm their work and
 * then call window.location.reload() to refresh the table. A toast shown one
 * millisecond before that reload would vanish with the page, so every toast
 * is also parked in sessionStorage until it is either shown after a reload or
 * expires live. The key is cleared on consumption so an unrelated later
 * reload cannot replay stale messages.
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface ToastOptions {
  /** Milliseconds before auto-dismiss. Errors stay longer. */
  durationMs?: number;
}

const STORAGE_KEY = 'royalty-admin-pending-toasts';

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  for (const listener of listeners) listener([...toasts]);
}

function park(item: ToastItem) {
  try {
    const pending = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as ToastItem[];
    pending.push(item);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Storage can be unavailable (private mode); live display still works.
  }
}

function unpark() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function display(item: ToastItem, options: ToastOptions) {
  toasts = [...toasts, item];
  emit();
  const duration = options.durationMs ?? (item.type === 'error' || item.type === 'warning' ? 9000 : 6000);
  setTimeout(() => dismissToast(item.id), duration);
}

/** Show a toast and remember it until it is consumed (see module comment). */
export function showToast(type: ToastType, message: string, options: ToastOptions = {}): number {
  const item: ToastItem = { id: nextId++, type, message };
  park(item);
  display(item, options);
  return item.id;
}

export function dismissToast(id: number) {
  if (!toasts.some((item) => item.id === id)) return;
  toasts = toasts.filter((item) => item.id !== id);
  // The live toast was consumed; drop every parked copy so no later reload
  // replays a message the administrator has already seen.
  unpark();
  emit();
}

/** Clear every toast and its parked copy. Used by tests. */
export function resetToasts(): void {
  toasts = [];
  unpark();
  emit();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

/**
 * Re-display toasts that were parked just before a full page reload. Called
 * once when the toast region mounts.
 */
export function rehydrateToasts(): void {
  let pending: ToastItem[] = [];
  try {
    pending = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as ToastItem[];
  } catch {
    pending = [];
  }
  unpark();
  if (pending.length === 0) return;
  for (const item of pending) {
    // Displayed without parking again: the pending list is consumed here, so
    // a second reload must not replay these messages.
    display({ ...item, id: nextId++ }, {});
  }
}
