import {fireEvent, screen, waitFor} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner} from '../test/users';
import type {FixSubmission, TicketDetail, TicketStatus} from '../types';

const comment = 'The chicken is still on the top shelf.';

const reviewedFix: FixSubmission = {
  id: 10,
  description: 'Moved the chicken.',
  submittedAt: '2026-10-01T15:00:00Z',
  review: {
    decision: 'changes_requested',
    comment,
    reviewedAt: '2026-10-02T15:00:00Z',
    reviewerName: 'Jordan Reyes',
  },
};

const pendingFix: FixSubmission = {
  id: 11,
  description: 'Moved it to the bottom shelf.',
  submittedAt: '2026-10-03T15:00:00Z',
  review: null,
};

function ticket(
  status: TicketStatus,
  fixes: FixSubmission[] = [],
): TicketDetail {
  return {
    id: 4,
    description: 'Raw chicken stored above salad',
    severity: 'high',
    deadline: '2026-10-20',
    recordedAt: '2026-09-30T15:00:00Z',
    status,
    overdue: false,
    inspectionId: 1,
    store: {id: 1, name: 'Main St Diner'},
    fixes,
  };
}

const photos = {
  '/api/tickets/4/photo': {url: 'https://signed.test/ticket.png'},
  '/api/tickets/4/fixes/10/photo': {url: 'https://signed.test/10.png'},
  '/api/tickets/4/fixes/11/photo': {url: 'https://signed.test/11.png'},
};

function openTicket(
  user: typeof owner,
  initial: TicketDetail,
  answers: Record<string, unknown> = {},
) {
  const fetch = stubApi({
    ...photos,
    '/api/tickets/4': initial,
    ...answers,
  });
  renderWithAuth(<AppRoutes />, {user, route: '/tickets/4'});
  return fetch;
}

/** The request the page sent to `path`, if any. */
function sent(fetch: ReturnType<typeof stubApi>, path: string) {
  const call = fetch.mock.calls.find(([url]) => url === path) as
    [string, RequestInit] | undefined;
  return call?.[1];
}

function choosePhoto(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  fireEvent.change(input, {target: {files: [file]}});
}

const png = new File([new Uint8Array([137, 80, 78, 71])], 'fix.png', {
  type: 'image/png',
});

async function fillFix(description: string, photo: File | null = png) {
  fireEvent.change(await screen.findByLabelText(/What did you fix/), {
    target: {value: description},
  });
  if (photo) choosePhoto(photo);
}

