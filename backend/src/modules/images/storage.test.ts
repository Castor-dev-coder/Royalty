// Regression guard for the payment-proofs bucket check. The storage API
// serves bucket routes at /storage/v1/bucket/:id (singular); the plural
// /buckets path is not routed and must not be read as a missing bucket.
// No network: fetch is mocked.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://***:***@127.0.0.1:5/route-test';
process.env.SUPABASE_URL = 'http://127.0.0.1:5';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const storage = await import('./storage.js');

function mockFetch(handler: (url: string) => Response): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    return handler(url);
  }) as typeof fetch;
  return urls;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

test('assertProofsBucket probes the singular /storage/v1/bucket/:id endpoint', async () => {
  const urls = mockFetch(() => json({ id: 'payment-proofs', public: false }));
  await storage.assertProofsBucket();
  assert.equal(urls.length, 1);
  assert.ok(
    urls[0].endsWith('/storage/v1/bucket/payment-proofs'),
    `probe must hit the singular bucket route, got: ${urls[0]}`,
  );
});

test('assertProofsBucket passes when the bucket exists and is private', async () => {
  mockFetch(() => json({ id: 'payment-proofs', public: false }));
  await storage.assertProofsBucket();
});

test('assertProofsBucket refuses a public proofs bucket', async () => {
  mockFetch(() => json({ id: 'payment-proofs', public: true }));
  await assert.rejects(() => storage.assertProofsBucket(), /must be private/);
});

test('assertProofsBucket reports a missing bucket as missing', async () => {
  mockFetch(() => json({ statusCode: 404, error: 'Not Found', message: 'Bucket not found' }, 404));
  await assert.rejects(() => storage.assertProofsBucket(), /does not exist/);
});

test('assertProofsBucket does not report an unrouted endpoint as a missing bucket', async () => {
  mockFetch(() => json({ statusCode: 404, error: 'Not Found', message: 'Route GET:/buckets/payment-proofs not found' }, 404));
  await assert.rejects(() => storage.assertProofsBucket(), /endpoint/);
});

test('uploadProof never uploads when the bucket check fails', async () => {
  const urls = mockFetch(() => json({ statusCode: 404, error: 'Not Found', message: 'Route GET:/buckets/payment-proofs not found' }, 404));
  await assert.rejects(() => storage.uploadProof('png', Buffer.from([1, 2, 3])));
  assert.equal(urls.length, 1, 'only the bucket probe may run before the upload');
});

test('signedProofUrl keeps path separators literal (encoded slashes break the signature)', async () => {
  const urls = mockFetch(() => json({ signedURL: '/object/sign/payment-proofs/payments/x.png?token=test' }));
  const signed = await storage.signedProofUrl('payments/x.png');
  assert.ok(urls[0].includes('/object/sign/payment-proofs/payments/x.png'), `separator must stay literal, got: ${urls[0].split('?')[0]}`);
  assert.ok(!urls[0].includes('payments%2F'), 'the slash between segments must not be percent-encoded');
  assert.ok(signed.startsWith('http'), 'the signed URL must be absolute');
});

test('signedProofUrl escapes characters inside a segment without touching separators', async () => {
  const urls = mockFetch(() => json({ signedURL: '/object/sign/payment-proofs/payments/a b.png?token=test' }));
  await storage.signedProofUrl('payments/a b.png');
  assert.ok(urls[0].includes('/payments/a%20b.png'), `space inside the segment must be encoded, got: ${urls[0].split('?')[0]}`);
});
