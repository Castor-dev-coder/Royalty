import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dismissToast, rehydrateToasts, resetToasts, showToast, subscribeToasts, type ToastItem } from './toast';

/** Minimal sessionStorage stand-in for the node test environment. */
function stubSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
  return store;
}

describe('toast store', () => {
  let latest: ToastItem[] = [];
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    stubSessionStorage();
    resetToasts();
    latest = [];
    unsubscribe = subscribeToasts((toasts) => { latest = toasts; });
  });

  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('delivers new toasts to subscribers with the given type and message', () => {
    showToast('success', 'Staff profile updated successfully.');
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ type: 'success', message: 'Staff profile updated successfully.' });
  });

  it('auto-dismisses success toasts after six seconds and errors after nine', () => {
    const successId = showToast('success', 'Saved.');
    const errorId = showToast('error', 'Failed.');
    vi.advanceTimersByTime(6001);
    expect(latest.map((toast) => toast.id)).toEqual([errorId]);
    vi.advanceTimersByTime(3000);
    expect(latest).toHaveLength(0);
    expect(latest.find((toast) => toast.id === successId)).toBeUndefined();
  });

  it('dismisses a single toast on request', () => {
    const keep = showToast('success', 'Keep me.');
    showToast('error', 'Drop me.', { durationMs: 60000 });
    const drop = latest[1].id;
    dismissToast(drop);
    expect(latest.map((toast) => toast.id)).toEqual([keep]);
  });

  it('replays only parked toasts after a reload and clears the pending list', () => {
    dismissToast(showToast('success', 'pre-reload noise'));
    const store = stubSessionStorage(); // simulate the fresh page's storage view
    // Park the same payload the pre-reload page left behind.
    store.set('royalty-admin-pending-toasts', JSON.stringify([
      { id: 42, type: 'success', message: 'Schedule updated successfully.' },
    ]));
    rehydrateToasts();
    expect(latest.map((toast) => toast.message)).toEqual(['Schedule updated successfully.']);
    expect(store.has('royalty-admin-pending-toasts')).toBe(false);
  });

  it('does not replay toasts that were consumed live', () => {
    showToast('success', 'Already seen.');
    dismissToast(latest[0].id);
    rehydrateToasts();
    expect(latest.filter((toast) => toast.message === 'Already seen.')).toHaveLength(0);
  });

  it('rehydrate is a no-op when nothing is parked', () => {
    rehydrateToasts();
    expect(latest).toHaveLength(0);
  });
});
