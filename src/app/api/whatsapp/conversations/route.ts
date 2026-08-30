import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('whatsapp_conversations')
      .select(`
        *,
        lead:leads(id, nombre, apellido, email, estado_pipeline)
      `)
      .order('last_message_at', { ascending: false })

    if (error) {
      console.error('Error fetching WhatsApp conversations:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error in WhatsApp conversations:', err)
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Error interno del servidor' 
    }, { status: 500 })
  }
}
