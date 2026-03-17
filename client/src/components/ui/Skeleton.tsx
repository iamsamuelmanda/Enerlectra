import { cn } from '../../utils/cn';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'text' | 'circle' | 'card';
  lines?: number;
}

export function Skeleton({ className, variant = 'default', lines = 1, ...props }: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton h-4 rounded"
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'circle') {
    return (
      <div
        className={cn('skeleton rounded-full', className)}
        {...props}
      />
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={cn('skeleton rounded-2xl p-5 space-y-3', className)}
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-3">
          <div className="skeleton w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 rounded w-1/2" />
            <div className="skeleton h-3 rounded w-1/3" />
          </div>
        </div>
        <div className="skeleton h-16 rounded-xl" />
        <div className="skeleton h-8 rounded-xl" />
      </div>
    );
  }

  return (
    <div
      className={cn('skeleton rounded-xl', className)}
      {...props}
    />
  );
}