import React from 'react';
import type { LandingContent } from '../../types';

export function PricingFeesEditor({
  draft,
  onChange,
}: {
  draft: LandingContent;
  onChange: (d: LandingContent) => void;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
        <p className="text-slate-500">Pricing & Fees editor — coming in the next unit.</p>
      </div>
    </div>
  );
}
