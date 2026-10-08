import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../course-image.js', import.meta.url), 'utf8');

function harness({ bitmap, decoder, bitmapError = false } = {}) {
  const calls = { bitmap: 0, heic: 0, drawn: 0, encoded: 0, freed: 0 };
  const canvas = () => ({
    width: 0, height: 0,
    getContext() { return { fillRect() {}, putImageData() {}, drawImage() { calls.drawn++; }, set fillStyle(_) {} }; },
    toDataURL(_type, quality) {
      calls.encoded++;
      const length = Math.round(this.width * this.height * quality * 1.4);
      return 'data:image/jpeg;base64,' + 'a'.repeat(length);
    }
  });
  class Pixels {
    constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
  }
  const context = vm.createContext({
    Blob, ImageData: Pixels, document: { createElement: canvas },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Image: class { width = 640; height = 480; set src(_) { queueMicrotask(() => this.onload()); } },
    createImageBitmap: async () => { calls.bitmap++; if (bitmapError) throw Error('decode failed'); return bitmap || { width: 1600, height: 1200, close() {} }; },
    CoursewiseBuildLibheif: () => ({
      HeifDecoder: class {
        decoder = {};
        decode() { calls.heic++; return decoder?.() || [{ get_width: () => 512, get_height: () => 512,
          display: (pixels, done) => done(pixels), free() { calls.freed++; } }]; }
      },
      heif_context_free() {}
    })
  });
  vm.runInContext(source, context);
  return { image: context.CoursewiseCourseImage, calls };
}

test('JPEG uploads are resized and compressed to the server limit', async () => {
  const { image, calls } = harness();
  const result = await image.prepare(new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }));
  assert.match(result, /^data:image\/jpeg;base64,/);
  assert.ok(result.length <= 700000);
  assert.equal(calls.bitmap, 1);
  assert.ok(calls.encoded > 1, 'large image should be recompressed at a lower quality');
});

test('image element fallback accepts a JPEG when bitmap decoding fails', async () => {
  const { image } = harness({ bitmapError: true });
  assert.match(await image.prepare(new Blob(['jpeg bytes'], { type: 'image/jpeg' })), /^data:image\/jpeg;base64,/);
});

test('HEIC is detected from file contents and converted before JPEG encoding', async () => {
  const { image, calls } = harness();
  const bytes = Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112, 104, 101, 105, 99, 0]);
  assert.match(await image.prepare(new Blob([bytes], { type: 'application/octet-stream' })), /^data:image\/jpeg;base64,/);
  assert.equal(calls.heic, 1);
  assert.equal(calls.bitmap, 0);
  assert.equal(calls.freed, 1);
  assert.match(image.accept, /\.heic/);
});
