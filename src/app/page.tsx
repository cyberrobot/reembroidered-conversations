import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { AboutShahd } from '@/components/AboutShahd';
import { BookShowcase } from '@/components/BookShowcase';
import { BookingSection } from '@/components/BookingSection';
import { BoundariesSection } from '@/components/BoundariesSection';
import { Experience } from '@/components/Experience';
import { Footer } from '@/components/Footer';
import { HeroVideo } from '@/components/HeroVideo';
import { Navigation } from '@/components/Navigation';
import { ThemeQuestionInterstitial } from '@/components/ThemeQuestionInterstitial';

type SearchParams = Record<string, string | string[] | undefined>;

function isConfirmationEntry(params: SearchParams) {
  const value = (key: string) => {
    const entry = params[key];
    return Array.isArray(entry) ? entry[0] : entry;
  };

  return (
    value('confirmation') === 'true' ||
    value('payment_success') === 'true' ||
    value('success') === 'true' ||
    'session_id' in params ||
    'booking_id' in params ||
    'id' in params
  );
}

function serializeSearchParams(params: SearchParams) {
  const result = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => result.append(key, item));
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }

  return result.toString();
}

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  if (isConfirmationEntry(params)) {
    const query = serializeSearchParams(params);
    redirect(query ? `/confirmation?${query}` : '/confirmation');
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#282524] font-sans selection:bg-[#F2E5D9] selection:text-[#282524] relative paper-grain">
      <aside aria-label="Instant Test Floating Trigger" className="fixed bottom-5 right-5 z-50 print:hidden">
        <Link
          href="/confirmation?payment_success=true&booking_id=RC-78421"
          className="group flex items-center gap-2 bg-[#282524] hover:bg-[#3D3835] text-[#FAF8F5] px-4 py-2.5 rounded-full shadow-lg border border-[#A35048]/40 text-xs font-sans font-medium transition-all duration-200 hover:scale-105 cursor-pointer"
          title="Instant Testing: View Stripe Booking Confirmation Page"
        >
          <span className="w-2 h-2 rounded-full bg-[#A35048] group-hover:animate-ping" />
          <Sparkles className="w-3.5 h-3.5 text-[#E8DFD5]" />
          <span>Test Confirmation Page</span>
        </Link>
      </aside>

      <Navigation />

      <main>
        <HeroVideo />
        <Experience />
        <ThemeQuestionInterstitial />
        <AboutShahd />
        <BookShowcase />
        <BookingSection initialDate={today} />
        <BoundariesSection />
      </main>

      <Footer />
    </div>
  );
}
