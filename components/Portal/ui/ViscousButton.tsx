import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ViscousButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: ReactNode;
}

export function ViscousButton({ variant = 'primary', className = '', children, ...rest }: ViscousButtonProps) {
  const base = 'rounded-full px-7 py-3.5 text-lg font-display font-semibold transition-all duration-300 ease-viscous disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = variant === 'primary'
    ? 'bg-gansid-primary-gradient text-white hover:scale-[1.02] hover:shadow-xl shadow-lg'
    : 'bg-white/80 border border-gansid-outline-variant/30 text-gansid-secondary hover:bg-white';
  return <button className={`${base} ${styles} ${className}`} {...rest}>{children}</button>;
}
