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
    <>
      <h1>{title}</h1>
      {children}
      <p className="note">Placeholder. Built in {story}.</p>
    </>
  );
}
