import type { InputHTMLAttributes } from 'react';

export function GlassInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      className={`w-full px-4 py-3 rounded-full bg-gansid-surface-container-lowest/60 backdrop-blur-viscous font-body text-gansid-on-surface placeholder:text-gansid-on-surface/40 focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 ${className}`}
      {...rest}
    />
  );
}
