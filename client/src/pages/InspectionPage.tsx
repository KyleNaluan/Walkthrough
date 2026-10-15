import {Anchor, Group, Paper, Text} from '@mantine/core';
import {IconArrowLeft} from '@tabler/icons-react';
import {useState} from 'react';
import {Link, useParams} from 'react-router';
import {useAuth} from '../auth/useAuth';
import {FindingForm} from '../components/FindingForm';
import {SeverityBadge, StatusBadge} from '../components/ui/Badges';
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
    </Paper>
  );
}

/**
 * One inspection: its store, inspector and start time (story 5), and its
 * findings (story 6).
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
  const tickets =
    inspection.status === 'done' ? [...inspection.data.tickets, ...added] : [];

  return (
    <>
      {inspection.status === 'loading' && <Loading />}
      {inspection.status === 'error' && (
        <>
          <PageHeader title="Inspection" />
          <LoadFailed message={inspection.error.message} />
        </>
      )}
      {inspection.status === 'done' && (
        <>
          <Anchor
            component={Link}
            to={`/stores/${inspection.data.storeId}`}
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
            eyebrow={recordNumber('INS', inspection.data.id)}
            title={inspection.data.store.name}
          />
          <Section title="Inspection details">
            <Field label="Store" value={inspection.data.store.name} />
            <Field label="Address" value={inspection.data.store.address} />
            <Field
              label="Inspector"
              value={`${inspection.data.inspector.firstName} ${inspection.data.inspector.lastName}`}
            />
            <Field
              label="Started"
              value={startedFormat.format(new Date(inspection.data.startedAt))}
            />
          </Section>
          <Section title="Findings">
            {tickets.length === 0 && (
              <Text c="dimmed">No findings recorded yet.</Text>
            )}
            {tickets.map((ticket) => (
              <FindingRow key={ticket.id} ticket={ticket} />
            ))}
          </Section>
          {/* The server refuses owners too (AC 6.8). */}
          {user?.role === 'inspector' && (
            <Section title="Record a finding">
              <FindingForm
                inspectionId={inspection.data.id}
                onSaved={(ticket) => setAdded((saved) => [...saved, ticket])}
              />
            </Section>
          )}
        </>
      )}
    </>
  );
}
