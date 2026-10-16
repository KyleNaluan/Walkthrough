import {Badge, Box, Flex, Group, Stack, Text, Timeline} from '@mantine/core';
import type {ReactNode} from 'react';
import {apiGet} from '../../api';
import {formatDate, formatDateTime} from '../../lib/format';
import {recordNumber} from '../../status';
import type {
  FixReview,
  FixSubmission,
  Reinspection,
  ReinspectionOutcome,
  ReviewDecision,
  TicketDetail,
} from '../../types';
import {Photo} from '../Photo';

const DECISION: Record<ReviewDecision, {label: string; color: string}> = {
  approved: {label: 'Approved', color: 'green'},
  changes_requested: {label: 'Changes requested', color: 'red'},
  reinspection_scheduled: {label: 'Re-inspection scheduled', color: 'grape'},
};

const OUTCOME: Record<ReinspectionOutcome, {label: string; color: string}> = {
  pending: {label: 'Re-inspection due', color: 'grape'},
  passed: {label: 'Re-inspection passed', color: 'green'},
  failed: {label: 'Re-inspection failed', color: 'red'},
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

/**
 * A timestamp in microseconds. Postgres keeps microseconds, which
 * Date.parse drops, so events less than a millisecond apart stay in order.
 */
function microseconds(timestamp: string): number {
  const fraction = /\.(\d+)/.exec(timestamp)?.[1] ?? '';
  return (
    Date.parse(timestamp.replace(/\.\d+/, '')) * 1000 +
    Number(fraction.slice(0, 6).padEnd(6, '0'))
  );
}

interface Entry {
  key: string;
  /** When it happened, in microseconds, for the order. */
  at: number;
  label: string;
  title: string;
  date: string;
  color?: string;
  body?: ReactNode;
}

function reinspectionEntry(reinspection: Reinspection, number: number): Entry {
  const {visit} = reinspection;
  const {label, color} = OUTCOME[reinspection.outcome];
  return {
    key: `reinspection-${reinspection.id}`,
    // Never before the review that scheduled it.
    at: Math.max(
      microseconds(reinspection.createdAt),
      visit ? microseconds(visit.startedAt) : 0,
    ),
    label: `Re-inspection ${number}`,
    title: label,
    date: visit
      ? formatDateTime(visit.startedAt)
      : `Due ${formatDate(reinspection.scheduledFor)}`,
    color,
    body: visit && (
      <Text fz="sm">
        {recordNumber('INS', visit.inspectionId)} by {visit.inspectorName}
      </Text>
    ),
  };
}

/**
 * The finding, each fix round with its review, and each re-inspection,
 * oldest first (AC 13.1). A review always comes before the next fix or
 * re-inspection result, so it stays with its fix.
 */
function entries(ticket: TicketDetail): Entry[] {
  return [
    {
      key: 'finding',
      at: microseconds(ticket.recordedAt),
      label: 'Finding',
      title: 'Finding recorded',
      date: formatDateTime(ticket.recordedAt),
    },
    ...ticket.fixes.map((fix, index) => ({
      key: `fix-${fix.id}`,
      at: microseconds(fix.submittedAt),
      label: `Fix ${index + 1}`,
      title: `Fix ${index + 1} submitted`,
      date: formatDateTime(fix.submittedAt),
      body: <Fix ticketId={ticket.id} fix={fix} number={index + 1} />,
    })),
    ...ticket.reinspections.map((reinspection, index) =>
      reinspectionEntry(reinspection, index + 1),
    ),
  ].sort((a, b) => a.at - b.at);
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
          // Colour only the bullet, so the line stays one colour.
          styles={
            item.color
              ? {
                  itemBullet: {
                    borderColor: `var(--mantine-color-${item.color}-filled)`,
                  },
                }
              : undefined
          }
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
