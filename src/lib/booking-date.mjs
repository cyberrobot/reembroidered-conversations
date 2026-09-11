// @ts-check

export const BOOKING_TIME_ZONE = 'Europe/London';

/**
 * Return the calendar date at an instant in an explicit IANA time zone.
 *
 * @param {Date} instant
 * @param {string} [timeZone]
 * @returns {string} An ISO calendar date in YYYY-MM-DD form.
 */
export function getCalendarDateInTimeZone(instant, timeZone = BOOKING_TIME_ZONE) {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('A valid instant is required.');
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Add whole days to an ISO calendar date without consulting the machine time zone.
 *
 * @param {string} calendarDate
 * @param {number} days
 * @returns {string}
 */
export function addCalendarDays(calendarDate, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate) || !Number.isInteger(days)) {
    throw new RangeError('A valid ISO calendar date and whole-day offset are required.');
  }

  const date = new Date(`${calendarDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('A valid ISO calendar date is required.');
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Return tomorrow's calendar date in the booking time zone.
 *
 * @param {Date} instant
 * @returns {string}
 */
export function getTomorrowCalendarDateInTimeZone(instant) {
  return addCalendarDays(getCalendarDateInTimeZone(instant, BOOKING_TIME_ZONE), 1);
}
