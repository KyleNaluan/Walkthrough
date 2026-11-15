import {
  Button,
  CloseButton,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBuildingStore,
  IconChevronRight,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import {Link, useSearchParams} from 'react-router';
import {useAuth} from '../auth/useAuth';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {searchStores} from '../lib/searchStores';
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

function countLabel(shown: number, total: number): string {
  const stores = total === 1 ? '1 store' : `${total} stores`;
  return shown === total ? stores : `${shown} of ${stores}`;
}

/**
 * The store list. Inspectors get every store (story 2); the server sends an
 * owner only their own (story 3), so an owner never sees the full list.
 * The search box filters that list by name or address (story 19). The text
 * is kept in the address (?q=), so Back from a store returns to the results.
 */
export function StoresPage() {
  const {user} = useAuth();
  const stores = useApi<Store[]>('/api/stores');
  const inspector = user?.role === 'inspector';
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';

  function setQuery(value: string) {
    // Replace, not push, so each keystroke is not its own Back step.
    setParams(value ? {q: value} : {}, {replace: true});
  }

  return (
    <>
      <PageHeader
        eyebrow={inspector ? 'All stores' : 'Your stores'}
        title="Stores"
        actions={
          // The server refuses owners too (AC 23.6).
          inspector && (
            <Button
              component={Link}
              to="/stores/new"
              leftSection={<IconPlus size={16} />}
            >
              Add store
            </Button>
          )
        }
      />
      {stores.status === 'loading' && <Loading />}
      {stores.status === 'error' && (
        <LoadFailed message={stores.error.message} />
      )}
      {stores.status === 'done' &&
        (stores.data.length === 0 ? (
          <Paper p="lg">
            <Text ta="center" fw={600}>
              {inspector ? 'No stores' : 'No stores yet'}
            </Text>
            <Text ta="center" c="dimmed" fz="sm">
              {inspector
                ? 'No stores have been added yet.'
                : 'No stores are linked to your account yet.'}
            </Text>
          </Paper>
        ) : (
          <StoreResults
            stores={stores.data}
            query={query}
            onQueryChange={setQuery}
          />
        ))}
    </>
  );
}

function StoreResults({
  stores,
  query,
  onQueryChange,
}: {
  stores: Store[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const shown = searchStores(stores, query);
  return (
    <>
      <TextInput
        // Not type="search": Chrome would add a second clear button.
        inputMode="search"
        enterKeyHint="search"
        label="Search stores"
        placeholder="Name or address"
        mb="md"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        leftSection={<IconSearch size={18} />}
        rightSectionWidth={42}
        rightSection={
          query && (
            <CloseButton
              size={42}
              aria-label="Clear search"
              onClick={() => onQueryChange('')}
            />
          )
        }
      />
      {shown.length === 0 ? (
        <Paper p="lg">
          <Text ta="center" fw={600}>
            No stores match
          </Text>
          <Text ta="center" c="dimmed" fz="sm" mb="md">
            No store name or address contains “{query.trim()}”.
          </Text>
          <Group justify="center">
            <Button variant="default" onClick={() => onQueryChange('')}>
              Clear search
            </Button>
          </Group>
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
            {countLabel(shown.length, stores.length)}
          </Text>
          <Stack gap={0}>
            {shown.map((store) => (
              <StoreRow key={store.id} store={store} />
            ))}
          </Stack>
        </Paper>
      )}
    </>
  );
}
