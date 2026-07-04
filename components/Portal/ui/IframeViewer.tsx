import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Loader2 } from 'lucide-react';

/** Admin-curated external embeds (Program, Venue, announcement CTAs). */
const IFRAME_VIEWER_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  // Framer/PDF CTAs often open the file in a new tab — without this the popup
  // inherits the sandbox and the browser blocks the download ("blocked by client").
  'allow-popups-to-escape-sandbox',
  'allow-downloads',
].join(' ');

export function IframeViewer({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    loadedRef.current = false;
    setLoading(true);
    setBlocked(false);
    const t = window.setTimeout(() => {
      if (!loadedRef.current) setBlocked(true);
    }, 8000);
    return () => window.clearTimeout(t);
  }, [url]);

  const handleLoad = () => {
    loadedRef.current = true;
    setLoading(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute inset-2 flex flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10 sm:inset-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-3 py-2 sm:px-4">
          <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-gansid-on-surface sm:text-base">{title || url}</span>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gansid-secondary hover:underline sm:text-sm"><ExternalLink className="h-4 w-4" /><span className="hidden sm:inline">Open in new tab</span><span className="sm:hidden">Open</span></a>
            <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-gansid-on-surface/60 transition-colors hover:bg-black/[0.05] hover:text-gansid-on-surface"><X className="h-5 w-5" /></button>
          </div>
        </div>
        {blocked ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <p className="mb-2 font-display font-semibold text-gansid-on-surface">This page can&apos;t be embedded here</p>
            <p className="mb-5 text-sm text-gansid-on-surface/60 max-w-md">The site may block iframes. Open it in a new tab instead.</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-gansid-primary-gradient px-5 py-2.5 font-display text-sm font-bold text-white shadow-lg"><ExternalLink className="h-4 w-4" /> Open in new tab</a>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                <Loader2 className="h-8 w-8 animate-spin text-gansid-secondary" />
              </div>
            )}
            <iframe
              src={url}
              title={title || 'preview'}
              className="min-h-0 h-full w-full border-0"
              sandbox={IFRAME_VIEWER_SANDBOX}
              onLoad={handleLoad}
              onError={() => setBlocked(true)}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
