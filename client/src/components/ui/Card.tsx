import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'glass' | 'glass-strong' | 'glass-dark' | 'solid';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'glass',
  hover = false,
  padding = 'md',
}) => {
  const baseStyles = 'rounded-2xl';
  
  const variants = {
    glass: 'glass',
    'glass-strong': 'glass-strong',
    'glass-dark': 'glass-dark',
    solid: 'bg-slate-800 border border-slate-700 shadow-xl',
  };

  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const hoverStyles = hover ? 'hover:scale-[1.02] hover:shadow-2xl transition-all duration-300 cursor-pointer' : '';

  return (
    <div className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${hoverStyles} ${className}`}>
      {children}
    </div>
  );
};

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'text-emerald-400',
  action,
}) => {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-3">
        {Icon && <Icon className={`w-6 h-6 ${iconColor}`} />}
        <div>
          <h3 className="text-xl font-bold text-white">{title}</h3>
          {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

export interface CardStatProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: string;
  trend?: {
    value: string;
    positive: boolean;
  };
  description?: string;
}

export const CardStat: React.FC<CardStatProps> = ({
  label,
  value,
  icon: Icon,
  iconColor = 'text-emerald-400',
  trend,
  description,
}) => {
  return (
    <Card variant="glass">
      <div className="flex items-center justify-between mb-4">
        {Icon && <Icon className={`w-8 h-8 ${iconColor}`} />}
        {trend && (
          <span className={`text-sm font-semibold ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend.value}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-slate-400 text-sm">{label}</p>
        <p className="text-3xl font-bold text-white">{value}</p>
        {description && <p className="text-xs text-slate-500 mt-2">{description}</p>}
      </div>
    </Card>
  );
};