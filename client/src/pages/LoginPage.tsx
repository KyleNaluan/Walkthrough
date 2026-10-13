import {
  Alert,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import {useForm} from '@mantine/form';
import {useState} from 'react';
import {Navigate, useLocation, useNavigate} from 'react-router';
import {ApiError} from '../api';
import {landingPathFor, useAuth} from '../auth/useAuth';

const required = (label: string) => (value: string) =>
  value.trim() === '' ? `${label} is required` : null;

/** The login form. A blank field is marked and nothing is sent. */
export function LoginPage() {
  const {user, login} = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({
    initialValues: {email: '', password: ''},
    validate: {email: required('Email'), password: required('Password')},
  });

  if (user) return <Navigate to={landingPathFor(user.role)} replace />;

  async function handleSubmit({email, password}: typeof form.values) {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      const from = (location.state as {from?: string} | null)?.from;
      navigate(from ?? '/', {replace: true});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in');
      setBusy(false);
    }
  }

  return (
    <Container component="main" size={420} py="xl">
      <Title order={1} ta="center" mb="lg">
        Log in
      </Title>
      <Paper withBorder p="lg">
        <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
          <Stack>
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              withAsterisk
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              withAsterisk
              {...form.getInputProps('password')}
            />
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <Button type="submit" loading={busy} fullWidth>
              Log in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
