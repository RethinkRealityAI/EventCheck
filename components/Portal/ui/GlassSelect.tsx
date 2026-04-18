import type { SelectHTMLAttributes } from 'react';

export function GlassSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return (
    <select
      className={`w-full px-4 py-3 rounded-full bg-gansid-surface-container-lowest/60 backdrop-blur-viscous font-body text-gansid-on-surface focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 ${className}`}
      {...rest}
    />
  );
}
