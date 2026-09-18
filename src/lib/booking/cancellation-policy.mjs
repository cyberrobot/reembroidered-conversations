// @ts-check

import "server-only";

export const CANCELLATION_REFUND_CUTOFF_HOURS = 24;
const CUTOFF_MS = CANCELLATION_REFUND_CUTOFF_HOURS * 60 * 60 * 1000;

export class InvalidCancellationPolicyInputError extends Error {
  constructor() {
    super("Cancellation policy input is invalid.");
    this.name = "InvalidCancellationPolicyInputError";
  }
}

function date(value) {
  const result = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(result.getTime()))
    throw new InvalidCancellationPolicyInputError();
  return result;
}

export function getCancellationPolicy({ startAt, now }) {
  const start = date(startAt);
  const submittedAt = date(now);
  const millisecondsUntilSession = start.getTime() - submittedAt.getTime();
  return {
    canCancel: millisecondsUntilSession > 0,
    automaticRefundEligible: millisecondsUntilSession >= CUTOFF_MS,
    cutoffHours: CANCELLATION_REFUND_CUTOFF_HOURS,
  };
}
