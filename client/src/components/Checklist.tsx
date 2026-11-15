import {
  Alert,
  Group,
  NativeSelect,
  Paper,
  SegmentedControl,
  Text,
} from '@mantine/core';
import {IconAlertCircle} from '@tabler/icons-react';
import {useCallback, useEffect, useState} from 'react';
import {ApiError, apiPut} from '../api';
import {useApi} from '../lib/useApi';
import {CHECKLIST_ANSWER, recordNumber} from '../status';
import type {ChecklistAnswer, ChecklistEntry, Ticket} from '../types';
import {AnswerBadge} from './ui/Badges';
import {LoadFailed, Loading} from './ui/LoadState';
import {Section} from './ui/Section';

const FINDING_REQUIRED = 'Record a finding for a failed item';

const ANSWERS = (['pass', 'fail', 'na'] as const).map((value) => ({
  value,
  label: CHECKLIST_ANSWER[value].label,
}));

/** The theme's gray shade reads as black on the control, so N/A is lighter. */
function indicatorColor(answer: ChecklistAnswer | null) {
  if (answer === 'na') return 'gray.6';
  return answer ? CHECKLIST_ANSWER[answer].color : undefined;
}

/** An item and its answer, with nothing to change (AC 15.5). */
function ChecklistResult({entry}: {entry: ChecklistEntry}) {
  return (
    <Paper withBorder p="sm" role="group" aria-label={entry.text}>
      <Text mb={4}>{entry.text}</Text>
      <Group gap="xs">
        <AnswerBadge answer={entry.answer} />
        {entry.ticketId != null && (
          <Text ff="monospace" fz="xs" c="dimmed">
            {recordNumber('T', entry.ticketId)}
          </Text>
        )}
      </Group>
    </Paper>
  );
}

function ChecklistRow({
  entry,
  inspectionId,
  tickets,
  onUnsavedFail,
}: {
  entry: ChecklistEntry;
  inspectionId: number;
  tickets: Ticket[];
  onUnsavedFail: (itemId: number, unsaved: boolean) => void;
}) {
  const [saved, setSaved] = useState(entry);
  // What the control shows: the saved answer, or a Fail waiting for its
  // finding.
  const [choice, setChoice] = useState(entry.answer);
  // The answer being sent; the row is locked until the server replies.
  const [sending, setSending] = useState<{
    answer: ChecklistAnswer;
    ticketId: number | null;
  } | null>(null);
  const busy = sending !== null;
  const [error, setError] = useState<string | null>(null);
  const unsavedFail = choice === 'fail' && saved.answer !== 'fail';
  useEffect(() => {
    onUnsavedFail(entry.id, unsavedFail);
    return () => onUnsavedFail(entry.id, false);
  }, [entry.id, unsavedFail, onUnsavedFail]);

  async function save(answer: ChecklistAnswer, ticketId: number | null) {
    setSending({answer, ticketId});
    setError(null);
    try {
      const result = await apiPut<ChecklistEntry>(
        `/api/inspections/${inspectionId}/checklist/${entry.id}`,
        {answer, ticketId},
      );
      setSaved(result);
      setChoice(result.answer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
      setChoice(saved.answer);
    }
    setSending(null);
  }

  function pick(value: string) {
    const answer = value as ChecklistAnswer;
    setChoice(answer);
    setError(null);
    // A Fail is sent once its finding is chosen (AC 15.2).
    if (answer !== 'fail') void save(answer, null);
  }

  const shown = sending ?? saved;
  const findingId = shown.answer === 'fail' ? String(shown.ticketId) : '';
  return (
    <Paper withBorder p="sm" role="group" aria-label={entry.text}>
      <Text mb="xs">{entry.text}</Text>
      <SegmentedControl
        fullWidth
        size="md"
        data={ANSWERS}
        value={choice ?? ''}
        color={indicatorColor(choice)}
        disabled={busy}
        onChange={pick}
      />
      {choice === 'fail' && (
        <NativeSelect
          label="Finding for this item"
          size="md"
          description={
            tickets.length === 0
              ? 'Record the finding below, then choose it here.'
              : undefined
          }
          data={[
            {value: '', label: 'Choose a finding'},
            ...tickets.map((ticket) => ({
              value: String(ticket.id),
              label: `${recordNumber('T', ticket.id)} ${ticket.description}`,
            })),
          ]}
          value={findingId}
          error={findingId ? undefined : FINDING_REQUIRED}
          disabled={busy}
          onChange={(event) => {
            const id = event.currentTarget.value;
            if (id) void save('fail', Number(id));
          }}
          mt="xs"
        />
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
 * An inspection's standard checklist (story 15). Inspectors answer each item
 * Pass, Fail or N/A, and a Fail names one of `tickets`, this inspection's
 * findings. Store owners see the answers only. `onUnsavedFail` hears whether
 * any Fail still waits for its finding.
 */
export function Checklist({
  inspectionId,
  tickets,
  canAnswer,
  onUnsavedFail,
}: {
  inspectionId: number;
  tickets: Ticket[];
  canAnswer: boolean;
  onUnsavedFail: (unsaved: boolean) => void;
}) {
  const checklist = useApi<ChecklistEntry[]>(
    `/api/inspections/${inspectionId}/checklist`,
  );
  // The items with a Fail chosen and not saved yet, waiting for its finding.
  const [unsaved, setUnsaved] = useState<ReadonlySet<number>>(new Set());
  const markUnsaved = useCallback((itemId: number, waiting: boolean) => {
    setUnsaved((ids) => {
      if (ids.has(itemId) === waiting) return ids;
      const next = new Set(ids);
      if (waiting) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);
  const anyUnsaved = unsaved.size > 0;
  useEffect(() => onUnsavedFail(anyUnsaved), [anyUnsaved, onUnsavedFail]);
  return (
    <Section title="Checklist">
      {checklist.status === 'loading' && <Loading />}
      {checklist.status === 'error' && (
        <LoadFailed message={checklist.error.message} />
      )}
      {checklist.status === 'done' &&
        checklist.data.map((entry) =>
          canAnswer ? (
            <ChecklistRow
              key={entry.id}
              entry={entry}
              inspectionId={inspectionId}
              tickets={tickets}
              onUnsavedFail={markUnsaved}
            />
          ) : (
            <ChecklistResult key={entry.id} entry={entry} />
          ),
        )}
    </Section>
  );
}
