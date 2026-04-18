import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface ConsentCheckboxProps {
  id: string;
  label: string;
  linkText: string;
  modalTitle: string;
  modalUrl: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
}

export default function ConsentCheckbox({
  id, label, linkText, modalTitle, modalUrl, checked, onChange, required,
}: ConsentCheckboxProps) {
  const [hasSeenModal, setHasSeenModal] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [content, setContent] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openModal = async (e: React.MouseEvent) => {
    e.preventDefault();
    setModalOpen(true);
    if (!content && !loading) {
      setLoading(true);
      try {
        const res = await fetch(modalUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        setContent(text);
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setHasSeenModal(true);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  return (
    <>
      <label htmlFor={id} className="flex items-start gap-2 text-sm text-slate-700">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5"
          checked={checked}
          disabled={!hasSeenModal}
          onChange={e => onChange(e.target.checked)}
          required={required}
        />
        <span>
          {label}{' '}
          <button
            type="button"
            onClick={openModal}
            className="underline text-indigo-700 hover:text-indigo-900 font-medium"
          >
            {linkText}
          </button>
          {required && <span className="text-red-500"> *</span>}
          {!hasSeenModal && (
            <span className="ml-1 text-xs text-slate-400 italic">
              (please open the document before accepting)
            </span>
          )}
        </span>
      </label>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-gansid-xl max-w-3xl w-full shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gansid-primary-gradient px-6 py-5 flex items-center justify-between">
              <h2 className="text-xl font-display font-bold text-white">{modalTitle}</h2>
              <button
                onClick={closeModal}
                aria-label="Close"
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 bg-gansid-surface-container-lowest">
              {loading && <div className="text-slate-400 font-body">Loading…</div>}
              {loadError && <div className="text-gansid-primary text-sm font-body">Failed to load: {loadError}</div>}
              {!loading && !loadError && (
                <pre className="whitespace-pre-wrap font-body text-sm text-gansid-on-surface leading-relaxed">
                  {content}
                </pre>
              )}
            </div>
            <div className="bg-gansid-primary-gradient px-6 py-4 flex justify-end">
              <button
                onClick={closeModal}
                className="px-6 py-2.5 rounded-full bg-white text-gansid-primary font-display font-bold shadow-md hover:scale-[1.02] transition-all"
              >
                I've Read This
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
