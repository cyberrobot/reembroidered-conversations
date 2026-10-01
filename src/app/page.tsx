import { AboutShahd } from "@/components/AboutShahd";
import { BookShowcase } from "@/components/BookShowcase";
import { BookingSection } from "@/components/BookingSection";
import { BoundariesSection } from "@/components/BoundariesSection";
import { Experience } from "@/components/Experience";
import { Footer } from "@/components/Footer";
import { HeroVideo } from "@/components/HeroVideo";
import { Navigation } from "@/components/Navigation";
import { ThemeQuestionInterstitial } from "@/components/ThemeQuestionInterstitial";
import { LegalModal } from "@/components/LegalModal";
import { InternationalRecognition } from "@/components/InternationalRecognition";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { isValidAnalyticsMeasurementId } from "@/lib/analytics";

type HomeProps = {
  searchParams?: Promise<{ analyticsConfig?: string }>;
};

export default async function Home({ searchParams }: HomeProps = {}) {
  const params = await searchParams;
  const testMalformedAnalytics =
    process.env.BOOKING_MANAGEMENT_VISUAL_FIXTURES === "enabled" &&
    params.analyticsConfig === "malformed";
  const configuredMeasurementId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;
  const measurementId = testMalformedAnalytics
    ? "G-invalid"
    : configuredMeasurementId;
  const analyticsEnabled = isValidAnalyticsMeasurementId(measurementId);
  return (
    <>
      <div
        id="site-content"
        className="min-h-screen bg-[#FAF8F5] text-[#282524] font-sans selection:bg-[#F2E5D9] selection:text-[#282524] relative paper-grain"
      >
        <Navigation />

        <main>
          <HeroVideo />
          <Experience />
          <ThemeQuestionInterstitial />
          <AboutShahd />
          <InternationalRecognition />
          <BookShowcase />
          <BookingSection />
          <BoundariesSection />
        </main>

        <Footer
          analyticsMeasurementId={
            testMalformedAnalytics ? measurementId : undefined
          }
        />
        {analyticsEnabled && <AnalyticsConsent measurementId={measurementId} />}
      </div>
      <LegalModal />
    </>
  );
}
