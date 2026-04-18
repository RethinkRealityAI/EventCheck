import { HeroSection } from './HeroSection';
import { AuthPanel } from './AuthPanel';
import { InfoTabs } from './InfoTabs';

export function Landing() {
  return (
    <div className="portal-root min-h-screen relative overflow-hidden">
      {/* Viscous background — tri-color glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-gansid-primary-container/15 via-white to-gansid-secondary/15 -z-10" />
      <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-gansid-gradient-radial opacity-15 blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-gansid-gradient-swirl opacity-10 blur-3xl -z-10" />

      <section className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10 relative">
        <HeroSection />
        <div>
          <AuthPanel />
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-6 py-16 relative">
        <InfoTabs />
      </section>
    </div>
  );
}
