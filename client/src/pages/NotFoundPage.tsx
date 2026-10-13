import {Anchor, Container, Paper, Stack, Text, Title} from '@mantine/core';
import {Link} from 'react-router';

export function NotFoundPage() {
  return (
    <Container component="main" size="xs" py="xl">
      <Paper p="lg">
        <Stack>
          <Text ff="monospace" fz="xs" tt="uppercase" c="dimmed">
            Error 404
          </Text>
          <Title order={1} size="h2">
            Page not found
          </Title>
          <Anchor component={Link} to="/">
            Go to the start page
          </Anchor>
        </Stack>
      </Paper>
    </Container>
  );
}
