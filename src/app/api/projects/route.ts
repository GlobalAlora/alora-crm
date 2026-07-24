import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createProjectForLead } from '@/lib/projects'
import type { ProjectEstado, PmPriority } from '@/types'

const DEFAULT_SECTIONS = [
  { nombre: 'Por hacer',   color: '#94A3B8', position: 0, is_done: false },
  { nombre: 'En progreso', color: '#3B82F6', position: 1, is_done: false },
  { nombre: 'En revisión', color: '#F59E0B', position: 2, is_done: false },
  { nombre: 'Finalizado',  color: '#22C55E', position: 3, is_done: true  },
]

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const estado  = searchParams.get('estado') as ProjectEstado | null
  const page    = Math.max(1, parseInt(searchParams.get('page')  || '1',  10))
  const limit   = Math.min(100, parseInt(searchParams.get('limit') || '50', 10))
  const offset  = (page - 1) * limit

  const admin = createAdminClient()
  let query = admin
    .from('projects')
    .select(`
      *,
      lead:leads!lead_id(id, nombre, apellido, empresa)
    `, { count: 'exact' })
    .is('deleted_at', null)
    .is('archived_at', null)

  if (estado) query = query.eq('estado', estado)

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data ?? [],
    meta: { total: count ?? 0, page, limit, pages: Math.ceil((count ?? 0) / limit) },
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>

  if (!body.nombre || typeof body.nombre !== 'string' || !body.nombre.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projects')
    .insert({
      nombre:          (body.nombre as string).trim(),
      descripcion:     body.descripcion    || null,
      estado:          (body.estado as ProjectEstado) || 'pendiente',
      prioridad:       (body.prioridad as PmPriority) || 'media',
      lead_id:         body.lead_id        || null,
      fecha_inicio:    body.fecha_inicio   || null,
      fecha_fin:       body.fecha_fin      || null,
      presupuesto_usd: body.presupuesto_usd ? Number(body.presupuesto_usd) : null,
      color:           body.color          || '#5B7FFF',
      created_by:      user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('task_sections').insert(
    DEFAULT_SECTIONS.map(s => ({ ...s, project_id: data.id }))
  )

  return NextResponse.json({ data }, { status: 201 })
}
