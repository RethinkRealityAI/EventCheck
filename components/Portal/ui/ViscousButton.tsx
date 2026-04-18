import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ViscousButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: ReactNode;
}

export function ViscousButton({ variant = 'primary', className = '', children, ...rest }: ViscousButtonProps) {
  const base = 'rounded-full px-6 py-3 font-display font-semibold transition-all duration-300 ease-viscous disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = variant === 'primary'
    ? 'bg-gansid-primary-gradient text-white hover:scale-[1.02] shadow-invisible-lift'
    : 'bg-gansid-surface-container-lowest/40 backdrop-blur-viscous text-gansid-secondary hover:bg-gansid-surface-container-lowest/60';
  return <button className={`${base} ${styles} ${className}`} {...rest}>{children}</button>;
}
