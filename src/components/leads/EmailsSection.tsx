'use client'

import { Mail } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import type { Activity } from '@/types'

interface EmailsSectionProps {
  leadId: string
  activities?: Activity[]
}

export function EmailsSection({ activities = [] }: EmailsSectionProps) {
  const emails = activities.filter((a) => a.tipo === 'email')

  if (emails.length === 0) {
    return (
      <div className="text-center py-8">
        <Mail size={28} className="mx-auto text-slate-200 mb-2" />
        <p className="text-sm text-slate-400">Sin emails registrados.</p>
        <p className="text-xs text-slate-300 mt-1">Los emails se registran desde la pestaña de Actividad.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {emails.map((a) => (
        <div key={a.id} className="border border-slate-200 rounded-xl p-4 bg-white">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-purple-500 flex-shrink-0" />
              <span className="text-sm font-medium text-slate-700">Email</span>
            </div>
            <span className="text-xs text-slate-400">{timeAgo(a.created_at)}</span>
          </div>
          <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{a.descripcion}</p>
          {a.user && (
            <p className="text-xs text-slate-400 mt-1">Por {a.user.full_name}</p>
          )}
        </div>
      ))}
    </div>
  )
}
