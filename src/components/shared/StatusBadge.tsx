import type { PipelineStage } from '@/types'
import { useStageMap } from '@/hooks/usePipelineStages'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  stage: PipelineStage
  className?: string
}

const FALLBACK = { color: '#64748b', bgColor: '#f1f5f9', label: '' }

export function StatusBadge({ stage, className }: StatusBadgeProps) {
  const stageMap = useStageMap()
  const config = stageMap[stage] ?? { ...FALLBACK, label: stage }
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', className)}
      style={{ color: config.color, backgroundColor: config.bgColor }}
    >
      {config.label}
    </span>
  )
}
