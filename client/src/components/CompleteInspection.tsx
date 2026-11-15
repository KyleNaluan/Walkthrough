import {Alert, Button, Modal, SimpleGrid, Text} from '@mantine/core';
import {IconAlertCircle, IconCircleCheck} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiGet, apiPost} from '../api';
import type {InspectionDetail} from '../types';
import {Section} from './ui/Section';

const FINDING_FIRST = 'Choose a finding for each failed item first';

/**
 * Completes an inspection once the inspector confirms (story 16). The server
 * refuses it while an item is unanswered, and its message is shown (AC 16.2).
 * A Fail still waiting for its finding (`unsavedFail`) is not saved, so it
 * stops the inspection being completed.
 */
export function CompleteInspection({
  inspectionId,
  unsavedFail,
  onCompleted,
}: {
  inspectionId: number;
  unsavedFail: boolean;
  onCompleted: (inspection: InspectionDetail) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Asked to complete while a Fail waited; cleared once none waits.
  const [findingFirst, setFindingFirst] = useState(false);
  const message = findingFirst && unsavedFail ? FINDING_FIRST : error;

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
      // The server may have completed it and failed afterwards.
      const latest = await apiGet<InspectionDetail>(
        `/api/inspections/${inspectionId}`,
      ).catch(() => null);
      if (latest?.completedAt) onCompleted(latest);
      else
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
        onClick={() => {
          setFindingFirst(unsavedFail);
          setConfirming(!unsavedFail);
        }}
      >
        Complete inspection
      </Button>
      {message && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
          {message}
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
