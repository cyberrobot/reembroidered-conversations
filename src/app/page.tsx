import { AboutShahd } from '@/components/AboutShahd';
import { BookShowcase } from '@/components/BookShowcase';
import { BookingSection } from '@/components/BookingSection';
import { BoundariesSection } from '@/components/BoundariesSection';
import { Experience } from '@/components/Experience';
import { Footer } from '@/components/Footer';
import { HeroVideo } from '@/components/HeroVideo';
import { Navigation } from '@/components/Navigation';
import { ThemeQuestionInterstitial } from '@/components/ThemeQuestionInterstitial';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#282524] font-sans selection:bg-[#F2E5D9] selection:text-[#282524] relative paper-grain">
      <Navigation />

      <main>
        <HeroVideo />
        <Experience />
        <ThemeQuestionInterstitial />
        <AboutShahd />
        <BookShowcase />
        <BookingSection />
        <BoundariesSection />
      </main>

      <Footer />
    </div>
  );
}
