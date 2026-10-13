import {AppShell, Box, Button, Group, Stack, Text} from '@mantine/core';
import {
  IconBuildingStore,
  IconLogout,
  IconTicket,
  type Icon,
} from '@tabler/icons-react';
import {NavLink, Outlet, useMatch} from 'react-router';
import {useAuth} from '../auth/useAuth';
import {Emblem} from './ui/Emblem';

const ROLE_LABEL = {inspector: 'Inspector', store_owner: 'Store owner'};

function NavTab({
  to,
  label,
  icon: TabIcon,
}: {
  to: string;
  label: string;
  icon: Icon;
}) {
  const active = useMatch({path: to, end: false}) !== null;
  return (
    <Button
      component={NavLink}
      to={to}
      variant="subtle"
      color={active ? 'navy' : 'gray'}
      radius={0}
      h={48}
      leftSection={<TabIcon size={18} />}
      style={{
        boxShadow: active
          ? 'inset 0 -3px var(--mantine-color-navy-8)'
          : undefined,
      }}
    >
      {label}
    </Button>
  );
}

/** The shell around every logged-in page: header, nav and Log out. */
export function Layout() {
  const {user, logout} = useAuth();
  return (
    <AppShell header={{height: 104}} padding="md">
      <AppShell.Header withBorder={false}>
        <Group h={56} px="md" bg="navy.9" wrap="nowrap" gap="sm">
          <Emblem compact />
          <Box flex={1} />
          {user && (
            <Stack gap={0} align="flex-end" miw={0}>
              <Text c="white" fz="sm" fw={600} truncate="end" maw="100%">
                {user.firstName} {user.lastName}
              </Text>
              <Text c="navy.2" fz="xs" tt="uppercase" lts={0.5}>
                {ROLE_LABEL[user.role]}
              </Text>
            </Stack>
          )}
          <Button
            variant="white"
            color="navy"
            size="xs"
            h={32}
            style={{flexShrink: 0}}
            leftSection={<IconLogout size={16} />}
            onClick={logout}
          >
            Log out
          </Button>
        </Group>
        <Group
          component="nav"
          h={48}
          px="xs"
          gap={0}
          bg="white"
          style={{borderBottom: '1px solid var(--mantine-color-gray-3)'}}
        >
          <NavTab to="/stores" label="Stores" icon={IconBuildingStore} />
          <NavTab to="/tickets" label="Tickets" icon={IconTicket} />
        </Group>
      </AppShell.Header>
      <AppShell.Main maw={760} mx="auto">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
