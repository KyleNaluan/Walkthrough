import {randomUUID} from 'node:crypto';
import {fileTypeFromBuffer} from 'file-type';
import multer from 'multer';
import {HttpError} from './errors.js';
import {getSupabaseAdmin} from './supabase.js';

/** Accepted photo types and the file extension each is stored with. */
export const PHOTO_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Under Vercel's ~4.5 MB request limit; the client shrinks photos first. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const BUCKET = 'photos';
const SIGNED_URL_SECONDS = 300;

/** Middleware that reads one `photo` file field into req.file (in memory). */
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: MAX_PHOTO_BYTES, files: 1},
}).single('photo');

export interface ValidPhoto {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

/**
 * Checks that a photo was sent and that its contents, not its name or the
 * browser's claimed type, are an accepted image.
 */
export async function validatePhoto(
  file?: Express.Multer.File,
): Promise<ValidPhoto> {
  if (!file) throw new HttpError(400, 'A photo is required');
  const type = await fileTypeFromBuffer(file.buffer);
  const extension = type && PHOTO_TYPES[type.mime];
  if (!type || !extension) {
    throw new HttpError(400, 'Photo must be a JPEG or PNG image');
  }
  return {buffer: file.buffer, mimeType: type.mime, extension};
}

/** Uploads a validated photo and returns its path in the photos bucket. */
export async function uploadPhoto(
  prefix: 'tickets' | 'fixes',
  photo: ValidPhoto,
): Promise<string> {
  const path = `${prefix}/${randomUUID()}.${photo.extension}`;
  const {error} = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, photo.buffer, {contentType: photo.mimeType});
  if (error) throw error;
  return path;
}

/**
 * Removes an uploaded photo, e.g. when saving its row failed. Best effort:
 * a failure is logged, so it never hides the error that caused the cleanup.
 */
export async function deletePhoto(path: string): Promise<void> {
  try {
    const {error} = await getSupabaseAdmin()
      .storage.from(BUCKET)
      .remove([path]);
    if (error) throw error;
  } catch (err) {
    console.error(`Could not delete photo ${path}`, err);
  }
}

/** A link to a photo that works for 5 minutes. Check access first. */
export async function signedPhotoUrl(path: string): Promise<string> {
  const {data, error} = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}
