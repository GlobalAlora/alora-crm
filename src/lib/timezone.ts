// Configuración de timezone para Argentina (GMT-3)
export const TIMEZONE = 'America/Argentina/Buenos_Aires'

// Función para obtener fecha/hora actual en timezone de Argentina
export function getArgentinaDate(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }))
}

// Función para convertir a ISO string manteniendo timezone de Argentina
export function toArgentinaISOString(date: Date = new Date()): string {
  const argentinaDate = new Date(date.toLocaleString("en-US", { timeZone: TIMEZONE }))
  // Ajustar el offset para que refleje correctamente el timezone de Argentina
  const offset = argentinaDate.getTimezoneOffset() - 180 // GMT-3 = -180 minutes
  argentinaDate.setMinutes(argentinaDate.getMinutes() - offset)
  return argentinaDate.toISOString()
}

// Función para formatear fecha en timezone de Argentina
export function formatArgentinaDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('es-AR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  })
}

// Función para formatear fecha y hora en timezone de Argentina
export function formatArgentinaDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('es-AR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Función para obtener fecha de inicio del día en Argentina
export function getArgentinaStartOfDay(date: Date = new Date()): Date {
  const argentinaDate = new Date(date.toLocaleString("en-US", { timeZone: TIMEZONE }))
  argentinaDate.setHours(0, 0, 0, 0)
  return argentinaDate
}

// Función para obtener fecha de fin del día en Argentina
export function getArgentinaEndOfDay(date: Date = new Date()): Date {
  const argentinaDate = new Date(date.toLocaleString("en-US", { timeZone: TIMEZONE }))
  argentinaDate.setHours(23, 59, 59, 999)
  return argentinaDate
}
