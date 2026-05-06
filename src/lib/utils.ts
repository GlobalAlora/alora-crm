import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ProjectStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

import { formatArgentinaDate, formatArgentinaDateTime } from './timezone'

export function timeAgo(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: es })
  } catch {
    return ''
  }
}

export function timeAgoWithFullDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    const relativeTime = formatDistanceToNow(date, { addSuffix: true, locale: es })
    
    // Formato completo: "Martes, 04/05/2026 a las 14:30"
    const dayName = date.toLocaleDateString('es-AR', { weekday: 'long' })
    const dateStr = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
    const fullDate = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${dateStr} a las ${timeStr}`
    
    return `${relativeTime} · ${fullDate}`
  } catch {
    return ''
  }
}

export function formatDate(dateString: string): string {
  try {
    return formatArgentinaDate(dateString)
  } catch {
    return ''
  }
}

export function formatDateTime(dateString: string): string {
  try {
    return formatArgentinaDateTime(dateString)
  } catch {
    return ''
  }
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '…'
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function hoursSince(dateString: string): number {
  try {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    return Math.floor(diffMs / (1000 * 60 * 60))
  } catch {
    return 0
  }
}

/** Days from today to a future date (negative = past) */
export function getDaysUntil(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(isoDate)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** Project delivery status based on days remaining */
export function getProjectStatus(fechaCierreProyecto: string | null): ProjectStatus | null {
  if (!fechaCierreProyecto) return null
  const days = getDaysUntil(fechaCierreProyecto)
  if (days < 0) return 'atrasado'
  if (days <= 3) return 'proximo_a_vencer'
  return 'en_tiempo'
}

export function midpoint(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return b!
  if (b === null) return a
  return (a + b) / 2
}
