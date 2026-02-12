import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'border-border bg-background text-foreground',
        success: 'border-emerald-700 bg-emerald-100 text-emerald-900',
        danger: 'border-red-700 bg-red-100 text-red-900',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
