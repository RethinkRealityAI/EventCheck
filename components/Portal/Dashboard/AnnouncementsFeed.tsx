import { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink, Megaphone } from 'lucide-react';
import { listActiveAnnouncements } from '../../../services/announcementService';
import { CURRENT_SITE } from '../../../config/sites';
import type { Announcement } from '../../../types';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import { IframeViewer } from '../ui/IframeViewer';

const BRAND_GRADIENT = 'linear-gradient(135deg,#ba0028 0%,#E0243C 60%,#2260a1 100%)';

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
  const isBanner = a.style === 'banner';

  const ctaButton =
    hasCta &&
    (a.ctaMode === 'iframe' ? (
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
    ));

  if (isBanner) {
    return (
      <article className="group relative overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_-16px_rgba(26,28,28,0.28)] ring-1 ring-black/[0.04]">
        <div
          className="relative px-6 py-8 sm:px-8 sm:py-10 text-white"
          style={{
            background: a.imageUrl
              ? `linear-gradient(135deg, rgba(15,51,95,0.92) 0%, rgba(186,0,40,0.88) 100%), url(${a.imageUrl}) center/cover`
              : paint,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" aria-hidden />
          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-display text-[11px] font-bold uppercase tracking-wide ring-1 ring-white/20">
              <Megaphone className="h-3.5 w-3.5" />
              {new Date(a.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <h3 className="font-display text-2xl sm:text-3xl font-bold leading-tight">{a.title}</h3>
          </div>
        </div>
        {(a.body || hasCta) && (
          <div className="p-5 sm:p-6">
            {a.body && (
              <div
                className="font-body text-[15px] leading-relaxed text-gansid-on-surface/75 [&_p]:mb-2 [&_a]:text-gansid-secondary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.body) }}
              />
            )}
            {hasCta && <div className="mt-4">{ctaButton}</div>}
          </div>
        )}
      </article>
    );
  }

  return (
    <article className="group relative overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_-16px_rgba(26,28,28,0.28)] ring-1 ring-black/[0.04] transition-shadow duration-300 hover:shadow-[0_18px_44px_-16px_rgba(26,28,28,0.34)]">
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
          <div
            className="mt-2 font-body text-[15px] leading-relaxed text-gansid-on-surface/70 [&_p]:mb-2 [&_a]:text-gansid-secondary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.body) }}
          />
        )}

        {hasCta && <div className="mt-4">{ctaButton}</div>}
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
