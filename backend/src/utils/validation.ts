import { z } from 'zod';

/**
 * Field-specific validation shared by the request schemas.
 *
 * Every rule here belongs to one kind of field. A name is not a phone
 * number, a peso amount is not an integer, and a time is not a number at
 * all. A single global rule would refuse perfectly good values, so each
 * helper states what its own field accepts and what it refuses.
 *
 * The rules match the ones the administrator and staff interface applies in
 * `frontend/admin/src/shared/validation.ts`, so a value the interface
 * accepts is a value the API accepts.
 */

/**
 * A personal name.
 *
 * Letters from any script are allowed, so Filipino and international names
 * survive intact: accented letters, ñ and Ñ, and the right single
 * quotation mark used in several Filipino names. Spaces, hyphens,
 * apostrophes and the full stops that separate initials and suffixes are
 * allowed too. Nothing else is: no digits, no emoji, no arbitrary symbols.
 */
const PERSON_NAME_ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}.'’\-]*(?:\s[\p{L}\p{M}\p{Zs}.'’\-]+)*$/u;

/** A suffix a name may end with, such as "Jr." or "III". */
const PERSON_NAME_SUFFIX = /\s(?:Jr\.?|Sr\.?|II|III|IV|V)$/i;

/** A value that is nothing but a suffix. That is not a name. */
const PERSON_NAME_SUFFIX_ONLY = /^(?:Jr\.?|Sr\.?|II|III|IV|V)$/i;

/** A Philippine mobile number, once the formatting has been taken off. */
const MOBILE_LOCAL = /^09\d{9}$/;
const MOBILE_INTL = /^\+63\d{10}$/;

/** The separators a phone number may be written with. */
const PHONE_SEPARATORS = /[\s().-]/g;

/**
 * Whether a value is a usable personal name.
 *
 * @param value the raw field value
 * @param allowSuffix whether a suffix such as "Jr." or "III" is allowed
 */
export function isPersonName(value: string, allowSuffix = true): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  // A suffix on its own is not a name.
  if (PERSON_NAME_SUFFIX_ONLY.test(trimmed)) return false;
  if (!PERSON_NAME_ALLOWED.test(trimmed)) return false;
  if (PERSON_NAME_SUFFIX.test(trimmed)) {
    // A field that does not take a suffix refuses one outright.
    if (!allowSuffix) return false;
    const withoutSuffix = trimmed.replace(PERSON_NAME_SUFFIX, '').trim();
    if (!withoutSuffix || !PERSON_NAME_ALLOWED.test(withoutSuffix)) return false;
  }
  return true;
}

/** The message shown when a name is not acceptable. */
export const PERSON_NAME_MESSAGE =
  'Use letters only. Spaces, hyphens, apostrophes and a suffix such as "Jr." are allowed.';

/**
 * Whether a value is a Philippine mobile number.
 *
 * Both the local form (09XXXXXXXXX) and the international form
 * (+63XXXXXXXXX) are accepted. The formatting a number is written with is
 * taken off before it is checked, so `0917-555-1100` and `09175551100` are
 * recognised as the same number. A landline is a different kind of contact
 * and is not checked here.
 */
export function isPhilippineMobile(value: string): boolean {
  const trimmed = value.trim();
  const digits = trimmed.replace(PHONE_SEPARATORS, '');
  if (MOBILE_LOCAL.test(digits)) return true;
  return MOBILE_INTL.test(trimmed.replace(/\s/g, ''));
}

/** The message shown when a mobile number is not acceptable. */
export const PHONE_MESSAGE = 'Enter a Philippine mobile number, such as 09171234567.';

/**
 * Put a mobile number into one of the two accepted forms, so the same
 * number is not stored two different ways. A number that is already in an
 * accepted form is returned unchanged apart from the formatting.
 */
export function normalizePhilippineMobile(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(PHONE_SEPARATORS, '');
  if (MOBILE_INTL.test(trimmed.replace(/\s/g, ''))) return `+${digits.replace(/^\+/, '')}`;
  if (MOBILE_LOCAL.test(digits)) return digits;
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith('63')) return `+${digits}`;
  return trimmed;
}

