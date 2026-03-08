import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon: Icon,
  iconPosition = 'left',
  helperText,
  className = '',
  ...props
}) => {
  const inputClasses = error ? 'input-error' : 'input';
  const hasIcon = Icon !== undefined;
  const iconPadding = hasIcon && iconPosition === 'left' ? 'pl-11' : hasIcon && iconPosition === 'right' ? 'pr-11' : '';

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && iconPosition === 'left' && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <Icon className="w-5 h-5 text-slate-400" />
          </div>
        )}
        <input
          className={`${inputClasses} ${iconPadding} ${className}`}
          {...props}
        />
        {Icon && iconPosition === 'right' && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Icon className="w-5 h-5 text-slate-400" />
          </div>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-2 text-sm text-slate-400">{helperText}</p>
      )}
    </div>
  );
};

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({
  label,
  error,
  helperText,
  className = '',
  ...props
}) => {
  const textareaClasses = error ? 'input-error' : 'input';

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          {label}
        </label>
      )}
      <textarea
        className={`${textareaClasses} min-h-[120px] resize-y ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-2 text-sm text-slate-400">{helperText}</p>
      )}
    </div>
  );
};