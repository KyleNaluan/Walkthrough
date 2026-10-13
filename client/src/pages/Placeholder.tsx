import {Stack, Text, Title} from '@mantine/core';
import type {ReactNode} from 'react';

/** A page heading and a note naming the story that builds the page. */
export function Placeholder({
  title,
  story,
  children,
}: {
  title: string;
  story: string;
  children?: ReactNode;
}) {
  return (
    <Stack>
      <Title order={1}>{title}</Title>
      {children}
      <Text c="dimmed">Placeholder. Built in {story}.</Text>
    </Stack>
  );
}
