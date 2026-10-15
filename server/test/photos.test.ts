import {Router} from 'express';
import request from 'supertest';
import {describe, expect, it, vi} from 'vitest';
import {getSupabaseAdmin} from '../src/lib/supabase.js';
import {
  MAX_PHOTO_BYTES,
  photoUpload,
  signedPhotoUrl,
  uploadPhoto,
  validatePhoto,
} from '../src/lib/photos.js';
import {testApp} from './helpers/app.js';

// 1×1 images, small enough to inline.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

/** The parts of a multer file that validatePhoto reads. */
function file(buffer: Buffer, originalname: string): Express.Multer.File {
  return {buffer, originalname, size: buffer.length} as Express.Multer.File;
}

describe('validatePhoto', () => {
  it('accepts a real PNG and JPEG', async () => {
    await expect(validatePhoto(file(png, 'a.png'))).resolves.toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
    });
    await expect(validatePhoto(file(jpeg, 'a.jpg'))).resolves.toMatchObject({
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
  });

  it('refuses a text file renamed to .jpg', async () => {
    const text = Buffer.from('definitely not an image');
    await expect(validatePhoto(file(text, 'fake.jpg'))).rejects.toMatchObject({
      status: 400,
      message: 'Photo must be a JPEG or PNG image',
    });
  });

  it('refuses a missing photo', async () => {
    await expect(validatePhoto(undefined)).rejects.toMatchObject({
      status: 400,
      message: 'A photo is required',
    });
  });
});

describe('photoUpload', () => {
  const router = Router();
  router.post('/upload', photoUpload, (req, res) => {
    res.json({size: req.file?.size});
  });
  const app = testApp(router);

  it('reads a photo within the limit', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('photo', png, 'a.png');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({size: png.length});
  });

  it('refuses a photo over the limit with 413', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('photo', Buffer.alloc(MAX_PHOTO_BYTES + 1), 'big.png');
    expect(res.status).toBe(413);
    expect(res.body).toEqual({error: 'Photo is too large'});
  });
});

describe('storage', () => {
  function mockBucket(bucket: Record<string, unknown>) {
    const from = vi.fn(() => bucket);
    vi.mocked(getSupabaseAdmin).mockReturnValueOnce({
      storage: {from},
    } as unknown as ReturnType<typeof getSupabaseAdmin>);
    return from;
  }

  it('uploadPhoto stores under <prefix>/<uuid>.<ext> in the photos bucket', async () => {
    const upload = vi.fn(async () => ({error: null}));
    const from = mockBucket({upload});
    const photo = await validatePhoto(file(png, 'a.png'));
    const path = await uploadPhoto('tickets', photo);
    expect(from).toHaveBeenCalledWith('photos');
    expect(path).toMatch(/^tickets\/[0-9a-f-]{36}\.png$/);
    expect(upload).toHaveBeenCalledWith(path, png, {contentType: 'image/png'});
  });

  it('signedPhotoUrl asks for a 5-minute link (AC 7.4)', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: {signedUrl: 'https://example.test/signed'},
      error: null,
    }));
    mockBucket({createSignedUrl});
    await expect(signedPhotoUrl('tickets/x.png')).resolves.toBe(
      'https://example.test/signed',
    );
    expect(createSignedUrl).toHaveBeenCalledWith('tickets/x.png', 300);
  });

  it('signedPhotoUrl refuses a photo Storage does not have with 404 (AC 7.1)', async () => {
    mockBucket({
      createSignedUrl: async () => ({
        data: null,
        error: {statusCode: '404', message: 'Object not found'},
      }),
    });
    await expect(signedPhotoUrl('tickets/x.png')).rejects.toMatchObject({
      status: 404,
      message: 'Photo not found',
    });
  });

  it('signedPhotoUrl passes on any other Storage error', async () => {
    const error = {statusCode: '500', message: 'Internal Server Error'};
    mockBucket({createSignedUrl: async () => ({data: null, error})});
    await expect(signedPhotoUrl('tickets/x.png')).rejects.toBe(error);
  });
});
