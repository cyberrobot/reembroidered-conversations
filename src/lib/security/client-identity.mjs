// @ts-check

import "server-only";
import { createHmac } from "node:crypto";

export class ClientIdentityUnavailableError extends Error {
  constructor() {
    super("Trusted client identity is unavailable.");
    this.name = "ClientIdentityUnavailableError";
  }
}

/** @param {Request} request */
export function getClientIdentity(request) {
  const configured = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  const header =
    configured ||
    (process.env.NODE_ENV === "production" ? "" : "x-forwarded-for");
  if (!header) throw new ClientIdentityUnavailableError();
  const raw = request.headers.get(header)?.split(",")[0]?.trim();
  const local =
    process.env.NODE_ENV === "production" ? "" : "local-development";
  const address = raw || local;
  const secret =
    process.env.ABUSE_PROTECTION_HMAC_SECRET ||
    (process.env.NODE_ENV === "production"
      ? ""
      : "development-only-abuse-secret");
  if (!address || !secret) throw new ClientIdentityUnavailableError();
  return createHmac("sha256", secret).update(address).digest("hex");
}
