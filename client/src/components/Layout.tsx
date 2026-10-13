import {AppShell, Button, Group, Text, Title} from '@mantine/core';
import {NavLink, Outlet, useMatch} from 'react-router';
import {useAuth} from '../auth/useAuth';

function NavButton({to, label}: {to: string; label: string}) {
  const active = useMatch({path: to, end: false}) !== null;
  return (
    <Button
      component={NavLink}
      to={to}
      variant={active ? 'light' : 'subtle'}
      color={active ? undefined : 'gray'}
    >
      {label}
    </Button>
  );
}

/** The shell around every logged-in page: header, nav and Log out. */
export function Layout() {
  const {user, logout} = useAuth();
  return (
    <AppShell header={{height: 108}} padding="md">
      <AppShell.Header px="md">
        <Group h={56} wrap="nowrap">
          <Title order={2} size="h4">
            Walkthrough
          </Title>
          {user && (
            <Text c="dimmed" truncate="end" ta="right" flex={1} miw={0}>
              {user.firstName} {user.lastName}
            </Text>
          )}
          <Button variant="default" onClick={logout}>
            Log out
          </Button>
        </Group>
        <Group component="nav" h={52} gap="xs">
          <NavButton to="/stores" label="Stores" />
          <NavButton to="/tickets" label="Tickets" />
        </Group>
      </AppShell.Header>
      <AppShell.Main maw={720} mx="auto">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
