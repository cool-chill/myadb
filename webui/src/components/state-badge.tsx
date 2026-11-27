// SPDX-License-Identifier: GPL-3.0-only
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/i18n'
import type { AdbState } from '@/lib/schema'

const variantByState: Record<AdbState, 'success' | 'muted' | 'warning' | 'destructive' | 'info'> = {
  ACTIVE: 'success',
  IDLE: 'muted',
  DEGRADED: 'warning',
  BLOCKED: 'destructive',
  ERROR: 'destructive',
}

const dotByState: Record<AdbState, string> = {
  ACTIVE: 'bg-success',
  IDLE: 'bg-muted-foreground',
  DEGRADED: 'bg-warning',
  BLOCKED: 'bg-destructive',
  ERROR: 'bg-destructive',
}

export function StateBadge({ state }: { state: AdbState }) {
  const { t } = useI18n()
  return (
    <Badge variant={variantByState[state]} className="gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotByState[state]}`} aria-hidden="true" />
      {t(`state.${state}`)}
    </Badge>
  )
}
