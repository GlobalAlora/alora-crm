import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

type AdminClient = ReturnType<typeof createAdminClient>

const MARKER_1 = '[noshow-followup-1]'
const MARKER_2 = '[noshow-followup-2]'

const MSG_1 = '¡Hola! 😊 Vimos que no pudiste conectarte a la llamada con Walo. ¿Querés reagendar? No hay problema — escribinos y buscamos otro horario que te quede bien.'
const MSG_2 = 'Hola de nuevo. Como no pudimos conectarnos y no recibimos respuesta, vamos a dar por finalizado el proceso por ahora. Si en algún momento querés retomar, escribinos tranquilo — acá vamos a estar 💛'

export async function runNoshowFollowups(admin: AdminClient): Promise<{ sent: number; checked: number }> {
  const { data: leads } = await admin
    .from('leads')
    .select('id, nombre, apellido')
    .eq('reunion_asistencia', 'no_se_presento')
    .is('deleted_at', null)
    .not('estado_pipeline', 'in', '("cliente_perdido","cliente_ganado","no_cualificado","testing")')

  if (!leads?.length) return { sent: 0, checked: 0 }

  let sent = 0

  for (const lead of leads) {
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id, phone_number, last_message_at, last_message_direction')
      .eq('lead_id', lead.id)
      .maybeSingle()

    if (!conv) continue

    const { data: activities } = await admin
      .from('activities')
      .select('descripcion, created_at')
      .eq('lead_id', lead.id)
      .like('descripcion', '%[noshow-followup%')
      .order('created_at', { ascending: true })

    const step1 = activities?.find(a => a.descripcion.includes(MARKER_1))
    const step2 = activities?.find(a => a.descripcion.includes(MARKER_2))

    if (step2) continue

    if (!step1) {
      const ok = await sendOutboundWhatsAppMessage(admin, {
        conversationId: conv.id,
        leadId:         lead.id,
        phone:          conv.phone_number,
        body:           MSG_1,
      })
      if (!ok) continue

      await admin.from('activities').insert({
        lead_id:     lead.id,
        user_id:     null,
        tipo:        'nota',
        descripcion: `${MARKER_1} Lidia envió seguimiento automático por no presentación (mensaje 1/2).`,
      })
      sent++
    } else {
      // Already sent step 1 — check if lead responded since then
      const step1Time   = new Date(step1.created_at).getTime()
      const lastMsgTime = new Date(conv.last_message_at).getTime()
      const responded   = conv.last_message_direction === 'inbound' && lastMsgTime > step1Time

      if (responded) continue

      // Wait at least 24 hours before sending the final message
      if ((Date.now() - step1Time) / 3_600_000 < 24) continue

      const ok = await sendOutboundWhatsAppMessage(admin, {
        conversationId: conv.id,
        leadId:         lead.id,
        phone:          conv.phone_number,
        body:           MSG_2,
      })
      if (!ok) continue

      await Promise.all([
        admin.from('leads').update({ estado_pipeline: 'cliente_perdido' }).eq('id', lead.id),
        admin.from('activities').insert({
          lead_id:     lead.id,
          user_id:     null,
          tipo:        'cambio_estado',
          descripcion: `${MARKER_2} Lidia cerró el lead por no presentación sin respuesta. Movido a "Cliente perdido".`,
        }),
      ])
      sent++
    }
  }

  return { sent, checked: leads.length }
}
