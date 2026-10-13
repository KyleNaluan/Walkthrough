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
      <div className="photo-placeholder" role="img" aria-label={alt}>
        {failed ? 'Photo unavailable' : 'Loading photo…'}
      </div>
    );
  }
  // The link expires after 5 minutes, so a failed load shows the placeholder.
  return (
    <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  );
}
