import React, { useRef, useState } from 'react';
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { uploadAnnouncementImage } from '../../../services/announcementService';
import { CmsButton, CmsFieldLabel } from '../cmsUi';

export function ImageUploadField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    const url = await uploadAnnouncementImage(file);
    setUploading(false);
    if (url) onChange(url);
  };

  return (
    <div>
      <CmsFieldLabel hint={hint}>{label}</CmsFieldLabel>
      {value ? (
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-slate-50">
          <img src={value} alt="" className="max-h-48 w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex gap-2 p-3 bg-gradient-to-t from-black/50 to-transparent">
            <CmsButton variant="secondary" className="!py-2 !px-3 text-xs" onClick={() => inputRef.current?.click()}>
              Replace
            </CmsButton>
            <CmsButton variant="danger" className="!py-2 !px-3 text-xs" onClick={() => onChange(null)}>
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </CmsButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center transition hover:border-[#2260a1]/40 hover:bg-[#2260a1]/5 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-[#2260a1]" />
          ) : (
            <>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 text-[#2260a1]">
                <ImageIcon className="h-6 w-6" />
              </span>
              <span className="font-semibold text-sm text-slate-700">Upload an image</span>
              <span className="text-xs text-slate-400">PNG, JPG or WebP · stored in portal-assets</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
