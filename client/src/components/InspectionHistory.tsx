import {Box, Group, Paper, Stack, Text, UnstyledButton} from '@mantine/core';
import {IconChevronRight} from '@tabler/icons-react';
import {Link} from 'react-router';
import {formatDateTime} from '../lib/format';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {InspectionSummary} from '../types';
import {LoadFailed, Loading} from './ui/LoadState';

function findings(count: number): string {
  if (count === 0) return 'No findings';
  return count === 1 ? '1 finding' : `${count} findings`;
}

/** One past inspection, linking to its page with its findings (AC 14.2). */
function InspectionRow({inspection}: {inspection: InspectionSummary}) {
  return (
    <UnstyledButton
      component={Link}
      to={`/inspections/${inspection.id}`}
      display="block"
      px="md"
      py="sm"
    >
      <Group wrap="nowrap" gap="sm" align="center">
        <Stack gap={6} flex={1} miw={0}>
          <Text ff="monospace" fz="xs" c="dimmed" tt="uppercase">
            {recordNumber('INS', inspection.id)} ·{' '}
            {formatDateTime(inspection.startedAt)}
          </Text>
          <Text fw={600} lh={1.3}>
            {inspection.inspector.firstName} {inspection.inspector.lastName}
          </Text>
          <Text fz="sm" c="dimmed">
            {findings(inspection.findingCount)}
          </Text>
        </Stack>
        <IconChevronRight
          size={18}
          color="var(--mantine-color-gray-5)"
          style={{flexShrink: 0}}
        />
      </Group>
    </UnstyledButton>
  );
}

/**
 * A store's past inspections, newest first (story 14). The server sends them
 * only to inspectors and the store's owner (AC 14.3, 14.4).
 */
export function InspectionHistory({storeId}: {storeId: number}) {
  const inspections = useApi<InspectionSummary[]>(
    `/api/stores/${storeId}/inspections`,
  );

  return (
    <Paper p={0} mb="md" style={{overflow: 'hidden'}}>
      <Group
        justify="space-between"
        px="md"
        py={8}
        bg="navy.0"
        wrap="wrap"
        gap={4}
        style={{borderBottom: '1px solid var(--mantine-color-navy-1)'}}
      >
        <Text
          component="h2"
          fz="xs"
          fw={700}
          tt="uppercase"
          lts={0.8}
          c="navy.9"
          m={0}
        >
          Inspection history
        </Text>
        {inspections.status === 'done' && inspections.data.length > 0 && (
          <Text fz="xs" c="navy.8">
            Newest first
          </Text>
        )}
      </Group>
      {inspections.status === 'loading' && <Loading />}
      {inspections.status === 'error' && (
        <Box p="md">
          <LoadFailed message={inspections.error.message} />
        </Box>
      )}
      {inspections.status === 'done' &&
        (inspections.data.length === 0 ? (
          <Text c="dimmed" p="md">
            No inspections yet
          </Text>
        ) : (
          <Stack gap={0} component="ul" m={0} p={0} aria-label="Inspections">
            {inspections.data.map((inspection, index) => (
              <Stack
                component="li"
                key={inspection.id}
                style={{
                  listStyle: 'none',
                  borderTop:
                    index > 0 ? '1px solid var(--mantine-color-gray-2)' : 0,
                }}
              >
                <InspectionRow inspection={inspection} />
              </Stack>
            ))}
          </Stack>
        ))}
    </Paper>
  );
}
