import {Group, Paper, Text} from '@mantine/core';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {ChecklistEntry} from '../types';
import {AnswerBadge} from './ui/Badges';
import {LoadFailed, Loading} from './ui/LoadState';
import {Section} from './ui/Section';

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

/** An inspection's standard checklist (story 15), each item with its answer. */
export function Checklist({inspectionId}: {inspectionId: number}) {
  const checklist = useApi<ChecklistEntry[]>(
    `/api/inspections/${inspectionId}/checklist`,
  );
  return (
    <Section title="Checklist">
      {checklist.status === 'loading' && <Loading />}
      {checklist.status === 'error' && (
        <LoadFailed message={checklist.error.message} />
      )}
      {checklist.status === 'done' &&
        checklist.data.map((entry) => (
          <ChecklistResult key={entry.id} entry={entry} />
        ))}
    </Section>
  );
}
