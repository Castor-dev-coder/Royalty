import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  ImageRejectedError,
  MAX_OUTPUT_BYTES,
  MAX_UPLOAD_BYTES,
  processUpload,
  sniffImageFormat,
} from './image-pipeline.js';

async function pngFixture(width = 200, height = 120): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#d4b45c' } }).png().toBuffer();
}

async function jpegFixture(bytes?: number): Promise<Buffer> {
  const base = await sharp({ create: { width: 200, height: 120, channels: 3, background: '#222222' } }).jpeg({ quality: 80 }).toBuffer();
  if (bytes === undefined) return base;
  // A genuinely large-but-valid JPEG: pad with legal COM segments before the
  // EOI marker until the file reaches the requested size. Decoders skip COM
  // data, so this stays a real JPEG while hitting the size exactly.
  const target = Math.max(bytes, 1024 * 1024);
  const eoi = base.subarray(base.length - 2);
  const head = base.subarray(0, base.length - 2);
  const parts: Buffer[] = [head];
  let size = head.length + 2;
  const chunk = 65533; // COM payload size (segment length field is 16-bit)
  while (size < target) {
    const payload = Math.min(chunk, target - size - 4);
    const segment = Buffer.alloc(4 + payload);
    segment[0] = 0xff;
    segment[1] = 0xfe;
    segment.writeUInt16BE(payload + 2, 2);
    parts.push(segment);
    size += segment.length;
  }
  parts.push(eoi);
  return Buffer.concat(parts);
}

test('valid PNG is accepted and stays PNG', async () => {
  const processed = await processUpload(await pngFixture());
  assert.equal(processed.format, 'png');
  assert.equal(processed.contentType, 'image/png');
  assert.ok(processed.buffer.length > 0);
  assert.ok(processed.buffer.length <= MAX_OUTPUT_BYTES);
});

test('valid JPG is accepted and stays JPG', async () => {
  const processed = await processUpload(await jpegFixture());
  assert.equal(processed.format, 'jpeg');
  assert.equal(processed.contentType, 'image/jpeg');
  assert.ok(processed.buffer.length <= MAX_OUTPUT_BYTES);
});

test('an 8 MB JPG is accepted and re-encoded under the 5 MB ceiling', async () => {
  const big = await jpegFixture(8 * 1024 * 1024);
  assert.ok(big.length > 6 * 1024 * 1024, `fixture should be large (got ${big.length})`);
  assert.ok(big.length <= MAX_UPLOAD_BYTES);
  const processed = await processUpload(big);
  assert.equal(processed.format, 'jpeg');
  assert.ok(processed.buffer.length <= MAX_OUTPUT_BYTES);
  assert.ok(processed.buffer.length <= 1024 * 1024 * 1.6, 'output should land near the 1 MB target');
});

test('a renamed .exe is rejected by its bytes, not its name', async () => {
  const renamed = Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(4096, 0x41)]);
  assert.throws(() => sniffImageFormat(renamed), ImageRejectedError);
  await assert.rejects(() => processUpload(renamed), ImageRejectedError);
});

test('SVG is rejected', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>');
  await assert.rejects(() => processUpload(svg), /SVG files are not allowed/);
});

test('WebP is rejected', async () => {
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(64)]);
  await assert.rejects(() => processUpload(webp), /WebP files are not allowed/);
});

test('GIF and HEIC are rejected', async () => {
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64)]);
  await assert.rejects(() => processUpload(gif), /GIF files are not allowed/);
  const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(64)]);
  await assert.rejects(() => processUpload(heic), /HEIC files are not allowed/);
});

test('uploads above 10 MB fail with a clear message', async () => {
  const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41);
  await assert.rejects(() => processUpload(oversized), /10 MB upload limit/);
});

test('EXIF/GPS metadata is stripped from the output', async () => {
  const withExif = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#444444' } })
    .jpeg()
    .withMetadata({
      exif: { IFD0: { Copyright: 'test-only' } },
    })
    .toBuffer();
  const before = await sharp(withExif).metadata();
  assert.ok(before.exif, 'fixture must carry EXIF to prove it is stripped');
  const processed = await processUpload(withExif);
  const after = await sharp(processed.buffer).metadata();
  assert.equal(after.exif, undefined);
});

test('EXIF orientation is applied (auto-rotate) before output', async () => {
  const sideways = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#666666' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const processed = await processUpload(sideways);
  const meta = await sharp(processed.buffer).metadata();
  assert.equal(meta.width, 100);
  assert.equal(meta.height, 200);
});

test('an absurd pixel count is rejected', async () => {
  // PNG header claiming 100000x100000 without the pixel data behind it.
  const header = Buffer.from('89504e470d0a1a0a0000000d49484452000186a0000186a00802000000', 'hex');
  await assert.rejects(() => processUpload(header), ImageRejectedError);
});

test('the pipeline never returns more than the 5 MB ceiling', async () => {
  const noisy = await jpegFixture(2 * 1024 * 1024);
  const processed = await processUpload(noisy);
  assert.ok(processed.buffer.length <= MAX_OUTPUT_BYTES);
});
