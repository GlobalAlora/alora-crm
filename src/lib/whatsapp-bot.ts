import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'
import { matchFaqOrEscalate } from '@/lib/whatsapp-faq'
import { getAvailableSlotsByDay, formatSlotAR, createCalendarEvent } from '@/lib/google-calendar'
import { sendGmail } from '@/lib/google-gmail'
import { notifyAll } from '@/lib/push-notify'

type AdminClient = ReturnType<typeof createAdminClient>

// Leads already in this list are existing clients — Lidia must never engage
// them (they're usually writing about something unrelated to a new lead),
// no matter what state their conversation is in.
const CLIENT_LIST_NAME = 'CLIENTES ALORA'

export async function isClientLead(admin: AdminClient, leadId: string): Promise<boolean> {
  const { data: list } = await admin
    .from('lists')
    .select('id')
    .eq('name', CLIENT_LIST_NAME)
    .maybeSingle()

  if (!list) return false

  const { data } = await admin
    .from('list_leads')
    .select('lead_id')
    .eq('list_id', list.id)
    .eq('lead_id', leadId)
    .maybeSingle()

  return !!data
}

// Order in which the qualifying bot asks for missing info.
// "nombre" and "consulta_detallada" are free-text answers we save directly
// (no AI inference) and are always asked once, regardless of whether the
// lead already has a placeholder value (e.g. the WhatsApp profile name).
const QUESTION_ORDER = ['nombre', 'consulta_detallada', 'servicios_interesados', 'email', 'empresa', 'sitio_web', 'pais'] as const
type QuestionField = typeof QUESTION_ORDER[number]
const DIRECT_SAVE_FIELDS = new Set<QuestionField>(['nombre', 'consulta_detallada'])

// Fields where we push back once instead of silently accepting a non-answer
// (e.g. "no tengo" to the email question) and moving on. After one retry we
// accept whatever comes back, so we never loop forever on it.
const VALIDATORS: Partial<Record<QuestionField, { isValid: (text: string) => boolean; pushback: string }>> = {
  email: {
    isValid: (t) => /\S+@\S+\.\S+/.test(t),
    pushback: 'Te pido el email puntualmente porque es importante para que el equipo te pueda hacer seguimiento — ¿tenés alguno que me puedas pasar? 🙏',
  },
  consulta_detallada: {
    isValid: (t) => t.trim().split(/\s+/).length >= 5,
    pushback: '¿Me podés contar un poco más en detalle? Cuanto más contexto me das, mejor te puede ayudar el equipo 🙏',
  },
}

const QUESTION_TEXT: Record<QuestionField, string> = {
  nombre:                '¿Cómo te llamás?',
  consulta_detallada:    'Contame con el mayor detalle posible qué necesitás, así te puedo ayudar mejor 🙂',
  email:                 '¿Me pasás tu email? 📧',
  empresa:               '¿Tenés una empresa o negocio? Contame cómo se llama 😊',
  sitio_web:             '¿Ya tenés un sitio web? Si tenés, pasame el link (si no tenés todavía, tranquilo, no es obligatorio)',
  pais:                  '¿Desde qué país me escribís?',
  servicios_interesados: '¿En qué servicio puntual estás interesado? (por ejemplo: diseño web, mantenimiento, redes sociales, branding, marketing, etc.) ✨',
}

const WELCOME  = '¡Hola! 👋 Soy Lidia, de Alora. ¡Qué alegría que nos escribas! 🙂'
const CLOSING_FALLBACK = '¡Listo, ya tengo todo lo que necesitaba! 🎉 Gracias por tu paciencia.\n\n'
  + 'Te propongo agendar una llamada de relevamiento rápida con Walo, así charlan tranquilos sobre lo que necesitás:\n'
  + 'https://www.globalalora.com/es/llamada-de-relevamiento\n\n'
  + 'Elegí el horario que más te quede cómodo y ahí se conectan 💛\n\n'
  + 'Mientras tanto, si tenés alguna otra duda, escribime tranquilo que te ayudo 🙂'
