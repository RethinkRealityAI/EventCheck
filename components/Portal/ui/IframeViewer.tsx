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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-[90vw] h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="font-display font-semibold truncate">{title || url}</span>
          <div className="flex items-center gap-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-gansid-secondary inline-flex items-center gap-1"><ExternalLink className="w-4 h-4" /> Open in new tab</a>
            <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {blocked ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div><p className="mb-3">This page can't be embedded here.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded bg-gansid-primary-gradient text-white inline-flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Open in new tab</a></div>
          </div>
        ) : (
          <iframe src={url} title={title || 'preview'} className="flex-1 w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" onError={() => setBlocked(true)} />
        )}
      </div>
    </div>,
    document.body,
  );
}
