import {Anchor, Group, Text} from '@mantine/core';
import {IconArrowLeft} from '@tabler/icons-react';
import {Link, useParams} from 'react-router';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {Store} from '../types';

function Field({label, value}: {label: string; value: string}) {
  return (
    <div>
      <Text fz="xs" tt="uppercase" c="dimmed" fw={600} lts={0.5}>
        {label}
      </Text>
      <Text>{value}</Text>
    </div>
  );
}

/**
 * One store. The server checks access: inspectors open any store (story 2),
 * owners only their own (story 3). Story 5 adds Start inspection.
 */
export function StoreDetailPage() {
  const {storeId} = useParams();
  const store = useApi<Store>(`/api/stores/${storeId}`);

  return (
    <>
      <Anchor component={Link} to="/stores" fz="sm" mb="sm" display="block">
        <Group gap={4} component="span">
          <IconArrowLeft size={16} />
          Back to stores
        </Group>
      </Anchor>
      {store.status === 'loading' && <Loading />}
      {store.status === 'error' && (
        <>
          <PageHeader title="Store" />
          <LoadFailed message={store.error.message} />
        </>
      )}
      {store.status === 'done' && (
        <>
          <PageHeader
            eyebrow={recordNumber('S', store.data.id)}
            title={store.data.name}
          />
          <Section title="Store details">
            <Field label="Name" value={store.data.name} />
            <Field label="Address" value={store.data.address} />
          </Section>
        </>
      )}
    </>
  );
}
