import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('whatsapp_faqs')
    .select('*')
    .order('orden', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { pregunta?: string; respuesta?: string }
  if (!body.pregunta?.trim() || !body.respuesta?.trim()) {
    return NextResponse.json({ error: 'pregunta y respuesta son requeridas' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: maxOrden } = await admin
    .from('whatsapp_faqs')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('whatsapp_faqs')
    .insert({
      pregunta:  body.pregunta.trim(),
      respuesta: body.respuesta.trim(),
      orden:     (maxOrden?.orden ?? 0) + 1,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
