import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ViscousButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: ReactNode;
}

export function ViscousButton({ variant = 'primary', className = '', children, ...rest }: ViscousButtonProps) {
  const base = 'rounded-full px-6 py-3 font-display font-semibold transition-all duration-300 ease-viscous disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = variant === 'primary'
    ? 'bg-gradient-to-r from-gansid-primary to-gansid-primary-container text-white hover:from-gansid-primary-container hover:to-gansid-primary hover:scale-[1.02] shadow-lg'
    : 'bg-white/80 border border-gansid-outline-variant/30 text-gansid-secondary hover:bg-white';
  return <button className={`${base} ${styles} ${className}`} {...rest}>{children}</button>;
}
