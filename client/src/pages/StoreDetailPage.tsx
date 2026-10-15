import {Alert, Anchor, Button, Group} from '@mantine/core';
import {IconAlertCircle, IconArrowLeft} from '@tabler/icons-react';
import {useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router';
import {ApiError, apiPost} from '../api';
import {useAuth} from '../auth/useAuth';
import {Field} from '../components/ui/Field';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {Inspection, Store} from '../types';

/**
 * One store. The server checks access: inspectors open any store (story 2),
 * owners only their own (story 3). Inspectors can start an inspection here
 * (story 5).
 */
export function StoreDetailPage() {
  const {storeId} = useParams();
  const {user} = useAuth();
  const navigate = useNavigate();
  const store = useApi<Store>(`/api/stores/${storeId}`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startInspection(id: number) {
    setBusy(true);
    setError(null);
    try {
      const inspection = await apiPost<Inspection>(
        `/api/stores/${id}/inspections`,
        {},
      );
      navigate(`/inspections/${inspection.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not start the inspection',
      );
      setBusy(false);
    }
  }

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
            actions={
              // The server refuses owners too (AC 5.2).
              user?.role === 'inspector' && (
                <Button
                  loading={busy}
                  onClick={() => startInspection(store.data.id)}
                >
                  Start inspection
                </Button>
              )
            }
          />
          {error && (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertCircle size={18} />}
              mb="md"
            >
              {error}
            </Alert>
          )}
          <Section title="Store details">
            <Field label="Name" value={store.data.name} />
            <Field label="Address" value={store.data.address} />
          </Section>
        </>
      )}
    </>
  );
}
