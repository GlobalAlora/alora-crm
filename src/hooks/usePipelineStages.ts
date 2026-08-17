import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'

export interface PipelineStageDB {
  id: string
  key: string
  label: string
  color: string
  bg_color: string
  zone: string
  order_position: number
  is_system: boolean
  descripcion: string | null
  created_at: string
}

async function fetchStages(): Promise<PipelineStageDB[]> {
  const res = await fetch('/api/pipeline-stages')
  if (!res.ok) throw new Error('Failed to fetch stages')
  const json = await res.json()
  return json.data
}

export function usePipelineStages() {
  return useQuery<PipelineStageDB[]>({
    queryKey: ['pipeline-stages'],
    queryFn: fetchStages,
    staleTime: 5 * 60 * 1000, // 5 min — stages change rarely
    // Fall back to hardcoded stages if the table doesn't exist yet
    placeholderData: PIPELINE_STAGES.map((s, i) => ({
      id: s.value,
      key: s.value,
      label: s.label,
      color: s.color,
      bg_color: s.bgColor,
      zone: s.zone,
      order_position: i + 1,
      is_system: true,
      descripcion: null,
      created_at: '',
    })),
  })
}

export interface PipelineStageOption {
  value: PipelineStage
  label: string
  color: string
  bgColor: string
  zone: string
  descripcion: string | null
}

// Single source of truth for "which stages can a lead be in" across every
// selector/filter/kanban column. Always includes custom stages added in
// Configuración → Pipeline, not just the original hardcoded set.
export function useActivePipelineStages(): PipelineStageOption[] {
  const { data } = usePipelineStages()
  return useMemo(() => {
    if (!data || data.length === 0) return PIPELINE_STAGES.map((s) => ({ ...s, descripcion: null }))
    return data.map((s) => ({
      value: s.key as PipelineStage,
      label: s.label,
      color: s.color,
      bgColor: s.bg_color,
      zone: s.zone,
      descripcion: s.descripcion,
    }))
  }, [data])
}

// Lookup by key for badges/labels — same dynamic source as useActivePipelineStages.
export function useStageMap(): Record<string, PipelineStageOption> {
  const stages = useActivePipelineStages()
  return useMemo(() => Object.fromEntries(stages.map((s) => [s.value, s])), [stages])
}
