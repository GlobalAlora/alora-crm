import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

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

export function midpoint(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return b!
  if (b === null) return a
  return (a + b) / 2
}
