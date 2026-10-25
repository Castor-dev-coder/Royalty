// Hybrid auth client: the access token lives IN MEMORY only; the refresh
// token is an httpOnly cookie the browser carries with credentials: 'include'.
// A non-secret localStorage hint prevents anonymous visitors from firing a
// doomed refresh on every page load. Tokens are never logged or persisted.

import { noteFailure, noteResponse } from './outage.js'

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
const HINT_KEY = 'royalty-auth-hint'

let memoryToken = null
let memoryUser = null
// Outcome of the most recent silent refresh: 'unauthorized' (invalid/expired)
// or 'transient' (network/5xx/CSRF) — drives the FE-01 session rule.
let lastRefreshFailure = null

export class ApiError extends Error {
  constructor({ kind, status, code, message, details }) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
    this.details = details
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Cannot reach the server. Check your connection and try again.') {
    super({ kind: 'network', status: 0, code: 'NETWORK_ERROR', message })
    this.name = 'NetworkError'
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Some fields need attention.', details) {
    super({ kind: 'validation', status: 400, code: 'VALIDATION_ERROR', message, details })
    this.name = 'ValidationError'
  }
}

/** 401 (unauthenticated) or 403 (no access) — `kind` tells them apart. */
export class AuthError extends ApiError {
  constructor(kind, status, code, message) {
    super({ kind, status, code, message })
    this.name = 'AuthError'
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'That conflicts with the current state.', code = 'CONFLICT') {
    super({ kind: 'conflict', status: 409, code, message })
    this.name = 'ConflictError'
  }
}

export class ServerError extends ApiError {
  constructor(status, message = 'The server had a problem. Try again shortly.', code) {
    super({ kind: 'server', status, code, message })
    this.name = 'ServerError'
  }
}

/**
 * Resolved value of a conditional GET whose If-None-Match matched (HTTP 304):
 * the caller keeps its current state untouched — no re-render, no flicker.
 */
export const NOT_MODIFIED = Symbol.for('royalty.not-modified')

// Last ETag seen per request path (query included), sent back as If-None-Match
// on conditional GETs. In-memory only; nothing is written to storage.
const etagByPath = new Map()

// --- in-memory session (tokens are never written to web storage) ------------

export function setSession({ user, accessToken }) {
  memoryUser = user
  memoryToken = accessToken
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    /* the hint is optional */
  }
}

export function getSessionUser() {
  return memoryUser
}

export function getAccessToken() {
  return memoryToken
}

export function clearSession() {
  memoryUser = null
  memoryToken = null
  try {
    localStorage.removeItem(HINT_KEY)
  } catch {
    /* ignore */
  }
}

export function hasAuthHint() {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function lastRefreshOutcome() {
  return lastRefreshFailure
}

export function displayNameFor(email) {
  return (
    String(email || '')
      .split('@')[0]
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Guest'
  )
}

/** Reads the JWT claims (no verification — the server already verified). */
export function decodeJwt(token) {
  try {
    return JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

// --- request core -----------------------------------------------------------

// An aborted request is the caller's own cancellation — never an outage
// signal, and never a session verdict.
function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 20
}

function errorFromResponse(status, payload) {
  const error = payload && typeof payload === 'object' ? payload.error : null
  const message = (error && error.message) || undefined
  const code = (error && error.code) || undefined
  const details = (error && error.details) || undefined
  if (status === 400) return new ValidationError(message, details)
  if (status === 401) return new AuthError('unauthenticated', 401, code, message || 'Please sign in to continue.')
  if (status === 403) return new AuthError('no-access', 403, code, message || 'Your account does not have access to this.')
  if (status === 409) return new ConflictError(message, code)
  return new ServerError(status, message, code)
}

/**
 * Silent refresh against the httpOnly cookie. Returns true when a new access
 * token is in memory; records WHY it failed for the FE-01 rule.
 *
 * Single-flight: refresh tokens rotate on use, so two concurrent refreshes
 * (e.g. the silent restore plus a 401-triggered retry on the same page load)
 * would spend each other's one-time token. Callers share one in-flight call.
 */
let refreshInFlight = null

export function tryRefresh() {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = performRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function performRefresh() {
  lastRefreshFailure = null
  let response
  try {
    response = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Auth-Mode': 'cookie' },
    })
  } catch {
    lastRefreshFailure = 'transient'
    noteFailure()
    return false
  }
  if (!response.ok) {
    lastRefreshFailure = response.status === 401 ? 'unauthorized' : 'transient'
    if (response.status >= 500) noteFailure()
    else noteResponse()
    return false
  }
  const payload = await response.json().catch(() => null)
  const accessToken = payload && typeof payload === 'object' ? payload.data?.accessToken ?? payload.accessToken : null
  if (typeof accessToken !== 'string' || accessToken === '') {
    lastRefreshFailure = 'transient'
    return false
  }
  memoryToken = accessToken
  const claims = decodeJwt(accessToken)
  if (claims) {
    memoryUser = { id: claims.sub, email: claims.email, role: claims.role, name: displayNameFor(claims.email) }
  }
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    /* ignore */
  }
  noteResponse()
  return true
}

