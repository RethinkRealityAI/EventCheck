import { HeroSection } from './HeroSection';
import { AuthPanel } from './AuthPanel';
import { InfoTabs } from './InfoTabs';

export function Landing() {
  return (
    <div className="portal-root min-h-screen bg-gansid-surface">
      <section className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10">
        <HeroSection />
        <div>
          <AuthPanel />
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-6 py-16">
        <InfoTabs />
      </section>
    </div>
  );
}
