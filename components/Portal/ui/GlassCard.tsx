import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  tint?: 'default' | 'red' | 'blue';
}

export function GlassCard({ children, className = '', tint = 'default' }: GlassCardProps) {
  if (tint === 'default') {
    return (
      <div className={`gradient-border rounded-gansid-lg p-6 shadow-lg ${className}`}>
        {children}
      </div>
    );
  }
  const tintStyles = {
    red: 'bg-gradient-to-br from-gansid-primary-container/10 to-gansid-primary-container/5 border border-gansid-primary-container/20',
    blue: 'bg-gradient-to-br from-gansid-secondary/10 to-gansid-secondary/5 border border-gansid-secondary/20',
  }[tint];
  return (
    <div className={`${tintStyles} rounded-gansid-lg p-6 shadow-lg backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}
