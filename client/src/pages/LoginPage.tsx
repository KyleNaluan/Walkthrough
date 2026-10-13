import {
  Alert,
  Box,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {useForm} from '@mantine/form';
import {IconAlertCircle, IconShieldLock} from '@tabler/icons-react';
import {useState} from 'react';
import {Navigate, useLocation, useNavigate} from 'react-router';
import {ApiError} from '../api';
import {landingPathFor, useAuth} from '../auth/useAuth';
import {Emblem} from '../components/ui/Emblem';

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
    // The last error no longer applies once the user edits a field.
    onValuesChange: () => setError(null),
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
    <Box component="main" mih="100vh">
      <Box bg="navy.9" pt={48} pb={96} px="md">
        <Stack gap="xs" align="center">
          <Emblem size="lg" />
          <Text c="navy.1" ta="center">
            Food and beverage inspection records
          </Text>
        </Stack>
      </Box>
      <Container size={420} px="md" mt={-64}>
        <Paper p={0} shadow="md">
          <Group
            gap={8}
            px="lg"
            py={10}
            bg="navy.0"
            style={{borderBottom: '1px solid var(--mantine-color-navy-1)'}}
          >
            <IconShieldLock size={16} color="var(--mantine-color-navy-8)" />
            <Text fz="xs" fw={700} tt="uppercase" lts={0.8} c="navy.9">
              Authorized access
            </Text>
          </Group>
          <Box p="lg">
            <Title order={1} size="h2" mb="md">
              Log in
            </Title>
            <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
              <Stack>
                <TextInput
                  label="Email"
                  type="email"
                  autoComplete="username"
                  withAsterisk
                  autoFocus
                  {...form.getInputProps('email')}
                />
                <PasswordInput
                  label="Password"
                  autoComplete="current-password"
                  withAsterisk
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
                <Button type="submit" loading={busy} fullWidth>
                  Log in
                </Button>
              </Stack>
            </form>
          </Box>
        </Paper>
        <Text c="dimmed" fz="xs" ta="center" mt="md" mb="xl">
          For inspectors and store owners. Accounts are issued by your
          inspection agency.
        </Text>
      </Container>
    </Box>
  );
}
