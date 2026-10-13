import {Anchor, Container, Stack, Title} from '@mantine/core';
import {Link} from 'react-router';

export function NotFoundPage() {
  return (
    <Container component="main" size="xs" py="xl">
      <Stack>
        <Title order={1}>Page not found</Title>
        <Anchor component={Link} to="/">
          Go to the start page
        </Anchor>
      </Stack>
    </Container>
  );
}
