export type UserRole = 'admin' | 'sales' | 'viewer'

export type PipelineStage =
  | 'lead_entrante'
  | 'lead_contactado'
  | 'sin_respuesta'
  | 'reunion_reservada'
  | 'reunion_realizada'
  | 'propuesta_en_armado'
  | 'propuesta_enviada'
  | 'follow_up'
  | 'cliente_ganado'
  | 'cliente_perdido'
  | 'no_cualificado'
  | 'consulta_cliente'
  | 'testing'

export type LeadQuality = 'MQL' | 'SQL' | 'no_calificado'

export type ProjectStatus = 'en_tiempo' | 'proximo_a_vencer' | 'atrasado'

export interface TeamMember {
  id: string
  full_name: string
  role: string
  email: string | null
  created_at: string
}

export type ActivityType =
  | 'nota'
  | 'llamada'
  | 'email'
  | 'reunion'
  | 'cambio_estado'
  | 'tarea_completada'
  | 'webhook'
  | 'whatsapp'

export type LeadFuente =
  | 'formulario'
  | 'referido'
  | 'linkedin'
  | 'instagram'
  | 'whatsapp'
  | 'chatbot'
  | 'mail'
  | 'calendario'
  | 'otro'

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  created_at: string
}

export type PropuestaEstado = 'pendiente' | 'aceptada' | 'rechazada'

export type TipoPago = 'unica_vez' | 'mensual'

export interface Propuesta {
  id: string
  lead_id: string
  descripcion: string
  valor_usd: number | null
  valor_ars: number | null
  moneda: 'USD' | 'ARS'
  tipo_pago: TipoPago
  estado: PropuestaEstado
  link: string | null
  created_at: string
  updated_at: string
}

export interface StageHistory {
  id: string
  lead_id: string
  etapa: PipelineStage
  fecha_ingreso: string
  created_at: string
}

export interface Lead {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  email_secundario: string | null
  telefono: string | null
  empresa: string | null
  pais: string | null
  sitio_web: string | null
  servicios_interesados: string[]
  servicio_interesado: string | null        // kept for embed backward-compat
  presupuesto_estimado: number | null       // hidden from UI, kept in DB
  estado_pipeline: PipelineStage
  fuente: LeadFuente | null
  idioma: 'es' | 'en' | null
  valor_propuesta_usd: number | null        // legacy, will use propuestas table
  valor_propuesta_ars: number | null        // legacy, will use propuestas table
  valor_propuesta_moneda: 'USD' | 'ARS'     // legacy
  tipo_cambio_usd_ars: number | null
  kanban_position: number
  notas: string | null
  consulta_detallada: string | null
  responsable_id: string | null
  created_by: string
  fecha_ingreso: string
  fecha_contacto: string | null
  fecha_reunion: string | null
  reunion_hora: string | null
  reunion_link: string | null
  reunion_asistencia: 'se_presento' | 'no_se_presento' | 'reagendo' | null
  fecha_propuesta: string | null
  fecha_followup: string | null
  fecha_cierre: string | null
  fecha_inicio_proyecto: string | null
  fecha_cierre_proyecto: string | null
  lider_tecnico_id: string | null
  dev_id: string | null
  avance_proyecto: number | null
  form_id: string | null                        // which form generated this lead
  form_data: Record<string, string> | null      // all fields submitted from embed form
  drive_folder_id: string | null               // Google Drive folder created on reunion_realizada
  drive_folder_url: string | null
  calendar_event_id: string | null             // Google Calendar event created on reunion_reservada
  calendar_event_url: string | null
  reunion_reminder_24h_at: string | null        // set when 24h WhatsApp reminder is sent
  reunion_reminder_30min_at: string | null     // set when 30min WhatsApp reminder is sent
  stage_updated_at: string
  last_activity_at: string
  deleted_at: string | null
  created_at: string
  updated_at: string
  // Computed on GET /leads/[id]
  responsable?: Pick<User, 'id' | 'full_name' | 'avatar_url'>
  lider_tecnico?: Pick<TeamMember, 'id' | 'full_name' | 'role'>
  dev?: Pick<TeamMember, 'id' | 'full_name' | 'role'>
  calidad_lead?: LeadQuality
  dias_sin_respuesta?: number
  next_followup_at?: string | null
  propuestas?: Propuesta[]
  stage_history?: StageHistory[]
  // Computed on GET /leads (list)
  propuestas_total_usd?: number
  propuestas_total_ars?: number
  propuestas_count?: number
  // Tags & lists (loaded on demand)
  tags?: LeadTag[]
}

