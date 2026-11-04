import { describe, expect, it } from 'vitest'
import {
  PERSON_NAME_MESSAGE,
  PHONE_MESSAGE,
  GMAIL_MESSAGE,
  EMAIL_MESSAGE,
  isPersonName,
  isPhilippineMobile,
  isValidEmail,
  isValidGmail,
  validateComment,
  validateEmail,
  validateFullName,
  validateNewPassword,
  validatePasswordConfirm,
  validatePersonName,
  validatePhone,
  validateRequiredPassword,
} from './validation.js'

describe('name rules (port of backend isPersonName / personNameSchema)', () => {
  it('accepts Filipino and international names with allowed punctuation', () => {
    for (const name of ['Juan dela Cruz', "Maria Clara Santos", 'José Rizal', 'Ñiño Garcia', 'J. R. R. Tolkien', 'Anne-Marie Cruz', 'Juan Jr.']) {
      expect(isPersonName(name), name).toBe(true)
    }
  })

  it('refuses digits, emoji, empty values, and a suffix on its own', () => {
    for (const name of ['Juan2', 'Maria 😊', '', '   ', 'Jr.', 'III', 'a']) {
      expect(isPersonName(name), name).toBe(false)
    }
  })

  it('bounds length at 2–100 characters', () => {
    expect(validatePersonName('A')).toBe('Enter a name of at least 2 characters.')
    expect(validatePersonName('A'.repeat(101))).toBe('Keep the name under 100 characters.')
  })

  it('uses the backend message for wrong characters', () => {
    expect(validatePersonName('Juan2')).toBe(PERSON_NAME_MESSAGE)
    expect(validatePersonName('Jr.')).toBe('Enter a name, not a suffix on its own.')
    expect(validatePersonName('')).toBe('Enter your name.')
  })

  it('full name needs a first and a last name (both API fields require 2+ chars)', () => {
    expect(validateFullName('Juan')).toBe('Enter your first and last name.')
    expect(validateFullName('Juan X')).toBe('Enter a name of at least 2 characters.')
    expect(validateFullName('Juan dela Cruz')).toBeNull()
    expect(validateFullName('  Juan  dela Cruz  ')).toBeNull()
  })
})

describe('phone rules (port of backend isPhilippineMobile)', () => {
  it('accepts both accepted PH mobile forms with separators', () => {
    for (const phone of ['09171234567', '0917-123-4567', '0917 123 4567', '(0917) 123-4567', '+639171234567', '+63 917 123 4567']) {
      expect(isPhilippineMobile(phone), phone).toBe(true)
    }
  })

  it('refuses landlines, short digits, and junk', () => {
    for (const phone of ['1234567', '0917123456', '091712345678', '08171234567', 'abc', '+1 555 123 4567']) {
      expect(isPhilippineMobile(phone), phone).toBe(false)
    }
  })

  it('validates live with the backend message and required/optional modes', () => {
    expect(validatePhone('')).toBe('Enter your mobile number.')
    expect(validatePhone('', { required: false })).toBeNull()
    expect(validatePhone('1234567')).toBe(PHONE_MESSAGE)
    expect(validatePhone('09171234567')).toBeNull()
    expect(validatePhone('0917 123 4567'.padEnd(31, '9'))).toBe('Keep the phone number under 30 characters.')
  })
})

describe('email rules (port of backend isValidEmail / isValidGmail)', () => {
  it('accepts ordinary addresses and the exact gmail.com domain', () => {
    expect(isValidEmail('you@example.com')).toBe(true)
    expect(isValidEmail('first.last+tag@sub.example.co.uk')).toBe(true)
    expect(isValidGmail('name@gmail.com')).toBe(true)
    expect(isValidGmail('name@GMAIL.COM')).toBe(true)
  })

  it('refuses lookalike gmail domains and broken shapes', () => {
    for (const email of ['a@b', 'a b@example.com', 'a@@example.com', '.a@example.com', 'a@example..com', 'a@example.com.']) {
      expect(isValidEmail(email), email).toBe(false)
    }
    // Lookalike domains are syntactically valid emails — only the Gmail rule
    // rejects them (same split as the backend's emailSchema vs gmailSchema).
    expect(isValidEmail('name@gmail.co')).toBe(true)
    expect(isValidGmail('name@gmail.co')).toBe(false)
    expect(isValidGmail('name@gmail.com.example')).toBe(false)
    expect(isValidGmail('name@yahoo.com')).toBe(false)
  })

  it('login accepts any valid address, sign-up requires Gmail', () => {
    expect(validateEmail('')).toBe('Enter your email address.')
    expect(validateEmail('not-an-email')).toBe(EMAIL_MESSAGE)
    expect(validateEmail('you@example.com')).toBeNull()
    expect(validateEmail('you@example.com', { gmail: true })).toBe(GMAIL_MESSAGE)
    expect(validateEmail('name@gmail.com', { gmail: true })).toBeNull()
    expect(validateEmail(`${'a'.repeat(250)}@example.com`)).toBe('Keep the address under 255 characters.')
  })
})

describe('password and comment rules', () => {
  it('new passwords need 8–100 characters', () => {
    expect(validateNewPassword('')).toBe('Create a password.')
    expect(validateNewPassword('short')).toBe('Use at least 8 characters.')
    expect(validateNewPassword('x'.repeat(101))).toBe('Keep the password under 100 characters.')
    expect(validateNewPassword('longenough')).toBeNull()
  })

  it('current password only needs to be present; confirm must match', () => {
    expect(validateRequiredPassword('')).toBe('Enter your password.')
    expect(validateRequiredPassword('anything')).toBeNull()
    expect(validatePasswordConfirm('', 'pw')).toBe('Re-enter your password to confirm it.')
    expect(validatePasswordConfirm('pw', 'other')).toBe('Passwords do not match.')
    expect(validatePasswordConfirm('pw', 'pw')).toBeNull()
  })

  it('comments are bounded at 2000 characters', () => {
    expect(validateComment('ok')).toBeNull()
    expect(validateComment('x'.repeat(2001))).toBe('Keep the comment under 2000 characters.')
    expect(validateComment('x'.repeat(2000))).toBeNull()
  })
})
