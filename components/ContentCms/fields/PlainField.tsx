import React from 'react';
import { CmsFieldLabel, cmsInputClass } from '../cmsUi';

export function PlainField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'url' | 'date' | 'datetime-local';
}) {
  return (
    <label className="block">
      <CmsFieldLabel>{label}</CmsFieldLabel>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cmsInputClass}
      />
    </label>
  );
}
