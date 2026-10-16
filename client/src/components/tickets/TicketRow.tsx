import {Group, Stack, Text, UnstyledButton} from '@mantine/core';
import {IconChevronRight} from '@tabler/icons-react';
import {Link} from 'react-router';
import {formatDate} from '../../lib/format';
import {recordNumber} from '../../status';
import type {TicketSummary} from '../../types';
import {OverdueBadge, SeverityBadge, StatusBadge} from '../ui/Badges';

/**
 * One ticket in a list, linking to its page: record number, store,
 * description, badges and deadline.
 */
export function TicketRow({ticket}: {ticket: TicketSummary}) {
  return (
    <UnstyledButton
      component={Link}
      to={`/tickets/${ticket.id}`}
      display="block"
      px="md"
      py="sm"
      style={{borderTop: '1px solid var(--mantine-color-gray-2)'}}
    >
      <Group wrap="nowrap" gap="sm" align="center">
        <Stack gap={6} flex={1} miw={0}>
          <Text ff="monospace" fz="xs" c="dimmed" tt="uppercase">
            {recordNumber('T', ticket.id)} · {ticket.store.name}
          </Text>
          <Text fw={600} lh={1.3}>
            {ticket.description}
          </Text>
          <Group gap={6} wrap="wrap">
            <StatusBadge status={ticket.status} />
            <SeverityBadge severity={ticket.severity} />
            {ticket.overdue && <OverdueBadge />}
          </Group>
          <Text fz="sm" c={ticket.overdue ? 'red.8' : 'dimmed'}>
            Due{' '}
            <Text span ff="monospace" fz="sm" fw={ticket.overdue ? 600 : 400}>
              {formatDate(ticket.deadline)}
            </Text>
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
