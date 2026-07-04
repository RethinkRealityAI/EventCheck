import React from 'react';
import RichTextEditor from '../../RichTextEditor';

export function RichField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
}) {
  return (
    <div className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <RichTextEditor
        value={value}
        onChange={onChange}
        toolbar={['bold', 'italic', 'underline', 'link', 'list']}
      />
    </div>
  );
}
