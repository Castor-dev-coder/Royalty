import { describe, expect, it } from 'vitest';
import { codeMatchesSearch, codesMatch, normalizeAppointmentCode } from './appointmentCode';

describe('appointment codes', () => {
  it('normalizes case, whitespace, and bare five-digit input', () => {
    expect(normalizeAppointmentCode('12345')).toBe('APT-12345');
    expect(normalizeAppointmentCode('apt-12345')).toBe('APT-12345');
    expect(normalizeAppointmentCode(' Apt 12345 ')).toBe('APT-12345');
    expect(normalizeAppointmentCode('APT-00042')).toBe('APT-00042');
  });

  it('keeps legacy APT-<UUID> codes intact (uppercased)', () => {
    const legacy = 'APT-1675AE9E-F66D-4205-814C-0268A10124BC';
    expect(normalizeAppointmentCode(legacy.toLowerCase())).toBe(legacy);
  });

  it('matches exact codes across formats and rejects partials', () => {
    expect(codesMatch('12345', 'APT-12345')).toBe(true);
    expect(codesMatch('apt-12345', 'APT-12345')).toBe(true);
    expect(codesMatch('APT-1234', 'APT-12345')).toBe(false);
    expect(codesMatch('', '')).toBe(false);
    expect(codesMatch('APT-12345', 'APT-54321')).toBe(false);
  });

  it('search: exact normalized match wins, partial typing still filters', () => {
    expect(codeMatchesSearch('APT-12345', '12345')).toBe(true);
    expect(codeMatchesSearch('APT-12345', 'APT-12')).toBe(true);
    expect(codeMatchesSearch('APT-12345', 'APT-99999')).toBe(false);
    expect(codeMatchesSearch('APT-12345', '')).toBe(false);
  });
});
