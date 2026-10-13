import {Group, Text, ThemeIcon} from '@mantine/core';
import {IconClipboardCheck} from '@tabler/icons-react';

/**
 * The app's mark: a clipboard check and the name, for dark backgrounds.
 * `compact` hides the name on phones, where the header has little room.
 */
export function Emblem({
  size = 'md',
  compact = false,
}: {
  size?: 'md' | 'lg';
  compact?: boolean;
}) {
  const large = size === 'lg';
  return (
    <Group gap={large ? 'sm' : 8} wrap="nowrap">
      <ThemeIcon
        size={large ? 44 : 32}
        color="navy"
        variant="white"
        radius="sm"
        aria-hidden
      >
        <IconClipboardCheck size={large ? 28 : 20} stroke={2} />
      </ThemeIcon>
      <Text
        visibleFrom={compact ? 'xs' : undefined}
        c="white"
        fw={800}
        tt="uppercase"
        lts={1.5}
        fz={large ? 22 : 'md'}
      >
        Walkthrough
      </Text>
    </Group>
  );
}
