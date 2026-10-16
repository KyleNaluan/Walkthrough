import {Badge, Box, Divider, Group, Stack, Text} from '@mantine/core';
import {Fragment} from 'react';
import {apiGet} from '../../api';
import {formatDateTime} from '../../lib/format';
import type {FixReview, FixSubmission, ReviewDecision} from '../../types';
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

/** Every fix round on a ticket, oldest first, each with its review. */
export function FixHistory({
  ticketId,
  fixes,
}: {
  ticketId: number;
  fixes: FixSubmission[];
}) {
  return (
    <Stack gap="md">
      {fixes.map((fix, index) => (
        <Fragment key={fix.id}>
          {index > 0 && <Divider />}
          <Stack gap="xs" aria-label={`Fix ${index + 1}`} role="group">
            <Group justify="space-between" wrap="wrap">
              <Text fw={700}>Fix {index + 1}</Text>
              <Text ff="monospace" fz="xs" c="dimmed">
                Submitted {formatDateTime(fix.submittedAt)}
              </Text>
            </Group>
            <Text>{fix.description}</Text>
            <Box maw={360}>
              <Photo
                alt={`Photo for fix ${index + 1}`}
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
          </Stack>
        </Fragment>
      ))}
    </Stack>
  );
}
