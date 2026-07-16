import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewLeadAlert } from '@/lib/lead-alerts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Fields that map directly to lead columns
const LEAD_COLUMN_FIELDS = new Set([
  'nombre', 'email', 'telefono', 'empresa', 'pais',
  'servicio_interesado', 'mensaje', 'presupuesto_estimado',
])

// Fields to exclude from form_data (internal/meta)
const INTERNAL_FIELDS = new Set(['formId', 'extra_fields', 'tags', 'notas'])

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400, headers: CORS_HEADERS })
  }

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400, headers: CORS_HEADERS })
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400, headers: CORS_HEADERS })
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
      return NextResponse.json({ error: 'Este formulario no está activo' }, { status: 403, headers: CORS_HEADERS })
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
      return NextResponse.json({ data: existing, duplicate: true }, { status: 200, headers: CORS_HEADERS })
    }
  }

  // Assign all incoming leads to Walo
  const { data: walo } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'somosglobalalora@gmail.com')
    .maybeSingle()

  const responsableId: string | null = walo?.id ?? null

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

  // Only save telefono if it looks like an actual phone number (digits/+/spaces/dashes)
  const rawPhone = body.telefono || null
  const phoneIsValid = rawPhone && /^[\d\s+\-().]{6,}$/.test(rawPhone.trim())
  const telefono = phoneIsValid ? rawPhone.trim() : null

  const consulta = body.consulta_detallada || body.mensaje || body.consulta || body.notas || null

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      nombre: body.nombre.trim(),
      email: body.email || null,
      telefono,
      empresa: body.empresa || null,
      pais: body.pais || null,
      servicio_interesado: body.servicio_interesado || null,
      consulta_detallada: consulta,
      notas: consulta,
      fuente: body.fuente ?? 'formulario',
      form_id: body.formId || null,
      form_data: Object.keys(form_data).length > 0 ? form_data : null,
      responsable_id: responsableId,
      created_by: responsableId,
      estado_pipeline: 'lead_entrante',
      kanban_position: (maxPos?.kanban_position ?? 0) + 1,
    })
    .select('id, nombre, estado_pipeline')
    .single()

  if (error) {
    console.error('Error al crear lead:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    
    // Handle 409 conflict (duplicate email/phone) - fetch existing lead
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      const conditions: string[] = []
      if (body.email) conditions.push(`email.eq.${body.email}`)
      if (body.telefono) conditions.push(`telefono.eq.${body.telefono}`)
      
      if (conditions.length > 0) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id, nombre, estado_pipeline')
          .or(conditions.join(','))
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle()
        
        if (existing) {
          return NextResponse.json({ data: existing, duplicate: true }, { status: 200, headers: CORS_HEADERS })
        }
      }
    }
    
    return NextResponse.json({ error: error.message, details: error }, { status: 500, headers: CORS_HEADERS })
  }

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

  // Await (not fire-and-forget): on Vercel the function can be frozen right
  // after the response is sent, so an un-awaited call risks never running.
  // sendNewLeadAlert never throws — a failure here won't block the response.
  await sendNewLeadAlert({
    id: lead.id,
    nombre: body.nombre.trim(),
    email: body.email || null,
    telefono: body.telefono || null,
    empresa: body.empresa || null,
    pais: body.pais || null,
    fuente: body.fuente ?? 'formulario',
    mensaje: body.mensaje || body.notas || null,
  })

  return NextResponse.json({ data: lead }, { status: 201, headers: CORS_HEADERS })
}
