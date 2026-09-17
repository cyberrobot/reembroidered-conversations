import assert from 'node:assert/strict';
import test from 'node:test';

import { getAvailableSlots, intervalsOverlap } from '../src/lib/availability/available-slots.mjs';
import { PROVIDER_AVAILABILITY_CONFIG } from '../src/lib/availability/provider-config.mjs';

const now = new Date('2026-09-01T00:00:00.000Z');
const date = '2026-09-07';

function dependencies(overrides = {}) {
  return {
    getCandidates: ({ date: candidateDate, now: candidateNow, config }) => {
      assert.equal(candidateNow, now);
      return import('../src/lib/availability/candidate-slots.mjs').then;
    },
    getBookingConflicts: async () => [],
    getCalendarBusyPeriods: async () => [],
    ...overrides,
  };
}

async function realDependencies(overrides = {}) {
  const { getProviderCandidateSlotsForDate } = await import('../src/lib/availability/candidate-slots.mjs');
  return dependencies({ getCandidates: getProviderCandidateSlotsForDate, ...overrides });
}

test('no conflicts leaves canonical candidates available using one bounded query per dependency', async () => {
  const calls = [];
  const deps = await realDependencies({
    getBookingConflicts: async (range) => { calls.push(['database', range]); return []; },
    getCalendarBusyPeriods: async (from, to) => { calls.push(['google', { from, to }]); return []; },
  });
  const result = await getAvailableSlots({ fromDate: date, toDate: date, now }, deps);
  assert.equal(result.length, 6);
  assert.deepEqual(calls.map(([name]) => name).sort(), ['database', 'google']);
  assert.deepEqual(Object.keys(result[0]), ['date', 'startAt', 'endAt']);
});

