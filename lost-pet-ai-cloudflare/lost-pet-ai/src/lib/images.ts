/**
 * Photo upload safety — written in plain JavaScript so it runs on Cloudflare
 * Workers (which can't run native image libraries like sharp).
 *
 * How photos flow:
 *  1. In the browser, each photo is drawn onto a canvas and saved as a new
 *     JPEG: resized to max 1600 px plus a 480 px square thumbnail. Re-drawing
 *     already drops the camera's hidden metadata.
 *  2. On the server we don't trust the browser: we check the bytes really are
 *     a JPEG, check its dimensions and size, and REMOVE every metadata segment
 *     (EXIF, GPS, XMP, comments) before storing it. So even a hand-crafted
 *     upload can't publish someone's home location.
 */

export const MAX_PHOTOS = 5;
export const MAX_FULL_BYTES = 3 * 1024 * 1024; // 3 MB after browser resizing
export const MAX_THUMB_BYTES = 400 * 1024;
export const MAX_FULL_EDGE = 2048;
export const MAX_THUMB_EDGE = 800;
export const MIN_EDGE = 64;

export class PhotoError extends Error {}

export type DetectedType = "jpeg" | "png" | "webp" | null;

export function detectImageType(bytes: Uint8Array): DetectedType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

// Start-of-frame markers carry the image dimensions.
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
// Segments that can hold metadata: APP1–APP15 (EXIF, GPS, XMP, ICC, Photoshop…) and COM (comments).
// APP0 (JFIF header) is kept; it holds no personal data.
const isMetadataMarker = (m: number) => (m >= 0xe1 && m <= 0xef) || m === 0xfe;

export interface JpegInfo {
  width: number;
  height: number;
  /** The same image with all metadata segments removed. */
  clean: Uint8Array;
}

/**
 * Walks the JPEG segment by segment. Throws PhotoError if the file is not a
 * well-formed JPEG. Returns dimensions and a metadata-free copy.
 */
export function cleanJpeg(bytes: Uint8Array): JpegInfo {
  if (detectImageType(bytes) !== "jpeg") throw new PhotoError("not a jpeg");
  const out: Uint8Array[] = [];
  const keep = (start: number, end: number) => out.push(bytes.subarray(start, end));
  keep(0, 2); // SOI
  let i = 2;
  let width = 0;
  let height = 0;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new PhotoError("corrupt jpeg");
    // Skip fill bytes
    while (bytes[i] === 0xff && i < bytes.length) i++;
    const marker = bytes[i];
    const markerStart = i - 1;
    i++;
    if (marker === 0xd9) {
      keep(markerStart, i); // EOI
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      keep(markerStart, i); // standalone markers
      continue;
    }
    if (i + 1 >= bytes.length) throw new PhotoError("truncated jpeg");
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) throw new PhotoError("truncated jpeg");
    const segmentEnd = i + length;
    if (SOF_MARKERS.has(marker)) {
      height = (bytes[i + 3] << 8) | bytes[i + 4];
      width = (bytes[i + 5] << 8) | bytes[i + 6];
    }
    if (marker === 0xda) {
      // Start of scan: the compressed image data follows until the end of the file.
      if (!width || !height) throw new PhotoError("missing frame header");
      let end = bytes.length;
      // Drop anything appended after the final EOI marker (a common place to hide data).
      for (let j = bytes.length - 2; j > segmentEnd; j--) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          end = j + 2;
          break;
        }
      }
      if (end === bytes.length && !(bytes[end - 2] === 0xff && bytes[end - 1] === 0xd9)) {
        throw new PhotoError("truncated jpeg");
      }
      keep(markerStart, end);
      break;
    }
    if (!isMetadataMarker(marker)) keep(markerStart, segmentEnd);
    i = segmentEnd;
  }
  if (!width || !height) throw new PhotoError("missing frame header");
  const total = out.reduce((n, a) => n + a.length, 0);
  const clean = new Uint8Array(total);
  let offset = 0;
  for (const part of out) {
    clean.set(part, offset);
    offset += part.length;
  }
  return { width, height, clean };
}

export interface ProcessedPhoto {
  full: Uint8Array;
  thumb: Uint8Array;
  width: number;
  height: number;
}

/** Validates and cleans one photo and its thumbnail (both prepared by the browser). */
export function processPhoto(full: Uint8Array, thumb: Uint8Array, label = "A photo"): ProcessedPhoto {
  if (full.byteLength === 0 || thumb.byteLength === 0) throw new PhotoError(`${label} is empty. Please choose it again.`);
  if (full.byteLength > MAX_FULL_BYTES || thumb.byteLength > MAX_THUMB_BYTES) {
    throw new PhotoError(`${label} is too large. Please try a different photo.`);
  }
  let fullInfo: JpegInfo;
  let thumbInfo: JpegInfo;
  try {
    fullInfo = cleanJpeg(full);
    thumbInfo = cleanJpeg(thumb);
  } catch {
    throw new PhotoError(`${label} couldn't be read. Please use a JPG, PNG or WebP photo and try again.`);
  }
  if (Math.min(fullInfo.width, fullInfo.height) < MIN_EDGE) {
    throw new PhotoError(`${label} is too small. Please upload a clearer photo.`);
  }
  if (Math.max(fullInfo.width, fullInfo.height) > MAX_FULL_EDGE || Math.max(thumbInfo.width, thumbInfo.height) > MAX_THUMB_EDGE) {
    throw new PhotoError(`${label} wasn't resized properly. Please refresh the page and try again.`);
  }
  return { full: fullInfo.clean, thumb: thumbInfo.clean, width: fullInfo.width, height: fullInfo.height };
}

export { photoPaths, thumbPathFor } from "./images-paths";
