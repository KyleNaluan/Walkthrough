import {Badge, Box, Flex, Group, Stack, Text, Timeline} from '@mantine/core';
import type {ReactNode} from 'react';
import {apiGet} from '../../api';
import {formatDateTime} from '../../lib/format';
import type {
  FixReview,
  FixSubmission,
  ReviewDecision,
  TicketDetail,
} from '../../types';
import {Photo} from '../Photo';

const DECISION: Record<ReviewDecision, {label: string; color: string}> = {
  approved: {label: 'Approved', color: 'green'},
  changes_requested: {label: 'Changes requested', color: 'red'},
  reinspection_scheduled: {label: 'Re-inspection scheduled', color: 'grape'},
};

function Review({review}: {review: FixReview}) {
  const {label, color} = DECISION[review.decision];
  return (
    <Box
      pl="sm"
      style={{borderLeft: `3px solid var(--mantine-color-${color}-6)`}}
    >
      <Group gap="xs" wrap="wrap">
        <Badge color={color} variant="light">
          {label}
        </Badge>
        <Text fz="sm">
          by {review.reviewerName} ·{' '}
          <Text span ff="monospace" fz="xs">
            {formatDateTime(review.reviewedAt)}
          </Text>
        </Text>
      </Group>
      {review.comment && <Text mt={4}>{review.comment}</Text>}
    </Box>
  );
}

function Fix({
  ticketId,
  fix,
  number,
}: {
  ticketId: number;
  fix: FixSubmission;
  number: number;
}) {
  return (
    <>
      <Text>{fix.description}</Text>
      <Box maw={360}>
        <Photo
          alt={`Photo for fix ${number}`}
          src={() =>
            apiGet<{url: string}>(
              `/api/tickets/${ticketId}/fixes/${fix.id}/photo`,
            ).then((res) => res.url)
          }
        />
      </Box>
      {fix.review ? (
        <Review review={fix.review} />
      ) : (
        <Text fz="sm" c="dimmed">
          Waiting for review
        </Text>
      )}
    </>
  );
}

interface Entry {
  key: string;
  label: string;
  title: string;
  date: string;
  body?: ReactNode;
}

/**
 * The finding, then each fix round with its review. A review always comes
 * before the next fix, so it stays with its fix.
 */
function entries(ticket: TicketDetail): Entry[] {
  return [
    {
      key: 'finding',
      label: 'Finding',
      title: 'Finding recorded',
      date: formatDateTime(ticket.recordedAt),
    },
    ...ticket.fixes.map((fix, index) => ({
      key: `fix-${fix.id}`,
      label: `Fix ${index + 1}`,
      title: `Fix ${index + 1} submitted`,
      date: formatDateTime(fix.submittedAt),
      body: <Fix ticketId={ticket.id} fix={fix} number={index + 1} />,
    })),
  ];
}

/** A ticket's history, oldest first (story 13). */
export function TicketTimeline({ticket}: {ticket: TicketDetail}) {
  const items = entries(ticket);
  return (
    <Timeline active={items.length - 1} bulletSize={14} lineWidth={2}>
      {items.map((item) => (
        <Timeline.Item
          key={item.key}
          role="group"
          aria-label={item.label}
          title={
            <Flex
              direction={{base: 'column', xs: 'row'}}
              justify="space-between"
              align={{base: 'flex-start', xs: 'baseline'}}
              gap={{base: 6, xs: 'md'}}
            >
              {/* lh 1 centres the title on its bullet. */}
              <Text fw={700} lh={1}>
                {item.title}
              </Text>
              <Text ff="monospace" fz="xs" c="dimmed" lh={1}>
                {item.date}
              </Text>
            </Flex>
          }
        >
          {item.body && (
            <Stack gap="xs" mt={4}>
              {item.body}
            </Stack>
          )}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
