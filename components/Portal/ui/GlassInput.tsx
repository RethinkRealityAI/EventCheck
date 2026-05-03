import type { InputHTMLAttributes } from 'react';

export function GlassInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      className={`w-full px-5 py-3.5 rounded-full bg-white text-base font-body text-gansid-on-surface placeholder:text-gansid-on-surface/40 gradient-border-input transition-all focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 ${className}`}
      {...rest}
    />
  );
}
