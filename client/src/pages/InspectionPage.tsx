import {Anchor, Group, Text} from '@mantine/core';
import {IconArrowLeft} from '@tabler/icons-react';
import {Link, useParams} from 'react-router';
import {Field} from '../components/ui/Field';
import {LoadFailed, Loading} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';
import {useApi} from '../lib/useApi';
import {recordNumber} from '../status';
import type {InspectionDetail} from '../types';

// Chicago, like the server's TIME_ZONE, e.g. "Oct 14, 2026, 9:05 AM".
const startedFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Chicago',
});

/**
 * One inspection: its store, inspector and start time (story 5). Stories 6
 * and 7 add the findings.
 */
export function InspectionPage() {
  const {inspectionId} = useParams();
  const inspection = useApi<InspectionDetail>(
    `/api/inspections/${inspectionId}`,
  );

  return (
    <>
      {inspection.status === 'loading' && <Loading />}
      {inspection.status === 'error' && (
        <>
          <PageHeader title="Inspection" />
          <LoadFailed message={inspection.error.message} />
        </>
      )}
      {inspection.status === 'done' && (
        <>
          <Anchor
            component={Link}
            to={`/stores/${inspection.data.storeId}`}
            fz="sm"
            mb="sm"
            display="block"
          >
            <Group gap={4} component="span">
              <IconArrowLeft size={16} />
              Back to store
            </Group>
          </Anchor>
          <PageHeader
            eyebrow={recordNumber('INS', inspection.data.id)}
            title={inspection.data.store.name}
          />
          <Section title="Inspection details">
            <Field label="Store" value={inspection.data.store.name} />
            <Field label="Address" value={inspection.data.store.address} />
            <Field
              label="Inspector"
              value={`${inspection.data.inspector.firstName} ${inspection.data.inspector.lastName}`}
            />
            <Field
              label="Started"
              value={startedFormat.format(new Date(inspection.data.startedAt))}
            />
          </Section>
          <Section title="Findings">
            <Text c="dimmed">No findings recorded yet.</Text>
          </Section>
        </>
      )}
    </>
  );
}
