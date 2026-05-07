'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useLeadsRealtime() {
  const queryClient = useQueryClient()
  // Stable ref so the effect never re-runs due to queryClient identity changes
  const qcRef = useRef(queryClient)
  qcRef.current = queryClient

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        (payload) => {
          // Invalidate list-level queries
          qcRef.current.invalidateQueries({ queryKey: ['leads'] })
          // Invalidate the single-lead detail query too so open detail panels refresh
          const row = (payload.new ?? payload.old) as { id?: string } | null
          if (row?.id) {
            qcRef.current.invalidateQueries({ queryKey: ['lead', row.id] })
          }
          // Dashboard metrics may also depend on responsable assignments — invalidate
          qcRef.current.invalidateQueries({ queryKey: ['dashboard'] })
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities' },
        (payload) => {
          // When a reassignment activity is logged, refresh that lead's activity feed
          const row = payload.new as { lead_id?: string } | null
          if (row?.lead_id) {
            qcRef.current.invalidateQueries({ queryKey: ['activities', row.lead_id] })
          }
        }
      )
      .subscribe()

    // Singleton client — just remove this channel, not the whole connection
    return () => { supabase.removeChannel(channel) }
  }, []) // empty deps: subscribe once, cleanup on unmount
}
