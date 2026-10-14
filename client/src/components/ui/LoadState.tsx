import {Alert, Center, Loader} from '@mantine/core';
import {IconAlertCircle} from '@tabler/icons-react';

/** Shown while a page's data loads. */
export function Loading() {
  return (
    <Center py="xl">
      <Loader aria-label="Loading" />
    </Center>
  );
}

/** Shown when a page's data could not be loaded, with the server's message. */
export function LoadFailed({message}: {message: string}) {
  return (
    <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
      {message}
    </Alert>
  );
}
