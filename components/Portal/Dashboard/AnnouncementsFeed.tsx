import { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink, Megaphone } from 'lucide-react';
import { listActiveAnnouncements } from '../../../services/announcementService';
import { CURRENT_SITE } from '../../../config/sites';
import type { Announcement } from '../../../types';
import { IframeViewer } from '../ui/IframeViewer';

/** Fallback brand gradient (CSS) when an announcement has no custom accent. */
const BRAND_GRADIENT = 'linear-gradient(135deg,#ba0028 0%,#E0243C 60%,#2260a1 100%)';

/** Resolve the accent paint for an announcement — solid custom colour if the
 *  row carries one, else the GANSID brand gradient. Used for the left rail
 *  and the CTA button so the card feels intentionally branded. */
function accentPaint(a: Announcement): string {
  return a.accentColor ? a.accentColor : BRAND_GRADIENT;
}

function AnnouncementCard({
  a,
  onOpenIframe,
}: {
  a: Announcement;
  onOpenIframe: (a: Announcement) => void;
}) {
  const paint = accentPaint(a);
  const hasCta = a.ctaMode && a.ctaMode !== 'none' && a.ctaUrl && a.ctaLabel;

  return (
    <article className="group relative overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_-16px_rgba(26,28,28,0.28)] ring-1 ring-black/[0.04] transition-shadow duration-300 hover:shadow-[0_18px_44px_-16px_rgba(26,28,28,0.34)]">
      {/* Gradient accent rail down the left edge */}
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: paint }} aria-hidden />

      {a.imageUrl && (
        <div className="overflow-hidden">
          <img
            src={a.imageUrl}
            alt=""
            className="h-52 w-full object-cover transition-transform duration-500 ease-viscous group-hover:scale-[1.03]"
          />
        </div>
      )}

      <div className="p-5 pl-6 sm:p-6 sm:pl-7">
        <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-gansid-primary-gradient px-3.5 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-white shadow-[0_6px_16px_-8px_rgba(186,0,40,0.55)] ring-1 ring-white/15">
          <Megaphone className="h-3.5 w-3.5 text-white" />
          {new Date(a.publishedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
        <h3 className="font-display text-lg font-bold leading-snug text-gansid-on-surface sm:text-xl">
          {a.title}
        </h3>
        {a.body && (
          <p className="mt-2 whitespace-pre-wrap font-body text-[15px] leading-relaxed text-gansid-on-surface/70">
            {a.body}
          </p>
        )}

        {hasCta && (
          <div className="mt-4">
            {a.ctaMode === 'iframe' ? (
              <button
                type="button"
                onClick={() => onOpenIframe(a)}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-display text-sm font-bold text-white shadow-md transition-transform duration-300 ease-viscous hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/50"
                style={{ background: paint }}
              >
                {a.ctaLabel}
                <ArrowUpRight className="h-4 w-4" />
              </button>
            ) : (
              <a
                href={a.ctaUrl!}
                target="_top"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-display text-sm font-bold text-white shadow-md transition-transform duration-300 ease-viscous hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/50"
                style={{ background: paint }}
              >
                {a.ctaLabel}
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function AnnouncementsFeed() {
  const site = CURRENT_SITE.key;
  const [items, setItems] = useState<Announcement[]>([]);
  const [iframeItem, setIframeItem] = useState<Announcement | null>(null);

  useEffect(() => {
    listActiveAnnouncements(site, 3).then(setItems);
  }, [site]);

  return (
    <section aria-labelledby="announcements-heading">
      <div className="mb-4 flex items-center gap-3">
        <h2 id="announcements-heading" className="font-display text-2xl font-bold text-gansid-on-surface">
          Announcements
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-gansid-outline-variant/50 to-transparent" aria-hidden />
      </div>

      {items.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl bg-white p-8 text-center shadow-[0_12px_32px_-16px_rgba(26,28,28,0.22)] ring-1 ring-black/[0.04]">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gansid-primary-gradient" aria-hidden />
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-gansid-surface-container-low text-gansid-on-surface/40">
            <Megaphone className="h-6 w-6" />
          </div>
          <p className="font-display font-semibold text-gansid-on-surface/80">No announcements yet</p>
          <p className="mt-1 font-body text-sm text-gansid-on-surface/55">
            Check back soon for Congress updates.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <AnnouncementCard key={a.id} a={a} onOpenIframe={setIframeItem} />
          ))}
        </div>
      )}

      {iframeItem?.ctaUrl && (
        <IframeViewer
          url={iframeItem.ctaUrl}
          title={iframeItem.ctaLabel ?? iframeItem.title}
          onClose={() => setIframeItem(null)}
        />
      )}
    </section>
  );
}
