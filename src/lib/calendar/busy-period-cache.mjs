// @ts-check
import "server-only";
import { ABUSE_POLICIES } from "../security/abuse-policy.mjs";
import { getBusyPeriods } from "./busy-periods.mjs";

const cache = new Map();
const inFlight = new Map();

export function clearBusyPeriodCache() {
  cache.clear();
  inFlight.clear();
}

/**
 * Cache only normalized Google busy intervals. Database conflicts remain fresh
 * in the availability engine. Failed requests are coalesced but never cached.
 */
export async function getCachedBusyPeriods(from, to, dependencies = {}) {
  const now = dependencies.now?.() ?? new Date();
  const load = dependencies.load ?? getBusyPeriods;
  const providerKey = dependencies.providerKey ?? "primary";
  const key = `${providerKey}:${from.toISOString()}:${to.toISOString()}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now.getTime()) return cached.value;
  if (cached) cache.delete(key);
  const current = inFlight.get(key);
  if (current) return current;
  const request = Promise.resolve(load(from, to))
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt:
          now.getTime() + ABUSE_POLICIES.googleBusyCache.ttlSeconds * 1000,
      });
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