export interface Activity {
  id: string
  lead_id: string
  user_id: string | null
  tipo: ActivityType
  descripcion: string
  metadata: Record<string, unknown> | null
  created_at: string
  user?: Pick<User, 'id' | 'full_name' | 'avatar_url'>
}

export interface Task {
  id: string
  lead_id: string
  asignado_a: string | null
  creado_por: string
  titulo: string
  descripcion: string | null
  vencimiento: string | null
  completada: boolean
  completada_at: string | null
  created_at: string
  asignado?: Pick<User, 'id' | 'full_name' | 'avatar_url'>
}

// ── Project Management Module ─────────────────────────────

export type ProjectEstado = 'pendiente' | 'en_desarrollo' | 'en_pausa' | 'finalizado'
export type PmPriority    = 'baja' | 'media' | 'alta' | 'urgente'
export type ProjectTaskEstado = 'pendiente' | 'en_progreso' | 'bloqueada' | 'en_revision' | 'finalizada' | 'cancelada'

export interface Project {
  id: string
  nombre: string
  descripcion: string | null
  estado: ProjectEstado
  prioridad: PmPriority
  lead_id: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  presupuesto_usd: number | null
  color: string
  created_by: string | null
  archived_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  // joined
  lead?: { id: string; nombre: string | null; apellido: string | null; empresa: string | null } | null
  members?: ProjectMember[]
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: 'pm' | 'member' | 'viewer'
  created_at: string
  user?: Pick<User, 'id' | 'full_name' | 'avatar_url'>
}

export interface TaskSection {
  id: string
  project_id: string
  nombre: string
  color: string | null
  position: number
  is_done: boolean
  created_at: string
}

export interface ProjectTask {
  id: string
  project_id: string
  section_id: string | null
  parent_task_id: string | null
  titulo: string
  descripcion: string | null
  estado: ProjectTaskEstado
  prioridad: PmPriority
  assignee_id: string | null
  created_by: string | null
  fecha_inicio: string | null
  fecha_limite: string | null
  fecha_finalizacion: string | null
  horas_estimadas: number | null
  position: number
  attachments: TicketAttachment[]
  custom_fields: Record<string, unknown>
  deleted_at: string | null
  created_at: string
  updated_at: string
  // joined
  assignee?: Pick<User, 'id' | 'full_name' | 'avatar_url'> | null
  section?: Pick<TaskSection, 'id' | 'nombre' | 'color'> | null
  subtasks?: ProjectTask[]
}

// ── WhatsApp Inbox ─────────────────────────────────────────

export interface WhatsAppConversation {
  id: string
  phone_number: string
  lead_id: string | null
  last_message_at: string
  last_message_text: string | null
  unread_count: number
  status: 'open' | 'closed'
  bot_active: boolean
  bot_phase: 'qualifying' | 'faq' | 'booking'
  created_at: string
  updated_at: string
  // Joined from leads
  lead?: {
    id: string
    nombre: string
    apellido: string | null
    email: string | null
  } | null
}

export interface WhatsAppFaq {
  id: string
  pregunta: string
  respuesta: string
  activo: boolean
  orden: number
  created_at: string
  updated_at: string
}

