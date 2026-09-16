'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function BookingReference({ bookingId }: { bookingId: string }) {
  const [copied, setCopied] = useState(false);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(bookingId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto mt-5 flex max-w-full flex-wrap items-center justify-center gap-2 text-xs">
      <span className="min-w-0 rounded-lg border border-[#E8DFD5] bg-[#FAF8F5] px-3 py-2 text-[#68635F]">
        Booking reference:{' '}
        <span className="break-all font-mono font-medium text-[#282524]">{bookingId}</span>
      </span>
      <button
        type="button"
        onClick={copyReference}
        aria-label="Copy booking reference"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8DFD5] bg-[#FAF8F5] px-3 py-2 font-medium text-[#A35048] outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-[#A35048] focus-visible:ring-offset-2"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Booking reference copied.' : ''}</span>
    </div>
  );
}