const HANDOFF  = 'Dejame que te conecte con alguien del equipo para ayudarte mejor con esto 🙂 En breve te responden.'

const BOOKING_SLOTS_PREFIX = 'booking_slots:::'

interface LeadSnapshot {
  nombre: string | null
  email: string | null
  empresa: string | null
  sitio_web: string | null
  pais: string | null
  servicios_interesados: string[] | null
  consulta_detallada: string | null
}

function isFieldFilled(lead: LeadSnapshot, field: QuestionField): boolean {
  // Always ask once — the WhatsApp profile name isn't a real answer, and
  // there's no other source for the detailed inquiry.
  if (DIRECT_SAVE_FIELDS.has(field)) return false
  if (field === 'servicios_interesados') return !!lead.servicios_interesados?.length
  return !!lead[field]
}

/**
 * Entry point: routes to the qualifying flow or FAQ mode depending on where
 * this conversation is at. Does nothing if a human has taken over
 * (bot_active = false).
 */
export async function runBot(
  admin: AdminClient,
  { leadId, conversationId, phone, text }: { leadId: string; conversationId: string; phone: string; text: string | null },
): Promise<void> {
  if (await isClientLead(admin, leadId)) {
    // Existing clients: always straight to a human, never the bot — not even
    // a welcome message. Force bot_active off in case it was somehow on.
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  const { data: convo } = await admin
    .from('whatsapp_conversations')
    .select('bot_active, bot_phase, bot_next_question')
    .eq('id', conversationId)
    .single()

  if (!convo || convo.bot_active === false) return

  if (convo.bot_phase === 'faq') {
    await handleFaqPhase(admin, { leadId, conversationId, phone, text })
    return
  }

  if (convo.bot_phase === 'booking') {
    await handleBookingPhase(admin, { leadId, conversationId, phone, text, botNextQuestion: convo.bot_next_question })
    return
  }

  await advanceQualifyingBot(admin, { leadId, conversationId, phone, text, botNextQuestion: convo.bot_next_question })
}

/**
 * Figures out which qualifying question (if any) to ask next and sends it.
 * Whether to show the welcome / how far along we are is driven entirely by
 * `bot_next_question` — not by whether the lead is new — so resetting a
 * conversation (bot_next_question cleared back to null) always restarts
 * cleanly with the welcome message.
 */
async function advanceQualifyingBot(
  admin: AdminClient,
  { leadId, conversationId, phone, text, botNextQuestion }: {
    leadId: string
    conversationId: string
    phone: string
    text: string | null
    botNextQuestion: string | null
  },
): Promise<void> {
  // A "<field>__retry" sentinel means we already pushed back once on that
  // field and are now looking at the second attempt — accept it no matter what.
  const isRetry = !!botNextQuestion?.endsWith('__retry')
  const askedField = isRetry
    ? (botNextQuestion!.slice(0, -'__retry'.length) as QuestionField)
    : (botNextQuestion as QuestionField | null)

  const trimmed = text?.trim() || ''

  // Push back once on a non-answer to a validated field instead of silently
  // moving on (e.g. "no tengo" to the email question).
  const validator = askedField ? VALIDATORS[askedField] : undefined
  if (validator && trimmed && !validator.isValid(trimmed) && !isRetry) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: validator.pushback })
    await admin
      .from('whatsapp_conversations')
      .update({ bot_next_question: `${askedField}__retry` })
      .eq('id', conversationId)
    return
  }

  // The field we just asked about isn't AI-inferred — save the raw reply
  // directly (if any) before deciding what's next.
  if (askedField && DIRECT_SAVE_FIELDS.has(askedField) && trimmed) {
    await admin.from('leads').update({ [askedField]: trimmed }).eq('id', leadId)
  }
  // Email is otherwise left to AI enrichment, but save it directly here too
  // when it was the literal answer to the email question — no need to wait.
  if (askedField === 'email' && trimmed && /\S+@\S+\.\S+/.test(trimmed)) {
    await admin.from('leads').update({ email: trimmed }).eq('id', leadId)
  }

  const { data: lead } = await admin
    .from('leads')
    .select('nombre, email, empresa, sitio_web, pais, servicios_interesados, consulta_detallada')
    .eq('id', leadId)
    .single()

  if (!lead) return

  // Whatever we last asked counts as "answered" (even with a "no") — resume
  // looking for missing fields right after it, not from the start.
  const lastAskedIdx = askedField ? QUESTION_ORDER.indexOf(askedField) : -1
  const isFreshStart = lastAskedIdx === -1
  const startIdx = isFreshStart ? 0 : lastAskedIdx + 1

  const nextField = QUESTION_ORDER.slice(startIdx).find((f) => !isFieldFilled(lead, f))

  // When the lead mentions pricing or asks if services are free, acknowledge briefly
  // before continuing with the next qualifying question.
  const mentionsGratis = /\b(gratis|gratuito|gratuita|gratuitos|gratuitas|sin costo|sin cobrar|de onda|free)\b/i.test(trimmed)
  const asksPricing = /\b(costo|costos|precio|precios|cuánto sale|cuanto sale|cuánto cuesta|cuanto cuesta|cuánto cobran|cuanto cobran|tiene costo|tienen costo|es pago|es gratis|cobran|presupuesto|tarifas?)\b/i.test(trimmed)

  let gratisPrefix = ''
  if (!isFreshStart) {
    if (mentionsGratis) {
      gratisPrefix = 'Te cuento que en Alora somos un equipo 100% profesional y todos nuestros servicios tienen un costo 🙂 En la llamada con Walo van a charlar sobre qué necesitás y cuánto implicaría — te aseguro que vale la pena.\n\n'
    } else if (asksPricing) {
      gratisPrefix = '¡Muy buena pregunta! Los costos dependen del proyecto puntual, así que en la llamada con Walo van a ver juntos qué solución se adapta mejor y qué invertiría 🙂\n\n'
    }
  }

  if (!nextField) {
    // Nothing left to ask — start the booking flow (or fall back to link).
    if (!isFreshStart) {
      if (gratisPrefix) {
        await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: gratisPrefix.trim() })
      }
      await startBookingFlow(admin, { leadId, conversationId, phone })
    } else {
      await admin
        .from('whatsapp_conversations')
        .update({ bot_phase: 'faq', bot_next_question: null })
        .eq('id', conversationId)
    }
    return
  }

  if (isFreshStart) {
    // Atomic claim: only one concurrent call wins when bot_next_question is still null.
    // If another call already claimed it, data comes back empty and we bail out.
    const { data: claimed } = await admin
      .from('whatsapp_conversations')
      .update({ bot_next_question: nextField })
      .eq('id', conversationId)
      .is('bot_next_question', null)
      .select('id')

    if (!claimed?.length) return

    await sendOutboundWhatsAppMessage(admin, {
      conversationId,
      leadId,
      phone,
      body: `${WELCOME}\n\n${QUESTION_TEXT[nextField]}`,
    })
    return
  }

  await sendOutboundWhatsAppMessage(admin, {
    conversationId,
    leadId,
    phone,
    body: `${gratisPrefix}${QUESTION_TEXT[nextField]}`,
  })

  await admin
    .from('whatsapp_conversations')
    .update({ bot_next_question: nextField })
    .eq('id', conversationId)
}

