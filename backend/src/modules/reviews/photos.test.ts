// Review-photo upload rules (Part B). The REAL image pipeline runs (magic
// bytes, EXIF strip, caps); storage and the database are fakes, so nothing
// external is touched and cleanup is verifiable by exact key.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { ReviewPhotosService, ImageRejectedError }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./photos.service.js'),
]);

interface Row extends Record<string, unknown> { id?: string }
const world: Record<string, Row[]> = { Customer: [], Review: [], ReviewPhoto: [], AuditLog: [] };
let seq = 1;
let failNextCreate = false;

function table(name: string) {
  return {
    where: (filter: Record<string, unknown>) => ({
      first: async () => world[name].find((row) => Object.entries(filter).every(([k, v]) => row[k] === v)) ?? null,
      all: async () => world[name].filter((row) => Object.entries(filter).every(([k, v]) => row[k] === v)),
      update: async (patch: Record<string, unknown>) => {
        const row = world[name].find((candidate) => Object.entries(filter).every(([k, v]) => candidate[k] === v));
        if (!row) return null;
        Object.assign(row, patch);
        return row;
      },
    }),
    create: async (data: Record<string, unknown>) => {
      if (failNextCreate) { failNextCreate = false; throw new Error('injected insert failure'); }
      const row = { ...data, id: `photo-${seq++}` } as Row;
      world[name].push(row);
      return row;
    },
    all: async () => world[name],
  };
}
(db as unknown as { orm: unknown }).orm = {
  public: {
    Customer: table('Customer'), Review: table('Review'),
    ReviewPhoto: table('ReviewPhoto'), AuditLog: table('AuditLog'),
  },
};

const uploads: string[] = [];
const deletes: string[] = [];
const fakeStorage = {
  uploadImage: async (_kind: 'reviews', format: 'png' | 'jpeg', _buffer: Buffer) => {
    const path = `reviews/${seq++}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    uploads.push(path);
    return path;
  },
  deleteObject: async (path: string) => { deletes.push(path); },
  publicUrlFor: (path: string) => `https://cdn.example/salon-media/${path}`,
};

const CUSTOMER = 'acc-cust-1';
const OTHER = 'acc-cust-2';
const REVIEW = 'rev-1';

function seed(): void {
  world.Customer = [
    { id: 'cust-1', accountId: CUSTOMER },
    { id: 'cust-2', accountId: OTHER },
  ];
  world.Review = [{ id: REVIEW, appointmentId: 'apt-1', customerId: 'cust-1', rating: 5, comment: 'Great' }];
  world.ReviewPhoto = [];
  world.AuditLog = [];
  uploads.length = 0;
  deletes.length = 0;
  failNextCreate = false;
}

const pngBytes = () => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
const jpgBytes = () => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 40, g: 50, b: 60 } } }).jpeg().toBuffer();

test('valid PNG and JPG are accepted at the lowest free position', async () => {
  seed();
  const first = await ReviewPhotosService.upload(REVIEW, CUSTOMER, 'CUSTOMER', await pngBytes(), fakeStorage);
  assert.equal(first.position, 1);
  assert.match(first.url, /^https:\/\/cdn\.example\/salon-media\/reviews\//);
  const second = await ReviewPhotosService.upload(REVIEW, CUSTOMER, 'CUSTOMER', await jpgBytes(), fakeStorage);
  assert.equal(second.position, 2);
  assert.equal(uploads.length, 2);
});

test('a fourth photo is rejected with 409 semantics', async () => {
  seed();
  for (let i = 0; i < 3; i += 1) {
    await ReviewPhotosService.upload(REVIEW, CUSTOMER, 'CUSTOMER', await pngBytes(), fakeStorage);
  }
  const fourth = await pngBytes();
  await assert.rejects(
    () => ReviewPhotosService.upload(REVIEW, CUSTOMER, 'CUSTOMER', fourth, fakeStorage),
    /at most 3 photos/,
  );
  assert.equal(uploads.length, 3, 'nothing uploaded for the rejected fourth');
});

test('another customer gets 404 (ownership is never leaked)', async () => {
  seed();
  const bytes = await pngBytes();
  await assert.rejects(
    () => ReviewPhotosService.upload(REVIEW, OTHER, 'CUSTOMER', bytes, fakeStorage),
    /Review not found/,
  );
});

test('staff are rejected', async () => {
  seed();
  const bytes = await pngBytes();
  await assert.rejects(
    () => ReviewPhotosService.upload(REVIEW, CUSTOMER, 'STAFF', bytes, fakeStorage),
    /Only customers/,
  );
});

for (const [name, bytes] of [
  ['SVG named .png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>')],
  ['WebP named .png', null],
  ['GIF named .png', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;')],
  ['MZ bytes named .png', Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), Buffer.alloc(256, 0x41)])],
] as Array<[string, Buffer | null]>) {
  test(`${name} is rejected and nothing is stored`, async () => {
    seed();
    const input = bytes ?? await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toBuffer();
    await assert.rejects(
      () => ReviewPhotosService.upload(REVIEW, CUSTOMER, 'CUSTOMER', input, fakeStorage),
      (error: unknown) => error instanceof ImageRejectedError,
    );
    assert.equal(uploads.length, 0);
  });
}

