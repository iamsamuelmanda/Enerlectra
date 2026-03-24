import { ReactNode, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 cursor-pointer select-none border-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';

  const sizes = {
    sm:  'px-3.5 py-2 text-xs',
    md:  'px-5 py-2.5 text-sm',
    lg:  'px-7 py-3.5 text-base',
  };

  const variants: Record<string, string> = {
    primary:   'text-white hover:-translate-y-0.5 active:translate-y-0',
    secondary: 'text-white/80 hover:text-white hover:border-purple-500/50 active:scale-95',
    ghost:     'text-white/60 hover:text-white hover:bg-white/5 active:scale-95',
    danger:    'text-white hover:-translate-y-0.5 active:translate-y-0',
    success:   'text-white hover:-translate-y-0.5 active:translate-y-0',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      boxShadow: '0 4px 16px rgba(102, 126, 234, 0.35)',
    },
    secondary: {
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(8px)',
    },
    ghost: {
      background: 'transparent',
    },
    danger: {
      background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
      boxShadow: '0 4px 16px rgba(244, 63, 94, 0.3)',
    },
    success: {
      background: 'linear-gradient(135deg, #10b981, #059669)',
      boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
    },
  };

  return (
    <button
      className={cn(base, sizes[size], variants[variant], fullWidth && 'w-full', className)}
      style={variantStyles[variant]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 12 : size === 'lg' ? 18 : 14} className="animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className="flex-shrink-0">{iconRight}</span>
      )}
    </button>
  );
}
