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
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const tasksApi = {
  list(leadId: string): Promise<Task[]> {
    return request(`${BASE}/leads/${leadId}/tasks`)
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
