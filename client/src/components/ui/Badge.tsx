import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'purple' | 'default';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon: Icon,
  className = '',
  dot = false,
}) => {
  const baseStyles = 'badge';
  
  const variants = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    purple: 'badge-purple',
    default: 'bg-slate-700/50 text-slate-300 border border-slate-600',
  };

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-3 py-1',
    lg: 'text-sm px-4 py-1.5',
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </span>
  );
};