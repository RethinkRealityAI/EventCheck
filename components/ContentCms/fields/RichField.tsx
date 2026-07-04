import React from 'react';
import RichTextEditor from '../../RichTextEditor';
import { CmsFieldLabel } from '../cmsUi';

export function RichField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  hint?: string;
}) {
  return (
    <div className="block">
      <CmsFieldLabel hint={hint}>{label}</CmsFieldLabel>
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden ring-1 ring-slate-100 focus-within:ring-2 focus-within:ring-[#2260a1]/25">
        <RichTextEditor
          value={value}
          onChange={onChange}
          toolbar={['bold', 'italic', 'underline', 'link', 'list']}
        />
      </div>
    </div>
  );
}
