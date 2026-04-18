import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  tint?: 'default' | 'red' | 'blue';
}

export function GlassCard({ children, className = '', tint = 'default' }: GlassCardProps) {
  const tintBg = {
    default: 'bg-gansid-surface-container-lowest/70',
    red: 'bg-gansid-primary-container/10',
    blue: 'bg-gansid-secondary/10',
  }[tint];
  return (
    <div className={`glass ${tintBg} rounded-gansid-lg p-6 shadow-invisible-lift backdrop-blur-viscous ${className}`}>
      {children}
    </div>
  );
}
