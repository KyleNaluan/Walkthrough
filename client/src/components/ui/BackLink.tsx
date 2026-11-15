import {Anchor, Group} from '@mantine/core';
import {IconArrowLeft} from '@tabler/icons-react';
import {Link} from 'react-router';

/**
 * "Back to …" above a page title. The link is 42px tall so it is easy to
 * tap on a phone (story 21, AC 21.2).
 */
export function BackLink({to, label}: {to: string; label: string}) {
  return (
    <Anchor
      component={Link}
      to={to}
      fz="sm"
      mih={42}
      display="inline-flex"
      style={{alignItems: 'center'}}
    >
      <Group gap={4} component="span">
        <IconArrowLeft size={16} />
        {label}
      </Group>
    </Anchor>
  );
}
