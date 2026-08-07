import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ token: string }> }

function html(emoji: string, msg: string) {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc">
<div style="text-align:center;max-width:400px;padding:40px">
  <div style="font-size:64px;margin-bottom:16px">${emoji}</div>
  <h2 style="color:#1e293b;margin:0 0 8px;font-size:20px">¡Gracias por tu respuesta!</h2>
  <p style="color:#64748b;margin:0;line-height:1.6;font-size:15px">${msg}</p>
</div>
</body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params
  const score = req.nextUrl.searchParams.get('score')

  if (score !== '0' && score !== '1') {
    return html('⚠️', 'El link es inválido.')
  }

  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, csat_score')
    .eq('ticket_token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (!ticket) return html('⚠️', 'Ticket no encontrado.')

  if (ticket.csat_score == null) {
    await admin.from('tickets').update({ csat_score: Number(score) }).eq('id', ticket.id)
  }

  return score === '1'
    ? html('👍', 'Nos alegra haber podido ayudarte. ¡Hasta la próxima!')
    : html('👎', 'Gracias por tu feedback. Vamos a trabajar para mejorar.')
}
