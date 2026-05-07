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
        () => {
          qcRef.current.invalidateQueries({ queryKey: ['leads'] })
        }
      )
      .subscribe()

    // Singleton client — just remove this channel, not the whole connection
    return () => { supabase.removeChannel(channel) }
  }, []) // empty deps: subscribe once, cleanup on unmount
}
