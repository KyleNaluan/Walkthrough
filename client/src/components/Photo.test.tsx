import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {Photo} from './Photo';

describe('Photo', () => {
  it('shows a placeholder, then the photo from the signed URL', async () => {
    const src = vi.fn().mockResolvedValue('https://example.test/signed.png');
    render(<Photo src={src} alt="Blocked hand sink" />);
    expect(screen.getByText('Loading photo…')).toBeInTheDocument();
    const img = await screen.findByAltText('Blocked hand sink');
    expect(img).toHaveAttribute('src', 'https://example.test/signed.png');
    expect(src).toHaveBeenCalledOnce();
  });

  it('shows a placeholder when the URL cannot be fetched', async () => {
    render(
      <Photo src={() => Promise.reject(new Error('403'))} alt="Finding" />,
    );
    expect(await screen.findByText('Photo unavailable')).toBeInTheDocument();
  });

  it('shows a placeholder when the link has expired', async () => {
    render(
      <Photo
        src={() => Promise.resolve('https://example.test/expired')}
        alt="Finding"
      />,
    );
    fireEvent.error(await screen.findByAltText('Finding'));
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument();
  });
});
