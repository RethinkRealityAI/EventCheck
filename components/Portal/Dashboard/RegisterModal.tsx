import { useEffect } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PublicRegistration from '../../PublicRegistration';
import { X } from 'lucide-react';

interface Props {
  formId: string;
  onClose: () => void;
}

/**
 * Full-viewport modal that hosts PublicRegistration for the given form id
 * without navigating away from the portal dashboard. Uses a nested
 * MemoryRouter so PublicRegistration's `useParams` resolves `formId`
 * to the id we pass in, isolated from the outer React Router.
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
    <div className="fixed inset-0 z-[90] portal-root" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gansid-on-surface/50 backdrop-blur-md" onClick={onClose} />
      <div className="relative h-full flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
        <div
          className="relative bg-white rounded-gansid-xl shadow-2xl w-full max-w-6xl my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close registration"
            className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/90 hover:bg-white text-gansid-on-surface flex items-center justify-center shadow-md transition"
          >
            <X className="h-5 w-5" />
          </button>
          <MemoryRouter initialEntries={[`/form/${formId}`]}>
            <Routes>
              <Route path="/form/:formId" element={<PublicRegistration />} />
            </Routes>
          </MemoryRouter>
        </div>
      </div>
    </div>
  );
}
