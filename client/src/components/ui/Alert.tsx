import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface AlertProps {
  children: React.ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  children,
  variant = 'info',
  title,
  onClose,
  className = '',
}) => {
  const variants = {
    info: {
      container: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
      icon: Info,
      iconColor: 'text-blue-400',
    },
    success: {
      container: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
      icon: CheckCircle,
      iconColor: 'text-emerald-400',
    },
    warning: {
      container: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
    },
    error: {
      container: 'bg-red-500/10 border-red-500/30 text-red-300',
      icon: AlertCircle,
      iconColor: 'text-red-400',
    },
  };

  const config = variants[variant];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border p-4 ${config.container} ${className}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="font-semibold mb-1">{title}</h4>
          )}
          <div className="text-sm">{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};