export interface WhatsAppMessage {
  id: string
  conversation_id: string
  lead_id: string | null
  direction: 'inbound' | 'outbound'
  body: string | null
  wa_message_id: string | null
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  media_type: string | null
  media_url: string | null
  error_message: string | null
  agent_id: string | null
  created_at: string
  status_updated_at: string
}

// ── Email Marketing ─────────────────────────────────────────

export interface LeadTag {
  id: string
  name: string
  color: string
  created_at: string
}

export interface LeadList {
  id: string
  name: string
  description: string | null
  created_at: string
  lead_count?: number
}

export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'failed'
export type RecipientStatus = 'pending' | 'sent' | 'failed'

export interface SegmentFilters {
  tag_ids?: string[]
  list_ids?: string[]
  estado_pipeline?: string[]
  servicios_interesados?: string[]
  responsable_ids?: string[]
  paises?: string[]
}

export interface Campaign {
  id: string
  name: string
  subject: string
  body: string
  from_name: string
  from_email: string
  status: CampaignStatus
  filters: SegmentFilters | null
  total_sent: number
  total_failed: number
  sent_at: string | null
  created_at: string
  updated_at: string
  recipient_count?: number
}

export interface CampaignRecipient {
  id: string
  campaign_id: string
  lead_id: string
  email: string
  status: RecipientStatus
  sent_at: string | null
  error: string | null
  lead?: Pick<Lead, 'id' | 'nombre' | 'apellido' | 'empresa'>
}

// ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    total_pages: number
  }
}

export interface DashboardMetrics {
  leads: {
    total: number
    por_etapa: Partial<Record<PipelineStage, number>>
    por_etapa_value_usd: Partial<Record<PipelineStage, number>>
    por_etapa_value_ars: Partial<Record<PipelineStage, number>>
    por_fuente: Record<string, number>
    por_pais: Record<string, number>
    nuevos_periodo: number
  }
  revenue: {
    ganado_usd: number
    ganado_ars: number
    proyectado_usd: number
    proyectado_ars: number
    ticket_promedio_usd: number
    forecast: { d7: number; d30: number; d90: number }
    pipeline_value_usd: Partial<Record<PipelineStage, number>>
    pipeline_value_ars: Partial<Record<PipelineStage, number>>
  }
  conversion: {
    tasa: number
    por_etapa: Partial<Record<PipelineStage, number>>
    rates: Record<string, number>
    bottleneck: PipelineStage | null
  }
  alertas: {
    sin_respuesta_24h: number
    sin_respuesta_leads: { id: string; nombre: string }[]
    tareas_vencidas: number
    leads_inactivos: number
    leads_inactivos_leads: { id: string; nombre: string }[]
    leads_estancados: number
    leads_estancados_leads: { id: string; nombre: string }[]
    leads_calientes: number
    leads_calientes_leads: { id: string; nombre: string }[]
  }
  top_responsables: {
    id: string
    full_name: string
    avatar_url: string | null
    activos: number
    ganados: number
    actividades: number
    tasa_conversion: number
    revenue_usd: number
    revenue_ars: number
  }[]
  actividad_reciente: {
    id: string
    tipo: string
    descripcion: string
    created_at: string
    lead_id: string | null
    lead_nombre: string | null
    user_full_name: string | null
    user_avatar_url: string | null
  }[]
  ultimos_leads: {
    id: string
    nombre: string
    estado_pipeline: PipelineStage
    fuente: string | null
    created_at: string
    responsable_id: string | null
  }[]
  top_oportunidades: {
    id: string
    nombre: string
    empresa: string | null
    estado_pipeline: PipelineStage
    valor_propuesta_usd: number | null
    valor_propuesta_ars: number | null
    valor_propuesta_moneda: 'USD' | 'ARS' | null
    responsable_id: string | null
  }[]
  proyectos: {
    en_tiempo: number
    proximo_a_vencer: number
    atrasado: number
    sin_fecha: number
    lista: {
      id: string
      nombre: string
      empresa: string | null
      fecha_cierre_proyecto: string
      status: ProjectStatus
      dias_restantes: number
      avance_proyecto: number | null
    }[]
  }
}

