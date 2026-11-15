import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useNavigate} from 'react-router';
import {describe, expect, it, vi} from 'vitest';
import {resizeImage} from '../lib/resizeImage';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspection, inspector, owner, stores, ticket} from '../test/users';
import type {ChecklistEntry, InspectionDetail, TicketSummary} from '../types';

// Photos go up unchanged unless a test shrinks them.
vi.mock('../lib/resizeImage', () => ({
  resizeImage: vi.fn(async (file: File) => file),
}));

/** Opens inspection 8 without leaving the inspection page. */
function OpenInspection8() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate('/inspections/8')}>
      Open inspection 8
    </button>
  );
}

/** A small PNG for the photo input. */
const photo = new File(['png'], 'photo.png', {type: 'image/png'});

/** Opens inspection 7 as the inspector, the server also answering `routes`. */
async function openAsInspector(routes: Record<string, unknown> = {}) {
  const fetch = stubApi({
    '/api/inspections/7': inspection,
    '/api/inspections/7/checklist': [],
    ...routes,
  });
  renderWithAuth(<AppRoutes />, {user: inspector, route: '/inspections/7'});
  await screen.findByRole('button', {name: 'Save finding'});
  return fetch;
}

/** Fills in the finding form and saves it, leaving out any field set to null. */
function saveFinding({
  description = 'Raw chicken stored above salad',
  severity = 'High',
  deadline = '2099-01-15',
  file = photo,
}: {
  description?: string | null;
  severity?: string | null;
  deadline?: string | null;
  file?: File | null;
} = {}) {
  if (description != null) {
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: {value: description},
    });
  }
  if (severity != null) fireEvent.click(screen.getByLabelText(severity));
  if (deadline != null) {
    const input = screen.getByLabelText(/^Deadline/);
    fireEvent.change(input, {target: {value: deadline}});
    fireEvent.blur(input);
  }
  if (file) {
    // Mantine's FileInput label points at a button, not the file input.
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: {files: [file]},
    });
  }
  fireEvent.click(screen.getByRole('button', {name: 'Save finding'}));
}

/** Opens inspection 7 with ticket 12, the server answering its photo link. */
async function openWithFinding(
  user: typeof inspector,
  photoLink: unknown = {url: 'https://example.test/signed.png'},
) {
  const fetch = stubApi({
    '/api/inspections/7': {...inspection, tickets: [ticket]},
    '/api/inspections/7/checklist': [],
    '/api/tickets/12/photo': photoLink,
  });
  renderWithAuth(<AppRoutes />, {user, route: '/inspections/7'});
  await screen.findByRole('button', {name: 'Show photo'});
  return fetch;
}

/** The photo links the page asked the server for. */
function photoRequests(fetch: ReturnType<typeof stubApi>) {
  return fetch.mock.calls.filter(([path]) => path === '/api/tickets/12/photo');
}

/** The findings the page sent to the server. */
function sentFindings(fetch: ReturnType<typeof stubApi>) {
  return fetch.mock.calls
    .filter(([path]) => path === '/api/inspections/7/tickets')
    .map(([, init]) => init!.body as FormData);
}

const duePath = '/api/tickets?status=reinspection_scheduled';

/**
 * Re-inspections due: tickets 4 and 5 at store 1, ticket 9 at store 3. Each
 * waits on re-inspection 40 plus its ticket ID.
 */
const due: TicketSummary[] = [
  {id: 4, description: 'Hand sink blocked by boxes', store: stores[0]},
  {id: 5, description: 'No thermometer in walk-in', store: stores[0]},
  {id: 9, description: 'Cracked floor tile', store: stores[2]},
].map(({id, description, store}) => ({
  id,
  description,
  severity: 'medium',
  deadline: '2099-01-15',
  status: 'reinspection_scheduled',
  overdue: false,
  store: {id: store.id, name: store.name},
  reinspectionId: 40 + id,
}));

/** The re-inspection results the page sent for ticket 4. */
function sentResults(fetch: ReturnType<typeof stubApi>) {
  return fetch.mock.calls
    .filter(([path]) => path === '/api/tickets/4/reinspection')
    .map(([, init]) => JSON.parse(init!.body as string));
}

