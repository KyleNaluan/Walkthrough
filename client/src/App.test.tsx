import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {App} from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error) {
  const fetchMock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
}

describe('App', () => {
  it('shows the API as ok when the health check passes', async () => {
    stubFetch(Response.json({status: 'ok'}));
    render(<App />);
    expect(
      screen.getByRole('heading', {name: 'Walkthrough'}),
    ).toBeInTheDocument();
    expect(await screen.findByText('API: ok')).toBeInTheDocument();
  });

  it('shows the API as down when the health check fails', async () => {
    stubFetch(new Error('network'));
    render(<App />);
    expect(await screen.findByText('API: down')).toBeInTheDocument();
  });
});
