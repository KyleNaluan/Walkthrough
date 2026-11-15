import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner} from '../test/users';
import type {ExtensionRequest, TicketDetail, TicketStatus} from '../types';

const NOT_LATER = 'New deadline must be after the current one';
const WAITING = 'An extension request is already waiting';

const pendingRequest: ExtensionRequest = {
  id: 40,
  previousDeadline: '2099-01-10',
  requestedDeadline: '2099-02-01',
  reason: 'Parts are on back order',
  requestedAt: '2026-11-02T15:00:00Z',
  requesterName: 'Sam Carter',
  status: 'pending',
  decision: null,
};

function ticket(
  status: TicketStatus,
  extensionRequests: ExtensionRequest[] = [],
  deadline = '2099-01-10',
): TicketDetail {
  return {
    id: 4,
    description: 'Raw chicken stored above salad',
    severity: 'high',
    deadline,
    recordedAt: '2026-11-01T15:00:00Z',
    status,
    overdue: deadline < '2026-01-01',
    inspectionId: 1,
    store: {id: 1, name: 'Main St Diner'},
    fixes: [],
    reinspections: [],
    extensionRequests,
  };
}

function openTicket(
  user: typeof owner,
  initial: TicketDetail,
  answers: Record<string, unknown> = {},
) {
  const fetch = stubApi({
    '/api/tickets/4/photo': {url: 'https://signed.test/ticket.png'},
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

const REQUEST_PATH = '/api/tickets/4/extension-requests';

/** Opens the form and fills it in; empty values are left untouched. */
async function fillRequest(deadline: string, reason: string) {
  fireEvent.click(
    await screen.findByRole('button', {name: 'Request a later deadline'}),
  );
  if (deadline) {
    const input = screen.getByLabelText(/^New deadline/);
    fireEvent.change(input, {target: {value: deadline}});
    fireEvent.blur(input);
  }
  if (reason) {
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: {value: reason},
    });
  }
}

function sendRequest() {
  fireEvent.click(screen.getByRole('button', {name: 'Send request'}));
}

/** The timeline's entries, oldest first. */
function timeline() {
  return screen
    .getAllByRole('group')
    .filter((group) => group.closest('.mantine-Timeline-root'));
}

describe('request a deadline extension (story 17)', () => {
  it('sends the date and reason, then shows the request as pending on the ticket (AC 17.1)', async () => {
    const fetch = openTicket(owner, ticket('open'), {
      [REQUEST_PATH]: ticket('open', [pendingRequest]),
    });
    await fillRequest('2099-02-01', '  Parts are on back order  ');
    sendRequest();

    const pending = await screen.findByRole('alert');
    expect(pending).toHaveTextContent('Extension to Feb 1, 2099 requested');
    expect(pending).toHaveTextContent('Waiting for an inspector to decide');
    expect(JSON.parse(sent(fetch, REQUEST_PATH)!.body as string)).toEqual({
      deadline: '2099-02-01',
      reason: 'Parts are on back order',
    });
    expect(
      screen.getByText('Extension requested', {selector: 'span *, span'}),
    ).toBeInTheDocument();
    const entry = screen.getByRole('group', {name: 'Extension request 1'});
    expect(entry).toHaveTextContent('Extension requested');
    expect(entry).toHaveTextContent('From Jan 10, 2099 to Feb 1, 2099');
    expect(entry).toHaveTextContent('Parts are on back order');
    expect(entry).toHaveTextContent('Waiting for a decision');
    expect(
      screen.queryByRole('button', {name: 'Request a later deadline'}),
    ).toBeNull();
    expect(screen.queryByRole('button', {name: 'Send request'})).toBeNull();
  });

  it.each([
    'open',
    'pending_review',
    'changes_requested',
    'reinspection_scheduled',
  ] as const)('offers the request on a %s ticket (AC 17.1)', async (status) => {
    openTicket(owner, ticket(status));
    expect(
      await screen.findByRole('button', {name: 'Request a later deadline'}),
    ).toBeInTheDocument();
  });

  it('shows an owner the pending request when they open the ticket (AC 17.1)', async () => {
    openTicket(owner, ticket('open', [pendingRequest]));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Extension to Feb 1, 2099 requested',
    );
    expect(
      screen.getByRole('group', {name: 'Extension request 1'}),
    ).toHaveTextContent('by Sam Carter');
  });

  it.each([
    ['the current deadline', '2099-01-10'],
    ['an earlier date', '2099-01-09'],
  ])(
    'marks %s with "New deadline must be after the current one" and sends nothing (AC 17.2)',
    async (_, date) => {
      const fetch = openTicket(owner, ticket('open'));
      await fillRequest(date, 'Parts are on back order');
      sendRequest();
      expect(await screen.findByText(NOT_LATER)).toBeInTheDocument();
      expect(screen.getByLabelText(/^New deadline/)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await waitFor(() => expect(sent(fetch, REQUEST_PATH)).toBeUndefined());
    },
  );

  it("marks the date with the server's message if it refuses it (AC 17.2)", async () => {
    openTicket(owner, ticket('open'), {
      [REQUEST_PATH]: Response.json(
        {error: NOT_LATER, fields: {deadline: NOT_LATER}},
        {status: 400},
      ),
    });
    await fillRequest('2099-02-01', 'Parts are on back order');
    sendRequest();
    expect(await screen.findByText(NOT_LATER)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks a missing date and sends nothing', async () => {
    const fetch = openTicket(owner, ticket('open'));
    await fillRequest('', 'Parts are on back order');
    sendRequest();
    expect(
      await screen.findByText('New deadline is required'),
    ).toBeInTheDocument();
    await waitFor(() => expect(sent(fetch, REQUEST_PATH)).toBeUndefined());
  });

  it('marks a date in the past on an overdue ticket and sends nothing', async () => {
    const fetch = openTicket(owner, ticket('open', [], '2020-01-10'));
    await fillRequest('2020-02-01', 'Parts are on back order');
    sendRequest();
    expect(
      await screen.findByText('New deadline cannot be in the past'),
    ).toBeInTheDocument();
    await waitFor(() => expect(sent(fetch, REQUEST_PATH)).toBeUndefined());
  });

  it.each(['', '   '])(
    'marks reason %j as required and sends nothing (AC 17.3)',
    async (reason) => {
      const fetch = openTicket(owner, ticket('open'));
      await fillRequest('2099-02-01', reason);
      sendRequest();
      expect(await screen.findByText('Reason is required')).toBeInTheDocument();
      expect(screen.getByLabelText(/^Reason/)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await waitFor(() => expect(sent(fetch, REQUEST_PATH)).toBeUndefined());
    },
  );

  it('offers no second request while one is pending (AC 17.4)', async () => {
    openTicket(owner, ticket('open', [pendingRequest]));
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', {name: 'Request a later deadline'}),
    ).toBeNull();
  });

  it('shows "An extension request is already waiting" if the server refuses (AC 17.4)', async () => {
    openTicket(owner, ticket('open'), {
      [REQUEST_PATH]: Response.json({error: WAITING}, {status: 409}),
    });
    await fillRequest('2099-02-01', 'Parts are on back order');
    sendRequest();
    expect(await screen.findByRole('alert')).toHaveTextContent(WAITING);
  });

  it('offers no request on a Resolved ticket (AC 17.5)', async () => {
    openTicket(owner, ticket('resolved'));
    await screen.findByRole('heading', {
      name: 'Raw chicken stored above salad',
    });
    expect(
      screen.queryByRole('button', {name: 'Request a later deadline'}),
    ).toBeNull();
    expect(screen.queryByText('Deadline extension')).toBeNull();
  });

  it('offers an inspector no request, but shows them the pending one (AC 17.6)', async () => {
    openTicket(inspector, ticket('open', [pendingRequest]));
    expect(
      await screen.findByRole('group', {name: 'Extension request 1'}),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Request a later deadline'}),
    ).toBeNull();
  });

  it('closes the form on Cancel without sending', async () => {
    const fetch = openTicket(owner, ticket('open'));
    await fillRequest('2099-02-01', 'Parts are on back order');
    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(
      await screen.findByRole('button', {name: 'Request a later deadline'}),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Reason/)).toBeNull();
    expect(sent(fetch, REQUEST_PATH)).toBeUndefined();
  });

  it('puts the request in the timeline in date order', async () => {
    openTicket(owner, ticket('pending_review', [pendingRequest]));
    const entry = await screen.findByRole('group', {
      name: 'Extension request 1',
    });
    const entries = timeline();
    expect(entries.at(-1)).toBe(entry);
    expect(
      within(entries[0]).getByText('Finding recorded'),
    ).toBeInTheDocument();
  });
});

const DECISION_PATH = '/api/tickets/4/extension-requests/40/decision';

/** The date in the ticket's Deadline field. */
function deadlineShown() {
  return screen.getByText('Deadline', {exact: true}).nextElementSibling
    ?.textContent;
}
const DENY_COMMENT = 'A comment is required to deny a request';

function decided(
  request: ExtensionRequest,
  status: 'approved' | 'denied',
  comment: string | null,
): ExtensionRequest {
  return {
    ...request,
    status,
    decision: {
      comment,
      decidedAt: '2026-11-15T16:00:00Z',
      deciderName: 'Jordan Reyes',
    },
  };
}

describe('decide an extension request (story 18)', () => {
  it('approves: the deadline moves, Overdue goes away and the decision is in the timeline (AC 18.1)', async () => {
    const overdue = ticket('changes_requested', [pendingRequest], '2020-01-10');
    const fetch = openTicket(inspector, overdue, {
      [DECISION_PATH]: {
        ...ticket(
          'changes_requested',
          [decided(pendingRequest, 'approved', null)],
          '2099-02-01',
        ),
        overdue: false,
      },
    });
    expect(await screen.findByText('Overdue')).toBeInTheDocument();
    const panel = screen.getByText('Sam Carter asks to move the deadline', {
      exact: false,
    });
    expect(panel).toHaveTextContent('from Jan 10, 2099 to Feb 1, 2099');
    fireEvent.click(screen.getByRole('button', {name: 'Approve extension'}));

    const entry = await screen.findByRole('group', {
      name: 'Extension decision 1',
    });
    expect(entry).toHaveTextContent('Extension approved');
    expect(entry).toHaveTextContent('Deadline moved to Feb 1, 2099');
    expect(entry).toHaveTextContent('by Jordan Reyes');
    expect(JSON.parse(sent(fetch, DECISION_PATH)!.body as string)).toEqual({
      decision: 'approved',
    });
    expect(deadlineShown()).toBe('Feb 1, 2099');
    expect(screen.queryByText('Overdue')).toBeNull();
    expect(
      screen.queryByText('Extension requested', {selector: 'span'}),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {name: 'Approve extension'}),
    ).toBeNull();
  });

  it('denies with a comment; the deadline stays and the decision is in the timeline (AC 18.2)', async () => {
    const fetch = openTicket(inspector, ticket('open', [pendingRequest]), {
      [DECISION_PATH]: ticket('open', [
        decided(pendingRequest, 'denied', 'Moving the chicken needs no parts.'),
      ]),
    });
    fireEvent.change(await screen.findByLabelText('Comment'), {
      target: {value: '  Moving the chicken needs no parts.  '},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Deny'}));

    const entry = await screen.findByRole('group', {
      name: 'Extension decision 1',
    });
    expect(entry).toHaveTextContent('Extension denied');
    expect(entry).toHaveTextContent('Deadline stays Jan 10, 2099');
    expect(entry).toHaveTextContent('Moving the chicken needs no parts.');
    expect(JSON.parse(sent(fetch, DECISION_PATH)!.body as string)).toEqual({
      decision: 'denied',
      comment: 'Moving the chicken needs no parts.',
    });
    expect(deadlineShown()).toBe('Jan 10, 2099');
  });

  it('shows the owner the denial and the comment, and lets them ask again (AC 18.2)', async () => {
    openTicket(
      owner,
      ticket('open', [
        decided(pendingRequest, 'denied', 'Moving the chicken needs no parts.'),
      ]),
    );
    const denial = await screen.findByRole('alert');
    expect(denial).toHaveTextContent(
      'Extension to Feb 1, 2099 denied by Jordan Reyes',
    );
    expect(denial).toHaveTextContent('Moving the chicken needs no parts.');
    expect(
      screen.getByRole('group', {name: 'Extension decision 1'}),
    ).toHaveTextContent('Moving the chicken needs no parts.');
    expect(
      screen.getByRole('button', {name: 'Request a later deadline'}),
    ).toBeInTheDocument();
  });

  it('shows the owner an approved extension in the timeline, with no denial', async () => {
    openTicket(
      owner,
      ticket('open', [decided(pendingRequest, 'approved', null)], '2099-02-01'),
    );
    expect(
      await screen.findByRole('group', {name: 'Extension decision 1'}),
    ).toHaveTextContent('Extension approved');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['', '   '])(
    'marks comment %j as required to deny and sends nothing (AC 18.3)',
    async (comment) => {
      const fetch = openTicket(inspector, ticket('open', [pendingRequest]));
      fireEvent.change(await screen.findByLabelText('Comment'), {
        target: {value: comment},
      });
      fireEvent.click(screen.getByRole('button', {name: 'Deny'}));
      expect(await screen.findByText(DENY_COMMENT)).toBeInTheDocument();
      expect(screen.getByLabelText('Comment')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await waitFor(() => expect(sent(fetch, DECISION_PATH)).toBeUndefined());
    },
  );

  it("marks the comment with the server's message if it refuses a denial (AC 18.3)", async () => {
    openTicket(inspector, ticket('open', [pendingRequest]), {
      [DECISION_PATH]: Response.json(
        {error: DENY_COMMENT, fields: {comment: DENY_COMMENT}},
        {status: 400},
      ),
    });
    fireEvent.change(await screen.findByLabelText('Comment'), {
      target: {value: 'No'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Deny'}));
    expect(await screen.findByText(DENY_COMMENT)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers no decision when no request is waiting (AC 18.4)', async () => {
    openTicket(
      inspector,
      ticket('open', [decided(pendingRequest, 'denied', 'No.')]),
    );
    await screen.findByRole('group', {name: 'Extension decision 1'});
    expect(
      screen.queryByRole('button', {name: 'Approve extension'}),
    ).toBeNull();
    expect(screen.queryByRole('button', {name: 'Deny'})).toBeNull();
  });

  it('shows "No extension request is waiting" if the server refuses (AC 18.4)', async () => {
    openTicket(inspector, ticket('open', [pendingRequest]), {
      [DECISION_PATH]: Response.json(
        {error: 'No extension request is waiting'},
        {status: 409},
      ),
    });
    fireEvent.click(
      await screen.findByRole('button', {name: 'Approve extension'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No extension request is waiting',
    );
  });

  it('offers a store owner no way to approve or deny (AC 18.5)', async () => {
    openTicket(owner, ticket('open', [pendingRequest]));
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', {name: 'Approve extension'}),
    ).toBeNull();
    expect(screen.queryByRole('button', {name: 'Deny'})).toBeNull();
  });
});
