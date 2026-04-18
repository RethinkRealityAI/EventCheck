import { useEffect, type ReactNode } from 'react';

interface GlassDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function GlassDialog({ open, onClose, children }: GlassDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 portal-root"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-gansid-on-surface/40 backdrop-blur-md" />
      <div
        className="relative viscous-enter glass rounded-gansid-xl p-8 shadow-invisible-lift max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
