import { test } from "node:test";
import assert from "node:assert/strict";
// sharp is used ONLY by the tests to create realistic sample photos.
// The app itself doesn't use it (it can't run on Cloudflare Workers).
import sharp from "sharp";
import { cleanJpeg, detectImageType, processPhoto, PhotoError, photoPaths, thumbPathFor } from "../../src/lib/images";

async function phonePhotoWithGps(width = 1600, height = 1200): Promise<Uint8Array> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 150, b: 90 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestPhone", Model: "X", ImageDescription: "123 Secret St Rowville" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "37/1 55/1 34/1", GPSLongitudeRef: "E", GPSLongitude: "145/1 14/1 3/1" },
    })
    .toBuffer();
  return new Uint8Array(buf);
}

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: "#336699" } }).jpeg().toBuffer(),
  );
}

const asText = (b: Uint8Array) => Buffer.from(b).toString("latin1");

test("detects real image types from file bytes", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
  const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).webp().toBuffer();
  assert.equal(detectImageType(png), "png");
  assert.equal(detectImageType(webp), "webp");
  assert.equal(detectImageType(await jpeg(10, 10)), "jpeg");
  assert.equal(detectImageType(new TextEncoder().encode("<svg>hello</svg>")), null);
});

test("cleanJpeg removes EXIF and GPS but keeps a valid, identical-looking image", async () => {
  const input = await phonePhotoWithGps();
  assert.ok((await sharp(input).metadata()).exif, "fixture should contain EXIF");
  assert.ok(asText(input).includes("Secret St"), "fixture should contain the hidden text");

  const { width, height, clean } = cleanJpeg(input);
  assert.equal(width, 1600);
  assert.equal(height, 1200);
  assert.ok(clean.length < input.length);
  assert.ok(!asText(clean).includes("Secret St"), "hidden text must be gone");
  assert.ok(!asText(clean).includes("Exif"), "EXIF block must be gone");

  const after = await sharp(clean).metadata(); // still decodes
  assert.equal(after.exif, undefined);
  assert.equal(after.width, 1600);
  const pixelsBefore = await sharp(input).raw().toBuffer();
  const pixelsAfter = await sharp(clean).raw().toBuffer();
  assert.ok(pixelsBefore.equals(pixelsAfter), "pixels must be unchanged");
});

test("cleanJpeg drops data hidden after the end of the image", async () => {
  const base = await jpeg(200, 200);
  const sneaky = new Uint8Array([...base, ...new TextEncoder().encode("HIDDEN-PAYLOAD")]);
  const { clean } = cleanJpeg(sneaky);
  assert.ok(!asText(clean).includes("HIDDEN-PAYLOAD"));
  assert.equal((await sharp(clean).metadata()).width, 200);
});

test("cleanJpeg rejects non-JPEG and truncated files", async () => {
  assert.throws(() => cleanJpeg(new TextEncoder().encode("not an image")), PhotoError);
  const truncated = (await phonePhotoWithGps()).subarray(0, 300);
  assert.throws(() => cleanJpeg(truncated), PhotoError);
  const png = new Uint8Array(await sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } }).png().toBuffer());
  assert.throws(() => cleanJpeg(png), PhotoError);
});

test("processPhoto accepts browser-prepared photos and rejects bad ones with friendly messages", async () => {
  const full = await phonePhotoWithGps(1600, 1200);
  const thumb = await jpeg(480, 480);
  const ok = processPhoto(full, thumb, "Photo 1");
  assert.equal(ok.width, 1600);
  assert.equal((await sharp(ok.full).metadata()).exif, undefined);

  assert.throws(() => processPhoto(new Uint8Array(), thumb, "Photo 1"), /empty/);
  const tiny = await jpeg(30, 30);
  const huge = await jpeg(3000, 2000);
  assert.throws(() => processPhoto(tiny, thumb, "Photo 1"), /too small/);
  assert.throws(() => processPhoto(huge, thumb, "Photo 1"), /resized/);
  assert.throws(() => processPhoto(new TextEncoder().encode("<html>"), thumb, "Photo 1"), /couldn't be read/);
});

test("storage paths", () => {
  const p = photoPaths("r1", "p1");
  assert.equal(p.full, "reports/r1/p1.jpg");
  assert.equal(thumbPathFor(p.full), p.thumb);
});
