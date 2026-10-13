// Leaves room under the server's 4 MB photo limit (decision D5).
const SMALL_ENOUGH_BYTES = 1024 * 1024;

/**
 * Shrinks a photo so its longer side is at most `maxSide` pixels, as a JPEG.
 * A photo that is already small, or a file that isn't a readable image, is
 * returned unchanged; the server rejects non-images with a clear message.
 */
export async function resizeImage(
  file: File,
  maxSide = 1600,
  quality = 0.8,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    // JPEG has no transparency, so a transparent PNG would turn black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, '') + '.jpg';
    return new File([blob], name, {type: 'image/jpeg'});
  } finally {
    bitmap.close();
  }
}
