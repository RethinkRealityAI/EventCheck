import React from 'react';
import type { DateBracket } from '../../types';

export default function PricingBracketBanner({ bracket }: { bracket: DateBracket | null }) {
  if (!bracket) return null;
  return (
    <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-900 text-xs font-medium border border-indigo-100">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
      {bracket.name} pricing — ends {bracket.endDate}
    </div>
  );
}
