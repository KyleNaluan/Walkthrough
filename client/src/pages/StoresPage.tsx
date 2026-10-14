import {Group, Paper, Stack, Text, UnstyledButton} from '@mantine/core';
import {IconBuildingStore, IconChevronRight} from '@tabler/icons-react';
import {Link} from 'react-router';
import {useAuth} from '../auth/useAuth';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {Store} from '../types';

function StoreRow({store}: {store: Store}) {
  return (
    <UnstyledButton
      component={Link}
      to={`/stores/${store.id}`}
      px="md"
      py="sm"
      style={{borderTop: '1px solid var(--mantine-color-gray-2)'}}
    >
      <Group wrap="nowrap" gap="sm">
        <IconBuildingStore
          size={22}
          color="var(--mantine-color-navy-8)"
          style={{flexShrink: 0}}
        />
        <Stack gap={0} flex={1} miw={0}>
          <Text fw={600}>{store.name}</Text>
          <Text fz="sm" c="dimmed">
            {store.address}
          </Text>
        </Stack>
        <Text ff="monospace" fz="xs" c="dimmed" visibleFrom="xs">
          {recordNumber('S', store.id)}
        </Text>
        <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
      </Group>
    </UnstyledButton>
  );
}

/**
 * The store list. Inspectors get every store (story 2); the server sends an
 * owner only their own (story 3), so an owner never sees the full list.
 */
export function StoresPage() {
  const {user} = useAuth();
  const stores = useApi<Store[]>('/api/stores');
  const inspector = user?.role === 'inspector';

  return (
    <>
      <PageHeader
        eyebrow={inspector ? 'All stores' : 'Your stores'}
        title="Stores"
      />
      {stores.status === 'loading' && <Loading />}
      {stores.status === 'error' && (
        <LoadFailed message={stores.error.message} />
      )}
      {stores.status === 'done' &&
        (stores.data.length === 0 ? (
          <Paper p="lg">
            <Text ta="center" fw={600}>
              No stores
            </Text>
            <Text ta="center" c="dimmed" fz="sm">
              {inspector
                ? 'No stores have been added yet.'
                : 'No stores are linked to your account yet.'}
            </Text>
          </Paper>
        ) : (
          <Paper p={0} style={{overflow: 'hidden'}}>
            <Text
              fz="xs"
              fw={700}
              tt="uppercase"
              lts={0.8}
              c="navy.9"
              px="md"
              py={8}
              bg="navy.0"
            >
              {stores.data.length === 1
                ? '1 store'
                : `${stores.data.length} stores`}
            </Text>
            <Stack gap={0}>
              {stores.data.map((store) => (
                <StoreRow key={store.id} store={store} />
              ))}
            </Stack>
          </Paper>
        ))}
    </>
  );
}
