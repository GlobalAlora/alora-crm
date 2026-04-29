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

export type LeadQuality = 'MQL' | 'SQL' | 'no_calificado'

export type ActivityType =
  | 'nota'
  | 'llamada'
  | 'email'
  | 'reunion'
  | 'cambio_estado'
  | 'tarea_completada'
  | 'webhook'

export type LeadFuente =
  | 'formulario'
  | 'referido'
  | 'linkedin'
  | 'instagram'
  | 'whatsapp'
  | 'chatbot'
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
  servicios_interesados: string[]
  servicio_interesado: string | null        // kept for embed backward-compat
  presupuesto_estimado: number | null       // hidden from UI, kept in DB
  estado_pipeline: PipelineStage
  fuente: LeadFuente | null
  valor_propuesta_usd: number | null        // legacy, will use propuestas table
  valor_propuesta_ars: number | null        // legacy, will use propuestas table
  valor_propuesta_moneda: 'USD' | 'ARS'     // legacy
  tipo_cambio_usd_ars: number | null
  kanban_position: number
  notas: string | null
  responsable_id: string | null
  created_by: string
  fecha_ingreso: string
  fecha_contacto: string | null
  fecha_reunion: string | null
  reunion_hora: string | null
  reunion_link: string | null
  fecha_propuesta: string | null
  fecha_followup: string | null
  fecha_cierre: string | null
  form_id: string | null                        // which form generated this lead
  form_data: Record<string, string> | null      // all fields submitted from embed form
  stage_updated_at: string
  last_activity_at: string
  deleted_at: string | null
  created_at: string
  updated_at: string
  // Computed on GET /leads/[id]
  responsable?: Pick<User, 'id' | 'full_name' | 'avatar_url'>
  calidad_lead?: LeadQuality
  dias_sin_respuesta?: number
  propuestas?: Propuesta[]
  stage_history?: StageHistory[]
  // Computed on GET /leads (list)
  propuestas_total_usd?: number
  propuestas_total_ars?: number
  propuestas_count?: number
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
    por_etapa_value: Partial<Record<PipelineStage, number>>
    por_fuente: Record<string, number>
    nuevos_periodo: number
  }
  revenue: {
    ganado_usd: number
    proyectado_usd: number
    ticket_promedio_usd: number
    forecast: { d7: number; d30: number; d90: number }
    pipeline_value: Partial<Record<PipelineStage, number>>
  }
  conversion: {
    tasa: number
    por_etapa: Partial<Record<PipelineStage, number>>
  }
  alertas: {
    sin_respuesta_48h: number
    tareas_vencidas: number
    leads_inactivos: number
  }
  top_responsables: {
    id: string
    full_name: string
    avatar_url: string | null
    activos: number
    ganados: number
    actividades: number
    tasa_conversion: number
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
}

// Pipeline config — single source of truth for labels, colors, order
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
  'Diseño web', 'Mantenimiento web', 'SEO', 'Google Ads', 'Meta Ads',
  'Redes sociales', 'Branding', 'Email marketing', 'Chatbot', 'IA automatización', 'Ecommerce', 'Otro',
]

export const FUENTES: { value: LeadFuente; label: string }[] = [
  { value: 'formulario', label: 'Formulario web' },
  { value: 'referido', label: 'Referido' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'chatbot', label: 'Chatbot' },
  { value: 'otro', label: 'Otro' },
]

// Revenue probability per stage
export const REVENUE_PROBABILITY: Partial<Record<PipelineStage, number>> = {
  propuesta_enviada: 0.3,
  follow_up: 0.5,
  cliente_ganado: 1.0,
}