test('Google overlap removes occupancy but a boundary-touching period does not', async () => {
  const deps = await realDependencies({
    getCalendarBusyPeriods: async () => [
      { startAt: '2026-09-07T09:54:00.000Z', endAt: '2026-09-07T09:55:00.000Z' },
      { startAt: '2026-09-07T10:50:00.000Z', endAt: '2026-09-07T11:00:00.000Z' },
    ],
  });
  const result = await getAvailableSlots({ fromDate: date, toDate: date, now }, deps);
  assert.equal(result.some((slot) => slot.startAt === '2026-09-07T09:00:00.000Z'), false);
  assert.equal(result.some((slot) => slot.startAt === '2026-09-07T09:55:00.000Z'), true);
  assert.equal(intervalsOverlap(
    { startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z' },
    { startAt: '2026-01-01T11:00:00Z', endAt: '2026-01-01T12:00:00Z' },
  ), false);
});

test('full-day Google busy period removes every slot for that provider-local date', async () => {
  const deps = await realDependencies({
    getCalendarBusyPeriods: async () => [{
      startAt: '2026-09-06T23:00:00.000Z',
      endAt: '2026-09-07T23:00:00.000Z',
    }],
  });

  const result = await getAvailableSlots({
    fromDate: '2026-09-07',
    toDate: '2026-09-07',
    now,
  }, deps);

  assert.deepEqual(result, []);
});

test('CONFIRMED, PAID, and active HOLD block while expired or released bookings do not', async () => {
  const cases = [
    ['CONFIRMED', new Date('2026-09-01T00:00:00Z'), null, true],
    ['PAID', new Date('2026-09-01T00:00:00Z'), null, true],
    ['HOLD', new Date('2026-09-01T00:00:01Z'), null, true],
    ['HOLD', new Date('2026-09-01T00:00:00Z'), null, false],
    ['HOLD', new Date('2026-09-01T00:00:00Z'), 'cs_unresolved', true],
    ['CANCELLED', new Date('2026-09-01T00:00:01Z'), 'cs_expired', false],
    ['REFUNDED', new Date('2026-09-01T00:00:01Z'), null, false],
  ];
  for (const [status, expiresAt, stripeCheckoutSessionId, blocks] of cases) {
    const deps = await realDependencies({
      getBookingConflicts: async () => [{
        startAt: new Date('2026-09-07T09:00:00Z'),
        endAt: new Date('2026-09-07T09:55:00Z'),
        status,
        expiresAt,
        stripeCheckoutSessionId,
        rescheduleSourceBookingId: null,
      }],
    });
    const result = await getAvailableSlots({ fromDate: date, toDate: date, now }, deps);
    assert.equal(result.some((slot) => slot.startAt === '2026-09-07T09:00:00.000Z'), !blocks, status);
  }
});

test('an expired HOLD linked to a reschedule remains slot-owning', async () => {
  const deps = await realDependencies({
    getBookingConflicts: async () => [{
      startAt: new Date('2026-09-07T09:00:00Z'), endAt: new Date('2026-09-07T09:55:00Z'),
      status: 'HOLD', expiresAt: new Date('2026-08-01T00:00:00Z'),
      stripeCheckoutSessionId: null, rescheduleSourceBookingId: '5a449655-7be3-432c-a124-b769e10b50ef',
    }],
  });
  const result = await getAvailableSlots({ fromDate: date, toDate: date, now }, deps);
  assert.equal(result.some((slot) => slot.startAt === '2026-09-07T09:00:00.000Z'), false);
});

test('booking and candidate occupancy buffers remove otherwise non-overlapping sessions', async () => {
  const config = {
    ...PROVIDER_AVAILABILITY_CONFIG,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 5,
    minimumNoticeMinutes: 0,
  };
  const deps = await realDependencies({
    getBookingConflicts: async () => [{
      startAt: new Date('2026-09-07T08:51:00Z'),
      endAt: new Date('2026-09-07T09:46:00Z'),
      status: 'CONFIRMED',
      expiresAt: now,
    }],
  });
  const result = await getAvailableSlots({ fromDate: date, toDate: date, now, config }, deps);
  assert.equal(result.some((slot) => slot.startAt === '2026-09-07T09:10:00.000Z'), false);
});

test('multiple conflict sources leave only genuinely available sorted unique slots', async () => {
  const deps = await realDependencies({
    getBookingConflicts: async () => [{
      startAt: new Date('2026-09-07T09:00:00Z'), endAt: new Date('2026-09-07T09:55:00Z'),
      status: 'CONFIRMED', expiresAt: now,
    }],
    getCalendarBusyPeriods: async () => [
      { startAt: '2026-09-07T09:55:00Z', endAt: '2026-09-07T10:50:00Z' },
    ],
  });
  const result = await getAvailableSlots({ fromDate: date, toDate: date, now }, deps);
  assert.equal(result.length, 4);
  assert.deepEqual(result, [...new Map(result.map((slot) => [slot.startAt, slot])).values()].sort((a, b) => a.startAt.localeCompare(b.startAt)));
});

test('duplicate candidate output is normalized into chronological unique slots', async () => {
  const later = {
    startAt: '2026-09-07T10:00:00.000Z', endAt: '2026-09-07T10:55:00.000Z',
    occupancyStartAt: '2026-09-07T10:00:00.000Z', occupancyEndAt: '2026-09-07T10:55:00.000Z',
  };
  const earlier = {
    startAt: '2026-09-07T09:00:00.000Z', endAt: '2026-09-07T09:55:00.000Z',
    occupancyStartAt: '2026-09-07T09:00:00.000Z', occupancyEndAt: '2026-09-07T09:55:00.000Z',
  };
  const result = await getAvailableSlots({ fromDate: date, toDate: date, now }, dependencies({
    getCandidates: () => [later, earlier, { ...earlier }],
  }));
  assert.deepEqual(result.map((slot) => slot.startAt), [earlier.startAt, later.startAt]);
});

test('empty provider range performs no database or Google work', async () => {
  let calls = 0;
  const deps = await realDependencies({
    getBookingConflicts: async () => { calls += 1; return []; },
    getCalendarBusyPeriods: async () => { calls += 1; return []; },
  });
  assert.deepEqual(await getAvailableSlots({ fromDate: '2026-09-12', toDate: '2026-09-13', now }, deps), []);
  assert.equal(calls, 0);
});

test('database and Google failures propagate instead of becoming free slots', async () => {
  for (const failing of ['database', 'google']) {
    const deps = await realDependencies({
      getBookingConflicts: async () => {
        if (failing === 'database') throw new Error('database unavailable');
        return [];
      },
      getCalendarBusyPeriods: async () => {
        if (failing === 'google') throw new Error('calendar unavailable');
        return [];
      },
    });
    await assert.rejects(() => getAvailableSlots({ fromDate: date, toDate: date, now }, deps));
  }
});

test('provider-local candidates remain deterministic across London DST', async () => {
  const deps = await realDependencies();
  const winter = await getAvailableSlots({ fromDate: '2026-01-05', toDate: '2026-01-05', now: new Date('2026-01-01T00:00:00Z') }, deps);
  const summer = await getAvailableSlots({ fromDate: '2026-07-06', toDate: '2026-07-06', now: new Date('2026-07-01T00:00:00Z') }, deps);
  assert.equal(winter[0].startAt.slice(11, 16), '10:00');
  assert.equal(summer[0].startAt.slice(11, 16), '09:00');
});