const SLOT_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

/**
 * Offers calendar slots grouped by day (up to 2 days, 4 slots each: 2 morning + 2 afternoon).
 * skipDays lets subsequent calls skip already-shown days so the lead can see new options.
 * State is encoded in bot_next_question as: booking_slots:::NEXT_SKIP:::ISO1|ISO2|...|ISON
 */
async function startBookingFlow(
  admin: AdminClient,
  { leadId, conversationId, phone }: { leadId: string; conversationId: string; phone: string },
  skipDays = 0,
): Promise<void> {
  const days = await getAvailableSlotsByDay(2, skipDays)

  if (!days.length) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: CLOSING_FALLBACK })
    await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)
    return
  }

  const allSlots: Date[] = []
  const dayLines: string[] = []

  for (const day of days) {
    dayLines.push(`📅 *${day.dateLabel}*`)
    for (const slot of day.slots) {
      const { hora } = formatSlotAR(slot)
      dayLines.push(`${SLOT_EMOJIS[allSlots.length]} ${hora} hs`)
      allSlots.push(slot)
    }
    dayLines.push('')
  }

  const nextSkip  = skipDays + days.length
  const encoded   = `${nextSkip}:::${allSlots.map(s => s.toISOString()).join('|')}`
  const validNums = allSlots.map((_, i) => `*${i + 1}*`).join(', ')

  const intro = skipDays === 0
    ? '¡Perfecto, ya tengo todo! 🎉\n\nPara arrancar, te propongo agendar una llamada de 30 minutos con Walo para charlar sobre lo que necesitás.\n\n'
    : 'Acá van más horarios disponibles:\n\n'

  const body = intro
    + dayLines.join('\n').trim()
    + `\n\nRespondé con el número del horario que más te quede bien (${validNums}) 🗓️`
    + '\nO si ninguno te sirve, escribí *"otros"* para ver más fechas.'

  await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body })
  await admin
    .from('whatsapp_conversations')
    .update({ bot_phase: 'booking', bot_next_question: `${BOOKING_SLOTS_PREFIX}${encoded}` })
    .eq('id', conversationId)
}

