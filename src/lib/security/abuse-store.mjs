// @ts-check

import "server-only";
import { randomUUID } from "node:crypto";
import { ABUSE_POLICIES } from "./abuse-policy.mjs";

export class AbuseProtectionUnavailableError extends Error {
  constructor(cause) {
    super("Abuse protection unavailable.", { cause });
    this.name = "AbuseProtectionUnavailableError";
  }
}

export class RateLimitExceededError extends Error {
  constructor(retryAfterSeconds) {
    super("Rate limit exceeded.");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ActiveHoldLimitError extends Error {
  constructor() {
    super("Active hold limit exceeded.");
    this.name = "ActiveHoldLimitError";
  }
}

export function createPostgresAbuseStore(database) {
  return {
    async consumeRateLimit(policyName, clientKey, now = new Date()) {
      const policy = ABUSE_POLICIES[policyName];
      if (!policy || !("windowSeconds" in policy))
        throw new AbuseProtectionUnavailableError();
      const windowMs = policy.windowSeconds * 1000;
      const windowStart = new Date(
        Math.floor(now.getTime() / windowMs) * windowMs,
      );
      const expiresAt = new Date(windowStart.getTime() + windowMs);
      try {
        await database.$executeRaw`DELETE FROM "abuse_rate_limits" WHERE "expiresAt" <= ${now}`;
        const rows = await database.$queryRaw`
          INSERT INTO "abuse_rate_limits" ("key", "windowStart", "count", "expiresAt")
          VALUES (${`${policyName}:${clientKey}`}, ${windowStart}, 1, ${expiresAt})
          ON CONFLICT ("key", "windowStart") DO UPDATE
          SET "count" = "abuse_rate_limits"."count" + 1
          RETURNING "count"
        `;
        if (Number(rows[0]?.count) > policy.limit) {
          throw new RateLimitExceededError(
            Math.max(
              1,
              Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
            ),
          );
        }
      } catch (error) {
        if (error instanceof RateLimitExceededError) throw error;
        throw new AbuseProtectionUnavailableError(error);
      }
    },

    async acquireActiveHoldPermit(clientKey, expiresAt, now = new Date()) {
      const permitId = randomUUID();
      try {
        return await database.$transaction(async (transaction) => {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clientKey}))`;
          await transaction.$executeRaw`DELETE FROM "abuse_hold_permits" WHERE "expiresAt" <= ${now}`;
          const rows = await transaction.$queryRaw`
            SELECT COUNT(*)::int AS "count" FROM "abuse_hold_permits"
            WHERE "clientKey" = ${clientKey} AND "expiresAt" > ${now}
          `;
          if (Number(rows[0]?.count) >= ABUSE_POLICIES.activeHolds.limit)
            throw new ActiveHoldLimitError();
          await transaction.$executeRaw`
            INSERT INTO "abuse_hold_permits" ("id", "clientKey", "expiresAt")
            VALUES (${permitId}::uuid, ${clientKey}, ${expiresAt})
          `;
          return permitId;
        });
      } catch (error) {
        if (error instanceof ActiveHoldLimitError) throw error;
        throw new AbuseProtectionUnavailableError(error);
      }
    },

    async commitActiveHoldPermit(permitId, bookingId) {
      try {
        const changed = await database.$executeRaw`
          UPDATE "abuse_hold_permits" SET "bookingId" = ${bookingId}::uuid
          WHERE "id" = ${permitId}::uuid AND "bookingId" IS NULL
        `;
        if (Number(changed) !== 1) throw new Error("Permit commit failed.");
      } catch (error) {
        throw new AbuseProtectionUnavailableError(error);
      }
    },

    async extendActiveHoldPermit(bookingId, expiresAt) {
      try {
        const changed = await database.$executeRaw`
          UPDATE "abuse_hold_permits" SET "expiresAt" = ${expiresAt}
          WHERE "bookingId" = ${bookingId}::uuid
        `;
        if (Number(changed) !== 1) throw new Error("Permit extension failed.");
      } catch (error) {
        throw new AbuseProtectionUnavailableError(error);
      }
    },

    async syncActiveHoldPermitToBooking(bookingId) {
      try {
        const changed = await database.$executeRaw`
          UPDATE "abuse_hold_permits" AS permit
          SET "expiresAt" = booking."expiresAt"
          FROM "bookings" AS booking
          WHERE permit."bookingId" = booking."id"
            AND booking."id" = ${bookingId}::uuid
            AND booking."status" = 'HOLD'
        `;
        if (Number(changed) !== 1)
          throw new Error("Permit synchronization failed.");
      } catch (error) {
        throw new AbuseProtectionUnavailableError(error);
      }
    },

    async releaseActiveHoldPermit(reference) {
      try {
        await database.$executeRaw`
          DELETE FROM "abuse_hold_permits"
          WHERE "id"::text = ${reference} OR "bookingId"::text = ${reference}
        `;
      } catch (error) {
        throw new AbuseProtectionUnavailableError(error);
      }
    },
  };
}

export async function getAbuseStore() {
  try {
    const { db } = await import("../db.ts");
    return createPostgresAbuseStore(db);
  } catch (error) {
    throw new AbuseProtectionUnavailableError(error);
  }
}
