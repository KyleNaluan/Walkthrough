import {Alert, Button, Stack} from '@mantine/core';
import {IconAlertCircle, IconCheck} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiPost} from '../../api';
import type {TicketDetail} from '../../types';

/** The inspector's review of the latest fix: approve it (story 10). */
export function ReviewForm({
  ticketId,
  onReviewed,
}: {
  ticketId: number;
  onReviewed: (ticket: TicketDetail) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      onReviewed(
        await apiPost<TicketDetail>(`/api/tickets/${ticketId}/review`, {
          decision: 'approved',
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <Stack>
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
          {error}
        </Alert>
      )}
      <Button
        color="green"
        leftSection={<IconCheck size={18} />}
        loading={busy}
        onClick={() => void approve()}
      >
        Approve fix
      </Button>
    </Stack>
  );
}
