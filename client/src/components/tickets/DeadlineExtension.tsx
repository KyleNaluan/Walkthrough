import {
  Alert,
  Badge,
  Button,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import {DateInput} from '@mantine/dates';
import {useForm} from '@mantine/form';
import {
  IconAlertCircle,
  IconCalendarPlus,
  IconCalendarTime,
  IconHourglass,
} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiPost} from '../../api';
import {useAuth} from '../../auth/useAuth';
import {pendingExtension} from '../../lib/extensions';
import {formatDate} from '../../lib/format';
import {parseDate, today} from '../../lib/today';
import type {TicketDetail} from '../../types';
import {Section} from '../ui/Section';

const NOT_LATER = 'New deadline must be after the current one';
const IN_PAST = 'New deadline cannot be in the past';
const DATE_REQUIRED = 'New deadline is required';
const REASON_REQUIRED = 'Reason is required';

/** Shown next to the status while a request waits for an inspector. */
export function ExtensionBadge() {
  return (
    <Badge
      color="yellow"
      variant="outline"
      leftSection={<IconCalendarTime size={12} />}
    >
      Extension requested
    </Badge>
  );
}

/**
 * The store owner's request for a later deadline, with a reason (story 17).
 * A date that isn't after the current deadline, or a blank reason, is
 * marked and nothing is sent (AC 17.2, 17.3); the server checks again. The
 * calendar has no minDate: DateInput drops a typed date before it, which
 * would hide the "must be after" message.
 */
function RequestExtensionForm({
  ticket,
  onSent,
  onCancel,
}: {
  ticket: TicketDetail;
  onSent: (ticket: TicketDetail) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<{deadline: string | null; reason: string}>({
    initialValues: {deadline: null, reason: ''},
    validate: {
      deadline: (value) => {
        if (!value) return DATE_REQUIRED;
        if (value <= ticket.deadline) return NOT_LATER;
        return value < today() ? IN_PAST : null;
      },
      reason: (value) => (value.trim() === '' ? REASON_REQUIRED : null),
    },
    onValuesChange: () => setError(null),
  });

  async function handleSubmit({deadline, reason}: typeof form.values) {
    setBusy(true);
    setError(null);
    try {
      onSent(
        await apiPost<TicketDetail>(
          `/api/tickets/${ticket.id}/extension-requests`,
          {deadline, reason: reason.trim()},
        ),
      );
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        form.setErrors(err.fields);
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not send');
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
      <Stack>
        <DateInput
          label="New deadline"
          description={`Current deadline: ${formatDate(ticket.deadline)}`}
          valueFormat="YYYY-MM-DD"
          placeholder="YYYY-MM-DD"
          dateParser={parseDate}
          withAsterisk
          disabled={busy}
          {...form.getInputProps('deadline')}
        />
        <Textarea
          label="Reason"
          description="Tell the inspector why you need more time."
          autosize
          minRows={3}
          withAsterisk
          disabled={busy}
          {...form.getInputProps('reason')}
        />
        {error && (
          <Alert
            color="red"
            variant="light"
            icon={<IconAlertCircle size={18} />}
          >
            {error}
          </Alert>
        )}
        {/* Side by side when there is room; stacked on narrow phones. */}
        <SimpleGrid cols={{base: 1, xs: 2}} spacing="sm">
          <Button type="submit" loading={busy}>
            Send request
          </Button>
          <Button variant="default" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </SimpleGrid>
      </Stack>
    </form>
  );
}

/** The owner's side: the request waiting, or a way to ask (story 17). */
function OwnerExtension({
  ticket,
  onChange,
}: {
  ticket: TicketDetail;
  onChange: (ticket: TicketDetail) => void;
}) {
  const [asking, setAsking] = useState(false);
  const pending = pendingExtension(ticket);

  if (pending) {
    return (
      <Section title="Deadline extension">
        <Alert
          color="yellow"
          variant="light"
          icon={<IconHourglass size={18} />}
          title={`Extension to ${formatDate(pending.requestedDeadline)} requested`}
        >
          Waiting for an inspector to decide. The deadline stays{' '}
          {formatDate(ticket.deadline)} until then.
        </Alert>
      </Section>
    );
  }
  // A resolved ticket's deadline no longer matters (AC 17.5).
  if (ticket.status === 'resolved') return null;

  return (
    <Section title="Deadline extension">
      {asking ? (
        <RequestExtensionForm
          ticket={ticket}
          onSent={(updated) => {
            setAsking(false);
            onChange(updated);
          }}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <>
          <Text fz="sm" c="dimmed">
            Need more time than {formatDate(ticket.deadline)}? Ask an inspector
            for a later deadline.
          </Text>
          <Button
            variant="outline"
            leftSection={<IconCalendarPlus size={18} />}
            onClick={() => setAsking(true)}
          >
            Request a later deadline
          </Button>
        </>
      )}
    </Section>
  );
}

/**
 * Deadline extensions on the ticket page. Store owners ask for a later
 * deadline (story 17). The server checks the role, the store and the
 * ticket for each step.
 */
export function DeadlineExtension({
  ticket,
  onChange,
}: {
  ticket: TicketDetail;
  onChange: (ticket: TicketDetail) => void;
}) {
  const {user} = useAuth();
  if (user?.role !== 'store_owner') return null;
  return <OwnerExtension ticket={ticket} onChange={onChange} />;
}
