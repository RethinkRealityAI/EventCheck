import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../AuthContext';
import { SponsorExhibitorHero } from './SponsorExhibitorHero';
import { SponsorExhibitorAuthPanel } from './SponsorExhibitorAuthPanel';
import { SponsorExhibitorInstructions } from './SponsorExhibitorInstructions';

/**
 * Public landing page for sponsors and exhibitors. Mirrors the layout of the
 * attendee landing page but replaces the attendee-focused copy and removes the
 * Congress-fees / pricing-tier display. After signup or sign-in, the embedded
 * AuthPanel routes the user directly to the tenant's `sponsor_exhibitor` form.
 *
 * The combined sponsor_exhibitor form ID is resolved at mount-time by querying
 * `forms.form_type = 'sponsor_exhibitor'` (status='active'). There is exactly
 * one such form per tenant. If none is found we still render the landing page,
 * but the auth panel falls back to landing the user in the portal instead of a
 * dead form route.
 */
export function SponsorExhibitorLandingPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [formId, setFormId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('forms')
        .select('id')
        .eq('form_type', 'sponsor_exhibitor')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setLookupError(error.message);
      } else {
        setFormId((data as { id?: string } | null)?.id ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Post-confirmation auto-redirect: if the user is already signed in (e.g.
  // they just clicked the email-confirmation link from Supabase and landed
  // back here), send them straight to the sponsor_exhibitor form. The
  // confirmation link uses this page as a stable landing target precisely so
  // we can route them in one place — see SponsorExhibitorAuthPanel's
  // postAuthRedirect. Without this effect, users land on this page after
  // verifying email and see the signin tab, which is confusing because
  // they're already authenticated.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!formId) return;
    navigate(`/form/${formId}`, { replace: true });
  }, [authLoading, user, formId, navigate]);

  return (
    <div className="portal-root min-h-screen relative overflow-hidden">
      {/* Same tri-color glow as the attendee landing for visual continuity. */}
      <div className="absolute inset-0 bg-gradient-to-br from-gansid-primary-container/15 via-white to-gansid-secondary/15 -z-10" />
      <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-gansid-gradient-radial opacity-15 blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-gansid-gradient-swirl opacity-10 blur-3xl -z-10" />

      <section className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10 relative">
        <SponsorExhibitorHero />
        <div className="hidden lg:block">
          {loading || (!authLoading && user && formId) ? (
            <div className="w-full max-w-lg flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-gansid-primary animate-spin" />
            </div>
          ) : !authLoading && user && !formId ? (
            // Signed-in user, but no sponsor_exhibitor form is configured for
            // this tenant. The auth panel would be useless to them (they're
            // already authenticated), so show an explicit message instead of
            // leaving them stranded.
            <div className="w-full max-w-lg rounded-gansid-lg px-6 py-8 shadow-2xl gradient-border bg-white/80 backdrop-blur-viscous space-y-3">
              <h3 className="font-display text-xl font-semibold">You're signed in</h3>
              <p className="font-body text-sm text-gansid-on-surface/75">
                The sponsor &amp; exhibitor registration form isn't currently available for this site. Please
                check back soon or contact the event organizers if you were expecting it.
              </p>
              <a
                href="#/portal"
                className="inline-block text-sm font-display font-semibold text-gansid-secondary hover:underline"
              >
                Go to your portal →
              </a>
            </div>
          ) : (
            <SponsorExhibitorAuthPanel sponsorExhibitorFormId={formId} />
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pt-2 pb-12 relative">
        <SponsorExhibitorInstructions />
      </section>

      {lookupError && (
        <section className="max-w-3xl mx-auto px-6 pb-6 relative">
          <div className="rounded-gansid-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 font-body">
            Could not load the sponsor &amp; exhibitor form: {lookupError}. You can still create an account below;
            we'll route you to the form once it’s available.
          </div>
        </section>
      )}

      <section
        className="lg:hidden max-w-md mx-auto px-2 pt-4 pb-16 relative scroll-mt-8"
        id="register"
      >
        {loading || (!authLoading && user && formId) ? (
          <div className="w-full flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-gansid-primary animate-spin" />
          </div>
        ) : !authLoading && user && !formId ? (
          <div className="w-full rounded-gansid-lg px-6 py-8 shadow-2xl gradient-border bg-white/80 backdrop-blur-viscous space-y-3">
            <h3 className="font-display text-xl font-semibold">You're signed in</h3>
            <p className="font-body text-sm text-gansid-on-surface/75">
              The sponsor &amp; exhibitor registration form isn't currently available for this site. Please
              check back soon or contact the event organizers.
            </p>
            <a href="#/portal" className="inline-block text-sm font-display font-semibold text-gansid-secondary hover:underline">
              Go to your portal →
            </a>
          </div>
        ) : (
          <SponsorExhibitorAuthPanel sponsorExhibitorFormId={formId} />
        )}
      </section>
    </div>
  );
}
