import { cn } from '../../utils/cn';
import { ReactNode } from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode; 
  variant?: 'default' | 'glass' | 'outline';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  variant = 'glass',
  padding = 'md',
  className,
  ...props
}: CardProps) {
  const variants = {
    default: 'bg-white/5 border border-white/10',
    glass: 'bg-white/10 backdrop-blur-lg border border-white/20',
    outline: 'bg-transparent border border-purple-500/30',
  };

  const paddings = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={cn(
        'rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl',
        variants[variant],
        paddings[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}