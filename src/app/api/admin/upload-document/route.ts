import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_MB  = 20
const ALLOWED = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
]

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 })
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `El archivo supera ${MAX_MB}MB` }, { status: 400 })
  }

  const ext  = file.name.split('.').pop() ?? 'bin'
  const slug = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `reports/${slug}.${ext}`

  const admin = createAdminClient()
  const { error } = await admin.storage
    .from('ticket-attachments')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage
    .from('ticket-attachments')
    .getPublicUrl(path)

  return NextResponse.json({ url: publicUrl, name: file.name, type: file.type })
}
