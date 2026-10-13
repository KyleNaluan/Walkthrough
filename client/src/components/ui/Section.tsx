import {Paper, Stack, Text} from '@mantine/core';
import type {ReactNode} from 'react';

/** A labelled block of a page or form, like a section of a paper form. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Paper p={0} mb="md">
      <Text
        component="h2"
        fz="xs"
        fw={700}
        tt="uppercase"
        lts={0.8}
        c="navy.9"
        px="md"
        py={8}
        m={0}
        bg="navy.0"
        style={{borderBottom: '1px solid var(--mantine-color-navy-1)'}}
      >
        {title}
      </Text>
      <Stack p="md" gap="sm">
        {children}
      </Stack>
    </Paper>
  );
}
