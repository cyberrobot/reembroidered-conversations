const appUrl = process.env.APP_URL?.trim();
const secret = process.env.BOOKING_RECONCILIATION_SECRET?.trim();

if (!appUrl || !secret) {
  console.error("Booking reconciliation invocation is not configured.");
  process.exitCode = 1;
} else {
  try {
    const endpoint = new URL("/api/internal/bookings/reconcile", appUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`Reconciliation endpoint returned ${response.status}.`);
    }
    const result = await response.json();
    console.log("Booking reconciliation completed.", result);
  } catch (error) {
    console.error("Booking reconciliation invocation failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      message:
        error instanceof Error
          ? error.message.replaceAll(secret, "[redacted]")
          : "Unknown failure",
    });
    process.exitCode = 1;
  }
}
