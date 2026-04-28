'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useLeadsRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        (payload) => {
          // Invalidate all leads list queries (kanban + list views)
          queryClient.invalidateQueries({ queryKey: ['leads'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })

          // Also refresh the specific lead detail if it's open
          if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
            const id = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id
            if (id) {
              queryClient.invalidateQueries({ queryKey: ['lead', id] })
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
