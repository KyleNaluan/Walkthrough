import dayjs from 'dayjs';

/** A YYYY-MM-DD date (a deadline) as "Oct 20, 2026", with no time zone shift. */
export function formatDate(date: string): string {
  return dayjs(date).format('MMM D, YYYY');
}

/** A timestamp as "Oct 14, 2026, 3:05 PM" in the browser's time zone. */
export function formatDateTime(timestamp: string): string {
  return dayjs(timestamp).format('MMM D, YYYY, h:mm A');
}
