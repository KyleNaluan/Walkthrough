import {fireEvent, screen} from '@testing-library/react';
import {useNavigate} from 'react-router';
import {describe, expect, it, vi} from 'vitest';
import {resizeImage} from '../lib/resizeImage';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspection, inspector, owner, stores, ticket} from '../test/users';

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
  const fetch = stubApi({'/api/inspections/7': inspection, ...routes});
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

/** The findings the page sent to the server. */
function sentFindings(fetch: ReturnType<typeof stubApi>) {
  return fetch.mock.calls
    .filter(([path]) => path === '/api/inspections/7/tickets')
    .map(([, init]) => init!.body as FormData);
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
});
