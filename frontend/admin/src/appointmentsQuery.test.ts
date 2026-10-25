import { describe, expect, it } from 'vitest';
import { fetchAppointmentsOnce, toAppointmentRow, type FetchLike } from './appointmentsQuery';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
}

const API_BODY = {
  data: {
    appointments: [
      {
        id: 'a1',
        appointmentCode: 'APT-1',
        appointmentDate: '2026-10-01',
        startTime: '00:30',
        endTime: '01:30',
        status: 'RESERVED',
        totalAmount: 1500,
        createdAt: '2026-09-30T16:30:00.000Z',
        services: [{ serviceName: 'Hair Color' }],
      },
    ],
  },
};

describe('fetchAppointmentsOnce (conditional requests)', () => {
  it('sends the last ETag as If-None-Match once conditional mode is on', async () => {
    let seen: RequestInit | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      seen = init;
      return jsonResponse(API_BODY, { headers: { ETag: 'W/"v1"' } });
    };
    const outcome = await fetchAppointmentsOnce(fetchImpl, {
      token: 't',
      etag: 'W/"v1"',
      conditional: true,
      baseUrl: 'http://api.test',
    });
    const headers = seen?.headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('W/"v1"');
    expect(outcome.kind).toBe('updated');
  });

  it('never sends If-None-Match while conditional mode is off', async () => {
    let seen: RequestInit | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      seen = init;
      return jsonResponse(API_BODY);
    };
    await fetchAppointmentsOnce(fetchImpl, { token: 't', etag: 'W/"v1"', conditional: false, baseUrl: 'http://api.test' });
    const headers = seen?.headers as Record<string, string>;
    expect(headers['If-None-Match']).toBeUndefined();
  });

  it('reports 304 as not-modified so the caller keeps its state exactly', async () => {
    const fetchImpl: FetchLike = async () => new Response(null, { status: 304 });
    const outcome = await fetchAppointmentsOnce(fetchImpl, {
      token: 't',
      etag: 'W/"v1"',
      conditional: true,
      baseUrl: 'http://api.test',
    });
    expect(outcome.kind).toBe('not-modified');
  });

  it('returns fresh rows and the readable ETag on 200', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(API_BODY, { headers: { ETag: 'W/"v2"' } });
    const outcome = await fetchAppointmentsOnce(fetchImpl, { token: 't', etag: 'W/"v1"', conditional: true, baseUrl: 'http://api.test' });
    expect(outcome.kind).toBe('updated');
    if (outcome.kind !== 'updated') return;
    expect(outcome.etag).toBe('W/"v2"');
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0]!.totalAmount).toBe(1500);
    expect(outcome.rows[0]!.createdAt).toBe('2026-09-30T16:30:00.000Z');
  });

  it('reports an unreadable ETag as null so the caller can disable conditional mode', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(API_BODY);
    const outcome = await fetchAppointmentsOnce(fetchImpl, { token: 't', etag: null, conditional: false, baseUrl: 'http://api.test' });
    expect(outcome.kind).toBe('updated');
    if (outcome.kind !== 'updated') return;
    expect(outcome.etag).toBeNull();
  });

  it('reports failure without touching any state', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ message: 'nope' }, { status: 500 });
    const outcome = await fetchAppointmentsOnce(fetchImpl, { token: 't', etag: null, conditional: false, baseUrl: 'http://api.test' });
    expect(outcome.kind).toBe('failed');
    const throwing: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect((await fetchAppointmentsOnce(throwing, { token: 't', etag: null, conditional: false, baseUrl: 'http://api.test' })).kind).toBe('failed');
  });
});

describe('toAppointmentRow', () => {
  it('keeps the booking price and creation instant for the month selector', () => {
    const row = toAppointmentRow(API_BODY.data.appointments[0]);
    expect(row.totalAmount).toBe(1500);
    expect(row.createdAt).toBe('2026-09-30T16:30:00.000Z');
    expect(row.serviceNames).toBe('Hair Color');
  });
});
