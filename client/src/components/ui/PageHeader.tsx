import {Group, Stack, Text, Title} from '@mantine/core';
import type {ReactNode} from 'react';

/**
 * The top of a page: a small uppercase line above the title (a record
 * number, a store name), the title, and any actions on the right.
 */
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap" mb="lg">
      <Stack gap={2} miw={0}>
        {eyebrow && (
          <Text ff="monospace" fz="xs" tt="uppercase" c="dimmed" fw={500}>
            {eyebrow}
          </Text>
        )}
        <Title order={1} size="h2">
          {title}
        </Title>
      </Stack>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}
