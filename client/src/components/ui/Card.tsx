import { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface CardProps {
  children: ReactNode;
  variant?: 'glass' | 'raised' | 'gradient-border';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

const paddingMap = {
  none: '',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-10', // 2026 spacing: more breathing room
  xl:   'p-14',
};

export function Card({
  children,
  variant = 'glass',
  padding = 'md',
  className,
  onClick,
  hover = false,
}: CardProps) {
  
  const baseClasses = 'rounded-[2rem] transition-all duration-500 border-glass overflow-hidden relative';

  const variantClasses = {
    glass: 'glass bg-surface-base/40',
    raised: 'glass-raised shadow-glow-purple/5',
    'gradient-border': 'card-gradient-border bg-surface-base',
  };

  // Modern interaction: slight lift and border glow
  const interactionClasses = hover || onClick
    ? 'cursor-pointer hover:-translate-y-2 hover:border-brand-primary/40 hover:shadow-card-hover'
    : '';

  return (
    <div
      className={cn(
        baseClasses, 
        variantClasses[variant], 
        paddingMap[padding], 
        interactionClasses, 
        className
      )}
      onClick={onClick}
    >
      {/* Optional: Add a subtle inner glow effect for that premium 2026 look */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}