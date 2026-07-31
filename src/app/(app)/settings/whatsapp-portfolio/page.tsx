'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Total  { name: string; count: number }
interface Recent { id: string; created_at: string; case_name: string; phase: string; text: string; lead_name: string | null; lead_id: string | null }
interface Stats  { totals: Total[]; recent: Recent[] }

const PHASE_LABEL: Record<string, string> = {
  qualifying: 'Qualifying',
  faq:        'FAQ',
  booking:    'Booking',
}

const CASE_COLORS: Record<string, string> = {
  'Autodux':          'bg-blue-500',
  'Soy LIDIA':        'bg-purple-500',
  'ALORA CRM':        'bg-indigo-500',
  'Castro Yeso':      'bg-orange-500',
  'ALKEMIA':          'bg-teal-500',
  'Distri-Sal':       'bg-yellow-500',
  'Voutier Repuestos':'bg-red-500',
  'Mimi Kids':        'bg-pink-500',
}

function color(name: string) { return CASE_COLORS[name] ?? 'bg-gray-400' }

export default function PortfolioStatsPage() {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ['portfolio-stats'],
    queryFn:  () => fetch('/api/whatsapp/portfolio-stats').then(r => r.json()),
  })

  const totals = data?.totals ?? []
  const recent = data?.recent ?? []
  const maxCount = totals[0]?.count ?? 1

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <TrendingUp className="text-purple-500" size={22} />
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Portfolio — Casos mostrados</h1>
          <p className="text-sm text-gray-500">Cuántas veces Lidia compartió cada caso de éxito con un lead</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">Cargando...</div>
      ) : totals.length === 0 ? (
        <div className="text-sm text-gray-400">Todavía no hay datos. Los casos se van registrando a medida que Lidia los comparte.</div>
      ) : (
        <>
          {/* Bar chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
            {totals.map(t => (
              <div key={t.name} className="flex items-center gap-3">
                <span className="w-36 text-sm text-gray-700 dark:text-gray-300 truncate shrink-0">{t.name}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color(t.name)} transition-all`}
                    style={{ width: `${Math.max((t.count / maxCount) * 100, 4)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-8 text-right">{t.count}</span>
              </div>
            ))}
          </div>

          {/* Recent matches */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Últimas coincidencias</h2>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
              {recent.map(r => (
                <div key={r.id} className="flex items-start gap-3 px-5 py-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${color(r.case_name)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.case_name}</span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                        {PHASE_LABEL[r.phase] ?? r.phase}
                      </span>
                      {r.lead_name && r.lead_id && (
                        <Link href={`/leads/${r.lead_id}`} className="text-xs text-purple-600 hover:underline flex items-center gap-0.5">
                          {r.lead_name} <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>
                    {r.text && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">"{r.text}"</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(r.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
