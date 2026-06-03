import { useQuery } from '@tanstack/react-query'
import { PIPELINE_STAGES } from '@/types'

export interface PipelineStageDB {
  id: string
  key: string
  label: string
  color: string
  bg_color: string
  zone: string
  order_position: number
  is_system: boolean
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
      created_at: '',
    })),
  })
}