describe('TicketDetailPage', () => {
  it('shows the finding, its store, status and severity', async () => {
    openTicket(owner, ticket('open'));
    expect(
      await screen.findByRole('heading', {
        name: 'Raw chicken stored above salad',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('T-0004 · Main St Diner')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Oct 20, 2026')).toBeInTheDocument();
    // The placeholder shares the photo's name until the link arrives.
    await waitFor(() =>
      expect(
        screen.getByRole('img', {name: 'Photo of the finding'}),
      ).toHaveAttribute('src', 'https://signed.test/ticket.png'),
    );
  });

  it("shows the server's message when the ticket can't be opened", async () => {
    openTicket(owner, ticket('open'), {
      '/api/tickets/4': Response.json({error: 'Access denied'}, {status: 403}),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.queryByText('Raw chicken stored above salad')).toBeNull();
  });
});

describe('submit a fix (story 9)', () => {
  it('sends the description and photo and shows the ticket as Pending review (AC 9.1)', async () => {
    const fetch = openTicket(owner, ticket('open'), {
      '/api/tickets/4/fixes': ticket('pending_review', [pendingFix]),
    });
    await fillFix('  Moved it to the bottom shelf.  ');
    fireEvent.click(screen.getByRole('button', {name: 'Submit fix'}));

    expect(await screen.findByText('Pending review')).toBeInTheDocument();
    const body = sent(fetch, '/api/tickets/4/fixes')!.body as FormData;
    expect(body.get('description')).toBe('Moved it to the bottom shelf.');
    expect((body.get('photo') as File).name).toBe('fix.png');
    expect(screen.getByRole('group', {name: 'Fix 1'})).toHaveTextContent(
      'Waiting for review',
    );
    expect(screen.queryByRole('button', {name: 'Submit fix'})).toBeNull();
    expect(
      screen.getByText('Your fix has been sent and is waiting for review.'),
    ).toBeInTheDocument();
  });

  it('keeps earlier rounds when the owner sends another fix after changes were requested (AC 9.2)', async () => {
    openTicket(owner, ticket('changes_requested', [reviewedFix]), {
      '/api/tickets/4/fixes': ticket('pending_review', [
        reviewedFix,
        pendingFix,
      ]),
    });
    expect(
      await screen.findByRole('heading', {name: 'Submit another fix'}),
    ).toBeInTheDocument();

    await fillFix('Moved it to the bottom shelf.');
    fireEvent.click(screen.getByRole('button', {name: 'Submit fix'}));

    expect(await screen.findByRole('group', {name: 'Fix 2'})).toHaveTextContent(
      'Moved it to the bottom shelf.',
    );
    expect(screen.getByRole('group', {name: 'Fix 1'})).toHaveTextContent(
      comment,
    );
  });

  it.each(['pending_review', 'reinspection_scheduled', 'resolved'] as const)(
    'offers no fix form on a %s ticket (AC 9.3)',
    async (status) => {
      openTicket(owner, ticket(status, [pendingFix]));
      await screen.findByRole('heading', {
        name: 'Raw chicken stored above salad',
      });
      expect(screen.queryByRole('button', {name: 'Submit fix'})).toBeNull();
    },
  );

  it('shows "This ticket is not waiting for a fix" if the server refuses (AC 9.3)', async () => {
    openTicket(owner, ticket('open'), {
      '/api/tickets/4/fixes': Response.json(
        {error: 'This ticket is not waiting for a fix'},
        {status: 409},
      ),
    });
    await fillFix('Moved it.');
    fireEvent.click(screen.getByRole('button', {name: 'Submit fix'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This ticket is not waiting for a fix',
    );
  });

  it('marks an empty description and a missing photo and sends nothing (AC 9.4)', async () => {
    const fetch = openTicket(owner, ticket('open'));
    await fillFix('   ', null);
    fireEvent.click(screen.getByRole('button', {name: 'Submit fix'}));
    expect(
      await screen.findByText('Description is required'),
    ).toBeInTheDocument();
    expect(screen.getByText('A photo is required')).toBeInTheDocument();
    expect(sent(fetch, '/api/tickets/4/fixes')).toBeUndefined();
  });

  it('marks a photo that is not a JPEG or PNG and sends nothing (AC 9.4)', async () => {
    const fetch = openTicket(owner, ticket('open'));
    await fillFix(
      'Moved it.',
      new File(['GIF89a'], 'fix.gif', {type: 'image/gif'}),
    );
    fireEvent.click(screen.getByRole('button', {name: 'Submit fix'}));
    expect(
      await screen.findByText('Photo must be a JPEG or PNG image'),
    ).toBeInTheDocument();
    expect(sent(fetch, '/api/tickets/4/fixes')).toBeUndefined();
  });

  it("marks the photo when the server finds it isn't really an image (AC 9.4)", async () => {
    openTicket(owner, ticket('open'), {
      '/api/tickets/4/fixes': Response.json(
        {
          error: 'Photo must be a JPEG or PNG image',
          fields: {photo: 'Photo must be a JPEG or PNG image'},
        },
        {status: 400},
      ),
    });
    await fillFix('Moved it.');
    fireEvent.click(screen.getByRole('button', {name: 'Submit fix'}));
    expect(
      await screen.findByText('Photo must be a JPEG or PNG image'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers an inspector no fix form (AC 9.6)', async () => {
    openTicket(inspector, ticket('open'));
    await screen.findByRole('heading', {
      name: 'Raw chicken stored above salad',
    });
    expect(screen.queryByRole('button', {name: 'Submit fix'})).toBeNull();
  });
});
