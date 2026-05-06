'use client'

import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { TrendingUp } from 'lucide-react'

interface MonthlyEvolutionChartProps {
  responsableId?: string
  months?: number
}

interface MonthlyData {
  month: string
  creados: number
  ganados: number
  perdidos: number
  conversion: number
}

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ene',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dic',
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-')
  return `${MONTH_NAMES[monthNum]} ${year.slice(2)}`
}

export function MonthlyEvolutionChart({ responsableId, months = 6 }: MonthlyEvolutionChartProps) {
  const params = new URLSearchParams()
  if (responsableId) params.append('responsable_id', responsableId)
  params.append('months', months.toString())

  const { data, isLoading, error } = useQuery({
    queryKey: ['monthly-evolution', responsableId, months],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/monthly-evolution?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar datos de evolución mensual')
      const json = await res.json()
      return json.data as MonthlyData[]
    },
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-slate-400" />
          Evolución mensual
        </h2>
        <div className="h-64 bg-slate-50 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-slate-400" />
          Evolución mensual
        </h2>
        <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
          Error al cargar datos
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-slate-400" />
          Evolución mensual
        </h2>
        <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
          Sin datos para mostrar
        </div>
      </div>
    )
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatMonthLabel(d.month),
  }))

  return (
    <div className="bg-white rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <TrendingUp size={15} className="text-slate-400" />
          Evolución mensual
        </h2>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-slate-600">Creados</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-slate-600">Ganados</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-slate-600">Perdidos</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="label" 
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis 
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <Tooltip 
            contentStyle={{ 
              borderRadius: '8px', 
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}
            formatter={(value, name) => {
              if (!name) return [value, '']
              if (typeof value !== 'number') return [value, name]
              if (typeof name !== 'string') return [value, name]
              if (name === 'conversion') return [`${value}%`, 'Conversión']
              return [value, name.charAt(0).toUpperCase() + name.slice(1)]
            }}
          />
          <Legend />
          <Bar 
            dataKey="creados" 
            fill="#3b82f6" 
            name="creados"
            radius={[4, 4, 0, 0]}
          />
          <Bar 
            dataKey="ganados" 
            fill="#22c55e" 
            name="ganados"
            radius={[4, 4, 0, 0]}
          />
          <Bar 
            dataKey="perdidos" 
            fill="#ef4444" 
            name="perdidos"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Conversion rate line */}
      <div className="pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-500 mb-2">Tasa de conversión mensual</p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value) => typeof value === 'number' ? [`${value}%`, 'Conversión'] : [value, '']}
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="conversion" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
