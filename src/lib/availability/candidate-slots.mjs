// @ts-check

import { addCalendarDays, getCalendarDateInTimeZone } from '../booking-date.mjs';

const WEEKDAYS = /** @type {const} */ ([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]);

const MINUTE_MS = 60_000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/** @param {string} date */
function parseCalendarDate(date) {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid calendar date: ${date}`);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return { year, month, day, instant: parsed };
}

/** @param {string} time */
function wallTimeToMinutes(time) {
  const match = WALL_TIME_PATTERN.exec(time);
  if (!match) throw new RangeError(`Invalid working time: ${time}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RangeError(`Invalid working time: ${time}`);
  return hours * 60 + minutes;
}

/** @param {number} value @param {string} name @param {boolean} [positive] */
function requireWholeMinutes(value, name, positive = false) {
  if (!Number.isInteger(value) || (positive ? value <= 0 : value < 0)) {
    throw new RangeError(`${name} must be ${positive ? 'a positive' : 'a non-negative'} whole number.`);
  }
}

/**
 * Validate provider-owned scheduling rules without changing or normalizing them.
 *
 * @param {import('./provider-config.mjs').ProviderAvailabilityConfig} config
 */
export function validateProviderAvailabilityConfig(config) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone }).format();
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${config.timezone}`);
  }

  requireWholeMinutes(config.sessionDurationMinutes, 'sessionDurationMinutes', true);
  requireWholeMinutes(config.bufferBeforeMinutes, 'bufferBeforeMinutes');
  requireWholeMinutes(config.bufferAfterMinutes, 'bufferAfterMinutes');
  requireWholeMinutes(config.minimumNoticeMinutes, 'minimumNoticeMinutes');
  requireWholeMinutes(config.maximumBookingHorizonDays, 'maximumBookingHorizonDays');

  if (!config.weeklyWorkingHours || typeof config.weeklyWorkingHours !== 'object') {
    throw new TypeError('weeklyWorkingHours is required.');
  }

  for (const weekday of WEEKDAYS) {
    const windows = config.weeklyWorkingHours[weekday];
    if (!Array.isArray(windows)) throw new TypeError(`Working hours for ${weekday} must be an array.`);
    const ranges = windows.map((window) => {
      if (!window || typeof window !== 'object') throw new TypeError(`Invalid working window for ${weekday}.`);
      const start = wallTimeToMinutes(window.start);
      const end = wallTimeToMinutes(window.end);
      if (start >= end) throw new RangeError(`Working window start must precede end for ${weekday}.`);
      return { start, end };
    }).sort((a, b) => a.start - b.start);

    for (let index = 1; index < ranges.length; index += 1) {
      if (ranges[index].start < ranges[index - 1].end) {
        throw new RangeError(`Working windows must not overlap for ${weekday}.`);
      }
    }
  }

  if (!Array.isArray(config.daysOff)) throw new TypeError('daysOff must be an array.');
  for (const date of config.daysOff) parseCalendarDate(date);
}

/**
 * Resolve a provider-local wall time to an instant. Testing offsets on both sides
 * of the date handles DST without relying on the host machine's timezone.
 *
 * @param {string} date
 * @param {number} minuteOfDay
 * @param {string} timeZone
 */
function wallTimeToInstant(date, minuteOfDay, timeZone) {
  const { year, month, day } = parseCalendarDate(date);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });

  const matching = new Set();
  for (const sampleDelta of [-86_400_000, 0, 86_400_000]) {
    const sample = new Date(desiredAsUtc + sampleDelta);
    const parts = Object.fromEntries(formatter.formatToParts(sample).map(({ type, value }) => [type, value]));
    const representedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const offset = representedAsUtc - sample.getTime();
    const candidate = new Date(desiredAsUtc - offset);
    const check = Object.fromEntries(formatter.formatToParts(candidate).map(({ type, value }) => [type, value]));
    if (
      Number(check.year) === year && Number(check.month) === month && Number(check.day) === day &&
      Number(check.hour) === hour && Number(check.minute) === minute
    ) matching.add(candidate.getTime());
  }

  if (matching.size === 0) throw new RangeError(`Local time ${date} ${hour}:${String(minute).padStart(2, '0')} does not exist in ${timeZone}.`);
  return new Date(Math.min(...matching));
}

/**
 * @typedef {object} ProviderCandidateSlot
 * @property {string} startAt
 * @property {string} endAt
 * @property {string} occupancyStartAt
 * @property {string} occupancyEndAt
 */

/**
 * Generate configured candidates only; booking and calendar conflicts are deliberately absent.
 *
 * @param {{ date: string, now: Date, config: import('./provider-config.mjs').ProviderAvailabilityConfig }} input
 * @returns {ProviderCandidateSlot[]}
 */
export function getProviderCandidateSlotsForDate({ date, now, config }) {
  validateProviderAvailabilityConfig(config);
  const parsedDate = parseCalendarDate(date);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError('A valid current instant is required.');

  const today = getCalendarDateInTimeZone(now, config.timezone);
  const finalDate = addCalendarDays(today, config.maximumBookingHorizonDays);
  if (date < today || date > finalDate || new Set(config.daysOff).has(date)) return [];

  const weekday = WEEKDAYS[parsedDate.instant.getUTCDay()];
  const windows = config.weeklyWorkingHours[weekday];
  if (windows.length === 0) return [];

  const spacing = config.sessionDurationMinutes + config.bufferBeforeMinutes + config.bufferAfterMinutes;
  const noticeBoundary = now.getTime() + config.minimumNoticeMinutes * MINUTE_MS;
  /** @type {ProviderCandidateSlot[]} */
  const candidates = [];

  for (const window of [...windows].sort((a, b) => wallTimeToMinutes(a.start) - wallTimeToMinutes(b.start))) {
    const windowStart = wallTimeToMinutes(window.start);
    const windowEnd = wallTimeToMinutes(window.end);
    const firstSessionStart = windowStart + config.bufferBeforeMinutes;
    const latestSessionStart = windowEnd - config.sessionDurationMinutes - config.bufferAfterMinutes;

    for (let startMinute = firstSessionStart; startMinute <= latestSessionStart; startMinute += spacing) {
      const startAt = wallTimeToInstant(date, startMinute, config.timezone);
      if (startAt.getTime() < noticeBoundary) continue;
      const endAt = new Date(startAt.getTime() + config.sessionDurationMinutes * MINUTE_MS);
      candidates.push({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        occupancyStartAt: new Date(startAt.getTime() - config.bufferBeforeMinutes * MINUTE_MS).toISOString(),
        occupancyEndAt: new Date(endAt.getTime() + config.bufferAfterMinutes * MINUTE_MS).toISOString(),
      });
    }
  }

  return [...new Map(candidates.map((candidate) => [candidate.startAt, candidate])).values()]
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
