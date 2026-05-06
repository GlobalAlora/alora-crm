'use client'

import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Clock } from 'lucide-react'

interface LeadsBySourceChartProps {
  data: Record<string, number>
  isLoading?: boolean
}

const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500  
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
]

interface TooltipProps {
  active?: boolean
  payload?: Array<{
    payload: {
      name: string
      value: number
    }
  }>
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0].payload
    const total = payload.reduce((sum, item) => sum + item.payload.value, 0)
    const percentage = ((data.value / total) * 100).toFixed(1)
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-lg">
        <p className="text-sm font-medium text-slate-700">{data.name}</p>
        <p className="text-xs text-slate-500">{data.value} leads ({percentage}%)</p>
      </div>
    )
  }
  return null
}

export function LeadsBySourceChart({ data, isLoading }: LeadsBySourceChartProps) {
  const router = useRouter()

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <Clock size={15} className="text-slate-400" />
          Leads por fuente
        </h2>
        <div className="h-64 flex items-center justify-center">
          <div className="text-sm text-slate-400">Cargando...</div>
        </div>
      </div>
    )
  }

  const chartData = Object.entries(data).map(([source, count]) => ({
    name: source,
    value: count,
  }))

  const total = chartData.reduce((sum, item) => sum + item.value, 0)

  const handleSourceClick = (source: string | undefined) => {
    if (!source) return
    router.push(`/contactos?fuente=${source}`)
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
        <Clock size={15} className="text-slate-400" />
        Leads por fuente
      </h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : '0'}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              onClick={(data) => handleSourceClick(data.name)}
              cursor="pointer"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {chartData.map((item, index) => (
          <button
            key={item.name}
            onClick={() => handleSourceClick(item.name)}
            className="flex items-center gap-2 text-xs hover:bg-slate-50 px-2 py-1 rounded cursor-pointer transition-colors"
          >
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-slate-600">{item.name}</span>
            <span className="font-medium text-slate-700">{item.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