// ── Billing / Facturación ──────────────────────────────────

export type InvoiceEstado = 'pendiente' | 'parcial' | 'cobrado' | 'vencido' | 'cancelada'
export type PaymentMetodo = 'transferencia' | 'efectivo' | 'mercadopago' | 'paypal' | 'otro'

export interface InvoiceItem {
  id: string
  invoice_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  position: number
  created_at: string
}

export interface Payment {
  id: string
  invoice_id: string
  descripcion: string
  monto: number
  fecha_vencimiento: string | null
  fecha_pago: string | null
  metodo_pago: PaymentMetodo | null
  numero_factura: string | null
  factura_enviada_at: string | null
  attachments: TicketAttachment[]
  notas: string | null
  alerta_enviada_at: string | null
  created_at: string
}

export type CondicionIva = 'responsable_inscripto' | 'monotributo' | 'exento' | 'consumidor_final'
export type TipoCobranza = 'proyecto' | 'recurrente'

export interface Invoice {
  id: string
  project_id: string | null
  lead_id: string | null
  numero: string
  cliente_nombre: string
  cliente_email: string | null
  cliente_telefono: string | null
  cliente_razon_social: string | null
  cliente_cuit: string | null
  cliente_condicion_iva: CondicionIva | null
  cliente_domicilio: string | null
  descripcion: string | null
  moneda: 'USD' | 'ARS'
  estado: InvoiceEstado
  tipo_cobranza: TipoCobranza
  dia_cobro: number | null
  monto_recurrente: number | null
  mantenimiento_activo: boolean
  fecha_emision: string
  fecha_vencimiento: string | null
  notas: string | null
  alertas_activas: boolean
  dias_alerta: number
  created_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  // computed / joined
  items?: InvoiceItem[]
  payments?: Payment[]
  project?: { id: string; nombre: string; color: string } | null
  lead?: { id: string; nombre: string; apellido: string | null; empresa: string | null } | null
  total?: number
  total_pagado?: number
}

// ── Tickets ────────────────────────────────────────────────

export type TicketEstado    = 'nuevo' | 'en_progreso' | 'en_espera' | 'estimacion' | 'resuelto' | 'cerrado'
export type TicketPrioridad = 'baja' | 'media' | 'alta' | 'urgente'
export type TicketCategoria = 'bug' | 'soporte' | 'consulta' | 'mejora' | 'nuevo' | 'otro'
export type TicketAttachment = { url: string; name: string; type: string }

export interface PortalClient {
  id: string
  email: string
  nombre: string
  empresa: string | null
  plan_horas_mensual: number
  created_at: string
}

export interface Ticket {
  id: string
  numero: string
  titulo: string
  descripcion: string | null
  estado: TicketEstado
  prioridad: TicketPrioridad
  categoria: TicketCategoria
  project_id: string | null
  lead_id: string | null
  assignee_id: string | null
  created_by: string | null
  ticket_token: string
  client_nombre: string | null
  client_email: string | null
  client_empresa: string | null
  client_telefono: string | null
  attachments: TicketAttachment[]
  linked_task_id: string | null
  horas_estimadas: number | null
  horas_aprobadas: boolean
  horas_reales: number | null
  last_client_activity_at: string | null
  client_unread: boolean
  resolved_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  // joined
  project?: { id: string; nombre: string; color: string } | null
  lead?: { id: string; nombre: string; apellido: string | null; empresa: string | null } | null
  assignee?: Pick<User, 'id' | 'full_name' | 'avatar_url'> | null
  creator?: Pick<User, 'id' | 'full_name' | 'avatar_url'> | null
  comments?: TicketComment[]
  comments_count?: number
  last_team_reply_at?: string | null
}

