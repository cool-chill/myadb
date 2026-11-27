// SPDX-License-Identifier: GPL-3.0-only
/* eslint-disable react-refresh/only-export-components */
import type * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-secondary-foreground',
        success: 'border-success-soft bg-success-soft text-success',
        warning: 'border-warning-soft bg-warning-soft text-warning',
        destructive: 'border-destructive bg-card text-destructive',
        info: 'border-info-soft bg-info-soft text-accent-foreground',
        muted: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
