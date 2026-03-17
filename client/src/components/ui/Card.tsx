import { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface CardProps {
  children: ReactNode;
  variant?: 'glass' | 'raised' | 'gradient-border' | 'solid';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

const paddingMap = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-6',
};

export function Card({
  children,
  variant = 'glass',
  padding = 'md',
  className,
  onClick,
  hover = false,
}: CardProps) {
  const base = 'rounded-2xl transition-all duration-200';

  const variants = {
    glass: 'glass',
    raised: 'glass-raised',
    'gradient-border': 'card-gradient-border',
    solid: '',
  };

  const hoverClass = hover || onClick
    ? 'cursor-pointer hover:-translate-y-1 hover:shadow-card-hover hover:border-glass-borderHover'
    : '';

  return (
    <div
      className={cn(base, variants[variant], paddingMap[padding], hoverClass, className)}
      onClick={onClick}
      style={variant === 'solid' ? {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      } : undefined}
    >
      {children}
    </div>
  );
}