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
  IconCheck,
  IconHourglass,
  IconX,
} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiPost} from '../../api';
import {useAuth} from '../../auth/useAuth';
import {pendingExtension} from '../../lib/extensions';
import {formatDate} from '../../lib/format';
import {parseDate, today} from '../../lib/today';
import type {ExtensionRequest, TicketDetail} from '../../types';
import {Section} from '../ui/Section';

const NOT_LATER = 'New deadline must be after the current one';
const IN_PAST = 'New deadline cannot be in the past';
const DATE_REQUIRED = 'New deadline is required';
const REASON_REQUIRED = 'Reason is required';
const DENY_COMMENT = 'A comment is required to deny a request';

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
  const latest = ticket.extensionRequests.at(-1);

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
      {/* AC 18.2: the owner sees why their last request was denied. */}
      {latest?.status === 'denied' && latest.decision && (
        <Alert
          color="red"
          variant="light"
          icon={<IconX size={18} />}
          title={`Extension to ${formatDate(latest.requestedDeadline)} denied by ${latest.decision.deciderName}`}
        >
          {latest.decision.comment}
        </Alert>
      )}
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
 * The inspector's decision on a pending request (story 18): approve it, which
 * moves the deadline, or deny it with a comment. Denying with a blank comment
 * marks the field and sends nothing (AC 18.3).
 */
function DecideExtensionForm({
  ticket,
  request,
  onDecided,
}: {
  ticket: TicketDetail;
  request: ExtensionRequest;
  onDecided: (ticket: TicketDetail) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approved' | 'denied' | null>(null);
  const form = useForm({
    initialValues: {comment: ''},
    onValuesChange: () => setError(null),
  });

  async function decide(decision: 'approved' | 'denied') {
    const comment = form.values.comment.trim();
    if (decision === 'denied' && !comment) {
      form.setFieldError('comment', DENY_COMMENT);
      return;
    }
    form.clearErrors();
    setBusy(decision);
    setError(null);
    try {
      onDecided(
        await apiPost<TicketDetail>(
          `/api/tickets/${ticket.id}/extension-requests/${request.id}/decision`,
          {decision, ...(comment && {comment})},
        ),
      );
    } catch (err) {
      if (err instanceof ApiError && err.fields?.comment) {
        form.setFieldError('comment', err.fields.comment);
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not save');
      }
      setBusy(null);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void decide('approved');
      }}
      noValidate
    >
      <Stack>
        <div>
          <Text fw={600}>
            {request.requesterName} asks to move the deadline from{' '}
            {formatDate(request.previousDeadline)} to{' '}
            {formatDate(request.requestedDeadline)}.
          </Text>
          <Text mt={4}>{request.reason}</Text>
        </div>
        <Textarea
          label="Comment"
          description="Required to deny. Tell the owner why."
          autosize
          minRows={2}
          disabled={busy !== null}
          {...form.getInputProps('comment')}
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
          <Button
            type="submit"
            color="green"
            leftSection={<IconCheck size={18} />}
            loading={busy === 'approved'}
            disabled={busy !== null}
          >
            Approve extension
          </Button>
          <Button
            color="red"
            variant="outline"
            leftSection={<IconX size={18} />}
            loading={busy === 'denied'}
            disabled={busy !== null}
            onClick={() => void decide('denied')}
          >
            Deny
          </Button>
        </SimpleGrid>
      </Stack>
    </form>
  );
}

/** The inspector's side: the pending request to decide, if any (story 18). */
function InspectorExtension({
  ticket,
  onChange,
}: {
  ticket: TicketDetail;
  onChange: (ticket: TicketDetail) => void;
}) {
  const pending = pendingExtension(ticket);
  if (!pending) return null;
  return (
    <Section title="Extension request">
      {/* A new key starts the form fresh for another request. */}
      <DecideExtensionForm
        key={pending.id}
        ticket={ticket}
        request={pending}
        onDecided={onChange}
      />
    </Section>
  );
}

/**
 * Deadline extensions on the ticket page. Store owners ask for a later
 * deadline (story 17); inspectors approve or deny it (story 18). The server
 * checks the role, the store and the ticket for each step.
 */
export function DeadlineExtension({
  ticket,
  onChange,
}: {
  ticket: TicketDetail;
  onChange: (ticket: TicketDetail) => void;
}) {
  const {user} = useAuth();
  if (user?.role === 'inspector') {
    return <InspectorExtension ticket={ticket} onChange={onChange} />;
  }
  if (user?.role !== 'store_owner') return null;
  return <OwnerExtension ticket={ticket} onChange={onChange} />;
}
