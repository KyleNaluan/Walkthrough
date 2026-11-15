import {Anchor, Group, SimpleGrid, Stack, Text} from '@mantine/core';
import {Link} from 'react-router';
import {formatDate} from '../lib/format';
import {useApi} from '../lib/useApi';
import type {StoreSummary} from '../types';
import {InspectionStateBadge} from './ui/Badges';
import {LoadFailed, Loading} from './ui/LoadState';
import {Section} from './ui/Section';

/** One figure on the card: a small label above a large value. */
function Figure({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <Stack gap={2}>
      <Text fz="xs" tt="uppercase" c="dimmed" fw={600} lts={0.5}>
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/**
 * A store's standing at a glance: open tickets, overdue tickets and the
 * last inspection (story 20). It loads on its own, so the rest of the store
 * page still shows if it fails, e.g. "Access denied" (AC 20.3).
 */
export function StoreSummaryCard({storeId}: {storeId: number}) {
  const summary = useApi<StoreSummary>(`/api/stores/${storeId}/summary`);
  return (
    <Section title="Standing">
      {summary.status === 'loading' && <Loading />}
      {summary.status === 'error' && (
        <LoadFailed message={summary.error.message} />
      )}
      {summary.status === 'done' && (
        // One column on a phone, three side by side above it (story 21).
        <SimpleGrid cols={{base: 1, xs: 3}} spacing="md">
          <Figure label="Open tickets">
            <Text fz={28} fw={700} lh={1.1} aria-label="Open tickets count">
              {summary.data.openTickets}
            </Text>
          </Figure>
          <Figure label="Overdue">
            <Text
              fz={28}
              fw={700}
              lh={1.1}
              c={summary.data.overdueTickets > 0 ? 'red.7' : undefined}
              aria-label="Overdue tickets count"
            >
              {summary.data.overdueTickets}
            </Text>
          </Figure>
          <Figure label="Last inspection">
            {summary.data.lastInspection ? (
              <Group gap="xs" wrap="wrap">
                <Anchor
                  component={Link}
                  to={`/inspections/${summary.data.lastInspection.id}`}
                  ff="monospace"
                  fw={600}
                  mih={42}
                  display="inline-flex"
                  style={{alignItems: 'center'}}
                >
                  {formatDate(
                    summary.data.lastInspection.completedAt ??
                      summary.data.lastInspection.startedAt,
                  )}
                </Anchor>
                <InspectionStateBadge
                  completedAt={summary.data.lastInspection.completedAt}
                />
              </Group>
            ) : (
              <Text fw={600} mih={42} style={{alignContent: 'center'}}>
                Not inspected yet
              </Text>
            )}
          </Figure>
        </SimpleGrid>
      )}
    </Section>
  );
}
