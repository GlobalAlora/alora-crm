'use client'

import { useRouter } from 'next/navigation'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Globe } from 'lucide-react'

interface LeadsByCountryChartProps {
  data: Record<string, number>
  isLoading?: boolean
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{
    payload: {
      country: string
      leads: number
    }
  }>
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0].payload
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-lg">
        <p className="text-sm font-medium text-slate-700">{data.country}</p>
        <p className="text-xs text-slate-500">{data.leads} leads</p>
      </div>
    )
  }
  return null
}

export function LeadsByCountryChart({ data, isLoading }: LeadsByCountryChartProps) {
  const router = useRouter()

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <Globe size={15} className="text-slate-400" />
          Leads por país
        </h2>
        <div className="h-64 flex items-center justify-center">
          <div className="text-sm text-slate-400">Cargando...</div>
        </div>
      </div>
    )
  }

  const chartData = Object.entries(data)
    .map(([country, count]) => ({
      country: country === 'AR' ? 'Argentina' : country === 'UY' ? 'Uruguay' : country,
      originalCountry: country,
      leads: count,
    }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8) // Top 8 países

  const handleCountryClick = (country: string) => {
    router.push(`/leads?view=kanban&pais=${country}`)
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
        <Globe size={15} className="text-slate-400" />
        Leads por país
      </h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis 
              dataKey="country"
              tick={{ fontSize: 11, angle: -45, textAnchor: 'end' }}
              height={80}
              stroke="#64748b"
            />
            <YAxis 
              tick={{ fontSize: 11 }}
              stroke="#64748b"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="leads" 
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              onClick={(data, index) => handleCountryClick(chartData[index].originalCountry)}
              cursor="pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
