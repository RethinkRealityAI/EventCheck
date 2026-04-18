import { HeroSection } from './HeroSection';
import { AuthPanel } from './AuthPanel';
import { InfoTabs } from './InfoTabs';

export function Landing() {
  return (
    <div className="portal-root min-h-screen relative overflow-hidden">
      {/* Viscous background — colorful but soft */}
      <div className="absolute inset-0 bg-gradient-to-br from-gansid-primary-container/20 via-white to-gansid-secondary/15 -z-10" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-gansid-primary/10 blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-gansid-secondary/10 blur-3xl -z-10" />

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
