import {Anchor, Group} from '@mantine/core';
import {IconArrowLeft} from '@tabler/icons-react';
import {Link, useParams} from 'react-router';
import {Field} from '../components/ui/Field';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {Store} from '../types';

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