export interface TicketComment {
  id: string
  ticket_id: string
  user_id: string | null
  body: string
  is_client: boolean
  client_nombre: string | null
  created_at: string
  updated_at?: string | null
  attachments?: TicketAttachment[]
  user?: Pick<User, 'id' | 'full_name' | 'avatar_url'> | null
}

// ── Pipeline config — single source of truth for labels, colors, order
export const PIPELINE_STAGES: {
  value: PipelineStage
  label: string
  color: string
  bgColor: string
  zone: 'entrada' | 'gestion' | 'cierre'
}[] = [
  { value: 'lead_entrante', label: 'Lead entrante', color: '#64748b', bgColor: '#f1f5f9', zone: 'entrada' },
  { value: 'lead_contactado', label: 'Contactado', color: '#3b82f6', bgColor: '#eff6ff', zone: 'entrada' },
  { value: 'sin_respuesta', label: 'Sin respuesta', color: '#f59e0b', bgColor: '#fffbeb', zone: 'entrada' },
  { value: 'reunion_reservada', label: 'Reunión reservada', color: '#8b5cf6', bgColor: '#f5f3ff', zone: 'gestion' },
  { value: 'reunion_realizada', label: 'Reunión realizada', color: '#6366f1', bgColor: '#eef2ff', zone: 'gestion' },
  { value: 'propuesta_en_armado', label: 'Propuesta en armado', color: '#0ea5e9', bgColor: '#f0f9ff', zone: 'gestion' },
  { value: 'propuesta_enviada', label: 'Propuesta enviada', color: '#06b6d4', bgColor: '#ecfeff', zone: 'gestion' },
  { value: 'follow_up', label: 'Follow up', color: '#f97316', bgColor: '#fff7ed', zone: 'gestion' },
  { value: 'cliente_ganado', label: 'Cliente ganado', color: '#22c55e', bgColor: '#f0fdf4', zone: 'cierre' },
  { value: 'cliente_perdido', label: 'Cliente perdido', color: '#ef4444', bgColor: '#fef2f2', zone: 'cierre' },
  { value: 'no_cualificado', label: 'No cualificado', color: '#94a3b8', bgColor: '#f8fafc', zone: 'cierre' },
  { value: 'consulta_cliente', label: 'Consulta cliente', color: '#a855f7', bgColor: '#faf5ff', zone: 'cierre' },
  { value: 'testing', label: 'Testing', color: '#94a3b8', bgColor: '#f8fafc', zone: 'cierre' },
]

export const PIPELINE_STAGE_MAP = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.value, s])
) as Record<PipelineStage, (typeof PIPELINE_STAGES)[number]>

// Arrays para selects/dropdowns
export const PAISES = [
  'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia', 'Costa Rica',
  'Ecuador', 'El Salvador', 'España', 'Guatemala', 'Honduras', 'México',
  'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'Uruguay', 'Venezuela',
  'Estados Unidos', 'Canadá', 'Otro',
]

export const SERVICIOS = [
  'Diseño web', 'Mantenimiento web', 'WebApp', 'App Mobile', 'SEO', 'Google Ads', 'Meta Ads',
  'Redes sociales', 'Branding', 'Email marketing', 'Chatbot', 'IA automatización', 'Ecommerce', 'Otro',
]

export const FUENTES: { value: LeadFuente; label: string }[] = [
  { value: 'formulario', label: 'Formulario web' },
  { value: 'referido', label: 'Referido' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'chatbot', label: 'Chatbot' },
  { value: 'mail', label: 'Mail' },
  { value: 'calendario', label: 'Calendario' },
  { value: 'otro', label: 'Otro' },
]

export const IDIOMAS: { value: 'es' | 'en'; label: string }[] = [
  { value: 'es', label: 'ES' },
  { value: 'en', label: 'EN' },
]

// Revenue probability per stage
export const REVENUE_PROBABILITY: Partial<Record<PipelineStage, number>> = {
  propuesta_enviada: 0.3,
  follow_up: 0.5,
  cliente_ganado: 1.0,
}
