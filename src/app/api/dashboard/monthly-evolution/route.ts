import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getArgentinaDate } from '@/lib/timezone'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    const sp = req.nextUrl.searchParams
    const responsableId = sp.get('responsable_id')
    const months = sp.get('months') ?? '6' // Default to 6 months
    const numMonths = parseInt(months, 10)

    const now = getArgentinaDate()
    const startDate = new Date(now.getFullYear(), now.getMonth() - numMonths + 1, 1)

    // Build query with filters - get all leads for created_at
    let query = supabase
      .from('leads')
      .select('created_at, estado_pipeline, responsable_id, stage_updated_at')
      .is('deleted_at', null)
      .gte('created_at', startDate.toISOString())

    if (responsableId) {
      query = query.eq('responsable_id', responsableId)
    }

    const { data: leads, error } = await query

    if (error) {
      console.error('Error fetching monthly evolution data:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Group data by month
    const monthlyData: Record<string, { creados: number; ganados: number; perdidos: number }> = {}

    // Initialize all months in the range
    for (let i = 0; i < numMonths; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      monthlyData[monthKey] = { creados: 0, ganados: 0, perdidos: 0 }
    }

    // Aggregate data
    leads?.forEach((lead) => {
      // Count created leads by created_at
      const createdDate = new Date(lead.created_at)
      const createdMonthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`

      if (monthlyData[createdMonthKey]) {
        monthlyData[createdMonthKey].creados++
      }

      // Count ganados/perdidos by when they changed to that state
      if (lead.stage_updated_at) {
        const stageDate = new Date(lead.stage_updated_at)
        const stageMonthKey = `${stageDate.getFullYear()}-${String(stageDate.getMonth() + 1).padStart(2, '0')}`
        
        if (monthlyData[stageMonthKey]) {
          if (lead.estado_pipeline === 'cliente_ganado') {
            monthlyData[stageMonthKey].ganados++
          } else if (lead.estado_pipeline === 'cliente_perdido' || lead.estado_pipeline === 'no_cualificado') {
            monthlyData[stageMonthKey].perdidos++
          }
        }
      }
    })

    // Convert to array and sort by month
    const result = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        creados: data.creados,
        ganados: data.ganados,
        perdidos: data.perdidos,
        conversion: data.creados > 0 ? Math.round((data.ganados / data.creados) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('Error in monthly evolution endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
