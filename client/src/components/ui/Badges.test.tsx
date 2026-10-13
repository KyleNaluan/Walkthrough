import {screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {recordNumber} from '../../status';
import {renderWithTheme} from '../../test/renderWithAuth';
import {OverdueBadge, SeverityBadge, StatusBadge} from './Badges';

describe('badges', () => {
  it.each([
    ['open', 'Open'],
    ['pending_review', 'Pending review'],
    ['changes_requested', 'Changes requested'],
    ['reinspection_scheduled', 'Re-inspection scheduled'],
    ['resolved', 'Resolved'],
  ] as const)('shows status %s as "%s"', (status, label) => {
    renderWithTheme(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
  ] as const)('shows severity %s as "%s"', (severity, label) => {
    renderWithTheme(<SeverityBadge severity={severity} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows Overdue', () => {
    renderWithTheme(<OverdueBadge />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });
});

describe('recordNumber', () => {
  it('pads the ID to four digits', () => {
    expect(recordNumber('T', 7)).toBe('T-0007');
    expect(recordNumber('INS', 12345)).toBe('INS-12345');
  });
});
