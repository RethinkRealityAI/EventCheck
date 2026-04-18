import type { SelectHTMLAttributes } from 'react';

export function GlassSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return (
    <select
      className={`w-full px-4 py-3 rounded-full bg-white font-body text-gansid-on-surface gradient-border-input transition-all focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 ${className}`}
      {...rest}
    />
  );
}
