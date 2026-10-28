import type { SupabaseClient } from '@supabase/supabase-js'
import type { PipelineStage, PmPriority, ProjectTaskEstado } from '@/types'
import { changeLeadStage } from '@/lib/lead-stage'
import { updateLead } from '@/lib/lead-update'
import { normaliseVencimiento } from '@/lib/tz'
import { sendTaskAssignmentEmail } from '@/lib/task-emails'
import { notifyUser } from '@/lib/push-notify'
import { createTaskNotification } from '@/lib/task-notify'
import {
  ToolError, dateAR, daysSince, fullName, isUuid, num, resolveLeadId, resolveProjectId,
  resolveUser, sanitizeSearch, str, todayAR, userNames,
} from './helpers'

/** Contexto de cada llamada: cliente admin de Supabase + usuario del CRM que firma las acciones. */
export interface ToolContext {
  db: SupabaseClient
  userId: string
}

type JsonSchema = Record<string, unknown>

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean }
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

const ACTIVE_STAGES = [
  'lead_entrante', 'lead_contactado', 'sin_respuesta', 'reunion_reservada',
  'reunion_realizada', 'propuesta_en_armado', 'propuesta_enviada', 'follow_up',
]
const EXCLUDED_STAGES = new Set(['no_cualificado', 'consulta_cliente', 'testing'])
const OPEN_TICKET_STATES = ['nuevo', 'en_progreso', 'en_espera', 'estimacion']
const OPEN_PTASK_STATES = ['pendiente', 'en_progreso', 'bloqueada', 'en_revision']
const PRIORIDADES: PmPriority[] = ['baja', 'media', 'alta', 'urgente']
const PTASK_ESTADOS: ProjectTaskEstado[] = ['pendiente', 'en_progreso', 'bloqueada', 'en_revision', 'finalizada', 'cancelada']
const ACTIVITY_TYPES = ['nota', 'llamada', 'email', 'reunion', 'whatsapp']
const FUENTES = ['formulario', 'referido', 'linkedin', 'instagram', 'whatsapp', 'chatbot', 'mail', 'calendario', 'otro']

