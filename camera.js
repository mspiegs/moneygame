// Scorecard photos: take or pick one, shrink it, and have the server read it.
import { api } from './auth.js';

const MAX_EDGE = 2000; // px on the long side: plenty for handwriting, small enough for a cell connection

/** Opens the camera / photo library. Resolves to a File, or null if the user backs out. */
function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = () => { resolve(input.files?.[0] || null); input.remove(); };
    input.oncancel = () => { resolve(null); input.remove(); };
    document.body.append(input);
    input.click();
  });
}

/** Any image the browser can decode (including iPhone HEIC) -> base64 JPEG no larger than MAX_EDGE. */
async function toJpeg(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

/**
 * Photograph a scorecard and read it. kind: 'course' | 'round'.
 * Resolves to the server's result, or null if no photo was chosen.
 * `onReading` fires once a photo is chosen, so the UI can show progress.
 */
export async function scanScorecard(kind, context, { onReading } = {}) {
  const file = await pickPhoto();
  if (!file) return null;
  onReading?.();
  let image;
  try {
    image = await toJpeg(file);
  } catch {
    throw new Error('Couldn’t open that photo. Try taking it again.');
  }
  return api('scan', { method: 'POST', body: { kind, image, context } });
}
