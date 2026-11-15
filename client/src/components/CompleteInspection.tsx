import {Alert, Button, Modal, SimpleGrid, Text} from '@mantine/core';
import {IconAlertCircle, IconCircleCheck} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiPost} from '../api';
import type {InspectionDetail} from '../types';
import {Section} from './ui/Section';

/**
 * Completes an inspection once the inspector confirms (story 16). The server
 * refuses it while an item is unanswered, and its message is shown (AC 16.2).
 */
export function CompleteInspection({
  inspectionId,
  onCompleted,
}: {
  inspectionId: number;
  onCompleted: (inspection: InspectionDetail) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      onCompleted(
        await apiPost<InspectionDetail>(
          `/api/inspections/${inspectionId}/complete`,
          {},
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete');
    }
    setBusy(false);
  }

  return (
    <Section title="Complete inspection">
      <Text fz="sm" c="dimmed">
        Once completed, answers and findings can't be changed.
      </Text>
      <Button
        fullWidth
        leftSection={<IconCircleCheck size={18} />}
        loading={busy}
        onClick={() => setConfirming(true)}
      >
        Complete inspection
      </Button>
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
          {error}
        </Alert>
      )}
      <Modal
        opened={confirming}
        onClose={() => setConfirming(false)}
        title="Complete this inspection?"
        closeButtonProps={{'aria-label': 'Close'}}
        // A white header like the body, not the theme's grey page colour.
        styles={{
          header: {background: 'var(--mantine-color-white)'},
          title: {fontWeight: 700},
        }}
        centered
      >
        <Text mb="md">
          Its answers and findings can't be changed after it is completed.
        </Text>
        <SimpleGrid cols={2} spacing="sm">
          <Button variant="default" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button onClick={() => void complete()}>Complete</Button>
        </SimpleGrid>
      </Modal>
    </Section>
  );
}
