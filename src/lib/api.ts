import type { Lead, Activity, Task, User, PaginatedResponse, DashboardMetrics, PipelineStage } from '@/types'

const BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  const json = await res.json()
  return json.data ?? json
}

async function requestPaginated<T>(url: string, options?: RequestInit): Promise<PaginatedResponse<T>> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  return res.json()
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export type LeadsFilters = {
  view?: 'kanban' | 'list'
  estado_pipeline?: PipelineStage | PipelineStage[]
  responsable_id?: string
  fuente?: string
  fecha_desde?: string
  fecha_hasta?: string
  buscar?: string
  sort_by?: 'nombre' | 'empresa' | 'valor_propuesta_usd' | 'last_activity_at' | 'created_at'
  sort_order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export const leadsApi = {
  list(filters: LeadsFilters = {}): Promise<PaginatedResponse<Lead>> {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v === undefined || v === '' || v === null) return
      if (Array.isArray(v)) {
        if (v.length > 0) {
          v.forEach((val) => params.append(k, String(val)))
        }
      } else {
        params.set(k, String(v))
      }
    })
    return requestPaginated(`${BASE}/leads?${params}`)
  },

  get(id: string): Promise<Lead> {
    return request(`${BASE}/leads/${id}`)
  },

  create(data: Partial<Lead>): Promise<Lead> {
    return request(`${BASE}/leads`, { method: 'POST', body: JSON.stringify(data) })
  },

  update(id: string, data: Partial<Lead>): Promise<Lead> {
    return request(`${BASE}/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  remove(id: string): Promise<void> {
    return request(`${BASE}/leads/${id}`, { method: 'DELETE' })
  },

  moveStage(id: string, estado_pipeline: PipelineStage): Promise<Lead> {
    return request(`${BASE}/leads/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ estado_pipeline }),
    })
  },

  updatePosition(id: string, kanban_position: number, updated_at: string): Promise<Lead> {
    return request(`${BASE}/leads/${id}/position`, {
      method: 'PATCH',
      body: JSON.stringify({ kanban_position, updated_at }),
    })
  },
}

// ─── Activities ───────────────────────────────────────────────────────────────

export const activitiesApi = {
  list(leadId: string): Promise<PaginatedResponse<Activity>> {
    return requestPaginated(`${BASE}/leads/${leadId}/activities`)
  },

  create(leadId: string, data: { tipo: Activity['tipo']; descripcion: string; metadata?: Record<string, unknown> }): Promise<Activity> {
    return request(`${BASE}/leads/${leadId}/activities`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  update(activityId: string, data: { descripcion: string }): Promise<Activity> {
    return request(`${BASE}/activities/${activityId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  delete(activityId: string): Promise<void> {
    return request(`${BASE}/activities/${activityId}`, {
      method: 'DELETE',
    })
  },
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export type GlobalTask = Task & {
  lead: { id: string; nombre: string; apellido: string | null; estado_pipeline: string } | null
}

export const tasksApi = {
  list(leadId: string): Promise<Task[]> {
    return request(`${BASE}/leads/${leadId}/tasks`)
  },

  listAll(filters?: { asignado_a?: string; completada?: boolean }): Promise<GlobalTask[]> {
    const params = new URLSearchParams()
    if (filters?.asignado_a) params.set('asignado_a', filters.asignado_a)
    if (filters?.completada !== undefined) params.set('completada', String(filters.completada))
    return request(`${BASE}/tasks?${params}`)
  },

  create(leadId: string, data: Partial<Task>): Promise<Task> {
    return request(`${BASE}/leads/${leadId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  complete(taskId: string): Promise<Task> {
    return request(`${BASE}/tasks/${taskId}/complete`, { method: 'PATCH' })
  },

  update(taskId: string, data: Partial<Pick<Task, 'titulo' | 'descripcion' | 'vencimiento'>>): Promise<Task> {
    return request(`${BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  remove(taskId: string): Promise<{ ok: boolean }> {
    return request(`${BASE}/tasks/${taskId}`, { method: 'DELETE' })
  },
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  metrics(params?: { responsable_id?: string; fecha_desde?: string; fecha_hasta?: string }): Promise<DashboardMetrics> {
    const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : ''
    return request(`${BASE}/dashboard${qs ? `?${qs}` : ''}`)
  },
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list(): Promise<User[]> {
    return request(`${BASE}/users`)
  },
}

// ─── Forms ────────────────────────────────────────────────────────────────────

export const formsApi = {
  list(): Promise<FormWithStats[]> {
    return request(`${BASE}/embed/forms`)
  },
  get(id: string): Promise<FormDetail> {
    return request(`${BASE}/embed/forms/${id}`)
  },
  create(body: Partial<FormConfig>): Promise<{ id: string; name: string }> {
    return request(`${BASE}/embed/forms`, { method: 'POST', body: JSON.stringify(body) })
  },
  update(id: string, body: Partial<FormConfig>): Promise<{ id: string }> {
    return request(`${BASE}/embed/forms/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  remove(id: string): Promise<{ ok: boolean }> {
    return request(`${BASE}/embed/forms/${id}`, { method: 'DELETE' })
  },
}

export interface FormConfig {
  id: string
  name: string
  title: string
  subtitle: string
  color: string
  fields: import('@/app/api/embed/config/route').FormField[]
  tags: string[]
  active: boolean
  created_at: string
  updated_at?: string
}

export interface FormWithStats extends FormConfig {
  stats: {
    total_leads: number
    leads_7d: number
    opened: number
    started: number
    submitted: number
    conversion_rate: number
  }
}

export interface FormDetail extends FormConfig {
  analytics: {
    total_leads: number
    leads_7d: number
    revenue_usd: number
    opened: number
    started: number
    submitted: number
    abandoned: number
    conversion_rate: number
    abandonment_rate: number
  }
}
