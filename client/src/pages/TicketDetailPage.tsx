import {Anchor, Box, Group, SimpleGrid, Text} from '@mantine/core';
import {
  IconArrowLeft,
  IconCircleCheck,
  IconHourglass,
} from '@tabler/icons-react';
import {useState} from 'react';
import {Link, useParams} from 'react-router';
import {apiGet} from '../api';
import {useAuth} from '../auth/useAuth';
import {Photo} from '../components/Photo';
import {FixHistory} from '../components/tickets/FixHistory';
import {SubmitFixForm} from '../components/tickets/SubmitFixForm';
import {
  OverdueBadge,
  SeverityBadge,
  StatusBadge,
} from '../components/ui/Badges';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';
import {formatDate, formatDateTime} from '../lib/format';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {TicketDetail} from '../types';

function Field({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Text fz="xs" tt="uppercase" c="dimmed" fw={600} lts={0.5}>
        {label}
      </Text>
      <Text ff={mono ? 'monospace' : undefined} fz={mono ? 'sm' : undefined}>
        {children}
      </Text>
    </div>
  );
}

/** What an owner sees in place of the fix form when none can be sent. */
const OWNER_NOTE: Partial<Record<TicketDetail['status'], string>> = {
  pending_review: 'Your fix has been sent and is waiting for review.',
  reinspection_scheduled: 'A re-inspection has been scheduled.',
  resolved: 'This ticket is resolved. No further fix is needed.',
};

function Ticket({
  ticket,
  onChange,
}: {
  ticket: TicketDetail;
  onChange: (ticket: TicketDetail) => void;
}) {
  const {user} = useAuth();
  const isOwner = user?.role === 'store_owner';
  const canSubmitFix =
    isOwner &&
    (ticket.status === 'open' || ticket.status === 'changes_requested');

  return (
    <>
      <PageHeader
        eyebrow={`${recordNumber('T', ticket.id)} · ${ticket.store.name}`}
        title={ticket.description}
      />
      <Group gap="xs" mb="md">
        <StatusBadge status={ticket.status} />
        <SeverityBadge severity={ticket.severity} />
        {ticket.overdue && <OverdueBadge />}
      </Group>

      <Section title="Finding">
        <SimpleGrid cols={{base: 1, xs: 2}} spacing="sm">
          <Field label="Deadline" mono>
            {formatDate(ticket.deadline)}
          </Field>
          <Field label="Recorded" mono>
            {formatDateTime(ticket.recordedAt)}
          </Field>
        </SimpleGrid>
        <Box maw={360}>
          <Photo
            alt="Photo of the finding"
            src={() =>
              apiGet<{url: string}>(`/api/tickets/${ticket.id}/photo`).then(
                (res) => res.url,
              )
            }
          />
        </Box>
      </Section>

      {ticket.fixes.length > 0 && (
        <Section title="Fix history">
          <FixHistory ticketId={ticket.id} fixes={ticket.fixes} />
        </Section>
      )}

      {canSubmitFix && (
        <Section
          title={
            ticket.status === 'changes_requested'
              ? 'Submit another fix'
              : 'Submit a fix'
          }
        >
          <SubmitFixForm ticketId={ticket.id} onSubmitted={onChange} />
        </Section>
      )}
      {isOwner && OWNER_NOTE[ticket.status] && (
        <Group gap={8} c="dimmed" mb="md">
          {ticket.status === 'resolved' ? (
            <IconCircleCheck size={18} />
          ) : (
            <IconHourglass size={18} />
          )}
          <Text fz="sm">{OWNER_NOTE[ticket.status]}</Text>
        </Group>
      )}
    </>
  );
}

/**
 * One ticket: the finding, every fix round and its review, and the next
 * step for whoever is looking. Owners submit fixes (story 9). The server
 * checks access and status for each step.
 */
export function TicketDetailPage() {
  const {ticketId} = useParams();
  const loaded = useApi<TicketDetail>(`/api/tickets/${ticketId}`);
  // The ticket as a submit or review returned it, newer than `loaded`.
  const [updated, setUpdated] = useState<TicketDetail | null>(null);
  const ticket =
    updated && String(updated.id) === ticketId
      ? updated
      : loaded.status === 'done'
        ? loaded.data
        : null;

  return (
    <>
      <Anchor component={Link} to="/tickets" fz="sm" mb="sm" display="block">
        <Group gap={4} component="span">
          <IconArrowLeft size={16} />
          Back to tickets
        </Group>
      </Anchor>
      {!ticket && loaded.status === 'loading' && <Loading />}
      {!ticket && loaded.status === 'error' && (
        <>
          <PageHeader title="Ticket" />
          <LoadFailed message={loaded.error.message} />
        </>
      )}
      {ticket && <Ticket ticket={ticket} onChange={setUpdated} />}
    </>
  );
}
