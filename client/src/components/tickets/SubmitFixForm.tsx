import {Alert, Button, FileInput, Stack, Textarea} from '@mantine/core';
import {useForm} from '@mantine/form';
import {IconAlertCircle, IconPhoto} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiUpload} from '../../api';
import {resizeImage} from '../../lib/resizeImage';
import type {TicketDetail} from '../../types';

const PHOTO_TYPES = ['image/jpeg', 'image/png'];

/**
 * The store owner's fix: a description and a JPEG or PNG photo (story 9).
 * Blank or wrong fields are marked and nothing is sent (AC 9.4); the server
 * checks everything again.
 */
export function SubmitFixForm({
  ticketId,
  onSubmitted,
}: {
  ticketId: number;
  onSubmitted: (ticket: TicketDetail) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<{description: string; photo: File | null}>({
    initialValues: {description: '', photo: null},
    validate: {
      description: (value) =>
        value.trim() === '' ? 'Description is required' : null,
      photo: (value) => {
        if (!value) return 'A photo is required';
        return PHOTO_TYPES.includes(value.type)
          ? null
          : 'Photo must be a JPEG or PNG image';
      },
    },
    onValuesChange: () => setError(null),
  });

  async function handleSubmit({description, photo}: typeof form.values) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('description', description.trim());
      body.append('photo', await resizeImage(photo!));
      onSubmitted(
        await apiUpload<TicketDetail>(`/api/tickets/${ticketId}/fixes`, body),
      );
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        form.setErrors(err.fields);
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not submit');
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
      <Stack>
        <Textarea
          label="What did you fix?"
          description="Describe how the issue was corrected."
          withAsterisk
          autosize
          minRows={3}
          {...form.getInputProps('description')}
        />
        <FileInput
          label="Photo of the fix"
          description="JPEG or PNG"
          placeholder="Choose a photo"
          accept={PHOTO_TYPES.join(',')}
          leftSection={<IconPhoto size={18} />}
          clearable
          withAsterisk
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
          Submit fix
        </Button>
      </Stack>
    </form>
  );
}