export async function apiFetch(path, { method = 'GET', body, headers = {}, retryOn401 = true, conditional = false } = {}) {
  const doFetch = () =>
    fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {}),
        ...(conditional && etagByPath.has(path) ? { 'If-None-Match': etagByPath.get(path) } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

  // Records the resource's ETag and answers a matched conditional GET with
  // the NOT_MODIFIED sentinel (state on screen is still current).
  const settle = (response) => {
    const etag = response.headers?.get?.('etag')
    if (etag) etagByPath.set(path, etag)
    return response.status === 304 ? NOT_MODIFIED : undefined
  }

  let response
  try {
    response = await doFetch()
  } catch (error) {
    // A transport failure is never a session verdict (FE-01: never clear).
    lastRefreshFailure = 'transient'
    if (!isAbortError(error)) noteFailure()
    throw new NetworkError()
  }
  if (response.status >= 500) noteFailure()
  else noteResponse({ content: method === 'GET' && !path.startsWith('/auth') && response.ok })

  // Protected-call 401: silently refresh once, then retry the call once.
  if (response.status === 401 && retryOn401 && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      try {
        response = await doFetch()
      } catch (error) {
        lastRefreshFailure = 'transient'
        if (!isAbortError(error)) noteFailure()
        throw new NetworkError()
      }
      if (response.status >= 500) noteFailure()
      else noteResponse({ content: method === 'GET' && !path.startsWith('/auth') && response.ok })
    }
  }

  const notModified = settle(response)
  if (notModified !== undefined) return notModified
  if (response.status === 204) return null
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (response.ok) return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload
  throw errorFromResponse(response.status, payload)
}

// --- endpoints --------------------------------------------------------------

export function loginRequest(email, password, rememberMe = false) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: { email, password, ...(rememberMe ? { rememberMe: true } : {}) },
    headers: { 'X-Auth-Mode': 'cookie' },
    retryOn401: false,
  })
}

export function registerRequest(payload) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: payload,
    headers: { 'X-Auth-Mode': 'cookie' },
    retryOn401: false,
  })
}

export async function logoutRequest() {
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Auth-Mode': 'cookie' },
      retryOn401: false,
    })
  } catch {
    // Local sign-out must complete even when the server is unreachable.
  }
  clearSession()
}

/** Role-agnostic authenticated endpoint (kept for probes). */
export function fetchMe() {
  return apiFetch('/api/me')
}

export function fetchMyAppointments({ page = 1, limit = 20 } = {}) {
  // Conditional GET: the server sends an ETag and answers If-None-Match with
  // 304 (NOT_MODIFIED) so polling can leave current state untouched.
  return apiFetch(`/appointments/mine?page=${page}&limit=${limit}`, { conditional: true })
}

/** Public opening hours (no auth): { businessHours: [...] }. */
export function fetchBusinessHours() {
  return apiFetch('/schedules/business-hours')
}

export function cancelAppointmentRequest(appointmentId) {
  return apiFetch(`/appointments/${appointmentId}/status`, { method: 'PATCH', body: { status: 'CANCELLED' } })
}

export function submitReviewRequest(body) {
  return apiFetch('/reviews', { method: 'POST', body })
}

export function fetchServices() {
  return apiFetch('/services?limit=100')
}

export function fetchReviewList({ page = 1, limit = 6 } = {}) {
  return apiFetch(`/reviews?page=${page}&limit=${limit}`)
}

export function fetchEligibleStaff(serviceIds) {
  return apiFetch(`/staff/eligible?serviceIds=${encodeURIComponent(serviceIds.join(','))}`)
}

/** Public team roster for the About page (no auth, never email/phone). */
export function fetchTeam() {
  return apiFetch('/staff/team')
}

/**
 * Best stylist for a specific slot (authenticated). Returns
 * { recommended, reason, alternatives, partial, covers, needed };
 * `recommended` is null when nobody covers every category.
 */
export function fetchMatching({ serviceIds, date, startTime }) {
  const params = new URLSearchParams({
    serviceIds: serviceIds.join(','),
    date,
    startTime,
  })
  return apiFetch(`/matching?${params.toString()}`)
}

export function createAppointment(payload) {
  return apiFetch('/appointments', { method: 'POST', body: payload })
}

export function fetchMyCustomer() {
  return apiFetch('/customers/me')
}

export function updateCustomer(customerId, payload) {
  return apiFetch(`/customers/${customerId}`, { method: 'PATCH', body: payload })
}

// --- FE-01: what a 401 on a protected call means ----------------------------

/**
 * FE-01 session rule, evaluated after the refresh-retry path has run:
 *  - role known from login is not CUSTOMER  -> wrong-role denial, keep session
 *  - silent refresh failed with 401         -> token invalid/expired, clear
 *  - network errors / 5xx / CSRF failures   -> never clear
 *  - refresh succeeded but the call stayed 401 -> the token is fine, keep
 * Returns 'clear' or 'keep'.
 */
export async function sessionDispositionAfter401(role) {
  if (role && role !== 'CUSTOMER') return 'keep'
  return lastRefreshFailure === 'unauthorized' ? 'clear' : 'keep'
}
