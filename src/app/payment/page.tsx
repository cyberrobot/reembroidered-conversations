import Link from 'next/link';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function PaymentReturn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const bookingId = typeof params.booking_id === 'string' ? params.booking_id : '';
  const booking = /^[0-9a-f-]{36}$/i.test(bookingId)
    ? await db.booking.findUnique({ where: { id: bookingId }, select: { status: true } })
    : null;
  const paid = booking?.status === 'PAID' || booking?.status === 'CONFIRMED';

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-6 py-24 text-[#282524] paper-grain">
      <section className="mx-auto max-w-xl rounded-3xl border border-[#E8DFD5] bg-[#FDFCFB] p-8 text-center shadow-sm sm:p-12">
        <p className="text-xs font-medium uppercase tracking-widest text-[#A35048]">Secure payment</p>
        <h1 className="mt-3 font-serif text-4xl">{paid ? 'Payment received.' : 'Payment is being processed.'}</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#68635F]">
          {paid
            ? 'Your booking is being finalised. Calendar and meeting details will follow once they are ready.'
            : 'We are waiting for secure confirmation from Stripe. This page does not confirm your booking yet.'}
        </p>
        <Link href="/" className="mt-8 inline-flex rounded-full bg-[#A35048] px-6 py-3 text-sm font-medium text-white">
          Return to Re-Embroidered
        </Link>
      </section>
    </main>
  );
}
