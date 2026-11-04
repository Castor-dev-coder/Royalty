import { useCallback, useRef, useState } from 'react'

// Live field validation for the customer forms. Every rule here is a
// JavaScript port of the backend request contract (backend/src/utils/
// validation.ts and backend/src/schemas/index.ts), so a value these
// validators accept is a value the API accepts — and the messages use the
// backend's own wording wherever the backend states one.
//
// What each field takes:
//   - login email        any valid address (loginSchema → emailSchema)
//   - sign-up email      a Gmail address (registerSchema → gmailSchema)
//   - personal name      letters (any script), spaces, hyphens, apostrophes,
//                        periods, optional suffix ("Jr."); 2–100 chars
//   - phone              Philippine mobile: 09XXXXXXXXX or +63XXXXXXXXX,
//                        separators (space . ( ) -) allowed; max 30 chars
//   - new password       8–100 characters
//   - reference number   GCash reference, min 3 characters (payments.js)
//   - review comment     up to 2000 characters

export const EMAIL_MESSAGE = 'Enter a valid email address, such as name@example.com.'
export const GMAIL_MESSAGE = 'Enter a Gmail address, such as name@gmail.com.'
export const PERSON_NAME_MESSAGE =
  'Use letters only. Spaces, hyphens, apostrophes and a suffix such as "Jr." are allowed.'
export const PHONE_MESSAGE = 'Enter a Philippine mobile number, such as 09171234567.'
export const PASSWORD_LENGTH_MESSAGE = 'Use at least 8 characters.'
export const PASSWORD_TOO_LONG_MESSAGE = 'Keep the password under 100 characters.'
export const PASSWORDS_DIFFER_MESSAGE = 'Passwords do not match.'
export const COMMENT_MESSAGE = (max) => `Keep the comment under ${max} characters.`

// ---- name (port of isPersonName / personNameSchema) ----
const PERSON_NAME_ALLOWED =
  /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}.'’\-\s]*$/u
const PERSON_NAME_SUFFIX = /\s(?:Jr\.?|Sr\.?|II|III|IV|V)$/i
const PERSON_NAME_SUFFIX_ONLY = /^(?:Jr\.?|Sr\.?|II|III|IV|V)$/i

export function isPersonName(value, allowSuffix = true) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return false
  if (trimmed.length < 2 || trimmed.length > 100) return false
  if (PERSON_NAME_SUFFIX_ONLY.test(trimmed)) return false
  if (!PERSON_NAME_ALLOWED.test(trimmed)) return false
  if (PERSON_NAME_SUFFIX.test(trimmed)) {
    if (!allowSuffix) return false
    const withoutSuffix = trimmed.replace(PERSON_NAME_SUFFIX, '').trim()
    if (!withoutSuffix || !PERSON_NAME_ALLOWED.test(withoutSuffix)) return false
  }
  return true
}

// ---- phone (port of isPhilippineMobile) ----
const MOBILE_LOCAL = /^09\d{9}$/
const MOBILE_INTL = /^\+63\d{10}$/
const PHONE_SEPARATORS = /[\s().-]/g

export function isPhilippineMobile(value) {
  const trimmed = String(value ?? '').trim()
  const digits = trimmed.replace(PHONE_SEPARATORS, '')
  if (MOBILE_LOCAL.test(digits)) return true
  return MOBILE_INTL.test(trimmed.replace(/\s/g, ''))
}

// ---- email (port of isValidEmail / isValidGmail) ----
const EMAIL_LOCAL_ALLOWED = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/
const EMAIL_DOMAIN_ALLOWED =
  /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/

export function isValidEmail(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed || trimmed.length > 255) return false
  if (/\s/.test(trimmed)) return false
  const parts = trimmed.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  if (!local || local.length > 64) return false
  if (!domain || domain.length > 253) return false
  if (!domain.includes('.')) return false
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false
  if (!EMAIL_LOCAL_ALLOWED.test(local)) return false
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  if (!EMAIL_DOMAIN_ALLOWED.test(domain)) return false
  if (!/\.[A-Za-z]{2,}$/.test(domain)) return false
  return true
}

