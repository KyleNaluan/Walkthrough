import {Alert, Button, SimpleGrid, Stack, Textarea} from '@mantine/core';
import {DateInput} from '@mantine/dates';
import {useForm} from '@mantine/form';
import {
  IconAlertCircle,
  IconCheck,
  IconArrowBackUp,
  IconCalendarEvent,
} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiPost} from '../../api';
import {parseDate, today} from '../../lib/today';
import type {ReviewDecision, TicketDetail} from '../../types';

const COMMENT_REQUIRED = 'A comment is required to request changes';
const DATE_REQUIRED = 'A re-inspection date is required';
const DATE_IN_PAST = 'Re-inspection date cannot be in the past';

/**
 * The inspector's review of the latest fix: approve it (story 10), request
 * changes with a comment (story 11) or schedule a re-inspection on a date
 * (story 12). Requesting changes with a blank comment marks the field and
 * sends nothing (AC 11.2); so does scheduling with no date (AC 12.1).
 */
export function ReviewForm({
  ticketId,
  onReviewed,
}: {
  ticketId: number;
  onReviewed: (ticket: TicketDetail) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const form = useForm<{comment: string; scheduledFor: string | null}>({
    initialValues: {comment: '', scheduledFor: null},
    onValuesChange: () => setError(null),
  });

  async function review(decision: ReviewDecision) {
    const comment = form.values.comment.trim();
    const {scheduledFor} = form.values;
    if (decision === 'changes_requested' && !comment) {
      form.setFieldError('comment', COMMENT_REQUIRED);
      return;
    }
    if (
      decision === 'reinspection_scheduled' &&
      (!scheduledFor || scheduledFor < today())
    ) {
      form.setFieldError(
        'scheduledFor',
        scheduledFor ? DATE_IN_PAST : DATE_REQUIRED,
      );
      return;
    }
    form.clearErrors();
    setBusy(decision);
    setError(null);
    try {
      onReviewed(
        await apiPost<TicketDetail>(`/api/tickets/${ticketId}/review`, {
          decision,
          ...(comment && {comment}),
          ...(decision === 'reinspection_scheduled' && {scheduledFor}),
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.fields?.comment) {
        form.setFieldError('comment', err.fields.comment);
      } else if (err instanceof ApiError && err.fields?.scheduledFor) {
        form.setFieldError('scheduledFor', err.fields.scheduledFor);
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
        void review('approved');
      }}
      noValidate
    >
      <Stack>
        <Textarea
          label="Comment"
          description="Required when requesting changes. Tell the owner what still needs to be done."
          autosize
          minRows={3}
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
            Approve fix
          </Button>
          <Button
            color="red"
            variant="outline"
            leftSection={<IconArrowBackUp size={18} />}
            loading={busy === 'changes_requested'}
            disabled={busy !== null}
            onClick={() => void review('changes_requested')}
          >
            Request changes
          </Button>
        </SimpleGrid>
        <DateInput
          label="Re-inspection date"
          description="Required when scheduling a re-inspection."
          valueFormat="YYYY-MM-DD"
          placeholder="YYYY-MM-DD"
          dateParser={parseDate}
          minDate={today()}
          {...form.getInputProps('scheduledFor')}
        />
        <Button
          color="grape"
          variant="outline"
          leftSection={<IconCalendarEvent size={18} />}
          loading={busy === 'reinspection_scheduled'}
          disabled={busy !== null}
          onClick={() => void review('reinspection_scheduled')}
        >
          Schedule re-inspection
        </Button>
      </Stack>
    </form>
  );
}
