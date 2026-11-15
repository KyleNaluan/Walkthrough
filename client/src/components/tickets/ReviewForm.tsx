import {Alert, Button, SimpleGrid, Stack, Textarea} from '@mantine/core';
import {useForm} from '@mantine/form';
import {IconAlertCircle, IconCheck, IconArrowBackUp} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiPost} from '../../api';
import type {TicketDetail} from '../../types';

type Decision = 'approved' | 'changes_requested';

const COMMENT_REQUIRED = 'A comment is required to request changes';

/**
 * The inspector's review of the latest fix: approve it (story 10) or request
 * changes with a comment (story 11). Requesting changes with a blank comment
 * marks the field and sends nothing (AC 11.2).
 */
export function ReviewForm({
  ticketId,
  onReviewed,
}: {
  ticketId: number;
  onReviewed: (ticket: TicketDetail) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Decision | null>(null);
  const form = useForm({
    initialValues: {comment: ''},
    onValuesChange: () => setError(null),
  });

  async function review(decision: Decision) {
    const comment = form.values.comment.trim();
    if (decision === 'changes_requested' && !comment) {
      form.setFieldError('comment', COMMENT_REQUIRED);
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
        }),
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
      </Stack>
    </form>
  );
}
