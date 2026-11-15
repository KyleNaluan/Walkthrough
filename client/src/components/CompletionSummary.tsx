import {Group, Paper, SimpleGrid, Text} from '@mantine/core';
import {CHECKLIST_ANSWER, recordNumber} from '../status';
import type {ChecklistSummary, Ticket} from '../types';
import {SeverityBadge} from './ui/Badges';
import {Section} from './ui/Section';

const COUNTS = [
  {answer: 'pass', label: 'Passed'},
  {answer: 'fail', label: 'Failed'},
  {answer: 'na', label: 'N/A'},
] as const;

/**
 * A completed inspection's passed, failed and N/A items and its findings
 * (AC 16.1).
 */
export function CompletionSummary({
  summary,
  tickets,
}: {
  summary: ChecklistSummary;
  tickets: Ticket[];
}) {
  return (
    <Section title="Summary">
      <SimpleGrid cols={3} spacing="sm">
        {COUNTS.map(({answer, label}) => (
          <Paper key={answer} withBorder p="sm" ta="center">
            <Text fz={28} fw={700} lh={1.1} c={CHECKLIST_ANSWER[answer].color}>
              {summary[answer]}
            </Text>
            <Text fz="sm">{label}</Text>
          </Paper>
        ))}
      </SimpleGrid>
      {tickets.length === 0 && <Text c="dimmed">No findings</Text>}
      {tickets.map((ticket) => (
        <Group key={ticket.id} gap="xs">
          <Text ff="monospace" fz="xs" c="dimmed">
            {recordNumber('T', ticket.id)}
          </Text>
          <SeverityBadge severity={ticket.severity} />
          <Text fz="sm">{ticket.description}</Text>
        </Group>
      ))}
    </Section>
  );
}
