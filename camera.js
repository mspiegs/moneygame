// Scorecard photos: take or pick them, shrink them, and have the server read them.
import { api } from './auth.js';

const MAX_EDGE = 2000; // px on the long side: plenty for handwriting, small enough for a cell connection
const MULTI_EDGE = 1600; // several photos share one request, which the server caps at about 4.5 MB
const MAX_BODY = 4_000_000; // base64 bytes across all photos
export const MAX_PHOTOS = 4;

/** Opens the camera / photo library. Resolves to the chosen Files ([] if the user backs out). */
export function pickPhotos({ multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.style.display = 'none';
    input.onchange = () => { resolve([...(input.files || [])]); input.remove(); };
    input.oncancel = () => { resolve([]); input.remove(); };
    document.body.append(input);
    input.click();
  });
}

/** Any image the browser can decode (including iPhone HEIC) -> base64 JPEG no larger than MAX_EDGE. */
async function toJpeg(file, { edge = MAX_EDGE, quality = 0.85 } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const url = canvas.toDataURL('image/jpeg', quality);
  return { media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

/**
 * Photograph a scorecard and read it. kind: 'course' | 'round'.
 * Resolves to the server's result, or null if no photo was chosen.
 * `onReading` fires once a photo is chosen, so the UI can show progress.
 */
export async function scanScorecard(kind, context, { onReading } = {}) {
  const [file] = await pickPhotos();
  if (!file) return null;
  onReading?.();
  return readPhotos(kind, [file], context);
}

/**
 * Read one scorecard from several photos (front and back, or a card shot in pieces).
 * Shrinks harder when there are several, so they fit in one request.
 */
export async function readPhotos(kind, files, context) {
  let images;
  try {
    const opts = files.length > 1 ? { edge: MULTI_EDGE } : {};
    images = await Promise.all(files.map((f) => toJpeg(f, opts)));
    if (images.reduce((t, i) => t + i.data.length, 0) > MAX_BODY)
      images = await Promise.all(files.map((f) => toJpeg(f, { edge: 1280, quality: 0.75 })));
  } catch {
    throw new Error('Couldn’t open one of those photos. Try taking it again.');
  }
  return api('scan', { method: 'POST', body: images.length === 1 ? { kind, image: images[0], context } : { kind, images, context } });
}