/**
 * Handles the lead's slot selection or "otros" request.
 * State format in bot_next_question: booking_slots:::NEXT_SKIP:::ISO1|ISO2|...|ISON
 * Legacy format (no NEXT_SKIP segment) is also handled gracefully.
 */
async function handleBookingPhase(
  admin: AdminClient,
  { leadId, conversationId, phone, text, botNextQuestion }: {
    leadId: string; conversationId: string; phone: string; text: string | null; botNextQuestion: string | null
  },
): Promise<void> {
  if (!botNextQuestion?.startsWith(BOOKING_SLOTS_PREFIX)) {
    await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)
    return
  }

  const raw = botNextQuestion.slice(BOOKING_SLOTS_PREFIX.length)

  // New format: "NEXT_SKIP:::ISO1|ISO2|..." — legacy format starts with a date char
  let nextSkip = 0
  let slotsStr = raw
  if (/^\d+:::/.test(raw)) {
    const sep = raw.indexOf(':::')
    nextSkip = parseInt(raw.slice(0, sep), 10) || 0
    slotsStr = raw.slice(sep + 3)
  }

  const slots = slotsStr.split('|').filter(Boolean).map(s => new Date(s))
  const trimmed = text?.trim() ?? ''

  // Lead wants to see different dates
  const wantsOthers = /^(otro|otros|ninguno|ninguna|no puedo|no me|no sirve|más|mas|ver más|ver mas|otras fechas)/i.test(trimmed)
    || /\b(otro|otros|ninguno|más (fecha|horario|dia|opcion)|otra fecha)\b/i.test(trimmed)

  if (wantsOthers) {
    await startBookingFlow(admin, { leadId, conversationId, phone }, nextSkip)
    return
  }

  const num = parseInt(trimmed, 10)
  const idx = num - 1

  if (isNaN(num) || idx < 0 || idx >= slots.length) {
    const validNums = slots.map((_, i) => `*${i + 1}*`).join(', ')
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: `Respondé con el número del horario (${validNums}) o escribí *"otros"* para ver más fechas 🙂`,
    })
    return
  }

  const slot = slots[idx]
  const { fecha, hora, label } = formatSlotAR(slot)

  const { data: lead } = await admin
    .from('leads')
    .select('nombre, apellido, empresa, email')
    .eq('id', leadId)
    .single()

  if (!lead) return

  try {
    const result = await createCalendarEvent({
      leadId,
      nombre:            lead.nombre ?? 'Lead',
      apellido:          lead.apellido ?? null,
      empresa:           lead.empresa ?? null,
      email:             lead.email ?? null,
      fecha_reunion:     fecha,
      reunion_hora:      hora,
      reunion_link:      null,
      responsable_email: process.env.GOOGLE_CALENDAR_SUBJECT ?? null,
    })

    // Build follow-up date: 2 days after the meeting
    const reunionDate  = new Date(`${fecha}T${hora}:00-03:00`)
    const followupDate = new Date(reunionDate.getTime() + 2 * 24 * 60 * 60 * 1000)

    await admin.from('leads').update({
      fecha_reunion:       fecha,
      reunion_hora:        hora,
      reunion_link:        result.meetLink ?? result.eventUrl,
      estado_pipeline:     'reunion_reservada',
      fecha_contacto:      new Date().toISOString(),
      fecha_followup:      followupDate.toISOString().slice(0, 10),
      calendar_event_id:   result.eventId,
      calendar_event_url:  result.eventUrl,
    }).eq('id', leadId)

    const daysFull  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const monthsFull = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const ar = new Date(slot.getTime() - 3 * 60 * 60 * 1000)
    const fullLabel = `${daysFull[ar.getDay()]} ${ar.getDate()} de ${monthsFull[ar.getMonth()]} a las ${hora} hs`

    const confirmation = `¡Reunión confirmada! 🎉\n\n📅 ${fullLabel}\n\n`
      + `Walo se va a conectar en ese horario para charlar sobre lo que necesitás 💛\n\n`
      + (lead.email ? `Te mandamos una invitación a ${lead.email} con el detalle de la reunión.\n\n` : '')
      + 'Si necesitás cambiar el horario o tenés alguna duda, escribime tranquilo 🙂'

    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: confirmation })
    await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)

    // Push notification to the team
    notifyAll({
      title: `📅 Reunión agendada — ${[lead.nombre, lead.apellido].filter(Boolean).join(' ')}`,
      body:  fullLabel,
      url:   `/leads/${leadId}`,
    }).catch(() => {})

    // Send emails (best-effort — don't fail the booking if email sending fails)
    const leadName = [lead.nombre, lead.apellido].filter(Boolean).join(' ') || 'Lead'
    const calendarUrl = result.eventUrl

    // Alora brand colors
    const BRAND    = '#1B4040'   // dark teal (primary)
    const BRAND_BG = '#EEF4F4'   // very light teal (background)
    const BRAND_LT = '#E0EEEE'   // light teal (accent strip)

    // Internal notification to the team (awaited so Vercel doesn't kill it before it sends)
    try { await sendGmail({
      from:    'info@globalalora.com',
      to:      'somosglobalalora@gmail.com',
      subject: `📅 Nueva reunión agendada — ${leadName} (${fullLabel})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${BRAND_BG};padding:32px;border-radius:12px">
          <div style="background:${BRAND};border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
            <img src="https://globalalora.com/logo-web.png" alt="Alora" style="height:36px;margin-bottom:12px;filter:brightness(0) invert(1)" onerror="this.style.display='none'">
            <h1 style="color:#fff;margin:0;font-size:22px">📅 Nueva reunión agendada</h1>
          </div>
          <div style="background:#fff;border-radius:8px;padding:24px;border:1px solid #d1e0e0">
            <p style="margin:0 0 16px;font-size:15px;color:#374151">
              <strong>${leadName}</strong> agendó una reunión de relevamiento.
            </p>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px">Fecha y hora</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px">${fullLabel}</td></tr>
              ${lead.empresa ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Empresa</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px">${lead.empresa}</td></tr>` : ''}
              ${lead.email   ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px">${lead.email}</td></tr>` : ''}
              <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">WhatsApp</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px">+${phone}</td></tr>
            </table>
            <div style="margin-top:20px;text-align:center">
              <a href="${calendarUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver en Google Calendar</a>
            </div>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">Alora CRM · Enviado automáticamente por Lidia</p>
        </div>
      `,
    }) } catch (err) { console.error('[Booking] Internal email failed:', err) }

    // Confirmation to the lead (only if they provided email)
    if (lead.email) {
      try { await sendGmail({
        from:    'info@globalalora.com',
        to:      lead.email,
        toName:  leadName,
        subject: `Reunión confirmada con Alora — ${fullLabel}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${BRAND_BG};padding:32px;border-radius:12px">
            <div style="background:${BRAND};border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
              <img src="https://globalalora.com/logo-web.png" alt="Alora" style="height:40px;margin-bottom:12px;filter:brightness(0) invert(1)" onerror="this.style.display='none'">
              <h1 style="color:#fff;margin:0;font-size:22px">¡Reunión confirmada! 🎉</h1>
            </div>
            <div style="background:#fff;border-radius:8px;padding:24px;border:1px solid #d1e0e0">
              <p style="margin:0 0 16px;font-size:15px;color:#374151">Hola <strong>${lead.nombre ?? 'ahí'}</strong>,</p>
              <p style="margin:0 0 20px;font-size:15px;color:#374151">Tu llamada de relevamiento con el equipo de Alora está confirmada:</p>
              <div style="background:${BRAND_LT};border-left:4px solid ${BRAND};padding:16px;border-radius:0 8px 8px 0;margin-bottom:20px">
                <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND}">📅 ${fullLabel}</p>
              </div>
              <p style="margin:0 0 20px;font-size:14px;color:#6b7280">En breve te llega la invitación de Google Calendar con el link de la videollamada.</p>
              <div style="text-align:center">
                <a href="${calendarUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver en Google Calendar</a>
              </div>
            </div>
            <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">Si necesitás reprogramar, respondé a este email o escribinos por WhatsApp.</p>
          </div>
        `,
      }) } catch (err) { console.error('[Booking] Lead confirmation email failed:', err) }
    }

  } catch (err) {
    console.error('[Booking] Failed to create calendar event:', err)
    // Fall back to external link
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: CLOSING_FALLBACK })
    await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)
  }
}

/**
 * Post-qualifying: Lidia only answers from the team's fixed FAQ list.
 * Detects rescheduling intent and restarts the booking flow.
 * Escalates to a human only when explicitly requested.
 */
async function handleFaqPhase(
  admin: AdminClient,
  { leadId, conversationId, phone, text }: { leadId: string; conversationId: string; phone: string; text: string | null },
): Promise<void> {
  const t = text?.trim() ?? ''

  // Lead wants to change / pick a different slot → restart booking from scratch
  const wantsReschedule = /\b(otro|otra|otros|cambiar|reagendar|reprogramar|diferente|distinto|quiero otro|quiero otra|cambio|cambien|no me queda|no puedo ese|otro horario|otra fecha|otro dia|otro día)\b/i.test(t)
  if (wantsReschedule) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: '¡Sin problema! Acá van los horarios disponibles para que elijas el que mejor te quede 🗓️',
    })
    await startBookingFlow(admin, { leadId, conversationId, phone }, 0)
    return
  }

  // If they ask about getting something free, set expectations gently
  const mentionsGratis = /\b(gratis|gratuito|gratuita|gratuitos|gratuitas|sin costo|sin cobrar|de onda|free)\b/i.test(t)
  if (mentionsGratis) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: 'Te cuento que en Alora somos un equipo 100% profesional y todos nuestros servicios son pagos 🙂 En la reunión con Walo van a charlar sobre lo que necesitás y los valores — ¡te aseguro que vale la pena! Si tenés alguna duda más, decime 😊',
    })
    return
  }

  const result = await matchFaqOrEscalate(admin, t)

  if (result.action === 'answer' && result.answer) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: result.answer })
    return
  }

  // Only step back (and say so) if they actually asked for a person. Anything
  // else that didn't match a FAQ just gets no reply — Lidia stays in FAQ mode
  // and keeps trying on the next message, instead of going silent for good.
  if (result.humanRequested) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: HANDOFF })
    await admin
      .from('whatsapp_conversations')
      .update({ bot_active: false })
      .eq('id', conversationId)
  }
}
