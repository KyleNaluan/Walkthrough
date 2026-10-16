/** Today's date as YYYY-MM-DD in Chicago, as the server decides deadlines. */
export function today(): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * A typed YYYY-MM-DD date, or null. Refuses a day that doesn't exist, e.g.
 * 2099-02-31, instead of moving it.
 */
export function parseDate(value: string) {
  const date = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value)
    ? value
    : null;
}
