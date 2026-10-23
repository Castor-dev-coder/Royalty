// Tracks how many modal dialogs are currently open so floating overlays
// (toast notifications, the mobile booking button) can move out of the way
// of dialog controls instead of covering them.

let depth = 0
const listeners = new Set()

function emit() {
  const open = depth > 0
  for (const listener of listeners) listener(open)
}

export function acquireDialog() {
  depth += 1
  emit()
  return function releaseDialog() {
    depth = Math.max(0, depth - 1)
    emit()
  }
}

export function subscribeDialogs(listener) {
  listeners.add(listener)
  listener(depth > 0)
  return () => listeners.delete(listener)
}
