import {Center, Image, Stack, Text} from '@mantine/core';
import {IconPhoto, IconPhotoOff} from '@tabler/icons-react';
import {useEffect, useEffectEvent, useState} from 'react';

/**
 * Shows a private photo. `src` fetches a short-lived signed URL from the
 * story's own route (which checks access); it is called once on mount, so
 * give the component a new `key` to load a different photo.
 */
export function Photo({src, alt}: {src: () => Promise<string>; alt: string}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const loadUrl = useEffectEvent(src);

  useEffect(() => {
    let active = true;
    loadUrl().then(
      (signedUrl) => active && setUrl(signedUrl),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, []);

  if (failed || !url) {
    return (
      <Center
        role="img"
        aria-label={alt}
        bg="gray.1"
        style={{
          aspectRatio: '4 / 3',
          borderRadius: 'var(--mantine-radius-sm)',
          border: '1px dashed var(--mantine-color-gray-4)',
        }}
      >
        <Stack gap={4} align="center" c="dimmed">
          {failed ? <IconPhotoOff size={28} /> : <IconPhoto size={28} />}
          <Text fz="sm">{failed ? 'Photo unavailable' : 'Loading photo…'}</Text>
        </Stack>
      </Center>
    );
  }
  // The link expires after 5 minutes, so a failed load shows the placeholder.
  return (
    <Image
      src={url}
      alt={alt}
      loading="lazy"
      radius="sm"
      onError={() => setFailed(true)}
    />
  );
}
