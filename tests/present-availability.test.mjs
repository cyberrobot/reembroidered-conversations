import assert from 'node:assert/strict';
import test from 'node:test';
import { presentAvailability } from '../src/lib/availability/present-availability.mjs';

test('presents available days with timezone-aware dates, AM/PM times, and periods', () => {
  const days = presentAvailability({
    timezone: 'Europe/London',
    days: [
      { date: '2035-01-09', slots: [] },
      { date: '2035-07-10', slots: [
        { startAt: '2035-07-10T08:30:00.000Z', endAt: '2035-07-10T09:25:00.000Z' },
        { startAt: '2035-07-10T12:00:00.000Z', endAt: '2035-07-10T12:55:00.000Z' },
        { startAt: '2035-07-10T16:00:00.000Z', endAt: '2035-07-10T16:55:00.000Z' },
      ] },
    ],
  });

  assert.equal(days.length, 1);
  assert.equal(days[0].formattedDate, 'Tuesday, 10 Jul');
  assert.deepEqual(days[0].slots.map(({ time, period }) => ({ time, period })), [
    { time: '9:30 AM', period: 'morning' },
    { time: '1:00 PM', period: 'afternoon' },
    { time: '5:00 PM', period: 'evening' },
  ]);
});
