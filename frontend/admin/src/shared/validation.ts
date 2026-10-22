/**
 * Field-specific validation for the forms in this application.
 *
 * Every rule here belongs to one kind of field. A name is not a phone
 * number, a peso amount is not an integer, and a time is not a number at
 * all. A single global filter would break perfectly good values, so each
 * helper states what its own field accepts and what it refuses.
 *
 * The rules are deliberately the same on both sides of the wire: the shared
 * helpers in `backend/src/utils/validation.ts` enforce the same limits, so a
 * value the interface accepts is a value the API accepts.
 */

/**
 * A personal name.
 *
 * Letters from any script are allowed, so Filipino and international names
 * survive intact: accented letters, ñ and Ñ, and the right single quotation
 * mark used in several Filipino names. Spaces, hyphens, apostrophes and the
 * full stops that separate initials and suffixes are allowed too. Nothing
 * else is: no digits, no emoji, no arbitrary symbols.
 */
const NAME_ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}.'’\-]*(?:\s[\p{L}\p{M}\p{Zs}.'’\-]+)*$/u;

/** The suffix a name may end with, such as "Jr." or "III". */
const NAME_SUFFIX = /\s(?:Jr\.?|Sr\.?|II|III|IV|V)$/i;

/** A value that is nothing but a suffix. That is not a name. */
const NAME_SUFFIX_ONLY = /^(?:Jr\.?|Sr\.?|II|III|IV|V)$/i;

/** A free-text field: any letters, marks, spaces, digits and punctuation. */
const FREE_TEXT_ALLOWED = /^[^\p{Cc}\p{Cf}]{0,500}$/u;

/** Digits only, for codes such as a payment verification code. */
export const DIGITS_ONLY = /^\d+$/;

/** A Philippine mobile number, once the formatting has been taken off. */
const MOBILE_LOCAL = /^09\d{9}$/;
const MOBILE_INTL = /^\+63\d{10}$/;

/**
 * The separators a number may be written with.
 *
 * Existing records hold numbers written both ways: `09175551100` and
 * `0917-555-1100`. The formatting is taken off before the number is
 * checked, so a number that is only written differently is still the same
 * number and is not refused.
 */
const PHONE_SEPARATORS = /[\s().-]/g;

/** The digits of a phone number, with the formatting removed. */
function phoneDigits(value: string): string {
  return value.replace(PHONE_SEPARATORS, '');
}

/**
 * Whether a value is a usable personal name.
 *
 * @param value the raw field value
 * @param options.allowSuffix whether a suffix such as "Jr." or "III" is allowed
 */
export function isValidPersonName(value: string, options: { allowSuffix?: boolean } = {}): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  // A suffix on its own is not a name.
  if (NAME_SUFFIX_ONLY.test(trimmed)) return false;
  // A name may not start or end with a separator.
  if (!NAME_ALLOWED.test(trimmed)) return false;
  if (NAME_SUFFIX.test(trimmed)) {
    // A field that does not take a suffix refuses one outright.
    if (options.allowSuffix === false) return false;
    const withoutSuffix = trimmed.replace(NAME_SUFFIX, '').trim();
    if (!withoutSuffix || !NAME_ALLOWED.test(withoutSuffix)) return false;
  }
  return true;
}

/** The message shown when a name is not acceptable. */
export const PERSON_NAME_MESSAGE =
  'Use letters only. Spaces, hyphens, apostrophes and a suffix such as "Jr." are allowed.';

/**
 * The message for a name that will not be accepted.
 *
 * A value that is nothing but a suffix gets its own message, because the
 * general one would say that a suffix is allowed.
 */
export function personNameMessage(value: string): string {
  return NAME_SUFFIX_ONLY.test(value.trim())
    ? 'Enter a name, not a suffix on its own.'
    : PERSON_NAME_MESSAGE;
}

/**
 * Whether a value is a Philippine mobile number.
 *
 * Both the local form (09XXXXXXXXX) and the international form
 * (+63XXXXXXXXX) are accepted, because existing records use both. A
 * landline is a different kind of contact and is not checked here.
 */
export function isValidPhilippineMobile(value: string): boolean {
  const trimmed = value.trim();
  const digits = phoneDigits(trimmed);
  if (MOBILE_LOCAL.test(digits)) return true;
  // The international form keeps its plus sign, so it is checked on the
  // trimmed value rather than on the digits alone.
  return MOBILE_INTL.test(trimmed.replace(/\s/g, ''));
}

/** The message shown when a mobile number is not acceptable. */
export const PHONE_MESSAGE = 'Enter a Philippine mobile number, such as 09171234567.';

