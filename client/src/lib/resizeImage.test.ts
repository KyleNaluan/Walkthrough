import {describe, expect, it, vi} from 'vitest';
import {resizeImage} from './resizeImage';

// jsdom has no image decoding or canvas drawing, so both are stubbed.
function stubBitmap(width: number, height: number) {
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({width, height, close}),
  );
  return close;
}

function stubCanvas(output: Blob) {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => callback(output),
  );
  return drawImage;
}

describe('resizeImage', () => {
  it('returns a small photo unchanged', async () => {
    const close = stubBitmap(800, 600);
    const file = new File([new Uint8Array(1000)], 'small.jpg', {
      type: 'image/jpeg',
    });
    await expect(resizeImage(file)).resolves.toBe(file);
    expect(close).toHaveBeenCalled();
  });

  it('passes a non-image through for the server to reject', async () => {
    const file = new File(['hello'], 'notes.txt', {type: 'text/plain'});
    await expect(resizeImage(file)).resolves.toBe(file);
  });

  it('passes through a file the browser cannot decode', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('bad image')),
    );
    const file = new File(['not really'], 'fake.jpg', {type: 'image/jpeg'});
    await expect(resizeImage(file)).resolves.toBe(file);
  });

  it('shrinks a large photo to a JPEG with its longer side at maxSide', async () => {
    stubBitmap(4000, 3000);
    const drawImage = stubCanvas(new Blob([new Uint8Array(500)]));
    const file = new File([new Uint8Array(5_000_000)], 'big.png', {
      type: 'image/png',
    });
    const resized = await resizeImage(file);
    expect(resized.name).toBe('big.jpg');
    expect(resized.type).toBe('image/jpeg');
    expect(resized.size).toBe(500);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
  });
});
