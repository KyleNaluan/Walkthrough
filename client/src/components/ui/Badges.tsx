import {Badge} from '@mantine/core';
import {IconAlertTriangle, IconClockExclamation} from '@tabler/icons-react';
import {SEVERITY, TICKET_STATUS} from '../../status';
import type {Severity, TicketStatus} from '../../types';

export function StatusBadge({status}: {status: TicketStatus}) {
  const {label, color} = TICKET_STATUS[status];
  return (
    <Badge color={color} variant="light">
      {label}
    </Badge>
  );
}

export function SeverityBadge({severity}: {severity: Severity}) {
  const {label, color} = SEVERITY[severity];
  return (
    <Badge
      color={color}
      variant={severity === 'high' ? 'filled' : 'outline'}
      leftSection={<IconAlertTriangle size={12} />}
    >
      {label}
    </Badge>
  );
}

export function OverdueBadge() {
  return (
    <Badge
      color="red"
      variant="filled"
      leftSection={<IconClockExclamation size={12} />}
    >
      Overdue
    </Badge>
  );
}
