import {Anchor, Box, Group, Paper, Text} from '@mantine/core';
import {IconArrowLeft, IconPhoto} from '@tabler/icons-react';
import {useState} from 'react';
import {Link, useParams} from 'react-router';
import {apiGet} from '../api';
import {useAuth} from '../auth/useAuth';
import {Checklist} from '../components/Checklist';
import {CompletionSummary} from '../components/CompletionSummary';
import {FindingForm} from '../components/FindingForm';
import {Photo} from '../components/Photo';
import {ReinspectionList} from '../components/tickets/ReinspectionList';
import {
  InspectionStateBadge,
  SeverityBadge,
  StatusBadge,
} from '../components/ui/Badges';
import {Field} from '../components/ui/Field';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {InspectionDetail, Ticket} from '../types';

// Chicago, like the server's TIME_ZONE, e.g. "Oct 14, 2026, 9:05 AM".
const startedFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Chicago',
});

// A deadline is a date with no time, e.g. "Jan 15, 2099"; UTC keeps the day.
const deadlineFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

function FindingRow({ticket}: {ticket: Ticket}) {
  // The photo link is fetched only when the finding is opened (AC 7.1, 7.2).
  const [open, setOpen] = useState(false);
  return (
    <Paper withBorder p="sm">
      <Group gap="xs" mb={4}>
        <Text ff="monospace" fz="xs" c="dimmed">
          {recordNumber('T', ticket.id)}
        </Text>
        <SeverityBadge severity={ticket.severity} />
        <StatusBadge status={ticket.status} />
      </Group>
      <Text>{ticket.description}</Text>
      <Text fz="sm" c="dimmed">
        Due {deadlineFormat.format(new Date(ticket.deadline))}
      </Text>
      <Anchor
        component="button"
        type="button"
        fz="sm"
        mt="xs"
        display="block"
        onClick={() => setOpen((shown) => !shown)}
      >
        <Group gap={4} component="span">
          <IconPhoto size={16} />
          {open ? 'Hide photo' : 'Show photo'}
        </Group>
      </Anchor>
      {open && (
        <Box maw={360} mt="xs">
          <Photo
            src={() =>
              apiGet<{url: string}>(`/api/tickets/${ticket.id}/photo`).then(
                (body) => body.url,
              )
            }
            alt={ticket.description}
          />
        </Box>
      )}
    </Paper>
  );
}

/**
 * One inspection: its store, inspector and start time (story 5), its
 * findings (story 6) with their photos (story 7), for inspectors the store's
 * re-inspections due (story 12), its checklist (story 15), and once
 * completed its summary (story 16).
 */
export function InspectionPage() {
  const {inspectionId} = useParams();
  // A new page for each inspection, so its findings and form never carry over.
  return <InspectionView key={inspectionId} inspectionId={inspectionId} />;
}

function InspectionView({inspectionId}: {inspectionId?: string}) {
  const {user} = useAuth();
  const inspection = useApi<InspectionDetail>(
    `/api/inspections/${inspectionId}`,
  );
  // Findings recorded on this page, after the ones the inspection came with.
  const [added, setAdded] = useState<Ticket[]>([]);
  const detail = inspection.status === 'done' ? inspection.data : null;
  const tickets = detail ? [...detail.tickets, ...added] : [];
  // Once completed, nobody can answer or record a finding (AC 16.3).
  const canChange = user?.role === 'inspector' && !detail?.completedAt;

  return (
    <>
      {inspection.status === 'loading' && <Loading />}
      {inspection.status === 'error' && (
        <>
          <PageHeader title="Inspection" />
          <LoadFailed message={inspection.error.message} />
        </>
      )}
      {detail && (
        <>
          <Anchor
            component={Link}
            to={`/stores/${detail.storeId}`}
            fz="sm"
            mb="sm"
            display="block"
          >
            <Group gap={4} component="span">
              <IconArrowLeft size={16} />
              Back to store
            </Group>
          </Anchor>
          <PageHeader
            eyebrow={recordNumber('INS', detail.id)}
            title={detail.store.name}
            actions={<InspectionStateBadge completedAt={detail.completedAt} />}
          />
          <Section title="Inspection details">
            <Field label="Store" value={detail.store.name} />
            <Field label="Address" value={detail.store.address} />
            <Field
              label="Inspector"
              value={`${detail.inspector.firstName} ${detail.inspector.lastName}`}
            />
            <Field
              label="Started"
              value={startedFormat.format(new Date(detail.startedAt))}
            />
            {detail.completedAt && (
              <Field
                label="Completed"
                value={startedFormat.format(new Date(detail.completedAt))}
              />
            )}
          </Section>
          {detail.summary && (
            <CompletionSummary summary={detail.summary} tickets={tickets} />
          )}
          {user?.role === 'inspector' && (
            <ReinspectionList
              storeId={detail.storeId}
              inspectionId={detail.id}
            />
          )}
          <Checklist
            inspectionId={detail.id}
            tickets={tickets}
            canAnswer={canChange}
          />
          <Section title="Findings">
            {tickets.length === 0 && (
              <Text c="dimmed">No findings recorded yet.</Text>
            )}
            {tickets.map((ticket) => (
              <FindingRow key={ticket.id} ticket={ticket} />
            ))}
          </Section>
          {/* The server refuses owners too (AC 6.8). */}
          {canChange && (
            <Section title="Record a finding">
              <FindingForm
                inspectionId={detail.id}
                onSaved={(ticket) => setAdded((saved) => [...saved, ticket])}
              />
            </Section>
          )}
        </>
      )}
    </>
  );
}
