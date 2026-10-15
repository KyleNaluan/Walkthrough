import {
  Alert,
  Button,
  FileInput,
  Group,
  Radio,
  Stack,
  Textarea,
} from '@mantine/core';
import {DateInput} from '@mantine/dates';
import {useForm} from '@mantine/form';
import {IconAlertCircle} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiUpload} from '../api';
import {resizeImage} from '../lib/resizeImage';
import {today} from '../lib/today';
import {SEVERITY} from '../status';
import type {Severity, Ticket} from '../types';

// The server's limit; Vercel refuses a body over about 4.5 MB on its own.
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

// Refuses a day that doesn't exist, e.g. 2099-02-31, instead of moving it.
function parseDeadline(value: string) {
  const date = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value)
    ? value
    : null;
}

interface FindingValues {
  description: string;
  severity: Severity | '';
  deadline: string | null;
  photo: File | null;
}

/**
 * Records a finding on an inspection; the server opens a ticket for it
 * (story 6). A missing field is marked and nothing is sent.
 */
export function FindingForm({
  inspectionId,
  onSaved,
}: {
  inspectionId: number;
  onSaved: (ticket: Ticket) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<FindingValues>({
    initialValues: {description: '', severity: '', deadline: null, photo: null},
    validate: {
      description: (value) =>
        value.trim() === '' ? 'Description is required' : null,
      severity: (value) => (value ? null : 'Severity is required'),
      deadline: (value) => {
        if (!value) return 'Deadline is required';
        return value < today() ? 'Deadline cannot be in the past' : null;
      },
      photo: (value) => (value ? null : 'A photo is required'),
    },
    onValuesChange: () => setError(null),
  });

  async function handleSubmit(values: FindingValues) {
    setBusy(true);
    setError(null);
    const photo = await resizeImage(values.photo!);
    if (photo.size > MAX_PHOTO_BYTES) {
      form.setFieldError('photo', 'Photo is too large');
      setBusy(false);
      return;
    }
    const body = new FormData();
    body.append('description', values.description);
    body.append('severity', values.severity);
    body.append('deadline', values.deadline!);
    body.append('photo', photo);
    try {
      onSaved(
        await apiUpload<Ticket>(
          `/api/inspections/${inspectionId}/tickets`,
          body,
        ),
      );
      form.reset();
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        form.setErrors(err.fields);
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Could not save the finding',
        );
      }
    }
    setBusy(false);
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
      <Stack>
        <Textarea
          label="Description"
          withAsterisk
          rows={3}
          disabled={busy}
          {...form.getInputProps('description')}
        />
        <Radio.Group
          label="Severity"
          withAsterisk
          disabled={busy}
          {...form.getInputProps('severity')}
        >
          <Group mt={4}>
            {Object.entries(SEVERITY).map(([value, {label}]) => (
              <Radio key={value} value={value} label={label} />
            ))}
          </Group>
        </Radio.Group>
        <DateInput
          label="Deadline"
          valueFormat="YYYY-MM-DD"
          placeholder="YYYY-MM-DD"
          dateParser={parseDeadline}
          withAsterisk
          disabled={busy}
          {...form.getInputProps('deadline')}
        />
        <FileInput
          label="Photo"
          placeholder="Choose a JPEG or PNG"
          accept="image/jpeg,image/png"
          withAsterisk
          disabled={busy}
          {...form.getInputProps('photo')}
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
          Save finding
        </Button>
      </Stack>
    </form>
  );
}
