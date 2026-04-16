import React from 'react';
import { X } from 'lucide-react';

interface Props {
  name: string;
  email: string;
  onChange: (patch: { name?: string; email?: string }) => void;
  onRemove: () => void;
}

export default function ExhibitorStaffRow({ name, email, onChange, onRemove }: Props) {
  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        placeholder="Full name"
        value={name}
        onChange={e => onChange({ name: e.target.value })}
        className="flex-1 border rounded px-2 py-1 text-sm"
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => onChange({ email: e.target.value })}
        className="flex-1 border rounded px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 hover:bg-red-50 rounded text-red-600"
        title="Remove"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
