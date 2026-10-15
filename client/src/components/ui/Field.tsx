import {Text} from '@mantine/core';

/** A small uppercase label above its value, like a box on a paper form. */
export function Field({label, value}: {label: string; value: string}) {
  return (
    <div>
      <Text fz="xs" tt="uppercase" c="dimmed" fw={600} lts={0.5}>
        {label}
      </Text>
      <Text>{value}</Text>
    </div>
  );
}
