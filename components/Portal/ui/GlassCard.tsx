import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  tint?: 'default' | 'red' | 'blue';
}

export function GlassCard({ children, className = '', tint = 'default' }: GlassCardProps) {
  const tintStyles = {
    default: 'bg-white/80 border-gansid-outline-variant/30',
    red: 'bg-gradient-to-br from-gansid-primary-container/10 to-gansid-primary-container/5 border-gansid-primary-container/20',
    blue: 'bg-gradient-to-br from-gansid-secondary/10 to-gansid-secondary/5 border-gansid-secondary/20',
  }[tint];
  return (
    <div className={`${tintStyles} rounded-gansid-lg p-6 shadow-lg backdrop-blur-sm border ${className}`}>
      {children}
    </div>
  );
}