export function isValidGmail(value) {
  const trimmed = String(value ?? '').trim().toLowerCase()
  return isValidEmail(trimmed) && trimmed.endsWith('@gmail.com')
}

// ---- field validators: value in, message-or-null out ----

export function validateEmail(value, { gmail = false, emptyMessage = 'Enter your email address.' } = {}) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return emptyMessage
  if (trimmed.length > 255) return 'Keep the address under 255 characters.'
  if (!isValidEmail(trimmed)) return EMAIL_MESSAGE
  if (gmail && !isValidGmail(trimmed)) return GMAIL_MESSAGE
  return null
}

export function validatePersonName(value, { emptyMessage = 'Enter your name.' } = {}) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return emptyMessage
  if (trimmed.length < 2) return 'Enter a name of at least 2 characters.'
  if (trimmed.length > 100) return 'Keep the name under 100 characters.'
  if (PERSON_NAME_SUFFIX_ONLY.test(trimmed)) return 'Enter a name, not a suffix on its own.'
  if (!isPersonName(trimmed)) return PERSON_NAME_MESSAGE
  return null
}

// The sign-up form has one name box that feeds BOTH firstName and lastName
// (the request needs each to be a valid person name of 2+ characters), so a
// single name is not enough — catch it here instead of at the API.
export function validateFullName(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return 'Enter your name.'
  const parts = trimmed.split(/\s+/)
  if (parts.length < 2) return 'Enter your first and last name.'
  for (const part of [parts[0], parts.slice(1).join(' ')]) {
    const message = validatePersonName(part)
    if (message) return message
  }
  return null
}

export function validatePhone(value, { required = true, emptyMessage = 'Enter your mobile number.' } = {}) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return required ? emptyMessage : null
  if (trimmed.length > 30) return 'Keep the phone number under 30 characters.'
  if (!isPhilippineMobile(trimmed)) return PHONE_MESSAGE
  return null
}

export function validateNewPassword(value, { emptyMessage = 'Create a password.' } = {}) {
  const raw = String(value ?? '')
  if (!raw) return emptyMessage
  if (raw.length < 8) return PASSWORD_LENGTH_MESSAGE
  if (raw.length > 100) return PASSWORD_TOO_LONG_MESSAGE
  return null
}

export function validateRequiredPassword(value, { emptyMessage = 'Enter your password.' } = {}) {
  return String(value ?? '') ? null : emptyMessage
}

export function validatePasswordConfirm(value, password, { emptyMessage = 'Re-enter your password to confirm it.' } = {}) {
  const raw = String(value ?? '')
  if (!raw) return emptyMessage
  if (raw !== String(password ?? '')) return PASSWORDS_DIFFER_MESSAGE
  return null
}

export function validateComment(value, max = 2000) {
  return String(value ?? '').length > max ? COMMENT_MESSAGE(max) : null
}

// ---- live wiring ----

// Field error state with live re-validation: a field validates on blur, and
// then re-validates on every keystroke so the message disappears the moment
// the input becomes valid — but untouched fields are never scolded mid-typing
// before their first blur or submit.
export function useFieldErrors() {
  const [errors, setErrors] = useState({})
  const liveRef = useRef(new Set())

  const setFieldError = useCallback((name, message) => {
    setErrors((current) => {
      const next = { ...current }
      if (message) next[name] = message
      else delete next[name]
      return next
    })
  }, [])

  // Bind one input: field('email', (v) => validateEmail(v)) spread onto <input>.
  // The validator receives (value, event) so cross-field rules (confirm vs
  // password) can read sibling fields from the form without any refs.
  const field = useCallback(
    (name, validate) => ({
      onBlur: (event) => {
        liveRef.current.add(name)
        setFieldError(name, validate(event.target.value, event))
      },
      onChange: (event) => {
        if (liveRef.current.has(name)) setFieldError(name, validate(event.target.value, event))
      },
    }),
    [setFieldError],
  )

  // Submit path: show every error at once and make those fields live, so
  // typing after a failed submit fixes messages in real time.
  const submitErrors = useCallback((nextErrors) => {
    Object.keys(nextErrors).forEach((name) => liveRef.current.add(name))
    setErrors(nextErrors)
  }, [])

  return { errors, setErrors, setFieldError, field, submitErrors }
}
