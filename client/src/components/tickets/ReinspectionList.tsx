import {
  Alert,
  Anchor,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Text,
} from '@mantine/core';
import {IconAlertCircle, IconCheck, IconX} from '@tabler/icons-react';
import {useState} from 'react';
import {Link} from 'react-router';
import {ApiError, apiPost} from '../../api';
import {useApi} from '../../lib/useApi';
import {recordNumber} from '../../status';
import type {TicketDetail, TicketSummary} from '../../types';
import {StatusBadge} from '../ui/Badges';
import {Section} from '../ui/Section';

type Outcome = 'passed' | 'failed';

function ReinspectionRow({
  ticket,
  inspectionId,
}: {
  ticket: TicketSummary;
  inspectionId: number;
}) {
  const [status, setStatus] = useState(ticket.status);
  const [busy, setBusy] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function record(outcome: Outcome) {
    setBusy(outcome);
    setError(null);
    try {
      const saved = await apiPost<TicketDetail>(
        `/api/tickets/${ticket.id}/reinspection`,
        {reinspectionId: ticket.reinspectionId, inspectionId, outcome},
      );
      setStatus(saved.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    }
    setBusy(null);
  }

  return (
    <Paper
      withBorder
      p="sm"
      role="group"
      aria-label={recordNumber('T', ticket.id)}
    >
      <Group gap="xs" mb={4}>
        <Anchor
          component={Link}
          to={`/tickets/${ticket.id}`}
          ff="monospace"
          fz="xs"
        >
          {recordNumber('T', ticket.id)}
        </Anchor>
        <StatusBadge status={status} />
      </Group>
      <Text>{ticket.description}</Text>
      {status === 'reinspection_scheduled' && (
        <SimpleGrid cols={2} spacing="sm" mt="xs">
          <Button
            color="green"
            leftSection={<IconCheck size={18} />}
            loading={busy === 'passed'}
            disabled={busy !== null}
            onClick={() => void record('passed')}
          >
            Passed
          </Button>
          <Button
            color="red"
            variant="outline"
            leftSection={<IconX size={18} />}
            loading={busy === 'failed'}
            disabled={busy !== null}
            onClick={() => void record('failed')}
          >
            Failed
          </Button>
        </SimpleGrid>
      )}
      {error && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertCircle size={18} />}
          mt="xs"
        >
          {error}
        </Alert>
      )}
    </Paper>
  );
}

/**
 * The store's tickets with a re-inspection scheduled, for the inspector to
 * record as passed or failed on this inspection (story 12). Shows nothing
 * until some are due.
 */
export function ReinspectionList({
  storeId,
  inspectionId,
}: {
  storeId: number;
  inspectionId: number;
}) {
  const due = useApi<TicketSummary[]>(
    '/api/tickets?status=reinspection_scheduled',
  );
  const tickets =
    due.status === 'done'
      ? due.data.filter((ticket) => ticket.store.id === storeId)
      : [];
  if (tickets.length === 0) return null;
  return (
    <Section title="Re-inspections due">
      {tickets.map((ticket) => (
        <ReinspectionRow
          key={ticket.id}
          ticket={ticket}
          inspectionId={inspectionId}
        />
      ))}
    </Section>
  );
}