/**
 * Put a mobile number into one of the two accepted forms, so the same
 * number is not stored two different ways. A number that is already in an
 * accepted form is returned unchanged apart from the surrounding spaces.
 */
export function normalizePhilippineMobile(value: string): string {
  const trimmed = value.trim();
  if (MOBILE_INTL.test(trimmed.replace(/\s/g, ''))) return `+${phoneDigits(trimmed).replace(/^\+/, '')}`;
  if (MOBILE_LOCAL.test(phoneDigits(trimmed))) return phoneDigits(trimmed);
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith('63')) return `+${digits}`;
  return trimmed;
}

/**
 * Whether a value is a usable email address.
 *
 * This checks the shape of the address and nothing more. It does not mean
 * the address exists, and no interface should say that it does.
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

/** The message shown when an email address is not acceptable. */
export const EMAIL_MESSAGE = 'Enter a valid email address, such as name@example.com.';

/**
 * Whether a value is a Gmail address.
 *
 * The domain must be exactly gmail.com. A lookalike such as
 * "gmail.com.example" is not a Gmail address.
 */
export function isValidGmail(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return isValidEmail(trimmed) && trimmed.endsWith('@gmail.com');
}

/** The message shown when a Gmail address is required. */
export const GMAIL_MESSAGE = 'Enter a Gmail address, such as name@gmail.com.';

/**
 * The message for an address on an account, or an empty string when the
 * address is acceptable.
 *
 * A NEW address has to be a Gmail address. An address the account already
 * has is left alone, so an account whose address is on another domain can
 * still be saved without changing it.
 *
 * @param value the address that was typed
 * @param currentEmail the address the account already has
 */
export function accountEmailError(value: string, currentEmail?: string): string {
  const next = value.trim();
  if (!next) return 'Enter your email address.';
  if (!isValidEmail(next)) return EMAIL_MESSAGE;
  const existing = (currentEmail ?? '').trim();
  if (existing && next.toLowerCase() === existing.toLowerCase()) return '';
  return isValidGmail(next) ? '' : GMAIL_MESSAGE;
}

/**
 * Whether a value is a usable peso amount.
 *
 * Zero is allowed, because a free or promotional service is a legitimate
 * price. A negative amount is not: this application has no refund or
 * adjustment workflow that would need one.
 */
export function isValidAmount(value: string, options: { allowZero?: boolean } = {}): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return false;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return false;
  if (!options.allowZero && amount === 0) return false;
  if (amount > 1_000_000) return false;
  return true;
}

/** The message shown when an amount is not acceptable. */
export const AMOUNT_MESSAGE = 'Enter an amount in pesos, such as 800 or 800.50.';

/** The message shown when an amount has to be above zero. */
export const POSITIVE_AMOUNT_MESSAGE = 'Enter an amount in pesos above zero, such as 800 or 800.50.';

/**
 * Whether a value is a usable duration in whole minutes.
 */
export function isValidDuration(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return false;
  const minutes = Number(trimmed);
  return minutes >= 1 && minutes <= 300;
}

/** The message shown when a duration is not acceptable. */
export const DURATION_MESSAGE = 'Enter the duration in whole minutes, between 1 and 300.';

/**
 * Whether a value is acceptable free text, such as a note or a reason.
 */
export function isValidFreeText(value: string): boolean {
  return FREE_TEXT_ALLOWED.test(value);
}

/**
 * Whether a start and an end time form a usable range.
 *
 * The two are compared as minutes since midnight, so "22:00" to "02:00"
 * is refused rather than silently accepted.
 */
export function isValidTimeRange(start: string, end: string): boolean {
  if (!start || !end) return false;
  const toMinutes = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null) return false;
  return to > from;
}

/** The message shown when a time range is not usable. */
export const TIME_RANGE_MESSAGE = 'The end time must be later than the start time.';

/**
 * Whether a password meets the application's own rule: at least eight
 * characters, with an upper case letter, a lower case letter, a number and
 * a symbol.
 */
export function isValidPassword(value: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(value);
}

/** The message shown when a password does not meet the rule. */
export const PASSWORD_MESSAGE =
  'Use at least 8 characters, with an upper case letter, a lower case letter, a number and a symbol.';

/**
 * Whether two passwords match.
 */
export function passwordsMatch(password: string, confirmation: string): boolean {
  return password.length > 0 && password === confirmation;
}

/** The message shown when the two passwords do not match. */
export const PASSWORD_MATCH_MESSAGE = 'The two passwords do not match.';
