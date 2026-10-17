import {Alert, Anchor, Box, Group, SimpleGrid, Text} from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowLeft,
  IconCircleCheck,
  IconHourglass,
} from '@tabler/icons-react';
import {useState} from 'react';
import {Link, useParams} from 'react-router';
import {apiGet} from '../api';
import {useAuth} from '../auth/useAuth';
import {Photo} from '../components/Photo';
import {ReviewForm} from '../components/tickets/ReviewForm';
import {SubmitFixForm} from '../components/tickets/SubmitFixForm';
import {TicketTimeline} from '../components/tickets/TicketTimeline';
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

/** Where an inspector records a scheduled re-inspection (story 12). */
const INSPECTOR_NOTE =
  'Start an inspection of this store to record the re-inspection result.';

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
  const canReview =
    user?.role === 'inspector' && ticket.status === 'pending_review';
  const latestReview = ticket.fixes.at(-1)?.review;
  const note = isOwner
    ? OWNER_NOTE[ticket.status]
    : ticket.status === 'reinspection_scheduled'
      ? INSPECTOR_NOTE
      : undefined;

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

      {/* AC 11.3: the owner sees what still needs to be done. */}
      {ticket.status === 'changes_requested' &&
        latestReview?.decision === 'changes_requested' &&
        latestReview.comment && (
          <Alert
            color="red"
            variant="light"
            mb="md"
            icon={<IconArrowBackUp size={18} />}
            title={`Changes requested by ${latestReview.reviewerName}`}
          >
            {latestReview.comment}
          </Alert>
        )}

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

      <Section title="Timeline">
        <TicketTimeline ticket={ticket} />
      </Section>

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
      {note && (
        <Group gap={8} c="dimmed" mb="md">
          {ticket.status === 'resolved' ? (
            <IconCircleCheck size={18} />
          ) : (
            <IconHourglass size={18} />
          )}
          <Text fz="sm">{note}</Text>
        </Group>
      )}

      {canReview && (
        <Section title="Review the latest fix">
          <ReviewForm ticketId={ticket.id} onReviewed={onChange} />
        </Section>
      )}
    </>
  );
}

/**
 * One ticket: the finding, a timeline of its history (story 13), and the
 * next step for whoever is looking. Owners submit fixes (story 9); inspectors
 * approve (story 10) or request changes (story 11). The server checks
 * access and status for each step.
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
