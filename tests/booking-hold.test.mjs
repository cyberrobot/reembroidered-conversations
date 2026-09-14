import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBookingHold,
  createHoldPersistence,
  HoldAvailabilityError,
  InvalidHoldRequestError,
  SlotUnavailableError,
} from '../src/lib/booking/booking-hold.mjs';

const now = new Date('2026-09-14T12:00:00.000Z');
const startAt = '2026-09-16T09:00:00.000Z';
const endAt = '2026-09-16T09:55:00.000Z';

function dependencies(overrides = {}) {
  return {
    getAvailableSlots: async (input) => {
      assert.equal(input.fromDate, '2026-09-16');
      assert.equal(input.toDate, '2026-09-16');
      assert.equal(input.now, now);
      return [{ date: '2026-09-16', startAt, endAt }];
    },
    persist: async (data) => ({ id: 'hold-id', ...data }),
    ...overrides,
  };
}

test('valid request persists canonical server-owned HOLD data using one clock', async () => {
  let persisted;
  const result = await createBookingHold(
    { name: '  Sarah  ', email: ' sarah@example.com ', startAt, endAt: 'attacker', status: 'CONFIRMED', expiresAt: 'attacker', timezone: 'attacker' },
    now,
    dependencies({ persist: async (data) => { persisted = data; return { id: 'hold-id', ...data }; } }),
  );
  assert.equal(persisted.name, 'Sarah');
  assert.equal(persisted.email, 'sarah@example.com');
  assert.equal(persisted.startAt.toISOString(), startAt);
  assert.equal(persisted.endAt.toISOString(), endAt);
  assert.equal(persisted.timezone, 'Europe/London');
  assert.equal(persisted.expiresAt.toISOString(), '2026-09-14T12:15:00.000Z');
  assert.equal(persisted.now, now);
  assert.equal('status' in persisted, false);
  assert.equal(result.id, 'hold-id');
});

test('invalid name, email, and timestamp fail before availability or persistence', async () => {
  const invalid = [
    { name: ' ', email: 'a@example.com', startAt },
    { name: 'Sarah', email: 'invalid', startAt },
    { name: 'Sarah', email: 'a@example.com', startAt: '2026-09-16' },
  ];
  for (const input of invalid) {
    let calls = 0;
    await assert.rejects(
      () => createBookingHold(input, now, dependencies({
        getAvailableSlots: async () => { calls += 1; return []; },
        persist: async () => { calls += 1; },
      })),
      InvalidHoldRequestError,
    );
    assert.equal(calls, 0);
  }
});

test('a slot absent from current unified availability is unavailable', async () => {
  let persisted = false;
  await assert.rejects(() => createBookingHold(
    { name: 'Sarah', email: 'a@example.com', startAt }, now,
    dependencies({ getAvailableSlots: async () => [], persist: async () => { persisted = true; } }),
  ), SlotUnavailableError);
  assert.equal(persisted, false);
});

test('availability failures are distinguished and prevent persistence', async () => {
  let persisted = false;
  await assert.rejects(() => createBookingHold(
    { name: 'Sarah', email: 'a@example.com', startAt }, now,
    dependencies({ getAvailableSlots: async () => { throw new Error('google detail'); }, persist: async () => { persisted = true; } }),
  ), HoldAvailabilityError);
  assert.equal(persisted, false);
});

test('database uniqueness races become slot conflicts', async () => {
  for (const error of [{ code: 'P2002', meta: { target: 'bookings_active_start_at_key' } }, { cause: { code: '23505' } }]) {
    await assert.rejects(() => createBookingHold(
      { name: 'Sarah', email: 'a@example.com', startAt }, now,
      dependencies({ persist: async () => { throw error; } }),
    ), SlotUnavailableError);
  }
});

test('claim transaction releases only an exact expired HOLD before inserting', async () => {
  const calls = [];
  const created = { id: 'new-hold' };
  const database = {
    $transaction: async (callback) => callback({ booking: {
      updateMany: async (query) => { calls.push(['update', query]); },
      create: async (query) => { calls.push(['create', query]); return created; },
    } }),
  };
  const input = {
    name: 'Sarah', email: 'sarah@example.com', startAt: new Date(startAt), endAt: new Date(endAt),
    timezone: 'Europe/London', expiresAt: new Date('2026-09-14T12:15:00.000Z'), now,
  };
  assert.equal(await createHoldPersistence(database)(input), created);
  assert.deepEqual(calls[0], ['update', {
    where: { startAt: input.startAt, status: 'HOLD', expiresAt: { lte: now } },
    data: { status: 'CANCELLED' },
  }]);
  assert.equal(calls[1][0], 'create');
  assert.deepEqual(calls[1][1].data, {
    name: input.name, email: input.email, startAt: input.startAt, endAt: input.endAt,
    timezone: input.timezone, status: 'HOLD', expiresAt: input.expiresAt,
  });
});
