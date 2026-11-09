import {Alert, Button, PasswordInput, Stack, TextInput} from '@mantine/core';
import {useForm} from '@mantine/form';
import {IconAlertCircle, IconCircleCheck} from '@tabler/icons-react';
import {useState} from 'react';
import {ApiError, apiPost} from '../api';
import {useAuth} from '../auth/useAuth';
import {LoadFailed} from '../components/ui/LoadState';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';
import type {User} from '../types';

const MIN_PASSWORD = 8;

interface OwnerValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const required = (label: string) => (value: string) =>
  value.trim() === '' ? `${label} is required` : null;

/**
 * An inspector creates a store owner account with a temporary password
 * (story 22). The rules match the server's, so most mistakes are marked
 * before anything is sent; the server checks everything again.
 */
export function NewOwnerPage() {
  const {user} = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [createdOwner, setCreatedOwner] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<OwnerValues>({
    initialValues: {firstName: '', lastName: '', email: '', password: ''},
    validate: {
      firstName: required('First name'),
      lastName: required('Last name'),
      email: (value) => {
        if (value.trim() === '') return 'Email is required';
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
          ? null
          : 'Enter a valid email';
      },
      password: (value) =>
        value.length < MIN_PASSWORD
          ? `Password must be at least ${MIN_PASSWORD} characters`
          : null,
    },
    onValuesChange: () => setError(null),
  });

  // The server refuses store owners too (AC 22.5); this just says so.
  if (user?.role !== 'inspector') return <LoadFailed message="Access denied" />;

  async function handleSubmit(values: OwnerValues) {
    setBusy(true);
    setError(null);
    setCreatedOwner(null);
    try {
      const owner = await apiPost<User>('/api/users/store-owners', {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      setCreatedOwner(owner);
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
      <PageHeader eyebrow="Store owners" title="Add owner" />
      {createdOwner && (
        <Alert
          color="green"
          variant="light"
          mb="md"
          icon={<IconCircleCheck size={18} />}
          title={`Account created for ${createdOwner.firstName} ${createdOwner.lastName}`}
        >
          They can log in with {createdOwner.email} and the temporary password.
        </Alert>
      )}
      <Section title="New store owner account">
        <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
          <Stack>
            <TextInput
              label="First name"
              withAsterisk
              autoComplete="off"
              {...form.getInputProps('firstName')}
            />
            <TextInput
              label="Last name"
              withAsterisk
              autoComplete="off"
              {...form.getInputProps('lastName')}
            />
            <TextInput
              label="Email"
              type="email"
              withAsterisk
              autoComplete="off"
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Temporary password"
              description={`At least ${MIN_PASSWORD} characters. Give it to the owner privately.`}
              withAsterisk
              autoComplete="new-password"
              {...form.getInputProps('password')}
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
              Create account
            </Button>
          </Stack>
        </form>
      </Section>
    </>
  );
}