/** The message shown when an email address is not acceptable. */
export const EMAIL_MESSAGE = 'Enter a valid email address, such as name@example.com.';

/** The message shown when a Gmail address is required. */
export const GMAIL_MESSAGE = 'Enter a Gmail address, such as name@gmail.com.';

/**
 * Whether a value is a Gmail address.
 *
 * The domain must be exactly gmail.com. A lookalike such as
 * "gmail.com.example" or "gmail.co" is not a Gmail address. The domain is
 * matched without regard to case, because a domain is not case sensitive.
 */
export function isValidGmail(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return isValidEmail(trimmed) && trimmed.endsWith('@gmail.com');
}

/**
 * An email address as a request field.
 *
 * The address is trimmed before it is checked, so the surrounding spaces a
 * reader typed do not become part of the stored address.
 */
export function emailSchema() {
  return z.string().trim().email().max(255, 'Keep the address under 255 characters.');
}

/**
 * A Gmail address as a request field.
 *
 * This is used where an address is being set for the first time. An
 * address an account already has is not checked against this rule, so an
 * account on another domain is not asked to change it.
 */
export function gmailSchema() {
  return z
    .string()
    .trim()
    .max(255, 'Keep the address under 255 characters.')
    .refine((value) => isValidEmail(value), EMAIL_MESSAGE)
    .refine((value) => isValidGmail(value), GMAIL_MESSAGE);
}

/** The message shown when a duration is not acceptable. */
export const DURATION_MESSAGE = 'Enter the duration in whole minutes, between 1 and 300.';

/**
 * Whether a value is a usable email address.
 *
 * This checks the shape of the address and nothing more. It does not mean
 * the address exists.
 */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) return false;
  if (/\s/.test(trimmed)) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64) return false;
  if (!domain || domain.length > 253) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(domain)) return false;
  if (!/\.[A-Za-z]{2,}$/.test(domain)) return false;
  return true;
}

/**
 * A personal name as a request field.
 *
 * The value is trimmed before it is checked, so the surrounding spaces a
 * reader typed do not become part of the stored name.
 */
export function personNameSchema(allowSuffix = true) {
  return z
    .string()
    .trim()
    .min(2, 'Enter a name of at least 2 characters.')
    .max(100, 'Keep the name under 100 characters.')
    .refine((value) => !PERSON_NAME_SUFFIX_ONLY.test(value), 'Enter a name, not a suffix on its own.')
    .refine((value) => isPersonName(value, allowSuffix), PERSON_NAME_MESSAGE);
}

/**
 * A Philippine mobile number as a request field.
 *
 * The field is optional, so an empty value is accepted; a value that is
 * given has to be a mobile number.
 */
export function philippineMobileSchema() {
  return z
    .string()
    .trim()
    .max(30, 'Keep the phone number under 30 characters.')
    .refine((value) => value === '' || isPhilippineMobile(value), PHONE_MESSAGE)
    .optional()
    .transform((value) =>
      value === undefined || value === '' ? undefined : normalizePhilippineMobile(value),
    );
}

/**
 * A peso amount as a request field.
 *
 * The amount may hold two decimal places and may not be negative. A price
 * has to be above zero, so `allowZero` is off unless a workflow allows a
 * free service.
 */
export function amountSchema(options: { allowZero?: boolean } = {}) {
  return z
    .number()
    .finite('Enter a valid amount.')
    .min(0, 'The amount cannot be negative.')
    .max(1_000_000, 'Keep the amount under 1,000,000.')
    .refine((value) => options.allowZero === true || value > 0, 'The amount must be above zero.')
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
      'The amount cannot hold more than two decimal places.',
    );
}

/**
 * A duration in whole minutes as a request field.
 */
export function durationMinutesSchema() {
  return z
    .number()
    .int('The duration must be a whole number of minutes.')
    .min(1, 'The duration must be at least one minute.')
    .max(300, 'The duration cannot be more than 300 minutes.');
}

/**
 * A free-text field as a request field, such as a note or a reason.
 */
export function freeTextSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, `Keep the text under ${maxLength} characters.`)
    .refine(
      (value) => !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\r\t]/g, '')),
      'The text contains characters that cannot be stored.',
    );
}