describe('InspectionPage', () => {
  it('shows the store, the inspector and the start time (AC 5.1)', async () => {
    stubApi({'/api/inspections/7': inspection});
    // The owner, so the inspector's name is not the logged-in user's.
    renderWithAuth(<AppRoutes />, {user: owner, route: '/inspections/7'});
    expect(
      await screen.findByRole('heading', {name: 'Main St Diner'}),
    ).toBeInTheDocument();
    expect(screen.getByText('INS-0007')).toBeInTheDocument();
    expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
    // Some ICU builds put a narrow space before AM.
    expect(screen.getByText(/Oct 14, 2026, 9:05\sAM/)).toBeInTheDocument();
  });

  it("lists the inspection's findings (AC 6.1)", async () => {
    stubApi({
      '/api/inspections/7': {
        ...inspection,
        tickets: [
          ticket,
          {...ticket, id: 13, description: 'No soap at hand sink'},
        ],
      },
    });
    renderWithAuth(<AppRoutes />, {user: owner, route: '/inspections/7'});
    expect(await screen.findByText('T-0012')).toBeInTheDocument();
    expect(
      screen.getByText('Raw chicken stored above salad'),
    ).toBeInTheDocument();
    expect(screen.getByText('T-0013')).toBeInTheDocument();
    expect(screen.getByText('No soap at hand sink')).toBeInTheDocument();
    expect(screen.getAllByText('High')).toHaveLength(2);
    expect(screen.getAllByText('Open')).toHaveLength(2);
    expect(screen.getAllByText('Due Jan 15, 2099')).toHaveLength(2);
    expect(
      screen.queryByText('No findings recorded yet.'),
    ).not.toBeInTheDocument();
  });

  it('says when no findings are recorded yet', async () => {
    stubApi({'/api/inspections/7': inspection});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/inspections/7'});
    expect(
      await screen.findByText('No findings recorded yet.'),
    ).toBeInTheDocument();
  });

  it('sends a logged-out visitor to the login page without asking for the inspection (AC 5.4)', () => {
    const fetch = stubApi({'/api/inspections/7': inspection});
    renderWithAuth(<AppRoutes />, {route: '/inspections/7'});
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the server message when the inspection cannot be loaded', async () => {
    stubApi({
      '/api/inspections/99': Response.json(
        {error: 'Inspection not found'},
        {status: 404},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/inspections/99'});
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Inspection not found',
    );
  });

  it('links back to the store', async () => {
    stubApi({'/api/inspections/7': inspection, '/api/stores/1': stores[0]});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/inspections/7'});
    fireEvent.click(await screen.findByRole('link', {name: 'Back to store'}));
    expect(await screen.findByText('S-0001')).toBeInTheDocument();
  });

  it('records a finding and lists it on the inspection (AC 6.1)', async () => {
    const fetch = await openAsInspector({
      '/api/inspections/7/tickets': Response.json(ticket, {status: 201}),
    });
    saveFinding();
    expect(await screen.findByText('T-0012')).toBeInTheDocument();
    expect(
      screen.getByText('Raw chicken stored above salad'),
    ).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(
      screen.queryByText('No findings recorded yet.'),
    ).not.toBeInTheDocument();
    const sent = sentFindings(fetch);
    expect(sent).toHaveLength(1);
    expect(sent[0].get('description')).toBe('Raw chicken stored above salad');
    expect(sent[0].get('severity')).toBe('high');
    expect(sent[0].get('deadline')).toBe('2099-01-15');
    expect(sent[0].get('photo')).toHaveProperty('name', 'photo.png');
    expect(screen.getByLabelText(/^Description/)).toHaveValue('');
  });

  it('locks the form while a finding is saving (AC 6.1)', async () => {
    let resized!: (file: File) => void;
    vi.mocked(resizeImage).mockReturnValueOnce(
      new Promise((resolve) => (resized = resolve)),
    );
    await openAsInspector({
      '/api/inspections/7/tickets': Response.json(ticket, {status: 201}),
    });
    saveFinding();
    expect(screen.getByLabelText(/^Description/)).toBeDisabled();
    resized(photo);
    expect(await screen.findByText('T-0012')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Description/)).toBeEnabled();
  });

  it('lists both findings after a second one is recorded (AC 6.2)', async () => {
    const saved = [
      ticket,
      {...ticket, id: 13, description: 'No soap at hand sink'},
    ];
    let next = 0;
    const fetch = await openAsInspector({
      '/api/inspections/7/tickets': () =>
        Response.json(saved[next++], {status: 201}),
    });
    saveFinding();
    await screen.findByText('T-0012');
    saveFinding({description: 'No soap at hand sink'});
    expect(await screen.findByText('T-0013')).toBeInTheDocument();
    expect(screen.getByText('T-0012')).toBeInTheDocument();
    expect(screen.getByText('No soap at hand sink')).toBeInTheDocument();
    expect(sentFindings(fetch)).toHaveLength(2);
  });

  it("shows only the opened inspection's findings after moving to another one (AC 6.1)", async () => {
    stubApi({
      '/api/inspections/7': inspection,
      '/api/inspections/7/tickets': Response.json(ticket, {status: 201}),
      '/api/inspections/8': {
        ...inspection,
        id: 8,
        tickets: [{...ticket, id: 14, description: 'No soap', inspectionId: 8}],
      },
    });
    renderWithAuth(
      <>
        <AppRoutes />
        <OpenInspection8 />
      </>,
      {user: inspector, route: '/inspections/7'},
    );
    await screen.findByRole('button', {name: 'Save finding'});
    saveFinding();
    await screen.findByText('T-0012');
    fireEvent.click(screen.getByRole('button', {name: 'Open inspection 8'}));
    expect(await screen.findByText('T-0014')).toBeInTheDocument();
    expect(screen.getByText('INS-0008')).toBeInTheDocument();
    expect(screen.queryByText('T-0012')).not.toBeInTheDocument();
  });

  it('shows "A photo is required" and sends nothing without a photo (AC 6.3)', async () => {
    const fetch = await openAsInspector();
    saveFinding({file: null});
    expect(await screen.findByText('A photo is required')).toBeInTheDocument();
    expect(sentFindings(fetch)).toHaveLength(0);
  });

  it('shows "Deadline cannot be in the past" and sends nothing (AC 6.4)', async () => {
    const fetch = await openAsInspector();
    saveFinding({deadline: '2020-01-01'});
    expect(
      await screen.findByText('Deadline cannot be in the past'),
    ).toBeInTheDocument();
    expect(sentFindings(fetch)).toHaveLength(0);
  });

  it('refuses a deadline that does not exist instead of moving it (AC 6.4)', async () => {
    const fetch = await openAsInspector();
    saveFinding({deadline: '2099-02-31'});
    expect(await screen.findByText('Deadline is required')).toBeInTheDocument();
    expect(sentFindings(fetch)).toHaveLength(0);
  });

  it(`shows the server's "Photo must be a JPEG or PNG image" and lists nothing new (AC 6.5)`, async () => {
    await openAsInspector({
      '/api/inspections/7/tickets': Response.json(
        {error: 'Photo must be a JPEG or PNG image'},
        {status: 400},
      ),
    });
    saveFinding({
      file: new File(['%PDF-1.4'], 'notes.pdf', {type: 'application/pdf'}),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Photo must be a JPEG or PNG image',
    );
    expect(screen.getByText('No findings recorded yet.')).toBeInTheDocument();
  });

  it('marks the description as required and sends nothing (AC 6.6)', async () => {
    const fetch = await openAsInspector();
    saveFinding({description: '   '});
    expect(
      await screen.findByText('Description is required'),
    ).toBeInTheDocument();
    expect(sentFindings(fetch)).toHaveLength(0);
  });

  it('marks the severity as required and sends nothing (AC 6.7)', async () => {
    const fetch = await openAsInspector();
    saveFinding({severity: null});
    expect(await screen.findByText('Severity is required')).toBeInTheDocument();
    expect(sentFindings(fetch)).toHaveLength(0);
  });

  it('does not show the finding form to a store owner (AC 6.8)', async () => {
    stubApi({'/api/inspections/7': {...inspection, tickets: [ticket]}});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/inspections/7'});
    expect(await screen.findByText('T-0012')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Save finding'}),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Record a finding')).not.toBeInTheDocument();
  });

  it('marks a field the server refuses', async () => {
    await openAsInspector({
      '/api/inspections/7/tickets': Response.json(
        {
          error: 'Deadline cannot be in the past',
          fields: {deadline: 'Deadline cannot be in the past'},
        },
        {status: 400},
      ),
    });
    saveFinding();
    expect(
      await screen.findByText('Deadline cannot be in the past'),
    ).toBeInTheDocument();
    expect(screen.queryByText('T-0012')).not.toBeInTheDocument();
  });

  it('shrinks the photo before upload (AC 6.9)', async () => {
    vi.mocked(resizeImage).mockResolvedValueOnce(
      new File(['jpeg'], 'photo.jpg', {type: 'image/jpeg'}),
    );
    const fetch = await openAsInspector({
      '/api/inspections/7/tickets': Response.json(ticket, {status: 201}),
    });
    saveFinding();
    await screen.findByText('T-0012');
    expect(resizeImage).toHaveBeenCalledWith(photo);
    expect(sentFindings(fetch)[0].get('photo')).toHaveProperty(
      'name',
      'photo.jpg',
    );
  });

  it('shows "Photo is too large" and sends nothing when the photo is still too large (AC 6.9)', async () => {
    vi.mocked(resizeImage).mockResolvedValueOnce(
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'photo.png', {
        type: 'image/png',
      }),
    );
    const fetch = await openAsInspector();
    saveFinding();
    expect(await screen.findByText('Photo is too large')).toBeInTheDocument();
    expect(sentFindings(fetch)).toHaveLength(0);
  });

  it("shows a finding's photo when the inspector opens it (AC 7.1)", async () => {
    const fetch = await openWithFinding(inspector);
    expect(photoRequests(fetch)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', {name: 'Show photo'}));
    expect(
      await screen.findByAltText('Raw chicken stored above salad'),
    ).toHaveAttribute('src', 'https://example.test/signed.png');
    expect(photoRequests(fetch)).toHaveLength(1);
    expect(
      screen.getByRole('button', {name: 'Hide photo'}),
    ).toBeInTheDocument();
  });

  it("shows each finding's own photo when both are opened (AC 7.1)", async () => {
    const fetch = stubApi({
      '/api/inspections/7': {
        ...inspection,
        tickets: [
          ticket,
          {...ticket, id: 13, description: 'No soap at hand sink'},
        ],
      },
      '/api/tickets/12/photo': {url: 'https://example.test/12.png'},
      '/api/tickets/13/photo': {url: 'https://example.test/13.png'},
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/inspections/7'});
    const [first, second] = await screen.findAllByRole('button', {
      name: 'Show photo',
    });
    fireEvent.click(first);
    fireEvent.click(second);
    expect(
      await screen.findByAltText('Raw chicken stored above salad'),
    ).toHaveAttribute('src', 'https://example.test/12.png');
    expect(await screen.findByAltText('No soap at hand sink')).toHaveAttribute(
      'src',
      'https://example.test/13.png',
    );
    expect(
      fetch.mock.calls
        .map(([path]) => path)
        .filter((path) => path.endsWith('/photo')),
    ).toEqual(['/api/tickets/12/photo', '/api/tickets/13/photo']);
  });

  it("shows a finding's photo when the store's owner opens it (AC 7.2)", async () => {
    const fetch = await openWithFinding(owner);
    expect(photoRequests(fetch)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', {name: 'Show photo'}));
    expect(
      await screen.findByAltText('Raw chicken stored above salad'),
    ).toHaveAttribute('src', 'https://example.test/signed.png');
    expect(photoRequests(fetch)).toHaveLength(1);
  });

  it('shows "Photo unavailable" when the photo is refused (AC 7.3)', async () => {
    await openWithFinding(
      owner,
      Response.json({error: 'Access denied'}, {status: 403}),
    );
    fireEvent.click(screen.getByRole('button', {name: 'Show photo'}));
    expect(await screen.findByText('Photo unavailable')).toBeInTheDocument();
    expect(
      screen.queryByAltText('Raw chicken stored above salad'),
    ).not.toBeInTheDocument();
  });

  it('shows "Photo unavailable" when the photo link has expired (AC 7.4)', async () => {
    await openWithFinding(inspector);
    fireEvent.click(screen.getByRole('button', {name: 'Show photo'}));
    fireEvent.error(
      await screen.findByAltText('Raw chicken stored above salad'),
    );
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument();
    expect(
      screen.queryByAltText('Raw chicken stored above salad'),
    ).not.toBeInTheDocument();
  });

  it('asks for a new link when the photo is opened again (AC 7.4)', async () => {
    let links = 0;
    const fetch = await openWithFinding(inspector, () => ({
      url: `https://example.test/signed-${++links}.png`,
    }));
    fireEvent.click(screen.getByRole('button', {name: 'Show photo'}));
    fireEvent.error(
      await screen.findByAltText('Raw chicken stored above salad'),
    );
    fireEvent.click(screen.getByRole('button', {name: 'Hide photo'}));
    fireEvent.click(screen.getByRole('button', {name: 'Show photo'}));
    expect(
      await screen.findByAltText('Raw chicken stored above salad'),
    ).toHaveAttribute('src', 'https://example.test/signed-2.png');
    expect(photoRequests(fetch)).toHaveLength(2);
  });
});

describe('re-inspections (story 12)', () => {
  it("lists this store's re-inspections and records one as passed (AC 12.2)", async () => {
    const fetch = await openAsInspector({
      [duePath]: due,
      '/api/tickets/4/reinspection': {...due[0], status: 'resolved'},
    });
    const row = await screen.findByRole('group', {name: 'T-0004'});
    expect(screen.getByRole('group', {name: 'T-0005'})).toBeInTheDocument();
    expect(screen.queryByRole('group', {name: 'T-0009'})).toBeNull();

    fireEvent.click(within(row).getByRole('button', {name: 'Passed'}));
    expect(await within(row).findByText('Resolved')).toBeInTheDocument();
    expect(within(row).queryByRole('button', {name: 'Passed'})).toBeNull();
    expect(sentResults(fetch)).toEqual([
      {reinspectionId: 44, inspectionId: 7, outcome: 'passed'},
    ]);
    expect(
      within(screen.getByRole('group', {name: 'T-0005'})).getByRole('button', {
        name: 'Passed',
      }),
    ).toBeInTheDocument();
  });

  it('shows no re-inspections section when none are due (AC 12.2)', async () => {
    const fetch = await openAsInspector({[duePath]: [due[2]]});
    await waitFor(() =>
      expect(fetch.mock.calls.some(([path]) => path === duePath)).toBe(true),
    );
    expect(screen.queryByText('Re-inspections due')).toBeNull();
    expect(screen.queryByRole('button', {name: 'Passed'})).toBeNull();
  });

  it('records a re-inspection as failed (AC 12.3)', async () => {
    const fetch = await openAsInspector({
      [duePath]: due,
      '/api/tickets/4/reinspection': {...due[0], status: 'changes_requested'},
    });
    const row = await screen.findByRole('group', {name: 'T-0004'});
    fireEvent.click(within(row).getByRole('button', {name: 'Failed'}));
    expect(
      await within(row).findByText('Changes requested'),
    ).toBeInTheDocument();
    expect(sentResults(fetch)).toEqual([
      {reinspectionId: 44, inspectionId: 7, outcome: 'failed'},
    ]);
  });

  it('records a new finding on a re-inspection without changing the re-inspected ticket (AC 12.4)', async () => {
    const fetch = await openAsInspector({
      [duePath]: due,
      '/api/inspections/7/tickets': Response.json(ticket, {status: 201}),
    });
    const row = await screen.findByRole('group', {name: 'T-0004'});
    saveFinding();
    expect(await screen.findByText('T-0012')).toBeInTheDocument();
    expect(sentFindings(fetch)).toHaveLength(1);
    expect(
      within(row).getByText('Re-inspection scheduled'),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', {name: 'Passed'}),
    ).toBeInTheDocument();
    expect(sentResults(fetch)).toEqual([]);
  });

  it('shows a store owner no re-inspection buttons (AC 12.6)', async () => {
    const fetch = stubApi({'/api/inspections/7': inspection, [duePath]: due});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/inspections/7'});
    expect(await screen.findByText('INS-0007')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Passed'})).toBeNull();
    expect(fetch.mock.calls.some(([path]) => path === duePath)).toBe(false);
  });
});

const checklistPath = '/api/inspections/7/checklist';
const answerPath = 'PUT /api/inspections/7/checklist/1';

/** Items 1-3 of the standard checklist, none answered yet. */
const checklist: ChecklistEntry[] = [
  'Hand-washing sinks are stocked and free to use',
  'Cold food is held at 41 °F or below',
  'Hot food is held at 135 °F or above',
].map((text, index) => ({id: index + 1, text, answer: null, ticketId: null}));

/** The row of checklist item `index`. */
function itemRow(index: number) {
  return screen.findByRole('group', {name: checklist[index].text});
}

/** The answers the page sent for item 1. */
function sentAnswers(fetch: ReturnType<typeof stubApi>) {
  return fetch.mock.calls
    .filter(
      ([path, init]) =>
        path === '/api/inspections/7/checklist/1' && init?.method === 'PUT',
    )
    .map(([, init]) => JSON.parse(init!.body as string));
}

describe('checklist (story 15)', () => {
  it('shows every checklist item, none answered yet (AC 15.1)', async () => {
    await openAsInspector({[checklistPath]: checklist});
    for (const index of [0, 1, 2]) {
      const row = await itemRow(index);
      for (const name of ['Pass', 'Fail', 'N/A']) {
        expect(within(row).getByRole('radio', {name})).not.toBeChecked();
      }
    }
  });

  it('saves Pass and shows it next to the item (AC 15.1)', async () => {
    const fetch = await openAsInspector({
      [checklistPath]: checklist,
      [answerPath]: {...checklist[0], answer: 'pass'},
    });
    const row = await itemRow(0);
    fireEvent.click(within(row).getByRole('radio', {name: 'Pass'}));
    await waitFor(() =>
      expect(within(row).getByRole('radio', {name: 'Pass'})).toBeEnabled(),
    );
    expect(within(row).getByRole('radio', {name: 'Pass'})).toBeChecked();
    expect(sentAnswers(fetch)).toEqual([{answer: 'pass', ticketId: null}]);
  });

  it('locks an item while its answer saves (AC 15.1)', async () => {
    await openAsInspector({
      [checklistPath]: checklist,
      [answerPath]: {...checklist[0], answer: 'na'},
    });
    const row = await itemRow(0);
    fireEvent.click(within(row).getByRole('radio', {name: 'N/A'}));
    expect(within(row).getByRole('radio', {name: 'Pass'})).toBeDisabled();
    await waitFor(() =>
      expect(within(row).getByRole('radio', {name: 'Pass'})).toBeEnabled(),
    );
    expect(within(row).getByRole('radio', {name: 'N/A'})).toBeChecked();
  });

  it('shows "Record a finding for a failed item" and sends nothing when Fail has no finding (AC 15.2)', async () => {
    const fetch = await openAsInspector({[checklistPath]: checklist});
    const row = await itemRow(0);
    fireEvent.click(within(row).getByRole('radio', {name: 'Fail'}));
    expect(
      within(row).getByText('Record a finding for a failed item'),
    ).toBeInTheDocument();
    expect(
      within(row).getByText('Record the finding below, then choose it here.'),
    ).toBeInTheDocument();
    expect(sentAnswers(fetch)).toEqual([]);
  });

  it("saves a Fail once one of this inspection's findings is chosen (AC 15.2)", async () => {
    const fetch = await openAsInspector({
      '/api/inspections/7': {...inspection, tickets: [ticket]},
      [checklistPath]: checklist,
      [answerPath]: {...checklist[0], answer: 'fail', ticketId: 12},
    });
    const row = await itemRow(0);
    fireEvent.click(within(row).getByRole('radio', {name: 'Fail'}));
    fireEvent.change(within(row).getByLabelText(/^Finding for this item/), {
      target: {value: '12'},
    });
    await waitFor(() =>
      expect(
        within(row).queryByText('Record a finding for a failed item'),
      ).not.toBeInTheDocument(),
    );
    expect(within(row).getByLabelText(/^Finding for this item/)).toHaveValue(
      '12',
    );
    expect(within(row).getByRole('radio', {name: 'Fail'})).toBeChecked();
    expect(sentAnswers(fetch)).toEqual([{answer: 'fail', ticketId: 12}]);
  });

  it('shows the chosen finding while a Fail saves (AC 15.2)', async () => {
    const fetch = await openAsInspector({
      '/api/inspections/7': {...inspection, tickets: [ticket]},
      [checklistPath]: checklist,
    });
    const row = await itemRow(0);
    let respond!: (res: Response) => void;
    fetch.mockImplementationOnce(
      () => new Promise((resolve) => (respond = resolve)),
    );
    fireEvent.click(within(row).getByRole('radio', {name: 'Fail'}));
    const select = within(row).getByLabelText(/^Finding for this item/);
    fireEvent.change(select, {target: {value: '12'}});
    expect(select).toHaveValue('12');
    expect(
      within(row).queryByText('Record a finding for a failed item'),
    ).not.toBeInTheDocument();
    respond(Response.json({...checklist[0], answer: 'fail', ticketId: 12}));
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue('12');
  });

  it('locks the finding while a Fail saves (AC 15.2)', async () => {
    const fetch = await openAsInspector({
      '/api/inspections/7': {
        ...inspection,
        tickets: [
          ticket,
          {...ticket, id: 13, description: 'No soap at hand sink'},
        ],
      },
      [checklistPath]: checklist,
    });
    const row = await itemRow(0);
    let respond!: (res: Response) => void;
    fetch.mockImplementationOnce(
      () => new Promise((resolve) => (respond = resolve)),
    );
    fireEvent.click(within(row).getByRole('radio', {name: 'Fail'}));
    const select = within(row).getByLabelText(/^Finding for this item/);
    fireEvent.change(select, {target: {value: '12'}});
    expect(select).toBeDisabled();
    await userEvent.selectOptions(select, '13');
    expect(sentAnswers(fetch)).toEqual([{answer: 'fail', ticketId: 12}]);
    respond(Response.json({...checklist[0], answer: 'fail', ticketId: 12}));
    await waitFor(() => expect(select).toBeEnabled());
    expect(sentAnswers(fetch)).toEqual([{answer: 'fail', ticketId: 12}]);
  });

  it('offers a finding just recorded on this page for a failed item (AC 15.2)', async () => {
    await openAsInspector({
      [checklistPath]: checklist,
      '/api/inspections/7/tickets': Response.json(ticket, {status: 201}),
    });
    saveFinding();
    await screen.findByText('T-0012');
    const row = await itemRow(0);
    fireEvent.click(within(row).getByRole('radio', {name: 'Fail'}));
    expect(
      within(row).getByRole('option', {
        name: 'T-0012 Raw chicken stored above salad',
      }),
    ).toBeInTheDocument();
  });

  it('changes a saved answer and shows the new one (AC 15.3)', async () => {
    const fetch = await openAsInspector({
      [checklistPath]: [
        {...checklist[0], answer: 'pass'},
        ...checklist.slice(1),
      ],
      [answerPath]: {...checklist[0], answer: 'na'},
    });
    const row = await itemRow(0);
    expect(within(row).getByRole('radio', {name: 'Pass'})).toBeChecked();
    fireEvent.click(within(row).getByRole('radio', {name: 'N/A'}));
    await waitFor(() =>
      expect(within(row).getByRole('radio', {name: 'N/A'})).toBeEnabled(),
    );
    expect(within(row).getByRole('radio', {name: 'N/A'})).toBeChecked();
    expect(within(row).getByRole('radio', {name: 'Pass'})).not.toBeChecked();
    expect(sentAnswers(fetch)).toEqual([{answer: 'na', ticketId: null}]);
  });

  it("shows the store's owner each item and its answer, with nothing to change (AC 15.5)", async () => {
    const fetch = stubApi({
      '/api/inspections/7': {...inspection, tickets: [ticket]},
      [checklistPath]: [
        {...checklist[0], answer: 'fail', ticketId: 12},
        {...checklist[1], answer: 'pass'},
        checklist[2],
      ],
    });
    renderWithAuth(<AppRoutes />, {user: owner, route: '/inspections/7'});
    const failed = await itemRow(0);
    expect(within(failed).getByText('Fail')).toBeInTheDocument();
    expect(within(failed).getByText('T-0012')).toBeInTheDocument();
    expect(within(await itemRow(1)).getByText('Pass')).toBeInTheDocument();
    expect(
      within(await itemRow(2)).getByText('Not answered'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(
      false,
    );
  });

  it("shows the server's message when the checklist cannot be loaded", async () => {
    await openAsInspector({
      [checklistPath]: Response.json(
        {error: 'Internal server error'},
        {status: 500},
      ),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Internal server error',
    );
  });

  it('keeps the saved answer and shows the message when a save is refused', async () => {
    await openAsInspector({
      [checklistPath]: [
        {...checklist[0], answer: 'pass'},
        ...checklist.slice(1),
      ],
      [answerPath]: Response.json(
        {error: 'Checklist item not found'},
        {status: 404},
      ),
    });
    const row = await itemRow(0);
    fireEvent.click(within(row).getByRole('radio', {name: 'N/A'}));
    expect(await within(row).findByRole('alert')).toHaveTextContent(
      'Checklist item not found',
    );
    expect(within(row).getByRole('radio', {name: 'Pass'})).toBeChecked();
    expect(within(row).getByRole('radio', {name: 'N/A'})).not.toBeChecked();
  });
});

const completePath = 'POST /api/inspections/7/complete';
const completedAt = '2026-10-14T15:20:00.000Z';

/** Items 1-3 answered: Pass, Fail with ticket 12, and N/A. */
const answered: ChecklistEntry[] = [
  {...checklist[0], answer: 'pass'},
  {...checklist[1], answer: 'fail', ticketId: 12},
  {...checklist[2], answer: 'na'},
];

/** Inspection 7 completed with ticket 12, as the server sends it. */
const completedInspection: InspectionDetail = {
  ...inspection,
  tickets: [ticket],
  completedAt,
  summary: {pass: 1, fail: 1, na: 1},
};

/** The page header, with the store name and the inspection's state. */
function pageHeader() {
  return screen.getByRole('heading', {name: 'Main St Diner', level: 1})
    .parentElement!.parentElement!;
}

/** The box in the summary for `label`, with its count. */
function summaryCount(label: string) {
  const summary = screen.getByRole('heading', {name: 'Summary'}).parentElement!;
  return within(summary).getByText(label).parentElement!;
}

/** The completes the page sent for inspection 7. */
function sentCompletes(fetch: ReturnType<typeof stubApi>) {
  return fetch.mock.calls.filter(
    ([path, init]) =>
      path === '/api/inspections/7/complete' && init?.method === 'POST',
  );
}

/** Chooses Complete inspection and confirms it in the dialog. */
async function completeAndConfirm() {
  fireEvent.click(screen.getByRole('button', {name: 'Complete inspection'}));
  const dialog = await screen.findByRole('dialog', {
    name: 'Complete this inspection?',
  });
  fireEvent.click(within(dialog).getByRole('button', {name: 'Complete'}));
}

/** Opens completed inspection 7 as `user`. */
async function openCompleted(user: typeof inspector) {
  const fetch = stubApi({
    '/api/inspections/7': completedInspection,
    [checklistPath]: answered,
  });
  renderWithAuth(<AppRoutes />, {user, route: '/inspections/7'});
  await screen.findByRole('heading', {name: 'Summary'});
  return fetch;
}

describe('complete an inspection (story 16)', () => {
  it('completes the inspection and shows the summary of passed, failed and N/A items and the findings (AC 16.1)', async () => {
    const fetch = await openAsInspector({
      '/api/inspections/7': {...inspection, tickets: [ticket]},
      [checklistPath]: answered,
      [completePath]: completedInspection,
    });
    await completeAndConfirm();
    await screen.findByRole('heading', {name: 'Summary'});
    expect(sentCompletes(fetch)).toHaveLength(1);
    expect(summaryCount('Passed')).toHaveTextContent('1');
    expect(summaryCount('Failed')).toHaveTextContent('1');
    expect(summaryCount('N/A')).toHaveTextContent('1');
    const summary = screen.getByRole('heading', {
      name: 'Summary',
    }).parentElement!;
    expect(within(summary).getByText('T-0012').parentElement).toHaveTextContent(
      'Raw chicken stored above salad',
    );
    expect(within(pageHeader()).getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/Oct 14, 2026, 10:20\sAM/)).toBeInTheDocument();
  });

  it('asks for confirmation and completes only after it is confirmed (AC 16.1)', async () => {
    const fetch = await openAsInspector({
      [checklistPath]: answered,
      [completePath]: completedInspection,
    });
    fireEvent.click(screen.getByRole('button', {name: 'Complete inspection'}));
    const dialog = await screen.findByRole('dialog', {
      name: 'Complete this inspection?',
    });
    expect(dialog).toHaveTextContent(
      "Its answers and findings can't be changed after it is completed.",
    );
    expect(sentCompletes(fetch)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', {name: 'Complete'}));
    await screen.findByRole('heading', {name: 'Summary'});
    expect(sentCompletes(fetch)).toHaveLength(1);
  });

  it('sends nothing when the confirmation is cancelled (AC 16.1)', async () => {
    const fetch = await openAsInspector({
      [checklistPath]: answered,
      [completePath]: completedInspection,
    });
    fireEvent.click(screen.getByRole('button', {name: 'Complete inspection'}));
    const dialog = await screen.findByRole('dialog', {
      name: 'Complete this inspection?',
    });
    fireEvent.click(within(dialog).getByRole('button', {name: 'Cancel'}));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(sentCompletes(fetch)).toHaveLength(0);
    expect(within(pageHeader()).getByText('In progress')).toBeInTheDocument();
    expect(
      within(await itemRow(0)).getByRole('radio', {name: 'Pass'}),
    ).toBeChecked();
    expect(
      screen.getByRole('button', {name: 'Complete inspection'}),
    ).toBeEnabled();
  });

  it('locks Complete inspection while it saves (AC 16.1)', async () => {
    const fetch = await openAsInspector({[checklistPath]: answered});
    let respond!: (res: Response) => void;
    fetch.mockImplementationOnce(
      () => new Promise((resolve) => (respond = resolve)),
    );
    await completeAndConfirm();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', {name: 'Complete inspection'}),
    ).toBeDisabled();
    respond(Response.json(completedInspection));
    await screen.findByRole('heading', {name: 'Summary'});
  });

  it('shows "Answer every checklist item first" and keeps the inspection in progress (AC 16.2)', async () => {
    await openAsInspector({
      [checklistPath]: [answered[0], ...checklist.slice(1)],
      [completePath]: Response.json(
        {error: 'Answer every checklist item first'},
        {status: 409},
      ),
    });
    await completeAndConfirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Answer every checklist item first',
    );
    expect(within(pageHeader()).getByText('In progress')).toBeInTheDocument();
    expect(
      within(await itemRow(1)).getByRole('radio', {name: 'Pass'}),
    ).toBeEnabled();
    expect(screen.getByRole('button', {name: 'Save finding'})).toBeEnabled();
    expect(screen.queryByRole('heading', {name: 'Summary'})).toBeNull();
  });

  it('shows "Choose a finding for each failed item first" and sends nothing while a Fail waits for its finding', async () => {
    const fetch = await openAsInspector({
      '/api/inspections/7': {...inspection, tickets: [ticket]},
      [checklistPath]: answered,
      [answerPath]: {...answered[0], answer: 'fail', ticketId: 12},
      [completePath]: completedInspection,
    });
    const row = await itemRow(0);
    fireEvent.click(within(row).getByRole('radio', {name: 'Fail'}));
    fireEvent.click(screen.getByRole('button', {name: 'Complete inspection'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a finding for each failed item first',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sentCompletes(fetch)).toHaveLength(0);
    fireEvent.change(within(row).getByLabelText(/^Finding for this item/), {
      target: {value: '12'},
    });
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    await completeAndConfirm();
    await screen.findByRole('heading', {name: 'Summary'});
    expect(sentCompletes(fetch)).toHaveLength(1);
  });

  it('locks the checklist and hides the finding form once the inspection is completed (AC 16.3)', async () => {
    const fetch = await openAsInspector({
      '/api/inspections/7': {...inspection, tickets: [ticket]},
      [checklistPath]: answered,
      [completePath]: completedInspection,
    });
    await itemRow(0);
    await completeAndConfirm();
    await screen.findByRole('heading', {name: 'Summary'});
    expect(within(await itemRow(0)).getByText('Pass')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', {name: 'Save finding'})).toBeNull();
    expect(
      screen.queryByRole('button', {name: 'Complete inspection'}),
    ).toBeNull();
    expect(
      fetch.mock.calls.filter(([path]) => path === checklistPath),
    ).toHaveLength(2);
  });

  it("shows a completed inspection's summary when it is opened (AC 16.1)", async () => {
    await openCompleted(inspector);
    expect(summaryCount('Passed')).toHaveTextContent('1');
    expect(summaryCount('Failed')).toHaveTextContent('1');
    expect(summaryCount('N/A')).toHaveTextContent('1');
    expect(within(pageHeader()).getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/Oct 14, 2026, 10:20\sAM/)).toBeInTheDocument();
  });

  it("shows the store's owner the summary of a completed inspection and no Complete inspection button (AC 16.1)", async () => {
    await openCompleted(owner);
    expect(summaryCount('Passed')).toHaveTextContent('1');
    expect(within(pageHeader()).getByText('Completed')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Complete inspection'}),
    ).toBeNull();
  });

  it('opens a completed inspection with no way to change an answer or add a finding (AC 16.3)', async () => {
    const fetch = await openCompleted(inspector);
    expect(within(await itemRow(1)).getByText('T-0012')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', {name: 'Save finding'})).toBeNull();
    expect(
      screen.queryByRole('button', {name: 'Complete inspection'}),
    ).toBeNull();
    expect(fetch.mock.calls.some(([, init]) => init?.method !== 'GET')).toBe(
      false,
    );
  });
});