const READ = { readOnlyHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const

function limit(v: unknown, def: number, max = 100): number {
  const n = num(v)
  return Math.max(1, Math.min(max, n ? Math.floor(n) : def))
}

/** Valor de propuestas por lead: suma propuestas no rechazadas; si no hay, cae a los campos legacy del lead. */
async function proposalValues(db: SupabaseClient, leadIds: string[]) {
  const map = new Map<string, { usd: number; ars: number; pendientes: number }>()
  if (!leadIds.length) return map
  const { data } = await db
    .from('propuestas')
    .select('lead_id, valor_usd, valor_ars, moneda, estado')
    .in('lead_id', leadIds)
    .neq('estado', 'rechazada')
  for (const p of data ?? []) {
    const cur = map.get(p.lead_id) ?? { usd: 0, ars: 0, pendientes: 0 }
    cur.usd += Number(p.valor_usd ?? 0)
    cur.ars += Number(p.valor_ars ?? 0)
    if (p.estado === 'pendiente') cur.pendientes++
    map.set(p.lead_id, cur)
  }
  return map
}

async function stageLabels(db: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await db.from('pipeline_stages').select('*').order('order_position', { ascending: true })
  return new Map((data ?? []).map((s: { key: string; label: string }) => [s.key, s.label]))
}

// ═════════════════════════════════════════════════════════════════════════
// LECTURA
// ═════════════════════════════════════════════════════════════════════════

const resumenCrm: ToolDef = {
  name: 'resumen_crm',
  title: 'Resumen general del CRM',
  description:
    'Foto del estado de ALORA en este momento: pipeline activo por etapa con montos, leads nuevos del mes, ' +
    'leads fríos (sin actividad), tareas de leads vencidas, propuestas pendientes de respuesta, proyectos activos ' +
    'con tareas atrasadas, tickets abiertos y cobros vencidos o por vencer. Usala para "¿cómo venimos?", el brief diario o antes de priorizar.',
  inputSchema: {
    type: 'object',
    properties: {
      dias_frio: { type: 'number', description: 'Días sin actividad para considerar un lead frío (default 7).' },
      dias_cobro: { type: 'number', description: 'Ventana de días hacia adelante para cobros por vencer (default 7).' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    const diasFrio = num(args.dias_frio) ?? 7
    const diasCobro = num(args.dias_cobro) ?? 7
    const hoy = todayAR()
    const inicioMes = `${hoy.slice(0, 7)}-01`

    const [leadsRes, labels, tareasRes, propRes, projRes, ptasksRes, ticketsRes, paysRes] = await Promise.all([
      db.from('leads')
        .select('id, nombre, apellido, empresa, estado_pipeline, fecha_ingreso, created_at, last_activity_at, responsable_id, valor_propuesta_usd')
        .is('deleted_at', null),
      stageLabels(db),
      db.from('tasks').select('id, titulo, vencimiento, lead_id, asignado_a')
        .eq('completada', false).lt('vencimiento', new Date().toISOString()).order('vencimiento').limit(50),
      db.from('propuestas').select('id, lead_id, descripcion, valor_usd, valor_ars, moneda, fecha_envio, created_at')
        .eq('estado', 'pendiente'),
      db.from('projects').select('id, nombre, estado, prioridad, fecha_fin')
        .is('deleted_at', null).is('archived_at', null).in('estado', ['pendiente', 'en_desarrollo', 'en_pausa']),
      db.from('project_tasks').select('id, project_id, fecha_limite, estado')
        .is('deleted_at', null).in('estado', OPEN_PTASK_STATES).lt('fecha_limite', hoy),
      db.from('tickets').select('id, prioridad, estado').is('deleted_at', null).in('estado', OPEN_TICKET_STATES),
      db.from('payments').select('id, invoice_id, descripcion, monto, fecha_vencimiento')
        .is('fecha_pago', null).lte('fecha_vencimiento', dateAR(diasCobro)).order('fecha_vencimiento'),
    ])

    const leads = leadsRes.data ?? []
    const active = leads.filter(l => ACTIVE_STAGES.includes(l.estado_pipeline))
    const pv = await proposalValues(db, active.map(l => l.id))

    const porEtapa: Record<string, { etapa: string; cantidad: number; usd: number }> = {}
    for (const l of active) {
      const e = (porEtapa[l.estado_pipeline] ??= { etapa: labels.get(l.estado_pipeline) ?? l.estado_pipeline, cantidad: 0, usd: 0 })
      e.cantidad++
      e.usd += pv.get(l.id)?.usd || Number(l.valor_propuesta_usd ?? 0)
    }

    const nuevosMes = leads.filter(l => !EXCLUDED_STAGES.has(l.estado_pipeline) && (l.fecha_ingreso ?? l.created_at) >= inicioMes)
    const ganadosMes = leads.filter(l => l.estado_pipeline === 'cliente_ganado')
    const frios = active
      .map(l => ({ l, dias: daysSince(l.last_activity_at) ?? 0 }))
      .filter(x => x.dias >= diasFrio)
      .sort((a, b) => b.dias - a.dias)

    const leadById = new Map(leads.map(l => [l.id, l]))
    const names = await userNames(db, [...active.map(l => l.responsable_id), ...(tareasRes.data ?? []).map(t => t.asignado_a)])

    const atrasadasPorProyecto = new Map<string, number>()
    for (const t of ptasksRes.data ?? []) atrasadasPorProyecto.set(t.project_id, (atrasadasPorProyecto.get(t.project_id) ?? 0) + 1)

    const invoiceIds = [...new Set((paysRes.data ?? []).map(p => p.invoice_id))]
    const { data: invs } = invoiceIds.length
      ? await db.from('invoices').select('id, numero, cliente_nombre, moneda, estado').in('id', invoiceIds).is('deleted_at', null)
      : { data: [] as { id: string; numero: string; cliente_nombre: string; moneda: string; estado: string }[] }
    const invById = new Map((invs ?? []).map(i => [i.id, i]))

    return {
      fecha: hoy,
      pipeline_activo: {
        total_leads: active.length,
        total_usd: Math.round(Object.values(porEtapa).reduce((s, e) => s + e.usd, 0)),
        por_etapa: ACTIVE_STAGES.filter(k => porEtapa[k]).map(k => ({ key: k, ...porEtapa[k], usd: Math.round(porEtapa[k].usd) })),
      },
      leads_nuevos_este_mes: nuevosMes.length,
      clientes_ganados_total: ganadosMes.length,
      leads_frios: {
        criterio: `sin actividad hace ${diasFrio}+ días`,
        cantidad: frios.length,
        top: frios.slice(0, 10).map(({ l, dias }) => ({
          id: l.id, lead: fullName(l), etapa: labels.get(l.estado_pipeline) ?? l.estado_pipeline,
          dias_sin_actividad: dias, responsable: l.responsable_id ? names.get(l.responsable_id) ?? null : null,
        })),
      },
      tareas_lead_vencidas: (tareasRes.data ?? []).map(t => ({
        id: t.id, titulo: t.titulo, vencimiento: t.vencimiento,
        lead: leadById.get(t.lead_id) ? fullName(leadById.get(t.lead_id)!) : t.lead_id,
        asignado: t.asignado_a ? names.get(t.asignado_a) ?? null : null,
      })),
      propuestas_pendientes: (propRes.data ?? []).map(p => ({
        id: p.id, lead: leadById.get(p.lead_id) ? fullName(leadById.get(p.lead_id)!) : p.lead_id,
        descripcion: p.descripcion, valor: p.moneda === 'ARS' ? `ARS ${p.valor_ars ?? '?'}` : `USD ${p.valor_usd ?? '?'}`,
        dias_desde_envio: daysSince(p.fecha_envio ?? p.created_at),
      })).sort((a, b) => (b.dias_desde_envio ?? 0) - (a.dias_desde_envio ?? 0)),
      proyectos_activos: (projRes.data ?? []).map(p => ({
        id: p.id, nombre: p.nombre, estado: p.estado, prioridad: p.prioridad, fecha_fin: p.fecha_fin,
        tareas_atrasadas: atrasadasPorProyecto.get(p.id) ?? 0,
      })).sort((a, b) => b.tareas_atrasadas - a.tareas_atrasadas),
      tickets_abiertos: {
        total: ticketsRes.data?.length ?? 0,
        urgentes_o_altos: (ticketsRes.data ?? []).filter(t => t.prioridad === 'urgente' || t.prioridad === 'alta').length,
      },
      cobros: (paysRes.data ?? [])
        .filter(p => invById.get(p.invoice_id) && invById.get(p.invoice_id)!.estado !== 'cancelada')
        .map(p => {
          const inv = invById.get(p.invoice_id)!
          return {
            cliente: inv.cliente_nombre, factura: inv.numero, cuota: p.descripcion,
            monto: `${inv.moneda} ${p.monto}`, vence: p.fecha_vencimiento,
            estado: p.fecha_vencimiento && p.fecha_vencimiento < hoy ? 'vencido' : 'por vencer',
          }
        }),
    }
  },
}

const listarEtapas: ToolDef = {
  name: 'listar_etapas',
  title: 'Etapas del pipeline',
  description: 'Lista las etapas del pipeline configuradas en el CRM (key, nombre visible, zona, orden). Usá la "key" al mover leads.',
  inputSchema: { type: 'object', properties: {} },
  annotations: READ,
  async handler(_args, { db }) {
    const { data, error } = await db.from('pipeline_stages').select('*').order('order_position', { ascending: true })
    if (error) throw new ToolError(error.message)
    return (data ?? []).map((s: Record<string, unknown>) => ({ key: s.key, label: s.label, zona: s.zone, descripcion: s.descripcion ?? null }))
  },
}

const listarUsuarios: ToolDef = {
  name: 'listar_usuarios',
  title: 'Usuarios del CRM',
  description: 'Usuarios del CRM (equipo de ALORA) con id, nombre, email y rol. Sirve para asignar responsables o tareas.',
  inputSchema: { type: 'object', properties: {} },
  annotations: READ,
  async handler(_args, { db }) {
    const { data, error } = await db.from('users').select('id, full_name, email, role').order('full_name')
    if (error) throw new ToolError(error.message)
    return data
  },
}

const buscarLeads: ToolDef = {
  name: 'buscar_leads',
  title: 'Buscar leads',
  description:
    'Busca leads del CRM con filtros combinables: texto libre (nombre, apellido, empresa, email), etapa(s), responsable, ' +
    'fuente, días sin actividad o ingresados desde una fecha. Por defecto excluye leads perdidos, no cualificados y de testing ' +
    'salvo que pidas esas etapas explícitamente.',
  inputSchema: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'Texto a buscar en nombre, apellido, empresa o email.' },
      etapas: { type: 'array', items: { type: 'string' }, description: 'Keys de etapa (ver listar_etapas). Ej: ["propuesta_enviada","follow_up"].' },
      solo_activos: { type: 'boolean', description: 'Solo etapas activas del pipeline (entrante → follow up). Default false.' },
      responsable: { type: 'string', description: 'Nombre, email o id del responsable.' },
      fuente: { type: 'string', enum: FUENTES },
      sin_actividad_dias: { type: 'number', description: 'Solo leads sin actividad hace al menos N días.' },
      ingresados_desde: { type: 'string', description: 'YYYY-MM-DD: solo leads ingresados desde esa fecha.' },
      limite: { type: 'number', description: 'Máximo de resultados (default 25, máx 100).' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    let q = db
      .from('leads')
      .select('id, nombre, apellido, empresa, email, telefono, estado_pipeline, fuente, responsable_id, fecha_ingreso, stage_updated_at, last_activity_at, fecha_reunion, valor_propuesta_usd, servicios_interesados')
      .is('deleted_at', null)

    const texto = str(args.texto)
    if (texto) {
      const t = sanitizeSearch(texto)
      q = q.or(`nombre.ilike.%${t}%,apellido.ilike.%${t}%,empresa.ilike.%${t}%,email.ilike.%${t}%`)
    }
    const etapas = Array.isArray(args.etapas) ? (args.etapas as unknown[]).filter((e): e is string => typeof e === 'string') : []
    if (etapas.length) q = q.in('estado_pipeline', etapas)
    else if (args.solo_activos) q = q.in('estado_pipeline', ACTIVE_STAGES)
    const resp = await resolveUser(db, args.responsable)
    if (resp) q = q.eq('responsable_id', resp)
    if (str(args.fuente)) q = q.eq('fuente', str(args.fuente)!)
    const sinAct = num(args.sin_actividad_dias)
    if (sinAct !== undefined) q = q.lt('last_activity_at', new Date(Date.now() - sinAct * 86_400_000).toISOString())
    if (str(args.ingresados_desde)) q = q.gte('fecha_ingreso', str(args.ingresados_desde)!)

    const { data, error } = await q.order('last_activity_at', { ascending: false }).limit(300)
    if (error) throw new ToolError(error.message)

    let rows = data ?? []
    if (!etapas.length) rows = rows.filter(l => !['cliente_perdido', 'no_cualificado', 'testing'].includes(l.estado_pipeline))
    const total = rows.length
    rows = rows.slice(0, limit(args.limite, 25))

    const [labels, names, pv] = await Promise.all([
      stageLabels(db),
      userNames(db, rows.map(l => l.responsable_id)),
      proposalValues(db, rows.map(l => l.id)),
    ])
    return {
      total_encontrados: total,
      mostrando: rows.length,
      leads: rows.map(l => ({
        id: l.id,
        lead: fullName(l),
        email: l.email, telefono: l.telefono,
        etapa: labels.get(l.estado_pipeline) ?? l.estado_pipeline,
        etapa_key: l.estado_pipeline,
        dias_en_etapa: daysSince(l.stage_updated_at),
        dias_sin_actividad: daysSince(l.last_activity_at),
        responsable: l.responsable_id ? names.get(l.responsable_id) ?? null : null,
        fuente: l.fuente,
        servicios: l.servicios_interesados,
        valor_usd: pv.get(l.id)?.usd || l.valor_propuesta_usd || null,
        fecha_reunion: l.fecha_reunion,
      })),
    }
  },
}

const verLead: ToolDef = {
  name: 'ver_lead',
  title: 'Ficha completa de un lead',
  description:
    'Ficha completa de un lead: datos de contacto, etapa, responsable, propuestas, últimas actividades, tareas pendientes, ' +
    'historial de etapas, reuniones y proyecto asociado. Acepta id o texto (nombre/empresa/email).',
  inputSchema: {
    type: 'object',
    required: ['lead'],
    properties: {
      lead: { type: 'string', description: 'Id del lead o texto para identificarlo (nombre, empresa, email).' },
      actividades: { type: 'number', description: 'Cuántas actividades recientes traer (default 15).' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    const id = await resolveLeadId(db, args.lead)
    const { data: lead, error } = await db.from('leads').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) throw new ToolError(error.message)
    if (!lead) throw new ToolError('Lead no encontrado.')

    const [acts, tasks, props, hist, proj, labels] = await Promise.all([
      db.from('activities').select('tipo, descripcion, created_at, user_id').eq('lead_id', id)
        .order('created_at', { ascending: false }).limit(limit(args.actividades, 15, 50)),
      db.from('tasks').select('id, titulo, descripcion, vencimiento, asignado_a, completada').eq('lead_id', id).eq('completada', false).order('vencimiento'),
      db.from('propuestas').select('id, descripcion, valor_usd, valor_ars, moneda, tipo_pago, estado, link, fecha_envio, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
      db.from('stage_history').select('etapa, fecha_ingreso').eq('lead_id', id).order('fecha_ingreso'),
      db.from('projects').select('id, nombre, estado').eq('lead_id', id).is('deleted_at', null).maybeSingle(),
      stageLabels(db),
    ])
    const names = await userNames(db, [lead.responsable_id, ...(acts.data ?? []).map(a => a.user_id), ...(tasks.data ?? []).map(t => t.asignado_a)])

    return {
      id: lead.id,
      lead: fullName(lead),
      contacto: { email: lead.email, email_secundario: lead.email_secundario, telefono: lead.telefono, pais: lead.pais, sitio_web: lead.sitio_web },
      etapa: labels.get(lead.estado_pipeline) ?? lead.estado_pipeline,
      etapa_key: lead.estado_pipeline,
      dias_en_etapa: daysSince(lead.stage_updated_at),
      dias_sin_actividad: daysSince(lead.last_activity_at),
      responsable: lead.responsable_id ? names.get(lead.responsable_id) ?? lead.responsable_id : null,
      fuente: lead.fuente,
      servicios_interesados: lead.servicios_interesados,
      consulta: lead.consulta_detallada,
      notas: lead.notas,
      fechas: {
        ingreso: lead.fecha_ingreso, contacto: lead.fecha_contacto, reunion: lead.fecha_reunion,
        reunion_hora: lead.reunion_hora, asistencia_reunion: lead.reunion_asistencia,
        propuesta: lead.fecha_propuesta, followup: lead.fecha_followup, cierre: lead.fecha_cierre,
      },
      links: { drive: lead.drive_folder_url, calendario: lead.calendar_event_url, reunion: lead.reunion_link },
      proyecto: proj.data ?? null,
      propuestas: props.data ?? [],
      tareas_pendientes: (tasks.data ?? []).map(t => ({ ...t, asignado_a: t.asignado_a ? names.get(t.asignado_a) ?? t.asignado_a : null })),
      historial_etapas: (hist.data ?? []).map(h => ({ etapa: labels.get(h.etapa) ?? h.etapa, desde: h.fecha_ingreso })),
      actividades_recientes: (acts.data ?? []).map(a => ({
        fecha: a.created_at, tipo: a.tipo, descripcion: a.descripcion,
        por: a.user_id ? names.get(a.user_id) ?? null : 'sistema',
      })),
    }
  },
}

const tareasPendientes: ToolDef = {
  name: 'tareas_pendientes',
  title: 'Tareas pendientes',
  description:
    'Tareas abiertas del equipo: tareas comerciales de leads y tareas de proyectos. Se puede filtrar por persona, ' +
    'traer solo vencidas, o las que vencen en los próximos N días.',
  inputSchema: {
    type: 'object',
    properties: {
      persona: { type: 'string', description: 'Nombre, email o id del asignado.' },
      solo_vencidas: { type: 'boolean', description: 'Solo tareas con fecha pasada.' },
      proximos_dias: { type: 'number', description: 'Incluir solo las que vencen en los próximos N días (además de las vencidas).' },
      tipo: { type: 'string', enum: ['todas', 'leads', 'proyectos'], description: 'Default "todas".' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    const persona = await resolveUser(db, args.persona)
    const tipo = str(args.tipo) ?? 'todas'
    const hoy = todayAR()
    const dias = num(args.proximos_dias)
    const hasta = args.solo_vencidas ? hoy : dias !== undefined ? dateAR(dias) : null

    const out: Record<string, unknown> = {}

    if (tipo !== 'proyectos') {
      let q = db.from('tasks').select('id, titulo, descripcion, vencimiento, asignado_a, lead_id').eq('completada', false)
      if (persona) q = q.eq('asignado_a', persona)
      if (args.solo_vencidas) q = q.lt('vencimiento', new Date().toISOString())
      else if (hasta) q = q.lte('vencimiento', `${hasta}T23:59:59-03:00`)
      const { data, error } = await q.order('vencimiento', { ascending: true, nullsFirst: false }).limit(100)
      if (error) throw new ToolError(error.message)
      const leadIds = [...new Set((data ?? []).map(t => t.lead_id))]
      const { data: leads } = leadIds.length
        ? await db.from('leads').select('id, nombre, apellido, empresa').in('id', leadIds)
        : { data: [] as { id: string; nombre: string; apellido: string | null; empresa: string | null }[] }
      const lm = new Map((leads ?? []).map(l => [l.id, fullName(l)]))
      const names = await userNames(db, (data ?? []).map(t => t.asignado_a))
      out.tareas_de_leads = (data ?? []).map(t => ({
        id: t.id, titulo: t.titulo, descripcion: t.descripcion, vencimiento: t.vencimiento,
        vencida: !!t.vencimiento && new Date(t.vencimiento) < new Date(),
        lead: lm.get(t.lead_id) ?? t.lead_id, lead_id: t.lead_id,
        asignado: t.asignado_a ? names.get(t.asignado_a) ?? null : null,
      }))
    }

    if (tipo !== 'leads') {
      let q = db.from('project_tasks')
        .select('id, titulo, estado, prioridad, fecha_limite, assignee_id, project_id')
        .is('deleted_at', null).in('estado', OPEN_PTASK_STATES)
      if (persona) q = q.eq('assignee_id', persona)
      if (args.solo_vencidas) q = q.lt('fecha_limite', hoy)
      else if (hasta) q = q.lte('fecha_limite', hasta)
      const { data, error } = await q.order('fecha_limite', { ascending: true, nullsFirst: false }).limit(150)
      if (error) throw new ToolError(error.message)
      const projIds = [...new Set((data ?? []).map(t => t.project_id))]
      const { data: projs } = projIds.length
        ? await db.from('projects').select('id, nombre').in('id', projIds)
        : { data: [] as { id: string; nombre: string }[] }
      const pm = new Map((projs ?? []).map(p => [p.id, p.nombre]))
      const names = await userNames(db, (data ?? []).map(t => t.assignee_id))
      out.tareas_de_proyectos = (data ?? []).map(t => ({
        id: t.id, titulo: t.titulo, estado: t.estado, prioridad: t.prioridad, fecha_limite: t.fecha_limite,
        vencida: !!t.fecha_limite && t.fecha_limite < hoy,
        proyecto: pm.get(t.project_id) ?? t.project_id, proyecto_id: t.project_id,
        asignado: t.assignee_id ? names.get(t.assignee_id) ?? null : null,
      }))
    }
    return out
  },
}

const listarProyectos: ToolDef = {
  name: 'listar_proyectos',
  title: 'Listar proyectos',
  description:
    'Proyectos de clientes con estado, prioridad, fechas, cliente asociado y avance (tareas abiertas, finalizadas y atrasadas). ' +
    'Por defecto trae los no finalizados ni archivados.',
  inputSchema: {
    type: 'object',
    properties: {
      estado: { type: 'string', enum: ['pendiente', 'en_desarrollo', 'en_pausa', 'finalizado', 'todos'], description: 'Default: todos menos finalizado.' },
      texto: { type: 'string', description: 'Filtrar por nombre de proyecto.' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    let q = db.from('projects')
      .select('id, nombre, descripcion, estado, prioridad, fecha_inicio, fecha_fin, presupuesto_usd, lead_id')
      .is('deleted_at', null).is('archived_at', null)
    const estado = str(args.estado)
    if (estado && estado !== 'todos') q = q.eq('estado', estado)
    else if (!estado) q = q.neq('estado', 'finalizado')
    if (str(args.texto)) q = q.ilike('nombre', `%${sanitizeSearch(str(args.texto)!)}%`)
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(100)
    if (error) throw new ToolError(error.message)
    const projs = data ?? []
    if (!projs.length) return { proyectos: [] }

    const ids = projs.map(p => p.id)
    const leadIds = projs.map(p => p.lead_id).filter(Boolean) as string[]
    const [tasksRes, leadsRes] = await Promise.all([
      db.from('project_tasks').select('project_id, estado, fecha_limite').in('project_id', ids).is('deleted_at', null).is('parent_task_id', null),
      leadIds.length ? db.from('leads').select('id, nombre, apellido, empresa').in('id', leadIds) : Promise.resolve({ data: [] as { id: string; nombre: string; apellido: string | null; empresa: string | null }[] }),
    ])
    const hoy = todayAR()
    const stats = new Map<string, { abiertas: number; finalizadas: number; atrasadas: number; bloqueadas: number }>()
    for (const t of tasksRes.data ?? []) {
      const s = stats.get(t.project_id) ?? { abiertas: 0, finalizadas: 0, atrasadas: 0, bloqueadas: 0 }
      if (t.estado === 'finalizada') s.finalizadas++
      else if (t.estado !== 'cancelada') {
        s.abiertas++
        if (t.estado === 'bloqueada') s.bloqueadas++
        if (t.fecha_limite && t.fecha_limite < hoy) s.atrasadas++
      }
      stats.set(t.project_id, s)
    }
    const lm = new Map((leadsRes.data ?? []).map(l => [l.id, fullName(l)]))
    return {
      proyectos: projs.map(p => {
        const s = stats.get(p.id) ?? { abiertas: 0, finalizadas: 0, atrasadas: 0, bloqueadas: 0 }
        const total = s.abiertas + s.finalizadas
        return {
          id: p.id, nombre: p.nombre, cliente: p.lead_id ? lm.get(p.lead_id) ?? null : null,
          estado: p.estado, prioridad: p.prioridad, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin,
          vence_pronto_o_vencido: !!p.fecha_fin && p.fecha_fin <= dateAR(7) && p.estado !== 'finalizado',
          avance: total ? `${Math.round((s.finalizadas / total) * 100)}% (${s.finalizadas}/${total} tareas)` : 'sin tareas',
          tareas_abiertas: s.abiertas, tareas_atrasadas: s.atrasadas, tareas_bloqueadas: s.bloqueadas,
        }
      }),
    }
  },
}

const verProyecto: ToolDef = {
  name: 'ver_proyecto',
  title: 'Detalle de un proyecto',
  description: 'Detalle de un proyecto: datos, miembros, secciones del tablero y sus tareas (con estado, responsable y fechas). Acepta id o nombre.',
  inputSchema: {
    type: 'object',
    required: ['proyecto'],
    properties: {
      proyecto: { type: 'string', description: 'Id o nombre del proyecto.' },
      incluir_finalizadas: { type: 'boolean', description: 'Incluir tareas finalizadas/canceladas (default false).' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    const id = await resolveProjectId(db, args.proyecto)
    const { data: p, error } = await db.from('projects').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) throw new ToolError(error.message)
    if (!p) throw new ToolError('Proyecto no encontrado.')

    let tq = db.from('project_tasks')
      .select('id, titulo, descripcion, estado, prioridad, assignee_id, section_id, parent_task_id, fecha_inicio, fecha_limite, fecha_finalizacion, horas_estimadas, position')
      .eq('project_id', id).is('deleted_at', null)
    if (!args.incluir_finalizadas) tq = tq.not('estado', 'in', '(finalizada,cancelada)')
    const [sections, tasks, members, lead] = await Promise.all([
      db.from('task_sections').select('id, nombre, position, is_done').eq('project_id', id).order('position'),
      tq.order('position'),
      db.from('project_members').select('user_id, role').eq('project_id', id),
      p.lead_id ? db.from('leads').select('id, nombre, apellido, empresa').eq('id', p.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const names = await userNames(db, [...(tasks.data ?? []).map(t => t.assignee_id), ...(members.data ?? []).map(m => m.user_id)])
    const hoy = todayAR()
    const fmt = (t: NonNullable<typeof tasks.data>[number]) => ({
      id: t.id, titulo: t.titulo, descripcion: t.descripcion, estado: t.estado, prioridad: t.prioridad,
      asignado: t.assignee_id ? names.get(t.assignee_id) ?? null : null,
      fecha_limite: t.fecha_limite, atrasada: !!t.fecha_limite && t.fecha_limite < hoy && !['finalizada', 'cancelada'].includes(t.estado),
      horas_estimadas: t.horas_estimadas, subtarea_de: t.parent_task_id,
    })
    const bySection = new Map<string | null, ReturnType<typeof fmt>[]>()
    for (const t of tasks.data ?? []) {
      const arr = bySection.get(t.section_id) ?? []
      arr.push(fmt(t))
      bySection.set(t.section_id, arr)
    }
    return {
      id: p.id, nombre: p.nombre, descripcion: p.descripcion, estado: p.estado, prioridad: p.prioridad,
      fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin, presupuesto_usd: p.presupuesto_usd,
      cliente: lead.data ? { id: lead.data.id, nombre: fullName(lead.data) } : null,
      miembros: (members.data ?? []).map(m => ({ nombre: names.get(m.user_id) ?? m.user_id, rol: m.role })),
      secciones: [
        ...(sections.data ?? []).map(s => ({ id: s.id, nombre: s.nombre, es_columna_finalizado: s.is_done, tareas: bySection.get(s.id) ?? [] })),
        ...(bySection.get(null)?.length ? [{ id: null, nombre: 'Sin sección', es_columna_finalizado: false, tareas: bySection.get(null)! }] : []),
      ],
    }
  },
}

const listarPropuestas: ToolDef = {
  name: 'listar_propuestas',
  title: 'Listar propuestas',
  description: 'Propuestas comerciales con lead, monto, estado y días desde el envío. Default: pendientes.',
  inputSchema: {
    type: 'object',
    properties: {
      estado: { type: 'string', enum: ['pendiente', 'aceptada', 'rechazada', 'todas'] },
      desde: { type: 'string', description: 'YYYY-MM-DD: creadas desde esa fecha.' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    let q = db.from('propuestas').select('id, lead_id, descripcion, valor_usd, valor_ars, moneda, tipo_pago, estado, link, fecha_envio, created_at')
    const estado = str(args.estado) ?? 'pendiente'
    if (estado !== 'todas') q = q.eq('estado', estado)
    if (str(args.desde)) q = q.gte('created_at', str(args.desde)!)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(100)
    if (error) throw new ToolError(error.message)
    const leadIds = [...new Set((data ?? []).map(p => p.lead_id))]
    const { data: leads } = leadIds.length
      ? await db.from('leads').select('id, nombre, apellido, empresa, estado_pipeline').in('id', leadIds)
      : { data: [] as { id: string; nombre: string; apellido: string | null; empresa: string | null; estado_pipeline: string }[] }
    const lm = new Map((leads ?? []).map(l => [l.id, l]))
    const totUsd = (data ?? []).reduce((s, p) => s + Number(p.valor_usd ?? 0), 0)
    return {
      cantidad: data?.length ?? 0,
      total_usd: Math.round(totUsd),
      propuestas: (data ?? []).map(p => ({
        id: p.id,
        lead: lm.get(p.lead_id) ? fullName(lm.get(p.lead_id)!) : p.lead_id, lead_id: p.lead_id,
        etapa_lead: lm.get(p.lead_id)?.estado_pipeline ?? null,
        descripcion: p.descripcion, estado: p.estado, tipo_pago: p.tipo_pago,
        valor: p.moneda === 'ARS' ? `ARS ${p.valor_ars ?? '?'}` : `USD ${p.valor_usd ?? '?'}`,
        enviada: p.fecha_envio, dias_desde_envio: daysSince(p.fecha_envio ?? p.created_at), link: p.link,
      })),
    }
  },
}

const listarTickets: ToolDef = {
  name: 'listar_tickets',
  title: 'Tickets de soporte',
  description: 'Tickets de soporte de clientes. Default: abiertos (nuevo, en progreso, en espera, estimación), ordenados por prioridad.',
  inputSchema: {
    type: 'object',
    properties: {
      estado: { type: 'string', enum: ['abiertos', 'nuevo', 'en_progreso', 'en_espera', 'estimacion', 'resuelto', 'cerrado', 'todos'] },
      prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'] },
      persona: { type: 'string', description: 'Asignado (nombre, email o id).' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    let q = db.from('tickets')
      .select('id, numero, titulo, estado, prioridad, categoria, client_nombre, client_empresa, assignee_id, project_id, client_unread, last_client_activity_at, created_at')
      .is('deleted_at', null)
    const estado = str(args.estado) ?? 'abiertos'
    if (estado === 'abiertos') q = q.in('estado', OPEN_TICKET_STATES)
    else if (estado !== 'todos') q = q.eq('estado', estado)
    if (str(args.prioridad)) q = q.eq('prioridad', str(args.prioridad)!)
    const persona = await resolveUser(db, args.persona)
    if (persona) q = q.eq('assignee_id', persona)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(100)
    if (error) throw new ToolError(error.message)
    const names = await userNames(db, (data ?? []).map(t => t.assignee_id))
    const rank: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 }
    return (data ?? [])
      .map(t => ({
        id: t.id, numero: t.numero, titulo: t.titulo, estado: t.estado, prioridad: t.prioridad, categoria: t.categoria,
        cliente: [t.client_nombre, t.client_empresa].filter(Boolean).join(' — '),
        asignado: t.assignee_id ? names.get(t.assignee_id) ?? null : null,
        dias_abierto: daysSince(t.created_at),
        respuesta_cliente_sin_leer: t.client_unread,
      }))
      .sort((a, b) => (rank[a.prioridad] ?? 9) - (rank[b.prioridad] ?? 9))
  },
}

const cobranzas: ToolDef = {
  name: 'cobranzas',
  title: 'Cobranzas',
  description: 'Cuotas sin cobrar: vencidas y las que vencen en los próximos N días, con cliente, factura y monto. Default: próximos 30 días.',
  inputSchema: {
    type: 'object',
    properties: {
      proximos_dias: { type: 'number', description: 'Ventana hacia adelante (default 30).' },
      solo_vencidas: { type: 'boolean' },
    },
  },
  annotations: READ,
  async handler(args, { db }) {
    const hoy = todayAR()
    let q = db.from('payments').select('id, invoice_id, descripcion, monto, fecha_vencimiento').is('fecha_pago', null)
    q = args.solo_vencidas ? q.lt('fecha_vencimiento', hoy) : q.lte('fecha_vencimiento', dateAR(num(args.proximos_dias) ?? 30))
    const { data, error } = await q.order('fecha_vencimiento').limit(200)
    if (error) throw new ToolError(error.message)
    const invIds = [...new Set((data ?? []).map(p => p.invoice_id))]
    const { data: invs } = invIds.length
      ? await db.from('invoices').select('id, numero, cliente_nombre, moneda, estado, tipo_cobranza').in('id', invIds).is('deleted_at', null)
      : { data: [] as { id: string; numero: string; cliente_nombre: string; moneda: string; estado: string; tipo_cobranza: string }[] }
    const im = new Map((invs ?? []).map(i => [i.id, i]))
    const rows = (data ?? []).filter(p => im.get(p.invoice_id) && im.get(p.invoice_id)!.estado !== 'cancelada').map(p => {
      const inv = im.get(p.invoice_id)!
      return {
        payment_id: p.id, cliente: inv.cliente_nombre, factura: inv.numero, tipo: inv.tipo_cobranza, cuota: p.descripcion,
        moneda: inv.moneda, monto: Number(p.monto), vence: p.fecha_vencimiento,
        estado: p.fecha_vencimiento && p.fecha_vencimiento < hoy ? 'vencido' : 'por vencer',
      }
    })
    const totales: Record<string, { vencido: number; por_vencer: number }> = {}
    for (const r of rows) {
      const t = (totales[r.moneda] ??= { vencido: 0, por_vencer: 0 })
      if (r.estado === 'vencido') t.vencido += r.monto
      else t.por_vencer += r.monto
    }
    return { totales, cuotas: rows }
  },
}

// ═════════════════════════════════════════════════════════════════════════
// ESCRITURA
// ═════════════════════════════════════════════════════════════════════════

const moverLeadEtapa: ToolDef = {
  name: 'mover_lead_etapa',
  title: 'Mover lead de etapa',
  description:
    'Cambia la etapa del pipeline de un lead, con los mismos efectos que arrastrar la tarjeta en el CRM: fechas automáticas, ' +
    'actividad, historial, carpeta de Drive al reservar reunión, proyecto automático al pasar a cliente_ganado, ' +
    'rechazo de propuestas pendientes al pasar a cliente_perdido y bot apagado en no_cualificado. Confirmá con el usuario antes de usarla.',
  inputSchema: {
    type: 'object',
    required: ['lead', 'etapa'],
    properties: {
      lead: { type: 'string', description: 'Id del lead o texto para identificarlo.' },
      etapa: { type: 'string', description: 'Key de la etapa destino (ver listar_etapas).' },
      fecha_reunion: { type: 'string', description: 'Solo para reunion_reservada: fecha/hora ISO de la reunión.' },
    },
  },
  annotations: WRITE,
  async handler(args, { db, userId }) {
    const leadId = await resolveLeadId(db, args.lead)
    const etapa = str(args.etapa)
    if (!etapa) throw new ToolError('Falta la etapa destino.')
    const r = await changeLeadStage(db, { leadId, estado_pipeline: etapa as PipelineStage, fecha_reunion: str(args.fecha_reunion) ?? null, userId })
    if (!r.ok) throw new ToolError(r.error === 'Etapa inválida' ? `Etapa inválida: "${etapa}". Usá listar_etapas para ver las keys.` : r.error)
    return { ok: true, lead: fullName(r.data as { nombre?: string; apellido?: string; empresa?: string }), de: r.estado_anterior, a: etapa }
  },
}

const registrarActividad: ToolDef = {
  name: 'registrar_actividad',
  title: 'Registrar actividad en un lead',
  description: 'Agrega una actividad al historial de un lead (nota, llamada, email, reunión o WhatsApp). Usala para dejar registro de lo que pasó con un cliente.',
  inputSchema: {
    type: 'object',
    required: ['lead', 'descripcion'],
    properties: {
      lead: { type: 'string', description: 'Id del lead o texto para identificarlo.' },
      tipo: { type: 'string', enum: ACTIVITY_TYPES, description: 'Default "nota".' },
      descripcion: { type: 'string', description: 'Qué pasó, con el detalle necesario.' },
    },
  },
  annotations: WRITE,
  async handler(args, { db, userId }) {
    const leadId = await resolveLeadId(db, args.lead)
    const descripcion = str(args.descripcion)
    if (!descripcion) throw new ToolError('Falta la descripción.')
    const tipo = str(args.tipo) ?? 'nota'
    if (!ACTIVITY_TYPES.includes(tipo)) throw new ToolError(`Tipo inválido. Opciones: ${ACTIVITY_TYPES.join(', ')}.`)
    const { data, error } = await db.from('activities')
      .insert({ lead_id: leadId, user_id: userId, tipo, descripcion, metadata: { origen: 'agente_claude' } })
      .select('id, created_at').single()
    if (error) throw new ToolError(error.message)
    return { ok: true, actividad_id: data.id, lead_id: leadId }
  },
}

const ASISTENCIAS = ['se_presento', 'no_se_presento', 'reagendo', 'cancelada_alora']
const LEAD_TEXT_FIELDS = ['nombre', 'apellido', 'empresa', 'email', 'email_secundario', 'telefono', 'pais', 'sitio_web', 'consulta_detallada', 'notas', 'reunion_link'] as const
const LEAD_DATE_FIELDS = ['fecha_reunion', 'fecha_contacto', 'fecha_propuesta', 'fecha_followup', 'fecha_cierre'] as const

const actualizarLead: ToolDef = {
  name: 'actualizar_lead',
  title: 'Editar ficha de un lead',
  description:
    'Edita campos de la ficha de un lead con los mismos efectos que editarlos en el CRM: datos de contacto, empresa, ' +
    'responsable, servicios, notas, consulta, fechas (reunión, contacto, propuesta, follow up, cierre), hora y link de reunión, ' +
    'y asistencia a la reunión (se_presento, no_se_presento, reagendo, cancelada_alora — queda registrada como actividad y en el historial de reuniones). ' +
    'Ojo: si el lead está en "Reunión reservada" y cambiás fecha_reunion, el CRM crea/actualiza el evento de Google Calendar ' +
    '(salvo sin_calendario=true). Para cambiar la etapa usá mover_lead_etapa. Confirmá los cambios con el usuario antes.',
  inputSchema: {
    type: 'object',
    required: ['lead'],
    properties: {
      lead: { type: 'string', description: 'Id del lead o texto para identificarlo.' },
      nombre: { type: 'string' }, apellido: { type: 'string' }, empresa: { type: 'string' },
      email: { type: 'string' }, email_secundario: { type: 'string' }, telefono: { type: 'string' },
      pais: { type: 'string' }, sitio_web: { type: 'string' },
      fuente: { type: 'string', enum: FUENTES },
      servicios_interesados: { type: 'array', items: { type: 'string' }, description: 'Reemplaza la lista completa.' },
      responsable: { type: 'string', description: 'Nombre, email o id. "nadie" para dejarlo sin responsable.' },
      consulta_detallada: { type: 'string', description: 'Qué necesita el cliente (reemplaza el texto actual).' },
      notas: { type: 'string', description: 'Notas internas de la ficha (reemplaza el texto actual; para dejar registro de algo puntual usá registrar_actividad).' },
      fecha_reunion: { type: 'string', description: 'YYYY-MM-DD' },
      reunion_hora: { type: 'string', description: 'HH:MM (hora Argentina)' },
      reunion_link: { type: 'string' },
      reunion_asistencia: { type: 'string', enum: ASISTENCIAS },
      fecha_contacto: { type: 'string', description: 'YYYY-MM-DD' },
      fecha_propuesta: { type: 'string', description: 'YYYY-MM-DD' },
      fecha_followup: { type: 'string', description: 'YYYY-MM-DD' },
      fecha_cierre: { type: 'string', description: 'YYYY-MM-DD' },
      sin_calendario: { type: 'boolean', description: 'true = no crear/actualizar evento de Google Calendar al cambiar fecha_reunion (reunión agendada por fuera, ej. TidyCal).' },
    },
  },
  annotations: WRITE,
  async handler(args, { db, userId }) {
    const id = await resolveLeadId(db, args.lead)
    const body: Record<string, unknown> = {}
    for (const k of LEAD_TEXT_FIELDS) if (str(args[k]) !== undefined) body[k] = str(args[k])
    for (const k of LEAD_DATE_FIELDS) {
      const v = str(args[k])
      if (v === undefined) continue
      if (!/^\d{4}-\d{2}-\d{2}/.test(v)) throw new ToolError(`${k} tiene que tener formato YYYY-MM-DD.`)
      body[k] = v
    }
    if (str(args.reunion_hora)) {
      const h = str(args.reunion_hora)!
      if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(h)) throw new ToolError('reunion_hora tiene que tener formato HH:MM.')
      body.reunion_hora = h.length <= 5 ? `${h.padStart(5, '0')}:00` : h
    }
    if (str(args.fuente)) {
      if (!FUENTES.includes(str(args.fuente)!)) throw new ToolError(`Fuente inválida. Opciones: ${FUENTES.join(', ')}.`)
      body.fuente = str(args.fuente)
    }
    if (Array.isArray(args.servicios_interesados)) {
      const sv = (args.servicios_interesados as unknown[]).filter((x): x is string => typeof x === 'string')
      body.servicios_interesados = sv
      body.servicio_interesado = sv[0] ?? null
    }
    if (str(args.responsable)) {
      body.responsable_id = /^(nadie|ninguno|none)$/i.test(str(args.responsable)!) ? null : await resolveUser(db, args.responsable)
    }
    if (str(args.reunion_asistencia)) {
      if (!ASISTENCIAS.includes(str(args.reunion_asistencia)!)) throw new ToolError(`Asistencia inválida. Opciones: ${ASISTENCIAS.join(', ')}.`)
      body.reunion_asistencia = str(args.reunion_asistencia)
    }
    if (!Object.keys(body).length) throw new ToolError('No indicaste ningún campo para cambiar.')
    const cambios = { ...body }
    if (args.sin_calendario === true) body.skip_calendar = true

    const r = await updateLead(db, { id, body, userId })
    if (!r.ok) throw new ToolError(r.error)
    return { ok: true, lead: fullName(r.data as { nombre?: string; apellido?: string; empresa?: string }), cambios }
  },
}

async function agentActivity(db: SupabaseClient, ref: unknown) {
  const id = str(ref)
  if (!isUuid(id)) throw new ToolError('actividad_id inválido.')
  const { data } = await db.from('activities').select('id, lead_id, metadata').eq('id', id).maybeSingle()
  if (!data) throw new ToolError('Actividad no encontrada.')
  if ((data.metadata as Record<string, unknown> | null)?.origen !== 'agente_claude') {
    throw new ToolError('Solo puedo editar o borrar actividades que registró el agente. Las demás se modifican desde el CRM.')
  }
  return data
}

const editarActividad: ToolDef = {
  name: 'editar_actividad',
  title: 'Editar actividad registrada por el agente',
  description: 'Reemplaza el texto de una actividad que haya registrado el agente (no toca actividades cargadas a mano ni automáticas). Acepta HTML simple.',
  inputSchema: {
    type: 'object',
    required: ['actividad_id', 'descripcion'],
    properties: { actividad_id: { type: 'string' }, descripcion: { type: 'string' } },
  },
  annotations: { ...WRITE, idempotentHint: true },
  async handler(args, { db }) {
    const act = await agentActivity(db, args.actividad_id)
    const descripcion = str(args.descripcion)
    if (!descripcion) throw new ToolError('Falta la descripción.')
    const { error } = await db.from('activities').update({ descripcion }).eq('id', act.id)
    if (error) throw new ToolError(error.message)
    return { ok: true, actividad_id: act.id }
  },
}

const borrarActividad: ToolDef = {
  name: 'borrar_actividad',
  title: 'Borrar actividad registrada por el agente',
  description: 'Borra una actividad que haya registrado el agente (por ejemplo, una cargada por error). No puede borrar actividades cargadas a mano ni automáticas. Confirmá con el usuario antes.',
  inputSchema: { type: 'object', required: ['actividad_id'], properties: { actividad_id: { type: 'string' } } },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async handler(args, { db }) {
    const act = await agentActivity(db, args.actividad_id)
    const { error } = await db.from('activities').delete().eq('id', act.id)
    if (error) throw new ToolError(error.message)
    return { ok: true, borrada: act.id }
  },
}

const crearLead: ToolDef = {
  name: 'crear_lead',
  title: 'Crear lead',
  description: 'Crea un lead nuevo en el pipeline (por defecto en lead_entrante). Si hay notas, se guardan como actividad. Confirmá los datos antes.',
  inputSchema: {
    type: 'object',
    required: ['nombre'],
    properties: {
      nombre: { type: 'string' },
      apellido: { type: 'string' },
      empresa: { type: 'string' },
      email: { type: 'string' },
      telefono: { type: 'string' },
      pais: { type: 'string' },
      sitio_web: { type: 'string' },
      fuente: { type: 'string', enum: FUENTES },
      servicios_interesados: { type: 'array', items: { type: 'string' } },
      etapa: { type: 'string', description: 'Key de etapa inicial (default lead_entrante).' },
      responsable: { type: 'string', description: 'Nombre, email o id del responsable.' },
      notas: { type: 'string', description: 'Contexto inicial; se guarda como actividad tipo nota.' },
    },
  },
  annotations: WRITE,
  async handler(args, { db, userId }) {
    const nombre = str(args.nombre)
    if (!nombre) throw new ToolError('El nombre es requerido.')
    const email = str(args.email)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ToolError('Email inválido.')
    const etapa = str(args.etapa) ?? 'lead_entrante'
    const { data: st } = await db.from('pipeline_stages').select('key').eq('key', etapa).maybeSingle()
    if (!st) throw new ToolError(`Etapa inválida: "${etapa}".`)

    if (email) {
      const { data: dup } = await db.from('leads').select('id, nombre, apellido, empresa').ilike('email', email).is('deleted_at', null).limit(1)
      if (dup?.length) throw new ToolError(`Ya existe un lead con ese email: ${fullName(dup[0])} (${dup[0].id}).`)
    }

    const { data: maxPos } = await db.from('leads').select('kanban_position').eq('estado_pipeline', etapa)
      .is('deleted_at', null).order('kanban_position', { ascending: false }).limit(1).maybeSingle()
    const servicios = Array.isArray(args.servicios_interesados) ? (args.servicios_interesados as unknown[]).filter((s): s is string => typeof s === 'string') : []
    const { data, error } = await db.from('leads').insert({
      nombre,
      apellido: str(args.apellido) ?? null,
      email: email ?? null,
      telefono: str(args.telefono) ?? null,
      empresa: str(args.empresa) ?? null,
      pais: str(args.pais) ?? null,
      sitio_web: str(args.sitio_web) ?? null,
      servicios_interesados: servicios,
      servicio_interesado: servicios[0] ?? null,
      fuente: str(args.fuente) ?? null,
      estado_pipeline: etapa,
      valor_propuesta_moneda: 'USD',
      notas: null,
      responsable_id: (await resolveUser(db, args.responsable)) ?? null,
      kanban_position: (maxPos?.kanban_position ?? 0) + 1,
      created_by: userId,
    }).select('id, nombre, apellido, empresa, estado_pipeline').single()
    if (error) throw new ToolError(error.message)

    const notas = str(args.notas)
    if (notas) await db.from('activities').insert({ lead_id: data.id, user_id: userId, tipo: 'nota', descripcion: notas })
    return { ok: true, lead_id: data.id, lead: fullName(data), etapa: data.estado_pipeline }
  },
}

const crearTareaLead: ToolDef = {
  name: 'crear_tarea_lead',
  title: 'Crear tarea comercial en un lead',
  description:
    'Crea una tarea de seguimiento comercial en un lead (ej. "llamar para confirmar propuesta"). La descripción debe ser explícita: ' +
    'qué hacer, con quién, qué dato conseguir y cuándo se da por hecha. Si no se indica asignado, queda para el responsable del lead.',
  inputSchema: {
    type: 'object',
    required: ['lead', 'titulo'],
    properties: {
      lead: { type: 'string', description: 'Id del lead o texto para identificarlo.' },
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      vencimiento: { type: 'string', description: 'Fecha/hora. "YYYY-MM-DDTHH:mm" se interpreta en hora Argentina.' },
      asignado: { type: 'string', description: 'Nombre, email o id del usuario.' },
    },
  },
  annotations: WRITE,
  async handler(args, { db, userId }) {
    const leadId = await resolveLeadId(db, args.lead)
    const titulo = str(args.titulo)
    if (!titulo) throw new ToolError('El título es requerido.')
    let asignado = await resolveUser(db, args.asignado)
    if (!asignado) {
      const { data: lead } = await db.from('leads').select('responsable_id').eq('id', leadId).single()
      asignado = lead?.responsable_id ?? userId
    }
    let venc = str(args.vencimiento) ?? null
    if (venc && /^\d{4}-\d{2}-\d{2}$/.test(venc)) venc = `${venc}T10:00`
    const { data, error } = await db.from('tasks').insert({
      lead_id: leadId, creado_por: userId, asignado_a: asignado, titulo,
      descripcion: str(args.descripcion) ?? null, vencimiento: normaliseVencimiento(venc),
    }).select('id, titulo, vencimiento').single()
    if (error) throw new ToolError(error.message)
    return { ok: true, tarea: data }
  },
}

const completarTareaLead: ToolDef = {
  name: 'completar_tarea_lead',
  title: 'Completar tarea de lead',
  description: 'Marca como completada una tarea comercial de un lead (por id) y lo registra en el historial del lead.',
  inputSchema: { type: 'object', required: ['tarea_id'], properties: { tarea_id: { type: 'string' } } },
  annotations: { ...WRITE, idempotentHint: true },
  async handler(args, { db, userId }) {
    const id = str(args.tarea_id)
    if (!isUuid(id)) throw new ToolError('tarea_id inválido.')
    const { data: task } = await db.from('tasks').select('id, completada, titulo, lead_id').eq('id', id).maybeSingle()
    if (!task) throw new ToolError('Tarea no encontrada.')
    if (task.completada) return { ok: true, ya_estaba_completada: true }
    const { error } = await db.from('tasks').update({ completada: true, completada_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new ToolError(error.message)
    await db.from('activities').insert({
      lead_id: task.lead_id, user_id: userId, tipo: 'tarea_completada',
      descripcion: `Tarea completada: "${task.titulo}"`, metadata: { task_id: id },
    })
    return { ok: true, tarea: task.titulo }
  },
}

async function resolveSectionId(db: SupabaseClient, projectId: string, ref: unknown): Promise<string | null> {
  const r = str(ref)
  const { data: sections } = await db.from('task_sections').select('id, nombre, position, is_done').eq('project_id', projectId).order('position')
  if (!r) return sections?.find(s => !s.is_done)?.id ?? sections?.[0]?.id ?? null
  if (isUuid(r)) return r
  const s = sections?.find(x => x.nombre.toLowerCase() === r.toLowerCase()) ?? sections?.find(x => x.nombre.toLowerCase().includes(r.toLowerCase()))
  if (!s) throw new ToolError(`No existe la sección "${r}". Secciones: ${(sections ?? []).map(x => x.nombre).join(', ')}.`)
  return s.id
}

const crearTareaProyecto: ToolDef = {
  name: 'crear_tarea_proyecto',
  title: 'Crear tarea en un proyecto',
  description:
    'Crea una tarea en el tablero de un proyecto. La descripción tiene que ser autocontenida y explícita: qué hacer, qué datos ' +
    'concretos conseguir, con quién, y cuándo se considera terminada. Notifica al asignado igual que el CRM.',
  inputSchema: {
    type: 'object',
    required: ['proyecto', 'titulo'],
    properties: {
      proyecto: { type: 'string', description: 'Id o nombre del proyecto.' },
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      seccion: { type: 'string', description: 'Nombre o id de la sección/columna (default: la primera no finalizada).' },
      prioridad: { type: 'string', enum: PRIORIDADES },
      asignado: { type: 'string', description: 'Nombre, email o id.' },
      fecha_inicio: { type: 'string', description: 'YYYY-MM-DD' },
      fecha_limite: { type: 'string', description: 'YYYY-MM-DD' },
      horas_estimadas: { type: 'number' },
      tarea_padre_id: { type: 'string', description: 'Id de la tarea padre si es subtarea.' },
    },
  },
  annotations: WRITE,
  async handler(args, { db, userId }) {
    const projectId = await resolveProjectId(db, args.proyecto)
    const titulo = str(args.titulo)
    if (!titulo) throw new ToolError('El título es requerido.')
    const prioridad = (str(args.prioridad) ?? 'media') as PmPriority
    if (!PRIORIDADES.includes(prioridad)) throw new ToolError(`Prioridad inválida. Opciones: ${PRIORIDADES.join(', ')}.`)
    const sectionId = await resolveSectionId(db, projectId, args.seccion)
    const assignee = await resolveUser(db, args.asignado)

    let posQ = db.from('project_tasks').select('position').eq('project_id', projectId).is('deleted_at', null)
    posQ = sectionId ? posQ.eq('section_id', sectionId) : posQ.is('section_id', null)
    const { data: maxRow } = await posQ.order('position', { ascending: false }).limit(1).maybeSingle()

    const { data, error } = await db.from('project_tasks').insert({
      project_id: projectId,
      section_id: sectionId,
      parent_task_id: isUuid(args.tarea_padre_id) ? (args.tarea_padre_id as string) : null,
      titulo,
      descripcion: str(args.descripcion) ?? null,
      estado: 'pendiente',
      prioridad,
      assignee_id: assignee,
      fecha_inicio: str(args.fecha_inicio) ?? null,
      fecha_limite: str(args.fecha_limite) ?? null,
      horas_estimadas: num(args.horas_estimadas) ?? null,
      attachments: [],
      position: (maxRow?.position ?? 0) + 1,
      created_by: userId,
    }).select('*').single()
    if (error) throw new ToolError(error.message)

    if (data.assignee_id) await notifyAssignee(db, data, userId, projectId, true)
    return { ok: true, tarea_id: data.id, titulo: data.titulo, proyecto_id: projectId }
  },
}

async function notifyAssignee(
  db: SupabaseClient,
  task: { id: string; assignee_id: string; titulo: string; descripcion: string | null; prioridad: string; fecha_limite: string | null },
  userId: string,
  projectId: string,
  isNew: boolean,
) {
  if (task.assignee_id !== userId) {
    await sendTaskAssignmentEmail({
      admin: db,
      assigneeId: task.assignee_id,
      creatorId: userId,
      task: { titulo: task.titulo, descripcion: task.descripcion, prioridad: task.prioridad as PmPriority, fecha_limite: task.fecha_limite, project_id: projectId },
    }).catch(e => console.error('[mcp task-email] ERROR:', e))
  }
  await notifyUser(task.assignee_id, {
    title: isNew ? '📋 Nueva tarea asignada' : '📋 Te asignaron una tarea',
    body: task.titulo,
    url: `/projects/${projectId}`,
  }).catch(e => console.error('[mcp push] ERROR:', e))
  await createTaskNotification(db, { userId: task.assignee_id, taskId: task.id, projectId, taskTitulo: task.titulo })
    .catch(e => console.error('[mcp task-notif] ERROR:', e))
}

const actualizarTareaProyecto: ToolDef = {
  name: 'actualizar_tarea_proyecto',
  title: 'Actualizar tarea de proyecto',
  description:
    'Modifica una tarea de proyecto: estado, prioridad, asignado, fechas, título, descripción, horas o sección. ' +
    'Al pasar a "finalizada" se completa la fecha de finalización automáticamente. Confirmá cambios con el usuario.',
  inputSchema: {
    type: 'object',
    required: ['tarea_id'],
    properties: {
      tarea_id: { type: 'string' },
      estado: { type: 'string', enum: PTASK_ESTADOS },
      prioridad: { type: 'string', enum: PRIORIDADES },
      asignado: { type: 'string', description: 'Nombre, email o id. "nadie" para desasignar.' },
      titulo: { type: 'string' },
      descripcion: { type: 'string' },
      fecha_inicio: { type: 'string', description: 'YYYY-MM-DD' },
      fecha_limite: { type: 'string', description: 'YYYY-MM-DD' },
      horas_estimadas: { type: 'number' },
      seccion: { type: 'string', description: 'Nombre o id de la sección destino.' },
    },
  },
  annotations: WRITE,
  async handler(args, { db, userId }) {
    const id = str(args.tarea_id)
    if (!isUuid(id)) throw new ToolError('tarea_id inválido.')
    const { data: cur } = await db.from('project_tasks')
      .select('id, project_id, assignee_id, estado, fecha_finalizacion, titulo, descripcion, prioridad, fecha_limite')
      .eq('id', id).is('deleted_at', null).maybeSingle()
    if (!cur) throw new ToolError('Tarea no encontrada.')

    const updates: Record<string, unknown> = {}
    for (const k of ['titulo', 'descripcion', 'fecha_inicio', 'fecha_limite'] as const) if (str(args[k]) !== undefined) updates[k] = str(args[k])
    if (num(args.horas_estimadas) !== undefined) updates.horas_estimadas = num(args.horas_estimadas)
    if (str(args.prioridad)) {
      if (!PRIORIDADES.includes(str(args.prioridad) as PmPriority)) throw new ToolError('Prioridad inválida.')
      updates.prioridad = str(args.prioridad)
    }
    if (str(args.estado)) {
      const estado = str(args.estado) as ProjectTaskEstado
      if (!PTASK_ESTADOS.includes(estado)) throw new ToolError(`Estado inválido. Opciones: ${PTASK_ESTADOS.join(', ')}.`)
      updates.estado = estado
      if (estado === 'finalizada' && !cur.fecha_finalizacion) updates.fecha_finalizacion = todayAR()
      else if (estado !== 'finalizada' && cur.estado === 'finalizada') updates.fecha_finalizacion = null
    }
    if (str(args.asignado)) updates.assignee_id = /^(nadie|ninguno|none)$/i.test(str(args.asignado)!) ? null : await resolveUser(db, args.asignado)
    if (str(args.seccion)) updates.section_id = await resolveSectionId(db, cur.project_id, args.seccion)
    if (!Object.keys(updates).length) throw new ToolError('No indicaste ningún cambio.')
    updates.updated_at = new Date().toISOString()

    const { data, error } = await db.from('project_tasks').update(updates).eq('id', id).select('*').single()
    if (error) throw new ToolError(error.message)

    if (data.assignee_id && data.assignee_id !== cur.assignee_id) await notifyAssignee(db, data, userId, cur.project_id, false)
    const { updated_at: _u, ...cambios } = updates
    void _u
    return { ok: true, tarea: data.titulo, cambios }
  },
}

export const TOOLS: ToolDef[] = [
  resumenCrm, buscarLeads, verLead, listarEtapas, listarUsuarios, tareasPendientes,
  listarProyectos, verProyecto, listarPropuestas, listarTickets, cobranzas,
  moverLeadEtapa, actualizarLead, registrarActividad, editarActividad, borrarActividad, crearLead, crearTareaLead, completarTareaLead,
  crearTareaProyecto, actualizarTareaProyecto,
]
