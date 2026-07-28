import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProjectEstado, PmPriority } from '@/types'

const FULL_ACCESS_ROLES = ['admin', 'sales']

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
  const estado   = searchParams.get('estado') as ProjectEstado | null
  const archived = searchParams.get('archived') === 'true'
  const page   = Math.max(1, parseInt(searchParams.get('page')  || '1',  10))
  const limit  = Math.min(100, parseInt(searchParams.get('limit') || '50', 10))
  const offset = (page - 1) * limit

  const admin = createAdminClient()

  // Check role
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  const isFullAccess = FULL_ACCESS_ROLES.includes(userRow?.role ?? '')

  let query = admin
    .from('projects')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)

  if (archived) {
    query = query.not('archived_at', 'is', null)
  } else {
    query = query.is('archived_at', null)
  }

  if (estado) query = query.eq('estado', estado)

  // Non-admins only see their assigned projects
  if (!isFullAccess) {
    const { data: memberships } = await admin
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id)
    const ids = (memberships ?? []).map(m => m.project_id)
    if (ids.length === 0) {
      return NextResponse.json({ data: [], meta: { total: 0, page, limit, pages: 0 } })
    }
    query = query.in('id', ids)
  }

  const { data: projects, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[GET /api/projects]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const leadIds = (projects ?? []).map(p => p.lead_id).filter(Boolean) as string[]
  let leadsMap: Record<string, { id: string; nombre: string | null; apellido: string | null; empresa: string | null }> = {}

  if (leadIds.length > 0) {
    const { data: leads } = await admin
      .from('leads')
      .select('id, nombre, apellido, empresa')
      .in('id', leadIds)
      .is('deleted_at', null)
    leadsMap = Object.fromEntries((leads ?? []).map(l => [l.id, l]))
  }

  const data = (projects ?? []).map(p => ({
    ...p,
    lead: p.lead_id ? (leadsMap[p.lead_id] ?? null) : null,
  }))

  return NextResponse.json({
    data,
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

  if (error) {
    console.error('[POST /api/projects]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Create default sections
  await admin.from('task_sections').insert(
    DEFAULT_SECTIONS.map(s => ({ ...s, project_id: data.id }))
  )

  // Auto-add creator as project manager
  await admin.from('project_members').insert({
    project_id: data.id,
    user_id:    user.id,
    role:       'pm',
  })

  return NextResponse.json({ data }, { status: 201 })
}
