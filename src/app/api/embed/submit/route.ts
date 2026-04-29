import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Fields that map directly to lead columns
const LEAD_COLUMN_FIELDS = new Set([
  'nombre', 'email', 'telefono', 'empresa', 'pais',
  'servicio_interesado', 'mensaje', 'presupuesto_estimado',
])

// Fields to exclude from form_data (internal/meta)
const INTERNAL_FIELDS = new Set(['formId', 'extra_fields', 'tags', 'notas'])

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verificar que el form esté activo antes de aceptar submissions
  if (body.formId && body.formId !== 'default') {
    const { data: formConfig } = await supabase
      .from('form_configs')
      .select('active')
      .eq('id', body.formId)
      .maybeSingle()

    if (formConfig && formConfig.active === false) {
      return NextResponse.json({ error: 'Este formulario no está activo' }, { status: 403 })
    }
  }

  // Dedup: same email OR phone in last 24h
  if (body.email || body.telefono) {
    const conditions: string[] = []
    if (body.email) conditions.push(`email.eq.${body.email}`)
    if (body.telefono) conditions.push(`telefono.eq.${body.telefono}`)

    const { data: existing } = await supabase
      .from('leads')
      .select('id, nombre, estado_pipeline')
      .or(conditions.join(','))
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ data: existing, duplicate: true }, { status: 200 })
    }
  }

  // Round-robin: pick sales user with fewest active leads
  const { data: salesUsers } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'sales'])

  let responsableId: string | null = null
  if (salesUsers && salesUsers.length > 0) {
    const counts = await Promise.all(
      salesUsers.map(async (u) => {
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('responsable_id', u.id)
          .is('deleted_at', null)
          .not('estado_pipeline', 'in', '(cliente_ganado,cliente_perdido,no_cualificado)')
        return { id: u.id, count: count ?? 0 }
      })
    )
    counts.sort((a, b) => a.count - b.count)
    responsableId = counts[0].id
  }

  const { data: maxPos } = await supabase
    .from('leads')
    .select('kanban_position')
    .eq('estado_pipeline', 'lead_entrante')
    .is('deleted_at', null)
    .order('kanban_position', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Build form_data: capture ALL fields submitted (known + custom)
  const form_data: Record<string, string> = {}
  for (const [key, val] of Object.entries(body)) {
    if (INTERNAL_FIELDS.has(key)) continue
    if (val && typeof val === 'string' && val.trim()) {
      form_data[key] = val.trim()
    }
  }
  // Also include extra_fields if present
  if (body.extra_fields && typeof body.extra_fields === 'object') {
    for (const [key, val] of Object.entries(body.extra_fields)) {
      if (val && typeof val === 'string' && val.trim()) {
        form_data[key] = val.trim()
      }
    }
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      nombre: body.nombre.trim(),
      email: body.email || null,
      telefono: body.telefono || null,
      empresa: body.empresa || null,
      pais: body.pais || null,
      servicio_interesado: body.servicio_interesado || null,
      notas: body.notas || body.mensaje || null,
      fuente: 'formulario',
      form_id: body.formId || null,
      form_data: Object.keys(form_data).length > 0 ? form_data : null,
      responsable_id: responsableId,
      created_by: responsableId,
      estado_pipeline: 'lead_entrante',
      kanban_position: (maxPos?.kanban_position ?? 0) + 1,
    })
    .select('id, nombre, estado_pipeline')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('activities').insert({
    lead_id: lead.id,
    user_id: null,
    tipo: 'webhook',
    descripcion: 'Lead recibido desde formulario web',
    metadata: {
      form_id: body.formId ?? null,
      form_data,
      tags: body.tags ?? null,
    },
  })

  return NextResponse.json({ data: lead }, { status: 201 })
}