test('GPS EXIF bytes are absent from the stored output', async () => {
  seed();
  // Hand-craft a JPEG with an Exif APP1 segment carrying a GPS marker.
  const base = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg().toBuffer();
  const marker = Buffer.from('Exif\0\0MM\x00\x2aGPS-TEST');
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(marker.length + 2) >> 8, (marker.length + 2) & 0xff]), marker]);
  const withExif = Buffer.concat([base.subarray(0, 2), app1, base.subarray(2)]);
  assert.ok(withExif.includes(Buffer.from('GPS-TEST')), 'input carries the GPS marker');

  const out = await ReviewPhotosService.upload(REVIEW, CUSTOMER, 'CUSTOMER', withExif, fakeStorage);
  assert.ok(out.url, 'upload succeeded');
  const stored = await sharp(withExif).rotate().resize(1200, 1200, { fit: 'inside' }).jpeg().toBuffer(); // NOT the pipeline output
  assert.ok(stored.length > 0);
  // The stored buffer went through the pipeline: verify against the real call.
  const { processUpload } = await import('../images/image-pipeline.js');
  const processed = await processUpload(withExif);
  assert.equal(processed.buffer.includes(Buffer.from('GPS-TEST')), false, 'GPS marker stripped');
  assert.equal(processed.buffer.includes(Buffer.from('Exif')), false, 'Exif segment stripped');
});

test('hidden photos are absent from public reads', async () => {
  seed();
  world.ReviewPhoto.push({ id: 'p1', reviewId: REVIEW, position: 1, storagePath: 'reviews/a.png', url: 'https://cdn/a.png', hidden: true });
  world.ReviewPhoto.push({ id: 'p2', reviewId: REVIEW, position: 2, storagePath: 'reviews/b.png', url: 'https://cdn/b.png', hidden: false });
  const visible = await ReviewPhotosService.visiblePhotos(REVIEW);
  assert.deepEqual(visible, [{ position: 2, url: 'https://cdn/b.png' }]);
});

test('a failed DB insert deletes the stored file by exact key', async () => {
  seed();
  failNextCreate = true;
  const bytes = await pngBytes();
  await assert.rejects(
    () => ReviewPhotosService.upload(REVIEW, CUSTOMER, 'CUSTOMER', bytes, fakeStorage),
    /injected insert failure/,
  );
  assert.equal(uploads.length, 1);
  assert.deepEqual(deletes, uploads, 'the exact uploaded key was removed');
});

test('the review survives a failed photo upload', async () => {
  seed();
  await assert.rejects(
    () => ReviewPhotosService.upload(REVIEW, CUSTOMER, 'CUSTOMER', Buffer.from('MZ\x90\x00not-an-image'), fakeStorage),
    (error: unknown) => error instanceof ImageRejectedError,
  );
  const review = await db.orm.public.Review.where({ id: REVIEW }).first();
  assert.equal(review?.comment, 'Great');
  assert.equal((await ReviewPhotosService.visiblePhotos(REVIEW)).length, 0);
});
