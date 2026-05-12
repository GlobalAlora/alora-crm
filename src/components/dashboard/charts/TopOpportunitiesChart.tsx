'use client'

import { useRouter } from 'next/navigation'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Target } from 'lucide-react'
import { formatUSD, formatARS } from '@/lib/utils'
import type { PipelineStage } from '@/types'

interface Opportunity {
  id: string
  nombre: string
  empresa: string | null
  valor_propuesta_usd: number | null
  valor_propuesta_ars: number | null
  valor_propuesta_moneda: "USD" | "ARS" | null
  estado_pipeline: PipelineStage
}

interface TopOpportunitiesChartProps {
  data: Opportunity[]
  isLoading?: boolean
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{
    payload: {
      name: string
      valor_usd: number
      valor_ars: number
    }
  }>
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0].payload
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-lg">
        <p className="text-sm font-medium text-slate-700">{data.name}</p>
        <p className="text-xs text-slate-500">{formatUSD(data.valor_usd)}</p>
        <p className="text-xs text-slate-500">{formatARS(data.valor_ars)}</p>
      </div>
    )
  }
  return null
}

export function TopOpportunitiesChart({ data, isLoading }: TopOpportunitiesChartProps) {
  const router = useRouter()

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <Target size={15} className="text-slate-400" />
          Top 5 oportunidades
        </h2>
        <div className="h-64 flex items-center justify-center">
          <div className="text-sm text-slate-400">Cargando...</div>
        </div>
      </div>
    )
  }

  const chartData = data.slice(0, 5).map((lead) => ({
    name: lead.empresa || lead.nombre,
    id: lead.id,
    valor_usd: lead.valor_propuesta_usd || 0,
    valor_ars: lead.valor_propuesta_ars || 0,
    // For chart height use USD if available, otherwise ARS (shown as-is, same axis)
    total: lead.valor_propuesta_moneda === 'ARS'
      ? lead.valor_propuesta_ars || 0
      : lead.valor_propuesta_usd || 0,
  }))

  const handleLeadClick = (leadId: string | undefined) => {
    if (!leadId) return
    router.push(`/leads/${leadId}`)
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
        <Target size={15} className="text-slate-400" />
        Top 5 oportunidades
      </h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis 
              dataKey="name"
              tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }}
              height={80}
              stroke="#64748b"
            />
            <YAxis 
              tick={{ fontSize: 11 }}
              stroke="#64748b"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="total" 
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              onClick={(data) => handleLeadClick(data.id)}
              cursor="pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-1">
        {chartData.map((item, index) => (
          <button
            key={item.name}
            onClick={() => handleLeadClick(item.id)}
            className="flex items-center justify-between text-xs w-full hover:bg-slate-50 px-2 py-1 rounded cursor-pointer transition-colors"
          >
            <span className="text-slate-600 truncate flex-1 text-left">{item.name}</span>
            <div className="flex items-center gap-3 ml-2">
              <span className="font-medium text-slate-700">{formatUSD(item.valor_usd)}</span>
              <span className="font-medium text-slate-700">{formatARS(item.valor_ars)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
