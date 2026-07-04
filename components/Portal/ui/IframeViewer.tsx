import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';

export function IframeViewer({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      {/* Near-full-viewport: fill the screen inset by a small even margin so the
          embedded content gets essentially all the space. inset-2 ≈ 8px all
          round. Portaled to document.body; Esc + backdrop close preserved. */}
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
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div><p className="mb-3">This page can't be embedded here.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded bg-gansid-primary-gradient px-4 py-2 text-white"><ExternalLink className="h-4 w-4" /> Open in new tab</a></div>
          </div>
        ) : (
          <iframe src={url} title={title || 'preview'} className="min-h-0 w-full flex-1 border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" onError={() => setBlocked(true)} />
        )}
      </div>
    </div>,
    document.body,
  );
}
