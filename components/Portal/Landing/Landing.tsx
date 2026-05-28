import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeroSection } from './HeroSection';
import { AuthPanel } from './AuthPanel';
import { InfoTabs } from './InfoTabs';
import { FeesSection } from './FeesSection';
import { RegistrationOverview } from './RegistrationOverview';
import { useAuth } from '../../AuthContext';
import { AuthNoticeBanner } from '../../AuthNoticeBanner';

export function Landing() {
  const navigate = useNavigate();
  const { user, loading: authLoading, authNotice } = useAuth();

  // Verified users on the public home page → portal. Skip when showing an auth
  // error (expired link) so they can use Sign In + resend on the landing panel.
  useEffect(() => {
    if (authLoading || authNotice || !user?.email_confirmed_at) return;
    navigate('/portal', { replace: true });
  }, [authLoading, authNotice, user, navigate]);

  return (
    <div className="portal-root min-h-screen relative overflow-hidden">
      <AuthNoticeBanner />
      {/* Viscous background — tri-color glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-gansid-primary-container/15 via-white to-gansid-secondary/15 -z-10" />
      <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-gansid-gradient-radial opacity-15 blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-gansid-gradient-swirl opacity-10 blur-3xl -z-10" />

      <section className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10 relative">
        <HeroSection />
        <div className="hidden lg:block" data-register-target>
          <AuthPanel />
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-1.5 sm:px-6 pt-8 pb-4 relative">
        <FeesSection />
      </section>
      <section className="max-w-7xl mx-auto px-6 pt-8 pb-2 relative">
        <RegistrationOverview />
      </section>
      <section className="max-w-7xl mx-auto px-6 py-10 relative">
        <InfoTabs />
      </section>
      <section
        className="lg:hidden max-w-md mx-auto px-2 pt-4 pb-16 relative scroll-mt-8"
        data-register-target
        id="register"
      >
        <AuthPanel />
      </section>
    </div>
  );
}
