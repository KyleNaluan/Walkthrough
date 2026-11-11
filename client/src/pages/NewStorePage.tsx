import {
  Alert,
  Anchor,
  Button,
  NativeSelect,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {useForm} from '@mantine/form';
import {IconAlertCircle, IconCircleCheck} from '@tabler/icons-react';
import {useState} from 'react';
import {Link} from 'react-router';
import {ApiError, apiPost} from '../api';
import {useAuth} from '../auth/useAuth';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';
import {useApi} from '../lib/useApi';
import type {Store, User} from '../types';

interface StoreValues {
  name: string;
  address: string;
  ownerId: string;
}

const required = (label: string) => (value: string) =>
  value.trim() === '' ? `${label} is required` : null;

function NewStoreForm({owners}: {owners: User[]}) {
  const [error, setError] = useState<string | null>(null);
  const [createdStore, setCreatedStore] = useState<Store | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<StoreValues>({
    initialValues: {name: '', address: '', ownerId: ''},
    validate: {
      name: required('Name'),
      address: required('Address'),
      ownerId: required('Owner'),
    },
    onValuesChange: () => setError(null),
  });

  async function handleSubmit(values: StoreValues) {
    setBusy(true);
    setError(null);
    setCreatedStore(null);
    try {
      const store = await apiPost<Store>('/api/stores', {
        name: values.name.trim(),
        address: values.address.trim(),
        ownerId: values.ownerId,
      });
      setCreatedStore(store);
      form.reset();
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        form.setErrors(err.fields);
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not save');
      }
    }
    setBusy(false);
  }

  return (
    <>
      {createdStore && (
        <Alert
          color="green"
          variant="light"
          mb="md"
          icon={<IconCircleCheck size={18} />}
          title={`Store added: ${createdStore.name}`}
        >
          <Anchor component={Link} to={`/stores/${createdStore.id}`} fz="sm">
            Open store
          </Anchor>
        </Alert>
      )}
      <Section title="New store">
        <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
          <Stack>
            <TextInput
              label="Name"
              withAsterisk
              autoComplete="off"
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Address"
              withAsterisk
              autoComplete="off"
              {...form.getInputProps('address')}
            />
            <NativeSelect
              label="Owner"
              size="md"
              withAsterisk
              data={[
                {value: '', label: 'Choose an owner'},
                ...owners.map((owner) => ({
                  value: owner.id,
                  label: `${owner.firstName} ${owner.lastName} (${owner.email})`,
                })),
              ]}
              {...form.getInputProps('ownerId')}
            />
            {error && (
              <Alert
                color="red"
                variant="light"
                icon={<IconAlertCircle size={18} />}
              >
                {error}
              </Alert>
            )}
            <Button type="submit" loading={busy}>
              Add store
            </Button>
          </Stack>
        </form>
      </Section>
    </>
  );
}

function OwnerChoice() {
  const owners = useApi<User[]>('/api/users/store-owners');

  if (owners.status === 'loading') return <Loading />;
  if (owners.status === 'error') {
    return <LoadFailed message={owners.error.message} />;
  }
  if (owners.data.length === 0) {
    return (
      <Paper p="lg">
        <Text ta="center" fw={600}>
          No store owner accounts yet
        </Text>
        <Text ta="center" c="dimmed" fz="sm">
          <Anchor component={Link} to="/owners/new">
            Add an owner
          </Anchor>{' '}
          before adding a store.
        </Text>
      </Paper>
    );
  }
  return <NewStoreForm owners={owners.data} />;
}

/**
 * An inspector adds a store and chooses its owner (story 23). The rules
 * match the server's, so an empty field is marked before anything is sent;
 * the server checks everything again.
 */
export function NewStorePage() {
  const {user} = useAuth();

  // The server refuses store owners too (AC 23.6); this just says so.
  if (user?.role !== 'inspector') return <LoadFailed message="Access denied" />;

  return (
    <>
      <PageHeader eyebrow="Stores" title="Add store" />
      <OwnerChoice />
    </>
  );
}
