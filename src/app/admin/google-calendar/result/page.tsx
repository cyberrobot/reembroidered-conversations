type ResultPageProps = {
  searchParams: Promise<{ status?: string; error?: string }>;
};

const errorMessages: Record<string, string> = {
  authorization_cancelled:
    "Google authorization was cancelled. Please try again.",
  authorization_expired: "Google authorization expired. Please try again.",
  unauthorized_account:
    "Please use the authorized practitioner Google account.",
  missing_refresh_token:
    "Google did not provide offline access. Please try again.",
};

export default async function GoogleCalendarResultPage({
  searchParams,
}: ResultPageProps) {
  const { status, error } = await searchParams;
  const connected = status === "connected";
  const message = connected
    ? "Google Calendar connected successfully."
    : (errorMessages[error ?? ""] ??
      "Google Calendar could not be connected. Please try again.");

  return (
    <main className="min-h-screen bg-[#faf8f5] px-6 py-20 text-[#312a25]">
      <section
        className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm"
        aria-live="polite"
      >
        <h1 className="font-serif text-3xl">
          {connected ? "Connection complete" : "Connection unsuccessful"}
        </h1>
        <p className="mt-4 text-base leading-7">{message}</p>
      </section>
    </main>
  );
}
