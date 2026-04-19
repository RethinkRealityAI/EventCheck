import { useEffect } from 'react';
import PublicRegistration from '../../PublicRegistration';
import { X } from 'lucide-react';

interface Props {
  formId: string;
  onClose: () => void;
}

/**
 * Full-viewport modal that hosts PublicRegistration inline (no nested router).
 * formId is passed as a prop rather than read from useParams, so the component
 * can live inside the existing HashRouter tree without a MemoryRouter wrapper.
 */
export function RegisterModal({ formId, onClose }: Props) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] portal-root flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="absolute inset-0 bg-gansid-on-surface/50 backdrop-blur-md" aria-hidden="true" />
      {/* Card: fixed height, flex-col. Children control their own scroll. */}
      <div
        className="relative bg-white rounded-gansid-xl shadow-2xl w-full max-w-[1100px] h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close registration"
          className="absolute top-4 right-4 z-20 h-10 w-10 rounded-full bg-white/95 hover:bg-white text-gansid-on-surface flex items-center justify-center shadow-md transition"
        >
          <X className="h-5 w-5" />
        </button>
        <PublicRegistration formId={formId} onComplete={onClose} onSaveAndClose={onClose} />
      </div>
    </div>
  );
}
