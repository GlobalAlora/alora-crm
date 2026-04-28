import { PIPELINE_STAGE_MAP } from '@/types'
import type { PipelineStage } from '@/types'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  stage: PipelineStage
  className?: string
}

export function StatusBadge({ stage, className }: StatusBadgeProps) {
  const config = PIPELINE_STAGE_MAP[stage]
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', className)}
      style={{ color: config.color, backgroundColor: config.bgColor }}
    >
      {config.label}
    </span>
  )
}
