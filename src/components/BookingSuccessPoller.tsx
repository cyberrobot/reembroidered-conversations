'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_TIME_MS = 60_000;

export function BookingSuccessPoller({ active }: { active: boolean }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!active) return;
    setTimedOut(false);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      if (Date.now() - startedAt >= MAX_POLL_TIME_MS) {
        window.clearInterval(interval);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [active, router]);

  if (!active || !timedOut) return null;
  return (
    <div className="mt-7 text-center">
      <p className="text-sm leading-relaxed text-[#68635F]">This is taking a little longer than usual. Your current status is still shown above.</p>
      <button type="button" onClick={() => router.refresh()} className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#CDBFB2] bg-white px-5 py-2.5 text-sm font-medium text-[#282524] outline-none transition hover:bg-[#FAF8F5] focus-visible:ring-2 focus-visible:ring-[#A35048] focus-visible:ring-offset-2">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />Check again
      </button>
    </div>
  );
}
