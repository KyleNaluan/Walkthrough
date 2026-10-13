import {Text} from '@mantine/core';
import type {ReactNode} from 'react';
import {PageHeader} from '../components/ui/PageHeader';
import {Section} from '../components/ui/Section';

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
      <PageHeader eyebrow="Placeholder" title={title} />
      {children}
      <Section title="Not built yet">
        <Text c="dimmed">Placeholder. Built in {story}.</Text>
      </Section>
    </>
  );
}
