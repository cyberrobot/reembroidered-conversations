import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCancellationPolicy,
  InvalidCancellationPolicyInputError,
} from '../src/lib/booking/cancellation-policy.mjs';

const startAt = new Date('2030-01-02T12:00:00.000Z');

test('24-hour cancellation boundary is inclusive for an automatic refund', () => {
  assert.equal(getCancellationPolicy({ startAt, now: new Date('2030-01-01T11:59:59.999Z') }).automaticRefundEligible, true);
  assert.equal(getCancellationPolicy({ startAt, now: new Date('2030-01-01T12:00:00.000Z') }).automaticRefundEligible, true);
  assert.equal(getCancellationPolicy({ startAt, now: new Date('2030-01-01T12:00:00.001Z') }).automaticRefundEligible, false);
});

test('past bookings cannot be cancelled and invalid timestamps are rejected', () => {
  assert.deepEqual(getCancellationPolicy({ startAt, now: new Date('2030-01-02T12:00:00.000Z') }), {
    canCancel: false, automaticRefundEligible: false, cutoffHours: 24,
  });
  assert.throws(() => getCancellationPolicy({ startAt: 'invalid', now: new Date() }), InvalidCancellationPolicyInputError);
  assert.throws(() => getCancellationPolicy({ startAt, now: 'invalid' }), InvalidCancellationPolicyInputError);
});
