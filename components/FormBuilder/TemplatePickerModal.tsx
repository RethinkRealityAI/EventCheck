import React from 'react';
import { X } from 'lucide-react';
import { availableTemplatesForSite, type FormTemplate } from '../../config/formTemplates';
import { CURRENT_SITE } from '../../config/sites';

interface Props {
  onPick: (t: FormTemplate) => void;
  onClose: () => void;
}

export default function TemplatePickerModal({ onPick, onClose }: Props) {
  const templates = availableTemplatesForSite(CURRENT_SITE.key);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-xl font-semibold">Choose a template to start from</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {templates.map(t => (
            <button key={t.key} onClick={() => onPick(t)}
              className="text-left border rounded-xl p-4 hover:border-indigo-500 hover:bg-indigo-50/50 transition">
              <div className="font-semibold">{t.displayName}</div>
              <div className="text-sm text-slate-500 mt-1">{t.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
