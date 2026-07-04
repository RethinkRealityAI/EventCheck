import React from 'react';
import type { PortalContent } from '../../types';

export function PortalEditor({
  draft,
  onChange,
}: {
  draft: PortalContent;
  onChange: (d: PortalContent) => void;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
        <p className="text-slate-500">Portal & Announcements editor — coming in the next unit.</p>
      </div>
    </div>
  );
}
