import {Group, NativeSelect, Paper, Stack, Text} from '@mantine/core';
import {IconFilter} from '@tabler/icons-react';
import {useSearchParams} from 'react-router';
import {useAuth} from '../auth/useAuth';
import {TicketRow} from '../components/tickets/TicketRow';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {useApi} from '../lib/useApi';
import {TICKET_STATUS} from '../status';
import type {TicketStatus, TicketSummary} from '../types';

const ALL = 'all';

const STATUS_OPTIONS = [
  {value: ALL, label: 'All statuses'},
  ...Object.entries(TICKET_STATUS).map(([value, {label}]) => ({value, label})),
];

/** The ?status= value if it is a real status, otherwise null (all). */
function statusFrom(params: URLSearchParams): TicketStatus | null {
  const value = params.get('status');
  return value && value in TICKET_STATUS ? (value as TicketStatus) : null;
}

/**
 * The ticket list (story 8). The server sends an inspector every ticket and
 * an owner only their stores' (AC 8.1, 8.2), earliest deadline first
 * (AC 8.3). The status filter is kept in the URL, so Back returns to it.
 */
export function TicketsPage() {
  const {user} = useAuth();
  const [params, setParams] = useSearchParams();
  const status = statusFrom(params);
  const tickets = useApi<TicketSummary[]>(
    status ? `/api/tickets?status=${status}` : '/api/tickets',
  );
  const inspector = user?.role === 'inspector';

  function changeStatus(value: string) {
    setParams(value !== ALL ? {status: value} : {}, {replace: true});
  }

  return (
    <>
      <PageHeader
        eyebrow={inspector ? 'All stores' : 'Your stores'}
        title="Tickets"
      />
      {/* A native select opens the phone's own picker. */}
      <NativeSelect
        label="Status"
        data={STATUS_OPTIONS}
        value={status ?? ALL}
        onChange={(event) => changeStatus(event.currentTarget.value)}
        leftSection={<IconFilter size={16} />}
        maw={320}
        mb="md"
      />
      {tickets.status === 'loading' && <Loading />}
      {tickets.status === 'error' && (
        <LoadFailed message={tickets.error.message} />
      )}
      {tickets.status === 'done' &&
        (tickets.data.length === 0 ? (
          <Paper p="lg">
            <Text ta="center" fw={600}>
              No tickets
            </Text>
            <Text ta="center" c="dimmed" fz="sm">
              {status
                ? `No tickets are ${TICKET_STATUS[status].label.toLowerCase()}.`
                : inspector
                  ? 'No findings have been recorded yet.'
                  : 'Your stores have no tickets.'}
            </Text>
          </Paper>
        ) : (
          <Paper p={0} style={{overflow: 'hidden'}}>
            <Group
              justify="space-between"
              px="md"
              py={8}
              bg="navy.0"
              wrap="wrap"
              gap={4}
            >
              <Text fz="xs" fw={700} tt="uppercase" lts={0.8} c="navy.9">
                {tickets.data.length === 1
                  ? '1 ticket'
                  : `${tickets.data.length} tickets`}
              </Text>
              <Text fz="xs" c="navy.8">
                Earliest deadline first
              </Text>
            </Group>
            <Stack gap={0} component="ul" m={0} p={0} aria-label="Tickets">
              {tickets.data.map((ticket) => (
                <Stack
                  component="li"
                  key={ticket.id}
                  style={{listStyle: 'none'}}
                >
                  <TicketRow ticket={ticket} />
                </Stack>
              ))}
            </Stack>
          </Paper>
        ))}
    </>
  );
}
