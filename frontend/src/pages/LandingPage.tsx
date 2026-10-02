import { PublicLayout } from "../layouts/PublicLayout";
import { Hero } from "../components/landing/Hero";
import { ProblemSection } from "../components/landing/ProblemSection";
import { SolutionSection } from "../components/landing/SolutionSection";
import { HowItWorksSection } from "../components/landing/HowItWorksSection";
import { WhySection } from "../components/landing/WhySection";

export function LandingPage() {
  return (
    <PublicLayout>
      <Hero />
      <ProblemSection />
      <SolutionSection />
      <HowItWorksSection />
      <WhySection />
    </PublicLayout>
  );
}
