import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it("shows the server's message when the ticket can't be opened (AC 13.3)", async () => {
    openTicket(owner, ticket('open'), {
      '/api/tickets/4': Response.json({error: 'Access denied'}, {status: 403}),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.queryByText('Raw chicken stored above salad')).toBeNull();
    expect(screen.queryByRole('heading', {name: 'Timeline'})).toBeNull();
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

  it('shows the requested changes and keeps earlier rounds when the owner sends another fix (AC 9.2, 11.3)', async () => {
    openTicket(owner, ticket('changes_requested', [reviewedFix]), {
      '/api/tickets/4/fixes': ticket('pending_review', [
        reviewedFix,
        pendingFix,
      ]),
    });
    expect(
      await screen.findByText('Changes requested by Jordan Reyes'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(comment)[0]).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {name: 'Submit another fix'}),
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

describe('approve a fix (story 10)', () => {
  it('approves the latest fix and shows the ticket Resolved with the reviewer (AC 10.1)', async () => {
    const fetch = openTicket(
      inspector,
      ticket('pending_review', [pendingFix]),
      {
        '/api/tickets/4/review': ticket('resolved', [
          {
            ...pendingFix,
            review: {
              decision: 'approved',
              comment: null,
              reviewedAt: '2026-10-14T20:05:00Z',
              reviewerName: 'Jordan Reyes',
            },
          },
        ]),
      },
    );
    fireEvent.click(await screen.findByRole('button', {name: 'Approve fix'}));

    expect(await screen.findByText('Resolved')).toBeInTheDocument();
    expect(
      JSON.parse(sent(fetch, '/api/tickets/4/review')!.body as string),
    ).toEqual({decision: 'approved'});
    const round = screen.getByRole('group', {name: 'Fix 1'});
    expect(within(round).getByText('Approved')).toBeInTheDocument();
    expect(round).toHaveTextContent('by Jordan Reyes');
    expect(screen.queryByRole('button', {name: 'Approve fix'})).toBeNull();
  });

  it('offers no review on a ticket that is not Pending review (AC 10.2)', async () => {
    openTicket(inspector, ticket('open'));
    await screen.findByRole('heading', {
      name: 'Raw chicken stored above salad',
    });
    expect(screen.queryByRole('button', {name: 'Approve fix'})).toBeNull();
  });

  it('shows "This ticket has no fix waiting for review" if the server refuses (AC 10.2)', async () => {
    openTicket(inspector, ticket('pending_review', [pendingFix]), {
      '/api/tickets/4/review': Response.json(
        {error: 'This ticket has no fix waiting for review'},
        {status: 409},
      ),
    });
    fireEvent.click(await screen.findByRole('button', {name: 'Approve fix'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This ticket has no fix waiting for review',
    );
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('offers a store owner no way to approve or request changes (AC 10.3)', async () => {
    openTicket(owner, ticket('pending_review', [pendingFix]));
    await screen.findByRole('heading', {
      name: 'Raw chicken stored above salad',
    });
    expect(screen.queryByRole('button', {name: 'Approve fix'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Request changes'})).toBeNull();
  });
});

describe('request changes (story 11)', () => {
  it('sends the comment and shows the ticket as Changes requested (AC 11.1)', async () => {
    const fetch = openTicket(
      inspector,
      ticket('pending_review', [pendingFix]),
      {
        '/api/tickets/4/review': ticket('changes_requested', [
          {...pendingFix, review: reviewedFix.review},
        ]),
      },
    );
    fireEvent.change(await screen.findByLabelText('Comment'), {
      target: {value: `  ${comment} `},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Request changes'}));

    expect(
      await screen.findByText('Changes requested by Jordan Reyes'),
    ).toBeInTheDocument();
    expect(
      JSON.parse(sent(fetch, '/api/tickets/4/review')!.body as string),
    ).toEqual({decision: 'changes_requested', comment});
    expect(screen.queryByRole('button', {name: 'Request changes'})).toBeNull();
  });

  it.each(['', '   '])(
    'marks the comment as required and sends nothing for %j (AC 11.2)',
    async (value) => {
      const fetch = openTicket(
        inspector,
        ticket('pending_review', [pendingFix]),
      );
      fireEvent.change(await screen.findByLabelText('Comment'), {
        target: {value},
      });
      fireEvent.click(screen.getByRole('button', {name: 'Request changes'}));
      expect(
        await screen.findByText('A comment is required to request changes'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Comment')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await waitFor(() =>
        expect(sent(fetch, '/api/tickets/4/review')).toBeUndefined(),
      );
    },
  );
});

describe('schedule a re-inspection (story 12)', () => {
  function chooseDate(value: string) {
    const input = screen.getByLabelText('Re-inspection date');
    fireEvent.change(input, {target: {value}});
    fireEvent.blur(input);
  }

  it('schedules a re-inspection and shows the ticket as Re-inspection scheduled (AC 12.1)', async () => {
    const fetch = openTicket(
      inspector,
      ticket('pending_review', [pendingFix]),
      {
        '/api/tickets/4/review': ticket('reinspection_scheduled', [
          {
            ...pendingFix,
            review: {
              decision: 'reinspection_scheduled',
              comment: null,
              reviewedAt: '2026-10-14T20:05:00Z',
              reviewerName: 'Jordan Reyes',
            },
          },
        ]),
      },
    );
    await screen.findByRole('button', {name: 'Schedule re-inspection'});
    chooseDate('2099-01-20');
    fireEvent.click(
      screen.getByRole('button', {name: 'Schedule re-inspection'}),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', {name: 'Schedule re-inspection'}),
      ).toBeNull(),
    );
    expect(
      JSON.parse(sent(fetch, '/api/tickets/4/review')!.body as string),
    ).toEqual({decision: 'reinspection_scheduled', scheduledFor: '2099-01-20'});
    expect(screen.getAllByText('Re-inspection scheduled')).toHaveLength(2);
    const round = screen.getByRole('group', {name: 'Fix 1'});
    expect(
      within(round).getByText('Re-inspection scheduled'),
    ).toBeInTheDocument();
    expect(round).toHaveTextContent('by Jordan Reyes');
  });

  it('schedules, and never approves, when Enter is pressed in the date field (AC 12.1)', async () => {
    const fetch = openTicket(
      inspector,
      ticket('pending_review', [pendingFix]),
      {'/api/tickets/4/review': ticket('reinspection_scheduled', [pendingFix])},
    );
    await userEvent.type(
      await screen.findByLabelText('Re-inspection date'),
      '2099-01-20{Enter}',
    );
    await waitFor(() =>
      expect(sent(fetch, '/api/tickets/4/review')).toBeDefined(),
    );
    expect(
      JSON.parse(sent(fetch, '/api/tickets/4/review')!.body as string),
    ).toEqual({decision: 'reinspection_scheduled', scheduledFor: '2099-01-20'});
  });

  it('marks a missing re-inspection date and sends nothing (AC 12.1)', async () => {
    const fetch = openTicket(inspector, ticket('pending_review', [pendingFix]));
    fireEvent.click(
      await screen.findByRole('button', {name: 'Schedule re-inspection'}),
    );
    expect(
      await screen.findByText('A re-inspection date is required'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Re-inspection date')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await waitFor(() =>
      expect(sent(fetch, '/api/tickets/4/review')).toBeUndefined(),
    );
  });

  it('lets the owner submit another fix after a failed re-inspection (AC 12.3)', async () => {
    openTicket(
      owner,
      ticket('changes_requested', [
        {
          ...pendingFix,
          review: {
            decision: 'reinspection_scheduled',
            comment: 'Check the walk-in on the visit too.',
            reviewedAt: '2026-10-14T20:05:00Z',
            reviewerName: 'Jordan Reyes',
          },
        },
      ]),
    );
    expect(
      await screen.findByLabelText(/What did you fix/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Changes requested by/)).toBeNull();
  });

  it('shows "This ticket has no fix waiting for review" if the server refuses a schedule (AC 12.5)', async () => {
    openTicket(inspector, ticket('pending_review', [pendingFix]), {
      '/api/tickets/4/review': Response.json(
        {error: 'This ticket has no fix waiting for review'},
        {status: 409},
      ),
    });
    await screen.findByRole('button', {name: 'Schedule re-inspection'});
    chooseDate('2099-01-20');
    fireEvent.click(
      screen.getByRole('button', {name: 'Schedule re-inspection'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This ticket has no fix waiting for review',
    );
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('offers no Schedule re-inspection on a ticket that is not Pending review (AC 12.5)', async () => {
    openTicket(inspector, ticket('reinspection_scheduled', [pendingFix]));
    await screen.findByRole('heading', {
      name: 'Raw chicken stored above salad',
    });
    expect(
      screen.queryByRole('button', {name: 'Schedule re-inspection'}),
    ).toBeNull();
  });

  it('tells an inspector where to record a scheduled re-inspection', async () => {
    openTicket(inspector, ticket('reinspection_scheduled', [pendingFix]));
    expect(
      await screen.findByText(
        'Start an inspection of this store to record the re-inspection result.',
      ),
    ).toBeInTheDocument();
  });

  it('offers a store owner no Schedule re-inspection (AC 12.6)', async () => {
    openTicket(owner, ticket('pending_review', [pendingFix]));
    await screen.findByRole('heading', {
      name: 'Raw chicken stored above salad',
    });
    expect(
      screen.queryByRole('button', {name: 'Schedule re-inspection'}),
    ).toBeNull();
  });
});

describe('ticket timeline (story 13)', () => {
  /** The timeline's items, top to bottom. */
  function timeline() {
    return screen
      .getAllByRole('group')
      .map((item) => item.getAttribute('aria-label'));
  }

  it('shows the owner their ticket with only the finding when there is no fix (AC 13.2, 13.4)', async () => {
    openTicket(owner, ticket('open'));
    expect(
      await screen.findByRole('heading', {
        name: 'Raw chicken stored above salad',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Timeline'})).toBeInTheDocument();
    expect(timeline()).toEqual(['Finding']);
    expect(screen.getByRole('group', {name: 'Finding'})).toHaveTextContent(
      'Finding recorded',
    );
    expect(screen.getByRole('group', {name: 'Finding'})).toHaveTextContent(
      'Sep 30, 2026',
    );
  });

  it('shows "Ticket not found" for a ticket that does not exist (AC 13.5)', async () => {
    openTicket(inspector, ticket('open'), {
      '/api/tickets/4': Response.json(
        {error: 'Ticket not found'},
        {status: 404},
      ),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ticket not found',
    );
    expect(screen.queryByRole('heading', {name: 'Timeline'})).toBeNull();
  });
});
